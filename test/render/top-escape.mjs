// 実描画 — 外から来た文字列が、そのまま実行されないこと（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 1 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **移設と改名を同時にやらない**（`.claude/rules/components.md`）。
//
// ⚠ **並びを動かしていない。**⚠ **元は `top.mjs` の `CASES` の末尾 3 件**なので、
//   ⚠ **末尾へ spread し直せば、⚠ 順番もシャードの割り当ても 1 つも変わらない**
//   （⚠ 走者は `dep` で絞り、⚠ `i % n` で配る。`test/render.mjs`）。
//
// ⚠ **ここが守っているもの**（⚠ どれも ⚠ **外から来た文字列**が入り口）:
//     事物の一覧・印・寄せた先   ⚠ ev タイルの中身
//     検索候補                   ⚠ 住所検索の応答
//     保存一覧・共有カード       ⚠ 共有された URL の地名（`?q=`）
//
// ⚠ **「外へ何を出しているか」は別の問い**（⚠ `test/check/safety.mjs` と同じ分け方）。
//   ⚠ **こちらは「外から来たものをどう扱うか」だけ。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { XSS, notRun, shownAsText, must, waitVerdict, waitStrip, photoFrames } from "./lib.mjs";

export const CASES = [
  {
    // Issue の再現手順そのもの。取り込み済みの土地（広島）の ev タイル1枚を差し替える
    name: "外部の文字列が、事物の一覧・印・寄せた先で実行されない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    setup: (page) => page.route("**/data/ev/12/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ tile: [12, 0, 0], at: "2026-08-15", f: [
        { id: "Q1", l: `広島城${XSS}`, k: "建造物", c: [132.45500, 34.39500],
          y: [1589, null], p: "year", n: `毛利輝元が築いた城${XSS}`,
          // ⚠ esc() だけでは href="javascript:…" は塞げない。押した瞬間に実行される
          u: `javascript:window.__pwned=(window.__pwned||0)+1` },
      ] }),
    })),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期の帯には年が無いので、写真のある年代へ動かす
      await photoFrames(page).first().click();
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#ev", "一覧");
      const row = await shownAsText(page, ".ev-it .ev-l", "一覧の名前");
      await shownAsText(page, ".ev-it .ev-d", "一覧の説明");
      // 出典URL が http/https でないときは、リンクそのものを出さない
      must(await page.locator(".ev-u").count() === 0,
        "javascript: の出典URLが、押せるリンクとして出ている");
      // 写真の上の印（title 属性の中も HTML）
      await notRun(page, "#pins", "写真の印");
      const pin = await page.locator("#pins .pin").first().getAttribute("title");
      must((pin ?? "").includes("<img"), `印の title に生の文字が残っていない: ${pin}`);
      // 押した先（#fx）。2026-08-15 に足して、エスケープを忘れていた場所
      await page.locator(".ev-it").first().click();
      await page.waitForFunction(() => (document.getElementById("fx")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#fx", "寄せた先");
      await shownAsText(page, "#fx", "寄せた先の名前");
      return `一覧・印・#fx で発火 0 ／ 表示は生のまま「${row.trim().slice(0, 18)}…」／ javascript: のリンクは出さない`;
    },
  },
  {
    name: "外部の文字列が、検索候補で実行されない", path: "/",
    setup: (page) => page.route("**/address-search/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([
        { geometry: { type: "Point", coordinates: [139.7975, 35.6548] },
          properties: { title: `東京都江東区豊洲${XSS}`, dataSource: "", addressCode: "13108" } },
      ]),
    })),
    async check(page) {
      await page.fill("#q", "豊洲");
      await page.waitForFunction(() => document.querySelectorAll("#list .it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#list", "検索候補");
      const t = await shownAsText(page, "#list .it", "検索候補の地名");
      return `候補で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 22)}…」`;
    },
  },
  {
    // ⚠ 地名は共有された URL（?q=）から来る。押させるだけで届く経路なので、
    //   保存一覧と共有カードまで見る
    name: "共有された URL の地名が、保存一覧と共有カードで実行されない",
    path: `/?ll=35.65480,139.79750&q=${encodeURIComponent(`豊洲${XSS}`)}`,
    async check(page) {
      await waitVerdict(page);
      // ★を付けると保存一覧に出る
      await page.click("#mineToggle");
      await page.locator("#stars button").first().click();
      await page.waitForFunction(() => document.querySelectorAll("#saved .row").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#saved", "保存一覧");
      const t = await shownAsText(page, "#saved .row", "保存一覧の地名");
      // 共有カードは canvas に描く（HTML を組み立てていない）。実際に押して確かめる
      await page.click("#shareBtn");
      await page.waitForFunction(() => {
        const n = document.getElementById("shareMsg");
        return n && n.style.display === "block";
      }, null, { timeout: 20000 });
      await notRun(page, "body", "共有カード");
      const msg = await page.locator("#shareMsg").textContent();
      return `保存一覧・共有カードで発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」／ 共有「${msg}」`;
    },
  },
];
