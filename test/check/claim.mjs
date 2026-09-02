// 静的検査 — 名乗り（⚠ **この道具が「何をするもの」と言っているか。⚠ 実装と合っているか**）
//
// ⚠ **`test/check.mjs` の「5. OGP」「6」「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 28 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **3 つの節にまたがっていた**（⚠ 実測 2026-08-25）。⚠ **同じ問いなのに、⚠ 離れていた。**
//
// ⚠ **ここが守っているもの**:
//     看板と共有カード  ⚠ **外へ出る面のあいだで割れないこと**（⚠ `h1` ／ `og:title` ／ 共有カード）
//     実装との一致      ⚠ **やめると決めた演出を、⚠ 名乗りが約束していないか**
//                       ⚠ 実際にずれていた（⚠ `og:description`「建物が消え…」）
//     段の名乗り        ⚠ **画面 / README / SPEC で、⚠ 同じ段を名乗っているか**
//     README の限界     ⚠ **画面と同じ限界を書いているか**（⚠ 載る → 届く → 残らない）
//
// ⚠ **名乗りは共有先まで届く**（`CLAUDE.md` §6）。⚠ **ここがずれると、⚠ 共有先で嘘をつく。**
//
// ⚠ **`credit.mjs`（出典）とは別。**⚠ あちらは ⚠ **借りた相手の名前。**
//   ⚠ こちらは ⚠ **自分の名前。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, PUB, SITE, ok, bad, head, src, htmlFiles, HTML_COMMENT } from "./lib.mjs";

head("名乗り");

// ⚠ **名乗りが、⚠ 外へ出る面のあいだで割れないこと。**
//   ⚠ **2026-09-01 に相手を変えた**（`docs/adr/0080`）。
//   ⚠ **前は `share.js` が canvas に描く共有カードと突き合わせていた。**
//   ⚠ **v0.1.0 は共有カードを描かない。**⚠ **かわりに OGP の画像がその役をする。**
//
// ⚠ **突き合わせるのは 3 つ**: ⚠ 看板（`h1`）／ `<title>` ／ `og:title`。
//   ⚠ **OGP は共有先まで届く**（`CLAUDE.md` §6）。⚠ **画面より遠くへ行く。**
// ⚠ **`scripts/generate-ogp.mjs --check` も同じことを見ている**（⚠ 下の節）。
//   ⚠ **こちらは「読めなかったら落ちる」ところまでを持つ。**
{
  const idx = await readFile(join(PUB, "index.html"), "utf8");
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(idx)?.[1]?.trim();
  const title = /<title>([^<]+)<\/title>/.exec(idx)?.[1]?.trim();
  const ogt = /property="og:title" content="([^"]+)"/.exec(idx)?.[1]?.trim();
  if (!h1) bad("index.html から看板（h1）を読めない（⚠ この検査が何も見ていない）");
  else if (!title || !ogt) bad("index.html の title か og:title を読めない");
  else if (title !== ogt)
    bad(`名乗りが割れている: title「${title}」／ og:title「${ogt}」`
      + `（⚠ OGP は共有先まで届く。⚠ そこが看板の代わりになる）`);
  else if (!title.includes(h1))
    bad(`名乗りが割れている: 看板「${h1}」が title「${title}」に入っていない`);
  else ok(`看板・title・og:title の名乗りが揃っている（${h1}）`);
}

// ⚠ **`/about` は、⚠ 外からの入口**（2026-09-03。Owner 指示）。
//   ⚠ **共有カードで見えるのは、⚠ この 2 行だけ。**⚠ **中身は読まれない。**
//   ⚠ **前は「このサイトについて — 今昔」「今昔がどんな道具かを書いています」だった。**
//     ⚠ **どちらも、⚠ 何ができる道具かを言っていない。**
// ⚠ **画面の問い（`h1`）と、⚠ 共有カードの名乗りを、⚠ 割らない。**
{
  const ab = await readFile(join(PUB, "about.html"), "utf8");
  const q = /<h1[^>]*class="entry__q"[^>]*>([^<]+)<\/h1>/.exec(ab)?.[1]?.trim();
  const title = /<title>([^<]+)<\/title>/.exec(ab)?.[1]?.trim();
  const 名乗り = {
    "og:title": /property="og:title" content="([^"]+)"/.exec(ab)?.[1]?.trim(),
    "twitter:title": /name="twitter:title" content="([^"]+)"/.exec(ab)?.[1]?.trim(),
  };
  const 説明 = {
    "description": /name="description" content="([^"]+)"/.exec(ab)?.[1]?.trim(),
    "og:description": /property="og:description" content="([^"]+)"/.exec(ab)?.[1]?.trim(),
    "twitter:description": /name="twitter:description" content="([^"]+)"/.exec(ab)?.[1]?.trim(),
  };
  const 欠け = [];
  if (!q) 欠け.push("/about の問い（h1.entry__q）を読めない（⚠ この検査が何も見ていない）");
  if (!title) 欠け.push("/about の title を読めない");
  for (const [k, v] of Object.entries(名乗り)) {
    if (!v) { 欠け.push(`/about の ${k} を読めない`); continue; }
    if (v !== title) 欠け.push(`/about の名乗りが割れている: title「${title}」／ ${k}「${v}」`);
  }
  // ⚠ **画面の問いが、⚠ そのまま名乗りに出ていること**（⚠ 中身と共有カードを割らない）
  if (q && title && !title.includes(q))
    欠け.push(`/about の名乗りに、画面の問い「${q}」が入っていない: 「${title}」`);
  // ⚠ **何ができる道具かを、⚠ 説明が言っていること**（⚠ 「このサイトについて」では分からない）
  for (const [k, v] of Object.entries(説明)) {
    if (!v) { 欠け.push(`/about の ${k} を読めない`); continue; }
    if (!/地図/.test(v) || !/空中写真/.test(v))
      欠け.push(`/about の ${k} が、何から答えるかを言っていない: 「${v}」`);
    if (!/昔/.test(v)) 欠け.push(`/about の ${k} が、何を知る道具かを言っていない: 「${v}」`);
  }
  欠け.length
    ? bad(欠け.join(" ／ "))
    : ok(`/about の名乗りは、画面の問いと揃っている（${title}）`);
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
  // ⚠ **2026-09-01 に相手を変えた**（`docs/adr/0080`）。⚠ **`/peel` は本番から消えた。**
  //   ⚠ **見ているものは同じ**: ⚠ **外へ届く名乗りが、⚠ 実装とずれていないか。**
  //   ⚠ **`index.html` の頭**（⚠ title と OGP。⚠ 共有先まで届く）と、
  //   ⚠ **`/deep` へ誘う字**（⚠ そこで何ができるかを約束する）。
  for (const [file, where] of [
    ["public/index.html", /<title>[\s\S]*?<\/title>|<meta[^>]*(og:|twitter:|name="description")[^>]*>/g],
    ["public/deep.html", /<title>[\s\S]*?<\/title>|<h2>[^<]*<\/h2>/g],
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

// ── 段の名乗りが、⚠ 画面 / README / SPEC で割れていないか ──────────
// ⚠ **2026-08-23 に踏んだ。**⚠ **画面は hidetzu/konjaku#225 で β を名乗り始めたのに、
//   ⚠ README は「プロトタイプです」と言い続けていた。**
// ⚠ **README は共有先まで届く**（`CLAUDE.md` §6）。⚠ **画面より遠くへ行く。**
// ⚠ **看板と共有カードは上で突き合わせているが、⚠ README は入っていなかった。**
// ⚠ **段の名乗り（α / β / 正式版 / プロトタイプ）だけを見る。**
//   ⚠ **README の書き方までは縛らない**（⚠ 文の形は自由）。
{
  // ⚠ **2026-09-01 に「段」から「版」へ変えた**（`docs/adr/0080`）。
  //   ⚠ **前は α / β / 正式版 という段の名前を突き合わせていた。**
  //   ⚠ **v0.1.0 を本番へ上げた時点で、⚠ 段の名前は使わないと決めた**
  //     （⚠ 「作りかけ」を消したのと同じ理由。⚠ 答えの信用を下げる）。
  //   ⚠ **かわりに版の番号を突き合わせる。**⚠ **主張は同じ**:
  //     ⚠ **外へ出る 3 面が、⚠ 同じ名乗りをしていること。**
  //
  // ⚠ **画面の正本は `about.html` の 1 か所**（2026-09-01。⚠ 静的検査 ⑱ が 1 か所を守る）。
  //   ⚠ **`index.html` には版を出さない**ので、⚠ ここで求めない。
  const STAGE = ["プロトタイプ", "α 版", "α版", "β 版", "β版", "正式版"];
  const norm = (set) => new Set([...set].map((w) => w.replace(/\s*版$/, "")));
  // ⚠ **「いまの版はこれだ」と名乗っている字だけを拾う**（2026-09-01。⚠ 実際に踏んだ）。
  //   ⚠ **前は文の中のどこにあっても拾っていた。**
  //   ⚠ **「β 版の `/peel` は降ろした」という説明まで、⚠ 名乗りとして数えた。**
  //   ⚠ **もう無いものを「もう無い」と書けなくなる。**⚠ **それは記録を消すのと同じ**（`CLAUDE.md` §5）。
  //
  // ⚠ **文で切ってから見る。**⚠ **切り方を 2 回間違えた**（2026-09-01）。
  //   ⚠ **改行で切ると、⚠ 1 つの文が 2 つに割れる**
  //     （⚠ `⚠ β 版が話していた` で改行し、⚠ 次の行の「運んでいない」と離れた）。
  //   ⚠ **改行を消して繋ぐと、⚠ 見出しと箇条書きまで 1 文になる**
  //     （⚠ README の「## ドキュメント」から「言わないこと」までが 1 文になった）。
  //   ⚠ **だから、⚠ 段落で切ってから、⚠ その中で文に切る**（⚠ 空行が段落の境目）。
  //   ⚠ **打ち消しを含む文は、⚠ 名乗りではない**（⚠ 降ろした・運んでいない・やめた・使わない）。
  const 打ち消し = /降ろ|運んでいない|やめ|使わない|言わない|書かない|残っていない|消し|外し|前は|だった/;
  const stageOf = (text) => {
    const bare = text.replace(HTML_COMMENT, " ");
    const got = new Set();
    const 段落 = bare.split(/\n\s*\n/).map((b) => b.replace(/\n/g, " "));
    for (const 文 of 段落.flatMap((b) => b.split("。"))) {
      if (打ち消し.test(文)) continue;            // ⚠ 「もう無い」の説明は名乗りではない
      for (const w of STAGE) if (文.includes(w)) got.add(w);
      if (/[^A-Za-zα-ωΑ-Ω]β[^A-Za-zα-ωΑ-Ω]/.test(文)) got.add("β 版");
      for (const m of 文.matchAll(/v\d+\.\d+\.\d+/g)) got.add(m[0]);
    }
    return norm(got);
  };
  // ⚠ **3 か所とも外へ出る**（⚠ 画面は見る人へ、⚠ README と SPEC は読む人へ）。
  const faces = [
    ["画面", stageOf(await readFile(join(PUB, "about.html"), "utf8"))],
    ["README", stageOf(await readFile(join(ROOT, "README.md"), "utf8"))],
    ["SPEC", stageOf(await readFile(join(ROOT, "docs", "SPEC.md"), "utf8"))],
  ];
  // ⚠ **版の数は、⚠ いちばん新しいものだけを見る**（2026-09-03。⚠ v0.2.0 を切るときに直した）。
  //   ⚠ **前は「面ごとの集合が一致すること」を要求していた。**
  //   ⚠ **そうすると、⚠ 過去の記録を持っている面が必ず割れる**
  //     （⚠ SPEC の「2026-09-01 に v0.1.0 を本番へ上げた」「v0.1.0 の画面は 1 件も送っていない（実測）」）。
  //   ⚠ **どちらも事実で、⚠ 消すと事実が消える**（`CLAUDE.md` §1・§4）。
  //   ⚠ **見たいのは「いま何と名乗っているか」。**⚠ **古い版が並んでいること自体は、⚠ 割れではない。**
  //   ⚠ **README が v0.1.0 のまま取り残されたら、⚠ いちばん新しいものが違うので落ちる。**
  const 番号 = /^v\d+\.\d+\.\d+$/;
  const 順 = (v) => v.slice(1).split(".").map(Number);
  const 新しい方 = (a, b) => {
    const x = 順(a), y = 順(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
    return a;
  };
  const いまの名乗り = (v) => {
    const 版 = [...v].filter((w) => 番号.test(w));
    const 語 = [...v].filter((w) => !番号.test(w));
    return new Set(版.length ? [...語, 版.reduce(新しい方)] : 語);
  };
  for (const f of faces) f[1] = いまの名乗り(f[1]);

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

// ============================================================
// ⚠ OGP（外へ出る面そのもの）
// ============================================================
// ⚠ **`test/check.mjs` の「5. OGP」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 30 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「名乗り」の仲間である理由**: ⚠ **共有カードは、⚠ SNS で単独に流れる。**
//   ⚠ すぐ上の「看板と共有カードの名乗り」と、⚠ **同じ面を見ている。**
// ⚠ **元の見出し（`head("5. OGP")`）は落とした**（⚠ 中身が 2 塊だけになっていた）。
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
