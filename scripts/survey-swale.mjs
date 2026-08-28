// 今昔 — ⚠ **明治期の低湿地が、⚠ その土地で整備されているか**を数える（`docs/adr/0055`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-swale.mjs`
//
// ⚠ **`tmp/tmp2.md` が言う 3 つの状態を、⚠ 機械で分ける**:
//
//     ⚠ ① 整備範囲内で区分あり     → ⚠ 「水田」「河川」などを表示できる
//     ⚠ ② 整備範囲内だが区分なし   → ⚠ 明治期の地図はあるが、該当分類が無い
//     ⚠ ③ ⚠ **そもそも整備範囲外** → ⚠ 「この地域には明治期の低湿地データがありません」
//
// ⚠ **実測（2026-08-29・13 地点）で分かったこと**:
//
//     ⚠ **③ は `404` で返る。**⚠ **透明ではない**（那覇・稚内・高知・石垣）。
//     ⚠ **② と ① の区別には、⚠ 画素を数える必要がある。**
//
// ⚠ **踏んだこと**: ⚠ **「凡例に当たらない画素」を「整備の穴」と読み違えた。**
//   ⚠ **あれは地図の下地**（⚠ 道路・注記・背景）。⚠ **透明が 0% なのがその証拠。**
//   ⚠ **`public/swale.js` も、⚠ 透明と凡例外を別々に数えている**（⚠ 分母から両方外す）。
//
// ⚠ **当て方は `public/swale.js` と同じ**（⚠ いちばん近い色を選び、⚠ そのあと許容差 60 を見る）。
//   ⚠ **凡例の色は `public/swale.js` から読み出す。**⚠ **書き写さない**
//     （⚠ 書き写すと、⚠ 片方だけ古くなる。`CLAUDE.md` §3）。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

const src = readFileSync("public/swale.js", "utf8");
const cols = [...src.matchAll(/\[\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\]/g)]
  .map((m) => [+m[1], +m[2], +m[3]]);
if (cols.length !== 14) {
  console.error(`⚠ 凡例の色が ${cols.length} 色（⚠ 14 色のはず）。⚠ swale.js の書き方が変わった`);
  process.exit(1);
}

// ⚠ **公開範囲図で「入っていそう／入っていなさそう」を分けて選ぶ**（2026-08-29。`tmp/tmp2.md`）。
//   ⚠ **那覇は、⚠ 公開範囲図では対象外に見える**（⚠ いちばん明確な対照地点）。
const 場所 = [
  // ⚠ 公開範囲に入っていそう
  ["旭川", 43.7708, 142.3650], ["豊洲", 35.6553, 139.7967], ["浦安", 35.6536, 139.9021],
  ["松江", 35.4681, 133.0486],
  // ⚠ **入っていなさそう**（⚠ 公開範囲図から見て）
  ["那覇", 26.2124, 127.6809], ["稚内", 45.4156, 141.6730], ["釧路", 42.9849, 144.3820],
  ["網走", 44.0206, 144.2735], ["札幌", 43.0621, 141.3544], ["盛岡", 39.7020, 141.1544],
  ["長野", 36.6485, 138.1950], ["高知", 33.5597, 133.5311], ["石垣", 24.3448, 124.1572],
];

const b = await chromium.launch();
const p = await b.newPage();
console.log(`⚠ 明治期の低湿地（lcmfc2・z16）／ ⚠ 凡例 ${cols.length} 色は public/swale.js から読んだ\n`);
console.log("場所      HTTP   ⚠ 透明  凡例の色  ⚠ 下地   判定");
console.log("                          （区分）  （道路・注記など）");
for (const [name, lat, lon] of 場所) {
  const Z = 16;
  const u = `https://cyberjapandata.gsi.go.jp/xyz/lcmfc2/${Z}/${x_(lon, Z)}/${y_(lat, Z)}.png`;
  const r = await p.evaluate(async ({ url, cols }) => {
    let res; try { res = await fetch(url); } catch { return { status: "聞けず" }; }
    if (!res.ok) return { status: res.status };
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let hit = 0, miss = 0, clear = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) { clear++; continue; }       // ⚠ 透明は分母から外す（swale.js と同じ）
      let best = 1e9;
      for (const [R, G, B] of cols) {
        const dd = (d[i] - R) ** 2 + (d[i + 1] - G) ** 2 + (d[i + 2] - B) ** 2;
        if (dd < best) best = dd;
      }
      Math.sqrt(best) <= 60 ? hit++ : miss++;
    }
    return { status: res.status, hit, miss, clear, all: d.length / 4 };
  }, { url: u, cols });
  if (typeof r.status !== "number") { console.log(`${name.padEnd(8)}  ⚠ ${r.status}`); continue; }
  if (r.status === 404) {
    console.log(`${name.padEnd(8)}  404      —       —        —   ⚠ **③ 整備範囲外**（⚠ タイルそのものが無い）`);
    continue;
  }
  if (r.hit === undefined) { console.log(`${name.padEnd(8)}  ${r.status}   ⚠ 中身を見ていない`); continue; }
  const pc = (v) => `${(v / r.all * 100).toFixed(1)}%`.padStart(7);
  console.log(`${name.padEnd(8)}  ${r.status}  ${pc(r.clear)} ${pc(r.hit)} ${pc(r.miss)}   `
    + (r.hit === 0 ? "⚠ **② 区分が無い**" : "⚠ ① 区分あり"));
}
await b.close();
