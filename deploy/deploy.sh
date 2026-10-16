#!/usr/bin/env bash
# Deploy munichMCP to a Docker host over SSH.
#   deploy/deploy.sh root@64.226.93.215
# Copies the working tree (without node_modules/data/dist), builds the image on
# the host and restarts the container. The host keeps /opt/munichmcp/.env and
# /opt/munichmcp/data (cache + live wiki) between deploys.
set -euo pipefail
HOST="${1:?usage: deploy.sh user@host}"
DIR="${REMOTE_DIR:-/opt/munichmcp}"

cd "$(dirname "$0")/.."
echo "==> packing"
tar --exclude=./node_modules --exclude=./data --exclude=./dist --exclude=./.git --exclude='*.log' --exclude=./docs -czf /tmp/munichmcp.tgz .
echo "==> uploading to $HOST:$DIR"
ssh "$HOST" "mkdir -p $DIR/app $DIR/data && chown 1000:1000 $DIR/data"
scp -q /tmp/munichmcp.tgz "$HOST:/tmp/munichmcp.tgz"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd $DIR
rm -rf app.new && mkdir app.new && tar --no-same-owner -xzf /tmp/munichmcp.tgz -C app.new
rm -rf app.old && { [ -d app ] && mv app app.old || true; } && mv app.new app
[ -f .env ] || { echo "WIKI_MAINTAINER_TOKEN=\$(openssl rand -hex 24)" > .env; chmod 600 .env; echo "created .env with a new maintainer token"; }
cp .env app/.env
cd app
# Keep the running image as munichmcp:previous so a bad release can be rolled back.
docker image inspect munichmcp:latest >/dev/null 2>&1 && docker tag munichmcp:latest munichmcp:previous || true
docker compose -p munichmcp build --pull
docker compose -p munichmcp up -d --remove-orphans
for i in \$(seq 1 30); do
  if curl -fsS http://127.0.0.1:8420/health >/dev/null 2>&1; then echo "healthy"; break; fi
  sleep 2
done
if ! curl -fsS http://127.0.0.1:8420/health >/dev/null 2>&1; then
  echo "new release is not healthy, rolling back"
  docker tag munichmcp:previous munichmcp:latest
  docker compose -p munichmcp up -d --no-build
  exit 1
fi
docker compose -p munichmcp ps
EOF
echo "==> done"
