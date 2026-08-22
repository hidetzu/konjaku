// 「この地点で選べる年代はどれで、いまどれを選んでいるか」に答える、ただ1か所。
//
// ⚠ **ここに DOM も地図も無い。** 何が取れたかを渡すと、段が返るだけ。
//   だから Node からそのまま呼べて、検査がブラウザを立てずに全組み合わせを回せる
//   （photos.js / words.js / prov.js / swale.js / ground.js / land.js / verify.js と同じ作り）。
//
// なぜ切り出したか（hidetzu/konjaku#170）:
//   ⚠ **同じ問い（この地点で選べる段はどれか）に、2 つの実装が答えていた。**
//
//     トップ   `index.html` の `buildFrames`（⚠ **ページの中に直書き**）
//     /peel    `peel3d.js` の `stepsFrom`
//
//   ⚠ **すでに 1 か所ずれていた**（実測 2026-08-23・`main` = `9b6e83b`）:
//
//     | | 明治期を段に足す条件 |
//     |---|---|
//     | トップ | ⚠ **判定できたときだけ**（`meiji.ok && meiji.value`） |
//     | /peel  | ⚠ **無条件** |
//
//   ⚠ その結果、⚠ **札幌（明治期の低湿地データが整備対象外）でも、
//     ⚠ `/peel` のものさしの右端が「明治期」**になっていた
//     （実測: 「現在 1974–78 1945–50 明治期」）。⚠ **押しても水域は出ない。**
//
// ⚠ **並びはここで決めない。**⚠ **古い順に返す。**⚠ **向きは呼ぶ側が決める**
//   （⚠ コマ帯は左から明治期、⚠ ものさしは左が現在。⚠ **見せ方が違う**）。
//
// ⚠ **時間座標（tau）はここが持たない。**⚠ **`/peel` の 3D 固有**で、
//   ⚠ 建物が消える年・水位・フェードがそれで決まる。⚠ **段を間引いても動かさない**もの。
((g) => {
  // ⚠ **落とし方は 2 画面で一致していた。**⚠ **そのまま 1 か所に持つ。**
  //   ⚠ `unreachable`（通信断・タイムアウト・403 などの拒否）… ⚠ **段に残す。**
  //     ⚠ 消すと「取れなかった」が「無い」になる（掟の一行目）。
  //     ⚠ 実測（2026-08-19・出島・利用者役 3 名。⚠ **実在の利用者ではない**）:
  //       ⚠ **落とした版を見せると 3/3 が「1984–86 の写真は存在しない」と答えた。**
  //       ⚠ **残した版では 0/3。**
  //   ⚠ 404（この年代の写真は無い）と、⚠ 白紙（タイルはあるが撮影範囲の外）… **出さない。**
  const keepEra = (e) => e.state === "unreachable" || (e.state === "ok" && !e.blank);

  // その地点で選べる段を、⚠ **古い順**に返す。
  //
  //   photos   `KonjakuLand.photos()` の結果（⚠ `eras` を見る）
  //   latest   「現在」の年代（⚠ `Konjaku.LATEST`）
  //   meiji    明治期の段（⚠ 呼ぶ側が字と素性を持つ）
  //   hasMeiji ⚠ **明治期の段を足してよいか**（⚠ **その土地に低湿地データがあるか**）
  //
  // ⚠ **`hasMeiji` を渡さないと足さない。**⚠ **無いものを並べない**（ADR 0012）。
  //   ⚠ **ここが「2 実装のずれ」の正体**（⚠ トップは条件つき、⚠ `/peel` は無条件だった）。
  // ⚠ **読めなかった（photos そのものが落ちた）ときは、⚠ 何も間引かない。**
  //   ⚠ 「確かめられなかった」を「無い」に変えない（掟）。⚠ 呼ぶ側が `all` を渡す。
  const stepsOf = ({ photos, all, latest, meiji, hasMeiji }) => {
    const out = [];
    if (hasMeiji && meiji) out.push({ ...meiji, state: "ok" });
    // ⚠ **`ERAS` は新しい順ではない。**⚠ `verify.js` の並び（古い順）をそのまま使う。
    for (const e of (photos?.eras ?? all ?? [])) if (keepEra(e)) out.push(e);
    if (latest) out.push({ ...latest, state: "ok", now: true });
    return out;
  };

  // いま何段目か。⚠ **見つからないときは -1**（⚠ 0 に丸めない）。
  const indexOf = (steps, id) => (steps ?? []).findIndex((s) => s.id === id);

  // 前後へ動かす。⚠ **端で止まる**（⚠ 回り込まない）。
  const step = (steps, i, delta) =>
    Math.max(0, Math.min((steps?.length ?? 1) - 1, (i ?? 0) + (delta ?? 0)));

  // 共有された年代を復元できたか。
  // ⚠ **できなかったときは、⚠ 種類で返す。**⚠ **字はここで作らない**（`words.js` が持つ）。
  //   `none`  … 復元するものが無い（⚠ URL に年代が入っていない）
  //   `ok`    … その地点に在った
  //   `gone`  … ⚠ **この地点には残っていない**（⚠ 「無い」ではない。⚠ 段に出せないだけ）
  const resolve = (steps, wantId) => {
    if (!wantId) return { kind: "none" };
    const i = indexOf(steps, wantId);
    return i >= 0 ? { kind: "ok", index: i } : { kind: "gone", id: wantId };
  };

  g.KonjakuEras = { keepEra, stepsOf, indexOf, step, resolve };
})(typeof window === "undefined" ? globalThis : window);
