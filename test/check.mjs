// PR ごとに走らせる自動検査。
//
// 人が見るべきは「面白いか」だけにしたい。機械で確かめられることは機械に任せる。
// ここに入れているのは、すべて実際に踏んだ事故の再発防止:
//
//   1. 構文エラー                  … 壊れたまま本番へ出る
//   2. assets.directory が "."     … node_modules ごと上げてデプロイが落ちた
//   3. .html 参照                  … 本番は拡張子なしへ307転送される
//   4. 自己参照リンク              … 「年代を切り替えて見る」が自分自身を指していた
//   5. リンク切れ                  … 403 / 404 のURLを載せていた
//   6. 出典表記の欠落              … 地理院・OSM は表示が条件
//   7. OGP の欠落・ドメイン誤り    … 共有されないとループが閉じない
//   8. 事前計算データの索引切れ    … 黙って実行時 Overpass に落ち、作品が本番で成立しなくなる
//   9. Service Worker の版が古い   … 中身を変えても、一度来た人に古い画面が出続ける
//  10. 内部語が画面に出る          … 「自前・根拠あり」「直読み」が、説明なしで画面に出ていた
//
// 実行: node scripts/check.mjs        （--links を付けると外部URLも検査する）

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION_RE, hashOf, readSw } from "../scripts/sw-hash.mjs";
import { VERSION as BL_VERSION, unpack as blUnpack } from "../scripts/bl-format.mjs";
// ⚠ **数え方と読む先は `test/check/lib.mjs` の 1 か所**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **節を別ファイルへ出すには、⚠ どの節も使う道具を先に出す必要がある。**
//   ⚠ **`test/render/lib.mjs` と対になる置き方。**
import { ROOT, PUB, SITE, ok, bad, warn, head, tally, makeReport, dropComment, dropCommentOrHash,
         htmlFiles, jsFiles, src, TOP, PAGE_JS, pageSrc, seen, seenTop, torn, stripJs,
         BLOCK_COMMENT, HTML_COMMENT, LINE_COMMENT, HEAD_COMMENT } from "./check/lib.mjs";

// ⚠ **出した節の一覧**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **順番はここで決める。**⚠ **`readdir` の順に任せない**
//     （⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//   ⚠ **読み込むのは、⚠ 元の節があった位置**（⚠ 下のほう）。⚠ **並びを変えないため。**
//   ⚠ **漏れが無いことは「0. 数え方そのもの」が見る**（⚠ `test/check/` を実際に読む）。
const PARTS = ["links.mjs", "style.mjs", "motion.mjs", "land.mjs", "place.mjs", "era.mjs", "words.mjs", "roles.mjs", "vocab.mjs", "data.mjs", "privacy.mjs", "credit.mjs", "claim.mjs", "answer.mjs", "guard.mjs", "eval.mjs", "safety.mjs", "deliver.mjs", "docs.mjs"];

// ⚠ **住所検索の口は `public/gsi-address-search.js` の1か所**（hidetzu/konjaku#181）。
//   ⚠ **この検査も写さない。**⚠ 本番の口に URL を組み立てさせて借りる。
const gsiSearchUrl = (q) => {
  const win = {};
  new Function("window", "module", readFileSync(new URL("../public/gsi-address-search.js",
    import.meta.url), "utf8"))(win, undefined);
  let seen = "";
  win.KonjakuGsiAddressSearch.createGsiAddressSearch({
    fetch: (u) => { seen = u; return Promise.resolve({ ok: true, json: async () => [] }); },
  }).search(q);
  return seen;
};



// ---------- 0. 数え方そのもの ----------
// ⚠ **この検査が壊れると、⚠ 全部の検査が黙って通る**（2026-08-24。⚠ **実際に起こした**）。
//   ⚠ `test/check/lib.mjs` を別ファイルへ出した直後、⚠ **`bad` が数えない形に壊したら、
//     ⚠ 検査が落ちているのに「問題なし」と出た。**
//   ⚠ **数える処理が 1 行で消せるうちは、⚠ 誰も捕まえられない。**
//
// ⚠ **本物には触らない。**⚠ **工場で新しく作って、⚠ 別の道で確かめる**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
head("0. 数え方そのもの");
{
  const fails = [];
  const yes = (c, what) => { if (!c) fails.push(what); };
  const said = [];
  const r = makeReport((m) => said.push(m));
  r.ok("a"); r.ok("b"); r.bad("x"); r.warn("w"); r.head("h");
  const t = r.tally();
  yes(t.passed === 2, `通った数が合わない: ${t.passed}`);
  yes(t.failed === 1, `落ちた数が合わない: ${t.failed}`);
  yes(t.warned === 1, `警告の数が合わない: ${t.warned}`);
  // ⚠ **落ちた理由を持っていること**（⚠ 数だけ持つ形に戻っていない証拠）
  yes(r.reasons().join() === "x", `落ちた理由を持っていない: ${JSON.stringify(r.reasons())}`);
  // ⚠ **印字と数が 1 対 1**（⚠ 片方だけ消えていない）
  yes(said.length === 5, `印字した行が合わない: ${said.length}`);
  yes(said.filter((m) => /✓/.test(m)).length === 2, "✓ の印が合わない");
  yes(said.filter((m) => /✗/.test(m)).length === 1, "✗ の印が合わない");
  // ⚠ **作るたびに別**（⚠ 貯めた行を共有していない）
  const r2 = makeReport(() => {});
  yes(r2.tally().passed === 0, "新しく作ったのに数が引き継がれている");
  // ⚠ **本物の数は、⚠ ここまでで 0 件でないこと**（⚠ 走者が生きている証拠）
  //   ⚠ この節はいちばん最初なので、⚠ **まだ 0**。⚠ だから見ない。
  // ⚠ **`bad()` で落とさない**（2026-08-24。⚠ **実際に素通りさせた**）。
  //   ⚠ **`bad` が壊れているとき、⚠ `bad` を使う検査では捕まえられない**（⚠ 自己参照）。
  //   ⚠ 実測: ⚠ `bad` を「印字するが貯めない」形にしたら、
  //     ⚠ **この節が落ちたのに、⚠ 走者は「問題なし」で終わった。**
  //   ⚠ **別の道で落とす**（`CLAUDE.md` §9）。⚠ **走者ごと止める。**
  //   ⚠ **汚い落ち方でよい。**⚠ ここが壊れているなら、⚠ **他の検査は全部信用できない。**
  if (fails.length) {
    console.log(`  \x1b[31m✗\x1b[0m 数え方が壊れている（${fails.length} 件）: ${fails.join(" / ")}`);
    console.log(`\n\x1b[31m⚠ 検査の数え方そのものが壊れています。`
      + `ここが壊れていると、⚠ すべての検査が黙って通ります。\x1b[0m`);
    process.exit(1);
  }
  ok("数え方は、貯めた行を数えている（印字と 1 対 1・作るたびに別・理由を持つ）");

  // ⚠ **検査が `https://` を巻き込む形でコメントを落としていないか**（2026-08-24）。
  //   ⚠ **`//` を素で落とすと、⚠ `https://` の `//` から先が全部消える。**
  //   ⚠ **落ちない。**⚠ **その行の残りが、⚠ 静かに検査の目から消えるだけ。**
  //
  // ⚠ 実証（2026-08-24）: ⚠ `test/check.mjs` の「共有された年代の 1 行」が
  //   ⚠ **URL と同じ行に書かれたべた書きを見落としていた**（⚠ URL の無い行なら落ちた）。
  //   ⚠ 実測: ⚠ **`index.html` で 1,091 文字・`peel3d.js` で 260 文字**が余分に消えていた。
  //
  // ⚠ **安全な形は `lib.mjs` の 4 つだけ**（2026-08-24。hidetzu/konjaku#232 の Z-2）。
  //   ⚠ どれも `https://` を壊さない。⚠ **落とすものは 4 つとも違う**（⚠ `lib.mjs` に書いた）。
  //     LINE_COMMENT       ⚠ 全文。⚠ 直前が `:` でないときだけ
  //     HEAD_COMMENT       ⚠ 全文。⚠ 行頭だけ
  //     dropComment        ⚠ 1 行だけ。⚠ 行頭か空白の直後だけ
  //     dropCommentOrHash  ⚠ 同上 ＋ `#`
  // ⚠ **危ない形**: ⚠ `//` の直前を見ない書き方。
  // ⚠ **直書きが `lib.mjs` の外に無いことは、⚠ この下の見張りが見る。**
  //
  // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。
  //   ⚠ **落とさないと、⚠ この説明に書いた危ない形を、⚠ この検査自身が拾う。**
  {
    const files = ["test/check.mjs", ...PARTS.map((p2) => `test/check/${p2}`)];
    const risky = [];
    for (const f of files) {
      const t = (await readFile(join(ROOT, f), "utf8").catch(() => ""))
        // ⚠ 行コメントを落としてから見る（⚠ この節の説明を拾わないため）
        .split("\n").map(dropComment).join("\n");
      // ⚠ `//` を落とす replace のうち、⚠ **直前を見ていないもの**を拾う
      for (const m of t.matchAll(/\.replace\((\/[^,]*?\\\/\\\/[^,]*?\/[a-z]*)\s*,/g)) {
        const re = m[1];
        if (/\(\^\|/.test(re) || /\/\^/.test(re)) continue;   // ⚠ 直前を見ている＝安全
        risky.push(`${f}: ${re}`);
      }
    }
    if (!files.length) bad("検査のファイルが 1 つも無い（⚠ この検査が何も見ていない）");
    else if (risky.length)
      bad(`検査が https:// を巻き込む形でコメントを落としている（${risky.length} 件）: `
        + risky.join(" / ")
        + `（⚠ その行の残りが、⚠ 静かに検査の目から消える。`
        + `⚠ 直前が \`:\` や空白でないことを見る形にする）`);
    else ok(`検査は https:// を壊さない形でコメントを落としている（${files.length} ファイル）`);
  }

  // ⚠ **共有した正規表現を、⚠ `.replace()` 以外に使っていないか**（2026-08-24）。
  //   ⚠ **`BLOCK_COMMENT` / `HTML_COMMENT` には `g` が付いている。**
  //   ⚠ **`g` 付きを `.test()` や `.exec()` に使うと、⚠ `lastIndex` が残る。**
  //     ⚠ 実測: `const RE=/x/g; RE.test("axa")` → ⚠ **`true`, `false`**（⚠ 2 回目が false）。
  //   ⚠ **`.replace()` は毎回 `lastIndex` を 0 に戻すので安全。**
  //   ⚠ **45 か所を 1 か所へ寄せたときに生まれた道**（⚠ こちらが持ち込んだ risk）。
  //   ⚠ **落ちない。**⚠ **2 回目だけ静かに通る**ので、⚠ 人が気づけない。
  {
    const files = ["test/check.mjs", ...PARTS.map((p2) => `test/check/${p2}`)];
    const misuse = [];
    for (const f of files) {
      const t = (await readFile(join(ROOT, f), "utf8").catch(() => ""))
        .split("\n").map(dropComment).join("\n");
      // ⚠ **行ごとに見る。**⚠ **この見張り自身の行を数えない**（`CLAUDE.md` §5）。
      //   ⚠ **踏んだ**（2026-08-24）: ⚠ import の続きの行と、⚠ この判定を書いた行を拾った。
      // ⚠ **名前を字として組み立てて、⚠ 自分の行に現れないようにする。**
      const NAMES = ["BLOCK", "HTML", "LINE", "HEAD"].map((x) => `${x}_COM` + "MENT");
      for (const [k, line] of t.split("\n").entries()) {
        // ⚠ import 文（⚠ 複数行に分かれる）は、⚠ `from "./lib.mjs"` までが 1 かたまり
        if (/^\s*import\b|^\s{5,}\w[\w, ]*\} from /.test(line)) continue;
        if (NAMES.some((n) => new RegExp(`["'\`]\\s*\\$\\{?${n}|${n}\\s*["'\`]`).test(line))) continue;
        for (const n of NAMES) {
          let at = line.indexOf(n);
          while (at >= 0) {
            const before = line.slice(Math.max(0, at - 12), at);
            if (!/\.replace\($/.test(before)) misuse.push(`${f}:${k + 1} ${line.trim().slice(0, 40)}`);
            at = line.indexOf(n, at + 1);
          }
        }
      }
    }
    if (!files.length) bad("検査のファイルが 1 つも無い（⚠ この検査が何も見ていない）");
    else if (misuse.length)
      bad(`共有した正規表現を .replace() 以外に使っている（${misuse.length} 件）: `
        + misuse.join(" / ")
        + `（⚠ g 付きなので lastIndex が残り、⚠ 2 回目の .test() が false になる）`);
    else ok(`共有した正規表現は .replace() だけに使われている（${files.length} ファイル）`);
  }

  // ⚠ **「//」を落とす形が、⚠ `lib.mjs` の外に直書きされていないか**（2026-08-24。
  //   hidetzu/konjaku#232 の Z-2）。⚠ **前は 25 か所にコピーされていた**（⚠ 4 通り）。
  //   ⚠ **コピーが増えると、⚠ どれが正かが分からなくなる。**
  //     ⚠ 実際に踏んだ（hidetzu/konjaku#245）: ⚠ **その 1 つが `https://` を巻き込んでいた。**
  //   ⚠ **落ちない。**⚠ **コピーが 1 つ増えるだけなので、⚠ 人が気づけない。**
  // ⚠ **上の見張りは「危ない形か」を見る。**⚠ **こちらは「1 か所か」を見る**（⚠ 別の問い）。
  //   ⚠ **`lib.mjs` は走査しない**（⚠ **そこが持ち主**。⚠ 定義は `.replace()` の形をしていない）。
  {
    const files = ["test/check.mjs", ...PARTS.map((p2) => `test/check/${p2}`)];
    const copies = [];
    for (const f of files) {
      const t = (await readFile(join(ROOT, f), "utf8").catch(() => ""))
        // ⚠ 行コメントを落としてから見る（⚠ この節の説明を拾わないため）
        .split("\n").map(dropComment).join("\n");
      for (const m of t.matchAll(/\.replace\((\/[^,]*?\\\/\\\/[^,]*?\/[a-z]*)\s*,/g))
        copies.push(`${f}: ${m[1]}`);
    }
    if (!files.length) bad("検査のファイルが 1 つも無い（⚠ この検査が何も見ていない）");
    else if (copies.length)
      bad(`「//」を落とす正規表現が、lib.mjs の外に直書きされている（${copies.length} 件）: `
        + copies.join(" / ")
        + `（⚠ lib.mjs の 4 つから借りる。⚠ コピーが増えると、⚠ どれが正か分からなくなる）`);
    else ok(`「//」を落とす形は lib.mjs から借りている（直書き 0 件・${files.length} ファイル）`);
  }

  // ⚠ **4 つは、⚠ それぞれ違うものを残しているか**（2026-08-24。hidetzu/konjaku#232 の Z-2）。
  //   ⚠ **「どれが正か」を決めた結果を、⚠ 説明ではなく、⚠ 動く形で残す。**
  //   ⚠ **1 つに寄せたら、⚠ ここが落ちる**（⚠ 寄せると、⚠ 検査の主張が変わる）。
  //   ⚠ **とくに `dropComment` は「1 行だけ」渡す前提**（⚠ 全文を渡すと、⚠ **末尾の 1 行しか落ちない**）。
  //     ⚠ **落ちない。**⚠ **手前の行が、⚠ 静かに検査の目から消えるだけ**なので、⚠ ここで固定する。
  //   ⚠ **4 つとも `https://` を守ることも、⚠ ここで一緒に見る**（hidetzu/konjaku#245）。
  {
    const P = "/" + "/";                 // ⚠ 字として組み立てる（⚠ 上の見張りが自分の行を読むので）
    // ⚠ **判定文に出す名前も、⚠ 字として組み立てる**（⚠ そのまま書くと、⚠ 上の見張りが拾う）。
    const [LC, HC] = ["LINE", "HEAD"].map((x) => `${x}_COM` + "MENT");
    const fails = [];
    let n = 0;
    const t = (name, got, want) => {
      n++;
      if (got !== want) fails.push(`${name}（得 ${JSON.stringify(got)} ／ 望 ${JSON.stringify(want)}）`);
    };

    // ⚠ ① 全文に当てる 2 つ。⚠ **行末のコメントを、⚠ 落とすか・わざと残すか**
    const two = `a ${P} b\nc ${P} d`;
    t(`${LC} が行末を落とす`, two.replace(LINE_COMMENT, "$1"), "a \nc ");
    t(`${HC} は行末を残す`, two.replace(HEAD_COMMENT, " "), two);
    t(`${HC} が行頭を落とす`, `  ${P} x\ny`.replace(HEAD_COMMENT, " "), " \ny");

    // ⚠ ② 直前に空白が要るか。⚠ **ここが LINE_COMMENT と dropComment の分かれ目**
    t("dropComment は空白の直後を落とす", dropComment(`a ${P} b`), "a");
    t("dropComment は空白なしを残す", dropComment(`a${P}b`), `a${P}b`);
    t(`${LC} は空白なしも落とす`, `a${P}b`.replace(LINE_COMMENT, "$1"), "a");

    // ⚠ ③ `#` を落とすのは 1 つだけ（⚠ yml 用）
    t("dropCommentOrHash は # も落とす", dropCommentOrHash("a # b"), "a");
    t("dropComment は # を残す", dropComment("a # b"), "a # b");

    // ⚠ ④ 1 行だけ渡す前提。⚠ **全文を渡すと、⚠ 末尾の 1 行しか落ちない**
    t("dropComment は 1 行しか落とさない", dropComment(two), `a ${P} b\nc`);

    // ⚠ ⑤ 4 つとも `https://` を壊さない
    const url = `u=https:${P}x/y`;
    t(`${LC} が URL を守る`, url.replace(LINE_COMMENT, "$1"), url);
    t(`${HC} が URL を守る`, url.replace(HEAD_COMMENT, " "), url);
    t("dropComment が URL を守る", dropComment(url), url);
    t("dropCommentOrHash が URL を守る", dropCommentOrHash(url), url);

    if (fails.length)
      bad(`コメントを落とす 4 つが、期待どおりでない（${fails.length} 件）: ` + fails.join(" / ")
        + `（⚠ 4 つは落とすものが違う。⚠ 1 つに寄せると、⚠ 検査の主張が変わる）`);
    else ok(`コメントを落とす 4 つは、それぞれ違うものを残している`
      + `（${n} 通りで確かめた・https:// は 4 つとも守る）`);
  }

  // ⚠ **コメント落としが取り違えていないか**（⚠ `lib.mjs` の `seen` を作るときの副作用を見る）。
  //   ⚠ **`test/check.mjs` の「9. 画面の言葉」から移した**（2026-08-25。hidetzu/konjaku#232 の 19 本目）。
  //   ⚠ **道具（`seen`）が `lib.mjs` へ移ったので、⚠ その健全性を見る判定もここへ。**
  //   ⚠ **この節は「検査の道具そのもの」を見る場所**（⚠ 数え方・コメント落とし・節の読み込み）。

  // この検査そのものの健全性。取り違えると、静かに数え落として緑になる
  torn.length
    ? bad(`コメント落としが取り違えている（改行をまたぐ引用符 ${torn.length} 件）: ${torn.slice(0, 3).join("、")}`
        + `（この状態では、語を数え落としても緑になる）`)
    : ok(`コメント落としが取り違えていない（改行をまたぐ引用符 0 件 / ${Object.keys(seen).length} ファイル）`);

  // ⚠ **出した節を、⚠ 1 つ残らず読み込んでいるか**（2026-08-24。⚠ **実際に起こした**）。
  //   ⚠ **読み込み忘れは落ちない。**⚠ **件数が減るだけなので、⚠ 人が数を覚えていないと気づけない。**
  //   ⚠ 実測: ⚠ `safety.mjs` の読み込みを消したら 218 → 200 件。⚠ **それでも「問題なし」。**
  // ⚠ **`test/check/` を実際に読む**（⚠ 一覧を書き写さない。⚠ **足したら自動で対象になる**）。
  //   ⚠ `lib.mjs` は道具なので、⚠ 節としては読み込まない。
  {
    const dir = join(ROOT, "test/check");
    const found = (await readdir(dir)).filter((f) => f.endsWith(".mjs") && f !== "lib.mjs").sort();
    const missing = found.filter((f) => !PARTS.includes(f));
    const ghost = PARTS.filter((f) => !found.includes(f));
    if (missing.length)
      bad(`test/check/ に、読み込んでいない節がある: ${missing.join("、")}`
        + `（⚠ 読み込み忘れは落ちない。⚠ 件数が減るだけ）`);
    else if (ghost.length)
      bad(`読み込もうとしている節が実在しない: ${ghost.join("、")}`);
    else if (!found.length)
      bad("test/check/ に節が 1 つも無い（⚠ この検査が何も見ていない）");
    else ok(`出した節 ${found.length} 件を、1 つ残らず読み込んでいる（${found.join("、")}）`);
  }
}

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

// ⚠ 判定の表を自前で持ち直していないか。
//   同じ 14区分表を verify.js / peel.html / eras.html / isekai.html の4箇所に置いていたため、
//   「通信断を『データ無し』と断定しない」を直したときに eras だけ取り残され、
//   実在するタイルについて「存在しないため判定できません」と断定し続けていた。
//   表そのものが消せない事情のあるページ（peel は自前の描画で使う）は許すが、
//   増やしたら気づけるように数を固定する。
{
  const marker = /251,\s*247,\s*176/;   // 明治期の低湿地「田」の色。表がある証拠
  // ⚠ **走査対象に、外の .js も入れる。** 以前は htmlFiles+jsFiles だけを見ていて、
  //   `build-water.js` に同じ表があることに気づけなかった（2026-08-17 に実測して寄せた）。
  // ⚠ **ルート直下から `scripts/` へ移した**（2026-08-22）。⚠ **走査から落とさない。**
  const outside = ["scripts/build-water.mjs", "scripts/check-tiles.mjs",
    "scripts/fetch-buildings.mjs", "scripts/serve.mjs"]
    .filter((f) => existsSync(join(ROOT, f)));
  const outsideSrc = Object.fromEntries(await Promise.all(
    outside.map(async (f) => [f, await readFile(join(ROOT, f), "utf8")])));
  // ⚠ **検査は `test/` へ移した**（2026-08-22。Owner 判断）。⚠ **両方を見る。**
  //   ⚠ **片方だけ見ると、⚠ 見ていないほうで静かに書き写される。**
  const codeDirs = ["scripts", "test", "test/render"];
  const codeFiles = (await Promise.all(codeDirs.map(async (d) =>
    (await readdir(join(ROOT, d)).catch(() => []))
      .filter((f) => f.endsWith(".mjs")).map((f) => `${d}/${f}`)))).flat();
  const scriptsSrc = Object.fromEntries(await Promise.all(
    codeFiles.map(async (f) => [f, await readFile(join(ROOT, f), "utf8")])));
  const all = { ...src, ...outsideSrc, ...scriptsSrc };
  const holders = Object.keys(all).filter((f) => marker.test(all[f]));
  // ⚠ **表があってよいのは swale.js だけ。** 借りる側は書き写さない
  const ALLOWED = ["swale.js"];
  const extra = holders.filter((f) => !ALLOWED.includes(f));
  extra.length
    ? bad(`明治期の 14 区分表を自前で持っている先が ${extra.length} 件ある: ${extra.join(", ")}`
        + `（public/swale.js に寄せること。分かれると片方だけ直し忘れる。`
        + `⚠ 実際 build-water.js が突き合わせから漏れていた）`)
    : ok(`明治期の 14 区分表を持つのは ${holders.join(" と ")} だけ（${Object.keys(all).length} ファイルを走査）`);

  // ⚠ 上は明治期の14色表しか数えていない。あとで足した地形分類の「水に由来する区分」の
  //   表は別物で、verify.js / share.js / index.html×2 の4箇所に複製されていた。
  //   isekai で踏んだのと同じ型なので、こちらも数を固定する。
  const wet = /["「]旧水部["」]/;
  const wetHolders = [...htmlFiles, ...jsFiles].filter((f) => wet.test(src[f]));
  const WET_MAX = 4;
  wetHolders.length > WET_MAX
    ? bad(`水に由来する区分の表が ${wetHolders.length} 箇所に増えている: ${wetHolders.join(", ")}`
        + `（verify.js から配るか、増やすならこの上限も一緒に上げて理由を書くこと）`)
    : ok(`水に由来する区分の表は ${wetHolders.length} 箇所（上限 ${WET_MAX}）`);
}

// ⚠ Service Worker が、判定に必要なものを取りこぼしていないか。
//   addAll は1件でも 404 すると install ごと reject するので、SHELL の中身は実在必須。
//   data/landform.json を足したとき SHELL に入れ忘れ、しばらく気づかなかった。
{
  const sw = src["sw.js"];
  if (!sw) { bad("sw.js が読めない"); }
  else {
    // ⚠ sw.js 全体から "/…" を拾ってはいけない。SHELL 以外のパス（タイルの判定など）まで
    //   SHELL の中身とみなして落ちる。**SHELL の配列だけ**を読む。
    const block = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw)?.[1] ?? "";
    if (!block) bad("sw.js の SHELL 配列が読めない");
    const shell = [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    // 判定が動くために要るもの。ここに足したら SHELL にも足すこと。
    // ⚠ esc.js は両ページがトップレベルで `const {esc}=KonjakuEsc` を読む。
    //   来ないと ReferenceError でページのスクリプトが丸ごと止まる（判定も検索も出ない）。
    //   esc.js を SHELL に足したとき、ここに足し忘れていた。
    //   実測（2026-08-15）: SHELL から "/esc.js" を消しても `npm run check` は
    //   「判定の依存が揃っている（10 件）」と緑で通った。
    const must = ["/", "/esc.js", "/verify.js", "/places.js", "/data/landform.json"];
    const miss = must.filter((m) => !shell.includes(m));
    miss.length ? bad(`sw.js の SHELL に入っていない: ${miss.join(", ")}`)
                : ok(`sw.js の SHELL に判定の依存が揃っている（${shell.length} 件）`);
    // SHELL に書いたものが本当に配信されるか（addAll が死ぬ条件）
    const gone = shell.filter((u) => {
      if (u === "/") return false;
      const rel = u.replace(/^\//, "");
      return !existsSync(join(PUB, rel)) && !existsSync(join(PUB, `${rel}.html`));
    });
    gone.length ? bad(`sw.js の SHELL に、配信されないものがある: ${gone.join(", ")}（addAll ごと死ぬ）`)
                : ok("sw.js の SHELL は全件が配信物にある");
  }
}

// ⚠ **判定文の根拠が、棚の対象に入っていること。**
//   「この場所は 旧水部 です」と言い切っている、その出どころ（地形分類）だけが
//   棚から漏れていた。漏れると**同じものを毎回取りに行く**（地理院タイルは
//   Cache-Control も Expires も返さない）。
//   ⚠ **`sw.js` の表を目で読んで確かめない。** verify.js が実際に使っているホストを
//     読んで突き合わせる。表に何が書いてあっても、**使っている側が入っていなければ意味がない**。
//   ⚠ 棚の対象は `public/sw.js` の TILE_HOSTS **1 か所だけ**が定義（cost.mjs はそこを読む）。
{
  const swSrc = await readFile(join(PUB, "sw.js"), "utf8");
  // ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う
  //   （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」）。
  // ⚠ **`//` を素朴に落とすと URL を食う。** `https://…` の `//` をコメント開始と読んで
  //   行末まで消してしまい、`const LFC = "https://maps.gsi.go.jp/xyz"` が空になった
  //   （2026-08-15 に実際に踏んだ。検査は「読めない」と言って落ちたので気づけた）。
  //   ⚠ **直前が `:` のときは落とさない。**
  const bare = (s) => s.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
  const m = /TILE_HOSTS\s*=\s*\[([^\]]*)\]/.exec(bare(swSrc));
  const shelf = m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
  const vf = bare(await readFile(join(PUB, "verify.js"), "utf8"));
  const lfc = /LFC\s*=\s*["']https:\/\/([^/"']+)/.exec(vf)?.[1];
  if (!shelf?.length) bad("public/sw.js の TILE_HOSTS を読めない（この検査が何も見ていない）");
  else if (!lfc) bad("verify.js から地形分類のホストを読めない（この検査が何も見ていない）");
  else if (!shelf.includes(lfc))
    bad(`判定文の根拠（${lfc}）が棚に入らない。verify.js はここから地形分類を取っている`
      + `（「旧水部です」と言い切っている、その出どころだけが毎回取り直しになる）`);
  else ok(`判定文の根拠（${lfc}）が棚に入る（棚の対象 ${shelf.length} ホスト）`);

  // ⚠ **表を見るだけでは足りない。isTile() を実際に動かす。**
  //   配列に載っていても、`isTile` の中を壊せば棚に入らない（ホストの見方でも、
  //   パスの前置きでも）。**表だけ見る検査は、壊れた実装の上でも緑になる。**
  // ⚠ 代表 URL は思いつきで書かない。**verify.js が実際に組み立てる形**から作る。
  //   でないと「検査だけが通る URL」を相手にすることになる。
  if (shelf?.length && lfc) {
    const layer = /LFC_NAT\s*=\s*["']([^"']+)/.exec(vf)?.[1];
    const shape = /\$\{LFC\}\/\$\{layer\}\/\$\{z\}\/\$\{t\.x\}\/\$\{t\.y\}\.geojson/.test(vf);
    if (!layer) bad("verify.js から地形分類の層の名前を読めない（この検査が何も見ていない）");
    else if (!shape) bad("verify.js の地形分類 URL の組み立てが変わった（代表 URL を作り直すこと）");
    else {
      const { runInNewContext } = await import("node:vm");
      // sw.js は最上位で self.addEventListener を呼ぶ。動かすためだけの器を渡す。
      const sandbox = { self: { addEventListener() {} }, location: { origin: "" } };
      let fns = null;
      try { fns = runInNewContext(`${swSrc}\n;({ isTile, tileTtl })`, sandbox, { timeout: 3000 }); }
      catch (e) { bad(`public/sw.js を動かせない: ${String(e.message).slice(0, 80)}`); }
      if (fns) {
        const real = new URL(`https://${lfc}/xyz/${layer}/16/58205/25807.geojson`);
        const cases = [
          [real, true, "判定文の根拠（地形分類）"],
          [new URL(`https://${lfc}/development/ichiran.html`), false, "同じホストだが /xyz/ でないもの"],
          // ⚠ **口を書き写さない**（2026-08-22。hidetzu/konjaku#181）。⚠ 本番の口から借りる
          [new URL(gsiSearchUrl("x")), false, "住所検索"],
          [new URL("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/16/1/1.jpg"), true, "空中写真"],
        ];
        const wrong = cases.filter(([u, want]) => fns.isTile(u) !== want)
          .map(([, want, name]) => `${name}は${want ? "入るはず" : "入らないはず"}`);
        wrong.length
          ? bad(`sw.js の isTile() の判定が違う: ${wrong.join("、")}`
              + `（表に載っていても、isTile の中を壊せば棚に入らない）`)
          : ok(`sw.js の isTile() を実際に動かして確かめた（${cases.length} 通り）`);
        // 寿命も動かして見る。地形分類は 30 日（実測で 1 年以上更新が無い）
        const D = 24 * 60 * 60 * 1000;
        fns.tileTtl(real) === 30 * D
          ? ok("地形分類の寿命は 30 日")
          : bad(`地形分類の寿命が 30 日でない: ${fns.tileTtl(real) / D} 日`);
      }
    }
  }

  // ⚠ **cost.mjs が表を写していないこと。** 写すと、片方だけ足したときに
  //   「棚に入れるもの」と「数えるもの」がずれる（実際にずれていた）。
  const costSrc = bare(await readFile(join(ROOT, "scripts/cost.mjs"), "utf8"));
  /TILE_HOSTS\s*=\s*\[/.test(costSrc)
    ? bad("scripts/cost.mjs が TILE_HOSTS を写している（public/sw.js から読むこと。写すとずれる）")
    : ok("棚の対象の定義は public/sw.js の1か所だけ（cost.mjs はそこを読む）");
}

// ⚠ **「無い」と読んでよい応答は 404 だけ**（掟: 取れなかったを「無い」と言わない）。
//   403 は「見せてもらえなかった」であって「そこにデータが無い」ではない。
//   以前は 404 と同じ absent に丸めていたため、拒まれただけの土地に
//   「整備対象外」「標高データが無い」と書き、根拠に HTTP のステータスまで添えていた。
//   ⚠ ここが見るのは**コードの形だけ**。実際に画面が断定しないことは実描画で見る
//     （403 に差し替える 4 ケース）。静的検査だけで「確認済み」と呼ばない。
//   ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う
//     （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」）。
{
  const bare = (s) => s.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
  // 条件は複数行にまたがる（`if (…)` と `return` が別の行）。畳んでから見る
  const flat = bare(await readFile(join(PUB, "verify.js"), "utf8")).replace(/\s+/g, " ");
  const conds = [...flat.matchAll(/if\s*\(([^)]*status[^)]*)\)\s*(?:\{[^}]*\})?\s*return\s*\{\s*state:\s*(\w+)/g)]
    .map(([, cond, state]) => ({ cond, state, codes: [...cond.matchAll(/status\s*===\s*(\d{3})/g)].map((m) => m[1]) }))
    .filter((c) => c.codes.length);
  const absent = conds.filter((c) => c.state === "ABSENT");
  const wrong = absent.filter((c) => c.codes.some((n) => n !== "404"));
  // ⚠ 0 件で緑にしない。分岐が消えても通ってしまう
  if (!absent.length)
    bad("verify.js に、HTTP のステータスから不在を決めている分岐が1つも無い（この検査が何も見ていない）");
  else if (wrong.length)
    bad(`verify.js が 404 以外を「無い」と読んでいる: ${
      wrong.map((c) => `${c.codes.join("/")} → ABSENT`).join("、")}`
      + `（403 は拒否であって、不在の証拠ではない）`);
  else
    ok(`不在と読むのは 404 だけ（verify.js の ${absent.length} 経路: 画像・GeoJSON・標高）`);
}

// ⚠ **出した節を読み込む**（2026-08-24。hidetzu/konjaku#232）。
//
// ⚠ **順番はここで決める。**⚠ **`readdir` の順に任せない**
//   （⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **読み込み忘れは、⚠ 落ちずに件数が減るだけ**（2026-08-24。⚠ **実際に起こした**）。
//   ⚠ 実測: ⚠ `safety.mjs` の読み込みを消したら、⚠ **218 → 200 件**になったのに
//     ⚠ **「問題なし」で緑のままだった。**
//   ⚠ **だから、⚠ 一覧に漏れが無いことを下で確かめる**（⚠ `test/check/` を実際に読む）。
for (const part of PARTS) await import(`./check/${part}`);







// ⚠ **EraControlPanel の境界**（2026-08-22。hidetzu/konjaku#171。Owner 指定）。
//
// ⚠ **「HUD」という箱ではなく、⚠ `EraControlPanel` を切り出した。**
//   ⚠ 「HUD」だと、⚠ **また注意書き・建物情報・エラーが入ってくる**（実際に 3 回入った）。
//   ⚠ `EraControlPanel = 年代の表示と操作` なら境界が強い。
//
// ⚠ **見るのは 2 つ。**
//   a コンポーネントが、⚠ **禁じられた相手を 1 度も参照していない**
//   b ⚠ **画面が、コンポーネントの中の DOM を直接書いていない**
//
// ⚠ **「消した」だけの検査にしない**（`.claude/rules/testing.md`）。
//   ⚠ **口が生きていること**（画面が `createEraControl` を呼び、`update` を通ること）も見る。
{
  const fails = [];
  const js = src["components/era-control/era-control.js"]
    ?? await readFile(join(PUB, "components/era-control/era-control.js"), "utf8").catch(() => "");
  const peel = src["peel3d.js"] ?? "";
  if (!js) fails.push("era-control.js を読めない（この検査が何も見ていない）");
  if (!peel) fails.push("peel3d.js を読めない（この検査が何も見ていない）");

  // ⚠ **コメントは先に落とす**（CLAUDE.md §5。⚠ 説明の字面を検査が拾う事故を 3 回踏んでいる）
  const bare = (t) => t.replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
  const jsBare = bare(js), peelBare = bare(peel);

  // ---- a コンポーネントが触ってはいけない相手（Owner 指定の 5 つ）----
  const BANNED = [
    ["maplibregl", "MapLibre を直接操作している"],
    ["map\\.", "地図を直接操作している"],
    ["#land", "土地の答えの箱を書き換えている"],
    ["history\\.", "履歴を書き換えている"],
    ["location\\.", "URL を読み書きしている"],
    ["fetch\\(", "自分でデータを取りに行っている"],
  ];
  for (const [re, why] of BANNED)
    if (new RegExp(re).test(jsBare))
      fails.push(`era-control.js が ${why}（${re.replace(/\\/g, "")}）`);

  // ---- b 画面が、コンポーネントの中の DOM を直接書いていない ----
  // ⚠ **id を決め打ちで並べる。**⚠ 1 つでも直書きが残ると、状態が 2 か所に散る
  const INSIDE = ["rlYear", "rlSub", "rlTicks", "rlKnob", "rlPrev", "rlNext", "rlLeft", "rlRight",
                  "rlNote", "drum", "drumPos", "drumWrap", "track", "play"];
  for (const id of INSIDE)
    if (new RegExp(`getElementById\\("${id}"\\)`).test(peelBare))
      fails.push(`peel3d.js が #${id} を直接引いている（コンポーネントへ渡す）`);
  // ⚠ **年代のつまみ（#t）も同じ。**⚠ 値の正本は画面が持つが、⚠ **DOM は持たない**
  if (/getElementById\("t"\)/.test(peelBare)) fails.push("peel3d.js が #t を直接引いている");
  for (const w of ["slider.value", "slider.dispatchEvent", "playBtn.textContent"])
    if (peelBare.includes(w)) fails.push(`peel3d.js に ${w} が残っている`);

  // ---- ⚠ 口が生きていること（⚠ 「消した」だけにしない）----
  if (!/createEraControl\s*\(/.test(peelBare)) fails.push("peel3d.js が createEraControl を呼んでいない");
  if (!/\.update\s*\(/.test(peelBare)) fails.push("peel3d.js が update() を通っていない");
  if (!/g\.createEraControl\s*=/.test(jsBare)) fails.push("era-control.js が createEraControl を出していない");

  // ---- ⚠ 配られること（オフラインで年代 UI が消えない）----
  // ⚠ **動的キャッシュは直下の .js しか一致しない。**⚠ SHELL に無いと配られない
  const swTxt = src["sw.js"] ?? "";
  for (const f of ["/components/era-control/era-control.js", "/components/era-control/era-control.css"])
    if (!swTxt.includes(`"${f}"`)) fails.push(`sw.js の SHELL に ${f} が無い（オフラインで年代 UI が出ない）`);

  fails.length
    ? bad(`EraControlPanel の境界が破れている（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
    : ok(`EraControlPanel の境界は保たれている`
       + `（禁止 ${BANNED.length} 件 0／画面からの直書き ${INSIDE.length + 4} 件 0／口は生きている／SHELL に 2 件）`);
}

// ---------- 5. OGP ----------
head("5. OGP");
for (const f of htmlFiles) {
  const s = src[f];
  const miss = ["og:title", "og:description", "og:url", "og:image", "twitter:card"]
    .filter((k) => !s.includes(`"${k}"`));
  if (miss.length) { bad(`${f}: ${miss.join(", ")} が無い`); continue; }
  const url = s.match(/og:url"\s+content="([^"]+)"/)?.[1] ?? "";
  if (!url.startsWith(SITE)) bad(`${f}: og:url のドメインが違う（${url}）`);
  else if (url.endsWith(".html")) bad(`${f}: og:url が拡張子付き（${url}）`);
  else ok(`${f}: ${url}`);
}



{
  const { execFileSync } = await import("node:child_process");
  try {
    const result = execFileSync(process.execPath, ["scripts/generate-ogp.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    ok(result);
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    bad(`OGP の生成元と配信画像が食い違っている: ${detail}`);
  }
}


// ⚠ **ここから下は、⚠ まだ問いで分けていない**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **元は「6. 外部リンク」という節名の下にあった。**⚠ **その名前は中身と合っていなかった**
//     （⚠ 49 件のうち、⚠ 外部リンクは 3 件だけ。⚠ 残りは CSS ／ 配っている現物 ／
//      ⚠ Domain を動かす ／ 秘密 …が積まれていた）。
//   ⚠ **名前を「外部リンク」のまま残さない。**⚠ **嘘の名前は、⚠ 次に足す人を迷わせる。**
//   ⚠ **正直な名前にする。**⚠ **次にやることが、⚠ 名前から分かる。**
head("6. まだ問いで分けていないもの");













// ⚠ 畳んだ <details> の中に、判定の結果を入れない。
//   実際にやった（2026-08-15）: パネルの「場所を探す」214px を <details> にしたとき、
//   同じ枠に入っていた #status を巻き込んだ。#status は検索の状態ではなく**判定の結果**で、
//   「建物 533 件を判定しました」「このエリアには明治期の低湿地データがありません」
//   「読み込めませんでした ＋ 再試行」まで全部そこに出る。
//   閉じた <details> の中身は innerText に出ない＝画面にも出ないので、
//   取れなかったことを言う文ごと消えた。実描画 9 件が落ちて気づいた。
//   ここで止めれば、ブラウザを起こす前に分かる。
{
  const { readFileSync: rf } = await import("node:fs");
  // 判定の結果を出す先。畳んだ中に入ってはいけない
  const RESULT_IDS = ["status", "result", "prov", "breakdown", "pick", "landAll", "placeName"];
  // ⚠ **その画面の JS も見る**（2026-08-24）。⚠ **`<details>` は JS も組み立てる。**
  //   ⚠ トップの JS を `top.js` へ出したら、⚠ **数えていた箱が 3 → 2 に減った。**
  //   ⚠ **落ちないので気づけない**（⚠ 「畳んだ中に結果が無い」と言い続ける）。
  // ⚠ **繋いで見ない。**⚠ 繋ぐと、⚠ **片方の閉じと片方の開きが跨いで「入れ子」に見える**
  //   （⚠ 2026-08-24 に実際に踏んだ。⚠ `peel.html` ＋ `peel3d.js` で偽陽性）。
  // ⚠ **ファイルごとに数えて、⚠ 画面として足す。**
  for (const [f, jsF] of [["public/peel.html", "public/peel3d.js"],
                          ["public/index.html", "public/top.js"]]) {
    // ⚠ コメントを先に落とす。落とさないと、この検査を説明するコメントに書いた
    //   `<details>` の字面を検査自身が拾って落ちる（実際に踏んだ）。
    //   コメントは画面に出ないので、見るべきでもない。
    // ⚠ **JS の側は、⚠ `//` と `/* */` も落とす**（`CLAUDE.md` §5）。
    //   ⚠ **落とさないと、⚠ この検査を説明したコメントの `<details>` を検査自身が拾う**
    //     （⚠ 2026-08-24 に実際に踏んだ。⚠ `peel3d.js` のコメント 2 か所で「入れ子」判定）。
    //   ⚠ `//` は `https://` を巻き込まない形で落とす。
    const parts = [f, jsF].map((x) => {
      const t = rf(x, "utf8").replace(HTML_COMMENT, " ");
      return x.endsWith(".js")
        ? t.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1")
        : t;
    });
    // <details> … </details> の中身を取り出す（入れ子は使っていない。使ったらここで気づく）
    const nested = parts.some((t) => /<details[^>]*>(?:(?!<\/details>)[\s\S])*<details/.test(t));
    if (nested) {
      bad(`${f}: <details> が入れ子になっている。この検査は入れ子を想定していない`); continue;
    }
    const inside = parts.flatMap((t) =>
      [...t.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1])).join("\n");
    const boxes = parts.reduce((a, t) => a + (t.match(/<details/g) ?? []).length, 0);
    if (!inside) { ok(`${f}: 畳む箱は無い`); continue; }
    const hit = RESULT_IDS.filter((id) => new RegExp(`id="${id}"`).test(inside));
    hit.length
      ? bad(`${f}: 判定の結果が畳んだ <details> の中にある（${hit.join(",")}）。閉じていると画面に出ない`)
      : ok(`${f}: 判定の結果は畳んだ中に無い（畳む箱 ${boxes} 個）`);
  }
}




















// ---------- 9. 画面の言葉 ----------
head("9. 画面の言葉");





















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



// ── いくつ確かめたか、⚠ 最後に名乗る ────────────────────────────
// ⚠ **0 件で緑にしない。**⚠ 1 件も走っていないのに「問題なし」と言わない
//   （⚠ 以前は SPEC との突き合わせが、⚠ 偶然この役目も果たしていた）。
// ⚠ **必ず、⚠ いちばん最後に置く**（2026-08-22 に踏んで移した）。
//   ⚠ **前は検索の fixture の節の中にあり、⚠ その行までの数を名乗っていた。**
//   ⚠ **後ろに検査を足したぶんが入らず、⚠ 実際は 206 件なのに「197 件」と言っていた。**
//   ⚠ **`CLAUDE.md` はここを「この数が正」と指しているので、⚠ 正本が実際より少なく名乗る形だった。**
//   ⚠ **落ちない。**⚠ **少なく言うだけなので、⚠ 気づけない。**
{
  // ⚠ **数は `test/check/lib.mjs` が持つ**（2026-08-24）。⚠ ここでは読むだけ。
  const mine = tally().passed + 1;   // ⚠ **自分もこれから 1 件になるので足す**
  mine > 1
    ? ok(`静的検査は ${mine} 件を数えた（⚠ この数が正。⚠ SPEC には書かない）`)
    : bad(`静的検査が ${mine} 件しか走っていない（⚠ 1 件も確かめていないので緑にしない）`);
}

const { failed, warned } = tally();
console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`); process.exit(1); }
console.log(`\x1b[32m問題なし\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`);
