// 静的検査 — 人の判断を飛ばさない（⚠ **秘密と、⚠ 止まる仕掛け**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 11 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**:
//     Slack の秘密がリポジトリに無い   ⚠ **送り先とトークンを、⚠ コードに焼き付けない**
//     人に聞けなくならない             ⚠ **聞く仕掛けが、⚠ 黙って壊れていないか**
//     Skill と Hook が判断を飛ばさない  ⚠ **AI が人の代わりに決められる書き方**になっていないか
//
// ⚠ **どれも「機械が勝手に進まないこと」を守っている。**
//   ⚠ `CLAUDE.md` §7-1: ⚠ **聞くのは、⚠ 間違えたときに取り返しがつかないものだけ。**
//   ⚠ **その「聞く」が壊れると、⚠ 誰も気づかないまま進む。**
//
// ⚠ **`safety.mjs`（外との境目）とは別。**⚠ あちらは ⚠ **外へ何を出しているか**。
//   ⚠ こちらは ⚠ **人が止められるか。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, bad, head, dropCommentOrHash, walkFiles, BLOCK_COMMENT, HEAD_COMMENT } from "./lib.mjs";
// ⚠ **計測の置き場所は `.claude/telemetry-dir.mjs` の 1 か所**（2026-08-24 に寄せた）。
//   ⚠ **ここで字を持ち直さない。**⚠ **持ち直すと、⚠ 寄せた意味が無くなる。**
import { TELEMETRY_DIR_NAME, TELEMETRY_IGNORE_LINE } from "../../.claude/telemetry-dir.mjs";

head("人の判断を飛ばさない");

// 人の判断を待つときだけ Slack へ知らせる Hook（.claude/hooks/notify-slack.sh）。
// ⚠ ここで見るのは 2 つだけ。**どちらも、間違えると静かに壊れる種類**のもの。
//   1. 送り先（Webhook URL）がリポジトリに入っていないこと
//   2. Hook が、質問そのものをせき止めないこと
// ⚠ 何を聞くか・どこで聞くかの線引きは CLAUDE.md §7-1。ここでは見ない（責務が別）。
{
  const HOOK = ".claude/hooks/ask-slack.mjs";
  const SETTINGS = ".claude/settings.json";
  const { execFileSync: exH } = await import("node:child_process");
  let tracked = [];
  try {
    tracked = exH("git", ["ls-files"], { encoding: "utf8", cwd: ROOT }).split("\n").filter(Boolean);
  } catch { bad("git ls-files が使えない（Hook の検査が何も見ていない）"); }

  // ---- 1. 送り先をリポジトリに置かない ----
  // ⚠ 一度でも入ると、履歴に残る。入る前に落とす。
  // ⚠ ここに実物の形を書かない。書くと、この検査が自分のコメントを拾う（CLAUDE.md §5。4 回目に踏んだ）。
  {
    const host = ["hooks", "slack", "com"].join(".");
    const tok = ["xoxb", "xapp", "xoxp"];
    const hits = [];
    for (const f of tracked) {
      let buf; try { buf = await readFile(join(ROOT, f)); } catch { continue; }
      if (buf.includes(0)) continue;
      buf.toString("utf8").split("\n").forEach((line, i) => {
        // ホスト名だけなら説明。**その先に道が付いていたら**送り先そのもの
        if (new RegExp(`${host.replace(/\./g, "\\.")}/\\S`).test(line)) hits.push(`${f}:${i + 1} 送り先`);
        // ⚠ トークンは、印のあとに中身が続いていたら本物とみなす
        for (const t of tok) if (new RegExp(`${t}-[A-Za-z0-9]{8}`).test(line)) hits.push(`${f}:${i + 1} ${t}`);
      });
    }
    hits.length
      ? bad(`Slack の秘密がリポジトリに入っている: ${hits.join("、")}`
          + `（環境変数か .envrc から読むこと。一度入ると履歴に残る）`)
      : ok(`Slack の秘密はリポジトリに入っていない（${tracked.length} ファイル・送り先とトークン 3 種を走査）`);
  }

  // ---- 2. 人に聞けなくならないこと ----
  // ⚠ **守りたいのは「exit 0」ではない。「人に聞けなくならないこと」。**
  //   2026-08-18 に、この Hook は「知らせるだけ（待たない）」から
  //   「Slack で聞いて答えを受け取る（待つ）」に変わった。**待つのが目的**なので、
  //   「絶対に止まらない」はもう成り立たない。縛り直したのは次の 3 つ:
  //     ① 待ちに上限があること（無限に待たない）
  //     ② 上限が Hook 自身の timeout より内側であること
  //     ③ 何が起きても exit 0（＝答えが取れなければ端末で聞く形に落ちる）
  //   ⚠ ①②が無いと、Slack を見ていない日に**セッションが黙って固まる**。
  {
    const fails = [];
    let waitMs = null, hookTimeoutSec = null;
    if (!existsSync(join(ROOT, HOOK))) fails.push(`${HOOK} が無い`);
    else {
      const js = await readFile(join(ROOT, HOOK), "utf8");
      const code = js.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      // ① 上限
      const w = /WAIT_MS\s*=\s*([\d_]+)/.exec(code);
      if (!w) fails.push("待ちの上限（WAIT_MS）が無い（無限に待ちうる）");
      else waitMs = Number(w[1].replace(/_/g, ""));
      // ③ 落ちても、聞けなくならない
      if (!/process\.exit\(0\)/.test(code)) fails.push("exit 0 で終わる道が無い");
      // ⚠ `.catch(() => {})` を数えない。**外側の try/catch** があるかを見る。
      //   最初 /catch\s*\(/ で書いて、外側の受け皿を消しても緑のままだった（2026-08-18）。
      if (!/^\}\s*catch\s*\(/m.test(code)) fails.push("外側の受け皿（try/catch）が無い（例外で質問ごと止まる）");
      // 答えとして採ってよいものが絞られていること
      if (!/optionsOf|options/.test(code)) fails.push("こちらが出した選択肢と突き合わせていない");
      // ⚠ 履歴を読みに行かないこと（読むと、そのチャンネルの全発言が届く）
      if (/conversations\.(history|replies)/.test(code))
        fails.push("チャンネルの履歴を読んでいる（答え 1 つのために全発言を読まない）");
      // ⚠ **誰が答えたかを持ち出さない。** 答えの正しさに、誰が押したかは関係ない。
      //   混ぜると transcript・ログ・PR 本文に人名が散る。要るなら Slack 側を見ればよい。
      if (/\buser\?\.(username|id|name)|\buser\.(username|id|name)\b/.test(code))
        fails.push("答えた人の名前や id を読んでいる（記録に人名を散らさない）");
      // ⚠ env ファイルを丸ごと読み込まない
      if (/\brequire\(.*\.envrc|source\s+\S*\.env/.test(code))
        fails.push("env ファイルを丸ごと読んでいる（任意のシェルコードが走る）");
      const { statSync } = await import("node:fs");
      if (!(statSync(join(ROOT, HOOK)).mode & 0o111)) fails.push("実行権が無い");
    }
    // 診断の道具も同じ扱い。⚠ 手元の出力でも人名を出さない
    {
      const doc = ".claude/hooks/slack-doctor.mjs";
      if (!existsSync(join(ROOT, doc))) fails.push(`${doc} が無い`);
      else if (/\buser\?\.(username|id|name)|\buser\.(username|id|name)\b/
        .test((await readFile(join(ROOT, doc), "utf8")).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")))
        fails.push(`${doc} が答えた人の名前や id を読んでいる`);
    }
    // settings.json が、実在する Hook を指していること
    if (!existsSync(join(ROOT, SETTINGS))) fails.push(`${SETTINGS} が無い`);
    else {
      let j; try { j = JSON.parse(await readFile(join(ROOT, SETTINGS), "utf8")); }
      catch { fails.push(`${SETTINGS} が JSON として壊れている`); }
      const hs = (j?.hooks?.PreToolUse ?? []).flatMap((g) =>
        g.matcher === "AskUserQuestion" ? (g.hooks ?? []) : []);
      if (!hs.length) fails.push("AskUserQuestion の PreToolUse Hook が設定されていない");
      for (const h of hs) {
        const rel = (h.command ?? "").replace(/^\$\{[^}]+\}\//, "");
        if (!existsSync(join(ROOT, rel))) fails.push(`指している ${rel} が無い`);
        if (typeof h.timeout === "number") hookTimeoutSec = h.timeout;
      }
      if (hookTimeoutSec == null) fails.push("Hook の timeout が書かれていない（既定 600 秒に任せない）");
    }
    // ② 待ちの上限は、Hook の timeout の内側
    if (waitMs != null && hookTimeoutSec != null && waitMs >= hookTimeoutSec * 1000)
      fails.push(`待ちの上限 ${waitMs / 1000} 秒が Hook の timeout ${hookTimeoutSec} 秒の外側`
        + `（先に Hook ごと切られる＝スレッドに一言返す道が通らない）`);
    // 送り先を書いたファイルが、追跡されていないこと
    // ⚠ .gitignore を読んで確かめない。**git が実際にどう扱っているか**で見る
    for (const f of [".envrc", ".env"])
      if (tracked.includes(f)) fails.push(`${f} が git に入っている（秘密が履歴に残る）`);
    fails.length
      ? bad(`人に聞けなくなりうる: ${fails.join(" / ")}`
          + `（Slack が駄目でも、必ず端末で聞けること）`)
      : ok(`人に聞けなくならない（待ち ${waitMs / 1000} 秒 < Hook の timeout ${hookTimeoutSec} 秒`
          + `・落ちても exit 0・履歴を読まない・人名を持ち出さない`
          + `・.envrc / .env は git に入っていない）`);
  }
}

// ⚠ **AI が、人の代わりに「渡してよい」と決めないこと。**
//   Loop Engineering の入口は `ready-for-ai` ラベルで、**付けるのは人だけ**
//   （CLAUDE.md 「自分で決める／人に聞く」の節）。
//   ⚠ Skill や Hook にラベル付与・自動 merge の手順を書くと、**そこが素通りになる**。
// ⚠ **`.claude/` の中だけを見る。**この検査自身（scripts/）や、禁じ手を説明している
//   文書まで拾うと、書いた瞬間に落ちる（コメントを先に落とす規則と同じ話）。
{
  // ⚠ **歩き方は `lib.mjs` の `walkFiles` の 1 か所**（2026-08-26。hidetzu/konjaku#276）。
  //   ⚠ **飛ばす先（`telemetry/` ／ `worktrees/`）の理由も、⚠ 向こうに書いてある。**
  //   ⚠ **ここで持ち直さない。**⚠ **持ち直すと、⚠ 片方だけ古くなる**（`CLAUDE.md` §5）。
  // ⚠ **起点も同じ行に置く**（⚠ **`check.mjs` の見張りが、⚠ 行で見ているため**）。
  //   ⚠ **無い場所を渡されても落ちない**のは `walkFiles` が持っている（⚠ 前は `existsSync` で見ていた）。
  const files = walkFiles(join(ROOT, ".claude"));
  const FORBIDDEN = [
    { re: /--add-label[^\n]*ready-for-ai|ready-for-ai[^\n]*--add-label/, why: "ready-for-ai を自分で付けている" },
    { re: /gh\s+pr\s+merge[^\n]*--auto/, why: "PR を自動 merge している" },
    { re: /gh\s+(pr|issue)[^\n]*--admin/, why: "保護を飛び越えている（--admin）" },
    { re: /gh\s+issue\s+close/, why: "Issue を自分で閉じている" },
    // ⚠ **Issue を起こすのは人**（2026-08-24。`docs/adr/0037`）。
    //   ⚠ **`product-discovery` は Draft を書くところまで。**⚠ **登録は人がする。**
    //   ⚠ **実測（足す前）: `.claude/` 全体で該当 0 件。**⚠ 既存の Skill は 1 つも使っていない。
    { re: /gh\s+issue\s+(create|new)/, why: "Issue を自分で起こしている" },
    { re: /gh\s+issue\s+edit/, why: "Issue を自分で書き換えている" },
  ];
  // ⚠ **地の文を読まない。手順として書かれた行だけを見る。**
  //   最初は「〜しない」を含む行を飛ばす形にしたが、**言い方の一覧は永遠に埋まらない**。
  //   実測（2026-08-19）: 「⚠ gh issue close は使わない。」で落ちた（「使わない」が漏れていた）。
  //   ⚠ CLAUDE.md 「コメント」の節と同じ踏み方（字面で拾うと、説明文まで拾う）。
  //   → .md はコード枠（```）の中だけ、それ以外は行コメントを落としてから見る。
  const steps = (f, src2) => {
    if (f.endsWith(".md")) {
      const out = []; let inFence = false;
      for (const line of src2.split("\n")) {
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) out.push(line);
      }
      return out;
    }
    return src2.split("\n").map(dropCommentOrHash);
  };
  const hits = [];
  for (const f of files) {
    let src2 = ""; try { src2 = await readFile(f, "utf8"); } catch { continue; }
    for (const line of steps(f, src2))
      for (const g of FORBIDDEN)
        if (g.re.test(line)) hits.push(`${f.replace(ROOT + "/", "")}: ${g.why}`);
  }
  // ⚠ ラベルの意味が書かれていること。書いていないと、人も何を見て付けるか分からない
  const rule = await readFile(join(ROOT, "CLAUDE.md"), "utf8").catch(() => "");
  if (!/ready-for-ai/.test(rule)) hits.push("CLAUDE.md に ready-for-ai の意味が書かれていない");
  hits.length
    ? bad(`AI が人の判断を飛ばせる書き方が入っている: ${[...new Set(hits)].join(" / ")}`
        + `（ラベルを付けるのも merge するのも人。Skill は判定を返すところまで）`)
    : ok(`Skill と Hook は、人の判断を飛ばさない（${files.length} ファイル・`
        + `ラベル付与／自動 merge／--admin／Issue を 閉じる・起こす・書き換える が無く、`
        + `ready-for-ai の意味は CLAUDE.md にある）`);
}

// ⚠ **計測が、作業を止めないこと**（2026-08-24。`.claude/hooks/telemetry.mjs`）。
//
// ⚠ **`UserPromptSubmit` と `Stop` は、exit 2 で止まる Hook。**
//   ⚠ **前者はプロンプトごと消え、⚠ 後者は会話が終われなくなる。**
//   ⚠ **観測のために作業が止まったら本末転倒。**だから、⚠ **止まらないことを的にする。**
//
// ⚠ **字面だけで見ない。**⚠ **実際に走らせて、⚠ 出てきたものを読む**
//   （`CLAUDE.md` §9: ⚠ **突き合わせる相手は、⚠ 別の道で得たものにする**）。
//   ⚠ **「`try/catch` がある」を見ても、⚠ 本当に 0 で終わるかは分からない。**
//
// ⚠ **本物の計測は汚さない。**⚠ `KONJAKU_TELEMETRY_DIR` で書き先をすげ替える。
head("計測が、作業を止めない");

{
  const HOOK = ".claude/hooks/telemetry.mjs";
  const SETTINGS = ".claude/settings.json";
  const { execFileSync: exT } = await import("node:child_process");
  const { mkdtempSync, rmSync, statSync, readFileSync: rfT, existsSync: exsT } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  // ---- 1. 仕掛けが揃っている ----
  {
    const fails = [];
    if (!exsT(join(ROOT, HOOK))) fails.push(`${HOOK} が無い`);
    else if (!(statSync(join(ROOT, HOOK)).mode & 0o111)) fails.push(`${HOOK} に実行権が無い`);

    const wired = [];
    if (!exsT(join(ROOT, SETTINGS))) fails.push(`${SETTINGS} が無い`);
    else {
      let j; try { j = JSON.parse(await readFile(join(ROOT, SETTINGS), "utf8")); }
      catch { fails.push(`${SETTINGS} が JSON として壊れている`); }
      // ⚠ **2 つとも要る。**⚠ 片方だけだと、⚠ **始まりか終わりのどちらかが永久に欠ける**
      for (const ev of ["UserPromptSubmit", "Stop"]) {
        const hs = (j?.hooks?.[ev] ?? []).flatMap((g) => g.hooks ?? [])
          .filter((h) => /telemetry\.mjs$/.test(h.command ?? ""));
        if (!hs.length) { fails.push(`${ev} に計測の Hook が無い`); continue; }
        for (const h of hs) {
          const rel = (h.command ?? "").replace(/^\$\{[^}]+\}\//, "");
          if (!exsT(join(ROOT, rel))) fails.push(`${ev} が指している ${rel} が無い`);
          // ⚠ **既定の 600 秒に任せない。**⚠ 計測が固まったら、⚠ **その分だけ会話が待たされる**
          if (typeof h.timeout !== "number") fails.push(`${ev} の timeout が書かれていない`);
          else if (h.timeout > 30) fails.push(`${ev} の timeout が ${h.timeout} 秒（長すぎる）`);
          else wired.push(`${ev} ${h.timeout}秒`);
        }
      }
    }
    // ⚠ **git に入っていないこと。**⚠ .gitignore を読んで確かめない。
    //   ⚠ **git が実際にどう扱っているか**で見る（⚠ 上の Slack の検査と同じ流儀）
    try {
      const t = exT("git", ["ls-files", `.claude/${TELEMETRY_DIR_NAME}`], { encoding: "utf8", cwd: ROOT }).trim();
      if (t) fails.push(`計測の出力が git に入っている: ${t.split("\n").join("、")}`);
    } catch { fails.push("git ls-files が使えない（追跡されていないことを確かめていない）"); }

    // ⚠ **`.gitignore` だけは、⚠ コードから借りられない**（⚠ git の書式で、⚠ コードではない）。
    //   ⚠ **だから、⚠ 機械で突き合わせる**（`CLAUDE.md` §3: ⚠ やむを得ず 2 つ持つときは突き合わせる）。
    //   ⚠ **置き場所の名前を変えたのに `.gitignore` を直し忘れると、
    //   ⚠ 記録が git に入り始める**（⚠ **「git に入れない」という約束が黙って破れる**）。
    {
      const ig = await readFile(join(ROOT, ".gitignore"), "utf8").catch(() => "");
      if (!ig.split("\n").map((l) => l.trim()).includes(TELEMETRY_IGNORE_LINE))
        fails.push(`.gitignore が ${TELEMETRY_IGNORE_LINE} を外していない`
          + `（⚠ 置き場所は .claude/telemetry-dir.mjs が持つ。⚠ 名前を変えたら両方を直す）`);
    }
    fails.length
      ? bad(`計測の仕掛けが揃っていない: ${fails.join(" / ")}`
          + `（⚠ 始まりと終わりの両方が要る。⚠ 出力は git に入れない）`)
      : ok(`計測の Hook が両端に付いている（${wired.join(" ／ ")}・出力は git の外`
          + `・置き場所 ${TELEMETRY_IGNORE_LINE} は .gitignore が外している）`);
  }

  // ---- 2. ⚠ 実際に走らせる（⚠ **止まらない／中身を持ち出さない**） ----
  {
    const fails = [];
    const dir = mkdtempSync(join(tmpdir(), "konjaku-tel-"));
    // ⚠ **この目印が記録に出てきたら、⚠ 本文を持ち出している**
    const MARK = "kensa-himitsu-9f3a";
    const feed = (label, input) => {
      try {
        const out = exT("node", [join(ROOT, HOOK)], {
          input, cwd: ROOT, encoding: "utf8", timeout: 20_000,
          env: { ...process.env, KONJAKU_TELEMETRY_DIR: dir },
          stdio: ["pipe", "pipe", "pipe"],
        });
        // ⚠ **stdout は空でなければならない。**⚠ `UserPromptSubmit` の stdout は
        //   ⚠ **Claude への追加文脈として読まれる**（⚠ 計測が会話へ混ざる）
        if (out !== "") fails.push(`${label}: stdout へ出している（会話へ混ざる）: ${out.slice(0, 40)}`);
      } catch (e) {
        fails.push(`${label}: 0 以外で終わった（status=${e?.status ?? "?"}）`);
      }
    };
    // ⚠ **壊れた入力で止まらない**（⚠ 実際に起こりうる: 仕様が変わる・上流が変わる）
    feed("JSON でない", "これは JSON ではない");
    feed("空", "");
    feed("空オブジェクト", "{}");
    feed("別の Hook", JSON.stringify({ hook_event_name: "PreToolUse", session_id: "x" }));
    // ⚠ **ふつうの 1 往復**
    feed("UserPromptSubmit", JSON.stringify({
      hook_event_name: "UserPromptSubmit", session_id: "kensa-1", prompt_id: "kensa-p1",
      permission_mode: "default", prompt: `${MARK} を使って直して`,
    }));
    feed("Stop", JSON.stringify({
      hook_event_name: "Stop", session_id: "kensa-1", prompt_id: "kensa-p1",
      permission_mode: "default", effort: { level: "high" }, stop_hook_active: false,
      last_assistant_message: `${MARK} を消しました`,
    }));

    // ⚠ **束ねてよいのは、⚠ 束ねる根拠があるときだけ**（2026-08-24）。
    //   ⚠ **以前は「同じ Session の連続した Turn」を 1 Task にしていた。**⚠ **これは推定で、
    //   ⚠ 本文を持たない以上、⚠ あとから割れない**（⚠ 別々の仕事が 1 Task に化ける）。
    //   ⚠ **逆向きなら、⚠ あとからでも束ねられる。**
    // ⚠ **主張は 2 つ。**⚠ **どちらも、⚠ 出てきた task_id で見る**（⚠ 中の変数を覗かない）。
    const ISSUE = "kensa/repo#4242";
    feed("同じ Session・2 つ目", JSON.stringify({
      hook_event_name: "UserPromptSubmit", session_id: "kensa-1", prompt_id: "kensa-p2",
      prompt: "べつの用事",
    }));
    feed("issue・1 つ目", JSON.stringify({
      hook_event_name: "UserPromptSubmit", session_id: "kensa-2", prompt_id: "kensa-p3",
      prompt: `${ISSUE} をやって`,
    }));
    feed("issue・別 Session", JSON.stringify({
      hook_event_name: "UserPromptSubmit", session_id: "kensa-3", prompt_id: "kensa-p4",
      prompt: `${ISSUE} のつづき`,
    }));

    const slurp = (f) => (exsT(join(dir, f)) ? rfT(join(dir, f), "utf8") : "");
    const events = slurp("events.jsonl"), tasks = slurp("tasks.jsonl");
    // ⚠ **1 行も書けていないのに緑にしない**（⚠ 何も確かめていないのと同じ）
    if (!events.trim()) fails.push("events.jsonl に 1 行も書かれていない");
    if (!tasks.trim()) fails.push("tasks.jsonl に 1 行も書かれていない");
    // ⚠ **壊れた JSONL を残さない**（⚠ あとで読めない記録は、記録ではない）
    const rows = [];
    for (const [f, body] of [["events.jsonl", events], ["tasks.jsonl", tasks]])
      for (const line of body.split("\n").filter(Boolean)) {
        try { rows.push([f, JSON.parse(line)]); }
        catch { fails.push(`${f} に JSON として読めない行がある`); }
      }
    // ⚠ **本文を持ち出していない**（⚠ 目印は、⚠ プロンプトにも返答にも入れてある）
    if (`${events}${tasks}${slurp("state.json")}`.includes(MARK))
      fails.push("プロンプトか返答の中身が記録に入っている（識別に本文は要らない）");
    // ⚠ **始まりと終わりが、⚠ 同じ Task に結ばれている**
    const ev = rows.filter(([f]) => f === "events.jsonl").map(([, r]) => r);
    const started = ev.find((r) => r.event === "UserPromptSubmit");
    const ended = ev.find((r) => r.event === "Stop");
    if (!started?.task_id || started.task_id !== ended?.task_id)
      fails.push("UserPromptSubmit と Stop が同じ task_id に結ばれていない");
    // ⚠ **根拠が無いときは束ねない**（⚠ 同じ Session でも、⚠ プロンプトごとに別の Task）
    const asked = ev.filter((r) => r.event === "UserPromptSubmit");
    const solo = asked.filter((r) => r.session_id === "kensa-1");
    if (solo.length !== 2) fails.push(`同じ Session の 2 プロンプトが ${solo.length} 件しか記録されていない`);
    else {
      if (solo[0].task_id === solo[1].task_id)
        fails.push("issue の無い 2 つのプロンプトが 1 つの Task に束ねられている（根拠が無いのに束ねない）");
      if (solo.some((r) => r.grouping !== "turn" || r.turn !== 1))
        fails.push("issue の無い Task が turn 1 件で名乗っていない");
    }
    // ⚠ **根拠があるときは束ねる**（⚠ **Session をまたいでも同じ Task**）
    const byIssue = asked.filter((r) => r.issue === ISSUE);
    if (byIssue.length !== 2) fails.push(`issue を指す 2 プロンプトが ${byIssue.length} 件しか記録されていない`);
    else if (byIssue[0].task_id !== byIssue[1].task_id)
      fails.push("同じ issue を指す 2 つのプロンプトが、別々の Task になっている（Session をまたいでも同じ Task）");
    // ⚠ **何を見てそう決めたかが、⚠ 必ず付いている**（⚠ **どれも観測値ではなく推定値**）
    const naked = asked.filter((r) => !r.grouping || !r.task_type_source);
    if (naked.length) fails.push(`推定の根拠（grouping / task_type_source）が付いていない行が ${naked.length} 件`);
    // ⚠ **採点していない。**⚠ Phase 1 で観測できたのは「Turn が終わった」ことだけ。
    //   ⚠ **`completed` などを書き始めたら、⚠ 推定が実測の顔をする**（`CLAUDE.md` §1）
    const graded = rows.filter(([f]) => f === "tasks.jsonl").map(([, r]) => r.result)
      .filter((v) => v !== "unknown");
    if (graded.length) fails.push(`tasks.jsonl が結果を採点している: ${[...new Set(graded)].join("、")}`);
    rmSync(dir, { recursive: true, force: true });

    fails.length
      ? bad(`計測が作業を止めうる／中身を持ち出している: ${fails.join(" / ")}`
          + `（⚠ 計測が取れないことより、⚠ 作業が止まるほうが悪い）`)
      : ok(`計測は作業を止めない（⚠ 実際に 9 通り流した。⚠ 全部 exit 0・stdout 空`
          + `・${rows.length} 行が JSON として読める・本文は記録に出てこない`
          + `・始まりと終わりが同じ task_id・結果を採点していない`
          + `・⚠ 根拠が無いときは束ねず、⚠ issue があるときは Session をまたいで束ねる`
          + `・推定の根拠が全行に付いている）`);
  }
}

// ---------- ⚠ 使い捨てを、⚠ repo に置いていないか ----------
// ⚠ **2026-09-01 に実際に踏んだ**（`docs/adr/0082` の PR で気づいた）。
//   ⚠ **検査の棚卸しに書いた `tmp-triage.mjs` を、⚠ `git add -A` で巻き込み、
//     ⚠ `main` まで入れた**（⚠ 配信物ではないので利用者には届かなかった）。
//   ⚠ **`.gitignore` は `tmp/` を無視していたが、⚠ 直下の `tmp-` は網の外だった。**
//
// ⚠ **`.gitignore` だけでは足りない。**⚠ **一度 `git add -f` で入ったものは、
//   ⚠ そのあと無視の設定を足しても、⚠ 追跡されたまま残る。**
// ⚠ **だから、⚠ 追跡しているものの側を見る**（⚠ `git ls-files`）。
{
  const { execFileSync } = await import("node:child_process");
  // ⚠ **追跡しているものだけを見る**（⚠ 手元の未追跡は、⚠ ここでは対象外）。
  const 追跡 = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  追跡.length === 0 && bad("git ls-files が空（⚠ この検査が何も見ていない）");

  // ⚠ **使い捨ての印。**⚠ **足すときは、⚠ 何を捕まえたいのかを書く。**
  const 使い捨て = [
    [/(^|\/)tmp[-.]/, "tmp- で始まる（作業中の使い捨て）"],
    [/(^|\/)scratch[-.\/]/, "scratch（作業場）"],
    [/\.(log|bak|orig|rej|swp)$/, "編集や実行の残りかす"],
    [/(^|\/)(untitled|hoge|foo|test123)\b/i, "名前を付けずに置いたもの"],
  ];
  const 混ざり = [];
  for (const f of 追跡)
    for (const [re, why] of 使い捨て)
      if (re.test(f)) { 混ざり.push(`${f}（${why}）`); break; }

  混ざり.length
    ? bad(`repo に使い捨てが混ざっている: ${混ざり.join(" ／ ")}`
        + "（⚠ **`git add -A` が巻き込む。**⚠ **公開リポジトリなので、⚠ 誰でも読める**）")
    : ok(`repo に使い捨ては混ざっていない（⚠ 追跡している ${追跡.length} 本を見た）`);

  // ⚠ **symlink を追跡していないか**（2026-09-01。⚠ 実際に踏んだ）。
  //   ⚠ **worktree で親から `node_modules` を借りるために張った symlink を、
  //     ⚠ `git add -A` が拾い、⚠ `main` まで入れた。**
  //   ⚠ **`.gitignore` は `node_modules/` と書いていた。**⚠ **末尾の `/` はディレクトリだけ。**
  //     ⚠ **symlink はファイル扱いなので、⚠ 素通りした。**
  //   ⚠ **中身は「手元の絶対パス」**（⚠ `/home/<名前>/…`）。⚠ **`CLAUDE.md` §8-1 に反する。**
  {
    const 印 = execFileSync("git", ["ls-files", "-s"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter(Boolean)
      .filter((l) => l.startsWith("120000"))
      .map((l) => l.split("\t").pop());
    印.length
      ? bad(`symlink を追跡している: ${印.join(" ／ ")}`
          + "（⚠ **中身は行き先の文字列。**⚠ **手元の絶対パスが公開リポジトリへ出る**）")
      : ok("symlink は 1 本も追跡していない（⚠ 手元の道筋を外へ出さない）");
  }

  // ⚠ **追跡しているものに、⚠ 手元の絶対パスが入っていないか**（`CLAUDE.md` §8-1）。
  //   ⚠ **`.claude/` の中は `test/check/guard.mjs` の別の節が見ている**（⚠ あちらは秘密）。
  //   ⚠ **こちらは「どこで作業しているか」。**⚠ **中身が守られていても、⚠ 道筋は読める。**
  {
    const { readFileSync: rfG } = await import("node:fs");
    const 悪 = /\/(home|Users)\/[A-Za-z0-9_.-]+\//;
    const 漏れ = [], 読めず = [];
    for (const f of 追跡) {
      const 実 = join(ROOT, f);
      if (!existsSync(実)) continue;
      // ⚠ **読めなかったことを、⚠ 黙って飲まない**（2026-09-01。⚠ 実際に踏んだ）。
      //   ⚠ **`readFileSync` を取り込んでおらず、⚠ `catch` が全部飲んで、
      //     ⚠ 405 本を「見た」と言いながら 1 本も読んでいなかった。**
      //   ⚠ **読めないものが在ったら、⚠ そう言う**（⚠ 掟 §1: 取れなかった ≠ 無い）。
      let t = null;
      try { t = rfG(実, "utf8"); } catch { 読めず.push(f); continue; }
      if (t.length > 2_000_000) continue;
      const m = 悪.exec(t);
      if (!m) continue;
      // ⚠ **「こう書くな」と言っている行は除く**（⚠ 検査が自分の説明を拾う。`CLAUDE.md` §5）
      const 周り = t.slice(Math.max(0, m.index - 90), m.index + 60).replace(/\n/g, " ");
      if (/書かない|落とす|replace|正規表現|例|禁じ/.test(周り)) continue;
      漏れ.push(f);
    }
    読めず.length > 追跡.length / 2 &&
      bad(`追跡しているものの ${読めず.length} / ${追跡.length} 本を読めていない`
        + "（⚠ **この検査が何も見ていない**）");
    漏れ.length
      ? bad(`追跡しているものに、手元の絶対パスが入っている: ${漏れ.join(" ／ ")}`
          + "（⚠ **公開リポジトリ。**⚠ **どこで作業しているかが読める**。`CLAUDE.md` §8-1）")
      : ok(`追跡しているものに、手元の絶対パスは入っていない（⚠ ${追跡.length} 本を見た）`);
  }
}

// ⚠ **演習が、世界を変えていないか**（2026-09-04。`.claude/rules/testing.md`）。
//   ⚠ **今昔ではまだ踏んでいない。**⚠ **踏める口があるので、⚠ 踏む前に壁にする。**
//   ⚠ **規則だけでは約束にしかならない**（⚠ テンプレート側もそう言っている）。
//
// ⚠ **見るのは「検査が、⚠ 外の状態を動かす口を走らせていないか」だけ。**
//   ⚠ **読むのは自由**（⚠ 中身を静的に確かめるのは、⚠ むしろやるべきこと）。
//   ⚠ **走らせるのが駄目**（⚠ `ask-slack.mjs` には書き先をすげ替える口が無い。
//     ⚠ 走らせたら、⚠ 本当に Slack へ投稿される）。
{
  head("演習が世界を変えないか");

  // ⚠ **走らせてはいけない相手。**⚠ **すげ替える口が無いか、⚠ 人の許可が要るもの。**
  const 触るな = [
    [".claude/hooks/ask-slack.mjs", "Slack へ本当に投稿される"],
    [".claude/hooks/slack-doctor.mjs", "--post で Slack へ本当に投稿される"],
  ];
  // ⚠ **外の状態を動かす道具**（⚠ `CLAUDE.md` §8 が人の許可を要求している）。
  //   ⚠ **走らせているところだけを見る。**⚠ **案内文の中の字を拾わない**
  //     （⚠ 実際に踏んだ: `bad()` の中の「`npx wrangler d1 create konjaku` で作った id を入れる」を
  //      ⚠ 呼び出しだと読んだ）。
  const 走らせる = "(?:execFileSync|execSync|spawnSync|spawn)\\(\\s*";
  const 道具 = [
    [new RegExp(`${走らせる}["'\`](?:gh|/[\\w/]*/gh)["'\`]`), "gh（PR の作成・merge）"],
    [new RegExp(`${走らせる}["'\`][^"'\`]*(?:wrangler|npx)["'\`]`), "wrangler（配信）"],
    // ⚠ **git は読むのに使う**（`ls-files` ほか）。⚠ **push だけを見る。**
    [new RegExp(`${走らせる}["'\`]git["'\`]\\s*,\\s*\\[[^\\]]*["'\`]push["'\`]`), "git push"],
  ];

  const 検査 = [];
  for (const f of walkFiles(join(ROOT, "test"))) if (f.endsWith(".mjs")) 検査.push(f);
  // ⚠ **1 本も見ていないなら、⚠ この検査は何も見ていない**
  if (検査.length < 5) bad(`検査のファイルを ${検査.length} 本しか見つけられない（⚠ この検査が何も見ていない）`);
  else {
    const 漏れ = [];
    for (const f of 検査) {
      // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。
      //   ⚠ **落とさないと、⚠ この規則を説明したコメントを、⚠ 検査自身が拾う。**
      const 素 = (await readFile(f, "utf8")).replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
      const 名 = f.slice(ROOT.length).replace(/^\/+/, "");
      for (const [相手, なぜ] of 触るな) {
        // ⚠ **読むのは自由。**⚠ **走らせているところだけを見る。**
        const 走らせ = new RegExp(`(execFileSync|spawnSync|execSync|spawn)\\([^)]*${相手.replace(/[.\/]/g, "\\$&")}`);
        if (走らせ.test(素)) 漏れ.push(`${名} が ${相手} を走らせている（⚠ ${なぜ}）`);
      }
      for (const [形, なに] of 道具) if (形.test(素)) 漏れ.push(`${名} が ${なに} を呼んでいる`);
    }
    漏れ.length
      ? bad(`検査が、⚠ 外の状態を動かしている: ${漏れ.join(" ／ ")}`
          + "（⚠ **演習が世界を変えてはいけない**。`.claude/rules/testing.md`）")
      : ok(`検査は、⚠ 外の状態を動かす口を走らせていない（⚠ ${検査.length} 本を見た。`
          + "⚠ 読むのは自由。⚠ 走らせるのが駄目）");
  }
}

// ⚠ **時間切れのあと、⚠ 押しても効かないボタンを残していないか**（2026-09-05。hidetzu/konjaku#475）。
//   ⚠ **実測（2026-08-28〜2026-09-04・65 件）**: ⚠ **26 件（40%）が時間切れだった。**
//   ⚠ **その 26 件ぶん、⚠ 押しても何も起きないボタンが Slack に残り続けていた**（`docs/adr/0026`）。
//
// ⚠ **Slack へ 1 通も出さずに確かめる**（`.claude/rules/testing.md`）。
//   ⚠ **見た目は `ask-slack-view.mjs` が持ち、⚠ 何も送らない。**⚠ **だから import できる。**
{
  head("時間切れのあとの Slack の見た目");
  const 欠け = [];
  let V = null;
  try { V = await import("../../.claude/hooks/ask-slack-view.mjs"); }
  catch (e) { 欠け.push(`見た目を読めない: ${e.message}`); }

  if (!V?.時間切れの見た目) {
    欠け.push("時間切れの見た目を読めていない（⚠ この検査が何も見ていない）");
  } else {
    const b = V.時間切れの見た目("頭", [{ question: "押しますか" }, { question: "消しますか" }]);
    // ⚠ **ボタンを持たない**（⚠ 待ち受けは閉じている。⚠ 押しても本当に何も起きない）
    const 押せる = b.filter((x) => x.type === "actions").length;
    if (押せる) 欠け.push(`時間切れの見た目に、押せるものが ${押せる} 組ある（⚠ 押しても効かない）`);
    // ⚠ **何が起きたかを言う**（⚠ 「届いていない」ままにしない）
    const 字 = JSON.stringify(b);
    if (!/端末で聞きました/.test(字)) 欠け.push("時間切れの見た目が、⚠ 何をしたかを言っていない");
    // ⚠ **進行形を、⚠ 状態の説明に使わない**（`CLAUDE.md` §4-1）
    if (/聞いています|取得中|待っています/.test(字))
      欠け.push("時間切れの見た目が進行形（⚠ いま起きていることに読める）");
    // ⚠ **問いは残す**（⚠ 何を聞いたか分からなくならない）
    for (const q of ["押しますか", "消しますか"])
      if (!字.includes(q)) 欠け.push(`時間切れの見た目から、問い「${q}」が消えている`);
    // ⚠ **答えたことにしない**（⚠ 「✅ 回答ずみ」は答えが返ったときの字）
    if (/回答ずみ/.test(字)) 欠け.push("時間切れなのに「回答ずみ」と書いている");
  }

  // ⚠ **本体が、⚠ その見た目で元の投稿を書き換えていること**
  //   ⚠ **借りているだけでは足りない。**⚠ **`chat.update` に渡していることまで見る。**
  const 素 = (await readFile(join(ROOT, ".claude/hooks/ask-slack.mjs"), "utf8"))
    .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
  if (!/時間切れの見た目/.test(素))
    欠け.push("ask-slack.mjs が、時間切れの見た目を使っていない");
  else if (!/chat\.update[\s\S]{0,200}時間切れの見た目/.test(素))
    欠け.push("時間切れの見た目を、⚠ chat.update に渡していない（⚠ 元の投稿が変わらない）");
  // ⚠ **通知を増やさない**（⚠ 終わった話を、⚠ あとから鳴らして知らせても、⚠ できることが無い）
  const 時間切れの節 = 素.slice(素.indexOf("if (!result)"), 素.indexOf("if (!result)") + 400);
  if (/chat\.postMessage/.test(時間切れの節))
    欠け.push("時間切れのときに、⚠ Slack へ新しく投稿している（⚠ 通知を増やさない）");

  欠け.length
    ? bad(`時間切れのあとの Slack の見た目が壊れている: ${欠け.join(" ／ ")}`)
    : ok("時間切れのあとは、⚠ 押せるものを消し、⚠ 何をしたかを言い、⚠ 新しく投稿しない"
        + "（⚠ Slack へ 1 通も出さずに確かめた）");
}
