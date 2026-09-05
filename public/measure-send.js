// 計測を送る側。⚠ **画面が使う口はこれ 1 つ。**
//
// ⚠ **何を送るかは `measure.js` が決める。**⚠ **ここは送るだけ。**
//   ⚠ 分けているのは、⚠ 決める側を Node から呼べるようにするため（検査がブラウザ抜きで回せる）。
//
// ⚠ **落ちても画面を止めない。**⚠ **待たない。**⚠ **返りも見ない。**
//   ⚠ 計測のために利用者を待たせない。⚠ 数えられなかっただけ。
(function (g) {
  "use strict";
  const M = g.KonjakuMeasure;

  // ⚠ **訪問の印。**⚠ **端末の中だけ・1 日で消える**（`measure.js`）。
  //   ⚠ 触れないことがある（プライベートモードなど）。⚠ そのときは印なしで送る。
  const 置き場 = (() => {
    try { const s = g.localStorage; s.getItem(M.KEY); return s; } catch { return null; }
  })();
  const 訪問 = M.訪問(置き場);

  // ⚠ **流入元は、⚠ 最初に読んだときの 1 回だけ決める。**
  //   ⚠ `?from=` はこちらが貼ったリンクの印。⚠ 無ければ、来た相手のホスト名を畳む。
  //   ⚠ **生の URL は送らない**（`measure.js` が列挙の名前へ直す）。
  const 元 = M.流入元({
    from: new URL(g.location.href).searchParams.get("from"),
    referrer: g.document.referrer,
  });

  // ⚠ **送る。**⚠ **`keepalive` を付ける**（⚠ 画面を離れる操作でも届く）。
  const 起こす = (event, opt = {}) => {
    const b = M.本文({ event, 訪問ID: 訪問.id, 流入元: 元, 入口: opt.入口 ?? null, page: opt.page ?? null });
    if (!b) return false;   // ⚠ 列挙の外。⚠ 送らない
    try {
      g.fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
        keepalive: true,
      }).catch(() => {});   // ⚠ 落ちても何もしない
    } catch { /* ⚠ 画面を止めない */ }
    return true;
  };

  g.Konjaku計測 = { 起こす, 流入元: 元, 訪問 };
})(window);
