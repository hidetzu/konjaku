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

// ⚠ **口は書かない**（2026-08-22。hidetzu/konjaku#181）。⚠ **本番の口を通して叩く。**
//   ⚠ **そうしないと、⚠ 「本番のコードで話せるか」を確かめたことにならない**
//   （⚠ 検査が自分で書いた通信で話せても、⚠ 出荷するコードが話せる保証にはならない）。
import { readFile } from "node:fs/promises";
const win = {};
new Function("window", "module",
  await readFile(new URL("../public/gsi-address-search.js", import.meta.url), "utf8"))(win, undefined);
const { createGsiAddressSearch } = win.KonjakuGsiAddressSearch;
const GAP_MS = 1500;
// ⚠ **少数でよい。**⚠ **大量に叩いて品質を測るのは、⚠ ここの目的ではない。**
const WORDS = ["渋谷", "新宿"];

let ng = 0;
const ok  = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const out = (m) => { ng++; console.log(`  \x1b[33m?\x1b[0m ${m}`); };

console.log(`\x1b[1m地理院の住所検索と話せるか（${WORDS.length}語）\x1b[0m`);
console.log("  ⚠ **たいていは相手先の話。**⚠ ただし ⚠ **こちらの口の不具合でも落ちる**");
console.log("  ⚠ **理由をそのまま出す。**⚠ 決めつけずに、⚠ 読んで切り分ける");

for (const w of WORDS) {
  try {
    // ⚠ **本番の口を、⚠ そのまま使う**（⚠ URL 組み立て・時間切れ・状態・形・再試行を通る）。
    const j = await createGsiAddressSearch({}).search(w);
    // ⚠ **形だけ見る。**⚠ **何位に何が来るかは見ない**（⚠ それは相手の都合で動く）。
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
    + `。⚠ **相手先・回線・こちらの口のどれか。**⚠ **上の理由を読んで切り分ける**`
    + `（⚠ 2026-08-22 に、⚠ ここでこちらの口の不具合を見つけた。`
    + `⚠ **決めつけていたら、⚠ 相手のせいにして見逃していた**）`
    + `。⚠ 並べ替えの回帰は test/search-check.mjs（fixture）が別に見ている`);
  process.exit(1);
}
console.log(`\n\x1b[32m話せた（${WORDS.length - ng} / ${WORDS.length} 語）\x1b[0m`
  + `。⚠ **見たのは疎通と形だけ。**⚠ 並び順は主張していない`);
