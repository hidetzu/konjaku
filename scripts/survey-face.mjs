// 今昔 — ⚠ **面（土地の成り立ち）から何が言えるか**を数える（`docs/adr/0053`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-face.mjs`
//
// ⚠ **測るのは 3 つ**: ⚠ 足元の区分 ／ ⚠ 半径ごとの内訳 ／ ⚠ いちばん近い別の区分までの距離。
// ⚠ **`docs/adr/0053` が、⚠ この出力を根拠にしている。**⚠ **数字を ADR に書き写さない。**
import { readFileSync } from "node:fs";
const T = JSON.parse(readFileSync("public/data/landform.json", "utf8")).codes;
const Z = 16;
const NAT = "https://maps.gsi.go.jp/xyz/experimental_landformclassification1";
const ART = "https://maps.gsi.go.jp/xyz/experimental_landformclassification2";
const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const dist = (a, b, c, d) => { const R = 6371000, p = Math.PI / 180;
  return Math.hypot((c - a) * p * Math.cos((b + d) / 2 * p), (d - b) * p) * R; };
const inRing = (x, y, r) => { let h = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) h = !h; } return h; };
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));

// ⚠ 標高（⚠ 地理院。⚠ β 版も使っている口）
const 標高 = async (lat, lon) => {
  try { const r = await fetch(`https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon}&lat=${lat}&outtype=JSON`,
    { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null; const j = await r.json();
    return typeof j.elevation === "number" ? j.elevation : null; } catch { return null; }
};

const 場所 = [["浦安", 35.6536, 139.9021], ["春日部", 35.9756, 139.7522]];
for (const [name, lat, lon] of 場所) {
  const polys = [];
  for (const dx of [-2, -1, 0, 1, 2]) for (const dy of [-2, -1, 0, 1, 2]) for (const base of [NAT, ART]) {
    try { const r = await fetch(`${base}/${Z}/${x_(lon, Z) + dx}/${y_(lat, Z) + dy}.geojson`,
      { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      for (const f of (await r.json()).features ?? []) {
        const 名 = T[String(f.properties?.code ?? "")]; if (!名 || !f.geometry) continue;
        const g = f.geometry;
        const ps = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        for (const p of ps) polys.push({ 名, p });
      } } catch { }
  }
  const 足元 = polys.find((q) => inPoly(lon, lat, q.p))?.名 ?? "⚠ 取れず";
  const h = await 標高(lat, lon);
  console.log(`\n===== ${name}（${lat}, ${lon}）=====`);
  console.log(`  足元          ${足元}`);
  console.log(`  標高          ${h == null ? "⚠ 取れず" : h + "m"}`);

  for (const r of [300, 500, 1000]) {
    const 種 = new Map();
    const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
    let n = 0;
    for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
      const la = lat - dLat + 2 * dLat * (i + .5) / 30, lo = lon - dLon + 2 * dLon * (j + .5) / 30;
      if (dist(lon, lat, lo, la) > r) continue;
      n++;
      const hit = polys.find((q) => inPoly(lo, la, q.p));
      if (hit) 種.set(hit.名, (種.get(hit.名) ?? 0) + 1);
    }
    const 並び = [...種].sort((a, b) => b[1] - a[1]);
    console.log(`  半径 ${String(r).padStart(4)}m  ${種.size} 種類  ` +
      並び.map(([k, v]) => `${k} ${(v / n * 100).toFixed(0)}%`).join(" ／ "));
  }
  // ⚠ **いちばん近い「別の区分」までの距離**（⚠ 「50m 先から○○」が言えるか）
  const dLat = 1000 / 111320, dLon = 1000 / (111320 * Math.cos(lat * Math.PI / 180));
  let 近い = null;
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) {
    const la = lat - dLat + 2 * dLat * (i + .5) / 60, lo = lon - dLon + 2 * dLon * (j + .5) / 60;
    const d = dist(lon, lat, lo, la); if (d > 1000) continue;
    const hit = polys.find((q) => inPoly(lo, la, q.p));
    if (hit && hit.名 !== 足元 && (!近い || d < 近い.d)) 近い = { 名: hit.名, d: Math.round(d) };
  }
  console.log(`  いちばん近い別の区分  ${近い ? `${近い.d}m 先に ${近い.名}` : "⚠ 1km 以内に無い"}`);
}
