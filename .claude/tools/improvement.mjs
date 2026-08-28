// 開発の摩擦を並べて、⚠ **仕組みの改善候補**を出す（Improvement v1）。
//
// ⚠ **これは「採点」ではない**（`docs/adr/0036`）。⚠ **Eval とも別**。
//
//     Telemetry     ⚠ 何が起きたかを記録する（⚠ 書く）
//     Eval          ⚠ 観測した事実を比べられる形に並べる（⚠ Task 単位）
//     Improvement   ⚠ 複数の結果から、⚠ **仕組みをどう直せるか**を出す（⚠ これ）
//
// ⚠ **読むだけ。**⚠ **`events.jsonl` にも `tasks.jsonl` にも 1 バイトも書かない。**
// ⚠ **Issue も作らない。**⚠ **候補を出すところまで**（⚠ 作るかは人が決める）。
//
// ## 使い方
//
//   node .claude/tools/improvement.mjs                # ⚠ 改善候補を出す（⚠ 複数 Issue をまたぐ）
//   node .claude/tools/improvement.mjs --issue=277     # ⚠ **1 件の結果**を出す（Issue Result）
//   node .claude/tools/improvement.mjs --json
//   node .claude/tools/improvement.mjs --no-github     # ⚠ 手元の記録だけで見る
//   node .claude/tools/improvement.mjs --issues-file=… # ⚠ **検査用**（⚠ gh の代わりに読む）
//
// ## ⚠ どこから来た数字かを、⚠ 必ず名乗る
//
//     [記録]    ⚠ .claude/telemetry/（⚠ 手元。⚠ git に入らない）
//     [GitHub]  ⚠ gh で読む（⚠ Issue / PR。⚠ 公開されているもの）
//
// ⚠ **混ぜない。**⚠ **分母が違う数字を並べない**（`CLAUDE.md` §6）。
//
// ## ⚠ 観測していないもの（⚠ 候補の根拠にしない）
//
//     誰が答えたか ／ 問いと答えの本文 ／ approval か否か
//     Skill の判定（Verify / Review / Human Decision）
//     Task の結末（⚠ merged / stopped。⚠ ADR 0035・0036 が採点しないと決めている）
//
// ⚠ **足りないものは「観測していない」と書く。**⚠ **推し量って埋めない。**

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { telemetryDir } from "../telemetry-dir.mjs";

const JSON_OUT = process.argv.includes("--json");
const NO_GH = process.argv.includes("--no-github");
const SELFTEST = process.argv.includes("--selftest");
const ONE = (() => {
  const a = process.argv.find((x) => x.startsWith("--issue="));
  return a ? Number(a.slice(8)) : null;
})();

// ---- ⚠ 判定（⚠ **本体も自己検査も、⚠ ここだけを呼ぶ**）----
//
// ⚠ **写して 2 つ持たない**（`CLAUDE.md` §3）。⚠ **実際に踏んだ**（2026-08-28）:
// ⚠ **自己検査に判定を写していたので、⚠ 本体を壊しても素通りした。**
//
// ⚠ **① 題名だけを見る。**⚠ 本文を含めると当たりが 3〜5 倍に膨らむ
// ⚠ （⚠ 実測 2026-08-28・全 95 件。⚠ **Issue の本文が `CLAUDE.md` の掟を引用している**ため）:
//
//     初期画面に収まるか   ⚠ 題名 4 件  →  題名+本文 21 件
//     色・コントラスト     ⚠ 題名 4 件  →  題名+本文  9 件
//     同じことを 2 か所    ⚠ 題名 8 件  →  題名+本文 31 件
//
// ⚠ **膨らんだぶんは「その話をした Issue」であって、⚠ 「その摩擦が起きた Issue」ではない。**
//
// ⚠ **② 改善 Issue 自身を、⚠ 根拠に数えない。**⚠ **実際に踏んだ**:
// ⚠ **`[AI workflow] 「初期画面に収まるか」…` を置いたら、⚠ 根拠が 4 → 5 件に増えた。**
// ⚠ **放っておくと、⚠ 摩擦が起きていないのに件数だけ増える。**

// ⚠ **改善 Issue の題名の頭。**⚠ **自分の出力を、⚠ 自分の根拠に混ぜないための目印**でもある。
const AI_TAG = "[AI workflow]";

const isImprovementIssue = (i) => i.title.startsWith(AI_TAG);

/** ⚠ **摩擦の根拠になる Issue**（⚠ 題名だけを見る。⚠ 改善 Issue 自身は外す） */
const evidenceIssues = (issues, re) =>
  issues.filter((i) => !isImprovementIssue(i) && re.test(i.title));

/** ⚠ **同じテーマの改善 Issue が既にあるか**（⚠ あれば新しく作らない。⚠ 指示書 §7） */
const existingImprovement = (issues, theme) =>
  theme ? issues.filter((i) => isImprovementIssue(i) && i.title.includes(theme)) : [];

// ---- ⚠ 自己検査（`--selftest`）----
//
// ⚠ **この道具は落ちない**（⚠ 検査ではない。⚠ 候補を出すだけ）。
// ⚠ **落ちないぶん、⚠ 壊れても気づけない。**⚠ **`visual-decision.mjs` と同じ形で置く。**
//
// ⚠ **確かめるのは、⚠ 実際に踏んだ 2 つ**（`docs/adr/0044`）:
//
//     ⚠ ① 題名だけで当てる（⚠ 本文を見ると 3〜5 倍に膨らむ）
//     ⚠ ② 改善 Issue 自身を根拠に数えない（⚠ 自分で自分の根拠を膨らませる）
//
// ⚠ **`gh` を呼ばない。**⚠ **ネットに触らない**（⚠ CI の静的検査で走る）。
if (SELFTEST) {
  const F = [
    { number: 1, title: "初期画面に収まらない", body: "" },
    { number: 2, title: "初期画面からはみ出す", body: "" },
    { number: 3, title: "初期画面に収まるか見る", body: "" },
    { number: 4, title: "画面外へ出る", body: "" },
    // ⚠ ① 本文にだけ語がある（⚠ 掟の引用を模す）。⚠ **数えてはいけない**
    { number: 5, title: "まったく別の話", body: "初期画面に収まるかは CLAUDE.md にある" },
    // ⚠ ② 改善 Issue 自身。⚠ **根拠に数えてはいけない。**⚠ **既存としては当てる**
    { number: 6, title: `${AI_TAG} 「初期画面に収まるか」を作る前に見つける`, body: "" },
  ];
  const RE = /初期画面|画面外|はみ出|収ま/;
  const evid = evidenceIssues(F, RE);          // ⚠ **本体と同じ関数**
  const dup = existingImprovement(F, "初期画面に収まるか");   // ⚠ **本体と同じ関数**
  const fail = [];
  if (evid.length !== 4) fail.push(`根拠が ${evid.length} 件（⚠ 4 件のはず）`);
  if (evid.some((i) => i.number === 5)) fail.push("⚠ 本文だけの Issue を数えている");
  if (evid.some((i) => i.number === 6)) fail.push("⚠ 改善 Issue 自身を根拠に数えている");
  if (dup.length !== 1) fail.push(`⚠ 既存の改善 Issue を見つけられない（${dup.length} 件）`);
  if (fail.length) { console.error(fail.join(" ／ ")); process.exit(1); }
  console.log("✓ 題名だけで当てる（6 件中 4 件）／ 改善 Issue 自身は根拠に数えない ／ 既存 1 件を見つける");
  process.exit(0);
}

// ---- [記録] 手元の telemetry ----
const readJsonl = (f) => {
  const p = join(telemetryDir(), f);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
};
const events = readJsonl("events.jsonl");
const tasks = readJsonl("tasks.jsonl");
const asks = events.filter((e) => e.event === "OwnerAsk");

// ---- [GitHub] Issue と PR ----
const gh = (args) => {
  try { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 28 })); }
  catch { return null; }
};
// ⚠ **`--issues-file` は検査用**（⚠ `KONJAKU_TELEMETRY_DIR` と同じ趣旨）。
//   ⚠ **これが無いと、⚠ 乱造よけをわざと壊して確かめられない**（`CLAUDE.md` §2）。
const FIXTURE = (process.argv.find((x) => x.startsWith("--issues-file=")) ?? "").slice(14);
const issues = FIXTURE ? JSON.parse(readFileSync(FIXTURE, "utf8"))
  : NO_GH ? null
  : gh(["issue", "list", "--state", "all", "--limit", "400",
        "--json", "number,title,body,state,createdAt,closedAt,labels"]);

// ---- Issue Result（⚠ `--issue=N`。⚠ **1 件ぶんの結果**）----
//
// ⚠ **取れない数字を作らない**（⚠ 指示書 §3）。⚠ **取れないものは形で示す**:
//
//     { value: null, observed: false, reason: "…" }
//
// ⚠ **`observed: false` を、⚠ 0 と読ませない。**⚠ **0 は「起きなかった」、
// ⚠ `null` は「起きたかどうか分からない」。**⚠ **混ぜると §1 に反する。**
const NOT = (reason) => ({ value: null, observed: false, reason });

if (ONE != null) {
  // ⚠ **同じ task_id が何度も出る。**⚠ **最後の行を採る**（`telemetry.mjs` のコメント）。
  const last = new Map();
  for (const t of tasks) if (t.issue === ONE) last.set(t.task_id, t);
  const mine = [...last.values()];
  // ⚠ **`ask-slack` が `state.json` から Issue を引いて記録している**（2026-08-28 に足した）。
  //   ⚠ **`issue` が入っていない古い行は数えない**（⚠ **無いものを 0 と混ぜない**）。
  const mineAsks = asks.filter((a) => a.issue === ONE);
  const unlinked = asks.filter((a) => a.issue == null).length;

  const started = mine.map((t) => t.started_at).filter(Boolean).sort()[0] ?? null;
  const ended = mine.map((t) => t.ended_at).filter(Boolean).sort().at(-1) ?? null;
  const sessions = new Set(mine.flatMap((t) => t.session_ids ?? [])).size;

  const out = {
    issue: ONE,
    source: "[記録] .claude/telemetry/tasks.jsonl",
    started_at: started, ended_at: ended,
    turns: mine.reduce((a, t) => a + (t.turns ?? 0), 0),
    sessions: sessions || NOT("この Issue の Task が記録に無い"),
    tasks: mine.length,

    // ⚠ **ここから下は観測していない。**⚠ **推し量って埋めない。**
    owner_interactions: mineAsks.length,
    owner_ask_outcomes: mineAsks.length
      ? Object.fromEntries([...mineAsks.reduce((m, a) =>
          m.set(a.outcome, (m.get(a.outcome) ?? 0) + 1), new Map())])
      : NOT("この Issue に紐づく問いが記録に無い"),
    owner_decisions: NOT("問いの本文を持たないので、⚠ 決めごとかどうか分からない"),
    approval_requests: NOT("approval か否かを観測していない（⚠ 問いの本文を持たない）"),
    approval_rejections: NOT("同上"),
    loop_retries: NOT("Loop Controller が回数を記録していない"),
    human_decision_stops: NOT("change-review の判定を記録していない"),
    verify_failures: NOT("verify の結果を記録していない"),
    review_needs_fix: NOT("change-review の判定を記録していない"),
    completion: NOT("採点しないと決めている（`docs/adr/0035`・`0036`）。⚠ `gh` で PR を見れば分かるが、⚠ **記録の値としては持たない**"),
  };
  if (!mine.length) out.warning = `⚠ **記録に #${ONE} の Task が 1 件も無い**（⚠ 記録を足す前の作業か、⚠ 別の端末で作業した）`;

  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`Issue Result  #${ONE}\n`);
    console.log(`  ${out.source}`);
    if (out.warning) console.log(`\n  ${out.warning}\n`);
    for (const [k, v] of Object.entries(out)) {
      if (k === "issue" || k === "source" || k === "warning") continue;
      if (v && typeof v === "object" && v.observed === false)
        console.log(`  ${k.padEnd(21)} ⚠ 観測していない — ${v.reason}`);
      else if (v && typeof v === "object")
        console.log(`  ${k.padEnd(21)} ${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(" / ")}`);
      else console.log(`  ${k.padEnd(21)} ${v}`);
    }
    if (unlinked) {
      console.log(`\n  ⚠ **Issue に紐づいていない問いが、⚠ 全体で ${unlinked} 件ある**`);
      console.log("  ⚠ **これは Issue の作業中でないときか、⚠ 紐づけを足す前の記録。**");
      console.log("  ⚠ **この Issue の数に足さない**（`CLAUDE.md` §6・分母）。");
    }
  }
  process.exit(0);
}

// ---- 候補 ----
// ⚠ **1 つの候補は、⚠ 観測・根拠・解釈を分けて持つ**（⚠ 指示書 §5）。
const candidates = [];
const add = (c) => candidates.push({ confidence: "low", ...c });

// ⚠ ① Owner への往復が、⚠ どれだけ起きているか  [記録]
if (asks.length) {
  const by = new Map();
  for (const a of asks) by.set(a.outcome, (by.get(a.outcome) ?? 0) + 1);
  const timeout = by.get("timeout") ?? 0;
  const free = by.get("free_text") ?? 0;
  const waited = asks.filter((a) => a.waited_ms > 0).map((a) => a.waited_ms).sort((x, y) => x - y);
  // ⚠ **1 件の Issue で起きたことは、⚠ 仕組みの話ではない**（⚠ その Issue の事情かもしれない）。
  //   ⚠ **またいだ Issue の数を、⚠ 根拠に添える**（⚠ 指示書 §13 Case 5）。
  const span = (rows) => {
    const ids = new Set(rows.map((a) => a.issue).filter((x) => x != null));
    const none = rows.filter((a) => a.issue == null).length;
    return ids.size
      ? `${ids.size} 件の Issue にまたがる（${[...ids].map((n) => `hidetzu/konjaku#${n}`).join(" ")}）`
      : `⚠ **Issue に紐づいていない**（${none} 件。⚠ **仕組みの話かどうか分からない**）`;
  };
  const med = waited.length ? waited[Math.floor(waited.length / 2)] : null;
  if (timeout / asks.length > 0.2)
    add({ observation: `Owner への問いが ${asks.length} 件、⚠ うち ${timeout} 件が時間切れ`,
          evidence: `[記録] outcome の内訳: ${[...by].map(([k, v]) => `${k}=${v}`).join(" / ")} ／ ${span(asks.filter((a) => a.outcome === "timeout"))}`,
          target: "Skill", confidence: "low",
          proposal: "⚠ 聞き方を見直す（⚠ 選択肢を減らす・⚠ 判断材料を先に出す）",
          uncertainty: "⚠ 時間切れの理由は観測していない（⚠ 席を外していただけかもしれない）" });
  if (free / asks.length > 0.4)
    add({ observation: `Owner の答えの ${free}/${asks.length} 件が「自由に書く」だった`,
          evidence: `[記録] outcome=free_text ${free} 件 ／ ${span(asks.filter((a) => a.outcome === "free_text"))}`,
          target: "Skill", confidence: "low",
          proposal: "⚠ 出している選択肢が、⚠ 選びたいものと合っていない可能性がある",
          uncertainty: "⚠ 答えの本文は持っていない（⚠ 何を書いたかは分からない）" });
  if (med != null)
    add({ observation: `Owner の返事までの中央値 ${Math.round(med / 1000)} 秒`,
          evidence: `[記録] waited_ms の中央値（${waited.length} 件）`,
          target: "Telemetry", confidence: "low",
          proposal: "⚠ まだ判断材料が少ない。⚠ 貯めて見る",
          uncertainty: "⚠ 待ち時間は「Owner が忙しかったか」を表さない" });
}

// ⚠ ② 同じ領域が、⚠ 何度も Issue になっていないか  [GitHub]
//
// ⚠ **題名だけを見る。**⚠ **本文を含めると当たりが 3〜5 倍に膨らむ**
// ⚠ （⚠ 実測 2026-08-28・全 95 件。⚠ **Issue の本文が `CLAUDE.md` の掟を引用している**ため）:
//
//     初期画面に収まるか   ⚠ 題名 4 件  →  題名+本文 21 件
//     色・コントラスト     ⚠ 題名 4 件  →  題名+本文  9 件
//     同じことを 2 か所    ⚠ 題名 8 件  →  題名+本文 31 件
//
// ⚠ **膨らんだぶんは「その話をした Issue」であって、⚠ 「その摩擦が起きた Issue」ではない。**
// ⚠ **題名は、⚠ その Issue が何を直すかを名乗っている。**
if (issues) {
  const AREA = {
    "初期画面に収まるか": /初期画面|画面外|はみ出|収ま/,
    "色・コントラスト": /コントラスト|AA|色み|文字色/,
    "同じことを 2 か所": /2 か所|重複|1 か所にする/,
  };
  for (const [name, re] of Object.entries(AREA)) {
    const hit = evidenceIssues(issues, re)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (hit.length < 4) continue;
    const open = hit.filter((i) => i.state === "OPEN").length;
    add({ observation: `題名に「${name}」を持つ Issue が ${hit.length} 件（⚠ うち未了 ${open} 件）`,
          evidence: `[GitHub] ${hit.slice(-5).map((i) => `#${i.number}`).join(" ")}（⚠ 新しい順）／ 全 ${issues.length} 件中`,
          affected: hit.map((i) => i.number),
          target: "Skill",
          root_cause: "⚠ 同じ摩擦が繰り返している可能性（⚠ 題名で当てた。⚠ 中身は読んでいない）",
          proposal: `⚠ 「${name}」を、⚠ 作る前に見つけられる形にできないか`,
          uncertainty: "⚠ 題名の語で当てているので、⚠ 別の話が混ざる（⚠ 中身は人が読む）" });
  }
}

// ---- ⚠ 乱造よけ（⚠ 指示書 §7）----
//
// ⚠ **同じ改善テーマの Issue が既にあるなら、⚠ 新しく作らない。**
// ⚠ **この道具は Issue を作らないが、⚠ 「作ってよいか」は言う**（⚠ 決めるのは人）。
// ⚠ **既存の Issue の scope を勝手に変えない。**⚠ **evidence を足す方向を出すだけ。**
if (issues) {
  for (const c of candidates) {
    // ⚠ **改善の的（`proposal` の中の鉤括弧）で当てる。**⚠ 題名の丸ごと一致では当たらない。
    const theme = (c.proposal.match(/「(.+?)」/) ?? [])[1];
    const hit = existingImprovement(issues, theme);
    c.existing_issue = hit.length ? hit.map((i) => `#${i.number}`) : null;
    c.new_issue_ok = !hit.length;
  }
}

// ---- 出す ----
if (JSON_OUT) {
  console.log(JSON.stringify({
    source: { telemetry: { events: events.length, tasks: tasks.length, owner_asks: asks.length },
              github: issues ? { issues: issues.length } : null },
    not_observed: ["誰が答えたか", "問いと答えの本文", "approval か否か",
                   "Skill の判定（Verify / Review / Human Decision）", "Task の結末"],
    candidates,
  }, null, 2));
} else {
  console.log("開発の摩擦から出た、⚠ **仕組みの改善候補**\n");
  console.log(`  [記録]   events ${events.length} 行 ／ tasks ${tasks.length} 行 ／ Owner への問い ${asks.length} 件`);
  console.log(`  [GitHub] ${issues ? `Issue ${issues.length} 件` : "⚠ 読んでいない（--no-github）"}\n`);
  if (!candidates.length) {
    console.log("  ⚠ **候補は出ていない。**");
    if (!asks.length) console.log("  ⚠ **Owner への問いが 1 件も記録されていない**（⚠ 記録を足したばかりなら、⚠ まだ溜まっていない）。");
  }
  for (const [i, c] of candidates.entries()) {
    console.log(`  ── ${i + 1}. ${c.observation}`);
    console.log(`     根拠     ${c.evidence}`);
    if (c.affected) console.log(`     関わる   ${c.affected.length} 件`);
    if (c.root_cause) console.log(`     解釈     ${c.root_cause}`);
    console.log(`     直す先   ${c.target}`);
    console.log(`     案       ${c.proposal}`);
    console.log(`     ⚠ 確かでないこと  ${c.uncertainty}`);
    if (c.existing_issue)
      console.log(`     ⚠ **既にある**    ${c.existing_issue.join(" ")} — ⚠ **新しく作らない。**⚠ evidence を足すか、⚠ 候補として報告する`);
    else if (c.new_issue_ok)
      console.log(`     Issue          ⚠ 同じテーマの ${AI_TAG} Issue は無い（⚠ **作るかは人が決める**）`);
    console.log("");
  }
  console.log("⚠ **観測していないもの**（⚠ 候補の根拠にしない）:");
  console.log("     誰が答えたか ／ 問いと答えの本文 ／ approval か否か");
  console.log("     Skill の判定（Verify / Review / Human Decision）／ Task の結末");
  console.log("\n⚠ **Issue にするかは人が決める。**⚠ **この道具は作らない。**");
}
