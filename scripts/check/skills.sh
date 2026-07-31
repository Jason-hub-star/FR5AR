#!/usr/bin/env bash
# 슬래시 명령 스모크테스트 — 부르기 전에 "부를 수 있는 상태인가" 를 잰다.
#
# 실제로 실행해서 확인할 수는 없다 (스킬은 파일을 고친다). 그래서 **정적으로** 잰다:
# 이름이 폴더명과 맞나 · 한글로 불릴 수 있나 · 참조 파일이 실제로 있나 ·
# 흡수해서 없앤 옛 이름이 어디 남아 있지 않나.
#
# 슬래시 명령명은 `.claude/skills/<폴더명>` 이 결정한다 (~/.claude/commands.md).
# 그래서 **폴더명이 한글이어야 `/한글` 로 불린다.**
#
# 실패 시 exit 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }
warn() { printf '  WARN  %s\n' "$1"; }

# 전역 규약이 이름·역할을 고정한 메타 5개 (~/.claude/commands.md)
META="상태 다음 진단 마감 명령어"

# 흡수해서 없앤 이름들 — 문서·스크립트에 남아 있으면 부를 수 없는 명령을 안내하는 셈이다
GONE="gap-find tiered-review socratic-review parallel-qa headless-cdp-verify big-task
change-impact-map task-intake-router thin-doc-update session-retro design-to-code
project-planning bootstrap-project doc-update evidence-review handoff impact-map
intake profile-recommend self-review"

echo "== 메타 5개 (전역 고정) =="
for m in $META; do
  [ -d ".claude/skills/$m" ] && note "/$m" || bad "메타 명령 없음: /$m  (~/.claude/commands.md 가 이름·역할을 고정한다)"
done

echo
echo "== 한글로 부를 수 있나 =="
NONKO=0
for d in .claude/skills/*/; do
  b="$(basename "$d")"
  # 폴더명에 ASCII 문자가 있으면 /한글 로 못 부른다
  if printf '%s' "$b" | LC_ALL=C grep -q '[A-Za-z]'; then
    NONKO=$((NONKO+1)); bad "폴더명이 한글이 아니다: $b  → /$b 로만 불린다"
  fi
done
[ "$NONKO" -eq 0 ] && note "전부 한글 폴더명 — /한글 로 불린다"

echo
echo "== frontmatter =="
for d in .claude/skills/*/; do
  b="$(basename "$d")"; sf="$d/SKILL.md"
  [ -f "$sf" ] || { bad "SKILL.md 없음: $b"; continue; }
  # frontmatter 는 반드시 1행부터
  head -1 "$sf" | grep -q '^---$' || bad "$b: 1행이 --- 가 아니다 (frontmatter 는 첫 줄부터)"
  nm=$(grep -m1 '^name:' "$sf" | sed 's/^name:[[:space:]]*//')
  [ "$nm" = "$b" ] || bad "$b: name($nm) != 폴더명"
  grep -q '^description:' "$sf" || bad "$b: description 없음"
  grep -q '^user_invocable: *true' "$sf" || warn "$b: user_invocable 이 true 가 아니다 — 손으로 못 부른다"
done
note "검사한 스킬 $(find .claude/skills -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')개"

# frontmatter 가 **YAML 로 실제 파싱되나.** grep 검사만으로는 못 잡는다 —
# 값이 따옴표로 시작하면(`trigger: "감사" 요청 ...`) YAML 이 통째로 깨지고,
# 그러면 스킬 설명이 하네스에 안 실려 부를 수 없다. 실제로 겪었다.
if command -v python3 >/dev/null 2>&1; then
  out=$(python3 - <<'PYEOF' 2>/dev/null
import glob, sys
try: import yaml
except ImportError: print("SKIP"); sys.exit(0)
for f in sorted(glob.glob('.claude/skills/*/SKILL.md')):
    t = open(f).read()
    if not t.startswith('---\n'): print("BAD", f, "frontmatter 시작 아님"); continue
    try:
        d = yaml.safe_load(t.split('---\n', 2)[1])
        assert isinstance(d, dict), "매핑이 아니다"
        for k in ('name', 'description'):
            assert d.get(k), f"{k} 없음/빈값"
    except Exception as e:
        print("BAD", f, str(e).split('\n')[0])
PYEOF
)
  if [ "$out" = "SKIP" ]; then warn "pyyaml 없음 — YAML 파싱 검사를 건너뛴다"
  elif [ -n "$out" ]; then printf '%s\n' "$out" | while IFS= read -r l; do bad "YAML 파싱 실패 — ${l#BAD }"; done; FAIL=1
  else note "frontmatter 가 YAML 로 정상 파싱된다"; fi
fi

echo
echo "== references 참조가 실재하나 =="
miss=0
for d in .claude/skills/*/; do
  b="$(basename "$d")"
  # SKILL.md 가 `references/...` 를 가리키면 그 파일이 있어야 한다
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    [ -e "$d/$ref" ] || { bad "$b → $ref 가 없다"; miss=1; }
  done < <(grep -ohE 'references/[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣ._/-]+\.(md|mjs|js|py|json)' "$d/SKILL.md" 2>/dev/null | sort -u)
done
[ "$miss" -eq 0 ] && note "깨진 references 참조 없음"

echo
echo "== 고아 references (아무도 안 가리킴) =="
orph=0
for d in .claude/skills/*/; do
  b="$(basename "$d")"
  [ -d "$d/references" ] || continue
  for f in "$d"/references/*; do
    [ -f "$f" ] || continue
    rel="references/$(basename "$f")"
    grep -qF "$rel" "$d/SKILL.md" 2>/dev/null || { warn "$b: $rel 을 SKILL.md 가 가리키지 않는다"; orph=$((orph+1)); }
  done
done
[ "$orph" -eq 0 ] && note "고아 없음"

echo
echo "== 없앤 이름을 부르라고 한 곳이 있나 =="
# **"부를 수 있는 형태"만 잡는다** — `/이름` 또는 백틱으로 감싼 이름.
# 산문 속 같은 단어(예: "task intake")나 훅 이름(`self-review-gate`),
# OpenCode 에이전트(`--agent handoff`)는 부르는 게 아니라서 오탐이다.
# 흡수 기록(DECISION-LOG·evidence)은 역사이므로 제외한다.
left=0
for g in $GONE; do
  hits=$(grep -rInE --exclude-dir=.git -- "(/${g}([^A-Za-z0-9/_-]|\$)|\`${g}\`)" \
           .claude/skills docs scripts CLAUDE.md AGENTS.md README.md 2>/dev/null \
         | grep -v '^scripts/check/skills.sh:' \
         | grep -v '^docs/status/DECISION-LOG.md:' \
         | grep -v '/evidence/' \
         | grep -v 'self-review-gate' \
         | grep -v -- '--agent handoff' || true)
  if [ -n "$hits" ]; then
    left=$((left+1))
    bad "'$g' 를 부르라고 적힌 곳이 있다 → 그 명령은 없다"
    printf '%s\n' "$hits" | cut -c1-140 | sed 's/^/        /'
  fi
done
[ "$left" -eq 0 ] && note "없앤 이름을 부르는 곳 0건"

echo
[ "$FAIL" -eq 0 ] && echo "스킬 OK" || echo "스킬 실패"
exit "$FAIL"
