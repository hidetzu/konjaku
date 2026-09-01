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

// ⚠ **求めるのは、⚠ 地理院タイルを読む画面だけ**（2026-09-01。`docs/adr/0080`）。
//   ⚠ **前は「全部の HTML が名乗ること」だった。**⚠ **β 版は 2 枚とも地図を出していた。**
//   ⚠ **v0.1.0 は 7 枚あり、⚠ 規約・保存一覧・受け取り口は地図を出さない。**
//   ⚠ **出典明示は「使ったから要る」ので、⚠ 使っていない画面にまで求めない。**
//
// ⚠ **読み込んでいる JavaScript まで辿る。**⚠ **タイルを引くのは `land.js` / `verify.js`**
//   （⚠ HTML 自身には URL が無い）。⚠ **辿らないと、⚠ 地図の画面まで「使っていない」に見える。**
{
  const 引く = new Set();
  for (const f of htmlFiles) {
    const s = src[f];
    const js = [...s.matchAll(/<script[^>]+src="\.\/([\w.-]+)"/g)].map((m) => m[1]);
    const 中身 = js.map((n) => src[n] ?? "").join("\n");
    if (/cyberjapandata\.gsi\.go\.jp|maps\.gsi\.go\.jp/.test(s + 中身)) 引く.add(f);
  }
  引く.size === 0 && bad("地理院タイルを読む画面が 1 枚も見つからない（⚠ この検査が何も見ていない）");
  for (const f of htmlFiles) {
    const s = src[f];
    // ⚠ **実行時に差し込む画面もある**（⚠ `/deep` は読んだ資料を JS で並べる）。
    //   ⚠ **だから読み込んでいる JavaScript の中も見る。**
    const js = [...s.matchAll(/<script[^>]+src="\.\/([\w.-]+)"/g)].map((m) => m[1]);
    const 名乗り = (s + js.map((n) => src[n] ?? "").join("\n")).includes("国土地理院");
    if (!引く.has(f)) { ok(`${f}（⚠ 地理院タイルを読まない画面）`); continue; }
    名乗り
      ? ok(`${f}（地理院）`)
      : bad(`${f}: 地理院タイルを読んでいるのに、⚠ 出典表記が無い（⚠ 出典明示は利用の条件）`);
  }
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
  // ⚠ **地図の上の帰属表示**（2026-09-01 に書き直した。`docs/adr/0080`）。
  //   ⚠ **前は β 版の MapLibre が組む `ATTR_*` を見ていた。**
  //   ⚠ **v0.1.0 は地図を手で組んでおり、⚠ MapLibre の帰属表示が付いてこない。**
  //   ⚠ **だから HTML に手で置いてある。**⚠ **置き忘れると、⚠ 何も出ない。**
  //
  // ⚠ **見るのは 3 つ**: ⚠ 字があること ／ ⚠ 一覧へ行けること ／ ⚠ 覆われていないこと。
  //   ⚠ **覆われていないことは実描画が見る**（`test/render/next.mjs`）。⚠ ここは配信物だけ。
  // ⚠ **OSM は見ない。**⚠ **v0.1.0 は建物を使わない**（⚠ 使い始めたら、⚠ ここに足す）。
  const ix = src["index.html"] ?? "";
  const 一覧 = "maps.gsi.go.jp/development/ichiran.html";
  const 帯 = /<p class="attrib">[\s\S]{0,300}?<\/p>/.exec(ix)?.[0] ?? "";
  !ix
    ? bad("index.html が読めない（⚠ この検査が何も見ていない）")
    : !帯
      ? bad("地図の上に帰属表示（.attrib）が無い（⚠ 出典明示は地理院タイル利用の条件）")
      : !帯.includes("国土地理院")
        ? bad(`帰属表示に「国土地理院」の字が無い: ${帯.slice(0, 60)}`)
        : !帯.includes(一覧)
          ? bad(`帰属表示から出典の一覧へ行けない（${一覧} が無い）`)
          : ok("地図の上の帰属表示は、⚠ 国土地理院を名乗り、⚠ 出典の一覧へ行ける"
             + "（⚠ 覆われていないことは実描画が見る）");
}
