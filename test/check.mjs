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
//
// ⚠ **このファイルは「走者」**（2026-08-25。hidetzu/konjaku#232 でここまで減らした）。
//   ⚠ **6074 → 381 行。**⚠ **21 節を、⚠ 「何を守っているか」で `test/check/*.mjs` へ出した。**
//   ⚠ **節番号は 1 つも残っていない**（⚠ 番号は「いつ足したか」しか表していなかった）。
//
// ⚠ **ここに残っているのは 3 つだけ。**⚠ **どれも走者の仕事。**
//     道具の一覧と読み込み  ⚠ `PARTS` を順に呼ぶ
//     0. 数え方そのもの      ⚠ **検査基盤が壊れていないことを、⚠ 検査で確かめる**
//     数の名乗り            ⚠ 全部走ったあと、⚠ 1 回だけ件数を名乗る

import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, ok, bad, warn, head, tally, makeReport, dropComment, dropCommentOrHash,
         seen, torn, LINE_COMMENT, HEAD_COMMENT, walkFiles } from "./check/lib.mjs";
import { TELEMETRY_DIR_NAME } from "../.claude/telemetry-dir.mjs";

// ⚠ **出した節の一覧**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **順番はここで決める。**⚠ **`readdir` の順に任せない**
//     （⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//   ⚠ **読み込むのは、⚠ 元の節があった位置**（⚠ 下のほう）。⚠ **並びを変えないため。**
//   ⚠ **漏れが無いことは「0. 数え方そのもの」が見る**（⚠ `test/check/` を実際に読む）。
const PARTS = ["links.mjs", "style.mjs", "color.mjs", "motion.mjs", "land.mjs", "place.mjs", "era.mjs", "words.mjs", "roles.mjs", "vocab.mjs", "data.mjs", "privacy.mjs", "credit.mjs", "claim.mjs", "syntax.mjs", "answer.mjs", "guard.mjs", "eval.mjs", "safety.mjs", "deliver.mjs", "docs.mjs", "imports.mjs", "next.mjs", "saved.mjs"];




// ---------- 0. 数え方そのもの ----------
// ⚠ **この検査が壊れると、⚠ 全部の検査が黙って通る**（2026-08-24。⚠ **実際に起こした**）。
//   ⚠ `test/check/lib.mjs` を別ファイルへ出した直後、⚠ **`bad` が数えない形に壊したら、
//     ⚠ 検査が落ちているのに「問題なし」と出た。**
//   ⚠ **数える処理が 1 行で消せるうちは、⚠ 誰も捕まえられない。**
//
// ⚠ **本物には触らない。**⚠ **工場で新しく作って、⚠ 別の道で確かめる**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
//
// ⚠ **この節は `test/check/` へ出さない**（2026-08-25。Owner 判断。hidetzu/konjaku#232）。
//   ⚠ **共通ライブラリではなく、⚠ 「検査基盤そのものが壊れていないこと」の自己検証。**
//   ⚠ **`lib.mjs` へ出すと、⚠ `bad()` では扱えず**（⚠ 数え方が壊れていたら数えられない）、
//     ⚠ **`process.exit` の責務まで動く。**⚠ **それは実行モデルの設計変更で、
//     ⚠ 「主張を変えず、⚠ 置き場だけ動かす」という hidetzu/konjaku#232 の範囲の外。**
//
//   ⚠ **行数で分けない。**⚠ **責務が 1 つなら残す。**
//     ⚠ ここは 65 → 286 行に増えたが（hidetzu/konjaku#245 ／ hidetzu/konjaku#247 ／
//     ⚠ hidetzu/konjaku#250 ／ hidetzu/konjaku#258 で見張りを足した）、
//     ⚠ **答えている問いは 1 つ**: ⚠ **この検査そのものが、⚠ 本当に見ているか。**
//   ⚠ **さらに膨らんで、⚠ 問いが 2 つ以上になったら、⚠ そのとき別の課題にする。**
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

  // ⚠ **歩く先が、⚠ 「この repo の中にあるが、⚠ この repo ではない」ものを飛ばしているか**
  //   （2026-08-26。hidetzu/konjaku#276）。
  //   ⚠ **歩いても落ちない。**⚠ **名乗る数が静かに変わるだけ。**⚠ **こちらのほうが危ない。**
  //     ⚠ 実測（2026-08-26・⚠ worktree を 1 本置いただけ）: ⚠ **58 ファイル 141 本 → 122 ファイル 304 本。**
  //     ⚠ **一瞬「検査が 1 件消えた」ように見えた**（⚠ 判定の字を突き合わせているときに踏んだ）。
  //   ⚠ **CI に worktree は無い。**⚠ **手元と CI で答えが変わる。**
  //
  // ⚠ **本物の `.claude/` に触らない。**⚠ **worktree があるかは、⚠ そのときの作業しだい**なので、
  //   ⚠ **触ると、⚠ この検査自身が「回すたびに違う」ものになる。**
  //   ⚠ **手で書いた木を渡して見る**（`CLAUDE.md` §9: ⚠ **突き合わせる相手は別の道で得たもの**）。
  {
    const D = (name) => ({ name, isDirectory: () => true });
    const F = (name) => ({ name, isDirectory: () => false });
    // ⚠ **飛ばす名前を、⚠ ここから借りない**（⚠ `WALK_SKIP` を空にしたら、⚠ 木からも消えて素通りする）。
    //   ⚠ **`worktrees` は字で書く。**⚠ **計測だけは持ち主から借りる**（⚠ 字は 1 か所。`telemetry-dir.mjs`）。
    // ⚠ **起点の字も組み立てる**（⚠ **下の見張りが、⚠ この行を「自前で歩いている」と読むので**）
    const C = ".clau" + "de";
    const tree = {
      [C]:                          [D("skills"), D("worktrees"), D(TELEMETRY_DIR_NAME), F("settings.json")],
      [`${C}/skills`]:              [F("verify.md"), D("worktrees")],
      [`${C}/skills/worktrees`]:    [F("ふかいところの同名.md")],
      [`${C}/worktrees`]:           [D("dummy")],
      [`${C}/worktrees/dummy`]:     [F("CLAUDE.md")],
      [`${C}/${TELEMETRY_DIR_NAME}`]: [F("2026-08-26.jsonl")],
    };
    const got = walkFiles(C, (d) => tree[d] ?? []);
    // ⚠ **飛ばすのは直下だけ。**⚠ **深いところの同名は飛ばさない**（⚠ 主張を広げない）。
    //   ⚠ **`.claude/skills/worktrees/` が残ることまで固定する**（⚠ 名前だけで判断が広がったら落ちる）。
    const want = [`${C}/skills/verify.md`,
                  `${C}/skills/worktrees/ふかいところの同名.md`,
                  `${C}/settings.json`];
    got.join("\n") === want.join("\n")
      ? ok(`歩く先は worktrees/ と ${TELEMETRY_DIR_NAME}/ を直下で飛ばしている`
          + `（⚠ 深いところの同名は飛ばさない・手で書いた木 ${Object.keys(tree).length} 段で確かめた）`)
      : bad(`歩く先が想定と違う（得 ${JSON.stringify(got)} ／ 望 ${JSON.stringify(want)}）`
          + `（⚠ 落ちるのではなく、⚠ 名乗る数が静かに変わる形の事故）`);
  }

  // ⚠ **別セッションの作業場所が、⚠ git の追跡外であること**（2026-08-26。hidetzu/konjaku#276）。
  //   ⚠ **検査が歩かないだけでは足りない。**⚠ **`git add -A` が巻き込む**
  //     （`CLAUDE.md` §8: ⚠ **`git add -A` で他の作業を巻き込まない**）。
  //   ⚠ **実測（2026-08-26・足す前）**: ⚠ worktree を 1 本置くと、
  //     ⚠ **`git status` に `?? .claude/worktrees/` が出ていた。**
  //   ⚠ **網は 2 つ要る。**⚠ **git 側（ここ）と、⚠ 検査側（上の walkFiles）。**
  //     ⚠ **どちらか片方だと、⚠ もう片方の道で入ってくる。**
  //
  // ⚠ **`.gitignore` を読むだけにしない。**⚠ **git が実際にどう扱っているかも見る**
  //   （⚠ `guard.mjs` の計測の検査と同じ流儀）。
  {
    const WT = ".claude/worktrees/";
    const fails = [];
    try {
      const t = execFileSync("git", ["ls-files", WT], { encoding: "utf8", cwd: ROOT }).trim();
      if (t) fails.push(`git に入っている: ${t.split("\n").slice(0, 3).join("、")}`);
    } catch { fails.push("git ls-files が使えない（追跡されていないことを確かめていない）"); }
    const ig = await readFile(join(ROOT, ".gitignore"), "utf8").catch(() => "");
    if (!ig.split("\n").map((l) => l.trim()).includes(WT))
      fails.push(`.gitignore が ${WT} を外していない`);
    fails.length
      ? bad(`別セッションの作業場所が git の追跡外になっていない: ${fails.join(" / ")}`
          + `（⚠ 検査が歩かないだけでは足りない。⚠ git add -A が巻き込む）`)
      : ok(`別セッションの作業場所は git の追跡外（${WT} を .gitignore が外している・追跡 0 件）`);
  }

  // ⚠ **`.claude` を歩く検査が、⚠ また自前の走査を持ち直していないか**
  //   （2026-08-26。hidetzu/konjaku#276）。⚠ **前は `guard.mjs` と `links.mjs` が別々に持っていた。**
  //   ⚠ **`guard.mjs` だけが飛ばしていて、⚠ `links.mjs` は歩いていた**（⚠ 同じ問いに 2 つの答え）。
  //
  // ⚠ **最初は「`readdir` と `.claude` が同じ行にあるか」で書いた。**⚠ **それでは捕まらなかった**
  //   （⚠ 実証 2026-08-26: ⚠ `links.mjs` に自前の再帰走査を戻したら、⚠ **緑のまま数だけ倍近くに増えた**。
  //    ⚠ **走査を定義する行と、⚠ 起点を渡す行が別**だったため）。⚠ **見るのは「起点を渡す行」。**
  //
  // ⚠ **見るのは、⚠ 末尾に何も続かない字**（⚠ ディレクトリとしての `.claude`）。
  //   ⚠ **`.claude/hooks/…` のような個別のファイルは見ない**（⚠ 歩く話ではない）。
  //   ⚠ **`lib.mjs` は持ち主なので外す。**
  //
  // ⚠ **「その行に `walkFiles` があるか」では足りない**（⚠ 実証 2026-08-26）。
  //   ⚠ **`[...walkFiles("docs"), …, walk(".claude")]` は、⚠ 同じ行に両方あるので素通りした。**
  //   ⚠ **見るのは、⚠ その字を「誰に渡しているか」。**⚠ **数が合わなければ落とす。**
  {
    // ⚠ **字として組み立てる**（⚠ そのまま書くと、⚠ この検査が自分の行を拾う。⚠ この repo で 4 回以上）
    const CL = '"\\.' + 'claude"';
    const LIT = new RegExp(CL, "g");                                  // ⚠ 起点として書かれた字
    const LENT = [new RegExp(`walkFiles\\(\\s*${CL}`, "g"),                 // ⚠ walkFiles(".claude")
                  new RegExp(`walkFiles\\(\\s*join\\([^()]*,\\s*${CL}`, "g")];  // ⚠ walkFiles(join(ROOT, ".claude"))
    const files = ["test/check.mjs", ...PARTS.map((p2) => `test/check/${p2}`)];
    const own = [];
    for (const f of files) {
      const t = await readFile(join(ROOT, f), "utf8").catch(() => "");
      // ⚠ **行で切る。**⚠ 行コメントを先に落とす（⚠ この節の説明を拾わないため）
      for (const line of t.split("\n").map(dropComment)) {
        const wrote = (line.match(LIT) ?? []).length;
        if (!wrote) continue;
        const lent = LENT.reduce((a, re) => a + (line.match(re) ?? []).length, 0);
        if (wrote > lent) own.push(`${f}: ${line.trim().slice(0, 60)}`);
      }
    }
    if (!files.length) bad("検査のファイルが 1 つも無い（⚠ この検査が何も見ていない）");
    else if (own.length)
      bad(`.claude を walkFiles 以外へ渡している検査がある（${own.length} 件）: ${own.join(" / ")}`
        + `（⚠ 自前で歩くと、⚠ 落ちずに数だけ変わる。⚠ lib.mjs の walkFiles から借りる）`);
    else ok(`.claude の起点を渡すのは walkFiles だけ（他 0 件・${files.length} ファイル）`);
  }

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












































// ---------- 数の名乗り ----------
// ⚠ **名前を中身に合わせた**（2026-08-25。hidetzu/konjaku#232 の 30 本目）。
//   ⚠ **「9. 画面の言葉」の中身は、⚠ 全部 `test/check/*.mjs` へ出た。**
//   ⚠ **残ったのは、⚠ 走者が最後に名乗る件数だけ。**⚠ **嘘の名前を残さない。**
head("数の名乗り");
























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
