// 글로벌 카메라 PiP — 3D 쌍둥이 **위에** 실영상을 작게 겹쳐 띄운다.
//
// **탭 밖에 산다.** 패널 안에 두면 탭을 옮길 때마다 재마운트돼 MJPEG 연결이 끊겼다 다시
// 붙는다 — 3D 를 탭 밖에 둔 것과 같은 이유다 (`main.jsx` §레이아웃).
//
// **정합해서 겹치는 게 아니다.** 3D 를 영상 위에 얹으려면 `labToCam`(카메라 외부 파라미터)
// 이 있어야 하는데 `Shared/data/config/global-cam.json` 에는 아직 내부 파라미터뿐이다.
// 이 화면은 나란히 보는 것이라 정합이 필요 없다 — 그래서 지금 된다. 겹치기는 그다음이다.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const OPEN_KEY = 'fr5.camOpen';
// **`onError` 를 기다리기만 하면 안 된다** (2026-08-06 실렌더). 없는 IP 를 주면 TCP 연결이
// OS 타임아웃(수십 초)까지 매달려서 그동안 화면은 "여는 중…" 인 채로 멈춘다 — 오래된 주소가
// 남아 있으면 사람이 그걸 "곧 뜨겠지" 로 읽는다. 못 왔으면 못 왔다고 말한다 (제1원칙).
const FIRST_FRAME_MS = 8000;
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };
const writeOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* 프라이빗 모드 */ } };

export function CamView() {
  const [open, setOpen] = useState(readOpen);
  const [live, setLive] = useState(null);   // null=첫 프레임 대기 · true=옴 · false=못 옴
  const [tries, setTries] = useState(0);    // 다시 시도 — **자동 재시도는 안 한다** (능동 폴링 금지)

  // 첫 프레임 기다리기 — 한 번만 재고 끝낸다. 반복 확인이 아니라 마감시각이다
  useEffect(() => {
    const t = setTimeout(() => setLive((v) => (v === null ? false : v)), FIRST_FRAME_MS);
    return () => clearTimeout(t);
  }, [tries]);

  const src = datasource.cameraFeedUrl();
  // 주소를 아무도 안 준 상태는 "기능을 안 켠 것"이다 — 빈 상자를 띄우지 않는다.
  // 반대로 주소가 있는데 영상이 안 오는 것은 **반드시 보여준다** (아래 data-live="false").
  if (!src) return null;

  const toggle = () => { const v = !open; setOpen(v); writeOpen(v); };
  const retry = () => { setLive(null); setTries((n) => n + 1); };

  return (
    <div className="camview" data-t="camview" data-open={String(open)} data-live={String(live)}>
      <div className="camhead">
        {/* 실물과 3D 를 헷갈리는 것이 이 프로젝트에서 가장 비싼 오해다 (SR_24) —
            라벨을 옵션으로 두지 않는다 */}
        <b>실영상</b>
        <span className="camstat" data-t="cam-stat">
          {live === true ? datasource.cameraHost() : live === false ? '영상 없음' : '여는 중…'}
        </span>
        <button type="button" className="camtoggle" data-t="cam-toggle"
          title={open ? '접기' : '펴기'} onClick={toggle}>{open ? '▾' : '▸'}</button>
      </div>
      {open && (
        <div className="cambody">
          {/* MJPEG 는 연결을 계속 붙들고 있다 — key 로 갈아 끼워야 다시 붙는다 */}
          <img key={tries} data-t="cam-img" alt="글로벌 카메라"
            src={tries ? `${src}?_=${tries}` : src}
            onLoad={() => setLive(true)} onError={() => setLive(false)} />
          {live === false && (
            <button type="button" className="camretry" data-t="cam-retry" onClick={retry}>
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
