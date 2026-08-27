// 実描画 — 部品を単体で動かす（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 15 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 4 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **`.claude/rules/components.md` が要求している検査**:
//   ⚠ **「部品だけを、⚠ 地図もネットも無しで開く検査を持つ」**（MUST）。
//   ⚠ **切り出しただけでは境界は保証されない。**⚠ **これでしか見つからなかった不具合が 2 つある**
//     （⚠ hidetzu/konjaku#171: ⚠ 外の最上位宣言 `esc` に頼っていた ／
//      ⚠ 外の reset の `box-sizing` に頼ってノブが 6px ずれ、⚠ **真ん中を押しただけで値が動いた**）。
//
// ⚠ **ここが守っているもの**:
//     段が決まる ⚠ **押しても引いても、⚠ 返す値が段に落ちる**
//     名乗る     ⚠ **動かす前に、⚠ 全段の年代が読める**
//     一方向     ⚠ **状態を渡すだけで組み上がり、⚠ 操作は返ってくる**（⚠ 中で描き直さない）
//     引かない   ⚠ **地図もタイルも建物も引かない**
//     届く       ⚠ **部品のファイルが、⚠ SHELL の経路で実際に取れる**
//                ⚠ **動的キャッシュの規則は直下の `.js` しか一致しない**ので、
//                ⚠ **入れ忘れるとオフラインでその部品だけ出ない**
//
// ⚠ **実測（2026-08-22）**: ⚠ **地図を立ち上げる検査は 1 件 10〜30 秒。**
//   ⚠ **部品単体は 95ms・引いた URL 5 本・地図 0 本。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, BASE, must } from "./lib.mjs";

import { readFile } from "node:fs/promises";

// ⚠ **この道具は `peel.mjs` から一緒に運んだ**（2026-08-27。hidetzu/konjaku#277 の 15 本目）。
//   ⚠ **使っているのは、⚠ このファイルの 4 件だけ**（⚠ 親の `CASES` では 0 回）。
//   ⚠ **`lib.mjs` へ出さない。**⚠ **1 か所でしか使わないものを、⚠ 道具へ上げない**
//     （`test/check/lib.mjs` と同じ考え: ⚠ **特定の節しか使わないものは出さない**）。
// ⚠ **EraControlPanel だけを、⚠ 地図もネットも無しで開く**（hidetzu/konjaku#171）。
//   ⚠ **配信物を増やさない。**⚠ `page.route` で組み立てる（実ファイルを置かない）。
//   ⚠ **DOM も token も peel.html から取る。**⚠ ここへ写すと 2 か所になって片方が古くなる（掟）。
//   ⚠ **画面の代わりは、ここが持つ。**⚠ 返ってきた位置を `window.__pos` に置いて描き直すだけ（一方向）。
async function openEraControl(browser, { width = 1280, height = 400 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const p2 = await ctx.newPage();
  const peel = await readFile(new URL("../../public/peel.html", import.meta.url), "utf8");
  const i = peel.indexOf('<section id="timePanel"');
  const j = peel.indexOf("</section>", i) + "</section>".length;
  if (i < 0 || j <= i) throw new Error("peel.html から #timePanel を切り出せない（この検査が何も見ていない）");
  const rootCss = /:root\{([\s\S]*?)\}/.exec(peel)?.[1] ?? "";
  if (!rootCss.includes("--text-hero")) throw new Error("peel.html の :root を読めない（この検査が何も見ていない）");
  const html = `<!doctype html><html lang="ja" data-backdrop="map"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/theme.css">
<link rel="stylesheet" href="/components/era-control/era-control.css">
<style>:root{${rootCss}} body{background:var(--bg);margin:0;padding:20px;
  font:14px/1.65 -apple-system,sans-serif;color:var(--ink)}</style></head><body>
${peel.slice(i, j)}
<script src="/esc.js"></script>
<script src="/words.js"></script>
<script src="/components/era-control/era-control.js"></script>
<script>
  window.__ev = []; window.__pos = 0;
  window.__steps = [{id:"now",label:"現在"},{id:"a",label:"1984–86"},{id:"b",label:"1974–78"},
                    {id:"c",label:"1945–50"},{id:"swale",label:"明治期",meiji:true}];
  window.__draw = (o) => window.__c.update({ steps: window.__steps, pos: window.__pos,
    playing: false, narrow: false, sealed: false, meijiHas: true,
    readout: { year: "", kick: "", sub: "", net: "", note: "" }, tone: {}, ...(o ?? {}) });
  window.__c = createEraControl({ root: document.getElementById("timePanel"),
    onChangeEra: (p) => { window.__ev.push(["era", p]); window.__pos = p; window.__draw(); },
    onTogglePlay: () => window.__ev.push(["play"]) });
  window.__draw();
</script></body></html>`;
  const got = [], errs = [];
  p2.on("request", (r) => got.push(new URL(r.url()).pathname));
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.route(`${BASE}/__era-control-probe`, (r) =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await p2.goto(`${BASE}/__era-control-probe`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { ctx, p2, got, errs };
}

export const CASES = [
  {
    // ⚠ **帯は、押しても引いても段が決まる**（コンポーネント単体。2026-08-22。hidetzu/konjaku#171）。
    //
    //   ⚠ **実描画の 4 ケースから移した。**⚠ **主張は 1 つも落としていない。**
    //     年代帯の端の文字を押すと最後の段になる（PC の横棒）
    //     年代帯の文字は、押せば段へ寄り、引けば連続して動く（PC の横棒）
    //     年代の帯は、目盛りも文字もノブも押せる（PC の横棒）
    //     つまみの両端が、何の年代かを必ず名乗る
    //   ⚠ **移せた理由**: どれも ⚠ **地図も建物も土地データも見ていない。**
    //     段を渡せば足りる（実データに寄りかかっていない）。
    //   ⚠ **移さなかったもの**: 「▶ は、動かす相手（帯）のすぐそばにある」は
    //     ⚠ **初期画面に入っているか（innerHeight）を見ている**ので、単体では測れない。
    //
    // ⚠ **移すときに、1 つ強くした。**
    //   「つまみの両端が…」は **375×667** で測っていたが、⚠ **その幅では横棒が
    //   `display:none`**（狭い幅はドラム）。⚠ **矩形が全部 0 になるので、
    //   「はみ出さない」「重ならない」は何も見ていなかった**（2026-08-22 に気づいた）。
    //   ⚠ ここでは ⚠ **横棒が出る幅**（681 = 出る下限 ／ 1280）で測り、
    //   ⚠ **測る前に `checkVisibility()` で見えていることを確かめる**（同じ穴に落ちない）。
    //
    // ⚠ **端の文字は、中心をそのまま押す。**⚠ 枠の内側へ寄せて押さない。
    //   ⚠ 実測（2026-08-22）: 右端から 2px の位置に丸めて押すと、⚠ **range が自力で最大へ行く**ので、
    //     ⚠ **文字タップの処理を丸ごと消しても、この検査が緑のままだった。**
    //
    //   ⚠ 経緯（既定動作を止めない／重なったら中心がいちばん近いものを選ぶ／
    //     引き終えて段へ吸い戻さない）は、⚠ **era-control.js のコメントが持つ。**⚠ 写さない。
    name: "年代の帯は、押しても引いても段が決まる（コンポーネント単体）", path: "/", group: "core",
    async check(page) {
      const browser = page.context().browser();
      const out = [];

      // ---- ① 両端が名乗る／枠からはみ出さない／重ならない ----
      // ⚠ 段の数が違うところで見る。⚠ **偶数段・奇数段の両方**（片方だけだと、また偶然で通る）
      for (const width of [681, 1280]) {
        for (const n of [4, 5, 7, 9]) {
          const { ctx, p2, errs } = await openEraControl(browser, { width, height: 400 });
          try {
            await p2.evaluate((k) => {
              window.__steps = Array.from({ length: k }, (_, i) => ({
                id: String(i), label: i === 0 ? "現在" : i === k - 1 ? "明治期" : `19${40 + i * 6}年`,
                meiji: i === k - 1 }));
              window.__pos = 0; window.__draw();
            }, n);
            await p2.waitForTimeout(80);
            const geo = await p2.evaluate(() => {
              const box = (e) => { const r = e.getBoundingClientRect();
                return { left: r.left, right: r.right, text: e.textContent.trim() }; };
              const t = document.getElementById("track");
              return { shown: t.checkVisibility(), track: box(t),
                ticks: document.querySelectorAll("#track .tick").length,
                labs: [...document.querySelectorAll("#track .lab")].map(box),
                start: document.querySelector("#track .lab.at-start")?.textContent.trim() ?? "",
                end: document.querySelector("#track .lab.at-end")?.textContent.trim() ?? "" };
            });
            must(!errs.length, `${width}px ${n}段: 例外が出た: ${errs[0]}`);
            // ⚠ **見えていないものを測って「問題なし」と言わない**（移す前がこれで空振りしていた）
            must(geo.shown && geo.track.right - geo.track.left > 0,
              `${width}px ${n}段: 横棒が出ていない。この検査は何も見ていない`);
            must(geo.ticks === n, `${width}px ${n}段: 目盛りが ${geo.ticks} 個`);
            must(geo.start === "現在", `${width}px ${n}段: 開始端が現在でない: 「${geo.start}」`);
            must(geo.end === "明治期", `${width}px ${n}段: 終了端が明治期でない: 「${geo.end}」`);
            // ⚠ 端の文字が枠からはみ出さないこと（横スクロールが出る。一度踏んでいる）
            const over = geo.labs.filter((l) => l.text
              && (l.left < geo.track.left - 0.5 || l.right > geo.track.right + 0.5));
            must(!over.length, `${width}px ${n}段: 目盛りの文字が枠の外に出ている: `
              + over.map((l) => `${l.text}(${l.left.toFixed(0)}〜${l.right.toFixed(0)}px)`).join("、"));
            // ⚠ 間引いたうえで、なお隣どうしが重ならないこと
            const shown = geo.labs.filter((l) => l.text).sort((a, b) => a.left - b.left);
            const hit = shown.filter((l, i) => i > 0 && l.left < shown[i - 1].right - 0.5);
            must(!hit.length, `${width}px ${n}段: 目盛りの文字が重なっている: `
              + hit.map((l) => l.text).join("、"));
            out.push(`${width}px ${n}段「${shown.map((l) => l.text).join("/")}」`);
          } finally { await ctx.close(); }
        }
      }

      // ---- ② 押す・引く（⚠ 段の数は移す前と同じ 9 段。1280px の横棒）----
      const { ctx, p2, errs } = await openEraControl(browser, { width: 1280, height: 400 });
      try {
        const n = 8;   // 9 段 = 最大値 8
        await p2.evaluate((k) => {
          window.__steps = Array.from({ length: k + 1 }, (_, i) => ({
            id: String(i), label: i === 0 ? "現在" : i === k ? "明治期" : `19${40 + i * 6}年`,
            meiji: i === k }));
          window.__pos = 0; window.__draw();
        }, n);
        await p2.waitForTimeout(80);
        // ⚠ **値は「画面へ返ってきた位置」から読む。**⚠ `#t.value` は見ない。
        //   ⚠ 実測（2026-08-22）: 文字タップの処理は `slider.value` を**自分で**書いてから
        //     画面へ返す。⚠ **`#t` を見ると、返す側を消しても気づけない**（移す前の 4 ケースが
        //     どれも `#t` を見ていた。⚠ **返す処理を消しても 4 件とも緑のままだった**）。
        //   ⚠ **コンポーネントの契約は、返す値のほう。**⚠ そちらを見る。
        const val = () => p2.evaluate(() => window.__pos);
        const set = (v) => p2.evaluate((x) => { window.__pos = x; window.__draw(); }, v);
        const geo = await p2.evaluate(() => {
          const t = document.getElementById("track").getBoundingClientRect();
          const mid = (e) => { const r = e.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
          return { x: Math.round(t.left), w: Math.round(t.width),
            // ⚠ **名前の無いラベルは的にしない。**⚠ 間引いた段のラベルは `:empty` で消えていて、
            //   ⚠ 消えた要素の矩形は 0,0 を返す（そのまま押すと画面の左上を押す）
            lab: [...document.querySelectorAll("#track .lab")]
              .filter((e) => e.textContent.trim())
              .map((e) => ({ ...mid(e), t: e.textContent.trim(), i: Number(e.dataset.i) })),
            tick: [...document.querySelectorAll("#track .tick")].map(mid),
            knob: mid(document.querySelector("#track .knob")) };
        });
        must(!errs.length, `例外が出た: ${errs[0]}`);
        must(geo.lab.length > 0 && geo.tick.length === n + 1, "目盛りも年代の文字も足りない");
        // ⚠ **押せる面は `#t` 自身。**⚠ #track の幅とは限らない（実測でずれていた）
        const inRight = await p2.$eval("#t", (e) => Math.round(e.getBoundingClientRect().right));

        // 端の文字を押すと、最後の段になる
        await set(0);
        const endLab = geo.lab[geo.lab.length - 1];
        await p2.mouse.click(endLab.x, endLab.y);
        await p2.waitForTimeout(200);
        must(await val() === n, `右端「${endLab.t}」を押しても最終段にならない: ${await val()} / ${n}`);

        // ⚠ **中間の文字を押したら、その段ちょうどへ寄る。**
        //   ⚠ **端では見えない主張。**⚠ 実測（2026-08-22）: 右端の文字の中心は、
        //     range が自力で最大に達する位置にあり、⚠ **文字タップの処理を消しても最大になる。**
        //     ⚠ **中間の文字だけが、寄せているのかどうかを見分けられる。**
        const inner = geo.lab.filter((l) => l.i > 0 && l.i < n);
        must(inner.length, `中間の年代の文字が無い: ${geo.lab.map((l) => l.t).join("・")}`);
        const tap = inner[0];
        await set(0); await p2.waitForTimeout(60);
        await p2.mouse.click(tap.x, tap.y);
        await p2.waitForTimeout(200);
        const tapped = await val();
        must(tapped === tap.i, `文字「${tap.t}」を押しても段 ${tap.i} にならない: ${tapped}`);

        // ノブ中心を押しても、値が意図せず変わらない
        const midStep = n / 2;
        await set(midStep);
        const knob = await p2.locator("#track .knob").boundingBox();
        must(knob, "ノブが無い");
        await p2.mouse.click(Math.round(knob.x + knob.width / 2), Math.round(knob.y + knob.height / 2));
        await p2.waitForTimeout(200);
        must(await val() === midStep, `ノブ中心の押下で値が変わった: ${await val()}`);

        // ⚠ 押しても動かない的が無い（文字も目盛りも全部効く）
        const dead = [];
        for (const l of [...geo.lab, ...geo.tick]) {
          const from = l.x < geo.x + geo.w / 2 ? n : 0;
          await set(from); await p2.waitForTimeout(60);
          // ⚠ **右端ちょうどは要素の外**（実測 2026-08-22: 最後の目盛りの中心が `#t` の
          //   右端と同じ x で、⚠ **その 1px は隣の要素が受け取る**）。⚠ 2px 内側を押す（指なら当たる幅）。
          //   ⚠ **端の文字（下）は寄せない。**寄せると range が自力で最大へ行き、
          //     ⚠ **文字タップの処理を消しても気づけない。**
          await p2.mouse.click(Math.min(l.x, inRight - 2), l.y);
          await p2.waitForTimeout(150);
          if (await val() === from) dead.push(l.t || `目盛り(${l.x})`);
        }
        must(!dead.length, `押しても動かない的がある: ${dead.join("、")}`);

        // ⚠ 文字の上から引くと、連続して動く。⚠ **引き終えて段へ吸い戻さない**
        await set(0); await p2.waitForTimeout(100);
        const midLab = geo.lab[Math.floor(geo.lab.length / 2)];
        await p2.mouse.move(midLab.x, midLab.y);
        await p2.mouse.down();
        const trace = [];
        for (let k = 1; k <= 6; k++) {
          await p2.mouse.move(midLab.x + k * 20, midLab.y);
          await p2.waitForTimeout(40);
          trace.push(await val());
        }
        await p2.mouse.up(); await p2.waitForTimeout(250);
        const ended = await val();
        const moved = new Set(trace).size;
        must(moved >= 4, `文字の上から引いても動かない: ${trace.join(" → ")}`);
        for (let k = 1; k < trace.length; k++)
          must(trace[k] > trace[k - 1], `右へ引いたのに値が戻る: ${trace.join(" → ")}`);
        must(ended === trace[trace.length - 1],
          `引き終えてから段へ吸い戻された: ${trace[trace.length - 1]} → ${ended}`);

        // ⚠ ノブを掴んで引けること
        await set(0); await p2.waitForTimeout(100);
        await p2.mouse.move(geo.knob.x, geo.knob.y);
        await p2.mouse.down();
        await p2.mouse.move(geo.knob.x + 120, geo.knob.y, { steps: 8 });
        await p2.mouse.up(); await p2.waitForTimeout(200);
        must(await val() !== 0, "ノブを掴んで引けない");

        out.push(`9段: 文字 ${geo.lab.length} 個・目盛り ${geo.tick.length} 個・ノブ、全部効く`);
        out.push(`文字「${tap.t}」押下 → 段 ${tapped}／引くと ${moved} 段階で吸い戻さない`);
      } finally { await ctx.close(); }

      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **ものさしは、動かす前に全段の年代を名乗る**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
    //
    //   ⚠ **前は両端しか名乗らなかった。**実測（2026-08-22・`main` = `8d920fd`・豊洲）:
    //     375 / 344 / 320 のどの幅でも、⚠ **名前が読めるのは 2 個**（刻みは 10 本）。
    //   ⚠ **間引かない。**⚠ 出ていない段があると「その年代は無い」と読まれる（掟 §1）。
    //     実測（利用者役 3 名に画面だけを見せた。⚠ **実在の利用者ではない**）:
    //     ⚠ **間引き案は 2 / 3 が「名前が付いている年代しか見られないのか」と読んだ。**
    //
    // ⚠ **段の数を変えて見る。**⚠ 4 / 5 / 7 / 9（偶数・奇数の両方）。
    //   ⚠ **実物のページでは段の数を選べない**（その土地に何が残っているかで決まる）。
    //   ⚠ 写真を stub すると ⚠ **どの土地でも 9 段になる**ので、⚠ **地点を並べても段の数は変わらない**
    //     （2026-08-22 に実際に踏んだ。豊洲・広島・出島・帯広が全部 9 段と出た）。
    //   ⚠ **だからここは、⚠ 段を渡せる単体で見る。**⚠ 実物に届いているかは、次のケースが見る。
    //
    // ⚠ **字はここに書かない。**⚠ 短い書き方は `words.js` の `eraTick` が 1 か所で持つ。
    name: "ものさしは、動かす前に全段の年代を名乗る（コンポーネント単体）", path: "/", group: "core",
    async check(page) {
      const browser = page.context().browser();
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        for (const n of [4, 5, 7, 9]) {
          const { ctx, p2, errs } = await openEraControl(browser, { width: w, height: h });
          try {
            await p2.evaluate((k) => {
              window.__steps = Array.from({ length: k }, (_, i) => ({
                id: String(i), label: i === 0 ? "現在" : i === k - 1 ? "明治期" : `19${40 + i * 6}–${42 + i * 6}`,
                meiji: i === k - 1 }));
              window.__pos = 0; window.__draw({ narrow: true });
            }, n);
            await p2.waitForTimeout(80);
            const g = await p2.evaluate(() => {
              const B = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; };
              const labs = [...document.querySelectorAll(".rl-labs span")].map((e) => ({ t: e.textContent, ...B(e) }));
              const L = document.getElementById("rlLeft"), R = document.getElementById("rlRight");
              return { shown: document.getElementById("ruler").checkVisibility(),
                line: B(document.querySelector("#ruler .rl-line")),
                ticks: document.querySelectorAll("#rlTicks i:not(.rl-cut)").length,
                inner: labs,
                all: [{ t: L.textContent, ...B(L) }, ...labs, { t: R.textContent, ...B(R) }]
                  .sort((a, c) => a.l - c.l),
                overX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
            });
            must(!errs.length, `${w}px ${n}段: 例外が出た: ${errs[0]}`);
            // ⚠ **見えていないものを測って「問題なし」と言わない**
            must(g.shown && g.line.r - g.line.l > 0,
              `${w}px ${n}段: ものさしが出ていない。この検査は何も見ていない`);
            must(g.ticks === n, `${w}px ${n}段: 刻みが ${g.ticks} 本`);
            // ⚠ **これが主張の芯**: 段の数だけ名前が読める（両端 ＋ 間）
            must(g.all.length === n,
              `${w}px ${n}段: 名前が ${g.all.length} 個しか読めない（${g.all.map((x) => x.t).join("/")}）`);
            must(g.all.every((x) => x.t.trim()),
              `${w}px ${n}段: 空の名前がある（${g.all.map((x) => x.t).join("/")}）`);
            // ⚠ 隣どうしが重ならないこと
            const hit = g.all.filter((x, i) => i > 0 && x.l < g.all[i - 1].r - 0.5)
              .map((x, i) => x.t);
            must(!hit.length, `${w}px ${n}段: 名前が重なっている: ${hit.join("、")}`);
            // ⚠ 間の名前が軸の枠から出ないこと（横スクロールが出る）
            const over = g.inner.filter((x) => x.l < g.line.l - 0.5 || x.r > g.line.r + 0.5).map((x) => x.t);
            must(!over.length, `${w}px ${n}段: 名前が軸の外に出ている: ${over.join("、")}`);
            must(g.overX <= 0, `${w}px ${n}段: 横にあふれている（${g.overX}px）`);
            // ⚠ **字は words.js のとおりか**（⚠ 検査に書き写さない）
            const want = Array.from({ length: n }, (_, i) =>
              WORDS.eraTick(i === 0 ? "現在" : i === n - 1 ? "明治期" : `19${40 + i * 6}–${42 + i * 6}`));
            const got = g.all.map((x) => x.t);
            must(JSON.stringify(got) === JSON.stringify(want),
              `${w}px ${n}段: 字が words.js と違う（${got.join("/")} ／ 期待 ${want.join("/")}）`);
            if (n === 9) out.push(`${w}px「${got.join(" ")}」`);
          } finally { await ctx.close(); }
        }
      }
      return out.join(" ／ ") + " ／ 4/5/7/9 段とも 重なり 0・枠の外 0";
    },
  },

  {
    // ⚠ **EraControlPanel だけを、⚠ 地図もネットも無しで動かす**（2026-08-22。hidetzu/konjaku#171）。
    //
    //   ⚠ **なぜ要るか。**⚠ 切り出しただけでは境界は保証されない。
    //     ⚠ 実測（2026-08-22）: コンポーネントが `esc` を、⚠ **peel3d.js が最上位で宣言した
    //       ものに黙って頼っていた。**⚠ classic script は最上位の `const` を共有するので、
    //       ⚠ **実物のページでは動いてしまう。**⚠ **単体で開いて初めて落ちた。**
    //     ⚠ 静的検査でも捕まらない（`esc` は禁止語ではない）。
    //
    //   ⚠ **配信物を増やさない。**⚠ `page.route` で組み立てる（実ファイルを置かない）。
    //     ⚠ ⚠ 相対 URL を実サーバへ解かせたいので、⚠ **BASE の下の URL に見せる。**
    //   ⚠ **速い。**⚠ /peel 全体は 1 ケース 10〜30 秒。⚠ ここは 100ms 台（実測）。
    //   ⚠ **地図・地理院タイル・建物を 1 本も引かないこと**まで見る（引いたら境界が壊れている）。
    name: "年代の表示と操作が、コンポーネント単体で動く", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 400 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        // ⚠ **DOM は peel.html から取る。**⚠ ここへ写すと、⚠ **2 か所になって片方が古くなる**（掟）
        const peel = await readFile(new URL("../../public/peel.html", import.meta.url), "utf8");
        const i = peel.indexOf('<section id="timePanel"');
        const j = peel.indexOf("</section>", i) + "</section>".length;
        must(i > 0 && j > i, "peel.html から #timePanel を切り出せない（この検査が何も見ていない）");
        const dom = peel.slice(i, j);
        // ⚠ **token は peel.html の :root が持つ。**⚠ ここで値を書くと 2 か所になるので、
        //   ⚠ **peel.html の :root をそのまま借りる**（字面を写さない）。
        const rootCss = /:root\{([\s\S]*?)\}/.exec(peel)?.[1] ?? "";
        // ⚠ **--tap は tokens.css 側**（peel.html の :root には無い）。⚠ ここにある値で確かめる
        // ⚠ **色は theme.css 側**（2026-08-26・hidetzu/konjaku#96）。⚠ `data-backdrop="map"` を
        //   ⚠ **本物と同じように付けてある**（付けないと、⚠ 地図の上ではない色で測ることになる）
        must(rootCss.includes("--text-hero"), "peel.html の :root を読めない（この検査が何も見ていない）");
        const html = `<!doctype html><html lang="ja" data-backdrop="map"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/theme.css">
<link rel="stylesheet" href="/components/era-control/era-control.css">
<style>:root{${rootCss}} body{background:var(--bg);margin:0;padding:20px;
  font:14px/1.65 -apple-system,sans-serif;color:var(--ink)}</style></head><body>
${dom}
<script src="/esc.js"></script>
<script src="/words.js"></script>
<script src="/components/era-control/era-control.js"></script>
<script>
  window.__ev = [];
  window.__c = createEraControl({ root: document.getElementById("timePanel"),
    onChangeEra: (p) => window.__ev.push(["era", p]),
    onTogglePlay: () => window.__ev.push(["play"]) });
</script></body></html>`;
        await p2.route(`${BASE}/__era-control-probe`, (r) =>
          r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
        // ⚠ **何を引いたかを数える。**⚠ 地図を引いたら境界が壊れている
        const got = [];
        p2.on("request", (r) => got.push(new URL(r.url()).pathname));
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));

        const t0 = Date.now();
        await p2.goto(`${BASE}/__era-control-probe`, { waitUntil: "domcontentloaded", timeout: 30000 });
        const STEPS = [{ id: "now", label: "現在" }, { id: "a", label: "1984–86" },
                       { id: "b", label: "1945–50" }, { id: "swale", label: "明治期", meiji: true }];
        // ---- ① 状態を渡すだけで組み上がる ----
        const a = await p2.evaluate((steps) => {
          window.__c.update({ steps, pos: 0, playing: false, narrow: false, sealed: false,
            meijiHas: true, readout: { year: "現在", kick: "", sub: "最新の空中写真", net: "", note: "" }, tone: {} });
          return { ticks: document.querySelectorAll("#track .tick").length,
            labs: [...document.querySelectorAll("#track .lab")].map((e) => e.textContent.trim()).filter(Boolean),
            y: document.querySelector("#timePanel .y").textContent,
            s: document.querySelector("#timePanel .s").textContent,
            note: document.querySelector("#rlNote").textContent,
            radius: getComputedStyle(document.getElementById("timePanel")).borderRadius };
        }, STEPS);
        must(!errs.length, `コンポーネント単体で例外が出た: ${errs[0]}`);
        must(a.ticks === STEPS.length, `目盛りが段の数と合わない（${a.ticks} / ${STEPS.length}）`);
        must(a.labs.includes("現在") && a.labs.includes("明治期"),
          `両端の年代名が出ていない: ${a.labs.join("／")}`);
        must(a.y === "現在" && a.s === "最新の空中写真", `読みが渡らない: ${a.y} / ${a.s}`);
        must(/空中写真 3 段/.test(a.note), `注記が段の数から出ていない: ${a.note}`);
        must(a.radius && a.radius !== "0px", `CSS が効いていない（角 ${a.radius}）`);

        // ---- ② 整備されていない土地では、注記が変わる（⚠ 渡した真偽値だけで決まる）----
        const b2 = await p2.evaluate((steps) => {
          window.__c.update({ steps, pos: 3, playing: true, narrow: false, sealed: false,
            meijiHas: false, readout: { year: "明治期", kick: "", sub: "低湿地データ ─ 写真は存在しない", net: "", note: "" },
            tone: { meiji: true } });
          return { y: document.querySelector("#timePanel .y").textContent,
            rlYear: document.querySelector("#rlYear").textContent,
            note: document.querySelector("#rlNote").textContent,
            play: document.querySelector("#play").textContent,
            meiji: document.getElementById("timePanel").classList.contains("meiji") };
        }, STEPS);
        must(b2.y === "明治期" && b2.rlYear === "明治期", `年が渡らない: ${b2.y} / ${b2.rlYear}`);
        must(/未整備/.test(b2.note), `⚠ 未整備の土地で「明治期は地図」と約束している: ${b2.note}`);
        must(b2.play === "❚❚", `再生中の記号が出ていない: ${b2.play}`);
        must(b2.meiji, "明治期の見た目に切り替わっていない");

        // ---- ③ 操作が返ってくる（⚠ 中で描き直さない。一方向）----
        await p2.click("#play");
        const box = await p2.locator("#track .lab.at-end").boundingBox();
        await p2.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        const ev = await p2.evaluate(() => window.__ev);
        must(ev.some((x) => x[0] === "play"), `▶ の合図が返ってこない: ${JSON.stringify(ev)}`);
        must(ev.some((x) => x[0] === "era" && x[1] === STEPS.length - 1),
          `端の年代を押しても最終段が返ってこない: ${JSON.stringify(ev)}`);

        // ---- ④ ⚠ 地図もタイルも建物も引かない ----
        const outside = [...new Set(got)].filter((u) =>
          /maplibre|gsi|tile|data\/bl|data\/ev|peel3d/.test(u));
        must(!outside.length, `⚠ コンポーネント単体なのに外を引いている: ${outside.join(" ")}`);
        return `${Date.now() - t0}ms／引いた URL ${new Set(got).size} 本（地図 0）`
          + `／目盛り ${a.ticks}／注記の出し分け ✓／合図 ${ev.length} 件`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **配られる形になっているか**（2026-08-22。hidetzu/konjaku#171 の AC 6）。
    //
    //   ⚠ **EraControlPanel を `components/` の下へ出した。**⚠ 動的キャッシュの規則は
    //     「直下の .js」しか一致しないので、⚠ **SHELL に入れ忘れると、オフラインで出ない。**
    //
    //   ⚠ **本当にネットを切って確かめる形は、⚠ 手元では作れなかった。**
    //     ⚠ `peel.html` は **`location.protocol === "https:"` のときだけ** SW を登録する。
    //     ⚠ 検査は `http://127.0.0.1` なので、⚠ **SW は一生登録されない。**
    //     ⚠ 実際に踏んだ（2026-08-22）: `navigator.serviceWorker.ready` を待つ検査を書いたら、
    //       ⚠ **解決しない Promise で 59 分止まった**（タイムアウトも効かない）。
    //   ⚠ **だから、⚠ 「SW が実際に配れる状態か」を、⚠ SW 自身の作りから確かめる。**
    //     ⚠ **静的検査（SHELL に文字列があるか）より強い**: ⚠ **実ファイルが取れることまで見る。**
    //   ⚠ **これは「オフラインで動く」の証明ではない。**⚠ そこは正直に名乗る。
    name: "年代 UI のファイルが、SHELL の経路で実際に取れる", path: "/", group: "core",
    async check(page) {
      const files = ["/components/era-control/era-control.js",
                     "/components/era-control/era-control.css"];
      const sw = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
      const out = [];
      for (const f of files) {
        // ⚠ **SHELL に載っていること**（載っていないと、SW は取りに行かない）
        must(sw.includes(`"${f}"`), `sw.js の SHELL に ${f} が無い（オフラインで年代 UI が出ない）`);
        // ⚠ **実ファイルが本当に取れること。**⚠ 綴りが合っていても中身が無ければ SW の install が失敗する
        const r = await page.request.get(`${BASE}${f}`);
        must(r.ok(), `${f} が配れない（HTTP ${r.status()}）。SHELL に書いても実体が無い`);
        const body = await r.text();
        must(body.length > 200, `${f} の中身が空に近い（${body.length} 字）`);
        out.push(`${f.split("/").pop()} ${Math.round(body.length / 1024)}KB`);
      }
      // ⚠ **動的キャッシュに頼れないことを、⚠ 規則そのもので確かめる。**
      //   ⚠ 「SHELL から外しても、動的キャッシュが拾ってくれる」と思い込まないため
      // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **この決まりを説明したコメントの字面を拾う**
      //   （CLAUDE.md §9。⚠ 2026-08-22 に実際に踏んだ: SHELL のコメントに書いた
      //    「下の CACHEABLE を読む」を規則の本体と取り違えた）。
      const swBare = sw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      const rt = /const CACHEABLE\s*=\s*\[([\s\S]*?)\];/.exec(swBare)?.[1];
      must(rt, "sw.js の動的キャッシュの規則（CACHEABLE）を読めない（この検査が何も見ていない）");
      must(!/components/.test(rt),
        "動的キャッシュが components の下を拾う形になっている（SHELL の検査が意味を失う）");
      return `${out.join("／")}／SHELL に 2 件／動的キャッシュは components を拾わない`;
    },
  },
];
