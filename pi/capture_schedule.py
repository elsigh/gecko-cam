from datetime import datetime
from zoneinfo import ZoneInfo


PACIFIC_TIME = ZoneInfo("America/Los_Angeles")


def is_pacific_time_window(
    now: float,
    start_hour: int,
    start_minute: int,
    end_hour: int,
    end_minute: int,
) -> bool:
    local = datetime.fromtimestamp(now, PACIFIC_TIME)
    current = local.hour * 60 + local.minute
    start = start_hour * 60 + start_minute
    end = end_hour * 60 + end_minute

    if start < end:
        return start <= current < end
    if start > end:
        return current >= start or current < end
    return False
