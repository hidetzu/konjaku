// 実描画 — 明治期の「面」（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 35 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件を、⚠ 直上のコメントごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **2 件は対で見る**（⚠ **だから割らない**）:
//     出せるとき   ⚠ **取得の層から、⚠ 同じ答えで返る**（hidetzu/konjaku#126）
//     出せないとき ⚠ **「読めなかった」と「範囲外」を取り違えない**
//
// ⚠ **前者は「仕組みだけの変更」を見張っている。**
//   ⚠ **見え方も、⚠ 外への要求も、⚠ 1 つも変わってはいけない**という形の検査。
// ⚠ **後者は `CLAUDE.md` §1 そのもの。**
//   ⚠ **取得できなかった ≠ 存在しなかった。**⚠ **403 を「整備対象外」と言わない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  BASE, TOYOSU, SAPPORO, LIES, SWALE_ROUTE,
  settleAfterCondition, openPanel, forbid, must
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **明治期の「面」を画面から外しても、答えも本数も変わらない**（hidetzu/konjaku#126）。
    //
    //   ⚠ **これは仕組みだけの変更。**⚠ **見え方も、外への要求も、1 つも変わってはいけない。**
    //   ⚠ **Service Worker を止める。**⚠ 止めないとキャッシュから返り、本数が嘘になる。
    //   ⚠ **buildWater を直接呼んで、返り値そのものを見る**（画面の字だけでは、
    //     集計が変わっていても気づけない。⚠ 割合は丸めて出しているので、下の桁が動いても同じ字になる）。
    name: "明治期の面が、取得の層から同じ答えで返る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        let tiles = 0;
        ctx.on("request", (r) => { if (/\/xyz\/swale\//.test(r.url())) tiles++; });
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await p2.waitForTimeout(9000);
        const before = tiles;
        // ⚠ **画面が持っていないこと。**⚠ 取得の層と控える層を通っていること
        const wiring = await p2.evaluate(() => ({
          hasSwaleArea: typeof Konjaku?.swaleArea === "function",
          hasSwalePixel: typeof Konjaku?.swalePixel === "function",
          hasMeijiArea: typeof KonjakuLand?.meijiArea === "function",
          hasTileCache: typeof tileCache !== "undefined",
          hasGetTile: typeof getTile !== "undefined",
        }));
        must(wiring.hasSwaleArea, "Konjaku.swaleArea が無い（取得の層が面を持っていない）");
        must(wiring.hasSwalePixel, "Konjaku.swalePixel が無い（点が読めない）");
        must(wiring.hasMeijiArea, "KonjakuLand.meijiArea が無い（控える層を通っていない）");
        must(!wiring.hasTileCache, "peel3d.js に tileCache が残っている（3 つめのキャッシュ）");
        must(!wiring.hasGetTile, "peel3d.js に getTile が残っている（取得の層の仕事）");
        // ⚠ **返り値そのものを見る**
        const a = await p2.evaluate(async () => {
          const b = map.getBounds();
          const w = await buildWater({ w: b.getWest(), e: b.getEast(),
            n: b.getNorth(), s: b.getSouth() });
          return { rects: w.rects, ratio: w.ratio, tiles: w.tiles,
            classified: w.classifiedPixels, transparent: w.transparentPixels,
            unknown: w.unknownPixels,
            counts: Object.entries(w.classCounts).filter(([, n]) => n > 0).length };
        });
        must(a.tiles.ok > 0, `1 枚も読めていない（tiles=${JSON.stringify(a.tiles)}）`);
        must(a.rects > 0, `水の面が 0 個（${a.rects}）`);
        must(a.counts > 0, "区分の内訳が空（集計が落ちている）");
        must(a.classified > 0, "分類できた画素が 0（画素を読んでいない）");
        // ⚠ **もう一度呼んでも、外へ取りに行かない。**
        //   ⚠ **効いているのは取得の層のタイル束**（verify.js の swaleTiles）。
        //   ⚠ **控える層の inflight は、ここでは測れない**（通信は増えないので同じ顔になる）。
        //     ⚠ そちらは静的の単体テストが見ている（「同時の 2 回が N 本」）。
        //     ⚠ 実際にわざと外したら、⚠ **実描画は緑のまま・静的だけが落ちた。**
        const mid = tiles;
        await p2.evaluate(async () => { const b = map.getBounds();
          await buildWater({ w: b.getWest(), e: b.getEast(), n: b.getNorth(), s: b.getSouth() }); });
        await settleAfterCondition(p2);
        must(tiles === mid, `2 回目で外へ取りに行っている（${tiles - mid} 本増えた）`);
        return `タイル ${before} 本／面 ${a.rects} 個／割合 ${a.ratio.toFixed(6)}`
          + `／区分 ${a.counts} 種／${JSON.stringify(a.tiles)}／2 回目はタイル束から 0 本`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **断り文が、取り違わっていないこと**（hidetzu/konjaku#126）。
    //   ⚠ **これが掟の一行目そのもの。**⚠ 読めなかったのか、本当に範囲外なのか。
    //   ⚠ **集計を外へ出したときに、⚠ tiles{ok,absent,unreachable} の分け方が
    //     1 つでもずれると、ここが入れ替わる。**
    name: "明治期の面が出せないとき、読めないのと範囲外を取り違えない", path: "/", group: "core",
    // ⚠ **狭い幅は、⚠ 小さい状態で始まる。**⚠ **答えと断りは畳まれている**（2026-08-23）。
    //   ⚠ **押しても開かないことがある**（⚠ 読み込みの途中で的が入れ替わる）。⚠ **開くまで待つ。**
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        // (1) ⚠ **全部 403** → 読めなかった。⚠ **範囲外と言ってはいけない**
        const p2 = await ctx.newPage();
        await forbid(p2, SWALE_ROUTE);
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ **狭い幅では、⚠ 小さいあいだ 3 つの問いを畳む**（2026-08-23。Owner 判断）。
        //   ⚠ **断りは `#landAll` の中にある**ので、⚠ **広げてから読む。**
        //   ⚠ **主張は変えていない**（⚠ 403 と範囲外を取り違えないこと）。⚠ **読む場所だけ移した。**
        await openPanel(p2);
        await p2.waitForFunction(() => /読み込めませんでした|整備対象外/.test(document.body.innerText ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        const t1 = await p2.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
        must(/明治期の低湿地データを[^。]*いま読み込めませんでした/.test(t1),
          `403 なのに「読み込めませんでした」と言っていない: ${t1.slice(0, 120)}`);
        must(!/整備対象外/.test(t1), `403 を「整備対象外」と言っている（掟の一行目）: ${t1.slice(0, 120)}`);
        for (const w of LIES) must(!t1.includes(w), `403 なのに「${w}」と断定している`);
        await p2.close();

        // (2) ⚠ **本当に範囲外（札幌）** → 整備対象外。⚠ **読めなかったと言ってはいけない**
        const p3 = await ctx.newPage();
        await p3.goto(`${BASE}/peel?${SAPPORO}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await openPanel(p3);
        await p3.waitForFunction(() => /整備対象外|読み込めませんでした/.test(document.body.innerText ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p3);
        const t2 = await p3.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
        must(/整備対象外/.test(t2), `範囲外なのに「整備対象外」と言っていない: ${t2.slice(0, 120)}`);
        must(!/明治期の低湿地データを[^。]*読み込めませんでした/.test(t2),
          `範囲外を「読み込めませんでした」と言っている: ${t2.slice(0, 120)}`);
        await p3.close();
        return "403 は「読み込めませんでした」／札幌は「整備対象外」／取り違えなし";
      } finally { await ctx.close(); }
    },
  },
];
