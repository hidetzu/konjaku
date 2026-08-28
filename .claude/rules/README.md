# ルール

⚠ **ここは「どう書くか」を持つ。**⚠ **「どう作業するか」は [`CLAUDE.md`](../../CLAUDE.md)、
「何が言えるか」は [`docs/SPEC.md`](../../docs/SPEC.md)、判断の経緯は [`docs/adr/`](../../docs/adr/)。**

⚠ **重複させない。**⚠ **2 か所に書くと、片方だけ古くなる**（`CLAUDE.md` の冒頭）。
⚠ **既にどこかが持っている主題は、ここでは「そちらを見る」とだけ書く。**

| ファイル | 何を持つか |
|---|---|
| [`domain.md`](domain.md) | 今昔の Domain（何に答える機能か・Source / Domain / Display の分け方） |
| [`javascript.md`](javascript.md) | 責務の分け方・DOM の触り方・命名 |
| [`components.md`](components.md) | ⚠ **DOM を持つ UI 部品**（`public/components/`）の境界 |
| [`css.md`](css.md) | class の付け方・Token・レスポンシブ |
| [`testing.md`](testing.md) | 何を優先して確かめるか |
| [`git.md`](git.md) | 禁止する操作 |

⚠ **`MUST` = 必須、`SHOULD` = 原則、`MAY` = 任意。**
⚠ **`⚠` は「踏むと痛い」印**（`CLAUDE.md` と同じ使い方。⚠ **画面の `⚠` は災害リスク専用**なので混ぜない）。

## ⚠ 既存の記録が正本のもの

⚠ **ここに書き写さない。**

| 主題 | 正本 |
|---|---|
| 取れなかった ≠ 無い ／ 推定を実測のように見せない ／ 分母 | `CLAUDE.md` §1・§6 |
| 画面の言葉（できないことから書き始めない ほか） | `CLAUDE.md` §4 |
| `git push` と merge の許可 | `CLAUDE.md` §8 |
| どの検査を、どの順で回すか | `.claude/skills/verify/SKILL.md` |
| 変更を見直す観点（範囲・掟・⚠ 非同期の結果の鮮度） | `.claude/skills/change-review/SKILL.md` |
| 画面の見直し（4 幅・重複・アクセシビリティの下限） | `.claude/skills/ui-ux-review/SKILL.md` |
| ⚠ 見え方の判断を Owner に仰ぐとき（いま／案／推す案） | `.claude/skills/visual-decision/SKILL.md` |
| Issue が渡せる形か | `.claude/skills/issue-ready/SKILL.md` |
