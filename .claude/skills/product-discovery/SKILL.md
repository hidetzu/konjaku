---
name: product-discovery
description: 今昔で「次に何を改善する価値がありそうか」を、現物と記録から探索し、案を削って、Owner が選べる形にする。「今のプロダクトに何が足りない？」「次に何を磨く？」「この機能に価値ある？」「取れるデータをどう利用者価値に変える？」「何を作らないほうがいい？」のときに使う。⚠ 実装しない。⚠ Issue を作らない。⚠ 優先順位を決めない。
---

# Product Discovery

⚠ **これは「機能を考える」Skill ではない。**⚠ **「今回はこれ以外をやらない」まで言う Skill。**

⚠ **`Rejected` を出さない Discovery は、⚠ Discovery ではない**（[ADR 0037](../../../docs/adr/0037-Discoveryは案を出すより先に案を捨てる.md)）。

```
現物・記録・利用者の声
        ↓
 product-discovery      ← ここ。探して、削って、渡す
        ↓
   Owner が方向を選ぶ
        ↓
  必要なら Experiment / Prototype
        ↓
   ui-ux-review  →  issue-ready  →  Owner がラベル  →  loop-controller
```

## ⚠ この Skill が絶対にやらないこと

- ⚠ **Product Code を書かない。**⚠ Prototype も、⚠ **作ること自体を次の候補として出すだけ**
- ⚠ **GitHub Issue を作らない・Close しない・Rewrite しない。**⚠ **`ready-for-ai` を付けない**
- ⚠ **優先順位を確定しない。**⚠ **「今やる / 後で / やらない」の最終判断は Owner**
- ⚠ **Product Vision・β / v1 の Scope を変えない**
- ⚠ **画面に出す言葉を決めない**（`CLAUDE.md` §7-1）
- ⚠ **架空の利用者に答えさせて、⚠ それを利用者調査として扱わない**

---

## 1. 責務の境目（⚠ **越えない**）

| Skill | 答える問い |
|---|---|
| **product-discovery** | ⚠ **何を改善する価値がありそうか。**⚠ **何をやらないか** |
| [`ui-ux-review`](../ui-ux-review/SKILL.md) | 決まった方針で、画面が成立しているか |
| [`issue-ready`](../issue-ready/SKILL.md) | 決まった仕事が、AI に渡せる形か |
| [`change-review`](../change-review/SKILL.md) | 出した変更が、Scope と掟に収まっているか |
| [`context-maintainer`](../context-maintainer/SKILL.md) | 記録が実装とずれていないか |

⚠ **判断基準を写さない。**⚠ **5 秒ルール・4 幅・44×44・重なり・横あふれ・責務の重複は
`ui-ux-review` が正本。**⚠ **ここには 1 行も書かない**（掟: 同じ問いに答える実装を 2 つ持たない）。
⚠ **画面の課題を見るときは、⚠ `ui-ux-review` を呼び、⚠ その判定を Evidence として使う。**

---

## 2. 先に読む（⚠ **Goal を勝手に作らない**）

```
docs/SPEC.md            §1 何をするサービスか ／ §5 掟 ／ §8 いまの段
.claude/rules/domain.md 今昔が答える 3 つの問い ／ 足す前に答えること
docs/adr/               その判断になった経緯
CLAUDE.md               §1 いちばん上の原則 ／ §4 言葉 ／ §6 数字
```

⚠ **`docs/SPEC.md` に書かれていない Product Goal を、⚠ ここで作らない。**
⚠ **書かれていないなら「書かれていない」と言う**（`Unknown` へ置く）。

⚠ **`domain.md` の 3 つの問いに答えないものは、⚠ 候補にしない**（そこが正本）。

---

## 3. 材料を 5 つに分ける（⚠ **混ぜない**）

⚠ **`CLAUDE.md` §1 をそのまま Discovery に持ち込む。**

```text
Observed        ⚠ 実際に見た。現物・実測・利用者の回答・Issue の報告
Inferred        ⚠ Observed からの解釈。⚠ **まだ確かめていない**
Hypothesis      ⚠ 改善の仮説。⚠ **まだ確かめていない**
Unknown         ⚠ いまの材料では分からない
Human Decision  ⚠ Owner が決める価値判断
```

- MUST: ⚠ **`Inferred` / `Hypothesis` を `Observed` の顔で書かない**
- MUST NOT: ⚠ **確率・確信度・点数を付けない**（`CLAUDE.md` §6。⚠ 測っていない）
- MUST: ⚠ **Evidence が弱いなら、⚠ 弱いと書く**（⚠ 書かずに強い案として出さない）

---

## 4. ⚠ Data → Feature をやらない

⚠ **禁じ手**（⚠ **AI がいちばんやりがちな飛躍**）。

```text
Wikidata がある  →  もっと表示しよう          ⚠ 禁止
建物データがある →  建物の一覧を出そう        ⚠ 禁止
Telemetry がある →  ダッシュボードを作ろう    ⚠ 禁止
```

⚠ **必ずこの順で考える。**

```text
利用者は何を知りたい／したいのか
        ↓
いま、それにどこまで答えているか
        ↓
何が分からないまま残るか（Gap）
        ↓
なぜそれが問題だと考えるか
        ↓
仮説
        ↓
いちばん小さい確かめ方
```

⚠ **そのデータが、⚠ その答えを作るために要るか**を先に言う。

---

## 5. Workflow

### Step 1 — いまの姿を確かめる

⚠ **誰の何に答えているか ／ いまの画面 ／ いま出している答え ／
⚠ 言わないと決めていること ／ いまの段**（§2 の文書と実装が正本）。

### Step 2 — 見る

⚠ **要約で判断しない**（`ui-ux-review` §0 と同じ姿勢）。
⚠ **画面なら実画面。**⚠ **Issue なら本文とコメント。**⚠ **仕様なら実装。**

### Step 3 — 利用者の問いへ翻訳する

⚠ **見つけた現象を、⚠ そのまま改善案にしない**（§4）。

### Step 4 — Gap を書く

⚠ **「機能が無い」ではない。**⚠ **「利用者の問いに、いまのプロダクトが十分に答えられていない」**。

```text
Gap:
  空中写真を年代順に見ることはできるが、
  ⚠ どこを見れば土地の変化が分かるのかは、⚠ 今の画面だけでは分からない可能性がある。
  Evidence: ⚠ 弱い（利用者に確かめていない）
```

### Step 5 — 仮説を複数作る（⚠ **水増ししない**）

⚠ **1 つの解決策へ飛ばない。**⚠ **目安 2〜5 個。**
⚠ **数を満たすために薄い案を並べない。**⚠ **1 個しか残らなかったなら、⚠ 1 個でよい。**

各案が持つもの:

```text
User Question         利用者の問い
Observed              実際に見たこと
Gap                   いま答えられていないところ
Hypothesis            こうすれば答えられるのではないか
Smallest Experiment   ⚠ いちばん小さい確かめ方
Falsified when        ⚠ 何が起きたら「違った」と言えるか
Complexity change     ⚠ 何が増えて、何が減るか
```

⚠ **`Complexity change` に点数を付けない。**⚠ **具体で書く。**

```text
新しいデータ源が要る ／ 既存 UI の並び替えだけ ／ 新しい画面が要る
既存の責務を 1 つ消せる ／ Runtime の依存が増える
```

⚠ **`Falsified when` を書けない案は、⚠ 落とす**（§6）。

### Step 6 — 削る（⚠ **ここが本体**）

§6 の Kill Criteria を通す。⚠ **落とした案と理由を、⚠ 必ず出力に残す。**

### Step 7 — 渡す

⚠ **残った価値判断だけ**を Human Gate へ（§7）。⚠ **次の一手を 1 つ言う**（§8）。

---

## 6. Kill Criteria（⚠ **当たったら落とす。残すなら強い理由が要る**）

```text
1   利用者の具体的な問い・困りごとに結びついていない
2   ⚠ 「そのデータが取れるから」だけが理由
3   既存機能ですでに答えられている
4   同じ意味・同じ責務を、別の UI や機能として増やす
5   情報量や操作を増やすが、⚠ 何も減らしていない
6   今昔が答える 3 つの問いから外れる（`.claude/rules/domain.md`）
7   `docs/SPEC.md` で「言える」と決めた範囲を越える
8   ⚠ 推定を実測のように扱わないと成立しない（`CLAUDE.md` §1）
9   ⚠ うまくいったかを観測する方法が定義できない
10  確かめずに本実装するしかない
11  技術的に面白いだけで、⚠ 利用者価値を説明できない
```

⚠ **`AI では判断できない` は `REJECT` ではない。**⚠ **それは `HUMAN-DECISION`。**
⚠ **落とすのは「Evidence で落とせるもの」だけ。**⚠ **価値判断を落とさない。**

⚠ **`Rejected` が空なら、⚠ 探索が足りていないか、⚠ 削っていない。**
⚠ **どちらなのかを書く**（⚠ 空のまま出さない）。

---

## 7. Human Gate（⚠ **Owner が決める**）

```text
Product Vision を変える            β / v1 の Scope を変える
どの利用者を優先するか              有力案が複数あるとき、どれを選ぶか
画面に出す言葉の最終決定            UX の方向性
新しいデータ源を柱として足すか      今やる / 後で / やらない の最終順位
```

⚠ **何でも Owner へ投げない。**⚠ **Evidence で落とせるものは §6 で落とす。**
⚠ **最後に残った価値判断だけ**を送る。

⚠ **聞くときは `AskUserQuestion`**（`CLAUDE.md` §7-1。⚠ **本文に混ぜない**）。

---

## 8. Telemetry / Eval の扱い（⚠ **いちばん取り違えやすい**）

`main` には AI Task の計測と集計がある。

```
.claude/hooks/telemetry.mjs        観測して残す（ADR 0035）
.claude/tools/telemetry-eval.mjs   種別ごとに並べて比べる（ADR 0036）
```

⚠ **これは「利用者がプロダクトに何を求めているか」のデータではない。**
⚠ **測っているのは、⚠ こちらの開発作業。**

```text
Task の所要時間 ／ Turn 数 ／ Session 数 ／ task_type
        ↓
⚠ 「この機能は利用者に重要」        ⚠ 言えない
⚠ 「この UX は悪い」                ⚠ 言えない
⚠ 「この改善を優先すべき」          ⚠ 言えない
```

⚠ **使ってよいのは、⚠ AI Workflow 側を見るときだけ。**

```text
⚠ この種類の作業は、⚠ 摩擦が大きそう      → Inferred（⚠ Observed ではない）
⚠ 人の判断がここに集まっていそう          → Inferred
```

⚠ **`grouping` / `task_type` / `task_type_source` は推定値**（ADR 0035）。
⚠ **`result` は常に `unknown`。**⚠ **良し悪しは測っていない**（ADR 0036）。
⚠ **Discovery 側で、⚠ 勝手に成功・失敗へ読み替えない。**

### ⚠ Discovery の中心になる証拠

```text
いまの実画面 ／ いまの仕様（docs/SPEC.md） ／ Product Goal
実際に観測している利用状況 ／ 利用者の声 ／ 実際にやった利用者テスト
Issue として報告された困りごと
```

⚠ **`/t` の計測（`tick` / `health`）は利用者側の匿名イベント**（ADR 0028）。
⚠ **AI Task の計測とは別もの。**⚠ **どちらの話をしているかを、⚠ 毎回名乗る。**

---

## 9. 出力の形

```text
# Product Discovery

## Current Goal
<docs/SPEC.md ／ domain.md から確認できるもの。⚠ 書かれていないなら「書かれていない」>

## Observed
- <実際に見たこと。⚠ どこで見たかを添える>

## Inferred
- <そこからの解釈。⚠ 確かめていない>

## Unknown
- <いまの材料では分からないこと>

## User Question
<利用者が本当に知りたい／したいこと>

## Gap
<いまのプロダクトが十分に答えられていないところ。⚠ Evidence の強さも書く>

## Candidates

### Candidate A — <一言>
User Question:
Observed:
Gap:
Hypothesis:
Smallest Experiment:
Falsified when:
Complexity change:

### Candidate B — ...

## Rejected
- <案> — <当たった Kill Criteria の番号と、その理由>

## Human Decision
- <Owner が決める価値判断>

## Next Step
<Experiment / ui-ux-review / issue-ready / 追加の観測 のどれか 1 つ>
```

⚠ **`Rejected` を空にしない**（§6）。⚠ **`Next Step` は 1 つに絞る。**

---

## 10. Issue へ渡すとき

⚠ **Discovery の結果を、⚠ そのまま `ready-for-ai` Issue とみなさない。**

```
Discovery → Owner が方向を選ぶ → 必要なら Experiment → 方向が決まる → issue-ready
```

⚠ **Owner から「Issue 案にして」と言われたときだけ**、
[`issue-ready`](../issue-ready/SKILL.md) の様式に沿った **Draft を書く**。
⚠ **GitHub には登録しない。**⚠ **ラベルも付けない。**

---

## 11. v1 でやらないこと

```text
自動で GitHub Issue を作る          自動で ready-for-ai を付ける
自動で優先順位を確定する            自動で Product Code を変える
Prototype を本番へ出す              Product Vision を変える
架空の利用者を実調査として扱う      AI Task Eval を Product Value Score に変える
総合スコアを作る                    新しい仕組み・依存ライブラリを足す
```

⚠ **この Skill は Markdown だけ。**⚠ **走るコードを持たない。**
