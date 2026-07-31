#!/usr/bin/env python3
"""폰이 보낸 진단 로그(`.diag/*.jsonl`)를 조건별 표로 묶는다.

왜 이 스크립트가 있나
  원본은 초당 1줄이라 400줄이 금방 쌓인다. 눈으로 읽을 수 없고,
  읽을 수 있는 사람이 한 명뿐이면 그건 측정이 아니라 전언이다.

**구간을 어떻게 가르나 — `프레임` 카운터가 줄어드는 지점이다.**
  화면의 `수치 초기화` 를 누르거나 새로고침하면 카운터가 0 부터 다시 센다.
  그래서 태그를 안 바꿔도 구간이 갈린다. 태그는 이름표일 뿐 경계가 아니다 —
  실제로 첫 측정에서 `80mm-1m` 하나에 0.46m 부터 2.05m 까지 섞여 들어왔다.

**`인식률` 은 누적값이라 구간 마지막 줄의 값이 그 구간의 성적이다.**
  중간값을 쓰면 카운터가 덜 찬 초반이 성적을 끌어내린다.

사용
    python3 scripts/dev/report-diag.py              # 표로 본다
    python3 scripts/dev/report-diag.py --md         # evidence 문서에 붙일 마크다운
    python3 scripts/dev/report-diag.py --min 10     # 10줄 미만 구간은 버린다 (기본 5)
"""

import argparse
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIAG_DIR = ROOT / ".diag"

# 마커를 놓치는 순간 검출기가 헛값을 낸다 — 실제로 2521m 이 찍혔다.
# 실험실에서 성립할 수 없는 값은 거리 통계에서만 뺀다(인식률은 건드리지 않는다).
DIST_MIN_M, DIST_MAX_M = 0.1, 20.0


def load():
    rows = []
    for f in sorted(DIAG_DIR.glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            # 카메라가 열리기 전 구간은 인식률 0% 라 성적을 깎는다. 옛 로그에 섞여 있다.
            if not (r.get("카메라") or [0])[0]:
                continue
            r["_file"] = f.name
            rows.append(r)
    return rows


def segment(rows, only_runs=False):
    """구간을 가른다.

    **`run` 번호가 있으면 그걸 쓴다** — 화면의 `측정 30초` 를 누른 판이다.
    사람이 "지금부터 잰다" 고 선언한 경계라 추론보다 정확하다.

    없는 줄(옛 로그·버튼 안 누르고 흘러간 구간)은 `프레임` 카운터가 줄어드는 지점으로
    가른다. 초기화·새로고침이 거기다. 다만 그건 **거리가 고정이라는 보장이 없다.**
    """
    runs, loose, cur, prev, prevkey = {}, [], [], None, None
    for r in rows:
        if r.get("run"):
            # sid 까지 넣어야 페이지를 다시 연 뒤의 #1 이 앞의 #1 과 안 합쳐진다.
            # 옛 로그에는 sid 가 없다 — 그때는 파일+번호로만 가른다(합쳐질 수 있다).
            runs.setdefault((r["_file"], r.get("sid", ""), r["run"]), []).append(r)
            continue
        key = (r.get("mm"), r.get("cv"), r.get("sm"), r.get("bc"), r["_file"])
        if prev is not None and (r.get("프레임", 0) < prev.get("프레임", 0) or key != prevkey) and cur:
            loose.append(cur)
            cur = []
        cur.append(r)
        prev, prevkey = r, key
    if cur:
        loose.append(cur)

    segs = [(True, v) for v in runs.values()]
    if not only_runs:
        segs += [(False, v) for v in loose]
    return segs


def summarize(seg, declared=False):
    last = seg[-1]
    d = [x["거리m"] for x in seg
         if x.get("거리m") is not None and DIST_MIN_M < x["거리m"] < DIST_MAX_M]
    px = [x["마커px"] for x in seg if x.get("마커px")]
    tilt = [x["기울기도"] for x in seg if x.get("기울기도") is not None]
    spin = [x["회전급변도"] for x in seg if x.get("회전급변도") is not None]
    return {
        # 마커가 검출 캔버스에서 몇 px 였나 — 인식률이 무너지는 px 를 찾는 것이 목표다
        "px": int(statistics.median(px)) if px else None,
        "기울기": int(statistics.median(tilt)) if tilt else None,
        # 급변은 평균이 아니라 **최댓값**으로 본다. 뒤집힘은 튐이라 평균에 묻힌다
        "급변": max(spin) if spin else None,
        "끊김s": round((last.get("최장끊김ms") or 0) / 1000, 1),
        "tag": (f"#{last['run']} " if declared else "~") + (last.get("tag") or ""),
        "declared": declared,
        "mm": last.get("mm"),
        "cv": last.get("cv", "auto"),
        "sm": last.get("sm"),
        # 거리는 **검출된 프레임에서만** 나온다. 놓친 순간의 거리는 알 방법이 없다 —
        # 그래서 재는 동안 서 있어야 이 값이 그 구간을 대표한다.
        "거리m": round(statistics.median(d), 2) if d else None,
        "거리폭": round(max(d) - min(d), 2) if len(d) > 1 else 0.0,
        "인식률": last.get("인식률"),
        "fps": int(statistics.median([x["fps"] for x in seg])),
        "프레임": last.get("프레임"),
        "n": len(seg),
        "시각": (last.get("t") or "")[11:19],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", action="store_true", help="마크다운 표로 낸다")
    ap.add_argument("--min", type=int, default=5, help="이 줄 수 미만 구간은 버린다")
    ap.add_argument("--runs", action="store_true",
                    help="`측정` 버튼으로 선언한 판만 본다 (흘러간 구간 제외)")
    args = ap.parse_args()

    if not DIAG_DIR.is_dir():
        sys.exit(f"{DIAG_DIR} 가 없다 — 아직 아무것도 안 쟀다 (?log=1 로 켠다)")

    rows = load()
    if not rows:
        sys.exit("쓸 수 있는 줄이 없다 — 카메라가 열린 구간이 하나도 없다")

    segs = [summarize(s, d) for d, s in segment(rows, args.runs) if len(s) >= args.min]
    if not segs:
        sys.exit(f"{args.min}줄 이상인 구간이 없다 — `--min` 을 낮추거나 더 오래 재라")

    # 선언된 판(측정 버튼)을 위로. 흘러간 구간은 참고용이라 아래로 민다.
    segs.sort(key=lambda s: (not s["declared"], -(s["mm"] or 0), s["거리m"] or 0))

    head = ["마커", "거리", "폭", "px", "기울기", "캔버스", "인식률",
            "최장끊김", "급변", "fps", "n", "태그"]
    body = [[
        f"{s['mm']}mm",
        f"{s['거리m']}m" if s["거리m"] else "—",
        f"±{s['거리폭']}" if s["거리폭"] else "—",
        str(s["px"]) if s["px"] else "—",
        f"{s['기울기']}°" if s["기울기"] is not None else "—",
        str(s["cv"]),
        f"{s['인식률']}%",
        f"{s['끊김s']}s",
        f"{s['급변']}°" if s["급변"] is not None else "—",
        str(s["fps"]),
        str(s["n"]),
        s["tag"],
    ] for s in segs]

    if args.md:
        print("| " + " | ".join(head) + " |")
        print("|" + "---|" * len(head))
        for r in body:
            print("| " + " | ".join(r) + " |")
    else:
        w = [max(len(head[i]), *(len(r[i]) for r in body)) for i in range(len(head))]
        line = "  ".join(h.ljust(w[i]) for i, h in enumerate(head))
        print(line)
        print("─" * len(line))
        for r in body:
            print("  ".join(c.ljust(w[i]) for i, c in enumerate(r)))

    print()
    for s in segs:
        if s["거리폭"] > 0.3:
            print(f"※ {s['mm']}mm {s['tag']}: 거리폭 ±{s['거리폭']}m — 재는 동안 움직였다."
                  " 이 인식률은 한 거리의 값이 아니다")
        if (s["급변"] or 0) > 30:
            print(f"※ {s['mm']}mm {s['tag']}: 회전 급변 {s['급변']}° — **자세가 뒤집혔다**"
                  " (평면 마커의 pose ambiguity). 방어가 필요한 구간이다")
    print(f"구간 {len(segs)}개 · 원본 {len(rows)}줄 · {DIAG_DIR}")


if __name__ == "__main__":
    main()
