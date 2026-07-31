#!/usr/bin/env bash
# 웹 자산 무결성 검증 — 유니티에서 가져온 URDF·메시가 온전한지.
# 삼각형 수까지 확인한다. 파일만 있고 내용이 바뀌면 3D가 조용히 깨지기 때문이다.
# 실패하면 exit 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }

ARM=Shared/assets/FAIRINO_FR5
GRIP=Shared/assets/PGEA_100_40

# 기준값 — 2026-07-29 유니티 원본 실측. 원본이 바뀌면 여기도 같이 고친다.
WANT_ARM_TRIS=58482
WANT_GRIP_TRIS=70102

echo "== 팔 =="
[ -f "$ARM/fairino5_v6.urdf" ] && note "URDF" || bad "없음: $ARM/fairino5_v6.urdf"

n=$(find "$ARM/meshes" -maxdepth 1 -iname '*.stl' 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -eq 7 ] && note "메시 $n/7" || bad "메시 $n/7"

# URDF가 참조하는 메시가 실제로 있는지
if [ -f "$ARM/fairino5_v6.urdf" ]; then
  miss=0
  while IFS= read -r m; do
    [ -f "$ARM/$m" ] || { bad "URDF가 참조하는 메시 없음: $m"; miss=1; }
  done < <(grep -oE 'filename="[^"]+"' "$ARM/fairino5_v6.urdf" | sed 's/filename="//; s/"$//' | sort -u)
  [ "$miss" -eq 0 ] && note "URDF 참조 메시 전부 존재"
fi

echo
echo "== 그리퍼 =="
for f in PGEA-100-40_body PGEA-100-40_finger_left PGEA-100-40_finger_right; do
  [ -f "$GRIP/$f.stl" ] && note "$f" || bad "없음: $GRIP/$f.stl"
done

echo
echo "== 삼각형 수 =="
count_tris() {
  python3 - "$1" <<'PY'
import struct, sys, glob, os
total = 0
for path in sorted(glob.glob(os.path.join(sys.argv[1], '**', '*.[sS][tT][lL]'), recursive=True)):
    with open(path, 'rb') as f:
        if f.read(5) == b'solid':
            f.seek(0)
            total += f.read().count(b'facet normal')
        else:
            f.seek(80)
            total += struct.unpack('<I', f.read(4))[0]
print(total)
PY
}

a=$(count_tris "$ARM" 2>/dev/null || echo 0)
g=$(count_tris "$GRIP" 2>/dev/null || echo 0)
[ "$a" = "$WANT_ARM_TRIS" ]  && note "팔 $a" || bad "팔 $a (기대 $WANT_ARM_TRIS)"
[ "$g" = "$WANT_GRIP_TRIS" ] && note "그리퍼 $g" || bad "그리퍼 $g (기대 $WANT_GRIP_TRIS)"

echo
echo "== 유니티 부산물 혼입 =="
n=$(find Shared/assets \( -name '*.meta' -o -name '*.asset' -o -name '*.prefab' \) 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -eq 0 ] && note "없음" || bad "$n개 섞임 — scripts/assets/sync-from-unity.sh 로 다시 받아라"

echo
[ "$FAIL" -eq 0 ] && echo "자산 OK" || echo "자산 실패"
exit "$FAIL"
