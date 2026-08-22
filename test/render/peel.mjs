// 深掘り（`/peel`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=peel`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  NAGOYA_LL, UNSURVEYED, YUMENOSHIMA, KIYOSUMI, KARUIZAWA, UENO,
  NIIGATA, URAYASU, openGroups, suggestionsOf, rowsOf, groupsOf,
  WEB_SEARCH, waitVerdict, WD, wdItem, WD_SHIBUYA, stubWikidata,
  XSS, notRun, shownAsText, photoFrames, waitStrip, LIES,
  RE_ESC, G1_MARK, G1_HEAD, VERDICT_SENTENCE, GSI_ROUTE, PHOTO_ROUTE,
  pngOf, whitePng, photoPng, eraRoute, ERA_TILE_IDS, stubMapPictures,
  timelineSettled, stepLabels, tauNow, effOpacity, waitOpacity, peelReady,
  settleAfterCondition, waited, waitOptional, settleAfterClick, settleAfterScroll, SWALE_ROUTE,
  LFC_ROUTE, DEM_ROUTE, forbid,
  must, assertToyosu3dAnswer, openPanel, provText
} from "./lib.mjs";
import { readFile } from "node:fs/promises";

// ⚠ **EraControlPanel だけを、⚠ 地図もネットも無しで開く**（hidetzu/konjaku#171）。
//   ⚠ **配信物を増やさない。**⚠ `page.route` で組み立てる（実ファイルを置かない）。
//   ⚠ **DOM も token も peel.html から取る。**⚠ ここへ写すと 2 か所になって片方が古くなる（掟）。
//   ⚠ **画面の代わりは、ここが持つ。**⚠ 返ってきた位置を `window.__pos` に置いて描き直すだけ（一方向）。
async function openEraControl(browser, { width = 1280, height = 400 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const p2 = await ctx.newPage();
  const peel = await readFile(new URL("../../public/peel.html", import.meta.url), "utf8");
  const i = peel.indexOf('<section id="timePanel"');
  const j = peel.indexOf("</section>", i) + "</section>".length;
  if (i < 0 || j <= i) throw new Error("peel.html から #timePanel を切り出せない（この検査が何も見ていない）");
  const rootCss = /:root\{([\s\S]*?)\}/.exec(peel)?.[1] ?? "";
  if (!rootCss.includes("--text-hero")) throw new Error("peel.html の :root を読めない（この検査が何も見ていない）");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/components/era-control/era-control.css">
<style>:root{${rootCss}} body{background:#0b0e13;margin:0;padding:20px;
  font:14px/1.65 -apple-system,sans-serif;color:var(--ink)}</style></head><body>
${peel.slice(i, j)}
<script src="/esc.js"></script>
<script src="/words.js"></script>
<script src="/components/era-control/era-control.js"></script>
<script>
  window.__ev = []; window.__pos = 0;
  window.__steps = [{id:"now",label:"現在"},{id:"a",label:"1984–86"},{id:"b",label:"1974–78"},
                    {id:"c",label:"1945–50"},{id:"swale",label:"明治期",meiji:true}];
  window.__draw = (o) => window.__c.update({ steps: window.__steps, pos: window.__pos,
    playing: false, narrow: false, sealed: false, meijiHas: true,
    readout: { year: "", kick: "", sub: "", net: "", note: "" }, tone: {}, ...(o ?? {}) });
  window.__c = createEraControl({ root: document.getElementById("timePanel"),
    onChangeEra: (p) => { window.__ev.push(["era", p]); window.__pos = p; window.__draw(); },
    onTogglePlay: () => window.__ev.push(["play"]) });
  window.__draw();
</script></body></html>`;
  const got = [], errs = [];
  p2.on("request", (r) => got.push(new URL(r.url()).pathname));
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.route(`${BASE}/__era-control-probe`, (r) =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await p2.goto(`${BASE}/__era-control-probe`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { ctx, p2, got, errs };
}

export const CASES = [
  {
    // ⚠ **HUD は「いまの年代」と「年代操作」だけを扱う**（2026-08-22。hidetzu/konjaku#168。Owner 判断）。
    //   ⚠ 補足（推定の断り・操作ヒント・重ねている断り）は、⚠ **HUD の外の層**（`#notice`）に出す。
    //   ⚠ **消したのではない。**⚠ 消えると、⚠ **推定の高さで建物が立った絵を断りなしに見せる**（掟 §1）。
    // ⚠ **4 幅すべてで見る。**⚠ 実測（2026-08-22・1280×800・豊洲）: 狭い幅の規則がこの画面の既定なので、
    //   ⚠ **PC で打ち消し忘れて `#notice` が 0×0 になった**（字は入っているのに display:none）。
    //   ⚠ **幅を 1 つでも抜くと、この落ち方を見逃す。**
    // ⚠ **主題は「どこに出ているか」**であって、⚠ **絵が届くかではない**（hidetzu/konjaku#191）。
    name: "補足は HUD の外に出ており、どの幅でも読める", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true, setup: stubMapPictures,
    async check(page) {
      await page.waitForFunction(
        () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      // ⚠ **幅を変えるだけでは足りない。**⚠ **その幅で開き直す。**
      //   ⚠ 実測（2026-08-22）: 375 で開いてから 1280 へ広げても、⚠ **パネルは閉じたまま**なので
      //     `#panel:not(.hide)` の規則が効かず、⚠ **PC の初期状態（パネルが開いている）を見ていなかった。**
      //   ⚠ わざと壊しても通ってしまい、⚠ **検査が測っていないことを「確認済み」と言う形**になっていた。
      for (const [w, h] of [[1280, 800], [375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
          null, { timeout: 45000 });
        await settleAfterCondition(page);
        const r = await page.evaluate(() => {
          const rect = (id) => document.getElementById(id).getBoundingClientRect();
          const est = document.getElementById("notes"), hud = document.getElementById("hud");
          // ⚠ **`#notice` / `#chrome` は消えた**（2026-08-22）。⚠ **補足は板の中の `#notes`。**
          const nb = rect("notes"), hb = rect("hud");
          const row = document.querySelector("#panel .chrome-row").getBoundingClientRect();
          // ⚠ **敷きは祖先を辿って探す。**⚠ 地図そのものは敷きに数えない
          //   （body は不透明だが、その上に地図が乗っている）。
          const mapEl = document.getElementById("map");
          let bgA = 0;
          for (let n = est; n && n !== document.body; n = n.parentElement) {
            if (n === mapEl) break;
            const bg = getComputedStyle(n).backgroundColor;
            if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
            const v = bg.startsWith("rgba") ? (Number((bg.match(/[\d.]+/g) ?? [])[3]) || 0) : 1;
            if (v > bgA) bgA = v;
            if (bgA >= 1) break;
          }
          return {
            inHud: hud.contains(est),
            hudTxt: (hud.innerText ?? "").replace(/\s+/g, " ").trim(),
            noticeOn: document.getElementById("notes").checkVisibility(),
            estOn: est.checkVisibility(), estH: Math.round(rect("notes").height),
            // ⚠ **操作の案内は、⚠ 狭い幅で小さくしているあいだ ? の中**（2026-08-23。Owner 判断）。
            //   ⚠ **主張は「⚠ 出す手段がある」**（⚠ 消していない）。⚠ **? か、⚠ 字そのもの。**
            tipOn: !!document.querySelector('#notes li[data-kind="tip"]')?.checkVisibility()
                || !!document.getElementById("noteHelp")?.checkVisibility(),
            top: Math.round(nb.top), bottom: Math.round(nb.bottom),
            center: Math.round(innerHeight / 2), bgA,
            overRow: Math.round(Math.min(nb.bottom, row.bottom) - Math.max(nb.top, row.top)),
            overHud: Math.round(Math.min(nb.bottom, hb.bottom) - Math.max(nb.top, hb.top)),
            times: (document.body.innerText.match(/建物が消える年代は推定/g) ?? []).length,
            // ⚠ **前提が崩れていたら、この検査は何も確かめていない**
            panelOpen: document.getElementById("panel").classList.contains("open"),
          };
        });
        // ⚠ **その幅の初期状態になっているか**（PC は開いて始まる／狭い幅は閉じて始まる）
        must(r.panelOpen === (w > 680),
          `${w}px: パネルの初期状態が違う（open=${r.panelOpen}）。この検査の前提が消えた`);
        // ⚠ **構造で見る。**字だけで見ると、同じ字が別の場所にあっても通る
        must(!r.inHud, `${w}px: 補足がまだ HUD の中にある`);
        must(!/建物が消える年代は推定/.test(r.hudTxt), `${w}px: HUD に推定の断りが残っている`);
        must(!/建物を押すと/.test(r.hudTxt), `${w}px: HUD に操作ヒントが残っている`);
        // ⚠ **0×0 で「ある」ことにしない**（⚠ 2026-08-22 に PC でこれを踏んだ）
        must(r.noticeOn && r.estOn && r.tipOn && r.estH > 0,
          `${w}px: 補足が見えていない（notice=${r.noticeOn} est=${r.estOn} tip=${r.tipOn} 高さ=${r.estH}）`);
        // ⚠ **移したのであって、増やしたのではない**
        must(r.times === 1, `${w}px: 「建物が消える年代は推定」が画面に ${r.times} 回ある`);
        // ⚠ **航空写真の上で字が沈まない**
        must(r.bgA >= 0.5, `${w}px: 補足に敷きが無い（不透明度 ${r.bgA}）`);
        // ⚠ **押せるものを塞がない／HUD とぶつからない**
        //   （実測: 別々に置いた箱が 92px 食い込んだことがある）
        // ⚠ **補足は板の中に入った**（2026-08-22）。⚠ **帯とは同じ積み上げに並ぶ**ので、
        //   ⚠ **重ならないこと**を見る意味は残っている（⚠ `position:sticky` の帯の下に潜らない）。
        must(r.overRow <= 0, `${w}px: 補足が「もどる」の行に ${r.overRow}px 重なっている`);
        must(r.overHud <= 0, `${w}px: 補足が HUD に ${r.overHud}px 重なっている`);
        // ⚠ **調べている地点（画面中央）を覆わない**
        must(r.bottom < r.center,
          `${w}px: 補足が画面中央の印を覆っている（下端 ${r.bottom} / 中央 ${r.center}）`);
        out.push(`${w}: y=${r.top}〜${r.bottom}／敷き${r.bgA}`);
      }
      return out.join(" ／ ");
    } },
  {
    // ⚠ **詳細版が無くて広い区分に落ちたら、⚠ /peel でもそう言う**（2026-08-22。hidetzu/konjaku#128）。
    //   ⚠ **黙ると、⚠ 広い区分の答えが「この土地の分類」として読まれる**（掟: 推定を実測のように見せない）。
    //   ⚠ **穴だった。**⚠ トップと共有カードは言っていたのに、⚠ **/peel だけ 0 件**だった。
    // ⚠ **字は verify.js の note をそのまま出す**（⚠ 3 か所で同じ文。⚠ 写しを作らない）。
    // ⚠ **出す土地と出さない土地の両方を見る**（下の case）。⚠ 片方だけだと「いつも出す」でも通る。
    name: "/peel でも、広い区分に落ちたらそう言う", path: `/peel?${KARUIZAWA}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **狭い幅では、⚠ 小さいあいだ 3 つの問いを畳む**（2026-08-23。Owner 判断）。
      //   ⚠ **`document.body.innerText` には答えが入らない。**⚠ **先に広げてから待つ。**
      //   ⚠ **主張は変えていない。**⚠ **読む場所だけ移した。**
      await openPanel(page);
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("landAll")?.innerText ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const all = document.getElementById("landAll");
        const c = all.querySelector(".land-coarse");
        const first = all.querySelector(".land-layer");
        const cr = c?.getBoundingClientRect(), fr = first.getBoundingClientRect();
        return { txt: c?.textContent?.trim() ?? "",
          inFirst: !!c && first.contains(c),
          top: cr ? Math.round(cr.top) : -1, firstTop: Math.round(fr.top),
          times: (document.body.innerText.match(/詳細版が整備されていない/g) ?? []).length };
      });
      // ⚠ **第1層の中にあること**（⚠ 「画面のどこかにある」では置き場所を守れない）
      must(r.inFirst, "粗さの行が第1層の中に無い（置き場所は第1層の直下）");
      must(/詳細版が整備されていないため、広い区分で答えています/.test(r.txt),
        `粗さの断りが出ていない: ${r.txt.slice(0, 60)}`);
      // ⚠ **⚠ の記号を使わない**（この画面の ⚠ は災害リスク。混ぜると「危ない土地」に読まれる）
      must(!/⚠/.test(r.txt), `粗さの行に ⚠ が混ざっている: ${r.txt.slice(0, 40)}`);
      must(r.times === 1, `粗さの断りが画面に ${r.times} 回ある`);
      must(r.top > r.firstTop, `粗さの行が第1層の見出しより上にある（${r.top} / ${r.firstTop}）`);
      return `軽井沢: 第1層 y=${r.firstTop} の直下 y=${r.top}`;
    } },
  {
    // ⚠ **詳細版がある土地では言わない**（2026-08-22。hidetzu/konjaku#128）。
    //   ⚠ **これが無いと、⚠ 「いつも出す」実装でも上の検査が通ってしまう。**
    name: "詳細版がある土地では、粗いとは言わない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **狭い幅では、⚠ 小さいあいだ 3 つの問いを畳む**（2026-08-23。Owner 判断）。
      //   ⚠ **`document.body.innerText` には答えが入らない。**⚠ **先に広げてから待つ。**
      //   ⚠ **主張は変えていない。**⚠ **読む場所だけ移した。**
      await openPanel(page);
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("landAll")?.innerText ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => ({
        coarse: !!document.querySelector("#landAll .land-coarse"),
        times: (document.body.innerText.match(/詳細版/g) ?? []).length,
      }));
      must(!r.coarse, "詳細版があるのに粗さの行が出ている");
      must(r.times === 0, `詳細版があるのに「詳細版」の語が ${r.times} 回出ている`);
      return "豊洲: 粗さの行 0 ／「詳細版」0 回";
    } },
  {
    // ⚠ **並びは「答え → Domain の結果 → 入力データの状態」**（2026-08-22。hidetzu/konjaku#160。Owner 判断）。
    //   ⚠ **「内訳」は入力データの説明ではない。**⚠ **今昔が入力から計算した Domain 上の結果。**
    //   ⚠ だから ⚠ **データの話より前**に置き、⚠ 名前も「建物の足元判定」にした。
    // ⚠ **実測（2026-08-22・前の並び）**: 内訳が 375px で y=830 ＝ ⚠ **画面の外**（8 通り中 6 通り）。
    //   ⚠ 並べ替えで 4 幅とも画面内に入った。⚠ **この検査は、その並びを固定する。**
    // ⚠ **主題は「並び」**であって、⚠ **絵が届くかではない**（hidetzu/konjaku#191）。
    name: "パネルは 答え → 建物の足元判定 → 使用しているデータ の順", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true, setup: stubMapPictures,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const out = [];
      for (const [w, h] of [[1280, 800], [375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.reload({ waitUntil: "domcontentloaded" });
        // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
        //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
        //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
        await peelReady(page);
        await settleAfterCondition(page);
        if (await page.evaluate(() => !document.getElementById("panel").classList.contains("open"))) {
          await page.click("#toggle");
          await settleAfterClick(page);
        }
        const r = await page.evaluate(() => {
          const panel = document.getElementById("panel");
          const secs = [...panel.querySelectorAll(".sec")];
          const labels = secs.map((s) => s.querySelector(".label")?.textContent?.trim() ?? "(答え)");
          const bd = document.getElementById("breakdown").closest(".sec");
          const pv = document.querySelector("#panel .prov-q")?.closest(".land-layer");
          const bb = bd.getBoundingClientRect(), pb = pv.getBoundingClientRect();
          return { labels, bdTop: Math.round(bb.top), pvTop: Math.round(pb.top),
            // ⚠ **中身が減っていないこと**（⚠ 並べ替えで落としていないか）
            rows: document.querySelectorAll("#breakdown .stat").length,
            old: /内訳|表示データについて|いま画面に出ているもの/.test(document.body.innerText),
            scrollTop: Math.round(panel.scrollTop) };
        });
        // ⚠ **前提**（スクロールしていない状態で見る）
        must(r.scrollTop === 0, `${w}px: パネルがスクロールしている（この検査の前提が消えた）`);
        // ⚠ **Domain の結果が、入力データの状態より前**
        must(r.bdTop < r.pvTop,
          `${w}px: 建物の足元判定がデータの節より後ろにある（${r.bdTop} / ${r.pvTop}）`);
        // ⚠ **見出しが画面内**（⚠ これがこの Issue の元の困りごと）
        must(r.bdTop < h, `${w}px: 建物の足元判定が画面の外にある（y=${r.bdTop} / 画面 ${h}）`);
        // ⚠ **旧名が残っていない**
        must(!r.old, `${w}px: 旧い節名（内訳／表示データについて）が画面に残っている`);
        // ⚠ **中身を落としていない**
        must(r.rows > 0, `${w}px: 建物の足元判定の中身が空`);
        out.push(`${w}: 足元判定 y=${r.bdTop} / データ y=${r.pvTop}`);
      }
      return out.join(" ／ ");
    } },
  {
    // ⚠ **出典明示は利用の条件であって、飾りではない。**
    //   国土地理院タイル: 出典明示が利用の条件
    //   OpenStreetMap:   ODbL でクレジット必須
    //   /peel は空中写真と建物を**全面に**出している画面。
    //
    // ⚠ 実際に破れていた（2026-08-17。UI/UX レビュー役の指摘 → 実測で確定）:
    //   ・`attributionControl:false` ＋ CSS の `display:none!important` で地図側の帰属を消していた
    //   ・手書きの出典は**左パネルの中**。パネルはスマホで閉じて始まる（panelOpen=!isNarrow）
    //   ・実測: PC 1280×800 で y=920（画面外 120px 下）／375×667 は閉じたパネルの中
    //   ・直したあとも、一度は **#hud（z-index 12）の裏**に隠れていた
    //   ・OSM の建物データに `attribution` が無く、ODbL のクレジットが出ていなかった
    //
    // ⚠ **「ある」と「見えている」は別。** `checkVisibility()` は
    //   閉じたパネルの中でも true を返した。
    // ⚠ `elementFromPoint` でも駄目だった（2026-08-17 に壊して気づいた）。
    //   `#hud` は `pointer-events:none` なので**当たり判定に出てこない**。
    // ⚠ 画素で見比べるのも駄目だった。**3D 地図は常に描き直している**ので、
    //   HUD を消していなくても絵が変わる（同じ条件で 2 枚撮っても一致しない）。
    //   → **矩形の交差で見る。** HUD の中で地色や枠線を持つ板が、
    //     帰属表示の枠に 1px でも重なっていないこと。
    //   ⚠ 実際に守っているのは z-index ではなく **HUD の下の余白**。
    //     余白を削ると板が下りてきて重なる。だからここが本当の見張り。
    name: "さかのぼる（出典が、開かなくても画面に出ている）", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      // ⚠ 3 幅で見る。狭い幅は板が増えて裏に入りやすい
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib");
          if (!at) return { there: false };
          const b = at.getBoundingClientRect();
          const text = at.innerText.replace(/\s+/g, " ").trim();
          // その座標を占めているのは帰属表示自身か（裏に隠れていないか）
          const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
          const top = document.elementFromPoint(cx, cy);
          // ⚠ パネルを開かないと読めないものは、出典として数えない
          const panel = document.getElementById("panel");
          const inPanel = !!panel && panel.contains(at);
          return { there: true, text,
            inView: b.top >= 0 && b.bottom <= innerHeight && b.width > 0 && b.height > 0,
            covered: !(top && (at === top || at.contains(top))),
            coveredBy: top ? (top.id || String(top.className) || top.tagName) : "",
            inPanel, w: Math.round(b.width), h: Math.round(b.height) };
        });
        must(r.there, `${w}×${h}: 地図の帰属表示が無い（出典明示は利用の条件）`);
        must(r.inView, `${w}×${h}: 帰属表示が画面の外にある`);
        // ⚠ HUD の板が、帰属表示の枠に重なっていないこと
        // ⚠ **切られている分は数えない**（2026-08-21。hidetzu/konjaku#152）。
        //   ⚠ `#hud` は `overflow-y:auto` の箱で、⚠ **中身が入りきらないときは中でスクロールする。**
        //     ⚠ そのとき子の矩形は箱の外まで伸びるが、⚠ **画面には出ていない**（切られている）。
        //   ⚠ 実測（375×667）: `#timePanel` の矩形が y518–643 で、⚠ 帰属（y643）と当たったが、
        //     ⚠ **箱は y354–641 で、⚠ 641 より下は描かれていない。**
        //   ⚠ **見たいのは「⚠ 実際に上に塗っているか」**なので、⚠ 箱で切ってから比べる。
        const over = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib").getBoundingClientRect();
          const hud = document.getElementById("hud").getBoundingClientRect();
          const hits = [];
          for (const e of document.querySelectorAll("#hud *")) {
            const b = e.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) continue;
            const cs = getComputedStyle(e);
            // 地色も枠線も無いものは、上に塗らないので数えない
            if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderTopWidth === "0px") continue;
            // ⚠ **箱で切る**（⚠ 見えている分だけを相手にする）
            const r = { left: Math.max(b.left, hud.left), right: Math.min(b.right, hud.right),
              top: Math.max(b.top, hud.top), bottom: Math.min(b.bottom, hud.bottom) };
            if (r.right - r.left < 2 || r.bottom - r.top < 2) continue;
            if (r.left < at.right && at.left < r.right && r.top < at.bottom && at.top < r.bottom)
              hits.push(`<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : "." + String(e.className).split(" ")[0]}>`
                + ` 見えている分 y=${Math.round(r.top)}..${Math.round(r.bottom)}`);
          }
          return hits;
        });
        must(!over.length,
          `${w}×${h}: 帰属表示に HUD の板が重なっている: ${over.join(" ／ ")}`);
        must(!r.inPanel, `${w}×${h}: 帰属表示が畳めるパネルの中にある（閉じると消える）`);
        // ⚠ 名前を字で確かめる。控えを表示していても、名前が出ていなければ意味がない
        must(r.text.includes("国土地理院"), `${w}×${h}: 国土地理院が出ていない: 「${r.text}」`);
        must(/OpenStreetMap/.test(r.text), `${w}×${h}: OpenStreetMap が出ていない: 「${r.text}」`);
        must(/©/.test(r.text), `${w}×${h}: ODbL のクレジット（©）が出ていない: 「${r.text}」`);
        out.push(`${w}×${h}: ${r.w}×${r.h}px`);
      }
      // ⚠ **中央（いま調べている地点）を覆っていないこと。** 帰属表示の場所を作るために
      //   HUD を押し上げると、そこが隠れる。375×667 で見る
      //   （⚠ 320×640 は**もともと覆っている別の不具合**があるので、ここでは見ない）
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(700);
      const hud = await page.evaluate(() =>
        ({ top: Math.round(document.getElementById("hud").getBoundingClientRect().top),
           mid: Math.round(innerHeight / 2) }));
      must(hud.top > hud.mid,
        `375×667: HUD が画面中央（調べている地点 y=${hud.mid}）を覆っている: HUD 上端 ${hud.top}`);
      return `国土地理院・© OpenStreetMap contributors が、開かなくても画面に出ている`
        + `（${out.join(" ／ ")}）／HUD 上端 ${hud.top} は中央 ${hud.mid} より下`;
    },
  },
  {
    // ⚠ **下から伸びる箱が、⚠ 調べている地点を覆ってはいけない。**
    //
    // ⚠ **2026-08-21 に、⚠ 答えの板（#land）が無くなった**（hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 前の主張は「⚠ 下から伸びる箱（#hud）が、⚠ 答えの板を押しのけない」だった。
    //     ⚠ 実測（2026-08-19・320×480・過去の段）: #hud が #land に **92px** 食い込み、
    //       ⚠ 「99.6%」の 4 文字しか読めなかった。⚠ **画面が低いほど強い実測が消える**作りだった。
    //     ⚠ CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」を踏んだ記録。
    //   ⚠ **押しのける相手が無くなった。**⚠ **主張は引き継ぐ**:
    //     ⚠ **画面が低くても、⚠ 下の箱が調べている地点（画面中央）を覆わない。**
    //     ⚠ **潰さない**（⚠ 上限だけ掛けて中身が 27px になった記録がある）。
    name: "画面が低くても、下の箱が調べている地点を覆わない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 480 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 過去の段がいちばん厳しい（#over が増える）
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "500"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const hud = document.getElementById("hud"), hr = hud.getBoundingClientRect();
        // ⚠ **断りは HUD の外（`#notice`）へ出した**（2026-08-22。hidetzu/konjaku#168）。
        //   ⚠ **主張は変えていない**（⚠ 画面のどこかで、⚠ **読める形で**出ていること）。
        const nt = document.getElementById("notes");
        const nb = nt.getBoundingClientRect();
        return { hudTop: Math.round(hr.top), hudH: Math.round(hr.height),
          scroll: hud.scrollHeight, mid: Math.round(innerHeight / 2),
          land: document.querySelectorAll("#land").length,
          text: hud.innerText.replace(/\s+/g, " ").trim(),
          notice: nt.innerText.replace(/\s+/g, " ").trim(),
          noticeOn: nt.checkVisibility(), noticeBottom: Math.round(nb.bottom),
          overlap: Math.round(Math.min(nb.bottom, hr.bottom) - Math.max(nb.top, hr.top)) };
      });
      // ⚠ **調べている地点（画面中央）を覆わない**
      must(r.hudTop > r.mid,
        `下の箱が調べている地点を覆っている: 箱の上端 ${r.hudTop} / 中央 ${r.mid}`);
      // ⚠ **潰していない**（⚠ 中身が入りきらないなら、⚠ 消さずに中でスクロール）
      must(r.hudH >= 100, `下の箱が ${r.hudH}px まで潰れている（読めない）`);
      // ⚠ **中身を縮めていないこと。**⚠ 上限に当たったら、⚠ **スクロールで見せる。**
      //   ⚠ 実測で踏んだ（2026-08-21・320×640）: 上限だけ掛けたら flex の子が縮み、
      //     ⚠ **中身 381 → 300px に潰れ、⚠ スクロールもできず**
      //     ⚠ 「空中写真 8 段 ／ 明治期は地図」が読めなくなった（⚠ scrollHeight == height）。
      must(r.scroll > r.hudH,
        `上限に当たったのに中身を縮めている（スクロールできない）: 中身 ${r.scroll} / 箱 ${r.hudH}`);
      // ⚠ **板の中でも潰れていないこと**（⚠ 縮められると、⚠ 板の内側があふれる）
      const crushed = await page.evaluate(() =>
        [...document.querySelectorAll("#hud > *")]
          .filter((e) => e.scrollHeight > Math.ceil(e.getBoundingClientRect().height) + 1)
          .map((e) => `${e.id || e.className}: 中身 ${e.scrollHeight} / 箱 ${
            Math.round(e.getBoundingClientRect().height)}`));
      must(!crushed.length, `下の箱の中で、板が潰れている: ${crushed.join(" ／ ")}`);
      // ⚠ **答えの板は戻っていない**（⚠ 戻ると、⚠ また答えが 2 か所になる）
      must(r.land === 0, "答えの板（#land）が戻っている（土地の答えはパネルの 1 か所）");
      // ⚠ **断りは残っている**（⚠ 消さずに移した、が守れているか）。
      //   ⚠ **場所は HUD の外**だが、⚠ **画面から消えたら同じこと**なので、ここで見る。
      must(r.noticeOn && /推定/.test(r.notice),
        `補足の層から断りが消えている: 見える=${r.noticeOn} ／ ${r.notice.slice(0, 60)}`);
      // ⚠ **いちばん低い画面（480）で、⚠ 補足と下の箱がぶつからない**
      must(r.overlap <= 0, `補足と下の箱が ${r.overlap}px 重なっている`);
      // ⚠ **補足も、調べている地点を覆わない**
      must(r.noticeBottom < r.mid,
        `補足が調べている地点を覆っている: 下端 ${r.noticeBottom} / 中央 ${r.mid}`);
      return `320×480・過去の段で 箱の上端 ${r.hudTop} > 中央 ${r.mid}`
        + ` ／ 箱 ${r.hudH}px（中身 ${r.scroll}px）／答えの板は無い`;
    },
  },
  {
    // ⚠ **見えないものに焦点を当てない。**（掟: 押しても何も起きない導線を置かない）
    //   実測（2026-08-19）: 幅ごとに使わない側の操作が DOM に残り、キーボードで到達できた。
    //     320 幅 … 帯の畳み / #play / #t とドラムのボタン 9 個
    //     PC     … ドラムのボタン 9 個（⚠ これは main からあった漏れ）
    //     根拠を全画面で読んでいるとき … #toggle / 年代の畳み / ものさしの ‹ ›
    //   ⚠ **畳みボタンは 2026-08-22 に両方とも消した。**⚠ 上は当時の実測なので残す。
    //     ⚠ 「隠れているのに aria-expanded と名乗らない」を見ていた 3 行は、
    //       ⚠ **見る相手が居なくなり、⚠ 何も確かめずに必ず通る状態**だったので落とした
    //       （Owner 判断・2026-08-22。⚠ **数だけ合わせる検査は置かない**）。
    //     ⚠ 畳み機構が戻っていないことは、⚠ **別のケースが `[aria-expanded]` を数えて見る。**
    name: "見えない操作に、キーボードで届かない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **「幅 0 ＋ tabIndex≥0」では足りない**（2026-08-23）。
      //   ⚠ **`display:none` / `visibility:hidden` は、⚠ ブラウザ自身が焦点の順から外す。**
      //   ⚠ **それを「漏れ」と数えると、⚠ 見えない＝安全なものまで落ちる**
      //     （⚠ 実際に落ちた: ⚠ 板を小さくすると `#breakdown` ごと `display:none` になる
      //      ⚠ `peekH` / `peekY` を、⚠ 「焦点が当たる」と報告した）。
      //   ⚠ **実際に焦点を当てて、⚠ 当たったかで見る**（`ui-ux-review` §3）。
      //     ⚠ **これは heuristic ではない。**⚠ **ブラウザの答えそのもの。**
      //   ⚠ **見えているものは戻す**（⚠ 検査が焦点を動かしたまま次へ行かない）。
      const leaks = () => page.evaluate(() => {
        const was = document.activeElement;
        const bad = [];
        // ⚠ **測れていない穴を、⚠ 先に書いておく**（掟: ⚠ 測っていないことを「確認済み」と書かない）。
        //   ⚠ **見ているのは「自分の矩形が 0 なのに焦点が当たる」だけ。**
        //   ⚠ **0×0 の `overflow:hidden` の中に押せるものを置くと、⚠ ここでは捕まらない**
        //     （⚠ 子は自分の矩形を持つため。⚠ 2026-08-23 にわざと壊して確かめた）。
        //   ⚠ **祖先の 0 面積まで見る案は捨てた**（⚠ 地図の帰属リンクまで拾って広すぎた）。
        //   ⚠ **本当に強く見るなら Tab を順に押す**（`ui-ux-review` §3）。⚠ **まだやっていない。**
        for (const e of document.querySelectorAll("button,input,a[href]")) {
          const r = e.getBoundingClientRect();
          if (r.width !== 0 && r.height !== 0) continue;   // 見えているものは対象外
          if (e.inert || e.closest("[inert]")) continue;
          e.focus();
          if (document.activeElement === e) bad.push(e.id || e.textContent.trim().slice(0, 8) || e.tagName);
        }
        if (was instanceof HTMLElement) was.focus(); else document.activeElement?.blur?.();
        return bad;
      });
      // ⚠ **`e.inert` は親から継いだ状態を返さない。**
      //   実測（2026-08-19）: 親（#ruler）を inert にしても、子の ‹ › は e.inert=false のままで、
      //   ⚠ 「閉じすぎる」を壊しても検査が緑になった。**closest で親まで見る。**
      const used = (ids) => page.evaluate((ids) => ids.filter((id) => {
        const e = document.getElementById(id);
        return !e || e.inert || !!e.closest("[inert]");
      }), ids);

      // ---- 地図を見ているとき ----
      const a = await leaks();
      // ⚠ **✕ は消えた**（2026-08-22。⚠ 同じ的（`#toggle`）が広げる／小さくするを兼ねる）。
      //   ⚠ **例外にする相手がいなくなった。**⚠ **主張は同じ**（⚠ 見えないのに焦点が当たらない）。
      const aBad = a;
      must(!aBad.length, `見えないのに焦点が当たる: ${aBad.join("、")}`);
      // ⚠ 使う側まで閉じていないこと（閉じすぎると操作できなくなる）
      const aStuck = await used(["rlPrev", "rlNext", "toggle"]);
      must(!aStuck.length, `使う操作が閉じている: ${aStuck.join("、")}`);
      // ---- 根拠を全画面で読んでいるとき ----
      await page.click("#toggle");
      await settleAfterClick(page);
      const b = await leaks();
      must(!b.length, `根拠を読んでいるのに、地図側の操作に焦点が当たる: ${b.join("、")}`);
      // ⚠ 戻る手段は閉じない
      // ⚠ **戻る手段は `#toggle`（▴ 地図に戻る）と `#back`（← 今昔へ）の 2 つ**（2026-08-23）。
      const bStuck = await used(["toggle", "back"]);
      must(!bStuck.length, `戻る手段が閉じている: ${bStuck.join("、")}`);

      // ---- 小さくしたら元に戻る ----
      await page.click("#toggle");
      await settleAfterClick(page);
      const c = await used(["rlPrev", "rlNext", "toggle"]);
      must(!c.length, `根拠を閉じたのに、操作が閉じたまま: ${c.join("、")}`);
      return `地図のとき ${aBad.length} 件／根拠を読むとき ${b.length} 件／閉じたら戻る`;
    },
  },
  {
    // ⚠ 年代の頭を細くする。狭い画面ほど地図が見えなくなるため。
    //   実測（2026-08-19・320幅・1936–42 の段）: 箱が画面の **82%** を占めていた。
    //     年代 76px（⚠ 2 行に割れて 38px 損）／但し書き 69px／いまのもの 42px／押すと 30px
    // ⚠ **押せる大きさ 44×44 は削らない**（掟）。削るのは見た目の幅だけ。
    // ⚠ 「表示中」は消すが、**出ていないときは必ず名乗る**
    //   （「出ていないものを表示中と言わない」で入れた性質。崩さない）。
    // ⚠ **畳む仕掛けは 2026-08-22 に無くなった**（年代の箱ごと #timePanel へ寄せ、
    //   ⚠ 帯の畳みボタンも Owner 判断で消した）。⚠ **戻っていないことを、ここで見る。**
    //   ⚠ **「消した」だけの検査にしない**（verify §5）。⚠ **残っている押しどころ（‹ ›）が
    //   44px を割っていないこと**と対で見る。
    name: "年代の頭を細くしても、押せる大きさと名乗りは残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const at = (k) => page.evaluate((k) => {
        const s = document.getElementById("t");
        if (Number(s.max) < k * 100) return false;
        s.value = String(k * 100); s.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }, k);
      const read = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right),
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        // ⚠ 文字が本当に箱に収まっているか。**枠ではなく文字の実寸**で見る
        const y = document.querySelector("#timePanel .y");
        const rng = document.createRange(); rng.selectNodeContents(y);
        const tr = rng.getBoundingClientRect();
        const box = document.getElementById("timePanel").getBoundingClientRect();
        const kick = document.querySelector("#timePanel .kick");
        return { y: g("#timePanel .y"), prev: g("#rlPrev"), next: g("#rlNext"),
          // ⚠ 畳む仕掛けが**戻っていないこと**。⚠ 1 つでもあれば数に出る
          // ⚠ **数えるのは年代の器の中だけ**（2026-08-23）。⚠ **画面全体から数えると、
          //   ⚠ 板の開閉（`#toggle`）と補足の ? （`#noteHelp`）まで拾う**（⚠ 実際に拾った）。
          //   ⚠ **主題は「年代の畳み」。**⚠ **別の id で作り直されても捕まえる**ため
          //     ⚠ `[aria-expanded]` は残す。⚠ **範囲を `#hud` に絞る。**
          toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
          textW: Math.round(tr.width), boxRight: Math.round(box.right), textRight: Math.round(tr.right),
          kickText: kick ? kick.textContent.trim() : null,
          eraH: Math.round(box.height) };
      });
      // ---- ① どの段でも、年代は 1 行で、箱からはみ出さない ----
      const heights = [];
      for (let k = 0; k < 9; k++) {
        if (!await at(k)) break;
        await page.waitForTimeout(250);
        const r = await read();
        must(r.y.h <= 46, `年代「${r.y.t}」が 2 行に割れている（${r.y.h}px）。そのぶん地図が減る`);
        must(r.textRight <= r.boxRight, `年代「${r.y.t}」が箱からはみ出している`);
        // ⚠ **普段は名乗らない。**出ているのが当たり前のときに主役から目を奪わない
        must(!r.kickText, `届いているのに「${r.kickText}」と名乗っている`);
        heights.push(r.eraH);
      }
      must(heights.length >= 4, `段が少なすぎて検査にならない（${heights.length}）`);

      // ---- ② 畳む仕掛けは戻っていない。⚠ 残っている押しどころは 44px を割らない ----
      const r = await read();
      // ⚠ **畳む仕掛けは 2026-08-22 に消した。**⚠ 戻すと、また「押しても何が起きるか
      //   分からない ⌄」が増える（利用者役 4 名で、押す前に伝わったのは 2/4 だった）。
      //   ⚠ `[aria-expanded]` まで数えるのは、⚠ **別の id で作り直されても捕まえるため。**
      must(r.toggles === 0,
        `畳む仕掛けが戻っている（${r.toggles} 個）。年代の箱ごと #timePanel へ寄せ、帯の畳みも消したはず`);
      // ⚠ **対で見る。**⚠ 「消した」だけだと、⚠ **押しどころを全部消しても緑になる**
      for (const [nm, x] of [["‹（前の年代）", r.prev], ["›（次の年代）", r.next]]) {
        must(x, `${nm} が無い（狭い幅の年代操作が消えている）`);
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
      }
      return `320 幅・全 ${heights.length} 段とも年代は 1 行で箱に収まる`
        + `／#timePanel ${Math.min(...heights)}〜${Math.max(...heights)}px`
        + `／畳む仕掛け 0 個／‹ › ${r.prev.w}×${r.prev.h}px`;
    },
  },
  {
    // ⚠ **根拠を全画面で読んでいる最中に、地図へ戻る手段が消えてはいけない。**
    //   実測（2026-08-18・375×667）: ✕ はパネルの中で position:absolute だったので、
    //   パネルと一緒に流れて **400px スクロールで y=-298**（画面外）。
    //   押した座標には**何も無かった**（掟: 押しても何も起きない導線を置かない）。
    //   ⚠ 残る「← 今昔へ」はトップへ帰る**別の操作**なので、代わりにならない。
    // ⚠ 直し方は「位置を固定値で足す」ではなく、**同じ積み上げに入れる**
    //   （CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」）。
    name: "根拠を全画面で読んでも、戻る 2 つが上に残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **✕ は消え、⚠ 同じ的が字を変える**（2026-08-23。Owner 判断）。
      //   ⚠ **主張を引き継ぐ**: ⚠ **地図を見ているときに「戻る」と名乗らない**
      //     （⚠ 押しても何も起きない導線を置かない。ADR 0026）。
      const beforeOpen = await page.evaluate(() => ({
        label: (document.getElementById("toggle").innerText || "").replace(/\s+/g, " ").trim(),
        expanded: document.getElementById("toggle").getAttribute("aria-expanded") }));
      must(beforeOpen.expanded === "false",
        `小さい状態で始まっていない: aria-expanded=${beforeOpen.expanded}`);
      must(!/戻る/.test(beforeOpen.label),
        `地図を見ているのに「戻る」と名乗っている: ${beforeOpen.label}`);

      await page.click("#toggle");
      await settleAfterClick(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            inView: r.top >= 0 && r.bottom <= innerHeight,
            // ⚠ 矩形だけでは足りない。**その座標を誰が受け取るか**で見る
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        const pan = document.getElementById("panel");
        // ⚠ **戻る的は `#toggle`（▴ 地図に戻る）**（2026-08-23。⚠ ✕ は消えた）
        return { back: g("#back"), close: g("#toggle"), scrollH: pan.scrollHeight, viewH: innerHeight };
      });
      const a = await look();
      must(a.close, "「▴ 地図に戻る」が無い");
      // ⚠ 指で押せる大きさ
      for (const [nm, b] of [["← 今昔へ", a.back], ["▴ 地図に戻る", a.close]]) {
        must(b.w >= 44 && b.h >= 44, `${nm} が指で押せない（${b.w}×${b.h}）`);
        must(b.hit === (nm === "← 今昔へ" ? "back" : "toggle"),
          `${nm} を押しても、当たるのは「${b.hit}」`);
      }
      // ⚠ 2 つは離れていること。以前 10px まで詰まって 3/3 が苦情を出した
      must(a.close.x - a.back.right >= 80,
        `2 つが近すぎる（間隔 ${a.close.x - a.back.right}px）。押し間違える`);

      // ⚠ **本題。** パネルの中身より深くスクロールしても、両方が残る
      must(a.scrollH > a.viewH, `中身が画面に収まっていて、スクロールの検査にならない`);
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 400; });
      await page.waitForTimeout(400);
      const b = await look();
      for (const [nm, x] of [["← 今昔へ", b.back], ["▴ 地図に戻る", b.close]]) {
        must(x.inView, `スクロールしたら ${nm} が画面から出た（y=${x.y}）`);
        must(x.hit === (nm === "← 今昔へ" ? "back" : "toggle"),
          `スクロール後に ${nm} を押しても、当たるのは「${x.hit}」`);
      }
      // ⚠ 帯が中身を覆っていないこと。**いちばん上まで戻してから**見る。
      //   ⚠ スクロールしたあとで見て取りこぼした（中身が上へ逃げているので当たらない）。
      //   ⚠ 余白を外すと、地名と答え（99.6%）がそのまま帯の下に入る（実測 2026-08-19）。
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 0; });
      await page.waitForTimeout(300);
      const under = await page.evaluate(() => {
        // ⚠ **`#chrome` は消えた**（2026-08-22）。⚠ **帯は板の中の `.chrome-row`。**
        const bar = document.querySelector("#panel .chrome-row").getBoundingClientRect();
        const hit = [];
        for (const el of document.querySelectorAll("#panel #placeName, #panel #landAll, #panel #result")) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.top < bar.bottom && r.bottom > bar.top && r.left < bar.right && r.right > bar.left)
            hit.push(`${el.id} y=${Math.round(r.top)}`);
        }
        return { hit, barBottom: Math.round(bar.bottom) };
      });
      must(!under.hit.length,
        `帯が中身を覆っている（帯の下端 ${under.barBottom} / ${under.hit.join("、")}）`);

      // ⚠ **▴ を押したら本当に地図へ戻る**（2026-08-23。⚠ ✕ は消えた）
      await page.click("#toggle");
      await settleAfterClick(page);
      const closed = await page.evaluate(() => ({
        hidden: !document.getElementById("panel").classList.contains("open"),
        label: (document.getElementById("toggle").innerText || "").replace(/\s+/g, " ").trim() }));
      must(closed.hidden, "▴ を押しても小さくならない");
      must(!/戻る/.test(closed.label), `小さくしたのに「戻る」と名乗っている: ${closed.label}`);
      return `← x=${a.back.x}..${a.back.right} ／ ✕ x=${a.close.x}..${a.close.right}（間隔 ${a.close.x - a.back.right}px）`
        + ` ／ 中身 ${a.scrollH}px を 400px スクロールしても両方 y=${b.back.y}・${b.close.y} で残る`;
    },
  },
  {
    // ⚠ **落ちたことを実際に観測できたときだけ「読み込めませんでした」と言う。**
    //   実測（2026-08-18・tmp/probe-map-error.mjs・豊洲）。拾えるものは落とし方で違う:
    //     404（写真が無い） … map.on("error") が来ない（MapLibre は 404 を異常と見なさない）
    //     403（拒否）       … 106 回。status 403
    //     通信断            … 76 回。status 0
    //   ⚠ **404 は「遅い」と区別できない。** だから 404 は「まだ出ていません」に留める。
    // ⚠ 接続の話は、こちらが知っている範囲でしか言わない。
    //   圏外だと端末が言っているときだけ言い切り、つながっているなら「確認してください」。
    name: "落ちたと分かったときだけ、そう言う（404 は断定しない）", path: `/peel?${TOYOSU}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href),
      (r) => r.abort("connectionrefused")),
    async check(page) {
      // ⚠ **時間ではなく、接続の断りが出たことを待つ。**
      //   ⚠ 断りが出たことだけを待ち、⚠ **何と書いてあるかは下で確かめる**（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => (document.querySelector("#timePanel .era-net")?.textContent.trim() ?? "") !== "",
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const e = document.getElementById("timePanel");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), y: t(".y"), s: t(".s"), net: t(".era-net") };
      });
      must(/読み込めませんでした/.test(r.s), `落ちたのに、そう書いていない: ${r.s}`);
      must(/通信できません/.test(r.s), `観測した理由が書かれていない: ${r.s}`);
      // ⚠ つながっている（onLine=true）ので、言い切らない
      must(r.net === "接続を確認してください",
        `つながっているのに「${r.net}」と言い切っている`);
      must(!/が無い|存在しません/.test(r.s + r.net), `落ちたことを「無い」と書いている: ${r.s}`);
      must(r.y === "現在", `どの年代を見ているのかが消えた: ${r.y}`);
      return `${r.kick} / ${r.y} / ${r.s} ＋${r.net}`;
    },
  },
  {
    // ⚠ **404 は「読み込めませんでした」と言わない。**
    //   MapLibre が error を出さないので、こちらは「遅い」のか「その写真が無い」のかを
    //   知らない。知らないことを断定しない（掟: 取得できなかった ≠ 存在しなかった）。
    name: "404 のときは、理由を断定しない", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href),
      (r) => r.fulfill({ status: 404, body: "" })),
    async check(page) {
      await page.waitForTimeout(3500);
      const r = await page.evaluate(() => {
        const e = document.getElementById("timePanel");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), s: t(".s"), net: t(".era-net") };
      });
      must(r.kick !== "表示中", `出ていないのに「${r.kick}」と言っている`);
      must(!/読み込めませんでした/.test(r.s),
        `404 は observe できていないのに「読み込めませんでした」と断定している: ${r.s}`);
      must(!r.net, `理由を知らないのに接続のせいにしている: ${r.net}`);
      must(!/が無い|ありません|存在しません/.test(r.s), `「無い」と言い切っている: ${r.s}`);
      return `${r.kick} / ${r.s}（接続の話はしない）`;
    },
  },
  {
    // ⚠ 圏外だと端末が言っているときだけ、言い切ってよい。
    name: "圏外のときだけ、接続していないと言い切る", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
      await page.route((u) => /seamlessphoto/.test(u.href), (r) => r.abort("connectionrefused"));
    },
    async check(page) {
      // ⚠ **時間ではなく、接続の断りが出たことを待つ。**
      //   ⚠ 断りが出たことだけを待ち、⚠ **何と書いてあるかは下で確かめる**（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => (document.querySelector("#timePanel .era-net")?.textContent.trim() ?? "") !== "",
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const net = await page.evaluate(() =>
        document.querySelector("#timePanel .era-net")?.textContent.trim() ?? "");
      must(/接続していません/.test(net), `圏外なのに「${net}」に留めている`);
      return `圏外 → 「${net}」`;
    },
  },
  {
    // ⚠ **出ていないものを「表示中」と言わない。**
    //   実測（2026-08-18）: 地表のタイルを落としても画面はいちばん大きい文字で
    //   「表示中 現在 / 最新の空中写真」と言い続けた。写真は 1 枚も出ていないのに。
    //   利用者役 3/3 が「これが主犯」「間違ったことを自信満々に書いている画面は、
    //   他の記述も疑わしくなる」と答えた。
    // ⚠ **すぐには切り替えない。**実測（tmp/probe-ground-arrival.mjs）:
    //   通常回線は 69ms〜403ms で届く。すぐ切り替えると段を送るたびに光る。
    //   1.2 秒たっても来ていないときだけ言う。
    name: "出ていない地面を「表示中」と言わない", path: `/peel?${TOYOSU}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href), async (r) => {
      await new Promise((k) => setTimeout(k, 6000));
      await r.continue();
    }),
    async check(page) {
      const read = () => page.evaluate(() => {
        const e = document.getElementById("timePanel");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), y: t(".y"), s: t(".s") };
      });
      // ① 地表が来ていないあいだ
      await page.waitForTimeout(2500);
      const away = await read();
      must(away.kick !== "表示中",
        `写真が出ていないのに「${away.kick}」と言っている`);
      must(!/空中写真$/.test(away.s),
        `出ていない写真を、出ているように書いている: ${away.s}`);
      // ⚠ 理由は知らない。断定しない
      must(!/読み込めませんでした|取得できませんでした/.test(away.s),
        `落ちたのか、まだなのかを知らないのに断定している: ${away.s}`);
      must(!/通信|電波|接続/.test(away.s), `通信のせいにしている: ${away.s}`);
      // ⚠ 段そのものは選ばれている。年は消さない
      must(away.y === "現在", `どの年代を見ているのかが消えた: ${away.y}`);
      // ② ⚠ **届いたら、元に戻る。**
      //   ⚠ 6 秒と決め打たず、⚠ **名乗りが消えたこと**（＝届いた合図）を待つ。
      //   ⚠ 説明が戻っているかは下で確かめる（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => !(document.querySelector("#timePanel .kick")?.textContent.trim() ?? ""),
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const back = await read();
      // ⚠ **届いたら名乗らない**（2026-08-19 に変えた）。名乗るのは出ていないときだけ。
      //   ⚠ 守りたいのは「出ていないものを表示中と言わない」ほうで、名乗りの有無ではない。
      must(!back.kick, `届いたのに「${back.kick}」と名乗っている（普段は名乗らない）`);
      must(/空中写真/.test(back.s), `届いたのに説明が戻っていない: ${back.s}`);
      return `届いていないあいだ「${away.kick} ${away.y} / ${away.s}」`
        + ` → 届いたら「${back.kick} ${back.y} / ${back.s}」`;
    },
  },
  {
    // ⚠ **普通につながっている人には、一度も出さない。**
    //   実測（tmp/probe-ground-arrival.mjs・2026-08-18）: 現在 69ms・段の切替 0〜403ms。
    //   猶予（1.2 秒）を外すと、段を送るたびに 0〜0.4 秒だけ「まだ出ていません」が光る。
    // ⚠ 320 幅では 2 行になる。隣（閉じる）と重ならないことまで見る。
    name: "普通につながっていれば「まだ出ていません」は出ない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 },
    async check(page) {
      await peelReady(page);
      const seen = await page.evaluate(async () => {
        const e = document.getElementById("timePanel"), hit = [];
        // 段を全部送りながら、名乗りを拾い続ける
        for (let k = 0; k < 9; k++) {
          const s = document.getElementById("t");
          if (Number(s.max) < k * 100) break;
          s.value = String(k * 100); s.dispatchEvent(new Event("input", { bubbles: true }));
          for (let i = 0; i < 40; i++) {
            hit.push(e.querySelector(".kick").textContent.trim());
            await new Promise((r) => setTimeout(r, 25));
          }
        }
        return [...new Set(hit)];
      });
      // ⚠ 普通につながっていれば、**一度も名乗らない**（＝空のまま）
      must(seen.join("／") === "",
        `普通につながっているのに「${seen.join("／")}」が出た（猶予が効いていない）`);
      // 重なりを見る。⚠ 矩形だけでは足りない。その座標を誰が受け取るかで見る
      // ⚠ **相手は「閉じる」から、⚠ カードそのものへ変わった**（2026-08-22。畳みボタンを消した）。
      //   ⚠ 守りたいのは同じ「名乗りが何かに食われていないこと」。
      //   ⚠ **中身がカードの内側に収まっているか**を、右端で見る。
      const lap = await page.evaluate(() => {
        const e = document.getElementById("timePanel");
        const s = e.querySelector(".s").getBoundingClientRect();
        const card = e.getBoundingClientRect();
        const who = document.elementFromPoint(Math.round(s.x + s.width / 2), Math.round(s.y + s.height / 2));
        return { taken: who?.className || who?.id || who?.tagName,
          // ⚠ その座標を受け取るのが、⚠ **カードの中の要素であること**
          inCard: !!who && !!who.closest("#timePanel"),
          right: Math.round(s.right), cardRight: Math.round(card.right), W: innerWidth };
      });
      must(lap.inCard, `名乗りの座標を、カードの外の「${lap.taken}」が受け取っている`);
      must(lap.right <= lap.cardRight,
        `名乗りがカードからはみ出している（右端 ${lap.right} / カード ${lap.cardRight}）`);
      must(lap.right <= lap.W, `名乗りが画面からはみ出している（右端 ${lap.right} / 幅 ${lap.W}）`);
      return `320 幅で段を 9 つ送っても一度も名乗らない／`
        + `右端 ${lap.right} ≦ カード ${lap.cardRight} ≦ 幅 ${lap.W}`;
    },
  },
  {
    // ⚠ **古い呼び出しが、あとから新しい結果を上書きしないこと。**
    //   loadArea は 7 つの await を挟んでから area / statusEl / 地図のデータを書く。
    //   2026-08-18 まで seq は取るだけで一度も見ておらず、番人が居なかった。
    //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出るが、
    //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
    // ⚠ 相手先の速さに任せない。**こちらで 6 秒遅らせて**、確実に追い越させる。
    name: "前の場所の結果が、あとから今の場所を上書きしない", path: `/peel?${NAGOYA_LL}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く（過去に一度踏んでいる）
    setup: (page) => page.route((u) => /overpass/.test(u.href), async (r) => {
      await new Promise((k) => setTimeout(k, 6000));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ elements: [] }) });
      // ⚠ **返したことを、ページ側に印として残す。**
      //   ⚠ 下で「何秒たったか」ではなく「**古い返事が実際に返ったか**」を待つため。
      //   ⚠ 移動中は evaluate が落ちる。落ちても検査の主張は変わらない（下で待ち切れる）
      await page.evaluate(() => { window.__staleReplied = true; }).catch(() => {});
    }),
    async check(page) {
      // ① 札幌が、建物の問い合わせで待ち始めるまで待つ
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      await page.waitForFunction(
        () => /建物を取得しています|建物を取得中/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 30000 });
      // ② 待っている最中に、別の場所へ移る（＝再試行を押したのと同じ形）
      await page.evaluate(() => { loadArea(139.7975, 35.6548, "東京都江東区豊洲"); });
      await page.waitForFunction(
        // ⚠ **出そろってから比べる。**層は別々に返るので、途中で読むと
        //   「あとから第1層が増えた」のを上書きと取り違える（実測 2026-08-19）。
        //   ⚠ 見ている主張は変えていない: **古い呼び出しが今の答えを消さないこと**。
        // ⚠ **PC で答えを持つのは #landAll（パネル）**（2026-08-20。hidetzu/konjaku#131）。
        //   ⚠ #land は HUD で、⚠ **パネルが開いているあいだは描かれない。**
        //   ⚠ 見ている主張は変えていない: **古い呼び出しが今の答えを消さないこと**。
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? "")
          && typeof landform !== "undefined" && landform !== null,
        null, { timeout: 60000 });
      // ⚠ **PC ではパネル（#landAll）が答えを持つ**（同上）
      const mid = await page.locator("#landAll").textContent();
      // ③ ⚠ **古い呼び出しの返事が、実際に返ってくるまで待つ。**
      //   ⚠ 決め打ちの秒数ではなく、返ったことを見る（上の印）。
      //   ⚠ **返る前に読むと、この検査は何も見ていないことになる**
      await page.waitForFunction(() => window.__staleReplied === true,
        null, { timeout: 30000 });
      // ⚠ **ここは 300ms では足りない。**印が立つのは「返した」時点で、
      //   ⚠ **上書きするかもしれない側の処理は、そのあとに走る**。
      //   ⚠ 早く読むと「上書きされなかった」ではなく「まだ上書きしていない」を見てしまう
      await page.waitForTimeout(1000);
      const land = await page.locator("#landAll").textContent();
      const status = await page.locator("#status").textContent();
      must(/足元[^。]*を判定できた/.test(land),
        `前の場所の返事が、いまの答えを消した: ${land.replace(/\s+/g, " ").slice(0, 80)}`);
      must(land.replace(/\s+/g, "") === mid.replace(/\s+/g, ""),
        `答えが書き換わった: ${mid.replace(/\s+/g, " ").slice(0, 60)} → ${land.replace(/\s+/g, " ").slice(0, 60)}`);
      must(!/まだ用意できていません|建物ごとには出せません|OSM に登録された建物は 0 件/.test(status),
        `前の場所の説明が、いまの場所の欄に出ている: ${status.replace(/\s+/g, " ").slice(0, 90)}`);
      return `名古屋が 6 秒待っている最中に豊洲へ移り、返事が返ったあとも `
        + `${land.replace(/\s+/g, " ").trim().slice(0, 40)}／説明も豊洲のまま`;
    },
  },
  {
    // 描画は「変わる速さ」で分けてある（peel3d.js の paint / describe）。
    // ⚠ 分ける前の実測（2026-08-18・豊洲・1280×900）:
    //   再生 1 回（11.1 秒）で台帳（17 要素）を **299 回**作り直していた。
    //   段は 9 つしかないので、298 回は同じものを組み直していたことになる。
    //
    // ⚠ **「作り直さない」だけを見ると、更新を止めても緑になる。**
    //   だから 2 つを対にして見る:
    //     同じ段の中で動かす → 作り直さない（言葉は変わらないので）
    //     隣の段へ移る       → 必ず作り直す（言葉が変わるので）
    //   片方だけでは、どちらの壊れ方も見つけられない。
    name: "同じ段で動かしても根拠は組み直さず、段が変われば必ず組み直す", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ 地表のタイルが届くと台帳は**正しく**組み直る。数え始める前に落ち着かせる
      await page.waitForTimeout(4000);
      const watch = () => page.evaluate(() => {
        window.__provHits = 0;
        window.__provObs?.disconnect();
        window.__provObs = new MutationObserver((rs) => { window.__provHits += rs.length; });
        // ⚠ **段で変わるのは第2層の材料**（⚠ 「地表はその年代の空中写真そのもの」）。
        //   ⚠ **第3層（建物）は段に依らない**ので、⚠ **そちらを見ると必ず 0 回になる**
        //     （⚠ 2026-08-23 に踏んだ。⚠ **「組み直していない」が理由もなく緑**）。
        window.__provObs.observe(document.querySelector('#panel .prov-q[data-q="2"]'),
          { childList: true, subtree: true, characterData: true });
      });
      // ⚠ **数えるのは、動かし終えて 1 呼吸おいてから。** MutationObserver の通知は
      //   マイクロタスクなので、同じ evaluate の中で読むと**必ず 0**になる。
      //   最初これで書いて、「組み直していない」が理由もなく緑になった（2026-08-18）。
      const scrub = async (from, to, n) => {
        const r = await page.evaluate(([from, to, n]) => {
          const s = document.getElementById("t");
          for (let k = 0; k <= n; k++) {
            s.value = String(from + (to - from) * k / n);
            s.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return { label: document.querySelector("#timePanel .y").textContent,
                   knob: document.querySelector("#track .knob").style.left };
        }, [from, to, n]);
        await page.waitForTimeout(200);
        return { ...r, hits: await page.evaluate(() => window.__provHits) };
      };

      // ---- ① 同じ段の中を 40 回動かす。言葉は変わらないので、組み直してはいけない ----
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(300);
      await watch();
      const a = await scrub(0, 40, 40);
      must(a.hits <= 2, `同じ段の中で動かしただけで、根拠を ${a.hits} 回組み直している`
        + `（40 回動かした。分ける前はこれが 40 回だった）`);
      // ⚠ 動いていないから組み直していない、では意味がない。**絵は毎回動いている**
      must(a.knob !== "" && a.knob !== "0%", `つまみが動いていない（${a.knob}）。絵まで止めている`);

      // ---- ② 隣の段へ移る。言葉が変わるので、必ず組み直す ----
      const before = a.label;
      await watch();
      const b = await scrub(40, 100, 12);
      must(b.label !== before, `段を移ったのに年代の表示が ${before} のまま`);
      must(b.hits >= 1, `段が変わったのに根拠を組み直していない（${b.hits} 回）`
        + `。⚠ 出所が古いまま残る`);
      // ⚠ 段を 1 つ移っただけで 12 回組み直していたら、分けた意味が無い
      must(b.hits <= 4, `段を 1 つ移るのに根拠を ${b.hits} 回組み直している`);

      // ---- ③ 組み直したあとも、押せるボタンが生きている ----
      //   ⚠ 台帳の中のボタンは組み直すたびに**新しい要素**になる。張り直しを忘れると、
      //     押しても何も起きないボタンになる（掟: 押しても何も起きない導線を置かない）。
      const peek = await page.$("#panel .prov-q .peek");
      must(peek, "台帳に「光らせる」ボタンが無い");
      const colorBefore = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
      const box = await peek.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(150);
      const colorDown = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await page.mouse.up();
      await page.waitForTimeout(150);
      const colorUp = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      must(colorDown !== colorBefore, "組み直したあと、光らせるボタンが効いていない");
      must(colorUp === colorBefore, "離しても色が戻っていない（別の意味の色が居座る）");
      return `同じ段で 40 回動かして組み直し ${a.hits} 回（つまみは ${a.knob} まで動いた）`
        + ` ／ 段を 1 つ移って ${b.hits} 回（${before} → ${b.label}）`
        + ` ／ 組み直したあとも光らせるボタンは効く`;
    },
  },
  {
    // ⚠ **根拠は、地図を中途半端に覆いながら読ませない。**
    //   実測（2026-08-18・`tmp/probe-panel-open-sp.mjs`。パネルを開いた状態）:
    //
    //     幅        パネルの占有   地図に触れる帯   ＋− の被覆
    //     375×667      54%          **0px**         89%
    //     344×882      53%           10px           89%
    //     320×640      53%          **0px**         89%
    //
    //   ⚠ **画面の中心（＝いま調べている地点）を受け取るのは台帳だった**（地図ではない）。
    //   ⚠ 指で押せるよう 44px に広げたズームが、開いた瞬間に押せなくなっていた。
    //
    //   → スマホでは「根拠を読むあいだは全画面」にした。地図を触るのと根拠を読むのは、
    //     同時にやる操作ではない。⚠ PC は左の縦パネルのまま（変えるのは見せ方だけ）。
    //
    // ⚠ **「閉じれば地図に戻れること」まで見る。** 全画面にしただけで戻れなければ、
    //   0px の状態と変わらない（掟: 押しても何も起きない導線を置かない）。
    // ⚠ **戻る手段を 2 つとも見る。** ✕ は「根拠を閉じて地図へ」、
    //   ← は「今昔へ帰る」で**別の操作**。全画面にしたとき ← が下敷きになった（実測）。
    name: "スマホの根拠は全画面で読み、閉じれば地図に戻る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const pan = document.getElementById("panel");
        const pr = pan.getBoundingClientRect();
        const open = pan.classList.contains("open");
        const box = (sel) => { const e = document.querySelector(sel);
          if (!e) return null; const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
                   x: Math.round(r.x), y: Math.round(r.y) }; };
        // その座標を実際に受け取るのは誰か。⚠ 地図かどうかは **#map の中か**で見る
        //   （className を文字にすると SVG は "[object SVGAnimatedString]" になる。一度踏んだ）
        const map = document.getElementById("map");
        const who = (x, y) => { const e = document.elementFromPoint(x, y);
          if (!e) return { inMap: false, name: "無い" };
          return { inMap: !!map && map.contains(e),
                   name: e.id || e.tagName.toLowerCase() }; };
        return { open,
          cover: open ? Math.round(pr.width * pr.height / (W * H) * 100) : 0,
          center: who(Math.round(W / 2), Math.round(H / 2)),
          // ⚠ **2026-08-21 に、⚠ 答えの板（#land）が無くなった**（hidetzu/konjaku#152）
          land: document.querySelectorAll("#land").length,
          // ⚠ **✕ は消えた**（2026-08-22）。⚠ **戻る的は `#toggle`（▴ 地図に戻る）。**
          close: box("#toggle"), back: box("#back"),
          zoom: box(".maplibregl-ctrl-group"),
          // ⚠ **箱があるだけでは「見えている」ではない。**その座標を自分が受け取るかまで見る
          //   （矩形は覆われていても返る。このリポジトリが何度も踏んでいる）
          backOnTop: (() => { const e = document.getElementById("back");
            if (!e) return false; const r = e.getBoundingClientRect();
            const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
            return !!t && (e === t || e.contains(t)); })() };
      });
      // (1) 閉じている初期状態: 答えは地図の上に出ていて、地図の中心は地図が受け取る
      const shut = await look();
      must(!shut.open, "スマホでパネルが開いて始まっている（地図が見えない）");
      // ⚠ **前の主張**: 「⚠ 閉じている初期状態でも、⚠ 答えの板が地図の上に出ている」。
      //   ⚠ 2026-08-21 に Owner が「⚠ 土地の答えは HUD では見せない」と決めた
      //     （hidetzu/konjaku#152）。⚠ **板そのものが無くなった。**
      //   ⚠ **主張は引き継ぐ**: ⚠ **閉じているあいだ、⚠ 地図の中心は地図が受け取る**
      //     （⚠ 調べている地点が見える）。⚠ **板が戻っていないこと**も見る。
      must(shut.land === 0, "答えの板（#land）が戻っている（土地の答えはパネルの 1 か所）");
      must(shut.center.inMap,
        `閉じているのに、画面の中心（＝調べている地点）を地図が受け取っていない: ${shut.center.name}`);
      // (2) 開いたら**全画面**。中途半端に覆わない
      await page.click("#toggle");
      await settleAfterClick(page);
      const open = await look();
      must(open.open, "☰ を押しても開かない");
      must(open.cover >= 95,
        `根拠が地図を中途半端に覆っている: 画面の ${open.cover}%（全画面にするか、覆わないかの二択）`);
      // ⚠ 戻る手段が 2 つとも、指で押せる大きさで見えていること
      must(open.close && open.close.h >= 44 && open.close.w >= 44,
        `根拠を閉じる ✕ が指で押せない: ${JSON.stringify(open.close)}`);
      must(open.back && open.back.h >= 44 && open.back.y >= 0 && open.back.y < 200,
        `全画面で「← もどる」が指で押せる大きさで無い: ${JSON.stringify(open.back)}`);
      // ⚠ **覆われていないことまで見る。**矩形だけ見ていたときは、
      //   パネルの下敷きにしても緑のままだった（2026-08-18 に壊して気づいた）
      must(open.backOnTop,
        "全画面で「← もどる」がパネルの下敷きになっている（戻る手段は常に見えている場所に）");
      // (3) 小さくすれば地図に戻る
      await page.click("#toggle");
      await settleAfterClick(page);
      const again = await look();
      must(!again.open, "▴ を押しても小さくならない");
      must(again.center.inMap,
        `閉じたのに地図へ戻っていない（中心を受け取るのが ${again.center.name}）`);
      must(again.zoom && again.zoom.h >= 44, `閉じてもズームが押せる大きさで出ていない: ${JSON.stringify(again.zoom)}`);
      // (4) ⚠ **← と ✕ の行き先が、押す前に分かること。**
      //   利用者役 3/3 が「どちらが今の場所を捨てるボタンか分からない」「怖いので押さない」
      //   と答えた（両方とも「もどる」系の見た目だったため）。
      //   ⚠ 字が出ているだけでなく、**2 つが違う字**であること。
      await page.click("#toggle"); await page.waitForTimeout(600);
      //   ⚠ **記号（← / ▴）を落としてから比べる。**落とさずに比べると、
      //     行き先の字が同じでも記号の差で「違う」になり、この検査は何も見ていない
      //     （2026-08-18 に壊して気づいた）。
      // ⚠ **狭い幅では「← 今昔へ」の字を隠した**（2026-08-23。Owner 判断。⚠ 幅を空けるため）。
      //   ⚠ **主張は「⚠ 2 つの行き先が、⚠ 押す前に区別できること」**（⚠ 利用者役 3/3 が
      //     ⚠ 「どちらが今の場所を捨てるか分からない」「怖いので押さない」と答えたのが元）。
      //   ⚠ **見えている字が消えたので、⚠ 名乗り（`aria-label` / `title`）で見る。**
      //   ⚠ **記号（← / ▴）を落としてから比べる**（⚠ 落とさないと記号の差で常に「違う」になる）。
      const label = await page.evaluate(() => {
        const word = (id) => { const e = document.getElementById(id); if (!e) return "";
          return (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || "")
            .replace(/[←✕×▴▾\s]/g, ""); };
        return { back: word("back"), close: word("toggle") };
      });
      must(label.back.length > 1 && label.close.length > 1,
        `全画面で、戻る手段の行き先が名乗られていない: ← 「${label.back}」／▴ 「${label.close}」`);
      must(label.back !== label.close,
        `← と ✕ の行き先が同じ字になっている: どちらも「${label.back}」`);
      // (5) ⚠ **「光らせる」を押したら、光る先（地図）が見えること。**
      //   全画面のままだと、押しても何も起きないボタンになる（3/3 が「二度と押さない」）。
      const peek = page.locator("#peekH");
      if (await peek.count()) {
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const box = await peek.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        const held = await page.evaluate(() => ({
          open: document.getElementById("panel").classList.contains("open"),
          inMap: (() => { const m = document.getElementById("map");
            const e = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
            return !!m && !!e && m.contains(e); })(),
        }));
        await page.mouse.up();
        must(!held.open && held.inMap,
          "「光らせる」を押しても全画面のままで、光る先の地図が見えない"
          + `（パネル開=${held.open} / 中心は地図=${held.inMap}）`);
      }
      return `閉じ: 答えの板は無い・中心は地図 ／`
        + ` 開き: 画面の ${open.cover}%・「${label.close}」${open.close.w}×${open.close.h}px・`
        + `「${label.back}」${open.back.w}×${open.back.h}px ／`
        + ` 光らせると地図が出る ／ 閉じ直し: 中心は地図・ズーム ${again.zoom.h}px`;
    },
  },
  {
    // ⚠ **狭い幅の年代は「ものさし」**（2026-08-19）。ドラムを置き換えた。
    //   ⚠ ここは「横ドラムロール」を守っていた検査を**置き換えたもの**。
    //     消したのではなく、**守る目的が変わった**ので書き直している。
    //
    // 直したかったのは「どこまで遡れるか分からない」ほう。実測（2026-08-19・豊洲）:
    //   ⚠ 9 段のうち画面に入っていたのは 375 幅で 2 個・**320 幅で 1 個**だけ。
    //   ⚠ 「明治期」は x=877（375）／x=849（320）＝ **どちらも画面の外**。
    //   利用者役「せいぜい昭和の終わりまでかな、と思いました」。
    //
    // ⚠ ドラムのときに実測で否定された 5 つは、ものさしでも起こしてはいけない。
    //   引き継いで見る（形は変わっても、失敗の中身は同じ）:
    //   1. 印が中身と一緒に流れる → ⚠ ものさしのつまみは軸の中に固定
    //   2. box-sizing が無く、的が太って印と食い違う → ⚠ 的の実寸を見る
    //   3. transform で膨らむ → 同上
    //   4. 押しどころが近すぎて誤爆（3/3 が「閉じてしまいそう」）→ ⚠ ‹ › の間隔を見る
    //   5. 文字が隣の部品の真横で切れる（320 で 33px 切れ）→ ⚠ 年と端の名前の切れを見る
    //
    // ⚠ **刻みは的にしない。**320 幅・9 段で 1 段 24px しかなく、44px を割る（掟）。
    //   動かすのは ‹ ›（44×44）と、軸そのもののドラッグ。
    name: "狭い幅の年代は、ものさしで全体が見え、端まで届く", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => typeof steps !== "undefined" && timelineReady,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right),
            w: Math.round(r.width), h: Math.round(r.height),
            cut: e.scrollWidth > Math.ceil(r.width) + 1,
            hit: who ? (who.id || who.closest("[id]")?.id || String(who.className).split(" ")[0]) : "無い" }; };
        const line = document.querySelector("#ruler .rl-line").getBoundingClientRect();
        const ticks = [...document.querySelectorAll("#rlTicks i:not(.rl-cut)")];
        const knob = document.getElementById("rlKnob").getBoundingClientRect();
        return { year: g("#rlYear"), left: g("#rlLeft"), right: g("#rlRight"),
          prev: g("#rlPrev"), next: g("#rlNext"), note: g("#rlNote"),
          nTicks: ticks.length, nSteps: steps.length,
          lastLabel: steps[steps.length - 1].label,
          axis: Math.round(line.width), knobX: Math.round(knob.x + knob.width / 2),
          lineL: Math.round(line.left), lineR: Math.round(line.right),
          meiji: !!document.querySelector("#rlTicks i.rl-meiji"),
          cut: !!document.querySelector("#rlTicks i.rl-cut"),
          // ⚠ **間の段の名前**（hidetzu/konjaku#166）。⚠ 端は left / right が持つ
          inner: [...document.querySelectorAll(".rl-labs span")].map((e) => {
            const r = e.getBoundingClientRect();
            return { t: e.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right),
                     cut: e.scrollWidth > Math.ceil(r.width) + 1 }; }),
          W: innerWidth };
      });
      const a = await look();
      // ---- ① 全段が 1 本の軸にあり、端が画面内 ----
      must(a.nTicks === a.nSteps, `刻みが段の数と合わない（刻み ${a.nTicks} / 段 ${a.nSteps}）`);
      must(a.right.right <= a.W, `右端「${a.right.t}」が画面の外（右 ${a.right.right} / 幅 ${a.W}）`);
      must(a.left.x >= 0, `左端「${a.left.t}」が画面の外`);
      // ⚠ **右端はその地点の最終段。**「明治期」固定にしない（明治期データは 24 地点で 7/24）
      must(a.right.t === a.lastLabel,
        `右端が最終段と違う（右端「${a.right.t}」／最終段「${a.lastLabel}」）`);
      // ⚠ 5 の再発（文字が切れる）
      for (const [nm, x] of [["年", a.year], ["左端", a.left], ["右端", a.right]])
        must(!x.cut, `${nm}「${x.t}」が切れている`);

      // ---- ② 押せるものは 44px。刻みは的にしない ----
      for (const [nm, x] of [["‹", a.prev], ["›", a.next]]) {
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
        must(x.hit === (nm === "‹" ? "rlPrev" : "rlNext"), `${nm} を押しても当たるのは「${x.hit}」`);
      }
      // ⚠ 4 の再発（近すぎて誤爆）
      must(a.next.x - a.prev.right >= 80,
        `‹ と › が近すぎる（間隔 ${a.next.x - a.prev.right}px）。押し間違える`);

      // ---- ③ 明治期は写真ではない。形と仕切りで示す ----
      must(a.meiji, `明治期の印が無い（写真と同じ形に見える）`);
      must(a.cut, `写真と明治期の仕切りが無い`);
      must(/空中写真\s*\d+\s*段/.test(a.note.t), `注記に空中写真の段数が無い: ${a.note.t}`);

      // ---- ③-b ⚠ **動かす前に、全段の年代が読める**（2026-08-22。hidetzu/konjaku#166）----
      //   ⚠ **前は両端だけだった**（実測 2026-08-22・375/344/320 とも名前 2 個・刻み 10 本）。
      //   ⚠ **間引かない。**⚠ 出ていない段があると「その年代は無い」と読まれる（掟 §1。
      //     ⚠ 利用者役 3 名中 2 名が実際にそう読んだ）。
      //   ⚠ **ここが見るのは「実物のページに届いているか」。**
      //     ⚠ **段の数を変えた検査は、コンポーネント単体のほうが持つ**
      //       （⚠ 写真を stub すると、⚠ **どの土地でも 9 段になる**ので実物では変えられない）。
      const named = [a.left, ...a.inner, a.right];
      must(named.length === a.nSteps,
        `動かす前に読める年代が ${named.length} 個しかない（段は ${a.nSteps}）: `
        + named.map((x) => x.t).join("／"));
      must(a.inner.every((x) => x.t), `間の段に空の名前がある: ${a.inner.map((x) => x.t).join("／")}`);
      // ⚠ 5 の再発（切れる）を、間の名前にも
      const cutInner = a.inner.filter((x) => x.cut).map((x) => x.t);
      must(!cutInner.length, `間の年代が切れている: ${cutInner.join("、")}`);
      // ⚠ 隣どうしが重ならないこと（⚠ **読めなくなるのは、出ていないより悪い**）
      const sorted = [...named].sort((x, y) => x.x - y.x);
      const hitNames = sorted.filter((x, i) => i > 0 && x.x < sorted[i - 1].right - 0.5).map((x) => x.t);
      must(!hitNames.length, `年代の名前が重なっている: ${hitNames.join("、")}`);

      // ---- ④ ‹ › で端まで届く。⚠ 1 の再発（つまみが流れる）も見る ----
      const knob0 = a.knobX;
      // ⚠ **無効になったボタンを押しに行かない。** page.click は「押せるようになるまで」
      //   待つので、無効なボタンに 30 秒 × 回数ぶん待ってしまう（実測 2026-08-19: 10 分で打ち切り）。
      //   ⚠ 押せるあいだだけ押す。押せなくなったら、そこが端。
      const tapWhile = async (id, max) => {
        let n = 0;
        for (; n < max; n++) {
          const ok = await page.evaluate((id) => {
            const e = document.getElementById(id);
            if (!e || e.disabled) return false;
            e.click(); return true;
          }, id);
          if (!ok) break;
        }
        await page.waitForTimeout(400);
        return n;
      };
      const tapped = await tapWhile("rlNext", 20);
      must(tapped >= a.nSteps - 1, `› を ${tapped} 回しか押せなかった（段は ${a.nSteps}）`);
      const b = await look();
      must(b.year.t === a.lastLabel, `› を押し続けても最終段に着かない（いま「${b.year.t}」）`);
      must(b.knobX > knob0, `つまみが動いていない（${knob0} → ${b.knobX}）`);
      must(b.knobX <= b.lineR + 2 && b.knobX >= b.lineL - 2,
        `つまみが軸から外れた（${b.knobX} / 軸 ${b.lineL}..${b.lineR}）`);
      // ⚠ 端では、それ以上押せないと分かること
      const disabled = await page.evaluate(() => document.getElementById("rlNext").disabled);
      must(disabled, `最終段なのに › がまだ押せる顔をしている`);
      await tapWhile("rlPrev", 20);
      const c = await look();
      must(c.year.t === "現在", `‹ を押し続けても先頭に戻らない（いま「${c.year.t}」）`);
      return `320 幅・${a.nSteps} 段  軸 ${a.axis}px（1 段 ${Math.round(a.axis / (a.nSteps - 1))}px）`
        + ` ／ 動かす前に読める年代 ${named.length} / ${a.nSteps} 個「${named.map((x) => x.t).join(" ")}」`
        + ` ／ 端「${a.left.t}」「${a.right.t}」とも画面内 ／ ‹ › ${a.prev.w}×${a.prev.h}（間隔 ${a.next.x - a.prev.right}px）`
        + ` ／ ${a.note.t}`;
    },
  },
  {
    // ズームは暗いパネルに載せたせいで黒地に黒になり、実測でボタンの存在すら見えなかった
    name: "さかのぼる（ズームが見えて、指で押せる）", path: `/peel?${TOYOSU}`,
    viewport: { width: 390, height: 844 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      const btns = await page.$$eval(".maplibregl-ctrl-group button", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        const icon = e.querySelector(".maplibregl-ctrl-icon");
        return { w: Math.round(r.width), h: Math.round(r.height),
                 filter: icon ? getComputedStyle(icon).filter : "none" };
      }));
      must(btns.length >= 2, `ズームボタンが無い: ${btns.length}`);
      const small = btns.filter((b) => b.w < 44 || b.h < 44);
      must(!small.length, `指の当たり判定が 44×44 に届かない: ${JSON.stringify(small)}`);
      // 暗い地図の上に濃いアイコンをそのまま置かないこと
      must(btns.every((b) => b.filter !== "none"),
        `アイコンが反転していない（黒地に黒になる）: ${JSON.stringify(btns.map((b) => b.filter))}`);
      return `${btns.length} 個すべて ${btns[0].w}×${btns[0].h}／アイコン反転あり`;
    },
  },
  {
    name: "さかのぼる（3D）", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 水域ポリゴンはタイルを読んで自前で生成する。ここが動かないと作品として成立しない
      // 水域は低湿地タイルを読んで自前で起こす。件数が画面に出るのでそれを待つ
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      //   ⚠ **待っているのは「水域を起こせたこと」**。⚠ **答えが描けたことで見る。**
      await peelReady(page);
      // 建物まで揃うのを待つ。事前計算データがある範囲なので Overpass には出ない。
      // 建物データが画面に出ることが、作品の成立条件（掟: 取れなかったを「無い」と言わない）。
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      await page.waitForFunction(
        () => /\d+\s*件\s*の建物が、この範囲にあります/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const ms = Math.round(await page.evaluate(() => performance.now()));
      // 事前計算データがある範囲では Overpass を叩かない。
      // 本番で 504／無応答が常態のものを、作品の成立条件に置かない（掟: 取れなかったを「無い」と言わない）
      const op = reqs.filter((u) => u.includes("overpass"));
      must(!op.length, `事前計算データがあるのに Overpass を叩いている: ${op[0]}`);
      // ⚠ **水面の面数は「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ 水域ポリゴンが実際に起こされたこと）。⚠ 読む場所だけ変えた。
      // ⚠ **判定の結果（#status）と、由来（#prov）は別の節**になった。⚠ **両方を読む。**
      const status = (await page.locator("#status").textContent()).trim();
      const provTxt = await provText(page);
      const water = Number(provTxt.match(/(\d+)\s*面を起こしたもの/)?.[1] ?? 0);
      must(water > 0, `水域ポリゴンが生成されていない（${provTxt.slice(0, 80)}）`);
      const bld = Number(status.match(/建物\s*(\d+)\s*件/)?.[1] ?? 0);
      must(bld > 0, `建物が出ていない（${status.slice(0, 80)}）`);
      must(/事前に取り込んだデータ|事前計算データ/.test(status),
        `事前に取り込んだデータを使っていない（${status.slice(0, 80)}）`);
      // ⚠ パネルの答えは #landAll（層）へ移った。⚠ 見ている主張は変えていない
      const hero = await page.locator("#landAll").textContent({ timeout: 45000 });
      const cap = hero;
      assertToyosu3dAnswer(hero, cap, "3D");
      // ⚠ ここは長いあいだ、読んで報告に印字するだけで assert が無かった。
      //   08ce46f で潰した「測っていないことを報告する」と同じ形が、
      //   いちばん重要な case に残っていた（2026-08-14 検証者の指摘）。
      const era = (await page.locator("#timePanel .y").textContent()).trim();
      must(era.length > 0, "年代の見出しが空");
      // 着いたときは「現在」側。ここが別のものになったら、名前と中身が食い違っている
      must(era === "現在", `3D に着いた時点の見出しが「現在」でない: 「${era}」`);
      // 通常時は地表の行が「実測」を名乗ること。タイル到達の判定を入れた副作用で
      // ここが未取得のまま固まっていないかを見る（ms の後で測り、性能の数字は汚さない）
      await page.waitForFunction(
        () => [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .some((e) => /地表/.test(e.textContent ?? "") && e.className.includes("ok")),
        null, { timeout: 30000 });
      const msGround = Math.round(await page.evaluate(() => performance.now()));
      // ⚠ **地表は第2層の材料**（2026-08-22）。⚠ **`.prov-q .prov` の最初は第1層。**
      //   ⚠ **札（実測 / 未取得）は消した**（Owner 判断: ⚠ 色で伝わる）。⚠ **字で見る。**
      const ground = await page.evaluate(() =>
        [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((e) => /地表/.test(e.textContent ?? ""))?.textContent ?? "");
      must(/そのもの/.test(ground) && /加工なし/.test(ground),
        `地表の実測表示が出ていない: ${ground.trim().slice(0, 40)}`);
      return `${hero.trim()} ／ 建物 ${bld} 件 ／ 水域 ${water} 面 ／ 年代 ${era.trim()}`
        + ` ／ Overpass 0 回 ／ 建物が揃うまで ${ms}ms ／ 地表タイル到達 ${msGround}ms`;
    },
  },
  {
    // 明治期のデータが無い土地。ここで「0.0% — 1408件すべてを判定した実測値」と
    // 書いていた。測れていないものを測定値として出さない（掟: 取れなかったを「無い」と言わない）。
    name: "さかのぼる（判定できない土地）", path: `/peel?${SAPPORO}`,
    async check(page) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 集計が出るところまで待つ（建物は Overpass 頼みで遅いので、そこは待たない）
      await page.waitForFunction(
        () => (document.getElementById("landAll")?.textContent ?? "").trim().length > 0,
        null, { timeout: 60000 });
      // 地形分類は建物の集計とは別に取りに行くので、後から届く。待つ。
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
        // ⚠ **建物の層まで待つ。**層は別々に返るので、途中で読むと
        //   「建物ごとには出せない」の行がまだ無い（実測 2026-08-19 に踏んだ）。
        await page.waitForFunction(
          () => /建物/.test(document.getElementById("landAll")?.textContent ?? ""),
          null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      // ⚠ 見ているのは「**割合を作らない**」（0% を出さない）。
      //   ⚠ 建物の件数のような**実際に数えた数**は出してよい（同種の札幌の検査と同じ書き方）。
      must(!/\d+\.\d+\s*%/.test(hero), `判定できない土地で割合を出している: ${hero.slice(0, 80)}`);
      // 建物ごとの割合は出せない。それを「何も分からない」と混ぜないこと（掟: 主題は「成り立ち」。明治期は手法のひとつ）
        // ⚠ 出せないのが**建物ごと**であること（何もかも駄目ではない）。
        //   ⚠ 層になって言い方が変わった（第3層の欠落として、その位置に出る）。
        //   ⚠ 見ている主張は変えていない: **範囲を限っていること**。
        must(/建物ごとには出せません|1 件ずつの足元は判定できていません|建物ごとの判定は/.test(hero),
        `出せないのが「建物ごと」であることが書かれていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      must(!cap.includes("実測値"), `判定していないのに「実測値」と書いている: ${cap.slice(0, 50)}`);
      // 土地そのものには答えられる。ここで黙ると、建物が出ているのに終わってしまう
      must(/この土地は .+/.test(cap), `地形分類が出ていない: ${cap.slice(0, 80)}`);
      must(/整備対象外|読み込め/.test(cap),
        `明治期が取れていないことを言っていない: ${cap.slice(0, 80)}`);
      const status = (await page.locator("#status").textContent()).trim();
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 34)}`;
    },
  },
  {
    // 建物の明治期区分は事前計算アセットから出るため、GSI通信断でも表示できる。
    // 実行時のラスタ通信に依存していないことを確かめる。
    name: "さかのぼる（通信断）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "通信断でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `通信断なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
    },
  },
  {
    // ⚠ 0.0% の再来を止める。403 を不在に丸めていた頃は、拒まれた土地で
    //   「1408件すべてデータなし」→ **0.0% を「実測値」として**出していた
    //   （掟: 取れなかったを「無い」と言わない の元になった事故そのもの）。
    name: "さかのぼる（403）", path: `/peel?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "403でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `403 なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
    },
  },
  {
    // ⚠ 「いま画面に出ているもの」の地表の行は無条件だった。ラスタが1枚も
    // 届いていなくても「実測 地表はその年代の空中写真そのもの」と書いていた。
    // 水面（waterRead）と建物（total）にはガードがあり、地表だけ素通り。
    // 取れなかったものを「実測した」と言う、掟: 取れなかったを「無い」と言わない の根そのもの。
    name: "さかのぼる（地表タイルだけ落とす）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(PHOTO_ROUTE, (r) => r.abort()),
    async check(page) {
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      await page.waitForFunction(
        () => /\d+\s*件\s*の建物が、この範囲にあります/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const prov = await provText(page);
      must(!prov.includes("そのもの"),
        `地表が届いていないのに「実測」と言っている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      // ⚠ **台帳は問いごとに配られた**（2026-08-22。⚠ `#prov` は無い）。
      //   ⚠ **地表は第2層の材料。**⚠ **`.prov-q .prov` の最初は第1層（区分の出どころ）**
      //     （⚠ 2026-08-23 に踏んだ。⚠ 「`prov ok`」を見て落ちた）。
      const g = await page.evaluate(() => {
        const e = [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((x) => /地表/.test(x.textContent ?? ""));
        return e ? { cls: e.className, txt: (e.textContent ?? "").replace(/\s+/g, " ").trim() }
                 : { cls: "", txt: "" };
      });
      const cls = g.cls, txt = g.txt;
      must(txt, "地表の行が第2層に無い");
      must(cls.includes("no"), `地表の行が「取れていない」表示になっていない: ${cls} / ${txt}`);
      // ⚠ **札（未取得 など）は消した**（2026-08-22。Owner 判断: ⚠ 色で伝わる）。
      //   ⚠ **主張は「⚠ 取れなかったと分かること」。**⚠ **字で言っているかを見る。**
      must(/届いていない/.test(txt), `取れなかったことを字で言っていない: ${txt.slice(0, 60)}`);
      // 断定もしない。届かなかっただけで、その年代の写真の有無は分かっていない
      const lie = LIES.find((w) => txt.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${txt.slice(0, 50)}`);
      // 落としたのは写真タイルだけ。水面・建物は従来どおり出ること
      // （地表のガードが他の行まで巻き添えにしていないかを、ここで見る）
      must(prov.includes("実際の水域"), `水面の行まで落ちている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      const hero = (await page.locator("#landAll").textContent()).trim();
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "地表タイル断でも3D");
      return `${txt.slice(0, 34)}／土地区分と水域補足（${hero}）は従来どおり`;
    },
  },
  // ---- 検索の入口（掟: 取れなかったを「無い」と言わない やる順番3）----
  // 住所検索は関連度で返らないので、素の先頭は別の土地になる。
  // 並びそのものは scripts/search-check.mjs が35語で測る。ここで見るのは
  // 「画面の上で Enter を押したとき何が起きるか」のほう。
  {
    // ⚠ **狭い幅でも 1 つの器に見せる**（2026-08-22。hidetzu/konjaku#165。Owner 判断）。
    //   ⚠ **PC では 2026-08-20 から同じことをしていた。**⚠ 狭い幅にだけ届いていなかった。
    //   ⚠ 利用者役 3/3 が「真ん中の板と下の板は 1 つでいい」と答え、⚠ **3 名とも理由は同じ**で
    //     「⚠ **同じ『最新の空中写真』が 2 回**、上下に並んでいる」だった（2026-08-21）。
    // ⚠ **見た目だけの検査にしない。**⚠ 撮影種別が 1 か所であること（Owner 判断: `#timePanel .s` に残す）と、
    //   ⚠ **押せる的が 44×44 を割らない**ことまで見る。
    name: "狭い幅でも、年代の表示と操作が 1 つの器になっている", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.getElementById("ruler")?.checkVisibility?.(),
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(700);
        const r = await page.evaluate(() => {
          const vis = (e) => !!e && e.checkVisibility();
          // ⚠ **HUD に器がいくつ立っているか。**⚠ 2 つに戻っていないことを見る
          const boxes = [...document.querySelectorAll("#hud > *")].filter(vis)
            .map((e) => e.id || e.className);
          const rlSub = document.getElementById("rlSub");
          const small = [...document.querySelectorAll("#rlPrev,#rlNext")]
            .filter(vis)
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; })
            .map((e) => e.id);
          return { boxes,
            kinds: (document.body.innerText.match(/最新の空中写真/g) ?? []).length,
            subOn: vis(rlSub), small,
            // ⚠ 押しどころが**消えていない**こと（対で見る。verify §5）
            ops: ["#rlPrev", "#rlNext"].filter((q) => vis(document.querySelector(q))).length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
        });
        // ⚠ **器は 1 つ**（2026-08-22 に #era を畳んで #timePanel へ寄せた）
        must(r.boxes.length === 1,
          `${w}px: HUD に器が ${r.boxes.length} 個ある（1 つにまとめたはず）: ${r.boxes.join(" / ")}`);
        must(r.kinds === 1, `${w}px: 撮影種別が画面に ${r.kinds} 回ある（1 か所にする）`);
        must(!r.subOn, `${w}px: ものさしの下に撮影種別が出ている（#timePanel .s に残すと決めた）`);
        must(r.ops === 2, `${w}px: 年代を送る ‹ › が ${r.ops} 個しか見えていない`);
        must(!r.small.length, `${w}px: 44×44 を割った的がある: ${r.small.join("、")}`);
        must(!r.overflow, `${w}px: 横あふれしている`);
        out.push(`${w}: 器${r.boxes.length}個 撮影種別${r.kinds}回`);
      }
      return out.join(" ／ ");
    } },
  {
    // ⚠ 待たせ続けない。以前は 45秒 × 2エンドポイント × 2周 で、最悪 180秒
    //   「建物を取得中…」のままだった。Overpass が落ちること自体は前提で、
    //   問題は「いつ諦めるかを決めていなかった」こと。
    // ⚠ 建物を取り込んでいない土地で見る。亀戸は豊洲の取り込み（z14 6枚）に
    //   含まれてしまい、Overpass の経路を通らなくなった
    name: "建物が取れないとき、待たせ続けない", path: `/peel?${URAYASU}`,
    // ⚠ glob にしない。`**://*.overpass*/**` は overpass-api.de にも
    //   overpass.kumi.systems にも**一度もマッチしていなかった**（どちらも先頭の
    //   ラベルが overpass なので `*.` の前に置くものが無い）。
    //   実際には Overpass が応答して 6,439件取れており、この検査は
    //   「待たせ続けない」を一度も確かめていなかった。URL で見る。
    setup: (page) => Promise.all([
      // 現在の静的タイル範囲に浦安が含まれても、Overpassの失敗経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // ⚠ 起点はページ読み込みではなく「建物を待ち始めた瞬間」。
      //   先に水域の判定（亀戸で1048面）があり、混んだ環境ではそこだけで時間を食う。
      //   見たいのは **待ち始めてから諦めるまで**。
      // ⚠ 一瞬の状態をスナップショットで読まない。**出るべき文言そのもの**を待つ。
      //   「建物を取得中」を待ってから innerText を読むと、読んだ時点では
      //   次の状態に移っていることがある（実際に取りこぼした）。
      await page.waitForFunction(() => /最大20秒|取れなければ/.test(document.body.innerText),
        null, { timeout: 60000 });
      const t0 = Date.now();


      // 期限内に、取れなかったと言い切ること
      await page.waitForFunction(() => /取得できませんでした/.test(document.body.innerText),
        null, { timeout: 60000 });
      must(await page.locator("#status .retry-btn").count() === 1, "建物取得失敗時の再試行が出ていない");
      const ms = Date.now() - t0;
      must(ms < 30000, `諦めるのが遅い: 待ち始めてから ${ms}ms`);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // 取れなかっただけで、画面は成立していること
      must(/水域と空中写真だけで表示/.test(t), `代わりに何が見られるか書いていない: ${t.slice(0, 160)}`);
      must(await page.locator("canvas").count() > 0, "地図まで出なくなっている");
      for (const w of LIES) must(!t.includes(w), `建物が取れないだけで断定している: 「${w}」`);
      return `${Math.round(ms / 1000)} 秒で諦めて「取得できませんでした」／水域と写真は出ている`;
    },
  },
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
      await page.waitForFunction(() => {
        const t = document.getElementById("breakdown")?.textContent ?? "";
        return /件/.test(t) && !/取得中/.test(t);
      }, null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        rows: [...document.querySelectorAll("#breakdown .stat")].map((e) => ({
          t: e.innerText.replace(/\s+/g, " ").trim(),
          bg: getComputedStyle(e.querySelector(".swatch")).backgroundColor })),
        hint: [...document.querySelectorAll("#breakdown .hint")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" ／ "),
      }));
      // ⚠ 分類の行が 1 本もないこと。1 本でもあれば「明治期は○○だった」と読める
      must(r.rows.length === 0,
        `資料の範囲外を分類の行にしている: ${r.rows.map((x) => `${x.t}[${x.bg}]`).join(" / ")}`);
      // ⚠ 件数は落とさない。落とすと「建物が無い」に読める
      must(/1364|\d{3,}/.test(r.hint), `件数を落としている: ${r.hint}`);
      must(/範囲の外|整備している範囲/.test(r.hint), `範囲の外であることを言っていない: ${r.hint}`);
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
    //     置いた画像に対する主張へ化ける）。⚠ **その場で組み立てる**（`whitePng`）。
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
  {
    name: "Overpass が 0 件を返したら、取れなかったと言わない", path: `/peel?${URAYASU}`,
    setup: (page) => Promise.all([
      // 取り込み済みの経路を塞ぐ。⚠ 塞がないと静的で答えてしまい、Overpass の経路を通らない
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), (r) => r.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({ elements: [] }) })),
    ]),
    async check(page) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      for (const [where, t] of [["問い", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/OSM への問い合わせで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `「OSM に登録された建物は 0 件」／台帳「OSM への問い合わせで建物 0 件」`;
    },
  },
  {
    name: "建物を待っている間は、取得中と言う", path: `/peel?${URAYASU}`,
    setup: (page) => Promise.all([
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // 待ち始めたことを、出るべき文言そのもので待つ（一瞬の状態をスナップショットで読まない）
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      //   ⚠ **「最大20秒…」は出さなくなった**（Owner 判断）。⚠ **内訳の「取得中」で待つ。**
      await page.waitForFunction(() => /建物を取得中/.test(
        document.getElementById("breakdown")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      must(/建物を取得中/.test(bd), `待っている間に内訳が「取得中」と言っていない: ${bd.slice(0, 90)}`);
      // ⚠ 台帳の語彙は「未取得＝読めなかった／欠落＝本当に無い」。待っている間に「欠落」は嘘
      must(!/欠落/.test(prov), `待っているだけなのに台帳が「欠落」と言っている: ${prov.slice(0, 90)}`);
      must(/建物データを取得中/.test(prov), `台帳が待っていることを言っていない: ${prov.slice(0, 90)}`);
      must(!/0 件/.test(bd), `まだ取れていないのに件数を言っている: ${bd.slice(0, 90)}`);
      return `内訳「建物を取得中…」／台帳「未取得 建物データを取得中」`;
    },
  },
  // ---- 取り込み済みの土地では、外へ出ない ----
  // ⚠ 実行時に Wikidata を叩くのをやめるための取り込み。効いていることを機械で見る。
  {
    name: "建物が取り込み済みなら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      must(reqs.filter((u) => /\/data\/bl\//.test(u)).length > 0, "建物タイルを読んでいない");
      // ⚠ 集計範囲が広がっていないこと。豊洲は 99% 台のはず
      const pct = Number((t.match(/(\d+\.\d)\s*%/) ?? [])[1]);
      must(pct >= 95, `集計範囲が広がっている（豊洲で ${pct}%。隣の街区が混ざっている）`);
      // いつ取り込んだ結果かを言うこと
      // ⚠ **場所が「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ いつ取り込んだ結果かが画面にあること）。
      // ⚠ **由来の行は「詳しく見る」の中**（2026-08-22。⚠ 畳んである）。
      //   ⚠ **`innerText` には出ない。**⚠ **`textContent` で読む**（⚠ 主張は同じ）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(
        (await page.locator("#landAll").textContent()).replace(/\s+/g, " ")),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      // ⚠ **「（事前に取り込んだデータ）」は、⚠ 0 件のときしか出ない**（2026-08-23 に確かめた）。
      //   ⚠ **判定できたときの `#status` は空**（2026-08-22。Owner 判断: ⚠ 件数は答えが言う）。
      //   ⚠ **主張は上の行が持つ**（⚠ 「建物のデータは YYYY-MM-DD に取り込んだもの」）。
      //   ⚠ **消したのは重複であって、⚠ 主張ではない。**⚠ **Overpass を叩いていないことは上で見ている。**
      return `Overpass 0 件／${pct}%／取り込み日あり`;
    },
  },
  {
    // ⚠ 共有は唯一の指標。共有された URL を踏んだ人が数から消えると、
    //   「共有されたが誰も踏まなかった」と「踏まれたが数えていなかった」を区別できない。
    name: "共有された 3D の URL を踏んだ人も、1回だけ数える", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // 直接開いている（トップの導線を通っていない）
      await peelReady(page).catch(() => {});
      await settleAfterCondition(page);
      const t = reqs.filter((u) => /\/t(\?|$)/.test(u));
      must(t.length === 1, `直接開いたのに ${t.length} 回数えている（1回であること）`);
      return `直接開いて /t 1 回`;
    },
  },
  {
    // ⚠ 過去の年代では、**年と同じくらいの強さで**「重ねている」と言うこと。
    //   実測（2026-08-14 利用者役のエージェントによる検証）: 広島 1945–50（原爆直後の焼け野原）の上に
    //   現在の3,555棟が立ち、広島の利用者は最初の3秒「1945年の広島」だと読んだ。
    //   判別できた人の根拠は**画面ではなく自分の歴史知識**だった。
    //   ⚠ 半透明で薄れさせない。0.80 で瓦礫が建物ごしに透け、「消えかけの幽霊」
    //     「広島の人間には見せられない」と言われた。**別物として重ねる**ほうがよい。
    name: "過去の写真の上では、いまの街を重ねていると言う",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const at = async (v) => { await page.$eval("#t", (e, v) => {
          e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1600);
        return page.evaluate(() => {
          const y = document.querySelector("#timePanel .y"), o = document.getElementById("notes");
          const fs = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
          return { year: y.textContent.trim(), yFs: fs(y),
            over: (o?.textContent ?? "").trim(), oFs: fs(o),
            op: map.getPaintProperty("bld", "fill-extrusion-opacity") };
        }); };

      // 現在は「重ねている」ではない（地面も建物もいま）
      const now = await at(0);
      must(now.over === "", `現在なのに重ねていると言っている: ${now.over}`);

      // ⚠ スライダーの端を決め打ちしない。段の数は**地点によって変わる**
      //   （広島は 1936–42 と 1984–86 が存在しないので 7 段 / max=600）。
      //   800 と書いていた頃は、この検査が「8段固定」という直したい前提そのものを
      //   固定していた。端は実装に聞く。
      const max = await page.$eval("#t", (e) => Number(e.max));
      must(max > 0, "スライダーの上限が 0（段が組まれていない）");

      // 過去は必ず言う
      const past = await at(Math.round(max * 0.75));
      must(past.over.length > 0, `過去の年代なのに、重ねていることを言っていない（${past.year}）`);
      must(/いま/.test(past.over), `いまの街だと言っていない: ${past.over}`);
      must(past.over.includes(past.year), `どの年代の地面かを言っていない: ${past.over}`);
      // ⚠ 年に対して小さすぎると「言い切っている」ことにならない（以前は 60:12 で5倍）
      must(past.yFs / past.oFs <= 3.0,
        `年 ${past.yFs}px に対して重ねの文が ${past.oFs}px（3倍以内であること）`);
      // ⚠ 幽霊にしない
      must(typeof past.op !== "number" || past.op >= 0.9,
        `過去の年代で建物が薄れている（不透明度 ${past.op}）。消えかけに見える`);

      // 明治期は建物が消えるので、建物の話をしない
      const meiji = await at(max);
      must(meiji.year === "明治期", `右端が明治期でない: ${meiji.year}`);
      must(meiji.over === "", `建物が1棟も無いのに重ねていると言っている: ${meiji.over}`);
      return `現在=無／${past.year}=「${past.over.slice(0, 28)}」${past.yFs}:${past.oFs}px／端=${max}`;
    },
  },
  {
    // ⚠ ここが核心。/peel は固定 8 段を出していたので、広島に**存在しない**
    //   1936–42（陸軍撮影は東京23区と大阪市周辺だけ）と 1984–86 のタイルを
    //   地図レイヤとして読み、写真タイルの 404 を **202 件**送っていた（2026-08-16 実測）。
    //   トップは同じ地点で「残っているのは 5 年代」と正しく答えていた。
    name: "存在しない年代を段に出さない（広島）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page, reqs) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      must(labels[labels.length - 1] === "明治期", `右端が明治期でない: ${labels.at(-1)}`);
      for (const gone of ["1936–42", "1984–86"])
        must(!labels.includes(gone), `広島に存在しない ${gone} を段に出している: ${labels.join("/")}`);
      for (const keep of ["1945–50", "1961–69", "1974–78", "1979–83", "1987–90"])
        must(labels.includes(keep), `広島に残っている ${keep} が段から消えている: ${labels.join("/")}`);
      // ⚠ 不在の年代へ出てよいのは、**判定用の中心タイル1枚まで**。
      //   地図レイヤから引くと、また 100 枚単位で 404 を送ることになる。
      const count = (id) => reqs.filter((u) => u.includes(`/xyz/${id}/`)).length;
      for (const id of ["ort_riku10", "gazo3"])
        must(count(id) <= 1, `存在しない年代 ${id} のタイルを ${count(id)} 枚取りに行っている`);
      return `${labels.length} 段（${labels.join("/")}）／不在レイヤへの要求 `
        + `ort_riku10 ${count("ort_riku10")}・gazo3 ${count("gazo3")} 枚`;
    },
  },
  {
    // ⚠ 同じ地点に、トップと /peel が別の答えを出していた（掟: 同じ問いに答える実装を2つ持たない）。
    //   長崎 出島はいちばん差が大きく、固定 8 段のうち 5 年代が存在しない
    //   （2026-08-16 実測で 404 を 491 件送っていた）。
    name: "トップと /peel が、同じ地点で同じ年代を出す（長崎 出島）",
    path: `/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
    // ⚠ **判定に使ったタイルが、実際に何を答えたか**を控える。
    //   ⚠ 掟: 不在と読むのは 404 だけ。timeout / 通信断 / 5xx は「読めなかった」で、
    //     その年代は**段に残す**のが正しい。
    //   ⚠ 控えないと、相手先が 1 回でも 404 以外を返した回に、
    //     **正しい振る舞いのほうを落としてしまう**
    //     （実測 2026-08-19: 実描画の失敗 4 件のうち 2 件がこれだった。
    //      同じ回の数秒前に、広島では同じレイヤを 404 と読めていた＝単発の揺れ）。
    setup: (page) => {
      page.__gsi = new Map();
      const id = (u) => (/\/xyz\/([a-z0-9_]+)\//.exec(u) ?? [])[1];
      page.on("response", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, r.status()); });
      page.on("requestfailed", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, 0); });
      return Promise.resolve();
    },
    async check(page) {
      await peelReady(page);
      const past = (l) => l.filter((x) => x !== "現在" && x !== "明治期").sort();
      const peel = past(await stepLabels(page));
      // ⚠ **必ず出るはずのものは、強いまま。**ここは相手先の揺れと関係ない
      for (const keep of ["1961–69", "1974–78"])
        must(peel.includes(keep), `出島に残っている ${keep} が段から消えている: ${peel.join("/")}`);
      // ⚠ **余分な年代は、404 と答えられた年代でないこと。**
      //   404 なのに残っていたら、それは「無い」を出せていない＝こちらの不具合。
      //   404 以外（読めなかった）で残っているなら、それは**掟どおり**。
      const ID = { "1936–42": "ort_riku10", "1945–50": "ort_USA10", "1961–69": "gazo1",
                   "1974–78": "gazo1", "1979–83": "gazo2", "1984–86": "gazo3", "1987–90": "gazo4" };
      const extra = peel.filter((x) => x !== "1961–69" && x !== "1974–78");
      const wrong = extra.filter((x) => page.__gsi.get(ID[x]) === 404);
      must(wrong.length === 0,
        `404 と答えられた年代を段に残している: ${wrong.map((x) => `${x}(${ID[x]}=404)`).join("・")}`);
      const shaky = extra.map((x) => `${x}(${ID[x]}=${page.__gsi.get(ID[x]) ?? "問い合わせ無し"})`);
      // 同じ入れ物のままトップへ移る（同じ地点・同じ相手・同じキャッシュで比べる）
      await page.goto(`${BASE}/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
        { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitVerdict(page);
      const top = past(await page.$$eval("#strip .f .yr", (els) =>
        els.map((e) => e.textContent.trim())));
      // ⚠ **ここが本題。**同じ問いに 2 つの実装が別の答えを出していないこと。
      //   ⚠ 相手先が揺れていても、**トップと /peel は同じ揺れ方をするはず**（同じ実装を使う）。
      must(JSON.stringify(top) === JSON.stringify(peel),
        `トップと /peel の年代が食い違う: トップ ${top.join("/")} ／ /peel ${peel.join("/")}`);
      return `両方とも ${peel.join("/")}（${peel.length} 年代）`
        + (shaky.length ? `／⚠ 相手先が 404 を返さなかったぶんが残っている: ${shaky.join("・")}` : "");
    },
  },
  {
    // ⚠ 応答を固定して、4 通りの結末を作り分ける。実データに寄りかかると、
    //   相手先の整備状況が変わった日にこの検査が何も見なくなる。
    //     404      … その年代の写真は無い          → 段に出さない
    //     200 白紙 … タイルはあるが撮影範囲の外    → 段に出さない
    //     500      … 読めなかった                  → **段に残す**
    //     通信断   … 読めなかった                  → **段に残す**
    //   消してしまうと「取れなかった」が「無い」になる（掟: 取れなかったを「無い」と言わない）。
    name: "年代ごとの結末で、段に出すかを決める", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.route(eraRoute("gazo3"), (r) => r.fulfill({ status: 404, body: "" }));
      await page.route(eraRoute("gazo2"), (r) => r.fulfill({
        status: 200, contentType: "image/png", body: whitePng() }));
      await page.route(eraRoute("gazo1"), (r) => r.fulfill({ status: 500, body: "" }));
      await page.route(eraRoute("ort_riku10"), (r) => r.abort());
    },
    async check(page) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(!labels.includes("1984–86"), `404 の年代を段に出している: ${labels.join("/")}`);
      must(!labels.includes("1979–83"), `白紙（撮影範囲外）の年代を段に出している: ${labels.join("/")}`);
      must(labels.includes("1974–78"), `読めなかった年代（500）を段から消している: ${labels.join("/")}`);
      must(labels.includes("1936–42"), `読めなかった年代（通信断）を段から消している: ${labels.join("/")}`);
      // 残した段では「届いていない」と言い、記録の有無は断定しない
      const k = labels.indexOf("1936–42");
      await page.$eval("#t", (e, v) => { e.value = String(v);
        e.dispatchEvent(new Event("input")); }, k * 100);
      await page.waitForTimeout(1200);
      // ⚠ **地表は第2層の材料**（2026-08-22）。⚠ **`.prov-q .prov` の最初は第1層。**
      //   ⚠ **札（実測 / 未取得）は消した**（Owner 判断: ⚠ 色で伝わる）。⚠ **字で見る。**
      const ground = (await page.evaluate(() =>
        [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((e) => /地表/.test(e.textContent ?? ""))?.textContent ?? ""))
        .replace(/\s+/g, " ").trim();
      must(/届いていない/.test(ground),
        `読めなかった年代を、⚠ 取れなかったと言っていない: ${ground.slice(0, 60)}`);
      const lie = LIES.find((w) => ground.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${ground.slice(0, 60)}`);
      return `${labels.length} 段（${labels.join("/")}）／404と白紙は消え、500と通信断は残る`;
    },
  },
  {
    // ⚠ 段を削って詰めるだけでは駄目。建物が消える年（tFromYear）・水位・建物のフェードは
    //   **時間座標**で決まっている。広島で 2 段抜いたぶんを詰めると、
    //   同じ 1945–50 の地面の上で、建物の消え方と水位が豊洲と変わってしまう。
    // ⚠ **ここは絵を差し替えない**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **段に何が並ぶか**が主題で、⚠ **それは実際のタイルの中身で決まる**
    //     （`public/verify.js`。⚠ 撮影範囲の外は真っ白なので、⚠ その年代は段に出ない）。
    //   ⚠ **差し替えると、⚠ 広島に無いはずの年代まで段に並ぶ。**⚠ 主張がすり替わる。
    name: "段を間引いても、時間座標が詰まらない（広島 と 豊洲）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const at = async (v) => { await page.$eval("#t", (e, x) => { e.value = String(x);
        e.dispatchEvent(new Event("input")); }, v); await page.waitForTimeout(300);
        return tauNow(page); };
      await peelReady(page);
      const l1 = await stepLabels(page);
      const k1 = l1.indexOf("1945–50");
      must(k1 === 5, `広島の 1945–50 が 5 段目でない: ${k1} 段目（${l1.join("/")}）`);
      const a = await at(k1 * 100);
      must(a.tau === 6, `広島の 1945–50 で時間座標が 6 でない: ${a.tau}（段は詰まっている）`);
      // 豊洲では同じ年代が 6 段目。**段は違うが時間は同じ**でなければならない
      await page.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await peelReady(page);
      const l2 = await stepLabels(page);
      const k2 = l2.indexOf("1945–50");
      must(k2 === 6, `豊洲の 1945–50 が 6 段目でない: ${k2} 段目（${l2.join("/")}）`);
      const b = await at(k2 * 100);
      must(b.tau === a.tau, `同じ 1945–50 なのに時間座標が違う: 広島 ${a.tau} / 豊洲 ${b.tau}`);
      must(Math.abs(b.water - a.water) < 1e-9,
        `同じ 1945–50 なのに水位が違う: 広島 ${a.water} / 豊洲 ${b.water}`);
      return `1945–50 は 広島 ${k1} 段目 / 豊洲 ${k2} 段目、時間座標はどちらも ${a.tau}`
        + `（水位 ${a.water.toFixed(3)}m で一致）`;
    },
  },
  {
    // ⚠ **帯は、押しても引いても段が決まる**（コンポーネント単体。2026-08-22。hidetzu/konjaku#171）。
    //
    //   ⚠ **実描画の 4 ケースから移した。**⚠ **主張は 1 つも落としていない。**
    //     年代帯の端の文字を押すと最後の段になる（PC の横棒）
    //     年代帯の文字は、押せば段へ寄り、引けば連続して動く（PC の横棒）
    //     年代の帯は、目盛りも文字もノブも押せる（PC の横棒）
    //     つまみの両端が、何の年代かを必ず名乗る
    //   ⚠ **移せた理由**: どれも ⚠ **地図も建物も土地データも見ていない。**
    //     段を渡せば足りる（実データに寄りかかっていない）。
    //   ⚠ **移さなかったもの**: 「▶ は、動かす相手（帯）のすぐそばにある」は
    //     ⚠ **初期画面に入っているか（innerHeight）を見ている**ので、単体では測れない。
    //
    // ⚠ **移すときに、1 つ強くした。**
    //   「つまみの両端が…」は **375×667** で測っていたが、⚠ **その幅では横棒が
    //   `display:none`**（狭い幅はドラム）。⚠ **矩形が全部 0 になるので、
    //   「はみ出さない」「重ならない」は何も見ていなかった**（2026-08-22 に気づいた）。
    //   ⚠ ここでは ⚠ **横棒が出る幅**（681 = 出る下限 ／ 1280）で測り、
    //   ⚠ **測る前に `checkVisibility()` で見えていることを確かめる**（同じ穴に落ちない）。
    //
    // ⚠ **端の文字は、中心をそのまま押す。**⚠ 枠の内側へ寄せて押さない。
    //   ⚠ 実測（2026-08-22）: 右端から 2px の位置に丸めて押すと、⚠ **range が自力で最大へ行く**ので、
    //     ⚠ **文字タップの処理を丸ごと消しても、この検査が緑のままだった。**
    //
    //   ⚠ 経緯（既定動作を止めない／重なったら中心がいちばん近いものを選ぶ／
    //     引き終えて段へ吸い戻さない）は、⚠ **era-control.js のコメントが持つ。**⚠ 写さない。
    name: "年代の帯は、押しても引いても段が決まる（コンポーネント単体）", path: "/", group: "core",
    async check(page) {
      const browser = page.context().browser();
      const out = [];

      // ---- ① 両端が名乗る／枠からはみ出さない／重ならない ----
      // ⚠ 段の数が違うところで見る。⚠ **偶数段・奇数段の両方**（片方だけだと、また偶然で通る）
      for (const width of [681, 1280]) {
        for (const n of [4, 5, 7, 9]) {
          const { ctx, p2, errs } = await openEraControl(browser, { width, height: 400 });
          try {
            await p2.evaluate((k) => {
              window.__steps = Array.from({ length: k }, (_, i) => ({
                id: String(i), label: i === 0 ? "現在" : i === k - 1 ? "明治期" : `19${40 + i * 6}年`,
                meiji: i === k - 1 }));
              window.__pos = 0; window.__draw();
            }, n);
            await p2.waitForTimeout(80);
            const geo = await p2.evaluate(() => {
              const box = (e) => { const r = e.getBoundingClientRect();
                return { left: r.left, right: r.right, text: e.textContent.trim() }; };
              const t = document.getElementById("track");
              return { shown: t.checkVisibility(), track: box(t),
                ticks: document.querySelectorAll("#track .tick").length,
                labs: [...document.querySelectorAll("#track .lab")].map(box),
                start: document.querySelector("#track .lab.at-start")?.textContent.trim() ?? "",
                end: document.querySelector("#track .lab.at-end")?.textContent.trim() ?? "" };
            });
            must(!errs.length, `${width}px ${n}段: 例外が出た: ${errs[0]}`);
            // ⚠ **見えていないものを測って「問題なし」と言わない**（移す前がこれで空振りしていた）
            must(geo.shown && geo.track.right - geo.track.left > 0,
              `${width}px ${n}段: 横棒が出ていない。この検査は何も見ていない`);
            must(geo.ticks === n, `${width}px ${n}段: 目盛りが ${geo.ticks} 個`);
            must(geo.start === "現在", `${width}px ${n}段: 開始端が現在でない: 「${geo.start}」`);
            must(geo.end === "明治期", `${width}px ${n}段: 終了端が明治期でない: 「${geo.end}」`);
            // ⚠ 端の文字が枠からはみ出さないこと（横スクロールが出る。一度踏んでいる）
            const over = geo.labs.filter((l) => l.text
              && (l.left < geo.track.left - 0.5 || l.right > geo.track.right + 0.5));
            must(!over.length, `${width}px ${n}段: 目盛りの文字が枠の外に出ている: `
              + over.map((l) => `${l.text}(${l.left.toFixed(0)}〜${l.right.toFixed(0)}px)`).join("、"));
            // ⚠ 間引いたうえで、なお隣どうしが重ならないこと
            const shown = geo.labs.filter((l) => l.text).sort((a, b) => a.left - b.left);
            const hit = shown.filter((l, i) => i > 0 && l.left < shown[i - 1].right - 0.5);
            must(!hit.length, `${width}px ${n}段: 目盛りの文字が重なっている: `
              + hit.map((l) => l.text).join("、"));
            out.push(`${width}px ${n}段「${shown.map((l) => l.text).join("/")}」`);
          } finally { await ctx.close(); }
        }
      }

      // ---- ② 押す・引く（⚠ 段の数は移す前と同じ 9 段。1280px の横棒）----
      const { ctx, p2, errs } = await openEraControl(browser, { width: 1280, height: 400 });
      try {
        const n = 8;   // 9 段 = 最大値 8
        await p2.evaluate((k) => {
          window.__steps = Array.from({ length: k + 1 }, (_, i) => ({
            id: String(i), label: i === 0 ? "現在" : i === k ? "明治期" : `19${40 + i * 6}年`,
            meiji: i === k }));
          window.__pos = 0; window.__draw();
        }, n);
        await p2.waitForTimeout(80);
        // ⚠ **値は「画面へ返ってきた位置」から読む。**⚠ `#t.value` は見ない。
        //   ⚠ 実測（2026-08-22）: 文字タップの処理は `slider.value` を**自分で**書いてから
        //     画面へ返す。⚠ **`#t` を見ると、返す側を消しても気づけない**（移す前の 4 ケースが
        //     どれも `#t` を見ていた。⚠ **返す処理を消しても 4 件とも緑のままだった**）。
        //   ⚠ **コンポーネントの契約は、返す値のほう。**⚠ そちらを見る。
        const val = () => p2.evaluate(() => window.__pos);
        const set = (v) => p2.evaluate((x) => { window.__pos = x; window.__draw(); }, v);
        const geo = await p2.evaluate(() => {
          const t = document.getElementById("track").getBoundingClientRect();
          const mid = (e) => { const r = e.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
          return { x: Math.round(t.left), w: Math.round(t.width),
            // ⚠ **名前の無いラベルは的にしない。**⚠ 間引いた段のラベルは `:empty` で消えていて、
            //   ⚠ 消えた要素の矩形は 0,0 を返す（そのまま押すと画面の左上を押す）
            lab: [...document.querySelectorAll("#track .lab")]
              .filter((e) => e.textContent.trim())
              .map((e) => ({ ...mid(e), t: e.textContent.trim(), i: Number(e.dataset.i) })),
            tick: [...document.querySelectorAll("#track .tick")].map(mid),
            knob: mid(document.querySelector("#track .knob")) };
        });
        must(!errs.length, `例外が出た: ${errs[0]}`);
        must(geo.lab.length > 0 && geo.tick.length === n + 1, "目盛りも年代の文字も足りない");
        // ⚠ **押せる面は `#t` 自身。**⚠ #track の幅とは限らない（実測でずれていた）
        const inRight = await p2.$eval("#t", (e) => Math.round(e.getBoundingClientRect().right));

        // 端の文字を押すと、最後の段になる
        await set(0);
        const endLab = geo.lab[geo.lab.length - 1];
        await p2.mouse.click(endLab.x, endLab.y);
        await p2.waitForTimeout(200);
        must(await val() === n, `右端「${endLab.t}」を押しても最終段にならない: ${await val()} / ${n}`);

        // ⚠ **中間の文字を押したら、その段ちょうどへ寄る。**
        //   ⚠ **端では見えない主張。**⚠ 実測（2026-08-22）: 右端の文字の中心は、
        //     range が自力で最大に達する位置にあり、⚠ **文字タップの処理を消しても最大になる。**
        //     ⚠ **中間の文字だけが、寄せているのかどうかを見分けられる。**
        const inner = geo.lab.filter((l) => l.i > 0 && l.i < n);
        must(inner.length, `中間の年代の文字が無い: ${geo.lab.map((l) => l.t).join("・")}`);
        const tap = inner[0];
        await set(0); await p2.waitForTimeout(60);
        await p2.mouse.click(tap.x, tap.y);
        await p2.waitForTimeout(200);
        const tapped = await val();
        must(tapped === tap.i, `文字「${tap.t}」を押しても段 ${tap.i} にならない: ${tapped}`);

        // ノブ中心を押しても、値が意図せず変わらない
        const midStep = n / 2;
        await set(midStep);
        const knob = await p2.locator("#track .knob").boundingBox();
        must(knob, "ノブが無い");
        await p2.mouse.click(Math.round(knob.x + knob.width / 2), Math.round(knob.y + knob.height / 2));
        await p2.waitForTimeout(200);
        must(await val() === midStep, `ノブ中心の押下で値が変わった: ${await val()}`);

        // ⚠ 押しても動かない的が無い（文字も目盛りも全部効く）
        const dead = [];
        for (const l of [...geo.lab, ...geo.tick]) {
          const from = l.x < geo.x + geo.w / 2 ? n : 0;
          await set(from); await p2.waitForTimeout(60);
          // ⚠ **右端ちょうどは要素の外**（実測 2026-08-22: 最後の目盛りの中心が `#t` の
          //   右端と同じ x で、⚠ **その 1px は隣の要素が受け取る**）。⚠ 2px 内側を押す（指なら当たる幅）。
          //   ⚠ **端の文字（下）は寄せない。**寄せると range が自力で最大へ行き、
          //     ⚠ **文字タップの処理を消しても気づけない。**
          await p2.mouse.click(Math.min(l.x, inRight - 2), l.y);
          await p2.waitForTimeout(150);
          if (await val() === from) dead.push(l.t || `目盛り(${l.x})`);
        }
        must(!dead.length, `押しても動かない的がある: ${dead.join("、")}`);

        // ⚠ 文字の上から引くと、連続して動く。⚠ **引き終えて段へ吸い戻さない**
        await set(0); await p2.waitForTimeout(100);
        const midLab = geo.lab[Math.floor(geo.lab.length / 2)];
        await p2.mouse.move(midLab.x, midLab.y);
        await p2.mouse.down();
        const trace = [];
        for (let k = 1; k <= 6; k++) {
          await p2.mouse.move(midLab.x + k * 20, midLab.y);
          await p2.waitForTimeout(40);
          trace.push(await val());
        }
        await p2.mouse.up(); await p2.waitForTimeout(250);
        const ended = await val();
        const moved = new Set(trace).size;
        must(moved >= 4, `文字の上から引いても動かない: ${trace.join(" → ")}`);
        for (let k = 1; k < trace.length; k++)
          must(trace[k] > trace[k - 1], `右へ引いたのに値が戻る: ${trace.join(" → ")}`);
        must(ended === trace[trace.length - 1],
          `引き終えてから段へ吸い戻された: ${trace[trace.length - 1]} → ${ended}`);

        // ⚠ ノブを掴んで引けること
        await set(0); await p2.waitForTimeout(100);
        await p2.mouse.move(geo.knob.x, geo.knob.y);
        await p2.mouse.down();
        await p2.mouse.move(geo.knob.x + 120, geo.knob.y, { steps: 8 });
        await p2.mouse.up(); await p2.waitForTimeout(200);
        must(await val() !== 0, "ノブを掴んで引けない");

        out.push(`9段: 文字 ${geo.lab.length} 個・目盛り ${geo.tick.length} 個・ノブ、全部効く`);
        out.push(`文字「${tap.t}」押下 → 段 ${tapped}／引くと ${moved} 段階で吸い戻さない`);
      } finally { await ctx.close(); }

      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **ものさしは、動かす前に全段の年代を名乗る**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
    //
    //   ⚠ **前は両端しか名乗らなかった。**実測（2026-08-22・`main` = `8d920fd`・豊洲）:
    //     375 / 344 / 320 のどの幅でも、⚠ **名前が読めるのは 2 個**（刻みは 10 本）。
    //   ⚠ **間引かない。**⚠ 出ていない段があると「その年代は無い」と読まれる（掟 §1）。
    //     実測（利用者役 3 名に画面だけを見せた。⚠ **実在の利用者ではない**）:
    //     ⚠ **間引き案は 2 / 3 が「名前が付いている年代しか見られないのか」と読んだ。**
    //
    // ⚠ **段の数を変えて見る。**⚠ 4 / 5 / 7 / 9（偶数・奇数の両方）。
    //   ⚠ **実物のページでは段の数を選べない**（その土地に何が残っているかで決まる）。
    //   ⚠ 写真を stub すると ⚠ **どの土地でも 9 段になる**ので、⚠ **地点を並べても段の数は変わらない**
    //     （2026-08-22 に実際に踏んだ。豊洲・広島・出島・帯広が全部 9 段と出た）。
    //   ⚠ **だからここは、⚠ 段を渡せる単体で見る。**⚠ 実物に届いているかは、次のケースが見る。
    //
    // ⚠ **字はここに書かない。**⚠ 短い書き方は `words.js` の `eraTick` が 1 か所で持つ。
    name: "ものさしは、動かす前に全段の年代を名乗る（コンポーネント単体）", path: "/", group: "core",
    async check(page) {
      const browser = page.context().browser();
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        for (const n of [4, 5, 7, 9]) {
          const { ctx, p2, errs } = await openEraControl(browser, { width: w, height: h });
          try {
            await p2.evaluate((k) => {
              window.__steps = Array.from({ length: k }, (_, i) => ({
                id: String(i), label: i === 0 ? "現在" : i === k - 1 ? "明治期" : `19${40 + i * 6}–${42 + i * 6}`,
                meiji: i === k - 1 }));
              window.__pos = 0; window.__draw({ narrow: true });
            }, n);
            await p2.waitForTimeout(80);
            const g = await p2.evaluate(() => {
              const B = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; };
              const labs = [...document.querySelectorAll(".rl-labs span")].map((e) => ({ t: e.textContent, ...B(e) }));
              const L = document.getElementById("rlLeft"), R = document.getElementById("rlRight");
              return { shown: document.getElementById("ruler").checkVisibility(),
                line: B(document.querySelector("#ruler .rl-line")),
                ticks: document.querySelectorAll("#rlTicks i:not(.rl-cut)").length,
                inner: labs,
                all: [{ t: L.textContent, ...B(L) }, ...labs, { t: R.textContent, ...B(R) }]
                  .sort((a, c) => a.l - c.l),
                overX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
            });
            must(!errs.length, `${w}px ${n}段: 例外が出た: ${errs[0]}`);
            // ⚠ **見えていないものを測って「問題なし」と言わない**
            must(g.shown && g.line.r - g.line.l > 0,
              `${w}px ${n}段: ものさしが出ていない。この検査は何も見ていない`);
            must(g.ticks === n, `${w}px ${n}段: 刻みが ${g.ticks} 本`);
            // ⚠ **これが主張の芯**: 段の数だけ名前が読める（両端 ＋ 間）
            must(g.all.length === n,
              `${w}px ${n}段: 名前が ${g.all.length} 個しか読めない（${g.all.map((x) => x.t).join("/")}）`);
            must(g.all.every((x) => x.t.trim()),
              `${w}px ${n}段: 空の名前がある（${g.all.map((x) => x.t).join("/")}）`);
            // ⚠ 隣どうしが重ならないこと
            const hit = g.all.filter((x, i) => i > 0 && x.l < g.all[i - 1].r - 0.5)
              .map((x, i) => x.t);
            must(!hit.length, `${w}px ${n}段: 名前が重なっている: ${hit.join("、")}`);
            // ⚠ 間の名前が軸の枠から出ないこと（横スクロールが出る）
            const over = g.inner.filter((x) => x.l < g.line.l - 0.5 || x.r > g.line.r + 0.5).map((x) => x.t);
            must(!over.length, `${w}px ${n}段: 名前が軸の外に出ている: ${over.join("、")}`);
            must(g.overX <= 0, `${w}px ${n}段: 横にあふれている（${g.overX}px）`);
            // ⚠ **字は words.js のとおりか**（⚠ 検査に書き写さない）
            const want = Array.from({ length: n }, (_, i) =>
              WORDS.eraTick(i === 0 ? "現在" : i === n - 1 ? "明治期" : `19${40 + i * 6}–${42 + i * 6}`));
            const got = g.all.map((x) => x.t);
            must(JSON.stringify(got) === JSON.stringify(want),
              `${w}px ${n}段: 字が words.js と違う（${got.join("/")} ／ 期待 ${want.join("/")}）`);
            if (n === 9) out.push(`${w}px「${got.join(" ")}」`);
          } finally { await ctx.close(); }
        }
      }
      return out.join(" ／ ") + " ／ 4/5/7/9 段とも 重なり 0・枠の外 0";
    },
  },

  {
    // ⚠ **EraControlPanel だけを、⚠ 地図もネットも無しで動かす**（2026-08-22。hidetzu/konjaku#171）。
    //
    //   ⚠ **なぜ要るか。**⚠ 切り出しただけでは境界は保証されない。
    //     ⚠ 実測（2026-08-22）: コンポーネントが `esc` を、⚠ **peel3d.js が最上位で宣言した
    //       ものに黙って頼っていた。**⚠ classic script は最上位の `const` を共有するので、
    //       ⚠ **実物のページでは動いてしまう。**⚠ **単体で開いて初めて落ちた。**
    //     ⚠ 静的検査でも捕まらない（`esc` は禁止語ではない）。
    //
    //   ⚠ **配信物を増やさない。**⚠ `page.route` で組み立てる（実ファイルを置かない）。
    //     ⚠ ⚠ 相対 URL を実サーバへ解かせたいので、⚠ **BASE の下の URL に見せる。**
    //   ⚠ **速い。**⚠ /peel 全体は 1 ケース 10〜30 秒。⚠ ここは 100ms 台（実測）。
    //   ⚠ **地図・地理院タイル・建物を 1 本も引かないこと**まで見る（引いたら境界が壊れている）。
    name: "年代の表示と操作が、コンポーネント単体で動く", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 400 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        // ⚠ **DOM は peel.html から取る。**⚠ ここへ写すと、⚠ **2 か所になって片方が古くなる**（掟）
        const peel = await readFile(new URL("../../public/peel.html", import.meta.url), "utf8");
        const i = peel.indexOf('<section id="timePanel"');
        const j = peel.indexOf("</section>", i) + "</section>".length;
        must(i > 0 && j > i, "peel.html から #timePanel を切り出せない（この検査が何も見ていない）");
        const dom = peel.slice(i, j);
        // ⚠ **token は peel.html の :root が持つ。**⚠ ここで値を書くと 2 か所になるので、
        //   ⚠ **peel.html の :root をそのまま借りる**（字面を写さない）。
        const rootCss = /:root\{([\s\S]*?)\}/.exec(peel)?.[1] ?? "";
        // ⚠ **--tap は tokens.css 側**（peel.html の :root には無い）。⚠ ここにある値で確かめる
        must(rootCss.includes("--text-hero"), "peel.html の :root を読めない（この検査が何も見ていない）");
        const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/components/era-control/era-control.css">
<style>:root{${rootCss}} body{background:#0b0e13;margin:0;padding:20px;
  font:14px/1.65 -apple-system,sans-serif;color:var(--ink)}</style></head><body>
${dom}
<script src="/esc.js"></script>
<script src="/words.js"></script>
<script src="/components/era-control/era-control.js"></script>
<script>
  window.__ev = [];
  window.__c = createEraControl({ root: document.getElementById("timePanel"),
    onChangeEra: (p) => window.__ev.push(["era", p]),
    onTogglePlay: () => window.__ev.push(["play"]) });
</script></body></html>`;
        await p2.route(`${BASE}/__era-control-probe`, (r) =>
          r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
        // ⚠ **何を引いたかを数える。**⚠ 地図を引いたら境界が壊れている
        const got = [];
        p2.on("request", (r) => got.push(new URL(r.url()).pathname));
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));

        const t0 = Date.now();
        await p2.goto(`${BASE}/__era-control-probe`, { waitUntil: "domcontentloaded", timeout: 30000 });
        const STEPS = [{ id: "now", label: "現在" }, { id: "a", label: "1984–86" },
                       { id: "b", label: "1945–50" }, { id: "swale", label: "明治期", meiji: true }];
        // ---- ① 状態を渡すだけで組み上がる ----
        const a = await p2.evaluate((steps) => {
          window.__c.update({ steps, pos: 0, playing: false, narrow: false, sealed: false,
            meijiHas: true, readout: { year: "現在", kick: "", sub: "最新の空中写真", net: "", note: "" }, tone: {} });
          return { ticks: document.querySelectorAll("#track .tick").length,
            labs: [...document.querySelectorAll("#track .lab")].map((e) => e.textContent.trim()).filter(Boolean),
            y: document.querySelector("#timePanel .y").textContent,
            s: document.querySelector("#timePanel .s").textContent,
            note: document.querySelector("#rlNote").textContent,
            radius: getComputedStyle(document.getElementById("timePanel")).borderRadius };
        }, STEPS);
        must(!errs.length, `コンポーネント単体で例外が出た: ${errs[0]}`);
        must(a.ticks === STEPS.length, `目盛りが段の数と合わない（${a.ticks} / ${STEPS.length}）`);
        must(a.labs.includes("現在") && a.labs.includes("明治期"),
          `両端の年代名が出ていない: ${a.labs.join("／")}`);
        must(a.y === "現在" && a.s === "最新の空中写真", `読みが渡らない: ${a.y} / ${a.s}`);
        must(/空中写真 3 段/.test(a.note), `注記が段の数から出ていない: ${a.note}`);
        must(a.radius && a.radius !== "0px", `CSS が効いていない（角 ${a.radius}）`);

        // ---- ② 整備されていない土地では、注記が変わる（⚠ 渡した真偽値だけで決まる）----
        const b2 = await p2.evaluate((steps) => {
          window.__c.update({ steps, pos: 3, playing: true, narrow: false, sealed: false,
            meijiHas: false, readout: { year: "明治期", kick: "", sub: "低湿地データ ─ 写真は存在しない", net: "", note: "" },
            tone: { meiji: true } });
          return { y: document.querySelector("#timePanel .y").textContent,
            rlYear: document.querySelector("#rlYear").textContent,
            note: document.querySelector("#rlNote").textContent,
            play: document.querySelector("#play").textContent,
            meiji: document.getElementById("timePanel").classList.contains("meiji") };
        }, STEPS);
        must(b2.y === "明治期" && b2.rlYear === "明治期", `年が渡らない: ${b2.y} / ${b2.rlYear}`);
        must(/未整備/.test(b2.note), `⚠ 未整備の土地で「明治期は地図」と約束している: ${b2.note}`);
        must(b2.play === "❚❚", `再生中の記号が出ていない: ${b2.play}`);
        must(b2.meiji, "明治期の見た目に切り替わっていない");

        // ---- ③ 操作が返ってくる（⚠ 中で描き直さない。一方向）----
        await p2.click("#play");
        const box = await p2.locator("#track .lab.at-end").boundingBox();
        await p2.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        const ev = await p2.evaluate(() => window.__ev);
        must(ev.some((x) => x[0] === "play"), `▶ の合図が返ってこない: ${JSON.stringify(ev)}`);
        must(ev.some((x) => x[0] === "era" && x[1] === STEPS.length - 1),
          `端の年代を押しても最終段が返ってこない: ${JSON.stringify(ev)}`);

        // ---- ④ ⚠ 地図もタイルも建物も引かない ----
        const outside = [...new Set(got)].filter((u) =>
          /maplibre|gsi|tile|data\/bl|data\/ev|peel3d/.test(u));
        must(!outside.length, `⚠ コンポーネント単体なのに外を引いている: ${outside.join(" ")}`);
        return `${Date.now() - t0}ms／引いた URL ${new Set(got).size} 本（地図 0）`
          + `／目盛り ${a.ticks}／注記の出し分け ✓／合図 ${ev.length} 件`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **配られる形になっているか**（2026-08-22。hidetzu/konjaku#171 の AC 6）。
    //
    //   ⚠ **EraControlPanel を `components/` の下へ出した。**⚠ 動的キャッシュの規則は
    //     「直下の .js」しか一致しないので、⚠ **SHELL に入れ忘れると、オフラインで出ない。**
    //
    //   ⚠ **本当にネットを切って確かめる形は、⚠ 手元では作れなかった。**
    //     ⚠ `peel.html` は **`location.protocol === "https:"` のときだけ** SW を登録する。
    //     ⚠ 検査は `http://127.0.0.1` なので、⚠ **SW は一生登録されない。**
    //     ⚠ 実際に踏んだ（2026-08-22）: `navigator.serviceWorker.ready` を待つ検査を書いたら、
    //       ⚠ **解決しない Promise で 59 分止まった**（タイムアウトも効かない）。
    //   ⚠ **だから、⚠ 「SW が実際に配れる状態か」を、⚠ SW 自身の作りから確かめる。**
    //     ⚠ **静的検査（SHELL に文字列があるか）より強い**: ⚠ **実ファイルが取れることまで見る。**
    //   ⚠ **これは「オフラインで動く」の証明ではない。**⚠ そこは正直に名乗る。
    name: "年代 UI のファイルが、SHELL の経路で実際に取れる", path: "/", group: "core",
    async check(page) {
      const files = ["/components/era-control/era-control.js",
                     "/components/era-control/era-control.css"];
      const sw = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
      const out = [];
      for (const f of files) {
        // ⚠ **SHELL に載っていること**（載っていないと、SW は取りに行かない）
        must(sw.includes(`"${f}"`), `sw.js の SHELL に ${f} が無い（オフラインで年代 UI が出ない）`);
        // ⚠ **実ファイルが本当に取れること。**⚠ 綴りが合っていても中身が無ければ SW の install が失敗する
        const r = await page.request.get(`${BASE}${f}`);
        must(r.ok(), `${f} が配れない（HTTP ${r.status()}）。SHELL に書いても実体が無い`);
        const body = await r.text();
        must(body.length > 200, `${f} の中身が空に近い（${body.length} 字）`);
        out.push(`${f.split("/").pop()} ${Math.round(body.length / 1024)}KB`);
      }
      // ⚠ **動的キャッシュに頼れないことを、⚠ 規則そのもので確かめる。**
      //   ⚠ 「SHELL から外しても、動的キャッシュが拾ってくれる」と思い込まないため
      // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **この決まりを説明したコメントの字面を拾う**
      //   （CLAUDE.md §9。⚠ 2026-08-22 に実際に踏んだ: SHELL のコメントに書いた
      //    「下の CACHEABLE を読む」を規則の本体と取り違えた）。
      const swBare = sw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      const rt = /const CACHEABLE\s*=\s*\[([\s\S]*?)\];/.exec(swBare)?.[1];
      must(rt, "sw.js の動的キャッシュの規則（CACHEABLE）を読めない（この検査が何も見ていない）");
      must(!/components/.test(rt),
        "動的キャッシュが components の下を拾う形になっている（SHELL の検査が意味を失う）");
      return `${out.join("／")}／SHELL に 2 件／動的キャッシュは components を拾わない`;
    },
  },

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
      const places = [
        ["豊洲", `/peel?${TOYOSU}`, /^99\.\d%$/, "543 / 543件の足元を判定"],
        ["広島", "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6", /^\d\.\d%$/, "3260 / 3552件の足元を判定"],
        ["長崎 出島", "/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6",
          /^\d\.\d%$/, "3895 / 3895件の足元を判定"],
        ["お台場", "/peel?ll=35.63000,139.77600&q=%E3%81%8A%E5%8F%B0%E5%A0%B4",
          /^97\.\d%$/, "103 / 103件の足元を判定"],
        ["渋谷", "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7", null, "4785 / 5017件の足元を判定"],
        ["上野", "/peel?ll=35.71480,139.77450&q=%E4%B8%8A%E9%87%8E", null, "2731 / 5673件の足元を判定"],
        ["西新宿", "/peel?ll=35.69050,139.69290&q=%E8%A5%BF%E6%96%B0%E5%AE%BF", null, "3402 / 4258件の足元を判定"],
      ];
      const out = [];
      for (const [name, path, pctRe, den] of places) {
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
        const hasCategory = !!r.hero && !/[\d.]+/.test(r.hero);
        if(hasCategory){
          must(r.what.includes("建物の足元") && r.what.includes("最多"),
            `${name}: 最多区分の説明が書かれていない: 「${r.what}」`);
          must(r.heroCap.includes("水域だった建物"), `${name}: 水域割合の補足が無い: 「${r.heroCap}」`);
          // ⚠ **小さい割合を消さない。** 主見出しを区分名にしたぶん、割合は
          //   意味と分母を伴って残っていること（隠したり別の数字へ置き換えたりしない）。
          const pct = (t) => t.match(/水域だった建物[：:]\s*([\d.]+)%/)?.[1] ?? null;
          const [pc, hud] = [pct(r.heroCap), pct(r.landAll)];
          must(pc !== null, `${name}: パネルに水域割合の数字が無い: 「${r.heroCap.slice(0, 80)}」`);
          must(hud !== null, `${name}: HUD に水域割合の数字が無い: 「${r.landAll.slice(0, 80)}」`);
          // ⚠ 同じ画面の中で食い違わないこと（計算元は landVerdict の1か所）
          must(pc === hud, `${name}: HUD とパネルで水域割合が違う: HUD「${hud}%」/ パネル「${pc}%」`);
            // ⚠ 主見出しの区分名も、HUD とパネルで同じであること。
            //   ⚠ **HUD は層になったので、先頭は第1層**（⚠ 字は `words.js` の `layerTitle(1)`）。
            //     主見出しは HUD の**どこか**に、同じ語で在ればよい。
            //   ⚠ 見ている主張は変えていない: **同じ画面で 2 つの答えを出さないこと**。
            must(r.landAll.includes(r.hero),
              `${name}: HUD とパネルで主見出しが違う: HUD「${r.landAll.slice(0, 40)}」/ パネル「${r.hero}」`);
        } else {
          // ⚠ pctRe が無い地点（区分名が主見出しのはず）でここへ来たら、
          //   規則が変わって低い割合が主見出しに戻ったということ。落とす。
          must(pctRe && pctRe.test(r.num),
            `${name}: 割合が主見出しになっている（区分名のはず）／読めない: 「${r.num}」`);
          must(r.what.includes("建物が、明治期には") && r.what.includes("水の上"),
            `${name}: 何の割合かが書かれていない: 「${r.what}」`);
        }
        // ⚠ **分母がその行に在ること。**完全一致は求めない。
        //   ⚠ 区分名が主役の土地では、同じ行に「水域だった建物：X%」も入る
        //     （head が区分名なので、割合の置き場がここしかない）。
        //   ⚠ 見ている主張は変えていない: **数字を出すなら分母を同じ板に出す**。
        must(r.den.includes(den), `${name}: 分母が読めない: 「${r.den}」（要る: ${den}）`);
        // ⚠ **同じ画面の中で結果が食い違わないこと。** 計算元は landVerdict の1か所
        if(!hasCategory) must(r.hero === r.num, `${name}: HUD とパネルで割合が違う: HUD「${r.num}」/ パネル「${r.hero}」`);
        const [a, b] = r.den.match(/(\d+) \/ (\d+)/).slice(1);
          // ⚠ 層になって、HUD もパネルも**同じ書き方**になった（「543 / 543件の足元を判定」）。
          //   ⚠ 見ている主張は変えていない: **同じ画面の中で分母が食い違わないこと**。
          must(r.heroCap.includes(`${a} / ${b} 件`) || r.heroCap.includes(`${b}件すべて`)
            || r.heroCap.includes(`${a} / ${b}件の足元を判定`),
          `${name}: HUD とパネルで分母が違う: HUD「${r.den}」/ パネル「${r.heroCap.slice(0, 60)}」`);
        out.push(`${name} ${hasCategory ? r.hero : r.num}（${r.den}）`);
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
  {
    // ⚠ 建物が1棟も見えていないとき（明治期の端）は、建物の話をしない。
    //   実測（2026-08-14）: 明治期では全建物の高さが 0 になり1棟も見えないのに、
    //   「建物は…件が推定」「建物を押すと分かります」が出続け、
    //   **見えない建物が押せた**（4か所試して 4/4 でカードが出た）。
    //   利用者は「幽霊」「気持ち悪い」と言った。
    name: "見えていない建物の話をしない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const set = async (v) => { await page.$eval("#t", (e, v) => {
        e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1800); };
      const read = () => page.evaluate(() => ({
        est: (document.getElementById("notes")?.textContent ?? "").trim(),
        tip: [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.textContent).join("").trim() }));
      const taps = async () => { let n = 0;
        for (const [x, y] of [[110, 260], [190, 300], [260, 240], [150, 380]]) {
          await page.evaluate(() => document.querySelectorAll(".pick-pop").forEach((e) => e.remove()));
          await page.mouse.click(x, y); await page.waitForTimeout(350);
          if (await page.locator(".pick-pop").count()) n++;
        } return n; };

      // 建物が立っている年代では、話をすること
      await set(0);
      const now = await read();
      // ⚠ **2026-08-21 に、⚠ 帯は 1 行になった**（hidetzu/konjaku#151。⚠ 分数はパネルへ）。
      //   ⚠ **見ている主張は同じ**: ⚠ 建物が立っているあいだ、⚠ 断りが帯に出ていること。
      must(/建物が消える年代は推定/.test(now.est), `建物が立っているのに但し書きが無い: ${now.est}`);
      must((await taps()) > 0, "建物が立っているのに押せない");

      // 明治期では、建物の話をしないこと
      await set(800);
      const meiji = await read();
      must(meiji.est === "", `建物が1棟も無いのに但し書きが出ている: ${meiji.est}`);
      must(meiji.tip === "", `建物が1棟も無いのに「押すと分かります」が出ている: ${meiji.tip}`);
      const ghost = await taps();
      must(ghost === 0, `見えない建物が押せる（4か所中 ${ghost} 件でカードが出た）`);
      return `現在は但し書きあり・押せる／明治期は但し書き無し・押しても出ない`;
    },
  },
  {
    // ⚠ **押した結果は、⚠ 押した場所の吹き出しだけ**（2026-08-21。Owner 判断）。
    //   ⚠ 前はパネルの `#pick` にも同じ `pickCard(p)` を入れており、
    //     ⚠ **同じ字が同時に 2 か所**に出ていた（⚠ 実測: 4 幅とも一致）。
    //   ⚠ 利用者役 4 名に画面だけを見せた（⚠ 実在の利用者ではない）: ⚠ **4/4 が「要らない」。**
    //
    // ⚠ **押しているあいだ、⚠ 要約カードは退く。**
    //   ⚠ 実測（375×667・豊洲）: 吹き出し y147–312 に対し #land y62–218 で、
    //     ⚠ **吹き出しの 39% が隠れていた。**⚠ 利用者役 4/4 が「上が隠れている」と答えた。
    //   ⚠ **z-index では解けない**（⚠ `#map` の `filter` が積み重ねの文脈を作る。
    //     ⚠ 実測: 吹き出し z=15 でも #land（z=11）の下だった）。
    //   ⚠ **高さは残す**（⚠ 消すと下の HUD が飛び跳ねる）。⚠ **閉じたら戻る。**
    name: "押した結果は、押した場所の 1 か所だけに出る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **パネルに板そのものが無いこと**（⚠ 空の箱も置かない）
      must(await page.locator("#pick").count() === 0,
        "パネルに押した建物の板（#pick）が戻っている（結果は押した場所の 1 か所）");
      // ⚠ **2026-08-21 に、⚠ 要約カード（#land）が無くなった**（hidetzu/konjaku#152）。
      //   ⚠ hidetzu/konjaku#155 でここは「⚠ 押しているあいだ要約を退かせる」を見ていた。
      //     ⚠ 実測（375×667・豊洲）: 吹き出しの 39% が要約に隠れていたため。
      //   ⚠ **隠す相手が無くなったので、⚠ 退かせる仕掛けごと消した。**
      //   ⚠ **主張は引き継ぐ**: ⚠ **押した結果が、⚠ 押した場所で読めること**（⚠ 上端が最前面）。
      must(await page.$$eval("#land", (els) => els.length) === 0,
        "要約カード（#land）が戻っている（土地の答えはパネルの 1 か所）");

      await page.mouse.click(187, 333);
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const pop = document.querySelector(".pick-pop .maplibregl-popup-content");
        if (!pop) return null;
        const a = pop.getBoundingClientRect();
        // ⚠ **上端が本当に最前面にいること。**⚠ z-index を信じない
        const top = document.elementFromPoint(Math.round(a.left + a.width / 2), Math.round(a.top + 8));
        return { inPop: !!top?.closest(".pick-pop"),
          text: (pop.innerText || "").replace(/\s+/g, " ").trim() };
      });
      must(r, "建物を押しても吹き出しが出ない");
      must(r.inPop, "吹き出しの上端が、何かの下に隠れている");
      must(await page.locator("#pick").count() === 0, "押したらパネルにも板が出た");

      // ⚠ **閉じたら、⚠ 吹き出しだけが消える**
      await page.click(".pick-pop .maplibregl-popup-close-button");
      await settleAfterClick(page);
      must(await page.locator(".pick-pop").count() === 0, "✕ で吹き出しが閉じない");
      return `吹き出し 1 か所（上端が最前面）「${r.text.slice(0, 40)}」／✕ で閉じる`;
    },
  },
  {
    // ⚠ 建物を押した結果は、**押した場所の近く**に出ること。
    //   以前は左パネルの中だけに書いていて、実測で y=672（スマホ・パネルは閉じている）／
    //   y=721（PC・パネルの内スクロールの外）と、**両方の端末で画面の外**だった。
    //   利用者役のエージェント3体が「押しても何も起きないように見える」と言ったのは、
    //   実際に何も見えていなかったから（2026-08-14）。
    name: "建物を押した結果が、押した場所に見える", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 触る前に、押せることが**画面に出ている**こと。
      //   以前は左パネルの中に案内があったが、スマホはパネルが閉じて始まり、
      //   PC は内スクロールの外だったので、誰も読んでいなかった。
      // ⚠ **案内は `?` の中へ移した**（2026-08-23。Owner 判断。⚠ 狭い幅で地図が 22% しか
      //   ⚠ 見えていなかったため）。⚠ **消したのではない。**⚠ **押せば出る。**
      //   ⚠ **見る主張は 2 つに分ける**: ⚠ **①出す手段がある**／⚠ **②押すと画面内に出る。**
      //   ⚠ **`?` が 44×44 であることは、⚠ 別のケースが見ている。**
      const help = await page.locator("#noteHelp");
      if (await help.isVisible()) { await help.click(); await settleAfterClick(page); }
      const tip = await page.evaluate(() => {
        const t = [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .find((e) => e.checkVisibility());
        const r = t?.getBoundingClientRect();
        return { text: (t?.textContent ?? "").trim(),
          inView: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
      });
      must(tip.text.length > 0, "建物を押せることが、どこにも書かれていない（? を押しても出ない）");
      must(tip.inView, `案内が画面の外にある: ${JSON.stringify(tip)}`);
      must(/押す|押し/.test(tip.text), `何をすればよいか書かれていない: ${tip.text}`);

      await page.mouse.click(187, 333);                 // 画面の真ん中の建物
      await settleAfterClick(page);
      // ⚠ 役目が終わった案内を、画面に置き続けない
      const tipAfter = await page.evaluate(() =>
        [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.textContent).join("").trim());
      must(tipAfter === "", `一度押したのに案内が残っている: ${tipAfter}`);
      const r = await page.evaluate(() => {
        const pop = document.querySelector(".pick-pop .maplibregl-popup-content");
        const rc = pop?.getBoundingClientRect();
        const say = document.getElementById("pickSay");
        return { has: !!pop, text: (pop?.textContent ?? "").replace(/\s+/g, " ").trim(),
          inView: !!rc && rc.top >= 0 && rc.bottom <= innerHeight
            && rc.left >= 0 && rc.right <= innerWidth,
          sayH: say ? Math.round(say.getBoundingClientRect().height) : 0 };
      });
      must(r.has, "建物を押しても、押した場所に何も出ない");
      must(r.inView, `押した結果が画面の外にある: ${JSON.stringify(r).slice(0, 120)}`);
      // ⚠ 3D で 100% 言えるのは足元だけ。まずそれを言うこと
      must(/足元は、明治期には水でした|明治期の土地|明治期の低湿地データ/.test(r.text),
        `足元の判定が出ていない: ${r.text.slice(0, 80)}`);
      // ⚠ 高さと建設年は、必ず出所つきで。「実測」と書ける建物は 7.9% しかない
      must(/既定値|階数|height タグ/.test(r.text), `高さの出所が出ていない: ${r.text.slice(0, 80)}`);
      must(/建設年/.test(r.text), `建設年について何も言っていない: ${r.text.slice(0, 80)}`);
      // ⚠ 技術的なRGBAは通常カードに出さない。土地の状態を主情報として出す。
      must(!/rgba=/.test(r.text), `技術的なRGBAが通常カードに出ている: ${r.text.slice(0, 80)}`);
      for (const w of ["この年に建った", "当時", "再現", "でしょう"])
        must(!r.text.includes(w), `断定・作文が混ざっている: 「${w}」`);
      // 読み上げは指で押せる大きさ
      must(r.sayH === 0 || r.sayH >= 44, `読み上げが指で押すには小さい: ${r.sayH}px`);
      return `案内「${tip.text}」→ 押すと消える／押した場所に出る（🔊 ${r.sayH}px）`
        + `／${r.text.slice(0, 40)}`;
    },
  },
  {
    // ⚠ 建物の但し書きは、**初期状態で見える場所**に出ていること。
    //   以前は左パネルの中にしかなく、スマホは panelOpen=!isNarrow で閉じて始まるので
    //   初期状態で1文字も見えなかった。利用者役のエージェント3体のうち2体が
    //   「高さと建設年は実データだ」と思ったまま操作した（2026-08-14）。
    //   ⚠ **初めから隠すのは不可。**⚠ **2026-08-22 からは畳むこともできない**
    //     （Owner 判断で畳みボタンを消した）。⚠ 断りは、隠せない場所に置く（掟 §1）。
    //   ⚠ スマホ幅で見ること。PC ではパネルが開くので、この壊れ方は再現しない。
    name: "建物の但し書きが、スマホで最初から見えて、隠せない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const e = document.getElementById("notes"), rc = e?.getBoundingClientRect();
        return { text: (e?.textContent ?? "").replace(/\s+/g, " ").trim(),
          panelHidden: !document.getElementById("panel")?.classList.contains("open"),
          // ⚠ **但し書きを隠せる親がいないこと**（2026-08-22。畳みボタンを消した）。
          //   ⚠ 以前は #eraToggle の aria-expanded を見ていたが、⚠ **その仕掛けごと無くなった。**
          //   ⚠ **「畳まれていない」ではなく「畳めない」**を見る（より強い主張）。
          folded: e?.closest("[hidden],[aria-expanded='false'],.collapsed")?.tagName ?? null,
          shown: !!rc && rc.height > 0 && rc.top >= 0 && rc.bottom <= innerHeight
            && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none" };
      });
      // 前提が崩れていたら、この検査は何も確かめていない
      must(r.panelHidden, "スマホなのにパネルが開いている（この検査の前提が消えた）");
      must(!r.folded, `但し書きを畳める親がいる（<${r.folded}>）。断りは隠せない場所に置く（掟 §1）`);
      must(r.shown, `但し書きが折り返しの中に見えていない: ${JSON.stringify(r)}`);
      // ⚠ 「出ている」だけでは足りない。**読めること**。板なしで出したときは
      //   10.5px・薄い色・影だけで航空写真の上に置いており、読めるのは数字だけだった。
      //   年の見出しが 60px なのに但し書きが 10.5px で 5.7倍（UI/UX の実測）。
      const look = await page.evaluate(() => {
        const e = document.getElementById("notes"), c = getComputedStyle(e);
        const y = document.querySelector("#timePanel .y");
        const a = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
        // ⚠ **敷きは、祖先を辿って探す。** 以前ここは `#era` の背景を決め打ちで見ていた。
        //   いまは #est が #era の中にあるので偶然一致していたが、
        //   ⚠ **#est を外へ出した瞬間、航空写真の上に敷き無しで浮いていても緑になる**
        //   （検査が測っていないことを「確認済み」と表示する。掟が名指ししている失敗）。
        //
        // ⚠ **body を敷きに数えない。**（2026-08-19 に踏んだ）
        //   body は不透明（rgb(8,11,15)）だが、**その上に地図が乗っている**。
        //   文字の背後にあるのは地図（航空写真）で、body ではない。
        //   数えてしまうと、敷きの無い場所へ出しても緑のままだった。
        //   ⚠ **地図（#map）より内側の祖先だけ**を見る。
        const mapEl = document.getElementById("map");
        let bgA = 0, at = null;
        for (let n = e; n && n !== document.body; n = n.parentElement) {
          if (n === mapEl) break;              // ⚠ 地図そのものは敷きではない
          const bg = getComputedStyle(n).backgroundColor;
          if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
          const v = bg.startsWith("rgba") ? (a(bg)[3] ?? 0) : 1;
          if (v > bgA) { bgA = v; at = n.id || n.className || n.tagName; }
          if (bgA >= 1) break;
        }
        return { fs: parseFloat(c.fontSize),
          yearFs: parseFloat(getComputedStyle(y).fontSize), bgA, bgAt: at };
      });
      must(look.fs >= 12, `但し書きが小さすぎる: ${look.fs}px（12px 以上）`);
      must(look.bgA >= 0.5,
        `但し書きに敷きが無い（写真の上で沈む）: 背景の不透明度 ${look.bgA}（敷いているのは ${look.bgAt ?? "無し"}）`);
      must(look.yearFs / look.fs <= 5.2,
        `年の見出しと但し書きの差が開きすぎ: ${look.yearFs}px 対 ${look.fs}px`);
      // ⚠ 「推定」の語だけでは足りない。**主張範囲の分母つき**で言うこと
      // ⚠ **2026-08-21 に、⚠ 帯から分数を外した**（hidetzu/konjaku#151。⚠ パネルへ移した）。
      //   ⚠ **帯に残す主張は「推定である」こと**。⚠ 分母つきは画面のどこかに 1 回だけ
      //     （⚠ それは別のケースが数える）。⚠ **ここは帯の役目だけを見る。**
      must(/建物が消える年代は推定/.test(r.text), `帯の但し書きが消えている: ${r.text}`);
      must(!/\d/.test(r.text), `帯に数字が残っている（分数はパネルへ移した）: ${r.text}`);
      // ⚠ **分母つきは、⚠ 同じ画面のパネルから読めること**（⚠ 消していない証拠）
      // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断。⚠ 台帳は「どう決めたか」だけ）。
      //   ⚠ **主張は同じ**（⚠ 分母つきが、⚠ 同じ画面のパネルから読めること）。
      //   ⚠ **読むのは「高さが分かる N / M」と「階数から換算 X 件 ／ 既定値 Y 件」。**
      const bdTx = await page.evaluate(() =>
        (document.getElementById("breakdown")?.textContent ?? "").replace(/\s+/g, " "));
      const mh = bdTx.match(/高さが分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(mh, `高さを分母つきで言っていない: ${bdTx.slice(0, 140)}`);
      const my = bdTx.match(/建てられた年が分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(my, `建設年を分母つきで言っていない: ${bdTx.slice(0, 140)}`);
      // ⚠ **実測でない分は、⚠ その内訳が言う**（⚠ 足すと総数になる）
      const me = bdTx.match(/階数から換算\s*(\d+)\s*件\s*／\s*種別ごとの既定値\s*(\d+)\s*件/);
      must(me, `実測でない高さの内訳が無い: ${bdTx.slice(0, 140)}`);
      must(+mh[1] + +me[1] + +me[2] === +mh[2],
        `高さの内訳が総数と合わない: ${mh[1]} ＋ ${me[1]} ＋ ${me[2]} ≠ ${mh[2]}`);
      must(+me[1] + +me[2] > 0, `推定が 0 件なのに「推定です」と言っている: ${bdTx.slice(0, 90)}`);
      const provTx = await provText(page);
      // ⚠ **台帳は「どう決めたか」を言う**（⚠ 件数は言わない）
      must(/種別ごとの既定値/.test(provTx), `台帳が高さの決め方を言っていない: ${provTx.slice(0, 120)}`);
      for (const w of ["再現", "当時の街並み", "この年に建った"])
        must(!r.text.includes(w), `断定・再現を名乗る語がある: 「${w}」`);

      // ⚠ **過去へ動かしても、断りと年代と重ねの注意は消えない。**
      //   ⚠ 以前はここで畳んで「畳んでも残る」を見ていた。⚠ **畳む仕掛けを消したので、
      //     ⚠ 「隠す手段が無い」ほうを見る**（より強い主張）。
      await page.$eval("#t", (e) => { e.value = "500"; e.dispatchEvent(new Event("input")); });
      await settleAfterClick(page);
      const past = await page.evaluate(() => ({
        estVisible: document.getElementById("notes").checkVisibility(),
        // ⚠ 隠せる仕掛けが 1 つも無いこと
        toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
        year: document.querySelector("#timePanel .y").textContent.trim(),
        note: document.getElementById("eraSummaryNote").textContent.trim(),
      }));
      must(past.estVisible, "過去の年代へ動かしたら、但し書きが消えた");
      must(past.toggles === 0, `断りを隠せる仕掛けがある（${past.toggles} 個）`);
      must(past.year.length > 0 && /いまの街/.test(past.note),
        `過去へ動かすと年代または重ねの注意が消える: ${past.year} / ${past.note}`);
      return `${r.text}／過去でも残る「${past.year}・${past.note}」／隠す仕掛け 0 個`;
    },
  },
  {
    // ⚠ **3D の帯の補足は 1 行だけ**（2026-08-21。hidetzu/konjaku#151。Owner 判断）。
    //   ⚠ 前は `#est` が 1 要素で**分数を 2 つ**持っていた
    //     （⚠ 建てられた年 N / M ／ 高さ N / M）。
    //   ⚠ 実測（2026-08-21・`main` = `484629c`・375×667・渋谷・SW 無効・hasTouch）:
    //     ⚠ `#est` だけで **329×69px の 2 行**。⚠ HUD 全体で常時 **18 行 / 200 字・数字 8 個**、
    //     ⚠ `#land` と合わせて **画面の 66%** を覆っていた。
    //   ⚠ **分母つきの主張は消していない。**⚠ パネル（`prov.js` の建物 2 行）へ移した
    //     （⚠ 掟 §1・§6。⚠ **消すのではなく、⚠ 読める場所を変えた**）。
    //   ⚠ **「演出」→「推定」**（Owner 判断）。⚠ **半分だけ残さない。**
    name: "3D の帯は 1 行で、数字はパネルで分母つきに読める", path: `/peel?${TOYOSU}`,
    async check(page) {
      const out = [];
      for (const [w, h, t] of [[375, 667, true], [1280, 800, false]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: t, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await peelReady(p2);
          await p2.waitForFunction(
            () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
            null, { timeout: 60000 });
          await settleAfterCondition(p2);
          // ⚠ **狭い幅では 3 つの問いを畳む**（2026-08-23。Owner 判断）。
          //   ⚠ **分母つきは板の中。**⚠ **広げてから読む**（⚠ 主張は変えていない）。
          await openPanel(p2);
          await settleAfterCondition(p2);
          const r = await p2.evaluate(() => ({
            // ⚠ **補足は配列になった**（2026-08-22）。⚠ **断りだけを読む**（⚠ 案内は別の役目）。
            //   ⚠ **主張は「⚠ 断りは 1 行で、⚠ 数字を含まない」**（⚠ 分数はパネルへ移した）。
            est: [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
              .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
              .filter((t) => /消える年代/.test(t)).join(" ／ "),
            hud: (document.getElementById("hud").innerText || "").replace(/\s+/g, " ").trim(),
            all: (document.body.innerText || "").replace(/\s+/g, " ").trim(),
            prov: [...document.querySelectorAll("#panel .prov-q")]
          .map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim(),
          }));
          // ⚠ AC1: 帯は 1 行。⚠ **数字を 1 つも含まない**
          // ⚠ **句点は付けない**（2026-08-22。⚠ 箇条書きの 1 行なので、⚠ 並びの作法にそろえた）。
          must(/^建物が消える年代は推定です。?$/.test(r.est),
            `${w}px: 帯が 1 行になっていない: 「${r.est}」`);
          must(!/[0-9]/.test(r.est), `${w}px: 帯に数字が残っている: 「${r.est}」`);
          // ⚠ AC2: HUD に分数が 0 個
          // ⚠ **否定形なので、⚠ 空白でずれると「0 個」になり、⚠ 何も見ない**（2026-08-23）
          const hudFrac = (r.hud.match(/\d+\s*\/\s*\d+/g) ?? []);
          must(hudFrac.length === 0, `${w}px: HUD に分数が残っている: ${hudFrac.join(" / ")}`);
          // ⚠ AC3: パネル側に、⚠ 建設年と高さが **それぞれ 1 回だけ** 分母つきで
          // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断）。⚠ **主張は同じ**:
          //   ⚠ **建設年と高さが、⚠ それぞれ 1 回だけ、⚠ 分母つきで出ていること。**
          const dated = (r.all.match(/建てられた年が分かる\s*\d+\s*\/\s*\d+/g) ?? []);
          const hgt = (r.all.match(/高さが分かる\s*\d+\s*\/\s*\d+/g) ?? []);
          must(dated.length === 1, `${w}px: 建設年の分母つきが ${dated.length} 回`);
          must(hgt.length === 1, `${w}px: 高さの分母つきが ${hgt.length} 回`);
          // ⚠ **台帳は「どう決めたか」を言う**（⚠ 件数は言わない）
          must(/消えるか|見込み/.test(r.prov), `${w}px: 建設年の決め方がパネルに無い`);
          must(/種別ごとの既定値/.test(r.prov), `${w}px: 高さの決め方がパネルに無い`);
          // ⚠ AC4: 画面のどこにも「演出」が無い
          must(!/演出/.test(r.all), `${w}px: 「演出」が残っている（言い換えが半分だけ）`);
          out.push(`${w}px 帯「${r.est}」／HUD の分数 0／パネル ${dated[0]}・${hgt[0]}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ 建設年が分かる建物と、こちらが決めた建物を、同じ顔で出さない。
    //   exact は「建設年が分かっている」印だが、**集計にしか使われておらず
    //   描画に一度も効いていなかった**。豊洲では 8 件と 525 件が
    //   画面上でまったく同じに見え、同じように消えていた（2026-08-14 検証者の指摘）。
    name: "建設年が分かる建物を、こちらが決めた建物と同じに描かない", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // ⚠ **2026-08-21 に「演出」→「推定」へ統一**（hidetzu/konjaku#151。Owner 判断）
      must(/建物が消える年代は推定/.test(t), "「消える年代は推定」の断りが消えている");
      must(!/演出/.test(t), `画面に「演出」が残っている（言い換えが半分だけ）: ${t.slice(0, 120)}`);
      // ⚠ 言い方も1つにする。#est が「建てられた年」、#prov が「建設年」と、
      //   同じことを別の語で2回言っていた（数字が3か所にあったのと同じ話）。
      // ⚠ **件数は内訳が持つ**（2026-08-22）。⚠ **主張は同じ**（⚠ 分母つきで 1 か所）。
      must(/建てられた年が分かる\s*\d+\s*\/\s*\d+/.test(t), `分母つきで言っていない: ${t.slice(0, 120)}`);
      // ⚠ この断りは、**パネルを開かなくても読める場所**に無いと意味がない。
      //   実測（2026-08-15）: 断りは #prov にしか無く、スマホでは
      //   ☰ を押して 254px スクロールしないと届かなかった。
      //   #est は建物が見えているあいだ 0 アクションで読める。
      // ⚠ **2026-08-21 に、⚠ 帯は 1 行に減った**（分数はパネルへ）。⚠ 断り自体は帯に残る。
      const est = (await page.locator("#notes").innerText()).replace(/\s+/g, " ");
      must(/建物が消える年代は推定/.test(est),
        `常時見える場所に断りが無い: ${est.slice(0, 90)}`);
      must(!/\d/.test(est), `帯に数字が残っている（分数はパネルへ移した）: ${est.slice(0, 90)}`);
      // ⚠ 同じ数字を2か所に置かない（掟: 同じ問いに答える実装を2つ持たない）。
      //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった（当時の分母）。
      const dated = (t.match(/建てられた年が分かる\s*(\d+)\s*\/\s*(\d+)/) ?? [])[0];
      const times = t.split(/建てられた年が分かる\s*\d+\s*\/\s*\d+/).length - 1;
      must(times === 1, `「${dated}」が画面に ${times} 回出ている`);
      const bare = (t.match(new RegExp(`${(dated.match(/(\d+) \/ (\d+)/) ?? [])[0]}`, "g")) ?? []).length;
      must(bare === 1, `「${(dated.match(/\d+ \/ \d+/) ?? [])[0]}」という数字が画面に ${bare} 回出ている`);

      const btn = page.locator("#peekY");
      must(await btn.count() === 1, "建設年が分かる件を光らせる操作が無い");
      const before = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerdown");
      await page.waitForTimeout(300);
      const during = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerup");
      await page.waitForTimeout(300);
      const after = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));

      must(/"exact"/.test(during), `押しても exact が色に効いていない: ${during.slice(0, 90)}`);
      must(!/"exact"/.test(before), "既定の色に exact が混ざっている（既定は明治期の判定だけ）");
      // ⚠ 離したら必ず戻す。戻し忘れると別の意味の色が居座り、
      //   「99.6% が水色」と言いながら画面が灰色になる
      must(after === before, `離しても色が戻っていない: ${after.slice(0, 90)}`);
      return `既定→exact→既定 に戻る／${dated}（画面に 1 回だけ）`;
    },
  },
  {
    // ⚠ 建物には安定した ID が無い（配るタイルも Overpass 経路も OSM の id を落としている）。
    //   重心を鍵にしているので、**見つからないこと**が普通に起きる。
    //   そのとき黙って別の建物を選ぶと、共有先だけ違う建物の話になる。
    name: "共有された建物を復元し、見つからなければ別の建物を選ばない", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 内部フィールドに触らない。描かれている素性から鍵を読む
      const key = await page.evaluate(() =>
        map.querySourceFeatures("bld").find((f) => f.properties.k)?.properties.k ?? null);
      must(key, "建物に鍵が付いていない（URL で名指しできない）");
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1200, height: 780 }, serviceWorkers: "block" });
      let pop = 0, card = "", pop2 = 0, miss = "";
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}&b=${encodeURIComponent(key)}`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(2500);
        pop = await p2.locator(".pick-pop").count();
        // ⚠ **2026-08-21 に、⚠ 押した結果は吹き出しの 1 か所だけになった**
        //   （⚠ パネルの `#pick` を消した。⚠ 利用者役 4/4 が「要らない」）。
        //   ⚠ **見ている主張は同じ**: 共有された鍵から、⚠ 建物の中身が復元されること。
        card = (await p2.locator(".pick-pop .maplibregl-popup-content").textContent())
          .replace(/\s+/g, " ").trim();
        must(pop >= 1, "共有された建物の吹き出しが出ていない");
        must(card.length > 0, "共有された建物の中身が出ていない");
        must(await p2.locator("#pick").count() === 0,
          "パネルにも建物の板が戻っている（結果は押した場所の 1 か所）");
        // --- 見つからない鍵 ---
        const p3 = await ctx.newPage();
        await p3.goto(`${BASE}/peel?${TOYOSU}&b=1.000000,1.000000`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(2500);
        pop2 = await p3.locator(".pick-pop").count();
        must(pop2 === 0, "見つからない鍵なのに、別の建物を選んでいる");
        const m = await p3.locator("#stateMiss").evaluate((e) =>
          ({ hidden: e.hidden, t: e.textContent.replace(/\s+/g, " ").trim() }));
        must(!m.hidden && /見つかりませんでした/.test(m.t),
          `見つからなかったことを言っていない: ${JSON.stringify(m)}`);
        miss = m.t;
      } finally { await ctx.close(); }
      return `鍵 ${key} → 吹き出し ${pop} 個「${card.slice(0, 22)}」`
        + `／無い鍵 → ${pop2} 個・「${miss.slice(0, 24)}」`;
    },
  },
  {
    name: "3D から戻っても、調べていた場所が残る", path: `/peel?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。スマホはパネルが閉じて始まるので、
    //   パネルの中にしか戻る手段が無いと**画面から戻れなくなる**
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 戻る手段が、最初から画面に見えていること。
      //   以前はパネルの中の「←今昔」だけで、実測すると
      //     スマホ y=688・18px・パネルは閉じて始まる → 画面に戻る手段が1つも無い
      //     PC     y=737・18px                     → 最下端の細い行
      //   しかも「←今昔」はロゴに見えて、戻る操作に読めなかった（2026-08-14）。
      const back = await page.evaluate(() => {
        const a = document.getElementById("back"), r = a?.getBoundingClientRect();
        return { has: !!a, y: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null,
          text: (a?.textContent ?? "").replace(/\s+/g, " ").trim(),
          shown: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
            && getComputedStyle(a).opacity !== "0" };
      });
      must(back.has, "戻る手段が無い");
      must(back.shown, `戻る手段が画面に見えていない: ${JSON.stringify(back)}`);
      must(back.h >= 44, `戻るが指で押すには小さい: ${back.h}px`);
      // ⚠ href は絶対URLで返るので getAttribute で見る（書き戻しで壊した過去がある）
      const href = await page.locator("#back").getAttribute("href");
      must(/[?&]q=/.test(href) && /[&?]ll=/.test(href),
        `戻り先が場所を落としている: ${href}`);
      // ⚠ 年代も持って戻る。以前は場所だけで、← を押すと見ていた年代が落ちていた。
      //   ⚠ 段が確定する前の「現在」が焼き付かないこと（loadArea で1回書くだけにして踏んだ）
      must(/[&?]era=/.test(href), `戻り先が年代を落としている: ${href}`);
      await page.locator("#back").click();
      await page.waitForFunction(() => {
        const t = document.getElementById("verdict")?.textContent ?? "";
        return t.length > 0 && !t.includes("判定中");
      }, null, { timeout: 45000 });
      const chip = await page.locator("#chipName").textContent().catch(() => "");
      must(chip.includes("豊洲"), `戻ったのに場所が消えている: 「${chip}」`);
      return `戻り先 ${href} ／ 場所「${chip}」が残る`;
    },
  },
  {
    // ⚠ **/peel に場所を探す口を置かない**（2026-08-18 方針）。
    //   この画面は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
    //
    //   ⚠ 以前ここには「別の場所を見る」（畳んだ検索欄・地名 10 件・現在地）があり、
    //     それを守る検査（畳んで 27px → 押すと 218px）が立っていた。外した理由は 2 つ:
    //       ・トップは **3D の下地がある場所にだけ**導線を出しているのに、
    //         こちらの検索からは**下地の無い場所へ入れてしまう**
    //         （地図は動くのに建物が出ない。出るかどうかは Overpass の混雑しだい）
    //       ・検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
    //
    // ⚠ **消しただけの検査にしない。** 元の検査が守っていたのは
    //   「この画面から場所を変えられること」なので、**その手段が残っていること**を見る。
    //   いまの手段は「← もどる」→ トップの ✕ の一本だけ。
    //   だから、もどる先が**いま見ている場所を持っている**ことまで確かめる。
    name: "3D に場所を探す口は無く、もどると同じ場所のトップへ出る", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      const got = await page.evaluate(() => ({
        // 探す口の残骸。id が残っていると、CSS だけ消したつもりが押せる状態になりうる
        ids: ["q", "cands", "quick", "here", "hereMsg", "findBox", "findLabel"]
          .filter((k) => document.getElementById(k)),
        // ⚠ 年代のつまみ（input[type=range]）は探す口ではない。文字を打つ入れ物だけ数える
        typed: [...document.querySelectorAll("input, textarea")]
          .filter((e) => e.tagName === "TEXTAREA"
            || !["range", "checkbox", "radio", "button", "hidden"].includes(e.type))
          .map((e) => e.id || e.type),
        places: typeof window.KonjakuPlaces,
        back: document.getElementById("back")?.getAttribute("href") ?? "",
      }));
      must(!got.ids.length, `探す口が残っている: ${got.ids.join("・")}`);
      must(!got.typed.length, `文字を打つ入れ物が残っている: ${got.typed.join("・")}`);
      // ⚠ 使う相手がいないのに配らない。⚠ ただし「検索を書くなら places.js」の決まりは生きている
      must(got.places === "undefined", "places.js を読み込んでいる（この画面に使う相手がいない）");
      // 場所を変える手段が、画面から消えていないこと
      must(/^\.\/\?q=/.test(got.back) && /ll=/.test(got.back),
        `もどる先が、いま見ている場所を持っていない: ${JSON.stringify(got.back)}`);
      const back = await page.evaluate(() => {
        const b = document.getElementById("back"), r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 vis: b.checkVisibility({ checkVisibilityCSS: true }) };
      });
      must(back.vis, "「← もどる」が見えていない（場所を変える手段が画面に無い）");
      must(back.h >= 44, `「← もどる」が指で押せる大きさでない: ${back.w}×${back.h}px`);
      return `探す口 0 個／文字入力 0 個／places.js 未読込／もどる先 ${got.back.slice(0, 34)}…`
        + `（${back.w}×${back.h}px）`;
    },
  },
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
