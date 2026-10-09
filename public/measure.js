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
    // ⚠ **deep_accessed は落とした**（2026-09-08。`docs/adr/0104`）。
    //   ⚠ **「深掘りの画面を開いた」は page_load（page: deep）で表す。**
    //   ⚠ **共有リンクで開かれたかどうかは entry_point が持つ**（⚠ 情報は消えていない）。
    //   ⚠ **2026-09-08 より前の行には deep_accessed が入っている**（⚠ 集計は両方を見る）。
    "save_place",    // 「☆ 保存」を押した
    "shared",        // 「⇱ 送る」を押した
    // ⚠ **「この先で、土地が変わる」の判定が出た**（2026-09-30。hidetzu/konjaku#481）。
    //   ⚠ **出せたときだけでなく、⚠ 出せなかったときも送る。**⚠ **でないと分母が作れない**
    //     （⚠ 出せた数しか無いと、⚠ 「何回中の何回か」が言えない。`CLAUDE.md` §1）。
    //   ⚠ **送るのは 5 通りのどれか、だけ。**⚠ **座標も距離も区分名も送らない。**
    "border_judged",
  ]);

  // ⚠ **境目の判定**（`public/border.js` の state をそのまま借りる）。
  //   ⚠ **言い換えない。**⚠ **言い換えると、⚠ 同じ問いに答える名前が 2 つになる**（`CLAUDE.md` §3）。
  //   ⚠ **`読めなかった` だけは、⚠ こちらの都合ではなく相手の都合**（`verify.js` が UNREACHABLE を返す）。
  //     ⚠ **これを落とすと、⚠ 分母が縮んで「出せた割合」が高く見える**（掟 §1）。
  const BORDERS = new Set(["ok", "遠い", "見えない", "足元が無い", "読めなかった"]);

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
    "search",        // 検索から（⚠ どの検索かは残さない。2026-10-10 に足した）
    "other",         // 列挙の外から来た（⚠ どこかは残さない）
    "direct",        // どこからも来ていない（直接開いた・ブックマーク）
  ]);

  // 列挙の外の相手を、どの名前へ畳むか。
  //   ⚠ ホスト名だけ見る。パスもクエリも見ない（他人の閲覧元を集めない）。
  //
  // ⚠ **検索は 1 つの名前へ畳む**（2026-10-10 に足した）。⚠ **どの検索かは残さない。**
  //   ⚠ **足した理由**: ⚠ **検索から来ても `other` になり、⚠ 誰かが貼ったリンクと区別できない。**
  //     ⚠ **`npm run gate` が「流入が増えたか」を見るとき、⚠ 何が効いたかが読めない。**
  //     ⚠ **計測は、⚠ その出来事より先に置いておかないと間に合わない**（⚠ 後から遡れない）。
  //   ⚠ **検索の入口だけを合わせる。**⚠ **`docs.google.com` や `news.yahoo.co.jp` は検索ではない。**
  //     ⚠ **広く合わせると、⚠ 書類の共有リンクまで「検索から来た」になる。**
  //   ⚠ **網羅したとは言わない。**⚠ **ここに無い相手は「検索ではない」ではなく「知らない」**
  //     （⚠ `public/robots.txt` と同じ立て方）。⚠ **知らない相手は `other` へ落ちる。**
  const HOSTS = [
    [/(^|\.)app-village\.jp$/, "app-village"],
    [/(^|\.)tsukutta\.app$/, "tsukutta.app"],
    [/(^|\.)konjaku\.hidetzu\.work$/, "konjaku"],
    // ⚠ **Google は国ごとに別のホスト名**（`google.com` / `google.co.jp` …）。
    //   ⚠ **`www.` と裸だけ。**⚠ **`docs.` `drive.` `mail.` は合わせない。**
    [/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/, "search"],
    [/^(www\.)?bing\.com$/, "search"],
    // ⚠ **Yahoo! は検索だけ。**⚠ **`news.yahoo.co.jp` から来るのは記事のリンク。**
    [/^search\.yahoo\.(co\.jp|com)$/, "search"],
    [/^(html\.|lite\.)?duckduckgo\.com$/, "search"],
    [/^(www\.)?ecosia\.org$/, "search"],
    [/^(www\.)?startpage\.com$/, "search"],
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
  // ⚠ **`page` と `境目` は、⚠ 同時に入れない**（2026-09-30。hidetzu/konjaku#481）。
  //   ⚠ **`stats` の「どの画面が開かれたか」は `metadata.page` で引いている。**
  //   ⚠ **判定の行に `page` を入れると、⚠ 画面を開いた数に混ざる**
  //     （⚠ `docs/adr/0104` で踏んだのと同じ形）。
  const 本文 = ({ event, 訪問ID = null, 流入元: 元 = "direct", 入口 = null, page = null, 境目 = null } = {}) => {
    if (!EVENTS.has(event)) return null;
    if (!SOURCES.has(元)) return null;
    if (入口 !== null && !ENTRIES.has(入口)) return null;
    if (page !== null && !PAGES.has(page)) return null;
    if (境目 !== null && !BORDERS.has(境目)) return null;
    if (page !== null && 境目 !== null) return null;
    return {
      event_type: event,
      session_id: typeof 訪問ID === "string" && 訪問ID ? 訪問ID : null,
      referrer: 元,
      entry_point: 入口,
      metadata: page ? { page } : (境目 ? { border: 境目 } : null),
    };
  };

  g.KonjakuMeasure = { EVENTS, PAGES, ENTRIES, SOURCES, BORDERS, KEY, 流入元, 訪問, 本文 };
})(typeof window === "undefined" ? globalThis : window);
