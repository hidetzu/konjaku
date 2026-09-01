// 今昔 v0.1.0 — 市区町村コードから名前を引く表を作る。
//
// ⚠ **これは事前処理。**⚠ **npm run check から呼ばない**（⚠ 相手先の答えに寄りかかる）。
// ⚠ **回し方**: `node scripts/build-muni.mjs`
//
// ⚠ **なぜ要るか**:
//   ⚠ 地理院の逆ジオコーディングは、⚠ **町名（`lv01Nm`）と市区町村コード（`muniCd`）**を返す。
//   ⚠ **町名だけだと、⚠ どこの町か分からない**（⚠ 利用者役 3 名中 1 名: 「猫実」が浦安だと分からない）。
//
// ⚠ **なぜ都道府県を全部には付けないか**:
//   ⚠ **市区町村名だけで足りるものが大半で、⚠ 付けると幅を食う。**
//   ⚠ **重なるものにだけ付ける**（⚠ 府中市・伊達市 など）。⚠ **判定はここでやる**
//     （`CLAUDE.md` §3「推論は事前処理へ寄せる」）。
//
// ⚠ **件数はここに書かない。**⚠ **走らせて名乗る**（`CLAUDE.md` §6）。
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "https://maps.gsi.go.jp/js/muni.js";
const OUT = join(ROOT, "public-next", "data", "muni.json");

const r = await fetch(SRC, { signal: AbortSignal.timeout(30000) });
if (!r.ok) { console.error(`⚠ 取れなかった: ${r.status} ${SRC}`); process.exit(1); }
const raw = await r.text();

// `GSI.MUNI_ARRAY["1101"] = '1,北海道,1101,札幌市　中央区';`
const 表 = new Map();
for (const m of raw.matchAll(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g)) {
  const v = m[2].split(",");
  if (v.length < 4) continue;
  // ⚠ 原典は「札幌市　中央区」のように全角空白で区切る。⚠ 詰める（幅を食うだけ）
  表.set(m[1], { pref: v[1], muni: v[3].replace(/　/g, "") });
}
if (!表.size) { console.error("⚠ 1 件も読めなかった。原典の形が変わった可能性がある"); process.exit(1); }

// ⚠ 市区町村名だけで重なるものを数える
const 数 = new Map();
for (const { muni } of 表.values()) 数.set(muni, (数.get(muni) ?? 0) + 1);

const muni = {};
for (const [cd, { pref, muni: m }] of 表) muni[cd] = 数.get(m) > 1 ? pref + m : m;

// ⚠ **都道府県を付けても残る重なりは、⚠ 隠さずに書き出す**（`CLAUDE.md` §1）
const 後 = new Map();
for (const v of Object.values(muni)) 後.set(v, (後.get(v) ?? 0) + 1);
const 残り = [...後].filter(([, n]) => n > 1).map(([k]) => k).sort();

const 出す = {
  note: "市区町村コードから名前を引く表。国土地理院の逆ジオコーディングが返す muniCd に対応する。",
  rule: "市区町村名だけで重なるものにだけ、都道府県を足してある。重ならないものは市区町村名だけ。",
  caveat: "都道府県を足しても、同じ都道府県の中で同じ名前になるものが残る。unresolved に書き出してある。",
  source: { name: "国土地理院 地理院地図 muni.js", url: SRC, retrieved_at: new Date().toISOString().slice(0, 10) },
  unresolved: 残り,
  muni,
};
writeFileSync(OUT, JSON.stringify(出す) + "\n");

const kb = Math.round(Buffer.byteLength(JSON.stringify(出す)) / 1024);
console.log(`市区町村の表を書き出した（実測 ${出す.source.retrieved_at}）`);
console.log(`  読んだ            ${表.size} 件`);
console.log(`  都道府県を足した   ${Object.values(muni).filter((v, i) => v !== [...表.values()][i].muni).length} 件`);
console.log(`  ⚠ それでも重なる   ${残り.length} 件${残り.length ? "（" + 残り.join("・") + "）" : ""}`);
console.log(`  いちばん長い名前   ${Object.values(muni).sort((a, b) => b.length - a.length)[0]}`);
console.log(`  大きさ            ${kb} KB`);
