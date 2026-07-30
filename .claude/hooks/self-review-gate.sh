#!/usr/bin/env bash
# 파일을 고치면 그 종류에 맞는 게이트만 돌린다. 전체를 매번 돌리면 느려서 아무도 안 본다.
# 실패할 때만 출력한다 — 통과하면 조용하다.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 0
IN="${CLAUDE_TOOL_INPUT:-}"

run() {
  local out
  out="$(bash "scripts/check/$1" 2>&1)" || true
  if printf '%s' "$out" | grep -q 'FAIL'; then
    printf '%s\n' "$out" | grep 'FAIL' | head -5
    echo "[gate] scripts/check/$1 실패 — 넘어가기 전에 고쳐라"
  fi
}

case "$IN" in *".claude/skills/"*|*".claude/commands/"*|*".claude/hooks/"*) run harness.sh ;; esac
case "$IN" in *"docs/"*".md"*|*"CLAUDE.md"*|*"AGENTS.md"*)                  run docs.sh ;;    esac
case "$IN" in *"web/assets/"*)                                             run assets.sh ;;  esac
case "$IN" in *"scripts/check/"*|*"scripts/README.md"*)                    run consts.sh ;;  esac
exit 0
