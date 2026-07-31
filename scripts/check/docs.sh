#!/usr/bin/env bash
# SSOT 문서 검증 — 있어야 할 문서가 있는지, INDEX가 전부 등재했는지, 링크가 깨졌는지.
# 실패하면 exit 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

REQUIRED=(
  CLAUDE.md
  AGENTS.md
  docs/INDEX.md
  docs/SESSION-START.md
  docs/ref/PRD.md
  docs/ref/USER-REQUIREMENTS.md
  docs/ref/FEATURE-SPEC.md
  docs/ref/ARCHITECTURE.md
  docs/ref/STACK.md
  docs/ref/API-CONTRACT.md
  docs/ref/CODING-CONVENTIONS.md
  docs/ref/MILESTONES.md
  docs/status/PROJECT-STATUS.md
  docs/status/DECISION-LOG.md
  docs/status/GAP-MATRIX.md
)

echo "== 필수 문서 =="
for f in "${REQUIRED[@]}"; do
  [ -f "$f" ] && note "$f" || bad "없음: $f"
done

echo
echo "== INDEX 등재 =="
if [ -f docs/INDEX.md ]; then
  for f in "${REQUIRED[@]}"; do
    [ "$f" = "docs/INDEX.md" ] && continue
    base="$(basename "$f")"
    grep -q "$base" docs/INDEX.md \
      && note "등재: $base" \
      || bad "INDEX.md에 없음: $base"
  done
else
  bad "docs/INDEX.md 자체가 없어 등재 검사를 못 한다"
fi

echo
echo "== docs/ 루트 쌓임 =="
# docs/ 루트에는 진입 문서 둘만 둔다. 나머지는 폴더로 간다.
ALLOWED_ROOT="INDEX.md SESSION-START.md"
for f in docs/*; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  case " $ALLOWED_ROOT " in
    *" $b "*) note "$b" ;;
    *) bad "docs/ 루트에 쌓임: $b  → ref/(SSOT) · status/(상태) · evidence/(증거) · research/(조사) · archive/(보존) 중 하나로" ;;
  esac
done

echo
echo "== 증거 날짜 폴더 =="
# evidence 는 날짜가 폴더다 — 루트에 파일을 두면 다시 평평해진다 (docs/INDEX.md §새 문서 추가 규칙).
if [ -d docs/evidence ]; then
  n=0
  for f in docs/evidence/*; do
    [ -e "$f" ] || continue
    b="$(basename "$f")"
    if [ -d "$f" ]; then
      printf '%s' "$b" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' \
        && { note "$b/ ($(find "$f" -type f | wc -l | tr -d ' ')건)"; n=$((n+1)); } \
        || bad "날짜 폴더가 아님: evidence/$b  → YYYY-MM-DD"
    else
      bad "evidence/ 루트에 파일: $b  → evidence/<YYYY-MM-DD>/<주제> 로 (날짜는 파일명에서 뺀다)"
    fi
  done
  [ "$n" -eq 0 ] && note "날짜 폴더 없음"
else
  note "docs/evidence 없음"
fi

echo
echo "== 보관 문서 이름 규칙 =="
if [ -d docs/archive ]; then
  for f in docs/archive/*; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    [ "$b" = "ARCHIVE-INDEX.md" ] && { note "$b"; continue; }
    if printf '%s' "$b" | grep -qE -- '-(superseded|abandoned|legacy|progresslog)-[0-9]{4}-[0-9]{2}-[0-9]{2}\.'; then
      grep -q "$b" docs/archive/ARCHIVE-INDEX.md \
        && note "$b" \
        || bad "ARCHIVE-INDEX.md에 없음: $b"
    else
      bad "이름 규칙 위반: $b  → <원래이름>-<사유>-<YYYY-MM-DD>.<확장자>"
    fi
  done
else
  note "docs/archive 없음"
fi

echo
echo "== Unity 유래 문서 표기 =="
# docs/ref/unity/ 안의 문서는 출처 배너가 반드시 있어야 한다.
# 없으면 Unity 기준 내용을 웹 기준으로 오인해 좌표계가 어긋난다.
if [ -d docs/ref/unity ]; then
  n=0
  for f in docs/ref/unity/*.md; do
    [ -e "$f" ] || continue
    n=$((n+1))
    base="$(basename "$f")"
    case "$base" in unity-*) ;; *) bad "파일명이 unity- 로 시작하지 않음: $base" ;; esac
    if head -5 "$f" | grep -q "출처: Unity 프로젝트"; then
      note "$base"
    else
      bad "출처 배너 없음: $base  (docs/INDEX.md §Unity 유래 문서 규약)"
    fi
  done
  [ "$n" -eq 0 ] && note "문서 없음"
else
  note "docs/ref/unity/ 없음 — 아직 가져온 것 없다"
fi

# docs/ref/unity/ 밖에 Unity 원본 경로를 인용하면서 유니티임을 안 밝힌 문서 찾기
for f in docs/ref/*.md; do
  [ -e "$f" ] || continue
  if grep -q "FR5UNITY" "$f" 2>/dev/null; then
    grep -qiE "유니티|Unity" "$f" || bad "FR5UNITY 경로를 인용하면서 유니티임을 안 밝힘: $f"
  fi
done

echo
echo "== 깨진 상대 링크 =="
broken=0
while IFS= read -r src; do
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    case "$link" in http*|\#*|mailto:*) continue ;; esac
    target="$(dirname "$src")/${link%%#*}"
    [ -e "$target" ] || { bad "$src → $link"; broken=$((broken+1)); }
  done < <(grep -oE '\]\([^)]+\)' "$src" 2>/dev/null | sed 's/^](//; s/)$//')
done < <(find . -name '*.md' -not -path './.claude/*' -not -path './node_modules/*' 2>/dev/null)
[ "$broken" -eq 0 ] && note "깨진 링크 없음"

echo
[ "$FAIL" -eq 0 ] && echo "문서 OK" || echo "문서 실패"
exit "$FAIL"
