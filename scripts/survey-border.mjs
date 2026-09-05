// 今昔 — ⚠ **「次に歩いて確かめる境目」を、⚠ どれくらいの土地で出せるか**を数える。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-border.mjs`
//
// ⚠ **数えるのは 5 通り。**⚠ **「無い」と「読めなかった」を混ぜない**（掟の一行目）。
//     出せる          境目が上限内に在り、⚠ 向こう側の区分も読めた
//     遠い            境目は在るが、⚠ 上限より遠い
//     見えない        ⚠ 読み込んだ範囲に境目が無い（⚠ 「無い」とは言えない）
//     足元が無い      ⚠ この点に地形分類が無い（⚠ 対象範囲の外）
//     読めない        ⚠ タイルを取れなかった（⚠ こちらの都合でも相手の都合でもありうる）
//
// ⚠ **判定そのものは `public/border.js` の 1 か所。**⚠ ここには書かない。
import "../public/border.js";

const NAT = "https://maps.gsi.go.jp/xyz/experimental_landformclassification1";
const Z = 16;                 // ⚠ 詳細版。⚠ 広域版（z13）は面が粗すぎて「歩く」に使えない
const 上限m = 600;            // ⚠ border.js の既定と同じ。⚠ ここで別の値を持たない
const B = globalThis.KonjakuBorder;

const x_ = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };

// ⚠ **上限より遠くは読まない。**⚠ **読んだ範囲を、⚠ そのまま border.js へ渡す**
//   （⚠ 「見えている範囲に無い」を「無い」と言わせないため）。
// ⚠ 地球の大きさは border.js の 1 か所が持つ。⚠ ここでは借りるだけ
const タイルm = (lat) => B.タイル幅m(lat, Z);

const 取る = async (x, y) => {
  const url = `${NAT}/${Z}/${x}/${y}.geojson`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return { 状態: "無い", features: [] };
    if (!r.ok) return { 状態: `http=${r.status}`, features: [] };
    const j = await r.json();
    return { 状態: "ok", features: j?.features ?? [] };
  } catch (e) { return { 状態: `聞けず(${e.name})`, features: [] }; }
};

const 調べる = async (lon, lat) => {
  const fx = x_(lon, Z), fy = y_(lat, Z);
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const features = [];
  let 読めた = 0, 全部 = 0, 落ちた = null;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    全部++;
    const t = await 取る(cx + dx, cy + dy);
    if (t.状態 === "ok") { 読めた++; features.push(...t.features); }
    else if (t.状態 !== "無い") 落ちた = t.状態;
  }
  // ⚠ **3×3 の外へは出ない。**⚠ **点からタイル境界までの最短が、⚠ 見えている範囲。**
  const m = タイルm(lat);
  const 見えている範囲m = Math.min(
    (fx - cx + 1) * m, (cx + 2 - fx) * m,
    (fy - cy + 1) * m, (cy + 2 - fy) * m);
  if (!読めた && 落ちた) return { state: "読めない", なぜ: 落ちた };
  return { ...B.境目(features, lon, lat, { 上限m, 見えている範囲m }), タイル: `${読めた}/${全部}` };
};

// ⚠ **既存の調査と同じ地点を使う**（⚠ 突き合わせられるように）。
//   ⚠ `scripts/survey-swale.mjs` の 13 地点 ＋ `survey-landform-coverage.mjs` の山間・離島。
//   ⚠ **これは日本全体の標本ではない。**⚠ **偏りは、⚠ 出力自身が名乗る。**
const 場所 = [
  ["豊洲", 35.6553, 139.7967], ["浦安", 35.6536, 139.9021], ["春日部", 35.9756, 139.7523],
  ["軽井沢", 36.3418, 138.6353], ["旭川", 43.7708, 142.3650], ["松江", 35.4681, 133.0486],
  ["那覇", 26.2124, 127.6809], ["稚内", 45.4156, 141.6730], ["釧路", 42.9849, 144.3820],
  ["網走", 44.0206, 144.2735], ["札幌", 43.0621, 141.3544], ["盛岡", 39.7020, 141.1544],
  ["長野", 36.6485, 138.1950], ["高知", 33.5597, 133.5311], ["石垣", 24.3448, 124.1572],
  ["名古屋", 35.1815, 136.9066], ["大阪", 34.6937, 135.5023], ["広島", 34.3853, 132.4553],
  ["福岡", 33.5904, 130.4017], ["仙台", 38.2682, 140.8694],
  ["山間・上高地", 36.2500, 137.6320], ["離島・小笠原", 27.0940, 142.1910],
  ["離島・佐渡", 38.0180, 138.3680], ["山間・十津川", 34.0640, 135.7900],
];

console.log(`⚠ 境目（experimental_landformclassification1・z${Z}・3×3 タイル・上限 ${上限m}m）`);
console.log(`⚠ 測った日 ${new Date().toISOString().slice(0, 10)} ／ ⚠ 標本 ${場所.length} 地点`);
console.log("⚠ これは日本全体の標本ではない。⚠ 既存の調査と同じ地点を選んでいる（都市に偏る）\n");
console.log("場所            結果            距離   方角  タイル  向こう側");

const 数 = {};
for (const [名, lat, lon] of 場所) {
  const r = await 調べる(lon, lat);
  数[r.state] = (数[r.state] ?? 0) + 1;
  const d = r.m != null ? `${String(r.m).padStart(4)}m` : r.近いm != null ? `⚠${String(r.近いm).padStart(4)}m`
          : r.見えている範囲m != null ? `>${Math.round(r.見えている範囲m)}m` : "  —  ";
  console.log(`${名.padEnd(13)} ${String(r.state).padEnd(14)} ${d}  ${(r.方角 ?? "—").padEnd(4)} `
    + `${(r.タイル ?? "—").padEnd(6)} ${r.toCode ?? r.なぜ ?? ""}`);
}

console.log("\n⚠ 内訳（⚠ 分母は上の標本 " + 場所.length + " 地点）");
for (const [k, v] of Object.entries(数).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(2)} 地点  ${(v / 場所.length * 100).toFixed(0)}%`);
console.log("\n⚠ 「見えない」は「境目が無い」ではない。⚠ 3×3 タイルの外は読んでいない");
