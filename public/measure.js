// 計測。何が起きたかを日ごとに数える（hidetzu/konjaku#495 のあと。tmp のガイドから）。
//
// 目的はひとつ ── どこから来た人が、どこまで進み、どこでやめたかを見えるようにする。
// これが無いと、画面を直しても効いたかどうかが分からない。
//
// ⚠ 記録しないもの（Owner 判断 2026-09-06）。
//   座標も町名も送らない。どこを調べたかは 1 件も残らない。
//   user-agent も送らない。端末の見分けはしない。
//   検索した語も送らない（数だけ）。
//   ⚠ 「ここに書いていないことは、していません」と画面が言っている。書いていないことはしない。
//
// ⚠ 訪問の印は、端末の中だけ・1 日で消える。
//   Cookie ではない（こちらへ自動で送られることはない）。
//   日が変わると別の印になるので、「昨日も来た人」は数えられない。
//   ⚠ 数えられないものを数えたと言わない（掟 §1）。リピーター率はこの形では出せない。
//
// DOM も地図も持たない。fetch も持たない（呼ぶ側が渡す）。
//   Node から呼べるので、検査がブラウザ抜きで回せる。
(function (g) {
  "use strict";

  // 送ってよいイベント。書いていないものは送らない・受け取らない。
  //   ⚠ 増やすときは、ここと worker 側の両方に足す（検査が突き合わせる）。
  //   ⚠ 画面を開いたことは page_load 1 本で表し、どの画面かは metadata が持つ。
  //     画面ごとに別の名前を作らない（同じ問いに答える名前が 2 つになる）。
  const EVENTS = new Set([
    "page_load",     // 画面を開いた（metadata.page がどの画面か）
    "map_opened",    // 地図で足元の判定が出た（＝場所を調べた）
    "detail_view",   // 「くわしく見る」を押した
    "deep_accessed", // 深掘りの画面を開いた
    "save_place",    // 「☆ 保存」を押した
    "shared",        // 「⇱ 送る」を押した
  ]);

  // 画面の名前。metadata.page に入れる。
  const PAGES = new Set(["about", "map", "deep", "saved", "take", "privacy", "terms"]);

  // いま出している場所の出どころ。画面が既に判定しているものを、そのまま借りる。
  //   ⚠ 字は answer.js の WHERE が持つ。ここは鍵だけ。
  const ENTRIES = new Set(["default", "link", "map", "search", "here"]);

  // 流入元。列挙したものだけ記録する。
  //   ⚠ 任意の字を通すと、外から好きなラベルを増やせる＝この表が信用できなくなる。
  //   ⚠ 生の URL は残さない。ここに在る名前へ畳んでから送る。
  const SOURCES = new Set([
    "app-village",   // ?from=app-village / www.app-village.jp
    "tsukutta.app",  // ?from=tsukutta / tsukutta.app
    "konjaku",       // 同じサイトの中から
    "other",         // 列挙の外から来た（⚠ どこかは残さない）
    "direct",        // どこからも来ていない（直接開いた・ブックマーク）
  ]);

  // 列挙の外の相手を、どの名前へ畳むか。
  //   ⚠ ホスト名だけ見る。パスもクエリも見ない（他人の閲覧元を集めない）。
  const HOSTS = [
    [/(^|\.)app-village\.jp$/, "app-village"],
    [/(^|\.)tsukutta\.app$/, "tsukutta.app"],
    [/(^|\.)konjaku\.hidetzu\.work$/, "konjaku"],
  ];

  // ?from= の字を、列挙の名前へ直す。
  const FROM = { "app-village": "app-village", tsukutta: "tsukutta.app", "tsukutta.app": "tsukutta.app" };

  // 流入元を決める（ハイブリッド。Owner 判断 2026-09-06）。
  //   1 こちらが貼ったリンクの印（?from=）があれば、それ
  //   2 無ければ、来た相手のホスト名を列挙の名前へ畳む
  //   3 どちらも無ければ direct
  // ⚠ 返すのは必ず SOURCES の中の 1 つ。生の字は返さない。
  const 流入元 = ({ from = null, referrer = "" } = {}) => {
    const 印 = from ? FROM[String(from).toLowerCase()] : null;
    if (印) return 印;
    if (!referrer) return "direct";
    let host = "";
    try { host = new URL(referrer).hostname; } catch { return "other"; }
    for (const [印, 名] of HOSTS) if (印.test(host)) return 名;
    return "other";
  };

  // 訪問の印。端末の中だけ。日が変わると別の印になる。
  //   ⚠ 置き場は呼ぶ側が渡す（検査がブラウザ抜きで回せる）。
  //   ⚠ 触れないことがある（プライベートモードなど）。そのときは印なしで進む。
  const KEY = "konjaku-visit-v1";
  const 訪問 = (store, { now = Date.now(), 新しいID = () => crypto.randomUUID() } = {}) => {
    const day = new Date(now).toISOString().slice(0, 10);   // UTC の YYYY-MM-DD
    if (!store) return { id: null, day, 新しい: false, 置けた: false };
    let 前 = null;
    try { 前 = JSON.parse(store.getItem(KEY) ?? "null"); } catch { 前 = null; }
    if (前 && 前.day === day && typeof 前.id === "string" && 前.id)
      return { id: 前.id, day, 新しい: false, 置けた: true };
    const id = 新しいID();
    try { store.setItem(KEY, JSON.stringify({ id, day })); }
    catch { return { id, day, 新しい: true, 置けた: false }; }
    return { id, day, 新しい: true, 置けた: true };
  };

  // 送る本文を作る。列挙の外は作らない（null を返す）。
  //   ⚠ ここで弾いても、受け側でもう一度弾く。片方だけに頼らない。
  const 本文 = ({ event, 訪問ID = null, 流入元: 元 = "direct", 入口 = null, page = null } = {}) => {
    if (!EVENTS.has(event)) return null;
    if (!SOURCES.has(元)) return null;
    if (入口 !== null && !ENTRIES.has(入口)) return null;
    if (page !== null && !PAGES.has(page)) return null;
    return {
      event_type: event,
      session_id: typeof 訪問ID === "string" && 訪問ID ? 訪問ID : null,
      referrer: 元,
      entry_point: 入口,
      metadata: page ? { page } : null,
    };
  };

  g.KonjakuMeasure = { EVENTS, PAGES, ENTRIES, SOURCES, KEY, 流入元, 訪問, 本文 };
})(typeof window === "undefined" ? globalThis : window);
