// 静的検査 — 土地の区分（⚠ **明治期のラスタを、⚠ どう読むか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 10 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**:
//     `swale.js` を動かす      ⚠ 14 区分・水域 2・許容差 60・面の集計と分母
//                              ⚠ **DOM も地図も持たないので、⚠ ここで全部の枝を回せる**
//     位置誤差の但し書き        ⚠ **原典どおり地域（関東・近畿）を書いているか**
//                              ⚠ 落とすと、⚠ **全国どこでも同じ誤差に読める**
//
// ⚠ **以前は同じ計算が 4 か所にあり、⚠ うち 3 か所だけを突き合わせていた**
//   （⚠ `build-water.js` は走査から漏れていた。2026-08-17）。
//   ⚠ **突き合わせるより 1 つにするほうが強いので寄せた。**
//   ⚠ **ここでは中身を動かして確かめる**（⚠ 字面ではなく、⚠ 判断そのもの）。
//
// ⚠ **`S.tally` は `KonjakuSwale` のもの**（⚠ `lib.mjs` の `tally` ではない）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PUB, ok, bad, head } from "./lib.mjs";

head("土地の区分");

// 明治期のラスタを読む計算は **public/swale.js の1か所**。
// ⚠ 以前は同じものが 4 か所にあり、**3 か所だけ**を機械で突き合わせていた
//   （build-water.js は走査から漏れていた。2026-08-17）。
//   突き合わせるより 1 つにするほうが強いので寄せた。ここでは**中身を動かして確かめる**。
{
  await import(`file://${join(PUB, "swale.js")}`);
  const S = globalThis.KonjakuSwale;
  const px = (...rows) => new Uint8ClampedArray(rows.flat());
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };

  if (!S) fails.push("swale.js を読み込めない（この検査が何も見ていない）");
  else {
    eq(S.SWALE.length, 14, "区分の数");
    eq(S.SWALE.filter((c) => c.water).length, 2, "水域の数");
    eq(S.TOLERANCE, 60, "許容差");
    // 凡例そのままの色は、その区分になる
    eq(S.classify(147, 200, 254)?.name, "河川・湖沼・海面", "凡例どおりの色");
    eq(S.classify(254, 227, 200)?.name, "砂礫地", "凡例どおりの色（陸）");
    // ⚠ 許容差の境目。ここが動くと、隣の区分に吸われたり全部 null に落ちたりする。
    //   ⚠ 境目は**孤立した色**で見る。隣の区分が近いところで測ると、
    //     許容差ではなく「どちらが近いか」を見てしまう（実際そう書いて 2 回外した）。
    //     堤防 (144,73,11) は 2 番目（泥炭地）まで 171 離れている。
    eq(S.classify(144 + 55, 73, 11)?.name, "堤防", "許容差の内側（距離 55）");
    eq(S.classify(144 + 70, 73, 11), null, "許容差の外側（距離 70）");
    eq(S.classify(0, 0, 0), null, "凡例から遠い色は null");
    // ⚠ **順番の検査。** まず「いちばん近い色」を選び、そのあとで許容差を見る。
    //   逆にすると、いちばん近い色が 60 より遠いときに 2 番目の色を答えてしまう。
    //   実際、寄せるときに逆に書いてしまい、ここで捕まえた（2026-08-17）。
    //   (181,200,254) は 河川(34.0) より 湿地(32.2) のほうが近い → 湿地 が正しい
    eq(S.classify(181, 200, 254)?.name, "湿地", "いちばん近い色を選ぶ");
    //   (110,140,150) はどの区分からも 60 より遠い → null（2番目を拾わない）
    eq(S.classify(110, 140, 150), null, "いちばん近い色が遠ければ null");
    // ⚠ **面の集計。** 分母は「区分に当てはまった画素」で、透明と凡例外は入れない
    const t = S.tally(px(
      [147, 200, 254, 255],   // 水
      [254, 227, 200, 255],   // 砂礫地
      [254, 227, 200, 255],   // 砂礫地
      [0, 0, 0, 0],           // 透明 → 分母から外す
      [0, 0, 0, 255],         // 凡例外 → 分母から外す
    ));
    eq(t.scanned, 5, "見た画素");
    eq(t.transparent, 1, "透明");
    eq(t.unmatched, 1, "凡例外");
    eq(t.classified, 3, "分母（区分に当てはまった画素）");
    eq(t.top?.name, "砂礫地", "いちばん多い区分");
    eq(Math.round(t.top.share * 1000) / 10, 66.7, "いちばん多い区分の割合(%)");
    eq(Math.round(t.waterShare * 1000) / 10, 33.3, "水域の割合(%)");
    // 分母 0 のときに落ちないこと（透明だけのタイル）
    const empty = S.tally(px([0, 0, 0, 0]));
    eq(empty.classified, 0, "透明だけのときの分母");
    eq(empty.top, null, "透明だけのときのいちばん多い区分");
    eq(empty.waterShare, 0, "透明だけのときの水域割合");
  }
  fails.length
    ? bad(`swale.js の単体テストが失敗（${fails.length} 件）: ${fails.join(" / ")}`)
    : ok(`swale.js を動かして確認（14 区分・水域 2・許容差 60・面の集計と分母）`);

  // ⚠ **区分の解説は、こちらで書かない。** 国土地理院の凡例（lw_legend.pdf）の解説文を
  //   要約せずそのまま持つ（掟3: 引用のときは出典を必ず添え、要約しない）。
  //   ⚠ 14 区分と**両方向で**突き合わせる。片方だけ増えても気づけるように。
  {
    const lp = join(PUB, "data", "swale-legend.json");
    if (!existsSync(lp)) bad("swale-legend.json が無い（区分の説明が画面から出せない）");
    else {
      const lg = JSON.parse(await readFile(lp, "utf8"));
      const names = S ? S.SWALE.map((c) => c.name) : [];
      const keys = Object.keys(lg.classes ?? {});
      const miss = names.filter((n) => !keys.includes(n));
      const extra = keys.filter((k) => !names.includes(k));
      const empty = keys.filter((k) => !lg.classes[k]?.text || !lg.classes[k]?.legendName);
      // ⚠ 出典が消えたら落とす。引用なのに出典が無い状態を作らない
      const noSrc = !lg.source || !lg.textSource || !lg.sourceLabel;
      miss.length || extra.length || empty.length || noSrc
        ? bad(`区分の説明が凡例と食い違っている（不足 ${miss.join("・") || "なし"} / `
            + `余分 ${extra.join("・") || "なし"} / 中身が空 ${empty.join("・") || "なし"}`
            + `${noSrc ? " / 出典が無い" : ""}）`)
        : ok(`区分の説明 ${keys.length} 件が 14 区分と一致し、出典（${lg.textSource}）を持つ`);
      // ⚠ 位置誤差の但し書きは、原典の**地域の限定**まで写していること。
      //   以前は地域を落として「原典は三角点整備前の資料のため位置誤差を含む」と、
      //   原典より広く言っていた（2026-08-17 に凡例を読んで気づいた）。
      /関東地区/.test(lg.caveat ?? "") && /近畿地区/.test(lg.caveat ?? "")
        ? ok("位置誤差の但し書きが、原典どおり地域（関東・近畿）を書いている")
        : bad("位置誤差の但し書きから、原典にある地域の限定（関東地区・近畿地区）が落ちている");
    }
  }
}
