// 静的に配っているものを取る、ただ 1 つの口。
//
// なぜ 1 つにするか（hidetzu/konjaku#99）。
//   実測（2026-09-05・172a680）: 7 か所 / 4 ファイルで取っていた。
//     top.js       landform.json / area-record.json / muni.json
//     verify.js    landform.json
//     deep.js      area-record.json / monument の 2 本
//   時間切れを持っていたのは 2 本だけ。
//   失敗したときの返し方も null / 例外 / {ok:false,data:null} とばらばらだった。
//
// ばらばらだと何が起きるか:
//   「取れなかった」を「無い」に化けさせる経路が、口の数だけ増える（掟 §1）。
//   実際に踏んでいる（2026-08-29。資料そのものを読めなくしても、画面は
//   資料が無い場所とまったく同じだった）。
//
// DOM も地図も持たない。fetch は呼ぶ側が渡せるので、検査がブラウザ抜きで回せる。
(function (g) {
  "use strict";

  // 外への口と同じ 8 秒にする。
  //   別の値にする根拠が、こちらで測れていない。
  //   実測（2026-09-05・本番・10 回ずつ・回線 1 本）は
  //     landform.json 0.36〜0.44 秒 / area-record.json 0.33〜0.44 /
  //     muni.json 0.35〜0.58 / monument/tiles.json 0.31〜0.43。
  //   これは速い回線 1 本の話で、遅い回線でどこまで伸びるかは測っていない。
  //   測っていない値で短く切ると、読めるはずのものを「読めなかった」にする。
  const TIMEOUT_MS = 8000;

  // 返す形は 2 つだけ。
  //   { state: "ok", data }               読めた
  //   { state: "unreachable", why, status } 読めなかった
  //
  // 「無い」は返さない。
  //   配っていないものを取りに行くのは、こちらの不具合であって、
  //   利用者に「無い」と言ってよいことではない（掟 §1）。
  //   何が無いかの判断は、呼ぶ側の Domain が表を見て決める
  //   （monument.js は tiles.json を見て absent と unreachable を分けている）。
  async function 取る(path, opt) {
    const f = opt?.fetch ?? g.fetch;
    if (typeof f !== "function") return { state: "unreachable", why: "取りに行けない" };
    let r;
    try {
      r = await f(path, { signal: AbortSignal.timeout(opt?.timeoutMs ?? TIMEOUT_MS) });
    } catch (e) {
      // 時間切れも、つながらないのも、ここへ来る。どちらも「読めなかった」
      return { state: "unreachable", why: e?.name === "TimeoutError" ? "時間切れ" : "つながらない" };
    }
    if (!r.ok) return { state: "unreachable", why: String(r.status), status: r.status };
    try { return { state: "ok", data: await r.json() }; }
    catch { return { state: "unreachable", why: "読めない形" }; }
  }

  g.KonjakuStatic = { 取る, TIMEOUT_MS };
})(typeof window === "undefined" ? globalThis : window);
