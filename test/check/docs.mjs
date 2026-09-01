// 静的検査 — 文書と数（⚠ **文書が言っていることと、⚠ 配っている現物が合うか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 5 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「9. 画面の言葉」の中にあった。**⚠ **画面の言葉の話ではない。**
//   ⚠ 1773 行・43 件を読んだところ、⚠ **4 つに分かれていた**（2026-08-24）:
//     1〜25 件   ⚠ 画面の言葉・1 か所か（⚠ 節の名前どおり）
//     26〜34 件  ⚠ **文書と数** ← ここ
//     36〜42 件  ⚠ CI と実描画の回し方（⚠ hidetzu/konjaku#236 で `deliver.mjs` へ）
//     35 件目    画面・README・SPEC の名乗り（⚠ 言葉の側に残す）
//
// ⚠ **ここが守っているもの**:
//     SPEC に件数・寸法を書いていない   ⚠ **数は走らせて数える**（書き戻すと落ちる）
//     ADR を全部載せている・本数が合う   ⚠ 一覧が古くならないこと
//     住所検索の口は 1 か所              ⚠ **性質は「1 か所か」寄り。**⚠ 下を見る
//     fixture が 42 語・取得日が分かる   ⚠ 控えがいつのものか言えること
//     SPEC の数字が現物と合っている      ⚠ 文書は誰も実行しないので、ずれても気づかない
//     配っている建物を数えた             ⚠ 現物そのもの
//
// ⚠ **「住所検索の口は 1 か所」だけ、⚠ 性質が違う**（⚠ 本当は「1 か所か」の主題）。
//   ⚠ **`26〜34` の真ん中に挟まっており、⚠ そこだけ抜くほうが不自然**なので一緒に運んだ。
//   ⚠ **「1 か所か」を切り出すときに、⚠ 見直す。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, PUB, ok, bad, warn, head, src , BLOCK_COMMENT, HTML_COMMENT, HEAD_COMMENT, LINE_COMMENT, dropComment } from "./lib.mjs";

// ⚠ **SPEC の「静的 N件」が、本当に N 件か。**
//   上の検査は「空・0・書き方」だけを見ていて、**中身のずれは見ていなかった**。
//   実測（2026-08-19）: 検査を 1 件足したのに SPEC は 148 のままで、**緑のまま main へ出た**。
//   ⚠ 文書は誰も実行しないので、ずれても誰も気づかない（掟: 実装 → 検査 → … → SPEC）。
// ⚠ **この検査自身も 1 件に数える。**数えないと、足すたびに 1 ずれる。
// ⚠ どれかが落ちていると ✓ が減るので、ここも一緒に落ちる。
//   **落ちた側を直すのが先**で、SPEC の数字を合わせにいく話ではない。
// ⚠ **外へ出る指定（--links / --links-new）のときは数えない。**
//   その指定でしか走らない検査があるぶん、必ず多くなる。
//   実測（2026-08-19）: 手元も CI の 1 回目も 151 件だったが、CI は同じジョブで
//   `--links-new` をもう一度回しており、そちらが **153 件**で落ちた。
//   ⚠ **黙って飛ばさない。**数えなかったことを、その場で名乗る。
{
  // ⚠ **`docs/SPEC.md` に検査の件数を書かない**（2026-08-22。hidetzu/konjaku#184。Owner 判断）。
  //   ⚠ **前は「SPEC の件数 == 実際の数」を見ていた。**⚠ その主張自体は正しかったが、
  //     ⚠ **検査を 1 件足すたびに人が同じ行を書き換える**ことになり、
  //     ⚠ **良い変更を並行して 2 本走らせると必ず競合した**（2026-08-22 に同じ日で 3 回）。
  //   ⚠ **競合中は CI が走らない**ので、⚠ 「CI が出ない」という形で詰まる。
  // ⚠ **守るものを置き換えた。**⚠ 「直し忘れ」は、⚠ **書く場所を無くせば起きない。**
  //   ⚠ 代わりに ⚠ **書き戻したら落ちる**ことと、⚠ **0 件で緑にしない**ことを見る。
  // ⚠ **走った数は、この下で必ず名乗る**（⚠ 数が読めなくなったわけではない）。
  const spec = await readFile(join(ROOT, "docs", "SPEC.md"), "utf8").catch(() => "");
  const back = [/静的[^\n]*?\*\*\d+件\*\*/, /実描画[^\n]*?\*\*\d+件\*\*/,
                /--group=(core|search)`?（\*\*\d+件\*\*/]
    .filter((re) => re.test(spec));
  back.length
    ? bad(`docs/SPEC.md に検査の件数が書かれている（${back.length} か所）`
        + "。⚠ 件数は走者が出力する。⚠ 書くと、⚠ **並行作業で必ず競合する**")
    : ok("docs/SPEC.md に検査の件数が書かれていない（⚠ 数は走らせて数える）");
  // ⚠ **`docs/SPEC.md` に画面の寸法を書かない**（2026-08-22。Owner 判断）。
  //   ⚠ **寸法は、⚠ 画面を変えるたびに古くなる。**⚠ **実際に古くなった**: hidetzu/konjaku#194 が
  //     `#era` と畳むボタンを消したのに、⚠ SPEC は「年代の箱の頭は細く保つ／開閉は記号だけ」と
  //     ⚠ **言い続けていた**（4 幅で測って、⚠ **どの幅にも存在しなかった**）。
  //   ⚠ **消すのは数字であって、主張ではない**（掟 §1）。⚠ 「1 行に収める」「刻みは的にしない」は残す。
  //   ⚠ **いまの姿は検査が持ち、⚠ 経緯は ADR / Issue が持つ**（`CLAUDE.md` 冒頭）。
  //   ⚠ **`44×44` は寸法ではなく決まり**なので、⚠ `px` を付けずに書く（`.claude/rules/css.md` と同じ字）。
  const px = [...spec.matchAll(/[^\n。]{0,30}(?:\d+px|[xy]=-?\d+)[^\n。]{0,20}/g)].map((m) => m[0].trim());
  px.length
    ? bad(`docs/SPEC.md に画面の寸法が書かれている（${px.length} か所）: ${px.slice(0, 3).join(" ／ ")}`
        + "。⚠ 寸法は画面を変えるたびに古くなる。⚠ **いまの姿は検査が持つ**")
    : ok("docs/SPEC.md に画面の寸法が書かれていない（⚠ いまの姿は検査が持つ）");
  // ⚠ **`docs/adr/README.md` が、⚠ ADR を 1 本も落としていないこと**（2026-08-22）。
  //   ⚠ **README 自身が、⚠ この失敗を書いている**: 「2026-08-19 まで、25 本中 10 本しか載せていなかった」。
  //   ⚠ **載っていないものは「採用されていない」に読める。**⚠ だから ⚠ **一部だけを載せない。**
  //   ⚠ **いままで誰も見ていなかった**（⚠ 見ていたのは「コードから指している ADR が実在するか」だけ）。
  const adrDir = join(ROOT, "docs", "adr");
  const adrFiles = (await readdir(adrDir).catch(() => []))
    .filter((f) => /^\d{4}-.+\.md$/.test(f));
  const readme = await readFile(join(adrDir, "README.md"), "utf8").catch(() => "");
  const missing = adrFiles.filter((f) => !readme.includes(f));
  if (!adrFiles.length) {
    bad("docs/adr/ に ADR が 1 本も無い（⚠ この検査が何も見ていない）");
  } else {
    missing.length
      ? bad(`docs/adr/README.md に載っていない ADR がある（${missing.length} 本）: ${missing.join(" ／ ")}`
          + "。⚠ **一部だけを載せない。**⚠ 載っていないものは「採用されていない」に読める")
      : ok(`docs/adr/README.md は ADR を全部載せている（${adrFiles.length} 本）`);
    // ⚠ **本数の名乗りも合っているか。**⚠ 「27 本とも採用中」と書いたまま 28 本になる
    const said = /全部（⚠ \*\*(\d+) 本とも採用中\*\*）|全部（⚠ (\d+) 本とも採用中）/.exec(readme);
    const n = said ? Number(said[1] ?? said[2]) : null;
    n === adrFiles.length
      ? ok(`docs/adr/README.md の本数の名乗りが合っている（${n} 本）`)
      : bad(`docs/adr/README.md が ${n ?? "?"} 本と名乗っているが、実体は ${adrFiles.length} 本`);
  }
}

// ⚠ **住所検索の口を、⚠ 2 か所に書かない**（2026-08-22。hidetzu/konjaku#181）。
//   ⚠ **実際に踏んだ**: `public/places.js` と `test/search-check.mjs` が同じ URL を持ち、
//     ⚠ **42 語の回帰が、⚠ 本番の取得経路を 1 度も通っていなかった。**
//     ⚠ **検査が確かめていたのは「検査自身が書いた通信」**で、⚠ 出荷するコードではなかった。
//   ⚠ **口は `public/gsi-address-search.js` だけが持つ。**
//   ⚠ **ホスト名だけを挙げる所は別**（⚠ 外部リンクの確認・⚠ 出典の一覧）。⚠ **口の形で見る。**
{
  // ⚠ **探す字を、⚠ そのまま書かない**（⚠ 書くと ⚠ **この検査が自分を拾う**。CLAUDE.md §5）。
  //   ⚠ **実際に踏んだ**（2026-08-22）。
  const NEEDLE = "address-" + "search/Address" + "Search";
  const OWNER = "public/gsi-address-search.js";
  const { readdirSync: rdj } = await import("node:fs");
  const cand = [...rdj(join(ROOT, "public")).filter((f) => f.endsWith(".js")).map((f) => `public/${f}`),
    ...rdj(join(ROOT, "test")).filter((f) => f.endsWith(".mjs")).map((f) => `test/${f}`),
    ...rdj(join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`)];
  const holders = [];
  for (const f of cand) {
    if (f === OWNER) continue;
    const t = await readFile(join(ROOT, f), "utf8").catch(() => "");
    // ⚠ **文字列として書いているものだけを見る**（⚠ コメントで名前を出すのは構わない）
    if (new RegExp(`["'\`][^"'\`]*${NEEDLE}`).test(t)) holders.push(f);
  }
  holders.length
    ? bad(`住所検索の口を書き写している: ${holders.join("、")}`
        + `。⚠ **口は ${OWNER} の1か所。**⚠ 写すと、⚠ **検査が本番の経路を通らなくなる**`)
    : ok(`住所検索の口は ${OWNER} の1か所（⚠ ${cand.length} ファイルを見た）`);
}

// ============================================================
// ⚠ 住所検索を叩いているのが 1 か所だけか
// ============================================================
// ⚠ **`test/check.mjs` の「5. OGP」から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 14 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **元の節名は「OGP」だったが、⚠ 中身は OGP ではなかった**
//     （⚠ 実測 2026-08-24: ⚠ **471 行のうち OGP は 41 行**）。
// ⚠ **ここが「住所検索の口」の続きである理由**: ⚠ **すぐ上が「口を書き写していないか」。**
//   ⚠ こちらは ⚠ **その口を、⚠ 実際に叩いているのが 1 か所か。**⚠ 同じ問いの表と裏。
// ⚠ **住所検索を叩く実装は1か所だけ。**
//   以前は index.html と peel3d.js が同じものを持っていて、**実際に食い違っていた**
//   （/peel だけ時間切れも再試行も追い越し防止も無く、取れなかったときに
//   「見つかりませんでした」と書いていた）。揃え直したあとも「揃えてあるだけ」で、
//   片方だけ直す事故が起きうる状態だった（掟: 同じ問いに答える実装を2つ持たない）。
{
  const files = ["index.html", "peel.html", "places.js", "gsi-address-search.js", "peel3d.js", "verify.js", "events.js", "share.js", "esc.js", "sw.js"];
  const hits = [];
  for (const f of files) {
    const t = await readFile(join(PUB, f), "utf8").catch(() => "");
    // ⚠ コメントは落とす。落とさないと、この決まりを説明したコメントを拾う。
    //   ⚠ `//` を素朴に落とすと URL を食うので、直前が `:` なら落とさない。
    const bare = t.replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ")
      .replace(LINE_COMMENT, "$1");
    const n = (bare.match(/AddressSearch\?q=/g) ?? []).length;
    if (n) hits.push(`${f}×${n}`);
  }
  // ⚠ **2026-08-22 に、⚠ 口を `gsi-address-search.js` へ切り出した**（hidetzu/konjaku#181）。
  //   ⚠ **期待する場所が変わっただけ。**⚠ 「1 か所だけ」という主張は変えていない。
  hits.length === 1 && hits[0].startsWith("gsi-address-search.js")
    ? ok(`住所検索を叩くのは gsi-address-search.js の1か所だけ（${hits[0]}）`)
    : bad(`住所検索を叩く箇所が1つでない: ${hits.join("、") || "0 か所"}`
      + `（画面ごとに持つと、片方だけ直す事故が起きる。gsi-address-search.js を使うこと）`);
}
// ⚠ **42 語すべてに fixture があるか**（2026-08-22。hidetzu/konjaku#204）。
//   ⚠ **走らせる前に分かる。**⚠ **走らせてから気づくと、⚠ 1 語ぶん静かに減る。**
//   ⚠ **実際に踏んだ**: 控えを別名で戻して fixture を 1 つ壊したとき、
//     ⚠ **検査は「取れなかった」として保留にし、⚠ 緑のままだった。**
{
  const sc = await readFile(join(ROOT, "test", "search-check.mjs"), "utf8").catch(() => "");
  const head = sc.slice(0, sc.indexOf("const WORDS = ["));
  const words = [...head.matchAll(/\n\s*\["([^"]+)",/g)].map((m) => m[1]);
  const fixDir = join(ROOT, "test", "fixtures", "search");
  const fixFiles = (await readdir(fixDir).catch(() => []))
    .filter((f) => f.endsWith(".json") && f !== "_meta.json")
    .map((f) => decodeURIComponent(f.replace(/\.json$/, "")));
  if (!words.length) {
    bad("test/search-check.mjs から語を読めない（⚠ この検査が何も見ていない）");
  } else {
    const lack = words.filter((w) => !fixFiles.includes(w));
    const extra = fixFiles.filter((w) => !words.includes(w));
    lack.length || extra.length
      ? bad("検索の fixture が語と合っていない"
          + (lack.length ? ` — 足りない ${lack.length} 語: ${lack.slice(0, 5).join("、")}` : "")
          + (extra.length ? ` — 余り ${extra.length}: ${extra.slice(0, 5).join("、")}` : "")
          + "。⚠ node test/search-check.mjs --update-fixtures で取り直す")
      : ok(`検索の fixture が ${words.length} 語ぶん揃っている（⚠ 余りも無い）`);
    // ⚠ **いつ取ったかが分かること。**⚠ **分からないと、⚠ いつの応答で回したか言えない**
    const fm = await readFile(join(fixDir, "_meta.json"), "utf8").then(JSON.parse).catch(() => null);
    fm?.takenAt
      ? ok(`検索の fixture の取得日が分かる（${fm.takenAt}）`
          + "。⚠ **本物との疎通は test/search-live-check.mjs が別に見る**")
      : bad("検索の fixture の取得日が分からない（test/fixtures/search/_meta.json の takenAt）");
  }
}

// ⚠ **建物タイルを数える節は落とした**（2026-09-01。`docs/adr/0080`）。
//   ⚠ **数えていたのは β 版の `public/data/bl`。**⚠ **本番から消えた。**
//   ⚠ **v0.1.0 は建物を使わない**（⚠ 使い始めたら、⚠ そのとき改めて数える）。

// ============================================================
// ⚠ ドメインモデル（docs/DOMAIN.md）が、実物とつながっているか
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 8 本目）。
//   ⚠ **1 文字も変えていない。**
// ⚠ **ここが「文書と数」の仲間である理由**: ⚠ **文書が名指ししているものが実在するか**を見る。
//   ⚠ **文書は誰も実行しない。**⚠ ずれても、⚠ 誰も気づかない。

// ドメインモデル（docs/DOMAIN.md）が、実物とつながっていること。
// ⚠ **文書は誰も実行しないので、黙って古くなる。**機械で見られるところだけ見る。
// ⚠ **中身の正しさ（言葉づかいが良いか）はここでは見ない。**見るのは
//   「言葉の持ち主」として名指ししたものが**実在するか**と、
//   ⚠ **画面に出さないと決めた語が、本当に出ていないか**。
{
  const dom = await readFile(join(ROOT, "docs", "DOMAIN.md"), "utf8").catch(() => "");
  const fails = [];
  if (!dom) fails.push("docs/DOMAIN.md を読めない");
  else {
    // ① 持ち主として名指ししたものが実在すること
    // ⚠ **2026-09-01 に v0.1.0 の持ち主へ書き直した**（`docs/adr/0080`）。
    //   ⚠ **`prov.js` は β 版のもの。**⚠ **本番から消えた。**
    const OWNERS = [["public/answer.js", "MEIJI_NONE"], ["public/words.js", "GROUND_GLOSS"],
                    ["public/swale.js", "SWALE"], ["public/verify.js", "ERAS"],
                    ["public/monument.js", "nearby"], ["public/saved.js", "merge"]];
    for (const [f, sym] of OWNERS) {
      if (!dom.includes(f)) fails.push(`DOMAIN.md が ${f} を名指ししていない`);
      const src2 = f.startsWith("public/") ? src[f.slice(7)] : null;
      if (src2 == null) fails.push(`${f} を読めない`);
      else if (!src2.includes(sym)) fails.push(`${f} に ${sym} が無い（持ち主が変わった）`);
    }
    // ② ⚠ 画面に出さないと決めた語が、**利用者に見えるところ**に出ていないこと。
    //   ⚠ コメントは先に落とす（検査が自分の説明を拾う。3 回踏んでいる）。
    //   ⚠ 出典・/about は別（そこでは使ってよい）。ここでは
    //     **判定文を組み立てている行**だけを見る。
    const strip = (t) => (t ?? "").split("\n")
      .map(dropComment).join("\n").replace(HTML_COMMENT, " ");
    const BAN = [
      { w: "この場所は", why: "場所の指し方は「この土地は」に統一（DOMAIN §2-1）" },
    ];
    for (const f of ["index.html", "top.js", "deep.js"])
      for (const g of BAN) {
        const n = [...strip(src[f]).matchAll(new RegExp(g.w, "g"))].length;
        if (n) fails.push(`${f} に「${g.w}」が ${n} 箇所（${g.why}）`);
      }
  }
  fails.length
    ? bad(`ドメインモデルと実物が食い違っている: ${fails.join(" / ")}`
        + `（docs/DOMAIN.md が言葉の持ち主。実装を変えたら、そちらも直す）`)
    : ok(`docs/DOMAIN.md の名指しは実在し、統一した語だけが画面に出ている`);
}

// ============================================================
// ⚠ 掟は「番号」ではなく「名前」で引いているか
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 13 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「文書と数」の仲間である理由**: ⚠ **文書を消すと、⚠ 番号は宙に浮く。**
//   ⚠ **落ちない。**⚠ 誰にとっても意味を持たない文字列が、⚠ コードに残るだけ。
// ⚠ 掟は「番号」ではなく「名前」で引く。
//   以前はコードに「節番号」（章記号＋3.23 のような数）が141箇所あり、
//   削除済みの長文設計メモの節を指していた。
//   ただし調べると**参照ではなく引用**で、掟の中身はその場に書いてあった。
//   番号は誰にとっても意味を持たない文字列で、しかも文書を消すと宙に浮く。
//   → 名前で引く（`（掟: 取れなかったを「無い」と言わない）`）。番号に戻さない。
{
  const { readFileSync: rfk, readdirSync: rdk } = await import("node:fs");
  const files = [...rdk("public").filter((f) => /\.(html|js)$/.test(f)).map((f) => `public/${f}`),
    ...rdk("scripts").filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`),
    // ⚠ **検査は `test/` にある**（2026-08-22）。⚠ **ここを落とすと、⚠ 検査の中の §番号を見なくなる。**
    ...rdk("test").filter((f) => f.endsWith(".mjs")).map((f) => `test/${f}`),
    ...rdk("test/render").filter((f) => f.endsWith(".mjs")).map((f) => `test/render/${f}`), "worker.js"];
  const hit = [];
  for (const f of files) {
    let t = ""; try { t = rfk(f, "utf8"); } catch { continue; }
    const m = t.match(/§\d+\.\d+/g);
    if (m) hit.push(`${f}(${m.length})`);
  }
  hit.length
    ? bad(`節番号での参照が戻っている: ${hit.join("、")}。掟は名前で引くこと`)
    : ok(`掟は名前で引いている（節番号での参照は 0 件）`);
}

// ============================================================
// ⚠ docs/SPEC.md に空の強調が残っていないか
// ============================================================
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 18 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **この 2 つは、⚠ 節 9 の道具（`seen` / `stripJs`）に触っていない**
//     （⚠ 実測 2026-08-24）。⚠ **だから、⚠ 道具を動かす前に出せる。**
// ⚠ **ここが「文書と数」の仲間である理由**: ⚠ **すぐ上に SPEC の検査が 2 つある。**
//   ⚠ **文書は誰も実行しないので、⚠ 壊れても誰も気づかない**（⚠ 一度出した）。
// ⚠ **空の強調が残っていないか。**
//   実測（2026-08-18）: SPEC の「静的 **N件**」が **`****`** になったまま main へ出た。
//   置換に使ったシェル変数が空に展開されて、数字が消えていた。
//   ⚠ **文書は誰も実行しないので、壊れても誰も気づかない。**（一度出した）
// ⚠ **2026-08-22 に、⚠ 件数そのものを SPEC から外した**（hidetzu/konjaku#184。Owner 判断）。
//   ⚠ **「4 つとも数字で書かれているか」は、⚠ もう見ない**（⚠ 書かないと決めたので、主張が反転した）。
//   ⚠ **書いてあったら落とすほう**は、上の「件数が書かれていない」検査が見る。
//   ⚠ **ここに残すのは、⚠ 空の強調そのもの**（⚠ 件数に限らず、⚠ 置換の失敗は今後も起こりうる）。
{
  const spec = await readFile(join(ROOT, "docs", "SPEC.md"), "utf8").catch(() => "");
  if (!spec) bad("docs/SPEC.md を読めない");
  else {
    const empty = [...spec.matchAll(/\*\*\s*\*\*/g)].length;
    empty
      ? bad(`docs/SPEC.md に空の強調が ${empty} 箇所ある`
          + "（置換に失敗しても、文書は誰も実行しないので気づけない）")
      : ok("docs/SPEC.md に空の強調は無い");
  }
}

// ⚠ **追跡ファイルが、⚠ 追跡していない場所（`tmp/`）を指していないか** ----
//
// ⚠ **`tmp/` は git に追跡していない。**⚠ **上書き・削除されても誰も気づけない。**
//   ⚠ **実際に失われた**（2026-08-31 に数えた）: ⚠ **ADR が「原文」と呼んでいたものが、
//   ⚠ 別の内容に上書きされていた。**⚠ **12 件から参照されていて、⚠ もう読めないものもある。**
// ⚠ **v0.1.0 が何を解決するのかを書いた文書は、⚠ 7 件から参照されていたので `docs/` へ移した**
//   （⚠ 移す前に消えていたら、⚠ どこにも無くなっていた）。
//
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ この説明に書いた字面を、
//   ⚠ 検査自身が拾う**（⚠ 2026-08-31 に踏んだ。⚠ **この節を書いた直後に、⚠ 自分で落ちた**）。
//
// ⚠ **既に失われたものは、⚠ 理由と一緒に一覧へ書く**（⚠ 消えた記録を、⚠ 無かったことにしない）。
//   ⚠ **これから増えるものを止めるのが、⚠ この検査の目的。**
{
  const { existsSync: ex } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");

  // ⚠ **もう読めないと分かっているもの**（2026-08-31 に実測）。⚠ **増やさない。**
  const 失われた = new Map([
    ["tmp/tmp2.md", "Owner の原文。⚠ ADR 0052・0056・0057 ほかが引く。⚠ 決めたことは ADR 本文が持つ"],
    ["tmp/tmp3.md", "Owner の原文。⚠ ADR 0030 が引く。⚠ 決めたことは ADR 本文が持つ"],
    ["tmp/tmp.md", "Owner の原文。⚠ ADR 0049 の「原文」。⚠ 別の内容へ上書きされていた"],
    ["tmp/measure-urllen.mjs", "その場で測った走り書き。⚠ 数字は ADR 本文に控えてある"],
  ]);

  const 追跡 = execFileSync("git", ["ls-files", "docs", "test", "public-next", "wrangler.next.jsonc"],
    { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /\.(md|mjs|js|jsonc|html)$/.test(f));
  const 死んでいる = new Map(), 生きている = new Set();
  for (const f of 追跡) {
    // ⚠ **落とし方は `lib.mjs` から借りる**（⚠ コピーが増えると、⚠ どれが正か分からなくなる）。
    const 素 = (await readFile(join(ROOT, f), "utf8").catch(() => ""))
      .replace(HTML_COMMENT, " ")
      .replace(BLOCK_COMMENT, " ")
      .replace(HEAD_COMMENT, " ");
    // ⚠ **日本語のファイル名と空白も拾う**（2026-08-31 に踏んだ。⚠ **`[A-Za-z0-9._-]` だけだと、
    //   ⚠ `tmp/今昔 利用規約.md` のようなものを一生見ない**。⚠ **その日に直した相手がそれだった**）。
    //   ⚠ **区切りになる字だけ外す**（⚠ 引用符・括弧・読点。⚠ ここで欲張ると隣の文まで飲む）。
    for (const m of 素.matchAll(/tmp\/[^\n`"'、。（）()\[\]<>|]+?\.(?:md|mjs|json|jsonc|txt|png)/g)) {
      const 先 = m[0];
      if (失われた.has(先)) continue;
      if (ex(join(ROOT, 先))) { 生きている.add(先); continue; }
      if (!死んでいる.has(先)) 死んでいる.set(先, []);
      死んでいる.get(先).push(f);
    }
  }

  死んでいる.size
    ? bad(`追跡ファイルが、⚠ 存在しない ${死んでいる.size} 件を指している: `
        + [...死んでいる].map(([先, どこ]) => `${先}（${どこ.join("・")}）`).join(" ／ ")
        + "。⚠ **参照される文書は `docs/` へ移す**"
        + "（⚠ もう読めないものは、⚠ この検査の一覧に理由と一緒に書く）")
    : 生きている.size
      ? warn(`追跡ファイルが、⚠ 追跡外の ${生きている.size} 件をまだ指している: `
          + `${[...生きている].join(" ／ ")}。⚠ **いま在るが、⚠ 消えても誰も気づけない**`)
      : ok(`追跡ファイルは、⚠ 追跡していない場所を指していない`
          + `（⚠ もう読めないと分かっているもの ${失われた.size} 件は、⚠ 理由つきで一覧に在る）`);
}
