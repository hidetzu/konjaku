// 場所ごとの答えを、⚠ **静的な HTML として事前に作る**（2026-10-10。hidetzu/konjaku#535）。
//
// ⚠ **なぜ要るか**（⚠ 実測 2026-10-10）:
//   ⚠ **Search Console の検索での表示回数が 0。**
//   ⚠ **索引の下地は生きている**（robots.txt 200 ／ sitemap.xml 200 ／ X-Robots-Tag 無し）。
//   ⚠ **足りないのは「検索される語」**。⚠ **索引にある 4 ページに地名が 1 つも無い。**
//   ⚠ **人が検索するのは地名を含む語**（「東京駅 昔」など）。
//
// ⚠ **判定を 2 つ持たない**（`CLAUDE.md` §3）。
//   ⚠ **ここは判定を書かない。**⚠ **本番の画面をそのまま開き、⚠ 出た答えの字を写すだけ。**
//   ⚠ **字は `public/words.js` / `public/answer.js` が持つ**（`.claude/rules/domain.md`）。
//   ⚠ **だから「生成した答え」と「ブラウザで開いた答え」は、⚠ 同じコードから出る。**
//
// ⚠ **取れなかったら、⚠ ページを作らない**（`CLAUDE.md` §1）。
//   ⚠ **古い答えを配らない。**⚠ **「無い」とも書かない。**⚠ **黙って出さない。**
//
// ⚠ **いつの答えかを、⚠ ページに書く**（`CLAUDE.md` §6）。
//   ⚠ **地理院の資料が変われば答えも変わる。**⚠ **生成物は git に入れるので、⚠ 差分で気づける。**
//
// ## 使い方
//
//   npm run build-place              ⚠ 作る
//   npm run build-place -- --check   ⚠ 作らずに、⚠ いまの生成物と突き合わせるだけ
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ⚠ **1 地点だけ**（hidetzu/konjaku#535 の Out of Scope）。
//   ⚠ **2 地点以上・一覧・検索は、⚠ `.claude/rules/domain.md` の MUST が禁じている。**
//   ⚠ **増やすのは、⚠ 1 地点で効いたかを読めてから**（`docs/adr/0112` の線に届くまで言えない）。
const 地点 = [
  { slug: "tokyo-station", 名: "東京駅", lat: 35.6812, lon: 139.7671 },
];

const ROOT = join(import.meta.dirname, "..");
const PORT = Number(process.env.BUILD_PLACE_PORT ?? 8124);
const CHECK = process.argv.includes("--check");
// ⚠ **人が読む日付なので JST**（⚠ 計測の日は UTC。`docs/adr/0102`。⚠ 混ぜない）。
const 今日 = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

// ⚠ **答えを待つ。**⚠ **器ではなく、⚠ 結果の字を待つ**（`CLAUDE.md` §9）。
//   ⚠ **`#gloss` の初期値は全角空白 1 つ**（`public/index.html`）。⚠ **それを「出た」と読まない。**
const 答えを待つ = (p) => p.waitForFunction(() => {
  const g = document.querySelector("#gloss")?.textContent?.trim() ?? "";
  return g.length > 0 && g !== "　";
}, null, { timeout: 25000 });

// ⚠ **答えが揃っているか。**⚠ **揃っていないものは、⚠ ページを作らない。**
//   ⚠ **`#gloss` の初期値（全角空白）を「答え」と読まない。**
const 答えが揃っている = (答) => !!(答 && 答.答え && 答.答え !== "\u3000" && 答.二行目);

const 答えを読む = (p) => p.evaluate(() => {
  const t = (s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  const 出ている = (s) => { const e = document.querySelector(s); return e ? !e.hidden : false; };
  return {
    出典: 出ている("#glossSrc") ? t("#glossSrc") : null,
    答え: t("#gloss"),
    二行目: t("#sub"),
    補足: 出ている("#glossNote") ? t("#glossNote") : null,
  };
});

// ⚠ **HTML の中の字は、⚠ ここで作らない。**⚠ **画面から写したものだけを入れる。**
//   ⚠ **例外は、⚠ この画面そのものの説明と導線**（⚠ 新しい語を作らない形で書く）。
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ⚠ **題と説明は 1 か所で作る**（⚠ `title` と `og:title` を別に書くと、⚠ 片方だけ古くなる）。
const 題 = (名) => `${名}は昔なんだったのか？ — 今昔`;
const 説明 = (名, 答) =>
  `${名}の土地が昔なんだったかを、国土地理院の資料を読んで答えます。${答.答え}。${答.二行目}`;

const 組む = ({ 名, slug, lat, lon }, 答, 測った日) => `<!doctype html>
<!-- ⚠ これは生成物。手で直さない。
     ⚠ 作るのは scripts/build-place.mjs（npm run build-place）。
     ⚠ 答えの字は public/words.js / public/answer.js が持つ。ここでは作らない。
     ⚠ 測った日: ${測った日} -->
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- ⚠ 外へは 1 本も送らない（docs/SPEC.md 掟 5） -->
<meta name="referrer" content="same-origin">
<title>${esc(題(名))}</title>
<meta name="description" content="${esc(説明(名, 答))}">
<!-- ⚠ 共有されたときの見た目。⚠ 絵は既存の 1 枚を使う（⚠ 場所ごとの絵は作らない） -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="今昔">
<meta property="og:title" content="${esc(題(名))}">
<meta property="og:description" content="${esc(説明(名, 答))}">
<meta property="og:url" content="https://konjaku.hidetzu.work/place/${esc(slug)}">
<meta property="og:image" content="https://konjaku.hidetzu.work/ogp.png">
<meta property="og:image:alt" content="この土地は、昔なんだったのか？ — 土地の成り立ちを、根拠とともに見る">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(題(名))}">
<meta name="twitter:description" content="${esc(説明(名, 答))}">
<link rel="canonical" href="https://konjaku.hidetzu.work/place/${esc(slug)}">
<link rel="icon" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/brand.css">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/about.css">
<main class="about">
  <h1 class="entry__q">${esc(名)}は昔なんだったのか？</h1>
  <p class="about__p" data-ans="head"><strong>${esc(答.答え)}</strong></p>
  <p class="about__p" data-ans="sub">${esc(答.二行目)}</p>${答.出典 ? `
  <p class="about__note">出典: ${esc(答.出典)}</p>` : ""}${答.補足 ? `
  <p class="about__note">${esc(答.補足)}</p>` : ""}
  <p class="about__p"><a class="entry__cta" href="/?ll=${lat},${lon}">地図で見る →</a></p>
  <p class="about__p"><a href="/deep?ll=${lat},${lon}">この場所を深掘り →</a></p>
  <p class="about__note">${esc(測った日)} に、国土地理院の資料を読んで出した答えです。
    資料が変われば答えも変わります。いまの答えは、地図で確かめられます。</p>
  <p class="about__note"><a href="/">ほかの場所を調べる</a> ／ <a href="/about">このサイトについて</a></p>
</main>
`;

const server = spawn(process.execPath, ["scripts/serve.mjs"],
  { cwd: ROOT, env: { ...process.env, PORT: String(PORT), SERVE_ROOT: "public" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));

const b = await chromium.launch();
const 結果 = [];
try {
  for (const 地 of 地点) {
    const p = await b.newPage();
    let 答 = null, 理由 = null;
    try {
      await p.goto(`http://127.0.0.1:${PORT}/?ll=${地.lat},${地.lon}`, { waitUntil: "domcontentloaded" });
      await 答えを待つ(p);
      答 = await 答えを読む(p);
    } catch (e) { 理由 = String(e.message).split("\n")[0].slice(0, 120); }
    await p.close();

    // ⚠ **取れなかったら作らない**（⚠ 古い答えを配らない。⚠ 「無い」とも書かない）
    if (!答えが揃っている(答)) { 結果.push({ ...地, 作った: false, 理由: 理由 ?? "答えが出なかった" }); continue; }

    const 先 = join(ROOT, "public", "place", `${地.slug}.html`);
    const 本文 = 組む(地, 答, 今日);
    if (CHECK) {
      const 前 = await readFile(先, "utf8").catch(() => null);
      // ⚠ **測った日の行だけは、⚠ 毎回変わる。**⚠ **答えの字で突き合わせる。**
      const 字だけ = (s) => (s ?? "").replace(/測った日: \d{4}-\d{2}-\d{2}/g, "")
        .replace(/⚠ \d{4}-\d{2}-\d{2} に、/g, "");
      結果.push({ ...地, 作った: false, 一致: 字だけ(前) === 字だけ(本文), 答: 答.答え });
    } else {
      await mkdir(join(ROOT, "public", "place"), { recursive: true });
      await writeFile(先, 本文);
      結果.push({ ...地, 作った: true, 答: 答.答え, 二行目: 答.二行目 });
    }
  }
} finally { await b.close(); server.kill(); }

// ⚠ **走った群と件数を、⚠ 自分で名乗る**（`CLAUDE.md` §9。⚠ SPEC に数を書かない）
console.log(CHECK ? `突き合わせ（${地点.length} 地点）` : `作った（${地点.length} 地点 ／ ${今日}）`);
let 落ちた = 0;
for (const r of 結果) {
  if (r.理由) { console.log(`  ✗ ${r.名}: ${r.理由}（⚠ ページは作っていない）`); 落ちた++; continue; }
  if (CHECK) {
    console.log(`  ${r.一致 ? "✓" : "✗"} ${r.名}: ${r.答}${r.一致 ? "" : "  ⚠ いまの生成物と食い違う"}`);
    if (!r.一致) 落ちた++;
  } else console.log(`  ✓ ${r.名}: ${r.答} ／ ${r.二行目}`);
}
if (落ちた) process.exitCode = 1;
