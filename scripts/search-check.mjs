// 検索の入口が壊れていないかを、42語で毎回確かめる。
//
// なぜ要るか（掟: 取れなかったを「無い」と言わない（やる順番3））:
//   住所検索 API は関連度で返さない。都道府県コードの昇順（北→南）で返るので、
//   「渋谷」の先頭は福島県猪苗代町渋谷、「新宿」の東京都新宿区は13番目で画面に出ない。
//   この並びは API 側の都合で変わりうるし、こちらの並べ替えも壊れうる。
//   初見が必ず失敗する状態には二度と戻さない、という線をここで引く。
//
// 出荷するコードそのもの（public/places.js）を読んで測る。
// 検査用に写しを作ると、直したつもりで本番が直っていない状態が作れてしまう。
//
// 実行: node scripts/search-check.mjs
//   --offline … .artifacts/search-cache/ に落とした応答で回す（APIを叩かない）
//
// ⚠ 住所検索は 10req/10秒 の制限がある。既定で 1.5 秒あけて 1語ずつ叩く。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, ".artifacts", "search-cache");
const OFFLINE = process.argv.includes("--offline");
const API = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
const GAP_MS = 1500;

// ---- 回帰リスト（42語）----
// 内訳は PO が測ったベースラインと同じ切り方にしてある:
//   区名・繁華街名 8語  … 初見が最初に打つ語。ここが 0/8 だったのが今回の発端
//   埋立地 17語        … 実測で決めた狙いの客（首都圏の埋立地・低地住民）の語。
//                        既に当たっていたので、**下げないこと**が最重要
//   同名の土地 4語     … 区名と町字が同じ語で競合する組。**最も誤発火しやすい class**
//   その他 6語         … 掟: 取れなかったを「無い」と言わない で全国24地点として実測した語のうち、上の語に無いもの
//   駅名・施設名 7語   … 行政地名として存在しない土地。応答の末尾に沈んでいた
//
// expect は「その語を打った人が行きたかった場所」。実装より先に決めて、後から動かさない。
// NO は「この語では自動選択してはいけない」。順位の期待値とは別の期待値で、
// **応答からは行き先が決まらないと分かっている語**に付ける。
// 誤発火の検知を expect まかせにすると、たまたま期待値に当たる場所へ発火したときに
// 素通りする（「大島」がまさにそれだった）ので、選ばないこと自体を期待値にしている。
const NO = { pick: "no" };

const CITY_WORDS = [
  ["渋谷", /^東京都渋谷区/],
  ["新宿", /^東京都新宿区/],
  ["銀座", /^東京都中央区銀座/],
  // 足立区梅田と大阪市北区梅田。どちらも区の町字で、応答からは決められない
  ["梅田", /^大阪府大阪市北区梅田/, NO],
  ["博多", /^福岡県福岡市博多区/],
  ["横浜", /^神奈川県横浜市/],
  ["川崎", /^神奈川県川崎市/],
  // 伊豆大島（大島町）と江東区大島。どちらも都内の実在地で、語だけでは決められない。
  // ⚠ 順位の期待値を2つ許すのは、決められないものを片方に決めると
  //   「実装がそう並べたから」を期待値にしてしまうため。どちらが上でも初見は困らない。
  //   決められないという事実のほうは NO（自動選択しない）で表している。
  //   これが無かった頃、この語だけはどちらに発火しても誤発火にならず、判定不能だった。
  ["大島", /^東京都(大島町|江東区大島)/, NO],
];
const LANDFILL_WORDS = [
  ["豊洲", /^東京都江東区豊洲/],
  // 札幌市清田区有明と江東区有明。どちらも区の町字
  ["有明", /^東京都江東区有明/, NO],
  ["辰巳", /^東京都江東区辰巳/],
  ["東雲", /^東京都江東区東雲/],
  ["晴海", /^東京都中央区晴海/],
  ["新木場", /^東京都江東区新木場/],
  ["芝浦", /^東京都港区芝浦/],
  ["舞浜", /^千葉県浦安市舞浜/],
  ["月島", /^東京都中央区月島/],
  ["若洲", /^東京都江東区若洲/],
  ["青海", /^東京都江東区青海/],
  ["南砂", /^東京都江東区南砂/],
  ["台場", /^東京都港区台場/],
  ["東品川", /^東京都品川区東品川/],
  ["みなとみらい", /^神奈川県横浜市西区みなとみらい/],
  ["浦安", /^千葉県浦安市/],
  ["扇島", /^神奈川県(川崎市川崎区|横浜市鶴見区)扇島/],
];
// ---- 同名の土地（区名と町字が同格で競合する語）----
// 「区名が町字より上」は並べ替えの規則であって確からしさの証拠ではない。
// この class が1語も無かったため、区名側が勝つ語では同じ曖昧さでも発火していた
// （港南 → 横浜市港南区、住吉 → 大阪市住吉区。どちらも狙いの客の土地ではない）。
const SAME_NAME_WORDS = [
  // 品川駅東の埋立地（港区港南）と横浜市港南区。生APIの1位は港区港南のほう
  ["港南", /^東京都港区港南/, NO],
  // 江東区住吉と大阪市住吉区。住吉駅はどちらにもある
  ["住吉", /^東京都江東区住吉/, NO],
  // 東京都中央区・大阪市中央区・大阪市浪速区。3つとも区の町字で、日本橋駅も東西にある
  ["日本橋", /^東京都中央区日本橋/, NO],
  // 東京都中野区と仙台市宮城野区中野ほか。区名側が勝つ語の代表
  ["中野", /^東京都中野区/, NO],
];
const OTHER_WORDS = [
  ["京都", /^京都府京都市/],
  ["仙台", /^宮城県仙台市/],
  ["神戸", /^兵庫県神戸市/],
  ["大宮", /^埼玉県さいたま市大宮区/],
  ["三軒茶屋", /^東京都世田谷区三軒茶屋/],
  // 応答に「錦糸町」という**住所**は無い（返るのは墨田区錦糸と錦糸町駅）。
  //
  // ⚠ 期待値を実装に合わせて動かした。理由を残す。
  //   元は「名前の違う場所へ確信を持って飛ばす根拠は無い」として NO にしていた。
  //   しかしその後、**駅名は語尾の「駅」を省いて呼ばれる**（天王洲アイル＝天王洲アイル駅、
  //   幕張＝幕張駅）という規則を入れた。錦糸町駅は「名前の違う場所」ではなく、
  //   まさにその語を名前とする場所になる。前提のほうが変わった。
  //   ここを NO のままにすると、天王洲アイルは駅へ飛ばすのに錦糸町は飛ばさない、という
  //   説明できない差になる。同じ形のものは同じに扱う。
  ["錦糸町", /^(東京都墨田区錦糸|錦糸町駅)/],
];

// ---- 駅名・施設名（行政地名として存在しない土地）----
// 打った本人が探しているものが、応答の末尾に沈んでいた語。
// 「東京駅」は53件中50位、「東京スカイツリー」は49件中49位（最後）だった。
// 応答には最初から入っていたので、足りなかったのは並べ方だけ。
const POI_WORDS = [
  ["東京駅", /^東京駅/],
  ["渋谷駅", /^渋谷駅/],
  ["品川駅", /^品川駅/],
  ["天王洲アイル", /^天王洲アイル駅/],
  ["幕張", /^幕張/],
  ["東京スカイツリー", /^東京スカイツリー/],
  ["横浜スタジアム", /^横浜スタジアム/],
  // ⚠ 「梅田」は CITY_WORDS に既にある（足立区梅田と大阪市北区梅田で決められない語）。
  //   駅の規則を入れても行政地名を追い越さないことは、そちらの期待値がそのまま検査する。
  //   同じ語を2回入れると、片方だけ通ったときに気づけない。
];
const WORDS = [...CITY_WORDS, ...LANDFILL_WORDS, ...SAME_NAME_WORDS, ...OTHER_WORDS, ...POI_WORDS];

// ---- 合格ライン（並べ替え前の実測がベースライン）----
const LINE = {
  first:    { min: 27, base: 17, label: "1位" },
  top3:     { min: 34, base: 25, label: "3位内" },
  city:     { min:  7, base:  0, label: "区名・繁華街名8語が1位" },
  landfill: { min: 11, base: 11, label: "埋立地17語が1位（退行させない）" },
};

// ---- 出荷するコードをそのまま読む ----
const src = await readFile(join(ROOT, "public", "places.js"), "utf8");
const win = {};
new Function("window", "module", src)(win, undefined);
const { places, createSearch } = win.KonjakuPlaces;

let failed = 0;
const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad  = (m) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function fetchWord(w) {
  const file = join(CACHE, encodeURIComponent(w) + ".json");
  if (OFFLINE) return JSON.parse(await readFile(file, "utf8"));
  const r = await fetch(API + encodeURIComponent(w), { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(j));       // --offline で回せるように残す
  return j;
}

head(`検索の並び（${WORDS.length}語${OFFLINE ? " / キャッシュ" : ""}）`);
const rows = [];
for (const [w, expect, opt] of WORDS) {
  let list;
  try { list = await fetchWord(w); }
  catch (e) {
    // 取れなかったことを「並びが悪い」と言い換えない（掟: 取れなかったを「無い」と言わない）。検査は保留にして落とす
    bad(`${w}: 応答を取得できませんでした（${e.message}）。判定を保留します`);
    if (!OFFLINE) await new Promise((s) => setTimeout(s, GAP_MS));
    continue;
  }
  const all = places(list, w, list.length).all;
  const shown = places(list, w, 10);
  const at = all.findIndex((x) => expect.test(x.title));
  // 選んだ区域と、その対抗馬の駅数。設計上の約束を後で突き合わせるために控える
  const top = shown.areas.get(shown.all[0].area);
  const st2 = Math.max(0, ...[...shown.areas.values()]
    .filter((a) => a !== top).map((a) => a.stations));
  rows.push({ w, at, top: shown.rows[0]?.title ?? "", pick: shown.pick, expect,
              noPick: opt?.pick === "no", stations: top.stations, st2 });
  if (!OFFLINE) await new Promise((s) => setTimeout(s, GAP_MS));
}

if (rows.length !== WORDS.length) {
  console.log(`\n\x1b[31m${WORDS.length - rows.length} 語ぶん測れませんでした\x1b[0m`);
  process.exit(1);
}

for (const r of rows)
  console.log(`  ${r.at === 0 ? "\x1b[32m1位\x1b[0m" : r.at < 0 ? "\x1b[31m圏外\x1b[0m"
    : r.at < 3 ? `${r.at + 1}位 ` : `\x1b[33m${r.at + 1}位\x1b[0m`}`
    + ` ${r.pick >= 0 ? "選ぶ" : "    "} ${r.w.padEnd(7)} ${r.top}`);

const hit = (list, i) => list.filter(([w]) => rows.find((r) => r.w === w)?.at === i).length;
const total = (k) => k === "city" ? CITY_WORDS.length
  : k === "landfill" ? LANDFILL_WORDS.length : WORDS.length;
const got = {
  first: rows.filter((r) => r.at === 0).length,
  top3: rows.filter((r) => r.at >= 0 && r.at < 3).length,
  city: hit(CITY_WORDS, 0),
  landfill: hit(LANDFILL_WORDS, 0),
};

head("指標");
for (const [k, v] of Object.entries(LINE)) {
  const n = got[k];
  const m = `${v.label}: ${n}/${total(k)}（合格 ${v.min} 以上・修正前 ${v.base}）`;
  n >= v.min ? ok(m) : bad(m);
}
{
  const out = rows.filter((r) => r.at < 0 || r.at >= 10);
  out.length ? bad(`上位10件に出ない語: ${out.map((r) => r.w).join("、")}（合格 0・修正前 5）`)
             : ok("上位10件に出ない語: 0（合格 0・修正前 5）");
}
{
  // ⚠ 1検索1リクエストを守る。これは**地理院への負荷の約束**で、緩めてはいけない。
  //
  // ⚠ 以前は「places.js に fetch( の字が無いこと」で見ていた。検索の通信を
  //   places.js へ集約した時点で、この見方は使えない（必ず落ちる）。
  //   ⚠ **閾値を緩めるのではなく、実際に何回叩いたかを数える形にする。**
  //   createSearch({fetch}) で差し替えられるようにしてあるのは、このため。
  const calls = [];
  const mk = (impl) => createSearch({ fetch: (u, o) => { calls.push(u); return impl(u, o); } });
  const okRes = (body) => Promise.resolve({ ok: true, json: async () => body });

  calls.length = 0;
  const found = await mk(() => okRes([{ properties: { title: "東京都渋谷区" },
    geometry: { coordinates: [139.7, 35.66] } }])).run("渋谷", 10);
  found.state === "found" && calls.length === 1
    ? ok(`1検索あたりの外部リクエスト: ${calls.length}（正常時）`)
    : bad(`正常時の外部リクエストが1回でない: ${calls.length} 回 / state=${found.state}`);

  // 瞬断は1回だけ再試行する。**2回を超えない**（相手を無限に叩かない）
  calls.length = 0;
  let n = 0;
  const retried = await mk(() => (++n === 1 ? Promise.reject(new Error("boom")) : okRes([]))).run("渋谷", 10);
  retried.state === "empty" && calls.length === 2
    ? ok(`瞬断のときの外部リクエスト: ${calls.length}（1回だけ再試行）`)
    : bad(`再試行の回数が違う: ${calls.length} 回 / state=${retried.state}`);

  // ⚠ **上限そのものを試す。** 1回目だけ失敗させる上のケースでは、
  //   再試行の上限を 2 に増やしても通ってしまう（2 回叩いた時点で成功するため）。
  //   実際に踏んだ（2026-08-15）。**全部失敗させて、それでも 2 回で止まること**を見る。
  calls.length = 0;
  const allFail = await mk(() => Promise.reject(new Error("boom"))).run("渋谷", 10);
  allFail.state === "error" && calls.length === 2
    ? ok(`ずっと落ちていても外部リクエストは ${calls.length} 回で止まる`)
    : bad(`落ち続けたときに止まらない: ${calls.length} 回 / state=${allFail.state}`
      + `（相手を余分に叩く。1検索あたり最大2回）`);

  // ⚠ 時間切れは再試行しない（同じ相手をもう8秒待たせるのは、待たせただけになる）
  calls.length = 0;
  const to = () => { const e = new Error("timeout"); e.name = "TimeoutError"; return Promise.reject(e); };
  const timed = await mk(to).run("渋谷", 10);
  timed.state === "error" && timed.why === "時間切れ" && calls.length === 1
    ? ok("時間切れのときは再試行しない（1回で止める）")
    : bad(`時間切れの扱いが違う: ${calls.length} 回 / state=${timed.state} / why=${timed.why}`);

  // ⚠ 取れなかったことを「無い」と言わない。200 でも配列でなければ error
  calls.length = 0;
  const notArray = await mk(() => okRes({ message: "ng" })).run("渋谷", 10);
  notArray.state === "error"
    ? ok("200 でも一覧の形でなければ「取れなかった」として扱う")
    : bad(`配列でない応答を error にしていない: state=${notArray.state}`);

  // ⚠ 入力を消したら、遅れて返った応答で画面を上書きしない
  const sr = mk(() => new Promise((r) => setTimeout(() => r({ ok: true, json: async () => [] }), 30)));
  const p1 = sr.run("渋谷", 10);
  sr.cancel();
  (await p1).state === "stale"
    ? ok("cancel() のあとの応答は stale（画面に触らない）")
    : bad("cancel() しても応答が stale にならない（遅れた候補が復活する）");
}

// ---- 自動選択の誤発火 ----
// 「確度が高いときだけ選ぶ」の価値は、選んだときに必ず当たっていること。
// 1件でも外して選ぶなら、選ばないほうがましなので、ここは 0 でなければ落とす。
head("自動選択");
{
  const fired = rows.filter((r) => r.pick >= 0);
  const wrong = fired.filter((r) => !r.expect.test(r.top));
  console.log(`  発火 ${fired.length}/${rows.length} 語: ${fired.map((r) => r.w).join("、")}`);
  wrong.length ? bad(`誤発火 ${wrong.length} 件: ${wrong.map((r) => `${r.w}→${r.top}`).join("、")}`)
               : ok("誤発火 0 件（選んだ語はすべて意図した場所）");

  // ⚠ 誤発火 0 件だけでは「発火のゆるさ」を測れない。
  // 期待値に当たる場所へ発火してしまう語（大島・中野・日本橋）は、条件をどれだけ緩めても
  // 誤発火にならないため、発火条件を壊しても検査が素通りする。
  // 「応答からは行き先が決まらない」と分かっている語では、**選ばないこと自体**を要求する。
  const mustNot = rows.filter((r) => r.noPick);
  const fired2 = mustNot.filter((r) => r.pick >= 0);
  fired2.length
    ? bad(`決められない語で発火 ${fired2.length} 件: ${fired2.map((r) => `${r.w}→${r.top}`).join("、")}`)
    : ok(`決められない語 ${mustNot.length} 語（${mustNot.map((r) => r.w).join("・")}）で発火 0 件`);

  // 設計上の約束「駅の名前で他の区域に負けている区域は選ばない」を、選んだ全語で突き合わせる。
  // 実測では、この条件で止まる語は35語中1語も無い（止めているのは件数マージンと
  // 同格競合の判定）。約束として書いてある以上、守られていることは測っておく。
  const lost = fired.filter((r) => r.stations < r.st2);
  lost.length
    ? bad(`駅で負けている区域を選んだ: ${lost.map((r) => `${r.w}（駅 ${r.stations} 対 ${r.st2}）`).join("、")}`)
    : ok("選んだ区域はすべて、語を含む駅の数で他の区域に負けていない");

  // 利用者役のエージェントによる検証で3回とも別の土地に着いた3語。Enter だけで着けることを名指しで守る
  for (const w of ["渋谷", "新宿", "川崎"]) {
    const r = rows.find((x) => x.w === w);
    r.pick >= 0 && r.expect.test(r.top)
      ? ok(`${w}: Enter だけで ${r.top}`)
      : bad(`${w}: Enter だけでは着かない（選択=${r.pick >= 0 ? r.top : "なし"}）`);
  }
}

console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m`); process.exit(1); }
console.log("\x1b[32m問題なし\x1b[0m");
