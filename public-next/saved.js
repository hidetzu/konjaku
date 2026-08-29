// 今昔 v0.1.0 — 保存した場所の控え。
//
// ⚠ **DOM も地図も持たない。**⚠ **Node からそのまま呼べる**
//   （`.claude/rules/javascript.md`。⚠ **検査がブラウザ抜きで回せる**）。
//   ⚠ **置き場は引数で受け取る。**⚠ `localStorage` を直接触らない。
//
// ⚠ **文言を持たない**（`.claude/rules/domain.md`）。⚠ 数と意味だけ。
//   ⚠ 「きょう」「きのう」のような言い方は、⚠ **画面側が決める。**
(function (g) {
  "use strict";

  // 版。控えた形が変わったら上げる。⚠ **上げると前の版は読まれない**（混ざらない）
  const KEY = "konjaku-next-saved-v1";

  // 同じ場所を二重に保存しない距離。
  //   ⚠ **地図の中心は指で少し動く。**⚠ 厳密に一致することはまず無い。
  //   ⚠ 50m は「同じ交差点なら同じ場所」と読める幅。⚠ 建物 1 棟より広く、⚠ 街区より狭い。
  const SAME_M = 50;

  // 2 点の距離（m）。⚠ **緯度の差は経度より効く**ので、⚠ cos で縮める。
  //   ⚠ 数十 m を測るだけなので、⚠ 球面の厳密解は要らない。
  function distanceM(aLon, aLat, bLon, bLat) {
    const R = 6378137, rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
    return Math.hypot(dLat, dLon) * R;
  }

  // 置き場が読めないことがある（⚠ プライベートモード・⚠ 容量切れ）。
  //   ⚠ **読めないときは空として扱い、⚠ 画面を止めない**（`javascript.md`）。
  //   ⚠ **「空」と「読めない」は返り値で分ける。**⚠ 画面側が言い分けられるように。
  function load(store) {
    try {
      const raw = store.getItem(KEY);
      if (raw === null) return { ok: true, list: [] };
      const v = JSON.parse(raw);
      if (!Array.isArray(v)) return { ok: false, list: [] };
      // ⚠ **座標が無いものは捨てる。**⚠ 戻れない記録を一覧に出さない。
      return { ok: true, list: v.filter((r) => r && isFinite(r.lon) && isFinite(r.lat)) };
    } catch {
      return { ok: false, list: [] };
    }
  }

  function save(store, list) {
    try { store.setItem(KEY, JSON.stringify(list)); return true; }
    catch { return false; }   // ⚠ 容量切れ。⚠ 握りつぶさず、⚠ 失敗を返す
  }

  // いまの地点に一致する記録。⚠ **無ければ null。**
  function findAt(list, lon, lat) {
    for (const r of list) if (distanceM(lon, lat, r.lon, r.lat) <= SAME_M) return r;
    return null;
  }

  // 足す。⚠ **同じ場所が既に在れば、⚠ 増やさずにそのまま返す。**
  //   ⚠ **新しいものが先頭。**⚠ 一覧は上から新しい順に読む。
  function add(list, rec) {
    if (findAt(list, rec.lon, rec.lat)) return list;
    return [rec, ...list];
  }

  // 外す。⚠ **一致するものだけ 1 件。**
  function remove(list, lon, lat) {
    const hit = findAt(list, lon, lat);
    return hit ? list.filter((r) => r !== hit) : list;
  }

  g.KonjakuSaved = { KEY, SAME_M, distanceM, load, save, findAt, add, remove };
})(typeof globalThis !== "undefined" ? globalThis : this);
