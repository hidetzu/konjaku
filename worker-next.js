// v0.1.0 のサーバの入口 ── ⚠ **ここは入口だけ。**⚠ **中身は [`handoff.js`](handoff.js)。**
//
// ⚠ **入口のモジュールから、⚠ `export default` 以外を出さない**（2026-08-30 に踏んだ）。
//   ⚠ **workerd は、⚠ 入口の名前つき `export` を「Worker の入口か Durable Object の class」
//     として検査する。**⚠ **文字列や関数を出していると、⚠ そこで落ちる。**
//
//   ```text
//   Uncaught TypeError: Incorrect type for map entry 'ALPHABET':
//     the provided value is not of type 'function or ExportedHandler'.
//   ```
//
//   ⚠ **最小の実験で切り分けた**（2026-08-30）:
//     ⚠ `export const X = "…"` ＋ `export default` → ⚠ **落ちる**
//     ⚠ `const X = "…"`（出さない）＋ `export default` → ⚠ **起動する**
//
//   ⚠ **本番は受け付けていた**（⚠ 実測: `dev.konjaku.hidetzu.work/api/handoff/…` が答える）。
//   ⚠ **`wrangler deploy --dry-run` も通る**（⚠ 束ねるだけで、⚠ 入口を検査しない）。
//   ⚠ **落ちるのは `wrangler dev --local`。**⚠ **つまり、⚠ 手元で本物を動かせなくなる。**
//   ⚠ **本番が通っているからよい、とはしない。**⚠ **手元で試せないほうが痛い。**
//
// ⚠ **この形は検査が見張っている**（`test/check/handoff-server.mjs`）。

import { route } from "./handoff.js";

export default { fetch: (request, env) => route(request, env) };
