// 静的検査 — ⚠ **合言葉の口（サーバ側）**（`docs/sync-api.md` §2 / `docs/adr/0072`）。
//
// ⚠ **本物の `worker.js` を、⚠ そのまま動かす**（⚠ 字面を写さない。`CLAUDE.md` §3）。
//   ⚠ **D1 だけを偽にする。**⚠ **外へは 1 本も出ない。**⚠ ブラウザも要らない。
//
// ⚠ **見るのは「利用者から見た契約」**（`.claude/rules/testing.md`）。
//   ⚠ **返す形・状態番号・「無い」と「切れた」の区別。**
//   ⚠ **中の変数や SQL の字面は見ない**（⚠ それは実装の手順を固定するだけ）。
//
// ⚠ **偽の D1 は、⚠ 本物の代わりではない。**⚠ **本物と話せるかは、⚠ 出したあとにしか分からない。**
//   ⚠ **ここで言えるのは「この振る舞いを実装している」までで、⚠ 「動いている」ではない**
//   （`CLAUDE.md` §1）。

import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { ROOT, ok, bad, warn, head, HEAD_COMMENT, BLOCK_COMMENT } from "./lib.mjs";
// ⚠ **偽の D1 は、⚠ 実描画からも使う。**⚠ **だから 1 か所に置いた**（2026-08-29）。
import { fakeDb } from "../handoff-fake-d1.mjs";

head("合言葉の口（サーバ）");

const WORKER = join(ROOT, "worker.js");
const CORE = join(ROOT, "handoff.js");
if (!existsSync(WORKER) || !existsSync(CORE)) {
  bad("worker.js か handoff.js が無い（⚠ `docs/sync-api.md` §6 が、⚠ サーバ側の置き場と決めている）");
} else {

// ⚠ **中身は `handoff.js`。**⚠ **`worker.js` は入口だけ**（2026-08-30）。
const W = await import("../../handoff.js");

const req = (url, init = {}) => new Request(`https://example.invalid${url}`, {
  headers: { "cf-connecting-ip": "203.0.113.7", ...(init.headers ?? {}) },
  ...init,
});
const post = (payload, headers) => req("/api/handoff", {
  method: "POST", body: JSON.stringify({ payload }), headers,
});

const NOW = 1_756_400_000_000;

// ---- ⚠ ⓪ 入口のかたち ----
// ⚠ **workerd は、⚠ 入口の名前つき `export` を「入口か class」として検査する**（2026-08-30 に踏んだ）。
//   ⚠ **`export const ALPHABET = "…"` を置いていたら、⚠ `wrangler dev --local` が起動しなかった。**
//   ⚠ **本番は受け付けていたし、⚠ `deploy --dry-run` も通った。**⚠ **落ちるのは手元だけ。**
//   ⚠ **だから、⚠ 検査で見張る**（⚠ 戻すと、⚠ また手元で本物を動かせなくなる）。
{
  const src = readFileSync(WORKER, "utf8");
  // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 説明の字面を自分で拾わないため）
  const 実体 = src.replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
  const 名前つき = [...実体.matchAll(/^export\s+(?!default\b)(\S+)\s*([A-Za-z0-9_$]*)/gm)]
    .map((m) => `${m[1]} ${m[2]}`.trim());
  名前つき.length === 0
    ? ok("Worker の入口は `export default` だけ（⚠ 名前つき export を置くと workerd が起動しない）")
    : bad(`Worker の入口に名前つき export がある: ${名前つき.join(" / ")}`
        + "。⚠ **`wrangler dev --local` が起動しなくなる**（⚠ 本番と `--dry-run` は通るので気づけない）");

  // ⚠ **名前は問わない**（2026-09-01。⚠ 入口が 1 つになり、⚠ `route as handoff` で借りている）。
  //   ⚠ **見るのは「中身を `handoff.js` から借りていること」**。⚠ **入口へ書き戻していないこと。**
  /^\s*import\s+\{[^}]*\broute\b[^}]*\}\s+from\s+"\.\/handoff\.js"/m.test(実体)
    ? ok("Worker の入口は、⚠ 中身を handoff.js から借りている")
    : bad("Worker の入口が handoff.js の route を読んでいない（⚠ 中身が入口へ戻っている可能性）");
}

// ---- ⚠ ① 合言葉の字 ----
// ⚠ **`docs/adr/0072` の数字が、⚠ 字の数を決めている**（⚠ 1,099,511,627,776 ＝ 32⁸）。
//   ⚠ **30 文字だと 30⁸ ＝ 656,100,000,000 で合わない。**
{
  const n = W.ALPHABET.length;
  const 通り = BigInt(n) ** BigInt(W.CODE_LENGTH);
  通り === 1_099_511_627_776n
    ? ok(`合言葉の組み合わせが ADR 0072 の数字と合う（${n} 文字 × ${W.CODE_LENGTH} 桁 ＝ ${通り}）`)
    : bad(`合言葉の組み合わせが ADR 0072 と違う: ${通り}（ADR は 1,099,511,627,776）`
        + "。⚠ **ADR の確率の数字が、⚠ そのまま意味を失う**");

  // ⚠ **読み違える字を、⚠ 出す側に入れない**（⚠ 打つ側で寄せる）
  const 紛らわしい = [..."ILOU"].filter((c) => W.ALPHABET.includes(c));
  紛らわしい.length
    ? bad(`合言葉に読み違えやすい字が入っている: ${紛らわしい.join(" ")}`)
    : ok("合言葉の字から I / L / O / U を外している（⚠ 打つ側で 0 と 1 に寄せる）");

  new Set(W.ALPHABET).size === n
    ? ok("合言葉の字に重複が無い")
    : bad("合言葉の字が重複している（⚠ 出る確率が偏る）");
}

// ---- ⚠ ② 打たれた字の寄せ方 ----
// ⚠ **画面が「大文字と小文字は区別しません」と言っている**（`docs/sync-api.md` §2）。
{
  const cases = [
    ["小文字", "k7qm3xvr", "K7QM3XVR"],
    ["区切りと空白", "K7QM-3XVR", "K7QM3XVR"],
    ["前後の空白", "  K7QM3XVR ", "K7QM3XVR"],
    ["O を 0 に", "O7QM3XVR", "07QM3XVR"],
    ["I と L を 1 に", "I7QM3XVL", "17QM3XV1"],
  ];
  const wrong = cases.filter(([, from, to]) => W.normalizeCode(from) !== to)
    .map(([label]) => label);
  wrong.length
    ? bad(`打たれた字の寄せ方が仕様と違う: ${wrong.join(" ／ ")}`)
    : ok(`打たれた字は、⚠ 照合できる形に寄る（${cases.length} 通り）`);
}

// ---- ⚠ ③ 預けて、取り出す ----
{
  const env = { DB: fakeDb() };
  const res = await W.postHandoff(post("2H4sIAAAA"), env, NOW);
  const body = await res.json();

  const shaped = res.status === 200
    && typeof body.code === "string" && body.code.length === W.CODE_LENGTH
    && body.expires_at === NOW + 300_000 && body.ttl_sec === 300;
  shaped
    ? ok(`預けると、合言葉と期限と長さが返る（${body.code.length} 文字 ／ ttl_sec=${body.ttl_sec}）`)
    : bad(`預けたときの返しが契約と違う: ${res.status} ${JSON.stringify(body)}`);

  // ⚠ **合言葉そのものを置いていないこと**（`docs/sync-api.md` §3）
  const stored = [...env.DB.rows.keys()];
  stored.some((k) => k.includes(body.code))
    ? bad("合言葉そのものが D1 に置かれている（⚠ ハッシュを置くと決めてある）")
    : ok("D1 に置いているのは合言葉のハッシュだけ（⚠ 合言葉そのものではない）");

  // ⚠ **取り出しても消さない。**⚠ **期限内なら何度でも**（`docs/adr/0072`）
  const one = await W.getHandoff(req(`/api/handoff/${body.code}`), env, body.code, NOW + 1000);
  const two = await W.getHandoff(req(`/api/handoff/${body.code}`), env,
    body.code.toLowerCase(), NOW + 2000);
  const b1 = await one.json(), b2 = await two.json();
  (one.status === 200 && two.status === 200 && b1.payload === "2H4sIAAAA"
    && b2.payload === "2H4sIAAAA")
    ? ok("期限内なら何度でも取り出せる（⚠ 取り出しても消さない。⚠ 小文字でも通る）")
    : bad(`取り出しが契約と違う: 1 回目 ${one.status} ／ 2 回目 ${two.status}`);
}

// ---- ⚠ ④ 「無い」と「切れた」を分ける ----
// ⚠ **ここが掟に直接触る**（`CLAUDE.md` §1）。⚠ **同じ形で返すと、⚠ 画面が言い分けられない。**
{
  const env = { DB: fakeDb() };
  const made = await (await W.postHandoff(post("x"), env, NOW)).json();

  const expired = await W.getHandoff(req("/api/handoff/x"), env, made.code, NOW + 300_001);
  const again = await W.getHandoff(req("/api/handoff/x"), env, made.code, NOW + 300_002);
  const never = await W.getHandoff(req("/api/handoff/x"), env, "23456789", NOW + 1000);

  const e = await expired.json(), a = await again.json(), n = await never.json();
  (expired.status === 410 && e.error === "expired")
    ? ok("期限が切れていたら 410 expired（⚠ 「切れた」と言い切れる）")
    : bad(`期限切れが 410 expired で返らない: ${expired.status} ${JSON.stringify(e)}`);
  (again.status === 404 && a.error === "not_found")
    ? ok("期限切れを見つけたら消すので、⚠ 2 回目は 404（⚠ 仕様であって不具合ではない）")
    : bad(`期限切れの 2 回目が 404 not_found にならない: ${again.status}`);
  (never.status === 404 && n.error === "not_found")
    ? ok("知らない合言葉は 404 not_found")
    : bad(`知らない合言葉が 404 にならない: ${never.status}`);
  // ⚠ **同じ字で返していないこと**（⚠ 同じにすると、⚠ 出し直すのか打ち直すのか分からない）
  e.error !== a.error
    ? ok("「切れた」と「無い」を、⚠ 別の字で返している")
    : bad("「切れた」と「無い」が同じ字で返っている（⚠ 画面が言い分けられない）");
}

// ---- ⚠ ⑤ 失敗の返し方 ----
{
  const env = { DB: fakeDb(), HANDOFF_MAX_PAYLOAD: "10" };
  const big = await W.postHandoff(post("12345678901"), env, NOW);
  (big.status === 413 && (await big.json()).error === "too_large")
    ? ok("大きすぎる荷物は 413 too_large（⚠ 上限は環境変数で変えられる）")
    : bad(`大きすぎる荷物が 413 too_large にならない: ${big.status}`);

  const empty = await W.postHandoff(post(""), env, NOW);
  empty.status === 400
    ? ok("空の荷物は 200 で返さない（⚠ 「0 件を預けた」の意味になる）")
    : bad(`空の荷物が 200 系で通っている: ${empty.status}`);

  const broken = { DB: fakeDb() };
  broken.DB.fail.on = "INSERT INTO handoff (";
  const down = await W.postHandoff(post("x"), broken, NOW);
  (down.status === 503 && (await down.json()).error === "store_unavailable")
    ? ok("預かれなかったら 503 store_unavailable（⚠ 端末の控えは 1 件も減らない）")
    : bad(`預かれなかったときが 503 store_unavailable にならない: ${down.status}`);
}

// ---- ⚠ ⑥ 試行回数の制限 ----
// ⚠ **`docs/adr/0072` の確率は、⚠ ここが在ることを前提にしている。**
//   ⚠ **無いと、⚠ ADR の数字がそのまま意味を失う。**
{
  const env = { DB: fakeDb(), HANDOFF_ATTEMPT_LIMIT: "5", HANDOFF_ATTEMPT_WINDOW_SEC: "60" };
  let last;
  for (let i = 0; i < 6; i++) {
    last = await W.getHandoff(req("/api/handoff/23456789"), env, "23456789", NOW + i);
  }
  const body = await last.json();
  (last.status === 429 && body.error === "too_many" && body.retry_after > 0
    && last.headers.get("retry-after"))
    ? ok(`試しすぎたら 429 too_many（⚠ retry_after=${body.retry_after} 秒。⚠ ヘッダにも出す）`)
    : bad(`試行回数を制限していない: ${last.status} ${JSON.stringify(body)}`
        + "（⚠ **ADR 0072 の確率が、⚠ そのまま意味を失う**）");

  // ⚠ **形が違うものも数えていること**（⚠ 数えないと、⚠ 形だけ整えて素通りできる）
  const env2 = { DB: fakeDb(), HANDOFF_ATTEMPT_LIMIT: "2" };
  await W.getHandoff(req("/api/handoff/!"), env2, "!", NOW);
  await W.getHandoff(req("/api/handoff/!"), env2, "!", NOW);
  const third = await W.getHandoff(req("/api/handoff/23456789"), env2, "23456789", NOW);
  third.status === 429
    ? ok("形が違う合言葉も、⚠ 試行として数えている")
    : bad(`形が違う合言葉が試行に数えられていない: ${third.status}`
        + "（⚠ **形だけ整えずに総当たりできてしまう**）");
}

// ---- ⚠ ⑦ 振り分け ----
{
  const env = { DB: fakeDb() };
  const wrongMethod = await W.route(req("/api/handoff", { method: "GET" }), env, NOW);
  const unknown = await W.route(req("/api/nope"), env, NOW);
  (wrongMethod.status === 405 && unknown.status === 404)
    ? ok("知らない口は 404、⚠ 使い方が違うときは 405")
    : bad(`振り分けが契約と違う: GET /api/handoff=${wrongMethod.status} ／ /api/nope=${unknown.status}`);
}

// ---- ⚠ ⑧ 設定の出どころ ----
// ⚠ **画面は `ttl_sec` から文を作る。**⚠ **数字を 2 か所に持たない**（`docs/adr/0072`）。
{
  const env = { DB: fakeDb(), HANDOFF_TTL_SEC: "60" };
  const b = await (await W.postHandoff(post("x"), env, NOW)).json();
  (b.ttl_sec === 60 && b.expires_at === NOW + 60_000)
    ? ok("期限は環境変数で変えられ、⚠ 返す ttl_sec と expires_at が一緒に動く")
    : bad(`期限を環境変数で変えられない: ttl_sec=${b.ttl_sec} expires_at=${b.expires_at - NOW}`);
}

// ---- ⚠ ⑨ 中身を読んでいないこと ----
// ⚠ **`docs/adr/0071` の核心。**⚠ **サーバに「50m」も「どう混ぜるか」も書かない。**
//   ⚠ **書くと、⚠ 同じ問いに答える実装が 2 つになる**（`CLAUDE.md` §3）。
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ この注記自身を拾わないため）。
{
  const code = readFileSync(WORKER, "utf8").replace(HEAD_COMMENT, "");
  const 禁じ手 = [
    ["JSON.parse(", "⚠ payload を解こうとしている"],
    ["atob(", "⚠ payload を解こうとしている"],
    ["DecompressionStream", "⚠ payload を解こうとしている"],
    ["Math.hypot", "⚠ 距離を測っている（⚠ 50m は端末の saved.js が持つ）"],
    ["latitude", "⚠ 座標を見ている"],
    ["merge", "⚠ 混ぜ方を持っている（⚠ 端末の仕事）"],
  ];
  // ⚠ **`request.json()` は口の形を読むためのもの**（⚠ `payload` の中身ではない）。
  //   ⚠ **そこだけ外してから見る。**⚠ 外し方を広げない。
  const body = code.replace(/await request\.json\(\)/g, "");
  const hit = 禁じ手.filter(([w]) => body.includes(w)).map(([w, why]) => `${w} ${why}`);
  hit.length
    ? bad(`サーバが荷物の中身を読もうとしている: ${hit.join(" ／ ")}`)
    : ok(`サーバは荷物の中身を読んでいない（⚠ ${禁じ手.length} 通りで見た）`);
}

// ---- ⚠ ⑩ まだ配信につながっていないことを、⚠ 黙って進めない ----
// ⚠ **ここを緑にしない。**⚠ **口が在っても、⚠ `wrangler.jsonc` が `main` と D1 を
//   ⚠ 持たなければ、⚠ 本番では 1 度も動かない**（`docs/sync-api.md` §6: ⚠ 足すのは B）。
// ⚠ **落とさない理由**: ⚠ **D1 を作るのは、⚠ アカウントに実体を作る操作。**
//   ⚠ **できるまでのあいだ、⚠ 検査ごと赤にすると、⚠ 他の作業まで止まる。**
// ⚠ **黙らせない理由**: ⚠ **「実装した」と「動いている」は別**（`CLAUDE.md` §1）。
{
  const cfg = JSON.parse(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8")
    .replace(HEAD_COMMENT, "").replace(/,(\s*[}\]])/g, "$1"));
  const hasMain = typeof cfg.main === "string" && cfg.main.length > 0;
  const hasDb = (cfg.d1_databases ?? []).some((d) => d.binding === "DB" && d.database_id);
  (hasMain && hasDb)
    ? ok(`合言葉の口は配信につながっている（main=${cfg.main} ／ D1=${cfg.d1_databases[0].database_name}）`)
    : warn("合言葉の口は、⚠ **まだ配信につながっていない**"
        + `（main=${hasMain ? "有り" : "無し"} ／ D1=${hasDb ? "有り" : "無し"}）。`
        + "⚠ **口の振る舞いは上で確かめているが、⚠ 本番では 1 度も動かない。**"
        + "⚠ 繋ぐには D1（konjaku）を作り、⚠ database_id を wrangler.jsonc へ書く");
}

}
