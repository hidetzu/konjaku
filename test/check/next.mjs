// 今昔 — ⚠ **v0.1.0 の器が、⚠ β 版と混ざっていないことを見る**（`docs/adr/0050`）。
//
// ⚠ **見るのは境界だけ。**⚠ **中身の作りは見ない**（⚠ まだ何も決まっていない）。
//
// ⚠ **なぜ要るか**: ⚠ **`public-next/` は静的検査の外にある。**
//   ⚠ **`public/` を見ている検査は 98 か所あるが、⚠ そのどれも `public-next/` を見ない。**
//   ⚠ **混ざっても、⚠ 誰も落とさない。**
//
// ⚠ **`tmp/next-konjaku.md` の決め事**: v0.1.0 は β 版の画面・機能・データ構成を前提にしない。
//   ⚠ **「引き継がない」は Owner 判断**（2026-08-28）。⚠ **運ぶなら、⚠ そのつど決める。**

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, ok, bad, warn, head, HEAD_COMMENT } from "./lib.mjs";

head("v0.1.0 の器");

const NEXT = join(ROOT, "public-next");
if (!existsSync(NEXT)) bad("public-next/ が無い（ADR 0050 の器）");
else {

  // ---- ⚠ ① 別の Worker として立っているか ----
  const CFG = join(ROOT, "wrangler.next.jsonc");
  if (!existsSync(CFG)) bad("wrangler.next.jsonc が無い（ADR 0050）");
  else {
  const raw = readFileSync(CFG, "utf8");
  // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 注記の字面を拾う）
  const cfg = JSON.parse(raw.replace(HEAD_COMMENT, "").replace(/,(\s*[}\]])/g, "$1"));
  const base = JSON.parse(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8")
    .replace(HEAD_COMMENT, "").replace(/,(\s*[}\]])/g, "$1"));

  cfg.name && cfg.name !== base.name
    ? ok(`v0.1.0 は別の Worker（${cfg.name} ／ β は ${base.name}）`)
    : bad(`v0.1.0 の Worker 名が β と同じ（${cfg.name}）。⚠ 同じ名前だと β を上書きする`);

  cfg.assets?.directory === "./public-next"
    ? ok("v0.1.0 が配るのは public-next/ だけ")
    : bad(`v0.1.0 の配信元が public-next/ ではない（${cfg.assets?.directory}）`);

  // ⚠ **β の D1 を繋いでいないか。**⚠ 繋ぐと、⚠ **計測の分母が壊れる**（`CLAUDE.md` §6）
  const sameDb = (cfg.d1_databases ?? []).some((d) =>
    (base.d1_databases ?? []).some((b) => b.database_id === d.database_id));
  sameDb
    ? bad("v0.1.0 が β と同じ D1 を繋いでいる。⚠ 計測が混ざり、⚠ 分母が壊れる")
    : ok("v0.1.0 は β の D1 を繋いでいない");

  // ---- ⚠ ② β 版のファイルを引き込んでいないか ----
  // ⚠ **「引き継がない」が Owner 判断。**⚠ **運ぶと決めたなら、⚠ ここの一覧に理由と一緒に書く。**
  const 運んでよいもの = [
    // ⚠ いまは 0 件。⚠ **足すときは「なぜ運ぶか」を必ず書く。**
  ];
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(NEXT);

  const 引き込み = [];
  for (const f of files) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    // ⚠ **`public/` の中を指す参照**（⚠ `../public/…` と、⚠ β の直下の js を名指しするもの）
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const v = m[1];
      if (/^\.\.\/public\//.test(v) || /\/public\//.test(v)) 引き込み.push(`${relative(ROOT, f)} → ${v}`);
    }
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g))
      if (/\.\.\/public\//.test(m[1])) 引き込み.push(`${relative(ROOT, f)} → ${m[1]}`);
  }
  const 未申告 = 引き込み.filter((x) => !運んでよいもの.some((a) => x.includes(a)));
  未申告.length
    ? bad(`v0.1.0 が β 版のファイルを引き込んでいる: ${未申告.join(" ／ ")}（⚠ 運ぶなら test/check/next.mjs の一覧に理由と一緒に書く）`)
    : ok(`v0.1.0 は β 版のファイルを引き込んでいない（⚠ ${files.length} ファイルを見た）`);


  // ---- ⚠ ④ 配信物に、⚠ こちらの作業メモを載せていないか ----
  // ⚠ **2026-08-28 に実際に出した。**⚠ **HTML のコメントは、⚠ そのまま配信される。**
  //   ⚠ **`dev.konjaku.hidetzu.work` を開いたら、⚠ ADR の番号と、
  //   ⚠ 中で何を迷っているかが、⚠ 誰でも読める状態だった。**
  // ⚠ **ADR 自体は公開リポジトリにあるので秘密ではない。**
  //   ⚠ **問題は、⚠ 配信物にこちらの作業メモを載せていること**（`CLAUDE.md` §8-1 の筋）。
  // ⚠ **なぜそう書いたかは、⚠ `public-next/README.md` か ADR に置く。**
  const 作業メモの印 = /docs\/adr\/|Owner 判断|⚠ \*\*まだ何も決まっていない|CLAUDE\.md|\.claude\//;
  const 漏れ = [];
  for (const f of files) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    // ⚠ **コメントの中だけを見る**（⚠ 本文に出す語とは別の話）
    for (const m of src.matchAll(/<!--([\s\S]*?)-->/g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（HTML コメント）`);
    for (const m of src.matchAll(/\/\*([\s\S]*?)\*\//g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（ブロックコメント）`);
  }
  [...new Set(漏れ)].length
    ? bad(`v0.1.0 の配信物に、こちらの作業メモが載っている: ${[...new Set(漏れ)].join(" ／ ")}（⚠ 理由は public-next/README.md か ADR に置く）`)
    : ok("v0.1.0 の配信物に、こちらの作業メモが載っていない");

  // ---- ⚠ ③ β 版へ戻る道が、⚠ 1 本だけ残っているか ----
  // ⚠ **「いま見られるのは β」だと言えないと、⚠ 空の器を見せられた人が行き先を失う**
  //   （`CLAUDE.md` §4-1: ⚠ **できないことを言うなら、⚠ 代わりにできることを添える**）。
  const 本文 = files.filter((f) => f.endsWith(".html")).map((f) => readFileSync(f, "utf8")).join("\n");
  /konjaku\.hidetzu\.work/.test(本文)
    ? ok("v0.1.0 の器から、β 版へ戻れる")
    : warn("v0.1.0 の器に、β 版への行き先が無い（⚠ 空の器を見せられた人の行き場が無い）");
  }
}
