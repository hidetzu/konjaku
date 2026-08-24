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

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, bad, head } from "./lib.mjs";

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
  const dir = join(ROOT, ".claude");
  // ⚠ **計測の出力は読まない**（2026-08-24）。⚠ `.claude/telemetry/` は git の外で、
  //   ⚠ **作業のたびに増える。**⚠ 読むと、⚠ **名乗るファイル数が回すたびに変わる**
  //   （⚠ `CLAUDE.md` §9: ⚠ **判定の字を変更前後で突き合わせられなくなる**）。
  const SKIP = new Set(["telemetry"]);
  const walk = async (d) => {
    const out = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...await walk(full)); }
      else out.push(full);
    }
    return out;
  };
  const files = existsSync(dir) ? await walk(dir) : [];
  const FORBIDDEN = [
    { re: /--add-label[^\n]*ready-for-ai|ready-for-ai[^\n]*--add-label/, why: "ready-for-ai を自分で付けている" },
    { re: /gh\s+pr\s+merge[^\n]*--auto/, why: "PR を自動 merge している" },
    { re: /gh\s+(pr|issue)[^\n]*--admin/, why: "保護を飛び越えている（--admin）" },
    { re: /gh\s+issue\s+close/, why: "Issue を自分で閉じている" },
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
    return src2.split("\n").map((l) => l.replace(/(^|\s)(\/\/|#).*$/, ""));
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
        + `ラベル付与／自動 merge／--admin／Issue を閉じる が無く、`
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
      const t = exT("git", ["ls-files", ".claude/telemetry"], { encoding: "utf8", cwd: ROOT }).trim();
      if (t) fails.push(`計測の出力が git に入っている: ${t.split("\n").join("、")}`);
    } catch { fails.push("git ls-files が使えない（追跡されていないことを確かめていない）"); }

    fails.length
      ? bad(`計測の仕掛けが揃っていない: ${fails.join(" / ")}`
          + `（⚠ 始まりと終わりの両方が要る。⚠ 出力は git に入れない）`)
      : ok(`計測の Hook が両端に付いている（${wired.join(" ／ ")}・出力は git の外）`);
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
    // ⚠ **採点していない。**⚠ Phase 1 で観測できたのは「Turn が終わった」ことだけ。
    //   ⚠ **`completed` などを書き始めたら、⚠ 推定が実測の顔をする**（`CLAUDE.md` §1）
    const graded = rows.filter(([f]) => f === "tasks.jsonl").map(([, r]) => r.result)
      .filter((v) => v !== "unknown");
    if (graded.length) fails.push(`tasks.jsonl が結果を採点している: ${[...new Set(graded)].join("、")}`);
    rmSync(dir, { recursive: true, force: true });

    fails.length
      ? bad(`計測が作業を止めうる／中身を持ち出している: ${fails.join(" / ")}`
          + `（⚠ 計測が取れないことより、⚠ 作業が止まるほうが悪い）`)
      : ok(`計測は作業を止めない（⚠ 実際に 6 通り流した。⚠ 全部 exit 0・stdout 空`
          + `・${rows.length} 行が JSON として読める・本文は記録に出てこない`
          + `・始まりと終わりが同じ task_id・結果を採点していない）`);
  }
}
