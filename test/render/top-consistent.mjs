// 実描画 — 画面と URL が、⚠ いまの選択と食い違わない（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 42 本目・最後）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **2 つの塊を集めたので、⚠ 並びは動く**（⚠ あいだに他の suite の spread が 3 本あった）。
//
// ⚠ **2 件とも「⚠ いま選んでいるものと、⚠ 画面に出ているものが合っているか」を見ている**:
//     同じ画面の中 ⚠ **答えの行・バッジ・写真の年代が、⚠ 互いに食い違わない**
//     外したあと   ⚠ **✕ で場所を外したら、⚠ URL も画面も前の場所を持ち越さない**
//
// ⚠ **見えなくするのと、⚠ 消すのは別**（2026-08-17 にオーナーが実機で見つけた）。
//   ⚠ **前の土地の名前・年代の段・URL が、⚠ そのまま残っていた。**
//
// ⚠ **これは見た目の話ではない。**⚠ **出ている中身が、⚠ いまの選択と違う**という正しさの話
//   （`CLAUDE.md` §1 に近い側。⚠ **利用者からは「そう観測された」と読める**）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  TOYOSU, NIIGATA, waitVerdict, waitStrip, settleAfterClick, must
} from "./lib.mjs";

export const CASES = [
  {
    // UI/UX の実機検証で見つかった初見の穴。どれも「根拠を売りにする製品が、
    // 同じ画面で自分と食い違う」型なので、機械で押さえる。
    name: "同じ画面で自分と食い違わない", path: `/?${NIIGATA}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(400);
      // かつて年代比較の副題に「1936年〜」を固定で書いていて、新潟のバッジ（1945–50）と
      // 34px の距離で食い違っていた。いまは年代を名乗る場所が大きい写真の見出しに移ったので、
      // **食い違いうる組み合わせ全部**を突き合わせる。
      await waitStrip(page);
      const badge = (await page.locator("#verdict .badge").allTextContents())
        .find((t) => t.includes("年から")) ?? "";
      const era = badge.match(/(\d{4}[–-]\d{2})/)?.[1];
      must(era, `写真の年代バッジが読めない: ${badge}`);
      // 着いた瞬間は最古。大きい写真の見出しが、バッジの言う最古と一致すること
      const yrBig = (await page.locator("#yrBig").textContent()).trim();
      must(yrBig.includes(era), `大きい写真の年代がバッジと食い違う: 「${yrBig}」／「${badge}」`);
      // 年代を名乗る行を、一覧の中に**作らない**（作れば必ず食い違いうる）
      const subs = await page.$$eval("#list .it small",
        (els) => els.map((e) => e.textContent.trim()).filter((t) => /\d{4}[–-]\d{2}|\d{4}年/.test(t)));
      must(subs.length === 0, `一覧が年代を名乗っている（食い違いの種）: ${subs.join(" / ")}`);
      // 根拠を開いたら、そこから閉じられること。開くと1.3画面下へ飛ぶので ? には戻れない
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      must(await page.locator("#closeWhy").isVisible(), "根拠を閉じる手段が出ていない");
      await page.click("#closeWhy");
      await page.waitForTimeout(400);
      must(!(await page.locator("#result").isVisible()), "閉じるを押しても根拠が閉じない");
      return `大きい写真「${yrBig.replace(/\s+/g, " ")}」＝バッジ「${badge}」／一覧は年代を名乗らない／閉じられる`;
    },
  },
  {
    // ⚠ **見えなくするのと、消すのは別。** ✕ で場所を外したのに、前の土地の
    //   名前・年代の段・URL がそのまま残っていた（2026-08-17 にオーナーが実機で発見）。
    //   見た目は場所未選択になるので気づけず、**再読み込みすると前の場所が復活していた**。
    //   実測（375×667 / 豊洲）: ✕ の直後 url=?q=豊洲&ll=…&era=swale ／ #strip 9 コマ。
    //   ⚠ この不具合は、それまでの検査を 1 つも落とさなかった。「消えること」を誰も見ていなかった。
    //   状態遷移の契約「✕ → 結果・一覧・場所・古い非同期処理を消す」に反していた。
    name: "✕ で場所を外したら、URL も画面も前の場所を持ち越さない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const look = () => page.evaluate(() => ({
        url: location.search,
        mode: document.body.classList.contains("picked") ? "action" : "place",
        chip: document.getElementById("chipName")?.textContent.trim() ?? "",
        strip: document.querySelectorAll("#strip .f").length,
      }));
      const before = await look();
      // 前提が消えたら落とす（そもそも場所が載っていないなら、この検査は何も確かめない）
      must(/q=/.test(before.url) && before.strip > 0,
        `前提が崩れている（URL に場所が載っていない / 段が無い）: ${JSON.stringify(before)}`);
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const after = await look();
      must(after.mode === "place", `✕ を押したのに場所選択中のまま: ${after.mode}`);
      must(after.url === "", `✕ を押しても URL に場所が残っている: ${after.url}`);
      must(after.chip === "", `✕ を押しても前の場所の名前が残っている: 「${after.chip}」`);
      // ⚠ **隠れているだけ**を通さない。DOM から消えていること
      must(after.strip === 0, `✕ を押しても前の土地の年代の段が ${after.strip} コマ残っている`);
      // ⚠ **消しすぎて壊していないこと。** ✕ の後始末で地図・年代・読み上げまで捨てるので、
      //   **次の場所が選べなくなる**危険がある。
      //   ⚠ ここは**同じページのまま**やる。再読み込みを挟むと状態が作り直され、
      //     「後始末が次の選択を壊した」を一度も通らない（最初そう書いて、壊しても通った）。
      await page.locator("#quick button", { hasText: "渋谷" }).click();
      await waitVerdict(page);
      await waitStrip(page);
      const next = await look();
      must(next.mode === "action", `✕ のあと、次の場所を選んでも場所選択中にならない`);
      must(next.chip.includes("渋谷"), `次の場所の名前が入らない: 「${next.chip}」`);
      must(/q=/.test(next.url) && !/%E8%B1%8A%E6%B4%B2/.test(next.url),
        `次の場所を選んでも URL が前の場所のまま: ${next.url}`);
      must(next.strip > 0, `次の場所で年代の段が組まれない: ${next.strip} コマ`);

      // ⚠ **画面から選んだ経路でも同じこと。** URL で着いた場合しか見ていなかった
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const afterPicked = await look();
      must(afterPicked.mode === "place" && afterPicked.url === ""
        && afterPicked.chip === "" && afterPicked.strip === 0,
        `画面から選んだ場所を ✕ したとき、持ち越しがある: ${JSON.stringify(afterPicked)}`);

      // ⚠ **再読み込みで戻ってこないこと。** ここが本体（URL が残っていると復活する）。
      //   最後にやる。ここより前に置くと、上の「次の場所を選べる」が別のページの話になる
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#quick button", { timeout: 20000 });
      await page.waitForTimeout(2500);
      const back = await look();
      must(back.mode === "place" && back.chip === "" && back.strip === 0,
        `再読み込みで前の場所が復活した: ${JSON.stringify(back)}`);
      return `✕ で URL・場所名・年代の段（${before.strip} コマ）が消え、再読み込みでも戻らない`
        + `／同じページのまま渋谷を選べて段 ${next.strip} コマ／画面から選んだ場所の ✕ でも持ち越さない`;
    },
  },
];
