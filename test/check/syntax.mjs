// 静的検査 — スクリプトの構文（⚠ **壊れたまま本番へ出さない**）
//
// ⚠ **`test/check.mjs` の「1. スクリプトの構文」と「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 29 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元の「1. スクリプトの構文」301 行のうち、⚠ 構文そのものは 31 行だった**
//   （⚠ 実測 2026-08-25）。⚠ **残りは 土地の区分 ／ SW の棚 ／ 部品の境界。**
//   ⚠ **それらは別の 1 本で、⚠ 行き先へ配る。**
//
// ⚠ **ここが守っているもの**:
//     画面の中の script    ⚠ インラインが構文として通るか
//     `worker.js` ほか     ⚠ **public/ の外にも、⚠ 壊れると本番が止まるコードがある**
//     外出しした `.js`     ⚠ 壊れると HTML 側が丸ごと止まる
//     読み込み忘れ         ⚠ `<script src>` が実在するか
//     テンプレートリテラル ⚠ **中の HTML コメントにバッククォートを入れない**
//                          （⚠ **画面が丸ごと消える**。⚠ 3 回踏んでいる）
//
// ⚠ **どれも「落ちない不具合」ではない。**⚠ **落ちるほうの不具合。**
//   ⚠ **それでも素通りしていた**（⚠ `worker.js` は丸ごと無検査だった）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, bad, head, src, TOP, pageSrc, htmlFiles, jsFiles } from "./lib.mjs";

// ---------- 1. スクリプトの構文 ----------
head("1. スクリプトの構文");
for (const f of htmlFiles) {
  const blocks = [...src[f].matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  let bads = 0;
  for (const [, code] of blocks) {
    try { new (async () => {}).constructor(code); }
    catch (e) { bads++; bad(`${f}: ${e.message}`); }
  }
  if (!bads) ok(`${f}（${blocks.length} ブロック）`);
}
// ⚠ public/ の外にも、壊れると本番が止まるコードがある。
//   worker.js（計測の受け口）に構文エラーを入れても「問題なし」で通っていた。
//   あとから足したサーバ側が、丸ごと無検査だった。
// ⚠ **`serve.js` は `scripts/serve.mjs` へ移した**（2026-08-22。Owner 判断）。
for (const f of ["worker.js", "scripts/serve.mjs"]) {
  // ESM も import も含むので、Function で包むのではなく node 自身に読ませる
  try { execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" }); ok(f); }
  catch (e) { bad(`${f}: ${String(e.stderr ?? e.message).split("\n").slice(0, 3).join(" ")}`); }
}
// 外出しした .js（verify.js / places.js）。壊れると HTML 側が丸ごと止まるのに、
// インラインしか見ていなかったので素通りしていた
for (const f of jsFiles) {
  try { new (async () => {}).constructor(src[f]); ok(f); }
  catch (e) { bad(`${f}: ${e.message}`); }
}
// 読み込み忘れの検知。places.js は index.html の検索が依存している
for (const f of htmlFiles) {
  const needs = [...pageSrc(f).matchAll(/\b(KonjakuPlaces|Konjaku)\./g)].map((m) => m[1]);
  const wants = new Set(needs.map((n) => (n === "KonjakuPlaces" ? "places.js" : "verify.js")));
  for (const w of wants)
    src[f].includes(`src="./${w}"`) ? ok(`${f} → ${w}`) : bad(`${f}: ${w} を読み込んでいない`);
}

{
  // ⚠ **テンプレートリテラルの中に書いた HTML コメントに、バッククォートを入れない。**
  //   バッククォートはそこで文字列を終わらせるので、続きが JS として読まれる。
  //   3 回踏んでいる（2026-08-17 に 2 回）。最後は「⚠ 中身は 〈backtick〉<i>〈backtick〉 だけ
  //   差し替える」というコメントで `i is not defined` になり、帯・判定・写真が丸ごと消えた。
  //   ⚠ 実描画は捕まえるが、それは画面を開いてからで、しかも**全部が落ちる**ので原因が遠い。
  //     ここで、書いた瞬間に落とす。
  // ⚠ **生の中身を見る。** `seen` は HTML コメントを落としたあとなので、
  //   そこを見ても一生見つからない（最初そう書いて、わざと壊しても緑のままだった）。
  const raw = TOP;
  // ⚠ <script> の中だけを見る。CSS や本文の HTML コメントは、
  //   バッククォートがあっても壊れない（文字列の中にいない）。
  const scripts = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const bad2 = [...scripts.matchAll(/<!--[\s\S]*?-->/g)]
    .filter((m) => m[0].includes("`"))
    .map((m) => m[0].replace(/\s+/g, " ").slice(0, 70));
  bad2.length === 0
    ? ok("テンプレートリテラル内の HTML コメントに、バッククォートが無い")
    : bad(`HTML コメントにバッククォートがある（文字列がそこで切れる）: ${bad2.join(" ／ ")}`);
}

// ---------- ⚠ 見て決める材料を作る道具 ----------
// ⚠ **`scripts/visual-decision.mjs` は落ちない道具**（⚠ 検査ではない。ADR 0042）。
//   ⚠ **落ちないぶん、⚠ 引数の読み方が壊れても気づけない。**
//   ⚠ **実際に一度壊している**（⚠ `--size` を足す前、⚠ 一覧の先頭しか撮れなかった）。
//   ⚠ **道具自身の自己検査を、⚠ ここから呼ぶ**（⚠ ブラウザは立てない。⚠ 実測 40ms）。
//   ⚠ **4 幅は `.claude/skills/ui-ux-review` §0 が決めたもの。**⚠ **道具側で増やしていないことも見る。**
{
  const p = join(ROOT, "scripts/visual-decision.mjs");
  if (!existsSync(p)) bad("scripts/visual-decision.mjs が無い（ADR 0042 の道具）");
  else {
    try {
      const out = execFileSync(process.execPath, [p, "--selftest"], { encoding: "utf8", timeout: 20000 });
      ok(`見て決める材料の道具は、引数を正しく読む（${out.trim().replace(/^✓ /, "")}）`);
    } catch (e) {
      // ⚠ **理由を出す。**⚠ **`stdout` だけ見て空になった**（2026-08-28。⚠ CI で実際に踏んだ）。
      //   ⚠ **読み込みで落ちると、⚠ 中身は `stderr` に出る**（⚠ `playwright` が無いジョブがある）。
      // ⚠ **手元の絶対パスを出さない**（⚠ CI のログは誰でも読める。`CLAUDE.md` §8-1）
      const why = [e.stdout, e.stderr, e.message].map((x) => String(x ?? "").trim())
        .filter(Boolean).join(" ／ ").replace(/\s+/g, " ")
        .replaceAll(ROOT, "<repo>").replace(/\/(home|Users)\/[^\s"']+/g, "<path>")
        .slice(0, 220);
      bad(`見て決める材料の道具の自己検査が落ちた: ${why || "（理由が出ていない）"}`);
    }
  }
}

// ---------- ⚠ 改善候補を出す道具 ----------
// ⚠ **`.claude/tools/improvement.mjs` も落ちない道具**（⚠ 検査ではない。ADR 0044）。
//   ⚠ **落ちないぶん、⚠ 判定が壊れても気づけない。**
//   ⚠ **判定は道具の中で 1 つの関数になっており、⚠ 自己検査はそれを呼ぶ**
//     （⚠ **写すと素通りする。**⚠ **実際に踏んだ**: 2026-08-28。⚠ 本体を壊しても緑だった）。
//   ⚠ **`gh` を叩かない。**⚠ **ネットに触らない**（⚠ 実測 21ms）。
{
  const p = join(ROOT, ".claude/tools/improvement.mjs");
  if (!existsSync(p)) bad(".claude/tools/improvement.mjs が無い（ADR 0044 の道具）");
  else {
    try {
      const out = execFileSync(process.execPath, [p, "--selftest"], { encoding: "utf8", timeout: 20000 });
      ok(`改善候補を出す道具の判定は生きている（${out.trim().replace(/^✓ /, "")}）`);
    } catch (e) {
      // ⚠ **手元の絶対パスを出さない**（`CLAUDE.md` §8-1）
      const why = [e.stdout, e.stderr, e.message].map((x) => String(x ?? "").trim())
        .filter(Boolean).join(" ／ ").replace(/\s+/g, " ")
        .replaceAll(ROOT, "<repo>").replace(/\/(home|Users)\/[^\s"']+/g, "<path>")
        .slice(0, 220);
      bad(`改善候補を出す道具の自己検査が落ちた: ${why || "（理由が出ていない）"}`);
    }
  }
}

// ---------- ⚠ 端末をまたぐときの大きさを測る走者 ----------
// ⚠ **`scripts/handoff-size.mjs` は落ちない走者**（⚠ 検査ではない。ADR 0048）。
//   ⚠ **ADR 0048 が、⚠ この走者の出力を根拠にしている**
//     （⚠ 「50 件までは URL に収まる」＝ ⚠ **サーバも識別子も要らない**、という判断）。
//   ⚠ **壊れたら、⚠ ADR の根拠が黙って変わる。**
//   ⚠ **数字は ADR に書き写していない。**⚠ **走らせて出す**（`CLAUDE.md` §6）。
//   ⚠ **最初、⚠ 同じ記録を 50 件並べて測っていた**（⚠ 圧縮が効きすぎて 170 文字になった）。
//     ⚠ **自己検査は、⚠ そこも見る。**
{
  const p = join(ROOT, "scripts/handoff-size.mjs");
  if (!existsSync(p)) bad("scripts/handoff-size.mjs が無い（ADR 0048 の走者）");
  else {
    try {
      const out = execFileSync(process.execPath, [p, "--selftest"], { encoding: "utf8", timeout: 20000 });
      ok(`端末をまたぐ大きさの走者は生きている（${out.trim().replace(/^✓ /, "")}）`);
    } catch (e) {
      // ⚠ **手元の絶対パスを出さない**（`CLAUDE.md` §8-1）
      const why = [e.stdout, e.stderr, e.message].map((x) => String(x ?? "").trim())
        .filter(Boolean).join(" ／ ").replace(/\s+/g, " ")
        .replaceAll(ROOT, "<repo>").replace(/\/(home|Users)\/[^\s"']+/g, "<path>")
        .slice(0, 220);
      bad(`端末をまたぐ大きさの走者の自己検査が落ちた: ${why || "（理由が出ていない）"}`);
    }
  }
}

// ---------- ⚠ 点をどれだけ配っているかを測る走者 ----------
// ⚠ **`scripts/pin-density.mjs` は落ちない走者**（⚠ 検査ではない。ADR 0049）。
//   ⚠ **ADR 0049 が「情報がある場所にピンを出す」を前提にしている。**
//   ⚠ **その前提が成り立つ範囲を、⚠ この走者が数字にする。**
//   ⚠ **点（Wikidata の `ev/`）と面（土地条件・低湿地）は、⚠ 配っている範囲がまるで違う。**
//   ⚠ **広がったら落ちる**（⚠ 5% を超えたら ADR を見直す合図。⚠ **落ちるのが正しい**）。
{
  const p = join(ROOT, "scripts/pin-density.mjs");
  if (!existsSync(p)) bad("scripts/pin-density.mjs が無い（ADR 0049 の走者）");
  else {
    try {
      const out = execFileSync(process.execPath, [p, "--selftest"], { encoding: "utf8", timeout: 20000 });
      ok(`点をどれだけ配っているかの走者は生きている（${out.trim().replace(/^✓ /, "")}）`);
    } catch (e) {
      // ⚠ **手元の絶対パスを出さない**（`CLAUDE.md` §8-1）
      const why = [e.stdout, e.stderr, e.message].map((x) => String(x ?? "").trim())
        .filter(Boolean).join(" ／ ").replace(/\s+/g, " ")
        .replaceAll(ROOT, "<repo>").replace(/\/(home|Users)\/[^\s"']+/g, "<path>")
        .slice(0, 220);
      bad(`点をどれだけ配っているかの走者の自己検査が落ちた: ${why || "（理由が出ていない）"}`);
    }
  }
}
