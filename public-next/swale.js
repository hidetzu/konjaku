// 明治期の低湿地データ（ラスタ）を読む、ただ1つの場所。
//
// なぜ要るか（2026-08-17 に実測）:
//   同じ 14 区分表と同じ分類の計算が **4 か所**に散っていた。
//     public/verify.js        点の判定（トップの判定文・バッジ）
//     public/peel3d.js        建物の足元の判定（/peel）
//     scripts/swale-sample.mjs 手元のサンプリング
//     build-water.js          面の集計と、水域の二値マスク → GeoJSON
//   ⚠ しかも `scripts/check.mjs` が突き合わせていたのは **3 か所だけ**で、
//     build-water.js は走査対象から漏れていた（`.js` の一覧に入っていなかった）。
//   掟6「同じ問いに答える実装を2つ持たない。やむを得ず持つときは機械で突き合わせる」。
//   突き合わせるより、**1 つにするほうが強い**。
//
// ⚠ **ここは「読む」だけ。** 何を画面に出すか（点で言うか、面で言うか、どう名乗るか）は
//   ここでは決めない。決めると、また画面ごとに枝が生える。
//
// 環境:
//   ブラウザ  <script src="./swale.js"></script> → globalThis.KonjakuSwale
//   Node      await import("../public/swale.js") → globalThis.KonjakuSwale
//   ⚠ esc.js と同じ作法（副作用で globalThis に生やす）。ESM の export にすると
//     ブラウザ側が module 読み込みになり、既存の <script> の順番が壊れる。
(function (g) {
  "use strict";

  // 明治期の低湿地の 14 区分。配色は凡例 lw_legend.pdf から抽出したもの。
  // https://cyberjapandata.gsi.go.jp/legend/lw_legend.pdf
  // ⚠ **水域は 2 つだけ**（干潟・砂浜 / 河川・湖沼・海面）。残り 12 は水ではない。
  //   「水域を重ねる」と名乗っていたのは、見せているものより狭い名前だった（2026-08-17 に直した）。
  const SWALE = [
    { rgb: [254, 227, 200], name: "砂礫地" },
    { rgb: [254, 200, 200], name: "泥地" },
    { rgb: [228, 172, 123], name: "泥炭地" },
    { rgb: [200, 200, 228], name: "湿地" },
    { rgb: [209, 234, 255], name: "干潟・砂浜", water: true },
    { rgb: [147, 200, 254], name: "河川・湖沼・海面", water: true },
    { rgb: [251, 247, 176], name: "田" },
    { rgb: [225, 227, 118], name: "深田" },
    { rgb: [227, 227, 200], name: "塩田" },
    { rgb: [162, 222, 162], name: "草地" },
    { rgb: [173, 200, 147], name: "荒地" },
    { rgb: [119, 227, 201], name: "ヨシ" },
    { rgb: [173, 255, 173], name: "茅" },
    { rgb: [144, 73, 11], name: "堤防" },
  ];

  // 色の許容差。配信されるタイルは PNG だが、拡大・縮小や合成で数の上では少しずれる。
  // ⚠ この値を上げると、隣の区分に吸われる。下げると、ほとんどが「区分なし」に落ちる。
  //   ⚠ **3 実装で同じ値を使っていた**ので、ここに 1 つだけ置く。
  const TOLERANCE = 60;

  // 1 画素 → 区分。当てはまらなければ null（＝この画素は 14 区分のどれでもない）。
  // ⚠ 透明（a < 8）は「区分が無い」であって「水ではない」ではない。呼ぶ側で分けること。
  // ⚠ **順番が意味を持つ。** まず「いちばん近い色」を選び、**そのあとで**許容差を見る。
  //   逆にして「許容差の内側でいちばん近い色」にすると、
  //   *いちばん近い色が 60 より遠いとき*に、2 番目の色を答えてしまう。
  //   元の 4 実装はすべて前者だった。寄せるときに後者へ書き換えていて、
  //   単体テストが捕まえた（2026-08-17）。**判定の中核なので、意味は変えない。**
  function classify(r, g, b) {
    let best = null, bd = Infinity;
    for (const c of SWALE) {
      const d = (c.rgb[0] - r) ** 2 + (c.rgb[1] - g) ** 2 + (c.rgb[2] - b) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return Math.sqrt(bd) <= TOLERANCE ? best : null;
  }

  // 面で数える。RGBA の連なり（ImageData.data と同じ並び）を渡すと、
  // 区分ごとの画素数と割合を返す。
  //
  // ⚠ **分母を返り値に必ず入れる**（掟4: 数字は必ず主張範囲の分母で書く）。
  //   呼ぶ側が「85.8%」だけ取り出して、何に対する 85.8% か分からなくなるのを防ぐ。
  // ⚠ 透明な画素は分母から外す。タイルの外や、塗られていない場所を
  //   「区分が無い土地」として数えると、割合が薄まる。
  //   ⚠ ただし**外した数も返す**。黙って減らさない。
  function tally(rgba) {
    const counts = new Map();
    let scanned = 0, transparent = 0, unmatched = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      scanned++;
      if (rgba[i + 3] < 8) { transparent++; continue; }
      const c = classify(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (!c) { unmatched++; continue; }
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    }
    // 分母は「区分に当てはまった画素」。透明も凡例外も入れない
    const classified = scanned - transparent - unmatched;
    const byName = [...counts.entries()]
      .map(([name, n]) => ({
        name, n,
        share: classified ? n / classified : 0,
        water: !!isWater(name),
      }))
      .sort((a, b) => b.n - a.n);
    return {
      byName,
      top: byName[0] ?? null,
      water: byName.filter((x) => x.water).reduce((a, x) => a + x.n, 0),
      waterShare: classified
        ? byName.filter((x) => x.water).reduce((a, x) => a + x.n, 0) / classified : 0,
      // ⚠ 分母と、外したものの内訳。呼ぶ側はこれを添えて書く
      classified, scanned, transparent, unmatched,
    };
  }

  // 区分の名前から「水域だったか」を引く、ただ 1 か所。
  // ⚠ 呼ぶ側が `SWALE.find(c => c.name === x)?.water` を書き写さない。
  //   実測（2026-08-18）: 同じ式が peel3d.js に 3 か所・ここに 1 か所あった。
  //   ⚠ 表そのものを書き写すより見つけにくい（式なので grep しても目に留まらない）。
  // ⚠ 知らない名前は false ではなく **undefined**。「水ではない」と「知らない」は別。
  const isWater = (name) => SWALE.find((c) => c.name === name)?.water;

  g.KonjakuSwale = { SWALE, TOLERANCE, classify, tally, isWater };
})(typeof globalThis !== "undefined" ? globalThis : this);
