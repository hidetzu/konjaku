// 保存した時刻を、人が読む言葉にする。
//
// ここに置いた理由: 保存の一覧が 2 か所ある（地図の上の板と、/saved）。
//   同じ問いに答える実装を 2 つ持たない。
//
// DOM も地図も持たない。Node から呼べるので、検査がブラウザ抜きで回せる。
// saved.js は数（at）しか持たない。言葉にするのはここ。
(function (g) {
  "use strict";

  const 日 = 86400000;

  // 「きょう」「きのう」までは日で言い、それより前はまとめる。
  //   何日前かを 1 日ずつ言っても、保存した場所を選ぶ役には立たない。
  const text = (at) => {
    const 今日 = new Date(); 今日.setHours(0, 0, 0, 0);
    const 差 = Math.floor((今日.getTime() - new Date(at).setHours(0, 0, 0, 0)) / 日);
    if (差 <= 0) return "きょう";
    if (差 === 1) return "きのう";
    if (差 < 7) return `${差} 日前`;
    if (差 < 30) return `${Math.floor(差 / 7)} 週間前`;
    return `${Math.floor(差 / 30)} か月前`;
  };

  g.KonjakuWhen = { text };
})(typeof globalThis !== "undefined" ? globalThis : this);
