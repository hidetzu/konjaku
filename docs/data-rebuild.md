# 配信用データを0から再生成する手順

## 目的

この文書は、リポジトリにコミットされた配信用データを前提にせず、外部データの取り込みから
`public/data/` の生成までをやり直すときの手順を整理したものです。

現在の画面表示は、デプロイ済みの Workers Assets（`public/data/`）だけを読みます。
実行時にローカルSQLiteやD1を読みません。ローカルSQLiteは、事物・建物の取り込みを
再実行するときだけ作られる作業用データです。

## 生成物と入力

| 生成物 | 主な入力 | SQLiteを使うか |
|---|---|---:|
| `data/ev/` | Wikidata、`seeds/areas.jsonl` | 使う |
| `data/bl/` | Overpass（OSM）、国土地理院「明治期の低湿地」タイル、`seeds/areas.jsonl` | 使う |
| `data/*-water.geojson` | 国土地理院「明治期の低湿地」タイル、スクリプト内のBBOX | 使わない |
| `data/landform.json` | 国土地理院の`style.js` | 使わない |
| `data/quick-places.json` | `seeds/areas.jsonl`の`quick` | 使わない |
| `data/assets.json` | 生成済み索引と`seeds/areas.jsonl` | 使わない |

## 0からの手順

### 1. 依存関係を準備する

```sh
npm ci
```

Node.jsから外部APIへアクセスできる環境が必要です。Wikidata、Overpass、国土地理院の
応答が不安定な場合は、失敗した範囲を再実行します。

### 2. 地形分類の静的表を生成する

```sh
node scripts/build-landform.mjs
```

`public/data/landform.json`を生成します。

### 3. 明治期の水域GeoJSONを生成する

```sh
node build-water.js
```

現在のスクリプトは`toyosu`のBBOXを対象にしています。別の範囲を追加する場合は、
スクリプトの`NAME`と`BBOX`を変更して実行します。
⚠ **範囲索引（`public/data/areas.json`）は 2026-08-20 に廃止しました。**
⚠ 土地を足すのは `seeds/areas.jsonl` と `npm run ingest:bld` → `npm run export:bld` の道です。
この部分は、将来、範囲定義から一括生成できる形へ整理する余地があります。

### 4. Wikidataの事物を取り込んで配信用タイルを生成する

```sh
npm run ingest
npm run export
```

`npm run ingest`が`.data/konjaku.db`を作成し、事物とタイルごとのcoverageを保存します。
`npm run export`はそのSQLiteから`public/data/ev/`を生成します。

### 5. OSMの建物を取り込んで配信用タイルを生成する

```sh
npm run ingest:bld
npm run export:bld
```

`npm run ingest:bld`はOverpassから建物を取得し、各建物の重心を国土地理院「明治期の低湿地」
タイルへ照合して、OSMの名称・高さ・建設年と明治期区分を付与したうえで、
`.data/konjaku.db`のcoverageを更新し、`public/data/bl/14/`へタイル本体を書き出します。
画面表示時に建物ごとの明治期ラスタ通信を発生させないため、取り込み時の判定結果を配信物に
含めます。GSIタイルの取得に失敗した建物は取得失敗として保持し、再実行で補完します。
`npm run export:bld`はSQLiteのcoverageから`public/data/bl/index.json`を生成します。

既存タイルの圧縮形式を変更する場合だけ、必要に応じて次を実行します。

```sh
npm run pack:bld
```

### 6. 候補地と共通アセット索引を生成する

```sh
npm run export:assets
```

このコマンドは以下を生成します。

- `public/data/quick-places.json`
- `public/data/assets.json`

`assets.json`は建物・土地・候補地の索引と配信形式をまとめる公開契約です。

### 7. Service Workerの版を更新する

```sh
npm run stamp
```

静的データを変更した場合は、配信キャッシュの版も更新します。

### 8. 検査する

```sh
npm run check
npm run render
```

`check`は索引とファイルの対応、形式、サイズ、coverageを検査します。
`render`は実際の画面で地図・水域・建物・年代表示を確認します。

## 現在の注意点

- リポジトリには生成済みの`public/data/`がコミットされているため、通常の開発でSQLiteを
  作る必要はありません。
- `.data/konjaku.db`は`.gitignore`対象で、取り込みを実行した環境にだけ存在します。
- `db:init`はCloudflare D1の計測テーブルを初期化するコマンドであり、配信用データの生成や
  ローカルSQLiteの初期化ではありません。
- 水域生成は現在`build-water.js`のBBOXが固定で、Wikidata・建物取り込みほど一括再生成の
  仕組みが整っていません。
- すべての外部データを一つのSQLiteに集約する構成ではありません。SQLiteを使うのは主に
  WikidataとOSM建物の取り込み経路です。

## 将来拡張メモ: `ev`の意味

`ev`は将来的に、ニュースや歴史上の出来事など「年代に紐づくイベント」を扱うレイヤーへ
拡張する構想がある。ただし、今回は実装しない。

現状の`ev`は、Wikidataから取り込んだ駅・橋・学校・病院・公園などの「年代付き事物」を
配信するためのレイヤーであり、ニュースや出来事そのものは対象外である。将来拡張するときは、
事物と出来事の種別、出典、位置、年代の精度を分けて設計し直す。

## 公開前の関係

```text
外部API / seed
  ├─ Wikidata・OSM → ローカルSQLite → ev / bl → public/data/
  ├─ 国土地理院タイル → water GeoJSON → public/data/
  └─ seed・索引 → quick-places / assets → public/data/

public/data/ → Workers Assets → ブラウザ
ブラウザの匿名イベント → Worker /t → D1（計測のみ）
```
