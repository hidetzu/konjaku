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
import { mkdir, readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
// ⚠ **一覧行のタグの字は public/words.js が持つ。**⚠ **ここに書き写さない。**
//   ⚠ 2026-08-20 に踏んだ: この検査が「根拠あり」を直接書いていて、
//     ⚠ **字を言い直したら、製品ではなく検査のほうが落ちた**（掟: 同じ問いに答える実装を2つ持たない）。
await import(new URL("../public/words.js", import.meta.url).href);
const WORDS = globalThis.KonjakuWords;
if (!WORDS) throw new Error("public/words.js を読み込めない（一覧行のタグを確かめられない）");

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
// ⚠ 取り込み済みの建物が無い土地。だから実行時に Overpass へ行く（＝待つ）。
//   札幌は 2026-08-16 に取り込んだので、もう待たない（1364 件が即出る）。
const NAGOYA_LL = "ll=35.17090,136.88160&q=%E5%90%8D%E5%8F%A4%E5%B1%8B";

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
// 成り立ちの1文が出ていること。
// ⚠ **字を書き写さない**（2026-08-20。hidetzu/konjaku#122）。
//   ⚠ ここには文言そのものが直書きしてあった。⚠ **コメント自身が
//     「守っている意図は区分名を含む1文が出ていること。文言そのものではない」と
//     書いていたのに、正規表現は文言そのものだった。**
//   ⚠ 言い回しを ADR 0030 へ揃えた瞬間、⚠ **製品ではなく検査が落ちた**（これで 4 回目）。
// ⚠ **主語は words.js の 1 か所から取る。**⚠ 区分名は土地ごとに変わるので、
//   ⚠ **「主語＋何か」が出ていること**だけを見る（それがこの検査の主張）。
const RE_ESC = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const G1_MARK = "@@";
const G1_HEAD = WORDS.ground1Lines(G1_MARK, null)[0].split(G1_MARK)[0];
const VERDICT_SENTENCE = new RegExp(RE_ESC(G1_HEAD) + "\\S+");
const GSI_ROUTE = "**://*.gsi.go.jp/**";
// 写真タイルだけを落とす。低湿地（swale）・標高・建物は生かしたまま、
// 「地表のラスタだけが1枚も届いていない」状態を作るための経路。
const PHOTO_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/**";

// ---- 403（拒否）を作る経路 ----
// ⚠ 403 は「見せてもらえなかった」であって「そこにデータが無い」ではない。
//   以前は 404 と同じ absent に丸めていたため、拒まれただけの豊洲に
//   「整備対象外」「標高データが無い」と書き、根拠に HTTP のステータスまで添えていた。
//   取得の分岐は画像・GeoJSON・標高の3経路にそれぞれあるので、**別々に**落とす。
//   1つずつ落とすことで、「他の経路まで巻き添えにしていないか」も同時に見られる。
// ---- 年代ごとの応答を作る道具 ----
// 「その年代のタイルは在るが、この地点は撮影範囲の外」＝真っ白なタイルを組み立てる。
// ⚠ 白い画像をファイルとして置かない。fixture を置くと「画素を実際に読んで判定する」
//   という主張が、置いた画像に対する主張に化ける（CLAUDE.md の懸念そのもの）。
//   ここで組み立てて、page.route の応答にだけ使う。
const whitePng = (size = 256) => {
  const stride = size * 3 + 1;                 // 1行 = フィルタ種別1バイト + RGB
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) raw.fill(0xff, y * stride + 1, (y + 1) * stride);
  const T = (() => { const t = []; for (let n = 0; n < 256; n++) {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  const crc32 = (b) => { let c = 0xffffffff;
    for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;                    // 8bit / トゥルーカラー
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const eraRoute = (id) => `**://cyberjapandata.gsi.go.jp/xyz/${id}/**`;

// 段が**確定する**まで待つ。
// ⚠ `/peel` は写真の判定を待つあいだ、いったん全 9 段を仮に出す
//   （peel3d.js: timelineReady=false の区間。共有先で「一度戻された」ように見せないため）。
//   peelReady が見ている #status は**水域と建物**の話で、写真の年代とは別の経路なので、
//   **#status が埋まった時点では、段はまだ仮のことがある**。
//   実測（2026-08-17 / 豊洲 / 375×667）: peelReady 直後は timelineReady=false。
// ⚠ 建物を事前計算して静的に配るようになり #status が速くなったぶん、
//   仮の段を読む確率が上がった。**手元では 2 件が落ち、CI では通っていた**
//   ＝落ちたり通ったりする検査で、いずれ CI でも落ちるものだった。
const timelineSettled = (page) => page.waitForFunction(() => {
  // ⚠ 名前が変わったときに**黙って素通りさせない**。見えないなら落とす
  //   （`typeof … !== "undefined" && …` と書くと、消えた日から何も待たなくなる）
  if (typeof timelineReady === "undefined")
    throw new Error("peel3d.js の timelineReady が見えない（段の確定を待てていない）");
  return timelineReady === true;
}, null, { timeout: 60000 });

// 段のラベルを、実際にスライダーを動かして読む。
// ⚠ #track .lab は1つおきにしか文字を出さないので、DOM の文字だけ数えると足りない。
//   ⚠ 読むだけのつもりでも、動かせば地図はタイルを取りに行く。
//     要求数を数えるケースでは使わないこと。
const stepLabels = async (page) => {
  // 仮の段を読まない。ここ1か所で待てば、段を読むケース全部が同じ約束になる
  await timelineSettled(page);
  return page.evaluate(() => {
    const el = document.getElementById("t"), max = Number(el.max), out = [];
    const keep = el.value;
    for (let v = 0; v <= max; v += 100) {
      el.value = String(v); el.dispatchEvent(new Event("input"));
      out.push(document.querySelector("#era .y").textContent.trim());
    }
    el.value = keep; el.dispatchEvent(new Event("input"));
    return out;
  });
};
// 建物の高さの式に埋まっている時間座標（tau）を読む。
// ⚠ ここが「表示位置」に化けていないことが、この修正の肝。
const tauNow = (page) => page.evaluate(() => {
  const ex = map.getPaintProperty("bld", "fill-extrusion-height");
  const found = JSON.stringify(ex).match(/\["-",\["get","vanish"\],([\d.]+)\]/);
  return { tau: found ? Number(found[1]) : null,
    water: map.getPaintProperty("water", "fill-extrusion-height") };
});
// ⚠ **祖先まで辿った実効 opacity。** `checkVisibility()` は祖先の opacity を見ない。
//   実際、答えと分母は座標もテキストも持っていたのに、祖先（#panel.hide）が
//   opacity:0 だったせいでスマホの初期画面から1文字も読めていなかった
//   （2026-08-16 実測。豊洲 99.6% / 広島 1.4% / 出島 3.4% の3地点とも）。
//   display:none・visibility:hidden もここで一緒に見る。
const effOpacity = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  let o = 1;
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const st = getComputedStyle(n);
    if (st.display === "none" || st.visibility === "hidden") return 0;
    o *= Number(st.opacity);
  }
  return +o.toFixed(3);
}, sel);

const peelReady = (page) => page.waitForFunction(
  () => /件|ありません|読み込めませんでした/.test(document.getElementById("status")?.textContent ?? ""),
  null, { timeout: 60000 });

// ⚠ **この 2 つは「何かが起きるのを待つ」ものではない。**
//   何が起きたかは、直前の条件待ち／押した操作そのものが見ている。
//   ⚠ **残っているのは、変わった DOM が描き終わるまでのぶんだけ。**
//   ⚠ **待つ長さが主張になっている検査には使わない**（「6 秒後の姿勢」「20 秒で諦める」など）。
//   実測（2026-08-20・`--group=core` 126 件・手元）: 置き換え前 341 秒 → 置き換え後 286 秒。
//   ⚠ 3 回連続で 126 件すべて通ることを確かめてから、この形にした。

// 直前の `waitForFunction` が既に条件を見ている。その後の描き終わりぶん
const settleAfterCondition = (page) => page.waitForTimeout(300);

// 押した結果が描き終わるまで。⚠ **この画面は枠組みを使っていないので DOM は同期で変わる**。
//   残っているのは CSS の遷移ぶん
const settleAfterClick = (page) => page.waitForTimeout(400);

// ⚠ **押した先で画面が寄る（滑らかスクロール）ときは、これを使う。**
//   ⚠ **決め打ちの待ちだと、速い機械で通って CI で落ちる。**
//     実測（2026-08-20・CPU を 6 倍遅くして再現）: 400ms では写真が **0%** しか見えず、
//     ⚠ **止まるまで待てば 100%**。⚠ 決め打ちの待ちを縮めた PR で 1800ms → 400ms にした
//     箇所で、実際に CI が落ちた（⚠ **手元の速い機械では 3/3 通っていた**）。
//   ⚠ **時間ではなく「動きが止まったこと」を見る。**
const settleAfterScroll = async (page) => {
  await page.waitForFunction(() => {
    const y = Math.round(window.scrollY);
    if (window.__lastScrollY === y) return true;
    window.__lastScrollY = y; return false;
  }, null, { timeout: 30000, polling: 250 });
  await page.evaluate(() => { delete window.__lastScrollY; });
  await settleAfterCondition(page);
};

const SWALE_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/swale/**";
const LFC_ROUTE = "**://maps.gsi.go.jp/xyz/experimental_landformclassification*/**";
const DEM_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/dem*/**";
const forbid = (page, route) => page.route(route, (r) => r.fulfill({
  status: 403, contentType: "text/html", body: "<html><body>403 Forbidden</body></html>" }));

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
      // ⚠ **取得方法の字は words.js が持つ。**⚠ **ここに書き写さない。**
      //   ⚠ 2026-08-20 に踏んだ（#9c に続いて 2 回目）: この検査が「直読み」を直接書いていて、
      //     ⚠ **字を言い直したら、製品ではなく検査が落ちた**（掟: 同じ問いに答える実装を2つ持たない）。
      must(own.includes(WORDS.METHOD.read),
        `取得方法のバッジが出ていない（「${WORDS.METHOD.read}」を探した）`);
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
      // 〈ごはん〉と同じ「外部のサイト」のタグを下げていた頃は、判定から出た語だと分からなかった。
      // ⚠ 字は words.js。⚠ **ここに書き写すと、言い直したときに検査が落ちる**
      const badTag = sug.filter((s) => s.tag !== WORDS.TAG.why);
      must(!badTag.length, `提案のタグが違う: ${badTag.map((s) => `${s.label}=${s.tag}`).join(" / ")}`);
      // 並びの原則は「この場所に固有なものほど上」。ハザードマップ・地理院地図は
      // 座標を渡すだけでどこでも中身が同じなので、判定から出た語より下に来ること。
      const rows = await rowsOf(page);
      const lastWhy = rows.map((r) => r[0]).lastIndexOf(WORDS.TAG.why);
      const firstFixed = rows.findIndex((r) => /ハザードマップ|地理院地図/.test(r[1]));
      must(lastWhy >= 0 && firstFixed > lastWhy,
        `固定リンクが判定から出た語より上にいる: ${rows.map((r) => r[1]).join(" / ")}`);
      // この土地の判定から出た行のタグの色は、判定バッジと同じであること。ベージュ固定にしていたときは、
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
      // ⚠ 溶接してよいのは「今昔の中で開くもの」と「この土地の判定から出たもの」だけ。
      //   ⚠ **字は words.js から取る。**ここに書き写すと、言い直したときに検査が落ちる
      const weldable = [WORDS.TAG.own, WORDS.TAG.why];
      must(weld.tags.every((t) => weldable.includes(t)),
        `この場所の判定から出ていない行まで溶接している: ${weld.tags.join(" / ")}`
          + `（溶接してよいのは ${weldable.join(" / ")}）`);
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
      must(VERDICT_SENTENCE.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
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
    // ⚠ **出典明示は利用の条件であって、飾りではない。**
    //   国土地理院タイル: 出典明示が利用の条件
    //   OpenStreetMap:   ODbL でクレジット必須
    //   /peel は空中写真と建物を**全面に**出している画面。
    //
    // ⚠ 実際に破れていた（2026-08-17。UI/UX レビュー役の指摘 → 実測で確定）:
    //   ・`attributionControl:false` ＋ CSS の `display:none!important` で地図側の帰属を消していた
    //   ・手書きの出典は**左パネルの中**。パネルはスマホで閉じて始まる（panelOpen=!isNarrow）
    //   ・実測: PC 1280×800 で y=920（画面外 120px 下）／375×667 は閉じたパネルの中
    //   ・直したあとも、一度は **#hud（z-index 12）の裏**に隠れていた
    //   ・OSM の建物データに `attribution` が無く、ODbL のクレジットが出ていなかった
    //
    // ⚠ **「ある」と「見えている」は別。** `checkVisibility()` は
    //   閉じたパネルの中でも true を返した。
    // ⚠ `elementFromPoint` でも駄目だった（2026-08-17 に壊して気づいた）。
    //   `#hud` は `pointer-events:none` なので**当たり判定に出てこない**。
    // ⚠ 画素で見比べるのも駄目だった。**3D 地図は常に描き直している**ので、
    //   HUD を消していなくても絵が変わる（同じ条件で 2 枚撮っても一致しない）。
    //   → **矩形の交差で見る。** HUD の中で地色や枠線を持つ板が、
    //     帰属表示の枠に 1px でも重なっていないこと。
    //   ⚠ 実際に守っているのは z-index ではなく **HUD の下の余白**。
    //     余白を削ると板が下りてきて重なる。だからここが本当の見張り。
    name: "さかのぼる（出典が、開かなくても画面に出ている）", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      // ⚠ 3 幅で見る。狭い幅は板が増えて裏に入りやすい
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib");
          if (!at) return { there: false };
          const b = at.getBoundingClientRect();
          const text = at.innerText.replace(/\s+/g, " ").trim();
          // その座標を占めているのは帰属表示自身か（裏に隠れていないか）
          const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
          const top = document.elementFromPoint(cx, cy);
          // ⚠ パネルを開かないと読めないものは、出典として数えない
          const panel = document.getElementById("panel");
          const inPanel = !!panel && panel.contains(at);
          return { there: true, text,
            inView: b.top >= 0 && b.bottom <= innerHeight && b.width > 0 && b.height > 0,
            covered: !(top && (at === top || at.contains(top))),
            coveredBy: top ? (top.id || String(top.className) || top.tagName) : "",
            inPanel, w: Math.round(b.width), h: Math.round(b.height) };
        });
        must(r.there, `${w}×${h}: 地図の帰属表示が無い（出典明示は利用の条件）`);
        must(r.inView, `${w}×${h}: 帰属表示が画面の外にある`);
        // ⚠ HUD の板が、帰属表示の枠に重なっていないこと
        const over = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib").getBoundingClientRect();
          const hits = [];
          for (const e of document.querySelectorAll("#hud *")) {
            const r = e.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const cs = getComputedStyle(e);
            // 地色も枠線も無いものは、上に塗らないので数えない
            if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderTopWidth === "0px") continue;
            if (r.left < at.right && at.left < r.right && r.top < at.bottom && at.top < r.bottom)
              hits.push(`<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : "." + String(e.className).split(" ")[0]}>`
                + ` y=${Math.round(r.top)}..${Math.round(r.bottom)}`);
          }
          return hits;
        });
        must(!over.length,
          `${w}×${h}: 帰属表示に HUD の板が重なっている: ${over.join(" ／ ")}`);
        must(!r.inPanel, `${w}×${h}: 帰属表示が畳めるパネルの中にある（閉じると消える）`);
        // ⚠ 名前を字で確かめる。控えを表示していても、名前が出ていなければ意味がない
        must(r.text.includes("国土地理院"), `${w}×${h}: 国土地理院が出ていない: 「${r.text}」`);
        must(/OpenStreetMap/.test(r.text), `${w}×${h}: OpenStreetMap が出ていない: 「${r.text}」`);
        must(/©/.test(r.text), `${w}×${h}: ODbL のクレジット（©）が出ていない: 「${r.text}」`);
        out.push(`${w}×${h}: ${r.w}×${r.h}px`);
      }
      // ⚠ **中央（いま調べている地点）を覆っていないこと。** 帰属表示の場所を作るために
      //   HUD を押し上げると、そこが隠れる。375×667 で見る
      //   （⚠ 320×640 は**もともと覆っている別の不具合**があるので、ここでは見ない）
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(700);
      const hud = await page.evaluate(() =>
        ({ top: Math.round(document.getElementById("hud").getBoundingClientRect().top),
           mid: Math.round(innerHeight / 2) }));
      must(hud.top > hud.mid,
        `375×667: HUD が画面中央（調べている地点 y=${hud.mid}）を覆っている: HUD 上端 ${hud.top}`);
      return `国土地理院・© OpenStreetMap contributors が、開かなくても画面に出ている`
        + `（${out.join(" ／ ")}）／HUD 上端 ${hud.top} は中央 ${hud.mid} より下`;
    },
  },
  {
    // ⚠ **下から伸びる箱が、答えの板を押しのけてはいけない。**
    //   実測（2026-08-19・320×480・過去の段）: #hud が #land に **92px** 食い込み、
    //   「99.6%」の 4 文字しか読めず、答えの下端を受け取るのは #over だった。
    //   ⚠ **画面が低いほど、いちばん強い実測（当時 533 / 533 件すべてを判定）が消える**作りだった。
    // ⚠ CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」を再び踏んだ。
    //   #land は top:62px の固定、#hud は bottom:0 から上へ伸びる。別々に置くと必ずぶつかる。
    // ⚠ **潰すのも駄目。**上限だけ掛けたら 129px の中身が 27px になった（隠れていたのが
    //   潰れただけで、読めないのは同じ）。答えには下限を切り、下の箱が譲る。
    name: "画面が低くても、答えの板が下の箱に食われない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 480 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ 過去の段がいちばん厳しい（#over が増える）
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "500"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const land = document.getElementById("land"), lr = land.getBoundingClientRect();
        const hud = document.getElementById("hud"), hr = hud.getBoundingClientRect();
        const first = land.querySelector("*");
        const fr = first ? first.getBoundingClientRect() : null;
        const who = fr ? document.elementFromPoint(
          Math.round(fr.x + fr.width / 2), Math.round(fr.y + 6)) : null;
        return { landH: Math.round(lr.height), landScroll: land.scrollHeight,
          hudTop: Math.round(hr.top), landBottom: Math.round(lr.bottom),
          lap: Math.round(Math.max(0, lr.bottom - hr.top)),
          hit: who ? (who.id || who.closest("[id]")?.id || String(who.className).split(" ")[0]) : "無い",
          text: land.innerText.replace(/\s+/g, " ").trim() };
      });
      must(r.lap === 0, `下の箱が答えに ${r.lap}px 食い込んでいる（答えの下端 ${r.landBottom} / 箱の上端 ${r.hudTop}）`);
      // ⚠ 「重ならない」だけでは足りない。**潰れていない**ことまで見る
      must(r.landH >= 100, `答えの板が ${r.landH}px まで潰れている（読めない）`);
      // ⚠ 答えの 1 行目を、答え自身が受け取っていること（何かが上に乗っていない）
      must(r.hit === "land" || /land/.test(r.hit),
        `答えの 1 行目を「${r.hit}」が受け取っている（上に何か乗っている）`);
      // ⚠ 中身が入りきらないときは、消さずに中でスクロールさせる
      must(/99\.6%|件の足元を判定/.test(r.text), `答えが消えている: ${r.text.slice(0, 40)}`);
      return `320×480・過去の段で 重なり ${r.lap}px ／ 答え ${r.landH}px（中身 ${r.landScroll}px）`
        + ` ／ 1 行目を受け取るのは ${r.hit}`;
    },
  },
  {
    // ⚠ **見えないものに焦点を当てない。**（掟: 押しても何も起きない導線を置かない）
    //   実測（2026-08-19）: 幅ごとに使わない側の操作が DOM に残り、キーボードで到達できた。
    //     320 幅 … #timeToggle / #play / #t とドラムのボタン 9 個
    //     PC     … ドラムのボタン 9 個（⚠ これは main からあった漏れ）
    //     根拠を全画面で読んでいるとき … #toggle / #eraToggle / ものさしの ‹ ›
    //   ⚠ #timeToggle は aria-expanded="true" のまま残っていた（開いている折りたたみに聞こえる）。
    name: "見えない操作に、キーボードで届かない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const leaks = () => page.evaluate(() => {
        const bad = [...document.querySelectorAll("button,input,a[href]")].filter((e) => {
          const r = e.getBoundingClientRect();
          return e.tabIndex >= 0 && r.width === 0 && !e.closest("[inert]") && !e.inert;
        });
        return bad.map((e) => e.id || e.textContent.trim().slice(0, 8) || e.tagName);
      });
      // ⚠ **`e.inert` は親から継いだ状態を返さない。**
      //   実測（2026-08-19）: 親（#ruler）を inert にしても、子の ‹ › は e.inert=false のままで、
      //   ⚠ 「閉じすぎる」を壊しても検査が緑になった。**closest で親まで見る。**
      const used = (ids) => page.evaluate((ids) => ids.filter((id) => {
        const e = document.getElementById(id);
        return !e || e.inert || !!e.closest("[inert]");
      }), ids);

      // ---- 地図を見ているとき ----
      const a = await leaks();
      // ⚠ ✕ は根拠を開くと出るので、ここに居てよい（閉じているあいだは幅 0）
      const aBad = a.filter((x) => x !== "closePanel");
      must(!aBad.length, `見えないのに焦点が当たる: ${aBad.join("、")}`);
      // ⚠ 使う側まで閉じていないこと（閉じすぎると操作できなくなる）
      const aStuck = await used(["rlPrev", "rlNext", "toggle"]);
      must(!aStuck.length, `使う操作が閉じている: ${aStuck.join("、")}`);
      // ⚠ 隠れているのに「開いている折りたたみ」と名乗らない
      const ae = await page.evaluate(() =>
        document.getElementById("timeToggle")?.getAttribute("aria-expanded"));
      must(!ae, `見えない #timeToggle が aria-expanded="${ae}" と名乗っている`);

      // ---- 根拠を全画面で読んでいるとき ----
      await page.click("#toggle");
      await settleAfterClick(page);
      const b = await leaks();
      must(!b.length, `根拠を読んでいるのに、地図側の操作に焦点が当たる: ${b.join("、")}`);
      // ⚠ 戻る手段は閉じない
      const bStuck = await used(["closePanel", "back"]);
      must(!bStuck.length, `戻る手段が閉じている: ${bStuck.join("、")}`);

      // ---- 閉じたら元に戻る ----
      await page.click("#closePanel");
      await settleAfterClick(page);
      const c = await used(["rlPrev", "rlNext", "toggle"]);
      must(!c.length, `根拠を閉じたのに、操作が閉じたまま: ${c.join("、")}`);
      return `地図のとき ${aBad.length} 件／根拠を読むとき ${b.length} 件／閉じたら戻る`;
    },
  },
  {
    // ⚠ 年代の箱・年代を動かす帯の**頭**を細くする。狭い画面ほど地図が見えなくなるため。
    //   実測（2026-08-19・320幅・1936–42 の段）: 箱が画面の **82%** を占めていた。
    //     年代 76px（⚠ 2 行に割れて 38px 損）／但し書き 69px／いまのもの 42px／押すと 30px
    // ⚠ **押せる大きさ 44×44 は削らない**（掟）。削るのは見た目の幅だけ。
    // ⚠ 「表示中」は消すが、**出ていないときは必ず名乗る**
    //   （「出ていないものを表示中と言わない」で入れた性質。崩さない）。
    name: "年代の頭を細くしても、押せる大きさと名乗りは残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const at = (k) => page.evaluate((k) => {
        const s = document.getElementById("t");
        if (Number(s.max) < k * 100) return false;
        s.value = String(k * 100); s.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }, k);
      const read = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right),
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        // ⚠ 文字が本当に箱に収まっているか。**枠ではなく文字の実寸**で見る
        const y = document.querySelector("#era .y");
        const rng = document.createRange(); rng.selectNodeContents(y);
        const tr = rng.getBoundingClientRect();
        const box = document.getElementById("era").getBoundingClientRect();
        const kick = document.querySelector("#era .kick");
        const vis = (sel) => { const e = document.querySelector(sel);
          if (!e) return null; const r = e.getBoundingClientRect();
          return r.height < 1 ? null : g(sel); };
        return { y: g("#era .y"), et: g("#eraToggle"), tt: vis("#timeToggle"),
          textW: Math.round(tr.width), boxRight: Math.round(box.right), textRight: Math.round(tr.right),
          kickText: kick ? kick.textContent.trim() : null,
          eraH: Math.round(box.height) };
      });
      // ---- ① どの段でも、年代は 1 行で、箱からはみ出さない ----
      const heights = [];
      for (let k = 0; k < 9; k++) {
        if (!await at(k)) break;
        await page.waitForTimeout(250);
        const r = await read();
        must(r.y.h <= 46, `年代「${r.y.t}」が 2 行に割れている（${r.y.h}px）。そのぶん地図が減る`);
        must(r.textRight <= r.boxRight, `年代「${r.y.t}」が箱からはみ出している`);
        // ⚠ **普段は名乗らない。**出ているのが当たり前のときに主役から目を奪わない
        must(!r.kickText, `届いているのに「${r.kickText}」と名乗っている`);
        heights.push(r.eraH);
      }
      must(heights.length >= 4, `段が少なすぎて検査にならない（${heights.length}）`);

      // ---- ② 開閉は細いが、押せる大きさは 44px を割らない ----
      const r = await read();
      // ⚠ **狭い幅に「帯の開閉」はもう無い。**（2026-08-19・ものさしに置き換えた）
      //   帯は見出し行ごと畳めなくなり、代わりに ‹ › と軸で動かす。
      //   ⚠ 守りたかったのは「開閉は細いが、押す大きさは削らない」ほうなので、
      //     **残っている開閉（年代の箱）で見る**。消したのではなく、対象が減った。
      //   ⚠ 帯の側は「ものさしで全体が見え、端まで届く」が別に見ている。
      must(r.tt === null || r.tt.h === 0,
        `狭い幅に帯の開閉が残っている（${r.tt?.w}×${r.tt?.h}）。ものさしに置き換えたはず`);
      for (const [nm, x] of [["年代の開閉", r.et]]) {
        must(x, `${nm} が無い`);
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
        must(x.w <= 52, `${nm} が細くなっていない（${x.w}px）。狭い画面で幅を食う`);
        must(x.hit === "eraToggle", `${nm} を押しても、当たるのは「${x.hit}」`);
      }
      // ⚠ 記号だけにしたぶん、**読み上げには名乗りを残す**
      // ⚠ 帯の開閉は狭い幅に無いので、年代の箱だけ見る
      const aria = await page.evaluate(() => [
        document.getElementById("eraToggle").getAttribute("aria-label")]);
      for (const a of aria) must(a && a.length > 3, `開閉ボタンの読み上げの名乗りが無い（${a}）`);
      // ⚠ 記号の向きは CSS が回す。**JS と二重に反転させない**（一度踏んだ）
      const before = await page.evaluate(() => {
        const c = document.querySelector("#eraToggle .chevron");
        return { ch: c.textContent, rot: getComputedStyle(c).transform };
      });
      await page.click("#eraToggle");
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => {
        const c = document.querySelector("#eraToggle .chevron");
        return { ch: c.textContent, rot: getComputedStyle(c).transform,
          expanded: document.getElementById("eraToggle").getAttribute("aria-expanded"),
          aria: document.getElementById("eraToggle").getAttribute("aria-label") };
      });
      must(after.ch === before.ch,
        `記号そのものを差し替えている（${before.ch}→${after.ch}）。回転と二重になって向きが狂う`);
      must(after.rot !== before.rot, `閉じても記号の向きが変わっていない`);
      must(after.expanded === "false", `閉じたのに aria-expanded が ${after.expanded}`);
      must(/開く/.test(after.aria ?? ""), `閉じたのに読み上げが「${after.aria}」のまま`);
      return `320 幅・全 ${heights.length} 段とも年代は 1 行で箱に収まる`
        + `／#era ${Math.min(...heights)}〜${Math.max(...heights)}px`
        + `／年代の開閉 ${r.et.w}×${r.et.h}px（読み上げあり）／帯の開閉は無い（ものさし）`;
    },
  },
  {
    // ⚠ **根拠を全画面で読んでいる最中に、地図へ戻る手段が消えてはいけない。**
    //   実測（2026-08-18・375×667）: ✕ はパネルの中で position:absolute だったので、
    //   パネルと一緒に流れて **400px スクロールで y=-298**（画面外）。
    //   押した座標には**何も無かった**（掟: 押しても何も起きない導線を置かない）。
    //   ⚠ 残る「← 今昔へ」はトップへ帰る**別の操作**なので、代わりにならない。
    // ⚠ 直し方は「位置を固定値で足す」ではなく、**同じ積み上げに入れる**
    //   （CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」）。
    name: "根拠を全画面で読んでも、戻る 2 つが上に残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ 地図だけ見ているときは ✕ を出さない（押しても何も起きない導線を置かない）
      const beforeOpen = await page.evaluate(() => {
        const e = document.getElementById("closePanel");
        return { shown: !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0 };
      });
      must(!beforeOpen.shown, "根拠を開いていないのに「✕ 地図へ」が出ている");

      await page.click("#toggle");
      await settleAfterClick(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            inView: r.top >= 0 && r.bottom <= innerHeight,
            // ⚠ 矩形だけでは足りない。**その座標を誰が受け取るか**で見る
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        const pan = document.getElementById("panel");
        return { back: g("#back"), close: g("#closePanel"), scrollH: pan.scrollHeight, viewH: innerHeight };
      });
      const a = await look();
      must(a.close, "「✕ 地図へ」が無い");
      // ⚠ 指で押せる大きさ
      for (const [nm, b] of [["← 今昔へ", a.back], ["✕ 地図へ", a.close]]) {
        must(b.w >= 44 && b.h >= 44, `${nm} が指で押せない（${b.w}×${b.h}）`);
        must(b.hit === (nm === "← 今昔へ" ? "back" : "closePanel"),
          `${nm} を押しても、当たるのは「${b.hit}」`);
      }
      // ⚠ 2 つは離れていること。以前 10px まで詰まって 3/3 が苦情を出した
      must(a.close.x - a.back.right >= 80,
        `2 つが近すぎる（間隔 ${a.close.x - a.back.right}px）。押し間違える`);

      // ⚠ **本題。** パネルの中身より深くスクロールしても、両方が残る
      must(a.scrollH > a.viewH, `中身が画面に収まっていて、スクロールの検査にならない`);
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 400; });
      await page.waitForTimeout(400);
      const b = await look();
      for (const [nm, x] of [["← 今昔へ", b.back], ["✕ 地図へ", b.close]]) {
        must(x.inView, `スクロールしたら ${nm} が画面から出た（y=${x.y}）`);
        must(x.hit === (nm === "← 今昔へ" ? "back" : "closePanel"),
          `スクロール後に ${nm} を押しても、当たるのは「${x.hit}」`);
      }
      // ⚠ 帯が中身を覆っていないこと。**いちばん上まで戻してから**見る。
      //   ⚠ スクロールしたあとで見て取りこぼした（中身が上へ逃げているので当たらない）。
      //   ⚠ 余白を外すと、地名と答え（99.6%）がそのまま帯の下に入る（実測 2026-08-19）。
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 0; });
      await page.waitForTimeout(300);
      const under = await page.evaluate(() => {
        const bar = document.getElementById("chrome").getBoundingClientRect();
        const hit = [];
        for (const el of document.querySelectorAll("#panel #placeName, #panel #landAll, #panel #result")) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.top < bar.bottom && r.bottom > bar.top && r.left < bar.right && r.right > bar.left)
            hit.push(`${el.id} y=${Math.round(r.top)}`);
        }
        return { hit, barBottom: Math.round(bar.bottom) };
      });
      must(!under.hit.length,
        `帯が中身を覆っている（帯の下端 ${under.barBottom} / ${under.hit.join("、")}）`);

      // ⚠ ✕ を押したら本当に地図へ戻る
      await page.click("#closePanel");
      await settleAfterClick(page);
      const closed = await page.evaluate(() => ({
        hidden: document.getElementById("panel").classList.contains("hide"),
        closeShown: getComputedStyle(document.getElementById("closePanel")).display !== "none" }));
      must(closed.hidden, "✕ を押しても根拠が閉じない");
      must(!closed.closeShown, "閉じたのに ✕ が残っている");
      return `← x=${a.back.x}..${a.back.right} ／ ✕ x=${a.close.x}..${a.close.right}（間隔 ${a.close.x - a.back.right}px）`
        + ` ／ 中身 ${a.scrollH}px を 400px スクロールしても両方 y=${b.back.y}・${b.close.y} で残る`;
    },
  },
  {
    // ⚠ **落ちたことを実際に観測できたときだけ「読み込めませんでした」と言う。**
    //   実測（2026-08-18・tmp/probe-map-error.mjs・豊洲）。拾えるものは落とし方で違う:
    //     404（写真が無い） … map.on("error") が来ない（MapLibre は 404 を異常と見なさない）
    //     403（拒否）       … 106 回。status 403
    //     通信断            … 76 回。status 0
    //   ⚠ **404 は「遅い」と区別できない。** だから 404 は「まだ出ていません」に留める。
    // ⚠ 接続の話は、こちらが知っている範囲でしか言わない。
    //   圏外だと端末が言っているときだけ言い切り、つながっているなら「確認してください」。
    name: "落ちたと分かったときだけ、そう言う（404 は断定しない）", path: `/peel?${TOYOSU}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href),
      (r) => r.abort("connectionrefused")),
    async check(page) {
      // ⚠ **時間ではなく、接続の断りが出たことを待つ。**
      //   ⚠ 断りが出たことだけを待ち、⚠ **何と書いてあるかは下で確かめる**（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => (document.querySelector("#era .era-net")?.textContent.trim() ?? "") !== "",
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const e = document.getElementById("era");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), y: t(".y"), s: t(".s"), net: t(".era-net") };
      });
      must(/読み込めませんでした/.test(r.s), `落ちたのに、そう書いていない: ${r.s}`);
      must(/通信できません/.test(r.s), `観測した理由が書かれていない: ${r.s}`);
      // ⚠ つながっている（onLine=true）ので、言い切らない
      must(r.net === "接続を確認してください",
        `つながっているのに「${r.net}」と言い切っている`);
      must(!/が無い|存在しません/.test(r.s + r.net), `落ちたことを「無い」と書いている: ${r.s}`);
      must(r.y === "現在", `どの年代を見ているのかが消えた: ${r.y}`);
      return `${r.kick} / ${r.y} / ${r.s} ＋${r.net}`;
    },
  },
  {
    // ⚠ **404 は「読み込めませんでした」と言わない。**
    //   MapLibre が error を出さないので、こちらは「遅い」のか「その写真が無い」のかを
    //   知らない。知らないことを断定しない（掟: 取得できなかった ≠ 存在しなかった）。
    name: "404 のときは、理由を断定しない", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href),
      (r) => r.fulfill({ status: 404, body: "" })),
    async check(page) {
      await page.waitForTimeout(3500);
      const r = await page.evaluate(() => {
        const e = document.getElementById("era");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), s: t(".s"), net: t(".era-net") };
      });
      must(r.kick !== "表示中", `出ていないのに「${r.kick}」と言っている`);
      must(!/読み込めませんでした/.test(r.s),
        `404 は observe できていないのに「読み込めませんでした」と断定している: ${r.s}`);
      must(!r.net, `理由を知らないのに接続のせいにしている: ${r.net}`);
      must(!/が無い|ありません|存在しません/.test(r.s), `「無い」と言い切っている: ${r.s}`);
      return `${r.kick} / ${r.s}（接続の話はしない）`;
    },
  },
  {
    // ⚠ 圏外だと端末が言っているときだけ、言い切ってよい。
    name: "圏外のときだけ、接続していないと言い切る", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
      await page.route((u) => /seamlessphoto/.test(u.href), (r) => r.abort("connectionrefused"));
    },
    async check(page) {
      // ⚠ **時間ではなく、接続の断りが出たことを待つ。**
      //   ⚠ 断りが出たことだけを待ち、⚠ **何と書いてあるかは下で確かめる**（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => (document.querySelector("#era .era-net")?.textContent.trim() ?? "") !== "",
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const net = await page.evaluate(() =>
        document.querySelector("#era .era-net")?.textContent.trim() ?? "");
      must(/接続していません/.test(net), `圏外なのに「${net}」に留めている`);
      return `圏外 → 「${net}」`;
    },
  },
  {
    // ⚠ **出ていないものを「表示中」と言わない。**
    //   実測（2026-08-18）: 地表のタイルを落としても画面はいちばん大きい文字で
    //   「表示中 現在 / 最新の空中写真」と言い続けた。写真は 1 枚も出ていないのに。
    //   利用者役 3/3 が「これが主犯」「間違ったことを自信満々に書いている画面は、
    //   他の記述も疑わしくなる」と答えた。
    // ⚠ **すぐには切り替えない。**実測（tmp/probe-ground-arrival.mjs）:
    //   通常回線は 69ms〜403ms で届く。すぐ切り替えると段を送るたびに光る。
    //   1.2 秒たっても来ていないときだけ言う。
    name: "出ていない地面を「表示中」と言わない", path: `/peel?${TOYOSU}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く
    setup: (page) => page.route((u) => /seamlessphoto/.test(u.href), async (r) => {
      await new Promise((k) => setTimeout(k, 6000));
      await r.continue();
    }),
    async check(page) {
      const read = () => page.evaluate(() => {
        const e = document.getElementById("era");
        const t = (s) => e.querySelector(s)?.textContent.trim() ?? "";
        return { kick: t(".kick"), y: t(".y"), s: t(".s") };
      });
      // ① 地表が来ていないあいだ
      await page.waitForTimeout(2500);
      const away = await read();
      must(away.kick !== "表示中",
        `写真が出ていないのに「${away.kick}」と言っている`);
      must(!/空中写真$/.test(away.s),
        `出ていない写真を、出ているように書いている: ${away.s}`);
      // ⚠ 理由は知らない。断定しない
      must(!/読み込めませんでした|取得できませんでした/.test(away.s),
        `落ちたのか、まだなのかを知らないのに断定している: ${away.s}`);
      must(!/通信|電波|接続/.test(away.s), `通信のせいにしている: ${away.s}`);
      // ⚠ 段そのものは選ばれている。年は消さない
      must(away.y === "現在", `どの年代を見ているのかが消えた: ${away.y}`);
      // ② ⚠ **届いたら、元に戻る。**
      //   ⚠ 6 秒と決め打たず、⚠ **名乗りが消えたこと**（＝届いた合図）を待つ。
      //   ⚠ 説明が戻っているかは下で確かめる（待ちに主張を混ぜない）
      await page.waitForFunction(
        () => !(document.querySelector("#era .kick")?.textContent.trim() ?? ""),
        null, { timeout: 30000 });
      await settleAfterCondition(page);
      const back = await read();
      // ⚠ **届いたら名乗らない**（2026-08-19 に変えた）。名乗るのは出ていないときだけ。
      //   ⚠ 守りたいのは「出ていないものを表示中と言わない」ほうで、名乗りの有無ではない。
      must(!back.kick, `届いたのに「${back.kick}」と名乗っている（普段は名乗らない）`);
      must(/空中写真/.test(back.s), `届いたのに説明が戻っていない: ${back.s}`);
      return `届いていないあいだ「${away.kick} ${away.y} / ${away.s}」`
        + ` → 届いたら「${back.kick} ${back.y} / ${back.s}」`;
    },
  },
  {
    // ⚠ **普通につながっている人には、一度も出さない。**
    //   実測（tmp/probe-ground-arrival.mjs・2026-08-18）: 現在 69ms・段の切替 0〜403ms。
    //   猶予（1.2 秒）を外すと、段を送るたびに 0〜0.4 秒だけ「まだ出ていません」が光る。
    // ⚠ 320 幅では 2 行になる。隣（閉じる）と重ならないことまで見る。
    name: "普通につながっていれば「まだ出ていません」は出ない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 },
    async check(page) {
      await peelReady(page);
      const seen = await page.evaluate(async () => {
        const e = document.getElementById("era"), hit = [];
        // 段を全部送りながら、名乗りを拾い続ける
        for (let k = 0; k < 9; k++) {
          const s = document.getElementById("t");
          if (Number(s.max) < k * 100) break;
          s.value = String(k * 100); s.dispatchEvent(new Event("input", { bubbles: true }));
          for (let i = 0; i < 40; i++) {
            hit.push(e.querySelector(".kick").textContent.trim());
            await new Promise((r) => setTimeout(r, 25));
          }
        }
        return [...new Set(hit)];
      });
      // ⚠ 普通につながっていれば、**一度も名乗らない**（＝空のまま）
      must(seen.join("／") === "",
        `普通につながっているのに「${seen.join("／")}」が出た（猶予が効いていない）`);
      // 重なりを見る。⚠ 矩形だけでは足りない。その座標を誰が受け取るかで見る
      const lap = await page.evaluate(() => {
        const e = document.getElementById("era");
        const s = e.querySelector(".s").getBoundingClientRect();
        const who = document.elementFromPoint(Math.round(s.x + s.width / 2), Math.round(s.y + s.height / 2));
        const btn = document.getElementById("eraToggle").getBoundingClientRect();
        return { taken: who?.className || who?.id || who?.tagName,
          over: !(s.right <= btn.left || btn.right <= s.left || s.bottom <= btn.top || btn.bottom <= s.top),
          right: Math.round(s.right), W: innerWidth };
      });
      must(!lap.over, `名乗りが「閉じる」と重なっている`);
      must(lap.right <= lap.W, `名乗りが画面からはみ出している（右端 ${lap.right} / 幅 ${lap.W}）`);
      return `320 幅で段を 9 つ送っても一度も名乗らない／`
        + `右端 ${lap.right} ≦ 幅 ${lap.W}／「閉じる」と重ならない`;
    },
  },
  {
    // ⚠ **古い呼び出しが、あとから新しい結果を上書きしないこと。**
    //   loadArea は 7 つの await を挟んでから area / statusEl / 地図のデータを書く。
    //   2026-08-18 まで seq は取るだけで一度も見ておらず、番人が居なかった。
    //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出るが、
    //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
    // ⚠ 相手先の速さに任せない。**こちらで 6 秒遅らせて**、確実に追い越させる。
    name: "前の場所の結果が、あとから今の場所を上書きしない", path: `/peel?${NAGOYA_LL}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く（過去に一度踏んでいる）
    setup: (page) => page.route((u) => /overpass/.test(u.href), async (r) => {
      await new Promise((k) => setTimeout(k, 6000));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ elements: [] }) });
      // ⚠ **返したことを、ページ側に印として残す。**
      //   ⚠ 下で「何秒たったか」ではなく「**古い返事が実際に返ったか**」を待つため。
      //   ⚠ 移動中は evaluate が落ちる。落ちても検査の主張は変わらない（下で待ち切れる）
      await page.evaluate(() => { window.__staleReplied = true; }).catch(() => {});
    }),
    async check(page) {
      // ① 札幌が、建物の問い合わせで待ち始めるまで待つ
      await page.waitForFunction(
        () => /建物を取得中/.test(document.getElementById("status")?.textContent ?? ""),
        null, { timeout: 30000 });
      // ② 待っている最中に、別の場所へ移る（＝再試行を押したのと同じ形）
      await page.evaluate(() => { loadArea(139.7975, 35.6548, "東京都江東区豊洲"); });
      await page.waitForFunction(
        // ⚠ **出そろってから比べる。**層は別々に返るので、途中で読むと
        //   「あとから第1層が増えた」のを上書きと取り違える（実測 2026-08-19）。
        //   ⚠ 見ている主張は変えていない: **古い呼び出しが今の答えを消さないこと**。
        () => /件の足元を判定/.test(document.getElementById("land")?.textContent ?? "")
          && typeof landform !== "undefined" && landform !== null,
        null, { timeout: 60000 });
      const mid = await page.locator("#land").textContent();
      // ③ ⚠ **古い呼び出しの返事が、実際に返ってくるまで待つ。**
      //   ⚠ 決め打ちの秒数ではなく、返ったことを見る（上の印）。
      //   ⚠ **返る前に読むと、この検査は何も見ていないことになる**
      await page.waitForFunction(() => window.__staleReplied === true,
        null, { timeout: 30000 });
      // ⚠ **ここは 300ms では足りない。**印が立つのは「返した」時点で、
      //   ⚠ **上書きするかもしれない側の処理は、そのあとに走る**。
      //   ⚠ 早く読むと「上書きされなかった」ではなく「まだ上書きしていない」を見てしまう
      await page.waitForTimeout(1000);
      const land = await page.locator("#land").textContent();
      const status = await page.locator("#status").textContent();
      must(/件の足元を判定/.test(land),
        `前の場所の返事が、いまの答えを消した: ${land.replace(/\s+/g, " ").slice(0, 80)}`);
      must(land.replace(/\s+/g, "") === mid.replace(/\s+/g, ""),
        `答えが書き換わった: ${mid.replace(/\s+/g, " ").slice(0, 60)} → ${land.replace(/\s+/g, " ").slice(0, 60)}`);
      must(!/まだ用意できていません|建物ごとには出せません|OSM に登録された建物は 0 件/.test(status),
        `前の場所の説明が、いまの場所の欄に出ている: ${status.replace(/\s+/g, " ").slice(0, 90)}`);
      return `名古屋が 6 秒待っている最中に豊洲へ移り、返事が返ったあとも `
        + `${land.replace(/\s+/g, " ").trim().slice(0, 40)}／説明も豊洲のまま`;
    },
  },
  {
    // 描画は「変わる速さ」で分けてある（peel3d.js の paint / describe）。
    // ⚠ 分ける前の実測（2026-08-18・豊洲・1280×900）:
    //   再生 1 回（11.1 秒）で台帳（17 要素）を **299 回**作り直していた。
    //   段は 9 つしかないので、298 回は同じものを組み直していたことになる。
    //
    // ⚠ **「作り直さない」だけを見ると、更新を止めても緑になる。**
    //   だから 2 つを対にして見る:
    //     同じ段の中で動かす → 作り直さない（言葉は変わらないので）
    //     隣の段へ移る       → 必ず作り直す（言葉が変わるので）
    //   片方だけでは、どちらの壊れ方も見つけられない。
    name: "同じ段で動かしても根拠は組み直さず、段が変われば必ず組み直す", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ 地表のタイルが届くと台帳は**正しく**組み直る。数え始める前に落ち着かせる
      await page.waitForTimeout(4000);
      const watch = () => page.evaluate(() => {
        window.__provHits = 0;
        window.__provObs?.disconnect();
        window.__provObs = new MutationObserver((rs) => { window.__provHits += rs.length; });
        window.__provObs.observe(document.getElementById("prov"),
          { childList: true, subtree: true, characterData: true });
      });
      // ⚠ **数えるのは、動かし終えて 1 呼吸おいてから。** MutationObserver の通知は
      //   マイクロタスクなので、同じ evaluate の中で読むと**必ず 0**になる。
      //   最初これで書いて、「組み直していない」が理由もなく緑になった（2026-08-18）。
      const scrub = async (from, to, n) => {
        const r = await page.evaluate(([from, to, n]) => {
          const s = document.getElementById("t");
          for (let k = 0; k <= n; k++) {
            s.value = String(from + (to - from) * k / n);
            s.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return { label: document.querySelector("#era .y").textContent,
                   knob: document.querySelector("#track .knob").style.left };
        }, [from, to, n]);
        await page.waitForTimeout(200);
        return { ...r, hits: await page.evaluate(() => window.__provHits) };
      };

      // ---- ① 同じ段の中を 40 回動かす。言葉は変わらないので、組み直してはいけない ----
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(300);
      await watch();
      const a = await scrub(0, 40, 40);
      must(a.hits <= 2, `同じ段の中で動かしただけで、根拠を ${a.hits} 回組み直している`
        + `（40 回動かした。分ける前はこれが 40 回だった）`);
      // ⚠ 動いていないから組み直していない、では意味がない。**絵は毎回動いている**
      must(a.knob !== "" && a.knob !== "0%", `つまみが動いていない（${a.knob}）。絵まで止めている`);

      // ---- ② 隣の段へ移る。言葉が変わるので、必ず組み直す ----
      const before = a.label;
      await watch();
      const b = await scrub(40, 100, 12);
      must(b.label !== before, `段を移ったのに年代の表示が ${before} のまま`);
      must(b.hits >= 1, `段が変わったのに根拠を組み直していない（${b.hits} 回）`
        + `。⚠ 出所が古いまま残る`);
      // ⚠ 段を 1 つ移っただけで 12 回組み直していたら、分けた意味が無い
      must(b.hits <= 4, `段を 1 つ移るのに根拠を ${b.hits} 回組み直している`);

      // ---- ③ 組み直したあとも、押せるボタンが生きている ----
      //   ⚠ 台帳の中のボタンは組み直すたびに**新しい要素**になる。張り直しを忘れると、
      //     押しても何も起きないボタンになる（掟: 押しても何も起きない導線を置かない）。
      const peek = await page.$("#prov .peek");
      must(peek, "台帳に「光らせる」ボタンが無い");
      const colorBefore = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
      const box = await peek.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(150);
      const colorDown = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await page.mouse.up();
      await page.waitForTimeout(150);
      const colorUp = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      must(colorDown !== colorBefore, "組み直したあと、光らせるボタンが効いていない");
      must(colorUp === colorBefore, "離しても色が戻っていない（別の意味の色が居座る）");
      return `同じ段で 40 回動かして組み直し ${a.hits} 回（つまみは ${a.knob} まで動いた）`
        + ` ／ 段を 1 つ移って ${b.hits} 回（${before} → ${b.label}）`
        + ` ／ 組み直したあとも光らせるボタンは効く`;
    },
  },
  {
    // ⚠ **根拠は、地図を中途半端に覆いながら読ませない。**
    //   実測（2026-08-18・`tmp/probe-panel-open-sp.mjs`。パネルを開いた状態）:
    //
    //     幅        パネルの占有   地図に触れる帯   ＋− の被覆
    //     375×667      54%          **0px**         89%
    //     344×882      53%           10px           89%
    //     320×640      53%          **0px**         89%
    //
    //   ⚠ **画面の中心（＝いま調べている地点）を受け取るのは台帳だった**（地図ではない）。
    //   ⚠ 指で押せるよう 44px に広げたズームが、開いた瞬間に押せなくなっていた。
    //
    //   → スマホでは「根拠を読むあいだは全画面」にした。地図を触るのと根拠を読むのは、
    //     同時にやる操作ではない。⚠ PC は左の縦パネルのまま（変えるのは見せ方だけ）。
    //
    // ⚠ **「閉じれば地図に戻れること」まで見る。** 全画面にしただけで戻れなければ、
    //   0px の状態と変わらない（掟: 押しても何も起きない導線を置かない）。
    // ⚠ **戻る手段を 2 つとも見る。** ✕ は「根拠を閉じて地図へ」、
    //   ← は「今昔へ帰る」で**別の操作**。全画面にしたとき ← が下敷きになった（実測）。
    name: "スマホの根拠は全画面で読み、閉じれば地図に戻る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const pan = document.getElementById("panel");
        const pr = pan.getBoundingClientRect();
        const open = !pan.classList.contains("hide");
        const box = (sel) => { const e = document.querySelector(sel);
          if (!e) return null; const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
                   x: Math.round(r.x), y: Math.round(r.y) }; };
        // その座標を実際に受け取るのは誰か。⚠ 地図かどうかは **#map の中か**で見る
        //   （className を文字にすると SVG は "[object SVGAnimatedString]" になる。一度踏んだ）
        const map = document.getElementById("map");
        const who = (x, y) => { const e = document.elementFromPoint(x, y);
          if (!e) return { inMap: false, name: "無い" };
          return { inMap: !!map && map.contains(e),
                   name: e.id || e.tagName.toLowerCase() }; };
        return { open,
          cover: open ? Math.round(pr.width * pr.height / (W * H) * 100) : 0,
          center: who(Math.round(W / 2), Math.round(H / 2)),
          land: box("#land"), close: box("#closePanel"), back: box("#back"),
          zoom: box(".maplibregl-ctrl-group"),
          // ⚠ **箱があるだけでは「見えている」ではない。**その座標を自分が受け取るかまで見る
          //   （矩形は覆われていても返る。このリポジトリが何度も踏んでいる）
          backOnTop: (() => { const e = document.getElementById("back");
            if (!e) return false; const r = e.getBoundingClientRect();
            const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
            return !!t && (e === t || e.contains(t)); })() };
      });
      // (1) 閉じている初期状態: 答えは地図の上に出ていて、地図の中心は地図が受け取る
      const shut = await look();
      must(!shut.open, "スマホでパネルが開いて始まっている（地図が見えない）");
      must(shut.land && shut.land.h > 0, "閉じているのに、答えの板が出ていない");
      must(shut.center.inMap,
        `閉じているのに、画面の中心（＝調べている地点）を地図が受け取っていない: ${shut.center.name}`);
      // (2) 開いたら**全画面**。中途半端に覆わない
      await page.click("#toggle");
      await settleAfterClick(page);
      const open = await look();
      must(open.open, "☰ を押しても開かない");
      must(open.cover >= 95,
        `根拠が地図を中途半端に覆っている: 画面の ${open.cover}%（全画面にするか、覆わないかの二択）`);
      // ⚠ 戻る手段が 2 つとも、指で押せる大きさで見えていること
      must(open.close && open.close.h >= 44 && open.close.w >= 44,
        `根拠を閉じる ✕ が指で押せない: ${JSON.stringify(open.close)}`);
      must(open.back && open.back.h >= 44 && open.back.y >= 0 && open.back.y < 200,
        `全画面で「← もどる」が指で押せる大きさで無い: ${JSON.stringify(open.back)}`);
      // ⚠ **覆われていないことまで見る。**矩形だけ見ていたときは、
      //   パネルの下敷きにしても緑のままだった（2026-08-18 に壊して気づいた）
      must(open.backOnTop,
        "全画面で「← もどる」がパネルの下敷きになっている（戻る手段は常に見えている場所に）");
      // (3) 閉じれば地図に戻る
      await page.click("#closePanel");
      await settleAfterClick(page);
      const again = await look();
      must(!again.open, "✕ を押しても閉じない");
      must(again.center.inMap,
        `閉じたのに地図へ戻っていない（中心を受け取るのが ${again.center.name}）`);
      must(again.zoom && again.zoom.h >= 44, `閉じてもズームが押せる大きさで出ていない: ${JSON.stringify(again.zoom)}`);
      // (4) ⚠ **← と ✕ の行き先が、押す前に分かること。**
      //   利用者役 3/3 が「どちらが今の場所を捨てるボタンか分からない」「怖いので押さない」
      //   と答えた（両方とも「もどる」系の見た目だったため）。
      //   ⚠ 字が出ているだけでなく、**2 つが違う字**であること。
      await page.click("#toggle"); await page.waitForTimeout(600);
      //   ⚠ **記号（← / ✕）を落としてから比べる。**落とさずに比べると、
      //     行き先の字が同じでも記号の差で「違う」になり、この検査は何も見ていない
      //     （2026-08-18 に壊して気づいた）。
      const label = await page.evaluate(() => {
        const word = (id) => (document.getElementById(id)?.innerText ?? "")
          .replace(/[←✕×\s]/g, "");
        return { back: word("back"), close: word("closePanel") };
      });
      must(label.back.length > 1 && label.close.length > 1,
        `全画面で、戻る手段の行き先が字で出ていない: ← 「${label.back}」／✕ 「${label.close}」`);
      must(label.back !== label.close,
        `← と ✕ の行き先が同じ字になっている: どちらも「${label.back}」`);
      // (5) ⚠ **「光らせる」を押したら、光る先（地図）が見えること。**
      //   全画面のままだと、押しても何も起きないボタンになる（3/3 が「二度と押さない」）。
      const peek = page.locator("#peekH");
      if (await peek.count()) {
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const box = await peek.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        const held = await page.evaluate(() => ({
          open: !document.getElementById("panel").classList.contains("hide"),
          inMap: (() => { const m = document.getElementById("map");
            const e = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
            return !!m && !!e && m.contains(e); })(),
        }));
        await page.mouse.up();
        must(!held.open && held.inMap,
          "「光らせる」を押しても全画面のままで、光る先の地図が見えない"
          + `（パネル開=${held.open} / 中心は地図=${held.inMap}）`);
      }
      return `閉じ: 答えの板 ${shut.land.w}×${shut.land.h}px・中心は地図 ／`
        + ` 開き: 画面の ${open.cover}%・「${label.close}」${open.close.w}×${open.close.h}px・`
        + `「${label.back}」${open.back.w}×${open.back.h}px ／`
        + ` 光らせると地図が出る ／ 閉じ直し: 中心は地図・ズーム ${again.zoom.h}px`;
    },
  },
  {
    // ⚠ **狭い幅の年代は「ものさし」**（2026-08-19）。ドラムを置き換えた。
    //   ⚠ ここは「横ドラムロール」を守っていた検査を**置き換えたもの**。
    //     消したのではなく、**守る目的が変わった**ので書き直している。
    //
    // 直したかったのは「どこまで遡れるか分からない」ほう。実測（2026-08-19・豊洲）:
    //   ⚠ 9 段のうち画面に入っていたのは 375 幅で 2 個・**320 幅で 1 個**だけ。
    //   ⚠ 「明治期」は x=877（375）／x=849（320）＝ **どちらも画面の外**。
    //   利用者役「せいぜい昭和の終わりまでかな、と思いました」。
    //
    // ⚠ ドラムのときに実測で否定された 5 つは、ものさしでも起こしてはいけない。
    //   引き継いで見る（形は変わっても、失敗の中身は同じ）:
    //   1. 印が中身と一緒に流れる → ⚠ ものさしのつまみは軸の中に固定
    //   2. box-sizing が無く、的が太って印と食い違う → ⚠ 的の実寸を見る
    //   3. transform で膨らむ → 同上
    //   4. 押しどころが近すぎて誤爆（3/3 が「閉じてしまいそう」）→ ⚠ ‹ › の間隔を見る
    //   5. 文字が隣の部品の真横で切れる（320 で 33px 切れ）→ ⚠ 年と端の名前の切れを見る
    //
    // ⚠ **刻みは的にしない。**320 幅・9 段で 1 段 24px しかなく、44px を割る（掟）。
    //   動かすのは ‹ ›（44×44）と、軸そのもののドラッグ。
    name: "狭い幅の年代は、ものさしで全体が見え、端まで届く", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => typeof steps !== "undefined" && timelineReady,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right),
            w: Math.round(r.width), h: Math.round(r.height),
            cut: e.scrollWidth > Math.ceil(r.width) + 1,
            hit: who ? (who.id || who.closest("[id]")?.id || String(who.className).split(" ")[0]) : "無い" }; };
        const line = document.querySelector("#ruler .rl-line").getBoundingClientRect();
        const ticks = [...document.querySelectorAll("#rlTicks i:not(.rl-cut)")];
        const knob = document.getElementById("rlKnob").getBoundingClientRect();
        return { year: g("#rlYear"), left: g("#rlLeft"), right: g("#rlRight"),
          prev: g("#rlPrev"), next: g("#rlNext"), note: g("#rlNote"),
          nTicks: ticks.length, nSteps: steps.length,
          lastLabel: steps[steps.length - 1].label,
          axis: Math.round(line.width), knobX: Math.round(knob.x + knob.width / 2),
          lineL: Math.round(line.left), lineR: Math.round(line.right),
          meiji: !!document.querySelector("#rlTicks i.rl-meiji"),
          cut: !!document.querySelector("#rlTicks i.rl-cut"),
          W: innerWidth };
      });
      const a = await look();
      // ---- ① 全段が 1 本の軸にあり、端が画面内 ----
      must(a.nTicks === a.nSteps, `刻みが段の数と合わない（刻み ${a.nTicks} / 段 ${a.nSteps}）`);
      must(a.right.right <= a.W, `右端「${a.right.t}」が画面の外（右 ${a.right.right} / 幅 ${a.W}）`);
      must(a.left.x >= 0, `左端「${a.left.t}」が画面の外`);
      // ⚠ **右端はその地点の最終段。**「明治期」固定にしない（明治期データは 24 地点で 7/24）
      must(a.right.t === a.lastLabel,
        `右端が最終段と違う（右端「${a.right.t}」／最終段「${a.lastLabel}」）`);
      // ⚠ 5 の再発（文字が切れる）
      for (const [nm, x] of [["年", a.year], ["左端", a.left], ["右端", a.right]])
        must(!x.cut, `${nm}「${x.t}」が切れている`);

      // ---- ② 押せるものは 44px。刻みは的にしない ----
      for (const [nm, x] of [["‹", a.prev], ["›", a.next]]) {
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
        must(x.hit === (nm === "‹" ? "rlPrev" : "rlNext"), `${nm} を押しても当たるのは「${x.hit}」`);
      }
      // ⚠ 4 の再発（近すぎて誤爆）
      must(a.next.x - a.prev.right >= 80,
        `‹ と › が近すぎる（間隔 ${a.next.x - a.prev.right}px）。押し間違える`);

      // ---- ③ 明治期は写真ではない。形と仕切りで示す ----
      must(a.meiji, `明治期の印が無い（写真と同じ形に見える）`);
      must(a.cut, `写真と明治期の仕切りが無い`);
      must(/空中写真\s*\d+\s*段/.test(a.note.t), `注記に空中写真の段数が無い: ${a.note.t}`);

      // ---- ④ ‹ › で端まで届く。⚠ 1 の再発（つまみが流れる）も見る ----
      const knob0 = a.knobX;
      // ⚠ **無効になったボタンを押しに行かない。** page.click は「押せるようになるまで」
      //   待つので、無効なボタンに 30 秒 × 回数ぶん待ってしまう（実測 2026-08-19: 10 分で打ち切り）。
      //   ⚠ 押せるあいだだけ押す。押せなくなったら、そこが端。
      const tapWhile = async (id, max) => {
        let n = 0;
        for (; n < max; n++) {
          const ok = await page.evaluate((id) => {
            const e = document.getElementById(id);
            if (!e || e.disabled) return false;
            e.click(); return true;
          }, id);
          if (!ok) break;
        }
        await page.waitForTimeout(400);
        return n;
      };
      const tapped = await tapWhile("rlNext", 20);
      must(tapped >= a.nSteps - 1, `› を ${tapped} 回しか押せなかった（段は ${a.nSteps}）`);
      const b = await look();
      must(b.year.t === a.lastLabel, `› を押し続けても最終段に着かない（いま「${b.year.t}」）`);
      must(b.knobX > knob0, `つまみが動いていない（${knob0} → ${b.knobX}）`);
      must(b.knobX <= b.lineR + 2 && b.knobX >= b.lineL - 2,
        `つまみが軸から外れた（${b.knobX} / 軸 ${b.lineL}..${b.lineR}）`);
      // ⚠ 端では、それ以上押せないと分かること
      const disabled = await page.evaluate(() => document.getElementById("rlNext").disabled);
      must(disabled, `最終段なのに › がまだ押せる顔をしている`);
      await tapWhile("rlPrev", 20);
      const c = await look();
      must(c.year.t === "現在", `‹ を押し続けても先頭に戻らない（いま「${c.year.t}」）`);
      return `320 幅・${a.nSteps} 段  軸 ${a.axis}px（1 段 ${Math.round(a.axis / (a.nSteps - 1))}px）`
        + ` ／ 端「${a.left.t}」「${a.right.t}」とも画面内 ／ ‹ › ${a.prev.w}×${a.prev.h}（間隔 ${a.next.x - a.prev.right}px）`
        + ` ／ ${a.note.t}`;
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
    name: "見つからなかった語を、本人の判断で報告できる", dep: "search", path: "/",
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
      must(VERDICT_SENTENCE.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
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
      // ⚠ パネルの答えは #landAll（層）へ移った。⚠ 見ている主張は変えていない
      const hero = await page.locator("#landAll").textContent({ timeout: 45000 });
      const cap = hero;
      assertToyosu3dAnswer(hero, cap, "3D");
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
        () => (document.getElementById("landAll")?.textContent ?? "").trim().length > 0,
        null, { timeout: 60000 });
      // 地形分類は建物の集計とは別に取りに行くので、後から届く。待つ。
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
        // ⚠ **建物の層まで待つ。**層は別々に返るので、途中で読むと
        //   「建物ごとには出せない」の行がまだ無い（実測 2026-08-19 に踏んだ）。
        await page.waitForFunction(
          () => /建物/.test(document.getElementById("landAll")?.textContent ?? ""),
          null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      // ⚠ 見ているのは「**割合を作らない**」（0% を出さない）。
      //   ⚠ 建物の件数のような**実際に数えた数**は出してよい（同種の札幌の検査と同じ書き方）。
      must(!/\d+\.\d+\s*%/.test(hero), `判定できない土地で割合を出している: ${hero.slice(0, 80)}`);
      // 建物ごとの割合は出せない。それを「何も分からない」と混ぜないこと（掟: 主題は「成り立ち」。明治期は手法のひとつ）
        // ⚠ 出せないのが**建物ごと**であること（何もかも駄目ではない）。
        //   ⚠ 層になって言い方が変わった（第3層の欠落として、その位置に出る）。
        //   ⚠ 見ている主張は変えていない: **範囲を限っていること**。
        must(/建物ごとには出せません|1 件ずつの足元は判定できていません|建物ごとの判定は/.test(hero),
        `出せないのが「建物ごと」であることが書かれていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
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
    // 建物の明治期区分は事前計算アセットから出るため、GSI通信断でも表示できる。
    // 実行時のラスタ通信に依存していないことを確かめる。
    name: "さかのぼる（通信断）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        () => /件の足元を判定/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "通信断でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `通信断なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
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
      // ⚠ **ブラウザの中で評価される関数には、Node 側の定数が届かない。**
      //   `VERDICT_SENTENCE` をそのまま書いて ReferenceError にした（2026-08-17）。
      //   引数として渡す。⚠ 正規表現は渡せないので、文字列にして中で組む。
      await page.waitForFunction(
        (src) => new RegExp(src).test(document.getElementById("verdict")?.textContent ?? ""),
        VERDICT_SENTENCE.source, { timeout: 30000 });
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
    // ⚠ 403 は「無い」ではない（掟: 取れなかったを「無い」と言わない）。
    //   国土地理院の資料にも、403 を不在として読んでよいという記述は無い。
    //   ここは**画像タイル**の経路（明治期の低湿地）。落とすのは swale だけなので、
    //   地形分類が従来どおり答えられることも併せて見る。
    name: "403 でも整備対象外と言わない（画像タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは明治期のタイルだけ。地形分類まで巻き添えにしていないこと
      must(/旧水部|水部/.test(v), `明治期だけ落としたのに地形分類まで消えている: ${v.trim().slice(0, 70)}`);
      // 根拠UI。読んでいない画素と、403 を「タイルが存在しない」根拠にしていないこと
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const meijiCard = cards.find((c) => /^明治期の地形/.test(c)) ?? "";
      must(meijiCard, "明治期の根拠カードが無い（この検査が何も見ていない）");
      must(!/rgba=/.test(meijiCard), `読んでいないのに画素の根拠が出ている: ${meijiCard.slice(0, 80)}`);
      must(!/HTTP\s*403/.test(meijiCard), `403 を根拠として出している: ${meijiCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => meijiCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${meijiCard.slice(0, 80)}`);
      // 拒否が解けたら取れること。失敗をキャッシュに残していると、ここで永久に直らない
      await page.unroute(SWALE_ROUTE);
      await page.click("#retryBtn");
      await page.waitForFunction(
        () => /河川・湖沼・海面/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 30000 });
      return `断定なし（${v.trim().split("\n")[0].slice(0, 24)}）／根拠なし／再試行で明治期が戻る`;
    },
  },
  {
    // ⚠ **GeoJSON** の経路。主題（その土地はどうやってできたか）に直接答えるのがここ。
    //   403 を不在に丸めると「この地点には地形分類のデータが無い」と断定してしまう。
    name: "403 でも地形分類のデータが無いと言わない（GeoJSON）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, LFC_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは地形分類だけ。明治期は従来どおり答えられること
      must(v.includes("河川・湖沼・海面"),
        `地形分類だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const lfCard = cards.find((c) => /^地形分類/.test(c)) ?? "";
      must(lfCard, "地形分類の根拠カードが無い（この検査が何も見ていない）");
      must(!/図式コード/.test(lfCard), `読んでいないのに図式コードが出ている: ${lfCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => lfCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${lfCard.slice(0, 80)}`);
      return `断定なし／地形分類の根拠なし／明治期は従来どおり`;
    },
  },
  {
    // ⚠ **標高**の経路（dem5a → dem）。2枚とも 403 のとき、
    //   「この地点の標高データが無い」と言ってはいけない。
    name: "403 でも標高データが無いと言わない（標高タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, DEM_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/標高を読み込めませんでした/.test(v),
        `標高が読めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      // 読めていない数値を出さない
      must(!/標高\s*-?[\d.]+\s*m/.test(v), `読めていないのに標高の数値を出している: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは標高だけ。判定そのものは従来どおり出ること
      must(v.includes("河川・湖沼・海面"),
        `標高だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const own = await page.locator("#own").textContent();
      must(!/生値/.test(own), "読んでいないのに標高の生値が出ている");
      return `断定なし／標高の数値なし／判定は従来どおり`;
    },
  },
  {
    // ⚠ 0.0% の再来を止める。403 を不在に丸めていた頃は、拒まれた土地で
    //   「1408件すべてデータなし」→ **0.0% を「実測値」として**出していた
    //   （掟: 取れなかったを「無い」と言わない の元になった事故そのもの）。
    name: "さかのぼる（403）", path: `/peel?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        () => /件の足元を判定/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "403でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `403 なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
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
      const hero = (await page.locator("#landAll").textContent()).trim();
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "地表タイル断でも3D");
      return `${txt.slice(0, 34)}／土地区分と水域補足（${hero}）は従来どおり`;
    },
  },
  // ---- 検索の入口（掟: 取れなかったを「無い」と言わない やる順番3）----
  // 住所検索は関連度で返らないので、素の先頭は別の土地になる。
  // 並びそのものは scripts/search-check.mjs が35語で測る。ここで見るのは
  // 「画面の上で Enter を押したとき何が起きるか」のほう。
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
  {
    // ⚠ **押すものと、動くものを離さない。** ▶ は帯（年代）を順に送る操作なのに、
    //   実測（2026-08-17）で**帯の下端から 487px（375×667）／650px（PC）**離れていた。
    //   間に大きい写真・判定文・面の内訳が挟まっており、押しても何が起きたか見えない。
    //   ⚠ 同じ整理を「明治期の土地を重ねる」で既にやっている（重ねる相手は写真なので、
    //     操作も写真と一緒に見えている必要がある）。▶ だけ取り残されていた。
    //   ⚠ この不具合は、それまでの検査を 1 つも落とさなかった。位置を誰も見ていなかった。
    name: "▶ は、動かす相手（帯）のすぐそばにある", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const g = await page.evaluate(() => {
        const b = document.getElementById("playBtn");
        const s = document.getElementById("strip");
        if (!b || !s) return null;
        const bb = b.getBoundingClientRect(), sb = s.getBoundingClientRect();
        const cells = [...document.querySelectorAll("#strip .f")].map((e) => e.getBoundingClientRect());
        return { gap: Math.round(sb.top - bb.bottom), y: Math.round(bb.y), vh: window.innerHeight,
          w: Math.round(bb.width), h: Math.round(bb.height),
          cell: Math.round(cells[0]?.width ?? 0), rows: new Set(cells.map((c) => Math.round(c.top))).size,
          label: document.querySelector(".strip-ops-tx")?.textContent.trim() ?? "" };
      });
      must(g, "▶ か帯が見つからない（この検査が何も見ていない）");
      // ⚠ 「そば」を px で言う。1 画面ぶん離れていたら「そば」ではない
      must(g.gap >= 0 && g.gap < 60,
        `▶ が帯から離れている: ${g.gap}px（実測 移す前は 487px。帯の直前に置く）`);
      // ⚠ **帯より上にあること。** 下に置くと「送る先」を見ながら押せない。
      //   ⚠ **絶対の y で書かない**（2026-08-20 に直した。hidetzu/konjaku#122）。
      //     ⚠ 以前は `y < 300` だった。⚠ **これは「帯より上」の代用**で、
      //       ⚠ **答えを画面の先頭へ動かしただけで落ちた**（帯ごと下がっただけで、
      //       ▶ と帯の上下は変わっていない）。⚠ **代用ではなく、主張そのものを書く。**
      must(g.gap >= 0, `▶ が帯より下にいる: 帯との差 ${g.gap}px`);
      // ⚠ **初期画面で押せること。**⚠ 押せない場所にあるなら「そば」でも意味がない
      must(g.y + g.h <= g.vh, `▶ が初期画面の外にいる: y=${g.y}〜${g.y + g.h}（画面 ${g.vh}）`);
      // 指で押す端末では 44px（Apple の指針）
      must(g.w >= 44 && g.h >= 44, `▶ が指で押すには小さい: ${g.w}×${g.h}px`);
      // ⚠ **コマを縮めていないこと。** 帯の中に入れるとコマが縮む（実測 27→25px / 21→18px）。
      //   コマは既に「小さくて押せるように見えない」と指摘が出ている場所
      must(g.cell >= 26, `▶ を置いたせいで帯のコマが縮んでいる: ${g.cell}px（375px では 27px）`);
      must(g.rows === 1, `帯が ${g.rows} 行に折り返している`);
      // ⚠ **名前を添える。** ▶ だけだと「何が始まるか分からないので押すのが怖い」（初見）
      must(g.label.length > 0, "▶ が何をするものか、言葉で書いていない");
      // 押して本当に効くこと
      await page.click("#playBtn");
      await settleAfterClick(page);
      must(await page.locator("#playBtn.on").count() === 1, "▶ を押しても、流れている印が出ない");
      await page.click("#playBtn");
      return `▶ は帯の ${g.gap}px 上（移す前は 487px）／${g.w}×${g.h}px／`
        + `コマ ${g.cell}px は縮まず／名乗り「${g.label}」`;
    },
  },
  {
    // ⚠ **見えなくするのと、消すのは別。** ✕ で場所を外したのに、前の土地の
    //   名前・年代の段・URL がそのまま残っていた（2026-08-17 にオーナーが実機で発見）。
    //   見た目は場所未選択になるので気づけず、**再読み込みすると前の場所が復活していた**。
    //   実測（375×667 / 豊洲）: ✕ の直後 url=?q=豊洲&ll=…&era=swale ／ #strip 9 コマ。
    //   ⚠ この不具合は、それまでの検査を 1 つも落とさなかった。「消えること」を誰も見ていなかった。
    //   `tmp/9/10` の状態遷移の契約「✕ → 結果・一覧・場所・古い非同期処理を消す」に反していた。
    name: "✕ で場所を外したら、URL も画面も前の場所を持ち越さない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const look = () => page.evaluate(() => ({
        url: location.search,
        mode: document.body.classList.contains("picked") ? "action" : "place",
        chip: document.getElementById("chipName")?.textContent.trim() ?? "",
        strip: document.querySelectorAll("#strip .f").length,
      }));
      const before = await look();
      // 前提が消えたら落とす（そもそも場所が載っていないなら、この検査は何も確かめない）
      must(/q=/.test(before.url) && before.strip > 0,
        `前提が崩れている（URL に場所が載っていない / 段が無い）: ${JSON.stringify(before)}`);
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const after = await look();
      must(after.mode === "place", `✕ を押したのに場所選択中のまま: ${after.mode}`);
      must(after.url === "", `✕ を押しても URL に場所が残っている: ${after.url}`);
      must(after.chip === "", `✕ を押しても前の場所の名前が残っている: 「${after.chip}」`);
      // ⚠ **隠れているだけ**を通さない。DOM から消えていること
      must(after.strip === 0, `✕ を押しても前の土地の年代の段が ${after.strip} コマ残っている`);
      // ⚠ **消しすぎて壊していないこと。** ✕ の後始末で地図・年代・読み上げまで捨てるので、
      //   **次の場所が選べなくなる**危険がある。
      //   ⚠ ここは**同じページのまま**やる。再読み込みを挟むと状態が作り直され、
      //     「後始末が次の選択を壊した」を一度も通らない（最初そう書いて、壊しても通った）。
      await page.locator("#quick button", { hasText: "渋谷" }).click();
      await waitVerdict(page);
      await waitStrip(page);
      const next = await look();
      must(next.mode === "action", `✕ のあと、次の場所を選んでも場所選択中にならない`);
      must(next.chip.includes("渋谷"), `次の場所の名前が入らない: 「${next.chip}」`);
      must(/q=/.test(next.url) && !/%E8%B1%8A%E6%B4%B2/.test(next.url),
        `次の場所を選んでも URL が前の場所のまま: ${next.url}`);
      must(next.strip > 0, `次の場所で年代の段が組まれない: ${next.strip} コマ`);

      // ⚠ **画面から選んだ経路でも同じこと。** URL で着いた場合しか見ていなかった
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const afterPicked = await look();
      must(afterPicked.mode === "place" && afterPicked.url === ""
        && afterPicked.chip === "" && afterPicked.strip === 0,
        `画面から選んだ場所を ✕ したとき、持ち越しがある: ${JSON.stringify(afterPicked)}`);

      // ⚠ **再読み込みで戻ってこないこと。** ここが本体（URL が残っていると復活する）。
      //   最後にやる。ここより前に置くと、上の「次の場所を選べる」が別のページの話になる
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#quick button", { timeout: 20000 });
      await page.waitForTimeout(2500);
      const back = await look();
      must(back.mode === "place" && back.chip === "" && back.strip === 0,
        `再読み込みで前の場所が復活した: ${JSON.stringify(back)}`);
      return `✕ で URL・場所名・年代の段（${before.strip} コマ）が消え、再読み込みでも戻らない`
        + `／同じページのまま渋谷を選べて段 ${next.strip} コマ／画面から選んだ場所の ✕ でも持ち越さない`;
    },
  },
  {
    // ⚠ ここは「おすすめ一覧」ではなく**入力例**。数を増やすと、増やしただけ
    //   押し間違いが増え、間違えて開いても「別の街の判定」が普通に出るので気づけない。
    //   ⚠ 以前この検査は「5 個以上」を求めていた。**消しすぎを反対側から押さえる**ためだったが、
    //     そのぶん 10 個・3 行・169px（実測 2026-08-17 / 375×667）が固定され、
    //     検索欄と同じ強さの入口が 10 個並んで見えていた（UI/UX レビュー 原則2「主役は1つ」）。
    //     守りたかったのは「例が消えていないこと」なので、**ちょうど 3 件**で押さえ直す。
    //   ⚠ 配っている quick-places.json（10 件）は減らしていない。`/peel` は全件を出す。
    name: "入力例は 3 件で、指で押せて、折り返しの上にある", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForSelector("#quick button");
      const read = () => page.evaluate(() => {
        const els = [...document.querySelectorAll("#quick button")];
        const b = els.map((e) => e.getBoundingClientRect());
        return { names: els.map((e) => e.textContent.trim()),
          n: b.length, minH: Math.min(...b.map((x) => x.height)),
          bottom: Math.max(...b.map((x) => x.bottom)),
          rows: new Set(b.map((x) => Math.round(x.top))).size };
      });
      const r = await read();
      // 今昔の違う面が見える 3 地点（豊洲＝埋立 / 渋谷＝都市化 / 広島＝歴史）。
      // ⚠ 選び方は index.html の TOP_EXAMPLE_IDS。id の実在は scripts/check.mjs が
      //   quick-places.json と突き合わせている（ここは**画面に出た名前**を見る）
      must(r.n === 3, `入力例が 3 件でない: ${r.n} 件（${r.names.join("・")}）`);
      must(["豊洲", "渋谷", "広島"].every((x) => r.names.includes(x)),
        `入力例が 豊洲・渋谷・広島 でない: ${r.names.join("・")}`);
      // 指で押す端末では 44px（Apple の指針）。ここを下回ると隣を押す
      must(r.minH >= 44, `入力例が指で押すには小さい: ${Math.round(r.minH)}px（44px 必要）`);
      // 入口が折り返しの下にあると、来た人は入口があること自体を知らない
      must(r.bottom <= 667, `入力例が折り返しの下にはみ出た: 下端 ${Math.round(r.bottom)}px`);
      must(r.rows === 1, `375px で入力例が ${r.rows} 行に折り返している`);
      // ⚠ 狭い端末も見る。ここを見ていなかったので、320px で導入の絵が 2 行になっていた
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(120);
      const s = await read();
      must(s.rows === 1, `320px で入力例が ${s.rows} 行に折り返している: ${s.names.join("・")}`);
      must(s.minH >= 44, `320px で入力例が小さい: ${Math.round(s.minH)}px`);
      must(s.bottom <= 640, `320px で入力例が折り返しの下にはみ出た: 下端 ${Math.round(s.bottom)}px`);
      return `${r.n} 件（${r.names.join("・")}）／375px: ${r.rows} 行 高さ ${Math.round(r.minH)}px 下端 ${Math.round(r.bottom)}px`
        + `／320px: ${s.rows} 行 下端 ${Math.round(s.bottom)}px`;
    },
  },
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
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
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
          // ⚠ 溶接（判定の箱と一覧が 1 枚に見えている）
          weld: lb && lb.checkVisibility()
            ? Math.round(lb.getBoundingClientRect().top - vd.getBoundingClientRect().bottom) : null,
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
        // ⚠ **溶接を壊していないこと**
        must(r.weld === 0, `${w}px: 判定の箱と一覧の溶接が外れている（隙間 ${r.weld}px）`);
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
    // ⚠ **写真が届かないときに、画面へ出ること**（hidetzu/konjaku#116）。
    //   ⚠ **状態は photos.js、字は words.js、置くのは画面。**⚠ **3 つが繋がっているかを見る。**
    //   ⚠ **理由を断定しない。**`<img>` からは落ちた理由が取れないので late に留める。
    //     ⚠ **「読み込めませんでした」と書いたら落とす。**
    //   ⚠ **Service Worker を止める。**⚠ 止めないとキャッシュから返り、
    //     ⚠ **止めたはずのタイルが届く**（2026-08-20 に踏んだ。naturalWidth=256 のままだった）。
    //   ⚠ **見えているかは checkVisibility()。**⚠ textContent は隠れた字も返す（CLAUDE.md §9）。
    name: "写真が届かない年代で、理由を断定せずに断る", path: "/",
    async check(page) {
      // ⚠ **Service Worker を止めた場を、自分で作る**（走者の既定では止まらない）。
      //   ⚠ 止めないとキャッシュから返り、⚠ **止めたはずのタイルが届く。**
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      let r = null, gone = null;
      try {
        const p2 = await ctx.newPage();
        await p2.route((u) => /xyz\/gazo1\//.test(u.href), (q) => q.abort("connectionrefused"));
        await p2.goto(`${BASE}/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        r = await run(p2);
        gone = r.gone;
      } finally { await ctx.close(); }
      const page2 = null; void page2;
      return r.msg;

      async function run(page) {
      await page.waitForFunction(() => document.querySelectorAll(".strip .f").length > 1,
        null, { timeout: 60000 });
      // ⚠ 止めた年代（1974–78）へ。⚠ **押すと地図が起きる**ので setEra を直に呼ぶ
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /1974/.test(e.textContent)); if (i >= 0) setEra(i); });
      await page.waitForFunction(() =>
        document.getElementById("bigErr")?.checkVisibility?.() === true, null, { timeout: 30000 });
      const r = await page.evaluate(() => {
        const e = document.getElementById("bigErr");
        return { seen: e.checkVisibility(), txt: e.textContent.replace(/\s+/g, " ").trim(),
                 era: document.querySelector(".strip .f.on")?.textContent?.trim() };
      });
      must(r.seen, "写真が届いていないのに、断りが出ていない");
      // ⚠ **理由を知らないので断定しない**（404 と区別できない）
      must(!/読み込めませんでした|取得できませんでした|失敗/.test(r.txt),
        `理由を知らないのに断定している: ${r.txt}`);
      // ⚠ **「無い」と言わない**（掟の一行目）
      for (const w of LIES) must(!r.txt.includes(w), `「${w}」と断定している: ${r.txt}`);
      // ⚠ **通信のせいにしない**（つながっているかどうかを、こちらは知らない）
      must(!/通信|接続|インターネット/.test(r.txt), `理由を知らないのに通信のせいにしている: ${r.txt}`);
      // ⚠ **何の写真かを名乗る**（年代が分からないと、何が出ていないのか読めない）
      must(/写真|地面/.test(r.txt), `何が出ていないのか書かれていない: ${r.txt}`);
      // ⚠ **届いている年代へ戻したら、断りは消える**
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /明治期/.test(e.textContent)); if (i >= 0) setEra(i); });
      await settleAfterClick(page);
      const gone = await page.evaluate(() =>
        document.getElementById("bigErr")?.checkVisibility?.() ?? false);
      must(!gone, "届いている年代なのに、断りが残っている");
      return { gone, msg: `${r.era}: 「${r.txt}」／理由を断定せず・「無い」と言わず・`
        + `通信のせいにしない／戻すと消える` };
      }
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
              lines: [...document.querySelectorAll(".v-head .tx")].length,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **問いの見出しが 2 つ出ている**（第1層・第2層）
          must(g.gq.length === 2, `${w}×${h}: 問いの見出しが 2 つでない（${g.gq.length} 個: ${g.gq.join(" / ")}）`);
          // ⚠ **字は words.js の 1 か所から。**⚠ ここへ書き写さない
          must(g.gq[0] === WORDS.layerTitle(1) && g.gq[1] === WORDS.layerTitle(2),
            `${w}×${h}: 見出しが words.js と違う（${g.gq.join(" / ")}）`);
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
          await p2.waitForFunction((s) =>
            (document.querySelector(s)?.innerText ?? "").trim().length > 3,
            sel, { timeout: 60000 });
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

  {
    // ⚠ **プライバシーの 3 段は、場所を送る前に読めること。**
    //   ⚠ 以前は畳んだフッターの中にしかなく、⚠ **利用者役 2/4 が「これは先に見たかった」**。
    //   ⚠ **「見えている」だけでなく「畳まれていない」「画面内」まで見る。**
    //     ⚠ 畳んであると、送る前に読めるとは言えない（それが元の状態だった）。
    //   ⚠ **3 段そろっていること。**1 段でも落ちると、いちばん強い約束だけが残って
    //     「通信していない」と読める（2026-08-15 に直した嘘へ戻る）。
    name: "場所を送る前に、プライバシーの3段が読める", path: "/",
    async check(page) {
      const NEED = [[/URL|アドレス欄/, "載る"],
                    [/(Cloudflare|配信元)[^。]*(届|渡)/, "届く"],
                    [/こちらの記録には[^。]*残りません/, "残らない"]];
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
        const miss = NEED.filter(([re]) => !re.test(r.txt)).map(([, n]) => n);
        must(!miss.length, `${w}px: 段が落ちている（${miss.join("・")}）: ${r.txt.slice(0, 60)}`);
        out.push(`${w}: y=${r.y}`);
      }
      // ⚠ **詳しい説明は残っていること**（要約が出たからといって消さない）
      const sums = await page.$$eval("footer summary", (es) => es.map((e) => e.textContent.trim()));
      must(sums.some((t) => /プライバシー/.test(t)),
        `畳んである詳しい説明が消えている: ${sums.join("・")}`);
      // ⚠ **場所を選んだら消える。**送ったあとに残すと「これから送ります」に読める
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${page.url().split("?")[0]}?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`);
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const still = await page.evaluate(() =>
        document.getElementById("privacyShort")?.checkVisibility() ?? false);
      must(!still, "場所を選んだあとも、送る前の案内が出たままになっている");
      return `4 幅すべてで畳まず画面内（${out.join(" / ")}）／3 段そろい／詳しい説明は残る／場所を選ぶと消える`;
    },
  },
  {
    name: "最初の画面が、場所を検索する画面だと5秒で分かる", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // 利用者役のエージェントによる検証で理解まで1分半かかり「グルメ検索? 不動産?」と受け取られていた。
      // 判定できることだけを書く（掟: 根拠のないことは書かない）。埋立の年や「昔は海」は画素から出せないので書かない。
      const head = await page.$eval("header", (e) => e.textContent.replace(/\s+/g, " ").trim());
      // 見出しは効能で名乗る（掟: 看板は効能で名乗る）。「その土地を知る」はカテゴリ名で、
      // 何が起きるかが読んだ人に伝わっていなかった。主題（成り立ち・掟: 主題は「成り立ち」。明治期は手法のひとつ）は変えていない。
      must(/この土地は、昔なんだったのか/.test(head), `見出しが変わっている: ${head.slice(0, 40)}`);
      // ⚠ この検査は以前、header に「成り立ち」と「国土地理院」があることを求めていた。
      //   守っていたのは「何のサービスか分からない」の再発防止だが、そのために
      //   説明が 2 つ（実測 40px）並び、検索欄が y=164 まで下がっていた。
      //   **同じ意図を、こんどは「次に何をすればよいかが 1 文で書いてある」で守る。**
      //   ⚠ 何を読んでいるか（国土地理院）は消していない。下の「出典が残っている」で見る。
      must(/場所を検索して、その土地の時間をさかのぼる。/.test(head),
        `次に何をすればよいかが 1 文で書かれていない: ${head}`);
      // ⚠ **説明の塊は 1 つだけ。** ここが緩むのは「説明をもう 1 行足す」ときなので、
      //   px ではなく個数でも止める（原則5「足す前に隠す」）。
      const blocks = await page.$$eval("header p, header div:not(.brand)", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      must(blocks.length === 1,
        `最初の画面の説明が ${blocks.length} 塊ある（1 文だけにする）: ${blocks.join(" ／ ")}`);
      // ⚠ 判定の手口・データ提供元・Privacy を**入口では語り始めない**。
      //   （tmp/9 の設計: 操作 → 結果 → 説明 → 根拠。トップは「操作」まで）
      for (const w of ["国土地理院", "明治期", "画素", "タイル", "Cookie", "標高", "Wikidata"])
        must(!head.includes(w), `最初の画面が判定の手口を語り始めている: 「${w}」（${head}）`);
      // ⚠ **消したのではなく、後ろへ動かした**ことまで見る。
      //   出典が画面から消えると、地理院タイルの利用条件（出典明示）も破る
      const foot = await page.$eval("footer", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/国土地理院/.test(foot), `出典（国土地理院）が画面から消えた: ${foot.slice(0, 60)}`);
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
      await page.waitForSelector("#quick button");
      const q0 = await page.$eval("#quick", (e) => {
        const r = e.getBoundingClientRect();
        return { vis: e.checkVisibility(), y: Math.round(r.y),
          h: Math.round(r.height), bottom: Math.round(r.bottom) };
      });
      must(q0.vis && q0.h > 0 && q0.bottom <= 667,
        `最初の画面で入力例が見えていない: ${JSON.stringify(q0)}`);
      // ⚠ **地名の帯が「例」だと名乗っていること。**
      //   名乗らないと、地名が検索欄と同じ強さの主ボタンとして並んで見える
      //   （実測 10 個・144px。UI/UX レビュー 原則2「主役は1つ」）。
      //   ⚠ 名乗りは「たとえば」。「おすすめ」「人気の場所」にすると、
      //     こちらが選んだ土地を推していることになり、入力例ではなくなる。
      //   ⚠ 見出しは #quick の**中**に作る。外に置くと、取得に失敗したときに
      //     見出しだけが残り、例が 1 つも無いのに「たとえば」と言うことになる。
      const qLead = await page.evaluate(() => {
        const e = document.querySelector("#quick .q-lead");
        if (!e) return null;
        return { text: e.textContent.trim(), tag: e.tagName,
          chips: document.querySelectorAll("#quick button").length,
          focusable: e.tabIndex >= 0 };
      });
      must(qLead, "地名の帯が「例」だと名乗っていない（主ボタンが並んで見える）");
      must(qLead.text === "たとえば", `入力例の名乗りが「たとえば」でない: 「${qLead.text}」`);
      must(qLead.chips === 3, `入力例が 3 件でない: ${qLead.chips} 件`);
      must(qLead.tag !== "BUTTON" && !qLead.focusable,
        `見出しが押せる見た目になっている: ${qLead.tag}（掟: 押しても何も起きない導線を置かない）`);
      // ⚠ **主操作（場所を検索する）が、説明に押し下げられていないこと。**
      //   実測（375×667）: 説明が 2 つ（40px）あったときは y=164。
      //   1 文に畳んで y=138 になっている。ここが緩むのは「説明をもう1行足す」とき。
      const q = await page.$eval("#q", (e) => {
        const r = e.getBoundingClientRect();
        return { y: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      must(q.bottom <= 667, `検索欄がファーストビューの外にいる: 下端 ${q.bottom}px`);
      must(q.y <= 150, `検索欄が説明に押し下げられている: y=${q.y}px（実測の基準は 138px）`);
      // ⚠ H1 → サブコピー → 検索欄 → 入力例。**この順に上から並んでいること。**
      //   px の上限だけだと、順序を入れ替えても通る書き方が残る
      const order = await page.evaluate(() => ["h1", ".lead", "#q", "#quick"]
        .map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
      must(order.every((y, i) => i === 0 || y > order[i - 1]),
        `H1 → 1文 → 検索欄 → 入力例 の順に並んでいない: ${order.join(" → ")}`);
      // ⚠ 「効かないキーの説明を打つ前に出さない」は、ここでは見ない。
      //   375px は @media (hover:none) が .kbd を丸ごと隠すので、**何も見ずに緑になる**。
      //   キーが効く端末（PC 幅）で見る。→「検索（確度が低いので選ばない）」の冒頭。
      // 収まらない説明はフォーカス時の補足へ回す。触れば読めること
      await page.click("#q");
      must(await page.locator(".hint").isVisible(), "入力欄に触れても補足が出ない");
      const hint = (await page.locator(".hint").textContent()).trim();
      return `検索欄 y=${q.y}（実測 164 → 改善）／説明 ${blocks.length} 塊「${blocks[0]}」`
        + `／入力例 ${qLead.chips} 件・下端 ${q0.bottom}px／placeholder ${ph.need}px ≤ ${ph.room}px／補足「${hint}」`;
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
      // ⚠ 明治期は空中写真ではない。数に混ぜると「8 回ぶん中 8 回」という嘘になる
      //   （帯には明治期のコマも並ぶので、コマ数をそのまま数えると 1 多くなる）。
      // ⚠ 文言を変えた（2026-08-17）。「N 年代（M 年代中）」は初見の人が通算 3 人とも
      //   「意味が分からない」と答えたのでやめた。⚠ **守っている意図は同じ**:
      //   「この場所に残っている数」が「全部の数」を超えないこと＋分母が出ていること。
      //   ⚠ 以前は `/(\d+)\s*年代（\s*(\d+)/` と**文言に張り付いた正規表現**だったので、
      //     文言を変えた瞬間に「ありうる数を超えている」と**誤った理由で**落ちた。
      const foot = (await page.locator(".strip-foot").textContent()).replace(/\s+/g, " ");
      // 「7回ぶんすべて」／「7回ぶん中 4回」／「残っていません（全7回ぶん中）」の 3 通り
      const all = Number((foot.match(/(\d+)\s*回ぶん/) ?? [])[1]);
      const got = /すべて/.test(foot) ? all
        : /残っていません/.test(foot) ? 0
        : Number((foot.match(/回ぶん中\s*(\d+)\s*回/) ?? [])[1]);
      must(Number.isFinite(all) && all > 0, `分母（全部で何回ぶんか）が出ていない: ${foot.trim()}`);
      must(Number.isFinite(got), `この場所に残っている数が読めない: ${foot.trim()}`);
      must(got <= all, `空中写真の数が、ありうる数を超えている: ${foot.trim()}`);
      // ⚠ **同じ数を 2 回書かない**（「7 年代（7 年代中）」が意味を成さなかった原因）
      must(!new RegExp(`${all}[^0-9]{1,8}${all}`).test(foot),
        `同じ数を 2 回書いている（意味を成さない）: ${foot.trim()}`);
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
      // 場所が決まったらサブコピーは畳む（実測 79px。写真と判定文がそのぶん下へ押し出されていた）
      // ⚠ 「場所を検索して…」は、もう場所を選んだ人には前の段の指示。
      //   場所選択中の責務にサービス紹介は無い（tmp/9/10-トップ2状態の詳細設計.md）
      const leads = await page.$$eval(".lead", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0).length);
      must(leads === 0, `場所を選んだあともサブコピーが残っている: ${leads} 個`);
      // ⚠ 入力例も一緒に消えること。ここで一緒に見ておかないと、
      //   「未選択向けのものが選択後に残る」を 2 か所へ分けて見ることになる
      const qk = await page.$eval("#quick", (e) => ({
        vis: e.checkVisibility(), h: Math.round(e.getBoundingClientRect().height) }));
      must(!qk.vis, `場所を選んだあとも入力例が残っている: 高さ ${qk.h}px`);
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
  {
    name: "クイック候補の通信断を黙って空にしない", path: "/",
    setup: (page) => page.route("**/data/quick-places.json", (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(() => /候補地を読み込めませんでした/.test(
        document.getElementById("quick")?.textContent ?? ""), null, { timeout: 20000 });
      must(await page.locator("#quick .quick-error").count() === 1, "候補地の失敗表示が無い");
      must(await page.locator("#quick .quick-error button", { hasText: "再試行" }).count() === 1,
        "候補地の再試行が無い");
      return "候補地の失敗を表示／再試行あり";
    },
  },
  // ---- 入口が塞がっていないこと ----
  // ⚠ 実測で見つけた事故。スマホ幅で **1タップ目が必ず空振り**していた。
  //   入力欄がフォーカスを失うと補足文（.hint）が消え、下にあるものが 42px 上へずれる。
  //   指を離す前にレイアウトが動くので、押した座標には別の要素が来ている。
  //   見せ方をどれだけ磨いても、ここが塞がっていると誰も判定に到達できない。
  {
    name: "スマホで、最初の1タップが空振りしない", dep: "search", path: "/",
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
      await settleAfterClick(page);
      must(a.pressed === 1, `選択状態が1つでない: ${a.pressed}`);
      must(a.year.includes(a.years[0]), `大きい写真の年代が帯と食い違う: 「${a.year}」/「${a.years[0]}」`);

      // 4枚目を押す
      const i = 4;
      await page.locator("#strip .f").nth(i).click();
      await settleAfterClick(page);
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
      await settleAfterClick(page);
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
      // ⚠ 押すと記録のパネルへ寄る（index.html の scrollToEl）。⚠ **寄り終わるまで待つ**
      await settleAfterScroll(page);
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
          // ⚠ 語で探さない。名乗りは実装に合わせて変わる
          //   （「時間をさかのぼる（3D）」→「立体で見る」→「この場所を深掘り」）。
          //   この検査が見たいのは「本命の行が埋もれていないか」なので、行き先で探す
          .find((e) => (e.getAttribute("href") ?? "").startsWith("./peel"));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { y: Math.round(r.y + scrollY), own: el.classList.contains("own"),
                 h: Math.round(r.height) };
      });
      must(peel, "3D への行が見つからない");
      must(peel.own, "本命が、外部へ渡すだけの行と同じ見た目になっている");
      // ⚠ **絶対の px で見ない。** 手元 1040 / CI 1050 と**環境で 10px 動く**
      //   （CI は apt でフォントを入れるので文字の寸法が違う。同じ理由で過去に
      //    「行を押すと寄った結果が画面に入る」が 2 回とも同じ値で落ちている）。
      //   1043 という境目に 3px の余裕しか無く、環境差に耐えていなかった（2026-08-17 に CI で落ちた）。
      // ⚠ **守りたいのは「本命が埋もれていないこと」。** それを、上にあるものとの関係で見る:
      //   本命の上にあるのは「写真＋判定＋面の内訳」で、そこから**1画面ぶん以上離れていない**こと。
      //   ⚠ 絶対値でないので、写真の高さが変わってもフォントが変わっても意味が保たれる。
      const above = await page.evaluate(() => {
        const a = document.getElementById("area") ?? document.querySelector("#verdict .v-head");
        return a ? Math.round(a.getBoundingClientRect().bottom + scrollY) : null;
      });
      must(above, "判定ブロックが見つからない（この検査が何も見ていない）");
      const gap = peel.y - above;
      must(gap < 667, `本命が、判定の下から 1 画面ぶん以上離れている: ${gap}px（上端 ${above} / 本命 ${peel.y}）`);
      // ⚠ 上限も残す。1 画面ぶんの条件だけだと、判定ブロックごと下へ伸びても通ってしまう
      // ⚠ **1200 → 1260 へ上げた（2026-08-17）。** 上げた理由を残す。上げっぱなしにしない。
      //   判定ブロックに、この日 146px を足した。すべてオーナーが決めたもの:
      //     年代の見出しを写真の外へ +44px（写真の 29% を札が覆っていた）
      //     共有する／なぜそう言える？ を独立した行へ +51px（答えの一文を 3 行に割っていた）
      //     明治期の土地を重ねる を写真の外へ +49px（国土地理院の帰属表示に重なっていた）
      //     昔の写真 N回ぶん の間隔 +12px（上の枠と 3px 重なっていた）
      //   ⚠ **本当の見張りは上の隔たり（判定の下から 0px）のほう。** ここは背番号。
      //   ⚠ 次にこの数字を上げるときも、何を足したから上げるのかを書くこと。
      //     書けないなら、それは足しすぎ。
      must(peel.y < 1260, `本命が埋もれている: y=${peel.y}（実測 手元 1186 / CI は約 +10px。上限 1260）`);
      return `☆は y=${mine.y} に開く／バッジ ${badges} 個から根拠へ／店は打つまで出ない／`
        + `3D への行は y=${peel.y}（判定の下から ${gap}px。環境で 10px 動くので相対で見る）`;
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
        yr: document.querySelector(".strip-title")?.textContent.replace(/\s+/g, " ").trim() ?? "",
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
      await settleAfterCondition(page);
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
      must(await page.locator("#ovSwale").count() === 1, "明治期の土地を重ねる操作が無い");
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
      await settleAfterCondition(page);
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
    // ⚠ **下地を敷いても、上が不透明なら 1 ピクセルも見えない。**
    //   明治期のコマは「淡色地図＋区分の塗り」の 2 枚組で描いているが、塗りが不透明だったため、
    //   **全面が水だった土地（豊洲）では下地が完全に隠れ、画面の 6 割が青一色**になっていた。
    //   初見の 3 人が 3 人ともそこに最初に目を奪われ、1 人は「読み込み中かと思った」（2026-08-17）。
    //   ⚠ **この不具合は、それまでの検査を 1 つも落とさなかった。**
    //     層は在るし、タイルも取りに行くし、地図も出る。「見えているか」を誰も見ていなかった。
    //   → **撮った絵の画素を実際に数える。** 単色なら色数が極端に少ない。
    //   ⚠ 通信の本数では測れない（不透明度 0 でもタイルは取りに行く）。
    //   ⚠ 不透明度の値そのものを見ない。0.99 でも通ってしまい、**見えるかどうか**を測れない。
    name: "明治期のコマで、下地の地図が透けて見える", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page, reqs) {
      await waitVerdict(page);
      await page.waitForSelector("#big .lyr.on img", { timeout: 20000 });
      await page.waitForTimeout(3000);
      // 着いた直後は最古＝明治期のコマ。前提が変わったら落とす（別のコマを測って緑にしない）
      const first = await page.$eval("#yrBig", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/明治期/.test(first), `着いた直後が明治期のコマでない: ${first}`);
      // 絵の中だけを切り取る。四隅の操作（🔇・＋−・年バッジ・重ねる行）を含めない
      const box = await page.locator("#big").boundingBox();
      const clip = { x: box.x + box.width * 0.34, y: box.y + 10,
                     width: Math.round(box.width * 0.46), height: Math.round(box.height * 0.34) };
      // 撮った PNG を**その場のブラウザで開いて**画素を数える。
      // ⚠ data: URL なので canvas は汚れない（タイルを直接読むと cross-origin で読めない）
      const colors = async (area = clip) => {
        const buf = await page.screenshot({ clip: area });
        return page.evaluate(async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          return seen.size;
        }, buf.toString("base64"));
      };
      const on = await colors();
      // 単色に近ければ、下地は見えていない。実測（2026-08-17 / 豊洲）:
      //   直す前 = 2 色（青のベタ塗り）／直したあと = 数百色（道路・駅名・町名が透ける）
      must(on >= 24, `明治期のコマが単色に近い（下地が透けていない）: ${on} 色`);
      // ⚠ **帯の小さいコマも見る。** この画面は同じ絵を出す経路が **3 本**ある
      //   （帯のコマ・大きい絵・地図）。大きい絵と地図だけ直して**帯に届いておらず**、
      //   帯のコマが青いベタ塗りのまま残っていた（2026-08-17 にオーナーが実機で発見）。
      //   検査も 2 本しか見ていなかったので、緑のまま通していた。
      // ⚠ **帯には水域を重ねない**（オーナー判断 2026-08-17）。重ねると、全面が水だった土地で
      //   コマが青いベタ塗りになり、隣に並ぶ空中写真の中で 1 つだけ「絵ではないもの」になる。
      //   水域は、そのコマを選んだときに大きい絵の側で見せる（重ねる操作つき）。
      const cellBox = await page.locator("#strip .f.meiji").boundingBox();
      must(cellBox, "帯に明治期のコマが無い（この検査が何も見ていない）");
      const cell = await colors({ x: cellBox.x + 3, y: cellBox.y + 3,
        width: Math.max(1, Math.round(cellBox.width - 6)),
        height: Math.max(1, Math.round(cellBox.height - 6)) });
      // ⚠ コマは 24px 角しかないので、大きい絵より色数は少ない。
      //   ⚠ **ベタ塗りでも 0 色にはならない。** 枠の丸み・選択中の輪・判定した点の印・
      //     縁のぼかしが色を持つ。実測（2026-08-17 / 豊洲）:
      //       塗りが不透明 = 37 色 ／ 透かして重ねる = 134 色 ／ 重ねない（いま）= 176 色
      //     最初 12 色で書いたら**壊しても通った**ので、実測の間に置き直した。
      must(cell >= 80, `帯の明治期のコマが青いベタ塗りのまま: ${cell} 色（地図なら 170 前後）`);
      // ⚠ **塗りのタイルを要求していないこと**まで見る。透明にして隠すのでは、
      //   見えないものを国土地理院へ取りに行き続ける（掟: 地理院への負荷は自分の請求とは別に見る）
      const cellImgs = await page.$$eval("#strip .f.meiji img", (els) => els.map((e) => e.src));
      must(!cellImgs.some((s) => /\/swale\//.test(s)),
        `帯のコマが水域のタイルを取りに行っている: ${cellImgs.join(" / ")}`);
      // 重ねる操作が**そこに出ている**こと。以前は明治期のコマでだけ隠していた
      const row = await page.$eval("#ovRow", (e) => e.checkVisibility()).catch(() => false);
      must(row, "明治期のコマに、重ねる操作が出ていない");
      const c0 = await page.$eval("#ovSwale", (e) => e.checked);
      must(c0, "明治期のコマで、水域が既定で重なっていない");
      // ⚠ **押しても地図を起こさないこと。** 起こすと、静止画から地図へ絵が差し替わり
      //   **押した瞬間に位置が跳ぶ**（2026-08-17 にオーナーが実機で発見）。
      //   実測: #ovRow 自体は 1px も動かないのに、中の絵だけが替わる。
      //   ⚠ 明治期のコマは静止画のモザイクだけで成立する（淡色地図＋塗りの2枚組）。
      //     起こすぶんの要求（実測 24 タイル）も無駄になる
      //     （掟: 地理院への負荷は自分の請求とは別に見る）。
      const gsiBefore = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      // 入り切りで**絵が本当に変わる**こと（掟: 押しても何も起きない導線を置かない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      must(!(await page.$("#big.map-on")),
        "明治期のコマで重ねを押しただけで地図が起きた（絵が差し替わって位置が跳ぶ）");
      const gsiAfter = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      must(gsiAfter === gsiBefore,
        `明治期のコマで重ねを押しただけで、地理院へ ${gsiAfter - gsiBefore} 本出た`);
      const offBuf = await page.screenshot({ clip });
      const onBuf2 = await (async () => {
        await page.locator("#ovSwale").check();
        await page.waitForTimeout(900);
        return page.screenshot({ clip });
      })();
      must(!offBuf.equals(onBuf2), "重ねを入り切りしても、明治期のコマが1バイトも変わらない");
      // 切ったほうも単色でないこと（＝下地の地図が出ている。真っ白や真っ黒にしない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      const off = await colors();
      must(off >= 24, `水域を切ったのに、下地の地図が出ていない: ${off} 色`);
      // ⚠ **地図の経路でも同じことを確かめる。** ここまでは静止画のモザイクしか見ていない。
      //   同じ絵を出す経路が 2 本あり、**片方だけ直して届いていなかった事故を 2 回**やっている
      //   （CLAUDE.md の落とし穴）。実際、この検査を書いた直後に地図側だけ壊してみたら**通った**。
      //   → 地図が出ている状態（#big.map-on）にしてから、もう一度画素を数える。
      // ⚠ **この検査が見ていない範囲**（実測で確かめた 2026-08-17）:
      //   地図の**作成時**の不透明度（style の paint）を壊しても、ここは通る。
      //   地図の読み込み直後に applyOverlay() が必ず走って上書きするため、
      //   振る舞いに差が出ないから。作成時の値が効くのは「地図が出た瞬間の一瞬」だけで、
      //   そこは撮れていない。**「作成時の値も検査した」とは言わない。**
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(600);
      await page.locator("#big").click({ position: { x: 180, y: 120 } });   // 地図を起こす
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const onMap = await colors();
      must(onMap >= 24, `地図の経路でも下地が透けていない: ${onMap} 色`);
      // 地図が出た状態で、入り切りが効くこと（層だけを切り分けて見る）
      const mapOnBuf = await page.screenshot({ clip });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1500);
      const mapOffBuf = await page.screenshot({ clip });
      must(!mapOnBuf.equals(mapOffBuf),
        "地図が出ている状態で、重ねを入り切りしても1バイトも変わらない（地図の経路に届いていない）");
      // ⚠ **選んだ状態は、コマをまたいでも引き継ぐ。**（2026-08-17 オーナー判断）
      //   以前はコマごとに別々に覚えていたが、**明治期で入にしたのに写真へ移ると切れる**
      //   という取り違えを生んだ。「明治期の水域を見ているか」は1つの問いなので、状態も1つ。
      //   ⚠ ここは**切った状態**のまま移る（直前で uncheck している）。切ったまま引き継ぐこと。
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "切ったのに、写真の年代へ移ったら入に戻った");
      await page.locator("#strip .f").nth(0).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "明治期のコマへ戻ったのに、切っておいた設定が戻っていない");
      // 入れ直して、写真の年代へ**入のまま**引き継ぐこと（今回の指摘そのもの）
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(800);
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === true,
        "明治期で入にしたのに、写真の年代へ移ると切れている");
      // ⚠ チェックが入っているだけでは足りない。**層まで効いていること**を見る
      const carried = await page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      must(carried > 0,
        `写真の年代でチェックは入っているのに、層が ${carried}（何も重なっていない）`);
      return `3経路とも下地が透ける（帯のコマ ${cell} 色／大きい絵 ${on} 色／地図 ${onMap} 色`
        + `／切ると ${off} 色。単色なら 2〜4 色）／入り切りで絵が変わる／状態がコマをまたいで引き継がれる`;
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
      // ⚠ 操作を黙って消すだけだと「壊れている」と読める。なぜ出せないかは画面が言う。
      //   整備対象外（404）と、読み込めなかった（通信断・403）は別の言葉でなければならない。
      must(m.some((t) => /明治期のデータ(なし|を読み込めませんでした)/.test(t)),
        `重ねる操作を出さない理由が、画面のどこにも無い（バッジ: ${m.join(" / ")}）`);
      return `明治期なし（バッジ ${m.length} 個）／重ねる操作を出していない`;
    },
  },
  {
    // ⚠ 重ねる相手は写真なのに、操作は写真・判定文・▶ の下にあった。
    //   実測（2026-08-16 / 豊洲）で 1280×800 では y=831 と**初期画面の外**、
    //   375×667 でも 552px（写真の下）。写真が見えているのに操作が見えない状態を作らない。
    //   → 年バッジと同じ積み上げ（.bl）に入れた。固定値で位置を決めない。
    name: "重ねる操作が、写真と一緒に初期画面に見える", path: `/?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 明治期のコマは空中写真ではない。幅のある見出しの側で、そう名乗る
      const yr = await page.locator("#yrBig").textContent();
      must(yr.includes("空中写真ではありません"),
        `明治期の見出しが、空中写真と区別できない: ${yr}`);
      const cell = await page.locator("#strip .f.meiji .yr").textContent();
      must(cell.trim() === "明治期", `帯のコマの見出しが変わっている: ${cell}`);
      // ⚠ この検査は以前、**明治期のコマでは操作を出さない**ことを求めていた。
      //   当時の理由は「重ねる相手（空中写真）が無い／入り切りしても絵が変わらない」で、
      //   当時は正しかった（掟: 押しても何も起きない導線を置かない）。
      //   ⚠ 前提が変わった。相手は**下に敷いてある淡色地図**で、塗りを透かしたので
      //     入り切りすると絵が本当に変わる。**出すのが正しい**（2026-08-17）。
      //   守っていた「押しても何も起きない導線を置かない」は、
      //   →「明治期のコマで、下地の地図が透けて見える」が、画素を数えて引き継いでいる。
      must(await effOpacity(page, "#ovRow") > 0,
        "明治期のコマで、重ねる操作が出ていない（下地の地図を出し入れできない）");
      // 写真の年代（1936–42）へ移ると、出る
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      // ⚠ **地図を載せてから見る。** 国土地理院の帰属表示は地図が載って初めて出る。
      //   載せずに見ていたら、帰属表示に重なっていることを一度も捕まえられない。
      await page.click("#zIn");
      await settleAfterClick(page);
      const geom = () => page.evaluate(() => {
        const R = (s) => {
          const e = document.querySelector(s); if (!e) return null;
          const b = e.getBoundingClientRect();
          return { t: Math.round(b.top), b: Math.round(b.bottom),
                   l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) };
        };
        // 重なりは矩形の交差で見る（見えているつもりを、座標で潰す）
        const hit = (a, x) => !!a && !!x && a.l < x.r && x.l < a.r && a.t < x.b && x.t < a.b;
        const ov = R("#ovRow"), big = R("#big");
        // 地図を載せると出る帰属表示（国土地理院）。**隠していないこと**を座標で見る
        const attr = R(".maplibregl-ctrl-attrib");
        return { ov, big, h: innerHeight,
          inViewport: !!ov && ov.t >= 0 && ov.b <= innerHeight,
          // ⚠ 写真の**すぐ下**。中ではない（2026-08-17 に外へ出した）
          underBig: !!ov && !!big && ov.t >= big.b && ov.t - big.b <= 20,
          sameRail: !!ov && !!big && Math.abs(ov.l - big.l) <= 1,
          overZoom: hit(ov, R(".zoombar")),
          // ⚠ **写真の中に載っているもの**が、帰属表示を隠していないか。
          //   隠す危険があるのは「重ねる」（外に出した）ではなく ＋− のほう。
          //   実測（2026-08-17）: ＋− の底を 34px にしていたら − の下端と帰属の上端が
          //   ぴったり接し、オーナーが「国土地理院と − のボタンが被る」と報告した。
          zoomOverAttr: hit(R(".zoombar"), attr), attrThere: !!attr,
          // 接しているのも駄目。何px 空いているかを返す
          zoomGap: (() => { const z = R(".zoombar");
            return z && attr ? Math.round(attr.t - z.b) : null; })(),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      const out = [];
      // ⚠ PC でも見えることが今回の要点。スマホだけ見ると、直したつもりで直っていない
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        // ⚠ **その大きさで読み込み直す**（2026-08-20。hidetzu/konjaku#122）。
        //   ⚠ 伸縮するだけでは、⚠ **写真が前の大きさの高さを保つ。**
        //   ⚠ 実際に穴だった: 写真の上限（縦の短い画面）を丸ごと外しても緑のままで、
        //     ⚠ **実機の読み込みでは 375×667 も 320×640 も画面から出ていた**
        //     （重ねる下端 671/667・655/640）。⚠ **伸縮は実機の代わりにならない。**
        await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        await waitStrip(page);
        await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
        // ⚠ **読み込み直したら、見る状態も作り直す。**
        //   写真の年代（1936–42）へ移し、⚠ **地図を載せる**（帰属表示は地図が載って初めて出る）
        await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
        await settleAfterClick(page);
        await page.click("#zIn");
        await settleAfterClick(page);
        const g = await geom();
        must(g.inViewport,
          `${w}×${h}: 重ねる操作が初期画面の外にある（y=${g.ov?.t}〜${g.ov?.b} / 画面 ${g.h}）`);
        // ⚠ **写真から離さない。** 押した結果（絵が変わる）が同時に見えている必要がある。
        //   以前は判定文の下にあり、押しても何が変わったか見えなかった。
        //   ⚠ 写真の**中**に戻すのも駄目。実測（2026-08-17 / 344×882 ZFold5 カバー）で
        //     写真が 278×209px しかなく、🔊・＋−・この行・国土地理院が全部載って窮屈だった。
        must(g.underBig,
          `${w}×${h}: 重ねる操作が写真のすぐ下にない（写真の下端 ${g.big?.b} / 操作の上端 ${g.ov?.t}）`);
        must(g.sameRail, `${w}×${h}: 写真と左端が揃っていない（写真 ${g.big?.l} / 操作 ${g.ov?.l}）`);
        must(await effOpacity(page, "#ovRow") > 0, `${w}×${h}: 重ねる操作が読めない`);
        must(!g.overZoom, `${w}×${h}: 重ねる操作がズームと重なっている`);
        // ⚠ **国土地理院の帰属表示を隠さない**（掟: 出典は隠さない）。
        must(g.attrThere, `${w}×${h}: 地図を載せたのに帰属表示が出ていない（この検査が何も見ていない）`);
        must(!g.zoomOverAttr, `${w}×${h}: ＋− が国土地理院の帰属表示に重なっている`);
        // 接するのも駄目。指で押すと隣に触る
        must(g.zoomGap >= 6,
          `${w}×${h}: ＋− と国土地理院の帰属表示が近すぎる: ${g.zoomGap}px（6px 必要）`);
        must(!g.overflowX, `${w}×${h}: 横にあふれている`);
        out.push(`${w}×${h}: 写真の下 ${g.ov.t - g.big.b}px／＋−と出典 ${g.zoomGap}px`);
      }
      return `明治期では出さない ／ ${out.join(" ／ ")}`;
    },
  },
  {
    // ⚠ チェックが入っていることと、画面に重なっていることは別。
    //   「重ねています」と書いてある横で、層の不透明度が 0 という状態を作らない。
    name: "重ねているかどうかを、言葉と層で食い違わせない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 層の不透明度は、画面の言葉ではなく地図そのものに聞く
      const op = () => page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      const st = () => page.locator("#ovState").textContent();

      // ⚠ この検査は以前、**正常時の実況**（「ONで地図に重ねます」「重ねています」）を
      //   文字列で要求していた。守っていたのは「言葉と層を食い違わせない」ことだが、
      //   実況をやめた（2026-08-17 オーナー判断: ラベルと合わせて 2 行になり読む量が増える）ので、
      //   **同じ意図を裏返して守る**: 正常なときは**何も言わない**こと＋層が言葉と食い違わないこと。
      //   ⚠ 「取れなかったときは言う」ほうは、次のケース（水域のタイルだけ拒まれたら）が見ている。
      // ⚠ 既定は入。まず切ってから、写真の年代へ移る
      //   （切ったまま引き継ぐので、移った先でも層は無い）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      const before = (await st()).trim();
      must(before === "", `切っているだけなのに、何か書いてある: 「${before}」`);
      // ⚠ この検査は以前「押していないのに、もう地図の層がある」を見ていた。
      //   状態を1つにして引き継ぐようにしたので、**入のまま移ってきたら層はある**のが正しい。
      //   ここでは直前に切ってから移っているので、層はまだ無い。
      must(await op() === null, "切ったまま移ってきたのに、もう地図の層がある");

      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"), null, { timeout: 60000 });
      await page.waitForFunction(() =>
        (typeof mapObj !== "undefined" && mapObj?.getPaintProperty("swale", "raster-opacity")) > 0,
        null, { timeout: 20000 });
      const onOp = await op();
      must(onOp > 0, `重ねたのに、層が ${onOp}`);
      const onTx = (await st()).trim();
      must(onTx === "", `正常に重なっているのに、実況が書いてある: 「${onTx}」`);

      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      const offTx = (await st()).trim();
      must(offTx === "", `切っただけなのに、何か書いてある: 「${offTx}」`);
      must(await op() === 0, `切ったのに、層が ${await op()} のまま`);
      return `切: 層 0／入: 層 ${onOp}／正常時は言葉を出さない（3 状態とも空）`;
    },
  },
  {
    // ⚠ 層があることと、水域が画面に出ていることは別（レビューで指摘された）。
    //   地図も写真も出せるのに、**水域のタイルだけ**拒まれる状態がある。
    //   ⚠ 逆に 404 は「その範囲は整備対象外」なので、失敗として扱ってはいけない。
    //     両方をこの1件で見る。
    name: "水域のタイルだけ拒まれたら、取れなかったと言う", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      // 判定を先に済ませる（判定できた土地でしか操作は出ない）
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      let denied = 0;
      await page.route(SWALE_ROUTE, (r) => { denied++;
        r.fulfill({ status: 403, contentType: "text/html", body: "403 Forbidden" }); });
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const bad = (await page.locator("#ovState").textContent()).trim();
      // ⚠ 前提が消えたら落とす。1本も拒めていないなら、この検査は何も確かめていない
      must(denied > 0, "水域のタイルを1本も拒めていない（検査の前提が消えた）");
      must(!bad.includes("重ねています"), `明治期を取れていないのに、重ねたと言っている: ${bad}`);
      // ⚠ **その文が1行に収まっていること。** 写真の上に置いているので、折り返したぶんだけ
      //   写真が隠れる。⚠ **この約束は長いあいだ 320px で破れていた**（2026-08-17 実測:
      //   「水域を読み込めませんでした」で札が 44px → 58px）。誰も見ていなかったので、ここで見る。
      for (const [w, h] of [[375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        const g = await page.evaluate(() => {
          const st = document.getElementById("ovState");
          const lh = parseFloat(getComputedStyle(st).lineHeight) || 15;
          return { rows: Math.max(1, Math.round(st.getBoundingClientRect().height / lh)),
            rowH: Math.round(document.getElementById("ovRow").getBoundingClientRect().height),
            t: st.textContent };
        });
        must(g.rows === 1,
          `${w}×${h}: 状態の文が ${g.rows} 行に折り返している（札 ${g.rowH}px）: 「${g.t}」`);
      }
      await page.setViewportSize({ width: 375, height: 667 });
      must(bad.includes("読み込めません"), `明治期を取れなかったことを言っていない: ${bad}`);
      must(await page.locator("#big.map-on").count() === 1,
        "水域が取れないだけなのに、地図ごと出なくなっている");

      // ⚠ 404（整備対象外）は失敗ではない。入れ直したら**何も言わない**状態に戻ること。
      //   ⚠ 以前は「重ねています」に戻ることを見ていた。正常時の実況をやめたので、
      //     同じ意図（404 を「読み込めなかった」に化けさせない）を**空に戻る**ことで守る。
      //   ⚠ 実測（2026-08-16 / MapLibre GL JS v5.24.0）では 404 で error 自体が飛んでこないので、
      //     ここが見ているのは**画面が何と言うか**であって、除外の条件式ではない
      //     （条件式を外しても、この検査は落ちない。確かめた）。
      await page.unroute(SWALE_ROUTE);
      let missing = 0;
      await page.route(SWALE_ROUTE, (r) => { missing++; r.fulfill({ status: 404, body: "" }); });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(500);
      await page.locator("#ovSwale").check();
      await page.evaluate(() => mapObj?.jumpTo(
        { center: [mapObj.getCenter().lng + 0.03, mapObj.getCenter().lat], zoom: 16 }));
      await page.waitForTimeout(3000);
      const gone = (await page.locator("#ovState").textContent()).trim();
      must(missing > 0, "404 を1本も返せていない（検査の前提が消えた）");
      must(gone === "",
        `整備対象外（404）を、読み込めなかったことにしている: 「${gone}」`);
      return `403 を ${denied} 本 → 「${bad}」／404 を ${missing} 本 → 「${gone}」`;
    },
  },
  {
    // ⚠ 地図が出せなかったときに「重ねています」と書くと、起きていないことを書くことになる。
    //   OFF と「出せなかった」を同じ顔にしない（掟: 取れなかったを、有ることにしない）。
    name: "地図を読み込めないときに「重ねています」と言わない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: async (page) => {
      await stubWikidata(page, []);
      await page.route("**/vendor/maplibre-gl.js", (r) => r.abort());
    },
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 重ねる相手は空中写真なので、写真の年代へ移ってから押す（明治期では出さない）
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      // ⚠ 「読み込んでいます…」のまま止まるのも失敗。**終わったと言うところ**まで待つ。
      //   待ち切れなかったときに Timeout とだけ出ると、何が起きたのか読めないので、
      //   いま画面に出ている言葉を添えて落とす。
      // ⚠ 正常時は何も言わなくなったので、「終わった」の合図は
      //   「読み込めませんでした」が出ること、そのもの
      const done = await page.waitForFunction(() =>
        /読み込めません/.test(document.getElementById("ovState")?.textContent ?? ""),
        null, { timeout: 30000 }).catch(() => null);
      const tx = (await page.locator("#ovState").textContent()).trim();
      must(done, `地図の読み込みは終わっているのに、状態が「${tx}」のまま止まっている`);
      must(!tx.includes("重ねています"), `地図が出せていないのに、重ねたと言っている: ${tx}`);
      must(tx.includes("読み込めません"), `地図が出せなかったことを言っていない: ${tx}`);
      // 判定そのものは巻き添えにしない
      const v = await page.locator("#verdict").textContent();
      must(v.includes("明治期"), "地図が出せないことで、判定まで消えている");
      return `地図を出せないとき: 「${tx}」／判定は残る`;
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
    setup: (page) => Promise.all([
      // 現在の静的タイル範囲に浦安が含まれても、Overpassの失敗経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
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
      must(await page.locator("#status .retry-btn").count() === 1, "建物取得失敗時の再試行が出ていない");
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
  // ---- 建物 0 件を、取得中・取得失敗と混ぜない ----
  // ⚠ 正常に 0 件と確認できた状態が、同じ画面で「取得中」とも「欠落」とも見えていた。
  //   直したのは表示だけではなく取得側で、`[]`（正常に 0 件）と `null`（取れていない）を
  //   分けたこと。**3 つの状態を、それぞれ別の経路で再現して**確かめる。
  {
    name: "取り込み済みで 0 件なら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    // 索引はそのまま（＝「この区画は見た」）にして、中身だけ 0 件のタイルに差し替える。
    // ⚠ **詰めた形（v=3）で返す。** 形が違うと読む側が捨てて Overpass へ落ちるので、
    //   この検査は何も確かめないまま緑になる（実際に v=2 で試して確認した）。
    setup: (page) => page.route("**/data/bl/14/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ v: 3, tile: [0, 0], at: "2026-08-16", q: 100000,
        o: [0, 0], k: [], n: [null], m: [null], b: [] }),
    })),
    async check(page, reqs) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みで 0 件と分かっているのに、Overpass へ出ている");
      // ⚠ ここには「別の事前生成データ（豊洲だけの GeoJSON）で上書きしない」を
      //   見る行があった。⚠ **2026-08-20 にその落ち先ごと消えたので、
      //   ここに残しても何も主張していない**（掟: 検証していないことを確認済みと呼ばない）。
      //   ⚠ **主張は消していない。**「土地ごとの例外が生えていないこと」は
      //   check.mjs の「3.5. 土地ごとの例外を作っていない」が見ている。
      const bd = (await page.locator("#breakdown").textContent()).replace(/\s+/g, " ");
      const prov = (await page.locator("#prov").textContent()).replace(/\s+/g, " ");
      for (const [where, t] of [["内訳", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/取り込み済みの建物データで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `Overpass 0 本／台帳「取り込み済みの建物データで建物 0 件」`;
    },
  },
  {
    // ⚠ **資料の範囲外を、分類の 1 行として出さない。**
    //   実測（2026-08-19, 375×667 札幌）: 内訳に「データなし 1364 / 1364」が 1 行だけ出て、
    //   `isWater("データなし")` が false なので**陸の色見本（#d8cfa8）**が付いていた。
    //   ⚠ 「明治期は陸だった建物が 1364 件」と読める。掟: データにない ≠ 現実にない。
    //   ⚠ **静的検査では捕まらない。**色見本が付くかは DOM を見ないと分からない。
    name: "資料の範囲外に、陸の色を塗らない", path: `/peel?${SAPPORO}`, group: "core",
    async check(page) {
      // 建物が出そろうまで待つ（件数が動いている途中を読まない）
      await page.waitForFunction(() => {
        const t = document.getElementById("breakdown")?.textContent ?? "";
        return /件/.test(t) && !/取得中/.test(t);
      }, null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        rows: [...document.querySelectorAll("#breakdown .stat")].map((e) => ({
          t: e.innerText.replace(/\s+/g, " ").trim(),
          bg: getComputedStyle(e.querySelector(".swatch")).backgroundColor })),
        hint: [...document.querySelectorAll("#breakdown .hint")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" ／ "),
      }));
      // ⚠ 分類の行が 1 本もないこと。1 本でもあれば「明治期は○○だった」と読める
      must(r.rows.length === 0,
        `資料の範囲外を分類の行にしている: ${r.rows.map((x) => `${x.t}[${x.bg}]`).join(" / ")}`);
      // ⚠ 件数は落とさない。落とすと「建物が無い」に読める
      must(/1364|\d{3,}/.test(r.hint), `件数を落としている: ${r.hint}`);
      must(/範囲の外|整備している範囲/.test(r.hint), `範囲の外であることを言っていない: ${r.hint}`);
      // ⚠ こちらの都合（読み込めない）に読める言い方をしない
      must(!/読み込め|取得中|取得できません/.test(r.hint),
        `範囲の外なのに、こちらの都合に読める言い方をしている: ${r.hint}`);
      // ⚠ 「無い」と言い切らない
      must(!/(建物|記録)(は|が)?(無い|ありません)/.test(r.hint), `無いと言い切っている: ${r.hint}`);
      return `内訳の分類行 0 本／「${r.hint.slice(0, 46)}」`;
    },
  },
  {
    // ⚠ **読めなかった年代を、トップが黙って落とさない。**
    //   実測（2026-08-19・出島・利用者役 3 名。⚠ 実在の利用者ではない）:
    //     落とした版を見せると **3/3 が「その年代の写真は存在しない」と答えた**。
    //   ⚠ `/peel` は最初から残していた。同じ問いに 2 つの答えがあり、
    //     実描画が 2 回それで落ちていた（相手先が 1 回 404 を返さなかっただけで）。
    //   ⚠ **ここは 404 を落とすことも一緒に見る。**残すほうだけ見ると、
    //     「全部残す」に変えても緑になる。
    name: "読めなかった年代を、トップが黙って落とさない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`, group: "core",
    // ⚠ gazo3（1984–86）だけ落とす。⚠ gazo2 / gazo4 は 404 のまま（出島には無い）
    setup: (page) => page.route(/\/xyz\/gazo3\//, (r) => r.abort("timedout")),
    async check(page) {
      await waitVerdict(page);
      const r = await page.evaluate(() => ({
        yrs: [...document.querySelectorAll("#strip .f .yr")].map((e) => e.textContent.trim()),
        btn: document.querySelectorAll("#strip button.f").length,
        unread: [...document.querySelectorAll("#strip .f.unread")].map((e) => ({
          tag: e.tagName, yr: e.querySelector(".yr")?.textContent.trim() ?? null,
          dis: e.getAttribute("aria-disabled"),
          say: getComputedStyle(e.querySelector(".im.err"), "::after").content,
        })),
      }));
      // ⚠ 読めなかった 1984–86 が残っていること
      must(r.yrs.includes("1984–86"),
        `読めなかった年代を落としている（「無い」と読まれる）: ${r.yrs.join("/")}`);
      must(r.unread.length === 1 && r.unread[0].yr === "1984–86",
        `読めなかったコマが 1 つでない: ${JSON.stringify(r.unread)}`);
      // ⚠ 404 の年代（出島に写真が無い）は、いままでどおり出さない
      for (const gone of ["1979–83", "1987–90", "1936–42"])
        must(!r.yrs.includes(gone), `404 の年代 ${gone} まで出している: ${r.yrs.join("/")}`);
      // ⚠ 押しても何も起きないので、押せる見た目にしない（ADR 0026）
      must(r.unread[0].tag !== "BUTTON", `読めないコマが押せるままになっている: ${r.unread[0].tag}`);
      must(r.unread[0].dis === "true", `読めないコマが aria-disabled でない: ${r.unread[0].dis}`);
      // ⚠ こちらの都合を回線のせいに読ませない。⚠ 進行形にしない
      const say = r.unread[0].say;
      must(!/読み込め|通信|接続|中…|中$/.test(say), `原因を決めつける／進行形の言い方: ${say}`);
      must(/出せません/.test(say), `いま出せないことを言っていない: ${say}`);
      return `1984–86 が押せない枠として残り「${say.replace(/\\A/g, " ")}」／`
        + `押せるコマ ${r.btn}／404 の 3 年代は出ていない`;
    },
  },
  {
    // ⚠ **PC のパネルも層で答えること**（ADR 0030）。
    //   実測（2026-08-19）: HUD だけ層にしたとき、PC は古い形（heroNum / heroCap）のままで、
    //   ⚠ **豊洲で 99.6% が 2 回**出ていた。⚠ 利用者役 3/4 が指摘した。
    //   ⚠ **同じ問いに 2 つの答えを持たない**（ADR 0021）。
    // ⚠ **実効 opacity で見る。**`#panel.hide` は opacity:0 で display は残るので、
    //   checkVisibility() だけでは「見えている」と誤って読む（実測 2026-08-19 に踏んだ）。
    name: "パネルも層で答え、同じ数字を 2 回出さない", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#landAll .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const eff = (el) => { if (!el || !el.checkVisibility()) return 0;
          let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === "none" || s.visibility === "hidden") return 0;
            o *= Number(s.opacity); }
          return +o.toFixed(3); };
        const t = (id) => { const e = document.getElementById(id);
          return eff(e) > 0 ? (e.innerText ?? "") : ""; };
        return { seen: t("landAll") + "\n" + t("land"),
          qs: [...document.querySelectorAll("#landAll .land-q,#land .land-q")]
                .filter((e) => eff(e) > 0).map((e) => e.textContent.trim()),
          hero: document.querySelectorAll("#heroNum,#heroCap").length };
      });
      // ⚠ 古い入れ物が残っていないこと（残っていると、また 2 つの答えになる）
      const pc = await look();
      must(pc.hero === 0, `heroNum / heroCap が残っている: ${pc.hero} 個`);
      must(/どういう土地/.test(pc.qs[0] ?? ""), `PC で先頭が第1層でない: ${pc.qs.join(" / ")}`);
      must(pc.qs.length === 3, `PC のパネルに 3 層そろっていない: ${pc.qs.join(" / ")}`);
      must((pc.seen.match(/99\.6/g) || []).length === 1,
        `PC で 99.6% が ${(pc.seen.match(/99\.6/g) || []).length} 回出ている`);
      // ⚠ **狭い幅も対にして見る。**PC だけ直して、スマホを壊しても緑にならないように。
      //   ⚠ **読み込み直す。**パネルの開閉は**読み込み時の幅**で決まり、
      //     リサイズでは切り替わらない（peel3d.js の isNarrow は「あとで変えない」）。
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#land .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const sp = await look();
      must(sp.qs.length === 2, `スマホの HUD が第1層＋1 つでない: ${sp.qs.join(" / ")}`);
      must((sp.seen.match(/99\.6/g) || []).length === 1,
        `スマホで 99.6% が ${(sp.seen.match(/99\.6/g) || []).length} 回出ている`);
      return `PC ${pc.qs.length} 層（${pc.qs.map((x) => x.slice(0, 6)).join("→")}）／`
        + `スマホ ${sp.qs.length} 層／99.6% はどちらも 1 回`;
    },
  },
  {
    // ⚠ **常時見える HUD が、確実性の高い順に層を出すこと**（ADR 0030）。
    //   実測（2026-08-19・main = d7dce05）: 層という値が無かったので、4 地点とも順番が違った。
    //     豊洲 第3層→第2層（⚠ 第1層が無い） ／ 札幌・那覇 ⚠ 出せない断りから始まった。
    //   ⚠ **HUD は第1層＋1 つに絞る。**3 層とも出すと 375×667 で 320px になり、
    //     下端 y=382 が**調べている地点（画面中央 y=333）を覆った**。
    name: "土地の答えが、確実性の高い順に出る", path: `/peel?${TOYOSU}`, group: "core",
    // ⚠ **#land は狭い幅の道具。**既定の 1200×780 では display:none で、
    //   getBoundingClientRect() が 0 を返す。⚠ **隠れたものを測って「覆わない」と言わない**
    //   （実測 2026-08-19: 下端 0 < 中央 390 で、何も見ずに通っていた）。
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      // ⚠ **答えが出そろってから読む。**建物と地形分類は別々に返るので、
      //   途中を読むと層が 1 つだけの瞬間を捕まえる（実測 2026-08-19: 2 回に 1 回落ちた）。
      await page.waitForFunction(() => (document.querySelectorAll("#land .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("land");
        const q = el.getBoundingClientRect();
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          bottom: Math.round(q.bottom), mid: Math.round(window.innerHeight / 2),
          // ⚠ 隠れていたら、覆うかどうかは測れない。**測れないと言う**
          seen: el.checkVisibility(),
          nums: [...el.querySelectorAll(".land-num")].length,
          dens: [...el.querySelectorAll(".land-den")].length,
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      // ⚠ 第1層が先頭。ここが崩れると「できないことから書き始める」に戻る
      must(/どういう土地/.test(r.qs[0] ?? ""), `先頭が第1層でない: ${r.qs.join(" / ")}`);
      // ⚠ 内部の呼び名を出さない
      must(!/第[123]層/.test(r.txt), `内部の呼び名が画面に出ている: ${r.txt.slice(0, 60)}`);
      // ⚠ 数字を出すなら分母も出る（掟: 数字は主張範囲の分母で書く）
      must(r.nums === 0 || r.dens >= r.nums, `数字 ${r.nums} 個に対して分母が ${r.dens} 個`);
      // ⚠ **調べている地点を覆わない。**⚠ 見えていなければ、この主張は測れていない
      must(r.seen, "HUD が見えていない（覆うかどうかを測れていない）");
      must(r.bottom < r.mid, `HUD が調べている地点を覆っている: 下端 ${r.bottom} / 中央 ${r.mid}`);
      return `${r.qs.length} 層（${r.qs.join(" → ")}）／下端 ${r.bottom} < 中央 ${r.mid}`;
    },
  },
  {
    // ⚠ **出ない層を、黙って消さない**（ADR 0001）。
    //   ⚠ 札幌は明治期が範囲外・建物の足元が判定できない。**両方とも理由を出す**。
    //   ⚠ 実測（2026-08-19）: 最初は第2層と第3層が同じ文を返し、同じ行が 2 回並んだ。
    name: "出ない層も、その層の位置に理由を出す", path: `/peel?${SAPPORO}`, group: "core",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.querySelectorAll("#land .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("land");
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          miss: [...el.querySelectorAll(".land-miss")].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      must(/どういう土地/.test(r.qs[0] ?? ""), `先頭が第1層でない: ${r.qs.join(" / ")}`);
      must(r.miss.length === 2, `出ない層の理由が 2 つでない: ${r.miss.length} 個`);
      // ⚠ 同じ文を 2 回出さない
      must(new Set(r.miss.map((x) => x.split(" ")[0])).size === 2,
        `出ない層の理由が重複している: ${r.miss.join(" ／ ")}`);
      // ⚠ **ここに LIES を当てない。**LIES は「通信断・403 のときに言ってはいけない語」で、
      //   ⚠ **札幌は本当に 404（整備対象外）**。当てると、正しい説明のほうが落ちる
      //   （実測 2026-08-19: そう書いて落とした）。
      // ⚠ 見るのは「無い」と言い切っていないこと。
      for (const w of ["データが無い", "記録がありません", "残っていない", "存在しません"])
        must(!r.txt.includes(w), `出ない層を「無い」と言い切っている: 「${w}」`);
      return `第1層のみ立ち、出ない 2 層は理由つき（${r.miss.map((x) => x.slice(0, 20)).join(" ／ ")}）`;
    },
  },
  {
    // ⚠ **深掘りの画面の再生で、カメラを振らない。**
    //   ⚠ CSS では止まらない（requestAnimationFrame + map.jumpTo の自前実装）。
    //   ⚠ **姿勢は MapLibre のコンパスの style から読む。**地図を外へ公開しない。
    //     実測（2026-08-19）: rotateX が pitch、末尾の rotateZ が -bearing。
    //   ⚠ **zoom は画面に出ていないので、ここでは測っていない**（経路は静的検査が見る）。
    name: "「動きを減らす」を入れると、深掘りの再生でカメラを振らない",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: (page) => page.emulateMedia({ reducedMotion: "reduce" }),
    async check(page) {
      const cam = () => page.evaluate(() => {
        const st = document.querySelector(".maplibregl-ctrl-compass .maplibregl-ctrl-icon")
          ?.getAttribute("style") ?? "";
        const one = (re) => { const m = re.exec(st); return m ? Math.round(parseFloat(m[1]) * 10) / 10 : null; };
        return { pitch: one(/rotateX\(([-\d.]+)deg\)/), bearing: one(/rotateZ\(([-\d.]+)deg\);?\s*$/),
                 year: document.getElementById("rlYear")?.innerText.trim() ?? null };
      });
      await page.waitForFunction(() => document.getElementById("play")?.checkVisibility() === true,
        null, { timeout: 90000 });
      const a = await cam();
      // ⚠ 読めていないのに「動いていない」と言わない
      must(a.pitch !== null && a.bearing !== null,
        `コンパスから姿勢を読めない（この検査が何も見ていない）: ${JSON.stringify(a)}`);
      await page.click("#play");
      // ⚠ ここは短くしない。下で「6 秒後」の姿勢を主張している
      await page.waitForTimeout(6000);
      const b = await cam();
      await page.waitForTimeout(9000);
      const c = await cam();
      for (const [when, r] of [["6 秒後", b], ["15 秒後", c]]) {
        must(r.pitch === a.pitch, `${when} に傾斜が変わった: ${a.pitch}° → ${r.pitch}°`);
        must(r.bearing === a.bearing, `${when} に向きが変わった: ${a.bearing} → ${r.bearing}`);
      }
      // ⚠ **止めてはいない。**年代は最後まで送られること（押しても何も起きない状態にしない）
      must(b.year !== a.year, `年代が送られていない（${a.year} のまま）`);
      must(/明治/.test(c.year ?? ""), `最後まで送られていない: ${c.year}`);
      return `傾斜 ${a.pitch}° ／ 向き ${a.bearing} が動かず、年代は ${a.year} → ${b.year} → ${c.year}`;
    },
  },
  {
    // ⚠ **減らしていない人の見え方を変えない。**
    //   ⚠ これが無いと、**カメラを全員から止めてしまっても**上の検査は通る。
    name: "「動きを減らす」でない人には、深掘りの再生でカメラが振れる",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: (page) => page.emulateMedia({ reducedMotion: "no-preference" }),
    async check(page) {
      const cam = () => page.evaluate(() => {
        const st = document.querySelector(".maplibregl-ctrl-compass .maplibregl-ctrl-icon")
          ?.getAttribute("style") ?? "";
        const one = (re) => { const m = re.exec(st); return m ? Math.round(parseFloat(m[1]) * 10) / 10 : null; };
        return { pitch: one(/rotateX\(([-\d.]+)deg\)/), bearing: one(/rotateZ\(([-\d.]+)deg\);?\s*$/),
                 year: document.getElementById("rlYear")?.innerText.trim() ?? null };
      });
      await page.waitForFunction(() => document.getElementById("play")?.checkVisibility() === true,
        null, { timeout: 90000 });
      const a = await cam();
      await page.click("#play");
      await page.waitForTimeout(15000);
      const c = await cam();
      // ⚠ 実測（2026-08-19）: 終点は pitch +10°・bearing +46°（rotateZ は -bearing なので -46）
      must(c.pitch - a.pitch >= 9 && c.pitch - a.pitch <= 11,
        `傾斜の変化が +10° でない: ${a.pitch}° → ${c.pitch}°`);
      must(Math.abs((a.bearing - c.bearing) - 46) <= 2,
        `向きの変化が 46° でない: ${a.bearing} → ${c.bearing}`);
      must(/明治/.test(c.year ?? ""), `最後まで送られていない: ${c.year}`);
      return `傾斜 ${a.pitch}° → ${c.pitch}° ／ 向き ${a.bearing} → ${c.bearing}（いままでどおり）`;
    },
  },
  {
    // ⚠ **「動きを減らす」を入れている人に、動きだけを消す。**
    //   ⚠ 静的検査は媒体クエリが「ある」ことしか見られない。
    //     ⚠ **効いているか**は、計算後の値を読まないと分からない。
    name: "「動きを減らす」を入れると、自前の動きが残らない", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "reduce" }),
      // ⚠ **実際に渡している値を記録する。**受け口は素のスクリプトの中にあって
      //   window から呼べない。呼べないものを「確認済み」と言わないための記録。
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      //   ⚠ 待ちたいのは「判定が確定して、答えの行に何か出たこと」。
      await page.waitForFunction(
        () => (document.querySelector("#verdict .v-head")?.innerText ?? "").trim().length > 3,
        null, { timeout: 90000 });
      const r = await page.evaluate(() => {
        const sec = (v) => v.split(",").map((x) => x.trim())
          .map((x) => x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x));
        const out = [];
        // ⚠ 自前の宣言を持つ要素を、実際に DOM から拾う（決め打ちしない）
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          for (const [k, v] of [["transition", st.transitionDuration], ["animation", st.animationDuration]])
            for (const d of sec(v || "0s"))
              if (d > 0.01) out.push(`${k} ${d}s ${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 24)}`);
        }
        return { slow: [...new Set(out)].slice(0, 6), n: out.length,
                 mq: matchMedia("(prefers-reduced-motion: reduce)").matches };
      });
      must(r.mq, "ブラウザ側で「動きを減らす」になっていない（この検査が何も見ていない）");
      must(r.n === 0, `動きが残っている ${r.n} 件: ${r.slow.join(" / ")}`);
      // ⚠ 寄せる操作も滑らかにしない。**実際に押して、渡った値を読む**
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      // ⚠ 1 件も起きていないなら、この検査は寄せる操作を見ていない。**起きたことを要求する**
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "auto"),
        `寄せる操作が滑らかなまま: ${JSON.stringify([...new Set(siv)])}`);
      return `自前の動き 0 件（transition / animation とも 0.01s 以下）`
        + `／寄せる操作 ${siv.length} 件はすべて auto`;
    },
  },
  {
    // ⚠ **動きを減らしていない人の見え方を変えない。**
    //   ⚠ 「動きを消した」検査だけだと、**全部消してしまっても緑**になる。
    name: "「動きを減らす」でない人には、いままでの動きが残る", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "no-preference" }),
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      //   ⚠ 待ちたいのは「判定が確定して、答えの行に何か出たこと」。
      await page.waitForFunction(
        () => (document.querySelector("#verdict .v-head")?.innerText ?? "").trim().length > 3,
        null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        lyr: getComputedStyle(document.querySelector(".big .lyr")).transitionDuration,
        bigIn: getComputedStyle(document.querySelector(".big-in")).transitionDuration,
      }));
      // ⚠ 実測値そのもの。丸めない
      must(r.lyr === "0.28s", `年代の重なりが 0.28s でない: ${r.lyr}`);
      must(r.bigIn === "0.35s", `写真の寄せが 0.35s でない: ${r.bigIn}`);
      // ⚠ 寄せる操作も、いままでどおり滑らかであること。
      //   ⚠ これが無いと、**全部 auto にしてしまっても**上の検査は通る
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "smooth"),
        `動きを減らしていないのに滑らかでない: ${JSON.stringify([...new Set(siv)])}`);
      return `年代の重なり ${r.lyr}／写真の寄せ ${r.bigIn}／寄せる操作 ${siv.length} 件は smooth（いままでどおり）`;
    },
  },
  {
    // ⚠ /peel も見る。片方だけ入れても、もう片方は動いたまま
    name: "「動きを減らす」を入れると、深掘りの画面でも動きが残らない",
    path: `/peel?${TOYOSU}`, group: "core",
    setup: (page) => page.emulateMedia({ reducedMotion: "reduce" }),
    async check(page) {
      await page.waitForFunction(() => document.querySelector("#map canvas") !== null,
        null, { timeout: 90000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const sec = (v) => v.split(",").map((x) => x.trim())
          .map((x) => x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x));
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          for (const [k, v] of [["transition", st.transitionDuration], ["animation", st.animationDuration]])
            for (const d of sec(v || "0s"))
              if (d > 0.01) out.push(`${k} ${d}s ${el.tagName.toLowerCase()}#${el.id}`);
        }
        return { slow: [...new Set(out)].slice(0, 6), n: out.length };
      });
      must(r.n === 0, `動きが残っている ${r.n} 件: ${r.slow.join(" / ")}`);
      return `深掘りの画面も 0 件`;
    },
  },
  {
    name: "Overpass が 0 件を返したら、取れなかったと言わない", path: `/peel?${URAYASU}`,
    setup: (page) => Promise.all([
      // 取り込み済みの経路を塞ぐ。⚠ 塞がないと静的で答えてしまい、Overpass の経路を通らない
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), (r) => r.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({ elements: [] }) })),
    ]),
    async check(page) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      const bd = (await page.locator("#breakdown").textContent()).replace(/\s+/g, " ");
      const prov = (await page.locator("#prov").textContent()).replace(/\s+/g, " ");
      for (const [where, t] of [["内訳", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/OSM への問い合わせで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `「OSM に登録された建物は 0 件」／台帳「OSM への問い合わせで建物 0 件」`;
    },
  },
  {
    name: "建物を待っている間は、取得中と言う", path: `/peel?${URAYASU}`,
    setup: (page) => Promise.all([
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // 待ち始めたことを、出るべき文言そのもので待つ（一瞬の状態をスナップショットで読まない）
      await page.waitForFunction(() => /最大20秒|取れなければ/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      const bd = (await page.locator("#breakdown").textContent()).replace(/\s+/g, " ");
      const prov = (await page.locator("#prov").textContent()).replace(/\s+/g, " ");
      must(/建物を取得中/.test(bd), `待っている間に内訳が「取得中」と言っていない: ${bd.slice(0, 90)}`);
      // ⚠ 台帳の語彙は「未取得＝読めなかった／欠落＝本当に無い」。待っている間に「欠落」は嘘
      must(!/欠落/.test(prov), `待っているだけなのに台帳が「欠落」と言っている: ${prov.slice(0, 90)}`);
      must(/建物データを取得中/.test(prov), `台帳が待っていることを言っていない: ${prov.slice(0, 90)}`);
      must(!/0 件/.test(bd), `まだ取れていないのに件数を言っている: ${bd.slice(0, 90)}`);
      return `内訳「建物を取得中…」／台帳「未取得 建物データを取得中」`;
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
      await settleAfterClick(page);

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
      await settleAfterClick(page);
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
      // ⚠ **差分でも、幅の終端まで見ること。**
      //   「1970年代」は 1970〜1979 のどこか。1961–69 → 1974–78 の差分に出すと
      //   「1978年までに確実にできた」と言い切ることになる（1979年の記録かもしれない）。
      //   以前ここは `must(d, "1974–78 の差分に 1970年代の記録が出ていない")` で、
      //   **誤った配置のほうを正として固定していた**。
      const rowsAt = async (n) => {
        await photoFrames(page).nth(n).click();
        await page.waitForFunction(() => !/調べています/.test(
          document.getElementById("ev")?.textContent ?? ""), null, { timeout: 20000 });
        await settleAfterCondition(page);
        return page.$$eval(".ev-row", (els) => els.map((e) => ({
          y: e.querySelector(".ev-y")?.textContent.trim() ?? "",
          l: e.querySelector(".ev-l")?.textContent.trim() ?? "" })));
      };
      const early = await rowsAt(3);                       // 1961–69 → 1974–78
      must(!early.find((r) => r.l.includes("1970年代の駅")),
        `1970年代（1970〜1979）を、1974–78 までに確定した変化として出している: ${JSON.stringify(early)}`);
      // 幅の終端（1979）が入るコマで、初めて出る。消えるのではなく後ろへずれる
      const now = await rowsAt(4);                         // 1974–78 → 1979–83
      const d = now.find((r) => r.l.includes("1970年代の駅"));
      must(d, `1979–83 の差分に 1970年代の記録が出ていない（幅の終端で出るはず）: ${JSON.stringify(now)}`);
      must(/年代/.test(d.y), `10年の記録を「${d.y}」と書いている（精度どおりでない）`);
      return `1936年: ${rows.map((r) => r.y).join(",") || "なし"}／`
        + `1974–78: ${early.map((r) => r.y).join(",") || "なし"}／1979–83: ${now.map((r) => r.y).join(",")}`;
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
      await settleAfterCondition(page);
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
      await settleAfterCondition(page);
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
      await settleAfterClick(page);
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
      await settleAfterCondition(page);
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

      // ⚠ スライダーの端を決め打ちしない。段の数は**地点によって変わる**
      //   （広島は 1936–42 と 1984–86 が存在しないので 7 段 / max=600）。
      //   800 と書いていた頃は、この検査が「8段固定」という直したい前提そのものを
      //   固定していた。端は実装に聞く。
      const max = await page.$eval("#t", (e) => Number(e.max));
      must(max > 0, "スライダーの上限が 0（段が組まれていない）");

      // 過去は必ず言う
      const past = await at(Math.round(max * 0.75));
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
      const meiji = await at(max);
      must(meiji.year === "明治期", `右端が明治期でない: ${meiji.year}`);
      must(meiji.over === "", `建物が1棟も無いのに重ねていると言っている: ${meiji.over}`);
      return `現在=無／${past.year}=「${past.over.slice(0, 28)}」${past.yFs}:${past.oFs}px／端=${max}`;
    },
  },
  {
    // ⚠ ここが核心。/peel は固定 8 段を出していたので、広島に**存在しない**
    //   1936–42（陸軍撮影は東京23区と大阪市周辺だけ）と 1984–86 のタイルを
    //   地図レイヤとして読み、写真タイルの 404 を **202 件**送っていた（2026-08-16 実測）。
    //   トップは同じ地点で「残っているのは 5 年代」と正しく答えていた。
    name: "存在しない年代を段に出さない（広島）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page, reqs) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      must(labels[labels.length - 1] === "明治期", `右端が明治期でない: ${labels.at(-1)}`);
      for (const gone of ["1936–42", "1984–86"])
        must(!labels.includes(gone), `広島に存在しない ${gone} を段に出している: ${labels.join("/")}`);
      for (const keep of ["1945–50", "1961–69", "1974–78", "1979–83", "1987–90"])
        must(labels.includes(keep), `広島に残っている ${keep} が段から消えている: ${labels.join("/")}`);
      // ⚠ 不在の年代へ出てよいのは、**判定用の中心タイル1枚まで**。
      //   地図レイヤから引くと、また 100 枚単位で 404 を送ることになる。
      const count = (id) => reqs.filter((u) => u.includes(`/xyz/${id}/`)).length;
      for (const id of ["ort_riku10", "gazo3"])
        must(count(id) <= 1, `存在しない年代 ${id} のタイルを ${count(id)} 枚取りに行っている`);
      return `${labels.length} 段（${labels.join("/")}）／不在レイヤへの要求 `
        + `ort_riku10 ${count("ort_riku10")}・gazo3 ${count("gazo3")} 枚`;
    },
  },
  {
    // ⚠ 同じ地点に、トップと /peel が別の答えを出していた（掟: 同じ問いに答える実装を2つ持たない）。
    //   長崎 出島はいちばん差が大きく、固定 8 段のうち 5 年代が存在しない
    //   （2026-08-16 実測で 404 を 491 件送っていた）。
    name: "トップと /peel が、同じ地点で同じ年代を出す（長崎 出島）",
    path: `/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
    // ⚠ **判定に使ったタイルが、実際に何を答えたか**を控える。
    //   ⚠ 掟: 不在と読むのは 404 だけ。timeout / 通信断 / 5xx は「読めなかった」で、
    //     その年代は**段に残す**のが正しい。
    //   ⚠ 控えないと、相手先が 1 回でも 404 以外を返した回に、
    //     **正しい振る舞いのほうを落としてしまう**
    //     （実測 2026-08-19: 実描画の失敗 4 件のうち 2 件がこれだった。
    //      同じ回の数秒前に、広島では同じレイヤを 404 と読めていた＝単発の揺れ）。
    setup: (page) => {
      page.__gsi = new Map();
      const id = (u) => (/\/xyz\/([a-z0-9_]+)\//.exec(u) ?? [])[1];
      page.on("response", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, r.status()); });
      page.on("requestfailed", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, 0); });
      return Promise.resolve();
    },
    async check(page) {
      await peelReady(page);
      const past = (l) => l.filter((x) => x !== "現在" && x !== "明治期").sort();
      const peel = past(await stepLabels(page));
      // ⚠ **必ず出るはずのものは、強いまま。**ここは相手先の揺れと関係ない
      for (const keep of ["1961–69", "1974–78"])
        must(peel.includes(keep), `出島に残っている ${keep} が段から消えている: ${peel.join("/")}`);
      // ⚠ **余分な年代は、404 と答えられた年代でないこと。**
      //   404 なのに残っていたら、それは「無い」を出せていない＝こちらの不具合。
      //   404 以外（読めなかった）で残っているなら、それは**掟どおり**。
      const ID = { "1936–42": "ort_riku10", "1945–50": "ort_USA10", "1961–69": "gazo1",
                   "1974–78": "gazo1", "1979–83": "gazo2", "1984–86": "gazo3", "1987–90": "gazo4" };
      const extra = peel.filter((x) => x !== "1961–69" && x !== "1974–78");
      const wrong = extra.filter((x) => page.__gsi.get(ID[x]) === 404);
      must(wrong.length === 0,
        `404 と答えられた年代を段に残している: ${wrong.map((x) => `${x}(${ID[x]}=404)`).join("・")}`);
      const shaky = extra.map((x) => `${x}(${ID[x]}=${page.__gsi.get(ID[x]) ?? "問い合わせ無し"})`);
      // 同じ入れ物のままトップへ移る（同じ地点・同じ相手・同じキャッシュで比べる）
      await page.goto(`${BASE}/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
        { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitVerdict(page);
      const top = past(await page.$$eval("#strip .f .yr", (els) =>
        els.map((e) => e.textContent.trim())));
      // ⚠ **ここが本題。**同じ問いに 2 つの実装が別の答えを出していないこと。
      //   ⚠ 相手先が揺れていても、**トップと /peel は同じ揺れ方をするはず**（同じ実装を使う）。
      must(JSON.stringify(top) === JSON.stringify(peel),
        `トップと /peel の年代が食い違う: トップ ${top.join("/")} ／ /peel ${peel.join("/")}`);
      return `両方とも ${peel.join("/")}（${peel.length} 年代）`
        + (shaky.length ? `／⚠ 相手先が 404 を返さなかったぶんが残っている: ${shaky.join("・")}` : "");
    },
  },
  {
    // ⚠ 応答を固定して、4 通りの結末を作り分ける。実データに寄りかかると、
    //   相手先の整備状況が変わった日にこの検査が何も見なくなる。
    //     404      … その年代の写真は無い          → 段に出さない
    //     200 白紙 … タイルはあるが撮影範囲の外    → 段に出さない
    //     500      … 読めなかった                  → **段に残す**
    //     通信断   … 読めなかった                  → **段に残す**
    //   消してしまうと「取れなかった」が「無い」になる（掟: 取れなかったを「無い」と言わない）。
    name: "年代ごとの結末で、段に出すかを決める", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.route(eraRoute("gazo3"), (r) => r.fulfill({ status: 404, body: "" }));
      await page.route(eraRoute("gazo2"), (r) => r.fulfill({
        status: 200, contentType: "image/png", body: whitePng() }));
      await page.route(eraRoute("gazo1"), (r) => r.fulfill({ status: 500, body: "" }));
      await page.route(eraRoute("ort_riku10"), (r) => r.abort());
    },
    async check(page) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(!labels.includes("1984–86"), `404 の年代を段に出している: ${labels.join("/")}`);
      must(!labels.includes("1979–83"), `白紙（撮影範囲外）の年代を段に出している: ${labels.join("/")}`);
      must(labels.includes("1974–78"), `読めなかった年代（500）を段から消している: ${labels.join("/")}`);
      must(labels.includes("1936–42"), `読めなかった年代（通信断）を段から消している: ${labels.join("/")}`);
      // 残した段では「届いていない」と言い、記録の有無は断定しない
      const k = labels.indexOf("1936–42");
      await page.$eval("#t", (e, v) => { e.value = String(v);
        e.dispatchEvent(new Event("input")); }, k * 100);
      await page.waitForTimeout(1200);
      const ground = (await page.locator("#prov .prov").first().textContent()).replace(/\s+/g, " ").trim();
      must(ground.includes("未取得"), `読めなかった年代が「未取得」になっていない: ${ground.slice(0, 60)}`);
      const lie = LIES.find((w) => ground.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${ground.slice(0, 60)}`);
      return `${labels.length} 段（${labels.join("/")}）／404と白紙は消え、500と通信断は残る`;
    },
  },
  {
    // ⚠ 段を削って詰めるだけでは駄目。建物が消える年（tFromYear）・水位・建物のフェードは
    //   **時間座標**で決まっている。広島で 2 段抜いたぶんを詰めると、
    //   同じ 1945–50 の地面の上で、建物の消え方と水位が豊洲と変わってしまう。
    name: "段を間引いても、時間座標が詰まらない（広島 と 豊洲）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const at = async (v) => { await page.$eval("#t", (e, x) => { e.value = String(x);
        e.dispatchEvent(new Event("input")); }, v); await page.waitForTimeout(300);
        return tauNow(page); };
      await peelReady(page);
      const l1 = await stepLabels(page);
      const k1 = l1.indexOf("1945–50");
      must(k1 === 5, `広島の 1945–50 が 5 段目でない: ${k1} 段目（${l1.join("/")}）`);
      const a = await at(k1 * 100);
      must(a.tau === 6, `広島の 1945–50 で時間座標が 6 でない: ${a.tau}（段は詰まっている）`);
      // 豊洲では同じ年代が 6 段目。**段は違うが時間は同じ**でなければならない
      await page.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await peelReady(page);
      const l2 = await stepLabels(page);
      const k2 = l2.indexOf("1945–50");
      must(k2 === 6, `豊洲の 1945–50 が 6 段目でない: ${k2} 段目（${l2.join("/")}）`);
      const b = await at(k2 * 100);
      must(b.tau === a.tau, `同じ 1945–50 なのに時間座標が違う: 広島 ${a.tau} / 豊洲 ${b.tau}`);
      must(Math.abs(b.water - a.water) < 1e-9,
        `同じ 1945–50 なのに水位が違う: 広島 ${a.water} / 豊洲 ${b.water}`);
      return `1945–50 は 広島 ${k1} 段目 / 豊洲 ${k2} 段目、時間座標はどちらも ${a.tau}`
        + `（水位 ${a.water.toFixed(3)}m で一致）`;
    },
  },
  {
    // ⚠ 端の文字は見た目の中心が range の端からずれる。
    //   実際の座標を押し、右端の段まで値が届くことを確認する。
    // ⚠ **PC 幅で見る**（2026-08-18 に移した）。狭い幅は横ドラムロールに替えたので、
    //   ここが守っている「端の文字の見た目の中心が range の端からずれる」は
    //   **横棒が残る PC だけの問題**になった。
    //   ⚠ 狭い幅の同じ主張（端の段を選べる）は
    //     「狭い幅の年代は、指で回して選べて、いまどこかが分かる」が見ている。
    name: "年代帯の端の文字を押すと最後の段になる（PC の横棒）", path: `/peel?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    async check(page) {
      await peelReady(page);
      // ⚠ 「目盛りが2つ以上ある」では足りない。仮の段でも満たすので、
      //   直後に段が組み直されると、掴んだラベルが外れて boundingBox() が null になる
      //   （実測 2026-08-17: ここが「年代帯の右端ラベルが無い」で落ちていた）。
      await timelineSettled(page);
      const max = await page.$eval("#t", (e) => Number(e.max));
      await page.$eval("#t", (e) => { e.value="0"; e.dispatchEvent(new Event("input")); });
      const target = await page.locator("#track .lab.at-end").boundingBox();
      must(target, "年代帯の右端ラベルが無い");
      const cx=Math.round(target.x+target.width/2), cy=Math.round(target.y+target.height/2);
      const before = await page.$eval("#t", (e) => Number(e.value));
      await page.mouse.click(cx,cy);
      await page.waitForTimeout(300);
      const after = await page.$eval("#t", (e) => Number(e.value));
      must(after===max, `右端「明治期」を押しても最大値にならない: ${before} → ${after}/${max}`);
      // ノブ中心の押下で、現在値が意図せず変わらないこと。
      const mid=Math.round(max/2);
      await page.$eval("#t", (e, v) => { e.value=String(v); e.dispatchEvent(new Event("input")); }, mid);
      const knob = await page.locator("#track .knob").boundingBox();
      must(knob, "ノブが無い");
      const kx=Math.round(knob.x+knob.width/2), ky=Math.round(knob.y+knob.height/2);
      await page.mouse.click(kx,ky);
      const kept = await page.$eval("#t", (e) => Number(e.value));
      must(kept===mid, `ノブ中心の押下で値が変わった: ${kept}`);
      return `右端ラベル ${cx},${cy}: ${before}→${after}／ノブ中心の値は保持`;
    },
  },
  {
    // ⚠ 年代帯の操作は <input type=range> **一本**で受けている。
    //   ラベルだけを pointer-events:auto にして pointerdown を止めると、
    //   range がドラッグを始めないので、文字の上から引いても値が段に貼り付いたまま動かない。
    //   実測（2026-08-16 / 375×667・タッチ / 豊洲 max=800 / 右へ 20px ずつ）:
    //     文字の上   200 → 200 → 200 → 200 → 200 → 200 → 200  ← 動かない
    //     ノブの上     0 →  37 →  98 → 160 → 222 → 283 → 345
    //     レールの上 188 → 249 → 311 → 372 → 434 → 495 → 557
    //   「押せば段へ寄る」と「引けば連続して動く」は**同じ的の上で両方**成り立つ必要がある。
    // ⚠ **PC 幅で見る**（2026-08-18 に移した）。狭い幅は横ドラムロールに替えたので、
    //   「同じ的の上で、押す（段へ寄る）と引く（連続して動く）が両立する」は
    //   **横棒が残る PC だけの主張**になった。
    name: "年代帯の文字は、押せば段へ寄り、引けば連続して動く（PC の横棒）", path: `/peel?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    async check(page) {
      await peelReady(page);
      // 同じ穴を残さない。仮の段の上で座標を測ると、組み直しで的がずれる
      await timelineSettled(page);
      // 文字は1つおきに間引かれているので、**文字のあるラベル**だけを見る
      const labs = await page.$$eval("#track .lab", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { i: Number(e.dataset.i), text: e.textContent.trim(),
          cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      }).filter((l) => l.text));
      const val = () => page.$eval("#t", (e) => Number(e.value));
      const reset = () => page.$eval("#t", (e) => { e.value = "0"; e.dispatchEvent(new Event("input")); });
      // 端は既存ケースが見ている。ここは**中間**の文字で見る
      const mid = labs.find((l) => l.i > 0 && l.i < Math.max(...labs.map((x) => x.i)));
      must(mid, `中間の年代ラベルが無い: ${labs.map((l) => l.text).join("・")}`);

      // ---- 押す（段へ寄る）----
      await reset();
      await page.mouse.click(mid.cx, mid.cy);
      await page.waitForTimeout(250);
      const tapped = await val();
      must(tapped === mid.i * 100,
        `文字「${mid.text}」を押しても段 ${mid.i} にならない: ${tapped}（期待 ${mid.i * 100}）`);

      // ---- 引く（連続して動く）----
      await reset();
      await page.mouse.move(mid.cx, mid.cy);
      await page.mouse.down();
      const trace = [await val()];
      for (let dx = 20; dx <= 120; dx += 20) {
        await page.mouse.move(mid.cx + dx, mid.cy);
        await page.waitForTimeout(60);
        trace.push(await val());
      }
      await page.mouse.up();
      await page.waitForTimeout(150);
      const ended = await val();
      // 段に貼り付いていないこと。**途中の値**が増えていく（段の値だけを飛ぶのではない）
      const steps = new Set(trace).size;
      must(steps >= 4, `文字の上から引いても動かない: ${trace.join(" → ")}`);
      for (let i = 1; i < trace.length; i++)
        must(trace[i] > trace[i - 1], `右へ引いたのに値が戻る: ${trace.join(" → ")}`);
      // 離したあとに段へ吸い戻されないこと（引いた結果を尊重する）
      must(ended === trace[trace.length - 1],
        `引き終えてから段へ吸い戻された: ${trace[trace.length - 1]} → ${ended}`);
      return `文字「${mid.text}」押下 → ${tapped}／引くと ${trace[0]} → ${ended}（${steps} 段階）`;
    },
  },
  {
    // ⚠ 年代を動かせることが、航空写真の上で見えなければ操作は存在しないのと同じ。
    //   文字・2px の線・14px のノブを背景へ直接置いていたときは、明るい地面でも
    //   暗い水面でも読みづらかった。板・見出し・指で分かるノブを実寸で見る。
    // ⚠ 畳んだあとも入口と選択中の年代は残す。閉じた結果、開き方まで消してはいけない。
    // ⚠ **PC 幅で見る**（2026-08-18 に移した）。レール・ノブの実寸は横棒の話で、
    //   狭い幅は横ドラムロールに替わった。
    //   ⚠ **「畳める」はスマホでも要る。**そちらは
    //     「狭い幅の年代は、指で回して選べて、いまどこかが分かる」に足した。
    name: "年代を動かす操作パネルが、見えて畳める（PC の横棒）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 1280, height: 800 },
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#track .tick").length === 7,
        null, { timeout: 60000 });
      const opened = await page.evaluate(() => {
        const box = (e) => { const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, height: r.height }; };
        const panel = document.getElementById("timePanel");
        const eraPanel = document.getElementById("era");
        return { panel: box(panel), readout: box(document.querySelector("#era .era-readout")),
          panelBg: getComputedStyle(panel).backgroundColor,
          eraBg: getComputedStyle(eraPanel).backgroundColor,
          play: box(document.getElementById("play")),
          rail: box(document.querySelector("#track .rail")),
          knob: box(document.querySelector("#track .knob")),
          ticks: document.querySelectorAll("#track .tick").length,
          selected: document.querySelectorAll("#track .tick.selected").length,
          expanded: document.getElementById("timeToggle").getAttribute("aria-expanded"),
          viewport: document.documentElement.clientWidth };
      });
      must(opened.panel.left >= 0 && opened.panel.right <= opened.viewport,
        `操作パネルが画面からはみ出す: ${opened.panel.left}〜${opened.panel.right}px`);
      must(opened.panel.height >= 100, `開いた操作パネルが小さすぎる: ${opened.panel.height}px`);
      must(opened.panelBg !== "rgba(0, 0, 0, 0)" && opened.eraBg !== "rgba(0, 0, 0, 0)",
        "年代または操作パネルに背景板が無い");
      must(opened.rail.height >= 4, `レールが細い: ${opened.rail.height}px`);
      must(opened.knob.width >= 22 && opened.knob.height >= 22,
        `ノブが小さい: ${opened.knob.width}×${opened.knob.height}px`);
      must(opened.play.right + 2 <= opened.knob.left,
        `再生ボタンと左端のノブが重なる: ${opened.play.right} / ${opened.knob.left}px`);
      must(opened.ticks === 7, `広島の7層と目盛りが一致しない: ${opened.ticks}本`);
      must(opened.selected === 1, `選択中の区切りが1本でない: ${opened.selected}本`);
      must(opened.expanded === "true", "初期状態で操作パネルが開いていない");

      // 地点ごとに組んだ steps の3段目を選ぶ。閉じた見出しも、その層のラベルを名乗ること。
      await page.$eval("#t", (e) => { e.value = "200"; e.dispatchEvent(new Event("input")); });
      await page.click("#timeToggle");
      const closed = await page.evaluate(() => ({
        height: document.getElementById("timePanel").getBoundingClientRect().height,
        hidden: document.getElementById("timePanelBody").hidden,
        expanded: document.getElementById("timeToggle").getAttribute("aria-expanded"),
        action: document.getElementById("timeToggleText").textContent.trim(),
        summary: document.getElementById("timeSummary").textContent.trim(),
      }));
      must(closed.hidden && closed.expanded === "false" && closed.action === "開く",
        `畳めていない: hidden=${closed.hidden} expanded=${closed.expanded} action=${closed.action}`);
      must(closed.height >= 44 && closed.height <= 52,
        `畳んだ入口が指で押せる高さでない: ${closed.height}px`);
      must(closed.summary === "1979–83",
        `畳むと選択中の年代層が分からない: 「${closed.summary}」`);
      await page.click("#timeToggle");
      must(await page.locator("#timePanelBody").isVisible(), "操作パネルをもう一度開けない");
      return `広島 ${opened.ticks}層／レール ${opened.rail.height}px／ノブ ${opened.knob.width}px`
        + `／開 ${opened.panel.height}px → 閉 ${closed.height}px（${closed.summary}）`;
    },
  },
  {
    // ⚠ **スマホの初期画面で、土地の答えと分母が読めること。**
    //   実測（2026-08-16 / 375×667・タッチ）: 答えも分母も計算済みで座標も持っていたのに、
    //   祖先の #panel.hide が opacity:0 のため**実効 opacity が 0**。
    //   初期画面から読めるのは「建物が消える年代は演出です」という但し書きだけで、
    //   **答えより先に注意書きが読める**状態だった。
    //   ⚠ 数字だけでは足りない。**何の割合か**と**分母**が同じ画面にあることまで見る
    //     （掟: 数字は主張範囲の分母で書く）。
    name: "スマホの初期画面で、土地の答えと分母が読める",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **内陸を入れておく。** 下の hasCategory（区分名が主見出し）の分岐は
      //   前から書いてあったが、ここが埋立・デルタの3地点しか回していなかったので
      //   **一度も通っていなかった**（＝分岐が検査されていなかった）。
      //   内陸では、足元の最多区分が水域ではないので区分名が主見出しになる。
      //   実測 2026-08-16（1280×800／375×667 とも同じ）:
      //     渋谷 田（水域だった建物 1.5%）／上野 田（1.3%）／西新宿 田（1.3%）
      const places = [
        ["豊洲", `/peel?${TOYOSU}`, /^99\.\d%$/, "543 / 543件の足元を判定"],
        ["広島", "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6", /^\d\.\d%$/, "3260 / 3552件の足元を判定"],
        ["長崎 出島", "/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6",
          /^\d\.\d%$/, "3895 / 3895件の足元を判定"],
        ["お台場", "/peel?ll=35.63000,139.77600&q=%E3%81%8A%E5%8F%B0%E5%A0%B4",
          /^97\.\d%$/, "103 / 103件の足元を判定"],
        ["渋谷", "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7", null, "4785 / 5017件の足元を判定"],
        ["上野", "/peel?ll=35.71480,139.77450&q=%E4%B8%8A%E9%87%8E", null, "2731 / 5673件の足元を判定"],
        ["西新宿", "/peel?ll=35.69050,139.69290&q=%E8%A5%BF%E6%96%B0%E5%AE%BF", null, "3402 / 4258件の足元を判定"],
      ];
      const out = [];
      for (const [name, path, pctRe, den] of places) {
        if (page.url() !== BASE + path)
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(page);
        // ⚠ 「%」を待たない。⚠ **割合が出ない土地がある**（札幌・那覇）。
        //   ⚠ 層になって、答えの 1 行目が第1層（区分名）になったので、% は後ろに来る。
        await page.waitForFunction(() => /件の足元を判定|%/.test(
          document.getElementById("land")?.textContent ?? ""),
          null, { timeout: 60000 });
        // ⚠ パネルは閉じたまま（掟の外へ出ない: スマホで既定表示にはしない）
        must(await page.locator("#panel.hide").count() === 1, `${name}: パネルが閉じて始まっていない`);
        const o = await effOpacity(page, "#land .land-g1, #land .land-alt, #land .land-num");
        const od = await effOpacity(page, "#land .land-den");
        must(o > 0, `${name}: 答えの実効 opacity が ${o}（読めない）`);
        must(od > 0, `${name}: 分母の実効 opacity が ${od}（読めない）`);
        const r = await page.evaluate(() => ({
          num: document.querySelector("#land .land-num")?.textContent.trim() ?? "",
          what: document.querySelector("#land .land-what")?.textContent.trim() ?? "",
          den: document.querySelector("#land .land-den")?.textContent.trim() ?? "",
          // ⚠ 答えの主役は**いちばん確実な層**（層は確実性の高い順に並ぶので、最後）。
          //   ⚠ 最初を取ると第1層（地形分類）を拾い、分岐を間違える（実測 2026-08-19）。
          hero: (() => { const ls = [...document.querySelectorAll("#landAll .land-layer")];
            const L = ls[ls.length - 1];
            return L?.querySelector(".land-num,.land-alt,.land-g1 b")?.textContent.trim() ?? ""; })(),
          heroCap: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " ").trim(),
          landAll: (document.getElementById("land")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        }));
        const hasCategory = !!r.hero && !/[\d.]+/.test(r.hero);
        if(hasCategory){
          must(r.what.includes("建物の足元") && r.what.includes("最多"),
            `${name}: 最多区分の説明が書かれていない: 「${r.what}」`);
          must(r.heroCap.includes("水域だった建物"), `${name}: 水域割合の補足が無い: 「${r.heroCap}」`);
          // ⚠ **小さい割合を消さない。** 主見出しを区分名にしたぶん、割合は
          //   意味と分母を伴って残っていること（隠したり別の数字へ置き換えたりしない）。
          const pct = (t) => t.match(/水域だった建物[：:]\s*([\d.]+)%/)?.[1] ?? null;
          const [pc, hud] = [pct(r.heroCap), pct(r.landAll)];
          must(pc !== null, `${name}: パネルに水域割合の数字が無い: 「${r.heroCap.slice(0, 80)}」`);
          must(hud !== null, `${name}: HUD に水域割合の数字が無い: 「${r.landAll.slice(0, 80)}」`);
          // ⚠ 同じ画面の中で食い違わないこと（計算元は landVerdict の1か所）
          must(pc === hud, `${name}: HUD とパネルで水域割合が違う: HUD「${hud}%」/ パネル「${pc}%」`);
            // ⚠ 主見出しの区分名も、HUD とパネルで同じであること。
            //   ⚠ **HUD は層になったので、先頭は第1層**（ここは、どういう土地？）。
            //     主見出しは HUD の**どこか**に、同じ語で在ればよい。
            //   ⚠ 見ている主張は変えていない: **同じ画面で 2 つの答えを出さないこと**。
            must(r.landAll.includes(r.hero),
              `${name}: HUD とパネルで主見出しが違う: HUD「${r.landAll.slice(0, 40)}」/ パネル「${r.hero}」`);
        } else {
          // ⚠ pctRe が無い地点（区分名が主見出しのはず）でここへ来たら、
          //   規則が変わって低い割合が主見出しに戻ったということ。落とす。
          must(pctRe && pctRe.test(r.num),
            `${name}: 割合が主見出しになっている（区分名のはず）／読めない: 「${r.num}」`);
          must(r.what.includes("建物が、明治期には") && r.what.includes("水の上"),
            `${name}: 何の割合かが書かれていない: 「${r.what}」`);
        }
        // ⚠ **分母がその行に在ること。**完全一致は求めない。
        //   ⚠ 区分名が主役の土地では、同じ行に「水域だった建物：X%」も入る
        //     （head が区分名なので、割合の置き場がここしかない）。
        //   ⚠ 見ている主張は変えていない: **数字を出すなら分母を同じ板に出す**。
        must(r.den.includes(den), `${name}: 分母が読めない: 「${r.den}」（要る: ${den}）`);
        // ⚠ **同じ画面の中で結果が食い違わないこと。** 計算元は landVerdict の1か所
        if(!hasCategory) must(r.hero === r.num, `${name}: HUD とパネルで割合が違う: HUD「${r.num}」/ パネル「${r.hero}」`);
        const [a, b] = r.den.match(/(\d+) \/ (\d+)/).slice(1);
          // ⚠ 層になって、HUD もパネルも**同じ書き方**になった（「543 / 543件の足元を判定」）。
          //   ⚠ 見ている主張は変えていない: **同じ画面の中で分母が食い違わないこと**。
          must(r.heroCap.includes(`${a} / ${b} 件`) || r.heroCap.includes(`${b}件すべて`)
            || r.heroCap.includes(`${a} / ${b}件の足元を判定`),
          `${name}: HUD とパネルで分母が違う: HUD「${r.den}」/ パネル「${r.heroCap.slice(0, 60)}」`);
        out.push(`${name} ${hasCategory ? r.hero : r.num}（${r.den}）`);
      }
      // ⚠ 3D と操作を覆わない。答えの板が、上の導線・年代・操作パネルと重ならないこと
      const geo = await page.evaluate(() => {
        const box = (s) => { const e = document.querySelector(s); if (!e) return null;
          const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
        return { land: box("#land"), chrome: box("#chrome"), era: box("#era"),
          time: box("#timePanel"), zoom: box(".maplibregl-ctrl-top-right"),
          vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
      });
      const hits = (a, b) => a && b && a.left < b.right && b.left < a.right
        && a.top < b.bottom && b.top < a.bottom;
      for (const [k, other] of [["戻る・☰", geo.chrome], ["年代表示", geo.era],
        ["操作パネル", geo.time], ["拡大縮小", geo.zoom]])
        must(!hits(geo.land, other), `答えの板が${k}と重なっている`);
      must(geo.land.top >= 0 && geo.land.bottom <= geo.vh,
        `答えの板が初期ビューポートの外にある: ${Math.round(geo.land.top)}〜${Math.round(geo.land.bottom)}px`);
      // ⚠ 320px でも横にあふれない
      await page.setViewportSize({ width: 320, height: 667 });
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        land: document.getElementById("land").getBoundingClientRect() }));
      must(w.sw <= w.cw, `320px で横にあふれる: scrollWidth=${w.sw} / ${w.cw}`);
      must(w.land.left >= 0 && w.land.right <= w.cw,
        `320px で答えの板がはみ出す: ${Math.round(w.land.left)}〜${Math.round(w.land.right)}px`);
      return `${out.join(" ／ ")}／320px あふれなし`;
    },
  },
  {
    // ⚠ 判定できない土地で**割合を作らない**（掟: 取れなかったを「無い」と言わない）。
    //   札幌は明治期の低湿地データが整備対象外。建物は出ているので、
    //   「建物ごとには出せません」と、その理由と、建物の件数を出す。0% は出さない。
    name: "判定できない土地では、初期画面に割合を出さない（札幌）",
    path: "/peel?ll=43.06800,141.35070&q=%E6%9C%AD%E5%B9%8C%E9%A7%85",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      // ⚠ 建物の集計が届くまで待つ。⚠ この検査は最初 peelReady だけで読んでいて落ちた。
      //   札幌は水域が無いので #status が先に「低湿地データがありません」を出し、
      //   **建物を数え終える前に**条件を満たしてしまう。実装ではなく検査が早すぎた。
      // ⚠ **答えの板が描かれてから読む。**#status が先に埋まるので、
      //   ⚠ これだけだと板が空のまま opacity を測って null になる（実測 2026-08-19）。
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText)
        && document.querySelector("#land .land-g1, #land .land-alt") !== null,
        null, { timeout: 60000 });
      const t = (await page.locator("#land").textContent()).replace(/\s+/g, " ").trim();
      must(!/\d+\.\d+\s*%/.test(t), `判定できないのに割合を出している: ${t.slice(0, 60)}`);
      must(t.includes("整備対象外"), `理由（整備対象外）が書かれていない: ${t.slice(0, 60)}`);
      must(/建物 \d+ 件/.test(t), `建物の件数が書かれていない: ${t.slice(0, 60)}`);
      const o = await effOpacity(page, "#land .land-g1, #land .land-alt");
      must(o > 0, `答えの実効 opacity が ${o}（読めない）`);
      // ⚠ 地形分類は**別経路で遅れて届く**。届く前は「判定できません」、届いたら
      //   「建物ごとには出せません」＋その土地の区分に変わる。
      //   ⚠ この検査は最初「建物ごとには出せません」を最初から要求していて落ちた。
      //     実装ではなく検査のほうが早すぎた。届く前の「判定できません」も
      //     要件（数値を作らない・何が分からないかを書く）は満たしている。
      //   ⚠ 地形分類は止まりうる依存なので、**届くことを前提にしない**（届いたときだけ見る）。
        // ⚠ 層になって、第3層の欠落は「1 件ずつの足元は判定できていません」になった。
        //   ⚠ 見ている主張は変えていない: **何が出せないのかが書かれていること**。
        must(/建物ごとには出せません|判定できません|判定できていません/.test(t),
          `何が出せないのかが書かれていない: ${t.slice(0, 60)}`);
      const gotLf = await page.waitForFunction(
        () => (document.getElementById("land")?.textContent ?? "").includes("扇状地"),
        null, { timeout: 20000 }).then(() => true).catch(() => false);
      const t2 = (await page.locator("#land").textContent()).replace(/\s+/g, " ").trim();
        // ⚠ 地形分類が届いたら、**全部が出せないわけではない**と分かること。
        //   ⚠ 層になって、その言い方が変わった（「建物ごとには出せません」→
        //     第1層が立ち、出せないのは建物の層だけ、と位置で示す）。
        //   ⚠ 見ている主張は変えていない: **範囲を限ること**（何もかも駄目ではない）。
        if (gotLf) {
          must(/建物ごとには出せません/.test(t2) || /どういう土地/.test(t2),
            `地形分類が届いたのに、答えられる範囲を示していない: ${t2.slice(0, 60)}`);
          must(!/^判定できません/.test(t2),
            `地形分類が届いたのに「判定できません」で始まっている: ${t2.slice(0, 60)}`);
        }
      return `${t2.slice(0, 56)}${gotLf ? "" : "（⚠ 地形分類は届かなかった）"}`;
    },
  },
  {
    // ⚠ 取得に失敗したときは「整備対象外」と言わない（掟: 取れなかったを「無い」と言わない）。
    //   HUD にも同じ規律を通す。ここを外すと、通信が落ちただけの豊洲に
    //   「整備対象外」と、しかも常時見える場所で書くことになる。
    name: "通信が落ちたとき、初期画面で整備対象外と言わない",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.getElementById("land")?.textContent ?? "").length > 0,
        null, { timeout: 60000 });
      const t = (await page.locator("#land").textContent()).replace(/\s+/g, " ").trim();
      const lie = LIES.find((w) => t.includes(w));
      must(!lie, `通信断なのに「${lie}」と断定している: ${t.slice(0, 60)}`);
      // 取り込み済みの地点は、実行時のGSI通信が落ちても静的な判定値を表示できる。
      // 未取り込みの地点だけ、従来どおり「読み込めない」状態を確認する。
      const hasStatic = /\d+\.\d+\s*%/.test(t);
      if (!hasStatic) must(/読み込め/.test(t), `読み込めなかったことが書かれていない: ${t.slice(0, 60)}`);
      must(await effOpacity(page, "#land") > 0, "答えの板が読めない");
      return t.slice(0, 60);
    },
  },
  {
    // ⚠ PC では情報パネルが開いて始まる。同じ答えを同じ画面で2度言わない
    //   （☰ ボタンと同じ手）。パネルを閉じたら、HUD 側が答えを引き受ける。
    name: "PC ではパネルが答えを持ち、閉じると HUD が引き継ぐ", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.getElementById("land")?.textContent ?? "").includes("%"),
        null, { timeout: 60000 });
      must(await page.locator("#panel.hide").count() === 0, "PC でパネルが閉じて始まっている");
      const heroOpen = await effOpacity(page, "#landAll");
      must(heroOpen > 0, `パネルの答えが読めない: 実効 opacity ${heroOpen}`);
      must(await effOpacity(page, "#land") === 0, "パネルを開いているのに HUD にも同じ答えが出ている");
      // 閉じたら HUD が引き継ぐ
      await page.click("#closePanel");
      await page.waitForTimeout(400);
      const after = await effOpacity(page, "#land .land-num");
      must(after > 0, `パネルを閉じても HUD に答えが出ない: 実効 opacity ${after}`);
      const num = (await page.locator("#land .land-num").textContent()).trim();
      return `パネル 開=答えはパネルだけ／閉=HUD が ${num}`;
    },
  },
  {
    // ⚠ **両端の文字が、段の数で消えないこと。**
    //   中間のラベルは狭い画面で密集するので1つおきに間引いているが、
    //   段が固定 9 段だった頃は両端が k=0 と k=8 でどちらも偶数だったため、
    //   `k%2===0` の間引きで**たまたま**両端が残っていた。段数が地点ごとに変わると、
    //   長崎 出島（4 段）は終端が k=3 になり「明治期」が空欄になる（レビューで指摘）。
    //   ⚠ 大きい年代表示（#era .y）を読む検査では捕まらない。年代の切り替え自体は
    //     正しく動いているため。**目盛りの文字そのもの**を読むこと。
    name: "つまみの両端が、何の年代かを必ず名乗る",
    path: `/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // 段の数が違う3地点で見る（出島 4 段・広島 7 段・豊洲 9 段）。
      // ⚠ 偶数段・奇数段の両方を通すこと。片方だけだと、また偶然で通る
      const places = [
        ["長崎 出島", "/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6", 4],
        ["広島", "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6", 7],
        ["豊洲", `/peel?${TOYOSU}`, 9],
      ];
      const out = [];
      for (const [name, path, want] of places) {
        if (page.url() !== BASE + path)
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(page);
        await page.waitForFunction((n) => document.querySelectorAll("#track .tick").length === n,
          want, { timeout: 60000 });
        const geo = await page.evaluate(() => {
          const box = (e) => { const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right, text: e.textContent.trim() }; };
          const labs = [...document.querySelectorAll("#track .lab")].map(box);
          return { start: document.querySelector("#track .lab.at-start")?.textContent.trim() ?? "",
            end: document.querySelector("#track .lab.at-end")?.textContent.trim() ?? "",
            labs, track: box(document.getElementById("track")) };
        });
        must(geo.start === "現在", `${name}: 開始端が現在でない: 「${geo.start}」`);
        must(geo.end === "明治期", `${name}: 終了端が明治期でない: 「${geo.end}」`);
        // ⚠ 端の文字が枠からはみ出さないこと（横スクロールが出る。一度踏んでいる）
        const over = geo.labs.filter((l) => l.text
          && (l.left < geo.track.left - 0.5 || l.right > geo.track.right + 0.5));
        must(!over.length, `${name}: 目盛りの文字が枠の外に出ている: `
          + over.map((l) => `${l.text}(${l.left.toFixed(0)}〜${l.right.toFixed(0)}px)`).join("、"));
        // ⚠ 間引いたうえで、なお隣どうしが重ならないこと（375px）
        const shown = geo.labs.filter((l) => l.text).sort((a, b) => a.left - b.left);
        const hit = shown.filter((l, i) => i > 0 && l.left < shown[i - 1].right - 0.5);
        must(!hit.length, `${name}: 目盛りの文字が重なっている: ${hit.map((l) => l.text).join("、")}`);
        out.push(`${name} ${want}段「${shown.map((l) => l.text).join("/")}」`);
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ 場所を変えたら段も変わる。組み直しを忘れると、前の場所の段のまま
    //   別の土地のタイルを引く（＝また存在しない年代を取りに行く）。
    // ⚠ 2026-08-18 まで、この検査は /peel の中のピンを押して場所を変えていた。
    //   ⚠ **その口は外した**（場所を決めるのはトップ）。守りたい主張
    //   「段は地点ごとに組み直す」は変わらないので、**地点ごとに開いて**確かめる。
    //   ⚠ 画面の中で場所が変わる経路は、もう無い（loadArea を呼ぶのは初回と再試行だけ）。
    name: "年代の段は、地点ごとに組み直す",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const shape = () => page.evaluate(() => ({
        max: Number(document.getElementById("t").max),
        ticks: document.querySelectorAll("#track .tick").length }));
      const wait = (n) => page.waitForFunction(
        (want) => document.querySelectorAll("#track .tick").length === want, n, { timeout: 60000 });
      const SPOTS = [
        ["広島", "ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6", 7, 600],
        ["豊洲", TOYOSU, 9, 800],
        ["長崎 出島", "ll=32.74400,129.87300&q=%E5%87%BA%E5%B3%B6", 4, 300],
      ];
      const out = [];
      for (const [name, qs, ticks, max] of SPOTS) {
        await page.goto(`${BASE}/peel?${qs}`, { waitUntil: "domcontentloaded" });
        await peelReady(page);
        await wait(ticks);
        const sh = await shape();
        must(sh.max === max, `${name}のスライダーの端が ${max} でない: ${sh.max}`);
        out.push(`${name} ${sh.ticks}段/${sh.max}`);
      }
      // ⚠ 全部同じ形なら、この検査は何も見ていない
      must(new Set(out).size === SPOTS.length, `地点ごとに組み直していない: ${out.join(" / ")}`);
      return out.join(" → ");
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
      await settleAfterCondition(page);
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
      await settleAfterCondition(page);
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
      // ⚠ 押した先で画面が寄る。⚠ **寄り終わるまで待つ**（時間で待たない）
      await page.waitForFunction(() =>
        document.getElementById("big")?.classList.contains("zoom"), null, { timeout: 30000 });
      await settleAfterScroll(page);
      const after = await seen();
      must(after.zoom, "押しても寄っていない");
      // ⚠ ここが本体。寄っただけで見えていなければ、押しても何も起きないのと同じ。
      //   ⚠ 実装が「半分見えていれば動かさない」、検査が「8割見えていること」で食い違っていた。
      //     写真の下から操作を1つ外して版面が 20px 縮んだだけで表に出た（広島 65%・2026-08-16）。
      //     → 要求（8割）はここに置いたまま、画面側の約束が下がっていないことも見る。
      //       定数を読むだけにすると、実装を下げたときに検査も一緒に下がって気づけない。
      const promised = await page.evaluate(() => SEEN_ENOUGH);
      must(promised >= 0.8, `画面側が約束している割合が下がっている（SEEN_ENOUGH=${promised}）`);
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
        const c = document.querySelector(".strip-title").getBoundingClientRect();
        return { px: Math.round(Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top))),
          yr: document.querySelector(".strip-title").innerText.replace(/\s+/g, " ").trim() };
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
      await settleAfterClick(page);
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
    // ⚠ 目盛りとノブは input を覆わず、ラベルは押した段へ明示選択する。
    //   以前は飾りが input を覆って年代帯の操作を奪っていたため、役割を分けて検査する。
    // ⚠ **PC 幅で見る**（2026-08-18 に移した）。「飾りが input を覆って操作を奪わない」は
    //   **横棒が残る PC だけの主張**になった。狭い幅は横ドラムロールに替わり、
    //   同じ主張（段が押せる・回せる）は
    //   「狭い幅の年代は、指で回して選べて、いまどこかが分かる」が見ている。
    name: "年代の帯は、目盛りも文字もノブも押せる（PC の横棒）", path: `/peel?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const geo = await page.evaluate(() => {
        const t = document.getElementById("track").getBoundingClientRect();
        const mid = (e) => { const r = e.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
        return { x: Math.round(t.left), w: Math.round(t.width),
          // ⚠ **名前の無いラベルは的にしない。**間引いた段のラベルは中身が空で、
          //   `#track .lab:empty{display:none}` で消してある（下線だけが残るのを避けるため）。
          //   消えた要素の矩形は 0,0 を返すので、そのまま押すと画面の左上を押すことになる
          //   （2026-08-18 に実際に踏んだ。「目盛り(0)」が 4 つ出た）。
          //   ⚠ **同じ位置の目盛り（.tick）は下で押している**ので、抜けは出ない。
          lab: [...document.querySelectorAll("#track .lab")]
            .filter((e) => e.textContent.trim())
            .map((e) => ({ ...mid(e), t: e.textContent.trim() })),
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
      await settleAfterCondition(page);
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
      await settleAfterClick(page);
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
      must(/足元は、明治期には水でした|明治期の土地|明治期の低湿地データ/.test(r.text),
        `足元の判定が出ていない: ${r.text.slice(0, 80)}`);
      // ⚠ 高さと建設年は、必ず出所つきで。「実測」と書ける建物は 7.9% しかない
      must(/既定値|階数|height タグ/.test(r.text), `高さの出所が出ていない: ${r.text.slice(0, 80)}`);
      must(/建設年/.test(r.text), `建設年について何も言っていない: ${r.text.slice(0, 80)}`);
      // ⚠ 技術的なRGBAは通常カードに出さない。土地の状態を主情報として出す。
      must(!/rgba=/.test(r.text), `技術的なRGBAが通常カードに出ている: ${r.text.slice(0, 80)}`);
      for (const w of ["この年に建った", "当時", "再現", "でしょう"])
        must(!r.text.includes(w), `断定・作文が混ざっている: 「${w}」`);
      // 読み上げは指で押せる大きさ
      must(r.sayH === 0 || r.sayH >= 44, `読み上げが指で押すには小さい: ${r.sayH}px`);
      return `案内「${tip.text}」→ 押すと消える／押した場所に出る（🔊 ${r.sayH}px）`
        + `／${r.text.slice(0, 40)}`;
    },
  },
  {
    // ⚠ 建物の但し書きは、**初期状態で見える場所**に出ていること。
    //   以前は左パネルの中にしかなく、スマホは panelOpen=!isNarrow で閉じて始まるので
    //   初期状態で1文字も見えなかった。利用者役のエージェント3体のうち2体が
    //   「高さと建設年は実データだ」と思ったまま操作した（2026-08-14）。
    //   初めから隠すのは不可。ただし読んだ利用者が地図を広くするため、自分で畳める。
    //   ⚠ スマホ幅で見ること。PC ではパネルが開くので、この壊れ方は再現しない。
    name: "建物の但し書きが、スマホで最初から見えて、あとで畳める", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const e = document.getElementById("est"), rc = e?.getBoundingClientRect();
        return { text: (e?.textContent ?? "").replace(/\s+/g, " ").trim(),
          panelHidden: document.getElementById("panel")?.classList.contains("hide"),
          eraExpanded: document.getElementById("eraToggle")?.getAttribute("aria-expanded"),
          shown: !!rc && rc.height > 0 && rc.top >= 0 && rc.bottom <= innerHeight
            && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none" };
      });
      // 前提が崩れていたら、この検査は何も確かめていない
      must(r.panelHidden, "スマホなのにパネルが開いている（この検査の前提が消えた）");
      must(r.eraExpanded === "true", "但し書きが初期状態から畳まれている");
      must(r.shown, `但し書きが折り返しの中に見えていない: ${JSON.stringify(r)}`);
      // ⚠ 「出ている」だけでは足りない。**読めること**。板なしで出したときは
      //   10.5px・薄い色・影だけで航空写真の上に置いており、読めるのは数字だけだった。
      //   年の見出しが 60px なのに但し書きが 10.5px で 5.7倍（UI/UX の実測）。
      const look = await page.evaluate(() => {
        const e = document.getElementById("est"), c = getComputedStyle(e);
        const y = document.querySelector("#era .y");
        const a = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
        // ⚠ **敷きは、祖先を辿って探す。** 以前ここは `#era` の背景を決め打ちで見ていた。
        //   いまは #est が #era の中にあるので偶然一致していたが、
        //   ⚠ **#est を外へ出した瞬間、航空写真の上に敷き無しで浮いていても緑になる**
        //   （検査が測っていないことを「確認済み」と表示する。掟が名指ししている失敗）。
        //
        // ⚠ **body を敷きに数えない。**（2026-08-19 に踏んだ）
        //   body は不透明（rgb(8,11,15)）だが、**その上に地図が乗っている**。
        //   文字の背後にあるのは地図（航空写真）で、body ではない。
        //   数えてしまうと、敷きの無い場所へ出しても緑のままだった。
        //   ⚠ **地図（#map）より内側の祖先だけ**を見る。
        const mapEl = document.getElementById("map");
        let bgA = 0, at = null;
        for (let n = e; n && n !== document.body; n = n.parentElement) {
          if (n === mapEl) break;              // ⚠ 地図そのものは敷きではない
          const bg = getComputedStyle(n).backgroundColor;
          if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
          const v = bg.startsWith("rgba") ? (a(bg)[3] ?? 0) : 1;
          if (v > bgA) { bgA = v; at = n.id || n.className || n.tagName; }
          if (bgA >= 1) break;
        }
        return { fs: parseFloat(c.fontSize),
          yearFs: parseFloat(getComputedStyle(y).fontSize), bgA, bgAt: at };
      });
      must(look.fs >= 12, `但し書きが小さすぎる: ${look.fs}px（12px 以上）`);
      must(look.bgA >= 0.5,
        `但し書きに敷きが無い（写真の上で沈む）: 背景の不透明度 ${look.bgA}（敷いているのは ${look.bgAt ?? "無し"}）`);
      must(look.yearFs / look.fs <= 5.2,
        `年の見出しと但し書きの差が開きすぎ: ${look.yearFs}px 対 ${look.fs}px`);
      // ⚠ 「推定」の語だけでは足りない。**主張範囲の分母つき**で言うこと
      must(/\d+ \/ \d+ 件が推定/.test(r.text), `高さの推定を分母つきで言っていない: ${r.text}`);
      must(/年が分かるのは \d+ \/ \d+ 件/.test(r.text), `建設年を分母つきで言っていない: ${r.text}`);
      const m = r.text.match(/(\d+) \/ (\d+) 件が推定/);
      must(+m[1] > 0 && +m[1] <= +m[2], `推定の件数がおかしい: ${m[0]}`);
      for (const w of ["再現", "当時の街並み", "この年に建った"])
        must(!r.text.includes(w), `断定・再現を名乗る語がある: 「${w}」`);

      // 過去へ動かしてから畳む。閉じても、選択年代と最低限の誤解止めは残す。
      await page.$eval("#t", (e) => { e.value = "500"; e.dispatchEvent(new Event("input")); });
      await page.click("#eraToggle");
      const closed = await page.evaluate(() => {
        const era = document.getElementById("era"), rc = era.getBoundingClientRect();
        return { height: rc.height, detailsHidden: document.getElementById("eraDetails").hidden,
          expanded: document.getElementById("eraToggle").getAttribute("aria-expanded"),
          action: document.getElementById("eraToggleText").textContent.trim(),
          year: document.querySelector("#era .y").textContent.trim(),
          note: document.getElementById("eraSummaryNote").textContent.trim() };
      });
      must(closed.detailsHidden && closed.expanded === "false" && closed.action === "開く",
        `年代情報を畳めない: ${JSON.stringify(closed)}`);
      must(closed.height >= 44 && closed.height <= 52,
        `畳んだ年代情報が指で押せる高さでない: ${closed.height}px`);
      must(closed.year.length > 0 && /いまの街/.test(closed.note),
        `畳むと年代または重ねの注意が消える: ${closed.year} / ${closed.note}`);
      await page.click("#eraToggle");
      must(await page.locator("#est").isVisible(), "年代情報をもう一度開けない");
      return `${r.text}／畳むと ${closed.height}px「${closed.year}・${closed.note}」`;
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
      await settleAfterCondition(page);
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
      //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった（当時の分母）。
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
    // ⚠ 共有先は**別の入れ物**で開く。同じ入れ物で開き直すと、画面に残っている状態で
    //   通ってしまい、URL が状態を運べているのかを何も確かめていないことになる
    //   （実測 2026-08-16: 直す前は トップ data-i=8 → 共有先 0、/peel t=400 → 0 に戻っていた）。
    name: "選んだ年代が URL に載り、共有先でもそこから始まる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      const n = await page.locator("#strip .f").count();
      // いちばん右（現在）を選ぶ。着いたときの既定は最古なので、必ず動く
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      const url = page.url();
      must(/[?&]era=seamlessphoto/.test(url), `選んだ年代が URL に載っていない: ${url}`);

      // --- 共有先（別の入れ物） ---
      const ctx = await page.context().browser().newContext({
        viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p2 = await ctx.newPage();
      let top = null, peel = null;
      try {
        await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
          null, { timeout: 60000 });
        await p2.waitForTimeout(300);
        top = await p2.evaluate(() => [...document.querySelectorAll("#strip .f")]
          .findIndex((e) => e.classList.contains("on")));
        must(top === n - 1, `共有先で年代が既定に戻っている: ${top} / ${n - 1}`);

        // /peel も同じ約束。段は土地ごとに間引かれるので、位置ではなく年代IDで運ぶ
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(1200);
        await p2.$eval("#t", (e) => { e.value = "400";
          e.dispatchEvent(new Event("input", { bubbles: true })); });
        await p2.waitForTimeout(500);
        const purl = p2.url();
        must(/[?&]era=gazo1/.test(purl), `/peel の年代が URL に載っていない: ${purl}`);
        const p3 = await ctx.newPage();
        await p3.goto(purl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(1500);
        peel = await p3.$eval("#t", (e) => e.value);
        // ⚠ 段の境界ちょうどで戻ること。中途半端な値だと年代名は出ても場面が入りきらない
        must(peel === "400", `/peel の共有先で段が戻っていない: ${peel}`);
      } finally { await ctx.close(); }
      return `トップ ${n} コマ中 ${top} 番目／/peel t=${peel}（どちらも別の入れ物で復元）`;
    },
  },
  {
    // ⚠ 指定された年代がその土地に無いことは普通に起きる（残っている写真は土地ごとに違う）。
    //   黙って別の年代を出すと、共有した人と見た人が違うものを見ていることに誰も気づかない。
    //   長崎 出島には 1936–42（ort_riku10）が残っていない。
    name: "共有された年代がその土地に無いとき、黙って別の年代にしない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6&era=ort_riku10`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      must(await page.locator("#eraMiss").count() === 1,
        "復元できなかったことを、画面で言っていない");
      const t = (await page.locator("#eraMiss").textContent()).replace(/\s+/g, " ").trim();
      must(/1936/.test(t), `求められた年代の名前が出ていない: ${t}`);
      // ⚠ 畳んだ中や画面外に置かない（過去に「判定の結果を畳んだ中に入れた」を踏んでいる）
      const shown = await page.locator("#eraMiss").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
          && getComputedStyle(e).opacity !== "0"; });
      must(shown, "復元できなかったことが画面に見えていない");
      // ⚠ 年代を選ぶ帯より上にあること。選ぶ場所から離すと、次に何をすればよいか分からない
      const order = await page.evaluate(() => {
        const a = document.getElementById("eraMiss"), b = document.getElementById("strip");
        return a && b ? a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top + 1 : false;
      });
      must(order, "案内が、年代を選ぶ帯の上に無い");
      // 出ていない年代を URL に残さない。残すと同じ空振りが共有のたびに伝播する
      must(!/era=ort_riku10/.test(page.url()), `出ていない年代が URL に残っている: ${page.url()}`);
      // 自分で選び直したら、案内は役目を終える
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      must(await page.locator("#eraMiss").count() === 0,
        "年代を選び直しても、案内が残っている");
      return `「${t.slice(0, 34)}」／帯の上に見えている／選び直すと消える`;
    },
  },
  {
    // ⚠ 建物には安定した ID が無い（配るタイルも Overpass 経路も OSM の id を落としている）。
    //   重心を鍵にしているので、**見つからないこと**が普通に起きる。
    //   そのとき黙って別の建物を選ぶと、共有先だけ違う建物の話になる。
    name: "共有された建物を復元し、見つからなければ別の建物を選ばない", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 90000 });
      await settleAfterCondition(page);
      // ⚠ 内部フィールドに触らない。描かれている素性から鍵を読む
      const key = await page.evaluate(() =>
        map.querySourceFeatures("bld").find((f) => f.properties.k)?.properties.k ?? null);
      must(key, "建物に鍵が付いていない（URL で名指しできない）");
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1200, height: 780 }, serviceWorkers: "block" });
      let pop = 0, card = "", pop2 = 0, miss = "";
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}&b=${encodeURIComponent(key)}`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(2500);
        pop = await p2.locator(".pick-pop").count();
        card = (await p2.locator("#pick").textContent()).replace(/\s+/g, " ").trim();
        must(pop >= 1, "共有された建物の吹き出しが出ていない");
        must(card.length > 0, "共有された建物のカードが出ていない");
        // --- 見つからない鍵 ---
        const p3 = await ctx.newPage();
        await p3.goto(`${BASE}/peel?${TOYOSU}&b=1.000000,1.000000`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(2500);
        pop2 = await p3.locator(".pick-pop").count();
        must(pop2 === 0, "見つからない鍵なのに、別の建物を選んでいる");
        const m = await p3.locator("#stateMiss").evaluate((e) =>
          ({ hidden: e.hidden, t: e.textContent.replace(/\s+/g, " ").trim() }));
        must(!m.hidden && /見つかりませんでした/.test(m.t),
          `見つからなかったことを言っていない: ${JSON.stringify(m)}`);
        miss = m.t;
      } finally { await ctx.close(); }
      return `鍵 ${key} → 吹き出し ${pop} 個「${card.slice(0, 22)}」`
        + `／無い鍵 → ${pop2} 個・「${miss.slice(0, 24)}」`;
    },
  },
  {
    name: "3D から戻っても、調べていた場所が残る", path: `/peel?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。スマホはパネルが閉じて始まるので、
    //   パネルの中にしか戻る手段が無いと**画面から戻れなくなる**
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
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
      // ⚠ 年代も持って戻る。以前は場所だけで、← を押すと見ていた年代が落ちていた。
      //   ⚠ 段が確定する前の「現在」が焼き付かないこと（loadArea で1回書くだけにして踏んだ）
      must(/[&?]era=/.test(href), `戻り先が年代を落としている: ${href}`);
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
      await settleAfterCondition(page);
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
    // ⚠ **/peel に場所を探す口を置かない**（2026-08-18 方針）。
    //   この画面は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
    //
    //   ⚠ 以前ここには「別の場所を見る」（畳んだ検索欄・地名 10 件・現在地）があり、
    //     それを守る検査（畳んで 27px → 押すと 218px）が立っていた。外した理由は 2 つ:
    //       ・トップは **3D の下地がある場所にだけ**導線を出しているのに、
    //         こちらの検索からは**下地の無い場所へ入れてしまう**
    //         （地図は動くのに建物が出ない。出るかどうかは Overpass の混雑しだい）
    //       ・検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
    //
    // ⚠ **消しただけの検査にしない。** 元の検査が守っていたのは
    //   「この画面から場所を変えられること」なので、**その手段が残っていること**を見る。
    //   いまの手段は「← もどる」→ トップの ✕ の一本だけ。
    //   だから、もどる先が**いま見ている場所を持っている**ことまで確かめる。
    name: "3D に場所を探す口は無く、もどると同じ場所のトップへ出る", path: `/peel?${TOYOSU}`,
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      const got = await page.evaluate(() => ({
        // 探す口の残骸。id が残っていると、CSS だけ消したつもりが押せる状態になりうる
        ids: ["q", "cands", "quick", "here", "hereMsg", "findBox", "findLabel"]
          .filter((k) => document.getElementById(k)),
        // ⚠ 年代のつまみ（input[type=range]）は探す口ではない。文字を打つ入れ物だけ数える
        typed: [...document.querySelectorAll("input, textarea")]
          .filter((e) => e.tagName === "TEXTAREA"
            || !["range", "checkbox", "radio", "button", "hidden"].includes(e.type))
          .map((e) => e.id || e.type),
        places: typeof window.KonjakuPlaces,
        back: document.getElementById("back")?.getAttribute("href") ?? "",
      }));
      must(!got.ids.length, `探す口が残っている: ${got.ids.join("・")}`);
      must(!got.typed.length, `文字を打つ入れ物が残っている: ${got.typed.join("・")}`);
      // ⚠ 使う相手がいないのに配らない。⚠ ただし「検索を書くなら places.js」の決まりは生きている
      must(got.places === "undefined", "places.js を読み込んでいる（この画面に使う相手がいない）");
      // 場所を変える手段が、画面から消えていないこと
      must(/^\.\/\?q=/.test(got.back) && /ll=/.test(got.back),
        `もどる先が、いま見ている場所を持っていない: ${JSON.stringify(got.back)}`);
      const back = await page.evaluate(() => {
        const b = document.getElementById("back"), r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 vis: b.checkVisibility({ checkVisibilityCSS: true }) };
      });
      must(back.vis, "「← もどる」が見えていない（場所を変える手段が画面に無い）");
      must(back.h >= 44, `「← もどる」が指で押せる大きさでない: ${back.w}×${back.h}px`);
      return `探す口 0 個／文字入力 0 個／places.js 未読込／もどる先 ${got.back.slice(0, 34)}…`
        + `（${back.w}×${back.h}px）`;
    },
  },
  // ⚠ ここに「同じ応答なら、トップと 3D の候補が一致する」があった（2026-08-18 に外した）。
  //   守っていたのは「検索の実装が 2 つあって、片方だけ直る事故」。
  //   ⚠ **並びを突き合わせるのをやめたのではない。**/peel から検索そのものを外したので、
  //     検索は 1 つになった。⚠ 「2 つ持っていない」ことは scripts/check.mjs が静的に見る
  //     （peel 側に検索の実装が生えたら落ちる）。画面側は上の
  //     「3D に場所を探す口は無く…」が見る。
  // ⚠ **画面が別のことを始めたときも、古い候補が出ない。**
  //   打つたびに切るだけでは足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのままクイック地点を選ぶと、行動一覧（立体で見る等）が出たあと、
  //   **2.5 秒後に「東京都渋谷区」で上書きされた**。
  //   ⚠ 入力欄は setMode() が空にするので `oninput` は発火せず、そこの cancel() には届かない。
  {
    name: "検索中に場所を選んでも、行動一覧が古い候補で上書きされない", dep: "search", path: "/",
    setup: (page) => page.route("**/AddressSearch*", async (r) => {
      await new Promise((x) => setTimeout(x, 2000));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ properties: { title: "東京都渋谷区" },
                                geometry: { coordinates: [139.7, 35.66] } }]) });
    }),
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(1000);         // 応答はまだ返っていない
      await page.locator(".quick button").first().click();   // 場所を選ぶ（setMode("action")）
      await page.waitForFunction(() => document.querySelectorAll("#list .tx b").length > 0,
        null, { timeout: 20000 });
      const acted = (await page.locator("#list").innerText()).trim();
      must(/この場所を深掘り/.test(acted), `場所を選んでも行動一覧が出ていない: ${JSON.stringify(acted.slice(0, 40))}`);
      await settleAfterCondition(page);         // ⚠ ここで古い応答が届く
      const after = (await page.locator("#list").innerText()).trim();
      must(!/渋谷区/.test(after),
        `場所を選んだのに、行動一覧が古い候補で上書きされた: ${JSON.stringify(after.slice(0, 40))}`);
      // ⚠ 「変わらないこと」は見ない。判定が進むと行動一覧は**正当に増える**
      //   （最初そう書いて落ちた）。見たいのは**行動一覧のままであること**。
      must(/この場所を深掘り/.test(after),
        `行動一覧でなくなっている: ${JSON.stringify(after.slice(0, 40))}`);
      return `行動一覧のまま（${JSON.stringify(after.slice(0, 18))}）`;
    },
  },
  {
    // ⚠ **「まだ用意していない」を「取得できなかった」と言わない**（2026-08-18）。
    //   このリポジトリが何度も直してきた並びに、1 行足りていなかった:
    //
    //       観測されていない   ≠  存在しなかった
    //       取得できなかった   ≠  存在しなかった
    //       データにない       ≠  現実にない
    //       まだ用意していない ≠  取得できなかった   ← これ
    //
    //   前者は**こちらの都合**、後者は**相手や回線の都合**。
    //   利用者にとっては「押し直すべきか」が変わるので、意味がまるで違う。
    //
    // ⚠ 実際に破れていた: 一度も取り込んでいない名古屋で
    //   「建物データを取得できませんでした（**Overpass 混雑**）」と書いていた。
    //   利用者役 3/3 がこれを「**自分の通信のせい**」と読み、2 名が「押し直す」と答えた。
    //
    // ⚠ **導線は消さない。** 一度「下地が無い場所では出さない」にしたが、戻した。
    //   出さないと「まだ用意していない」が「この場所には機能そのものが無い」に見え、
    //   利用者役 3/3 が「機能があること自体に気づけない」と答えた。
    // ⚠ そのかわり**押す前に**言う。押して、待たされてから言われるのが最悪、という指摘。
    name: "まだ用意していない場所を、取得できなかったと言わない", path: "/",
    async check(page) {
      const NAGOYA = "q=%E5%90%8D%E5%8F%A4%E5%B1%8B&ll=35.17090,136.88160";
      const top = async () => {
        await page.waitForFunction(
          // ⚠ **字を書き写さない。**⚠ 以前は「です」「ません」を待っており、
          //   ⚠ **言い回しを変えた瞬間に時間切れで落ちた**（2026-08-20）。
          //   ⚠ 待ちたいのは「判定が確定して、答えの行に何か出たこと」。
          () => (document.querySelector("#verdict .v-head")?.innerText ?? "").trim().length > 3,
          null, { timeout: 45000 });
        await settleAfterCondition(page);
        return page.evaluate(() => ({
          peel: document.querySelectorAll('#list [href^="./peel"]').length,
          ownPeel: document.querySelectorAll('#own a[href^="./peel"]').length,
          list: (document.getElementById("list")?.innerText ?? "").replace(/\s+/g, " "),
          own: (document.getElementById("own")?.innerText ?? "").replace(/\s+/g, " "),
        }));
      };
      // (1) 取り込んである場所（豊洲）: 出る。⚠ 断り書きは付けない
      await page.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded" });
      const yes = await top();
      must(yes.peel === 1 && yes.ownPeel === 1,
        `取り込んである場所で導線が出ていない: 一覧 ${yes.peel} / 根拠 ${yes.ownPeel}`);
      must(!/順に増やしています/.test(yes.list),
        `対応してある場所に、対応していないと書いている: ${yes.list.slice(0, 80)}`);
      // (2) まだ用意していない場所（名古屋）: ⚠ **出る。押せる。** そのうえで押す前に言う
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const no = await top();
      must(no.peel === 1, `まだ用意していない場所で導線が消えている（機能の存在に気づけない）: ${no.peel} 本`);
      // ⚠ **できないことの通知ではなく、できることの案内から始める**（利用者役 3/3）。
      //   「用意できていません」で始まる案を 3/3 が最下位にした（押す前に断られた、と読む）。
      must(/空中写真|見くらべる/.test(no.list),
        `押す前に、この場所でできることを言っていない: ${no.list.slice(0, 90)}`);
      // ⚠ そのうえで、建物ごとの判定が出ないことは**押す前に**分かること
      must(/対応した場所から順に増やしています/.test(no.list),
        `押す前に、建物ごとの判定が出ないと分からない: ${no.list.slice(0, 90)}`);
      // ⚠ **⚠ の記号を使わない。**すぐ上の「この土地で気をつけること」（災害リスク）と
      //   同じ印になり、利用者役 2/3 が「危ない土地の警告か」と読んだ
      const mark = await page.evaluate(() =>
        document.querySelector('#list [href^="./peel"]')?.innerText ?? "");
      must(!mark.includes("⚠"), `在庫の話に ⚠ を使っている（危険の印と紛らわしい）: ${mark.slice(0, 60)}`);
      // ⚠ 一覧と根拠カードで言うことが変わらない
      must(no.ownPeel === 1 && /対応した場所から順に増やしています/.test(no.own),
        `根拠カードだけ言い方が違う: 導線 ${no.ownPeel} 本 / ${no.own.slice(0, 80)}`);
      // (3) ⚠ 索引を読めなかっただけのときは、何も断らない（取得できなかった ≠ 用意していない）
      await page.route("**/data/assets.json", (r) => r.abort());
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const unknown = await top();
      must(unknown.peel === 1, `索引を読めないだけで導線を消している: ${unknown.peel} 本`);
      must(!/順に増やしています/.test(unknown.list),
        `索引を読めなかっただけなのに「対応していない」と断定している: ${unknown.list.slice(0, 90)}`);
      await page.unroute("**/data/assets.json");
      return `対応済み 1 本（断りなし）／未対応 1 本（押す前に断る・⚠ なし・一覧と根拠で同じ）／`
        + `索引を読めないときは断らない`;
    },
  },
  {
    // ⚠ 上と対になる、/peel 側。**まだ用意していない場所で「混雑」のせいにしない。**
    //   ⚠ Overpass は止めて測る。止めないと、返ってきた回はこの主張を確かめられない
    //     （名古屋は実測で 8 秒・5,845 件が返ったことがある。**必ず失敗はしない**）。
    name: "まだ用意していない場所で、通信のせいにしない",
    path: "/peel?ll=35.17090,136.88160&q=%E5%90%8D%E5%8F%A4%E5%B1%8B",
    setup: (page) => page.route((u) => /overpass/i.test(u.href), (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(
        () => /まだ提供していません|取得できませんでした/.test(
          document.getElementById("status")?.innerText ?? ""), null, { timeout: 90000 });
      await settleAfterCondition(page);
      const t = await page.evaluate(() => ({
        status: (document.getElementById("status")?.innerText ?? "").replace(/\s+/g, " "),
        land: (document.getElementById("land")?.innerText ?? "").replace(/\s+/g, " "),
        // ⚠ 台帳はパネルの中。閉じていても DOM には入る
        prov: (document.getElementById("prov")?.innerText ?? "").replace(/\s+/g, " "),
      }));
      must(/まだ提供していません/.test(t.status),
        `まだ対応していない、と言っていない: ${t.status.slice(0, 110)}`);
      // ⚠ 相手のせいにしない。一度も取り込んでいない場所で「混雑」は事実に反する
      must(!/混雑/.test(t.status), `対応していないだけなのに、相手の混雑のせいにしている: ${t.status.slice(0, 110)}`);
      // ⚠ **進行形を使わない。**「取得中」「届いていない」は、利用者役 3/3 がそろって
      //   **自分の通信の話**として読んだ（いま動いている感じが出るため）。
      //   ⚠ **台帳まで見る。** 実際に破れていた: 上の文が「まだ用意できていません」と
      //     言っているのに、台帳だけ「未取得 建物データを**取得中**／まだ**届いていない**
      //     だけで」のまま残っていた（fail の分岐で render() を呼んでいなかった）。
      const wet = `${t.status} ${t.land} ${t.prov}`;
      const ng = ["取得中", "届いていない", "取れなかった"].filter((w) => wet.includes(w));
      must(!ng.length,
        `対応していないだけなのに、通信の言い方をしている: 「${ng.join("・")}」／台帳「${t.prov.slice(0, 90)}」`);
      // ⚠ **言い切る。**「毎回まず電波を疑う人間には、この一言がいちばん効く」（利用者役）
      must(/通信の問題ではありません/.test(wet),
        `通信のせいではない、と言い切っていない: ${wet.slice(0, 140)}`);
      // ⚠ 「無い」と言わない。現地に建物が無いという意味ではない
      must(/現地に建物が無いという意味でもありません|現地に建物が無いという意味でもない/.test(wet),
        `「対応していない」を「無い」と読まれないよう断っていない: ${wet.slice(0, 160)}`);
      // ⚠ 台帳が、上の文と同じことを言っていること（同じ画面で主語を食い違わせない）
      must(/未対応/.test(t.prov), `台帳が「未対応」と言っていない: ${t.prov.slice(0, 120)}`);
      // ⚠ 建物が出なくても、この画面は成立している（実測: 空中写真・年代・区分の内訳）
      must(/明治期/.test(t.land), `建物が無いだけで、答えの板まで空になっている: ${t.land.slice(0, 90)}`);
      return `${t.status.slice(0, 46)}… ／ 台帳「${t.prov.slice(-52)}」`;
    },
  },
  // ⚠ **別の語へ変えたときも、古い候補が出ない。**
  //   「入力を消したとき」だけ切っていては足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのまま「新宿」へ変えると、デバウンスの 320〜350ms のあいだに
  //   古い応答が届き、**入力欄は「新宿」なのに「東京都渋谷区」が並ぶ**。
  //   ⚠ その候補を押せば**違う場所へ飛ぶ**。数え方の問題ではなく、行き先の問題。
  //   ⚠ 新しい検索が始まるのはデバウンスのあとなので、run() の中で世代を進めるだけでは
  //   間に合わない。**入力の瞬間に cancel() する**必要がある。
  // ⚠ 3D の側は 2026-08-18 に外した（あちらから検索そのものを外したため）。
  //   ⚠ **組の形は残す。** 検索を持つ画面が増えたら、ここへ足せば同じ穴を両方で見られる。
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
  {
    // ⚠ 豊洲だけを見ても、他の9つのピンが通る証明にはならない。
    //   取り込んだだけの土地で1つ通す。広島を選んだのは、東京以外だから。
    //   ⚠ 以前は「豊洲だけが専用の bbox を持つから」も理由だった（2026-08-20 に解消）。
    //     ⚠ **それでも、この検査は残す。**豊洲は 3D のピンの 1 つでしかない。
    name: "取り込んだだけの土地でも、3D が静的で成り立つ",
    path: "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page, reqs) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
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
      // ⚠ **vendor も毎回確認させる**（2026-08-16 に変えた）。
      //   以前は「名前が変わる前提だから長く持たせてよい」としていたが、
      //   実ファイル名は maplibre-gl.js で**固定**で、その前提が嘘だった。
      //   長く持たせると、MapLibre を上げても**古いものが返り続ける**。
      //   ⚠ immutable も外した。ファイル名をハッシュ付きにできたら、また長く持たせる。
      for (const u of Object.keys(got))
        must(/no-cache|max-age=0/.test(got[u]), `${u} が長く残る: ${got[u]}`);
      // ⚠ 「全部 max-age=0」だけでは、**取れていないのに通る**空振りになりうる。
      //   実際に値が読めていることを見る。
      must(Object.values(got).every((v) => v !== "(無い)"),
        `キャッシュ方針が読めていない: ${JSON.stringify(got)}`);
      return `${Object.keys(got).length} 本とも ${got["/index.html"]}`;
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
      await settleAfterCondition(page);
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
    // ⚠ 検索候補の経路は 2026-08-18 に消えた（/peel から検索を外した）。
    //   ⚠ **代わりに、いま残っている経路を見る。**地名は共有された URL の `?q=` から入り、
    //     画面に地名として描かれる。押させるだけで届くので、injection の経路としては同じ。
    name: "外部の文字列が、3D の地名と建物カードで実行されない",
    path: `/peel?ll=35.65360,139.90200&q=${encodeURIComponent(`千葉県浦安市${XSS}`)}`,
    setup: (page) => Promise.all([
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
      // 静的タイルを迂回して、注入したOSMタグがカードに届く経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
    ]),
    async check(page) {
      await page.waitForFunction(() => /件を判定しました/.test(document.body.innerText),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
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
      // ---- 共有された URL の地名（?q=）----
      // ⚠ パネルを開かないと出ない場所も見る。開かない人には見えないが、DOM には入る
      await page.evaluate(() => document.getElementById("panel")?.classList.remove("hide"));
      await notRun(page, "#placeName", "3D の地名");
      const t = await shownAsText(page, "#placeName", "3D の地名（共有された URL 由来）");
      return `建物カード・吹き出し・地名で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」`;
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
  // ⚠ 豊洲の答えが、**建物単位の水域割合で、分母つき**で出ていること。
  //   ⚠ 層になって、見出しと補足が同じ入れ物（#landAll）に入るようになった。
  //     ⚠ **見ている主張は変えていない。**読む先だけ変えた。
  function assertToyosu3dAnswer(hero, cap, label) {
    const c = (hero + " " + cap).replace(/\s+/g, " ").trim();
    must(/99\.\d\s*%/.test(c), `${label}: 建物単位の水域割合が表示されていない: ${c.slice(0, 100)}`);
    must((c.includes("建物の足元") && c.includes("水域だった建物")) || c.includes("水の上"),
      `${label}: 水域割合の主語と補足が不足: ${c.slice(0, 100)}`);
    // ⚠ 分母は「判定できた件数」。⚠ 層になって書き方が 1 つになった
    // ⚠ 2026-08-20 に 533 → 543。豊洲だけが専用の集計範囲を持つのをやめ、
      //   ⚠ **どの土地とも同じ枠（地点 ± HALF）**で数えるようにしたため。
      //   ⚠ **割合は 99.6% のまま。**変わったのは枠の取り方だけ。
      must(/543件すべての足元を1件ずつ判定した実測値|543 \/ 543\s*件の足元を判定|足元を判定できた 543 \/ 543 件/.test(c),
      `${label}: 分母が建物の判定件数になっていない: ${c.slice(0, 100)}`);
  }

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
// ⚠ **外部に寄りかかるケースだけを切り出せるようにする。**
//   `dep:"search"` は、地理院の住所検索（msearch）の応答が返ってこないと成立しない検査。
//   実測（2026-08-17）で、住所検索は速いとき 0.4 秒・遅いとき 8.2 秒だった。
//   アプリは 8 秒で中断する（掟のタイムアウト）ので、遅い回はアプリが正しく中断し、
//   候補が出ないまま検査だけが落ちる。**アプリの不具合ではなく、検査の前提が外部にある。**
//   → `--group=core` は外へ出ない（＝落ちても外部のせいにできない）ぶんだけを回す。
//     `--group=search` はその逆。CI は両方を回すが、切り分けができる。
const GROUP = process.argv.find((a) => a.startsWith("--group="))?.slice(8);
if (GROUP && !["core", "search"].includes(GROUP)) {
  console.log(`\x1b[31m--group は core か search（来たのは ${GROUP}）\x1b[0m`); process.exit(1);
}
const RUN = CASES
  .filter((c) => !ONLY || c.name.includes(ONLY))
  .filter((c) => !GROUP || (GROUP === "search" ? c.dep === "search" : c.dep !== "search"));
if (ONLY || GROUP) {
  const how = [ONLY && `--only=${ONLY}`, GROUP && `--group=${GROUP}`].filter(Boolean).join(" ");
  if (!RUN.length) { console.log(`\x1b[31m${how} に当てはまるケースが無い\x1b[0m`); process.exit(1); }
  console.log(`\x1b[33m⚠ ${how}: ${RUN.length} / ${CASES.length} 件だけ回す（全件ではない）\x1b[0m\n`);
}

let retried = 0;      // 何回やり直したか。**必ず最後に出す**（黙って再試行しない）
for (const c of RUN) {
  // ⚠ **再試行するのは `dep` が付いたケースだけ。** 付いていないケースの失敗は、
  //   こちらの不具合なので隠さない。付いているものも **1 回だけ**。
  //   ⚠ 2 回目も落ちたら落とす。「たまに落ちる」を「落ちない」に見せかけない。
  for (let attempt = 1; attempt <= (c.dep ? 2 : 1); attempt++) {
    const again = await runCase(c, attempt);
    if (!again) break;
    retried++;
    console.log(`      \x1b[33m⟳ 再試行（${c.dep} が返らなかった可能性）\x1b[0m`);
  }
}

// 1 件を回す。落ちて、かつ**やり直す価値がある**なら true を返す
async function runCase(c, attempt) {
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
  // ⚠ **外部が遅いときに何が起きたかを、あとから読めるようにしておく。**
  //   `LOG_SEARCH=1 npm run render` で、住所検索の要求・応答・失敗を時刻つきで出す。
  //   これで「アプリが 8 秒で中断した（掟どおり）」と「検査の書き方が悪い」を切り分けられた
  //   （2026-08-17: 実測で遅いとき 8.2 秒 → ERR_ABORTED → 候補が出ず時間切れ）。
  if (process.env.LOG_SEARCH) {
    const t0 = Date.now();
    page.on("request", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [req ] +${((Date.now()-t0)/1000).toFixed(1)}s ${c.name}`); });
    page.on("response", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [resp] +${((Date.now()-t0)/1000).toFixed(1)}s ${r.status()} ${c.name}`); });
    page.on("requestfailed", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [FAIL] +${((Date.now()-t0)/1000).toFixed(1)}s ${r.failure()?.errorText} ${c.name}`); });
  }
  // 「実行時に外部へ出ていないこと」を検査できるように、出た先を全部控える
  page.on("request", (r) => reqs.push(r.url()));

  try {
    // 通信断・無応答を作るケースは、ページを開く前に仕込む
    await c.setup?.(page);
    await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    const detail = await c.check(page, reqs);
    // 描画自体は通っても、裏でエラーが出ていれば見逃さない
    if (errors.length) throw new Error(`JSエラー: ${errors[0]}`);
    console.log(`  \x1b[32m✓\x1b[0m ${c.name} — ${detail}${attempt > 1 ? " \x1b[33m（再試行で通過）\x1b[0m" : ""}`);
    // ⚠ **印と実際の通信を突き合わせる。** 印が古くなると、再試行も切り分けも効かなくなる。
    //   ⚠ 応答を差し替えているケースでも request は出るので、これは
    //     「印が付いているのに一度も検索しない」ほうだけを見る（片方向）。
    if (c.dep === "search" && !reqs.some((u) => /address-search/.test(u))) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${c.name} — dep:"search" の印が付いているのに、住所検索を1度も叩いていない（印が古い）`);
    }
  } catch (e) {
    if (c.dep && attempt === 1) { await page.close(); return true; }   // やり直す
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
  return false;
}

await browser.close();
stop();

console.log(`\n${"─".repeat(52)}`);
// ⚠ **再試行を黙って飲み込まない。** 増えていくなら、外部が落ちているか検査が悪い
if (retried) console.log(`\x1b[33m⟳ 外部（住所検索）待ちで ${retried} 回やり直した\x1b[0m`);
if (failed) { console.log(`\x1b[31m${failed} / ${RUN.length} 件が失敗\x1b[0m`); process.exit(1); }
// ⚠ **SPEC の件数が、本当にこの数か。**
//   ⚠ 静的検査からは実描画のケース数を数えられないので、**自分で名乗る**。
//   実測（2026-08-19）: 検査を足したのに SPEC が古いまま緑で出た。
// ⚠ `--only` のときは見ない（回した数と全件が違うのは、そう指示したから）。
if (!ONLY) {
  const spec = await readFile(new URL("../docs/SPEC.md", import.meta.url), "utf8").catch(() => "");
  const want = { "実描画": CASES.length,
                 "--group=core": CASES.filter((c) => c.dep !== "search").length,
                 "--group=search": CASES.filter((c) => c.dep === "search").length };
  const gap = [];
  for (const [lab, n] of Object.entries(want)) {
    const after = (spec.split("\n").find((l) => l.includes(lab)) ?? "");
    const m = /\*\*(\d+)件\*\*/.exec(after.slice(after.indexOf(lab) + lab.length));
    if (!m) gap.push(`${lab}: SPEC に件数が無い`);
    else if (Number(m[1]) !== n) gap.push(`${lab}: SPEC は ${m[1]}件・実際は ${n}件`);
  }
  if (gap.length) {
    console.log(`\x1b[31m✗ docs/SPEC.md の件数が実際と違う: ${gap.join(" ／ ")}\x1b[0m`);
    console.log(`\x1b[31m  （検査を足したら SPEC も直す。文書は誰も実行しないので気づけない）\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓ docs/SPEC.md の件数と合っている（実描画 ${CASES.length} / core ${want["--group=core"]} / search ${want["--group=search"]}）\x1b[0m`);
}
// ⚠ 回していないケースを「描画できた」と言わない（--only のとき）
console.log(ONLY
  ? `\x1b[33m${RUN.length} 件は描画できた（⚠ 全 ${CASES.length} 件のうち --only で選んだぶんだけ）\x1b[0m`
  : `\x1b[32m${RUN.length} 件すべて描画できた\x1b[0m`);
