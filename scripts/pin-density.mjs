// ⚠ **「地図を開いた瞬間、⚠ ピンが何本見えるか」**を測る。
//
// ⚠ **`docs/adr/0049` の前提**（⚠ 情報がある場所にピンを出す）が成り立つかを見る。
// ⚠ **数字を ADR に書き写さない。**⚠ **走らせて出す**（`CLAUDE.md` §6）。
// ⚠ **回し方**: `node scripts/pin-density.mjs`
//
// ⚠ **点（Wikidata の `ev/`）と面（土地条件・低湿地）は、⚠ 配っている範囲がまるで違う。**
// ⚠ **面はほぼ全国で答えが出るが、⚠ 点は一部の区画にしか無い。**⚠ **そこを数字にする。**
import { readFileSync, existsSync } from "node:fs";

const idx = JSON.parse(readFileSync("public/data/ev/index.json", "utf8"));
const Z = idx.z;
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

// ⚠ **スマホの地図が覆う範囲**。⚠ 375×667・地図が画面いっぱいだとして、
//   ⚠ ズーム 16 なら 1px ≒ 2.4m（緯度 35 度）→ 375px ≒ 900m ／ 667px ≒ 1600m。
// ---- ⚠ 自己検査（`--selftest`）----
//
// ⚠ **`docs/adr/0049` が、⚠ この走者の出力を根拠にしている。**
// ⚠ **確かめるのは、⚠ ADR が寄りかかっている 1 点**:
//
//     ⚠ **点を配っている区画が、⚠ 日本の面積のごく一部にとどまる**
//
// ⚠ **「ごく一部」の線は 5%。**⚠ **ここを超えたら、⚠ ADR の判断を見直す合図。**
if (process.argv.includes("--selftest")) {
  const 枚 = Object.keys(idx.tiles).length;
  const km2 = 枚 * 9.8 * 9.8;
  const 割合 = km2 / 378000 * 100;
  if (!(枚 > 0)) { console.error("ev の区画が 0 枚（⚠ index.json が読めていない）"); process.exit(1); }
  if (割合 >= 5) {
    console.error(`点を配っている範囲が ${割合.toFixed(2)}%（⚠ 5% 未満のはず。⚠ 広がったなら ADR 0049 を見直す）`);
    process.exit(1);
  }
  console.log(`✓ 点（ev）を配っているのは ${枚} 区画・日本の ${割合.toFixed(2)}%（⚠ 面はほぼ全国）`);
  process.exit(0);
}

const 半径m = 450;   // ⚠ 画面の短辺の半分

const 場所 = [
  ["豊洲", 35.6553, 139.7967], ["渋谷", 35.6580, 139.7016], ["軽井沢", 36.3418, 138.6329],
  ["札幌", 43.0621, 141.3544], ["広島", 34.3963, 132.4596], ["浦安", 35.6536, 139.9021],
  ["名古屋", 35.1815, 136.9066], ["福岡", 33.5904, 130.4017],
];

const dist = (a, b, c, d) => { const R = 6371000, p = Math.PI / 180;
  const x = (c - a) * p * Math.cos((b + d) / 2 * p), y = (d - b) * p; return Math.hypot(x, y) * R; };

console.log(`⚠ 地図の中心から ${半径m}m 以内（⚠ スマホ画面の短辺 ≒ 900m 相当）に見えるピンの本数\n`);
console.log("場所        ピン   ⚠ 種類の内訳（上位）");
for (const [name, lat, lon] of 場所) {
  const x = lon2x(lon, Z), y = lat2y(lat, Z);
  let f = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    const p = `public/data/ev/${Z}/${x + dx}/${y + dy}.json`;
    if (existsSync(p)) f = f.concat(JSON.parse(readFileSync(p, "utf8")).f ?? []);
  }
  const near = f.filter((o) => dist(lon, lat, o.c[0], o.c[1]) <= 半径m);
  const kind = new Map();
  for (const o of near) kind.set(o.k, (kind.get(o.k) ?? 0) + 1);
  const top = [...kind].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}:${n}`).join(" ");
  console.log(`${name.padEnd(10)} ${String(near.length).padStart(4)}   ${top || "（0）"}`);
}
console.log(`\n⚠ 配っている ev タイル ${Object.keys(idx.tiles).length} 枚（z=${Z}）`);
console.log("⚠ **配っていない土地では 0 本になる。**⚠ そこは測っていない。");
