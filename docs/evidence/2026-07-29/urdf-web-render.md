# FR5 URDF 브라우저 실렌더 검증

**검증 목적**: "우리 URDF를 브라우저에서 그대로 띄울 수 있는가"와 "역기구학 없이 궤적을 만들 수 있는가"를 주장이 아니라 실제 렌더로 확인한다.

## 방법

- unpkg에서 모듈을 내려받아 로컬 http.server(포트 8901)로 서빙한 뒤 Chrome에서 실행하고 스크린샷을 촬영했다.
- 사용 파일: FR5UNITY/robotapp/Assets/Runtime/Robots/FAIRINO_FR5/fairino5_v6.urdf + meshes/ STL 7개
- three.js 0.185.1, urdf-loader 0.13.1

## 결과 (화면에 출력된 값 그대로)

- three.js r185 로드됨
- URDF 파싱 성공 — 19ms (첫 실행 120ms)
- 관절 6개: j1, j2, j3, j4, j5, j6
- 메시 0개 / 삼각형 0개 (콜백 시점)
- setJointValue 적용 후 손끝 이동 = 0.359 m
- FK 궤적 61점 생성 — 경로 길이 0.742 m
- 메시 7개 / 삼각형 58,482개 (2초 뒤 · 실제)
- 화면에 로봇이 정상 렌더되고 궤적 선이 그려짐

## 판정

통과. IK 없이 궤적 생성 가능을 확인했다. 삼각형 58,482개는 사전에 로컬 STL 파일에서 계산한 값과 정확히 일치한다.

## 발견한 함정 3가지

1. three.js r185는 빌드가 three.module.js와 three.core.js 두 파일로 쪼개져 있다. CDN에서 module만 받으면 core가 404가 나고 화면이 통째로 뜨지 않는다. 원인 메시지가 나오지 않아 네트워크 요청을 봐야 찾을 수 있었다.
2. urdf-loader는 ColladaLoader를 정적 import 한다. Collada 의존 사슬(TGALoader, ColladaParser, ColladaComposer)까지 전부 받아야 한다. 우리 메시는 전부 STL이므로 이 검증에서는 ColladaLoader를 스텁으로 대체했다. 실제 구현에서는 번들러를 쓰면 자동 해결된다.
3. STL은 비동기로 늦게 붙는다. load 콜백 시점에는 메시가 0개다. 삼각형 수를 세거나 바운딩 박스를 잡는 코드를 콜백 안에 두면 틀린 값을 얻는다.

## 한계 (정직하게 적은 것)

- Collada 경로는 스텁으로 대체했으므로 검증 대상이 아니다. 우리 메시가 전부 STL이라 무관하다.
- 데스크톱 Chrome에서만 확인했다. 폰 브라우저 성능과 AR 정합은 별도 검증이 필요하다.
