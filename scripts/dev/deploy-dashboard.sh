#!/usr/bin/env bash
# 관제화면 배포 — **빌드 산출물만 올린다** (D24).
# 모노레포 workspaces 는 하위 폴더에서 npm install 이 안 풀려 Vercel 빌드를 못 쓴다.
#
# 주인님이 부를 때만 돈다. 자동 실행 금지.
set -euo pipefail
cd "$(dirname "$0")/../.."

npm run build -w @fr5/dashboard

STAGE="$(mktemp -d)/fr5dashboard"
mkdir -p "$STAGE"
cp -R Dashboard/dist/. "$STAGE"/
cat > "$STAGE/vercel.json" <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [
    { "source": "/assets/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] }
  ]
}
JSON

# --scope 를 반드시 준다 — 비대화형에는 기본 스코프가 없다
(cd "$STAGE" && vercel --prod --yes --scope kimjuyoung1127s-projects)

echo
echo "공유 주소 → https://fr5dashboard.vercel.app"
echo "(배포별 URL 은 로그인 벽이다. 별칭만 팀에 준다)"
