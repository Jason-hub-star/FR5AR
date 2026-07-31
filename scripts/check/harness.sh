#!/usr/bin/env bash
# 하네스 이식 상태 검증 — FR5Web이 실제로 채택한 것만 검사한다.
# 템플릿 원본이 아니라 우리 채택분 기준이므로, 안 가져온 파일을 MISSING으로 보고하지 않는다.
# 실패하면 exit 1. 게이트로 쓰라고 만든 것이다.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

# 채택 기준값 — 늘리거나 줄이면 여기도 같이 고친다
# 커맨드 0 은 의도한 값이다 — 2026-07-30 에 8개를 전부 한국어 스킬로 흡수했다 (D19).
# 슬래시 명령은 .claude/skills/ 의 한글 폴더명이 결정한다 (~/.claude/commands.md).
WANT_COMMANDS=0
WANT_SKILLS=14

echo "== 하네스 =="

n=$(find .claude/commands -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -eq "$WANT_COMMANDS" ] && note "커맨드 $n/$WANT_COMMANDS" || bad "커맨드 $n/$WANT_COMMANDS"

n=$(find .claude/skills -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -eq "$WANT_SKILLS" ] && note "스킬 $n/$WANT_SKILLS" || bad "스킬 $n/$WANT_SKILLS"

# 스킬이 실제로 동작하는 형태인지 — SKILL.md 존재 + frontmatter 이름이 폴더명과 일치
broken=0
for d in .claude/skills/*/; do
  [ -d "$d" ] || continue
  b="$(basename "$d")"
  sf="$d/SKILL.md"
  if [ ! -f "$sf" ]; then bad "SKILL.md 없음: $b"; broken=1; continue; fi
  nm=$(grep -m1 '^name:' "$sf" 2>/dev/null | sed 's/^name:[[:space:]]*//')
  if [ -z "$nm" ]; then bad "frontmatter에 name 없음: $b"; broken=1
  elif [ "$nm" != "$b" ]; then bad "name($nm) != 폴더명($b)"; broken=1; fi
  grep -q '^description:' "$sf" || { bad "description 없음: $b"; broken=1; }
done
[ "$broken" -eq 0 ] && note "스킬 정의 정상 (SKILL.md · name · description)"

for h in self-review-gate doc-drift-reminder session-gate; do
  f=".claude/hooks/${h}.sh"
  if [ ! -f "$f" ]; then bad "훅 없음: $f"
  elif [ ! -x "$f" ]; then bad "훅 실행권한 없음: $f  (chmod +x $f)"
  else note "훅 $h"
  fi
done

if [ ! -f .claude/settings.json ]; then
  bad "settings.json 없음"
else
  for h in self-review-gate doc-drift-reminder session-gate; do
    grep -q "$h" .claude/settings.json \
      && note "settings.json → $h 연결됨" \
      || bad "settings.json이 $h 를 부르지 않음"
  done
fi

echo
[ "$FAIL" -eq 0 ] && echo "하네스 OK" || echo "하네스 실패"
exit "$FAIL"
