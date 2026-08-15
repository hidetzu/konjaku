// 建物の索引を書き出す。
//
// ⚠ 本体（ポリゴン）は取り込みがそのまま public/data/bl/14/{x}/{y}.json に置いている。
//   取得単位＝配布単位なので、変換を挟まない。ここで作るのは索引だけ。
// ⚠ ev の索引と決してマージしない。潰すと「建物が見たタイル」が
//   「事物も見た」ことになる（実験で再現済み）。
import { open } from "./db.mjs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = "public/data/bl";
const db = open();
const rows = db.prepare(
  `SELECT z14x x, z14y y, at, truncated trunc FROM coverage
   WHERE layer = 'bld' ORDER BY z14x, z14y`).all();

if (!rows.length) {
  console.log("建物の coverage が空です。先に npm run ingest:bld を走らせてください");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const tiles = {};
let missing = 0;
for (const t of rows) {
  // ⚠ 索引に載せるのは、実際にファイルがあるものだけ。
  //   「見た」と言いながら本体が無いと、画面は 404 を「未整備」と読んで外へ出る
  if (!existsSync(`${OUT}/14/${t.x}/${t.y}.json`)) { missing++; continue; }
  tiles[`${t.x}/${t.y}`] = t.trunc ? 2 : 1;      // 1=見た / 2=見たが上限に当たった
}
const at = rows.map((r) => r.at).sort()[0];      // いちばん古い区画に合わせる
writeFileSync(`${OUT}/index.json`, JSON.stringify({ at, z: 14, tiles }));
console.log(`建物の索引 ${Object.keys(tiles).length} タイル（at ${at}）`
  + (missing ? `／⚠ 本体が無い ${missing} 件は載せていない` : ""));
