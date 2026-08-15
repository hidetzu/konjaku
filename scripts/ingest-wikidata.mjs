// Wikidata から「年が分かっているもの」を取り込む。
//
// ⚠ 実行時に叩くのをやめるための取り込み。画面から見ると、
//   止まりうる依存（掟: 外部APIは「止まりうる依存」として扱う）が1つ減り、待ち時間も消える。
//
// ⚠ 入れないもの:
//   - 日本語ラベルが無いもの（Q番号を画面に出しても読めない）
//   - 団体・企業・行政区画・出来事（設立年は「その場所にできた年」ではない。
//     実測では「1947 日本鉄道技術協会」の座標が現在の所在地を指した）
//   - 「(看板)」のような、写真では確かめようのないもの
//
// 実行: node scripts/ingest-wikidata.mjs [areaId ...]
import { readFileSync } from "node:fs";
import { open, tileOf, tileBounds, toDrop } from "./db.mjs";

const EP = "https://query.wikidata.org/sparql";
const UA = "konjaku/0.1 (https://konjaku.hidetzu.work; ingest, run by hand)";

// 型は列挙する。団体等を除外する式では、学校や駅が「組織」の下位クラスに入り落ちる。
const KINDS = {
  Q41176: "building", Q811979: "structure", Q719456: "station", Q3947: "house",
  Q3918: "school", Q3914: "school", Q16917: "hospital", Q12280: "bridge",
  Q22698: "park", Q34442: "road", Q728937: "railway", Q44782: "port", Q1248784: "airport",
};

const query = (b) => `
SELECT ?item ?itemLabel ?desc ?date ?dateP ?until ?coord ?kind WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${b.w} ${b.s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${b.e} ${b.n})"^^geo:wktLiteral .
  }
  OPTIONAL { ?item p:P1619/psv:P1619 [ wikibase:timeValue ?o ; wikibase:timePrecision ?op ] }
  OPTIONAL { ?item p:P571 /psv:P571  [ wikibase:timeValue ?b2; wikibase:timePrecision ?bp ] }
  OPTIONAL { ?item p:P580 /psv:P580  [ wikibase:timeValue ?s2; wikibase:timePrecision ?sp ] }
  BIND(COALESCE(?o, ?b2, ?s2) AS ?date)
  BIND(COALESCE(?op, ?bp, ?sp) AS ?dateP)
  FILTER(BOUND(?date))
  OPTIONAL { ?item wdt:P576 ?gone }
  OPTIONAL { ?item wdt:P582 ?ended }
  BIND(COALESCE(?gone, ?ended) AS ?until)
  ?item wdt:P31/wdt:P279* ?kind .
  VALUES ?kind { ${Object.keys(KINDS).map((q) => "wd:" + q).join(" ")} }
  # ⚠ 日本語の一行説明。**英語に落とさない**。
  #   実測（2026-08-15）: 60代の利用者は英語の説明を見た瞬間に「これは私の読むページではない」
  #   と言って降りた。読めないものを出すくらいなら、出さないほうがよい。
  #   配布データの 94.0%（2,225 / 2,367）に日本語の説明がある。
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "ja") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
}
LIMIT ${LIMIT}`;

// ⚠ 取り込みは **z14 タイル境界**で回す。
//   中心から N km の矩形で回していたため、「見た範囲」とタイルがずれ、
//   1件でも落ちたタイルが「全面を調べた」として索引に載っていた。
function tilesAround(lon, lat, km) {
  const dLat = km / 111.32, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  const a = tileOf(lon - dLon, lat + dLat, 14), b = tileOf(lon + dLon, lat - dLat, 14);
  const out = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ x, y });
  return out;
}
const LIMIT = 800;
const year = (v) => { const t = (v ?? "").slice(0, 5).replace(/-$/, ""); 
  const m = /^(-?\d{1,4})/.exec(t); return m ? Number(m[1]) : null; };
// ⚠ 精度をそのまま持つ。9 = 年 / 8 = 10年 / 7 = 100年
const prec = (p) => (Number(p) >= 9 ? "year" : Number(p) === 8 ? "decade" : "century");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(b) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${EP}?query=${encodeURIComponent(query(b))}`,
        { headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
          signal: AbortSignal.timeout(90000) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) return { err: `HTTP ${r.status}` };
      return { rows: (await r.json()).results.bindings };
    } catch (e) { if (i === 2) return { err: e.name }; await sleep(4000); }
  }
  return { err: "retry尽き" };
}

const areas = readFileSync("seeds/areas.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const argv = process.argv.slice(2);
// ⚠ 再開できるようにする。全国は z14 が約10万枚で、sleep だけで33時間かかる。
//   途中で落ちたら先頭からやり直し、では終わらない。
//   既に見たタイルは飛ばす（--force で取り直す）。
const force = argv.includes("--force");
const want = argv.filter((a) => !a.startsWith("--"));
const db = open();
const at = new Date().toISOString().slice(0, 10);
// 「何を訊いたか」。型の一覧や上限を変えたら、前に見た結果は
// 「新しい問いについては見ていない」ので、取り直しの対象になる
// ⚠ 訊く項目を増やしたら SPEC も変える。変えないと「前に見た」で飛ばされ、
//   増やした項目が空のまま配られる（説明を足したときに一度ここで詰まりかけた）
const SPEC = `wikidata:kinds=${Object.keys(KINDS).sort().join(",")};limit=${LIMIT};desc=ja`;
const done = new Map(db.prepare(
  "SELECT z14x, z14y, spec FROM coverage WHERE layer='ev'").all()
  .map((r) => [`${r.z14x}/${r.z14y}`, r.spec]));
let skipped = 0;

// ⚠ note には Wikidata の日本語の一行説明を、**取れたまま**入れる。
//   短くするのも、地名の前置きを落とすのも、描くときにブラウザでやる。
//   ここで加工すると、取り込み済みの土地と実行時に問い合わせる土地で
//   答えが変わる（掟: 同じ問いに答える実装を2つ持たない）。
//   note_url は使わない（説明そのものの出典は source_url と同じ項目ページ）。
const up = db.prepare(`INSERT INTO feature
  (id,source,source_url,retrieved_at,label,kind,lon,lat,year_from,year_to,precision,note,z14x,z14y)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    retrieved_at=excluded.retrieved_at, label=excluded.label, kind=excluded.kind,
    lon=excluded.lon, lat=excluded.lat, year_from=excluded.year_from,
    year_to=excluded.year_to, precision=excluded.precision, note=excluded.note,
    z14x=excluded.z14x, z14y=excluded.z14y, dropped_at=NULL`);
const logIngest = db.prepare(
  "INSERT INTO ingest (at,source,area,n_ok,n_skip,note) VALUES (?,?,?,?,?,?)");

const cov = db.prepare(`INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated,spec)
  VALUES (?,?,'ev','wikidata',?,?,?,?)
  ON CONFLICT(z14x,z14y,layer) DO UPDATE SET
    source='wikidata', at=excluded.at, n=excluded.n,
    truncated=excluded.truncated, spec=excluded.spec`);
const seenTile = new Set();

for (const a of areas) {
  if (want.length && !want.includes(a.id)) continue;
  const tiles = tilesAround(a.ll[0], a.ll[1], a.km);
  let aOk = 0, aSkip = 0, aTrunc = 0;
  for (const t of tiles) {
    const key = `${t.x}/${t.y}`;
    if (seenTile.has(key)) continue;              // 隣の area と重なった分は一度でよい
    seenTile.add(key);
    // ⚠ 「何を訊いたか」が変わっていたら、前に見たことにはならない
    if (!force) {
      const prev = done.get(key);
      if (prev && prev === SPEC) { skipped++; continue; }
    }
    const b = tileBounds(t.x, t.y, 14);
    const res = await ask({ w: b.w.toFixed(5), e: b.e.toFixed(5),
                            s: b.s.toFixed(5), n: b.n.toFixed(5) });
    if (res.err) {
      // ⚠ 取れなかったタイルは coverage に書かない。「見た」ことにしない
      console.log(`    ${key} 取れませんでした（${res.err}）`);
      await sleep(2000);
      continue;
    }
    // ⚠ 上限に当たったら、取りこぼしがあるかもしれないと記録する。
    //   黙って「調べ終えた」にすると、密な土地ほど断定的に取りこぼす
    const truncated = res.rows.length >= LIMIT ? 1 : 0;
    if (truncated) aTrunc++;
    const seen = new Map();
    for (const row of res.rows) {
      const id = "wd:" + row.item.value.split("/").pop();
      const label = row.itemLabel?.value ?? "";
      if (/^Q\d+$/.test(label) || /[（(](看板|レプリカ)[）)]/.test(label)) { aSkip++; continue; }
      const yf = year(row.date?.value);
      if (yf == null) { aSkip++; continue; }
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? "");
      if (!m) { aSkip++; continue; }
      const kind = KINDS[row.kind?.value.split("/").pop()] ?? "structure";
      const cur = seen.get(id);
      if (!cur || (cur.yf ?? 9999) > yf)
        seen.set(id, { id, label, kind, lon: +m[1], lat: +m[2], yf,
          yt: year(row.until?.value), p: prec(row.dateP?.value),
          desc: row.desc?.value || null });
    }
    // ⚠ 上流から消えたものに印を付ける。**今回の変更で初めてできるようになった**
    //   （タイル全面を見ているので「このタイルで今回返ってこなかった wd:」が差分として出せる。
    //   中心から N km の矩形で回していた頃は、見ていない範囲と区別がつかなかった）。
    //   行は消さない。消えたという事実が残る。
    //   alive は「タイル外に落ちた分も含めた、今回返ってきた全部」にする。
    //   座標が動いて隣タイルへ移っただけのものを、消えたことにしないため
    //   （隣タイルを処理したときに z14x/z14y ごと上書きされる）。
    const wasHere = db.prepare(
      "SELECT id FROM feature WHERE z14x=? AND z14y=? AND source='wikidata' AND dropped_at IS NULL")
      .all(t.x, t.y).map((r) => r.id);
    const gone = toDrop(wasHere, new Set(seen.keys()), truncated);
    for (const id of gone) db.prepare("UPDATE feature SET dropped_at=? WHERE id=?").run(at, id);
    if (gone.length) console.log(`    ${key} 上流から消えた ${gone.length} 件に印を付けた`);
    else if (truncated && wasHere.length)
      console.log(`    ${key} 上限に当たったので、消えたかどうかは判断しない`);
    let n = 0;
    for (const f of seen.values()) {
      const ft = tileOf(f.lon, f.lat, 14);
      // タイルの外に落ちたものは、そのタイルの結果として数えない
      if (ft.x !== t.x || ft.y !== t.y) continue;
      up.run(f.id, "wikidata", `https://www.wikidata.org/wiki/${f.id.slice(3)}`, at,
        f.label, f.kind, f.lon, f.lat, f.yf, f.yt, f.p, f.desc, ft.x, ft.y);
      n++;
    }
    cov.run(t.x, t.y, at, n, truncated, SPEC);         // ⚠ 0件でも書く
    aOk += n;
    await sleep(1200);
  }
  logIngest.run(at, "wikidata", a.id, aOk, aSkip, aTrunc ? `${aTrunc}タイルで上限に到達` : null);
  console.log(`  ${a.title.padEnd(10)} ${String(aOk).padStart(4)} 件 / ${tiles.length} タイル`
    + (aTrunc ? `  ⚠ ${aTrunc} タイルで上限` : ""));
}
const live = db.prepare("SELECT COUNT(*) c FROM feature WHERE dropped_at IS NULL").get().c;
const dead = db.prepare("SELECT COUNT(*) c FROM feature WHERE dropped_at IS NOT NULL").get().c;
console.log(`\n合計 ${live} 件（上流から消えた ${dead} 件は印を付けて残してある）`
  + (skipped ? `／既に見たタイル ${skipped} 枚は飛ばした（取り直すなら --force）` : ""));
