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
import { readdirSync } from "node:fs";
import { join, extname } from "node:path";
// ⚠ **計測の置き場所は `.claude/telemetry-dir.mjs` の 1 か所**（2026-08-24 に寄せた）。
//   ⚠ **ここで字を持ち直さない。**
import { TELEMETRY_DIR_NAME } from "../../.claude/telemetry-dir.mjs";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const PUB = join(ROOT, "public");

// ⚠ **本番の住所**（⚠ 2 か所以上が見るのでここに置く。2026-08-24）。
//   ⚠ OGP の `og:url` と、⚠ 外部リンクの「外かどうか」の判定が、⚠ 同じ値を見る。
export const SITE = "https://konjaku.hidetzu.work";

// ---------- 歩く先 ----------
// ⚠ **`.claude/` を歩くのは、⚠ ここ 1 か所**（2026-08-26。hidetzu/konjaku#276）。
//
// ⚠ **飛ばす先が 2 つある。**⚠ **どちらも「この repo の中にあるが、⚠ この repo ではない」もの。**
//     worktrees   ⚠ **別セッションの作業場所。**⚠ 中身は ⚠ **この repo の別の版そのもの**
//     telemetry   ⚠ **手元の作業の記録。**⚠ git の外で、⚠ **作業のたびに増える**
//
// ⚠ **歩くと落ちるのではない。**⚠ **数が静かに変わる。**⚠ **こちらのほうが危ない。**
//   ⚠ **実測（2026-08-26・`main` = `00ee43b`・⚠ worktree を 1 本置いただけ）**:
//       文書の `npm run` は全部実在する（ 61 ファイル）  →（128 ファイル）
//       文書どうしのリンクは全部生きている（58 / 141 本）→（122 / 304 本）
//   ⚠ **CI に worktree は無い。**⚠ **手元と CI で答えが変わる**（⚠ 突き合わせる人が誤解する）。
//
// ⚠ **前は `guard.mjs` だけが自分で持っていた**（2026-08-24。hidetzu/konjaku#246）。
//   ⚠ **`links.mjs` は持っていなかった。**⚠ だから ⚠ **そちらだけ数が化けた。**
//   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。⚠ **ここへ寄せる。**
const WALK_SKIP = new Set(["worktrees", TELEMETRY_DIR_NAME]);

// ⚠ **読む相手を差し替えられる形にする**（⚠ **本物に触らずに確かめるため**。`CLAUDE.md` §9）。
//   ⚠ 既定は実物。⚠ **検査は手で書いた木を渡して、⚠ 本当に飛ばしているかを見る。**
// ⚠ **読めない場所を渡されても落とさない**（⚠ `.claude` がまだ無い repo もある）。
const realEntries = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

// ⚠ **飛ばさずに全部歩く。**⚠ **`walkFiles` の中からしか呼ばない。**
const walkAll = (dir, entriesOf) => {
  const out = [];
  for (const e of entriesOf(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAll(p, entriesOf));
    else out.push(p);
  }
  return out;
};

/** `dir` の下のファイルを集める。⚠ **`WALK_SKIP` の名前は飛ばす。**
 *
 *  ⚠ **飛ばすのは、⚠ 渡した場所の直下だけ**（⚠ **`.claude/worktrees/` はそこにある**）。
 *  ⚠ **深いところの同名は飛ばさない。**⚠ **名前だけで判断を広げない**
 *    （⚠ この検査が主張してよいのは、⚠ **その 1 か所を歩いていないこと**だけ）。
 *
 *  ⚠ 返す形は、⚠ **渡した `dir` の続き**（⚠ 絶対で渡せば絶対・相対で渡せば相対）。 */
export const walkFiles = (dir, entriesOf = realEntries) => {
  const out = [];
  for (const e of entriesOf(dir)) {
    if (e.isDirectory() && WALK_SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAll(p, entriesOf));
    else out.push(p);
  }
  return out;
};

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
// ⚠ **`//` は 4 通りある。**⚠ **1 つに寄せず、⚠ 4 つとも名前を付けて置く**
//   （2026-08-24。hidetzu/konjaku#232 の Z-2。⚠ `/* */` と `<!-- -->` は 1 つずつだった）。
//
// ⚠ **実測（2026-08-24・`main` = `8071e91`。⚠ `test/check.mjs` と `test/check/*.mjs` の 25 か所）**:
//
//   12 か所  LINE_COMMENT       ⚠ 全文に当てる。⚠ 直前が `:` でないときだけ
//    6 か所  HEAD_COMMENT       ⚠ 全文に当てる。⚠ **行頭だけ**（⚠ 行末はわざと残す）
//    6 か所  dropComment        ⚠ **1 行だけ**渡す。⚠ 行頭か空白の直後だけ
//    1 か所  dropCommentOrHash  ⚠ 同上 ＋ `#`（⚠ yml 用）
//
// ⚠ **落とすものが違う。**⚠ **1 つに寄せると、⚠ 検査の主張が変わる**:
//     `a` `//` `b`（空白あり）  ⚠ LINE_COMMENT は落とす ／ ⚠ dropComment も落とす
//     `a` `//` `b`（空白なし）  ⚠ LINE_COMMENT は落とす ／ ⚠ dropComment は **残す**
//     行末のコメント            ⚠ HEAD_COMMENT だけが **残す**（⚠ わざと）
//     `a` `#` `b`               ⚠ dropCommentOrHash だけが落とす
//   ⚠ **この 4 つの違いは、⚠ `check.mjs` の見張りが実際に動かして確かめる**
//     （⚠ **1 つに寄せたら落ちる**。⚠ 説明ではなく、⚠ 動く形で残す）。
//
// ⚠ **`g` も `m` も無いのは、⚠ 書き忘れではなかった**（2026-08-24。⚠ **7 か所すべてを読んだ**）。
//   ⚠ **7 か所とも `split` してから 1 行ずつ渡していた。**
//   ⚠ **1 行なら `m` は要らず、⚠ 行末まで食べるので `g` も要らない。**
//   ⚠ **ただし、⚠ その前提は字面から読めない**（⚠ 実測 2026-08-24: ⚠ 全文に当てると
//     ⚠ **最後の 1 行しか落ちない**。⚠ `$` が入力の末尾にしか当たらないため）。
//     ⚠ **落ちない。**⚠ **手前の行のコメントが残り、⚠ 検査が自分の説明を拾うようになるだけ。**
//   ⚠ **だから、⚠ この 2 つだけ関数にする。**⚠ **「1 行を受け取る」を、⚠ 引数で言う。**
//
// ⚠ **`https://` を壊さない形であることは、⚠ `check.mjs` の見張りが見る。**

// ⚠ **`.replace()` だけに使う。**⚠ **`.test()` や `.exec()` に使わない。**
//   ⚠ **`g` が付いているので `lastIndex` が残り、⚠ 2 回目の `.test()` が false になる**
//     （⚠ 実測: `const RE=/x/g; RE.test("axa")` → `true`, `false`）。
//   ⚠ **`.replace()` は毎回 `lastIndex` を 0 に戻すので安全。**
//   ⚠ **この決まりは、⚠ `check.mjs` の見張りが機械で見る**（⚠ 人の記憶に頼らない）。

/** ⚠ JS のブロックコメント。⚠ **`.replace(BLOCK_COMMENT, " ")` の形だけで使う。** */
export const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/** ⚠ HTML のコメント。⚠ **`.replace(HTML_COMMENT, " ")` の形だけで使う。** */
export const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** ⚠ 行コメント。⚠ **全文に当てる。**⚠ 直前が `:` でないときだけ落とす（⚠ `https://` を守る）。
 *  ⚠ **`.replace(LINE_COMMENT, "$1")` の形だけで使う**（⚠ 直前の 1 文字を食べるので、⚠ `$1` で戻す）。 */
export const LINE_COMMENT = /(^|[^:])\/\/[^\n]*/g;

/** ⚠ 行頭の行コメント。⚠ **全文に当てる。**⚠ **行末のコメントはわざと残す。**
 *  ⚠ **`.replace(HEAD_COMMENT, ...)` の形だけで使う。** */
export const HEAD_COMMENT = /^\s*\/\/.*$/gm;

/** ⚠ **1 行だけ**受け取り、⚠ 行頭か空白の直後の `//` から先を落とす。
 *  ⚠ **全文を渡さない**（⚠ **最後の 1 行しか落ちない**）。⚠ 呼ぶ側は `split` してから `map` で渡す。 */
export const dropComment = (line) => line.replace(/(^|\s)\/\/.*$/, "");

/** ⚠ `dropComment` に `#` を足したもの（⚠ yml）。⚠ **1 行だけ**受け取る。 */
export const dropCommentOrHash = (line) => line.replace(/(^|\s)(\/\/|#).*$/, "");

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

// ---------- コメントを落とした本文（`seen`） ----------
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 19 本目）。⚠ **1 文字も変えていない。**
//
// ⚠ **なぜ道具へ出したか**（⚠ 実測 2026-08-24）:
//   ⚠ **節 9 の 25 塊のうち 18 塊が `seen` / `seenTop` に触っている。**
//   ⚠ **道具がこの節の中にある限り、⚠ 18 塊は 1 つも外へ出せない。**
//
// ⚠ **`src` / `TOP` / `pageSrc` と同じ「読む先」**。⚠ 違いは ⚠ **コメントを落としてあること。**
//   ⚠ **落とさないと、⚠ 検査が自分の説明を拾う**（`CLAUDE.md` §5。⚠ この repo で 4 回以上）。
//
// ⚠ **`torn` は `stripJs` の副作用で溜まる。**⚠ **道具と一緒に動かすしかない**
//   （⚠ 「コメント落としが取り違えていない」がそれを見ている）。
//   ⚠ **その判定は `check.mjs` の「0. 数え方そのもの」へ移した**（⚠ 検査の道具そのものの健全性）。

// ⚠ **コメントを先に落とす。** 落とさないと、この棚卸しを説明するコメント自身を数える
//   （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」。2 回踏んでいる）。
//   実測（2026-08-17）: 落とさないと index.html の「直読み」は 3 件見えるが、
//   3 件とも CSS と JS のコメントで、**画面には 1 件も出ていない**。
//
// ⚠ 7 節にも JS を舐める実装があるが、答えている問いが違う
//   （あちら「テンプレートの ${…} に何が入るか」／こちら「コメントを消した本文」）。
const REGEX_OK = /[(,=:[!&|?{};+\-*%~^<>]$/;
export const torn = [];        // 改行をまたいだ引用符＝取り違えの証拠（下で 0 件を確かめる）
// ⚠ テンプレート文字列の `${…}` は入れ子になる。追わないと、穴の中の ` で
//   テンプレートが終わったことにして、そこから先が全部ずれる
//   （実測: peel3d.js の pickCard() で起き、L519 以降のコメントが 1 つも落ちなかった）。
export const stripJs = (s, file) => {
  const n = s.length;
  let out = "", i = 0, braces = 0, inTpl = false;
  const holes = [];
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (inTpl) {
      if (c === "\\") { out += s.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { out += c; i++; inTpl = false; continue; }
      if (c === "$" && d === "{") { out += "${"; i += 2; holes.push(braces); braces = 0; inTpl = false; continue; }
      out += c; i++; continue;
    }
    if (c === "/" && d === "*") { const e = s.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; out += " "; continue; }
    if (c === "/" && d === "/") { const e = s.indexOf("\n", i); i = e < 0 ? n : e; out += " "; continue; }
    if (c === '"' || c === "'") {
      const q = c, st = i; out += c; i++;
      while (i < n) {
        if (s[i] === "\\") { out += s.slice(i, i + 2); i += 2; continue; }
        out += s[i];
        if (s[i] === q) { i++; break; }
        i++;
      }
      if (s.slice(st, i).includes("\n")) torn.push(`${file}「${s.slice(st, i).split("\n")[0].slice(0, 40)}…」`);
      continue;
    }
    if (c === "`") { out += c; i++; inTpl = true; continue; }
    if (c === "{") { braces++; out += c; i++; continue; }
    if (c === "}") {
      if (braces === 0 && holes.length) { out += c; i++; braces = holes.pop(); inTpl = true; continue; }
      if (braces > 0) braces--;
      out += c; i++; continue;
    }
    // 正規表現リテラルは飛ばす。飛ばさないと `/"/g` の " から先を文字列と読む
    if (c === "/" && REGEX_OK.test(out.replace(/\s+$/, ""))) {
      let j = i + 1, cls = false, done = -1;
      while (j < n) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === "[") cls = true;
        else if (s[j] === "]") cls = false;
        else if (s[j] === "\n") break;
        else if (s[j] === "/" && !cls) { done = j; break; }
        j++;
      }
      if (done > 0) { out += s.slice(i, done + 1); i = done + 1; continue; }
    }
    out += c; i++;
  }
  return out;
};
// ⚠ HTML の本文に JS の物差しを当てない。`</a>` の `/` の前は `<` で、
//   正規表現リテラルの始まりに見える。当てたときは、そこから次の `/` までを飲み込み、
//   出典欄のリンク（index.html:831 付近）が丸ごと消えた（実測 2026-08-17）。
const stripHtml = (s, file) => s
  .replace(HTML_COMMENT, " ")
  .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a, body, b) => a + body.replace(BLOCK_COMMENT, " ") + b)
  .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, a, body, b) => a + stripJs(body, file) + b);

// ⚠ **`.js` でも HTML コメントを落とす**（2026-08-24。⚠ **実際に踏んだ**）。
//   ⚠ この repo の JS は、⚠ **テンプレートリテラルの中に HTML を書く。**
//     ⚠ そこには `<!-- -->` のコメントも入る。
//   ⚠ **`.html` 側は `stripHtml` が先に落としていた**が、⚠ **`.js` 側は素通りだった。**
//   ⚠ `index.html` の JS を `top.js` へ出したとき、⚠ **その穴が表に出た**
//     （⚠ 「一度消した語が戻っている」が、⚠ **説明のコメントを拾って落ちた**）。
//   ⚠ **`peel3d.js` にも同じ穴があった**（⚠ たまたま引っかかる語が無かっただけ）。
//   ⚠ **`CLAUDE.md` §5: 検査が文書やコメントを読むとき、⚠ コメントを先に落とす。**
const dropHtmlComments = (t) => t.replace(HTML_COMMENT, " ");
export const seen = {};
for (const f of [...htmlFiles, ...jsFiles])
  seen[f] = f.endsWith(".html") ? stripHtml(src[f], f) : dropHtmlComments(stripJs(src[f], f));

// ⚠ **トップの画面は 2 ファイル**（2026-08-24）。⚠ **JS の振る舞いを見る検査はこちら。**
//   ⚠ **語の棚卸し（SCREEN_WORDS）は `seen` のまま**（⚠ 繋ぐと二重に数える）。
export const seenTop = `${seen["index.html"] ?? ""}\n${seen["top.js"] ?? ""}`;

