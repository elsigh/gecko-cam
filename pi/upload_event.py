#!/usr/bin/env python3
"""
upload_event.py — Upload a clip + thumbnail to Vercel Blob and register the event.

Flow:
  1. POST /api/upload-token  → get Vercel Blob client-upload token
  2. PUT clip to Vercel Blob edge
  3. Extract thumbnail via ffmpeg
  4. PUT thumbnail to Vercel Blob
  5. POST /api/events with full event metadata
"""

import json
import logging
import os
import subprocess
import time
from pathlib import Path
from uuid import uuid4

CLIP_FPS = 30  # must match gecko_cam.py FPS

import requests

log = logging.getLogger("upload_event")

# Load env from ~/.gecko_cam.env if present
_env_file = Path.home() / ".gecko_cam.env"
if _env_file.exists():
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

VERCEL_APP_URL = os.environ.get("VERCEL_APP_URL", "").rstrip("/")
API_SECRET = os.environ.get("API_SECRET", "")


BLOB_UPLOAD_API = "https://blob.vercel-storage.com"


def _get_client_token(pathname: str) -> str:
    """Request a Vercel Blob client-upload token for the given pathname."""
    resp = requests.post(
        f"{VERCEL_APP_URL}/api/upload-token",
        headers={
            "x-api-secret": API_SECRET,
            "Content-Type": "application/json",
        },
        json={"pathname": pathname},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["clientToken"]


def _upload_to_blob(file_path: str, pathname: str, content_type: str) -> str:
    """Upload a file directly to Vercel Blob edge, return the public URL."""
    client_token = _get_client_token(pathname)
    with open(file_path, "rb") as f:
        resp = requests.put(
            f"{BLOB_UPLOAD_API}/{pathname}",
            headers={
                "Authorization": f"Bearer {client_token}",
                "x-content-type": content_type,
            },
            data=f,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()["url"]


def _wrap_h264_in_mp4(clip_path: str) -> None:
    """Wrap raw H264 stream (from CircularOutput) in an MP4 container in-place."""
    temp_path = clip_path + ".tmp.mp4"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "h264",
                "-framerate", str(CLIP_FPS),
                "-i", clip_path,
                "-c:v", "copy",
                temp_path,
            ],
            check=True,
            capture_output=True,
        )
        os.replace(temp_path, clip_path)
    except Exception:
        Path(temp_path).unlink(missing_ok=True)
        raise


def _choose_thumbnail_time(duration: float) -> float:
    """Pick a representative frame slightly into the clip instead of frame 0."""
    if duration <= 0:
        return 0
    return max(0, min(duration * 0.2, 2.0, duration - 0.1))


def _extract_thumbnail(clip_path: str, duration: float) -> str:
    """Extract a representative frame from the clip as a JPEG, return the path."""
    thumb_path = clip_path.replace(".mp4", "_thumb.jpg")
    seek_seconds = _choose_thumbnail_time(duration)
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", f"{seek_seconds:.2f}",
            "-i", clip_path,
            "-vframes", "1",
            "-q:v", "3",
            thumb_path,
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        log.error("ffmpeg thumbnail failed (exit %d): %s", result.returncode, result.stderr.decode())
        result.check_returncode()
    return thumb_path


def _get_duration(clip_path: str) -> float:
    """Return clip duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            clip_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    info = json.loads(result.stdout)
    return float(info.get("format", {}).get("duration", 0))


def upload_event(clip_path: str, motion_score: float) -> None:
    if not VERCEL_APP_URL:
        raise RuntimeError("VERCEL_APP_URL not set")
    if not API_SECRET:
        raise RuntimeError("API_SECRET not set")

    thumb_path: str | None = None
    try:
        # CircularOutput writes raw H264 — wrap in MP4 container for browser playback
        log.info("Converting raw H264 → MP4 container: %s", clip_path)
        _wrap_h264_in_mp4(clip_path)

        event_id = str(uuid4())
        timestamp = int(time.time() * 1000)  # Unix ms
        clip_name = Path(clip_path).name

        log.info("[%s] Uploading clip: %s", event_id, clip_path)
        clip_url = _upload_to_blob(clip_path, f"clips/{clip_name}", "video/mp4")
        log.info("[%s] Clip uploaded: %s", event_id, clip_url)

        duration = _get_duration(clip_path)

        thumb_path = _extract_thumbnail(clip_path, duration)
        thumb_name = Path(thumb_path).name
        log.info("[%s] Uploading thumbnail: %s", event_id, thumb_path)
        thumbnail_url = _upload_to_blob(thumb_path, f"thumbnails/{thumb_name}", "image/jpeg")
        log.info("[%s] Thumbnail uploaded: %s", event_id, thumbnail_url)

        payload = {
            "id": event_id,
            "timestamp": timestamp,
            "clipUrl": clip_url,
            "thumbnailUrl": thumbnail_url,
            "duration": duration,
            "motionScore": motion_score,
        }

        resp = requests.post(
            f"{VERCEL_APP_URL}/api/events",
            headers={
                "x-api-secret": API_SECRET,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        log.info("[%s] Event registered: %s", event_id, resp.json())
    finally:
        # Always clean up local files to prevent /tmp from filling up
        try:
            Path(clip_path).unlink(missing_ok=True)
            if thumb_path:
                Path(thumb_path).unlink(missing_ok=True)
        except OSError as e:
            log.warning("Cleanup error: %s", e)


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    if len(sys.argv) < 2:
        print("Usage: upload_event.py <clip.mp4> [motion_score]")
        sys.exit(1)
    clip = sys.argv[1]
    score = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    upload_event(clip, score)
