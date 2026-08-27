// 実描画 — 動きを減らす（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 13 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 3 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **`prefers-reduced-motion` は、⚠ 入れた人にも入れていない人にも見る。**
//   ⚠ **入れた人に「動かない」だけを見ても足りない。**⚠ **入れていない人の動きが
//     ⚠ 消えていないこと**も見ないと、⚠ **全員から動きを奪ったことに気づけない。**
//
// ⚠ **ここが守っているもの**:
//     入れた人   ⚠ **深掘りの再生でカメラを振らない。**⚠ **画面の自前の動きも残らない**
//     それ以外   ⚠ **いままでどおりカメラが振れる**（⚠ 傾斜 +10°・向き 46°）
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, stubMapPictures, settleAfterCondition, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **深掘りの画面の再生で、カメラを振らない。**
    //   ⚠ CSS では止まらない（requestAnimationFrame + map.jumpTo の自前実装）。
    //   ⚠ **姿勢は MapLibre のコンパスの style から読む。**地図を外へ公開しない。
    //     実測（2026-08-19）: rotateX が pitch、末尾の rotateZ が -bearing。
    //   ⚠ **zoom は画面に出ていないので、ここでは測っていない**（経路は静的検査が見る）。
    // ⚠ **このケースの主題は「カメラが動かないこと」**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **外部から本当に取れるかは、⚠ ここでは見ていない。**
    // ⚠ **待ちは短くしない。**⚠ **「6 秒後」「15 秒後」に動いていないことが主張**なので、
    //   ⚠ **縮めると主張が弱まる**（⚠ 対の「振れる」側は、⚠ 止まるまで待つ形にできた）。
    // ⚠ **地図の絵だけ白で返す。**⚠ **外への本数だけ減らす。**
    name: "「動きを減らす」を入れると、深掘りの再生でカメラを振らない",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: async (page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      // ⚠ **白で塞いでいた**（hidetzu/konjaku#195）。⚠ **それは間違いだった**（2026-08-22 に気づいた）:
      //   ⚠ **画面は真っ白なタイルを「撮影範囲の外」と読む**ので、⚠ **その年代が段から消える。**
      //   ⚠ **豊洲の帯が 9 段 → 3 段になっていた**（⚠ 検査は落ちずに通っていた）。
      await stubMapPictures(page);
    },
    async check(page) {
      const cam = () => page.evaluate(() => {
        const st = document.querySelector(".maplibregl-ctrl-compass .maplibregl-ctrl-icon")
          ?.getAttribute("style") ?? "";
        const one = (re) => { const m = re.exec(st); return m ? Math.round(parseFloat(m[1]) * 10) / 10 : null; };
        return { pitch: one(/rotateX\(([-\d.]+)deg\)/), bearing: one(/rotateZ\(([-\d.]+)deg\);?\s*$/),
                 year: document.getElementById("rlYear")?.innerText.trim() ?? null };
      });
      await page.waitForFunction(() => document.getElementById("play")?.checkVisibility() === true,
        null, { timeout: 90000 });
      const a = await cam();
      // ⚠ 読めていないのに「動いていない」と言わない
      must(a.pitch !== null && a.bearing !== null,
        `コンパスから姿勢を読めない（この検査が何も見ていない）: ${JSON.stringify(a)}`);
      await page.click("#play");
      // ⚠ ここは短くしない。下で「6 秒後」の姿勢を主張している
      await page.waitForTimeout(6000);
      const b = await cam();
      await page.waitForTimeout(9000);
      const c = await cam();
      for (const [when, r] of [["6 秒後", b], ["15 秒後", c]]) {
        must(r.pitch === a.pitch, `${when} に傾斜が変わった: ${a.pitch}° → ${r.pitch}°`);
        must(r.bearing === a.bearing, `${when} に向きが変わった: ${a.bearing} → ${r.bearing}`);
      }
      // ⚠ **止めてはいない。**年代は最後まで送られること（押しても何も起きない状態にしない）
      must(b.year !== a.year, `年代が送られていない（${a.year} のまま）`);
      must(/明治/.test(c.year ?? ""), `最後まで送られていない: ${c.year}`);
      return `傾斜 ${a.pitch}° ／ 向き ${a.bearing} が動かず、年代は ${a.year} → ${b.year} → ${c.year}`;
    },
  },
  {
    // ⚠ **減らしていない人の見え方を変えない。**
    //   ⚠ これが無いと、**カメラを全員から止めてしまっても**上の検査は通る。
    // ⚠ **このケースの主題は「カメラが動くか」**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **外部から本当に取れるかは、⚠ ここでは見ていない**（それは別のケースが見る）。
    // ⚠ **実測（2026-08-22・`main` = `986d7a4`）**: このケースだけで
    //   ⚠ **外へ 1151 本 ／ 15.9 秒**。⚠ **9 段を送るあいだ、⚠ 段ごとに新しいタイルを取り続けていた。**
    // ⚠ **だから、⚠ 地図の絵だけ白で返す。**⚠ **傾斜・向き・年代の判定は 1 つも変えない。**
    //   ⚠ **fixture のファイルは置かない**（置くと「画素を読んで判定する」という主張が
    //     置いた画像に対する主張へ化ける）。⚠ **その場で組み立てる**（`photoPng`）。
    name: "「動きを減らす」でない人には、深掘りの再生でカメラが振れる",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: async (page) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // ⚠ **写真のタイルだけ**。⚠ 低湿地・標高・建物は生かす（⚠ 画面が成立しなくなる）
      // ⚠ **白で塞いでいた**（hidetzu/konjaku#195）。⚠ **同じ理由で、⚠ 写真のつもりの絵に変えた。**
      //   ⚠ **段が減ると、⚠ 再生そのものが短くなる**（⚠ 速くなった一因はこれだった）。
      await stubMapPictures(page);
    },
    async check(page) {
      const cam = () => page.evaluate(() => {
        const st = document.querySelector(".maplibregl-ctrl-compass .maplibregl-ctrl-icon")
          ?.getAttribute("style") ?? "";
        const one = (re) => { const m = re.exec(st); return m ? Math.round(parseFloat(m[1]) * 10) / 10 : null; };
        return { pitch: one(/rotateX\(([-\d.]+)deg\)/), bearing: one(/rotateZ\(([-\d.]+)deg\);?\s*$/),
                 year: document.getElementById("rlYear")?.innerText.trim() ?? null };
      });
      await page.waitForFunction(() => document.getElementById("play")?.checkVisibility() === true,
        null, { timeout: 90000 });
      const a = await cam();
      await page.click("#play");
      // ⚠ **15 秒の決め打ちをやめ、⚠ 「カメラが止まった」を待つ**（2026-08-22。hidetzu/konjaku#191）。
      //   ⚠ **待っていたのは「再生が終わること」**で、⚠ **15 秒はその見積もりでしかなかった。**
      //   ⚠ **主張は変えていない**（⚠ 下の 3 つはそのまま）。⚠ **待ち方だけ変えた。**
      // ⚠ **年代の到着では足りない**（⚠ 実測 2026-08-22）: 明治期に着いた時点で待つのをやめると、
      //   ⚠ **カメラがまだ動いており、向きが 41.5°（期待 46°）で落ちた。**
      //   ⚠ **年代とカメラは、⚠ 別々に動いている。**⚠ **止まったことを直接見る。**
      // ⚠ **上限は残す**（⚠ 終わらなければ、⚠ 待ったうえで落ちる）。
      await page.waitForFunction(() => {
        const st = document.querySelector(".maplibregl-ctrl-compass .maplibregl-ctrl-icon")
          ?.getAttribute("style") ?? "";
        const meiji = /明治/.test(document.getElementById("rlYear")?.innerText ?? "");
        const last = window.__camLast;
        window.__camLast = st;
        // ⚠ **明治期に着き、⚠ かつ 2 回続けてカメラの姿勢が同じ**
        return meiji && last === st && st !== "";
      }, null, { timeout: 30000, polling: 400 });
      const c = await cam();
      // ⚠ 実測（2026-08-19）: 終点は pitch +10°・bearing +46°（rotateZ は -bearing なので -46）
      must(c.pitch - a.pitch >= 9 && c.pitch - a.pitch <= 11,
        `傾斜の変化が +10° でない: ${a.pitch}° → ${c.pitch}°`);
      must(Math.abs((a.bearing - c.bearing) - 46) <= 2,
        `向きの変化が 46° でない: ${a.bearing} → ${c.bearing}`);
      must(/明治/.test(c.year ?? ""), `最後まで送られていない: ${c.year}`);
      return `傾斜 ${a.pitch}° → ${c.pitch}° ／ 向き ${a.bearing} → ${c.bearing}（いままでどおり）`;
    },
  },
  {
    // ⚠ /peel も見る。片方だけ入れても、もう片方は動いたまま
    name: "「動きを減らす」を入れると、深掘りの画面でも動きが残らない",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: (page) => page.emulateMedia({ reducedMotion: "reduce" }),
    async check(page) {
      await page.waitForFunction(() => document.querySelector("#map canvas") !== null,
        null, { timeout: 90000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const sec = (v) => v.split(",").map((x) => x.trim())
          .map((x) => x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x));
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          for (const [k, v] of [["transition", st.transitionDuration], ["animation", st.animationDuration]])
            for (const d of sec(v || "0s"))
              if (d > 0.01) out.push(`${k} ${d}s ${el.tagName.toLowerCase()}#${el.id}`);
        }
        return { slow: [...new Set(out)].slice(0, 6), n: out.length };
      });
      must(r.n === 0, `動きが残っている ${r.n} 件: ${r.slow.join(" / ")}`);
      return `深掘りの画面も 0 件`;
    },
  },
];
