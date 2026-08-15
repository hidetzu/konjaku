// 計測。目的はひとつだけ ── 掟: 唯一の指標は共有率 で決めた唯一の指標「共有率」を観測できるようにする。
//
// これが無い限り、掟: 判定が100件たまるまで共有率を読まない の次の一歩も 掟: 主題は「成り立ち」。明治期は手法のひとつ の「誰に向けるか」も、
// 開始条件を永久に満たさない。品質をどれだけ上げても前に進めない、という状態を解く。
//
// ⚠ 記録するのは「何が起きたか」だけ。誰が・どこを調べたかは1件も残さない。
//   - 地名も座標も送らない（このサービスは「評価は自分専用」を設計にしている。掟: 地名も座標も送らない）
//   - Cookie も識別子も使わない
//   - ⚠ IP は**保存せず、利用者の識別にも使わない**。ただし通信は Cloudflare を通るので、
//     基盤が接続元 IP を扱うことは避けられない。「IP を使わない」とは書かない
//   - 送るのは下の EVENTS に列挙した固定文字列だけ。それ以外は捨てる
//   - URL に地名と座標が載っているので、Referer も止めてある
//     （index.html の meta referrer と public/_headers の両方）
//
// 静的アセットに一致するリクエストでは、既定でこの Worker は起動しない。
// つまりページの表示は従来どおり素の配信で、ここが動くのは /t を叩いたときだけ。
// 静的アセットへのリクエストは無料・無制限で、Workers の請求対象にならない。
// https://developers.cloudflare.com/workers/static-assets/routing/worker-script/

// 送ってよいイベント。増やすときはここに書く。書いていないものは記録しない。
const EVENTS = new Set([
  "judged.ok",     // 判定が出た（詳細版）
  "judged.coarse", // 広い区分でしか出せなかった
  "judged.none",   // 判定できなかった（整備対象外・記録なし）
  "judged.fail",   // 読み込めなかった（通信エラー）
  "shared",        // 共有した（分子）
  "saved",         // 画像として保存した
  // 時間を動かす体験が、そもそも触られているか（掟: 中間を語らない。中間は見せる / tmp3.md）。
  // ⚠ これが 0 に張り付くなら、判定カードに時間を畳んだこと自体が失敗している。
  //   「面白くなかった」と「誰も触っていない」を区別できるようにするための1本。
  "era.moved",     // 帯で年代を切り替えた（⚠ 1つの場所につき1回だけ数える）
  "open.peel",     // 立体で見る（/peel）を開いた。⚠ 名前は変えない（D1 の系列が切れる）
  "open.speak",    // この年代を読み上げた
  // 降格した「2つの年代を重ねて比べる」へ、それでも行く人がいるか。
  // 「使われなければ後で消す」の"後で"を、永久に来ないようにしないための1本。
]);

// 依存の生死。どれが落ちていたかを日ごとに数える。
// 共有率がゼロだったとき「面白くなかった」のか「壊れていた」のかを区別するため。
// ⚠ "all" は「4手法とも読めた」を1件で表すもの。
//   手法ごとに ok を送っていた頃は、判定1回につき 4件の書き込みが起きていて、
//   無料枠を先に食い潰すのが計測になっていた（実測: 判定を見るだけで /t が5件）。
const TARGETS = new Set(["all", "landform", "meiji", "elevation", "photos",
  // ⚠ search は列挙してあったのに、どこからも送っていなかった。
  //   入口（住所検索）が全滅しても記録がゼロだった。
  "search",
  // ⚠ 「この範囲にできていたもの」を、事前に取り込んだ静的から出したのか、
  //   実行時に外へ取りに行ったのか。静的が壊れると全PVが Wikidata に流れるが、
  //   いままでは health:all:ok のまま静かに起きていた。
  "events"]);

// 流入の出所。`?from=zenn` で来た人を1ラベルだけ数える。
// ⚠ これが無いと「面白くなかった」と「そもそも人が来ていない」を区別できない。
//
// ⚠ なぜ Referer ではなくクエリなのか。
//   このサイトは URL に地名と座標が載るので Referer を明示的に止めてある
//   （index.html の meta referrer / public/_headers）。自分で止めておいて
//   受け側で読むことはできないし、読めたとしても他人の閲覧元を集める形になる。
//   `?from=` なら「こちらが自分で貼ったリンク」だけが数えられ、
//   利用者について新しく分かることは何一つ増えない。
//
// ⚠ 列挙したものしか記録しない。任意の文字列を通すと、
//   外から好きなラベルを増やせる＝この表が信用できなくなる。
const SOURCES = new Set(["zenn", "x", "note", "qiita", "github", "hatena"]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/t") return new Response(null, { status: 404 });
    if (req.method !== "POST") return new Response(null, { status: 405 });

    // ⚠ 自分のページから来たものだけ数える。
    //   誰でも POST できる状態だと、掟: 唯一の指標は共有率 の唯一の指標（共有率）を外から自由に
    //   汚染できる。分子だけ増やされたら、その数字を根拠に次の判断ができなくなる。
    //   完全には防げない（Origin は詐称できる）が、素通しよりはるかにましで、
    //   通りすがりの巡回や誤爆はこれで落ちる。
    //   受け取れなかったことは相手に教えない（204 で返す）。探る手がかりを渡さない。
    // ⚠ Origin が **無い**ものも落とす。以前は `origin &&` で、
    //   ヘッダを付けなければ素通りだった。curl のループで 10万行/日を焼き切れるし、
    //   shared を好きなだけ増やせる。唯一の指標（共有率）を外から汚せる状態だった。
    //   ブラウザは fetch/sendBeacon に必ず Origin を付けるので、これで実害は無い。
    const origin = req.headers.get("Origin");
    if (!origin || url.origin !== origin) return new Response(null, { status: 204 });

    // 本文は「イベント名」か「health:対象:ok|fail」。長いものは受け取らない。
    //
    // ⚠ **読む前に落とす。** 以前は `(await req.text()).slice(0, 48)` で、
    //   48 文字に切る前に body 全体を読み切っていた。切っているのは結果だけで、
    //   何 MB 送られても一度メモリに載る。Worker の実行時間とメモリは自分の請求に効く。
    //   Origin の判定を先に通しているので、そのままの悪用は難しいが、防御にはなっていない。
    //
    // ⚠ 上限は 48 のまま変えない。受け付ける本文は **29 種**で、最長は
    //   `health:elevation:fail` の **21 文字**（2026-08-15 実測。下の EVENTS /
    //   TARGETS×{ok,fail} / SOURCES から数えたもので、scripts/check.mjs が毎回数え直す）。
    //   下げると、将来イベント名を1つ足したときに**静かに数えなくなる**。
    //   ⚠ Content-Length はバイト、slice は文字だが、受け付ける本文は全部 ASCII なので一致する。
    //
    // ⚠ Content-Length が無い場合（chunked）も塞ぐ。ヘッダだけ見て安心すると、
    //   ヘッダを付けなければ素通りになる（Origin で一度踏んだのと同じ型）。
    //   ブラウザの sendBeacon / fetch は必ず Content-Length を付けるので、
    //   無いものは正常な計測ではない。
    //   ⚠ `Number(null)` は **0** なので、ヘッダが無いときに素通りする。
    //     `Number(req.headers.get(...))` と書くとそれを踏む（書いた直後に気づいた）。
    //     文字列として取れたことを先に確かめる。
    const MAX = 48;
    const raw = req.headers.get("Content-Length");
    const len = raw === null || raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(len) || len > MAX) return new Response(null, { status: 204 });
    // 受け取れなかったことは相手に教えない（Origin 不一致・列挙外と同じ 204）
    const body = (await req.text()).trim().slice(0, MAX);
    const day = new Date().toISOString().slice(0, 10);   // UTC

    // 計測が落ちても画面の動きは何も変えない。数えられなかっただけ。
    try {
      if (EVENTS.has(body)) {
        // カウンタを読んで足して書く形だが、D1（SQLite）は書き込みが直列化されるので
        // 数が壊れない。KV でこれをやると競合して落ちる。
        await env.DB.prepare(
          "INSERT INTO tick (day, event, n) VALUES (?1, ?2, 1) " +
          "ON CONFLICT (day, event) DO UPDATE SET n = n + 1"
        ).bind(day, body).run();
      } else if (body.startsWith("from:")) {
        // 列挙にないラベルは黙って捨てる（EVENTS と同じ扱い）
        if (!SOURCES.has(body.slice(5))) return new Response(null, { status: 204 });
        await env.DB.prepare(
          "INSERT INTO tick (day, event, n) VALUES (?1, ?2, 1) " +
          "ON CONFLICT (day, event) DO UPDATE SET n = n + 1"
        ).bind(day, body).run();
      } else if (body.startsWith("health:")) {
        const [, target, state] = body.split(":");
        if (!TARGETS.has(target) || (state !== "ok" && state !== "fail"))
          return new Response(null, { status: 204 });
        await env.DB.prepare(
          `INSERT INTO health (day, target, ok, fail) VALUES (?1, ?2, ?3, ?4) ` +
          `ON CONFLICT (day, target) DO UPDATE SET ok = ok + ?3, fail = fail + ?4`
        ).bind(day, target, state === "ok" ? 1 : 0, state === "fail" ? 1 : 0).run();
      }
    } catch (e) {
      // 数えられなかったことは残す（Workers Logs）。利用者には何も返さない
      console.log(JSON.stringify({ tickError: String(e).slice(0, 200) }));
    }
    return new Response(null, { status: 204 });
  },
};
