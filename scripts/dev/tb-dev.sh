#!/usr/bin/env bash
# 터틀봇 관제 개발 — tb-bridge(mock) 와 웹 dev 서버를 같이 띄운다.
# 브리지만: bash scripts/dev/tb-dev.sh bridge   웹만: npm run dev:tb
set -euo pipefail
cd "$(dirname "$0")/../../TurtleBot/bridge"

# 포트 정본은 config.yaml 하나다 (D80) — 파서를 들이지 않고 그 한 줄만 읽는다
PORT=$(sed -n 's/^port:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' config.yaml)
[ -n "$PORT" ] || { echo "config.yaml 에 port 가 없다"; exit 1; }

BRIDGE_CMD=(uv run --with fastapi --with 'uvicorn[standard]' --with pyyaml \
  uvicorn main:app --host 0.0.0.0 --port "$PORT")

if [ "${1:-}" = "bridge" ]; then
  exec "${BRIDGE_CMD[@]}"
fi

"${BRIDGE_CMD[@]}" &
BRIDGE_PID=$!
trap 'kill "$BRIDGE_PID" 2>/dev/null' EXIT
cd ../..
npm run dev:tb
