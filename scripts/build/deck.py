#!/usr/bin/env python3
"""발표 마크다운 → 편집 가능한 .pptx.

    python3 scripts/build/deck.py scratchpad/ppt-aegis-2026-08-06.md

`/발표` 가 구운 md 를 파워포인트에서 열리는 네이티브 pptx 로 바꾼다.
**텍스트는 편집 가능하고 사진은 자리만 잡아 둔다** — 최종 배치는 사람이 파워포인트에서 한다.

왜 pandoc 인가
  Marp·Slidev 의 pptx 는 슬라이드를 통짜 이미지로 박아 편집이 안 된다.
  presenton 같은 AI 생성기는 **발표자 노트까지 AI 가 다시 쓴다** — 우리 문장이 남지 않는다.
  pandoc 만이 `::: notes` 를 우리가 쓴 글자 그대로 대본에 넣는다.

배치는 슬라이드 마스터가 진다. 우리가 슬라이드마다 좌표를 찍지 않는다 —
찍는 순간 그게 AI 슬롭이 된다. 대신 **마스터 한 벌을 여기서 설계**한다.
색은 Shared/tokens/tokens.css 밝은 테마에서 읽는다 (SSOT — 여기에 색을 적지 않는다).
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
TOKENS = ROOT / "Shared" / "tokens" / "tokens.css"

EMU = 914400  # 1인치
# 요즘 파워포인트 16:9 기본값. pandoc 기본 reference 는 10×5.63" 라 글이 답답하다.
SLIDE_W, SLIDE_H = 13.333, 7.5

# 토큰 이름 → OOXML 테마 슬롯. 이름을 여기서 짓지 않고 tokens.css 것을 그대로 쓴다.
THEME_SLOTS = {
    "dk1": "--c-fg",
    "lt1": "--c-bg",
    "dk2": "--c-fg-dim",
    "lt2": "--c-line",
    "accent1": "--c-info",
    "accent2": "--c-ok",
    "accent3": "--c-warn",
    "accent4": "--c-danger",
    "accent5": "--c-fg-dim",
    "accent6": "--c-fg-mute",
    "hlink": "--c-info",
    "folHlink": "--c-fg-mute",
}

MARGIN = 0.85
COL_W = SLIDE_W - MARGIN * 2

TITLE_BOX = (MARGIN, 0.55, COL_W, 1.05)
BODY_BOX = (MARGIN, 1.95, COL_W, 4.85)
FOOT_Y = 6.95

# placeholder 기하 (인치).
# **레이아웃마다 직접 박는다.** 마스터에만 넣으면 pandoc 이 마스터의 `xfrm` 을 지워서
# 상속이 끊기고, 내용이 슬라이드 위쪽 귀퉁이에만 몰린다 (실측 2026-08-06).
MASTER_GEOM = {
    "title": TITLE_BOX,
    "body": BODY_BOX,
    "dt": (MARGIN, FOOT_Y, 3.0, 0.3),
    "ftr": (MARGIN + 3.4, FOOT_Y, 4.0, 0.3),
    "sldNum": (SLIDE_W - MARGIN - 1.2, FOOT_Y, 1.2, 0.3),
}
_HALF = (COL_W - 0.5) / 2
LAYOUT_GEOM = {
    "slideLayout1.xml": {  # Title Slide
        "ctrTitle": (MARGIN, 2.45, COL_W, 1.7),
        "subTitle": (MARGIN, 4.35, COL_W, 1.3),
    },
    "slideLayout2.xml": {  # Title and Content — 대부분의 슬라이드가 여기 앉는다
        "title": TITLE_BOX,
        "body": BODY_BOX,
    },
    "slideLayout3.xml": {  # Section Header — 대단원 표지
        "title": (MARGIN, 2.85, COL_W, 1.6),
        "body": (MARGIN, 4.55, COL_W, 1.2),
    },
    "slideLayout4.xml": {  # Two Content
        "title": TITLE_BOX,
        "body#1": (MARGIN, 1.95, _HALF, 4.85),
        "body#2": (MARGIN + _HALF + 0.5, 1.95, _HALF, 4.85),
    },
    "slideLayout5.xml": {  # Comparison
        "title": TITLE_BOX,
        "body#1": (MARGIN, 1.95, _HALF, 0.6),
        "body#2": (MARGIN, 2.6, _HALF, 4.2),
        "body#3": (MARGIN + _HALF + 0.5, 1.95, _HALF, 0.6),
        "body#4": (MARGIN + _HALF + 0.5, 2.6, _HALF, 4.2),
    },
    "slideLayout8.xml": {  # Content with Caption
        "title": TITLE_BOX,
        "body#1": BODY_BOX,
        "body#2": (MARGIN, 6.4, COL_W, 0.5),
    },
    "slideLayout9.xml": {  # Picture with Caption — 사진 슬라이드
        "title": TITLE_BOX,
        "pic#1": BODY_BOX,
        "body#2": (MARGIN, 6.4, COL_W, 0.5),
    },
}
# 캔버스가 1.33배 커졌으니 글자도 같이 키운다. 안 키우면 여백만 늘어 더 허전하다.
TITLE_SZ = 4000
BODY_SZ = [2400, 2000, 1800, 1600, 1600]
SECTION_SZ = 4800
TABLE_SZ = 1800  # 표는 어디서도 크기를 안 물려받는다 — 여기서 한 번 정한다
# 표지는 titleStyle 을 그대로 물려받아 본문 슬라이드와 같은 크기로 나온다 — 따로 키운다.
LAYOUT_TEXT_SZ = {"slideLayout1.xml": {"ctrTitle": 5400, "subTitle": 2000}}

IMG_EXT = {".png", ".jpg", ".jpeg", ".gif"}
VIDEO_EXT = {".mp4", ".mov", ".webm"}
# `<!-- 그림 경로 — 캡션 -->`
# 구분자 앞뒤 공백을 **필수로** 받는다 — 경로에 `-` 가 들어 있다(`2026-08-06`).
# 공백을 안 걸면 첫 하이픈에서 잘려 경로가 `docs/evidence/2026` 이 된다.
FIGURE_RE = re.compile(r"<!--\s*그림\s+(\S+)\s+[—\-·]\s+(.*?)\s*-->")
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


def die(msg: str) -> None:
    print(f"deck: {msg}", file=sys.stderr)
    raise SystemExit(1)


def light_theme_colors() -> dict[str, str]:
    """tokens.css 의 `:root[data-theme="light"]` 블록만 읽는다.

    발표는 프로젝터로 쏜다 — 어두운 테마는 회의실 조명에서 대비가 무너진다.
    """
    if not TOKENS.exists():
        die(f"토큰 파일이 없다: {TOKENS}")
    css = TOKENS.read_text(encoding="utf-8")
    start = css.find(':root[data-theme="light"]')
    if start < 0:
        die("tokens.css 에 밝은 테마 블록이 없다")
    block = css[start : css.find("}", start)]
    decls = dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b", block))

    out = {}
    for slot, token in THEME_SLOTS.items():
        if token not in decls:
            die(f"tokens.css 밝은 테마에 {token} 이 없다 — 토큰 이름이 바뀌었다")
        out[slot] = decls[token].lstrip("#").upper()
    return out


def patch_theme(xml: str, colors: dict[str, str]) -> str:
    """clrScheme 의 12칸을 우리 토큰으로 바꾼다.

    dk1/lt1 은 기본 테마에서 `sysClr`(창 색 따라감)이라 `srgbClr` 로 갈아 끼운다 —
    그대로 두면 보는 사람 윈도우 테마에 따라 배경이 달라진다.
    """
    for slot, hexv in colors.items():
        # 치환문은 홑따옴표로 짓는다 — 겹따옴표 f-string 안에서 `\"` 를 쓰면
        # 백슬래시가 그대로 XML 에 박혀 색이 통째로 무효가 된다 (텍스트가 안 보인다).
        xml, n = re.subn(
            rf"(<a:{slot}>)\s*<a:(?:sys|srgb)Clr\b[^/]*/>\s*(</a:{slot}>)",
            f'\\1<a:srgbClr val="{hexv}"/>\\2',
            xml,
            count=1,
        )
        if not n:
            die(f"테마에서 {slot} 슬롯을 못 찾았다 — pandoc 기본 reference.pptx 가 바뀌었다")

    # 깨진 XML 은 파워포인트가 조용히 무시하고 기본색으로 넘어간다 — 열어 봐야 안다.
    # 여기서 한 번 파싱해 그 실패를 빌드 시점으로 당긴다.
    try:
        ElementTree.fromstring(xml)
    except ElementTree.ParseError as e:
        die(f"패치한 테마가 XML 이 아니다: {e}")
    return xml


def _emu(v: float) -> int:
    return int(round(v * EMU))


def _ph_keys(sp: str) -> list[str]:
    """placeholder 를 `type#idx` → `type` 순으로 찾을 키를 만든다.

    레이아웃의 본문 자리는 `type` 없이 `<p:ph idx="1"/>` 로만 적혀 있는 일이 흔하다 —
    OOXML 기본값이 body 라서다. `type` 만 보면 이걸 통째로 놓친다.
    """
    ph = re.search(r"<p:ph\b([^>]*)>", sp)
    if not ph:
        return []
    attrs = ph.group(1)
    typ = re.search(r'type="(\w+)"', attrs)
    idx = re.search(r'idx="(\d+)"', attrs)
    typ = typ.group(1) if typ else "body"
    return ([f"{typ}#{idx.group(1)}"] if idx else []) + [typ]


def set_geometry(
    xml: str, geom: dict[str, tuple[float, float, float, float]], label: str = ""
) -> str:
    """placeholder 별로 `<a:off>/<a:ext>` 를 갈아 끼운다. 없으면 새로 넣는다.

    적용된 개수를 세어 요청한 만큼 안 붙었으면 멈춘다 — 안 붙은 좌표는 화면에서
    "내용이 위쪽 귀퉁이에만 몰림" 으로 나타나고, 열어 보기 전에는 모른다.
    """
    hit: set[str] = set()
    out = []
    pos = 0
    for m in re.finditer(r"<p:sp>.*?</p:sp>", xml, re.S):
        sp = m.group(0)
        key = next((k for k in _ph_keys(sp) if k in geom), None)
        target = geom[key] if key else None
        if key:
            hit.add(key)
        if target:
            x, y, w, h = (_emu(v) for v in target)
            xfrm = f'<a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>'
            if "<a:xfrm>" in sp:
                sp = re.sub(r"<a:xfrm>.*?</a:xfrm>", xfrm, sp, count=1, flags=re.S)
            elif "<p:spPr>" in sp:
                sp = sp.replace("<p:spPr>", f"<p:spPr>{xfrm}", 1)
            else:
                # 좌표가 없는 placeholder 는 `<p:spPr/>` 로 자기닫힘이다 —
                # 여는 태그를 찾는 치환은 여기서 조용히 아무것도 안 한다.
                sp = sp.replace("<p:spPr/>", f"<p:spPr>{xfrm}</p:spPr>", 1)
        out.append(xml[pos : m.start()])
        out.append(sp)
        pos = m.end()
    out.append(xml[pos:])
    missed = set(geom) - hit
    if missed:
        die(f"{label}: placeholder 를 못 찾아 좌표를 못 박았다 — {sorted(missed)}")
    return "".join(out)


def set_placeholder_size(xml: str, sizes: dict[str, int]) -> str:
    """placeholder 하나의 글자 크기를 그 레이아웃 안에서만 못 박는다."""
    out, pos = [], 0
    for m in re.finditer(r"<p:sp>.*?</p:sp>", xml, re.S):
        sp = m.group(0)
        key = next((k for k in _ph_keys(sp) if k in sizes), None)
        if key:
            style = f'<a:lstStyle><a:lvl1pPr><a:defRPr sz="{sizes[key]}"/></a:lvl1pPr></a:lstStyle>'
            if "<a:lstStyle/>" in sp:
                sp = sp.replace("<a:lstStyle/>", style, 1)
            else:
                sp = re.sub(r"<a:lstStyle>.*?</a:lstStyle>", style, sp, count=1, flags=re.S)
        out.append(xml[pos : m.start()])
        out.append(sp)
        pos = m.end()
    out.append(xml[pos:])
    return "".join(out)


def set_type_scale(master: str) -> str:
    """마스터의 titleStyle·bodyStyle 글자 크기를 캔버스에 맞춰 키운다."""

    def bump(block: str, sizes: list[int]) -> str:
        i = [0]

        def repl(m: re.Match[str]) -> str:
            sz = sizes[min(i[0], len(sizes) - 1)]
            i[0] += 1
            return f'sz="{sz}"'

        return re.sub(r'sz="\d+"', repl, block)

    for name, sizes in (("titleStyle", [TITLE_SZ]), ("bodyStyle", BODY_SZ)):
        m = re.search(rf"<p:{name}>.*?</p:{name}>", master, re.S)
        if m:
            block = bump(m.group(0), sizes)
            if name == "titleStyle":
                # 기본 마스터는 제목을 가운데 정렬한다. 본문은 왼쪽이라 축이 어긋난다.
                block = block.replace('algn="ctr"', 'algn="l"')
            master = master[: m.start()] + block + master[m.end() :]
    return master


def build_reference(colors: dict[str, str], dest: Path) -> None:
    """pandoc 기본 reference.pptx 를 받아 캔버스·배치·타이포·색을 우리 것으로 바꾼다.

    처음부터 만들지 않는 이유 — pandoc 이 요구하는 7개 레이아웃(Title Slide ·
    Title and Content · Section Header · Two Content · Comparison ·
    Content with Caption · Blank)이 기본본에 이미 다 있다. 다시 그리면 그게 슬롭이다.
    """
    src = dest.parent / "_pandoc-default.pptx"
    with src.open("wb") as fh:
        subprocess.run(
            ["pandoc", "--print-default-data-file", "reference.pptx"],
            stdout=fh,
            check=True,
        )

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(
        dest, "w", zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            name = item.filename
            if re.fullmatch(r"ppt/theme/theme\d+\.xml", name):
                data = patch_theme(data.decode("utf-8"), colors).encode("utf-8")
            elif name == "ppt/presentation.xml":
                data = re.sub(
                    r'<p:sldSz[^/]*/>',
                    f'<p:sldSz cx="{_emu(SLIDE_W)}" cy="{_emu(SLIDE_H)}"/>',
                    data.decode("utf-8"),
                ).encode("utf-8")
            elif re.fullmatch(r"ppt/slideMasters/slideMaster\d+\.xml", name):
                x = set_geometry(data.decode("utf-8"), MASTER_GEOM, name)
                data = set_type_scale(x).encode("utf-8")
            elif name.split("/")[-1] in LAYOUT_GEOM:
                x = set_geometry(data.decode("utf-8"), LAYOUT_GEOM[name.split("/")[-1]], name)
                x = re.sub(r'sz="3000"', f'sz="{SECTION_SZ}"', x)
                x = re.sub(r'sz="1500"', f'sz="{BODY_SZ[0]}"', x)
                sizes = LAYOUT_TEXT_SZ.get(name.split("/")[-1])
                if sizes:
                    x = set_placeholder_size(x, sizes)
                data = x.encode("utf-8")
            zout.writestr(item, data)


# ── 강조 색 ─────────────────────────────────────────────────────────────────
# 주인님 규칙: **강조한 것만 색+볼드, 나머지는 검정.**
# 슬라이드마다 색을 고르지 않는다 — `**굵게**` 라고 쓴 자리에만 기계적으로 붙인다.
RUN_RE = re.compile(r"<a:r>(.*?)</a:r>", re.S)
RPR_RE = re.compile(r"<a:rPr\b([^>]*?)(/>|>(.*?)</a:rPr>)", re.S)


def _fill(hexv: str) -> str:
    return f'<a:solidFill><a:srgbClr val="{hexv}"/></a:solidFill>'


def color_runs(xml: str, accent: str, plain: str, size: int | None = None) -> str:
    """굵은 run 은 강조색, 나머지는 검정으로 못 박는다. size 를 주면 크기도 고정한다."""
    sz = f' sz="{size}"' if size else ""

    def fix_run(m: re.Match[str]) -> str:
        inner = m.group(1)
        rpr = RPR_RE.search(inner)
        if not rpr:
            return f'<a:r><a:rPr lang="ko-KR"{sz}>{_fill(plain)}</a:rPr>{inner}</a:r>'
        attrs, children = rpr.group(1), rpr.group(3) or ""
        if size and 'sz="' not in attrs:
            attrs += sz
        hexv = accent if re.search(r'\bb="1"', attrs) else plain
        # 이미 색이 있으면 갈아 끼우고, 없으면 rPr 의 첫 자식으로 넣는다.
        # solidFill 은 스키마상 앞쪽 자식이라 순서를 지켜야 파워포인트가 읽는다.
        children = re.sub(r"<a:solidFill>.*?</a:solidFill>", "", children, flags=re.S)
        return (
            inner[: rpr.start()]
            + f"<a:rPr{attrs}>{_fill(hexv)}{children}</a:rPr>"
            + inner[rpr.end() :]
        ).join(("<a:r>", "</a:r>"))

    return RUN_RE.sub(fix_run, xml)


def style_slide(xml: str, accent: str, plain: str) -> str:
    """슬라이드 한 장에 색과 표 크기를 입힌다.

    표는 마스터의 txStyles 를 물려받지 않아 홀로 작게 남는다 — 표 구간만 따로 잡는다.
    """
    out, pos = [], 0
    for m in re.finditer(r"<a:tbl>.*?</a:tbl>", xml, re.S):
        out.append(color_runs(xml[pos : m.start()], accent, plain))
        out.append(color_runs(m.group(0), accent, plain, TABLE_SZ))
        pos = m.end()
    out.append(color_runs(xml[pos:], accent, plain))
    return "".join(out)


def expand_figures(md: str) -> tuple[str, list[str]]:
    """`<!-- 그림 … -->` 주석을 사진 슬라이드로 편다.

    주석은 발표자만 보는 메모라 pandoc 이 통째로 버린다. 그러면 pptx 에 사진이 없다.
    캡션을 슬라이드 제목으로 올리고 사진을 본문 placeholder 에 넣어,
    **파워포인트에서 크기와 자리를 사람이 잡게** 한다. 경로는 슬라이드에 인쇄되지 않는다.
    """
    missing: list[str] = []

    def repl(m: re.Match[str]) -> str:
        rel, caption = m.group(1), m.group(2)
        path = ROOT / rel
        if path.suffix.lower() in VIDEO_EXT:
            # 어떤 md 도구도 pptx 에 영상을 못 넣는다. 자리와 경로를 대본에 남겨
            # 파워포인트에서 사람이 끼우게 한다.
            return f"\n## {caption}\n\n::: notes\n영상을 여기에 삽입한다 — {rel}\n:::\n"
        if path.suffix.lower() not in IMG_EXT:
            print(f"deck: 사진도 영상도 아니라 건너뛴다 — {rel}")
            return ""
        if not path.exists():
            missing.append(rel)
            return ""
        return f"\n## {caption}\n\n![]({path})\n"

    out = FIGURE_RE.sub(repl, md)
    return COMMENT_RE.sub("", out), missing


def main() -> None:
    if len(sys.argv) != 2:
        die("쓰는 법: python3 scripts/build/deck.py <발표.md>")
    src = Path(sys.argv[1]).resolve()
    if not src.exists():
        die(f"입력이 없다: {src}")
    if not shutil.which("pandoc"):
        die("pandoc 이 없다 — `brew install pandoc`")

    colors = light_theme_colors()
    md, missing = expand_figures(src.read_text(encoding="utf-8"))
    if missing:
        die("그림 주석이 가리키는 파일이 없다:\n  " + "\n  ".join(missing))

    out = src.with_suffix(".pptx")
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        ref = tmpd / "reference.pptx"
        build_reference(colors, ref)
        flat = tmpd / "deck.md"
        flat.write_text(md, encoding="utf-8")
        raw = tmpd / "raw.pptx"
        subprocess.run(
            ["pandoc", str(flat), "-o", str(raw),
             f"--reference-doc={ref}", "--slide-level=2"],
            check=True,
        )
        # pandoc 이 다 쓴 뒤에 색을 입힌다 — 슬라이드가 확정된 다음이라야
        # 어떤 run 이 굵은지가 결정돼 있다.
        with zipfile.ZipFile(raw) as zin, zipfile.ZipFile(
            out, "w", zipfile.ZIP_DEFLATED
        ) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if re.fullmatch(r"ppt/slides/slide\d+\.xml", item.filename):
                    data = style_slide(
                        data.decode("utf-8"), colors["accent1"], colors["dk1"]
                    ).encode("utf-8")
                zout.writestr(item, data)

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        slides = sum(1 for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n))
        notes = sum(1 for n in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n))
        media = sum(1 for n in names if n.startswith("ppt/media/"))
    if slides == 0:
        die("슬라이드가 0장이다 — md 의 H2 가 없다")

    print(f"deck: {out.relative_to(ROOT)} · 슬라이드 {slides}장 · 사진 {media}장 · 대본 {notes}장")
    print("deck: 영상과 사진 최종 배치는 파워포인트에서 손으로 한다")


if __name__ == "__main__":
    main()
