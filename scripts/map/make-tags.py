#!/usr/bin/env python3
"""글로벌 카메라 캘리브레이션용 인쇄물을 만든다 — AprilTag 36h11 + ChArUco 보드.

**폰 AR 마커(`Shared/assets/marker/`)와 다른 물건이다.**
저쪽은 AR.js 가 브라우저에서 읽는 3x3 바코드, 이쪽은 OpenCV 가 파이썬에서 읽는 태그다.
용도가 다르니 섞지 않는다 (`docs/research/ar-global-camera.md` §마커 판정).

왜 AprilTag 36h11 인가 — 같은 크기에서 ArUco 보다 원거리 검출이 낫고 로봇공학 표준이다.
그런데 **OpenCV 에 사전이 내장돼 있어 추가 의존성이 0 이다.** 검출은 cv2.aruco 로 한다.

크기 규약 — **선언 크기 = 검은 사각형의 바깥 한 변.** solvePnP 에 넣는 값이 이것이다.
바깥 흰 여백은 검출용 정숙영역(quiet zone)이지 크기에 포함되지 않는다.

    python3 scripts/map/make-tags.py
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

DPI = 300
MM = DPI / 25.4                      # 1mm 당 픽셀
A4 = (int(210 * MM), int(297 * MM))  # 2480 x 3508
A3 = (int(297 * MM), int(420 * MM))

# 크기는 **최원거리 모서리의 칸당 픽셀**로 정한다. 36h11 은 8칸이고 눕힌 태그는
# 카메라 부각만큼 단축되므로, 화면 중앙의 여유가 먼 모서리에서 사라진다.
# 맵 3.0×1.6m·높이 2.4m·HFOV 70° 실계산 (2026-08-02):
#
#            배치         해상도   150mm      220mm
#   모서리 위          1080p   3.6px/칸   5.2px/칸
#   긴 변 중앙 위      1080p   5.5px/칸   8.0px/칸
#
# 5px/칸이 안전선, 3px/칸은 조명이 나쁘면 놓친다.
# → **A4 150mm 는 "긴 변 중앙 위 + 1080p 이상" 조건에서만 쓴다.**
#    조건을 못 맞추거나 확신이 없으면 A3 220mm 를 쓴다.
SHEETS = [(A4, 150), (A3, 220)]
QUIET_RATIO = 1 / 8   # 정숙영역 = 태그 1칸 폭. 이보다 좁으면 임계화가 흔들린다
TAG_IDS = [0, 1, 2, 3]

# ChArUco — 168 x 224mm. 30mm 사각으로 하면 240mm 라 아래 설명줄과 겹친다 (실렌더 확인 2026-08-02)
SQ_MM, MK_MM, COLS, ROWS = 28, 21, 6, 8

OUT = Path(__file__).resolve().parents[2] / "Shared/assets/tag"

FONTS = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(px):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            continue
    return ImageFont.load_default()      # 최후 폴백 — 크기는 못 맞지만 인쇄는 된다


def ruler(d, cx, y, mm_len=100):
    """인쇄 배율 검증선. 이걸 자로 재서 100mm 가 아니면 배율이 틀린 것이다."""
    half = mm_len * MM / 2
    d.line([(cx - half, y), (cx + half, y)], fill=0, width=4)
    for x in (cx - half, cx + half):
        d.line([(x, y - 18), (x, y + 18)], fill=0, width=4)
    d.text((cx, y + 30), f"{mm_len}.0 mm — 자로 재서 확인", font=font(34), fill=0, anchor="ma")


def sheet_tag(dic, tag_id, page_size, tag_mm):
    px = int(round(tag_mm * MM))
    img = cv2.aruco.generateImageMarker(dic, tag_id, px)
    q = int(round(tag_mm * QUIET_RATIO * MM))
    img = cv2.copyMakeBorder(img, q, q, q, q, cv2.BORDER_CONSTANT, value=255)

    page = Image.new("L", page_size, 255)
    x = (page_size[0] - img.shape[1]) // 2
    y = int(22 * MM)
    page.paste(Image.fromarray(img), (x, y))

    cx = page_size[0] // 2
    d = ImageDraw.Draw(page)
    ty = y + img.shape[0] + int(14 * MM)
    d.text((cx, ty), f"APRILTAG 36h11   ID = {tag_id}", font=font(64), fill=0, anchor="ma")
    d.text((cx, ty + 92),
           f"{tag_mm}.0 mm — 검은 사각형 바깥 한 변 (solvePnP 입력값)",
           font=font(38), fill=0, anchor="ma")
    ruler(d, cx, ty + int(20 * MM))
    d.text((cx, page_size[1] - int(20 * MM)),
           "무광 용지 · 배율 100% (맞춤 인쇄 끄기) · 딱딱한 판에 평평하게",
           font=font(38), fill=0, anchor="ma")
    return page


def sheet_charuco(dic):
    # 길이 단위는 **밀리미터**. 생성 이미지에는 영향이 없지만(비율만 씀) 캘리브레이션
    # 스크립트가 같은 보드를 mm 로 다시 만들므로 여기서부터 단위를 맞춰 둔다 (하드 룰 5).
    board = cv2.aruco.CharucoBoard((COLS, ROWS), SQ_MM, MK_MM, dic)
    w, h = int(round(COLS * SQ_MM * MM)), int(round(ROWS * SQ_MM * MM))
    img = board.generateImage((w, h))

    page = Image.new("L", A4, 255)
    top = int(18 * MM)
    page.paste(Image.fromarray(img), ((A4[0] - w) // 2, top))

    d = ImageDraw.Draw(page)
    ty = top + h + int(8 * MM)
    d.text((A4[0] // 2, ty), "CHARUCO — 카메라 내부 파라미터용", font=font(60), fill=0, anchor="ma")
    d.text((A4[0] // 2, ty + 88),
           f"{COLS} x {ROWS} · 사각 {SQ_MM}mm · 마커 {MK_MM}mm · APRILTAG 36h11",
           font=font(38), fill=0, anchor="ma")
    d.text((A4[0] // 2, ty + 88 + 62),
           "무광 용지 · 배율 100% · 각도·거리를 바꿔 15~20 장 촬영 → cv2.calibrateCamera",
           font=font(38), fill=0, anchor="ma")
    ruler(d, A4[0] // 2, ty + int(22 * MM))
    return page


def main():
    dic = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36H11)
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for page_size, tag_mm in SHEETS:
        paper = "A4" if page_size == A4 else "A3"
        for i in TAG_IDS:
            p = OUT / f"apriltag36h11-{tag_mm}mm-id{i}-{paper}.png"
            sheet_tag(dic, i, page_size, tag_mm).save(p, dpi=(DPI, DPI))
            made.append((p, tag_mm))
    p = OUT / f"charuco-{COLS}x{ROWS}-{SQ_MM}mm-A4.png"
    sheet_charuco(dic).save(p, dpi=(DPI, DPI))

    # 보드 제원을 JSON 으로 함께 떨군다 — 캘리브레이션 스크립트가 이걸 읽는다.
    # 코드에 6x8·28mm 를 두 번 적으면 한쪽만 고쳐졌을 때 조용히 틀린 값이 나온다.
    (OUT / "tags.json").write_text(json.dumps({
        "_생성됨": "python3 scripts/map/make-tags.py — 직접 고치지 마라",
        "_단위": "밀리미터",
        "family": "DICT_APRILTAG_36H11",
        "cellsPerSide": 8,
        "quietRatio": QUIET_RATIO,
        "sheets": [{"paper": "A4" if s == A4 else "A3", "tagSizeMm": t, "ids": TAG_IDS}
                   for s, t in SHEETS],
        "charuco": {"cols": COLS, "rows": ROWS, "squareMm": SQ_MM, "markerMm": MK_MM},
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    # 자가검증 — 만든 것을 되읽어 전부 제 ID 로, 선언한 mm 로 검출되는지 본다.
    det = cv2.aruco.ArucoDetector(dic, cv2.aruco.DetectorParameters())
    ok = 0
    for p, tag_mm in made:
        g = np.array(Image.open(p).convert("L"))
        corners, ids, _ = det.detectMarkers(g)
        want = int(p.stem.split("-id")[1][0])
        if ids is not None and int(ids[0][0]) == want:
            side = np.linalg.norm(corners[0][0][0] - corners[0][0][1]) / MM
            if abs(side - tag_mm) <= 0.5:
                ok += 1
            print(f"  {p.name}: 검출 OK · 한 변 {side:.1f}mm (선언 {tag_mm})")
        else:
            print(f"  {p.name}: 검출 실패", file=sys.stderr)

    print(f"{p.parent.relative_to(OUT.parents[2])}/ 에 {len(made) + 1} 장")
    print(f"자가검증 {ok}/{len(made)}")
    return 0 if ok == len(made) else 1


if __name__ == "__main__":
    raise SystemExit(main())
