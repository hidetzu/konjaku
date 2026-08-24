// 静的検査 — Eval が、集計で事実を曲げない（`.claude/tools/telemetry-eval.mjs`）
//
// ⚠ **`guard.mjs` とは別。**⚠ あちらは ⚠ **計測が作業を止めないか**。
//   ⚠ こちらは ⚠ **集計が、⚠ 観測していないことを言い出さないか。**
//
// ⚠ **ここが守っているもの**:
//     母数を混ぜない        ⚠ **終わっていない Task を、⚠ 0 秒として平均へ混ぜない**
//     最後の行を採る        ⚠ **`tasks.jsonl` は追記だけ**（同じ task_id が何度も出る）
//     読めない行を黙らせない ⚠ **捨てると、⚠ 母数が減ったことに誰も気づけない**
//     良し悪しを出さない    ⚠ **成功率・品質・自律性は観測していない**
//     生の記録を書き換えない ⚠ **Eval は読むだけ**
//
// ⚠ **字面で見ない。**⚠ **本物の関数を呼び、⚠ 本物の CLI を走らせて、⚠ 出てきたものを読む**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad, head } from "./lib.mjs";

head("Eval — 集計が事実を曲げない");

const TOOL = ".claude/tools/telemetry-eval.mjs";
const E = await import(pathToFileURL(join(ROOT, TOOL)).href);

// ---- 1. 数え方（⚠ **本物の関数を呼ぶ**） ----
// ⚠ **偶数件・奇数件・1 件・0 件を全部見る。**⚠ **0 件を 0 と答えないこと**が肝
//   （⚠ **0 件のとき 0 を返すと、⚠ 「測ったら 0 だった」に読める**。`CLAUDE.md` §1）。
{
  const fails = [];
  const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: ${JSON.stringify(got)}（${JSON.stringify(want)} のはず）`);
  };
  eq(E.median([]), null, "median 0 件");
  eq(E.median([5]), 5, "median 1 件");
  eq(E.median([3, 1, 2]), 2, "median 奇数件");
  eq(E.median([4, 1, 3, 2]), 2.5, "median 偶数件（真ん中 2 つの平均）");
  eq(E.p90([]), null, "p90 0 件");
  eq(E.p90([7]), 7, "p90 1 件");
  // ⚠ **補間しない。**⚠ **実際に測った値を返す**（1..10 なら 9 番目）
  eq(E.p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9, "p90 10 件");
  eq(E.p90([5, 4, 3, 2, 1]), 5, "p90 5 件（並べ替えてから採る）");
  eq(E.mean([]), null, "mean 0 件");
  eq(E.mean([1, 2, 3]), 2, "mean 3 件");
  // ⚠ **元の配列を壊さない**（⚠ 壊すと、⚠ 呼んだ順で答えが変わる）
  const xs = [3, 1, 2]; E.median(xs); E.p90(xs);
  eq(xs, [3, 1, 2], "median / p90 が元の配列を並べ替えている");
  // ⚠ **所要時間。**⚠ **終わりが無いものは null**（⚠ **0 にしない**）
  eq(E.durationSec({ started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T10:02:30+09:00" }), 150, "所要時間 150 秒");
  eq(E.durationSec({ started_at: "2026-08-24T10:00:00+09:00", ended_at: null }), null, "終わりが無い");
  eq(E.durationSec({ started_at: "2026-08-24T10:00:00+09:00" }), null, "終わりの欄が無い");
  eq(E.durationSec({ started_at: "2026-08-24T10:00:00+09:00", ended_at: "こわれた" }), null, "終わりが読めない");
  eq(E.durationSec({ started_at: "2026-08-24T10:05:00+09:00", ended_at: "2026-08-24T10:00:00+09:00" }), null, "終わりが始まりより前");
  // ⚠ **時差をまたいでも同じ**（⚠ どちらも同じ瞬間を指している）
  eq(E.durationSec({ started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T01:01:00Z" }), 60, "時差をまたいだ所要時間");
  fails.length
    ? bad(`Eval の数え方が合っていない: ${fails.join(" / ")}`
        + `（⚠ 0 件のとき 0 を返さない。⚠ 終わっていないものを 0 秒にしない）`)
    : ok("Eval の数え方を動かして確認（median / p90 / mean を 0・1・奇数・偶数件、"
        + "所要時間を 6 通り。⚠ 0 件と未終了は null で返る・元の配列を壊さない）");
}

// ---- 2. 集計（⚠ **契約どおり最後の行を採り、⚠ 母数を混ぜない**） ----
{
  const fails = [];
  const T = (o) => ({ task_type: "prompt", grouping: "turn", turns: 1, session_ids: ["s"], result: "unknown", ...o });
  // ⚠ **同じ task_id が 3 行**（⚠ 追記だけなので実際に起こる）。⚠ **最後の行が現在の姿**
  const rows = [
    T({ task_id: "A", task_type: "issue_execute", grouping: "issue", turns: 1, session_ids: ["s1"],
        started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T10:01:00+09:00" }),
    T({ task_id: "A", task_type: "issue_execute", grouping: "issue", turns: 2, session_ids: ["s1", "s2"],
        started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T10:05:00+09:00" }),
    T({ task_id: "A", task_type: "issue_execute", grouping: "issue", turns: 3, session_ids: ["s1", "s2"],
        started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T10:10:00+09:00" }),
    // ⚠ **終わっていない**（⚠ 所要時間の母数に入ってはいけない）
    T({ task_id: "B", started_at: "2026-08-24T11:00:00+09:00", ended_at: null }),
    T({ task_id: "C", started_at: "2026-08-24T12:00:00+09:00", ended_at: "2026-08-24T12:00:30+09:00" }),
    // ⚠ **知らない種別**（⚠ 落ちない。⚠ **見える形で残る**）
    T({ task_id: "D", task_type: "issue_triage", started_at: "2026-08-24T13:00:00+09:00",
        ended_at: "2026-08-24T13:02:00+09:00" }),
    // ⚠ **task_id が無い行は Task として数えない**
    { task_type: "prompt", turns: 1 },
  ];
  const s = E.summarize(rows, [7, 42]);   // ⚠ 読めなかった行が 2 行あった、として渡す
  const yes = (c, what) => { if (!c) fails.push(what); };

  // ⚠ **最後の行が採られている**
  const a = s.by_type.find((r) => r.task_type === "issue_execute");
  yes(s.overall.tasks === 4, `Task 数が ${s.overall.tasks}（A・B・C・D の 4 件のはず）`);
  yes(a?.turns.median === 3, `同じ task_id の最後の行が採られていない（turns が ${a?.turns.median}。3 のはず）`);
  yes(a?.duration.median_sec === 600, `最後の行の所要時間になっていない（${a?.duration.median_sec} 秒。600 のはず）`);
  // ⚠ **終わっていない Task を、⚠ 所要時間へ混ぜない**
  yes(s.overall.duration.samples === 3, `所要時間の母数が ${s.overall.duration.samples}（A・C・D の 3 件のはず）`);
  yes(s.overall.duration.unfinished === 1, `終わっていない Task が ${s.overall.duration.unfinished} 件（B の 1 件のはず）`);
  yes(s.overall.duration.median_sec === 120, `所要時間の median が ${s.overall.duration.median_sec} 秒（30 / 120 / 600 の真ん中 = 120 のはず）`);
  // ⚠ **種別ごとに分かれている。**⚠ **知らない種別も残る**
  yes(s.by_type.length === 3, `種別が ${s.by_type.length} 種（prompt・issue_execute・issue_triage の 3 種のはず）`);
  yes(s.by_type[0]?.task_type === "prompt" && s.by_type[1]?.task_type === "issue_execute",
    `並び順が決め打ちになっていない: ${s.by_type.map((r) => r.task_type).join("、")}`);
  yes(s.by_type[2]?.task_type === "issue_triage",
    `知らない種別（issue_triage）が、うしろに残っていない: ${s.by_type.map((r) => r.task_type).join("、") || "（1 種も無い）"}`);
  // ⚠ **Turn と Session を、⚠ 1 個と複数で区別できている**
  const p = s.by_type.find((r) => r.task_type === "prompt");
  yes(p?.turns.one_turn === 1, `prompt の 1 Turn 率が ${p?.turns.one_turn}（1 のはず）`);
  yes(a?.turns.one_turn === 0, `issue_execute の 1 Turn 率が ${a?.turns.one_turn}（0 のはず）`);
  yes(p?.sessions.multi === 0, `prompt の複数 Session 率が ${p?.sessions.multi}（0 のはず）`);
  yes(a?.sessions.multi === 1, `issue_execute の複数 Session 率が ${a?.sessions.multi}（1 のはず）`);
  // ⚠ **まとめ方ごとの件数**
  yes(s.by_grouping.issue === 1 && s.by_grouping.turn === 3,
    `まとめ方ごとの件数が合わない: ${JSON.stringify(s.by_grouping)}`);
  // ⚠ **読めなかった行を黙らせない**
  yes(s.unreadable_lines === 2, `読めなかった行が ${s.unreadable_lines}（2 のはず）`);
  // ⚠ **JSON としては読めるが、⚠ task_id が無くて Task にできない行**も黙らせない
  //   ⚠ **原因が違うので、⚠ 読めなかった行とは別に数える**
  yes(s.invalid_task_rows === 1, `Task にできない行が ${s.invalid_task_rows}（task_id の無い 1 行のはず）`);
  // ⚠ **見ている期間は「集計に入っている、⚠ 最古と最新の観測時刻」**（2026-08-24。⚠ **実際にずれた**）。
  //   ⚠ **終わりの最後を終端にすると、⚠ まだ終わっていない Task の始まりが範囲の外へ出る。**
  //   ⚠ **B（11:00 開始・未終了）が、⚠ いちばん新しい観測時刻。**⚠ **D の終わり 13:02 より前。**
  //   ⚠ **だから、⚠ 終端は D の 13:02。**⚠ **ここは「終わりだけ」でも「始まりだけ」でも出せない。**
  yes(s.period.from === "2026-08-24T10:00:00+09:00", `期間の始まりが ${s.period.from}（10:00 のはず）`);
  yes(s.period.to === "2026-08-24T13:02:00+09:00", `期間の終わりが ${s.period.to}（13:02 のはず）`);
  {
    // ⚠ **未終了 Task の始まりが、⚠ 終わったどの Task よりも後**のとき（⚠ **指摘された形そのもの**）
    const late = E.summarize([
      T({ task_id: "X", started_at: "2026-08-24T20:00:00+09:00", ended_at: "2026-08-24T20:10:00+09:00" }),
      T({ task_id: "Y", started_at: "2026-08-24T21:00:00+09:00", ended_at: null }),
    ], []);
    yes(late.period.to === "2026-08-24T21:00:00+09:00",
      `未終了 Task の始まりが範囲の外に出ている（終わりが ${late.period.to}。21:00 のはず）`);
    // ⚠ **時差の違う書き方が混ざっても、⚠ 実際の瞬間で比べる。**
    //   ⚠ **文字列順と、⚠ 実際の前後が食い違う組を選ぶ**（⚠ でないと、⚠ どちらでも通ってしまう）:
    //     P の終わり "2026-08-25T00:30:00+09:00" = 15:30Z
    //     Q の終わり "2026-08-24T16:00:00Z"      = 16:00Z   ⚠ **こちらが後**
    //   ⚠ **文字列のまま並べると P が後に見える**（"2026-08-25…" > "2026-08-24…"）。
    const tz = E.summarize([
      T({ task_id: "P", started_at: "2026-08-24T09:00:00+09:00", ended_at: "2026-08-25T00:30:00+09:00" }),
      T({ task_id: "Q", started_at: "2026-08-24T15:00:00Z", ended_at: "2026-08-24T16:00:00Z" }),
    ], []);
    yes(tz.period.to === "2026-08-24T16:00:00Z",
      `時差の違う時刻を文字列のまま並べ替えている（終わりが ${tz.period.to}。16:00Z のはず）`);
  }
  // ⚠ **1 件も無いときに 0 を返さない**（⚠ **「測ったら 0 だった」に読める**）
  const empty = E.summarize([], []);
  yes(empty.overall.tasks === 0 && empty.overall.duration.median_sec === null
    && empty.overall.turns.one_turn === null && empty.by_type.length === 0,
    `記録が 0 件のとき、null ではなく数字を返している: ${JSON.stringify(empty.overall)}`);

  fails.length
    ? bad(`Eval の集計が事実を曲げている: ${fails.join(" / ")}`
        + `（⚠ 最後の行を採る／⚠ 終わっていないものを母数へ混ぜない）`)
    : ok(`Eval の集計を動かして確認（同じ task_id 3 行 → 最後を採る・未終了は所要時間の`
        + `母数 ${s.overall.duration.samples} 件に入らない・知らない種別が残る・`
        + `Turn と Session を 1 個／複数で区別・読めなかった行 ${s.unreadable_lines} 行と`
        + `Task にできない行 ${s.invalid_task_rows} 行を分けて数える・`
        + `⚠ 期間は最古と最新の観測時刻（未終了の始まりも時差の違う書き方も外さない）・`
        + `0 件のときは 0 ではなく null）`);
}

// ---- 3. ⚠ 本物を走らせる（⚠ **読むだけ／良し悪しを出さない**） ----
{
  const fails = [];
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync, writeFileSync, readFileSync: rfE } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { tmpdir } = await import("node:os");

  const dir = mkdtempSync(join(tmpdir(), "konjaku-eval-"));
  const line = (o) => `${JSON.stringify(o)}\n`;
  writeFileSync(join(dir, "tasks.jsonl"),
    line({ ts: "x", task_id: "A", task_type: "prompt", grouping: "turn", issue: null,
           started_at: "2026-08-24T10:00:00+09:00", ended_at: "2026-08-24T10:01:00+09:00",
           session_ids: ["s1"], turns: 1, result: "unknown" })
    + "{ここで壊れている\n"     // ⚠ **途中に壊れた行**（⚠ 落ちずに、⚠ 数えられること）
    + line({ ts: "x", task_id: "B", task_type: "issue_execute", grouping: "issue", issue: "o/r#1",
             started_at: "2026-08-24T11:00:00+09:00", ended_at: null,
             session_ids: ["s2", "s3"], turns: 4, result: "unknown" }));
  writeFileSync(join(dir, "events.jsonl"), line({ ts: "x", event: "Stop", session_id: "s1" }));

  const digest = () => ["tasks.jsonl", "events.jsonl"]
    .map((f) => createHash("sha256").update(rfE(join(dir, f))).digest("hex")).join(" ");
  const before = digest();

  const run = (args) => execFileSync("node", [join(ROOT, TOOL), ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, KONJAKU_TELEMETRY_DIR: dir }, stdio: ["ignore", "pipe", "pipe"],
  });

  let text = "", json = null;
  try { text = run([]); } catch (e) { fails.push(`人が読む形で落ちた（status=${e?.status ?? "?"}）`); }
  try { json = JSON.parse(run(["--json"])); } catch (e) { fails.push(`--json が JSON として読めない（${e?.message ?? e}）`); }

  // ⚠ **壊れた行があっても、⚠ 残りを数え、⚠ 壊れた行数を名乗る**
  if (json) {
    if (json.overall.tasks !== 2) fails.push(`Task 数が ${json.overall.tasks}（2 のはず）`);
    if (json.unreadable_lines !== 1) fails.push(`読めなかった行が ${json.unreadable_lines}（1 のはず）`);
    if (json.overall.duration.samples !== 1) fails.push(`所要時間の母数が ${json.overall.duration.samples}（1 のはず）`);
    if (json.overall.duration.unfinished !== 1) fails.push(`終わっていない Task が ${json.overall.duration.unfinished}（1 のはず）`);
    // ⚠ **良し悪しを出さない**（⚠ **観測していないので、⚠ 名前ごと持たない**）
    const graded = JSON.stringify(json).match(
      /"(success|failure|quality|score|productivity|autonomy|pass|fail|good|bad)[a-z_]*"/gi);
    if (graded) fails.push(`Eval が良し悪しを出している: ${[...new Set(graded)].join("、")}`);
  }
  // ⚠ **どの欄が推定値かを、⚠ 出力自身が名乗る**（⚠ 読む側が字を読まなくても分かる）
  if (json && !(json.estimated_fields ?? []).includes("task_type"))
    fails.push("推定値の欄（task_type ほか）を、出力が名乗っていない");
  // ⚠ **人が読む形でも、⚠ 推定であることを断っている。**
  //   ⚠ **本文のどこかにあるだけでは足りない**（`CLAUDE.md` §9: ⚠ **別の文を拾って素通りする**）。
  //   ⚠ **実際に踏んだ**（2026-08-24）: 表の見出しから断りを消しても、
  //   ⚠ **下の「読み方」の別の文を拾って通った。**
  //   ⚠ **だから、⚠ 表のすぐ上に付いていることまで見る**（⚠ 行の位置で結びつける）。
  if (text) {
    const rows2 = text.split("\n");
    const head2 = rows2.findIndex((l) => /^\s+Type\s+Tasks\s+Finished/.test(l));
    if (head2 < 1) fails.push("種別ごとの表が出ていない");
    else if (!/task_type[^。\n]*推定値/.test(rows2[head2 - 1]))
      fails.push(`表のすぐ上に、task_type が推定値だという断りが無い: ${JSON.stringify(rows2[head2 - 1])}`);
    // ⚠ **束ね方の帰結だという断りは、⚠ 1 つの文の中で Turn 数と結びついていること**
    const sentences = text.split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
    if (!sentences.some((t) => /Turn 数/.test(t) && /束ね方の帰結/.test(t)))
      fails.push("Turn 数の比較が束ね方の帰結だ、と 1 つの文で言っていない");
  }
  // ⚠ **読むだけ。**⚠ **走らせて中身が変わっていないこと**
  if (digest() !== before) fails.push("Eval を走らせたら、生の記録が変わった（⚠ 読むだけのはず）");
  // ⚠ **記録がまだ無いときに、⚠ 壊れない**
  const none = mkdtempSync(join(tmpdir(), "konjaku-eval-none-"));
  try {
    const out = execFileSync("node", [join(ROOT, TOOL)], {
      cwd: ROOT, encoding: "utf8", timeout: 20_000,
      env: { ...process.env, KONJAKU_TELEMETRY_DIR: none }, stdio: ["ignore", "pipe", "pipe"] });
    if (!/ありません/.test(out)) fails.push("記録がまだ無いときに、そう言っていない");
  } catch (e) { fails.push(`記録がまだ無いときに落ちた（status=${e?.status ?? "?"}）`); }
  // ⚠ **書いた先を、⚠ 本当に読めるか**（2026-08-24）。
  //   ⚠ **置き場所は `.claude/telemetry-dir.mjs` の 1 か所に寄せた。**
  //   ⚠ **片方だけが自前で決め始めても、⚠ 字を見るだけでは気づけない**（⚠ 実証した）。
  //   ⚠ **だから、⚠ 既定の置き場所のまま 1 往復させて、⚠ 読む側が見つけるかで見る。**
  //   ⚠ **`KONJAKU_TELEMETRY_DIR` を渡さない**（⚠ 渡すと、⚠ 両方に同じ答えを教えてしまう）。
  {
    const home = mkdtempSync(join(tmpdir(), "konjaku-roundtrip-"));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: home };
    delete env.KONJAKU_TELEMETRY_DIR;
    const hook = join(ROOT, ".claude/hooks/telemetry.mjs");
    try {
      for (const input of [
        { hook_event_name: "UserPromptSubmit", session_id: "rt-1", prompt_id: "rt-p1", prompt: "ふつうの依頼" },
        { hook_event_name: "Stop", session_id: "rt-1", prompt_id: "rt-p1", last_assistant_message: "はい" },
      ]) execFileSync("node", [hook], { input: JSON.stringify(input), cwd: ROOT, encoding: "utf8",
            env, timeout: 20_000, stdio: ["pipe", "pipe", "pipe"] });
      const out = execFileSync("node", [join(ROOT, TOOL), "--json"],
        { cwd: ROOT, encoding: "utf8", env, timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] });
      // ⚠ **記録が無いと、⚠ 読む側は「まだありません」と人の言葉で答える**（⚠ JSON にならない）。
      //   ⚠ **それ自体が「書いた先を見ていない」ことの印。**⚠ **そう名乗る**
      //   （⚠ パースの失敗として報せない。⚠ **落ちた理由が狙った主張になっていないと読めない**）。
      let seen = null; try { seen = JSON.parse(out); } catch {}
      if (!seen)
        fails.push("読む側が、書いた先に記録を見つけていない（⚠ 書く側と読む側が別の場所を指している）");
      else if (seen.overall.tasks !== 1)
        fails.push(`書いた先を読めていない（読む側が見つけた Task は ${seen.overall.tasks} 件。1 件のはず）`
          + `（⚠ 書く側と読む側が、⚠ 別の場所を指している）`);
    } catch (e) {
      fails.push(`既定の置き場所で 1 往復できない（${String(e.message).slice(0, 60)}）`);
    }
    rmSync(home, { recursive: true, force: true });
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(none, { recursive: true, force: true });

  fails.length
    ? bad(`Eval を実際に走らせたら合わない: ${fails.join(" / ")}`
        + `（⚠ 読むだけ／⚠ 観測していないことを言わない）`)
    : ok("Eval を実際に走らせて確認（人が読む形と --json の 2 通り・壊れた行 1 行を数えて残りは集計・"
        + "未終了は所要時間の母数に入らない・良し悪しの欄を 1 つも持たない・"
        + "推定値であることを両方で名乗る・生の記録は 1 バイトも変わらない・記録が無くても落ちない・"
        + "⚠ 既定の置き場所のまま 1 往復して、⚠ 書いた先を読む側が見つけられる）");
}
