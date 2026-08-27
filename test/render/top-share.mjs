// 実描画 — 共有と、そのときに数えるもの（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 2 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **1 本目と違い、⚠ 並びが動く**（⚠ 末尾ではなく、⚠ 散らばった 6 件を集めたため）。
//   ⚠ **走者は `i % n` で配るので、⚠ どのシャードに入るかは変わる。**
//   ⚠ **回る件数と、⚠ 判定の字は変わらない**（⚠ 並べ替えて突き合わせた）。
//
// ⚠ **ここが守っているもの**:
//     共有カードの中身   ⚠ **取れていないのに「実測」と書かない・粗いなら粗いと書く**
//     共有率の分母       ⚠ **判定が確定したことを 1 件数える**
//     流入の出所         ⚠ **`?from=` があるときだけ・来た瞬間に 1 回だけ**
//     年代を動かした回数 ⚠ **この場所につき 1 回だけ**（⚠ 帯を全部たどっても 1 回）
//
// ⚠ **どれも「地名も座標も送らない」の上で数えている**（`CLAUDE.md`・ADR 0035）。
//   ⚠ **数える話と、⚠ 送る話は別。**⚠ **送っていないことは `test/check/safety.mjs` が見る。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, KARUIZAWA, waitVerdict, waitStrip, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  {
    // 掟: 唯一の指標は共有率 の唯一の指標（共有率）を観測できるようにした分。
    // これが無い限り 掟: 判定が100件たまるまで共有率を読まない 順番2 も 掟: 主題は「成り立ち」。明治期は手法のひとつ のニッチも開始条件を満たさない。
    name: "共有カードと、共有率の計測", path: `/?${TOYOSU}`,
    // ⚠ 計測は判定が出た瞬間に飛ぶ。route は **goto より前**に仕込む
    //   （「流入の出所」のケースと同じ理由。check の中で仕込むと取りこぼす）
    setup: (page) => { page.__ticks = []; page.__tickHeaders = [];
      return page.route("**/t", (r) => { page.__ticks.push(r.request().postData());
        page.__tickHeaders.push(r.request().headers()); r.fulfill({ status: 204 }); }); },
    async check(page) {
      const ticks = page.__ticks, tickHeaders = page.__tickHeaders;
      await waitVerdict(page);
      await page.waitForTimeout(600);
      // 分母。判定が確定したら1件数える
      must(ticks[0] === "judged.ok", `判定の結果が違う: ${ticks[0]}`);
      // 依存の生死。共有率がゼロだったとき「面白くなかった」のか「壊れていた」のかを
      // 分けるための材料。
      // ⚠ 全部読めたときは **1件**（"all:ok"）。手法ごとに送っていた頃は、判定を1回
      //   見るだけで /t が5件飛び、Worker の呼び出し回数を計測が決めていた（実測）。
      const health = ticks.filter((t) => t?.startsWith("health:"));
      must(health.length === 1 && health[0] === "health:all:ok",
        `全部読めたのに、生死が1件（all:ok）になっていない: ${JSON.stringify(health)}`);
      // 判定を1回見るだけで飛ぶ /t の数。ここが無料枠を決める
      must(ticks.length <= 2, `判定を見るだけで /t が多すぎる: ${ticks.length} 件 ${JSON.stringify(ticks)}`);
      must(health.every((t) => /^health:(all|landform|meiji|elevation|photos):(ok|fail)$/.test(t)),
        `依存の生死の書式が違う: ${JSON.stringify(health)}`);
      // ⚠ 送ってよい語しか送っていないこと。ここに自由な文字列が混ざると、
      //   worker 側の EVENTS で弾いていても「送ってはいる」ことになる（掟: 地名も座標も送らない）
      const allowed = /^(judged\.(ok|coarse|none|fail)|shared|saved|health:[a-z]+:(ok|fail))$/;
      const stray = ticks.filter((t) => !allowed.test(t ?? ""));
      must(!stray.length, `決めた語以外を送っている: ${JSON.stringify(stray)}`);
      // ⚠ 地名も座標も送っていないこと。ここが漏れると「自分専用」が壊れる（掟: 地名も座標も送らない）。
      //   本文だけ見ていたので、URL の地名と座標が Referer で出ていたのを見逃していた。
      //   ヘッダも含めて、リクエスト全体に混ざっていないことを見る。
      must(!/豊洲|139\.|35\./.test(ticks.join("|")),
        `計測の本文に地名か座標が混ざっている: ${ticks.join("|")}`);
      const leaked = tickHeaders.filter((h) => /豊洲|%E8%B1%8A%E6%B4%B2|139\.79|35\.65/.test(
        Object.entries(h).map(([k, v]) => `${k}=${v}`).join("|")));
      must(!leaked.length,
        `計測のヘッダに地名か座標が混ざっている: ${JSON.stringify(leaked.map((h) => h.referer))}`);
      // カードは事実の集合から描く。地図のキャンバスは撮らない
      const card = await page.evaluate(() => {
        const cv = KonjakuShare.draw(meiji.facts, "豊洲");
        return { w: cv.width, h: cv.height, url: cv.toDataURL("image/png").length };
      });
      must(card.w === 1200 && card.h === 630, `カードの大きさが違う: ${card.w}x${card.h}`);
      must(card.url > 20000, `カードが描けていない（${card.url} 文字）`);
      // ⚠ 大きさとバイト数しか見ていなかったので、出典行を丸ごと消しても緑だった。
      //   何が描かれているかを見る（fillText を捕まえる）
      // ⚠ 座標も控える。**何を描いたかだけでは、名乗りが正しい位置に出たか分からない。**
      const drawn = await page.evaluate(() => {
        const orig = CanvasRenderingContext2D.prototype.fillText;
        const said = [];
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...a) {
          said.push({ t: String(t), x, y }); return orig.call(this, t, x, y, ...a);
        };
        try { KonjakuShare.draw(meiji.facts, "豊洲"); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        return { all: said.map((s) => s.t).join(" / "),
          // 名乗りの行。カード左上（64, 84）に描いている
          banner: said.find((s) => s.x === 64 && s.y === 84)?.t ?? null,
          h1: document.querySelector("h1")?.textContent.trim() ?? "" };
      });
      must(/出典: 国土地理院/.test(drawn.all), `カードに出典が無い: ${drawn.all.slice(0, 120)}`);
      must(/旧水部/.test(drawn.all), `カードに判定が無い: ${drawn.all.slice(0, 120)}`);
      must(/konjaku\.hidetzu\.work/.test(drawn.all), "カードに戻り先が無い");
      // ⚠ **名乗りが看板と割れていないこと。実際に描かれた文字で見る。**
      //   静的検査は share.js の BANNER 定義しか見ていない。**定義が正しいまま
      //   fillText に旧い文字列を直書きすれば、静的検査は通ってしまう**（実際に指摘された）。
      //   ここが「描いた結果」を見る唯一の場所。
      must(drawn.banner !== null,
        `カードの名乗りが (64, 84) に無い。位置を動かしたなら、この検査は何も見ていない`
        + `（描かれた文字: ${drawn.all.slice(0, 120)}）`);
      must(drawn.h1.length > 0, "看板（h1）を読めない。この検査が何も見ていない");
      must(drawn.banner === `今昔 — ${drawn.h1}`,
        `カードの名乗りが看板と違う: カード「${drawn.banner}」/ 看板から作るなら「今昔 — ${drawn.h1}」`
        + `（カード画像は SNS で単独に流れるので、ここが名乗りそのものになる）`);
      // 共有ボタンが判定カードの中にあること
      must(await page.locator("#shareBtn").count() === 1, "共有の手段が出ていない");
      return `計測 ${ticks[0]} ／ カード ${card.w}x${card.h}`;
    },
  },
  {
    // 共有カードは最も遠くまで届く画面。ここで断定すると被害が最も大きい。
    name: "共有カードでも、粗いときは粗いと書く", path: `/?${KARUIZAWA}`,
    setup: (page) => { page.__ticks = [];
      return page.route("**/t", (r) => { page.__ticks.push(r.request().postData());
        r.fulfill({ status: 204 }); }); },
    async check(page) {
      const ticks = page.__ticks;
      await waitVerdict(page);
      await page.waitForTimeout(600);
      must(ticks[0] === "judged.coarse", `広い区分なのに ${ticks[0]} と数えている`);
      // 画面に「低地」と「標高939m」が両方出るので、こちらの語を「海抜が低い」に変えた。
      // 地形分類の区分名は国土地理院のものなので、こちらが譲る
      const v = await page.locator("#verdict").textContent();
      must(!/（低地）/.test(v), `標高のバッジが「低地」を名乗っている（区分名と衝突する）: ${v.slice(0, 90)}`);
      return `計測 ${ticks[0]} ／ 標高バッジは区分名と衝突しない`;
    },
  },
  {
    // ⚠ 判定が30件に届かないうちは、共有率より先に「そもそも人が来ているか」を見る。
    //   分母が足りないなら、それは「面白くない」ではなく「人が来ていない」問題。
    // これが飛ばないと、記事を出しても効いたかどうかを永久に区別できない。
    name: "流入の出所を、来た瞬間に1回だけ数える", path: "/?from=zenn",
    // ⚠ 計測はページを開いた瞬間に飛ぶので、route は goto より前に仕込む。
    //   check() の中で登録すると間に合わず、0件に見えて「壊れている」と誤診する
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
    },
    async check(page) {
      await page.waitForTimeout(600);
      const ticks = page.__ticks;
      const from = ticks.filter((t) => t?.startsWith("from:"));
      // ⚠ 判定の前に数える。判定まで到達しなかった人こそ、流入としては数えたい
      must(from.length === 1, `from を ${from.length} 回送っている: ${ticks.join(" / ")}`);
      must(from[0] === "from:zenn", `ラベルが違う: ${from[0]}`);
      return `${from[0]} を1回だけ`;
    },
  },
  {
    // 反対側。ラベルが無いのに送ると「出所不明」が水増しされ、表が読めなくなる
    name: "?from= が無いときは、流入を数えない", path: "/",
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
    },
    async check(page) {
      await page.waitForTimeout(600);
      const from = page.__ticks.filter((t) => t?.startsWith("from:"));
      must(from.length === 0, `?from= が無いのに送っている: ${from.join(" / ")}`);
      return `0回（他の計測は ${page.__ticks.length} 件）`;
    },
  },
  // ---- 時間を動かした回数を数えていること ----
  // ⚠ 「使われなければ後で消す」は、数える手段が無いと"後で"が永久に来ない。
  //   分母が無いまま期間だけ決めても、共有率は評価できない。
  {
    name: "年代を動かしたことを、1回だけ数える", path: `/?${TOYOSU}`,
    async check(page) {
      const ticks = [];
      page.__ticks = ticks;
      await page.route("**/t", (r) => { ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      await waitStrip(page);
      const before = ticks.filter((t) => t === "era.moved").length;
      must(before === 0, `帯に触る前から数えている: ${before} 回`);

      // ⚠ 何回動かしても **1件**。動かすたびに送っていた頃は、帯を全部たどるだけで
      //   8件書き込んでいた。知りたいのは「触られたか」なので1回で足りる。
      for (const i of [2, 5, 3, 6]) {
        await page.locator("#strip .f").nth(i).click();
        await page.waitForTimeout(350);
      }
      const moved = ticks.filter((t) => t === "era.moved").length;
      must(moved === 1, `年代を4回動かしたのに ${moved} 件送っている（1件のはず）`);

      // 場所が変われば、また1件だけ数える
      await page.goto(new URL("/?ll=35.69560,139.82270&q=%E4%BA%80%E6%88%B8", page.url()).href,
        { waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      await waitStrip(page);
      await page.locator("#strip .f").nth(2).click();
      await settleAfterClick(page);
      const moved2 = ticks.filter((t) => t === "era.moved").length;
      must(moved2 === 2, `場所を変えても数え直していない: ${moved2} 件`);

      // ⚠ 3D を開いたことを数えるのは peel.html 側。以前はこの導線で数えていたが、
      //   共有された URL を踏んだ人が計測から消えていた。両方で数えると、
      //   導線から来た人だけ 2 回になる。ここで見たいのは「**合計で 1 回**」。
      //   ⚠ 修飾キー付きの click は使わない。macOS では新しいタブで開いて遷移せず、
      //     Linux では遷移する。**同じ検査が OS で別のものを測っていた**（CI で発覚）。
      //     普通に押して遷移させれば、どちらでも同じものを測れる。
      await page.locator('#verdict a[href^="./peel"]').first().click();
      await page.waitForURL(/\/peel/, { timeout: 15000 });
      await page.waitForTimeout(1200);
      const opened = ticks.filter((t) => t === "open.peel").length;
      must(opened === 1, `3D を開いたのに ${opened} 回数えている（導線と peel.html で二重、`
        + "または peel.html が数えていない)");

      // ⚠ 送っているのは固定文字列だけ。地名も座標も混ぜない
      const leaked = ticks.filter((t) => /豊洲|35\.|139\.|%E8%B1%8A/.test(t ?? ""));
      must(leaked.length === 0, `計測に地名か座標が混ざっている: ${leaked.join(" / ")}`);
      return `era.moved ${moved} 回（3回押して切り替わったのは2回）／導線から開いて open.peel ${opened} 回／地名・座標なし`;
    },
  },
  {
    name: "粗いカードに、粗いと書く", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      const drawn = await page.evaluate(() => new Promise((res) => {
        const out = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          out.push(String(t)); return orig.call(this, t, ...a);
        };
        document.getElementById("shareBtn")?.click();
        setTimeout(() => { CanvasRenderingContext2D.prototype.fillText = orig; res(out); }, 1500);
      }));
      const text = drawn.join(" ");
      must(text.length > 0, "共有カードに文字が描かれていない");
      // ⚠ 共有カードは最も遠くまで届く画面。ここで粗さを黙ると被害が最大になる
      must(/広い区分/.test(text), `粗いのに粗いと書いていない: ${text.slice(0, 160)}`);
      must(/実測/.test(text), `読めているのに出典が書かれていない: ${text.slice(0, 160)}`);
      return `カードに「広い区分」あり／${text.slice(0, 50)}…`;
    },
  },
  // ⚠ **共有の 3 つの結末**（2026-08-28。hidetzu/konjaku#355）。
  //
  // ⚠ **`shared` と `saved` しか送っていなかったので、⚠ 0 件が何を意味するか分からなかった。**
  //   ⚠ **押していない ／ 押したがやめた ／ 押したが壊れた**が、⚠ **同じ 0 に見えていた**
  //   （⚠ D1 実測 2026-08-28: ⚠ 17 日間 `shared` 0 件）。
  //
  // ⚠ **ここで見るのは「何本送ったか」。**⚠ **結末が 2 つ送られると、⚠ 合計が分母を超える。**
  //   ⚠ **字面（`tick()` の並び）は `test/check/data.mjs` が見る。**⚠ **ここは実際に押して数える。**
  //
  // ⚠ **共有の口はブラウザに無い**ので、⚠ **`addInitScript` で置く**（⚠ goto より前に要る）。
  {
    name: "共有できたら、押した1件と共有1件だけを数える", path: `/?${TOYOSU}`,
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
      await page.addInitScript(() => {
        // ⚠ **画像つきは通さない**（⚠ リンク共有の枝を通す。⚠ どちらでも `shared` は同じ）
        Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
        Object.defineProperty(navigator, "share", { value: async () => {}, configurable: true });
      });
    },
    async check(page) {
      await waitVerdict(page);
      await page.click("#shareBtn");
      const got = await settleTicks(page, 2);
      must(got.join("|") === "share.tap|shared",
        `押したときに送ったものが違う: ${got.join("|") || "（無し）"}`);
      return `${got.join(" → ")}（⚠ 結末は 1 つだけ）`;
    },
  },
  {
    // ⚠ **やめたのに 1 件も残らなかった。**⚠ **「押していない」と同じ 0 に見えていた。**
    name: "共有をやめたら、やめたと数える（保存へ落とさない）", path: `/?${TOYOSU}`,
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
        Object.defineProperty(navigator, "share", { value: async () => {
          // ⚠ **共有シートを閉じたときにブラウザが投げるもの**
          const e = new Error("cancelled by user"); e.name = "AbortError"; throw e;
        }, configurable: true });
      });
    },
    async check(page) {
      await waitVerdict(page);
      await page.click("#shareBtn");
      const got = await settleTicks(page, 2);
      must(got.join("|") === "share.tap|share.cancelled",
        `やめたときに送ったものが違う: ${got.join("|") || "（無し）"}`);
      // ⚠ **やめたのに保存へ落ちていないこと**（⚠ 落ちると結末が 2 つになり、⚠ 分母を超える）
      must(!got.includes("saved"), "やめたのに、画像の保存まで走っている（⚠ 結末が 2 つになる）");
      return `${got.join(" → ")}（⚠ 保存へ落ちていない）`;
    },
  },
  {
    // ⚠ **壊れたときは、⚠ 画面にだけ出て、⚠ 計測には 1 件も残らなかった。**
    // ⚠ **`blobOf()` は `try` の外に在った**ので、⚠ ここが落ちても何も数えなかった。
    name: "共有が壊れたら、壊れたと数えて、画面にも出す", path: `/?${TOYOSU}`,
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
      await page.addInitScript(() => {
        // ⚠ **絵を PNG にする所を壊す**（⚠ 以前は、⚠ ここが `try` の外だった）
        HTMLCanvasElement.prototype.toBlob = () => { throw new Error("toBlob broken"); };
      });
    },
    async check(page) {
      await waitVerdict(page);
      await page.click("#shareBtn");
      const got = await settleTicks(page, 2);
      must(got.join("|") === "share.tap|share.failed",
        `壊れたときに送ったものが違う: ${got.join("|") || "（無し）"}`);
      // ⚠ **数えるようにしたせいで、⚠ 画面から消えていないこと**（⚠ 握りつぶすと消える）
      const msg = (await page.locator("#shareMsg").textContent())?.trim() ?? "";
      must(msg === "共有できませんでした", `壊れたのに画面の字が違う: 「${msg}」`);
      return `${got.join(" → ")}／画面「${msg}」`;
    },
  },
];

// ⚠ **共有に関わる本文だけを、⚠ 落ち着くまで待って返す。**
//
// ⚠ **器ではなく、⚠ 結果の字を待つ**（`CLAUDE.md` §9）。⚠ **固定で待つと、⚠ 遅い所で取りこぼす。**
// ⚠ **`want` 本そろっても、⚠ もう一息待つ**（⚠ **多すぎることを見たい**ので、⚠ 早く切ると見逃す）。
async function settleTicks(page, want) {
  const pick = () => page.__ticks.filter((t) => t === "shared" || t === "saved" || t?.startsWith("share."));
  for (let i = 0; i < 100 && pick().length < want; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(700);
  return pick();
}
