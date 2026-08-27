// 静的検査 — 出典（⚠ **借りたものを、⚠ 借りたと書いているか**）
//
// ⚠ **`test/check.mjs` の「4. 出典表記」と「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 27 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **ここが守っているもの**:
//     出典表記        ⚠ **地理院・OSM は、⚠ 表示が利用の条件**（⚠ 出さないと使えない）
//     `/peel` の出典  ⚠ **2 か所にある**（⚠ 地図の帰属表示と、⚠ 左パネル）。⚠ 機械で突き合わせる
//     LICENSES.md    ⚠ **配っているデータが、⚠ 全部 条件つきで載っているか**
//                     ⚠ **商用利用できないものは配らない**（ADR 0032）
//
// ⚠ **`links.mjs`（リンク）とは別。**⚠ あちらは ⚠ **行き先が生きているか。**
//   ⚠ こちらは ⚠ **相手の名前を出しているか。**
//
// ⚠ **`data.mjs`（配っている現物）とも別。**⚠ あちらは ⚠ **中身が食い違っていないか。**
//   ⚠ こちらは ⚠ **配ってよいものか。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, PUB, ok, bad, head, src, htmlFiles } from "./lib.mjs";

head("出典");

for (const f of htmlFiles) {
  const s = src[f];
  const gsi = s.includes("国土地理院");
  // OSM 建物を使うページだけ ODbL 表記が要る
  const usesOsm = s.includes("overpass") || s.includes("data/bl") || s.includes("-buildings");
  const osm = s.includes("OpenStreetMap");
  if (!gsi) bad(`${f}: 地理院タイルの出典表記が無い`);
  else if (usesOsm && !osm) bad(`${f}: OSM を使っているのに ODbL 表記が無い`);
  else ok(`${f}${usesOsm ? "（地理院＋OSM）" : "（地理院）"}`);
}

// ⚠ **配るデータは、商用利用できるものだけ**（2026-08-22 の Owner 判断。ADR 0032）。
//
// ⚠ **理由は「いつか稼ぐかもしれないから」ではない。**⚠ **いまの形と噛み合わないから。**
//   ⚠ 非商用のデータは「**複製物の再配布を除く**」と書かれていることがある
//     （国土数値情報の旧約款 第1条(b)）。⚠ **konjaku は public/data/ から配っている。**
//     ⚠ **無料で運営していても引っかかる。**
//   ⚠ しかも、あとから外すのが高い（共有カード・OGP・README まで届く。CLAUDE.md §6）。
//
// ⚠ **人の記憶では保たない。**⚠ 実際に LICENSES.md の表は両方向にずれていた
//   （2026-08-22 実測: 載せ忘れ 3 件／実体の無い行 2 件）。
//
// ⚠ **見張るのは 3 つ。**
//   a public/data/ の中身が、全部 LICENSES.md の表に載っている
//   b 表に載っていて、実体が無い行が無い（消したデータの行が残らない）
//   c 条件の欄に、禁じる語が入っていない
{
  const lic = await readFile(join(ROOT, "LICENSES.md"), "utf8");
  // ⚠ **表の行だけを読む。**⚠ 本文に出てくる `data/…` を拾わない
  const rows = [...lic.matchAll(/^\|\s*`data\/([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)]
    .map((m) => ({ path: m[1].replace(/\/$/, ""), what: m[2].trim(),
                   from: m[3].trim(), terms: m[4].trim() }));
  // ⚠ **実体。**⚠ `public/data/` の直下だけを見る（中の 1 枚ずつは表に書かない）
  const real = (await readdir(join(PUB, "data"))).sort();
  const listed = new Set(rows.map((r) => r.path));
  const fails = [];

  if (!rows.length) fails.push("LICENSES.md の配布データの表を読めない（この検査が何も見ていない）");
  // a 載せ忘れ
  for (const e of real) if (!listed.has(e)) fails.push(`${e} が LICENSES.md の表に無い`);
  // b 実体の無い行
  for (const r of rows) if (!real.includes(r.path)) fails.push(`LICENSES.md に ${r.path} の行があるが、実体が無い`);
  // c ⚠ **禁じる語。**⚠ 商用利用できないものを配らない
  //   ⚠ 「非商用」は konjaku では「配れない」と同義（再配布が除かれているため）
  const FORBIDDEN = ["非商用", "商用不可", "商用利用不可", "NonCommercial", "non-commercial"];
  for (const r of rows) {
    const hit = FORBIDDEN.find((w) => r.terms.includes(w) || r.from.includes(w));
    if (hit) fails.push(`${r.path} の条件に「${hit}」がある（配っているものは商用利用できるものだけ。ADR 0032）`);
    if (!r.terms) fails.push(`${r.path} の条件の欄が空（何に従って配っているか分からない）`);
    if (!r.from) fails.push(`${r.path} の出どころの欄が空（出典を書けない）`);
  }
  fails.length
    ? bad(`配っているデータの条件が掟どおりでない（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
    : ok(`配っているデータ ${real.length} 件は、全部 LICENSES.md に条件つきで載っている`
       + `（商用利用できないものは 0 件）`);
}

{
  // ⚠ **出典は 2 か所にある。同じ問いに答えるので、機械で突き合わせる**（掟3）。
  //   1) 地図の帰属表示 … peel3d.js の ATTR_GSI / ATTR_OSM から MapLibre が組む。**常に見えている側**
  //   2) 左パネルの「出典」 … 手書きの HTML。リンクを辿れる詳しい版
  //   ⚠ 片方だけ増やす・消すと、画面と画面で答えが変わる。
  //     実際に破れていた: OSM が peel3d.js 側に無く、**地図の帰属表示に OSM が出ていなかった**
  //     （2026-08-17。パネル側には書いてあったので、字面だけ見ると揃っているように見えた）。
  const j = src["peel3d.js"] ?? "", ph = src["peel.html"] ?? "";
  if (!j || !ph) bad("peel3d.js か peel.html が読めない（この検査が何も見ていない）");
  else {
    // peel3d.js の出どころ（ATTR_* の中身）
    // ⚠ **宣言があるだけでは足りない。実際に地図へ渡っているものだけを数える。**
    //   最初「const ATTR_* を宣言しているか」で見ていたら、名前を変えて
    //   `attribution:` から外しても緑のままだった（2026-08-17 に壊して気づいた）。
    const decl = new Map([...j.matchAll(/const (ATTR_\w+)\s*=\s*'([^']*)'/g)]
      .map((m) => [m[1], m[2]]));
    // `attribution: X` の X として使われている名前だけ拾う
    const used = new Set([...j.matchAll(/attribution\s*:\s*(ATTR_\w+|ATTR)\b/g)].map((m) => m[1]));
    // `const ATTR = ATTR_GSI` のような別名を1段だけ辿る
    for (const [k, v] of [...j.matchAll(/const (ATTR\w*)\s*=\s*(ATTR_\w+)\s*;/g)]
      .map((m) => [m[1], m[2]])) if (used.has(k)) used.add(v);
    const attrs = [...used].filter((k) => decl.has(k)).map((k) => ({ key: k, html: decl.get(k) }));
    const need = [
      { name: "国土地理院", why: "出典明示が利用の条件" },
      { name: "OpenStreetMap", why: "ODbL でクレジット必須" },
    ];
    const joined = attrs.map((a) => a.html).join(" ");
    const missJs = need.filter((n) => !joined.includes(n.name));
    // パネル側は、常に見えている側と**同じ名前**を出していること
    // ⚠ 正規表現で `</div>` まで取ろうとしたら、いちばん近い `</div>` が 600 文字より
    //   先にあって取れなかった（2026-08-17）。**索引で切り出す。**
    const anchor = '<div class="label">出典</div>';
    const at = ph.indexOf(anchor);
    const panel = at < 0 ? "" : ph.slice(at + anchor.length, at + anchor.length + 400);
    const missPanel = need.filter((n) => !panel.includes(n.name));
    // ⚠ ODbL は「© … contributors」の形が要る。名前だけでは足りない
    const noCopyJs = !/©/.test(joined), noCopyPanel = !/©/.test(panel);
    if (!attrs.length) bad("peel3d.js で attribution に渡している ATTR_* が無い（地図の帰属表示の出どころ）");
    else if (missJs.length)
      bad(`地図の帰属表示に ${missJs.map((n) => `${n.name}（${n.why}）`).join("・")} が無い`);
    else if (!panel) bad('peel.html の左パネルに「出典」の節が無い');
    else if (missPanel.length)
      bad(`左パネルの出典に ${missPanel.map((n) => n.name).join("・")} が無い（地図側にはある）`);
    else if (noCopyJs || noCopyPanel)
      bad(`ODbL のクレジット（©）が無い: ${noCopyJs ? "地図の帰属表示" : ""}${noCopyJs && noCopyPanel ? "・" : ""}${noCopyPanel ? "左パネル" : ""}`);
    else ok(`/peel の出典は 2 か所で一致（${need.map((n) => n.name).join("・")}／© つき）`
      + `／地図へ渡しているのは ${attrs.map((a) => a.key).join("・")}`);
  }
}
