# Gecko Cam — Raspberry Pi

All code and config needed to run the camera + motion capture on a Raspberry Pi. If you get a new Pi, clone this repo and follow **New Pi setup** below.

## What’s in this directory

| File | Purpose |
|------|--------|
| `gecko_cam.py` | Main daemon: captures HLS stream + runs MOG2 motion detection, records clips on trigger |
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
- `MAX_COVERAGE_FRACTION` — ignore frames where too much of the enclosure appears to move at once.
- `MAX_TRIGGER_BRIGHTNESS_RANGE` — blocks new captures while enclosure brightness is drifting across the recent window.
- `LOCALIZED_DRIFT_OVERRIDE_*` — lets strong, localized motion still start a capture during mild brightness drift.
- `COOLDOWN_SECONDS` — minimum time between captures.
