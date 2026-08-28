// 今昔 — ⚠ **地形分類にも「整備範囲外」があるか**を数える（`docs/adr/0057`）。
//
// ⚠ **これは検査ではない。**⚠ **`npm run check` から呼ばない。**
//   ⚠ **相手先（地理院）の答えに寄りかかるものを、⚠ 検査にしない**（`CLAUDE.md` §9）。
//   ⚠ **一度きりの調査を、⚠ 再現できる形で残すためのもの**（`CLAUDE.md` §6）。
//
// ⚠ **回し方**: `node scripts/survey-landform-coverage.mjs`
//
// ⚠ **404 と「中身が空」を分ける**（⚠ 低湿地では 404 が「整備範囲外」の合図だった。
//   `docs/adr/0056`）。⚠ **地形分類では形が違った**（⚠ ADR 0057）。
const NAT = "https://maps.gsi.go.jp/xyz/experimental_landformclassification1";
const ART = "https://maps.gsi.go.jp/xyz/experimental_landformclassification2";
const x_ = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y_ = (lat, z) => { const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

// ⚠ **低湿地が 404 だった 4 地点＋ 200 だった地点＋ 山間・離島**
const 場所 = [
  ["那覇", 26.2124, 127.6809], ["稚内", 45.4156, 141.6730], ["高知", 33.5597, 133.5311],
  ["石垣", 24.3448, 124.1572], ["網走", 44.0206, 144.2735], ["豊洲", 35.6553, 139.7967],
  ["山間・上高地", 36.2500, 137.6320], ["離島・小笠原", 27.0940, 142.1910],
  ["離島・佐渡", 38.0180, 138.3680], ["山間・十津川", 34.0640, 135.7900],
];
console.log("⚠ 地形分類（experimental_landformclassification）／ ⚠ 404 と「中身が空」を分ける\n");
console.log("場所            z16                        z13");
console.log("                200/404/空   図形数        200/404/空   図形数");
for (const [name, lat, lon] of 場所) {
  const 行 = [];
  for (const Z of [16, 13]) {
    let ok = 0, nf = 0, 空 = 0, 図 = 0;
    for (const base of [NAT, ART]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      try {
        const r = await fetch(`${base}/${Z}/${x_(lon, Z) + dx}/${y_(lat, Z) + dy}.geojson`,
          { signal: AbortSignal.timeout(25000) });
        if (r.status === 404) { nf++; continue; }
        if (!r.ok) continue;
        const j = await r.json();
        const n = (j.features ?? []).length;
        n ? ok++ : 空++;       // ⚠ **200 だが features が 0 = 「中身が空」**
        図 += n;
      } catch { }
    }
    行.push(`${String(ok).padStart(2)}/${String(nf).padStart(2)}/${String(空).padStart(2)}  ${String(図).padStart(4)}`);
  }
  console.log(`${name.padEnd(14)} ${行[0]}        ${行[1]}`);
}
