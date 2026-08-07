#!/usr/bin/env bash
# 문서 무게 게이트 — 쌓이기 쉬운 것만 재서 임계를 넘으면 알린다.
#
# 이 스크립트는 **재고 판정만 한다. 지우거나 옮기지 않는다.**
# 문서는 SSOT다. 스크립트가 조용히 옮기면 다음 세션이 못 찾는다.
# 처방은 출력에 적히고, 실행은 사람(또는 증거를 남기는 에이전트)이 한다.
#
# 기준값 출처 — `scripts/README.md` §기준값이 있는 곳
#   진입 문서 80줄 · 상태판 80~120줄 · 개별 300줄: jason-agent-harness-template
#     (`.claude/skills/docs-active-archive` · `docs/ops/document-management.md` · `CLAUDE.md`)
#   나머지: 2026-07-30 FR5Web 실측 (`docs/evidence/2026-07-30/doc-weight.md`)
#
# 모드
#   --daily     (기본) 싸다. 줄수·개수·행수만. 게이트가 매번 부른다
#   --weekend   전수. md5 중복 · 30일 방치 · 빈 파일 · 결론난 조사 문서까지
#
# 종료 코드 — 경고(soft)는 0, 초과(hard)는 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE=daily
case "${1:-}" in
  --weekend) MODE=weekend ;;
  --daily|"") MODE=daily ;;
  -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "모르는 인자: $1  (--daily | --weekend)"; exit 2 ;;
esac

FAIL=0
WARN=0
note() { printf '  %s\n' "$1"; }
warn() { printf '  WARN  %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

# 경고선 / 초과선
CAP_ENTRY_W=80;    CAP_ENTRY_H=110      # docs/SESSION-START.md
CAP_STATUS_W=120;  CAP_STATUS_H=160     # docs/status/PROJECT-STATUS.md
CAP_DOC_W=300;     CAP_DOC_H=450        # 개별 md 한 개
CAP_INDEX_W=45;    CAP_INDEX_H=61       # docs/INDEX.md 등재 행 (60→61: RECORD-NODE-CONTRACT SSOT 등재 · 2026-08-07)
CAP_EVID_W=8;      CAP_EVID_H=14        # docs/evidence/<날짜>/ 폴더 **하나당** 파일 수 (D37)
CAP_RND_W=5;       CAP_RND_H=8          # docs/ref/rnd/ 파일 수
CAP_TOTAL_W=9000;  CAP_TOTAL_H=13000    # **읽는** 문서 총 줄수 (evidence/·archive/ 제외 — D71)
CAP_EVTOT_W=6000;  CAP_EVTOT_H=12000    # docs/evidence/**.md 총 줄수 — 참조용이라 별도 상한
CAP_DECLOG_W=1200; CAP_DECLOG_H=99999   # DECISION-LOG 줄수는 **경고만** — 아래 참조
STALE_DAYS=30                           # weekend: 방치 판정

# DECISION-LOG 만 상한이 다르다.
# `docs/INDEX.md` 가 "archive 로 옮기지 않는다 — 결정의 역사 자체가 정본" 이라고 못 박았다.
# 그래서 "절을 잘라 이관하라" 는 일반 처방이 적용되지 않는다. 조치할 수 없는 경고는
# 소음이고, 소음이 쌓이면 경고를 무시하게 된다. (템플릿의 7일 방치 경고를 30일로 늘린 것과 같은 이유)
# 대신 **상단 목차가 실제 결정 개수와 맞는지**를 잰다 — 그게 이 문서의 진짜 불변식이다.
#
# 2026-08-04: 줄수 하드 상한(900)을 없앴다. 이 문서는 **덧붙이기 전용**이고(결정은 버리지
# 않는다) 처방("최신 N건을 CURRENT 로 분리")은 이미 적용돼 있어, 하드 실패를 푸는 유일한
# 방법이 역사를 지우는 것뿐이었다. 위 주석이 경고한 "조치할 수 없는 경고" 가 바로 그것이라
# 줄수는 경고로 낮추고, 하드 판정은 목차 대조에 맡긴다.
DECLOG=docs/status/DECISION-LOG.md

lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
gauge() { # $1=이름 $2=값 $3=경고 $4=초과 $5=처방
  if   [ "$2" -gt "$4" ]; then bad  "$1 = $2  (초과선 $4) → $5"
  elif [ "$2" -gt "$3" ]; then warn "$1 = $2  (경고선 $3) → $5"
  else note "$1 = $2  (경고선 $3)"; fi
}

echo "== 진입 비용 =="
gauge "docs/SESSION-START.md 줄수" "$(lines docs/SESSION-START.md)" \
      "$CAP_ENTRY_W" "$CAP_ENTRY_H" "라우터·지도만 남기고 본문은 ref/ 로"
gauge "docs/status/PROJECT-STATUS.md 줄수" "$(lines docs/status/PROJECT-STATUS.md)" \
      "$CAP_STATUS_W" "$CAP_STATUS_H" "완료된 것을 evidence/ 로 내리고 상태판은 얇게"
ALWAYS=$(( $(lines CLAUDE.md) + $(lines docs/SESSION-START.md) + $(lines docs/INDEX.md) ))
note "매 세션 항상 읽는 3개 합계 = ${ALWAYS}줄 (CLAUDE.md + SESSION-START + INDEX)"

echo
echo "== 개별 문서 =="
BIG=0
while IFS= read -r f; do
  [ "$f" = "$DECLOG" ] && continue          # 아래에서 따로 잰다
  n=$(lines "$f")
  [ "$n" -gt "$CAP_DOC_W" ] || continue
  BIG=$((BIG+1))
  gauge "$f" "$n" "$CAP_DOC_W" "$CAP_DOC_H" "절을 잘라 별 문서로 이관 (삭제 금지)"
done < <(find docs -name '*.md' -not -path 'docs/archive/*' | sort)
[ "$BIG" -eq 0 ] && note "${CAP_DOC_W}줄 넘는 문서 없음 (DECISION-LOG 제외 — 아래)"

echo
echo "== 결정 로그 =="
if [ -f "$DECLOG" ]; then
  gauge "$DECLOG 줄수" "$(lines "$DECLOG")" "$CAP_DECLOG_W" "$CAP_DECLOG_H" \
        "목차만으로 못 찾을 만큼 커졌다. 그때는 최신 N건을 *-CURRENT.md 로 분리한다"
  # 진짜 불변식 — 상단 목차가 결정 개수와 맞나. 안 맞으면 목차로 못 찾는다.
  H=$(grep -cE '^## D[0-9]+\.' "$DECLOG")
  T=$(grep -cE '^\| D[0-9]+ \|' "$DECLOG")
  if [ "$H" -eq "$T" ]; then
    note "결정 $H 건 · 목차 $T 행 — 일치"
  else
    bad "결정 $H 건인데 상단 목차는 $T 행이다 → 목차에 빠진 D번호를 채운다 (통독을 없애는 장치다)"
  fi
fi

echo
echo "== 개수로 쌓이는 것 =="
gauge "docs/INDEX.md 등재 행" "$(grep -cE '^\| `[^`]*\.(md|html)`' docs/INDEX.md)" \
      "$CAP_INDEX_W" "$CAP_INDEX_H" "결론난 조사 문서를 archive/ 로 (INDEX 행도 함께 줄어든다)"
# **누적 총량이 아니라 하루치를 잰다** (D37). 증거는 지우지 않는 역사라 총량은 계속 는다 —
# 총량에 상한을 걸면 게이트가 시간이 지났다는 이유로 빨개진다. 진짜 냄새는
# "하루에 열몇 개가 쌓였다" 쪽이고, 그건 한 판을 너무 잘게 쪼개 적었다는 뜻이다.
for d in docs/evidence/*/; do
  [ -d "$d" ] || continue
  # 스크린샷(.png)은 세지 않는다 — **문서에 딸린 근거지 읽을거리가 아니다.**
  # 세면 사진을 많이 붙인 성실한 기록이 벌을 받는다.
  gauge "${d} 문서" "$(find "$d" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')" \
        "$CAP_EVID_W" "$CAP_EVID_H" "한 날짜 안에서 같은 주제를 한 파일로 합친다"
done
gauge "docs/ref/rnd/ 파일" "$(find docs/ref/rnd -type f 2>/dev/null | wc -l | tr -d ' ')" \
      "$CAP_RND_W" "$CAP_RND_H" "결론이 DECISION-LOG 로 올라간 것은 archive/ 로"

echo
echo "== 총량 =="
# 총량은 **통독 대상**만 센다 — 읽기 비용을 재는 지표이기 때문이다 (D71).
# evidence/ 는 참조만 하고 archive/ 는 근거로 쓰지 않는다. 아래 html 을 빼는 것과 같은 논리다.
MD_TOTAL=$(find docs -name '*.md' -not -path 'docs/evidence/*' -not -path 'docs/archive/*' \
           -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
gauge "docs/**.md 총 줄수 (읽는 것만)" "$MD_TOTAL" "$CAP_TOTAL_W" "$CAP_TOTAL_H" "위 처방을 먼저 실행"
EV_TOTAL=$(find docs/evidence -name '*.md' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
gauge "docs/evidence/**.md 총 줄수" "$EV_TOTAL" "$CAP_EVTOT_W" "$CAP_EVTOT_H" \
      "한 날짜 안에서 같은 주제를 한 파일로 합친다"
HTML_TOTAL=$(find docs -name '*.html' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
note "docs/**.html 총 줄수 = ${HTML_TOTAL}줄 (조사·공유물 — 읽기 비용에 안 든다)"

echo
echo "== 폴더 AGENTS.md =="
# 폴더별 AGENTS.md 는 **그 폴더에서만 참인 것 3~5개** + `## 폴더` 표만 담는다 (D21·D25).
# 넘치면 이득(진입 비용 절감)이 사라지고 드리프트할 곳만 는다 → SSOT 로 옮긴다.
# 파일명이 CLAUDE.md 면 못 잡는다 — 오픈코드·Codex 는 AGENTS.md 만 읽는다 (D25).
CAP_FOLDER_MD=25
nf=0
for f in */AGENTS.md; do
  [ -f "$f" ] || continue
  nf=$((nf+1))
  n=$(lines "$f")
  gauge "$f" "$n" "$CAP_FOLDER_MD" "$((CAP_FOLDER_MD * 2))" "SSOT 로 옮긴다 — 여기는 포인터만"
done
[ "$nf" -eq 0 ] && bad "폴더 AGENTS.md 가 하나도 없다 — 이름이 CLAUDE.md 로 되돌아갔는지 본다 (D25)" \
                || note "폴더 AGENTS.md ${nf}개"

if [ "$MODE" = weekend ]; then
  echo
  echo "== 주말 점검: 같은 내용 두 번 =="
  hashof() { if command -v md5 >/dev/null 2>&1; then md5 -q "$1"; else md5sum "$1" | cut -d' ' -f1; fi; }
  DUP=0
  while IFS= read -r h; do
    [ -z "$h" ] && continue
    DUP=$((DUP+1))
    bad "내용이 같은 파일이 둘 이상 있다 → 하나만 남기고 ARCHIVE-INDEX '지운 것' 에 적는다"
    while IFS= read -r f; do [ "$(hashof "$f")" = "$h" ] && note "      $f"; done \
      < <(find docs -type f)
  done < <(find docs -type f -exec sh -c 'if command -v md5 >/dev/null 2>&1; then md5 -q "$1"; else md5sum "$1" | cut -d" " -f1; fi' _ {} \; | sort | uniq -d)
  [ "$DUP" -eq 0 ] && note "중복 없음"

  echo
  echo "== 주말 점검: ${STALE_DAYS}일 넘게 안 건드린 문서 =="
  n=0
  while IFS= read -r f; do
    n=$((n+1)); warn "$f  (${STALE_DAYS}일+ 방치) → 현행인지 확인. 아니면 archive/"
  done < <(find docs -name '*.md' -mtime "+$STALE_DAYS" -not -path 'docs/archive/*' | sort)
  [ "$n" -eq 0 ] && note "방치 문서 없음"

  echo
  echo "== 주말 점검: 빈 문서·머리만 있는 문서 =="
  n=0
  while IFS= read -r f; do
    n=$((n+1)); warn "$f  ($(lines "$f")줄) → 채우거나 지운다"
  done < <(find docs -name '*.md' -size -400c | sort)
  [ "$n" -eq 0 ] && note "빈 문서 없음"

  echo
  echo "== 주말 점검: 결론난 조사 문서 =="
  # ref/rnd/ 는 착수 전 판단 기록이다. 결론이 DECISION-LOG 로 올라갔으면 근거가 아니다.
  n=0
  for f in docs/ref/rnd/*.md; do
    [ -e "$f" ] || continue
    if head -20 "$f" | grep -qE '결론이 났다|확정본은|superseded|대체됐다'; then
      n=$((n+1)); warn "$f → 결론 배너가 있다. archive/ 이관 후보 (이름 규칙 + ARCHIVE-INDEX 등재)"
    fi
  done
  [ "$n" -eq 0 ] && note "이관 후보 없음"
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "문서 무게 초과 — 위 FAIL 을 먼저 처리한다"
elif [ "$WARN" -ne 0 ]; then
  echo "문서 무게 OK (경고 ${WARN}건 — 다음 마감 때 처리하면 된다)"
else
  echo "문서 무게 OK"
fi

# 처방은 하네스에 있다 — 지우지 말고 옮긴다
if [ "$FAIL" -ne 0 ] || [ "$WARN" -ne 0 ]; then
  echo
  echo "  처방 규칙: **삭제 금지 = 이관만.** 옮길 때는 git mv,"
  echo "  이름은 <원래이름>-<사유>-<YYYY-MM-DD>.<확장자>, ARCHIVE-INDEX.md 에 등재."
  echo "  DECISION-LOG 는 archive 로 옮기지 않는다 — 결정의 역사가 정본이다 (docs/INDEX.md)."
fi

exit "$FAIL"
