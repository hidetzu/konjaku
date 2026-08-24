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
const PARTS = ["links.mjs", "style.mjs", "motion.mjs", "land.mjs", "place.mjs", "era.mjs", "words.mjs", "answer.mjs", "guard.mjs", "eval.mjs", "safety.mjs", "deliver.mjs", "docs.mjs"];

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


// 事物の索引の読み方。⚠ **ここ1か所**にする（z12 の束ごとに、中の z14 を1ビットずつ）。
//   写すと、索引の持ち方を変えたときに片方だけ直して、同じ問いに違う答えが出る。
const evCovered = (idx, tileOf) => (lon, lat) => {
  const t = tileOf(lon, lat, 14), S = Math.log2(idx.sub);
  const bx = t.x >> S, by = t.y >> S;
  const bit = 1 << (((t.y - by * idx.sub) * idx.sub) + (t.x - bx * idx.sub));
  return { t, on: !!((idx.tiles[`${bx}/${by}`] ?? 0) & bit) };
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

// ---------- 3. 内部リンク ----------
head("3. 内部リンク");
{
  const pages = new Set(htmlFiles.map((f) => basename(f, ".html")));
  // ⚠ **JS も見る**（2026-08-24。⚠ **実際に踏んだ**）。
  //   ⚠ **地図の CSS は、⚠ JS が動的に読み込んでいる**（`css.href="./vendor/maplibre-gl.css"`）。
  //   ⚠ **前は `index.html` のインライン `<script>` にあったので、⚠ HTML を見るだけで拾えていた。**
  //   ⚠ `top.js` へ出した瞬間、⚠ **この検査が静かに 1 件見なくなった**
  //     （⚠ 落ちない。⚠ **数が減るだけなので気づけない**）。
  //   ⚠ **`peel3d.js` も同じことをしている**（⚠ こちらは前から見ていなかった）。
  //   ⚠ **「全部緑」は、⚠ 何も変わっていないことの証明ではない**（`CLAUDE.md` §9）。
  for (const f of [...htmlFiles, ...jsFiles]) {
    const self = basename(f, ".html");
    // href="..." と href:`...` の両方（テンプレートリテラルで組む箇所がある）
    const refs = [...src[f].matchAll(/href[=:]\s*[`"]\.\/([^`"?#]*)/g)].map((m) => m[1]);
    for (const r of refs) {
      const ext = extname(r);
      // css/js/png などのアセットは、ページではなく実体の有無を見る
      if (ext && ext !== ".html") {
        await readFile(join(PUB, r))
          .then(() => ok(`${f}: ./${r}`))
          .catch(() => bad(`${f}: ./${r} が存在しない`));
        continue;
      }
      if (ext === ".html")
        bad(`${f}: ./${r} は拡張子付き。本番は /${basename(r, ".html")} へ307転送される`);
      const target = r.replace(/\/$/, "");
      if (target && !pages.has(target))
        bad(`${f}: ./${r} に対応するページが無い`);
      if (target === self)
        bad(`${f}: ./${r} は自分自身を指している`);
    }
  }
  ok("拡張子なし・実在・自己参照を検査済み");
}

// ---------- 3.5. 土地ごとの例外を作らない ----------
// ⚠ **以前ここは範囲索引（豊洲 1 件だけ）を見ていた**（2026-08-20 に外した）。
//   ⚠ 豊洲だけが専用の集計範囲・事前生成の水域・事前生成の建物を持ち、
//     ⚠ **1 つの土地だけが他と違う経路を通っていた**（掟: 同じ問いに答える実装を2つ持たない）。
// ⚠ **守りたかったこと（実行時 Overpass に黙って落ちない）は消していない。**
//   それは下の「タイル索引」と共通マニフェストの検査が見ている。
// ⚠ ここが見るのは、**その例外がもう一度生えてこないこと**。
head("3.5. 土地ごとの例外を作っていない");
{
  const gone = ["areas.json", "toyosu-buildings.geojson", "toyosu-water.geojson"];
  for (const f of gone)
    existsSync(join(PUB, "data", f))
      ? bad(`public/data/${f} が戻っている。1 つの土地だけが違う経路を通る`)
      : ok(`public/data/${f} は無い`);
  // ⚠ 読む側が生えていないか。**配っていないものを読みに行くと、静かに 404 を出し続ける**
  // ⚠ **コメントを先に落とす。**落とさないと、上の説明の字面をこの検査が拾う（CLAUDE.md §5）。
  let reads = 0;
  for (const [f, s2] of Object.entries(src)) {
    if (!/\.(js|html)$/.test(f)) continue;
    // ⚠ HTML のコメント（<!-- -->）も落とす。⚠ **落とさないと、何を外したかを
    //   説明した .html のコメントを、この検査自身が「読んでいる」と読む**（CLAUDE.md §5）
    const bare = s2.replace(HTML_COMMENT, " ")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
    for (const g of gone)
      if (bare.includes(g)) { bad(`${f} が data/${g} を読もうとしている（もう配っていない）`); reads++; }
  }
  if (!reads) ok("公開物のどれも、消した 3 件を読みに行っていない");
}

// ⚠ **「この場所に 3D の下地があるか」に答える実装を、2 つ持たない**（掟6）。
//   トップは「この場所を深掘り」の導線を出すかどうかを、/peel は建物を静的に描けるかを、
//   **同じ答え**で決めている。別々に書くと、
//   **トップが「深掘りできる」と言った場所で /peel が Overpass に落ちる**状態が作れる
//   （＝出るか出ないかが相手次第。押しても何も起きない導線を置かない、に反する）。
//   ⚠ 判定の材料は 2 つある。どちらも ground.js だけが持つこと。
//     1) 集計する範囲（HALF_LON / HALF_LAT）  2) z14 タイル索引の引き方
head("3.6. 3D の下地の判定（public/ground.js の1か所）");
{
  const g = src["ground.js"];
  if (!g) bad("public/ground.js が無い（下地の判定の置き場所）");
  else {
    const needs = [
      ["HALF_LON", "集計する範囲（この値がずれると、導線を出したのに建物が出ない場所ができる）"],
      ["hasSync", "トップが同期で引く入口"],
      ["tilesFor", "/peel が読むタイルの並び"],
    ];
    const miss = needs.filter(([k]) => !g.includes(k));
    if (miss.length) bad(`ground.js に ${miss.map(([k, w]) => `${k}（${w}）`).join("・")} が無い`);
    else ok("ground.js が、範囲・トップ側の入口・/peel 側の入口を持っている");

    // ⚠ 使う側が、同じ判断を自分でも書いていないこと。
    //   ⚠ **コメントを先に落とす。** 落とさないと、この決まりを説明したコメントの字面を拾う
    //     （CLAUDE.md §5。2 回踏んでいる）。
    const strip = (s) => s.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1")
      .replace(HTML_COMMENT, " ");
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const s = strip(src[f] ?? "");
      const own = [
        [/const\s*\{?\s*HALF_LON/, "範囲（HALF_LON）を自分で宣言している"],
        [/z14of\s*=/, "z14 タイルの求め方を自分で書いている"],
        [/bl\/index\.json/, "タイル索引の場所を直に書いている（assets.json 経由にする）"],
      ].filter(([re]) => re.test(s.replace(/const\s*\{HALF_LON,HALF_LAT\}\s*=\s*KonjakuGround/, "")));
      if (own.length) bad(`${f} が下地の判定を自分でも持っている: ${own.map(([, w]) => w).join("・")}`);
      else if (!s.includes("KonjakuGround")) bad(`${f} が KonjakuGround を使っていない（判定の出どころが不明）`);
      else ok(`${f} は ground.js の答えを使っている`);
    }
    // 読み込み忘れ。読み込まないと ReferenceError で画面が丸ごと止まる
    for (const f of ["index.html", "peel.html"])
      if ((src[f] ?? "").includes('src="./ground.js"')) ok(`${f} が ground.js を読み込んでいる`);
      else bad(`${f} が ground.js を読み込んでいない（KonjakuGround が未定義になる）`);
  }
}


// ---------- 4. 出典表記 ----------
head("4. 出典表記");
for (const f of htmlFiles) {
  const s = src[f];
  const gsi = s.includes("国土地理院");
  // OSM 建物を使うページだけ ODbL 表記が要る
  const usesOsm = s.includes("overpass") || s.includes("data/bl") || s.includes("-buildings");
  const osm = s.includes("OpenStreetMap");
  if (!gsi) bad(`${f}: 地理院タイルの出典表記が無い`);
  else if (usesOsm && !osm) bad(`${f}: OSM を使っているのに ODbL 表記が無い`);
  else ok(`${f}${usesOsm ? "（地理院＋OSM）" : "（地理院）"}`);
}

// ⚠ **配るデータは、商用利用できるものだけ**（2026-08-22 の Owner 判断。ADR 0032）。
//
// ⚠ **理由は「いつか稼ぐかもしれないから」ではない。**⚠ **いまの形と噛み合わないから。**
//   ⚠ 非商用のデータは「**複製物の再配布を除く**」と書かれていることがある
//     （国土数値情報の旧約款 第1条(b)）。⚠ **konjaku は public/data/ から配っている。**
//     ⚠ **無料で運営していても引っかかる。**
//   ⚠ しかも、あとから外すのが高い（共有カード・OGP・README まで届く。CLAUDE.md §6）。
//
// ⚠ **人の記憶では保たない。**⚠ 実際に LICENSES.md の表は両方向にずれていた
//   （2026-08-22 実測: 載せ忘れ 3 件／実体の無い行 2 件）。
//
// ⚠ **見張るのは 3 つ。**
//   a public/data/ の中身が、全部 LICENSES.md の表に載っている
//   b 表に載っていて、実体が無い行が無い（消したデータの行が残らない）
//   c 条件の欄に、禁じる語が入っていない
{
  const lic = await readFile(join(ROOT, "LICENSES.md"), "utf8");
  // ⚠ **表の行だけを読む。**⚠ 本文に出てくる `data/…` を拾わない
  const rows = [...lic.matchAll(/^\|\s*`data\/([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)]
    .map((m) => ({ path: m[1].replace(/\/$/, ""), what: m[2].trim(),
                   from: m[3].trim(), terms: m[4].trim() }));
  // ⚠ **実体。**⚠ `public/data/` の直下だけを見る（中の 1 枚ずつは表に書かない）
  const real = (await readdir(join(PUB, "data"))).sort();
  const listed = new Set(rows.map((r) => r.path));
  const fails = [];

  if (!rows.length) fails.push("LICENSES.md の配布データの表を読めない（この検査が何も見ていない）");
  // a 載せ忘れ
  for (const e of real) if (!listed.has(e)) fails.push(`${e} が LICENSES.md の表に無い`);
  // b 実体の無い行
  for (const r of rows) if (!real.includes(r.path)) fails.push(`LICENSES.md に ${r.path} の行があるが、実体が無い`);
  // c ⚠ **禁じる語。**⚠ 商用利用できないものを配らない
  //   ⚠ 「非商用」は konjaku では「配れない」と同義（再配布が除かれているため）
  const FORBIDDEN = ["非商用", "商用不可", "商用利用不可", "NonCommercial", "non-commercial"];
  for (const r of rows) {
    const hit = FORBIDDEN.find((w) => r.terms.includes(w) || r.from.includes(w));
    if (hit) fails.push(`${r.path} の条件に「${hit}」がある（配っているものは商用利用できるものだけ。ADR 0032）`);
    if (!r.terms) fails.push(`${r.path} の条件の欄が空（何に従って配っているか分からない）`);
    if (!r.from) fails.push(`${r.path} の出どころの欄が空（出典を書けない）`);
  }
  fails.length
    ? bad(`配っているデータの条件が掟どおりでない（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
    : ok(`配っているデータ ${real.length} 件は、全部 LICENSES.md に条件つきで載っている`
       + `（商用利用できないものは 0 件）`);
}

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
// ⚠ **名乗りが、外へ出る面のあいだで割れないこと。**
//   看板（index.html の h1）と、共有カード（share.js が canvas に描く文字）は
//   **別ファイルにあり、片方だけ直すと気づけない**。実際に割れていた:
//   看板は「カテゴリ名では何が起きるか分からない」として言い換えたのに、
//   共有カードだけが旧い名乗りのまま SNS へ配られていた。
//   ⚠ **止める検査が1つも無かった**ので、ここで突き合わせる
//   （掟「やむを得ず2つ持つときは、機械で突き合わせる」）。
{
  const idx = await readFile(join(PUB, "index.html"), "utf8");
  const shr = await readFile(join(PUB, "share.js"), "utf8");
  const h1 = /<h1>([^<]+)<\/h1>/.exec(idx)?.[1]?.trim();
  // ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う。
  //   ⚠ **`//` を素朴に落とすと URL を食う。** `https://…` の `//` をコメント開始と
  //     読んで行末まで消すため、**同じ行で読みたい値より前に URL があると読めなくなる**
  //     （実測 2026-08-15。`const LFC = "https://…"` を読む別の検査で実際に踏んだ）。
  //     ⚠ いまの share.js では起きないが、正しい版と誤った版を並べて置かない。
  //     直前が `:` のときは落とさない。
  const banner = /BANNER\s*=\s*"([^"]+)"/.exec(shr.replace(LINE_COMMENT, "$1"))?.[1];
  if (!h1) bad("index.html から看板（h1）を読めない（この検査が何も見ていない）");
  else if (!banner) bad("share.js に BANNER が無い（共有カードの名乗りを追えない）");
  else if (h1 !== banner)
    bad(`名乗りが割れている: 看板「${h1}」/ 共有カード「${banner}」`
      + `（カード画像は SNS で単独に流れるので、ここが看板の代わりになる）`);
  else ok(`看板と共有カードの名乗りが揃っている（${h1}）`);
}



// ⚠ **プライバシーの説明が、2 つの画面で割れないこと。**
//   / と /peel は**同じことをする**（どちらも判定すると URL に地名と座標を載せる）ので、
//   同じ約束をしなければならない。⚠ 実際、**peel には説明が1つも無かった**（2026-08-15）。
//   ⚠ 文言は HTML に直接書く。JS から差し込むと、**スクリプトが落ちたとき説明だけ消える**。
//   そのぶん 2 か所に同じ文字が並ぶので、ここで突き合わせる
//   （掟「やむを得ず2つ持つときは、機械で突き合わせる」）。
{
  const strip = (s) => s.replace(HTML_COMMENT, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  const grab = (src, attr) => {
    const m = new RegExp(`<div[^>]*\\b${attr}\\b[^>]*>([\\s\\S]*?)</div>`).exec(src);
    return m ? strip(m[1]) : null;
  };
  const idx = await readFile(join(PUB, "index.html"), "utf8");
  const peel = await readFile(join(PUB, "peel.html"), "utf8");
  // 畳まずに見える1行（トップ）。⚠ /peel は 2026-08-18 に**短い版**へ替えた（下）
  // ⚠ **2026-08-23 に、⚠ 見る対象を変えた**（Owner 判断）。
  //   ⚠ **前は「その箱に字がべた書きされていること」を見ていた。**
  //   ⚠ いまは中身が \`words.js\` の \`PRIVACY_SHORT\` から実行時に入るので、
  //     ⚠ **字は静的には読めない**（⚠ 読めないものを「確認済み」と呼ばない。CLAUDE.md §1）。
  //   ⚠ **だから、⚠ 静的に確かめられることだけを主張する**（⚠ 3 つ）:
  //     1) 箱がある  2) ⚠ **\`<details>\` の中に入っていない**  3) そこへ \`PRIVACY_SHORT\` を入れている
  //   ⚠ **2) は前より強い。**⚠ 前は「畳まずに見える」と名乗りながら、⚠ **畳みの中でも通った。**
  //   ⚠ **字が本当に出ているかは、⚠ 実描画（\`footer .f-priv\`）が見る。**
  {
    const fails = [];
    // ⚠ **コメントを先に落とす**（CLAUDE.md §5）。⚠ **落とさないと、⚠ この検査を説明する
    //   コメントに書いた \`<details>\` を、⚠ 検査自身が数える**（⚠ 2026-08-23 に実際に踏んだ）。
    const idxNoC = idx.replace(HTML_COMMENT, " ");
    const m = /<[a-z]+[^>]*\bdata-privacy-lead\b[^>]*>/.exec(idxNoC);
    if (!m) fails.push("箱（data-privacy-lead）が無い");
    else {
      // ⚠ **その箱より前にある \`<details>\` が、⚠ 箱より前に閉じているか**を数える。
      //   ⚠ 開いたままなら、⚠ **畳みの中にいる。**
      const before = idxNoC.slice(0, m.index);
      const opens = (before.match(/<details\b/g) ?? []).length;
      const closes = (before.match(/<\/details>/g) ?? []).length;
      if (opens > closes) fails.push("箱が <details> の中にある（畳むと、送る前に読めるとは言えない）");
      // ⚠ **そこへ PRIVACY_SHORT を入れているか**（⚠ 箱だけ残ると余白が増える）
      const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
      if (!id) fails.push("箱に id が無い（入れる側と結びつかない）");
      // ⚠ **箱は `index.html`、⚠ 入れる側は `top.js`**（2026-08-24 に JS を出した）。
      //   ⚠ **2 つを繋いで見る。**⚠ 利用者から見れば 1 つの画面。
      else if (!new RegExp(`${id}[\\s\\S]{0,300}PRIVACY_LEAD`)
        .test(`${idxNoC}\n${src["top.js"] ?? ""}`))
        fails.push(`箱（#${id}）へ PRIVACY_LEAD を入れていない`);
    }
    if (fails.length) bad(`index.html の畳まずに見える1行: ${fails.join(" / ")}`);
    else ok("index.html の畳まずに見える1行は、<details> の外にあり、PRIVACY_SHORT を入れている");
  }
  // ⚠ **/peel は短い版だが、3 段を落とさない。**
  //   2026-08-18 に、この画面から「サイト全体の情報」（作者・プライバシーの詳しい説明・
  //   データについて）を外した。⚠ **プライバシーをゼロにはしない。**
  //   この画面も判定すると URL に ?q=&ll= を載せるので、トップと同じことが起きる
  //   （2026-08-15 に「説明が1つも無い」を問題として直した経緯がある）。
  // ⚠ **1 段でも落ちると、いちばん強い約束だけが残って「通信していない」と読める。**
  //   それは 2026-08-15 に直した嘘へ戻ること。だから 3 段を項目で見る。
  // ⚠ 一字一句そろえない（短い版なので正当に違う）。**言っていることで見る。**
  // ⚠ **2026-08-20 に、字は words.js の PRIVACY_SHORT へ寄せた。**
  //   ⚠ **HTML の中の字ではなく、実際に出る文で見る。**
  //   ⚠ 併せて、⚠ **2 画面が同じ 1 か所から出しているか**も見る（写しを作らせない）。
  {
    const NEED3 = [
      [/URL|アドレス欄/, "調べた場所が URL に載ること（載る）"],
      [/(Cloudflare|配信元)[^。]*(届|渡)/, "その URL を開くと配信元へ届くこと（届く）"],
      [/こちらの記録には[^。]*残りません|こちらの記録に[^。]*残りません/, "こちらの記録には残らないこと（残らない）"],
    ];
    // ⚠ **ここは words.js の読み込みより前の節。**⚠ 読まずに参照すると、
    //   ⚠ **「PRIVACY_SHORT が無い」と嘘の理由で落ちる**（2026-08-20 に踏んだ）。
    await import(`file://${join(PUB, "words.js")}`);
    const short = globalThis.KonjakuWords?.PRIVACY_SHORT ?? "";
    // ⚠ **出す箱が両方にあること。**箱が無ければ、文があっても画面には出ない
    const boxes = [
        ["peel.html", /data-privacy-short/.test(peel)],
        ["index.html", /id="privacyShort"/.test(idx)],
    ].filter(([, has]) => !has).map(([f]) => f);
    // ⚠ **入れる側が両方あること。**箱だけあって空だと、⚠ **余白だけが増える**
    // ⚠ **2026-08-23 に、⚠ トップだけ別の文になった**（Owner 判断）。
    //   ⚠ **トップの畳まずに見える 1 行は \`PRIVACY_LEAD\`**（いちばん強い約束 2 つ）。
    //   ⚠ **/peel の情報パネルは \`PRIVACY_SHORT\`**（載る → 届く → 残らないの 3 段）。
    //   ⚠ **なぜ違ってよいのかは \`public/words.js\` の \`PRIVACY_LEAD\` に書いてある。**
    //     ⚠ ここには写さない（⚠ 2 か所に書くと、片方だけ古くなる）。
    //   ⚠ **どちらも words.js の 1 か所から借りていること**は、ここで見る。
    const fills = [
        // ⚠ **入れる側は `top.js`**（2026-08-24）
        ["index.html", /privacyShort[\s\S]{0,300}PRIVACY_LEAD/.test(`${idx}\n${src["top.js"] ?? ""}`)],
        ["peel3d.js", /data-privacy-short[\s\S]{0,300}PRIVACY_SHORT/.test(
          await readFile(join(PUB, "peel3d.js"), "utf8"))],
    ].filter(([, has]) => !has).map(([f]) => f);
    // ⚠ **トップの 3 段は、⚠ 畳みの中（\`data-privacy-body\`）に必ず残っていること。**
    //   ⚠ **これが、⚠ 常時見える場所から 2 段落としたことの担保。**
    //   ⚠ **ここが落ちたら、⚠ 「載る」「届く」がトップのどこにも無くなる。**
    // ⚠ **NEED3 をそのまま使わない。**⚠ **緩すぎて、⚠ 別の文で通ってしまう。**
    //   ⚠ 2026-08-23 に実際に踏んだ: ⚠ **「調べた場所が配信元へ届く」の文を丸ごと消しても、
    //     ⚠ 「接続元の IP が配信元に届きます」が残っていて緑のままだった。**
    //   ⚠ **IP が届くことと、⚠ 調べた場所が届くことは別の主張。**
    //   ⚠ **1 つの文の中で、⚠ 場所（URL）と 届く先 が結びついていることまで見る。**
    const bodyIdx = grab(idx, "data-privacy-body") ?? "";
    const sentences = bodyIdx.split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
    const has = (...res) => sentences.some((t) => res.every((re) => re.test(t)));
    const bodyMiss = [
      [() => has(/調べた場所/, /URL|アドレス欄/, /入(り|ります)/),
        "調べた場所が URL に入ること（載る）"],
      // ⚠ **URL と 配信元 と 届く が、⚠ 同じ文の中にあること**（⚠ IP の文では通らない）
      [() => has(/URL|アドレス/, /配信|Cloudflare/, /届|渡/),
        "その URL を開くと配信元へ届くこと（届く）⚠ IP の文では代用できない"],
      [() => has(/こちらの記録に/, /残りません/),
        "こちらの記録には残らないこと（残らない）"],
    ].filter(([f]) => !f()).map(([, n]) => n);
    if (bodyMiss.length)
      bad(`index.html の畳みの中から、3 段が落ちている: ${bodyMiss.join("、")}`
        + "（⚠ 常時見える 1 行は 2026-08-23 に短くした。⚠ 3 段はここにしか残っていない）");
    else ok("index.html の畳みの中に、3 段（載る → 届く → 残らない）が全部ある");
    // ⚠ **常時見える 1 行が、⚠ いちばん強い約束 2 つを言っていること。**
    //   ⚠ **「どこにも送らない」へ広げていないこと**も見る（⚠ 2026-08-15 の嘘）。
    const lead = globalThis.KonjakuWords?.PRIVACY_LEAD ?? "";
    const leadNeed = [[/計測データに(は)?含めません|計測に[^。]*送/, "計測データに含めないこと"],
                      [/Cookie/, "Cookie を使わないこと"]];
    const leadMiss = leadNeed.filter(([re]) => !re.test(lead)).map(([, n]) => n);
    if (!lead) bad("words.js に PRIVACY_LEAD が無い（トップの畳まずに見える1行が空になる）");
    else if (leadMiss.length)
      bad(`PRIVACY_LEAD から約束が落ちている: ${leadMiss.join("、")}`);
    else if (/どこにも送(りません|らず)|一切送/.test(lead))
      bad("PRIVACY_LEAD が「どこにも送らない」まで言い切っている"
        + "（⚠ 調べた場所は URL に載り、開けば配信元へ届く。2026-08-15 に直した嘘）");
    else ok("トップの畳まずに見える1行は、強い約束 2 つを言い、言い切りすぎていない");
    const miss = NEED3.filter(([re]) => !re.test(short)).map(([, n]) => n);
    if (!short) bad("words.js に PRIVACY_SHORT が無い（両画面のプライバシーが空になる）");
    else if (boxes.length) bad(`プライバシーの 3 段を出す箱が無い: ${boxes.join("、")}`);
    else if (fills.length) bad(`プライバシーの 3 段を入れていない: ${fills.join("、")}（箱だけ残ると余白が増える）`);
    else if (miss.length)
      bad(`プライバシーの 3 段から段が落ちている: ${miss.join("、")}`
        + "（1 段でも落ちると、いちばん強い約束だけが残って「通信していない」と読める）");
    else ok("プライバシーの「載る → 届く → 残らない」は words.js の 1 か所で、2 画面が同じ文を出す");
  }
  // ⚠ **共有された状態を復元できなかったときの 1 行は、⚠ words.js の 1 か所**
  //   （2026-08-22。hidetzu/konjaku#169。掟 6: 同じ問いに答える実装を 2 つ持たない）。
  //   ⚠ **前はトップと /peel に、⚠ まったく同じ字がべた書きされていた。**
  //   ⚠ **見た目も別々に持っていて、⚠ すでに値がずれていた**（`.era-miss` と `#stateMiss`）。
  //     ⚠ 見た目のほうは hidetzu/konjaku#94・hidetzu/konjaku#95 の管轄。⚠ ここは字だけ見る。
  {
    const w = await readFile(join(PUB, "words.js"), "utf8");
    const pj = await readFile(join(PUB, "peel3d.js"), "utf8");
    const inWords = (w.match(/この土地には残っていません/g) ?? []).length;
    // ⚠ **画面側にべた書きが無いこと**（⚠ コメントは先に落とす。CLAUDE.md §5）
    // ⚠ **`//` は、⚠ `https://` を巻き込まない形で落とす**（2026-08-24。⚠ **実害を実証した**）。
    //   ⚠ 前は `[^\n]*` だけで、⚠ **`https://` の `//` から先を全部消していた。**
    //   ⚠ 実測（2026-08-24）: ⚠ **`index.html` で 1,091 文字・`peel3d.js` で 260 文字**が
    //     ⚠ **余分に消えていた**（⚠ URL 20 本ぶん）。
    //   ⚠ **実証**: ⚠ URL と同じ行にべた書きを仕込むと ⚠ **緑のまま通った。**
    //     ⚠ URL の無い行に仕込むと落ちた。⚠ **落ちない。⚠ 静かに見なくなるだけ。**
    const strip = (t) => (t ?? "").replace(HTML_COMMENT, " ").replace(LINE_COMMENT, "$1");
    const leaked = [["index.html", strip(idx)], ["peel3d.js", strip(pj)]]
      .filter(([, t]) => /この土地には残っていません/.test(t))
      .map(([f]) => f);
    if (inWords !== 1)
      bad(`共有された年代の 1 行が words.js に ${inWords} 個ある（1 か所にする）`);
    else if (leaked.length)
      bad(`共有された年代の 1 行が画面側にべた書きされている: ${leaked.join("、")}`
        + "（words.js の 1 か所から借りる）");
    else ok("共有された年代の 1 行は words.js の 1 か所で、2 画面が借りている");
  }
  // ⚠ **サイト全体の情報を、この画面へ戻さない**（2026-08-18）。
  //   戻すなら、この検査を「何を守っていたか」を読んでから外すこと。
  //   ⚠ 「データについて」は、外した時点で**2 か所が事実と違っていた**
  //     （住所検索の説明＝この画面から検索を外した／範囲索引から建物を読む＝実測で読まれない）。
  {
    // ⚠ **コメントを先に落とす。**落とさないと、
    //   「何を外したか」を説明したコメントの字面を、この検査自身が拾う。
    //   ⚠ CLAUDE.md §5 の落とし穴。**3 回目**（2026-08-18 に踏んだ）。
    const peelNoComment = peel.replace(HTML_COMMENT, " ");
    // ⚠ **「データについて」は、⚠ 見出しとして丸ごとそれか**で見る（2026-08-22。hidetzu/konjaku#153）。
    //   ⚠ **守りたいのは「サイト全体のデータ説明が戻っていないこと」**で、
    //     ⚠ **その字を含む別の見出しまで塞ぐこと**ではない。
    //   ⚠ 実際に踏んだ: 台帳の節を「⚠ **表示データについて**」（⚠ 3D 表示の品質と由来）にしたら、
    //     ⚠ **部分一致でここが落ちた。**⚠ 中身はサイト全体の情報ではない。
    //   ⚠ **緩めてはいない。**⚠ 見出しがちょうど「データについて」なら、いままでどおり落ちる。
    const back = [["作 hidetzu", "作者（出典ではない）"],
                  ["data-privacy-body", "プライバシーの詳しい説明"]]
      .filter(([w]) => peelNoComment.includes(w));
    // ⚠ 見出しの中身が、前後の字を除いてちょうど「データについて」か
    if (/>\s*データについて\s*</.test(peelNoComment)) back.push(["データについて", "データの説明"]);
    back.length
      ? bad(`peel.html にサイト全体の情報が戻っている: ${back.map(([, n]) => n).join("・")}`
          + "（この画面は地図を触って見る道具。全文はトップのフッターが正本）")
      : ok("peel.html にサイト全体の情報を置いていない（作者・プライバシー全文・データ説明）");
  }
  // ⚠ 詳しい説明は**一字一句そろえない**（index には 🔊 の行があるなど、正当に違う）。
  //   ⚠ **だからといって「片方に URL の字があるか」で済ませない。**
  //   前の版はそれで「2つの画面で揃っている」と言っていた（2026-08-15 に指摘）。
  //   **説明が欠けても緑になる検査**だった。**項目ごとに、両方の画面で**見る。
  {
    const NEED = [
      [/URL|アドレス欄/, "調べた場所が URL に載ること"],
      [/(Cloudflare|配信)[^。]*(届|渡)/, "その URL を開くと配信元へ届くこと"],
      [/(数えて|計測)[^。]*回数/, "こちらが数えているのは回数だけであること"],
      // ⚠ **「地名か座標」で通さない。** `(地名|座標)` と書いていたので、
      //   片方だけ書いても通っていた（2026-08-15 に指摘）。**両方を要求する。**
      [/地名[^。]*含めて|地名も座標も含めて/, "地名を含めていないこと"],
      [/座標[^。]*含めて|地名も座標も含めて/, "座標を含めていないこと"],
      [/端末の中/, "★とメモが端末の中だけに残ること"],
      [/提供元に[はも、]?[^。]*座標が渡/, "提供元に表示に必要な座標が渡ること"],
      // ⚠ **配信元には IP と端末情報が届く**ことを隠さない。
      //   ここを書かないと「誰が・どこを調べたかは残らない」が**配信元も含めた断定**に読める。
      [/IP/, "接続元の IP が配信元に届くこと"],
      // ⚠ **確認したから書ける**ことも、消されたら気づけない。必須にする。
      //   実測: 場所つき URL は Worker を通らない（静的アセットに一致するため）ので、
      //   こちらが持つ Workers Logs には残らない。Logpush も使っていない（無料プランで項目が無い）。
      //   ⚠ wrangler.jsonc の observability の節に、崩れる条件を書いてある。
      [/ログにも場所は残りません|ログにも場所が残りません/, "こちらのログに場所が残らないこと"],
      [/Logpush/, "記録を外部へ出す設定を使っていないこと"],
    ];
    // ⚠ 詳しい説明は**トップだけが持つ**（2026-08-18。/peel からは外した）。
    //   ⚠ /peel 側は上の「3 段」で見ている。**両方で緩めない。**
    for (const [f, src] of [["index.html", idx]]) {
      const body = grab(src, "data-privacy-body");
      if (!body) { bad(`${f} に詳しい説明（data-privacy-body）が無い`); continue; }
      const missing = NEED.filter(([re]) => !re.test(body)).map(([, n]) => n);
      missing.length
        ? bad(`${f} のプライバシーの説明に書かれていないことがある: ${missing.join("、")}`)
        : ok(`${f} のプライバシーの説明に ${NEED.length} 点すべてある`);
      // ⚠ **主語のない断定を書かせない。**「誰が・どこを調べたかは1件も残しません」と
      //   書いていたが、**配信元も含めた断定に読める**（実測では配信元にクエリ・IP・
      //   User-Agent が届く）。「こちら」が主語だと分かる形にする。
      if (/(誰が|どこを)[^。]*残(しません|りません)/.test(body)
          && !/(こちら|自分)[^。]*(記録|数えて)[^。]*(誰が|どこを)|こちらの記録には/.test(body))
        bad(`${f} に主語のない「誰が・どこを調べたかは残しません」がある`
          + `（配信元も含めた断定に読める。実測では配信元にクエリ・IP・端末情報が届く）`);
      else ok(`${f} の「残しません」に主語がある`);
    }
  }
  // ⚠ **保持期間を書かせない。確認していない。**
  //   一度「アクセスの記録は事業者側で一定期間だけ保持されます」と書いたが、
  //   プラン・Logpush / Logpull・Workers Logs の設定を**見ていない**（2026-08-15 に指摘）。
  //   ⚠ **静的アセットは通常 Worker を経由しない**ので、Workers Logs（Worker 呼び出し単位）が
  //   そもそも当てはまらない可能性がある。掟「確認できないことを『検査済み』と呼ばない」。
  //   ⚠ **「届く」までは実測で言える**ので、そこで止める。確認できたらこの検査を外す。
  for (const [f, src] of [["index.html", idx], ["peel.html", peel]]) {
    // ⚠ /peel は短い版なので、そちらを見る。**どちらの画面でも保持期間を書かせない**
    const body = (grab(src, "data-privacy-body") ?? "") + (grab(src, "data-privacy-short") ?? "");
    /保持|保存期間|日間|ログに残/.test(body)
      ? bad(`${f} に、確認していない保持期間の話が書かれている`
          + `（プラン・Logpush・Workers Logs を見ていない。「届く」までに留める）`)
      : ok(`${f} は、確認していない保持期間を書いていない`);
  }
  // ⚠ **主語のない「サーバーには送りません」を、どちらの画面にも書かせない。**
  //   事実でない（調べた場所は URL に載り、開けば配信元へ届く）。
  //   ⚠ この検査を足す前は、**実描画がこの文言を必須にしていた**（誤りを固定していた）。
  for (const [f, src] of [["index.html", idx], ["peel.html", peel]]) {
    /サーバーには送りません/.test(strip(src))
      ? bad(`${f} に主語のない「サーバーには送りません」がある（URL に載る以上、事実でない）`)
      : ok(`${f} に主語のない「送りません」は無い`);
  }
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

// ---------- 結果 ----------
// ⚠ 同じ問いに答える実装が2つある（取り込みと実行時）。片方だけ型を足すと、
//   取り込み済みかどうかで答えが変わる。実際に precision・紀元前・枠外で起きた。
{
  const ing = await readFile("scripts/ingest-wikidata.mjs", "utf8").catch(() => "");
  const ev = src["events.js"] ?? "";
  const kinds = /const KINDS\s*=\s*\{([\s\S]*?)\};/.exec(ing)?.[1] ?? "";
  const a = [...new Set([...kinds.matchAll(/(Q\d+)\s*:/g)].map((m) => m[1]))].sort();
  const b = [...new Set([...ev.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]))].sort();
  if (!a.length || !b.length) bad(`型の一覧が読めない（取り込み ${a.length} / 実行時 ${b.length}）`);
  const only = (x, y) => x.filter((q) => !y.includes(q));
  const d1 = only(a, b), d2 = only(b, a);
  (d1.length || d2.length)
    ? bad(`取り込みと実行時で、拾う型が違う（取り込みだけ: ${d1.join(",") || "なし"} ／ `
        + `実行時だけ: ${d2.join(",") || "なし"}）`)
    : ok(`取り込みと実行時が、同じ型を拾っている（${a.length} 種）`);
}



// ⚠ 建物のタイルが重くなりすぎないよう、上限を決めて見張る。
//   /peel は1画面で z14 を最大4枚読む。同じ画面が読む MapLibre 本体が gz 換算で
//   約1MB なので、**建物4枚で本体を超えない**ことを目安にする → 1枚 250KB。
//   実測（2026-08-14）: 詰める前は 1枚 473KB で、4枚だと 1.9MB。詰めて 199KB。
//   濃い土地を足したときに、また静かに超えていくので機械で押さえる。
{
  const { readFileSync: rfz, readdirSync: rdz, existsSync: exz } = await import("node:fs");
  const { gzipSync } = await import("node:zlib");
  const D = "public/data/bl/14", CAP = 250 * 1024;
  if (!exz(D)) bad("建物のファイルが無い");
  else {
    let worst = { f: "", gz: 0 }, n = 0, sum = 0;
    for (const x of rdz(D)) for (const f of rdz(`${D}/${x}`)) {
      if (!f.endsWith(".json")) continue;
      const gz = gzipSync(rfz(`${D}/${x}/${f}`)).length;
      n++; sum += gz;
      if (gz > worst.gz) worst = { f: `${x}/${f}`, gz };
    }
    const kb = (v) => `${Math.round(v / 1024)}KB`;
    worst.gz > CAP
      ? bad(`建物のタイルが重すぎる: ${worst.f} が gz ${kb(worst.gz)}（上限 ${kb(CAP)}）。`
          + "4枚読むと MapLibre 本体より重くなる。詰め方か配る単位を見直すこと")
      : ok(`建物のタイル ${n} 枚、いちばん重い1枚が gz ${kb(worst.gz)}（上限 ${kb(CAP)}／合計 ${kb(sum)}）`);
  }
}

// ⚠ 名乗りは、実装が実際にやっていることに合わせる。
//   OGP と title は共有先まで届くので、ここが実装とずれると**共有先で嘘をつく**。
//   実際にずれていた（2026-08-14）:
//     og:description「建物が消え、明治期の地形が現れる」← やめると決めた演出の説明
//     label「時間をさかのぼる（3D）」                  ← 時間を自由に動かせると約束
//   建物が年で消えるのを支えるデータは、10街40万件で建設年 0.30%（写真の帯なら 0.08%）。
//   PLATEAU も 4.94%（建築年は都市計画基礎調査の法定事項ではないので、待っても埋まらない）。
{
  const { readFileSync: rfn } = await import("node:fs");
  const BAN = [
    ["建物が消え", "やめると決めた演出を、名乗りが約束している"],
    ["時間をさかのぼる", "時間を自由に動かせると約束している（支えるデータが 0.30%）"],
    ["（3D）", "利用者は誰も「2D/3D」と言わなかった（利用者役のエージェントによる検証）"],
  ];
  for (const [file, where] of [
    ["public/peel.html", /<title>[\s\S]*?<\/title>|<meta[^>]*(og:|twitter:|name="description")[^>]*>/g],
    // ⚠ **2026-08-21 に、⚠ 名乗りの場所が `{id:"peel"…}`（一覧の行）→ `peelLens()` へ移った。**
    //   ⚠ 「この場所を深掘り」を行動一覧から判定カードの中へ移したため。
    //   ⚠ **見ているものは同じ**（⚠ 深掘りの名乗りが、実装とずれていないか）。
    ["public/top.js", /function peelLens\([\s\S]*?\n\}/g],
  ]) {
    const hay = (rfn(file, "utf8").match(where) ?? []).join(" ");
    if (!hay) { bad(`${file}: 名乗りの箇所が読めない`); continue; }
    const hit = BAN.filter(([w]) => hay.includes(w));
    hit.length
      ? bad(`${file} の名乗りが実装とずれている: `
          + hit.map(([w, why]) => `「${w}」（${why}）`).join(" / "))
      : ok(`${file.replace("public/", "")} の名乗りが、実装と食い違っていない`);
  }
}




// ⚠ 建物の詰め方は、書く側（scripts/bl-format.mjs）と読む側（peel3d.js の
//   unpackBuildings）が対になっている。片方だけ直すと**建物の形が静かにずれる**
//   （画面は何も言わない）。同じ入力を両方に通して、同じ形になることを見る。
{
  const { readFileSync: rf3 } = await import("node:fs");
  const { pack, unpack, VERSION, HSRC } = await import("../scripts/bl-format.mjs");
  // 実際のタイルを1枚、両方の手順で戻して突き合わせる
  const src = JSON.parse(rf3("public/data/bl/14/14553/6453.json", "utf8"));
  const html = rf3("public/peel3d.js", "utf8");
  const v = /const BL_V=(\d+), BL_HSRC=\[([^\]]+)\]/.exec(html);
  if (!v) bad("peel3d.js の BL_V / BL_HSRC が読めない");
  else if (+v[1] !== VERSION)
    bad(`詰め方の版が食い違う: bl-format ${VERSION} / peel3d.js ${v[1]}`);
  else if (v[2].replace(/["\s]/g, "") !== HSRC.join(","))
    bad(`高さの出所の並びが食い違う: bl-format ${HSRC.join(",")} / peel3d.js ${v[2]}`);
  else {
    // peel3d.js の中身をそのまま関数にして動かす（写しではなく本物を測る）
    const body = /function unpackBuildings\(d\)\{([\s\S]*?)\n\}/.exec(html);
    if (!body) bad("peel3d.js の unpackBuildings が読めない");
    else {
      const fn = new Function("d", "BL_V", "BL_HSRC", body[1]);
      const a = fn(src, VERSION, HSRC);
      const b = unpack(src).features;
      const same = a.length === b.length && a.every((f, i) =>
        JSON.stringify(f) === JSON.stringify(b[i]));
      same ? ok(`建物の詰め方が、書く側と読む側で一致（${a.length} 件で照合）`)
        : bad("建物の詰め方が、書く側と読む側で食い違う（形が静かにずれる）");
    }
  }
}

// ⚠ 「未整備のときの振る舞い」を見る検査は、その土地が未整備であることに寄りかかっている。
//   取り込んだ瞬間、検査は外へ出なくなり、何も確かめずに必ず通るようになる。
//   索引に載ったらここで落とす（render.mjs の UNSURVEYED と同じ土地）。
{
  const { readFileSync: rf2, existsSync: ex2 } = await import("node:fs");
  const { tileOf } = await import("../scripts/db.mjs");
  const ip = "public/data/ev/index.json";
  if (!ex2(ip)) bad("事物の索引が無い");
  else {
    const idx = JSON.parse(rf2(ip, "utf8"));
    // 索引は z12 の束ごとに、中の z14 タイルを1ビットずつ立てて持っている（読み方は evCovered）
    const covered = evCovered(idx, tileOf);
    // ⚠ **道具は `scripts/render/lib.mjs` へ移った**（2026-08-22 に suite へ割った）。
    const m = /const UNSURVEYED = "ll=([\d.]+),([\d.]+)/.exec(rf2("test/render/lib.mjs", "utf8"));
    if (!m) bad("render/lib.mjs の UNSURVEYED が読めない（未整備の検査が土地を失っている）");
    else {
      const { t, on } = covered(+m[2], +m[1]);
      on ? bad(`未整備の検査に使っている土地（z14 ${t.x}/${t.y}）を取り込んでしまった。`
            + "この土地は外へ出なくなり、検査は何も確かめずに通る。別の土地に移すこと")
        : ok(`未整備の検査に使う土地が、まだ未整備（z14 ${t.x}/${t.y}）`);
    }
    // ⚠ ピンは入口。押した先が未整備だと、来た人が最初に見るのが
    //   「分かっていません」になる。取り込んだ範囲と、見せている入口を一致させる。
    //   候補地は画面のコードに重複させず、export-places.mjs が生成した公開データを正とする。
    const quickPath = join(PUB, "data", "quick-places.json");
    if (!existsSync(quickPath)) bad("quick-places.json が無い（候補地の公開データが生成されていない）");
    else {
      const pins = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
      const outside = pins.filter((p) => !covered(p.lon, p.lat).on);
      !pins.length ? bad("quick-places.json に候補地が1つも無い")
        : outside.length ? bad("未整備の土地をピン留めしている: "
            + outside.map((p) => p.name).join("、"))
        : ok(`quick-places.json のピン ${pins.length} 件は、すべて取り込み済みの土地`);
    }
    // ⚠ 建物の索引も見る。3D の入口は「建物が取れる」ことに寄りかかっている
    {
      const bp = "public/data/bl/index.json";
      if (!ex2(bp)) bad("建物の索引が無い");
      else {
        const bi = JSON.parse(rf2(bp, "utf8"));
        const HALF_LON = 0.0090, HALF_LAT = 0.0070;   // peel3d.js の集計範囲
        const quickPath = join(PUB, "data", "quick-places.json");
        const pins = existsSync(quickPath) ? JSON.parse(await readFile(quickPath, "utf8")).places ?? [] : [];
        const bad2 = pins.filter((p) => {
          const a = tileOf(p.lon - HALF_LON, p.lat + HALF_LAT, 14);
          const b = tileOf(p.lon + HALF_LON, p.lat - HALF_LAT, 14);
          for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++)
            if (!bi.tiles[`${x}/${y}`]) return true;
          return false;
        });
        bad2.length
          ? bad(`3D のピンが、押すと Overpass 待ちになる: ${bad2.map((p) => p.name).join("、")}`)
          : ok(`3D のピン ${pins.length} 件は、すべて建物まで取り込み済み`);
      }
    }
  }
}

// ⚠ 上限に当たったタイルでは、消えた判定をしてはいけない。
//   ここは実際に動かして確かめる（読んで確かめると、後で条件が入れ替わっても気づけない）
{
  const { toDrop } = await import("../scripts/db.mjs");
  const was = ["wd:Q1", "wd:Q2"], alive = new Set(["wd:Q1"]);
  const normal = toDrop(was, alive, 0), cut = toDrop(was, alive, 1);
  (normal.length === 1 && normal[0] === "wd:Q2" && cut.length === 0)
    ? ok("上限に当たったタイルでは、消えたことにしない（通常 1 件／上限 0 件）")
    : bad(`消えた判定が壊れている: 通常 ${JSON.stringify(normal)} / 上限 ${JSON.stringify(cut)}`);
}

// ⚠ 索引に載っているのに本体が無いと、画面は 404 を「未整備」と読んで外へ出る。
//   逆に本体があるのに索引に無いと、配ったのに一度も使われない。
//   取り込みとデプロイがずれた状態を、ここで止める。
{
  const { existsSync: ex, readFileSync: rf } = await import("node:fs");
  for (const [name, dir, kind] of [["事物", "public/data/ev", "ev"], ["建物", "public/data/bl", "bld"]]) {
    const ip = `${dir}/index.json`;
    if (!ex(ip)) { bad(`${name}の索引が無い: ${ip}`); continue; }
    let idx;
    try { idx = JSON.parse(rf(ip, "utf8")); }
    catch (e) { bad(`${name}の索引が読めない: ${e.message}`); continue; }
    const keys = Object.keys(idx.tiles ?? {});
    if (!keys.length) { bad(`${name}の索引が空`); continue; }
    const miss = [], broken = [];
    for (const k of keys) {
      const f = `${dir}/${idx.z}/${k}.json`;
      if (!ex(f)) { miss.push(k); continue; }
      try {
        const j = JSON.parse(rf(f, "utf8"));
        const [z, x, y] = j.tile ?? [];
        if (`${x}/${y}` !== k || z !== idx.z) broken.push(`${k}→${z}/${x}/${y}`);
      } catch { broken.push(`${k}(壊れている)`); }
    }
    miss.length ? bad(`${name}: 索引にあるのに本体が無い ${miss.length} 件（${miss.slice(0, 3).join(",")}）`)
      : broken.length ? bad(`${name}: 索引と中身が食い違う ${broken.slice(0, 3).join(",")}`)
      : ok(`${name}の索引と本体が揃っている（z${idx.z} ${keys.length} 件）`);
  }
}

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

// ⚠ 説明から「この画面では自明なもの」を落とす規則が、**本題まで落としていない**こと。
//   規則そのものは index.html にしかない（掟: 同じ問いに答える実装を2つ持たない）ので、
//   ここでは書き写さずに切り出して動かす。書き写すと、直したのに検査が古いままになる。
{
  const { readFileSync: rf } = await import("node:fs");
  const html = rf("public/top.js", "utf8");
  const a = html.indexOf("const ADMIN ="), b = html.indexOf("// ⚠ 記録の精度どおりに書く");
  if (a < 0 || b < a) bad("説明を落とす規則が index.html に見つからない（目印が変わった？）");
  else {
    const evDesc = new Function(`${html.slice(a, b)}; return evDesc;`)();
    // [説明, 名前, 期待]
    const CASES = [
      // 落とす（この画面では自明）
      ["広島市中区にある被爆建物", "旧日本銀行広島支店", "被爆建物"],
      ["日本の広島県広島市に所在する医療機関、広島原爆の爆心地として知られる", "島病院",
        "医療機関、広島原爆の爆心地として知られる"],
      ["広島市にある戦争遺構、世界遺産、旧広島県産業奨励館", "原爆ドーム",
        "戦争遺構、世界遺産、旧広島県産業奨励館"],
      // ⚠ 名前を読めば分かるものは出さない（読んでも増えない）
      ["東京都江東区にある小学校", "江東区立豊洲小学校", ""],
      ["東京都江東区にある中学校", "江東区立深川第五中学校", ""],
      // ⚠ ここから下は「落としてはいけない」側。壊れたら嘘になる
      //   「かつて」を落とすと、無くなったものが**いまあるもの**になる
      ["かつて仙台市にあった日本国有鉄道の貨物駅", "宮城野貨物駅",
        "かつて日本国有鉄道の貨物駅"],
      //   行政区画の接尾辞を必須にしていないと、ここまで落ちる
      ["広島原爆の爆心地にある慰霊碑", "慰霊碑", "広島原爆の爆心地にある慰霊碑"],
      //   「の」を禁じていないと、公園名が消える
      ["仙台市の榴岡公園にある資料館", "資料館", "榴岡公園にある資料館"],
      ["広島平和記念公園にある休憩所", "レストハウス", "広島平和記念公園にある休憩所"],
      // 説明が無いものは、無いまま
      [null, "何か", ""], ["", "何か", ""],
    ];
    const ng = CASES.filter(([d, l, want]) => evDesc(d, l) !== want)
      .map(([d, l, want]) => `「${d}」→「${evDesc(d, l)}」（期待「${want}」）`);
    ng.length ? bad(`説明を落とす規則が壊れている: ${ng.join(" / ")}`)
      : ok(`説明を落とす規則（${CASES.length} 例。落としてはいけない側 4 例を含む）`);
  }
}

// ⚠ 索引の全区画が、**同じ問いに対して**見られていること。
//   coverage.spec は「何を訊いたか」で、訊く項目を増やすとここが変わる。
//   実際に踏んだ（2026-08-15）: 説明を足して 87 区画を取り直したとき、
//   渋谷駅の 1 区画だけ WDQS が retry 尽きで落ちた。仕組みは正しく「見ていない」として
//   古い spec を残したのに、**私がログを見ずにタイルを書き出した**。
//   結果、渋谷の 60 件だけ説明が無いまま配られ、しかも画面は
//   「落とすと何も残らない項目には出ません」と、取っていないものを落としたことにしていた
//   （掟: 取れなかったことを「無い」と言わない、の裏返し）。
//   spec に差が記録されているのに誰も見ていなかった。ここで見る。
{
  const { existsSync: ex } = await import("node:fs");
  const DB = ".data/konjaku.db";
  if (!ex(DB)) ok("索引の元データは手元に無い（取り込みを走らせた人だけが見る検査）");
  else {
    const { open } = await import("../scripts/db.mjs");
    const db = open();
    for (const layer of ["ev", "bld"]) {
      const rows = db.prepare(
        "SELECT spec, COUNT(*) c FROM coverage WHERE layer=? GROUP BY spec ORDER BY c DESC").all(layer);
      if (!rows.length) continue;
      if (rows.length === 1) { ok(`${layer} の索引 ${rows[0].c} 区画は、同じ問いで見ている`); continue; }
      const odd = rows.slice(1);
      const which = db.prepare(
        "SELECT z14x,z14y,n FROM coverage WHERE layer=? AND spec=? LIMIT 3").all(layer, odd[0].spec);
      bad(`${layer} の索引に、古い問いのまま残っている区画が ${
        odd.reduce((s, r) => s + r.c, 0)} 個ある（${
        which.map((r) => `${r.z14x}/${r.z14y}(${r.n}件)`).join(",")}）。`
        + `取り込みが落ちた区画。そのまま配ると、そこだけ中身が欠けたまま「そういうデータだ」と言うことになる`);
    }
  }
}


// 配布している年つき事物の**意味**を見る。
// ⚠ ここまでの検査は「索引と本体が揃っているか」（＝形）だけで、
//   中身の値どうしが矛盾していないかは1件も見ていなかった。値を壊しても CI は緑になる。
// ⚠ 数え上げは**対象件数と違反件数の両方**を出す。0 件だけ見せると、
//   「見て 0 件」と「そもそも見ていない」が同じ顔になる。
{
  const { readFileSync: rfe, readdirSync: rde, statSync: ste, existsSync: exe } = await import("node:fs");
  const { tileOf } = await import("../scripts/db.mjs");
  const ip = join(PUB, "data", "ev", "index.json");
  if (!exe(ip)) bad("事物の索引が無い（意味検査が何も見ていない）");
  else {
    const idx = JSON.parse(rfe(ip, "utf8"));
    const covered = evCovered(idx, tileOf);
    const files = [];
    (function walk(d) {
      if (!exe(d)) return;
      for (const e of rde(d)) {
        const q = `${d}/${e}`;
        ste(q).isDirectory() ? walk(q) : (e.endsWith(".json") && files.push(q));
      }
    })(join(PUB, "data", "ev", String(idx.z)));
    const PREC = ["year", "decade", "century"];
    const v = { 終了年が開始年より前: [], 精度が3種以外: [], 桁が精度と矛盾: [],
      タイルの外: [], 索引が見ていない場所: [], ID重複: [], 必須項目が無い: [] };
    const seen = new Map();
    let n = 0;
    for (const f of files) {
      let j; try { j = JSON.parse(rfe(f, "utf8")); } catch { bad(`事物の本体が壊れている: ${f}`); continue; }
      const [z, tx, ty] = j.tile ?? [];
      for (const x of j.f ?? []) {
        n++;
        const at = `${x.id ?? "(idなし)"}`;
        if (!x.id || !x.l || !Array.isArray(x.c) || !Array.isArray(x.y) || !x.p) v.必須項目が無い.push(at);
        const [from, to] = x.y ?? [];
        // ⚠ to は「分かっていない」で null になる（＝まだ在る、ではない）。null は違反ではない
        if (to != null && from != null && to < from) v.終了年が開始年より前.push(`${at} ${from}→${to}`);
        if (!PREC.includes(x.p)) v.精度が3種以外.push(`${at} ${x.p}`);
        // decade は開始年〜+9、century は開始年〜+99 として扱う。開始年の桁が合っていないと、
        // 幅の当て方（yspan）がそのままずれる
        if (x.p === "decade" && from % 10 !== 0) v.桁が精度と矛盾.push(`${at} decade ${from}`);
        if (x.p === "century" && from % 100 !== 0) v.桁が精度と矛盾.push(`${at} century ${from}`);
        if (Array.isArray(x.c) && x.c.length === 2) {
          const t = tileOf(x.c[0], x.c[1], z);
          if (t.x !== tx || t.y !== ty) v.タイルの外.push(`${at} ${t.x}/${t.y}≠${tx}/${ty}`);
          // ⚠ 索引が「見た」と言っていない場所のものを配らない。配ると、
          //   問い合わせていない地面について「これで全部」と言うことになる
          if (!covered(x.c[0], x.c[1]).on) v.索引が見ていない場所.push(`${at} ${x.c.join(",")}`);
        }
        if (x.id) { if (seen.has(x.id)) v.ID重複.push(`${at}（${seen.get(x.id)} と ${f}）`); else seen.set(x.id, f); }
      }
    }
    if (!files.length || !n) bad("配布している事物が1件も読めない（この検査が何も見ていない）");
    else {
      const hit = Object.entries(v).filter(([, a]) => a.length);
      hit.length
        ? bad(`配布データの意味に違反: ${hit.map(([k, a]) => `${k} ${a.length}件（${a.slice(0, 2).join(" / ")}）`).join("／")}`
            + `（対象 ${n} 件）`)
        : ok(`配布している事物 ${n} 件（${files.length} ファイル）に意味の違反なし`
            + `（範囲 ${Object.keys(v).length} 種を全件走査）`);
    }
  }
}

// 年の精度の決め方が、取り込み側（静的配布）と実行時（Wikidata 直）で同じであること。
// ⚠ 実際にずれていた（2026-08-16 に発見）。Wikidata の精度（dateP）が無いとき、
//   取り込み側は Number(undefined) が NaN になって "century"、実行時側は "year" を返していた。
//   同じ項目が、静的では 99年幅・実行時では 0年幅になり、**経路によって出る年代が変わる**。
//   ⚠ 字面を比べるのではなく、**両方の式を実際に動かして**突き合わせる。
{
  const ing = await readFile(join(ROOT, "scripts", "ingest-wikidata.mjs"), "utf8");
  const ev = await readFile(join(PUB, "events.js"), "utf8");
  const e1 = /const prec = \(p\) => \(([\s\S]*?)\);/.exec(ing)?.[1];
  // ⚠ 式の書き方に強くしておく。以前は `…"century"),` で終わる形しか拾えず、
  //   実行時側を古い形に戻すと**照合そのものをやめて**「式を読めない」で落ちていた
  //   （落ちるだけましだが、食い違いとして検出できていない）。
  //   precision: から次の url: までを丸ごと取る。
  //   ⚠ events.js には precision: が2つある（静的タイル側と Wikidata 直側）。
  //     row.dateP で始まるほう（＝実行時）に固定して拾う。
  const e2 = /precision:\s*(Number\(row\.dateP[\s\S]*?),\s*\n\s*(?:\/\/[^\n]*\n\s*)*url:/.exec(ev)?.[1];
  if (!e1 || !e2) bad(`年の精度の式を読めない（取り込み ${!!e1} / 実行時 ${!!e2}。この検査が何も見ていない）`);
  else {
    const f1 = new Function("p", `return (${e1});`);
    const f2 = new Function("p", `return (${e2.replaceAll("row.dateP?.value", "p")});`);
    // SPARQL は文字列で返す。⚠ 値が無い場合（undefined・空文字）が、まさにずれていた側
    const IN = ["11", "10", "9", "8", "7", "6", "0", "", undefined, null];
    const off = IN.filter((x) => f1(x) !== f2(x));
    off.length
      ? bad(`年の精度の決め方が経路で違う: ${off.map((x) => `${JSON.stringify(x)} → 取り込み ${f1(x)} / 実行時 ${f2(x)}`).join("、")}`)
      : ok(`年の精度の決め方が、取り込みと実行時で一致（${IN.length} 通りで照合。精度なし → ${f1(undefined)}）`);
  }
}

// 上流から消えた行（dropped_at）が、配布物に出ないこと。
// ⚠ 除外は Exporter の WHERE 1か所だけに依存している。落ちても配布物を見て気づけない
//   （消えた行が「まだ在る」として配られるので、画面はむしろ静かになる）。
// ⚠ **一時 DB と一時の書き出し先で走らせる。** Exporter は書き出し先を rmSync するので、
//   本物の public/data/ev を消さないよう KONJAKU_EV_OUT を渡す。
{
  const { mkdtempSync, rmSync: rmt, readFileSync: rft, existsSync: ext } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "konjaku-ev-"));
  try {
    const { SCHEMA } = await import("../scripts/db.mjs");            // ⚠ スキーマは写さない
    const { DatabaseSync } = await import("node:sqlite");
    const dbPath = join(dir, "t.db"), out = join(dir, "ev");
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    db.exec(`INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated)
             VALUES (14552,6451,'ev','wikidata','2026-08-16',2,0)`);
    const ins = db.prepare(`INSERT INTO feature
      (id,source,source_url,retrieved_at,label,kind,lon,lat,year_from,year_to,precision,dropped_at,z14x,z14y)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run("wd:QLIVE", "wikidata", "https://example.invalid/live", "2026-08-16",
      "生きている記録", "building", 139.79, 35.65, 1930, null, "year", null, 14552, 6451);
    ins.run("wd:QDROP", "wikidata", "https://example.invalid/drop", "2026-08-16",
      "上流から消えた記録", "building", 139.79, 35.65, 1931, null, "year", "2026-08-16", 14552, 6451);
    db.close();
    execFileSync(process.execPath, ["scripts/export-tiles.mjs"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, KONJAKU_DB: dbPath, KONJAKU_EV_OUT: out } });
    const idx = JSON.parse(rft(join(out, "index.json"), "utf8"));
    const key = Object.keys(idx.tiles)[0];
    const body = ext(join(out, String(idx.z), `${key}.json`))
      ? JSON.parse(rft(join(out, String(idx.z), `${key}.json`), "utf8")) : null;
    const ids = (body?.f ?? []).map((x) => x.id);
    !ids.includes("wd:QLIVE")
      ? bad(`Exporter が生きている行を配っていない（この検査が何も見ていない）: ${JSON.stringify(ids)}`)
      : ids.includes("wd:QDROP")
        ? bad("上流から消えた行（dropped_at）が配布物に入っている")
        : ok(`上流から消えた行は配布物に入らない（一時 DB で 2 件中 1 件を除外）`);
  } catch (e) {
    bad(`dropped_at の除外を確かめられなかった: ${String(e.message).split("\n")[0]}`);
  } finally {
    rmt(dir, { recursive: true, force: true });
  }
}

// 共通アセットの入口と、生成元の候補地が食い違わないこと。
// seeds を変更して export を忘れると、画面は古い候補を静かに出し続けるため、
// 公開JSONを生成元と突き合わせる。
{
  const seedLines = (await readFile(join(ROOT, "seeds", "areas.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((a) => a.quick);
  const quickPath = join(PUB, "data", "quick-places.json");
  if (!existsSync(quickPath)) bad("quick-places.json が無く、候補地の生成結果を照合できない");
  else {
    const places = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
    const key = (p) => `${p.id}|${p.lon}|${p.lat}|${p.title ?? ""}`;
    const want = new Set(seedLines.map((a) => key({id:a.id,lon:a.ll[0],lat:a.ll[1],title:a.quickTitle ?? a.title})));
    const got = new Set(places.map(key));
    const missing = [...want].filter((x) => !got.has(x));
    const extra = [...got].filter((x) => !want.has(x));
    missing.length || extra.length
      ? bad(`候補地の生成結果が seeds と不一致（不足 ${missing.length} / 余分 ${extra.length}）`)
      : ok(`候補地の生成結果が seeds/areas.jsonl と一致（${places.length} 件）`);
    // ⚠ トップの場所未選択で出すのは、この 10 件のうち **3 件だけ**（入力例）。
    //   index.html は id で指しているので、**配っているデータに その id が無いと
    //   例が 1 件も出ない**（画面側には先頭 3 件へ落ちる保険があるが、
    //   保険が働いた画面は「豊洲・渋谷・広島」ではなくなる。ここで気づけるようにする）。
    //   掟: 同じ問いに答える実装を2つ持つときは、機械で突き合わせる。
    const m = /const TOP_EXAMPLE_IDS\s*=\s*\[([^\]]*)\]/.exec(TOP);
    if (!m) bad("index.html の TOP_EXAMPLE_IDS を読めない（トップの入力例が何も突き合わされていない）");
    else {
      const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      const have = new Set(places.map((p) => p.id));
      const lost = ids.filter((id) => !have.has(id));
      ids.length !== 3
        ? bad(`トップの入力例が 3 件でない: ${ids.length} 件（${ids.join("・")}）`)
        : lost.length
          ? bad(`トップの入力例に、配っていない id がある: ${lost.join("・")}`
              + "（画面は先頭3件へ落ちるので、見た目は壊れず静かに別の土地になる）")
          : ok(`トップの入力例 3 件（${ids.join("・")}）は quick-places.json にある`);
    }
  }
}

// 共通アセットマニフェストの参照先が実在し、建物索引の版・日付と一致すること。
// 壊れた assets.json は建物だけ実行時取得へ落ちる入口になるため、存在確認だけで終わらせない。
{
  const path = join(PUB, "data", "assets.json");
  if (!existsSync(path)) bad("assets.json が無い（共通アセットの入口が生成されていない）");
  else {
    const m = JSON.parse(await readFile(path, "utf8"));
    const b = m.layers?.buildings;
    const idxPath = join(PUB, String(b?.index ?? "").replace(/^\.\//, ""));
    const tile = String(b?.tile ?? "");
    const idx = existsSync(idxPath) ? JSON.parse(await readFile(idxPath, "utf8")) : null;
    const tilePath = tile.replace(/^\.\//, "").replace("{x}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[0] ?? ""))
      .replace("{y}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[1] ?? ""));
    const errors = [];
    if (!b || b.format !== `packed-geojson-v${BL_VERSION}`) errors.push(`建物format=${b?.format ?? "なし"}`);
    if (!idx) errors.push("建物索引が無い");
    if (idx && b.at !== idx.at) errors.push(`建物at=${b.at} / 索引at=${idx.at}`);
    if (idx && (!Object.keys(idx.tiles ?? {}).length || !existsSync(join(PUB, tilePath)))) errors.push("建物タイルが無い");
    errors.length ? bad(`assets.json の建物参照が不正: ${errors.join("、")}`)
      : ok(`assets.json の建物参照が索引・タイルと一致（${Object.keys(idx.tiles).length} 区画）`);
  }
}


// 「取得の結末」と「一覧行のタグ」の字は **public/words.js の1か所**。
// ⚠ **2 画面（トップと /peel）と共有カードが、同じ字を使う。**
//   ⚠ 以前は 4 ファイルが同じ字を別々に書いていて、片方だけ直せば
//     **同じ状態に 2 通りの言い方**ができた（実際に踏んでいる。prov.js の冒頭に記録がある）。
// ⚠ DOM も地図も見ないので、ここで全部の枝を回す。
{
  await import(`file://${join(PUB, "words.js")}`);
  const W = globalThis.KonjakuWords;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!W) fails.push("words.js を読み込めない（この検査が何も見ていない）");
  else {
    // ---- ⚠ 読めて 0 件 と 答えを出せない を、同じ語にしない（掟の核心）----
    yes(W.S.noRecord !== W.S.cantTell, "「読めて 0 件」と「答えを出せない」が同じ語になっている");
    eq(W.meiji("田", true), "田", "値があるときは、その値を出す");
    eq(W.meiji("田", false), "田", "値があれば none に関係なくその値");
    eq(W.meiji(null, true), W.S.noRecord, "読めて 0 件のとき");
    eq(W.meiji(null, false), W.S.cantTell, "答えを出せないとき");
    // ⚠ **0 件を「無い」と言い切らない。**資料の話に留める
    yes(!/^ありません|存在しません|無い$/.test(W.S.noRecord),
      `0 件の語が「無い」と言い切っている: ${W.S.noRecord}`);
    // ⚠ **答えを出せないときに、数や割合を作らない**
    yes(!/\d/.test(W.S.cantTell), `答えを出せないのに数字が入っている: ${W.S.cantTell}`);

    // ---- ⚠ 根拠カードと共有カードは、同じ行を描く ----
    eq(W.meijiBadge(true), `明治期: ${W.S.noRecord}`, "根拠カードの 0 件の行");
    eq(W.meijiBadge(false), `明治期: ${W.S.cantTell}`, "根拠カードの答えを出せない行");

    // ---- ⚠ 組の見出し（2026-08-21。行ごとのタグをここへ移した）----
    // ⚠ **見出しを持たない組がある。**⚠ own（この場所を深掘り）と、打った語の周辺検索。
    //   ⚠ own はその行の見出しが「この場所を深掘り」で、⚠ **組の名前と同じ字になる**。
    for (const g of ["why", "ext"]) eq(W.groupTitle(g), W.GROUP[g], `groupTitle(${g})`);
    eq(W.groupTitle("own"), "", "深掘りに見出しが付いている（行の字と重なる）");
    eq(W.groupTitle("zzz"), "", "知らない組に見出しが出ている");
    eq(W.groupTitle(undefined), "", "組なしに見出しが出ている");
    // ⚠ **名前が互いに違う。**同じ字だと、組を分けた意味が無い
    yes(new Set(Object.values(W.GROUP)).size === Object.keys(W.GROUP).length,
      "組の見出しが重なっている");
    // ⚠ **消した TAG が戻っていない**（⚠ 行ごとのタグと組の見出しを両方持たない）
    yes(!("TAG" in W) && !("tag" in W), "行ごとのタグが戻っている（見出しと 2 か所になる）");
  }
  fails.length
    ? bad(`words.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`words.js を動かして確認（0 件と答えを出せないを分ける・根拠カードと共有カードが同じ行・組の見出しと既定値）`);
}

// ⚠ **字を持っているのは words.js だけ。**呼ぶ側に写しを作らない。
{
  const OWNED = ["記録なし", "さらに調べる", "公的な情報で確認する"];
  const bare = (f) => (src[f] ?? "")
    .replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
  const spill = [];
  for (const f of Object.keys(src)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    for (const w of OWNED) if (bare(f).includes(w)) spill.push(`${f}「${w}」`);
  }
  spill.length
    ? bad(`words.js が持つ字を、呼ぶ側が書き写している: ${spill.join("、")}`
        + `（片方だけ直すと、同じ状態に 2 通りの言い方ができる）`)
    : ok(`words.js が持つ字（${OWNED.length} 語）は、呼ぶ側に写しが無い`);
}

// ⚠ **答えに出る区分名の、平易な補助説明**（2026-08-22。hidetzu/konjaku#148）。
//
// ⚠ **これは原典ではない。**⚠ 原典（landform.json の why）は根拠パネルが出典つきで出す。
//   ⚠ **こちらが持つのは意味だけ**で、⚠ **定義・成因・災害リスクは持たない。**
//   ⚠ だから「丸写しでないこと」を機械で見る。⚠ 写した瞬間、同じ字の持ち主が 2 つになる。
//
// ⚠ **例外を作らない。**⚠ 答えに出うる区分が 1 つでも欠けると、
//   ⚠ **利用者から見て「説明がある区分」と「無い区分」の差が意味を持ってしまう**
//   （「説明が無いほうが普通の土地なのだろう」と読める）。
// ⚠ **数えるのは landform.json。**⚠ **ここに区分の一覧を書き写さない。**
{
  const W = globalThis.KonjakuWords;
  const LF = JSON.parse(await readFile(join(PUB, "data/landform.json"), "utf8"));
  const G = W?.GROUND_GLOSS ?? {};
  const cls = LF.classes ?? {};
  const fails = [];
  const LIMIT = 18;   // ⚠ Owner 決定 3（2026-08-22）。⚠ 1 行に収める上限

  if (!W?.groundGloss) fails.push("words.js が groundGloss を持っていない（この検査が何も見ていない）");
  if (!Object.keys(cls).length) fails.push("landform.json の区分を読めていない（この検査が何も見ていない）");

  // ⚠ **答えに出うる区分は、全部持つ**
  const missing = Object.keys(cls).filter((n) => !G[n]);
  if (missing.length) fails.push(`補助説明の無い区分が ${missing.length} 件: ${missing.slice(0, 5).join("、")}`);
  // ⚠ **無い区分の説明を持たない。**⚠ 画面に出ようがない字は、古くなっても誰も気づけない
  const extra = Object.keys(G).filter((n) => !cls[n]);
  if (extra.length) fails.push(`landform.json に無い区分の補助説明がある: ${extra.join("、")}`);

  for (const [name, g] of Object.entries(G)) {
    // ⚠ **1 行・18 字まで**。⚠ 2 行になると、答えより説明のほうが長くなる
    if ([...g].length > LIMIT) fails.push(`${name}: ${[...g].length} 字（上限 ${LIMIT}）`);
    if (/[\n\r]/.test(g)) fails.push(`${name}: 改行が入っている（1 行に収める）`);
    // ⚠ **原典の丸写しでない。**⚠ 写すと、同じ字の持ち主が landform.json と 2 つになる
    if ((cls[name]?.why ?? "").includes(g)) fails.push(`${name}: 原典（why）をそのまま写している`);
    // ⚠ **数字を出さない**（掟3: 出すのは実測値そのものと、その取り方だけ）。
    //   ⚠ 原典には「0.5〜数メートル」のような数がある。⚠ **要約した 18 字に数だけ残すと、
    //     どの範囲の数字か分からなくなる**（掟4: 数字は必ず主張範囲の分母で書く）
    if (/[0-9０-９]/.test(g)) fails.push(`${name}: 補助説明に数字が入っている（${g}）`);
    // ⚠ **⚠ の印を使わない。**⚠ この製品では災害リスク専用（CLAUDE.md §4-1）
    if (g.includes("⚠")) fails.push(`${name}: 補助説明に ⚠ が入っている（災害リスクの印と紛れる）`);
  }
  // ⚠ **互いに違う。**⚠ 2 つの区分に同じ説明が付くと、⚠ **説明が区分を見分けられていない**
  const dup = Object.values(G).length - new Set(Object.values(G)).size;
  if (dup) fails.push(`同じ補助説明が ${dup} 組の区分に付いている（説明が区分を見分けていない）`);

  // ⚠ **知らない名前には何も返さない。**⚠ こちらで作らない（掟の一行目）
  if (W?.groundGloss?.("この区分は存在しない") !== "") fails.push("知らない区分名に説明を返している");


  // ⚠ **行と区分名の対応は words.js が持つ。**⚠ 画面に数えさせない
  if (W?.ground1Names) {
    const n2 = W.ground1Names("旧水部", "盛土地･埋立地"), l2 = W.ground1Lines("旧水部", "盛土地･埋立地");
    const n1 = W.ground1Names("低地", null), l1 = W.ground1Lines("低地", null);
    if (n2.length !== l2.length || n1.length !== l1.length)
      fails.push("ground1Names と ground1Lines の行数が合っていない（説明が別の区分に付く）");
    if (n2[0] !== "旧水部" || n2[1] !== "盛土地･埋立地") fails.push("ground1Names の順が答えの行と違う");
  } else fails.push("words.js が ground1Names を持っていない");

  // ⚠ **読み上げも、画面と同じものを同じ順で言う**（2026-08-22）。
  //   ⚠ **見える人だけが意味を受け取り、聞く人は区分名だけ、にしない。**
  //   ⚠ 実描画がここを捕まえた（画面へ足したのに、声が古いままだった）。
  if (W?.ground1Speech) {
    const sp = W.ground1Speech("旧水部", "盛土地･埋立地");
    const ls = W.ground1Lines("旧水部", "盛土地･埋立地"), ns = W.ground1Names("旧水部", "盛土地･埋立地");
    let at = -1;
    for (let i = 0; i < ls.length; i++) {
      // ⚠ **順を見る。**⚠ 含んでいるだけでは、区分名と意味が入れ替わっていても通る
      for (const part of [ls[i], W.groundGloss(ns[i])]) {
        if (!part) continue;
        const j = sp.indexOf(part);
        if (j <= at) fails.push(`読み上げの第1層で「${part}」の順が画面と違う`);
        at = Math.max(at, j);
      }
    }
    // ⚠ **共有カードの文は変えていないこと**（1 枚の絵に焼く文。入る量が違う）
    if (W.ground1Text("旧水部", "盛土地･埋立地").includes(W.groundGloss("旧水部")))
      fails.push("共有カードの文にも補助説明が入っている（焼く文と読む文を同じにしない）");
  } else fails.push("words.js が ground1Speech を持っていない（画面に足した字を声が読まない）");
  // ⚠ **画面が読み上げも words.js から取っていること**
  if (!TOP.includes("KonjakuWords.ground1Speech"))
    fails.push("index.html が KonjakuWords.ground1Speech を通っていない（声だけ古くなる）");

  // ⚠ **呼ぶ側が書き写していないこと。**⚠ コメントは先に落とす（CLAUDE.md §5）
  const bare = (f) => (src[f] ?? "")
    .replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
  const spilled = [];
  for (const f of Object.keys(src)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    const b = bare(f);
    for (const g of Object.values(G)) if (b.includes(g)) spilled.push(`${f}「${g}」`);
  }
  if (spilled.length) fails.push(`補助説明を書き写している: ${spilled.slice(0, 3).join("、")}`);
  // ⚠ **画面が words.js を通っていること**（写しが無いだけでは、出していない場合と区別できない）
  if (!TOP.includes("KonjakuWords.groundGloss"))
    fails.push("index.html が KonjakuWords.groundGloss を通っていない（説明が画面に出ていない）");

  fails.length
    ? bad(`区分名の補助説明が掟どおりでない（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`区分名の補助説明は ${Object.keys(G).length} 区分ぶん揃っている`
       + `（landform.json の ${Object.keys(cls).length} 区分と一致／${LIMIT} 字以内／`
       + `原典の丸写しなし／互いに違う／呼ぶ側に写しなし）`);
}

// ⚠ **ものさしの目盛りに置く、短い年**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
//   ⚠ **狭い幅では「1984–86」が 53px あり、9 段で 488px 要る**（実測 2026-08-22・12px）。
//   ⚠ **入らないから間引く、はやらない**（間引くと「その年代は無い」と読まれる。掟 §1）。
//   ⚠ **短くして全部出す。**⚠ だから、⚠ **短くする側が壊れると画面が嘘をつく。**
// ⚠ **DOM 無しで確かめられる**（`.claude/rules/testing.md`: Domain の変換に代表ケースを持つ）。
{
  const W = globalThis.KonjakuWords;
  const fails = [];
  if (W?.eraTick) {
    // ⚠ **字を書き写しているのではない。**⚠ 入れた字と出た字の関係だけを見ている
    const cases = [["1984–86", "’84"], ["1936–42", "’36"], ["現在", "現在"], ["明治期", "明治期"],
                   ["", ""], [null, ""], [undefined, ""], ["昭和のいつか", "昭和のいつか"]];
    for (const [inp, want] of cases) {
      const got = W.eraTick(inp);
      if (got !== want) fails.push(`eraTick(${JSON.stringify(inp)}) が ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`);
    }
    // ⚠ **短くしても、⚠ 別の年代と同じ字にならないこと**（⚠ 同じ字だと段が見分けられない）
    const all = ["1987–90", "1984–86", "1979–83", "1974–78", "1961–69", "1955–60", "1945–50", "1936–42"];
    const short = all.map((t) => W.eraTick(t));
    if (new Set(short).size !== short.length)
      fails.push(`短くすると同じ字になる年代がある: ${short.join("、")}`);
  } else fails.push("words.js が eraTick を持っていない（この検査が何も見ていない）");

  fails.length
    ? bad(`ものさしの短い年が壊れている（${fails.length} 件）: ${fails.slice(0, 4).join(" / ")}`)
    : ok("ものさしの短い年は、渡された字から取り出すだけ（知らない形はそのまま／段どうしが同じ字にならない）");
}

// 「いま画面に出ているもの」（台帳）は **public/prov.js の1か所**。
// ⚠ ここが掟の一行目（取れなかった ≠ 無い）を、いちばん広い面で守っている。
//   以前は peel3d.js の render() の中で組んでいたので、
//   **ブラウザを立てて、その状態を実際に作れたときしか**確かめられなかった。
//   DOM も地図も見ない形にしたので、ここで**全組み合わせ**を回す。
// ⚠ 字面ではなく **tag**（実測／未取得／欠落／未対応／推定）で見る。
//   文言は変わる。変わってはいけないのは「どの語を使ってよいか」のほう。
{
  await import(`file://${join(PUB, "prov.js")}`);
  const P = globalThis.KonjakuProv;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!P) fails.push("prov.js を読み込めない（この検査が何も見ていない）");
  else {
    const ERA = { label: "1984–86" };
    // ⚠ **答えが出せない問いには、⚠ 「詳しく見る」を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ 実測（網走市・1280×950）: ⚠ **「この範囲に明治期の低湿地データが無い」の下に出ていた。**
    //   ⚠ **断りは消さない。**⚠ **畳んでいた実測の行だけ出さない**（掟 §1）。
    {
      const list = [{ q: 2, level: "no", tag: "未取得", body: "取れていない" },
                    { q: 2, level: "ok", tag: "実測", body: "これは材料" }];
      const on  = P.section(list, "詳しく見る", true);
      const off = P.section(list, "詳しく見る", false);
      yes(/詳しく見る/.test(on),   "答えがあるのに「詳しく見る」が無い");
      yes(!/詳しく見る/.test(off), "答えが出せないのに「詳しく見る」がある（何を見るのか分からない）");
      yes(/取れていない/.test(off), "「詳しく見る」を隠したら、断りまで消えた（掟 §1）");
    }
    // ---- 地表。届いていないなら「実測」と言わない ----
    eq(P.groundRow(true, ERA).tag, "実測", "届いた地表");
    eq(P.groundRow(false, ERA).tag, "未取得", "届いていない地表");
    yes(P.groundRow(false, ERA).body.includes("1984–86"), "届いていない地表に、どの年代かが無い");
    yes(P.groundRow(false, null).body.includes("明治期"), "明治期の地表の呼び名");
    // ⚠ ここが本丸。届いていないことを「無い」と言わせない
    yes(/記録の有無は分かっていない/.test(P.groundRow(false, ERA).note ?? ""),
      "届いていない地表に「記録の有無は分かっていない」が無い");

    // ---- 水面。読めなかった（未取得）と、本当に無い（整備対象外）を混ぜない ----
    eq(P.waterRow({ waterRead: true }).tag, "実測", "読めた水面");
    eq(P.waterRow({ waterRead: false, waterUnread: true }).tag, "未取得", "読めなかった水面");
    // ⚠ **整備対象外のときは、⚠ 材料の行を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ **層の理由が既に「この範囲は明治期の低湿地データの整備対象外です」と言っている。**
    //   ⚠ **前は 2 行目が「この範囲に明治期の低湿地データが無い」で、⚠ 言い切っていた**
    //     （掟 §1: ⚠ **データにない ≠ 現実にない**）。
    //   ⚠ **混ぜないという主張は変えていない。**⚠ **読めなかったときは、⚠ 上の行が残る。**
    yes(P.waterRow({ waterRead: false, waterUnread: false }) === null,
      "整備対象外なのに材料の行を出している（層の理由と同じことを 2 回言う）");
    // ⚠ **`null` が並びから落ちること**（⚠ 落とし忘れると、⚠ 画面を組む側で落ちる）
    yes(P.rows({ area: { waterRead: false, waterUnread: false }, groundArrived: true })
      .every(Boolean), "行の並びに null が混ざっている");

    // ---- 建物。0 件は「読んだ結果」なので実測の側 ----
    eq(P.buildingRows({ bldState: "loading" })[0].tag, "未取得", "取得中の建物");
    eq(P.buildingRows({ bldState: "notyet" })[0].tag, "未対応", "まだ提供していない建物");
    eq(P.buildingRows({ bldState: "fail" })[0].tag, "未取得", "取れなかった建物");
    eq(P.buildingRows({ bldState: "ok", total: 0, bldSource: "overpass" })[0].tag, "実測",
      "正常に 0 件だった建物");
    yes(/OSM に登録が無いだけで/.test(P.buildingRows({ bldState: "ok", total: 0 })[0].note ?? ""),
      "0 件のときに「現地に無いとは限らない」が無い");
    // ⚠ **「まだ提供していない」の文は、prov.js の 1 つだけ。**
    //   実測（2026-08-18）: 同じ事実に 2 通りの文があり、20 秒のあいだに入れ替わっていた。
    //     待っているあいだ … 「この場所の建物データは、まだ用意できていません」
    //     終わったあと     … 「建物ごとの判定は、この場所ではまだ提供していません」
    //   ⚠ 入れ替わると、同じことを言っているのだと分からない。
    yes(typeof P.NOTYET === "string" && P.NOTYET.length > 8, "NOTYET を配っていない");
    yes(typeof P.NOTYET_WHY === "string" && /通信の問題ではありません/.test(P.NOTYET_WHY),
      "NOTYET_WHY を配っていない、または「通信の問題ではありません」が無い");
    // ⚠ 主語は「建物データ」ではなく「建物ごとの判定」。建物そのものは出ることがある
    yes(/建物ごとの判定/.test(P.NOTYET), `NOTYET の主語が「建物ごとの判定」でない: ${P.NOTYET}`);
    yes(P.buildingRows({ bldState: "notyet" })[0].body.includes("この場所ではまだ提供していません"),
      "台帳の行が NOTYET を使っていない");

    // ⚠ 「届かなかった」と言う行には、打ち消しの但し書きが要る。
    //   ⚠ **水面の行だけ、いまこれを持っていない**（2026-08-18 にこの検査で見つけた）。
    //     このリファクタでは文言を変えない約束なので直していない。`tmp/9/24` に記録した。
    for (const [rowOf, what] of [
      [() => P.groundRow(false, ERA), "地表"],
      [() => P.buildingRows({ bldState: "loading" })[0], "取得中の建物"],
      [() => P.buildingRows({ bldState: "fail" })[0], "取れなかった建物"],
      [() => P.unreadRow({ unread: 232 })[0], "足元を判定できなかった建物"],
    ]) {
      const r = rowOf();
      yes(/限らない|分かっていない/.test(r.note ?? ""), `${what}の「未取得」に打ち消しの但し書きが無い`);
    }
    // ⚠ 「未対応」は**こちらの都合**。通信の話に読ませない（CLAUDE.md §4-1）
    {
      const r = P.buildingRows({ bldState: "notyet" })[0];
      yes(/通信の問題ではありません/.test(r.note ?? ""), "未対応に「通信の問題ではありません」が無い");
      yes(!/取得中|取得できませんでした|届いていない/.test(r.body + (r.note ?? "")),
        "未対応の行が、通信のせいに読める言い方をしている");
      yes(/現地に建物が無いという意味でもありません/.test(r.note ?? ""),
        "未対応に「現地に無いという意味ではない」が無い");
    }
    // ⚠ **光らせるボタンは、⚠ 内訳（`paintBreakdown`）が持つようになった**（2026-08-22。Owner 判断）。
    //   ⚠ **主張は同じ**（⚠ 建設年が 1 件も分かっていないときは出さない。⚠ ADR 0026）。
    //   ⚠ **見る場所が `prov.js` → 内訳へ移っただけ。**⚠ 下の breakdown の節が見ている。
    // ⚠ **材料の行は「どうやって決めたか」だけを言う**（⚠ 件数は内訳が持つ。掟 §6）。
    yes(!/\d+\s*\/\s*\d+/.test(
          P.buildingRows({ bldState: "ok", total: 9, dated: 3 }).map((r)=>r.body+(r.note??"")).join("")),
      "材料の行が件数を言っている（⚠ 内訳と同じ数字を 2 か所で言うことになる）");

    // ---- 全組み合わせ。⚠ ここが「ブラウザでは作れない状態」を含む ----
    const TAGS = new Set(Object.values(P.TAGS));
    let n = 0;
    for (const groundArrived of [true, false])
    for (const era of [null, ERA])
    for (const area of [null,
        { waterRead: true, bldState: "loading" },
        { waterRead: true, bldState: "notyet" },
        { waterRead: true, bldState: "fail" },
        { waterRead: false, waterUnread: true, bldState: "fail" },
        { waterRead: false, waterUnread: false, bldState: "ok", total: 0, bldSource: "tile" },
        { waterRead: true, bldState: "ok", total: 0, bldSource: "overpass" },
        { waterRead: true, bldState: "ok", total: 533, dated: 8, unread: 0,
          hSrc: { measured: 42, levels: 64, default: 427 } },
        { waterRead: false, waterUnread: true, bldState: "ok", total: 5017, dated: 0, unread: 232 }]) {
      const rows = P.rows({ groundArrived, era, area });
      n++;
      for (const r of rows) {
        if (!TAGS.has(r.tag)) fails.push(`知らない語が台帳に出た: ${r.tag}`);
        if (!["ok", "no", "est"].includes(r.level)) fails.push(`知らない level: ${r.level}`);
        // ⚠ 「読めなかった」の行が、**その事物が無い**と言い切っていないか。
        //   ⚠ 打ち消し（「無いとは限らない」等）は先に落とす。落とさないと、
        //     守っている行のほうが引っかかる。
        //   ⚠ 見るのは**事物の有無**だけ。「まだ提供していません」はこちらの都合の話で、
        //     現地に無いとは言っていないので、当ててはいけない。
        if (r.tag === "未取得" || r.tag === "未対応") {
          const t = (r.body + " " + (r.note ?? ""))
            .replace(/無いとは限らない|無いという意味でもありません|有無は分かっていない/g, "");
          if (/(建物|記録|データ|写真|資料)(は|が)(無い|ありません|存在しません)/.test(t))
            fails.push(`「${r.tag}」の行が、無いと言い切っている: ${r.body}`);
        }
      }
      // 地表の行は必ず先頭に 1 つ。出ているものの出所を落とさない
      if (rows[0].body.indexOf("地表") !== 0) fails.push("台帳の先頭が地表の行ではない");
      // HTML は 1 か所でしか作らない。行の数だけ div が出る
      const html = P.html(rows);
      eq((html.match(/<div class="prov /g) ?? []).length, rows.length, "行の数と div の数");
      if (/<script|onerror=|javascript:/i.test(html)) fails.push("台帳の HTML に危ないものが入った");
    }
    eq(n, 36, "回した組み合わせの数");
  }
  fails.length
    ? bad(`prov.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`prov.js を動かして確認（語彙 5・36 通りの状態で、読めなかったことを「無い」と言わない）`);
}






// ---------- 9. 画面の言葉 ----------
head("9. 画面の言葉");
// 画面に出ている語の棚卸し。判断は docs/adr/0029-画面の言葉は利用者の問いから決める.md。
//
// ⚠ **散文の表を文書に置かない。** 文言は段階を分けて直すので、表を文書へ書くと、
//   直した先から表のほうが黙って古くなる（CLAUDE.md「古くなったコメントはコードより強く誤誘導する」）。
//   ここに置いて、**両方向で**突き合わせる:
//     ① 表より少ない … 直したのに表に残っている（表が古い）
//     ② 表より多い   … 増やした（棚卸しを通さずに内部語が増えた）
{

  // 棚卸し（2026-08-17 実測）。
  //   kind … 分類 = 作り手側の区別で、利用者の問いではない
  //          状態 = 4つの状態（正常0件 / 対象範囲外 / 取れなかった / 判定できない）を指す語
  //   live … コメントを落としたあとに残る件数。**0 になったら、この行ごと消す**
  //   next … どの段で直すか
  const SCREEN_WORDS = [
    // ⚠ **2026-08-20（#9d）に、次の 4 語が画面から消えた。**⚠ **行ごと落とした。**
    //   `自前・根拠あり` … ⚠ **中身が全部この土地の根拠で、バッジが何も分けていなかった**
    //   `根拠あり`       … ⚠ 一覧行のタグは #9c で `今昔で見る` に。バッジは上と一緒に消えた
    //   `直読み` `ベクトル直読み`
    //                  … ⚠ **取り方の話で、確かさを語っていなかった**。`読んだ値` に。
    //                    ⚠ **字は words.js の METHOD が持ち、verify.js は鍵だけ渡す**
    // ⚠ **2026-08-20 に、字の持ち主を `public/words.js` の 1 か所へ寄せた。**
    //   ⚠ **画面に出る字は 1 文字も変えていない。**⚠ **だから live はほとんど減らない。**
    //     減ったのは**写し**のほう（外部↗ 2 → 1・記録なし 3 → 1・判定できません 5 → 3）。
    //   ⚠ **言い換えそのものは、まだ済んでいない**（画面に出る言葉なので人が決める）。
    // ⚠ **一覧行のタグは 2026-08-20 に「行き先」で言い直した**（#9c）。
    //   ⚠ `根拠あり` → `今昔で見る` ／ `外部↗` → `別のサイト↗`。
    //   ⚠ **`根拠あり` は作り手側の分類で、しかも実態と合っていなかった**
    //     （own は「根拠がある行」ではなく「今昔の中で開くレンズ」。why の側にも根拠はある）。
    { word: "境目", kind: "分類", live: 4, next: "済",
      files: ["verify.js"],
      seat: "⚠ **2026-08-20 に 5 → 4。**取得方法バッジからは消えた（`近くで分かれている` に）。"
          + "⚠ **残る 4 件は語ではなく文**（「区分の境目にあたる可能性がある」など）。"
          + "⚠ **作り手側の分類ではなく、土地そのものの説明**なので残す" },
    { word: "データ・判定について", kind: "分類", live: 1, next: "済",
      files: ["index.html", "top.js"],
      seat: "フッターの畳み見出し。⚠ **2026-08-20 に「データについて」から。**"
          + "中身は判定方法・位置誤差・提供範囲・限界まで説明していて、見出しと合っていなかった" },
    { word: "この範囲で、年が記録されているもの", kind: "分類", live: 1, next: "済",
      files: ["index.html", "top.js"],
      seat: "フッターの出典欄。⚠ **2026-08-20 に「この範囲にできていたもの」から。**"
          + "⚠ **開業／設立／完成のどれかを区別できない**ので、「できていた」と言い切らない" },
    // ⚠ **2026-08-20 に言い直した**（#9c）。⚠ **「変化が無かった」と読ませない。**
    //   こちらが持っている記録の話であって、現実に何も起きなかったという意味ではない。
    { word: "この期間に表示できる変化の記録は見つかっていません", kind: "状態", live: 1, next: "済",
      files: ["index.html", "top.js"], seat: "正常0件。Wikidata は読めている" },
    { word: "記録なし", kind: "状態", live: 1, next: "#9c",
      files: ["words.js"],
      seat: "正常0件（明治期タイルは読めた）。⚠ **2026-08-20 に 3 → 1**。"
          + "index.html / verify.js / share.js が同じ字を別々に書いていた（共有カードにも出る）" },
    { word: "判定できません", kind: "状態", live: 3, next: "#9c",
      files: ["verify.js", "peel3d.js", "words.js"],
      seat: "判定できない。「判定できませんでした」も含む。"
          + "⚠ 2026-08-19 に 7 → 5（peel3d.js の 3 か所を WORD.cantSay へ）。"
          + "⚠ 2026-08-20 に 5 → 3（字の持ち主を words.js へ）。"
          + "⚠ **残る 2 件は語ではなく文**。主語が違うので 1 つにしていない" },
    { word: "未取得", kind: "状態", live: 6, next: "⚠ 台帳の語彙",
      files: ["prov.js"],
      seat: "⚠ **2026-08-20 に 7 → 6。**取得方法バッジからは消えた（`読み込めませんでした` に）。"
          + "⚠ **残るのは /peel の台帳だけ**で、⚠ **これは prov.js が持つ 5 語のひとつ**"
          + "（実測／未取得／欠落／未対応／推定）。⚠ **docs/DOMAIN.md §3 と ADR が固定している語**なので、"
          + "⚠ **言い換えるなら台帳の語彙ごと決め直す**。#9e の枠では触らない" },
  ];

  // ⚠ **写真の状態と、画面を分断したままにする**（2026-08-20・hidetzu/konjaku#116）。
  //   ⚠ **層は 3 つ。**⚠ **越えたら止める。**
  //     photos.js  … ⚠ **状態を決める。**⚠ **文字列を 1 つも持たない**
  //     words.js   … ⚠ **字を決める。**⚠ **状態の作り方を知らない**
  //     画面        … ⚠ **置くだけ。**⚠ **何も判断しない**
  //   ⚠ **相手先の振る舞いが変わっても、直すのは photos.js の 1 か所。**
  //   ⚠ 実際に踏んだ: 「何の写真か」を 2 画面が別々に組み立てていた。
  {
    const bad2 = [];
    // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **何を直したかの説明を拾う**（CLAUDE.md §5）
    const ph = stripJs(await readFile(join(PUB, "photos.js"), "utf8"), "photos.js");
    // ⚠ **取得の層に、画面へ出す字を書かない。**
    //   ⚠ 「通信できません」などの理由は、⚠ **places.js と揃える約束**なのでここが持つ。
    //   ⚠ **それ以外の、利用者へ向けた文を書かない。**
    for (const w of ["まだ出ていません", "読み込めませんでした", "接続を確認", "インターネット"])
      if (ph.includes(w)) bad2.push(`photos.js が画面の字を持っている（「${w}」）`);
    // ⚠ **画面が「何の写真か」を組み立てない。**⚠ 組み立てると、判断が画面ごとに増える
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const bare = (src[f] ?? "").replace(HTML_COMMENT, " ")
        .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
      // ⚠ **写真の状態の文脈だけを見る。**⚠ 「明治期の地面と見くらべる」は深掘りの案内で、
      //   ⚠ **別の文**（それまで拾うと、直しようのない誤検出になる）。
      for (const w of ["いまの街の写真", "この年代の写真は", "明治期の地面は"])
        if (bare.includes(w)) bad2.push(`${f} が「何の写真か」を組み立てている（「${w}」）`);
      // ⚠ **画面が接続の話を自分で決めない**（photoSay が返したものを置くだけ）
      if (/navigator\.onLine\s*===?\s*false/.test(bare))
        bad2.push(`${f} が接続の話を自分で判断している（状態に持たせる）`);
    }
    bad2.length
      ? bad(`写真の状態と画面が分断できていない: ${bad2.join("、")}`)
      : ok("写真は「状態（photos.js）→ 字（words.js）→ 置くだけ（画面）」に分かれている");
  }

  // ⚠ **取得の層を、画面が直接呼ばない**（hidetzu/konjaku#121）。
  //
  //   verify.js   外から取ってくる。⚠ **控えることを知らない**
  //   land.js     取得済みを控える、ただ1か所。⚠ **画面はここだけを見る**
  //   画面        置くだけ
  //
  //   ⚠ **なぜ要るか（実測 2026-08-20・main = d410455・豊洲・375x667・SW 無効）**:
  //     トップで地形分類を 2 本取ったあと、/peel が同じ座標で **もう 2 本**取っていた。
  //     ⚠ 画面が別々に取得の層を呼んでいたので、片方が取ったことをもう片方が知らなかった。
  //   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
  {
    const bad3 = [];
    // ⚠ **画面が呼んではいけない口。**⚠ land.js だけが呼ぶ
    const DIRECT = ["landform", "meiji", "elevation", "photos", "facts"];
    for (const f of ["index.html", "peel3d.js"])
      for (const m of DIRECT)
        if (new RegExp("Konjaku\\." + m + "\\s*\\(").test(seen[f] ?? ""))
          bad3.push(`${f} が取得の層を直接呼んでいる（Konjaku.${m}）`);
    // ⚠ **land.js に画面の字を書かない**（控える層は、何と表示するかを知らない）
    const LD = seen["land.js"] ?? "";
    if (!LD) bad3.push("land.js を読めていない（この検査が何も見ていない）");
    for (const w of ["記録なし", "判定できません", "読み込めませんでした", "ありません"])
      if (LD.includes(w)) bad3.push(`land.js が画面の字を持っている（「${w}」）`);
    // ⚠ **land.js が取り方を知らない。**タイルの URL を組み立てたら、取得の層と二重になる
    for (const w of ["gsi.go.jp", "fetch(", "loadImage"])
      if (LD.includes(w)) bad3.push(`land.js が取り方を持っている（「${w}」）`);
    // ⚠ **両画面が land.js を読んでいる。**読み忘れると、その画面だけ落ちる
    for (const f of ["index.html", "peel.html"])
      if (!/src="\.\/land\.js"/.test(src[f] ?? "")) bad3.push(`${f} が land.js を読んでいない`);
    // ⚠ **Service Worker の SHELL に入っている**（words.js と同じ性質。来ないと両画面が落ちる）
    if (!/"\/land\.js"/.test(src["sw.js"] ?? "")) bad3.push("sw.js の SHELL に land.js が無い");
    // ⚠ **「取れなかった」の印を、2 か所が見ている。**
    //   verify.js は「再試行を出すか」を、land.js は「控えてよいか」を、⚠ **同じ印で**決める。
    //   ⚠ **違う問いなので実装は 1 つにできない。**⚠ **だから機械で突き合わせる**（掟）。
    //   ⚠ 片方の印だけ名前が変わると、⚠ **取れなかった回を控えてしまい、
    //     その土地が「取れない土地」として固まる。**⚠ 画面は静かに嘘をつく。
    {
      // ⚠ **ファイル全体で探さない。**⚠ 同じ語は別の用途でも出てくるので、
      //   ⚠ **verify.js が「読めなかった」を数えている行そのもの**を取り出して見る
      //   （2026-08-20 に踏んだ: 全体で探していたら、この行を書き換えても緑だった）。
      const VJ = seen["verify.js"] ?? "";
      const unreadLine = (VJ.match(/unread:\s*list\.filter\([^\n]*\)/) ?? [""])[0];
      if (!unreadLine)
        bad3.push("verify.js の unread を数えている行が見つからない（この検査が何も見ていない）");
      // その行が、この 3 つで「読めなかった」を判断している
      const MARKS = [["UNREACHABLE", "取れなかった"], ['"partial"', "一部だけ読めた"],
                     ["artificialUnread", "人工地形だけ落ちた"]];
      for (const [w, why] of MARKS)
        if (unreadLine && !unreadLine.includes(w))
          bad3.push(`verify.js の unread が「${why}」を見なくなった（${w}）`
            + `。land.js の keepable も直す`);
      // land.js が、その 3 つを全部見ているか
      for (const [w, why] of MARKS)
        if (!LD.includes(w))
          bad3.push(`land.js が「${why}」を見ていない（${w}）。控えると固まる`);
    }
    bad3.length
      ? bad(`土地情報の取得と画面が分断できていない: ${bad3.join("、")}`)
      : ok("土地情報は「取得（verify.js）→ 控える（land.js）→ 置くだけ（画面）」に分かれている");
  }

  // ⚠ **明治期の「面」も、取得の層が持つ**（hidetzu/konjaku#126）。
  //
  //   ⚠ **2026-08-20 まで、⚠ peel3d.js の中に 74 行あった**
  //     （tileCache / getTile / readTile / buildWater）。⚠ その中身は
  //     ⚠ **タイル URL の組み立て・複数枚の取得・canvas の画素読み・分類・集計・
  //       失敗の数え方・キャッシュ**で、⚠ **全部が取得の層の仕事だった。**
  //   ⚠ **3 つめのキャッシュでもあった**（land.js の inflight／verify.js の imgCache と別）。
  //
  //   ⚠ **線の引き方**（Owner 判断＝案B。⚠ **矩形化は画面に残す**）
  //     verify.js   swaleArea(bbox) … mask ＋ 集計。⚠ **GeoJSON は作らない**
  //     land.js     meijiArea(bounds) … 呼んで控える。⚠ **取り方は知らない**
  //     peel3d.js   mask → 矩形 → GeoJSON → MapLibre。⚠ **水かどうかは判定しない**
  //
  //   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
  {
    const bad5 = [];
    const VJ = seen["verify.js"] ?? "", LD = seen["land.js"] ?? "", PJ = seen["peel3d.js"] ?? "";
    if (!VJ || !LD || !PJ) bad5.push("読めていないファイルがある（この検査が何も見ていない）");

    // ⚠ **取得の層が持っていること。**⚠ **名前の境界まで見る**（2026-08-20 に直した）。
    //   ⚠ includes だけだと、⚠ **`swaleAreaX` に改名しても `swaleArea` を含むので通る**
    //     （実際にわざと壊したら落ちなかった）。
    for (const w of ["swaleArea", "swalePixel"])
      if (!new RegExp("function\\s+" + w + "\\s*\\(").test(VJ))
        bad5.push(`verify.js が function ${w}() を持っていない`);
    if (!/\bswaleTiles\b/.test(VJ)) bad5.push("verify.js が swaleTiles（面と点で共有するタイル束）を持っていない");
    // ⚠ **公開していること。**⚠ 定義があっても配っていなければ画面から呼べない
    for (const w of ["swaleArea", "swalePixel"])
      if (!new RegExp("\\b" + w + "\\b(?![\\w(])").test(VJ.split("global.Konjaku")[1] ?? ""))
        bad5.push(`verify.js が ${w} を配っていない（Konjaku から呼べない）`);
    // ⚠ **画面が持っていないこと。**⚠ 戻ってきたら落とす
    for (const w of ["const tileCache", "function getTile", "function readTile"])
      if (PJ.includes(w)) bad5.push(`peel3d.js に ${w} が戻っている（取得の層の仕事）`);
    // ⚠ **画面がタイル URL を組み立てないこと**（swale に限らず）
    if (/\$\{GSI\}\/swale\//.test(PJ))
      bad5.push("peel3d.js が明治期タイルの URL を組み立てている");
    // ⚠ **画面が「水かどうか」を決めないこと。**⚠ 水の定義は swale.js の isWater ただ 1 つ。
    //   ⚠ **「決める」と「答えを読む」は別**（2026-08-20 に検査を書き直した）。
    //     ⚠ 最初は `.water` を数えて落としていたが、⚠ **2 件とも誤検出**だった:
    //       peel3d.js:791  s.water … ⚠ **取得の層が出した答えを写しているだけ**
    //       peel3d.js:1156 r.water … ⚠ **色見本の色を選んでいるだけ**（見せ方）
    //     ⚠ **決めているかどうかは、画素から起こしているかで見る。**
    if (/\bclassify\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を分類している（水の定義が 2 か所になる）");
    if (/getImageData\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を読んでいる（取得の層の仕事）");
    // ⚠ **水の面（mask）を画面で組み立てないこと**（swaleArea が返したものを使う）
    if (/mask\s*\[[^\]]*\]\s*=/.test(PJ)) bad5.push("peel3d.js が水の面を組み立てている");
    // ⚠ **控える層が GeoJSON を作らないこと**（案B の線）
    for (const w of ['"Feature"', '"Polygon"', "FeatureCollection"])
      if (LD.includes(w)) bad5.push(`land.js が GeoJSON を作っている（${w}）。描き方は画面が持つ`);
    if (VJ.includes("FeatureCollection"))
      bad5.push("verify.js が GeoJSON を作っている。描き方は画面が持つ");
    // ⚠ **mask を控えないこと**（豊洲 1.25MB。sessionStorage 約 5MB を 2 地点で埋める）
    if (/write\([^)]*mask/.test(LD)) bad5.push("land.js が mask を控えている（1.25MB。保存が埋まる）");
    if (!LD.includes("areaSummary")) bad5.push("land.js が、控える中身を絞っていない（areaSummary が無い）");
    // ⚠ **点と面が別の入口・別のキー**（ADR 0030）
    for (const w of ["meijiPoint", "meijiArea", "areaKey"])
      if (!LD.includes(w)) bad5.push(`land.js に ${w} が無い（点と面を分けていない）`);
    // ⚠ **画面が取得の層の面を直接呼ばないこと**（控える層を通す）
    if (/Konjaku\.swaleArea\s*\(/.test(PJ))
      bad5.push("peel3d.js が取得の層の面を直接呼んでいる（land.js を通す）");
    bad5.length
      ? bad(`明治期の「面」が、取得と画面に分かれていない: ${bad5.join("、")}`)
      : ok("明治期の面は「取得（verify.js swaleArea）→ 控える（land.js meijiArea）→ "
         + "矩形化だけ（peel3d.js）」に分かれている");
  }









  // ⚠ **画面から消した語が、戻っていないこと。**
  //   ⚠ 上の表は**いま画面にある語**しか見ない。⚠ **消した語は行ごと落ちるので、
  //     戻ってきても気づけない。**ここが、その穴を塞ぐ。
  //   ⚠ **消すたびにここへ足す。**⚠ 足し忘れると、静かに戻せてしまう。
  //   ⚠ 実際に踏んだ（2026-08-20）: バッジを消したあと、わざと戻しても検査は緑だった。
  {
    const GONE_WORDS = [
      // 2026-08-21（一覧を 3 分類にした）
      //   ⚠ **行ごとのタグをやめ、⚠ 組の見出しへ移した。**
      //   ⚠ 両方置くと、⚠ **「なぜここに出ているのか」に 2 か所が答える**（掟）。
      ["今昔で見る", "一覧行のタグ。⚠ 組の見出しへ移した（⚠ 深掘りの組には見出しを付けない）"],
      ["この土地から", "一覧行のタグ。⚠ 組の見出し `さらに調べる` になった"],
      ["別のサイト↗", "一覧行のタグ。⚠ 組の見出し `公的な情報で確認する` になった"],
      // 2026-08-20（#9c）
      ["外部↗", "一覧行のタグ。`別のサイト↗` にした"],
      ["記録のある変化はありません", "`この期間に表示できる変化の記録は見つかっていません` にした"],
      // 2026-08-20（#9d）
      ["自前・根拠あり", "根拠パネルのバッジ。⚠ **中身が全部この土地の根拠で、何も分けていなかった**"],
      ["ベクトル直読み", "取得方法バッジ。`読んだ値` にした"],
      ["直読み", "同上"],
      // ⚠ **この 1 語だけ、⚠ 見出しとして丸ごとそれかで見る**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **守りたいのはフッターの見出しが戻らないこと**で、⚠ **その字を含む別の見出しを塞ぐことではない。**
      //   ⚠ 実際に踏んだ: 台帳の節を「⚠ **表示データについて**」にしたら部分一致で落ちた。
      //   ⚠ **緩めてはいない。**⚠ ちょうど「データについて」なら、いままでどおり落ちる。
      [/>\s*データについて\s*</, "フッターの見出し。`データ・判定について` にした"],
      ["この範囲にできていたもの", "フッターの出典欄。`この範囲で、年が記録されているもの` にした"],
      // 2026-08-20（hidetzu/konjaku#122・ADR 0030 §4 をトップへ適用）
      ["もとは ", "第1層の主語。⚠ **3/4 が明治期（第2層）と取り違えた**（ADR 0030 §4-3）"],
      ["この場所は ", "第1層の主語。⚠ **`この土地は` に統一**（実測 9:1。ADR 0030 §4-1）"],
      ["水だった土地", "平易な言い換え。⚠ **原典の語をそのまま出す**（ADR 0030 §4-5）"],
      ["上の「もとは」は", "明治期の畳み見出し。⚠ **指し先を字面で書いていた**ので、言い回しを変えたら指し先を失った"],
    ];
    const back = [];
    for (const [w, why] of GONE_WORDS)
      for (const f of Object.keys(seen)) {
        // ⚠ 正規表現で書いた語は、⚠ **その形で見る**（字面の部分一致にしない）
        const hit = w instanceof RegExp ? w.test(seen[f] ?? "") : (seen[f] ?? "").includes(w);
        if (hit) back.push(`${f}「${w instanceof RegExp ? "データについて" : w}」（${why}）`);
      }
    back.length
      ? bad(`一度消した語が画面に戻っている: ${back.join("、")}`)
      : ok(`一度消した語 ${GONE_WORDS.length} 件は、画面に戻っていない`);
  }

  {
    const count = (w, fs) => fs.reduce((a, f) => a + (seen[f] ?? "").split(w).length - 1, 0);
    const off = [];
    for (const w of SCREEN_WORDS) {
      if (w.live === 0) { off.push(`「${w.word}」は live:0（消えたなら行ごと消す）`); continue; }
      const miss = w.files.filter((f) => seen[f] === undefined);
      if (miss.length) { off.push(`「${w.word}」の ${miss.join("、")} が読めない`); continue; }
      const n = count(w.word, w.files);
      if (n !== w.live) off.push(`「${w.word}」は ${w.live} 件のはずが ${n} 件（${w.files.join("、")}）`);
    }
    off.length
      ? bad(`棚卸しと画面が食い違っている: ${off.join(" / ")}`
          + `（直したなら表も直す。増やしたなら、その語を画面に出してよいかを先に決める）`)
      : ok(`画面に出ている作り手側の語 ${SCREEN_WORDS.filter((w) => w.kind === "分類").length} 件・`
          + `状態を指す語 ${SCREEN_WORDS.filter((w) => w.kind === "状態").length} 件が、棚卸しのとおり`);
  }

  // ⚠ 台帳（prov.js）が読むものは、**言葉を組み直す鍵**（peel3d.js の describeKey）に
  //   全部載っていなければならない。載っていないと、データが変わったのに
  //   describe() が早期 return して、**画面が古い数字のまま残る**（黙って古いものを見せる）。
  //
  // ⚠ これは「同じ問いに答えるものを 2 つ持っている」状態そのもの（掟）。
  //   1 つにはできない（片方は文面、片方は更新の判断）ので、**機械で突き合わせる**。
  // ⚠ 読むのは **seen**（コメントを落としたあとの本文）。生のソースを読むと、
  //   この照合を説明したコメントの字面を自分で拾う（CLAUDE.md §5。3 回踏んでいる）。
  {
    const provSrc = seen["prov.js"] ?? "";
    const peelSrc = seen["peel3d.js"] ?? "";
    const keyExpr = /function describeKey\([\s\S]*?\n\}/.exec(peelSrc)?.[0];
    const read = [...new Set([...provSrc.matchAll(/\barea\.(\w+)/g)].map((m) => m[1]))].sort();
    if (!keyExpr) bad("peel3d.js の describeKey を取り出せない（この照合が何も見ていない）");
    else if (!read.length) bad("prov.js が area の何を読んでいるか取り出せない（この照合が何も見ていない）");
    else {
      const miss = read.filter((f) => !new RegExp(`area\\.${f}\\b`).test(keyExpr));
      miss.length
        ? bad(`台帳が読む area.${miss.join(" / area.")} が describeKey に載っていない`
            + `（変わっても画面が組み直されず、古い数字が残る）`)
        : ok(`台帳が読む area の ${read.length} 項目（${read.join("・")}）が、`
            + `すべて describeKey に載っている`);
    }
  }

  // ⚠ loadArea は await を挟んだあと area / statusEl / 地図のデータを書く。
  //   **その await のたびに「まだ自分が最新か」を確かめていないと、
  //   古い呼び出しがあとから新しい結果を上書きする。**
  //   2026-08-18 まで seq は取るだけで一度も見ていなかった（setTimeline の中だけが見ていた）。
  //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出て、
  //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
  // ⚠ 目で数えない。**await を足したのに番人を付け忘れる**のがこの事故なので、機械で見る。
  //
  // ⚠ 見るのは「関数の直下にある await」。**`if` の中も直下**（そこで w や feats を決めている）。
  //   除くのは**中の関数（`=>`）の中**にある await だけで、あれは自分の建物の
  //   properties しか書かないので、外側の番人が守れば足りる。
  // ⚠ 括弧の深さで数えると `if` の中まで除いてしまい、**7 箇所のうち 4 箇所しか
  //   見ていない**状態になった（2026-08-18。静かに素通りするほうの間違い）。
  //   なので「`{` の手前が `=>` で終わっているか」で、関数の枠だけを数える。
  {
    const js = seen["peel3d.js"] ?? "";
    const body = /\nasync function loadArea\([\s\S]*?\n\}\n/.exec(js)?.[0];
    if (!body) bad("peel3d.js の loadArea を取り出せない（この検査が何も見ていない）");
    else {
      // 文字列・テンプレートの中は数えない。各文字が「いくつの関数の枠の中か」を出す
      const inFn = new Array(body.length).fill(0);
      const stack = [];
      let q = null, fn = 0;
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (q) { if (c === "\\") i++; else if (c === q) q = null; inFn[i] = fn; continue; }
        if (c === "'" || c === '"' || c === "`") { q = c; inFn[i] = fn; continue; }
        if (c === "{") {
          const before = body.slice(Math.max(0, i - 4), i).trimEnd();
          const isFn = before.endsWith("=>");
          stack.push(isFn); if (isFn) fn++;
        } else if (c === "}") { if (stack.pop()) fn--; }
        inFn[i] = fn;
      }
      // 行頭の深さ（その await が中の関数の中か）と、行末の深さ（その行で文が閉じたか）
      const lines = body.split("\n"), head = [], tail = [];
      for (let i = 0, pos = 0; i < lines.length; i++) {
        head.push(inFn[pos] ?? 0);
        tail.push(inFn[pos + Math.max(0, lines[i].length - 1)] ?? 0);
        pos += lines[i].length + 1;
      }

      const naked = [], guard = /if\s*\(\s*seq\s*!==\s*areaSeq\s*\)\s*return/;
      let top = 0, nested = 0;
      for (let i = 0; i < lines.length; i++) {
        if (!/\bawait\b/.test(lines[i])) continue;
        if (head[i] > 0) { nested++; continue; }      // 中の関数の中。外側の番人が守る
        top++;
        let end = i;                                   // 文が閉じるまで進む（複数行にまたがる）
        // ⚠ 閉じたかは**行末**の深さで見る。行頭で見ると、callback を跨いだ文が
        //   閉じ括弧の行を飛ばして、番人の行そのものを「文の終わり」にしてしまう。
        while (end < lines.length - 1 && !(tail[end] === 0 && /;\s*$/.test(lines[end]))) end++;
        let j = end + 1;
        while (j < lines.length && /^\s*(\/\/|$)/.test(lines[j])) j++;
        if (!guard.test(lines[j] ?? "")) naked.push(lines[i].trim().slice(0, 56));
      }
      // ⚠ **この下限は「検査が目を潰していないか」を見るためのもの**で、仕様ではない。
      //   ⚠ 2026-08-20 に 7 → 4 へ下げた。範囲索引（豊洲 1 件だけの事前計算）を外し、
      //     その経路にあった await 3 つ（索引・事前生成の水域・事前生成の建物）が消えたため。
      //   ⚠ **実際の数に合わせて下げること。**下げ忘れると通らず、上げすぎると
      //     取りこぼしに気づけない。
      if (top < 4) bad(`loadArea の直下の await が ${top} 箇所しか見えていない（この検査が取りこぼしている）`);
      else naked.length
        ? bad(`loadArea の await ${naked.length} 箇所に、seq の番人が無い: ${naked.join(" / ")}`
            + `（古い呼び出しが、あとから新しい結果を上書きする）`)
        : ok(`loadArea の直下の await ${top} 箇所は、全部その直後に seq を確かめている`
            + `（中の関数の中の ${nested} 箇所は、外側の番人が守る）`);
    }
  }

  // ⚠ **同じ問いに答える定義を、2 か所に書かない**（掟）。
  //   表そのものは §6 が見ている（14 区分・凡例）。ここが見るのは**それ以外の並びと式**。
  //
  // 実測（2026-08-18）: 2 種類の重複があった。⚠ **どちらも「表」ではないので、
  //   既存の検査では素通りしていた。**
  //     ① 「水由来の地形分類」6 語 … verify.js / share.js / index.html×2 の 4 か所
  //     ② `SWALE.find(c => c.name === x)?.water` … peel3d.js×3 / swale.js の 4 か所
  //   ⚠ ② は式なので、grep しても目に留まらない。並びだけを見ていては見つからない。
  //
  // ⚠ ①と②は**別の問い**。混ぜない。
  //     ① いまの地形分類が水に由来するか（Konjaku.isWatery）
  //     ② 明治期の地図で水域だったか（KonjakuSwale.isWater）
  {
    const jsHtml = [...htmlFiles, ...jsFiles];
    const body = {};
    for (const f of jsHtml) body[f] = seen[f] ?? "";
  
    // ---- ① 語の並びを書き写していないか ----
    {
      const where = new Map();
      for (const f of jsHtml) {
        for (const m of body[f].matchAll(/\[\s*("(?:[^"\\]|\\.)*"\s*,\s*){2,}"(?:[^"\\]|\\.)*"\s*\]/g)) {
          const words = [...m[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
          if (!words.some((w) => /[ぁ-んァ-ヶ一-龠]/.test(w))) continue;
          const k = words.join("｜");
          if (!where.has(k)) where.set(k, []);
          where.get(k).push(f);
        }
      }
      const dup = [...where.entries()].filter(([, fs]) => fs.length > 1);
      dup.length
        ? bad(`同じ語の並びを 2 か所以上に書いている: `
            + dup.map(([k, fs]) => `[${k.split("｜").slice(0, 3).join("、")}…] → ${fs.join("、")}`).join(" / ")
            + `（1 か所に寄せて、そこから呼ぶこと）`)
        : ok(`日本語を含む語の並び ${where.size} 種類は、どれも 1 か所にしかない`);
    }
  
    // ---- ② 「名前から水域を引く」式を書き写していないか ----
    // ⚠ 持ち主（swale.js）の中だけは、定義そのものなので許す
    {
      const hits = [];
      for (const f of jsHtml) {
        if (f === "swale.js") continue;
        const n = (body[f].match(/SWALE\s*\.\s*find\s*\([^)]*\)\s*\?\.\s*water/g) ?? []).length;
        if (n) hits.push(`${f}${n > 1 ? `×${n}` : ""}`);
      }
      hits.length
        ? bad(`区分名から水域を引く式を書き写している: ${hits.join("、")}`
            + `（KonjakuSwale.isWater を呼ぶこと。式なので grep しても目に留まらない）`)
        : ok(`区分名から水域を引くのは swale.js の isWater ただ1つ`);
    }
  
    // ---- ③ 持ち主が、実際に配れているか ----
    // ⚠ 「1 か所にした」と言いながら、公開していなければ呼べない
    {
      const missing = [];
      if (!/isWatery/.test(body["verify.js"] ?? "")) missing.push("verify.js に isWatery が無い");
      else if (!/global\.Konjaku\s*=\s*\{[^}]*isWatery/.test(body["verify.js"]))
        missing.push("isWatery を Konjaku から配っていない（他のファイルが呼べない）");
      if (!/isWater/.test(body["swale.js"] ?? "")) missing.push("swale.js に isWater が無い");
      else if (!/KonjakuSwale\s*=\s*\{[^}]*isWater/.test(body["swale.js"]))
        missing.push("isWater を KonjakuSwale から配っていない");
      missing.length
        ? bad(`1 か所に寄せた答えを配れていない: ${missing.join(" / ")}`)
        : ok(`水の判定は 2 つとも持ち主から配っている（Konjaku.isWatery ／ KonjakuSwale.isWater）`);
    }
  }



  // ⚠ **HTML を組み立てながら、その場で「何と言うか」を決めない。**
  //   判断はデータや名前つきの関数にして、HTML 化は 1 か所に寄せる
  //   （public/prov.js と peel3d.js の WORD がその形）。
  //
  // 実測（2026-08-19）。HTML を含むテンプレートの中の分岐を、2 つに分けて数えた:
  //   見た目（class / style だけ）… ⚠ **これは問題ない**（数えない）
  //   意味（引用符つきの日本語が分岐している）… index.html 7・peel3d.js 9 → **外へ出した**
  //   ⚠ うち 2 つは**同じ判断を 2 か所・3 か所**に書いていた
  //     （「（事前に取り込んだデータ）」×2、「建物ごとには出せません／判定できません」×3）。
  //
  // 2026-08-19 に **両方 0 になった**（peel3d.js → WORD、index.html → TOPWORD）。
  // ⚠ **0 は「上限」ではなく「もう増やさない」。**ここから 1 個でも増えたら落ちる。
  //   ⚠ 通行証: トップ 12 画面（1280×900 / 375×667 × 豊洲・札幌・那覇 × 閉／開）の
  //     字面が 1 文字も変わらないことを確かめてから外へ出した。
  {
    // その日の実測。⚠ 減らしたら、この数も下げること（下げないと歯止めが緩む）
    const CAP = { "index.html": 0, "peel3d.js": 0 };
    // ⚠ **引用符で囲まれた日本語**が分岐にあることまで求める。
    //   `?` だけで数えると、markup の中の `?`（`<i class="q">?</i>` など）を
    //   三項演算子と読む（実測 2026-08-18: それで 7 個が 8 個になった）。
    const JP = /(["'])(?:[^"'\\]|\\.)*?[ぁ-んァ-ヶ一-龠](?:[^"'\\]|\\.)*?\1/;

    // テンプレートリテラルを、入れ子の ${} も追って拾う
    const literals = (src) => {
      const out = [];
      for (let i = 0; i < src.length; i++) {
        if (src[i] !== "`") continue;
        let d = 0, j = i + 1;
        for (; j < src.length; j++) {
          if (src[j] === "\\") { j++; continue; }
          if (src[j] === "$" && src[j + 1] === "{") { d++; j++; continue; }
          if (src[j] === "}" && d > 0) { d--; continue; }
          if (src[j] === "`" && d === 0) break;
        }
        const body = src.slice(i, j + 1);
        if (/<\/?[a-z]+[\s>]/.test(body)) out.push(body);
        i = j;
      }
      return out;
    };

    const over = [], counted = {};
    for (const f of Object.keys(CAP)) {
      let s = seen[f] ?? "";
      if (!s) { over.push(`${f} を読めない`); continue; }
      // ⚠ HTML は **<script> の中だけ**を見る。外の markup まで数えると、
      //   ここでは直しようのないものが混ざる（実測: 7 個のはずが 8 個になった）
      if (f.endsWith(".html"))
        s = [...s.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
      let word = 0;
      for (const l of literals(s))
        for (const m of l.matchAll(/\?([^:`]{0,160}):([^`}]{0,160})/g))
          if (JP.test(m[1]) || JP.test(m[2])) word++;
      counted[f] = word;
      if (word > CAP[f]) over.push(`${f}: ${word} 個（上限 ${CAP[f]}）`);
      // ⚠ 減ったのに上限を下げ忘れると、また増やせてしまう
      if (word < CAP[f]) over.push(`${f}: ${word} 個まで減った。上限 ${CAP[f]} も下げること`);
    }
    over.length
      ? bad(`HTML の中に、言葉を分ける判断が増えた／上限が古い: ${over.join(" / ")}`
          + `（判断はデータか名前つきの関数にして、HTML 化は 1 か所に寄せる）`)
      : ok(`HTML の中に埋まった「言葉の判断」は上限どおり`
          + `（${Object.entries(counted).map(([f, n]) => `${f} ${n}`).join(" / ")}。`
          + `見た目だけの分岐は数えない）`);
  }

  {
    // ⚠ **出典は 2 か所にある。同じ問いに答えるので、機械で突き合わせる**（掟3）。
    //   1) 地図の帰属表示 … peel3d.js の ATTR_GSI / ATTR_OSM から MapLibre が組む。**常に見えている側**
    //   2) 左パネルの「出典」 … 手書きの HTML。リンクを辿れる詳しい版
    //   ⚠ 片方だけ増やす・消すと、画面と画面で答えが変わる。
    //     実際に破れていた: OSM が peel3d.js 側に無く、**地図の帰属表示に OSM が出ていなかった**
    //     （2026-08-17。パネル側には書いてあったので、字面だけ見ると揃っているように見えた）。
    const j = src["peel3d.js"] ?? "", ph = src["peel.html"] ?? "";
    if (!j || !ph) bad("peel3d.js か peel.html が読めない（この検査が何も見ていない）");
    else {
      // peel3d.js の出どころ（ATTR_* の中身）
      // ⚠ **宣言があるだけでは足りない。実際に地図へ渡っているものだけを数える。**
      //   最初「const ATTR_* を宣言しているか」で見ていたら、名前を変えて
      //   `attribution:` から外しても緑のままだった（2026-08-17 に壊して気づいた）。
      const decl = new Map([...j.matchAll(/const (ATTR_\w+)\s*=\s*'([^']*)'/g)]
        .map((m) => [m[1], m[2]]));
      // `attribution: X` の X として使われている名前だけ拾う
      const used = new Set([...j.matchAll(/attribution\s*:\s*(ATTR_\w+|ATTR)\b/g)].map((m) => m[1]));
      // `const ATTR = ATTR_GSI` のような別名を1段だけ辿る
      for (const [k, v] of [...j.matchAll(/const (ATTR\w*)\s*=\s*(ATTR_\w+)\s*;/g)]
        .map((m) => [m[1], m[2]])) if (used.has(k)) used.add(v);
      const attrs = [...used].filter((k) => decl.has(k)).map((k) => ({ key: k, html: decl.get(k) }));
      const need = [
        { name: "国土地理院", why: "出典明示が利用の条件" },
        { name: "OpenStreetMap", why: "ODbL でクレジット必須" },
      ];
      const joined = attrs.map((a) => a.html).join(" ");
      const missJs = need.filter((n) => !joined.includes(n.name));
      // パネル側は、常に見えている側と**同じ名前**を出していること
      // ⚠ 正規表現で `</div>` まで取ろうとしたら、いちばん近い `</div>` が 600 文字より
      //   先にあって取れなかった（2026-08-17）。**索引で切り出す。**
      const anchor = '<div class="label">出典</div>';
      const at = ph.indexOf(anchor);
      const panel = at < 0 ? "" : ph.slice(at + anchor.length, at + anchor.length + 400);
      const missPanel = need.filter((n) => !panel.includes(n.name));
      // ⚠ ODbL は「© … contributors」の形が要る。名前だけでは足りない
      const noCopyJs = !/©/.test(joined), noCopyPanel = !/©/.test(panel);
      if (!attrs.length) bad("peel3d.js で attribution に渡している ATTR_* が無い（地図の帰属表示の出どころ）");
      else if (missJs.length)
        bad(`地図の帰属表示に ${missJs.map((n) => `${n.name}（${n.why}）`).join("・")} が無い`);
      else if (!panel) bad('peel.html の左パネルに「出典」の節が無い');
      else if (missPanel.length)
        bad(`左パネルの出典に ${missPanel.map((n) => n.name).join("・")} が無い（地図側にはある）`);
      else if (noCopyJs || noCopyPanel)
        bad(`ODbL のクレジット（©）が無い: ${noCopyJs ? "地図の帰属表示" : ""}${noCopyJs && noCopyPanel ? "・" : ""}${noCopyPanel ? "左パネル" : ""}`);
      else ok(`/peel の出典は 2 か所で一致（${need.map((n) => n.name).join("・")}／© つき）`
        + `／地図へ渡しているのは ${attrs.map((a) => a.key).join("・")}`);
    }
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
  {
    // ⚠ **verify.js が渡すのは鍵であって、画面に出る字ではない**（2026-08-20）。
    //   ⚠ **words.js の METHOD に無い鍵を渡すと、バッジが黙って消える。**
    //     ⚠ 消えても画面は何も言わないので、ここで止める。
    const got = [...(seen["verify.js"] ?? "").matchAll(/method:\s*"([^"]*)"/g)].map((x) => x[1]);
    const want = ["read", "readVector", "read", "read"];
    const M = globalThis.KonjakuWords?.METHOD ?? {};
    const unknown = got.filter((k) => !(k in M));
    unknown.length
      ? bad(`verify.js が words.js の知らない鍵を渡している: ${unknown.join("・")}（バッジが黙って消える）`)
      : got.join("／") === want.join("／")
        ? ok(`根拠カードの取得方法は棚卸しのとおり（${[...new Set(got)].map((k) => `${k}→${M[k]}`).join("・")}／${got.length} 件）`)
        : bad(`根拠カードの取得方法が棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
  }
}

// ── 段の名乗りが、⚠ 画面 / README / SPEC で割れていないか ──────────
// ⚠ **2026-08-23 に踏んだ。**⚠ **画面は hidetzu/konjaku#225 で β を名乗り始めたのに、
//   ⚠ README は「プロトタイプです」と言い続けていた。**
// ⚠ **README は共有先まで届く**（`CLAUDE.md` §6）。⚠ **画面より遠くへ行く。**
// ⚠ **看板と共有カードは上で突き合わせているが、⚠ README は入っていなかった。**
// ⚠ **段の名乗り（α / β / 正式版 / プロトタイプ）だけを見る。**
//   ⚠ **README の書き方までは縛らない**（⚠ 文の形は自由）。
{
  const STAGE = ["プロトタイプ", "α 版", "α版", "β 版", "β版", "正式版"];
  const norm = (set) => new Set([...set].map((w) => w.replace(/\s*版$/, "")));
  // ⚠ **コメントを先に落とす**（⚠ 落とさないと、⚠ この決まりを説明した字面を拾う）。
  const stageOf = (text) => {
    const bare = text.replace(HTML_COMMENT, " ");
    const got = new Set(STAGE.filter((w) => bare.includes(w)));
    // ⚠ **`今昔 β` のように、⚠ 「版」を付けずに名乗ることがある。**⚠ 単独の β も拾う
    if (/[^A-Za-zα-ωΑ-Ω]β[^A-Za-zα-ωΑ-Ω]/.test(bare)) got.add("β 版");
    return norm(got);
  };
  // ⚠ **3 か所とも外へ出る**（⚠ 画面は見る人へ、⚠ README と SPEC は読む人へ）。
  const faces = [
    ["画面", stageOf(await readFile(join(PUB, "index.html"), "utf8"))],
    ["README", stageOf(await readFile(join(ROOT, "README.md"), "utf8"))],
    ["SPEC", stageOf(await readFile(join(ROOT, "docs", "SPEC.md"), "utf8"))],
  ];
  const silent = faces.filter(([, v]) => !v.size).map(([k]) => k);
  const key = ([, v]) => [...v].sort().join("・");
  const split = new Set(faces.map(key)).size > 1;
  if (silent.length === faces.length) {
    bad("どの面も段を名乗っていない（⚠ この検査が何も見ていない）");
  } else if (silent.length) {
    bad(`段を名乗っていない面がある（${silent.join("・")}）`
      + `。⚠ 名乗っているのは ${faces.filter(([, v]) => v.size).map(([k, v]) => `${k}「${[...v].join("・")}」`).join(" / ")}`
      + "。⚠ **README と SPEC は共有先まで届く**（`CLAUDE.md` §6）");
  } else if (split) {
    bad(`段の名乗りが割れている: ${faces.map(([k, v]) => `${k}「${[...v].join("・")}」`).join(" / ")}`
      + "。⚠ **1 つだけ直すと、⚠ 遠くへ行くものが古いまま配られる**");
  } else {
    ok(`画面・README・SPEC の段の名乗りが揃っている（${key(faces[0])}）`);
  }
}

// ── README も、⚠ 画面と同じ限界を書いているか ────────────────────
// ⚠ **掟 §6。**⚠ **外向けの文章（記事・OGP・SNS・README）にも同じ規則を適用する。**
//   ⚠ **README と OGP は共有先まで届く**ので、⚠ そこだけこの掟の外に出る。
//
// ⚠ **2026-08-23 に踏んだ。**⚠ README のプライバシーの節が
//   ⚠ **「Cookie を使わない／計測へ送らない」だけを書いていた。**
//   ⚠ **書いてあること自体は正しい**（⚠ 「計測へ」と範囲を限っている）。
//   ⚠ **落ちていたのは限界のほう**（⚠ 調べた場所は URL に入り、開くと配信元へ届く）。
//   ⚠ **画面には「▸ プライバシーについて」があるが、⚠ README に開く先は無い。**
//
// ⚠ **字面をそろえない**（⚠ 画面と README で長さが違うのは正当）。⚠ **主張で見る。**
{
  head("README も、画面と同じ限界を書いている");
  const rd = await readFile(join(ROOT, "README.md"), "utf8");
  // ⚠ **文で切ってから見る**（⚠ 別々の文に散っていると「言っている」とは言えない）。
  //   ⚠ **`/peel` の 3 段を見る検査で、⚠ IP の文を拾って素通りした**（2026-08-23）。⚠ 同じ轍を踏まない。
  const ss = rd.split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
  const has = (...res) => ss.some((t) => res.every((re) => re.test(t)));
  const miss = [
    [() => has(/調べた場所|検索した場所/, /URL|アドレス欄/, /入(り|ります)/),
      "調べた場所が URL に入ること（載る）"],
    [() => has(/URL|アドレス/, /配信元|Cloudflare/, /届|渡/),
      "その URL を開くと配信元へ届くこと（届く）"],
    [() => has(/こちらの記録に/, /残りません/),
      "こちらの記録には残らないこと（残らない）"],
  ].filter(([f]) => !f()).map(([, n]) => n);
  // ⚠ **言い切りすぎていないこと**（⚠ 2026-08-15 に画面で直した嘘を、⚠ README で繰り返さない）
  const lie = /(どこにも|一切)[^。\n]*送(りません|っていません)|サーバーには送りません/.test(rd);
  if (miss.length)
    bad(`README に、画面が言っている限界が無い: ${miss.join("、")}`
      + "（⚠ 掟 §6: ⚠ README は共有先まで届く。⚠ 画面と違って、開く先が無い）");
  else if (lie)
    bad("README が「どこにも送らない」まで言い切っている"
      + "（⚠ 調べた場所は URL に載り、開けば配信元へ届く。2026-08-15 に画面で直した嘘）");
  else ok("README も、画面と同じ 3 段（載る → 届く → 残らない）を書いている");
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
