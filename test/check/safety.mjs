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
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, PUB, ok, bad, head, htmlFiles, jsFiles, src , BLOCK_COMMENT, LINE_COMMENT } from "./lib.mjs";


// ⚠ URL に地名と座標を載せているので、Referer で外へ出さないこと。
//   実測で /t への referer に ?q=豊洲&ll=35.65,139.79 が乗っていた。
//   画面に「地名も座標も送らない」と書いている以上、ここが外れたらその記述が嘘になる。
head("1.5 Referer の抑止");
{
  const hdr = await readFile(join(PUB, "_headers"), "utf8").catch(() => "");
  // ⚠ **外へ 1 本も送らない方針であること**（2026-09-01 に字を 1 つに固定するのをやめた）。
  //   ⚠ **`no-referrer` と `same-origin` は、⚠ どちらも外へ送らない。**
  //   ⚠ **`same-origin` は、⚠ 同じサイトの中では残る**（⚠ `/deep` の「ひとつ前へ」に要る）。
  //   ⚠ **これ以外は許さない**（⚠ `origin` も `strict-origin` も、⚠ 外へ出す）。
  const 外へ出さない = ["no-referrer", "same-origin"];
  const 方針 = /Referrer-Policy:\s*([\w-]+)/.exec(hdr)?.[1] ?? "";
  外へ出さない.includes(方針)
    ? ok(`_headers に Referrer-Policy: ${方針}（⚠ 外へは 1 本も送らない）`)
    : bad(`_headers の Referrer-Policy が「${方針 || "無い"}」`
        + `（⚠ 外へ送らないのは ${外へ出さない.join(" / ")} だけ）`);
  for (const f of htmlFiles) {
    const m = /<meta\s+name="referrer"\s+content="([\w-]+)">/.exec(src[f])?.[1] ?? "";
    !m
      ? bad(`${f}: meta referrer が無い（URL の地名・座標が Referer で漏れる）`)
      : !外へ出さない.includes(m)
        ? bad(`${f}: meta referrer が「${m}」（⚠ 外へ送らないのは ${外へ出さない.join(" / ")} だけ）`)
        : m !== 方針
          ? bad(`${f}: meta referrer「${m}」が _headers「${方針}」と違う（⚠ 2 か所で割れている）`)
          : ok(`${f} に meta referrer（${m}）`);
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
  // ⚠ **計測の表は 2026-09-06 に作り直した**（`docs/adr/0102`）。
  //   ⚠ **`0001_tick.sql` は残す**（⚠ β のデータが入っている）。⚠ **書く側が無いだけ。**
  existsSync(join(ROOT, "migrations", "0003_events.sql"))
    ? ok("計測の表（migrations/0003_events.sql）がある")
    : bad("migrations/0003_events.sql が無い（⚠ 計測が貯まらない）");
}

// ⚠ ここまで worker.js は **構文しか見ていなかった**。
//   `npm run render` は `/t` を page.route で横取りするので、本物の Worker を
//   一度も通っていない（ブラウザが何を送るかは見ているが、受け側は見ていない）。
//   つまり「何を数えるか」の判定は、**どの検査からも実行されていなかった**。
//   読む前に落とす処理を入れたので、ここで実際に呼ぶ。
head("1.7 計測の受け口（/api/events を実際に呼ぶ）");
// ⚠ **ここまで `worker.js` は構文しか見ていなかった。**
//   ⚠ **実描画は計測の口を横取りするので、⚠ 本物の Worker を一度も通らない。**
//   ⚠ **つまり「何を数えるか」の判定は、⚠ どの検査からも実行されていなかった**（2026-08-15）。
//
// ⚠ **2026-09-06 に、⚠ 口を `/t` から `/api/events` へ作り直した**（`docs/adr/0102`）。
//   ⚠ **主張は同じ**（⚠ 列挙の外は数えない・⚠ 読む前に落とす・⚠ よそから数えない）。
//   ⚠ **足したのは 2 つ**: ⚠ **座標を送りつけても入らないこと**と、
//     ⚠ **画面側と受け側の一覧がずれていないこと。**
{
  const mod = await import(join(ROOT, "worker.js")).catch((e) => { bad(`worker.js を読めない: ${e.message}`); return null; });
  const EV = await import(join(ROOT, "events.js")).catch(() => null);
  if (!EV) bad("events.js を読めない（⚠ この検査が何も見ていない）");
  if (mod?.default?.fetch && EV) {
    const ORIGIN = "https://konjaku.hidetzu.work";
    // ⚠ **D1 の代わり。**⚠ **書き込もうとした中身をそのまま溜める。**
    const writes = [];
    const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { writes.push({ sql, a }); } }) }) } };
    const post = async (body, opt = {}) => {
      writes.length = 0;
      const headers = { Origin: opt.origin ?? ORIGIN };
      if (!opt.noLength) headers["Content-Length"] = String(opt.len ?? new TextEncoder().encode(body).length);
      const method = opt.method ?? "POST";
      const req = new Request(`${ORIGIN}/api/events`,
        method === "GET" || method === "HEAD" ? { method, headers } : { method, body, headers });
      const res = await mod.default.fetch(req, env);
      return { status: res.status, wrote: writes.length, 行: writes[0]?.a ?? null };
    };
    const 本文 = (o) => JSON.stringify({ referrer: "direct", ...o });

    // ⚠ **① 画面側と受け側の一覧が、⚠ 同じであること。**
    //   ⚠ **ずれると、⚠ 画面が送っているのに 1 件も入らない**（⚠ β で実際に踏んだ形）。
    {
      const 画面 = (await readFile(join(ROOT, "public", "measure.js"), "utf8"))
        .replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
      const setOf = (name) => new Set([...(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`)
        .exec(画面)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));
      const 組 = [["EVENTS", EV.EVENTS], ["SOURCES", EV.SOURCES], ["ENTRIES", EV.ENTRIES],
        ["PAGES", EV.PAGES], ["BORDERS", EV.BORDERS]];
      const ずれ = [];
      for (const [名, 受] of 組) {
        const 送 = setOf(名);
        if (!送.size) { ずれ.push(`${名}: measure.js から取り出せない`); continue; }
        const 片 = [...送].filter((x) => !受.has(x)).concat([...受].filter((x) => !送.has(x)));
        if (片.length) ずれ.push(`${名}: ${片.join("、")}`);
      }
      ずれ.length
        ? bad(`画面と受け側で、⚠ 一覧がずれている: ${ずれ.join(" ／ ")}`)
        : ok(`画面（measure.js）と受け側（events.js）の一覧が同じ（⚠ ${組.map(([n, v]) => `${n} ${v.size}`).join(" / ")}）`);
    }

    // ⚠ **② 列挙にある本文が、⚠ 全部数えられること。**
    {
      const miss = [];
      for (const e of EV.EVENTS) {
        const r = await post(本文({ event_type: e, session_id: "0123456789abcdef", metadata: { page: "map" } }));
        if (r.wrote !== 1) miss.push(e);
      }
      miss.length ? bad(`/api/events が数えていないイベントがある: ${miss.join("、")}`)
                  : ok(`/api/events が ${EV.EVENTS.size} 種すべてを数える`);
    }

    // ⚠ **③ 座標を送りつけても、⚠ 1 つも入らないこと**（⚠ ここが「案A」の本体）。
    {
      const r = await post(本文({ event_type: "map_opened", latitude: 35.6553, longitude: 139.7967,
        prefecture: "東京都", user_agent: "Mozilla/5.0" }));
      const 入った = JSON.stringify(r.行 ?? []);
      r.wrote === 1 && !/35\.6553|139\.7967|東京都|Mozilla/.test(入った)
        ? ok("座標・都道府県・user-agent を送りつけても、⚠ 表に入らない")
        : bad(`送りつけたものが表に入っている: ${入った}`);
    }

    // ⚠ **④ 生の流入元は入らない**（⚠ 列挙の名前だけ）
    {
      const r = await post(本文({ event_type: "page_load", referrer: "https://example.com/secret" }));
      r.wrote === 0 ? ok("列挙に無い流入元は数えない（⚠ 生の URL は入らない）")
                    : bad("生の流入元を数えてしまう");
    }

    // ⚠ **⑤ 大きい本文を、⚠ 読まずに落とすこと**（⚠ ここが本体）。
    //   ⚠ **「書き込みが 0 だった」では、⚠ この主張を検証できない**（⚠ 読み切ってから捨てても 0）。
    //   ⚠ **見るのは `req.text()` が呼ばれたかどうか。**
    {
      const big = JSON.stringify({ event_type: "page_load", referrer: "direct", pad: "A".repeat(100_000) });
      const real = new Request(`${ORIGIN}/api/events`, { method: "POST", body: big,
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

    // ⚠ **⑥ 上限が、⚠ 実際に送る本文より短くないこと**（⚠ 短いと静かに数えなくなる）。
    {
      // ⚠ **`metadata` は `page` か `border` のどちらか一方。**⚠ **長いほうで数える**
      //   （2026-09-30。⚠ **判定は日本語なので、⚠ `足元が無い` 15 バイト > `privacy` 7 バイト**。
      //    ⚠ **`page` だけで数えていた頃は、⚠ 上限を 8 バイト低く見積もっていた**）。
      // ⚠ **バイトで選ぶ**（⚠ 文字数ではない。⚠ 日本語は 1 文字 3 バイト）。
      const バイト = (x) => new TextEncoder().encode(x).length;
      const 長い = (S) => [...S].reduce((a, b) => (バイト(a) >= バイト(b) ? a : b));
      const 作る = (metadata) => JSON.stringify({
        event_type: 長い(EV.EVENTS),
        session_id: "0".repeat(36), referrer: 長い(EV.SOURCES),
        entry_point: 長い(EV.ENTRIES),
        metadata,
      });
      const 最長 = [{ page: 長い(EV.PAGES) }, { border: 長い(EV.BORDERS) }]
        .map(作る).reduce((a, b) => (バイト(a) >= バイト(b) ? a : b));
      const 長さ = バイト(最長);
      長さ <= EV.MAX_BODY
        ? ok(`いちばん長い本文は ${長さ} バイト（⚠ 上限 ${EV.MAX_BODY}）`)
        : bad(`上限（${EV.MAX_BODY}）より長い本文を送る形になっている（${長さ} バイト）`);
      const r = await post(最長);
      r.wrote === 1 ? ok("いちばん長い本文も数える") : bad("いちばん長い本文が数えられない");
    }

    // ⚠ **境目の判定を、⚠ 5 通りとも数えること**（2026-09-30。hidetzu/konjaku#481）。
    //   ⚠ **出せたときだけ数えると、⚠ 分母が作れない**（⚠ 「何回中の何回か」が言えない）。
    //   ⚠ **`読めなかった` を落とすと、⚠ 分母が縮んで「出せた割合」が高く見える**（`CLAUDE.md` §1）。
    {
      const 欠け = [];
      for (const b of EV.BORDERS) {
        const r = await post(本文({ event_type: "border_judged",
          session_id: "0123456789abcdef", metadata: { border: b } }));
        if (r.wrote !== 1) { 欠け.push(`${b} が入らない`); continue; }
        // ⚠ **入った字が、⚠ 送った字と同じであること**（⚠ 入ったことだけを見ない）。
        const 入った = JSON.parse(r.行?.[5] ?? "null");   // ⚠ bind の 6 番目が metadata
        if (入った?.border !== b) 欠け.push(`${b} が ${JSON.stringify(入った)} として入った`);
      }
      欠け.length ? bad(`境目の判定: ${欠け.join(" ／ ")}`)
                  : ok(`境目の判定を ${EV.BORDERS.size} 通りとも数える（⚠ 出せなかった分も）`);
    }

    // ⚠ **`page` と `border` を、⚠ 同時に入れないこと。**
    //   ⚠ **混ざると、⚠ 「どの画面が開かれたか」に判定が数え込まれる**
    //     （⚠ `docs/adr/0104` で踏んだのと同じ形）。⚠ **画面側でも弾いているが、⚠ ここでも弾く。**
    {
      const r = await post(本文({ event_type: "border_judged", session_id: "0123456789abcdef",
        metadata: { page: "deep", border: "ok" } }));
      r.wrote === 0 ? ok("page と border が同時に来た本文は、⚠ 数えない")
                    : bad(`page と border が同時に入った（${r.行?.[5]}）`);
    }

    // ⚠ **列挙の外の判定は、⚠ 入らないこと**（⚠ 外から好きなラベルを増やせない）。
    {
      const r = await post(本文({ event_type: "border_judged", session_id: "0123456789abcdef",
        metadata: { border: "でたらめ" } }));
      r.wrote === 1 && r.行?.[5] === null
        ? ok("列挙の外の判定は、⚠ metadata に入らない（⚠ 行は残るが、⚠ 判定は空）")
        : r.wrote === 0 ? ok("列挙の外の判定は、⚠ 数えない")
        : bad(`列挙の外の判定が入った（${r.行?.[5]}）`);
    }

    // ⚠ **⑦ 既にある約束**（⚠ Content-Length・Origin・メソッド・列挙外）
    const r3 = await post(本文({ event_type: "page_load" }), { noLength: true });
    r3.wrote === 0 ? ok("Content-Length が無い本文は落ちる")
                   : bad("Content-Length が無くても数えてしまう（ヘッダを付けなければ素通り）");
    const r4 = await post(本文({ event_type: "page_load" }), { origin: "https://evil.example.com" });
    const r5 = await post(本文({ event_type: "page_load" }), { method: "GET" });
    const r6 = await post(本文({ event_type: "nope" }));
    r4.wrote === 0 && r4.status === 204 ? ok("よそのオリジンからは数えない（204）") : bad("よそのオリジンから数えてしまう");
    r5.status === 405 ? ok("POST 以外は 405") : bad(`POST 以外が ${r5.status}`);
    r6.wrote === 0 ? ok("列挙に無い本文は数えない") : bad("列挙に無い本文を数えてしまう");
  } else if (mod) bad("worker.js が default.fetch を出していない");
}

// ---------- 1.8 計測を読む口（npm run stats） ----------
head("1.8 計測を読む口（npm run stats）");
// ⚠ **ダッシュボードは作らないと決めた**（2026-09-06。Owner 判断。`docs/adr/0102`）。
//   ⚠ **本番の Worker に読み出しの口を足すと、⚠ 攻撃面と Runtime 依存が増える。**
//   ⚠ **かわりに、⚠ 手元から wrangler を叩く 1 本だけを持つ。**
//
// ⚠ **ここが見るのは 3 つ。**⚠ **叩いた結果は見ない**（⚠ 認証が要るし、⚠ 本番の DB を検査が触らない）。
{
  const 欠け = [];
  const P = join(ROOT, "scripts", "stats.mjs");
  if (!existsSync(P)) 欠け.push("scripts/stats.mjs が無い");
  else {
    // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ 説明の字を拾う。**
    const src = (await readFile(P, "utf8")).replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    // ⚠ **① `npm run stats` で呼べること**
    if (pkg.scripts?.stats !== "node scripts/stats.mjs")
      欠け.push(`package.json の stats が違う: ${JSON.stringify(pkg.scripts?.stats)}`);

    // ⚠ **② 書き込まないこと**（⚠ 読む口が、⚠ 黙って表を変えない）
    for (const 語 of ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"])
      if (new RegExp(`\\b${語}\\b`).test(src)) 欠け.push(`stats.mjs が ${語} を持っている（⚠ 読むだけの口）`);

    // ⚠ **③ 測っていないものを出さないこと**（`CLAUDE.md` §1）。
    //   ⚠ **訪問の印は 1 日で消えるので、⚠ リピーター率は出せない。**
    //   ⚠ **「出していないもの」を、⚠ 出力そのものが名乗ること。**
    if (/リピーター率/.test(src) && !/出していないもの/.test(src))
      欠け.push("リピーター率に触れているのに、⚠ 出せないことを名乗っていない");
    if (!/リピーター率/.test(src))
      欠け.push("⚠ 出せないもの（リピーター率）を、⚠ どこにも書いていない");

    // ⚠ **④ git に数字を残さないこと**（⚠ 既定の書き出し先を持たない）
    if (/writeFileSync\([^)]*(docs|public|test)\//.test(src))
      欠け.push("stats.mjs が、⚠ 追跡される場所へ書き出している");
  }
    // ⚠ **⑤ 表の幅が、⚠ 見た目で揃うこと**（2026-09-06。⚠ 実際にずれた）。
    //   ⚠ **字数で数えると、⚠ 日本語の見出しだけ短く見積もる。**
    //   ⚠ **目でしか分からない不具合なので、⚠ 数で固定する。**
    //   ⚠ **`import` しても本体が走らないこと**も、⚠ ここで一緒に確かめる
    //     （⚠ 走ると、⚠ 検査が本番の DB を叩きに行く。⚠ 実際に踏んだ）。
    // ⚠ **`import` しても本体が走らないこと。**
    //   ⚠ **走ると、⚠ 検査が本番の D1 を叩きに行く**（`.claude/rules/testing.md`
    //     「演習が、世界を変えてはいけない」）。⚠ **実際に踏んだ**（2026-09-06）。
    //   ⚠ **「読めた」では見えない。**⚠ **走ったかどうかを見る**（⚠ 何か出力したか）。
    //   ⚠ **一度この主張を持たずに壊して、⚠ 素通りさせた。**⚠ **落ちなかったので足した。**
    const 出た = [];
    const 元 = console.log;
    console.log = (...a) => { 出た.push(a.join(" ")); };
    const M = await import(P).catch((e) => { 欠け.push(`stats.mjs を読めない: ${e.message}`); return null; });
    console.log = 元;
    if (出た.length)
      欠け.push(`import しただけで本体が走った（⚠ ${出た.length} 行出した。⚠ 本番の D1 を叩きに行く）`);
    if (M && !M.__test) 欠け.push("stats.mjs が __test を出していない（⚠ 幅を確かめられない）");
    else if (M) {
      const { 見た目の幅, 表にする } = M.__test;
      if (見た目の幅("出来事") !== 6) 欠け.push(`日本語を 2 幅で数えていない: 出来事 → ${見た目の幅("出来事")}`);
      if (見た目の幅("page_load") !== 9) 欠け.push(`半角を 1 幅で数えていない: page_load → ${見た目の幅("page_load")}`);
      // ⚠ **見出しと罫線と中身の 3 行が、⚠ 同じ見た目の幅であること**
      // ⚠ **末尾の余白は落とさない。**⚠ **落とすと、⚠ 最後の列だけ短く見える**
      //   （⚠ 見出し `n` が 1 幅・中身 `14` が 2 幅。⚠ 見た目はずれていない）。
      //   ⚠ **一度そう書いて、⚠ この検査が嘘の不具合を報告した**（2026-09-06）。
      const 行 = 表にする([{ 日: "2026-09-06", 出来事: "page_load", n: 14 }]).split("\n");
      const 幅たち = [...new Set(行.map(見た目の幅))];
      if (行.length !== 3) 欠け.push(`表が 3 行になっていない（${行.length} 行）`);
      else if (幅たち.length !== 1) 欠け.push(`表の幅が揃っていない: ${行.map(見た目の幅).join(" / ")}`);
      if (!/（0 件）/.test(表にする([]))) 欠け.push("0 件のときに、⚠ そう言っていない");

      // ⚠ **⑥ 読めなかったときに、⚠ 理由が出ること**（2026-09-08。⚠ 実際に踏んだ）。
      //   ⚠ **`e.message` は `Command failed: … --command <SQL 全文>` で始まる。**
      //   ⚠ **前から切ると、⚠ SQL が字数を食い、⚠ 理由が押し出される。**
      //   ⚠ **「読めなかった」とだけ出ると、⚠ こちらの不具合か相手の都合かを分けられない**
      //     （`CLAUDE.md` §9。⚠ **落ちた ≠ 狙った理由で落ちた**）。
      const 理由 = M.__test.読めなかった理由;
      if (typeof 理由 !== "function") 欠け.push("stats.mjs が 読めなかった理由 を出していない");
      else {
        const 長いSQL = "SELECT " + "created_at AS 日, ".repeat(30) + "1";
        const 頭 = `Command failed: npx --yes wrangler d1 execute konjaku --remote --json --command ${長いSQL}`;
        const 出 = 理由(Object.assign(new Error(頭), { stderr: "✘ [ERROR] Authentication error [code: 10000]" }));
        if (!/Authentication error/.test(出))
          欠け.push(`読めなかった理由に、⚠ 相手が言ったことが出ていない: 「${出.slice(0, 60)}」`);
        if (/created_at AS 日, created_at AS 日/.test(出))
          欠け.push(`読めなかった理由が、⚠ SQL で埋まっている: 「${出.slice(0, 60)}」`);
        // ⚠ **理由そのものが返っていないときに、⚠ 黙らないこと**
        //   （⚠ 空だと、⚠ 落ちていないように読める）。
        const 素 = 理由(new Error(頭));
        if (!素.trim()) 欠け.push("理由が返っていないときに、⚠ 何も言っていない");
        else if (!/理由が返っていない/.test(素))
          欠け.push(`理由が無いことを、⚠ そう名乗っていない: 「${素.slice(0, 60)}」`);

        // ⚠ **相手が黙っていても、⚠ 走らせた側の印は残る**（2026-09-14。⚠ 実際に踏んだ。⚠ 2 回目）。
        //   ⚠ **6 本のうち 1 本目だけ落ち、⚠ `stderr` が空で、⚠ 「理由が返っていない」とだけ出た。**
        //   ⚠ **同じ SQL を直に叩くと通った。**⚠ **返っていなかったのではなく、⚠ 見ていない場所に在った**
        //     （`CLAUDE.md` §1）。⚠ **終了コードが分かれば、⚠ こちらの不具合か走らせ方かを分けられる。**
        {
          const 印 = 理由(Object.assign(new Error(頭), { status: 1, stderr: "", stdout: "" }));
          if (!/終了コード=1/.test(印))
            欠け.push(`相手が黙っているとき、⚠ 終了コードを出していない: 「${印.slice(0, 60)}」`);
          if (/created_at AS 日|SELECT /.test(印))
            欠け.push(`相手が黙っているとき、⚠ SQL を出している: 「${印.slice(0, 60)}」`);
        }
        // ⚠ **1 回だけやり直すこと**（2026-10-10。⚠ **5 回続けて 1 本目が落ちた**）。
        //   ⚠ **黙ってやり直さない。**⚠ **名乗らないと、⚠ どれくらい起きているか分からなくなる。**
        //   ⚠ **何度も叩かない**（⚠ 相手が落ちているときに迷惑をかける）。
        //   ⚠ **字面ではなく、⚠ 実際に走らせて回数を数える。**
        {
          const 走り = [];
          const 作る = (落ちる回数) => {
            let n = 0;
            return () => { n++; 走り.push(n);
              if (n <= 落ちる回数) { const e = new Error("Command failed: npx"); e.status = 1; throw e; }
              return ["ok"]; };
          };
          // ⚠ **`打つ` と同じ形を、⚠ ここで組み立て直さない。**⚠ **本体から借りる。**
          const 打つ = M.__test.打つを作る?.(作る(1), () => "code=1");
          if (typeof 打つ !== "function") 欠け.push("stats.mjs が 打つを作る を出していない（⚠ やり直しを確かめられない）");
          else {
            走り.length = 0;
            // ⚠ **投げてきたら、⚠ それ自体が「やり直していない」**（⚠ 検査ごと止めない）。
            //   ⚠ **try で受けないと、⚠ 節が丸ごと落ちて、⚠ 素通りに見える**（`CLAUDE.md` §9）。
            let r = null, 投げた = null;
            try { r = 打つ("SELECT 1", "1. 日ごとの本数"); } catch (e) { 投げた = String(e?.message ?? e).slice(0, 60); }
            if (投げた) 欠け.push(`1 回落ちただけで投げている（⚠ やり直していない）: ${投げた}`);
            else if (JSON.stringify(r) !== JSON.stringify(["ok"])) 欠け.push(`やり直しても通っていない: ${JSON.stringify(r)}`);
            if (!投げた && 走り.length !== 2) 欠け.push(`叩いた回数が ${走り.length}（⚠ 2 のはず。⚠ 1 回だけやり直す）`);
          }
          // ⚠ **2 回とも落ちたら、⚠ 投げること**（⚠ 握りつぶさない）
          const 打つ2 = M.__test.打つを作る?.(作る(9), () => "code=1");
          if (typeof 打つ2 === "function") {
            走り.length = 0;
            let 投げた = false;
            try { 打つ2("SELECT 1", "x"); } catch { 投げた = true; }
            if (!投げた) 欠け.push("2 回とも落ちたのに、⚠ 投げていない（⚠ 読めなかったと言えない）");
            if (走り.length > 2) 欠け.push(`落ち続けているのに ${走り.length} 回叩いた（⚠ 2 回まで）`);
          }
        }

        // ⚠ **wrangler は、⚠ `stdout` に字を返すことがある**（⚠ JSON とは限らない）。
        {
          const 出 = 理由(Object.assign(new Error(頭), { stdout: "Error: D1_ERROR: no such table" }));
          if (!/no such table/.test(出))
            欠け.push(`stdout に返った理由を見ていない: 「${出.slice(0, 60)}」`);
        }

        // ⚠ **⑦ 本当に、⚠ 出すところで使っていること。**
        //   ⚠ **上の 3 つは「関数がどう答えるか」しか見ていない。**
        //   ⚠ **実際に確かめた（2026-09-08）: ⚠ 関数を残したまま呼び出し側を元へ戻したら、
        //     ⚠ 上の 3 つは緑のままだった。**⚠ **切り出しただけでは、⚠ 何も直っていない。**
        // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ **落とさないと、⚠ 説明の字を拾う**）。
        const コード = (await readFile(P, "utf8")).replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
        const 使った = (コード.match(/読めなかった理由\s*\(/g) ?? []).length;
        if (使った < 1) 欠け.push("読めなかった理由 を、⚠ 定義しただけで、⚠ 出すところで使っていない");
        if (/String\(\s*e\.message\s*\)\s*\.slice|e\.message\s*\)\s*\.slice\(\s*0/.test(コード))
          欠け.push("エラーの本文を、⚠ 前から切っている（⚠ コマンド行に理由が押し出される）");
      }
    }

  欠け.length
    ? bad(`計測を読む口が決めたとおりでない: ${欠け.join(" ／ ")}`)
    : ok("計測を読む口は npm run stats の 1 本"
        + "（⚠ 読むだけ・⚠ 出せないものを名乗る・⚠ git に数字を残さない・⚠ 表の幅が揃う）");
}

// ---------- 1.9 計測の集計が、⚠ 訪問の入口で結ぶこと ----------
head("1.9 計測の集計（訪問の入口）");
// ⚠ **これは実際に踏んだ**（2026-09-08。`docs/adr/0103`）。
//
// ⚠ **流入元は画面ごとに読み込み時 1 回決まり、⚠ サイト内リンクは `?from=` を運ばない。**
//   ⚠ **`about?from=app-village` → 地図 → 深掘り は `app-village / konjaku / konjaku` になる。**
//   ⚠ **行のまま `referrer` で束ねると、⚠ `app-village` は「訪問 1・調べた 0・深掘り 0」に見える。**
//   ⚠ **「app-village から来た人は誰も地図を使っていない」と読める**（`CLAUDE.md` §1）。
//
// ⚠ **字面では見えない**（⚠ `session_id` を含む SQL かどうかを見ても、⚠ 意味は分からない）。
//   ⚠ **だから、⚠ 実物のスキーマと実物の SQL を、⚠ 実際に走らせて答えを見る。**
//   ⚠ **本番の D1 は触らない**（⚠ 手元の `:memory:`。`.claude/rules/testing.md`「演習が、世界を変えてはいけない」）。
//
// ⚠ **子プロセスで走らせる。**⚠ **`node:sqlite` は Node 22 ではフラグ越しだから**
//   （⚠ CI は Node 22・⚠ 手元は 25。⚠ **「手元に入っているものを、⚠ CI にもあると思わない」**）。
{
  const 日 = new Date().toISOString().slice(0, 10);   // ⚠ 表と同じく UTC の日
  const P = join(ROOT, "scripts", "stats.mjs");
  const 道のり = [
    // ⚠ **1 人が about（app-village）→ 地図 → 深掘り と進んだ形。**⚠ **2 行目から konjaku になる。**
    [日, "app-village", "s1", "page_load", null, JSON.stringify({ page: "about" })],
    [日, "konjaku", "s1", "page_load", null, JSON.stringify({ page: "map" })],
    [日, "konjaku", "s1", "map_opened", "default", null],
    [日, "konjaku", "s1", "page_load", "link", JSON.stringify({ page: "deep" })],
    // ⚠ **2026-09-08 より前の形**（`docs/adr/0104`）。⚠ **既にある行を読めなくしない。**
    [日, "tsukutta.app", "s3", "page_load", null, JSON.stringify({ page: "about" })],
    [日, "konjaku", "s3", "deep_accessed", "link", JSON.stringify({ page: "deep" })],
    // ⚠ **もう 1 人は直接来て、地図まで**（⚠ 入口が混ざらないことを見る）
    [日, "direct", "s2", "page_load", null, JSON.stringify({ page: "map" })],
    [日, "direct", "s2", "map_opened", "here", null],
    // ⚠ **印を置けなかった 1 本**（⚠ 訪問として結べない。⚠ 黙って消えないこと）
    [日, "app-village", null, "page_load", null, JSON.stringify({ page: "about" })],
  ];

  const コード = `
    const { DatabaseSync } = require("node:sqlite");
    const { readFileSync } = require("node:fs");
    (async () => {
      const [statsURL, schemaPath, 行] = process.argv.slice(-3);
      process.argv = [process.argv[0]];   // 読み込んだだけで本体が走らないように（本番の D1 を叩きに行く）
      const { __test } = await import(statsURL);
      const d = new DatabaseSync(":memory:");
      d.exec(readFileSync(schemaPath, "utf8"));
      const ins = d.prepare("INSERT INTO events_simple"
        + " (created_at, referrer, session_id, event_type, entry_point, metadata)"
        + " VALUES (?, ?, ?, ?, ?, ?)");
      for (const r of JSON.parse(行)) ins.run(...r);
      const 出 = [];
      for (const q of __test.問い) 出.push({ 見出し: q.見出し, 行: d.prepare(q.sql.replace(/\\s+/g, " ")).all() });
      process.stdout.write(JSON.stringify(出));
    })().catch((e) => { process.stderr.write(String((e && e.stack) || e)); process.exit(1); });
  `;
  const 引数 = [P.startsWith("/") ? "file://" + P : P, join(ROOT, "migrations", "0003_events.sql"), JSON.stringify(道のり)];
  const 走る = (flags) => spawnSync(process.execPath, [...flags, "-e", コード, ...引数],
    { encoding: "utf8", maxBuffer: 1 << 24 });
  let r = 走る(["--experimental-sqlite"]);
  // ⚠ **フラグが要らない版では、⚠ 未知の option として弾かれることがある。**⚠ **そのときは無しで。**
  if (r.status !== 0 && /bad option|not allowed|Error: unknown/i.test(String(r.stderr))) r = 走る([]);

  if (r.status !== 0) {
    // ⚠ **落ちた理由を、⚠ 主張の失敗にすり替えない**（`CLAUDE.md` §9）。⚠ **そのまま出す。**
    bad(`集計の SQL を走らせられなかった: ${String(r.stderr).slice(0, 300)}`);
  } else {
    const 出 = JSON.parse(r.stdout);
    const 引く = (番) => 出.find((x) => x.見出し.startsWith(番 + "."))?.行 ?? null;

    // ⚠ **① 道のりが、⚠ 入口（app-village）のまま数えられること**
    const 進み = 引く(3);
    const av = 進み?.find((x) => x.流入元 === "app-village");
    if (!進み) bad("問い 3（どこまで進んだか）が見つからない");
    else if (!av) bad(`app-village の行が出ていない: ${JSON.stringify(進み)}`);
    else if (av.訪問 === 1 && av.調べた === 1 && av.深掘り === 1)
      ok("about?from=app-village から地図・深掘りへ進んだ 1 訪問が、⚠ app-village のまま数えられる");
    else bad(`入口で結べていない（app-village: 訪問 ${av.訪問} / 調べた ${av.調べた} / 深掘り ${av.深掘り}）`
      + "（⚠ 2 行目から konjaku に化けた分が、⚠ 別の流入元として割れている）");

    // ⚠ **② 途中で化けた `konjaku` が、⚠ 別の訪問として立たないこと**
    //   ⚠ **①だけだと、⚠ 「両方に数える」形でも通ってしまう**（⚠ 訪問が二重になる）。
    const kon = 進み?.find((x) => x.流入元 === "konjaku");
    kon ? bad(`サイト内から来た行が、⚠ 別の訪問として立っている（konjaku: 訪問 ${kon.訪問}）`)
        : ok("サイト内で開いた 2 行目以降は、⚠ 別の流入元として立たない（⚠ 訪問が二重にならない）");

    // ⚠ **③ 直接来た人が、⚠ app-village に混ざらないこと**（⚠ 全部を 1 つの入口へ寄せていない）
    const dir = 進み?.find((x) => x.流入元 === "direct");
    dir && dir.訪問 === 1 && dir.調べた === 1 && dir.深掘り === 0
      ? ok("直接来た訪問は direct のまま（⚠ 入口が混ざらない）")
      : bad(`direct の行がおかしい: ${JSON.stringify(dir ?? null)}`);

    // ⚠ **④ 印を置けなかった行が、⚠ 黙って消えないこと**（`CLAUDE.md` §1）。
    //   ⚠ **結べないものを 0 として出すと、⚠ 全体がその分だけ小さく見える。**
    const 印なし = 引く(6);
    印なし?.length === 1 && 印なし[0].本数 === 1
      ? ok("印を置けなかった行は、⚠ 訪問の表から外し、⚠ 本数として別に名乗る")
      : bad(`印の無い行を名乗っていない: ${JSON.stringify(印なし)}`);

    // ⚠ **⑤ 画面の名が、⚠ どの記録から来たか分かること**（2026-09-08。⚠ 実際に踏んだ）。
    //   ⚠ **「page_load の metadata から」と説明していたが、⚠ SQL は `event_type` で絞っていなかった。**
    //   ⚠ **説明で補わず、⚠ 表に出す**（`CLAUDE.md` §1。⚠ **どこから来た数字かを偽らない**）。
    //   ⚠ **いまは `/deep` も `page_load`。**⚠ **前の形（`deep_accessed`）の行も残っている**
    //     （`docs/adr/0104`）。⚠ **どちらの行も、⚠ 出どころを名乗ること。**
    {
      const 画面 = 引く(5);
      const deep = (画面 ?? []).filter((x) => x.画面 === "deep");
      const 出どころ = new Set(deep.map((x) => x.出来事));
      if (!画面) bad("問い 5（どの画面が開かれたか）が見つからない");
      else if (!deep.length) bad(`deep の行が出ていない: ${JSON.stringify(画面)}`);
      else if (deep.some((x) => !("出来事" in x)))
        bad("画面の名が、⚠ どの記録から来たかを名乗っていない（⚠ 出来事の列が無い）");
      else if (!出どころ.has("page_load") || !出どころ.has("deep_accessed"))
        bad(`deep の出どころが割れて見えない: ${[...出どころ].join(" / ")}`
          + "（⚠ いまの page_load と、⚠ 前の deep_accessed の両方が出るはず）");
      else ok(`画面の名は、⚠ どの記録から来たかを名乗る（⚠ deep は ${[...出どころ].sort().join(" と ")}）`);
    }

    // ⚠ **⑥ 前の形（`deep_accessed`）でも、⚠ 深掘りとして数えること**（`docs/adr/0104`）。
    //   ⚠ **片方だけにすると、⚠ 2026-09-08 を境に深掘りが 0 になる。**
    //   ⚠ **起きたことが消える**（`CLAUDE.md` §1）。
    {
      const 進み2 = 引く(3);
      const 旧 = 進み2?.find((x) => x.流入元 === "tsukutta.app");
      旧 && 旧.深掘り === 1
        ? ok("前の形（deep_accessed）の行も、⚠ 深掘りとして数える")
        : bad(`前の形の深掘りを数えていない: ${JSON.stringify(旧 ?? null)}`);
    }

    // ⚠ **⑦ 日ごとの本数は、⚠ 印の有無に関わらず全部数えること**（⚠ 結べない行も、⚠ 起きたことは起きた）
    const 本数 = 引く(1);
    const 合計 = (本数 ?? []).reduce((n, x) => n + x.n, 0);
    合計 === 道のり.length
      ? ok(`日ごとの本数は、⚠ 印の無い行も含めて全部数える（${合計} 本）`)
      : bad(`日ごとの本数が合わない: ${合計} ／ 入れたのは ${道のり.length}`);

    // ⚠ **⑧ 幅で既定が変わる操作を、⚠ 訪問の段に並べないこと**（2026-09-11。`docs/adr/0105`）。
    //   ⚠ **`.fold` は広い画面だと最初から開いている**ので、⚠ **押す行為が起きない。**
    //   ⚠ **`detail_view` は押したときだけ飛ぶ**（`public/top.js`）。⚠ **1 本も飛ばない。**
    //   ⚠ **訪問を分母にして他の段と並べると、⚠ 「読まれなかった」に読める**（`CLAUDE.md` §1）。
    //   ⚠ **見るのは実際に返った列**（⚠ 字面ではない。⚠ コメントに書いた語を拾わないため）。
    //   ⚠ **CSS が幅で既定を変えなくなったら、⚠ 根拠のほうが消える。**⚠ **そのときは落ちる。**
    {
      const css = (await readFile(join(PUB, "top.css"), "utf8")).replace(BLOCK_COMMENT, " ");
      const 幅で既定が変わる = css.split("\n").map((x) => x.trim()).some((l) =>
        /^@media/.test(l) && /min-width/.test(l) && /\.fold::before/.test(l) && /content\s*:/.test(l));
      const 段 = Object.keys(引く(3)?.[0] ?? {});
      if (!幅で既定が変わる)
        bad("top.css が、⚠ 幅で .fold の既定を変えていない"
          + "（⚠ `docs/adr/0105` は、⚠ そうなっていることを根拠に くわしく を段から降ろした。⚠ 根拠ごと見直す）");
      else if (!段.length) bad("問い 3 が 1 行も返していない（⚠ 段を確かめられない）");
      else if (段.includes("くわしく"))
        bad(`⚠ くわしく が訪問の段に並んでいる: ${段.join(" / ")}`
          + "（⚠ 広い画面では detail_view が 1 本も飛ばない。⚠ 押されなかったのではない）");
      else ok(`幅で既定が変わる操作は、⚠ 訪問の段に並べない（⚠ いまの段: ${段.join(" / ")}）`);
    }
  }
}

// ---------- 1.9 成長と健康を判定する口（npm run gate） ----------
head("1.9 成長と健康を判定する口（npm run gate）");
// ⚠ **`stats` と責務が違う**（2026-10-10。`docs/adr/0112`）。
//   ⚠ **あちらは「何が起きたか」。**⚠ **ここは「何が言えるか」。**
// ⚠ **分母が足りなければ「まだ言えない」と言うこと**（`CLAUDE.md` §1）。
//   ⚠ **実際に踏んだ**: ⚠ 直近 14 日だけを見て「共有ループが回っていない」と繰り返したが、
//     ⚠ **全期間では 1 件の共有から 2.3 人が開いていた。**
// ⚠ **叩く側は呼ばない**（⚠ 本番の DB を検査が触らない。`stats` と同じ）。
{
  const 欠け = [];
  const P = join(ROOT, "scripts", "gate.mjs");
  if (!existsSync(P)) 欠け.push("scripts/gate.mjs が無い");
  else {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    if (pkg.scripts?.gate !== "node scripts/gate.mjs")
      欠け.push(`package.json の gate が "${pkg.scripts?.gate}"`);
    const src = await readFile(P, "utf8");
    // ⚠ **書き込む口を持たないこと**（⚠ 読むだけ）
    for (const 語 of ["INSERT", "UPDATE", "DELETE", "DROP", "--local"])
      if (new RegExp(`\\b${語}\\b`).test(src.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1")))
        欠け.push(`gate.mjs が ${語} を持っている（⚠ 読むだけの口）`);
    // ⚠ **叩き方を stats から借りていること**（⚠ 同じ問いに答える実装を 2 つ持たない）
    if (!/打つを作る/.test(src)) 欠け.push("gate.mjs が、⚠ stats の 打つを作る を使っていない（⚠ やり直しが効かない）");

    const M = await import(P).catch((e) => { 欠け.push(`gate.mjs を読めない: ${e.message}`); return null; });
    const G = M?.__gate;
    if (!G) 欠け.push("gate.mjs が __gate を出していない（⚠ この検査が何も見ていない）");
    else {
      // ⚠ **分母が足りないときは「まだ言えない」**（⚠ ここが本体）
      const 少ない = G.判定する({ 訪問: 3, 調べた訪問: 2, 判定: 5, 深掘り訪問: 1, 共有: 0, 保存: 0 });
      if (少ない.some((x) => x.判定 !== "まだ言えない"))
        欠け.push(`分母が足りないのに読んでいる: ${少ない.filter((x) => x.判定 !== "まだ言えない").map((x) => x.名).join("、")}`);
      // ⚠ **足りていれば読める**
      const 多い = G.判定する({ 訪問: 79, 調べた訪問: 59, 判定: 455, 深掘り訪問: 14, 共有: 10, 保存: 3 });
      if (多い.some((x) => x.判定 !== "読める"))
        欠け.push(`分母が足りているのに読めていない: ${多い.filter((x) => x.判定 !== "読める").map((x) => x.名).join("、")}`);
      // ⚠ **`docs/adr/0010` の 100 を踏襲していること**（⚠ 勝手に緩めない）
      if (G.最小の分母?.判定 !== 100) 欠け.push(`判定の最小の分母が ${G.最小の分母?.判定}（⚠ docs/adr/0010 は 100）`);
      // ⚠ **成長の線を持っていること**
      if (typeof G.止まっている線 !== "number") 欠け.push("成長の線（止まっている線）を持っていない");
      // ⚠ **成長の判定にも、⚠ 最小の分子が在ること**（2026-10-10 に足した）。
      //
      // ⚠ **実際に踏んだ**: ⚠ **直近 14 日の外からの訪問が 1 件のとき、
      //   ⚠ 1 ÷ 14 = 0.07 を線（0.5）と比べて「⚠ 止まっている」と断じ、
      //   ⚠ そこから「⚠ 流入を増やす手だけを採る」という唯一の行動指示を出していた。**
      // ⚠ **健康側には最小の分母があるのに、⚠ 成長側には無かった。**
      //   ⚠ **`docs/adr/0010` が「小さい分母で次の判断を決めない」と書いている。**
      // ⚠ **見るのは、⚠ 分子を動かしたときに判定が変わる形**（⚠ 字の有無だけでは見えない）。
      if (typeof G.成長を判定する !== "function")
        欠け.push("gate.mjs が 成長を判定する を出していない（⚠ 成長の判定を外から試せない）");
      else {
        const 試す = (直近の件数) =>
          G.成長を判定する({ 外からの訪問: 33, 経過日数: 34, 直近の件数, 直近の日数: 14 });
        // ⚠ **線の件数は、⚠ 線から出していること**（⚠ 書き写した定数だと、⚠ 線を変えてもずれる）
        const 線の件数 = Math.ceil(G.止まっている線 * 14);
        if (試す(0).線の件数 !== 線の件数)
          欠け.push(`成長の最小の分子が線から出ていない（線 ${G.止まっている線} × 14 = ${線の件数} ／ 出たのは ${試す(0).線の件数}）`);
        if (線の件数 < 2)
          欠け.push(`成長の最小の分子が ${線の件数} 件（⚠ 1 件で向きを決めることになる）`);
        // ⚠ **0 件は観測なので言える**
        if (!/1 件も無い/.test(試す(0).判定))
          欠け.push(`外から 0 件のときに、⚠ そう言っていない: ${試す(0).判定}`);
        // ⚠ **ここが本体。**⚠ **線に届かない分子で、⚠ 向きを断じないこと**
        for (const n of [1, 線の件数 - 1]) {
          const t = 試す(n);
          if (t.判定 === "動いている")
            欠け.push(`外から ${n} 件（線 ${線の件数} 件の下）なのに「動いている」と言っている`);
          if (/止まって/.test(t.判定))
            欠け.push(`外から ${n} 件で「⚠ 止まっている」と断じている（⚠ 小さい分子で向きを決めない）: ${t.判定}`);
          if (!/読めない/.test(t.判定))
            欠け.push(`外から ${n} 件なのに、⚠ 読めないと言っていない: ${t.判定}`);
          if (t.読むのに足りない !== 線の件数 - n)
            欠け.push(`あと何件かが合わない（${n} 件 → あと ${t.読むのに足りない} ／ 正は ${線の件数 - n}）`);
        }
        // ⚠ **届いたら動いていると言うこと**（⚠ でないと、⚠ 何件でも読めないになる）
        if (試す(線の件数).判定 !== "動いている")
          欠け.push(`線（${線の件数} 件）に届いたのに「動いている」と言わない: ${試す(線の件数).判定}`);
        if (試す(線の件数).読むのに足りない !== 0)
          欠け.push("線に届いたのに、⚠ まだ足りないと言っている");
      }
      // ⚠ **1 日あたりの分母が「経過した日数」であること**（2026-10-10 に直した）。
      //   ⚠ **記録がある日だけを分母にすると、⚠ 1 日あたりが過大に出る**
      //     （⚠ 実測 2026-10-09: 33 ÷ 26 = 1.27 と出ていたが、⚠ 経過は 34 日で 0.97）。
      if (!/経過日数/.test(G.SQL ?? ""))
        欠け.push("gate.mjs の SQL が 経過日数 を取っていない（⚠ 1 日あたりの分母が、記録のある日になる）");
      // ⚠ **共有のループを、⚠ 倍率で出さないこと**（2026-10-10 に足した）。
      //
      // ⚠ **実際に踏んだ**: ⚠ **「共有された 10 件 ／ 共有リンクで開かれた 23 件（2.3 倍）」と
      //   ⚠ 出していた。**⚠ **23 は `entry_point='link'` の本数で、⚠ 開かれた数ではない。**
      //   ⚠ **`link` は「URL に場所が入っていた」だけ**（⚠ サイト内で深掘りへ進むたび付く）。
      //   ⚠ **実測（2026-10-10・全期間 80 訪問）**: ⚠ **`link` で始まった訪問は 2 件。**
      //   ⚠ **この「2.3 倍」を根拠に「共有のループは回っている」と、⚠ 実際に判断していた。**
      if (typeof G.共有を読む !== "function")
        欠け.push("gate.mjs が 共有を読む を出していない（⚠ 共有の読み方を外から試せない）");
      else {
        // ⚠ **倍率を返さないこと**（⚠ 鍵の名前で見る。⚠ 割った数を 1 つも持たない）
        const r = G.共有を読む({ 共有: 10, 場所つき_サイト内: 1, 場所つき_direct: 1, 場所つき_外から: 0 });
        const 倍 = Object.keys(r).filter((k) => /倍|率/.test(k));
        if (倍.length) 欠け.push(`共有を読む が倍率を返している（${倍.join("、")}）`);
        // ⚠ **外から 0 件で direct が在るときは、⚠ 「読めない」と言うこと**
        if (!/読めない/.test(r.判定))
          欠け.push(`外から 0 件・direct 1 件なのに、⚠ 読めないと言っていない: ${r.判定}`);
        if (/回っている|届いている/.test(r.判定))
          欠け.push(`共有のループが回っていると言っている: ${r.判定}`);
        // ⚠ **どちらも 0 件なら、⚠ 1 件も無いと言うこと**（⚠ これは観測なので言える）
        const 皆無 = G.共有を読む({ 共有: 10, 場所つき_サイト内: 5, 場所つき_direct: 0, 場所つき_外から: 0 });
        if (!/1 件も無い/.test(皆無.判定))
          欠け.push(`外から 0 件・direct 0 件のときに、⚠ そう言っていない: ${皆無.判定}`);
        // ⚠ **外から在るときは、⚠ 件数を言うこと**
        const 在る = G.共有を読む({ 共有: 10, 場所つき_サイト内: 1, 場所つき_direct: 2, 場所つき_外から: 3 });
        if (!/3 件/.test(在る.判定)) 欠け.push(`外から 3 件なのに、⚠ 件数を言っていない: ${在る.判定}`);
        // ⚠ **サイト内の移動を、⚠ 外から開かれた件数に混ぜていないこと**
        if (在る.外から開かれた !== 3 || 在る.サイト内の移動 !== 1)
          欠け.push(`サイト内の移動と、⚠ 外から開かれた件数が混ざっている（${JSON.stringify(在る)}）`);
      }
      // ⚠ **「場所つき URL で始まった訪問」は、⚠ 訪問の最初の入口で見ること。**
      //   ⚠ **行の `entry_point` をそのまま数えると、⚠ 訪問の中で何度も数える**（⚠ 23 本の正体）。
      if (!/訪問の最初の入口/.test(G.SQL ?? ""))
        欠け.push("gate.mjs の SQL が 訪問の最初の入口 で結んでいない（⚠ 行のまま数えると本数になる）");
      // ⚠ **`stats` から借りていること**（⚠ 定義を 2 つ持たない）
      if (!/入口を作る/.test(src))
        欠け.push("gate.mjs が、⚠ stats の 入口を作る を使っていない（⚠ 定義が 2 つになる）");
    }
  }
  欠け.length ? bad(欠け.join(" ／ "))
              : ok("成長と健康を、⚠ 分母と閾値に照らして判定する（⚠ 足りなければ、まだ言えないと言う）");
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
  // ⚠ **2026-09-01 に v0.1.0 の実態へ書き直した**（`docs/adr/0080`）。
  //   ⚠ **`peel3d.js` は本番から消えた。**⚠ **かわりに `saved-page.js` が受け皿を持つ。**
  //   ⚠ **`deep.js` はここに入れない。**⚠ **あれは `textContent` で組んでいる**
  //     （⚠ 碑の名・災害名・種別。⚠ HTML を組み立てていないので、⚠ esc() の対象外）。
  //     ⚠ **`innerHTML` へ移したら、⚠ ここに足すこと。**
  const DOORS = {
    "top.js": {
      nm: "地形分類の区分名（地理院の応答）",
      v:  "町名（地理院の逆ジオコーディングの応答）",
    },
    "saved-page.js": {
      r: "保存した記録（地名が入る。⚠ 別の端末から受け取ったものも通る）",
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
  // ⚠ **外から来た字を描く画面だけ**（2026-09-01。`docs/adr/0080`）。
  //   ⚠ **前は index / peel の 2 枚を名指ししていた。**⚠ **`/peel` は本番から消えた。**
  //   ⚠ **名指しをやめ、⚠ 「esc() を呼ぶ JavaScript を読む画面」から求める**
  //     （⚠ 名指しは、⚠ 画面が増えたときに黙って見落とす）。
  {
    const 要る = htmlFiles.filter((f) => {
      const js = [...src[f].matchAll(/<script[^>]+src="\.\/([\w.-]+)"/g)].map((m) => m[1]);
      return js.some((n) => n !== "esc.js" && /\besc\s*\(/.test(src[n] ?? ""));
    });
    要る.length === 0 && bad("esc() を使う画面が 1 枚も見つからない（⚠ この検査が何も見ていない）");
    for (const f of 要る)
      src[f].includes(`src="./esc.js"`)
        ? ok(`${f} → esc.js`)
        : bad(`${f}: esc() を使う JavaScript を読むのに、⚠ esc.js を読み込んでいない`);
  }
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

  // ⚠ **外から来た字を、⚠ HTML として解釈させていないか**（2026-09-02）。
  //   ⚠ **微地形区分（J-SHIS の JNAME）を画面に描く。**⚠ **`textContent` でしか描かない。**
  //   ⚠ **`esc()` を通すより強い**（⚠ そもそも解釈させない）。⚠ **崩したら落ちる。**
  {
    const t = src["deep.js"] ?? "";
    const i = t.indexOf("async function drawGround");
    const j = t.indexOf("\n  }", i);
    const 中 = i < 0 ? "" : t.slice(i, j);
    i < 0
      ? bad("drawGround が無い（⚠ この検査が何も見ていない）")
      // ⚠ **空にするだけ（`= ""`）は許す。**⚠ **止めたいのは、⚠ 字を HTML として入れること。**
      : [...中.matchAll(/\.innerHTML\s*=\s*([^;\n]+)/g)].some((m) => m[1].trim() !== '""')
        ? bad("地盤と揺れの描画が innerHTML を使っている（⚠ textContent で描くこと）")
        : ok("地盤と揺れは textContent でしか描かない（⚠ 外から来た字を HTML にしない）");
  }

  // ⚠ 外部の相手が増えたら、この節を見直させる。
  //   応答の文字列を描く相手が増えたのに、エスケープを通さずに足すのが、実際に踏んだ型だった。
  // ⚠ **2026-09-01 に v0.1.0 の実態へ合わせた**（`docs/adr/0080`）。
  //   ⚠ **消したのは、⚠ β 版だけが話していた相手**（⚠ Wikidata ／ Overpass ／ 検索エンジン）。
  //   ⚠ **足したのは `mreversegeocoder.gsi.go.jp`**（⚠ 逆ジオコーディング。⚠ 町名を描く → esc）。
  const HOSTS = [
    "cyberjapandata.gsi.go.jp",       // タイル（画素だけ。文字列は描かない）
    "msearch.gsi.go.jp",              // 住所検索（地名を描く → esc）
    "mreversegeocoder.gsi.go.jp",     // 逆ジオコーディング（町名を描く → esc）
    // ↓ こちらから開くだけの相手（応答を描かない）
    "maps.gsi.go.jp", "www.gsi.go.jp", "disaportal.gsi.go.jp",
    "github.com", "konjaku.hidetzu.work",
    // ⚠ **配信元の資料**（2026-09-02）。⚠ **プライバシーポリシーが根拠として指している。**
    //   ⚠ **こちらから開くだけ。**⚠ **応答は描かない。**
    //   ⚠ **画面に差し込まれる集計の本体は `static.cloudflareinsights.com` だが、
    //     ⚠ それは配信側が入れるもので、⚠ この repo には無い**（⚠ だから表に載らない）。
    "developers.cloudflare.com",
    // ⚠ **地盤と揺れ**（2026-09-02。`docs/adr/0088`）。⚠ **微地形区分の字を描く。**
    //   ⚠ **`textContent` でしか描かない**（⚠ `innerHTML` を使わない）。
    //   ⚠ **`esc()` を通すのではなく、⚠ そもそも HTML として解釈させない。**
    "www.j-shis.bosai.go.jp",
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

// ⚠ **外に出す文に、作業環境のことを書いていないか**（2026-08-26。`CLAUDE.md` の「8-1」）。
//
// ⚠ **このリポジトリは公開されている。**⚠ **コミット本文も PR も Issue も、⚠ 誰でも読める。**
// ⚠ 実際に踏んだ（2026-08-26）: ⚠ **AI の作業セッションの URL が、
//   ⚠ コミット本文 85 件・PR 本文 84 件・Issue 本文 3 件・コメント 14 件に入っていた**
//   （⚠ 7 セッションぶん）。⚠ **道具の既定がそう書くようになっていたため、⚠ 誰も止めなかった。**
// ⚠ **消すのに履歴の書き換えと force push が要った。**⚠ **それでも、⚠ 古い commit は
//   ⚠ SHA を知っていれば読めるまま残る**（⚠ 実測: 認証なしで status=200）。⚠ **出す前に止める。**
//
// ⚠ **見るのは 2 か所。**⚠ **片方だけでは足りない**（⚠ 消すときも 2 か所だった）:
//     追跡ファイルの中身   ⚠ `git ls-files`
//     コミット本文         ⚠ `git log`
//
// ⚠ **`CLAUDE.md` の規則そのものを拾わない。**⚠ あちらは伏せ字で書いてある。
//   ⚠ **ここが見るのは、⚠ 本物の ID が続いている形だけ**（⚠ `session_` ＋ 英数 8 文字以上）。
//   ⚠ **字として組み立てる**（⚠ そのまま書くと、⚠ この検査が自分の行を拾う。⚠ この repo で 4 回以上）。
head("外に出す文");
{
  const { execFileSync: exS } = await import("node:child_process");
  const RE = new RegExp("claude\\.ai/code/" + "session_[A-Za-z0-9]{8,}");
  const git = (args) => exS("git", args, { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

  // ---- 追跡ファイルの中身 ----
  {
    let files = [];
    try { files = git(["ls-files"]).split("\n").filter(Boolean); }
    catch { bad("git ls-files が使えない（⚠ この検査が何も見ていない）"); }
    const hit = [];
    for (const f of files) {
      let buf; try { buf = await readFile(join(ROOT, f)); } catch { continue; }
      if (buf.includes(0)) continue;                       // ⚠ バイナリは読まない
      if (RE.test(buf.toString("utf8"))) hit.push(f);
    }
    if (!files.length) bad("追跡ファイルが 1 つも無い（⚠ この検査が何も見ていない）");
    else if (hit.length)
      bad(`作業セッションの URL が、配るファイルに入っている: ${hit.join("、")}`
        + `（⚠ 公開リポジトリ。⚠ CLAUDE.md「8-1」）`);
    else ok(`追跡ファイルに作業セッションの URL は無い（${files.length} ファイルを見た）`);
  }

  // ---- コミット本文 ----
  // ⚠ **浅い clone では、⚠ 全部を見ていない。**⚠ **そのときは「無い」と言わない**
  //   （`CLAUDE.md`「いちばん上の原則」: ⚠ **確認できないことを「検査済み」と呼ばない**）。
  //   ⚠ CI の静的検査は `fetch-depth: 0` で全部取っている。
  {
    let shallow = "false";
    try { shallow = git(["rev-parse", "--is-shallow-repository"]).trim(); } catch { /* 下で出る */ }
    let msgs = null;
    try { msgs = git(["log", "--all", "--format=%B%x00"]); } catch { /* 下で出る */ }
    // ⚠ **件名だけでは足りない。**⚠ **URL は本文の末尾に付いていた**ので、⚠ 本文ごと見る
    const bodies = msgs === null ? [] : msgs.split("\0").filter((m) => m.trim());
    const leaked = bodies.filter((m) => RE.test(m)).length;
    if (msgs === null) bad("git log が使えない（⚠ コミット本文を 1 つも見ていない）");
    else if (leaked)
      bad(`作業セッションの URL が、コミット本文に残っている（${leaked} 件 / ${bodies.length} 件中）`
        + `（⚠ 消すには履歴の書き換えが要る。⚠ CLAUDE.md「8-1」）`);
    else if (shallow === "true")
      bad(`浅い clone なので、⚠ コミット本文を全部見ていない（見たのは ${bodies.length} 件だけ）`
        + `（⚠ fetch-depth: 0 で取り直す。⚠ ここで「無い」と言わない）`);
    else ok(`コミット本文に作業セッションの URL は無い（${bodies.length} 件を見た・浅い clone ではない）`);
  }
}
