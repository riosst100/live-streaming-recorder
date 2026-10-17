#!/usr/bin/env bash
# Update kode di server: jalankan dari folder source terbaru.  sudo bash deploy/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/live-streaming-recorder}"
APP_USER="${APP_USER:-live-streaming-recorder}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ $EUID -eq 0 ]] || { echo "Jalankan dengan sudo/root"; exit 1; }

if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude data --exclude downloads --exclude .git \
    "$SRC_DIR/" "$APP_DIR/"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund && npm run build"
# Restart menghentikan rekaman berjalan; file .ts diselamatkan otomatis saat start.
systemctl restart live-streaming-recorder
echo "Update selesai."
