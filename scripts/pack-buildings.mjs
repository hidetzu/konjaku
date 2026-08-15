// 既に取った建物のファイルを、配れる形に詰め直す。
//
// ⚠ Overpass に二度同じことを訊かないために、取り込みとは別にしてある。
//   取ったファイルそのものが生データなので、詰め方を変えても手元だけで直せる。
//
// 実行: node scripts/pack-buildings.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { pack, unpack, VERSION } from "./bl-format.mjs";

const OUT = "public/data/bl/14";
const dry = process.argv.includes("--dry");

const files = [];
for (const x of readdirSync(OUT))
  for (const f of readdirSync(`${OUT}/${x}`))
    if (f.endsWith(".json")) files.push(`${OUT}/${x}/${f}`);
files.sort();

let rawIn = 0, rawOut = 0, gzIn = 0, gzOut = 0, done = 0, already = 0, feats = 0, dropped = 0;
const worst = { file: "", gz: 0 };

for (const p of files) {
  const src = readFileSync(p, "utf8");
  const d = JSON.parse(src);
  if (d.v === VERSION) { already++; continue; }
  const packed = pack(d.features, d.tile, d.at,
    d.truncated ? { truncated: d.truncated } : {});
  const out = JSON.stringify(packed);

  // ⚠ 詰めたものを戻して、元と同じ形になるか必ず確かめる。
  //   ここを飛ばすと、建物が1m ずれたまま全部を書き換えることになる
  const back = unpack(packed);
  if (back.features.length + (d.features.length - back.features.length) !== d.features.length)
    throw new Error(`${p} 件数が合わない`);
  dropped += d.features.length - back.features.length;
  for (let i = 0, j = 0; i < d.features.length; i++) {
    const a = d.features[i];
    if (!["measured", "levels", "default"].includes(a.properties.heightSource)) continue;
    const b = back.features[j++];
    const ar = a.geometry.coordinates[0], br = b.geometry.coordinates[0];
    if (ar.length !== br.length) throw new Error(`${p} 点の数が変わった: ${ar.length}→${br.length}`);
    for (let k = 0; k < ar.length; k++)
      for (const c of [0, 1])
        // 1e-5 度（約1m）に丸めているので、そこまでは一致すること
        if (Math.abs(ar[k][c] - br[k][c]) > 1e-5 + 1e-9)
          throw new Error(`${p} 座標がずれた: ${ar[k][c]} → ${br[k][c]}`);
    // 0.1m 刻みにしたので、ずれの上限は 0.05m。
    // ⚠ 画面側も元から Math.round(h*10)/10 で 0.1m 刻みに出しているので、
    //   見える値は変わらない（刻みを粗くしたのではなく、既にあった刻みに合わせた）
    if (Math.abs(a.properties.height - b.properties.height) > 0.05 + 1e-9)
      throw new Error(`${p} 高さが変わった: ${a.properties.height} → ${b.properties.height}`);
    if (a.properties.heightSource !== b.properties.heightSource)
      throw new Error(`${p} 高さの出所が変わった`);
  }

  const gi = gzipSync(src).length, go = gzipSync(out).length;
  rawIn += src.length; rawOut += out.length; gzIn += gi; gzOut += go;
  feats += packed.b.length; done++;
  if (go > worst.gz) { worst.gz = go; worst.file = p; }
  if (!dry) writeFileSync(p, out);
}

const mb = (v) => `${(v / 1048576).toFixed(1)}MB`;
const kb = (v) => `${Math.round(v / 1024)}KB`;
console.log(`${dry ? "（書かずに見るだけ）" : ""}詰め直した ${done} 枚`
  + (already ? `／すでに詰めてある ${already} 枚` : ""));
console.log(`  そのまま  ${mb(rawIn).padStart(7)}  gz ${kb(gzIn).padStart(7)}`);
console.log(`  詰めた後  ${mb(rawOut).padStart(7)}  gz ${kb(gzOut).padStart(7)}`
  + `   → ${(rawIn / rawOut).toFixed(1)}倍 / gz ${(gzIn / gzOut).toFixed(1)}倍`);
console.log(`  建物 ${feats.toLocaleString()} 件`
  + (dropped ? `（高さの出所が分からない ${dropped} 件は落とした）` : ""));
console.log(`  いちばん重い1枚  gz ${kb(worst.gz)}  ${worst.file}`);
