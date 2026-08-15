// 実際にブラウザで描画させて、ページが機能しているかを確かめる。
//
// 静的検査（check.mjs）では捕まらない種類の壊れ方があるため必要。
// 実際、ヘッドレスで --disable-gpu を使うと WebGL が作れず MapLibre が
// 初期化に失敗し、以降のスクリプトが丸ごと止まる。それに気づかず
// 「HTTP 200 だから動いている」と誤認していた期間があった。
//
// 実行: node scripts/render.mjs
//   （事前に  npm i --no-save playwright && npx playwright install chromium）

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
// ⚠ 隠しディレクトリ（`.` 始まり）にしない。
//   `.artifacts/` に置いていたので actions/upload-artifact@v4 が既定で除外し、
//   **75 枚撮って 1 枚も保存されていなかった**（2026-08-15 に実測）。
const OUT = "artifacts/render";

// 判定に使う地点。水域・田・データ無しを一通り通す。
const TOYOSU = "ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2";
// 明治期の低湿地データが**無い**土地（地形分類は答えられる）。
// ⚠ ここが寄りかかっているのは「国土地理院の整備範囲の外」であって、
//   こちらの取り込みとは関係が無い。事物を取り込んでも、この性質は変わらない。
const SAPPORO = "ll=43.06400,141.34700&q=%E6%9C%AD%E5%B9%8C%E9%A7%85";

// ⚠ **取り込まない土地**。「未整備のときの振る舞い」を見る検査は、
//   その土地が未整備であることに寄りかかっている。取り込んだ瞬間、検査は
//   外へ出なくなり、**何も確かめずに必ず通る**ようになる（気づけない）。
//   以前ここは札幌だったが、札幌は北海道の顔として取り込むことにしたので移した。
//   帯広を候補に入れるときは、この検査の土地も一緒に動かすこと。
//   check.mjs が「この土地が索引に載っていないこと」を見ている。
const UNSURVEYED = "ll=42.92400,143.19600&q=%E5%B8%AF%E5%BA%83";
// 明治期は水域だが、いまは標高10m（ごみで嵩上げされた土地）。低地ではない。
const YUMENOSHIMA = "ll=35.64830,139.82650&q=%E5%A4%A2%E3%81%AE%E5%B3%B6";
// 明治期の記録が無い地点。標高は 1.79m の低地。
const KIYOSUMI = "ll=35.68170,139.80000&q=%E6%B8%85%E6%BE%84%E7%99%BD%E6%B2%B3";
// 地形分類の詳細版（z14〜16）が整備されていない土地。広域版に落ちる。
const KARUIZAWA = "ll=36.34280,138.63500&q=%E8%BB%BD%E4%BA%95%E6%B2%A2";
// 明治期の低湿地は整備対象外だが、地形分類は「旧河道」と答えられる土地。
const NIIGATA = "ll=37.91220,139.06110&q=%E6%96%B0%E6%BD%9F";
// ⚠ 建物を取り込んでいない土地。ただし明治期の低湿地データはある土地を選ぶ
//   （軽井沢は低湿地データが無く、建物の取得まで進まない）。浦安は水域 44.8%。
const URAYASU = "ll=35.65400,139.90200&q=%E6%B5%A6%E5%AE%89";

// 「次に調べる語」を一覧から拾う。
// 理由（sub）に実測した事実が入っているものだけが提案。
// 提案は読み物へ渡すものなので、リンクは Google の Web検索でなければならない。
// 地図検索に「液状化」を投げても何も出てこない。
// 判定から導いた語は .it.why を持つ。副題の文面ではなく印で拾うことで、
// 「印が付いているか」自体もここで検査していることになる。
const suggestionsOf = (page) => page.$$eval("#list .it.why", (els) => els
  .map((e) => ({ label: e.querySelector("b")?.textContent ?? "",
                 href: e.getAttribute("href") ?? "",
                 tag: e.querySelector(".tag")?.textContent ?? "" })));
// 一覧を上から [タグ, 見出し] で読む
const rowsOf = (page) => page.$$eval("#list .it", (els) => els
  .map((e) => [e.querySelector(".tag")?.textContent ?? "",
               e.querySelector("b")?.textContent ?? ""]));
const WEB_SEARCH = "https://www.google.com/search?q=";

// 判定が確定するまで待ち、ページを開いてから確定までの ms を返す。
// 「判定中…」のまま読むと素通りしてしまうので、必ずここを通す。
async function waitVerdict(page, timeout = 45000) {
  await page.waitForFunction(
    () => { const t = document.getElementById("verdict")?.textContent ?? "";
            return t.length > 0 && !t.includes("判定中"); },
    null, { timeout });
  return Math.round(await page.evaluate(() => performance.now()));
}

// Wikidata の応答を固定する。
// ⚠ 本物を叩くと、同じ実行の中で何度も問い合わせることになり、相手にも迷惑で、
//   こちらの検査も相手の混み具合で落ちる（実測で落ちた）。
//   ここで見たいのは**こちらの論理**（年で絞る・無くなったものを外す・並び順・文面）なので、
//   応答は固定してよい。落ちたときの振る舞いは、別のケースで route を切って見ている。
const WD = "**://query.wikidata.org/**";
// prec: 9=年 / 8=10年 / 7=100年（Wikidata の timePrecision と同じ）
const wdItem = (id, label, year, until, lon, lat, prec = 9) => ({
  item: { value: `http://www.wikidata.org/entity/Q${id}` },
  itemLabel: { value: label },
  date: { value: `${year < 0 ? "-" : ""}${String(Math.abs(year)).padStart(4, "0")}-01-01T00:00:00Z` },
  dateP: { value: String(prec) },
  ...(until ? { until: { value: `${until}-01-01T00:00:00Z` } } : {}),
  coord: { value: `Point(${lon} ${lat})` },
});
// 渋谷の実データに合わせた並び。無くなったものが3つ入っている
const WD_SHIBUYA = (lon, lat) => ([
  wdItem(1, "渋谷城", 1092, 1524, lon + 0.0006, lat + 0.0004),
  wdItem(2, "渋谷駅", 1885, null, lon - 0.0004, lat - 0.0003),
  wdItem(3, "並木橋駅", 1927, 1945, lon + 0.0012, lat - 0.0008),
  wdItem(4, "東急百貨店東横店", 1934, 2020, lon - 0.0009, lat + 0.0006),
  wdItem(5, "セルリアンタワー", 2001, null, lon + 0.0002, lat - 0.0011),
  wdItem(6, "○○看板 (看板)", 1954, null, lon, lat + 0.0009),
]);
// ⚠ 固定データを効かせるには、**取り込み済みの索引を外す**必要がある。
//   取り込み済みの土地は静的タイルで答えるので、そちらが先に返ってしまう。
//   ここで見たいのは「年で絞る・無くなったものを外す・並び順・文面」という
//   こちらの論理なので、未整備側の経路（実行時取得）に通して確かめる。
//   静的側が効いていることは、別のケース（取り込み済みの土地では〜）で見ている。
const stubWikidata = (page, rows) => Promise.all([
  page.route("**/data/ev/**", (r) => r.fulfill({ status: 404, body: "" })),
  page.route(WD, (r) => r.fulfill({
    status: 200, contentType: "application/sparql-results+json",
    body: JSON.stringify({ results: { bindings: rows } }),
  })),
]);

// ---- 外部から来た文字列が、HTML として実行されないこと ----
// ⚠ 配信物は一切変えない。応答だけ page.route で差し替える（実際に起きる形と同じ）。
//   Wikidata は誰でも編集でき、地理院の住所検索の応答も OSM のタグも、こちらが中身を
//   保証できない。実測（同じラベルが一覧に 8 行並ぶ状態）では、
//   一覧 8 回・#fx 2 回の計 10 回発火した。
const XSS = `<img src=x onerror="window.__pwned=(window.__pwned||0)+1">`;
// ⚠ 「発火 0」だけでは足りない。CI で画像の取得が落ちれば onerror は鳴らないので、
//   **要素になっていないこと**も併せて見る。文字として出ているなら <img> は生まれない。
// ⚠ 数えるのは**注入した印（src=x）が付いた要素**だけ。
//   `${sel} img` だと写真の帯の正しい画像まで数え、`body script` だと
//   ページ自身のスクリプト 7 個を数える。どちらも一度やって、検査のほうが間違っていた。
const notRun = async (page, sel, what) => {
  const n = await page.evaluate(() => window.__pwned ?? 0);
  must(n === 0, `${what}: 外部の文字列が ${n} 回実行された`);
  const el = await page.locator(`${sel} img[src="x"]`).count();
  must(el === 0, `${what}: 外部の文字列が要素になっている（${el} 個）`);
};
// エスケープしても、表示される文字は変えない（掟: 取れなかったを「無い」と言わない と同じで、
// 直したつもりで別のことが壊れるのを防ぐ）。生の文字列がそのまま読めることを見る。
const shownAsText = async (page, sel, what) => {
  const t = (await page.locator(sel).first().textContent()) ?? "";
  must(t.includes("<img src=x onerror="),
    `${what}: 注入した文字がそのまま表示されていない: ${(t ?? "").slice(0, 60)}`);
  return t;
};

// 帯の中で「写真の」コマだけを選ぶ。
// ⚠ 左端は明治期（低湿地データ）になった。写真ではないので、年で比べる検査はここを避ける。
const photoFrames = (page) => page.locator("#strip .f:not(.meiji)");

// 年代ストリップの写真が、実際に復号し終わるまで待つ。
// ⚠ 枠の有無だけを見て先へ進むと、**写真が1枚も出ていない帯**を検査が通してしまう。
//   しかも撮れるスクリーンショットが真っ黒になり、判断材料としても使えない。
async function waitStrip(page, timeout = 30000) {
  await page.waitForFunction(
    () => { const im = [...document.querySelectorAll("#strip img")];
            return im.length > 0 && im.every((e) => e.complete && (e.naturalWidth > 0
              || e.parentNode.classList.contains("err"))); },
    null, { timeout });
}

// ⚠ 中核思想の防衛線（docs 掟: 取れなかったを「無い」と言わない）。
// 通信が落ちただけの土地に「整備対象外」「データが無い」「残っていない」と書いていた。
// しかも根拠UI（参照タイル・読んだ画素）付きで。人の目に頼らず、ここで落とす。
const LIES = ["整備対象外", "データが無い", "記録がありません", "残っていない", "データなし"];
const GSI_ROUTE = "**://*.gsi.go.jp/**";
// 写真タイルだけを落とす。低湿地（swale）・標高・建物は生かしたまま、
// 「地表のラスタだけが1枚も届いていない」状態を作るための経路。
const PHOTO_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/**";

const CASES = [
  {
    name: "ランチャー（水域）", path: `/?${TOYOSU}`,
    async check(page) {
      // 「判定中…」のまま読むと素通りしてしまうので、確定するまで待つ
      const ms = await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(v.includes("明治期"), `見出しに判定が出ていない: ${v}`);
      const n = await page.locator("#list .it").count();
      must(n >= 5, `コマンドが少なすぎる: ${n}`);
      // バッジは常に見える／詳細な根拠は ? を押した人にだけ見せる。
      const badges = await page.locator("#verdict .badge").count();
      must(badges >= 2, `バッジが出ていない: ${badges}`);
      must(!(await page.locator("#result").isVisible()), "根拠が既定で開いている");
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      // 根拠は「見出しで言い切っているもの」から順に出す。1枚目は地形分類（掟: 主題は「成り立ち」。明治期は手法のひとつ）
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      must(/^地形分類/.test(cards[0] ?? ""), `根拠の1枚目が地形分類でない: ${(cards[0] ?? "").slice(0, 30)}`);
      must(/図式コード \d+/.test(cards[0]), `地形分類の根拠に図式コードが無い: ${cards[0].slice(0, 120)}`);
      must(/詳細版|広域版/.test(cards[0]), `どの精度で答えたのかが書かれていない: ${cards[0].slice(0, 120)}`);
      // 画素を読んでいるのは明治期のほう。1枚目に rgba を求めると、地形分類が
      // 読んでもいない画素の根拠を持っていることになってしまう
      const meijiCard = cards.find((c) => /^明治期の地形/.test(c)) ?? "";
      must(/rgba=/.test(meijiCard), `明治期の根拠（rgba）が出ていない: ${meijiCard.slice(0, 80)}`);
      // 事実の集合が出ているか（明治期・標高・写真の3つ）
      const own = await page.locator("#own").textContent();
      must(own.includes("標高"), "標高が事実として出ていない");
      must(/[\d.]+\s*m/.test(own), "標高の数値が出ていない");
      must(own.includes("直読み"), "取得方法のバッジが出ていない");
      const elev = own.match(/(-?[\d.]+)\s*m/)?.[1] ?? "?";
      // 次に調べる語。判定できた地点では出ること、Web検索へ行くこと。
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "判定が出ているのに「次に調べる語」が1件も無い");
      const wrong = sug.filter((s) => !s.href.startsWith(WEB_SEARCH));
      must(!wrong.length, `提案が Web検索になっていない: ${wrong.map((w) => w.href).join(" / ")}`);
      // 液状化は「明治期に水域」かつ「いま低地」が重なったときだけ出る語。
      // 固定枠で区分から先に埋めていた頃は、ここで落ちていた。
      must(sug.some((s) => s.label.includes("液状化")),
        `水域かつ低地なのに液状化が出ていない: ${sug.map((s) => s.label).join(" / ")}`);
      // タグは行き先ではなく「なぜここに出ているのか」を書く。
      // 〈ごはん〉と同じ 外部↗ を下げていた頃は、判定から出た語だと分からなかった。
      const badTag = sug.filter((s) => s.tag !== "この土地から");
      must(!badTag.length, `提案のタグが違う: ${badTag.map((s) => `${s.label}=${s.tag}`).join(" / ")}`);
      // 並びの原則は「この場所に固有なものほど上」。ハザードマップ・地理院地図は
      // 座標を渡すだけでどこでも中身が同じなので、判定から出た語より下に来ること。
      const rows = await rowsOf(page);
      const lastWhy = rows.map((r) => r[0]).lastIndexOf("この土地から");
      const firstFixed = rows.findIndex((r) => /ハザードマップ|地理院地図/.test(r[1]));
      must(lastWhy >= 0 && firstFixed > lastWhy,
        `固定リンクが判定から出た語より上にいる: ${rows.map((r) => r[1]).join(" / ")}`);
      // 「この土地から」の色は判定バッジと同じであること。ベージュ固定にしていたときは、
      // ここ（水域＝青い判定）でタグだけベージュになり、色が何を指すのか分からなかった。
      const tagCol = await page.$eval("#list .it.why .tag", (e) => getComputedStyle(e).color);
      const badgeCol = await page.$eval("#verdict .badge", (e) => getComputedStyle(e).color);
      must(tagCol === badgeCol, `タグの色が判定バッジと違う: タグ ${tagCol} / バッジ ${badgeCol}`);
      // 地名の例は場所が確定したら役目が終わっている。一覧の全下に居座らせない
      const quick = await page.$eval("#quick", (e) => getComputedStyle(e).display);
      must(quick === "none", `場所が確定したのに地名の例が出たままになっている: display=${quick}`);
      // 判定カードと、そこから出た行が1枚に見えていること。
      // 利用者の指摘「深掘りが別ゾーンだと迷う」への対応。要素は動かしていないので、
      // ここが崩れても ↑↓/Enter は壊れない。崩れたことに気づけないのが問題なので検査する。
      const weld = await page.evaluate(() => {
        const v = document.getElementById("verdict").getBoundingClientRect();
        const fh = [...document.querySelectorAll("#list .it.fh")];
        const rest = [...document.querySelectorAll("#list .it:not(.fh)")];
        const f0 = fh[0]?.getBoundingClientRect();
        return { n: fh.length, gap: f0 ? Math.round(f0.top - v.bottom) : null,
                 tags: fh.map((e) => e.querySelector(".tag")?.textContent ?? ""),
                 firstRest: rest[0]?.querySelector("b")?.textContent ?? "" };
      });
      must(weld.n >= 3, `判定カードに溶接された行が少なすぎる: ${weld.n}`);
      must(weld.gap === 0, `判定カードと溶接した行の間に隙間がある: ${weld.gap}px`);
      must(weld.tags.every((t) => t === "根拠あり" || t === "この土地から"),
        `この場所の判定から出ていない行まで溶接している: ${weld.tags.join(" / ")}`);
      must(/ハザードマップ|地理院地図|ごはん/.test(weld.firstRest),
        `固定リンクまで溶接に含まれている: 溶接の外の先頭が「${weld.firstRest}」`);
      return `判定「${v.trim().split("\n")[0]}」／バッジ ${badges} 個／標高 ${elev}m／コマンド ${n} 件`
        + `／提案 ${sug.map((s) => s.label).join("・")}（${firstFixed}番目より上に固定リンク無し）`
        + `／判定確定まで ${ms}ms`;
    },
  },
  {
    name: "ランチャー（データ無し）", path: `/?${SAPPORO}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      // 掟: 主題は「成り立ち」。明治期は手法のひとつ の前は「整備対象外」で終わっていた土地。地形分類は答えられる
      must(/この場所は .+ です/.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
      // ただし明治期のデータが無いことは、無いと言い続けること。
      // 地形分類が答えられたからといって、別の手法の空振りを黙って埋めない
      must(/明治期のデータなし|明治期: 記録なし/.test(v),
        `明治期が取れていないのに、そう書かれていない: ${v.trim().slice(0, 80)}`);
      // ここが一番大事。提案は明治期の区分からしか出していないので、ここでは 0 件。
      // 何か出したくなったときに当たり障りのない語で埋めると、提案そのものが死ぬ。
      const sug = await suggestionsOf(page);
      must(!sug.length, `明治期が取れていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      return `${v.trim().split("\n")[0]}／提案 0 件`;
    },
  },
  {
    // UI/UX の実機検証で見つかった初見の穴。どれも「根拠を売りにする製品が、
    // 同じ画面で自分と食い違う」型なので、機械で押さえる。
    name: "同じ画面で自分と食い違わない", path: `/?${NIIGATA}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(400);
      // かつて年代比較の副題に「1936年〜」を固定で書いていて、新潟のバッジ（1945–50）と
      // 34px の距離で食い違っていた。いまは年代を名乗る場所が大きい写真の見出しに移ったので、
      // **食い違いうる組み合わせ全部**を突き合わせる。
      await waitStrip(page);
      const badge = (await page.locator("#verdict .badge").allTextContents())
        .find((t) => t.includes("年から")) ?? "";
      const era = badge.match(/(\d{4}[–-]\d{2})/)?.[1];
      must(era, `写真の年代バッジが読めない: ${badge}`);
      // 着いた瞬間は最古。大きい写真の見出しが、バッジの言う最古と一致すること
      const yrBig = (await page.locator("#yrBig").textContent()).trim();
      must(yrBig.includes(era), `大きい写真の年代がバッジと食い違う: 「${yrBig}」／「${badge}」`);
      // 年代を名乗る行を、一覧の中に**作らない**（作れば必ず食い違いうる）
      const subs = await page.$$eval("#list .it small",
        (els) => els.map((e) => e.textContent.trim()).filter((t) => /\d{4}[–-]\d{2}|\d{4}年/.test(t)));
      must(subs.length === 0, `一覧が年代を名乗っている（食い違いの種）: ${subs.join(" / ")}`);
      // 根拠を開いたら、そこから閉じられること。開くと1.3画面下へ飛ぶので ? には戻れない
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      must(await page.locator("#closeWhy").isVisible(), "根拠を閉じる手段が出ていない");
      await page.click("#closeWhy");
      await page.waitForTimeout(400);
      must(!(await page.locator("#result").isVisible()), "閉じるを押しても根拠が閉じない");
      return `大きい写真「${yrBig.replace(/\s+/g, " ")}」＝バッジ「${badge}」／一覧は年代を名乗らない／閉じられる`;
    },
  },
  {
    // 溶接は「この土地の答え」を1枚に見せるためのもの。判定から出た語が無い土地で
    // 囲うと、どこでも同じ2行を囲んだ空箱になり、答えがあるように見える
    name: "判定から出た語が無いときは溶接しない", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(400);
      const why = await page.locator("#list .it.why").count();
      const fh = await page.locator("#list .it.fh").count();
      must(why === 0, `軽井沢で提案が出ている（前提が変わった）: ${why}`);
      must(fh === 0, `判定から出た語が無いのに溶接している: ${fh} 行`);
      return `提案 0 件／溶接 0 行`;
    },
  },
  {
    // ズームは暗いパネルに載せたせいで黒地に黒になり、実測でボタンの存在すら見えなかった
    name: "さかのぼる（ズームが見えて、指で押せる）", path: `/peel?${TOYOSU}`,
    viewport: { width: 390, height: 844 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      const btns = await page.$$eval(".maplibregl-ctrl-group button", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        const icon = e.querySelector(".maplibregl-ctrl-icon");
        return { w: Math.round(r.width), h: Math.round(r.height),
                 filter: icon ? getComputedStyle(icon).filter : "none" };
      }));
      must(btns.length >= 2, `ズームボタンが無い: ${btns.length}`);
      const small = btns.filter((b) => b.w < 44 || b.h < 44);
      must(!small.length, `指の当たり判定が 44×44 に届かない: ${JSON.stringify(small)}`);
      // 暗い地図の上に濃いアイコンをそのまま置かないこと
      must(btns.every((b) => b.filter !== "none"),
        `アイコンが反転していない（黒地に黒になる）: ${JSON.stringify(btns.map((b) => b.filter))}`);
      return `${btns.length} 個すべて ${btns[0].w}×${btns[0].h}／アイコン反転あり`;
    },
  },
  {
    // このサービスでいちばん価値のある信号は「探したのに出せなかった語」。
    // 黙って去られると永久に分からない。ただし勝手には送らない（掟: 地名も座標も送らない）。
    // 押すかどうかは本人が決める形になっていること。
    name: "見つからなかった語を、本人の判断で報告できる", path: "/",
    async check(page) {
      await page.fill("#q", "ぞぞぞぞぞぞ");
      await page.waitForFunction(
        () => /見つかりませんでした/.test(document.getElementById("list")?.textContent ?? ""),
        null, { timeout: 30000 });
      const a = page.locator("#list .report");
      must(await a.count() === 1, "見つからなかったのに報告の手段が無い");
      const href = await a.getAttribute("href");
      must(/^https:\/\/docs\.google\.com\/forms\//.test(href), `送り先が違う: ${href}`);
      // 打った語が入った状態で開くこと。ここが空だと、利用者が打ち直す羽目になる
      must(decodeURIComponent(href).includes("ぞぞぞぞぞぞ"),
        `打った語が引き継がれていない: ${href}`);
      // 種類も選ばれた状態にする。押すのは「送信」だけで済ませる
      must(decodeURIComponent(href).includes("地名が見つからない"),
        `種類が選ばれていない: ${decodeURIComponent(href)}`);
      // ⚠ 送信は本人が押す。こちらから勝手に投げていないこと
      let posted = 0;
      await page.route("**/docs.google.com/**", (r) => { posted++; r.abort(); });
      await page.waitForTimeout(500);
      must(posted === 0, "利用者が押していないのにフォームへ通信している");
      // ⚠ フッターの常設リンクは外した。聞くのは「見つからなかったその場」だけにする。
      //   漠然とした意見の窓口より、探して出せなかった語のほうが signal が強い
      must(await page.locator("#feedbackLink").count() === 0,
        "フッターに常設の意見リンクが残っている");
      return `報告リンクに「ぞぞぞぞぞぞ」と種類が入る／勝手な送信なし`;
    },
  },
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
  {
    // 掟: 主題は「成り立ち」。明治期は手法のひとつ の効き目がいちばん出るところ。明治期の低湿地は整備対象外で、
    // これまでこの土地では一言も言えなかった（掟: 取れなかったを「無い」と言わない の「防災クラスタが最も
    // 語りたい土地で一言も言えない」）。
    name: "明治期が無くても、地形分類から語が出る", path: `/?${NIIGATA}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(/旧河道/.test(v), `地形分類が出ていない: ${v.trim().slice(0, 60)}`);
      must(/明治期のデータなし/.test(v), `明治期が無いことを言っていない: ${v.trim().slice(0, 80)}`);
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "地形分類が出ているのに提案が1件も無い");
      // 理由は必ず、この地点で実測した事実を名指ししていること
      const subs = await page.$$eval("#list .it.why small", (els) => els.map((e) => e.textContent.trim()));
      must(subs.every((t) => /旧河道|標高/.test(t)), `理由が実測した事実を指していない: ${subs.join(" / ")}`);
      return `${v.trim().split("\n")[0]}／提案 ${sug.map((s) => s.label).join("・")}`;
    },
  },
  {
    // 掟: 主題は「成り立ち」。明治期は手法のひとつ のいちばん危ないところ。詳細版（z14〜16）が無い土地では広域版（z13）に
    // 落ちるが、粗くなったことを黙ると「詳細版が無い」が「これがこの土地の分類だ」に化ける。
    name: "詳細版が無い土地では、粗いと言う", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(/この場所は .+ です/.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
      // バッジ自体に「広い区分」と書いてあること。本文だけだと読まれない
      const badge = await page.$$eval("#verdict .badge", (els) => els.map((e) => e.textContent.trim()));
      must(badge.some((b) => b.includes("広い区分")),
        `粗い区分なのにバッジがそう言っていない: ${badge.join(" / ")}`);
      must(/詳細版が整備されていない/.test(v),
        `なぜ粗いのかが書かれていない: ${v.trim().slice(0, 120)}`);
      // 根拠側でも、どの精度で答えたのかを名指しすること
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const card = await page.$eval("#own .card", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/広域版・地域版/.test(card), `根拠に精度が書かれていない: ${card.slice(0, 140)}`);
      // 粗い区分から具体的な語を出さない。分かっていないことを分かった顔で見せない
      const sug = await suggestionsOf(page);
      must(!sug.length, `広い区分しか分かっていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      return `${v.trim().split("\n")[0]}／バッジ ${badge.join(" / ")}`;
    },
  },
  {
    name: "ランチャー（記録なし・低地）", path: `/?${KIYOSUMI}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(/記録がありません|記録なし/.test(v), `「記録なし」が出ていない: ${v.slice(0, 60)}`);
      // 明治期に記録が無いことは、地形分類が答えられても言い続けること。
      // 片方が答えられたからといって、もう片方の空振りを黙って埋めない
      must(/明治期: 記録なし/.test(v), `明治期の空振りが隠されている: ${v.slice(0, 80)}`);
      // 掟: 主題は「成り立ち」。明治期は手法のひとつ の前は、ここで提案が 0 件だった（明治期の区分からしか出していなかったため）。
      // いまは地形分類から出る。ただし理由は必ず、この地点で実測した事実を名指しすること。
      // 「記録なし」を根拠に語を出していたら、それは埋め草なので落ちる。
      const subs = await page.$$eval("#list .it.why small", (els) => els.map((e) => e.textContent.trim()));
      must(subs.length >= 1, "地形分類が出ているのに提案が1件も無い");
      must(!subs.some((t) => /記録なし|明治期/.test(t)),
        `明治期の記録が無いのに、それを理由にした提案が出ている: ${subs.join(" / ")}`);
      must(subs.every((t) => /旧水部|盛土地|埋立地|標高/.test(t)),
        `理由が実測した事実を指していない: ${subs.join(" / ")}`);
      const badges = await page.locator("#verdict .badge").allTextContents();
      return `${badges.join(" / ")}／提案の理由 ${subs.join(" / ")}`;
    },
  },
  {
    name: "ランチャー（水域だが高台）", path: `/?${YUMENOSHIMA}`,
    async check(page) {
      await waitVerdict(page);
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "水域と判定できているのに提案が1件も無い");
      // 低地ではないので液状化は出さない。ここで出るなら、条件が枠取りに戻っている。
      must(!sug.some((s) => s.label.includes("液状化")),
        `低地でないのに液状化が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      const badges = await page.locator("#verdict .badge").allTextContents();
      return `${badges.join(" / ")}／提案 ${sug.map((s) => s.label).join("・")}`;
    },
  },
  {
    name: "さかのぼる（3D）", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 水域ポリゴンはタイルを読んで自前で生成する。ここが動かないと作品として成立しない
      // 水域は低湿地タイルを読んで自前で起こす。件数が画面に出るのでそれを待つ
      await page.waitForFunction(
        () => /水域\s*\d+\s*面|取得できませんでした|データがありません/.test(
          document.getElementById("status")?.textContent ?? ""),
        null, { timeout: 60000 });
      // 建物まで揃うのを待つ。事前計算データがある範囲なので Overpass には出ない。
      // 建物データが画面に出ることが、作品の成立条件（掟: 取れなかったを「無い」と言わない）。
      await page.waitForFunction(
        () => /建物\s*\d+\s*件/.test(document.getElementById("status")?.textContent ?? ""),
        null, { timeout: 60000 });
      const ms = Math.round(await page.evaluate(() => performance.now()));
      // 事前計算データがある範囲では Overpass を叩かない。
      // 本番で 504／無応答が常態のものを、作品の成立条件に置かない（掟: 取れなかったを「無い」と言わない）
      const op = reqs.filter((u) => u.includes("overpass"));
      must(!op.length, `事前計算データがあるのに Overpass を叩いている: ${op[0]}`);
      const status = (await page.locator("#status").textContent()).trim();
      const water = Number(status.match(/水域\s*(\d+)\s*面/)?.[1] ?? 0);
      must(water > 0, `水域ポリゴンが生成されていない（${status.slice(0, 60)}）`);
      const bld = Number(status.match(/建物\s*(\d+)\s*件/)?.[1] ?? 0);
      must(bld > 0, `建物が出ていない（${status.slice(0, 80)}）`);
      must(/事前に取り込んだデータ|事前計算データ/.test(status),
        `事前に取り込んだデータを使っていない（${status.slice(0, 80)}）`);
      const hero = await page.locator("#heroNum").textContent({ timeout: 45000 });
      const pct = Number(hero.match(/[\d.]+/)?.[0] ?? 0);
      must(pct > 99, `建物ベースの割合になっていない（面積比に落ちている?）: ${hero}`);
      const cap = await page.locator("#heroCap").textContent();
      must(cap.includes("1件ずつ判定した実測値"), `実測の説明が出ていない: ${cap.trim().slice(0, 40)}`);
      // ⚠ ここは長いあいだ、読んで報告に印字するだけで assert が無かった。
      //   08ce46f で潰した「測っていないことを報告する」と同じ形が、
      //   いちばん重要な case に残っていた（2026-08-14 検証者の指摘）。
      const era = (await page.locator("#era .y").textContent()).trim();
      must(era.length > 0, "年代の見出しが空");
      // 着いたときは「現在」側。ここが別のものになったら、名前と中身が食い違っている
      must(era === "現在", `3D に着いた時点の見出しが「現在」でない: 「${era}」`);
      // 通常時は地表の行が「実測」を名乗ること。タイル到達の判定を入れた副作用で
      // ここが未取得のまま固まっていないかを見る（ms の後で測り、性能の数字は汚さない）
      await page.waitForFunction(
        () => document.querySelector("#prov .prov")?.className.includes("ok"),
        null, { timeout: 30000 });
      const msGround = Math.round(await page.evaluate(() => performance.now()));
      const ground = await page.locator("#prov .prov").first().textContent();
      must(ground.includes("実測") && ground.includes("そのもの"),
        `地表の実測表示が出ていない: ${ground.trim().slice(0, 40)}`);
      return `${hero.trim()} ／ 建物 ${bld} 件 ／ 水域 ${water} 面 ／ 年代 ${era.trim()}`
        + ` ／ Overpass 0 回 ／ 建物が揃うまで ${ms}ms ／ 地表タイル到達 ${msGround}ms`;
    },
  },
  {
    // 明治期のデータが無い土地。ここで「0.0% — 1408件すべてを判定した実測値」と
    // 書いていた。測れていないものを測定値として出さない（掟: 取れなかったを「無い」と言わない）。
    name: "さかのぼる（判定できない土地）", path: `/peel?${SAPPORO}`,
    async check(page) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 集計が出るところまで待つ（建物は Overpass 頼みで遅いので、そこは待たない）
      await page.waitForFunction(
        () => (document.getElementById("heroCap")?.textContent ?? "").trim().length > 0,
        null, { timeout: 60000 });
      // 地形分類は建物の集計とは別に取りに行くので、後から届く。待つ。
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("heroCap")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#heroNum").textContent()).trim();
      must(!/\d/.test(hero), `判定できない土地で数字を出している: ${hero}`);
      // 建物ごとの割合は出せない。それを「何も分からない」と混ぜないこと（掟: 主題は「成り立ち」。明治期は手法のひとつ）
      must(hero.includes("建物ごとには出せません"),
        `出せないのが「建物ごと」であることが書かれていない: ${hero}`);
      const cap = (await page.locator("#heroCap").textContent()).trim();
      must(!cap.includes("実測値"), `判定していないのに「実測値」と書いている: ${cap.slice(0, 50)}`);
      // 土地そのものには答えられる。ここで黙ると、建物が出ているのに終わってしまう
      must(/この土地は .+/.test(cap), `地形分類が出ていない: ${cap.slice(0, 80)}`);
      must(/整備対象外|読み込め/.test(cap),
        `明治期が取れていないことを言っていない: ${cap.slice(0, 80)}`);
      const status = (await page.locator("#status").textContent()).trim();
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 34)}`;
    },
  },
  {
    // 事前計算データは自前で持っているので出る。
    // だが建物の足元の判定は明治期タイルを読まないとできない。読めないものを
    // 「データなし」に丸めて 0.0% を出さないこと（掟: 取れなかったを「無い」と言わない）。
    name: "さかのぼる（通信断）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(
        () => /件|ありません|読み込めませんでした/.test(
          document.getElementById("status")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#heroNum").textContent()).trim();
      must(!/^[\d.]+/.test(hero), `読めていないのに割合を出している: ${hero}`);
      const cap = (await page.locator("#heroCap").textContent()).trim();
      must(!cap.includes("実測値"), `判定していないのに「実測値」と書いている: ${cap.slice(0, 50)}`);
      must(/読み込め/.test(cap), `読み込めなかったことが書かれていない: ${cap.slice(0, 50)}`);
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `通信断なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      must(await page.locator("#status .retry-btn").count() >= 1, "再試行の手段が出ていない");
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／再試行あり`;
    },
  },
  {
    // ⚠ ここが崩れると思想が崩れる。
    // GSI への通信を止めても、豊洲が「整備対象外」になってはいけない。
    name: "通信断でも嘘の断定をしない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      const ms = await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `通信断なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 提案は実測した事実からしか出さない。取れていないのだから 0 件
      const sug = await suggestionsOf(page);
      must(!sug.length, `読めていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      // 根拠UI（参照タイルのリンク・読んだ画素・rgba）を出してはいけない。
      // 読んでいないものに根拠を付けると、最も権威ありげな見た目で最も誤ったことを言う。
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 15000 });
      const own = await page.locator("#own").textContent();
      const lie2 = LIES.find((w) => own.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している`);
      must(!/rgba=|読んだ画素/.test(own), "読んでいないのに画素の根拠が出ている");
      must(await page.locator("#own .ev a").count() === 0, "読んでいないのに参照タイルのリンクが出ている");
      must(!own.includes("直読み"), "読めていないのに「直読み」と表示している");
      // 再試行が本当に効くか。失敗をキャッシュに残していると、ここで永久に直らない。
      await page.unroute(GSI_ROUTE);
      await page.click("#retryBtn");
      await page.waitForFunction(
        () => /この場所は .+ です/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 30000 });
      const after = await page.locator("#verdict").textContent();
      // 見出しは地形分類、明治期はバッジ。両方の手法が戻っていることを見る
      must(/旧水部|水部/.test(after), `再試行しても地形分類が戻らない: ${after.slice(0, 60)}`);
      must(after.includes("河川・湖沼・海面"), `再試行しても明治期が戻らない: ${after.slice(0, 60)}`);
      return `${v.trim().split("\n")[0].slice(0, 40)}／根拠なし／${ms}ms で確定`
        + `／再試行で復帰「${after.trim().split("\n")[0].slice(0, 24)}」`;
    },
  },
  {
    // 応答が返ってこない相手。以前は 25 秒経っても「判定中…」のままで復帰手段が無かった。
    name: "無応答でも待ち続けない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, () => { /* 握りつぶす＝無応答 */ }),
    async check(page) {
      const t0 = Date.now();
      const ms = await waitVerdict(page, 25000);   // タイムアウト（8秒）で確定するはず
      const wall = Date.now() - t0;
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `無応答なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      return `${wall}ms で確定（ページ起点 ${ms}ms）／${v.trim().split("\n")[0].slice(0, 34)}`;
    },
  },
  {
    // ⚠ 「いま画面に出ているもの」の地表の行は無条件だった。ラスタが1枚も
    // 届いていなくても「実測 地表はその年代の空中写真そのもの」と書いていた。
    // 水面（waterRead）と建物（total）にはガードがあり、地表だけ素通り。
    // 取れなかったものを「実測した」と言う、掟: 取れなかったを「無い」と言わない の根そのもの。
    name: "さかのぼる（地表タイルだけ落とす）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(PHOTO_ROUTE, (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(
        () => /建物\s*\d+\s*件/.test(document.getElementById("status")?.textContent ?? ""),
        null, { timeout: 60000 });
      const prov = (await page.locator("#prov").textContent()).trim();
      must(!prov.includes("そのもの"),
        `地表が届いていないのに「実測」と言っている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      const ground = await page.locator("#prov .prov").first();
      const cls = (await ground.getAttribute("class")) ?? "";
      const txt = (await ground.textContent()).replace(/\s+/g, " ").trim();
      must(cls.includes("no"), `地表の行が「取れていない」表示になっていない: ${cls} / ${txt}`);
      must(txt.includes("未取得"), `未取得のバッジが出ていない: ${txt.slice(0, 50)}`);
      // 断定もしない。届かなかっただけで、その年代の写真の有無は分かっていない
      const lie = LIES.find((w) => txt.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${txt.slice(0, 50)}`);
      // 落としたのは写真タイルだけ。水面・建物は従来どおり出ること
      // （地表のガードが他の行まで巻き添えにしていないかを、ここで見る）
      must(prov.includes("実際の水域"), `水面の行まで落ちている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      const hero = (await page.locator("#heroNum").textContent()).trim();
      must(Number(hero.match(/[\d.]+/)?.[0] ?? 0) > 99, `建物の割合が出ていない: ${hero}`);
      return `${txt.slice(0, 34)}／水面と建物（${hero}）は従来どおり`;
    },
  },
  // ---- 検索の入口（掟: 取れなかったを「無い」と言わない やる順番3）----
  // 住所検索は関連度で返らないので、素の先頭は別の土地になる。
  // 並びそのものは scripts/search-check.mjs が35語で測る。ここで見るのは
  // 「画面の上で Enter を押したとき何が起きるか」のほう。
  {
    name: "検索（確度が高いので先頭を選ぶ）", path: "/",
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
    name: "検索（確度が低いので選ばない）", path: "/",
    async check(page) {
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
      return `未選択のまま／hover でも武装せず／↓ 後に「${txt}」`;
    },
  },
  {
    // ⚠ 区名と町字が同じ語で競合する組。並べ替えは「区名が上」で決めるが、それは
    // 順番の規則であって確からしさの証拠ではない。ここで選んでしまうと、
    // 掟: 取れなかったを「無い」と言わない で狙いに定めた埋立地（港区港南＝品川駅東）から確信を持って離れる。
    name: "検索（同名の土地では選ばない）", path: "/",
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
    name: "検索が失敗したとき「無い」と言わない", path: "/",
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
      const reach = (sel) => page.$eval(sel, (e, size) => {
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
      return `? と ✕ が実測で 44×44 に届く／隅を押して開く／候補の最小高 ${min}px／キーヒントは非表示`;
    },
  },
  {
    // ⚠ ピンは入口。数を増やすと、増やしただけ押し間違いが増える。
    //   間違えて開いても「別の街の判定」が普通に出るので、間違えたこと自体に気づけない。
    name: "ピンは、指で押せる大きさで、折り返しの上にある", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      const r = await page.evaluate(() => {
        const b = [...document.querySelectorAll("#quick button")]
          .map((e) => e.getBoundingClientRect());
        return { n: b.length, minH: Math.min(...b.map((x) => x.height)),
          bottom: Math.max(...b.map((x) => x.bottom)),
          rows: new Set(b.map((x) => Math.round(x.top))).size };
      });
      must(r.n >= 5, `ピンが少なすぎる: ${r.n} 個`);
      // 指で押す端末では 44px（Apple の指針）。ここを下回ると隣を押す
      must(r.minH >= 44, `ピンが指で押すには小さい: ${Math.round(r.minH)}px（44px 必要）`);
      // 入口が折り返しの下にあると、来た人は入口があること自体を知らない
      must(r.bottom <= 667, `ピンが折り返しの下にはみ出た: 下端 ${Math.round(r.bottom)}px`);
      return `${r.n} 個 / ${r.rows} 行 / 高さ ${Math.round(r.minH)}px / 下端 ${Math.round(r.bottom)}px`;
    },
  },
  {
    name: "最初の画面が何のサービスか言っている", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // 利用者役のエージェントによる検証で理解まで1分半かかり「グルメ検索? 不動産?」と受け取られていた。
      // 判定できることだけを書く（掟: 根拠のないことは書かない）。埋立の年や「昔は海」は画素から出せないので書かない。
      const head = await page.$eval("header", (e) => e.textContent.replace(/\s+/g, " ").trim());
      // 見出しは効能で名乗る（掟: 看板は効能で名乗る）。「その土地を知る」はカテゴリ名で、
      // 何が起きるかが読んだ人に伝わっていなかった。主題（成り立ち・掟: 主題は「成り立ち」。明治期は手法のひとつ）は変えていない。
      // 何を読んで何を出すのかが、最初の画面に書いてあること
      must(/この土地は、昔なんだったのか/.test(head), `見出しが変わっている: ${head.slice(0, 40)}`);
      must(/成り立ち/.test(head), `何を判定するのかが書いていない: ${head}`);
      must(/国土地理院/.test(head), `何を読んで判定するのかが書いていない: ${head}`);
      const h1 = await page.$eval("h1", (e) => {
        const r = e.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), right: Math.round(r.right),
                 over: e.scrollWidth - e.clientWidth };
      });
      must(h1.bottom < 200, `見出しが読める位置に無い: y=${h1.bottom}`);
      // ⚠ 見出しを7文字から15文字に伸ばした。375px 幅で溢れたり切れたりしないことを見る。
      //   placeholder で同じ失敗（可視幅に収まらず「（例: 豊洲）」が切れる）を既にやっている
      must(h1.over <= 0, `見出しが横に溢れている: ${h1.over}px はみ出し`);
      must(h1.right <= 375, `見出しが画面外に出ている: right=${h1.right}`);
      // ⚠ placeholder は**入力欄の可視幅に収まっていること**まで見る。
      // 文言だけ見ていたので、375px 幅で「（例: 豊洲）」が切れて出ていない状態を通していた。
      const ph = await page.$eval("#q", (e) => {
        const cs = getComputedStyle(e);
        const c = document.createElement("canvas").getContext("2d");
        c.font = `${cs.fontSize} ${cs.fontFamily}`;
        return { text: e.placeholder, need: Math.ceil(c.measureText(e.placeholder).width),
                 room: Math.floor(e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
      });
      must(ph.need <= ph.room,
        `placeholder が入力欄に収まらない: ${ph.need}px 必要 / 可視幅 ${ph.room}px「${ph.text}」`);
      // 地名の例は、まだ場所を選んでいないこの画面では見えていること。
      // 「確定後は消す」を入れたので、消しすぎていないことを反対側から押さえる
      const q0 = await page.$eval("#quick", (e) => {
        const r = e.getBoundingClientRect();
        return { disp: getComputedStyle(e).display, y: Math.round(r.y), h: Math.round(r.height) };
      });
      must(q0.disp !== "none" && q0.h > 0 && q0.y < 667,
        `最初の画面で地名の例が見えていない: ${JSON.stringify(q0)}`);
      // 収まらない説明はフォーカス時の補足へ回す。触れば読めること
      await page.click("#q");
      must(await page.locator(".hint").isVisible(), "入力欄に触れても補足が出ない");
      const hint = (await page.locator(".hint").textContent()).trim();
      return `${head.slice(0, 40)}…／placeholder「${ph.text}」${ph.need}px ≤ ${ph.room}px／補足「${hint}」`;
    },
  },
  // ---- 年代ストリップ ----
  // 帯そのものより、**帯が何を言っていないか**を見る検査。
  // 「1960年代：造成開始」のような中間の主張は空中写真からは出せない（掟: 画素から出せないことは言わない（実測1））。
  // 写真を並べるだけ、という決定が崩れていないことを人の目に頼らず押さえる。
  {
    name: "年代の写真が並ぶ（豊洲）", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => ({
        year: e.querySelector(".yr")?.textContent.trim() ?? "",
        now: e.classList.contains("now"),
        w: e.querySelector("img")?.naturalWidth ?? 0,
        err: !!e.querySelector(".im.err"),
      })));
      must(fr.length >= 4, `年代が並んでいない: ${fr.length} 枚`);
      // ⚠ 判定が「旧水部」と言っているのに、残っている写真はどれも既に陸だった。
      //   判定の根拠になっている明治期のデータを、帯の左端に置いてある
      must(await page.locator("#strip .f.meiji").count() === 1,
        "明治期のコマが帯に無い（判定と、目の前の絵が噛み合わない）");
      must(fr[0].year === "明治期", `左端が明治期でない: ${fr[0].year}`);
      // ⚠ 明治期は空中写真ではない。数に混ぜると「8年代（7年代中）」という嘘になる
      const foot = (await page.locator(".strip-foot").textContent()).replace(/\s+/g, " ");
      const [got, of] = (foot.match(/(\d+)\s*年代（\s*(\d+)/) ?? []).slice(1).map(Number);
      must(got <= of, `空中写真の数が、ありうる数を超えている: ${foot.trim()}`);
      must(fr.every((f) => f.err || f.w > 0), `写真が復号できていない: ${JSON.stringify(fr)}`);
      must(!fr.some((f) => f.err), `豊洲で読めない写真がある: ${JSON.stringify(fr)}`);
      // 右端は現在。左端は最古。時間の向きが逆だと、この帯は何も語らない
      must(fr[fr.length - 1].now && fr[fr.length - 1].year === "現在",
        `右端が現在でない: ${fr[fr.length - 1].year}`);
      must(/^1936/.test(fr[1].year), `明治期の次が最古の写真でない: ${fr[1].year}`);
      // ⚠ ここが本体。年の表記と「現在」以外の語を、帯の中に置かない。
      //   ここが緩むと「1960年代：造成開始」のような、実測できない作文が入り込む
      const stray = fr.map((f) => f.year).filter((y) => !/^(\d{4}–\d{2}|現在|明治期)$/.test(y));
      must(stray.length === 0, `帯が年代以外のことを言っている: ${stray.join(" / ")}`);
      // 判定した画素の位置に印が出ていること（写真のどこの話かが分かる）
      const marks = await page.locator("#strip .mk").count();
      must(marks === fr.length, `印が枚数と合わない: ${marks} / ${fr.length}`);
      // 帯から先へ行けること。行き先は年代を重ねて見る画面
      // ⚠ 画面に出ている写真が、**判定に使った写真そのもの**であること。
      //   photos() は z16 のこのタイルを読んで年代の有無を決めている。帯が別のズームや
      //   別のタイルを出していたら、根拠と絵が別物になる（それを根拠と呼べなくなる）。
      //   同じ地点・同じ z なら、レイヤ名を除いた /16/x/y の部分は全枚で一致するはず。
      const at = await page.$$eval("#strip img", (els) => els
        .map((e) => (e.getAttribute("src").match(/\/(\d+)\/(\d+)\/(\d+)\.\w+$/) ?? []).slice(1).join("/")));
      must(new Set(at).size === 1, `帯の写真が同じ地点・同じズームでない: ${[...new Set(at)].join(" / ")}`);
      // 写真タイルの実通信。判定のぶんと帯のぶんで同じURLを引くので、重複が出るのは想定内。
      // 「別のタイルまで取りに行き始めた」ときに、この2つの数字が離れる
      const tiles = reqs.filter((u) => /cyberjapandata\.gsi\.go\.jp\/xyz\/(ort_|gazo|seamlessphoto)/.test(u));
      return `${fr.length} 枚（${fr[0].year} 〜 現在）／印 ${marks}／すべて z${at[0].split("/")[0]} の同一タイル`
        + `／写真タイルの要求 ${tiles.length} 件（実URL ${new Set(tiles).size} 種）`;
    },
  },
  {
    name: "写真が1年代しか無い土地でも帯が崩れない", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) =>
        e.querySelector(".yr")?.textContent.trim() ?? ""));
      // 軽井沢は 1974–78 の1年代だけ。無い年代を埋めない
      must(fr.length >= 2, `帯が出ていない: ${JSON.stringify(fr)}`);
      must(fr[fr.length - 1] === "現在", `右端が現在でない: ${JSON.stringify(fr)}`);
      must(!fr.includes("1936–42"), `残っていない年代を並べている: ${JSON.stringify(fr)}`);
      return fr.join(" / ");
    },
  },
  {
    // ⚠ 横スクロールで作ったときに実際に起きていた壊れ方。
    //   375px 幅では4枚目で切れ、いちばん見せたい「現在」が画面の外にいた。
    //   「昔 → 今」を1画面で見せる帯なのに、今が見えないのでは意味が無い。
    name: "スマホ幅でも、現在まで1画面に収まる", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { year: e.querySelector(".yr")?.textContent.trim() ?? "",
                 right: Math.round(r.right), bottom: Math.round(r.bottom) };
      }));
      const over = fr.filter((f) => f.right > 375);
      must(over.length === 0,
        `帯が画面からはみ出している: ${over.map((f) => `${f.year}(right=${f.right})`).join(" / ")}`);
      const now = fr[fr.length - 1];
      must(now.year === "現在", `右端（最後）が現在でない: ${now.year}`);
      must(now.bottom <= 667, `現在がファーストビューの外にいる: y=${now.bottom}`);
      // 帯そのものが画面の高さを食いつぶしていないこと（判定文が押し出される）
      const h = await page.$eval("#strip", (e) => Math.round(e.getBoundingClientRect().height));
      must(h <= 220, `帯が高すぎる: ${h}px`);
      // 場所が決まったらリード文は畳む（実測 79px。写真と判定文がそのぶん下へ押し出されていた）
      const leads = await page.$$eval(".lead", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0).length);
      must(leads === 0, `場所を選んだあともリード文が残っている: ${leads} 個`);
      // 判定文が画面内にあること。写真が主役でも、答えの一文は同じ画面で読めること
      const v = await page.$eval("#verdict .v-head", (e) => Math.round(e.getBoundingClientRect().y));
      must(v < 667, `判定文がファーストビューの外にいる: y=${v}`);
      return `${fr.length} 枚が ${Math.ceil(fr.length / fr.filter((f) => f.bottom === fr[0].bottom).length)} 行`
        + `／現在は y=${now.bottom}／帯の高さ ${h}px`;
    },
  },
  {
    name: "通信断のときは年代の写真を並べない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await waitVerdict(page);
      // 読めていないのに枠だけ並べると、「この年代は写真が無い」に化ける。
      // 出さないことがいちばん正確（掟: 取れなかったを「無い」と言わない）
      must(await page.locator("#strip").count() === 0, "通信断なのに年代の帯が出ている");
      must(await page.locator("#strip .f").count() === 0, "通信断なのに写真の枠が出ている");
      const v = await page.locator("#verdict").textContent();
      must(/読み込めませんでした/.test(v), `読み込めなかったことが書かれていない: ${v.slice(0, 60)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行が出ていない");
      for (const w of LIES) must(!v.includes(w), `通信断で断定している: 「${w}」`);
      return `帯なし／再試行あり／断定なし`;
    },
  },
  // ---- 入口が塞がっていないこと ----
  // ⚠ 実測で見つけた事故。スマホ幅で **1タップ目が必ず空振り**していた。
  //   入力欄がフォーカスを失うと補足文（.hint）が消え、下にあるものが 42px 上へずれる。
  //   指を離す前にレイアウトが動くので、押した座標には別の要素が来ている。
  //   見せ方をどれだけ磨いても、ここが塞がっていると誰も判定に到達できない。
  {
    name: "スマホで、最初の1タップが空振りしない", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // (1) クイック選択（地名の例）
      await page.waitForSelector("#quick button");
      const chip = page.locator("#quick button", { hasText: "豊洲" });
      await page.click("#q");                       // 利用者と同じ順序で、まず入力欄に触れる
      await page.waitForTimeout(150);
      const before = await chip.boundingBox();
      await chip.tap();                             // ここが1タップ目
      await waitVerdict(page);
      const after = await page.locator("#scope").boundingBox();
      must((await page.locator("#chipName").textContent()).trim().length > 0,
        "クイック選択の1タップ目が空振りしている");

      // (2) 検索候補。まっさらな状態から始めるため、入口に戻ってやり直す
      await page.goto(new URL("/", page.url()).href, { waitUntil: "domcontentloaded" });
      await page.click("#q");
      await page.fill("#q", "豊洲");
      await page.waitForSelector("#list .it", { timeout: 20000 });
      await page.waitForTimeout(400);
      const row = page.locator("#list .it").first();
      const y0 = Math.round((await row.boundingBox()).y);
      await row.tap();                              // ここが1タップ目
      await page.waitForTimeout(900);
      const picked = (await page.locator("#chipName").textContent()).trim();
      const y1 = Math.round((await page.locator("#list .it").first().boundingBox().catch(() => null))?.y ?? y0);
      must(picked.length > 0, `検索候補の1タップ目が空振りしている（y=${y0}→${y1}）`);

      return `クイック選択・検索候補とも1タップ目で通る（選択: ${picked}）`
        + `／チップ y=${Math.round(before.y)}・検索欄 y=${Math.round(after.y)}`;
    },
  },
  {
    // ⚠ 帯の8枚が全部同じURLで、押した年代が捨てられていた。
    //   「1987–90」を押しても着地は必ず 1936–42。押した絵と着いた絵が違う。
    // ⚠ 帯は「表示」から「操作」になった。押した年代がその場で大きくなること、
    //   着いたときに最古から始まること（看板の問いに写真で即答している状態）を見る。
    name: "帯を押すと、その年代が大きくなる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      const read = () => page.evaluate(() => ({
        on: [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")),
        pressed: [...document.querySelectorAll("#strip .f")]
          .filter((e) => e.getAttribute("aria-pressed") === "true").length,
        year: document.getElementById("yrBig")?.textContent.trim() ?? "",
        src: document.querySelector("#big .lyr.on .t")?.getAttribute("src") ?? "",
        years: [...document.querySelectorAll("#strip .yr")].map((e) => e.textContent.trim()),
      }));

      const a = await read();
      must(a.on === 0, `着いたときに左端（明治期）が選ばれていない: ${a.on} 番目`);
      await photoFrames(page).first().click();
      await page.waitForTimeout(500);
      must(a.pressed === 1, `選択状態が1つでない: ${a.pressed}`);
      must(a.year.includes(a.years[0]), `大きい写真の年代が帯と食い違う: 「${a.year}」/「${a.years[0]}」`);

      // 4枚目を押す
      const i = 4;
      await page.locator("#strip .f").nth(i).click();
      await page.waitForTimeout(600);
      const b = await read();
      must(b.on === i, `押した年代が選ばれていない: ${b.on} 番目`);
      // 1枚だと狭すぎて「この時点までにできていたもの」がほぼ空になる（実測 豊洲2件・浦安0件）
      must(await page.locator("#big .lyr.on .t").count() === 4,
        `写真の年代が 2×2 で組まれていない: ${await page.locator("#big .lyr.on .t").count()} 枚`);
      must(b.pressed === 1, `選択状態が1つでない: ${b.pressed}`);
      must(b.src !== a.src, `写真が切り替わっていない: ${b.src}`);
      must(b.year.includes(b.years[i]), `年代の見出しが押した年代でない: 「${b.year}」/「${b.years[i]}」`);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      // ⚠ 別ページへ渡す行はもう無い（/eras を撤去した）。年代の切り替えはこの画面で完結する
      must(await page.locator('#list a[href*="eras"]').count() === 0,
        "撤去した /eras への導線が残っている");
      return `最古から始まり、4枚目を押して「${b.year.replace(/\s+/g, " ")}」に切り替わる`;
    },
  },
  // ---- eras が、無いものを有ると言わないこと ----
  // ⚠ 利用者役のエージェントに触らせて見つけた。どちらも 掟: 取れなかったを「無い」と言わない の中核違反で、
  //   しかも「取れなかった」ではなく「**そもそも存在しない**」を有ると言う側の壊れ方。
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
      await page.waitForTimeout(500);
      const moved2 = ticks.filter((t) => t === "era.moved").length;
      must(moved2 === 2, `場所を変えても数え直していない: ${moved2} 件`);

      // ⚠ 3D を開いたことを数えるのは peel.html 側。以前はこの導線で数えていたが、
      //   共有された URL を踏んだ人が計測から消えていた。両方で数えると、
      //   導線から来た人だけ 2 回になる。ここで見たいのは「**合計で 1 回**」。
      //   ⚠ 修飾キー付きの click は使わない。macOS では新しいタブで開いて遷移せず、
      //     Linux では遷移する。**同じ検査が OS で別のものを測っていた**（CI で発覚）。
      //     普通に押して遷移させれば、どちらでも同じものを測れる。
      await page.locator('#list a[href^="./peel"]').first().click();
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
      await page.waitForTimeout(700);
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
      await page.waitForTimeout(900);
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
      await page.waitForTimeout(600);
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

      const deep = () => reqs.filter((u) =>
        /cyberjapandata\.gsi\.go\.jp\/xyz\/\w+\/(1[7-9])\//.test(u)).length;
      must(deep() === 0, `寄る前から高いズームのタイルを取っている: ${deep()} 件`);

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
      await page.waitForTimeout(900);
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
      await page.waitForTimeout(800);
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
  // ---- 押しても何も起きないものを無くす／本命を埋もれさせない ----
  // ⚠ すべて利用者役のエージェントの実測から。押せそうに見えて無反応なものは、
  //   「押しても何も起きない導線を置かない」（掟: 取れなかったを「無い」と言わない）に真っ向から反する。
  {
    name: "押せそうなものは、押すと何かが起きる", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);

      // (1) ☆ を押したら、記録のパネルが**見えるところ**に出ること
      await page.click("#mineToggle");
      await page.waitForTimeout(500);
      const mine = await page.$eval("#mine", (e) => {
        const r = e.getBoundingClientRect();
        return { y: Math.round(r.y), h: Math.round(r.height), inView: r.y < innerHeight && r.bottom > 0 };
      });
      must(mine.h > 0 && mine.inView,
        `☆を押しても、記録のパネルが画面の外にいる: ${JSON.stringify(mine)}`);
      await page.click("#mineToggle");

      // (2) バッジを押したら、根拠が開いて、その事実のところへ行くこと
      must(!(await page.locator("#result").isVisible()), "根拠が既定で開いている");
      const badges = await page.locator("#verdict .badge").count();
      must(badges >= 2, `バッジが出ていない: ${badges}`);
      const key = await page.locator("#verdict .badge").first().getAttribute("data-k");
      await page.locator("#verdict .badge").first().click();
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      must(await page.locator("#result").isVisible(), "バッジを押しても根拠が開かない");
      if (key) must(await page.locator(`#own .card[data-k="${key}"]`).count() === 1,
        `バッジに対応する根拠のカードが無い: ${key}`);
      await page.click("#closeWhy");
      await page.waitForTimeout(300);

      // (3) 打っていないときに、店のカテゴリを並べない（本命が埋もれる）
      const rows = await rowsOf(page);
      const shops = rows.filter(([, label]) => /ごはん|ラーメン|カフェ|居酒屋|スーパー|コンビニ/.test(label));
      must(shops.length === 0, `打っていないのに店が並んでいる: ${shops.map((r) => r[1]).join("・")}`);
      // ただし打てば出る（ランチャーとしての機能は失っていない）
      await page.fill("#q", "ラーメン");
      await page.waitForTimeout(400);
      const typed = await rowsOf(page);
      must(typed.some(([, label]) => /ラーメン/.test(label)), "打っても店が出てこない");
      await page.fill("#q", "");
      await page.waitForTimeout(400);

      // (4) 本命（3D）が、外部リンクと同じ顔で埋もれていないこと
      const peel = await page.evaluate(() => {
        const el = [...document.querySelectorAll("#list .it")]
          // ⚠ 語で探さない。名乗りは実装に合わせて変わる（「時間をさかのぼる（3D）」→「立体で見る」）。
          //   この検査が見たいのは「本命の行が埋もれていないか」なので、行き先で探す
          .find((e) => (e.getAttribute("href") ?? "").startsWith("./peel"));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { y: Math.round(r.y + scrollY), own: el.classList.contains("own"),
                 h: Math.round(r.height) };
      });
      must(peel, "3D への行が見つからない");
      must(peel.own, "本命が、外部へ渡すだけの行と同じ見た目になっている");
      must(peel.y < 1043, `本命が埋もれている: y=${peel.y}（以前の実測 1043 より下）`);
      return `☆は y=${mine.y} に開く／バッジ ${badges} 個から根拠へ／店は打つまで出ない／`
        + `立体で見るは y=${peel.y}（実測 1043 → 改善）`;
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
      const shown = await page.evaluate(() => ({
        verdict: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        era: document.getElementById("yrBig")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        rows: [...document.querySelectorAll(".ev-it .ev-l")].map((e) => e.textContent.trim()),
      }));
      must(said.includes(shown.verdict), `判定文を読んでいない: 「${said}」`);
      for (const r of shown.rows.slice(0, 3))
        must(said.includes(r), `画面に出ている行を読んでいない: ${r}`);
      // ⚠ 無くなったものは、無くなったと読むこと。
      //   画面が取り消し線で「無くなった」と出しているのに、声が「できた」と言わない
      if (shown.rows.includes("○○百貨店"))
        must(/○○百貨店が無くなり/.test(said) || /2020年に、○○百貨店/.test(said),
          `画面は「無くなった」なのに、声がそう言っていない: 「${said}」`);
      // ⚠ 画面に無いものを喋らない。作文の混入をここで止める
      const invented = ["このころ", "でしょう", "と思われ", "だったようです", "栄え", "賑わ"];
      for (const w of invented) must(!said.includes(w), `作文が混ざっている: 「${w}」`);

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
  // ---- 判定を待つあいだ、何を見せているか ----
  // ⚠ 実測（3G相当）で、住所を選んでから **2.6秒、文字だけ**だった。
  //   座標は選んだ瞬間に分かっているので、現在の写真は判定を待たずに出せる。
  //   待ち時間が「何も無い」から「いまのその場所を見ている」に変わる。
  {
    name: "判定を待つあいだ、現在の写真を先に見せる", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    // 判定（地形分類）だけを遅らせて、待っている最中の画面を捕まえる
    setup: (page) => page.route("**/experimental_landformclassification*/**", async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      await r.continue();
    }),
    async check(page) {
      await page.waitForSelector("#quick button");
      await page.locator("#quick button", { hasText: "豊洲" }).click();

      // 判定が終わる前に、骨組みと写真が出ていること
      await page.waitForSelector(".strip.skel", { timeout: 5000 });
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length === 4 && t.some((e) => e.complete && e.naturalWidth > 0);
      }, null, { timeout: 8000 });
      const during = await page.evaluate(() => ({
        skel: !!document.querySelector(".strip.skel"),
        photo: [...document.querySelectorAll("#big .lyr.on .t")].filter((e) => e.naturalWidth > 0).length,
        yr: document.querySelector(".yr-big")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        text: document.getElementById("verdict")?.textContent.replace(/\s+/g, " ").trim() ?? "",
      }));
      must(during.skel, "待っているあいだ、帯の骨組みが出ていない");
      must(during.photo >= 1, "待っているあいだ、写真が1枚も出ていない");
      // ⚠ 出しているのは「現在」だと名乗る。判定前の写真を、判定の答えのように見せない
      must(/現在/.test(during.yr), `待っているあいだの写真が何なのか書いていない: ${during.yr}`);
      must(/判定中/.test(during.text), `判定中であることが書かれていない: ${during.text.slice(0, 40)}`);
      // ⚠ まだ答えていないのに、答えたように見せない
      for (const w of LIES) must(!during.text.includes(w), `判定前に断定している: 「${w}」`);

      // 判定が届いたら、ちゃんと本番の帯に入れ替わること
      await waitVerdict(page, 30000);
      await waitStrip(page);
      must(!(await page.locator(".strip.skel").count()), "判定が出たのに骨組みが残っている");
      must(await page.locator("#strip .f").count() >= 4, "判定が出たのに帯が並んでいない");
      return `待機中: 骨組み＋写真 ${during.photo}/4 枚（「${during.yr}」）→ 判定後に帯へ差し替わる`;
    },
  },
  // ---- フッターは、置かないと嘘になるものだけ ----
  // ⚠ 「画面が通信した先が、全部フッターに書いてある」ことを機械で見る。
  //   Wikidata を実行時に叩くようにしたとき、**フッターを直し忘れていた**。
  //   依存を足すたびに人が思い出すのでは、いつか必ず落ちる。
  {
    name: "通信した先が、全部フッターに書いてある", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForTimeout(1500);
      const foot = (await page.locator("footer").textContent()).replace(/\s+/g, " ");

      // 実際に出ていった先（自分のオリジンを除く）
      const hosts = [...new Set(reqs.map((u) => { try { return new URL(u).host; } catch { return ""; } })
        .filter((h) => h && !/127\.0\.0\.1|localhost/.test(h)))];
      const NAME = { "cyberjapandata.gsi.go.jp": "国土地理院", "maps.gsi.go.jp": "国土地理院",
        "msearch.gsi.go.jp": "国土地理院", "query.wikidata.org": "Wikidata" };
      const missing = hosts.filter((h) => {
        const n = NAME[h];
        if (!n) return true;                 // 名前を決めていない先が増えたら、まず気づく
        return !foot.includes(n);
      });
      must(missing.length === 0, `フッターに書かれていない通信先がある: ${missing.join(", ")}`);

      // ⚠ **主語のない「送りません」を書かせない。**
      //   ここは以前 `/こちらのサーバーには送りません/` を**必須にしていた**。
      //   ところがそれは事実でなかった（調べた場所は URL に載り、開けば配信元へ届く）。
      //   ⚠ **検査が、誤った説明を固定していた。**「検査が通った」ではなく
      //   「そのテストは本当にその主張を検証しているか」を見る、の典型例。
      must(!/(こちらの)?サーバーには送りません/.test(foot),
        "主語のない「サーバーには送りません」が残っている"
        + "（調べた場所は URL に載り、開けば配信元へ届く。事実でない）");
      // ⚠ 文言そのものに縛らない（読点1つで落ちると、直すたびに検査を書き換えることになる）。
      //   見たいのは「4 つのことが書いてあるか」。
      const facts = [
        // ⚠ **「地名か座標」で通さない。** 片方だけ書いても通っていた（2026-08-15 に指摘）。
        [/計測に[はも、]?[^。]*地名[^。]*座標[^。]*送りません/, "計測に地名と座標の両方を送らないこと"],
        // ⚠ 配信元には届く。ここを書かないと、上の1行が言い切りすぎになる。
        [/IP/, "接続元の IP が配信元に届くこと"],
        [/URL|アドレス欄/, "調べた場所が URL に載ること"],
        [/(Cloudflare|配信).*(届|渡)/, "その URL を開くと配信元へ届くこと"],
        [/Cookie/, "Cookie を使わないこと"],
        [/提供元に[はも、]?.*座標が渡り/, "提供元に座標が渡ること（「どこにも送らない」は嘘になる）"],
      ];
      const notWritten = facts.filter(([re]) => !re.test(foot)).map(([, n]) => n);
      must(!notWritten.length, `プライバシーの説明に書かれていないことがある: ${notWritten.join("、")}`);
      must(!/一切送っていません/.test(foot), "言い切りが残っている（提供元には渡っている）");
      // 出典表示は利用の条件（地理院）とライセンス上の義務（OSM）
      for (const n of ["国土地理院", "OpenStreetMap"])
        must(foot.includes(n), `出典が消えている: ${n}`);
      // ⚠ いちばん強い約束だけは畳まない（このサービスの性格そのもの）。
      //   残りは details に入れてよいが、**これは開かなくても読めること**。
      const shown = (await page.locator("footer .f-priv").textContent()).replace(/\s+/g, " ");
      must(await page.locator("footer .f-priv").isVisible(), "プライバシーの記述が畳まれている");
      must(/計測に[はも、]?[^。]*地名[^。]*座標[^。]*送りません/.test(shown),
        `畳まずに見える場所から、いちばん強い約束が消えている: ${shown}`);
      must(/Cookie/.test(shown), `Cookie を使わないことが、畳まずに見える場所に無い: ${shown}`);
      // ⚠ 「保存しません」に弱めない。計測に関しては、そもそも送っていない（/t は固定文字列だけ）
      must(!/保存しません|保存していません/.test(shown),
        "「送りません」を「保存しません」に弱めている（送ってはいる、と読める）");
      return `通信先 ${hosts.length} 種すべて記載（${hosts.join("・")}）／説明 ${facts.length} 点`;
    },
  },
  // ---- /eras にしか無かった3つを、トップへ ----
  {
    name: "地図の上を押すと、その地点を判定し直す", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const before = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search }));
      // 地図を出す
      await page.locator("#zIn").click();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      // 中心から離れたところを押す
      const box = await page.locator("#big").boundingBox();
      await page.mouse.click(box.x + box.width * 0.22, box.y + box.height * 0.28);
      await page.waitForFunction((t) => {
        const v = document.getElementById("verdict")?.textContent ?? "";
        return v.length > 0 && !v.includes("判定中") && location.search !== t;
      }, before.url, { timeout: 45000 });
      // 地図は要素ごと描き直されるので作り直しになる。**戻ってくること**を待つ
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 }).catch(() => {});
      const after = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search, map: !!document.querySelector("#big.map-on") }));
      must(after.url !== before.url, `押しても座標が変わっていない: ${after.url}`);
      must(after.text.length > 0, "押したあと判定文が消えている");
      // ⚠ 地図を壊さない。壊すと押した場所を見失う
      must(after.map, "判定し直したら地図が消えた（押した場所を見失う）");
      return `座標が ${before.url.slice(0, 28)}… → ${after.url.slice(0, 28)}…／地図は残る`;
    },
  },
  {
    name: "年代を順に流せる／明治期の水域を重ねられる", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const at = () => page.evaluate(() =>
        [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")));
      // ▶ で年代が進むこと
      must(await at() === 0, "着いたときに左端が選ばれていない");
      await page.click("#playBtn");
      await page.waitForFunction(() => {
        const i = [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on"));
        return i >= 2;
      }, null, { timeout: 20000 });
      must(await page.locator("#playBtn.on").count() === 1, "流している最中だと分からない");
      await page.click("#playBtn");                     // 止める
      await page.waitForTimeout(400);
      must(await page.locator("#playBtn.on").count() === 0, "止められない");
      const stopped = await at();
      await page.waitForTimeout(1800);
      must(await at() === stopped, `止めたのに進んでいる: ${stopped} → ${await at()}`);

      // 明治期の水域を重ねられること（判定できた土地でだけ出す）
      must(await page.locator("#ovSwale").count() === 1, "明治期の水域を重ねる操作が無い");
      // ⚠ ここは長いあいだ、**何も測らずに「水域の重ねあり」と報告していた**。
      //   代入した値をどこにも使わない行が置いてあるだけで、assertion が無かった。
      //
      //   ⚠ 通信では測れない。**タイルは不透明度 0 でも取りに行く**
      //     （peel で 556→138 枚に落としたときに分かったのと同じ話）。実測で、
      //     `raster-opacity` を 0 固定に壊してもタイルの枚数は変わらず、検査は通った。
      //   ⚠ 「重ねる前」と「重ねた後」を比べるのも駄目。この操作は**地図そのものを出す**ので、
      //     層が死んでいても地図が現れたぶんだけ画面が変わり、やはり通る（これも実測で通った）。
      //   → 地図が出た状態のまま、**重ねを入り切りして**比べる。これで層だけを切り分けられる。
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await page.waitForTimeout(2500);
      const shotOn = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1800);
      const shotOff = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(1200);
      must(!shotOn.equals(shotOff),
        "重ねを入り切りしても、画面が1バイトも変わらない（層が効いていない）");
      return `▶ で ${stopped} 番目まで進んで止まる／重ねの入り切りで画面が変わる`
        + `（入 ${shotOn.length} B／切 ${shotOff.length} B）`;
    },
  },
  {
    // 明治期のデータが無い土地では、重ねるものが無い
    name: "明治期が無い土地では、重ねる操作を出さない", path: `/?${SAPPORO}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(800);
      const m = await page.locator("#verdict .badge").allTextContents();
      const hasMeiji = m.some((t) => /明治期: (?!.*(なし|データ))/.test(t));
      // ⚠ 以前は assertion が if の中にしか無く、hasMeiji が true に転ぶと
      //   **1つも確かめないまま「対象外」と報告して緑**になった（2026-08-14 検証者の指摘）。
      //   しかも判定はバッジの文面への正規表現なので、**文言を変えるだけで静かに無効化**される。
      //   → この土地に明治期が無いこと自体を、まず確かめる。前提が消えたら落とす。
      must(!hasMeiji,
        `この土地に明治期のデータが出ている。検査の前提が消えた（バッジ: ${m.join(" / ")}）`);
      must(await page.locator("#ovSwale").count() === 0,
        "明治期のデータが無いのに、重ねる操作が出ている");
      return `明治期なし（バッジ ${m.length} 個）／重ねる操作を出していない`;
    },
  },
  {
    // ⚠ 待たせ続けない。以前は 45秒 × 2エンドポイント × 2周 で、最悪 180秒
    //   「建物を取得中…」のままだった。Overpass が落ちること自体は前提で、
    //   問題は「いつ諦めるかを決めていなかった」こと。
    // ⚠ 建物を取り込んでいない土地で見る。亀戸は豊洲の取り込み（z14 6枚）に
    //   含まれてしまい、Overpass の経路を通らなくなった
    name: "建物が取れないとき、待たせ続けない", path: `/peel?${URAYASU}`,
    // ⚠ glob にしない。`**://*.overpass*/**` は overpass-api.de にも
    //   overpass.kumi.systems にも**一度もマッチしていなかった**（どちらも先頭の
    //   ラベルが overpass なので `*.` の前に置くものが無い）。
    //   実際には Overpass が応答して 6,439件取れており、この検査は
    //   「待たせ続けない」を一度も確かめていなかった。URL で見る。
    setup: (page) => page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    async check(page) {
      // ⚠ 起点はページ読み込みではなく「建物を待ち始めた瞬間」。
      //   先に水域の判定（亀戸で1048面）があり、混んだ環境ではそこだけで時間を食う。
      //   見たいのは **待ち始めてから諦めるまで**。
      // ⚠ 一瞬の状態をスナップショットで読まない。**出るべき文言そのもの**を待つ。
      //   「建物を取得中」を待ってから innerText を読むと、読んだ時点では
      //   次の状態に移っていることがある（実際に取りこぼした）。
      await page.waitForFunction(() => /最大20秒|取れなければ/.test(document.body.innerText),
        null, { timeout: 60000 });
      const t0 = Date.now();


      // 期限内に、取れなかったと言い切ること
      await page.waitForFunction(() => /取得できませんでした/.test(document.body.innerText),
        null, { timeout: 60000 });
      const ms = Date.now() - t0;
      must(ms < 30000, `諦めるのが遅い: 待ち始めてから ${ms}ms`);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // 取れなかっただけで、画面は成立していること
      must(/水域と空中写真だけで表示/.test(t), `代わりに何が見られるか書いていない: ${t.slice(0, 160)}`);
      must(await page.locator("canvas").count() > 0, "地図まで出なくなっている");
      for (const w of LIES) must(!t.includes(w), `建物が取れないだけで断定している: 「${w}」`);
      return `${Math.round(ms / 1000)} 秒で諦めて「取得できませんでした」／水域と写真は出ている`;
    },
  },
  // ---- 取り込み済みの土地では、外へ出ない ----
  // ⚠ 実行時に Wikidata を叩くのをやめるための取り込み。効いていることを機械で見る。
  {
    name: "取り込み済みの土地では、Wikidata を叩かない", path: `/?${TOYOSU}`,
    // 叩いたら分かるように、外向きは落としておく（落ちても静的で答えられるはず）
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      await page.locator("#strip .f").last().click();       // 現在
      await page.waitForTimeout(900);

      // 外へ出ていないこと
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length === 0,
        "取り込み済みなのに Wikidata を叩いている");
      // それでも中身が出ていること
      const rows = await page.$$eval(".ev-it .ev-l", (els) => els.map((e) => e.textContent.trim()));
      must(rows.length > 0, "取り込んだはずの土地で、一覧が空");
      // 出典は項目ごとに持っている（根拠を出す作法）
      const note = (await page.locator(".ev-src").textContent()).replace(/\s+/g, " ");
      must(/Wikidata/.test(note), "出典が書かれていない");
      return `Wikidata への通信 0 件／一覧 ${rows.length} 件（${rows.slice(0, 2).join("・")}）`;
    },
  },
  {
    // ⚠ ここが穴1の再発点。配り方を z12 に束ねたので、
    //   「束のファイルはある」が「その z14 は見ていない」という状態が生まれる。
    //   束があることを理由に答えてしまうと、**見ていない地面について断定する**。
    //   実測で選んだ点: 束 3588/1626 は mask に1ビットしか立っておらず、
    //   z14 14352/6504 は一度も問い合わせていない（大阪・此花の隣）。
    name: "束はあっても、見ていない区画では答えない",
    path: "/?ll=34.73258,135.36255&q=%E6%9C%AA%E8%A6%8B%E3%81%AE%E5%8C%BA%E7%94%BB",
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期のコマは年で絞れないので、写真の年代へ移ってから見る
      await photoFrames(page).first().click();
      await page.waitForTimeout(900);
      // 束のファイルは取りに行ってよいが、**それを答えにしない**
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "見ていない区画なのに、束があることを理由に答えている");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `見ていない地面について断定している: 「${w}」`);
      return `束はあるが未問い合わせ → 外へ出て、落ちているので「分かっていません」`;
    },
  },
  {
    // ⚠ 「取り込んでいない」と「調べたが無い」を混ぜない
    name: "未整備の土地では、取り込み済みのふりをしない", path: `/?${UNSURVEYED}`,
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 未整備なので外へ出る（そして落としてあるので、取れなかったと言うはず）
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "未整備なのに外へ取りに行っていない（静的の欠けを、答えとして出している）");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `断定している: 「${w}」`);
      return `未整備なので外へ出る → 落ちているので「分かっていません」`;
    },
  },
  // ---- 記録の精度どおりに書く ----
  // ⚠ 「20世紀」は timeValue が 1900-01-01。年として扱うと、1985年築のものが
  //   「1936年に在った」と出る。docs が過去の事故として名指ししている型。
  //   静的・実行時のどちらの経路でも同じ答えになること。
  {
    name: "世紀・年代の記録を、点の年として言い切らない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(31, "テスト20世紀の塔", 1900, null, 139.7981, 35.6545, 7),
      wdItem(32, "テスト1950年代の館", 1950, null, 139.7969, 35.6556, 8),
      wdItem(33, "テスト1930年の橋", 1930, null, 139.7986, 35.6541, 9),
      wdItem(34, "テスト1970年代の駅", 1970, null, 139.7975, 35.6549, 8),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();            // 1936–42
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rows = await page.$$eval(".ev-row", (els) => els.map((e) => ({
        y: e.querySelector(".ev-y")?.textContent.trim() ?? "",
        l: e.querySelector(".ev-l")?.textContent.trim() ?? "" })));
      const has = (t) => rows.find((r) => r.l.includes(t));
      // 1930年の橋は 1936年までに確実にできている
      must(has("1930年の橋"), `年の記録が出ていない: ${JSON.stringify(rows)}`);
      // ⚠ 20世紀（1900〜1999）は 1936年時点で「あった」と言い切れない
      must(!has("20世紀の塔"),
        `世紀の記録を、1936年に在ったものとして出している: ${JSON.stringify(rows)}`);
      // ⚠ 1950年代（1950〜1959）も同様
      must(!has("1950年代の館"), `年代の記録を、1936年に在ったものとして出している`);
      // 出てくる年代では、年の書き方が精度どおりであること（1961–69 → 1974–78 の差分）
      await photoFrames(page).nth(3).click();
      await page.waitForFunction(() => !/調べています/.test(
        document.getElementById("ev")?.textContent ?? ""), null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const now = await page.$$eval(".ev-row", (els) => els.map((e) => ({
        y: e.querySelector(".ev-y")?.textContent.trim() ?? "",
        l: e.querySelector(".ev-l")?.textContent.trim() ?? "" })));
      const d = now.find((r) => r.l.includes("1970年代の駅"));
      must(d, `1974–78 の差分に 1970年代の記録が出ていない: ${JSON.stringify(now)}`);
      must(/年代/.test(d.y), `10年の記録を「${d.y}」と書いている（精度どおりでない）`);
      return `1936年: ${rows.map((r) => r.y).join(",") || "なし"}／`
        + `1974–78: ${now.map((r) => r.y).join(",")}`;
    },
  },
  {
    // ⚠ 枠の外にあるものを「この範囲にあったもの」に並べない。
    //   実測で、経度999/緯度91 の項目が並び、印は1つも打たれなかった
    //   （「一覧に出したものには必ず印がある」という不変条件も同時に崩れる）
    name: "枠の外にあるものを、この範囲のものとして出さない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(41, "テスト枠内", 1930, null, 139.7981, 35.6545),
      wdItem(42, "テスト範囲外A", 1900, null, 999, 91),
      wdItem(43, "テスト範囲外B", 1901, null, -181, -95),
      wdItem(44, "テスト少しだけ外", 1920, null, 139.86, 35.72),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rows = await page.$$eval(".ev-l", (els) => els.map((e) => e.textContent.trim()));
      for (const bad of ["範囲外A", "範囲外B", "少しだけ外"])
        must(!rows.some((r) => r.includes(bad)), `枠の外のものを出している: ${bad}`);
      // 一覧に出したものには必ず印がある
      const pins = await page.locator("#pins .pin").count();
      must(pins === rows.length, `一覧 ${rows.length} 件に対して印 ${pins} 個`);
      return `枠内 ${rows.length} 件だけ／印 ${pins} 個`;
    },
  },
  // ---- 共有カードの中身を見る ----
  // ⚠ これまで「1200x630 であること」しか見ておらず、**中身は一度も見ていなかった**。
  //   そのため「1件も読めていないカードに『…を実測』と書く」も
  //   「粗いのに粗いと書かない」も、壊しても検査は緑のままだった（QA が実証）。
  //   canvas の文字は読めないので、描いた文字列を横から控える。
  {
    name: "取れなかったカードに「実測」と書かない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await waitVerdict(page);
      const said = await page.evaluate(() => {
        const drawn = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          drawn.push(String(t)); return orig.call(this, t, ...a);
        };
        try { window.KonjakuShare.draw(window.__facts ?? null, "豊洲"); } catch { /* 下で拾う */ }
        CanvasRenderingContext2D.prototype.fillText = orig;
        return drawn;
      }).catch(() => null);
      // facts を窓に出していないので、共有ボタン経由で描かせる
      const drawn = await page.evaluate(() => new Promise((res) => {
        const out = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          out.push(String(t)); return orig.call(this, t, ...a);
        };
        const done = () => { CanvasRenderingContext2D.prototype.fillText = orig; res(out); };
        document.getElementById("shareBtn")?.click();
        setTimeout(done, 1500);
      }));
      const text = drawn.join(" ");
      must(text.length > 0, "共有カードに文字が描かれていない");
      // ⚠ 1件も読めていないのに「実測」と名乗らない
      must(!/実測/.test(text), `読めていないのに「実測」と書いている: ${text.slice(0, 120)}`);
      must(/読み込めませんでした/.test(text),
        `読めなかったことがカードに書かれていない: ${text.slice(0, 120)}`);
      return `カードの文字「${text.slice(0, 60)}…」／「実測」なし`;
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
  {
    // ⚠ 掟: 取れなかったを「無い」と言わない の根。写真だけ落ちたときに「残っていない」と言い換えたら落ちること。
    //   QA が「書き換えても検査は緑」と実証した箇所
    name: "写真だけ落ちたとき、「残っていない」と言わない", path: `/?${TOYOSU}`,
    // ⚠ glob に `(a|b)` の交替は無い（`{a,b}` はある）。この形は
    //   **1本も遮断していなかった**＝この検査は一度も走っていない（2026-08-14 検証者が実証）。
    //   Overpass の `**://*.overpass*/**` でまったく同じ型を踏んでいる。
    //   → URL の述語で見る。そして**実際に落ちたことを数える**。
    setup: (page) => { page.__blocked = 0;
      return page.route((u) => /cyberjapandata\.gsi\.go\.jp\/xyz\/(ort_|gazo|seamlessphoto)/.test(u.href),
        (r) => { page.__blocked++; r.abort(); }); },
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(1200);
      const v = (await page.locator("#verdict").textContent()).replace(/\s+/g, " ");
      // ⚠ そもそも落とせているか。落とせていなければ、この検査は何も確かめていない
      must(page.__blocked > 0,
        "写真を1本も落とせていない（経路の書き方が効いていない＝この検査は空振り）");
      // 判定そのものは出ていること（写真が落ちただけ）
      must(/旧水部|盛土地/.test(v), `判定まで巻き添えになっている: ${v.slice(0, 60)}`);
      // ⚠ 「残っていない」「無い」と言い換えない
      must(!/残っていない|残っていません/.test(v),
        `取れなかったのに「残っていない」と言っている: ${v.slice(0, 120)}`);
      must(/読み込めませんでした/.test(v),
        `読み込めなかったことを言っていない: ${v.slice(0, 120)}`);
      for (const w of LIES) must(!v.includes(w), `断定している: 「${w}」`);
      return `判定は出る／「読み込めませんでした」／「残っていない」なし`;
    },
  },
  // ---- 建物を取り込み済みの土地では、外へ出ない ----
  // ⚠ タイルは z14 の全面なので、集計したい範囲より広い。そのまま数えると
  //   「豊洲の建物の◯%」が豊洲でない範囲の割合になる（実測で 99.4% → 40.9% に化けた）。
  //   peel は元から「見た範囲と主張の範囲を一致させる」を守っている。壊さない。
  {
    name: "建物が取り込み済みなら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1000);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      must(reqs.filter((u) => /\/data\/bl\//.test(u)).length > 0, "建物タイルを読んでいない");
      // ⚠ 集計範囲が広がっていないこと。豊洲は 99% 台のはず
      const pct = Number((t.match(/(\d+\.\d)\s*%/) ?? [])[1]);
      must(pct >= 95, `集計範囲が広がっている（豊洲で ${pct}%。隣の街区が混ざっている）`);
      // いつ取り込んだ結果かを言うこと
      must(/建物を取り込んだのは \d{4}-\d{2}-\d{2}/.test(t),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      must(/事前に取り込んだデータ/.test(t), "取り込み済みだと書かれていない");
      return `Overpass 0 件／${pct}%／取り込み日あり`;
    },
  },
  {
    // ⚠ 共有は唯一の指標。共有された URL を踏んだ人が数から消えると、
    //   「共有されたが誰も踏まなかった」と「踏まれたが数えていなかった」を区別できない。
    name: "共有された 3D の URL を踏んだ人も、1回だけ数える", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // 直接開いている（トップの導線を通っていない）
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const t = reqs.filter((u) => /\/t(\?|$)/.test(u));
      must(t.length === 1, `直接開いたのに ${t.length} 回数えている（1回であること）`);
      return `直接開いて /t 1 回`;
    },
  },
  {
    // ⚠ 着いたときの帯の既定は最古＝明治期で、明治期には年が無い。
    //   つまり**初めて来た人が最初に見る事物の枠は、必ずこの注記**だった。
    //   実測（UI/UX・2026-08-14）: 30秒のあいだ「このころ何があった？」が
    //   一度も画面に現れていなかった。説明だけを置いて、次の一歩が無かった。
    name: "明治期に着いた人に、次の一歩がある", path: `/?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。PC では1行に収まって 34px になり、44px の判定が意味を失う
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const era = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(era === "明治期", `着いたときが明治期でない（この検査の前提が消えた）: ${era}`);

      const step = page.locator("#evStep");
      must(await step.count() === 1, "明治期に着いたのに、次の一歩が無い");
      // ⚠ 指で押せる大きさ。ここは初めて来た人が最初に触る唯一の一歩
      const h = await step.evaluate((e) => e.getBoundingClientRect().height);
      must(h >= 44, `一歩が指で押すには小さい: ${Math.round(h)}px`);
      // ⚠ 年を当てない、という判断は変えていないこと
      const t = (await step.textContent()).replace(/\s+/g, " ");
      must(/年がありません/.test(t), `明治期に年が無いことを言っていない: ${t}`);

      // ⚠ ここが本体。**押した先が空でないこと**。
      //   最初の写真の年代へ送っていた版は、豊洲で 0 件だった（埋立前なので当然）。
      //   「押しても何も起きない一歩」を置かない
      await step.click();
      await page.waitForTimeout(1200);
      const after = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(after !== "明治期", `押しても年代が動いていない: ${after}`);
      const rows = await page.$$eval("#ev .ev-it .ev-l", (els) => els.length);
      must(rows > 0, `押した先が空（${after} で 0 件）。中身のある年代へ送ること`);
      return `明治期 → ${after} で ${rows} 件／一歩 ${Math.round(h)}px`;
    },
  },
  {
    // ⚠ 過去の年代では、**年と同じくらいの強さで**「重ねている」と言うこと。
    //   実測（2026-08-14 利用者役のエージェントによる検証）: 広島 1945–50（原爆直後の焼け野原）の上に
    //   現在の3,555棟が立ち、広島の利用者は最初の3秒「1945年の広島」だと読んだ。
    //   判別できた人の根拠は**画面ではなく自分の歴史知識**だった。
    //   ⚠ 半透明で薄れさせない。0.80 で瓦礫が建物ごしに透け、「消えかけの幽霊」
    //     「広島の人間には見せられない」と言われた。**別物として重ねる**ほうがよい。
    name: "過去の写真の上では、いまの街を重ねていると言う",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1800);
      const at = async (v) => { await page.$eval("#t", (e, v) => {
          e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1600);
        return page.evaluate(() => {
          const y = document.querySelector("#era .y"), o = document.getElementById("over");
          const fs = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
          return { year: y.textContent.trim(), yFs: fs(y),
            over: (o?.textContent ?? "").trim(), oFs: fs(o),
            op: map.getPaintProperty("bld", "fill-extrusion-opacity") };
        }); };

      // 現在は「重ねている」ではない（地面も建物もいま）
      const now = await at(0);
      must(now.over === "", `現在なのに重ねていると言っている: ${now.over}`);

      // 過去は必ず言う
      const past = await at(600);
      must(past.over.length > 0, `過去の年代なのに、重ねていることを言っていない（${past.year}）`);
      must(/いま/.test(past.over), `いまの街だと言っていない: ${past.over}`);
      must(past.over.includes(past.year), `どの年代の地面かを言っていない: ${past.over}`);
      // ⚠ 年に対して小さすぎると「言い切っている」ことにならない（以前は 60:12 で5倍）
      must(past.yFs / past.oFs <= 3.0,
        `年 ${past.yFs}px に対して重ねの文が ${past.oFs}px（3倍以内であること）`);
      // ⚠ 幽霊にしない
      must(typeof past.op !== "number" || past.op >= 0.9,
        `過去の年代で建物が薄れている（不透明度 ${past.op}）。消えかけに見える`);

      // 明治期は建物が消えるので、建物の話をしない
      const meiji = await at(800);
      must(meiji.over === "", `建物が1棟も無いのに重ねていると言っている: ${meiji.over}`);
      return `現在=無／${past.year}=「${past.over.slice(0, 28)}」${past.yFs}:${past.oFs}px`;
    },
  },
  {
    // ⚠ 建物が1棟も見えていないとき（明治期の端）は、建物の話をしない。
    //   実測（2026-08-14）: 明治期では全建物の高さが 0 になり1棟も見えないのに、
    //   「建物は…件が推定」「建物を押すと分かります」が出続け、
    //   **見えない建物が押せた**（4か所試して 4/4 でカードが出た）。
    //   利用者は「幽霊」「気持ち悪い」と言った。
    name: "見えていない建物の話をしない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const set = async (v) => { await page.$eval("#t", (e, v) => {
        e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1800); };
      const read = () => page.evaluate(() => ({
        est: (document.getElementById("est")?.textContent ?? "").trim(),
        tip: (document.getElementById("tip")?.textContent ?? "").trim() }));
      const taps = async () => { let n = 0;
        for (const [x, y] of [[110, 260], [190, 300], [260, 240], [150, 380]]) {
          await page.evaluate(() => document.querySelectorAll(".pick-pop").forEach((e) => e.remove()));
          await page.mouse.click(x, y); await page.waitForTimeout(350);
          if (await page.locator(".pick-pop").count()) n++;
        } return n; };

      // 建物が立っている年代では、話をすること
      await set(0);
      const now = await read();
      must(/件が推定/.test(now.est), `建物が立っているのに但し書きが無い: ${now.est}`);
      must((await taps()) > 0, "建物が立っているのに押せない");

      // 明治期では、建物の話をしないこと
      await set(800);
      const meiji = await read();
      must(meiji.est === "", `建物が1棟も無いのに但し書きが出ている: ${meiji.est}`);
      must(meiji.tip === "", `建物が1棟も無いのに「押すと分かります」が出ている: ${meiji.tip}`);
      const ghost = await taps();
      must(ghost === 0, `見えない建物が押せる（4か所中 ${ghost} 件でカードが出た）`);
      return `現在は但し書きあり・押せる／明治期は但し書き無し・押しても出ない`;
    },
  },
  {
    // ⚠ 「位置を見る」を押した結果が、**画面に入っていること**。
    //   実測（2026-08-14・375×667）: 一覧を読んでいる位置から押すと、写真の枠は
    //   画面の 69px 上にあり、**見えている割合 0%** だった。
    //   利用者役のエージェント3体とも「何も起きない」「押せてないのかと思った」と言った。
    //   ⚠ 同じ症状を過去に静止画の経路では直してあり、そのコメントもすぐ下にあったのに、
    //     地図の経路だけ return していて手当てに届いていなかった。
    name: "行を押すと、寄った結果が画面に入る", path: `/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await page.waitForTimeout(1200);
      // 一覧を読んでいる位置（画面の真ん中）から押す
      await page.evaluate(() => document.querySelector(".ev-it")?.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      const seen = () => page.evaluate(() => {
        const r = document.getElementById("big").getBoundingClientRect();
        return { pct: Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
          / r.height * 100), zoom: document.getElementById("big").classList.contains("zoom") };
      });
      const before = await seen();
      const name = (await page.locator(".ev-it").first().locator(".ev-l").innerText()).trim();
      await page.locator(".ev-it").first().click();
      await page.waitForTimeout(1800);
      const after = await seen();
      must(after.zoom, "押しても寄っていない");
      // ⚠ ここが本体。寄っただけで見えていなければ、押しても何も起きないのと同じ
      must(after.pct >= 80, `寄った結果が画面に入っていない（見えているのは ${after.pct}%）`);
      // ⚠ 「寄った」だけでは足りない。実測（2026-08-14・利用者役のエージェント3体）: 押した行は
      //   画面から出ていき、17行中15行で**名前がどこにも残らなかった**。
      //   画面にはぼやけた写真と同じ色の丸が複数あるだけで、
      //   「動いたのは分かるが、何に寄ったのか分からない」と3体とも報告した。
      const fx = await page.evaluate(() => {
        const el = document.getElementById("fx");
        if (!el) return { there: false };
        const r = el.getBoundingClientRect();
        return { there: true, text: el.innerText.trim(),
          vis: getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0,
          size: parseFloat(getComputedStyle(el).fontSize) };
      });
      must(fx.there, "寄せた先に名前を出す枠(#fx)が無い");
      must(fx.vis, "寄せたのに、押したものの名前が画面に出ていない");
      must(fx.text.includes(name),
        `寄せた先の名前が押したものと違う: 押した「${name}」／出ている「${fx.text}」`);
      must(fx.size >= 12, `寄せた先の名前が小さい: ${fx.size}px`);
      // ⚠ 名前が年バッジを覆わないこと。
      //   実測（2026-08-15）: .fx を bottom:46px で別に置いていたら、sub を持つ年代
      //   （1936–42 陸軍撮影 / 1945–50 米軍撮影 / 現在 / 明治期 ＝ 9 コマ中 4 つ）で
      //   年バッジが 46px より高くなり、102×10px 覆っていた。
      //   「米軍撮影」は元から 11.5px で読みにくいのに、その上を隠していた。
      const lap = await page.evaluate(() => {
        const a = document.getElementById("fx").getBoundingClientRect();
        const c = document.querySelector(".yr-big").getBoundingClientRect();
        return { px: Math.round(Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top))),
          yr: document.querySelector(".yr-big").innerText.replace(/\s+/g, " ").trim() };
      });
      must(lap.px === 0, `寄せた先の名前が年バッジ「${lap.yr}」を ${lap.px}px 覆っている`);
      // ⚠ 押した印が、他の印と見分けられること。
      //   地図の印には data-i が付いておらず、実測で印 9 個に対し強調 0 個だった。
      // ⚠ 印は2組ある。静止画の上に打つ #pins の印と、地図の上の印。
      //   地図に切り替わっても #pins は消えないので、全部を1つに数えて
      //   「強調は1個」と書くと必ず落ちる（実測 印16個・強調2個で、これは正しい状態）。
      //   組ごとに「ちょうど1個」を見る。
      const pins = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".big .pin")];
        const g = { 写真: [], 地図: [] };
        for (const e of all) g[e.closest("#pins") ? "写真" : "地図"].push(e);
        return { noIdx: all.filter((e) => e.dataset.i === undefined).length, total: all.length,
          sets: Object.entries(g).filter(([, v]) => v.length)
            .map(([k, v]) => [k, v.length, v.filter((e) => e.classList.contains("on")).length]) };
      });
      must(pins.sets.length > 0, "印が1つも無い");
      must(pins.noIdx === 0, `番号(data-i)の無い印が ${pins.noIdx}/${pins.total} 個ある`);
      for (const [k, n, on] of pins.sets)
        must(on === 1, `${k}の印が強調されていない: ${n} 個中 ${on} 個`);
      // 戻したら、名前も強調も消える（前の年代の名前が写真の上に残らない）
      await page.click("#unzoom");
      await page.waitForTimeout(600);
      const back = await page.evaluate(() => ({
        fx: document.getElementById("fx").innerText.trim(),
        on: document.querySelectorAll(".big .pin.on,.ev-it.on").length }));
      must(!back.fx && back.on === 0,
        `全体に戻したのに残っている: 名前「${back.fx}」／強調 ${back.on} 個`);
      return `写真が見えている ${before.pct}% → ${after.pct}%`
        + `／名前「${fx.text}」${fx.size}px`
        + `／${pins.sets.map(([k, n, on]) => `${k}の印 ${n} 個中 ${on} 個を強調`).join("・")}`
        + `／戻すと消える`;
    },
  },
  {
    // ⚠ 年代の帯の飾り（目盛り・年代の文字・ノブ）が、指を横取りしないこと。
    //   それらは insertAdjacentHTML("beforeend") で <input type=range> の**後ろ**に
    //   挿さるので、pointer-events を切らないと入力を覆う。
    //   実測（2026-08-14・375px）: 年代の文字5つは全滅、目盛りも大半が無反応、
    //   ノブは掴めなかった。**いちばん押したくなる的が、全部死んでいた。**
    //   利用者役のエージェント3体とも、最初の操作がこれで、最初の失敗もこれだった。
    name: "年代の帯は、目盛りも文字もノブも押せる", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const geo = await page.evaluate(() => {
        const t = document.getElementById("track").getBoundingClientRect();
        const mid = (e) => { const r = e.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
        return { x: Math.round(t.left), w: Math.round(t.width),
          lab: [...document.querySelectorAll("#track .lab")].map((e) =>
            ({ ...mid(e), t: e.textContent.trim() })),
          tick: [...document.querySelectorAll("#track .tick")].map(mid),
          knob: mid(document.querySelector("#track .knob")) };
      });
      must(geo.lab.length > 0 && geo.tick.length > 0, "目盛りも年代の文字も無い");
      const set = (v) => page.$eval("#t", (e, v) => {
        e.value = v; e.dispatchEvent(new Event("input")); }, v);
      const val = () => page.$eval("#t", (e) => e.value);
      const dead = [];
      // ⚠ 端は 0 / 800 が正解なので、反対側へ寄せてから押す
      for (const l of [...geo.lab, ...geo.tick]) {
        const from = l.x < geo.x + geo.w / 2 ? "800" : "0";
        await set(from); await page.waitForTimeout(120);
        // ⚠ 右端ちょうどは要素の外なので、2px 内側を押す（指なら当たる幅）
        await page.mouse.click(Math.min(l.x, geo.x + geo.w - 2), l.y);
        await page.waitForTimeout(300);
        if (await val() === from) dead.push(l.t || `目盛り(${l.x})`);
      }
      must(!dead.length, `押しても動かない的がある: ${dead.join("、")}`);
      // ノブを掴んで引けること
      await set("0"); await page.waitForTimeout(150);
      await page.mouse.move(geo.knob.x, geo.knob.y);
      await page.mouse.down();
      await page.mouse.move(geo.knob.x + 120, geo.knob.y, { steps: 8 });
      await page.mouse.up(); await page.waitForTimeout(300);
      must(await val() !== "0", "ノブを掴んで引けない");
      return `年代の文字 ${geo.lab.length} 個・目盛り ${geo.tick.length} 個・ノブ、全部効く`;
    },
  },
  {
    // ⚠ 建物を押した結果は、**押した場所の近く**に出ること。
    //   以前は左パネルの中だけに書いていて、実測で y=672（スマホ・パネルは閉じている）／
    //   y=721（PC・パネルの内スクロールの外）と、**両方の端末で画面の外**だった。
    //   利用者役のエージェント3体が「押しても何も起きないように見える」と言ったのは、
    //   実際に何も見えていなかったから（2026-08-14）。
    name: "建物を押した結果が、押した場所に見える", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      // ⚠ 触る前に、押せることが**画面に出ている**こと。
      //   以前は左パネルの中に案内があったが、スマホはパネルが閉じて始まり、
      //   PC は内スクロールの外だったので、誰も読んでいなかった。
      const tip = await page.evaluate(() => {
        const t = document.getElementById("tip"), r = t?.getBoundingClientRect();
        return { text: (t?.textContent ?? "").trim(),
          inView: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
      });
      must(tip.text.length > 0, "建物を押せることが、どこにも書かれていない");
      must(tip.inView, `案内が画面の外にある: ${JSON.stringify(tip)}`);
      must(/押す|押し/.test(tip.text), `何をすればよいか書かれていない: ${tip.text}`);

      await page.mouse.click(187, 333);                 // 画面の真ん中の建物
      await page.waitForTimeout(900);
      // ⚠ 役目が終わった案内を、画面に置き続けない
      const tipAfter = await page.evaluate(() =>
        (document.getElementById("tip")?.textContent ?? "").trim());
      must(tipAfter === "", `一度押したのに案内が残っている: ${tipAfter}`);
      const r = await page.evaluate(() => {
        const pop = document.querySelector(".pick-pop .maplibregl-popup-content");
        const rc = pop?.getBoundingClientRect();
        const say = document.getElementById("pickSay");
        return { has: !!pop, text: (pop?.textContent ?? "").replace(/\s+/g, " ").trim(),
          inView: !!rc && rc.top >= 0 && rc.bottom <= innerHeight
            && rc.left >= 0 && rc.right <= innerWidth,
          sayH: say ? Math.round(say.getBoundingClientRect().height) : 0 };
      });
      must(r.has, "建物を押しても、押した場所に何も出ない");
      must(r.inView, `押した結果が画面の外にある: ${JSON.stringify(r).slice(0, 120)}`);
      // ⚠ 3D で 100% 言えるのは足元だけ。まずそれを言うこと
      must(/足元は、明治期には水でした|明治期の区分/.test(r.text),
        `足元の判定が出ていない: ${r.text.slice(0, 80)}`);
      // ⚠ 高さと建設年は、必ず出所つきで。「実測」と書ける建物は 7.9% しかない
      must(/既定値|階数|height タグ/.test(r.text), `高さの出所が出ていない: ${r.text.slice(0, 80)}`);
      must(/建設年/.test(r.text), `建設年について何も言っていない: ${r.text.slice(0, 80)}`);
      // ⚠ 読んでいない根拠は出さない
      must(/rgba=|読み込めていません/.test(r.text), `判定の根拠が出ていない: ${r.text.slice(0, 80)}`);
      for (const w of ["この年に建った", "当時", "再現", "でしょう"])
        must(!r.text.includes(w), `断定・作文が混ざっている: 「${w}」`);
      // 読み上げは指で押せる大きさ
      must(r.sayH === 0 || r.sayH >= 44, `読み上げが指で押すには小さい: ${r.sayH}px`);
      return `案内「${tip.text}」→ 押すと消える／押した場所に出る（🔊 ${r.sayH}px）`
        + `／${r.text.slice(0, 40)}`;
    },
  },
  {
    // ⚠ 建物の但し書きは、**畳まれない場所**に出ていること。
    //   以前は左パネルの中にしかなく、スマホは panelOpen=!isNarrow で閉じて始まるので
    //   初期状態で1文字も見えなかった。利用者役のエージェント3体のうち2体が
    //   「高さと建設年は実データだ」と思ったまま操作した（2026-08-14）。
    //   ⚠ スマホ幅で見ること。PC ではパネルが開くので、この壊れ方は再現しない。
    name: "建物の但し書きが、スマホでも最初から見えている", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => {
        const e = document.getElementById("est"), rc = e?.getBoundingClientRect();
        return { text: (e?.textContent ?? "").replace(/\s+/g, " ").trim(),
          panelHidden: document.getElementById("panel")?.classList.contains("hide"),
          shown: !!rc && rc.height > 0 && rc.top >= 0 && rc.bottom <= innerHeight
            && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none" };
      });
      // 前提が崩れていたら、この検査は何も確かめていない
      must(r.panelHidden, "スマホなのにパネルが開いている（この検査の前提が消えた）");
      must(r.shown, `但し書きが折り返しの中に見えていない: ${JSON.stringify(r)}`);
      // ⚠ 「出ている」だけでは足りない。**読めること**。板なしで出したときは
      //   10.5px・薄い色・影だけで航空写真の上に置いており、読めるのは数字だけだった。
      //   年の見出しが 60px なのに但し書きが 10.5px で 5.7倍（UI/UX の実測）。
      const look = await page.evaluate(() => {
        const e = document.getElementById("est"), c = getComputedStyle(e);
        const y = document.querySelector("#era .y");
        const a = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
        return { fs: parseFloat(c.fontSize),
          yearFs: parseFloat(getComputedStyle(y).fontSize),
          bgA: (a(c.backgroundColor)[3] ?? 0) };
      });
      must(look.fs >= 12, `但し書きが小さすぎる: ${look.fs}px（12px 以上）`);
      must(look.bgA >= 0.5,
        `但し書きに敷きが無い（写真の上で沈む）: 背景の不透明度 ${look.bgA}`);
      must(look.yearFs / look.fs <= 5.2,
        `年の見出しと但し書きの差が開きすぎ: ${look.yearFs}px 対 ${look.fs}px`);
      // ⚠ 「推定」の語だけでは足りない。**主張範囲の分母つき**で言うこと
      must(/\d+ \/ \d+ 件が推定/.test(r.text), `高さの推定を分母つきで言っていない: ${r.text}`);
      must(/年が分かるのは \d+ \/ \d+ 件/.test(r.text), `建設年を分母つきで言っていない: ${r.text}`);
      const m = r.text.match(/(\d+) \/ (\d+) 件が推定/);
      must(+m[1] > 0 && +m[1] <= +m[2], `推定の件数がおかしい: ${m[0]}`);
      for (const w of ["再現", "当時の街並み", "この年に建った"])
        must(!r.text.includes(w), `断定・再現を名乗る語がある: 「${w}」`);
      return r.text;
    },
  },
  {
    // ⚠ 建設年が分かる建物と、こちらが決めた建物を、同じ顔で出さない。
    //   exact は「建設年が分かっている」印だが、**集計にしか使われておらず
    //   描画に一度も効いていなかった**。豊洲では 8 件と 525 件が
    //   画面上でまったく同じに見え、同じように消えていた（2026-08-14 検証者の指摘）。
    name: "建設年が分かる建物を、こちらが決めた建物と同じに描かない", path: `/peel?${TOYOSU}`,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1000);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(/建物が消える年代は演出/.test(t), "「消える年代は演出」の断りが消えている");
      // ⚠ 言い方も1つにする。#est が「建てられた年」、#prov が「建設年」と、
      //   同じことを別の語で2回言っていた（数字が3か所にあったのと同じ話）。
      must(/建てられた年が分かるのは \d+ \/ \d+ 件/.test(t), `分母つきで言っていない: ${t.slice(0, 120)}`);
      // ⚠ この断りは、**パネルを開かなくても読める場所**に無いと意味がない。
      //   実測（2026-08-15）: 「演出」は #prov にしか無く、スマホでは
      //   ☰ を押して 254px スクロールしないと届かなかった。
      //   #est は建物が見えているあいだ 0 アクションで読める。
      const est = (await page.locator("#est").innerText()).replace(/\s+/g, " ");
      must(/建物が消える年代は演出/.test(est),
        `常時見える場所に「演出」が無い: ${est.slice(0, 90)}`);
      // ⚠ 同じ数字を2か所に置かない（掟: 同じ問いに答える実装を2つ持たない）。
      //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった。
      const dated = (t.match(/建てられた年が分かるのは (\d+) \/ (\d+) 件/) ?? [])[0];
      const times = t.split(/建てられた年が分かるのは \d+ \/ \d+ 件/).length - 1;
      must(times === 1, `「${dated}」が画面に ${times} 回出ている`);
      const bare = (t.match(new RegExp(`${(dated.match(/(\d+) \/ (\d+)/) ?? [])[0]}`, "g")) ?? []).length;
      must(bare === 1, `「${(dated.match(/\d+ \/ \d+/) ?? [])[0]}」という数字が画面に ${bare} 回出ている`);

      const btn = page.locator("#peekY");
      must(await btn.count() === 1, "建設年が分かる件を光らせる操作が無い");
      const before = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerdown");
      await page.waitForTimeout(300);
      const during = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerup");
      await page.waitForTimeout(300);
      const after = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));

      must(/"exact"/.test(during), `押しても exact が色に効いていない: ${during.slice(0, 90)}`);
      must(!/"exact"/.test(before), "既定の色に exact が混ざっている（既定は明治期の判定だけ）");
      // ⚠ 離したら必ず戻す。戻し忘れると別の意味の色が居座り、
      //   「99.6% が水色」と言いながら画面が灰色になる
      must(after === before, `離しても色が戻っていない: ${after.slice(0, 90)}`);
      return `既定→exact→既定 に戻る／${dated}（画面に 1 回だけ）`;
    },
  },
  {
    // ⚠ 3D から戻ったとき、調べていた場所が消えないこと。
    //   以前は href="./" のままで、← を押すと空のトップに戻っていた
    //   （利用者役のエージェントによる検証で3体すべてが「最初からになった」と言った）。
    name: "3D から戻っても、調べていた場所が残る", path: `/peel?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。スマホはパネルが閉じて始まるので、
    //   パネルの中にしか戻る手段が無いと**画面から戻れなくなる**
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(800);
      // ⚠ 戻る手段が、最初から画面に見えていること。
      //   以前はパネルの中の「←今昔」だけで、実測すると
      //     スマホ y=688・18px・パネルは閉じて始まる → 画面に戻る手段が1つも無い
      //     PC     y=737・18px                     → 最下端の細い行
      //   しかも「←今昔」はロゴに見えて、戻る操作に読めなかった（2026-08-14）。
      const back = await page.evaluate(() => {
        const a = document.getElementById("back"), r = a?.getBoundingClientRect();
        return { has: !!a, y: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null,
          text: (a?.textContent ?? "").replace(/\s+/g, " ").trim(),
          shown: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
            && getComputedStyle(a).opacity !== "0" };
      });
      must(back.has, "戻る手段が無い");
      must(back.shown, `戻る手段が画面に見えていない: ${JSON.stringify(back)}`);
      must(back.h >= 44, `戻るが指で押すには小さい: ${back.h}px`);
      // ⚠ href は絶対URLで返るので getAttribute で見る（書き戻しで壊した過去がある）
      const href = await page.locator("#back").getAttribute("href");
      must(/[?&]q=/.test(href) && /[&?]ll=/.test(href),
        `戻り先が場所を落としている: ${href}`);
      await page.locator("#back").click();
      await page.waitForFunction(() => {
        const t = document.getElementById("verdict")?.textContent ?? "";
        return t.length > 0 && !t.includes("判定中");
      }, null, { timeout: 45000 });
      const chip = await page.locator("#chipName").textContent().catch(() => "");
      must(chip.includes("豊洲"), `戻ったのに場所が消えている: 「${chip}」`);
      return `戻り先 ${href} ／ 場所「${chip}」が残る`;
    },
  },
  {
    // ⚠ 説明は、押す前に読めるところに出す。
    //   利用者役のエージェントによる検証2周（2026-08-14/15）で、3体の第1位はどちらも「押す前に知りたい」で、
    //   アコーディオン（開かないと読めない）と「…で切り詰めて押すと続き」は
    //   合わせて 0 票だった。後者は PC で「…」が 0 / 2,225 件しか出ず、導線が現れない。
    //   ⚠ 同時に、名前を読めば分かるだけの説明は出さない（実測 29.7% が空になる）。
    name: "説明は押す前に読めて、名前の言い換えは出さない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await page.waitForTimeout(1000);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".ev-it")].map((e) => ({
        name: e.querySelector(".ev-l")?.innerText.trim() ?? "",
        d: e.querySelector(".ev-d")?.innerText.trim() ?? "",
        // 押す前に、その場で読めていること（開く操作を挟まない）
        vis: !!e.querySelector(".ev-d")?.checkVisibility({ checkVisibilityCSS: true }) })));
      must(rows.length > 0, "一覧が空");
      const withD = rows.filter((r) => r.d);
      must(withD.length > 0, "説明が1件も出ていない");
      must(withD.every((r) => r.vis), "説明が、押すまで読めない場所にある");
      // ⚠ 前置きを落としていること。落とさないと本題が「…」の向こうへ行く
      const lazy = withD.filter((r) => /に(ある|あった|所在)/.test(r.d)
        && /^(日本の|.{2,8}?[都道府県市区町村])/.test(r.d));
      must(lazy.length === 0,
        `地名の前置きが残っている: ${lazy.slice(0, 2).map((r) => r.d).join(" / ")}`);
      // ⚠ 読んでも増えない説明を出していないこと
      const echo = withD.filter((r) =>
        r.name.replace(/[\s・]/g, "").includes(r.d.replace(/[\s・]/g, "")));
      must(echo.length === 0,
        `名前に既出の説明を出している: ${echo.slice(0, 2).map((r) => `${r.name}／${r.d}`).join(" / ")}`);
      // ⚠ 説明が出ない行を「説明が無い」と読ませない
      const src = (await page.locator(".ev-src").innerText()).replace(/\s+/g, " ");
      must(/落とすと何も残らない項目には出ません/.test(src),
        `説明を落としていることを書いていない: ${src.slice(0, 100)}`);
      // ⚠ 行ごとの「位置を見る」は外した。案内は見出しの下に 1 回だけ。
      //   実測（2026-08-15）: PC では説明のある行で **名前と説明のあいだ**に入り、
      //   説明の無い行では右端に来て、同じ画面で位置が 2 か所を行き来していた。
      must(await page.locator(".ev-go").count() === 0,
        "行ごとの「位置を見る」が残っている");
      const tips = await page.locator(".ev-tip").count();
      must(tips === 1, `押せることの案内が ${tips} 個（1 個であること）`);
      must(await page.locator(".ev-tip").checkVisibility?.() !== false, "案内が見えていない");
      // ⚠ 件数ピルが潰れていないこと（flex-wrap が無いと 375/320px で 2 行に割れる）
      const pill = await page.evaluate(() => {
        const e = document.querySelector(".ev-n"); if (!e) return null;
        const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      must(pill && pill.h <= 24, `件数が2行に割れている: ${JSON.stringify(pill)}`);
      return `${withD.length} / ${rows.length} 行に説明（押す前に読める）／例「${withD[0].d}」`
        + `／行のラベルなし・案内は見出しの下に 1 個・件数 ${pill.w}×${pill.h}px`;
    },
  },
  {
    // ⚠ /peel の検索が、トップと同じ作法であること。
    //   以前はここだけ別実装で、取れなかったときに「見つかりませんでした」と書いていた。
    // ⚠ 畳んだ「別の場所を見る」を押したら、必ず検索欄と地名が出ること。
    //   214px をパネルの中段から外した代わりに、ここが唯一の探し口になった。
    //   `/peel` は ll が無くても既定の場所を読むので、この枠を見る人は
    //   必ず何かの場所を見ている。名乗りが「別の場所を見る」で正しい。
    name: "畳んだ「別の場所を見る」を押すと、探せる", path: "/peel",
    async check(page) {
      await page.waitForSelector("#findBox");
      // ⚠ 畳んだ <details> の中身を getBoundingClientRect() で測ってはいけない。
      //   中身は content-visibility:hidden になるだけで、**直前の寸法を返し続ける**。
      //   実際に踏んだ: 閉じているのに 268×38 と読め、「開いている」と誤判定した。
      //   枠そのものの高さ（23px ⇄ 202px）と checkVisibility() で見る。
      const look = () => page.evaluate(() => ({
        open: document.getElementById("findBox").open,
        h: Math.round(document.getElementById("findBox").getBoundingClientRect().height),
        label: document.getElementById("findLabel").innerText.trim(),
        q: document.getElementById("q").checkVisibility({ checkVisibilityCSS: true }),
        chips: [...document.querySelectorAll("#quick button")]
          .filter((e) => e.checkVisibility({ checkVisibilityCSS: true })).length,
        here: document.getElementById("here").checkVisibility({ checkVisibilityCSS: true }) }));
      const shut = await look();
      must(!shut.open && !shut.q, "探す枠が最初から開いている（判定の数字が下へ押し出される）");
      must(shut.chips === 0 && !shut.here, "畳んでいるのに中身が見えている");
      must(shut.label === "別の場所を見る", `名乗りが「別の場所を見る」でない: ${shut.label}`);
      await page.click("#findLabel");
      const open = await look();
      must(open.q, "押しても検索欄が出ない（押して何も起きない導線）");
      must(open.chips > 0, "押しても地名が出ない");
      must(open.here, "押しても「現在地から調べる」が出ない");
      return `畳んで ${shut.h}px → 押すと ${open.h}px（検索欄・地名 ${open.chips} 個・現在地）`;
    },
  },
  // ⚠ **同じ応答を渡したとき、トップと 3D が同じ並び・同じ自動選択になること。**
  //   AC の本体。以前は画面ごとに実装があり、**片方だけ直す事故**が起きうる状態だった。
  //   ⚠ **実通信しない。** 42 語をトップと 3D で別々に叩くと 84 リクエストになり、
  //   地理院への負荷が倍になる（掟: 地理院への負荷は自分の請求とは別に見る）。
  //   同じ固定の応答を両画面へ流して、出てきた並びを突き合わせる。
  //   ⚠ 応答は「渋谷」の実際の形（都道府県コードの昇順＝**先頭が別の土地**）を模してある。
  {
    name: "同じ応答なら、トップと 3D の候補が一致する", path: "/",
    setup: (page) => page.route("**/AddressSearch*", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      // ⚠ **自動選択が発火する組み合わせにする。** 先に「福島県猪苗代町渋谷」を混ぜた
      //   3 件で試したが pick=-1（発火しない）で、**「自動選択が一致する」の主張が
      //   空振りしていた**（2026-08-15 に気づいた）。区＋駅なら発火する（実測）。
      body: JSON.stringify([
        { properties: { title: "東京都渋谷区" }, geometry: { coordinates: [139.700, 35.660] } },
        { properties: { title: "渋谷駅" },       geometry: { coordinates: [139.701, 35.658] } },
      ]),
    })),
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForFunction(() => document.querySelectorAll("#list .tx b").length > 0,
        null, { timeout: 30000 });
      const top = await page.evaluate(() => ({
        rows: [...document.querySelectorAll("#list .tx b")].map((e) => e.textContent.trim()),
        picked: document.querySelector("#list .sel .tx b")?.textContent?.trim() ?? null,
      }));
      // 同じ入れ物のまま /peel を開いて、同じ応答で比べる（route は生きたまま）
      await page.goto(BASE + "/peel", { waitUntil: "domcontentloaded" });
      await page.click("#findLabel");
      await page.fill("#q", "渋谷");
      await page.waitForFunction(() => document.querySelectorAll("#cands button").length > 0,
        null, { timeout: 30000 });
      const peel = await page.evaluate(() => ({
        rows: [...document.querySelectorAll("#cands button")].map((b) => b.childNodes[0].textContent.trim()),
        picked: document.querySelector("#cands button.on")?.childNodes[0]?.textContent?.trim() ?? null,
      }));
      must(top.rows.length > 0, "トップに候補が出ていない");
      must(peel.rows.length > 0, "3D に候補が出ていない");
      must(JSON.stringify(top.rows) === JSON.stringify(peel.rows),
        `同じ応答なのに並びが違う: トップ ${JSON.stringify(top.rows)} / 3D ${JSON.stringify(peel.rows)}`);
      // ⚠ **どちらも null なら、この主張は空振りする。** 発火することまで見る。
      must(top.picked !== null,
        "自動選択が発火していない。この応答では発火するはずで、発火しないと下の突き合わせが空振りする");
      must(top.picked === peel.picked,
        `同じ応答なのに自動選択が違う: トップ ${JSON.stringify(top.picked)} / 3D ${JSON.stringify(peel.picked)}`);
      return `${top.rows.length} 件が一致（選択 ${JSON.stringify(top.picked)}）`;
    },
  },
  // ⚠ **別の語へ変えたときも、古い候補が出ない。**
  //   「入力を消したとき」だけ切っていては足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのまま「新宿」へ変えると、デバウンスの 320〜350ms のあいだに
  //   古い応答が届き、**入力欄は「新宿」なのに「東京都渋谷区」が並ぶ**。
  //   ⚠ その候補を押せば**違う場所へ飛ぶ**。数え方の問題ではなく、行き先の問題。
  //   ⚠ 新しい検索が始まるのはデバウンスのあとなので、run() の中で世代を進めるだけでは
  //   間に合わない。**入力の瞬間に cancel() する**必要がある。
  ...[["トップ", "/", "#list", false], ["3D", "/peel", "#cands", true]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 別の語へ変えたら、前の語の候補が出ない`, path,
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
  ...[["トップ", "/", "#list", false], ["3D", "/peel", "#cands", true]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 入力を消したら、遅れて返った候補が復活しない`, path,
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
  {
    name: "3D の検索も、取れなかったときに「無い」と言わない", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route("**/address-search/**", (r) => r.abort()),
    async check(page) {
      // 探す枠は畳んである（実測 214px を中段から外した）。押して開く
      await page.click("#findLabel");
      await page.waitForFunction(() => document.getElementById("findBox")?.open === true);
      await page.fill("#q", "豊洲");
      await page.waitForFunction(() => {
        const t = document.getElementById("cands")?.textContent ?? "";
        return t.length > 0 && !t.includes("検索中");
      }, null, { timeout: 30000 });
      const t = (await page.locator("#cands").textContent()).replace(/\s+/g, " ");
      must(/取れませんでした|取れなかった/.test(t), `取れなかったと言っていない: ${t}`);
      must(!/見つかりませんでした/.test(t), `落ちているのに「見つかりませんでした」と書いている: ${t}`);
      must(await page.locator("#reSearch").count() === 1, "再試行が出ていない");
      return t.slice(0, 60);
    },
  },
  {
    // ⚠ 豊洲は「事前計算の bbox」を持つ唯一の土地なので、豊洲が通っても
    //   他の9つのピンが通る証明にはならない。取り込んだだけの土地で1つ通す。
    //   広島を選んだのは、東京以外で、事前計算も持っていないから。
    name: "取り込んだだけの土地でも、3D が静的で成り立つ",
    path: "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page, reqs) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1000);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      const tiles = reqs.filter((u) => /\/data\/bl\/14\//.test(u));
      must(tiles.length > 0, "建物タイルを読んでいない");
      // 詰めた形を読めていること。戻せていなければ建物は1つも建たない
      const n = Number((t.match(/([\d,]+)\s*件を判定しました/) ?? [])[1]?.replace(/,/g, ""));
      must(n > 0, `建物が1件も建っていない（詰めた形を戻せていない）: ${t.slice(0, 200)}`);
      must(/建物を取り込んだのは \d{4}-\d{2}-\d{2}/.test(t),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      return `Overpass 0 件／タイル ${tiles.length} 枚／${n.toLocaleString()} 件を判定`;
    },
  },
  {
    // ⚠ ev と bld の索引を混ぜない。混ぜると「建物が見たタイル」が
    //   「事物も見た」ことになる（設計レビューが実験で再現）
    // ⚠ ローカルの配信（serve.js）が、本番（_headers）と同じ方針で返しているか。
    //   実際に踏んだ（2026-08-15）: `rel.startsWith("vendor")` と書いてあったが
    //   `rel` は `/vendor/…` の形なので **常に false**。
    //   「MapLibre は 1MB あるのでキャッシュさせる」と書いてあったのに、**一度も効いていなかった**。
    //   ⚠ 文字列の先頭一致を、正規化の結果とずらした型。字面を見るだけの検査では捕まらないので、
    //     **実際に取って、返ってきたヘッダを見る**。
    name: "配信のキャッシュ方針が、本番と食い違っていない", path: "/",
    async check(page) {
      const got = {};
      for (const u of ["/vendor/maplibre-gl.js", "/vendor/maplibre-gl.css",
                       "/index.html", "/peel", "/data/bl/index.json"]) {
        const r = await page.request.get(BASE + u);
        must(r.ok(), `${u} が取れない（${r.status()}）`);
        got[u] = r.headers()["cache-control"] ?? "(無い)";
      }
      // vendor は長く持たせる。⚠ 名前が変わる前提のものなので、毎回確認させる必要がない
      for (const u of ["/vendor/maplibre-gl.js", "/vendor/maplibre-gl.css"])
        must(/max-age=\d{3,}/.test(got[u]), `${u} がキャッシュされない: ${got[u]}`);
      // ⚠ それ以外は毎回確認させる。索引と束が食い違うと、古い束を根拠に断定してしまう
      for (const u of ["/index.html", "/peel", "/data/bl/index.json"])
        must(/no-cache|max-age=0/.test(got[u]), `${u} が長く残る: ${got[u]}`);
      return `vendor ${got["/vendor/maplibre-gl.js"]} ／ ほかは ${got["/index.html"]}`;
    },
  },
  {
    name: "建物の索引と、事物の索引を混ぜない", path: "/",
    async check(page) {
      const both = await page.evaluate(async () => {
        const ev = await fetch("./data/ev/index.json").then((r) => r.ok ? r.json() : null);
        const bl = await fetch("./data/bl/index.json").then((r) => r.ok ? r.json() : null);
        return { ev, bl };
      });
      must(both.ev && both.bl, "索引が読めない");
      must(both.ev.z === 12 && both.bl.z === 14,
        `索引の粒度が想定と違う: ev z${both.ev.z} / bl z${both.bl.z}`);
      // 別ファイル・別粒度であること（同じ形にすると、いつか混ざる）
      must(JSON.stringify(both.ev.tiles) !== JSON.stringify(both.bl.tiles),
        "2つの索引が同じ中身になっている");
      return `ev z${both.ev.z} ${Object.keys(both.ev.tiles).length} 束／`
        + `bl z${both.bl.z} ${Object.keys(both.bl.tiles).length} タイル`;
    },
  },
  // ---- 高さが推定であることを、主張範囲の数字で言う ----
  // ⚠ 3D で立っている街の形は、ほとんどがこちらで決めた既定値。
  //   99.6%（足元が水だった割合）は1件ずつ画素を読んだ実測なのに、
  //   その数字が乗っている**絵のほうが推定**、というねじれを黙らない。
  // ⚠ 数字は「この画面が名乗る範囲」のもの。取り込み全域の 93.8% を出すと、
  //   99.4% を 40.9% に化けさせたのと同じ事故（範囲と主張のずれ）になる。
  {
    name: "高さが推定であることを、主張範囲の数字で言う", path: `/peel?${TOYOSU}`,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1200);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      const total = Number((t.match(/建物 (\d+) 件を判定しました/) ?? [])[1]);
      must(total > 0, `件数が読めない: ${t.slice(0, 80)}`);
      // 「いま画面に出ているもの」に高さの行があること（畳んでいないこと）
      const prov = await page.locator("#prov").textContent();
      must(/高さ/.test(prov), `出所の一覧に高さの行が無い: ${prov.replace(/\s+/g, " ").slice(0, 120)}`);
      must(/既定値/.test(prov), "高さが推定であることが書かれていない");
      // ⚠ 分母は主張範囲と同じであること
      const m = prov.match(/OSM に高さが入っているのは (\d+) \/ (\d+) 件/);
      must(m, `高さの内訳が読めない: ${prov.replace(/\s+/g, " ").slice(0, 160)}`);
      must(Number(m[2]) === total,
        `高さの分母が主張範囲と違う: ${m[2]} / 判定した件数 ${total}`);
      must(Number(m[1]) < Number(m[2]) * 0.5,
        `実測が半分以上あるのに「ほとんどが既定値」と書いている: ${m[1]}/${m[2]}`);
      // ⚠ 内訳の表には入れない。あの表は足元の判定の**分割**（足すと総数になる）で、
      //   高さや建設年は**素性**なので、混ぜると足し算の合わない表になる。
      must(!/高さが実測の建物/.test(t), "素性（高さ）が、分割の表である内訳に混ざっている");
      // ⚠ 評価語を作らない
      for (const w of ["ほぼ正確", "おおむね", "信頼度", "精度は"])
        must(!t.includes(w), `評価語が入っている: 「${w}」`);
      return `${m[1]} / ${m[2]} 件が実測（判定した件数と一致）`;
    },
  },
  // ================= 外部から来た文字列 =================
  // ⚠ ここが緑であることが、この不具合が戻っていないことの根拠。
  //   静的検査は「外部の受け皿を生で書いていないか」しか見られない（変数に写せば素通りする）。
  {
    // Issue の再現手順そのもの。取り込み済みの土地（広島）の ev タイル1枚を差し替える
    name: "外部の文字列が、事物の一覧・印・寄せた先で実行されない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    setup: (page) => page.route("**/data/ev/12/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ tile: [12, 0, 0], at: "2026-08-15", f: [
        { id: "Q1", l: `広島城${XSS}`, k: "建造物", c: [132.45500, 34.39500],
          y: [1589, null], p: "year", n: `毛利輝元が築いた城${XSS}`,
          // ⚠ esc() だけでは href="javascript:…" は塞げない。押した瞬間に実行される
          u: `javascript:window.__pwned=(window.__pwned||0)+1` },
      ] }),
    })),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期の帯には年が無いので、写真のある年代へ動かす
      await photoFrames(page).first().click();
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#ev", "一覧");
      const row = await shownAsText(page, ".ev-it .ev-l", "一覧の名前");
      await shownAsText(page, ".ev-it .ev-d", "一覧の説明");
      // 出典URL が http/https でないときは、リンクそのものを出さない
      must(await page.locator(".ev-u").count() === 0,
        "javascript: の出典URLが、押せるリンクとして出ている");
      // 写真の上の印（title 属性の中も HTML）
      await notRun(page, "#pins", "写真の印");
      const pin = await page.locator("#pins .pin").first().getAttribute("title");
      must((pin ?? "").includes("<img"), `印の title に生の文字が残っていない: ${pin}`);
      // 押した先（#fx）。2026-08-15 に足して、エスケープを忘れていた場所
      await page.locator(".ev-it").first().click();
      await page.waitForFunction(() => (document.getElementById("fx")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#fx", "寄せた先");
      await shownAsText(page, "#fx", "寄せた先の名前");
      return `一覧・印・#fx で発火 0 ／ 表示は生のまま「${row.trim().slice(0, 18)}…」／ javascript: のリンクは出さない`;
    },
  },
  {
    name: "外部の文字列が、検索候補で実行されない", path: "/",
    setup: (page) => page.route("**/address-search/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([
        { geometry: { type: "Point", coordinates: [139.7975, 35.6548] },
          properties: { title: `東京都江東区豊洲${XSS}`, dataSource: "", addressCode: "13108" } },
      ]),
    })),
    async check(page) {
      await page.fill("#q", "豊洲");
      await page.waitForFunction(() => document.querySelectorAll("#list .it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#list", "検索候補");
      const t = await shownAsText(page, "#list .it", "検索候補の地名");
      return `候補で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 22)}…」`;
    },
  },
  {
    // ⚠ 建物を取り込んでいない土地を使う。取り込み済みだと静的タイルで答えるので、
    //   Overpass の差し替えが効かない（＝何も確かめずに必ず通る検査になる）
    name: "外部の文字列が、3D の検索候補と建物カードで実行されない",
    path: `/peel?${URAYASU}`,
    setup: (page) => Promise.all([
      page.route("**/address-search/**", (r) => r.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { geometry: { type: "Point", coordinates: [139.9020, 35.6540] },
            properties: { title: `千葉県浦安市${XSS}`, dataSource: "", addressCode: "12227" } },
        ]),
      })),
      // 建物の種別（building）と建設年（start_date）は OSM のタグそのもの
      page.route((u) => /overpass/i.test(u.href), (r) => {
        const ring = (lon, lat, d) => [[lon - d, lat - d], [lon + d, lat - d],
          [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]
          .map(([x, y]) => ({ lat: y, lon: x }));
        r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ elements: [0, 1, 2].map((i) => ({
            type: "way", id: 100 + i,
            geometry: ring(139.9020 + (i - 1) * 0.0012, 35.6540, 0.00045),
            tags: { building: `yes${XSS}`, start_date: `1968${XSS}` },
          })) }) });
      }),
    ]),
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      // ---- 建物カード（押した先）----
      const pt = await page.evaluate(() => {
        const cv = map.getCanvas();
        for (let y = 0.25; y < 0.8; y += 0.05)
          for (let x = 0.25; x < 0.8; x += 0.05) {
            const p = [Math.round(cv.clientWidth * x), Math.round(cv.clientHeight * y)];
            if (map.queryRenderedFeatures(p, { layers: ["bld"] }).length) return { x: p[0], y: p[1] };
          }
        return null;
      });
      must(pt, "建物が1棟も描かれていない（押す先が無い）");
      await page.mouse.click(pt.x, pt.y);
      await page.waitForFunction(() => (document.getElementById("pick")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#pick", "建物カード");
      await shownAsText(page, "#pick", "建物カードの種別と建設年");
      // 押した場所に出す吹き出しも同じ文字列を描いている
      await notRun(page, ".pick-pop", "建物の吹き出し");
      // ---- 検索候補 ----
      // ⚠ 検索欄は「別の場所を見る」に畳んである（既にその場所を見ている人には要らない）。
      //   開かないと、入力欄は存在するのに見えていない
      await page.click("#findBox summary");
      await page.fill("#q", "浦安");
      await page.waitForFunction(() => document.querySelectorAll("#cands button").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#cands", "3D の検索候補");
      const t = await shownAsText(page, "#cands button", "3D の検索候補の地名");
      // data-title は押すと入力欄へ戻る。実体参照が元の文字に戻っていること
      const dt = await page.locator("#cands button").first().getAttribute("data-title");
      must(dt?.includes("<img"), `data-title が元の文字に戻っていない: ${dt}`);
      return `建物カード・吹き出し・候補で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」`;
    },
  },
  {
    // ⚠ 地名は共有された URL（?q=）から来る。押させるだけで届く経路なので、
    //   保存一覧と共有カードまで見る
    name: "共有された URL の地名が、保存一覧と共有カードで実行されない",
    path: `/?ll=35.65480,139.79750&q=${encodeURIComponent(`豊洲${XSS}`)}`,
    async check(page) {
      await waitVerdict(page);
      // ★を付けると保存一覧に出る
      await page.click("#mineToggle");
      await page.locator("#stars button").first().click();
      await page.waitForFunction(() => document.querySelectorAll("#saved .row").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#saved", "保存一覧");
      const t = await shownAsText(page, "#saved .row", "保存一覧の地名");
      // 共有カードは canvas に描く（HTML を組み立てていない）。実際に押して確かめる
      await page.click("#shareBtn");
      await page.waitForFunction(() => {
        const n = document.getElementById("shareMsg");
        return n && n.style.display === "block";
      }, null, { timeout: 20000 });
      await notRun(page, "body", "共有カード");
      const msg = await page.locator("#shareMsg").textContent();
      return `保存一覧・共有カードで発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」／ 共有「${msg}」`;
    },
  },
];

function must(cond, msg) { if (!cond) throw new Error(msg); }

// ---- ローカルサーバ ----
const server = spawn(process.execPath, ["serve.js"], {
  env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);

await new Promise((r) => setTimeout(r, 1200));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let failed = 0;

// ⚠ **1件だけ回せるようにする。**
//   79 件を全部回すと 5 分近くかかる。検査を1つ足すたび、あるいは
//   「わざと壊して落ちることを確かめる」たびに全件を回していては、確認が高くつき、
//   **確かめずに済ませる誘惑が生まれる**（実際、確認1つに 5 分かけていた）。
//   ⚠ **CI と main では必ず全件を回す。** ここは手元で1件を見るためだけのもの。
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const RUN = ONLY ? CASES.filter((c) => c.name.includes(ONLY)) : CASES;
if (ONLY) {
  if (!RUN.length) { console.log(`\x1b[31m--only=${ONLY} に当てはまるケースが無い\x1b[0m`); process.exit(1); }
  console.log(`\x1b[33m⚠ --only=${ONLY}: ${RUN.length} / ${CASES.length} 件だけ回す（全件ではない）\x1b[0m\n`);
}

for (const c of RUN) {
  // スマホ幅でしか出ない壊れ方（タップ判定）を見るケースがあるので、画面はケースごとに指定できる
  // スマホ幅でしか出ない壊れ方を見るケースは、指（hasTouch）も一緒に再現する。
  // これが無いと @media (hover:none) が効かず、タッチ端末での見え方を測れない。
  // ⚠ Service Worker を止める。
  //   SW を localhost でも登録するようにした結果、**SW が出す通信は page.route を
  //   通らない**ため、落としたはずの経路が素通りして検査が不安定になった
  //   （落ちたり通ったりする＝いずれ無視される検査になる）。
  //   ここで見たいのは画面の振る舞いで、SW の振る舞いは別に見るべきもの。
  const page = await browser.newPage({
    viewport: c.viewport ?? { width: 1200, height: 780 }, hasTouch: !!c.hasTouch,
    serviceWorkers: "block" });
  const errors = [], reqs = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // 「実行時に外部へ出ていないこと」を検査できるように、出た先を全部控える
  page.on("request", (r) => reqs.push(r.url()));

  try {
    // 通信断・無応答を作るケースは、ページを開く前に仕込む
    await c.setup?.(page);
    await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    const detail = await c.check(page, reqs);
    // 描画自体は通っても、裏でエラーが出ていれば見逃さない
    if (errors.length) throw new Error(`JSエラー: ${errors[0]}`);
    console.log(`  \x1b[32m✓\x1b[0m ${c.name} — ${detail}`);
  } catch (e) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${c.name} — ${e.message.split("\n")[0]}`);
    if (errors.length) console.log(`      JSエラー: ${errors.join(" / ")}`);
    // ⚠ **落ちたときだけ撮る。**
    //   以前は 75 件すべて撮っていたが、置き先の `.artifacts/` が隠しディレクトリで
    //   upload-artifact に既定で除外され、**1枚も保存されていなかった**（2026-08-15 に実測）。
    //   `if-no-files-found: ignore` だったので警告すら出ず、
    //   **撮影のコスト（実測 5.9 秒）だけ払って、見るものは何も残っていなかった。**
    //   ⚠ スクリーンショットは assert に使っていない。落ちた画面を人が見るためだけのもの。
    await page.screenshot({ path: `${OUT}/${c.name.replace(/[（）\/]/g, "_")}.png` })
      .catch(() => {});
  }
  await page.close();
}

await browser.close();
stop();

console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} / ${RUN.length} 件が失敗\x1b[0m`); process.exit(1); }
// ⚠ 回していないケースを「描画できた」と言わない（--only のとき）
console.log(ONLY
  ? `\x1b[33m${RUN.length} 件は描画できた（⚠ 全 ${CASES.length} 件のうち --only で選んだぶんだけ）\x1b[0m`
  : `\x1b[32m${RUN.length} 件すべて描画できた\x1b[0m`);
