// 実描画 — 待っているあいだと、⚠ 遅れて届いたもの（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 39 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
//
// ⚠ **元ファイルの見出しをそのまま持ってきている**（⚠ 消さない）:
//     `// ---- 判定を待つあいだ、何を見せているか ----`
//
// ⚠ **3 件とも「⚠ まだ答えが無い時間」を見ている**:
//     届かない ⚠ **写真が届かない年代で、⚠ 理由を断定せずに断る**
//     遅れる   ⚠ **遅れて届いた答えが、⚠ ちゃんと画面に乗る**
//     待つ間   ⚠ **判定を待つあいだ、⚠ 現在の写真を先に見せる**（⚠ 「現在」だと名乗る）
//
// ⚠ **待っていることと、⚠ 無いことは違う**（`CLAUDE.md` §1）。
// ⚠ **判定前の写真を、⚠ 判定の答えのように見せない。**
// ⚠ **遅れて届いたものを黙って捨てない**（⚠ 捨てると「無かった」と同じに見える）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  BASE, TOYOSU, waitVerdict, waitStrip, LIES,
  settleAfterClick, LFC_ROUTE, must
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **写真が届かないときに、画面へ出ること**（hidetzu/konjaku#116）。
    //   ⚠ **状態は photos.js、字は words.js、置くのは画面。**⚠ **3 つが繋がっているかを見る。**
    //   ⚠ **理由を断定しない。**`<img>` からは落ちた理由が取れないので late に留める。
    //     ⚠ **「読み込めませんでした」と書いたら落とす。**
    //   ⚠ **Service Worker を止める。**⚠ 止めないとキャッシュから返り、
    //     ⚠ **止めたはずのタイルが届く**（2026-08-20 に踏んだ。naturalWidth=256 のままだった）。
    //   ⚠ **見えているかは checkVisibility()。**⚠ textContent は隠れた字も返す（CLAUDE.md §9）。
    name: "写真が届かない年代で、理由を断定せずに断る", path: "/",
    async check(page) {
      // ⚠ **Service Worker を止めた場を、自分で作る**（走者の既定では止まらない）。
      //   ⚠ 止めないとキャッシュから返り、⚠ **止めたはずのタイルが届く。**
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      let r = null, gone = null;
      try {
        const p2 = await ctx.newPage();
        await p2.route((u) => /xyz\/gazo1\//.test(u.href), (q) => q.abort("connectionrefused"));
        await p2.goto(`${BASE}/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        r = await run(p2);
        gone = r.gone;
      } finally { await ctx.close(); }
      const page2 = null; void page2;
      return r.msg;

      async function run(page) {
      await page.waitForFunction(() => document.querySelectorAll(".strip .f").length > 1,
        null, { timeout: 60000 });
      // ⚠ 止めた年代（1974–78）へ。⚠ **押すと地図が起きる**ので setEra を直に呼ぶ
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /1974/.test(e.textContent)); if (i >= 0) setEra(i); });
      await page.waitForFunction(() =>
        document.getElementById("bigErr")?.checkVisibility?.() === true, null, { timeout: 30000 });
      const r = await page.evaluate(() => {
        const e = document.getElementById("bigErr");
        return { seen: e.checkVisibility(), txt: e.textContent.replace(/\s+/g, " ").trim(),
                 era: document.querySelector(".strip .f.on")?.textContent?.trim() };
      });
      must(r.seen, "写真が届いていないのに、断りが出ていない");
      // ⚠ **理由を知らないので断定しない**（404 と区別できない）
      must(!/読み込めませんでした|取得できませんでした|失敗/.test(r.txt),
        `理由を知らないのに断定している: ${r.txt}`);
      // ⚠ **「無い」と言わない**（掟の一行目）
      for (const w of LIES) must(!r.txt.includes(w), `「${w}」と断定している: ${r.txt}`);
      // ⚠ **通信のせいにしない**（つながっているかどうかを、こちらは知らない）
      must(!/通信|接続|インターネット/.test(r.txt), `理由を知らないのに通信のせいにしている: ${r.txt}`);
      // ⚠ **何の写真かを名乗る**（年代が分からないと、何が出ていないのか読めない）
      must(/写真|地面/.test(r.txt), `何が出ていないのか書かれていない: ${r.txt}`);
      // ⚠ **届いている年代へ戻したら、断りは消える**
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /明治期/.test(e.textContent)); if (i >= 0) setEra(i); });
      await settleAfterClick(page);
      const gone = await page.evaluate(() =>
        document.getElementById("bigErr")?.checkVisibility?.() ?? false);
      must(!gone, "届いている年代なのに、断りが残っている");
      return { gone, msg: `${r.era}: 「${r.txt}」／理由を断定せず・「無い」と言わず・`
        + `通信のせいにしない／戻すと消える` };
      }
    },
  },


  {
    // ⚠ **遅れて届いた答えが、⚠ 画面に乗ること**（契約 6）。
    //   ⚠ 地形分類をわざと 12 秒遅らせる。⚠ **乗らないと、⚠ 古い答えが残る。**
    // ⚠ **2026-08-21 に、⚠ 見る先が HUD からパネルへ移った**（hidetzu/konjaku#152）。
    //   ⚠ 前は「⚠ パネルを閉じてから届かせ、⚠ HUD が更新されるか」を見ていた。
    //   ⚠ **HUD に答えを出さなくなったので、⚠ 閉じる必要も無い。**⚠ 主張は同じ。
    name: "遅れて届いた答えが、画面に乗る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        // ⚠ 地形分類（ベクトル）だけを 12 秒遅らせる
        await p2.route(LFC_ROUTE, async (r) => {
          await new Promise((x) => setTimeout(x, 12000));
          await r.continue();
        });
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForTimeout(4000);
        const before = await p2.evaluate(() =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim());
        // ⚠ **地形分類が届く前でも、⚠ パネルには何か出ている**（⚠ 空を見せない）
        must(before.length > 0, "地形分類が届く前に、パネルが空のまま");
        // ⚠ 遅れて届くのを待つ。⚠ **時間切れで落とさない**（⚠ 何を主張していたのか読めなくなる）
        const moved = await p2.waitForFunction((b) =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim() !== b,
          before, { timeout: 45000 }).then(() => true).catch(() => false);
        const after = await p2.evaluate(() =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim());
        must(moved && after !== before,
          `遅れて届いた答えが画面に乗っていない（古い答えが残る）: 「${before.slice(0, 40)}」`);
        return `閉じた直後「${before.slice(0, 30)}」→ 届いたあと「${after.slice(0, 30)}」`;
      } finally { await ctx.close(); }
    },
  },
  // ---- 判定を待つあいだ、何を見せているか ----
  // ⚠ 実測（3G相当）で、住所を選んでから **2.6秒、文字だけ**だった。
  //   座標は選んだ瞬間に分かっているので、現在の写真は判定を待たずに出せる。
  //   待ち時間が「何も無い」から「いまのその場所を見ている」に変わる。
  {
    // ⚠ **控えを使わない**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **主題が「待っているあいだ」なので、⚠ 冷えた状態で測る。**
    noShelf: true,
    name: "判定を待つあいだ、現在の写真を先に見せる", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    // 判定（地形分類）だけを遅らせて、待っている最中の画面を捕まえる
    setup: (page) => page.route("**/experimental_landformclassification*/**", async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      await r.continue();
    }),
    async check(page) {
      await page.waitForSelector("#quick button");
      await page.locator("#quick button", { hasText: "豊洲" }).click();

      // 判定が終わる前に、骨組みと写真が出ていること
      await page.waitForSelector(".strip.skel", { timeout: 5000 });
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length === 4 && t.some((e) => e.complete && e.naturalWidth > 0);
      }, null, { timeout: 8000 });
      const during = await page.evaluate(() => ({
        skel: !!document.querySelector(".strip.skel"),
        photo: [...document.querySelectorAll("#big .lyr.on .t")].filter((e) => e.naturalWidth > 0).length,
        yr: document.querySelector(".strip-title")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        text: document.getElementById("verdict")?.textContent.replace(/\s+/g, " ").trim() ?? "",
      }));
      must(during.skel, "待っているあいだ、帯の骨組みが出ていない");
      must(during.photo >= 1, "待っているあいだ、写真が1枚も出ていない");
      // ⚠ 出しているのは「現在」だと名乗る。判定前の写真を、判定の答えのように見せない
      must(/現在/.test(during.yr), `待っているあいだの写真が何なのか書いていない: ${during.yr}`);
      must(/判定中/.test(during.text), `判定中であることが書かれていない: ${during.text.slice(0, 40)}`);
      // ⚠ まだ答えていないのに、答えたように見せない
      for (const w of LIES) must(!during.text.includes(w), `判定前に断定している: 「${w}」`);

      // 判定が届いたら、ちゃんと本番の帯に入れ替わること
      await waitVerdict(page, 30000);
      await waitStrip(page);
      must(!(await page.locator(".strip.skel").count()), "判定が出たのに骨組みが残っている");
      must(await page.locator("#strip .f").count() >= 4, "判定が出たのに帯が並んでいない");
      return `待機中: 骨組み＋写真 ${during.photo}/4 枚（「${during.yr}」）→ 判定後に帯へ差し替わる`;
    },
  },
];
