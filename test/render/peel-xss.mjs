// 実描画 — 外から来た文字列は、⚠ 実行されない（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 30 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **元ファイルで専用の見出しを持っていた 1 件**（`// ===== 外部から来た文字列 =====`）。
//
// ⚠ **ここが緑であることが、⚠ この不具合が戻っていないことの根拠。**
//   ⚠ **静的検査は「外部の受け皿を生で書いていないか」しか見られない**（⚠ 変数に写せば素通りする）。
//
// ⚠ **経路は 2 つとも「外から来た字が、⚠ そのまま画面に描かれる」ところ**:
//     地名     ⚠ **共有された URL の `?q=`**（⚠ 押させるだけで届く）
//     建物カード ⚠ **OSM のタグ（`building` / `start_date`）**
//
// ⚠ **検索候補の経路は 2026-08-18 に消えた**（`/peel` から検索を外した）。
//   ⚠ **消えた経路を見張り続けない。**⚠ **いま残っている経路を見る。**
//
// ⚠ **建物を取り込んでいない土地を使う。**⚠ **取り込み済みだと静的タイルで答えるので、
//   ⚠ Overpass の差し替えが効かない**（＝ ⚠ **何も確かめずに必ず通る検査になる**）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  XSS, notRun, shownAsText,
  peelReady, settleAfterCondition, must
} from "./lib.mjs";

export const CASES = [
  // ================= 外部から来た文字列 =================
  // ⚠ ここが緑であることが、この不具合が戻っていないことの根拠。
  //   静的検査は「外部の受け皿を生で書いていないか」しか見られない（変数に写せば素通りする）。
  {
    // ⚠ 建物を取り込んでいない土地を使う。取り込み済みだと静的タイルで答えるので、
    //   Overpass の差し替えが効かない（＝何も確かめずに必ず通る検査になる）
    // ⚠ 検索候補の経路は 2026-08-18 に消えた（/peel から検索を外した）。
    //   ⚠ **代わりに、いま残っている経路を見る。**地名は共有された URL の `?q=` から入り、
    //     画面に地名として描かれる。押させるだけで届くので、injection の経路としては同じ。
    name: "外部の文字列が、3D の地名と建物カードで実行されない",
    path: `/peel?ll=35.65360,139.90200&q=${encodeURIComponent(`千葉県浦安市${XSS}`)}`,
    setup: (page) => Promise.all([
      // 建物の種別（building）と建設年（start_date）は OSM のタグそのもの
      page.route((u) => /overpass/i.test(u.href), (r) => {
        const ring = (lon, lat, d) => [[lon - d, lat - d], [lon + d, lat - d],
          [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]
          .map(([x, y]) => ({ lat: y, lon: x }));
        r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ elements: [0, 1, 2].map((i) => ({
            type: "way", id: 100 + i,
            geometry: ring(139.9020 + (i - 1) * 0.0012, 35.6540, 0.00045),
            tags: { building: `yes${XSS}`, start_date: `1968${XSS}` },
          })) }) });
      }),
      // 静的タイルを迂回して、注入したOSMタグがカードに届く経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
    ]),
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ---- 建物カード（押した先）----
      const pt = await page.evaluate(() => {
        const cv = map.getCanvas();
        for (let y = 0.25; y < 0.8; y += 0.05)
          for (let x = 0.25; x < 0.8; x += 0.05) {
            const p = [Math.round(cv.clientWidth * x), Math.round(cv.clientHeight * y)];
            if (map.queryRenderedFeatures(p, { layers: ["bld"] }).length) return { x: p[0], y: p[1] };
          }
        return null;
      });
      must(pt, "建物が1棟も描かれていない（押す先が無い）");
      await page.mouse.click(pt.x, pt.y);
      // ⚠ **2026-08-21 に、⚠ 建物の中身は吹き出しの 1 か所だけになった**
      //   （⚠ パネルの `#pick` を消した）。⚠ **見ている主張は同じ**:
      //   ⚠ 外から来た文字列（OSM の名前・種別）が、⚠ **実行されず、字のまま出ること。**
      await page.waitForFunction(
        () => (document.querySelector(".pick-pop .maplibregl-popup-content")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, ".pick-pop", "建物の吹き出し");
      await shownAsText(page, ".pick-pop", "建物の吹き出しの種別と建設年");
      // ---- 共有された URL の地名（?q=）----
      // ⚠ パネルを開かないと出ない場所も見る。開かない人には見えないが、DOM には入る
      await page.evaluate(() => document.getElementById("panel")?.classList.remove("hide"));
      await notRun(page, "#placeName", "3D の地名");
      const t = await shownAsText(page, "#placeName", "3D の地名（共有された URL 由来）");
      return `建物カード・吹き出し・地名で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」`;
    },
  },
];
