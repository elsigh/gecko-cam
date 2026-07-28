from __future__ import annotations


GLOBAL_MOTION_TRIGGER = "global_motion"
BOWL_ACTIVITY_TRIGGER = "bowl_activity"


def choose_trigger_reason(
    *,
    global_motion_frames: int,
    global_motion_frames_required: int,
    bowl_activity_frames: int,
    bowl_activity_frames_required: int,
    feeding_window_active: bool,
    bowl_cooldown_remaining: float,
) -> str | None:
    """Choose the highest-confidence trigger that is currently eligible."""
    if global_motion_frames >= global_motion_frames_required:
        return GLOBAL_MOTION_TRIGGER

    if (
        feeding_window_active
        and bowl_activity_frames >= bowl_activity_frames_required
        and bowl_cooldown_remaining <= 0
    ):
        return BOWL_ACTIVITY_TRIGGER

    return None
