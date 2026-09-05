// 計測の記録を、どこに置くか ／ どの repo の番号か（⚠ **ここ 1 か所**）
//
// ⚠ **書く側と読む側が、⚠ 別々に同じ字を持っていた**（2026-08-24 に寄せた）。
//
//     .claude/hooks/telemetry.mjs        書く側
//     .claude/hooks/ask-slack.mjs        書く側（⚠ OwnerAsk。⚠ 置き場だけ借りる）
//     .claude/tools/telemetry-eval.mjs   読む側
//     .claude/tools/decision.mjs         書く側・読む側（⚠ 見て決めた決定。⚠ 人が入れる）
//     .claude/tools/improvement.mjs      読む側
//     test/check/guard.mjs               走査から外す ／ git が追跡していないか見る
//
// ⚠ **実証した**（2026-08-24。⚠ **寄せる前**）: ⚠ **書く側だけ置き場所を変えても、
//   ⚠ `npm run check` は 1 件も落ちなかった。**
//   ⚠ **読む側は空の場所を読み続け、⚠ 誰も気づかない。**
//   ⚠ **さらに `.gitignore` は元の名前を外しているので、⚠ 記録が git に入り始める**
//   （⚠ **「git に入れない」という約束が、⚠ 黙って破れる**）。
//
// ⚠ **`CLAUDE.md` §3 / ADR 0021: ⚠ 同じ問いに答える実装を 2 つ持たない。**
//
// ⚠ **`.gitignore` だけは、⚠ ここから読ませられない**（⚠ git の書式で、⚠ コードではない）。
//   ⚠ **だから、⚠ 機械で突き合わせる**（`test/check/guard.mjs`。
//   ⚠ **ここの既定が、⚠ `.gitignore` で外されているか**を見る）。
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ⚠ **`.claude/` の下の、⚠ この名前**（⚠ `.gitignore` が外しているのと同じ字）。
export const TELEMETRY_DIR_NAME = "telemetry";

// ⚠ **`.gitignore` に書く形**（⚠ 検査が、⚠ この字で突き合わせる）。
export const TELEMETRY_IGNORE_LINE = `.claude/${TELEMETRY_DIR_NAME}/`;

// ⚠ **プロジェクトの根**。⚠ `CLAUDE_PROJECT_DIR` は Claude Code が Hook へ渡す
//   （⚠ **セッションを始めた場所**）。⚠ 無ければ、⚠ このファイルの位置から遡る。
export const projectRoot = () => process.env.CLAUDE_PROJECT_DIR
  ?? join(dirname(fileURLToPath(import.meta.url)), "..");

// ⚠ **書き先・読み先。**⚠ **`KONJAKU_TELEMETRY_DIR` ですげ替えられる**
//   （⚠ 検査が、⚠ 本物の記録を汚さずに通しで試すため）。
export const telemetryDir = () => process.env.KONJAKU_TELEMETRY_DIR
  ?? join(projectRoot(), ".claude", TELEMETRY_DIR_NAME);

// ⚠ **どの repo の番号か**（⚠ 2026-09-05 に、⚠ `hooks/telemetry.mjs` から出した）。
//
// ⚠ **裸の番号は、⚠ 移行すると別のものを指す**（`CLAUDE.md` §9）。
//   ⚠ **だから記録には repo 名を付ける**（`hidetzu/konjaku#487`）。
//
// ⚠ **出した理由**: ⚠ **Issue の番号（`hooks/telemetry.mjs`）と、
//   ⚠ PR の番号（`tools/decision.mjs`）が、⚠ 同じ問いに答え始めた**
//   （⚠ 「いま居るのはどの repo か」）。⚠ **2 つ持つと、⚠ 片方だけ直したときに、
//   ⚠ 同じ PR が 2 つの名前で記録される**（`CLAUDE.md` §3）。
//
// ⚠ **読めなければ `null`。**⚠ **`null` を「repo が無い」と読ませない**（⚠ 分からない、の意味）。
export const repoOf = (root = projectRoot()) => {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = /(?:[:/])([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch { return null; }
};
