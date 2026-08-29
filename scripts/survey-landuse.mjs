// 今昔 — 土地利用細分メッシュ（L03-b）の時系列で、変化区間を言えるかを測る（docs/adr/0062）。
//
// これは検査ではない。npm run check から呼ばない。
//   相手先（国土交通省）の答えに寄りかかるものを、検査にしない。
//
// 回し方:
//   node scripts/survey-landuse.mjs <展開済みディレクトリ>
//
// 100m メッシュなので、「この地点そのものが変わった」とは言わない。
//   「この場所を含むメッシュの土地利用記録が変わった」まで。
//
// コード値から意味を推測しない。public-next/data/landuse-code.json が持つ。
//   あれは国土交通省のコード表からそのまま写したもの。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const 表 = JSON.parse(readFileSync("public-next/data/landuse-code.json", "utf8"));
const 体系 = new Map();
for (const s of 表.systems) for (const y of s.years) 体系.set(y, s);

// dbf を読む。列名は Shift-JIS の 2 バイト文字なので、名前に頼らず列の順で扱う。
function dbf(path) {
  const b = readFileSync(path);
  const 件 = b.readUInt32LE(4), 頭 = b.readUInt16LE(8), 長 = b.readUInt16LE(10);
  const 列 = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) 列.push({ 幅: b[o + 16] });
  return { b, 件, 頭, 長, 列 };
}
const row = (d, i) => {
  let o = d.頭 + i * d.長 + 1;   // 先頭 1 バイトは削除印
  const out = [];
  for (const c of d.列) { out.push(d.b.toString("latin1", o, o + c.幅).trim()); o += c.幅; }
  return out;
};

// 3 次メッシュ（1km）＋ 細分（100m）のコードから、経緯度の範囲を出す。
const meshBox = (code) => {
  const p = String(code);
  const lat1 = +p.slice(0, 2) / 1.5, lon1 = +p.slice(2, 4) + 100;
  const lat2 = lat1 + (+p[4]) * (2 / 3) / 8, lon2 = lon1 + (+p[5]) / 8;
  const lat3 = lat2 + (+p[6]) * (2 / 3) / 80, lon3 = lon2 + (+p[7]) / 80;
  const h = (2 / 3) / 800, w = 1 / 800;
  return { s: lat3 + (+p[8]) * h, n: lat3 + (+p[8] + 1) * h,
           w: lon3 + (+p[9]) * w, e: lon3 + (+p[9] + 1) * w };
};

const DIR = process.argv[2];
if (!DIR) { console.error("展開済みディレクトリを渡す"); process.exit(1); }

// メッシュ 5339（東京南部）の年ごとのファイル名。年で命名が違う。
const FILES = [
  [1976, "L03-b-76_5339_LandUseSubdivisionMesh.dbf"],
  [1987, "L03-b-87_5339_LandUseSubdivisionMesh.dbf"],
  [1991, "L03-b-91_5339_LandUseSubdivisionMesh.dbf"],
  [1997, "L03-b-97_5339_LandUseSubdivisionMesh.dbf"],
  [2006, "L03-b-06_5339-tky_LandUseSubdivisionMesh.dbf"],
  [2009, "L03-b-09_5339.dbf"],
  [2014, "L03-b-14_5339.dbf"],
  [2016, "L03-b-16_5339.dbf"],
];

const 場所 = [
  ["豊洲（水→陸のはず）", 139.7967, 35.6553],
  ["皇居（ずっと陸）", 139.7528, 35.6852],
  ["東京湾（ずっと水）", 139.8300, 35.5900],
  ["浦安（水→陸のはず）", 139.9021, 35.6536],
];

const 結果 = new Map(場所.map(([n]) => [n, []]));
for (const [年, f] of FILES) {
  const p = join(DIR, f);
  if (!existsSync(p)) { for (const [n] of 場所) 結果.get(n).push([年, null, null, null]); continue; }
  const d = dbf(p), sys = 体系.get(年);
  for (const [nm, lon, lat] of 場所) {
    let raw = null;
    for (let i = 0; i < d.件; i++) {
      const r = row(d, i);
      const box = meshBox(r[0]);
      if (lat >= box.s && lat < box.n && lon >= box.w && lon < box.e) { raw = r[1]; break; }
    }
    const 名 = raw != null ? (sys?.codes[raw] ?? null) : null;
    結果.get(nm).push([年, raw, 名, 名 ? (表.surface[名] ?? null) : null]);
  }
}

console.log("土地利用細分メッシュ（L03-b）／ 実測 2026-08-29 ／ メッシュ 5339\n");
console.log("コードの意味は public-next/data/landuse-code.json（国土交通省のコード表を写したもの）\n");
for (const [nm, 列] of 結果) {
  console.log(`■ ${nm}`);
  for (const [年, raw, 名, 面] of 列)
    console.log(`   ${年}  ${String(raw ?? "—").padEnd(6)} ${String(名 ?? "⚠ コード表に無い").padEnd(16)} ${面 ?? "⚠ 判定しない"}`);
  // 上位分類で変化を見る。分類体系が変わっただけでは変化と判定しない。
  const 変 = [];
  for (let i = 1; i < 列.length; i++) {
    const a = 列[i - 1], b = 列[i];
    if (!a[3] || !b[3]) continue;                 // 判定できない年は飛ばす
    if (a[3] !== b[3]) 変.push(`${a[0]}〜${b[0]}（${a[2]} → ${b[2]}）`);
  }
  console.log(`   ⚠ 記録が変わった区間: ${変.length ? 変.join(" ／ ") : "無い"}\n`);
}
console.log("100m メッシュなので、「この地点そのものが変わった」とは言わない。");
console.log("「この場所を含むメッシュの土地利用記録が変わった」まで。");
