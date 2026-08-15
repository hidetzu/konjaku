# 今昔 — この土地は、昔なんだったのか？

場所を指定すると、その土地の成り立ちを国土地理院のデータから判定し、
参照したタイルや画素とともに表示するウェブサービスです。

**[今昔を開く](https://konjaku.hidetzu.work/)**

[![検査](https://github.com/hidetzu/konjaku/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/hidetzu/konjaku/actions/workflows/check.yml?query=branch%3Amain)

⚠ **このバッジが見ているのは `main` の静的検査・実描画・検索の並びです。**
⚠ **外部リンクの生死は含みません**（相手先の一時的な不調でこちらを止めないため、
到達できなくても緑のままになります）。リンクが腐っていないかは実行ログを見てください。
件数は [`docs/SPEC.md`](docs/SPEC.md) にあります。

![今昔の画面](public/ogp.png)

## できること

- 地名・駅名・施設名から場所を探す
- 地形分類と明治期の低湿地データから、土地の成り立ちを根拠付きで表示する
- 明治期から現在までの空中写真を年代順に見る
- 現在の街と明治期の地面を3Dで重ね、建物ごとの足元を調べる
- その場所にあった事物を年代ごとに見る
- 結果を画像やURLで共有する

Google マップが「いま、そこに何があるか」に答えるのに対し、
今昔は「そこがどういう土地なのか」に答えます。

## 大切にしていること

### 根拠を表示する

判定はブラウザが国土地理院のタイルを読み、画素から行います。
読んだタイル、座標、画素値、判定方法、既知の限界を確認できます。

### 取れなかったことを「無い」と言わない

取得結果を「読めた」「本当に無い」「通信などで読めなかった」に分けます。
読めなかったときは断定せず、根拠を表示せず、再試行できるようにします。

### 推定を実測に見せない

3Dで建物が消える年代や、OSMに高さがない建物の表示には推定を含みます。
画面では実測と推定を分けて表示します。

### 場所を計測へ送らない

Cookieや利用者識別子は使いません。地名・座標も計測へ送りません。
判定はブラウザ内で完結し、計測するのは固定されたイベント名の日別件数だけです。

詳しい仕様と限界は [`docs/SPEC.md`](docs/SPEC.md) を参照してください。

## ローカルで動かす

Node.js 22 以上を使います。通常の表示には依存パッケージのインストールは不要です。

```sh
node serve.js
```

<http://localhost:8081> を開きます。

## 検査

```sh
npm run check         # 構文・設定・データ・リンク・安全性の静的検査
npm run render        # Playwrightで実際に描画・操作する検査
npm run check-search  # 国土地理院の住所検索を使う並び順の検査
```

実描画にはCIと同じPlaywrightが必要です。

```sh
npm i --no-save playwright@1.62.1
npx playwright install chromium
```

`npm run check-search` と `npm run render` は国土地理院のサービスへ実際に接続します。
繰り返し実行せず、外部サービスへの負荷に配慮してください。

## 主なデータとソフトウェア

- 国土地理院: 地形分類、明治期の低湿地、標高、年代別空中写真、住所検索
- OpenStreetMap: 建物
- Wikidata: 年代の分かる事物
- MapLibre GL JS: 地図表示

出典、加工物、個別の利用条件は [`LICENSES.md`](LICENSES.md) にまとめています。

## ドキュメント

- [`docs/SPEC.md`](docs/SPEC.md) — 現在の仕様、言えること、言わないこと
- [`docs/adr/`](docs/adr/) — 現在の実装を支える判断
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Issue、PR、forkからの検査
- [`SECURITY.md`](SECURITY.md) — 脆弱性の非公開報告
- [`TRADEMARKS.md`](TRADEMARKS.md) — 名称とロゴの扱い

## 状態とライセンス

今昔はプロトタイプです。仕様や対応範囲は変更されることがあります。

コードは [MIT License](LICENSE) です。ただし、データ、第三者コード、名称、ロゴには
それぞれ別の条件があります。詳細は [`LICENSES.md`](LICENSES.md)、
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)、[`TRADEMARKS.md`](TRADEMARKS.md) を参照してください。
