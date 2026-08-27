// 実描画 — 足元の区分と、⚠ 確かさの段（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 24 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 4 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **元は「建物 0 件を、取得中・取得失敗と混ぜない」という見出しの下にあった。**
//   ⚠ **その見出しが言っていたのは 3 つの状態のこと**で、⚠ **この 4 件はどれも別の話だった。**
//   ⚠ **3 状態の 3 件は `peel-era.mjs` に揃えた**（⚠ 同じ 24 本目で合流させた）。
//
// ⚠ **ここが守っているもの**:
//     範囲の外   ⚠ **資料の範囲外に、⚠ 陸の色を塗らない**（⚠ 塗ると「陸だった」に読める）
//     2 回言わない ⚠ **パネルも層で答え、⚠ 同じ数字を 2 回出さない**
//     順         ⚠ **土地の答えが、⚠ 確実性の高い順に出る**（ADR 0030）
//     出ない層   ⚠ **その層の位置に理由を出す。**⚠ **「無い」と言い切らない**
//
// ⚠ **`peel-layer.mjs` は「答えがどこに置かれるか」。**⚠ **こちらは「層の中身が何を言うか」。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, TOYOSU, SAPPORO, peelReady, settleAfterCondition, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **資料の範囲外を、分類の 1 行として出さない。**
    //   実測（2026-08-19, 375×667 札幌）: 内訳に「データなし 1364 / 1364」が 1 行だけ出て、
    //   `isWater("データなし")` が false なので**陸の色見本（#d8cfa8）**が付いていた。
    //   ⚠ 「明治期は陸だった建物が 1364 件」と読める。掟: データにない ≠ 現実にない。
    //   ⚠ **静的検査では捕まらない。**色見本が付くかは DOM を見ないと分からない。
    name: "資料の範囲外に、陸の色を塗らない", path: `/peel?${SAPPORO}`, group: "core",
    async check(page) {
      // 建物が出そろうまで待つ（件数が動いている途中を読まない）
      // ⚠ **札幌は足元を 1 件も判定できない**（⚠ 明治期の低湿地データが整備対象外）。
      //   ⚠ **層 3 は `missing` になるので、⚠ `#breakdown` は作られない**（2026-08-22 の作り替え）。
      //   ⚠ **主張は変えていない**: ⚠ **明治期の区分の行を出さない**／⚠ **件数は落とさない**／
      //     ⚠ **範囲の外だと言う**／⚠ **こちらの都合に読める言い方をしない**／⚠ **「無い」と言い切らない。**
      await page.waitForFunction(() => {
        const t = document.getElementById("landAll")?.textContent ?? "";
        return /建物/.test(t) && !/取得しています|取得中/.test(t);
      }, null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        // ⚠ **内訳に区分の行が生えていないこと**（⚠ 器ごと無いのが正）
        rows: [...document.querySelectorAll("#breakdown .stat")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim())
          .filter((t) => /旧水部|河川|干潟|茅|湿地|田/.test(t)),
        hint: (document.querySelector("#landAll .land-layer:last-child")?.innerText ?? "")
          .replace(/\s+/g, " ").trim(),
        all: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
      }));
      // ⚠ 分類の行が 1 本もないこと。1 本でもあれば「明治期は○○だった」と読める
      must(r.rows.length === 0,
        `資料の範囲外を分類の行にしている: ${r.rows.join(" / ")}`);
      // ⚠ 件数は落とさない。落とすと「建物が無い」に読める
      must(/\d{3,}/.test(r.hint), `件数を落としている: ${r.hint}`);
      // ⚠ **範囲の外であることを、⚠ 同じ画面で言っている**（⚠ 第2層が言う）
      must(/整備対象外|範囲の外|判定できていません/.test(r.all),
        `範囲の外であることを言っていない: ${r.all.slice(0, 120)}`);
      // ⚠ こちらの都合（読み込めない）に読める言い方をしない
      must(!/読み込め|取得中|取得できません/.test(r.hint),
        `範囲の外なのに、こちらの都合に読める言い方をしている: ${r.hint}`);
      // ⚠ 「無い」と言い切らない
      must(!/(建物|記録)(は|が)?(無い|ありません)/.test(r.hint), `無いと言い切っている: ${r.hint}`);
      return `内訳の分類行 0 本／「${r.hint.slice(0, 46)}」`;
    },
  },
  {
    // ⚠ **PC のパネルも層で答えること**（ADR 0030）。
    //   実測（2026-08-19）: HUD だけ層にしたとき、PC は古い形（heroNum / heroCap）のままで、
    //   ⚠ **豊洲で 99.6% が 2 回**出ていた。⚠ 利用者役 3/4 が指摘した。
    //   ⚠ **同じ問いに 2 つの答えを持たない**（ADR 0021）。
    // ⚠ **実効 opacity で見る。**`#panel.hide` は opacity:0 で display は残るので、
    //   checkVisibility() だけでは「見えている」と誤って読む（実測 2026-08-19 に踏んだ）。
    name: "パネルも層で答え、同じ数字を 2 回出さない", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#landAll .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const eff = (el) => { if (!el || !el.checkVisibility()) return 0;
          let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === "none" || s.visibility === "hidden") return 0;
            o *= Number(s.opacity); }
          return +o.toFixed(3); };
        const t = (id) => { const e = document.getElementById(id);
          return eff(e) > 0 ? (e.innerText ?? "") : ""; };
        return { seen: t("landAll"),
          // ⚠ **2026-08-21 に、⚠ 土地の答えはパネルの 1 か所だけになった**
          //   （hidetzu/konjaku#152）。⚠ 前は HUD（#land）からも集めていた。
          qs: [...document.querySelectorAll("#landAll .land-q")]
                .filter((e) => eff(e) > 0).map((e) => e.textContent.trim()),
          hero: document.querySelectorAll("#heroNum,#heroCap").length };
      });
      // ⚠ 古い入れ物が残っていないこと（残っていると、また 2 つの答えになる）
      const pc = await look();
      must(pc.hero === 0, `heroNum / heroCap が残っている: ${pc.hero} 個`);
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((pc.qs[0] ?? "") === WORDS.layerTitle(1),
        `PC で先頭が第1層でない: ${pc.qs.join(" / ")}`);
      must(pc.qs.length === 3, `PC のパネルに 3 層そろっていない: ${pc.qs.join(" / ")}`);
      must((pc.seen.match(/99\.6/g) || []).length === 1,
        `PC で 99.6% が ${(pc.seen.match(/99\.6/g) || []).length} 回出ている`);
      // ⚠ **狭い幅も対にして見る。**PC だけ直して、スマホを壊しても緑にならないように。
      //   ⚠ **読み込み直す。**パネルの開閉は**読み込み時の幅**で決まり、
      //     リサイズでは切り替わらない（peel3d.js の isNarrow は「あとで変えない」）。
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#landAll .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **2026-08-21 に、⚠ スマホでも層はパネルの 3 つ**（hidetzu/konjaku#152）。
      //   ⚠ 前は HUD が「第1層＋もう 1 つ」に絞って出していた。⚠ **HUD に答えを出さなくなった。**
      //   ⚠ **見ている主張は同じ**: ⚠ **同じ数字を 2 回出さない。**
      //   ⚠ パネルは閉じて始まるので、⚠ **開いてから読む。**
      await page.click("#toggle");
      await settleAfterClick(page);
      const sp = await look();
      must(sp.qs.length === 3, `スマホのパネルに 3 層そろっていない: ${sp.qs.join(" / ")}`);
      must((sp.seen.match(/99\.6/g) || []).length === 1,
        `スマホで 99.6% が ${(sp.seen.match(/99\.6/g) || []).length} 回出ている`);
      return `PC ${pc.qs.length} 層（${pc.qs.map((x) => x.slice(0, 6)).join("→")}）／`
        + `スマホ ${sp.qs.length} 層／99.6% はどちらも 1 回`;
    },
  },
  {
    // ⚠ **土地の答えが、確実性の高い順に出ること**（ADR 0030）。
    //   実測（2026-08-19・main = d7dce05）: 層という値が無かったので、4 地点とも順番が違った。
    //     豊洲 第3層→第2層（⚠ 第1層が無い） ／ 札幌・那覇 ⚠ 出せない断りから始まった。
    // ⚠ **2026-08-21 に、⚠ 出す先が HUD からパネルへ移った**（hidetzu/konjaku#152）。
    //   ⚠ 前は「⚠ HUD は第1層＋1 つに絞る」だった。⚠ 3 層とも出すと 375×667 で 320px になり、
    //     ⚠ 下端 y=382 が**調べている地点（画面中央 y=333）を覆った**ため。
    //   ⚠ **パネルは地図の上に重なる板ではない**ので、⚠ **絞る理由が無くなった。**
    //   ⚠ **順序の主張は変えていない**（⚠ 第1層 → 第2層 → 第3層）。
    name: "土地の答えが、確実性の高い順に出る", path: `/peel?${TOYOSU}`, group: "core",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      // ⚠ **答えが出そろってから読む。**建物と地形分類は別々に返るので、
      //   途中を読むと層が 1 つだけの瞬間を捕まえる（実測 2026-08-19: 2 回に 1 回落ちた）。
      await page.waitForFunction(() => (document.querySelectorAll("#landAll .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **パネルは閉じて始まる。**⚠ 開いてから読む（⚠ ☰ を 1 回）
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("landAll");
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          seen: el.checkVisibility(),
          nums: [...el.querySelectorAll(".land-num")].length,
          dens: [...el.querySelectorAll(".land-den")].length,
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      // ⚠ 第1層が先頭。ここが崩れると「できないことから書き始める」に戻る
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((r.qs[0] ?? "") === WORDS.layerTitle(1),
        `先頭が第1層でない: ${r.qs.join(" / ")}`);
      // ⚠ 内部の呼び名を出さない
      must(!/第[123]層/.test(r.txt), `内部の呼び名が画面に出ている: ${r.txt.slice(0, 60)}`);
      // ⚠ 数字を出すなら分母も出る（掟: 数字は主張範囲の分母で書く）
      must(r.nums === 0 || r.dens >= r.nums, `数字 ${r.nums} 個に対して分母が ${r.dens} 個`);
      // ⚠ **見えていること。**⚠ 見えていなければ、順序の主張も測れていない
      must(r.seen, "パネルの答えが見えていない（順序を測れていない）");
      // ⚠ **3 層とも出る**（⚠ 絞らない）。⚠ 順は第1層 → 第2層 → 第3層
      must(r.qs.length === 3, `3 層そろっていない: ${r.qs.join(" / ")}`);
      return `${r.qs.length} 層（${r.qs.join(" → ")}）`;
    },
  },
  {
    // ⚠ **出ない層を、黙って消さない**（ADR 0001）。
    //   ⚠ 札幌は明治期が範囲外・建物の足元が判定できない。**両方とも理由を出す**。
    //   ⚠ 実測（2026-08-19）: 最初は第2層と第3層が同じ文を返し、同じ行が 2 回並んだ。
    name: "出ない層も、その層の位置に理由を出す", path: `/peel?${SAPPORO}`, group: "core",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.querySelectorAll("#landAll .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **2026-08-21 に、⚠ 答えはパネルの 1 か所になった**（hidetzu/konjaku#152）。
      //   ⚠ **主張は同じ**: ⚠ 出ない層を黙って消さず、⚠ その層の位置に理由を出す。
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("landAll");
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          miss: [...el.querySelectorAll(".land-miss")].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((r.qs[0] ?? "") === WORDS.layerTitle(1),
        `先頭が第1層でない: ${r.qs.join(" / ")}`);
      must(r.miss.length === 2, `出ない層の理由が 2 つでない: ${r.miss.length} 個`);
      // ⚠ 同じ文を 2 回出さない
      must(new Set(r.miss.map((x) => x.split(" ")[0])).size === 2,
        `出ない層の理由が重複している: ${r.miss.join(" ／ ")}`);
      // ⚠ **ここに LIES を当てない。**LIES は「通信断・403 のときに言ってはいけない語」で、
      //   ⚠ **札幌は本当に 404（整備対象外）**。当てると、正しい説明のほうが落ちる
      //   （実測 2026-08-19: そう書いて落とした）。
      // ⚠ 見るのは「無い」と言い切っていないこと。
      for (const w of ["データが無い", "記録がありません", "残っていない", "存在しません"])
        must(!r.txt.includes(w), `出ない層を「無い」と言い切っている: 「${w}」`);
      return `第1層のみ立ち、出ない 2 層は理由つき（${r.miss.map((x) => x.slice(0, 20)).join(" ／ ")}）`;
    },
  },
];
