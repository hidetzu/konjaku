// 今昔 — ⚠ **場所の型（Type A〜D）が実在するか**を数える（`docs/adr/0058`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//
// ⚠ **回し方**: `node scripts/survey-place-type.mjs`
//
// ⚠ **出典ごとに判定し、⚠ 組み合わせで型を作る**（`docs/adr/0058`）。
//   ⚠ **型を保存しない**という決めごとに合わせ、⚠ ここでも出典ごとの状態を先に出す。
//
//     低湿地    A1 区分あり ／ A2 区分なし ／ A3 整備範囲外
//     地形分類  B1 詳細 ／ B2 広域・地域 ／ B3 取得できない ／ B4 取得失敗
//
// ⚠ **A2 と B3 は、⚠ まだ実物を見ていない。**⚠ **出たら、⚠ そう書く。**
import { chromium } from "playwright";
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

const src = readFileSync("public/swale.js", "utf8");
const cols = [...src.matchAll(/\[\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\]/g)]
  .map((m) => [+m[1], +m[2], +m[3]]);

// ⚠ **Type B / D を探しに行く。**⚠ 低湿地が在って地形分類が無い土地 ／ どちらも無い土地。
//   ⚠ **山間・離島・北の端**を厚くする（⚠ 地形分類の詳細版が無い土地）。
const 場所 = [
  ["都市・豊洲", 35.6553, 139.7967], ["都市・梅田", 34.7024, 135.4959],
  ["対象外・那覇", 26.2124, 127.6809], ["対象外・石垣", 24.3448, 124.1572],
  ["対象外・稚内", 45.4156, 141.6730], ["対象外・高知", 33.5597, 133.5311],
  ["山間・上高地", 36.2500, 137.6320], ["山間・十津川", 34.0640, 135.7900],
  ["離島・小笠原", 27.0940, 142.1910], ["離島・佐渡", 38.0180, 138.3680],
  ["離島・利尻", 45.1830, 141.2420], ["離島・対馬", 34.2030, 129.2870],
  ["山間・尾瀬", 36.9330, 139.2270], ["山間・白川郷", 36.2570, 136.9060],
  ["北・根室", 43.3300, 145.5820], ["南・屋久島", 30.3580, 130.5560],
];

const b = await chromium.launch(); const p = await b.newPage();
console.log("⚠ 実測 2026-08-29 ／ `docs/adr/0058` の出典ごとの状態\n");
console.log("場所            低湿地              地形分類                    型");
for (const [name, lat, lon] of 場所) {
  // ---- 低湿地 ----
  let A = "?";
  const su = `https://cyberjapandata.gsi.go.jp/xyz/lcmfc2/16/${x_(lon, 16)}/${y_(lat, 16)}.png`;
  const sr = await p.evaluate(async ({ url, cols }) => {
    let res; try { res = await fetch(url); } catch { return { err: 1 }; }
    if (res.status === 404) return { out: 1 };
    if (!res.ok) return { err: 1 };
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      let best = 1e9;
      for (const [R, G, B] of cols) {
        const dd = (d[i] - R) ** 2 + (d[i + 1] - G) ** 2 + (d[i + 2] - B) ** 2;
        if (dd < best) best = dd;
      }
      if (Math.sqrt(best) <= 60) hit++;
    }
    return { hit };
  }, { url: su, cols });
  A = sr.err ? "A4 取得失敗" : sr.out ? "A3 整備範囲外" : sr.hit ? "A1 区分あり" : "A2 区分なし";

  // ---- 地形分類 ----
  let B = "B4 取得失敗", 名 = "";
  for (const [段, Z] of [["B1 詳細", 16], ["B2 広域", 13]]) {
    const polys = []; let 生きた = 0;
    for (const base of [NAT, ART]) {
      try {
        const r = await fetch(`${base}/${Z}/${x_(lon, Z)}/${y_(lat, Z)}.geojson`,
          { signal: AbortSignal.timeout(25000) });
        if (r.status === 404) { 生きた++; continue; }   // ⚠ 404 は「無い」（⚠ 落ちたのではない）
        if (!r.ok) continue;
        生きた++;
        for (const f of (await r.json()).features ?? []) {
          const n = T[String(f.properties?.code ?? "")]; if (!n || !f.geometry) continue;
          const g = f.geometry;
          const ps = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
          for (const q of ps) polys.push({ 名: n, p: q });
        }
      } catch { }
    }
    if (!生きた) { B = "B4 取得失敗"; break; }
    const hit = polys.find((q) => inPoly(lon, lat, q.p));
    if (hit) { B = 段; 名 = hit.名; break; }
    B = "B3 分類なし";
  }

  const 昔 = A === "A1 区分あり";
  const 土 = B === "B1 詳細" || B === "B2 広域";
  const 型 = 昔 && 土 ? "A" : 昔 ? "⚠ **B**" : 土 ? "C" : "⚠ **D**";
  console.log(`${name.padEnd(14)} ${A.padEnd(14)}  ${(B + (名 ? ` (${名})` : "")).padEnd(24)}  ${型}`);
}
await b.close();
