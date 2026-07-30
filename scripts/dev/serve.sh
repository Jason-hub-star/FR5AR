#!/usr/bin/env bash
# web/ 을 로컬에서 띄운다. 기본 8000, 인자로 포트 바꿀 수 있다.
#   bash scripts/dev/serve.sh 8080
# 주의 — 폰에서 카메라를 쓰려면 이걸로는 안 된다. HTTPS가 필요하다 (docs/ref/STACK.md §함정).

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORT="${1:-8000}"

if [ ! -d web ]; then
  echo "FAIL  web/ 폴더가 없다. 아직 화면 코드를 안 만들었다."
  exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || echo "")

echo "PC        http://localhost:$PORT"
[ -n "$IP" ] && echo "같은 망   http://$IP:$PORT   (폰 카메라는 이 주소로 안 된다 — HTTPS 필요)"
echo "중지      Ctrl+C"
echo

exec python3 -m http.server "$PORT" -d web
