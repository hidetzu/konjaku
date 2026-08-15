// 貯めたものを、タイル索引の静的 JSON に書き出す。
//
// ⚠ 画面はこれを1本取るだけ。Worker も外部サービスも通らない。
// ⚠ 「取り込んだが0件」と「まだ取り込んでいない」を区別できるようにする。
//   0件のタイルもファイルを書き、索引に載せる。索引に無い＝未整備。
//   ここを混ぜると「この範囲には何も無い」と「知らない」が同じ顔になる（掟: 取れなかったを「無い」と言わない と同じ話）。
import { open } from "./db.mjs";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";

const OUT = "public/data/ev";
const db = open();
const at = new Date().toISOString().slice(0, 10);

// ⚠ 索引は **coverage**（見た範囲）から作る。feature の分布から作ってはいけない。
//   1件でも落ちたタイルが「全面を調べた」として載り、問い合わせていない地面について
//   「記録のある変化はありません」と断定していた（実測: 索引タイルの問い合わせ率は
//   中央値 42.5%、最悪 3.6%。表示枠33枚は問い合わせ率0%）。
const LAYER = "ev";
const rows = db.prepare(
  `SELECT z14x x, z14y y, at, truncated trunc FROM coverage
   WHERE layer = ? ORDER BY z14x, z14y`).all(LAYER);
if (!rows.length) {
  console.log("coverage が空です。先に npm run ingest を走らせてください");
  process.exit(1);
}
const feats = db.prepare(`SELECT id,label,kind,lon,lat,year_from,year_to,precision,
  source_url,note,note_url,verified FROM feature
  WHERE z14x=? AND z14y=? AND dropped_at IS NULL ORDER BY year_from`);

// ⚠ 1タイル1ファイルにしない。
//   z14 は全国（陸地）で約10万枚あり、そのままだと約10万ファイルになる。
//   Cloudflare のアップロード上限に当たるうえ、git にも10万ファイルが載る。
//   **書き出してからでは戻せない**ので、広げる前に束ねる。
//   z12 の1枚 = z14 の 4×4 = 16枚。全国で約6,200ファイル。
//
// ⚠ ただし「見た範囲」の単位は z14 のまま。束ねるのは配り方だけで、
//   どこを見たかの粒度を粗くしてはいけない（それをやると穴1に戻る）。
//   索引は z12 ごとに **16bit のマスク**で持つ（どの z14 を見たか）。
const Z = 12, SUB = 4;                    // z12 → z14 は 2段（4×4）
const bundles = new Map();                // "x/y" → { mask, at, trunc, f: [] }
for (const t of rows) {
  const bx = t.x >> 2, by = t.y >> 2;
  const key = `${bx}/${by}`;
  const b = bundles.get(key) ?? { mask: 0, at: t.at, trunc: 0, f: [] };
  // ビット位置は z12 の中での並び（左上から右下へ）
  b.mask |= 1 << (((t.y - by * SUB) * SUB) + (t.x - bx * SUB));
  // ⚠ 束の日付は **いちばん古い区画**に合わせる。MAX にすると、
  //   古い区画が新しい区画の日付を名乗り、古さを過小に言うことになる
  if (t.at < b.at) b.at = t.at;
  if (t.trunc) b.trunc = 1;
  for (const f of feats.all(t.x, t.y)) b.f.push({
    id: f.id, l: f.label, k: f.kind, c: [+f.lon.toFixed(5), +f.lat.toFixed(5)],
    y: [f.year_from, f.year_to], p: f.precision, u: f.source_url,
    // n は Wikidata の日本語の一行説明（取れたまま）。地名の前置きを落とすのは描くとき
    ...(f.note ? { n: f.note } : {}),
    ...(f.note_url ? { nu: f.note_url } : {}),
    ...(f.verified ? { v: 1 } : {}),
  });
  bundles.set(key, b);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
let n = 0, files = 0, maxKb = 0;
const index = {};
for (const [key, b] of [...bundles].sort()) {
  const [bx, by] = key.split("/");
  mkdirSync(`${OUT}/${Z}/${bx}`, { recursive: true });
  const body = JSON.stringify({ tile: [Z, +bx, +by], at: b.at,
    ...(b.trunc ? { truncated: 1 } : {}), f: b.f });
  writeFileSync(`${OUT}/${Z}/${bx}/${by}.json`, body);
  index[key] = b.mask;
  n += b.f.length; files++;
  maxKb = Math.max(maxKb, Math.round(Buffer.byteLength(body) / 1024));
}
// 索引: z12 ごとに「どの z14 を見たか」の 16bit
writeFileSync(`${OUT}/index.json`, JSON.stringify({ at, z: Z, sub: SUB, tiles: index }));
const trunc = rows.filter((r) => r.trunc).length;
if (trunc) console.log(`⚠ ${trunc} タイルは上限に当たっている（取りこぼしがあるかもしれない）`);
console.log(`書き出し ${files} 束（z12） / ${rows.length} タイル（z14） / ${n} 件`);
console.log(`いちばん大きい束 ${maxKb} KB`);
const idxKb = Buffer.byteLength(JSON.stringify({ at, z: Z, sub: SUB, tiles: index }));
console.log(`索引 ${idxKb} B（${Object.keys(index).length} 束）`);
