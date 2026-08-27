// 1人が来ると、どこへ何回出るのかを数える。
//
// 1回の検索で Worker / R2 と外部サービスへ何 request 飛ぶかを数える。
// 読んで正しく見える設計と、実際に飛ぶ回数は別なのでブラウザで測る。
//
// ⚠ 本番には当てない。/t は D1 に書き込むので、こちらの試験のイベントが
//   本物の共有率に混ざる。**測るために指標を汚したら、測った意味が無い。**
//   → 手元のサーバに当てる。/t は 404 になるが、**出た回数は数えられる**。
//   国土地理院・Wikidata・Overpass へは本物に出る（読むだけ）。
//
// 実行: node scripts/cost.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 8095;
const BASE = `http://127.0.0.1:${PORT}`;

// 無料枠（Cloudflare、2026-08 時点の公表値）
const FREE = { worker: 100000, d1write: 100000 };   // /日

const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
});
process.on("exit", () => server.kill());
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch();

// 棚に入れる地理院タイルのホスト。
// ⚠ **持たない。public/sw.js から読む。**
//   ここは「どのホストのタイルを棚に入れるか」という、sw.js と同じ問いに答える場所。
//   写すと、片方だけ足したときに**棚に入れるものと数えるものがずれる**
//   （実際にずれていた。判定文の根拠を sw.js は棚に入れず、ここは「その他外部」に
//   数えていた）。掟「同じ問いに答える実装を2つ持たない」。
//   ⚠ SW はブラウザで動くので import で共有できない。**こちらは Node なので読める。**
//   だから写すのではなく、**唯一の定義（sw.js）を読む**。
const TILE_HOSTS = await (async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  // ⚠ コメントを落としてから読む。落とさないと、この決まりを説明したコメントを拾う。
  //   ⚠ `//` を素朴に落とすと URL を食う（`https://…`）。直前が `:` なら落とさない。
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const m = /TILE_HOSTS\s*=\s*\[([^\]]*)\]/.exec(bare);
  if (!m) throw new Error("public/sw.js から TILE_HOSTS を読めない（棚の対象が分からないまま数えない）");
  const hosts = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  if (!hosts.length) throw new Error("public/sw.js の TILE_HOSTS が空（棚の対象が分からないまま数えない）");
  return hosts;
})();

// どこへ出たかを、請求の単位で分ける
function bucket(u) {
  if (u.startsWith(BASE)) {
    const p = u.slice(BASE.length).split("?")[0];
    // ⚠ /t だけが Worker を起こす。静的アセットに一致するリクエストでは起動しない
    //   （wrangler.jsonc の assets 設定。静的は無料・無制限）
    if (p === "/t") return "worker(/t)";
    return "静的(無料)";
  }
  // ⚠ 地形分類（maps.gsi.go.jp）を数えていなかったため、**判定文の根拠にかけている負荷が
  //   「その他外部」に紛れていた**。相手先への負荷の話なので、行き先で数える。
  if (TILE_HOSTS.some((h) => u.includes(h))) return "国土地理院";
  if (/query\.wikidata\.org/.test(u)) return "Wikidata";
  if (/overpass/i.test(u)) return "Overpass";
  if (/nominatim|openstreetmap/i.test(u)) return "住所検索";
  return "その他外部";
}

// 1人ぶんの筋書き。⚠ 「見ただけ」と「ひととおり触った」を分けて数える
const TRIPS = [
  { name: "来て、判定を見ただけ", async run(page) {
      await page.goto(`${BASE}/?ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2`,
        { waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      await page.waitForTimeout(2500);
    } },
  { name: "年代を動かして、一覧まで見た", async run(page) {
      await page.goto(`${BASE}/?ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2`,
        { waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      const n = await page.$$eval("#strip .f", (e) => e.length);
      for (let i = 0; i < n; i++) {
        await page.$eval(`#strip .f[data-i="${i}"]`, (e) => e.click());
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1500);
    } },
  // ⚠ **共有まで押した**（2026-08-28。hidetzu/konjaku#355）。
  //   ⚠ **押したこと（`share.tap`）と結末を数えるようにした**ので、⚠ **ここが最大になる。**
  //   ⚠ **この環境に共有の口は無い**ので、⚠ **画像の保存へ落ちる。**
  //     ⚠ **送る本数は同じ 2 件**（⚠ `share.tap` ＋ 結末 1 つ。⚠ 結末は排他）。
  { name: "共有まで押した", async run(page) {
      await page.goto(`${BASE}/?ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2`,
        { waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      const n = await page.$$eval("#strip .f", (e) => e.length);
      for (let i = 0; i < n; i++) {
        await page.$eval(`#strip .f[data-i="${i}"]`, (e) => e.click());
        await page.waitForTimeout(500);
      }
      await page.$eval("#shareBtn", (e) => e.click());
      await page.waitForTimeout(2500);
    } },
  { name: "3D まで開いた", async run(page) {
      await page.goto(`${BASE}/peel?ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2`,
        { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2000);
    } },
];

async function waitVerdict(page) {
  await page.waitForFunction(() => {
    const t = document.getElementById("verdict")?.textContent ?? "";
    return t.length > 0 && !t.includes("判定中");
  }, null, { timeout: 45000 });
}

const rows = [];
for (const trip of TRIPS) {
  // ⚠ 毎回まっさらな入れ物にする。2人目が1人目のキャッシュに乗ると、
  //   「初めて来た人1人あたり」が測れない（実際より軽く見える）
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const seen = [], bytes = new Map(), gsi = new Map();
  ctx.on("request", (r) => {
    seen.push(r.url());
    // /xyz/<層>/z/x/y.ext のかたちなので、層の名前で割る。
    // ⚠ ここも両ホストを見る。でないと「国土地理院」の合計と、層ごとの内訳が食い違う。
    const m = new RegExp(`(?:${TILE_HOSTS.join("|").replace(/\./g, "\\.")})/xyz/([^/]+)/`).exec(r.url());
    if (m) gsi.set(m[1], (gsi.get(m[1]) ?? 0) + 1);
  });
  ctx.on("response", async (r) => {
    const b = bucket(r.url());
    const len = +(r.headers()["content-length"] ?? 0);
    bytes.set(b, (bytes.get(b) ?? 0) + (Number.isFinite(len) ? len : 0));
  });
  const page = await ctx.newPage();
  try { await trip.run(page); } catch (e) { console.log(`  ⚠ ${trip.name}: ${e.message.slice(0, 40)}`); }
  await page.waitForTimeout(500);
  const by = new Map();
  for (const u of seen) by.set(bucket(u), (by.get(bucket(u)) ?? 0) + 1);
  rows.push({ name: trip.name, by, bytes, gsi });
  await ctx.close();
}
await browser.close();

const KEYS = ["worker(/t)", "静的(無料)", "国土地理院", "Wikidata", "Overpass", "住所検索", "その他外部"];
const w = Math.max(...rows.map((r) => [...r.name].length)) + 2;
console.log("\n1人あたりの回数\n");
console.log("  " + "".padEnd(w) + KEYS.map((k) => k.padStart(12)).join(""));
for (const r of rows)
  console.log("  " + r.name.padEnd(w - [...r.name].length + r.name.length)
    + KEYS.map((k) => String(r.by.get(k) ?? 0).padStart(12)).join(""));

console.log("\n無料枠まで、1日に何人来られるか");
console.log("  ⚠ 静的アセットへのリクエストは Worker を起こさないので、請求の対象にならない。");
console.log("     数えるのは /t だけ（1回につき D1 に1行書く）。");
for (const r of rows) {
  const t = r.by.get("worker(/t)") ?? 0;
  console.log(`  ${r.name.padEnd(w - [...r.name].length + r.name.length)}`
    + (t === 0 ? "/t 0 回 → 無料枠に当たらない"
      : `/t ${t} 回 → 1日 ${Math.floor(Math.min(FREE.worker, FREE.d1write) / t).toLocaleString()} 人まで無料`));
}
console.log("\n国土地理院の中身（層ごと）");
for (const r of rows) {
  const top = [...r.gsi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  ${r.name}\n    ` + (top.length
    ? top.map(([k, v]) => `${k} ${v}`).join(" / ") : "なし"));
}
console.log("\n⚠ 外部（国土地理院・Wikidata・Overpass）は無料枠の話ではなく、相手先への負荷。"
  + "\n   ここは Service Worker を止めて測っている＝**初めて来た人**の回数。"
  + "\n   2回目以降はタイルが手元に残るので、この数字は上限。");
// ⚠ 子プロセスを落とさないと終わらない。終わらないと**標準出力が吐き出されない**
//   （画面には何も出ず、止まっているように見える。実測でそうなった）
server.kill();
process.exit(0);
