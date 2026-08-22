# Git

⚠ **`MUST` = 必須、`SHOULD` = 原則、`MAY` = 任意。**

⚠ **`git push` と merge の許可、コミットの分け方、Conventional Commits は
[`CLAUDE.md`](../../CLAUDE.md) §8 が正本。**⚠ ここには書かない。
⚠ **PR の見直し方は [`change-review`](../skills/change-review/SKILL.md)。**

## ⚠ 明示的な指示なしにやらないこと

```text
git push --force
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

- MUST: ⚠ **必要なときは、⚠ 何が失われるかを先に言ってから。**
- MUST: ⚠ **利用者の未コミット変更を、⚠ 勝手に消さない・上書きしない。**
- MUST: ⚠ **他の人が作業中のブランチへ、⚠ 断りなく push しない。**

## 作業を始める前

- MUST: ⚠ **いまのブランチと、⚠ 未コミット変更を見る。**
- MUST: ⚠ **自分の変更と、⚠ 相手の変更の境界を保つ**（⚠ **別の worktree を使うと確実**）。

## 競合

- MUST: ⚠ **相手側の変更を、⚠ 意味を確かめずに捨てない。**
- MUST: ⚠ **merge / rebase のあとは、⚠ 検査を回し直す。**
