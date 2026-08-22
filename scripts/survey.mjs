// 取り込む街を、勘ではなく実測で選ぶ。
//
// 「面白そう」を人が決めると、決めた本人にしか面白くない。
// 候補地について次の3つを測り、並べて出す。
//
//   1. 判定    … 明治期はいまと違う土地だったと言えるか（本物の画面に通して読む）
//   2. 年代    … 空中写真が何枚残っているか＝時間を何回動かせるか（同上）
//   3. 動く段数 … 年代を送ったとき、一覧が何段で入れ替わるか（Wikidata の年から出す）
//
// ⚠ 3つを1つの点数にまとめない。重みに根拠が無いから。
//   数字は並べて出し、選ぶ理由は人の言葉で書く。
//
// ⚠ 3 を画面から測るのはやめた。取り込み前の土地は Wikidata へ生で出るので、
//   同じ実行の中で候補の数だけ叩くことになり、**こちらの都合で相手に断られる**
//   （実測: 西新宿・汐留は net::ERR_ABORTED で「読み込めませんでした」。
//   ゼロ件ではなく、訊けていない）。ここで 0 件と記録すると、
//   「取れなかった」を「無い」と読むことになる。それはこの製品が一番やってはいけないこと。
//   → 3 は間隔をあけて自分で1回ずつ問い合わせ、年の分布から計算する。
//
// ⚠ ここで数える件数は「年の分かるもの」で、取り込みの種別しぼり込みの**前**。
//   画面に出る件数とは一致しない。土地どうしの濃さを比べるための数。
//
// ⚠ 途中から再開できる。候補25件で10分近くかかり、Wikidata に断られた1件のために
//   全部を測り直すのは、相手にも自分にも損。測れた分は .artifacts/survey.json に残し、
//   次に走らせたときは**測れなかったものだけ**を測る（--force で全部測り直す）。
//
// 実行: node scripts/survey.mjs [--force] [id ...]

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tileOf, tileBounds } from "./db.mjs";

const PORT = 8098;
const BASE = `http://127.0.0.1:${PORT}`;
const UA = "konjaku-survey/1.0 (https://konjaku.hidetzu.work)";

// 帯の区切り。verify.js の ERAS の先頭の年と、右端の「いま」
const CUTS = [1936, 1945, 1961, 1974, 1979, 1984, 1987, 9999];

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const want = argv.filter((a) => !a.startsWith("--"));
const all = readFileSync("seeds/candidates.jsonl", "utf8").trim()
  .split("\n").map((l) => JSON.parse(l));
const asked = want.length ? all.filter((c) => want.includes(c.id)) : all;
mkdirSync(".artifacts", { recursive: true });

// 前回の結果。⚠ 「取れなかった」ものは、済みに数えない
const OUT = ".artifacts/survey.json";
const before = new Map((force || !existsSync(OUT) ? []
  : JSON.parse(readFileSync(OUT, "utf8"))).map((r) => [r.id, r]));
const done = (r) => r && !r.err && r.items >= 0 && r.eras > 0;
const cands = asked.filter((c) => !done(before.get(c.id)));
if (cands.length < asked.length)
  console.log(`  測り済み ${asked.length - cands.length} 件は飛ばします（測り直すなら --force）`);
if (!cands.length) console.log("  測るものがありません");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1・2 本物の画面から ----
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
});
process.on("exit", () => server.kill());
await sleep(1200);

// ⚠ Service Worker を止める。測っているのは土地であって、キャッシュではない。
const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block" });
// ⚠ 画面の側からは Wikidata へ出させない。ここで測るのは判定と写真だけで、
//   事物は下で自分が間隔をあけて訊く。二重に叩かない
await ctx.route("**://query.wikidata.org/**", (r) => r.abort());

const rows = [];
for (const c of cands) {
  const r = { ...c, verdict: "", eras: 0, items: 0, moves: 0, err: "" };
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/?ll=${c.ll[1].toFixed(5)},${c.ll[0].toFixed(5)}`
      + `&q=${encodeURIComponent(c.title)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const t = document.getElementById("verdict")?.textContent ?? "";
      return t.length > 0 && !t.includes("判定中");
    }, null, { timeout: 45000 });
    r.verdict = (await page.$eval(".v-head", (e) => e.textContent).catch(() => ""))
      .replace(/\s+/g, " ").replace(/[↗?]/g, "").trim();
    // 明治期と現在は空中写真ではないので、年代の数から外す
    r.eras = await page.$$eval("#strip .f", (els) => els.filter((e) =>
      !e.classList.contains("now") && !e.classList.contains("meiji")).length);
  } catch (e) { r.err = e.message.split("\n")[0].slice(0, 40); }
  await page.close();
  rows.push(r);
}
await browser.close();
server.kill();

// ---- 3 年の分布を、間隔をあけて自分で訊く ----
const q = (b) => `
SELECT ?item ?y WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?c.
    bd:serviceParam wikibase:cornerWest "Point(${b.w} ${b.s})"^^geo:wktLiteral;
                    wikibase:cornerEast "Point(${b.e} ${b.n})"^^geo:wktLiteral. }
  { ?item wdt:P571 ?y } UNION { ?item wdt:P1619 ?y } UNION { ?item wdt:P580 ?y }
} LIMIT 800`;

for (const r of rows) {
  const t = tileOf(r.ll[0], r.ll[1], 14);
  const b = tileBounds(t.x, t.y, 14);
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(
    q({ w: b.w.toFixed(5), e: b.e.toFixed(5), s: b.s.toFixed(5), n: b.n.toFixed(5) }));
  let years = null;
  for (let tryN = 0; tryN < 3 && years == null; tryN++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      years = j.results.bindings.map((x) => +String(x.y.value).slice(0, 5).replace(/-$/, ""))
        .filter((y) => Number.isFinite(y));
    } catch (e) { r.err = `Wikidata: ${e.message.slice(0, 24)}`; await sleep(4000); }
  }
  if (years == null) { r.items = -1; r.moves = -1; continue; }  // ⚠ 0 と混ぜない
  r.err = "";
  r.items = years.length;
  // 帯を1段ずつ送ったとき、その段で新しく出るものが1つでもあるか
  let prev = -Infinity;
  for (const cut of CUTS) {
    if (years.some((y) => y > prev && y <= cut)) r.moves++;
    prev = cut;
  }
  await sleep(1500);
  writeFileSync(OUT, JSON.stringify([...before.values(), ...rows]
    .sort((a, b) => all.findIndex((c) => c.id === a.id) - all.findIndex((c) => c.id === b.id)),
    null, 1));
}

// ⚠ 表を出す前に書く。ここで落ちても、測れた分は次に活きる
const merged = [...before.values(), ...rows];
const order = new Map(all.map((c, i) => [c.id, i]));
merged.sort((a, b) => order.get(a.id) - order.get(b.id));
writeFileSync(OUT, JSON.stringify(merged, null, 1));

const num = (v, w) => (v < 0 ? "  ?" : String(v).padStart(w));
const shown = merged.filter((r) => asked.some((c) => c.id === r.id));
for (const region of [...new Set(shown.map((x) => x.region))]) {
  console.log(`\n  ${region}`);
  for (const r of shown.filter((x) => x.region === region)
    .sort((a, b) => b.moves - a.moves || b.items - a.items))
    console.log(`    ${r.moves >= 4 ? "○" : r.moves >= 2 ? "△" : "・"} ${r.title.padEnd(9)}`
      + ` 動く ${num(r.moves, 2)} 段 / 写真 ${String(r.eras).padStart(2)} 年代`
      + ` / 年のあるもの ${num(r.items, 3)} 件 / ${r.verdict}${r.err ? `  ⚠ ${r.err}` : ""}`);
}
console.log("\n⚠ 「?」は取れなかった。0 件ではない。\n.artifacts/survey.json に書きました");
