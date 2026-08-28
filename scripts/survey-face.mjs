// 今昔 — ⚠ **面（土地の成り立ち）から何が言えるか**を数える（`docs/adr/0053`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**（⚠ **分けて回す**）:
//
//     node scripts/survey-face.mjs 0 7
//     node scripts/survey-face.mjs 7 13
//
// ⚠ **「落差」＝ 足元の区分が占める割合の、⚠ 300m と 1000m の差。**
//   ⚠ **大きいほど「半径を広げると顔が変わる」。**⚠ **小さいほど「広げても同じ」。**
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

// ⚠ **`scripts/survey-pins.mjs` と同じ 13 か所**（⚠ 突き合わせられるように揃える）
const 場所 = [
  ["都心・渋谷", 35.6580, 139.7016], ["都心・梅田", 34.7024, 135.4959],
  ["埋立・浦安", 35.6536, 139.9021], ["郊外・所沢", 35.7990, 139.4690],
  ["郊外・春日部", 35.9756, 139.7522],
  ["地方・高知", 33.5597, 133.5311], ["地方・松江", 35.4681, 133.0486],
  ["地方・弘前", 40.6031, 140.4640], ["地方・佐賀", 33.2494, 130.2988],
  ["城下町・松本", 36.2381, 137.9720], ["宿場・関宿", 34.8556, 136.3960],
  ["農村・美瑛", 43.5883, 142.4700], ["漁村・鞆の浦", 34.3830, 133.3820],
  // ⚠ **網走を足した**（2026-08-29。`docs/adr/0055`）。
  //   ⚠ **整備されていない土地が混ざる例**（⚠ ほかの 13 か所では、⚠ そこまで出なかった）。
  ["北海道・網走", 44.0206, 144.2735],
];
const FROM = Number(process.argv[2] ?? 0), TO = Number(process.argv[3] ?? 99);
for (const [name, lat, lon] of 場所.slice(FROM, TO)) {
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
  const 足元 = polys.find((q) => inPoly(lon, lat, q.p))?.名 ?? "取れず";
  const h = await 標高(lat, lon);
  const 割合 = {};
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
    割合[r] = { 種, n };
  }
  // ⚠ **足元の区分が占める割合**（⚠ これが下がるほど「顔が変わる」）
  const 占有 = (r) => { const { 種, n } = 割合[r];
    return n ? Math.round((種.get(足元) ?? 0) / n * 100) : null; };
  // ⚠ **いちばん近い別の区分までの距離**
  const dLat = 1000 / 111320, dLon = 1000 / (111320 * Math.cos(lat * Math.PI / 180));
  let 近い = null;
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) {
    const la = lat - dLat + 2 * dLat * (i + .5) / 60, lo = lon - dLon + 2 * dLon * (j + .5) / 60;
    const d = dist(lon, lat, lo, la); if (d > 1000) continue;
    const hit = polys.find((q) => inPoly(lo, la, q.p));
    if (hit && hit.名 !== 足元 && (!近い || d < 近い.d)) 近い = { 名: hit.名, d: Math.round(d) };
  }
  const 落差 = (占有(300) != null && 占有(1000) != null) ? 占有(300) - 占有(1000) : null;
  console.log(`${name.padEnd(14)} ${String(足元).padEnd(12)} ${String(h ?? "?").padStart(6)}m  ` +
    `${String(占有(300)).padStart(3)}% ${String(占有(500)).padStart(3)}% ${String(占有(1000)).padStart(3)}%  ` +
    `落差 ${String(落差).padStart(3)}  ` +
    `${近い ? `${String(近い.d).padStart(4)}m先 ${近い.名}` : "1km 以内に無し"}`);
}
