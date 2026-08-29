// ⚠ **偽の D1。**⚠ **`worker-next.js` を、⚠ 本物のまま動かすための土台。**
//
// ⚠ **ここに置いたのは、⚠ 2 か所から使うから**（2026-08-29）。
//   ⚠ **静的検査（`check/handoff-server.mjs`）と、⚠ 実描画（`render/next.mjs`）。**
// ⚠ **実描画で「契約どおり返す偽物」を手で書いていたが、⚠ やめた。**
//   ⚠ **手で書くと、⚠ 本物が形を変えたときに、⚠ 画面側の検査だけ古いまま通る**
//   （`CLAUDE.md` §3「同じ問いに答える実装を 2 つ持たない」）。
//   ⚠ **いまは、⚠ 実描画も本物の worker を呼ぶ。**⚠ **偽なのは D1 だけ。**
//
// ⚠ **これは本物の D1 の代わりではない。**⚠ **SQL を字で判定している。**
//   ⚠ **本物と話せるかは、⚠ 出したあとにしか分からない**（`CLAUDE.md` §1）。

// ---- ⚠ 偽の D1 ----
//
// ⚠ **表として持つ。**⚠ **SQL を字で判定する**（⚠ 本物の D1 の代わりではない）。
// ⚠ **ここが本物とずれたら、⚠ この検査は嘘をつく。**⚠ **だから作りを最小にする。**
export const fakeDb = () => {
  const handoff = new Map();
  const attempt = new Map();
  const fail = { on: null };
  const run = (sql, args) => {
    if (fail.on && sql.includes(fail.on)) throw new Error("D1 が落ちている（偽）");
    if (/^INSERT INTO handoff \(/.test(sql)) {
      const [code_hash, payload, created_at, expires_at] = args;
      if (handoff.has(code_hash)) throw new Error("UNIQUE constraint failed");
      handoff.set(code_hash, { payload, created_at, expires_at });
      return {};
    }
    if (/^SELECT payload, expires_at FROM handoff/.test(sql)) return handoff.get(args[0]) ?? null;
    if (/^DELETE FROM handoff WHERE code_hash = /.test(sql)) { handoff.delete(args[0]); return {}; }
    if (/^DELETE FROM handoff WHERE code_hash IN/.test(sql)) {
      for (const [k, v] of handoff) if (v.expires_at < args[0]) handoff.delete(k);
      return {};
    }
    if (/^INSERT INTO handoff_attempt/.test(sql)) {
      const [bucket, expires_at] = args;
      const cur = attempt.get(bucket);
      attempt.set(bucket, { tries: (cur?.tries ?? 0) + 1, expires_at });
      return {};
    }
    if (/^SELECT tries FROM handoff_attempt/.test(sql)) return attempt.get(args[0]) ?? null;
    if (/^DELETE FROM handoff_attempt WHERE bucket IN/.test(sql)) {
      for (const [k, v] of attempt) if (v.expires_at < args[0]) attempt.delete(k);
      return {};
    }
    throw new Error(`偽の D1 が知らない SQL: ${sql}`);
  };
  return {
    fail,
    rows: handoff,
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => run(sql, args),
        first: async () => run(sql, args),
      }),
    }),
  };
};
