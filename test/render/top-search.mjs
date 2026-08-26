// 実描画 — 場所を探す（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 9 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **2 つの連続した塊を集めた**ので、⚠ **並びは動く**（⚠ 後ろの 2 件が前へ来る）。
//   ⚠ **回る件数と判定の字は変わらない**（⚠ 並べ替えて突き合わせた）。
//
// ⚠ **ここが守っているもの**:
//     選ぶ／選ばない ⚠ **確度が高いときだけ先頭を選ぶ。**⚠ **低いとき・同名のときは選ばない**
//     取れないとき   ⚠ **検索が失敗しても「無い」と言わない**（⚠ 空配列だけが「見つかりません」）
//     指で押す       ⚠ **候補が 44px に届く。**⚠ **タッチ端末にキーヒントを出さない**（⚠ 候補が隠れる）
//     戻らない       ⚠ **別の語へ変えたら前の語の候補が出ない。**
//                    ⚠ **入力を消したら、⚠ 遅れて返った候補が復活しない**
//
// ⚠ **`dep:"search"` が付く**（⚠ 地理院の住所検索の応答に寄りかかる）。
//   ⚠ **`--group=search` で切り分けられる**（⚠ 落ちても外部のせいかを分けられる）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, waitVerdict, must } from "./lib.mjs";

export const CASES = [
  {
    name: "検索（確度が高いので先頭を選ぶ）", dep: "search", path: "/",
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const rows = await page.$$eval("#list .it", (els) => els.map((e) => ({
        t: e.querySelector("b").textContent,
        sub: e.querySelector("small")?.textContent ?? "",
        sel: e.classList.contains("sel"),
      })));
      must(rows[0].t === "東京都渋谷区", `先頭が渋谷区でない: ${rows[0].t}`);
      must(rows[0].sel, "確度が高いのに何も選ばれていない");
      // 副題は緯度経度をやめて、数えた事実にした
      must(!/\d+\.\d{4}, ?\d+\.\d{4}/.test(rows[0].sub), `副題が緯度経度のまま: ${rows[0].sub}`);
      must(/\d+件/.test(rows[0].sub), `副題に数えた事実が無い: ${rows[0].sub}`);
      // キーヒントは一覧と一緒に画面内にいること（以前は y=890 で常に画面外だった）
      const k = await page.$eval(".kbd", (e) => {
        const r = e.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), h: window.innerHeight,
                 txt: e.textContent.replace(/\s+/g, " ").trim() };
      });
      must(k.bottom <= k.h, `キーヒントが画面外: bottom=${k.bottom} / 画面=${k.h}`);
      must(k.txt.includes("東京都渋谷区を調べる"), `Enter に行き先が入っていない: ${k.txt}`);
      must(k.txt.includes("入力を消す"), `Esc の文言が実際の挙動と違う: ${k.txt}`);
      // 利用者役のエージェントによる検証で3回とも別の土地に着いた語。Enter だけで着けること
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.getElementById("chipName")?.textContent === "東京都渋谷区",
        null, { timeout: 20000 });
      return `先頭 ${rows[0].t}／副題「${rows[0].sub}」／Enter で着地`;
    },
  },
  {
    name: "検索（確度が低いので選ばない）", dep: "search", path: "/",
    async check(page) {
      // ⚠ **効かないキーの説明を、打つ前に出さない。**
      //   実測（2026-08-17 / 1280×800 / 地名を打つ前）: ↑↓・Enter・Esc が 3 つとも
      //   薄字（＝いま使えません）のまま 37px 出ていて、検索欄のすぐ下を占めていた。
      //   ⚠ ここは**キーが効く端末**（既定の 1200×780）。375px で見ると
      //     @media (hover:none) が丸ごと隠すので、何も見ずに緑になる。
      const kbdVis = () => page.evaluate(() => {
        const e = document.querySelector("#listbox .kbd");
        if (!e) return null;
        return { vis: e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
          h: Math.round(e.getBoundingClientRect().height) };
      });
      const kbd0 = await kbdVis();
      must(kbd0, "キーヒントの要素が無い（この検査が何も見ていない）");
      must(!kbd0.vis,
        `地名を打つ前からキーヒントが出ている（高さ ${kbd0.h}px・どのキーもまだ効かない）`);
      // 梅田は足立区と大阪市北区がどちらも「区の町字」で並び、応答からは決められない
      await page.fill("#q", "梅田");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const selected = () => page.$$eval("#list .it", (e) => e.findIndex((x) => x.classList.contains("sel")));
      must((await selected()) < 0, "確度が低いのに先頭が選ばれている");
      // ⚠ マウスが一覧の上を通っただけで Enter が武装してはいけない
      await page.hover("#list .it:nth-child(4)");
      must((await selected()) < 0, "hover だけで選択が動いた（Enter が武装する）");
      const off = await page.$eval("#kEnter", (e) => e.classList.contains("off"));
      must(off, "選んでいないのに Enter が薄字になっていない");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      must(!(await page.evaluate(() => location.search)), "選んでいないのに Enter で場所が決まった");
      // ↑↓ を押して初めて武装する
      await page.keyboard.press("ArrowDown");
      must((await selected()) === 0, "↑↓ で先頭が選ばれない");
      const txt = await page.$eval("#kEnter", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/を調べる$/.test(txt), `Enter に行き先が入っていない: ${txt}`);
      // ⚠ **隠しただけで緑にしない。** 候補が出てキーが効くようになったら、必ず出ること。
      //   片側（打つ前は出ない）だけ見ていると、丸ごと消しても通ってしまう。
      const kbd1 = await kbdVis();
      must(kbd1.vis, "候補が出てキーが効くのに、キーヒントが出ない（丸ごと消えている）");
      return `未選択のまま／hover でも武装せず／↓ 後に「${txt}」`
        + `／キーヒントは打つ前 非表示 → 候補あり ${kbd1.h}px`;
    },
  },
  {
    // ⚠ 区名と町字が同じ語で競合する組。並べ替えは「区名が上」で決めるが、それは
    // 順番の規則であって確からしさの証拠ではない。ここで選んでしまうと、
    // 掟: 取れなかったを「無い」と言わない で狙いに定めた埋立地（港区港南＝品川駅東）から確信を持って離れる。
    name: "検索（同名の土地では選ばない）", dep: "search", path: "/",
    async check(page) {
      await page.fill("#q", "港南");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const rows = await page.$$eval("#list .it", (els) => els.map((e) => ({
        t: e.querySelector("b").textContent, sel: e.classList.contains("sel") })));
      const sel = rows.findIndex((r) => r.sel);
      must(sel < 0, `決められない語なのに ${rows[sel]?.t} が選ばれている`);
      const at = rows.findIndex((r) => r.t.startsWith("東京都港区港南"));
      must(at >= 0 && at < 3, `港区港南が上位3件に無い（${at + 1}位）`);
      // Enter は空振りすること（別の土地へ飛ばない）
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      must(!(await page.evaluate(() => location.search)), "選んでいないのに Enter で場所が決まった");
      return `未選択／港区港南は ${at + 1}位／Enter は空振り`;
    },
  },
  {
    // ⚠ 検索経路の「取れなかった」を「無かった」と言い換えない（掟: 取れなかったを「無い」と言わない の検索側の残り）。
    // res.ok を見ずに .json() し、配列の長さだけで判定していたため、
    // HTTP 500 も、配列でない 200 も「見つかりませんでした」に化けていた。
    name: "検索が失敗したとき「無い」と言わない", dep: "search", path: "/",
    async check(page) {
      const API = "**/AddressSearch*";
      const failed = async (label) => {
        await page.fill("#q", "豊洲");
        await page.waitForSelector("#list .note.warn", { timeout: 20000 });
        const t = (await page.locator("#list .note.warn").textContent()).replace(/\s+/g, " ").trim();
        must(!t.includes("見つかりませんでした"), `${label}: 取れなかったのに「見つかりませんでした」`);
        must(/取れませんでした/.test(t), `${label}: 取れなかったことが書かれていない: ${t}`);
        must(await page.locator("#searchRetry").count() === 1, `${label}: 再試行の手段が出ていない`);
        await page.fill("#q", "");
        return t;
      };
      // ① HTTP 500 ＋ JSON 本文
      await page.route(API, (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
      const a = await failed("HTTP 500");
      // ② 200 だが配列でない
      await page.unroute(API);
      await page.route(API, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"error":"x"}' }));
      const b = await failed("配列でない 200");
      // ③ 無応答。8秒のタイムアウトで確定すること（以前は永久に「検索中…」だった）
      await page.unroute(API);
      await page.route(API, () => { /* 握りつぶす＝無応答 */ });
      const t0 = Date.now();
      const c = await failed("無応答");
      const wall = Date.now() - t0;
      must(wall < 14000, `無応答が確定するまで ${wall}ms（8秒のタイムアウトが効いていない）`);
      // ④ 直れば再試行で候補が出る。失敗を覚えていると、ここで永久に直らない
      await page.unroute(API);
      await page.fill("#q", "豊洲");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const top = await page.locator("#list .it b").first().textContent();
      must(top === "東京都江東区豊洲", `復帰後の先頭が違う: ${top}`);
      // 空配列は「無かった」と言ってよい唯一の場合
      await page.route(API, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
      await page.fill("#q", "ありえない地名");
      await page.waitForFunction(
        () => /見つかりませんでした/.test(document.getElementById("list")?.textContent ?? ""),
        null, { timeout: 20000 });
      return `500「${a.slice(0, 20)}…」／配列でない200 ✓／無応答 ${wall}ms で確定／復帰 ${top}／空配列だけ「見つかりませんでした」`;
    },
  },
  {
    name: "タップ判定（スマホ幅）", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 720 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      // ⚠ computed style の足し算では駄目。以前は ::after を親からはみ出させて 44×44 を
      // 「計算上」作っていたが、実物は .scope の overflow:hidden で下端が切られ、
      // 右端は後から重なる #q が先に拾って、実際に押せるのは 42×42 だった。
      // ここでは **その座標を押したとき目的の要素に届くか** を elementFromPoint で見る。
      // ⚠ **突く前に、画面の中へ入れる**（2026-08-20。hidetzu/konjaku#122）。
      //   ⚠ elementFromPoint は**画面の外を見ない**ので、初期画面から出ているだけで
      //     ⚠ **「なし」が返り、重なりがあるように見える。**
      //   ⚠ ここが見たいのは**重なり**であって、画面内かどうかではない
      //     （画面内かどうかは「重ねる操作が、写真と一緒に初期画面に見える」が見ている）。
      //   ⚠ 実測（375×720）: 答えを画面の先頭へ動かしたぶん、
      //     ⚠ **「なぜそう言える？」の下端が 710 → 725 になり、5px 切れた。**
      const reach = (sel) => page.$eval(sel, (e, size) => {
        e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = size / 2 - 1;
        const pts = [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h], [0, -h], [0, h], [-h, 0], [h, 0]];
        const miss = [];
        for (const [dx, dy] of pts) {
          const x = Math.round(cx + dx), y = Math.round(cy + dy);
          const at = document.elementFromPoint(x, y);
          if (!at || !(at === e || e.contains(at))) miss.push(`(${dx},${dy})→${at?.id || at?.tagName || "なし"}`);
        }
        return miss;
      }, 44);
      // 共有ボタンが増えたので、判定カード内の丸ボタンは複数ある。指で押せる大きさは全部見る
      for (const [name, sel] of [["?", "#whyBtn"], ["共有", "#shareBtn"], ["✕", "#chipX"]]) {
        const miss = await reach(sel);
        must(!miss.length, `${name} の 44×44 の中で他の要素に取られる点がある: ${miss.join(" ")}`);
      }
      // 押して本当に反応するかまで見る（描画上は届いていても無効化されていることがある）
      await page.locator("#whyBtn").click({ position: { x: 4, y: 40 } });
      must(await page.$eval("#whyBtn", (e) => e.getAttribute("aria-expanded")) === "true",
        "44px の隅を押しても ? が開かない");
      const rows = await page.$$eval("#list .it", (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)));
      const min = Math.min(...rows);
      must(min >= 44, `候補の高さが ${min}px（44px 未満の行がある）`);
      // タッチ端末では物理キーが無い。使えない説明で候補を隠さない
      must(await page.locator(".kbd").count() === 0 || !(await page.locator(".kbd").isVisible()),
        "タッチ端末なのにキーヒントが出ている（候補が隠れる）");
      return `? と 共有 と ✕ が実測で 44×44 に届く／隅を押して開く／候補の最小高 ${min}px／キーヒントは非表示`;
    },
  },
  // ---- 検索候補が、古い語や消した語で戻らないこと ----
  // ⚠ **ここにあった見出しは `建物を取り込み済みの土地では、外へ出ない` だった**
  //   （2026-08-26。hidetzu/konjaku#277 の 6 本目で直した）。
  //   ⚠ **z14 タイルの集計範囲の話**で、⚠ **下に並んでいた 9 件のどれとも合っていなかった。**
  //   ⚠ **私が触る前からずれていた**（⚠ 履歴で確認）。⚠ hidetzu/konjaku#232 が予告していた
  //   ⚠ 「名前と中身が合っていない塊」。⚠ **7 件は `top-next.mjs` へ出し、⚠ 残るこの 2 件に名前を付け直す。**
  ...[["トップ", "/", "#list", false]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 別の語へ変えたら、前の語の候補が出ない`, dep: "search", path,
    // ⚠ 「渋谷」だけ遅らせる。実際の地理院には出ない
    setup: (page) => page.route("**/AddressSearch*", async (r) => {
      const q = decodeURIComponent(new URL(r.request().url()).searchParams.get("q") ?? "");
      if (q === "渋谷") await new Promise((x) => setTimeout(x, 2000));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ properties: { title: q === "渋谷" ? "東京都渋谷区" : "東京都新宿区" },
                                geometry: { coordinates: [139.7, 35.66] } }]) });
    }),
    async check(page) {
      if (needOpen) { await page.click("#findLabel"); await page.waitForTimeout(300); }
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(2150);         // 古い応答が届く直前
      await page.fill("#q", "新宿");
      await page.waitForTimeout(250);          // ⚠ 新しい検索はまだ始まっていない
      const mid = (await page.locator(listSel).innerText().catch(() => "")).trim();
      must(await page.inputValue("#q") === "新宿", "入力欄が「新宿」になっていない");
      must(!/渋谷/.test(mid),
        `別の語へ変えたのに、前の語の候補が出ている: ${JSON.stringify(mid.slice(0, 40))}`
        + `（押すと違う場所へ飛ぶ）`);
      // 新しい語の候補は、そのあとちゃんと出る
      await page.waitForFunction(() => /新宿/.test(document.body.innerText), null, { timeout: 20000 });
      return `切替中は ${JSON.stringify(mid.slice(0, 14))} ／ そのあと新宿が出る`;
    },
  })),
  // ⚠ **入力を消したのに、遅れて返った候補が復活しない。**
  //   2026-08-15 に**両画面で再現させた**: 検索中に入力を空にすると、
  //   空の入力欄のまま候補が並んだ。原因は「2文字未満で return するとき、
  //   検索の世代を進めていなかった」こと。**同じ実装が2つあったので、両方に同じ穴があった。**
  //   いまは places.js の createSearch().cancel() を両画面が呼ぶ。
  //   ⚠ 応答を遅らせて作る。実際の地理院には出ない。
  // ⚠ 3D の側は 2026-08-18 に外した（あちらから検索そのものを外したため）。
  //   ⚠ **組の形は残す。** 検索を持つ画面が増えたら、ここへ足せば同じ穴を両方で見られる。
  ...[["トップ", "/", "#list", false]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 入力を消したら、遅れて返った候補が復活しない`, dep: "search", path,
    setup: (page) => page.route("**/AddressSearch*", async (r) => {
      await new Promise((x) => setTimeout(x, 2500));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ properties: { title: "東京都渋谷区" }, geometry: { coordinates: [139.7, 35.66] } },
                              { properties: { title: "渋谷駅" }, geometry: { coordinates: [139.7, 35.65] } }]) });
    }),
    async check(page) {
      if (needOpen) { await page.click("#findLabel"); await page.waitForTimeout(300); }
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(900);          // 応答はまだ返っていない
      await page.fill("#q", "");               // ⚠ ここで世代が進まないと復活する
      await page.waitForTimeout(3200);         // 遅れた応答が返る
      const shown = (await page.locator(listSel).innerText().catch(() => "")).trim();
      const value = await page.inputValue("#q");
      must(value === "", `入力欄が空になっていない: ${JSON.stringify(value)}`);
      must(!/渋谷/.test(shown),
        `入力を消したのに、遅れて返った候補が復活している: ${JSON.stringify(shown.slice(0, 40))}`);
      return `入力欄 空 ／ 一覧 ${shown ? JSON.stringify(shown.slice(0, 20)) : "空"}`;
    },
  })),
  // ⚠ ここに「3D の検索も、取れなかったときに『無い』と言わない」があった
  //   （2026-08-18 に外した。/peel から検索を外したため）。
  //   ⚠ **掟は生きている。**同じ主張は「検索が失敗したとき「無い」と言わない」（トップ）が見ている。
  //   ⚠ /peel に検索を戻すなら、この検査も一緒に戻すこと。
];
