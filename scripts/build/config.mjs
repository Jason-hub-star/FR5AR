#!/usr/bin/env node
/**
 * .env → Shared/data/config/*.json 생성.
 *
 * 왜 있나
 *   **브라우저는 환경변수를 읽을 수 없다.** `process.env` 가 없다.
 *   그래서 `.env` 를 SSOT 로 두고 여기서 JSON 으로 굽는다. 브라우저는 그 JSON 을 fetch 한다.
 *   `Shared/data/config/*.json` 은 **산출물이다 — 직접 고치지 않는다.**
 *
 * 왜 값 검증까지 하나
 *   바코드 번호가 인쇄물과 다르면 **아무것도 안 뜬다.** 콘솔 에러도 없이 조용히 실패한다.
 *   실제로 코드 버그로 번호가 0 이 되어 로봇이 통째로 안 뜬 적이 있다.
 *   틀린 값이면 JSON 을 쓰지 않고 **여기서 멈춘다.**
 *
 * 우선순위: 셸 환경변수 > .env > (없으면 실패)
 *
 * 사용
 *   node scripts/build/config.mjs
 *   FR5_MARKER_BARCODE=5 node scripts/build/config.mjs    # 한 번만 다르게
 *   node scripts/build/config.mjs --check                 # 쓰지 않고 대조만 (게이트용)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK_ONLY = process.argv.includes('--check');

// ---- .env 읽기. 셸 환경변수가 이긴다.
function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.example']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2];
    }
    break; // .env 가 있으면 .env.example 은 안 본다
  }
  return { ...env, ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('FR5_')),
  ) };
}

const env = loadEnv();
const problems = [];

function req(key) {
  const v = env[key];
  if (v === undefined || v === '') problems.push(`${key} 가 없다`);
  return v;
}
function num(key, min, max) {
  const v = Number(req(key));
  if (!Number.isFinite(v)) { problems.push(`${key}="${env[key]}" 는 숫자가 아니다`); return null; }
  if (v < min || v > max) { problems.push(`${key}=${v} 는 범위 ${min}~${max} 밖이다`); return null; }
  return v;
}
function int(key, min, max) {
  const v = num(key, min, max);
  if (v !== null && !Number.isInteger(v)) { problems.push(`${key}=${v} 는 정수여야 한다`); return null; }
  return v;
}
function vec3(key) {
  const raw = req(key);
  if (raw === undefined) return null;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    problems.push(`${key}="${raw}" 는 "숫자,숫자,숫자" 형식이어야 한다`);
    return null;
  }
  return parts;
}
function bool(key) {
  const raw = String(req(key)).toLowerCase();
  if (!['true', 'false'].includes(raw)) { problems.push(`${key}="${env[key]}" 는 true/false 여야 한다`); return null; }
  return raw === 'true';
}

// ---- 값 읽고 검증
const markerMm = num('FR5_MARKER_MM', 40, 400);
const barcode = int('FR5_MARKER_BARCODE', 0, 7);
const markerToRobot = vec3('FR5_MARKER_TO_ROBOT_MM');
const markerVerified = bool('FR5_MARKER_VERIFIED');

const parentLink = req('FR5_GRIPPER_PARENT_LINK');
const meshScale = num('FR5_GRIPPER_MESH_SCALE', 1e-6, 1000);
const gripPos = vec3('FR5_GRIPPER_POSITION_MM');
const gripRot = vec3('FR5_GRIPPER_ROTATION_DEG');
const gripVerified = bool('FR5_GRIPPER_VERIFIED');

// 인쇄된 원본이 있는 번호만 허용한다 — 없는 번호를 넣으면 조용히 실패한다
const AVAILABLE_BARCODES = [2, 3, 5];
if (barcode !== null && !AVAILABLE_BARCODES.includes(barcode)) {
  problems.push(
    `FR5_MARKER_BARCODE=${barcode} — 원본이 있는 것은 ${AVAILABLE_BARCODES.join('·')} 뿐이다. `
    + '다른 번호는 출처에서 받아 Shared/assets/marker/barcode/ 에 넣어라 (STACK.md §마커)',
  );
}

if (problems.length) {
  console.error('설정이 틀렸다 — JSON 을 쓰지 않는다:');
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

// ---- JSON 조립. `_` 로 시작하는 키는 사람이 읽는 주석이다.
const GEN = '이 파일은 .env 에서 생성된다 (node scripts/build/config.mjs). **직접 고치지 마라** — 다음 생성에서 덮어써진다.';

const marker = {
  _생성됨: GEN,
  _단위: '밀리미터. 하드 룰 5 — 변환은 robot-view.js 한 곳에서만.',
  markerSizeMm: markerMm,
  _markerSizeMm: '인쇄물의 검은 사각형 한 변. 자로 재서 .env 의 FR5_MARKER_MM 에 넣는다.',
  barcodeValue: barcode,
  _barcodeValue: '3x3_HAMMING63 마커 번호. 인쇄한 시트와 반드시 같아야 한다 — 다르면 아무것도 안 뜬다.',
  markerToRobotMm: markerToRobot,
  _markerToRobotMm: '마커 원점 → 로봇 베이스 원점. 실물 옆 시연에서 한 번 잰다.',
  verified: markerVerified,
  _verified: 'false 면 화면에 "실측값이 아니다" 경고가 뜬다.',
};

const gripper = {
  _생성됨: GEN,
  _단위: '위치는 밀리미터, 회전은 도(°).',
  _왜필요한가: 'fairino5_v6.urdf 에는 팔 링크 7개만 있고 그리퍼가 없다 (STACK.md §그리퍼).',
  parentLink,
  meshScale,
  _meshScale: '그리퍼 STL은 밀리미터, 팔 URDF는 미터다. 이 값을 빼면 1000배로 뜬다.',
  positionMm: gripPos,
  rotationDeg: gripRot,
  _유도: '실측으로 확정 — 플랜지 간격 0.00mm. 회전 X는 +90 (−90은 반대 방향). 상세는 docs/evidence/2026-07-30-gripper-mount.md',
  verified: gripVerified,
  meshes: [
    'PGEA-100-40_body.stl',
    'PGEA-100-40_finger_left.stl',
    'PGEA-100-40_finger_right.stl',
  ],
  _손가락: '개폐(prismatic 관절)는 이번 범위 밖. 벌어진 채로 고정한다.',
};

const targets = [
  ['Shared/data/config/marker-offset.json', marker],
  ['Shared/data/config/gripper-mount.json', gripper],
];

let drift = 0;
for (const [rel, obj] of targets) {
  const path = join(ROOT, rel);
  const next = `${JSON.stringify(obj, null, 2)}\n`;
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (CHECK_ONLY) {
    if (prev !== next) { console.error(`  FAIL  ${rel} 가 .env 와 다르다 — node scripts/build/config.mjs 를 돌려라`); drift = 1; }
    else console.log(`  ${rel}`);
  } else {
    writeFileSync(path, next);
    console.log(`  ${prev === next ? '변화없음' : '생성'}  ${rel}`);
  }
}

if (CHECK_ONLY) process.exit(drift);

console.log(`\n마커 #${barcode} · ${markerMm}mm · verified=${markerVerified}`);
console.log(`그리퍼 ${parentLink} · ${gripPos.join(',')}mm · ${gripRot.join(',')}° · scale ${meshScale}`);
