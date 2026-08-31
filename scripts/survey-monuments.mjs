// 今昔 — ⚠ **自然災害伝承碑が「いつ」をどこまで言えるかを数える**（`docs/adr/0052` の実装前調べ）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-monuments.mjs`
//
// ⚠ **404 を「0 件」と数えない**（⚠ `survey-pins.mjs` が 2026-08-29 に踏んだ）。
//   ⚠ **伝承碑は `maxNativeZoom: 7`。**⚠ **取れなかったことと、⚠ 無いことを分ける**（掟 §1）。
import { setTimeout as sleep } from "node:timers/promises";

const Z = 7;                       // ⚠ これより下は 404。⚠ 出典側の上限
const X = [107, 119], Y = [46, 58]; // ⚠ 日本がおさまる範囲（⚠ 端は空タイルになる）

const 碑 = new Map();               // ⚠ ID で重複を落とす（⚠ タイル境界で二重に来る）
let タイル = { 取れた: 0, 空: 0, 聞けず: 0 };

for (let x = X[0]; x <= X[1]; x++) {
  for (let y = Y[0]; y <= Y[1]; y++) {
    const r = await fetch(`https://maps.gsi.go.jp/xyz/disaster_lore_all/${Z}/${x}/${y}.geojson`,
      { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r) { タイル.聞けず++; continue; }
    if (r.status === 404) { タイル.空++; continue; }   // ⚠ 「碑が無い」ではなく「タイルが無い」
    if (!r.ok) { タイル.聞けず++; continue; }
    const j = await r.json().catch(() => null);
    if (!j) { タイル.聞けず++; continue; }
    タイル.取れた++;
    for (const f of j.features ?? []) {
      const p = f.properties ?? {};
      if (p.ID) 碑.set(p.ID, { p, c: f.geometry?.coordinates ?? null });
    }
    await sleep(120);
  }
}

// ⚠ **災害の年は `DisasterName` の中の自由文にしか無い。**⚠ **取り出せるかを数える。**
//   ⚠ **取り出せないものを推測で埋めない**（掟 §1）。
const 西暦 = /\((\d{4})年/;                 // ⚠ 「(1938年6月ほか)」の形
const 西暦だけ = /(\d{4})年/;               // ⚠ 括弧なしで書かれている場合
let 建立年あり = 0, 災害年あり = 0, 災害年なし = [];
const 種別 = new Map(), ほか付き = [];

for (const [, { p }] of 碑) {
  if (/^\d{4}$/.test(String(p.LoreYear ?? ""))) 建立年あり++;
  const 名 = String(p.DisasterName ?? "").replace(/<br>/g, " ");
  const m = 西暦.exec(名) ?? 西暦だけ.exec(名);
  if (m) { 災害年あり++; if (/ほか|以降|など/.test(名)) ほか付き.push(名); }
  else if (災害年なし.length < 8) 災害年なし.push(名 || "（空）");
  const k = String(p.DisasterKind ?? "（空）");
  for (const one of k.split(/[、,]/).map((s) => s.trim()).filter(Boolean))
    種別.set(one, (種別.get(one) ?? 0) + 1);
}

const n = 碑.size;
const 割 = (x) => `${x} / ${n}（${(x / n * 100).toFixed(1)}%）`;
console.log(`自然災害伝承碑（実測 ${new Date().toISOString().slice(0, 10)}・z${Z}・重複は ID で落とした）\n`);
console.log(`タイル   取れた ${タイル.取れた} ／ 空 ${タイル.空} ／ ⚠ 聞けず ${タイル.聞けず}`);
console.log(`碑       ${n} 件\n`);
console.log(`建立年（LoreYear）が 4 桁      ${割(建立年あり)}`);
console.log(`災害の年を DisasterName から取り出せた  ${割(災害年あり)}`);
console.log(`  ⚠ うち「ほか/以降/など」付き        ${ほか付き.length} 件（⚠ 1 つの年に丸めると嘘になる）`);
console.log(`\n災害の年を取り出せなかった例（先頭 ${災害年なし.length} 件）:`);
for (const s of 災害年なし) console.log(`  ${s.slice(0, 60)}`);
console.log(`\n災害の種別（上位 12）:`);
for (const [k, v] of [...種別].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`  ${String(v).padStart(5)}  ${k}`);
