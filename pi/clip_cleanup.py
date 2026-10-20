"""Re-score stored gecko clips and decide which backlog events to delete.

The live recorder now writes ``interestScore``. Older events do not have it, so
this falls back to the metadata the uploader did save (label, motion score,
bowl pixels, trigger). ``--analyze`` rebuilds a trace from the video itself and
runs the same classifier as the Pi.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from capture_schedule import is_pacific_time_window
from event_classifier import classify_event, trace_from_gray_frames

PACIFIC_TIME = ZoneInfo("America/Los_Angeles")
# Keep this aligned with FEEDING_WINDOW_* in gecko_cam.py.
FEEDING_WINDOW = (20, 0, 23, 0)


@dataclass(frozen=True)
class CleanupDecision:
    event_id: str
    action: str
    score: float
    reason: str
    event_type: str
    timestamp: int
    has_clip: bool
    protected: bool

    @property
    def delete(self) -> bool:
        return self.action == "delete"


def metadata_interest(event: dict) -> tuple[float, str]:
    stored = event.get("interestScore")
    if stored is not None:
        try:
            return max(0.0, min(1.0, float(stored))), "stored interest score"
        except (TypeError, ValueError):
            pass

    event_type = str(event.get("eventType") or "unknown")
    motion = _number(event.get("motionScore"))
    bowl = _number(event.get("triggerBowlMotionPixels"))
    trigger = str(event.get("triggerReason") or "")
    score = 0.12
    reasons = [event_type]

    if event_type == "feeding_likely":
        score += 0.2
    elif event_type == "emergence":
        score += 0.28
    elif event_type in {"roaming", "hide_entry_dry", "hide_entry_rock"}:
        score += 0.04

    score += min(0.4, bowl / 350)
    if bowl >= 40:
        reasons.append(f"bowl {int(bowl)}px")

    score += min(0.45, max(0.0, motion - 1000) / 8000)
    if motion >= 3500:
        reasons.append(f"motion {int(motion)}")

    # The previous classifier called any two bowl points "feeding".
    if event_type == "feeding_likely" and bowl < 25 and motion < 1600:
        score = min(score, 0.3)
        reasons.append("weak feeding label")

    if trigger == "bowl_activity" and bowl < 15 and motion < 1200:
        score = min(score, 0.28)
        reasons.append("bowl flicker trigger")

    return round(min(score, 1.0), 3), ", ".join(reasons)


def decide_event(
    event: dict,
    *,
    threshold: float,
    include_protected: bool = False,
    analyzed_score: float | None = None,
    analyzed_reason: str | None = None,
) -> CleanupDecision:
    favorite = bool(event.get("favorite"))
    reviewed_useful = event.get("reviewVerdict") == "useful"
    protected = favorite or reviewed_useful
    event_type = str(event.get("eventType") or "unknown")
    timestamp = int(_number(event.get("timestamp")))

    if protected and not include_protected:
        reason = "favorite" if favorite else "marked useful"
        return CleanupDecision(
            event_id=str(event.get("id") or ""),
            action="keep",
            score=1.0,
            reason=reason,
            event_type=event_type,
            timestamp=timestamp,
            has_clip=bool(event.get("clipUrl")),
            protected=True,
        )

    if analyzed_score is not None:
        score = max(0.0, min(1.0, analyzed_score))
        reason = analyzed_reason or "re-scored from video"
    else:
        score, reason = metadata_interest(event)

    return CleanupDecision(
        event_id=str(event.get("id") or ""),
        action="keep" if score >= threshold else "delete",
        score=round(score, 3),
        reason=reason,
        event_type=event_type,
        timestamp=timestamp,
        has_clip=bool(event.get("clipUrl")),
        protected=protected,
    )


def event_in_feeding_window(timestamp_ms: float) -> bool:
    if timestamp_ms <= 0:
        return False
    return is_pacific_time_window(timestamp_ms / 1000, *FEEDING_WINDOW)


def analyze_video(path: str, *, feeding_window_active: bool) -> tuple[float, str]:
    frames = ffmpeg_gray_frames(path)
    points, peak = trace_from_gray_frames(frames, width=160, height=120, fps=2, step=2)
    classification = classify_event(
        points,
        feeding_window_active=feeding_window_active,
        peak_motion_score=peak,
    )
    return (
        classification.interest_score,
        f"video {classification.event_type}: {classification.summary}",
    )


def ffmpeg_gray_frames(path: str, *, width: int = 160, height: int = 120, fps: int = 2) -> list[bytes]:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            path,
            "-vf",
            f"fps={fps},scale={width}:{height}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-",
        ],
        check=False,
        capture_output=True,
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode(errors="replace")[:400]
        raise RuntimeError(detail or f"ffmpeg exited {proc.returncode}")

    frame_size = width * height
    data = proc.stdout
    return [
        data[index:index + frame_size]
        for index in range(0, len(data) - frame_size + 1, frame_size)
    ]


def load_events(path: str) -> list[dict]:
    payload = json.loads(Path(path).read_text())
    if isinstance(payload, dict):
        events = payload.get("events", [])
    else:
        events = payload
    if not isinstance(events, list):
        raise ValueError("events file must be a list or an object with an events list")
    return [event for event in events if isinstance(event, dict)]


def format_report(decisions: list[CleanupDecision], *, threshold: float, apply: bool) -> str:
    deletes = [decision for decision in decisions if decision.delete]
    keeps = [decision for decision in decisions if not decision.delete]
    protected = [decision for decision in decisions if decision.protected]
    mode = "APPLY" if apply else "dry run"
    lines = [
        f"Gecko Cam clip cleanup ({mode})",
        f"threshold: {threshold:.2f}",
        f"events: {len(decisions)}",
        f"would delete: {len(deletes)}" if not apply else f"deleting: {len(deletes)}",
        f"keep: {len(keeps)}",
        f"protected (favorites and useful reviews): {len(protected)}",
        "",
        "action  score  when                type             id                                    reason",
    ]

    ordered = sorted(decisions, key=lambda decision: (decision.action != "delete", decision.score))
    for decision in ordered:
        when = _format_timestamp(decision.timestamp)
        lines.append(
            f"{decision.action.upper():6}  {decision.score:5.2f}  {when:18}  "
            f"{decision.event_type:16} {decision.event_id:36}  {decision.reason}"
        )

    lines.append("")
    if apply:
        lines.append("Apply mode deletes the DELETE rows through the events API.")
    else:
        lines.append("Dry run only. Nothing was deleted.")
        lines.append("Review the list, then re-run with --apply to delete the DELETE rows.")
        lines.append("Favorites and clips marked useful are kept unless you pass --include-protected.")
    return "\n".join(lines)


def _format_timestamp(timestamp_ms: int) -> str:
    if timestamp_ms <= 0:
        return "-"
    when = datetime.fromtimestamp(timestamp_ms / 1000, PACIFIC_TIME)
    return when.strftime("%Y-%m-%d %H:%M")


def _number(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
