import unittest

from clip_timing import choose_thumbnail_time


class ThumbnailTimeTests(unittest.TestCase):
    def test_bowl_trigger_uses_frame_just_before_trigger(self) -> None:
        self.assertEqual(
            choose_thumbnail_time(
                120,
                pre_roll_seconds=60,
                trigger_reason="bowl_activity",
            ),
            59,
        )

    def test_delayed_global_trigger_uses_middle_of_pre_roll(self) -> None:
        self.assertEqual(
            choose_thumbnail_time(
                120,
                pre_roll_seconds=60,
                trigger_reason="global_motion",
            ),
            30,
        )

    def test_short_clip_bounds_thumbnail_to_duration(self) -> None:
        self.assertEqual(
            choose_thumbnail_time(
                10,
                pre_roll_seconds=60,
                trigger_reason="bowl_activity",
            ),
            9.9,
        )


if __name__ == "__main__":
    unittest.main()
