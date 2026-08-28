// 今昔 — ⚠ **明治期の低湿地が、⚠ その土地で整備されているか**を数える（`docs/adr/0055`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-swale.mjs`
//
// ⚠ **`HTTP 200` を「データがある」と読まない。**
//   ⚠ **空のタイルでも 200 が返る**（⚠ 2026-08-29 に実際に踏んだ）。
//   ⚠ **画素を数えて、⚠ 凡例に当たるかを見る。**
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

const 場所 = [
  ["網走", 44.0206, 144.2735], ["札幌", 43.0621, 141.3544], ["旭川", 43.7708, 142.3650],
  ["松江", 35.4681, 133.0486], ["豊洲", 35.6553, 139.7967], ["浦安", 35.6536, 139.9021],
];

const b = await chromium.launch();
const p = await b.newPage();
console.log(`⚠ 明治期の低湿地（lcmfc2・z16）／ ⚠ 凡例 ${cols.length} 色は public/swale.js から読んだ\n`);
console.log("場所      HTTP  凡例に当たる  ⚠ 当たらない");
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
    return { status: res.status, hit, miss, clear };
  }, { url: u, cols });
  if (typeof r.status !== "number") { console.log(`${name.padEnd(8)}  ⚠ ${r.status}`); continue; }
  if (r.hit === undefined) { console.log(`${name.padEnd(8)}  ${r.status}   ⚠ 中身を見ていない`); continue; }
  const 全 = r.hit + r.miss;
  console.log(`${name.padEnd(8)}  ${r.status}   ${(r.hit / 全 * 100).toFixed(1).padStart(6)}%  ${(r.miss / 全 * 100).toFixed(1).padStart(8)}%`
    + (r.hit === 0 ? "   ⚠ **凡例に当たる画素が 1 つも無い＝この土地は対象範囲外**" : ""));
}
await b.close();
