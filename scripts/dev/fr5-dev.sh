#!/usr/bin/env bash
# FR5 개발 — fr5-bridge(mock 포함) 와 웹 dev 서버를 같이 띄운다.
# 브리지만: bash scripts/dev/fr5-dev.sh bridge   웹만: npm run dev:fr5
# 포트는 FR5_PORT 로 오버라이드 (기본 5055). tb-bridge 도 dev 에서 5055 를 쓴다 —
# 같은 맥에서 동시에 띄우려면 FR5_PORT 를 바꾼다 (운영은 호스트가 달라 충돌 없음).
set -euo pipefail
cd "$(dirname "$0")/../../FR5/bridge"

BRIDGE_CMD=(uv run --with fastapi --with 'uvicorn[standard]' --with pyyaml \
  uvicorn main:app --host 0.0.0.0 --port "${FR5_PORT:-5055}")

if [ "${1:-}" = "bridge" ]; then
  exec "${BRIDGE_CMD[@]}"
fi

"${BRIDGE_CMD[@]}" &
BRIDGE_PID=$!
trap 'kill "$BRIDGE_PID" 2>/dev/null' EXIT
cd ../..
npm run dev:fr5
