#!/usr/bin/env bash
# 터틀봇 배포 — 맥에서 빌드해 우분투 브리지 호스트로 밀어 넣고 tb-bridge 를 다시 띄운다.
# 호스트·포트의 정본: docs/status/PROJECT-STATUS.md §터틀봇 트랙 · TurtleBot/bridge/config.yaml.
#
# FR5 배포(`fr5-ubuntu.sh`)와 **같은 트리**(`~/FR5Web/`)에 산다. 2026-08-06 에 손으로 rsync 하다
# 세 번 넘어졌고, 그 셋을 여기 굳혀 둔다 (D80 · evidence/2026-08-06/tb-connect-check.md):
#   ① `--delete` 를 안 쓴다 — 호스트의 `.venv` 와 맵·주행기록을 지우면 되살릴 길이 없다
#   ② `data/` 를 안 보낸다 — 맥의 mock 실험 기록이 실기 기록에 섞인다
#   ③ FR5 브리지(5055)는 건드리지 않는다 — 죽이는 대상은 **우리 포트를 쥔 프로세스뿐**이다
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${TB_HOST:-ej@192.168.30.240}
IP=${HOST#*@}
PORT=$(sed -n 's/^port:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' TurtleBot/bridge/config.yaml)
[ -n "$PORT" ] || { echo "config.yaml 에 port 가 없다"; exit 1; }

npm run build:tb
rsync -az --exclude node_modules --exclude .venv --exclude 'bridge/data' \
  TurtleBot/ "$HOST":~/FR5Web/TurtleBot/
rsync -az scripts/robot/ "$HOST":~/FR5Web/scripts/robot/

# 의존성은 매번 맞춘다 — requirements 가 바뀐 채로 옛 venv 를 쓰면 **뜨긴 뜨고 WS 만 죽는다**
ssh "$HOST" "cd ~/FR5Web && [ -x TurtleBot/bridge/.venv/bin/pip ] || bash scripts/robot/tb-setup.sh"
ssh "$HOST" "cd ~/FR5Web && TurtleBot/bridge/.venv/bin/pip install -q -r TurtleBot/bridge/requirements.txt"

# **systemd 가 띄운다.** `ssh host "... &"` 로 데몬을 만드는 길은 2026-08-06 에 세 가지로
# 넘어졌다 — ssh 가 먼저 끊겨 exec 전에 죽고(로그조차 안 생긴다), 붙잡으면 채널이 안 닫혀
# 배포가 몇 분 매달리고, pkill 패턴이 **원격 셸 자신의 명령줄**에 걸려 스스로를 죽였다.
# FR5 가 systemd 인 이유와 같은 자리다. 유닛이 없으면 여기서 한 번 만든다.
ssh "$HOST" "cd ~/FR5Web && [ -f ~/.config/systemd/user/tb-bridge.service ] || bash scripts/robot/tb-service.sh"
ssh "$HOST" 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart tb-bridge'

for i in $(seq 1 20); do
  curl -sf -m 2 "http://$IP:$PORT/api/slots" >/dev/null && break
  sleep 1
  [ "$i" = 20 ] && { echo "안 떴다 — ssh $HOST 'tail -30 /tmp/tb-bridge.log'"; exit 1; }
done
echo "배포 OK — http://$IP:$PORT  (FR5 는 5055 그대로)"
echo "실렌더 확인: node scripts/check/tb-real-verify.mjs"
