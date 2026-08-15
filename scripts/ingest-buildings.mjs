// 建物を、z14 タイル境界で取り込む。
//
// ⚠ ev（年つきの事物）と同じ束には載せない。
//   実測: 豊洲は 545件 / 2.54km² = 215件/km²、376 B/件。
//   z12 の1束（約51km²）に入れると **約11,000件 / 3.9MB**。
//   600m×450m の枠1つに 3.9MB を引かせることになる。
//   → 建物は **z14 の1タイル1ファイル**。全国はやらないのでファイル数の壁に当たらない。
//
// ⚠ coverage は共有するが、layer='bld' で分ける。
//   潰すと「建物が見たタイル」が「事物も見た」ことになり、
//   一度も訊いていない地面について断定する（実験で再現済み）。
//
// ⚠ 途中から再開できる。Overpass は落ちる（実測で 406 / 429 / タイムアウト）ので、
//   1枚のために全部を取り直すのは相手にも自分にも損。
//   既に見たタイルは飛ばす（--force で取り直す）。
//   「見た」の判定には spec（何を訊いたか）を使う。訊き方を変えたら前の結果は
//   *新しい問いについては見ていない* ので、取り直しの対象になる。
//
// 実行: node scripts/ingest-buildings.mjs [--force] [areaId ...]
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { open, tileOf, tileBounds } from "./db.mjs";
import { pack } from "./bl-format.mjs";

const OUT = "public/data/bl";
const OVERPASS = ["https://overpass-api.de/api/interpreter",
                  "https://overpass.kumi.systems/api/interpreter"];
const LIMIT = 20000;                       // 1タイルの上限。超えたら truncated
// 種別ごとの既定の高さ。⚠ これは**推定**で、実測ではない（豊洲では8割がこれ）
const DEFAULT_H = { apartments:30, residential:12, house:7, detached:7, office:40,
  commercial:20, retail:12, industrial:12, warehouse:14, school:15, hospital:25,
  roof:4, garage:3, hut:3 };
// ⚠ 種別に無いときの既定は **10**。fetch-buildings.js / peel.html と揃える。
//   揃えないと、同じ建物がどの経路で届いたかで 8m か 10m か変わる（UI/UX レビューの指摘）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(b) {
  const q = `[out:json][timeout:60];way["building"](${b.s},${b.w},${b.n},${b.e});out geom tags;`;
  for (let round = 0; round < 2; round++) {
    for (const ep of OVERPASS) {
      try {
        const r = await fetch(ep, { method: "POST", body: new URLSearchParams({ data: q }),
          headers: { "User-Agent": "konjaku/0.1 (ingest, run by hand)" },
          signal: AbortSignal.timeout(120000) });
        if (!r.ok) { await sleep(3000); continue; }
        const t = await r.text();
        if (!t.trimStart().startsWith("{")) { await sleep(3000); continue; }
        return { els: JSON.parse(t).elements };
      } catch (e) { await sleep(4000); }
    }
  }
  return { err: "取れなかった" };
}

// ⚠ 高さの出所を必ず残す。8割が推定なので、実測と混ぜると 3D そのものが嘘になる
function heightOf(tags) {
  const h = parseFloat(tags["height"]);
  if (Number.isFinite(h)) return { h, src: "measured" };
  const l = parseFloat(tags["building:levels"]);
  if (Number.isFinite(l)) return { h: l * 3.2, src: "levels" };
  return { h: DEFAULT_H[tags["building"]] ?? 10, src: "default" };
}

const areas = readFileSync("seeds/areas.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const argv = process.argv.slice(2);
const force = argv.includes("--force");
const want = argv.filter((a) => !a.startsWith("--"));
const db = open();
const at = new Date().toISOString().slice(0, 10);
const spec = `overpass:way[building];h=${Object.keys(DEFAULT_H).length};limit=${LIMIT}`;
const done = new Map(db.prepare(
  "SELECT z14x, z14y, spec FROM coverage WHERE layer='bld'").all()
  .map((r) => [`${r.z14x}/${r.z14y}`, r.spec]));
let skipped = 0;
const cov = db.prepare(`INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated,spec)
  VALUES (?,?,'bld','osm',?,?,?,?)
  ON CONFLICT(z14x,z14y,layer) DO UPDATE SET
    source='osm', at=excluded.at, n=excluded.n,
    truncated=excluded.truncated, spec=excluded.spec`);

function tilesAround(lon, lat, km) {
  const dLat = km / 111.32, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  const a = tileOf(lon - dLon, lat + dLat, 14), b = tileOf(lon + dLon, lat - dLat, 14);
  const out = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ x, y });
  return out;
}

const seen = new Set();
for (const a of areas) {
  if (want.length && !want.includes(a.id)) continue;
  const tiles = tilesAround(a.ll[0], a.ll[1], a.km);
  let n = 0, files = 0;
  for (const t of tiles) {
    const key = `${t.x}/${t.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // ⚠ 本体のファイルも見る。coverage にはあるのにファイルが無い状態
    //   （書き出し先を消した・別の枝から来た）で飛ばすと、索引に載らないまま欠ける
    if (!force && done.get(key) === spec && existsSync(`${OUT}/14/${t.x}/${t.y}.json`)) {
      skipped++; continue;
    }
    const b = tileBounds(t.x, t.y, 14);
    const res = await ask(b);
    if (res.err) {
      // ⚠ 取れなかったタイルは coverage に書かない。「見た」ことにしない
      console.log(`    ${key} 取れませんでした`);
      await sleep(3000);
      continue;
    }
    const feats = [];
    for (const el of res.els) {
      if (!el.geometry || el.geometry.length < 4) continue;
      // ⚠ 6桁（約0.1m）は建物の輪郭には過剰。5桁（約1m）で足りる。
      //   実測: いちばん重いタイルで gz 218KB → 174KB
      const ring = el.geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]);
      const [f0, l0] = [ring[0], ring[ring.length - 1]];
      if (f0[0] !== l0[0] || f0[1] !== l0[1]) ring.push(f0);
      // ⚠ タイルの外に出た建物は、そのタイルの結果にしない（重心で決める）
      const c = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / ring.length);
      const ct = tileOf(c[0], c[1], 14);
      if (ct.x !== t.x || ct.y !== t.y) continue;
      const tags = el.tags ?? {};
      const { h, src } = heightOf(tags);
      feats.push({ type: "Feature",
        properties: { id: el.id, height: h, heightSource: src,
          kind: tags["building"] ?? "yes", name: tags["name"] ?? null,
          startDate: tags["start_date"] ?? null },
        geometry: { type: "Polygon", coordinates: [ring] } });
    }
    const truncated = res.els.length >= LIMIT ? 1 : 0;
    mkdirSync(`${OUT}/14/${t.x}`, { recursive: true });
    // ⚠ 詰めてから書く。GeoJSON のまま配ると、濃い土地で z14 タイル1枚が 5.25MB になり、
    //   /peel は1画面で4枚読むので gz 1.9MB を引かせることになる（実測 2026-08-14）。
    //   詰め方は bl-format.mjs が唯一の定義。ここで別に組み立ててはいけない
    writeFileSync(`${OUT}/14/${t.x}/${t.y}.json`,
      JSON.stringify(pack(feats, [14, t.x, t.y], at, truncated ? { truncated: 1 } : {})));
    cov.run(t.x, t.y, at, feats.length, truncated, spec);
    n += feats.length; files++;
    console.log(`    ${key} ${String(feats.length).padStart(5)} 件`);
    await sleep(2500);                     // Overpass に負荷をかけない
  }
  console.log(`  ${a.title.padEnd(10)} ${String(n).padStart(6)} 件 / ${files} タイル`);
}
const c = db.prepare("SELECT SUM(n) s, COUNT(*) t FROM coverage WHERE layer='bld'").get();
console.log(`\n合計 ${c.s ?? 0} 件 / ${c.t} タイル`
  + (skipped ? `／既に見たタイル ${skipped} 枚は飛ばした（取り直すなら --force）` : ""));
