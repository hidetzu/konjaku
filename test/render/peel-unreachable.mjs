// 実描画 — 取れなかったを「無い」と言わない（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 12 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 5 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **`top-unreachable.mjs` と対になる**（⚠ 同じ掟を、⚠ 深掘りの画面で見る）。
//   ⚠ **あちらは「取りに行って拒まれた／返らない」を 5 通り。**
//   ⚠ **こちらは「落ちたと分かったか」を先に問う**（⚠ 分かっていないのに理由を言わない）。
//
// ⚠ **ここが守っているもの**:
//     観測できたときだけ ⚠ **落ちたと分かったときだけ「読み込めませんでした」と言う**
//     404               ⚠ **理由を断定しない**（⚠ 接続のせいにしない・⚠ 「無い」と言い切らない）
//     圏外              ⚠ **圏外のときだけ「接続していない」と言い切る**
//     出ていない地面    ⚠ **「表示中」と言わない。**⚠ **届いたら説明を戻す**
//     つながっている    ⚠ **普通につながっていれば「まだ出ていません」は出ない**
//
// ⚠ **どの年代を見ているのかを消さない**（⚠ 断りを出すときも、⚠ 名乗りは残る）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, peelReady, settleAfterCondition, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **落ちたことを実際に観測できたときだけ「読み込めませんでした」と言う。**
    //   実測（2026-08-18・豊洲）。拾えるものは落とし方で違う:
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
    // ⚠ **すぐには切り替えない。**実測（2026-08-18）:
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
    //   実測（2026-08-18）: 現在 69ms・段の切替 0〜403ms。
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
];
