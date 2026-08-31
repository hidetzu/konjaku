// 「ひとつ前へ」戻る道。深掘りと保存の一覧が、同じ形で持つ。
//
// 2026-09-01 に切り出した。前は deep.js が 1 つだけ持っていた。
//   保存の一覧にも同じ道を置いたので、2 か所になった。
//   同じ問いに答える実装を 2 つ持たない（CLAUDE.md §3）。突き合わせるより、1 つにする。
//
// 決めていること:
//   同じサイトから来たときだけ「← ひとつ前へ」と言う。
//   referrer は環境で消える（プライバシー設定・拡張・アプリ内ブラウザ）。
//   空は「直前が無い」として扱う。安全側に倒れる（誤って外へ出さない）。
//
//   新しいタブで開かれていると、referrer は同じでも戻る先が無い
//   （ctrl＋クリック・中クリック）。history.length では見分けられない。
//   戻れたかどうかは、戻ってみないと分からない。戻らなければ行き先へ送る。
(function (g) {
  "use strict";

  const 同じサイトから = () => {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
    catch { return false; }
  };

  // el   戻る道の a 要素
  // 行き先 同じサイトから来ていないときに開く場所。戻れなかったときの逃げ先でもある
  // 字   同じサイトから来ていないときに出す言葉。呼ぶ側が決める（画面ごとに違う）
  const wire = (el, 行き先, 字) => {
    if (!el) return;
    el.href = 行き先;
    if (!同じサイトから()) { el.textContent = 字; return; }
    el.textContent = "← ひとつ前へ";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      let 戻れた = false;
      const 見張り = () => { 戻れた = true; };
      addEventListener("pagehide", 見張り, { once: true });
      history.back();
      setTimeout(() => {
        removeEventListener("pagehide", 見張り);
        if (!戻れた) location.href = 行き先;
      }, 400);
    });
  };

  g.KonjakuBack = { wire, 同じサイトから };
})(typeof window === "undefined" ? globalThis : window);
