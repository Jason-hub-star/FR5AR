---
name: 명령어
description: FR5Web에서 쓸 수 있는 명령·스킬·스크립트 전체를 파일시스템에서 읽어 표로 보여준다. 손으로 관리하는 목록이 아니라 매번 실제 파일을 세므로 드리프트가 없다.
user_invocable: true
tags: [meta, help, read-only]
trigger: "'명령어', '명령어 목록', '뭐 쓸 수 있어'."
version: 2
---

# /명령어 — 실제 파일에서 읽어온다

**목록을 이 문서에 박아두지 않는다.** 박으면 스킬을 추가할 때마다 갱신해야 하고,
잊으면 거짓말하는 문서가 된다. 매번 세어서 보여준다.

## 실행

```bash
# 슬래시 명령 (한글명 = 이 프로젝트 전용, 영문명 = 템플릿 유래)
for d in .claude/skills/*/; do
  n=$(basename "$d")
  desc=$(grep -m1 '^description:' "$d/SKILL.md" 2>/dev/null | cut -c14-100)
  printf '%-16s %s\n' "/$n" "$desc"
done

# 커맨드 폴더는 없다 — 2026-07-30 에 전부 한국어 스킬로 흡수했다 (D19)
#   슬래시 명령 = .claude/skills/ 의 한글 폴더명 (~/.claude/commands.md)

# 스크립트 (카테고리별)
find scripts -name '*.sh' | sort
```

## 보고 형식

1. **전용 명령**(한글명)을 먼저, **템플릿 스킬**(영문명)을 뒤에. 전자가 이 프로젝트에서 실제로 쓰는 것이다.
2. 각 줄은 `이름 — description 첫 줄`. 설명을 다시 쓰지 않는다.
3. 마지막에 **개수**를 적는다 — 스킬 N개 · 커맨드 N개 · 스크립트 N개.
4. `scripts/check/` 것들은 **실패 시 exit 1**임을 함께 알린다.

## 함께 알릴 것

- 진입 문서 — `CLAUDE.md` → `docs/SESSION-START.md` → `docs/INDEX.md`
- 로봇에 명령을 보내기 전 — `docs/ref/contract/SAFETY-RULES.md` (**fail-closed**)
- 기준값을 바꿀 때 — `scripts/README.md`의 기준값 표

## 하지 말 것

- 이 문서에 명령 목록을 표로 박기 (v1의 실수였다)
- 설명을 새로 쓰기 — `description` 원문을 그대로 보여준다
