#!/usr/bin/env bash
# 개발 기록 사진·영상을 **오늘 날짜 폴더에 캡션과 함께** 떨군다 (발표 자료의 원료).
#
#   bash scripts/dev/shot.sh cam-pip "폰 카메라 PiP 실기"                  # 화면 영역 선택 캡처
#   bash scripts/dev/shot.sh walk-in "답사 걸어 들어가기" --from ~/Downloads/IMG_9.jpg
#   bash scripts/dev/shot.sh cycle   "사이클 1회전"      --mov ~/Desktop/rec.mov
#
# **캡션을 찍는 순간에 받는다.** 나중에 42장을 열어 "이게 뭐였지"를 다시 하지 않기 위해서다 —
# 실측(2026-08-06)으로 evidence 사진 42장 중 `![캡션](파일)` 형태가 붙은 건 9장뿐이었다.
# 캡션은 같은 폴더 `SHOTS.md` 에 자동으로 쌓이고, `scripts/build/album.mjs` 가 그걸 회수한다.
#
# **되돌릴 수 있는 것만 한다** (dev/ 규약). 원본은 복사만 하고 지우지 않으며,
# 같은 이름이 있으면 덮어쓰지 않고 `-2`, `-3` 을 붙인다.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

GIF_MAX_MB=2          # 커밋할 gif 상한. 넘으면 한 번 더 줄여 본다
GIF_FPS=10
GIF_WIDTH=720

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-2}"; }

SLUG=""; CAPTION=""; SRC=""; MODE="screen"
while [ $# -gt 0 ]; do
  case "$1" in
    --from) MODE="file";  SRC="${2:-}"; shift 2 ;;
    --mov)  MODE="movie"; SRC="${2:-}"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "모르는 옵션: $1"; usage ;;
    *)  if [ -z "$SLUG" ]; then SLUG="$1"; elif [ -z "$CAPTION" ]; then CAPTION="$1"; else
          echo "인자가 너무 많다: $1"; usage; fi; shift ;;
  esac
done

[ -n "$SLUG" ] || usage
# 슬러그가 곧 색인 키다 — 공백·한글이 섞이면 링크가 깨진다
case "$SLUG" in
  *[!a-z0-9-]*|-*|*-) echo "FAIL  슬러그는 소문자·숫자·하이픈만 (예: cam-pip): $SLUG"; exit 1 ;;
esac
[ -n "$CAPTION" ] || { echo "FAIL  캡션이 없다 — 지금 안 적으면 발표 때 아무도 못 적는다"; usage; }
[ "$MODE" = "screen" ] || [ -f "$SRC" ] || { echo "FAIL  원본이 없다: $SRC"; exit 1; }

DAY="$(date +%F)"
DIR="docs/evidence/$DAY"
mkdir -p "$DIR"

# 같은 이름이 있으면 덮지 않고 비켜 간다
uniq_path() {         # $1 확장자 → 표준출력에 상대경로
  local ext="$1" base="$SLUG" n=2
  while [ -e "$DIR/$base.$ext" ]; do base="$SLUG-$n"; n=$((n+1)); done
  echo "$DIR/$base.$ext"
}

human() { python3 -c "import os,sys;b=os.path.getsize(sys.argv[1]);print(f'{b/1024:.0f}KB' if b<1048576 else f'{b/1048576:.1f}MB')" "$1"; }

OUT=""; EXTRA=""

case "$MODE" in
  screen)
    [ "$(uname)" = "Darwin" ] || { echo "FAIL  화면 캡처는 macOS 전용이다 — 다른 OS 는 --from 으로 넣는다"; exit 1; }
    OUT="$(uniq_path png)"
    echo "→ 영역을 드래그해 주세요 (ESC 로 취소)"
    screencapture -i "$OUT" || { echo "FAIL  캡처 실패"; exit 1; }
    [ -s "$OUT" ] || { rm -f "$OUT"; echo "취소됨 — 아무것도 저장하지 않았다"; exit 1; }
    ;;

  file)
    ext="${SRC##*.}"
    ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
    case "$ext" in
      heic|heif)   # 아이폰 기본 포맷 — 브라우저·PPT 가 못 읽는다. jpg 로 굽는다
        OUT="$(uniq_path jpg)"
        command -v sips >/dev/null || { echo "FAIL  HEIC 변환에 sips 가 필요하다 (macOS)"; exit 1; }
        sips -s format jpeg "$SRC" --out "$OUT" >/dev/null || { echo "FAIL  HEIC → JPG 변환 실패"; exit 1; }
        ;;
      png|jpg|jpeg|gif)
        OUT="$(uniq_path "$ext")"
        cp "$SRC" "$OUT" ;;
      mov|mp4|m4v|webm)
        echo "FAIL  영상은 --mov 로 넣는다 (gif 로 굽고 대표 프레임을 뽑는다)"; exit 1 ;;
      *) echo "FAIL  모르는 확장자: .$ext"; exit 1 ;;
    esac
    ;;

  movie)
    command -v ffmpeg >/dev/null || { echo "FAIL  ffmpeg 가 없다 → brew install ffmpeg"; exit 1; }
    OUT="$(uniq_path gif)"
    PAL="$(mktemp -t shotpal).png"
    bake() {          # $1 fps · $2 width
      ffmpeg -y -v error -i "$SRC" -vf "fps=$1,scale=$2:-1:flags=lanczos,palettegen" "$PAL" &&
      ffmpeg -y -v error -i "$SRC" -i "$PAL" \
        -lavfi "fps=$1,scale=$2:-1:flags=lanczos[x];[x][1:v]paletteuse" "$OUT"
    }
    bake "$GIF_FPS" "$GIF_WIDTH" || { rm -f "$PAL"; echo "FAIL  gif 변환 실패"; exit 1; }
    # 상한을 넘으면 한 번 더 줄여 본다. 그래도 넘으면 남기되 **알린다** — 커밋 여부는 사람이 정한다
    if [ "$(python3 -c "import os,sys;print(os.path.getsize(sys.argv[1])>$GIF_MAX_MB*1048576)" "$OUT")" = "True" ]; then
      echo "   gif 가 ${GIF_MAX_MB}MB 를 넘어 fps 8 · 480px 로 다시 굽는다"
      bake 8 480 || true
    fi
    rm -f "$PAL"
    # 대표 프레임 — PPT 는 gif 를 못 넣는 자리가 많다. 정지컷을 같이 남긴다
    EXTRA="${OUT%.gif}-frame.png"
    ffmpeg -y -v error -i "$SRC" -vf "thumbnail,scale=1280:-1" -frames:v 1 "$EXTRA" || EXTRA=""
    ;;
esac

# 캡션 사이드카 — album.mjs 가 여기서 캡션을 100% 회수한다
SIDE="$DIR/SHOTS.md"
[ -f "$SIDE" ] || cat > "$SIDE" <<'EOF'
# 이 날 찍은 것 — `scripts/dev/shot.sh` 가 자동으로 쌓는다

캡션의 단일 출처다. 손으로 고쳐도 되지만 **줄 형식은 지킨다** — 아래 줄들과 똑같이 쓴다.
`node scripts/build/album.mjs` 가 이 파일을 읽어 `docs/evidence/ALBUM.md` 를 굽는다.

EOF
printf -- '- %s ![%s](%s)\n' "$(date +%H:%M)" "$CAPTION" "$(basename "$OUT")" >> "$SIDE"
[ -n "$EXTRA" ] && printf -- '- %s ![%s — 대표 프레임](%s)\n' "$(date +%H:%M)" "$CAPTION" "$(basename "$EXTRA")" >> "$SIDE"

echo
echo "저장  $OUT  ($(human "$OUT"))"
[ -n "$EXTRA" ] && echo "      $EXTRA  ($(human "$EXTRA"))"
echo "캡션  $SIDE 에 기록됨"
echo
echo "evidence 문서에 붙여넣을 줄:"
echo "  ![$CAPTION]($(basename "$OUT"))"
echo
echo "앨범 갱신: node scripts/build/album.mjs"
