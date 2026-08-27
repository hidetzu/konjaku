// 静的検査 — 取り込み（⚠ **使わないものを、⚠ 取り込んでいないか**）
//
// ⚠ **落ちない。**⚠ **読む人が「この検査はこれを使うのだな」と誤解するだけ**
//   （hidetzu/konjaku#287。`CLAUDE.md` §5: ⚠ **古くなった記述は、コードより強く誤誘導する**）。
//
// ⚠ **どこから来たか**: ⚠ **大きなファイルを節へ割ると、⚠ 中身は出ていくのに取り込みは残る。**
//   ⚠ hidetzu/konjaku#232（`check.mjs` を 30 本で割った）で 23 件。
//   ⚠ hidetzu/konjaku#277（`top.mjs` / `peel.mjs` を 42 本で割った）で 51 件。
//   ⚠ **どちらも、⚠ 割った本人が気づかないまま残った。**⚠ **見張りが無かったから。**
//
// ⚠ **見る範囲は `test/` の下だけ**（hidetzu/konjaku#287 の Scope）。
//   ⚠ **`scripts/` は範囲の外**。⚠ **広げるときは Issue の Scope を先に動かす。**
//
// ⚠ **気をつけていること**:
//     コメントを先に落とす   ⚠ **落とさないと、⚠ コメント内の出現を「使っている」と数える**
//                            （⚠ `stripJs`。`CLAUDE.md` §5）
//     `as` は別名のほうを見る ⚠ `import { a as b }` で使うのは `b`
//     副作用の取り込みは数えない ⚠ `import "./x.mjs"` には名前が無い
//     取り込み行そのものを除く ⚠ **除かないと、⚠ 自分の宣言を「使っている」と数える**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, ok, bad, head, stripJs } from "./lib.mjs";

head("取り込み");

{
  // ⚠ **`git ls-files` ではなく実物を歩く**（⚠ 追跡前のファイルも見る。`CLAUDE.md` §9）
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".") || e.name === "node_modules") return [];
    const p = join(d, e.name);
    return e.isDirectory() ? walk(p) : (/\.m?js$/.test(e.name) ? [p] : []);
  });

  const rows = [];
  let files = 0, names = 0;
  for (const abs of walk(join(ROOT, "test"))) {
    const bare = stripJs(readFileSync(abs, "utf8"), relative(ROOT, abs));
    const got = [];
    // ⚠ **名前つき**: `import { a, b as c } from "…"`
    for (const m of bare.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g))
      for (const part of m[1].split(",")) {
        const t = part.trim();
        if (!t) continue;
        const as = /(\S+)\s+as\s+(\S+)/.exec(t);
        got.push(as ? as[2] : t);
      }
    // ⚠ **既定と名前空間**: `import x from "…"` ／ `import * as x from "…"`
    for (const m of bare.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s*["'][^"']+["']/g))
      got.push(m[1]);
    // ⚠ **取り込み行そのものを除いてから探す**
    const body = bare.replace(/^\s*import[\s\S]*?from\s*["'][^"']+["'];?/gm, "");
    const unused = got.filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
      .filter((n) => !new RegExp("\\b" + n.replace(/\$/g, "\\$") + "\\b").test(body));
    files++; names += got.length;
    if (unused.length) rows.push(`${relative(ROOT, abs)}: ${unused.join("、")}`);
  }

  rows.length
    ? bad(`取り込んだのに使っていない名前がある: ${rows.join(" ／ ")}`
        + `（⚠ 落ちない。⚠ **読む人が「これを使う」と誤解するだけ**）`)
    : ok(`test/ の ${files} ファイル・取り込み ${names} 名は、⚠ すべて使われている`);
}
