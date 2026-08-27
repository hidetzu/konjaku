// 実描画 — 押したら、⚠ 本当に応える（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 28 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 3 件を、⚠ 直上のコメントごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **3 件とも「押しても何も起きない導線を作らない」を見ている**（ADR 0026）:
//     年代の右端 ⚠ **明治期のデータが無い地点で、⚠ 右端を「明治期」にしない**
//                ⚠ **実測（2026-08-23・375×667）: ⚠ 札幌の段は明治期を出すのに、⚠ 押しても水域が出なかった**
//     地図の塗り ⚠ **「地図で光らせる」を押しているあいだ、⚠ 地図が本当に変わる**
//                ⚠ **`wireProvPeek()` の直後に `#breakdown` ごと差し替えられ、⚠ listener が消えていた**
//
// ⚠ **右端の 2 件は対で見る**（⚠ **だから割らない**）:
//     ⚠ **データが無い地点で消える**ことと、⚠ **ある地点で残る**ことを、⚠ 両方見る。
//     ⚠ **「消した」だけの検査にしない**（`.claude/skills/verify/SKILL.md` §5）。
//
// ⚠ **どれも静的検査では捕まらない。**
//   ⚠ **その土地に低湿地データがあるかは、⚠ 動かさないと分からない。**
//   ⚠ **DOM を組み立てただけでは、⚠ listener の有無は分からない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  TOYOSU, SAPPORO, stepLabels,
  peelReady, settleAfterCondition, settleAfterClick, must
} from "./lib.mjs";

export const CASES = [
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
];
