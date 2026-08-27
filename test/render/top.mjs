// トップ（`/`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=top`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

// ⚠ **標準の口は、⚠ 使う側が取り込む**（⚠ lib から又貸ししない）。
// ⚠ **外から来た文字列の 3 件は `top-escape.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **末尾に spread し直すので、⚠ 並びもシャードの割り当ても動かない。**
import { CASES as ESCAPE_CASES } from "./top-escape.mjs";
// ⚠ **記録より強く言わないは `top-claim.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件を、⚠ 元ファイルの見出し 2 本ごと運んだ**ので、⚠ **並びは動かない。**
import { CASES as CLAIM_CASES } from "./top-claim.mjs";
// ⚠ **色みは `top-theme.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as THEME_CASES } from "./top-theme.mjs";
// ⚠ **場所が分からないとき黙って別の場所を出さないは `top-nowhere.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **離れた 2 件を集めたので、⚠ 並びは動く。**
import { CASES as NOWHERE_CASES } from "./top-nowhere.mjs";
// ⚠ **判定カードと次の一手は `top-launch.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **土地の型 4 つを 1 つにまとめた。**⚠ **離れた 2 件を寄せたので、⚠ 並びは動く。**
import { CASES as LAUNCH_CASES } from "./top-launch.mjs";
// ⚠ **明治期の面は `top-meiji.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as MEIJI_CASES } from "./top-meiji.mjs";
// ⚠ **同じことを 2 か所で言わないは `top-once.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **離れた 1 件 ＋ 連続した 2 件を集めたので、⚠ 並びは動く。**
import { CASES as ONCE_CASES } from "./top-once.mjs";
// ⚠ **既定で畳み開けば読めるは `top-fold.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as FOLD_CASES } from "./top-fold.mjs";
// ⚠ **次の一手の語は `top-word.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件 ＋ 連続した 3 件を集めたので、⚠ 並びは動く。**
import { CASES as WORD_CASES } from "./top-word.mjs";
// ⚠ **待っているあいだと遅れて届いたものは `top-wait.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
import { CASES as WAIT_CASES } from "./top-wait.mjs";
// ⚠ **押さずに読めるは `top-read.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **離れた 3 件を集めたので、⚠ 並びは動く。**
import { CASES as READ_CASES } from "./top-read.mjs";
// ⚠ **押せるものが届き押すと応えるは `top-reach.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **4 つの塊を集めたので、⚠ 並びは動く。**
import { CASES as REACH_CASES } from "./top-reach.mjs";
// ⚠ **共有と、そのときに数えるものは `top-share.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **散らばった 6 件を集めたので、⚠ 並びは動く**（⚠ 件数と判定の字は変わらない）。
import { CASES as SHARE_CASES } from "./top-share.mjs";
// ⚠ **外との境目は `top-outside.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **`top-escape.mjs`（外から来たもの）と対**。⚠ 散らばった 4 件を集めたので並びは動く。
import { CASES as OUTSIDE_CASES } from "./top-outside.mjs";
// ⚠ **この範囲にあったものは `top-events.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as EVENTS_CASES } from "./top-events.mjs";
// ⚠ **年代を動かす／明治期を重ねるは `top-eras.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 1 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as ERASMOVE_CASES } from "./top-eras.mjs";
// ⚠ **場所を選んだあとの一歩は `top-next.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **連続した 7 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as NEXT_CASES } from "./top-next.mjs";
// ⚠ **年代の帯は `top-strip.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as STRIP_CASES } from "./top-strip.mjs";
// ⚠ **取れなかったを「無い」と言わないは `top-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 5 件をそのままの並びで運んだ。**
import { CASES as UNREACH_CASES } from "./top-unreachable.mjs";
// ⚠ **場所を探すは `top-search.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **2 つの連続した塊を集めたので、⚠ 並びは動く。**
import { CASES as SEARCH_CASES } from "./top-search.mjs";
// ⚠ **土地の答えが、どこで開いても同じに出るは `top-answer.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 6 件をそのままの並びで運んだ。**
import { CASES as ANSWER_CASES } from "./top-answer.mjs";
// ⚠ **幅と文字サイズは `top-fit.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **3 つの連続した塊を集めたので、⚠ 並びは動く。**
import { CASES as FIT_CASES } from "./top-fit.mjs";
import {
  PORT, OUT, TOYOSU,
  NAGOYA_LL, NIIGATA,
  URAYASU,
  waitVerdict, WD, waitStrip,
  RE_ESC, G1_MARK, G1_HEAD,
  PHOTO_ROUTE, pngOf, whitePng, photoPng, eraRoute, ERA_TILE_IDS,
  timelineSettled, stepLabels, tauNow, waitOpacity, waited,
  waitOptional, settleAfterClick,
  must, assertToyosu3dAnswer
} from "./lib.mjs";

export const CASES = [
  ...THEME_CASES,
  ...NOWHERE_CASES,
  ...LAUNCH_CASES,
  ...MEIJI_CASES,
  ...ONCE_CASES,
  ...FOLD_CASES,
  ...WORD_CASES,
  ...WAIT_CASES,
  ...READ_CASES,
  ...REACH_CASES,

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
  ...SHARE_CASES,
  ...UNREACH_CASES,
  ...SEARCH_CASES,
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
  ...FIT_CASES,






  ...ANSWER_CASES,

  ...STRIP_CASES,
  ...EVENTS_CASES,
  ...OUTSIDE_CASES,
  ...ERASMOVE_CASES,
  ...NEXT_CASES,
  ...ESCAPE_CASES,
  ...CLAIM_CASES,
];
