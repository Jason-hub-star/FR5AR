#!/usr/bin/env bash
# 개수·기준값이 바뀔 편집이면 드리프트를 바로 검사한다.
# 2026-07-29~30에 이 불일치로 게이트가 여러 번 거짓 실패했다.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 0
IN="${CLAUDE_TOOL_INPUT:-}"

case "$IN" in
  *"docs/INDEX.md"*|*".claude/skills/"*|*"web/assets/"*|*"scripts/check/"*|*"scripts/README.md"*)
    out="$(bash scripts/check/consts.sh 2>&1)" || true
    if printf '%s' "$out" | grep -q 'FAIL'; then
      printf '%s\n' "$out" | grep 'FAIL'
      echo "[정합] 기준값이 어긋났다. /정합 절차로 뿌리부터 전파하라 — scripts/README.md 기준값 표"
    fi
    ;;
esac
exit 0
