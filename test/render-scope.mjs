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
  //   ⚠ **ここに一覧を書き写さない。**⚠ **`test/check/deliver.mjs` が、
  //     ⚠ `render.mjs` の import を実際にたどって、⚠ この判定と突き合わせる**
  //     （⚠ **前は「実測（2026-08-22）: 取り込むのは lib / top / peel だけ」と
  //     ⚠ 書いてあったが、⚠ `test/render/shelf.mjs` が増えていて古くなっていた**）。
  //   ⚠ **`test/render-scope.mjs` は入れない**（⚠ **回すものを決める当人**なので、
  //     ⚠ 変えたら実際に回して確かめる）。
  //   ⚠ **同じコミットで `public/` も触っていれば、⚠ そちらで回る。**⚠ 見張りは外れない。
  //
  // ⚠ **`test/check/` の下ごと外す**（2026-08-24）。
  //   ⚠ **hidetzu/konjaku#232 で `check.mjs` を 11 本へ割ったとき、⚠ ここが取り残された。**
  //   ⚠ **落ちない。**⚠ **多く回す向きに倒れるので、⚠ CI は緑のまま。**
  //   ⚠ **実測: 検査コードだけを触った PR でも、⚠ 実描画が 5 本（約 9 分）走っていた。**
  /^test\/check\.mjs$/, /^test\/check\//,
  /^test\/search-check\.mjs$/,
  /^test\/repository-check\.mjs$/, /^test\/search-live-check\.mjs$/];

// ⚠ **suite を名指しできるもの。**⚠ ここに無いものは全部に倒す。
// ⚠ **どちらの画面が読むかは、⚠ HTML を数えて決めた**（2026-08-22。hidetzu/konjaku#190）。
//   ⚠ **憶測で足さない。**⚠ **`test/check.mjs` が、⚠ 実物と突き合わせて見張る。**
const TO_SUITE = [
  // ⚠ **2026-09-01 に、⚠ suite は `next` の 1 つになった**（`docs/adr/0080`）。
  //   ⚠ **β 版の画面（`peel` / `top`）は本番から消えた。**
  //   ⚠ **1 つしか無い間は、⚠ ここが効かない**（⚠ 全部に倒れても `next` だけ）。
  //   ⚠ **2 つ目の suite を足したら、⚠ ここも足す**（⚠ 足し忘れは多く回る向きに倒れ、
  //     ⚠ 落ちないので気づけない。⚠ この repo で 2 回踏んでいる）。
  [/^public\//,                       "next"],
  [/^test\/render\/next\.mjs$/,        "next"],
  [/^worker\.js$/,                    "next"],
  [/^handoff\.js$/,                   "next"],
  [/^test\/handoff-fake-d1\.mjs$/,    "next"],
];

// ⚠ **全部回すときの一覧。**⚠ **ここ 1 か所で持つ**（2026-08-22。hidetzu/konjaku#190）。
// ⚠ **全部回すときの一覧。**⚠ **ここ 1 か所で持つ。**
// ⚠ **2026-09-01: β 版の suite（top / peel）を落とした。**⚠ 残るのは v0.1.0 だけ。
// ⚠ **`next` にも `search` の群がある**（⚠ 1 件。⚠ 地理院の住所検索を実際に叩く）。
// ⚠ **落とすと、⚠ 走者が数える件数と、⚠ 書いてあるケース数が合わなくなる**
//   （⚠ 2026-09-01 に実際に踏んだ。⚠ 82 件 vs 83 件で `deliver.mjs` が落ちた）。
const ALL = ["next core", "next search"];

// ⚠ **重い群は、⚠ 何本かに分けて同時に回す**（2026-08-22。hidetzu/konjaku#190）。
//   ⚠ **実測（2026-08-22・PR hidetzu/konjaku#209 の CI）**: peel/core 5:12 ／ top/core 3:45 ／ top/search 1:23。
//   ⚠ **2 つずつに割ると**（手元の実測から換算）:
//     peel 2:24 / 2:48 ／ top 1:47 / 1:58 ／ search 1:23 → ⚠ **律速は 2:48。**
//   ⚠ **3 つに割ると偏る**（peel: 1:14 / 2:31 / 1:27）。⚠ **1 本が重いままなので効かない。**
//   ⚠ **search は割らない**（1:23 で、⚠ 割っても律速に届かない。⚠ 外へ出る口を増やさない）。
// ⚠ **2026-09-01: 分割は無し。**⚠ **`next core` は実測 2 分台**（⚠ β の peel は 5 分台だった）。
// ⚠ **重くなったら、⚠ ここに書いて分ける。**
const SHARDS = {};

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
  // ⚠ **`-z` で受け取る**（2026-08-23 に踏んで直した。hidetzu/konjaku#222 で発覚）。
  //   ⚠ **`git diff --name-only` は、⚠ 非 ASCII のパスを C 形式で引用して返す**
  //     （`core.quotepath` の既定が `true`）:
  //
  //       "…/0020-\346\225\260\345\255\227….md"
  //        ↑ ⚠ **先頭が二重引用符**
  //   ⚠ **ここに実在するファイル名を書かない**（⚠ ADR の実在を見る検査が、⚠ この字面を拾う）。
  //
  //   ⚠ **すると下の `/^docs\//` に一致せず、⚠ 「知らないもの」として全部に倒れる。**
  //   ⚠ **`docs/adr/` はほぼ全部が日本語名**なので、⚠ **ADR を触るたびに 5 本走っていた。**
  //   ⚠ **落ちない。**⚠ **多く回す向きに倒れるので、⚠ CI は緑のまま。**
  //   ⚠ **手元では気づけない**（⚠ `core.quotepath=false` を個人設定にしている人がいる）。
  //   ⚠ **`-c core.quotepath=false` ではなく `-z` を使う。**
  //     ⚠ あちらは非 ASCII の引用だけを止めるので、⚠ **`"` や改行を含むパスは引用されたまま。**
  //     ⚠ **`-z` は何があっても引用しない。**
  if (!given) files = execFileSync("git", ["diff", "--name-only", "-z", range], { encoding: "utf8" })
    .split("\0").map((s) => s.trim()).filter(Boolean);
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
// ⚠ **知らないものが 1 つでもあれば、⚠ 全部に倒す**（⚠ 絞り込みで検査漏れを作らない）。
//   ⚠ **`next` も含める**（2026-08-29）。⚠ **ここに足し忘れると、
//     ⚠ 知らないファイルを触ったときに v0.1.0 だけ回らない。**⚠ **落ちないので気づけない。**
// ⚠ **2026-09-01: suite は `next` だけになった**（`docs/adr/0080`）。
//   ⚠ **足すときは、⚠ ここと `ALL` の両方**（⚠ 片方だけだと、⚠ 静かに回らない）。
if (full) need.add("next");

const out = [];
if (need.has("next")) out.push("next core", "next search");
emit(out);
