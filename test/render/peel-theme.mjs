// 実描画 — 色み（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 19 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **この 2 件は、⚠ 色みの作業が足したもの**（hidetzu/konjaku#289 ／ hidetzu/konjaku#304）。
//   ⚠ **切り出す前に、⚠ その作業と重なっていないかを測った**:
//     ⚠ **開いている PR 0 件。**⚠ **どちらも merge 済み。**⚠ **進行中の変更なし。**
//
// ⚠ **ここが守っているもの**:
//     端末の設定 ⚠ **「明るい」なら、⚠ 明るい色みで出す**（⚠ 選ぶ操作は後回し。ADR 0040）
//     1 か所     ⚠ **画面の色が、⚠ `theme.css` の色みに解決されている**
//                ⚠ **地図の上は上書きがある**（⚠ その分も突き合わせる）
//
// ⚠ **色の値は `public/css/theme.css` にしか書かない**（`.claude/rules/css.md`）。
//   ⚠ **2 か所に持つと、⚠ 色みを足したとき片方だけ切り替わる。**⚠ **ここがその突き合わせ。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, peelReady, must, themeColors, sameColor, LIGHT_MQ } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **端末の設定が「明るい」とき、⚠ 地図の上の色みになるか**（2026-08-26・hidetzu/konjaku#96）。
    //   ⚠ **理由と作りは `test/render/top.mjs` の同じ名前のケースに全文がある。**
    //   ⚠ **ここは地図の上**なので、⚠ **明るい色みの上書きが当たること**まで見る。
    name: "端末の設定が明るいとき、この画面は明るい色みになる",
    path: `/peel?${TOYOSU}`, group: "core", colorScheme: "light",
    async check(page) {
      await peelReady(page);
      const here = await page.evaluate(() => location.pathname);
      must(here === "/peel", `/peel に居ない（${here}）。⚠ この検査が別の画面を測っている`);
      const theme = await themeColors();
      const light = theme[`${LIGHT_MQ} :root`];
      const lightMap = theme[`${LIGHT_MQ} :root[data-backdrop="map"]`];
      const darkMap = theme[':root[data-backdrop="map"]'];
      must(light && lightMap && darkMap, "theme.css から色みを読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(light);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { scheme: matchMedia("(prefers-color-scheme: light)").matches,
                 mark: document.documentElement.getAttribute("data-backdrop"),
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.scheme, "⚠ ブラウザが「明るい」になっていない（⚠ この検査が暗い画面を測っている）");
      must(got.mark === "map", `<html> に地図の上の印が無い（${JSON.stringify(got.mark)}）`);
      const wrong = names.filter((n) => !sameColor(got.vals[n], lightMap[n] ?? light[n]));
      must(!wrong.length, `明るい色みの値になっていない: `
        + wrong.map((n) => `${n}（期待 ${lightMap[n] ?? light[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      // ⚠ **地図の上の上書きが、⚠ 暗いほうのままになっていないこと**
      for (const n of Object.keys(lightMap))
        must(!sameColor(got.vals[n], darkMap[n]), `${n} が暗い色みの上書きのまま（${got.vals[n].trim()}）`);
      return `明るい端末 ／ /peel ／ 印 map ／ theme.css の ${names.length} 色と一致`
        + `（地図の上の上書き ${Object.keys(lightMap).length} 色。例 --surface ${got.vals["--surface"].trim()}）`;
    },
  },
  {
    // ⚠ **色みの定義が、⚠ この画面で本当にその値になっているか**（2026-08-26・hidetzu/konjaku#96）。
    //
    // ⚠ **静的検査（`test/check/color.mjs`）は「定義がある」までしか言えない。**
    //   ⚠ **段の順で負けても、⚠ 印を付け忘れても、⚠ 読み込みを忘れても、⚠ 落ちない。**
    //
    // ⚠ **実際に踏んだ**（2026-08-26。⚠ **色を集めた当日**）:
    //   ⚠ 手元で確かめようとして `/peel` を場所なしで開いたら、⚠ **トップへ飛ばされていた。**
    //   ⚠ **測っていたのはトップの色。**⚠ **`/peel` の色だと思い込んで 5 個の差を報告しかけた。**
    //   ⚠ **だから、⚠ ここでは「いま `/peel` に居ること」から確かめる。**
    //
    // ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**（`CLAUDE.md` §9）:
    //   ⚠ **`public/css/theme.css` に書いてある値** × ⚠ **ブラウザが解決した値。**
    //   ⚠ **検査に色の値を書き写さない**（⚠ 写すと 2 か所になって、片方だけ古くなる）。
    //
    // ⚠ **`/peel` は地図の上**なので、⚠ **地の色みではなく `[data-backdrop="map"]` が当たる。**
    //   ⚠ **上書きしていない色**（出どころの 3 色など）は、⚠ **地の色みから降りてくること**も見る。
    name: "この画面の色は、地図の上の色みに解決されている", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      await peelReady(page);
      // ⚠ **まず、⚠ いま `/peel` に居ること**（⚠ 飛ばされていたら、⚠ 別の画面を測っている）
      const here = await page.evaluate(() => location.pathname);
      must(here === "/peel", `/peel に居ない（${here}）。⚠ この検査が別の画面を測っている`);
      const theme = await themeColors();
      const base = theme[":root"], map = theme[':root[data-backdrop="map"]'];
      must(base && map, "theme.css から色みの節を読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(base);
      must(names.length >= 8, `theme.css の色が ${names.length} 個しかない（⚠ 読み方が壊れている）`);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { mark: document.documentElement.getAttribute("data-backdrop"),
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.mark === "map", `<html> に地図の上の印が無い（${JSON.stringify(got.mark)}）`);
      // ⚠ 上書きがあるものは上書きの値、⚠ 無いものは地の色みの値になること
      const wrong = names.filter((n) => !sameColor(got.vals[n], map[n] ?? base[n]));
      must(!wrong.length, `色が theme.css の値になっていない: `
        + wrong.map((n) => `${n}（期待 ${map[n] ?? base[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      // ⚠ **上書きが本当に効いていること**（⚠ 上書きが 1 つも効いていなくても、上の判定は通りうる
      //   ⚠ ＝ 地の色みと同じ値を書いていた場合）。⚠ **地と違う値であることまで見る。**
      const overridden = Object.keys(map).filter((n) => !sameColor(map[n], base[n]));
      must(overridden.length >= 4,
        `地図の上で上書きしている色が ${overridden.length} 個しかない（⚠ 上書きが消えている）`);
      return `/peel ／ 印 map ／ theme.css の ${names.length} 色と一致`
        + `（うち地図の上で上書き ${overridden.length} 色。例 --surface ${got.vals["--surface"].trim()}）`;
    },
  },
];
