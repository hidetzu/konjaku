// 実描画 — 土地の答えが、どこで開いても同じに出る（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 10 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 6 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **ここが守っているもの**（⚠ どれも ⚠ **同じ問いに 2 つの答えを持たない**）:
//     2 つの画面   ⚠ **トップと `/peel` が、⚠ 同じ土地に同じ答えを出す**（⚠ 字を書き写さない）
//     取り直さない ⚠ **トップで取った地形分類を、⚠ `/peel` が取り直さない**
//     直接開く     ⚠ **`/peel` を直接開いても答えが出る。**⚠ **建物は土地の答えを待たない**
//     持ち越さない ⚠ **別の地点に移ったら、⚠ 前の地点の答えを使わない**
//     壊れていても ⚠ **控えが壊れていても、⚠ 保存が使えなくても、⚠ 土地の答えは出る**
//
// ⚠ **`CLAUDE.md` §3: ⚠ 同じ問いに答える実装を 2 つ持たない。**
//   ⚠ **やむを得ず持つときは、⚠ 機械で突き合わせる。**⚠ **ここがその突き合わせ。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, BASE, TOYOSU, waitVerdict, settleAfterCondition, LFC_ROUTE, forbid, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **トップと /peel が、同じ第1層を同じ字で出す**（hidetzu/konjaku#122）。
    //   ⚠ **字を書き写さない。**⚠ **両方を実際に描いて、突き合わせる**（掟）。
    //   ⚠ 以前は トップ「もとは 水だった土地（旧水部）です。いまは …」／
    //     /peel「この土地は 旧水部 ／ 人の手で …」と、⚠ **同じ第1層が画面ごとに違った**
    //     （ADR 0030 §4 の実測）。
    name: "トップと /peel が、同じ土地に同じ答えを出す", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const text = async (url, sel) => {
          const p2 = await ctx.newPage();
          await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          // ⚠ **「判定中…」を除く。**⚠ 除かないと判定中の字を突き合わせてしまう
          await p2.waitForFunction((s) => {
            const t = (document.querySelector(s)?.innerText ?? "").trim();
            return t.length > 3 && !t.includes("判定中");
          }, sel, { timeout: 60000 });
          await settleAfterCondition(p2);
          const t = await p2.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim());
          await p2.close();
          return t;
        };
        const top = await text(`${BASE}/?${TOYOSU}`, ".v-head");
        const peel = await text(`${BASE}/peel?${TOYOSU}`, ".land-g1");
        // ⚠ **主語は同じ。**⚠ words.js の 1 か所から取る（ここへ書き写さない）
        const head = WORDS.ground1Lines("@@", null)[0].split("@@")[0].trim();
        must(top.startsWith(head), `トップの答えが「${head}」で始まっていない: ${top}`);
        must(peel.startsWith(head), `/peel の答えが「${head}」で始まっていない: ${peel}`);
        // ⚠ **区分名まで一致すること。**/peel は第1層だけを出すので、トップの 1 行目と比べる
        const top1 = top.split("\n")[0].trim();
        must(peel === top1 || top.startsWith(peel),
          `トップと /peel で第1層の字が違う: トップ「${top}」／peel「${peel}」`);
        return `トップ「${top}」／/peel「${peel}」`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **トップで取った地形分類を、/peel が取り直さない**（hidetzu/konjaku#121）。
    //   ⚠ **実測（2026-08-20・main = d410455・豊洲・375x667・SW 無効）**:
    //     トップ 2 本 → /peel（トップ経由）でも **もう 2 本**取っていた。
    //   ⚠ **Service Worker を止める。**⚠ 止めるとキャッシュから返らないので、
    //     ⚠ **本当に取りに行った本数**が数えられる（止めないと 0 本に見えて素通りする）。
    //   ⚠ **画面のリンクで遷移する。**⚠ goto で開くと、利用者が通る道と違う。
    name: "トップで取った地形分類を、/peel が取り直さない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        let phase = "top";
        const n = { top: 0, peel: 0 };
        ctx.on("request", (r) => {
          if (/experimental_landformclassification/.test(r.url())) n[phase]++;
        });
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(p2);
        await settleAfterCondition(p2);
        must(n.top > 0, "トップが地形分類を 1 本も取っていない（この検査が何も見ていない）");
        phase = "peel";
        const link = await p2.$('a[href*="./peel"]');
        must(!!link, "トップから /peel への導線が無い");
        await link.click();
        await p2.waitForLoadState("load", { timeout: 60000 });
        // ⚠ **答えが出るまで待つ。**⚠ 待たずに数えると、まだ取っていないだけで 0 本になる
        await p2.waitForFunction(() =>
          /この土地は|判定できません|対象範囲外/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        must(n.peel === 0,
          `/peel が地形分類を取り直している（${n.peel} 本。トップで ${n.top} 本取ったあと）`);
        return `トップ ${n.top} 本 → /peel ${n.peel} 本（控えから返っている）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **/peel を直接開いても、土地の答えが出る**（控えが無いところから）。
    //   ⚠ 「トップ → /peel のときだけ動く」実装にしない。
    //   ⚠ **地図と建物が、土地の答えを待たない。**⚠ 待つと、深掘りの主役が遅れる。
    //     ⚠ **時間で測らない**（CI の速さで揺れる）。⚠ **地形分類を落としても建物が出る**、
    //       という形で見る。⚠ こちらのほうが主張が強い（依存が無いことを直接言える）。
    name: "/peel を直接開いても答えが出て、建物は土地の答えを待たない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        // ---- 1. 控えが無いところから直接開く ----
        const p2 = await ctx.newPage();
        let got = 0;
        p2.on("request", (r) => {
          if (/experimental_landformclassification/.test(r.url())) got++;
        });
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        must(got > 0, "控えが無いのに、地形分類を取りに行っていない");
        const txt = await p2.evaluate(() =>
          (document.body.textContent ?? "").replace(/\s+/g, " ").match(/この土地は[^。]{0,40}/)?.[0] ?? "");
        must(txt.length > 6, `直接アクセスで土地の答えが出ていない: 「${txt}」`);
        await p2.close();

        // ---- 2. 地形分類を落としても、建物は出る ----
        const p3 = await ctx.newPage();
        await forbid(p3, LFC_ROUTE);
        await p3.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        const built = await p3.waitForFunction(() => {
          const t = document.body.textContent ?? "";
          return /\d+\s*件|\d+\s*棟|建物/.test(t) ? t.length : false;
        }, null, { timeout: 60000 }).then(() => true).catch(() => false);
        must(built, "地形分類が落ちると、建物まで出なくなる（土地の答えを待っている）");
        await p3.close();
        return `直接アクセスで「${txt.slice(0, 24)}」（地形分類 ${got} 本）／`
          + `地形分類が落ちても建物は出る`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **別の地点で、前の地点の控えを使わない**（キーは小数 5 桁）。
    //   ⚠ ここを間違えると、⚠ **豊洲の答えを渋谷に出す**。掟の一行目より重い事故になる。
    //   ⚠ **答えが違う 2 点を選ぶ**（同じ答えだと、混ざっていても気づけない）。
    name: "別の地点に移ったら、前の地点の答えを使わない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const say = async (ll, q) => {
          await p2.goto(`${BASE}/peel?q=${q}&ll=${ll}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await p2.waitForFunction(() =>
            /この土地は|判定できません|対象範囲外/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 });
          return p2.evaluate(() => (document.body.textContent ?? "")
            .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "（出ていない）");
        };
        // 豊洲（旧水部）と 皇居のあたり（台地）。⚠ **答えが違う 2 点**
        const a = await say("35.65480,139.79750", "%E8%B1%8A%E6%B4%B2");
        const b = await say("35.68520,139.75280", "%E7%9A%87%E5%B1%85");
        must(a !== b, `別の地点なのに、同じ答えが出ている（どちらも「${a}」）`);
        // 戻ったら、元の答えに戻る（控えが壊れて別物になっていない）
        const a2 = await say("35.65480,139.79750", "%E8%B1%8A%E6%B4%B2");
        must(a2 === a, `戻ったら答えが変わった（${a} → ${a2}）`);
        return `豊洲「${a.slice(0, 20)}」 ／ 皇居「${b.slice(0, 20)}」／戻すと元に戻る`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **壊れた控えがあっても、取りに行って正しく出る。**
    //   ⚠ 版が変わった残り・別のタブが書いた途中・手で書き換えられた、のどれでも同じ。
    //   ⚠ **例外を投げて画面が白くなってはいけない。**
    name: "壊れた控えがあっても、土地の答えが出る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        // ⚠ **開く前に仕込む。**⚠ 同じ生成元でないと sessionStorage に触れない
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        const key = await p2.evaluate(() =>
          KonjakuLand.PREFIX + KonjakuLand.key(139.7975, 35.6548));
        await p2.evaluate((k) => {
          sessionStorage.setItem(k, "{これは壊れている");
        }, key);
        await p2.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ **答えを待ちきる前に、例外が出たらそこで落とす。**
        //   ⚠ 待ちきってから見ると、落ちた理由が「Timeout」になって、
        //     ⚠ **この検査が何を主張していたのか読めない**（2026-08-20 に踏んだ）。
        const shown = await Promise.race([
          p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 }).then(() => true).catch(() => false),
          (async () => { for (let i = 0; i < 120; i++) {
            if (errs.length) return false;
            await p2.waitForTimeout(500);
          } return false; })(),
        ]);
        must(errs.length === 0, `壊れた控えで例外が出た: ${errs.slice(0, 2).join(" / ")}`);
        must(shown, "壊れた控えのあと、答えが出ていない（例外は出ていない）");
        const txt = await p2.evaluate(() => (document.body.textContent ?? "")
          .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "");
        must(txt.length > 6, `壊れた控えのあと、答えが出ていない: 「${txt}」`);
        return `壊れた控えを入れても「${txt.slice(0, 24)}」（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **保存が使えなくても、画面が壊れない**（Safari のプライベート・容量超過・埋め込み枠）。
    //   ⚠ **控えられないだけで、答えは出なければならない。**
    name: "保存が使えなくても、土地の答えが出る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        // ⚠ **参照そのものが投げる形を見る**（Safari のプライベート・埋め込み枠での遮断）。
        //   ⚠ **メソッドだけが投げる形では足りない。**⚠ 2026-08-20 に踏んだ:
        //     メソッドだけ投げる偽物にしていたら、⚠ **参照を守っている try を外しても緑だった。**
        //   ⚠ **どのスクリプトより先に差し替える**
        await p2.addInitScript(() => {
          Object.defineProperty(window, "sessionStorage", {
            configurable: true,
            get() { throw new Error("保存は使えません"); },
          });
        });
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ ここも同じ。⚠ **例外が出たら、待ちきる前に落とす**
        const shown = await Promise.race([
          p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 }).then(() => true).catch(() => false),
          (async () => { for (let i = 0; i < 120; i++) {
            if (errs.length) return false;
            await p2.waitForTimeout(500);
          } return false; })(),
        ]);
        must(errs.length === 0, `保存が使えないと例外が出る: ${errs.slice(0, 2).join(" / ")}`);
        must(shown, "保存が使えないとき、答えが出ていない（例外は出ていない）");
        const txt = await p2.evaluate(() => (document.body.textContent ?? "")
          .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "");
        must(txt.length > 6, `保存が使えないとき、答えが出ていない: 「${txt}」`);
        return `保存の参照そのものが落ちても「${txt.slice(0, 24)}」（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },
];
