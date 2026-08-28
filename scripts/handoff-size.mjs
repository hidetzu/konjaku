// ⚠ **「一時 URL」に、⚠ 保存した場所が何件まで載るか。**⚠ 実測を再現する。
//
// ⚠ **`docs/adr/0048` が、この出力を根拠にしている。**⚠ **数字を直接書き写さない。**
// ⚠ **回し方**: `node scripts/handoff-size.mjs`
// ⚠ **記録の形は `top.js` の setRec と同じ**（star / memo / title / lon / lat / at）。
// ⚠ **同じ記録を並べると圧縮が効きすぎる**ので、⚠ **地名もメモも座標も散らす**。
import { gzipSync } from "node:zlib";

const 地名 = ["東京都江東区豊洲","東京都渋谷区道玄坂","長野県北佐久郡軽井沢町","広島県広島市中区基町",
  "大阪府大阪市西区川口","神奈川県横浜市中区山下町","福岡県福岡市博多区住吉","北海道札幌市北区北七条",
  "愛知県名古屋市熱田区神宮","宮城県仙台市青葉区国分町"];
const メモ = ["水だったのが意外","祖母の家があったあたり","埋立の年を調べる","川の跡が道になっている",
  "ここだけ標高が低い","写真だと工場だった","town の由来を調べたい","堤防の内側","昔は入江","段丘の縁"];

const one = (i) => [
  Number((35 + (i * 0.137) % 8).toFixed(5)),
  Number((135 + (i * 0.911) % 8).toFixed(5)),
  地名[i % 地名.length], (i % 5) + 1, メモ[i % メモ.length], 29273333 + i * 137,
];
const raw = (n) => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const [lat, lon, title, star, memo, at] = one(i);
  return [`${lat},${lon}`, { star, memo, title, lon, lat, at: at * 60000 }];
})));
const packed = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => one(i)));

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url").length;
const gz = (s) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).toString("base64url").length;

// ---- ⚠ 自己検査（`--selftest`）----
//
// ⚠ **`docs/adr/0048` が、⚠ この走者の出力を根拠にしている。**
// ⚠ **壊れたら、⚠ ADR の根拠が黙って変わる。**⚠ **静的検査から呼ぶ。**
//
// ⚠ **確かめるのは、⚠ ADR が寄りかかっている 2 点だけ**:
//
//     ⚠ ① 50 件が、⚠ URL の実用上限 2000 文字に収まる
//     ⚠ ② 同じ記録を並べていない（⚠ 圧縮が効きすぎない）
if (process.argv.includes("--selftest")) {
  const fail = [];
  const n50 = gz(packed(50));
  if (!(n50 < 2000)) fail.push(`50 件が ${n50} 文字（⚠ 2000 未満のはず）`);
  // ⚠ **散らしていることの確認**: ⚠ 同じ記録 50 件なら、⚠ ずっと小さくなるはず。
  //   ⚠ **その差が小さいなら、⚠ 散らせていない**（⚠ 最初に踏んだ）。
  const same = gz(JSON.stringify(Array.from({ length: 50 }, () => one(0))));
  if (!(n50 > same * 2)) fail.push(`散らせていない（散らした ${n50} / 同じ ${same}）`);
  if (fail.length) { console.error(fail.join(" ／ ")); process.exit(1); }
  console.log(`✓ 50 件が URL 上限 2000 文字に収まる（${n50}）／ 記録を散らせている（同じ記録なら ${same}）`);
  process.exit(0);
}

console.log("⚠ 地名 10 種・メモ 10 種・座標すべて別を混ぜて測った\n");
console.log("件数   そのまま(b64)   詰めた(b64)   詰めて圧縮(b64)");
for (const n of [1, 5, 10, 20, 50, 100]) {
  console.log(`${String(n).padStart(3)}件  ${String(b64(raw(n))).padStart(11)}  ${String(b64(packed(n))).padStart(12)}  ${String(gz(packed(n))).padStart(14)}`);
}
console.log("\n⚠ 目安");
console.log("  URL の長さ    ⚠ 実用上 2000 文字までは、どのブラウザでも通る");
console.log("  QR コード     ⚠ 英数字モードで最大 4296 文字（版 40・誤り訂正 L）");
console.log("                ⚠ **base64url は英数字モードに収まらない**（`-` `_` が入る）");
console.log("                ⚠ バイナリモードなら最大 2953 バイト");
