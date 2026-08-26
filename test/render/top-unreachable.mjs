// 実描画 — 取れなかったを「無い」と言わない（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 8 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 5 件を、⚠ そのままの並びで運んだ**（⚠ 直上のコメントも無い塊だった）。
//
// ⚠ **`CLAUDE.md` のいちばん上の原則、⚠ その実描画側**:
//
//     観測されていない  ≠  存在しなかった
//     取得できなかった  ≠  存在しなかった
//     データにない      ≠  現実にない
//
// ⚠ **ここが見ているのは、⚠ 5 通りの「取れなかった」**:
//     通信断     ⚠ **嘘の断定をしない**
//     無応答     ⚠ **待ち続けない**（⚠ 8 秒で中断する）
//     403（画像） ⚠ **「整備対象外」と言わない**
//     403（GeoJSON） ⚠ **「地形分類のデータが無い」と言わない**
//     403（標高） ⚠ **「標高データが無い」と言わない**
//
// ⚠ **403 を「無い」に入れない。**⚠ **拒まれたのは「見せてもらえなかった」であって、
//   ⚠ 「そこにデータが無い」の証拠ではない**（`public/verify.js` に同じ判断がある）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, suggestionsOf, waitVerdict, LIES, VERDICT_SENTENCE, GSI_ROUTE, SWALE_ROUTE, LFC_ROUTE, DEM_ROUTE, forbid, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ ここが崩れると思想が崩れる。
    // GSI への通信を止めても、豊洲が「整備対象外」になってはいけない。
    name: "通信断でも嘘の断定をしない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      const ms = await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `通信断なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 提案は実測した事実からしか出さない。取れていないのだから 0 件
      const sug = await suggestionsOf(page);
      must(!sug.length, `読めていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      // 根拠UI（参照タイルのリンク・読んだ画素・rgba）を出してはいけない。
      // 読んでいないものに根拠を付けると、最も権威ありげな見た目で最も誤ったことを言う。
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 15000 });
      const own = await page.locator("#own").textContent();
      const lie2 = LIES.find((w) => own.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している`);
      must(!/rgba=|読んだ画素/.test(own), "読んでいないのに画素の根拠が出ている");
      must(await page.locator("#own .ev a").count() === 0, "読んでいないのに参照タイルのリンクが出ている");
      must(!own.includes("直読み"), "読めていないのに「直読み」と表示している");
      // 再試行が本当に効くか。失敗をキャッシュに残していると、ここで永久に直らない。
      await page.unroute(GSI_ROUTE);
      await page.click("#retryBtn");
      // ⚠ **ブラウザの中で評価される関数には、Node 側の定数が届かない。**
      //   `VERDICT_SENTENCE` をそのまま書いて ReferenceError にした（2026-08-17）。
      //   引数として渡す。⚠ 正規表現は渡せないので、文字列にして中で組む。
      await page.waitForFunction(
        (src) => new RegExp(src).test(document.getElementById("verdict")?.textContent ?? ""),
        VERDICT_SENTENCE.source, { timeout: 30000 });
      const after = await page.locator("#verdict").textContent();
      // 見出しは地形分類、明治期はバッジ。両方の手法が戻っていることを見る
      must(/旧水部|水部/.test(after), `再試行しても地形分類が戻らない: ${after.slice(0, 60)}`);
      must(after.includes("河川・湖沼・海面"), `再試行しても明治期が戻らない: ${after.slice(0, 60)}`);
      return `${v.trim().split("\n")[0].slice(0, 40)}／根拠なし／${ms}ms で確定`
        + `／再試行で復帰「${after.trim().split("\n")[0].slice(0, 24)}」`;
    },
  },
  {
    // 応答が返ってこない相手。以前は 25 秒経っても「判定中…」のままで復帰手段が無かった。
    name: "無応答でも待ち続けない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, () => { /* 握りつぶす＝無応答 */ }),
    async check(page) {
      const t0 = Date.now();
      const ms = await waitVerdict(page, 25000);   // タイムアウト（8秒）で確定するはず
      const wall = Date.now() - t0;
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `無応答なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      return `${wall}ms で確定（ページ起点 ${ms}ms）／${v.trim().split("\n")[0].slice(0, 34)}`;
    },
  },
  {
    // ⚠ 403 は「無い」ではない（掟: 取れなかったを「無い」と言わない）。
    //   国土地理院の資料にも、403 を不在として読んでよいという記述は無い。
    //   ここは**画像タイル**の経路（明治期の低湿地）。落とすのは swale だけなので、
    //   地形分類が従来どおり答えられることも併せて見る。
    name: "403 でも整備対象外と言わない（画像タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは明治期のタイルだけ。地形分類まで巻き添えにしていないこと
      must(/旧水部|水部/.test(v), `明治期だけ落としたのに地形分類まで消えている: ${v.trim().slice(0, 70)}`);
      // 根拠UI。読んでいない画素と、403 を「タイルが存在しない」根拠にしていないこと
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const meijiCard = cards.find((c) => /^明治期の地形/.test(c)) ?? "";
      must(meijiCard, "明治期の根拠カードが無い（この検査が何も見ていない）");
      must(!/rgba=/.test(meijiCard), `読んでいないのに画素の根拠が出ている: ${meijiCard.slice(0, 80)}`);
      must(!/HTTP\s*403/.test(meijiCard), `403 を根拠として出している: ${meijiCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => meijiCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${meijiCard.slice(0, 80)}`);
      // 拒否が解けたら取れること。失敗をキャッシュに残していると、ここで永久に直らない
      await page.unroute(SWALE_ROUTE);
      await page.click("#retryBtn");
      await page.waitForFunction(
        () => /河川・湖沼・海面/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 30000 });
      return `断定なし（${v.trim().split("\n")[0].slice(0, 24)}）／根拠なし／再試行で明治期が戻る`;
    },
  },
  {
    // ⚠ **GeoJSON** の経路。主題（その土地はどうやってできたか）に直接答えるのがここ。
    //   403 を不在に丸めると「この地点には地形分類のデータが無い」と断定してしまう。
    name: "403 でも地形分類のデータが無いと言わない（GeoJSON）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, LFC_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは地形分類だけ。明治期は従来どおり答えられること
      must(v.includes("河川・湖沼・海面"),
        `地形分類だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const lfCard = cards.find((c) => /^地形分類/.test(c)) ?? "";
      must(lfCard, "地形分類の根拠カードが無い（この検査が何も見ていない）");
      must(!/図式コード/.test(lfCard), `読んでいないのに図式コードが出ている: ${lfCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => lfCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${lfCard.slice(0, 80)}`);
      return `断定なし／地形分類の根拠なし／明治期は従来どおり`;
    },
  },
  {
    // ⚠ **標高**の経路（dem5a → dem）。2枚とも 403 のとき、
    //   「この地点の標高データが無い」と言ってはいけない。
    name: "403 でも標高データが無いと言わない（標高タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, DEM_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/標高を読み込めませんでした/.test(v),
        `標高が読めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      // 読めていない数値を出さない
      must(!/標高\s*-?[\d.]+\s*m/.test(v), `読めていないのに標高の数値を出している: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは標高だけ。判定そのものは従来どおり出ること
      must(v.includes("河川・湖沼・海面"),
        `標高だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const own = await page.locator("#own").textContent();
      must(!/生値/.test(own), "読んでいないのに標高の生値が出ている");
      return `断定なし／標高の数値なし／判定は従来どおり`;
    },
  },
];
