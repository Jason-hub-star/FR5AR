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
//
// **상태 판정을 여기서 짜지 않는다** (2026-08-07). 무엇이 경고인지는
// `Shared/data/camera/state.js` 한 곳이 정하고, 이 파일은 그게 낸 문장과 색을 **그리기만**
// 한다. AR 화면도 같은 함수를 부를 것이라, 판정을 화면에 두면 거기서 갈라진다.
import { useEffect, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { cameraState } from '@fr5/shared/data/camera/state.js';
import { watchFrames } from '@fr5/shared/data/camera/watch.js';

// 캘리브레이션은 `map/intrinsics.py` 의 산출물이라 **캘리브 전에는 정상적으로 없다.**
// 정적 import 로 두면 아무도 캘리브하기 전까지 빌드가 통째로 깨진다 (`AR/src/screens/cam.js`
// 와 같은 규약). glob 은 안 맞으면 빈 객체다
const CALIB = Object.values(import.meta.glob('../../../../Shared/data/config/global-cam.json', {
  eager: true, import: 'default',
}))[0] ?? null;
// 폰 설정은 조용히 되돌아간다(D64) — 자주 볼 필요는 없고, 안 보면 모른다
const STATUS_MS = 15000;
// **마감시각을 건다.** 없는 IP 로 `fetch` 하면 OS 타임아웃(수십 초)까지 매달리는데,
// 그동안 상태는 "아직 안 물어봄"(조용함)에 머문다 — `FIRST_FRAME_MS` 와 똑같은 함정이다.
// 랜 안의 `status.json` 이 이보다 오래 걸릴 이유가 없다 (2026-08-07 실렌더에서 밟았다)
const STATUS_TIMEOUT_MS = 4000;

const OPEN_KEY = 'fr5.camOpen';
// **키를 갈았다** (2026-08-07 세로→가로). 안 갈면 사람들 브라우저에 저장된 9:16 크기가
// 그대로 살아나 가로 영상이 위아래로 크게 남는 칸에 뜬다 — 코드는 고쳤는데 화면은 안 바뀐다
const SIZE_KEY = 'fr5.camSize.landscape';
// **`onError` 를 기다리기만 하면 안 된다** (2026-08-06 실렌더). 없는 IP 를 주면 TCP 연결이
// OS 타임아웃(수십 초)까지 매달려서 그동안 화면은 "여는 중…" 인 채로 멈춘다 — 오래된 주소가
// 남아 있으면 사람이 그걸 "곧 뜨겠지" 로 읽는다. 못 왔으면 못 왔다고 말한다 (제1원칙).
const FIRST_FRAME_MS = 8000;
// 끊김 감시는 `Shared/data/camera/watch.js` 가 한다 (2026-08-07 이관) — AR 도 같은 것을 쓴다.
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
  // `undefined`=아직/안 물어봄 · `null`=물어봤는데 못 읽음(경고) · 객체=읽음. 그 셋을 가른다
  const [status, setStatus] = useState(undefined);
  const [ageMs, setAgeMs] = useState(null);    // 마지막 픽셀 변화 뒤 지난 시간. null=아직 모름
  const resizing = useRef(null);
  const imgRef = useRef(null);

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

  // ── 감시. **`tries` 가 바뀌면 새로 건다** — `<img>` 가 갈려 끼워졌으니 옛 표본은 버린다
  useEffect(() => {
    if (!open || live !== true) return undefined;
    return watchFrames(imgRef.current, ({ stale: s, lastChangeMsAgo }) => {
      setStale(s);
      setAgeMs(lastChangeMsAgo);
    });
  }, [open, live, tries]);

  // ── 복구: 못 붙었거나(live=false) 얼어붙었으면(stale) 스스로 다시 끼운다.
  // 간격을 점점 벌려 죽은 주소에 매달리지 않는다
  useEffect(() => {
    if (!open || (live !== false && !stale)) return undefined;
    const t = setTimeout(() => {
      // `stale` 은 여기서 안 푼다 — 감시가 새 프레임을 실제로 본 뒤에 푼다.
      // `tries` 가 오르면 감시도 새로 걸리므로 옛 표본은 저절로 버려진다
      setLive(null);
      setTries((n) => n + 1);
    }, RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]);
    return () => clearTimeout(t);
  }, [open, live, stale, tries]);

  // ── 폰 설정 되읽기. **영상이 멀쩡해도 보정이 무효일 수 있다** — 2026-08-06(D64) 에
  // 앱이 혼자 1920×1080·q49·auto 로 돌아가 있었고 화면은 아무 말도 안 했다.
  // 못 읽으면 `null` 을 그대로 넘긴다. 판정 함수가 그걸 "정상"이 아니라 "확인 못 함"으로 읽는다
  const host = datasource.cameraHost();
  useEffect(() => {
    // **접어도 계속 묻는다.** 접었다고 카메라가 카메라가 아닌 게 아니고, 접힌 채 벽에 걸린
    // 화면이 조용한 게 제일 나쁘다 — 접으면 경고가 사라지는 걸 실렌더에서 밟았다 (2026-08-07)
    if (!host) { setStatus(undefined); return undefined; }
    let dead = false;
    const read = async () => {
      try {
        const r = await fetch(`http://${host}/status.json`,
          { cache: 'no-store', signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
        const j = await r.json();
        if (!dead) setStatus(j?.curvals ?? null);
      } catch {
        if (!dead) setStatus(null);   // CORS 든 무응답이든 **모르는 것은 모르는 것**이다
      }
    };
    read();
    const id = setInterval(read, STATUS_MS);
    return () => { dead = true; clearInterval(id); };
  }, [host, tries]);

  const src = datasource.cameraFeedUrl();
  // 주소를 아무도 안 준 상태는 "기능을 안 켠 것"이다 — 빈 상자를 띄우지 않는다.
  // 반대로 주소가 있는데 영상이 안 오는 것은 **반드시 보여준다** (아래 data-live="false").
  if (!src) return null;

  const toggle = () => { const v = !open; setOpen(v); writeOpen(v); };
  const retry = () => { setStale(false); setLive(null); setTries((n) => n + 1); };

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

  // 판정은 전부 `Shared/data/camera/state.js` 가 한다 (위 §머리말). 여기서 하는 일은
  // 어느 줄을 머리띠에 놓고 어느 줄을 아래 띠에 놓느냐 — **배치**뿐이다
  const rows = cameraState({
    calib: CALIB,
    status,
    observed: {
      live,
      stale,
      streamW: imgRef.current?.naturalWidth || null,
      streamH: imgRef.current?.naturalHeight || null,
      lastChangeMsAgo: ageMs,
    },
  });
  const link = rows.find((r) => r.key === 'link');
  const hud = rows.filter((r) => r.key !== 'link');
  // **접었을 때도 경고는 보여야 한다.** 아래 띠는 펴야 보이는데, 접힌 채 벽에 걸린 화면이
  // 조용한 것이 제일 나쁘다 — 머리띠 색으로 올린다
  const warn = rows.some((r) => r.tone === 'warn');

  return (
    <div className="camview" data-t="camview" data-open={String(open)} data-live={String(live)}
      data-stale={String(stale)} data-warn={String(warn)}
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
        <span className="camstat" data-t="cam-stat">{`${link.label} · ${host}`}</span>
        <button type="button" className="camtoggle" data-t="cam-toggle"
          title={open ? '접기' : '펴기'} onClick={toggle}>{open ? '▾' : '▸'}</button>
      </div>
      {/* 상태 띠 — 영상 위에 겹치지 않고 위쪽에 자리를 차지한다. 영상 위에 얹으면
          어두운 장면에서 글자가 사라지고, 그때가 하필 카메라를 의심할 때다 */}
      {open && (
        <div className="camhud" data-t="cam-hud">
          {hud.map((r) => (
            <span key={r.key} data-t={`cam-hud-${r.key}`} data-tone={r.tone}>{r.label}</span>
          ))}
        </div>
      )}
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
