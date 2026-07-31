#!/usr/bin/env bash
# FR5 개발 — fr5-bridge 를 띄운다. 포트는 FR5_PORT 로 오버라이드 (기본 5055).
# 주의: tb-bridge 도 같은 맥에서 dev 시 5055 를 쓴다 — 동시에 띄우려면 FR5_PORT 를 바꾼다.
# (운영은 호스트가 달라 충돌하지 않는다 — tb 는 turtlebot.local, fr5 는 랩 PC.)
set -euo pipefail
cd "$(dirname "$0")/../../FR5/bridge"

exec uv run --with fastapi --with 'uvicorn[standard]' --with pyyaml \
  uvicorn main:app --host 0.0.0.0 --port "${FR5_PORT:-5055}"
