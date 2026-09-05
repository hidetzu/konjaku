// 「この足元の区分が、どこで別の区分に変わるか」だけを答える、ただ 1 か所。
//
// なぜ要るか（2026-09-05。v0.3.0）:
//   今昔は「この土地は昔なんだったか」に答える。答えを読んだ人が、次にできることが無かった。
//   境目は、その答えを足で確かめられる唯一の場所。地面が変わるところは、現地でも分かる。
//
// ⚠ **新しいデータを作らない。** 地形分類はベクトル（GeoJSON の面）で取っている。
//   境目は、その面の縁そのもの。事前処理を増やさずに出せる。
//
// ⚠ **ここは DOM も地図も fetch も持たない。** 面を渡されて、距離と方角を返すだけ。
//   だから Node からそのまま呼べて、検査がブラウザ抜きで回せる
//   （swale.js / ground.js / land.js と同じ作り）。取りに行くのは verify.js の仕事。
//
// 環境:
//   ブラウザ  <script src="./border.js"></script> → globalThis.KonjakuBorder
//   Node      await import("../public/border.js") → globalThis.KonjakuBorder
(function (g) {
  "use strict";

  // ⚠ **歩いて確かめられる範囲まで。** これより遠い境目は出さない。
  //   ⚠ この数は「歩ける」の定義であって、測って出た値ではない。決めた値だと分かるように書く。
  const 上限m = 600;

  // ⚠ **縁の向こう側を見に行く距離。** 縁ちょうどだと、どちらの面にも入らないことがある。
  //   小さすぎると面の外に出られず、大きすぎると隣の隣を読む。
  const またぐm = 20;

  // 緯度経度を、その場かぎりの平面へ。1km 程度なら、この近似で足りる。
  //   ⚠ **遠くには使えない。** 上限m を超える距離を、この式で測らない。
  const R = 6378137;
  const 平面 = (lat0) => {
    const k = Math.PI / 180;
    const mx = R * k * Math.cos(lat0 * k);   // 経度 1 度ぶんの東西距離
    const my = R * k;                        // 緯度 1 度ぶんの南北距離
    return {
      xy: (lon, lat) => [lon * mx, lat * my],
      戻す: (x, y) => [x / mx, y / my],
    };
  };

  // 点から線分への最短点。t を [0,1] に閉じるので、線分の外へは出ない。
  const 線分の最短点 = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0) return [ax, ay];
    let t = ((px - ax) * dx + (py - ay) * dy) / d2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + t * dx, ay + t * dy];
  };

  // 交差数判定。⚠ **verify.js の inPolygon と同じ問いに答える。**
  //   ⚠ 2 か所に持ちたくないが、あちらは経緯度のまま、こちらは平面で解く。
  //   ⚠ 混ぜると、あちらが平面変換を知ることになる。ここでは経緯度のまま解いて揃える。
  const 環の中 = (px, py, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const 面の中 = (px, py, geom) => {
    if (!geom) return false;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
                : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const p of polys) {
      if (!p.length || !環の中(px, py, p[0])) continue;
      let hole = false;
      for (let k = 1; k < p.length; k++) if (環の中(px, py, p[k])) hole = true;
      if (!hole) return true;
    }
    return false;
  };

  const 環たち = (geom) => {
    if (!geom) return [];
    const polys = geom.type === "Polygon" ? [geom.coordinates]
                : geom.type === "MultiPolygon" ? geom.coordinates : [];
    return polys.flat();
  };

  const 区分 = (f) => String(f?.properties?.code ?? "");

  // 8 方位。⚠ 16 方位にしない。歩くのに要る精度はここまで。
  const 方位 = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const 方角 = (deg) => 方位[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

  /**
   * 足元の区分が、どこで別の区分に変わるか。
   *
   * @param features 読み込めた面（複数タイルぶんを混ぜてよい）
   * @param lon,lat  調べる点
   * @param opts.上限m       これより遠い境目は出さない（既定 600）
   * @param opts.見えている範囲m  読み込んだタイルが、この点から何 m 先まで在るか。
   *          ⚠ **「境目が無い」と「見えている範囲に無い」を分けるために要る。**
   *
   * @returns
   *   { state:"ok",   code, toCode, m, deg, 方角 }  境目が在って、向こう側の区分も読めた
   *   { state:"遠い",  近いm }                       境目は在るが、上限より遠い
   *   { state:"見えない", 見えている範囲m }            読み込んだ範囲に別の区分が無い（⚠ 無いとは言えない）
   *   { state:"足元が無い" }                          この点に区分が無い（対象範囲の外）
   */
  function 境目(features, lon, lat, opts = {}) {
    const 上限 = Number(opts.上限m ?? 上限m);
    const 見えている = opts.見えている範囲m == null ? null : Number(opts.見えている範囲m);
    const fs = (features ?? []).filter((f) => f && f.geometry && 区分(f));

    const ここ = fs.find((f) => 面の中(lon, lat, f.geometry));
    if (!ここ) return { state: "足元が無い" };
    const 自分 = 区分(ここ);

    const 面 = 平面(lat);
    const [px, py] = 面.xy(lon, lat);

    // ⚠ **「区分が変わるまでの距離」を、⚠ そのまま測る。**
    //   ⚠ **自分の面の縁を見るだけでは足りない**（2026-09-05 に踏んだ）。
    //   ⚠ **同じ区分の面が隣り合っていることがある。**⚠ **その継ぎ目は、⚠ 区分の境目ではない。**
    //   ⚠ **実測（24 地点）**: ⚠ 縁だけを見ていたとき、⚠ 高知 1m・長野 9m・網走 14m と出た。
    //   ⚠ **どれも「同じ区分の面の継ぎ目」だった。**⚠ **歩いて確かめる相手ではない。**
    let 最短 = Infinity, 当たり = null, 向こう = null;
    for (const f of fs) {
      if (区分(f) === 自分) continue;          // ⚠ 同じ区分は、⚠ 境目の向こうではない
      for (const ring of 環たち(f.geometry)) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, ay] = 面.xy(ring[j][0], ring[j][1]);
          const [bx, by] = 面.xy(ring[i][0], ring[i][1]);
          const [qx, qy] = 線分の最短点(px, py, ax, ay, bx, by);
          const d = Math.hypot(qx - px, qy - py);
          if (d < 最短) { 最短 = d; 当たり = [qx, qy]; 向こう = f; }
        }
      }
    }
    // ⚠ **読み込んだ範囲に、⚠ 別の区分が 1 つも無かった。**⚠ **「無い」とは言わない。**
    if (!当たり || !Number.isFinite(最短))
      return { state: "見えない", 見えている範囲m: 見えている == null ? null : Math.round(見えている) };

    const m = Math.round(最短);
    if (m > 上限) return { state: "遠い", 近いm: m };
    // ⚠ **読み込んだ範囲の外を、⚠ 「境目が無い」と言わない**（掟の一行目）。
    if (見えている != null && m > 見えている)
      return { state: "見えない", 見えている範囲m: Math.round(見えている) };

    const dx = 当たり[0] - px, dy = 当たり[1] - py;
    // 方角は北を 0 度、東回り。⚠ 画面に出すのは 8 方位だけ。
    const deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

    return { state: "ok", code: 自分, toCode: 区分(向こう), m, deg, 方角: 方角(deg) };
  }

  // タイル 1 枚が、その緯度で何 m か。
  //   ⚠ **地球の大きさを 2 か所に持たないための口**（verify.js が「見えている範囲」を出すのに使う）。
  const タイル幅m = (lat, z) => 2 * Math.PI * R * Math.cos(lat * Math.PI / 180) / 2 ** z;

  g.KonjakuBorder = { 境目, 方角, タイル幅m, 上限m, またぐm };
})(typeof window === "undefined" ? globalThis : window);
