from __future__ import annotations

import os
from dataclasses import dataclass
from math import hypot
from statistics import median


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
    interest_score: float

    @property
    def keep_video(self) -> bool:
        return self.retention_category == "keep_video"

    def as_payload(self) -> dict[str, str | float | None]:
        return {
            "eventType": self.event_type,
            "behaviorSummary": self.summary,
            "sourceZone": self.source_zone,
            "targetZone": self.target_zone,
            "retentionCategory": self.retention_category,
            "interestScore": round(self.interest_score, 3),
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
DISCARD = "discard"

# 0..1 interest score. Raise GECKO_KEEP_SCORE to keep fewer clips.
# A clip is uploaded only at/above the keep score. Between the summary score
# and the keep score we save a thumbnail without video. Below the summary
# score nothing is uploaded.
# 0.75 keeps a feeding session or a long localized crossing, and drops the
# brief bowl visits and partial crossings that cleared 0.58.
DEFAULT_KEEP_SCORE = 0.75
DEFAULT_SUMMARY_SCORE = 0.60

MAX_USEFUL_COVERAGE = 0.07
MIN_POINT_MOTION = 80
TELEPORT_PX = 90
FEEDING_MIN_DWELL_SECONDS = 3.0
FEEDING_MIN_POINTS = 12
FEEDING_MIN_FRACTION = 0.50
EXCEPTIONAL_MIN_NET_PX = 200


def zone_for_point(x: float, y: float) -> str:
    nx = x / FRAME_WIDTH
    ny = y / FRAME_HEIGHT

    for zone_name, (left, top, right, bottom) in ZONE_RECTS.items():
        if left <= nx <= right and top <= ny <= bottom:
            return zone_name

    return "open"


def keep_score_threshold() -> float:
    return _env_unit("GECKO_KEEP_SCORE", DEFAULT_KEEP_SCORE)


def summary_score_threshold() -> float:
    summary = _env_unit("GECKO_SUMMARY_SCORE", DEFAULT_SUMMARY_SCORE)
    return min(summary, keep_score_threshold())


def upload_plan(retention_category: str | None) -> str:
    if retention_category == KEEP_VIDEO:
        return KEEP_VIDEO
    if retention_category == DISCARD:
        return DISCARD
    return SUMMARY_ONLY


def classify_event(
    points: list[MotionTracePoint],
    *,
    feeding_window_active: bool,
    peak_motion_score: float,
    keep_score: float | None = None,
    summary_score: float | None = None,
) -> EventClassification:
    keep = keep_score_threshold() if keep_score is None else keep_score
    summary = summary_score_threshold() if summary_score is None else summary_score
    if summary > keep:
        summary = keep

    if not points:
        return _result(
            event_type="unknown",
            summary="Motion detected",
            source_zone=None,
            target_zone=None,
            score=0.04,
            wants_video=False,
            keep_score=keep,
            summary_score=summary,
        )

    localized = [
        point
        for point in points
        if point.coverage_fraction <= MAX_USEFUL_COVERAGE and point.motion_score >= MIN_POINT_MOTION
    ]
    lighting_dominated = len(localized) < 8 and (
        len(localized) / len(points) < 0.4 or len(localized) == 0
    )
    if lighting_dominated:
        return _result(
            event_type="unknown",
            summary="Lighting change",
            source_zone=points[0].zone,
            target_zone=points[-1].zone,
            score=0.05,
            wants_video=False,
            keep_score=keep,
            summary_score=summary,
        )

    tracked = _smooth_points(localized)
    features = _features(tracked, peak_motion_score)
    start_hide = _start_hide(tracked)

    feeding = _feeding_score(
        tracked,
        features,
        feeding_window_active=feeding_window_active,
        start_hide=start_hide,
    )
    if feeding is not None:
        return _result(
            event_type="feeding_likely",
            summary="Likely feeding at bowl",
            source_zone=start_hide,
            target_zone="bowl",
            score=feeding,
            wants_video=True,
            keep_score=keep,
            summary_score=summary,
        )

    if _is_emergence(tracked, features, start_hide):
        return _result(
            event_type="emergence",
            summary=f"Emerged from {_zone_label(start_hide or 'hide')}",
            source_zone=start_hide,
            target_zone=features["last_zone"],
            score=_emergence_score(features, feeding_window_active),
            wants_video=True,
            keep_score=keep,
            summary_score=summary,
        )

    if _is_exceptional(features):
        return _result(
            event_type="roaming",
            summary="Sustained movement across the enclosure",
            source_zone=features["first_zone"],
            target_zone=features["last_zone"],
            score=_exceptional_score(features),
            wants_video=True,
            keep_score=keep,
            summary_score=summary,
        )

    if _is_hide_entry(features, "dry_hide"):
        return _result(
            event_type="hide_entry_dry",
            summary="Entered dry hide",
            source_zone=features["first_zone"],
            target_zone="dry_hide",
            score=_hide_entry_score(features),
            wants_video=False,
            keep_score=keep,
            summary_score=summary,
        )

    if _is_hide_entry(features, "rock_hide"):
        return _result(
            event_type="hide_entry_rock",
            summary="Entered rock hide",
            source_zone=features["first_zone"],
            target_zone="rock_hide",
            score=_hide_entry_score(features),
            wants_video=False,
            keep_score=keep,
            summary_score=summary,
        )

    if _is_trivial(features):
        return _result(
            event_type="unknown",
            summary="Small twitch",
            source_zone=features["first_zone"],
            target_zone=features["last_zone"],
            score=0.12,
            wants_video=False,
            keep_score=keep,
            summary_score=summary,
        )

    return _result(
        event_type="roaming",
        summary="Crawling around enclosure",
        source_zone=features["first_zone"],
        target_zone=features["last_zone"],
        score=_routine_score(features),
        wants_video=False,
        keep_score=keep,
        summary_score=summary,
    )


def trace_from_gray_frames(
    frames: list[bytes],
    *,
    width: int,
    height: int,
    fps: float,
    step: int = 1,
    diff_threshold: int = 24,
) -> tuple[list[MotionTracePoint], float]:
    """Build a motion trace from grayscale frames. Returns points and peak score."""
    if width <= 0 or height <= 0 or fps <= 0 or step <= 0:
        return [], 0.0

    points: list[MotionTracePoint] = []
    previous: bytes | None = None
    peak = 0.0
    scale_x = FRAME_WIDTH / width
    scale_y = FRAME_HEIGHT / height
    sample_area = step * step
    score_scale = sample_area * scale_x * scale_y

    for index, frame in enumerate(frames):
        if len(frame) < width * height:
            continue
        if previous is None:
            previous = frame
            continue

        count = 0
        sum_x = 0.0
        sum_y = 0.0
        for y in range(0, height, step):
            row = y * width
            for x in range(0, width, step):
                if abs(frame[row + x] - previous[row + x]) <= diff_threshold:
                    continue
                count += 1
                sum_x += x
                sum_y += y

        previous = frame
        if count == 0:
            continue

        coverage = (count * sample_area) / (width * height)
        motion_score = count * score_scale
        peak = max(peak, motion_score)
        if motion_score < MIN_POINT_MOTION:
            continue

        centroid_x = (sum_x / count) * scale_x
        centroid_y = (sum_y / count) * scale_y
        points.append(
            MotionTracePoint(
                timestamp=index / fps,
                x=centroid_x,
                y=centroid_y,
                motion_score=motion_score,
                coverage_fraction=coverage,
                zone=zone_for_point(centroid_x, centroid_y),
            )
        )

    return points, peak


def _result(
    *,
    event_type: str,
    summary: str,
    source_zone: str | None,
    target_zone: str | None,
    score: float,
    wants_video: bool,
    keep_score: float,
    summary_score: float,
) -> EventClassification:
    bounded = max(0.0, min(1.0, score))
    if wants_video and bounded >= keep_score:
        retention = KEEP_VIDEO
    elif bounded >= summary_score:
        retention = SUMMARY_ONLY
    else:
        retention = DISCARD

    return EventClassification(
        event_type=event_type,
        summary=summary,
        source_zone=source_zone,
        target_zone=target_zone,
        retention_category=retention,
        interest_score=bounded,
    )


def _smooth_points(points: list[MotionTracePoint]) -> list[MotionTracePoint]:
    if len(points) < 3:
        return list(points)

    kept = [points[0]]
    for index in range(1, len(points) - 1):
        current = points[index]
        previous = kept[-1]
        nxt = points[index + 1]
        jump = hypot(current.x - previous.x, current.y - previous.y)
        return_distance = hypot(nxt.x - previous.x, nxt.y - previous.y)
        if jump > TELEPORT_PX and return_distance + 15 < jump:
            continue
        kept.append(current)
    kept.append(points[-1])
    return kept


def _features(points: list[MotionTracePoint], peak_motion_score: float) -> dict[str, float | str | None]:
    path = _travel_distance(points)
    net = hypot(points[-1].x - points[0].x, points[-1].y - points[0].y)
    span = max(0.0, points[-1].timestamp - points[0].timestamp)
    efficiency = net / path if path > 1 else 0.0
    coverages = [point.coverage_fraction for point in points]
    peak = max([peak_motion_score, *(point.motion_score for point in points)])
    return {
        "count": float(len(points)),
        "path": path,
        "net": net,
        "span": span,
        "efficiency": efficiency,
        "median_coverage": float(median(coverages)) if coverages else 1.0,
        "peak": peak,
        "bowl_dwell": _dwell_seconds(points, "bowl"),
        "bowl_points": float(sum(point.zone == "bowl" for point in points)),
        "first_zone": points[0].zone,
        "last_zone": _dominant_zone(points[-4:]),
    }


def _feeding_score(
    points: list[MotionTracePoint],
    features: dict[str, float | str | None],
    *,
    feeding_window_active: bool,
    start_hide: str | None,
) -> float | None:
    bowl_points = int(features["bowl_points"])
    bowl_dwell = float(features["bowl_dwell"])
    count = int(features["count"])
    if count <= 0 or bowl_points < FEEDING_MIN_POINTS:
        return None
    if bowl_dwell < FEEDING_MIN_DWELL_SECONDS:
        return None
    if bowl_points / count < FEEDING_MIN_FRACTION:
        return None

    bowl_coverages = [point.coverage_fraction for point in points if point.zone == "bowl"]
    if bowl_coverages and float(median(bowl_coverages)) > 0.055:
        return None

    # A 3s bowl session during the feeding window clears the default keep
    # score. A longer stay, a trip out of a hide, or a strong peak adds to it.
    # Anything shorter never reaches this function.
    score = 0.66 + min(0.18, max(0.0, bowl_dwell - FEEDING_MIN_DWELL_SECONDS) / 12)
    if bowl_points / count >= 0.70:
        score += 0.04
    if feeding_window_active:
        score += 0.08
    if float(features["peak"]) >= 2500:
        score += 0.04
    if start_hide is not None:
        score += 0.04
    return min(score, 1.0)


def _is_emergence(
    points: list[MotionTracePoint],
    features: dict[str, float | str | None],
    start_hide: str | None,
) -> bool:
    if start_hide is None:
        return False
    if features["last_zone"] == start_hide:
        return False
    if float(features["net"]) < 100 or float(features["efficiency"]) < 0.45:
        return False
    if float(features["span"]) < 1.5 or int(features["count"]) < 8:
        return False
    if float(features["median_coverage"]) > 0.045:
        return False

    outside = [
        point
        for point in points
        if point.zone != start_hide and point.timestamp >= points[0].timestamp + 0.4
    ]
    return len(outside) >= 4


def _emergence_score(features: dict[str, float | str | None], feeding_window_active: bool) -> float:
    net = float(features["net"])
    score = 0.62 + min(0.22, max(0.0, net - 100) / 350)
    if feeding_window_active:
        score += 0.06
    if float(features["efficiency"]) >= 0.55:
        score += 0.04
    return min(score, 1.0)


def _is_exceptional(features: dict[str, float | str | None]) -> bool:
    return (
        float(features["net"]) >= EXCEPTIONAL_MIN_NET_PX
        and float(features["efficiency"]) >= 0.60
        and float(features["span"]) >= 2.0
        and float(features["median_coverage"]) <= 0.04
        and int(features["count"]) >= 12
        and float(features["peak"]) >= 1500
    )


def _exceptional_score(features: dict[str, float | str | None]) -> float:
    net = float(features["net"])
    score = 0.72 + min(0.20, max(0.0, net - EXCEPTIONAL_MIN_NET_PX) / 400)
    if float(features["peak"]) >= 3500:
        score += 0.04
    return min(score, 1.0)


def _is_hide_entry(features: dict[str, float | str | None], zone: str) -> bool:
    return (
        features["last_zone"] == zone
        and features["first_zone"] != zone
        and float(features["net"]) >= 40
        and int(features["count"]) >= 4
    )


def _hide_entry_score(features: dict[str, float | str | None]) -> float:
    return min(0.28, 0.10 + min(0.10, float(features["net"]) / 800))


def _is_trivial(features: dict[str, float | str | None]) -> bool:
    net = float(features["net"])
    path = float(features["path"])
    if net >= 32:
        return False
    if path <= 1:
        return True
    return net / path < 0.4 or path < 80


def _routine_score(features: dict[str, float | str | None]) -> float:
    score = 0.12 + min(0.10, float(features["net"]) / 800)
    if float(features["span"]) >= 3 and float(features["net"]) >= 60:
        score += 0.04
    return min(score, 0.32)


def _start_hide(points: list[MotionTracePoint]) -> str | None:
    if not points:
        return None
    early_cutoff = points[0].timestamp + 1.0
    early = [point for point in points if point.timestamp <= early_cutoff] or points[:8]
    counts: dict[str, int] = {}
    for point in early:
        if point.zone in {"dry_hide", "rock_hide"}:
            counts[point.zone] = counts.get(point.zone, 0) + 1
    if not counts:
        return None
    zone = max(counts, key=counts.get)
    if counts[zone] < 3:
        return None
    return zone


def _dwell_seconds(points: list[MotionTracePoint], zone: str) -> float:
    zone_points = [point for point in points if point.zone == zone]
    if len(zone_points) < 2:
        return 0.0

    total = 0.0
    for previous, point in zip(zone_points, zone_points[1:]):
        delta = point.timestamp - previous.timestamp
        if 0 < delta <= 1.5:
            total += delta
    return total


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


def _zone_label(zone: str) -> str:
    if zone == "dry_hide":
        return "dry hide"
    if zone == "rock_hide":
        return "rock hide"
    if zone == "bowl":
        return "feeding bowl"
    return "hide"


def _env_unit(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value < 0 or value > 1:
        return default
    return value
