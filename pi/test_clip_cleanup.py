import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from cleanup_low_value_clips import main
from clip_cleanup import decide_event, format_report, metadata_interest


def event(**overrides):
    base = {
        "id": "clip-1",
        "timestamp": 1_779_000_000_000,
        "eventType": "roaming",
        "motionScore": 1500,
        "clipUrl": "https://example.com/clip.mp4",
        "thumbnailUrl": "https://example.com/thumb.jpg",
    }
    base.update(overrides)
    return base


class ClipCleanupTests(unittest.TestCase):
    def test_weak_feeding_label_is_deleted(self) -> None:
        score, reason = metadata_interest(event(
            id="weak-feed",
            eventType="feeding_likely",
            motionScore=700,
            triggerReason="bowl_activity",
            triggerBowlMotionPixels=6,
        ))
        decision = decide_event(
            event(
                id="weak-feed",
                eventType="feeding_likely",
                motionScore=700,
                triggerReason="bowl_activity",
                triggerBowlMotionPixels=6,
            ),
            threshold=0.58,
        )

        self.assertLess(score, 0.58)
        self.assertIn("weak feeding label", reason)
        self.assertEqual(decision.action, "delete")

    def test_substantial_feeding_and_emergence_are_kept(self) -> None:
        feeding = decide_event(
            event(
                id="real-feed",
                eventType="feeding_likely",
                motionScore=2400,
                triggerBowlMotionPixels=180,
            ),
            threshold=0.58,
        )
        emergence = decide_event(
            event(id="emerge", eventType="emergence", motionScore=2800),
            threshold=0.58,
        )

        self.assertEqual(feeding.action, "keep")
        self.assertGreaterEqual(feeding.score, 0.58)
        self.assertEqual(emergence.action, "keep")

    def test_favorites_and_useful_reviews_are_protected(self) -> None:
        favorite = decide_event(
            event(id="fav", eventType="unknown", motionScore=100, favorite=True),
            threshold=0.58,
        )
        useful = decide_event(
            event(id="useful", eventType="unknown", motionScore=100, reviewVerdict="useful"),
            threshold=0.58,
        )

        self.assertEqual(favorite.action, "keep")
        self.assertEqual(favorite.reason, "favorite")
        self.assertEqual(useful.action, "keep")
        self.assertEqual(useful.reason, "marked useful")

    def test_threshold_is_the_only_keep_cutoff(self) -> None:
        clip = event(id="border", eventType="roaming", motionScore=6000)
        loose = decide_event(clip, threshold=0.5)
        strict = decide_event(clip, threshold=0.9)

        self.assertEqual(loose.action, "keep")
        self.assertEqual(strict.action, "delete")

    def test_stored_interest_score_is_reused(self) -> None:
        decision = decide_event(
            event(id="scored", eventType="unknown", motionScore=100, interestScore=0.91),
            threshold=0.58,
        )

        self.assertEqual(decision.action, "keep")
        self.assertEqual(decision.reason, "stored interest score")

    def test_dry_run_lists_deletes_and_does_not_apply_them(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "events.json"
            path.write_text(json.dumps([
                event(id="junk", eventType="unknown", motionScore=200),
                event(id="keeper", eventType="feeding_likely", motionScore=3000, triggerBowlMotionPixels=200),
            ]))
            output = StringIO()
            with redirect_stdout(output):
                code = main(["--events-file", str(path), "--threshold", "0.58"])

        text = output.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("dry run", text)
        self.assertIn("Nothing was deleted", text)
        self.assertIn("junk", text)
        self.assertIn("DELETE", text)
        self.assertIn("keeper", text)
        self.assertNotIn("Deleted ", text)

    def test_report_counts_match_the_decisions(self) -> None:
        decisions = [
            decide_event(event(id="a", eventType="unknown", motionScore=100), threshold=0.58),
            decide_event(event(id="b", favorite=True, motionScore=100), threshold=0.58),
        ]
        text = format_report(decisions, threshold=0.58, apply=False)
        self.assertIn("would delete: 1", text)
        self.assertIn("keep: 1", text)
        self.assertIn("protected (favorites and useful reviews): 1", text)


if __name__ == "__main__":
    unittest.main()
