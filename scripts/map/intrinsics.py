#!/usr/bin/env python3
"""ChArUco 사진 → 카메라 **내부 파라미터**(화각·주점·왜곡).

`Shared/data/config/global-cam.json` 의 `intrinsics` 를 쓴다.
**입력이 나쁘면 쓰지 않고 멈춘다** (build/ 규약) — 나쁜 캘리브레이션은 없는 것보다 해롭다.
겹친 3D 가 미묘하게 어긋나는데 원인을 카메라가 아니라 좌표계에서 찾게 만든다.

보드 제원은 `Shared/assets/tag/tags.json` 에서 읽는다. 여기 숫자를 다시 적지 않는다.
길이 단위는 **밀리미터** (하드 룰 5).

    python3 scripts/map/capture.py charuco        # 먼저 15~20 장
    python3 scripts/map/intrinsics.py
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "Shared/assets/tag/tags.json"
CONF = ROOT / "Shared/data/config/global-cam.json"

MIN_SHOTS = 8       # 이보다 적으면 왜곡 계수가 안 풀린다
MAX_RMS = 0.5       # 재투영 오차 상한 (px)
MIN_CORNERS = 8     # 한 장에서 이만큼 못 찾으면 그 장은 버린다


def load_board():
    s = json.loads(SPEC.read_text(encoding="utf-8"))
    c = s["charuco"]
    dic = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, s["family"]))
    board = cv2.aruco.CharucoBoard((c["cols"], c["rows"]), c["squareMm"], c["markerMm"], dic)
    return board, c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default="calib-shots/charuco", help="ChArUco 사진 폴더")
    a = ap.parse_args()

    if not SPEC.exists():
        print(f"{SPEC.relative_to(ROOT)} 가 없다 — 먼저 make-tags.py 를 돌려라", file=sys.stderr)
        return 1
    board, spec = load_board()
    det = cv2.aruco.CharucoDetector(board)

    files = sorted((ROOT / a.shots).glob("*.png")) + sorted((ROOT / a.shots).glob("*.jpg"))
    if not files:
        print(f"{a.shots}/ 에 사진이 없다 — scripts/map/capture.py charuco", file=sys.stderr)
        return 1

    obj_pts, img_pts, size, used = [], [], None, []
    for f in files:
        g = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
        if g is None:
            continue
        if size is None:
            size = (g.shape[1], g.shape[0])
        elif (g.shape[1], g.shape[0]) != size:
            print(f"  {f.name}: 해상도가 다르다 {g.shape[1]}x{g.shape[0]} — 버린다")
            continue
        cc, ci, _, _ = det.detectBoard(g)
        if cc is None or len(cc) < MIN_CORNERS:
            print(f"  {f.name}: 코너 {0 if cc is None else len(cc)} 개 — 버린다")
            continue
        op, ip = board.matchImagePoints(cc, ci)
        obj_pts.append(op)
        img_pts.append(ip)
        used.append(f.name)
        print(f"  {f.name}: 코너 {len(cc)} 개")

    print(f"쓸 수 있는 사진 {len(used)}/{len(files)} · 해상도 {size[0]}x{size[1]}")
    if len(used) < MIN_SHOTS:
        print(f"실패 — 최소 {MIN_SHOTS} 장이 필요하다. 각도·거리를 바꿔 더 찍어라", file=sys.stderr)
        return 1

    rms, K, dist, _, _ = cv2.calibrateCamera(obj_pts, img_pts, size, None, None)
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
    hfov = np.degrees(2 * np.arctan(size[0] / (2 * fx)))
    vfov = np.degrees(2 * np.arctan(size[1] / (2 * fy)))
    print(f"재투영 RMS {rms:.3f} px   HFOV {hfov:.1f}°  VFOV {vfov:.1f}°")
    print(f"주점 ({cx:.0f}, {cy:.0f}) — 화면 중앙 ({size[0]/2:.0f}, {size[1]/2:.0f}) 에서 "
          f"{np.hypot(cx - size[0]/2, cy - size[1]/2):.0f}px")

    if rms > MAX_RMS:
        print(f"실패 — RMS {rms:.3f} > {MAX_RMS}. 쓰지 않고 멈춘다.\n"
              "  흔한 원인: 보드가 휘었다 · 초점이 안 맞았다 · 각도가 전부 정면이다",
              file=sys.stderr)
        return 1

    doc = json.loads(CONF.read_text(encoding="utf-8")) if CONF.exists() else {}
    doc.update({
        "_생성됨": "python3 scripts/map/{intrinsics,extrinsics}.py — 직접 고치지 마라",
        "_단위": "밀리미터 · 도. 하드 룰 5",
        "intrinsics": {
            "widthPx": size[0], "heightPx": size[1],
            "fx": fx, "fy": fy, "cx": cx, "cy": cy,
            "dist": dist.ravel().tolist(),
            "hfovDeg": round(float(hfov), 2), "vfovDeg": round(float(vfov), 2),
            "rmsPx": round(float(rms), 4), "shots": len(used),
        },
    })
    # 렌즈가 바뀌면 위치도 무효다 — 조용히 남겨 두면 다음 사람이 옛 값을 믿는다
    if doc.pop("labToCam", None) is not None:
        print("⚠ 기존 labToCam 을 지웠다 — 내부 파라미터가 바뀌면 위치도 다시 풀어야 한다")
    CONF.parent.mkdir(parents=True, exist_ok=True)
    CONF.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{CONF.relative_to(ROOT)} · 다음은 extrinsics.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
