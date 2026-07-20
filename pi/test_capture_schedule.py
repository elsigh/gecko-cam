import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from capture_schedule import is_pacific_time_window


PACIFIC_TIME = ZoneInfo("America/Los_Angeles")


def timestamp(hour: int, minute: int) -> float:
    return datetime(2026, 7, 20, hour, minute, tzinfo=PACIFIC_TIME).timestamp()


class CaptureScheduleTests(unittest.TestCase):
    def test_feeding_window_includes_8pm_through_1059pm(self) -> None:
        self.assertTrue(is_pacific_time_window(timestamp(20, 0), 20, 0, 23, 0))
        self.assertTrue(is_pacific_time_window(timestamp(22, 59), 20, 0, 23, 0))

    def test_feeding_window_excludes_11pm(self) -> None:
        self.assertFalse(is_pacific_time_window(timestamp(23, 0), 20, 0, 23, 0))

    def test_wrapping_disabled_window(self) -> None:
        self.assertTrue(is_pacific_time_window(timestamp(23, 0), 23, 0, 20, 0))
        self.assertTrue(is_pacific_time_window(timestamp(8, 0), 23, 0, 20, 0))
        self.assertFalse(is_pacific_time_window(timestamp(20, 0), 23, 0, 20, 0))


if __name__ == "__main__":
    unittest.main()
