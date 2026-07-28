from __future__ import annotations


def choose_thumbnail_time(
    duration: float,
    *,
    pre_roll_seconds: float = 0,
    trigger_reason: str | None = None,
) -> float:
    """Pick a frame near the activity instead of the start of a long pre-roll."""
    if duration <= 0:
        return 0
    if pre_roll_seconds > 0:
        if trigger_reason == "bowl_activity":
            preferred_time = pre_roll_seconds - 1
        else:
            preferred_time = pre_roll_seconds * 0.5
        return max(0, min(preferred_time, duration - 0.1))
    return max(0, min(duration * 0.2, 2.0, duration - 0.1))
