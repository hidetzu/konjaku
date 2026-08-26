// 実描画 — 幅と文字サイズが変わっても、必要なものが画面に入る（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 11 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **3 つの連続した塊を集めた**ので、⚠ **並びは動く**（⚠ 件数と判定の字は変わらない）。
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **ここが守っているもの**:
//     広い幅     ⚠ **PC で答えが画面の中に入る。**⚠ **狭い幅の見え方は変えない**
//                ⚠ **2 段組は 1100px から**（⚠ 1099px では 1 カラムのまま）
//     器         ⚠ **PC では年代の表示と操作が 1 つの器。**
//                ⚠ **パネルを閉じても、⚠ 土地の答えは HUD へ戻らない**（⚠ 答えは 1 か所）
//     文字サイズ ⚠ **上げたら字が大きくなる**（⚠ 横あふれ 0）
//     初期画面   ⚠ **答え・写真・重ねるが入る。**⚠ **文字サイズを上げても写真が資料として残る**
//     余り       ⚠ **写真は、⚠ 上に積んだものに合わせて縮む**（⚠ 定数ではない。ADR 0038）
//
// ⚠ **文字サイズは「読み込む前」に効かせる**（⚠ あとからだと `layoutBig()` が置き直さず、
//   ⚠ **判定点の位置が嘘になる**）。⚠ **`hasTouch` を付ける**（⚠ 付けないと 14px ずれる）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, BASE, TOYOSU, waitVerdict, waitStrip, settleAfterCondition, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **PC の 2 カラム**（hidetzu/konjaku#87）。
    //   ⚠ **静的検査だけでは足りない。**「grid と書いてある」ことは見られても、
    //     ⚠ **実際に答えが画面の中へ入るか**は描かないと分からない。
    //   ⚠ **高さ 800px を必ず含める。**⚠ 900 以上だと、直す前でも通ってしまう
    //     （実測 2026-08-20: 答えの下端 y=811。800 では外、900 では中）。
    //   ⚠ **境目（1099 / 1100）そのものを見る。**
    //   ⚠ **狭い幅を対にして見る。**PC だけ見ると、スマホを壊しても緑になる。
    name: "PC では答えが画面の中に入り、狭い幅は変わらない",
    path: "/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975",
    async check(page) {
      // ⚠ **判定中に素通りしていた**（2026-08-21 に main で落ちて分かった）。
      //   ⚠ 前は `/旧水部|土地/` で待っていたが、⚠ **「この土地の成り立ちを判定中…」にも
      //     ⚠ 「土地」が入っている。**⚠ 判定中の段の並びは、判定後と違う。
      //   ⚠ 実際に落ちた: ⚠ **375 を判定中に読み、⚠ 1100 を判定後に読んで、
      //     ⚠ 「DOM の順が狭い幅と違う」**。⚠ **製品ではなく検査の不具合。**
      await waitVerdict(page);
      // ⚠ **出来事は後から届いて、⚠ #verdict に段が増える。**⚠ 並びが落ち着くまで待つ。
      //   ⚠ 2 回続けて同じ並びなら落ち着いたとみなす。
      await page.waitForFunction(() => {
        const o = [...document.getElementById("verdict").children]
          .map((e) => e.id || String(e.className).split(" ")[0] || e.tagName).join(",");
        const prev = window.__ordSeen;
        window.__ordSeen = o;
        return prev === o;
      }, null, { timeout: 45000, polling: 700 });
      const read = () => page.evaluate(() => {
        const d = document.documentElement;
        const g = (s) => { const e = document.querySelector(s);
          if (!e || !e.checkVisibility()) return null;
          const b = e.getBoundingClientRect();
          return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), b: Math.round(b.bottom) }; };
        const vd = document.getElementById("verdict"), lb = document.getElementById("list");
        return {
          vhead: g(".v-head"), big: g("#big"),
          // ⚠ **2 カラムかどうかは、見た目で決める。**⚠ 作り方（grid / float）を書かない。
          //   ⚠ 2026-08-20 に踏んだ: grid をやめて float にしたら、
          //     ⚠ **製品ではなく検査が落ちた**（gridTemplateColumns を見ていた）。
          //   ⚠ **答えと写真の横の範囲が重ならなければ、横に並んでいる＝2 カラム。**
          twoCol: (() => {
            const a = document.querySelector(".v-head")?.getBoundingClientRect();
            const c = document.getElementById("big")?.getBoundingClientRect();
            if (!a || !c) return null;
            return !(a.left < c.right && c.left < a.right);
          })(),
          // ⚠ **次の体験（この場所を深掘り）が、⚠ 判定カードの中にあること**（2026-08-21）。
          //   ⚠ 前はここで「判定の箱と一覧の溶接（隙間 0px）」を見ていた。
          //     ⚠ **深掘りをカードの中へ入れたので、⚠ 溶接そのものをやめた。**
          //   ⚠ **守りたいことは同じ**: ⚠ 答えを読んだ流れのまま、次の体験に届くこと。
          cta: (() => { const c = document.getElementById("peelCta");
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { inCard: !!c.closest("#verdict"), x: Math.round(r.left),
              b: Math.round(r.bottom) }; })(),
          // ⚠ DOM の順（読み上げとキーボードの順）
          order: [...vd.children].map((e) => e.id || String(e.className).split(" ")[0] || e.tagName).join(","),
          over: d.scrollWidth - d.clientWidth, vh: innerHeight, pageH: d.scrollHeight,
        };
      });
      // ---- ⚠ 狭い幅は 1 カラムのまま ----
      const narrow = {};
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await settleAfterCondition(page);
        const r = await read();
        must(r.twoCol === false, `${w}px: 狭い幅が 2 カラムになっている`);
        must(r.over <= 0, `${w}px: 横にあふれている（${r.over}px）`);
        narrow[w] = r;
      }
      // ---- ⚠ 境目そのもの ----
      await page.setViewportSize({ width: 1099, height: 800 });
      await settleAfterCondition(page);
      const at1099 = await read();
      must(at1099.twoCol === false, "1099px で 2 カラムになっている（1100 から、のはず）");
      await page.setViewportSize({ width: 1100, height: 800 });
      await settleAfterCondition(page);
      const at1100 = await read();
      must(at1100.twoCol === true, "1100px で 2 カラムになっていない");
      // ---- ⚠ PC で、答えが画面の中 ----
      const out = [];
      for (const [w, h] of [[1100, 800], [1280, 800], [1440, 900], [1920, 1080]]) {
        await page.setViewportSize({ width: w, height: h });
        await settleAfterCondition(page);
        const r = await read();
        must(r.vhead, `${w}px: 答えの文が見えていない`);
        must(r.vhead.b <= r.vh, `${w}px: 答えが画面の外にある（下端 ${r.vhead.b} > ${r.vh}）`);
        must(r.over <= 0, `${w}px: 横にあふれている（${r.over}px）`);
        // ⚠ 左に答え、右に写真。⚠ **左右が入れ替わっていないこと**
        must(r.big && r.big.x > r.vhead.x,
          `${w}px: 写真が答えより左にある（写真 x=${r.big?.x} / 答え x=${r.vhead.x}）`);
        // ⚠ **次の体験が判定カードの中にあること**（2026-08-21。溶接から置き換えた）
        must(r.cta && r.cta.inCard, `${w}px: 深掘りの導線が判定カードの中に無い`);
        // ⚠ **写真と同じ側（右の列）にいること。**⚠ 流れの中の箱にすると 2 カラムが壊れる
        //   （⚠ 実測で踏んだ: #verdict が 605 → 1074px・ページが 1546 → 1643px）
        must(r.cta.x > r.vhead.x,
          `${w}px: 深掘りの導線が答えと同じ列にいる（2 カラムが壊れている）`);
        // ⚠ **縦のあふれを増やしていないこと。**⚠ この Issue は、それを直すもの。
        //   ⚠ 直す前は 4 幅とも 1879px（2026-08-20 実測）。⚠ **超えたら本末転倒。**
        must(r.pageH <= 1879,
          `${w}px: 横を使ったのに縦が増えている（ページ高 ${r.pageH} > 直す前の 1879）`);
        // ⚠ **DOM の順が、狭い幅と同じであること**（CSS だけで割った証拠）
        must(r.order === narrow[375].order,
          `${w}px: DOM の順が狭い幅と違う（読み上げとキーボードの順が変わっている）`);
        out.push(`${w}: 答え y=${r.vhead.b} 写真 ${r.big.w}px`);
      }
      return `1099 は 1 カラム／1100 から 2 カラム／${out.join(" ／ ")}`;
    },
  },

  {
    // ⚠ **ブラウザの文字サイズ設定に追従すること**（hidetzu/konjaku#91）。
    //   ⚠ **静的検査だけでは足りない。**「html に px が無い」ことは見られても、
    //     ⚠ **実際に字が大きくなるか**は描かないと分からない。
    //   ⚠ 直す前の実測（2026-08-20・375×667）: 設定を 125% / 150% にしても
    //     ⚠ **body も h1 も 1px も変わらなかった**（14 / 19px のまま）。
    //   ⚠ **既定（100%）で 1px も変えていないこと**を、対にして見る。
    //     ⚠ 片側だけだと、既定を壊しても緑になる。
    //   ⚠ **場所を選んだあとの画面も見る。**⚠ **あふれていたのはそちら**（バッジは
    //     場所を選ばないと出ない）。⚠ 2026-08-20 に踏んだ: 未選択だけを見ていて、
    //     ⚠ **わざと壊しても落ちなかった。**
    name: "ブラウザの文字サイズを上げると、字が大きくなる",
    path: "/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975",
    async check(page) {
      // ⚠ 判定が出るまで待つ（バッジはそのあとに出る）
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      const read = () => page.evaluate(() => {
        const d = document.documentElement;
        const g = (s) => { const e = document.querySelector(s);
          return e && e.checkVisibility() ? parseFloat(getComputedStyle(e).fontSize) : null; };
        return { root: parseFloat(getComputedStyle(d).fontSize),
                 body: parseFloat(getComputedStyle(document.body).fontSize),
                 h1: g("h1"), q: g("#q"),
                 over: d.scrollWidth - d.clientWidth };
      });
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForSelector("#q", { timeout: 30000 });
        // ⚠ バッジが出ていること。⚠ **出ていない画面を測っても、あふれは捕まらない**
        await page.waitForFunction(() => document.querySelectorAll(".badges .badge").length > 0,
          null, { timeout: 30000 });
        await settleAfterCondition(page);
        const base = await read();
        // ⚠ **既定は 14px のまま**（0.875rem × 16px）。⚠ ここが動いたら既定を壊している
        must(base.body === 14, `${w}px: 既定の本文が 14px でない（${base.body}px）`);
        must(base.root === 16, `${w}px: ルートがブラウザの既定（16px）でない（${base.root}px）`);
        must(base.over <= 0, `${w}px: 既定で横にあふれている（${base.over}px）`);
        for (const scale of [125, 150]) {
          // ⚠ ブラウザの「文字サイズ N%」＝ 初期ルートを 16×N/100 にすること
          const tag = await page.addStyleTag({ content: `:root{font-size:${16 * scale / 100}px !important}` });
          await settleAfterClick(page);
          const big = await read();
          const want = 14 * scale / 100;
          must(Math.abs(big.body - want) < 0.51,
            `${w}px/${scale}%: 本文が追従していない（${big.body}px。${want}px のはず）`);
          must(big.h1 > base.h1,
            `${w}px/${scale}%: 見出しが追従していない（${base.h1} → ${big.h1}px）`);
          must(big.q > base.q,
            `${w}px/${scale}%: 入力欄が追従していない（${base.q} → ${big.q}px）`);
          // ⚠ **大きくして崩れないこと。**⚠ nowrap のバッジが画面をはみ出していた
          must(big.over <= 0, `${w}px/${scale}%: 横にあふれている（${big.over}px）`);
          out.push(`${w}/${scale}%: ${big.body}px`);
          await tag.evaluate((e) => e.remove());
          await settleAfterClick(page);
        }
      }
      return `既定は 14px のまま／125%・150% で追従し、4 幅とも横あふれ 0（${out.slice(0, 4).join(" ")} …）`;
    },
  },
  {
    // ⚠ **PC では、年代の表示と年代の操作が 1 つの器**（hidetzu/konjaku#132）。
    //
    //   ⚠ **実測（2026-08-20・main = 5210c9e・豊洲・1280×800・SW 無効）**
    //     #era        580×196 y429   ⚠ 別の器
    //     #timePanel  720×136 y638   ⚠ 別の器
    //     ⚠ **「閉じる ⌄」が 2 個**（#eraToggle / #timeToggle）
    //
    //   ⚠ **全体は畳まない**（Owner 決定 2）。⚠ 畳むのは操作部（▶ と横棒）だけ。
    //   ⚠ **畳んでも、⚠ 現在の年代と #est（限界）は残る。**
    //     ⚠ #est が消えると、⚠ **推定の高さで建物が立った絵を断りなしに見せる**（掟 §1）。
    name: "PC では、年代の表示と操作が 1 つの器になっている", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        // ⚠ **#est が字を持つまで待つ**（2026-08-21。hidetzu/konjaku#141 の CI で落ちて分かった）。
        //   ⚠ `#est` は「建物が届いたか」「1.2 秒たっても届かないか」を**見てから**字を出す
        //     （`peel3d.js`。⚠ 実測: 通常回線 69ms ／ 3G 相当 9.5 秒）。
        //   ⚠ `#est:empty` は `display:none` なので、⚠ **字が入るまでは見えない。**
        //   ⚠ ここは待たずに読んでいた。⚠ **手元では間に合い、⚠ CI では 2 回とも間に合わなかった。**
        //   ⚠ **主張は変えていない**（⚠ 出なければ、⚠ 待ったうえで落ちる）。
        //   ⚠ **時間切れのまま落とさない。**⚠ 何を待って駄目だったかを名乗る
        //     （⚠ 素の時間切れだと、⚠ どの主張が破れたのか読めない）。
        const gotEst = await p2.waitForFunction(
          () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
          null, { timeout: 45000 }).then(() => true).catch(() => false);
        must(gotEst, "PC で断りが出ていない（45 秒待っても字が入らない）");
        const look = () => p2.evaluate(() => {
          const vis = (s) => { const e = document.querySelector(s);
            return !!(e && e.checkVisibility?.()); };
          return {
            // ⚠ **HUD に器がいくつ立っているか**（2026-08-22 に #era を畳んで 1 つにした）
            boxes: [...document.querySelectorAll("#hud > *")]
              .filter((e) => e.checkVisibility?.()).map((e) => e.id || e.className),
            // ⚠ **畳む仕掛けが戻っていないこと。**⚠ 別の id で作り直されても捕まえる
            toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
            // ⚠ 「いま何年代か」を出しているもの
            years: [".time-panel .y", "#timeSummary", "#rlYear"].filter(vis),
            // ⚠ **`#est` / `#over` は消えた**（2026-08-22）。⚠ **断りは板の `#notes`。**
            //   ⚠ **主張は同じ**（掟 §1: ⚠ 推定の絵を断りなしに見せない）。
            est: !!document.querySelector('#notes li[data-kind="caveat"]')?.checkVisibility(),
            play: vis("#play"), track: vis("#track"),
          };
        });
        const a = await look();
        // ⚠ **器は 1 つ。**⚠ 幅と隙間で見なくてよくなった（構造として 1 つ）
        must(a.boxes.length === 1,
          `HUD に器が ${a.boxes.length} 個ある（1 つにまとめたはず）: ${a.boxes.join(" / ")}`);
        // ⚠ **畳む仕掛けは無い**（2026-08-22。Owner 判断で消した）
        must(a.toggles === 0, `畳む仕掛けが戻っている（${a.toggles} 個）`);
        // ⚠ **「いま何年代か」は 1 か所**
        must(a.years.length === 1,
          `「いま何年代か」を ${a.years.length} か所が出している: ${a.years.join(" / ")}`);
        // ⚠ **操作は常に見える。**⚠ 「消した」だけの検査にしない（verify §5 の対）
        must(a.play && a.track, "PC で ▶ か横棒が出ていない（畳めなくしたので、常に見えるはず）");
        // ⚠ **断りは板の中**（2026-08-22）。⚠ **推定の絵を断りなしに見せない**（掟 §1）
        must(a.est, "PC で断り（建物が消える年代は推定です）が出ていない");
        return `器 ${a.boxes.length} 個（${a.boxes.join(" / ")}）・畳む仕掛け 0 個・年代 1 か所`
          + `／▶ と横棒は常に見え、限界も出ている`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **PC では、見えない箱（#land）に土地情報を組み立てない**（hidetzu/konjaku#131）。
    //
    //   ⚠ **実測（2026-08-20・main = bc8dc46・豊洲・SW 無効）**
    //     PC 初期  #land は display:none（0×0）⚠ **なのに 72 字が書かれていた**
    //
    //   ⚠ **PC でもパネルは閉じられる。**⚠ **入口は 2 つ**（✕ と ▶ の再生）。
    //     ⚠ 実測: ▶ を押しても panel は "col hide" になり、#land が 520×130 で出る。
    //     ⚠ **✕ だけに描画を足すと、⚠ ▶ で空の HUD が出る。**
    //
    //   ⚠ **待たずに読む。**⚠ 待つと、⚠ **遅れて埋まっても緑になる**（契約 4「空白を見せない」）。
    name: "PC でパネルを閉じても、HUD に答えが戻らない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        // ⚠ **2026-08-21 に、⚠ HUD の答え（#land）ごと無くなった**（hidetzu/konjaku#152）。
        //   ⚠ 前の主張: 「⚠ PC の初期表示で、⚠ 見えない箱に 72 字が書かれていた」を止める。
        //     ⚠ そのために「⚠ 見えているときだけ描く（syncHud）」を足していた。
        //   ⚠ **書く箱が無くなったので、⚠ 引き継ぎも空白も起きない。**
        //   ⚠ **主張は引き継ぐ**: ⚠ **箱が戻っていないこと**と、⚠ **✕ で例外が出ないこと。**
        const read = () => p2.evaluate(() => ({
          cls: document.getElementById("panel")?.className ?? "",
          land: document.querySelectorAll("#land").length,
          all: (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim().length,
        }));
        const a = await read();
        must(a.cls.includes("open"), `PC でパネルが広がって始まっていない（${a.cls}）`);
        must(a.land === 0, "HUD の答え（#land）が戻っている（土地の答えはパネルの 1 か所）");
        must(a.all > 0, "PC の初期表示で、パネルに答えが書かれていない");
        // ⚠ **✕ の直後、⚠ 待たずに読む**（⚠ 例外や空白が出ないこと）
        // ⚠ **✕ は消えた**（2026-08-22）。⚠ **同じ的（`#toggle`）が小さくする。**
        await p2.click("#toggle");
        const b = await read();
        // ⚠ **`.hide`（閉じている）→ `.open`（広げている）**（2026-08-22。⚠ 真偽が逆）
        must(!b.cls.includes("open"), `▴ でパネルが小さくならない（${b.cls}）`);
        must(b.land === 0, "▴ で HUD の答えが復活している");
        must(errs.length === 0, `例外が出た: ${errs.slice(0, 2).join(" / ")}`);
        await p2.close();

        // ⚠ **入口は 2 つだった**（✕ と ▶）。⚠ **✕ は 2026-08-22 に消えた。**
        //   ⚠ **`▶` は PC で板を畳まない**（⚠ `main` でも畳んでいない。⚠ 2026-08-23 に確かめた）。
        //   ⚠ **PC は板と地図が並ぶので、⚠ 畳む必要が無い。**
        //   ⚠ **主張を引き継ぐ**: ⚠ **`▶` を押しても、⚠ 例外が出ず、⚠ HUD に答えが戻らないこと。**
        //   ⚠ **「畳むこと」は主張から外した。**⚠ **起きていないことを見続けると、
        //     ⚠ この検査は「畳む実装」を要求し続ける**（⚠ いまの設計と食い違う）。
        const p3 = await ctx.newPage();
        const errs3 = [];
        p3.on("pageerror", (e) => errs3.push(e.message));
        await p3.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p3.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p3);
        const read3 = () => p3.evaluate(() => ({
          cls: document.getElementById("panel")?.className ?? "",
          land: document.querySelectorAll("#land").length,
        }));
        // ⚠ **▶ の直後、⚠ 待たずに読む**（⚠ 2 つめの入口）
        await p3.click("#play");
        const c = await read3();
        must(c.land === 0, "▶ で HUD の答えが復活している");
        // ⚠ **押したら本当に送りが始まること**（⚠ 押しても何も起きない導線を置かない。ADR 0026）
        await p3.waitForFunction(
          () => document.getElementById("play")?.getAttribute("aria-pressed") === "true"
             || /■|停止/.test(document.getElementById("play")?.textContent ?? ""),
          null, { timeout: 10000 }).catch(() => {});
        await p3.click("#play");
        await settleAfterClick(p3);
        must(errs3.length === 0, `例外が出た: ${errs3.slice(0, 2).join(" / ")}`);
        return `PC 初期はパネルに ${a.all} 字／▴ で小さくなる／▶ で送りが始まる／`
          + `HUD の答えは 0 個（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },
  {
    // ⚠ **着いた直後の画面に、答えと写真と「重ねる」が全部入る**（hidetzu/konjaku#122）。
    //
    //   ⚠ **既存の「重ねる操作が、写真と一緒に初期画面に見える」では足りない。**
    //     ⚠ あちらは 1936–42 のコマへ移し、⚠ **拡大してから**測っている。
    //     ⚠ **着いた直後（明治期のコマ・拡大なし）を誰も見ていなかった。**
    //     ⚠ 実際に穴だった: 写真の上限を外しても、あちらは緑のまま。
    //       ⚠ 着いた直後は 375×667 で 671（画面 667）、320×640 で 655（画面 640）だった。
    //
    //   ⚠ **その大きさで読み込む。**⚠ 伸縮すると写真が前の高さを保つ（同じ穴を踏む）。
    //   ⚠ **hasTouch を付ける。**⚠ 付けないと (hover:none) が効かず、⚠ **14px ずれる**
    //     （2026-08-20 実測: 付けない 645 / 付ける 659。実機は触れる端末）。
    name: "着いた直後の画面に、答えと写真と重ねるが入る", path: "/", group: "core",
    async check(page) {
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await waitStrip(p2);
          await p2.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (s) => { const e = document.querySelector(s);
              if (!e || !e.checkVisibility()) return null;
              const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom) }; };
            const d = document.documentElement;
            return { ans: R(".v-head"), big: R("#big"), ov: R("#ovRow"),
              gq: [...document.querySelectorAll(".verdict .gq")]
                .filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()),
              gqAll: document.querySelectorAll(".verdict .gq").length,
              lines: [...document.querySelectorAll(".v-head .tx")].length,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **判定が出たあとは、⚠ 1 つ目の問いの見出しを畳む**（2026-08-25。hidetzu/konjaku#176）。
          //   ⚠ **答えの文が「この土地は 旧水部」と、⚠ 既に問いを含んでいる。**
          //   ⚠ 実測（375×667）: 文字 150% でこの行が 25px。⚠ 見出し 94px・検索欄 72px と同じ話で、
          //     ⚠ **答えを出すための道具が、⚠ 答えを読んでいるあいだも画面を占めていた。**
          //   ⚠ **2 つ目（昔はどんな土地？）は残す。**⚠ 年代の帯が何の話かを言う唯一の行。
          must(g.gq.length === 1, `${w}×${h}: 問いの見出しが 1 つでない（${g.gq.length} 個: ${g.gq.join(" / ")}）`);
          // ⚠ **字は words.js の 1 か所から。**⚠ ここへ書き写さない
          must(g.gq[0] === WORDS.layerTitle(2),
            `${w}×${h}: 見出しが words.js と違う（${g.gq.join(" / ")}）`);
          // ⚠ **1 つ目は「消した」のではなく「畳んだ」。**⚠ DOM には残っている
          //   （⚠ 場所を選ぶ前は出る。⚠ 判定後だけ畳む）。
          must(g.gqAll === 2, `${w}×${h}: 問いの見出しが DOM から消えている（${g.gqAll} 個）`);
          // ⚠ **成因と人工改変は行を分ける**（ADR 0030 §4-4）
          must(g.lines === 2, `${w}×${h}: 答えが 2 行になっていない（${g.lines} 行）`);
          // ⚠ **3 つとも初期画面に入る**
          for (const [nm, r] of [["答え", g.ans], ["写真", g.big], ["重ねる", g.ov]]) {
            must(r, `${w}×${h}: ${nm} が見えていない`);
            must(r.b <= g.vh, `${w}×${h}: ${nm} が初期画面の外にある（下端 ${r.b} / 画面 ${g.vh}）`);
          }
          must(g.over <= 0, `${w}×${h}: 横にあふれている（${g.over}px）`);
          out.push(`${w}×${h} 答え${g.ans.b}／写真${g.big.b}／重ねる${g.ov.b}（画面 ${g.vh}）`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **文字サイズを上げても、⚠ 写真が資料として残る**（2026-08-25。hidetzu/konjaku#176）。
    //
    //   ⚠ **既存の「着いた直後の画面に…」は、⚠ 既定の文字サイズしか見ていない。**
    //   ⚠ **既存の「文字サイズを上げると、字が大きくなる」は、⚠ 横あふれしか見ていない。**
    //     ⚠ **縦（初期画面に入るか）と、⚠ 写真が潰れていないかは、⚠ 誰も見ていなかった。**
    //   ⚠ 直す前の実測（375×667）: ⚠ **125% で写真 37px・150% で 2px。**
    //     ⚠ **150% では「重ねる」も画面外**（734 / 667）。
    //
    //   ⚠ **文字サイズは「読み込む前」に効かせる。**
    //     ⚠ **あとから効かせると `layoutBig()` が置き直さず、⚠ 判定点の位置が嘘になる**
    //       （⚠ 2026-08-25 に踏んだ。⚠ 「判定点が枠の外」と誤って報告した）。
    //   ⚠ **その大きさで読み込む**（伸縮すると写真が前の高さを保つ）。
    //   ⚠ **hasTouch を付ける**（付けないと (hover:none) が効かず 14px ずれる）。
    //
    //   ⚠ **320×640 の 125% は入らない**（⚠ 直す前も入っていない）。⚠ **ここでは求めない。**
    //     ⚠ 求めると、⚠ **写真を 16px まで潰す値**を選ぶことになる（実測）。
    name: "文字サイズを上げても、写真が資料として残る", path: "/", group: "core",
    async check(page) {
      // ⚠ **どの条件で「重ねる」まで求めるか。**⚠ 求めないものは、⚠ 写真だけ見る
      const CASES = [
        // ⚠ **既定も対にして見る**（⚠ 片側だけだと、⚠ 既定を壊しても緑になる）。
        //   ⚠ **既定では、⚠ 写真を切り落とさない。**⚠ 直す前は 375×667 で 309×163（⚠ 比 1.90）
        //     ⚠ ＝ **正方形のモザイクの 53% しか見せていなかった**。⚠ 上限が食っていた。
        { w: 375, h: 667, scale: 100, wantOv: true, wantWhole: true },
        { w: 320, h: 640, scale: 100, wantOv: true, wantWhole: true },
        { w: 375, h: 667, scale: 125, wantOv: true },
        { w: 375, h: 667, scale: 150, wantOv: true },
        // ⚠ **320×640 も入るようになった**（2026-08-25。⚠ 写真が「余り」を取る形にした）。
        //   ⚠ 直す前は 125% で +28px・150% で +31px はみ出していた。
        //   ⚠ **写真を潰して入れたのではない**（⚠ 125% 160 → 171px ／ 150% 112 → 120px）。
        { w: 320, h: 640, scale: 125, wantOv: true },
        { w: 320, h: 640, scale: 150, wantOv: true },
        // ⚠ **横向き。**⚠ 既定の文字サイズでも写真が 2px だった。⚠ 「重ねる」は求めない
        { w: 667, h: 375, scale: 100, wantOv: false },
        { w: 844, h: 390, scale: 100, wantOv: false },
      ];
      // ⚠ **これを割ったら「資料」と呼べない。**⚠ 利用者役 4 名が「写真だと思わなかった」と
      //   ⚠ 言ったのが 37px（2026-08-25。⚠ **実在の利用者ではない**）。⚠ その上に置く
      // ⚠ **112px は足し算で決まる**（`index.html` の `.verdict > .big` を読む）:
      //   ⚠ 帰属表示 44px ＋ ＋−（PC は縦積み 32+4+32＝68px）。
      //   ⚠ **これを割ると、⚠ ＋− が出典を隠さずに置けない。**
      const FLOOR = 112;
      const out = [];
      for (const c of CASES) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: c.w, height: c.h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          // ⚠ **最初の 1 文字が来る前に効かせる**（上のコメント）
          await p2.addInitScript((px) => {
            const put = () => { if (!document.head || document.getElementById("k176")) return;
              const st = document.createElement("style"); st.id = "k176";
              st.textContent = `:root{font-size:${px}px !important}`;
              document.head.appendChild(st); };
            const t = setInterval(() => { if (document.head) { put(); clearInterval(t); } }, 4);
            document.addEventListener("DOMContentLoaded", put);
          }, 16 * c.scale / 100);
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await waitStrip(p2);
          await p2.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (s) => { const e = document.querySelector(s);
              if (!e || !e.checkVisibility()) return null;
              const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom),
                h: Math.round(b.height), w: Math.round(b.width) }; };
            const big = document.querySelector(".verdict > .big").getBoundingClientRect();
            const mk = document.querySelector(".big .mk").getBoundingClientRect();
            const d = document.documentElement;
            return { root: parseFloat(getComputedStyle(d).fontSize),
              photo: R(".verdict > .big"), ov: R("#ovRow"),
              // ⚠ **判定している点が、⚠ 写真の中に残っていること**
              mkIn: mk.top >= big.top - 1 && mk.bottom <= big.bottom + 1,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **＋− は、⚠ 写真を画面に出してから押す。**
          //   ⚠ `elementFromPoint` は **画面の外を見ない**ので、⚠ 写真が下にあると
          //     ⚠ **「押せない」と出る**（⚠ 2026-08-25 に踏んだ。⚠ 横向きで誤検知した）。
          //   ⚠ **横向きでは、⚠ 写真が初期画面の外にあるのが正しい姿**（上のコメント）。
          //   ⚠ **上の寸法は scroll 0 で測ってある。**⚠ ここから先だけスクロールする。
          const zoom = await p2.evaluate(() => {
            document.querySelector(".verdict > .big").scrollIntoView({ block: "center" });
            // ⚠ **座標を押して届くか**で見る。⚠ computed style は切られても 44×44 のまま
            const hit = (id) => { const e = document.getElementById(id);
              if (!e) return false;
              const r = e.getBoundingClientRect();
              const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!at && (at === e || e.contains(at)); };
            return { zIn: hit("zIn"), zOut: hit("zOut") };
          });
          const at = `${c.w}×${c.h}/${c.scale}%`;
          // ⚠ **文字サイズが本当に効いていること。**⚠ 効いていないと、⚠ 既定を測って緑になる
          must(Math.abs(g.root - 16 * c.scale / 100) < 0.51,
            `${at}: 文字サイズが効いていない（ルート ${g.root}px）`);
          must(g.photo, `${at}: 写真が見えていない`);
          must(g.photo.h >= FLOOR, `${at}: 写真が ${FLOOR}px を割っている（${g.photo.h}px）`);
          // ⚠ **既定では、⚠ 切り落としが小さいこと。**⚠ 写真は正方形のモザイクを切り出した窓で、
          //   ⚠ **上限が食うほど、⚠ 見えている割合が減る**（比が大きいほど細い帯になる）。
          //   ⚠ **下限だけでは守れない**（⚠ 下限は「潰れない」しか言わない）。
          if (c.wantWhole) {
            const ratio = g.photo.w / g.photo.h;
            must(ratio <= 1.5, `${at}: 既定なのに写真が細い（比 ${ratio.toFixed(2)}。1.5 まで）`);
          }
          must(g.mkIn, `${at}: 判定している点が、写真の枠の外にある`);
          // ⚠ **写真の中の ＋− が押せること。**⚠ 短い写真で枠から出ていた
          must(zoom.zIn && zoom.zOut, `${at}: 写真の ＋− が押せない（＋ ${zoom.zIn} / − ${zoom.zOut}）`);
          if (c.wantOv) {
            must(g.ov, `${at}: 重ねるが見えていない`);
            must(g.ov.b <= g.vh, `${at}: 重ねるが初期画面の外にある（下端 ${g.ov.b} / 画面 ${g.vh}）`);
          }
          must(g.over <= 0, `${at}: 横にあふれている（${g.over}px）`);
          out.push(`${at} 写真${g.photo.h}px${c.wantOv ? `／重ねる${g.ov.b}` : ""}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **写真は「余り」を取る**（2026-08-25。hidetzu/konjaku#176 の続き）。
    //
    //   ⚠ **以前は定数だった**（`max-height:calc(100dvh - 31.5rem)`）。⚠ **上に積んだものの合計を
    //     CSS へ手で書き写していた**ので、⚠ **上が増えても写真は縮まず、⚠ 「重ねる」が押し出された。**
    //   ⚠ **測り直すたびに別の条件が落ちた**（⚠ 実際に 3 回測り直した）。
    //
    //   ⚠ **この検査は「値」ではなく「仕組み」を見る。**
    //     ⚠ **上に高さを足して、⚠ 写真が同じだけ縮むか**を見る。
    //     ⚠ **定数へ戻すと、⚠ 写真は縮まず「重ねる」が画面外へ出る**ので落ちる。
    //   ⚠ **足す量は 60px**（⚠ 端数で丸めに埋もれない大きさ）。
    //
    //   ⚠ **縦の短い画面で見る**（375×560）。⚠ **上限と下限のどちらも効かない幅**が要る:
    //     ⚠ 375×667（既定）は **上限が効いていない**（⚠ 写真が 4:3 の自然な高さ 232px で収まる）。
    //       ⚠ **足しても縮まない。**⚠ 1 回目はそれで落ちた。
    //     ⚠ 375×520 は **足したら下限（112px）にぶつかる**（⚠ 152 → 112 で 40px しか縮まない）。
    //       ⚠ 2 回目はそれで落ちた。
    //     ⚠ **どちらも「仕組みが壊れた」のではなく、⚠ 測る場所が悪かった。**
    name: "写真は、上に積んだものに合わせて縮む", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 560 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      await settleAfterCondition(page);
      const read = () => page.evaluate(() => {
        const big = document.querySelector(".verdict > .big").getBoundingClientRect();
        const ov = document.getElementById("ovRow").getBoundingClientRect();
        return { photo: Math.round(big.height), ovB: Math.round(ov.bottom), vh: innerHeight };
      });
      const before = await read();
      must(before.ovB <= before.vh,
        `足す前から「重ねる」が初期画面の外（${before.ovB} / ${before.vh}）`);
      // ⚠ **写真の上へ 60px 足す。**⚠ 判定カードの中に入れる（⚠ 外だと上に積んだことにならない）
      const GROW = 60;
      await page.evaluate((px) => {
        const big = document.querySelector(".verdict > .big");
        const pad = document.createElement("div");
        pad.id = "renderPad";
        pad.style.height = `${px}px`;
        big.parentNode.insertBefore(pad, big);
        // ⚠ **測り直させる**（⚠ 画面の大きさが変わったときと同じ道を通す）
        dispatchEvent(new Event("resize"));
      }, GROW);
      await settleAfterCondition(page);
      const after = await read();
      const shrank = before.photo - after.photo;
      // ⚠ **同じだけ縮んだか。**⚠ 丸めのぶんだけ許す
      must(Math.abs(shrank - GROW) <= 2,
        `上に ${GROW}px 足したのに、写真が ${shrank}px しか縮んでいない`
        + `（${before.photo} → ${after.photo}px。⚠ 定数だと縮まない）`);
      // ⚠ **縮んだ結果、⚠ 「重ねる」は初期画面に残っていること**
      must(after.ovB <= after.vh,
        `上に足したら「重ねる」が初期画面の外へ出た（${after.ovB} / ${after.vh}）`);
      return `写真 ${before.photo} → ${after.photo}px（上に ${GROW}px 足した）`
        + ` ／ 重ねる ${before.ovB} → ${after.ovB}（画面 ${after.vh}）`;
    },
  },
];
