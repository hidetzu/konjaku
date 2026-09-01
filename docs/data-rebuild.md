# 配信用データを 0 から作り直す手順

## 目的

⚠ **`public/data/` に置いてあるものを前提にせず、⚠ 外から取り込むところからやり直す手順。**

⚠ **2026-09-01 に書き直した**（`docs/adr/0080`）。
⚠ **前は β 版の手順だった**（⚠ Wikidata の事物 ／ OSM の建物 ／ 水域マスク ／ 索引）。
⚠ **v0.1.0 はそのどれも配っていない。**⚠ **道具は `scripts/` に残っているが、⚠ 使わない。**

## ⚠ 先に読む

- ⚠ **これは事前処理。**⚠ **`npm run check` からは呼ばない**（`CLAUDE.md` §9）。
  ⚠ **相手先の答えに寄りかかるものを、⚠ 検査にしない。**
- ⚠ **取り込みのあとはログを見る**（`CLAUDE.md` §9）。⚠ **1 区画だけ落ちても気づけない。**
- ⚠ **配るデータを足したら [`LICENSES.md`](../LICENSES.md) の表にも足す**
  （⚠ 静的検査が両方向で突き合わせる）。

## v0.1.0 が配っているもの

| 置き場所 | 何 | 作るもの |
|---|---|---|
| `public/data/landform.json` | 地形分類の凡例（36 区分） | `node scripts/build-landform.mjs` |
| `public/data/monument/` | 自然災害伝承碑（z8 タイル） | `node scripts/ingest-monuments.mjs` |
| `public/data/muni.json` | 市区町村コード → 名前 | `node scripts/build-muni.mjs` |
| `public/data/landuse-code.json` | 土地利用種別のコード表 | ⚠ **手で写した**（⚠ 国土交通省のコード表）。⚠ `scripts/survey-landuse.mjs` が読む |
| `public/data/area-record.json` | その地域について公式資料に書かれている記録 | ⚠ **手で写した**（⚠ 東京都港湾局／浦安市）。⚠ **作る道具は無い** |

⚠ **手で写したものは、⚠ 原典の字をそのまま入れる。**⚠ **要約も言い換えもしない。**

## 1. 地形分類の凡例

```bash
node scripts/build-landform.mjs
```

⚠ **地理院地図の `style.js` から凡例を取り出す。**
⚠ **成因・災害リスクの文は、⚠ 国土地理院の記述をそのまま入れる。**⚠ **こちらで書かない。**

## 2. 自然災害伝承碑

```bash
node scripts/ingest-monuments.mjs
```

⚠ **`disaster_lore_all` の GeoJSON を z8 で取り込み、⚠ タイルごとに書き出す。**

- ⚠ **災害名・種別・碑文は出典の字のまま**（⚠ 複合種別も分解しない）
- ⚠ **年は 1 つの値へ丸めない。**⚠ **取り出した年は `derived` に分け、⚠ 画面には出さない**
- ⚠ **1 枚でも読めなかったら、⚠ 途中で止まる**（⚠ 欠けたまま配ると「その範囲に碑は無い」に読まれる）

⚠ **どこまで言えるかを数える走者もある**（⚠ 検査ではない）。

```bash
node scripts/survey-monuments.mjs
```

## 3. 市区町村の名前

```bash
node scripts/build-muni.mjs
```

⚠ **地理院地図の `muni.js` から作る。**⚠ **町名だけだと、⚠ どこの町か分からない**
（⚠ 利用者役 3 名中 1 名が「猫実」を浦安と結び付けられなかった）。
⚠ **重なる名前にだけ都道府県を付ける**（⚠ 府中市・伊達市 など）。⚠ **判定はここでやる。**

## 4. 手で写したもの

⚠ **道具は無い。**⚠ **原典を見て、⚠ 字をそのまま入れる。**

- `landuse-code.json` — 国土数値情報「土地利用細分メッシュ（L03-b）」のコード表
- `area-record.json` — 東京都港湾局「東京港の歴史」／浦安市「浦安市の海面埋め立て」

⚠ **`area-record.json` は、⚠ 範囲の矩形をこちらが引いている。**
⚠ **原典に座標は書かれていない。**⚠ **その断りを、⚠ ファイルの中と画面の両方に持つ。**

## 5. 出したあと

```bash
npm run check                              # 静的検査
npm run render -- --suite=next --group=core # 実描画
```

⚠ **配っているものと `LICENSES.md` の表がずれていないかは、⚠ 静的検査が見る**
（⚠ 載せ忘れも、⚠ 消したデータの行が残ることも）。

## ⚠ β 版の道具について

⚠ **`scripts/` には、⚠ β 版のためのものが残っている**
（⚠ `ingest-wikidata` `export-tiles` `ingest-buildings` `export-buildings`
`pack-buildings` `build-water` `export-assets` `export-places` ほか）。

⚠ **v0.1.0 はそのどれも配っていない。**⚠ **走らせても、⚠ 本番には何も届かない。**
⚠ **消すかどうかは、⚠ まだ決めていない**（⚠ 決めたら、⚠ ここも直す）。
