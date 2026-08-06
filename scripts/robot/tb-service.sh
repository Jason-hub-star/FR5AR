#!/usr/bin/env bash
# 우분투 PC 1회 등록 — tb-bridge 를 systemd --user 서비스로 올린다 (FR5 와 같은 방식).
#
# 왜 systemd 인가 (2026-08-06): `ssh host "... &"` 로 띄우는 길은 **매달리거나 조용히 죽는다** —
# 채널이 안 닫혀 배포 스크립트가 몇 분씩 서 있거나, ssh 가 먼저 끊겨 exec 전에 같이 죽었다.
# GAP-MATRIX 의 "tb-bridge 감시 없음(FR5 는 systemd)" 도 같은 자리를 가리키고 있었다.
# 포트는 `config.yaml` 이 정본이라 유닛에 박지 않고 tb-run.sh 를 그대로 실행한다.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
UNIT=~/.config/systemd/user/tb-bridge.service

mkdir -p ~/.config/systemd/user
cat > "$UNIT" <<EOF
[Unit]
Description=tb-bridge (TurtleBot 관제 · FastAPI + web serving)

[Service]
WorkingDirectory=$ROOT
ExecStart=/bin/bash $ROOT/scripts/robot/tb-run.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload
systemctl --user enable --now tb-bridge
sleep 3
systemctl --user --no-pager status tb-bridge | head -5
echo "등록 끝. 재시작은 systemctl --user restart tb-bridge"
