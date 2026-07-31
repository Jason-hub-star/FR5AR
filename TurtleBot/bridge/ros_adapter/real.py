# 실기 어댑터 v1 — repo2 원본 대조 (2026-07-31, 스택가드):
#   · 브링업: dual_bringup.launch.py namespace:=tb3_1|tb3_2 — 네임스페이스 방식, 도메인 하나
#   · cmd_vel: /{ns}/cmd_vel · **TwistStamped** (Jazzy — turtlebot3_node가 stamped 구독,
#     repo2 teleop_stamped.py · patch_nav_params_ns.py enable_stamped_cmd_vel=True)
#   · 위치: /{ns}/amcl_pose (map 좌표 · Nav2 중) → 없으면 /{ns}/odom 폴백 (odom 좌표 — 드리프트)
#   · 연결 판정: odom 2초 무수신 → connected=False (TB-CONTRACT §안전 규칙)
# v1 범위: 상태·teleop·stop. SLAM/Nav2 프로세스 기동은 실기 현장에서 config 명령으로 확정한다.
import math
import threading
import time

from .base import RosAdapter

ODOM_TIMEOUT_S = 2.0


def _quat_to_deg(q):
    # z-yaw 만 필요하다 (바닥 평면 · D28 과 같은 3자유도)
    yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    return math.degrees(yaw) % 360


class RealAdapter(RosAdapter):
    def __init__(self, robot_ids, on_log):
        import rclpy                                   # 우분투에서만 성립 — 경계 안 import (D30)
        from geometry_msgs.msg import PoseWithCovarianceStamped, TwistStamped
        from nav_msgs.msg import Odometry

        self._on_log = on_log
        self._lock = threading.Lock()
        self._r = {
            rid: {
                "connected": False, "poseAgeSec": None, "mode": "idle", "nav": None,
                "pose": {"xMm": 0.0, "yMm": 0.0, "thetaDeg": 0.0},
                "velocity": {"linearMmS": 0.0, "angularDegS": 0.0},
                "batteryPct": None, "activeMap": None, "activeSlot": None,
                "activeRunId": None, "owner": None,
                "_odom_at": 0.0, "_amcl_at": 0.0, "_trail": [],
                "_teleop_at": 0.0, "_teleop_active": False,
            }
            for rid in robot_ids
        }

        rclpy.init()
        self._node = rclpy.create_node("tb_bridge")
        self._TwistStamped = TwistStamped
        self._pubs = {}
        for rid in robot_ids:
            self._pubs[rid] = self._node.create_publisher(TwistStamped, f"/{rid}/cmd_vel", 10)
            self._node.create_subscription(Odometry, f"/{rid}/odom",
                                           lambda m, rid=rid: self._on_odom(rid, m), 10)
            self._node.create_subscription(PoseWithCovarianceStamped, f"/{rid}/amcl_pose",
                                           lambda m, rid=rid: self._on_amcl(rid, m), 10)

        threading.Thread(target=lambda: rclpy.spin(self._node), daemon=True).start()
        threading.Thread(target=self._watch, daemon=True).start()
        on_log("-", "bridge", "info", f"real 어댑터 기동 — robots={robot_ids} (네임스페이스 방식)")

    # ── 콜백 — m·rad 는 여기서만 mm·도로 바뀐다 ────────────────────────────
    def _on_odom(self, rid, m):
        with self._lock:
            r = self._r[rid]
            r["_odom_at"] = time.time()
            r["velocity"] = {
                "linearMmS": m.twist.twist.linear.x * 1000.0,
                "angularDegS": math.degrees(m.twist.twist.angular.z),
            }
            if time.time() - r["_amcl_at"] > 3.0:      # amcl 이 살아있으면 그쪽이 정본
                self._set_pose(r, m.pose.pose)

    def _on_amcl(self, rid, m):
        with self._lock:
            r = self._r[rid]
            r["_amcl_at"] = time.time()
            self._set_pose(r, m.pose.pose)

    def _set_pose(self, r, pose):
        r["pose"] = {
            "xMm": pose.position.x * 1000.0,
            "yMm": pose.position.y * 1000.0,
            "thetaDeg": _quat_to_deg(pose.orientation),
        }
        if abs(r["velocity"]["linearMmS"]) > 5:
            r["_trail"].append((r["pose"]["xMm"], r["pose"]["yMm"]))
            if len(r["_trail"]) > 2000:
                r["_trail"].pop(0)

    def _watch(self):
        # 워치독 두 겹 — ① teleop 500ms 무신호 → 정지 (mock 은 시뮬 루프가 했지만
        # 실기는 마지막 cmd_vel 로 계속 구른다 — 어댑터가 반드시 세운다, §안전 규칙)
        # ② odom 2s 무수신 → 연결 손실 판정
        while True:
            stops = []
            with self._lock:
                for rid, r in self._r.items():
                    if r["_teleop_active"] and time.time() - r["_teleop_at"] > 0.5:
                        r["_teleop_active"] = False
                        if r["mode"] == "teleop":
                            r["mode"] = "idle"
                        stops.append((rid, "teleop watchdog 500ms — 정지"))
                    age = time.time() - r["_odom_at"] if r["_odom_at"] else None
                    was = r["connected"]
                    r["connected"] = age is not None and age < ODOM_TIMEOUT_S
                    r["poseAgeSec"] = round(age, 1) if age is not None else None
                    if was and not r["connected"]:
                        stops.append((rid, "odom 2s 무수신 — 연결 손실 판정, cmd_vel 0"))
            for rid, why in stops:
                self._on_log(rid, "bridge", "warn", why)
                self._publish_stop(rid)
            time.sleep(0.1)

    # ── 명령 ────────────────────────────────────────────────────────────────
    def _publish(self, rid, linear_mm_s, angular_deg_s):
        msg = self._TwistStamped()
        msg.header.stamp = self._node.get_clock().now().to_msg()
        msg.twist.linear.x = linear_mm_s / 1000.0      # mm/s → m/s (경계 변환)
        msg.twist.angular.z = math.radians(angular_deg_s)
        self._pubs[rid].publish(msg)

    def _publish_stop(self, rid):
        self._publish(rid, 0.0, 0.0)

    def set_velocity(self, robot, linear_mm_s, angular_deg_s):
        with self._lock:
            r = self._r[robot]
            if r["mode"] == "idle":
                r["mode"] = "teleop"
            r["_teleop_at"] = time.time()
            r["_teleop_active"] = bool(linear_mm_s or angular_deg_s)
        self._publish(robot, linear_mm_s, angular_deg_s)

    def stop(self, robot):
        self._publish_stop(robot)
        with self._lock:
            r = self._r[robot]
            r["mode"] = "idle"
            r["activeSlot"] = None
            r["_teleop_active"] = False

    def set_mode(self, robot, mode):
        with self._lock:
            self._r[robot]["mode"] = mode

    def set_active_map(self, robot, map_name):
        with self._lock:
            self._r[robot]["activeMap"] = map_name

    def robots(self):
        with self._lock:
            return {
                rid: {k: (dict(v) if isinstance(v, dict) else v) for k, v in r.items() if not k.startswith("_")}
                for rid, r in self._r.items()
            }

    def patch(self, robot, **fields):
        with self._lock:
            self._r[robot].update(fields)

    def trail(self, robot):
        with self._lock:
            return list(self._r[robot]["_trail"])
