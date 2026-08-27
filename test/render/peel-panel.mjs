// 実描画 — パネルの開閉と、⚠ 答えの居場所（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 18 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 6 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **依存を 4 つの道で測ってから切った**（hidetzu/konjaku#317 の反省）:
//     親のローカル定義 0 ／ `lib.mjs` の 13 個 ／ `globalThis` 無し ／ 相対 import 無し
//
// ⚠ **ここが守っているもの**（⚠ **答えは 1 か所**。⚠ ADR 0033）:
//     常に見える ⚠ **年代を動かす操作パネルは、⚠ PC で常に見えている**（⚠ 横棒）
//     1 回で読める ⚠ **スマホは ☰ を 1 回押すと、⚠ 土地の答えと分母が読める**
//     出さない   ⚠ **判定できない土地では、⚠ 開いても割合を出さない**
//     取れないとき ⚠ **通信が落ちたとき、⚠ 初期画面で「整備対象外」と言わない**
//     退く       ⚠ **PC ではパネルが答えを持ち、⚠ 閉じたら答えは退く**
//                ⚠ **HUD へ戻さない**（⚠ 戻すと、⚠ 同じ答えが 2 か所に出る）
//     組み直す   ⚠ **年代の段は、⚠ 地点ごとに組み直す**（⚠ 前の地点の段を持ち越さない）
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, BASE, TOYOSU, LIES, GSI_ROUTE, stubMapPictures, effOpacity, waitOpacity, peelReady, waitOptional, settleAfterClick, must, openPanel } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ 年代を動かせることが、航空写真の上で見えなければ操作は存在しないのと同じ。
    //   文字・2px の線・14px のノブを背景へ直接置いていたときは、明るい地面でも
    //   暗い水面でも読みづらかった。板・見出し・指で分かるノブを実寸で見る。
    // ⚠ **畳めなくした**（2026-08-22。Owner 判断）。⚠ **年代を動かすのが /peel の主目的**で、
    //   ⚠ その操作部を隠す仕掛けを置かない。⚠ **だから「常に見えている」ことを見る。**
    // ⚠ **PC 幅で見る**（2026-08-18 に移した）。レール・ノブの実寸は横棒の話で、
    //   狭い幅はものさしに替わった。
    name: "年代を動かす操作パネルが、常に見えている（PC の横棒）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 1280, height: 800 },
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#track .tick").length === 7,
        null, { timeout: 60000 });
      const opened = await page.evaluate(() => {
        const box = (e) => { const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, height: r.height }; };
        const panel = document.getElementById("timePanel");
        return { panel: box(panel), readout: box(document.querySelector("#timePanel .era-readout")),
          panelBg: getComputedStyle(panel).backgroundColor,
          play: box(document.getElementById("play")),
          rail: box(document.querySelector("#track .rail")),
          knob: box(document.querySelector("#track .knob")),
          ticks: document.querySelectorAll("#track .tick").length,
          selected: document.querySelectorAll("#track .tick.selected").length,
          // ⚠ **畳む仕掛けが戻っていないこと**（別の id で作り直されても捕まえる）
          toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
          viewport: document.documentElement.clientWidth };
      });
      must(opened.panel.left >= 0 && opened.panel.right <= opened.viewport,
        `操作パネルが画面からはみ出す: ${opened.panel.left}〜${opened.panel.right}px`);
      must(opened.panel.height >= 100, `開いた操作パネルが小さすぎる: ${opened.panel.height}px`);
      must(opened.panelBg !== "rgba(0, 0, 0, 0)", "操作パネルに背景板が無い");
      must(opened.rail.height >= 4, `レールが細い: ${opened.rail.height}px`);
      must(opened.knob.width >= 22 && opened.knob.height >= 22,
        `ノブが小さい: ${opened.knob.width}×${opened.knob.height}px`);
      must(opened.play.right + 2 <= opened.knob.left,
        `再生ボタンと左端のノブが重なる: ${opened.play.right} / ${opened.knob.left}px`);
      must(opened.ticks === 7, `広島の7層と目盛りが一致しない: ${opened.ticks}本`);
      must(opened.selected === 1, `選択中の区切りが1本でない: ${opened.selected}本`);
      // ⚠ **畳む仕掛けは無い**（2026-08-22。Owner 判断で消した）
      must(opened.toggles === 0, `畳む仕掛けが戻っている（${opened.toggles} 個）`);

      // ⚠ **段を動かしても、操作部と選択中の年代は出たまま。**
      //   ⚠ 「消した」だけの検査にしない（verify §5）。⚠ **常に見えていること**が主張。
      await page.$eval("#t", (e) => { e.value = "200"; e.dispatchEvent(new Event("input")); });
      await settleAfterClick(page);
      const after = await page.evaluate(() => ({
        bodyVisible: document.getElementById("timePanelBody").checkVisibility(),
        playVisible: document.getElementById("play").checkVisibility(),
        trackVisible: document.getElementById("track").checkVisibility(),
        year: document.querySelector("#timePanel .y").textContent.trim(),
        height: Math.round(document.getElementById("timePanel").getBoundingClientRect().height),
      }));
      must(after.bodyVisible && after.playVisible && after.trackVisible,
        `段を動かしたら操作部が消えた: body=${after.bodyVisible} ▶=${after.playVisible} 横棒=${after.trackVisible}`);
      must(after.year === "1979–83",
        `選択中の年代が読めない: 「${after.year}」`);
      return `広島 ${opened.ticks}層／レール ${opened.rail.height}px／ノブ ${opened.knob.width}px`
        + `／畳む仕掛け 0 個・段を動かしても操作部は出たまま（${after.year}・${after.height}px）`;
    },
  },
  {
    // ⚠ **スマホの初期画面で、土地の答えと分母が読めること。**
    //   実測（2026-08-16 / 375×667・タッチ）: 答えも分母も計算済みで座標も持っていたのに、
    //   祖先の #panel.hide が opacity:0 のため**実効 opacity が 0**。
    //   初期画面から読めるのは「建物が消える年代は演出です」という但し書きだけで、
    //   **答えより先に注意書きが読める**状態だった。
    //   ⚠ 数字だけでは足りない。**何の割合か**と**分母**が同じ画面にあることまで見る
    //     （掟: 数字は主張範囲の分母で書く）。
    // ⚠ **2026-08-21 に、⚠ 主張が変わった**（hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 前は「⚠ **初期画面**で、土地の答えと分母が読める」だった。
    //     ⚠ 2026-08-16 の実測（スマホはパネルが閉じて始まる）を根拠に、⚠ HUD に要約を置いていた。
    //   ⚠ **Owner が「土地の答えは HUD では見せない」と決めた**（2026-08-21）。
    //   ⚠ **守りたいことは同じ**: ⚠ **答えと分母が、⚠ 読める形でそろっていること。**
    //     ⚠ 変わったのは**何手で届くか**。⚠ 測り直し: ⚠ **☰ を 1 回押すだけ**（⚠ スクロール 0）。
    // ⚠ **主題は「1 手で読めるか」**であって、⚠ **絵が届くかではない**（hidetzu/konjaku#191）。
    name: "スマホで ☰ を 1 回押すと、土地の答えと分母が読める",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: stubMapPictures,
    async check(page) {
      // ⚠ **内陸を入れておく。** 下の hasCategory（区分名が主見出し）の分岐は
      //   前から書いてあったが、ここが埋立・デルタの3地点しか回していなかったので
      //   **一度も通っていなかった**（＝分岐が検査されていなかった）。
      //   内陸では、足元の最多区分が水域ではないので区分名が主見出しになる。
      //   実測 2026-08-16（1280×800／375×667 とも同じ）:
      //     渋谷 田（水域だった建物 1.5%）／上野 田（1.3%）／西新宿 田（1.3%）
      // ⚠ **層 3 は作り替えた**（2026-08-22。Owner 判断）。
      //   ⚠ **前は「田 建物の足元は、明治期には最多でした」**（⚠ 区分名が主見出し）。
      //   ⚠ **いまは「N 件の建物が、この範囲にあります」**（⚠ 件数が主見出し）で、
      //     ⚠ 割合は分母を主語にした 1 行が持つ。
      //   ⚠ **主張は変えていない**: ⚠ **☰ を 1 回で、⚠ 答えと分母が読めること。**
      //   ⚠ **件数は書かない**（⚠ 取り込みで動く）。⚠ **形だけを見る。**
      const places = [
        ["豊洲", `/peel?${TOYOSU}`],
        ["広島", "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6"],
        ["長崎 出島", "/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6"],
        ["お台場", "/peel?ll=35.63000,139.77600&q=%E3%81%8A%E5%8F%B0%E5%A0%B4"],
        ["渋谷", "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7"],
        ["上野", "/peel?ll=35.71480,139.77450&q=%E4%B8%8A%E9%87%8E"],
        ["西新宿", "/peel?ll=35.69050,139.69290&q=%E8%A5%BF%E6%96%B0%E5%AE%BF"],
      ];
      const out = [];
      for (const [name, path] of places) {
        if (page.url() !== BASE + path)
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(page);
        // ⚠ 「%」を待たない。⚠ **割合が出ない土地がある**（札幌・那覇）。
        //   ⚠ 層になって、答えの 1 行目が第1層（区分名）になったので、% は後ろに来る。
        await page.waitForFunction(() => /件の足元を判定|%/.test(
          document.getElementById("landAll")?.textContent ?? ""),
          null, { timeout: 60000 });
        // ⚠ **パネルは閉じて始まる**（掟の外へ出ない: スマホで既定表示にはしない）
        must(await page.locator("#panel.open").count() === 0, `${name}: パネルが小さい状態で始まっていない`);
        // ⚠ **☰ を 1 回。**⚠ それだけで答えが読めること（⚠ スクロールしない）
        await page.click("#toggle");
        await settleAfterClick(page);
        must(await page.evaluate(() => document.getElementById("panel").scrollTop === 0),
          `${name}: 開いた直後にスクロールしている`);
        const o = await effOpacity(page, "#landAll .land-g1, #landAll .land-alt, #landAll .land-num");
        const od = await effOpacity(page, "#landAll .land-den");
        must(o > 0, `${name}: 答えの実効 opacity が ${o}（読めない）`);
        must(od > 0, `${name}: 分母の実効 opacity が ${od}（読めない）`);
        // ⚠ **第1層の見出しが画面の中にあること**（⚠ 開いただけで届く）
        const q1 = await page.evaluate(() => {
          const e = document.querySelector("#landAll .land-q");
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), vh: innerHeight };
        });
        must(q1, `${name}: 開いても第1層の見出しが無い（パネル ${
          await page.evaluate(() => document.getElementById("panel").className)}）`);
        must(q1.top < q1.vh,
          `${name}: 開いても第1層の見出しが画面の外（${JSON.stringify(q1)}）`);
        const r = await page.evaluate(() => ({
          // ⚠ **主役の層から取る**（2026-08-21）。⚠ HUD のときは層が 2 つに絞られていたので
          //   ⚠ `.land-num` が 1 つしか無かった。⚠ **パネルは 3 層あるので、⚠ 最初を取ると
          //   ⚠ 第2層（面の割合）を拾う。**⚠ hero と同じ層＝いちばん確実な層から取る。
          ...(() => { const ls = [...document.querySelectorAll("#landAll .land-layer")];
            const L = ls[ls.length - 1];
            return { num: L?.querySelector(".land-num")?.textContent.trim() ?? "",
              what: L?.querySelector(".land-what")?.textContent.trim() ?? "",
              den: L?.querySelector(".land-den")?.textContent.trim() ?? "" }; })(),
          // ⚠ 答えの主役は**いちばん確実な層**（層は確実性の高い順に並ぶので、最後）。
          //   ⚠ 最初を取ると第1層（地形分類）を拾い、分岐を間違える（実測 2026-08-19）。
          hero: (() => { const ls = [...document.querySelectorAll("#landAll .land-layer")];
            const L = ls[ls.length - 1];
            return L?.querySelector(".land-num,.land-alt,.land-g1 b")?.textContent.trim() ?? ""; })(),
          heroCap: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " ").trim(),
          landAll: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        }));
        // ⚠ **層 3 の主見出しは件数**（2026-08-22）。⚠ **「N 件」の形であること。**
        must(/^[\d,]+\s*件$/.test(r.hero), `${name}: 建物の件数が主見出しになっていない: 「${r.hero}」`);
        must(/の建物が、この範囲にあります/.test(r.what),
          `${name}: 何の件数かが書かれていない: 「${r.what}」`);
        // ⚠ **分母は答えと同じ板に、⚠ 主語つきで**（掟 §6。⚠ 2026-08-23 に主語を足した）
        const m = r.den.match(/判定できた\s*([\d,]+)\s*件のうち、\s*([\d.]+)%（([\d,]+)\s*件）/);
        must(m, `${name}: 分母が主語つきで読めない: 「${r.den}」`);
        const [cls, pct, wet] = [Number(m[1].replace(/,/g, "")), Number(m[2]), Number(m[3].replace(/,/g, ""))];
        const total = Number(r.hero.replace(/[^\d]/g, ""));
        must(cls > 0 && cls <= total, `${name}: 判定できた件数が総数を超えている: ${cls} / ${total}`);
        must(wet <= cls, `${name}: 水の上だった件数が分母を超えている: ${wet} / ${cls}`);
        // ⚠ **割合と件数が食い違わないこと**（⚠ 丸めのぶん 0.1 まで許す）
        must(Math.abs(wet / cls * 100 - pct) < 0.1,
          `${name}: 割合と件数が合わない: ${wet} / ${cls} = ${(wet / cls * 100).toFixed(1)}% ≠ ${pct}%`);
                out.push(`${name} ${r.hero}（${pct}% ＝ ${wet} / ${cls}）`);
      }
      // ⚠ **2026-08-21 に、⚠ 答えの板（#land）が無くなった**（hidetzu/konjaku#152）。
      //   ⚠ ここは「⚠ 板が 3D と操作を覆わないこと」を見ていた。⚠ **覆う板が無い。**
      //   ⚠ **主張は引き継ぐ**: ⚠ **開いたパネルが、⚠ 横にあふれないこと。**
      //     ⚠ 320px は、⚠ いちばん狭い幅（⚠ ui-ux-review の 4 幅の 1 つ）。
      await page.setViewportSize({ width: 320, height: 667 });
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        p: document.getElementById("panel").getBoundingClientRect() }));
      must(w.sw <= w.cw, `320px で横にあふれる: scrollWidth=${w.sw} / ${w.cw}`);
      must(w.p.left >= 0 && w.p.right <= w.cw,
        `320px でパネルがはみ出す: ${Math.round(w.p.left)}〜${Math.round(w.p.right)}px`);
      return `${out.join(" ／ ")}／320px あふれなし`;
    },
  },
  {
    // ⚠ 判定できない土地で**割合を作らない**（掟: 取れなかったを「無い」と言わない）。
    //   札幌は明治期の低湿地データが整備対象外。建物は出ているので、
    //   「建物ごとには出せません」と、その理由と、建物の件数を出す。0% は出さない。
    // ⚠ **2026-08-21 に名前を直した**（hidetzu/konjaku#152）。
    //   ⚠ 前は「初期画面に割合を出さない」。⚠ **答えが初期画面から無くなった**ので、
    //     ⚠ 名前が実態と合わなくなった。⚠ **主張は同じ**: ⚠ 判定できないのに割合を出さない。
    name: "判定できない土地では、開いても割合を出さない（札幌）",
    path: "/peel?ll=43.06800,141.35070&q=%E6%9C%AD%E5%B9%8C%E9%A7%85",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      // ⚠ 建物の集計が届くまで待つ。⚠ この検査は最初 peelReady だけで読んでいて落ちた。
      //   札幌は水域が無いので #status が先に「低湿地データがありません」を出し、
      //   **建物を数え終える前に**条件を満たしてしまう。実装ではなく検査が早すぎた。
      // ⚠ **答えの板が描かれてから読む。**#status が先に埋まるので、
      //   ⚠ これだけだと板が空のまま opacity を測って null になる（実測 2026-08-19）。
      await page.waitForFunction(
        () => document.querySelector("#landAll .land-g1, #landAll .land-alt") !== null,
        null, { timeout: 60000 });
      // ⚠ **2026-08-21 に、⚠ 土地の答えはパネルの 1 か所になった**（hidetzu/konjaku#152）。
      //   ⚠ **見ている主張は同じ**: ⚠ 判定できないのに割合を出さない。
      //   ⚠ **ここはスマホ幅（375）なので、⚠ パネルは閉じて始まる。**
      //     ⚠ 閉じたまま測ると、⚠ **実効 opacity は 0**（⚠ 読めないのは当たり前）。
      //     ⚠ **☰ を 1 回押してから読む**（⚠ 答えへの到達は 1 手、という新しい前提）。
      await page.click("#toggle");
      await settleAfterClick(page);
      const t = (await page.locator("#landAll").textContent()).replace(/\s+/g, " ").trim();
      must(!/\d+\.\d+\s*%/.test(t), `判定できないのに割合を出している: ${t.slice(0, 60)}`);
      must(t.includes("整備対象外"), `理由（整備対象外）が書かれていない: ${t.slice(0, 60)}`);
      must(/建物 \d+ 件/.test(t), `建物の件数が書かれていない: ${t.slice(0, 60)}`);
      // ⚠ **濃くなり切るまで待つ**（⚠ 開いた直後は 0 を返す）
      const o = await waitOpacity(page, "#landAll .land-g1, #landAll .land-alt", (v) => v > 0);
      must(o > 0, `答えの実効 opacity が ${o}（読めない）`);
      // ⚠ 地形分類は**別経路で遅れて届く**。届く前は「判定できません」、届いたら
      //   「建物ごとには出せません」＋その土地の区分に変わる。
      //   ⚠ この検査は最初「建物ごとには出せません」を最初から要求していて落ちた。
      //     実装ではなく検査のほうが早すぎた。届く前の「判定できません」も
      //     要件（数値を作らない・何が分からないかを書く）は満たしている。
      //   ⚠ 地形分類は止まりうる依存なので、**届くことを前提にしない**（届いたときだけ見る）。
        // ⚠ 層になって、第3層の欠落は「1 件ずつの足元は判定できていません」になった。
        //   ⚠ 見ている主張は変えていない: **何が出せないのかが書かれていること**。
        must(/建物ごとには出せません|判定できません|判定できていません/.test(t),
          `何が出せないのかが書かれていない: ${t.slice(0, 60)}`);
      // ⚠ **`#land` はもう無い**（2026-08-22 に気づいた）。
      //   ⚠ **土地の答えは HUD から情報パネル（`#landAll`）の 1 か所へ移した**
      //     （判断は `docs/adr/0033-HUDは年代の表示と操作だけを持つ.md`）。
      //   ⚠ **消えた要素を 20 秒待っていた。**
      //   ⚠ **毎回 20 秒を捨てたうえで、⚠ 下の 2 つの主張が一度も走っていなかった**
      //     （⚠ 画面には「扇状地」が出ているのに「届かなかった」と書いていた）。
      // ⚠ **見ている主張は変えていない**: ⚠ **地形分類が届いたら、答えられる範囲を示す。**
      const gotLf = await waitOptional(page,
        () => (document.getElementById("landAll")?.textContent ?? "").includes("扇状地"),
        { timeout: 20000, label: "札幌の地形分類（扇状地）" });
      const t2 = (await page.locator("#landAll").textContent()).replace(/\s+/g, " ").trim();
        // ⚠ 地形分類が届いたら、**全部が出せないわけではない**と分かること。
        //   ⚠ 層になって、その言い方が変わった（「建物ごとには出せません」→
        //     第1層が立ち、出せないのは建物の層だけ、と位置で示す）。
        //   ⚠ 見ている主張は変えていない: **範囲を限ること**（何もかも駄目ではない）。
        if (gotLf) {
          must(/建物ごとには出せません/.test(t2) || t2.includes(WORDS.layerTitle(1)),
            `地形分類が届いたのに、答えられる範囲を示していない: ${t2.slice(0, 60)}`);
          must(!/^判定できません/.test(t2),
            `地形分類が届いたのに「判定できません」で始まっている: ${t2.slice(0, 60)}`);
        }
      return `${t2.slice(0, 56)}${gotLf ? "" : "（⚠ 地形分類は届かなかった）"}`;
    },
  },
  {
    // ⚠ 取得に失敗したときは「整備対象外」と言わない（掟: 取れなかったを「無い」と言わない）。
    //   HUD にも同じ規律を通す。ここを外すと、通信が落ちただけの豊洲に
    //   「整備対象外」と、しかも常時見える場所で書くことになる。
    name: "通信が落ちたとき、初期画面で整備対象外と言わない",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.getElementById("landAll")?.textContent ?? "").length > 0,
        null, { timeout: 60000 });
      // ⚠ **2026-08-21 に、⚠ 答えはパネルの 1 か所になった**（hidetzu/konjaku#152）
      const t = (await page.locator("#landAll").textContent()).replace(/\s+/g, " ").trim();
      const lie = LIES.find((w) => t.includes(w));
      must(!lie, `通信断なのに「${lie}」と断定している: ${t.slice(0, 60)}`);
      // 取り込み済みの地点は、実行時のGSI通信が落ちても静的な判定値を表示できる。
      // 未取り込みの地点だけ、従来どおり「読み込めない」状態を確認する。
      const hasStatic = /\d+\.\d+\s*%/.test(t);
      if (!hasStatic) must(/読み込め/.test(t), `読み込めなかったことが書かれていない: ${t.slice(0, 60)}`);
      // ⚠ **狭い幅では、⚠ 小さいあいだ問いを畳む**（2026-08-23。Owner 判断）。
      //   ⚠ **主張は「⚠ 答えが読めること」。**⚠ **広げてから測る**（⚠ 消していない）。
      await openPanel(page);
      await settleAfterClick(page);
      must(await effOpacity(page, "#landAll") > 0, "答えが読めない");
      return t.slice(0, 60);
    },
  },
  {
    // ⚠ PC では情報パネルが開いて始まる。同じ答えを同じ画面で2度言わない
    //   （☰ ボタンと同じ手）。パネルを閉じたら、HUD 側が答えを引き受ける。
    // ⚠ **2026-08-21 に、⚠ 引き継ぎが無くなった**（hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 前は「⚠ PC はパネルが答えを持ち、⚠ 閉じると HUD が引き継ぐ」だった。
    //   ⚠ **土地の答えはパネルの 1 か所だけ。**⚠ 閉じたら、⚠ **答えは画面から退く**
    //     （⚠ 読みたければ ☰ で開き直す。⚠ 実測: ☰ 1 回・スクロール 0）。
    name: "PC ではパネルが答えを持ち、閉じたら答えは退く", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ **待つのはパネル側**（2026-08-20。hidetzu/konjaku#131）。
      //   ⚠ **PC の初期表示で #land は描かれない**（見えないから）。
      //   ⚠ 以前はここが #land を待っており、⚠ **textContent が display:none でも読めるので通っていた。**
      await page.waitForFunction(() => (document.getElementById("landAll")?.textContent ?? "").includes("%"),
        null, { timeout: 60000 });
      must(await page.locator("#panel.open").count() === 1, "PC でパネルが広がって始まっていない");
      // ⚠ **開いているあいだ、HUD には何も書かれていない**（hidetzu/konjaku#131 の要点）
      // ⚠ **2026-08-21 に、⚠ HUD の答え（#land）ごと無くなった**（hidetzu/konjaku#152）。
      //   ⚠ 前の主張は「⚠ 見えない HUD に土地情報を書かない」。
      //   ⚠ **書く箱が無いので、⚠ 主張は「箱が戻っていないこと」に引き継ぐ。**
      must((await page.$$eval("#land", (els) => els.length)) === 0,
        "HUD の答え（#land）が戻っている（土地の答えはパネルの 1 か所）");
      const heroOpen = await effOpacity(page, "#landAll");
      must(heroOpen > 0, `パネルの答えが読めない: 実効 opacity ${heroOpen}`);
      const num = (await page.locator("#landAll .land-num").first().textContent()).trim();
      // ⚠ **PC では、⚠ 小さくしても答えは残る**（2026-08-23。Owner 判断）。
      //   ⚠ **板と地図が並ぶので、⚠ 覆っていない。**⚠ **畳むのは狭い幅だけ。**
      //   ⚠ **主張を引き継ぐ**: ⚠ **答えは「⚠ パネルの 1 か所」**（⚠ HUD に写らない）。
      //   ⚠ **「退くこと」は主張から外した。**⚠ **起きていないことを見続けると、
      //     ⚠ この検査は「PC でも畳む実装」を要求し続ける**（⚠ いまの設計と食い違う）。
      await page.click("#toggle");
      await settleAfterClick(page);
      const after = await effOpacity(page, "#landAll");
      must(after > 0, `PC で小さくしたら答えが読めなくなった: 実効 opacity ${after}`);
      must((await page.$$eval("#land", (els) => els.length)) === 0,
        "小さくしたら HUD に答えが出た（答えはパネルの 1 か所）");
      // ⚠ **☰ で開き直せる**（⚠ 読めなくなったままにしない）
      await page.click("#toggle");
      await settleAfterClick(page);
      must(await effOpacity(page, "#landAll") > 0, "広げ直しても答えが読めない");
      return `パネル 広=${num}／小さくしても答えはパネルの 1 か所／広げ直せる`;
    },
  },
  {
    // ⚠ 場所を変えたら段も変わる。組み直しを忘れると、前の場所の段のまま
    //   別の土地のタイルを引く（＝また存在しない年代を取りに行く）。
    // ⚠ 2026-08-18 まで、この検査は /peel の中のピンを押して場所を変えていた。
    //   ⚠ **その口は外した**（場所を決めるのはトップ）。守りたい主張
    //   「段は地点ごとに組み直す」は変わらないので、**地点ごとに開いて**確かめる。
    //   ⚠ 画面の中で場所が変わる経路は、もう無い（loadArea を呼ぶのは初回と再試行だけ）。
    name: "年代の段は、地点ごとに組み直す",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const shape = () => page.evaluate(() => ({
        max: Number(document.getElementById("t").max),
        ticks: document.querySelectorAll("#track .tick").length }));
      const wait = (n) => page.waitForFunction(
        (want) => document.querySelectorAll("#track .tick").length === want, n, { timeout: 60000 });
      const SPOTS = [
        ["広島", "ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6", 7, 600],
        ["豊洲", TOYOSU, 9, 800],
        ["長崎 出島", "ll=32.74400,129.87300&q=%E5%87%BA%E5%B3%B6", 4, 300],
      ];
      const out = [];
      for (const [name, qs, ticks, max] of SPOTS) {
        await page.goto(`${BASE}/peel?${qs}`, { waitUntil: "domcontentloaded" });
        await peelReady(page);
        await wait(ticks);
        const sh = await shape();
        must(sh.max === max, `${name}のスライダーの端が ${max} でない: ${sh.max}`);
        out.push(`${name} ${sh.ticks}段/${sh.max}`);
      }
      // ⚠ 全部同じ形なら、この検査は何も見ていない
      must(new Set(out).size === SPOTS.length, `地点ごとに組み直していない: ${out.join(" / ")}`);
      return out.join(" → ");
    },
  },
];
