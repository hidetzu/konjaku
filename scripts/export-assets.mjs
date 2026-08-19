// 配信用アセットの共通マニフェストを書き出す。
//
// まずは既存の配信物（bl と areas.json）を壊さずに、
// 「どのレイヤーを、どの索引・本体から読むか」を1本にまとめる。
// land のタイル化が完了するまでは、土地情報だけ areas の事前生成GeoJSONを指す。
// 実行: node scripts/export-assets.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { VERSION as BL_VERSION } from "./bl-format.mjs";

const PUB = "public";
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const buildingIndexPath = `${PUB}/data/bl/index.json`;
const buildingIndex = existsSync(buildingIndexPath) ? readJSON(buildingIndexPath) : null;

const manifest = {
  version: 1,
  // layerごとのデータ形式と参照先をここに集約する。
  layers: {
    buildings: {
      source: "osm",
      format: `packed-geojson-v${BL_VERSION}`,
      zoom: buildingIndex?.z ?? 14,
      index: "./data/bl/index.json",
      tile: "./data/bl/14/{x}/{y}.json",
      at: buildingIndex?.at ?? null,
    },
    // ⚠ ここには以前 `land` があった（2026-08-20 に外した）。
    //   `data/areas.json`（豊洲 1 件だけの範囲索引）の互換参照で、
    //   ⚠ **ブラウザ側は一度も読んでいなかった**。水域はその場で起こす形に一本化した。
    places: {
      source: "seeds/areas.jsonl",
      format: "json",
      asset: "./data/quick-places.json",
    },
  },
};

mkdirSync(`${PUB}/data`, { recursive: true });
writeFileSync(`${PUB}/data/assets.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`共通アセット索引を書き出しました: ${PUB}/data/assets.json`);
console.log(`  buildings: ${manifest.layers.buildings.index}`);
