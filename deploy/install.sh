#!/usr/bin/env bash
# Installer Live Streaming Recorder untuk Ubuntu 22.04 / 24.04
# Pemakaian (dari folder project):  sudo bash deploy/install.sh
set -euo pipefail

APP_NAME="live-streaming-recorder"
APP_DIR="${APP_DIR:-/opt/live-streaming-recorder}"
APP_USER="${APP_USER:-live-streaming-recorder}"
NODE_MAJOR="${NODE_MAJOR:-22}"
ENV_FILE="/etc/${APP_NAME}.env"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ $EUID -eq 0 ]] || { echo "Jalankan dengan sudo/root"; exit 1; }

echo "==> Install paket sistem (ffmpeg, curl, python3, rsync)"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg ffmpeg python3 python3-pip rsync

# curl_cffi: Stories/Feed Instagram butuh TLS ala Chrome (scripts/impersonate_fetch.py)
pip install --break-system-packages --upgrade curl_cffi 2>/dev/null || pip install --upgrade curl_cffi

if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Install Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> Install / update yt-dlp"
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

echo "==> User sistem: ${APP_USER}"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/var/lib/${APP_NAME}" --shell /usr/sbin/nologin "$APP_USER"

echo "==> Salin source ke ${APP_DIR}"
mkdir -p "$APP_DIR"
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude data --exclude downloads --exclude .git \
    "$SRC_DIR/" "$APP_DIR/"
fi
mkdir -p "$APP_DIR/data" "$APP_DIR/downloads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Buat ${ENV_FILE}"
  PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | cut -c1-16)"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=9843
HOST=0.0.0.0
PASSWORD=${PW}
DATA_DIR=${APP_DIR}/data
DOWNLOAD_DIR=${APP_DIR}/downloads
FFMPEG_PATH=/usr/bin/ffmpeg
YTDLP_PATH=/usr/local/bin/yt-dlp
TZ=Asia/Jakarta
EOF
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
  echo "    Password UI: ${PW}  (ubah di ${ENV_FILE})"
fi

echo "==> npm install & build"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund && npm run build"

echo "==> Pasang service systemd"
sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__APP_USER__#${APP_USER}#g" -e "s#__ENV_FILE__#${ENV_FILE}#g" \
  "$APP_DIR/deploy/live-streaming-recorder.service" > "/etc/systemd/system/${APP_NAME}.service"
systemctl daemon-reload
systemctl enable "${APP_NAME}"
systemctl restart "${APP_NAME}"

# Update yt-dlp tiap hari (TikTok/IG sering berubah)
cat > /etc/cron.daily/yt-dlp-update <<'EOF'
#!/bin/sh
/usr/local/bin/yt-dlp -U >/dev/null 2>&1 || true
EOF
chmod +x /etc/cron.daily/yt-dlp-update

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Selesai! Buka: http://${IP:-SERVER_IP}:9843"
echo "Log:    journalctl -u ${APP_NAME} -f"
echo "Config: ${ENV_FILE}  (setelah edit: systemctl restart ${APP_NAME})"
