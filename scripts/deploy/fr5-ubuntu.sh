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
# 거부되면 **사유를 그대로 보여준다.** 원인을 추측해 적으면 사람이 엉뚱한 데를 본다 —
# 2026-08-05 에 "랜선·전원 확인" 이 그래서 오판을 만들었다 (진짜 원인은 죽은 소켓이었다).
RESP=$(curl -s -m 8 -X POST "http://$IP:5055/connect" -H 'Content-Type: application/json' \
  -d '{"robotId":"fr5-lab-a","observeOnly":true}' || true)
case "$RESP" in
  *'"ok":true'*) echo "로봇 재연결 OK (OBSERVE_ONLY)" ;;
  *) echo "(로봇 재연결 실패 — 웹은 살아 있다)"
     echo "  브리지 응답: $RESP"
     echo "  ① 브리지 재시작 후 한 번 더: ssh $HOST 'export XDG_RUNTIME_DIR=/run/user/\$(id -u); systemctl --user restart fr5-bridge'"
     echo "  ② 그래도 안 되면 선·전원: ssh $HOST 'ping -c 2 192.168.58.2; ip -brief addr show enp3s0'" ;;
esac
echo
echo "배포 OK — http://$IP:5055"
