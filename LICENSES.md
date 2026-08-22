# ライセンスと出典

このリポジトリには、**ライセンスの違うものが混ざっている**。
`LICENSE`（MIT）が全部に及ぶわけではない。ここで区分を明示する。

⚠ **データにはそれぞれ別の条件がある。** コードが MIT でも、データは出典側の条件に従う。

---

## 1. 自分たちが書いたもの — MIT

`LICENSE` のとおり。

- `public/` の自前スクリプト（`index.html` / `peel.html` / `verify.js` / `places.js` /
  `events.js` / `peel3d.js` / `share.js` / `esc.js` / `sw.js`）
- `worker.js`、`serve.js`、ルートの前処理スクリプト
- `scripts/` の取り込み・書き出し・検査
- `.github/workflows/`

## 2. 文書 — MIT（コードと同じ）

`README.md` / `CLAUDE.md` / `docs/SPEC.md` / `docs/adr/`。

⚠ **ただし、引用している他者の記述は別**（下の 4 を見ること）。
とくに `docs/SPEC.md` と画面に出る「成因」「災害リスク」の文は、
**国土地理院の記述をそのまま使っている**。こちらで書き換えていない。

## 3. 名称・ロゴ・アイコン

⚠ **MIT ライセンスは、名称やロゴといったブランド表示の使用許諾を含まない。**
コードを MIT で使えることと、名前やロゴを使ってよいことは別。

対象:

- 「今昔」「konjaku」という名称
- `public/favicon.svg` / `icon-192.png` / `icon-512.png` / `icon-maskable.png` /
  `ogp.png` / `ogp-peel.png`

これらの**画像そのものの転載・改変・fork での利用**を含めて、条件は
[`TRADEMARKS.md`](TRADEMARKS.md) に書いてある。

## 4. 同梱している第三者のコード

| 何 | ライセンス | 場所 |
|---|---|---|
| MapLibre GL JS **v5.24.0** | **BSD-3-Clause** ほか（下記） | `public/vendor/maplibre-gl.js` / `.css` |
| Noto Sans CJK JP（OGP用の文字だけを収録） | **SIL Open Font License 1.1** | `assets/ogp/NotoSansCJKjp-Bold.subset.otf` |

**全文は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) に同梱してある。**

Noto Sans CJK JP のライセンス全文は
[`assets/ogp/NotoSansCJKjp-LICENSE.txt`](assets/ogp/NotoSansCJKjp-LICENSE.txt) に同梱してある。

> Copyright 2014-2021 Adobe (http://www.adobe.com/).  
> Noto is a trademark of Google Inc.

この表示は元フォントのメタデータから引き継いでおり、文字を絞った同梱フォントにも保持している。

⚠ 同梱ファイルの先頭にあるのは**種別と URL だけ**で、全文は入っていない。
⚠ **単一のライセンスではない。** MapLibre 本体（BSD-3-Clause）に加えて、
同梱されている第三者コードの表示が含まれる（Mapbox / Evan Wallace / Mike Bostock）。
取得元: <https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/LICENSE.txt>

⚠ npm の依存は `package.json` を見ること（2026-08-15 時点では `dependencies` も
`devDependencies` も空）。検査で使う Playwright は CI のときだけ入れており、
配信物にも `package.json` にも入らない。

## 5. 配っているデータ

`public/data/` に置いてあるものは、**ほとんどが他者のデータから作った**。
こちらが作ったのは「どう束ねたか」だけで、中身の権利は出典側にある。

⚠ **件数はここに書かない。** 取り込みのたびに変わるので、書くと必ず古くなる。
現在の件数は `docs/SPEC.md` を出どころとする。

⚠ **この表は `scripts/check.mjs` が `public/data/` の実体と突き合わせる。**
⚠ **載せ忘れも、消したデータの行が残ることも、機械が捕まえる**
（⚠ 実際に両方ずれていた。2026-08-22 に直した）。

| 置き場所 | 何 | 出どころ | 条件 |
|---|---|---|---|
| `data/ev/` | 年つきの事物（z12 の束） | **Wikidata** | **CC0**。出典URLを各項目に付けて画面に出している |
| `data/bl/` | 建物（z14 のタイル） | **OpenStreetMap**（Overpass 経由） | **ODbL**。© OpenStreetMap contributors |
| `data/landform.json` | 地形分類の凡例 | **国土地理院**（地理院地図の `style.js`） | 下記。⚠ **成因・災害リスクの文は地理院の記述そのまま** |
| `data/swale-legend.json` | 明治期の低湿地 14 区分の解説文 | **国土地理院**（凡例 `lw_legend.pdf`） | 下記。⚠ **要約せずそのまま写している**。解説文の出典（地形図図式詳解／広辞苑第四版）も持つ |
| `data/assets.json` | 配っているレイヤの所在 | **こちらで作った** | 他者のデータを含まない（どこに何があるかの索引だけ） |
| `data/quick-places.json` | クイック候補地 | **こちらで作った**（`seeds/areas.jsonl` から生成） | 地名と座標。⚠ 選んだのはこちら |

### ⚠ 取り込むのは、商用利用できるデータだけ

⚠ **2026-08-22 の Owner 判断**（[ADR 0032](docs/adr/0032-取り込むのは商用利用できるデータだけ.md)）。

⚠ **理由は「いつか稼ぐかもしれないから」ではない。**⚠ **いまの形と噛み合わないから。**

- ⚠ **非商用のデータは「複製物の再配布」を除いていることがある。**
  ⚠ 国土数値情報の旧約款はこう書いている（原文）:
  「（ｂ）『非商用』＝出典・加工者等表示のうえ、原著作者等の許諾上、
  **非商用目的のみでの利用（ただし複製物の再配布を除く）**が可能なもの」。
  ⚠ **konjaku は `public/data/` で配っている。**⚠ 無料で運営していても引っかかる
- ⚠ **あとから外すのが高い。**⚠ 共有カード・OGP・README まで届く（CLAUDE.md §6）

⚠ **迷ったら入れない。**⚠ 判定できるのは配布元で、こちらではない。
⚠ **入れたいときは、先に配布元へ問い合わせる**（約款自身が「不明な点は問い合わせよ」と書いている）。

⚠ **この規則は `scripts/check.mjs` が見張る。**⚠ 上の表の「条件」に
`非商用` のような語が入ったら落ちる。

### 国土地理院

実行時にも次を直接読んでいる（配っていない。利用者のブラウザが取りに行く）。

- 空中写真（年代別）／明治期の低湿地／地形分類（提供実験のベクトルタイル）／DEM（`dem5a`）
- 住所検索（`msearch.gsi.go.jp`）

条件:

- **出典表示が要る**（画面のフッターと根拠パネルに出している）
- **加工したときは、加工したことの表示が要る**
- 第三者が権利を持つレイヤーは、個別の条件を確認すること
- ⚠ 測量成果の利用のしかたによっては、**測量法上の手続きが要る場合がある**

利用規約:
<https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html> /
<https://maps.gsi.go.jp/help/termsofuse.html>

⚠ **住所検索は公開 API ではない。** 主に地理院地図からの利用を想定した機能で、
仕様変更・停止がありうる（`docs/SPEC.md` §7）。

### OpenStreetMap

**ODbL**。© OpenStreetMap contributors。<https://www.openstreetmap.org/copyright>

⚠ 派生データベースを配るときは ODbL の継承条件がかかる。
`public/data/bl/` は OSM から作ったものなので、**ODbL が適用されるものとして扱う**。
⚠ 法的な区分（派生データベースか、生成物か）は**こちらで判断していない**。

### Wikidata

**CC0**。項目ごとの出典URLを画面に出している。

⚠ Wikidata は誰でも編集できる。**こちらは中身を保証しない**。
だから外から来た文字列は HTML として実行させない（`public/esc.js`）。

---

## ⚠ 分かっていないこと

このファイルは**法律の助言ではない**。

- 測量成果の再配布、有料での提供、商標の登録に踏み込む段階では、
  **対象データと提供のしかたを特定したうえで、専門家に確認すること**
- 上の区分は、いまの実装と各出典の公開条件を読んで整理したもので、
  **法的な判断を経ていない**
