#!/usr/bin/env python3
"""
gecko_cam.py — Main Pi daemon for Gecko Cam.

Runs picamera2 with dual outputs:
  - main (1280x720) → FFmpeg → HLS segments in /tmp/hls/
  - lores (320x240, YUV420) → OpenCV MOG2 motion detection

On motion: flushes CircularOutput ring buffer (10s pre) then keeps recording
while motion continues, up to MAX_CLIP_SECONDS. Clip ends after POST_MOTION_HOLD
seconds of inactivity.

Filters out heat-lamp thermostat false positives via two guards:
  1. Brightness-delta: skips any frame where mean Y channel deviates from
     its rolling EMA by >5 (0-255 scale) — catches lamp on/off transitions.
  2. Coverage fraction: skips any frame where >12% of pixels are flagged as
     foreground — a global light change hits the whole frame; gecko movement is local.
  Requires sustained motion for 5 consecutive frames (~0.17s) before triggering.
"""

import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

import numpy as np

import cv2
from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import CircularOutput, FfmpegOutput

import requests
from upload_event import upload_event

# ── Configuration ──────────────────────────────────────────────────────────────
HLS_DIR = Path("/tmp/hls")
CLIPS_DIR = Path("/tmp/clips")
HLS_SEGMENT_TIME = 2         # seconds per HLS segment
HLS_LIST_SIZE = 10           # segments kept in playlist
MOTION_THRESHOLD = 2000      # revert closer to the prior tuning to avoid light-change captures
COOLDOWN_SECONDS = 10        # restore a less aggressive gap between clips
WARMUP_FRAMES = 60           # frames to feed MOG2 before arming motion detection
POST_MOTION_HOLD = 8         # restore the earlier tail length after motion stops
MAX_CLIP_SECONDS = 35        # longer than before, but still bounded
RING_BUFFER_SECONDS = 10     # seconds of pre-motion buffer
FPS = 30
POLL_INTERVAL = 0.1          # motion detection poll interval (seconds)

# Reduce false positives from lighting (heat-lamp thermostat cycling at 90°F)
SUSTAINED_MOTION_FRAMES = 5   # require motion for N consecutive frames (~0.17s)
# If total motion pixels exceed this fraction of the frame it's almost certainly
# a global lighting change (lamp on/off), not the gecko.
MAX_COVERAGE_FRACTION = 0.12  # reject frame if >12% of pixels are "motion"
# If mean frame brightness (Y channel, 0-255) changes by more than this between
# the current frame and the rolling average, skip — it's a lighting transition.
BRIGHTNESS_DELTA_THRESHOLD = 5
# Large brightness jump (IR mode switch or dramatic lighting change) — reset
# the background model and snap the EMA rather than waiting for slow convergence.
BRIGHTNESS_MODE_SWITCH_THRESHOLD = 20
# If every frame has been filtered out for this long (e.g. stuck in IR transition),
# auto-reset the background model so detection recovers without a manual restart.
FILTER_STALL_RESET_SECONDS = 300  # 5 minutes
# Log a warning at most this often when filters are continuously blocking.
FILTER_STALL_WARN_INTERVAL = 60   # 1 minute
MOTION_SUMMARY_INTERVAL_SECONDS = 60
NEAR_THRESHOLD_RATIO = 0.6

LORES_W, LORES_H = 320, 240
FRAME_PIXELS = LORES_W * LORES_H

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("gecko_cam")
remote_log_cooldowns: dict[str, float] = {}


def _is_armed() -> bool:
    """Check with Vercel whether motion capture is currently armed."""
    vercel_url = os.environ.get("VERCEL_APP_URL", "").rstrip("/")
    if not vercel_url:
        return True  # no URL configured, assume armed
    try:
        resp = requests.get(f"{vercel_url}/api/armed", timeout=5)
        return resp.json().get("armed", True)
    except Exception as exc:
        log.warning("Could not reach /api/armed (%s) — assuming armed.", exc)
        return True


def _log_remote_motion(kind: str, min_interval: float = 30.0, **payload) -> None:
    """Ship rate-limited motion decisions to Vercel logs for tuning."""
    vercel_url = os.environ.get("VERCEL_APP_URL", "").rstrip("/")
    api_secret = os.environ.get("API_SECRET", "")
    if not vercel_url or not api_secret:
        return

    now = time.time()
    cooldown_key = f"{kind}:{payload.get('reason', '')}"
    if now - remote_log_cooldowns.get(cooldown_key, 0.0) < min_interval:
        return
    remote_log_cooldowns[cooldown_key] = now

    body = {
        "kind": kind,
        "timestamp": int(now * 1000),
        **payload,
    }
    try:
        requests.post(
            f"{vercel_url}/api/motion-log",
            headers={
                "x-api-secret": api_secret,
                "Content-Type": "application/json",
            },
            json=body,
            timeout=5,
        ).raise_for_status()
    except Exception as exc:
        log.debug("Could not post motion log (%s): %s", kind, exc)


def _empty_motion_summary() -> dict[str, float | int]:
    return {
        "frames": 0,
        "brightnessBlocks": 0,
        "coverageBlocks": 0,
        "nearThresholdFrames": 0,
        "aboveThresholdFrames": 0,
        "capturesStarted": 0,
        "cooldownSkips": 0,
        "snoozedSkips": 0,
        "maxMotionScore": 0.0,
        "maxBrightnessDelta": 0.0,
        "maxCoverageFraction": 0.0,
    }


def ensure_dirs() -> None:
    HLS_DIR.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def run() -> None:
    ensure_dirs()

    tuning = Picamera2.load_tuning_file("imx708_wide_noir.json")
    picam2 = Picamera2(tuning=tuning)
    config = picam2.create_video_configuration(
        main={"size": (1280, 720), "format": "RGB888"},
        lores={"size": (320, 240), "format": "YUV420"},
        controls={"FrameRate": FPS},
    )
    picam2.configure(config)

    encoder = H264Encoder(bitrate=4_000_000)

    hls_output = FfmpegOutput(
        f"-f hls "
        f"-hls_time {HLS_SEGMENT_TIME} "
        f"-hls_list_size {HLS_LIST_SIZE} "
        f"-hls_flags delete_segments+append_list "
        f"{HLS_DIR}/stream.m3u8"
    )
    circular = CircularOutput(buffersize=RING_BUFFER_SECONDS * FPS)

    picam2.start_recording(encoder, [hls_output, circular])
    log.info("Recording started. HLS → %s", HLS_DIR / "stream.m3u8")

    bg_sub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50)
    motion_cooldown = 0.0
    capturing = False
    capture_start_time = 0.0
    last_motion_during_capture = 0.0
    clip_upload_path: str | None = None
    capture_motion_score = 0.0
    capture_peak_motion_score = 0.0
    warmup_remaining = WARMUP_FRAMES
    consecutive_high_motion = 0
    rolling_brightness: float | None = None  # EMA of mean Y channel
    last_frame_passed_filters = time.time()  # tracks when a frame last cleared all filters
    last_stall_warn = 0.0                    # rate-limits stall warning logs
    motion_summary_started = time.time()
    motion_summary = _empty_motion_summary()

    def flush_motion_summary(force: bool = False) -> None:
        nonlocal motion_summary_started, motion_summary

        now = time.time()
        elapsed = now - motion_summary_started
        if not force and elapsed < MOTION_SUMMARY_INTERVAL_SECONDS:
            return

        if (
            motion_summary["frames"] == 0
            and motion_summary["brightnessBlocks"] == 0
            and motion_summary["coverageBlocks"] == 0
            and motion_summary["nearThresholdFrames"] == 0
            and motion_summary["aboveThresholdFrames"] == 0
            and motion_summary["capturesStarted"] == 0
            and motion_summary["cooldownSkips"] == 0
            and motion_summary["snoozedSkips"] == 0
        ):
            motion_summary_started = now
            return

        _log_remote_motion(
            "motion_summary",
            min_interval=0,
            windowSeconds=round(elapsed, 1),
            **motion_summary,
        )
        motion_summary_started = now
        motion_summary = _empty_motion_summary()

    def handle_signal(signum, frame):
        log.info("Signal %s received — stopping.", signum)
        picam2.stop_recording()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        while True:
            now = time.time()

            # ── End active capture if idle or at max duration ──────────────────
            if capturing:
                elapsed = now - capture_start_time
                idle = now - last_motion_during_capture
                if elapsed >= MAX_CLIP_SECONDS or idle >= POST_MOTION_HOLD:
                    circular.stop()
                    capturing = False
                    log.info(
                        "Clip saved (%.0fs total, %.0fs idle): %s",
                        elapsed, idle, clip_upload_path,
                    )
                    _log_remote_motion(
                        "capture_finished",
                        min_interval=0,
                        clipPath=clip_upload_path,
                        elapsedSeconds=round(elapsed, 1),
                        idleSeconds=round(idle, 1),
                        initialMotionScore=round(capture_motion_score, 1),
                        peakMotionScore=round(capture_peak_motion_score, 1),
                    )
                    threading.Thread(
                        target=_upload_worker,
                        args=(clip_upload_path, capture_motion_score),
                        daemon=True,
                    ).start()
                    clip_upload_path = None
                    capture_peak_motion_score = 0.0
                    motion_cooldown = COOLDOWN_SECONDS

            lores = picam2.capture_array("lores")
            motion_summary["frames"] += 1

            # ── Brightness-delta filter (catches lamp thermostat transitions) ──
            # YUV420 layout: Y plane occupies the first LORES_H rows.
            y_mean = float(np.mean(lores[:LORES_H]))
            if rolling_brightness is None:
                rolling_brightness = y_mean
            brightness_delta = abs(y_mean - rolling_brightness)
            # Slow EMA so it tracks the settled level, not fast transients
            rolling_brightness = rolling_brightness * 0.92 + y_mean * 0.08

            if brightness_delta > BRIGHTNESS_DELTA_THRESHOLD:
                motion_summary["brightnessBlocks"] += 1
                motion_summary["maxBrightnessDelta"] = max(
                    float(motion_summary["maxBrightnessDelta"]),
                    brightness_delta,
                )
                if brightness_delta > BRIGHTNESS_MODE_SWITCH_THRESHOLD:
                    # Large jump = camera mode switch (IR↔color) — reset immediately
                    # so detection recovers in seconds rather than minutes.
                    log.info(
                        "Camera mode switch detected (brightness delta %.1f) — "
                        "resetting background model and EMA.",
                        brightness_delta,
                    )
                    _log_remote_motion(
                        "filter_blocked",
                        reason="brightness_mode_switch",
                        brightnessDelta=round(brightness_delta, 2),
                        min_interval=60,
                    )
                    bg_sub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50)
                    rolling_brightness = y_mean  # snap EMA to current level
                    last_frame_passed_filters = now
                else:
                    log.debug("Brightness delta %.1f > %d — skipping (lighting change)",
                              brightness_delta, BRIGHTNESS_DELTA_THRESHOLD)
                consecutive_high_motion = 0
                motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            frame_bgr = cv2.cvtColor(lores, cv2.COLOR_YUV2BGR_I420)
            fg_mask = bg_sub.apply(frame_bgr)

            # ── Coverage filter (catches lamp changes MOG2 has partially adapted to) ──
            total_fg_pixels = cv2.countNonZero(fg_mask)
            if total_fg_pixels > FRAME_PIXELS * MAX_COVERAGE_FRACTION:
                # >12% of frame in motion → global event (lighting), not gecko
                coverage_fraction = total_fg_pixels / FRAME_PIXELS
                motion_summary["coverageBlocks"] += 1
                motion_summary["maxCoverageFraction"] = max(
                    float(motion_summary["maxCoverageFraction"]),
                    coverage_fraction,
                )
                consecutive_high_motion = 0
                stall_seconds = now - last_frame_passed_filters
                if stall_seconds > FILTER_STALL_RESET_SECONDS:
                    # Stuck for too long — bg_sub never adapted. Reset it.
                    log.info(
                        "Coverage filter blocking for %.0fs (%.1f%% fg) — "
                        "resetting background model.",
                        stall_seconds,
                        100.0 * total_fg_pixels / FRAME_PIXELS,
                    )
                    bg_sub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50)
                    last_frame_passed_filters = now
                elif stall_seconds > FILTER_STALL_WARN_INTERVAL and now - last_stall_warn > FILTER_STALL_WARN_INTERVAL:
                    log.info(
                        "Coverage filter blocking (%.1f%% fg pixels, stalled %.0fs) — "
                        "background model adapting…",
                        100.0 * coverage_fraction,
                        stall_seconds,
                    )
                    _log_remote_motion(
                        "filter_blocked",
                        reason="coverage_filter",
                        coverageFraction=round(coverage_fraction, 4),
                        stalledSeconds=round(stall_seconds, 1),
                        min_interval=60,
                    )
                    last_stall_warn = now
                motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            last_frame_passed_filters = now  # frame cleared all filters

            contours, _ = cv2.findContours(
                fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            motion_score = sum(cv2.contourArea(c) for c in contours)
            motion_summary["maxMotionScore"] = max(
                float(motion_summary["maxMotionScore"]),
                motion_score,
            )

            if warmup_remaining > 0:
                warmup_remaining -= 1
                motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                consecutive_high_motion = 0
                time.sleep(POLL_INTERVAL)
                continue

            # ── Sustained-motion gate (avoids single-frame flicker) ────────────
            if motion_score > MOTION_THRESHOLD * NEAR_THRESHOLD_RATIO:
                motion_summary["nearThresholdFrames"] += 1

            if motion_score > MOTION_THRESHOLD:
                motion_summary["aboveThresholdFrames"] += 1
                consecutive_high_motion += 1
                if capturing:
                    last_motion_during_capture = now
                    capture_peak_motion_score = max(capture_peak_motion_score, motion_score)
                    log.debug(
                        "Motion continuing during capture (score=%.0f, elapsed=%.0fs)",
                        motion_score, now - capture_start_time,
                    )
            else:
                consecutive_high_motion = 0

            # ── Trigger new capture ────────────────────────────────────────────
            if (
                consecutive_high_motion >= SUSTAINED_MOTION_FRAMES
                and not capturing
            ):
                if motion_cooldown > 0:
                    motion_summary["cooldownSkips"] += 1
                    _log_remote_motion(
                        "motion_skipped",
                        reason="cooldown",
                        motionScore=round(motion_score, 1),
                        cooldownRemainingSeconds=round(motion_cooldown, 1),
                        consecutiveFrames=consecutive_high_motion,
                        min_interval=10,
                    )
                    motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                    time.sleep(POLL_INTERVAL)
                    continue

                if not _is_armed():
                    log.info("Motion detected (score=%.0f) but snoozed — skipping.", motion_score)
                    motion_summary["snoozedSkips"] += 1
                    _log_remote_motion(
                        "motion_skipped",
                        reason="snoozed",
                        motionScore=round(motion_score, 1),
                        consecutiveFrames=consecutive_high_motion,
                        min_interval=10,
                    )
                    motion_cooldown = COOLDOWN_SECONDS
                    motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                    time.sleep(POLL_INTERVAL)
                    continue

                clip_path = CLIPS_DIR / f"{uuid4()}.mp4"
                log.info(
                    "Motion detected (score=%.0f) → capturing %s",
                    motion_score,
                    clip_path,
                )
                consecutive_high_motion = 0
                capture_start_time = now
                last_motion_during_capture = now
                clip_upload_path = str(clip_path)
                capture_motion_score = motion_score
                capture_peak_motion_score = motion_score
                capturing = True
                motion_summary["capturesStarted"] += 1

                _log_remote_motion(
                    "capture_started",
                    min_interval=0,
                    clipPath=str(clip_path),
                    motionScore=round(motion_score, 1),
                    consecutiveFrames=consecutive_high_motion,
                    brightnessDelta=round(brightness_delta, 2),
                    coverageFraction=round(total_fg_pixels / FRAME_PIXELS, 4),
                )

                circular.fileoutput = str(clip_path)
                circular.start()  # flush pre-event ring buffer

            flush_motion_summary()
            motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
            time.sleep(POLL_INTERVAL)

    finally:
        flush_motion_summary(force=True)
        picam2.stop_recording()
        log.info("Stopped.")


def _upload_worker(clip_path: str, motion_score: float) -> None:
    try:
        upload_event(clip_path, motion_score)
    except Exception as exc:
        log.error("Upload failed for %s: %s", clip_path, exc)
        _log_remote_motion(
            "capture_upload_failed",
            min_interval=0,
            clipPath=clip_path,
            motionScore=round(motion_score, 1),
            error=str(exc),
        )


if __name__ == "__main__":
    run()
