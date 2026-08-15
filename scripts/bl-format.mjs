// 建物の詰め方。⚠ ここが唯一の定義。
// 取り込み（ingest-buildings.mjs）と詰め直し（pack-buildings.mjs）の両方から使い、
// 読む側（peel.html の unpackBuildings）と対にする。
// 2か所で別々に書くと、片方だけ直したときに**建物の形が静かにずれる**。
//
// なぜ詰めるか（実測 2026-08-14）:
//   z14 タイル1枚 5.25MB（gz 473KB）。/peel は1画面で最大4枚読むので、
//   スマホに gz 1.9MB を引かせることになっていた。64タイルで 119MB。
//   豊洲だけ（1枚 730KB）で決めた形が、上野・西新宿のような濃い土地で持たなかった。
//
// 何を捨てたか:
//   name … 書いていたが、**どこも読んでいない**（カードにもラベルにも出していない）
//   id   … 同じ。OSM の way id は画面のどこにも出ない
//   ⚠ 捨てたのは「配るデータ」からで、OSM から取るのをやめたわけではない。
//     必要になったら取り込みを直すだけで戻せる。
//
// 何を残したか（peel.html が実際に読んでいるもの）:
//   height / heightSource / kind / startDate と、輪郭
//
// 詰め方:
//   座標は 1e-5 度（約1m）の整数にして、タイル南西の原点からの差分で持つ。
//   2点目以降は前の点からの差分。閉じる最後の点は書かない（読む側で閉じる）。
//   実測: 1点 "[139.79751,35.65482]" 21文字 → "12,-8" 5文字前後。
//   高さは 0.1m 刻みの整数（画面も 0.1m 刻みで出している）。
//   種別は辞書の番号。建設年は西暦の整数（無ければ 0）。

export const VERSION = 2;
const Q = 100000;                        // 1e-5 度。約1m
export const HSRC = ["measured", "levels", "default"];   // ⚠ 順番を変えない

// 建設年。"1988-04-01" も "1988" も 1988 にする。取れないものは 0
function yearOf(sd) {
  if (!sd) return 0;
  const m = /^(-?\d{1,4})/.exec(String(sd));
  const y = m ? +m[1] : NaN;
  return Number.isFinite(y) ? y : 0;
}

// feats: ingest が組んだ GeoJSON Feature の配列
export function pack(feats, tile, at, extra = {}) {
  const [z, tx, ty] = tile;
  // 原点はタイルの中身から取らない。**タイルの南西角**にする
  // （中身から取ると、同じタイルでも取った日によって原点が動く）
  const n = 2 ** z;
  const oLon = Math.round((tx / n * 360 - 180) * Q);
  const oLat = Math.round(lat0(ty, n) * Q);
  const kinds = [], kIdx = new Map();
  const b = [];
  for (const f of feats) {
    const p = f.properties, ring = f.geometry.coordinates[0];
    let ki = kIdx.get(p.kind);
    if (ki == null) { ki = kinds.length; kinds.push(p.kind); kIdx.set(p.kind, ki); }
    const si = HSRC.indexOf(p.heightSource);
    // ⚠ 出所が分からない建物は落とす。既定値と実測を混ぜたら 3D そのものが嘘になる
    if (si < 0) continue;
    // 最後の点は最初と同じなので書かない
    const pts = ring.length > 1
      && ring[0][0] === ring[ring.length - 1][0]
      && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    const row = [Math.round(p.height * 10), si, ki, yearOf(p.startDate)];
    let px = 0, py = 0;
    for (let i = 0; i < pts.length; i++) {
      const x = Math.round(pts[i][0] * Q) - oLon, y = Math.round(pts[i][1] * Q) - oLat;
      row.push(i === 0 ? x : x - px, i === 0 ? y : y - py);
      px = x; py = y;
    }
    b.push(row);
  }
  return { v: VERSION, tile, at, ...extra, q: Q, o: [oLon, oLat], k: kinds, b };
}

// タイル y の北端の緯度（slippy）
function lat0(ty, n) {
  const r = Math.PI - 2 * Math.PI * ty / n;
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r)));
}

// 読む側と同じ手順で戻す。⚠ 検査が pack→unpack を突き合わせるために使う
export function unpack(d) {
  const [oLon, oLat] = d.o, q = d.q;
  return {
    type: "FeatureCollection", tile: d.tile, at: d.at,
    ...(d.truncated ? { truncated: d.truncated } : {}),
    features: d.b.map((r) => {
      const ring = [];
      let x = 0, y = 0;
      for (let i = 4; i < r.length; i += 2) {
        x = i === 4 ? r[i] : x + r[i];
        y = i === 4 ? r[i + 1] : y + r[i + 1];
        ring.push([(oLon + x) / q, (oLat + y) / q]);
      }
      ring.push(ring[0]);
      return { type: "Feature",
        properties: { height: r[0] / 10, heightSource: HSRC[r[1]], kind: d.k[r[2]],
          startDate: r[3] ? String(r[3]) : null },
        geometry: { type: "Polygon", coordinates: [ring] } };
    }),
  };
}
