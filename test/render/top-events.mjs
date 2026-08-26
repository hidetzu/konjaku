// 実描画 — この範囲にあったもの（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 4 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **見出し 2 本ぶんを、⚠ まるごと連続で運んだ**（⚠ 途中で切っていない）:
//     この写真の範囲に、その時点までにできていたもの
//     寄ると、地図として本当に近づく
//
// ⚠ **ここが守っているもの**:
//     年で切る       ⚠ **開業年 ≤ 撮影年**だけ。⚠ **「その年のニュース」に化けさせない**
//     無くなったもの ⚠ **できたものと同じ顔で並べない**（⚠ 無くなった年を出す）
//     取れないとき   ⚠ **Wikidata が落ちても「無い」と言わない**
//     寄る           ⚠ **静止画を引き伸ばさず、⚠ 地図としてその縮尺のタイルを取りに行く**
//
// ⚠ **`寄ると、地図として本当に近づく` は、⚠ 揺れている 1 件**（hidetzu/konjaku#275）。
//   ⚠ **落ちたときに原因が読める形（層・`mapAwake`・枠の幅）も、⚠ 一緒に運んだ。**
//   ⚠ **手元では 0 / 50 で再現していない。**⚠ **次に落ちた 1 回で原因が確定する。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, rowsOf, waitVerdict, wdItem, WD_SHIBUYA, stubWikidata, photoFrames, waitStrip, LIES, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  // ---- この写真の範囲に、その時点までにできていたもの ----
  // ⚠ 言っているのは「開業年 ≤ 撮影年なら、撮影時に存在していた」だけ。
  //   ここが「その年のニュース」に化けると、konjaku が回避するために作られたものになる。
  {
    name: "写真の年より後にできたものを出さない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(11, "旧・○○倉庫", 1930, 1971, 139.7975, 35.6552),
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○タワー", 2006, null, 139.7986, 35.6541),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });

      const read = () => page.evaluate(() => ({
        head: document.querySelector(".ev-h")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        years: [...document.querySelectorAll(".ev-y")].map((e) => Number(e.textContent.trim())),
        note: document.querySelector(".ev-note")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        src: document.querySelector(".ev-src")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        pins: document.querySelectorAll("#pins .pin").length,
        year: document.getElementById("yrBig")?.textContent.trim() ?? "",
      }));

      await photoFrames(page).first().click();
      await settleAfterClick(page);
      const oldest = await read();
      // 1936–42 の写真のとき、1936年より後にできたものを並べていないこと
      const y0 = Number((oldest.year.match(/(\d{4})/) ?? [])[1]);
      must(Number.isFinite(y0), `年代が読めない: ${oldest.year}`);
      must(oldest.years.every((y) => y <= y0),
        `写真(${y0}年)より後のものを出している: ${oldest.years.filter((y) => y > y0).join(",")}`);
      if (oldest.years.length) {
        must(/出典|Wikidata/.test(oldest.src), "出典が書かれていない");
        must(/写っている/.test(oldest.src) === false || /確かめていません/.test(oldest.src),
          `「写っている」と断定している: ${oldest.src}`);
      } else {
        must(oldest.note.length > 0, "0件のときに何も言っていない");
      }

      // ⚠ 「その時点で無くなっていたもの」は出さない。
      //   実測で、渋谷城（16世紀に廃城）・並木橋駅（1945年廃止）・東急百貨店東横店（2020年解体）を
      //   「いまこの範囲にあるもの」に出していた。「開業年 ≤ 撮影年なら存在していた」は
      //   過去にしか効かない含意で、現在について言うには使えない。
      await page.locator("#strip .f").last().click();
      await settleAfterClick(page);
      const now = await read();
      // 選んだ年に近いものから並ぶこと（古い順に切ると、密な土地では帯を動かしても中身が変わらない）
      const desc = now.years.every((y, i, a) => i === 0 || a[i - 1] >= y);
      must(desc, `選んだ年に近い順に並んでいない: ${now.years.join(",")}`);
      // ⚠ 一覧に出したものには、必ず印がある。
      //   写真は 2×2 の正方形で枠は 4:3。上下が隠れているだけのものを打たないでいると、
      //   一覧にあるのに押しても何も起きない行になる（実測: 亀戸「1925 江東区立水神小学校」）
      must(now.pins === now.years.length,
        `一覧と印の数が違う: 一覧 ${now.years.length} / 印 ${now.pins}`);

      // 押すと写真の位置へ寄り、戻せること（寄ったまま戻れない、を作らない）
      if (now.years.length) {
        // ⚠ **どの行を押しても**効くこと。枠の外にあるものは真ん中へ寄せてから拡大する。
        //   以前は枠の外なら黙って return していて、押せない行が混ざっていた。
        const rows = await page.locator(".ev-it").count();
        for (const i of [0, rows - 1]) {
          await page.locator(".ev-it").nth(i).click();
          // ⚠ 固定待ちにしない。寄せるのは地図に一本化したので、初回は地図の読み込みを挟む。
          //   手元では即座に終わるが、CI では 500ms では足りず、ここだけが落ちた。
          await page.waitForFunction(() => document.querySelector("#big.zoom"),
            null, { timeout: 60000 }).catch(() => {});
          must(await page.locator("#big.zoom").count() === 1,
            `${i + 1}行目を押しても写真が寄らない（全${rows}行）`);
          const zoomed = await page.evaluate(() => ({
            tf: document.getElementById("bigIn")?.style.transform ?? "",
            map: !!document.querySelector("#big.map-on") }));
          must(/scale\(/.test(zoomed.tf) || zoomed.map,
            `寄っていない（写真も地図も動いていない）: ${JSON.stringify(zoomed)}`);
          await page.click("#unzoom");
          await page.waitForTimeout(300);
        }
        await page.locator(".ev-it").first().click();
        await page.waitForFunction(() => document.querySelector("#big.zoom"),
          null, { timeout: 60000 }).catch(() => {});
        must(await page.locator("#big.zoom").count() === 1, "押しても写真が寄らない");
        must(await page.locator("#unzoom").isVisible(), "寄ったあとに戻す手段が出ていない");
        await page.click("#unzoom");
        await page.waitForFunction(() => !document.querySelector("#big.zoom"),
          null, { timeout: 20000 }).catch(() => {});
        must(await page.locator("#big.zoom").count() === 0, "戻すを押しても寄ったまま");
      }
      return `1936年まで ${oldest.years.length} 件（${oldest.years.slice(0, 3).join(",")}）`
        + ` → 現在 ${now.years.length} 件／印 ${now.pins}／寄って戻せる`;
    },
  },
  {
    // Wikidata は止まりうる依存（掟: 外部APIは「止まりうる依存」として扱う）。落ちたときに「無い」と言わないこと
    name: "Wikidata が落ちても「無い」と言わない", path: `/?${TOYOSU}`,
    // ⚠ 取り込み済みの索引も外す。静的で答えられてしまうと、落ちた場合を見られない
    setup: (page) => Promise.all([
      page.route("**/data/ev/**", (r) => r.fulfill({ status: 404, body: "" })),
      page.route("**://query.wikidata.org/**", (r) => r.abort()),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      await page.waitForSelector(".ev-note.warn", { timeout: 40000 });
      const note = (await page.locator(".ev-note.warn").textContent()).replace(/\s+/g, " ").trim();
      for (const w of LIES) must(!note.includes(w), `断定している: 「${w}」`);
      must(/読み込めませんでした/.test(note), `読み込めなかったことを言っていない: ${note}`);
      must(/分かっていません/.test(note), `「無い」と読める書き方になっている: ${note}`);
      must(await page.locator("#evRetry").count() === 1, "再試行が出ていない");
      // 判定そのものは、Wikidata が落ちても成立していること
      const v = await page.locator("#verdict").textContent();
      must(/旧水部|盛土地/.test(v), `判定まで巻き添えになっている: ${v.slice(0, 60)}`);
      must(await page.locator("#big .lyr.on .t").count() === 4, "写真まで出なくなっている");
      return `「${note.slice(0, 46)}…」／再試行あり／判定と写真は無事`;
    },
  },
  // ---- 寄ると、地図として本当に近づく ----
  // ⚠ 静止した写真を拡大するだけでは、寄っても何も見えない（z16 を引き伸ばすだけ）。
  //   寄せるのは地図に一本化した。地図なら、その縮尺のタイルを取りに行くので実際に近づける。
  //   枠の端にあるものも中心に置けるので、押しても見えない行が生まれない。
  {
    name: "寄ると、地図として本当に近づく", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○タワー", 2001, null, 139.7986, 35.6541),   // 現在の差分に入るもの
    ]),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      await page.locator("#strip .f").last().click();
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 30000 }).catch(() => {});
      must(await page.locator(".ev-it").count() > 0, "一覧が出ていない");

      const deepU = () => reqs.filter((u) =>
        /cyberjapandata\.gsi\.go\.jp\/xyz\/\w+\/(1[7-9])\//.test(u));
      const deep = () => deepU().length;
      // ⚠ **落ちたときに、⚠ 何が起きていたかまで出す**（2026-08-26。hidetzu/konjaku#275）。
      //   ⚠ **この 1 行は 2 回落ちている**（2026-08-24 と 2026-08-25。⚠ どちらも 12 件）。
      //   ⚠ **どちらも「12 件」しか残っておらず、⚠ 原因を追えなかった。**
      //   ⚠ **実測（2026-08-26・`main` = `720ef48`）: ⚠ 手元では 50 回回して 1 度も落ちない**
      //     （⚠ 単独 30 ／ まとめて 3 ／ 実描画 3 本を同時に走らせながら 17）。
      //     ⚠ **50 回とも出力が 1 文字も同じ。**⚠ **再現しないものは、⚠ 推測で直せない。**
      //   ⚠ **だから、⚠ 次に落ちたときに原因が確定するようにしておく。**
      //     ⚠ **どの層を・どのズームで取りに行ったか**（⚠ 地図なのか写真なのか）
      //     ⚠ **地図が起きていたか**（⚠ `#map canvas` の有無）
      //     ⚠ **枠がどれだけ広かったか**（⚠ `mapZoomForBox()` は枠幅から決まる）
      if (deep() > 0) {
        const st = await page.evaluate(() => {
          const b = document.getElementById("big")?.getBoundingClientRect();
          return { bigW: b ? Math.round(b.width) : null, bigH: b ? Math.round(b.height) : null,
                   mapAwake: !!document.querySelector("#map canvas"),
                   evIt: document.querySelectorAll(".ev-it").length };
        }).catch((e) => ({ 画面を読めない: String(e).slice(0, 60) }));
        const layers = [...new Set(deepU().map((u) =>
          (/xyz\/(\w+)\/(\d+)\//.exec(u) ?? []).slice(1, 3).join(" z")))];
        must(false, `寄る前から高いズームのタイルを取っている: ${deep()} 件`
          + ` ／ 層 ${layers.join("・")} ／ 画面 ${JSON.stringify(st)}`
          + ` ／ 全 ${reqs.length} 本 ／ 例 ${deepU()[0]}`);
      }

      await page.locator(".ev-it").first().click();
      await page.waitForFunction(() => document.querySelector("#big.map-on")
        || document.querySelector("#big.map-loading"), null, { timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      // ⚠ 固定待ちにしない。タイルの取得は回線しだいで、CI では間に合わないことがある。
      //   以前ここに `waitForFunction(() => true)` があったが、これは即座に真になる
      //   **待っているふりの no-op** だった（2026-08-14 検証者の指摘）。下の繰り返しが本体。
      for (let i = 0; i < 40 && deep() === 0; i++) await page.waitForTimeout(500);
      must(deep() > 0, `寄っても高いズームのタイルを取りに行っていない: ${deep()} 件`);

      // 押したものが画面の中心近くに来ていること（端に貼り付いたままにしない）
      const off = await page.evaluate(() => {
        const b = document.getElementById("big").getBoundingClientRect();
        const p = document.querySelector("#map .pin");
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { dx: Math.abs((r.x + r.width / 2) - (b.x + b.width / 2)),
                 dy: Math.abs((r.y + r.height / 2) - (b.y + b.height / 2)), w: Math.round(b.width) };
      });
      must(off && off.dx < off.w * 0.25 && off.dy < off.w * 0.25,
        `押したものが中心に来ていない: ${JSON.stringify(off)}`);

      await page.click("#unzoom");
      await page.waitForFunction(() => !document.querySelector("#big.zoom"),
        null, { timeout: 20000 }).catch(() => {});
      must(await page.locator("#big.zoom").count() === 0, "全体に戻せない");
      return `寄る前 0 件 → 寄ると高ズーム ${deep()} 件／中心からのずれ ${Math.round(off.dx)}px`;
    },
  },
  {
    // ⚠ 実測で見つけた誤り。渋谷は「無くなったもの」が多く、ここが崩れると必ず出る
    name: "無くなったものを「ある」と言わない／年代で中身が変わる", path: "/?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7",
    setup: (page) => stubWikidata(page, WD_SHIBUYA(139.70160, 35.65860)),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rowsOf = () => page.$$eval(".ev-row", (els) => els.map((e) => ({
        label: e.querySelector(".ev-l")?.textContent.trim() ?? "",
        gone: e.classList.contains("gone"),
        year: e.querySelector(".ev-y")?.textContent.trim() ?? "",
        src: !!e.querySelector(".ev-u") })));

      await page.locator("#strip .f").last().click();      // 現在（1987–90 → いま）
      // ⚠ 固定待ちにしない。混んでいるときだけ落ちる検査は、いずれ無視される
      //   （正しい実装でも3ケースすべて失敗することを確認済み）
      await page.waitForFunction(() => document.querySelectorAll(".ev-row").length > 0,
        null, { timeout: 20000 }).catch(() => {});
      const now = await rowsOf();
      const label = (t) => now.find((r) => r.label === t);
      // ⚠ 無くなったものを、できたものと同じ顔で並べない。
      //   2020年に解体された東横店は「この間に無くなった」であって「いまある」ではない
      must(label("東急百貨店東横店")?.gone === true,
        `解体されたものが「無くなった」になっていない: ${JSON.stringify(now)}`);
      must(label("東急百貨店東横店")?.year === "2020",
        "無くなったものに、無くなった年が出ていない");
      // この期間の外で消えたものは、そもそも出てこない
      must(!label("渋谷城") && !label("並木橋駅"),
        `期間の外のものが混ざっている: ${now.map((r) => r.label).join("・")}`);
      must(label("セルリアンタワー") && !label("セルリアンタワー").gone,
        "この期間にできたものが出ていない");
      // ⚠ 出典は項目ごとに出す。source_url を必須にしておきながら、画面に出していなかった
      must(now.every((r) => r.src), `出典リンクの無い行がある: ${
        now.filter((r) => !r.src).map((r) => r.label).join("・")}`);

      // 一方、その年代には在ったものは、過去の年代でちゃんと出ること
      await photoFrames(page).first().click();              // 1936–42
      await settleAfterClick(page);
      const old1936 = await page.$$eval(".ev-it .ev-l", (els) => els.map((e) => e.textContent.trim()));
      // 1936年には在った（1885 渋谷駅 / 1927 並木橋駅 / 1934 東横店）。1092 渋谷城は 1524 で消えている
      must(old1936.includes("並木橋駅") && old1936.includes("東急百貨店東横店"),
        `その年代に在ったものを消しすぎ: ${old1936.join("・")}`);
      must(!old1936.includes("渋谷城"), "1524年に無くなったものを 1936年に出している");
      must(old1936[0] === "東急百貨店東横店", `並び順が違う: ${old1936.join("・")}`);
      // 「(看板)」は写真では確かめようがない。出さない
      must(!old1936.some((t) => /看板/.test(t)), `看板が混ざっている: ${old1936.join("・")}`);

      // ⚠ 年代を動かすと、中身が入れ替わること（目録なら8段すべて同じになる）
      await photoFrames(page).nth(1).click();               // 1936–42 → 1945–50
      await settleAfterClick(page);
      const mid = await rowsOf();
      must(mid.some((r) => r.label === "並木橋駅" && r.gone),
        `1945年に廃止された駅が「無くなった」として出ていない: ${JSON.stringify(mid)}`);
      must(JSON.stringify(mid.map((r) => r.label)) !== JSON.stringify(old1936),
        "年代を動かしても一覧が変わらない（差分になっていない）");
      const head = (await page.locator(".ev-h").textContent()).replace(/\s+/g, " ").trim();
      must(/→/.test(head), `いつからいつまでの話か書かれていない: ${head}`);
      return `現在 ${now.map((r) => r.label + (r.gone ? "(無)" : "")).join("・")}`
        + `／1936年 ${old1936.join("・")}／1945–50 ${mid.map((r) => r.label).join("・")}`;
    },
  },
];
