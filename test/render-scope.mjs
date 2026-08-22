// 変更ファイルから、⚠ **どの実描画を回すか**を決める（2026-08-22。hidetzu/konjaku#187）。
//
//   node test/render-scope.mjs origin/main...HEAD
//
// ⚠ **出すのは「回すもの」だけ**（1 行 1 つ）:
//
//   peel core
//   top core
//   top search
//
// ⚠ **`--json` を付けると、⚠ CI の matrix がそのまま食べられる形で出す**
//   （2026-08-22。hidetzu/konjaku#190）: `[{"suite":"top","group":"core"}, ...]`
// ⚠ **`--all` は「全部回す」一覧。**⚠ **main へ取り込むときに使う。**
//   ⚠ **以前は同じ一覧が `check.yml` にも書いてあった。**⚠ 2 か所に書くと片方だけ古くなる。
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
const NO_RENDER = [/^docs\//, /^\.claude\//, /^[^/]+\.md$/, /^\.github\/ISSUE_TEMPLATE\//,
  // ⚠ **検索の fixture は画面に届かない**（2026-08-22。hidetzu/konjaku#204）。
  //   ⚠ **実描画は 1 ケースも読まない。**⚠ 見るのは `test/search-check.mjs` だけ。
  /^test\/fixtures\/search\//,
  // ⚠ **実描画が読まない検査コード**（2026-08-22。hidetzu/konjaku#190）。
  //   ⚠ **線は「`render.mjs` が読むか」で引く**（上の規則と同じ）。
  //   ⚠ **実測（2026-08-22）**: `render.mjs` が取り込むのは
  //     `test/render/lib.mjs` / `test/render/top.mjs` / `test/render/peel.mjs` と
  //     `public/sw.js` だけ。⚠ **下のものは 1 行も読まない。**
  //   ⚠ **`test/render-scope.mjs` は入れない**（⚠ **回すものを決める当人**なので、
  //     ⚠ 変えたら実際に回して確かめる）。
  //   ⚠ **同じコミットで `public/` も触っていれば、⚠ そちらで回る。**⚠ 見張りは外れない。
  /^test\/check\.mjs$/, /^test\/search-check\.mjs$/,
  /^test\/repository-check\.mjs$/, /^test\/search-live-check\.mjs$/];

// ⚠ **suite を名指しできるもの。**⚠ ここに無いものは全部に倒す。
// ⚠ **どちらの画面が読むかは、⚠ HTML を数えて決めた**（2026-08-22。hidetzu/konjaku#190）。
//   ⚠ **憶測で足さない。**⚠ **`test/check.mjs` が、⚠ 実物と突き合わせて見張る。**
const TO_SUITE = [
  [/^public\/peel\.html$/,           "peel"],
  [/^public\/peel3d\.js$/,           "peel"],
  [/^public\/prov\.js$/,             "peel"],
  [/^public\/components\/era-control\//, "peel"],
  [/^test\/render\/peel\.mjs$/,      "peel"],
  [/^public\/index\.html$/,          "top"],
  [/^public\/events\.js$/,           "top"],
  [/^public\/places\.js$/,           "top"],
  [/^public\/gsi-address-search\.js$/, "top"],
  [/^test\/render\/top\.mjs$/,       "top"],
];

// ⚠ **全部回すときの一覧。**⚠ **ここ 1 か所で持つ**（2026-08-22。hidetzu/konjaku#190）。
const ALL = ["top core", "top search", "peel core"];

// ⚠ **重い群は、⚠ 何本かに分けて同時に回す**（2026-08-22。hidetzu/konjaku#190）。
//   ⚠ **実測（2026-08-22・PR hidetzu/konjaku#209 の CI）**: peel/core 5:12 ／ top/core 3:45 ／ top/search 1:23。
//   ⚠ **2 つずつに割ると**（手元の実測から換算）:
//     peel 2:24 / 2:48 ／ top 1:47 / 1:58 ／ search 1:23 → ⚠ **律速は 2:48。**
//   ⚠ **3 つに割ると偏る**（peel: 1:14 / 2:31 / 1:27）。⚠ **1 本が重いままなので効かない。**
//   ⚠ **search は割らない**（1:23 で、⚠ 割っても律速に届かない。⚠ 外へ出る口を増やさない）。
const SHARDS = { "top core": 2, "peel core": 2 };

// ⚠ **出し方は 2 つあるが、⚠ 決め方は 1 つ。**⚠ 形を変えるだけ。
const emit = (lines) => {
  if (process.argv.includes("--json")) {
    const out = [];
    for (const l of lines) {
      const [suite, group] = l.split(" ");
      const n = SHARDS[l] ?? 1;
      for (let i = 1; i <= n; i++) {
        // ⚠ **名で見せ、⚠ id で保存する。**⚠ id に `/` を入れると成果物の名前が壊れる。
        const shard = n > 1 ? `${i}/${n}` : "";
        out.push({ suite, group, shard,
          name: shard ? `${suite}/${group} ${shard}` : `${suite}/${group}`,
          id: shard ? `${suite}-${group}-${i}of${n}` : `${suite}-${group}` });
      }
    }
    console.log(JSON.stringify(out));
  } else {
    console.log(lines.join("\n"));
  }
};

// ⚠ **一覧を直接渡す口**（`--files=a,b`）。⚠ **配線を確かめるために要る。**
//   ⚠ **判定は同じ道を通る**（⚠ 試すためだけの別経路を作らない）。
// ⚠ **`--all` は差分を見ない。**⚠ **main へ取り込むときは、⚠ 必ず全部回す**
//   （⚠ PR で絞ったぶんを、⚠ ここで取り戻す）。
if (process.argv.includes("--all")) { emit(ALL); process.exit(0); }

const given = (process.argv.find((a) => a.startsWith("--files=")) ?? "").split("=")[1];
// ⚠ **範囲は「`--` で始まらない最初の引数」**（2026-08-22 に踏んで直した）。
//   ⚠ **前は `process.argv[2]` を範囲としていた。**
//   ⚠ **CI は `--json "origin/main...HEAD"` と、⚠ `--json` を先に書いていたので、
//     ⚠ 範囲が `--json` になり、⚠ `git diff --name-only --json` が失敗していた。**
//   ⚠ **失敗すると「分からなければ全部に倒す」ので、⚠ 落ちずに、⚠ 黙って全部走っていた。**
//   ⚠ **`--files=` と `--all --json` は試したのに、⚠ CI が使う形だけ試していなかった。**
const range = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "origin/main...HEAD";
let files = [];
if (given !== undefined) files = given.split(",").filter(Boolean);
else

try {
  if (!given) files = execFileSync("git", ["diff", "--name-only", range], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
} catch {
  // ⚠ **差分を読めないときは、⚠ 全部に倒す。**⚠ 黙って 0 件にしない
  emit(ALL);
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
emit(out);
