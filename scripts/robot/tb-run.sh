#!/usr/bin/env bash
# 우분투 PC 실행 — real 어댑터로 tb-bridge 기동. 팀원이 여는 주소는 http://<이 PC>:<config.yaml 의 port>.
# 포트는 5056 — 같은 PC 의 5055 는 FR5 브리지가 쓴다 (D80).
# 전제: ① tb-setup.sh 1회 완료 ② 로봇 bringup 이 돌고 있다
#       (로봇에서: ros2 launch urhynix_nav dual_bringup.launch.py namespace:=tb3_1 — repo2)
set -euo pipefail
cd "$(dirname "$0")/../../TurtleBot/bridge"

# rclpy 는 ROS 환경에서 온다 — venv 는 --system-site-packages 가 아니므로 PYTHONPATH 로 잇는다.
# ROS 의 setup.bash 는 `AMENT_TRACE_SETUP_FILES` 를 검사만 하고 안 만든다 — `set -u` 아래서
# 그 줄이 곧바로 죽는다(2026-08-06 실기). 남의 스크립트를 우리 엄격 모드에 태우지 않는다.
if [ -f /opt/ros/jazzy/setup.bash ]; then
  set +u
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
  set -u
fi

# 포트 정본은 config.yaml 하나다 (D80) — 파서를 들이지 않고 그 한 줄만 읽는다
PORT=$(sed -n 's/^port:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' config.yaml)
[ -n "$PORT" ] || { echo "config.yaml 에 port 가 없다"; exit 1; }

export TB_ADAPTER=real
exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
