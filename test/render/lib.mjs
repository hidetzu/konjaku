// 実描画の道具（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **ここは道具だけ。**⚠ ケースは `top.mjs` / `peel.mjs` が持つ。
// ⚠ **走らせ方は `../render.mjs`。**⚠ ここには置かない。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ 中身は 1 行も変えていない
//   （⚠ 変えると、⚠ 切り出しの失敗と、⚠ 直しの失敗が混ざって読めなくなる）。

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
await import(new URL("../../public/words.js", import.meta.url).href);
export const WORDS = globalThis.KonjakuWords;
if (!WORDS) throw new Error("public/words.js を読み込めない（一覧行のタグを確かめられない）");

// ⚠ **ポートは env で変えられるようにする**（2026-08-22）。
//   ⚠ 同じ機械で別のワークツリーが実描画を回していると、⚠ **8099 を先に取られる。**
//   ⚠ そのとき serve.js は EADDRINUSE で死ぬが、⚠ **stdio を捨てているので気づけない。**
//   ⚠ ブラウザは**相手のワークツリーの画面**を開き、⚠ **黙って別のものを測る。**
//   ⚠ 実際に踏んだ（2026-08-22）: 相手は `main`、こちらは画面を変えた枝。
//     ⚠ こちらの検査が 4 件落ち続け、⚠ **原因を自分の変更だと誤認しかけた。**
export const PORT = Number(process.env.KONJAKU_RENDER_PORT ?? 8099);
export const BASE = `http://127.0.0.1:${PORT}`;
// ⚠ 隠しディレクトリ（`.` 始まり）にしない。
//   `.artifacts/` に置いていたので actions/upload-artifact@v4 が既定で除外し、
//   **75 枚撮って 1 枚も保存されていなかった**（2026-08-15 に実測）。
export const OUT = "artifacts/render";

// 判定に使う地点。水域・田・データ無しを一通り通す。
export const TOYOSU = "ll=35.65480,139.79750&q=%E8%B1%8A%E6%B4%B2";
// 明治期の低湿地データが**無い**土地（地形分類は答えられる）。
// ⚠ ここが寄りかかっているのは「国土地理院の整備範囲の外」であって、
//   こちらの取り込みとは関係が無い。事物を取り込んでも、この性質は変わらない。
export const SAPPORO = "ll=43.06400,141.34700&q=%E6%9C%AD%E5%B9%8C%E9%A7%85";
// ⚠ 取り込み済みの建物が無い土地。だから実行時に Overpass へ行く（＝待つ）。
//   札幌は 2026-08-16 に取り込んだので、もう待たない（1364 件が即出る）。
export const NAGOYA_LL = "ll=35.17090,136.88160&q=%E5%90%8D%E5%8F%A4%E5%B1%8B";

// ⚠ **取り込まない土地**。「未整備のときの振る舞い」を見る検査は、
//   その土地が未整備であることに寄りかかっている。取り込んだ瞬間、検査は
//   外へ出なくなり、**何も確かめずに必ず通る**ようになる（気づけない）。
//   以前ここは札幌だったが、札幌は北海道の顔として取り込むことにしたので移した。
//   帯広を候補に入れるときは、この検査の土地も一緒に動かすこと。
//   check.mjs が「この土地が索引に載っていないこと」を見ている。
export const UNSURVEYED = "ll=42.92400,143.19600&q=%E5%B8%AF%E5%BA%83";
// 明治期は水域だが、いまは標高10m（ごみで嵩上げされた土地）。低地ではない。
export const YUMENOSHIMA = "ll=35.64830,139.82650&q=%E5%A4%A2%E3%81%AE%E5%B3%B6";
// 明治期の記録が無い地点。標高は 1.79m の低地。
export const KIYOSUMI = "ll=35.68170,139.80000&q=%E6%B8%85%E6%BE%84%E7%99%BD%E6%B2%B3";
// 地形分類の詳細版（z14〜16）が整備されていない土地。広域版に落ちる。
export const KARUIZAWA = "ll=36.34280,138.63500&q=%E8%BB%BD%E4%BA%95%E6%B2%A2";
// ⚠ 出来事の記録が多い場所（hidetzu/konjaku#141）。⚠ 実測 2026-08-21: 16 件・一覧 8 行
export const UENO = "ll=35.71480,139.77450&q=%E4%B8%8A%E9%87%8E";
// 明治期の低湿地は整備対象外だが、地形分類は「旧河道」と答えられる土地。
export const NIIGATA = "ll=37.91220,139.06110&q=%E6%96%B0%E6%BD%9F";
// ⚠ 建物を取り込んでいない土地。ただし明治期の低湿地データはある土地を選ぶ
//   （軽井沢は低湿地データが無く、建物の取得まで進まない）。浦安は水域 44.8%。
export const URAYASU = "ll=35.65400,139.90200&q=%E6%B5%A6%E5%AE%89";

// 「次に調べる語」を一覧から拾う。
// 理由（sub）に実測した事実が入っているものだけが提案。
// 提案は読み物へ渡すものなので、リンクは Google の Web検索でなければならない。
// 地図検索に「液状化」を投げても何も出てこない。
// 判定から導いた語は .it.why を持つ。副題の文面ではなく印で拾うことで、
// 「印が付いているか」自体もここで検査していることになる。
// ⚠ **組は既定で畳んである**（2026-08-21。Owner 判断）。⚠ 中身を見る前に開く。
//   ⚠ **「畳んでいること」自体は、⚠ 別のケースが見る**（開いてしまうと見られない）。
//   ⚠ 押すたびに一覧を描き直すので、⚠ **要素の掴み直しが要る**。
export const openGroups = async (page) => {
  for (let i = 0; i < 6; i++) {
    const h = await page.$('#list .lh.fold[aria-expanded="false"]');
    if (!h) break;
    await h.click();
    await page.waitForTimeout(150);
  }
};
export const suggestionsOf = async (page) => {
  await openGroups(page);
  return page.$$eval("#list .it.why", (els) => els
    .map((e) => ({ label: e.querySelector("b")?.textContent ?? "",
                   href: e.getAttribute("href") ?? "" })));
};
// 一覧を上から [組, 見出し] で読む。
// ⚠ **2026-08-21 に、行ごとのタグをやめて組の見出しにした。**
//   ⚠ 組は印（class）で読む。⚠ **字ではなく印で拾うことで、印が付いているかもここで見る。**
export const rowsOf = async (page) => {
  await openGroups(page);
  return page.$$eval("#list .it", (els) => els
    .map((e) => [e.classList.contains("why") ? "why" : "ext",
                 e.querySelector("b")?.textContent ?? ""]));
};
// 一覧の組の見出しを上から読む。
// ⚠ **見出しは 3 つの部品でできている**（2026-08-21）: 名前 ／ 件数 ／ ＞∨。
//   ⚠ **名前だけを読む。**⚠ 件数と記号は別のケースが見る。
export const groupsOf = (page) => page.$$eval("#list .lh", (els) =>
  els.map((e) => (e.querySelector("span")?.textContent ?? e.textContent).trim()));
export const WEB_SEARCH = "https://www.google.com/search?q=";

// 判定が確定するまで待ち、ページを開いてから確定までの ms を返す。
// 「判定中…」のまま読むと素通りしてしまうので、必ずここを通す。
export async function waitVerdict(page, timeout = 45000) {
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
export const WD = "**://query.wikidata.org/**";
// prec: 9=年 / 8=10年 / 7=100年（Wikidata の timePrecision と同じ）
export const wdItem = (id, label, year, until, lon, lat, prec = 9) => ({
  item: { value: `http://www.wikidata.org/entity/Q${id}` },
  itemLabel: { value: label },
  date: { value: `${year < 0 ? "-" : ""}${String(Math.abs(year)).padStart(4, "0")}-01-01T00:00:00Z` },
  dateP: { value: String(prec) },
  ...(until ? { until: { value: `${until}-01-01T00:00:00Z` } } : {}),
  coord: { value: `Point(${lon} ${lat})` },
});
// 渋谷の実データに合わせた並び。無くなったものが3つ入っている
export const WD_SHIBUYA = (lon, lat) => ([
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
export const stubWikidata = (page, rows) => Promise.all([
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
export const XSS = `<img src=x onerror="window.__pwned=(window.__pwned||0)+1">`;
// ⚠ 「発火 0」だけでは足りない。CI で画像の取得が落ちれば onerror は鳴らないので、
//   **要素になっていないこと**も併せて見る。文字として出ているなら <img> は生まれない。
// ⚠ 数えるのは**注入した印（src=x）が付いた要素**だけ。
//   `${sel} img` だと写真の帯の正しい画像まで数え、`body script` だと
//   ページ自身のスクリプト 7 個を数える。どちらも一度やって、検査のほうが間違っていた。
export const notRun = async (page, sel, what) => {
  const n = await page.evaluate(() => window.__pwned ?? 0);
  must(n === 0, `${what}: 外部の文字列が ${n} 回実行された`);
  const el = await page.locator(`${sel} img[src="x"]`).count();
  must(el === 0, `${what}: 外部の文字列が要素になっている（${el} 個）`);
};
// エスケープしても、表示される文字は変えない（掟: 取れなかったを「無い」と言わない と同じで、
// 直したつもりで別のことが壊れるのを防ぐ）。生の文字列がそのまま読めることを見る。
export const shownAsText = async (page, sel, what) => {
  const t = (await page.locator(sel).first().textContent()) ?? "";
  must(t.includes("<img src=x onerror="),
    `${what}: 注入した文字がそのまま表示されていない: ${(t ?? "").slice(0, 60)}`);
  return t;
};

// 帯の中で「写真の」コマだけを選ぶ。
// ⚠ 左端は明治期（低湿地データ）になった。写真ではないので、年で比べる検査はここを避ける。
export const photoFrames = (page) => page.locator("#strip .f:not(.meiji)");

// 年代ストリップの写真が、実際に復号し終わるまで待つ。
// ⚠ 枠の有無だけを見て先へ進むと、**写真が1枚も出ていない帯**を検査が通してしまう。
//   しかも撮れるスクリーンショットが真っ黒になり、判断材料としても使えない。
export async function waitStrip(page, timeout = 30000) {
  await page.waitForFunction(
    () => { const im = [...document.querySelectorAll("#strip img")];
            return im.length > 0 && im.every((e) => e.complete && (e.naturalWidth > 0
              || e.parentNode.classList.contains("err"))); },
    null, { timeout });
}

// ⚠ 中核思想の防衛線（docs 掟: 取れなかったを「無い」と言わない）。
// 通信が落ちただけの土地に「整備対象外」「データが無い」「残っていない」と書いていた。
// しかも根拠UI（参照タイル・読んだ画素）付きで。人の目に頼らず、ここで落とす。
export const LIES = ["整備対象外", "データが無い", "記録がありません", "残っていない", "データなし"];
// 成り立ちの1文が出ていること。
// ⚠ **字を書き写さない**（2026-08-20。hidetzu/konjaku#122）。
//   ⚠ ここには文言そのものが直書きしてあった。⚠ **コメント自身が
//     「守っている意図は区分名を含む1文が出ていること。文言そのものではない」と
//     書いていたのに、正規表現は文言そのものだった。**
//   ⚠ 言い回しを ADR 0030 へ揃えた瞬間、⚠ **製品ではなく検査が落ちた**（これで 4 回目）。
// ⚠ **主語は words.js の 1 か所から取る。**⚠ 区分名は土地ごとに変わるので、
//   ⚠ **「主語＋何か」が出ていること**だけを見る（それがこの検査の主張）。
export const RE_ESC = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const G1_MARK = "@@";
export const G1_HEAD = WORDS.ground1Lines(G1_MARK, null)[0].split(G1_MARK)[0];
export const VERDICT_SENTENCE = new RegExp(RE_ESC(G1_HEAD) + "\\S+");
export const GSI_ROUTE = "**://*.gsi.go.jp/**";
// 写真タイルだけを落とす。低湿地（swale）・標高・建物は生かしたまま、
// 「地表のラスタだけが1枚も届いていない」状態を作るための経路。
export const PHOTO_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/**";

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
export const pngOf = (size, fill, speckle = false) => {
  const stride = size * 3 + 1;                 // 1行 = フィルタ種別1バイト + RGB
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) raw.fill(fill, y * stride + 1, (y + 1) * stride);
  // ⚠ **むらを入れる**（`speckle`）。⚠ 画面は「平ら＆真っ白」を撮影範囲外と読むので、
  //   ⚠ **写真のつもりの絵には、⚠ ばらつきが要る**（判定の規則は `public/verify.js`）。
  if (speckle) for (let y = 0; y < size; y++)
    for (let x = (y % 3); x < size; x += 3) raw[y * stride + 1 + x * 3] = fill ^ 0x30;
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
// ⚠ **真っ白＝撮影範囲外**。⚠ **この意味で使う所が既にある。⚠ 中身を変えない。**
export const whitePng = (size = 256) => pngOf(size, 0xff);
// ⚠ **「写真がある」と読まれる絵**（2026-08-22。hidetzu/konjaku#191）。
//   ⚠ **画面は `mean > 250 かつ ばらつき < 1` を撮影範囲外と読む**（`public/verify.js`）。
//   ⚠ **白を返すと、⚠ アプリ自身がその年代を段から落とす。**
//   ⚠ **実際に踏んだ（2026-08-22）**: 白で塞いだら、⚠ 豊洲の帯が **9 段 → 3 段**になり、
//     ⚠ **検査は落ちずに通った**（⚠ 3 段の帯で「押せる」を見ていた）。
export const photoPng = (size = 256) => pngOf(size, 0x80, true);
export const eraRoute = (id) => `**://cyberjapandata.gsi.go.jp/xyz/${id}/**`;

// ⚠ **地図の絵だけ差し替える**（2026-08-22。hidetzu/konjaku#191）。
//   ⚠ **使ってよいのは「絵が本当に届くか」が主題でないケースだけ。**
//     ⚠ **押せるか・並び・重なり・見えているか**を見るケースが対象。
//   ⚠ **届くこと自体を見るケースには使わない**（⚠ 使うと、⚠ その検査は何も確かめなくなる）。
//   ⚠ **判定は 1 つも変えない。**⚠ 減るのは外への本数だけ。
//   ⚠ **fixture のファイルは置かない**（置くと「画素を読んで判定する」という主張が
//     ⚠ 置いた絵の話にすり替わる）。
// ⚠ **実測（2026-08-22・手元）**: `--suite=top --group=search` の 9 件で、
//   ⚠ **外へ出た本数 81 → 26 本（−68%）**。⚠ **絵は 55 → 0 本。**
//   ⚠ **判定の材料 20 本と住所検索 6 本は、⚠ 本物のまま変えていない。**
//   ⚠ **時間は 58.4s → 58.7s で変わらない**（⚠ **待ちが理由で、⚠ 通信ではない**）。
// ⚠ **年代のタイル。**⚠ **`public/verify.js` の ERAS と揃える**（2026-08-22 に取りこぼした）。
//   ⚠ **`ort_USA10`（1945–50・米軍撮影）が抜けていて、⚠ 3 本が外へ出ていた。**
export const ERA_TILE_IDS = ["gazo1", "gazo2", "gazo3", "gazo4",
  "ort_riku10", "ort_USA10", "ort_old10"];
// ⚠ **下地の地図**（⚠ 絵であって、⚠ 判定の材料ではない）。⚠ **差し替えてよい。**
export const BASEMAP_IDS = ["pale", "std", "blank"];
// ⚠ **空中写真**（⚠ `PHOTO_ROUTE` が塞ぐもの）。
export const PHOTO_ID = "seamlessphoto";
// ⚠ **判定の材料**（⚠ 低湿地・地形分類・標高）。⚠ **偽ると答えが変わる。⚠ 差し替えない。**
//   ⚠ **ここに無いものを、⚠ 黙って材料に数えない**（⚠ 分からないものは経路のまま出す）。
export const MATERIAL_ID_RE = /^(swale|lcmfc|experimental_l|landform|dem|relief)/;

// ⚠ **外へ出た 1 本が何だったかを言う**（2026-08-22。hidetzu/konjaku#191）。
//   ⚠ **「絵」の定義を 2 か所に持たない**（掟 §3）。⚠ **塞ぐ一覧と、⚠ 数える物差しは同じもの。**
//   ⚠ **分からないものは「その他」にしない。**⚠ 経路をそのまま出して、⚠ 次に分類する人へ渡す。
export const kindOfRequest = (url) => {
  let u; try { u = new URL(url); } catch { return "（?）"; }
  if (/address-search/.test(u.pathname)) return "（住所検索）";
  // `/xyz/<タイルの名前>/z/x/y.png`
  const seg = u.pathname.split("/");
  const id = seg[1] === "xyz" ? seg[2] : null;
  if (id) {
    if (id === PHOTO_ID || ERA_TILE_IDS.includes(id) || BASEMAP_IDS.includes(id)) return "（絵）";
    if (MATERIAL_ID_RE.test(id)) return "（判定の材料）";
  }
  return "（" + seg.slice(0, 4).join("/") + "）";
};

export const stubMapPictures = async (page) => {
  const pic = (r) => r.fulfill({ status: 200, contentType: "image/png", body: photoPng() });
  await page.route(PHOTO_ROUTE, pic);
  for (const id of ERA_TILE_IDS) await page.route(eraRoute(id), pic);
  // ⚠ **下地も絵。**⚠ **判定の材料（低湿地・地形分類）は塞がない**（⚠ 偽ると答えが変わる）。
  for (const id of BASEMAP_IDS) await page.route(eraRoute(id), pic);
};

// 段が**確定する**まで待つ。
// ⚠ `/peel` は写真の判定を待つあいだ、いったん全 9 段を仮に出す
//   （peel3d.js: timelineReady=false の区間。共有先で「一度戻された」ように見せないため）。
//   peelReady が見ている #status は**水域と建物**の話で、写真の年代とは別の経路なので、
//   **#status が埋まった時点では、段はまだ仮のことがある**。
//   実測（2026-08-17 / 豊洲 / 375×667）: peelReady 直後は timelineReady=false。
// ⚠ 建物を事前計算して静的に配るようになり #status が速くなったぶん、
//   仮の段を読む確率が上がった。**手元では 2 件が落ち、CI では通っていた**
//   ＝落ちたり通ったりする検査で、いずれ CI でも落ちるものだった。
export const timelineSettled = (page) => page.waitForFunction(() => {
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
export const stepLabels = async (page) => {
  // 仮の段を読まない。ここ1か所で待てば、段を読むケース全部が同じ約束になる
  await timelineSettled(page);
  return page.evaluate(() => {
    const el = document.getElementById("t"), max = Number(el.max), out = [];
    const keep = el.value;
    for (let v = 0; v <= max; v += 100) {
      el.value = String(v); el.dispatchEvent(new Event("input"));
      out.push(document.querySelector("#timePanel .y").textContent.trim());
    }
    el.value = keep; el.dispatchEvent(new Event("input"));
    return out;
  });
};
// 建物の高さの式に埋まっている時間座標（tau）を読む。
// ⚠ ここが「表示位置」に化けていないことが、この修正の肝。
export const tauNow = (page) => page.evaluate(() => {
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
export const effOpacity = (page, sel) => page.evaluate((s) => {
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

// ⚠ **淡くなる／濃くなる途中を読まない**（2026-08-21。hidetzu/konjaku#152 の CI で落ちて分かった）。
//   ⚠ パネルは `opacity` の遷移で開閉する。⚠ **押した直後に読むと途中の値が返る。**
//     ⚠ 実測: 手元では閉じた直後 0.02 だが、⚠ **CI では 0.058**（⚠ 0.05 の境目をまたいだ）。
//     ⚠ 別のケースでは、⚠ 開いた直後に 0 を読んで「読めない」と落ちた。
//   ⚠ **時間で待たない**（⚠ 機械の速さで変わる）。⚠ **落ち着くまで待つ。**
//   ⚠ **主張は弱めない**: ⚠ 落ち着いた値が条件を満たさなければ、⚠ そのまま落ちる。
//   ⚠ **待ちは長めに取る**（20 秒）。⚠ 札幌は地形分類が遅れて届き、⚠ **8 秒では 0 のままだった**
//     （⚠ 実測 2026-08-21: 14 秒後には 1）。⚠ **待つだけで、⚠ 主張は弱めていない。**
export const waitOpacity = async (page, sel, ok, timeout = 20000) => {
  const t0 = Date.now();
  let prev = null, v = null;
  while (Date.now() - t0 < timeout) {
    v = await effOpacity(page, sel);
    if (v !== null && v === prev && ok(v)) return v;
    prev = v;
    await page.waitForTimeout(120);
  }
  return v;
};

export const peelReady = (page) => page.waitForFunction(
  () => /件|ありません|読み込めませんでした/.test(document.getElementById("status")?.textContent ?? ""),
  null, { timeout: 60000 });

// ⚠ **この 2 つは「何かが起きるのを待つ」ものではない。**
//   何が起きたかは、直前の条件待ち／押した操作そのものが見ている。
//   ⚠ **残っているのは、変わった DOM が描き終わるまでのぶんだけ。**
//   ⚠ **待つ長さが主張になっている検査には使わない**（「6 秒後の姿勢」「20 秒で諦める」など）。
//   実測（2026-08-20・`--group=core` 126 件・手元）: 置き換え前 341 秒 → 置き換え後 286 秒。
//   ⚠ 3 回連続で 126 件すべて通ることを確かめてから、この形にした。

// 直前の `waitForFunction` が既に条件を見ている。その後の描き終わりぶん
export const settleAfterCondition = (page) => page.waitForTimeout(300);

// ⚠ **届かなくてよい待ち**（⚠ 止まりうる依存が相手）。⚠ **握りつぶさず、⚠ 捨てた時間を名乗る**。
//   ⚠ **実際に踏んだ（2026-08-22）**: 札幌のケースが、⚠ **もう存在しない `#land`** を 20 秒待ち、
//     ⚠ **毎回 20 秒を捨てたうえで、⚠ その先の 2 つの主張を一度も走らせていなかった**
//     （⚠ 画面には「扇状地」が出ているのに「届かなかった」と書いていた）。
//   ⚠ **`catch` で false にすると、⚠ 時間も主張も静かに消える。**⚠ **消えたことを出力に出す。**
export const waited = [];   // ⚠ 届かなかった待ちの控え。⚠ 走り終わりに名乗る
export const waitOptional = async (page, fn, { timeout, label }) => {
  const t0 = Date.now();
  const got = await page.waitForFunction(fn, null, { timeout }).then(() => true).catch(() => false);
  if (!got) waited.push({ label, ms: Date.now() - t0 });
  return got;
};

// 押した結果が描き終わるまで。⚠ **この画面は枠組みを使っていないので DOM は同期で変わる**。
//   残っているのは CSS の遷移ぶん
export const settleAfterClick = (page) => page.waitForTimeout(400);

// ⚠ **押した先で画面が寄る（滑らかスクロール）ときは、これを使う。**
//   ⚠ **決め打ちの待ちだと、速い機械で通って CI で落ちる。**
//     実測（2026-08-20・CPU を 6 倍遅くして再現）: 400ms では写真が **0%** しか見えず、
//     ⚠ **止まるまで待てば 100%**。⚠ 決め打ちの待ちを縮めた PR で 1800ms → 400ms にした
//     箇所で、実際に CI が落ちた（⚠ **手元の速い機械では 3/3 通っていた**）。
//   ⚠ **時間ではなく「動きが止まったこと」を見る。**
export const settleAfterScroll = async (page) => {
  await page.waitForFunction(() => {
    const y = Math.round(window.scrollY);
    if (window.__lastScrollY === y) return true;
    window.__lastScrollY = y; return false;
  }, null, { timeout: 30000, polling: 250 });
  await page.evaluate(() => { delete window.__lastScrollY; });
  await settleAfterCondition(page);
};

export const SWALE_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/swale/**";
export const LFC_ROUTE = "**://maps.gsi.go.jp/xyz/experimental_landformclassification*/**";
export const DEM_ROUTE = "**://cyberjapandata.gsi.go.jp/xyz/dem*/**";
export const forbid = (page, route) => page.route(route, (r) => r.fulfill({
  status: 403, contentType: "text/html", body: "<html><body>403 Forbidden</body></html>" }));

// ⚠ **元は配列の後ろにあった道具**（⚠ 巻き上げで動いていた）。⚠ 切り出しに合わせて前へ出した。

export function must(cond, msg) { if (!cond) throw new Error(msg); }
  // ⚠ 豊洲の答えが、**建物単位の水域割合で、分母つき**で出ていること。
  //   ⚠ 層になって、見出しと補足が同じ入れ物（#landAll）に入るようになった。
  //     ⚠ **見ている主張は変えていない。**読む先だけ変えた。
export function assertToyosu3dAnswer(hero, cap, label) {
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

