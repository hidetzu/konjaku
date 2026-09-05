// 計測を受ける口（2026-09-06。Owner 判断）。
//
// ⚠ **受け取るのは、列挙した名前だけ。**⚠ **それ以外は黙って捨てる。**
//   ⚠ 任意の字を通すと、外から好きなラベルを増やせる＝この表が信用できなくなる。
//
// ⚠ **座標も user-agent も受け取らない。**⚠ **本文に入っていても読まない。**
//   ⚠ 画面が「ここに書いていないことは、していません」と言っている。
//
// ⚠ **記録に失敗しても、⚠ 利用者には何も返さない**（204）。⚠ 数えられなかっただけ。
//   ⚠ 受け取れなかったことも相手に教えない。⚠ 探る手がかりを渡さない。

// ⚠ **画面（`public/measure.js`）と同じ一覧を、⚠ こちらでも持つ。**
//   ⚠ **片方だけに頼らない**（⚠ 画面のコードは書き換えられる）。
//   ⚠ **ずれたら検査が落とす**（`test/check/safety.mjs`）。
export const EVENTS = new Set([
  "page_load", "map_opened", "detail_view", "deep_accessed", "save_place", "shared",
]);
export const SOURCES = new Set(["app-village", "tsukutta.app", "konjaku", "other", "direct"]);
export const ENTRIES = new Set(["default", "link", "map", "search", "here"]);
export const PAGES = new Set(["about", "map", "deep", "saved", "take", "privacy", "terms"]);

// ⚠ **本文の上限。**⚠ **読む前に落とす**（⚠ 何 MB 送られても一度メモリに載る形にしない）。
//   ⚠ **実測（2026-09-06）**: ⚠ **いちばん長い本文は 160 バイト**
//     （⚠ 印が 36 文字の UUID・イベント名が最長・page つき）。⚠ **検査が数え直す。**
export const MAX_BODY = 512;

const 黙って終わる = () => new Response(null, { status: 204 });

// ⚠ **訪問の印は、⚠ 形だけ見る。**⚠ **中身の意味は問わない**（⚠ 端末が作ったもの）。
//   ⚠ **長すぎるものは弾く**（⚠ ここから表が膨らむ）。
const 印が形になっている = (v) =>
  typeof v === "string" && v.length > 0 && v.length <= 64 && /^[\w-]+$/.test(v);

export async function route(req, env, now = Date.now()) {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  // ⚠ **自分のページから来たものだけ数える。**⚠ **Origin が無いものも落とす。**
  //   ⚠ 完全には防げない（Origin は詐称できる）が、⚠ 通りすがりの巡回や誤爆はこれで落ちる。
  const origin = req.headers.get("Origin");
  if (!origin || new URL(req.url).origin !== origin) return 黙って終わる();

  // ⚠ **読む前に落とす。**⚠ **Content-Length が無いもの（chunked）も塞ぐ。**
  //   ⚠ `Number(null)` は 0 なので、⚠ 文字列として取れたことを先に確かめる。
  const raw = req.headers.get("Content-Length");
  const len = raw === null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(len) || len > MAX_BODY) return 黙って終わる();

  let body = null;
  try { body = JSON.parse(await req.text()); } catch { return 黙って終わる(); }
  if (!body || typeof body !== "object") return 黙って終わる();

  // ⚠ **列挙の外は、⚠ ここで全部落とす。**
  if (!EVENTS.has(body.event_type)) return 黙って終わる();
  if (!SOURCES.has(body.referrer)) return 黙って終わる();
  const entry = body.entry_point ?? null;
  if (entry !== null && !ENTRIES.has(entry)) return 黙って終わる();
  const sid = 印が形になっている(body.session_id) ? body.session_id : null;

  // ⚠ **metadata は `page` だけ。**⚠ **来た形をそのまま入れない**（⚠ 何でも入る器にしない）。
  const page = body.metadata && PAGES.has(body.metadata.page) ? body.metadata.page : null;

  // ⚠ **日まで**（⚠ 何時に見たかは残さない）
  const day = new Date(now).toISOString().slice(0, 10);

  try {
    await env.DB.prepare(
      "INSERT INTO events_simple (created_at, referrer, session_id, event_type, entry_point, metadata) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    ).bind(day, body.referrer, sid, body.event_type, entry,
           page ? JSON.stringify({ page }) : null).run();
  } catch (e) {
    // ⚠ 数えられなかったことは残す（Workers Logs）。⚠ 利用者には何も返さない
    console.log(JSON.stringify({ eventError: String(e).slice(0, 200) }));
  }
  return 黙って終わる();
}
