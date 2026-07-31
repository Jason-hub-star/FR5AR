#!/usr/bin/env bash
# fairino-cs 빌드 — Unity 번들 Mono 로 컴파일한다 (libfairino.dll 이 .NET Framework 전용이라
# 최신 dotnet 에서 안 돈다 — D41 · 2026-07-31 실측 DefineDynamicAssembly 오류).
# 실행은 run.sh — 같은 Mono 로 돌린다.
set -euo pipefail
cd "$(dirname "$0")"

MONO_HOME="${FAIRINO_MONO:-}"
if [ -z "$MONO_HOME" ]; then
  # 실기 검증에 쓴 6000.3.11f1 을 먼저 찾고, 없으면 설치된 아무 Unity 의 Mono 를 쓴다
  for v in 6000.3.11f1 $(ls /Applications/Unity/Hub/Editor 2>/dev/null); do
    C="/Applications/Unity/Hub/Editor/$v/Unity.app/Contents/Resources/Scripting/MonoBleedingEdge"
    [ -f "$C/lib/mono/4.5/csc.exe" ] && MONO_HOME="$C" && break
  done
fi
[ -n "$MONO_HOME" ] || { echo "Unity Mono 를 못 찾았다 — FAIRINO_MONO 로 지정" >&2; exit 1; }

mkdir -p bin
# bin/csc 래퍼는 유니티 빌드머신 경로가 박혀 깨져 있다 — mono 로 csc.exe 를 직접 부른다
"$MONO_HOME/bin/mono" "$MONO_HOME/lib/mono/4.5/csc.exe" Program.cs -nologo -out:bin/fairino-cs.exe \
  -r:"$MONO_HOME/lib/mono/4.5/System.Web.Extensions.dll"
echo "$MONO_HOME" > bin/mono-home.txt
echo "빌드 완료 → bin/fairino-cs.exe (mono: $MONO_HOME)"
