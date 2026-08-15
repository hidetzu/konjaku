// 地形分類の「図式コード → 区分名・成因・災害リスク」の表を作る。
//
// 表は国土地理院が地理院地図の描画用に配信している style.js の中にある。
// 凡例PDFでは区分名が図として描かれ、機械的に取得できなかった。
// style.js は素の JavaScript の
// 配列リテラルなので、こちらは機械的に読める。
//
// 成因と災害リスクの文は国土地理院の記述をそのまま使う。こちらで書かない。
//
//   node scripts/build-landform.mjs
//
// 出力: public/data/landform.json
// 相手の都合で表が変わりうるので、生成物をリポジトリに置いて差分を見られるようにする。
import { writeFileSync } from "node:fs";

const SRC = "https://maps.gsi.go.jp/xyz/experimental_landformclassification1/style.js";

const r = await fetch(SRC);
if (!r.ok) { console.error(`取得できなかった: ${r.status} ${SRC}`); process.exit(1); }
const js = await r.text();

// style.js には配列が2つある。色の表（[コード,"色"]）と、
// onEachFeature の中にある [コード,"区分名","成因など","災害リスク"]。後者だけを読む。
const at = js.indexOf("onEachFeature");
if (at < 0) { console.error("onEachFeature が見つからない。style.js の形が変わった可能性がある"); process.exit(1); }

const codes = {}, classes = {};
const re = /\[(\d+),"([^"]*)","([^"]*)","([^"]*)"\]/g;
let m;
while ((m = re.exec(js.slice(at)))) {
  const [, code, name, why, risk] = m;
  // 「地図を拡大すると表示されます。」はデータではなく、粗いズームでの案内文。
  // これを区分名として扱うと「判定できた」ことになってしまうので落とす。
  if (!why && !risk) continue;
  if (/地図を拡大すると表示されます/.test(name + why)) continue;
  codes[code] = name;
  if (!classes[name]) classes[name] = { why, risk };
}

const n = Object.keys(codes).length, k = Object.keys(classes).length;
if (n < 50 || k < 20) {
  console.error(`表が小さすぎる（コード ${n} / 区分 ${k}）。style.js の形が変わった可能性がある`);
  process.exit(1);
}

const out = {
  note: "国土地理院「地形分類」の図式コード表。成因・災害リスクの文は国土地理院の記述。",
  source: SRC,
  layers: {
    natural: "https://maps.gsi.go.jp/xyz/experimental_landformclassification1/{z}/{x}/{y}.geojson",
    artificial: "https://maps.gsi.go.jp/xyz/experimental_landformclassification2/{z}/{x}/{y}.geojson",
  },
  codes, classes,
};
writeFileSync(new URL("../public/data/landform.json", import.meta.url),
  JSON.stringify(out, null, 1) + "\n");
console.log(`コード ${n} 件 / 区分 ${k} 種 を public/data/landform.json に書いた`);
