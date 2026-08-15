// 豊洲周辺の建物を Overpass から取得し、GeoJSON に固めて保存する。
//
// 実行時に Overpass を叩かないための事前取得スクリプト。
// Overpass の公開インスタンスは本番の成立条件に置けない
// （実際 overpass-api.de はタイムアウトした）。取得は1回きりにして結果を commit する。
//
// 実行: node fetch-buildings.js

import { writeFile } from "node:fs/promises";

// 豊洲。PLATEAU の LOD2 整備地区でもある（§3.10）
//
// ★ 別の地点を足すとき: NAME と BBOX を書き換えて実行し、
//    出来た GeoJSON を public/data/areas.json に1件足す（peel.html が索引で引く）。
const NAME = "toyosu";
const BBOX = { s: 35.6480, w: 139.7880, n: 35.6620, e: 139.8060 };
// 配信するのは public/ だけなので、そこへ直接書く（スクリプトからの相対＝cwd に依存しない）
const OUT = new URL(`public/data/${NAME}-buildings.geojson`, import.meta.url);

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const QUERY = `[out:json][timeout:60];
way["building"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
out geom tags;`;

// 公開インスタンスは混雑・レート制限が常態。UA を名乗り、待って、順に試す。
// 429 を踏むのは想定内なので、諦めずに間を空けて回す。
const UA = "koto-konjaku/0.1 (personal research prototype)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass() {
  for (let round = 1; round <= 3; round++) {
    for (const ep of ENDPOINTS) {
      process.stdout.write(`  [${round}] ${ep} … `);
      try {
        const r = await fetch(ep, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": UA,
            accept: "application/json",
          },
          body: new URLSearchParams({ data: QUERY }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!r.ok) { console.log(`HTTP ${r.status}`); continue; }
        const t = await r.text();
        if (!t.trimStart().startsWith("{")) { console.log("JSONでない応答（混雑）"); continue; }
        console.log("OK");
        return JSON.parse(t);
      } catch (e) {
        console.log(`失敗 (${e.name})`);
      }
    }
    if (round < 3) {
      const wait = round * 30;
      console.log(`  … ${wait}秒待って再試行`);
      await sleep(wait * 1000);
    }
  }
  throw new Error("すべてのエンドポイントが失敗した。時間を空けて再実行する。");
}

// 高さの決め方。順に試して、最後は種別ごとの既定値に落とす。
// ★ 既定値は推定であって実測ではない。この区別を GeoJSON に残す（levelSource）。
const DEFAULT_H = {
  apartments: 30, residential: 12, house: 7, detached: 7,
  office: 40, commercial: 20, retail: 12, industrial: 12,
  warehouse: 14, school: 15, hospital: 25, roof: 4, garage: 3, hut: 3,
};

function heightOf(tags) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return { h, src: "height" };
  const lv = parseFloat(tags["building:levels"]);
  if (Number.isFinite(lv) && lv > 0) return { h: lv * 3.2, src: "levels" };
  return { h: DEFAULT_H[tags.building] ?? 10, src: "default" };
}

console.log("Overpass に問い合わせ中…");
const raw = await fetchOverpass();

const features = [];
for (const el of raw.elements) {
  if (!el.geometry || el.geometry.length < 4) continue;
  const ring = el.geometry.map((p) => [p.lon, p.lat]);
  // 閉じていなければ閉じる
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);

  const t = el.tags ?? {};
  const { h, src } = heightOf(t);
  features.push({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {
      id: el.id,
      height: Math.round(h * 10) / 10,
      heightSource: src,               // height | levels | default（default は推定）
      kind: t.building ?? "yes",
      name: t.name ?? null,
      // 建物の建設年。これがある建物だけは「いつからあったか」を断定できる。
      startDate: t["start_date"] ?? null,
    },
  });
}

const geojson = {
  type: "FeatureCollection",
  // 取得条件を残す。あとで「どの範囲を見たのか」を再現できるようにするため。
  metadata: { bbox: BBOX, source: "OpenStreetMap contributors (ODbL)", count: features.length },
  features,
};

await writeFile(OUT, JSON.stringify(geojson));

const by = (k) => features.filter((f) => f.properties.heightSource === k).length;
const dated = features.filter((f) => f.properties.startDate).length;
console.log(`\n建物 ${features.length} 件を public/data/${NAME}-buildings.geojson に保存`);
console.log(`  高さ実測 (height)      : ${by("height")}`);
console.log(`  階数から換算 (levels)  : ${by("levels")}`);
console.log(`  種別ごとの既定値（推定）: ${by("default")}`);
console.log(`  建設年 (start_date) あり: ${dated}  ← これだけが「いつからあるか」を断定できる`);
