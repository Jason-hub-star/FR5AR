// 글로벌 카메라 PiP — 3D 쌍둥이 **위에** 실영상을 작게 겹쳐 띄운다.
//
// **탭 밖에 산다.** 패널 안에 두면 탭을 옮길 때마다 재마운트돼 MJPEG 연결이 끊겼다 다시
// 붙는다 — 3D 를 탭 밖에 둔 것과 같은 이유다 (`main.jsx` §레이아웃).
//
// **아직 정합해서 겹치는 게 아니다.** 이 화면은 3D 와 실영상을 나란히 보는 것이라 정합이
// 필요 없다 — 그래서 먼저 됐다. 겹치기(공간 HUD)는 그 위에 얹는 다음 단계다.
//
// 폰은 **가로로 장착**한다 (2026-08-07). 세로였을 때는 CSS 로 90° 돌려 보여줬는데,
// 돌아간 이미지에 오버레이를 얹으면 가운데만 맞고 모서리가 338~587px 어긋난다.
// 가로로 바꾸면서 그 회전을 없앴다 — 겹치기의 선행 조건이었다.
import { useEffect, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const OPEN_KEY = 'fr5.camOpen';
// **키를 갈았다** (2026-08-07 세로→가로). 안 갈면 사람들 브라우저에 저장된 9:16 크기가
// 그대로 살아나 가로 영상이 위아래로 크게 남는 칸에 뜬다 — 코드는 고쳤는데 화면은 안 바뀐다
const SIZE_KEY = 'fr5.camSize.landscape';
// **`onError` 를 기다리기만 하면 안 된다** (2026-08-06 실렌더). 없는 IP 를 주면 TCP 연결이
// OS 타임아웃(수십 초)까지 매달려서 그동안 화면은 "여는 중…" 인 채로 멈춘다 — 오래된 주소가
// 남아 있으면 사람이 그걸 "곧 뜨겠지" 로 읽는다. 못 왔으면 못 왔다고 말한다 (제1원칙).
const FIRST_FRAME_MS = 8000;
// ── 끊김 복구 (2026-08-07). **MJPEG 는 끊겨도 아무 이벤트가 안 온다.**
// `load` 는 첫 프레임 때 한 번뿐이고(10초에 1회 실측), 서버가 연결을 닫아도 `<img>` 는
// 마지막 프레임을 그대로 들고 조용히 서 있는다. 그날 폰 앱이 네 번 재시작했는데
// 화면은 멀쩡해 보였다 — **안전 표시에서 이게 제일 나쁜 실패다** (SAFETY-RULES 제1원칙).
//
// 그래서 픽셀로 잰다. 작은 캔버스에 옮겨 그려 값이 그대로면 죽은 것이다. 장면이 정말
// 안 움직여도 JPEG 잡음 때문에 프레임마다 값이 달라진다 — 완전 동일은 "새 프레임 없음"이다.
const WATCH_MS = 3000;        // 이 간격으로 본다
const STALE_HITS = 3;         // 연속 이만큼 그대로면 죽은 것으로 친다 (약 9초)
const PROBE_W = 32;           // 캔버스 크기. 원본을 다 읽으면 비싸다
const PROBE_H = 18;
// 못 붙었을 때도 사람이 누를 때까지 기다리지 않는다 — 벽에 걸린 화면 앞에 사람이 없다.
// 다만 **간격을 벌려서** 죽은 주소에 계속 매달리지 않는다 (능동 폴링 금지의 취지).
const RETRY_MS = [3000, 6000, 12000, 20000, 30000];
// 가로 16:9 — 높이는 영상(width×9/16)에 머리띠 26px 을 더한 값이다.
// **기본값은 게이트 상한(3D 의 10%)에 걸린다** — 360x229 는 12.4% 로 떨어졌다 (2026-08-07).
// 300x195 는 8.8% 다. 더 크게 보고 싶으면 사람이 끌어서 키운다 (그 크기는 기억된다).
const MIN_W = 160;
const MIN_H = 116;
const DEFAULT_SIZE = { width: 300, height: 195 };
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
  const [tries, setTries] = useState(0);    // 이 값이 바뀌면 `<img>` 가 갈려 끼워진다
  const [stale, setStale] = useState(false);  // 붙어는 있는데 새 프레임이 안 온다
  const [size, setSize] = useState(readSize);
  // **인라인 style 은 미디어쿼리를 항상 이긴다** (감사 2026-08-06 P1). `main.css` 가 폰에서
  // 132px 로 줄이려고 규칙을 써 뒀는데 여기 `style={{width}}` 가 늘 덮어써서, 저장된
  // 데스크톱 340px 이 폰에서 그대로 떠 3D 를 절반 넘게 가렸다. 좁으면 인라인을 안 준다.
  const [narrow, setNarrow] = useState(
    () => (typeof matchMedia === 'function' ? matchMedia('(max-width: 760px)').matches : false));
  const resizing = useRef(null);
  const imgRef = useRef(null);
  const probe = useRef(null);      // {canvas, last, hits, tainted}

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

  // ── 감시: 붙어 있는데 새 프레임이 안 오는가 (위 §끊김 복구)
  useEffect(() => {
    if (!open || live !== true) return undefined;
    const id = setInterval(() => {
      const el = imgRef.current;
      if (!el || !el.naturalWidth) return;
      let p = probe.current;
      if (!p) {
        const canvas = document.createElement('canvas');
        canvas.width = PROBE_W; canvas.height = PROBE_H;
        p = probe.current = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }),
                              last: null, hits: 0, tainted: false };
      }
      if (p.tainted) return;         // 픽셀을 못 읽는 카메라면 감시를 접는다 (아래)
      let now;
      try {
        p.ctx.drawImage(el, 0, 0, PROBE_W, PROBE_H);
        now = p.ctx.getImageData(0, 0, PROBE_W, PROBE_H).data;
      } catch {
        // `crossOrigin` 이 안 먹는 카메라 — 캔버스가 오염돼 읽을 수 없다.
        // **감시만 포기하고 영상은 계속 보여준다.** 못 재는 것과 안 되는 것은 다르다
        p.tainted = true;
        return;
      }
      const hadPrev = p.last !== null;
      let same = hadPrev;
      if (same) { for (let i = 0; i < now.length; i += 4) { if (now[i] !== p.last[i]) { same = false; break; } } }
      p.last = now;
      if (!hadPrev) return;        // 첫 표본은 비교 대상이 없다
      p.hits = same ? p.hits + 1 : 0;
      // **경고는 새 프레임을 실제로 본 뒤에만 푼다.** 다시 끼우자마자 풀면 화면이
      // "정상 → 멈춤" 을 번갈아 깜빡여, 사람이 그 순간을 정상으로 읽는다
      if (p.hits >= STALE_HITS) { p.hits = 0; setStale(true); }
      else if (!same) setStale(false);
    }, WATCH_MS);
    return () => clearInterval(id);
  }, [open, live, tries]);

  // ── 복구: 못 붙었거나(live=false) 얼어붙었으면(stale) 스스로 다시 끼운다.
  // 간격을 점점 벌려 죽은 주소에 매달리지 않는다
  useEffect(() => {
    if (!open || (live !== false && !stale)) return undefined;
    const t = setTimeout(() => {
      probe.current = null;        // `stale` 은 안 푼다 — 위 §감시가 새 프레임을 보고 푼다
      setLive(null);
      setTries((n) => n + 1);
    }, RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]);
    return () => clearTimeout(t);
  }, [open, live, stale, tries]);

  const src = datasource.cameraFeedUrl();
  // 주소를 아무도 안 준 상태는 "기능을 안 켠 것"이다 — 빈 상자를 띄우지 않는다.
  // 반대로 주소가 있는데 영상이 안 오는 것은 **반드시 보여준다** (아래 data-live="false").
  if (!src) return null;

  const toggle = () => { const v = !open; setOpen(v); writeOpen(v); };
  const retry = () => { probe.current = null; setStale(false); setLive(null); setTries((n) => n + 1); };

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
      data-stale={String(stale)}
      style={open && !narrow ? { width: size.width, height: size.height } : undefined}>
      <div className="camhead">
        {/* 실물과 3D 를 헷갈리는 것이 이 프로젝트에서 가장 비싼 오해다 (SR_24) —
            라벨을 옵션으로 두지 않는다 */}
        <b>실영상</b>
        {/* **멈춘 것을 "정상"으로 보이게 두지 않는다** — 옛 프레임이 그대로 걸려 있는 게
            안전 표시에서 제일 나쁜 모양이다 (SAFETY-RULES 제1원칙) */}
        {/* **실패할 때도 주소를 보여준다.** "영상 없음" 만 띄우면 사람이 고칠 수가 없다 —
            저장된 주소가 옛 IP 인 게 가장 흔한 원인인데 그걸 화면에서 확인할 길이 없었다
            (2026-08-07 실기: 우분투에서 안 뜨는 원인을 화면만 보고 못 좁혔다) */}
        <span className="camstat" data-t="cam-stat">
          {stale ? `멈춤 · ${datasource.cameraHost()}`
            : live === true ? datasource.cameraHost()
              : live === false ? `안 옴 · ${datasource.cameraHost()}` : `여는 중… ${datasource.cameraHost()}`}
        </span>
        <button type="button" className="camtoggle" data-t="cam-toggle"
          title={open ? '접기' : '펴기'} onClick={toggle}>{open ? '▾' : '▸'}</button>
      </div>
      {open && (
        <div className="cambody">
          {/* MJPEG 는 연결을 계속 붙들고 있다 — key 로 갈아 끼워야 다시 붙는다.
              `crossOrigin` 은 **감시용**이다 — 이게 없으면 캔버스가 오염돼 프레임이
              멎었는지 못 잰다. IP Webcam 은 `Access-Control-Allow-Origin: *` 를 준다
              (2026-08-06 실측). 안 주는 카메라면 감시만 접고 영상은 계속 나온다 */}
          <img key={tries} ref={imgRef} data-t="cam-img" alt="글로벌 카메라"
            crossOrigin="anonymous"
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
