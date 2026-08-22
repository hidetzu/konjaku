// ⚠ **地理院の住所検索と、⚠ いま本当に話せるか**だけを確かめる
//   （2026-08-22。hidetzu/konjaku#204）。
//
// ⚠ **ここは「こちらの正しさ」を主張しない。**
//   ⚠ **並べ替えの回帰は `test/search-check.mjs` が fixture で見る**（外へ出ない）。
//   ⚠ **ここが見るのは、⚠ 相手が生きていて、⚠ 想定の形で返すかだけ。**
//
// ⚠ **落ちたときに「こちらの不具合」と読まれないようにする**（CLAUDE.md §9・§4）。
//   ⚠ **これが落ちても、⚠ 出荷したコードが壊れたわけではない。**
//
// 実行: node test/search-live-check.mjs
// ⚠ **PR では走らせない。**⚠ 定期・手動のときだけ（`.github/workflows/check.yml`）。
//
// ⚠ 住所検索は 10req/10秒 の制限がある。⚠ **数語だけ**、1.5 秒あけて叩く。

const API = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
const GAP_MS = 1500;
// ⚠ **少数でよい。**⚠ **大量に叩いて品質を測るのは、⚠ ここの目的ではない。**
const WORDS = ["渋谷", "新宿"];

let ng = 0;
const ok  = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const out = (m) => { ng++; console.log(`  \x1b[33m?\x1b[0m ${m}`); };

console.log(`\x1b[1m地理院の住所検索と話せるか（${WORDS.length}語）\x1b[0m`);
console.log("  ⚠ **ここは相手先の話。**⚠ 落ちても、⚠ こちらのコードが壊れたわけではない");

for (const w of WORDS) {
  try {
    const r = await fetch(API + encodeURIComponent(w), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { out(`${w}: HTTP ${r.status}（⚠ 相手が返した）`); continue; }
    const j = await r.json();
    // ⚠ **形だけ見る。**⚠ **何位に何が来るかは見ない**（⚠ それは相手の都合で動く）。
    if (!Array.isArray(j)) { out(`${w}: 配列で返ってこなかった（⚠ 形が変わった可能性）`); continue; }
    if (!j.length) { out(`${w}: 0 件だった（⚠ 相手の側の話）`); continue; }
    const p = j[0]?.properties, g = j[0]?.geometry;
    if (typeof p?.title !== "string" || !Array.isArray(g?.coordinates)) {
      out(`${w}: 想定の形ではない（title / coordinates が無い）`); continue;
    }
    ok(`${w}: ${j.length} 件、想定の形で返った（先頭「${p.title}」）`);
  } catch (e) {
    out(`${w}: 届かなかった（${e.message}）`);
  }
  await new Promise((s) => setTimeout(s, GAP_MS));
}

// ⚠ **落とし方に気をつける。**⚠ **1 語でも話せたなら、⚠ 相手は生きている。**
//   ⚠ **全部駄目だったときだけ落とす**（⚠ 一時的な揺れで赤にしない）。
if (ng === WORDS.length) {
  console.log(`\n\x1b[31m${WORDS.length} 語とも話せなかった\x1b[0m`
    + `。⚠ **相手先か回線の話。**⚠ **こちらのコードの不具合ではない**`
    + `。⚠ 並べ替えの回帰は test/search-check.mjs（fixture）が別に見ている`);
  process.exit(1);
}
console.log(`\n\x1b[32m話せた（${WORDS.length - ng} / ${WORDS.length} 語）\x1b[0m`
  + `。⚠ **見たのは疎通と形だけ。**⚠ 並び順は主張していない`);
