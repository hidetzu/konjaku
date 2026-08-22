// 住所検索の口（`public/gsi-address-search.js`）と、⚠ その使い方を確かめる
//   （2026-08-22。hidetzu/konjaku#181）。
//
// ⚠ **外へは 1 本も出ない。**⚠ `fetch` を差し替えて、⚠ **本番の口をそのまま動かす。**
//
// ⚠ **ここが見るもの**（＝ 外の話の作り）
//   1 検索 1 リクエスト ／ 再試行の回数と上限 ／ 時間切れは再試行しない ／
//   200 でも配列でなければ「取れなかった」 ／ URL の組み立て ／
//   ⚠ cancel したあとの応答で画面を上書きしない（⚠ これは `places.js` の世代の話）
//
// ⚠ **ここが見ないもの**
//   並べ替え・選ぶかどうか（⚠ `test/search-check.mjs` が 42 語で見る） ／
//   ⚠ 相手先が生きているか（⚠ `test/search-live-check.mjs` が定期・手動で見る）
//
// 実行: node test/repository-check.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// ⚠ **画面と同じ順で載せる**（⚠ 口 → places.js）
const win = {};
for (const f of ["gsi-address-search.js", "places.js"]) {
  new Function("window", "module",
    await readFile(join(ROOT, "public", f), "utf8"))(win, undefined);
}
const { createSearch } = win.KonjakuPlaces;
const { createGsiAddressSearch } = win.KonjakuGsiAddressSearch;

let failed = 0;
const ok  = (m) => console.log(`  \x1b[32m\u2713\x1b[0m ${m}`);
const bad = (m) => { failed++; console.log(`  \x1b[31m\u2717\x1b[0m ${m}`); };

console.log("\x1b[1m住所検索の口（外へは出ない）\x1b[0m");

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

// ⚠ **URL の組み立ても見る**（⚠ 語を渡していないと、⚠ 別の場所を検索することになる）。
{
  let seen = "";
  await createGsiAddressSearch({
    fetch: (u) => { seen = u; return Promise.resolve({ ok: true, json: async () => [] }); },
  }).search("渋谷");
  seen.includes(encodeURIComponent("渋谷"))
    ? ok("URL に語が入っている")
    : bad(`URL に語が入っていない: ${seen}`);
}

console.log("");
console.log("\u2500".repeat(52));
// ⚠ **0 件で緑にしない。**⚠ 1 件も確かめていないのに「問題なし」と言わない
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m`); process.exit(1); }
console.log("\x1b[32m問題なし\x1b[0m");
