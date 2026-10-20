import os
import unittest
from contextlib import contextmanager

from event_classifier import (
    DEFAULT_KEEP_SCORE,
    DISCARD,
    KEEP_VIDEO,
    SUMMARY_ONLY,
    MotionTracePoint,
    classify_event,
    trace_from_gray_frames,
    zone_for_point,
)


def point(
    timestamp: float,
    x: float,
    y: float,
    *,
    motion_score: float = 1800,
    coverage_fraction: float = 0.02,
    zone: str = "open",
) -> MotionTracePoint:
    return MotionTracePoint(
        timestamp=timestamp,
        x=x,
        y=y,
        motion_score=motion_score,
        coverage_fraction=coverage_fraction,
        zone=zone,
    )


def series(
    start: tuple[float, float],
    end: tuple[float, float],
    count: int,
    *,
    t0: float = 0,
    step: float = 0.1,
    motion_score: float = 1800,
    coverage_fraction: float = 0.02,
) -> list[MotionTracePoint]:
    points = []
    for index in range(count):
        blend = index / max(count - 1, 1)
        x = start[0] + (end[0] - start[0]) * blend
        y = start[1] + (end[1] - start[1]) * blend
        points.append(
            point(
                t0 + index * step,
                x,
                y,
                motion_score=motion_score,
                coverage_fraction=coverage_fraction,
                zone=zone_for_point(x, y),
            )
        )
    return points


@contextmanager
def env(**values: str):
    previous = {key: os.environ.get(key) for key in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, old in previous.items():
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old


class EventClassifierTests(unittest.TestCase):
    def test_feeding_window_no_longer_keeps_a_short_roam(self) -> None:
        points = [point(i, 220 + i * 10, 150) for i in range(5)]

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=2200,
        )

        self.assertNotEqual(classification.retention_category, KEEP_VIDEO)
        self.assertLess(classification.interest_score, DEFAULT_KEEP_SCORE)
        self.assertEqual(classification.retention_category, DISCARD)

    def test_two_bowl_points_are_not_feeding(self) -> None:
        points = [
            point(0, 120, 190, zone="bowl"),
            point(0.2, 124, 194, zone="bowl"),
        ]

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=2200,
        )

        self.assertNotEqual(classification.event_type, "feeding_likely")
        self.assertEqual(classification.retention_category, DISCARD)

    def test_sustained_bowl_activity_keeps_a_feeding_clip(self) -> None:
        points = series((110, 180), (140, 200), 36, motion_score=1600)

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=1600,
        )

        self.assertEqual(classification.event_type, "feeding_likely")
        self.assertEqual(classification.retention_category, KEEP_VIDEO)
        self.assertGreaterEqual(classification.interest_score, DEFAULT_KEEP_SCORE)
        self.assertEqual(classification.as_payload()["interestScore"], round(classification.interest_score, 3))

    def test_brief_bowl_visit_is_not_a_feeding_session(self) -> None:
        points = series((110, 180), (140, 200), 21, motion_score=1600)

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=1600,
        )

        self.assertNotEqual(classification.event_type, "feeding_likely")
        self.assertEqual(classification.retention_category, DISCARD)
        self.assertLess(classification.interest_score, 0.40)

    def test_lighting_change_is_discarded_even_with_a_high_score(self) -> None:
        points = [
            point(i * 0.1, 160, 120, motion_score=8000, coverage_fraction=0.2)
            for i in range(12)
        ]

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=8000,
        )

        self.assertEqual(classification.summary, "Lighting change")
        self.assertEqual(classification.retention_category, DISCARD)
        self.assertLess(classification.interest_score, 0.2)

    def test_in_place_twitch_is_discarded(self) -> None:
        points = []
        for index in range(15):
            offset = 8 if index % 2 else 0
            points.append(point(index * 0.1, 180 + offset, 120 + offset, motion_score=700))

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=700,
        )

        self.assertEqual(classification.summary, "Small twitch")
        self.assertEqual(classification.retention_category, DISCARD)

    def test_emergence_across_the_enclosure_is_kept(self) -> None:
        points = series((100, 140), (100, 140), 10)
        points.extend(series((110, 130), (260, 70), 20, t0=1.0))

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=2400,
        )

        self.assertEqual(classification.event_type, "emergence")
        self.assertEqual(classification.retention_category, KEEP_VIDEO)
        self.assertEqual(classification.source_zone, "rock_hide")

    def test_long_crossing_is_kept_as_exceptional_roaming(self) -> None:
        points = series((30, 20), (280, 20), 24)

        classification = classify_event(
            points,
            feeding_window_active=False,
            peak_motion_score=2200,
        )

        self.assertEqual(classification.event_type, "roaming")
        self.assertEqual(classification.summary, "Sustained movement across the enclosure")
        self.assertEqual(classification.retention_category, KEEP_VIDEO)
        self.assertGreaterEqual(classification.interest_score, DEFAULT_KEEP_SCORE)

    def test_partial_crossing_is_discarded(self) -> None:
        points = series((40, 20), (180, 20), 12)

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=800,
        )

        self.assertNotEqual(classification.retention_category, KEEP_VIDEO)
        self.assertEqual(classification.retention_category, DISCARD)
        self.assertLess(classification.interest_score, 0.40)

    def test_short_hide_entry_does_not_keep_video(self) -> None:
        points = series((200, 140), (200, 60), 10)

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=1800,
        )

        self.assertEqual(classification.event_type, "hide_entry_dry")
        self.assertEqual(classification.retention_category, DISCARD)
        self.assertLess(classification.interest_score, 0.40)

    def test_empty_trace_is_discarded_inside_the_feeding_window(self) -> None:
        classification = classify_event(
            [],
            feeding_window_active=True,
            peak_motion_score=1800,
        )

        self.assertEqual(classification.retention_category, DISCARD)

    def test_keep_score_env_is_the_upload_cutoff(self) -> None:
        points = series((110, 180), (140, 200), 36, motion_score=1600)

        with env(GECKO_KEEP_SCORE="0.95"):
            classification = classify_event(
                points,
                feeding_window_active=True,
                peak_motion_score=1600,
            )

        self.assertGreaterEqual(classification.interest_score, DEFAULT_KEEP_SCORE)
        self.assertLess(classification.interest_score, 0.95)
        self.assertEqual(classification.retention_category, SUMMARY_ONLY)

    def test_frame_diff_keeps_sustained_bowl_motion_and_drops_a_flash(self) -> None:
        width, height = 80, 60
        dark = bytes([10]) * (width * height)
        frames = [dark]
        for index in range(36):
            frame = bytearray(dark)
            origin_x = 28 + (index % 3)
            origin_y = 46
            for y in range(origin_y, origin_y + 8):
                for x in range(origin_x, origin_x + 8):
                    frame[y * width + x] = 220
            frames.append(bytes(frame))

        points, peak = trace_from_gray_frames(
            frames, width=width, height=height, fps=8, step=1
        )
        feeding = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=peak,
        )
        self.assertEqual(feeding.event_type, "feeding_likely")
        self.assertEqual(feeding.retention_category, KEEP_VIDEO)

        flash = [dark, bytes([240]) * (width * height), dark, bytes([240]) * (width * height)]
        flash_points, flash_peak = trace_from_gray_frames(
            flash, width=width, height=height, fps=4, step=1
        )
        lighting = classify_event(
            flash_points,
            feeding_window_active=True,
            peak_motion_score=flash_peak,
        )
        self.assertEqual(lighting.retention_category, DISCARD)


if __name__ == "__main__":
    unittest.main()
