# FR5 브링업 — 우분투 호스트에서 5분 안에 로봇 붙이기

분류: **SSOT**. 아침에 이것만 따라 한다. 왜 이런 구조인지는 D42·D45·D46,
막히면 §안 될 때 로 간다.

**주소 — 팀은 이것만 안다: `http://192.168.10.49:5055`**

## 물리 확인 (1분)

1. 로봇 컨트롤러 전원 · 비상정지 버튼 **해제** 상태
2. 로봇 ↔ 우분투 **랜선** 연결 (우분투의 USB 이더넷 쪽, 고정 IP `192.168.57.10/24`)
3. 우분투 전원 · 팀 와이파이 접속

## 명령 (맥에서 전부 원격으로 · 4분)

```bash
# ① 로봇이 우분투에서 닿나 — 여기서 막히면 랜선·전원 문제다
ssh ej@192.168.10.49 'ping -c 2 192.168.57.2'

# ② 브리지 살아 있나 (systemd 가 부팅 때 자동 기동한다 — 보통 이미 떠 있다)
rtk proxy curl -s http://192.168.10.49:5055/robots | head -c 60
#   비어 있으면: ssh ej@192.168.10.49 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart fr5-bridge'

# ③ 로봇 연결 (observe-only — 아직 명령은 못 보낸다)
rtk proxy curl -s -X POST http://192.168.10.49:5055/connect \
  -H 'Content-Type: application/json' -d '{"robotId":"fr5-lab-a","observeOnly":true}'
#   → {"ok":true,"phase":"OBSERVE_ONLY"}

# ④ 값이 흐르나
rtk proxy curl -s http://192.168.10.49:5055/state | python3 -m json.tool | head -20
```

**맥에서 `/state` 를 볼 때는 `rtk proxy curl` 을 쓴다** — 그냥 `curl` 로 파이프하면
rtk 훅이 출력을 510바이트에서 잘라 JSON 이 깨진 것처럼 보인다 (2026-08-03 실측·GAP CLOSED).

## 코드를 고쳤다면

```bash
bash scripts/deploy/fr5-ubuntu.sh    # 맥 빌드 → rsync → 서비스 재시작 → 로봇 재연결
```

## 조작까지 (사람이 화면에서)

`http://192.168.10.49:5055` 를 열고 — 이름 입력 → **조종권 잡기** → `현장확인` 체크 →
**ARM**(서보 ON) → 조그. 끝나면 **DISARM → 조종권 반납**.
`ARM` 은 조종권 보유자만 되고, 로봇 옆에 사람이 있을 때만 한다 (하드 룰 3).

## 안 될 때

| 증상 | 원인·조치 |
|---|---|
| ping 실패 | 랜선 또는 `Wired connection 1` 의 고정 IP 가 풀렸다 → `nmcli connection up "Wired connection 1"` (sudo) |
| `/robots` 무응답 | 서비스가 죽었다 → `systemctl --user restart fr5-bridge` · 로그 `journalctl --user -u fr5-bridge -n 50` |
| connect 가 **모델 불일치**로 거부 | 다른 개체가 배정됐다. `config.yaml` 의 `expectedModel` 과 실측을 대조 — **추측으로 고치지 않는다** |
| connect 가 xmlrpc 실패 | 컨트롤러가 이전 세션을 쥐고 있을 수 있다 → 컨트롤러 재부팅. 20003 은 **연결 하나뿐**이라 브리지 밖에서 붙지 않는다 |
| ARM 이 `-4` | 펜던트에서 서보 Enable · 자동 모드 · 전역 속도 0% 아닌지 확인 |
| 조그가 안 먹는다 | 1° 는 손끝에서 약 16mm 라 눈에 잘 안 보인다. `/state` 의 관절값 변화로 판정한다 |

## 그리퍼

실물은 **PGE A-100-40**(대환), 펜던트 설정은 제조업체 DAHUAN · 유형 PGI-140 · 말단 1번.
브리지 구현은 아직 없다 — 사다리 1칸(`docs/goals/GOAL-live-gripper.md`)에서 붙인다.
