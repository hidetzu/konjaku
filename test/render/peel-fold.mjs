// 実描画 — 狭い幅の器と、⚠ 建物を待つあいだ（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 23 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **見出しは運んでいない。**⚠ **22 本目で付け直したばかりのもの**で、
//   ⚠ **ファイル名がその役目を果たす**（⚠ 5 本目と同じ扱い）。
//
// ⚠ **ここが守っているもの**:
//     1 つの器 ⚠ **狭い幅でも、⚠ 年代の表示と操作が 1 つの器に見える**
//              ⚠ **PC では 2026-08-20 から同じことをしていた。**⚠ **狭い幅にだけ届いていなかった**
//     待たせない ⚠ **建物が取れないとき、⚠ 待たせ続けない**（⚠ 再試行を出す・⚠ 諦める）
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, UNSURVEYED, LIES, settleAfterCondition, must } from "./lib.mjs";

export const CASES = [
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
    name: "建物が取れないとき、待たせ続けない", path: `/peel?${UNSURVEYED}`,
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
      // ⚠ **「最大20秒…」は出さなくなった**（2026-08-22。Owner 判断: ⚠ 相手先の名前は
      //   ⚠ 利用者の問いに答えていない）。⚠ **待ち始めた合図は「建物を取得しています」。**
      await page.waitForFunction(() => /建物を取得しています/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      const t0 = Date.now();


      // 期限内に、取れなかったと言い切ること
      await page.waitForFunction(() => /取得できませんでした/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **再試行は材料の行が持つ**（2026-08-22。⚠ `#status` から移した）。
      //   ⚠ **主張は同じ**（⚠ 取れなかったときに、⚠ 戻る手段が 1 つある）。
      must(await page.locator("#panel .retry-btn").count() === 1, "建物取得失敗時の再試行が出ていない");
      const ms = Date.now() - t0;
      must(ms < 30000, `諦めるのが遅い: 待ち始めてから ${ms}ms`);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // 取れなかっただけで、画面は成立していること
      // ⚠ **「代わりに何が見られるか」は、⚠ 断りに添える**（2026-08-22。Owner 判断）。
      //   ⚠ **字が変わった**（⚠ 「水域と空中写真だけで表示」→ 材料の行の断り）。
      must(/届いていないだけで|水域と空中写真/.test(t),
        `代わりに何が見られるか書いていない: ${t.slice(0, 160)}`);
      must(await page.locator("canvas").count() > 0, "地図まで出なくなっている");
      // ⚠ **`LIES` は建物の話にだけ当てる**（2026-08-23）。
      //   ⚠ **この土地は、⚠ 明治期の低湿地データが本当に整備対象外**なので、
      //     ⚠ **画面全体に当てると、⚠ 正しい説明のほうが落ちる**（⚠ 実際に落ちた）。
      //   ⚠ `top.mjs` に同じ注意がある（⚠ 2026-08-19 に一度踏んでいる）。
      const t3 = await page.evaluate(() =>
        ([...document.querySelectorAll("#landAll .land-layer")].at(-1)?.textContent ?? "")
          .replace(/\s+/g, " "));
      for (const w of LIES) must(!t3.includes(w), `建物が取れないだけで断定している: 「${w}」`);
      return `${Math.round(ms / 1000)} 秒で諦めて「取得できませんでした」／水域と写真は出ている`;
    },
  },
];
