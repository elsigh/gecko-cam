#!/usr/bin/env bash
# setup.sh — Bootstrap Gecko Cam on a Raspberry Pi 5 running Raspberry Pi OS (64-bit)
# Run as: bash setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PI_USER="${SUDO_USER:-pi}"

echo "=== Gecko Cam Setup ==="
echo "Repo: $REPO_DIR"
echo "User: $PI_USER"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
echo "Installing system packages..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    ffmpeg \
    nginx \
    python3-picamera2 \
    python3-opencv \
    python3-pip \
    python3-requests \
    curl

# ── 2. Create working directories ─────────────────────────────────────────────
echo "Creating /tmp directories..."
install -d -m 755 -o "$PI_USER" /tmp/hls /tmp/clips

# ── 3. nginx configuration ────────────────────────────────────────────────────
echo "Configuring nginx..."
cat > /etc/nginx/sites-available/gecko-cam << 'NGINX_CONF'
server {
    listen 80 default_server;
    server_name _;

    # HLS stream segments
    location /hls/ {
        alias /tmp/hls/;
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS";
        types {
            application/vnd.apple.mpegurl m3u8;
            video/MP2T              ts;
        }
    }

    # Health check
    location /health {
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/gecko-cam /etc/nginx/sites-enabled/gecko-cam
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx
echo "nginx configured."

# ── 4. Environment file ───────────────────────────────────────────────────────
ENV_FILE="/home/$PI_USER/.gecko_cam.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" << 'ENV_TEMPLATE'
# Gecko Cam environment — fill in before starting the service
VERCEL_APP_URL=https://gecko-cam.vercel.app
API_SECRET=REPLACE_WITH_YOUR_SECRET
ENV_TEMPLATE
    chown "$PI_USER:$PI_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created $ENV_FILE — please edit it with your values."
else
    echo "$ENV_FILE already exists, skipping."
fi

# ── 5. systemd service ────────────────────────────────────────────────────────
echo "Installing systemd service..."
cp "$SCRIPT_DIR/gecko-cam.service" /etc/systemd/system/gecko-cam.service
# Patch user and working directory in case repo is not at /home/pi/gecko-cam
sed -i "s|User=pi|User=$PI_USER|g" /etc/systemd/system/gecko-cam.service
sed -i "s|/home/pi/gecko-cam|$REPO_DIR|g" /etc/systemd/system/gecko-cam.service

systemctl daemon-reload
systemctl enable gecko-cam
echo "Service installed. Start with: sudo systemctl start gecko-cam"

# ── 6. Tailscale Funnel hint ──────────────────────────────────────────────────
echo ""
echo "=== Next steps ==="
echo "1. Edit $ENV_FILE with your VERCEL_APP_URL and API_SECRET"
echo "2. Enable Tailscale Funnel:"
echo "   tailscale funnel 80"
echo "   (The HTTPS URL shown is your NEXT_PUBLIC_STREAM_URL — append /hls/stream.m3u8)"
echo "3. Start the daemon:"
echo "   sudo systemctl start gecko-cam"
echo "4. Watch logs:"
echo "   journalctl -fu gecko-cam"
echo ""
echo "Done!"
