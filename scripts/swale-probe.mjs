// 明治期の低湿地データを、地点ごとに「点」と「面」の両方で測る道具。
//
// なぜ要るか:
//   浦安で、判定文（旧水部）・バッジ（明治期: 荒地）・重ねている絵（砂礫地 85.8%）が
//   別々のことを言っていた（2026-08-17）。どれも嘘ではなく、出どころが 3 つ違うだけ。
//   **面で答えるほうがよさそう**だが、決める前に数字が要る。
//   ⚠ 見せ方（何と名乗るか）はここでは決めない。ここは測るだけ。
//
// 実行:
//   node scripts/swale-probe.mjs                  … 既定の地点をまとめて測る
//   node scripts/swale-probe.mjs 35.654 139.902   … 緯度 経度 を指定して1点だけ
//
// ⚠ 国土地理院のタイルを引く。地点を増やすと、増やしただけ外へ出る
//   （掟: 地理院への負荷は自分の請求とは別に見る）。既定は 6 地点 = z16 タイル 6 枚。
import zlib from "node:zlib";
import { readFile } from "node:fs/promises";

await import("../public/swale.js");
const S = globalThis.KonjakuSwale;

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
const Z = 16;

// 既定の地点。**判定が割れるところを選ぶ**（全部が水域だと、面と点の違いが出ない）。
const PLACES = [
  ["豊洲", 35.65480, 139.79750],
  ["浦安", 35.65400, 139.90200],
  ["お台場", 35.63000, 139.77600],
  ["夢の島", 35.64830, 139.82650],
  ["清澄白河", 35.68170, 139.80000],
  ["上野", 35.71480, 139.77450],
];

const tileOf = (lon, lat) => {
  const n = 2 ** Z, r = lat * Math.PI / 180;
  return { xf: (lon + 180) / 360 * n,
           yf: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n };
};

// PNG を素で読む（Node に画像デコーダが無いので、必要なぶんだけ）。
// ⚠ build-water.js / swale-sample.mjs と同じことをしている。
//   ここも将来まとめる候補だが、**まず凡例と分類を寄せた**（そちらのほうが危ない）。
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * ch, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + b) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (ch >= 3) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2];
        out[o + 3] = ch === 4 ? line[s + 3] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = ch === 2 ? line[s + 1] : 255; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

async function tile(x, y) {
  const url = `${GSI}/swale/${Z}/${x}/${y}.png`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return { state: "整備対象外", url };
  if (!r.ok) return { state: `読めない(${r.status})`, url };
  return { state: "ok", url, ...decodePNG(Buffer.from(await r.arrayBuffer())) };
}

// 1 画素だけの答え（いまの画面が出しているもの）
const atPoint = (img, px, py) => {
  const o = (py * img.w + px) * 4;
  if (img.data[o + 3] < 8) return "（塗られていない）";
  return S.classify(img.data[o], img.data[o + 1], img.data[o + 2])?.name ?? "（凡例外）";
};

// 面の答え。⚠ 範囲を **半径 r 画素の正方形** で切る（z16 の 1 画素 ≒ 2.4m）。
//   分母は tally が返す classified（透明と凡例外を外した数）。
const around = (img, px, py, r) => {
  const buf = [];
  for (let y = Math.max(0, py - r); y <= Math.min(img.h - 1, py + r); y++)
    for (let x = Math.max(0, px - r); x <= Math.min(img.w - 1, px + r); x++) {
      const o = (y * img.w + x) * 4;
      buf.push(img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]);
    }
  return S.tally(new Uint8ClampedArray(buf));
};

const M_PER_PX = (lat) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** Z;

const args = process.argv.slice(2);
const targets = args.length >= 2
  ? [["指定した地点", Number(args[0]), Number(args[1])]] : PLACES;

console.log(`明治期の低湿地データ（z${Z}）を、点と面の両方で測る`);
console.log(`⚠ 実測値そのもの。見せ方は決めない。1 画素 ≒ ${M_PER_PX(35.65).toFixed(1)}m（緯度 35.65）\n`);

for (const [name, lat, lon] of targets) {
  const t = tileOf(lon, lat);
  const x = Math.floor(t.xf), y = Math.floor(t.yf);
  const px = Math.floor((t.xf - x) * 256), py = Math.floor((t.yf - y) * 256);
  const img = await tile(x, y);
  if (img.state !== "ok") { console.log(`${name.padEnd(9)} ${img.state}  ${img.url}`); continue; }
  const m = M_PER_PX(lat);
  console.log(`■ ${name}  (${lat}, ${lon})  z${Z}/${x}/${y} の (${px},${py})`);
  console.log(`   点（いまの画面）      : ${atPoint(img, px, py)}`);
  // 半径をいくつか出す。⚠ SPEC は明治期を「街区単位まで」としているので、そのあたりを厚く見る
  for (const r of [7, 21, 52, 128]) {
    const a = around(img, px, py, r);
    const side = Math.round((2 * r + 1) * m);
    const top = a.top ? `${a.top.name} ${(a.top.share * 100).toFixed(1)}%` : "（区分なし）";
    const list = a.byName.slice(0, 3)
      .map((c) => `${c.name} ${(c.share * 100).toFixed(1)}%`).join(" / ");
    console.log(`   面 ${String(side).padStart(4)}m 四方 : ${top.padEnd(22)}`
      + ` 水域 ${(a.waterShare * 100).toFixed(1)}%`
      + ` ／ 分母 ${a.classified}/${a.scanned}px（塗られていない ${a.transparent}・凡例外 ${a.unmatched}）`);
    if (r === 52) console.log(`      内訳: ${list}`);
  }
  console.log();
}
