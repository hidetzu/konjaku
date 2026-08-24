// 静的検査 — 動きを減らす（⚠ **設定した人の指定を、⚠ 無視していないか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 9 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**:
//     深掘りの画面でカメラを振らない  ⚠ **実描画では読めない**（zoom は画面に出ない）
//                                     ⚠ **だから経路のほうを見る**
//     動きだけを消している            ⚠ **画面ごとに要る。**⚠ 片方だけだと、もう片方は動く
//     寄せる操作は受け口 1 つ         ⚠ 生の `behavior:"smooth"` が散ると、⚠ 片方だけ直し忘れる
//                                     （⚠ 実測 2026-08-19: `index.html` に 7 か所あった）
//     CSS と JS が同じ問いを見ている  ⚠ **1 つにはできない**（書く場所が違う）。⚠ 機械で突き合わせる
//
// ⚠ **これは `ui-ux-review` §3「アクセシビリティの下限」の、⚠ 機械で見られる部分。**
//   ⚠ **押せる的の大きさや、⚠ フォーカスの見え方は、⚠ 実描画が見る**（⚠ ここでは見ない）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { ok, bad, head, src, TOP } from "./lib.mjs";

head("動きを減らす");

// 「動きを減らす」を入れている人に、深掘りの画面でカメラを振らないこと。
// ⚠ **実描画で読めるのは bearing と pitch だけ**（MapLibre のコンパスの style から）。
//   ⚠ **zoom は画面に出ていない。**だからここで**経路のほうを**見る。
//   ⚠ これは「zoom が動かないことを測った」ではない。**そう書かない。**
{
  const src2 = src["peel3d.js"] ?? "";
  const fails = [];
  // ⚠ 受け口が 1 つあること。毎フレーム matchMedia() を作らない形になっていること
  if (!/const lessMotionMQ\s*=\s*matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)/.test(src2))
    fails.push("peel3d.js が「動きを減らす」を見ていない（受け口が無い）");
  // ⚠ カメラを振る呼び出しが、**減らしていない側にだけ**あること。
  //   ⚠ 行で見る。字面の数だけ数えると、条件の外に出しても気づけない
  const lines = src2.split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, ""));
  const sweep = lines
    .map((l, i) => ({ l, i }))
    .filter((x) => /map\.jumpTo\([^)]*bearing\s*:\s*b0\s*\+/.test(x.l));
  if (sweep.length !== 1) fails.push(`カメラを振る呼び出しが ${sweep.length} 箇所（1 つのはず）`);
  else {
    // ⚠ **直前の行が番人であること。**番人ごと消えても、上の走査は 1 件で通ってしまう
    const guard = lines[sweep[0].i - 1] ?? "";
    if (!/if\s*\(\s*!\s*lessMotionMQ\.matches\s*\)/.test(guard))
      fails.push(`カメラを振る前に番人が無い: ${(guard.trim() || "(空行)").slice(0, 60)}`);
  }
  fails.length
    ? bad(`深掘りの画面が「動きを減らす」を見ていない: ${fails.join(" / ")}`
        + `（年代の送りと所要時間は変えない。消すのはカメラの動きだけ）`)
    : ok(`深掘りの画面は、動きを減らす人にカメラを振らない`
        + `（⚠ 経路を見ている。zoom が動かないことは実描画では測れない）`);
}

// 「動きを減らす」を入れている人に、動きだけを消していること。
// ⚠ **画面ごとに要る。**片方だけ入れても、もう片方は動いたままになる。
// ⚠ **寄せる操作は受け口 1 つに通す。**生の behavior:"smooth" が散ると、
//   片方だけ直し忘れる（実測 2026-08-19: index.html に 7 か所あった）。
{
  const fails = [];
  const MQ = "@media (prefers-reduced-motion: reduce)";
  for (const f of ["index.html", "peel.html"])
    if (!(src[f] ?? "").includes(MQ)) fails.push(`${f} に「動きを減らす」の媒体クエリが無い`);
  // ⚠ **受け口が behavior を決めているので、字面はそこに 1 つだけ残る。**
  //   ⚠ 「1 個までなら許す」にしない。**受け口の行かどうか**で見る。
  //     数で許すと、受け口を消して別の場所に 1 個書いても通ってしまう。
  // ⚠ **コメントを先に落とす。**落とさないと、この検査を説明したコメントを
  //   検査自身が拾う（CLAUDE.md「コメント」の節。実測 2026-08-19 に踏んだ）。
  for (const f of Object.keys(src)) {
    const stray = (src[f] ?? "").split("\n")
      .map((line, i) => ({ line: line.replace(/(^|\s)\/\/.*$/, ""), i }))
      .filter((x) => /behavior\s*:\s*["']smooth["']/.test(x.line) && !/scrollToEl/.test(x.line));
    if (stray.length)
      fails.push(`${f}:${stray.map((x) => x.i + 1).join("・")} に生の behavior:"smooth"`
        + `（受け口 scrollToEl を通すこと。呼ぶ側は「どこへ寄せるか」だけ言う）`);
  }
  // ⚠ 受け口そのものが消えていないこと（消すと、上の走査は 0 件で通ってしまう）
  if (!/const scrollToEl\s*=/.test(TOP))
    fails.push("index.html に受け口 scrollToEl が無い（この検査が何も見ていない）");
  // ⚠ **同じ問いを 2 か所で聞いている。**CSS の媒体クエリと JS の matchMedia。
  //   片方だけ直すと、**CSS は詰まったのに寄せる操作は滑らかなまま**になる。
  //   ⚠ 1 つにはできない（CSS と JS で書く場所が違う）。だから機械で突き合わせる。
  {
    const cond = (t) => {
      const a2 = /@media\s*\(\s*prefers-reduced-motion\s*:\s*([a-z-]+)\s*\)/.exec(t ?? "");
      const b2 = /matchMedia\(\s*["']\(prefers-reduced-motion:\s*([a-z-]+)\)["']\s*\)/.exec(t ?? "");
      return [a2?.[1] ?? null, b2?.[1] ?? null];
    };
    // ⚠ **画面ごとに、CSS 側と JS 側を突き合わせる。**
    //   トップは index.html の中に両方ある。深掘りは peel.html（CSS）と peel3d.js（JS）に分かれている。
    //   ⚠ 分かれているぶん、こちらのほうが食い違いやすい。
    for (const [name, cssSrc, jsSrc] of [
      // ⚠ **トップも 2 ファイルに分かれた**（2026-08-24）。⚠ CSS は index.html・JS は top.js
      ["index.html ↔ top.js", src["index.html"], src["top.js"]],
      ["peel.html ↔ peel3d.js", src["peel.html"], src["peel3d.js"]],
    ]) {
      const css = cond(cssSrc)[0], js = cond(jsSrc)[1];
      if (!css || !js) fails.push(`${name} で条件を読めない（CSS=${css} / JS=${js}）`);
      else if (css !== js) fails.push(`${name}: CSS は ${css}・JS は ${js} を見ている（食い違うと片方だけ効く）`);
    }
  }
  fails.length
    ? bad(`「動きを減らす」の扱いが揃っていない: ${fails.join(" / ")}`
        + `（動きだけを消す。送り先や年代の送りは変えない）`)
    : ok(`「動きを減らす」を両画面が見ていて、寄せる操作は受け口 1 つを通っている`);
}
