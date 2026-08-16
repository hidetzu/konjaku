// 配信物が GitHub のどの commit から出たのかを、外から確かめられるようにする。
//
// Service Worker の版（konjaku-xxxxxxxx）は SHELL の中身のハッシュなので、
// 新旧の配信物は区別できるが、**Git のどの commit かは分からない**。
// 障害対応のたびに Cloudflare の Build 画面と GitHub を突き合わせていた。
//
// `npm run build` が public/version.json を書き、Workers Builds は
// デプロイ前にこれを実行する（ビルドコマンド `npm run build` ／
// デプロイコマンド `npx wrangler deploy`）。
//
// ⚠ **生成物なので Git 管理しない**（.gitignore）。手元にある版と、
//   本番に出ている版は別物。ここを commit すると、配信物と中身がずれたまま
//   「この commit から出た」と名乗ることになる。
// ⚠ **/version.json は no-store**（public/_headers）。監視や curl が
//   古い版を「いまの本番」と読むと、照合そのものが嘘になる。
//   Cache API は HTTP の鮮度を見ないので、Service Worker にも持たせない
//   （sw.js の許可リストは .js / アイコン / webmanifest だけ。scripts/check.mjs が見ている）。

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Git の commit は 40桁の小文字16進数。短縮形も大文字も受けない。
// ⚠ 短縮形を通すと「GitHub の main HEAD と一致するか」を機械で照合できなくなる。
export const SHA_RE = /^[0-9a-f]{40}$/;

// ⚠ **何が正しい版かの定義は、ここ1か所だけ。**
//   scripts/check.mjs はこの関数を呼んで確かめる（字面を写さない）。
export function versionJson(commit, branch) {
  const c = typeof commit === "string" ? commit : "";
  if (!SHA_RE.test(c)) {
    throw new Error(`commit が 40桁の小文字16進数ではない: ${JSON.stringify(commit)}`);
  }
  const b = typeof branch === "string" ? branch.trim() : "";
  if (!b || /\s/.test(b)) {
    throw new Error(`branch が空か、空白を含んでいる: ${JSON.stringify(branch)}`);
  }
  return { commit: c, branch: b };
}

// Workers Builds が渡してくる値。
// ⚠ **片方だけあるときに git へ落とさない。** Workers Builds の作業コピーからも
//   git は読めてしまうが、それが配信物の出どころだという保証は無い。
//   「取得できなかった」を「手元と同じ」に化けさせないため、そのまま失敗させる。
function fromCi() {
  const commit = process.env.WORKERS_CI_COMMIT_SHA;
  const branch = process.env.WORKERS_CI_BRANCH;
  if (commit === undefined && branch === undefined) return null;   // 手元
  return { commit, branch, from: "Workers Builds" };
}

function fromGit() {
  const git = (...a) => {
    try {
      return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (e) {
      throw new Error(`git ${a.join(" ")} が読めない: ${String(e.message).split("\n")[0]}`);
    }
  };
  return { commit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"), from: "手元の git" };
}

async function main() {
  const src = fromCi() ?? fromGit();
  // ⚠ **開く前に全部確かめる。** 先に開くと、書き込み前に落ちたとき
  //   0 バイトの version.json が配信物に混ざる（掟「9. 踏んだ落とし穴」）。
  const v = versionJson(src.commit, src.branch);
  const out = join(new URL("..", import.meta.url).pathname, "public", "version.json");
  await writeFile(out, JSON.stringify(v, null, 2) + "\n");
  console.log(`public/version.json  commit=${v.commit} branch=${v.branch}（${src.from}）`);
}

// ⚠ import されたときは走らせない（check.mjs が versionJson だけを使う）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
