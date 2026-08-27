// 実描画 — 同じことを、⚠ 2 か所で言わない（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 36 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **離れた 1 件 ＋ 連続した 2 件を集めたので、⚠ 並びは動く。**
//
// ⚠ **3 件とも hidetzu/konjaku#130 の側**（⚠ **同じ主張を、⚠ 画面の 2 か所に置かない**）:
//     区分名   ⚠ **判定カードの 2 か所で言わない**
//     導線     ⚠ **根拠を開いても、⚠ 深掘りの入口は 1 か所のまま**
//     数字     ⚠ **同じ数字を、⚠ 画面の 2 か所で言わない**
//
// ⚠ **2 か所に置くと、⚠ 片方だけ直る。**⚠ **そのとき、⚠ どちらが正本か画面から読めない。**
//   ⚠ **これは見た目の話ではない**（⚠ 利用者は「違う 2 つのこと」と読む）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  BASE, TOYOSU, SAPPORO, KIYOSUMI, KARUIZAWA,
  waitVerdict, settleAfterCondition, must
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **同じ区分名を、判定カードの 2 か所で言わない**（2026-08-21。hidetzu/konjaku#139）。
    //   ⚠ 前は バッジ「🌊 旧水部」と 答え「この土地は 旧水部」が並んでいた。
    //   ⚠ 人工地形も同じ（バッジ「🏗 盛土地･埋立地」／答え「人の手で 盛土地･埋立地 に
    //     なっています」）。⚠ 実測（375×667・hasTouch・SW 無効・2026-08-21）で
    //     **豊洲・軽井沢・上野・札幌の 4 地点すべて**が該当した。
    // ⚠ **バッジという層を消したのではない。**⚠ 明治期・標高・写真は残す。
    //   ⚠ **そこにしか無いから**（明治期のデータなし／記録なし は、ほかのどこにも出ない）。
    // ⚠ **区分名を書き写さない。**⚠ 答えの行の `<b>` が、⚠ **強調している語そのもの**なので、
    //   ⚠ そこから取る。⚠ 土地ごとに変わる語を検査に直書きすると、⚠ 語が増えた日に落ちる。
    name: "区分名を、判定カードの 2 か所で言わない", path: `/?${TOYOSU}`,
    async check(page) {
      const out = [];
      for (const [name, q] of [["豊洲", TOYOSU], ["軽井沢", KARUIZAWA],
                               ["札幌", SAPPORO], ["清澄白河", KIYOSUMI]]) {
        if (page.url() !== BASE + `/?${q}`)
          await page.goto(BASE + `/?${q}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        const r = await page.evaluate(() => ({
          // ⚠ 答えの行が強調している語（＝地形分類と人工地形）
          words: [...document.querySelectorAll("#verdict .v-head b")].map((e) => e.textContent.trim()),
          badges: [...document.querySelectorAll("#verdict .badge")]
            .map((e) => ({ k: e.dataset.k ?? "", t: e.textContent.replace(/\s+/g, " ").trim() })),
        }));
        must(r.words.length > 0, `${name}: 答えの行が区分名を強調していない`);
        for (const w of r.words) {
          const hit = r.badges.filter((b) => b.t.includes(w));
          must(hit.length === 0,
            `${name}: 「${w}」を答えとバッジの 2 か所で言っている: ${hit.map((h) => h.t).join(" / ")}`);
        }
        // ⚠ **残すものが残っていること。**⚠ 消しすぎると、ここにしか無い事実が落ちる。
        const keys = new Set(r.badges.map((b) => b.k));
        for (const k of ["meiji", "elevation", "photos"])
          must(keys.has(k), `${name}: ${k} のバッジが消えている: ${[...keys].join(" / ")}`);
        out.push(`${name} 答え ${r.words.join("・")}／バッジ ${r.badges.length} 個`);
      }
      return out.join("／");
    },
  },
  {
    // ⚠ **深掘りの導線は 1 か所**（hidetzu/konjaku#138）。
    //
    //   ⚠ **実測（2026-08-21・main = 8219774・豊洲・SW 無効）**
    //     根拠を開くと ⚠ **`#own` に 1 個・一覧に 1 個**。
    //     ⚠ 同時に目に入りはしない（開くと一覧は画面の上の外へ流れる）が、
    //     ⚠ **DOM には常に 2 つあり、⚠ 同じ判定で同じことを言っていた。**
    //   ⚠ 利用者役 4 名に画面だけを見せた: ⚠ **4/4 が一覧行を残すと答え、4/4 が根拠側を否定した。**
    //
    //   ⚠ **一覧行は残す。**⚠ 消すと、⚠ 「深掘りが無くなった」になる。
    name: "深掘りの導線が、根拠を開いても 1 か所のまま", path: "/", group: "core",
    async check(page) {
      const out = [];
      for (const [w, h] of [[1280, 800], [375, 667]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: w < 680, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await settleAfterCondition(p2);
          const look = () => p2.evaluate(() => ({
            own: document.querySelectorAll('#own a[href*="./peel"]').length,
            // ⚠ **2026-08-21 に、⚠ 導線が一覧から判定カードの中へ移った**
            card: document.querySelectorAll('#verdict a[href*="./peel"]').length,
            list: [...document.querySelectorAll('#list a[href*="./peel"], #list .it')]
              .filter((e) => /この場所を深掘り/.test(e.textContent ?? "")).length,
            cardY: (() => { const e = document.getElementById("peelCta");
              return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
          }));
          // ⚠ **初期は判定カードに 1 個だけ**
          const a = await look();
          must(a.card === 1, `${w}px: 判定カードの深掘りが ${a.card} 個（1 個のはず）`);
          must(a.list === 0, `${w}px: 一覧にも深掘りが ${a.list} 個ある（1 か所のはず）`);
          must(a.own === 0, `${w}px: 根拠パネルに深掘りの導線が ${a.own} 個ある`);
          must(a.cardY !== null, `${w}px: 判定カードの深掘りが見つからない`);
          // ⚠ **根拠を開いても増えない**
          await p2.click("#whyBtn");
          await p2.waitForSelector("#own .ev", { timeout: 30000 });
          await settleAfterCondition(p2);
          const b2 = await look();
          must(b2.own === 0,
            `${w}px: 根拠を開くと深掘りの導線が ${b2.own} 個に増える（1 か所のはず）`);
          must(b2.card === 1, `${w}px: 根拠を開いたら判定カードの導線が ${b2.card} 個になった`);
          must(b2.list === 0, `${w}px: 根拠を開いたら一覧にも導線が出た（${b2.list} 個）`);
          out.push(`${w}px 判定カード ${a.card}（y${a.cardY}）／一覧 ${a.list}／根拠 ${a.own}→${b2.own}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **同じ数字を、画面の 2 か所で言わない**（hidetzu/konjaku#130）。
    //
    //   ⚠ **実測（2026-08-20・main = 42784fa・豊洲・1280×800・SW 無効）**
    //     y376  区分を特定できた足元のうち 河川・湖沼・海面 510 / 543件（93.9%）
    //     y876  河川・湖沼・海面 510 / 543                    ⚠ **内訳**
    //     ⚠ **同じ数字・同じ区分名が、⚠ 500px 離れて 2 回。**
    //   ⚠ **内訳が正本**（2 位以下も出す）。
    //
    //   ⚠ **葉だけを拾う走査では数えられない。**⚠ 内訳の行は
    //     `<span class="nm"><i class="swatch">…</i>河川・湖沼・海面</span>` で、
    //     ⚠ **`.nm` に子がいるので葉にならない**（2026-08-20 に踏んだ）。
    //     ⚠ **「1 行に見える箱」を拾う**（改行を含まない innerText）。
    name: "同じ数字を、画面の 2 か所で言わない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        await p2.waitForFunction(() => /\/ \d+/.test(
          document.getElementById("breakdown")?.innerText ?? ""), null, { timeout: 60000 });
        const r = await p2.evaluate(() => {
          // ⚠ **「一番内側の箱」だけを数える。**
          //   ⚠ 内訳は section > rows > row と入れ子になっており、
          //     ⚠ **どれも「河川・湖沼・海面 510 / 543」を含む**。
          //     ⚠ 数えると 3 か所に見えるが、⚠ **画面では 1 か所**（2026-08-20 に踏んだ）。
          //   ⚠ **改行で切らない。**⚠ 内訳の行は flex で名前と数が離れており、
          //     ⚠ **innerText に改行が入る**（同上）。
          const has = (e, ...ws) => {
            const t = (e.innerText ?? "").replace(/\s+/g, " ");
            return ws.every((w) => t.includes(w));
          };
          const innermost = (...ws) => {
            const out = [];
            for (const e of document.querySelectorAll("body *")) {
              if (!e.checkVisibility?.() || !has(e, ...ws)) continue;
              // ⚠ 子孫にも同じものがあるなら、⚠ **この箱は入れ物にすぎない**
              if ([...e.querySelectorAll("*")].some((c) => c.checkVisibility?.() && has(c, ...ws))) continue;
              out.push([Math.round(e.getBoundingClientRect().top),
                (e.innerText ?? "").replace(/\s+/g, " ").trim()]);
            }
            return out;
          };
          const top = document.getElementById("breakdown")?.innerText
            ?.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? "";
          return {
            // ⚠ **内訳は作り替えた**（2026-08-22。Owner 判断）。
            //   ⚠ **前は「明治期の区分ごとの件数」**（⚠ 分母＝判定できた件数）。
            //   ⚠ **いまは「建物について何が分かっているか」**（⚠ 分母＝総数）で、
            //     ⚠ **明治期の区分の内訳は「昔はどんな土地？」が面積の分母で持つ。**
            //   ⚠ **主張は引き継ぐ**: ⚠ **区分名と数字の組は、⚠ 画面に 1 か所だけ。**
            //   ⚠ **消えた主題を見続けると、⚠ 何も見ていないのに緑になる**（掟）。
            pair: innermost("河川・湖沼・海面").map(([y, t]) => `y${y} ${t.slice(0, 44)}`),
            // ⚠ **建物の分母（総数）と、⚠ 面積の割合が、⚠ 同じ行に並んでいないこと**（掟 §6）
            // ⚠ **「同じ行」で見る**（2026-08-23）。⚠ **`innermost` は、⚠ 両方を含む最内を返すが、
            //   ⚠ 別々の層にあると `#landAll` のような入れ物が返る**（⚠ 実際に返った）。
            //   ⚠ **行の長さで絞る**（⚠ 80 字を超える箱は「行」ではない）。
            mixed: innermost("河川・湖沼・海面", "543")
              .filter(([, t]) => t.length <= 80).map(([y, t]) => `y${y} ${t.slice(0, 40)}`),
            breakdownTop: top,
            est: document.getElementById("notes")?.innerText?.replace(/\s+/g, " ").trim() ?? "",
            panelH: document.getElementById("panel")?.scrollHeight ?? 0,
          };
        });
        // ⚠ **区分名と件数の組は 1 か所だけ**
        must(r.pair.length === 1,
          `1 位の区分名と件数が ${r.pair.length} か所にある: ${r.pair.join(" ／ ")}`);
        // ⚠ **消した側の字が戻っていない**
        must(!r.pair.some((x) => /区分を特定できた足元のうち/.test(x)),
          `第3層の本文に「区分を特定できた足元のうち」が戻っている: ${r.pair.join(" ／ ")}`);
        // ⚠ **区分名は面積の分母で語る。**⚠ **建物の分母（543）と混ざっていないこと**（掟 §6）
        must(!r.mixed.length,
          `区分名が建物の分母と同じ行に並んでいる（分母が食い違う）: ${r.mixed.join(" ／ ")}`);
        // ⚠ **区分名は割合つきで出ている**（⚠ 消しただけにしない）
        must(r.pair.some((x) => /\d/.test(x)),
          `区分名が数字なしで出ている（内訳が受け皿になっていない）: ${r.pair.join(" ／ ")}`);
        // ⚠ **3D の帯は 1 行**（2026-08-21。hidetzu/konjaku#151。Owner 判断）。
        //   ⚠ 前は「建物が消える年代は演出です」＋分数 2 つだった。
        //   ⚠ **分数はパネルへ移した**（⚠ 消していない）。⚠ **言い方も「推定」へ統一。**
        must(/建物が消える年代は推定/.test(r.est),
          `3D の帯の断りが消えている: ${r.est.slice(0, 80)}`);
        must(!/\d/.test(r.est), `3D の帯に数字が残っている: ${r.est.slice(0, 80)}`);
        return `1 位の組 ${r.pair.length} か所（${r.pair[0]}）／内訳の頭「${r.breakdownTop}」`
          + `／板の中身 ${r.panelH}px`;
      } finally { await ctx.close(); }
    },
  },
];
