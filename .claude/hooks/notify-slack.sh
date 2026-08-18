#!/usr/bin/env bash
#
# Claude Code が人の判断を待つとき（AskUserQuestion）だけ Slack へ知らせる。
#
# ⚠ **飛ぶのはこれだけ。** 進捗も、完了も、失敗も送らない。
#   全部送ると読まれなくなり、肝心の「判断待ち」が埋もれる。
#   どこで聞くかの線引きは CLAUDE.md §7-1。ここには書かない（仕様を2か所に持たない）。
#
# ⚠ **この Hook は、絶対に質問をせき止めない。**
#   PreToolUse の Hook が 0 以外で終わると、その道具の呼び出しごと止まる。
#   つまり Slack が落ちている・jq が入っていない・URL を設定していない、
#   のどれでも「人に聞けない」になる。**知らせるための仕掛けで、聞けなくなる**のは本末転倒。
#   → 何が起きても `exit 0`。送れなかったことは stderr に一行だけ書く。
#
# ⚠ **URL はリポジトリに置かない。** 環境変数 SLACK_WEBHOOK_URL から読む。
#   未設定なら、黙って何もしない（この repo を clone しただけの人の邪魔をしない）。
#
# 送るもの: 質問文・作業ディレクトリ・session_id。
# ⚠ 質問文はそのまま外部（Slack）へ出る。書いた内容は社外に出せるものに保つこと。
#
# 手元での試し方は README ではなくここに置く（この仕掛けを触る人しか読まない）:
#
#   # 1. 送らずに、組み立てた文面だけ見る
#   echo '{"cwd":"/tmp/x","session_id":"abc","tool_input":{"questions":[{"question":"どちらにしますか？"}]}}' \
#     | .claude/hooks/notify-slack.sh
#
#   # 2. 実際に送る
#   export SLACK_WEBHOOK_URL='<Slack の Incoming Webhook の URL>'   # ⚠ ここに実物を書かない
#   echo '{"cwd":"/tmp/x","session_id":"abc","tool_input":{"questions":[{"question":"どちらにしますか？"}]}}' \
#     | .claude/hooks/notify-slack.sh
#
#   # 3. ⚠ せき止めないことを確かめる（全部 0 で終わること）
#   echo 'これは JSON ではない' | .claude/hooks/notify-slack.sh; echo "exit=$?"
#   echo '{}' | SLACK_WEBHOOK_URL=https://example.invalid/x .claude/hooks/notify-slack.sh; echo "exit=$?"
#   printf '' | .claude/hooks/notify-slack.sh; echo "exit=$?"

# ⚠ set -e は使わない。途中で落ちること自体が「質問をせき止める」になる。
set -u

skip() { printf 'notify-slack: %s\n' "$1" >&2; exit 0; }

INPUT=$(cat 2>/dev/null || true)

# URL が無いのは異常ではない。この repo を触る人の多くは設定していない
[ -n "${SLACK_WEBHOOK_URL:-}" ] || skip "SLACK_WEBHOOK_URL が無いので送らない"
command -v jq   >/dev/null 2>&1 || skip "jq が無いので送らない"
command -v curl >/dev/null 2>&1 || skip "curl が無いので送らない"

# ⚠ 壊れた JSON でも落ちない。読めなければ送らないだけ
QUESTION=$(printf '%s' "$INPUT" | jq -r '
  (.tool_input.questions // []) | map("• " + (.question // "")) | join("\n")
' 2>/dev/null) || skip "入力を読めないので送らない"
[ -n "$QUESTION" ] || skip "質問が空なので送らない"

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // "unknown"' 2>/dev/null || echo unknown)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)

MESSAGE=$(cat <<EOF
🤖 *Claude Code が判断待ちです*

*Project*
\`$CWD\`

*Question*
$QUESTION

*Session*
\`$SESSION_ID\`
EOF
)

# ⚠ 待たない。相手が黙ったまま応答しないときに、こちらのセッションを止めない
BODY=$(jq -n --arg text "$MESSAGE" '{text: $text}' 2>/dev/null) || skip "文面を組めないので送らない"
curl -fsS --max-time 5 \
  -X POST -H 'Content-Type: application/json' \
  --data "$BODY" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 \
  || printf 'notify-slack: 送れなかった（質問はそのまま出す）\n' >&2

exit 0
