// 静的検査 — 見せ方の決め方（⚠ **同じ値が 2 か所に無いか。⚠ 狭い幅が既定か。⚠ 畳んだ中に隠れていないか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 7 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**:
//     CSS 変数           ⚠ 使っている変数に定義があるか（⚠ 自己参照も静かに壊れる）
//     幅の `max-width`    ⚠ **狭い幅が既定**（`docs/DOMAIN.md` §4-2。`.claude/rules/css.md`）
//     PC の 2 カラム      ⚠ 幅がトークン 1 か所・切り替えは `min-width`
//     文字の根元は rem    ⚠ ブラウザの文字サイズ設定に追従すること
//     `font-size`         ⚠ 全部 `--fs-*` 経由（⚠ 生の値を書かない）
//     文字の段            ⚠ 2 画面で揃っていること
//     `tokens.css`        ⚠ 2 画面で共通の見た目は 1 か所（ADR 0021）
//
// ⚠ **`SHELL に 3D 側のものは入っていない` は入れていない**（⚠ SW の話＝届け方）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PUB, ok, bad, head, htmlFiles, jsFiles, src , BLOCK_COMMENT, HTML_COMMENT, LINE_COMMENT } from "./lib.mjs";

head("見た目の決め方");

// ⚠ 使っている CSS 変数が、全部どこかで定義されていること。
//   ⚠ 変数名を変えたとき、**JS が組み立てる HTML の中の var(--…) を忘れる**。
//     実測（2026-08-14）: --dim → --ink-dim に寄せたとき peel3d.js の8箇所を置き忘れ、
//     分母の「/ 533」だけが暗い灰色から本文色に変わっていた（画面は何も言わない）。
//   ⚠ 自己参照（--tap:var(--tap)）も、値が無効になるだけで静かに壊れる。実際に踏んだ。
{
  const { readFileSync: rfc } = await import("node:fs");
    // ⚠ **共通の定義（tokens.css）も見る。**2026-08-20 に 26 個をここへ寄せた。
    //   ⚠ 入れ忘れると、全部が「定義の無い変数」に見える（実際にそうなった）。
    // ⚠ **色は theme.css**（2026-08-26・hidetzu/konjaku#96）。⚠ **入れ忘れると、
    //   ⚠ 色の変数が全部「定義が無い」に見える**（⚠ 移した直後に実際にそうなった）。
    const files = ["public/css/tokens.css", "public/css/theme.css",
      "public/index.html", "public/peel.html", "public/peel3d.js",
    "public/share.js", "public/verify.js", "public/places.js", "public/events.js"];
  const defined = new Set(), used = new Map(), self = [];
  for (const f of files) {
    let t = ""; try { t = rfc(f, "utf8"); } catch { continue; }
    // ⚠ コメントを先に落とす。落とさないと、`--tap:44px を割っていた` のように
    //   **この検査を説明するコメント**を検査自身が定義として拾い、
    //   その中の var(--tap) を「自己参照」と誤判定する（<details> の検査でも同じ形を踏んだ）。
    t = t.replace(BLOCK_COMMENT, " ").replace(HTML_COMMENT, " ");
    for (const m of t.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
      defined.add(m[1]);
      if (m[2].includes(`var(${m[1]})`)) self.push(`${f}: ${m[1]}`);
    }
    for (const m of t.matchAll(/var\((--[a-z0-9-]+)\)/g))
      used.set(m[1], (used.get(m[1]) ?? new Set()).add(f));
  }
  const undef = [...used.keys()].filter((v) => !defined.has(v));
  self.length ? bad(`CSS 変数が自分自身を参照している（値が無効になる）: ${self.join("、")}`)
    : undef.length ? bad(`定義の無い CSS 変数を使っている: `
        + undef.map((v) => `${v}（${[...used.get(v)].join("・")}）`).join(" / "))
    : ok(`CSS 変数 ${defined.size} 個、使用 ${used.size} 種すべてに定義がある`);
  // ⚠ 掟の3色は、名前で区別が付くこと。--ok のような一般名に戻さない
  for (const v of ["--evidence", "--estimate", "--missing"])
    if (!defined.has(v)) bad(`判定の格を表す変数が消えている: ${v}`);
}

  // ⚠ **狭い幅を既定にする**（2026-08-20・hidetzu/konjaku#93。`docs/DOMAIN.md` §4-2）。
  //   ⚠ **`max-width` で書くと、狭い画面が「例外」になる。**
  //   ⚠ この作品は狭い画面で使われる（実測の基準幅は 375×667）。
  //   ⚠ **既定のほうを例外として書くと、足すたびに広い側の打ち消しが要る。**
  //
  // ⚠ **残していた 1 箇所（peel.html の max-width:680px）は、2026-08-21 に無くなった。**
  //   ⚠ 狭い側の 112 組を素の指定へ出し、⚠ **広い画面で違う値だけを min-width へ書いた。**
  //   ⚠ **6 幅（375 / 344 / 320 / 1280 / 1440 / 1920）で、字も位置も 1px も変わっていない。**
  //   ⚠ **`unset` / `initial` / `revert` は 0 組**（＝帳尻合わせをしていない）。
  //   ⚠ **許可一覧は空。**⚠ **増やすときは、ここに理由と一緒に書く。**
  //
  // ⚠ **数だけでなく場所も見る。**⚠ 数だけだと、⚠ **別のファイルへ移しても通ってしまう。**
  // ⚠ **`@media (hover:none)` は対象外**（幅ではなく入力手段）。
  {
    const ALLOW = [];   // ⚠ **空。**⚠ 増やすときは、ここに理由と一緒に書く
    const css = await readFile(join(PUB, "css", "tokens.css"), "utf8");
    const found = [];
    // ⚠ **theme.css も見る**（2026-08-26・hidetzu/konjaku#96）。⚠ **色みは media query を持ちうる**
    //   （⚠ 次の段で `prefers-color-scheme` が入る）。⚠ **見ない先に書かれたら気づけない。**
    const theme = await readFile(join(PUB, "css", "theme.css"), "utf8").catch(() => "");
    for (const [f, s0] of [["index.html", src["index.html"]], ["peel.html", src["peel.html"]],
                           ["css/tokens.css", css], ["css/theme.css", theme]]) {
      // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **この決めごとを説明した字を拾う**
      const bare = (s0 ?? "").replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ");
      for (const m of bare.matchAll(/@media[^{]*\(\s*max-width\s*:\s*([^)]+?)\s*\)/g))
        found.push([f.replace("css/", ""), m[1].trim()]);
    }
    const extra = found.filter(([f, v]) => !ALLOW.some(([af, av]) => af === f && av === v));
    const gone = ALLOW.filter(([af, av]) => !found.some(([f, v]) => f === af && v === av));
    extra.length
      ? bad(`max-width を新しく書いている: ${extra.map(([f, v]) => `${f} の ${v}`).join("、")}`
          + `（狭い幅を既定にする。広い幅だけ min-width で足す。docs/DOMAIN.md §4-2）`)
      : gone.length
        ? bad(`許していた max-width が消えている: ${gone.map(([f, v]) => `${f} の ${v}`).join("、")}`
            + `（⚠ **直したなら、この検査の ALLOW と docs/DOMAIN.md §4-2 も直す**）`)
        : ok(`幅の max-width は ${found.length} 箇所（⚠ **狭い幅が既定**。docs/DOMAIN.md §4-2）`);
    // ⚠ **決めごとが文書に書かれていること。**⚠ 検査だけあって理由が無いと、次の人が外す
    const dom = await readFile(join(ROOT, "docs", "DOMAIN.md"), "utf8");
    for (const w of ["狭い幅を既定", "min-width", "1px も変わっていない"])
      if (!dom.includes(w)) bad(`docs/DOMAIN.md に「${w}」が無い（決めごとと、残す理由を書く）`);
  }

  // ⚠ **PC の 2 カラムは、寸法を 1 か所で決める**（2026-08-20・hidetzu/konjaku#87）。
  //   ⚠ **呼ぶ側に幅を写さない。**写すと、変えるときに 2 か所を直すことになる。
  //   ⚠ **`max-width` を新しく書かない**（狭い幅を既定にする方針・hidetzu/konjaku#93）。
  {
    const bad2 = [];
    const css = await readFile(join(PUB, "css", "tokens.css"), "utf8");
    const idx2 = (src["index.html"] ?? "").replace(HTML_COMMENT, " ");
    // ⚠ 幅の定義は tokens.css の 1 か所
    const def = [...css.matchAll(/--detail-pane-width\s*:\s*([^;]+);/g)];
    if (def.length !== 1) bad2.push(`--detail-pane-width の定義が ${def.length} 個（1 個にする）`);
    else if (!/rem/.test(def[0][1])) bad2.push(`--detail-pane-width が rem でない: ${def[0][1].trim()}`);
    // ⚠ 呼ぶ側は var() で呼ぶ。⚠ **数字を書かない**
    if (!/var\(--detail-pane-width\)/.test(idx2))
      bad2.push("index.html が --detail-pane-width を使っていない（2 カラムの幅が別の場所で決まっている）");
    // ⚠ 2 カラムの規則は min-width の中だけ。⚠ 狭い幅は素のまま
    const mq = [...idx2.matchAll(/@media\s*\(min-width:\s*([\d.]+)rem\)\s*\{/g)].map((m) => m[1]);
    if (!mq.includes("68.75"))
      bad2.push("2 カラムの切り替え（min-width:68.75rem）が無い");
    // ⚠ **格子（grid）で作らない。**⚠ 実測（2026-08-20・1280×800）: 列を指定しても
    //   ⚠ **行が左右で共有され、2 つの列ではなく 2 列の表**になる。
    //   ⚠ 左の「明治期の面」（119px）が右の帯を押し下げ、右の写真（400px）が
    //     左のバッジを y=946 へ押し下げた。⚠ **「重ねる」が画面の外へ出た。**
    //   ⚠ **列ごとに独立して積むのは float。**⚠ 戻したら止める。
    const two = idx2.slice(idx2.indexOf("@media (min-width:68.75rem)"));
    if (/\.verdict\{[^}]*display:\s*grid/.test(two))
      bad2.push("2 カラムを grid で作っている（行が左右で共有され、2 列の表になる）");
    if (!/float:\s*right;\s*clear:\s*right/.test(two))
      bad2.push("右の列が float:right + clear:right で積まれていない（列が独立しない）");
    bad2.length
      ? bad(`PC の 2 カラムの寸法が 1 か所で決まっていない: ${bad2.join("、")}`)
      : ok("PC の 2 カラムは、幅がトークン 1 か所・切り替えは min-width・左右が同じ行から始まる");
  }

  // ⚠ **ブラウザの文字サイズ設定に追従すること**（2026-08-20・hidetzu/konjaku#91）。
  //   ⚠ 直す前は `html,body{font:14px/1.65 …}` があり、⚠ **画面が設定を上書きしていた。**
  //     実測（375×667）: 設定を 125% / 150% にしても
  //     ⚠ **body も h1 も #q も 1px も変わらなかった**（14 / 19 / 16px のまま）。
  //   ⚠ **`--text-*` を rem にするだけでは足りない。**⚠ **html の px を外すのが本体。**
  //   ⚠ 既定時の見た目は変えていない（0.875rem × 既定 16px = 14px）。
  {
    const bad2 = [];
    const css = await readFile(join(PUB, "css", "tokens.css"), "utf8");
    for (const [f, st0] of [["index.html", src["index.html"]], ["peel.html", src["peel.html"]],
                            ["tokens.css", css]]) {
      const st = (st0 ?? "").replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ");
      // ⚠ **html セレクタに font-size / font 短縮形を書かない。**
      //   ⚠ body に書くのはよい（ルートを動かさない）。
      for (const m of st.matchAll(/(^|[}\n])\s*([^{}\n]*\bhtml\b[^{}]*)\{([^}]*)\}/g)) {
        const sel = m[2].trim(), body = m[3];
        if (/font-size\s*:/.test(body) || /(^|;)\s*font\s*:/.test(body))
          bad2.push(`${f}「${sel}」に文字の大きさがある（ブラウザの設定を画面が上書きする）`);
      }
      // ⚠ **--text-* は rem。**px に戻すと、設定を上げても字が変わらない
      for (const m of st.matchAll(/(--text-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        const [, name, v] = m;
        if (/\d\s*(px|pt)\b/.test(v)) bad2.push(`${f} ${name}: ${v.trim()}（rem で書く）`);
      }
    }
    bad2.length
      ? bad(`文字サイズがブラウザ設定に追従しない: ${bad2.join("、")}`)
      : ok("文字の根元は rem で、html に font-size を書いていない（ブラウザの文字サイズ設定に追従する）");
  }

// ⚠ 文字の大きさは、生の px で書かない。
//   直す前は font-size の宣言が 127 件・値が 16 種に散らばっていて、同じ「根拠」を出すのに
//   9 / 9.5 / 10 / 10.5px が混在していた。**まとめて上げることができない状態**だった。
//   いまは二層（値の段 --text-* → 役割 --fs-*）にしてあり、使う側は役割だけを書く。
//   ここが緩むと、また散らばる。
{
  const raw = [], roles = new Map();
  for (const f of [...htmlFiles, ...jsFiles]) {
    // ⚠ var(--fs-x) の閉じ括弧まで取る。`)` を除外して切ると `var(--fs-x` が残り、
    //   全部「生の値」に見えて 127 件が落ちる（書いた直後に踏んだ）
    for (const m of src[f].matchAll(/font-size:\s*(var\([^)]*\)|[^;}"'`]+)/g)) {
      const v = m[1].trim();
      if (/^var\(--fs-[a-z-]+\)$/.test(v)) { roles.set(v, (roles.get(v) ?? 0) + 1); continue; }
      // ⚠ font-size:0 は「文字を隠す」手法で、大きさの指定ではない（.big.map-loading .loading）
      if (v === "0") continue;
      raw.push(`${f}: ${v}`);
    }
  }
  raw.length
    ? bad(`font-size に生の値を書いている: ${raw.join("、")}`
        + `（--fs-* を使うこと。値は :root の --text-* にしか置かない）`)
    : ok(`font-size は全部 --fs-* 経由（${[...roles.values()].reduce((a, b) => a + b, 0)} 箇所 / ${roles.size} 役割）`);

  // ⚠ 値の段は、両方の画面で同じ名前で定義されていること。
  //   片方だけ増やすと、同じ役割の文字が画面によって違う大きさになる。
  const scale = {};
  for (const f of ["index.html", "peel.html"]) {
    scale[f] = new Set();
    for (const m of (src[f] ?? "").matchAll(/(--text-[a-z0-9-]+)\s*:/g)) scale[f].add(m[1]);
  }
  // peel は 3D 固有の段（--text-hero 系）を持ってよい。逆は許さない
  const onlyIndex = [...scale["index.html"]].filter((v) => !scale["peel.html"].has(v));
  onlyIndex.length
    ? bad(`index.html にしかない文字の段がある: ${onlyIndex.join("、")}（peel.html にも同じ名前で置くこと）`)
    : ok(`文字の段は両方の画面で揃っている（index ${scale["index.html"].size} 段 / peel ${scale["peel.html"].size} 段）`);
}

// 2 画面で共通の見た目の定義は、1 か所にしか書かないこと。
// ⚠ 実測（2026-08-20）: 同じ名前・同じ値が **26 個**、index.html と peel.html の
//   両方に書いてあった。⚠ 片方だけ直すと、2 画面で見た目がずれる（ADR 0021）。
// ⚠ **色は、ここでは見ない**（2026-08-26・hidetzu/konjaku#96）。⚠ **`public/css/theme.css` へ移した。**
//   ⚠ 値が違っていた 5 つ（--bg / --ink / --ink-dim / --line / --surface）は、
//     ⚠ **「画面ごと」ではなく「地図の上かどうか」として theme.css が持つ。**
//   ⚠ **色の出どころが 1 か所であることは `test/check/color.mjs` が見る。**
{
  const fails = [];
  const styleOf = (t) => {
    const m = /<style>([\s\S]*?)<\/style>/.exec(t ?? "");
    return (m ? m[1] : "").replace(BLOCK_COMMENT, " ");
  };
  const declOf = (css) => {
    const o = {};
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) o[m[1]] = m[2].trim();
    return o;
  };
  // ⚠ src は public/ 直下しか持っていない。⚠ 読めなければ落とす（空振りさせない）
  const shared = declOf(await readFile(join(PUB, "css", "tokens.css"), "utf8").catch(() => ""));
  const idx = declOf(styleOf(src["index.html"])), peel = declOf(styleOf(src["peel.html"]));
  if (!Object.keys(shared).length) fails.push("public/css/tokens.css を読めない（この検査が何も見ていない）");
  else {
    // ① 共通のものが、ページ側に残っていないこと
    for (const [f, d] of [["index.html", idx], ["peel.html", peel]])
      for (const k of Object.keys(shared))
        if (k in d) fails.push(`${f} に ${k} が残っている（tokens.css と二重）`);
    // ② ⚠ 同じ名前・同じ値が 2 ページに新しく生えていないこと
    for (const k of Object.keys(idx))
      if (k in peel && idx[k] === peel[k]) fails.push(`${k} が 2 ページに同じ値で書かれている（tokens.css へ）`);
    // ③ 両ページが読み込んでいること
    for (const f of ["index.html", "peel.html"])
      if (!/href="\.\/css\/tokens\.css"/.test(src[f] ?? "")) fails.push(`${f} が tokens.css を読んでいない`);
  }
  fails.length
    ? bad(`2 画面で共通の見た目の定義が 1 か所になっていない: ${fails.slice(0, 5).join(" / ")}`
        + `（片方だけ直すと、2 画面で見た目がずれる）`)
    : ok(`2 画面で共通の見た目の定義は tokens.css の 1 か所（${Object.keys(shared).length} 個。`
        + `⚠ 色は theme.css が持つ）`);
}

// ============================================================
// ⚠ 畳んだ `<details>` の中に、⚠ 判定の結果を入れていないか
// ============================================================
// ⚠ **`test/check.mjs` の「6. まだ問いで分けていないもの」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 30 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「見せ方の決め方」の仲間である理由**: ⚠ **閉じていると画面に出ない。**
//   ⚠ **実際にやった**（2026-08-15）: ⚠ パネルを `<details>` にしたとき `#status` を巻き込み、
//     ⚠ **取れなかったことを言う文ごと消えた**（⚠ 実描画 9 件が落ちて気づいた）。
//   ⚠ **見出しの一文を、⚠ これに合わせて直した**（`CLAUDE.md` §5）。
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
