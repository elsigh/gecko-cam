"""Owner-labeled moments. Append labels in ground_truth/labels.json; do not hardcode new cases here.

The bug-catch clip is required to stay. Clips from 21:00-21:04 must not be called a feeding session.
The 21:04:00 head peek falls between those clips, so it has no video of its own in this set.
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from clip_cleanup import analyze_video
from event_classifier import DEFAULT_KEEP_SCORE, KEEP_VIDEO

LABELS_PATH = Path(__file__).with_name("ground_truth") / "labels.json"
CLIP_DIR = Path(os.environ.get("GECKO_GROUND_TRUTH_DIR", Path(__file__).with_name("ground_truth") / "clips"))


def load_labels() -> dict:
    return json.loads(LABELS_PATH.read_text())


def _seconds(clock: str) -> int:
    hour, minute, second = (int(part) for part in clock.split(":"))
    return hour * 3600 + minute * 60 + second


def clip_contains(clip: dict, clock: str) -> bool:
    instant = _seconds(clock)
    return _seconds(clip["approx_start"]) <= instant <= _seconds(clip["approx_end"])


class GroundTruthLabelTests(unittest.TestCase):
    def test_owner_correction_is_recorded(self) -> None:
        labels = load_labels()
        moments = {moment["at"]: moment for moment in labels["moments"]}

        peek = moments["21:04:00"]
        catch = moments["21:05:50"]
        self.assertEqual(peek["label"], "head_emergence_moist_hide")
        self.assertIs(peek["must_keep"], False)
        self.assertNotIn("feeding", peek["label"])
        self.assertEqual(catch["label"], "bug_catch")
        self.assertIs(catch["must_keep"], True)

        self.assertFalse(any(clip["assume_feeding"] for clip in labels["clips"]))
        self.assertIsNone(next(clip for clip in labels["clips"] if clip["saved_at"] == "21:02:23")["contains_moment"])
        self.assertIsNone(next(clip for clip in labels["clips"] if clip["saved_at"] == "21:03:38")["contains_moment"])

    def test_head_peek_is_not_inside_these_clips(self) -> None:
        labels = load_labels()
        clips = labels["clips"]
        self.assertFalse(any(clip_contains(clip, "21:04:00") for clip in clips))
        containing = [clip for clip in clips if clip_contains(clip, "21:05:50")]
        self.assertEqual([clip["event_id"] for clip in containing], ["1d7d0e6a-71c2-4d0b-94f9-1fa6211f5717"])

    def test_real_clips_match_owner_labels(self) -> None:
        labels = load_labels()
        paths = _clip_paths(labels["clips"])
        if paths is None:
            self.skipTest(
                "Real clips are not available. Set API_SECRET or put the mp4s in "
                "pi/ground_truth/clips/<event_id>.mp4."
            )

        for clip in labels["clips"]:
            score, reason = analyze_video(str(paths[clip["event_id"]]), feeding_window_active=True)
            with self.subTest(event_id=clip["event_id"]):
                if clip.get("contains_moment") == "bug_catch":
                    self.assertGreaterEqual(score, DEFAULT_KEEP_SCORE, reason)
                    self.assertIn(KEEP_VIDEO, _kept(score))
                if _seconds(clip["approx_end"]) <= _seconds("21:04:00"):
                    self.assertNotIn("Likely feeding at bowl", reason)


def _kept(score: float) -> str:
    return KEEP_VIDEO if score >= DEFAULT_KEEP_SCORE else "discard"


def _clip_paths(clips: list[dict]) -> dict[str, Path] | None:
    local = {
        clip["event_id"]: CLIP_DIR / f"{clip['event_id']}.mp4"
        for clip in clips
    }
    if all(path.exists() for path in local.values()):
        return local

    secret = os.environ.get("API_SECRET", "")
    if not secret:
        return None

    from cleanup_low_value_clips import fetch_events

    wanted = set(local)
    events = {
        str(event.get("id")): event
        for event in fetch_events(os.environ.get("VERCEL_APP_URL", "https://gecko-cam.vercel.app").rstrip("/"))
    }
    missing = wanted - set(events)
    if missing:
        raise AssertionError(f"Events missing from the index: {sorted(missing)}")

    import tempfile

    import requests

    destination = Path(tempfile.mkdtemp(prefix="gecko-ground-truth-"))
    saved: dict[str, Path] = {}
    for event_id in wanted:
        clip_url = events[event_id].get("clipUrl")
        if not clip_url:
            raise AssertionError(f"{event_id} has no clipUrl")
        path = destination / f"{event_id}.mp4"
        with requests.get(str(clip_url), stream=True, timeout=180) as response:
            response.raise_for_status()
            with path.open("wb") as handle:
                for chunk in response.iter_content(1024 * 256):
                    if chunk:
                        handle.write(chunk)
        saved[event_id] = path
    return saved


if __name__ == "__main__":
    unittest.main()
