---
name: 우분투
description: 로봇 브리지 호스트(우분투 PC)에 붙어 FR5 를 observe-only 로 연결하고 상태를 보고한다. "우분투", "로봇 붙여", "브리지 켜", "연결해" 트리거. 명령 승격(ARM)은 하지 않는다 — 사람이 화면에서 한다.
user_invocable: true
tags: [robot, bringup, ops]
trigger: "'우분투' · 로봇을 붙일 때 · 세션 시작 후 실기가 필요할 때"
version: 1
---

# /우분투 — 로봇 붙이기

절차 정본은 `docs/ref/FR5-BRINGUP.md`. 이 스킬은 그 ①~④를 대신 돌리고 **판정만 보고**한다.

호스트 `ej@192.168.10.49` · 팀 주소 `http://192.168.10.49:5055` · 로봇 `192.168.57.2`.

## 순서 (막히면 그 단계에서 멈추고 보고한다)

### 0. 우분투가 켜져 있나

```bash
ping -c 2 -t 3 192.168.10.49 | tail -2
```

무응답이면 **PC 가 꺼졌거나 망에 없다.** 원격으로 켤 방법이 없으니 여기서 멈추고
사람에게 전원을 부탁한다 — 그 아래 단계를 돌려도 전부 같은 이유로 실패한다.

### 1. 로봇이 우분투에서 닿나

```bash
ssh -o ConnectTimeout=5 ej@192.168.10.49 'ping -c 2 -W 2 192.168.57.2 | tail -2'
```

실패면 **랜선 또는 고정 IP** 다. `ssh ej@… 'ip -brief addr'` 로 로봇쪽 NIC 에
`192.168.57.10/24` 가 붙어 있는지 본다. 없으면 사람에게 아래를 부탁한다 (sudo 필요):

```
! ssh -t ej@192.168.10.49 'sudo nmcli connection up "Wired connection 1"'
```

### 2. 브리지가 살아 있나

```bash
rtk proxy curl -s -m 5 http://192.168.10.49:5055/robots | head -c 60
```

비었으면 재시작:

```bash
ssh ej@192.168.10.49 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart fr5-bridge'
```

그래도 안 되면 로그를 본다 — `journalctl --user -u fr5-bridge -n 50`.

### 3. observe-only 연결

```bash
rtk proxy curl -s -X POST http://192.168.10.49:5055/connect \
  -H 'Content-Type: application/json' -d '{"robotId":"fr5-lab-a","observeOnly":true}'
```

`{"ok":true,"phase":"OBSERVE_ONLY"}` 가 정답. 거부되면 **사유를 그대로 옮기고 멈춘다** —
모델 불일치·xmlrpc 실패는 원인이 다르다 (`FR5-BRINGUP.md` §안 될 때).

### 4. 값이 흐르나

```bash
rtk proxy curl -s http://192.168.10.49:5055/state | python3 -c 'import json,sys; s=json.load(sys.stdin); print("phase:", s["phase"], "| 서보:", s.get("enabled"), "| 관절:", s["jointsDeg"])'
```

**맥에서는 `rtk proxy curl` 을 쓴다.** 그냥 `curl` 로 파이프하면 rtk 훅이 출력을
510바이트에서 잘라 JSON 이 깨진 것처럼 보인다 (2026-08-03 실측).

## 보고 형식

성공하면 세 줄로 끝낸다 — **주소** · **phase 와 관절값** · **다음에 사람이 할 일**
(이름 입력 → 조종권 → 현장확인 → ARM). 중간에 막혔으면 **어느 단계에서 무엇이 나왔는지**와
그 단계의 조치를 적는다.

## 하지 말 것

- **ARM 하지 않는다.** 서보를 올리는 것은 로봇 옆에 사람이 있을 때 화면에서 한다 (하드 룰 3)
- 20003 에 브리지 밖에서 붙지 않는다 — 연결이 하나뿐이라 컨트롤러가 넘어간다
- 코드를 고쳤다면 이 스킬 대신 `bash scripts/deploy/fr5-ubuntu.sh` (배포 후 재연결까지 한다)
- 거부 사유를 추측으로 고치지 않는다. `config.yaml` 의 기대값은 실측으로만 바꾼다
