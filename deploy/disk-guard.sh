#!/usr/bin/env bash
# Production disk guard for the shared VPS (cron, see /etc/cron.d/live-streaming-recorder):
#   disk-guard.sh prune   delete recordings older than KEEP_DAYS (default 7)
#   disk-guard.sh check   stop the recorder when free space < MIN_FREE_GB (default 5),
#                         so a long live can't fill the disk and take down the other sites.
# The container stays stopped until free space is back and someone runs ./deploy.sh or
# `docker compose -f docker-compose.prod.yml up -d`. Interrupted .ts files are recovered on start.
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP_DAYS=${KEEP_DAYS:-7}
MIN_FREE_GB=${MIN_FREE_GB:-5}
log() { logger -t live-streaming-recorder "$*"; echo "$*"; }

case "${1:-check}" in
  prune)
    n=$(find downloads -type f -mtime +"$KEEP_DAYS" \( -name '*.mp4' -o -name '*.ts' -o -name '*.log' \) -print -delete | wc -l)
    find downloads -mindepth 1 -type d -empty -delete
    [ "$n" -gt 0 ] && log "pruned $n recording file(s) older than $KEEP_DAYS days"
    ;;
  check)
    free=$(df --output=avail -B1G downloads | tail -1 | tr -d ' ')
    if [ "$free" -lt "$MIN_FREE_GB" ] && [ "$(docker inspect -f '{{.State.Running}}' live-streaming-recorder 2>/dev/null)" = true ]; then
      log "only ${free} GB free (< ${MIN_FREE_GB} GB): stopping live-streaming-recorder"
      docker stop -t 40 live-streaming-recorder >/dev/null
    fi
    ;;
esac
