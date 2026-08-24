// 静的検査 — 安全（⚠ **外へ何を出しているか。⚠ 外から来たものをどう扱うか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 2 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **なぜこの 4 節をひとまとめにしたか**:
//   ⚠ **どれも「外との境目」を守っている。**
//
//     Referer の抑止        ⚠ 調べた場所が、⚠ 外のサイトへ漏れないこと
//     計測の貯め先          ⚠ 何を貯めているか
//     計測の受け口（/t）    ⚠ 何を受け取るか（⚠ **実際に呼んで確かめる**）
//     外から来た文字列      ⚠ 外の文字列が HTML として実行されないこと（`esc()`）
//
// ⚠ **元の節番号は 1.5 / 1.6 / 1.7 / 7 とバラバラだった。**
//   ⚠ **番号は「いつ足したか」しか表していなかった**
//     （⚠ `check.mjs` は 22 節あり、⚠ `6` のあとに `2.7 2.8 2.6` が来る）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PUB, ok, bad, head, htmlFiles, jsFiles, src , BLOCK_COMMENT } from "./lib.mjs";


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
      // ⚠ **`//` は、⚠ `https://` を巻き込まない形で落とす**（2026-08-24）。
      //   ⚠ **いまは worker.js の URL がコメント行の中なので実害は無い**（⚠ 実測: 差 0 文字）。
      //   ⚠ **URL を 1 行足された瞬間に、⚠ その行の残りが検査の目から消える。**
      .replace(BLOCK_COMMENT, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
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
    // ⚠ **トップの HTML 組み立ては `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`peel3d.js` と対になる。**⚠ 2 画面とも、⚠ 組み立てているのは JS のファイル。
    "top.js": {
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
