#!/usr/bin/env bash
# 우분투 PC 실행 — real 어댑터로 tb-bridge 기동. 팀원은 http://<이 PC>:5055 를 연다.
# 전제: ① tb-setup.sh 1회 완료 ② 로봇 bringup 이 돌고 있다
#       (로봇에서: ros2 launch urhynix_nav dual_bringup.launch.py namespace:=tb3_1 — repo2)
set -euo pipefail
cd "$(dirname "$0")/../../TurtleBot/bridge"

# rclpy 는 ROS 환경에서 온다 — venv 는 --system-site-packages 가 아니므로 PYTHONPATH 로 잇는다
if [ -f /opt/ros/jazzy/setup.bash ]; then
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
fi

export TB_ADAPTER=real
exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 5055
