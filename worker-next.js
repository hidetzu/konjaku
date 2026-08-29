// v0.1.0 のサーバ ── ⚠ **荷物を預かって返すだけ**（`docs/sync-api.md` / `docs/adr/0071`・`0072`）。
//
// ⚠ **中身を読まない。**⚠ **`payload` は端末が詰めた 1 本の字で、⚠ ここでは解かない。**
//   ⚠ **「同じ場所か（50m）」「どう混ぜるか」は、⚠ 端末の `saved.js` が持つ**（`docs/adr/0071`）。
//   ⚠ **ここに書くと、⚠ 同じ問いに答える実装が 2 つになる**（`CLAUDE.md` §3）。
//
// ⚠ **「読まない」は、⚠ 「座標を送っていない」ではない**（`docs/sync-api.md` §1）。
//   ⚠ **預かっているあいだ、⚠ その人が歩いた場所は、⚠ このサーバに在る。**
//   ⚠ **画面はそう言う。**⚠ **ここを安全の説明に使わない。**
//
// ⚠ **静的アセットに一致する要求では、⚠ この Worker は起動しない**（β の `worker.js` と同じ）。
//   ⚠ **`run_worker_first` を足すと起動するようになる。**⚠ **足さない。**
//   ⚠ **足すと、⚠ 場所つきの URL が Workers Logs に載る**（`wrangler.jsonc` の注記と同じ話）。

// ---- ⚠ 合言葉の字 ------------------------------------------------------------
//
// ⚠ **Crockford Base32**（⚠ 人が打つために作られた 32 文字）。
//   ⚠ **`I` `L` `O` `U` を字から外す。**⚠ **数字の `0` `1` は残す。**
//   ⚠ **読み違えは、⚠ 出すときではなく ⚠ 打つときに直す**（下の `normalizeCode`）。
//     ⚠ `O` → `0` ／ `I` `L` → `1`。⚠ **利用者が間違えても通る。**
//
// ⚠ **32 文字であることは、⚠ `docs/adr/0072` の数字が決めている**
//   （⚠ **1,099,511,627,776 通り ＝ 32⁸ ＝ 40 ビット**）。⚠ **30 文字だと 30⁸ で合わない。**
//   ⚠ **文書の丸括弧は「読み違える組」を挙げたもので、⚠ 字の一覧ではない**
//     （2026-08-29。⚠ **この不一致は Owner へ申告済み**）。
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;

// ⚠ **既定値。**⚠ **環境変数で変えられるようにする**（`docs/adr/0072` が MUST にしている）。
//   ⚠ **画面は、⚠ 返した `ttl_sec` から文を作る。**⚠ **数字を 2 か所に持たない。**
export const DEFAULTS = {
  ttlSec: 300,            // ⚠ 5 分（2026-08-29。Owner 判断）
  maxPayload: 20000,      // ⚠ 実測（2026-08-29）: 500 件で 9172 字 ／ 700 件で 12829 字
  attemptLimit: 30,       // ⚠ 1 つの窓で試せる回数
  attemptWindowSec: 60,
  cleanupRows: 50,        // ⚠ 書き込みのついでに消す行数の上限
};

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const settingsOf = (env = {}) => ({
  ttlSec: num(env.HANDOFF_TTL_SEC, DEFAULTS.ttlSec),
  maxPayload: num(env.HANDOFF_MAX_PAYLOAD, DEFAULTS.maxPayload),
  attemptLimit: num(env.HANDOFF_ATTEMPT_LIMIT, DEFAULTS.attemptLimit),
  attemptWindowSec: num(env.HANDOFF_ATTEMPT_WINDOW_SEC, DEFAULTS.attemptWindowSec),
  cleanupRows: num(env.HANDOFF_CLEANUP_ROWS, DEFAULTS.cleanupRows),
});

// ⚠ **打たれた字を、⚠ 照合できる形に直す**（`docs/sync-api.md` §2）。
//   ⚠ **大文字と小文字を区別しない。**⚠ **`-` と空白は落とす。**
//   ⚠ **読み違えやすい字を寄せる**（⚠ Crockford の作法。⚠ ここでしか直さない）。
export function normalizeCode(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export const isCodeShaped = (code) =>
  code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));

// ⚠ **合言葉は乱数から作る。**⚠ **通し番号にしない。**⚠ **時刻から作らない**（`docs/adr/0072`）。
//   ⚠ **256 は 32 で割り切れるので、⚠ `& 31` で偏らない**（⚠ 捨て直しが要らない）。
export function newCode(random = crypto) {
  const bytes = new Uint8Array(CODE_LENGTH);
  random.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b & 31]).join("");
}

// ⚠ **合言葉そのものを置かない**（`docs/sync-api.md` §3）。⚠ 置くのはこれ。
export async function hashCode(code, subtle = crypto.subtle) {
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- ⚠ 返し方 ---------------------------------------------------------------
//
// ⚠ **「無い」と「切れた」を、⚠ 別の形で返す**（`CLAUDE.md` §1 / `docs/sync-api.md`）。
//   ⚠ **画面に出す言葉は、⚠ ここでは決めない**（⚠ `docs/adr/0072` が正本。⚠ Display の仕事）。
//   ⚠ **サーバが返すのは、⚠ 機械が読む印だけ。**
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // ⚠ **預かりものを、⚠ 途中の箱に残さない**
      "cache-control": "no-store",
      ...extra,
    },
  });

const fail = (status, error, extra = {}, headers = {}) =>
  json({ error, ...extra }, status, headers);

// ---- ⚠ 試行回数の制限 ---------------------------------------------------------
//
// ⚠ **接続元そのものは置かない。**⚠ **窓ごとに、⚠ 混ぜてから潰した字を置く。**
//   ⚠ **窓が変われば別の行になる**ので、⚠ **同じ人を時間をまたいで追えない。**
// ⚠ **これは「守っている」の証明ではない**（⚠ 接続元は変えられる）。
//   ⚠ **`docs/adr/0072` の確率が前提にしている「制限が在る」を満たすためのもの。**
async function countAttempt(db, request, now, s) {
  const windowMs = s.attemptWindowSec * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const who = request.headers.get("cf-connecting-ip") ?? "unknown";
  const bucket = await hashCode(`${who}\n${start}`);
  const expires = start + windowMs;

  // ⚠ **1 文で足す。**⚠ **読んでから書くと、⚠ 同時に来たぶんを数え落とす。**
  await db.prepare(
    "INSERT INTO handoff_attempt (bucket, tries, expires_at) VALUES (?1, 1, ?2)"
    + " ON CONFLICT(bucket) DO UPDATE SET tries = tries + 1",
  ).bind(bucket, expires).run();

  const row = await db.prepare("SELECT tries FROM handoff_attempt WHERE bucket = ?1")
    .bind(bucket).first();
  const tries = Number(row?.tries ?? 1);
  return { over: tries > s.attemptLimit, retryAfter: Math.ceil((expires - now) / 1000) };
}

// ⚠ **書き込みのついでに、⚠ 少しだけ消す**（`docs/sync-api.md` §4）。
//   ⚠ **Cron を置かずに、⚠ 実際に減る。**⚠ **ただし「必ず消える」保証にはならない**
//   （⚠ 発行が止まれば残る）。⚠ **だから画面は「使えなくなります」と言う。**
// ⚠ **ここが失敗しても、⚠ 預かること自体は止めない**（⚠ 掃除は本筋ではない）。
async function sweep(db, now, s) {
  try {
    await db.prepare(
      "DELETE FROM handoff WHERE code_hash IN"
      + " (SELECT code_hash FROM handoff WHERE expires_at < ?1 LIMIT ?2)",
    ).bind(now, s.cleanupRows).run();
    await db.prepare(
      "DELETE FROM handoff_attempt WHERE bucket IN"
      + " (SELECT bucket FROM handoff_attempt WHERE expires_at < ?1 LIMIT ?2)",
    ).bind(now, s.cleanupRows).run();
  } catch {
    // ⚠ **握りつぶさない**（`.claude/rules/javascript.md`）が、⚠ **ここでは利用者を止めない。**
    //   ⚠ **溜まっていることは、⚠ 期限の判定には影響しない**（⚠ 判定は取り出すときに見る）。
  }
}

// ---- ⚠ 口 ① 預ける -----------------------------------------------------------
export async function postHandoff(request, env, now = Date.now()) {
  const s = settingsOf(env);
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const payload = body?.payload;
  // ⚠ **空の荷物を `200` にしない**（`docs/sync-api.md`）。⚠ **「0 件を預けた」の意味になる。**
  if (typeof payload !== "string" || payload === "") return fail(400, "bad_request");
  if (payload.length > s.maxPayload) return fail(413, "too_large");

  const expiresAt = now + s.ttlSec * 1000;
  try {
    await sweep(env.DB, now, s);
    // ⚠ **ぶつかったら出し直す**（`docs/sync-api.md` §2）。⚠ **一意制約に任せる。**
    //   ⚠ **確率は 9.09e-10（1000 本生きているとき）。**⚠ **3 回で十分すぎる。**
    for (let i = 0; i < 3; i++) {
      const code = newCode();
      try {
        await env.DB.prepare(
          "INSERT INTO handoff (code_hash, payload, created_at, expires_at)"
          + " VALUES (?1, ?2, ?3, ?4)",
        ).bind(await hashCode(code), payload, now, expiresAt).run();
        // ⚠ **`ttl_sec` を返す。**⚠ **画面に「◯分」を直書きさせない**（`docs/adr/0072`）。
        return json({ code, expires_at: expiresAt, ttl_sec: s.ttlSec });
      } catch (e) {
        if (!/UNIQUE|constraint/i.test(String(e?.message ?? e))) throw e;
      }
    }
    return fail(503, "store_unavailable");
  } catch {
    // ⚠ **端末の控えは 1 件も減らない**（`docs/adr/0071`）。⚠ **画面はそう言う。**
    return fail(503, "store_unavailable");
  }
}

// ---- ⚠ 口 ② 取り出す ---------------------------------------------------------
export async function getHandoff(request, env, rawCode, now = Date.now()) {
  const s = settingsOf(env);
  const code = normalizeCode(rawCode);

  try {
    // ⚠ **形が違うものも数える。**⚠ **数えないと、⚠ 総当たりが形だけ整えて素通りする。**
    const attempt = await countAttempt(env.DB, request, now, s);
    if (attempt.over) {
      return fail(429, "too_many", { retry_after: attempt.retryAfter },
        { "retry-after": String(attempt.retryAfter) });
    }
    // ⚠ **形が違うのは「無い」**。⚠ **400 にしない**（⚠ 在る／無いの区別を増やさない）。
    if (!isCodeShaped(code)) return fail(404, "not_found");

    const row = await env.DB.prepare(
      "SELECT payload, expires_at FROM handoff WHERE code_hash = ?1",
    ).bind(await hashCode(code)).first();

    // ⚠ **無い**（⚠ 打ち間違い ／ ⚠ 期限切れの 2 回目）。
    //   ⚠ **画面は、⚠ ここを「打ち間違いです」と言い切らない**（`docs/adr/0072`）。
    if (!row) return fail(404, "not_found");

    // ⚠ **期限切れは、⚠ その場で消して `410`**（2026-08-29。Owner 判断）。
    //   ⚠ **消すので、⚠ 2 回目は `404` に来る。**⚠ **これは仕様であって不具合ではない。**
    if (Number(row.expires_at) <= now) {
      await env.DB.prepare("DELETE FROM handoff WHERE code_hash = ?1")
        .bind(await hashCode(code)).run();
      return fail(410, "expired");
    }

    // ⚠ **取り出しても消さない。**⚠ **期限内なら何度でも返す**（`docs/adr/0072`）。
    //   ⚠ **PC とタブレットの両方に入れたい人が居る。**
    return json({ payload: row.payload, expires_at: Number(row.expires_at) });
  } catch {
    return fail(503, "store_unavailable");
  }
}

// ---- ⚠ 振り分け ---------------------------------------------------------------
//
// ⚠ **ここへ来るのは、⚠ 静的アセットに一致しなかった要求だけ。**
//   ⚠ **`/api/` の外は、⚠ この Worker の仕事ではない。**
export async function route(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/handoff") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", {}, { allow: "POST" });
    return postHandoff(request, env, now);
  }

  const m = /^\/api\/handoff\/(.+)$/.exec(path);
  if (m) {
    if (request.method !== "GET") return fail(405, "method_not_allowed", {}, { allow: "GET" });
    return getHandoff(request, env, decodeURIComponent(m[1]), now);
  }

  // ⚠ **知らない `/api/` は 404。**⚠ **`/api/` の外も 404**（⚠ 静的で見つからなかったもの）。
  return fail(404, "not_found");
}

export default { fetch: (request, env) => route(request, env) };
