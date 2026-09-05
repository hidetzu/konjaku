// Slack に出す「見た目」だけを持つ、ただ 1 か所。
//
// ⚠ **なぜ分けたか**（2026-09-05。hidetzu/konjaku#475）。
//   ⚠ **`ask-slack.mjs` は、⚠ 読み込むだけで本体が走って終わる**（⚠ 標準入力を読み、⚠ exit する）。
//   ⚠ **だから import して確かめられない。**⚠ **確かめられないものは、⚠ 壊れても気づけない。**
//
// ⚠ **ここは何も送らない。**⚠ **配列を返すだけ。**
//   ⚠ **検査は、⚠ Slack へ 1 通も出さずに回せる**（`.claude/rules/testing.md`）。

// 時間切れになったときの見た目。
//
// ⚠ **押しても効かないボタンを、⚠ 残したままにしない**（`docs/adr/0026`）。
//   ⚠ **実測（2026-08-28〜2026-09-04・65 件）**: ⚠ **26 件（40%）が時間切れだった。**
//   ⚠ **その 26 件ぶん、⚠ 押しても何も起きないボタンが Slack に残り続けていた。**
//   ⚠ **待ち受けはもう閉じているので、⚠ 押しても本当に何も起きない。**
//
// ⚠ **答えが返ったときの「✅ 回答ずみ」と同じ形。**⚠ **どちらも押せる顔のまま残さない。**
export const 時間切れの見た目 = (head, questions) => [
  { type: "section", text: { type: "mrkdwn", text: String(head ?? "") } },
  ...(questions ?? []).map((q) => ({ type: "section", text: { type: "mrkdwn",
    text: `*${q?.question ?? ""}*` } })),
  // ⚠ **何が起きたかを言う。**⚠ **「届いていない」ままにしない。**
  //   ⚠ **こちらの都合を、⚠ 相手の都合のように言わない**（`CLAUDE.md` §4-1）。
  { type: "context", elements: [{ type: "mrkdwn",
    text: "⏱ 返事が無かったので、端末で聞きました。"
        + "（このスレッドに書いても読んでいません）" }] },
];

// 「✎ 自由に書く」の目印。⚠ ここと ask-slack.mjs で 2 か所に持たない。
export const FREE = "__free__";

// 選択肢の字。⚠ 文字列でも {label} でも受ける。
export const optionsOf = (q) => (q?.options ?? [])
  .map((o) => (typeof o === "string" ? o : o?.label)).filter(Boolean);

// 聞いているときの見た目。
//
// ⚠ **時間切れの見た目と対になる。**⚠ **こちらは押せる。**⚠ **あちらは押せない。**
//   ⚠ **2 つを同じ場所に置くと、⚠ 片方だけ直したときに気づける。**
// ⚠ **ボタンの文字は 75 字まで**（⚠ Slack の上限）。⚠ **切って表示するが、
//   ⚠ 採用するのは切る前の全文**（⚠ 押された値は `qi:oi` で戻る）。
// ⚠ **1 つの質問につき、⚠ 選択肢は 4 つまで**（⚠ Slack の actions は 5 要素まで。
//   ⚠ 残り 1 つを「✎ 自由に書く」に使う）。
export const 聞くときの見た目 = (head, questions) => {
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: String(head ?? "") } }];
  (questions ?? []).forEach((q, qi) => {
    blocks.push({ type: "section", text: { type: "mrkdwn",
      text: `*${q?.header ? `[${q.header}] ` : ""}${q?.question ?? ""}*` } });
    const els = optionsOf(q).slice(0, 4).map((label, oi) => ({
      type: "button", action_id: `q${qi}_o${oi}`, value: `${qi}:${oi}`,
      text: { type: "plain_text", text: label.slice(0, 75) },
    }));
    els.push({ type: "button", action_id: `q${qi}_free`, value: `${qi}:${FREE}`,
      text: { type: "plain_text", text: "✎ 自由に書く" } });
    blocks.push({ type: "actions", block_id: `a${qi}`, elements: els });
  });
  return blocks;
};
