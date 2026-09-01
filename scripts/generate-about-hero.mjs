// /about の冒頭に置く 2 枚を作る。
//
// ⚠ **今昔の実画面を撮ったもの。**⚠ 装飾のために描いた絵ではない。
//   ⚠ 同じ地点・同じ倍率で、⚠ 1936–42 の空中写真と、いまの画面を 1 枚ずつ。
//
// ⚠ **なぜ作り置きなのか**（2026-09-02。Owner 判断。`docs/adr/0084`）:
//   ⚠ 読み物の /about から、⚠ 読者の接続元を配信元へ出さないため。
//   ⚠ /about は、いま外へ 1 本も出していない。
//
// ⚠ **回すには Playwright と通信が要る。**⚠ CI の静的検査では回さない。
//   ⚠ `--check` は、⚠ 撮り直さずに manifest と実ファイルを突き合わせるだけ（通信も要らない）。
//
//   npm run about-hero            2 枚を撮り直して manifest を書く
//   npm run about-hero -- --check 撮らずに、manifest と実ファイルが合っているかだけ見る
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(ROOT, p);
const MANIFEST = "assets/about/hero.json";
const SITE = "https://konjaku.hidetzu.work";

// ⚠ **お台場。**⚠ **豊洲は使えない**（2026-09-02。実測）:
//   ⚠ 豊洲は 1936 年に既に陸（飛行場）で、⚠ 写真に水が写っていない。
//   ⚠ 「河川・湖沼・海面」は明治期の資料が言っていることで、⚠ 1936 の写真ではない。
//   ⚠ 並べると、⚠ 写真が言っていないことを言ったことになる（`CLAUDE.md` §1）。
//   ⚠ お台場は 1936 年も一面が水面なので、⚠ 写真と答えが食い違わない。
const 場所 = { name: "東京・お台場", ll: "35.6300,139.7750" };

// ⚠ **8:5。**⚠ 正方形にすると、⚠ PC で画面を占領する（実測 2026-09-02）。
const W = 800, H = 500, SCALE = 2, OUT_W = 720;

export const SHOTS = [
  { id: "mukashi", era: "ort_riku10", out: "public/about-1936.webp",
    label: "1936–42 の空中写真", note: "一面が水面",
    alt: "1936〜42年の空中写真。お台場のあたりは一面が水面" },
  { id: "ima", era: null, out: "public/about-ima.webp",
    label: "いまの画面", note: "台場の街",
    alt: "いまの今昔の画面。お台場の街と、地形分類の色" },
];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ⚠ **WebP の大きさは、⚠ ヘッダから読む**（⚠ 外の道具に頼らない）。
function webpSize(buf) {
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF"
    || buf.subarray(8, 12).toString("ascii") !== "WEBP")
    throw new Error("WebP ではありません");
  const kind = buf.subarray(12, 16).toString("ascii");
  if (kind === "VP8X")
    return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8 ")
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  throw new Error(`知らない WebP の形: ${kind}`);
}

const metaOf = (s, buf) => ({
  id: s.id, output: s.out, sha256: sha256(buf), bytes: buf.length,
  ...webpSize(buf), label: s.label, note: s.note, alt: s.alt,
  era: s.era ?? "（年代を選んでいない＝いまの画面）",
});

function check() {
  const m = JSON.parse(readFileSync(file(MANIFEST), "utf8"));
  if (m.place !== 場所.name || m.ll !== 場所.ll)
    throw new Error("manifest の場所が、この台本と違います");
  for (const s of SHOTS) {
    if (!existsSync(file(s.out))) throw new Error(`${s.out} がありません`);
    const buf = readFileSync(file(s.out));
    const actual = metaOf(s, buf);
    const rec = m.shots.find((x) => x.id === s.id);
    if (JSON.stringify(rec) !== JSON.stringify(actual))
      throw new Error(`${s.out} が manifest と違います。npm run about-hero を実行してください`);
    if (actual.width !== OUT_W)
      throw new Error(`${s.out} の幅が ${OUT_W} ではありません（${actual.width}）`);
  }
  console.log(`/about の冒頭 ${SHOTS.length}枚は manifest と一致（${場所.name}）`);
}

async function generate() {
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  mkdirSync(file("assets/about"), { recursive: true });
  const shots = [];
  for (const s of SHOTS) {
    const p = await b.newPage({
      viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: "light" });
    await p.goto(`${SITE}/?ll=${場所.ll}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll(".era").length > 0, null, { timeout: 60000 });
    await p.waitForTimeout(4000);
    if (s.era) {
      await p.evaluate((id) => document.querySelector(`.era[data-era="${id}"]`)?.click(), s.era);
      await p.waitForTimeout(6000);
    }
    // ⚠ **地図だけを残す。**⚠ 出典の札も外す（⚠ 出典は /about の添え書きが名乗る）。
    //   ⚠ 検索欄や板を入れると、⚠ 2 枚並べたとき 163px になって読めない（実測 2026-09-02）。
    await p.addStyleTag({ content:
      "#card,#steps,#bar,.brand,.tabs,.attrib{visibility:hidden!important}" });
    await p.waitForTimeout(1200);
    // ⚠ **途中の PNG は配らない**（⚠ 1 枚 1.5MB）。⚠ `.gitignore` が外している。
    const png = join(file("assets/about"), `${s.id}.png`);
    await p.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } });
    await p.close();
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", png,
      "-vf", `scale=${OUT_W}:-1`, "-q:v", "76", file(s.out)]);
    const buf = readFileSync(file(s.out));
    shots.push(metaOf(s, buf));
    console.log(`${s.out}  ${buf.length} bytes  ${webpSize(buf).width}x${webpSize(buf).height}`);
  }
  await b.close();
  writeFileSync(file(MANIFEST), JSON.stringify({
    generatedBy: "npm run about-hero",
    // ⚠ **いつ・どこで・どうやって撮ったかを残す**（`CLAUDE.md` §6）。
    source: `${SITE}/?ll=${場所.ll}`,
    place: 場所.name, ll: 場所.ll,
    viewport: `${W}x${H}@${SCALE}x`, outputWidth: OUT_W,
    browser: execFileSync("node", ["-e",
      "import('playwright').then(m=>console.log(m.chromium.name()+' '+require('playwright/package.json').version))"],
      { encoding: "utf8" }).trim(),
    encoder: execFileSync("ffmpeg", ["-version"], { encoding: "utf8" }).split("\n")[0],
    tiles: "国土地理院 地理院タイル（1936–42 の空中写真 ort_riku10 ／ 淡色地図 pale ／ 地形分類 実験）",
    shots,
  }, null, 2) + "\n");
  console.log(`manifest を書いた: ${MANIFEST}`);
}

if (process.argv.includes("--check")) check();
else await generate();
