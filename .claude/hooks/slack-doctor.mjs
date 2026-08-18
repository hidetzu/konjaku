// Slack の設定が合っているかを、実装の前に確かめる道具。
//
// ⚠ 何も投稿しない。読むだけ（--post を付けたときだけ 1 通投げる）。
// ⚠ トークンの値は絶対に出さない。頭 4 文字と長さだけ。
// ⚠ 依存ゼロ。node の組み込み fetch と WebSocket だけを使う（Bolt は要らない）。
//
//   node .claude/hooks/slack-doctor.mjs            設定を見るだけ
//   node .claude/hooks/slack-doctor.mjs --post     ボタン付きの見本を 1 通投げて、押されるまで待つ
//
// 読むもの（環境変数。無ければ この repo の .envrc / .env の**その行だけ**）:
//   SLACK_APP_TOKEN    xapp-…  Socket Mode 用（connections:write）
//   SLACK_BOT_TOKEN    xoxb-…  投稿用（chat:write）
//   SLACK_CHANNEL_ID   C…      投げ先
// ⚠ SLACK_WEBHOOK_URL はもう使わない。残っていたら「消せ」と言う。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR
  ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ⚠ source しない。この変数の行だけを読む（.envrc は任意のシェルコード）
const fromEnvFile = (name) => {
  for (const f of [join(ROOT, ".envrc"), join(ROOT, ".env")]) {
    if (!existsSync(f)) continue;
    const m = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, "m")
      .exec(readFileSync(f, "utf8"));
    if (!m) continue;
    let v = m[1].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (v) return v;
  }
  return null;
};
const get = (name) => process.env[name] || fromEnvFile(name);

// ⚠ 値を出さない。形だけ
const shape = (v) => (v ? `${v.slice(0, 5)}… (${v.length} 文字)` : "無い");

const call = async (method, token, body) => {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": body ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded",
    },
    body: body ? JSON.stringify(body) : "",
  });
  return r.json();
};

// つまずく所は決まっている。Slack の素っ気ないエラーを、何をすればいいかに訳す
const HINT = {
  invalid_auth: "トークンが違う（貼り間違い／再インストール後に古いものを使っている）",
  not_allowed_token_type: "⚠ トークンの種類が違う。apps.connections.open には xapp- を使う（xoxb- ではない）",
  missing_scope: "権限が足りない。スコープを足して **入れ直す**（足すだけでは効かない）",
  not_in_channel: "⚠ チャンネルに bot を招待していない。`/invite @アプリ名`",
  channel_not_found: "channel id が違う（チャンネル詳細の一番下の C… をそのまま）",
  account_inactive: "アプリがアンインストールされている",
};

const line = (ok, label, detail) =>
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? " — " + detail : ""}`);

const APP = get("SLACK_APP_TOKEN"), BOT = get("SLACK_BOT_TOKEN"), CH = get("SLACK_CHANNEL_ID");
const HOOK = get("SLACK_WEBHOOK_URL");

console.log("\n\x1b[1m1. 手元にあるもの\x1b[0m（⚠ 値は出さない）");
// ⚠ Webhook は**もう使わない**（chat.postMessage が上位互換）。
//   残っていたら、使わない秘密が置きっぱなしという意味なので、そう言う。
if (HOOK) line(false, "SLACK_WEBHOOK_URL", "⚠ 残っている。もう使わないので消す（使わない秘密を置かない）");
line(!!APP, "SLACK_APP_TOKEN", shape(APP));
line(!!BOT, "SLACK_BOT_TOKEN", shape(BOT));
line(!!CH, "SLACK_CHANNEL_ID", CH ?? "無い");
if (APP && !APP.startsWith("xapp-")) line(false, "SLACK_APP_TOKEN の形", "⚠ xapp- で始まっていない");
if (BOT && !BOT.startsWith("xoxb-")) line(false, "SLACK_BOT_TOKEN の形", "⚠ xoxb- で始まっていない");

let fatal = 0;
const need = (v, what) => { if (!v) { console.log(`\n  ここで止まる: ${what}`); fatal++; } return !!v; };

if (need(BOT, "SLACK_BOT_TOKEN が無いので、この先は見られない")) {
  console.log("\n\x1b[1m2. bot として名乗れるか\x1b[0m（auth.test）");
  const a = await call("auth.test", BOT).catch((e) => ({ ok: false, error: String(e) }));
  line(a.ok, "auth.test", a.ok ? `${a.team} / ${a.user}` : `${a.error} — ${HINT[a.error] ?? ""}`);
  if (!a.ok) fatal++;
}

if (APP) {
  console.log("\n\x1b[1m3. Socket Mode が有効か\x1b[0m（apps.connections.open）");
  const c = await call("apps.connections.open", APP).catch((e) => ({ ok: false, error: String(e) }));
  line(c.ok, "apps.connections.open", c.ok ? "WebSocket の URL をもらえた" : `${c.error} — ${HINT[c.error] ?? "Socket Mode が OFF かもしれない"}`);
  if (c.ok) {
    // ⚠ 実際に繋いで hello が来るところまで見る。URL がもらえるだけでは繋がるとは限らない
    const ws = new WebSocket(c.url);
    const hello = await new Promise((res) => {
      const t = setTimeout(() => res(null), 10000);
      ws.onmessage = (e) => { const m = JSON.parse(e.data);
        if (m.type === "hello") { clearTimeout(t); res(m); } };
      ws.onerror = () => { clearTimeout(t); res(null); };
    });
    line(!!hello, "WebSocket に繋がる", hello ? `hello を受け取った（接続 ${hello.num_connections} 本）` : "⚠ 10 秒待っても hello が来ない");
    if (!hello) fatal++;
    ws.close();
  } else fatal++;
} else console.log("\n\x1b[1m3. Socket Mode\x1b[0m — SLACK_APP_TOKEN が無いので見ていない");

if (process.argv.includes("--post") && BOT && CH && APP) {
  console.log("\n\x1b[1m4. ボタンを出して、押されるまで待つ\x1b[0m（⚠ 実際に 1 通投稿する）");
  const OPTS = ["案A でいく", "案B でいく", "やめる"];
  const p = await call("chat.postMessage", BOT, {
    channel: CH,
    text: "（見本）Slack から答えを返せるかの確認です",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*（見本）Slack から答えを返せますか？*" } },
      { type: "actions", elements: OPTS.map((o, i) => ({
        type: "button", action_id: `doctor_${i}`, value: o, text: { type: "plain_text", text: o } })) },
    ],
  });
  line(p.ok, "chat.postMessage", p.ok ? `投稿した（ts=${p.ts}）` : `${p.error} — ${HINT[p.error] ?? ""}`);
  if (!p.ok) fatal++;
  else {
    const c = await call("apps.connections.open", APP);
    const ws = new WebSocket(c.url);
    console.log("     Slack でボタンを押してください（60 秒待つ）…");
    const got = await new Promise((res) => {
      const t = setTimeout(() => res(null), 60000);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (!m.envelope_id) return;
        // ⚠ 3 秒以内に ack しないと Slack が同じものを送り直す
        ws.send(JSON.stringify({ envelope_id: m.envelope_id }));
        const act = m.payload?.actions?.[0];
        // ⚠ 自分が出したメッセージへの反応だけを見る
        // ⚠ 誰が押したかは見ない（名前を出力に混ぜない）
        if (act && m.payload?.message?.ts === p.ts) { clearTimeout(t); res({ act }); }
      };
      ws.onerror = () => { clearTimeout(t); res(null); };
    });
    ws.close();
    line(!!got, "ボタンの反応が届く",
      got ? `「${got.act.value}」が押された` : "⚠ 60 秒待っても届かない（Interactivity が OFF の可能性）");
    if (!got) fatal++;
    // ⚠ 私が出した選択肢と一致するものだけを答えとして採る
    if (got) line(OPTS.includes(got.act.value), "押された値が、出した選択肢と一致する",
      OPTS.includes(got.act.value) ? "一致" : "⚠ 一致しない（答えとして採らない）");
  }
} else if (process.argv.includes("--post")) {
  console.log("\n\x1b[1m4.\x1b[0m — 3 つ揃っていないので投稿は試さない");
}

// ⚠ 自由文をどう受けるか。**スレッドの返信を読むのではなく、モーダルで受けられるか**を測る。
//   スレッドを読むには channels:history が要る＝**そのチャンネルの全発言が届く**ようになる。
//   モーダルなら、押した本人が・こちらの問いに対してだけ書いたものが、それだけ届く。
//   ⚠ 追加のスコープが要るかどうかは、書かずに**叩いて確かめる**。
if (process.argv.includes("--modal") && BOT && CH && APP) {
  console.log("\n\x1b[1m5. 自由文をモーダルで受けられるか\x1b[0m（⚠ 実際に 1 通投稿する）");
  const p2 = await call("chat.postMessage", BOT, {
    channel: CH,
    text: "（見本）自由文の受け取りを試します",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*（見本）自由に書けますか？*" } },
      { type: "actions", elements: [
        { type: "button", action_id: "doctor_free", value: "__free__",
          text: { type: "plain_text", text: "自由に書く" } }] },
    ],
  });
  line(p2.ok, "chat.postMessage", p2.ok ? `投稿した（ts=${p2.ts}）` : `${p2.error} — ${HINT[p2.error] ?? ""}`);
  if (!p2.ok) fatal++;
  else {
    const c2 = await call("apps.connections.open", APP);
    const ws2 = new WebSocket(c2.url);
    console.log("     「自由に書く」を押して、出てきた枠に何か書いて送ってください（90 秒待つ）…");
    const out = await new Promise((res) => {
      const t = setTimeout(() => res({ err: "時間切れ" }), 90000);
      ws2.onmessage = async (e) => {
        const m = JSON.parse(e.data);
        if (!m.envelope_id) return;
        const pl = m.payload;
        // ① ボタンが押された → その場でモーダルを開く（trigger_id は 3 秒で失効する）
        if (pl?.type === "block_actions" && pl.message?.ts === p2.ts) {
          ws2.send(JSON.stringify({ envelope_id: m.envelope_id }));
          const v = await call("views.open", BOT, {
            trigger_id: pl.trigger_id,
            view: { type: "modal", callback_id: "doctor_modal",
              title: { type: "plain_text", text: "自由に書く" },
              submit: { type: "plain_text", text: "送る" },
              blocks: [{ type: "input", block_id: "b", label: { type: "plain_text", text: "答え" },
                element: { type: "plain_text_input", action_id: "a", multiline: true } }] },
          });
          if (!v.ok) { clearTimeout(t); res({ err: `views.open: ${v.error}` }); }
          return;
        }
        // ② モーダルが送信された
        if (pl?.type === "view_submission" && pl.view?.callback_id === "doctor_modal") {
          ws2.send(JSON.stringify({ envelope_id: m.envelope_id, payload: { response_action: "clear" } }));
          clearTimeout(t);
          res({ text: pl.view.state.values.b.a.value });
          return;
        }
        ws2.send(JSON.stringify({ envelope_id: m.envelope_id }));
      };
      ws2.onerror = () => { clearTimeout(t); res({ err: "WebSocket が切れた" }); };
    });
    ws2.close();
    line(!out.err, "モーダルで自由文を受け取れる",
      out.err ? `⚠ ${out.err}` : `${out.text.length} 文字書かれた: 「${out.text.slice(0, 40)}」`);
    if (out.err) fatal++;
    else line(true, "⚠ 追加のスコープは要らなかった", "chat:write だけでモーダルが開いた");
  }
}

console.log(fatal ? `\n\x1b[31m${fatal} 件つまずいている\x1b[0m\n` : "\n\x1b[32m通った\x1b[0m\n");
process.exit(0);
