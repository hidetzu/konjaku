// 今昔 — 複数時点の空中写真から、水域→陸域を機械判定できるかを測る（docs/adr/0062）。
//
// これは検査ではない。npm run check から呼ばない。
//   相手先（地理院）の答えに寄りかかるものを、検査にしない。
//
// 回し方: node scripts/survey-era-judge.mjs
//
// 結論: 不採用（2026-08-29。Owner）。
//   既知の 2 か所で、どちらも外した。
//     皇居（ずっと陸）1936–42 を「水かも」と判定した（真っ白。写真ではなく空白か雲）
//     豊洲（1980 年代に埋立）1945–50 を「陸かも」と判定した（その時点では海のはず）
//   資料は揃っている。足りないのは中身を判定する方法。
//   明るさと散らばりでは判定できない（空白・雲・影・干潟が混ざる）。
//
// この走者は、その反証を残すために置いてある。同じことをもう一度試す前に、これを回す。
import { chromium } from "playwright";
// ⚠ **拡張子を出し分ける。**⚠ **verify.js が持っている。**⚠ **書き写して間違えた**（2026-08-29）。
//   ⚠ **gazo1〜4 は .jpg。**⚠ **全部 .png で叩いて「写真が無い」と読んでいた。**
const ERAS = [
  ["1936–42", "ort_riku10", "png"], ["1945–50", "ort_USA10", "png"], ["1961–69", "ort_old10", "png"],
  ["1974–78", "gazo1", "jpg"], ["1979–83", "gazo2", "jpg"], ["1984–86", "gazo3", "jpg"], ["1987–90", "gazo4", "jpg"],
];
const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const px_ = (lon, lat, z) => {
  const X = (lon + 180) / 360 * 2 ** z * 256;
  const r = lat * Math.PI / 180;
  const Y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z * 256;
  return [Math.floor(X) % 256, Math.floor(Y) % 256];
};

const 場所 = [
  ["豊洲（1980 年代に埋立）", 139.7967, 35.6553],
  ["浦安（1970 年代に埋立）", 139.9021, 35.6536],
  ["松江（宍道湖畔）", 133.0486, 35.4681],
  ["皇居（ずっと陸）", 139.7528, 35.6852],
  ["東京湾（ずっと水）", 139.8300, 35.5900],
];
const Z = 16;
const b = await chromium.launch(); const p = await b.newPage();
await p.goto("about:blank");

console.log("⚠ 各年代の写真で、⚠ 現在地まわり 32×32 画素の明るさと散らばり\n");
console.log("場所                     年代       明度  散らばり  判定の目安");
for (const [nm, lon, lat] of 場所) {
  const x = x_(lon, Z), y = y_(lat, Z), [px, py] = px_(lon, lat, Z);
  for (const [label, id, ext] of ERAS) {
    const u = `https://cyberjapandata.gsi.go.jp/xyz/${id}/${Z}/${x}/${y}.${ext}`;
    const r = await p.evaluate(async ({ url, px, py }) => {
      let res; try { res = await fetch(url); } catch { return { err: "聞けず" }; }
      if (res.status === 404) return { none: 1 };
      if (!res.ok) return { err: String(res.status) };
      const bmp = await createImageBitmap(await res.blob());
      const c = new OffscreenCanvas(256, 256);
      const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      const half = 16;
      const sx = Math.max(0, Math.min(256 - 32, px - half)), sy = Math.max(0, Math.min(256 - 32, py - half));
      const d = g.getImageData(sx, sy, 32, 32).data;
      let n = 0, sum = 0, sum2 = 0, clear = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) { clear++; continue; }
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        n++; sum += v; sum2 += v * v;
      }
      if (!n) return { blank: 1 };
      const mean = sum / n;
      return { mean, sd: Math.sqrt(sum2 / n - mean * mean), clear: clear / (d.length / 4) };
    }, { url: u, px, py });
    if (r.err) { console.log(`${nm.padEnd(24)} ${label.padEnd(10)} ⚠ ${r.err}`); continue; }
    if (r.none) { console.log(`${nm.padEnd(24)} ${label.padEnd(10)} ⚠ この年代の写真は無い`); continue; }
    if (r.blank) { console.log(`${nm.padEnd(24)} ${label.padEnd(10)} ⚠ 全部透明`); continue; }
    // ⚠ **水面は「暗くて平ら」、⚠ 市街は「明るくてざらつく」という仮説**。⚠ **仮説であって実測の解釈ではない**
    const 目安 = r.sd < 12 ? "⚠ 平ら（水かも）" : r.sd < 25 ? "中くらい" : "ざらつく（陸かも）";
    console.log(`${nm.padEnd(24)} ${label.padEnd(10)} ${r.mean.toFixed(0).padStart(4)} ${r.sd.toFixed(1).padStart(8)}  ${目安}`);
  }
  console.log("");
}
await b.close();
