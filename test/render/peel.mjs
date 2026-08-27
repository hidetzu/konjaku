// 深掘り（`/peel`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=peel`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  YUMENOSHIMA, KIYOSUMI, UENO, NIIGATA, URAYASU, openGroups,
  suggestionsOf, rowsOf, groupsOf, WEB_SEARCH, WD, wdItem,
  WD_SHIBUYA, stubWikidata, XSS, notRun, shownAsText, photoFrames,
  waitStrip, RE_ESC, G1_MARK, G1_HEAD, VERDICT_SENTENCE, pngOf,
  photoPng, ERA_TILE_IDS, timelineSettled, stepLabels, peelReady, settleAfterCondition,
  waited, settleAfterClick, settleAfterScroll, LFC_ROUTE, DEM_ROUTE, must,
  provText
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
// ⚠ **足元の区分と確かさの段は `peel-ground.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as GROUND_CASES } from "./peel-ground.mjs";
// ⚠ **まだ用意していない土地の話は `peel-unbuilt.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as UNBUILT_CASES } from "./peel-unbuilt.mjs";


export const CASES = [
  ...THEME_CASES,
  ...LAYER_CASES,
  ...PLAY_CASES,
  ...REACH_CASES,
  ...UNREACH_CASES,
  ...FRESH_CASES,
  ...FOLD_CASES,
  ...GROUND_CASES,
  ...MOTION_CASES,
  ...ERA_CASES,
  ...COMPONENT_CASES,

  ...PANEL_CASES,
  ...BUILDING_CASES,
  ...UNBUILT_CASES,
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
