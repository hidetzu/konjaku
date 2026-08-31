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
import { ROOT, ok, bad, warn, head, HEAD_COMMENT, BLOCK_COMMENT,
         parseColor, contrast } from "./lib.mjs";

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

  // ⚠ **β と同じ D1 を使う**（2026-08-29。Owner 判断。`docs/adr/0073`）。
  //
  // ⚠ **前はここで「別の DB であること」を見ていた**（`docs/adr/0050` の「D1 を繋がない」）。
  //   ⚠ **その主張は、⚠ Owner 判断で取り下げた。**⚠ **取り下げた理由は ADR 0073。**
  //
  // ⚠ **見張りを外しっぱなしにしない**（`CLAUDE.md` §9: ⚠ **検査は守るべきことを固定する**）。
  //   ⚠ **同じ DB になっても、⚠ まだ守れるものが在る。**⚠ **そちらへ主張を移した。**
  //
  // ⚠ **行は混ざらないので、⚠ 計測への影響は無い**（2026-08-29。Owner 判断。⚠ 表が別）。
  //   ⚠ **検査で止められないのは枠のほうだけ**（⚠ 10万行/日・5GB は DB 単位）。
  //   ⚠ **いまは効かない**（⚠ 利用者がいない）。⚠ **ADR 0073 の「戻すとき」を回す合図にする。**
  const sameDb = (cfg.d1_databases ?? []).some((d) =>
    (base.d1_databases ?? []).some((b) => b.database_id === d.database_id));
  sameDb
    ? ok("v0.1.0 は β と同じ D1 を使う（⚠ Owner 判断。⚠ `docs/adr/0073`。⚠ 枠を共有する）")
    : ok("v0.1.0 は β と別の D1 を使う");

  // ⚠ **同じ DB を共有する以上、⚠ 「βの表に触らない」だけは機械で見る。**
  //   ⚠ **ここが破れると、⚠ 計測そのものが書き換わる**（⚠ 分母が壊れるどころではない）。
  const βの表 = ["tick", "health"];
  {
    const worker = join(ROOT, "worker-next.js");
    const mig = join(ROOT, "migrations");
    const 読む先 = [
      ...(existsSync(worker) ? [worker] : []),
      ...(existsSync(mig)
        ? readdirSync(mig).filter((f) => f.endsWith(".sql") && f !== "0001_tick.sql")
            .map((f) => join(mig, f))
        : []),
    ];
    if (!読む先.length) {
      warn("v0.1.0 側に、⚠ D1 を触るコードがまだ無い（⚠ この検査は何も見ていない）");
    } else {
      // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと注記の字面を拾う）
      const 触れている = [];
      for (const f of 読む先) {
        const body = readFileSync(f, "utf8")
          .replace(HEAD_COMMENT, "").replace(/^\s*--.*$/gm, "");
        for (const t of βの表) {
          if (new RegExp(`\\b(FROM|INTO|UPDATE|TABLE|JOIN)\\s+${t}\\b`, "i").test(body)) {
            触れている.push(`${relative(ROOT, f)} → ${t}`);
          }
        }
      }
      触れている.length
        ? bad(`v0.1.0 が βの表を触っている: ${触れている.join(" ／ ")}`
            + "（⚠ **同じ DB を共有しているので、⚠ 計測そのものが書き換わる**）")
        : ok(`v0.1.0 は βの表（${βの表.join(" / ")}）を触っていない（⚠ ${読む先.length} ファイルを見た）`);
    }
  }

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

    // ⚠ **`favicon.svg`**（2026-08-30。Owner 判断。⚠ 絵を見て決めた）。
    //   ⚠ **同じ道具の、⚠ 同じマーク。**⚠ **作り直すと 2 つになる**（`CLAUDE.md` §3）。
    //   ⚠ **中身は `public/favicon.svg` と 1 バイトも違わない**（⚠ 検査が突き合わせている）。
    //   ⚠ **これは「β 版の画面を前提にする」ではない。**⚠ **道具の名乗りは 1 つ。**
    "favicon.svg",

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

  // ---- ⚠ ⑧ 広い幅で、⚠ JavaScript が幅を見ていないか ----
  // ⚠ **一度、⚠ CSS と JavaScript の両方に切り替え点を書いた**（2026-08-29。⚠ 3 列にしたとき）。
  //   ⚠ **一覧を出したままにするか・根拠を開くかが、⚠ JavaScript の持つ状態だったため。**
  //   ⚠ **機械で突き合わせる検査も置いた**（`CLAUDE.md` §3）。
  //
  // ⚠ **3 列をやめた。**⚠ **スマホと同じ形を、⚠ そのまま中央に立てるだけにした。**
  //   ⚠ **JavaScript が幅を知る必要が無くなった。**⚠ **突き合わせるものが無くなった。**
  //   ⚠ **だから「同じか」ではなく「持たないか」を見る。**
  //   ⚠ **持たせると、⚠ また 2 か所に同じ数が生まれる。**
  {
    const js = readFileSync(join(NEXT, "top.js"), "utf8");
    const 幅 = [...js.matchAll(/matchMedia\(\s*"\(m(?:in|ax)-width:\s*(\d+)px\)"\s*\)/g)]
      .map((m) => m[1]);
    幅.length
      ? bad(`v0.1.0 の JavaScript が幅を見ている（${幅.join("・")}px）。⚠ 見せ方は CSS の 1 か所で決める。⚠ 2 か所に同じ数を持たない`)
      : ok("v0.1.0 の JavaScript は、⚠ 幅を見ていない（⚠ 見せ方は CSS の 1 か所）");
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

  // ---- ⚠ ⑩ 色は 1 か所か。⚠ どの色みでも読めるか ----
  //
  // ⚠ **2026-08-30 に集めた**（⚠ `public-next/theme.css`）。⚠ **それまでは誰も測っていなかった。**
  //   ⚠ **`test/check/color.mjs` は `public/css/theme.css` しか読まない。**
  //   ⚠ **v0.1.0 の色は、⚠ コントラストの検査を 1 つも受けていなかった。**
  //   ⚠ **集めた結果、⚠ 3 つが下限を割っていた**（⚠ `--ink-3` 明 3.95 ／ `--line-strong` 明暗 2.1 台）。
  //
  // ⚠ **色の計算は `lib.mjs` が持つ。**⚠ **ここで持ち直さない。**
  {
    const THEME = join(NEXT, "theme.css");
    if (!existsSync(THEME)) bad("public-next/theme.css が無い（⚠ 色を 1 か所に集める先）");
    else {
      const css = readFileSync(THEME, "utf8").replace(BLOCK_COMMENT, " ");

      // ⚠ **色みごとに、⚠ 名前 → 値の表を作る。**⚠ **明るいが既定、⚠ 暗いは media の中。**
      const 明 = {}, 暗 = {};
      const 拾う = (chunk, into) => {
        for (const m of chunk.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
          const v = m[2].trim();
          if (parseColor(v)) into[m[1]] = v;
        }
      };
      const i = css.indexOf("@media");
      拾う(css.slice(0, i < 0 ? css.length : i), 明);
      Object.assign(暗, 明);
      if (i >= 0) 拾う(css.slice(i), 暗);

      // ⚠ **名前が色みどうしで揃っているか**（⚠ 欠けると、⚠ 前の色みの色がそこだけ残る）。
      //   ⚠ **重ねたあとで数えない。**⚠ **重ねると、⚠ 欠けた名前が明るい色みの値を継いで見えなくなる**
      //   （⚠ 2026-08-30 に実際にそうなった: ⚠ 暗い色みの `--line` を消しても素通りした）。
      //   ⚠ **だから、⚠ それぞれの節が「自分で宣言した名前」を数える。**
      const 宣言 = {};
      拾う(css.slice(0, i < 0 ? css.length : i), 宣言);   // ⚠ 明るい色みの宣言（＝ 明 と同じ）
      const 暗の宣言 = {};
      if (i >= 0) 拾う(css.slice(i), 暗の宣言);
      const 欠け = Object.keys(宣言).filter((k) => !(k in 暗の宣言));
      欠け.length
        ? bad(`暗い色みで宣言されていない色がある: ${欠け.join(" ")}`
            + "。⚠ **明るい色みの値がそこだけ残る**")
        : ok(`色の名前が 2 つの色みで揃っている（${Object.keys(宣言).length} 個）`);

      // ⚠ **色の値が theme.css の外に無いか**（`.claude/rules/css.md` の MUST）
      //   ⚠ **`mask-image` の中は見ない**（⚠ 色ではなく「隠す／出す」の指定）。
      const 外 = [];
      for (const f of readdirSync(NEXT).filter((f) => f.endsWith(".css") && f !== "theme.css")) {
        const t = readFileSync(join(NEXT, f), "utf8").replace(BLOCK_COMMENT, " ");
        for (const line of t.split("\n")) {
          if (/mask-image|url\(/.test(line)) continue;
          for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) 外.push(`${f}: ${m[0]}`);
        }
      }
      外.length
        ? bad(`色の値が theme.css の外にある: ${外.join(" / ")}`
            + "。⚠ **2 か所に持つと、⚠ 色みを足したとき片方だけ切り替わる**")
        : ok("色の値は theme.css にしかない（⚠ 画面の CSS には 1 つも無い）");

      // ⚠ **読めるか。**⚠ **地は 3 つ**（`--bg` `--surface` `--surface-2`）。
      //   ⚠ **いちばん厳しい地に対して測る。**⚠ **面の上のほうが厳しいことがある**
      //   （⚠ β で実際に踏んでいる: ⚠ 地だけで測ると惜しいだけに見えた）。
      const 地 = ["bg", "surface", "surface-2"];
      const AA = 4.5, 枠 = 3.0;
      const 悪い = [], 名乗り = [];
      for (const [色み, t] of [["明るい", 明], ["暗い", 暗]]) {
        for (const [名, 要る] of [["ink", AA], ["ink-2", AA], ["ink-3", AA], ["line-strong", 枠]]) {
          if (!t[名]) continue;
          const 値 = 地.filter((g) => t[g])
            .map((g) => contrast(parseColor(t[名]), parseColor(t[g])));
          const 最小 = Math.min(...値);
          名乗り.push(`${色み} --${名} ${最小.toFixed(2)}`);
          if (最小 < 要る) 悪い.push(`${色み}の --${名} が ${最小.toFixed(2)}（${要る} 未満）`);
        }
        // ⚠ **押せる色の上の文字は、⚠ 乗る相手に対して測る**（⚠ 地に対して測っても意味がない）
        if (t["action"] && t["action-ink"]) {
          const r = contrast(parseColor(t["action-ink"]), parseColor(t["action"]));
          名乗り.push(`${色み} --action-ink ${r.toFixed(2)}`);
          if (r < AA) 悪い.push(`${色み}の --action-ink が ${r.toFixed(2)}（${AA} 未満・乗る相手は --action）`);
        }
      }
      悪い.length
        ? bad(`v0.1.0 の色が下限に届いていない: ${悪い.join(" ／ ")}`)
        : ok(`v0.1.0 の色は、⚠ 3 つの地すべてで下限を満たす（${名乗り.join(" ／ ")}）`);

      // ⚠ **3 つの画面が theme.css を読んでいるか**（⚠ 読まないと、⚠ 色が 1 つも効かない）
      const 読まない = ["index.html", "take.html", "deep.html"]
        .filter((f) => existsSync(join(NEXT, f)))
        .filter((f) => !/href="\.\/theme\.css"/.test(readFileSync(join(NEXT, f), "utf8")));
      読まない.length
        ? bad(`theme.css を読んでいない画面がある: ${読まない.join(" ")}`)
        : ok("v0.1.0 の 3 つの画面が theme.css を読んでいる");
    }
  }

  // ---- ⚠ ⑪ 画面に、⚠ 誰も出さない部品が残っていないか ----
  //
  // ⚠ **`take.html` に「地図をひらく」が残っていた**（2026-08-31。⚠ 実際に踏んだ）。
  //   ⚠ **`hidden` を外す経路が 1 つも無く、⚠ 画面には一生出ない。**
  //   ⚠ **消し忘れは、⚠ 古いコメントと同じで、⚠ コードより強く誤誘導する**（`CLAUDE.md` §5）。
  //   ⚠ **読む側には「まだ使う予定のもの」に見える。**
  //
  // ⚠ **見るのは `id` だけ。**⚠ **class は見ない**（⚠ 当たっていない規則と区別できない）。
  // ⚠ **コメントは先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 注記の字面を参照に数える）。
  // ⚠ **検査は参照元に数えない。**⚠ **検査しか見ていない `id` は、⚠ 画面では死んでいる。**
  {
    // ⚠ **参照する側**: ⚠ 同じ画面の中（`aria-labelledby` / `for` / `href="#…"`）と、
    //   ⚠ **その器が読む JavaScript・CSS。**
    const コード = readdirSync(NEXT).filter((f) => /\.(js|css)$/.test(f))
      .map((f) => readFileSync(join(NEXT, f), "utf8")
        .replace(BLOCK_COMMENT, "").replace(HEAD_COMMENT, ""))
      .join("\n");

    const 死んでいる = [];
    for (const f of readdirSync(NEXT).filter((f) => f.endsWith(".html"))) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
        const id = m[1];
        const 同じ画面 = src.split(id).length - 1 > 1;   // ⚠ 自分の宣言を 1 つ差し引く
        if (!同じ画面 && !コード.includes(id)) 死んでいる.push(`${f}: #${id}`);
      }
    }
    死んでいる.length
      ? bad(`どこからも参照されていない id が在る: ${死んでいる.join(" / ")}`
          + "。⚠ **出す経路が無いなら消す**（⚠ 残すと「まだ使う」に読める）")
      : ok("v0.1.0 の画面に、⚠ 誰も出さない id は無い");
  }

  // ---- ⚠ ⑨ 見出しは「問いへの近さ」順で決まっているか ----
  // ⚠ **2026-08-31。Owner 判断。**⚠ **前は「確実性の高い順」だった**（`docs/adr/0030`）。
  //   ⚠ **常に取れる地形分類が見出しで、⚠ 明治期はその下の小さい行**だった。
  //   ⚠ **実測（2026-08-30・利用者役 5 名中 3 名。⚠ 実在の利用者ではない）**:
  //     ⚠ **春日部と軽井沢で「これは昔の答えではない」と読まれた。**
  //     ⚠ **春日部は「明治期は 田」を既に出していた。**⚠ **見出しでなかっただけ。**
  //
  // ⚠ **ブラウザを立てずに見る**（`public-next/answer.js` は DOM も地図も持たない）。
  //   ⚠ **実描画は「画面にそう出ているか」を見る。**⚠ **ここは「規則そのもの」を見る。**
  {
    const win = {};
    for (const f of ["words.js", "answer.js"]) {
      if (!existsSync(join(NEXT, f))) { bad(`v0.1.0 に ${f} が無い（⚠ この検査が何も見ていない）`); break; }
      new Function("window", "module", readFileSync(join(NEXT, f), "utf8"))(win, undefined);
    }
    const A = win.KonjakuAnswer, W = win.KonjakuWords;
    if (!A?.lines || !W?.groundGloss) {
      bad("KonjakuAnswer.lines か KonjakuWords.groundGloss を読めていない（⚠ この検査が何も見ていない）");
    } else {
      const fails = [];

      // ⚠ **① 明治期に区分があれば、⚠ それが見出し。**
      //   ⚠ **ここが残 3 の本体。**⚠ **春日部は答えを持っていたのに、⚠ 見出しでなかった。**
      const 春日部 = A.lines({ terrain: "氾濫平野・海岸平野", meiji: { value: "田" } });
      if (!/^明治期、ここは 田 でした$/.test(春日部.head))
        fails.push(`明治期の区分が見出しになっていない: ${春日部.head}`);
      if (春日部.head.startsWith("ここは、"))
        fails.push("明治期があるのに、⚠ 地形分類の言い方に戻っている（⚠ 確実性の順に逆戻り）");
      if (!春日部.sub.includes(W.groundGloss("氾濫平野・海岸平野")))
        fails.push(`成り立ちが 2 行目に降りていない: ${春日部.sub}`);

      // ⚠ **② 明治期が無くても、⚠ 地形分類が昔を名指すなら、⚠ それを見出しに使う。**
      //   ⚠ **2 行目に同じことを重ねない。**
      for (const 区分 of A.PAST_IN_TERRAIN) {
        const r = A.lines({ terrain: 区分, meiji: { none: "absent" } });
        if (r.head !== `ここは、${W.groundGloss(区分)}`)
          fails.push(`${区分}: 地形分類が昔を名指しているのに、見出しに使っていない: ${r.head}`);
        if (r.sub !== "") fails.push(`${区分}: 見出しと同じことを 2 行目でも言っている: ${r.sub}`);
      }

      // ⚠ **③ 昔の根拠が無いときは、⚠ なぜ無いかを状態ごとに言い分ける**（`docs/adr/0056`）。
      //   ⚠ **1 文にまとめない**（2026-08-31。Owner 判断）。⚠ 「取れなかった」と「無い」は別のこと。
      const 状態 = ["absent", "noClass", "unreachable"];
      const 出た = 状態.map((none) => A.lines({ terrain: "低地", meiji: { none } }).head);
      for (const [i, none] of 状態.entries()) {
        if (出た[i] !== A.MEIJI_NONE[none])
          fails.push(`${none}: MEIJI_NONE の字を使っていない: ${出た[i]}`);
        if (!出た[i]) fails.push(`${none}: 見出しが空（⚠ 何も言わないと、⚠ 何も起きていないように見える）`);
      }
      if (new Set(出た).size !== 状態.length)
        fails.push(`3 つの状態が同じ字になっている: ${出た.join(" ／ ")}`);
      // ⚠ **見出しは単独で読まれる。**⚠ 「なぜそう言える？」の行と違い、⚠ 主語を補うものが無い。
      for (const [none, 字] of Object.entries(A.MEIJI_NONE))
        if (!/明治期|この場所|この地域/.test(字)) fails.push(`${none}: 何の話か分からない字: ${字}`);

      // ⚠ **④ 昔を名指す区分の綴りが、⚠ 原典とずれていないか。**
      //   ⚠ **ずれると、⚠ 黙って ② が効かなくなる**（⚠ 一致しないだけなので、⚠ 誰も落ちない）。
      const 原典 = JSON.parse(readFileSync(join(NEXT, "data/landform.json"), "utf8")).classes ?? {};
      const 無い = A.PAST_IN_TERRAIN.filter((n) => !(n in 原典));
      if (無い.length) fails.push(`landform.json に無い区分名を見ている: ${無い.join("、")}`);

      // ⚠ **⑤ `top.js` が字を書いていないこと。**⚠ **3 状態すべてを `answer.js` から引く。**
      const TOP = readFileSync(join(NEXT, "top.js"), "utf8");
      for (const 字 of Object.values(A.MEIJI_NONE))
        if (TOP.includes(字)) fails.push(`top.js が answer.js の字を書き写している: ${字}`);
      for (const none of 状態)
        if (!TOP.includes(`"${none}"`)) fails.push(`top.js が ${none} の状態を作っていない`);

      fails.length
        ? bad(`見出しが「問いへの近さ」順になっていない: ${fails.join(" ／ ")}`)
        : ok(`見出しは「問いへの近さ」順（⚠ 明治期 → 昔を名指す ${A.PAST_IN_TERRAIN.length} 区分 → `
            + `無い理由 ${状態.length} 通り。⚠ 字は answer.js の 1 か所）`);
    }
  }

}
