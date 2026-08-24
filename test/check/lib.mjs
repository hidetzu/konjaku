// 静的検査の道具（⚠ **数え方と、⚠ 読む先**）
//
// ⚠ **`test/check.mjs` から出しただけ**（2026-08-24。hidetzu/konjaku#232 の 1 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **検査の節は 1 つも動かしていない。**
//   ⚠ **道具の移設と節の移設を同時にやらない**（`.claude/rules/components.md`）。
//     ⚠ 同時にやると、⚠ **判定の字が変わったときに原因が分からなくなる。**
//
// ⚠ **`test/render/lib.mjs` と対になる置き方。**⚠ 新しい流儀を作らない。
//
// ⚠ **なぜ出したか**（実測 2026-08-24・`main` = `baa3749`）:
//   ⚠ `check.mjs` は 5978 行・21 節。⚠ **節番号が「いつ足したか」しか表していない**
//     （⚠ `6` のあとに `2.7 2.8 2.6`、⚠ `2.6` が 2 回、⚠ 最後は番号無し）。
//   ⚠ **節を出すには、⚠ どの節も使う道具を先に出す必要がある。**
//     ⚠ `ok` 241 回 ／ `bad` 311 回 ／ `src` 154 回 ／ `ROOT` 73 回 ／ `PUB` 59 回。
//
// ⚠ **特定の節しか使わないものは出していない**（`gsiSearchUrl` / `evCovered` /
//   `SITE` / `CHECK_LINKS` / `NEW_LINKS` / `REQUIRED_CHECKS`）。
//   ⚠ **それらは、⚠ その節と一緒に動く。**

import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const PUB = join(ROOT, "public");

// ⚠ **本番の住所**（⚠ 2 か所以上が見るのでここに置く。2026-08-24）。
//   ⚠ OGP の `og:url` と、⚠ 外部リンクの「外かどうか」の判定が、⚠ 同じ値を見る。
export const SITE = "https://konjaku.hidetzu.work";

// ---------- コメントを落とす ----------
// ⚠ **検査が文書やコードを読むときは、⚠ コメントを先に落とす**（`CLAUDE.md` §5）。
//   ⚠ **落とさないと、⚠ その検査を説明したコメントの字面を、⚠ 検査自身が拾う。**
//   ⚠ **この repo では 4 回以上踏んでいる。**
//
// ⚠ **同じ正規表現が 45 か所にコピーされていた**（⚠ 実測 2026-08-24）。
//   ⚠ **1 か所にする。**⚠ **`.replace(X, " ")` の形は変えない**（⚠ チェーンの途中で使われている）。
//
// ⚠ **置き換え先は空白 1 つ。**⚠ **空文字にしない**（2026-08-24。⚠ **実証した**）。
//   ⚠ **空文字で消すと、⚠ コメントの前後がくっついて、⚠ 無かった語ができる。**
//
//   ⚠ 実証 ①（`/* */`）: ⚠ `sw.js` の SHELL に `"/vendor/mapli/*x*/bre-gl.js"` を仕込む
//       ⚠ `""`  → ✗ 「SHELL に maplibre が入っている」と落ちた   ⚠ **偽陽性**
//       ⚠ `" "` → ✓ 通った                                       ⚠ 正しい
//
//   ⚠ 実証 ②（`<!-- -->`）: ⚠ `index.html` に `この土地には<!-- x -->残っていません` を仕込む
//       ⚠ `""`  → ✗ 「べた書きされている」と落ちた                ⚠ **偽陽性**
//       ⚠ `" "` → ✓ 通った                                       ⚠ 正しい
//
//   ⚠ **ブラウザと JS はコメントを「区切り」として扱う。**⚠ `" "` が実物に近い。
//   ⚠ **本物の一致は減らない**（⚠ 46 か所を替えても、⚠ 判定の字は 1 行も変わらなかった）。
//
// ⚠ **`//` はここに置かない。**⚠ **4 通りの意味があり、⚠ 寄せるには「どれが正か」を決める話になる**
//   （⚠ 行頭だけ／空白の直後だけ／`g` も `m` も無い／`#` も落とす）。
//   ⚠ **`https://` を壊さない形であることは、⚠ `check.mjs` の見張りが見る。**

// ⚠ **`.replace()` だけに使う。**⚠ **`.test()` や `.exec()` に使わない。**
//   ⚠ **`g` が付いているので `lastIndex` が残り、⚠ 2 回目の `.test()` が false になる**
//     （⚠ 実測: `const RE=/x/g; RE.test("axa")` → `true`, `false`）。
//   ⚠ **`.replace()` は毎回 `lastIndex` を 0 に戻すので安全。**
//   ⚠ **この決まりは、⚠ `check.mjs` の見張りが機械で見る**（⚠ 人の記憶に頼らない）。

/** ⚠ JS のブロックコメント。⚠ **`.replace(BLOCK_COMMENT, " ")` の形だけで使う。** */
export const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/** ⚠ HTML のコメント。⚠ **`.replace(HTML_COMMENT, " ")` の形だけで使う。** */
export const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// ---------- 数え方 ----------
// ⚠ **数を持つのは、⚠ ここ 1 か所**（2026-08-24）。
//   ⚠ **前は `check.mjs` の module 変数だった。**⚠ 節を別ファイルへ出すと、
//     ⚠ **ファイルごとに数を持ってしまう**ので、⚠ ここへ寄せる。
//   ⚠ **名乗るのは、⚠ 全部走ったあと 1 回だけ**（`CLAUDE.md` §9。
//     ⚠ **前は途中に置いてあり、⚠ その行までの数を名乗っていた**）。
//
// ⚠ **数えるための足し算を持たない**（2026-08-24。⚠ **わざと壊して分かった**）。
//   ⚠ 別ファイルへ出した直後、⚠ **`bad` の `count.failed++` を消したら、
//     ⚠ 実際に検査が落ちているのに「問題なし」と出た。**
//   ⚠ **`check.mjs` の中に 1 行あるうちは事故りにくかったが、
//     ⚠ 出したことで「その 1 行だけが消える」道ができた。**
//   ⚠ **だから、⚠ 貯めた行を数える。**⚠ **足し算を消す、という壊し方が無くなる**
//     （⚠ 消すと「何が落ちたか」も消えるので、⚠ 黙って通ることはない）。
//
// ⚠ **工場にしてある。**⚠ **検査が、⚠ 本物に触らずに確かめられるようにするため**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
export const makeReport = (print = console.log) => {
  const lines = { passed: [], failed: [], warned: [] };
  const emit = (kind, mark, m) => { lines[kind].push(m); print(`  ${mark} ${m}`); };
  return {
    ok:   (m) => emit("passed", "\x1b[32m✓\x1b[0m", m),
    bad:  (m) => emit("failed", "\x1b[31m✗\x1b[0m", m),
    warn: (m) => emit("warned", "\x1b[33m!\x1b[0m", m),
    head: (m) => print(`\n\x1b[1m${m}\x1b[0m`),
    // ⚠ **貯めた行の数がそのまま件数。**⚠ 別に数えていない。
    tally: () => ({ passed: lines.passed.length,
                    failed: lines.failed.length,
                    warned: lines.warned.length }),
    // ⚠ **落ちた理由を読み出せる**（⚠ 数だけでなく、⚠ 中身も持っている証拠）
    reasons: () => [...lines.failed],
  };
};

const report = makeReport();
export const ok = report.ok;
export const bad = report.bad;
export const warn = report.warn;
export const head = report.head;
export const tally = report.tally;

// ---------- 読む先 ----------
// ⚠ **`public/` を 1 回だけ読む。**⚠ 節ごとに読み直さない。
const pubFiles = await readdir(PUB);
export const htmlFiles = pubFiles.filter((f) => extname(f) === ".html");
export const jsFiles = pubFiles.filter((f) => extname(f) === ".js");
export const src = {};
for (const f of [...htmlFiles, ...jsFiles]) src[f] = await readFile(join(PUB, f), "utf8");

// ⚠ **トップの画面は 2 ファイルに分かれた**（2026-08-24。hidetzu/konjaku#231）。
//   ⚠ `index.html` … HTML と CSS ／ ⚠ `top.js` … JavaScript（⚠ 逐語で出しただけ）
//   ⚠ **`/peel` は前からこの形**（`peel.html` ↔ `peel3d.js`）。⚠ **トップが取り残されていた。**
//
// ⚠ **どちらを見るかは、⚠ 検査ごとに違う。**
//   ⚠ DOM や CSS を見る検査 → `src["index.html"]`
//   ⚠ **JS の振る舞いを見る検査 → `TOP`**
//
// ⚠ **`TOP` は 2 つを繋いだもの。**⚠ 利用者から見れば 1 つの画面なので、
//   ⚠ 「トップがこの言葉を使っているか」は、⚠ **どちらにあっても同じ意味。**
// ⚠ **繋ぎ目に印を入れる**（⚠ 跨いだ一致が起きたとき、⚠ 気づけるように）。
export const TOP = `${src["index.html"] ?? ""}\n/* ==== top.js ==== */\n${src["top.js"] ?? ""}`;

// ⚠ **画面 = HTML ＋ その画面の JS**（2026-08-24。⚠ **実際に踏んだ**）。
//   ⚠ トップの JS を `top.js` へ出したとき、⚠ **`index.html` から `KonjakuPlaces.` が消えた。**
//   ⚠ **`src="./places.js"` は残っているのに、⚠ 検査が何も確かめなくなった**
//     （⚠ 落ちない。⚠ **確かめる相手が居なくなるだけなので気づけない**）。
export const PAGE_JS = { "index.html": "top.js", "peel.html": "peel3d.js" };
export const pageSrc = (f) => `${src[f] ?? ""}\n${src[PAGE_JS[f]] ?? ""}`;
