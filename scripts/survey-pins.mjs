// 今昔 — ⚠ **「深掘り地点」の条件で、⚠ 何件になるかを数える**（`docs/adr/0052`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（Overpass・地理院）の答えに寄りかかるものを、⚠ 検査にしない**
//     （`CLAUDE.md` §9。⚠ **こちらの正しさだけを主張する**）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-pins.mjs`
//
// ⚠ **踏んだこと（2026-08-29）**: ⚠ **404 を「0 件」として数えていた。**
//   ⚠ **伝承碑は `maxNativeZoom: 7`** で、⚠ z13〜16 は 404 を返す。
//   ⚠ **`if (!r.ok) continue;` にしていたので、⚠ 全部 0 件に見えた。**
//   ⚠ **取れなかったことと、⚠ 無いことを分ける**（掟 §1）。⚠ **いまは「聞けず」と書く。**
//
// ⚠ **Overpass は断ってくる**（⚠ 429 / 504）。⚠ **断られたら「聞けず」。**⚠ **0 と混ぜない。**
import { setTimeout as sleep } from "node:timers/promises";
const 場所 = [
  ["浦安", 35.6536, 139.9021], ["渋谷", 35.6580, 139.7016], ["大阪梅田", 34.7024, 135.4959],
  ["郊外・所沢", 35.7990, 139.4690], ["地方都市・高知", 33.5597, 133.5311],
];
const 半径 = [300, 500, 1000];
const dist = (a, b, c, d) => { const R = 6371000, p = Math.PI / 180;
  return Math.hypot((c - a) * p * Math.cos((b + d) / 2 * p), (d - b) * p) * R; };
const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

const 昔の印 = (t) =>
  /^(ruins|archaeological_site|castle|city_gate|fort|battlefield|aqueduct|mine|wreck|tomb|milestone|boundary_stone|manor|monastery|railway|highwater_mark|ship|locomotive|aircraft|cannon)$/.test(t.historic ?? "")
  || t.ruins || t.razed || t["abandoned:railway"] || t["disused:railway"] || t["demolished:building"]
  || /(跡|廃|旧|遺跡|古墳|城址|城跡)/.test(t.name ?? "");
const 年 = (t) => t.start_date || t.end_date || t.inscription_date
  || (/\d{3,4}/.test(t.inscription ?? "") ? t.inscription : null)
  || (/\d{3,4}\s*年|\d{4}/.test(t.description ?? "") ? t.description : null);

const osm = async (lat, lon, r) => {
  const q = `[out:json][timeout:90];
(nwr(around:${r},${lat},${lon})[historic];nwr(around:${r},${lat},${lon})[ruins];
 nwr(around:${r},${lat},${lon})["abandoned:railway"];nwr(around:${r},${lat},${lon})["disused:railway"];
 nwr(around:${r},${lat},${lon})["demolished:building"];nwr(around:${r},${lat},${lon})[razed];);out tags center 500;`;
  for (const ep of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const res = await fetch(ep, { method: "POST", body: q,
        headers: { "user-agent": "konjaku-survey/1.0" }, signal: AbortSignal.timeout(120000) });
      if (!res.ok) { await sleep(4000); continue; }
      return { ok: true, els: (await res.json()).elements ?? [] };
    } catch { await sleep(4000); }
  }
  return { ok: false, els: [] };
};

// ⚠ **伝承碑は z=7 が実体**（`maxNativeZoom: 7`）。⚠ **1 枚が広いので 1 枚で足りる。**
const LZ = 7;
const lore = async (lat, lon) => {
  const u = `https://maps.gsi.go.jp/xyz/disaster_lore_all/${LZ}/${x_(lon, LZ)}/${y_(lat, LZ)}.geojson`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(40000) });
    if (!r.ok) return { ok: false, fs: [] };          // ⚠ **404 を 0 件と混ぜない**
    return { ok: true, fs: (await r.json()).features ?? [] };
  } catch { return { ok: false, fs: [] }; }
};

console.log("⚠ 条件 3・4 で絞ったら何件になるか（⚠ 取れなかったときは「聞けず」と書く）\n");
console.log("場所            半径   ①昔あったもの(OSM)          ②起きたこと(伝承碑)");
console.log("                       全部 → 名前＋昔 → ＋年");
for (const [name, lat, lon] of 場所) {
  const o = await osm(lat, lon, 1000);
  const l = await lore(lat, lon);
  for (const r of 半径) {
    if (!o.ok || !l.ok) {
      console.log(`${name.padEnd(14)} ${String(r).padStart(4)}m   ${o.ok ? "" : "⚠ OSM 聞けず  "}${l.ok ? "" : "⚠ 伝承碑 聞けず"}`);
      continue;
    }
    const near = o.els.filter((e) => { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
      return la != null && dist(lon, lat, lo, la) <= r; });
    const A = near.filter((e) => (e.tags?.name) && 昔の印(e.tags ?? {}));
    const B = A.filter((e) => 年(e.tags ?? {}));
    const L = l.fs.filter((f) => { const c = f.geometry?.coordinates;
      return c && dist(lon, lat, c[0], c[1]) <= r; });
    console.log(`${name.padEnd(14)} ${String(r).padStart(4)}m   ${String(near.length).padStart(4)} → ${String(A.length).padStart(3)} → ${String(B.length).padStart(3)}            ${String(L.length).padStart(3)}`);
  }
  if (o.ok) for (const e of o.els.filter((x) => x.tags?.name && 昔の印(x.tags)).slice(0, 2))
    console.log(`                 OSM: ${e.tags.name}（historic=${e.tags.historic ?? "-"}）`);
  if (l.ok) for (const f of l.fs.filter((f) => { const c = f.geometry?.coordinates;
      return c && dist(lon, lat, c[0], c[1]) <= 1000; }).slice(0, 2))
    console.log(`                 伝承碑: ${f.properties.LoreName}（${f.properties.LoreYear}）${String(f.properties.DisasterName).replace(/<br>/g, " ").slice(0, 30)}`);
  console.log("");
  await sleep(3000);
}
