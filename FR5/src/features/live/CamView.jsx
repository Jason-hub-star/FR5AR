// 글로벌 카메라 PiP — 3D 쌍둥이 **위에** 실영상을 작게 겹쳐 띄운다.
//
// **탭 밖에 산다.** 패널 안에 두면 탭을 옮길 때마다 재마운트돼 MJPEG 연결이 끊겼다 다시
// 붙는다 — 3D 를 탭 밖에 둔 것과 같은 이유다 (`main.jsx` §레이아웃).
//
// **정합해서 겹치는 게 아니다.** 3D 를 영상 위에 얹으려면 `labToCam`(카메라 외부 파라미터)
// 이 있어야 하는데 `Shared/data/config/global-cam.json` 에는 아직 낭부 파라미터뿐이다.
// 이 화면은 나란히 보는 것이라 정합이 필요 없다 — 그래서 지금 된다. 겹치기는 그다음이다.
import { useEffect, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const OPEN_KEY = 'fr5.camOpen';
const SIZE_KEY = 'fr5.camSize';
// **`onError` 를 기다리기만 하면 안 된다** (2026-08-06 실렌더). 없는 IP 를 주면 TCP 연결이
// OS 타임아웃(수십 초)까지 매달려서 그동안 화면은 "여는 중…" 인 채로 멈춘다 — 오래된 주소가
// 남아 있으면 사람이 그걸 "곧 뜨겠지" 로 읽는다. 못 왔으면 못 왔다고 말한다 (제1원칙).
const FIRST_FRAME_MS = 8000;
const MIN_W = 132;
const MIN_H = 160;
const DEFAULT_SIZE = { width: 340, height: 600 };
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };
const writeOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* 프라이빗 모드 */ } };
const readSize = () => {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return DEFAULT_SIZE;
    const parsed = JSON.parse(raw);
    return {
      width: Math.max(MIN_W, Number(parsed.width) || DEFAULT_SIZE.width),
      height: Math.max(MIN_H, Number(parsed.height) || DEFAULT_SIZE.height),
    };
  } catch {
    return DEFAULT_SIZE;
  }
};
const writeSize = (s) => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch { /* 프라이빗 모드 */ } };

export function CamView() {
  const [open, setOpen] = useState(readOpen);
  const [live, setLive] = useState(null);   // null=첫 프레임 대기 · true=옴 · false=못 옴
  const [tries, setTries] = useState(0);    // 다시 시도 — **자동 재시도는 안 한다** (능동 폴링 금지)
  const [size, setSize] = useState(readSize);
  // **인라인 style 은 미디어쿼리를 항상 이긴다** (감사 2026-08-06 P1). `main.css` 가 폰에서
  // 132px 로 줄이려고 규칙을 써 뒀는데 여기 `style={{width}}` 가 늘 덮어써서, 저장된
  // 데스크톱 340px 이 폰에서 그대로 떠 3D 를 절반 넘게 가렸다. 좁으면 인라인을 안 준다.
  const [narrow, setNarrow] = useState(
    () => (typeof matchMedia === 'function' ? matchMedia('(max-width: 760px)').matches : false));
  const resizing = useRef(null);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(max-width: 760px)');
    const on = (e) => setNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

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

  const startResize = (e) => {
    e.preventDefault();
    resizing.current = {
      startX: e.clientX ?? e.touches?.[0]?.clientX,
      startY: e.clientY ?? e.touches?.[0]?.clientY,
      startW: size.width,
      startH: size.height,
      lastSize: size,
    };
    const move = (ev) => {
      const r = resizing.current;
      if (!r) return;
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      const next = {
        width: Math.max(MIN_W, Math.round(r.startW + (cx - r.startX))),
        height: Math.max(MIN_H, Math.round(r.startH + (cy - r.startY))),
      };
      r.lastSize = next;
      setSize(next);
    };
    const up = () => {
      if (resizing.current) writeSize(resizing.current.lastSize);
      resizing.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
  };

  return (
    <div className="camview" data-t="camview" data-open={String(open)} data-live={String(live)}
      style={open && !narrow ? { width: size.width, height: size.height } : undefined}>
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
      {/* 접었을 때는 핸들을 안 낸다 — 크기가 `auto` 라 드래그해도 화면은 그대로인데 값만
          저장돼, 다시 펴면 엉뚱한 크기가 나왔다 (감사 2026-08-06 P2). 폰에서도 안 낸다:
          너비를 CSS 가 정하므로 끌어도 안 먹는다 */}
      {open && !narrow && (
        <div className="camresize" data-t="cam-resize"
          onMouseDown={startResize} onTouchStart={startResize}
          title="드래그해서 크기 조절" />
      )}
    </div>
  );
}
