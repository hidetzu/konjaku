// 今昔 — ⚠ **現在地の区分が、⚠ 面積上位 3 種に入るか**を数える（`docs/adr/0055`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//
// ⚠ **回し方**: `node scripts/survey-legend-fit.mjs`
//
// ⚠ **この走者が、⚠ 「凡例は面積順ではなく、⚠ 現在地を必ず含める」という
//   ⚠ 決めごとの根拠になっている**（`docs/adr/0055`）。
// ⚠ **現在地の区分が 4 位以下だと、⚠ カードに書いた色が凡例から消える。**
import { readFileSync } from "node:fs";
const T = JSON.parse(readFileSync("public/data/landform.json", "utf8")).codes;
const NAT = "https://maps.gsi.go.jp/xyz/experimental_landformclassification1";
const ART = "https://maps.gsi.go.jp/xyz/experimental_landformclassification2";
const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const inRing = (x, y, r) => { let h = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) h = !h; } return h; };
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));

const 場所 = [
  ["渋谷", 35.6580, 139.7016], ["梅田", 34.7024, 135.4959], ["浦安", 35.6536, 139.9021],
  ["所沢", 35.7990, 139.4690], ["春日部", 35.9756, 139.7522], ["高知", 33.5597, 133.5311],
  ["松江", 35.4681, 133.0486], ["弘前", 40.6031, 140.4640], ["佐賀", 33.2494, 130.2988],
  ["松本", 36.2381, 137.9720], ["関宿", 34.8556, 136.3960], ["美瑛", 43.5883, 142.4700],
  ["鞆の浦", 34.3830, 133.3820], ["網走", 44.0206, 144.2735], ["豊洲", 35.6553, 139.7967],
];
const Z = 16;
console.log("⚠ 375×667 の viewport（z16）で、⚠ 足元は面積上位 3 つに入るか\n");
console.log("場所      足元                  順位  上位 3 つ");
let 落ちる = 0;
for (const [name, lat, lon] of 場所) {
  const polys = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const base of [NAT, ART]) {
    try { const r = await fetch(`${base}/${Z}/${x_(lon, Z) + dx}/${y_(lat, Z) + dy}.geojson`,
      { signal: AbortSignal.timeout(25000) });
      if (!r.ok) continue;
      for (const f of (await r.json()).features ?? []) {
        const n = T[String(f.properties?.code ?? "")]; if (!n || !f.geometry) continue;
        const g = f.geometry;
        const ps = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        for (const q of ps) polys.push({ 名: n, p: q });
      } } catch { }
  }
  const 足元 = polys.find((q) => inPoly(lon, lat, q.p))?.名 ?? null;
  // ⚠ **375×667 が覆う範囲**（⚠ z16・緯度で変わる）
  const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** Z;
  const dLat = 667 * mpp / 2 / 111320, dLon = 375 * mpp / 2 / (111320 * Math.cos(lat * Math.PI / 180));
  const 種 = new Map();
  for (let i = 0; i < 40; i++) for (let j = 0; j < 24; j++) {
    const la = lat - dLat + 2 * dLat * (i + .5) / 40, lo = lon - dLon + 2 * dLon * (j + .5) / 24;
    const hit = polys.find((q) => inPoly(lo, la, q.p));
    if (hit) 種.set(hit.名, (種.get(hit.名) ?? 0) + 1);
  }
  const 並び = [...種].sort((a, b) => b[1] - a[1]);
  const 順 = 足元 ? 並び.findIndex(([k]) => k === 足元) + 1 : 0;
  const 外 = 順 === 0 || 順 > 3;
  if (外) 落ちる++;
  console.log(`${name.padEnd(8)}  ${String(足元 ?? "取れず").padEnd(20)} ${String(順 || "—").padStart(3)}${外 ? " ⚠" : "  "}  ${並び.slice(0,3).map(([k])=>k).join(" / ")}`);
}
console.log(`\n⚠ **足元が上位 3 つに入らない: ${落ちる} / ${場所.length} 地点**`);
