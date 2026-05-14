from __future__ import annotations

from dataclasses import dataclass
from math import hypot


@dataclass(frozen=True)
class MotionTracePoint:
    timestamp: float
    x: float
    y: float
    motion_score: float
    coverage_fraction: float
    zone: str


@dataclass(frozen=True)
class EventClassification:
    event_type: str
    summary: str
    source_zone: str | None
    target_zone: str | None
    retention_category: str

    @property
    def keep_video(self) -> bool:
        return self.retention_category == "keep_video"

    def as_payload(self) -> dict[str, str | None]:
        return {
            "eventType": self.event_type,
            "behaviorSummary": self.summary,
            "sourceZone": self.source_zone,
            "targetZone": self.target_zone,
            "retentionCategory": self.retention_category,
        }


FRAME_WIDTH = 320
FRAME_HEIGHT = 240

ZONE_RECTS = {
    "bowl": (0.27, 0.63, 0.50, 0.96),
    "dry_hide": (0.47, 0.12, 0.75, 0.38),
    "rock_hide": (0.20, 0.42, 0.48, 0.72),
}

KEEP_VIDEO = "keep_video"
SUMMARY_ONLY = "summary_only"
REVIEW = "review"


def zone_for_point(x: float, y: float) -> str:
    nx = x / FRAME_WIDTH
    ny = y / FRAME_HEIGHT

    for zone_name, (left, top, right, bottom) in ZONE_RECTS.items():
        if left <= nx <= right and top <= ny <= bottom:
            return zone_name

    return "open"


def classify_event(
    points: list[MotionTracePoint],
    *,
    feeding_window_active: bool,
    peak_motion_score: float,
) -> EventClassification:
    if not points:
      return EventClassification(
          event_type="unknown",
          summary="Motion detected",
          source_zone=None,
          target_zone=None,
          retention_category=REVIEW,
      )

    first_zone = points[0].zone
    last_zone = _dominant_zone(points[-4:])
    non_open_points = [point for point in points if point.zone != "open"]
    start_hide_zone = next(
        (point.zone for point in points[:8] if point.zone in {"dry_hide", "rock_hide"}),
        None,
    )
    distance_travelled = _travel_distance(points)
    bowl_points = [point for point in points if point.zone == "bowl"]
    left_hide_points = [point for point in points if point.zone == "rock_hide"]
    dry_hide_points = [point for point in points if point.zone == "dry_hide"]

    if _is_likely_feeding(
        bowl_points=bowl_points,
        feeding_window_active=feeding_window_active,
        peak_motion_score=peak_motion_score,
        start_hide_zone=start_hide_zone,
    ):
        return EventClassification(
            event_type="feeding_likely",
            summary="Likely feeding at bowl",
            source_zone=start_hide_zone,
            target_zone="bowl",
            retention_category=KEEP_VIDEO,
        )

    if (
        start_hide_zone is not None
        and last_zone != start_hide_zone
        and distance_travelled >= 55
        and len(non_open_points) >= 3
    ):
        return EventClassification(
            event_type="emergence",
            summary=f"Emerged from {_zone_label(start_hide_zone)}",
            source_zone=start_hide_zone,
            target_zone=last_zone,
            retention_category=KEEP_VIDEO,
        )

    if (
        last_zone == "dry_hide"
        and first_zone != "dry_hide"
        and len(dry_hide_points) >= 2
        and distance_travelled >= 40
    ):
        return EventClassification(
            event_type="hide_entry_dry",
            summary="Entered dry hide",
            source_zone=first_zone,
            target_zone="dry_hide",
            retention_category=SUMMARY_ONLY,
        )

    if (
        last_zone == "rock_hide"
        and first_zone != "rock_hide"
        and len(left_hide_points) >= 2
        and distance_travelled >= 40
    ):
        return EventClassification(
            event_type="hide_entry_rock",
            summary="Entered rock hide",
            source_zone=first_zone,
            target_zone="rock_hide",
            retention_category=SUMMARY_ONLY,
        )

    if distance_travelled >= 45 or len(points) >= 5:
        return EventClassification(
            event_type="roaming",
            summary="Crawling around enclosure",
            source_zone=first_zone,
            target_zone=last_zone,
            retention_category=SUMMARY_ONLY,
        )

    return EventClassification(
        event_type="unknown",
        summary="Motion detected",
        source_zone=first_zone,
        target_zone=last_zone,
        retention_category=REVIEW,
    )


def _dominant_zone(points: list[MotionTracePoint]) -> str:
    counts: dict[str, int] = {}
    for point in points:
        counts[point.zone] = counts.get(point.zone, 0) + 1
    return max(counts, key=counts.get)


def _travel_distance(points: list[MotionTracePoint]) -> float:
    total = 0.0
    previous = points[0]

    for point in points[1:]:
        total += hypot(point.x - previous.x, point.y - previous.y)
        previous = point

    return total


def _is_likely_feeding(
    *,
    bowl_points: list[MotionTracePoint],
    feeding_window_active: bool,
    peak_motion_score: float,
    start_hide_zone: str | None,
) -> bool:
    if len(bowl_points) < 2:
        return False

    if feeding_window_active and len(bowl_points) >= 2:
        return True

    if peak_motion_score >= 3200 and len(bowl_points) >= 3:
        return True

    return start_hide_zone is not None and len(bowl_points) >= 4


def _zone_label(zone: str) -> str:
    if zone == "dry_hide":
        return "dry hide"
    if zone == "rock_hide":
        return "rock hide"
    if zone == "bowl":
        return "feeding bowl"
    return "hide"
