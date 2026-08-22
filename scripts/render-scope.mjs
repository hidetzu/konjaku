// 変更ファイルから、⚠ **どの実描画を回すか**を決める（2026-08-22。hidetzu/konjaku#187）。
//
//   node scripts/render-scope.mjs origin/main...HEAD
//
// ⚠ **出すのは「回すもの」だけ**（1 行 1 つ）:
//
//   peel core
//   top core
//   top search
//
// ⚠ **何も要らないときは、⚠ 何も出さない**（⚠ 呼ぶ側は「回さない」と読む）。
//
// ⚠ **いちばん大事な規則: 分からなければ全部に倒す。**
//   ⚠ **絞り込みで検査漏れを作らない。**⚠ 知らないファイルが 1 つでもあれば全部。
// ⚠ **判定はここ 1 か所。**⚠ CI と手元で同じものを使う
//   （⚠ `check.yml` に書き写すと、⚠ 片方だけ古くなる。CLAUDE.md §3）。
import { execFileSync } from "node:child_process";

// ⚠ **画面に届かないもの。**⚠ ここだけの変更なら、実描画は要らない
//   （⚠ hidetzu/konjaku#188 で決めた範囲と同じ意味）。
const NO_RENDER = [/^docs\//, /^\.claude\//, /^[^/]+\.md$/, /^\.github\/ISSUE_TEMPLATE\//];

// ⚠ **suite を名指しできるもの。**⚠ ここに無いものは全部に倒す。
const TO_SUITE = [
  [/^public\/peel\.html$/,           "peel"],
  [/^public\/peel3d\.js$/,           "peel"],
  [/^scripts\/render\/peel\.mjs$/,   "peel"],
  [/^public\/index\.html$/,          "top"],
  [/^public\/events\.js$/,           "top"],
  [/^public\/places\.js$/,           "top"],
  [/^scripts\/render\/top\.mjs$/,    "top"],
];

// ⚠ **一覧を直接渡す口**（`--files=a,b`）。⚠ **配線を確かめるために要る。**
//   ⚠ **判定は同じ道を通る**（⚠ 試すためだけの別経路を作らない）。
const given = (process.argv.find((a) => a.startsWith("--files=")) ?? "").split("=")[1];
const range = process.argv[2] ?? "origin/main...HEAD";
let files = [];
if (given !== undefined) files = given.split(",").filter(Boolean);
else

try {
  if (!given) files = execFileSync("git", ["diff", "--name-only", range], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
} catch {
  // ⚠ **差分を読めないときは、⚠ 全部に倒す。**⚠ 黙って 0 件にしない
  console.log("top core\ntop search\npeel core");
  process.exit(0);
}

const need = new Set();
let full = false;
for (const f of files) {
  if (NO_RENDER.some((re) => re.test(f))) continue;
  const hit = TO_SUITE.find(([re]) => re.test(f));
  if (hit) need.add(hit[1]);
  else full = true;                       // ⚠ 知らないもの → 全部
}
if (full) { need.add("top"); need.add("peel"); }

const out = [];
if (need.has("top")) { out.push("top core", "top search"); }
if (need.has("peel")) out.push("peel core");   // ⚠ peel に search のケースは 0 件
console.log(out.join("\n"));
