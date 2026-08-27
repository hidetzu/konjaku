// 実描画 — 押さずに読める（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 40 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **離れた 3 件を集めたので、⚠ 並びは動く。**
//
// ⚠ **元ファイルの見出しをそのまま持ってきている**（⚠ 消さない）:
//     `// ---- この年代を聞く ----`
//
// ⚠ **3 件とも「⚠ 操作しなくても、⚠ そこに書いてあるか」を見ている**:
//     区分名   ⚠ **答えの区分名の意味が、⚠ 押さずに読める**
//     約束     ⚠ **強い約束は畳まずに読め、⚠ 3 段は 1 回開けば読める**
//     読み上げ ⚠ **読み上げは、⚠ 画面より多くのことを言わない**
//
// ⚠ **畳んだ先にあるものは、⚠ 「書いてある」と言い切れない**（⚠ 開く手間の分だけ届かない）。
// ⚠ **逆に、⚠ 読み上げだけが多くを言うのも食い違い**（⚠ 目で読む人と耳で聞く人で答えが変わる）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

// ⚠ **`readFile` は `lib.mjs` ではなく Node から**（⚠ 移設で取りこぼしやすい。⚠ 実際に落とした）。
import { readFile } from "node:fs/promises";
import {
  WORDS, BASE, TOYOSU, KARUIZAWA, waitVerdict, wdItem,
  stubWikidata, waitStrip, settleAfterCondition, must
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **答えに出ている区分名の意味が、「なぜそう言える？」を押さずに分かる**
    //   （2026-08-22。hidetzu/konjaku#148）。
    //
    //   ⚠ 実測（2026-08-21・利用者役 4 名・画面だけを見せた）: 見せ方の 3 案すべてで、
    //     ⚠ **初見の 1 名が「旧水部の意味が分からない」**と答えた。⚠ 配置ではなく語の話。
    //   ⚠ **説明そのものは前からあった。**⚠ 押さないと出ない所（根拠パネル）にあった。
    //
    //   ⚠ **字を書き写さない。**⚠ 画面に出ている区分名を**先に控えてから**、
    //     ⚠ その名前で words.js に引き直して突き合わせる
    //     （掟: 外の答えに依存する部分は、実際に返ってきた値を控えてから判定する）。
    //   ⚠ **原典は消えていないこと**まで見る。⚠ 補助説明は原典の置き換えではない。
    //     ⚠ 押す前は出ておらず、⚠ **押すと全文と出典が出る**。
    //   ⚠ **その大きさで読み込む**（伸縮すると写真が前の高さを保つ。同じ穴を 2 度踏んでいる）。
    //   ⚠ **hasTouch を付ける**（付けないと (hover:none) が効かず 14px ずれる）。
    name: "答えの区分名の意味が、押さずに読める", path: "/", group: "core",
    async check(page) {
      const LF = JSON.parse(await readFile(new URL("../../public/data/landform.json", import.meta.url), "utf8"));
      // ⚠ **判定カードの高さの上限**（Owner 決定 5・2026-08-22）。⚠ 375px のときの値
      const CARD_MAX = 1625;
      const out = [];
      for (const [w, h, place, label] of [
        [375, 667, TOYOSU, "豊洲"], [344, 882, TOYOSU, "豊洲"], [320, 640, TOYOSU, "豊洲"],
        [1280, 800, TOYOSU, "豊洲"],
        // ⚠ **広い区分でも説明が出ること**（詳細版が整備されていない土地）。
        //   ⚠ 例外を作らないと決めたので、⚠ **豊洲だけ見ても足りない**（Owner 決定 4）
        [375, 667, KARUIZAWA, "軽井沢"]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${place}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (e) => { const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom) }; };
            const rows = [...document.querySelectorAll("#verdict .v-head .tx")].map((tx) => {
              const nm = tx.querySelector("b"), gl = tx.querySelector(".gl");
              return { name: nm?.textContent.trim() ?? "", gloss: gl?.textContent.trim() ?? "",
                shown: !!gl && gl.checkVisibility(),
                // ⚠ **区分名の直下**。⚠ 上にあっても横にあっても駄目
                under: !!nm && !!gl && R(gl).t >= R(nm).b, gap: !!nm && !!gl ? R(gl).t - R(nm).b : null,
                dim: gl ? getComputedStyle(gl).color !== getComputedStyle(nm).color : false };
            });
            const d = document.documentElement;
            return { rows, card: Math.round(document.getElementById("verdict").getBoundingClientRect().height),
              text: (document.getElementById("verdict")?.innerText ?? "").replace(/\s+/g, " "),
              over: d.scrollWidth - d.clientWidth };
          });
          must(g.rows.length >= 1, `${w}×${h} ${label}: 答えの行が無い`);
          for (const r of g.rows) {
            must(r.name, `${w}×${h} ${label}: 答えの行に区分名が無い`);
            // ⚠ **字は words.js の 1 か所。**⚠ ここへ書き写さない
            const want = WORDS.groundGloss(r.name);
            must(want, `${w}×${h} ${label}: 「${r.name}」の補助説明を words.js が持っていない`);
            must(r.shown, `${w}×${h} ${label}: 「${r.name}」の補助説明が見えていない（押さないと読めない）`);
            must(r.gloss === want,
              `${w}×${h} ${label}: 補助説明が words.js と違う（画面「${r.gloss}」／words.js「${want}」）`);
            must(r.under && r.gap <= 10,
              `${w}×${h} ${label}: 補助説明が区分名の直下に無い（間 ${r.gap}px）`);
            // ⚠ **答えより弱く。**⚠ 同じ格だと、どちらが答えか分からなくなる
            must(r.dim, `${w}×${h} ${label}: 補助説明が区分名と同じ見た目（どちらが答えか分からない）`);
            // ⚠ **原典は、押す前には出ていない**（18 字に収めた理由がここ）
            const why = LF.classes[r.name]?.why ?? "";
            must(why, `${w}×${h} ${label}: landform.json に「${r.name}」の原典が無い`);
            must(!g.text.includes(why),
              `${w}×${h} ${label}: 押す前の判定カードに原典の全文が出ている（${why.slice(0, 20)}…）`);
          }
          must(g.over <= 0, `${w}×${h} ${label}: 横にあふれている（${g.over}px）`);
          // ⚠ **判定カードは、説明を足したことを理由に伸びない**（Owner 決定 5）
          if (w === 375 && h === 667)
            must(g.card <= CARD_MAX,
              `${w}×${h} ${label}: 判定カードが ${g.card}px（上限 ${CARD_MAX}px）`);

          // ⚠ **原典と出典は失われていない。**⚠ 押すと全文が出る（AC3）
          await p2.click("#whyBtn");
          await p2.waitForSelector("#own .ev", { timeout: 20000 });
          const own = await p2.evaluate(() => ({
            text: (document.getElementById("own")?.innerText ?? "").replace(/\s+/g, " "),
            links: document.querySelectorAll("#own .card[data-k=landform] .ev a").length }));
          const why1 = LF.classes[g.rows[0].name]?.why ?? "";
          must(own.text.includes(why1),
            `${w}×${h} ${label}: 根拠パネルから原典が消えている（${why1.slice(0, 20)}…）`);
          must(own.links >= 1, `${w}×${h} ${label}: 根拠パネルに出典（参照したデータ）が無い`);
          out.push(`${w}×${h} ${label} ${g.rows.map((r) => `${r.name}→「${r.gloss}」`).join("／")}`
            + `（カード ${g.card}px）`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ **2026-08-23 に、⚠ 主張を書き換えた**（Owner 判断。⚠ **こちらの提案ではない**）。
    //
    // ⚠ **前は「3 段が、畳まずに読めること」を見ていた**（2026-08-20 の決定）。
    //   ⚠ 利用者役 2/4 が「これは先に見たかった」と言ったのが理由だった。
    //
    // ⚠ **いまは、⚠ 畳まずに見えるのは「いちばん強い約束 2 つ」だけ。**
    //   ⚠ **何が弱くなったかは \`public/words.js\` の \`PRIVACY_LEAD\` に書いてある。**
    //   ⚠ **ここには写さない**（⚠ 2 か所に書くと、片方だけ古くなる）。
    //
    // ⚠ **弱くなったぶん、⚠ ここで見ることを増やした。**
    //   1) 常時見える 1 行が、⚠ **強い約束 2 つを言っている**
    //   2) ⚠ **「どこにも送らない」へ広げていない**（⚠ 2026-08-15 に直した嘘）
    //   3) ⚠ **3 段は「▸ プライバシーについて」を 1 回開けば読める**
    //      ⚠ **実際に開いて確かめる。**⚠ 中身があることを、字で見る
    //   4) ⚠ 場所を選んだあとも消えない
    name: "強い約束は畳まずに読め、3 段は 1 回開けば読める", path: "/",
    async check(page) {
      // ⚠ **畳まずに見える側**（⚠ 2 つの約束）
      const LEAD = [[/計測データに(は)?含めません|計測に[^。]*送/, "計測データに含めない"],
                    [/Cookie/, "Cookie を使わない"]];
      // ⚠ **畳みの中**（⚠ 3 段）。
      // ⚠ **文をまたいで拾わせない。**⚠ 2026-08-23 に実際に踏んだ:
      //   ⚠ **「調べた場所が配信元へ届く」の文を丸ごと消しても、
      //     ⚠ 「接続元の IP が配信元に届きます」が残っていて緑のままだった。**
      //   ⚠ **IP が届くことと、⚠ 調べた場所が届くことは別の主張。**
      // ⚠ **1 つの文の中で結びついていること**まで見る。
      const NEED = [
        [[/調べた場所/, /URL|アドレス欄/, /入(り|ります)/], "載る"],
        [[/URL|アドレス/, /配信|Cloudflare/, /届|渡/], "届く（⚠ IP の文では代用できない）"],
        [[/こちらの記録に/, /残りません/], "残らない"],
      ];
      // ⚠ **文で切ってから見る**（⚠ 「。」と改行で切る）
      const lacks = (txt) => {
        const ss = (txt ?? "").split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
        return NEED.filter(([res]) => !ss.some((t) => res.every((re) => re.test(t))))
          .map(([, n]) => n);
      };
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(
          () => (document.getElementById("privacyShort")?.textContent ?? "").length > 10,
          null, { timeout: 30000 });
        const r = await page.evaluate(() => {
          const e = document.getElementById("privacyShort");
          const b = e.getBoundingClientRect();
          const q = document.querySelector("#q").getBoundingClientRect();
          const d = document.documentElement;
          return { seen: e.checkVisibility(), inView: b.bottom <= innerHeight,
                   y: Math.round(b.top), qy: Math.round(q.top),
                   txt: e.textContent.replace(/\s+/g, " ").trim(),
                   inDetails: !!e.closest("details"),
                   over: d.scrollWidth > d.clientWidth };
        });
        must(r.seen, `${w}px: プライバシーの3段が見えていない`);
        must(r.inView, `${w}px: プライバシーの3段が画面の外にある（y=${r.y}）`);
        must(!r.inDetails, `${w}px: プライバシーの3段が畳んだ中にある（送る前に読めない）`);
        must(r.y > r.qy, `${w}px: 検索欄より上にある（y=${r.y} / #q=${r.qy}）`);
        must(!r.over, `${w}px: 横にあふれている`);
        const miss = LEAD.filter(([re]) => !re.test(r.txt)).map(([, n]) => n);
        must(!miss.length, `${w}px: 強い約束が落ちている（${miss.join("・")}）: ${r.txt.slice(0, 60)}`);
        // ⚠ **言い切りすぎていないこと**（⚠ 調べた場所は URL に載り、開けば配信元へ届く）
        must(!/どこにも送(りません|らず)|一切送/.test(r.txt),
          `${w}px: 「どこにも送らない」まで言い切っている: ${r.txt.slice(0, 60)}`);
        out.push(`${w}: y=${r.y}`);
      }
      // ⚠ **3 段は、⚠ 1 回開けば読める。**⚠ **実際に開いて、⚠ 字で確かめる。**
      //   ⚠ **これが、⚠ 常時見える場所から 2 段落としたことの担保。**
      await page.setViewportSize({ width: 375, height: 667 });
      const opened = await page.evaluate(() => {
        const d = [...document.querySelectorAll("footer details")]
          .find((x) => /プライバシー/.test(x.querySelector("summary")?.textContent ?? ""));
        if (!d) return null;
        d.open = true;
        const body = d.querySelector("[data-privacy-body]");
        return { seen: body?.checkVisibility() ?? false,
                 txt: (body?.textContent ?? "").replace(/\s+/g, " ").trim() };
      });
      must(opened, "「プライバシーについて」の畳みが無い（3 段の行き先が消えている）");
      must(opened.seen, "畳みを開いても、詳しい説明が出てこない");
      const deep = lacks(opened.txt);
      must(!deep.length,
        `畳みの中から段が落ちている（${deep.join("・")}）`
        + `：⚠ 常時見える 1 行は短くしたので、⚠ 3 段はここにしか残っていない`);
      // ⚠ **詳しい説明は残っていること**（要約が出たからといって消さない）
      const sums = await page.$$eval("footer summary", (es) => es.map((e) => e.textContent.trim()));
      must(sums.some((t) => /プライバシー/.test(t)),
        `畳んである詳しい説明が消えている: ${sums.join("・")}`);
      // ⚠ **場所を選んでも、⚠ フッターに残っている**（2026-08-23。Owner 判断で変えた）。
      //   ⚠ **前は「場所を選んだら消える」ことを見ていた**（\`#scope.on ~ .privacy-short\`）。
      //     ⚠ 理由は「送ったあとに残すと『これから送ります』に読める」。
      //   ⚠ **置き場所がフッターへ移ったので、⚠ その理由が当たらなくなった。**
      //     ⚠ フッターは常時ある場所で、⚠ **書いてあるのは、⚠ いつでも成り立つ事実**
      //     （調べた場所は URL に入る／開くと配信元へ届く／こちらの記録には残らない）。
      //     ⚠ **「これから送ります」とは書いていない。**
      //   ⚠ **消えないことを見る。**⚠ 消えると、⚠ **判定したあとに読み返せない。**
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${page.url().split("?")[0]}?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`);
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const after = await page.evaluate(() => {
        const e = document.getElementById("privacyShort");
        return { seen: e?.checkVisibility() ?? false, inDetails: !!e?.closest("details"),
                 inFooter: !!e?.closest("footer"),
                 txt: (e?.textContent ?? "").replace(/\s+/g, " ").trim() };
      });
      must(after.seen, "場所を選んだあと、プライバシーの記述が消えている（判定後に読み返せない）");
      must(after.inFooter, "プライバシーの記述がフッターの外にある（常時ある場所に置く）");
      must(!after.inDetails, "場所を選んだあと、プライバシーの記述が畳んだ中にある");
      const gone = LEAD.filter(([re]) => !re.test(after.txt)).map(([, n]) => n);
      must(!gone.length, `場所を選んだあと、約束が落ちている（${gone.join("・")}）: ${after.txt.slice(0, 60)}`);
      return `4 幅すべてで畳まず画面内（${out.join(" / ")}）／強い約束 2 つ・言い切りなし`
        + `／3 段は 1 回開けば読める／場所を選んでもフッターに残る`;
    },
  },
  // ---- この年代を聞く ----
  // ⚠ 読み上げるのは、画面に出ているのと同じ文だけ。
  //   「1964年。このころ、この周辺には……」は書けない（掟: 画素から出せないことは言わない）。
  //   聞いている人は文字を追えないので、**画面より多くのことを言わない**のが特に重要。
  {
    name: "読み上げは、画面より多くのことを言わない", path: `/?${TOYOSU}`,
    // ⚠ 「無くなったもの」を必ず1件入れる。入れていなかったせいで、
    //   画面が「2020 ○○（取り消し線）［無くなった］」と出しているのに
    //   読み上げが「1934年、○○。」と言う、という食い違いを見逃す状態だった
    //   （2026-08-14 検証者の指摘）。§9 で kind を種類に変えるとき、
    //   読み上げだけが8つの読み手のうち無防備になる。
    setup: (page) => stubWikidata(page, [
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○百貨店", 1934, 2020, 139.7975, 35.6549),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      // 実際に喋らせず、渡される文だけを取る（音は環境依存なので、内容を見る）
      const said = await page.evaluate(() => new Promise((res) => {
        const orig = speechSynthesis.speak.bind(speechSynthesis);
        speechSynthesis.speak = (u) => { res(u.text); };
        document.getElementById("sayBtn").click();
        setTimeout(() => res(""), 3000);
      }));
      must(said.length > 0, "🔊 を押しても、読み上げる文が作られていない");
      // ⚠ 計測の無い機能を増やさない（era.moved / open.peel と同じ扱いにする）
      must(await page.evaluate(() => !!window.KonjakuShare), "計測の入口が無い");

      // 画面に出ている文だけでできていること
      // ⚠ **答えの行と、その下の補助説明を別々に取る**（2026-08-22。hidetzu/konjaku#148）。
      //   ⚠ **画面は行で割れており、声は「。」で区切る。**⚠ 地の文どうしを比べると、
      //     ⚠ **区切りの有無だけで落ちる**（実際にそれで落とした）。
      //   ⚠ **答えの行は 2 つある**（成因と人工改変）。⚠ **1 つ目だけ見ていた。**
      const shown = await page.evaluate(() => ({
        verdict: [...document.querySelectorAll("#verdict .v-head .tx")].flatMap((tx) => {
          const g = tx.querySelector(".gl")?.textContent.trim() ?? "";
          const line = (g ? tx.textContent.replace(g, "") : tx.textContent).trim();
          return g ? [line, g] : [line];
        }),
        era: document.getElementById("yrBig")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        rows: [...document.querySelectorAll(".ev-it .ev-l")].map((e) => e.textContent.trim()),
      }));
      must(shown.verdict.length >= 1, "答えの行が取れていない（この検査が何も見ていない）");
      // ⚠ **画面に出したものは、声も読む。**⚠ 見える人と聞く人で内容を変えない
      for (const v of shown.verdict)
        must(said.includes(v), `画面に出ている答えを読んでいない: 「${v}」／声「${said}」`);
      for (const r of shown.rows.slice(0, 3))
        must(said.includes(r), `画面に出ている行を読んでいない: ${r}`);
      // ⚠ 無くなったものは、無くなったと読むこと。
      //   画面が取り消し線で「無くなった」と出しているのに、声が「できた」と言わない
      if (shown.rows.includes("○○百貨店"))
        must(/○○百貨店が無くなり/.test(said) || /2020年に、○○百貨店/.test(said),
          `画面は「無くなった」なのに、声がそう言っていない: 「${said}」`);
      // ⚠ 画面に無いものを喋らない。作文の混入をここで止める
      const invented = ["このころ", "でしょう", "と思われ", "だったようです", "栄え", "賑わ"];
      for (const w of invented) must(said.includes(w), `作文が混ざっている: 「${w}」`);

      // 端末の中で合成していることを、画面にも書いてあること。
      // ⚠ 置き場所は footer の .f-priv（プライバシーの話は1か所にまとめた）。
      //   以前は帯の下にもあり、同じ主題が2か所にあった（2026-08-14）。
      // ⚠ 畳んだ details の中でもよい（textContent は畳んでいても取れる）。
      //   見たいのは「どこかに書いてあるか」で、常時見えている必要はない。
      const priv = await page.locator("footer").textContent();
      must(/端末の中で合成/.test(priv), "音声をどこで作っているか書かれていない");

      // 年代を変えたら、前の年代の読み上げは止まること（画面と声が食い違わない）
      const stopped = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const orig = speechSynthesis.cancel.bind(speechSynthesis);
        speechSynthesis.cancel = () => { n++; orig(); };
        document.querySelectorAll("#strip .f")[3].click();
        setTimeout(() => res(n), 800);
      }));
      must(stopped > 0, "年代を変えても、前の年代の読み上げが止まらない");
      return `「${said.slice(0, 52)}…」／画面の行と一致／作文なし`;
    },
  },
];
