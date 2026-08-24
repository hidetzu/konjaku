// PR ごとに走らせる自動検査。
//
// 人が見るべきは「面白いか」だけにしたい。機械で確かめられることは機械に任せる。
// ここに入れているのは、すべて実際に踏んだ事故の再発防止:
//
//   1. 構文エラー                  … 壊れたまま本番へ出る
//   2. assets.directory が "."     … node_modules ごと上げてデプロイが落ちた
//   3. .html 参照                  … 本番は拡張子なしへ307転送される
//   4. 自己参照リンク              … 「年代を切り替えて見る」が自分自身を指していた
//   5. リンク切れ                  … 403 / 404 のURLを載せていた
//   6. 出典表記の欠落              … 地理院・OSM は表示が条件
//   7. OGP の欠落・ドメイン誤り    … 共有されないとループが閉じない
//   8. 事前計算データの索引切れ    … 黙って実行時 Overpass に落ち、作品が本番で成立しなくなる
//   9. Service Worker の版が古い   … 中身を変えても、一度来た人に古い画面が出続ける
//  10. 内部語が画面に出る          … 「自前・根拠あり」「直読み」が、説明なしで画面に出ていた
//
// 実行: node scripts/check.mjs        （--links を付けると外部URLも検査する）

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION_RE, hashOf, readSw } from "../scripts/sw-hash.mjs";
import { VERSION as BL_VERSION, unpack as blUnpack } from "../scripts/bl-format.mjs";
// ⚠ **数え方と読む先は `test/check/lib.mjs` の 1 か所**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **節を別ファイルへ出すには、⚠ どの節も使う道具を先に出す必要がある。**
//   ⚠ **`test/render/lib.mjs` と対になる置き方。**
import { ROOT, PUB, SITE, ok, bad, warn, head, tally, makeReport,
         htmlFiles, jsFiles, src, TOP, PAGE_JS, pageSrc } from "./check/lib.mjs";

// ⚠ **出した節の一覧**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **順番はここで決める。**⚠ **`readdir` の順に任せない**
//     （⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//   ⚠ **読み込むのは、⚠ 元の節があった位置**（⚠ 下のほう）。⚠ **並びを変えないため。**
//   ⚠ **漏れが無いことは「0. 数え方そのもの」が見る**（⚠ `test/check/` を実際に読む）。
const PARTS = ["links.mjs", "style.mjs", "safety.mjs", "deliver.mjs", "docs.mjs"];

// ⚠ **住所検索の口は `public/gsi-address-search.js` の1か所**（hidetzu/konjaku#181）。
//   ⚠ **この検査も写さない。**⚠ 本番の口に URL を組み立てさせて借りる。
const gsiSearchUrl = (q) => {
  const win = {};
  new Function("window", "module", readFileSync(new URL("../public/gsi-address-search.js",
    import.meta.url), "utf8"))(win, undefined);
  let seen = "";
  win.KonjakuGsiAddressSearch.createGsiAddressSearch({
    fetch: (u) => { seen = u; return Promise.resolve({ ok: true, json: async () => [] }); },
  }).search(q);
  return seen;
};


// 事物の索引の読み方。⚠ **ここ1か所**にする（z12 の束ごとに、中の z14 を1ビットずつ）。
//   写すと、索引の持ち方を変えたときに片方だけ直して、同じ問いに違う答えが出る。
const evCovered = (idx, tileOf) => (lon, lat) => {
  const t = tileOf(lon, lat, 14), S = Math.log2(idx.sub);
  const bx = t.x >> S, by = t.y >> S;
  const bit = 1 << (((t.y - by * idx.sub) * idx.sub) + (t.x - bx * idx.sub));
  return { t, on: !!((idx.tiles[`${bx}/${by}`] ?? 0) & bit) };
};

// ---------- 0. 数え方そのもの ----------
// ⚠ **この検査が壊れると、⚠ 全部の検査が黙って通る**（2026-08-24。⚠ **実際に起こした**）。
//   ⚠ `test/check/lib.mjs` を別ファイルへ出した直後、⚠ **`bad` が数えない形に壊したら、
//     ⚠ 検査が落ちているのに「問題なし」と出た。**
//   ⚠ **数える処理が 1 行で消せるうちは、⚠ 誰も捕まえられない。**
//
// ⚠ **本物には触らない。**⚠ **工場で新しく作って、⚠ 別の道で確かめる**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
head("0. 数え方そのもの");
{
  const fails = [];
  const yes = (c, what) => { if (!c) fails.push(what); };
  const said = [];
  const r = makeReport((m) => said.push(m));
  r.ok("a"); r.ok("b"); r.bad("x"); r.warn("w"); r.head("h");
  const t = r.tally();
  yes(t.passed === 2, `通った数が合わない: ${t.passed}`);
  yes(t.failed === 1, `落ちた数が合わない: ${t.failed}`);
  yes(t.warned === 1, `警告の数が合わない: ${t.warned}`);
  // ⚠ **落ちた理由を持っていること**（⚠ 数だけ持つ形に戻っていない証拠）
  yes(r.reasons().join() === "x", `落ちた理由を持っていない: ${JSON.stringify(r.reasons())}`);
  // ⚠ **印字と数が 1 対 1**（⚠ 片方だけ消えていない）
  yes(said.length === 5, `印字した行が合わない: ${said.length}`);
  yes(said.filter((m) => /✓/.test(m)).length === 2, "✓ の印が合わない");
  yes(said.filter((m) => /✗/.test(m)).length === 1, "✗ の印が合わない");
  // ⚠ **作るたびに別**（⚠ 貯めた行を共有していない）
  const r2 = makeReport(() => {});
  yes(r2.tally().passed === 0, "新しく作ったのに数が引き継がれている");
  // ⚠ **本物の数は、⚠ ここまでで 0 件でないこと**（⚠ 走者が生きている証拠）
  //   ⚠ この節はいちばん最初なので、⚠ **まだ 0**。⚠ だから見ない。
  // ⚠ **`bad()` で落とさない**（2026-08-24。⚠ **実際に素通りさせた**）。
  //   ⚠ **`bad` が壊れているとき、⚠ `bad` を使う検査では捕まえられない**（⚠ 自己参照）。
  //   ⚠ 実測: ⚠ `bad` を「印字するが貯めない」形にしたら、
  //     ⚠ **この節が落ちたのに、⚠ 走者は「問題なし」で終わった。**
  //   ⚠ **別の道で落とす**（`CLAUDE.md` §9）。⚠ **走者ごと止める。**
  //   ⚠ **汚い落ち方でよい。**⚠ ここが壊れているなら、⚠ **他の検査は全部信用できない。**
  if (fails.length) {
    console.log(`  \x1b[31m✗\x1b[0m 数え方が壊れている（${fails.length} 件）: ${fails.join(" / ")}`);
    console.log(`\n\x1b[31m⚠ 検査の数え方そのものが壊れています。`
      + `ここが壊れていると、⚠ すべての検査が黙って通ります。\x1b[0m`);
    process.exit(1);
  }
  ok("数え方は、貯めた行を数えている（印字と 1 対 1・作るたびに別・理由を持つ）");

  // ⚠ **出した節を、⚠ 1 つ残らず読み込んでいるか**（2026-08-24。⚠ **実際に起こした**）。
  //   ⚠ **読み込み忘れは落ちない。**⚠ **件数が減るだけなので、⚠ 人が数を覚えていないと気づけない。**
  //   ⚠ 実測: ⚠ `safety.mjs` の読み込みを消したら 218 → 200 件。⚠ **それでも「問題なし」。**
  // ⚠ **`test/check/` を実際に読む**（⚠ 一覧を書き写さない。⚠ **足したら自動で対象になる**）。
  //   ⚠ `lib.mjs` は道具なので、⚠ 節としては読み込まない。
  {
    const dir = join(ROOT, "test/check");
    const found = (await readdir(dir)).filter((f) => f.endsWith(".mjs") && f !== "lib.mjs").sort();
    const missing = found.filter((f) => !PARTS.includes(f));
    const ghost = PARTS.filter((f) => !found.includes(f));
    if (missing.length)
      bad(`test/check/ に、読み込んでいない節がある: ${missing.join("、")}`
        + `（⚠ 読み込み忘れは落ちない。⚠ 件数が減るだけ）`);
    else if (ghost.length)
      bad(`読み込もうとしている節が実在しない: ${ghost.join("、")}`);
    else if (!found.length)
      bad("test/check/ に節が 1 つも無い（⚠ この検査が何も見ていない）");
    else ok(`出した節 ${found.length} 件を、1 つ残らず読み込んでいる（${found.join("、")}）`);
  }
}

// ---------- 1. スクリプトの構文 ----------
head("1. スクリプトの構文");
for (const f of htmlFiles) {
  const blocks = [...src[f].matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  let bads = 0;
  for (const [, code] of blocks) {
    try { new (async () => {}).constructor(code); }
    catch (e) { bads++; bad(`${f}: ${e.message}`); }
  }
  if (!bads) ok(`${f}（${blocks.length} ブロック）`);
}
// ⚠ public/ の外にも、壊れると本番が止まるコードがある。
//   worker.js（計測の受け口）に構文エラーを入れても「問題なし」で通っていた。
//   あとから足したサーバ側が、丸ごと無検査だった。
// ⚠ **`serve.js` は `scripts/serve.mjs` へ移した**（2026-08-22。Owner 判断）。
for (const f of ["worker.js", "scripts/serve.mjs"]) {
  // ESM も import も含むので、Function で包むのではなく node 自身に読ませる
  try { execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" }); ok(f); }
  catch (e) { bad(`${f}: ${String(e.stderr ?? e.message).split("\n").slice(0, 3).join(" ")}`); }
}
// 外出しした .js（verify.js / places.js）。壊れると HTML 側が丸ごと止まるのに、
// インラインしか見ていなかったので素通りしていた
for (const f of jsFiles) {
  try { new (async () => {}).constructor(src[f]); ok(f); }
  catch (e) { bad(`${f}: ${e.message}`); }
}
// 読み込み忘れの検知。places.js は index.html の検索が依存している
for (const f of htmlFiles) {
  const needs = [...pageSrc(f).matchAll(/\b(KonjakuPlaces|Konjaku)\./g)].map((m) => m[1]);
  const wants = new Set(needs.map((n) => (n === "KonjakuPlaces" ? "places.js" : "verify.js")));
  for (const w of wants)
    src[f].includes(`src="./${w}"`) ? ok(`${f} → ${w}`) : bad(`${f}: ${w} を読み込んでいない`);
}

// ⚠ 判定の表を自前で持ち直していないか。
//   同じ 14区分表を verify.js / peel.html / eras.html / isekai.html の4箇所に置いていたため、
//   「通信断を『データ無し』と断定しない」を直したときに eras だけ取り残され、
//   実在するタイルについて「存在しないため判定できません」と断定し続けていた。
//   表そのものが消せない事情のあるページ（peel は自前の描画で使う）は許すが、
//   増やしたら気づけるように数を固定する。
{
  const marker = /251,\s*247,\s*176/;   // 明治期の低湿地「田」の色。表がある証拠
  // ⚠ **走査対象に、外の .js も入れる。** 以前は htmlFiles+jsFiles だけを見ていて、
  //   `build-water.js` に同じ表があることに気づけなかった（2026-08-17 に実測して寄せた）。
  // ⚠ **ルート直下から `scripts/` へ移した**（2026-08-22）。⚠ **走査から落とさない。**
  const outside = ["scripts/build-water.mjs", "scripts/check-tiles.mjs",
    "scripts/fetch-buildings.mjs", "scripts/serve.mjs"]
    .filter((f) => existsSync(join(ROOT, f)));
  const outsideSrc = Object.fromEntries(await Promise.all(
    outside.map(async (f) => [f, await readFile(join(ROOT, f), "utf8")])));
  // ⚠ **検査は `test/` へ移した**（2026-08-22。Owner 判断）。⚠ **両方を見る。**
  //   ⚠ **片方だけ見ると、⚠ 見ていないほうで静かに書き写される。**
  const codeDirs = ["scripts", "test", "test/render"];
  const codeFiles = (await Promise.all(codeDirs.map(async (d) =>
    (await readdir(join(ROOT, d)).catch(() => []))
      .filter((f) => f.endsWith(".mjs")).map((f) => `${d}/${f}`)))).flat();
  const scriptsSrc = Object.fromEntries(await Promise.all(
    codeFiles.map(async (f) => [f, await readFile(join(ROOT, f), "utf8")])));
  const all = { ...src, ...outsideSrc, ...scriptsSrc };
  const holders = Object.keys(all).filter((f) => marker.test(all[f]));
  // ⚠ **表があってよいのは swale.js だけ。** 借りる側は書き写さない
  const ALLOWED = ["swale.js"];
  const extra = holders.filter((f) => !ALLOWED.includes(f));
  extra.length
    ? bad(`明治期の 14 区分表を自前で持っている先が ${extra.length} 件ある: ${extra.join(", ")}`
        + `（public/swale.js に寄せること。分かれると片方だけ直し忘れる。`
        + `⚠ 実際 build-water.js が突き合わせから漏れていた）`)
    : ok(`明治期の 14 区分表を持つのは ${holders.join(" と ")} だけ（${Object.keys(all).length} ファイルを走査）`);

  // ⚠ 上は明治期の14色表しか数えていない。あとで足した地形分類の「水に由来する区分」の
  //   表は別物で、verify.js / share.js / index.html×2 の4箇所に複製されていた。
  //   isekai で踏んだのと同じ型なので、こちらも数を固定する。
  const wet = /["「]旧水部["」]/;
  const wetHolders = [...htmlFiles, ...jsFiles].filter((f) => wet.test(src[f]));
  const WET_MAX = 4;
  wetHolders.length > WET_MAX
    ? bad(`水に由来する区分の表が ${wetHolders.length} 箇所に増えている: ${wetHolders.join(", ")}`
        + `（verify.js から配るか、増やすならこの上限も一緒に上げて理由を書くこと）`)
    : ok(`水に由来する区分の表は ${wetHolders.length} 箇所（上限 ${WET_MAX}）`);
}

// ⚠ Service Worker が、判定に必要なものを取りこぼしていないか。
//   addAll は1件でも 404 すると install ごと reject するので、SHELL の中身は実在必須。
//   data/landform.json を足したとき SHELL に入れ忘れ、しばらく気づかなかった。
{
  const sw = src["sw.js"];
  if (!sw) { bad("sw.js が読めない"); }
  else {
    // ⚠ sw.js 全体から "/…" を拾ってはいけない。SHELL 以外のパス（タイルの判定など）まで
    //   SHELL の中身とみなして落ちる。**SHELL の配列だけ**を読む。
    const block = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw)?.[1] ?? "";
    if (!block) bad("sw.js の SHELL 配列が読めない");
    const shell = [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    // 判定が動くために要るもの。ここに足したら SHELL にも足すこと。
    // ⚠ esc.js は両ページがトップレベルで `const {esc}=KonjakuEsc` を読む。
    //   来ないと ReferenceError でページのスクリプトが丸ごと止まる（判定も検索も出ない）。
    //   esc.js を SHELL に足したとき、ここに足し忘れていた。
    //   実測（2026-08-15）: SHELL から "/esc.js" を消しても `npm run check` は
    //   「判定の依存が揃っている（10 件）」と緑で通った。
    const must = ["/", "/esc.js", "/verify.js", "/places.js", "/data/landform.json"];
    const miss = must.filter((m) => !shell.includes(m));
    miss.length ? bad(`sw.js の SHELL に入っていない: ${miss.join(", ")}`)
                : ok(`sw.js の SHELL に判定の依存が揃っている（${shell.length} 件）`);
    // SHELL に書いたものが本当に配信されるか（addAll が死ぬ条件）
    const gone = shell.filter((u) => {
      if (u === "/") return false;
      const rel = u.replace(/^\//, "");
      return !existsSync(join(PUB, rel)) && !existsSync(join(PUB, `${rel}.html`));
    });
    gone.length ? bad(`sw.js の SHELL に、配信されないものがある: ${gone.join(", ")}（addAll ごと死ぬ）`)
                : ok("sw.js の SHELL は全件が配信物にある");
  }
}

// ⚠ **判定文の根拠が、棚の対象に入っていること。**
//   「この場所は 旧水部 です」と言い切っている、その出どころ（地形分類）だけが
//   棚から漏れていた。漏れると**同じものを毎回取りに行く**（地理院タイルは
//   Cache-Control も Expires も返さない）。
//   ⚠ **`sw.js` の表を目で読んで確かめない。** verify.js が実際に使っているホストを
//     読んで突き合わせる。表に何が書いてあっても、**使っている側が入っていなければ意味がない**。
//   ⚠ 棚の対象は `public/sw.js` の TILE_HOSTS **1 か所だけ**が定義（cost.mjs はそこを読む）。
{
  const swSrc = await readFile(join(PUB, "sw.js"), "utf8");
  // ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う
  //   （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」）。
  // ⚠ **`//` を素朴に落とすと URL を食う。** `https://…` の `//` をコメント開始と読んで
  //   行末まで消してしまい、`const LFC = "https://maps.gsi.go.jp/xyz"` が空になった
  //   （2026-08-15 に実際に踏んだ。検査は「読めない」と言って落ちたので気づけた）。
  //   ⚠ **直前が `:` のときは落とさない。**
  const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const m = /TILE_HOSTS\s*=\s*\[([^\]]*)\]/.exec(bare(swSrc));
  const shelf = m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
  const vf = bare(await readFile(join(PUB, "verify.js"), "utf8"));
  const lfc = /LFC\s*=\s*["']https:\/\/([^/"']+)/.exec(vf)?.[1];
  if (!shelf?.length) bad("public/sw.js の TILE_HOSTS を読めない（この検査が何も見ていない）");
  else if (!lfc) bad("verify.js から地形分類のホストを読めない（この検査が何も見ていない）");
  else if (!shelf.includes(lfc))
    bad(`判定文の根拠（${lfc}）が棚に入らない。verify.js はここから地形分類を取っている`
      + `（「旧水部です」と言い切っている、その出どころだけが毎回取り直しになる）`);
  else ok(`判定文の根拠（${lfc}）が棚に入る（棚の対象 ${shelf.length} ホスト）`);

  // ⚠ **表を見るだけでは足りない。isTile() を実際に動かす。**
  //   配列に載っていても、`isTile` の中を壊せば棚に入らない（ホストの見方でも、
  //   パスの前置きでも）。**表だけ見る検査は、壊れた実装の上でも緑になる。**
  // ⚠ 代表 URL は思いつきで書かない。**verify.js が実際に組み立てる形**から作る。
  //   でないと「検査だけが通る URL」を相手にすることになる。
  if (shelf?.length && lfc) {
    const layer = /LFC_NAT\s*=\s*["']([^"']+)/.exec(vf)?.[1];
    const shape = /\$\{LFC\}\/\$\{layer\}\/\$\{z\}\/\$\{t\.x\}\/\$\{t\.y\}\.geojson/.test(vf);
    if (!layer) bad("verify.js から地形分類の層の名前を読めない（この検査が何も見ていない）");
    else if (!shape) bad("verify.js の地形分類 URL の組み立てが変わった（代表 URL を作り直すこと）");
    else {
      const { runInNewContext } = await import("node:vm");
      // sw.js は最上位で self.addEventListener を呼ぶ。動かすためだけの器を渡す。
      const sandbox = { self: { addEventListener() {} }, location: { origin: "" } };
      let fns = null;
      try { fns = runInNewContext(`${swSrc}\n;({ isTile, tileTtl })`, sandbox, { timeout: 3000 }); }
      catch (e) { bad(`public/sw.js を動かせない: ${String(e.message).slice(0, 80)}`); }
      if (fns) {
        const real = new URL(`https://${lfc}/xyz/${layer}/16/58205/25807.geojson`);
        const cases = [
          [real, true, "判定文の根拠（地形分類）"],
          [new URL(`https://${lfc}/development/ichiran.html`), false, "同じホストだが /xyz/ でないもの"],
          // ⚠ **口を書き写さない**（2026-08-22。hidetzu/konjaku#181）。⚠ 本番の口から借りる
          [new URL(gsiSearchUrl("x")), false, "住所検索"],
          [new URL("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/16/1/1.jpg"), true, "空中写真"],
        ];
        const wrong = cases.filter(([u, want]) => fns.isTile(u) !== want)
          .map(([, want, name]) => `${name}は${want ? "入るはず" : "入らないはず"}`);
        wrong.length
          ? bad(`sw.js の isTile() の判定が違う: ${wrong.join("、")}`
              + `（表に載っていても、isTile の中を壊せば棚に入らない）`)
          : ok(`sw.js の isTile() を実際に動かして確かめた（${cases.length} 通り）`);
        // 寿命も動かして見る。地形分類は 30 日（実測で 1 年以上更新が無い）
        const D = 24 * 60 * 60 * 1000;
        fns.tileTtl(real) === 30 * D
          ? ok("地形分類の寿命は 30 日")
          : bad(`地形分類の寿命が 30 日でない: ${fns.tileTtl(real) / D} 日`);
      }
    }
  }

  // ⚠ **cost.mjs が表を写していないこと。** 写すと、片方だけ足したときに
  //   「棚に入れるもの」と「数えるもの」がずれる（実際にずれていた）。
  const costSrc = bare(await readFile(join(ROOT, "scripts/cost.mjs"), "utf8"));
  /TILE_HOSTS\s*=\s*\[/.test(costSrc)
    ? bad("scripts/cost.mjs が TILE_HOSTS を写している（public/sw.js から読むこと。写すとずれる）")
    : ok("棚の対象の定義は public/sw.js の1か所だけ（cost.mjs はそこを読む）");
}

// ⚠ **「無い」と読んでよい応答は 404 だけ**（掟: 取れなかったを「無い」と言わない）。
//   403 は「見せてもらえなかった」であって「そこにデータが無い」ではない。
//   以前は 404 と同じ absent に丸めていたため、拒まれただけの土地に
//   「整備対象外」「標高データが無い」と書き、根拠に HTTP のステータスまで添えていた。
//   ⚠ ここが見るのは**コードの形だけ**。実際に画面が断定しないことは実描画で見る
//     （403 に差し替える 4 ケース）。静的検査だけで「確認済み」と呼ばない。
//   ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う
//     （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」）。
{
  const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // 条件は複数行にまたがる（`if (…)` と `return` が別の行）。畳んでから見る
  const flat = bare(await readFile(join(PUB, "verify.js"), "utf8")).replace(/\s+/g, " ");
  const conds = [...flat.matchAll(/if\s*\(([^)]*status[^)]*)\)\s*(?:\{[^}]*\})?\s*return\s*\{\s*state:\s*(\w+)/g)]
    .map(([, cond, state]) => ({ cond, state, codes: [...cond.matchAll(/status\s*===\s*(\d{3})/g)].map((m) => m[1]) }))
    .filter((c) => c.codes.length);
  const absent = conds.filter((c) => c.state === "ABSENT");
  const wrong = absent.filter((c) => c.codes.some((n) => n !== "404"));
  // ⚠ 0 件で緑にしない。分岐が消えても通ってしまう
  if (!absent.length)
    bad("verify.js に、HTTP のステータスから不在を決めている分岐が1つも無い（この検査が何も見ていない）");
  else if (wrong.length)
    bad(`verify.js が 404 以外を「無い」と読んでいる: ${
      wrong.map((c) => `${c.codes.join("/")} → ABSENT`).join("、")}`
      + `（403 は拒否であって、不在の証拠ではない）`);
  else
    ok(`不在と読むのは 404 だけ（verify.js の ${absent.length} 経路: 画像・GeoJSON・標高）`);
}

// ⚠ **出した節を読み込む**（2026-08-24。hidetzu/konjaku#232）。
//
// ⚠ **順番はここで決める。**⚠ **`readdir` の順に任せない**
//   （⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **読み込み忘れは、⚠ 落ちずに件数が減るだけ**（2026-08-24。⚠ **実際に起こした**）。
//   ⚠ 実測: ⚠ `safety.mjs` の読み込みを消したら、⚠ **218 → 200 件**になったのに
//     ⚠ **「問題なし」で緑のままだった。**
//   ⚠ **だから、⚠ 一覧に漏れが無いことを下で確かめる**（⚠ `test/check/` を実際に読む）。
for (const part of PARTS) await import(`./check/${part}`);

// ---------- 3. 内部リンク ----------
head("3. 内部リンク");
{
  const pages = new Set(htmlFiles.map((f) => basename(f, ".html")));
  // ⚠ **JS も見る**（2026-08-24。⚠ **実際に踏んだ**）。
  //   ⚠ **地図の CSS は、⚠ JS が動的に読み込んでいる**（`css.href="./vendor/maplibre-gl.css"`）。
  //   ⚠ **前は `index.html` のインライン `<script>` にあったので、⚠ HTML を見るだけで拾えていた。**
  //   ⚠ `top.js` へ出した瞬間、⚠ **この検査が静かに 1 件見なくなった**
  //     （⚠ 落ちない。⚠ **数が減るだけなので気づけない**）。
  //   ⚠ **`peel3d.js` も同じことをしている**（⚠ こちらは前から見ていなかった）。
  //   ⚠ **「全部緑」は、⚠ 何も変わっていないことの証明ではない**（`CLAUDE.md` §9）。
  for (const f of [...htmlFiles, ...jsFiles]) {
    const self = basename(f, ".html");
    // href="..." と href:`...` の両方（テンプレートリテラルで組む箇所がある）
    const refs = [...src[f].matchAll(/href[=:]\s*[`"]\.\/([^`"?#]*)/g)].map((m) => m[1]);
    for (const r of refs) {
      const ext = extname(r);
      // css/js/png などのアセットは、ページではなく実体の有無を見る
      if (ext && ext !== ".html") {
        await readFile(join(PUB, r))
          .then(() => ok(`${f}: ./${r}`))
          .catch(() => bad(`${f}: ./${r} が存在しない`));
        continue;
      }
      if (ext === ".html")
        bad(`${f}: ./${r} は拡張子付き。本番は /${basename(r, ".html")} へ307転送される`);
      const target = r.replace(/\/$/, "");
      if (target && !pages.has(target))
        bad(`${f}: ./${r} に対応するページが無い`);
      if (target === self)
        bad(`${f}: ./${r} は自分自身を指している`);
    }
  }
  ok("拡張子なし・実在・自己参照を検査済み");
}

// ---------- 3.5. 土地ごとの例外を作らない ----------
// ⚠ **以前ここは範囲索引（豊洲 1 件だけ）を見ていた**（2026-08-20 に外した）。
//   ⚠ 豊洲だけが専用の集計範囲・事前生成の水域・事前生成の建物を持ち、
//     ⚠ **1 つの土地だけが他と違う経路を通っていた**（掟: 同じ問いに答える実装を2つ持たない）。
// ⚠ **守りたかったこと（実行時 Overpass に黙って落ちない）は消していない。**
//   それは下の「タイル索引」と共通マニフェストの検査が見ている。
// ⚠ ここが見るのは、**その例外がもう一度生えてこないこと**。
head("3.5. 土地ごとの例外を作っていない");
{
  const gone = ["areas.json", "toyosu-buildings.geojson", "toyosu-water.geojson"];
  for (const f of gone)
    existsSync(join(PUB, "data", f))
      ? bad(`public/data/${f} が戻っている。1 つの土地だけが違う経路を通る`)
      : ok(`public/data/${f} は無い`);
  // ⚠ 読む側が生えていないか。**配っていないものを読みに行くと、静かに 404 を出し続ける**
  // ⚠ **コメントを先に落とす。**落とさないと、上の説明の字面をこの検査が拾う（CLAUDE.md §5）。
  let reads = 0;
  for (const [f, s2] of Object.entries(src)) {
    if (!/\.(js|html)$/.test(f)) continue;
    // ⚠ HTML のコメント（<!-- -->）も落とす。⚠ **落とさないと、何を外したかを
    //   説明した .html のコメントを、この検査自身が「読んでいる」と読む**（CLAUDE.md §5）
    const bare = s2.replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const g of gone)
      if (bare.includes(g)) { bad(`${f} が data/${g} を読もうとしている（もう配っていない）`); reads++; }
  }
  if (!reads) ok("公開物のどれも、消した 3 件を読みに行っていない");
}

// ⚠ **「この場所に 3D の下地があるか」に答える実装を、2 つ持たない**（掟6）。
//   トップは「この場所を深掘り」の導線を出すかどうかを、/peel は建物を静的に描けるかを、
//   **同じ答え**で決めている。別々に書くと、
//   **トップが「深掘りできる」と言った場所で /peel が Overpass に落ちる**状態が作れる
//   （＝出るか出ないかが相手次第。押しても何も起きない導線を置かない、に反する）。
//   ⚠ 判定の材料は 2 つある。どちらも ground.js だけが持つこと。
//     1) 集計する範囲（HALF_LON / HALF_LAT）  2) z14 タイル索引の引き方
head("3.6. 3D の下地の判定（public/ground.js の1か所）");
{
  const g = src["ground.js"];
  if (!g) bad("public/ground.js が無い（下地の判定の置き場所）");
  else {
    const needs = [
      ["HALF_LON", "集計する範囲（この値がずれると、導線を出したのに建物が出ない場所ができる）"],
      ["hasSync", "トップが同期で引く入口"],
      ["tilesFor", "/peel が読むタイルの並び"],
    ];
    const miss = needs.filter(([k]) => !g.includes(k));
    if (miss.length) bad(`ground.js に ${miss.map(([k, w]) => `${k}（${w}）`).join("・")} が無い`);
    else ok("ground.js が、範囲・トップ側の入口・/peel 側の入口を持っている");

    // ⚠ 使う側が、同じ判断を自分でも書いていないこと。
    //   ⚠ **コメントを先に落とす。** 落とさないと、この決まりを説明したコメントの字面を拾う
    //     （CLAUDE.md §5。2 回踏んでいる）。
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
      .replace(/<!--[\s\S]*?-->/g, "");
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const s = strip(src[f] ?? "");
      const own = [
        [/const\s*\{?\s*HALF_LON/, "範囲（HALF_LON）を自分で宣言している"],
        [/z14of\s*=/, "z14 タイルの求め方を自分で書いている"],
        [/bl\/index\.json/, "タイル索引の場所を直に書いている（assets.json 経由にする）"],
      ].filter(([re]) => re.test(s.replace(/const\s*\{HALF_LON,HALF_LAT\}\s*=\s*KonjakuGround/, "")));
      if (own.length) bad(`${f} が下地の判定を自分でも持っている: ${own.map(([, w]) => w).join("・")}`);
      else if (!s.includes("KonjakuGround")) bad(`${f} が KonjakuGround を使っていない（判定の出どころが不明）`);
      else ok(`${f} は ground.js の答えを使っている`);
    }
    // 読み込み忘れ。読み込まないと ReferenceError で画面が丸ごと止まる
    for (const f of ["index.html", "peel.html"])
      if ((src[f] ?? "").includes('src="./ground.js"')) ok(`${f} が ground.js を読み込んでいる`);
      else bad(`${f} が ground.js を読み込んでいない（KonjakuGround が未定義になる）`);
  }
}

// ⚠ **場所を探す口は 1 つ**（2026-08-18 方針）。
//   `/peel` は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
//   ⚠ ここに検索が生えると、2 つが同時に壊れる:
//     1) トップは **3D の下地がある場所にだけ**導線を出しているのに、
//        あちらの検索からは**下地の無い場所へ入れてしまう**（地図は動くのに建物が出ない）
//     2) 検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
//        （実際に破れていた: 2026-08-14 まで /peel だけ古い実装で、
//         取れなかったときに「見つかりませんでした」と書いていた）
//   ⚠ **並びを突き合わせる検査を、これで置き換えている。**
//     以前は「同じ応答ならトップと 3D の候補が一致する」で 2 実装のずれを見ていた。
//     実装が 1 つになったので、**2 つ目が生えないこと**を見るほうが強い。
head("3.7. 場所を探す口は 1 つ（トップだけ）");
{
  const strip = (s) => (s ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "");
  const ph = strip(src["peel.html"]), pj = strip(src["peel3d.js"]);
  const ui = [['id="q"', "検索欄"], ['id="cands"', "候補の置き場"],
              ['id="quick"', "クイック地点"], ['id="here"', "現在地"],
              ["findBox", "「別の場所を見る」の枠"]].filter(([k]) => ph.includes(k));
  const impl = [["KonjakuPlaces", "places.js の検索"], ["AddressSearch", "住所検索を直に叩いている"],
                ["createSearch", "検索の入れ物"]].filter(([k]) => pj.includes(k));
  const loads = ph.includes('src="./places.js"');
  if (ui.length) bad(`peel.html に場所を探す口が残っている: ${ui.map(([, w]) => w).join("・")}`);
  else if (impl.length) bad(`peel3d.js に検索の実装が残っている: ${impl.map(([, w]) => w).join("・")}`);
  else if (loads) bad("peel.html が places.js を読み込んでいる（この画面に使う相手がいない）");
  else ok("/peel に場所を探す口が無い（場所を決めるのはトップ）");
  // ⚠ 「1 つ」なので、**トップ側は必ず持っている**こと。両方消えたら探せなくなる
  if (strip(TOP).includes("KonjakuPlaces")) ok("トップが places.js の検索を使っている");
  else bad("トップにも検索が無い（場所を探す手段が 1 つも無い）");
}

// ---------- 4. 出典表記 ----------
head("4. 出典表記");
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

// ⚠ **EraControlPanel の境界**（2026-08-22。hidetzu/konjaku#171。Owner 指定）。
//
// ⚠ **「HUD」という箱ではなく、⚠ `EraControlPanel` を切り出した。**
//   ⚠ 「HUD」だと、⚠ **また注意書き・建物情報・エラーが入ってくる**（実際に 3 回入った）。
//   ⚠ `EraControlPanel = 年代の表示と操作` なら境界が強い。
//
// ⚠ **見るのは 2 つ。**
//   a コンポーネントが、⚠ **禁じられた相手を 1 度も参照していない**
//   b ⚠ **画面が、コンポーネントの中の DOM を直接書いていない**
//
// ⚠ **「消した」だけの検査にしない**（`.claude/rules/testing.md`）。
//   ⚠ **口が生きていること**（画面が `createEraControl` を呼び、`update` を通ること）も見る。
{
  const fails = [];
  const js = src["components/era-control/era-control.js"]
    ?? await readFile(join(PUB, "components/era-control/era-control.js"), "utf8").catch(() => "");
  const peel = src["peel3d.js"] ?? "";
  if (!js) fails.push("era-control.js を読めない（この検査が何も見ていない）");
  if (!peel) fails.push("peel3d.js を読めない（この検査が何も見ていない）");

  // ⚠ **コメントは先に落とす**（CLAUDE.md §5。⚠ 説明の字面を検査が拾う事故を 3 回踏んでいる）
  const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const jsBare = bare(js), peelBare = bare(peel);

  // ---- a コンポーネントが触ってはいけない相手（Owner 指定の 5 つ）----
  const BANNED = [
    ["maplibregl", "MapLibre を直接操作している"],
    ["map\\.", "地図を直接操作している"],
    ["#land", "土地の答えの箱を書き換えている"],
    ["history\\.", "履歴を書き換えている"],
    ["location\\.", "URL を読み書きしている"],
    ["fetch\\(", "自分でデータを取りに行っている"],
  ];
  for (const [re, why] of BANNED)
    if (new RegExp(re).test(jsBare))
      fails.push(`era-control.js が ${why}（${re.replace(/\\/g, "")}）`);

  // ---- b 画面が、コンポーネントの中の DOM を直接書いていない ----
  // ⚠ **id を決め打ちで並べる。**⚠ 1 つでも直書きが残ると、状態が 2 か所に散る
  const INSIDE = ["rlYear", "rlSub", "rlTicks", "rlKnob", "rlPrev", "rlNext", "rlLeft", "rlRight",
                  "rlNote", "drum", "drumPos", "drumWrap", "track", "play"];
  for (const id of INSIDE)
    if (new RegExp(`getElementById\\("${id}"\\)`).test(peelBare))
      fails.push(`peel3d.js が #${id} を直接引いている（コンポーネントへ渡す）`);
  // ⚠ **年代のつまみ（#t）も同じ。**⚠ 値の正本は画面が持つが、⚠ **DOM は持たない**
  if (/getElementById\("t"\)/.test(peelBare)) fails.push("peel3d.js が #t を直接引いている");
  for (const w of ["slider.value", "slider.dispatchEvent", "playBtn.textContent"])
    if (peelBare.includes(w)) fails.push(`peel3d.js に ${w} が残っている`);

  // ---- ⚠ 口が生きていること（⚠ 「消した」だけにしない）----
  if (!/createEraControl\s*\(/.test(peelBare)) fails.push("peel3d.js が createEraControl を呼んでいない");
  if (!/\.update\s*\(/.test(peelBare)) fails.push("peel3d.js が update() を通っていない");
  if (!/g\.createEraControl\s*=/.test(jsBare)) fails.push("era-control.js が createEraControl を出していない");

  // ---- ⚠ 配られること（オフラインで年代 UI が消えない）----
  // ⚠ **動的キャッシュは直下の .js しか一致しない。**⚠ SHELL に無いと配られない
  const swTxt = src["sw.js"] ?? "";
  for (const f of ["/components/era-control/era-control.js", "/components/era-control/era-control.css"])
    if (!swTxt.includes(`"${f}"`)) fails.push(`sw.js の SHELL に ${f} が無い（オフラインで年代 UI が出ない）`);

  fails.length
    ? bad(`EraControlPanel の境界が破れている（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
    : ok(`EraControlPanel の境界は保たれている`
       + `（禁止 ${BANNED.length} 件 0／画面からの直書き ${INSIDE.length + 4} 件 0／口は生きている／SHELL に 2 件）`);
}

// ---------- 5. OGP ----------
head("5. OGP");
for (const f of htmlFiles) {
  const s = src[f];
  const miss = ["og:title", "og:description", "og:url", "og:image", "twitter:card"]
    .filter((k) => !s.includes(`"${k}"`));
  if (miss.length) { bad(`${f}: ${miss.join(", ")} が無い`); continue; }
  const url = s.match(/og:url"\s+content="([^"]+)"/)?.[1] ?? "";
  if (!url.startsWith(SITE)) bad(`${f}: og:url のドメインが違う（${url}）`);
  else if (url.endsWith(".html")) bad(`${f}: og:url が拡張子付き（${url}）`);
  else ok(`${f}: ${url}`);
}
// ⚠ **名乗りが、外へ出る面のあいだで割れないこと。**
//   看板（index.html の h1）と、共有カード（share.js が canvas に描く文字）は
//   **別ファイルにあり、片方だけ直すと気づけない**。実際に割れていた:
//   看板は「カテゴリ名では何が起きるか分からない」として言い換えたのに、
//   共有カードだけが旧い名乗りのまま SNS へ配られていた。
//   ⚠ **止める検査が1つも無かった**ので、ここで突き合わせる
//   （掟「やむを得ず2つ持つときは、機械で突き合わせる」）。
{
  const idx = await readFile(join(PUB, "index.html"), "utf8");
  const shr = await readFile(join(PUB, "share.js"), "utf8");
  const h1 = /<h1>([^<]+)<\/h1>/.exec(idx)?.[1]?.trim();
  // ⚠ コメントを先に落とす。落とさないと、この決まりを説明したコメントの字面を拾う。
  //   ⚠ **`//` を素朴に落とすと URL を食う。** `https://…` の `//` をコメント開始と
  //     読んで行末まで消すため、**同じ行で読みたい値より前に URL があると読めなくなる**
  //     （実測 2026-08-15。`const LFC = "https://…"` を読む別の検査で実際に踏んだ）。
  //     ⚠ いまの share.js では起きないが、正しい版と誤った版を並べて置かない。
  //     直前が `:` のときは落とさない。
  const banner = /BANNER\s*=\s*"([^"]+)"/.exec(shr.replace(/(^|[^:])\/\/[^\n]*/g, "$1"))?.[1];
  if (!h1) bad("index.html から看板（h1）を読めない（この検査が何も見ていない）");
  else if (!banner) bad("share.js に BANNER が無い（共有カードの名乗りを追えない）");
  else if (h1 !== banner)
    bad(`名乗りが割れている: 看板「${h1}」/ 共有カード「${banner}」`
      + `（カード画像は SNS で単独に流れるので、ここが看板の代わりになる）`);
  else ok(`看板と共有カードの名乗りが揃っている（${h1}）`);
}
// ⚠ **SW が「古いものを返し続ける」経路を作らない。**
//   ⚠ Cache API は HTTP キャッシュの鮮度を自動では見ない。`must-revalidate` を付けても、
//   Cache API から返せば**そのまま古いものが出る**。ヘッダでは守られない。
//
//   ⚠ **見るのは「must-revalidate かどうか」ではない**（最初そう書いていて、理屈が粗かった）。
//   本当の条件は **版（VERSION）が変わらないまま、中身が変わりうるか**。
//
//     /data/**    毎回確認させる ＋ **版の材料に入っていない**（取り込みで書き換わる）
//                 → SW が持ってはいけない
//     /vendor/*   毎回確認させる ＋ **版の材料に入れてある**（scripts/sw-hash.mjs）
//                 → 中身が変われば版も変わり、activate で消える。持ってよい
//
//   ⚠ とくに /data/bl/ は、索引と本体が更新時に食い違うと**誤判定につながる**。
//   実際に食い違っていた（建物タイルが版のキャッシュに入り、版ごとに捨てて取り直していた）。
{
  const swSrc = await readFile(join(PUB, "sw.js"), "utf8");
  const hdr = await readFile(join(PUB, "_headers"), "utf8");
  // _headers から「毎回確認させる」と言っているパスを拾う
  // ⚠ **コメント（#）と空行を先に落とす。** 落とさないと、コメントを挟んだ次のブロックの
  //   Cache-Control を手前のパスのものとして拾う（実際に踏んだ: /vendor/* が
  //   immutable なのに must-revalidate と読めた。⚠ 検査が誤った警告を出していた）。
  const strict = [];
  let cur = null;
  for (const raw of hdr.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\//.test(line)) { cur = line.trim(); continue; }
    // ⚠ no-store も同じ側に入れる（＝持たせない。must-revalidate より強い約束）。
    //   /version.json がこれ。SW が持つと、古い版が「いまの本番」として読まれる。
    if (cur && /Cache-Control/i.test(line) && /must-revalidate|no-store/i.test(line)) strict.push(cur);
  }
  if (!strict.length) bad("_headers から must-revalidate / no-store のパスを読めない（この検査が何も見ていない）");
  else {
    // sw.js の判定を実際に動かす。**書いてある字面ではなく、動きで見る。**
    const { runInNewContext } = await import("node:vm");
    const sandbox = { self: { addEventListener() {} }, location: { origin: "" } };
    let fns = null;
    try { fns = runInNewContext(`${swSrc}\n;({ cacheable, SHELL })`, sandbox, { timeout: 3000 }); }
    catch (e) { bad(`public/sw.js を動かせない: ${String(e.message).slice(0, 80)}`); }
    if (fns) {
      // ⚠ **本当の条件は「版が変わらないまま中身が変わりうるか」。**
      //   最初は「must-revalidate なら SW に持たせない」と書いたが、**理屈が粗かった**
      //   （2026-08-16）。/vendor/ は must-revalidate だが、**版（VERSION）の材料に
      //   入れてある**ので、中身が変われば版も変わり、古いものは activate で消える。
      //   ⚠ 危ないのは「must-revalidate なのに、版の材料に入っていないもの」。
      //     /data/ がそれ（取り込みで書き換わるが、版は動かない）。
      // ⚠ **ソースから名前を拾わない。実際に材料になっている一覧をもらう。**
      //   以前はディレクトリ名で前方一致していたので、**/vendor/other.js を足すと
      //   材料に入っていないのに「版の材料」と判定していた**（2026-08-16 の指摘）。
      const { extraFiles } = await import("../scripts/sw-hash.mjs");
      const extra = (await extraFiles()).map((p) => "/" + p);
      const versioned = (u) => (fns.SHELL ?? []).includes(u) || extra.includes(u);
      // ⚠ 代表ファイルは**実在するもの**にする。/vendor/index.json のような
      //   存在しない名前で試すと、実態と違う判定になる。
      const { readdir } = await import("node:fs/promises");
      const samples = [];
      for (const pat of strict) {
        if (!pat.endsWith("*")) { samples.push(pat); continue; }
        const dir = pat.slice(1, -1);                     // "/vendor/*" → "vendor/"
        const names = await readdir(join(PUB, dir)).catch(() => []);
        // ⚠ そのディレクトリの**全ファイル**で試す。1つだけでは、後から足した分を見逃す。
        for (const n of names) samples.push(`/${dir}${n}`);
        if (!names.length) samples.push(pat.slice(0, -1) + "index.json");
      }
      const held = samples.filter((u) => fns.cacheable(u) && !versioned(u));
      held.length
        ? bad(`版の材料に入っていないのに、SW が版のキャッシュに入れる: ${held.join("、")}`
            + `（_headers は古いものを返さないと言っている。Cache API はヘッダの鮮度を見ないので、`
            + `版が動かないまま中身が変わると古いものが出続ける）`)
        : ok(`古いものを返さないと言っているもの（実ファイル ${samples.length} 本）のうち、`
            + `SW が持つのは版の材料に入っているものだけ（版の材料: ${extra.length} 本）`);
      // ⚠ 許可リストが**何も通さない**空振りになっていないこと
      fns.cacheable("/vendor/maplibre-gl.js")
        ? ok("版のキャッシュに入るものはある（/vendor/ が通る）")
        : bad("許可リストが何も通していない（この検査が何も見ていない）");
      // ⚠ **「/data/ は1つも版のキャッシュに入らない」と言ってはいけない。**
      //   /data/landform.json は SHELL に入っており、**同じ VERSION のキャッシュに入る**
      //   （install の addAll）。2026-08-16 に指摘されるまで、
      //   **検査が事実でないことを「確認済み」として表示していた**。
      //   ⚠ **動的に足す分（0 件）と、SHELL の例外（明示した分）を分けて言う。**
      const probes = ["/data/bl/index.json", "/data/ev/index.json", "/data/assets.json",
                      "/data/landform.json", "/data/quick-places.json"];
      const dyn = probes.filter((u) => fns.cacheable(u));
      dyn.length
        ? bad(`/data/ が版のキャッシュに**動的に**入る: ${dyn.join("、")}（取り込みで書き換わる。持たない）`)
        : ok("/data/ は、網からは1つも版のキャッシュに入らない（動的追加 0 件）");
      // SHELL 経由で入る /data/ は、**数えて名前で出す**。黙って 0 と言わない。
      const shellData = (fns.SHELL ?? []).filter((u) => u.startsWith("/data/"));
      // ⚠ SHELL に入れてよいのは「取り込みで書き換わらないもの」だけ。
      //   _headers が must-revalidate と言っているものが SHELL にあれば、それは矛盾。
      const shellStrict = shellData.filter((u) => strict.some((pat) =>
        pat.endsWith("*") ? u.startsWith(pat.slice(0, -1)) : u === pat));
      shellStrict.length
        ? bad(`SHELL に、毎回確認させるはずの /data/ がある: ${shellStrict.join("、")}`
            + `（版と一緒に配られるので、取り込みで書き換わるものを入れてはいけない）`)
        : ok(`SHELL 経由で版のキャッシュに入る /data/ は ${shellData.length} 件`
            + `（${shellData.join("、") || "無し"}。いずれも取り込みで書き換わらないもの）`);
    }
  }
}

// ⚠ **`immutable` と名乗るなら、中身が変わったら名前も変わること。**
//   ⚠ **いま `_headers` は `immutable` を付けていない**（2026-08-16 に外した）。
//   実ファイル名が maplibre-gl.js / .css で**固定**で、「中身が変われば名前が変わる」が
//   嘘だったため。**この検査は、いまは自動的に無効になる**（下の `if (!immutable)`）。
//
//   ⚠ **消さずに残しておく。** ファイル名をハッシュ付きにできた時点で `immutable` へ戻すが、
//   そのとき**この検査がまた効く**。immutable は「この URL の中身は二度と変わらない」という
//   約束で、ブラウザは1年間、確認すらしない。名前を変えずに中身を差し替えると、
//   **一度来た人は1年間、古い地図エンジンを使い続ける**。
{
  const { createHash } = await import("node:crypto");
  // 中身の指紋。⚠ 更新したらここも直す。**直さずに済ませられないのが要点。**
  const PINNED = {
    "maplibre-gl.js": "45a9b07a9189ce56",
    "maplibre-gl.css": "ab1e70d59ec40465",
  };
  const hdr = await readFile(join(PUB, "_headers"), "utf8");
  const immutable = /\/vendor\/\*[\s\S]{0,80}?immutable/.test(hdr);
  if (!immutable) ok("/vendor/ は immutable を名乗っていない（改名の縛りは無い）");
  else {
    const off = [];
    for (const [f, want] of Object.entries(PINNED)) {
      const buf = await readFile(join(PUB, "vendor", f)).catch(() => null);
      if (!buf) { off.push(`${f}（無い）`); continue; }
      const got = createHash("sha256").update(buf).digest("hex").slice(0, 16);
      if (got !== want) off.push(`${f}（${want} → ${got}）`);
    }
    off.length
      ? bad(`/vendor/ は immutable を名乗っているのに、名前を変えずに中身が変わった: ${off.join("、")}`
          + `（一度来た人は1年間、古いものを使い続ける。改名するか immutable をやめるか決めること。`
          + `決めたら test/check.mjs の PINNED を直す）`)
      : ok(`/vendor/ は immutable の約束を守っている（${Object.keys(PINNED).length} 本の中身が変わっていない）`);
  }
}

// ⚠ **住所検索を叩く実装は1か所だけ。**
//   以前は index.html と peel3d.js が同じものを持っていて、**実際に食い違っていた**
//   （/peel だけ時間切れも再試行も追い越し防止も無く、取れなかったときに
//   「見つかりませんでした」と書いていた）。揃え直したあとも「揃えてあるだけ」で、
//   片方だけ直す事故が起きうる状態だった（掟: 同じ問いに答える実装を2つ持たない）。
{
  const files = ["index.html", "peel.html", "places.js", "gsi-address-search.js", "peel3d.js", "verify.js", "events.js", "share.js", "esc.js", "sw.js"];
  const hits = [];
  for (const f of files) {
    const t = await readFile(join(PUB, f), "utf8").catch(() => "");
    // ⚠ コメントは落とす。落とさないと、この決まりを説明したコメントを拾う。
    //   ⚠ `//` を素朴に落とすと URL を食うので、直前が `:` なら落とさない。
    const bare = t.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const n = (bare.match(/AddressSearch\?q=/g) ?? []).length;
    if (n) hits.push(`${f}×${n}`);
  }
  // ⚠ **2026-08-22 に、⚠ 口を `gsi-address-search.js` へ切り出した**（hidetzu/konjaku#181）。
  //   ⚠ **期待する場所が変わっただけ。**⚠ 「1 か所だけ」という主張は変えていない。
  hits.length === 1 && hits[0].startsWith("gsi-address-search.js")
    ? ok(`住所検索を叩くのは gsi-address-search.js の1か所だけ（${hits[0]}）`)
    : bad(`住所検索を叩く箇所が1つでない: ${hits.join("、") || "0 か所"}`
      + `（画面ごとに持つと、片方だけ直す事故が起きる。gsi-address-search.js を使うこと）`);
}

// ⚠ **プライバシーの説明が、2 つの画面で割れないこと。**
//   / と /peel は**同じことをする**（どちらも判定すると URL に地名と座標を載せる）ので、
//   同じ約束をしなければならない。⚠ 実際、**peel には説明が1つも無かった**（2026-08-15）。
//   ⚠ 文言は HTML に直接書く。JS から差し込むと、**スクリプトが落ちたとき説明だけ消える**。
//   そのぶん 2 か所に同じ文字が並ぶので、ここで突き合わせる
//   （掟「やむを得ず2つ持つときは、機械で突き合わせる」）。
{
  const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  const grab = (src, attr) => {
    const m = new RegExp(`<div[^>]*\\b${attr}\\b[^>]*>([\\s\\S]*?)</div>`).exec(src);
    return m ? strip(m[1]) : null;
  };
  const idx = await readFile(join(PUB, "index.html"), "utf8");
  const peel = await readFile(join(PUB, "peel.html"), "utf8");
  // 畳まずに見える1行（トップ）。⚠ /peel は 2026-08-18 に**短い版**へ替えた（下）
  // ⚠ **2026-08-23 に、⚠ 見る対象を変えた**（Owner 判断）。
  //   ⚠ **前は「その箱に字がべた書きされていること」を見ていた。**
  //   ⚠ いまは中身が \`words.js\` の \`PRIVACY_SHORT\` から実行時に入るので、
  //     ⚠ **字は静的には読めない**（⚠ 読めないものを「確認済み」と呼ばない。CLAUDE.md §1）。
  //   ⚠ **だから、⚠ 静的に確かめられることだけを主張する**（⚠ 3 つ）:
  //     1) 箱がある  2) ⚠ **\`<details>\` の中に入っていない**  3) そこへ \`PRIVACY_SHORT\` を入れている
  //   ⚠ **2) は前より強い。**⚠ 前は「畳まずに見える」と名乗りながら、⚠ **畳みの中でも通った。**
  //   ⚠ **字が本当に出ているかは、⚠ 実描画（\`footer .f-priv\`）が見る。**
  {
    const fails = [];
    // ⚠ **コメントを先に落とす**（CLAUDE.md §5）。⚠ **落とさないと、⚠ この検査を説明する
    //   コメントに書いた \`<details>\` を、⚠ 検査自身が数える**（⚠ 2026-08-23 に実際に踏んだ）。
    const idxNoC = idx.replace(/<!--[\s\S]*?-->/g, "");
    const m = /<[a-z]+[^>]*\bdata-privacy-lead\b[^>]*>/.exec(idxNoC);
    if (!m) fails.push("箱（data-privacy-lead）が無い");
    else {
      // ⚠ **その箱より前にある \`<details>\` が、⚠ 箱より前に閉じているか**を数える。
      //   ⚠ 開いたままなら、⚠ **畳みの中にいる。**
      const before = idxNoC.slice(0, m.index);
      const opens = (before.match(/<details\b/g) ?? []).length;
      const closes = (before.match(/<\/details>/g) ?? []).length;
      if (opens > closes) fails.push("箱が <details> の中にある（畳むと、送る前に読めるとは言えない）");
      // ⚠ **そこへ PRIVACY_SHORT を入れているか**（⚠ 箱だけ残ると余白が増える）
      const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
      if (!id) fails.push("箱に id が無い（入れる側と結びつかない）");
      // ⚠ **箱は `index.html`、⚠ 入れる側は `top.js`**（2026-08-24 に JS を出した）。
      //   ⚠ **2 つを繋いで見る。**⚠ 利用者から見れば 1 つの画面。
      else if (!new RegExp(`${id}[\\s\\S]{0,300}PRIVACY_LEAD`)
        .test(`${idxNoC}\n${src["top.js"] ?? ""}`))
        fails.push(`箱（#${id}）へ PRIVACY_LEAD を入れていない`);
    }
    if (fails.length) bad(`index.html の畳まずに見える1行: ${fails.join(" / ")}`);
    else ok("index.html の畳まずに見える1行は、<details> の外にあり、PRIVACY_SHORT を入れている");
  }
  // ⚠ **/peel は短い版だが、3 段を落とさない。**
  //   2026-08-18 に、この画面から「サイト全体の情報」（作者・プライバシーの詳しい説明・
  //   データについて）を外した。⚠ **プライバシーをゼロにはしない。**
  //   この画面も判定すると URL に ?q=&ll= を載せるので、トップと同じことが起きる
  //   （2026-08-15 に「説明が1つも無い」を問題として直した経緯がある）。
  // ⚠ **1 段でも落ちると、いちばん強い約束だけが残って「通信していない」と読める。**
  //   それは 2026-08-15 に直した嘘へ戻ること。だから 3 段を項目で見る。
  // ⚠ 一字一句そろえない（短い版なので正当に違う）。**言っていることで見る。**
  // ⚠ **2026-08-20 に、字は words.js の PRIVACY_SHORT へ寄せた。**
  //   ⚠ **HTML の中の字ではなく、実際に出る文で見る。**
  //   ⚠ 併せて、⚠ **2 画面が同じ 1 か所から出しているか**も見る（写しを作らせない）。
  {
    const NEED3 = [
      [/URL|アドレス欄/, "調べた場所が URL に載ること（載る）"],
      [/(Cloudflare|配信元)[^。]*(届|渡)/, "その URL を開くと配信元へ届くこと（届く）"],
      [/こちらの記録には[^。]*残りません|こちらの記録に[^。]*残りません/, "こちらの記録には残らないこと（残らない）"],
    ];
    // ⚠ **ここは words.js の読み込みより前の節。**⚠ 読まずに参照すると、
    //   ⚠ **「PRIVACY_SHORT が無い」と嘘の理由で落ちる**（2026-08-20 に踏んだ）。
    await import(`file://${join(PUB, "words.js")}`);
    const short = globalThis.KonjakuWords?.PRIVACY_SHORT ?? "";
    // ⚠ **出す箱が両方にあること。**箱が無ければ、文があっても画面には出ない
    const boxes = [
        ["peel.html", /data-privacy-short/.test(peel)],
        ["index.html", /id="privacyShort"/.test(idx)],
    ].filter(([, has]) => !has).map(([f]) => f);
    // ⚠ **入れる側が両方あること。**箱だけあって空だと、⚠ **余白だけが増える**
    // ⚠ **2026-08-23 に、⚠ トップだけ別の文になった**（Owner 判断）。
    //   ⚠ **トップの畳まずに見える 1 行は \`PRIVACY_LEAD\`**（いちばん強い約束 2 つ）。
    //   ⚠ **/peel の情報パネルは \`PRIVACY_SHORT\`**（載る → 届く → 残らないの 3 段）。
    //   ⚠ **なぜ違ってよいのかは \`public/words.js\` の \`PRIVACY_LEAD\` に書いてある。**
    //     ⚠ ここには写さない（⚠ 2 か所に書くと、片方だけ古くなる）。
    //   ⚠ **どちらも words.js の 1 か所から借りていること**は、ここで見る。
    const fills = [
        // ⚠ **入れる側は `top.js`**（2026-08-24）
        ["index.html", /privacyShort[\s\S]{0,300}PRIVACY_LEAD/.test(`${idx}\n${src["top.js"] ?? ""}`)],
        ["peel3d.js", /data-privacy-short[\s\S]{0,300}PRIVACY_SHORT/.test(
          await readFile(join(PUB, "peel3d.js"), "utf8"))],
    ].filter(([, has]) => !has).map(([f]) => f);
    // ⚠ **トップの 3 段は、⚠ 畳みの中（\`data-privacy-body\`）に必ず残っていること。**
    //   ⚠ **これが、⚠ 常時見える場所から 2 段落としたことの担保。**
    //   ⚠ **ここが落ちたら、⚠ 「載る」「届く」がトップのどこにも無くなる。**
    // ⚠ **NEED3 をそのまま使わない。**⚠ **緩すぎて、⚠ 別の文で通ってしまう。**
    //   ⚠ 2026-08-23 に実際に踏んだ: ⚠ **「調べた場所が配信元へ届く」の文を丸ごと消しても、
    //     ⚠ 「接続元の IP が配信元に届きます」が残っていて緑のままだった。**
    //   ⚠ **IP が届くことと、⚠ 調べた場所が届くことは別の主張。**
    //   ⚠ **1 つの文の中で、⚠ 場所（URL）と 届く先 が結びついていることまで見る。**
    const bodyIdx = grab(idx, "data-privacy-body") ?? "";
    const sentences = bodyIdx.split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
    const has = (...res) => sentences.some((t) => res.every((re) => re.test(t)));
    const bodyMiss = [
      [() => has(/調べた場所/, /URL|アドレス欄/, /入(り|ります)/),
        "調べた場所が URL に入ること（載る）"],
      // ⚠ **URL と 配信元 と 届く が、⚠ 同じ文の中にあること**（⚠ IP の文では通らない）
      [() => has(/URL|アドレス/, /配信|Cloudflare/, /届|渡/),
        "その URL を開くと配信元へ届くこと（届く）⚠ IP の文では代用できない"],
      [() => has(/こちらの記録に/, /残りません/),
        "こちらの記録には残らないこと（残らない）"],
    ].filter(([f]) => !f()).map(([, n]) => n);
    if (bodyMiss.length)
      bad(`index.html の畳みの中から、3 段が落ちている: ${bodyMiss.join("、")}`
        + "（⚠ 常時見える 1 行は 2026-08-23 に短くした。⚠ 3 段はここにしか残っていない）");
    else ok("index.html の畳みの中に、3 段（載る → 届く → 残らない）が全部ある");
    // ⚠ **常時見える 1 行が、⚠ いちばん強い約束 2 つを言っていること。**
    //   ⚠ **「どこにも送らない」へ広げていないこと**も見る（⚠ 2026-08-15 の嘘）。
    const lead = globalThis.KonjakuWords?.PRIVACY_LEAD ?? "";
    const leadNeed = [[/計測データに(は)?含めません|計測に[^。]*送/, "計測データに含めないこと"],
                      [/Cookie/, "Cookie を使わないこと"]];
    const leadMiss = leadNeed.filter(([re]) => !re.test(lead)).map(([, n]) => n);
    if (!lead) bad("words.js に PRIVACY_LEAD が無い（トップの畳まずに見える1行が空になる）");
    else if (leadMiss.length)
      bad(`PRIVACY_LEAD から約束が落ちている: ${leadMiss.join("、")}`);
    else if (/どこにも送(りません|らず)|一切送/.test(lead))
      bad("PRIVACY_LEAD が「どこにも送らない」まで言い切っている"
        + "（⚠ 調べた場所は URL に載り、開けば配信元へ届く。2026-08-15 に直した嘘）");
    else ok("トップの畳まずに見える1行は、強い約束 2 つを言い、言い切りすぎていない");
    const miss = NEED3.filter(([re]) => !re.test(short)).map(([, n]) => n);
    if (!short) bad("words.js に PRIVACY_SHORT が無い（両画面のプライバシーが空になる）");
    else if (boxes.length) bad(`プライバシーの 3 段を出す箱が無い: ${boxes.join("、")}`);
    else if (fills.length) bad(`プライバシーの 3 段を入れていない: ${fills.join("、")}（箱だけ残ると余白が増える）`);
    else if (miss.length)
      bad(`プライバシーの 3 段から段が落ちている: ${miss.join("、")}`
        + "（1 段でも落ちると、いちばん強い約束だけが残って「通信していない」と読める）");
    else ok("プライバシーの「載る → 届く → 残らない」は words.js の 1 か所で、2 画面が同じ文を出す");
  }
  // ⚠ **共有された状態を復元できなかったときの 1 行は、⚠ words.js の 1 か所**
  //   （2026-08-22。hidetzu/konjaku#169。掟 6: 同じ問いに答える実装を 2 つ持たない）。
  //   ⚠ **前はトップと /peel に、⚠ まったく同じ字がべた書きされていた。**
  //   ⚠ **見た目も別々に持っていて、⚠ すでに値がずれていた**（`.era-miss` と `#stateMiss`）。
  //     ⚠ 見た目のほうは hidetzu/konjaku#94・hidetzu/konjaku#95 の管轄。⚠ ここは字だけ見る。
  {
    const w = await readFile(join(PUB, "words.js"), "utf8");
    const pj = await readFile(join(PUB, "peel3d.js"), "utf8");
    const inWords = (w.match(/この土地には残っていません/g) ?? []).length;
    // ⚠ **画面側にべた書きが無いこと**（⚠ コメントは先に落とす。CLAUDE.md §5）
    const strip = (t) => (t ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, "");
    const leaked = [["index.html", strip(idx)], ["peel3d.js", strip(pj)]]
      .filter(([, t]) => /この土地には残っていません/.test(t))
      .map(([f]) => f);
    if (inWords !== 1)
      bad(`共有された年代の 1 行が words.js に ${inWords} 個ある（1 か所にする）`);
    else if (leaked.length)
      bad(`共有された年代の 1 行が画面側にべた書きされている: ${leaked.join("、")}`
        + "（words.js の 1 か所から借りる）");
    else ok("共有された年代の 1 行は words.js の 1 か所で、2 画面が借りている");
  }
  // ⚠ **サイト全体の情報を、この画面へ戻さない**（2026-08-18）。
  //   戻すなら、この検査を「何を守っていたか」を読んでから外すこと。
  //   ⚠ 「データについて」は、外した時点で**2 か所が事実と違っていた**
  //     （住所検索の説明＝この画面から検索を外した／範囲索引から建物を読む＝実測で読まれない）。
  {
    // ⚠ **コメントを先に落とす。**落とさないと、
    //   「何を外したか」を説明したコメントの字面を、この検査自身が拾う。
    //   ⚠ CLAUDE.md §5 の落とし穴。**3 回目**（2026-08-18 に踏んだ）。
    const peelNoComment = peel.replace(/<!--[\s\S]*?-->/g, "");
    // ⚠ **「データについて」は、⚠ 見出しとして丸ごとそれか**で見る（2026-08-22。hidetzu/konjaku#153）。
    //   ⚠ **守りたいのは「サイト全体のデータ説明が戻っていないこと」**で、
    //     ⚠ **その字を含む別の見出しまで塞ぐこと**ではない。
    //   ⚠ 実際に踏んだ: 台帳の節を「⚠ **表示データについて**」（⚠ 3D 表示の品質と由来）にしたら、
    //     ⚠ **部分一致でここが落ちた。**⚠ 中身はサイト全体の情報ではない。
    //   ⚠ **緩めてはいない。**⚠ 見出しがちょうど「データについて」なら、いままでどおり落ちる。
    const back = [["作 hidetzu", "作者（出典ではない）"],
                  ["data-privacy-body", "プライバシーの詳しい説明"]]
      .filter(([w]) => peelNoComment.includes(w));
    // ⚠ 見出しの中身が、前後の字を除いてちょうど「データについて」か
    if (/>\s*データについて\s*</.test(peelNoComment)) back.push(["データについて", "データの説明"]);
    back.length
      ? bad(`peel.html にサイト全体の情報が戻っている: ${back.map(([, n]) => n).join("・")}`
          + "（この画面は地図を触って見る道具。全文はトップのフッターが正本）")
      : ok("peel.html にサイト全体の情報を置いていない（作者・プライバシー全文・データ説明）");
  }
  // ⚠ 詳しい説明は**一字一句そろえない**（index には 🔊 の行があるなど、正当に違う）。
  //   ⚠ **だからといって「片方に URL の字があるか」で済ませない。**
  //   前の版はそれで「2つの画面で揃っている」と言っていた（2026-08-15 に指摘）。
  //   **説明が欠けても緑になる検査**だった。**項目ごとに、両方の画面で**見る。
  {
    const NEED = [
      [/URL|アドレス欄/, "調べた場所が URL に載ること"],
      [/(Cloudflare|配信)[^。]*(届|渡)/, "その URL を開くと配信元へ届くこと"],
      [/(数えて|計測)[^。]*回数/, "こちらが数えているのは回数だけであること"],
      // ⚠ **「地名か座標」で通さない。** `(地名|座標)` と書いていたので、
      //   片方だけ書いても通っていた（2026-08-15 に指摘）。**両方を要求する。**
      [/地名[^。]*含めて|地名も座標も含めて/, "地名を含めていないこと"],
      [/座標[^。]*含めて|地名も座標も含めて/, "座標を含めていないこと"],
      [/端末の中/, "★とメモが端末の中だけに残ること"],
      [/提供元に[はも、]?[^。]*座標が渡/, "提供元に表示に必要な座標が渡ること"],
      // ⚠ **配信元には IP と端末情報が届く**ことを隠さない。
      //   ここを書かないと「誰が・どこを調べたかは残らない」が**配信元も含めた断定**に読める。
      [/IP/, "接続元の IP が配信元に届くこと"],
      // ⚠ **確認したから書ける**ことも、消されたら気づけない。必須にする。
      //   実測: 場所つき URL は Worker を通らない（静的アセットに一致するため）ので、
      //   こちらが持つ Workers Logs には残らない。Logpush も使っていない（無料プランで項目が無い）。
      //   ⚠ wrangler.jsonc の observability の節に、崩れる条件を書いてある。
      [/ログにも場所は残りません|ログにも場所が残りません/, "こちらのログに場所が残らないこと"],
      [/Logpush/, "記録を外部へ出す設定を使っていないこと"],
    ];
    // ⚠ 詳しい説明は**トップだけが持つ**（2026-08-18。/peel からは外した）。
    //   ⚠ /peel 側は上の「3 段」で見ている。**両方で緩めない。**
    for (const [f, src] of [["index.html", idx]]) {
      const body = grab(src, "data-privacy-body");
      if (!body) { bad(`${f} に詳しい説明（data-privacy-body）が無い`); continue; }
      const missing = NEED.filter(([re]) => !re.test(body)).map(([, n]) => n);
      missing.length
        ? bad(`${f} のプライバシーの説明に書かれていないことがある: ${missing.join("、")}`)
        : ok(`${f} のプライバシーの説明に ${NEED.length} 点すべてある`);
      // ⚠ **主語のない断定を書かせない。**「誰が・どこを調べたかは1件も残しません」と
      //   書いていたが、**配信元も含めた断定に読める**（実測では配信元にクエリ・IP・
      //   User-Agent が届く）。「こちら」が主語だと分かる形にする。
      if (/(誰が|どこを)[^。]*残(しません|りません)/.test(body)
          && !/(こちら|自分)[^。]*(記録|数えて)[^。]*(誰が|どこを)|こちらの記録には/.test(body))
        bad(`${f} に主語のない「誰が・どこを調べたかは残しません」がある`
          + `（配信元も含めた断定に読める。実測では配信元にクエリ・IP・端末情報が届く）`);
      else ok(`${f} の「残しません」に主語がある`);
    }
  }
  // ⚠ **保持期間を書かせない。確認していない。**
  //   一度「アクセスの記録は事業者側で一定期間だけ保持されます」と書いたが、
  //   プラン・Logpush / Logpull・Workers Logs の設定を**見ていない**（2026-08-15 に指摘）。
  //   ⚠ **静的アセットは通常 Worker を経由しない**ので、Workers Logs（Worker 呼び出し単位）が
  //   そもそも当てはまらない可能性がある。掟「確認できないことを『検査済み』と呼ばない」。
  //   ⚠ **「届く」までは実測で言える**ので、そこで止める。確認できたらこの検査を外す。
  for (const [f, src] of [["index.html", idx], ["peel.html", peel]]) {
    // ⚠ /peel は短い版なので、そちらを見る。**どちらの画面でも保持期間を書かせない**
    const body = (grab(src, "data-privacy-body") ?? "") + (grab(src, "data-privacy-short") ?? "");
    /保持|保存期間|日間|ログに残/.test(body)
      ? bad(`${f} に、確認していない保持期間の話が書かれている`
          + `（プラン・Logpush・Workers Logs を見ていない。「届く」までに留める）`)
      : ok(`${f} は、確認していない保持期間を書いていない`);
  }
  // ⚠ **主語のない「サーバーには送りません」を、どちらの画面にも書かせない。**
  //   事実でない（調べた場所は URL に載り、開けば配信元へ届く）。
  //   ⚠ この検査を足す前は、**実描画がこの文言を必須にしていた**（誤りを固定していた）。
  for (const [f, src] of [["index.html", idx], ["peel.html", peel]]) {
    /サーバーには送りません/.test(strip(src))
      ? bad(`${f} に主語のない「サーバーには送りません」がある（URL に載る以上、事実でない）`)
      : ok(`${f} に主語のない「送りません」は無い`);
  }
}
{
  const { execFileSync } = await import("node:child_process");
  try {
    const result = execFileSync(process.execPath, ["scripts/generate-ogp.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    ok(result);
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    bad(`OGP の生成元と配信画像が食い違っている: ${detail}`);
  }
}


// ⚠ **ここから下は、⚠ まだ問いで分けていない**（2026-08-24。hidetzu/konjaku#232）。
//   ⚠ **元は「6. 外部リンク」という節名の下にあった。**⚠ **その名前は中身と合っていなかった**
//     （⚠ 49 件のうち、⚠ 外部リンクは 3 件だけ。⚠ 残りは CSS ／ 配っている現物 ／
//      ⚠ Domain を動かす ／ 秘密 …が積まれていた）。
//   ⚠ **名前を「外部リンク」のまま残さない。**⚠ **嘘の名前は、⚠ 次に足す人を迷わせる。**
//   ⚠ **正直な名前にする。**⚠ **次にやることが、⚠ 名前から分かる。**
head("6. まだ問いで分けていないもの");

// ---------- 結果 ----------
// ⚠ 同じ問いに答える実装が2つある（取り込みと実行時）。片方だけ型を足すと、
//   取り込み済みかどうかで答えが変わる。実際に precision・紀元前・枠外で起きた。
{
  const ing = await readFile("scripts/ingest-wikidata.mjs", "utf8").catch(() => "");
  const ev = src["events.js"] ?? "";
  const kinds = /const KINDS\s*=\s*\{([\s\S]*?)\};/.exec(ing)?.[1] ?? "";
  const a = [...new Set([...kinds.matchAll(/(Q\d+)\s*:/g)].map((m) => m[1]))].sort();
  const b = [...new Set([...ev.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]))].sort();
  if (!a.length || !b.length) bad(`型の一覧が読めない（取り込み ${a.length} / 実行時 ${b.length}）`);
  const only = (x, y) => x.filter((q) => !y.includes(q));
  const d1 = only(a, b), d2 = only(b, a);
  (d1.length || d2.length)
    ? bad(`取り込みと実行時で、拾う型が違う（取り込みだけ: ${d1.join(",") || "なし"} ／ `
        + `実行時だけ: ${d2.join(",") || "なし"}）`)
    : ok(`取り込みと実行時が、同じ型を拾っている（${a.length} 種）`);
}


// ⚠ Cloudflare の _headers は、一致した規則を**全部**適用して連結する。
//   「より細かい規則が勝つ」ではない。同じヘッダを2つの規則が書くと、
//   本番では `max-age=86400, max-age=0, must-revalidate` のように連結され、
//   どちらが効くかは実装依存になる（実測でそうなっていた）。
//   実ファイルに当てて、同じヘッダが二重に当たっていないかを見る。
{
  const { readFileSync: rfh, readdirSync: rdh, statSync: sth } = await import("node:fs");
  const lines = rfh("public/_headers", "utf8").split("\n");
  const rules = [];
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) { rules.push({ pat: raw.trim(), h: [] }); continue; }
    const i = raw.indexOf(":");
    if (i > 0 && rules.length) rules[rules.length - 1].h.push(raw.slice(0, i).trim().toLowerCase());
  }
  // _headers の * は / も跨いで一致する（/data/* が /data/ev/index.json に当たっていた）
  const re = (pat) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*") + "$");
  const pats = rules.map((r) => ({ ...r, re: re(r.pat) }));
  const files = [];
  (function walk(d, url) {
    for (const e of rdh(d)) {
      if (e === "_headers" || e === "_redirects") continue;
      const p2 = `${d}/${e}`;
      sth(p2).isDirectory() ? walk(p2, `${url}/${e}`) : files.push(`${url}/${e}`);
    }
  })("public", "");
  const clash = [];
  for (const f of files) {
    const hit = pats.filter((r) => r.re.test(f));
    const seen = new Map();
    for (const r of hit) for (const h of r.h) {
      if (h === "referrer-policy") continue;     // 全体に1つだけ書いてある。重ならない
      seen.has(h) ? clash.push(`${f}: ${h} が ${seen.get(h)} と ${r.pat} で二重`)
        : seen.set(h, r.pat);
    }
  }
  clash.length
    ? bad(`_headers の規則が重なっている（本番で連結され、どちらが効くか決まらない）:\n      `
        + clash.slice(0, 4).join("\n      ") + (clash.length > 4 ? `\n      ほか ${clash.length - 4} 件` : ""))
    : ok(`_headers の規則が重なっていない（${files.length} ファイルに当てて確認）`);
}

// ⚠ 建物のタイルが重くなりすぎないよう、上限を決めて見張る。
//   /peel は1画面で z14 を最大4枚読む。同じ画面が読む MapLibre 本体が gz 換算で
//   約1MB なので、**建物4枚で本体を超えない**ことを目安にする → 1枚 250KB。
//   実測（2026-08-14）: 詰める前は 1枚 473KB で、4枚だと 1.9MB。詰めて 199KB。
//   濃い土地を足したときに、また静かに超えていくので機械で押さえる。
{
  const { readFileSync: rfz, readdirSync: rdz, existsSync: exz } = await import("node:fs");
  const { gzipSync } = await import("node:zlib");
  const D = "public/data/bl/14", CAP = 250 * 1024;
  if (!exz(D)) bad("建物のファイルが無い");
  else {
    let worst = { f: "", gz: 0 }, n = 0, sum = 0;
    for (const x of rdz(D)) for (const f of rdz(`${D}/${x}`)) {
      if (!f.endsWith(".json")) continue;
      const gz = gzipSync(rfz(`${D}/${x}/${f}`)).length;
      n++; sum += gz;
      if (gz > worst.gz) worst = { f: `${x}/${f}`, gz };
    }
    const kb = (v) => `${Math.round(v / 1024)}KB`;
    worst.gz > CAP
      ? bad(`建物のタイルが重すぎる: ${worst.f} が gz ${kb(worst.gz)}（上限 ${kb(CAP)}）。`
          + "4枚読むと MapLibre 本体より重くなる。詰め方か配る単位を見直すこと")
      : ok(`建物のタイル ${n} 枚、いちばん重い1枚が gz ${kb(worst.gz)}（上限 ${kb(CAP)}／合計 ${kb(sum)}）`);
  }
}

// ⚠ 名乗りは、実装が実際にやっていることに合わせる。
//   OGP と title は共有先まで届くので、ここが実装とずれると**共有先で嘘をつく**。
//   実際にずれていた（2026-08-14）:
//     og:description「建物が消え、明治期の地形が現れる」← やめると決めた演出の説明
//     label「時間をさかのぼる（3D）」                  ← 時間を自由に動かせると約束
//   建物が年で消えるのを支えるデータは、10街40万件で建設年 0.30%（写真の帯なら 0.08%）。
//   PLATEAU も 4.94%（建築年は都市計画基礎調査の法定事項ではないので、待っても埋まらない）。
{
  const { readFileSync: rfn } = await import("node:fs");
  const BAN = [
    ["建物が消え", "やめると決めた演出を、名乗りが約束している"],
    ["時間をさかのぼる", "時間を自由に動かせると約束している（支えるデータが 0.30%）"],
    ["（3D）", "利用者は誰も「2D/3D」と言わなかった（利用者役のエージェントによる検証）"],
  ];
  for (const [file, where] of [
    ["public/peel.html", /<title>[\s\S]*?<\/title>|<meta[^>]*(og:|twitter:|name="description")[^>]*>/g],
    // ⚠ **2026-08-21 に、⚠ 名乗りの場所が `{id:"peel"…}`（一覧の行）→ `peelLens()` へ移った。**
    //   ⚠ 「この場所を深掘り」を行動一覧から判定カードの中へ移したため。
    //   ⚠ **見ているものは同じ**（⚠ 深掘りの名乗りが、実装とずれていないか）。
    ["public/top.js", /function peelLens\([\s\S]*?\n\}/g],
  ]) {
    const hay = (rfn(file, "utf8").match(where) ?? []).join(" ");
    if (!hay) { bad(`${file}: 名乗りの箇所が読めない`); continue; }
    const hit = BAN.filter(([w]) => hay.includes(w));
    hit.length
      ? bad(`${file} の名乗りが実装とずれている: `
          + hit.map(([w, why]) => `「${w}」（${why}）`).join(" / "))
      : ok(`${file.replace("public/", "")} の名乗りが、実装と食い違っていない`);
  }
}

// ⚠ peel3d.js の「送っている途中で画面が抜けない」を、実際に全位置で確かめる。
//   このコメントを peel.html に書いた時点では、**この検査は存在しなかった**（2026-08-14）。
//   「check.mjs が確かめている」と書いてあるだけで、LOOKAHEAD=0 にしても全件緑だった。
//   測っていないことを書かない、を検査自身が破っていた。書いたなら、作る。
//   ⚠ 写しではなく peel3d.js の本体を取り出して動かす（bl-format の照合と同じ手）。
//   ⚠ **段の数は地点によって変わる**ようになった（2026-08-16）。その地点に残っている
//     空中写真だけを段にするため、写真の段（明治期を除く）は
//     豊洲 8 / 広島 6 / 長崎 出島 3 になる。
//     → 段の数を1つ決め打ちして確かめるのではなく、**ありうる段数すべて**で見る。
{
  const { readFileSync: rfv } = await import("node:fs");
  const html = rfv("public/peel3d.js", "utf8");
  const m = /const LOOKAHEAD = (\d+)[\s\S]*?function visibleEras\(t, nPhoto\)\{([\s\S]*?)\n\}/.exec(html);
  const sw = /const swaleVisible = \(t, nPhoto\) => ([^;]+);/.exec(html);
  if (!m) bad("peel3d.js の visibleEras が読めない（この検査が何も見ていない）");
  else {
    // ⚠ 本体に return がある。さらに包むと構文エラーになる
    const fn = new Function("t", "nPhoto", "LOOKAHEAD", "preloadAll", m[2]);
    // 写真が1年代も残っていない地点（現在だけ）から、全年代が残っている地点まで。
    // ⚠ 年代の定義は verify.js の1か所だけなので、上限もそこから読む
    const vf = rfv("public/verify.js", "utf8");
    const nEras = (vf.match(/const ERAS = \[([\s\S]*?)\];/)?.[1].match(/\{ id:/g) ?? []).length;
    if (!nEras) bad("verify.js の ERAS を読めない（この検査が何も見ていない）");
    const holes = [], counts = [];
    for (let nPhoto = 1; nPhoto <= nEras + 1; nPhoto++) {
      const max = nPhoto * 100;      // 明治期は nPhoto 段目（＝写真の段の次）
      for (let v = 0; v <= max; v++) {
        const t = v / 100, i = Math.min(Math.floor(t), nPhoto - 1);
        const s = fn(t, nPhoto, +m[1], false);
        // 不透明度が 0 より大きい段（k===i と k===i+1）は必ず含まれること
        if (!s.has(i) || (i + 1 < nPhoto && !s.has(i + 1))) holes.push(`${nPhoto}段:${v}`);
        counts.push(s.size);
      }
    }
    const worst = Math.max(...counts);
    holes.length
      ? bad(`送っている途中で画面が抜ける位置がある（${holes.length} 箇所。例 ${holes.slice(0, 5)}）`)
      : worst > 2 + (+m[1])
        ? bad(`先読みが増えている（同時に ${worst} 段。上限 ${2 + (+m[1])}）。`
            + "国土地理院への枚数が静かに戻る")
        : ok(`年代の先読みが、1〜${nEras + 1} 段のすべて（${counts.length} 位置）で必要十分`
            + `（LOOKAHEAD=${m[1]}／同時 最大${worst} 段${sw ? "／明治期の重ねも定義あり" : ""}）`);
  }

  // ⚠ **年代の定義（id・ラベル・拡張子・ズーム範囲）を2か所に置かない。**
  //   置いていたときは、トップが「広島に残っているのは 5 年代」と正しく答えている横で、
  //   /peel が固定 8 段を出し、存在しない年代の写真タイルへ 404 を 202 件送っていた
  //   （2026-08-16 実測。長崎 出島では 491 件）。掟: 同じ問いに答える実装を2つ持たない。
  //   ⚠ コメントを先に落とす（説明に書いた年代IDを検査自身が拾うため）。
  {
    const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const ids = ["ort_riku10", "ort_USA10", "ort_old10", "gazo1", "gazo2", "gazo3", "gazo4"];
    const vf = bare(rfv("public/verify.js", "utf8"));
    const missing = ids.filter((id) => !vf.includes(id));
    if (missing.length) bad(`verify.js に年代の定義が無い: ${missing.join("、")}（この検査が何も見ていない）`);
    const dup = [];
    for (const f of ["peel3d.js", "index.html"]) {
      const s = bare(rfv(`public/${f}`, "utf8"));
      const hit = ids.filter((id) => s.includes(id));
      if (hit.length) dup.push(`${f}（${hit.join("、")}）`);
    }
    dup.length
      ? bad(`年代の定義が verify.js の外にもある: ${dup.join(" / ")}`
          + "（写しを持つと、トップと /peel が同じ地点に別の答えを出す）")
      : ok(`年代の定義は verify.js の1か所だけ（${ids.length} 年代）`);
  }
}

// ⚠ 掟は「番号」ではなく「名前」で引く。
//   以前はコードに「節番号」（章記号＋3.23 のような数）が141箇所あり、
//   削除済みの長文設計メモの節を指していた。
//   ただし調べると**参照ではなく引用**で、掟の中身はその場に書いてあった。
//   番号は誰にとっても意味を持たない文字列で、しかも文書を消すと宙に浮く。
//   → 名前で引く（`（掟: 取れなかったを「無い」と言わない）`）。番号に戻さない。
{
  const { readFileSync: rfk, readdirSync: rdk } = await import("node:fs");
  const files = [...rdk("public").filter((f) => /\.(html|js)$/.test(f)).map((f) => `public/${f}`),
    ...rdk("scripts").filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`),
    // ⚠ **検査は `test/` にある**（2026-08-22）。⚠ **ここを落とすと、⚠ 検査の中の §番号を見なくなる。**
    ...rdk("test").filter((f) => f.endsWith(".mjs")).map((f) => `test/${f}`),
    ...rdk("test/render").filter((f) => f.endsWith(".mjs")).map((f) => `test/render/${f}`), "worker.js"];
  const hit = [];
  for (const f of files) {
    let t = ""; try { t = rfk(f, "utf8"); } catch { continue; }
    const m = t.match(/§\d+\.\d+/g);
    if (m) hit.push(`${f}(${m.length})`);
  }
  hit.length
    ? bad(`節番号での参照が戻っている: ${hit.join("、")}。掟は名前で引くこと`)
    : ok(`掟は名前で引いている（節番号での参照は 0 件）`);
}

// ⚠ 3D のコードを SHELL に入れない。
//   SHELL の中身がそのまま版（ハッシュ）なので、入れると 3D を1行直すたびに
//   **全利用者のキャッシュが丸ごと飛ぶ**。MapLibre 1,032KB を SHELL から外した
//   判断（初回 250KB → 1,646KB になっていた）と同じ理由。
// ⚠ **コメントを先に落とす。** これを忘れると、SHELL の中のコメントに書いた
//   「maplibre を SHELL に入れない理由」という字面を、この検査自身が拾って落ちる。
//   実際に踏んだ（2026-08-15。MapLibre の実サイズをコメントに書いたとき）。
//   CLAUDE.md §5 が「検査が文書やコメントを読むときはコメントを先に落とす」と
//   書いているのは、これで3回目だから。
{
  const shell = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(src["sw.js"] ?? "");
  if (!shell) bad("sw.js の SHELL が読めない");
  else {
    const body = shell[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const hit = ["peel3d", "maplibre"].filter((w) => body.includes(w));
    hit.length
      ? bad(`SHELL に 3D 側のものが入っている（${hit.join("・")}）。`
          + "触るたび全利用者のキャッシュが飛ぶ")
      : ok("SHELL に 3D 側のものは入っていない");
  }
}

// ⚠ 建物の詰め方は、書く側（scripts/bl-format.mjs）と読む側（peel3d.js の
//   unpackBuildings）が対になっている。片方だけ直すと**建物の形が静かにずれる**
//   （画面は何も言わない）。同じ入力を両方に通して、同じ形になることを見る。
{
  const { readFileSync: rf3 } = await import("node:fs");
  const { pack, unpack, VERSION, HSRC } = await import("../scripts/bl-format.mjs");
  // 実際のタイルを1枚、両方の手順で戻して突き合わせる
  const src = JSON.parse(rf3("public/data/bl/14/14553/6453.json", "utf8"));
  const html = rf3("public/peel3d.js", "utf8");
  const v = /const BL_V=(\d+), BL_HSRC=\[([^\]]+)\]/.exec(html);
  if (!v) bad("peel3d.js の BL_V / BL_HSRC が読めない");
  else if (+v[1] !== VERSION)
    bad(`詰め方の版が食い違う: bl-format ${VERSION} / peel3d.js ${v[1]}`);
  else if (v[2].replace(/["\s]/g, "") !== HSRC.join(","))
    bad(`高さの出所の並びが食い違う: bl-format ${HSRC.join(",")} / peel3d.js ${v[2]}`);
  else {
    // peel3d.js の中身をそのまま関数にして動かす（写しではなく本物を測る）
    const body = /function unpackBuildings\(d\)\{([\s\S]*?)\n\}/.exec(html);
    if (!body) bad("peel3d.js の unpackBuildings が読めない");
    else {
      const fn = new Function("d", "BL_V", "BL_HSRC", body[1]);
      const a = fn(src, VERSION, HSRC);
      const b = unpack(src).features;
      const same = a.length === b.length && a.every((f, i) =>
        JSON.stringify(f) === JSON.stringify(b[i]));
      same ? ok(`建物の詰め方が、書く側と読む側で一致（${a.length} 件で照合）`)
        : bad("建物の詰め方が、書く側と読む側で食い違う（形が静かにずれる）");
    }
  }
}

// ⚠ 「未整備のときの振る舞い」を見る検査は、その土地が未整備であることに寄りかかっている。
//   取り込んだ瞬間、検査は外へ出なくなり、何も確かめずに必ず通るようになる。
//   索引に載ったらここで落とす（render.mjs の UNSURVEYED と同じ土地）。
{
  const { readFileSync: rf2, existsSync: ex2 } = await import("node:fs");
  const { tileOf } = await import("../scripts/db.mjs");
  const ip = "public/data/ev/index.json";
  if (!ex2(ip)) bad("事物の索引が無い");
  else {
    const idx = JSON.parse(rf2(ip, "utf8"));
    // 索引は z12 の束ごとに、中の z14 タイルを1ビットずつ立てて持っている（読み方は evCovered）
    const covered = evCovered(idx, tileOf);
    // ⚠ **道具は `scripts/render/lib.mjs` へ移った**（2026-08-22 に suite へ割った）。
    const m = /const UNSURVEYED = "ll=([\d.]+),([\d.]+)/.exec(rf2("test/render/lib.mjs", "utf8"));
    if (!m) bad("render/lib.mjs の UNSURVEYED が読めない（未整備の検査が土地を失っている）");
    else {
      const { t, on } = covered(+m[2], +m[1]);
      on ? bad(`未整備の検査に使っている土地（z14 ${t.x}/${t.y}）を取り込んでしまった。`
            + "この土地は外へ出なくなり、検査は何も確かめずに通る。別の土地に移すこと")
        : ok(`未整備の検査に使う土地が、まだ未整備（z14 ${t.x}/${t.y}）`);
    }
    // ⚠ ピンは入口。押した先が未整備だと、来た人が最初に見るのが
    //   「分かっていません」になる。取り込んだ範囲と、見せている入口を一致させる。
    //   候補地は画面のコードに重複させず、export-places.mjs が生成した公開データを正とする。
    const quickPath = join(PUB, "data", "quick-places.json");
    if (!existsSync(quickPath)) bad("quick-places.json が無い（候補地の公開データが生成されていない）");
    else {
      const pins = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
      const outside = pins.filter((p) => !covered(p.lon, p.lat).on);
      !pins.length ? bad("quick-places.json に候補地が1つも無い")
        : outside.length ? bad("未整備の土地をピン留めしている: "
            + outside.map((p) => p.name).join("、"))
        : ok(`quick-places.json のピン ${pins.length} 件は、すべて取り込み済みの土地`);
    }
    // ⚠ 建物の索引も見る。3D の入口は「建物が取れる」ことに寄りかかっている
    {
      const bp = "public/data/bl/index.json";
      if (!ex2(bp)) bad("建物の索引が無い");
      else {
        const bi = JSON.parse(rf2(bp, "utf8"));
        const HALF_LON = 0.0090, HALF_LAT = 0.0070;   // peel3d.js の集計範囲
        const quickPath = join(PUB, "data", "quick-places.json");
        const pins = existsSync(quickPath) ? JSON.parse(await readFile(quickPath, "utf8")).places ?? [] : [];
        const bad2 = pins.filter((p) => {
          const a = tileOf(p.lon - HALF_LON, p.lat + HALF_LAT, 14);
          const b = tileOf(p.lon + HALF_LON, p.lat - HALF_LAT, 14);
          for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++)
            if (!bi.tiles[`${x}/${y}`]) return true;
          return false;
        });
        bad2.length
          ? bad(`3D のピンが、押すと Overpass 待ちになる: ${bad2.map((p) => p.name).join("、")}`)
          : ok(`3D のピン ${pins.length} 件は、すべて建物まで取り込み済み`);
      }
    }
  }
}

// ⚠ 上限に当たったタイルでは、消えた判定をしてはいけない。
//   ここは実際に動かして確かめる（読んで確かめると、後で条件が入れ替わっても気づけない）
{
  const { toDrop } = await import("../scripts/db.mjs");
  const was = ["wd:Q1", "wd:Q2"], alive = new Set(["wd:Q1"]);
  const normal = toDrop(was, alive, 0), cut = toDrop(was, alive, 1);
  (normal.length === 1 && normal[0] === "wd:Q2" && cut.length === 0)
    ? ok("上限に当たったタイルでは、消えたことにしない（通常 1 件／上限 0 件）")
    : bad(`消えた判定が壊れている: 通常 ${JSON.stringify(normal)} / 上限 ${JSON.stringify(cut)}`);
}

// ⚠ 索引に載っているのに本体が無いと、画面は 404 を「未整備」と読んで外へ出る。
//   逆に本体があるのに索引に無いと、配ったのに一度も使われない。
//   取り込みとデプロイがずれた状態を、ここで止める。
{
  const { existsSync: ex, readFileSync: rf } = await import("node:fs");
  for (const [name, dir, kind] of [["事物", "public/data/ev", "ev"], ["建物", "public/data/bl", "bld"]]) {
    const ip = `${dir}/index.json`;
    if (!ex(ip)) { bad(`${name}の索引が無い: ${ip}`); continue; }
    let idx;
    try { idx = JSON.parse(rf(ip, "utf8")); }
    catch (e) { bad(`${name}の索引が読めない: ${e.message}`); continue; }
    const keys = Object.keys(idx.tiles ?? {});
    if (!keys.length) { bad(`${name}の索引が空`); continue; }
    const miss = [], broken = [];
    for (const k of keys) {
      const f = `${dir}/${idx.z}/${k}.json`;
      if (!ex(f)) { miss.push(k); continue; }
      try {
        const j = JSON.parse(rf(f, "utf8"));
        const [z, x, y] = j.tile ?? [];
        if (`${x}/${y}` !== k || z !== idx.z) broken.push(`${k}→${z}/${x}/${y}`);
      } catch { broken.push(`${k}(壊れている)`); }
    }
    miss.length ? bad(`${name}: 索引にあるのに本体が無い ${miss.length} 件（${miss.slice(0, 3).join(",")}）`)
      : broken.length ? bad(`${name}: 索引と中身が食い違う ${broken.slice(0, 3).join(",")}`)
      : ok(`${name}の索引と本体が揃っている（z${idx.z} ${keys.length} 件）`);
  }
}

// ⚠ 畳んだ <details> の中に、判定の結果を入れない。
//   実際にやった（2026-08-15）: パネルの「場所を探す」214px を <details> にしたとき、
//   同じ枠に入っていた #status を巻き込んだ。#status は検索の状態ではなく**判定の結果**で、
//   「建物 533 件を判定しました」「このエリアには明治期の低湿地データがありません」
//   「読み込めませんでした ＋ 再試行」まで全部そこに出る。
//   閉じた <details> の中身は innerText に出ない＝画面にも出ないので、
//   取れなかったことを言う文ごと消えた。実描画 9 件が落ちて気づいた。
//   ここで止めれば、ブラウザを起こす前に分かる。
{
  const { readFileSync: rf } = await import("node:fs");
  // 判定の結果を出す先。畳んだ中に入ってはいけない
  const RESULT_IDS = ["status", "result", "prov", "breakdown", "pick", "landAll", "placeName"];
  // ⚠ **その画面の JS も見る**（2026-08-24）。⚠ **`<details>` は JS も組み立てる。**
  //   ⚠ トップの JS を `top.js` へ出したら、⚠ **数えていた箱が 3 → 2 に減った。**
  //   ⚠ **落ちないので気づけない**（⚠ 「畳んだ中に結果が無い」と言い続ける）。
  // ⚠ **繋いで見ない。**⚠ 繋ぐと、⚠ **片方の閉じと片方の開きが跨いで「入れ子」に見える**
  //   （⚠ 2026-08-24 に実際に踏んだ。⚠ `peel.html` ＋ `peel3d.js` で偽陽性）。
  // ⚠ **ファイルごとに数えて、⚠ 画面として足す。**
  for (const [f, jsF] of [["public/peel.html", "public/peel3d.js"],
                          ["public/index.html", "public/top.js"]]) {
    // ⚠ コメントを先に落とす。落とさないと、この検査を説明するコメントに書いた
    //   `<details>` の字面を検査自身が拾って落ちる（実際に踏んだ）。
    //   コメントは画面に出ないので、見るべきでもない。
    // ⚠ **JS の側は、⚠ `//` と `/* */` も落とす**（`CLAUDE.md` §5）。
    //   ⚠ **落とさないと、⚠ この検査を説明したコメントの `<details>` を検査自身が拾う**
    //     （⚠ 2026-08-24 に実際に踏んだ。⚠ `peel3d.js` のコメント 2 か所で「入れ子」判定）。
    //   ⚠ `//` は `https://` を巻き込まない形で落とす。
    const parts = [f, jsF].map((x) => {
      const t = rf(x, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      return x.endsWith(".js")
        ? t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
        : t;
    });
    // <details> … </details> の中身を取り出す（入れ子は使っていない。使ったらここで気づく）
    const nested = parts.some((t) => /<details[^>]*>(?:(?!<\/details>)[\s\S])*<details/.test(t));
    if (nested) {
      bad(`${f}: <details> が入れ子になっている。この検査は入れ子を想定していない`); continue;
    }
    const inside = parts.flatMap((t) =>
      [...t.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1])).join("\n");
    const boxes = parts.reduce((a, t) => a + (t.match(/<details/g) ?? []).length, 0);
    if (!inside) { ok(`${f}: 畳む箱は無い`); continue; }
    const hit = RESULT_IDS.filter((id) => new RegExp(`id="${id}"`).test(inside));
    hit.length
      ? bad(`${f}: 判定の結果が畳んだ <details> の中にある（${hit.join(",")}）。閉じていると画面に出ない`)
      : ok(`${f}: 判定の結果は畳んだ中に無い（畳む箱 ${boxes} 個）`);
  }
}

// ⚠ 説明から「この画面では自明なもの」を落とす規則が、**本題まで落としていない**こと。
//   規則そのものは index.html にしかない（掟: 同じ問いに答える実装を2つ持たない）ので、
//   ここでは書き写さずに切り出して動かす。書き写すと、直したのに検査が古いままになる。
{
  const { readFileSync: rf } = await import("node:fs");
  const html = rf("public/top.js", "utf8");
  const a = html.indexOf("const ADMIN ="), b = html.indexOf("// ⚠ 記録の精度どおりに書く");
  if (a < 0 || b < a) bad("説明を落とす規則が index.html に見つからない（目印が変わった？）");
  else {
    const evDesc = new Function(`${html.slice(a, b)}; return evDesc;`)();
    // [説明, 名前, 期待]
    const CASES = [
      // 落とす（この画面では自明）
      ["広島市中区にある被爆建物", "旧日本銀行広島支店", "被爆建物"],
      ["日本の広島県広島市に所在する医療機関、広島原爆の爆心地として知られる", "島病院",
        "医療機関、広島原爆の爆心地として知られる"],
      ["広島市にある戦争遺構、世界遺産、旧広島県産業奨励館", "原爆ドーム",
        "戦争遺構、世界遺産、旧広島県産業奨励館"],
      // ⚠ 名前を読めば分かるものは出さない（読んでも増えない）
      ["東京都江東区にある小学校", "江東区立豊洲小学校", ""],
      ["東京都江東区にある中学校", "江東区立深川第五中学校", ""],
      // ⚠ ここから下は「落としてはいけない」側。壊れたら嘘になる
      //   「かつて」を落とすと、無くなったものが**いまあるもの**になる
      ["かつて仙台市にあった日本国有鉄道の貨物駅", "宮城野貨物駅",
        "かつて日本国有鉄道の貨物駅"],
      //   行政区画の接尾辞を必須にしていないと、ここまで落ちる
      ["広島原爆の爆心地にある慰霊碑", "慰霊碑", "広島原爆の爆心地にある慰霊碑"],
      //   「の」を禁じていないと、公園名が消える
      ["仙台市の榴岡公園にある資料館", "資料館", "榴岡公園にある資料館"],
      ["広島平和記念公園にある休憩所", "レストハウス", "広島平和記念公園にある休憩所"],
      // 説明が無いものは、無いまま
      [null, "何か", ""], ["", "何か", ""],
    ];
    const ng = CASES.filter(([d, l, want]) => evDesc(d, l) !== want)
      .map(([d, l, want]) => `「${d}」→「${evDesc(d, l)}」（期待「${want}」）`);
    ng.length ? bad(`説明を落とす規則が壊れている: ${ng.join(" / ")}`)
      : ok(`説明を落とす規則（${CASES.length} 例。落としてはいけない側 4 例を含む）`);
  }
}

// ⚠ 索引の全区画が、**同じ問いに対して**見られていること。
//   coverage.spec は「何を訊いたか」で、訊く項目を増やすとここが変わる。
//   実際に踏んだ（2026-08-15）: 説明を足して 87 区画を取り直したとき、
//   渋谷駅の 1 区画だけ WDQS が retry 尽きで落ちた。仕組みは正しく「見ていない」として
//   古い spec を残したのに、**私がログを見ずにタイルを書き出した**。
//   結果、渋谷の 60 件だけ説明が無いまま配られ、しかも画面は
//   「落とすと何も残らない項目には出ません」と、取っていないものを落としたことにしていた
//   （掟: 取れなかったことを「無い」と言わない、の裏返し）。
//   spec に差が記録されているのに誰も見ていなかった。ここで見る。
{
  const { existsSync: ex } = await import("node:fs");
  const DB = ".data/konjaku.db";
  if (!ex(DB)) ok("索引の元データは手元に無い（取り込みを走らせた人だけが見る検査）");
  else {
    const { open } = await import("../scripts/db.mjs");
    const db = open();
    for (const layer of ["ev", "bld"]) {
      const rows = db.prepare(
        "SELECT spec, COUNT(*) c FROM coverage WHERE layer=? GROUP BY spec ORDER BY c DESC").all(layer);
      if (!rows.length) continue;
      if (rows.length === 1) { ok(`${layer} の索引 ${rows[0].c} 区画は、同じ問いで見ている`); continue; }
      const odd = rows.slice(1);
      const which = db.prepare(
        "SELECT z14x,z14y,n FROM coverage WHERE layer=? AND spec=? LIMIT 3").all(layer, odd[0].spec);
      bad(`${layer} の索引に、古い問いのまま残っている区画が ${
        odd.reduce((s, r) => s + r.c, 0)} 個ある（${
        which.map((r) => `${r.z14x}/${r.z14y}(${r.n}件)`).join(",")}）。`
        + `取り込みが落ちた区画。そのまま配ると、そこだけ中身が欠けたまま「そういうデータだ」と言うことになる`);
    }
  }
}


// 配布している年つき事物の**意味**を見る。
// ⚠ ここまでの検査は「索引と本体が揃っているか」（＝形）だけで、
//   中身の値どうしが矛盾していないかは1件も見ていなかった。値を壊しても CI は緑になる。
// ⚠ 数え上げは**対象件数と違反件数の両方**を出す。0 件だけ見せると、
//   「見て 0 件」と「そもそも見ていない」が同じ顔になる。
{
  const { readFileSync: rfe, readdirSync: rde, statSync: ste, existsSync: exe } = await import("node:fs");
  const { tileOf } = await import("../scripts/db.mjs");
  const ip = join(PUB, "data", "ev", "index.json");
  if (!exe(ip)) bad("事物の索引が無い（意味検査が何も見ていない）");
  else {
    const idx = JSON.parse(rfe(ip, "utf8"));
    const covered = evCovered(idx, tileOf);
    const files = [];
    (function walk(d) {
      if (!exe(d)) return;
      for (const e of rde(d)) {
        const q = `${d}/${e}`;
        ste(q).isDirectory() ? walk(q) : (e.endsWith(".json") && files.push(q));
      }
    })(join(PUB, "data", "ev", String(idx.z)));
    const PREC = ["year", "decade", "century"];
    const v = { 終了年が開始年より前: [], 精度が3種以外: [], 桁が精度と矛盾: [],
      タイルの外: [], 索引が見ていない場所: [], ID重複: [], 必須項目が無い: [] };
    const seen = new Map();
    let n = 0;
    for (const f of files) {
      let j; try { j = JSON.parse(rfe(f, "utf8")); } catch { bad(`事物の本体が壊れている: ${f}`); continue; }
      const [z, tx, ty] = j.tile ?? [];
      for (const x of j.f ?? []) {
        n++;
        const at = `${x.id ?? "(idなし)"}`;
        if (!x.id || !x.l || !Array.isArray(x.c) || !Array.isArray(x.y) || !x.p) v.必須項目が無い.push(at);
        const [from, to] = x.y ?? [];
        // ⚠ to は「分かっていない」で null になる（＝まだ在る、ではない）。null は違反ではない
        if (to != null && from != null && to < from) v.終了年が開始年より前.push(`${at} ${from}→${to}`);
        if (!PREC.includes(x.p)) v.精度が3種以外.push(`${at} ${x.p}`);
        // decade は開始年〜+9、century は開始年〜+99 として扱う。開始年の桁が合っていないと、
        // 幅の当て方（yspan）がそのままずれる
        if (x.p === "decade" && from % 10 !== 0) v.桁が精度と矛盾.push(`${at} decade ${from}`);
        if (x.p === "century" && from % 100 !== 0) v.桁が精度と矛盾.push(`${at} century ${from}`);
        if (Array.isArray(x.c) && x.c.length === 2) {
          const t = tileOf(x.c[0], x.c[1], z);
          if (t.x !== tx || t.y !== ty) v.タイルの外.push(`${at} ${t.x}/${t.y}≠${tx}/${ty}`);
          // ⚠ 索引が「見た」と言っていない場所のものを配らない。配ると、
          //   問い合わせていない地面について「これで全部」と言うことになる
          if (!covered(x.c[0], x.c[1]).on) v.索引が見ていない場所.push(`${at} ${x.c.join(",")}`);
        }
        if (x.id) { if (seen.has(x.id)) v.ID重複.push(`${at}（${seen.get(x.id)} と ${f}）`); else seen.set(x.id, f); }
      }
    }
    if (!files.length || !n) bad("配布している事物が1件も読めない（この検査が何も見ていない）");
    else {
      const hit = Object.entries(v).filter(([, a]) => a.length);
      hit.length
        ? bad(`配布データの意味に違反: ${hit.map(([k, a]) => `${k} ${a.length}件（${a.slice(0, 2).join(" / ")}）`).join("／")}`
            + `（対象 ${n} 件）`)
        : ok(`配布している事物 ${n} 件（${files.length} ファイル）に意味の違反なし`
            + `（範囲 ${Object.keys(v).length} 種を全件走査）`);
    }
  }
}

// 年の精度の決め方が、取り込み側（静的配布）と実行時（Wikidata 直）で同じであること。
// ⚠ 実際にずれていた（2026-08-16 に発見）。Wikidata の精度（dateP）が無いとき、
//   取り込み側は Number(undefined) が NaN になって "century"、実行時側は "year" を返していた。
//   同じ項目が、静的では 99年幅・実行時では 0年幅になり、**経路によって出る年代が変わる**。
//   ⚠ 字面を比べるのではなく、**両方の式を実際に動かして**突き合わせる。
{
  const ing = await readFile(join(ROOT, "scripts", "ingest-wikidata.mjs"), "utf8");
  const ev = await readFile(join(PUB, "events.js"), "utf8");
  const e1 = /const prec = \(p\) => \(([\s\S]*?)\);/.exec(ing)?.[1];
  // ⚠ 式の書き方に強くしておく。以前は `…"century"),` で終わる形しか拾えず、
  //   実行時側を古い形に戻すと**照合そのものをやめて**「式を読めない」で落ちていた
  //   （落ちるだけましだが、食い違いとして検出できていない）。
  //   precision: から次の url: までを丸ごと取る。
  //   ⚠ events.js には precision: が2つある（静的タイル側と Wikidata 直側）。
  //     row.dateP で始まるほう（＝実行時）に固定して拾う。
  const e2 = /precision:\s*(Number\(row\.dateP[\s\S]*?),\s*\n\s*(?:\/\/[^\n]*\n\s*)*url:/.exec(ev)?.[1];
  if (!e1 || !e2) bad(`年の精度の式を読めない（取り込み ${!!e1} / 実行時 ${!!e2}。この検査が何も見ていない）`);
  else {
    const f1 = new Function("p", `return (${e1});`);
    const f2 = new Function("p", `return (${e2.replaceAll("row.dateP?.value", "p")});`);
    // SPARQL は文字列で返す。⚠ 値が無い場合（undefined・空文字）が、まさにずれていた側
    const IN = ["11", "10", "9", "8", "7", "6", "0", "", undefined, null];
    const off = IN.filter((x) => f1(x) !== f2(x));
    off.length
      ? bad(`年の精度の決め方が経路で違う: ${off.map((x) => `${JSON.stringify(x)} → 取り込み ${f1(x)} / 実行時 ${f2(x)}`).join("、")}`)
      : ok(`年の精度の決め方が、取り込みと実行時で一致（${IN.length} 通りで照合。精度なし → ${f1(undefined)}）`);
  }
}

// 上流から消えた行（dropped_at）が、配布物に出ないこと。
// ⚠ 除外は Exporter の WHERE 1か所だけに依存している。落ちても配布物を見て気づけない
//   （消えた行が「まだ在る」として配られるので、画面はむしろ静かになる）。
// ⚠ **一時 DB と一時の書き出し先で走らせる。** Exporter は書き出し先を rmSync するので、
//   本物の public/data/ev を消さないよう KONJAKU_EV_OUT を渡す。
{
  const { mkdtempSync, rmSync: rmt, readFileSync: rft, existsSync: ext } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "konjaku-ev-"));
  try {
    const { SCHEMA } = await import("../scripts/db.mjs");            // ⚠ スキーマは写さない
    const { DatabaseSync } = await import("node:sqlite");
    const dbPath = join(dir, "t.db"), out = join(dir, "ev");
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    db.exec(`INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated)
             VALUES (14552,6451,'ev','wikidata','2026-08-16',2,0)`);
    const ins = db.prepare(`INSERT INTO feature
      (id,source,source_url,retrieved_at,label,kind,lon,lat,year_from,year_to,precision,dropped_at,z14x,z14y)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run("wd:QLIVE", "wikidata", "https://example.invalid/live", "2026-08-16",
      "生きている記録", "building", 139.79, 35.65, 1930, null, "year", null, 14552, 6451);
    ins.run("wd:QDROP", "wikidata", "https://example.invalid/drop", "2026-08-16",
      "上流から消えた記録", "building", 139.79, 35.65, 1931, null, "year", "2026-08-16", 14552, 6451);
    db.close();
    execFileSync(process.execPath, ["scripts/export-tiles.mjs"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, KONJAKU_DB: dbPath, KONJAKU_EV_OUT: out } });
    const idx = JSON.parse(rft(join(out, "index.json"), "utf8"));
    const key = Object.keys(idx.tiles)[0];
    const body = ext(join(out, String(idx.z), `${key}.json`))
      ? JSON.parse(rft(join(out, String(idx.z), `${key}.json`), "utf8")) : null;
    const ids = (body?.f ?? []).map((x) => x.id);
    !ids.includes("wd:QLIVE")
      ? bad(`Exporter が生きている行を配っていない（この検査が何も見ていない）: ${JSON.stringify(ids)}`)
      : ids.includes("wd:QDROP")
        ? bad("上流から消えた行（dropped_at）が配布物に入っている")
        : ok(`上流から消えた行は配布物に入らない（一時 DB で 2 件中 1 件を除外）`);
  } catch (e) {
    bad(`dropped_at の除外を確かめられなかった: ${String(e.message).split("\n")[0]}`);
  } finally {
    rmt(dir, { recursive: true, force: true });
  }
}

// 共通アセットの入口と、生成元の候補地が食い違わないこと。
// seeds を変更して export を忘れると、画面は古い候補を静かに出し続けるため、
// 公開JSONを生成元と突き合わせる。
{
  const seedLines = (await readFile(join(ROOT, "seeds", "areas.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((a) => a.quick);
  const quickPath = join(PUB, "data", "quick-places.json");
  if (!existsSync(quickPath)) bad("quick-places.json が無く、候補地の生成結果を照合できない");
  else {
    const places = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
    const key = (p) => `${p.id}|${p.lon}|${p.lat}|${p.title ?? ""}`;
    const want = new Set(seedLines.map((a) => key({id:a.id,lon:a.ll[0],lat:a.ll[1],title:a.quickTitle ?? a.title})));
    const got = new Set(places.map(key));
    const missing = [...want].filter((x) => !got.has(x));
    const extra = [...got].filter((x) => !want.has(x));
    missing.length || extra.length
      ? bad(`候補地の生成結果が seeds と不一致（不足 ${missing.length} / 余分 ${extra.length}）`)
      : ok(`候補地の生成結果が seeds/areas.jsonl と一致（${places.length} 件）`);
    // ⚠ トップの場所未選択で出すのは、この 10 件のうち **3 件だけ**（入力例）。
    //   index.html は id で指しているので、**配っているデータに その id が無いと
    //   例が 1 件も出ない**（画面側には先頭 3 件へ落ちる保険があるが、
    //   保険が働いた画面は「豊洲・渋谷・広島」ではなくなる。ここで気づけるようにする）。
    //   掟: 同じ問いに答える実装を2つ持つときは、機械で突き合わせる。
    const m = /const TOP_EXAMPLE_IDS\s*=\s*\[([^\]]*)\]/.exec(TOP);
    if (!m) bad("index.html の TOP_EXAMPLE_IDS を読めない（トップの入力例が何も突き合わされていない）");
    else {
      const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      const have = new Set(places.map((p) => p.id));
      const lost = ids.filter((id) => !have.has(id));
      ids.length !== 3
        ? bad(`トップの入力例が 3 件でない: ${ids.length} 件（${ids.join("・")}）`)
        : lost.length
          ? bad(`トップの入力例に、配っていない id がある: ${lost.join("・")}`
              + "（画面は先頭3件へ落ちるので、見た目は壊れず静かに別の土地になる）")
          : ok(`トップの入力例 3 件（${ids.join("・")}）は quick-places.json にある`);
    }
  }
}

// 共通アセットマニフェストの参照先が実在し、建物索引の版・日付と一致すること。
// 壊れた assets.json は建物だけ実行時取得へ落ちる入口になるため、存在確認だけで終わらせない。
{
  const path = join(PUB, "data", "assets.json");
  if (!existsSync(path)) bad("assets.json が無い（共通アセットの入口が生成されていない）");
  else {
    const m = JSON.parse(await readFile(path, "utf8"));
    const b = m.layers?.buildings;
    const idxPath = join(PUB, String(b?.index ?? "").replace(/^\.\//, ""));
    const tile = String(b?.tile ?? "");
    const idx = existsSync(idxPath) ? JSON.parse(await readFile(idxPath, "utf8")) : null;
    const tilePath = tile.replace(/^\.\//, "").replace("{x}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[0] ?? ""))
      .replace("{y}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[1] ?? ""));
    const errors = [];
    if (!b || b.format !== `packed-geojson-v${BL_VERSION}`) errors.push(`建物format=${b?.format ?? "なし"}`);
    if (!idx) errors.push("建物索引が無い");
    if (idx && b.at !== idx.at) errors.push(`建物at=${b.at} / 索引at=${idx.at}`);
    if (idx && (!Object.keys(idx.tiles ?? {}).length || !existsSync(join(PUB, tilePath)))) errors.push("建物タイルが無い");
    errors.length ? bad(`assets.json の建物参照が不正: ${errors.join("、")}`)
      : ok(`assets.json の建物参照が索引・タイルと一致（${Object.keys(idx.tiles).length} 区画）`);
  }
}

// 明治期のラスタを読む計算は **public/swale.js の1か所**。
// ⚠ 以前は同じものが 4 か所にあり、**3 か所だけ**を機械で突き合わせていた
//   （build-water.js は走査から漏れていた。2026-08-17）。
//   突き合わせるより 1 つにするほうが強いので寄せた。ここでは**中身を動かして確かめる**。
{
  await import(`file://${join(PUB, "swale.js")}`);
  const S = globalThis.KonjakuSwale;
  const px = (...rows) => new Uint8ClampedArray(rows.flat());
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };

  if (!S) fails.push("swale.js を読み込めない（この検査が何も見ていない）");
  else {
    eq(S.SWALE.length, 14, "区分の数");
    eq(S.SWALE.filter((c) => c.water).length, 2, "水域の数");
    eq(S.TOLERANCE, 60, "許容差");
    // 凡例そのままの色は、その区分になる
    eq(S.classify(147, 200, 254)?.name, "河川・湖沼・海面", "凡例どおりの色");
    eq(S.classify(254, 227, 200)?.name, "砂礫地", "凡例どおりの色（陸）");
    // ⚠ 許容差の境目。ここが動くと、隣の区分に吸われたり全部 null に落ちたりする。
    //   ⚠ 境目は**孤立した色**で見る。隣の区分が近いところで測ると、
    //     許容差ではなく「どちらが近いか」を見てしまう（実際そう書いて 2 回外した）。
    //     堤防 (144,73,11) は 2 番目（泥炭地）まで 171 離れている。
    eq(S.classify(144 + 55, 73, 11)?.name, "堤防", "許容差の内側（距離 55）");
    eq(S.classify(144 + 70, 73, 11), null, "許容差の外側（距離 70）");
    eq(S.classify(0, 0, 0), null, "凡例から遠い色は null");
    // ⚠ **順番の検査。** まず「いちばん近い色」を選び、そのあとで許容差を見る。
    //   逆にすると、いちばん近い色が 60 より遠いときに 2 番目の色を答えてしまう。
    //   実際、寄せるときに逆に書いてしまい、ここで捕まえた（2026-08-17）。
    //   (181,200,254) は 河川(34.0) より 湿地(32.2) のほうが近い → 湿地 が正しい
    eq(S.classify(181, 200, 254)?.name, "湿地", "いちばん近い色を選ぶ");
    //   (110,140,150) はどの区分からも 60 より遠い → null（2番目を拾わない）
    eq(S.classify(110, 140, 150), null, "いちばん近い色が遠ければ null");
    // ⚠ **面の集計。** 分母は「区分に当てはまった画素」で、透明と凡例外は入れない
    const t = S.tally(px(
      [147, 200, 254, 255],   // 水
      [254, 227, 200, 255],   // 砂礫地
      [254, 227, 200, 255],   // 砂礫地
      [0, 0, 0, 0],           // 透明 → 分母から外す
      [0, 0, 0, 255],         // 凡例外 → 分母から外す
    ));
    eq(t.scanned, 5, "見た画素");
    eq(t.transparent, 1, "透明");
    eq(t.unmatched, 1, "凡例外");
    eq(t.classified, 3, "分母（区分に当てはまった画素）");
    eq(t.top?.name, "砂礫地", "いちばん多い区分");
    eq(Math.round(t.top.share * 1000) / 10, 66.7, "いちばん多い区分の割合(%)");
    eq(Math.round(t.waterShare * 1000) / 10, 33.3, "水域の割合(%)");
    // 分母 0 のときに落ちないこと（透明だけのタイル）
    const empty = S.tally(px([0, 0, 0, 0]));
    eq(empty.classified, 0, "透明だけのときの分母");
    eq(empty.top, null, "透明だけのときのいちばん多い区分");
    eq(empty.waterShare, 0, "透明だけのときの水域割合");
  }
  fails.length
    ? bad(`swale.js の単体テストが失敗（${fails.length} 件）: ${fails.join(" / ")}`)
    : ok(`swale.js を動かして確認（14 区分・水域 2・許容差 60・面の集計と分母）`);

  // ⚠ **区分の解説は、こちらで書かない。** 国土地理院の凡例（lw_legend.pdf）の解説文を
  //   要約せずそのまま持つ（掟3: 引用のときは出典を必ず添え、要約しない）。
  //   ⚠ 14 区分と**両方向で**突き合わせる。片方だけ増えても気づけるように。
  {
    const lp = join(PUB, "data", "swale-legend.json");
    if (!existsSync(lp)) bad("swale-legend.json が無い（区分の説明が画面から出せない）");
    else {
      const lg = JSON.parse(await readFile(lp, "utf8"));
      const names = S ? S.SWALE.map((c) => c.name) : [];
      const keys = Object.keys(lg.classes ?? {});
      const miss = names.filter((n) => !keys.includes(n));
      const extra = keys.filter((k) => !names.includes(k));
      const empty = keys.filter((k) => !lg.classes[k]?.text || !lg.classes[k]?.legendName);
      // ⚠ 出典が消えたら落とす。引用なのに出典が無い状態を作らない
      const noSrc = !lg.source || !lg.textSource || !lg.sourceLabel;
      miss.length || extra.length || empty.length || noSrc
        ? bad(`区分の説明が凡例と食い違っている（不足 ${miss.join("・") || "なし"} / `
            + `余分 ${extra.join("・") || "なし"} / 中身が空 ${empty.join("・") || "なし"}`
            + `${noSrc ? " / 出典が無い" : ""}）`)
        : ok(`区分の説明 ${keys.length} 件が 14 区分と一致し、出典（${lg.textSource}）を持つ`);
      // ⚠ 位置誤差の但し書きは、原典の**地域の限定**まで写していること。
      //   以前は地域を落として「原典は三角点整備前の資料のため位置誤差を含む」と、
      //   原典より広く言っていた（2026-08-17 に凡例を読んで気づいた）。
      /関東地区/.test(lg.caveat ?? "") && /近畿地区/.test(lg.caveat ?? "")
        ? ok("位置誤差の但し書きが、原典どおり地域（関東・近畿）を書いている")
        : bad("位置誤差の但し書きから、原典にある地域の限定（関東地区・近畿地区）が落ちている");
    }
  }
}

// 「取得の結末」と「一覧行のタグ」の字は **public/words.js の1か所**。
// ⚠ **2 画面（トップと /peel）と共有カードが、同じ字を使う。**
//   ⚠ 以前は 4 ファイルが同じ字を別々に書いていて、片方だけ直せば
//     **同じ状態に 2 通りの言い方**ができた（実際に踏んでいる。prov.js の冒頭に記録がある）。
// ⚠ DOM も地図も見ないので、ここで全部の枝を回す。
{
  await import(`file://${join(PUB, "words.js")}`);
  const W = globalThis.KonjakuWords;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!W) fails.push("words.js を読み込めない（この検査が何も見ていない）");
  else {
    // ---- ⚠ 読めて 0 件 と 答えを出せない を、同じ語にしない（掟の核心）----
    yes(W.S.noRecord !== W.S.cantTell, "「読めて 0 件」と「答えを出せない」が同じ語になっている");
    eq(W.meiji("田", true), "田", "値があるときは、その値を出す");
    eq(W.meiji("田", false), "田", "値があれば none に関係なくその値");
    eq(W.meiji(null, true), W.S.noRecord, "読めて 0 件のとき");
    eq(W.meiji(null, false), W.S.cantTell, "答えを出せないとき");
    // ⚠ **0 件を「無い」と言い切らない。**資料の話に留める
    yes(!/^ありません|存在しません|無い$/.test(W.S.noRecord),
      `0 件の語が「無い」と言い切っている: ${W.S.noRecord}`);
    // ⚠ **答えを出せないときに、数や割合を作らない**
    yes(!/\d/.test(W.S.cantTell), `答えを出せないのに数字が入っている: ${W.S.cantTell}`);

    // ---- ⚠ 根拠カードと共有カードは、同じ行を描く ----
    eq(W.meijiBadge(true), `明治期: ${W.S.noRecord}`, "根拠カードの 0 件の行");
    eq(W.meijiBadge(false), `明治期: ${W.S.cantTell}`, "根拠カードの答えを出せない行");

    // ---- ⚠ 組の見出し（2026-08-21。行ごとのタグをここへ移した）----
    // ⚠ **見出しを持たない組がある。**⚠ own（この場所を深掘り）と、打った語の周辺検索。
    //   ⚠ own はその行の見出しが「この場所を深掘り」で、⚠ **組の名前と同じ字になる**。
    for (const g of ["why", "ext"]) eq(W.groupTitle(g), W.GROUP[g], `groupTitle(${g})`);
    eq(W.groupTitle("own"), "", "深掘りに見出しが付いている（行の字と重なる）");
    eq(W.groupTitle("zzz"), "", "知らない組に見出しが出ている");
    eq(W.groupTitle(undefined), "", "組なしに見出しが出ている");
    // ⚠ **名前が互いに違う。**同じ字だと、組を分けた意味が無い
    yes(new Set(Object.values(W.GROUP)).size === Object.keys(W.GROUP).length,
      "組の見出しが重なっている");
    // ⚠ **消した TAG が戻っていない**（⚠ 行ごとのタグと組の見出しを両方持たない）
    yes(!("TAG" in W) && !("tag" in W), "行ごとのタグが戻っている（見出しと 2 か所になる）");
  }
  fails.length
    ? bad(`words.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`words.js を動かして確認（0 件と答えを出せないを分ける・根拠カードと共有カードが同じ行・組の見出しと既定値）`);
}

// ⚠ **字を持っているのは words.js だけ。**呼ぶ側に写しを作らない。
{
  const OWNED = ["記録なし", "さらに調べる", "公的な情報で確認する"];
  const bare = (f) => (src[f] ?? "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const spill = [];
  for (const f of Object.keys(src)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    for (const w of OWNED) if (bare(f).includes(w)) spill.push(`${f}「${w}」`);
  }
  spill.length
    ? bad(`words.js が持つ字を、呼ぶ側が書き写している: ${spill.join("、")}`
        + `（片方だけ直すと、同じ状態に 2 通りの言い方ができる）`)
    : ok(`words.js が持つ字（${OWNED.length} 語）は、呼ぶ側に写しが無い`);
}

// ⚠ **答えに出る区分名の、平易な補助説明**（2026-08-22。hidetzu/konjaku#148）。
//
// ⚠ **これは原典ではない。**⚠ 原典（landform.json の why）は根拠パネルが出典つきで出す。
//   ⚠ **こちらが持つのは意味だけ**で、⚠ **定義・成因・災害リスクは持たない。**
//   ⚠ だから「丸写しでないこと」を機械で見る。⚠ 写した瞬間、同じ字の持ち主が 2 つになる。
//
// ⚠ **例外を作らない。**⚠ 答えに出うる区分が 1 つでも欠けると、
//   ⚠ **利用者から見て「説明がある区分」と「無い区分」の差が意味を持ってしまう**
//   （「説明が無いほうが普通の土地なのだろう」と読める）。
// ⚠ **数えるのは landform.json。**⚠ **ここに区分の一覧を書き写さない。**
{
  const W = globalThis.KonjakuWords;
  const LF = JSON.parse(await readFile(join(PUB, "data/landform.json"), "utf8"));
  const G = W?.GROUND_GLOSS ?? {};
  const cls = LF.classes ?? {};
  const fails = [];
  const LIMIT = 18;   // ⚠ Owner 決定 3（2026-08-22）。⚠ 1 行に収める上限

  if (!W?.groundGloss) fails.push("words.js が groundGloss を持っていない（この検査が何も見ていない）");
  if (!Object.keys(cls).length) fails.push("landform.json の区分を読めていない（この検査が何も見ていない）");

  // ⚠ **答えに出うる区分は、全部持つ**
  const missing = Object.keys(cls).filter((n) => !G[n]);
  if (missing.length) fails.push(`補助説明の無い区分が ${missing.length} 件: ${missing.slice(0, 5).join("、")}`);
  // ⚠ **無い区分の説明を持たない。**⚠ 画面に出ようがない字は、古くなっても誰も気づけない
  const extra = Object.keys(G).filter((n) => !cls[n]);
  if (extra.length) fails.push(`landform.json に無い区分の補助説明がある: ${extra.join("、")}`);

  for (const [name, g] of Object.entries(G)) {
    // ⚠ **1 行・18 字まで**。⚠ 2 行になると、答えより説明のほうが長くなる
    if ([...g].length > LIMIT) fails.push(`${name}: ${[...g].length} 字（上限 ${LIMIT}）`);
    if (/[\n\r]/.test(g)) fails.push(`${name}: 改行が入っている（1 行に収める）`);
    // ⚠ **原典の丸写しでない。**⚠ 写すと、同じ字の持ち主が landform.json と 2 つになる
    if ((cls[name]?.why ?? "").includes(g)) fails.push(`${name}: 原典（why）をそのまま写している`);
    // ⚠ **数字を出さない**（掟3: 出すのは実測値そのものと、その取り方だけ）。
    //   ⚠ 原典には「0.5〜数メートル」のような数がある。⚠ **要約した 18 字に数だけ残すと、
    //     どの範囲の数字か分からなくなる**（掟4: 数字は必ず主張範囲の分母で書く）
    if (/[0-9０-９]/.test(g)) fails.push(`${name}: 補助説明に数字が入っている（${g}）`);
    // ⚠ **⚠ の印を使わない。**⚠ この製品では災害リスク専用（CLAUDE.md §4-1）
    if (g.includes("⚠")) fails.push(`${name}: 補助説明に ⚠ が入っている（災害リスクの印と紛れる）`);
  }
  // ⚠ **互いに違う。**⚠ 2 つの区分に同じ説明が付くと、⚠ **説明が区分を見分けられていない**
  const dup = Object.values(G).length - new Set(Object.values(G)).size;
  if (dup) fails.push(`同じ補助説明が ${dup} 組の区分に付いている（説明が区分を見分けていない）`);

  // ⚠ **知らない名前には何も返さない。**⚠ こちらで作らない（掟の一行目）
  if (W?.groundGloss?.("この区分は存在しない") !== "") fails.push("知らない区分名に説明を返している");


  // ⚠ **行と区分名の対応は words.js が持つ。**⚠ 画面に数えさせない
  if (W?.ground1Names) {
    const n2 = W.ground1Names("旧水部", "盛土地･埋立地"), l2 = W.ground1Lines("旧水部", "盛土地･埋立地");
    const n1 = W.ground1Names("低地", null), l1 = W.ground1Lines("低地", null);
    if (n2.length !== l2.length || n1.length !== l1.length)
      fails.push("ground1Names と ground1Lines の行数が合っていない（説明が別の区分に付く）");
    if (n2[0] !== "旧水部" || n2[1] !== "盛土地･埋立地") fails.push("ground1Names の順が答えの行と違う");
  } else fails.push("words.js が ground1Names を持っていない");

  // ⚠ **読み上げも、画面と同じものを同じ順で言う**（2026-08-22）。
  //   ⚠ **見える人だけが意味を受け取り、聞く人は区分名だけ、にしない。**
  //   ⚠ 実描画がここを捕まえた（画面へ足したのに、声が古いままだった）。
  if (W?.ground1Speech) {
    const sp = W.ground1Speech("旧水部", "盛土地･埋立地");
    const ls = W.ground1Lines("旧水部", "盛土地･埋立地"), ns = W.ground1Names("旧水部", "盛土地･埋立地");
    let at = -1;
    for (let i = 0; i < ls.length; i++) {
      // ⚠ **順を見る。**⚠ 含んでいるだけでは、区分名と意味が入れ替わっていても通る
      for (const part of [ls[i], W.groundGloss(ns[i])]) {
        if (!part) continue;
        const j = sp.indexOf(part);
        if (j <= at) fails.push(`読み上げの第1層で「${part}」の順が画面と違う`);
        at = Math.max(at, j);
      }
    }
    // ⚠ **共有カードの文は変えていないこと**（1 枚の絵に焼く文。入る量が違う）
    if (W.ground1Text("旧水部", "盛土地･埋立地").includes(W.groundGloss("旧水部")))
      fails.push("共有カードの文にも補助説明が入っている（焼く文と読む文を同じにしない）");
  } else fails.push("words.js が ground1Speech を持っていない（画面に足した字を声が読まない）");
  // ⚠ **画面が読み上げも words.js から取っていること**
  if (!TOP.includes("KonjakuWords.ground1Speech"))
    fails.push("index.html が KonjakuWords.ground1Speech を通っていない（声だけ古くなる）");

  // ⚠ **呼ぶ側が書き写していないこと。**⚠ コメントは先に落とす（CLAUDE.md §5）
  const bare = (f) => (src[f] ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
  const spilled = [];
  for (const f of Object.keys(src)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    const b = bare(f);
    for (const g of Object.values(G)) if (b.includes(g)) spilled.push(`${f}「${g}」`);
  }
  if (spilled.length) fails.push(`補助説明を書き写している: ${spilled.slice(0, 3).join("、")}`);
  // ⚠ **画面が words.js を通っていること**（写しが無いだけでは、出していない場合と区別できない）
  if (!TOP.includes("KonjakuWords.groundGloss"))
    fails.push("index.html が KonjakuWords.groundGloss を通っていない（説明が画面に出ていない）");

  fails.length
    ? bad(`区分名の補助説明が掟どおりでない（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`区分名の補助説明は ${Object.keys(G).length} 区分ぶん揃っている`
       + `（landform.json の ${Object.keys(cls).length} 区分と一致／${LIMIT} 字以内／`
       + `原典の丸写しなし／互いに違う／呼ぶ側に写しなし）`);
}

// ⚠ **ものさしの目盛りに置く、短い年**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
//   ⚠ **狭い幅では「1984–86」が 53px あり、9 段で 488px 要る**（実測 2026-08-22・12px）。
//   ⚠ **入らないから間引く、はやらない**（間引くと「その年代は無い」と読まれる。掟 §1）。
//   ⚠ **短くして全部出す。**⚠ だから、⚠ **短くする側が壊れると画面が嘘をつく。**
// ⚠ **DOM 無しで確かめられる**（`.claude/rules/testing.md`: Domain の変換に代表ケースを持つ）。
{
  const W = globalThis.KonjakuWords;
  const fails = [];
  if (W?.eraTick) {
    // ⚠ **字を書き写しているのではない。**⚠ 入れた字と出た字の関係だけを見ている
    const cases = [["1984–86", "’84"], ["1936–42", "’36"], ["現在", "現在"], ["明治期", "明治期"],
                   ["", ""], [null, ""], [undefined, ""], ["昭和のいつか", "昭和のいつか"]];
    for (const [inp, want] of cases) {
      const got = W.eraTick(inp);
      if (got !== want) fails.push(`eraTick(${JSON.stringify(inp)}) が ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`);
    }
    // ⚠ **短くしても、⚠ 別の年代と同じ字にならないこと**（⚠ 同じ字だと段が見分けられない）
    const all = ["1987–90", "1984–86", "1979–83", "1974–78", "1961–69", "1955–60", "1945–50", "1936–42"];
    const short = all.map((t) => W.eraTick(t));
    if (new Set(short).size !== short.length)
      fails.push(`短くすると同じ字になる年代がある: ${short.join("、")}`);
  } else fails.push("words.js が eraTick を持っていない（この検査が何も見ていない）");

  fails.length
    ? bad(`ものさしの短い年が壊れている（${fails.length} 件）: ${fails.slice(0, 4).join(" / ")}`)
    : ok("ものさしの短い年は、渡された字から取り出すだけ（知らない形はそのまま／段どうしが同じ字にならない）");
}

// 「いま画面に出ているもの」（台帳）は **public/prov.js の1か所**。
// ⚠ ここが掟の一行目（取れなかった ≠ 無い）を、いちばん広い面で守っている。
//   以前は peel3d.js の render() の中で組んでいたので、
//   **ブラウザを立てて、その状態を実際に作れたときしか**確かめられなかった。
//   DOM も地図も見ない形にしたので、ここで**全組み合わせ**を回す。
// ⚠ 字面ではなく **tag**（実測／未取得／欠落／未対応／推定）で見る。
//   文言は変わる。変わってはいけないのは「どの語を使ってよいか」のほう。
{
  await import(`file://${join(PUB, "prov.js")}`);
  const P = globalThis.KonjakuProv;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!P) fails.push("prov.js を読み込めない（この検査が何も見ていない）");
  else {
    const ERA = { label: "1984–86" };
    // ⚠ **答えが出せない問いには、⚠ 「詳しく見る」を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ 実測（網走市・1280×950）: ⚠ **「この範囲に明治期の低湿地データが無い」の下に出ていた。**
    //   ⚠ **断りは消さない。**⚠ **畳んでいた実測の行だけ出さない**（掟 §1）。
    {
      const list = [{ q: 2, level: "no", tag: "未取得", body: "取れていない" },
                    { q: 2, level: "ok", tag: "実測", body: "これは材料" }];
      const on  = P.section(list, "詳しく見る", true);
      const off = P.section(list, "詳しく見る", false);
      yes(/詳しく見る/.test(on),   "答えがあるのに「詳しく見る」が無い");
      yes(!/詳しく見る/.test(off), "答えが出せないのに「詳しく見る」がある（何を見るのか分からない）");
      yes(/取れていない/.test(off), "「詳しく見る」を隠したら、断りまで消えた（掟 §1）");
    }
    // ---- 地表。届いていないなら「実測」と言わない ----
    eq(P.groundRow(true, ERA).tag, "実測", "届いた地表");
    eq(P.groundRow(false, ERA).tag, "未取得", "届いていない地表");
    yes(P.groundRow(false, ERA).body.includes("1984–86"), "届いていない地表に、どの年代かが無い");
    yes(P.groundRow(false, null).body.includes("明治期"), "明治期の地表の呼び名");
    // ⚠ ここが本丸。届いていないことを「無い」と言わせない
    yes(/記録の有無は分かっていない/.test(P.groundRow(false, ERA).note ?? ""),
      "届いていない地表に「記録の有無は分かっていない」が無い");

    // ---- 水面。読めなかった（未取得）と、本当に無い（整備対象外）を混ぜない ----
    eq(P.waterRow({ waterRead: true }).tag, "実測", "読めた水面");
    eq(P.waterRow({ waterRead: false, waterUnread: true }).tag, "未取得", "読めなかった水面");
    // ⚠ **整備対象外のときは、⚠ 材料の行を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ **層の理由が既に「この範囲は明治期の低湿地データの整備対象外です」と言っている。**
    //   ⚠ **前は 2 行目が「この範囲に明治期の低湿地データが無い」で、⚠ 言い切っていた**
    //     （掟 §1: ⚠ **データにない ≠ 現実にない**）。
    //   ⚠ **混ぜないという主張は変えていない。**⚠ **読めなかったときは、⚠ 上の行が残る。**
    yes(P.waterRow({ waterRead: false, waterUnread: false }) === null,
      "整備対象外なのに材料の行を出している（層の理由と同じことを 2 回言う）");
    // ⚠ **`null` が並びから落ちること**（⚠ 落とし忘れると、⚠ 画面を組む側で落ちる）
    yes(P.rows({ area: { waterRead: false, waterUnread: false }, groundArrived: true })
      .every(Boolean), "行の並びに null が混ざっている");

    // ---- 建物。0 件は「読んだ結果」なので実測の側 ----
    eq(P.buildingRows({ bldState: "loading" })[0].tag, "未取得", "取得中の建物");
    eq(P.buildingRows({ bldState: "notyet" })[0].tag, "未対応", "まだ提供していない建物");
    eq(P.buildingRows({ bldState: "fail" })[0].tag, "未取得", "取れなかった建物");
    eq(P.buildingRows({ bldState: "ok", total: 0, bldSource: "overpass" })[0].tag, "実測",
      "正常に 0 件だった建物");
    yes(/OSM に登録が無いだけで/.test(P.buildingRows({ bldState: "ok", total: 0 })[0].note ?? ""),
      "0 件のときに「現地に無いとは限らない」が無い");
    // ⚠ **「まだ提供していない」の文は、prov.js の 1 つだけ。**
    //   実測（2026-08-18）: 同じ事実に 2 通りの文があり、20 秒のあいだに入れ替わっていた。
    //     待っているあいだ … 「この場所の建物データは、まだ用意できていません」
    //     終わったあと     … 「建物ごとの判定は、この場所ではまだ提供していません」
    //   ⚠ 入れ替わると、同じことを言っているのだと分からない。
    yes(typeof P.NOTYET === "string" && P.NOTYET.length > 8, "NOTYET を配っていない");
    yes(typeof P.NOTYET_WHY === "string" && /通信の問題ではありません/.test(P.NOTYET_WHY),
      "NOTYET_WHY を配っていない、または「通信の問題ではありません」が無い");
    // ⚠ 主語は「建物データ」ではなく「建物ごとの判定」。建物そのものは出ることがある
    yes(/建物ごとの判定/.test(P.NOTYET), `NOTYET の主語が「建物ごとの判定」でない: ${P.NOTYET}`);
    yes(P.buildingRows({ bldState: "notyet" })[0].body.includes("この場所ではまだ提供していません"),
      "台帳の行が NOTYET を使っていない");

    // ⚠ 「届かなかった」と言う行には、打ち消しの但し書きが要る。
    //   ⚠ **水面の行だけ、いまこれを持っていない**（2026-08-18 にこの検査で見つけた）。
    //     このリファクタでは文言を変えない約束なので直していない。`tmp/9/24` に記録した。
    for (const [rowOf, what] of [
      [() => P.groundRow(false, ERA), "地表"],
      [() => P.buildingRows({ bldState: "loading" })[0], "取得中の建物"],
      [() => P.buildingRows({ bldState: "fail" })[0], "取れなかった建物"],
      [() => P.unreadRow({ unread: 232 })[0], "足元を判定できなかった建物"],
    ]) {
      const r = rowOf();
      yes(/限らない|分かっていない/.test(r.note ?? ""), `${what}の「未取得」に打ち消しの但し書きが無い`);
    }
    // ⚠ 「未対応」は**こちらの都合**。通信の話に読ませない（CLAUDE.md §4-1）
    {
      const r = P.buildingRows({ bldState: "notyet" })[0];
      yes(/通信の問題ではありません/.test(r.note ?? ""), "未対応に「通信の問題ではありません」が無い");
      yes(!/取得中|取得できませんでした|届いていない/.test(r.body + (r.note ?? "")),
        "未対応の行が、通信のせいに読める言い方をしている");
      yes(/現地に建物が無いという意味でもありません/.test(r.note ?? ""),
        "未対応に「現地に無いという意味ではない」が無い");
    }
    // ⚠ **光らせるボタンは、⚠ 内訳（`paintBreakdown`）が持つようになった**（2026-08-22。Owner 判断）。
    //   ⚠ **主張は同じ**（⚠ 建設年が 1 件も分かっていないときは出さない。⚠ ADR 0026）。
    //   ⚠ **見る場所が `prov.js` → 内訳へ移っただけ。**⚠ 下の breakdown の節が見ている。
    // ⚠ **材料の行は「どうやって決めたか」だけを言う**（⚠ 件数は内訳が持つ。掟 §6）。
    yes(!/\d+\s*\/\s*\d+/.test(
          P.buildingRows({ bldState: "ok", total: 9, dated: 3 }).map((r)=>r.body+(r.note??"")).join("")),
      "材料の行が件数を言っている（⚠ 内訳と同じ数字を 2 か所で言うことになる）");

    // ---- 全組み合わせ。⚠ ここが「ブラウザでは作れない状態」を含む ----
    const TAGS = new Set(Object.values(P.TAGS));
    let n = 0;
    for (const groundArrived of [true, false])
    for (const era of [null, ERA])
    for (const area of [null,
        { waterRead: true, bldState: "loading" },
        { waterRead: true, bldState: "notyet" },
        { waterRead: true, bldState: "fail" },
        { waterRead: false, waterUnread: true, bldState: "fail" },
        { waterRead: false, waterUnread: false, bldState: "ok", total: 0, bldSource: "tile" },
        { waterRead: true, bldState: "ok", total: 0, bldSource: "overpass" },
        { waterRead: true, bldState: "ok", total: 533, dated: 8, unread: 0,
          hSrc: { measured: 42, levels: 64, default: 427 } },
        { waterRead: false, waterUnread: true, bldState: "ok", total: 5017, dated: 0, unread: 232 }]) {
      const rows = P.rows({ groundArrived, era, area });
      n++;
      for (const r of rows) {
        if (!TAGS.has(r.tag)) fails.push(`知らない語が台帳に出た: ${r.tag}`);
        if (!["ok", "no", "est"].includes(r.level)) fails.push(`知らない level: ${r.level}`);
        // ⚠ 「読めなかった」の行が、**その事物が無い**と言い切っていないか。
        //   ⚠ 打ち消し（「無いとは限らない」等）は先に落とす。落とさないと、
        //     守っている行のほうが引っかかる。
        //   ⚠ 見るのは**事物の有無**だけ。「まだ提供していません」はこちらの都合の話で、
        //     現地に無いとは言っていないので、当ててはいけない。
        if (r.tag === "未取得" || r.tag === "未対応") {
          const t = (r.body + " " + (r.note ?? ""))
            .replace(/無いとは限らない|無いという意味でもありません|有無は分かっていない/g, "");
          if (/(建物|記録|データ|写真|資料)(は|が)(無い|ありません|存在しません)/.test(t))
            fails.push(`「${r.tag}」の行が、無いと言い切っている: ${r.body}`);
        }
      }
      // 地表の行は必ず先頭に 1 つ。出ているものの出所を落とさない
      if (rows[0].body.indexOf("地表") !== 0) fails.push("台帳の先頭が地表の行ではない");
      // HTML は 1 か所でしか作らない。行の数だけ div が出る
      const html = P.html(rows);
      eq((html.match(/<div class="prov /g) ?? []).length, rows.length, "行の数と div の数");
      if (/<script|onerror=|javascript:/i.test(html)) fails.push("台帳の HTML に危ないものが入った");
    }
    eq(n, 36, "回した組み合わせの数");
  }
  fails.length
    ? bad(`prov.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`prov.js を動かして確認（語彙 5・36 通りの状態で、読めなかったことを「無い」と言わない）`);
}

// 人の判断を待つときだけ Slack へ知らせる Hook（.claude/hooks/notify-slack.sh）。
// ⚠ ここで見るのは 2 つだけ。**どちらも、間違えると静かに壊れる種類**のもの。
//   1. 送り先（Webhook URL）がリポジトリに入っていないこと
//   2. Hook が、質問そのものをせき止めないこと
// ⚠ 何を聞くか・どこで聞くかの線引きは CLAUDE.md §7-1。ここでは見ない（責務が別）。
{
  const HOOK = ".claude/hooks/ask-slack.mjs";
  const SETTINGS = ".claude/settings.json";
  const { execFileSync: exH } = await import("node:child_process");
  let tracked = [];
  try {
    tracked = exH("git", ["ls-files"], { encoding: "utf8", cwd: ROOT }).split("\n").filter(Boolean);
  } catch { bad("git ls-files が使えない（Hook の検査が何も見ていない）"); }

  // ---- 1. 送り先をリポジトリに置かない ----
  // ⚠ 一度でも入ると、履歴に残る。入る前に落とす。
  // ⚠ ここに実物の形を書かない。書くと、この検査が自分のコメントを拾う（CLAUDE.md §5。4 回目に踏んだ）。
  {
    const host = ["hooks", "slack", "com"].join(".");
    const tok = ["xoxb", "xapp", "xoxp"];
    const hits = [];
    for (const f of tracked) {
      let buf; try { buf = await readFile(join(ROOT, f)); } catch { continue; }
      if (buf.includes(0)) continue;
      buf.toString("utf8").split("\n").forEach((line, i) => {
        // ホスト名だけなら説明。**その先に道が付いていたら**送り先そのもの
        if (new RegExp(`${host.replace(/\./g, "\\.")}/\\S`).test(line)) hits.push(`${f}:${i + 1} 送り先`);
        // ⚠ トークンは、印のあとに中身が続いていたら本物とみなす
        for (const t of tok) if (new RegExp(`${t}-[A-Za-z0-9]{8}`).test(line)) hits.push(`${f}:${i + 1} ${t}`);
      });
    }
    hits.length
      ? bad(`Slack の秘密がリポジトリに入っている: ${hits.join("、")}`
          + `（環境変数か .envrc から読むこと。一度入ると履歴に残る）`)
      : ok(`Slack の秘密はリポジトリに入っていない（${tracked.length} ファイル・送り先とトークン 3 種を走査）`);
  }

  // ---- 2. 人に聞けなくならないこと ----
  // ⚠ **守りたいのは「exit 0」ではない。「人に聞けなくならないこと」。**
  //   2026-08-18 に、この Hook は「知らせるだけ（待たない）」から
  //   「Slack で聞いて答えを受け取る（待つ）」に変わった。**待つのが目的**なので、
  //   「絶対に止まらない」はもう成り立たない。縛り直したのは次の 3 つ:
  //     ① 待ちに上限があること（無限に待たない）
  //     ② 上限が Hook 自身の timeout より内側であること
  //     ③ 何が起きても exit 0（＝答えが取れなければ端末で聞く形に落ちる）
  //   ⚠ ①②が無いと、Slack を見ていない日に**セッションが黙って固まる**。
  {
    const fails = [];
    let waitMs = null, hookTimeoutSec = null;
    if (!existsSync(join(ROOT, HOOK))) fails.push(`${HOOK} が無い`);
    else {
      const js = await readFile(join(ROOT, HOOK), "utf8");
      const code = js.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      // ① 上限
      const w = /WAIT_MS\s*=\s*([\d_]+)/.exec(code);
      if (!w) fails.push("待ちの上限（WAIT_MS）が無い（無限に待ちうる）");
      else waitMs = Number(w[1].replace(/_/g, ""));
      // ③ 落ちても、聞けなくならない
      if (!/process\.exit\(0\)/.test(code)) fails.push("exit 0 で終わる道が無い");
      // ⚠ `.catch(() => {})` を数えない。**外側の try/catch** があるかを見る。
      //   最初 /catch\s*\(/ で書いて、外側の受け皿を消しても緑のままだった（2026-08-18）。
      if (!/^\}\s*catch\s*\(/m.test(code)) fails.push("外側の受け皿（try/catch）が無い（例外で質問ごと止まる）");
      // 答えとして採ってよいものが絞られていること
      if (!/optionsOf|options/.test(code)) fails.push("こちらが出した選択肢と突き合わせていない");
      // ⚠ 履歴を読みに行かないこと（読むと、そのチャンネルの全発言が届く）
      if (/conversations\.(history|replies)/.test(code))
        fails.push("チャンネルの履歴を読んでいる（答え 1 つのために全発言を読まない）");
      // ⚠ **誰が答えたかを持ち出さない。** 答えの正しさに、誰が押したかは関係ない。
      //   混ぜると transcript・ログ・PR 本文に人名が散る。要るなら Slack 側を見ればよい。
      if (/\buser\?\.(username|id|name)|\buser\.(username|id|name)\b/.test(code))
        fails.push("答えた人の名前や id を読んでいる（記録に人名を散らさない）");
      // ⚠ env ファイルを丸ごと読み込まない
      if (/\brequire\(.*\.envrc|source\s+\S*\.env/.test(code))
        fails.push("env ファイルを丸ごと読んでいる（任意のシェルコードが走る）");
      const { statSync } = await import("node:fs");
      if (!(statSync(join(ROOT, HOOK)).mode & 0o111)) fails.push("実行権が無い");
    }
    // 診断の道具も同じ扱い。⚠ 手元の出力でも人名を出さない
    {
      const doc = ".claude/hooks/slack-doctor.mjs";
      if (!existsSync(join(ROOT, doc))) fails.push(`${doc} が無い`);
      else if (/\buser\?\.(username|id|name)|\buser\.(username|id|name)\b/
        .test((await readFile(join(ROOT, doc), "utf8")).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")))
        fails.push(`${doc} が答えた人の名前や id を読んでいる`);
    }
    // settings.json が、実在する Hook を指していること
    if (!existsSync(join(ROOT, SETTINGS))) fails.push(`${SETTINGS} が無い`);
    else {
      let j; try { j = JSON.parse(await readFile(join(ROOT, SETTINGS), "utf8")); }
      catch { fails.push(`${SETTINGS} が JSON として壊れている`); }
      const hs = (j?.hooks?.PreToolUse ?? []).flatMap((g) =>
        g.matcher === "AskUserQuestion" ? (g.hooks ?? []) : []);
      if (!hs.length) fails.push("AskUserQuestion の PreToolUse Hook が設定されていない");
      for (const h of hs) {
        const rel = (h.command ?? "").replace(/^\$\{[^}]+\}\//, "");
        if (!existsSync(join(ROOT, rel))) fails.push(`指している ${rel} が無い`);
        if (typeof h.timeout === "number") hookTimeoutSec = h.timeout;
      }
      if (hookTimeoutSec == null) fails.push("Hook の timeout が書かれていない（既定 600 秒に任せない）");
    }
    // ② 待ちの上限は、Hook の timeout の内側
    if (waitMs != null && hookTimeoutSec != null && waitMs >= hookTimeoutSec * 1000)
      fails.push(`待ちの上限 ${waitMs / 1000} 秒が Hook の timeout ${hookTimeoutSec} 秒の外側`
        + `（先に Hook ごと切られる＝スレッドに一言返す道が通らない）`);
    // 送り先を書いたファイルが、追跡されていないこと
    // ⚠ .gitignore を読んで確かめない。**git が実際にどう扱っているか**で見る
    for (const f of [".envrc", ".env"])
      if (tracked.includes(f)) fails.push(`${f} が git に入っている（秘密が履歴に残る）`);
    fails.length
      ? bad(`人に聞けなくなりうる: ${fails.join(" / ")}`
          + `（Slack が駄目でも、必ず端末で聞けること）`)
      : ok(`人に聞けなくならない（待ち ${waitMs / 1000} 秒 < Hook の timeout ${hookTimeoutSec} 秒`
          + `・落ちても exit 0・履歴を読まない・人名を持ち出さない`
          + `・.envrc / .env は git に入っていない）`);
  }
}

// ⚠ **AI が、人の代わりに「渡してよい」と決めないこと。**
//   Loop Engineering の入口は `ready-for-ai` ラベルで、**付けるのは人だけ**
//   （CLAUDE.md 「自分で決める／人に聞く」の節）。
//   ⚠ Skill や Hook にラベル付与・自動 merge の手順を書くと、**そこが素通りになる**。
// ⚠ **`.claude/` の中だけを見る。**この検査自身（scripts/）や、禁じ手を説明している
//   文書まで拾うと、書いた瞬間に落ちる（コメントを先に落とす規則と同じ話）。
{
  const dir = join(ROOT, ".claude");
  const walk = async (d) => {
    const out = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) out.push(...await walk(full));
      else out.push(full);
    }
    return out;
  };
  const files = existsSync(dir) ? await walk(dir) : [];
  const FORBIDDEN = [
    { re: /--add-label[^\n]*ready-for-ai|ready-for-ai[^\n]*--add-label/, why: "ready-for-ai を自分で付けている" },
    { re: /gh\s+pr\s+merge[^\n]*--auto/, why: "PR を自動 merge している" },
    { re: /gh\s+(pr|issue)[^\n]*--admin/, why: "保護を飛び越えている（--admin）" },
    { re: /gh\s+issue\s+close/, why: "Issue を自分で閉じている" },
  ];
  // ⚠ **地の文を読まない。手順として書かれた行だけを見る。**
  //   最初は「〜しない」を含む行を飛ばす形にしたが、**言い方の一覧は永遠に埋まらない**。
  //   実測（2026-08-19）: 「⚠ gh issue close は使わない。」で落ちた（「使わない」が漏れていた）。
  //   ⚠ CLAUDE.md 「コメント」の節と同じ踏み方（字面で拾うと、説明文まで拾う）。
  //   → .md はコード枠（```）の中だけ、それ以外は行コメントを落としてから見る。
  const steps = (f, src2) => {
    if (f.endsWith(".md")) {
      const out = []; let inFence = false;
      for (const line of src2.split("\n")) {
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) out.push(line);
      }
      return out;
    }
    return src2.split("\n").map((l) => l.replace(/(^|\s)(\/\/|#).*$/, ""));
  };
  const hits = [];
  for (const f of files) {
    let src2 = ""; try { src2 = await readFile(f, "utf8"); } catch { continue; }
    for (const line of steps(f, src2))
      for (const g of FORBIDDEN)
        if (g.re.test(line)) hits.push(`${f.replace(ROOT + "/", "")}: ${g.why}`);
  }
  // ⚠ ラベルの意味が書かれていること。書いていないと、人も何を見て付けるか分からない
  const rule = await readFile(join(ROOT, "CLAUDE.md"), "utf8").catch(() => "");
  if (!/ready-for-ai/.test(rule)) hits.push("CLAUDE.md に ready-for-ai の意味が書かれていない");
  hits.length
    ? bad(`AI が人の判断を飛ばせる書き方が入っている: ${[...new Set(hits)].join(" / ")}`
        + `（ラベルを付けるのも merge するのも人。Skill は判定を返すところまで）`)
    : ok(`Skill と Hook は、人の判断を飛ばさない（${files.length} ファイル・`
        + `ラベル付与／自動 merge／--admin／Issue を閉じる が無く、`
        + `ready-for-ai の意味は CLAUDE.md にある）`);
}

// 層を組み立てるところ（peel3d.js の layersOf）。
// ⚠ **確実性の高い順**（第1層 → 第2層 → 第3層）。ADR 0030 と docs/DOMAIN.md §1。
// ⚠ 実測（2026-08-19）: 層という値が無かったので、4 地点とも順番が違った。
{
  const src2 = src["peel3d.js"] ?? "";
  const m = /\nfunction layersOf\(area, lf\)\{[\s\S]*?\n\}\n/.exec(src2);
  const mw = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src2);
  if (!m || !mw) bad("peel3d.js の layersOf を取り出せない（この検査が何も見ていない）");
  else {
    const [L, W] = new Function("KonjakuSwale", "KonjakuProv", "bldWhyArea",
      `${mw[0]}${m[0]}\nreturn [layersOf, WORD];`)(
        globalThis.KonjakuSwale, globalThis.KonjakuProv, () => "分母");
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const LF = { ok: true, value: "旧水部", artificial: "盛土地･埋立地" };

    // ---- 豊洲: 3 層とも立つ ----
    const toyosu = L({ classified: 533, total: 533, wet: 531, waterRead: true, waterRatio: .953,
      buildingLand: { name: "河川・湖沼・海面", count: 496, classified: 533, pct: "93.1" },
      landSummary: { name: "河川・湖沼・海面", pct: "81.5" }, counts: {}, bldState: "ok" }, LF);
    yes(toyosu.layers.map((x) => x.n).join() === "1,2,3",
      `豊洲で 3 層が順に並んでいない: ${toyosu.layers.map((x) => x.n).join()}`);

    // ---- ⚠ 第1層は、どの土地でも立つ ----
    for (const [nm, area] of [
      ["名古屋", { classified: 0, total: 0, waterRead: true, waterRatio: .017, landSummary: { name: "田", pct: "97.0" }, bldState: "notyet" }],
      ["札幌", { classified: 0, total: 1364, waterRead: false, waterUnread: false, bldState: "ok" }],
      ["那覇", { classified: 0, total: 0, waterRead: false, waterUnread: false, bldState: "notyet" }],
    ]) {
      const r = L(area, LF);
      yes(r.layers[0]?.n === 1, `${nm}で第1層が先頭でない: ${r.layers.map((x) => x.n).join()}`);
      // ⚠ 層は必ず番号順（順序が崩れると、確実性の順でなくなる）
      const ns = r.layers.map((x) => x.n);
      yes(ns.join() === [...ns].sort().join(), `${nm}で層の順序が崩れている: ${ns.join()}`);
      // ⚠ 立たない層は、必ず理由が付く（黙って消さない）
      for (const n of [2, 3])
        yes(ns.includes(n) || r.missing.some((x) => x.n === n),
          `${nm}で第${n}層が、立ちも欠けもしていない（黙って消えている）`);
    }

    // ---- ⚠ 数字を出すなら、分母がある ----
    for (const r of [toyosu, L({ classified: 0, total: 0, waterRead: true, waterRatio: .017, bldState: "notyet" }, LF)])
      for (const x of r.layers)
        if (x.head.kind === "pct") yes(!!x.den, `数字を出しているのに分母が無い: 第${x.n}層 ${x.head.v}`);

    // ---- ⚠ 出せない理由は、層ごとに違う（同じ文を 2 回出さない）----
    const sap = L({ classified: 0, total: 1364, waterRead: false, waterUnread: false, bldState: "ok" }, LF);
    const says = sap.missing.map((x) => W.layerMissing(x.n, x.why));
    yes(new Set(says).size === says.length, `出せない理由が重複している: ${says.join(" / ")}`);

    // ---- ⚠ 読めなかったのと、範囲の外を混ぜない ----
    const unread = L({ classified: 0, total: 0, waterRead: false, waterUnread: true, bldState: "notyet" }, LF);
    yes(unread.missing.find((x) => x.n === 2)?.why === "unread", "読めなかったのに範囲の外と言っている");
    yes(/読み込め/.test(W.layerMissing(2, "unread")), "読めなかったことを言っていない");
    yes(!/読み込め/.test(W.layerMissing(2, "outside")), "範囲の外なのに、こちらの都合に読める言い方をしている");

    // ---- ⚠ 層の名前は「問い」。内部の呼び名を出さない ----
    for (const n of [1, 2, 3]) {
      const t = W.layerTitle(n);
      yes(!/第[123]層/.test(t), `層の名前に内部の呼び名が出ている: ${t}`);
      yes(/？/.test(t), `層の名前が問いの形になっていない: ${t}`);
    }
    // ⚠ 第1層で時間の語を使わない（3/4 が明治期と取り違えた）
    yes(!/もとは|昔は|だった/.test(W.ground1("旧水部")), `第1層に時間の語が入っている: ${W.ground1("旧水部")}`);
    yes(/この土地は/.test(W.ground1("旧水部")), `主語が「この土地は」でない: ${W.ground1("旧水部")}`);

    fails.length
      ? bad(`層の組み立てが決めごとと違う（${fails.length} 件）: ${fails.slice(0, 4).join(" / ")}`)
      : ok(`層を動かして確認（確実性の高い順・第1層は常に立つ・数字には分母・`
          + `出せない理由は層ごと・名前は問いの形）`);
  }
}



// 「動きを減らす」を入れている人に、深掘りの画面でカメラを振らないこと。
// ⚠ **実描画で読めるのは bearing と pitch だけ**（MapLibre のコンパスの style から）。
//   ⚠ **zoom は画面に出ていない。**だからここで**経路のほうを**見る。
//   ⚠ これは「zoom が動かないことを測った」ではない。**そう書かない。**
{
  const src2 = src["peel3d.js"] ?? "";
  const fails = [];
  // ⚠ 受け口が 1 つあること。毎フレーム matchMedia() を作らない形になっていること
  if (!/const lessMotionMQ\s*=\s*matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)/.test(src2))
    fails.push("peel3d.js が「動きを減らす」を見ていない（受け口が無い）");
  // ⚠ カメラを振る呼び出しが、**減らしていない側にだけ**あること。
  //   ⚠ 行で見る。字面の数だけ数えると、条件の外に出しても気づけない
  const lines = src2.split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, ""));
  const sweep = lines
    .map((l, i) => ({ l, i }))
    .filter((x) => /map\.jumpTo\([^)]*bearing\s*:\s*b0\s*\+/.test(x.l));
  if (sweep.length !== 1) fails.push(`カメラを振る呼び出しが ${sweep.length} 箇所（1 つのはず）`);
  else {
    // ⚠ **直前の行が番人であること。**番人ごと消えても、上の走査は 1 件で通ってしまう
    const guard = lines[sweep[0].i - 1] ?? "";
    if (!/if\s*\(\s*!\s*lessMotionMQ\.matches\s*\)/.test(guard))
      fails.push(`カメラを振る前に番人が無い: ${(guard.trim() || "(空行)").slice(0, 60)}`);
  }
  fails.length
    ? bad(`深掘りの画面が「動きを減らす」を見ていない: ${fails.join(" / ")}`
        + `（年代の送りと所要時間は変えない。消すのはカメラの動きだけ）`)
    : ok(`深掘りの画面は、動きを減らす人にカメラを振らない`
        + `（⚠ 経路を見ている。zoom が動かないことは実描画では測れない）`);
}

// 「動きを減らす」を入れている人に、動きだけを消していること。
// ⚠ **画面ごとに要る。**片方だけ入れても、もう片方は動いたままになる。
// ⚠ **寄せる操作は受け口 1 つに通す。**生の behavior:"smooth" が散ると、
//   片方だけ直し忘れる（実測 2026-08-19: index.html に 7 か所あった）。
{
  const fails = [];
  const MQ = "@media (prefers-reduced-motion: reduce)";
  for (const f of ["index.html", "peel.html"])
    if (!(src[f] ?? "").includes(MQ)) fails.push(`${f} に「動きを減らす」の媒体クエリが無い`);
  // ⚠ **受け口が behavior を決めているので、字面はそこに 1 つだけ残る。**
  //   ⚠ 「1 個までなら許す」にしない。**受け口の行かどうか**で見る。
  //     数で許すと、受け口を消して別の場所に 1 個書いても通ってしまう。
  // ⚠ **コメントを先に落とす。**落とさないと、この検査を説明したコメントを
  //   検査自身が拾う（CLAUDE.md「コメント」の節。実測 2026-08-19 に踏んだ）。
  for (const f of Object.keys(src)) {
    const stray = (src[f] ?? "").split("\n")
      .map((line, i) => ({ line: line.replace(/(^|\s)\/\/.*$/, ""), i }))
      .filter((x) => /behavior\s*:\s*["']smooth["']/.test(x.line) && !/scrollToEl/.test(x.line));
    if (stray.length)
      fails.push(`${f}:${stray.map((x) => x.i + 1).join("・")} に生の behavior:"smooth"`
        + `（受け口 scrollToEl を通すこと。呼ぶ側は「どこへ寄せるか」だけ言う）`);
  }
  // ⚠ 受け口そのものが消えていないこと（消すと、上の走査は 0 件で通ってしまう）
  if (!/const scrollToEl\s*=/.test(TOP))
    fails.push("index.html に受け口 scrollToEl が無い（この検査が何も見ていない）");
  // ⚠ **同じ問いを 2 か所で聞いている。**CSS の媒体クエリと JS の matchMedia。
  //   片方だけ直すと、**CSS は詰まったのに寄せる操作は滑らかなまま**になる。
  //   ⚠ 1 つにはできない（CSS と JS で書く場所が違う）。だから機械で突き合わせる。
  {
    const cond = (t) => {
      const a2 = /@media\s*\(\s*prefers-reduced-motion\s*:\s*([a-z-]+)\s*\)/.exec(t ?? "");
      const b2 = /matchMedia\(\s*["']\(prefers-reduced-motion:\s*([a-z-]+)\)["']\s*\)/.exec(t ?? "");
      return [a2?.[1] ?? null, b2?.[1] ?? null];
    };
    // ⚠ **画面ごとに、CSS 側と JS 側を突き合わせる。**
    //   トップは index.html の中に両方ある。深掘りは peel.html（CSS）と peel3d.js（JS）に分かれている。
    //   ⚠ 分かれているぶん、こちらのほうが食い違いやすい。
    for (const [name, cssSrc, jsSrc] of [
      // ⚠ **トップも 2 ファイルに分かれた**（2026-08-24）。⚠ CSS は index.html・JS は top.js
      ["index.html ↔ top.js", src["index.html"], src["top.js"]],
      ["peel.html ↔ peel3d.js", src["peel.html"], src["peel3d.js"]],
    ]) {
      const css = cond(cssSrc)[0], js = cond(jsSrc)[1];
      if (!css || !js) fails.push(`${name} で条件を読めない（CSS=${css} / JS=${js}）`);
      else if (css !== js) fails.push(`${name}: CSS は ${css}・JS は ${js} を見ている（食い違うと片方だけ効く）`);
    }
  }
  fails.length
    ? bad(`「動きを減らす」の扱いが揃っていない: ${fails.join(" / ")}`
        + `（動きだけを消す。送り先や年代の送りは変えない）`)
    : ok(`「動きを減らす」を両画面が見ていて、寄せる操作は受け口 1 つを通っている`);
}

// 言葉を決めるところ（peel3d.js の WORD）。
// ⚠ HTML から外へ出したのは、**検査が字面ではなく判断そのものを見られるようにする**ため。
//   ⚠ 取り出せなくなったら落とす（黙って素通りさせない）。
{
  const m = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src["peel3d.js"] ?? "");
  if (!m) bad("peel3d.js の WORD を取り出せない（この検査が何も見ていない）");
  else {
    // ⚠ prov.js を借りている行がある。Node でも同じものを渡す
    // ⚠ **words.js も借りている。**渡し忘れると undefined で落ちる（黙って素通りさせない）
      const W = new Function("KonjakuProv", "KonjakuWords", `${m[0]}\nreturn WORD;`)(
        globalThis.KonjakuProv, globalThis.KonjakuWords);
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- 高さの出どころ。3 通りを取り違えない ----
    yes(/既定値/.test(W.heightSrc("default", "住宅")), "既定値のときに、そう書いていない");
    yes(/住宅/.test(W.heightSrc("default", "住宅")), "既定値の根拠（種別）を書いていない");
    yes(/階数/.test(W.heightSrc("levels")), "階数から換算したときに、そう書いていない");
    yes(/height/.test(W.heightSrc("measured")), "実測のときに出どころ（height タグ）を書いていない");
    // ⚠ 3 つは別の文。同じにすると、どれが実測か分からなくなる
    yes(new Set(["default", "levels", "measured"].map((s) => W.heightSrc(s, "x"))).size === 3,
      "高さの出どころ 3 通りが書き分けられていない");

    // ---- ⚠ 掟の核心。読めなかったのか、本当に無いのか ----
    yes(W.meijiGap(true) !== W.meijiGap(false), "「読み込めていない」と「無い」を書き分けていない");
    yes(!/無い/.test(W.meijiGap(true)),
      `読み込めていないのに「無い」と言っている: ${W.meijiGap(true)}`);

    // ---- 出せないときの見出し。⚠ 数値を作らない ----
    for (const has of [true, false]) {
      const t = W.cantSay(has);
      yes(!/\d/.test(t), `出せないのに数字が入っている: ${t}`);
      yes(/出せません|判定できません/.test(t), `出せないことを言っていない: ${t}`);
    }
    // ⚠ 地形分類が答えられるときは、範囲を限る（全部が出せないわけではない）
    yes(/建物ごと/.test(W.cantSay(true)),
      `受け皿があるのに「建物ごと」と範囲を限っていない: ${W.cantSay(true)}`);
    yes(W.cantSay(true) !== W.cantSay(false), "受け皿の有無で書き分けていない");

    // ---- 建物が 0 件のとき。⚠ 4 つを混ぜない ----
    const st = ["loading", "ok", "notyet", "fail"].map((s) => W.noBuildings(s));
    yes(new Set(st).size === 4, `建物 0 件の理由 4 通りが書き分けられていない（${new Set(st).size} 種類）`);
    // ⚠ 正常に 0 件だったときに「取得中」と言わない（以前これで出続けていた）
    yes(!/取得中/.test(W.noBuildings("ok")), `正常に 0 件なのに「取得中」と言っている: ${W.noBuildings("ok")}`);
    // ⚠ 未対応を通信のせいにしない
    yes(/通信の問題ではありません/.test(W.noBuildings("notyet")),
      `未対応なのに「通信の問題ではありません」が無い: ${W.noBuildings("notyet")}`);
    yes(!/取得中|届いていない/.test(W.noBuildings("notyet")),
      `未対応を、通信のせいに読める言い方をしている: ${W.noBuildings("notyet")}`);
    // ⚠ どれも「現地に建物が無い」と言い切らない
    for (const t of st)
      yes(!/(建物|家)(は|が)(無い|ありません)/.test(t), `建物が無いと言い切っている: ${t}`);

    // ---- 出どころの但し書き。⚠ 事前計算と実行時を混ぜない ----
    // ⚠ 水域の書き分けは 2026-08-20 に消えた。**どの土地でもその場で起こす**ので、
    //   書き分ける相手が居ない（残すと「事前計算のときがある」と読ませる）。
    yes(W.bldPre(true) !== W.bldPre(false), "建物が事前取り込みかを書き分けていない");
    // ⚠ **ここにあった WORD.precision の検査を消した**（2026-08-20。hidetzu/konjaku#125）。
    //   ⚠ **`WORD.precision` は死にコードだった**（`landformLine()` からしか呼ばれず、
    //     ⚠ その `landformLine()` を呼ぶ場所が 1 つも無かった）。
    //   ⚠ **つまりこの 2 行は、⚠ 画面に出ないものに対して「粗いときはそう書いている」と
    //     主張していた。**⚠ **守っているつもりで、何も守っていなかった。**
    //
    // ⚠ **判明した穴（実測 2026-08-20・軽井沢 36.34840,138.63200・375×667・SW 無効）**
    //   ⚠ **`/peel` は、粗い区分であることを 1 文字も言っていない。**
    //       /peel   「この土地は 低地」                      ⚠ 粗さの記述 0 件
    //       トップ  「この土地は 低地」＋「この範囲には詳細版が整備されていないため、
    //                 広い区分で答えています（より細かい分類は分かっていません）」 ✅
    //       共有カード「低地（広い区分）」＋「※ この範囲には詳細版が無く、…」 ✅
    //   ⚠ **`verify.js` 自身が「粗くなったことは必ず言う」と書いている**（249〜250 行）。
    //   ⚠ **これは死にコードを消す前からある穴。**⚠ **`/peel` の見え方を変えるので、
    //     死にコードを消す Issue（hidetzu/konjaku#125）の Scope（消すだけ・1px も変えない）の外。**
    //   ⚠ **人の判断待ち。**⚠ **ここで「確認済み」と言わないために、検査は足さずに記録だけ残す。**

    fails.length
      ? bad(`WORD の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`WORD を動かして確認（高さの出どころ 3 通り・建物 0 件の理由 4 通り・`
          + `読めなかったを「無い」と言わない・出せないときに数値を作らない）`);
  }
}

// 言葉を決めるところ（index.html の TOPWORD / RELOCATE_HOW）。
// ⚠ peel3d.js の WORD と同じ理由で外へ出した。**持ち主が違うので 1 つにまとめていない**
//   （WORD は /peel の答えと出どころ、TOPWORD はトップの根拠カードと導線）。
//   ⚠ 取り出せなくなったら落とす（黙って素通りさせない）。
{
  // ⚠ **トップの JS は `top.js`**（2026-08-24）。⚠ `<script>` から取り出す形はもう合わない。
  //   ⚠ **インラインも残っている**（SW の登録）ので、⚠ 両方を繋いで見る。
  const js = [...(src["index.html"] ?? "").matchAll(
    /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n")
    + "\n" + (src["top.js"] ?? "");
  const mw = /\nconst TOPWORD = \{[\s\S]*?\n\};/.exec(js);
  const mr = /\nconst RELOCATE_HOW = [\s\S]*?;\n/.exec(js);
  if (!mw || !mr) bad("index.html の TOPWORD / RELOCATE_HOW を取り出せない（この検査が何も見ていない）");
  else {
    const [T, R] = new Function(`${mw[0]}${mr[0]}\nreturn [TOPWORD, RELOCATE_HOW];`)();
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- ⚠ 掟の核心。読めたうえで 0 件 と、答えを出せない は別 ----
    yes(T.meiji(null, true) !== T.meiji(null, false),
      "「記録なし」と「判定できません」を書き分けていない");
    yes(/記録/.test(T.meiji(null, true)), `読めて 0 件のときの言い方が変わった: ${T.meiji(null, true)}`);
    yes(!/無い|ありません/.test(T.meiji(null, false)),
      `判定できないのに「無い」と言っている: ${T.meiji(null, false)}`);
    // ⚠ 値があるときは、but でも but でもなく、その値をそのまま出す
    yes(T.meiji("旧水部", true) === "旧水部", "値があるのに、言い換えている");

    // ---- ⚠ 取得方法の呼び名。⚠ **字は words.js が持つ**（2026-08-20 に移した）----
    //   ⚠ ここは「トップが words.js を通しているか」だけを見る。字そのものは
    //     words.js の単体テストが見る（掟: 同じ問いに答える実装を2つ持たない）。
    const KW = globalThis.KonjakuWords;
    yes(T.method("unreachable", false, "read") === KW.UNREAD,
      "読めなかったのに、そう書いていない");
    yes(T.method("ok", true, "read") === KW.EDGE, "答えが割れたのに、そう書いていない");
    yes(T.method("ok", false, "read") === KW.METHOD.read, "普通に取れたのに、読んだ値と書いていない");
    // ⚠ 読めなかったが先。読めていないのに「近くで分かれている」と言わない
    yes(T.method("unreachable", true, "read") === KW.UNREAD,
      "読めていないのに「分かれている」と言っている（割れたのではなく、読めていない）");
    // ⚠ **内部の鍵を画面に漏らさない**
    yes(T.method("ok", false, "zzz") === "", `知らない鍵が画面に出ている: ${T.method("ok", false, "zzz")}`);

    // ---- 但し書きは、当てはまるときだけ ----
    yes(T.clipped(false) === "" && /切れ/.test(T.clipped(true)), "枠の切れを書き分けていない");
    yes(T.gone(false) === "" && /無くなった/.test(T.gone(true)), "無くなったかを書き分けていない");
    // ⚠ 0m は「海面より低い」ではない（境界を取り違えない）
    yes(T.belowSea(0) === "" && T.belowSea(0.1) === "", "0m 以上なのに「海面より低い」と言っている");
    yes(/海面より低い/.test(T.belowSea(-1)), "負の標高なのに、そう言っていない");
    // ⚠ 生の font-size を書かない（トークンを通す）
    yes(!/font-size:\s*\d/.test(T.belowSea(-1)), `生の文字サイズが入っている: ${T.belowSea(-1)}`);

    // ---- ⚠ 深掘りの案内。できないことから書き始めない（CLAUDE.md §4-1）----
    const lead = T.peelLead(false);
    yes(T.peelLead(true) !== lead, "下地の有無で書き分けていない");
    yes(!/^[^。]*?(できていません|ありません|未対応)/.test(lead),
      `できないことから書き始めている: ${lead}`);
    yes(/切りかえ|見くらべ/.test(lead), `先に「何ができるか」を書いていない: ${lead}`);
    // ⚠ 在庫の話に ⚠ を使わない（危険の印と混ざる）
    for (const t of [T.peelLead(true), lead]) yes(!/⚠|⚠️/.test(t), `在庫の話に ⚠ を使っている: ${t}`);

    // ---- 位置情報の許し直し方。⚠ 端末で本当に違うので、1 つにしない ----
    yes(R(true) !== R(false), "iOS とそれ以外で手順を書き分けていない");
    yes(/Safari/.test(R(true)) && !/Safari/.test(R(false)), "iOS の手順が iOS 以外にも出ている");

    fails.length
      ? bad(`TOPWORD の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`TOPWORD を動かして確認（記録なしと判定できませんを分ける・読めなかったが「境目」より先・`
          + `0m を「海面より低い」と言わない・できないことから書き始めない）`);
  }
}

// 内訳の分け方（peel3d.js の breakdown）。
// ⚠ **分割と、分割でないものを混ぜない。**
//   実測（2026-08-19, 375×667 札幌）: 内訳に 1 行だけ「データなし 1364 / 1364」が出て、
//   `isWater("データなし")` が false なので**陸の色見本**が付いていた。
//   ⚠ 「明治期は陸だった建物が 1364 件」と読める（データの話が、土地の話に化けている）。
{
  const m = /\nconst NOT_CLASS=[\s\S]*?\nfunction paintBreakdown[\s\S]*?\n\}\n/.exec(src["peel3d.js"] ?? "");
  const mw = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src["peel3d.js"] ?? "");
  if (!m || !mw) bad("peel3d.js の breakdown を取り出せない（この検査が何も見ていない）");
  else {
    // ⚠ **`esc` も渡す**（2026-08-22。⚠ 内訳が区分名を esc するようになった）。
    //   ⚠ **本物と同じものを渡す**（⚠ ここで別物を作ると、⚠ 検査が本物を見ていない）。
    // ⚠ **`retryAt` / `retryBtn` / `wireRetry` も渡す**（2026-08-22。⚠ 取得失敗のとき、
    //   ⚠ **内訳が再試行の的を出すようになった**。⚠ 前は `#status` にしか無かった）。
    // ⚠ **`wireProvPeek` も渡す**（2026-08-23。⚠ **繋ぐ場所を、⚠ 作る場所の直後へ移した**）。
    //   ⚠ **ここでは何もしない関数でよい。**⚠ **地図が本当に変わるかは実描画が見る**
    //     （⚠ listener が消えていたことは、⚠ **DOM を組み立てただけでは分からない**）。
    const [B, W, P] = new Function("KonjakuSwale", "KonjakuProv", "esc", "retryAt", "retryBtn", "wireRetry",
      "wireProvPeek",
      `${m[0]}${mw[0]}\nreturn [breakdown, WORD, paintBreakdown];`)(
        globalThis.KonjakuSwale, globalThis.KonjakuProv,
        (globalThis.KonjakuEsc?.esc ?? ((x) => String(x))),
        { lon: 139, lat: 35, title: "テスト" },
        (lon, lat, t) => `<button class="retry-btn" data-ll="${lon},${lat}" data-title="${t}">再試行</button>`,
        () => {}, () => {});
    // ⚠ 組み立てた結果そのものを見る。**戻り値だけ見ていると、画面に出る分母を見ていない**
    //   （実測 2026-08-19: 分母を総数に戻す壊し方で、この検査が落ちなかった）
    const paint = (counts, total) => { const el = { innerHTML: "" }; P(el, B(counts, total), "ok"); return el.innerHTML; };
    // ⚠ **area を渡す口**（2026-08-22。⚠ 内訳が「建物について何が分かっているか」になったため）
    const paintTo = (counts, total, area) => {
      const el = { innerHTML: "" }; P(el, B(counts, total), "ok", false, area); return el.innerHTML; };
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- ⚠ 札幌。全件が資料の範囲外。**行を 1 本も作らない** ----
    const sap = B({ "データなし": 1364 }, 1364);
    yes(sap.rows.length === 0,
      `分類でないものを分類の行にしている: ${sap.rows.map((r) => r.name).join("・")}`);
    yes(sap.outside === 1364 && sap.classified === 0, "資料の範囲外を、判定できた件数に数えている");

    // ---- 読み込めなかった分も、分類ではない ----
    const un = B({ "読み込めず": 20, "旧水部": 80 }, 100);
    yes(un.rows.length === 1 && un.rows[0].name === "旧水部", "読み込めなかった分を分類の行にしている");
    yes(un.unread === 20 && un.classified === 80, "読み込めなかった分を、判定できた件数に数えている");
    // ⚠ 分割の分母は「判定できた件数」。総数にすると、判定できた分が小さく見える。
    //   ⚠ **組み立てた HTML で見る。**戻り値だけでは、画面に出る分母を見たことにならない
    yes(un.rows.reduce((t, r) => t + r.n, 0) === un.classified, "行を足しても、判定できた件数にならない");
    // ⚠ **内訳は作り直した**（2026-08-22。Owner 判断）。
    //   ⚠ **前は明治期の区分ごとの件数**（⚠ 分母＝判定できた件数）だった。
    //   ⚠ **いまは「建物について何が分かっているか」**（⚠ 分母＝総数）。
    //   ⚠ **明治期の区分の内訳は、⚠ 「昔はどんな土地？」が面積の分母で持つ**
    //     （⚠ 前は ⚠ **同じ区分名が 2 か所に、⚠ 別の分母で並んでいた**。掟 §6）。
    // ⚠ **主張は落としていない。**⚠ 下で、⚠ **新しい形について同じことを見る。**
    {
      const A = { total:100, dated:3, unread:20, wet:30, classified:80,
                  hSrc:{measured:40,levels:10,default:50} };
      const h = paintTo({ "読み込めず": 20, "旧水部": 80 }, 100, A);
      // ⚠ **出す数字は、⚠ 全部おなじ分母（総数）で書く**（掟 §6）。
      //   ⚠ **個数ではなく「別の分母が混ざっていないか」を見る**
      //     （⚠ 個数で見ていたら、⚠ **凡例を足したときに、⚠ 分母と無関係に落ちた**）。
      const dens = h.match(/ \/ \d+</g) ?? [];
      yes(dens.length > 0 && dens.every((d) => d === " / 100<"),
        `別の分母が混ざっている: ${dens.join() || "(無し)"}`);
      // ⚠ **色見本は、⚠ 地図と照合できるものだけ**（2026-08-23。Owner 判断）。
      //   ⚠ **2 種類ある。**⚠ **どちらも地図に相手がいる。**
      //     1. ⚠ **地図の建物の既定の色**（⚠ 水色 / 砂色。⚠ 常に地図に出ている）
      //     2. ⚠ **押しているあいだ変わる色**（⚠ ボタンの直後）
      //   ⚠ **前は行の見出しに付いていて、⚠ 2 つは地図に相手がいなかった。**
      //     ⚠ `足元が分かる` の水色 = 「明治期に水だった」の色（⚠ 4832 件の色ではない）
      //     ⚠ `高さが分かる` の砂色 = 「水でなかった」の色（⚠ 実測の建物は両方の色になる）
      const peeks = (h.match(/class="peek"/g) ?? []).length;
      yes(peeks > 0, "光らせるボタンが 1 つも無い（色見本の主張が空になる）");
      // ⚠ **押したときの色見本は、⚠ ボタンの直後**（⚠ 「押すと」の説明なので）
      const paired = (h.match(/class="peek"[^>]*>[^<]*<\/button><div class="hint"><i class="legend"/g) ?? []).length;
      yes(paired === peeks,
        `光らせるボタン ${peeks} 個 のうち、⚠ 直後に色見本があるのは ${paired} 個（何の色か分からない）`);
      // ⚠ **地図の建物の既定の色の凡例**（2026-08-23。Owner 指摘で戻した）。
      //   ⚠ **これが無いと、⚠ 地図の水色と砂色が何なのか読めない。**
      yes(/地図の建物の色/.test(h), "地図の建物の色の凡例が無い（地図の色が読めない）");
      yes(h.indexOf("地図の建物の色") < h.indexOf("class=\"peek\""),
        "地図の既定の色の凡例が、押したときの色見本より後ろにある");
      // ⚠ **砂色を「水ではなかった」と言わない**（掟 §1）。
      //   ⚠ **`wasWater` は「水と判定できた」= 1。**⚠ **判定できなかった 20 件も砂色になる。**
      yes(!/水ではなかった<\/span>|水でなかった<\/span>/.test(h),
        "砂色を「水ではなかった」と言い切っている（判定できなかった分が混ざっている。掟 §1）");
      yes(/足元を判定できなかった 20 件が含まれます/.test(h),
        "砂色に、判定できなかった件数が混ざっていることを書いていない（掟 §1）");
      // ⚠ **3 行は内訳ではないと、⚠ 字で言う**（⚠ 利用者役 3/4 が足し算して止まった）
      yes(/足し算はできません/.test(h), "3 行が内訳ではないことを書いていない");
      // ⚠ **建設年が 1 件も分かっていないときは、⚠ 光らせるボタンを出さない**（ADR 0026）
      const h0 = paintTo({ "旧水部": 80 }, 100, { ...A, dated:0 });
      yes(!/id="peekY"/.test(h0), "建設年 0 件なのに光らせるボタンがある");
      yes(/id="peekY"/.test(h), "建設年があるのに光らせるボタンが無い");
      // ⚠ **0 件でも行は出す**（⚠ 隠すのは「無い」と言うのと同じ。掟 §1）
      yes(/建てられた年が分かる/.test(h0), "建設年 0 件のとき、行ごと消えている");
      yes(/>0<span/.test(h0), "建設年 0 件のとき、0 / N と書いていない");
      // ⚠ **再試行の的は、⚠ 材料の行（`prov.js`）が持つ**（2026-08-22。Owner 判断）。
      //   ⚠ **層 3 が `missing` のとき、⚠ 内訳の器そのものが作られない**ので、
      //     ⚠ **内訳に置くと消える**（⚠ 実測 2026-08-22。⚠ 一度そこへ置いて消えた）。
      //   ⚠ **主張は同じ**（⚠ 取れなかったときは復帰手段を添える。掟）。⚠ **見る場所を移した。**
      {
        const Pr = globalThis.KonjakuProv;
        const fail = Pr.buildingRows({ bldState: "fail" })[0];
        yes(fail.retry === true, "取得に失敗したのに、再試行の的が無い（戻る手段が消える）");
        yes(/class="retry-btn"/.test(Pr.html([fail])), "再試行の的が HTML に出ていない");
        // ⚠ **未対応のときは出さない**（⚠ 押しても直らない。ADR 0026）
        const notyet = Pr.buildingRows({ bldState: "notyet" })[0];
        yes(!notyet.retry, "未対応なのに再試行の的がある（押しても何も起きない）");
        yes(!/class="retry-btn"/.test(Pr.html([notyet])), "未対応の HTML に再試行の的がある");
      }
    }
    yes(!/swatch[^>]*>\s*(データなし|読み込めず)/.test(paint({ "データなし": 5 }, 5)),
      "資料の範囲外に色見本が付いている");
    // ⚠ 読み込めなかったのと、範囲の外は、別の箱
    yes(un.outside === 0, "読み込めなかった分を、資料の範囲外に混ぜている");

    // ---- 水と陸の見分け ----
    const wl = B({ "河川・湖沼・海面": 5, "茅": 3 }, 8);
    yes(wl.rows.find((r) => r.name === "河川・湖沼・海面")?.water === true, "水域を水と見ていない");
    yes(wl.rows.find((r) => r.name === "茅")?.water === false, "陸を水と見ている");
    // 多い順
    yes(wl.rows[0].n >= wl.rows[1].n, "多い順に並んでいない");

    // ---- ⚠ 言い方。資料の話であって、土地の話ではない ----
    for (const k of ["unread", "outside"]) {
      const t = W.notClassified(k, 5, false);
      yes(!/(だった|でした)$|陸|水の上/.test(t.replace("外でした", "")),
        `土地がどうだったかを言っている（言ってよいのは資料の側だけ）: ${t}`);
      yes(!/(建物|記録)(は|が)(無い|ありません)/.test(t), `無いと言い切っている: ${t}`);
    }
    yes(W.notClassified("unread", 5, false) !== W.notClassified("outside", 5, false),
      "読み込めていないのと、範囲の外を、同じ言葉にしている");
    yes(/読み込め/.test(W.notClassified("unread", 5, false)),
      "読み込めていないことを言っていない");
    yes(!/読み込め/.test(W.notClassified("outside", 5, false)),
      "範囲の外なのに「読み込めない」と言っている（こちらの都合に読める）");
    // 全件のときと、一部のときで言い方を変える
    yes(W.notClassified("outside", 5, true) !== W.notClassified("outside", 5, false),
      "全件のときと一部のときを書き分けていない");

    fails.length
      ? bad(`breakdown の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`内訳の分け方を動かして確認（判定できなかった分を分類の行にしない・`
          + `分母は判定できた件数・読み込めていないと範囲の外を分ける）`);
  }
}

// 年代の名乗り（peel3d.js の eraReadout と groundState）。
// ⚠ ここが画面でいちばん大きい文字で、**出ていないものを「表示中」と言っていた**。
//   利用者役 3/3 が「これが主犯」と名指しした（2026-08-18）。
// ⚠ そのうえで **「まだ出ていません」と「読み込めませんでした」を混ぜない**。
//   前者は理由を知らない。後者は落ちたのを**実際に観測した**ときだけ。
//   実測（tmp/probe-map-error.mjs）: 403 と通信断は map.on("error") で拾えるが、
//   **404 は拾えない**（MapLibre は 404 を異常と見なさない）。だから 404 は前者に留まる。
// ⚠ ブラウザでは「まだ来ていない」状態を狙って作りにくい。関数を取り出して直に回す。
//   ⚠ **取り出せなくなったら落とす**（黙って素通りさせない）。
  // ============================================================
  // 面積の内訳は、主見出しと同じ分母
  // ============================================================
  // ⚠ **主見出し（`waterRatio` ＝ 範囲全体が分母）と、⚠ 内訳の分母が違っていた**
  //   （2026-08-23。⚠ **内訳は「区分を特定できた画素」が分母だった**）。
  // ⚠ 実測（2026-08-23・渋谷・`main` = `6b5daab`）:
  //   ⚠ **主見出し 1.5% ／ 内訳の水の合計 11.1%。⚠ 7.6 倍。**
  //   ⚠ **豊洲は全画素に区分が付くので一致していた**（95.3% ／ 95.2%）。⚠ **だから気づけなかった。**
  head("2.7. 面積の内訳は、主見出しと同じ分母");
  {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const m = src["peel3d.js"].match(/function summarizeLand\([\s\S]*?\n\}/);
    if (!m) fails.push("summarizeLand を取り出せない（この検査が何も見ていない）");
    else {
      const S = new Function(`${m[0]}\nreturn summarizeLand;`)();
      // ⚠ **端の土地**（⚠ 範囲の一部にしか区分が付いていない）
      const edge = S({ "田": 100, "河川・湖沼・海面": 20 }, 120, 1000);
      yes(edge, "端の土地で内訳を作れない");
      yes(edge.total === 1000, `分母が範囲全体でない: ${edge.total}`);
      yes(edge.rest === 880, `特定できなかったぶんが合わない: ${edge.rest}`);
      yes(edge.all[0].pct === "10.0", `田が範囲全体の分母で出ていない: ${edge.all[0].pct}`);
      yes(edge.all[1].pct === "2.0", `水が範囲全体の分母で出ていない: ${edge.all[1].pct}`);
      // ⚠ **足して 100 になる**（⚠ 特定できなかったぶんを含めて）
      const sum = edge.all.reduce((t, x) => t + Number(x.pct), 0) + edge.rest / edge.total * 100;
      yes(Math.abs(sum - 100) < 0.2, `足して 100 にならない: ${sum.toFixed(1)}`);
      // ⚠ **全部に区分が付く土地では、⚠ いままでどおり**（⚠ 豊洲）
      const full = S({ "河川・湖沼・海面": 800, "干潟・砂浜": 200 }, 1000, 1000);
      yes(full.rest === 0, `全部に区分が付くのに残りがある: ${full.rest}`);
      yes(full.all[0].pct === "80.0", `豊洲側の数字が変わった: ${full.all[0].pct}`);
      // ⚠ **渡ってこないときは、⚠ 前と同じ挙動に落ちる**（⚠ 黙って壊れない）
      const old = S({ "田": 50 }, 100);
      yes(old.total === 100 && old.rest === 0, `分母が渡らないときに落ちていない: ${JSON.stringify(old)}`);
    }
    if (fails.length) bad(`面積の内訳の分母（${fails.length} 件）: ${fails.join(" / ")}`);
    else ok("面積の内訳は主見出しと同じ分母（足して 100・特定できなかったぶんも数える）");
  }

  // ============================================================
  // 場所の指定の読み書きは 1 か所（public/place-arg.js）
  // ============================================================
  // ⚠ **hidetzu/konjaku#221。**⚠ `/peel` とトップが、⚠ **同じ答えから引く。**
  //   ⚠ **2 か所に形の判定を持つと、⚠ 「深掘りできる」と「戻す」の判断がずれる。**
  head("2.8. 場所の指定の読み書きは 1 か所");
  {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    await import(`file://${join(PUB, "place-arg.js")}`);
    const P = globalThis.KonjakuPlaceArg;
    yes(P?.readPlace, "place-arg.js が readPlace を出していない（この検査が何も見ていない）");
    if (P?.readPlace) {
      const r = (q) => P.readPlace(new URLSearchParams(q));
      // ⚠ **3 つを分ける**（⚠ 混ぜると、⚠ 何も指定していない人に「読み取れなかった」と言う）
      yes(r("ll=35.65,139.79").state === "ok", "読める座標を ok にしていない");
      yes(r("q=名古屋").state === "none", "座標の指定が無いのを none にしていない");
      yes(r("").state === "none", "引数なしを none にしていない");
      yes(r("ll=").state === "none", "空の ll を none にしていない（指定が無いのと同じ）");
      yes(r("ll=abc").state === "bad", "読めない座標を bad にしていない");
      // ⚠ **形は通るが数にならないもの**（⚠ 緩いと、⚠ 地図が別の場所を出す）
      yes(r("ll=1e999,0").state === "bad", "数にならない座標を bad にしていない");
      yes(r("ll=999,0").state === "bad", "地球の外の緯度を bad にしていない");
      yes(r("ll=0,999").state === "bad", "地球の外の経度を bad にしていない");
      // ⚠ **q を落とさない**（⚠ 落とすと、⚠ 利用者が入れた地名まで消える）
      yes(r("q=名古屋").q === "名古屋", "座標が無いときに q を落としている");
    }
    if (P?.topUrlFor) {
      const u = (q, st) => P.topUrlFor(new URLSearchParams(q), st);
      // ⚠ **何も指定が無ければ黙る**（Owner 判断 2026-08-23）
      yes(u("", "none") === "./", `引数なしで断っている: ${u("", "none")}`);
      // ⚠ **指定があれば言う**
      yes(/noplace=none/.test(u("q=x", "none")), "q だけのときに理由を渡していない");
      yes(/noplace=bad/.test(u("ll=abc", "bad")), "壊れた ll のときに理由を渡していない");
      // ⚠ **era を捨てない**（⚠ Issue の AC 2: ⚠ 黙って別の年代に差し替わらない）
      yes(/era=swale/.test(u("q=x&era=swale", "none")), "era を黙って捨てている");
      // ⚠ **b（建物）は持って行かない**（⚠ トップに建物を選ぶ画面が無い。ADR 0026）
      yes(!/[?&]b=/.test(u("q=x&b=1,2", "none")), `建物の鍵をトップへ持って行っている: ${u("q=x&b=1,2", "none")}`);
    } else fails.push("place-arg.js が topUrlFor を出していない");

    // ⚠ **URL を組むのも 1 か所**（2026-08-23）。⚠ **読む側と対で見る。**
    //   ⚠ 実測: ⚠ 組み立てが **4 か所**にあった（トップ 3・`/peel` 1）。
    if (P?.placeQuery) {
      const Q = P.placeQuery;
      const a = { title: "東京都江東区豊洲", lat: 35.6548, lon: 139.7975 };
      // ⚠ **往復で見る。**⚠ **書いたものが、⚠ そのまま読み戻せること。**
      //   ⚠ 片方だけ直すと、⚠ **自分で書いた URL を、⚠ 自分で読めなくなる。**
      const back = P.readPlace(new URLSearchParams(Q(a)));
      yes(back.state === "ok", `書いた URL を読み戻せない: ${Q(a)}`);
      yes(back.q === a.title, `往復で地名が変わった: ${back.q}`);
      yes(Math.abs(back.lat - a.lat) < 1e-5 && Math.abs(back.lon - a.lon) < 1e-5,
        `往復で座標が変わった: ${back.lat},${back.lon}`);
      // ⚠ **並びは lat,lon**（⚠ 逆にすると、⚠ 黙って別の場所になる）
      yes(new URLSearchParams(Q(a)).get("ll").startsWith("35."),
        `ll の並びが lat,lon ではない: ${new URLSearchParams(Q(a)).get("ll")}`);
      // ⚠ **年代と建物は、⚠ 渡したときだけ載る**（⚠ 勝手に足さない・勝手に落とさない）
      yes(!/[?&]era=/.test(Q(a)), `年代を渡していないのに era が載っている: ${Q(a)}`);
      yes(/[?&]era=swale/.test(Q({ ...a, era: "swale" })), "era を渡しても載っていない");
      yes(!/[?&]b=/.test(Q(a)), `建物を渡していないのに b が載っている: ${Q(a)}`);
      yes(/[?&]b=/.test(Q({ ...a, bld: "1,2" })), "建物を渡しても載っていない");
      // ⚠ **座標が読めないときは組まない**（⚠ NaN を載せた URL を共有させない）
      yes(Q({ title: "x" }) === null, "座標が無いのに URL を組んでいる");
      yes(Q({ title: "x", lat: 999, lon: 0 }) === null, "地球の外なのに URL を組んでいる");
      // ⚠ **読む側が `bad` と言う値では、⚠ 書く側も組まないこと。**
      //   ⚠ **判定を 2 つ持つと、⚠ 書けるのに読めない URL が作れる。**
      for (const ll of ["999,0", "0,999", "abc"]) {
        const [la, lo] = ll.split(",").map(Number);
        yes(P.readPlace({ ll }).state === "bad" && Q({ title: "x", lat: la, lon: lo }) === null,
          `読む側と書く側で判定が食い違う: ${ll}`);
      }
    } else fails.push("place-arg.js が placeQuery を出していない");

    // ⚠ **形も組み立ても、⚠ どの画面も持ち直していないこと**（⚠ 2 か所になると必ずずれる）。
    //   ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 説明の字面を自分で拾う）。
    //   ⚠ **`https://` の `//` は残す**（⚠ 落とすと行末まで消えて、⚠ 見張りが素通りする）。
    const bare = (f) => src[f]
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const pj = bare("peel3d.js");
    // ⚠ **トップも見る**（2026-08-23）。⚠ **以前は `/peel` しか見ておらず、
    //   ⚠ `index.html` が同じ正規表現を直書きしていたのを素通りさせていた。**
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const b = bare(f);
      const shape = (b.match(/\^-\?\[\\d\.\]\+,-\?\[\\d\.\]\+\$/g) ?? []).length;
      yes(shape === 0, `${f} が座標の形を持ち直している（${shape} か所）。place-arg.js が正本`);
      // ⚠ **組み立ての印**（⚠ `&ll=` を差し込んでいたら、⚠ そこで URL を作っている）
      const built = (b.match(/&ll=\$\{/g) ?? []).length;
      yes(built === 0, `${f} が URL を組み直している（${built} か所）。place-arg.js が正本`);
      // ⚠ **座標の桁**（⚠ `land.js` の控えの鍵は別の問いなので、⚠ ここでは見ない）
      const dig = (b.match(/toFixed\(5\)/g) ?? []).length;
      yes(dig === 0, `${f} が座標の桁を持ち直している（${dig} か所）。place-arg.js の DIGITS が正本`);
    }
    // ⚠ **既定の座標へ黙って落ちる道が残っていないこと**（⚠ これが元の不具合）
    yes(!/loadArea\(139\.7975,\s*35\.6548/.test(pj),
      "peel3d.js に、既定の豊洲へ黙って落ちる道が残っている（hidetzu/konjaku#221 の不具合そのもの）");

    // ⚠ **断りの字が、⚠ 検索欄と同じ語を別の意味で使っていないこと**（2026-08-23）。
    //   ⚠ **検索欄は「地名・住所を入力」。**⚠ 断りで「共有された住所」と書くと、
    //     ⚠ **同じ画面で「住所」が URL と 街の住所 の 2 つを指す。**
    await import(`file://${join(PUB, "words.js")}`);
    const np = globalThis.KonjakuWords?.noPlace ?? {};
    yes(np.none && np.bad, "words.js に noPlace（指定なし／読めない）が無い");
    for (const [k, t] of Object.entries(np)) {
      yes(!/住所/.test(t), `noPlace.${k} が「住所」を使っている（検索欄と意味が食い違う）: ${t}`);
      yes(!/⚠/.test(t), `noPlace.${k} が ⚠ を使っている（災害リスク専用）: ${t}`);
      yes(!/存在しません/.test(t), `noPlace.${k} が「存在しません」と言っている: ${t}`);
      // ⚠ **できないことから書き始めない**（CLAUDE.md §4-1）。⚠ 先に何ができるか
      yes(/^場所を選ぶと/.test(t), `noPlace.${k} が、できることから始まっていない: ${t}`);
    }
    // ⚠ **2 つを取り違えていないこと**（⚠ 何も指定していない人に「読み取れない」と言わない）
    yes(np.none && !/読み取れ/.test(np.none),
      `指定が無いときに「読み取れません」と言っている: ${np.none}`);
    yes(np.bad && /読み取れ/.test(np.bad),
      `読めなかったときに、読めなかったと言っていない: ${np.bad}`);

    if (fails.length) bad(`場所の指定の読み方（${fails.length} 件）: ${fails.join(" / ")}`);
    else ok("場所の指定は place-arg.js の 1 か所（読み: ok/指定なし/読めない ／ 書き: 往復・年代と建物は任意・地球の外は組まない）");
  }

  // ============================================================
  // 段の作り方は 1 か所（public/eras.js）
  // ============================================================
  // ⚠ **同じ問い（この地点で選べる段はどれか）に、⚠ 2 つの実装が答えていた**
  //   （hidetzu/konjaku#170。⚠ トップの `buildFrames` と `/peel` の `stepsFrom`）。
  // ⚠ **すでに 1 か所ずれていた**（実測 2026-08-23・`main` = `9b6e83b`）:
  //   ⚠ **トップは明治期を「判定できたときだけ」足し、⚠ `/peel` は無条件に足していた。**
  head("2.6. 段の作り方は 1 か所");
  {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ⚠ AC 1: DOM も地図も持たない（⚠ Node から呼べる条件）
    const src2 = src["eras.js"];
    if (src2 == null) fails.push("public/eras.js を読めない（この検査が何も見ていない）");
    else {
      // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ 説明に書いた字を自分で拾う（掟）
      const code = src2.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trim().startsWith("//")).join("\n");
      // ⚠ **末尾の IIFE 引数だけは除く**（`photos.js` ほか 7 つと同じ形。
      //   ⚠ `(typeof window === "undefined" ? globalThis : window)`）。
      //   ⚠ **ここを数えると、⚠ この repo の作法そのものが落ちる。**
      const body = code.replace(/\(typeof window[^)]*\);?\s*$/, "");
      for (const w of ["document", "window", "maplibregl", "map.", "querySelector", "getElementById"])
        yes(!body.includes(w), `public/eras.js が ${w} を触っている（Node から呼べなくなる）`);
    }

    // ⚠ AC 2: Node から呼べて、⚠ 全組み合わせを回せる
    await import(`file://${join(PUB, "eras.js")}`);
    const E = globalThis.KonjakuEras;
    if (!E) fails.push("public/eras.js を読み込めない（この検査が何も見ていない）");
    else {
      const LATEST = { id: "now", label: "現在" };
      const MEIJI = { id: "swale", label: "明治期", meiji: true };
      const era = (id, state, blank = false) => ({ id, label: id, state, blank });

      // ⚠ **落とし方**（⚠ 2 画面で一致していたものを、⚠ そのまま 1 か所に持つ）
      yes(E.keepEra(era("a", "unreachable")), "読めなかった年代を落としている（取れなかった ≠ 無い）");
      yes(E.keepEra(era("a", "ok")), "読めた年代を落としている");
      yes(!E.keepEra(era("a", "ok", true)), "白紙（撮影範囲の外）を段に出している");
      yes(!E.keepEra(era("a", "absent")), "404（写真が無い）を段に出している");

      // ⚠ **明治期は、⚠ 判定できたときだけ**（⚠ ADR 0012: 無いものを並べない）
      const photos = { eras: [era("x", "ok"), era("y", "unreachable"), era("z", "ok", true)] };
      const withM = E.stepsOf({ photos, latest: LATEST, meiji: MEIJI, hasMeiji: true });
      const noM = E.stepsOf({ photos, latest: LATEST, meiji: MEIJI, hasMeiji: false });
      yes(withM[0]?.id === "swale", `明治期が先頭に無い: ${withM.map((e) => e.id).join()}`);
      yes(!noM.some((e) => e.id === "swale"),
        `明治期のデータが無いのに段に出している: ${noM.map((e) => e.id).join()}`);
      yes(noM.length === withM.length - 1, "明治期を外したのに段の数が変わっていない");

      // ⚠ **並びは古い順**（⚠ 向きは呼ぶ側が決める）。⚠ 現在は最後
      yes(withM.at(-1)?.id === "now", `「現在」が最後に無い: ${withM.map((e) => e.id).join()}`);
      yes(withM.filter((e) => e.id === "z").length === 0, "白紙が段に混ざっている");
      yes(withM.filter((e) => e.id === "y").length === 1, "読めなかった年代が段から消えている");

      // ⚠ **写真そのものが取れなかったときは、⚠ 何も間引かない**（掟）
      const all = [era("x", "ok"), era("y", "ok")];
      yes(E.stepsOf({ all, latest: LATEST, meiji: MEIJI, hasMeiji: true }).length === 4,
        "判定が落ちたときに段を間引いている（確かめられなかったを「無い」にしている）");

      // ⚠ **いま何段目か**（⚠ 見つからないときは -1。⚠ 0 に丸めない）
      yes(E.indexOf(withM, "x") > 0, "段の位置を返していない");
      yes(E.indexOf(withM, "無い") === -1, "知らない段を 0 段目にしている");

      // ⚠ **前後は端で止まる**（⚠ 回り込まない）
      yes(E.step(withM, 0, -1) === 0, "左端で回り込んでいる");
      yes(E.step(withM, withM.length - 1, 1) === withM.length - 1, "右端で回り込んでいる");

      // ⚠ **復元は種類で返す**（⚠ 字はここで作らない。`words.js` が持つ）
      yes(E.resolve(withM, null).kind === "none", "復元するものが無いのに答えている");
      yes(E.resolve(withM, "x").kind === "ok", "在る年代を復元できていない");
      yes(E.resolve(withM, "無い").kind === "gone", "無い年代を「復元できた」と答えている");
      const gone = E.resolve(withM, "無い");
      yes(!/[ぁ-んァ-ン一-龥]{4,}/.test(JSON.stringify(gone).replace(/無い/g, "")),
        `復元の答えが字を持っている（字は words.js の担当）: ${JSON.stringify(gone)}`);
    }

    // ⚠ AC 3・AC 6: 両画面が同じ 1 か所を呼び、⚠ 段を作り直すコードが残っていない
    for (const [f, code] of [["public/top.js", src["top.js"]],
                             ["public/peel3d.js", src["peel3d.js"]]]) {
      if (code == null) { fails.push(`${f} を読めない`); continue; }
      yes(code.includes("KonjakuEras.stepsOf"), `${f} が段の作り方を 1 か所から借りていない`);
      // ⚠ **コメントを先に落とす**（⚠ 説明に書いた字を拾わない）
      const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trim().startsWith("//")).join("\n");
      // ⚠ **落とし方をもう一度書いていないこと**（⚠ ずれの再発）。
      //   ⚠ **`unreachable` は段以外にも出る**（⚠ `peel3d.js` の地形分類）。
      //   ⚠ **段の話かどうかで見る**（⚠ 白紙の判定は段にしか無い）。
      yes(!/\.blank/.test(bare), `${f} が白紙の判定を持っている（段の作り方は 1 か所）`);
      yes(!/eras\s*\?\?\s*\[\]/.test(bare) && !/photos\?\.eras/.test(bare),
        `${f} が写真の年代から段を組み直している（段の作り方は 1 か所）`);
    }

    // ⚠ **読み込み忘れを捕まえる**（⚠ 入れ忘れると、⚠ オフラインで段が作れない）
    yes((src["sw.js"] ?? "").includes('"/eras.js"'), "sw.js の SHELL に /eras.js が無い");
    for (const f of ["peel.html", "index.html"])
      yes((src[f] ?? "").includes("eras.js"), `${f} が eras.js を読み込んでいない`);

    if (fails.length) bad(`段の作り方が 1 か所になっていない（${fails.length} 件）: ${fails.join(" / ")}`);
    else ok(`段の作り方は public/eras.js の 1 か所（DOM 0 件・Node から全組み合わせ・両画面が同じ口）`);
  }

  // ⚠ **2026-08-20 に、状態を決めるのは public/photos.js の 1 か所へ移した。**
  //   ⚠ **見ている主張は変えていない。**取り出す先だけ変えた。
  //   ⚠ **字を決めるのは words.js。**⚠ **状態と字を分けてある。**
  {
    await import(`file://${join(PUB, "photos.js")}`);
    await import(`file://${join(PUB, "words.js")}`);
    const P = globalThis.KonjakuPhotos;
    // ⚠ **2026-08-20 に引数が減った**（素性と online は状態が持つ）。⚠ **置くだけになった。**
    const em = /\nfunction eraReadout\(state, sub\)\{[\s\S]*?\n\}/.exec(src["peel3d.js"] ?? "");
    if (!P || !em) bad(`${!P ? "photos.js を読み込めない" : "peel3d.js の eraReadout を取り出せない"}（この検査が何も見ていない）`);
    else {
      const G = P.stateOf;
      // ⚠ eraReadout は words.js を借りている。Node でも同じものを渡す
      const f = new Function("KonjakuWords", `${em[0]}\nreturn eraReadout;`)(globalThis.KonjakuWords);
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const FAIL = { why: "通信できません" };

    // ---- 3 つの状態を取り違えない ----
    yes(G(true, false, null).kind === "ok", "届いているのに ok にならない");
    yes(G(true, true, FAIL).kind === "ok", "届いているのに、落ちた扱いになる");
    yes(G(false, true, FAIL).kind === "fail", "落ちたのに fail にならない");
    yes(G(false, false, FAIL).kind === "fail", "落ちたのに、猶予中だと fail にならない");
    yes(G(false, true, null).kind === "late", "猶予を過ぎたのに late にならない");
    yes(G(false, false, null).kind === "pending", "まだ猶予中なのに pending にならない");

    // ⚠ **2026-08-20: 素性（何の写真か）と online は、状態が持つようになった。**
    //   ⚠ **見ている主張は変えていない。**⚠ 渡し方だけ変えた。
    const E = (isLatest, isMeiji) => ({ isLatest, isMeiji });
    for (const [isLatest, isMeiji, what] of [[true, false, "現在"], [false, false, "過去"], [false, true, "明治期"]]) {
      // ---- 届いているとき ----
      // ⚠ **普段は名乗らない。**（2026-08-19 に変えた）
      //   出ているのが当たり前のときに名乗ると、主役（年代）から目を奪う。
      //   実測: 320 幅で年代の字 38px に対し名乗りは 12px だが、行の頭に居るので先に読まれ、
      //   利用者役は「何のことか一瞬分からなかった」と答えた。
      //   ⚠ **守りたいのは「出ていないものを表示中と言わない」ほう。**それは下で見る。
      const ok = f(G(true, false, null, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(!ok.kick, `${what}: 届いているのに「${ok.kick}」と名乗っている（普段は名乗らない）`);
      yes(ok.sub === "最新の空中写真", `${what}: 届いているときの説明が変わった`);
      yes(!ok.hint, `${what}: 届いているのに接続の話をしている`);

      // ---- 猶予切れ（理由を知らない）----
      const late = f(G(false, true, null, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(late.kick !== "表示中", `${what}: 出ていないのに「表示中」と言っている`);
      // ⚠ **出ていないときは必ず名乗る。**空にすると、普段と見分けがつかなくなる
      yes(!!late.kick, `${what}: 出ていないのに何も名乗っていない（普段と区別がつかない）`);
      // ⚠ **理由を知らないのに断定しない。** 404 はここに来る
      yes(!/読み込めませんでした|取得できませんでした|失敗/.test(late.sub),
        `${what}: 理由を知らないのに「読み込めませんでした」と断定している`);
      yes(!late.hint, `${what}: 理由を知らないのに接続のせいにしている`);
      yes(!/が無い|ありません|存在しません/.test(late.sub), `${what}: 「無い」と言い切っている`);

      // ---- 落ちたのを観測したとき ----
      const bad1 = f(G(false, true, FAIL, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(!!bad1.kick, `${what}: 落ちたのに何も名乗っていない`);
      yes(/読み込めませんでした/.test(bad1.sub), `${what}: 落ちたのに、そう書いていない`);
      yes(bad1.sub.includes("通信できません"), `${what}: 観測した理由を落としている`);
      // ⚠ つながっているときは**言い切らない**。取れない理由をこちらは知らない
      yes(bad1.hint === "接続を確認してください",
        `${what}: online=true なのに「${bad1.hint}」と言っている（言い切らない）`);
      const off = f(G(false, true, FAIL, E(isLatest, isMeiji), false), "最新の空中写真");
      yes(/接続していません/.test(off.hint ?? ""),
        `${what}: 圏外だと端末が言っているのに、そう伝えていない`);
      // ⚠ 落ちても「無い」とは言わない（掟の一行目）
      yes(!/写真が無い|存在しません/.test(bad1.sub + (bad1.hint ?? "")), `${what}: 落ちたことを「無い」と書いている`);
    }
    // 3 つは別の文。どれが出ていないのか分かること
    const subs = new Set(["現在", "過去", "明治期"].map((_, i) =>
      f(G(false, true, null, { isLatest: i === 0, isMeiji: i === 2 }, true), "x").sub));
    yes(subs.size === 3, `出ていないときの説明が ${subs.size} 種類しかない（現在・過去・明治期で書き分ける）`);
    fails.length
      ? bad(`eraReadout / groundState の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`eraReadout / groundState を動かして確認（ok・pending・late・fail × 現在／過去／明治期。`
          + `普段は名乗らず、出ていないときは必ず名乗る。理由を知らないときは断定せず、圏外のときだけ言い切る）`);
  }
}

// 地表のタイルが「その地点を覆っているか」の計算（peel3d.js の tilesCover）。
// ⚠ ブラウザでは、狙ったタイルだけを届かせる／届かせない状態を作れない。
//   関数を取り出して直に回す。⚠ **取り出せなくなったら落とす**（黙って素通りさせない）。
  // ⚠ **2026-08-20 に public/photos.js の 1 か所へ移した。**⚠ 見ている主張は同じ。
  {
    await import(`file://${join(PUB, "photos.js")}`);
    const f = globalThis.KonjakuPhotos?.covers;
    if (!f) bad("photos.js の covers を取り出せない（この検査が何も見ていない）");
    else {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const Z = 16;
    // 同じ段（z16）。中心が入っているタイルだけが根拠になる
    yes(f(["16/58210/25806"], 58210.5, 25806.5, Z) === true, "同じ段で覆っている");
    yes(f(["16/58210/25806"], 58211.5, 25806.5, Z) === false, "隣のタイルは根拠にならない");
    // ⚠ 地図は表示ズーム+1段で取ることがある。段を決め打ちしない
    yes(f(["17/116421/51613"], 58210.5, 25806.5, Z) === true, "1段下（z17）でも覆っていると分かる");
    yes(f(["15/29105/12903"], 58210.5, 25806.5, Z) === true, "1段上（z15）でも覆っていると分かる");
    yes(f([], 58210.5, 25806.5, Z) === false, "1枚も来ていなければ覆っていない");
    // ⚠ 「1枚でも読めた」では駄目。別の場所のタイルは、この地点の根拠にならない
    yes(f(["16/1/1", "16/2/2"], 58210.5, 25806.5, Z) === false, "別の場所のタイルは根拠にならない");
    fails.length
      ? bad(`tilesCover の単体テストが失敗（${fails.length} 件）: ${fails.join(" / ")}`)
      : ok(`tilesCover を動かして確認（同じ段・上下1段・別の場所・空）`);
  }
}

// ---------- 9. 画面の言葉 ----------
head("9. 画面の言葉");
// 画面に出ている語の棚卸し。判断は docs/adr/0029-画面の言葉は利用者の問いから決める.md。
//
// ⚠ **散文の表を文書に置かない。** 文言は段階を分けて直すので、表を文書へ書くと、
//   直した先から表のほうが黙って古くなる（CLAUDE.md「古くなったコメントはコードより強く誤誘導する」）。
//   ここに置いて、**両方向で**突き合わせる:
//     ① 表より少ない … 直したのに表に残っている（表が古い）
//     ② 表より多い   … 増やした（棚卸しを通さずに内部語が増えた）
{
  // ⚠ **コメントを先に落とす。** 落とさないと、この棚卸しを説明するコメント自身を数える
  //   （CLAUDE.md「検査が文書やコメントを読むとき、コメントを先に落とす」。2 回踏んでいる）。
  //   実測（2026-08-17）: 落とさないと index.html の「直読み」は 3 件見えるが、
  //   3 件とも CSS と JS のコメントで、**画面には 1 件も出ていない**。
  //
  // ⚠ 7 節にも JS を舐める実装があるが、答えている問いが違う
  //   （あちら「テンプレートの ${…} に何が入るか」／こちら「コメントを消した本文」）。
  const REGEX_OK = /[(,=:[!&|?{};+\-*%~^<>]$/;
  const torn = [];        // 改行をまたいだ引用符＝取り違えの証拠（下で 0 件を確かめる）
  // ⚠ テンプレート文字列の `${…}` は入れ子になる。追わないと、穴の中の ` で
  //   テンプレートが終わったことにして、そこから先が全部ずれる
  //   （実測: peel3d.js の pickCard() で起き、L519 以降のコメントが 1 つも落ちなかった）。
  const stripJs = (s, file) => {
    const n = s.length;
    let out = "", i = 0, braces = 0, inTpl = false;
    const holes = [];
    while (i < n) {
      const c = s[i], d = s[i + 1];
      if (inTpl) {
        if (c === "\\") { out += s.slice(i, i + 2); i += 2; continue; }
        if (c === "`") { out += c; i++; inTpl = false; continue; }
        if (c === "$" && d === "{") { out += "${"; i += 2; holes.push(braces); braces = 0; inTpl = false; continue; }
        out += c; i++; continue;
      }
      if (c === "/" && d === "*") { const e = s.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; out += " "; continue; }
      if (c === "/" && d === "/") { const e = s.indexOf("\n", i); i = e < 0 ? n : e; out += " "; continue; }
      if (c === '"' || c === "'") {
        const q = c, st = i; out += c; i++;
        while (i < n) {
          if (s[i] === "\\") { out += s.slice(i, i + 2); i += 2; continue; }
          out += s[i];
          if (s[i] === q) { i++; break; }
          i++;
        }
        if (s.slice(st, i).includes("\n")) torn.push(`${file}「${s.slice(st, i).split("\n")[0].slice(0, 40)}…」`);
        continue;
      }
      if (c === "`") { out += c; i++; inTpl = true; continue; }
      if (c === "{") { braces++; out += c; i++; continue; }
      if (c === "}") {
        if (braces === 0 && holes.length) { out += c; i++; braces = holes.pop(); inTpl = true; continue; }
        if (braces > 0) braces--;
        out += c; i++; continue;
      }
      // 正規表現リテラルは飛ばす。飛ばさないと `/"/g` の " から先を文字列と読む
      if (c === "/" && REGEX_OK.test(out.replace(/\s+$/, ""))) {
        let j = i + 1, cls = false, done = -1;
        while (j < n) {
          if (s[j] === "\\") { j += 2; continue; }
          if (s[j] === "[") cls = true;
          else if (s[j] === "]") cls = false;
          else if (s[j] === "\n") break;
          else if (s[j] === "/" && !cls) { done = j; break; }
          j++;
        }
        if (done > 0) { out += s.slice(i, done + 1); i = done + 1; continue; }
      }
      out += c; i++;
    }
    return out;
  };
  // ⚠ HTML の本文に JS の物差しを当てない。`</a>` の `/` の前は `<` で、
  //   正規表現リテラルの始まりに見える。当てたときは、そこから次の `/` までを飲み込み、
  //   出典欄のリンク（index.html:831 付近）が丸ごと消えた（実測 2026-08-17）。
  const stripHtml = (s, file) => s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a, body, b) => a + body.replace(/\/\*[\s\S]*?\*\//g, " ") + b)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, a, body, b) => a + stripJs(body, file) + b);

  // ⚠ **`.js` でも HTML コメントを落とす**（2026-08-24。⚠ **実際に踏んだ**）。
  //   ⚠ この repo の JS は、⚠ **テンプレートリテラルの中に HTML を書く。**
  //     ⚠ そこには `<!-- -->` のコメントも入る。
  //   ⚠ **`.html` 側は `stripHtml` が先に落としていた**が、⚠ **`.js` 側は素通りだった。**
  //   ⚠ `index.html` の JS を `top.js` へ出したとき、⚠ **その穴が表に出た**
  //     （⚠ 「一度消した語が戻っている」が、⚠ **説明のコメントを拾って落ちた**）。
  //   ⚠ **`peel3d.js` にも同じ穴があった**（⚠ たまたま引っかかる語が無かっただけ）。
  //   ⚠ **`CLAUDE.md` §5: 検査が文書やコメントを読むとき、⚠ コメントを先に落とす。**
  const dropHtmlComments = (t) => t.replace(/<!--[\s\S]*?-->/g, " ");
  const seen = {};
  for (const f of [...htmlFiles, ...jsFiles])
    seen[f] = f.endsWith(".html") ? stripHtml(src[f], f) : dropHtmlComments(stripJs(src[f], f));

  // ⚠ **トップの画面は 2 ファイル**（2026-08-24）。⚠ **JS の振る舞いを見る検査はこちら。**
  //   ⚠ **語の棚卸し（SCREEN_WORDS）は `seen` のまま**（⚠ 繋ぐと二重に数える）。
  const seenTop = `${seen["index.html"] ?? ""}\n${seen["top.js"] ?? ""}`;

  // この検査そのものの健全性。取り違えると、静かに数え落として緑になる
  torn.length
    ? bad(`コメント落としが取り違えている（改行をまたぐ引用符 ${torn.length} 件）: ${torn.slice(0, 3).join("、")}`
        + `（この状態では、語を数え落としても緑になる）`)
    : ok(`コメント落としが取り違えていない（改行をまたぐ引用符 0 件 / ${Object.keys(seen).length} ファイル）`);

  // 棚卸し（2026-08-17 実測）。
  //   kind … 分類 = 作り手側の区別で、利用者の問いではない
  //          状態 = 4つの状態（正常0件 / 対象範囲外 / 取れなかった / 判定できない）を指す語
  //   live … コメントを落としたあとに残る件数。**0 になったら、この行ごと消す**
  //   next … どの段で直すか
  const SCREEN_WORDS = [
    // ⚠ **2026-08-20（#9d）に、次の 4 語が画面から消えた。**⚠ **行ごと落とした。**
    //   `自前・根拠あり` … ⚠ **中身が全部この土地の根拠で、バッジが何も分けていなかった**
    //   `根拠あり`       … ⚠ 一覧行のタグは #9c で `今昔で見る` に。バッジは上と一緒に消えた
    //   `直読み` `ベクトル直読み`
    //                  … ⚠ **取り方の話で、確かさを語っていなかった**。`読んだ値` に。
    //                    ⚠ **字は words.js の METHOD が持ち、verify.js は鍵だけ渡す**
    // ⚠ **2026-08-20 に、字の持ち主を `public/words.js` の 1 か所へ寄せた。**
    //   ⚠ **画面に出る字は 1 文字も変えていない。**⚠ **だから live はほとんど減らない。**
    //     減ったのは**写し**のほう（外部↗ 2 → 1・記録なし 3 → 1・判定できません 5 → 3）。
    //   ⚠ **言い換えそのものは、まだ済んでいない**（画面に出る言葉なので人が決める）。
    // ⚠ **一覧行のタグは 2026-08-20 に「行き先」で言い直した**（#9c）。
    //   ⚠ `根拠あり` → `今昔で見る` ／ `外部↗` → `別のサイト↗`。
    //   ⚠ **`根拠あり` は作り手側の分類で、しかも実態と合っていなかった**
    //     （own は「根拠がある行」ではなく「今昔の中で開くレンズ」。why の側にも根拠はある）。
    { word: "境目", kind: "分類", live: 4, next: "済",
      files: ["verify.js"],
      seat: "⚠ **2026-08-20 に 5 → 4。**取得方法バッジからは消えた（`近くで分かれている` に）。"
          + "⚠ **残る 4 件は語ではなく文**（「区分の境目にあたる可能性がある」など）。"
          + "⚠ **作り手側の分類ではなく、土地そのものの説明**なので残す" },
    { word: "データ・判定について", kind: "分類", live: 1, next: "済",
      files: ["index.html", "top.js"],
      seat: "フッターの畳み見出し。⚠ **2026-08-20 に「データについて」から。**"
          + "中身は判定方法・位置誤差・提供範囲・限界まで説明していて、見出しと合っていなかった" },
    { word: "この範囲で、年が記録されているもの", kind: "分類", live: 1, next: "済",
      files: ["index.html", "top.js"],
      seat: "フッターの出典欄。⚠ **2026-08-20 に「この範囲にできていたもの」から。**"
          + "⚠ **開業／設立／完成のどれかを区別できない**ので、「できていた」と言い切らない" },
    // ⚠ **2026-08-20 に言い直した**（#9c）。⚠ **「変化が無かった」と読ませない。**
    //   こちらが持っている記録の話であって、現実に何も起きなかったという意味ではない。
    { word: "この期間に表示できる変化の記録は見つかっていません", kind: "状態", live: 1, next: "済",
      files: ["index.html", "top.js"], seat: "正常0件。Wikidata は読めている" },
    { word: "記録なし", kind: "状態", live: 1, next: "#9c",
      files: ["words.js"],
      seat: "正常0件（明治期タイルは読めた）。⚠ **2026-08-20 に 3 → 1**。"
          + "index.html / verify.js / share.js が同じ字を別々に書いていた（共有カードにも出る）" },
    { word: "判定できません", kind: "状態", live: 3, next: "#9c",
      files: ["verify.js", "peel3d.js", "words.js"],
      seat: "判定できない。「判定できませんでした」も含む。"
          + "⚠ 2026-08-19 に 7 → 5（peel3d.js の 3 か所を WORD.cantSay へ）。"
          + "⚠ 2026-08-20 に 5 → 3（字の持ち主を words.js へ）。"
          + "⚠ **残る 2 件は語ではなく文**。主語が違うので 1 つにしていない" },
    { word: "未取得", kind: "状態", live: 6, next: "⚠ 台帳の語彙",
      files: ["prov.js"],
      seat: "⚠ **2026-08-20 に 7 → 6。**取得方法バッジからは消えた（`読み込めませんでした` に）。"
          + "⚠ **残るのは /peel の台帳だけ**で、⚠ **これは prov.js が持つ 5 語のひとつ**"
          + "（実測／未取得／欠落／未対応／推定）。⚠ **docs/DOMAIN.md §3 と ADR が固定している語**なので、"
          + "⚠ **言い換えるなら台帳の語彙ごと決め直す**。#9e の枠では触らない" },
  ];
  // ⚠ **検査そのものが、画面の字を書き写していないこと。**
  //   ⚠ **2026-08-20 に 2 回踏んだ。**言葉を言い直すたびに、⚠ **製品ではなく
  //     `render.mjs` のほうが落ちた**（「根拠あり」と「直読み」を直接書いていた）。
  //   ⚠ **検査は持ち主（words.js）から取る。**そうすれば、次に言い直しても落ちない。
  //   ⚠ **コメントは先に落とす**（何を直したかの説明を、この検査が拾わないように）。
  {
    const OWNED_BY_WORDS = [
      ...Object.values(globalThis.KonjakuWords?.TAG ?? {}),
      ...Object.values(globalThis.KonjakuWords?.METHOD ?? {}),
      globalThis.KonjakuWords?.EDGE, globalThis.KonjakuWords?.UNREAD,
      globalThis.KonjakuWords?.S?.noRecord, globalThis.KonjakuWords?.S?.cantTell,
    ].filter(Boolean);
    // ⚠ **コメント落としは stripJs を使う。**⚠ 素朴な正規表現で書いたら、
    //   ⚠ **正規表現リテラルの中の `/*` を拾って、本物のコードを大量に消していた**
    //   （2026-08-20 に踏んだ。⚠ **わざと壊しても緑のままだった**）。CLAUDE.md §5。
    // ⚠ **ケースは suite が持つ**（2026-08-22 に割った）。⚠ **走者だけ見ると、⚠ 何も見なくなる。**
    const files = ["test/render.mjs", "test/render/lib.mjs",
      "test/render/top.mjs", "test/render/peel.mjs"];
    const copied = new Set();
    for (const f of files) {
      const bare = stripJs(await readFile(join(ROOT, f), "utf8").catch(() => ""), f);
      for (const w of OWNED_BY_WORDS) if (bare.includes(`"${w}"`)) copied.add(`${f}:「${w}」`);
    }
    copied.size
      ? bad(`実描画が words.js の字を書き写している: ${[...copied].join("、")}`
          + `（言い直すと、製品ではなく検査が落ちる。WORDS から取ること）`)
      : ok(`実描画（${files.length} ファイル）は words.js の字（${OWNED_BY_WORDS.length} 語）を書き写していない`);
  }

  // ⚠ **写真の状態と、画面を分断したままにする**（2026-08-20・hidetzu/konjaku#116）。
  //   ⚠ **層は 3 つ。**⚠ **越えたら止める。**
  //     photos.js  … ⚠ **状態を決める。**⚠ **文字列を 1 つも持たない**
  //     words.js   … ⚠ **字を決める。**⚠ **状態の作り方を知らない**
  //     画面        … ⚠ **置くだけ。**⚠ **何も判断しない**
  //   ⚠ **相手先の振る舞いが変わっても、直すのは photos.js の 1 か所。**
  //   ⚠ 実際に踏んだ: 「何の写真か」を 2 画面が別々に組み立てていた。
  {
    const bad2 = [];
    // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **何を直したかの説明を拾う**（CLAUDE.md §5）
    const ph = stripJs(await readFile(join(PUB, "photos.js"), "utf8"), "photos.js");
    // ⚠ **取得の層に、画面へ出す字を書かない。**
    //   ⚠ 「通信できません」などの理由は、⚠ **places.js と揃える約束**なのでここが持つ。
    //   ⚠ **それ以外の、利用者へ向けた文を書かない。**
    for (const w of ["まだ出ていません", "読み込めませんでした", "接続を確認", "インターネット"])
      if (ph.includes(w)) bad2.push(`photos.js が画面の字を持っている（「${w}」）`);
    // ⚠ **画面が「何の写真か」を組み立てない。**⚠ 組み立てると、判断が画面ごとに増える
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const bare = (src[f] ?? "").replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // ⚠ **写真の状態の文脈だけを見る。**⚠ 「明治期の地面と見くらべる」は深掘りの案内で、
      //   ⚠ **別の文**（それまで拾うと、直しようのない誤検出になる）。
      for (const w of ["いまの街の写真", "この年代の写真は", "明治期の地面は"])
        if (bare.includes(w)) bad2.push(`${f} が「何の写真か」を組み立てている（「${w}」）`);
      // ⚠ **画面が接続の話を自分で決めない**（photoSay が返したものを置くだけ）
      if (/navigator\.onLine\s*===?\s*false/.test(bare))
        bad2.push(`${f} が接続の話を自分で判断している（状態に持たせる）`);
    }
    bad2.length
      ? bad(`写真の状態と画面が分断できていない: ${bad2.join("、")}`)
      : ok("写真は「状態（photos.js）→ 字（words.js）→ 置くだけ（画面）」に分かれている");
  }

  // ⚠ **取得の層を、画面が直接呼ばない**（hidetzu/konjaku#121）。
  //
  //   verify.js   外から取ってくる。⚠ **控えることを知らない**
  //   land.js     取得済みを控える、ただ1か所。⚠ **画面はここだけを見る**
  //   画面        置くだけ
  //
  //   ⚠ **なぜ要るか（実測 2026-08-20・main = d410455・豊洲・375x667・SW 無効）**:
  //     トップで地形分類を 2 本取ったあと、/peel が同じ座標で **もう 2 本**取っていた。
  //     ⚠ 画面が別々に取得の層を呼んでいたので、片方が取ったことをもう片方が知らなかった。
  //   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
  {
    const bad3 = [];
    // ⚠ **画面が呼んではいけない口。**⚠ land.js だけが呼ぶ
    const DIRECT = ["landform", "meiji", "elevation", "photos", "facts"];
    for (const f of ["index.html", "peel3d.js"])
      for (const m of DIRECT)
        if (new RegExp("Konjaku\\." + m + "\\s*\\(").test(seen[f] ?? ""))
          bad3.push(`${f} が取得の層を直接呼んでいる（Konjaku.${m}）`);
    // ⚠ **land.js に画面の字を書かない**（控える層は、何と表示するかを知らない）
    const LD = seen["land.js"] ?? "";
    if (!LD) bad3.push("land.js を読めていない（この検査が何も見ていない）");
    for (const w of ["記録なし", "判定できません", "読み込めませんでした", "ありません"])
      if (LD.includes(w)) bad3.push(`land.js が画面の字を持っている（「${w}」）`);
    // ⚠ **land.js が取り方を知らない。**タイルの URL を組み立てたら、取得の層と二重になる
    for (const w of ["gsi.go.jp", "fetch(", "loadImage"])
      if (LD.includes(w)) bad3.push(`land.js が取り方を持っている（「${w}」）`);
    // ⚠ **両画面が land.js を読んでいる。**読み忘れると、その画面だけ落ちる
    for (const f of ["index.html", "peel.html"])
      if (!/src="\.\/land\.js"/.test(src[f] ?? "")) bad3.push(`${f} が land.js を読んでいない`);
    // ⚠ **Service Worker の SHELL に入っている**（words.js と同じ性質。来ないと両画面が落ちる）
    if (!/"\/land\.js"/.test(src["sw.js"] ?? "")) bad3.push("sw.js の SHELL に land.js が無い");
    // ⚠ **「取れなかった」の印を、2 か所が見ている。**
    //   verify.js は「再試行を出すか」を、land.js は「控えてよいか」を、⚠ **同じ印で**決める。
    //   ⚠ **違う問いなので実装は 1 つにできない。**⚠ **だから機械で突き合わせる**（掟）。
    //   ⚠ 片方の印だけ名前が変わると、⚠ **取れなかった回を控えてしまい、
    //     その土地が「取れない土地」として固まる。**⚠ 画面は静かに嘘をつく。
    {
      // ⚠ **ファイル全体で探さない。**⚠ 同じ語は別の用途でも出てくるので、
      //   ⚠ **verify.js が「読めなかった」を数えている行そのもの**を取り出して見る
      //   （2026-08-20 に踏んだ: 全体で探していたら、この行を書き換えても緑だった）。
      const VJ = seen["verify.js"] ?? "";
      const unreadLine = (VJ.match(/unread:\s*list\.filter\([^\n]*\)/) ?? [""])[0];
      if (!unreadLine)
        bad3.push("verify.js の unread を数えている行が見つからない（この検査が何も見ていない）");
      // その行が、この 3 つで「読めなかった」を判断している
      const MARKS = [["UNREACHABLE", "取れなかった"], ['"partial"', "一部だけ読めた"],
                     ["artificialUnread", "人工地形だけ落ちた"]];
      for (const [w, why] of MARKS)
        if (unreadLine && !unreadLine.includes(w))
          bad3.push(`verify.js の unread が「${why}」を見なくなった（${w}）`
            + `。land.js の keepable も直す`);
      // land.js が、その 3 つを全部見ているか
      for (const [w, why] of MARKS)
        if (!LD.includes(w))
          bad3.push(`land.js が「${why}」を見ていない（${w}）。控えると固まる`);
    }
    bad3.length
      ? bad(`土地情報の取得と画面が分断できていない: ${bad3.join("、")}`)
      : ok("土地情報は「取得（verify.js）→ 控える（land.js）→ 置くだけ（画面）」に分かれている");
  }

  // ⚠ **明治期の「面」も、取得の層が持つ**（hidetzu/konjaku#126）。
  //
  //   ⚠ **2026-08-20 まで、⚠ peel3d.js の中に 74 行あった**
  //     （tileCache / getTile / readTile / buildWater）。⚠ その中身は
  //     ⚠ **タイル URL の組み立て・複数枚の取得・canvas の画素読み・分類・集計・
  //       失敗の数え方・キャッシュ**で、⚠ **全部が取得の層の仕事だった。**
  //   ⚠ **3 つめのキャッシュでもあった**（land.js の inflight／verify.js の imgCache と別）。
  //
  //   ⚠ **線の引き方**（Owner 判断＝案B。⚠ **矩形化は画面に残す**）
  //     verify.js   swaleArea(bbox) … mask ＋ 集計。⚠ **GeoJSON は作らない**
  //     land.js     meijiArea(bounds) … 呼んで控える。⚠ **取り方は知らない**
  //     peel3d.js   mask → 矩形 → GeoJSON → MapLibre。⚠ **水かどうかは判定しない**
  //
  //   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
  {
    const bad5 = [];
    const VJ = seen["verify.js"] ?? "", LD = seen["land.js"] ?? "", PJ = seen["peel3d.js"] ?? "";
    if (!VJ || !LD || !PJ) bad5.push("読めていないファイルがある（この検査が何も見ていない）");

    // ⚠ **取得の層が持っていること。**⚠ **名前の境界まで見る**（2026-08-20 に直した）。
    //   ⚠ includes だけだと、⚠ **`swaleAreaX` に改名しても `swaleArea` を含むので通る**
    //     （実際にわざと壊したら落ちなかった）。
    for (const w of ["swaleArea", "swalePixel"])
      if (!new RegExp("function\\s+" + w + "\\s*\\(").test(VJ))
        bad5.push(`verify.js が function ${w}() を持っていない`);
    if (!/\bswaleTiles\b/.test(VJ)) bad5.push("verify.js が swaleTiles（面と点で共有するタイル束）を持っていない");
    // ⚠ **公開していること。**⚠ 定義があっても配っていなければ画面から呼べない
    for (const w of ["swaleArea", "swalePixel"])
      if (!new RegExp("\\b" + w + "\\b(?![\\w(])").test(VJ.split("global.Konjaku")[1] ?? ""))
        bad5.push(`verify.js が ${w} を配っていない（Konjaku から呼べない）`);
    // ⚠ **画面が持っていないこと。**⚠ 戻ってきたら落とす
    for (const w of ["const tileCache", "function getTile", "function readTile"])
      if (PJ.includes(w)) bad5.push(`peel3d.js に ${w} が戻っている（取得の層の仕事）`);
    // ⚠ **画面がタイル URL を組み立てないこと**（swale に限らず）
    if (/\$\{GSI\}\/swale\//.test(PJ))
      bad5.push("peel3d.js が明治期タイルの URL を組み立てている");
    // ⚠ **画面が「水かどうか」を決めないこと。**⚠ 水の定義は swale.js の isWater ただ 1 つ。
    //   ⚠ **「決める」と「答えを読む」は別**（2026-08-20 に検査を書き直した）。
    //     ⚠ 最初は `.water` を数えて落としていたが、⚠ **2 件とも誤検出**だった:
    //       peel3d.js:791  s.water … ⚠ **取得の層が出した答えを写しているだけ**
    //       peel3d.js:1156 r.water … ⚠ **色見本の色を選んでいるだけ**（見せ方）
    //     ⚠ **決めているかどうかは、画素から起こしているかで見る。**
    if (/\bclassify\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を分類している（水の定義が 2 か所になる）");
    if (/getImageData\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を読んでいる（取得の層の仕事）");
    // ⚠ **水の面（mask）を画面で組み立てないこと**（swaleArea が返したものを使う）
    if (/mask\s*\[[^\]]*\]\s*=/.test(PJ)) bad5.push("peel3d.js が水の面を組み立てている");
    // ⚠ **控える層が GeoJSON を作らないこと**（案B の線）
    for (const w of ['"Feature"', '"Polygon"', "FeatureCollection"])
      if (LD.includes(w)) bad5.push(`land.js が GeoJSON を作っている（${w}）。描き方は画面が持つ`);
    if (VJ.includes("FeatureCollection"))
      bad5.push("verify.js が GeoJSON を作っている。描き方は画面が持つ");
    // ⚠ **mask を控えないこと**（豊洲 1.25MB。sessionStorage 約 5MB を 2 地点で埋める）
    if (/write\([^)]*mask/.test(LD)) bad5.push("land.js が mask を控えている（1.25MB。保存が埋まる）");
    if (!LD.includes("areaSummary")) bad5.push("land.js が、控える中身を絞っていない（areaSummary が無い）");
    // ⚠ **点と面が別の入口・別のキー**（ADR 0030）
    for (const w of ["meijiPoint", "meijiArea", "areaKey"])
      if (!LD.includes(w)) bad5.push(`land.js に ${w} が無い（点と面を分けていない）`);
    // ⚠ **画面が取得の層の面を直接呼ばないこと**（控える層を通す）
    if (/Konjaku\.swaleArea\s*\(/.test(PJ))
      bad5.push("peel3d.js が取得の層の面を直接呼んでいる（land.js を通す）");
    bad5.length
      ? bad(`明治期の「面」が、取得と画面に分かれていない: ${bad5.join("、")}`)
      : ok("明治期の面は「取得（verify.js swaleArea）→ 控える（land.js meijiArea）→ "
         + "矩形化だけ（peel3d.js）」に分かれている");
  }

  // ⚠ **同じ主張を、画面の 2 か所に置かない**（hidetzu/konjaku#130）。
  //
  //   ⚠ **実測（2026-08-20・main = 42784fa・豊洲・1280×800・SW 無効）**
  //     第3層の本文  y376  区分を特定できた足元のうち 河川・湖沼・海面 510 / 543件（93.9%）
  //     「内訳」      y876  河川・湖沼・海面 510 / 543
  //     ⚠ **同じ数字・同じ区分名が、⚠ 500px 離れて 2 回。**
  //   ⚠ **内訳が正本**（2 位以下も出す）。⚠ 1 位だけを別の場所で繰り返す意味が無い。
  //
  //   ⚠ **戻ってきたら落とす。**⚠ 字面ではなく、⚠ **組み立ての種類**で見る。
  {
    const bad6 = [];
    const PJ = seen["peel3d.js"] ?? "";
    if (!PJ) bad6.push("peel3d.js を読めていない（この検査が何も見ていない）");
    // ⚠ **第3層の補足として、区分名と件数をもう一度組み立てない**
    if (/kind\s*:\s*"share"/.test(PJ))
      bad6.push('peel3d.js に kind:"share" が戻っている（内訳と同じことを 2 回言う）');
    if (/区分を特定できた足元のうち/.test(PJ))
      bad6.push("peel3d.js に「区分を特定できた足元のうち」が戻っている（内訳の 1 行目と同じ）");
    // ⚠ **内訳は残っていること。**⚠ 受け皿が無くなったら、⚠ 消しただけになる
    // ⚠ **名前の境界まで見る**（2026-08-20。⚠ 明治期の面を移したときに同じ穴を踏んでいる）。
    //   ⚠ `paintBreakdownX` に改名しても `function paintBreakdown` を含むので、
    //     ⚠ **includes や前方一致では通ってしまう。**
    for (const w of ["paintBreakdown", "breakdown"])
      if (!new RegExp("function\\s+" + w + "\\s*\\(").test(PJ))
        bad6.push(`peel3d.js から function ${w}() が消えている（区分名の受け皿が無い）`);
    // ⚠ **呼ばれていること。**⚠ 定義だけ残っていても画面には出ない
    if (!/paintBreakdown\s*\(\s*document\.getElementById/.test(PJ))
      bad6.push("peel3d.js が内訳を描いていない（定義はあるが呼んでいない）");
    // ⚠ **3D の帯の断りは、⚠ 消さない**（hidetzu/konjaku#130 の ②）。
    //   ⚠ **触ったら落とす。**⚠ 「消すと掟に反する」と実測で分かっている
    //     （⚠ スマホで 0 アクションで見える唯一の場所）。
    // ⚠ **2026-08-21 に言い方を変えた**（hidetzu/konjaku#151。Owner 判断）:
    //   ⚠ 「建物が消える年代は**演出**です」→「建物が消える年代は**推定**です」。
    //   ⚠ **分数（建てられた年 N / M ／ 高さ N / M）はパネルへ移した**（⚠ 消していない）。
    //   ⚠ **見ている主張は同じ**: ⚠ 断りが帯に残っていること。
    // ⚠ **2026-08-22 に、⚠ 「推定」の語だけ色を付けた**（`<span class="k">推定</span>`）。
    //   ⚠ **字が要素で割れたので、⚠ 連続した文字列では読めない。**
    //   ⚠ **タグを落としてから見る。**⚠ **見ている主張は同じ**（⚠ 断りが残っていること）。
    //   ⚠ **緩めていない。**⚠ 割ってごまかせないよう、⚠ **語の順まで見る。**
    if (!/建物が消える年代は推定/.test(PJ.replace(/<[^>]+>/g, "")))
      bad6.push("3D の帯から「建物が消える年代は推定」が消えている"
        + "（スマホで 0 アクションで見える唯一の場所。peel3d.js の同名コメントを読む）");
    // ⚠ **言い換えが半分だけ残っていないこと**（⚠ 「演出」が画面の字として戻らない）
    if (/建物が消える年代は演出/.test(PJ))
      bad6.push("3D の帯に「演出」が戻っている（2026-08-21 に「推定」へ統一した）");
    const PH = seen["peel.html"] ?? "";
    if (!/国土地理院/.test(PH) || !/OpenStreetMap/.test(PH))
      bad6.push("peel.html の出典から地理院か OSM が消えている（出典明示は利用の条件）");
    bad6.length
      ? bad(`同じ主張が画面の 2 か所に出ている: ${bad6.join("、")}`)
      : ok("第3層の区分名と件数は「内訳」の 1 か所で、本文が繰り返していない"
         + "（3D の帯の断りと、出典の 2 つは残してある）");
  }

  // ⚠ **深掘りの導線は 1 か所**（hidetzu/konjaku#138。⚠ 2026-08-21 に置き場所を変えた）。
  //
  //   ⚠ **実測（2026-08-21・main = 8219774・豊洲・SW 無効）**
  //     根拠を開くと ⚠ **`#own` に 1 個・一覧に 1 個**。⚠ **DOM には常に 2 つあった。**
  //   ⚠ 利用者役 4 名に画面だけを見せた: ⚠ **4/4 が一覧行を残すと答え、4/4 が根拠側を否定した。**
  //   ⚠ **字も 1 か所**（TOPWORD.peelLead）。⚠ 以前は一覧行が同じ字を書き写していた。
  {
    const bad8 = [];
    const IX = seenTop;
    if (!IX) bad8.push("index.html を読めていない（この検査が何も見ていない）");
    // ⚠ **根拠パネルの組み立てに、./peel へのリンクが無いこと**
    //   ⚠ **`own.innerHTML` は 2 か所ある**（⚠ 判定中の 1 行と、⚠ 根拠カードの本体）。
    //     ⚠ **最初の 1 つだけを見ると、⚠ 判定中のほうを掴んで何も見ない**（2026-08-21 に踏んだ）。
    //   ⚠ **全部を見る。**⚠ どれか 1 つにでも ./peel があれば落とす。
    const owns = [...IX.matchAll(/own\.innerHTML\s*=[\s\S]{0,2500}?;\n/g)].map((m) => m[0]);
    if (owns.length < 2)
      bad8.push(`根拠パネルの組み立てが ${owns.length} 個しか見つからない（この検査が何も見ていない）`);
    for (const o of owns)
      if (/\.\/peel\?/.test(o))
        bad8.push("根拠パネルに ./peel への導線が戻っている（導線は一覧行の 1 か所）");
    // ⚠ **字の持ち主は TOPWORD.peelLead**。⚠ 呼ぶ側が書き写していないこと
    const OWNED = ["いまの街が、明治期の地面のどこに立っているか"];
    for (const w of OWNED) {
      const n = IX.split(w).length - 1;
      if (n !== 1) bad8.push(`「${w.slice(0, 18)}…」が index.html に ${n} 個ある（peelLead の 1 か所だけ）`);
    }
    // ⚠ **建物の判定が無い土地の字は、⚠ `words.js` が持つ**（2026-08-22。hidetzu/konjaku の
    //   パネル整理で、⚠ **`/peel` も同じ字を使うようになった**）。
    //   ⚠ **前は index.html にべた書きで 1 個**だった。⚠ **移した先でも 1 か所であること**を見る。
    //   ⚠ **弱めていない。**⚠ **見る場所が index.html → words.js に移っただけ。**
    {
      const STEM = "空中写真を年代で切りかえて、明治期の地面と見くらべ";
      const inW = (src["words.js"] ?? "").split(STEM).length - 1;
      const inIX = IX.split(STEM).length - 1;
      const inPeel = ((src["peel.html"] ?? "") + (src["peel3d.js"] ?? "")).split(STEM).length - 1;
      if (inW !== 1) bad8.push(`words.js に「${STEM.slice(0, 14)}…」が ${inW} 個ある（1 か所のはず）`);
      if (inIX) bad8.push(`index.html が「${STEM.slice(0, 14)}…」を書き写している（${inIX} 個）`);
      if (inPeel) bad8.push(`/peel が「${STEM.slice(0, 14)}…」を書き写している（${inPeel} 個）`);
      // ⚠ **両方が、⚠ 同じ口を通っていること**（⚠ 死にコードにしない）
      if (!/KonjakuWords\.canWithoutBuildings\("top"\)/.test(IX))
        bad8.push("index.html が canWithoutBuildings を通っていない（字が 2 か所になる）");
      // ⚠ **呼び出し元は `prov.js` へ移った**（2026-08-22。Owner 判断: ⚠ 代わりにできることは
      //   ⚠ **断りに添える**。⚠ 問いの答えの位置には置かない）。⚠ **見る主張は同じ。**
      if (!/canWithoutBuildings\?\.\("peel"\)|canWithoutBuildings\("peel"\)/
            .test((src["prov.js"] ?? "") + (src["peel3d.js"] ?? "")))
        bad8.push("/peel が canWithoutBuildings を通っていない（字が 2 か所になる）");
    }
    // ⚠ **判定カードの CTA が peelLead を通っていること**（⚠ 死にコードにしない）
    //   ⚠ **2026-08-21 に、⚠ 導線が行動一覧から判定カードの中へ移った。**
    //     ⚠ 実測（豊洲・375×667・hasTouch・SW 無効）: **y1135 → y651**。
    //     ⚠ 利用者役 4 名: ⚠ **「次に何をしますか」に答えられたのが 2/4 → 4/4**。
    //   ⚠ **見ている主張は変えていない**（⚠ 字の持ち主が 1 つであること）。
    if (!/sub\s*:\s*TOPWORD\.peelLead\(/.test(IX))
      bad8.push("深掘りの導線が TOPWORD.peelLead を通っていない（字が 2 か所になる）");
    // ⚠ **導線は判定カードの中に 1 つ**。⚠ 一覧に戻っていないこと
    if (!/function peelCtaHTML\(/.test(IX))
      bad8.push("判定カードの深掘り（peelCtaHTML）が無い");
    if (/\{id:"peel"/.test(IX))
      bad8.push("行動一覧に深掘りの行が戻っている（導線は判定カードの 1 か所）");
    bad8.length
      ? bad(`深掘りの導線が 1 か所になっていない: ${bad8.join("、")}`)
      : ok("深掘りの導線は行動一覧の 1 か所で、字も TOPWORD.peelLead の 1 か所から出ている");
  }

  // ⚠ **土地の答えは、⚠ 情報パネルの 1 か所だけで組み立てる**
  //   （hidetzu/konjaku#152。⚠ 2026-08-21 に Owner 判断で置き場所が変わった）。
  //
  //   ⚠ **前の主張**（hidetzu/konjaku#131）: 「⚠ 見えない箱に土地情報を組み立てない」。
  //     ⚠ 実測（2026-08-20・豊洲）: PC 初期で `#land` は 0×0 なのに 72 字が書かれていた。
  //     ⚠ そこで「⚠ 見えているときだけ描く（syncHud）」を足した。
  //   ⚠ **`#land` そのものが無くなったので、⚠ その仕掛けごと要らなくなった。**
  //     ⚠ **主張は引き継ぐ**: ⚠ **描く先は 1 つ。**⚠ **model も 1 回だけ作る**（ADR 0021）。
  //
  //   ⚠ **`.hide` を切り替える入口は、⚠ いまも 1 か所**（⚠ ✕ と ▶ の両方が通る）。
  {
    const bad7 = [];
    const PJ = seen["peel3d.js"] ?? "";
    if (!PJ) bad7.push("peel3d.js を読めていない（この検査が何も見ていない）");
    // ⚠ **入口が 1 か所**（2026-08-22: ⚠ **`.hide` → `.open` に変わった**）。
    //   ⚠ **パネルは常に出す。⚠ 小さくできるだけ**（Owner 判断）。
    //   ⚠ **見ている主張は変えていない**（⚠ 状態を切り替える場所が 1 つであること）。
    const toggles = (PJ.match(/classList\.toggle\(\s*"open"/g) ?? []).length;
    if (toggles !== 1)
      bad7.push(`.hide を切り替えている箇所が ${toggles} 個ある（1 か所へまとめる。`
        + `⚠ ✕ と ▶ の両方が通る）`);
    if (!/\bsetPanelHidden\b/.test(PJ)) bad7.push("peel3d.js に setPanelHidden が無い");
    // ⚠ **model は 1 回だけ作る。**⚠ layersOf を 2 か所で呼ばない（ADR 0021）
    const calls = (PJ.match(/layersOf\s*\(/g) ?? []).length;
    // ⚠ 定義 1 つ ＋ 呼び出し 1 つ ＝ 2
    if (calls !== 2)
      bad7.push(`layersOf の出現が ${calls} 個（定義 1 ＋ 呼び出し 1 のはず。`
        + `⚠ 2 か所で作ると同じ画面で言うことが食い違う）`);
    // ⚠ **描く先は 1 つだけ**（⚠ パネル）。⚠ 定義 1 つ ＋ 呼び出し 2 つ（⚠ 空にする回を含む）
    const paints = (PJ.match(/paintLand\s*\(/g) ?? []).length;
    if (paints !== 3)
      bad7.push(`paintLand の出現が ${paints} 個（定義 1 ＋ 呼び出し 2 のはず）`);
    for (const m of PJ.match(/paintLand\s*\([^)]*\)/g) ?? [])
      if (!/landAll|el, m/.test(m))
        bad7.push(`paintLand の描く先がパネルでない: ${m}`);
    // ⚠ **消した仕掛けが戻っていないこと**（⚠ 戻すと、⚠ 答えが 2 か所になる）
    for (const w of ["syncHud", "hudLayers", "landSeen", "syncLandH", "landEl"])
      if (new RegExp("\\b" + w + "\\b\\s*[=(]").test(PJ))
        bad7.push(`${w} が戻っている（土地の答えはパネルの 1 か所。hidetzu/konjaku#152）`);
    const PH = seen["peel.html"] ?? "";
    if (/id="land"/.test(PH))
      bad7.push('peel.html に <div id="land"> が戻っている（⚠ 空要素でも置かない）');
    bad7.length
      ? bad(`土地の答えが 1 か所から出ていない: ${bad7.join("、")}`)
      : ok("土地の答えは情報パネルの 1 か所で組み立て、model は 1 回だけ作る"
         + "（.hide の切り替えも 1 か所）");
  }

  // ⚠ **land.js の面を動かして確かめる。**⚠ 字面ではなく振る舞いを見る。
  {
    const fails = [];
    const mkStore = () => { const m = new Map();
      return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)),
               removeItem: (k) => m.delete(k), _m: m }; };
    const fresh = async (store, konjaku) => {
      const g = { sessionStorage: store, Konjaku: konjaku };
      const code = await readFile(join(PUB, "land.js"), "utf8");
      new Function("g", code.replace(/\(typeof window === "undefined" \? globalThis : window\)/, "(g)"))(g);
      return g.KonjakuLand;
    };
    // 偽の取得の層。⚠ **何回呼ばれたかを数える**
    const mk = (tilesOk = 1) => {
      const n = { swaleArea: 0 };
      return { n, STATE: { UNREACHABLE: "unreachable" },
        swaleArea: async (b, z) => { n.swaleArea++;
          return { mask: new Uint8Array(4), tw: 2, th: 2, x0: 1, y0: 2, z,
            waterPx: 1, classCounts: { 水: 1 }, classifiedPixels: 1,
            transparentPixels: 0, unknownPixels: 0,
            tiles: { ok: tilesOk, absent: 0, unreachable: tilesOk ? 0 : 1 }, ratio: 0.25 }; } };
    };
    const BB = { w: 139.79, s: 35.65, e: 139.80, n: 35.66 };

    // 1. 点と面で、キーが別
    { const L = await fresh(mkStore(), mk());
      if (L.areaKey(BB, 16) === L.key(139.7975, 35.6548))
        fails.push("点と面が同じキーになっている"); }
    // 2. 範囲が違えば、キーも違う
    { const L = await fresh(mkStore(), mk());
      if (L.areaKey(BB, 16) === L.areaKey({ ...BB, e: 139.81 }, 16))
        fails.push("違う範囲が同じキーになっている"); }
    // 3. ⚠ **mask を控えていない**（保存の中身に mask が入らない）
    { const st = mkStore(), L = await fresh(st, mk());
      await L.meijiArea(BB, 16);
      const saved = [...st._m.values()].join("");
      if (/mask/.test(saved)) fails.push("mask を控えている（1.25MB。保存が埋まる）");
      if (!/classCounts/.test(saved)) fails.push("集計を控えていない（控える意味が無い）"); }
    // 4. ⚠ **1 枚も読めていない回は控えない**（掟: 取得できなかった ≠ 存在しなかった）
    { const st = mkStore(), L = await fresh(st, mk(0));
      await L.meijiArea(BB, 16);
      if (st._m.size !== 0) fails.push("1 枚も読めていない回を控えている（読めない範囲として固まる）"); }
    // 5. 同時に 2 回頼まれても、取得は 1 回
    { const K = mk(), L = await fresh(mkStore(), K);
      await Promise.all([L.meijiArea(BB, 16), L.meijiArea(BB, 16)]);
      if (K.n.swaleArea !== 1) fails.push(`同時の 2 回が ${K.n.swaleArea} 本になっている`); }
    // 6. ⚠ **mask はそのまま返る**（画面が矩形化に使う）
    { const L = await fresh(mkStore(), mk());
      const a = await L.meijiArea(BB, 16);
      if (!(a.mask instanceof Uint8Array)) fails.push("mask が返っていない（画面が描けない）");
      if (a.tw !== 2 || a.x0 !== 1) fails.push("mask の大きさ・左上が返っていない（経緯度へ戻せない）"); }
    fails.length
      ? bad(`land.js の面の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok("land.js の面を動かして確認（点と別のキー・範囲ごとのキー・mask を控えない・"
         + "読めない回を控えない・同時の重なり・mask はそのまま返る）");
  }

  // ⚠ **第1層の字と、問いの見出しは words.js の 1 か所**（hidetzu/konjaku#122）。
  //   ⚠ 2026-08-20 まで、⚠ **同じ第1層をトップと /peel が別々に組んでいた**
  //     （トップ: verify.js の plainPast ／ /peel: peel3d.js の WORD.ground1）。
  //     ⚠ 実測（ADR 0030 §4）: トップ「もとは 水だった土地（旧水部）です。…」／
  //       /peel「この土地は 旧水部」。⚠ **同じ土地に 2 通りの答え**が出ていた。
  //   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
  {
    const bad4 = [];
    const W = seen["words.js"] ?? "";
    if (!W) bad4.push("words.js を読めていない（この検査が何も見ていない）");
    // ⚠ **words.js が持っていること**
    for (const w of ["layerTitle", "ground1Lines", "ground1Text"])
      if (!W.includes(w)) bad4.push(`words.js が ${w} を持っていない`);
    // ⚠ **呼ぶ側が書き写していないこと。**⚠ 主語も、問いの見出しも
    const OWNED = ["この土地は ", "人の手で ", "ここはどんな土地？", "昔はどんな土地？",
                   "今建っている建物は？"];
    // ⚠ **許可一覧は無い**（2026-08-20 に空にした。hidetzu/konjaku#125）。
    //   ⚠ ここには peel3d.js の landformLine() を 1 つだけ許していた。
    //   ⚠ **それは死にコードで、画面に一度も出ていなかった。**⚠ 消したので許す相手がいない。
    //   ⚠ **戻さない。**⚠ 写しを見つけたら、許すのではなく words.js へ寄せる。
    for (const f of Object.keys(seen)) {
      if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
      for (const w of OWNED)
        if ((seen[f] ?? "").includes(w)) bad4.push(`${f} が words.js の字を書き写している（「${w}」）`);
    }
    // ⚠ **3 つの呼び手が、全部 words.js を通っていること**
    // ⚠ **トップの JS は `top.js`**（2026-08-24）
    for (const [f, w] of [["top.js", "KonjakuWords.ground1Lines"],
                          ["top.js", "KonjakuWords.layerTitle"],
                          ["peel3d.js", "KonjakuWords.ground1Lines"],
                          ["peel3d.js", "KonjakuWords.layerTitle"],
                          ["verify.js", "KonjakuWords.ground1Text"]])
      if (!(seen[f] ?? "").includes(w)) bad4.push(`${f} が ${w} を通っていない`);
    // ⚠ **verify.js に第1層の組み立てが残っていないこと**（消したものが戻らない）
    if (/function plainPast|PLAIN_PAST/.test(seen["verify.js"] ?? ""))
      bad4.push("verify.js に第1層の組み立て（plainPast）が戻っている");
    bad4.length
      ? bad(`第1層の字と問いの見出しが 1 か所から出ていない: ${bad4.join("、")}`)
      : ok("第1層の字と問いの見出しは words.js の 1 か所で、トップ・/peel・共有カードが借りている");
  }

  // ⚠ **地形分類の語を言うのは、答えの行だけ**（2026-08-21。hidetzu/konjaku#139）。
  //   ⚠ 2026-08-21 まで、⚠ **バッジが同じ区分名をもう一度言っていた**
  //     （バッジ「🌊 旧水部」／答え「この土地は 旧水部」）。
  //     ⚠ 実測（375×667・hasTouch・SW 無効）で **豊洲・軽井沢・上野・札幌の 4 地点すべて**が該当。
  //   ⚠ **「（広い区分）」も同じ。**⚠ 判定カードの coarse の行が同じことを言っている。
  //   ⚠ **消してよかったのは言い直しだけ。**⚠ 「読み込めませんでした」は残す
  //     （⚠ 答えの行は、読めなかったときに区分名を出さない。⚠ **重複ではない**）。
  {
    const bad5 = [];
    const V = seen["verify.js"] ?? "";
    const i = V.indexOf("function badges(");
    if (i < 0) bad5.push("verify.js の badges() が見つからない（この検査が何も見ていない）");
    // ⚠ badges() の中だけを見る。⚠ 次の関数の手前で切る
    const blk = i < 0 ? "" : V.slice(i, (() => {
      const j = V.indexOf("\n  function ", i + 10);
      return j < 0 ? V.length : j;
    })());
    // ⚠ **言い直しが戻っていないこと**
    if (/l\.value/.test(blk)) bad5.push("badges() が地形分類の区分名を出している（答えの行と 2 か所になる）");
    // ⚠ **`l.artificial` そのものは条件に残る**（読めなかったかを分けるため）。
    //   ⚠ 見たいのは「バッジの字として出しているか」なので、⚠ `text:` の側だけを見る。
    if (/text:\s*l\.artificial(?!Unread)/.test(blk))
      bad5.push("badges() が人工地形の語を出している（答えの行と 2 か所になる）");
    if (blk.includes("（広い区分）")) bad5.push("badges() が「（広い区分）」を出している（coarse の行と 2 か所になる）");
    // ⚠ **取れなかったことは、消さずに残っていること**
    if (!blk.includes("地形分類を読み込めませんでした"))
      bad5.push("badges() から「地形分類を読み込めませんでした」が消えている（取れなかったを黙ることになる）");
    if (!blk.includes("盛土・埋立を読み込めませんでした"))
      bad5.push("badges() から「盛土・埋立を読み込めませんでした」が消えている（同上）");
    // ⚠ **「広い区分」の持ち主が、判定カードに残っていること**
    if (!/lfF\.ok && !lfF\.fine/.test(seenTop))
      bad5.push("index.html が coarse の行（広い区分の理由）を出していない");
    bad5.length
      ? bad(`地形分類の語が 1 か所から出ていない: ${bad5.join("、")}`)
      : ok("地形分類・人工地形の語を言うのは答えの行だけで、バッジは言い直していない"
         + "（読み込めなかったときの申告と、広い区分の理由は残っている）");
  }

  // ⚠ **一覧を畳む判断は 1 か所**（2026-08-21。hidetzu/konjaku#141）。
  //   ⚠ 一覧の描画と読み上げの両方が「いま何行出しているか」を要る。
  //   ⚠ **式を 2 か所に書くと、⚠ 片方だけ古くなる**（掟）。⚠ 実際、書きかけで 2 か所になった。
  //   ⚠ **上限まで開いたら押せる見た目をやめる**ことも、ここで見る（ADR 0026）。
  {
    const bad6 = [];
    const H = seenTop;
    if (!H) bad6.push("index.html / top.js を読めていない（この検査が何も見ていない）");
    if (!/const evVis\s*=/.test(H)) bad6.push("evVis() が無い（出す行の持ち主がいない）");
    // ⚠ **切り出しの式は 1 回だけ**
    const cut = (H.match(/slice\(0,\s*EV_MIN\)/g) ?? []).length;
    if (cut !== 1) bad6.push(`出す行を切り出す式が ${cut} か所ある（evVis() の 1 つだけにする）`);
    // ⚠ **呼ぶ側が、両方とも evVis() を通っていること**
    // ⚠ 定義は `const evVis=()=>` なので `evVis()` には当たらない。⚠ ここが数えるのは呼び手だけ
    const calls = (H.match(/evVis\(\)/g) ?? []).length;
    if (calls < 2) bad6.push(`evVis() の呼び手が少ない（一覧の描画と読み上げで 2 つ。いまは ${calls}）`);
    // ⚠ **上限まで開いたら押せなくなること**（押しても何も起きない導線を置かない）
    if (!/evShown\.length\s*>\s*vis\.length/.test(H))
      bad6.push("「まだ隠れているとき」だけ押せる形になっていない（開ききっても押せてしまう）");
    // ⚠ **場所が変わったら畳み直すこと**（前の場所で開いたまま持ち越さない）
    const reset = (H.match(/evOpen\s*=\s*false/g) ?? []).length;
    if (reset < 3) bad6.push(`畳み直しが足りない（宣言 1 ＋ 場所を変える 2 で 3 以上。いまは ${reset}）`);
    bad6.length
      ? bad(`一覧を畳む判断が 1 か所から出ていない: ${bad6.join("、")}`)
      : ok("一覧に出す行を決めるのは evVis() の 1 か所で、描画と読み上げが借りている"
         + "（上限まで開いたら押せる見た目をやめる／場所が変わったら畳み直す）");
  }

  // ⚠ **land.js を動かして確かめる。**⚠ 字面ではなく、⚠ **実際の振る舞い**を見る。
  //   ⚠ DOM も地図も要らない作りにしてあるので、ブラウザを立てずに全部回せる。
  {
    const fails = [];
    // 偽の sessionStorage。⚠ **本物を汚さない**
    const mkStore = (opt = {}) => {
      const m = new Map();
      return {
        getItem: (k) => (opt.throwGet ? (() => { throw new Error("no"); })() : (m.get(k) ?? null)),
        setItem: (k, v) => { if (opt.throwSet) throw new Error("full"); m.set(k, String(v)); },
        removeItem: (k) => m.delete(k),
        _m: m,
      };
    };
    // 偽の取得の層。⚠ **何回呼ばれたかを数える**
    const mkKonjaku = (answer) => {
      const n = { landform: 0, meiji: 0, elevation: 0, photos: 0, facts: 0 };
      const one = (key) => async (lon, lat) => { n[key]++; return answer(key, lon, lat); };
      return { n, STATE: { UNREACHABLE: "unreachable" },
        landform: one("landform"), meiji: one("meiji"),
        elevation: one("elevation"), photos: one("photos"),
        facts: async (lon, lat) => { n.facts++;
          return { lon, lat, byKey: { landform: answer("landform", lon, lat),
            meiji: answer("meiji", lon, lat), elevation: answer("elevation", lon, lat),
            photos: answer("photos", lon, lat) } }; } };
    };
    // ⚠ **毎回、真新しい land.js を読む**（前の試験の中身を持ち越さない）
    //   store に "throwGetProp" を渡すと、⚠ **参照そのものが投げる**形になる
    //   （Safari のプライベート・埋め込み枠での遮断。⚠ **メソッドが投げるのとは別**）。
    const fresh = async (store, konjaku) => {
      const g = { Konjaku: konjaku };
      if (store === "throwGetProp")
        Object.defineProperty(g, "sessionStorage",
          { get() { throw new Error("保存は使えません"); } });
      else g.sessionStorage = store;
      const code = await readFile(join(PUB, "land.js"), "utf8");
      new Function("g", code.replace(/\(typeof window === "undefined" \? globalThis : window\)/, "(g)"))(g);
      return g.KonjakuLand;
    };
    const OK = (key) => ({ state: "ok", value: key });
    const NG = () => ({ state: "unreachable" });

    // 1. キーは小数5桁の lat,lon（URL と同じ粒度・同じ並び）
    {
      const L = await fresh(mkStore(), mkKonjaku(OK));
      if (L.key(139.7975, 35.6548) !== "35.65480,139.79750")
        fails.push(`キーが5桁の lat,lon でない（${L.key(139.7975, 35.6548)}）`);
      // ⚠ 6桁目が違うだけの2点は、**同じキーにならない**
      if (L.key(139.79750, 35.65480) === L.key(139.79760, 35.65480))
        fails.push("5桁目が違う2点が同じキーになっている");
    }
    // 2. 2回目は取りに行かない（控えが効いている）
    {
      const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
      await L.terrain(139.7975, 35.6548);
      await L.terrain(139.7975, 35.6548);
      if (K.n.landform !== 1) fails.push(`控えが効いていない（地形分類を ${K.n.landform} 回取った）`);
    }
    // 3. ⚠ **取れなかったものを控えない**（掟: 取得できなかった ≠ 存在しなかった）
    {
      const K = mkKonjaku(NG), L = await fresh(mkStore(), K);
      await L.terrain(139.7975, 35.6548);
      await L.terrain(139.7975, 35.6548);
      if (K.n.landform !== 2)
        fails.push("取れなかった回を控えている（次からずっと「取れない土地」になる）");
    }
    // 4. 別の地点を混ぜない
    {
      const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
      await L.terrain(139.7975, 35.6548);
      await L.terrain(139.7000, 35.6000);
      if (K.n.landform !== 2) fails.push("別の地点で、前の地点の控えを使っている");
    }
    // 5. 壊れた控えがあっても、取りに行って正しく返す（例外を投げない）
    {
      const st = mkStore(), K = mkKonjaku(OK), L = await fresh(st, K);
      st._m.set(L.PREFIX + L.key(139.7975, 35.6548), "{壊れた");
      let got = null;
      try { got = await L.terrain(139.7975, 35.6548); }
      catch (e) { fails.push(`壊れた控えで例外が出た（${e.message}）`); }
      if (got?.state !== "ok") fails.push("壊れた控えのとき、取得へ落ちていない");
    }
    // 6. sessionStorage が使えなくても壊れない
    {
      const K = mkKonjaku(OK);
      for (const [name, st] of [["読めない", mkStore({ throwGet: true })],
                                ["書けない", mkStore({ throwSet: true })],
                                ["そもそも無い", undefined],
                                // ⚠ **参照そのものが投げる。**⚠ これが無いと、
                                //   ⚠ **参照を守っている try を外しても緑になる**（2026-08-20 に踏んだ）
                                ["参照だけで落ちる", "throwGetProp"]]) {
        const L = await fresh(st, K);
        try {
          const got = await L.terrain(139.7975, 35.6548);
          if (got?.state !== "ok") fails.push(`sessionStorage が${name}とき、答えが返っていない`);
        } catch (e) { fails.push(`sessionStorage が${name}ときに例外（${e.message}）`); }
      }
    }
    // 7. 同時に2回頼まれても、取得は1回（控えに入る前の重なり）
    {
      const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
      await Promise.all([L.terrain(139.7975, 35.6548), L.terrain(139.7975, 35.6548)]);
      if (K.n.landform !== 1) fails.push(`同時の2回が ${K.n.landform} 本になっている`);
    }
    // 8. トップが facts で取ったものを、/peel が terrain で使い回す（⚠ この Issue の本題）
    {
      const st = mkStore(), K = mkKonjaku(OK), L = await fresh(st, K);
      await L.facts(139.7975, 35.6548);
      const before = K.n.landform;
      await L.terrain(139.7975, 35.6548);
      if (K.n.landform !== before)
        fails.push("トップで取った地形分類を、/peel が使い回せていない");
    }
    fails.length
      ? bad(`land.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
      : ok("land.js を動かして確認（5桁キー・控えが効く・取れなかった回は控えない・別地点・壊れた控え・保存が使えない・同時の重なり・トップ → /peel）");
  }

  // ⚠ **画面から消した語が、戻っていないこと。**
  //   ⚠ 上の表は**いま画面にある語**しか見ない。⚠ **消した語は行ごと落ちるので、
  //     戻ってきても気づけない。**ここが、その穴を塞ぐ。
  //   ⚠ **消すたびにここへ足す。**⚠ 足し忘れると、静かに戻せてしまう。
  //   ⚠ 実際に踏んだ（2026-08-20）: バッジを消したあと、わざと戻しても検査は緑だった。
  {
    const GONE_WORDS = [
      // 2026-08-21（一覧を 3 分類にした）
      //   ⚠ **行ごとのタグをやめ、⚠ 組の見出しへ移した。**
      //   ⚠ 両方置くと、⚠ **「なぜここに出ているのか」に 2 か所が答える**（掟）。
      ["今昔で見る", "一覧行のタグ。⚠ 組の見出しへ移した（⚠ 深掘りの組には見出しを付けない）"],
      ["この土地から", "一覧行のタグ。⚠ 組の見出し `さらに調べる` になった"],
      ["別のサイト↗", "一覧行のタグ。⚠ 組の見出し `公的な情報で確認する` になった"],
      // 2026-08-20（#9c）
      ["外部↗", "一覧行のタグ。`別のサイト↗` にした"],
      ["記録のある変化はありません", "`この期間に表示できる変化の記録は見つかっていません` にした"],
      // 2026-08-20（#9d）
      ["自前・根拠あり", "根拠パネルのバッジ。⚠ **中身が全部この土地の根拠で、何も分けていなかった**"],
      ["ベクトル直読み", "取得方法バッジ。`読んだ値` にした"],
      ["直読み", "同上"],
      // ⚠ **この 1 語だけ、⚠ 見出しとして丸ごとそれかで見る**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **守りたいのはフッターの見出しが戻らないこと**で、⚠ **その字を含む別の見出しを塞ぐことではない。**
      //   ⚠ 実際に踏んだ: 台帳の節を「⚠ **表示データについて**」にしたら部分一致で落ちた。
      //   ⚠ **緩めてはいない。**⚠ ちょうど「データについて」なら、いままでどおり落ちる。
      [/>\s*データについて\s*</, "フッターの見出し。`データ・判定について` にした"],
      ["この範囲にできていたもの", "フッターの出典欄。`この範囲で、年が記録されているもの` にした"],
      // 2026-08-20（hidetzu/konjaku#122・ADR 0030 §4 をトップへ適用）
      ["もとは ", "第1層の主語。⚠ **3/4 が明治期（第2層）と取り違えた**（ADR 0030 §4-3）"],
      ["この場所は ", "第1層の主語。⚠ **`この土地は` に統一**（実測 9:1。ADR 0030 §4-1）"],
      ["水だった土地", "平易な言い換え。⚠ **原典の語をそのまま出す**（ADR 0030 §4-5）"],
      ["上の「もとは」は", "明治期の畳み見出し。⚠ **指し先を字面で書いていた**ので、言い回しを変えたら指し先を失った"],
    ];
    const back = [];
    for (const [w, why] of GONE_WORDS)
      for (const f of Object.keys(seen)) {
        // ⚠ 正規表現で書いた語は、⚠ **その形で見る**（字面の部分一致にしない）
        const hit = w instanceof RegExp ? w.test(seen[f] ?? "") : (seen[f] ?? "").includes(w);
        if (hit) back.push(`${f}「${w instanceof RegExp ? "データについて" : w}」（${why}）`);
      }
    back.length
      ? bad(`一度消した語が画面に戻っている: ${back.join("、")}`)
      : ok(`一度消した語 ${GONE_WORDS.length} 件は、画面に戻っていない`);
  }

  {
    const count = (w, fs) => fs.reduce((a, f) => a + (seen[f] ?? "").split(w).length - 1, 0);
    const off = [];
    for (const w of SCREEN_WORDS) {
      if (w.live === 0) { off.push(`「${w.word}」は live:0（消えたなら行ごと消す）`); continue; }
      const miss = w.files.filter((f) => seen[f] === undefined);
      if (miss.length) { off.push(`「${w.word}」の ${miss.join("、")} が読めない`); continue; }
      const n = count(w.word, w.files);
      if (n !== w.live) off.push(`「${w.word}」は ${w.live} 件のはずが ${n} 件（${w.files.join("、")}）`);
    }
    off.length
      ? bad(`棚卸しと画面が食い違っている: ${off.join(" / ")}`
          + `（直したなら表も直す。増やしたなら、その語を画面に出してよいかを先に決める）`)
      : ok(`画面に出ている作り手側の語 ${SCREEN_WORDS.filter((w) => w.kind === "分類").length} 件・`
          + `状態を指す語 ${SCREEN_WORDS.filter((w) => w.kind === "状態").length} 件が、棚卸しのとおり`);
  }

  // ⚠ 台帳（prov.js）が読むものは、**言葉を組み直す鍵**（peel3d.js の describeKey）に
  //   全部載っていなければならない。載っていないと、データが変わったのに
  //   describe() が早期 return して、**画面が古い数字のまま残る**（黙って古いものを見せる）。
  //
  // ⚠ これは「同じ問いに答えるものを 2 つ持っている」状態そのもの（掟）。
  //   1 つにはできない（片方は文面、片方は更新の判断）ので、**機械で突き合わせる**。
  // ⚠ 読むのは **seen**（コメントを落としたあとの本文）。生のソースを読むと、
  //   この照合を説明したコメントの字面を自分で拾う（CLAUDE.md §5。3 回踏んでいる）。
  {
    const provSrc = seen["prov.js"] ?? "";
    const peelSrc = seen["peel3d.js"] ?? "";
    const keyExpr = /function describeKey\([\s\S]*?\n\}/.exec(peelSrc)?.[0];
    const read = [...new Set([...provSrc.matchAll(/\barea\.(\w+)/g)].map((m) => m[1]))].sort();
    if (!keyExpr) bad("peel3d.js の describeKey を取り出せない（この照合が何も見ていない）");
    else if (!read.length) bad("prov.js が area の何を読んでいるか取り出せない（この照合が何も見ていない）");
    else {
      const miss = read.filter((f) => !new RegExp(`area\\.${f}\\b`).test(keyExpr));
      miss.length
        ? bad(`台帳が読む area.${miss.join(" / area.")} が describeKey に載っていない`
            + `（変わっても画面が組み直されず、古い数字が残る）`)
        : ok(`台帳が読む area の ${read.length} 項目（${read.join("・")}）が、`
            + `すべて describeKey に載っている`);
    }
  }

  // ⚠ loadArea は await を挟んだあと area / statusEl / 地図のデータを書く。
  //   **その await のたびに「まだ自分が最新か」を確かめていないと、
  //   古い呼び出しがあとから新しい結果を上書きする。**
  //   2026-08-18 まで seq は取るだけで一度も見ていなかった（setTimeline の中だけが見ていた）。
  //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出て、
  //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
  // ⚠ 目で数えない。**await を足したのに番人を付け忘れる**のがこの事故なので、機械で見る。
  //
  // ⚠ 見るのは「関数の直下にある await」。**`if` の中も直下**（そこで w や feats を決めている）。
  //   除くのは**中の関数（`=>`）の中**にある await だけで、あれは自分の建物の
  //   properties しか書かないので、外側の番人が守れば足りる。
  // ⚠ 括弧の深さで数えると `if` の中まで除いてしまい、**7 箇所のうち 4 箇所しか
  //   見ていない**状態になった（2026-08-18。静かに素通りするほうの間違い）。
  //   なので「`{` の手前が `=>` で終わっているか」で、関数の枠だけを数える。
  {
    const js = seen["peel3d.js"] ?? "";
    const body = /\nasync function loadArea\([\s\S]*?\n\}\n/.exec(js)?.[0];
    if (!body) bad("peel3d.js の loadArea を取り出せない（この検査が何も見ていない）");
    else {
      // 文字列・テンプレートの中は数えない。各文字が「いくつの関数の枠の中か」を出す
      const inFn = new Array(body.length).fill(0);
      const stack = [];
      let q = null, fn = 0;
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (q) { if (c === "\\") i++; else if (c === q) q = null; inFn[i] = fn; continue; }
        if (c === "'" || c === '"' || c === "`") { q = c; inFn[i] = fn; continue; }
        if (c === "{") {
          const before = body.slice(Math.max(0, i - 4), i).trimEnd();
          const isFn = before.endsWith("=>");
          stack.push(isFn); if (isFn) fn++;
        } else if (c === "}") { if (stack.pop()) fn--; }
        inFn[i] = fn;
      }
      // 行頭の深さ（その await が中の関数の中か）と、行末の深さ（その行で文が閉じたか）
      const lines = body.split("\n"), head = [], tail = [];
      for (let i = 0, pos = 0; i < lines.length; i++) {
        head.push(inFn[pos] ?? 0);
        tail.push(inFn[pos + Math.max(0, lines[i].length - 1)] ?? 0);
        pos += lines[i].length + 1;
      }

      const naked = [], guard = /if\s*\(\s*seq\s*!==\s*areaSeq\s*\)\s*return/;
      let top = 0, nested = 0;
      for (let i = 0; i < lines.length; i++) {
        if (!/\bawait\b/.test(lines[i])) continue;
        if (head[i] > 0) { nested++; continue; }      // 中の関数の中。外側の番人が守る
        top++;
        let end = i;                                   // 文が閉じるまで進む（複数行にまたがる）
        // ⚠ 閉じたかは**行末**の深さで見る。行頭で見ると、callback を跨いだ文が
        //   閉じ括弧の行を飛ばして、番人の行そのものを「文の終わり」にしてしまう。
        while (end < lines.length - 1 && !(tail[end] === 0 && /;\s*$/.test(lines[end]))) end++;
        let j = end + 1;
        while (j < lines.length && /^\s*(\/\/|$)/.test(lines[j])) j++;
        if (!guard.test(lines[j] ?? "")) naked.push(lines[i].trim().slice(0, 56));
      }
      // ⚠ **この下限は「検査が目を潰していないか」を見るためのもの**で、仕様ではない。
      //   ⚠ 2026-08-20 に 7 → 4 へ下げた。範囲索引（豊洲 1 件だけの事前計算）を外し、
      //     その経路にあった await 3 つ（索引・事前生成の水域・事前生成の建物）が消えたため。
      //   ⚠ **実際の数に合わせて下げること。**下げ忘れると通らず、上げすぎると
      //     取りこぼしに気づけない。
      if (top < 4) bad(`loadArea の直下の await が ${top} 箇所しか見えていない（この検査が取りこぼしている）`);
      else naked.length
        ? bad(`loadArea の await ${naked.length} 箇所に、seq の番人が無い: ${naked.join(" / ")}`
            + `（古い呼び出しが、あとから新しい結果を上書きする）`)
        : ok(`loadArea の直下の await ${top} 箇所は、全部その直後に seq を確かめている`
            + `（中の関数の中の ${nested} 箇所は、外側の番人が守る）`);
    }
  }

  // ⚠ **同じ問いに答える定義を、2 か所に書かない**（掟）。
  //   表そのものは §6 が見ている（14 区分・凡例）。ここが見るのは**それ以外の並びと式**。
  //
  // 実測（2026-08-18）: 2 種類の重複があった。⚠ **どちらも「表」ではないので、
  //   既存の検査では素通りしていた。**
  //     ① 「水由来の地形分類」6 語 … verify.js / share.js / index.html×2 の 4 か所
  //     ② `SWALE.find(c => c.name === x)?.water` … peel3d.js×3 / swale.js の 4 か所
  //   ⚠ ② は式なので、grep しても目に留まらない。並びだけを見ていては見つからない。
  //
  // ⚠ ①と②は**別の問い**。混ぜない。
  //     ① いまの地形分類が水に由来するか（Konjaku.isWatery）
  //     ② 明治期の地図で水域だったか（KonjakuSwale.isWater）
  {
    const jsHtml = [...htmlFiles, ...jsFiles];
    const body = {};
    for (const f of jsHtml) body[f] = seen[f] ?? "";
  
    // ---- ① 語の並びを書き写していないか ----
    {
      const where = new Map();
      for (const f of jsHtml) {
        for (const m of body[f].matchAll(/\[\s*("(?:[^"\\]|\\.)*"\s*,\s*){2,}"(?:[^"\\]|\\.)*"\s*\]/g)) {
          const words = [...m[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
          if (!words.some((w) => /[ぁ-んァ-ヶ一-龠]/.test(w))) continue;
          const k = words.join("｜");
          if (!where.has(k)) where.set(k, []);
          where.get(k).push(f);
        }
      }
      const dup = [...where.entries()].filter(([, fs]) => fs.length > 1);
      dup.length
        ? bad(`同じ語の並びを 2 か所以上に書いている: `
            + dup.map(([k, fs]) => `[${k.split("｜").slice(0, 3).join("、")}…] → ${fs.join("、")}`).join(" / ")
            + `（1 か所に寄せて、そこから呼ぶこと）`)
        : ok(`日本語を含む語の並び ${where.size} 種類は、どれも 1 か所にしかない`);
    }
  
    // ---- ② 「名前から水域を引く」式を書き写していないか ----
    // ⚠ 持ち主（swale.js）の中だけは、定義そのものなので許す
    {
      const hits = [];
      for (const f of jsHtml) {
        if (f === "swale.js") continue;
        const n = (body[f].match(/SWALE\s*\.\s*find\s*\([^)]*\)\s*\?\.\s*water/g) ?? []).length;
        if (n) hits.push(`${f}${n > 1 ? `×${n}` : ""}`);
      }
      hits.length
        ? bad(`区分名から水域を引く式を書き写している: ${hits.join("、")}`
            + `（KonjakuSwale.isWater を呼ぶこと。式なので grep しても目に留まらない）`)
        : ok(`区分名から水域を引くのは swale.js の isWater ただ1つ`);
    }
  
    // ---- ③ 持ち主が、実際に配れているか ----
    // ⚠ 「1 か所にした」と言いながら、公開していなければ呼べない
    {
      const missing = [];
      if (!/isWatery/.test(body["verify.js"] ?? "")) missing.push("verify.js に isWatery が無い");
      else if (!/global\.Konjaku\s*=\s*\{[^}]*isWatery/.test(body["verify.js"]))
        missing.push("isWatery を Konjaku から配っていない（他のファイルが呼べない）");
      if (!/isWater/.test(body["swale.js"] ?? "")) missing.push("swale.js に isWater が無い");
      else if (!/KonjakuSwale\s*=\s*\{[^}]*isWater/.test(body["swale.js"]))
        missing.push("isWater を KonjakuSwale から配っていない");
      missing.length
        ? bad(`1 か所に寄せた答えを配れていない: ${missing.join(" / ")}`)
        : ok(`水の判定は 2 つとも持ち主から配っている（Konjaku.isWatery ／ KonjakuSwale.isWater）`);
    }
  }

  // ⚠ **空の強調が残っていないか。**
  //   実測（2026-08-18）: SPEC の「静的 **N件**」が **`****`** になったまま main へ出た。
  //   置換に使ったシェル変数が空に展開されて、数字が消えていた。
  //   ⚠ **文書は誰も実行しないので、壊れても誰も気づかない。**（一度出した）
  // ⚠ **2026-08-22 に、⚠ 件数そのものを SPEC から外した**（hidetzu/konjaku#184。Owner 判断）。
  //   ⚠ **「4 つとも数字で書かれているか」は、⚠ もう見ない**（⚠ 書かないと決めたので、主張が反転した）。
  //   ⚠ **書いてあったら落とすほう**は、上の「件数が書かれていない」検査が見る。
  //   ⚠ **ここに残すのは、⚠ 空の強調そのもの**（⚠ 件数に限らず、⚠ 置換の失敗は今後も起こりうる）。
  {
    const spec = await readFile(join(ROOT, "docs", "SPEC.md"), "utf8").catch(() => "");
    if (!spec) bad("docs/SPEC.md を読めない");
    else {
      const empty = [...spec.matchAll(/\*\*\s*\*\*/g)].length;
      empty
        ? bad(`docs/SPEC.md に空の強調が ${empty} 箇所ある`
            + "（置換に失敗しても、文書は誰も実行しないので気づけない）")
        : ok("docs/SPEC.md に空の強調は無い");
    }
  }

  // ⚠ **「まだ提供していない」の文を、画面の各所が書き写していないか。**
  //   実測（2026-08-18）: 同じ事実に 2 通りの文があり、20 秒のあいだに入れ替わっていた。
  //   ⚠ 文は prov.js の NOTYET / NOTYET_WHY 1 つだけ。ほかは借りる。
  {
    const js = seen["peel3d.js"] ?? "";
    const bad2 = [];
    // ⚠ 古い言い方が本文に戻っていないか
    if (/この場所の建物データは、まだ用意できていません/.test(js))
      bad2.push("古い言い方（まだ用意できていません）が戻っている");
    // ⚠ 文をそのまま書き写していないか（借りるなら KonjakuProv.NOTYET になる）
    const copied = (js.match(/建物ごとの判定は、この場所ではまだ提供していません/g) ?? []).length;
    if (copied) bad2.push(`文を ${copied} 箇所に書き写している`);
    if (/通信の問題ではありません。対応した場所から順に増やしています/.test(js))
      bad2.push("但し書きを書き写している");
    const borrowed = (js.match(/KonjakuProv\.NOTYET/g) ?? []).length;
    if (!borrowed) bad2.push("prov.js の文を 1 度も借りていない");
    bad2.length
      ? bad(`「まだ提供していない」の文が 1 か所になっていない: ${bad2.join(" / ")}`
          + `（prov.js の NOTYET / NOTYET_WHY を借りること）`)
      : ok(`「まだ提供していない」の文は prov.js の 1 つで、peel3d.js は ${borrowed} 箇所で借りている`);
  }

  // ⚠ **HTML を組み立てながら、その場で「何と言うか」を決めない。**
  //   判断はデータや名前つきの関数にして、HTML 化は 1 か所に寄せる
  //   （public/prov.js と peel3d.js の WORD がその形）。
  //
  // 実測（2026-08-19）。HTML を含むテンプレートの中の分岐を、2 つに分けて数えた:
  //   見た目（class / style だけ）… ⚠ **これは問題ない**（数えない）
  //   意味（引用符つきの日本語が分岐している）… index.html 7・peel3d.js 9 → **外へ出した**
  //   ⚠ うち 2 つは**同じ判断を 2 か所・3 か所**に書いていた
  //     （「（事前に取り込んだデータ）」×2、「建物ごとには出せません／判定できません」×3）。
  //
  // 2026-08-19 に **両方 0 になった**（peel3d.js → WORD、index.html → TOPWORD）。
  // ⚠ **0 は「上限」ではなく「もう増やさない」。**ここから 1 個でも増えたら落ちる。
  //   ⚠ 通行証: トップ 12 画面（1280×900 / 375×667 × 豊洲・札幌・那覇 × 閉／開）の
  //     字面が 1 文字も変わらないことを確かめてから外へ出した。
  {
    // その日の実測。⚠ 減らしたら、この数も下げること（下げないと歯止めが緩む）
    const CAP = { "index.html": 0, "peel3d.js": 0 };
    // ⚠ **引用符で囲まれた日本語**が分岐にあることまで求める。
    //   `?` だけで数えると、markup の中の `?`（`<i class="q">?</i>` など）を
    //   三項演算子と読む（実測 2026-08-18: それで 7 個が 8 個になった）。
    const JP = /(["'])(?:[^"'\\]|\\.)*?[ぁ-んァ-ヶ一-龠](?:[^"'\\]|\\.)*?\1/;

    // テンプレートリテラルを、入れ子の ${} も追って拾う
    const literals = (src) => {
      const out = [];
      for (let i = 0; i < src.length; i++) {
        if (src[i] !== "`") continue;
        let d = 0, j = i + 1;
        for (; j < src.length; j++) {
          if (src[j] === "\\") { j++; continue; }
          if (src[j] === "$" && src[j + 1] === "{") { d++; j++; continue; }
          if (src[j] === "}" && d > 0) { d--; continue; }
          if (src[j] === "`" && d === 0) break;
        }
        const body = src.slice(i, j + 1);
        if (/<\/?[a-z]+[\s>]/.test(body)) out.push(body);
        i = j;
      }
      return out;
    };

    const over = [], counted = {};
    for (const f of Object.keys(CAP)) {
      let s = seen[f] ?? "";
      if (!s) { over.push(`${f} を読めない`); continue; }
      // ⚠ HTML は **<script> の中だけ**を見る。外の markup まで数えると、
      //   ここでは直しようのないものが混ざる（実測: 7 個のはずが 8 個になった）
      if (f.endsWith(".html"))
        s = [...s.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
      let word = 0;
      for (const l of literals(s))
        for (const m of l.matchAll(/\?([^:`]{0,160}):([^`}]{0,160})/g))
          if (JP.test(m[1]) || JP.test(m[2])) word++;
      counted[f] = word;
      if (word > CAP[f]) over.push(`${f}: ${word} 個（上限 ${CAP[f]}）`);
      // ⚠ 減ったのに上限を下げ忘れると、また増やせてしまう
      if (word < CAP[f]) over.push(`${f}: ${word} 個まで減った。上限 ${CAP[f]} も下げること`);
    }
    over.length
      ? bad(`HTML の中に、言葉を分ける判断が増えた／上限が古い: ${over.join(" / ")}`
          + `（判断はデータか名前つきの関数にして、HTML 化は 1 か所に寄せる）`)
      : ok(`HTML の中に埋まった「言葉の判断」は上限どおり`
          + `（${Object.entries(counted).map(([f, n]) => `${f} ${n}`).join(" / ")}。`
          + `見た目だけの分岐は数えない）`);
  }

  // ⚠ 短い語（「自分」）は本文の検索で数えられない。宣言そのものを読む。
  {
    // ⚠ **2026-08-20 に、宣言の場所が index.html → words.js へ移った。**
    //   ⚠ 見ているものは同じ（一覧行に何と出るか）。読む先だけ変えた。
    //   ⚠ 「自分」（priv）は同じときに消した。⚠ **付ける場所がどこにも無く、
    //     画面に出ようがない語**だったため。
    // ⚠ **2026-08-21 に、行ごとのタグ（TAG）→ 組の見出し（GROUP）へ移った。**
    //   ⚠ 見ているものは同じ（⚠ 一覧で「なぜここに出ているのか」を何と言うか）。
    //   ⚠ **消した 3 語は GONE_WORDS が見張る**ので、⚠ 戻ってきたら別の検査が落ちる。
    const m = /const GROUP\s*=\s*\{([^}]*)\}/.exec(seen["words.js"] ?? "");
    if (!m) bad("words.js の GROUP を読めない（一覧の組の見出しの棚卸しが何も見ていない）");
    else {
      const got = [...m[1].matchAll(/:\s*"([^"]*)"/g)].map((x) => x[1]);
      const want = ["さらに調べる", "公的な情報で確認する"];
      got.join("／") === want.join("／")
        ? ok(`一覧の組の見出しは棚卸しのとおり（${got.join("・")}）`)
        : bad(`一覧の組の見出しが棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
    }
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
  {
    // ⚠ **テンプレートリテラルの中に書いた HTML コメントに、バッククォートを入れない。**
    //   バッククォートはそこで文字列を終わらせるので、続きが JS として読まれる。
    //   3 回踏んでいる（2026-08-17 に 2 回）。最後は「⚠ 中身は 〈backtick〉<i>〈backtick〉 だけ
    //   差し替える」というコメントで `i is not defined` になり、帯・判定・写真が丸ごと消えた。
    //   ⚠ 実描画は捕まえるが、それは画面を開いてからで、しかも**全部が落ちる**ので原因が遠い。
    //     ここで、書いた瞬間に落とす。
    // ⚠ **生の中身を見る。** `seen` は HTML コメントを落としたあとなので、
    //   そこを見ても一生見つからない（最初そう書いて、わざと壊しても緑のままだった）。
    const raw = TOP;
    // ⚠ <script> の中だけを見る。CSS や本文の HTML コメントは、
    //   バッククォートがあっても壊れない（文字列の中にいない）。
    const scripts = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
    const bad2 = [...scripts.matchAll(/<!--[\s\S]*?-->/g)]
      .filter((m) => m[0].includes("`"))
      .map((m) => m[0].replace(/\s+/g, " ").slice(0, 70));
    bad2.length === 0
      ? ok("テンプレートリテラル内の HTML コメントに、バッククォートが無い")
      : bad(`HTML コメントにバッククォートがある（文字列がそこで切れる）: ${bad2.join(" ／ ")}`);
  }
  {
    // ⚠ **verify.js が渡すのは鍵であって、画面に出る字ではない**（2026-08-20）。
    //   ⚠ **words.js の METHOD に無い鍵を渡すと、バッジが黙って消える。**
    //     ⚠ 消えても画面は何も言わないので、ここで止める。
    const got = [...(seen["verify.js"] ?? "").matchAll(/method:\s*"([^"]*)"/g)].map((x) => x[1]);
    const want = ["read", "readVector", "read", "read"];
    const M = globalThis.KonjakuWords?.METHOD ?? {};
    const unknown = got.filter((k) => !(k in M));
    unknown.length
      ? bad(`verify.js が words.js の知らない鍵を渡している: ${unknown.join("・")}（バッジが黙って消える）`)
      : got.join("／") === want.join("／")
        ? ok(`根拠カードの取得方法は棚卸しのとおり（${[...new Set(got)].map((k) => `${k}→${M[k]}`).join("・")}／${got.length} 件）`)
        : bad(`根拠カードの取得方法が棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
  }
}

// ── 段の名乗りが、⚠ 画面 / README / SPEC で割れていないか ──────────
// ⚠ **2026-08-23 に踏んだ。**⚠ **画面は hidetzu/konjaku#225 で β を名乗り始めたのに、
//   ⚠ README は「プロトタイプです」と言い続けていた。**
// ⚠ **README は共有先まで届く**（`CLAUDE.md` §6）。⚠ **画面より遠くへ行く。**
// ⚠ **看板と共有カードは上で突き合わせているが、⚠ README は入っていなかった。**
// ⚠ **段の名乗り（α / β / 正式版 / プロトタイプ）だけを見る。**
//   ⚠ **README の書き方までは縛らない**（⚠ 文の形は自由）。
{
  const STAGE = ["プロトタイプ", "α 版", "α版", "β 版", "β版", "正式版"];
  const norm = (set) => new Set([...set].map((w) => w.replace(/\s*版$/, "")));
  // ⚠ **コメントを先に落とす**（⚠ 落とさないと、⚠ この決まりを説明した字面を拾う）。
  const stageOf = (text) => {
    const bare = text.replace(/<!--[\s\S]*?-->/g, "");
    const got = new Set(STAGE.filter((w) => bare.includes(w)));
    // ⚠ **`今昔 β` のように、⚠ 「版」を付けずに名乗ることがある。**⚠ 単独の β も拾う
    if (/[^A-Za-zα-ωΑ-Ω]β[^A-Za-zα-ωΑ-Ω]/.test(bare)) got.add("β 版");
    return norm(got);
  };
  // ⚠ **3 か所とも外へ出る**（⚠ 画面は見る人へ、⚠ README と SPEC は読む人へ）。
  const faces = [
    ["画面", stageOf(await readFile(join(PUB, "index.html"), "utf8"))],
    ["README", stageOf(await readFile(join(ROOT, "README.md"), "utf8"))],
    ["SPEC", stageOf(await readFile(join(ROOT, "docs", "SPEC.md"), "utf8"))],
  ];
  const silent = faces.filter(([, v]) => !v.size).map(([k]) => k);
  const key = ([, v]) => [...v].sort().join("・");
  const split = new Set(faces.map(key)).size > 1;
  if (silent.length === faces.length) {
    bad("どの面も段を名乗っていない（⚠ この検査が何も見ていない）");
  } else if (silent.length) {
    bad(`段を名乗っていない面がある（${silent.join("・")}）`
      + `。⚠ 名乗っているのは ${faces.filter(([, v]) => v.size).map(([k, v]) => `${k}「${[...v].join("・")}」`).join(" / ")}`
      + "。⚠ **README と SPEC は共有先まで届く**（`CLAUDE.md` §6）");
  } else if (split) {
    bad(`段の名乗りが割れている: ${faces.map(([k, v]) => `${k}「${[...v].join("・")}」`).join(" / ")}`
      + "。⚠ **1 つだけ直すと、⚠ 遠くへ行くものが古いまま配られる**");
  } else {
    ok(`画面・README・SPEC の段の名乗りが揃っている（${key(faces[0])}）`);
  }
}

// ── README も、⚠ 画面と同じ限界を書いているか ────────────────────
// ⚠ **掟 §6。**⚠ **外向けの文章（記事・OGP・SNS・README）にも同じ規則を適用する。**
//   ⚠ **README と OGP は共有先まで届く**ので、⚠ そこだけこの掟の外に出る。
//
// ⚠ **2026-08-23 に踏んだ。**⚠ README のプライバシーの節が
//   ⚠ **「Cookie を使わない／計測へ送らない」だけを書いていた。**
//   ⚠ **書いてあること自体は正しい**（⚠ 「計測へ」と範囲を限っている）。
//   ⚠ **落ちていたのは限界のほう**（⚠ 調べた場所は URL に入り、開くと配信元へ届く）。
//   ⚠ **画面には「▸ プライバシーについて」があるが、⚠ README に開く先は無い。**
//
// ⚠ **字面をそろえない**（⚠ 画面と README で長さが違うのは正当）。⚠ **主張で見る。**
{
  head("README も、画面と同じ限界を書いている");
  const rd = await readFile(join(ROOT, "README.md"), "utf8");
  // ⚠ **文で切ってから見る**（⚠ 別々の文に散っていると「言っている」とは言えない）。
  //   ⚠ **`/peel` の 3 段を見る検査で、⚠ IP の文を拾って素通りした**（2026-08-23）。⚠ 同じ轍を踏まない。
  const ss = rd.split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
  const has = (...res) => ss.some((t) => res.every((re) => re.test(t)));
  const miss = [
    [() => has(/調べた場所|検索した場所/, /URL|アドレス欄/, /入(り|ります)/),
      "調べた場所が URL に入ること（載る）"],
    [() => has(/URL|アドレス/, /配信元|Cloudflare/, /届|渡/),
      "その URL を開くと配信元へ届くこと（届く）"],
    [() => has(/こちらの記録に/, /残りません/),
      "こちらの記録には残らないこと（残らない）"],
  ].filter(([f]) => !f()).map(([, n]) => n);
  // ⚠ **言い切りすぎていないこと**（⚠ 2026-08-15 に画面で直した嘘を、⚠ README で繰り返さない）
  const lie = /(どこにも|一切)[^。\n]*送(りません|っていません)|サーバーには送りません/.test(rd);
  if (miss.length)
    bad(`README に、画面が言っている限界が無い: ${miss.join("、")}`
      + "（⚠ 掟 §6: ⚠ README は共有先まで届く。⚠ 画面と違って、開く先が無い）");
  else if (lie)
    bad("README が「どこにも送らない」まで言い切っている"
      + "（⚠ 調べた場所は URL に載り、開けば配信元へ届く。2026-08-15 に画面で直した嘘）");
  else ok("README も、画面と同じ 3 段（載る → 届く → 残らない）を書いている");
}

// ── いくつ確かめたか、⚠ 最後に名乗る ────────────────────────────
// ⚠ **0 件で緑にしない。**⚠ 1 件も走っていないのに「問題なし」と言わない
//   （⚠ 以前は SPEC との突き合わせが、⚠ 偶然この役目も果たしていた）。
// ⚠ **必ず、⚠ いちばん最後に置く**（2026-08-22 に踏んで移した）。
//   ⚠ **前は検索の fixture の節の中にあり、⚠ その行までの数を名乗っていた。**
//   ⚠ **後ろに検査を足したぶんが入らず、⚠ 実際は 206 件なのに「197 件」と言っていた。**
//   ⚠ **`CLAUDE.md` はここを「この数が正」と指しているので、⚠ 正本が実際より少なく名乗る形だった。**
//   ⚠ **落ちない。**⚠ **少なく言うだけなので、⚠ 気づけない。**
{
  // ⚠ **数は `test/check/lib.mjs` が持つ**（2026-08-24）。⚠ ここでは読むだけ。
  const mine = tally().passed + 1;   // ⚠ **自分もこれから 1 件になるので足す**
  mine > 1
    ? ok(`静的検査は ${mine} 件を数えた（⚠ この数が正。⚠ SPEC には書かない）`)
    : bad(`静的検査が ${mine} 件しか走っていない（⚠ 1 件も確かめていないので緑にしない）`);
}

const { failed, warned } = tally();
console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`); process.exit(1); }
console.log(`\x1b[32m問題なし\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`);
