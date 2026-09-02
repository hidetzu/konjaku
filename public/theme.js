// 色みの切り替え。端末の設定に従う／明るい／暗い の 3 つを、押すたびに回す。
//
// 値は theme.css の light-dark() が両方持っている。ここは color-scheme を切り替えるだけで、
// 色を 1 つも持たない。2 か所に色を持たない、という決めごとを守るための形。
//
// ⚠ 読み込みは <head> の中。body の終わりに置くと、
//   端末の設定と選んだ色みが違うとき、最初の一瞬だけ前の色みで描かれる。
//   選んだものが無いときは何もしない（＝端末の設定に従う）ので、その場合は一切影響しない。
(function () {
  "use strict";

  var KEY = "konjaku:theme";
  // 回る順。既定（端末の設定に従う）から始まり、明るい → 暗い → 既定。
  var 順 = ["auto", "light", "dark"];
  // 印はフォントに頼らず描く。
  //   実測（2026-09-02）: ☾ が環境によって豆腐（□×）になった。
  //   ☰ も同じ理由で CSS で描いてある。色は currentColor なので、色みに追いてくる。
  var 字 = {
    auto: { 名: "色み：端末の設定に従う",
      絵: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>'
        + '<path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>' },
    light: { 名: "色み：明るい",
      絵: '<circle cx="12" cy="12" r="4.6" fill="currentColor"/>'
        + '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">'
        + '<path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3'
        + 'M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1"/></g>' },
    dark: { 名: "色み：暗い",
      絵: '<path d="M20.5 15.2A8.7 8.7 0 0 1 8.8 3.5a8.7 8.7 0 1 0 11.7 11.7z" fill="currentColor"/>' },
  };

  function 読む() {
    try {
      var v = localStorage.getItem(KEY);
      return 順.indexOf(v) >= 0 ? v : "auto";
    } catch (e) {
      // 保存領域を触れない端末がある（プライベート窓など）。そのときは既定で動く。
      return "auto";
    }
  }

  function 当てる(v) {
    var root = document.documentElement;
    if (v === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", v);
  }

  // ⚠ 最初の描画より前に当てる。ここから下は DOM を触らない。
  当てる(読む());

  function 描く(btn, v) {
    var svg = btn.querySelector("svg");
    if (svg) svg.innerHTML = 字[v].絵;
    // どの色みかを、字でも持つ。色と形だけで状態を言わない。
    btn.setAttribute("data-mode", v);
    // 色と位置だけで状態を言わない。字も aria も、いまの色みを名乗る。
    btn.setAttribute("aria-label", 字[v].名 + "（押すと次に変わります）");
    btn.setAttribute("title", 字[v].名);
  }

  function つなぐ() {
    var btn = document.getElementById("theme");
    if (!btn) return;
    var v = 読む();
    描く(btn, v);
    btn.hidden = false;
    btn.addEventListener("click", function () {
      v = 順[(順.indexOf(v) + 1) % 順.length];
      try { localStorage.setItem(KEY, v); } catch (e) { /* 残せなくても、この画面では効く */ }
      当てる(v);
      描く(btn, v);
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", つなぐ);
  else つなぐ();
})();
