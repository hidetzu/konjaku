// 実描画 — 答えの置き場と、⚠ 確かさの段（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 20 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 5 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **切り出すとき、⚠ ケースの閉じ方が 1 つでないことに気づいた**（2026-08-27）:
//     `},`     ⚠ 5 件中 1 件
//     `} },`   ⚠ 5 件中 4 件（⚠ `check` が 1 行で終わる形）
//   ⚠ **「`},` で閉じる」と決めつけた確認が、⚠ 実際に止めた。**
//   ⚠ **いまは括弧の釣り合いで確かめている**（⚠ 字の形に頼らない）。
//
// ⚠ **ここが守っているもの**:
//     押さずに読める ⚠ **答えは 3 つ目の問いの中にあり、⚠ どの幅でも押さずには読めない**
//                    ⚠ **`docs/SPEC.md` は同じことを言うが、⚠ 寸法は書かない**（⚠ **寸法はここが持つ**）
//     HUD の外       ⚠ **補足は HUD の外に出ており、⚠ どの幅でも読める**（ADR 0033）
//     粗いなら粗いと ⚠ **広い区分に落ちたら、⚠ `/peel` でもそう言う**
//                    ⚠ **詳細版がある土地では、⚠ 粗いとは言わない**（⚠ 逆も見る）
//     順             ⚠ **答え → 建物の足元判定 → 使用しているデータ**（ADR 0030）
//
// ⚠ **土地の答えは、⚠ 確実性の高い順に 3 層で出す**（ADR 0030）。
//   ⚠ **ここが見ているのは、⚠ その層が「どこに」「どの順で」出るか。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, KARUIZAWA, stubMapPictures, peelReady, settleAfterCondition, settleAfterClick, must, openPanel } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **答えが、⚠ どの幅で、⚠ 何手で読めるか**（2026-08-23。hidetzu/konjaku#217 で置き場所が変わった）。
    // ⚠ **`docs/SPEC.md` は同じことを言うが、⚠ 寸法は書かない**（⚠ **寸法はここが持つ**）。
    //   ⚠ **実際に古くなった**: SPEC は「答えと分母は情報パネルの上端に出る／4 幅とも押さずに見えている」と
    //     ⚠ **言い続けていた**（2026-08-22 実測）。⚠ **測り直すと 4 幅とも成り立っていなかった。**
    // ⚠ **`checkVisibility()` では足りない。**⚠ **親のはみ出し切り取りを見ない。**
    //   ⚠ **PC は `#panel` が中でスクロールする**ので、⚠ **答えがパネルの外にあっても「見えている」と答える。**
    //   ⚠ **だから、⚠ その点に本人が居るか（`elementFromPoint`）で見る。**
    name: "答えは 3 つ目の問いの中にあり、どの幅でも押さずには読めない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true, setup: stubMapPictures,
    async check(page) {
      const ready = () => page.waitForFunction(
        () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
        null, { timeout: 45000 });
      await ready();
      await settleAfterCondition(page);
      const probe = () => page.evaluate(() => {
        const leaf = (re) => [...document.querySelectorAll("#result *")]
          .filter((x) => !x.querySelector("*")).find((x) => re.test(x.textContent ?? ""));
        // ⚠ **その点に本人が居るか。**⚠ 親の切り取りも、⚠ 上に乗ったものも、⚠ まとめて見られる
        const at = (el) => {
          if (!el) return { there: false, top: null };
          const r = el.getBoundingClientRect();
          const t = document.elementFromPoint(
            Math.round(r.left + Math.min(r.width, 40) / 2),
            Math.round(r.top + Math.min(r.height, 20) / 2));
          return { there: !!t && (t === el || el.contains(t) || t.contains(el)), top: Math.round(r.top) };
        };
        return { q1: at(leaf(/ここはどんな土地/)), ans: at(leaf(/足元（建っている地面）を判定できた/)) };
      });
      const out = [], wrong = [];
      // ⚠ **幅を変えるだけでは足りない。**⚠ **その幅で開き直す**（上のケースと同じ理由）。
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready();
        await settleAfterCondition(page);
        const before = await probe();
        const opener = page.locator("button").filter({ hasText: "全画面で読む" }).first();
        const hasOpener = await opener.count() > 0;
        let after = null;
        if (hasOpener) { await opener.click(); await page.waitForTimeout(800); after = await probe(); }
        out.push(`${w}×${h} 押す前:答え=${before.ans.there ? "居る" : "居ない"}`
          + ` ／ 1手=${hasOpener ? `答え=${after.ans.there ? "居る" : "居ない"}(y${after.ans.top})`
                                 + ` 第1層=${after.q1.there ? "居る" : "居ない"}(y${after.q1.top})`
                                 : `無し（開いて始まる。第1層 y${before.q1.top}）`}`);
        // ⚠ **主張 1: 答えは、⚠ どの幅でも押さずには読めない**
        if (before.ans.there) wrong.push(`${w}×${h} で、⚠ 押さずに答えが読める`);
        // ⚠ **主張 2: 第1層の見出しは、⚠ 1 手（PC は 0 手）で読める**
        const q1 = hasOpener ? after.q1 : before.q1;
        if (!q1.there) wrong.push(`${w}×${h} で、⚠ ${hasOpener ? "1 手でも" : "押さずに"}第1層が読めない`);
        // ⚠ **主張 3: 狭い幅には「全画面で読む」がある。**⚠ **PC には無い**（開いて始まる）
        if ((w < 700) !== hasOpener) wrong.push(`${w}×${h} で「全画面で読む」の有無が違う（${hasOpener}）`);
      }
      // ⚠ **落とすときは throw**（⚠ **戻り値で伝えると、⚠ 絶対に落ちない**）。
      if (wrong.length) throw new Error(`答えの読める手数が変わった: ${wrong.join(" ／ ")}｜ 実測 ${out.join(" ｜ ")}`);
      return out.join(" ｜ ");
    },
  },
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
];
