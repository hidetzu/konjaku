// 今昔のサーバ ── ⚠ **口は 2 つだけ。**⚠ **どちらも静的アセットに一致しないときだけ動く。**
//
//   /api/events     ⚠ 計測（`events.js`）
//   /api/handoff*   ⚠ 合言葉で荷物を手渡す（`handoff.js`。`docs/sync-api.md`）
//
// ⚠ **計測は 2026-09-06 に作り直した**（Owner 判断。`docs/adr/0102`）。
//   ⚠ **前は `/t` で、⚠ 日ごとに畳んだ数だけを持っていた**（β 版の指標）。
//   ⚠ **v0.1.0 では、⚠ 送る側が 1 つも無く、⚠ 受け口だけが残っていた**（⚠ 実測 2026-09-06: 0 か所）。
//   ⚠ **同じ問いに答える口を 2 つ持たない**（`CLAUDE.md` §3）ので、⚠ `/t` は畳んだ。
//   ⚠ **`tick` / `health` の表は消していない**（β のデータが入っている）。⚠ 書く側が無いだけ。
//
// ⚠ **何を記録し、⚠ 何を記録しないかは `events.js` が持つ。**⚠ ここには書かない。
//
// ⚠ **入口のモジュールから、⚠ `export default` 以外を出さない**（⚠ 2026-08-30 に踏んだ）。
//   ⚠ **workerd は、⚠ 入口の名前つき `export` を「Worker の入口か Durable Object の class」
//     として検査する。**⚠ **文字列や関数を出していると、⚠ そこで落ちる。**
//   ⚠ **落ちるのは `wrangler dev --local`**（⚠ `deploy --dry-run` は通る）。
//   ⚠ **つまり、⚠ 手元で本物を動かせなくなる。**⚠ **この形は検査が見張っている。**
import { route as handoff } from "./handoff.js";
import { route as events } from "./events.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // ⚠ **合言葉の口は `handoff.js` が全部持つ**（⚠ 知らない `/api/handoff/…` の 404 も向こう）。
    if (url.pathname === "/api/handoff" || url.pathname.startsWith("/api/handoff/"))
      return handoff(req, env);
    // ⚠ **計測の口は `events.js` が全部持つ。**
    if (url.pathname === "/api/events") return events(req, env);
    return new Response(null, { status: 404 });
  },
};
