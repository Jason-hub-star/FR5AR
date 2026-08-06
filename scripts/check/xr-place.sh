#!/usr/bin/env bash
# 겹치기 놓기 계산 — 두 모서리 풀이·계기 문구·유령벽. **브라우저 없이 1초.**
#
# `immersive-ar` 은 폰에서만 열려서 겹치기 화면은 게이트가 통째로 못 봤다 (2026-08-06 `/감사`).
# 그래서 조용히 틀리는 자리(배율·회전 부호·계기 문구)만 순수 함수로 떼어 여기서 잰다.
# 실렌더 절반은 `node scripts/check/xr-web-verify.mjs` — 형제들처럼 사람이 부른다.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if out="$(node "$ROOT/scripts/check/xr-web-verify.mjs" --pure 2>&1)"; then
  echo "$out" | tail -1
  echo "겹치기 놓기 계산 OK"
else
  echo "$out"
  echo "겹치기 놓기 계산 실패"
  exit 1
fi
