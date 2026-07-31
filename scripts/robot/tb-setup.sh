#!/usr/bin/env bash
# 우분투 PC 1회 설치 — tb-bridge 의존성. ROS 2 Jazzy 는 이미 있다고 가정 (repo2 전제).
# 노드/npm 은 필요 없다 — 웹은 맥에서 빌드해 dist/ 로 온다 (rsync 또는 git).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== python 의존성 (venv) =="
python3 -m venv TurtleBot/bridge/.venv
TurtleBot/bridge/.venv/bin/pip install -q -r TurtleBot/bridge/requirements.txt
echo "== 확인 =="
TurtleBot/bridge/.venv/bin/python -c "import fastapi, uvicorn, yaml; print('bridge 의존성 OK')"
python3 -c "import rclpy; print('rclpy OK')" 2>/dev/null \
  || echo "경고: rclpy 가 이 파이썬에서 안 보인다 — 'source /opt/ros/jazzy/setup.bash' 후 tb-run.sh 를 쓰면 된다"
echo "설치 끝. 실행: bash scripts/robot/tb-run.sh"
