// 配信用アセットの共通マニフェストを書き出す。
//
// まずは既存の配信物（bl と areas.json）を壊さずに、
// 「どのレイヤーを、どの索引・本体から読むか」を1本にまとめる。
// land のタイル化が完了するまでは、土地情報だけ areas の事前生成GeoJSONを指す。
// 実行: node scripts/export-assets.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const PUB = "public";
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const buildingIndexPath = `${PUB}/data/bl/index.json`;
const areaIndexPath = `${PUB}/data/areas.json`;
const buildingIndex = existsSync(buildingIndexPath) ? readJSON(buildingIndexPath) : null;
const areaIndex = existsSync(areaIndexPath) ? readJSON(areaIndexPath) : { areas: [] };

const manifest = {
  version: 1,
  // layerごとのデータ形式と参照先をここに集約する。
  layers: {
    buildings: {
      source: "osm",
      format: "packed-geojson-v3",
      zoom: buildingIndex?.z ?? 14,
      index: "./data/bl/index.json",
      tile: "./data/bl/14/{x}/{y}.json",
      at: buildingIndex?.at ?? null,
    },
    land: {
      source: "gsi-swale",
      format: "area-geojson-legacy",
      zoom: 16,
      // landタイルの共通出力ができるまでは、既存の範囲索引を互換参照する。
      index: "./data/areas.json",
      areas: (areaIndex.areas ?? []).map((area) => ({
        id: area.id,
        title: area.title,
        bbox: area.bbox,
        asset: area.water ?? null,
        source: area.source?.water ?? "gsi-swale",
      })),
    },
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
console.log(`  land: ${manifest.layers.land.areas.length} 範囲（タイル化前の互換形式）`);
