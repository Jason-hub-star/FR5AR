# FR5 실기 읽기 전용 기준값

분류: **증거**. 2026-07-31 실물 FR5에 모션 명령 없이 연결해 읽은 값이다.

## 연결 경로

| 항목 | 관측값 |
|---|---|
| Mac 유선 어댑터 | `USB 10/100 LAN` (`en5`, 100BASE-TX full duplex) |
| Mac 주소 | `192.168.57.10/24` |
| 응답한 컨트롤러 | `192.168.57.2:8080` |
| ping | 3/3, 손실 0%, 평균 0.726ms |
| ARP | `00:6c:79:50:37:c2` |

펜던트에는 eth0=`192.168.57.2`, eth1=`192.168.58.2`가 표시됐고 사용자는 물리 포트
“1”에 연결했다고 확인했다. 그러나 `.58.2`는 ARP·TCP가 응답하지 않았고 `.57.2`만 응답했다.
따라서 구현은 **포트 라벨로 주소를 추정하지 않고** 후보 주소의 ARP/TCP·SDK readback으로
실제 경로를 판정해야 한다.

FAIRINO 공식 문서도 카드 0 기본값을 `192.168.57.2`, 카드 1 기본값을
`192.168.58.2`로 설명한다.

- <https://manual.fairino.support/latest/CobotsManual/system.html#network-settings>
- <https://manual.fairino.support/latest/CobotsManual/installation.html#rj45-network-interface-group>

## SDK 읽기 결과

Unity 6000.3.11f1의 기존 `FairinoLiveSmokeRunner`를 macOS Arm64 배치 모드로 실행했다.
호출은 `Connect → GetVersion → ReadState → Disconnect`뿐이며 Enable·모드 변경·드래그 티칭
종료·조그·MoveJ/MoveL·그리퍼·IO·오류 리셋은 호출하지 않았다.

| 항목 | 읽은 값 |
|---|---|
| 결과 | `CONNECT_OK` |
| SDK 로드 | `libfairino`, direct-motion client |
| 컨트롤러 | `FR_CTRL_FV2.010.12` — 2025-04-29 15:32:26 |
| 서보 1~6 | `FR_SERVO_FV5.043.16` — 2025-07-15 16:20:44 |
| 엔드 | `FR05_End_FV2.010.11` — 2025-07-16 14:01:18 |
| SDK / Web | `C#SDK-V1.2.4` / `Web-3.9.3` |
| 관절각 ° | `[-80.851326, -98.353310, 91.248093, -89.073883, -89.751343, 6.898761]` |
| TCP mm·° | `[227.570862, -62.282482, 56.726894, -173.889771, 0.986040, 2.315017]` |

이 결과는 **C# SDK의 macOS 직접 readback 가능성**만 닫는다. Python SDK 설치·macOS 동작,
지속 폴링 안정성, 안전 필드 실시간값, 모션 명령은 아직 검증하지 않았다.

## 환경 변경

Mac 어댑터는 기존 `192.168.10.200/24`에서 `192.168.57.10/24`로 바꿨고 현재 연결 유지를
위해 그대로 두었다. 로봇 관리자 인증정보는 저장하거나 로그에 남기지 않았다.

