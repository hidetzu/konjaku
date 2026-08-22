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
// 実行: node test/search-check.mjs
//   （既定）           … ⚠ **fixture で回す。⚠ 外へは 1 本も出ない**
//   --live             … ⚠ **本物の地理院を叩く**（⚠ 1.5 秒あけて 1 語ずつ。⚠ 42 語で 63 秒以上）
//   --update-fixtures  … ⚠ **本物を叩いて fixture を取り直す**（⚠ 明示的な操作。⚠ CI では走らせない）
//
// ⚠ **既定を fixture にした理由**（2026-08-22。hidetzu/konjaku#204）:
//   ⚠ **実測（CI）**: 42 語の回帰が **73 秒**で、⚠ **静的ジョブ 85 秒の 86%** を占めていた。
//   ⚠ **その大半は待ち**（10req/10秒 の制限に合わせた 1.5 秒 × 42 語 ＝ 最低 63 秒）。
//   ⚠ **ここで見たいのは「こちらの並べ替えが正しいか」**であって、
//     ⚠ **地理院がいま生きているかではない。**
//
// ⚠ **ただし、⚠ 誰も相手先を見なくなってはいけない**（CLAUDE.md §9 の裏返し）。
//   ⚠ **本物との疎通は `test/search-live-check.mjs` が、⚠ 定期・手動で数語だけ確かめる。**
//
// ⚠ 住所検索は 10req/10秒 の制限がある。⚠ **本物を叩くときだけ** 1.5 秒あける。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
// ⚠ **fixture は `git` に載せる**（2026-08-22。hidetzu/konjaku#204）。
//   ⚠ **`.artifacts/` は捨てる場所**なので、⚠ **CI には存在しなかった。**
const FIX = join(ROOT, "test", "fixtures", "search");
const LIVE = process.argv.includes("--live");
const UPDATE = process.argv.includes("--update-fixtures");
// ⚠ **`--offline` は、⚠ もう既定。**⚠ **古い呼び方を落とさない**（受けるが何もしない）。
const ONLINE = LIVE || UPDATE;
// ⚠ **口はここに書かない**（2026-08-22。hidetzu/konjaku#181）。
//   ⚠ **前は `places.js` と同じ URL を写していた。**⚠ 掟: 同じ問いに答える実装を2つ持たない。
//   ⚠ **写していたせいで、⚠ 42 語は本番の取得経路を 1 度も通っていなかった。**
//   ⚠ **確かめていたのは「検査自身が書いた通信」**で、⚠ 出荷するコードではなかった。
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
// ⚠ **画面と同じ順で載せる**（⚠ `peel.html` / `index.html` が `<script>` を並べるのと同じ）。
//   ⚠ **口（gsi-address-search.js）を先に載せる。**⚠ `places.js` はそれを使う。
const win = {};
for (const f of ["gsi-address-search.js", "places.js"]) {
  const src = await readFile(join(ROOT, "public", f), "utf8");
  new Function("window", "module", src)(win, undefined);
}
const { places, createSearch } = win.KonjakuPlaces;
const { createGsiAddressSearch } = win.KonjakuGsiAddressSearch;

let failed = 0, unverified = 0;
const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad  = (m) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
// ⚠ **相手が返さなかったことを、こちらの不具合として落とさない**（CLAUDE.md §9）。
//   ⚠ 「並びが悪い」と「その場所を返してこなかった」は別のこと。
//   ⚠ **黙って通さない。**保留として数え、最後に必ず件数を出す。
const skip = (m) => { unverified++; console.log(`  \x1b[33m?\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

// ⚠ **取ってくるのは、⚠ 本番の口**（`public/gsi-address-search.js`）。
//   ⚠ **fixture は「fetch の応答」として渡す。**⚠ **口は差し替えない。**
//   ⚠ **こうすると、⚠ 42 語を回すたびに ⚠ 本番の URL 組み立て・状態判定・
//     応答の形の検査・再試行が通る**（⚠ 外へは 1 本も出ない）。
//   ⚠ **前は fixture を直接読んでいたので、⚠ そこが 1 度も検査されていなかった。**
// ⚠ **fixture を HTTP の応答のふりで返す。**⚠ 口から見ると、⚠ 本物と同じ形
const fixtureFetch = async (url) => {
  const w = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
  const file = join(FIX, encodeURIComponent(w) + ".json");
  let body;
  // ⚠ **fixture の欠けは、⚠ こちらの落ち度**（2026-08-22 に踏んだ）。
  //   ⚠ **「取れなかった」と混ぜない。**⚠ 相手の話ではないので、⚠ **保留にせず落とす。**
  try { body = JSON.parse(await readFile(file, "utf8")); }
  catch { throw Object.assign(new Error(
    `fixture が無い／読めない（${file}）`
    + `。⚠ **相手の話ではない。**⚠ node test/search-check.mjs --update-fixtures で取る`),
    { ours: true }); }
  return { ok: true, status: 200, json: async () => body };
};

// ⚠ **取り直しのときだけ、⚠ 本物を叩いて控える。**⚠ **`--live` では書き換えない**
//   （⚠ 書き換えると、⚠ 落ちるはずの回帰が、⚠ 新しい応答で塗り替えられて通る）。
const recordingFetch = async (url, init) => {
  const r = await fetch(url, init);
  if (!UPDATE || !r.ok) return r;
  const body = await r.json();
  const w = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
  await mkdir(FIX, { recursive: true });
  await writeFile(join(FIX, encodeURIComponent(w) + ".json"), JSON.stringify(body));
  return { ok: true, status: r.status, json: async () => body };
};

const gsi = createGsiAddressSearch({ fetch: ONLINE ? recordingFetch : fixtureFetch });

async function fetchWord(w) { return gsi.search(w); }

// ⚠ **何で回したかを、⚠ 必ず名乗る**（2026-08-22。hidetzu/konjaku#204）。
//   ⚠ **fixture で回したのに「42 語を確かめた」とだけ出すと、
//     ⚠ 相手先を見た検査だと読まれる。**
const meta = ONLINE ? null : await readFile(join(FIX, "_meta.json"), "utf8")
  .then(JSON.parse).catch(() => null);
if (!ONLINE) {
  if (!meta?.takenAt) {
    bad("fixture の取得日が分からない（test/fixtures/search/_meta.json）"
      + "。⚠ **いつの応答で回したか言えない検査にしない**");
  } else {
    const days = Math.floor((Date.now() - Date.parse(meta.takenAt)) / 86400000);
    console.log(`\n\x1b[1m検索の並び（${WORDS.length}語 / fixture）\x1b[0m`);
    console.log(`  ⚠ **外へは 1 本も出ていない。**⚠ 見ているのは「こちらの並べ替え」だけ`);
    console.log(`  fixture は ${meta.takenAt} に取った（${days} 日前）`
      + `。⚠ **本物との疎通は test/search-live-check.mjs が別に見る**`);
  }
} else {
  head(`検索の並び（${WORDS.length}語 / ⚠ **本物の地理院**${UPDATE ? " ・ fixture を取り直す" : ""}）`);
}
const rows = [];
// ⚠ 応答そのものが取れなかった語。⚠ **相手の側の話**なので、rows とは別に持つ
const unfetched = [];
// ⚠ 応答は返ったが 0 件だった語。⚠ **これも相手の側**（こちらは並べ替える材料が無い）
const empty = [];
for (const [w, expect, opt] of WORDS) {
  let list;
  try { list = await fetchWord(w); }
  catch (e) {
    // 取れなかったことを「並びが悪い」と言い換えない（掟: 取れなかったを「無い」と言わない）。
    // ⚠ **落とさない。**⚠ こちらの並べ替えは、この語について何も主張していない。
    // ⚠ **ただし fixture の欠けは別**（⚠ こちらの落ち度なので、⚠ 保留にせず落とす）。
    if (e.ours) { bad(`${w}: ${e.message}`); continue; }
    unfetched.push({ w, why: e.message });
    skip(`${w}: 応答を取得できませんでした（${e.message}）。⚠ 判定できません`);
    if (ONLINE) await new Promise((s) => setTimeout(s, GAP_MS));
    continue;
  }
  // ⚠ **0 件の応答で落ちない。**⚠ 実測（2026-08-21）: ここを素通りさせると
  //   `shown.all[0].area` で TypeError になり、⚠ **保留にする前に検査ごと死ぬ**。
  //   ⚠ 相手が何も返さなかったことを、⚠ こちらの異常終了として見せない。
  if (!Array.isArray(list) || !list.length) {
    empty.push(w);
    skip(`${w}: 応答が 0 件でした。⚠ 判定できません`);
    if (ONLINE) await new Promise((s) => setTimeout(s, GAP_MS));
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
  if (ONLINE) await new Promise((s) => setTimeout(s, GAP_MS));
}

// ⚠ **取り直したら、⚠ いつ取ったかを刻む**（2026-08-22。hidetzu/konjaku#204）。
//   ⚠ **刻まないと、⚠ 「いつの応答で回したか」を誰も言えなくなる。**
if (UPDATE) {
  await writeFile(join(FIX, "_meta.json"), JSON.stringify({
    takenAt: new Date().toISOString().slice(0, 10),
    source: API,
    words: WORDS.length,
    note: "⚠ 地理院の応答をそのまま置いたもの。⚠ 相手先の正しさではなく、"
        + "⚠ こちらの並べ替えが処理すべき入力例を固定するためのもの",
  }, null, 2) + "\n");
  console.log(`\n  fixture を取り直した（${WORDS.length} 語 ／ test/fixtures/search/）`);
}

// ⚠ **1 語も測れていないときだけ落とす。**
//   ⚠ 「何語か測れなかった」で落とすのは、⚠ **相手がいま何を返すかを主張している**のと同じ
//   （CLAUDE.md §9）。⚠ ただし **0 件で緑にはしない**（1 語も確かめていない）。
if (!rows.length) {
  bad(`${WORDS.length} 語とも判定できませんでした`
    + `（取得できず ${unfetched.length} 語 ／ 応答が 0 件 ${empty.length} 語）`
    + `。⚠ 1 語も確かめていないので緑にしない`);
  console.log(`\n${"─".repeat(52)}`);
  console.log(`\x1b[31m${failed} 件の問題\x1b[0m`);
  process.exit(1);
}

for (const r of rows)
  console.log(`  ${r.at === 0 ? "\x1b[32m1位\x1b[0m" : r.at < 0 ? "\x1b[31m圏外\x1b[0m"
    : r.at < 3 ? `${r.at + 1}位 ` : `\x1b[33m${r.at + 1}位\x1b[0m`}`
    + ` ${r.pick >= 0 ? "選ぶ" : "    "} ${r.w.padEnd(7)} ${r.top}`);

const hit = (list, i) => list.filter(([w]) => rows.find((r) => r.w === w)?.at === i).length;
// ⚠ **分母は「主張できる語」だけ**（CLAUDE.md §6: 主張範囲の分母で書く）。
//   ⚠ `at < 0` は「応答のどこにも期待地が入っていなかった」＝ ⚠ **相手が返さなかった**。
//   ⚠ `places()` の `all` は畳みも打ち切りもしない全件なので、⚠ **こちらが落としたのではない。**
const GROUP = { city: CITY_WORDS, landfill: LANDFILL_WORDS };
const wordsOf = (k) => GROUP[k] ?? WORDS;
const seenIn = (k) => wordsOf(k).filter(([w]) => (rows.find((r) => r.w === w)?.at ?? -1) >= 0).length;
const got = {
  first: rows.filter((r) => r.at === 0).length,
  top3: rows.filter((r) => r.at >= 0 && r.at < 3).length,
  city: hit(CITY_WORDS, 0),
  landfill: hit(LANDFILL_WORDS, 0),
};

head("指標");
// ⚠ **こちらの正しさだけを主張する。**
//   ⚠ 届かなかったときに、⚠ **欠けた語が全部当たっていたとしても届かない**なら、
//     それは並べ替えの問題＝ ⚠ **こちらの不具合**なので落とす。
//   ⚠ 欠けた語しだいで届きうるなら、⚠ **判定できない**（相手の返事に依存する）。
for (const [k, v] of Object.entries(LINE)) {
  const n = got[k], d = seenIn(k), miss = wordsOf(k).length - d;
  const m = `${v.label}: ${n}/${d}（合格 ${v.min} 以上・修正前 ${v.base}）`;
  if (n >= v.min) ok(m + (miss ? `。⚠ 応答に無かった ${miss} 語は分母から外した` : ""));
  else if (n + miss >= v.min)
    skip(`${m}。⚠ 応答に無かった ${miss} 語しだいで届きうるので、⚠ **判定できません**`);
  else
    bad(`${m}。⚠ 応答に無かった ${miss} 語が全部 1 位でも届かない＝並べ替えの問題`);
}
{
  // ⚠ **応答に入っているのに 10 件目までに出せない**のは、⚠ こちらの並べ替えの責任。
  //   ⚠ 応答に入っていない語（`at < 0`）は、⚠ **ここでは数えない。**
  const out = rows.filter((r) => r.at >= 10);
  const miss = rows.filter((r) => r.at < 0);
  out.length ? bad(`上位10件に出ない語: ${out.map((r) => r.w).join("、")}（合格 0・修正前 5）`)
             : ok("上位10件に出ない語: 0（合格 0・修正前 5）"
                 + (miss.length ? `。⚠ 応答に無かった ${miss.length} 語は数えていない` : ""));
}
// ⚠ **取得の検査は `test/repository-check.mjs` へ出した**（2026-08-22。hidetzu/konjaku#181）。
//   ⚠ **ここが見るのは「こちらの並べ替え」だけ。**⚠ 通信の作りは、⚠ 向こうが見る。

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
  // ⚠ **応答に入っていない語では、Enter で着けるかを主張できない。**
  //   ⚠ ただし 3 語とも判定できないなら、⚠ **この節は何も見ていない**ので、そう言う。
  let named = 0;
  for (const w of ["渋谷", "新宿", "川崎"]) {
    const r = rows.find((x) => x.w === w);
    if (!r || r.at < 0) { skip(`${w}: 応答に期待した場所が入っていない。⚠ 判定できません`); continue; }
    named++;
    r.pick >= 0 && r.expect.test(r.top)
      ? ok(`${w}: Enter だけで ${r.top}`)
      : bad(`${w}: Enter だけでは着かない（選択=${r.pick >= 0 ? r.top : "なし"}）`);
  }
  if (!named) bad("名指しの 3 語（渋谷・新宿・川崎）を 1 語も確かめていない");
}

// ---- ⚠ 判定できなかったぶんを、必ず出す ----
// ⚠ **黙って減らさない。**⚠ 保留が増えていることに気づけないと、
//   ⚠ **「落ちない検査」になったのに緑で通る**（掟: 検査が測っていないことを確認済みと言わない）。
head("判定できなかったぶん");
{
  const miss = rows.filter((r) => r.at < 0);
  const all = unfetched.length + empty.length + miss.length;
  if (unfetched.length)
    console.log(`  応答を取得できなかった: ${unfetched.length} 語（${unfetched.map((u) => u.w).join("、")}）`);
  if (empty.length)
    console.log(`  応答が 0 件だった: ${empty.length} 語（${empty.join("、")}）`);
  if (miss.length)
    console.log(`  応答に期待した場所が入っていなかった: ${miss.length} 語（${miss.map((r) => r.w).join("、")}）`);
  if (!all) console.log(`  0 語（${WORDS.length} 語すべて判定できた）`);
  // ⚠ **全語が判定できないなら落とす。**⚠ 1 語も確かめていないのに緑にしない
  //   （既存の「0 件で緑にしない」と同じ考え）。
  if (all >= WORDS.length)
    bad(`${WORDS.length} 語すべてを判定できていない（⚠ 1 語も確かめていないので緑にしない）`);
}

console.log(`\n${"─".repeat(52)}`);
if (failed) {
  console.log(`\x1b[31m${failed} 件の問題\x1b[0m`
    + (unverified ? `\x1b[33m ／ 判定できなかった主張 ${unverified} 件\x1b[0m` : ""));
  process.exit(1);
}
console.log("\x1b[32m問題なし\x1b[0m"
  + (unverified ? `\x1b[33m（⚠ ただし判定できなかった主張が ${unverified} 件ある）\x1b[0m` : ""));
