#!/usr/bin/env node
// 人の判断が要るとき（AskUserQuestion）に、Slack で聞いて、答えを受け取る。
//
// ⚠ **これは「通知」ではなく「往復」。** 通知だけだった notify-slack.sh を置き換える。
//   どこで聞くかの線引きは CLAUDE.md §7-1。ここには書かない（仕様を 2 か所に持たない）。
//
// ⚠ **人に聞けなくなることだけは、絶対に避ける。**
//   PreToolUse の Hook が 0 以外で終わると、その道具の呼び出しごと止まる。
//   トークンが無い・Slack が落ちている・時間切れ・こちらのバグ、どれでも
//   「聞けない」になってはいけない。→ **何が起きても exit 0**。
//   答えが取れなかったときは何も出さない＝いつもどおり端末で聞く形に落ちる。
//
// ⚠ **待つのは上限つき。** 既定 3 分。Hook 自体の既定 timeout は 600 秒なので、その内側。
//
// 受け取り方は 2 つ。**どちらもチャンネルにいる人しか触れない**ので、
// 誰が答えられるかは Slack のチャンネル設定で決める（こちらに許可リストを持たない）。
//
//   ボタン       … こちらが出した選択肢と**一致するときだけ**採る
//   ✎ 自由に書く … モーダルで受ける（端末側の「Other」と同じことができる）
//
// ⚠ **スレッドへの直接の返信は読まない。** 読むには channels:history / groups:history が要り、
//   そのチャンネルの発言が全部 bot に届く。答えを 1 つ受け取るために全部を読まない。
//   ⚠ 読まない以上、書かれても気づけない。だから**時間切れのときはスレッドに一言返す**
//     （黙って無視しない。書いた人が「届いていない」と分かるように）。
//
// 要るもの（環境変数。無ければ この repo の .envrc / .env の**その行だけ**）:
//   SLACK_APP_TOKEN   xapp-…  Socket Mode（connections:write）
//   SLACK_BOT_TOKEN   xoxb-…  投稿とモーダル（chat:write）
//   SLACK_CHANNEL_ID  C…      投げ先
//
// ⚠ 要るスコープは chat:write と connections:write の 2 つだけ（2026-08-18 に実測）。
//   履歴もチャンネル情報も読まない。プライベートチャンネルでも通ることを確かめてある。
// ⚠ Incoming Webhook はもう使わない。chat.postMessage が上位互換で、
//   2 つ持つと Slack へ出す口が 2 か所になる（掟: 同じ問いに答える実装を2つ持たない）。
//
// 手元での試し方:
//   node .claude/hooks/slack-doctor.mjs                  設定を見る（何も投稿しない）
//   node .claude/hooks/slack-doctor.mjs --post --modal    ボタンとモーダルを実地で試す
//
//   # ⚠ Hook として通しで試す（実際に Slack へ 1 通出て、3 分待つ）
//   echo '{"tool_name":"AskUserQuestion","cwd":"'"$PWD"'","session_id":"t","tool_input":{"questions":[
//     {"question":"どちらにしますか？","header":"方針","options":[{"label":"案A"},{"label":"案B"}]}]}}' \
//     | node .claude/hooks/ask-slack.mjs; echo "exit=$?"
//
//   # ⚠ せき止めないことを確かめる（全部 0 で終わり、何も出さないこと）
//   echo 'これは JSON ではない'          | node .claude/hooks/ask-slack.mjs; echo "exit=$?"
//   echo '{"tool_name":"Bash"}'          | node .claude/hooks/ask-slack.mjs; echo "exit=$?"
//   printf ''                            | node .claude/hooks/ask-slack.mjs; echo "exit=$?"
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WAIT_MS = 180_000;          // ⚠ 上限。これを超えて待たない
const bail = (why) => { if (why) process.stderr.write(`ask-slack: ${why}\n`); process.exit(0); };

// ---- ⚠ 人に聞いたことを、⚠ 1 行だけ残す（hidetzu/konjaku#367。ADR 0044）----
//
// ⚠ **中身は持たない。**⚠ **問いの本文も、⚠ 答えの本文も、⚠ 誰が答えたかも書かない**
//   （⚠ `telemetry.mjs` と同じ約束。⚠ **記録に人名や本文を散らさない**）。
//
// ⚠ **残すのは「往復があったこと」と「どう終わったか」だけ。**
//
//     questions   ⚠ いくつ聞いたか
//     options     ⚠ 選択肢の数（⚠ 0 なら自由記述だけ）
//     outcome     answered ／ free_text ／ timeout ／ unavailable
//     waited_ms   ⚠ 実際に待った時間
//
// ⚠ **落ちても、⚠ 質問はせき止めない。**⚠ **この関数は絶対に投げない。**
//   ⚠ **この Hook の筆頭の約束は「人に聞けなくなることだけは避ける」**（⚠ 上のコメント）。
const note = (sid, rec) => {
  try {
    const { telemetryDir } = mod ?? {};
    if (!telemetryDir) return;
    const dir = telemetryDir();
    // ⚠ **作らない。**⚠ **既にあるときだけ書く**（2026-08-28。⚠ 実際に固まった）。
    //   ⚠ **`mkdirSync` は、⚠ 書けない場所（`/proc/…`）で返ってこないことがある**
    //     （⚠ 実測: ⚠ 20 秒で終わらず、⚠ **質問ごと止まった**）。
    //   ⚠ **記録のために質問を止めない**（⚠ この Hook の筆頭の約束）。
    //   ⚠ **置き場は `telemetry.mjs` が作る。**⚠ **こちらは相乗りするだけ。**
    if (!existsSync(dir)) return;
    // ⚠ **どの Issue の作業中に聞いたか。**⚠ **`telemetry.mjs` が Session → Task を持っている。**
    //   ⚠ **こちらは読むだけ。**⚠ **書かない**（⚠ 書くと、⚠ 2 か所が同じ表を書くことになる）。
    //   ⚠ **読めなければ `null`。**⚠ **`null` を 0 と読ませない**（⚠ 分からない、という意味）。
    let issue = null;
    try {
      const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
      const key = sid ? st?.sessions?.[sid] : null;
      issue = key ? (st?.tasks?.[key]?.issue ?? null) : null;
    } catch { /* ⚠ 無いのが普通（⚠ Issue の作業でないとき） */ }
    // ⚠ **`session_id` を残す**（2026-09-05。hidetzu/konjaku#471）。
    //   ⚠ **これが無いと、⚠ どの Task の途中で聞いたかを結べない。**
    //   ⚠ **前は `issue` だけだった。**⚠ **Issue に紐づかない Task では、⚠ 結べなかった。**
    //   ⚠ **人の名前や答えの中身は、⚠ 変わらず持たない。**
    appendFileSync(join(dir, "events.jsonl"),
      `${JSON.stringify({ ts: new Date().toISOString(), event: "OwnerAsk",
                          session_id: sid ?? null, issue, ...rec })}\n`);
  } catch { /* ⚠ 記録が取れないことより、⚠ 聞けなくなることのほうが悪い */ }
};
let mod = null;
try { mod = await import("../telemetry-dir.mjs"); } catch { /* ⚠ 同上 */ }

// ⚠ **Slack に出す見た目は `ask-slack-view.mjs` の 1 か所。**⚠ **ここでは持たない。**
//   ⚠ **あちらは何も送らないので、⚠ 検査が Slack へ 1 通も出さずに確かめられる。**
import { 時間切れの見た目, 聞くときの見た目, optionsOf, FREE } from "./ask-slack-view.mjs";


try {
  const INPUT = JSON.parse(readFileSync(0, "utf8") || "{}");
  // ⚠ 対象は AskUserQuestion だけ。ほかの道具で止まらない
  if (INPUT.tool_name && INPUT.tool_name !== "AskUserQuestion") bail();
  const questions = INPUT.tool_input?.questions ?? [];
  if (!questions.length) bail("質問が無い");

  const ROOT = process.env.CLAUDE_PROJECT_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  // ⚠ source しない。.envrc は任意のシェルコードで、読み込めば何でも走る
  const fromFile = (name) => {
    for (const f of [join(ROOT, ".envrc"), join(ROOT, ".env")]) {
      if (!existsSync(f)) continue;
      // ⚠ 水平方向の空白だけ（[ \t]。\s ではない）。⚠ \s は改行を跨ぐので、値が空の代入
      //   （NAME=）だと次の非空行を値として拾ってしまう。⚠ 「未設定」が「別物が設定済み」
      //   と読まれ、ターミナルへのフォールバックが発火しない。
      const m = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*([^\\n]*)$`, "m").exec(readFileSync(f, "utf8"));
      if (!m) continue;
      let v = m[1].trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, "");
      if (v) return v;
    }
    return null;
  };
  const env = (n) => process.env[n] || fromFile(n);
  const APP = env("SLACK_APP_TOKEN"), BOT = env("SLACK_BOT_TOKEN"), CH = env("SLACK_CHANNEL_ID");
  if (!APP || !BOT || !CH) { note(INPUT.session_id, { questions: questions.length, options: 0, outcome: "unavailable", waited_ms: 0 });
    bail("Slack の設定が無いので、端末で聞く"); }

  // どこで作業しているか。⚠ 毎回 cwd から出す（固定で持つと別の clone で嘘になる）
  const CWD = INPUT.cwd ?? "";
  let PROJECT = basename(CWD || "unknown");
  try {
    const top = execFileSync("git", ["-C", CWD, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (top) { const rel = CWD.slice(top.length).replace(/^\//, ""); PROJECT = basename(top) + (rel ? ` / ${rel}` : ""); }
  } catch { /* git が無い・repo でない。basename のまま */ }

  const head = `🤖 *Claude Code が判断待ちです*  \`${PROJECT}\``;
  const plain = questions.map((q, i) => `${i + 1}. ${q.question ?? ""}`).join("\n");

  const api = async (method, token, payload) => {
    const r = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    return r.json();
  };

  // ---- 質問ごとに、選択肢のボタンと「✎ 自由に書く」を並べる ----
  // ⚠ **見た目は ask-slack-view.mjs の 1 か所。**⚠ ここでは持たない。
  //   ⚠ **あちらは何も送らないので、⚠ 検査が Slack へ 1 通も出さずに確かめられる。**
  const blocks = 聞くときの見た目(head, questions);

  const post = await api("chat.postMessage", BOT, { channel: CH, text: `${head}\n${plain}`, blocks });
  if (!post.ok) { note(INPUT.session_id, { questions: questions.length, options: 0, outcome: "unavailable", waited_ms: 0 });
    bail(`投稿できなかった（${post.error}）ので、端末で聞く`); }

  const conn = await api("apps.connections.open", APP);
  if (!conn.ok) { note(INPUT.session_id, { questions: questions.length, options: 0, outcome: "unavailable", waited_ms: 0 });
    bail(`Socket Mode に繋げなかった（${conn.error}）ので、端末で聞く`); }
  const askedAt = Date.now();
  const optionCount = questions.reduce((n, q) => n + optionsOf(q).length, 0);

  // ---- 上限つきで待つ ----
  const answers = new Array(questions.length).fill(null);
  const ws = new WebSocket(conn.url);
  const result = await new Promise((done) => {
    const timer = setTimeout(() => done(null), WAIT_MS);
    const finish = (v) => { clearTimeout(timer); done(v); };
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
    ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m.envelope_id) return;
      const pl = m.payload;
      // ⚠ 3 秒以内に ack しないと Slack が同じものを送り直す。判断より先に返す
      const ack = (payload) => ws.send(JSON.stringify({ envelope_id: m.envelope_id, ...(payload ? { payload } : {}) }));

      if (pl?.type === "block_actions" && pl.message?.ts === post.ts) {
        ack();
        const act = pl.actions?.[0];
        const [qi, oi] = String(act?.value ?? "").split(":");
        const q = questions[Number(qi)];
        if (!q) return;
        if (oi === FREE) {
          // ⚠ trigger_id は 3 秒で失効する。ack の直後に開く
          const v = await api("views.open", BOT, {
            trigger_id: pl.trigger_id,
            view: { type: "modal", callback_id: `ask_${qi}`,
              private_metadata: String(qi),
              title: { type: "plain_text", text: "自由に書く" },
              submit: { type: "plain_text", text: "送る" },
              blocks: [{ type: "input", block_id: "b",
                label: { type: "plain_text", text: (q.question ?? "").slice(0, 2000) },
                element: { type: "plain_text_input", action_id: "a", multiline: true } }] },
          });
          if (!v.ok) process.stderr.write(`ask-slack: モーダルを開けなかった（${v.error}）\n`);
          return;
        }
        // ⚠ こちらが出した選択肢と一致するときだけ採る
        const label = optionsOf(q)[Number(oi)];
        if (label == null) return;
        answers[Number(qi)] = label;
        if (answers.every((a) => a !== null)) finish(answers);
        return;
      }

      if (pl?.type === "view_submission" && /^ask_\d+$/.test(pl.view?.callback_id ?? "")) {
        ack({ response_action: "clear" });
        const qi = Number(pl.view.private_metadata);
        const text = pl.view.state?.values?.b?.a?.value ?? "";
        if (!questions[qi] || !text.trim()) return;
        answers[qi] = text.trim();
        if (answers.every((a) => a !== null)) finish(answers);
        return;
      }
      ack();
    };
  });
  try { ws.close(); } catch { /* 閉じられなくても、もう関係ない */ }

  // ---- 時間切れ。⚠ 黙って放置しない。書いた人に「届いていない」を伝える ----
  //
  // ⚠ **押しても効かないボタンを、⚠ 残したままにしない**（ADR 0026）。
  //   ⚠ **実測（2026-08-28〜2026-09-04・65 件）**: ⚠ **26 件（40%）が時間切れだった。**
  //   ⚠ **その 26 件ぶん、⚠ 押しても何も起きないボタンが Slack に残り続けていた。**
  //   ⚠ **待ち受けはもう閉じているので、⚠ 押しても本当に何も起きない。**
  //
  // ⚠ **スレッドへの投稿はやめ、⚠ 元の投稿を書き換える。**
  //   ⚠ **同じことを 2 か所に出さない。**⚠ **通知も増やさない**（`chat.update` は鳴らない）。
  //   ⚠ **終わった話を、⚠ あとから鳴らして知らせても、⚠ できることが無い。**
  if (!result) {
    await api("chat.update", BOT, { channel: CH, ts: post.ts,
      text: `${head}\n${plain}`, blocks: 時間切れの見た目(head, questions),
    }).catch(() => {});
    note(INPUT.session_id, { questions: questions.length, options: optionCount, outcome: "timeout",
           waited_ms: Date.now() - askedAt });
    bail("時間切れ。端末で聞く");
  }

  // ---- 答えを Claude へ返す ----
  // ⚠ 押したあとのメッセージを、押せる顔のままにしない（二度押しと勘違いを防ぐ）
  await api("chat.update", BOT, { channel: CH, ts: post.ts,
    text: `${head}\n${plain}`,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: head } },
      ...questions.map((q, i) => ({ type: "section", text: { type: "mrkdwn",
        text: `*${q.question ?? ""}*\n→ ${result[i]}` } })),
      { type: "context", elements: [{ type: "mrkdwn", text: "✅ 回答ずみ" }] }],
  }).catch(() => {});

  // ⚠ **ボタンで選んだのか、⚠ 自由に書いたのか**（⚠ 選択肢に無い答えなら自由記述）
  const free = result.some((r, i) => !optionsOf(questions[i]).includes(r));
  note(INPUT.session_id, { questions: questions.length, options: optionCount,
         outcome: free ? "free_text" : "answered", waited_ms: Date.now() - askedAt });

  const said = questions.map((q, i) => `・${q.question ?? ""} → ${result[i]}`).join("\n");
  // ⚠ **同じ問いをもう一度出させない。**そう書かないと、この道具を呼び直して堂々巡りになる
  // ⚠ **誰が答えたかは載せない。** 答えの中身だけを返す。
  //   名前や id を混ぜると、記録（transcript・ログ・PR 本文）に人名が散る。
  //   ⚠ 答えの正しさに、誰が押したかは関係ない。要るなら Slack 側を見ればよい。
  const reason = `Slack で回答がありました。\n${said}\n`
    + `これを利用者の回答として扱い、AskUserQuestion を呼び直さずに続けること。`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",       // ⚠ 道具は動かさない。理由（＝答え）だけを返す
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
} catch (e) {
  // ⚠ 何が起きても、質問はせき止めない
  bail(`落ちたので端末で聞く（${e?.message ?? e}）`);
}
