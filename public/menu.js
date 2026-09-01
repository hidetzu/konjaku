// 名乗りの帯のメニューを、外を押したときと Esc で閉じる。
//
// ここでやること: 閉じるきっかけを 2 つ足すだけ。
// ここでやらないこと: 開けること（details が持つ）、字を決めること（HTML が持つ）。
//
// なぜ足すか: details は「もう一度ボタンを押す」以外で閉じない。
//   地図の上に開いたまま残ると、押したい場所が隠れる。
// なぜ details のままか: これが無くても開け閉めできる。落ちても道が消えない。
(() => {
  const menu = document.querySelector(".menu");
  if (!menu) return;

  // 中を押したときは閉じない（行き先を押した場合は、そのまま画面が変わる）。
  document.addEventListener("pointerdown", (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !menu.open) return;
    menu.open = false;
    // 閉じたあと、どこにも focus が無い状態にしない。
    menu.querySelector(".menu__btn")?.focus();
  });
})();
