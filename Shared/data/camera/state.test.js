// `state.js` 단위 검사 — **브라우저 없이 판정을 다 본다.**
//
// 실렌더 게이트(`fr5-cam-verify.mjs`)는 "그려지는가"를 보고, 여기는 "각 판정이 맞는가"를
// 본다. 브리지 쪽 `fr5-unit.sh` 와 같은 나눔이다.
// 표준 라이브러리만 쓴다 — `node:test` 는 Node 내장이라 새 의존성 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraState } from './state.js';

const CALIB = { verified: true, intrinsics: { widthPx: 2560, heightPx: 1440 },
  labToCam: { rmsPx: 1.568 } };
const LOCKED = { quality: '90', whitebalance: 'fluorescent', zoom: '100' };
const at = (rows, key) => rows.find((r) => r.key === key);

test('전부 정상이면 경고가 하나도 없다', () => {
  const rows = cameraState({ calib: CALIB, status: LOCKED,
    observed: { live: true, stale: false, streamW: 2560, streamH: 1440, lastChangeMsAgo: 1200 } });
  assert.equal(rows.filter((r) => r.tone === 'warn').length, 0);
  assert.equal(at(rows, 'link').label, 'LIVE');
  assert.equal(at(rows, 'resolution').label, '2560×1440');
});

// ── 제1원칙: 못 읽은 값은 통과가 아니다
test('보정이 없으면 통과가 아니라 경고다', () => {
  const rows = cameraState();
  assert.equal(at(rows, 'calib').tone, 'warn');
  assert.equal(at(rows, 'link').tone, 'mute');       // 여는 중은 아직 판정이 아니다
});

test('"물어봤는데 못 읽음"과 "안 물어봄"을 가른다', () => {
  // null = 폰에 물어봤는데 응답이 없다 → 사람이 고쳐야 한다
  assert.equal(at(cameraState({ status: null }), 'settings').tone, 'warn');
  // undefined = 애초에 물을 폰이 없다(합성 고정물) → 경고를 상주시키면 안 된다
  assert.equal(at(cameraState({}), 'settings').tone, 'mute');
});

test('보정값이 없으면 해상도를 "정상"이라 적지 않는다', () => {
  const rows = cameraState({ status: LOCKED, observed: { streamW: 1920, streamH: 1080 } });
  assert.equal(at(rows, 'resolution').tone, 'warn');
  assert.match(at(rows, 'resolution').label, /보정값 없음/);
});

// ── D64 회귀 — 이 세 줄이 이 파일을 만든 이유다
test('D64 회귀: 폰이 혼자 되돌아간 설정을 잡는다', () => {
  const rows = cameraState({ calib: CALIB,
    status: { quality: '49', whitebalance: 'auto', zoom: '100' },
    observed: { live: true, streamW: 1920, streamH: 1080, lastChangeMsAgo: 500 } });
  const s = at(rows, 'settings');
  assert.equal(s.tone, 'warn');
  assert.match(s.label, /화질 49≠90/);
  assert.match(s.label, /화벨 auto≠fluorescent/);
});

test('줌이 1.0배가 아니면 다른 렌즈다 — 잡는다', () => {
  const rows = cameraState({ calib: CALIB, status: { ...LOCKED, zoom: '200' },
    observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'settings').tone, 'warn');
  assert.match(at(rows, 'settings').label, /줌 200≠100/);
});

test('설정 키가 아직 안 돌아왔으면 경고가 아니라 "읽는 중"이다', () => {
  // 해상도를 바꾼 직후 `status.json` 은 키가 빠진 채 돌아온다 (`cam-lock.sh` §curvals)
  const rows = cameraState({ calib: CALIB, status: { quality: '90' },
    observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'settings').tone, 'mute');
});

test('초점은 판정하지 않는다 — 기기가 주는 값이 거짓말이라서', () => {
  const rows = cameraState({ calib: CALIB,
    status: { ...LOCKED, focusmode: 'continuous-video', focus_distance: '2.5' },
    observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'settings').tone, 'ok');
});

// ── 해상도: 순수 축소는 정상, 종횡비가 다르면 무효
test('1920×1080 은 순수 축소라 경고가 아니다 — 배율을 적는다', () => {
  const rows = cameraState({ calib: CALIB, status: LOCKED,
    observed: { live: true, streamW: 1920, streamH: 1080, lastChangeMsAgo: 300 } });
  const r = at(rows, 'resolution');
  assert.equal(r.tone, 'ok');
  assert.match(r.label, /0\.75배/);
});

test('종횡비가 다르면 보정값이 무효다', () => {
  const rows = cameraState({ calib: CALIB, status: LOCKED,
    observed: { live: true, streamW: 1920, streamH: 1440 } });
  const r = at(rows, 'resolution');
  assert.equal(r.tone, 'warn');
  assert.match(r.label, /무효/);
});

// ── 연결
test('멈춤을 끊김보다 먼저 본다 — 옛 프레임이 걸린 쪽이 더 위험하다', () => {
  const rows = cameraState({ calib: CALIB, status: LOCKED,
    observed: { live: true, stale: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'link').tone, 'warn');
  assert.match(at(rows, 'link').label, /멈춤/);
});

test('마지막 변화가 9초를 넘으면 경고다', () => {
  const old = cameraState({ observed: { lastChangeMsAgo: 12000 } });
  const fresh = cameraState({ observed: { lastChangeMsAgo: 8000 } });
  assert.equal(at(old, 'frameAge').tone, 'warn');
  assert.equal(at(fresh, 'frameAge').tone, 'ok');
});

// ── 정합
test('합성 고정물을 실측인 척하지 않는다', () => {
  const rows = cameraState({ calib: { ...CALIB, verified: false }, status: LOCKED,
    observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'calib').tone, 'warn');
  assert.match(at(rows, 'calib').label, /실측 아님/);
});

test('내부 파라미터만 있고 labToCam 이 없으면 정합 미검증이다', () => {
  const rows = cameraState({ calib: { verified: true, intrinsics: CALIB.intrinsics },
    status: LOCKED, observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'calib').tone, 'warn');
  assert.match(at(rows, 'calib').label, /정합 미검증/);
});

test('정합이 있으면 RMS 를 숫자로 적는다', () => {
  const rows = cameraState({ calib: CALIB, status: LOCKED,
    observed: { live: true, streamW: 2560, streamH: 1440 } });
  assert.equal(at(rows, 'calib').label, '정합 RMS 1.57px');
});

test('행 개수와 키는 화면이 기대하는 그대로다', () => {
  const rows = cameraState();
  assert.deepEqual(rows.map((r) => r.key),
    ['link', 'resolution', 'settings', 'frameAge', 'calib']);
});
