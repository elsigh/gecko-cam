import unittest

from event_classifier import KEEP_VIDEO, REVIEW, SUMMARY_ONLY, MotionTracePoint, classify_event


def point(timestamp: float, x: float, y: float) -> MotionTracePoint:
    return MotionTracePoint(
        timestamp=timestamp,
        x=x,
        y=y,
        motion_score=1800,
        coverage_fraction=0.02,
        zone="open",
    )


class EventClassifierRetentionTests(unittest.TestCase):
    def test_feeding_window_keeps_roaming_video_during_calibration(self) -> None:
        points = [point(i, 220 + i * 10, 150) for i in range(5)]

        classification = classify_event(
            points,
            feeding_window_active=True,
            peak_motion_score=2200,
        )

        self.assertEqual(classification.event_type, "roaming")
        self.assertEqual(classification.retention_category, KEEP_VIDEO)

    def test_roaming_outside_feeding_window_remains_summary_only(self) -> None:
        points = [point(i, 220 + i * 10, 150) for i in range(5)]

        classification = classify_event(
            points,
            feeding_window_active=False,
            peak_motion_score=2200,
        )

        self.assertEqual(classification.retention_category, SUMMARY_ONLY)

    def test_empty_trace_is_kept_only_during_feeding_window(self) -> None:
        in_window = classify_event(
            [], feeding_window_active=True, peak_motion_score=1800
        )
        outside_window = classify_event(
            [], feeding_window_active=False, peak_motion_score=1800
        )

        self.assertEqual(in_window.retention_category, KEEP_VIDEO)
        self.assertEqual(outside_window.retention_category, REVIEW)


if __name__ == "__main__":
    unittest.main()
