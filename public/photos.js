// 「その年代の写真が、いま届いているか」に答える、ただ1か所。
//
// ⚠ **ここに DOM も地図も無い。** 何が起きたかを渡すと、状態が返るだけ。
//   だから Node からそのまま呼べて、検査がブラウザを立てずに全組み合わせを回せる
//   （words.js / prov.js / swale.js / ground.js と同じ作り）。
//
// なぜ切り出したか（2026-08-20 に実測）:
//   ⚠ **同じ問い（写真が取れたか）に、2 つの実装が答えていた。**
//
//     トップ   `<img>` の error だけを見て `.err` を付ける      … ⚠ **状態は 1 つ**
//     /peel    map.on("error") ＋ 到着・猶予・失敗              … ⚠ **状態は 4 つ**
//
//   ⚠ その結果、⚠ **トップは 3 通り（通信断 / 404 / 圏外）を 1 つの文に潰していた**。
//     実測（2026-08-20・375×667・豊洲）: 3 通りとも
//     「この年代の写真を読み込めませんでした」。
//   ⚠ **404 は「遅い」と区別できない**のに「読み込めませんでした」と言い切っていた
//     （/peel はそれを避けている）。
//
// ⚠ **状態は 4 つ。増やすときはここに書いて、意味を決めてから使う。**
//
//     ok      … その地点を覆うタイルが読めた
//     fail    … ⚠ **落ちたことを実際に観測した**（why はその理由）
//     late    … ⚠ **猶予を過ぎても読めていない。**⚠ **理由は知らない**
//     pending … 猶予の中。まだ届いていないが、普通の回線ならすぐ届く
//
// ⚠ **fail と late を混ぜない。**
//   late は「まだ来ていない／404 で写真が無い」を含み、⚠ **こちらは理由を知らない**。
//   ⚠ **知らないことを「読み込めませんでした」と書かない**（掟の一行目）。
//
// ⚠ **`docs/DOMAIN.md` §3 の 5 つとは別の軸。**
//   あちらは「その資料がこの土地を対象にしているか」、⚠ **こちらは「いま届いたか」**。
((g) => {
  // ⚠ 猶予（ミリ秒）。⚠ **実測で決めた**（tmp/probe-ground-arrival.mjs・2026-08-18）:
  //   通常回線は 69ms〜403ms で届く。3G 相当は 3.4〜9.5 秒。
  //   ⚠ すぐ切り替えると、段を送るたびに 0〜0.4 秒だけ「まだ出ていません」が光る。
  const GRACE_MS = 1200;

  // 落ち方から理由を決める。⚠ **語彙は places.js の検索側に合わせる**
  //   （掟: 同じ問いに答える実装を2つ持たない）。
  // ⚠ **404 をここに書かない。**404 は「遅い」と区別できないので、
  //   ⚠ **そもそも fail にしない**（呼ぶ側が late のままにする）。
  const whyOf = (status) =>
    status === 0 || status == null ? "通信できません"
    : status === 403 || status === 401 ? "サーバが拒否しました"
    : `サーバが ${status} を返しました`;

  // いまどういう状態か。⚠ **順番を変えない。**
  //   ⚠ 届いたが先（届いていれば、過去に落ちていても関係ない）。
  //   ⚠ 次に「落ちたのを観測した」。⚠ **観測していないものを fail にしない。**
  //   ⚠ 最後に猶予。
  // ⚠ **era は「何の写真か」の素性**（isLatest / isMeiji）。⚠ **状態と一緒に返す。**
  //   ⚠ **画面に組み立てさせない**（させると、その判断が画面ごとに増える）。
  // ⚠ **online もここで見る。**⚠ 画面が navigator を触らなくて済む。
  const stateOf = (arrived, late, fail, era, online) => {
    const meta = { era: era ?? {}, online: online ?? (typeof navigator === "undefined" ? true : navigator.onLine) };
    return arrived ? { kind: "ok", ...meta }
      : fail ? { kind: "fail", why: fail.why, ...meta }
      : late ? { kind: "late", ...meta }
      : { kind: "pending", ...meta };
  };

  // その地点を覆うタイルが読めているか。
  // ⚠ どのズーム段で取りに行くかは地図側の都合で変わる（256px タイルは表示ズーム+1段）。
  //   ⚠ **段を決め打ちしない。**読めたタイルの側から「中心を含むか」で見る。
  //   keys は読めたタイルの "z/x/y"、xf/yf は z0 段でのタイル座標（小数）。
  const covers = (keys, xf, yf, z0) => {
    for (const k of keys) {
      const [z, x, y] = k.split("/").map(Number), n = 2 ** (z - z0);
      if (Math.floor(xf * n) === x && Math.floor(yf * n) === y) return true;
    }
    return false;
  };

  // 猶予を過ぎたか。⚠ **時刻を渡す**（Date.now() をここで呼ばない。検査が回せなくなる）。
  const isLate = (since, now) => since > 0 && now - since >= GRACE_MS;

  g.KonjakuPhotos = { GRACE_MS, whyOf, stateOf, covers, isLate };
})(typeof window === "undefined" ? globalThis : window);
