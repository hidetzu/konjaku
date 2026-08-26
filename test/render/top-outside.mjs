// 実描画 — 外との境目（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 3 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **`top-escape.mjs` と対になる**（⚠ `test/check/safety.mjs` と同じ分け方）:
//     top-escape.mjs   ⚠ **外から来た文字列**を、⚠ そのまま実行しないこと
//     ここ             ⚠ **外へ何を出しているか。**⚠ **何を配っているか**
//
// ⚠ **ここが守っているもの**:
//     フッターの通信先   ⚠ **叩く先が増えたら、⚠ フッターに書く**（⚠ 人の記憶に頼らない）
//     Wikidata に出ない  ⚠ **取り込み済みの土地では、⚠ 実行時に外へ出ない**
//     配信のキャッシュ   ⚠ **手元の配信が、⚠ 本番（`_headers`）と同じ方針か**
//     2 つの索引         ⚠ **建物と事物を混ぜない**（⚠ 混ぜると「見た」が嘘になる）
//
// ⚠ **並びは動く**（⚠ 散らばった 4 件を集めた）。⚠ **件数と判定の字は変わらない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { BASE, TOYOSU, waitVerdict, waitStrip, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  // ---- フッターは、置かないと嘘になるものだけ ----
  // ⚠ 「画面が通信した先が、全部フッターに書いてある」ことを機械で見る。
  //   Wikidata を実行時に叩くようにしたとき、**フッターを直し忘れていた**。
  //   依存を足すたびに人が思い出すのでは、いつか必ず落ちる。
  {
    name: "通信した先が、全部フッターに書いてある", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForTimeout(1500);
      const foot = (await page.locator("footer").textContent()).replace(/\s+/g, " ");

      // 実際に出ていった先（自分のオリジンを除く）
      const hosts = [...new Set(reqs.map((u) => { try { return new URL(u).host; } catch { return ""; } })
        .filter((h) => h && !/127\.0\.0\.1|localhost/.test(h)))];
      const NAME = { "cyberjapandata.gsi.go.jp": "国土地理院", "maps.gsi.go.jp": "国土地理院",
        "msearch.gsi.go.jp": "国土地理院", "query.wikidata.org": "Wikidata" };
      const missing = hosts.filter((h) => {
        const n = NAME[h];
        if (!n) return true;                 // 名前を決めていない先が増えたら、まず気づく
        return !foot.includes(n);
      });
      must(missing.length === 0, `フッターに書かれていない通信先がある: ${missing.join(", ")}`);

      // ⚠ **主語のない「送りません」を書かせない。**
      //   ここは以前 `/こちらのサーバーには送りません/` を**必須にしていた**。
      //   ところがそれは事実でなかった（調べた場所は URL に載り、開けば配信元へ届く）。
      //   ⚠ **検査が、誤った説明を固定していた。**「検査が通った」ではなく
      //   「そのテストは本当にその主張を検証しているか」を見る、の典型例。
      must(!/(こちらの)?サーバーには送りません/.test(foot),
        "主語のない「サーバーには送りません」が残っている"
        + "（調べた場所は URL に載り、開けば配信元へ届く。事実でない）");
      // ⚠ 文言そのものに縛らない（読点1つで落ちると、直すたびに検査を書き換えることになる）。
      //   見たいのは「4 つのことが書いてあるか」。
      const facts = [
        // ⚠ **「地名か座標」で通さない。** 片方だけ書いても通っていた（2026-08-15 に指摘）。
        // ⚠ **「送りません」の字面に縛らない**（2026-08-23）。⚠ **見るのは主張のほう。**
        //   ⚠ フッターの 1 行は words.js の \`PRIVACY_SHORT\` になり、⚠ そこは「送らず」と書く。
        //   ⚠ **「送らない」と言っていれば通す。**⚠ ただし ⚠ **地名と座標の両方**は外さない
        //     （⚠ 片方だけ書いても通っていたことがある。2026-08-15 に指摘）。
        [/計測データに(は)?含めません|計測に[はも、]?[^。]*地名[^。]*座標[^。]*送(りません|らず|っていません)/,
          "計測に地名と座標の両方を送らないこと"],
        // ⚠ 配信元には届く。ここを書かないと、上の1行が言い切りすぎになる。
        [/IP/, "接続元の IP が配信元に届くこと"],
        [/URL|アドレス欄/, "調べた場所が URL に載ること"],
        [/(Cloudflare|配信).*(届|渡)/, "その URL を開くと配信元へ届くこと"],
        [/Cookie/, "Cookie を使わないこと"],
        [/提供元に[はも、]?.*座標が渡り/, "提供元に座標が渡ること（「どこにも送らない」は嘘になる）"],
      ];
      const notWritten = facts.filter(([re]) => !re.test(foot)).map(([, n]) => n);
      must(!notWritten.length, `プライバシーの説明に書かれていないことがある: ${notWritten.join("、")}`);
      must(!/一切送っていません/.test(foot), "言い切りが残っている（提供元には渡っている）");
      // 出典表示は利用の条件（地理院）とライセンス上の義務（OSM）
      for (const n of ["国土地理院", "OpenStreetMap"])
        must(foot.includes(n), `出典が消えている: ${n}`);
      // ⚠ いちばん強い約束だけは畳まない（このサービスの性格そのもの）。
      //   残りは details に入れてよいが、**これは開かなくても読めること**。
      const shown = (await page.locator("footer .f-priv").textContent()).replace(/\s+/g, " ");
      must(await page.locator("footer .f-priv").isVisible(), "プライバシーの記述が畳まれている");
      // ⚠ **2026-08-23: 畳まずに見える 1 行は \`PRIVACY_LEAD\` になった**（Owner 判断）。
      //   ⚠ 「計測に地名も座標も送らず」→「検索した場所は計測データに含めません」。
      //   ⚠ **主張は同じ**（⚠ 計測に場所を渡していない）。⚠ **言い方が変わった。**
      must(/計測データに(は)?含めません|計測に[はも、]?[^。]*地名[^。]*座標[^。]*送(りません|らず)/.test(shown),
        `畳まずに見える場所から、いちばん強い約束が消えている: ${shown}`);
      must(/Cookie/.test(shown), `Cookie を使わないことが、畳まずに見える場所に無い: ${shown}`);
      // ⚠ 「保存しません」に弱めない。計測に関しては、そもそも送っていない（/t は固定文字列だけ）
      must(!/保存しません|保存していません/.test(shown),
        "「送りません」を「保存しません」に弱めている（送ってはいる、と読める）");
      return `通信先 ${hosts.length} 種すべて記載（${hosts.join("・")}）／説明 ${facts.length} 点`;
    },
  },
  {
    name: "取り込み済みの土地では、Wikidata を叩かない", path: `/?${TOYOSU}`,
    // 叩いたら分かるように、外向きは落としておく（落ちても静的で答えられるはず）
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      await page.locator("#strip .f").last().click();       // 現在
      await settleAfterClick(page);

      // 外へ出ていないこと
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length === 0,
        "取り込み済みなのに Wikidata を叩いている");
      // それでも中身が出ていること
      const rows = await page.$$eval(".ev-it .ev-l", (els) => els.map((e) => e.textContent.trim()));
      must(rows.length > 0, "取り込んだはずの土地で、一覧が空");
      // 出典は項目ごとに持っている（根拠を出す作法）
      const note = (await page.locator(".ev-src").textContent()).replace(/\s+/g, " ");
      must(/Wikidata/.test(note), "出典が書かれていない");
      return `Wikidata への通信 0 件／一覧 ${rows.length} 件（${rows.slice(0, 2).join("・")}）`;
    },
  },
  {
    // ⚠ ev と bld の索引を混ぜない。混ぜると「建物が見たタイル」が
    //   「事物も見た」ことになる（設計レビューが実験で再現）
    // ⚠ ローカルの配信（serve.js）が、本番（_headers）と同じ方針で返しているか。
    //   実際に踏んだ（2026-08-15）: `rel.startsWith("vendor")` と書いてあったが
    //   `rel` は `/vendor/…` の形なので **常に false**。
    //   「MapLibre は 1MB あるのでキャッシュさせる」と書いてあったのに、**一度も効いていなかった**。
    //   ⚠ 文字列の先頭一致を、正規化の結果とずらした型。字面を見るだけの検査では捕まらないので、
    //     **実際に取って、返ってきたヘッダを見る**。
    name: "配信のキャッシュ方針が、本番と食い違っていない", path: "/",
    async check(page) {
      const got = {};
      for (const u of ["/vendor/maplibre-gl.js", "/vendor/maplibre-gl.css",
                       "/index.html", "/peel", "/data/bl/index.json"]) {
        const r = await page.request.get(BASE + u);
        must(r.ok(), `${u} が取れない（${r.status()}）`);
        got[u] = r.headers()["cache-control"] ?? "(無い)";
      }
      // ⚠ **vendor も毎回確認させる**（2026-08-16 に変えた）。
      //   以前は「名前が変わる前提だから長く持たせてよい」としていたが、
      //   実ファイル名は maplibre-gl.js で**固定**で、その前提が嘘だった。
      //   長く持たせると、MapLibre を上げても**古いものが返り続ける**。
      //   ⚠ immutable も外した。ファイル名をハッシュ付きにできたら、また長く持たせる。
      for (const u of Object.keys(got))
        must(/no-cache|max-age=0/.test(got[u]), `${u} が長く残る: ${got[u]}`);
      // ⚠ 「全部 max-age=0」だけでは、**取れていないのに通る**空振りになりうる。
      //   実際に値が読めていることを見る。
      must(Object.values(got).every((v) => v !== "(無い)"),
        `キャッシュ方針が読めていない: ${JSON.stringify(got)}`);
      return `${Object.keys(got).length} 本とも ${got["/index.html"]}`;
    },
  },
  {
    name: "建物の索引と、事物の索引を混ぜない", path: "/",
    async check(page) {
      const both = await page.evaluate(async () => {
        const ev = await fetch("./data/ev/index.json").then((r) => r.ok ? r.json() : null);
        const bl = await fetch("./data/bl/index.json").then((r) => r.ok ? r.json() : null);
        return { ev, bl };
      });
      must(both.ev && both.bl, "索引が読めない");
      must(both.ev.z === 12 && both.bl.z === 14,
        `索引の粒度が想定と違う: ev z${both.ev.z} / bl z${both.bl.z}`);
      // 別ファイル・別粒度であること（同じ形にすると、いつか混ざる）
      must(JSON.stringify(both.ev.tiles) !== JSON.stringify(both.bl.tiles),
        "2つの索引が同じ中身になっている");
      return `ev z${both.ev.z} ${Object.keys(both.ev.tiles).length} 束／`
        + `bl z${both.bl.z} ${Object.keys(both.bl.tiles).length} タイル`;
    },
  },
];
