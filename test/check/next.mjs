// 今昔 — ⚠ **v0.1.0 の器が、⚠ β 版と混ざっていないことを見る**（`docs/adr/0050`）。
//
// ⚠ **見るのは境界だけ。**⚠ **中身の作りは見ない**（⚠ まだ何も決まっていない）。
//
// ⚠ **なぜ要るか**: ⚠ **`public-next/` は静的検査の外にある。**
//   ⚠ **`public/` を見ている検査は 98 か所あるが、⚠ そのどれも `public-next/` を見ない。**
//   ⚠ **混ざっても、⚠ 誰も落とさない。**
//
// ⚠ **`tmp/next-konjaku.md` の決め事**: v0.1.0 は β 版の画面・機能・データ構成を前提にしない。
//   ⚠ **「引き継がない」は Owner 判断**（2026-08-28）。⚠ **運ぶなら、⚠ そのつど決める。**

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, ok, bad, warn, head, HEAD_COMMENT } from "./lib.mjs";

head("v0.1.0 の器");

const NEXT = join(ROOT, "public-next");
if (!existsSync(NEXT)) bad("public-next/ が無い（ADR 0050 の器）");
else {

  // ---- ⚠ ① 別の Worker として立っているか ----
  const CFG = join(ROOT, "wrangler.next.jsonc");
  if (!existsSync(CFG)) bad("wrangler.next.jsonc が無い（ADR 0050）");
  else {
  const raw = readFileSync(CFG, "utf8");
  // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 注記の字面を拾う）
  const cfg = JSON.parse(raw.replace(HEAD_COMMENT, "").replace(/,(\s*[}\]])/g, "$1"));
  const base = JSON.parse(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8")
    .replace(HEAD_COMMENT, "").replace(/,(\s*[}\]])/g, "$1"));

  cfg.name && cfg.name !== base.name
    ? ok(`v0.1.0 は別の Worker（${cfg.name} ／ β は ${base.name}）`)
    : bad(`v0.1.0 の Worker 名が β と同じ（${cfg.name}）。⚠ 同じ名前だと β を上書きする`);

  cfg.assets?.directory === "./public-next"
    ? ok("v0.1.0 が配るのは public-next/ だけ")
    : bad(`v0.1.0 の配信元が public-next/ ではない（${cfg.assets?.directory}）`);

  // ⚠ **β の D1 を繋いでいないか。**⚠ 繋ぐと、⚠ **計測の分母が壊れる**（`CLAUDE.md` §6）
  const sameDb = (cfg.d1_databases ?? []).some((d) =>
    (base.d1_databases ?? []).some((b) => b.database_id === d.database_id));
  sameDb
    ? bad("v0.1.0 が β と同じ D1 を繋いでいる。⚠ 計測が混ざり、⚠ 分母が壊れる")
    : ok("v0.1.0 は β の D1 を繋いでいない");

  // ---- ⚠ ② β 版のファイルを引き込んでいないか ----
  // ⚠ **「引き継がない」が Owner 判断。**⚠ **運ぶと決めたなら、⚠ ここの一覧に理由と一緒に書く。**
  const 運んでよいもの = [
    // ⚠ **足すときは「なぜ運ぶか」を必ず書く。**⚠ **惰性で増やさない。**
    //
    // ⚠ **区分の言い換え（GROUND_GLOSS・36 区分）**（2026-08-29。Owner 判断）。
    //   ⚠ **利用者役 4 名の実測から作られている**（2026-08-21。⚠ 初見の 1 名が
    //     「旧水部の意味が分からない」と言ったことが出発点）。
    //   ⚠ **36 / 36 の取りこぼし無しを、⚠ 検査が保っている**（⚠ 例外を作らないと決めてある）。
    //   ⚠ **原典（landform.json の why）との関係も決まっている**（⚠ 置き換えではない）。
    //   ⚠ **同じ問いに答えるものを 2 つ持たない**（`CLAUDE.md` §3）。⚠ 作り直すと 2 つになる。
    "words.js",

    // ⚠ **最初の縦切りで運ぶもの**（2026-08-29。Owner 指示。`docs/adr/0059` の実装フェーズ）。
    //   ⚠ **住所検索／現在地 → 地図 → 足元の地形分類 → 区分名と説明文、まで。**
    //   ⚠ **ピン・凡例・保存・PC 連携・D1 は入れない。**
    //
    // ⚠ **`verify.js`** ── ⚠ 地形分類を取り、⚠ 3 状態（ok / absent / unreachable）で返す。
    //   ⚠ **`docs/adr/0058` が決めた「取れなかった ≠ 無い」を、⚠ 既に実装している。**
    //   ⚠ **タイルの URL・ズームの落とし方（詳細版 z16 → 広域版 z13）も持つ**
    //     （⚠ `docs/adr/0057` で確かめた構造そのもの）。⚠ **作り直すと 2 つになる。**
    "verify.js",
    //
    // ⚠ **`land.js`** ── ⚠ 同じ土地の取得済みを控える。⚠ **同じ座標を 2 回取りに行かない。**
    //   ⚠ **β 版が実測で見つけた無駄を、⚠ 既に潰してある**（⚠ 遷移のたびに取り直していた）。
    "land.js",
    //
    // ⚠ **`gsi-address-search.js`** ── ⚠ 住所検索の口。⚠ **叩く場所は 1 か所と決めてある**
    //   （⚠ 静的検査が見張っている）。⚠ **作り直すと、⚠ その見張りの外に 2 つ目ができる。**
    "gsi-address-search.js",
    //
    // ⚠ **`esc.js`** ── ⚠ 外から来た字を画面に出す前に通す。⚠ **地名は地理院の応答。**
    //   ⚠ **こちらが中身を保証できないものを描く**ので、⚠ 必ず通す。
    "esc.js",
    //
    // ⚠ **`swale.js`** ── ⚠ **`verify.js` が要る**（⚠ 明治期の低湿地の画素を読む）。
    //   ⚠ **この縦切りでは、⚠ 低湿地はまだ画面に出さない。**⚠ **それでも要る。**
    //   ⚠ **依存を見落として、⚠ 実機で `KonjakuSwale is not defined` で止まった**
    //     （2026-08-29。⚠ **動かして初めて分かった**）。
    //   ⚠ **verify.js を分割して減らす手もあるが、⚠ それは「作り直す」ことになる。**
    //     ⚠ **同じ問いに答えるものを 2 つ持たない**（掟 §3）ほうを採る。
    "swale.js",
    //
    // ⚠ **`place-arg.js`** ── ⚠ URL の `?ll=` を読む。⚠ **判断は 1 か所と決めてある。**
    //   ⚠ **`ok` / `none` / `bad` の 3 つを分ける**（⚠ 「指定が無い」と「読めない」は別）。
    //   ⚠ **座標の桁も、⚠ ここ 1 か所が持つ**（⚠ 以前は 4 か所に散っていた）。
    //   ⚠ **実機で確かめるのに、⚠ その場所を開く手段が要る**
    //     （2026-08-29。⚠ **口が無くて、⚠ 6 か所を測ったつもりが全部豊洲だった**）。
    "place-arg.js",
    //
    // ⚠ **`data/landform.json`** ── ⚠ 区分の図式コード表。⚠ **`verify.js` が読む。**
    //   ⚠ **国土地理院の記述をそのまま写したもの**（⚠ こちらで書き換えない）。
    "data/landform.json",
  ];
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(NEXT);

  const 引き込み = [];
  for (const f of files) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    // ⚠ **`public/` の中を指す参照**（⚠ `../public/…` と、⚠ β の直下の js を名指しするもの）
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const v = m[1];
      if (/^\.\.\/public\//.test(v) || /\/public\//.test(v)) 引き込み.push(`${relative(ROOT, f)} → ${v}`);
    }
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g))
      if (/\.\.\/public\//.test(m[1])) 引き込み.push(`${relative(ROOT, f)} → ${m[1]}`);
  }
  const 未申告 = 引き込み.filter((x) => !運んでよいもの.some((a) => x.includes(a)));
  // ⚠ **「引き込んでいない」と言い切らない。**⚠ **許したものは引き込んでいる。**
  //   ⚠ **数えた字が、⚠ 実際に見たものと食い違ってはいけない**（`CLAUDE.md` §1）。
  const 許して引き込んだ = 引き込み.filter((x) => 運んでよいもの.some((a) => x.includes(a)));
  未申告.length
    ? bad(`v0.1.0 が β 版のファイルを引き込んでいる: ${未申告.join(" ／ ")}（⚠ 運ぶなら test/check/next.mjs の一覧に理由と一緒に書く）`)
    : ok(許して引き込んだ.length
        ? `v0.1.0 が引き込んでいる β 版のファイルは、⚠ 一覧に書いたものだけ（${許して引き込んだ.length} 件 ／ ⚠ ${files.length} ファイルを見た）`
        : `v0.1.0 は β 版のファイルを引き込んでいない（⚠ ${files.length} ファイルを見た）`);


  // ---- ⚠ ④ 配信物に、⚠ こちらの作業メモを載せていないか ----
  // ⚠ **2026-08-28 に実際に出した。**⚠ **HTML のコメントは、⚠ そのまま配信される。**
  //   ⚠ **`dev.konjaku.hidetzu.work` を開いたら、⚠ ADR の番号と、
  //   ⚠ 中で何を迷っているかが、⚠ 誰でも読める状態だった。**
  // ⚠ **ADR 自体は公開リポジトリにあるので秘密ではない。**
  //   ⚠ **問題は、⚠ 配信物にこちらの作業メモを載せていること**（`CLAUDE.md` §8-1 の筋）。
  // ⚠ **なぜそう書いたかは、⚠ `public-next/README.md` か ADR に置く。**
  const 作業メモの印 = /docs\/adr\/|Owner 判断|⚠ \*\*まだ何も決まっていない|CLAUDE\.md|\.claude\//;
  const 漏れ = [];
  for (const f of files) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    // ⚠ **コメントの中だけを見る**（⚠ 本文に出す語とは別の話）
    for (const m of src.matchAll(/<!--([\s\S]*?)-->/g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（HTML コメント）`);
    for (const m of src.matchAll(/\/\*([\s\S]*?)\*\//g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（ブロックコメント）`);
  }
  [...new Set(漏れ)].length
    ? bad(`v0.1.0 の配信物に、こちらの作業メモが載っている: ${[...new Set(漏れ)].join(" ／ ")}（⚠ 理由は public-next/README.md か ADR に置く）`)
    : ok("v0.1.0 の配信物に、こちらの作業メモが載っていない");


  // ---- ⚠ ⑤ 運んだファイルが、⚠ β 版とずれていないか ----
  // ⚠ **別 Worker なので、⚠ 複製せずに運ぶ手が無い**（`docs/adr/0050`）。
  //   ⚠ **掟 §3 は「やむを得ず持つときは、⚠ 機械で突き合わせる」と言っている。**⚠ **これがそれ。**
  // ⚠ **ずれたら落ちる。**⚠ **どちらかを直したら、⚠ もう片方も直す。**
  //   ⚠ **v0.1.0 の都合で変えたくなったら、⚠ **一覧から外して「作り直した」と書く**。**
  //   ⚠ **黙って別物にしない**（⚠ 片方だけ古くなるのが、⚠ いちばん危ない）。
  const ずれ = [];
  for (const 名 of 運んでよいもの) {
    const a = join(ROOT, "public", 名), b = join(NEXT, 名);
    if (!existsSync(b)) continue;              // ⚠ まだ運んでいないものは見ない
    if (!existsSync(a)) { ずれ.push(`${名}（⚠ β 版に無い）`); continue; }
    if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) ずれ.push(名);
  }
  const 運んだ数 = 運んでよいもの.filter((n) => existsSync(join(NEXT, n))).length;
  ずれ.length
    ? bad(`運んだファイルが β 版とずれている: ${ずれ.join(" ／ ")}（⚠ どちらかを直したら、⚠ もう片方も直す。⚠ 別物にするなら test/check/next.mjs の一覧から外す）`)
    : ok(`運んだ ${運んだ数} 本は、⚠ β 版と 1 バイトも違わない`);

  // ---- ⚠ ⑥ 出典明示が、⚠ 配信物に在るか ----
  // ⚠ **地理院タイルは、⚠ 出典明示が利用の条件**（`public/peel.html` にも同じことが書いてある）。
  // ⚠ **v0.1.0 は地図を手で組んでいるので、⚠ MapLibre の帰属表示が付いてこない。**
  //   ⚠ **2026-08-29 に、⚠ 出典が 1 つも出ていない状態で `develop` に入っていた。**
  //
  // ⚠ **ここが言えるのは「配信物に書かれている」まで。**
  //   ⚠ **「画面に見えている」は、⚠ 実描画が見ている**（`test/render/next.mjs`。2026-08-29 に足した）。
  //   ⚠ **こちらは、⚠ 実描画が回らない変更でも落ちる**（⚠ 文書だけを触ったときなど）。
  //   ⚠ **2 つで違うことを言っている。**⚠ **どちらも要る。**
  const 出典の先 = "maps.gsi.go.jp/development/ichiran.html";
  const 出典の字 = "国土地理院";
  const 出典あり = files.filter((f) => f.endsWith(".html")).filter((f) => {
    const t = readFileSync(f, "utf8");
    // ⚠ **リンクと字の両方を求める。**⚠ **URL だけだと、⚠ 何の出典か読めない。**
    return t.includes(出典の先) && t.includes(出典の字);
  });
  出典あり.length
    ? ok(`v0.1.0 の配信物に、地理院タイルの出典明示が書かれている（⚠ ${出典あり.length} ファイル。⚠ 見えていることは実描画が見ている）`)
    : bad(`v0.1.0 の配信物に、地理院タイルの出典明示が無い（⚠ 出典明示は利用の条件。⚠ ${出典の先} へのリンクと「${出典の字}」の字を、⚠ 覆われない場所に置く）`);

  // ---- ⚠ ⑦ 「言えないとき」の字を、⚠ 2 か所で使い回していないか ----
  // ⚠ **出典が違えば、⚠ 言えない理由も違う**（2026-08-29。Owner 判断）。
  //   ⚠ **足元と明治期が、⚠ どちらも「この場所は、まだ分類されていません」だった。**
  //   ⚠ **「なぜそう言える？」を開くと、⚠ 同じ文が 2 行並ぶ。**
  //
  // ⚠ **実描画では確かめられない**（2026-08-29 に踏んだ）。
  //   ⚠ **足元が「言えないとき」の字になるのは、⚠ 区分が無い場所だけ**で、
  //   ⚠ **ふつうの地点では、⚠ 比べる相手が答えの文になる**（⚠ 必ず違うので素通りする）。
  //   ⚠ **字そのものを見るほうが強い。**
  {
    const top = readFileSync(join(NEXT, "top.js"), "utf8");
    // ⚠ **「言えないとき」の字は 2 つの形で書かれている。**⚠ 両方を拾う
    const 字 = [
      ...[...top.matchAll(/<span class="none">([^<]+)<\/span>/g)].map((m) => m[1]),
      ...[...top.matchAll(/glossEl\.textContent\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
    ].filter((t) => !/\$\{/.test(t));   // ⚠ 差し込みのあるものは、⚠ 中身が場所ごとに変わる
    const 数 = new Map();
    for (const t of 字) 数.set(t, (数.get(t) ?? 0) + 1);
    const 重なり = [...数].filter(([, n]) => n > 1).map(([t]) => t);
    重なり.length
      ? bad(`v0.1.0 が、⚠ 「言えないとき」の字を 2 か所で使い回している: ${重なり.map((t) => `「${t}」`).join(" ／ ")}（⚠ 出典が違えば理由も違う。⚠ 同じ文が 2 行並ぶ）`)
      : ok(`v0.1.0 の「言えないとき」の字は、⚠ どれも 1 か所だけ（⚠ ${字.length} 通り）`);
  }

  // ---- ⚠ ③ 中身が無いとき、⚠ β 版へ戻る道が在るか ----
  // ⚠ **空の器を見せられた人が行き先を失わないように、⚠ β 版への道を求めていた**
  //   （`CLAUDE.md` §4-1: ⚠ **できないことを言うなら、⚠ 代わりにできることを添える**）。
  //
  // ⚠ **中身が入ったら、⚠ 求めない**（2026-08-29）。
  //   ⚠ **利用者役 3 名が全員、⚠ 「作りかけです。今昔（β）もあります」を問題にした**:
  //     ⚠ 「今出ている判定も当てにならないのかな、と疑った」
  //     ⚠ **「断言するなら作りかけと言わないでほしいし、⚠ 作りかけなら断言しないでほしい」**
  //     ⚠ 「押す前に気持ちが引ける」
  //   ⚠ **代わりにできることを添えるつもりが、⚠ 出している答えの信用を下げていた。**
  //   ⚠ **行き先が要るのは「見せるものが無いとき」だけ。**
  const 中身 = files.some((f) => /^(top|app|main)\.js$/.test(f.split("/").pop()));
  const 本文 = files.filter((f) => f.endsWith(".html")).map((f) => readFileSync(f, "utf8")).join("\n");
  中身
    ? ok("v0.1.0 に中身がある（⚠ β 版への行き先は求めない）")
    : /konjaku\.hidetzu\.work/.test(本文)
      ? ok("v0.1.0 は空の器だが、β 版へ戻れる")
      : warn("v0.1.0 が空の器なのに、β 版への行き先が無い（⚠ 見せられた人の行き場が無い）");
  }
}
