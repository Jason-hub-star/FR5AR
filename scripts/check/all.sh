#!/usr/bin/env bash
# check/ 아래 모든 게이트를 순서대로 돌린다. 하나라도 실패하면 exit 1.
# 세션 마무리와 CI에서 이것만 부르면 된다.

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FAIL=0
for s in "$HERE"/*.sh; do
  [ "$(basename "$s")" = "all.sh" ] && continue
  echo "───────── $(basename "$s") ─────────"
  bash "$s" || FAIL=1
  echo
done

if [ "$FAIL" -eq 0 ]; then
  echo "전체 통과"
else
  echo "실패한 게이트가 있다"
fi
exit "$FAIL"
