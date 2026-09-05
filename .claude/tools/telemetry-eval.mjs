#!/usr/bin/env node
// 計測した Task を、種別ごとに並べて見比べる（Eval Phase 1）。
//
// ⚠ **これは「採点」ではない。**⚠ **観測した事実を、⚠ 比べられる形に並べるだけ**
//   （`docs/adr/0036-Evalは観測を比べるだけで良し悪しを決めない.md`）。
//
// ⚠ **読むだけ。**⚠ **`events.jsonl` にも `tasks.jsonl` にも 1 バイトも書かない。**
//   ⚠ **compact もしない。**⚠ 生の記録は、⚠ **書いた側（`../hooks/telemetry.mjs`）だけが触る。**
//
// ## 使い方
//
//   node .claude/tools/telemetry-eval.mjs
//   node .claude/tools/telemetry-eval.mjs --json
//
//   # ⚠ 別の記録を見る（⚠ 検査が本物を汚さずに試すのに使う）
//   KONJAKU_TELEMETRY_DIR=/tmp/xxx node .claude/tools/telemetry-eval.mjs
//
// ## ⚠ 何を出して、何を出さないか
//
// ⚠ **出すのは、⚠ 記録に入っている値と、⚠ そこから算数で出るものだけ。**
//
//     Task 数 ／ 種別ごとの件数 ／ まとめ方ごとの件数
//     所要時間（median / p90）  ⚠ **終わりを観測できたものだけ**
//     Turn 数（average / median）／ 1 Turn で終わった割合
//     複数 Session にまたがった割合 ／ 終わりを観測できていない数
//
// ⚠ **出さないもの**（⚠ **観測していないから**）:
//
//     success rate ／ failure rate ／ quality score ／ agent score
//     productivity ／ autonomy ／ PASS・FAIL ／ GOOD・BAD ／ 総合点
//
// ⚠ **「1 Turn だから優秀」「時間が短いから優秀」も言わない。**
//   ⚠ **速いのは、⚠ 用事が小さかっただけかもしれない。**⚠ **区別できていない。**
//
// ## ⚠ 事実と推定を混ぜない
//
// ⚠ **記録のうち、⚠ 次の 3 つは推定値**（`telemetry.mjs` の契約）。
//
//     grouping ／ task_type ／ task_type_source
//
// ⚠ **種別ごとの表は、⚠ この推定値で行を分けている。**⚠ **だから、⚠ 表に断りを付ける。**
//   ⚠ **黙って並べると、⚠ 推定が実測の顔をする**（`CLAUDE.md` §1）。
//
// ⚠ **とくに `grouping=turn` の Task は、⚠ 定義上 `turns=1`・Session 1 個になる**
//   （⚠ 1 プロンプト = 1 Task と決めたため）。
//   ⚠ **Turn 数を種別間で比べても意味がない。**⚠ **束ね方の帰結であって、⚠ 観測ではない。**
//
// ## ⚠ 同じ task_id が何度も出る
//
// ⚠ **`tasks.jsonl` は追記だけ**（`telemetry.mjs` の契約）。
// ⚠ **その task_id の最後の行を、⚠ いまの状態として採る。**⚠ **書き換えて 1 行にしない。**
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// ⚠ **置き場所は `../telemetry-dir.mjs` の 1 か所**（⚠ 書く側と同じものを借りる）。
//   ⚠ **別々に持つと、⚠ 書いた先と読む先が黙ってずれる**（2026-08-24 に実証した）。
import { telemetryDir } from "../telemetry-dir.mjs";

// ⚠ **並べる順は決め打ち。**⚠ **知らない種別は、⚠ そのうしろに足す**
//   （⚠ 消さない。⚠ **知らないものが増えたことに気づけるように**）。
export const KNOWN_TYPES = ["prompt", "issue_refine", "issue_execute"];

// ---------- 読む ----------
// ⚠ **壊れた行を黙って捨てない。**⚠ **何行読めなかったかを返す**
//   （⚠ 捨てると、⚠ **母数が減ったことに誰も気づけない**）。
export const parseJsonl = (text) => {
  const rows = [], unreadable = [];
  (text ?? "").split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try { rows.push(JSON.parse(line)); } catch { unreadable.push(i + 1); }
  });
  return { rows, unreadable };
};

// ⚠ **同じ task_id の最後の行を採る**（⚠ 上の契約）。⚠ **並びは最初に出てきた順のまま。**
//
// ⚠ **落とした行も返す。**⚠ **JSON として読めても、⚠ `task_id` が無ければ Task にできない。**
//   ⚠ **黙って消すと、⚠ 母数が減ったことに誰も気づけない**（⚠ 読めなかった行と同じ話）。
//   ⚠ **読めなかった行（JSON として壊れている）とは別に数える。**⚠ **原因が違う。**
export const snapshot = (rows) => {
  const seen = new Map();
  let invalid = 0;
  for (const r of rows) {
    const id = r?.task_id;
    if (typeof id !== "string" || !id) { invalid += 1; continue; }
    seen.set(id, r);                               // ⚠ あとの行が前の行を置き換える
  }
  return { tasks: [...seen.values()], invalid };
};

// ---------- 数える ----------
// ⚠ **並べ替えてから採る。**⚠ **元の配列を壊さない**（`[...xs]`）。
// ⚠ **median は偶数件のとき真ん中 2 つの平均。**⚠ **p90 は「下から 90% の位置にある実測値」**
//   （⚠ 補間しない。⚠ **実際に測った値だけを出す**。`CLAUDE.md` §6）。
export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const p90 = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)];
};
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ⚠ **秒で返す。**⚠ **終わりを観測できていないものは `null`**（⚠ **0 にしない**）。
//   ⚠ **0 にすると、⚠ 終わっていない Task が「一瞬で終わった」ことになる。**
export const durationSec = (t) => {
  if (!t?.started_at || !t?.ended_at) return null;
  const a = Date.parse(t.started_at), b = Date.parse(t.ended_at);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 1000;
};

const turnsOf = (t) => (Number.isInteger(t?.turns) && t.turns > 0 ? t.turns : null);
const sessionsOf = (t) => (Array.isArray(t?.session_ids) ? t.session_ids.length : null);

// ⚠ **1 つの集まりについて、⚠ 数えられるものだけ数える。**
//   ⚠ **母数をそれぞれ持たせる**（⚠ **どれも同じ母数ではない**。`CLAUDE.md` §6）。
const statsOf = (tasks) => {
  const durations = tasks.map(durationSec).filter((v) => v !== null);
  // ⚠ **終わりが無い**のと、⚠ **終わりはあるが読めない・逆順**を分ける
  const noEnd = tasks.filter((t) => !t?.ended_at).length;
  const brokenTime = tasks.length - durations.length - noEnd;
  const turns = tasks.map(turnsOf).filter((v) => v !== null);
  const sessions = tasks.map(sessionsOf).filter((v) => v !== null);
  return {
    tasks: tasks.length,
    duration: {
      samples: durations.length, unfinished: noEnd, unusable: brokenTime,
      median_sec: median(durations), p90_sec: p90(durations),
    },
    turns: {
      samples: turns.length, mean: mean(turns), median: median(turns),
      // ⚠ **割合の分母は「Turn 数が読めたぶん」**（⚠ Task 総数ではない）
      one_turn: turns.length ? turns.filter((v) => v === 1).length / turns.length : null,
    },
    sessions: {
      samples: sessions.length,
      multi: sessions.length ? sessions.filter((v) => v > 1).length / sessions.length : null,
    },
  };
};

export const summarize = (rows, unreadableLines = []) => {
  const { tasks, invalid } = snapshot(rows);
  const byType = new Map();
  for (const t of tasks) {
    // ⚠ **知らない種別が来ても壊れない。**⚠ **無い場合は `(none)` として、⚠ 見えるようにする**
    const k = typeof t?.task_type === "string" && t.task_type ? t.task_type : "(none)";
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(t);
  }
  const order = [...KNOWN_TYPES.filter((k) => byType.has(k)),
    ...[...byType.keys()].filter((k) => !KNOWN_TYPES.includes(k)).sort()];
  const byGrouping = {};
  for (const t of tasks) {
    const g = typeof t?.grouping === "string" && t.grouping ? t.grouping : "(none)";
    byGrouping[g] = (byGrouping[g] ?? 0) + 1;
  }
  // ⚠ **いつからいつまでを見ているか。**⚠ **絞り込んでいない**（⚠ 記録の全部が対象）。
  //
  // ⚠ **始まりと終わりを、⚠ 一緒くたに並べて両端を採る。**
  //   ⚠ **終わりの最後を終端にしてはいけない**（2026-08-24。⚠ **実際にずれた**）:
  //     ⚠ 20:00-20:10 の Task と、⚠ **21:00 に始まってまだ終わっていない Task** があると、
  //     ⚠ **21:00 の Task も集計に入っているのに、⚠ Period が「20:00 - 20:10」になった。**
  //   ⚠ **意味は「集計に入っている、⚠ いちばん古い観測時刻と、⚠ いちばん新しい観測時刻」。**
  //
  // ⚠ **文字列のまま並べ替えない**（⚠ **同じ瞬間でも書き方が違う**）。
  //   ⚠ `2026-08-24T01:01:00Z` と `2026-08-24T10:00:00+09:00` は ⚠ **時差が違うだけで前後が逆に出る。**
  //   ⚠ **実際の瞬間で比べる**（`Date.parse`）。
  const observed = tasks
    .flatMap((t) => [t?.started_at, t?.ended_at])
    .filter((v) => typeof v === "string" && Number.isFinite(Date.parse(v)))
    .sort((x, y) => Date.parse(x) - Date.parse(y));
  return {
    schema: 1,
    // ⚠ **これは「観測した事実の集計」であって、⚠ 良し悪しの判定ではない**
    kind: "observation",
    unreadable_lines: unreadableLines.length,
    // ⚠ **JSON として壊れている行**と、⚠ **読めるが Task にできない行**を分ける（原因が違う）
    invalid_task_rows: invalid,
    period: { from: observed[0] ?? null, to: observed[observed.length - 1] ?? null },
    overall: statsOf(tasks),
    by_grouping: byGrouping,
    by_type: order.map((k) => ({ task_type: k, ...statsOf(byType.get(k)) })),
    // ⚠ **どの欄が推定値かを、⚠ 出力自身に持たせる**（⚠ 読む側が字を見なくても分かるように）
    estimated_fields: ["task_type", "grouping", "task_type_source"],
  };
};

// ---------- 見せる ----------
const fmtDur = (sec) => {
  if (sec === null || sec === undefined) return "-";
  if (sec < 90) return `${sec.toFixed(0)}s`;
  if (sec < 5400) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
};
const fmtPct = (v) => (v === null || v === undefined ? "-" : `${Math.round(v * 100)}%`);
const fmtNum = (v) => (v === null || v === undefined ? "-" : String(Math.round(v * 10) / 10));
const fmtWhen = (s) => (s ? s.slice(0, 16).replace("T", " ") : "-");

// ⚠ **表の見出しは ASCII。**⚠ **日本語を混ぜると幅が合わず、⚠ 桁がずれて読めなくなる。**
export const format = (s) => {
  const L = [];
  L.push("AI Task Eval");
  L.push(`Period: ${fmtWhen(s.period.from)} - ${fmtWhen(s.period.to)}   ⚠ 記録の全部（絞り込んでいない）`);
  L.push("");
  L.push(`Tasks: ${s.overall.tasks}`);
  L.push(`  終わりを観測できた: ${s.overall.duration.samples}`);
  L.push(`  終わっていない:     ${s.overall.duration.unfinished}`);
  if (s.overall.duration.unusable) L.push(`  ⚠ 時刻が読めない:   ${s.overall.duration.unusable}`);
  if (s.unreadable_lines) L.push(`  ⚠ 読めなかった行:   ${s.unreadable_lines}`);
  if (s.invalid_task_rows) L.push(`  ⚠ Task にできない行: ${s.invalid_task_rows}（task_id が無い）`);
  L.push("");
  L.push(`所要時間（⚠ 終わりを観測できた ${s.overall.duration.samples} 件だけ）`);
  L.push(`  median ${fmtDur(s.overall.duration.median_sec)} ／ p90 ${fmtDur(s.overall.duration.p90_sec)}`);
  L.push("");
  L.push("種別ごと（⚠ task_type は推定値）");
  // ⚠ **見出しと値を、⚠ 同じ 1 か所から出す**（⚠ 2 か所に幅を書くと、⚠ 片方だけずれる）。
  //   ⚠ **実際にずれた**（2026-08-24。⚠ Tasks の桁が 1 つ手前で名乗っていた）。
  const COLS = [
    ["Type",          14, (r) => r.task_type],
    ["Tasks",          7, (r) => String(r.tasks)],
    ["Finished",      10, (r) => String(r.duration.samples)],
    ["Median",         9, (r) => fmtDur(r.duration.median_sec)],
    ["p90",            9, (r) => fmtDur(r.duration.p90_sec)],
    ["Turns(med)",    12, (r) => fmtNum(r.turns.median)],
    ["1-turn",         8, (r) => fmtPct(r.turns.one_turn)],
    ["Multi-session", 15, (r) => fmtPct(r.sessions.multi)],
  ];
  const line = (cells) => "  " + cells
    .map((v, i) => (i === 0 ? v.padEnd(COLS[i][1]) : v.padStart(COLS[i][1]))).join("");
  L.push(line(COLS.map(([h]) => h)));
  for (const r of s.by_type) L.push(line(COLS.map(([, , get]) => get(r))));
  if (!s.by_type.length) L.push("  （まだ 1 件も記録がありません）");
  L.push("");
  L.push(`まとめ方ごと（⚠ grouping も推定値）: `
    + (Object.entries(s.by_grouping).map(([k, v]) => `${k} ${v}`).join(" ／ ") || "-"));
  L.push("");
  L.push("⚠ 読み方");
  L.push("  ⚠ task_type ／ grouping ／ task_type_source は推定値（観測ではない）");
  L.push("  ⚠ grouping=turn の Task は、定義上 turns=1・Session 1 個になる。");
  L.push("     ⚠ Turn 数を種別間で比べても意味がない（束ね方の帰結であって、観測ではない）");
  L.push("  ⚠ 所要時間は「Turn が終わった」までの実時間。手を動かしていた時間ではない");
  L.push("  ⚠ 良し悪しは測っていない（成功率・品質・自律性は出していない）");

  // ---- Owner の手（⚠ 観測できたものだけ）----
  if (s.owner) {
    const o = s.owner;
    L.push("");
    L.push("Owner の手（⚠ 観測できたものだけ）");
    L.push(`  道具の呼び出し:       ${o.tool_calls}`);
    L.push(`  うち止まった:         ${o.tool_stopped}`
      + "   ⚠ PostToolUse が来なかった回。⚠ 拒否とは限らない（中断・失敗も同じ形）");
    L.push(`  Slack で聞いた:       ${o.asked}`
      + (o.asked ? `   ⚠ 待った合計 ${fmtDur(o.waited_ms / 1000)}` : ""));
    // ⚠ **分母を、⚠ 判定できた Turn にする**（⚠ 欄が無い古い行を混ぜない）
    L.push(`  本文で聞いた:         ${o.ask_inline} / ${o.ask_inline_judged} Turn`
      + (o.ask_inline_rule ? `   ⚠ 規則「${o.ask_inline_rule}」` : ""));
    if (o.turns > o.ask_inline_judged)
      L.push(`     ⚠ この欄を持たない Turn が ${o.turns - o.ask_inline_judged} 件ある`
        + "（⚠ 欄を足す前の記録。⚠ 「聞かなかった」ではない）");
    L.push(`  ⚠ 取れていないもの:   ${o.missing.join(", ")}`);
    L.push("  ⚠ 「取れていない」は 0 件ではない。⚠ この版では観測できない");
    L.push("  ⚠ Owner Intervention（人が止めた瞬間）は、⚠ 直接観測できない");
    L.push("     ⚠ PermissionDenied / PermissionRequest / PostToolUseFailure は呼ばれない");
    L.push("     ⚠ 実測 2026-09-05・Claude Code 2.1.261");
  }
  return L.join("\n");
};

// ---------- Owner の手（⚠ 観測できたものだけ）----------
// ⚠ **`events.jsonl` から出す**（2026-09-05。hidetzu/konjaku#471）。
//   ⚠ **書く側は事実だけを並べている。**⚠ **突き合わせはここでやる。**
//
// ⚠ **Owner Intervention は、⚠ この版では直接観測できない**
//   （⚠ 実測 2026-09-05・Claude Code 2.1.261: ⚠ `PermissionDenied` /
//    ⚠ `PermissionRequest` / `PostToolUseFailure` は、⚠ 拒否させても呼ばれなかった）。
//   ⚠ **だから、⚠ その欄は作らない。**⚠ **代わりに `owner_missing` で名乗る。**
//   ⚠ **欄が無いだけだと、⚠ 「0 件」と読まれる。**
export const ownerOf = (events) => {
  // ⚠ **道具が止まった回。**⚠ **`PreToolUse` は在るのに `PostToolUse` が来なかったもの。**
  //   ⚠ **拒否とは言わない。**⚠ **止まった理由は分けていない**（⚠ 中断・落ちた・時間切れも同じ形）。
  const pre = new Map();     // tool_use_id → { tool_name, session_id }
  const post = new Set();
  // ⚠ **`AskUserQuestion` を使った Turn**（⚠ 本文で聞いたのとは別の話）
  const 道具で聞いた = new Set();
  let stopped = 0, asked = 0, waited = 0, inline = 0, stops = 0, judged = 0;
  const rule = new Set();
  for (const e of events) {
    switch (e?.event) {
      case "PreToolUse":
        if (e.tool_use_id) pre.set(e.tool_use_id, e.tool_name ?? null);
        // ⚠ **`prompt_id` で Turn を見分ける**（⚠ 無ければ session でまとめる）
        if (e.tool_name === "AskUserQuestion") 道具で聞いた.add(`${e.session_id}:${e.prompt_id ?? ""}`);
        break;
      case "PostToolUse": if (e.tool_use_id) post.add(e.tool_use_id); break;
      case "OwnerAsk":
        asked++;
        if (Number.isFinite(e.waited_ms)) waited += e.waited_ms;
        break;
      case "Stop":
        stops++;
        // ⚠ **欄が無い行は、⚠ 分母に入れない**（`CLAUDE.md` §6）。
        //   ⚠ **この欄は 2026-09-05 に足した。**⚠ **それより前の Turn には無い。**
        //   ⚠ **無いことを「聞かなかった」と数えると、⚠ 割合が嘘になる。**
        if (typeof e.ask_inline === "boolean") {
          judged++;
          // ⚠ **`AskUserQuestion` を使った Turn は、⚠ Decision であって、⚠ これではない**
          if (e.ask_inline && !道具で聞いた.has(`${e.session_id}:${e.prompt_id ?? ""}`)) {
            inline++;
            if (e.ask_inline_rule) rule.add(e.ask_inline_rule);
          }
        }
        break;
      default: break;
    }
  }
  for (const id of pre.keys()) if (!post.has(id)) stopped++;
  return {
    // ⚠ **観測できたもの**
    tool_stopped: stopped,
    tool_calls: pre.size,
    asked, waited_ms: waited,
    ask_inline: inline,
    // ⚠ **分母は「その欄を持っていた Turn」だけ**（⚠ 欄は 2026-09-05 に足した）
    ask_inline_judged: judged,
    ask_inline_rule: rule.size ? [...rule].join(" / ") : null,
    turns: stops,
    // ⚠ **取れないもの。**⚠ **名乗る。**⚠ **0 件と読ませない。**
    missing: ["intervention", "rework", "near_miss", "active_time", "completed"],
  };
};

// ---------- 口 ----------
export const readEvents = (dir) => {
  const f = join(dir, "events.jsonl");
  if (!existsSync(f)) return { rows: [], unreadable: [], missing: true };
  return { ...parseJsonl(readFileSync(f, "utf8")), missing: false };
};

export const readTasks = (dir) => {
  const f = join(dir, "tasks.jsonl");
  if (!existsSync(f)) return { rows: [], unreadable: [], missing: true };
  return { ...parseJsonl(readFileSync(f, "utf8")), missing: false };
};

const main = () => {
  const dir = telemetryDir();
  const { rows, unreadable, missing } = readTasks(dir);
  if (missing) {
    // ⚠ **無いことを、⚠ 壊れたことにしない**（`CLAUDE.md` §1: 取れなかった ≠ 無かった）
    process.stdout.write(`AI Task Eval\n\n${join(dir, "tasks.jsonl")} がまだありません。\n`
      + "⚠ 計測の Hook が動いた回がまだ 1 度も無いか、⚠ 記録先が別の場所です。\n");
    return;
  }
  const s = summarize(rows, unreadable);
  // ⚠ **Owner の手は `events.jsonl` から。**⚠ **無くても止まらない**
  const ev = readEvents(dir);
  s.owner = ev.missing ? null : ownerOf(ev.rows);
  process.stdout.write(process.argv.includes("--json")
    ? `${JSON.stringify(s, null, 2)}\n` : `${format(s)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
