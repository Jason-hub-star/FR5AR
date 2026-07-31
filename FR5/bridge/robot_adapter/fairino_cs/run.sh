#!/usr/bin/env bash
# fairino-cs 실행 — build.sh 가 기록한 Mono 로 돌린다. FAIRINO_DLL 필수.
set -euo pipefail
cd "$(dirname "$0")"
[ -f bin/mono-home.txt ] || { echo "먼저 build.sh 를 돌려라" >&2; exit 1; }
MONO_HOME="$(cat bin/mono-home.txt)"
exec "$MONO_HOME/bin/mono" bin/fairino-cs.exe
