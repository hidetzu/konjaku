// 今昔 — ⚠ **自然災害伝承碑を取り込み、⚠ 今昔の形へ正規化する**（`docs/adr/0052`）。
//
// ⚠ **回し方**: `node scripts/ingest-monuments.mjs`（⚠ 取り込んだあとはログを見る。`CLAUDE.md` §9）
//
// ⚠ **決めていること**（2026-08-31。Owner 判断。⚠ 実測を優先し、設計書のほうを直した）:
//
//   ⚠ **年を 1 つの値へ丸めない。**⚠ **出典の字（DisasterName）が表示の正本。**
//     ⚠ 実測: ⚠ **災害の年は構造化されていない。**⚠ `昭和13年洪水<br>(1938年6月ほか)` の
//     ⚠ 自由文にしか無い。⚠ **`(1884、他)` や `(不明)` もある。**⚠ **1 つに丸めると嘘になる。**
//   ⚠ **種別も出典の字のまま。**⚠ **複合種別（`地震・津波`）を分解しない。**
//     ⚠ 実測: ⚠ **`洪水・土砂災害` 366 件、⚠ `地震・津波` 502 件。**⚠ **絵文字 1 個に割り当てられない。**
//   ⚠ **取り出した年は `derived` に分ける。**⚠ **検索・並び替えに使う。**⚠ **原則、画面に出さない。**
//   ⚠ **「不明」「ほか」「以降」も落とさない。**⚠ **落とすと、⚠ 言えないことを言えることにしてしまう。**
//
// ⚠ **404 を「0 件」と数えない**（⚠ `survey-pins.mjs` が 2026-08-29 に踏んだ）。
//   ⚠ **伝承碑は `maxNativeZoom: 7`。**⚠ **取れなかったことと、⚠ 無いことを分ける**（掟 §1）。
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "public-next", "data");
const Z = 7, X = [107, 119], Y = [46, 58];

const 生 = new Map();
const タイル = { 取れた: 0, 空: 0, 聞けず: [] };

for (let x = X[0]; x <= X[1]; x++) {
  for (let y = Y[0]; y <= Y[1]; y++) {
    const url = `https://maps.gsi.go.jp/xyz/disaster_lore_all/${Z}/${x}/${y}.geojson`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r) { タイル.聞けず.push(`${x}/${y} 接続できない`); continue; }
    if (r.status === 404) { タイル.空++; continue; }
    if (!r.ok) { タイル.聞けず.push(`${x}/${y} ${r.status}`); continue; }
    const j = await r.json().catch(() => null);
    if (!j) { タイル.聞けず.push(`${x}/${y} 読めない`); continue; }
    タイル.取れた++;
    for (const f of j.features ?? []) {
      const p = f.properties ?? {};
      const c = f.geometry?.coordinates;
      if (p.ID && Array.isArray(c) && c.length === 2) 生.set(p.ID, { p, c });
    }
    await sleep(120);
  }
}

// ⚠ **聞けなかったタイルが 1 枚でもあれば、⚠ 配らない**（⚠ 欠けたまま配ると「その辺りに碑は無い」に見える）。
if (タイル.聞けず.length) {
  console.error(`⚠ 聞けなかったタイルが ${タイル.聞けず.length} 枚ある: ${タイル.聞けず.join(" / ")}`);
  console.error("⚠ 欠けたまま配ると「その辺りに碑は無い」と読まれる。⚠ 配らずに終える。");
  process.exit(1);
}

// ⚠ **取り出した年**（⚠ `derived`。⚠ 検索・並び替え用。⚠ 原則、画面に出さない）。
//   ⚠ **複数年をそのまま配列で持つ。**⚠ **1 つに丸めない。**
const 年を拾う = (名) => [...String(名).matchAll(/(\d{3,4})年/g)].map((m) => Number(m[1]))
  .filter((y) => y >= 600 && y <= 2100);
// ⚠ **言い切れない印。**⚠ **落とすと、⚠ 幅のあるものを 1 点に見せてしまう。**
const 言い切れない = (名) => /不明|ほか|他|以降|など|頃|前後/.test(String(名));

const 碑 = [];
for (const [id, { p, c }] of 生) {
  const 災害名 = String(p.DisasterName ?? "");
  const 年 = 年を拾う(災害名);
  碑.push({
    id,
    lon: Number(c[0].toFixed(6)), lat: Number(c[1].toFixed(6)),
    // ⚠ **ここから下は出典の字。**⚠ **要約も言い換えもしない**（ADR 0004 と同じ形）。
    name: String(p.LoreName ?? ""),
    address: String(p.Address ?? ""),
    disasterName: 災害名,                       // ⚠ **表示の正本**（⚠ `<br>` も落とさない）
    disasterKind: String(p.DisasterKind ?? ""), // ⚠ **複合のまま**
    info: String(p.DisasterInfo ?? ""),
    builtYear: /^\d{4}$/.test(String(p.LoreYear ?? "")) ? Number(p.LoreYear) : null, // ⚠ 碑の建立年
    image: p.Image ? String(p.Image) : null,
    // ⚠ **ここだけが、⚠ こちらが作った値。**⚠ **画面に出さない**（⚠ 検索・並び替え用）。
    derived: { years: 年, uncertain: 言い切れない(災害名) },
  });
}
碑.sort((a, b) => a.id.localeCompare(b.id));

// ⚠ **z8 のタイルに分けて配る**（⚠ 実測 2026-08-31 で決めた）。
//   ⚠ **全国を 1 枚で配ると 生 584KB / gzip 84KB。**⚠ **「ちなみに」の情報に、⚠ 毎回それは重い。**
//   ⚠ **z8 は 58 枚・⚠ 1 枚あたり最大 176 件・中央 17 件。**⚠ z12 は 1124 枚で細かすぎた。
//   ⚠ **索引（近くを探すのに要るもの）と、⚠ 詳しく（伝承内容）を分ける。**
//     ⚠ **散歩中に伝承内容の長文まで配らない。**
const Z8 = 8;
const タイル番号 = (lon, lat, z) => {
  const n = 2 ** z, r = lat * Math.PI / 180;
  return { x: Math.floor((lon + 180) / 360 * n),
           y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
};

const 索引箱 = new Map(), 詳しく箱 = new Map();
for (const m of 碑) {
  const { x, y } = タイル番号(m.lon, m.lat, Z8), k = `${x}/${y}`;
  if (!索引箱.has(k)) { 索引箱.set(k, []); 詳しく箱.set(k, {}); }
  索引箱.get(k).push({ id: m.id, lon: m.lon, lat: m.lat, name: m.name,
    disasterName: m.disasterName, disasterKind: m.disasterKind,
    builtYear: m.builtYear, derived: m.derived });
  詳しく箱.get(k)[m.id] = { address: m.address, info: m.info, image: m.image };
}

const note = "国土地理院「自然災害伝承碑」。⚠ 出典の字をそのまま写した。要約しない。"
  + "⚠ 碑があることと、その地点が被災したことは別。"
  + "⚠ 言えるのは「この近くに、その災害を伝える碑が残っている」まで。";
const at = new Date().toISOString().slice(0, 10);

// ⚠ **どのタイルが在るかを書いた表を、⚠ 一緒に配る。**
//   ⚠ **これが無いと、⚠ 404 を「碑が無い」と読むことになる**（掟 §1）。
//   ⚠ **表に無い ＝ その範囲に碑が 1 つも無い。**⚠ **表に在るのに取れない ＝ 取れなかった。**
const 在るタイル = [...索引箱.keys()].sort();

const 重さ = { 索引: [], 詳しく: [] };
for (const [k, list] of 索引箱) {
  const [x, y] = k.split("/");
  const d = join(OUT, "monument", String(Z8), x);
  await mkdir(d, { recursive: true });
  const 索 = JSON.stringify({ note, at, items: list.sort((a, b) => a.id.localeCompare(b.id)) });
  const 詳 = JSON.stringify({ note, at, items: 詳しく箱.get(k) });
  await writeFile(join(d, `${y}.json`), 索);
  await writeFile(join(d, `${y}.detail.json`), 詳);
  重さ.索引.push({ k, n: list.length, gz: gzipSync(Buffer.from(索)).length });
  重さ.詳しく.push({ k, gz: gzipSync(Buffer.from(詳)).length });
}
await writeFile(join(OUT, "monument", "tiles.json"),
  JSON.stringify({ note: note + "⚠ 一覧に無いタイル ＝ その範囲に碑が 1 つも無い。"
    + "⚠ 一覧に在るのに取れない ＝ 取れなかった（掟 §1）。",
    source: "国土地理院 自然災害伝承碑", at, z: Z8, count: 碑.length, tiles: 在るタイル }));

const kb = (b) => `${(b / 1024).toFixed(0)}KB`;
const 最重 = (a) => a.reduce((m, x) => (x.gz > m.gz ? x : m), a[0]);
console.log(`自然災害伝承碑を取り込んだ（${at}）\n`);
console.log(`タイル   取れた ${タイル.取れた} ／ 空 ${タイル.空} ／ 聞けず 0`);
console.log(`碑       ${碑.length} 件 ／ 配るタイル ${在るタイル.length} 枚（z${Z8}）\n`);
console.log(`索引    いちばん重い 1 枚 gz ${kb(最重(重さ.索引).gz)}（${最重(重さ.索引).k}・${最重(重さ.索引).n} 件）`
  + ` ／ 合計 gz ${kb(重さ.索引.reduce((s, x) => s + x.gz, 0))}`);
console.log(`詳しく  いちばん重い 1 枚 gz ${kb(最重(重さ.詳しく).gz)}`
  + ` ／ 合計 gz ${kb(重さ.詳しく.reduce((s, x) => s + x.gz, 0))}\n`);
console.log(`建立年がある            ${碑.filter((m) => m.builtYear).length} / ${碑.length}`);
console.log(`取り出した年が 1 つ      ${碑.filter((m) => m.derived.years.length === 1).length} / ${碑.length}`);
console.log(`取り出した年が 2 つ以上  ${碑.filter((m) => m.derived.years.length > 1).length} / ${碑.length}`);
console.log(`取り出せなかった        ${碑.filter((m) => m.derived.years.length === 0).length} / ${碑.length}`);
console.log(`⚠ 言い切れない印つき     ${碑.filter((m) => m.derived.uncertain).length} / ${碑.length}`);
