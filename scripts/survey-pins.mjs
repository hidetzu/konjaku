// 今昔 — ⚠ **「深掘り地点」の条件で、⚠ 何件になるかを数える**（`docs/adr/0052`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（Overpass・地理院）の答えに寄りかかるものを、⚠ 検査にしない**
//     （`CLAUDE.md` §9。⚠ **こちらの正しさだけを主張する**）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**（⚠ **まとめて回すと途中で落ちる。**⚠ **分けて回す**）:
//
//     node scripts/survey-pins.mjs 0 7
//     node scripts/survey-pins.mjs 7 13
//
// ⚠ **踏んだこと（2026-08-29）**: ⚠ **404 を「0 件」として数えていた。**
//   ⚠ **伝承碑は `maxNativeZoom: 7`** で、⚠ z13〜16 は 404 を返す。
//   ⚠ **`if (!r.ok) continue;` にしていたので、⚠ 全部 0 件に見えた。**
//   ⚠ **取れなかったことと、⚠ 無いことを分ける**（掟 §1）。⚠ **いまは「聞けず」と書く。**
//
// ⚠ **Overpass は断ってくる**（⚠ 429 / 504）。⚠ **断られたら「聞けず」。**⚠ **0 と混ぜない。**

import { setTimeout as sleep } from "node:timers/promises";

const 場所 = [
  ["都心・渋谷",     35.6580, 139.7016], ["都心・梅田",   34.7024, 135.4959],
  ["埋立・浦安",     35.6536, 139.9021], ["郊外・所沢",   35.7990, 139.4690],
  ["郊外・春日部",   35.9756, 139.7522],
  ["地方・高知",     33.5597, 133.5311], ["地方・松江",   35.4681, 133.0486],
  ["地方・弘前",     40.6031, 140.4640], ["地方・佐賀",   33.2494, 130.2988],
  ["城下町・松本",   36.2381, 137.9720], ["宿場・関宿",   34.8556, 136.3960],
  ["農村・美瑛",     43.5883, 142.4700], ["漁村・鞆の浦", 34.3830, 133.3820],
];
const 半径 = [300, 500, 1000];
// ⚠ **分けて回せるようにする**（⚠ まとめて回すと途中で落ちる）
const FROM = Number(process.argv[2] ?? 0), TO = Number(process.argv[3] ?? 99);
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
  || (/\d{3,4}/.test(t.description ?? "") ? t.description : null);

const EPS = ["https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"];
const osm = async (lat, lon) => {
  const q = `[out:json][timeout:120];
(nwr(around:1000,${lat},${lon})[historic];nwr(around:1000,${lat},${lon})[ruins];
 nwr(around:1000,${lat},${lon})["abandoned:railway"];nwr(around:1000,${lat},${lon})["disused:railway"];
 nwr(around:1000,${lat},${lon})["demolished:building"];nwr(around:1000,${lat},${lon})[razed];);out tags center 600;`;
  for (let round = 0; round < 3; round++) {
    for (const ep of EPS) {
      try {
        const res = await fetch(ep, { method: "POST", body: q,
          headers: { "user-agent": "konjaku-survey/1.0 (one-off measurement)" },
          signal: AbortSignal.timeout(150000) });
        if (res.status === 429 || res.status === 504) { await sleep(20000); continue; }
        if (!res.ok) { await sleep(8000); continue; }
        return { ok: true, els: (await res.json()).elements ?? [] };
      } catch { await sleep(10000); }
    }
    await sleep(30000);
  }
  return { ok: false, els: [] };
};
const LZ = 7;
const lore = async (lat, lon) => {
  try {
    const r = await fetch(`https://maps.gsi.go.jp/xyz/disaster_lore_all/${LZ}/${x_(lon, LZ)}/${y_(lat, LZ)}.geojson`,
      { signal: AbortSignal.timeout(45000) });
    if (!r.ok) return { ok: false, fs: [] };
    return { ok: true, fs: (await r.json()).features ?? [] };
  } catch { return { ok: false, fs: [] }; }
};

const 行 = [];
console.log("⚠ 実測 2026-08-29 ／ `docs/adr/0052` の候補定義\n");
console.log("場所            300m        500m       1000m      伝承碑 1/2/5km");
console.log("                （全部→条件3→＋条件4）");
for (const [name, lat, lon] of 場所.slice(FROM, TO)) {
  const o = await osm(lat, lon);
  const l = await lore(lat, lon);
  const cell = (r) => {
    if (!o.ok) return "  聞けず  ";
    const near = o.els.filter((e) => { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
      return la != null && dist(lon, lat, lo, la) <= r; });
    const A = near.filter((e) => (e.tags?.name) && 昔の印(e.tags ?? {}));
    const B = A.filter((e) => 年(e.tags ?? {}));
    return `${String(near.length).padStart(3)}→${String(A.length).padStart(2)}→${String(B.length).padStart(2)}`;
  };
  const lc = (r) => !l.ok ? "?" : String(l.fs.filter((f) => { const c = f.geometry?.coordinates;
    return c && dist(lon, lat, c[0], c[1]) <= r; }).length);
  const line = `${name.padEnd(14)} ${cell(300)}  ${cell(500)}  ${cell(1000)}   ${lc(1000)}/${lc(2000)}/${lc(5000)}`;
  console.log(line); 行.push(line);
  if (o.ok) for (const e of o.els.filter((x) => x.tags?.name && 昔の印(x.tags)).slice(0, 2))
    console.log(`                 ${e.tags.name}（${e.tags.historic ?? "-"}）${年(e.tags) ? " 年あり" : ""}`);
  await sleep(6000);
}
// ⚠ 出力は標準出力だけ（⚠ ファイルに書き残さない。⚠ tmp/ は追跡されない）
console.log("\n⚠ 終わり");
