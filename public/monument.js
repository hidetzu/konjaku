// 自然災害伝承碑を、近い順に引く。DOM も地図も持たない。Node から呼べる。
//
// 決めたこと（2026-08-31。Owner 判断）:
//   自然災害伝承碑は全国に存在するが、散歩中の現在地点に対して提示できるほど
//   高密度ではなかった。だからスマホの 1 画面目には載せず、
//   PC / Deep における「周辺に残る歴史資料」として扱う。
//
//   実測（分母 = 15 地点。全国の話ではない）:
//     半径 1000m で 0 / 15、2000m で 3 / 15、5000m で 8 / 15。
//     いちばん近い碑まで 春日部 1118m ／ 豊洲 1520m ／ 軽井沢 4809m ／ 関宿 24675m。
//
// 言えること:
//   碑があることと、その地点が被災したことは別。
//   言えるのは「この近くに、その災害を伝える碑が残っている」まで。
//
// 「無い」と「取れなかった」を分ける（docs/adr/0056）:
//   tiles.json に無いタイル ＝ その範囲に碑が 1 つも無い
//   tiles.json に在るのに取れない ＝ 取れなかった
(function (g) {
  "use strict";

  const Z = 8;                 // 配っているタイルの段。ingest-monuments.mjs と合わせる
  const 半径M = 5000;          // 深掘りで出す範囲。5000m で 8 / 15 の地点に届く
  const 上限 = 3;              // 出す件数。深掘りでも一覧にはしない

  const tileOf = (lon, lat) => {
    const n = 2 ** Z, r = lat * Math.PI / 180;
    return { x: Math.floor((lon + 180) / 360 * n),
             y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
  };

  // 2 点間の距離（m）。丸めない。呼ぶ側が表示のときに丸める
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const 距離 = (lat1, lon1, lat2, lon2) => {
    const dφ = rad(lat2 - lat1), dλ = rad(lon2 - lon1);
    const a = Math.sin(dφ / 2) ** 2
      + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // 探す輪が触れるタイルを、全部あげる。
  //   1 枚だけ引くと、タイルの境目で「近くに碑は無い」と嘘をつく。
  //   輪の外接四角の 4 隅のタイルを取り、その範囲を埋める。
  const 触れるタイル = (lon, lat, m) => {
    const dLat = m / 111320;
    const dLon = m / (111320 * Math.max(0.01, Math.cos(rad(lat))));
    const a = tileOf(lon - dLon, lat + dLat), b = tileOf(lon + dLon, lat - dLat);
    const out = [];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++)
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) out.push({ x, y });
    return out;
  };

  // 近い順に返す。
  //   fetchJson は呼ぶ側が渡す（fetch を直接触らない。検査がブラウザ抜きで回せる）。
  //   返す形:
  //     { state: "ok", items: [...] }        碑が見つかった
  //     { state: "absent", items: [] }       その範囲に碑が 1 つも無い（表にタイルが無い）
  //     { state: "unreachable", items: [] }  取れなかった（表に在るのに引けない）
  const nearby = async (lon, lat, fetchJson, opt) => {
    const m = opt?.radiusM ?? 半径M, n = opt?.limit ?? 上限;
    const 表 = await fetchJson("./data/monument/tiles.json").catch(() => null);
    if (!表 || !Array.isArray(表.tiles)) return { state: "unreachable", items: [] };
    const 在る = new Set(表.tiles);
    const 要る = 触れるタイル(lon, lat, m).filter((t) => 在る.has(`${t.x}/${t.y}`));
    // 表に 1 枚も無い ＝ その範囲に碑が無い。取れなかったのではない
    if (!要る.length) return { state: "absent", items: [] };
    const 束 = await Promise.all(要る.map((t) =>
      fetchJson(`./data/monument/${Z}/${t.x}/${t.y}.json`).catch(() => null)));
    // 表に在るのに 1 枚でも引けなかった ＝ 取れなかった。0 件と混ぜない
    if (束.some((j) => !j || !Array.isArray(j.items))) return { state: "unreachable", items: [] };
    const items = 束.flatMap((j) => j.items)
      .map((it) => ({ ...it, distM: 距離(lat, lon, it.lat, it.lon) }))
      .filter((it) => it.distM <= m)
      .sort((a, b) => a.distM - b.distM)
      .slice(0, n);
    return { state: "ok", items };
  };

  g.KonjakuMonument = { Z, 半径M, 上限, tileOf, 距離, 触れるタイル, nearby };
})(typeof window === "undefined" ? globalThis : window);
