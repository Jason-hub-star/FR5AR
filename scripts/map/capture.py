#!/usr/bin/env python3
"""웹캠 사진을 찍어 폴더에 쌓는다 — 캘리브레이션 입력물 수집.

**되돌릴 수 있는 것만 한다** (dev/ 규약). 설정 파일을 안 건드리고 사진만 남긴다.

카메라 설정을 여기서 **잠근다** — 캘리브레이션 결과는 해상도·초점에 종속이라
찍을 때와 쓸 때가 다르면 값이 통째로 무효가 된다.

  · 오토포커스 OFF — 초점이 변하면 화각도 같이 변한다 (focus breathing)
  · 해상도 고정 — 요청이 무시되는 웹캠이 많아서 **실제 적용값을 찍어 준다**

    python3 scripts/map/capture.py charuco          # ChArUco 15~20 장
    python3 scripts/map/capture.py tags --shots 1   # 태그 배치 1 장
    python3 scripts/map/capture.py charuco --device 1 --width 2560 --height 1440
    python3 scripts/map/capture.py tags --device http://192.168.0.9:8080/video   # 폰 IP캠

SPACE 저장 · Q 종료. 창이 안 뜨면 터미널에 카메라 권한을 준 뒤 다시 실행한다.
"""
import argparse
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "calib-shots"      # .gitignore 대상 — 측정 원본이지 SSOT 가 아니다


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["charuco", "tags"], help="무엇을 찍는가")
    # USB 웹캠은 번호(0,1,...), 폰 IP캠은 MJPEG **URL**. cv2 가 둘 다 받는다.
    ap.add_argument("--device", default="0", help="웹캠 번호 또는 MJPEG URL")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--shots", type=int, default=20, help="이 장수를 채우면 알려준다")
    a = ap.parse_args()

    dev = int(a.device) if a.device.isdigit() else a.device
    cap = cv2.VideoCapture(dev)
    if not cap.isOpened():
        print(f"카메라 {a.device} 를 못 연다 — 다른 앱이 쓰고 있거나 권한이 없다", file=sys.stderr)
        print("  URL 이면 폰과 같은 와이파이인지, 브라우저로 그 주소가 열리는지 먼저 보라",
              file=sys.stderr)
        return 1

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, a.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, a.height)
    cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)

    got = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    af = cap.get(cv2.CAP_PROP_AUTOFOCUS)
    print(f"실제 적용 해상도 {got[0]}x{got[1]}   오토포커스 {af}")
    if got != (a.width, a.height):
        print(f"⚠ 요청({a.width}x{a.height})이 무시됐다 — 이 카메라가 못 내는 해상도다")
    if af not in (0, -1):
        print("⚠ 오토포커스가 안 꺼졌다 — 카메라 제조사 앱에서 수동으로 끄고 다시 찍어라")

    out = SHOTS / a.kind
    out.mkdir(parents=True, exist_ok=True)
    n = len(list(out.glob("*.png")))
    print(f"{out.relative_to(ROOT)}/ 에 이미 {n} 장 — SPACE 저장, Q 종료")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("프레임을 못 읽는다", file=sys.stderr)
            break
        view = frame.copy()
        cv2.putText(view, f"{n}/{a.shots}  SPACE=save  Q=quit", (16, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
        cv2.imshow("map/capture", view)

        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord(" "):
            n += 1
            p = out / f"{a.kind}-{n:03d}.png"
            cv2.imwrite(str(p), frame)          # 원본 저장 — 오버레이가 없는 프레임이다
            print(f"  저장 {p.name}")
            if n == a.shots:
                print(f"  {a.shots} 장 채웠다. 각도·거리를 더 바꿔 찍으면 정확도가 오른다")

    cap.release()
    cv2.destroyAllWindows()
    print(f"총 {n} 장 · {out.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
