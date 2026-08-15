// 明治期の水域を、ラスタタイルから「面」に起こす。
//
// peel.html で水を 3D の面として立ち上げるために必要。
// ラスタのままだと地面に貼った絵でしかなく、水が戻ってくる感じが出ない。
//
// やっていること:
//   1. 明治期低湿地タイル(z16)を bbox 分だけ取得して画素を読む
//   2. 「水」に分類される区分だけを 1 にした二値マスクを作る
//   3. マスクを重なりのない矩形に分解して GeoJSON にする
//      （重ならないので半透明にしても継ぎ目が濃くならない）
//
// 実行: node build-water.js

import { writeFile } from "node:fs/promises";
import zlib from "node:zlib";

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
const Z = 16;
// ★ 別の地点を足すとき: NAME と BBOX を書き換えて実行し、
//    出来た GeoJSON を public/data/areas.json に1件足す（peel.html が索引で引く）。
const NAME = "toyosu";
const BBOX = { s: 35.6480, w: 139.7880, n: 35.6620, e: 139.8060 };
// 配信するのは public/ だけなので、そこへ直接書く（スクリプトからの相対＝cwd に依存しない）
const OUT = new URL(`public/data/${NAME}-water.geojson`, import.meta.url);

// 「水」とみなす区分。凡例 lw_legend.pdf の配色より。
// 干潟・砂浜は満潮時に海面下になる地形なので水に含める。
const WATER_RGB = [
  [147, 200, 254], // 河川・湖沼・海面
  [209, 234, 255], // 干潟・砂浜
];
const TOL = 60;

function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  if (ct !== 6) throw new Error(`colortype ${ct} は未対応`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { w, h, data: out };
}

const lon2xf = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2yf = (lat) => { const r = lat * Math.PI / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };
const xf2lon = (xf) => xf / 2 ** Z * 360 - 180;
const yf2lat = (yf) => { const n = Math.PI - 2 * Math.PI * yf / 2 ** Z;
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

// --- 対象タイル範囲 ---
const x0 = Math.floor(lon2xf(BBOX.w)), x1 = Math.floor(lon2xf(BBOX.e));
const y0 = Math.floor(lat2yf(BBOX.n)), y1 = Math.floor(lat2yf(BBOX.s));
const TW = (x1 - x0 + 1) * 256, TH = (y1 - y0 + 1) * 256;
console.log(`タイル ${x1 - x0 + 1} x ${y1 - y0 + 1} 枚  → ${TW} x ${TH} px`);

// --- 二値マスク ---
const mask = new Uint8Array(TW * TH);
let waterPx = 0, missing = 0;

for (let ty = y0; ty <= y1; ty++) {
  for (let tx = x0; tx <= x1; tx++) {
    const r = await fetch(`${GSI}/swale/${Z}/${tx}/${ty}.png`);
    if (!r.ok) { missing++; continue; }
    const img = decodePNG(Buffer.from(await r.arrayBuffer()));
    const ox = (tx - x0) * 256, oy = (ty - y0) * 256;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * img.w + x) * 4;
        if (img.data[i + 3] === 0) continue;
        const [R, G, B] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        for (const [wr, wg, wb] of WATER_RGB) {
          if (Math.hypot(R - wr, G - wg, B - wb) <= TOL) {
            mask[(oy + y) * TW + (ox + x)] = 1; waterPx++;
            break;
          }
        }
      }
    }
  }
}
console.log(`水の画素 ${waterPx} / ${TW * TH}  (${(waterPx / (TW * TH) * 100).toFixed(1)}%)  タイル欠け ${missing}`);

// --- 重ならない矩形に分解する（貪欲法） ---
// 重なりが無いので、半透明で描いても継ぎ目が濃くならない。
const used = new Uint8Array(TW * TH);
const rects = [];
for (let y = 0; y < TH; y++) {
  for (let x = 0; x < TW; x++) {
    const i = y * TW + x;
    if (!mask[i] || used[i]) continue;
    let w = 0;
    while (x + w < TW && mask[i + w] && !used[i + w]) w++;
    let h = 1;
    outer: while (y + h < TH) {
      for (let k = 0; k < w; k++) {
        const j = (y + h) * TW + x + k;
        if (!mask[j] || used[j]) break outer;
      }
      h++;
    }
    for (let dy = 0; dy < h; dy++) used.fill(1, (y + dy) * TW + x, (y + dy) * TW + x + w);
    rects.push([x, y, w, h]);
  }
}
console.log(`矩形 ${rects.length} 個に分解`);

const features = rects.map(([x, y, w, h]) => {
  const lonA = xf2lon(x0 + x / 256), lonB = xf2lon(x0 + (x + w) / 256);
  const latA = yf2lat(y0 + y / 256), latB = yf2lat(y0 + (y + h) / 256);
  return {
    type: "Feature", properties: {},
    geometry: { type: "Polygon", coordinates: [[
      [lonA, latA], [lonB, latA], [lonB, latB], [lonA, latB], [lonA, latA],
    ]] },
  };
});

await writeFile(OUT, JSON.stringify({
  type: "FeatureCollection",
  metadata: {
    bbox: BBOX, zoom: Z,
    source: "国土地理院「明治期の低湿地」タイルより生成",
    classes: "河川・湖沼・海面 / 干潟・砂浜",
    waterRatio: +(waterPx / (TW * TH)).toFixed(4),
    note: "ラスタ画素を二値化し、重ならない矩形に分解したもの。位置精度は原典に依存する。",
  },
  features,
}));
console.log(`\npublic/data/${NAME}-water.geojson に保存（${features.length} feature）`);
