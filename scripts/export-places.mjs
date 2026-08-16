// トップと立体画面で共通に使う候補地を書き出す。
// 候補地の追加・削除は seeds/areas.jsonl の quick フラグだけを変更する。
// 実行: node scripts/export-places.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const areas = readFileSync("seeds/areas.jsonl", "utf8").trim().split("\n")
  .filter(Boolean).map((line) => JSON.parse(line));
const places = areas.filter((area) => area.quick).map((area) => ({
  id: area.id,
  name: area.title,
  lon: area.ll[0],
  lat: area.ll[1],
  title: area.quickTitle ?? area.title,
}));
if (!places.length) throw new Error("quick=true の候補地がありません");

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/quick-places.json", JSON.stringify({ version: 1, places }, null, 2) + "\n");
console.log(`クイック候補地 ${places.length} 件を書き出しました: public/data/quick-places.json`);
