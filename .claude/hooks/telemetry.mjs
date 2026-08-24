#!/usr/bin/env node
// AI へ渡した Task が、いつ始まり、どう終わったかを、あとから追えるようにする（Phase 1）。
//
// ⚠ **これは「採点」ではない。**⚠ **観測だけ。**成功・失敗の判定は一切しない
//   （`docs/adr/0035-開発の計測は配信の計測と分けてGitの外に置く.md`）。
//
// ⚠ **Session ≠ Task。**1 つの Task が複数 Turn・複数 Session にまたがる。
//
//     Task
//      └─ Claude Code Session
//           ├─ UserPromptSubmit   … Turn の始まり
//           └─ Stop               … Turn の終わり
//
// ⚠ **配信の計測（D1 の tick / health）とは別もの。**あちらは利用者の匿名イベント、
//   こちらは**手元の開発の記録**。⚠ **外へ 1 バイトも送らない。**⚠ **git にも入れない。**
//
// ⚠ **作業を止めないことが最優先。**`UserPromptSubmit` と `Stop` は
//   **exit 2 で止まる Hook**（前者はプロンプトごと消える／後者は終われなくなる）。
//   ⚠ **何が起きても exit 0。**計測が取れないことより、作業が止まることのほうが悪い。
//
// ⚠ **stdout へ 1 文字も出さない。**`UserPromptSubmit` の stdout は
//   **Claude への追加文脈として読まれる**。計測が会話へ混ざる。
//   ⚠ 困ったことは stderr へ。
//
// ## 何を記録して、何を記録しないか
//
// ⚠ **中身は持たない。**Task を識別するのに要らないので、次は**書かない**。
//
//     プロンプト本文          最後の返答本文        transcript の中身と場所
//     cwd / 環境変数          ツールの入出力        トークン数・費用
//     本文のハッシュ          人の名前              秘密（API Key / token / password）
//
// ⚠ **本文の代わりに `prompt_id` を使う**（Claude Code が振る UUID）。
//   ⚠ **本文を 1 文字も持たずに、同じプロンプトの始まりと終わりを結べる。**
//   ⚠ **長さ（文字数）だけは残す。**あとで「長い依頼ほど Turn が増えるか」を見るため。
//
// ## 置き場所
//
//     .claude/telemetry/events.jsonl   1 イベント 1 行（生）
//     .claude/telemetry/tasks.jsonl    Task ごとの控え（Stop のたびに 1 行追記）
//     .claude/telemetry/state.json     いま開いている Task の索引（次の Turn を結ぶため）
//
// ⚠ **`tasks.jsonl` は追記だけ。**⚠ **同じ task_id の行が何度も出る。**
//   ⚠ **読むときは、その task_id の最後の行を採る**（追記なら壊れないため。書き換えない）。
//
// ⚠ **`KONJAKU_TELEMETRY_DIR` で書き先を変えられる。**検査が本物を汚さずに通しで試すため。
//
// ## Task ID
//
// ⚠ **人に入力させない。**⚠ **プロンプトから読み取れるものだけで決める。**
//
//     issue が読み取れた   →  その issue が Task（⚠ **Session をまたいでも同じ Task**）
//     読み取れない         →  その Session の「issue に紐づかない連続した Turn」を 1 Task
//
// ⚠ **後者は推定。**⚠ **本当に同じ作業かは観測していない。**
//   だから `grouping` に何を根拠にまとめたかを必ず書く（`issue` / `session`）。
//   ⚠ **この欄を消すと、推定が実測の顔をする**（`CLAUDE.md` §1）。
//
// ## 手元での試し方（⚠ 本物を汚さない）
//
//   D=$(mktemp -d)
//   echo '{"hook_event_name":"UserPromptSubmit","session_id":"s1","prompt_id":"p1","prompt":"こんにちは"}' \
//     | KONJAKU_TELEMETRY_DIR=$D node .claude/hooks/telemetry.mjs; echo "exit=$?"
//   echo '{"hook_event_name":"Stop","session_id":"s1","prompt_id":"p1","last_assistant_message":"はい"}' \
//     | KONJAKU_TELEMETRY_DIR=$D node .claude/hooks/telemetry.mjs; echo "exit=$?"
//   cat $D/events.jsonl $D/tasks.jsonl
//
//   # ⚠ せき止めないことを確かめる（全部 0 で終わり、stdout が空であること）
//   echo 'これは JSON ではない'   | node .claude/hooks/telemetry.mjs; echo "exit=$?"
//   printf ''                     | node .claude/hooks/telemetry.mjs; echo "exit=$?"
import { appendFileSync, mkdirSync, rmdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const LOCK_MS = 300;      // ⚠ 索引の取り合いを待つ上限。⚠ **超えたら鍵無しで進む**（止めない）
const KEEP_TASKS = 500;   // ⚠ 索引に残す Task の数。⚠ 古いものから落とす（際限なく太らせない）
const STALE_MS = 10_000;  // ⚠ これより古い鍵は、⚠ 持ち主が殺されたものとみなして外す

// ⚠ **何が起きても 0 で終わる。**⚠ stdout へは出さない（会話へ混ざる）
const bail = (why) => { if (why) process.stderr.write(`telemetry: ${why}\n`); process.exit(0); };

try {
  const IN = JSON.parse(readFileSync(0, "utf8") || "{}");
  const event = IN.hook_event_name;
  // ⚠ 見るのは 2 つだけ。ほかの Hook に相乗りしても何もしない
  if (event !== "UserPromptSubmit" && event !== "Stop") bail();
  // ⚠ **部分エージェントの中は数えない。**Task の単位が違う（親の 1 Turn の内側）
  if (IN.agent_id) bail();
  const sid = String(IN.session_id ?? "").trim();
  if (!sid) bail("session_id が無い");

  const ROOT = process.env.CLAUDE_PROJECT_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const DIR = process.env.KONJAKU_TELEMETRY_DIR ?? join(ROOT, ".claude", "telemetry");
  mkdirSync(DIR, { recursive: true });

  // ---- 時刻（地方時のオフセット付き。UTC へ寄せない＝いつ作業したかが読める） ----
  const stamp = () => {
    const d = new Date(), off = -d.getTimezoneOffset(), s = off < 0 ? "-" : "+";
    const p = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
    return new Date(d.getTime() + off * 60000).toISOString().slice(0, 19)
      + `${s}${p(off / 60)}:${p(off % 60)}`;
  };
  const ts = stamp();

  // ---- Task の見分け（⚠ **プロンプトから読み取れるものだけ**） ----
  // ⚠ **裸の番号は、移行すると別の Issue を指す**（`CLAUDE.md` §9）。
  //   ⚠ **だから記録には必ずリポジトリ名を付ける。**付けられないときだけ番号のまま残す。
  const repoOf = () => {
    try {
      const url = execFileSync("git", ["config", "--get", "remote.origin.url"],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const m = /(?:[:/])([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
      return m ? `${m[1]}/${m[2]}` : null;
    } catch { return null; }
  };
  const issueOf = (text) => {
    const q = /([\w.-]+\/[\w.-]+)#(\d+)/.exec(text);       // owner/repo#N ならそのまま
    if (q) return `${q[1]}#${q[2]}`;
    const b = /(?:^|[^\w#])#(\d+)\b/.exec(text);           // 裸の #N は repo を足して名前つきに
    if (!b) return null;
    const repo = repoOf();
    return repo ? `${repo}#${b[1]}` : `#${b[1]}`;
  };
  // ⚠ **Skill の名前が書かれていたら、それを採る。**⚠ 書かれていなければ issue の有無で決める。
  //   ⚠ **これは字面の判定。**⚠ 実際にその Skill が走ったかは見ていない。
  const typeOf = (text, issue) => {
    if (/issue-ready/.test(text)) return "issue_refine";
    if (/loop-controller|issue-work/.test(text) || issue) return "issue_execute";
    return "prompt";
  };

  // ---- 索引（⚠ **取り合うので、鍵を取ってから読み書きする**） ----
  const STATE = join(DIR, "state.json");
  const LOCK = join(DIR, ".lock");
  const nap = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };
  const withLock = (fn) => {
    let held = false;
    for (const until = Date.now() + LOCK_MS; Date.now() < until;) {
      try { mkdirSync(LOCK); held = true; break; } catch { nap(20); }
      // ⚠ **鍵の取り残しを、⚠ 永久に引きずらない。**⚠ この Hook は timeout で殺されうる
      //   （⚠ `settings.json` の 5 秒）。⚠ **殺された回の鍵が残ると、⚠ 以後の全部が
      //   ⚠ 上限まで待たされたうえ、⚠ 鍵無しで書く**（＝取り合いが常態になる）。
      try { if (Date.now() - statSync(LOCK).mtimeMs > STALE_MS) rmdirSync(LOCK); } catch {}
    }
    // ⚠ **取れなくても進む。**⚠ 取り合いで Turn を 1 つ数え損ねるより、止まるほうが悪い
    try { return fn(); } finally { if (held) { try { rmdirSync(LOCK); } catch {} } }
  };
  const readState = () => {
    try {
      const j = JSON.parse(readFileSync(STATE, "utf8"));
      return { version: 1, sessions: j.sessions ?? {}, tasks: j.tasks ?? {} };
    } catch { return { version: 1, sessions: {}, tasks: {} }; }   // ⚠ 壊れていても作業を止めない
  };
  const writeState = (st) => {
    // ⚠ 際限なく太らせない。⚠ **新しいほうから KEEP_TASKS 件だけ残す**
    const keys = Object.keys(st.tasks)
      .sort((a, b) => String(st.tasks[b].started_at).localeCompare(String(st.tasks[a].started_at)))
      .slice(0, KEEP_TASKS);
    const tasks = {};
    for (const k of keys) tasks[k] = st.tasks[k];
    const sessions = {};
    for (const [s, k] of Object.entries(st.sessions)) if (tasks[k]) sessions[s] = k;
    // ⚠ **書きかけを読ませない**（別の Session が同時に読む）。⚠ 先に書いてから置き換える
    const tmp = `${STATE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, sessions, tasks }));
    renameSync(tmp, STATE);
  };
  const put = (file, rec) => appendFileSync(join(DIR, file), `${JSON.stringify(rec)}\n`);

  const newTaskId = () => `T-${ts.slice(0, 19).replace(/[-:T]/g, "")}-`
    + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");

  if (event === "UserPromptSubmit") {
    // ⚠ **本文はここでしか触らない。**⚠ 読み取ったら捨てる。⚠ 記録に載せない
    const text = String(IN.prompt ?? "");
    const chars = text.length;
    const issue = issueOf(text);
    const task_type = typeOf(text, issue);
    const grouping = issue ? "issue" : "session";
    const key = issue ? `${task_type}:${issue}` : `${task_type}:session:${sid}`;

    const rec = withLock(() => {
      const st = readState();
      const t = st.tasks[key] ?? {
        task_id: newTaskId(), task_type, grouping, issue,
        started_at: ts, ended_at: null, session_ids: [], turns: 0, result: "unknown",
      };
      t.turns += 1;
      if (!t.session_ids.includes(sid)) t.session_ids.push(sid);
      st.tasks[key] = t;
      st.sessions[sid] = key;
      writeState(st);
      return t;
    });

    put("events.jsonl", {
      ts, event, session_id: sid, prompt_id: IN.prompt_id ?? null,
      task_id: rec.task_id, task_type, issue, turn: rec.turns,
      permission_mode: IN.permission_mode ?? null,
      prompt_chars: chars,     // ⚠ **長さだけ。**⚠ 本文もハッシュも持たない
    });
    bail();
  }

  // ---- Stop ----
  // ⚠ **観測できたのは「Turn が終わった」ことだけ。**⚠ **やり遂げたかは見ていない。**
  //   ⚠ だから `result` は `unknown` のまま動かさない（Phase 1 では採点しない）。
  const reply = String(IN.last_assistant_message ?? "");
  const snap = withLock(() => {
    const st = readState();
    const key = st.sessions[sid];
    const t = key ? st.tasks[key] : null;
    // ⚠ **知らない Session の Stop は、Task に結ばない**（途中から計測を入れたときに起きる）。
    //   ⚠ **無理に結ぶと、⚠ 始まりを見ていない Task を「見た」ことにしてしまう**
    if (!t) return null;
    t.ended_at = ts;
    writeState(st);
    return t;
  });

  put("events.jsonl", {
    ts, event, session_id: sid, prompt_id: IN.prompt_id ?? null,
    task_id: snap?.task_id ?? null, turn: snap?.turns ?? null,
    permission_mode: IN.permission_mode ?? null,
    effort: IN.effort?.level ?? null,
    stop_hook_active: IN.stop_hook_active ?? null,
    reply_chars: reply.length,   // ⚠ **長さだけ。**⚠ 返答の本文は持たない
  });
  // ⚠ **追記だけ。**⚠ 同じ task_id が何度も出る。⚠ **読むときは最後の行を採る**
  if (snap) put("tasks.jsonl", {
    ts, task_id: snap.task_id, task_type: snap.task_type, grouping: snap.grouping,
    issue: snap.issue, started_at: snap.started_at, ended_at: snap.ended_at,
    session_ids: snap.session_ids, turns: snap.turns,
    result: snap.result,   // ⚠ **常に unknown。**⚠ 採点していないので、それ以外を書かない
  });
} catch (e) {
  bail(e?.message ?? String(e));
}
process.exit(0);
