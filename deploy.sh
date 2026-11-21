#!/usr/bin/env bash
# Production deploy: pull the latest main and the image CI built, restart. Run from this folder.
# GitHub Actions sends a short-lived token on stdin so the server only pulls the image (no build).
# Run by hand (no token on stdin), it builds the image locally instead.
# Wrapped in { } so bash reads the whole script before `git merge` can replace this file.
{
set -euo pipefail
cd "$(dirname "$0")"
dc() { docker compose -f docker-compose.prod.yml "$@"; }
git fetch --prune origin main
git merge --ff-only origin/main

# stdin from CI: line 1 = GitHub user, line 2 = token.
user=""; token=""
[ -t 0 ] || { IFS= read -r -t 10 user && IFS= read -r -t 10 token; } || true
if [ -n "$token" ]; then
  # Throwaway login: the token never lands in ~/.docker/config.json.
  DOCKER_CONFIG="$(mktemp -d)"; export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
  dc pull
else
  # Build first: if it fails, the running container keeps serving the old version.
  dc build
fi
# Don't start into a full disk: disk-guard.sh stopped it for a reason.
if [ "$(df --output=avail -B1G downloads 2>/dev/null | tail -1 | tr -d ' ')" -lt 5 ]; then
  echo "Less than 5 GB free: not starting the recorder (see deploy/disk-guard.sh)" >&2
  exit 1
fi
dc up -d --no-build --remove-orphans
docker image prune -f >/dev/null
echo "Deployed live-streaming-recorder $(git rev-parse --short HEAD)"
exit
}
