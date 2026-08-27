// 実描画 — 場所を選んだあとの、次の一歩（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 6 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 7 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **元は `建物を取り込み済みの土地では、外へ出ない` という見出しの下にあった。**
//   ⚠ **その見出しは z14 タイルの集計範囲の話**で、⚠ **この 7 件のどれとも合っていない。**
//   ⚠ **私が触る前からずれていた**（⚠ 履歴で確認）。
//   ⚠ hidetzu/konjaku#232 が予告していた「名前と中身が合っていない塊」。
//
// ⚠ **ここが守っているもの**（⚠ どれも ⚠ **場所を選んだあと**の話）:
//     次の一歩     ⚠ **明治期に着いた人が、⚠ 説明だけ読んで終わらない**
//     寄る         ⚠ **一覧の行を押したら、⚠ その結果が画面に入る**
//     年代の共有   ⚠ **選んだ年代が URL に載り、⚠ 共有先でもそこから始まる**
//     復元できない ⚠ **その土地に無い年代なら、⚠ 黙って別の年代にしない**
//     説明         ⚠ **押す前に読めて、⚠ 名前の言い換えは出さない**
//     選び直し     ⚠ **検索中に場所を選んでも、⚠ 古い候補で一覧を上書きしない**
//     未整備       ⚠ **まだ用意していない場所を、⚠ 「取得できなかった」と言わない**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { BASE, TOYOSU, waitVerdict, waitStrip, stubMapPictures, peelReady, settleAfterCondition, settleAfterClick, settleAfterScroll, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ 着いたときの帯の既定は最古＝明治期で、明治期には年が無い。
    //   つまり**初めて来た人が最初に見る事物の枠は、必ずこの注記**だった。
    //   実測（UI/UX・2026-08-14）: 30秒のあいだ「このころ何があった？」が
    //   一度も画面に現れていなかった。説明だけを置いて、次の一歩が無かった。
    name: "明治期に着いた人に、次の一歩がある", path: `/?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。PC では1行に収まって 34px になり、44px の判定が意味を失う
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const era = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(era === "明治期", `着いたときが明治期でない（この検査の前提が消えた）: ${era}`);

      const step = page.locator("#evStep");
      must(await step.count() === 1, "明治期に着いたのに、次の一歩が無い");
      // ⚠ 指で押せる大きさ。ここは初めて来た人が最初に触る唯一の一歩
      const h = await step.evaluate((e) => e.getBoundingClientRect().height);
      must(h >= 44, `一歩が指で押すには小さい: ${Math.round(h)}px`);
      // ⚠ **「年がありません」の断りは、⚠ 深掘りへ移した**（2026-08-28。hidetzu/konjaku#142）。
      //   ⚠ **ここに残っていないこと**（⚠ 移したのに両方に出ていたら、⚠ 移せていない）。
      //   ⚠ **年が無いことを言う側は `peel-press.mjs` が見る**（⚠ 対で見る。`verify` §5）。
      const t = (await step.textContent()).replace(/\s+/g, " ");
      must(!/年がありません/.test(t), `断りがトップに残っている（深掘りへ移したはず）: ${t}`);
      // ⚠ **一歩は、⚠ 行き先の年代を名乗ること**（⚠ 押す前に、⚠ どこへ行くか読める）
      must(/\d{4}/.test(t), `一歩が行き先の年代を言っていない: ${t}`);

      // ⚠ ここが本体。**押した先が空でないこと**。
      //   最初の写真の年代へ送っていた版は、豊洲で 0 件だった（埋立前なので当然）。
      //   「押しても何も起きない一歩」を置かない
      await step.click();
      await settleAfterClick(page);
      const after = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(after !== "明治期", `押しても年代が動いていない: ${after}`);
      const rows = await page.$$eval("#ev .ev-it .ev-l", (els) => els.length);
      must(rows > 0, `押した先が空（${after} で 0 件）。中身のある年代へ送ること`);
      return `明治期 → ${after} で ${rows} 件／一歩 ${Math.round(h)}px`;
    },
  },
  {
    // ⚠ 「位置を見る」を押した結果が、**画面に入っていること**。
    //   実測（2026-08-14・375×667）: 一覧を読んでいる位置から押すと、写真の枠は
    //   画面の 69px 上にあり、**見えている割合 0%** だった。
    //   利用者役のエージェント3体とも「何も起きない」「押せてないのかと思った」と言った。
    //   ⚠ 同じ症状を過去に静止画の経路では直してあり、そのコメントもすぐ下にあったのに、
    //     地図の経路だけ return していて手当てに届いていなかった。
    name: "行を押すと、寄った結果が画面に入る", path: `/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await settleAfterCondition(page);
      // 一覧を読んでいる位置（画面の真ん中）から押す
      await page.evaluate(() => document.querySelector(".ev-it")?.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      const seen = () => page.evaluate(() => {
        const r = document.getElementById("big").getBoundingClientRect();
        return { pct: Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
          / r.height * 100), zoom: document.getElementById("big").classList.contains("zoom") };
      });
      const before = await seen();
      const name = (await page.locator(".ev-it").first().locator(".ev-l").innerText()).trim();
      await page.locator(".ev-it").first().click();
      // ⚠ 押した先で画面が寄る。⚠ **寄り終わるまで待つ**（時間で待たない）
      await page.waitForFunction(() =>
        document.getElementById("big")?.classList.contains("zoom"), null, { timeout: 30000 });
      await settleAfterScroll(page);
      const after = await seen();
      must(after.zoom, "押しても寄っていない");
      // ⚠ ここが本体。寄っただけで見えていなければ、押しても何も起きないのと同じ。
      //   ⚠ 実装が「半分見えていれば動かさない」、検査が「8割見えていること」で食い違っていた。
      //     写真の下から操作を1つ外して版面が 20px 縮んだだけで表に出た（広島 65%・2026-08-16）。
      //     → 要求（8割）はここに置いたまま、画面側の約束が下がっていないことも見る。
      //       定数を読むだけにすると、実装を下げたときに検査も一緒に下がって気づけない。
      const promised = await page.evaluate(() => SEEN_ENOUGH);
      must(promised >= 0.8, `画面側が約束している割合が下がっている（SEEN_ENOUGH=${promised}）`);
      must(after.pct >= 80, `寄った結果が画面に入っていない（見えているのは ${after.pct}%）`);
      // ⚠ 「寄った」だけでは足りない。実測（2026-08-14・利用者役のエージェント3体）: 押した行は
      //   画面から出ていき、17行中15行で**名前がどこにも残らなかった**。
      //   画面にはぼやけた写真と同じ色の丸が複数あるだけで、
      //   「動いたのは分かるが、何に寄ったのか分からない」と3体とも報告した。
      const fx = await page.evaluate(() => {
        const el = document.getElementById("fx");
        if (!el) return { there: false };
        const r = el.getBoundingClientRect();
        return { there: true, text: el.innerText.trim(),
          vis: getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0,
          size: parseFloat(getComputedStyle(el).fontSize) };
      });
      must(fx.there, "寄せた先に名前を出す枠(#fx)が無い");
      must(fx.vis, "寄せたのに、押したものの名前が画面に出ていない");
      must(fx.text.includes(name),
        `寄せた先の名前が押したものと違う: 押した「${name}」／出ている「${fx.text}」`);
      must(fx.size >= 12, `寄せた先の名前が小さい: ${fx.size}px`);
      // ⚠ 名前が年バッジを覆わないこと。
      //   実測（2026-08-15）: .fx を bottom:46px で別に置いていたら、sub を持つ年代
      //   （1936–42 陸軍撮影 / 1945–50 米軍撮影 / 現在 / 明治期 ＝ 9 コマ中 4 つ）で
      //   年バッジが 46px より高くなり、102×10px 覆っていた。
      //   「米軍撮影」は元から 11.5px で読みにくいのに、その上を隠していた。
      const lap = await page.evaluate(() => {
        const a = document.getElementById("fx").getBoundingClientRect();
        const c = document.querySelector(".strip-title").getBoundingClientRect();
        return { px: Math.round(Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top))),
          yr: document.querySelector(".strip-title").innerText.replace(/\s+/g, " ").trim() };
      });
      must(lap.px === 0, `寄せた先の名前が年バッジ「${lap.yr}」を ${lap.px}px 覆っている`);
      // ⚠ 押した印が、他の印と見分けられること。
      //   地図の印には data-i が付いておらず、実測で印 9 個に対し強調 0 個だった。
      // ⚠ 印は2組ある。静止画の上に打つ #pins の印と、地図の上の印。
      //   地図に切り替わっても #pins は消えないので、全部を1つに数えて
      //   「強調は1個」と書くと必ず落ちる（実測 印16個・強調2個で、これは正しい状態）。
      //   組ごとに「ちょうど1個」を見る。
      const pins = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".big .pin")];
        const g = { 写真: [], 地図: [] };
        for (const e of all) g[e.closest("#pins") ? "写真" : "地図"].push(e);
        return { noIdx: all.filter((e) => e.dataset.i === undefined).length, total: all.length,
          sets: Object.entries(g).filter(([, v]) => v.length)
            .map(([k, v]) => [k, v.length, v.filter((e) => e.classList.contains("on")).length]) };
      });
      must(pins.sets.length > 0, "印が1つも無い");
      must(pins.noIdx === 0, `番号(data-i)の無い印が ${pins.noIdx}/${pins.total} 個ある`);
      for (const [k, n, on] of pins.sets)
        must(on === 1, `${k}の印が強調されていない: ${n} 個中 ${on} 個`);
      // 戻したら、名前も強調も消える（前の年代の名前が写真の上に残らない）
      await page.click("#unzoom");
      await settleAfterClick(page);
      const back = await page.evaluate(() => ({
        fx: document.getElementById("fx").innerText.trim(),
        on: document.querySelectorAll(".big .pin.on,.ev-it.on").length }));
      must(!back.fx && back.on === 0,
        `全体に戻したのに残っている: 名前「${back.fx}」／強調 ${back.on} 個`);
      return `写真が見えている ${before.pct}% → ${after.pct}%`
        + `／名前「${fx.text}」${fx.size}px`
        + `／${pins.sets.map(([k, n, on]) => `${k}の印 ${n} 個中 ${on} 個を強調`).join("・")}`
        + `／戻すと消える`;
    },
  },
  {
    // ⚠ 3D から戻ったとき、調べていた場所が消えないこと。
    //   以前は href="./" のままで、← を押すと空のトップに戻っていた
    //   （利用者役のエージェントによる検証で3体すべてが「最初からになった」と言った）。
    // ⚠ 共有先は**別の入れ物**で開く。同じ入れ物で開き直すと、画面に残っている状態で
    //   通ってしまい、URL が状態を運べているのかを何も確かめていないことになる
    //   （実測 2026-08-16: 直す前は トップ data-i=8 → 共有先 0、/peel t=400 → 0 に戻っていた）。
    name: "選んだ年代が URL に載り、共有先でもそこから始まる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      const n = await page.locator("#strip .f").count();
      // いちばん右（現在）を選ぶ。着いたときの既定は最古なので、必ず動く
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      const url = page.url();
      must(/[?&]era=seamlessphoto/.test(url), `選んだ年代が URL に載っていない: ${url}`);

      // --- 共有先（別の入れ物） ---
      const ctx = await page.context().browser().newContext({
        viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p2 = await ctx.newPage();
      let top = null, peel = null;
      try {
        await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
          null, { timeout: 60000 });
        await p2.waitForTimeout(300);
        top = await p2.evaluate(() => [...document.querySelectorAll("#strip .f")]
          .findIndex((e) => e.classList.contains("on")));
        must(top === n - 1, `共有先で年代が既定に戻っている: ${top} / ${n - 1}`);

        // /peel も同じ約束。段は土地ごとに間引かれるので、位置ではなく年代IDで運ぶ
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(1200);
        await p2.$eval("#t", (e) => { e.value = "400";
          e.dispatchEvent(new Event("input", { bubbles: true })); });
        await p2.waitForTimeout(500);
        const purl = p2.url();
        must(/[?&]era=gazo1/.test(purl), `/peel の年代が URL に載っていない: ${purl}`);
        const p3 = await ctx.newPage();
        await p3.goto(purl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(1500);
        peel = await p3.$eval("#t", (e) => e.value);
        // ⚠ 段の境界ちょうどで戻ること。中途半端な値だと年代名は出ても場面が入りきらない
        must(peel === "400", `/peel の共有先で段が戻っていない: ${peel}`);
      } finally { await ctx.close(); }
      return `トップ ${n} コマ中 ${top} 番目／/peel t=${peel}（どちらも別の入れ物で復元）`;
    },
  },
  {
    // ⚠ 指定された年代がその土地に無いことは普通に起きる（残っている写真は土地ごとに違う）。
    //   黙って別の年代を出すと、共有した人と見た人が違うものを見ていることに誰も気づかない。
    //   長崎 出島には 1936–42（ort_riku10）が残っていない。
    name: "共有された年代がその土地に無いとき、黙って別の年代にしない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6&era=ort_riku10`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      must(await page.locator("#eraMiss").count() === 1,
        "復元できなかったことを、画面で言っていない");
      const t = (await page.locator("#eraMiss").textContent()).replace(/\s+/g, " ").trim();
      must(/1936/.test(t), `求められた年代の名前が出ていない: ${t}`);
      // ⚠ 畳んだ中や画面外に置かない（過去に「判定の結果を畳んだ中に入れた」を踏んでいる）
      const shown = await page.locator("#eraMiss").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
          && getComputedStyle(e).opacity !== "0"; });
      must(shown, "復元できなかったことが画面に見えていない");
      // ⚠ 年代を選ぶ帯より上にあること。選ぶ場所から離すと、次に何をすればよいか分からない
      const order = await page.evaluate(() => {
        const a = document.getElementById("eraMiss"), b = document.getElementById("strip");
        return a && b ? a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top + 1 : false;
      });
      must(order, "案内が、年代を選ぶ帯の上に無い");
      // 出ていない年代を URL に残さない。残すと同じ空振りが共有のたびに伝播する
      must(!/era=ort_riku10/.test(page.url()), `出ていない年代が URL に残っている: ${page.url()}`);
      // 自分で選び直したら、案内は役目を終える
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      must(await page.locator("#eraMiss").count() === 0,
        "年代を選び直しても、案内が残っている");
      return `「${t.slice(0, 34)}」／帯の上に見えている／選び直すと消える`;
    },
  },
  {
    // ⚠ 説明は、押す前に読めるところに出す。
    //   利用者役のエージェントによる検証2周（2026-08-14/15）で、3体の第1位はどちらも「押す前に知りたい」で、
    //   アコーディオン（開かないと読めない）と「…で切り詰めて押すと続き」は
    //   合わせて 0 票だった。後者は PC で「…」が 0 / 2,225 件しか出ず、導線が現れない。
    //   ⚠ 同時に、名前を読めば分かるだけの説明は出さない（実測 29.7% が空になる）。
    name: "説明は押す前に読めて、名前の言い換えは出さない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await settleAfterCondition(page);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".ev-it")].map((e) => ({
        name: e.querySelector(".ev-l")?.innerText.trim() ?? "",
        d: e.querySelector(".ev-d")?.innerText.trim() ?? "",
        // 押す前に、その場で読めていること（開く操作を挟まない）
        vis: !!e.querySelector(".ev-d")?.checkVisibility({ checkVisibilityCSS: true }) })));
      must(rows.length > 0, "一覧が空");
      const withD = rows.filter((r) => r.d);
      must(withD.length > 0, "説明が1件も出ていない");
      must(withD.every((r) => r.vis), "説明が、押すまで読めない場所にある");
      // ⚠ 前置きを落としていること。落とさないと本題が「…」の向こうへ行く
      const lazy = withD.filter((r) => /に(ある|あった|所在)/.test(r.d)
        && /^(日本の|.{2,8}?[都道府県市区町村])/.test(r.d));
      must(lazy.length === 0,
        `地名の前置きが残っている: ${lazy.slice(0, 2).map((r) => r.d).join(" / ")}`);
      // ⚠ 読んでも増えない説明を出していないこと
      const echo = withD.filter((r) =>
        r.name.replace(/[\s・]/g, "").includes(r.d.replace(/[\s・]/g, "")));
      must(echo.length === 0,
        `名前に既出の説明を出している: ${echo.slice(0, 2).map((r) => `${r.name}／${r.d}`).join(" / ")}`);
      // ⚠ 説明が出ない行を「説明が無い」と読ませない
      const src = (await page.locator(".ev-src").innerText()).replace(/\s+/g, " ");
      must(/落とすと何も残らない項目には出ません/.test(src),
        `説明を落としていることを書いていない: ${src.slice(0, 100)}`);
      // ⚠ 行ごとの「位置を見る」は外した。案内は見出しの下に 1 回だけ。
      //   実測（2026-08-15）: PC では説明のある行で **名前と説明のあいだ**に入り、
      //   説明の無い行では右端に来て、同じ画面で位置が 2 か所を行き来していた。
      must(await page.locator(".ev-go").count() === 0,
        "行ごとの「位置を見る」が残っている");
      const tips = await page.locator(".ev-tip").count();
      must(tips === 1, `押せることの案内が ${tips} 個（1 個であること）`);
      must(await page.locator(".ev-tip").checkVisibility?.() !== false, "案内が見えていない");
      // ⚠ 件数ピルが潰れていないこと（flex-wrap が無いと 375/320px で 2 行に割れる）
      const pill = await page.evaluate(() => {
        const e = document.querySelector(".ev-n"); if (!e) return null;
        const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      must(pill && pill.h <= 24, `件数が2行に割れている: ${JSON.stringify(pill)}`);
      return `${withD.length} / ${rows.length} 行に説明（押す前に読める）／例「${withD[0].d}」`
        + `／行のラベルなし・案内は見出しの下に 1 個・件数 ${pill.w}×${pill.h}px`;
    },
  },
  {
    // ⚠ **主題は「古い候補で上書きされないこと」**（hidetzu/konjaku#191）。⚠ **絵は関係ない。**
    //   ⚠ **実測**: 外へ 30 本。⚠ **住所検索は差し替え済みで、⚠ 残りは地図の絵だった。**
    name: "検索中に場所を選んでも、行動一覧が古い候補で上書きされない", dep: "search", path: "/",
    setup: async (page) => {
      await stubMapPictures(page);
      await page.route("**/AddressSearch*", async (r) => {
        await new Promise((x) => setTimeout(x, 2000));
        await r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify([{ properties: { title: "東京都渋谷区" },
                                  geometry: { coordinates: [139.7, 35.66] } }]) });
      });
    },
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(1000);         // 応答はまだ返っていない
      await page.locator(".quick button").first().click();   // 場所を選ぶ（setMode("action")）
      // ⚠ **2026-08-21 に、⚠ 一覧は既定で畳んだ。**⚠ 行ではなく組の見出しを待つ
      await page.waitForFunction(() => document.querySelectorAll("#list .lh.fold").length > 0,
        null, { timeout: 20000 });
      // ⚠ **2026-08-21 に、⚠ 深掘りは判定カードへ移った。**⚠ 一覧に出るのは組の見出し
      const acted = (await page.locator("#list").innerText()).trim();
      must(/公的な情報で確認する/.test(acted),
        `場所を選んでも行動一覧が出ていない: ${JSON.stringify(acted.slice(0, 40))}`);
      must(await page.locator("#verdict #peelCta").count() === 1,
        "場所を選んでも、判定カードに次の体験が出ていない");
      await settleAfterCondition(page);         // ⚠ ここで古い応答が届く
      const after = (await page.locator("#list").innerText()).trim();
      must(!/渋谷区/.test(after),
        `場所を選んだのに、行動一覧が古い候補で上書きされた: ${JSON.stringify(after.slice(0, 40))}`);
      // ⚠ 「変わらないこと」は見ない。判定が進むと行動一覧は**正当に増える**
      //   （最初そう書いて落ちた）。見たいのは**行動一覧のままであること**。
      // ⚠ **2026-08-21 に、⚠ 深掘りは判定カードへ移った。**⚠ 一覧側の目印は組の見出し
      must(/公的な情報で確認する/.test(after),
        `行動一覧でなくなっている: ${JSON.stringify(after.slice(0, 40))}`);
      must(await page.locator("#verdict #peelCta").count() === 1,
        "古い応答が届いたあと、判定カードから次の体験が消えている");
      return `行動一覧のまま（${JSON.stringify(after.slice(0, 18))}）／次の体験は判定カードに 1 つ`;
    },
  },
  {
    // ⚠ **「まだ用意していない」を「取得できなかった」と言わない**（2026-08-18）。
    //   このリポジトリが何度も直してきた並びに、1 行足りていなかった:
    //
    //       観測されていない   ≠  存在しなかった
    //       取得できなかった   ≠  存在しなかった
    //       データにない       ≠  現実にない
    //       まだ用意していない ≠  取得できなかった   ← これ
    //
    //   前者は**こちらの都合**、後者は**相手や回線の都合**。
    //   利用者にとっては「押し直すべきか」が変わるので、意味がまるで違う。
    //
    // ⚠ 実際に破れていた: 一度も取り込んでいない名古屋で
    //   「建物データを取得できませんでした（**Overpass 混雑**）」と書いていた。
    //   利用者役 3/3 がこれを「**自分の通信のせい**」と読み、2 名が「押し直す」と答えた。
    //
    // ⚠ **導線は消さない。** 一度「下地が無い場所では出さない」にしたが、戻した。
    //   出さないと「まだ用意していない」が「この場所には機能そのものが無い」に見え、
    //   利用者役 3/3 が「機能があること自体に気づけない」と答えた。
    // ⚠ そのかわり**押す前に**言う。押して、待たされてから言われるのが最悪、という指摘。
    name: "まだ用意していない場所を、取得できなかったと言わない", path: "/",
    async check(page) {
      const NAGOYA = "q=%E5%90%8D%E5%8F%A4%E5%B1%8B&ll=35.17090,136.88160";
      const top = async () => {
        await page.waitForFunction(
          // ⚠ **字を書き写さない。**⚠ 以前は「です」「ません」を待っており、
          //   ⚠ **言い回しを変えた瞬間に時間切れで落ちた**（2026-08-20）。
          // ⚠ **「判定中…」を除く。**⚠ 除かないと**判定中に素通りする**
          //   （答えの行は、待っているあいだも「この土地の成り立ちを判定中…」を出している。
          //    ⚠ 手元では速くて素通りせず、⚠ **CI で落ちた**）。
          () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                  return t.length > 3 && !t.includes("判定中"); },
          null, { timeout: 45000 });
        await settleAfterCondition(page);
        return page.evaluate(() => ({
          // ⚠ **2026-08-21 に、⚠ 導線が一覧から判定カードの中へ移った**
          peel: document.querySelectorAll('#verdict [href^="./peel"]').length,
          ownPeel: document.querySelectorAll('#own a[href^="./peel"]').length,
          // ⚠ **2026-08-21 に、⚠ 深掘りの字は判定カードへ移った。**⚠ CTA の字を読む
          list: (document.getElementById("peelCta")?.innerText ?? "").replace(/\s+/g, " "),
          own: (document.getElementById("own")?.innerText ?? "").replace(/\s+/g, " "),
        }));
      };
      // (1) 取り込んである場所（豊洲）: 出る。⚠ 断り書きは付けない
      await page.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded" });
      const yes = await top();
      // ⚠ **導線は一覧の 1 か所**（2026-08-21。hidetzu/konjaku#138）。
      //   ⚠ 以前は根拠パネルにも同じカードがあり、⚠ **ここで 2 本あることを求めていた。**
      //   ⚠ 利用者役 4/4 が根拠側を否定した（唐突／2 回出る／根拠の一部に見える）。
      //   ⚠ **見ている主張は変えていない**: 取り込んである場所で導線が出ること。
      must(yes.peel === 1, `取り込んである場所で導線が出ていない: 判定カード ${yes.peel} 本`);
      must(yes.ownPeel === 0,
        `根拠パネルに導線が戻っている: ${yes.ownPeel} 本（導線は一覧の 1 か所）`);
      must(!/順に増やしています/.test(yes.list),
        `対応してある場所に、対応していないと書いている: ${yes.list.slice(0, 80)}`);
      // (2) まだ用意していない場所（名古屋）: ⚠ **出る。押せる。** そのうえで押す前に言う
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const no = await top();
      must(no.peel === 1, `まだ用意していない場所で導線が消えている（機能の存在に気づけない）: ${no.peel} 本`);
      // ⚠ **できないことの通知ではなく、できることの案内から始める**（利用者役 3/3）。
      //   「用意できていません」で始まる案を 3/3 が最下位にした（押す前に断られた、と読む）。
      must(/空中写真|見くらべる/.test(no.list),
        `押す前に、この場所でできることを言っていない: ${no.list.slice(0, 90)}`);
      // ⚠ そのうえで、建物ごとの判定が出ないことは**押す前に**分かること
      must(/対応した場所から順に増やしています/.test(no.list),
        `押す前に、建物ごとの判定が出ないと分からない: ${no.list.slice(0, 90)}`);
      // ⚠ **⚠ の記号を使わない。**すぐ上の「この土地で気をつけること」（災害リスク）と
      //   同じ印になり、利用者役 2/3 が「危ない土地の警告か」と読んだ
      const mark = await page.evaluate(() =>
        document.querySelector('#verdict [href^="./peel"]')?.innerText ?? "");
      must(!mark.includes("⚠"), `在庫の話に ⚠ を使っている（危険の印と紛らわしい）: ${mark.slice(0, 60)}`);
      // ⚠ **根拠パネルに導線を戻さない**（2026-08-21。hidetzu/konjaku#138）。
      //   ⚠ 以前は「一覧と根拠カードで言うことが変わらない」を見ていたが、
      //     ⚠ **根拠カードそのものを消した**ので、⚠ **戻っていないことを見る。**
      //   ⚠ **言い方が 1 か所であることは、⚠ 静的検査が字の持ち主で見ている**
      //     （TOPWORD.peelLead の 1 か所）。
      must(no.ownPeel === 0,
        `根拠パネルに導線が戻っている: ${no.ownPeel} 本（導線は一覧の 1 か所）`);
      // (3) ⚠ 索引を読めなかっただけのときは、何も断らない（取得できなかった ≠ 用意していない）
      await page.route("**/data/assets.json", (r) => r.abort());
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const unknown = await top();
      must(unknown.peel === 1, `索引を読めないだけで導線を消している: ${unknown.peel} 本`);
      must(!/順に増やしています/.test(unknown.list),
        `索引を読めなかっただけなのに「対応していない」と断定している: ${unknown.list.slice(0, 90)}`);
      await page.unroute("**/data/assets.json");
      return `対応済み 1 本（断りなし）／未対応 1 本（押す前に断る・⚠ なし・根拠には置かない）／`
        + `索引を読めないときは断らない`;
    },
  },
];
