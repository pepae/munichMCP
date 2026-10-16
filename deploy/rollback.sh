#!/usr/bin/env bash
# Roll the server back to the image that ran before the last deploy.
#   deploy/rollback.sh root@64.226.93.215
set -euo pipefail
HOST="${1:?usage: rollback.sh user@host}"
DIR="${REMOTE_DIR:-/opt/munichmcp}"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $DIR
docker image inspect munichmcp:previous >/dev/null
docker tag munichmcp:previous munichmcp:latest
[ -d app.old ] && rm -rf app.failed && mv app app.failed && mv app.old app || true
cd app
docker compose -p munichmcp up -d --no-build
sleep 5
curl -fsS http://127.0.0.1:8420/health
REMOTE
echo "==> rolled back"
