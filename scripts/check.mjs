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

let failed = 0, warned = 0;
const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
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
  const holders = [...htmlFiles, ...jsFiles].filter((f) => marker.test(src[f]));
  const ALLOWED = ["verify.js", "peel3d.js"];
  const extra = holders.filter((f) => !ALLOWED.includes(f));
  extra.length
    ? bad(`判定の表を自前で持っているページが増えている: ${extra.join(", ")}`
        + `（verify.js に寄せること。分かれると片方だけ直し忘れる）`)
    : ok(`判定の表を持つのは ${holders.join(" と ")} だけ`);

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

// ---------- 3.5. 事前計算データの索引 ----------
// ここが壊れると、黙って実行時 Overpass に落ちる。本番で 504 が常態の相手なので、
// 「動いてはいるが作品が成立していない」状態になり、気づきにくい（掟: 取れなかったを「無い」と言わない）。
head("3.5. 事前計算データ（data/areas.json）");
{
  const raw = await readFile(join(PUB, "data", "areas.json"), "utf8").catch(() => null);
  if (!raw) bad("public/data/areas.json が無い。peel が全地点で Overpass に落ちる");
  else {
    const areas = JSON.parse(raw).areas ?? [];
    if (!areas.length) bad("areas.json に1件も範囲が無い");
    for (const a of areas) {
      const b = a.bbox ?? {};
      if (!["s", "w", "n", "e"].every((k) => Number.isFinite(b[k])))
        bad(`${a.id}: bbox が不正`);
      for (const key of ["buildings", "water"]) {
        if (!a[key]) continue;                        // 片方だけでもよい
        const rel = a[key].replace(/^\.\//, "");
        await readFile(join(PUB, rel))
          .then(() => ok(`${a.id}: ${rel}`))
          .catch(() => bad(`${a.id}: ${rel} が存在しない`));
      }
    }
  }
  // 索引を読む側が消えていないか（peel から data/ 参照が 0 件だった事故の再発防止）
  if (src["peel3d.js"]?.includes("areas.json")) ok("peel3d.js が索引を読んでいる");
  else bad("peel3d.js が data/areas.json を参照していない（事前計算データが死んでいる）");
}

// ---------- 4. 出典表記 ----------
head("4. 出典表記");
for (const f of htmlFiles) {
  const s = src[f];
  const gsi = s.includes("国土地理院");
  // OSM 建物を使うページだけ ODbL 表記が要る
  const usesOsm = s.includes("overpass") || s.includes("areas.json") || s.includes("-buildings");
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
      const probes = ["/data/bl/index.json", "/data/ev/index.json", "/data/areas.json",
                      "/data/landform.json", "/data/toyosu-water.geojson"];
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
  // 畳まずに見える1行は、**一字一句そろえる**（短く、両画面で同じ約束をするところ）。
  {
    const a = grab(idx, "data-privacy-lead"), b = grab(peel, "data-privacy-lead");
    if (!a) bad("index.html に畳まずに見える1行（data-privacy-lead）が無い（この検査が何も見ていない）");
    else if (!b) bad("peel.html に畳まずに見える1行（data-privacy-lead）が無い。/peel も URL に地名と座標を載せる");
    else if (a !== b) bad(`プライバシーの畳まずに見える1行が2つの画面で違う: / →「${a}」/ /peel →「${b}」`);
    else ok("プライバシーの畳まずに見える1行が2つの画面で一字一句そろっている");
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
    for (const [f, src] of [["index.html", idx], ["peel.html", peel]]) {
      const body = grab(src, "data-privacy-body");
      if (!body) { bad(`${f} に詳しい説明（data-privacy-body）が無い。/peel も URL に地名と座標を載せる`); continue; }
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
    const body = grab(src, "data-privacy-body") ?? "";
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
  const files = ["public/index.html", "public/peel.html", "public/peel3d.js",
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
  const RESULT_IDS = ["status", "result", "prov", "breakdown", "pick", "heroNum", "heroCap", "placeName"];
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
          // ③ よそのリポジトリの Issue（gsi-cyberjapan/gsimaps#29）
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
    // ⚠ トップの住所未選択で出すのは、この 10 件のうち **3 件だけ**（入力例）。
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

// 取り込み側・トップ・3D側が同じ明治期凡例と許容差を使うこと。
// 3か所に残るのはブラウザ用とNode用の実行環境が違うためで、内容は機械的に照合する。
{
  const legend = (src) => [...src.matchAll(/\{\s*rgb:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*name:\s*"([^"]+)"(,\s*water:\s*true)?\s*\}/g)]
    .map((m) => [...m.slice(1, 5), m[5] ? "water" : "land"].join("|"));
  const threshold = (src) => src.match(/Math\.sqrt\(bd\)\s*<=\s*(\d+)/)?.[1] ?? null;
  const files = ["scripts/swale-sample.mjs", "public/verify.js", "public/peel3d.js"];
  const sources = await Promise.all(files.map((f) => readFile(join(ROOT, f), "utf8")));
  const legends = sources.map(legend), thresholds = sources.map(threshold);
  const sameLegend = legends.every((x) => JSON.stringify(x) === JSON.stringify(legends[0]));
  const sameThreshold = thresholds.every((x) => x === thresholds[0]);
  !sameLegend || !sameThreshold || legends[0].length !== 14
    ? bad(`明治期凡例の照合失敗（凡例=${sameLegend ? "一致" : "不一致"} / 色数=${legends[0].length} / 閾値=${thresholds.join(",")})`)
    : ok(`明治期凡例・許容差を3実装で照合（${legends[0].length} 色 / 閾値 ${thresholds[0]})`);
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
    { word: "自前・根拠あり", kind: "分類", live: 1, next: "#9d",
      files: ["index.html"], seat: "根拠パネルの見出しのバッジ" },
    { word: "根拠あり", kind: "分類", live: 2, next: "#9c",
      files: ["index.html"], seat: "上のバッジと、一覧行のタグ（TAG_LABEL.own）" },
    { word: "この土地から", kind: "分類", live: 1, next: "#9c",
      files: ["index.html"], seat: "一覧行のタグ（TAG_LABEL.why）" },
    { word: "外部↗", kind: "分類", live: 2, next: "#9c",
      files: ["index.html"], seat: "一覧行のタグ（TAG_LABEL.ext と、その既定値）" },
    { word: "ベクトル直読み", kind: "分類", live: 1, next: "#9d",
      files: ["verify.js"], seat: "根拠カードの取得方法バッジ（地形分類）" },
    { word: "直読み", kind: "分類", live: 4, next: "#9d",
      files: ["verify.js"], seat: "取得方法バッジ。うち1件は「ベクトル直読み」の一部" },
    { word: "境目", kind: "分類", live: 5, next: "#9d",
      files: ["index.html", "verify.js"], seat: "取得方法バッジと、その説明文" },
    { word: "データについて", kind: "分類", live: 2, next: "#9d",
      files: ["index.html", "peel.html"], seat: "フッターの畳み見出し。中身は判定方法・位置誤差・提供範囲・限界" },
    { word: "この範囲にできていたもの", kind: "分類", live: 1, next: "#9d",
      files: ["index.html"], seat: "フッターの出典欄。年の意味（開業／設立／完成）を区別できない" },
    { word: "記録のある変化はありません", kind: "状態", live: 1, next: "#9c",
      files: ["index.html"], seat: "正常0件。Wikidata は読めている" },
    { word: "記録なし", kind: "状態", live: 3, next: "#9c",
      files: ["index.html", "verify.js", "share.js"], seat: "正常0件（明治期タイルは読めた）。共有カードにも出る" },
    { word: "判定できません", kind: "状態", live: 7, next: "#9c",
      files: ["index.html", "verify.js", "peel3d.js"], seat: "判定できない。「判定できませんでした」も含む" },
    { word: "未取得", kind: "状態", live: 6, next: "#9e",
      files: ["index.html", "peel3d.js"], seat: "取得方法バッジと、/peel の台帳。⚠ 2画面にある" },
  ];
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

  // ⚠ 短い語（「自分」）は本文の検索で数えられない。宣言そのものを読む。
  {
    const m = /const TAG_LABEL\s*=\s*\{([^}]*)\}/.exec(seen["index.html"] ?? "");
    if (!m) bad("index.html の TAG_LABEL を読めない（一覧行のタグの棚卸しが何も見ていない）");
    else {
      const got = [...m[1].matchAll(/:\s*"([^"]*)"/g)].map((x) => x[1]);
      const want = ["根拠あり", "自分", "この土地から", "外部↗"];
      got.join("／") === want.join("／")
        ? ok(`一覧行のタグは棚卸しのとおり（${got.join("・")}）`)
        : bad(`一覧行のタグが棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
    }
  }
  {
    const got = [...(seen["verify.js"] ?? "").matchAll(/method:\s*"([^"]*)"/g)].map((x) => x[1]);
    const want = ["直読み", "ベクトル直読み", "直読み", "直読み"];
    got.join("／") === want.join("／")
      ? ok(`根拠カードの取得方法は棚卸しのとおり（${[...new Set(got)].join("・")}／${got.length} 件）`)
      : bad(`根拠カードの取得方法が棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
  }
}

console.log(`\n${"─".repeat(52)}`);
if (failed) { console.log(`\x1b[31m${failed} 件の問題\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`); process.exit(1); }
console.log(`\x1b[32m問題なし\x1b[0m${warned ? ` / ${warned} 件の警告` : ""}`);
