// 「いま画面に出ているもの」＝台帳を組み立てる、ただ1か所。
//
// ⚠ **ここに DOM も地図も無い。** 状態を渡すと行が返るだけ。
//   だから Node からそのまま呼べて、検査がブラウザを立てずに全組み合わせを回せる
//   （verify.js / swale.js / ground.js と同じ作り）。
//
// なぜ切り出したか（2026-08-18 に実測）:
//   台帳は render() の中で組まれていた。render() は再生中**毎フレーム**走るので、
//   実測で **1 回の再生（11.1 秒）に 299 回**、17 要素を作り直していた。
//   台帳が変わるのは「段が変わったとき」と「データが届いたとき」だけなので、
//   組み立てと書き込みを分けないと、周期の違う 3 つが同じ速さで動く。
//
// ⚠ **語彙は 5 つだけ。増やすときはここに書いて、意味を決めてから使う。**
//   この 5 つの区別が掟そのものなので、字面ではなく **tag** で検査する。
//
//     実測  読んだ。その結果をそのまま出している
//     未取得 読めなかった。⚠ **無いとは言っていない**
//     欠落  読んだうえで、本当に無い
//     未対応 こちらがまだ用意していない。⚠ **通信の話ではない**
//     推定  こちらが立てた値。実測ではない
//
// ⚠ 「未取得」の行には、**必ず**「無いとは限らない」側の但し書きを付ける。
//   付け忘れると、読めなかったことが「無かった」に読める（掟の一行目）。
((g) => {
  const OK = "ok", NO = "no", EST = "est";

  // 地表。いま地面として出している 1 枚が、本当に届いたか。
  // ⚠ 届いていないときに「実測」と書かない。ここは画面でいちばん広い面なので、
  //   水面・建物に入れたガードを、いちばん大きく破れる場所でもある。
  const groundRow = (arrived, era) => arrived
    ? { level: OK, tag: "実測",
        body: `地表は${era ? "<b>その年代の空中写真</b>" : "<b>明治期の低湿地データ</b>"}そのもの。加工なし` }
    : { level: NO, tag: "未取得",
        body: `地表の${era ? `<b>${era.label}の空中写真</b>` : "<b>明治期の低湿地データ</b>"}が届いていない`,
        note: "届いていないだけで、この年代の記録の有無は分かっていない" };

  // 水面。読めた／読めなかった／本当に無い、を混ぜない
  const waterRow = (area) => (!area || area.waterRead)
    ? { level: OK, tag: "実測", body: "水面の形は低湿地データから起こした<b>実際の水域</b>" }
    : { level: NO, tag: area.waterUnread ? "未取得" : "欠落",
        body: area.waterUnread ? "明治期の低湿地データを読み込めていない"
                               : "この範囲に明治期の低湿地データが無い" };

  // 建物。⚠ 0 件は「無い」ではなく**読んだ結果**なので実測の側に置く。
  //   以前は件数の真偽だけで分岐していたので、待っている間も正常な 0 件も
  //   同じ「欠落」と書いていた。
  const buildingRows = (area) => {
    if (!area || area.bldState === "loading")
      return [{ level: NO, tag: "未取得", body: "建物データを<b>取得中</b>",
                note: "まだ届いていないだけで、この範囲の建物の有無は分かっていない" }];
    // ⚠ **進行形を使わない。**「取得中」「届いていない」は、利用者役 3/3 が
    //   そろって自分の通信の話として読んだ。今この瞬間に動いている感じが出るため。
    // ⚠ **「通信の問題ではありません」と言い切る。**野暮でも書く。
    if (area.bldState === "notyet")
      return [{ level: NO, tag: "未対応",
                body: "建物ごとの判定は、<b>この場所ではまだ提供していません</b>",
                note: "通信の問題ではありません。対応した場所から順に増やしています。\n"
                    + "現地に建物が無いという意味でもありません" }];
    if (area.bldState === "fail")
      return [{ level: NO, tag: "未取得", body: "建物データを<b>取得できていない</b>",
                note: "届いていないだけで、この範囲の建物の有無は分かっていない" }];
    // ⚠ どの資料で 0 件だったかまで書く（台帳は出所を書く欄）
    if (!area.total)
      return [{ level: OK, tag: "実測",
                body: area.bldSource === "overpass" ? "OSM への問い合わせで<b>建物 0 件</b>"
                                                    : "取り込み済みの建物データで<b>建物 0 件</b>",
                note: "OSM に登録が無いだけで、現地に建物が無いとは限らない" }];

    const out = [];
    // ⚠ 高さは「いま見えている形」そのもの。消える年代の演出より手前の事実なので先に置く。
    if (area.hSrc)
      out.push({ level: EST, tag: "推定",
        body: "建物の<b>高さ</b>は、ほとんどが\n<b>こちらで決めた既定値</b>。",
        note: `OSM に高さが入っているのは ${area.hSrc.measured} / ${area.total} 件。\n`
            + `階数から換算したものが ${area.hSrc.levels} 件、残る ${area.hSrc.default} 件は\n`
            + "「この種別ならこの高さ」としてこちらで立てた値\n",
        peek: { id: "peekH", label: `高さが実測の ${area.hSrc.measured} 件を光らせる` } });
    // ⚠ 件数と「演出」はここに書かない。両方 #est（常時見える）にある。
    //   ここは台帳なので行は残すが、同じ数字を持たない。
    out.push({ level: EST, tag: "推定",
      body: "建物が<b>消える年代</b>は、\nこちらが立てた概算。",
      note: "根拠は「足元が水なら埋立前には無い」だけ"
          + (area.dated ? "" : "。<b>この範囲では1件も分かっていない</b>"),
      peek: area.dated ? { id: "peekY", label: "建てられた年が分かる建物を光らせる" } : null });
    return out;
  };

  // 足元の判定が届かなかった建物
  const unreadRow = (area) => (area && area.unread)
    ? [{ level: NO, tag: "未取得", body: `${area.unread} 件は足元の判定ができていない`,
         note: "読み込めなかっただけで、明治期のデータが無いとは限らない" }]
    : [];

  // 出ているものだけを説明する。出ていないものの出所は書かない
  const rows = (s) => [
    groundRow(s.groundArrived, s.era),
    waterRow(s.area),
    ...buildingRows(s.area),
    ...unreadRow(s.area),
  ];

  // 行 → HTML。⚠ **HTML を作るのはここだけ。**
  //   行を足すときに `<div class="prov">` を自分で書き始めないこと。
  // ⚠ body と 但し書きのあいだは**改行1つ**。HTML では空白1つに潰れるが、
  //   詰めると innerText が 1 文字変わる（検査が字面で読んでいる）。
  const html = (list) => list.map((r) =>
    `<div class="prov ${r.level}"><span class="t">${r.tag}</span>${r.body}`
    + (r.note || r.peek
        ? `\n<span class="d">${r.note || ""}`
          + (r.peek ? `<button class="peek" id="${r.peek.id}">${r.peek.label}</button>` : "")
          + "</span>"
        : "")
    + "</div>").join("");

  // ⚠ 「読めなかった」と言う行。ここに挙がっている tag は、
  //   **無いと断定する文を持ってはいけない**（検査がこの表を使う）
  const TAGS = { OK: "実測", ABSENT: "欠落", UNREAD: "未取得", NOTYET: "未対応", EST: "推定" };

  g.KonjakuProv = { rows, html, groundRow, waterRow, buildingRows, unreadRow, TAGS };
})(typeof globalThis !== "undefined" ? globalThis : this);
