import unittest

from motion_trigger import (
    BOWL_ACTIVITY_TRIGGER,
    GLOBAL_MOTION_TRIGGER,
    choose_trigger_reason,
)


class MotionTriggerTests(unittest.TestCase):
    def test_global_motion_has_precedence(self) -> None:
        self.assertEqual(
            choose_trigger_reason(
                global_motion_frames=2,
                global_motion_frames_required=2,
                bowl_activity_frames=3,
                bowl_activity_frames_required=3,
                feeding_window_active=True,
                bowl_cooldown_remaining=0,
            ),
            GLOBAL_MOTION_TRIGGER,
        )

    def test_bowl_activity_can_trigger_below_global_threshold(self) -> None:
        self.assertEqual(
            choose_trigger_reason(
                global_motion_frames=0,
                global_motion_frames_required=2,
                bowl_activity_frames=3,
                bowl_activity_frames_required=3,
                feeding_window_active=True,
                bowl_cooldown_remaining=0,
            ),
            BOWL_ACTIVITY_TRIGGER,
        )

    def test_bowl_activity_is_limited_to_feeding_window(self) -> None:
        self.assertIsNone(
            choose_trigger_reason(
                global_motion_frames=0,
                global_motion_frames_required=2,
                bowl_activity_frames=3,
                bowl_activity_frames_required=3,
                feeding_window_active=False,
                bowl_cooldown_remaining=0,
            )
        )

    def test_bowl_activity_respects_its_cooldown(self) -> None:
        self.assertIsNone(
            choose_trigger_reason(
                global_motion_frames=0,
                global_motion_frames_required=2,
                bowl_activity_frames=3,
                bowl_activity_frames_required=3,
                feeding_window_active=True,
                bowl_cooldown_remaining=1,
            )
        )


if __name__ == "__main__":
    unittest.main()
