#!/usr/bin/env python3
"""
gecko_cam.py — Main Pi daemon for Gecko Cam.

Runs picamera2 with dual outputs:
  - main (1280x720) → FFmpeg → HLS segments in /tmp/hls/
  - lores (320x240, YUV420) → OpenCV MOG2 motion detection

On motion: flushes CircularOutput ring buffer (10s pre) + captures 10s post,
then calls upload_event.upload_event() in a background thread.
"""

import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

import cv2
from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import CircularOutput, FfmpegOutput

from upload_event import upload_event

# ── Configuration ──────────────────────────────────────────────────────────────
HLS_DIR = Path("/tmp/hls")
CLIPS_DIR = Path("/tmp/clips")
HLS_SEGMENT_TIME = 2         # seconds per HLS segment
HLS_LIST_SIZE = 10           # segments kept in playlist
MOTION_THRESHOLD = 15000     # sum of contour areas (pixels²) — tune to taste
COOLDOWN_SECONDS = 60        # seconds between event captures
WARMUP_FRAMES = 60           # frames to feed MOG2 before arming motion detection
POST_MOTION_SECONDS = 10     # seconds to record after trigger
RING_BUFFER_SECONDS = 10     # seconds of pre-motion buffer
FPS = 30
POLL_INTERVAL = 0.1          # motion detection poll interval (seconds)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("gecko_cam")


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
    warmup_remaining = WARMUP_FRAMES

    def handle_signal(signum, frame):
        log.info("Signal %s received — stopping.", signum)
        picam2.stop_recording()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        while True:
            lores = picam2.capture_array("lores")
            frame_bgr = cv2.cvtColor(lores, cv2.COLOR_YUV2BGR_I420)
            fg_mask = bg_sub.apply(frame_bgr)
            contours, _ = cv2.findContours(
                fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            motion_score = sum(cv2.contourArea(c) for c in contours)

            if warmup_remaining > 0:
                warmup_remaining -= 1
                motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            if motion_score > MOTION_THRESHOLD and motion_cooldown <= 0 and not capturing:
                clip_path = CLIPS_DIR / f"{uuid4()}.mp4"
                log.info(
                    "Motion detected (score=%.0f) → capturing %s",
                    motion_score,
                    clip_path,
                )
                capturing = True

                circular.fileoutput = str(clip_path)
                circular.start()  # flush pre-event ring buffer
                time.sleep(POST_MOTION_SECONDS)
                circular.stop()
                capturing = False

                log.info("Clip saved: %s", clip_path)
                threading.Thread(
                    target=_upload_worker,
                    args=(str(clip_path), motion_score),
                    daemon=True,
                ).start()

                motion_cooldown = COOLDOWN_SECONDS

            motion_cooldown = max(0.0, motion_cooldown - POLL_INTERVAL)
            time.sleep(POLL_INTERVAL)

    finally:
        picam2.stop_recording()
        log.info("Stopped.")


def _upload_worker(clip_path: str, motion_score: float) -> None:
    try:
        upload_event(clip_path, motion_score)
    except Exception as exc:
        log.error("Upload failed for %s: %s", clip_path, exc)


if __name__ == "__main__":
    run()
