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
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, basename, dirname } from "node:path";
import { VERSION_RE, hashOf, readSw } from "./sw-hash.mjs";
import { VERSION as BL_VERSION } from "./bl-format.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const PUB = join(ROOT, "public");
const SITE = "https://konjaku.hidetzu.work";
const CHECK_LINKS = process.argv.includes("--links");
// --links-new / --links-new=<ref>。指定が無ければ null（外へ出ない）
const NEW_LINKS = (() => {
  const a = process.argv.find((x) => x === "--links-new" || x.startsWith("--links-new="));
  return a === undefined ? null : (a.split("=")[1] ?? "");
})();

let failed = 0, warned = 0, passed = 0;
const ok   = (m) => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${m}`); };
const bad  = (m) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const warn = (m) => { warned++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

// 事物の索引の読み方。⚠ **ここ1か所**にする（z12 の束ごとに、中の z14 を1ビットずつ）。
//   写すと、索引の持ち方を変えたときに片方だけ直して、同じ問いに違う答えが出る。
const evCovered = (idx, tileOf) => (lon, lat) => {
  const t = tileOf(lon, lat, 14), S = Math.log2(idx.sub);
  const bx = t.x >> S, by = t.y >> S;
  const bit = 1 << (((t.y - by * idx.sub) * idx.sub) + (t.x - bx * idx.sub));
  return { t, on: !!((idx.tiles[`${bx}/${by}`] ?? 0) & bit) };
};

const pubFiles = await readdir(PUB);
const htmlFiles = pubFiles.filter((f) => extname(f) === ".html");
const jsFiles = pubFiles.filter((f) => extname(f) === ".js");
const src = {};
for (const f of [...htmlFiles, ...jsFiles]) src[f] = await readFile(join(PUB, f), "utf8");

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
for (const f of ["worker.js", "serve.js"]) {
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
  const needs = [...src[f].matchAll(/\b(KonjakuPlaces|Konjaku)\./g)].map((m) => m[1]);
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
  const outside = ["build-water.js", "check-tiles.js", "fetch-buildings.js", "serve.js"]
    .filter((f) => existsSync(join(ROOT, f)));
  const outsideSrc = Object.fromEntries(await Promise.all(
    outside.map(async (f) => [f, await readFile(join(ROOT, f), "utf8")])));
  const scriptsDir = (await readdir(join(ROOT, "scripts"))).filter((f) => f.endsWith(".mjs"));
  const scriptsSrc = Object.fromEntries(await Promise.all(
    scriptsDir.map(async (f) => [`scripts/${f}`, await readFile(join(ROOT, "scripts", f), "utf8")])));
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
          [new URL("https://msearch.gsi.go.jp/address-search/AddressSearch?q=x"), false, "住所検索"],
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

// ⚠ URL に地名と座標を載せているので、Referer で外へ出さないこと。
//   実測で /t への referer に ?q=豊洲&ll=35.65,139.79 が乗っていた。
//   画面に「地名も座標も送らない」と書いている以上、ここが外れたらその記述が嘘になる。
head("1.5 Referer の抑止");
{
  const hdr = await readFile(join(PUB, "_headers"), "utf8").catch(() => "");
  hdr.includes("Referrer-Policy: no-referrer")
    ? ok("_headers に Referrer-Policy: no-referrer")
    : bad("_headers に Referrer-Policy: no-referrer が無い");
  for (const f of htmlFiles) {
    /<meta\s+name="referrer"\s+content="no-referrer">/.test(src[f])
      ? ok(`${f} に meta referrer`)
      : bad(`${f}: meta referrer が無い（URL の地名・座標が Referer で漏れる）`);
  }
}

// ⚠ D1 の database_id を埋め忘れるとデプロイが通らない。
//   wrangler d1 create konjaku で作った id を入れること。
head("1.6 計測の貯め先");
{
  const w = await readFile(join(ROOT, "wrangler.jsonc"), "utf8").catch(() => "");
  if (!w.includes("d1_databases")) bad("wrangler.jsonc に D1 の設定が無い（計測が貯まらない）");
  else if (w.includes("PLACEHOLDER"))
    bad("wrangler.jsonc の database_id が PLACEHOLDER のまま（`npx wrangler d1 create konjaku` で作った id を入れる）");
  else ok("D1 の設定がある");
  existsSync(join(ROOT, "migrations", "0001_tick.sql"))
    ? ok("migrations がある")
    : bad("migrations/0001_tick.sql が無い");
}

// ⚠ ここまで worker.js は **構文しか見ていなかった**。
//   `npm run render` は `/t` を page.route で横取りするので、本物の Worker を
//   一度も通っていない（ブラウザが何を送るかは見ているが、受け側は見ていない）。
//   つまり「何を数えるか」の判定は、**どの検査からも実行されていなかった**。
//   読む前に落とす処理を入れたので、ここで実際に呼ぶ。
head("1.7 計測の受け口（/t を実際に呼ぶ）");
{
  const mod = await import(join(ROOT, "worker.js")).catch((e) => { bad(`worker.js を読めない: ${e.message}`); return null; });
  if (mod?.default?.fetch) {
    const ORIGIN = "https://konjaku.hidetzu.work";
    // D1 の代わり。書き込もうとした中身をそのまま溜める
    const writes = [];
    const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { writes.push({ sql, a }); } }) }) } };
    // ⚠ 本物と同じ形で投げる。Content-Length を自分で付けないと、
    //   この検査だけが通って本番で落ちる（逆も同じ）
    const post = async (body, opt = {}) => {
      writes.length = 0;
      const headers = { Origin: opt.origin ?? ORIGIN };
      if (!opt.noLength) headers["Content-Length"] = String(opt.len ?? new TextEncoder().encode(body).length);
      // ⚠ GET に body は付けられない（undici が投げる）。メソッドを変える検査では外す
      const method = opt.method ?? "POST";
      const req = new Request(`${ORIGIN}/t`,
        method === "GET" || method === "HEAD" ? { method, headers } : { method, body, headers });
      const res = await mod.default.fetch(req, env);
      return { status: res.status, wrote: writes.length };
    };

    // ① 実際に送っている本文が、全部数えられること。
    //   一覧は worker.js から取り出す（ここに書き写すと、同じ問いに答える実装が2つになる）。
    // ⚠ **コメントを先に落とす。** 落とさないと、EVENTS の中のコメントに書いてある
    //   `"後で"`（「使われなければ後で消す」の説明）を本文の一覧として拾い、
    //   「/t が数えていない本文がある: 後で」で落ちる。実際に踏んだ（2026-08-15）。
    //   CLAUDE.md §5 が「コメントを先に落とす」と書いているのは、これで何度目か。
    const wsrc = (await readFile(join(ROOT, "worker.js"), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const setOf = (name) => [...(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(wsrc)?.[1] ?? "")
      .matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const EV = setOf("EVENTS"), TG = setOf("TARGETS"), SR = setOf("SOURCES");
    const legit = [...EV, ...TG.flatMap((t) => [`health:${t}:ok`, `health:${t}:fail`]), ...SR.map((s) => `from:${s}`)];
    if (!legit.length) bad("worker.js から、受け付ける本文の一覧を取り出せない（この検査が何も見ていない）");
    else {
      const miss = [];
      for (const b of legit) { const r = await post(b); if (r.wrote !== 1) miss.push(b); }
      miss.length ? bad(`/t が数えていない本文がある: ${miss.join("、")}`)
                  : ok(`/t が ${legit.length} 種すべてを数える（最長 ${Math.max(...legit.map((x) => x.length))} 文字）`);
    }

    // ② 大きい body が、**読まれずに**落ちること（ここが本体）
    //
    // ⚠ 「書き込みが 0 だった」では、この主張を検証できない。
    //   直す前の実装（読み切ってから 48 文字に切る）でも、切った結果は列挙に無いので
    //   書き込みは 0 になる。**実際に緑のまま通った**（2026-08-15）。
    //   見たいのは結果ではなく「body に手を付けたかどうか」なので、
    //   body を流れにして、引かれたかどうかを記録する。
    //   ⚠ body を ReadableStream にして「引かれたか」を見る手は使えない。
    //     undici は Request を作った時点で、こちらの処理と関係なく流れを引く
    //     （実測: 構築直後は false、1tick 後に true）。それでは何も切り分けられない。
    //     見るのは **`req.text()` が呼ばれたかどうか**。主張はそれそのもの。
    const big = "judged.ok" + "A".repeat(100_000);
    {
      const real = new Request(`${ORIGIN}/t`, { method: "POST", body: big,
        headers: { Origin: ORIGIN, "Content-Length": String(new TextEncoder().encode(big).length) } });
      let readBody = false;
      const spy = new Proxy(real, {
        get(t, k) {
          if (k === "text" || k === "json" || k === "arrayBuffer" || k === "blob" || k === "formData") {
            readBody = true;
            return (...a) => Reflect.get(t, k).apply(t, a);
          }
          const v = Reflect.get(t, k);
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
      writes.length = 0;
      const res = await mod.default.fetch(spy, env);
      !readBody && writes.length === 0 && res.status === 204
        ? ok(`大きい本文（${big.length} 文字）に手を付けずに落とす（204・書き込み 0）`)
        : bad(`大きい本文を読んでいる（req.text() を呼んだ: ${readBody} / status ${res.status} / 書き込み ${writes.length}）`);
    }
    // ⚠ Content-Length を詐称しても、切り詰めた結果が列挙に無ければ数えない
    const r2 = await post(big, { len: 9 });
    r2.wrote === 0
      ? ok("Content-Length を偽っても、列挙に無い本文は数えない")
      : bad("Content-Length を偽ると数えてしまう");
    // ③ Content-Length が無いもの（chunked）も落ちること
    const r3 = await post("judged.ok", { noLength: true });
    r3.wrote === 0
      ? ok("Content-Length が無い本文は落ちる")
      : bad("Content-Length が無くても数えてしまう（ヘッダを付けなければ素通り）");
    // ④ 既にある約束（Origin・メソッド・列挙外）も、ここで一度に見ておく
    const r4 = await post("judged.ok", { origin: "https://evil.example.com" });
    const r5 = await post("judged.ok", { method: "GET" });
    const r6 = await post("judged.nope");
    r4.wrote === 0 && r4.status === 204 ? ok("よそのオリジンからは数えない（204）") : bad("よそのオリジンから数えてしまう");
    r5.status === 405 ? ok("POST 以外は 405") : bad(`POST 以外が ${r5.status}`);
    r6.wrote === 0 ? ok("列挙に無い本文は数えない") : bad("列挙に無い本文を数えてしまう");
  } else if (mod) bad("worker.js が default.fetch を出していない");
}

// ---------- 2. デプロイ設定 ----------
head("2. デプロイ設定");
{
  const raw = await readFile(join(ROOT, "wrangler.jsonc"), "utf8");
  const conf = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const dir = conf.assets?.directory;
  if (dir === "./public") ok(`assets.directory = ${dir}`);
  else bad(`assets.directory が ${JSON.stringify(dir)}。"." だと node_modules ごと上げてデプロイが落ちる`);

  const lock = await readFile(join(ROOT, "package-lock.json"), "utf8").catch(() => null);
  lock ? ok("package-lock.json がある（npm ci に必要）")
       : bad("package-lock.json が無い。Pages/Workers の npm clean-install が失敗する");
}

// ---------- 2.5 Service Worker の版 ----------
// ⚠ ここだけは「本番でしか壊れない」検査。
//   VERSION はキャッシュのキーそのもので、上げないと一度来た人に古い `/` と
//   `/share.js` が出続ける。ローカルでは初回訪問なので絶対に再現しない。
//   流入を測り始める直前に一度踏みかけた（看板を変えたのに v4 のままだった）。
head("2.5. Service Worker の版");
{
  try {
    const sw = await readSw();
    const want = await hashOf(sw);
    const now = sw.match(VERSION_RE)?.[1];
    if (now === want) ok(`konjaku-${want}（SHELL の中身と一致）`);
    else bad(`VERSION が古い: konjaku-${now} だが中身は konjaku-${want}。`
      + `npm run stamp で振り直す（古い画面が本番に出続ける）`);
  } catch (e) {
    bad(`Service Worker の版を確かめられなかった: ${e.message}`);
  }
}

// ---------- 2.6 配信中の版 ----------
// ⚠ ここも「本番でしか完結しない」検査。version.json は生成物で Git に入らないので、
//   ここで見られるのは**仕組みが繋がっているか**まで。
//   本番に出ている版が main の HEAD と一致することは、デプロイ後に
//   `curl -s https://konjaku.hidetzu.work/version.json` と照合して確かめる。
head("2.6. 配信中の版（/version.json）");
{
  // ⚠ 版の正しさの定義は scripts/version.mjs に1つだけ置いてある。
  //   ここで字面を写すと、片方だけ直したときに検査が通ってしまう。
  const { versionJson } = await import("./version.mjs");
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  try {
    const v = versionJson(SHA, "main");
    (Object.keys(v).join(",") === "commit,branch" && v.commit === SHA && v.branch === "main")
      ? ok(`正常な commit と branch から版を作れる（${JSON.stringify(v)}）`)
      : bad(`版の形が仕様と違う: ${JSON.stringify(v)}（commit と branch の2つ）`);
  } catch (e) {
    bad(`正常な commit と branch で版を作れない: ${e.message}`);
  }

  // ⚠ **通ってはいけない値で、本当に落ちること。**
  //   短縮 SHA を通すと「GitHub の HEAD と一致するか」を機械で照合できなくなる。
  const nope = [
    ["短縮 SHA", "0123456", "main"],
    ["大文字混じり", SHA.toUpperCase(), "main"],
    ["16進でない", "z".repeat(40), "main"],
    ["空の commit", "", "main"],
    ["commit が無い", undefined, "main"],
    ["空の branch", SHA, ""],
    ["branch が無い", SHA, undefined],
  ];
  const through = nope.filter(([, c, b]) => {
    try { versionJson(c, b); return true; } catch { return false; }
  });
  through.length
    ? bad(`版の検査を素通りする値がある: ${through.map(([n]) => n).join("、")}`
        + "（不正な版のまま build が通り、本番が嘘の commit を名乗る）")
    : ok(`通してはいけない値 ${nope.length} 通りで、版を作れない`);

  // 仕組みの結線。⚠ Workers Builds は build に `npm run build`、
  //   deploy に `npx wrangler deploy` を設定してある（そこは Cloudflare 側の設定で、
  //   ここからは見えない。⚠ **この検査では確かめられない**）。
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  /version\.mjs/.test(pkg.scripts?.build ?? "")
    ? ok(`npm run build が版を作る（${pkg.scripts.build}）`)
    : bad(`npm run build が scripts/version.mjs を呼んでいない: ${JSON.stringify(pkg.scripts?.build)}`);

  const ignored = (await readFile(join(ROOT, ".gitignore"), "utf8"))
    .split("\n").some((l) => l.trim() === "public/version.json");
  ignored ? ok(".gitignore が public/version.json を外している")
          : bad(".gitignore に public/version.json が無い（手元の版を commit すると、配信物の版として名乗られる）");

  // ⚠ 書いてあるだけでなく、**実際に追跡されていない**こと
  try {
    const tracked = execFileSync("git", ["ls-files", "--", "public/version.json"],
      { cwd: ROOT, encoding: "utf8" }).trim();
    tracked ? bad(`public/version.json が Git に入っている（生成物。配信物と食い違う版を名乗る）`)
            : ok("public/version.json は Git に入っていない");
  } catch (e) {
    warn(`Git の追跡状況を確かめられなかった: ${String(e.message).split("\n")[0]}`);
  }

  // ⚠ no-store。古い版を「いまの本番」と読むと、照合そのものが嘘になる。
  const hdr = await readFile(join(PUB, "_headers"), "utf8");
  const noStore = (() => {
    let cur = null;
    for (const raw of hdr.split("\n")) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim() || line.trim().startsWith("#")) continue;   // ⚠ コメントを先に落とす
      if (/^\//.test(line)) { cur = line.trim(); continue; }
      if (cur === "/version.json" && /^\s*Cache-Control:/i.test(line)) return /no-store/i.test(line);
    }
    return false;
  })();
  noStore ? ok("_headers が /version.json を no-store にしている")
          : bad("_headers の /version.json に Cache-Control: no-store が無い（古い版が「いまの本番」として読まれる）");

  // 手元に生成物があるときは、中身も見る（CI には無い。**無いことを緑と呼ばない**）
  const raw = await readFile(join(PUB, "version.json"), "utf8").catch(() => null);
  if (raw === null) ok("public/version.json は手元に無い（生成物。ここでは中身を見ていない）");
  else {
    try {
      const v = JSON.parse(raw);
      versionJson(v.commit, v.branch);
      Object.keys(v).join(",") === "commit,branch"
        ? ok(`手元の public/version.json は仕様どおり（${v.commit.slice(0, 7)} / ${v.branch}）`)
        : bad(`public/version.json の鍵が commit,branch ではない: ${Object.keys(v).join(",")}`);
    } catch (e) {
      bad(`public/version.json が仕様を満たしていない: ${e.message}`);
    }
  }
}

// ---------- 3. 内部リンク ----------
head("3. 内部リンク");
{
  const pages = new Set(htmlFiles.map((f) => basename(f, ".html")));
  for (const f of htmlFiles) {
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
    for (const f of ["index.html", "peel3d.js"]) {
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
  if (strip(src["index.html"]).includes("KonjakuPlaces")) ok("トップが places.js の検索を使っている");
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
      const { extraFiles } = await import("./sw-hash.mjs");
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
          + `決めたら scripts/check.mjs の PINNED を直す）`)
      : ok(`/vendor/ は immutable の約束を守っている（${Object.keys(PINNED).length} 本の中身が変わっていない）`);
  }
}

// ⚠ **住所検索を叩く実装は1か所だけ。**
//   以前は index.html と peel3d.js が同じものを持っていて、**実際に食い違っていた**
//   （/peel だけ時間切れも再試行も追い越し防止も無く、取れなかったときに
//   「見つかりませんでした」と書いていた）。揃え直したあとも「揃えてあるだけ」で、
//   片方だけ直す事故が起きうる状態だった（掟: 同じ問いに答える実装を2つ持たない）。
{
  const files = ["index.html", "peel.html", "places.js", "peel3d.js", "verify.js", "events.js", "share.js", "esc.js", "sw.js"];
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
  hits.length === 1 && hits[0].startsWith("places.js")
    ? ok(`住所検索を叩くのは places.js の1か所だけ（${hits[0]}）`)
    : bad(`住所検索を叩く箇所が1つでない: ${hits.join("、") || "0 か所"}`
      + `（画面ごとに持つと、片方だけ直す事故が起きる。places.js の createSearch() を使うこと）`);
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
  {
    const a = grab(idx, "data-privacy-lead");
    if (!a) bad("index.html に畳まずに見える1行（data-privacy-lead）が無い（この検査が何も見ていない）");
    else ok("index.html に畳まずに見える1行がある");
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
    const fills = [
        ["index.html", /privacyShort[\s\S]{0,300}PRIVACY_SHORT/.test(idx)],
        ["peel3d.js", /data-privacy-short[\s\S]{0,300}PRIVACY_SHORT/.test(
          await readFile(join(PUB, "peel3d.js"), "utf8"))],
    ].filter(([, has]) => !has).map(([f]) => f);
    const miss = NEED3.filter(([re]) => !re.test(short)).map(([, n]) => n);
    if (!short) bad("words.js に PRIVACY_SHORT が無い（両画面のプライバシーが空になる）");
    else if (boxes.length) bad(`プライバシーの 3 段を出す箱が無い: ${boxes.join("、")}`);
    else if (fills.length) bad(`プライバシーの 3 段を入れていない: ${fills.join("、")}（箱だけ残ると余白が増える）`);
    else if (miss.length)
      bad(`プライバシーの 3 段から段が落ちている: ${miss.join("、")}`
        + "（1 段でも落ちると、いちばん強い約束だけが残って「通信していない」と読める）");
    else ok("プライバシーの「載る → 届く → 残らない」は words.js の 1 か所で、2 画面が同じ文を出す");
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
    const back = [["作 hidetzu", "作者（出典ではない）"],
                  ["data-privacy-body", "プライバシーの詳しい説明"],
                  ["データについて", "データの説明"]]
      .filter(([w]) => peelNoComment.includes(w));
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

// ---------- 6. 外部リンク ----------
// ⚠ **PR ごとに外部サイトを叩かない**という方針は変えていない（他所への負荷）。
//   代わりに、叩かなくてもできることを PR でやる。
//
//   現在のリンク構成:
//     全部叩く                     8 本／PR（重複除去後・5 ホスト）
//     変更ファイルのリンクだけ     index.html が大半の URL を持つので十分には減らない
//     **新しく足した URL だけ**    平均 0.00 本／PR・最大 0 本   ← これを採る
//     収集だけ（外へ出ない）       0 本／PR                      ← これも採る
//
// ⚠ この Issue が挙げていた「失敗したまま main にマージした」事故（2026-08-14）を追うと、
//   壊れていたのは**リンクではなく検査自身**だった（readdir が返すディレクトリを
//   readFile して EISDIR）。収集を常に走らせれば、**外へ1本も出さずに**その型を PR で捕まえる。
head("6. 外部リンク");
{
  const urls = new Set();
  // ⚠ docs の下は入れ子になっている（adr/ ができた）。readdir の結果をそのまま
  //   readFile に渡すと、ディレクトリで EISDIR で落ちる。実際に落ちた（2026-08-14）。
  //   ⚠ この検査は PR では skip され、main にマージされてから初めて走る。
  //     つまり**壊れていることは、マージするまで分からない**。だから再帰で拾い切る。
  const mdFiles = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...await mdFiles(p));
      else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
  };
  const docs = await mdFiles(join(ROOT, "docs"));
  const texts = [...Object.values(src),
    ...(await Promise.all(docs.map((d) => readFile(d, "utf8")))),
    await readFile(join(ROOT, "README.md"), "utf8")];
  for (const t of texts) {
    for (const m of t.matchAll(/href="(https:\/\/[^"${]+)"/g)) urls.add(m[1]);
    for (const m of t.matchAll(/\]\((https:\/\/[^)${]+)\)/g)) urls.add(m[1]);
  }
  // ---- ここまでが「収集」。外へは1本も出ていない ----
  // ⚠ 0 件で緑にしない。走査が壊れて何も拾えなくなったとき、
  //   「リンクは全部生きている」と報告するのがいちばん危ない。
  const ext = [...urls].filter((u) => !u.startsWith(SITE)).sort();
  ext.length
    ? ok(`外部の URL を ${ext.length} 本拾った（${new Set(ext.map((u) => new URL(u).host)).size} ホスト）`)
    : bad("外部の URL を1本も拾えていない（走査が壊れている可能性）");

  // ---- ここから先だけが、実際に外へ出る ----
  // 何を叩くかは3通り:
  //   --links            全部（main へのマージ後と、週次）
  //   --links-new[=ref]  ref から見て**新しく足した URL だけ**（PR）
  //   指定なし           叩かない
  let targets = [];
  if (CHECK_LINKS) targets = ext;
  else if (NEW_LINKS !== null) {
    // ⚠ 比べる相手が取れないときに「新しいものは無い」と言わない。
    //   それは「取れなかった」を「無い」と言うのと同じ（掟）。取れなければ全部叩く。
    const base = NEW_LINKS || "origin/main";
    let before = null;
    try {
      const { execFileSync: ex } = await import("node:child_process");
      const at = (p) => { try { return ex("git", ["show", `${base}:${p}`], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
                          catch { return ""; } };  // その ref に無いファイル＝中身は空
      const list = ex("git", ["ls-tree", "-r", "--name-only", base], { encoding: "utf8" })
        .split("\n").filter((p) => /\.(html|js|md)$/.test(p) && !p.startsWith("node_modules"));
      before = new Set();
      for (const p of list) {
        const t = at(p);
        for (const m of t.matchAll(/href="(https:\/\/[^"${]+)"/g)) before.add(m[1]);
        for (const m of t.matchAll(/\]\((https:\/\/[^)${]+)\)/g)) before.add(m[1]);
      }
    } catch (e) {
      warn(`比べる相手（${base}）を読めなかったので、全部叩く: ${String(e.message).slice(0, 60)}`);
    }
    if (before === null) targets = ext;
    else {
      targets = ext.filter((u) => !before.has(u));
      targets.length
        ? ok(`このブランチで新しく足した URL は ${targets.length} 本（${base} と比べた）`)
        : ok(`このブランチで新しく足した URL は 0 本（${base} と比べた）。外へは出ない`);
    }
  }

  const UA = "konjaku-link-check/1.0 (+https://konjaku.hidetzu.work)";
  // ⚠ 到達できない理由を、リンク切れと混ぜない。
  //   実測（2026-08-14）: www.gsi.go.jp は古い TLS 再ネゴシエーションを使っていて、
  //   Node の fetch が既定で拒否する（ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED）。
  //   curl では 200 が返る。**リンクは生きている。**
  //   ⚠ 相手の TLS 設定のために、こちらの安全側の既定を緩めない。
  //     代わりに理由を名指しして、「到達できず」と「リンク切れ」を画面で区別する。
  //     毎回同じ2件が理由不明で出続けると、それが平常になって本当の切れを見逃す。
  const REASON = (e) => (e?.cause?.code === "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED"
    ? "相手が古い TLS。Node が既定で拒否（リンクは生きている）"
    : (e?.cause?.code ?? e?.name ?? "原因不明"));
  // ⚠ **新しく足した URL だけは、到達できなければ落とす。**
  //   既存のリンクが一時的に落ちているのは相手の都合だが、**いま自分が足した URL に
  //   一度も到達できない**のは、ほぼこちらの打ち間違い。
  //   実際、パスの打ち間違いは 404 で捕まるのに、**ドメインの打ち間違いは ENOTFOUND で
  //   警告どまり**だった（2026-08-15 に実測。CI は緑のまま通った）。
  //   ⚠ 相手の一時的な不調で止めないために、1回だけ再試行する。
  //   ⚠ 既知の TLS の件（www.gsi.go.jp。リンクは生きている）は落とさない。
  const strict = !CHECK_LINKS && NEW_LINKS !== null;
  const TLS = "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED";
  // ⚠ 自分のリポジトリの検査バッジは、**private のあいだ匿名では 404**（実測 2026-08-15）。
  //   ⚠ ここを素通りさせるだけにすると、**public にしたあと本当に壊れても気づけない**。
  //   だから 404 のときだけ理由付きの警告に落とし、**200 なら普通に通す**。
  //   public 化すれば 200 になってこの分岐に入らなくなる。**消し忘れても害が出ない形**にする。
  const OWN_ACTIONS = /^https:\/\/github\.com\/[^/]+\/konjaku\/actions\//;
  for (const u of targets) {
    let err = null;
    for (let i = 0; i < (strict ? 2 : 1); i++) {
      try {
        const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow",
          signal: AbortSignal.timeout(20000) });
        if (r.ok) ok(`${r.status} ${u}`);
        else if (r.status === 404 && OWN_ACTIONS.test(u))
          warn(`到達できず ${u}（自分のリポジトリが private のあいだは匿名で 404。public 化で解消する）`);
        else bad(`${r.status} ${u}`);
        err = null; break;
      } catch (e) { err = e; }
    }
    if (!err) continue;
    (strict && err?.cause?.code !== TLS)
      ? bad(`足したばかりの URL に到達できない ${u}（${REASON(err)}）。打ち間違いを疑う`)
      : warn(`到達できず ${u}（${REASON(err)}）`);
  }
  if (!CHECK_LINKS && NEW_LINKS === null)
    console.log("  （生死は見ていない。--links で全部／--links-new で足した分だけ）");
}

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
    ["public/index.html", /\{id:"peel"[\s\S]{0,200}?\}/g],
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
    ...rdk("scripts").filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`), "worker.js"];
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

// ⚠ 使っている CSS 変数が、全部どこかで定義されていること。
//   ⚠ 変数名を変えたとき、**JS が組み立てる HTML の中の var(--…) を忘れる**。
//     実測（2026-08-14）: --dim → --ink-dim に寄せたとき peel3d.js の8箇所を置き忘れ、
//     分母の「/ 533」だけが暗い灰色から本文色に変わっていた（画面は何も言わない）。
//   ⚠ 自己参照（--tap:var(--tap)）も、値が無効になるだけで静かに壊れる。実際に踏んだ。
{
  const { readFileSync: rfc } = await import("node:fs");
    // ⚠ **共通の定義（tokens.css）も見る。**2026-08-20 に 26 個をここへ寄せた。
    //   ⚠ 入れ忘れると、全部が「定義の無い変数」に見える（実際にそうなった）。
    const files = ["public/css/tokens.css",
      "public/index.html", "public/peel.html", "public/peel3d.js",
    "public/share.js", "public/verify.js", "public/places.js", "public/events.js"];
  const defined = new Set(), used = new Map(), self = [];
  for (const f of files) {
    let t = ""; try { t = rfc(f, "utf8"); } catch { continue; }
    // ⚠ コメントを先に落とす。落とさないと、`--tap:44px を割っていた` のように
    //   **この検査を説明するコメント**を検査自身が定義として拾い、
    //   その中の var(--tap) を「自己参照」と誤判定する（<details> の検査でも同じ形を踏んだ）。
    t = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of t.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
      defined.add(m[1]);
      if (m[2].includes(`var(${m[1]})`)) self.push(`${f}: ${m[1]}`);
    }
    for (const m of t.matchAll(/var\((--[a-z0-9-]+)\)/g))
      used.set(m[1], (used.get(m[1]) ?? new Set()).add(f));
  }
  const undef = [...used.keys()].filter((v) => !defined.has(v));
  self.length ? bad(`CSS 変数が自分自身を参照している（値が無効になる）: ${self.join("、")}`)
    : undef.length ? bad(`定義の無い CSS 変数を使っている: `
        + undef.map((v) => `${v}（${[...used.get(v)].join("・")}）`).join(" / "))
    : ok(`CSS 変数 ${defined.size} 個、使用 ${used.size} 種すべてに定義がある`);
  // ⚠ 掟の3色は、名前で区別が付くこと。--ok のような一般名に戻さない
  for (const v of ["--evidence", "--estimate", "--missing"])
    if (!defined.has(v)) bad(`判定の格を表す変数が消えている: ${v}`);
}

  // ⚠ **PC の 2 カラムは、寸法を 1 か所で決める**（2026-08-20・hidetzu/konjaku#87）。
  //   ⚠ **呼ぶ側に幅を写さない。**写すと、変えるときに 2 か所を直すことになる。
  //   ⚠ **`max-width` を新しく書かない**（狭い幅を既定にする方針・hidetzu/konjaku#93）。
  {
    const bad2 = [];
    const css = await readFile(join(PUB, "css", "tokens.css"), "utf8");
    const idx2 = (src["index.html"] ?? "").replace(/<!--[\s\S]*?-->/g, "");
    // ⚠ 幅の定義は tokens.css の 1 か所
    const def = [...css.matchAll(/--detail-pane-width\s*:\s*([^;]+);/g)];
    if (def.length !== 1) bad2.push(`--detail-pane-width の定義が ${def.length} 個（1 個にする）`);
    else if (!/rem/.test(def[0][1])) bad2.push(`--detail-pane-width が rem でない: ${def[0][1].trim()}`);
    // ⚠ 呼ぶ側は var() で呼ぶ。⚠ **数字を書かない**
    if (!/var\(--detail-pane-width\)/.test(idx2))
      bad2.push("index.html が --detail-pane-width を使っていない（2 カラムの幅が別の場所で決まっている）");
    // ⚠ 2 カラムの規則は min-width の中だけ。⚠ 狭い幅は素のまま
    const mq = [...idx2.matchAll(/@media\s*\(min-width:\s*([\d.]+)rem\)\s*\{/g)].map((m) => m[1]);
    if (!mq.includes("68.75"))
      bad2.push("2 カラムの切り替え（min-width:68.75rem）が無い");
    // ⚠ **格子（grid）で作らない。**⚠ 実測（2026-08-20・1280×800）: 列を指定しても
    //   ⚠ **行が左右で共有され、2 つの列ではなく 2 列の表**になる。
    //   ⚠ 左の「明治期の面」（119px）が右の帯を押し下げ、右の写真（400px）が
    //     左のバッジを y=946 へ押し下げた。⚠ **「重ねる」が画面の外へ出た。**
    //   ⚠ **列ごとに独立して積むのは float。**⚠ 戻したら止める。
    const two = idx2.slice(idx2.indexOf("@media (min-width:68.75rem)"));
    if (/\.verdict\{[^}]*display:\s*grid/.test(two))
      bad2.push("2 カラムを grid で作っている（行が左右で共有され、2 列の表になる）");
    if (!/float:\s*right;\s*clear:\s*right/.test(two))
      bad2.push("右の列が float:right + clear:right で積まれていない（列が独立しない）");
    bad2.length
      ? bad(`PC の 2 カラムの寸法が 1 か所で決まっていない: ${bad2.join("、")}`)
      : ok("PC の 2 カラムは、幅がトークン 1 か所・切り替えは min-width・左右が同じ行から始まる");
  }

  // ⚠ **ブラウザの文字サイズ設定に追従すること**（2026-08-20・hidetzu/konjaku#91）。
  //   ⚠ 直す前は `html,body{font:14px/1.65 …}` があり、⚠ **画面が設定を上書きしていた。**
  //     実測（375×667）: 設定を 125% / 150% にしても
  //     ⚠ **body も h1 も #q も 1px も変わらなかった**（14 / 19 / 16px のまま）。
  //   ⚠ **`--text-*` を rem にするだけでは足りない。**⚠ **html の px を外すのが本体。**
  //   ⚠ 既定時の見た目は変えていない（0.875rem × 既定 16px = 14px）。
  {
    const bad2 = [];
    const css = await readFile(join(PUB, "css", "tokens.css"), "utf8");
    for (const [f, st0] of [["index.html", src["index.html"]], ["peel.html", src["peel.html"]],
                            ["tokens.css", css]]) {
      const st = (st0 ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      // ⚠ **html セレクタに font-size / font 短縮形を書かない。**
      //   ⚠ body に書くのはよい（ルートを動かさない）。
      for (const m of st.matchAll(/(^|[}\n])\s*([^{}\n]*\bhtml\b[^{}]*)\{([^}]*)\}/g)) {
        const sel = m[2].trim(), body = m[3];
        if (/font-size\s*:/.test(body) || /(^|;)\s*font\s*:/.test(body))
          bad2.push(`${f}「${sel}」に文字の大きさがある（ブラウザの設定を画面が上書きする）`);
      }
      // ⚠ **--text-* は rem。**px に戻すと、設定を上げても字が変わらない
      for (const m of st.matchAll(/(--text-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        const [, name, v] = m;
        if (/\d\s*(px|pt)\b/.test(v)) bad2.push(`${f} ${name}: ${v.trim()}（rem で書く）`);
      }
    }
    bad2.length
      ? bad(`文字サイズがブラウザ設定に追従しない: ${bad2.join("、")}`)
      : ok("文字の根元は rem で、html に font-size を書いていない（ブラウザの文字サイズ設定に追従する）");
  }

// ⚠ 文字の大きさは、生の px で書かない。
//   直す前は font-size の宣言が 127 件・値が 16 種に散らばっていて、同じ「根拠」を出すのに
//   9 / 9.5 / 10 / 10.5px が混在していた。**まとめて上げることができない状態**だった。
//   いまは二層（値の段 --text-* → 役割 --fs-*）にしてあり、使う側は役割だけを書く。
//   ここが緩むと、また散らばる。
{
  const raw = [], roles = new Map();
  for (const f of [...htmlFiles, ...jsFiles]) {
    // ⚠ var(--fs-x) の閉じ括弧まで取る。`)` を除外して切ると `var(--fs-x` が残り、
    //   全部「生の値」に見えて 127 件が落ちる（書いた直後に踏んだ）
    for (const m of src[f].matchAll(/font-size:\s*(var\([^)]*\)|[^;}"'`]+)/g)) {
      const v = m[1].trim();
      if (/^var\(--fs-[a-z-]+\)$/.test(v)) { roles.set(v, (roles.get(v) ?? 0) + 1); continue; }
      // ⚠ font-size:0 は「文字を隠す」手法で、大きさの指定ではない（.big.map-loading .loading）
      if (v === "0") continue;
      raw.push(`${f}: ${v}`);
    }
  }
  raw.length
    ? bad(`font-size に生の値を書いている: ${raw.join("、")}`
        + `（--fs-* を使うこと。値は :root の --text-* にしか置かない）`)
    : ok(`font-size は全部 --fs-* 経由（${[...roles.values()].reduce((a, b) => a + b, 0)} 箇所 / ${roles.size} 役割）`);

  // ⚠ 値の段は、両方の画面で同じ名前で定義されていること。
  //   片方だけ増やすと、同じ役割の文字が画面によって違う大きさになる。
  const scale = {};
  for (const f of ["index.html", "peel.html"]) {
    scale[f] = new Set();
    for (const m of (src[f] ?? "").matchAll(/(--text-[a-z0-9-]+)\s*:/g)) scale[f].add(m[1]);
  }
  // peel は 3D 固有の段（--text-hero 系）を持ってよい。逆は許さない
  const onlyIndex = [...scale["index.html"]].filter((v) => !scale["peel.html"].has(v));
  onlyIndex.length
    ? bad(`index.html にしかない文字の段がある: ${onlyIndex.join("、")}（peel.html にも同じ名前で置くこと）`)
    : ok(`文字の段は両方の画面で揃っている（index ${scale["index.html"].size} 段 / peel ${scale["peel.html"].size} 段）`);
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
  const { pack, unpack, VERSION, HSRC } = await import("./bl-format.mjs");
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
  const { tileOf } = await import("./db.mjs");
  const ip = "public/data/ev/index.json";
  if (!ex2(ip)) bad("事物の索引が無い");
  else {
    const idx = JSON.parse(rf2(ip, "utf8"));
    // 索引は z12 の束ごとに、中の z14 タイルを1ビットずつ立てて持っている（読み方は evCovered）
    const covered = evCovered(idx, tileOf);
    const m = /const UNSURVEYED = "ll=([\d.]+),([\d.]+)/.exec(rf2("scripts/render.mjs", "utf8"));
    if (!m) bad("render.mjs の UNSURVEYED が読めない（未整備の検査が土地を失っている）");
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
  const { toDrop } = await import("./db.mjs");
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
  for (const f of ["public/peel.html", "public/index.html"]) {
    // ⚠ コメントを先に落とす。落とさないと、この検査を説明するコメントに書いた
    //   `<details>` の字面を検査自身が拾って落ちる（実際に踏んだ）。
    //   コメントは画面に出ないので、見るべきでもない。
    const s = rf(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    // <details> … </details> の中身を取り出す（入れ子は使っていない。使ったらここで気づく）
    if (/<details[^>]*>(?:(?!<\/details>)[\s\S])*<details/.test(s)) {
      bad(`${f}: <details> が入れ子になっている。この検査は入れ子を想定していない`); continue;
    }
    const inside = [...s.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1]).join("\n");
    if (!inside) { ok(`${f}: 畳む箱は無い`); continue; }
    const hit = RESULT_IDS.filter((id) => new RegExp(`id="${id}"`).test(inside));
    hit.length
      ? bad(`${f}: 判定の結果が畳んだ <details> の中にある（${hit.join(",")}）。閉じていると画面に出ない`)
      : ok(`${f}: 判定の結果は畳んだ中に無い（畳む箱 ${(s.match(/<details/g) ?? []).length} 個）`);
  }
}

// ⚠ 説明から「この画面では自明なもの」を落とす規則が、**本題まで落としていない**こと。
//   規則そのものは index.html にしかない（掟: 同じ問いに答える実装を2つ持たない）ので、
//   ここでは書き写さずに切り出して動かす。書き写すと、直したのに検査が古いままになる。
{
  const { readFileSync: rf } = await import("node:fs");
  const html = rf("public/index.html", "utf8");
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
    const { open } = await import("./db.mjs");
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

// ⚠ 文書やテンプレートに書いてある `npm run X` が、実在すること。
//   実際に踏んだ（2026-08-15）: docs/SPEC.md が `npm run search-check` と書いていたが、
//   本当の名前は `npm run check-search` だった。読んだ人が打っても動かない。
//   件数がずれるのは見た目の問題だが、**コマンド名の誤りは押して何も起きない導線**で、
//   この製品が置かないと決めているもの（掟: 押しても何も起きない導線を置かない）。
{
  const { readFileSync: rf, readdirSync: rd } = await import("node:fs");
  const scripts = Object.keys(JSON.parse(rf("package.json", "utf8")).scripts ?? {});
  // ⚠ 無い場所を渡されても落とさない（.claude はまだ無いリポジトリもある）
  const walk = (d) => { try { return rd(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]); } catch { return []; } };
  const files = [...walk("docs"), ...walk(".github"), ...walk(".claude"),
    "README.md", "CLAUDE.md"]
    .filter((f) => /\.(md|yml|yaml)$/.test(f));
  const miss = [];
  for (const f of files) {
    let s = ""; try { s = rf(f, "utf8"); } catch { continue; }
    for (const m of s.matchAll(/npm run ([a-z0-9:-]+)/g))
      if (!scripts.includes(m[1])) miss.push(`${f}: npm run ${m[1]}`);
  }
  miss.length
    ? bad(`書いてあるのに package.json に無いコマンド: ${[...new Set(miss)].join("、")}`)
    : ok(`文書の \`npm run\` は全部実在する（${files.length} ファイル）`);

  // ⚠ 文書どうしのリンクが、実在するファイルを指していること。
  //   実際に踏んだ（2026-08-15）: README の「状態」節が
  //   README が削除済みの文書を指したままで、内部リンクが2本とも 404 だった。
  //   ⚠ 3節の内部リンク検査は `public/*.html` の href しか見ておらず、ここは素通りしていた。
  //   （掟: 押しても何も起きない導線を置かない。押した結果が 404 なら、なお悪い）
  {
    const { existsSync: ex2 } = await import("node:fs");
    const mds = files.filter((f) => f.endsWith(".md"));
    const dead = [];
    let links = 0;
    for (const f of mds) {
      let s = ""; try { s = rf(f, "utf8"); } catch { continue; }
      for (const m of s.matchAll(/\]\(([^)\s]+)\)/g)) {
        const t = m[1];
        if (/^(https?:|#|mailto:)/.test(t)) continue;   // 外部URLと見出しアンカーは別の話
        links++;
        // ⚠ 末尾の #見出し を落としてから見る。付いたままだと全部「無い」になる
        const rel = t.split("#")[0];
        if (!rel) continue;
        const target = join(dirname(join(ROOT, f)), rel);
        if (!ex2(target)) dead.push(`${f} → ${t}`);
      }
    }
    dead.length
      ? bad(`文書のリンクが、実在しないものを指している: ${dead.join("、")}`)
      : ok(`文書どうしのリンクは全部生きている（${mds.length} ファイル / ${links} 本）`);
  }

  // ⚠ **コード中のコメントから ADR を指しているものも見る。**
  //   上の検査は .md のマークダウンリンクしか見ないので、
  //   コメントに素のパスで書いた `docs/adr/00xx-….md` は素通りする。
  //   ⚠ ADR の名前を変えたら黙って壊れる。コメントから ADR を指すなら、
  //     その参照が生きていることまで追跡する。
  {
    const { existsSync: ex3 } = await import("node:fs");
    const cands = [...htmlFiles, ...jsFiles].map((f) => [f, src[f]])
      .concat([["worker.js", await readFile(join(ROOT, "worker.js"), "utf8").catch(() => "")]])
      .concat(await Promise.all(["check.mjs", "render.mjs", "search-check.mjs"]
        .map(async (f) => [`scripts/${f}`, await readFile(join(ROOT, "scripts", f), "utf8").catch(() => "")])));
    const dead = [];
    let refs = 0;
    for (const [f, t] of cands) {
      for (const m of (t ?? "").matchAll(/docs\/adr\/[0-9]{4}-[^\s)）」`'"]+\.md/g)) {
        refs++;
        if (!ex3(join(ROOT, m[0]))) dead.push(`${f} → ${m[0]}`);
      }
    }
    dead.length
      ? bad(`コードから指している ADR が実在しない: ${dead.join("、")}`)
      : ok(`コードから指している ADR は全部実在する（${refs} 箇所）`);
    // ⚠ **0 件で緑にしない。** ADR 参照が全部消えても通ってしまう
    //   （前の版はそうなっていた。レビューで指摘された）。
    if (!refs) bad("コードから ADR を指している箇所が1つも無い（この検査が何も見ていない）");
  }

  // ⚠ **このリポジトリの Issue 番号を、コードや文書に埋めない。**
  //   新しいリポジトリでは番号が 1 から振り直され、**同じ番号が別の Issue を指す**。
  //   ⚠ 前の版はこれを検出できず、**取り残しがあるのに CI が緑のままだった**
  //     （2026-08-15 のレビューで指摘。私の走査は番号の範囲と拡張子を絞りすぎていた）。
  //   直していないことは、番号ではなくコメントと ADR に名前で書く。
  {
    const { execFileSync: ex4 } = await import("node:child_process");
    let files = [];
    try {
      files = ex4("git", ["ls-files"], { encoding: "utf8", cwd: ROOT }).split("\n")
        .filter((f) => f && !/^public\/(vendor|data)\//.test(f) && !/\.(svg|jsonl)$/.test(f));
    } catch { bad("git ls-files が使えない（この検査が何も見ていない）"); }
    // ⚠ **binary は中身で外す。拡張子で並べない。**
    //   前の版は拡張子を並べていて、フォントを1つ足しただけで落ちた
    //   （2026-08-15 実測。`.otf` を utf8 として読むと、番号らしき並びが
    //   たまたま出て「Issue 番号が埋まっている」と言った）。
    //   ⚠ ここに実例の番号を**書かない**。書くと、この検査が自分のコメントを拾う
    //     （CLAUDE.md「検査を説明するコメントに書いた字面を検査自身が拾う」）。
    //   ⚠ 拡張子を足して直すと、**次の形式でまた踏む**。NUL を含むかで見る。
    // ⚠ 「#数字」の形をしていても、Issue 番号ではないものがある。
    //   ⚠ **行ごとに除外しない。出てきた「#数字」1件ずつ、その場で見る。**
    //     行で除外すると、同じ行に本物が混ざったとき丸ごと見逃す
    //     （最初はそう書いていて、レビューで指摘された）。
    const hits = [];
    for (const f of files) {
      let buf; try { buf = await readFile(join(ROOT, f)); } catch { continue; }
      if (buf.includes(0)) continue;
      const t = buf.toString("utf8");
      t.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/#(\d{1,4})\b/g)) {
          const at = m.index;
          const before = line.slice(0, at);
          const after = line.slice(at);
          // ① HTML の実体参照（アポストロフィなどの数値参照）。直前が & か | で、直後が数字と ;
          if (/&[a-z|(]*$/.test(before) && /^#\d+;/.test(after)) continue;
          // ② URL の断片（地理院地図のズーム/緯度/経度）。同じ行の、この位置より前に URL がある
          if (/https?:\/\/[^\s"'`)]*$/.test(before)) continue;
          // ③ リポジトリ名つきの参照。⚠ **よそのリポジトリだけではない。**
          //    自分のリポジトリでも、名前つきなら移行後も同じ Issue を指す
          //    （落とすのは裸の番号。振り直されると別のものを指すのはそちらだけ）。
          if (/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(before)) continue;
          // ④ 例示。⚠ **「例」の字が行にあるだけでは通さない。**
          //    `#<番号>` のような、実在の番号でない書き方だけを許す
          if (/^#<[^>]+>/.test(after)) continue;
          // ⑤ 先頭が 0 のものは Issue 番号ではない。⚠ Issue は 1 から振られ、
          //    0 埋めもされない。**16進の色**（`#000`）がここに来る。
          //    ⚠ 色を「色だから」と外すと、文脈の判定が要って脆くなる。
          //    **番号の側の性質**（0 で始まらない）で外すほうが崩れない。
          if (m[1].startsWith("0")) continue;
          hits.push(`${f}:${i + 1} ${m[0]}`);
        }
      });
    }
    hits.length
      ? bad(`このリポジトリの Issue 番号が埋まっている: ${hits.join("、")}`
          + `（新しいリポジトリでは別の Issue を指す。番号ではなく、`
          + `コメント単体で分かる書き方＋ADR を使うこと）`)
      : ok(`コード・文書に、この repo の Issue 番号は埋まっていない（${files.length} ファイルを走査）`);
  }
}

// ⚠ ホーム画面に追加した人が押すショートカットが、実在する行き先を指していること。
//   実際に踏んだ（2026-08-15）: `{"name":"昔と今を重ねて比べる","url":"/eras"}` が
//   残っていたが `public/eras.html` は撤去済みで、**押すと 404** だった。
//   ⚠ manifest は sw.js の SHELL に入っているので、**ホーム画面に追加済みの端末には
//     その死んだショートカットがキャッシュされている**。
//   ⚠ この repo は manifest を一度も検査していなかった。ここが初めて。
//   （掟: 押しても何も起きない導線を置かない。押した結果が 404 なら、なお悪い）
{
  const raw = await readFile(join(PUB, "manifest.webmanifest"), "utf8").catch(() => null);
  if (!raw) bad("manifest.webmanifest が読めない");
  else {
    let m = null;
    try { m = JSON.parse(raw); } catch (e) { bad(`manifest.webmanifest が JSON として壊れている: ${e.message}`); }
    if (m) {
      // start_url と shortcuts の url、icons の src を全部見る
      const targets = [
        ...(m.start_url ? [["start_url", m.start_url]] : []),
        ...(m.shortcuts ?? []).map((s) => [`shortcut「${s.name}」`, s.url]),
        ...(m.icons ?? []).map((i) => ["icon", i.src]),
      ];
      if (!targets.length) bad("manifest に見るべき行き先が1つも無い（この検査が何も見ていない）");
      const dead = [];
      for (const [what, u] of targets) {
        // クエリと素片を落として、配信されるファイルに直す
        const p = String(u).split("?")[0].split("#")[0].replace(/^\//, "") || "index.html";
        // ⚠ 拡張子が無いものは Workers Assets が .html を足して返す（serve.js も同じ）
        if (existsSync(join(PUB, p)) || existsSync(join(PUB, `${p}.html`))) continue;
        dead.push(`${what} → ${u}`);
      }
      dead.length
        ? bad(`manifest の行き先が実在しない: ${dead.join("、")}（押すと 404 になる）`)
        : ok(`manifest の行き先は全部実在する（${targets.length} 件）`);
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
  const { tileOf } = await import("./db.mjs");
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
    const { SCHEMA } = await import("./db.mjs");            // ⚠ スキーマは写さない
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
    const m = /const TOP_EXAMPLE_IDS\s*=\s*\[([^\]]*)\]/.exec(src["index.html"] ?? "");
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

    // ---- ⚠ タグ。知らない tag は外部扱い（既定値はここ 1 つ）----
    for (const t of ["own", "why", "ext"]) eq(W.tag(t), W.TAG[t], `tag(${t})`);
    eq(W.tag("zzz"), W.TAG.ext, "知らない tag が外部扱いになっていない");
    eq(W.tag(undefined), W.TAG.ext, "tag 無しが外部扱いになっていない");
    // ⚠ **3 つの名前が互いに違う。**同じ字だと、押した先が区別できない
    yes(new Set(Object.values(W.TAG)).size === 3, "タグの名前が重なっている");
    // ⚠ **消した priv が戻っていない。**付ける場所が無い語を画面に置かない
    yes(!("priv" in W.TAG), "tag:priv が戻っている（付ける場所がどこにも無い）");
  }
  fails.length
    ? bad(`words.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`words.js を動かして確認（0 件と答えを出せないを分ける・根拠カードと共有カードが同じ行・タグ 3 つと既定値）`);
}

// ⚠ **字を持っているのは words.js だけ。**呼ぶ側に写しを作らない。
{
  const OWNED = ["記録なし", "この土地から", "今昔で見る", "別のサイト↗"];
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
    // ---- 地表。届いていないなら「実測」と言わない ----
    eq(P.groundRow(true, ERA).tag, "実測", "届いた地表");
    eq(P.groundRow(false, ERA).tag, "未取得", "届いていない地表");
    yes(P.groundRow(false, ERA).body.includes("1984–86"), "届いていない地表に、どの年代かが無い");
    yes(P.groundRow(false, null).body.includes("明治期"), "明治期の地表の呼び名");
    // ⚠ ここが本丸。届いていないことを「無い」と言わせない
    yes(/記録の有無は分かっていない/.test(P.groundRow(false, ERA).note ?? ""),
      "届いていない地表に「記録の有無は分かっていない」が無い");

    // ---- 水面。読めなかった（未取得）と、本当に無い（欠落）を混ぜない ----
    eq(P.waterRow({ waterRead: true }).tag, "実測", "読めた水面");
    eq(P.waterRow({ waterRead: false, waterUnread: true }).tag, "未取得", "読めなかった水面");
    eq(P.waterRow({ waterRead: false, waterUnread: false }).tag, "欠落", "本当に無い水面");

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
    // 建設年が1件も分かっていないときは、光らせるボタンを出さない（押しても何も起きない導線）
    eq(P.buildingRows({ bldState: "ok", total: 9, dated: 0 }).at(-1).peek, null,
      "建設年 0 件なのに光らせるボタンがある");
    yes(P.buildingRows({ bldState: "ok", total: 9, dated: 3 }).at(-1).peek?.id === "peekY",
      "建設年があるのに光らせるボタンが無い");

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

// 2 画面で共通の見た目の定義は、1 か所にしか書かないこと。
// ⚠ 実測（2026-08-20）: 同じ名前・同じ値が **26 個**、index.html と peel.html の
//   両方に書いてあった。⚠ 片方だけ直すと、2 画面で見た目がずれる（ADR 0021）。
// ⚠ **値が違うものは、ここでは咎めない**（--bg / --ink / --ink-dim / --line / --surface の 5 つ。
//   ⚠ どちらが正かは決まっていないので、各ページに残してある）。
{
  const fails = [];
  const styleOf = (t) => {
    const m = /<style>([\s\S]*?)<\/style>/.exec(t ?? "");
    return (m ? m[1] : "").replace(/\/\*[\s\S]*?\*\//g, "");
  };
  const declOf = (css) => {
    const o = {};
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) o[m[1]] = m[2].trim();
    return o;
  };
  // ⚠ src は public/ 直下しか持っていない。⚠ 読めなければ落とす（空振りさせない）
  const shared = declOf(await readFile(join(PUB, "css", "tokens.css"), "utf8").catch(() => ""));
  const idx = declOf(styleOf(src["index.html"])), peel = declOf(styleOf(src["peel.html"]));
  if (!Object.keys(shared).length) fails.push("public/css/tokens.css を読めない（この検査が何も見ていない）");
  else {
    // ① 共通のものが、ページ側に残っていないこと
    for (const [f, d] of [["index.html", idx], ["peel.html", peel]])
      for (const k of Object.keys(shared))
        if (k in d) fails.push(`${f} に ${k} が残っている（tokens.css と二重）`);
    // ② ⚠ 同じ名前・同じ値が 2 ページに新しく生えていないこと
    for (const k of Object.keys(idx))
      if (k in peel && idx[k] === peel[k]) fails.push(`${k} が 2 ページに同じ値で書かれている（tokens.css へ）`);
    // ③ 両ページが読み込んでいること
    for (const f of ["index.html", "peel.html"])
      if (!/href="\.\/css\/tokens\.css"/.test(src[f] ?? "")) fails.push(`${f} が tokens.css を読んでいない`);
  }
  fails.length
    ? bad(`2 画面で共通の見た目の定義が 1 か所になっていない: ${fails.slice(0, 5).join(" / ")}`
        + `（片方だけ直すと、2 画面で見た目がずれる）`)
    : ok(`2 画面で共通の見た目の定義は tokens.css の 1 か所（${Object.keys(shared).length} 個。`
        + `⚠ 値が違う 5 つは各ページに残す）`);
}

// 外へ出る相手の住所は、1 か所にしか書かないこと。
// ⚠ 2 か所に書くと、片方だけ直したときに**同じ画面で別の相手を見る**
//   （ADR 0021）。実測（2026-08-19）: 地理院タイルの入口が verify.js と peel3d.js の
//   2 か所にあった。⚠ index.html は既に Konjaku.GSI を借りていた。
// ⚠ **コメントは先に落とす。**落とさないと、この検査を説明したコメントを拾う。
{
  const fails = [];
  const strip = (t) => (t ?? "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  const HOSTS = [
    { re: /["'`]https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz["'`]/g, nm: "地理院タイル", own: "verify.js" },
    { re: /["'`]https:\/\/maps\.gsi\.go\.jp\/xyz["'`]/g, nm: "地理院ベクトル", own: "verify.js" },
  ];
  for (const h of HOSTS) {
    const where = [];
    for (const f of Object.keys(src)) {
      const n = [...strip(src[f]).matchAll(h.re)].length;
      if (n) where.push(`${f}×${n}`);
    }
    if (where.length !== 1 || !where[0].startsWith(h.own))
      fails.push(`${h.nm} の住所が ${where.join(" / ") || "どこにも無い"}（${h.own} の 1 か所だけにする）`);
  }
  // ⚠ 借りる側が、本当に借りていること（自前に戻ったら落とす）
  if (!/const GSI\s*=\s*Konjaku\.GSI/.test(src["peel3d.js"] ?? ""))
    fails.push("peel3d.js が Konjaku.GSI を借りていない");
  fails.length
    ? bad(`外へ出る相手の住所が 1 か所になっていない: ${fails.join(" / ")}`
        + `（片方だけ直すと、同じ画面で別の相手を見る）`)
    : ok(`外へ出る相手の住所は 1 か所（地理院タイル・ベクトルとも verify.js。peel3d.js は借りている）`);
}

// ドメインモデル（docs/DOMAIN.md）が、実物とつながっていること。
// ⚠ **文書は誰も実行しないので、黙って古くなる。**機械で見られるところだけ見る。
// ⚠ **中身の正しさ（言葉づかいが良いか）はここでは見ない。**見るのは
//   「言葉の持ち主」として名指ししたものが**実在するか**と、
//   ⚠ **画面に出さないと決めた語が、本当に出ていないか**。
{
  const dom = await readFile(join(ROOT, "docs", "DOMAIN.md"), "utf8").catch(() => "");
  const fails = [];
  if (!dom) fails.push("docs/DOMAIN.md を読めない");
  else {
    // ① 持ち主として名指ししたものが実在すること
    const OWNERS = [["public/prov.js", "KonjakuProv"], ["public/swale.js", "SWALE"],
                    ["public/verify.js", "ERAS"]];
    for (const [f, sym] of OWNERS) {
      if (!dom.includes(f)) fails.push(`DOMAIN.md が ${f} を名指ししていない`);
      const src2 = f.startsWith("public/") ? src[f.slice(7)] : null;
      if (src2 == null) fails.push(`${f} を読めない`);
      else if (!src2.includes(sym)) fails.push(`${f} に ${sym} が無い（持ち主が変わった）`);
    }
    for (const [f, sym] of [["WORD", "peel3d.js"], ["TOPWORD", "index.html"]]) {
      if (!dom.includes(f)) fails.push(`DOMAIN.md が ${f} を名指ししていない`);
      if (!(src[sym] ?? "").includes(`const ${f} = {`) && !(src[sym] ?? "").includes(`const ${f} = {`))
        fails.push(`${sym} に ${f} が無い（持ち主が変わった）`);
    }
    // ② ⚠ 画面に出さないと決めた語が、**利用者に見えるところ**に出ていないこと。
    //   ⚠ コメントは先に落とす（検査が自分の説明を拾う。3 回踏んでいる）。
    //   ⚠ 出典・/about は別（そこでは使ってよい）。ここでは
    //     **判定文を組み立てている行**だけを見る。
    const strip = (t) => (t ?? "").split("\n")
      .map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n").replace(/<!--[\s\S]*?-->/g, "");
    const BAN = [
      { w: "この場所は", why: "場所の指し方は「この土地は」に統一（DOMAIN §2-1）" },
    ];
    for (const f of ["index.html", "peel3d.js", "peel.html"])
      for (const g of BAN) {
        const n = [...strip(src[f]).matchAll(new RegExp(g.w, "g"))].length;
        if (n) fails.push(`${f} に「${g.w}」が ${n} 箇所（${g.why}）`);
      }
  }
  fails.length
    ? bad(`ドメインモデルと実物が食い違っている: ${fails.join(" / ")}`
        + `（docs/DOMAIN.md が言葉の持ち主。実装を変えたら、そちらも直す）`)
    : ok(`docs/DOMAIN.md の名指しは実在し、統一した語だけが画面に出ている`);
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
  if (!/const scrollToEl\s*=/.test(src["index.html"] ?? ""))
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
      ["index.html", src["index.html"], src["index.html"]],
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
    yes(W.precision(false) !== "" && W.precision(true) === "",
      "粗い区分のときに、そう書いていない");
    yes(/広い区分/.test(W.precision(false)), `粗さの書き方が変わった: ${W.precision(false)}`);

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
  const js = [...(src["index.html"] ?? "").matchAll(
    /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
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
    const [B, W, P] = new Function("KonjakuSwale", "KonjakuProv",
      `${m[0]}${mw[0]}\nreturn [breakdown, WORD, paintBreakdown];`)(
        globalThis.KonjakuSwale, globalThis.KonjakuProv);
    // ⚠ 組み立てた結果そのものを見る。**戻り値だけ見ていると、画面に出る分母を見ていない**
    //   （実測 2026-08-19: 分母を総数に戻す壊し方で、この検査が落ちなかった）
    const paint = (counts, total) => { const el = { innerHTML: "" }; P(el, B(counts, total), "ok"); return el.innerHTML; };
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
    const hUn = paint({ "読み込めず": 20, "旧水部": 80 }, 100);
    yes(/80<span[^>]*> \/ 80<\/span>/.test(hUn),
      `画面に出る分母が「判定できた件数」になっていない: ${(/ \/ \d+</.exec(hUn) ?? ["(無し)"])[0]}`);
    yes(!/ \/ 100</.test(hUn), "画面に出る分母が総数になっている（判定できた分が小さく見える）");
    // ⚠ 色見本が付くのは分類の行だけ。範囲外の行に付くと「明治期は陸だった」に読める
    yes((hUn.match(/class="swatch"/g) ?? []).length === 1,
      "分類でない行にも色見本が付いている");
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
{
  const gm = /\nfunction groundState\(arrived, late, fail\)\{[\s\S]*?\n\}/.exec(src["peel3d.js"] ?? "");
  const em = /\nfunction eraReadout\(state, isLatest, isMeiji, sub, online\)\{[\s\S]*?\n\}/.exec(src["peel3d.js"] ?? "");
  if (!gm || !em) bad(`peel3d.js の ${!gm ? "groundState" : "eraReadout"} を取り出せない（この検査が何も見ていない）`);
  else {
    const G = new Function(`${gm[0]}\nreturn groundState;`)();
    const f = new Function(`${em[0]}\nreturn eraReadout;`)();
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

    for (const [isLatest, isMeiji, what] of [[true, false, "現在"], [false, false, "過去"], [false, true, "明治期"]]) {
      // ---- 届いているとき ----
      // ⚠ **普段は名乗らない。**（2026-08-19 に変えた）
      //   出ているのが当たり前のときに名乗ると、主役（年代）から目を奪う。
      //   実測: 320 幅で年代の字 38px に対し名乗りは 12px だが、行の頭に居るので先に読まれ、
      //   利用者役は「何のことか一瞬分からなかった」と答えた。
      //   ⚠ **守りたいのは「出ていないものを表示中と言わない」ほう。**それは下で見る。
      const ok = f(G(true, false, null), isLatest, isMeiji, "最新の空中写真", true);
      yes(!ok.kick, `${what}: 届いているのに「${ok.kick}」と名乗っている（普段は名乗らない）`);
      yes(ok.sub === "最新の空中写真", `${what}: 届いているときの説明が変わった`);
      yes(!ok.hint, `${what}: 届いているのに接続の話をしている`);

      // ---- 猶予切れ（理由を知らない）----
      const late = f(G(false, true, null), isLatest, isMeiji, "最新の空中写真", true);
      yes(late.kick !== "表示中", `${what}: 出ていないのに「表示中」と言っている`);
      // ⚠ **出ていないときは必ず名乗る。**空にすると、普段と見分けがつかなくなる
      yes(!!late.kick, `${what}: 出ていないのに何も名乗っていない（普段と区別がつかない）`);
      // ⚠ **理由を知らないのに断定しない。** 404 はここに来る
      yes(!/読み込めませんでした|取得できませんでした|失敗/.test(late.sub),
        `${what}: 理由を知らないのに「読み込めませんでした」と断定している`);
      yes(!late.hint, `${what}: 理由を知らないのに接続のせいにしている`);
      yes(!/が無い|ありません|存在しません/.test(late.sub), `${what}: 「無い」と言い切っている`);

      // ---- 落ちたのを観測したとき ----
      const bad1 = f(G(false, true, FAIL), isLatest, isMeiji, "最新の空中写真", true);
      yes(!!bad1.kick, `${what}: 落ちたのに何も名乗っていない`);
      yes(/読み込めませんでした/.test(bad1.sub), `${what}: 落ちたのに、そう書いていない`);
      yes(bad1.sub.includes("通信できません"), `${what}: 観測した理由を落としている`);
      // ⚠ つながっているときは**言い切らない**。取れない理由をこちらは知らない
      yes(bad1.hint === "接続を確認してください",
        `${what}: online=true なのに「${bad1.hint}」と言っている（言い切らない）`);
      const off = f(G(false, true, FAIL), isLatest, isMeiji, "最新の空中写真", false);
      yes(/接続していません/.test(off.hint ?? ""),
        `${what}: 圏外だと端末が言っているのに、そう伝えていない`);
      // ⚠ 落ちても「無い」とは言わない（掟の一行目）
      yes(!/写真が無い|存在しません/.test(bad1.sub + (bad1.hint ?? "")), `${what}: 落ちたことを「無い」と書いている`);
    }
    // 3 つは別の文。どれが出ていないのか分かること
    const subs = new Set(["現在", "過去", "明治期"].map((_, i) =>
      f(G(false, true, null), i === 0, i === 2, "x", true).sub));
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
{
  const m = /\nfunction tilesCover\(keys,xf,yf,z0\)\{[\s\S]*?\n\}/.exec(src["peel3d.js"] ?? "");
  if (!m) bad("peel3d.js の tilesCover を取り出せない（この検査が何も見ていない）");
  else {
    const f = new Function(`${m[0]}\nreturn tilesCover;`)();
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

// ---------- 7. 外部から来た文字列を HTML として実行させない ----------
head("7. 外部から来た文字列");
// 実際に踏んだ（2026-08-15）。配信物は一切変えず、応答だけ差し替えて広島を開くと、
// ev タイル1枚のラベル `<img src=x onerror="...">` が一覧で 8 回・寄せた先（#fx）で 2 回、
// 合計 10 回発火した。Wikidata のラベルは誰でも編集できる CC0 の第三者データで、
// 地理院の住所検索の応答も、OSM のタグ（種別・建設年）も、こちらが中身を保証できない。
//
// ⚠ ここで見られることには限りがある。
//   `const l=x.label` のように一度変数へ写してから埋める形は、この検査を素通りする。
//   静的に外部由来を追い切ることはできないので、**「漏れが無いことを確かめた」とは言わない**。
//   実際の担保は scripts/render.mjs の4件（応答を差し替えて発火 0 を見る）。
//   ここが見るのは「外部の応答が最初に入る受け皿を、HTML の中に生で書いていないか」だけ。
{
  // ---- JS を舐めて、テンプレート文字列と その ${…} を拾う ----
  // ⚠ 文字列・コメント・正規表現リテラルを飛ばす。飛ばさないと `/"/g` の " から先を
  //   文字列と読んで、テンプレートの範囲がずれる（試作で実際にずれた）。
  const REGEX_OK = /[(,=:[!&|?{};+\-*%~^<>]$/;
  function templates(src) {
    const out = [];
    const skipStr = (k) => {
      const q = src[k]; k++;
      while (k < src.length) {
        if (src[k] === "\\") { k += 2; continue; }
        if (src[k] === q) return k;
        k++;
      }
      return k;
    };
    const skipRe = (k) => {                       // k は "/" の位置
      let j = k + 1, cls = false;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        else if (src[j] === "\n") return k;       // 改行まで閉じなければ、割り算だった
        else if (src[j] === "/" && !cls) return j;
        j++;
      }
      return k;
    };
    function scanTemplate(start) {                // src[start] === "`"
      let j = start + 1;
      const holes = [];
      while (j < src.length) {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "`") return { start, end: j, holes };
        if (c === "$" && src[j + 1] === "{") {
          const end = scanHole(j + 2);
          holes.push({ at: j + 2, text: src.slice(j + 2, end) });
          j = end + 1; continue;
        }
        j++;
      }
      return { start, end: src.length - 1, holes };
    }
    function scanHole(k) {                        // ${ の中身の終わり（対応する }）を返す
      let depth = 1, prev = "{";
      while (k < src.length) {
        const c = src[k];
        if (c === "`") { k = scanTemplate(k).end + 1; prev = "s"; continue; }
        if (c === '"' || c === "'") { k = skipStr(k) + 1; prev = "s"; continue; }
        if (c === "/" && REGEX_OK.test(prev)) { const e = skipRe(k); if (e > k) { k = e + 1; prev = "s"; continue; } }
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (!depth) return k; }
        if (!/\s/.test(c)) prev = c;
        k++;
      }
      return k;
    }
    let i = 0, prev = "";
    while (i < src.length) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 2; continue; }
      if (c === '"' || c === "'") { i = skipStr(i) + 1; prev = "s"; continue; }
      if (c === "`") { const t = scanTemplate(i); out.push(t); i = t.end + 1; prev = "s"; continue; }
      if (c === "/" && REGEX_OK.test(prev)) { const e = skipRe(i); if (e > i) { i = e + 1; prev = "s"; continue; } }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return out;
  }

  // ---- 外部の応答が最初に入る受け皿 ----
  // ⚠ ここに無い名前は見ていない。新しい外部データを描くときは、受け皿をここに足す。
  const DOORS = {
    "index.html": {
      x:  "Wikidata の事物（名前・説明・出典URL）",
      it: "一覧の行（地理院の地名と、利用者が打った語が入る）",
      r:  "保存した記録（地名と、利用者のメモ）",
    },
    "peel3d.js": {
      p: "建物の属性（OSM の種別・建設年）",
      x: "地名検索の候補（地理院の応答）",
    },
  };
  const TAG = /<[a-zA-Z/!]/;                       // このテンプレートは HTML を組み立てている
  // esc( / escUrl( の引数の中にいるか
  const escSpans = (t) => {
    const out = [];
    for (const m of t.matchAll(/\besc(?:Url)?\(/g)) {
      let k = m.index + m[0].length, depth = 1;
      while (k < t.length && depth > 0) {
        if (t[k] === "(") depth++;
        else if (t[k] === ")") depth--;
        k++;
      }
      out.push([m.index + m[0].length, k]);
    }
    return out;
  };

  for (const [file, doors] of Object.entries(DOORS)) {
    if (!src[file]) { bad(`${file} が読めない（外部由来の検査が何も見ていない）`); continue; }
    const blocks = file.endsWith(".html")
      ? [...src[file].matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
      : [src[file]];
    const raws = [], names = Object.keys(doors);
    const re = new RegExp(`(^|[^\\w$.])(${names.join("|")})\\.`, "g");
    let holes = 0;
    for (const code of blocks) {
      for (const t of templates(code)) {
        if (!TAG.test(code.slice(t.start, t.end + 1))) continue;   // HTML でないものは対象外
        for (const h of t.holes) {
          holes++;
          const spans = escSpans(h.text);
          for (const m of h.text.matchAll(re)) {
            const at = m.index + m[1].length;
            if (spans.some(([s, e]) => at >= s && at < e)) continue;
            raws.push(`${file}:${code.slice(0, h.at + at).split("\n").length} ${m[2]}.…（${doors[m[2]]}）`);
          }
        }
      }
    }
    // ⚠ 0 件で緑にしない。走査が壊れて何も見つけられなくなったとき、
    //   「esc() を通っている」と報告するのがいちばん危ない。
    if (!holes)
      bad(`${file}: HTML を組み立てている場所が1つも見つからない（この検査が何も見ていない）`);
    else raws.length
      ? bad(`外部から来た文字列が、esc() を通らずに HTML に入っている: ${raws.join(" / ")}`)
      : ok(`${file}: HTML を組み立てる ${holes} 箇所で、外部の受け皿（${names.join(" / ")}）は esc() を通っている`);
  }

  // esc() は1か所にしかない（掟: 同じ問いに答える実装を2つ持たない）。
  // ⚠ 読み込み忘れは「起動時に丸ごと落ちる」形で出る。ページごとに見る。
  for (const f of ["index.html", "peel.html"])
    src[f]?.includes(`src="./esc.js"`) ? ok(`${f} → esc.js`) : bad(`${f}: esc.js を読み込んでいない`);
  {
    // ⚠ 手で書いた部分的なエスケープを増やさない。
    //   peel3d.js は `replace(/"/g,"&quot;")` を持っていて、" だけを直し `<` は素通ししていた。
    //   同じ問いに答える実装が2つあると、片方だけが直る（掟: 同じ問いに答える実装を2つ持たない）。
    const hand = [...htmlFiles, ...jsFiles]
      .filter((f) => f !== "esc.js" && /replace\([^)]{0,40}&(?:[a-z]+|\#\d+);/.test(src[f]));
    hand.length
      ? bad(`手書きのエスケープが残っている: ${hand.join(", ")}（esc.js の esc() に寄せること）`)
      : ok("エスケープの実装は esc.js の1か所だけ");
  }

  // ⚠ 外部の相手が増えたら、この節を見直させる。
  //   応答の文字列を描く相手が増えたのに、エスケープを通さずに足すのが、実際に踏んだ型だった。
  const HOSTS = [
    "cyberjapandata.gsi.go.jp",   // タイル（画素だけ。文字列は描かない）
    "msearch.gsi.go.jp",          // 住所検索（地名を描く → esc）
    "query.wikidata.org",         // 事物（名前・説明を描く → esc）
    "overpass-api.de", "overpass.kumi.systems",   // OSM（種別・建設年を描く → esc）
    // ↓ こちらから開くだけの相手（応答を描かない）
    "maps.gsi.go.jp", "www.gsi.go.jp", "disaportal.gsi.go.jp",
    "www.wikidata.org", "www.openstreetmap.org", "www.google.com",
    "docs.google.com", "github.com", "konjaku.hidetzu.work",
  ];
  {
    const seen = new Set();
    for (const f of [...htmlFiles, ...jsFiles])
      for (const m of src[f].matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) seen.add(m[1]);
    const extra = [...seen].filter((h) => !HOSTS.includes(h));
    extra.length
      ? bad(`公開物に、表に無い外部の相手が増えている: ${extra.join(", ")}`
          + `（応答の文字列を描くなら esc() を通したうえで、上の表に足すこと）`)
      : ok(`公開物が名指ししている外部の相手は ${seen.size} 件（表のとおり）`);
  }
}

// ⚠ GitHub Actions は **SHA で固定する**。タグは動かせるので、`@v4` のままだと
//   タグの指す先が変わった時点で、こちらの差分なしに中身が入れ替わる。
//   public にすると fork からの PR も走りうるので、ここは締めておく。
//   ⚠ Playwright も同じ。メジャーだけ書くと 1.x の最新に動くので、
//     ある日ブラウザの挙動が変わって検査が落ちる（原因が自分の変更に見える）。
head("8. CI の固定");
{
  const wf = await readFile(join(ROOT, ".github/workflows/check.yml"), "utf8").catch(() => "");
  if (!wf) bad(".github/workflows/check.yml が読めない");
  else {
    const uses = [...wf.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]);
    if (!uses.length) bad("workflow に uses が1つも無い（この検査が何も見ていない）");
    const loose = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u));
    loose.length
      ? bad(`Action が SHA で固定されていない: ${loose.join("、")}（タグは動かせる）`)
      : ok(`Action は全部 SHA で固定されている（${uses.length} 箇所）`);

    // ⚠ 版の出どころは workflow の env 1か所だけ。入れる版とキャッシュのキーの両方が
    //   これを見る。**別々に書くと「別の版のブラウザを、この版のキーで拾う」がいつか起きる。**
    const pin = /PLAYWRIGHT_VERSION:\s*"?(\d+\.\d+\.\d+)"?/.exec(wf)?.[1];
    if (!pin) bad("workflow に PLAYWRIGHT_VERSION が x.y.z で定義されていない");
    else {
      // 版を書いている箇所が、env の参照以外に無いこと（出どころを2つ持たない）
      const direct = [...wf.matchAll(/playwright@(?!\$\{\{)([^\s]+)/g)].map((m) => m[1]);
      direct.length
        ? bad(`Playwright の版を env 以外にも書いている: ${direct.join("、")}`
            + `（出どころは PLAYWRIGHT_VERSION だけにする）`)
        : ok(`Playwright の版は1か所で固定されている（${pin}）`);

      // ⚠ **手順書は、その 1 か所を見られない。** 人が読んで手で打つものなので、
      //   版を書き写すしかない。掟「やむを得ず2つ持つときは、機械で突き合わせる」。
      //   ⚠ ここがずれると**手元では通るのに CI で落ちる／その逆**が起きる。
      //   ⚠ Dependabot は Playwright を上げないので、**手で上げたときにだけずれる**。
      //     つまり、ずれるのは決まって人が急いでいるときになる。
      const guide = await readFile(join(ROOT, "CONTRIBUTING.md"), "utf8").catch(() => "");
      const inGuide = [...guide.matchAll(/playwright@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
      if (!inGuide.length) bad("CONTRIBUTING.md に playwright の版が書かれていない（手順が版なしになっている）");
      else {
        const off = [...new Set(inGuide)].filter((v) => v !== pin);
        off.length
          ? bad(`CONTRIBUTING.md の Playwright が CI と違う: 手順 ${off.join("、")} / CI ${pin}`
              + `（手元と CI で別の版になる）`)
          : ok(`CONTRIBUTING.md の Playwright が CI と揃っている（${pin}・${inGuide.length} 箇所）`);
      }
    }
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

  const seen = {};
  for (const f of [...htmlFiles, ...jsFiles])
    seen[f] = f.endsWith(".html") ? stripHtml(src[f], f) : stripJs(src[f], f);

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
    { word: "この土地から", kind: "分類", live: 1, next: "済",
      files: ["words.js"], seat: "words.js の TAG.why。⚠ **これは行き先そのもの**なので残す" },
    { word: "境目", kind: "分類", live: 4, next: "済",
      files: ["verify.js"],
      seat: "⚠ **2026-08-20 に 5 → 4。**取得方法バッジからは消えた（`近くで分かれている` に）。"
          + "⚠ **残る 4 件は語ではなく文**（「区分の境目にあたる可能性がある」など）。"
          + "⚠ **作り手側の分類ではなく、土地そのものの説明**なので残す" },
    { word: "データ・判定について", kind: "分類", live: 1, next: "済",
      files: ["index.html"],
      seat: "フッターの畳み見出し。⚠ **2026-08-20 に「データについて」から。**"
          + "中身は判定方法・位置誤差・提供範囲・限界まで説明していて、見出しと合っていなかった" },
    { word: "この範囲で、年が記録されているもの", kind: "分類", live: 1, next: "済",
      files: ["index.html"],
      seat: "フッターの出典欄。⚠ **2026-08-20 に「この範囲にできていたもの」から。**"
          + "⚠ **開業／設立／完成のどれかを区別できない**ので、「できていた」と言い切らない" },
    // ⚠ **2026-08-20 に言い直した**（#9c）。⚠ **「変化が無かった」と読ませない。**
    //   こちらが持っている記録の話であって、現実に何も起きなかったという意味ではない。
    { word: "この期間に表示できる変化の記録は見つかっていません", kind: "状態", live: 1, next: "済",
      files: ["index.html"], seat: "正常0件。Wikidata は読めている" },
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
    const bare = stripJs(await readFile(join(ROOT, "scripts", "render.mjs"), "utf8"), "render.mjs");
    const copied = [...new Set(OWNED_BY_WORDS.filter((w) => bare.includes(`"${w}"`)))];
    copied.length
      ? bad(`render.mjs が words.js の字を書き写している: ${copied.map((w) => `「${w}」`).join("、")}`
          + `（言い直すと、製品ではなく検査が落ちる。WORDS から取ること）`)
      : ok(`render.mjs は words.js の字（${OWNED_BY_WORDS.length} 語）を書き写していない`);
  }

  // ⚠ **画面から消した語が、戻っていないこと。**
  //   ⚠ 上の表は**いま画面にある語**しか見ない。⚠ **消した語は行ごと落ちるので、
  //     戻ってきても気づけない。**ここが、その穴を塞ぐ。
  //   ⚠ **消すたびにここへ足す。**⚠ 足し忘れると、静かに戻せてしまう。
  //   ⚠ 実際に踏んだ（2026-08-20）: バッジを消したあと、わざと戻しても検査は緑だった。
  {
    const GONE_WORDS = [
      // 2026-08-20（#9c）
      ["外部↗", "一覧行のタグ。`別のサイト↗` にした"],
      ["記録のある変化はありません", "`この期間に表示できる変化の記録は見つかっていません` にした"],
      // 2026-08-20（#9d）
      ["自前・根拠あり", "根拠パネルのバッジ。⚠ **中身が全部この土地の根拠で、何も分けていなかった**"],
      ["ベクトル直読み", "取得方法バッジ。`読んだ値` にした"],
      ["直読み", "同上"],
      ["データについて", "フッターの見出し。`データ・判定について` にした"],
      ["この範囲にできていたもの", "フッターの出典欄。`この範囲で、年が記録されているもの` にした"],
    ];
    const back = [];
    for (const [w, why] of GONE_WORDS)
      for (const f of Object.keys(seen))
        if ((seen[f] ?? "").includes(w)) back.push(`${f}「${w}」（${why}）`);
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

  // ⚠ **検査の件数が、本当に数字になっているか。**
  //   実測（2026-08-18）: SPEC の「静的 **N件**」が **`****`** になったまま main へ出た。
  //   置換に使ったシェル変数が空に展開されて、数字が消えていた。
  //   ⚠ **文書は誰も実行しないので、壊れても誰も気づかない。**（一度出した）
  // ⚠ 中身の正しさ（本当に N 件か）はここでは見ない。**空と 0 だけ**を見る。
  //   ⚠ 最初は「（静的 …）」の形だけを見ていて、`--group=core`（**0件**…）を
  //     取りこぼした（あちらは名前が括弧の**外**にある）。名前の場所で分けない。
  {
    const spec = await readFile(join(ROOT, "docs", "SPEC.md"), "utf8").catch(() => "");
    const holes = [];
    if (!spec) holes.push("docs/SPEC.md を読めない");
    else {
      if (/\*\*\s*\*\*/.test(spec)) holes.push(`空の強調が ${[...spec.matchAll(/\*\*\s*\*\*/g)].length} 箇所`);
      // 検査の件数を名乗っている所を、名前の位置に関係なく拾う
      const LABELS = ["静的", "実描画", "--group=core", "--group=search"];
      for (const line of spec.split("\n")) {
        for (const lab of LABELS) {
          if (!line.includes(lab)) continue;
          // その名前の**後ろ**にある最初の「**N件**」を見る
          const after = line.slice(line.indexOf(lab) + lab.length);
          const m = /\*\*(\d+)件\*\*/.exec(after);
          if (!m) { if (/件/.test(after)) holes.push(`${lab}: 件数が **N件** の形で書かれていない`); continue; }
          if (Number(m[1]) === 0) holes.push(`${lab}: 0件`);
        }
      }
      // ⚠ 4 つとも名乗っていること（行ごと消えても気づけるように）
      for (const lab of LABELS)
        if (!new RegExp(`${lab.replace(/[-]/g, "\\-")}[^\\n]*\\*\\*\\d+件\\*\\*`).test(spec))
          holes.push(`${lab} の件数が書かれていない`);
    }
    holes.length
      ? bad(`docs/SPEC.md の検査の件数が壊れている: ${[...new Set(holes)].join("、")}`
          + `（置換に失敗しても、文書は誰も実行しないので気づけない）`)
      : ok(`docs/SPEC.md の検査の件数は、4 つとも数字で書かれている`);
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
    const m = /const TAG\s*=\s*\{([^}]*)\}/.exec(seen["words.js"] ?? "");
    if (!m) bad("words.js の TAG を読めない（一覧行のタグの棚卸しが何も見ていない）");
    else {
      const got = [...m[1].matchAll(/:\s*"([^"]*)"/g)].map((x) => x[1]);
      const want = ["今昔で見る", "この土地から", "別のサイト↗"];
      got.join("／") === want.join("／")
        ? ok(`一覧行のタグは棚卸しのとおり（${got.join("・")}）`)
        : bad(`一覧行のタグが棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
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
    const raw = (src["index.html"] ?? "");
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

// ⚠ **SPEC の「静的 N件」が、本当に N 件か。**
//   上の検査は「空・0・書き方」だけを見ていて、**中身のずれは見ていなかった**。
//   実測（2026-08-19）: 検査を 1 件足したのに SPEC は 148 のままで、**緑のまま main へ出た**。
//   ⚠ 文書は誰も実行しないので、ずれても誰も気づかない（掟: 実装 → 検査 → … → SPEC）。
// ⚠ **この検査自身も 1 件に数える。**数えないと、足すたびに 1 ずれる。
// ⚠ どれかが落ちていると ✓ が減るので、ここも一緒に落ちる。
//   **落ちた側を直すのが先**で、SPEC の数字を合わせにいく話ではない。
// ⚠ **外へ出る指定（--links / --links-new）のときは数えない。**
//   その指定でしか走らない検査があるぶん、必ず多くなる。
//   実測（2026-08-19）: 手元も CI の 1 回目も 151 件だったが、CI は同じジョブで
//   `--links-new` をもう一度回しており、そちらが **153 件**で落ちた。
//   ⚠ **黙って飛ばさない。**数えなかったことを、その場で名乗る。
{
  const spec = await readFile(join(ROOT, "docs", "SPEC.md"), "utf8").catch(() => "");
  const m = /静的[^\n]*?\*\*(\d+)件\*\*/.exec(spec);
  const mine = passed + 1;
  const how = CHECK_LINKS ? "--links" : NEW_LINKS !== null ? "--links-new" : null;
  if (how) ok(`docs/SPEC.md の件数とは突き合わせていない（${how} 付きは、その指定でしか`
    + `走らない検査があるぶん多くなる。素の \`node scripts/check.mjs\` が見る）`);
  else if (!m) bad("docs/SPEC.md に「静的 **N件**」が無い（この検査が何も見ていない）");
  else if (Number(m[1]) !== mine)
    bad(`docs/SPEC.md の静的検査が ${m[1]}件 と名乗っているが、実際は ${mine}件`
      + `（検査を足したら SPEC も直す。⚠ 実描画の件数は render.mjs 側が見る）`);
  else ok(`docs/SPEC.md の「静的 ${mine}件」は、実際に数えた ✓ の数と合っている`);
}

console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`); process.exit(1); }
console.log(`\x1b[32m問題なし\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`);
