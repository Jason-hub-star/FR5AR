#!/usr/bin/env bash
# AR 배포 — **빌드 산출물만 올린다** (D24와 같은 이유).
# 모노레포 workspaces 는 하위 폴더에서 `npm install` 이 `@fr5/shared` 를 못 풀어
# Vercel 빌드를 쓸 수 없다. AR/vercel.json 의 buildCommand 는 이관 전 유물이다.
#
# **대상은 새 프로젝트 `fr5ar` 다.** 기존 `web`(= web-nine-rho-89)은 팀이 보고 있는
# 이관 전 데모라 건드리지 않는다 (PROJECT-STATUS §다음 한 걸음 E).
#
# 주인님이 부를 때만 돈다. 자동 실행 금지.
set -euo pipefail
cd "$(dirname "$0")/../.."

npm run build -w @fr5/ar

STAGE="$(mktemp -d)/fr5ar"
mkdir -p "$STAGE"
cp -R AR/dist/. "$STAGE"/

# **카메라 권한 헤더가 빠지면 AR 이 통째로 죽는다.** 정적 업로드에는 AR/vercel.json 이
# 안 따라가므로 여기서 다시 쓴다.
cat > "$STAGE/vercel.json" <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Permissions-Policy", "value": "camera=(self)" } ] },
    { "source": "/assets/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] }
  ]
}
JSON

# --scope 를 반드시 준다 — 비대화형에는 기본 스코프가 없다
(cd "$STAGE" && vercel --prod --yes --scope kimjuyoung1127s-projects)

echo
echo "공유 주소 → https://fr5ar.vercel.app"
echo "(배포별 URL 은 로그인 벽이다. 별칭만 팀에 준다)"
