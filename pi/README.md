# Gecko Cam — Raspberry Pi

All code and config needed to run the camera + motion capture on a Raspberry Pi. If you get a new Pi, clone this repo and follow **New Pi setup** below.

## What’s in this directory

| File | Purpose |
|------|--------|
| `gecko_cam.py` | Main daemon: captures HLS stream + runs MOG2 motion detection, records clips on trigger |
| `event_classifier.py` | Scene-specific behavior classifier: emergence, likely feeding, notable movement |
| `cleanup_low_value_clips.py` | Dry-run by default. Re-scores saved clips and can delete the low-value ones |
| `upload_event.py` | Uploads a clip + thumbnail to Vercel Blob and registers the event via API |
| `gecko-cam.service` | systemd unit (installed by `setup.sh` under `/etc/systemd/system/`) |
| `setup.sh` | One-time bootstrap: apt packages, nginx, env file, systemd service |
| `requirements.txt` | Python deps for upload (requests); picamera2/opencv via apt only |

## New Pi setup

1. **Raspberry Pi OS (64-bit)** on a Pi 5 (or compatible with picamera2).

2. **Clone the repo** (e.g. under home):
   ```bash
   cd ~
   git clone https://github.com/elsigh/gecko-cam.git
   cd gecko-cam
   ```

3. **Run setup as root** (installs packages, nginx, systemd service, creates `~/.gecko_cam.env`):
   ```bash
   sudo bash pi/setup.sh
   ```
   The script uses the repo directory and your `$USER` when installing the service.

4. **Edit env** with your Vercel app URL and API secret:
   ```bash
   nano ~/.gecko_cam.env
   ```
   Set `VERCEL_APP_URL` (e.g. `https://gecko-cam.vercel.app`) and `API_SECRET` (from Vercel env).

5. **Tailscale** (for remote stream):
   ```bash
   tailscale funnel 80
   ```
   Use the HTTPS URL + `/hls/stream.m3u8` as `NEXT_PUBLIC_STREAM_URL` in the Vercel project.

6. **Start the daemon**:
   ```bash
   sudo systemctl start gecko-cam
   sudo journalctl -fu gecko-cam   # logs
   ```

7. **Camera tuning** (optional): If you use a tuning file (e.g. `imx708_wide_noir.json`), place it in `pi/` so `gecko_cam.py` can load it from its working directory.

## Updating after a code change

From your dev machine, push to the repo. On the Pi:

```bash
cd ~/gecko-cam
git pull
sudo systemctl restart gecko-cam
```

## Config locations

- **Env**: `~/.gecko_cam.env` — `VERCEL_APP_URL`, `API_SECRET` (and optional vars used by `upload_event.py`).
- **systemd**: `/etc/systemd/system/gecko-cam.service` — WorkingDirectory and ExecStart point at this repo’s `pi/` directory.
- **nginx**: `/etc/nginx/sites-available/gecko-cam` — serves `/tmp/hls/` at `/hls/`.

## Tuning motion detection

In `gecko_cam.py`:

- `MOTION_THRESHOLD` — higher = less sensitive.
- `SUSTAINED_MOTION_FRAMES` — consecutive frames above threshold before trigger (reduces light-flicker false positives).
- `FEEDING_WINDOW_*` — more sensitive 20:00-23:00 Pacific-time profile for the usual bug-hunt window. Being inside the window no longer keeps a clip by itself.
- `GECKO_KEEP_SCORE` — interest score from 0 to 1 required to upload a full clip. Default `0.58`. Raise it to keep fewer clips.
- `GECKO_SUMMARY_SCORE` — score required to keep a thumbnail without video. Default `0.34`. Anything below that is discarded and not uploaded.
- `CLIP_RECORDING_DISABLED_*` — Pacific-time window when clip capture is disabled; currently 23:00-20:00.
- `ANALYSIS_WARMUP_START_*` — starts motion analysis five minutes before capture so the background model is ready at 20:00. Outside 19:55-23:00, motion analysis pauses while the live HLS stream stays available.
- `MIN_CLIP_SECONDS` — once a capture starts, keep recording until at least this many seconds have elapsed even if motion briefly pauses.
- `MAX_CLIP_SECONDS` — hard ceiling for a single capture when activity keeps going.
- `RING_BUFFER_SECONDS` — extra circular pre-roll kept before the trigger; raise this if action tends to start before motion crosses threshold.
- `KEYFRAME_INTERVAL_FRAMES` — shorter GOPs preserve more of the circular pre-roll when a clip starts, at a modest compression cost.
- `MAX_COVERAGE_FRACTION` — ignore frames where too much of the enclosure appears to move at once.
- `MAX_TRIGGER_BRIGHTNESS_RANGE` — blocks new captures while enclosure brightness is drifting across the recent window.
- `LOCALIZED_DRIFT_OVERRIDE_*` — lets strong, localized motion still start a capture during mild brightness drift.
- `COOLDOWN_SECONDS` — minimum time between captures.

## Behavior labeling

The Pi now tags each capture before upload using simple enclosure-specific ROIs:

- `emergence` — MauMau appears to come out of a hide and move into the enclosure
- `feeding_likely` — motion reaches the bowl, especially during the evening feeding window
- `roaming` — general crawling around
- `hide_entry_dry` / `hide_entry_rock` — movement ends in a hide

Retention behavior:

- Likely feeding, a real emergence, or a long localized crossing keep the full clip when the interest score is at least `GECKO_KEEP_SCORE` (default 0.58).
- Milder activity between `GECKO_SUMMARY_SCORE` (default 0.34) and the keep score uploads a thumbnail and summary only.
- Lighting changes, in-place twitches, and short noisy motion score below that and are discarded. Nothing is uploaded.
- The evening window adds a small bonus for feeding and emergence. It does not override the score.

The old pipeline kept every feeding-window capture, and two motion samples inside the bowl were enough to call it feeding. That is what filled the library with clips that are not worth watching.

Tune the cutoff without a code change:

```bash
# ~/.gecko_cam.env
GECKO_KEEP_SCORE=0.65
GECKO_SUMMARY_SCORE=0.40
```

Then `sudo systemctl restart gecko-cam`. Higher keep score means fewer videos. If a real feeding session starts getting dropped, lower `GECKO_KEEP_SCORE` toward `0.50`.

## Clean up clips that are already saved

`pi/cleanup_low_value_clips.py` re-scores the backlog and prints what it would delete. It does not delete anything unless you pass `--apply`. Favorites and clips marked useful are kept.

From a machine that has `API_SECRET` and `VERCEL_APP_URL` (the Pi's `~/.gecko_cam.env` is picked up automatically):

```bash
cd ~/gecko-cam

# Dry run. Metadata only, so it finishes immediately.
python3 pi/cleanup_low_value_clips.py

# Download each video and run the same classifier the Pi uses. Slower, better
# for old clips that were labeled feeding from a couple of bowl pixels.
python3 pi/cleanup_low_value_clips.py --analyze

# Same report with a stricter cutoff.
python3 pi/cleanup_low_value_clips.py --threshold 0.7

# After you have read the dry run, delete the DELETE rows.
python3 pi/cleanup_low_value_clips.py --apply
```

You can also point it at a saved `events.json` without touching production:

```bash
python3 pi/cleanup_low_value_clips.py --events-file ./events.json
```

`--events-file` never deletes, even with `--apply`. Metadata scoring is conservative about old `feeding_likely` labels that have almost no bowl pixels, and it can miss a subtle feeding session that was mislabeled. Use `--analyze` before `--apply` if you want the decision to come from the pictures. Start with the dry run either way.
