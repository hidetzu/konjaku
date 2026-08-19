---
name: issue-ready
description: konjaku の Issue が AI へ渡せる状態かを判定し、渡せる形へ整える。新しい Issue 案を書くとき、既存 Issue を棚卸しするとき、「この Issue は AI に任せられるか」「ready-for-ai を付けてよいか」を判断するときに使う。⚠ ラベルは付けない。
---

# Issue Quality Gate

⚠ **これは「Issue から実装する」Skill ではない。**それは
[`issue-work`](../issue-work/SKILL.md)。ここは**その前**。

```
Issue 案・既存 Issue
        ↓
   issue-ready      ← ここ。渡してよいかを判定する
        ↓
   Owner がラベルを付ける
        ↓
   issue-work
```

## ⚠ この Skill が絶対にやらないこと

- ⚠ **`ready-for-ai` ラベルを付けない。**付けるのは Owner
- ⚠ **Issue を Close しない・Rewrite しない・Split しない。**案を出すだけ
- ⚠ **仕様を補完しない。**Issue 本文・`docs/SPEC.md`・`docs/adr/`・実装が
  食い違っていたら、**どちらが正かを決めずに** `NEEDS-HUMAN-DECISION` にする
- ⚠ **UX の方針・データの意味を決めない**

---

## 1. 先に読む

```
CLAUDE.md          作業のきまり
docs/SPEC.md       いま何が言えるか（⚠「掟」の節）
docs/adr/          その判断になった経緯
```

⚠ **Issue が触る範囲の ADR を読む。**Issue 本文より ADR が新しいことがある。

## 2. 現物を見る

⚠ **古い Issue 本文を、正しい仕様として扱わない。**
Issue に書かれた実測値は、**書かれた日の値**であって、いまの値ではない。

```bash
gh issue view <N> --json number,title,body,labels,state,createdAt
gh issue view <N> --comments        # ⚠ 本文より後のコメントが正
```

⚠ **`main` で測り直す。**Issue が「〜が 0 件」「〜px」と言っているなら、
**いまもそうか**を確かめる。違っていたら、それ自体が報告事項。

---

## 3. 様式

AI へ渡す Issue は、次を持つ。

```
Goal                  何が達成されたら終わりか（1 つ）
Background            なぜ必要か。⚠ 実測があれば分母・測定日・測定条件つきで
Scope                 触ってよい範囲
Out of Scope          ⚠ 触らない範囲。これが無いと、際限なく広がる
Owner Decisions       ⚠ 決まっていること。AI はここを独自判断で変えない
Acceptance Criteria   ⚠ 機械で判定できる形で
Verification          どの検査で見るか。⚠ 足す検査があるなら、それも
Human Decision        ⚠ まだ決まっていないこと（あれば ready-for-ai 不可）
Stop Conditions       どうなったら止まって聞くか
```

⚠ **Acceptance Criteria は「機械で判定できる形」。**

| ⚠ 駄目 | 良い |
|---|---|
| 見やすくなっている | 375×667 で、答えの行が y<400 に入る |
| スクリーンリーダーに伝わる | 年代変更後、`role="status"` の中身が新しい年代を含む |
| 速くなっている | 初回表示のリクエストが N 本以下（⚠ N は Owner が決める） |
| 適切に表示する | ⚠ **「適切」は判定できない。**何をもって適切かを書く |

⚠ **数字を書くなら、主張範囲の分母・測定日・測定条件を添える**（`CLAUDE.md` §6）。

---

## 4. 粒度を見る

⚠ **次のどれかに当たったら `ready-for-ai` 不可。**

| # | 何 | ⚠ なぜ |
|---|---|---|
| 1 | 仕様そのものを決める必要がある | ⚠ AI が仕様を発明する |
| 2 | UX の方向性を決める必要がある | 同上 |
| 3 | 独立した目的が複数ある | 1 PR = 1 つの理由にならない |
| 4 | Acceptance Criteria が機械で判定できない | 「終わった」を誰も言えない |
| 5 | Scope が広すぎる | 途中で判断が要る |
| 6 | Out of Scope が書かれていない | 際限なく広がる |
| 7 | Owner Decision が未解決 | ⚠ AI が代わりに決めてしまう |
| 8 | いまのコード / SPEC / ADR と食い違っている | ⚠ どちらが正かを AI が決めてしまう |
| 9 | ⚠ **データの意味を変える** | ⚠ 掟に直結。人が決める |
| 10 | ⚠ **fork の PR でしか検証できない** | ⚠ 外へ出る検査が走らない（`CONTRIBUTING.md`） |

⚠ **大きすぎるときは、分割案を出す。**分割の単位は**理由**であって、ファイルではない。

---

## 5. 判定を返す

```
Issue #N  <題>

Classification: KEEP / REWRITE / SPLIT / CLOSE / NEEDS-HUMAN-DECISION

Ready for AI: YES / NO

理由:
  <どの条項に当たったか。当たっていないなら、10 条すべてを見たと言う>

いまの main と食い違っているところ:
  <⚠ 測り直した結果。無ければ「測り直して、食い違いは無かった」>

分割案:
  <SPLIT のときだけ。理由ごとに>

Verification:
  <どの検査で見るか。足す検査があるなら、それも>

Human Decision:
  <⚠ 人が決めることを、決めずに並べる>
```

⚠ **`Ready for AI: YES` と書いても、ラベルは付けない。**
⚠ **`YES` は「AI が実装できる」であって、「実装してよい」ではない。**後者は Owner が決める。

---

## 6. ⚠ 新しい Issue 案を書くとき

⚠ **既存のテンプレートに混ぜない。**
[`bug.md`](../../../.github/ISSUE_TEMPLATE/bug.md) と
[`idea.md`](../../../.github/ISSUE_TEMPLATE/idea.md) は、
**外から困りごとを報告する人**のためのもの。⚠ **そこへ 9 項目を要求すると、
報告する人の負担が上がる。**

⚠ **§3 の様式は、Owner が自分で書く Issue と、この Skill が整形した案に使う。**

⚠ **1 Issue = 1 つの理由。**「ついでに」を入れない。
