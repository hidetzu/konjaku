// 色みの切り替え。端末に合わせる／明るい／暗い の 3 つから、押して選ぶ。
//
// 値は theme.css の light-dark() が両方持っている。ここは color-scheme を切り替えるだけで、
// 色を 1 つも持たない。2 か所に色を持たない、という決めごとを守るための形。
//
// ⚠ 読み込みは <head> の中。body の終わりに置くと、
//   端末の設定と選んだ色みが違うとき、最初の一瞬だけ前の色みで描かれる。
//   選んだものが無いときは何もしない（＝端末の設定に従う）ので、その場合は一切影響しない。
//
// ⚠ 3 つを並べて出す。押すたびに回る形はやめた。
//   回る形は、いまがどれで、次が何になるかが、押してみるまで分からない。
(function () {
  "use strict";

  var KEY = "konjaku:theme";
  var 選べるもの = ["auto", "light", "dark"];

  // 印はフォントに頼らず描く。
  //   実測（2026-09-02）: ☾ が環境によって豆腐（□×）になった。
  //   ☰ も同じ理由で CSS で描いてある。色は currentColor なので、色みに追いてくる。
  // 印はフォントに頼らず描く。
  //   実測（2026-09-02）: ☾ が環境によって豆腐（□×）になった。
  //   ☰ も同じ理由で CSS で描いてある。色は currentColor なので、色みに追いてくる。
  //   形は 24 の格子に乗せ、線の太さと丸めをそろえてある。
  var 絵 = {
    // 端末に合わせる … 円の右半分を塗る。太陽と月のあいだ、という形。
    auto: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>'
        + '<path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor"/>',
    // 明るい … 中心の円と、8 本の光。線の端は丸める。
    light: '<circle cx="12" cy="12" r="4" fill="currentColor"/>'
        + '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">'
        + '<path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2"/>'
        + '<path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></g>',
    // 暗い … 三日月。円から円を欠いた形を、1 本の path で描く。
    dark: '<path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6 8.6 8.6 0 1 0 20.4 14.6Z" '
        + 'fill="currentColor"/>',
  };
  var 名 = { auto: "端末に合わせる", light: "明るい", dark: "暗い" };

  function 読む() {
    try {
      var v = localStorage.getItem(KEY);
      return 選べるもの.indexOf(v) >= 0 ? v : "auto";
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

  function 描く(box, v) {
    var svg = box.querySelector(".theme__icon");
    if (svg) svg.innerHTML = 絵[v];
    box.setAttribute("data-mode", v);
    // いまどれを選んでいるかは、色や位置ではなく aria-pressed が持つ。
    var items = box.querySelectorAll(".theme__item");
    for (var i = 0; i < items.length; i++) {
      var 押されている = items[i].getAttribute("data-v") === v;
      items[i].setAttribute("aria-pressed", 押されている ? "true" : "false");
    }
    box.querySelector(".theme__btn").setAttribute("title", "色み：" + 名[v]);
    box.querySelector(".theme__btn").setAttribute("aria-label", "色みを選ぶ（いま：" + 名[v] + "）");
  }

  function つなぐ() {
    var box = document.getElementById("theme");
    if (!box) return;
    描く(box, 読む());
    box.hidden = false;

    box.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".theme__item") : null;
      if (!btn) return;
      var v = btn.getAttribute("data-v");
      if (選べるもの.indexOf(v) < 0) return;
      try { localStorage.setItem(KEY, v); } catch (e2) { /* 残せなくても、この画面では効く */ }
      当てる(v);
      描く(box, v);
      box.open = false;
    });

    // 開いたまま地図の上に残ると、押したい場所が隠れる（menu.js と同じ理由）。
    document.addEventListener("pointerdown", function (e) {
      if (box.open && !box.contains(e.target)) box.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !box.open) return;
      box.open = false;
      var b = box.querySelector(".theme__btn");
      if (b) b.focus();
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", つなぐ);
  else つなぐ();
})();
