# 検査

⚠ **ここは検査だけ。**⚠ **取り込み・書き出し・運用の道具は [`../scripts/`](../scripts/)。**

| | |
|---|---|
| [`check.mjs`](check.mjs) | 静的検査（⚠ **全追跡ファイルを走査する**。`docs/` も読む） |
| [`render.mjs`](render.mjs) | 実描画を走らせる（⚠ ケースは持たない） |
| [`render/lib.mjs`](render/lib.mjs) | 実描画の道具 |
| [`render/top.mjs`](render/top.mjs) | トップ（`/`）のケース |
| [`render/peel.mjs`](render/peel.mjs) | 深掘り（`/peel`）のケース |
| [`render-scope.mjs`](render-scope.mjs) | ⚠ **変更ファイル → どの検査を回すか** |
| [`search-check.mjs`](search-check.mjs) | 検索の入口の回帰（42 語） |

```
node test/render.mjs                        全部
node test/render.mjs --suite=peel           深掘りの画面だけ
node test/render.mjs --suite=top --group=core
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
