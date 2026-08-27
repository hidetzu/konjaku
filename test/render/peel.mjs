// 深掘り（`/peel`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=peel`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  YUMENOSHIMA, KIYOSUMI, UENO, NIIGATA, URAYASU, openGroups,
  suggestionsOf, rowsOf, groupsOf, WEB_SEARCH, WD, wdItem,
  WD_SHIBUYA, stubWikidata, XSS, notRun, shownAsText, photoFrames,
  waitStrip, LIES, RE_ESC, G1_MARK, G1_HEAD, VERDICT_SENTENCE,
  pngOf, photoPng, ERA_TILE_IDS, timelineSettled, stepLabels, peelReady,
  settleAfterCondition, waited, settleAfterClick, settleAfterScroll, LFC_ROUTE, DEM_ROUTE,
  must, provText
} from "./lib.mjs";
// ⚠ **取れなかったを「無い」と言わないは `peel-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277 の 12 本目。⚠ **`peel.mjs` を割る 1 本目**）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as UNREACH_CASES } from "./peel-unreachable.mjs";
// ⚠ **動きを減らすは `peel-motion.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as MOTION_CASES } from "./peel-motion.mjs";
// ⚠ **さかのぼる（再生）は `peel-play.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **6 件の連続 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
import { CASES as PLAY_CASES } from "./peel-play.mjs";
// ⚠ **部品を単体で動かすは `peel-component.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as COMPONENT_CASES } from "./peel-component.mjs";
// ⚠ **3D で建物を押す・戻るは `peel-building.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 9 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as BUILDING_CASES } from "./peel-building.mjs";
// ⚠ **見えて、届いて、戻れるは `peel-reach.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as REACH_CASES } from "./peel-reach.mjs";
// ⚠ **パネルの開閉と答えの居場所は `peel-panel.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 6 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as PANEL_CASES } from "./peel-panel.mjs";
// ⚠ **色みは `peel-theme.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as THEME_CASES } from "./peel-theme.mjs";
// ⚠ **答えの置き場と確かさの段は `peel-layer.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as LAYER_CASES } from "./peel-layer.mjs";
// ⚠ **建物の取得と年代の段は `peel-era.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 9 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as ERA_CASES } from "./peel-era.mjs";
// ⚠ **古い結果で、いまの画面を上書きしないは `peel-fresh.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 4 件をそのままの並びで運んだ。**
import { CASES as FRESH_CASES } from "./peel-fresh.mjs";
// ⚠ **狭い幅の器と建物を待つあいだは `peel-fold.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as FOLD_CASES } from "./peel-fold.mjs";


export const CASES = [
  ...THEME_CASES,
  ...LAYER_CASES,
  ...PLAY_CASES,
  ...REACH_CASES,
  ...UNREACH_CASES,
  ...FRESH_CASES,
  ...FOLD_CASES,
  // ---- 建物 0 件を、取得中・取得失敗と混ぜない ----
  // ⚠ 正常に 0 件と確認できた状態が、同じ画面で「取得中」とも「欠落」とも見えていた。
  //   直したのは表示だけではなく取得側で、`[]`（正常に 0 件）と `null`（取れていない）を
  //   分けたこと。**3 つの状態を、それぞれ別の経路で再現して**確かめる。
  {
    name: "取り込み済みで 0 件なら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    // 索引はそのまま（＝「この区画は見た」）にして、中身だけ 0 件のタイルに差し替える。
    // ⚠ **詰めた形（v=3）で返す。** 形が違うと読む側が捨てて Overpass へ落ちるので、
    //   この検査は何も確かめないまま緑になる（実際に v=2 で試して確認した）。
    setup: (page) => page.route("**/data/bl/14/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ v: 3, tile: [0, 0], at: "2026-08-16", q: 100000,
        o: [0, 0], k: [], n: [null], m: [null], b: [] }),
    })),
    async check(page, reqs) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みで 0 件と分かっているのに、Overpass へ出ている");
      // ⚠ ここには「別の事前生成データ（豊洲だけの GeoJSON）で上書きしない」を
      //   見る行があった。⚠ **2026-08-20 にその落ち先ごと消えたので、
      //   ここに残しても何も主張していない**（掟: 検証していないことを確認済みと呼ばない）。
      //   ⚠ **主張は消していない。**「土地ごとの例外が生えていないこと」は
      //   check.mjs の「3.5. 土地ごとの例外を作っていない」が見ている。
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      for (const [where, t] of [["問い", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/取り込み済みの建物データで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `Overpass 0 本／台帳「取り込み済みの建物データで建物 0 件」`;
    },
  },
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
  ...MOTION_CASES,
  ...ERA_CASES,
  ...COMPONENT_CASES,

  ...PANEL_CASES,
  ...BUILDING_CASES,
  // ⚠ ここに「同じ応答なら、トップと 3D の候補が一致する」があった（2026-08-18 に外した）。
  //   守っていたのは「検索の実装が 2 つあって、片方だけ直る事故」。
  //   ⚠ **並びを突き合わせるのをやめたのではない。**/peel から検索そのものを外したので、
  //     検索は 1 つになった。⚠ 「2 つ持っていない」ことは scripts/check.mjs が静的に見る
  //     （peel 側に検索の実装が生えたら落ちる）。画面側は上の
  //     「3D に場所を探す口は無く…」が見る。
  // ⚠ **画面が別のことを始めたときも、古い候補が出ない。**
  //   打つたびに切るだけでは足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのままクイック地点を選ぶと、行動一覧（立体で見る等）が出たあと、
  //   **2.5 秒後に「東京都渋谷区」で上書きされた**。
  //   ⚠ 入力欄は setMode() が空にするので `oninput` は発火せず、そこの cancel() には届かない。
  {
    // ⚠ 上と対になる、/peel 側。**まだ用意していない場所で「混雑」のせいにしない。**
    //   ⚠ Overpass は止めて測る。止めないと、返ってきた回はこの主張を確かめられない
    //     （名古屋は実測で 8 秒・5,845 件が返ったことがある。**必ず失敗はしない**）。
    name: "まだ用意していない場所で、通信のせいにしない",
    path: "/peel?ll=35.17090,136.88160&q=%E5%90%8D%E5%8F%A4%E5%B1%8B",
    setup: (page) => page.route((u) => /overpass/i.test(u.href), (r) => r.abort()),
    async check(page) {
      // ⚠ **「まだ提供していません」は問いの側が言う**（2026-08-22。⚠ `#status` ではない）。
      //   ⚠ **`textContent` で読む**（⚠ 狭い幅では畳まれている）。
      await page.waitForFunction(
        () => /まだ提供していません|取得できませんでした/.test(
          document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 90000 });
      await settleAfterCondition(page);
      const t = await page.evaluate(() => ({
        // ⚠ **答えも断りも `#landAll` が持つ**（2026-08-22。⚠ `#status` はもう喋らない）。
        //   ⚠ **`textContent` で読む**（⚠ 狭い幅では畳まれている。⚠ 主張は「字があること」）。
        status: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
        land: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
        // ⚠ 台帳はパネルの中。閉じていても DOM には入る
        prov: [...document.querySelectorAll("#panel .prov-q")]
          .map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim(),
      }));
      must(/まだ提供していません/.test(t.status),
        `まだ対応していない、と言っていない: ${t.status.slice(0, 110)}`);
      // ⚠ 相手のせいにしない。一度も取り込んでいない場所で「混雑」は事実に反する
      must(!/混雑/.test(t.status), `対応していないだけなのに、相手の混雑のせいにしている: ${t.status.slice(0, 110)}`);
      // ⚠ **進行形を使わない。**「取得中」「届いていない」は、利用者役 3/3 がそろって
      //   **自分の通信の話**として読んだ（いま動いている感じが出るため）。
      //   ⚠ **台帳まで見る。** 実際に破れていた: 上の文が「まだ用意できていません」と
      //     言っているのに、台帳だけ「未取得 建物データを**取得中**／まだ**届いていない**
      //     だけで」のまま残っていた（fail の分岐で render() を呼んでいなかった）。
      const wet = `${t.status} ${t.land} ${t.prov}`;
      const ng = ["取得中", "届いていない", "取れなかった"].filter((w) => wet.includes(w));
      must(!ng.length,
        `対応していないだけなのに、通信の言い方をしている: 「${ng.join("・")}」／台帳「${t.prov.slice(0, 90)}」`);
      // ⚠ **言い切る。**「毎回まず電波を疑う人間には、この一言がいちばん効く」（利用者役）
      must(/通信の問題ではありません/.test(wet),
        `通信のせいではない、と言い切っていない: ${wet.slice(0, 140)}`);
      // ⚠ 「無い」と言わない。現地に建物が無いという意味ではない
      must(/現地に建物が無いという意味でもありません|現地に建物が無いという意味でもない/.test(wet),
        `「対応していない」を「無い」と読まれないよう断っていない: ${wet.slice(0, 160)}`);
      // ⚠ 台帳が、上の文と同じことを言っていること（同じ画面で主語を食い違わせない）
      // ⚠ **札（未対応）は消した**（2026-08-22。Owner 判断: ⚠ 色で伝わる）。
      //   ⚠ **主張は「⚠ こちらがまだ提供していない、と字で言うこと」**（掟 §4-1）。
      must(/まだ提供していません/.test(t.prov),
        `台帳が「まだ提供していない」と言っていない: ${t.prov.slice(0, 120)}`);
      // ⚠ 建物が出なくても、この画面は成立している（実測: 空中写真・年代・区分の内訳）
      must(/明治期/.test(t.land), `建物が無いだけで、答えの板まで空になっている: ${t.land.slice(0, 90)}`);
      return `${t.status.slice(0, 46)}… ／ 台帳「${t.prov.slice(-52)}」`;
    },
  },
  // ⚠ **別の語へ変えたときも、古い候補が出ない。**
  //   「入力を消したとき」だけ切っていては足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのまま「新宿」へ変えると、デバウンスの 320〜350ms のあいだに
  //   古い応答が届き、**入力欄は「新宿」なのに「東京都渋谷区」が並ぶ**。
  //   ⚠ その候補を押せば**違う場所へ飛ぶ**。数え方の問題ではなく、行き先の問題。
  //   ⚠ 新しい検索が始まるのはデバウンスのあとなので、run() の中で世代を進めるだけでは
  //   間に合わない。**入力の瞬間に cancel() する**必要がある。
  // ⚠ 3D の側は 2026-08-18 に外した（あちらから検索そのものを外したため）。
  //   ⚠ **組の形は残す。** 検索を持つ画面が増えたら、ここへ足せば同じ穴を両方で見られる。
  {
    // ⚠ 豊洲だけを見ても、他の9つのピンが通る証明にはならない。
    //   取り込んだだけの土地で1つ通す。広島を選んだのは、東京以外だから。
    //   ⚠ 以前は「豊洲だけが専用の bbox を持つから」も理由だった（2026-08-20 に解消）。
    //     ⚠ **それでも、この検査は残す。**豊洲は 3D のピンの 1 つでしかない。
    name: "取り込んだだけの土地でも、3D が静的で成り立つ",
    path: "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page, reqs) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      const tiles = reqs.filter((u) => /\/data\/bl\/14\//.test(u));
      must(tiles.length > 0, "建物タイルを読んでいない");
      // 詰めた形を読めていること。戻せていなければ建物は1つも建たない
      // ⚠ **建物の総数は、⚠ 3 つ目の問いの答えが持つ**（2026-08-22 以降。⚠ `#status` ではない）。
      //   ⚠ **見ている主張は同じ**（⚠ 建物が実際に建っていること）。
      const n = Number((t.match(/([\d,]+)\s*件\s*の建物が、この範囲にあります/) ?? [])[1]?.replace(/,/g, ""));
      must(n > 0, `建物が1件も建っていない（詰めた形を戻せていない）: ${t.slice(0, 200)}`);
      // ⚠ **場所が「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ いつ取り込んだ結果かが画面にあること）。
      // ⚠ **由来の行は「詳しく見る」の中**（2026-08-22。⚠ 畳んである）。
      //   ⚠ **`innerText` には出ない。**⚠ **`textContent` で読む**（⚠ 主張は同じ）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(
        (await page.locator("#landAll").textContent()).replace(/\s+/g, " ")),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      return `Overpass 0 件／タイル ${tiles.length} 枚／${n.toLocaleString()} 件を判定`;
    },
  },
  {
    // ⚠ **土地の答えは、⚠ 情報パネルの 1 か所だけ**（2026-08-21。hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 「土地の答えはここ（HUD）では見せない」。
    //   ⚠ **層の中身と順序は変えていない**（ADR 0030）。⚠ 変えたのは**置き場所**だけ。
    //
    // ⚠ **この決定が覆した前提**（⚠ 消さずに残す）:
    //   ⚠ `#land` は 2026-08-16 の実測を根拠に置かれた
    //     （⚠ スマホはパネルが閉じて始まるので、⚠ ここに無いと初期画面から答えが読めない）。
    //   ⚠ **測り直し**（Issue・375×667 / 320×640・豊洲と渋谷）:
    //     ⚠ **☰ を 1 回押すだけで、⚠ 第1層が画面内**（⚠ スクロール 0）。
    name: "土地の答えは、初期画面に出ず、☰ 1 回で読める", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      const out = [];
      for (const [w, h, t] of [[375, 667, true], [320, 640, true], [1280, 800, false]]) {
        for (const [nm, q] of [["豊洲", TOYOSU], ["渋谷", "ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7"]]) {
          const ctx = await page.context().browser().newContext({
            viewport: { width: w, height: h }, hasTouch: t, serviceWorkers: "block" });
          try {
            const p2 = await ctx.newPage();
            await p2.goto(`${BASE}/peel?${q}`, { waitUntil: "domcontentloaded", timeout: 45000 });
            await peelReady(p2);
            await p2.waitForFunction(
              () => (document.getElementById("landAll")?.textContent ?? "").includes("この土地は"),
              null, { timeout: 60000 });
            await settleAfterCondition(p2);
            // ⚠ AC1: `#land` が DOM に無い（⚠ 空要素でも残さない）
            must(await p2.$$eval("#land", (els) => els.length) === 0,
              `${nm} ${w}px: #land が DOM に残っている`);
            const shut = await p2.evaluate(() => ({
              hide: !document.getElementById("panel").classList.contains("open"),
              // ⚠ **実効 opacity まで見る**（⚠ 閉じたパネルは textContent が読める）
              txt: (() => { const seen = [];
                for (const e of document.querySelectorAll("body *")) {
                  if (!e.checkVisibility?.()) continue;
                  let o = 1;
                  for (let n = e; n && n !== document.documentElement; n = n.parentElement)
                    o *= Number(getComputedStyle(n).opacity);
                  if (o > 0.05 && e.children.length === 0) seen.push(e.textContent ?? "");
                }
                return seen.join(" ").replace(/\s+/g, " "); })(),
            }));
            // ⚠ **開閉の既定は幅で決まる**（⚠ 狭い＝閉じる ／ PC＝開く）。
            //   ⚠ ここを見ないと、⚠ **PC でも閉じて始まる不具合が通る**
            //     （⚠ ☰ を押して開くので、⚠ 下の AC3 は満たしてしまう。2026-08-21 に踏んだ）。
            must(shut.hide === (w < 1100),
              `${nm} ${w}px: パネルの初期状態が幅と合っていない（閉=${shut.hide}）`);
            if (shut.hide) {
              // ⚠ AC2: 閉じた初期画面に、⚠ 土地の答えの字が 0 か所
              for (const word of [WORDS.layerTitle(1), WORDS.layerTitle(3),
                                  "件の足元を判定"])
                must(!shut.txt.includes(word),
                  `${nm} ${w}px: 閉じた初期画面に土地の答えが出ている（「${word}」）`);
            }
            // ⚠ AC3: ☰ 1 回で、⚠ スクロール 0 のまま第1層が画面内
            if (shut.hide) { await p2.click("#toggle"); await settleAfterClick(p2); }
            const open = await p2.evaluate(() => {
              const e = document.querySelector("#landAll .land-q");
              const r = e?.getBoundingClientRect();
              return { top: r ? Math.round(r.top) : null, vh: innerHeight,
                scroll: document.getElementById("panel").scrollTop,
                // ⚠ AC4: 描く先は 1 つ（⚠ パネル）
                qs: document.querySelectorAll("#landAll .land-q").length };
            });
            must(open.top !== null, `${nm} ${w}px: 開いても第1層の見出しが無い`);
            must(open.scroll === 0, `${nm} ${w}px: 開いた直後にスクロールしている（${open.scroll}）`);
            must(open.top < open.vh,
              `${nm} ${w}px: 開いても第1層が画面の外（y${open.top} / 画面 ${open.vh}）`);
            out.push(`${nm} ${w}px y${open.top}`);
          } finally { await ctx.close(); }
        }
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ **「開いて増えた層に印」は、⚠ 2026-08-21 に消えた**（hidetzu/konjaku#152）。
    //   ⚠ hidetzu/konjaku#150 で足したもの。⚠ **HUD の要約を先に読んでいることが前提**だった。
    //     ⚠ 実測（2026-08-21）: ⚠ 要約（第1層＋第3層・72 字）を読んでからパネルを開くと、
    //       ⚠ **同じ層をもう一度読む**。⚠ 利用者役 4/4 が気づき、⚠ 困るかは 2/2 に割れた。
    //     ⚠ そこで「⚠ 増えた層（第2層）だけに区切りと余白の印」を付けた。
    //   ⚠ **Owner 判断（2026-08-21）で HUD の要約そのものが無くなった**ので、
    //     ⚠ **「増えた」と言える前提が消えた。**⚠ 残すと嘘になる。
    //   ⚠ **引き継ぐ主張**: ⚠ **土地の答えは 1 か所だけ**（⚠ 二度読みが起きない）。
    //     ⚠ それは「PC でパネルを閉じても、HUD に答えが戻らない」などが見ている。
    //   ⚠ **印そのものが戻っていないこと**は、ここで見る。
    name: "開いて増えた層の印は、もう付かない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(
        () => (document.getElementById("landAll")?.textContent ?? "").includes("この土地は"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => ({
        added: document.querySelectorAll(".land-added").length,
        layers: [...document.querySelectorAll("#landAll .land-layer .land-q")]
          .map((e) => e.textContent.trim()),
        land: document.querySelectorAll("#land").length,
      }));
      must(r.land === 0, "HUD の要約（#land）が戻っている");
      must(r.added === 0,
        `「増えた層」の印が付いている（要約が無いので「増えた」と言えない）: ${r.added} 個`);
      must(r.layers.length === 3, `層が 3 つ出ていない: ${r.layers.join(" / ")}`);
      return `印 0 個／層 ${r.layers.length}（${r.layers.map((x) => x.slice(0, 5)).join("→")}）`;
    },
  },
  // ⚠ **小さくしているあいだ、⚠ 断りは残し、⚠ 操作の案内だけ畳む**（2026-08-23。Owner 判断）。
  //   ⚠ **断りを畳むと、⚠ 3D で建物が消えるのを見ている人に「推定です」が届かない**（掟 §1・§4-1）。
  //   ⚠ **狭い幅だけ。**⚠ **PC は板と地図が並ぶので覆っていない。**⚠ **PC で畳むと、
  //     ⚠ PC には ? が無いので出す手段が無くなる**（⚠ 実際にそうなった。特異度で負けていた）。
  {
    name: "小さくしても断りは出ている（畳むのは操作の案内だけ・狭い幅）",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll('#notes li[data-kind="caveat"]').length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => ({
        open: document.getElementById("panel").classList.contains("open"),
        caveats: [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
          .map((e) => e.checkVisibility()),
        tips: [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.checkVisibility()),
        help: (() => { const h = document.getElementById("noteHelp");
          const r = h.getBoundingClientRect();
          return { on: h.checkVisibility(), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      }));
      const mini = await look();
      must(!mini.open, "小さい状態で始まっていない（この検査が別の状態を見ている）");
      must(mini.caveats.length > 0, "断りが 1 行も無い（この検査が何も見ていない）");
      must(mini.caveats.every(Boolean),
        `小さくしたら断りが消えた（推定を実測のように見せている。掟 §1）: ${mini.caveats.join()}`);
      if (mini.tips.length) {
        must(!mini.tips.some(Boolean), "小さいのに操作の案内が出ている（畳む対象）");
        // ⚠ **畳んだなら、⚠ 出す手段がある**（ADR 0026 の裏。⚠ 消したのではない）
        must(mini.help.on, "案内を畳んだのに ? が出ていない（出す手段が無い）");
        must(mini.help.w >= 44 && mini.help.h >= 44,
          `? が 44×44 を割っている: ${mini.help.w}×${mini.help.h}`);
        await page.click("#noteHelp");
        await settleAfterClick(page);
        const opened = await look();
        must(opened.tips.every(Boolean), "? を押しても案内が出ない（押しても何も起きない）");
      }
      return `断り ${mini.caveats.length} 行は出たまま／案内 ${mini.tips.length} 行は ? の中`;
    },
  },
  // ⚠ **PC では畳まない**（2026-08-23）。⚠ **PC に ? は無い**ので、⚠ 畳むと戻せない。
  {
    name: "PC では、小さくしても操作の案内が消えない",
    path: `/peel?${TOYOSU}`, viewport: { width: 1280, height: 950 },
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll("#notes li").length > 0, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **PC は広げた状態で始まる。**⚠ 1 回押して小さくする。
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => ({
        open: document.getElementById("panel").classList.contains("open"),
        notes: [...document.querySelectorAll("#notes li")]
          .map((e) => `${e.dataset.kind}:${e.checkVisibility()}`),
        layers: [...document.querySelectorAll("#landAll .land-layer")]
          .filter((e) => e.checkVisibility()).length,
        help: document.getElementById("noteHelp").checkVisibility(),
      }));
      must(!r.open, "PC で小さくできていない（この検査が別の状態を見ている）");
      must(r.notes.length > 0, "補足が 1 行も無い（この検査が何も見ていない）");
      must(r.notes.every((n) => n.endsWith(":true")),
        `PC で小さくしたら補足が消えた（? が無いので戻せない）: ${r.notes.join(" / ")}`);
      must(r.layers === 3, `PC で小さくしたら問いが減った: ${r.layers} 個`);
      must(!r.help, "PC に ? が出ている（畳んでいないので押す相手がいない。ADR 0026）");
      return `補足 ${r.notes.length} 行とも出たまま／問い ${r.layers} 個／? は出ない`;
    },
  },
  // ⚠ **主見出しと内訳の分母がそろっていること**（2026-08-23。Owner 判断。掟 §6）。
  //   ⚠ **豊洲では一致するので、⚠ 豊洲だけ見ていると気づけない。**
  //   ⚠ **整備範囲の端（渋谷）で見る**（⚠ 実測: ⚠ 範囲の 86.7% は区分が付いていない）。
  {
    name: "面積の内訳は、主見出しと同じ分母で、足して 100 になる",
    path: "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7", group: "core",
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const L = [...document.querySelectorAll("#landAll .land-layer")][1];
        const den = (L?.querySelector(".land-den")?.textContent ?? "").replace(/\s+/g, " ").trim();
        const head = (L?.querySelector(".land-num")?.textContent ?? "").trim();
        const rows = [...document.querySelectorAll("#areaBreak .stat")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim());
        return { den, head, rows };
      });
      must(r.rows.length > 1, `内訳が出ていない: ${r.rows.join(" / ")}`);
      // ⚠ **範囲の大きさを言っている**（掟 §6: ⚠ どの範囲の数字かを明示する）
      must(/\d+×\d+m/.test(r.den), `範囲の大きさを言っていない: 「${r.den}」`);
      // ⚠ **特定できなかったぶんを、⚠ 行として出す**（掟 §1）
      must(r.rows.some((t) => /区分が分からない/.test(t)),
        `特定できなかったぶんを隠している: ${r.rows.join(" / ")}`);
      // ⚠ **足して 100**（⚠ 「0.1% 未満」は 0 で数える。⚠ 丸めのぶん 1.0 まで許す）
      const sum = r.rows.reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      must(Math.abs(sum - 100) <= 1.0,
        `内訳が足して 100 にならない（${sum.toFixed(1)}%）: ${r.rows.join(" / ")}`);
      // ⚠ **主見出しと、⚠ 内訳の水が食い違わない**（⚠ 同じ分母なので近いはず）。
      //   ⚠ **水かどうかは `swale.js` が持つ**（⚠ ここで区分名を書き写さない。掟）。
      //   ⚠ **「0.1% 未満」の行は 0 で数える**ので、⚠ そのぶん内訳のほうが小さく出る。
      const wetNames = await page.evaluate(() =>
        (KonjakuSwale.SWALE ?? []).filter((c) => c.water).map((c) => c.name));
      const w = r.rows.filter((t) => wetNames.some((n) => t.startsWith(n)))
        .reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      const head = Number(String(r.head).replace(/[^\d.]/g, ""));
      must(Math.abs(w - head) <= 0.5,
        `主見出し ${head}% と、⚠ 内訳の水 ${w.toFixed(1)}% が食い違う（分母が違う）`);
      return `${head}%／内訳 ${r.rows.length} 行・合計 ${sum.toFixed(1)}%／「${r.den}」`;
    },
  },
  // ⚠ **明治期のデータが無い地点で、⚠ 右端を「明治期」にしない**（hidetzu/konjaku#170）。
  //   ⚠ **前は `/peel` が無条件に明治期を足していた**（⚠ トップは判定できたときだけ足していた）。
  //     ⚠ **同じ問いに 2 つの実装があり、⚠ 答えが違っていた。**
  //   ⚠ **実測（2026-08-23・375×667）**: ⚠ 札幌の段は「現在 1974–78 1945–50 **明治期**」で、
  //     ⚠ **押しても水域は出なかった**（⚠ 押しても何も起きない段。ADR 0026）。
  //   ⚠ **静的では捕まらない。**⚠ その土地に低湿地データがあるかは、⚠ 動かさないと分からない。
  {
    name: "明治期のデータが無い地点では、右端を「明治期」にしない",
    path: `/peel?${SAPPORO}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const labels = await stepLabels(page);
      must(labels.length > 1, `段が 1 つも組めていない: ${labels.join("/")}`);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      // ⚠ **本題**: ⚠ 明治期が段に出ていないこと（⚠ 右端だけでなく、⚠ どこにも）
      must(!labels.includes("明治期"),
        `明治期のデータが無いのに段に出している: ${labels.join("/")}`);
      // ⚠ **消したのは明治期だけ。**⚠ **写真の段は残っている**（⚠ 段ごと消していない）
      must(labels.length >= 3, `写真の段まで消えている: ${labels.join("/")}`);
      // ⚠ **理由は画面が言う**（⚠ 黙って消さない。掟 §1）
      const why = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      must(/整備対象外/.test(why),
        `明治期を段から外したのに、⚠ 理由を言っていない: ${why.slice(0, 100)}`);
      // ⚠ **常時見える場所（ものさしの注記）でも言うこと**（2026-08-23 に踏んだ）。
      //   ⚠ **段の有無で分岐していたので、⚠ 段を消したら断りごと消えた**
      //     （⚠ 実測: 「空中写真 5 段 ／ 明治期はこの土地では未整備」→「空中写真 5 段」）。
      //   ⚠ **スマホの初期画面では、⚠ ここが唯一その事実に触れる場所**
      //     （⚠ パネルの「整備対象外」は、⚠ 小さいあいだ畳まれている）。
      const note = await page.evaluate(() =>
        (document.getElementById("rlNote")?.textContent ?? "").replace(/\s+/g, " ").trim());
      must(/明治期はこの土地では未整備/.test(note),
        `ものさしの注記が、⚠ 明治期が無いことを言っていない: 「${note}」`);
      must(!/明治期は地図/.test(note), `データが無いのに「明治期は地図」と約束している: 「${note}」`);
      return `${labels.length} 段（${labels.join("/")}）／右端 ${labels.at(-1)}／理由は画面にある`;
    },
  },
  // ⚠ **明治期のデータがある地点では、⚠ いままでどおり右端が「明治期」**（⚠ 対で見る）。
  //   ⚠ **「消した」だけの検査にしない**（`verify` §5）。
  {
    name: "明治期のデータがある地点では、右端は「明治期」のまま",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const labels = await stepLabels(page);
      must(labels.at(-1) === "明治期", `右端が明治期でない: ${labels.join("/")}`);
      // ⚠ **注記も、⚠ いままでどおり「明治期は地図」**（⚠ 対で見る。`verify` §5）
      const note = await page.evaluate(() =>
        (document.getElementById("rlNote")?.textContent ?? "").replace(/\s+/g, " ").trim());
      must(/明治期は地図/.test(note), `注記が「明治期は地図」と言っていない: 「${note}」`);
      return `${labels.length} 段（右端 ${labels.at(-1)}）／注記「${note}」`;
    },
  },
  // ⚠ **押したら地図が本当に変わること**（2026-08-23。⚠ **実際に壊れていた**）。
  //   ⚠ **`wireProvPeek()` を `describe()` が呼んでいたが、⚠ ボタンを作るのは `paintBreakdown`** で、
  //     ⚠ **そちらが後に走る。**⚠ **繋いだ直後に `#breakdown` ごと差し替えられて listener が消えていた。**
  //   ⚠ **静的検査では捕まらない。**⚠ **DOM を組み立てただけでは、⚠ listener の有無は分からない。**
  //   ⚠ **押す位置では測らない。**⚠ 実測（2026-08-23・1280×950）: ⚠ **的は y=1129 で画面の外**
  //     （⚠ パネルの中で送られている）。⚠ **マウスで押すと、⚠ 直っていても外れる。**
  {
    name: "「地図で光らせる」を押しているあいだ、地図の塗りが変わる", path: `/peel?${TOYOSU}`,
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll("#breakdown button.peek").length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const paint = () => page.evaluate(
        `JSON.stringify(map.getPaintProperty("bld","fill-extrusion-color"))`);
      const ids = await page.evaluate(
        () => [...document.querySelectorAll("#breakdown button.peek")].map((b) => b.id));
      must(ids.length > 0, "「地図で光らせる」が 1 つも無い");
      const before = await paint();
      const seen = [];
      for (const id of ids) {
        await page.evaluate((i) => document.getElementById(i)
          .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), id);
        await settleAfterClick(page);
        const on = await paint();
        must(on !== before, `${id} を押しても地図の塗りが変わらない（listener が消えている）: ${on}`);
        await page.evaluate(
          () => dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
        await settleAfterClick(page);
        // ⚠ **離したら戻る**（⚠ 押しているあいだだけ、が仕様）
        must(await paint() === before, `${id} を離しても、地図の塗りが戻らない`);
        seen.push(id);
      }
      return `${seen.length} 個（${seen.join(" / ")}）が、押しているあいだだけ地図を変えた`;
    },
  },
  {
    name: "高さが推定であることを、主張範囲の数字で 1 か所だけ言う", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // ⚠ **建物の総数は、⚠ 3 つ目の問いの答えが持つ**（2026-08-22 以降。⚠ `#status` ではない）。
      //   ⚠ **見ている主張は同じ**（⚠ 建物が実際に建っていること）。
      const total = Number((t.match(/(\d+)\s*件\s*の建物が、この範囲にあります/) ?? [])[1]);
      must(total > 0, `件数が読めない: ${t.slice(0, 80)}`);
      // 「いま画面に出ているもの」に高さの行があること（畳んでいないこと）
      const prov = await provText(page);
      must(/高さ/.test(prov), `出所の一覧に高さの行が無い: ${prov.replace(/\s+/g, " ").slice(0, 120)}`);
      must(/既定値/.test(prov), "高さが推定であることが書かれていない");
      // ⚠ **数え方は「推定」を主語に統一した**（2026-08-21。Owner 判断）。
      //   ⚠ 前は台帳が「OSM に高さが入っているのは 40 / 543 件」（⚠ **実測が主語**）で、
      //     ⚠ #est が「高さも 503 / 543 件が推定です」（⚠ **推定が主語**）だった。
      //     ⚠ **同じ母数を逆から 2 通りに言っていた**（40 ＋ 503 = 543）。
      //     ⚠ 利用者役 4 名のうち 2 名が突き合わせられず、⚠ 1 名は「別のことだと思った」。
      //   ⚠ **母数つきの主張は #est の 1 か所。**⚠ 台帳は内訳（⚠ 同じ数字を持たない）。
      // ⚠ **2026-08-21 に、⚠ 分母つきは帯からパネルへ移った**（hidetzu/konjaku#151）。
      //   ⚠ **見ている主張は同じ**: ⚠ 推定を主語に、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。
      // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断）。⚠ **主張は同じ**:
      //   ⚠ **推定の件数が、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。**
      const bd = await page.evaluate(() =>
        (document.getElementById("breakdown")?.textContent ?? "").replace(/\\s+/g, " "));
      const mh = bd.match(/高さが分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(mh, `高さの件数が分母つきで出ていない: ${bd.slice(0, 120)}`);
      must(Number(mh[2]) === total,
        `高さの分母が主張範囲と違う: ${mh[2]} / 判定した件数 ${total}`);
      // ⚠ **推定は「実測でない分」**（⚠ 総数 − 実測）。⚠ **半分を超えていること。**
      const m = [null, String(Number(mh[2]) - Number(mh[1])), mh[2]];
      must(Number(m[1]) > Number(m[2]) * 0.5,
        `推定が半分以下なのに「ほとんどが既定値」と書いている: ${m[1]}/${m[2]}`);
      // ⚠ **同じ母数を、⚠ 実測を主語にしてもう一度言っていないこと**
      must(!/高さが入っているのは \d+ \/ \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **行の名を「高さが実測」→「高さが分かる」に変えた**（2026-08-23。Owner 判断）。
      //   ⚠ **否定形なので、⚠ 字を古いままにすると「見ていないのに緑」になる。**
      must(!/高さが(実測|分かる)の \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている（押す先の名前）: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **内訳は足して推定の件数になること**（⚠ 台帳が持つのは内訳だけ）
      // ⚠ **内訳の言い方も変わった**（2026-08-22）: 「階数から換算 X 件 ／ 種別ごとの既定値 Y 件」
      const mm = bd.match(/階数から換算\s*(\d+)\s*件\s*／\s*種別ごとの既定値\s*(\d+)\s*件/);
      must(mm, `高さの内訳が読めない: ${bd.slice(0, 160)}`);
      must(Number(mm[1]) + Number(mm[2]) === Number(m[1]),
        `内訳が推定の件数と合わない: ${mm[1]} ＋ ${mm[2]} ≠ ${m[1]}`);
      // ⚠ 内訳の表には入れない。あの表は足元の判定の**分割**（足すと総数になる）で、
      //   高さや建設年は**素性**なので、混ぜると足し算の合わない表になる。
      must(!/高さが(実測|分かる)の建物/.test(t), "素性（高さ）が、分割の表である内訳に混ざっている");
      // ⚠ 評価語を作らない
      for (const w of ["ほぼ正確", "おおむね", "信頼度", "精度は"])
        must(!t.includes(w), `評価語が入っている: 「${w}」`);
      return `${m[1]} / ${m[2]} 件が推定（判定した件数と一致）／内訳 ${mm[1]} ＋ ${mm[2]}`;
    },
  },
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
