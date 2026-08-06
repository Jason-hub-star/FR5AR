#!/usr/bin/env bash
# 기준값 드리프트 검사 — scripts/README.md의 기준값 표와 실제 스크립트 상수가 맞는지.
# 오늘(2026-07-29~30) 이 불일치로 게이트가 여러 번 거짓 실패했다. 그걸 막는 게이트다.
# 실패 시 exit 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

R=scripts/README.md

# 실제 상수 → README 표에 같은 숫자가 있는지
chk() {  # $1=설명 $2=실제값 $3=README에서 찾을 정규식
  if grep -qE "$3" "$R"; then note "$1 = $2"
  else bad "$1 = $2 인데 README 기준값 표와 다르다 (표를 고쳐라)"; fi
}

C=$(grep -m1 '^WANT_COMMANDS=' scripts/check/harness.sh | cut -d= -f2)
S=$(grep -m1 '^WANT_SKILLS='   scripts/check/harness.sh | cut -d= -f2)
chk "커맨드/스킬" "$C / $S" "\| $C / $S \|"

A=$(grep -m1 '^WANT_ARM_TRIS='  scripts/check/assets.sh | cut -d= -f2)
G=$(grep -m1 '^WANT_GRIP_TRIS=' scripts/check/assets.sh | cut -d= -f2)
chk "삼각형 팔/그리퍼" "$A / $G" "$A / $G"

# docs.sh의 REQUIRED 개수
REQN=$(awk '/^REQUIRED=\(/,/^\)/' scripts/check/docs.sh | grep -cE '^[[:space:]]+[a-zA-Z]')
if grep -q "REQUIRED\` 배열 | ${REQN}개" "$R"; then
  note "필수 문서 = ${REQN}개"
else
  bad "필수 문서 = ${REQN}개 인데 README 기준값 표와 다르다 (표를 고쳐라)"
fi

# INDEX 자가검증 숫자 ↔ 실제 행 수
IDX=$(grep -cE '^\| `[^`]*\.(md|html)`' docs/INDEX.md)
DEC=$(grep -oE '문서 행 개수 = [0-9]+' docs/INDEX.md | grep -oE '[0-9]+' | head -1)
if [ "$IDX" = "$DEC" ]; then note "INDEX 등재 $IDX = 자가검증 $DEC"
else bad "INDEX 실제 ${IDX}행인데 자가검증엔 ${DEC} (docs/INDEX.md §자가검증을 고쳐라)"; fi

echo
echo "== .env ↔ 생성된 설정 =="
# Shared/data/config/*.json 은 .env 에서 생성된 산출물이다. 손으로 고치면 다음 생성에서 사라진다.
if command -v node >/dev/null 2>&1; then
  if out="$(node "$ROOT/scripts/build/config.mjs" --check 2>&1)"; then
    printf '%s\n' "$out"
  else
    printf '%s\n' "$out"
    bad ".env 와 Shared/data/config/*.json 이 다르다 → node scripts/build/config.mjs"
  fi
else
  note "node 없음 — 대조를 건너뛴다"
fi

echo
echo "== 브리지 라우트 ↔ vite dev 프록시 =="
# 손으로 미러링하는 목록이라 라우트를 늘리고 vite.config.js 를 안 고치면 **dev 에서만** 조용히
# 404 가 난다. 브리지는 200 인데 화면만 거부한다 — 2026-08-05 `/trajectories`,
# 2026-08-06 `/slots` 로 두 번 겪었다. 세 번째는 이 게이트가 받는다.
if command -v python3 >/dev/null 2>&1; then
  miss="$(python3 - "$ROOT" <<'PY'
import re, sys
from pathlib import Path
root = Path(sys.argv[1])
routes = {"/" + m.group(1) for m in re.finditer(
    r'@app\.(?:get|post|put|delete|websocket)\("/([^/"{]+)', (root / "FR5/bridge/main.py").read_text())}
proxied = set(re.search(r"const API_PATHS = \[(.*?)\]",
    (root / "FR5/vite.config.js").read_text(), re.S).group(1).replace("'", "").replace("\n", "").split(","))
proxied = {p.strip() for p in proxied if p.strip()} | {"/ws"}
print(" ".join(sorted(routes - proxied)))
PY
)"
  if [ -z "$miss" ]; then note "브리지 라우트가 전부 프록시된다"
  else bad "vite dev 프록시에 없는 라우트: $miss  (FR5/vite.config.js 의 API_PATHS 에 더해라)"; fi
else
  note "python3 없음 — 대조를 건너뛴다"
fi

echo
[ "$FAIL" -eq 0 ] && echo "기준값 OK" || echo "기준값 불일치"
exit "$FAIL"
