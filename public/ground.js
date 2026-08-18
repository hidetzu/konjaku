// 「この場所に、3D の下地（取り込み済みの建物）があるか」に答える、ただ1か所。
//
// ⚠ **この問いに、2 か所で答えない。**（掟: 同じ問いに答える実装を2つ持たない）
//   トップは「この場所を深掘り」の導線を出すかどうかを、
//   /peel は建物を静的に描けるかどうかを、**同じ答え**で決める。
//   別々に書くと、トップが「深掘りできる」と言った場所で /peel が
//   Overpass に落ちる（＝出るか出ないかが相手次第）状態が作れてしまう。
//
// ⚠ 判定の単位は **z14 タイル**（約 2.4km 四方）で、街ではない。
//   しかも /peel が集計する範囲（下の HALF）を**覆うタイルが 1 枚残らず**要る。
//   実測 2026-08-18: 同じ「広島」でも、クイック地点の座標は揃っていて、
//   市中心の座標は 4 枚中 2 枚欠けていた。**同じ街でも地点で割れる。**
//
// ⚠ **読めなかったときは「無い」と言わない**（掟）。
//   索引を取得できないのと、索引に無いのは別。前者は null を返す。
//   呼ぶ側は null を「分からない」として扱うこと。false と混ぜない。
window.KonjakuGround = (() => {
  // ⚠ /peel が集計する範囲。**peel3d.js と同じ値でなければ答えが割れる。**
  //   あちらはこの値をここから読む（二重に持たない）。約1.6km四方。
  const HALF_LON = 0.0090, HALF_LAT = 0.0070;

  const z14of = (lon, lat) => { const n = 2 ** 14, r = lat * Math.PI / 180;
    return { x: Math.floor((lon + 180) / 360 * n),
             y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) }; };

  const bboxOf = (lon, lat) =>
    ({ w: lon - HALF_LON, e: lon + HALF_LON, s: lat - HALF_LAT, n: lat + HALF_LAT });

  // その範囲を覆う z14 タイルの鍵を、左上から右下まで全部
  const keysFor = (bbox) => {
    const a = z14of(bbox.w, bbox.n), b = z14of(bbox.e, bbox.s), out = [];
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push(`${x}/${y}`);
    return out;
  };

  // 索引は assets.json（共通マニフェスト）経由で引く。
  // ⚠ ここで data/bl/index.json を直に書かない。配信物の置き場所は
  //   scripts/export-assets.mjs が決めている。直書きすると、置き場所を変えたときに
  //   トップだけ古い場所を見に行く。
  let manifestP = null, indexP = null;
  let cache;   // undefined=まだ読んでいない ／ null=読めなかった ／ object=索引
  function manifest() {
    if (!manifestP) manifestP = fetch("./data/assets.json", { cache: "no-cache" })
      .then((r) => r.ok ? r.json() : null).catch(() => null);
    return manifestP;
  }
  function load() {
    if (!indexP) indexP = manifest().then((m) => {
      const spec = m?.layers?.buildings;
      if (!spec?.index || !spec?.tile) return null;
      return fetch(spec.index, { cache: "no-cache" }).then((r) => r.ok ? r.json() : null)
        .then((idx) => idx?.tiles ? { ...idx, __tile: spec.tile } : null);
    }).catch(() => null).then((idx) => { cache = idx; return idx; });
    return indexP;
  }

  // 索引を読み終えていれば true / false、まだなら null。
  // ⚠ null は「分からない」。呼ぶ側で false と同じに扱わない。
  const hasSync = (lon, lat) => {
    // ⚠ 座標が無いのは「下地が無い」ではない。false を返すと、場所を選ぶ前の画面で
    //   「取り込んでいない」と答えたことになる
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (cache === undefined || cache === null) return null;
    return keysFor(bboxOf(lon, lat)).every((k) => cache.tiles[k]);
  };
  const has = (lon, lat) => load().then(() => hasSync(lon, lat));

  // /peel 用。読むべきタイルの並びと、その置き場所。
  // 1 枚でも索引に無ければ null（＝静的では答えない）。
  const tilesFor = (bbox) => {
    if (!cache?.tiles) return null;
    const keys = keysFor(bbox);
    for (const k of keys) if (!cache.tiles[k]) return null;
    return { keys, tile: cache.__tile };
  };

  return { HALF_LON, HALF_LAT, z14of, bboxOf, keysFor, load, has, hasSync, tilesFor,
           index: () => load() };
})();
