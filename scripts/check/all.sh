#!/usr/bin/env bash
# check/ 아래 모든 게이트를 순서대로 돌린다. 하나라도 실패하면 exit 1.
# 세션 마무리와 CI에서 이것만 부르면 된다.

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FAIL=0
# check/ 의 게이트 + 카테고리 폴더가 스스로 내놓은 게이트(`scripts/*/check-*.sh`).
# 후자가 없으면 도메인 게이트를 사람이 손으로 불러야 해서 결국 안 돈다.
for s in "$HERE"/*.sh "$HERE"/../*/check-*.sh; do
  [ -f "$s" ] || continue
  [ "$(basename "$s")" = "all.sh" ] && continue
  echo "───────── $(basename "$(dirname "$s")")/$(basename "$s") ─────────"
  bash "$s" || FAIL=1
  echo
done

if [ "$FAIL" -eq 0 ]; then
  echo "전체 통과"
else
  echo "실패한 게이트가 있다"
fi
exit "$FAIL"
