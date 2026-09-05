#!/usr/bin/env node
// 見て決めた決定に、⚠ **結果を 1 つだけ**残す（Decision Log v1）。
//
// ⚠ **`visual-decision` で Owner が絵を見て決めたあと、⚠ その決定がどうなったか**を、
//   ⚠ **PR 番号をキーにして 1 行だけ書く**（2026-09-05。Owner 指示）。
//
// ## ⚠ これは観測ではない（⚠ いちばん大事なところ）
//
// ⚠ **既存の台帳（`.claude/hooks/telemetry.mjs` が書くもの）は、⚠ 全部フックが自動で書いた事実。**
//   ⚠ **人が入力した値は 1 つも入っていない。**
// ⚠ **こちらは逆で、⚠ **人が入れる値**。⚠ **だから、⚠ 台帳ごと分ける。**
//
//     .claude/telemetry/events.jsonl     ⚠ フックが書いた事実（⚠ Owner の手 ／ Task 単位）
//     .claude/telemetry/tasks.jsonl      ⚠ 同上
//     .claude/telemetry/decisions.jsonl  ⚠ **これ。**⚠ 人が入れた値
//
// ⚠ **混ぜない理由**: ⚠ **`events.jsonl` に混ぜると、⚠ 「Owner の手が入らなかった」の定義が濁る**
//   （⚠ あれは ⚠ OwnerAsk・道具が止まった・本文で聞いた が 0 だった Task、という機械の判定）。
//   ⚠ **人の入力が 1 行でも混ざると、⚠ あの数が何の数か言えなくなる。**
//
// ⚠ **良し悪しは測っていない**（`docs/adr/0036`）。⚠ **「即決＝良い」ではない。**
//   ⚠ **迷ったほうが良い決定だったことも、⚠ 戻したのが正解だったこともある。**
//
// ## 値は 3 つだけ（⚠ 増やさない）
//
//     即決        ⚠ 出した案から、⚠ そのまま決まった（⚠ 聞き直しが無かった）
//     迷った      ⚠ 聞き直した ／ 案を出し直した ／ 条件を足して撮り直した
//     後で戻した  ⚠ 一度そう決めたが、⚠ あとで元へ戻した
//
// ⚠ **「後で戻した」は、⚠ あとから書き戻す。**⚠ **同じ PR にもう 1 行足すだけ**
//   （⚠ 前の行は消さない。⚠ **読むときは、⚠ その PR の最後の行を採る**）。
//   ⚠ **`tasks.jsonl` と同じ契約**（⚠ 追記だけ。⚠ 書き換えない）。
//
// ## 使い方
//
//   node .claude/tools/decision.mjs --pr=487 --outcome=即決
//   node .claude/tools/decision.mjs --pr=487 --outcome=後で戻した   # ⚠ あとから書き戻す
//   node .claude/tools/decision.mjs --list
//   node .claude/tools/decision.mjs --list --json
//
// ⚠ **`--pr` は `<番号>` ／ `#<番号>` ／ `hidetzu/konjaku#<番号>` ／ PR の URL のどれでもよい。**
//   ⚠ **記録には repo 名を付けて残す**（⚠ 裸の番号は移行すると別のものを指す。`CLAUDE.md` §9）。
//   ⚠ **repo の見分けは `../telemetry-dir.mjs` の 1 か所から借りる**（⚠ 2 つ持たない）。
//
// ## ⚠ 記録の置き場を、⚠ 自分で作らない
//
// ⚠ **無ければ、⚠ 見に行った場所を言って止まる**（⚠ `ask-slack.mjs` と同じ流儀）。
//   ⚠ **実測（2026-09-05）**: ⚠ **本物の記録は本体のチェックアウトにあり、
//   ⚠ `git worktree` の下からは見えない**（⚠ `.claude/telemetry/` が無い）。
//   ⚠ **黙って作ると、⚠ 台帳が 2 つになって、⚠ どちらも全部を持っていない状態になる。**
//
// ⚠ **これはフックではない。**⚠ **止まってよい**（⚠ 間違った値を黙って書くほうが悪い）。
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { telemetryDir, repoOf } from "../telemetry-dir.mjs";

// ⚠ **台帳の字は、⚠ ここ 1 か所**（⚠ 読む側 `telemetry-eval.mjs` も、⚠ ここから借りる）。
//   ⚠ **別々に持つと、⚠ 片方だけ増えたときに黙ってずれる**（⚠ 2026-08-24 に実証済み）。
export const DECISIONS_FILE = "decisions.jsonl";
export const OUTCOMES = ["即決", "迷った", "後で戻した"];

// ⚠ **キーは PR 番号。**⚠ **repo 名を付けて残す。**⚠ **付けられなければ番号だけ**
//   （⚠ そのときは呼んだ側が名乗る。⚠ **黙って落とさない**）。
export const prKeyOf = (raw, repo) => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const full = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(s);            // owner/repo#487
  if (full) return `${full[1]}#${full[2]}`;
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(s);
  if (url) return `${url[1]}/${url[2]}#${url[3]}`;
  const bare = /^#?(\d+)$/.exec(s);                             // <番号> ／ #<番号>
  if (!bare) return null;
  return repo ? `${repo}#${bare[1]}` : `#${bare[1]}`;
};

// ---------- 読む ----------
// ⚠ **読む側と同じ形で返す**（`telemetry-eval.mjs` の `readTasks` に倣う）。
//   ⚠ **壊れた行を黙って捨てない。**⚠ **何行読めなかったかを返す。**
export const readDecisions = (dir) => {
  const f = join(dir, DECISIONS_FILE);
  if (!existsSync(f)) return { rows: [], unreadable: [], missing: true };
  const rows = [], unreadable = [];
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try { rows.push(JSON.parse(line)); } catch { unreadable.push(i + 1); }
  });
  return { rows, unreadable, missing: false };
};

// ⚠ **同じ PR の最後の行を採る**（⚠ 追記だけ、という契約）。
//   ⚠ **知らない値は `不明` として数え、⚠ 名乗る**（⚠ 黙って捨てると母数が減る）。
//   ⚠ **PR を持たない行も同じ**（⚠ 手で書き足したときに起こりうる）。
export const decisionsOf = (rows) => {
  const 最後 = new Map();
  let PRが無い行 = 0;
  for (const r of rows ?? []) {
    const pr = typeof r?.pr === "string" && r.pr ? r.pr : null;
    if (!pr) { PRが無い行 += 1; continue; }
    最後.set(pr, r);                                   // ⚠ あとの行が前の行を置き換える
  }
  const 数 = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  let 不明 = 0;
  const 一覧 = [];
  for (const [pr, r] of 最後) {
    const v = typeof r?.outcome === "string" ? r.outcome : null;
    if (v && OUTCOMES.includes(v)) 数[v] += 1; else 不明 += 1;
    一覧.push({ pr, outcome: v, ts: r?.ts ?? null, 数えた: v && OUTCOMES.includes(v) });
  }
  return {
    // ⚠ **これは人が入れた値**（⚠ 出力自身に名乗らせる。⚠ 読む側が字を読まなくても分かるように）
    kind: "entered_by_human",
    記録がある_PR: 最後.size,
    行: (rows ?? []).length,
    値ごと: 数,
    不明,
    PRが無い行,
    一覧,
    注: "3 つの値は人が入れたもの（観測ではない）。良し悪しは測っていない",
  };
};

// ---------- 書く ----------
// ⚠ **書くのは 3 つだけ**（`ts` / `pr` / `outcome`）。
//   ⚠ **理由も、⚠ 誰が入れたかも持たない**（⚠ 記録に人名や本文を散らさない。⚠ 既存の台帳と同じ約束）。
export const 行にする = (pr, outcome, now = new Date()) =>
  ({ ts: now.toISOString(), pr, outcome });

const 使い方 = [
  "使い方:",
  "  node .claude/tools/decision.mjs --pr=<番号> --outcome=<即決|迷った|後で戻した>",
  "  node .claude/tools/decision.mjs --list [--json]",
  "",
  "⚠ 値は 3 つだけ（即決 ／ 迷った ／ 後で戻した）。",
  "⚠ 「後で戻した」は、同じ PR にもう 1 行足す（前の行は残る。読むときは最後の行）。",
].join("\n");

const 引数 = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};

const main = () => {
  const JSON_OUT = process.argv.includes("--json");
  const dir = telemetryDir();
  // ⚠ **作らない。**⚠ **見に行った場所を言って止まる**（⚠ 台帳を 2 つにしない）
  if (!existsSync(dir)) {
    process.stderr.write(`記録の置き場がありません: ${dir}\n`
      + "⚠ ここには作りません（⚠ 台帳が 2 か所に分かれると、⚠ どちらも全部を持たなくなる）。\n"
      + "⚠ 本体のチェックアウトから走らせるか、⚠ KONJAKU_TELEMETRY_DIR で場所を指してください。\n");
    process.exit(1);
  }

  if (process.argv.includes("--list")) {
    const { rows, unreadable } = readDecisions(dir);
    const s = decisionsOf(rows);
    if (JSON_OUT) {
      process.stdout.write(`${JSON.stringify({ ...s, 読めなかった行: unreadable.length }, null, 2)}\n`);
      return;
    }
    const L = ["見て決めた決定（⚠ 人が入れた値。⚠ 観測ではない）", ""];
    L.push(`記録がある PR: ${s.記録がある_PR}   ⚠ 分母。⚠ 記録していない PR は入っていない`);
    L.push(`  ${OUTCOMES.map((o) => `${o} ${s.値ごと[o]}`).join(" ／ ")}`);
    if (s.不明) L.push(`  ⚠ 知らない値: ${s.不明}（⚠ 3 つのどれでもない）`);
    if (s.PRが無い行) L.push(`  ⚠ PR を持たない行: ${s.PRが無い行}`);
    if (unreadable.length) L.push(`  ⚠ 読めなかった行: ${unreadable.length}`);
    L.push("");
    for (const r of s.一覧)
      L.push(`  ${String(r.pr).padEnd(24)} ${String(r.outcome ?? "-").padEnd(12)}`
        + ` ${String(r.ts ?? "-").slice(0, 16).replace("T", " ")}`);
    if (!s.一覧.length) L.push("  （まだ 1 件も記録がありません）");
    L.push("");
    L.push("⚠ これは良し悪しではない（⚠ 即決が良いという意味ではない）");
    L.push("⚠ 「Owner の手が入らなかった」（telemetry-eval.mjs）とは別の台帳");
    process.stdout.write(`${L.join("\n")}\n`);
    return;
  }

  const pr = prKeyOf(引数("pr"), repoOf());
  const outcome = 引数("outcome");
  if (!pr) {
    process.stderr.write(`⚠ --pr が読めません（${引数("pr") ?? "指定なし"}）。\n${使い方}\n`);
    process.exit(1);
  }
  // ⚠ **3 つ以外は書かない。**⚠ **止まってよい**（⚠ 間違った値が台帳に入るほうが悪い）
  if (!OUTCOMES.includes(outcome)) {
    process.stderr.write(`⚠ --outcome が 3 つのどれでもありません（${outcome ?? "指定なし"}）。\n`
      + `⚠ 使えるのは: ${OUTCOMES.join(" ／ ")}\n${使い方}\n`);
    process.exit(1);
  }
  // ⚠ **repo 名を付けられなかったことを、⚠ 黙って隠さない**
  if (!pr.includes("/"))
    process.stderr.write("⚠ repo 名を読めなかったので、番号だけで記録します"
      + "（⚠ 移行すると別のものを指します）。\n");

  const rec = 行にする(pr, outcome);
  appendFileSync(join(dir, DECISIONS_FILE), `${JSON.stringify(rec)}\n`);
  process.stdout.write(`記録しました: ${rec.pr} → ${rec.outcome}\n`
    + "⚠ 人が入れた値です（⚠ 観測ではない）。⚠ あとで戻したら、同じ PR にもう 1 行足してください。\n");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
