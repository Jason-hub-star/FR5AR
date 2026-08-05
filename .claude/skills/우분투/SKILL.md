---
name: 우분투
description: 로봇 브리지 호스트(우분투 PC)에 붙어 FR5 를 observe-only 로 연결하고 상태를 보고한다. "우분투", "로봇 붙여", "브리지 켜", "연결해" 트리거. 명령 승격(ARM)은 하지 않는다 — 사람이 화면에서 한다.
user_invocable: true
tags: [robot, bringup, ops]
trigger: "'우분투' · 로봇을 붙일 때 · 세션 시작 후 실기가 필요할 때"
version: 1
---

# /우분투 — 로봇 붙이기

절차 정본은 `docs/ref/runbook/FR5-BRINGUP.md`. 이 스킬은 그 ①~④를 대신 돌리고 **판정만 보고**한다.

호스트 `ej@192.168.30.240` · 팀 주소 `http://192.168.30.240:5055` · 로봇 `192.168.58.2`.
펜던트 웹앱은 `http://192.168.58.2` — **로봇과 같은 대역이라 랜선 하나를 나눠 쓴다** (D68).

## 순서 (막히면 그 단계에서 멈추고 보고한다)

### 0. 우분투가 켜져 있나

```bash
ping -c 2 -t 3 192.168.30.240 | tail -2
```

무응답이면 **PC 가 꺼졌거나 망에 없다.** 원격으로 켤 방법이 없으니 여기서 멈추고
사람에게 전원을 부탁한다 — 그 아래 단계를 돌려도 전부 같은 이유로 실패한다.

### 1. 로봇이 우분투에서 닿나

```bash
ssh -o ConnectTimeout=5 ej@192.168.30.240 'ping -c 2 -W 2 192.168.58.2 | tail -2'
```

실패면 **선이냐 주소냐**부터 가른다 — 처방이 다르다:

```bash
ssh ej@192.168.30.240 'cat /sys/class/net/enp3s0/carrier; ip -brief addr show enp3s0'
```

- `carrier: 0` → **랜선이다.** 컨트롤러에 꽂아 달라고 한다 (원격으로 못 고친다)
- `carrier: 1` 이고 `192.168.58.10` 도 있다 → **우리 쪽은 정상이다.** `ip neigh show dev enp3s0`
  가 `INCOMPLETE` 면 상대가 조용한 것이다 — `journalctl -k | grep enp3s0` 로 **링크가 최근에
  끊겼다 붙었는지** 본다. 흔들리는 중이면 몇 분 뒤 저절로 돌아온다 (2026-08-05 실측)
- `carrier: 1` 인데 `192.168.58.10` 이 없다 → 유선 프로필이 안 올라왔다. 부탁한다 (sudo 필요):

```
! ssh -t ej@192.168.30.240 'sudo nmcli connection up "Wired connection 1"'
```

⚠ **`enp3s0` 에 프로필이 둘 있다** — 팀원이 만든 `"Wired connection 1"`(58.10 만)과
우리 netplan 산 `netplan-enp3s0`(57.10+58.10). **어느 쪽이 올라와도 `58.10` 은 있으므로
로봇·펜던트 둘 다 닿는다** (2026-08-05 실측). 둘을 합치는 것은 팀원 동의 후에 한다.
⚠ **여러 줄 YAML 을 답변에서 복사해 붙이게 하지 않는다** — 들여쓰기 공백이 NBSP 로 바뀌어
YAML 이 조용히 무효가 된다. 파일은 `scp` 로 보낸다 (2026-08-04 실측 · 4번 실패).

### 2. 브리지가 살아 있나

```bash
rtk proxy curl -s -m 5 http://192.168.30.240:5055/robots | head -c 60
```

비었으면 재시작:

```bash
ssh ej@192.168.30.240 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart fr5-bridge'
```

그래도 안 되면 로그를 본다 — `journalctl --user -u fr5-bridge -n 50`.

### 3. observe-only 연결

```bash
rtk proxy curl -s -X POST http://192.168.30.240:5055/connect \
  -H 'Content-Type: application/json' -d '{"robotId":"fr5-lab-a","observeOnly":true}'
```

`{"ok":true,"phase":"OBSERVE_ONLY"}` 가 정답. 거부되면 **사유를 그대로 옮긴다** —
모델 불일치·xmlrpc 실패는 원인이 다르다 (`FR5-BRINGUP.md` §안 될 때).

**`xmlrpc 검증 실패 — GetSoftwareVersion=-4` 면 브리지를 한 번 재시작하고 다시 시도한다.**
배포가 랜 링크 흔들림에 걸리면 `20003`·`20004` 에 **죽은 소켓**이 남아 링크가 돌아와도
계속 `-4` 를 낸다 (2026-08-05 실측 — 이 한 번으로 붙었다). **재시도는 여기까지다** —
두 번째도 실패하면 멈추고 보고한다. 로봇을 껐다 켜라고 하지 않는다.

### 4. 값이 흐르나

```bash
rtk proxy curl -s http://192.168.30.240:5055/state | python3 -c 'import json,sys; s=json.load(sys.stdin); print("phase:", s["phase"], "| 서보:", s.get("enabled"), "| 관절:", s["jointsDeg"])'
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
