#!/usr/bin/env bash
set -euo pipefail

host="${1:-prod-firehose}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage="/opt/community-archive-nightly-digest.next"
release="/opt/community-archive-nightly-digest"
previous="/opt/community-archive-nightly-digest.previous"

ssh "$host" "rm -rf '$stage' && mkdir -p '$stage/src/lib' '$stage/services'"
rsync -a --delete "$repo_root/services/nightly-digest/" "$host:$stage/services/nightly-digest/"
rsync -a --delete "$repo_root/src/lib/digest/" "$host:$stage/src/lib/digest/"
rsync -a --delete "$repo_root/src/lib/portal/" "$host:$stage/src/lib/portal/"
rsync -a "$repo_root/src/lib/clickhouseGateway.ts" "$host:$stage/src/lib/clickhouseGateway.ts"
rsync -a "$repo_root/tsconfig.json" "$host:$stage/tsconfig.json"
rsync -a "$repo_root/ops/nightly-digest/community-archive-nightly-digest.service" \
  "$host:/etc/systemd/system/community-archive-nightly-digest.service"
rsync -a "$repo_root/ops/nightly-digest/community-archive-nightly-digest.timer" \
  "$host:/etc/systemd/system/community-archive-nightly-digest.timer"

ssh "$host" bash -s -- "$stage" "$release" "$previous" <<'REMOTE'
set -euo pipefail
stage="$1"
release="$2"
previous="$3"

test -x /root/.bun/bin/bun
test -s /etc/community-archive-nightly-digest.env
chmod 0600 /etc/community-archive-nightly-digest.env
systemd-analyze verify \
  /etc/systemd/system/community-archive-nightly-digest.service \
  /etc/systemd/system/community-archive-nightly-digest.timer
rm -rf "$previous"
if test -d "$release"; then mv "$release" "$previous"; fi
mv "$stage" "$release"
systemctl daemon-reload
systemctl disable --now community-archive-nightly-digest.timer >/dev/null 2>&1 || true
systemctl reset-failed community-archive-nightly-digest.service >/dev/null 2>&1 || true
systemctl cat community-archive-nightly-digest.service >/dev/null
systemctl cat community-archive-nightly-digest.timer >/dev/null
REMOTE

echo "Nightly digest installed on $host with the timer disabled."
