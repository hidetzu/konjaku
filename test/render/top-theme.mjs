// 実描画 — 色み（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 32 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件を、⚠ 直上のコメントごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **2 件は対で見る**（⚠ **だから割らない**）:
//     切り替わる ⚠ **端末の設定が「明るい」とき、⚠ 画面が明るい色みになる**
//     解決される ⚠ **定義した値が、⚠ この画面で本当にその値になっている**
//
// ⚠ **静的検査は「明るい色みの定義がある」までしか言えない。**
//   ⚠ **`@media` の条件を書き間違えても、⚠ 読み込みを忘れても、⚠ 落ちない。**
//
// ⚠ **`/peel` の対になるケースは `test/render/peel-theme.mjs`。**
//   ⚠ **こちらは地図の上ではない**ので、⚠ **印が付いていないことまで見る。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { must, themeColors, sameColor, LIGHT_MQ } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **端末の設定が「明るい」とき、⚠ 画面が明るい色みになるか**（2026-08-26・hidetzu/konjaku#96）。
    //
    // ⚠ **静的検査は「明るい色みの定義がある」までしか言えない。**
    //   ⚠ `@media` の条件を書き間違えても、⚠ 読み込みを忘れても、⚠ **落ちない。**
    //
    // ⚠ **走者は既定で「暗い」に固定してある**（`test/render.mjs`）。
    //   ⚠ **ここだけ `colorScheme: "light"` にして、⚠ 端末の設定が明るい人を作る。**
    //
    // ⚠ **「明るい色みの値と一致する」だけでは足りない。**
    //   ⚠ **暗い色みと違うことまで見る**（⚠ 両方が同じ値なら、⚠ 何も切り替わっていなくても通る）。
    name: "端末の設定が明るいとき、この画面は明るい色みになる",
    path: "/", group: "core", colorScheme: "light",
    async check(page) {
      const theme = await themeColors();
      const dark = theme[":root"], light = theme[`${LIGHT_MQ} :root`];
      must(dark && light, "theme.css から色みを読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(light);
      must(names.length >= 8, `明るい色みの色が ${names.length} 個しかない（⚠ 読み方が壊れている）`);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { scheme: matchMedia("(prefers-color-scheme: light)").matches,
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.scheme, "⚠ ブラウザが「明るい」になっていない（⚠ この検査が暗い画面を測っている）");
      const wrong = names.filter((n) => !sameColor(got.vals[n], light[n]));
      must(!wrong.length, `明るい色みの値になっていない: `
        + wrong.map((n) => `${n}（期待 ${light[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      // ⚠ **本当に切り替わったか**（⚠ 暗い色みと違う色が、⚠ ちゃんと違っていること）
      const moved = names.filter((n) => !sameColor(dark[n], light[n]));
      must(moved.length >= 8, `暗い色みと違う色が ${moved.length} 個しかない（⚠ 切り替わっていない）`);
      for (const n of moved)
        must(!sameColor(got.vals[n], dark[n]), `${n} が暗い色みのまま（${got.vals[n].trim()}）`);
      return `明るい端末 ／ theme.css の ${names.length} 色と一致 ／ 暗い色みと違うのは ${moved.length} 色`
        + `（例 --bg ${got.vals["--bg"].trim()} ／ --ink ${got.vals["--ink"].trim()}）`;
    },
  },
  {
    // ⚠ **色みの定義が、⚠ この画面で本当にその値になっているか**（2026-08-26・hidetzu/konjaku#96）。
    //   ⚠ **理由と踏んだ話は `test/render/peel-theme.mjs` の対になるケースに全文がある**
    //     （⚠ 2026-08-27 に `peel.mjs` から出した。hidetzu/konjaku#277）。
    //   ⚠ **ここは地図の上ではない**ので、⚠ **印が付いていないこと**まで見る
    //     （⚠ 付いていると、⚠ トップの面が地図用の暗い半透明になる）。
    name: "この画面の色は、地の色みに解決されている", path: "/", group: "core",
    async check(page) {
      const theme = await themeColors();
      const base = theme[":root"];
      must(base, "theme.css から地の色みを読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(base);
      must(names.length >= 8, `theme.css の色が ${names.length} 個しかない（⚠ 読み方が壊れている）`);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { mark: document.documentElement.getAttribute("data-backdrop"),
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.mark === null, `トップに地図の上の印が付いている（${JSON.stringify(got.mark)}）`);
      const wrong = names.filter((n) => !sameColor(got.vals[n], base[n]));
      must(!wrong.length, `色が theme.css の値になっていない: `
        + wrong.map((n) => `${n}（期待 ${base[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      return `/ ／ 印なし ／ theme.css の ${names.length} 色と一致`
        + `（例 --bg ${got.vals["--bg"].trim()} ／ --ink ${got.vals["--ink"].trim()}）`;
    },
  },
];
