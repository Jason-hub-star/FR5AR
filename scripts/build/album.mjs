#!/usr/bin/env node
// docs/evidence/ 에 흩어진 사진·gif 를 **한 장으로 모아** 발표에서 고를 수 있게 한다.
//
//   node scripts/build/album.mjs            # docs/evidence/ALBUM.md 를 굽는다
//   node scripts/build/album.mjs --check    # 쓰지 않고 캡션 회수율만 본다
//
// 사진은 이미 날짜 폴더에 잘 쌓이는데 **캡션이 산문 속에 흩어져** 있어서, 발표를 만들 때
// 42장을 하나씩 열어 "이게 뭐였지"를 다시 하게 된다. 그 한 번을 없애는 게 이 스크립트다.
//
// 캡션은 네 자리에서 이 순서로 회수한다. **지어내지 않는다** — 못 찾으면 TODO 로 남긴다.
//   ① 같은 폴더 SHOTS.md 의 `![캡션](파일)`   ← shot.sh 가 찍는 순간에 쌓아 둔 것 (정본)
//   ② 같은 폴더 다른 md 의 `![캡션](파일)`
//   ③ 파일 이름이 나오는 md 문장 (마크다운 기호를 걷어내고 한 줄로)
//   ④ TODO
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EV = join(ROOT, 'docs', 'evidence');
const OUT = join(EV, 'ALBUM.md');
const PIC = /\.(png|jpe?g|gif)$/i;
const CHECK = process.argv.includes('--check');

if (!existsSync(EV)) { console.error('FAIL  docs/evidence/ 가 없다'); process.exit(1); }

// 날짜 폴더만 본다 — evidence 규약이 YYYY-MM-DD 다
const days = readdirSync(EV)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && statSync(join(EV, d)).isDirectory())
  .sort()
  .reverse();

// 날짜 폴더 **안쪽까지** 훑는다 — 하위 폴더에 넣어 둔 것이 조용히 빠지면 앨범이 거짓말을 한다
// (실측 2026-08-06: `2026-08-05/cam/` 2장이 이 재귀 없이는 누락됐다)
const walk = (dir, pre = '') => readdirSync(join(EV, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), `${pre}${e.name}/`) : [pre + e.name]));
const size = (p) => { const b = statSync(p).size; return b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(1)}MB`; };

// 문장에서 마크다운 기호를 걷어낸다. 캡션은 발표에서 그대로 읽히므로 한 줄이어야 한다
const clean = (s, pic) => s
  .replace(/^[#>\-*\s|]+/, '').replace(/[`*_]/g, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replaceAll(basename(pic), '')                 // 파일 이름은 아래 줄에 이미 있다
  .replace(/^(그림|사진|화면)\s*[:·-]\s*/, '')   // "그림: " 같은 머리표
  .replace(/\|/g, ' ')                           // 표 칸에서 건져 온 문장
  .replace(/\s{2,}/g, ' ').replace(/^[\s:·,()/]+|[\s:·,()]+$/g, '')
  .slice(0, 120);

let total = 0, byShots = 0, byAlt = 0, bySentence = 0, todo = 0;
const sections = [];

for (const day of days) {
  const dir = join(EV, day);
  const entries = walk(day);
  const pics = entries.filter((f) => PIC.test(f)).sort();
  if (!pics.length) continue;

  // 캡션 후보를 미리 모은다 — 파일 하나당 md 를 다시 읽지 않기 위해서
  const docs = entries.filter((f) => f.endsWith('.md')).map((f) => ({ f, text: readFileSync(join(dir, f), 'utf8') }));
  const shots = docs.find((d) => basename(d.f) === 'SHOTS.md');

  const rows = pics.map((pic) => {
    const name = basename(pic);
    const alt = (text) => {
      for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g))
        if (basename(m[2]) === name && m[1].trim()) return m[1].trim();
      return null;
    };
    let caption = shots && alt(shots.text);
    let source = caption ? 'SHOTS.md' : null;
    if (caption) byShots++;

    if (!caption) for (const d of docs) {
      if (d.f === 'SHOTS.md') continue;
      const a = alt(d.text);
      if (a) { caption = a; source = d.f; byAlt++; break; }
    }
    if (!caption) for (const d of docs) {
      const line = d.text.split('\n').find((l) => l.includes(name));
      if (line && clean(line, name)) { caption = clean(line, name); source = d.f; bySentence++; break; }
    }
    if (!caption) { caption = 'TODO — 캡션 없음'; todo++; }

    total++;
    return { pic, name, caption, source, size: size(join(dir, pic)) };
  });

  const body = rows.map(({ pic, name, caption, source, size }) =>
    `![${caption}](${day}/${pic})\n\n` +
    `**${caption}**  \n\`${name}\` · ${size}${source ? ` · 출처 [${basename(source)}](${day}/${source})` : ''}\n`
  ).join('\n');

  sections.push(`## ${day} — ${rows.length}장\n\n${body}`);
}

const rate = total ? Math.round(((total - todo) / total) * 100) : 0;
console.log(`사진 ${total}장 · 캡션 ${total - todo}장(${rate}%) · TODO ${todo}장`);
console.log(`  SHOTS.md ${byShots} · 다른 md 의 ![]() ${byAlt} · 문장에서 회수 ${bySentence}`);

if (CHECK) process.exit(0);

writeFileSync(OUT, `# 개발 기록 앨범 — 발표에서 고르는 자리

**생성물이다. 손으로 고치지 않는다** — \`node scripts/build/album.mjs\` 가 다시 굽는다.
캡션을 고치려면 그 날 폴더의 \`SHOTS.md\` 를 고친다 (캡션 단일 출처).

새로 찍는 것: \`bash scripts/dev/shot.sh <슬러그> "<캡션>"\`

사진 ${total}장 · 캡션 있음 ${total - todo}장(${rate}%) · TODO ${todo}장

---

${sections.join('\n---\n\n')}
`);
console.log(`→ ${OUT.replace(ROOT + '/', '')}`);
