#!/usr/bin/env bash
# 우분투 PC 1회 설치 — tb-bridge 의존성. ROS 2 Jazzy 는 이미 있다고 가정 (repo2 전제).
# 노드/npm 은 필요 없다 — 웹은 맥에서 빌드해 dist/ 로 온다 (rsync 또는 git).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== python 의존성 (venv) =="
# --system-site-packages 가 필수다 (2026-08-06 실기). rclpy 는 PYTHONPATH 로 오지만
# 그 안의 메시지 패키지(geometry_msgs 등)가 **시스템 numpy 를 import** 한다 — 깨끗한 venv 면
# 설치 검사는 통과하고 **real 어댑터가 뜨는 순간에만** ModuleNotFoundError 로 죽는다.
# 2026-08-03 에 실제로 돌던 venv 도 이 플래그로 만들어져 있었다.
python3 -m venv --system-site-packages TurtleBot/bridge/.venv
TurtleBot/bridge/.venv/bin/pip install -q -r TurtleBot/bridge/requirements.txt
echo "== 확인 =="
TurtleBot/bridge/.venv/bin/python -c "import fastapi, uvicorn, yaml; print('bridge 의존성 OK')"
python3 -c "import rclpy; print('rclpy OK')" 2>/dev/null \
  || echo "경고: rclpy 가 이 파이썬에서 안 보인다 — 'source /opt/ros/jazzy/setup.bash' 후 tb-run.sh 를 쓰면 된다"
echo "설치 끝. 실행: bash scripts/robot/tb-run.sh"
