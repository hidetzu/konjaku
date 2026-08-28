// 見て決めるための材料を作る（hidetzu/konjaku#364）。
//
// ⚠ **これは検査ではない。**⚠ **落ちない。**⚠ **Owner が見て決めるための絵を作るだけ。**
//   ⚠ 実描画（`test/render.mjs`）は「主張が守られているか」を見る。⚠ こちらは「どう見えるか」を見せる。
//
// ⚠ **なぜ要るか**（実測 2026-08-28）: ⚠ **見え方を決めた Issue 45 件のうち、
//   ⚠ 判断材料に画像があったのは 1 件（2%）。**⚠ 残り 44 件は px か文章だけで決めてもらっていた。
//   ⚠ **同じ症状が 5 本に分かれた例もある**（「重ねる」が初期画面から出る: hidetzu/konjaku#176 → hidetzu/konjaku#278 → hidetzu/konjaku#281）。
//
// ## 使い方
//
//   # ⚠ いまの main と、⚠ 手元の変更を、⚠ 同じ切り取りで並べる
//   node scripts/visual-decision.mjs --url=/ --sel="#ev .ev-note" --label=before --out=tmp/vd
//   node scripts/visual-decision.mjs --url=/ --sel="#ev .ev-note" --label=after  --out=tmp/vd
//   node scripts/visual-decision.mjs --compose --out=tmp/vd --title="…" --note="…"
//
//   # ⚠ 4 幅で撮る（`.claude/skills/ui-ux-review` §0 の 4 つ）
//   node scripts/visual-decision.mjs --url=/ --sel=footer --label=after --widths=all
//
//   # ⚠ 一覧に無い幅（⚠ 横向きなど）
//   node scripts/visual-decision.mjs --url=/ --sel="#ovRow" --label=横 --size=667x375
//
//   # ⚠ 案を見せる（⚠ 製品は書き換えない。⚠ 撮るときだけ効く）
//   node scripts/visual-decision.mjs --url=/ --sel="#ovRow" --label=案A --css="#strip{display:none}"
//
// ## ⚠ 決めていること
//
//   ⚠ **撮るのは要素**（⚠ `--sel`）。⚠ **`fullPage` で撮ると版面が組み直され、⚠ 座標がずれる**
//     （⚠ 2026-08-28 に踏んだ。⚠ 全画面が要るときは `--sel=body`）。
//   ⚠ **ポートは既定 8701**（⚠ 実描画の 8099 とぶつけない。⚠ `VD_PORT` で変えられる）。
//   ⚠ **出力先は追跡しない**（⚠ `tmp/` は `.gitignore` に入っている）。
//   ⚠ **色みは両方撮る**（⚠ 片方だけ見て決めると、⚠ もう片方で割れる。⚠ hidetzu/konjaku#282 で実際に起きた）。

// ⚠ **`playwright` は、⚠ 撮るときにだけ読み込む**（2026-08-28。⚠ 実際に CI で落とした）。
//   ⚠ **静的検査のジョブに `playwright` は入っていない**（⚠ 実描画のジョブでだけ入れている）。
//   ⚠ **上に `import` を書くと、⚠ `--selftest` へ届く前に読み込みで落ちる。**
//   ⚠ **`CLAUDE.md` §9 が既に書いている**: ⚠ 「数えるだけの口は、⚠ 重いものを読み込まない」。
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const arg = (k, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d);
};

// ⚠ **4 幅は `.claude/skills/ui-ux-review` §0 が決めたもの**（⚠ ここで増やさない）
const WIDTHS = [
  { w: 375, h: 667, name: "375×667", why: "ふつうのスマホ（基準）" },
  { w: 344, h: 882, name: "344×882", why: "ZFold5 のカバー（窮屈が最初に出る）" },
  { w: 320, h: 640, name: "320×640", why: "いちばん狭い" },
  { w: 1280, h: 800, name: "1280×800", why: "PC" },
];
const PORT = Number(process.env.VD_PORT ?? 8701);
const OUT = arg("out", "tmp/visual-decision");

// ---------- ⚠ 自己検査（⚠ ブラウザを立てない）----------
// ⚠ **引数の読み方を一度間違えている**（⚠ `--size` を足す前、⚠ 一覧の先頭しか撮れなかった）。
//   ⚠ **静的検査から呼ばれる**（`test/check/syntax.mjs`）。⚠ **落ちたら赤くする。**
if (arg("selftest")) {
  const bad = [];
  const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want))
    bad.push(`${what}: ${JSON.stringify(got)} ／ 期待 ${JSON.stringify(want)}`); };
  const parse = (argv) => {
    const save = process.argv; process.argv = ["node", "x", ...argv];
    const get = (k, d = null) => {
      const a2 = process.argv.find((x) => x.startsWith(`--${k}=`));
      return a2 ? a2.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d);
    };
    const size = get("size");
    const out = {
      url: get("url"), sel: get("sel", "body"), label: get("label", "shot"),
      fold: !!get("fold"), css: get("css"),
      sizes: size ? [{ w: Number(size.split("x")[0]), h: Number(size.split("x")[1]) }]
                  : (get("widths") === "all" ? WIDTHS.map((v) => ({ w: v.w, h: v.h }))
                                             : [{ w: WIDTHS[0].w, h: WIDTHS[0].h }]),
    };
    process.argv = save; return out;
  };
  const a1 = parse(["--url=/", "--sel=#x", "--label=いま"]);
  eq(a1.sizes, [{ w: 375, h: 667 }], "既定は 375×667 の 1 つ");
  eq(a1.fold, false, "--fold は既定で off");
  const a2 = parse(["--url=/", "--size=667x375", "--fold"]);
  eq(a2.sizes, [{ w: 667, h: 375 }], "--size で一覧に無い幅を撮れる");
  eq(a2.fold, true, "--fold が立つ");
  const a3 = parse(["--url=/", "--widths=all"]);
  eq(a3.sizes.length, 4, "--widths=all は 4 幅");
  const a4 = parse(["--url=/", "--css=#a{display:none}"]);
  eq(a4.css, "#a{display:none}", "--css は = を含む値も取れる");
  eq(parse(["--url=/"]).sel, "body", "--sel の既定は body");
  // ⚠ **4 幅は `ui-ux-review` §0 が決めたもの**（⚠ ここで増やしていないこと）
  eq(WIDTHS.map((v) => v.name), ["375×667", "344×882", "320×640", "1280×800"], "4 幅は増やしていない");
  if (bad.length) { console.log("✗ " + bad.join(" ／ ")); process.exit(1); }
  console.log(`✓ 引数の読み方 6 件（⚠ 4 幅は ui-ux-review §0 のまま）`);
  process.exit(0);
}

// ---------- 並べる ----------
if (arg("compose")) {
  const files = (await readdir(OUT)).filter((f) => f.endsWith(".png")).sort();
  const shots = new Map();          // ⚠ ラベル → [{名, data}]
  for (const f of files) {
    const [label, ...rest] = f.replace(/\.png$/, "").split("__");
    const data = "data:image/png;base64," + (await readFile(`${OUT}/${f}`)).toString("base64");
    if (!shots.has(label)) shots.set(label, []);
    shots.get(label).push({ name: rest.join(" ／ ").replace(/_/g, " "), data });
  }
  if (!shots.size) { console.log(`⚠ ${OUT} に png が無い。⚠ 先に撮ること`); process.exit(1); }
  const cols = [...shots.keys()];
  const rows = [...new Set([...shots.values()].flat().map((s) => s.name))];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // ⚠ **Artifact に載せられる形で出す**（⚠ `<title>` を持ち、⚠ `<!doctype>` `<html>` を書かない）。
  //   ⚠ **手元でそのまま開いても読める**（⚠ ブラウザは断片を受け取る）。
  //   ⚠ **色みは 1 つに決めている**（⚠ 見せたい色みは画像の側が持つ。⚠ 台紙まで反転すると比べにくい）。
  const html = `<title>${esc(arg("title", "見て決める"))}</title><style>
    body{margin:0;background:#eceff3;color:#1b2028;padding:22px;
      font:14px/1.75 system-ui,-apple-system,sans-serif}
    h1{font-size:17px;margin:0 0 4px} .sub{font-size:13px;color:hidetzu/konjaku#525c6b;margin:0 0 18px}
    table{border-collapse:collapse;width:100%} th,td{padding:8px;vertical-align:top}
    th.lab{text-align:left;font-size:13px;color:hidetzu/konjaku#525c6b;white-space:nowrap;width:1%}
    th.col{font-size:13px;text-align:left}
    th.col.a{color:#0b62ab} th.col.b{color:hidetzu/konjaku#525c6b}
    img{max-width:100%;display:block;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.18)}
    .note{margin:18px 0 0;font-size:13px;color:hidetzu/konjaku#525c6b} b{color:#1b2028}
  </style>
  <h1>${esc(arg("title", "見て決める"))}</h1>
  <p class="sub">${esc(arg("cond", ""))}</p>
  <table><tr><th class="lab"></th>${cols.map((c, i) =>
    `<th class="col ${i === 0 ? "b" : "a"}">${esc(c)}</th>`).join("")}</tr>
  ${rows.map((r) => `<tr><th class="lab">${esc(r)}</th>${cols.map((c) => {
    const s = shots.get(c).find((x) => x.name === r);
    return `<td>${s ? `<img src="${s.data}" alt="${esc(c)} ${esc(r)}">` : "—"}</td>`;
  }).join("")}</tr>`).join("")}
  </table>
  <p class="note">${esc(arg("note", ""))}</p>`;
  await writeFile(`${OUT}/compare.html`, html);
  const kb = Math.round(html.length / 1024);
  console.log(`⚠ 並べた: ${OUT}/compare.html（⚠ 列 ${cols.join(" / ")} ／ 行 ${rows.length} ／ ${kb}KB）`);
  // ⚠ **Artifact は 16MB まで**（⚠ data URI もその数に入る）
  if (kb > 12000) console.log(`  ⚠ 大きい。⚠ 撮る条件を減らすか、⚠ --fold で 1 倍にする`);
  process.exit(0);
}

// ---------- 撮る ----------
const url = arg("url"), sel = arg("sel", "body");
// ⚠ **ラベルはファイル名になる**。⚠ **`/` を入れると階層と読まれ、⚠ 別の名前で保存される**
//   （⚠ 2026-08-28 に踏んだ。⚠ 「いま 1.28 / 1.48」が「いま 1.28 」になった）。
const label = String(arg("label", "shot")).replace(/[\/\\:*?"<>|]/g, "_");
if (!url) { console.log("⚠ --url が要る（例 --url=/ ／ --url=/peel?ll=…）"); process.exit(1); }
if (!existsSync("scripts/serve.mjs")) { console.log("⚠ repo の根で回すこと"); process.exit(1); }

// ⚠ **`--size=667x375` で、⚠ 一覧に無い幅も撮れる**（⚠ 横向きなど。⚠ 一覧は増やさない）
const size = arg("size");
const only = size
  ? [{ w: Number(size.split("x")[0]), h: Number(size.split("x")[1]),
       name: size.replace("x", "×"), why: "指定" }]
  : (arg("widths") === "all" ? WIDTHS : WIDTHS.slice(0, 1));
const themes = arg("theme") ? [arg("theme")] : ["light", "dark"];
const pad = Number(arg("pad", 12));
const waitSel = arg("wait", null);

await mkdir(OUT, { recursive: true });
const { chromium } = await import("playwright");
const srv = spawn("node", ["scripts/serve.mjs"],
  { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const br = await chromium.launch();
const done = [];
try {
  for (const v of only) for (const theme of themes) {
    const ctx = await br.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: v.w < 1000,
      // ⚠ **折り返し全体は 1 倍で撮る**（⚠ 2 倍だと 1 枚 400KB を超え、⚠ 並べると Artifact の上限に当たる）。
      //   ⚠ **一部を切り取るときは 2 倍**（⚠ 字の細部を見て決めることがある）。
      colorScheme: theme, serviceWorkers: "block", deviceScaleFactor: arg("fold") ? 1 : 2 });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    // ⚠ **器ではなく、⚠ 落ち着いたこと（結果の字）を待つ**（`CLAUDE.md` §9）
    // ⚠ **案を見せるのに、⚠ 製品を書き換えない**（⚠ `--css` は撮るときだけ効く）。
    //   ⚠ **これで撮った絵は「案」であって、⚠ 実装ではない。**⚠ **そう明記して渡すこと。**
    const css = arg("css");
    if (waitSel) await p.waitForFunction((s) =>
      (document.querySelector(s)?.textContent ?? "").trim().length > 0, waitSel, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(Number(arg("settle", 4000)));
    // ⚠ **案は撮るときだけ当てる**（⚠ 製品を書き換えない）。
    //   ⚠ **効いたかを、⚠ 道具の側で自動判定しようとしてやめた**（2026-08-28）。
    //   ⚠ **当てる前後で画面自体が動き続ける**ので（⚠ 地図・写真が遅れて入る）、
    //     ⚠ **色が変わった要素を数えても、⚠ 3 通り試して同じ数になった。**
    //   ⚠ **嘘を言う見張りは、⚠ 無いより悪い。**⚠ **外した。**
    //   ⚠ **効いたかは人が数字で確かめる**（`.claude/skills/visual-decision` §3）。
    //     ⚠ **`--fold` の「N px 出ている」や、⚠ 別途 `getComputedStyle` で読む。**
    if (css) { await p.addStyleTag({ content: css }); await p.waitForTimeout(200); }
    // ⚠ **`--fold` を付けると、⚠ 初期画面（折り返しまで）を撮り、⚠ 相手がその中に在るかを言う。**
    //   ⚠ **「画面外へ出た」は、⚠ 相手だけ切り取ると見えない**（⚠ hidetzu/konjaku#281 で実際にそうだった）。
    const box = await p.evaluate(({ s, pad, fold }) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const inFold = r.top >= 0 && r.bottom <= innerHeight;
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
      if (fold) return { x: 0, y: 0, w: innerWidth, h: innerHeight, t, inFold,
                         over: Math.round(r.bottom - innerHeight) };
      return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top + scrollY - pad),
               w: Math.min(innerWidth, r.width + pad * 2), h: r.height + pad * 2,
               t, inFold, over: Math.round(r.bottom - innerHeight) };
    }, { s: sel, pad, fold: !!arg("fold") });
    if (!box || box.w < 2 || box.h < 2) { console.log(`  ⚠ ${v.name}/${theme}: 「${sel}」が見つからない`); await ctx.close(); continue; }
    const file = `${OUT}/${label}__${v.name}__${theme}.png`;
    await p.screenshot({ path: file, fullPage: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
    done.push(`${v.name}/${theme}`);
    console.log(`  ${v.name} ／ ${theme}  ${Math.round(box.w)}×${Math.round(box.h)}px`
      + `  ${box.inFold ? "初期画面に入る" : `⚠ 初期画面から ${box.over}px 出ている`}`
      + `  「${box.t}」`);
    await ctx.close();
  }
} finally { await br.close(); srv.kill(); }
console.log(`⚠ ${label} を ${done.length} 枚撮った → ${OUT}/`);
