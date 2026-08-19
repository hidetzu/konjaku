---
name: loop-controller
description: konjaku の ready-for-ai な Issue を 1 件だけ、判定 → 計画 → Owner 承認 → 実装 → 検査 → レビュー → PR まで通す。「#<番号> をループで回して」「loop-controller #<番号>」のときに使う。⚠ merge しない。⚠ Issue を勝手に選ばない。
---

# Loop Controller v1

⚠ **Controller は判断基準を持たない。**呼んで、返った判定で遷移するだけ。

```
PRECHECK → READY_CHECK → PLAN → APPROVAL → WORK → PR → STOP
                  ↑                          │
                  └──── 判定が NG なら戻る ───┘
```

⚠ **v1 は Queue Processor ではない。**Issue を 1 件だけ。自動巡回しない。

## ⚠ 絶対にやらないこと

```
merge（CI が緑でも）        ready-for-ai の付与・削除
Issue を勝手に選ぶ          Issue の Close / Rewrite / Split
別 Issue へ着手             新しい Issue を作る
Scope を広げる              仕様・UX・データの意味を決める
検査を飛ばす                レビューを飛ばす
main へ直接 push            無限に retry する
```

⚠ **判断基準をここへ写さない。**検査の一覧も、UI の原則も、Issue の判定条件も、
それぞれの Skill が正（掟: 同じ問いに答える実装を2つ持たない）。

---

## 1. PRECHECK

### Issue 番号が無いとき

⚠ **勝手に選ばない。**候補を出して止まる。

```bash
gh issue list --state open --label ready-for-ai
```

```
STOP: 対象が決まっていません
候補: <一覧>
⚠ どれを回すか、番号で指定してください。こちらでは選びません。
```

### Issue 番号があるとき

```bash
gh issue view <N> --json number,title,body,labels,state
gh issue view <N> --comments
```

⚠ **止まる条件**

| 何 | ⚠ 止まる理由 |
|---|---|
| `state` が `CLOSED` | 終わっているものに手を入れない |
| `ready-for-ai` が無い | ⚠ **Controller の入口。**⚠ **自分では付けない** |

### 手元の状態

```bash
git status --short
git branch --show-current
gh pr list --state open --search "<N>"
```

⚠ **止まる条件**

- ⚠ **今回と無関係な未コミット変更がある** → `STOP: WORKTREE NOT CLEAN`。
  ⚠ **勝手に stash・破棄・commit しない**
- ⚠ **この Issue を閉じる Open PR が既にある** → ⚠ **別の PR を作らない。**
  続きなのか作り直しなのか判断できなければ止まる

⚠ **`main` に直接コミットしない。**ブランチ名は既存に合わせる（`<type>/<短い名前>`）。

---

## 2. READY_CHECK

⚠ **ラベルは入口であって、実装できる保証ではない。**
本文もコメントも、ラベルを付けたあとに変わる。付け間違いもある。

→ [`issue-ready`](../issue-ready/SKILL.md) を**必ず通す**（`YES` / `NO`）。

⚠ **`NO` なら何も実装しない。**

```
STOP: ISSUE NOT READY
Issue: #N ／ Label: ready-for-ai ／ Quality Gate: NO
未解決: <そのまま>
⚠ 実装は 1 行も始めていません。
```

⚠ **Issue を書き換えない・ラベルを外さない・Close しない・仕様を補完しない。**
⚠ **報告するだけ。**

---

## 3. PLAN

`issue-work` の計画の段を使う。⚠ **中身をここへ写さない。**

出すもの:

```
Issue / Goal / Owner Decisions / Scope / Out of Scope
触るファイル（予定） / Acceptance Criteria
Verification Plan（どの検査で見るか）
Review Plan（change-review ／ 画面を変えるなら ui-ux-review も）
⚠ 止まりそうなところ
```

⚠ **測ってから決めることがあるなら、先に測って数字を出す。**

---

## 4. APPROVAL（⚠ Human Gate 1）

⚠ **`AskUserQuestion` で聞く。**本文に混ぜない。

### ⚠ 承認が意味すること（実行契約）

Owner が承認したら、⚠ **その Issue 1 件に限り**次を許可したものとして扱う。

```
実装 ／ 修正 ／ Inner Verify ／ Final Verify ／ Review
commit ／ ⚠ そのブランチへの push ／ PR 作成
```

⚠ **許可に含まれないもの**

```
merge ／ 別 Issue ／ Scope 拡大 ／ 仕様・UX の決定
ready-for-ai の付与・削除 ／ Issue Close ／ 大規模リファクタ
```

⚠ **これは `CLAUDE.md` §8「`git push` はそのつど許可を取る」の例外を、
Controller 経由に限って明示したもの。**
⚠ **`issue-work` を単体で使うときは、いままでどおり毎回取る。**弱めていない。

---

## 5. WORK（⚠ ここだけ自律で回る）

```
実装（issue-work）
   ↓
Inner Verify（verify の Inner Loop）
   ↓ PASS
Final Verify（verify の Final Gate）
   ↓ PASS
Review（change-review ／ 画面を変えたなら ui-ux-review も）
   ↓ PASS
PR へ
```

⚠ **判定ごとの行き先**

| 返ってきたもの | どうする |
|---|---|
| Verify `PASS` | 次へ |
| Verify `FAIL` | ⚠ **Scope 内で直せるなら**実装へ戻る。**1 周と数える** |
| Verify `NOT-VERIFIED` | ⚠ **原則止まる。**外部が原因で再試行が理にかなうときだけ、**同じ条件で 1 回だけ**。それでも駄目なら止まる。⚠ **コードをいじって消そうとしない** |
| Review `PASS` | 次へ |
| Review `NEEDS-FIX` | ⚠ **Scope 内の指摘だけ**直して実装へ戻る。**1 周と数える** |
| Review `HUMAN-DECISION` | ⚠ **即止まる。**Controller は決めない |

⚠ **直したら Inner → Final → Review を通し直す。**飛ばさない。

### ⚠ 周回の上限

⚠ **最大 3 周**（初回の実装は数えない）。到達したら `STOP: LOOP LIMIT REACHED`。

⚠ **同じ原因・同じ検査の失敗・同じ指摘が繰り返されたら、上限前でも止まる**
（`STOP: REPEATED FAILURE`）。⚠ **3 回まで機械的に回すだけでは足りない。**

⚠ **この上限を、機械で強制する仕組みは無い。**
⚠ **静的検査が見られるのは「文書に上限が書いてある」ことまでで、
守ることの検証にはなっていない。**そう分かったうえで運用する。

---

## 6. PR

⚠ **全部そろったときだけ作る。**

```
[ ] Issue Quality Gate = YES
[ ] Owner 承認 = YES
[ ] Final Verify = PASS
[ ] 必要な Review = PASS
[ ] 未解決の Human Decision = 0
[ ] 周回が上限を超えていない
```

本文は [`PULL_REQUEST_TEMPLATE.md`](../../../.github/PULL_REQUEST_TEMPLATE.md) に沿う。
`Closes #<N>` を入れ、Controller で回したことが分かるようにする。

```
Loop Controller: Quality PASS ／ Verify PASS ／ Review PASS ／ 周回 2 / 3 ／ 判断待ち なし
```

---

## 7. STOP（⚠ Human Gate 2）

⚠ **PR を作ったら終わり。**

```
禁止: gh pr merge ／ auto merge ／ merge queue ／ main へ直接 push
```

⚠ **CI が緑でも merge しない。**⚠ **CI が緑でも「仕様が正しい」ではない。**

### 報告の形（⚠ 止まったときも同じ形で出す）

```
Loop Controller Report

Issue:        #N
Quality:      PASS / NO
Owner 承認:   YES
やったこと:   <要約>
周回:         2 / 3
Verify:       Inner PASS ／ Final PASS
Review:       change-review PASS ／ ui-ux-review PASS or N/A
PR:           #XXX
止まった理由: OWNER REVIEW REQUIRED
未解決:       なし / <一覧>
```

---

## 8. dry-run

`loop-controller #<番号> dry-run`

⚠ **やること**: Issue 取得 ／ `ready-for-ai` 確認 ／ `issue-ready` の再評価 ／
計画の出力 ／ 止まる条件の確認。

⚠ **やらないこと**

```
ブランチ作成 ／ ファイル変更 ／ commit ／ push ／ PR ／ Issue の変更
```

---

## 9. 止まる条件（⚠ どれも即止まる）

```
ready-for-ai が無い          Issue Quality Gate = NO
Issue が CLOSED              Owner Decision が未解決
Issue / コメント / SPEC / ADR が矛盾し、正を決められない
Scope を越えないと直せない   仕様・UX を新しく決める必要がある
データの意味を変える必要がある
Runtime の作りを大きく変える必要がある
Final Verify = NOT-VERIFIED  Review = HUMAN-DECISION
同じ失敗を繰り返す           周回 3 に到達
無関係な未コミット変更がある この Issue の Open PR が既にある
```

⚠ **止まるのは失敗ではない。**⚠ **境界を守れたということ。**
