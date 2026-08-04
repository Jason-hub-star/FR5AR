#!/usr/bin/env bash
# FR5 배포 — 맥에서 빌드해 우분투 브리지 호스트로 밀어 넣고 서비스를 재시작한다.
# 호스트 구조·주소의 정본: docs/status/PROJECT-STATUS.md §FR5 트랙 (2026-08-03 호스트 이사).
# 재시작하면 로봇 세션이 끊긴다 — 끝에서 observe-only 재연결까지 해 준다.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${FR5_HOST:-ej@192.168.30.240}
IP=${HOST#*@}

npm run build:fr5
rsync -az --delete --exclude node_modules --exclude .claude ./ "$HOST":~/FR5Web/
ssh "$HOST" 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart fr5-bridge'
for i in $(seq 1 20); do
  curl -sf -m 2 "http://$IP:5055/robots" >/dev/null && break
  sleep 1
  [ "$i" = 20 ] && { echo "브리지가 안 뜬다 — ssh $HOST 'journalctl --user -u fr5-bridge -n 30'"; exit 1; }
done
curl -sf -m 5 -X POST "http://$IP:5055/connect" -H 'Content-Type: application/json' \
  -d '{"robotId":"fr5-lab-a","observeOnly":true}' || echo "(로봇 재연결 실패 — 랜선·전원 확인. 웹은 살아 있다)"
echo
echo "배포 OK — http://$IP:5055"
