#!/usr/bin/env python3
"""List (and optionally delete) gecko clips that are not worth keeping.

Dry run is the default. This script never deletes anything unless you pass
--apply. Favorites and clips marked useful are kept unless you also pass
--include-protected.

Examples:
  python3 pi/cleanup_low_value_clips.py
  python3 pi/cleanup_low_value_clips.py --analyze
  GECKO_KEEP_SCORE=0.7 python3 pi/cleanup_low_value_clips.py
  python3 pi/cleanup_low_value_clips.py --apply

Reads VERCEL_APP_URL and API_SECRET from the environment or ~/.gecko_cam.env.
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path

from clip_cleanup import (
    analyze_video,
    decide_event,
    event_in_feeding_window,
    format_report,
    load_events,
)
from event_classifier import keep_score_threshold

_env_file = Path.home() / ".gecko_cam.env"
if _env_file.exists():
    with _env_file.open() as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete the low-scoring events. Omit this for a dry run.",
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Download each clip and re-score it from the picture. Slower, and closer to the new classifier.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Keep events at or above this 0..1 score. Defaults to GECKO_KEEP_SCORE or 0.58.",
    )
    parser.add_argument(
        "--events-file",
        help="Score a local events.json instead of calling the site API.",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("VERCEL_APP_URL", "https://gecko-cam.vercel.app").rstrip("/"),
        help="Site origin. Defaults to VERCEL_APP_URL or https://gecko-cam.vercel.app.",
    )
    parser.add_argument(
        "--include-protected",
        action="store_true",
        help="Also delete favorites and clips that were marked useful.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Score at most this many events (0 means all).",
    )
    args = parser.parse_args(argv)

    threshold = keep_score_threshold() if args.threshold is None else args.threshold
    if threshold < 0 or threshold > 1:
        print("Threshold must be between 0 and 1.", file=sys.stderr)
        return 2

    if args.events_file:
        events = load_events(args.events_file)
    else:
        events = fetch_events(args.base_url)

    if args.limit > 0:
        events = events[:args.limit]

    analyzed: dict[str, tuple[float, str]] = {}
    if args.analyze:
        analyzed = analyze_events(events)

    decisions = [
        decide_event(
            event,
            threshold=threshold,
            include_protected=args.include_protected,
            analyzed_score=analyzed.get(str(event.get("id") or ""), (None, ""))[0],
            analyzed_reason=analyzed.get(str(event.get("id") or ""), (None, None))[1],
        )
        for event in events
    ]
    print(format_report(decisions, threshold=threshold, apply=args.apply))

    if not args.apply:
        return 0

    ids = [decision.event_id for decision in decisions if decision.delete and decision.event_id]
    if not ids:
        print("Nothing to delete.")
        return 0
    if args.events_file:
        print("Refusing to delete from --events-file. Point the script at the site and pass --apply.", file=sys.stderr)
        return 2

    deleted = delete_events(args.base_url, ids)
    print(f"Deleted {deleted} events.")
    return 0


def fetch_events(base_url: str) -> list[dict]:
    import requests

    secret = os.environ.get("API_SECRET", "")
    if not secret:
        raise SystemExit("API_SECRET is required to read events. Set it or pass --events-file.")

    events: list[dict] = []
    cursor: str | None = None
    while True:
        params = {"includeSummaries": "1"}
        if cursor:
            params["cursor"] = cursor
        response = requests.get(
            f"{base_url}/api/events",
            params=params,
            headers={"x-api-secret": secret},
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        page = body.get("events") or []
        events.extend(event for event in page if isinstance(event, dict))
        cursor = body.get("nextCursor")
        if not cursor:
            return events


def analyze_events(events: list[dict]) -> dict[str, tuple[float, str]]:
    import requests

    scored: dict[str, tuple[float, str]] = {}
    for index, event in enumerate(events, start=1):
        event_id = str(event.get("id") or "")
        clip_url = event.get("clipUrl")
        if not event_id or not clip_url:
            continue
        print(f"Analyzing {index}/{len(events)} {event_id}", file=sys.stderr)
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                clip_path = Path(temp_dir) / "clip.mp4"
                with requests.get(str(clip_url), stream=True, timeout=120) as response:
                    response.raise_for_status()
                    with clip_path.open("wb") as handle:
                        for chunk in response.iter_content(1024 * 256):
                            if chunk:
                                handle.write(chunk)
                score, reason = analyze_video(
                    str(clip_path),
                    feeding_window_active=event_in_feeding_window(float(event.get("timestamp") or 0)),
                )
            scored[event_id] = (score, reason)
        except Exception as exc:
            print(f"Analyze failed for {event_id}: {exc}", file=sys.stderr)
    return scored


def delete_events(base_url: str, ids: list[str]) -> int:
    import requests

    secret = os.environ.get("API_SECRET", "")
    if not secret:
        raise SystemExit("API_SECRET is required to delete events.")

    deleted = 0
    for start in range(0, len(ids), 40):
        chunk = ids[start:start + 40]
        response = requests.delete(
            f"{base_url}/api/events",
            json={"ids": chunk},
            headers={"x-api-secret": secret, "Content-Type": "application/json"},
            timeout=60,
        )
        response.raise_for_status()
        deleted += int(response.json().get("deleted") or 0)
    return deleted


if __name__ == "__main__":
    raise SystemExit(main())
