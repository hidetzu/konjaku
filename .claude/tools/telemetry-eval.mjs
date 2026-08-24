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
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
export const snapshot = (rows) => {
  const seen = new Map();
  for (const r of rows) {
    const id = r?.task_id;
    if (typeof id !== "string" || !id) continue;   // ⚠ 名前の無い行は Task として数えない
    seen.set(id, r);                               // ⚠ あとの行が前の行を置き換える
  }
  return [...seen.values()];
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
  const tasks = snapshot(rows);
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
  // ⚠ **いつからいつまでを見ているか。**⚠ **絞り込んでいない**（⚠ 記録の全部が対象）
  const starts = tasks.map((t) => t?.started_at).filter((s) => typeof s === "string" && Number.isFinite(Date.parse(s))).sort();
  const ends = tasks.map((t) => t?.ended_at).filter((s) => typeof s === "string" && Number.isFinite(Date.parse(s))).sort();
  return {
    schema: 1,
    // ⚠ **これは「観測した事実の集計」であって、⚠ 良し悪しの判定ではない**
    kind: "observation",
    unreadable_lines: unreadableLines.length,
    period: { from: starts[0] ?? null, to: ends[ends.length - 1] ?? starts[starts.length - 1] ?? null },
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
  return L.join("\n");
};

// ---------- 口 ----------
export const readTasks = (dir) => {
  const f = join(dir, "tasks.jsonl");
  if (!existsSync(f)) return { rows: [], unreadable: [], missing: true };
  return { ...parseJsonl(readFileSync(f, "utf8")), missing: false };
};

export const telemetryDir = () => {
  const ROOT = process.env.CLAUDE_PROJECT_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return process.env.KONJAKU_TELEMETRY_DIR ?? join(ROOT, ".claude", "telemetry");
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
  process.stdout.write(process.argv.includes("--json")
    ? `${JSON.stringify(s, null, 2)}\n` : `${format(s)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
