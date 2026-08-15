// 共有率を出す。掟: 唯一の指標は共有率 で決めた唯一の指標。
//
//   npm run stats            直近30日
//   npm run stats -- 90      直近90日
//
// D1 に貯めているので、いつ見ても消えていない（Workers Logs は保持3日だった）。
// 数えているのは「その日に何が何回起きたか」だけで、誰が・どこを調べたかは持っていない。
import { execFileSync } from "node:child_process";

const days = Number(process.argv[2] ?? 30);
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "konjaku",
    "--remote", "--json", "--command", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0]?.results ?? [];
};

const num = (n) => String(n).padStart(6);
let rows;
try {
  rows = sql(`SELECT day, event, n FROM tick WHERE day >= date('now', '-${days} day') ORDER BY day`);
} catch (e) {
  console.error("D1 を読めませんでした。wrangler login は済んでいますか。");
  console.error(String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n"));
  process.exit(1);
}

const byDay = new Map();
for (const r of rows) {
  if (!byDay.has(r.day)) byDay.set(r.day, {});
  byDay.get(r.day)[r.event] = r.n;
}

const total = {};
for (const d of byDay.values()) for (const [k, v] of Object.entries(d)) total[k] = (total[k] ?? 0) + v;

// 分母は「判定が出た回数」。出せなかった回（none / fail）は、共有しようがないので入れない。
const judged = (total["judged.ok"] ?? 0) + (total["judged.coarse"] ?? 0);
const shared = total["shared"] ?? 0;
const saved  = total["saved"] ?? 0;

console.log(`\n直近 ${days} 日\n`);
console.log("  日付        判定  うち粗  出ない  読めず  共有  保存  年代  3D  音声");
for (const [day, d] of [...byDay].sort()) {
  console.log(`  ${day}  ${num(d["judged.ok"] ?? 0)}${num(d["judged.coarse"] ?? 0)}`
    + `${num(d["judged.none"] ?? 0)}${num(d["judged.fail"] ?? 0)}`
    + `${num(d["shared"] ?? 0)}${num(d["saved"] ?? 0)}`
    + `${num(d["era.moved"] ?? 0)}${num(d["open.peel"] ?? 0)}${num(d["open.speak"] ?? 0)}`);
}

const moved = total["era.moved"] ?? 0;

console.log(`\n  判定が出た      ${judged}`);
console.log(`  共有            ${shared}`);
console.log(`  画像として保存   ${saved}`);
console.log(`  年代を動かした   ${moved}`);
console.log(`  3Dを開いた       ${total["open.peel"] ?? 0}`);
console.log(`  読み上げた       ${total["open.speak"] ?? 0}`);
if (judged < 100) {
  // 0/3 と 0/100 は別のこと。少ない分母で率を読むと、そこから先の判断が全部ずれる
  console.log(`\n  ⚠ 判定が ${judged} 件。100件たまるまで共有率は読まない（掟: 判定が100件たまるまで共有率を読まない）`);
} else {
  console.log(`\n  共有率 ${(shared / judged * 100).toFixed(1)}%  （共有 ÷ 判定が出た回数）`);
  console.log(`  保存も含めると ${((shared + saved) / judged * 100).toFixed(1)}%`);
}

// 時間を動かす体験が触られているか（掟: 中間を語らない。中間は見せる）。
// ⚠ 率で読むのは判定が100件たまってから。ここも 0/3 と 0/100 は別のこと。
//   ただし「1件も動かされていない」は件数のうちから意味があるので、そこだけは先に言う。
if (judged >= 100) {
  console.log(`\n  年代を動かした割合 ${(moved / judged * 100).toFixed(1)}%  （動かした回数 ÷ 判定）`);
} else if (judged > 0 && moved === 0) {
  console.log(`\n  ⚠ 判定 ${judged} 件のうち、年代を動かしたのは 0 回。`);
  console.log(`    帯が押せると気づかれていない可能性がある（率以前の問題）`);
}

// 流入の出所。⚠ 判定が30件に届かないうちは、共有率より先にこちらを見る。
// 分母が足りないなら、それは「面白くない」ではなく「人が来ていない」問題。
// 「面白くなかった」のか「そもそも誰も来ていない」のかは、まったく別の問題。
const from = Object.entries(total).filter(([k]) => k.startsWith("from:"));
if (from.length) {
  console.log(`\n  流入の出所（?from= を付けたリンク）`);
  for (const [k, v] of from.sort((a, b) => b[1] - a[1]))
    console.log(`    ${k.slice(5).padEnd(10)} ${num(v)}`);
} else if (judged < 30) {
  console.log(`\n  流入の出所: まだ1件も無い。?from= を付けたリンクをどこにも貼っていない`);
}

// 依存の生死。共有率がゼロだったとき「面白くなかった」のか「壊れていた」のかを分ける
const h = sql(`SELECT target, SUM(ok) ok, SUM(fail) fail FROM health
               WHERE day >= date('now', '-${days} day') GROUP BY target`);
if (h.length) {
  console.log(`\n  依存の生死（読めた / 読めなかった）`);
  for (const r of h) {
    const t = r.ok + r.fail;
    const bad = t ? (r.fail / t * 100) : 0;
    console.log(`    ${String(r.target).padEnd(10)} ${num(r.ok)} / ${num(r.fail)}`
      + (bad >= 5 ? `   ⚠ ${bad.toFixed(1)}% 落ちている` : ""));
  }
}
console.log();
