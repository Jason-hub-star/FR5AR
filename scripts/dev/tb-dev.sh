#!/usr/bin/env bash
# 터틀봇 관제 개발 — tb-bridge(mock) 와 웹 dev 서버를 같이 띄운다.
# 브리지만: bash scripts/dev/tb-dev.sh bridge   웹만: npm run dev:tb
set -euo pipefail
cd "$(dirname "$0")/../../TurtleBot/bridge"

BRIDGE_CMD=(uv run --with fastapi --with 'uvicorn[standard]' --with pyyaml \
  uvicorn main:app --host 0.0.0.0 --port 5055)

if [ "${1:-}" = "bridge" ]; then
  exec "${BRIDGE_CMD[@]}"
fi

"${BRIDGE_CMD[@]}" &
BRIDGE_PID=$!
trap 'kill "$BRIDGE_PID" 2>/dev/null' EXIT
cd ../..
npm run dev:tb
