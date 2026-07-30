#!/usr/bin/env bash
# 세션 종료 시 전체 게이트를 돌린다. 레드면 알린다 — /마감 을 부르라는 신호.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 0
if ! bash scripts/check/all.sh >/tmp/_fr5gate.log 2>&1; then
  echo "[session-gate] 게이트 레드 상태로 세션이 끝난다:"
  grep -E 'FAIL' /tmp/_fr5gate.log | head -8
  echo "[session-gate] /마감 을 부르거나 GAP-MATRIX에 OPEN으로 남겨라."
fi
exit 0
