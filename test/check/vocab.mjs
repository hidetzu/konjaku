// 静的検査 — 語の棚卸し（⚠ **画面に出ている語が、⚠ 棚卸しと合っているか**）
//
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 22 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **表（`SCREEN_WORDS`）と一緒に動く**ので、⚠ **1 本にまとめた。**
//   ⚠ **散文の表を文書に置かない**（⚠ 直した先から表のほうが黙って古くなる）。
//   ⚠ **ここに置いて、⚠ 両方向で突き合わせる**:
//     ① 表より少ない … ⚠ 直したのに表に残っている（⚠ 表が古い）
//     ② 表より多い   … ⚠ 増やした（⚠ 棚卸しを通さずに内部語が増えた）
//
// ⚠ **ここが守っているもの**:
//     画面に出ている語        ⚠ 作り手側の区別（分類）と、⚠ 状態を指す語
//     一度消した語            ⚠ **戻っていないこと**（⚠ 表は「いまある語」しか見ない）
//     台帳が読む area の項目   ⚠ 言葉を組み直す鍵に、⚠ 全部載っているか
//     日本語を含む語の並び     ⚠ **同じ定義を 2 か所に書かない**
//     HTML の中の「言葉の判断」 ⚠ **組み立てながら「何と言うか」を決めない**
//     根拠カードの取得方法     ⚠ 棚卸しのとおりか
//
// ⚠ **`words.mjs`（言葉は 1 か所から）とは別。**⚠ あちらは ⚠ **その字を誰が持っているか。**
//   ⚠ こちらは ⚠ **画面に出ている語そのものを、⚠ 数えて突き合わせる。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUB, ok, bad, head, src, seen, TOP, htmlFiles, jsFiles, BLOCK_COMMENT, HTML_COMMENT, HEAD_COMMENT } from "./lib.mjs";

head("語の棚卸し");

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

// ============================================================
// ⚠ 区分名の補助説明が、⚠ 棚卸しどおり揃っているか
// ============================================================
// ⚠ **`test/check.mjs` の「6. まだ問いで分けていないもの」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 24 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「語の棚卸し」の仲間である理由**: ⚠ **36 区分ぶんの語を、⚠ 数えて突き合わせる。**
//   ⚠ 18 字以内 ／ ⚠ 原典の丸写しなし ／ ⚠ 互いに違う ／ ⚠ 呼ぶ側に写しなし。
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
