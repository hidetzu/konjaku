// 江東区の範囲で、各年代タイルが実際に存在するかを総当たりで確かめる。
// 年代ごとにカバレッジが異なるため、その穴を実測する。
// 実行: node check-tiles.js

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";

// 江東区のおおよその外接矩形
const BBOX = { w: 139.775, s: 35.605, e: 139.855, n: 35.712 };

const LAYERS = [
  { id: "ort_riku10", label: "1936–42 陸軍", ext: "png" },
  { id: "ort_USA10",  label: "1945–50 米軍", ext: "png" },
  { id: "ort_old10",  label: "1961–69",      ext: "png" },
  { id: "gazo1",      label: "1974–78",      ext: "jpg" },
  { id: "gazo2",      label: "1979–83",      ext: "jpg" },
  { id: "gazo3",      label: "1984–86",      ext: "jpg" },
  { id: "gazo4",      label: "1987–90",      ext: "jpg" },
  { id: "seamlessphoto", label: "最新写真",  ext: "jpg" },
  { id: "swale",      label: "明治期低湿地", ext: "png" },
  { id: "lcm25k",     label: "土地条件図",   ext: "png" },
  { id: "lcmfc2",     label: "治水地形分類", ext: "png" },
];

const ZOOMS = [14, 15, 16];

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function tilesFor(z) {
  const out = [];
  for (let x = lon2x(BBOX.w, z); x <= lon2x(BBOX.e, z); x++)
    for (let y = lat2y(BBOX.n, z); y <= lat2y(BBOX.s, z); y++) out.push([x, y]);
  return out;
}

// 同時接続を絞る。地理院に負荷をかけない。
async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) out.push(await fn(items[i++]));
    })
  );
  return out;
}

console.log(`江東区 bbox ${BBOX.w},${BBOX.s} – ${BBOX.e},${BBOX.n}\n`);

for (const z of ZOOMS) {
  const tiles = tilesFor(z);
  console.log(`--- z${z}（${tiles.length}タイル）---`);
  for (const L of LAYERS) {
    const res = await pool(tiles, 6, async ([x, y]) => {
      try {
        const r = await fetch(`${GSI}/${L.id}/${z}/${x}/${y}.${L.ext}`);
        if (!r.ok) return 0;
        return (await r.arrayBuffer()).byteLength;
      } catch {
        return -1;
      }
    });
    const hit = res.filter((n) => n > 0).length;
    const kb = hit ? Math.round(res.reduce((a, b) => a + Math.max(0, b), 0) / hit / 1024) : 0;
    const pct = Math.round((hit / tiles.length) * 100);
    const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "·");
    console.log(`  ${L.label.padEnd(14, "　")} ${bar} ${String(pct).padStart(3)}%  ${hit}/${tiles.length}  平均${kb}KB`);
  }
  console.log();
}
