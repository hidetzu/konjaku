# 検査

⚠ **ここは検査だけ。**⚠ **取り込み・書き出し・運用の道具は [`../scripts/`](../scripts/)。**

| | |
|---|---|
| [`check.mjs`](check.mjs) | 静的検査（⚠ **全追跡ファイルを走査する**。`docs/` も読む） |
| [`render.mjs`](render.mjs) | 実描画を走らせる（⚠ ケースは持たない） |
| [`render/lib.mjs`](render/lib.mjs) | 実描画の道具 |
| [`render/top.mjs`](render/top.mjs) | トップ（`/`）の suite（⚠ **束ねるだけ**） |
| [`render/peel.mjs`](render/peel.mjs) | 深掘り（`/peel`）の suite（⚠ **束ねるだけ**。⚠ 自前のケースは 0 件） |
| `render/top-*.mjs` ／ `render/peel-*.mjs` | ⚠ **問いごとのケース。**⚠ **足すときはここへ入れる** |
| [`render-scope.mjs`](render-scope.mjs) | ⚠ **変更ファイル → どの検査を回すか** |
| [`search-check.mjs`](search-check.mjs) | 検索の入口の回帰（42 語）。⚠ **fixture で回す。⚠ 外へ出ない** |
| [`repository-check.mjs`](repository-check.mjs) | ⚠ **住所検索の口の作り**（1検索1リクエスト・再試行・時間切れ・形）。⚠ **外へ出ない** |
| [`search-live-check.mjs`](search-live-check.mjs) | ⚠ **地理院と話せるかだけ**（数語）。⚠ **定期・手動のみ** |
| [`fixtures/search/`](fixtures/search/) | 42 語ぶんの応答（⚠ **取得日は `_meta.json`**） |

```
node test/render.mjs                        全部
node test/render.mjs --suite=next           v0.1.0 の画面だけ（いまは これしかない）
node test/render.mjs --count                走らせずに数だけ
node test/render-scope.mjs origin/main...HEAD   何を回すべきか
```

⚠ **回し方の正本は [`.claude/skills/verify/SKILL.md`](../.claude/skills/verify/SKILL.md)。**⚠ ここには書かない。

## ⚠ 昔の場所

⚠ **2026-08-22 まで、⚠ この 7 本は `scripts/` の直下にあった**（Owner 判断で移した）。
⚠ **`docs/adr/` は当時の姿のまま**にしてある（⚠ ADR は判断の経緯で、⚠ 書き換えると経緯が変わる）。
⚠ **ADR に `scripts/check.mjs` と書いてあったら、⚠ いまの `test/check.mjs` のこと。**

## ⚠ 運用側に残したもの

⚠ **検査とビルドの両方から使うので、⚠ どちらのものでもない。**

```
scripts/bl-format.mjs   建物の詰め方（⚠ 取り込み・詰め直し・検査が使う）
scripts/db.mjs          貯める箱（⚠ 取り込み・書き出し・検査が使う）
scripts/sw-hash.mjs     Service Worker の版（⚠ 版を振る側と検査が使う）
scripts/version.mjs     配信物の出どころ
```
