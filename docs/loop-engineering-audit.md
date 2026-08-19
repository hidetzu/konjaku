# Loop Engineering 棚卸し（2026-08-19）

⚠ **この文書は「いま何があるか」の棚卸しであって、方針の決定ではない。**
決まったことは [`SPEC.md`](SPEC.md)、判断の経緯は [`adr/`](adr/)、
作業のきまりは [`../CLAUDE.md`](../CLAUDE.md) にある。ここで仕様を作らない。

⚠ **Loop Controller はまだ導入していない。**この文書は導入前の調査。

---

## 1. 何を見たか

```
.claude/          Skill 2 本・Hook 2 本・settings.json
CLAUDE.md         作業のきまり（9 節）
CONTRIBUTING.md   外から手を入れる人向け（162 行）
.github/          Issue テンプレート 2・PR テンプレート 1・Workflow 1・dependabot
docs/SPEC.md      いま何が言えるか（掟 7 条を含む）
docs/adr/         29 本（欠番あり。番号は再利用しない）
package.json      npm script 21 本
scripts/          .mjs 21 本
GitHub            ラベル 11・Open Issue 9
```

---

## 2. 分類

⚠ **KEEP / IMPROVE / SPLIT / REMOVE。**
⚠ **REMOVE は 1 つも出していない。**消してよいと判断できたものが無かった。

### 2-1. Issue

| 何 | いま | 分類 | 理由 |
|---|---|---|---|
| `.github/ISSUE_TEMPLATE/bug.md` | 不具合の報告。⚠ 脆弱性を公開 Issue に書かせない導線つき | **KEEP** | 外から来る人向けとして完成している |
| `.github/ISSUE_TEMPLATE/idea.md` | 提案・改善。⚠ **「やらないと決めていること」を先に読ませる**（SPEC・ADR へのリンク） | **KEEP** | ⚠ 「当たっていても構いません」まで書いてある。萎縮させずに前提を渡している |
| ⚠ **AI へ渡す前提の Issue 様式** | ⚠ **足した**（`issue-ready` §3） | **IMPROVE 済** | `Goal / Background / Scope / Out of Scope / Owner Decisions / Acceptance Criteria / Verification / Human Decision / Stop Conditions` |
| ⚠ **Issue の粒度を判定する仕組み** | ⚠ **足した**（`issue-ready` §4 の 10 条） | **IMPROVE 済** | ⚠ 判定を返すだけ。**ラベルは付けない** |

⚠ **既存テンプレートは「外の人が困りごとを書く」ためのもの。**
AI へ渡す様式をここへ混ぜると、**外から報告する人の負担が上がる**。
⚠ **別の入口として足す**のが筋（テンプレートを1本増やすか、Skill が整形するか）。

### 2-2. Worker

| 何 | いま | 分類 |
|---|---|---|
| `.claude/skills/issue-work/SKILL.md`（121 行） | Issue 取得 → きまりを読む → Owner Decisions 抽出 → **計画の承認** → 実装 → 検査 → 自己レビュー → コミット → PR → Completion Report | **SPLIT**（後述） |

⚠ **10 段のうち、責務が 3 種類混ざっている。**

```
1〜3   Issue を読む・きまりを読む・抽出する      … 入力の検分
4      計画を出して承認を取る                    … Human Gate
5      実装                                      … Worker
6      検査                                      … Verify
7      自己レビュー                              … Review
8〜10  コミット・PR・報告                        … 出力
```

⚠ **いま困っていないなら割らない。**§4 に、割る／割らないの判断を書く。

### 2-3. Verify

| 何 | いま | 分類 |
|---|---|---|
| `npm run check`（`scripts/check.mjs`） | 静的 **151 件**。外へ出ない。実測 8 秒 | **KEEP** |
| `npm run check -- --links-new=<ref>` | ⚠ **このブランチで足した URL だけ**叩く。実測 平均 0.00 本／PR | **KEEP** |
| `npm run check -- --links` | 全部（8 本）。`main` と週次だけ | **KEEP** |
| `npm run render`（`scripts/render.mjs`） | 実描画 **126 件**（core 117 / search 9）。実測 6〜7 分 | **KEEP** |
| `npm run check-search`（`scripts/search-check.mjs`） | 42 語を 1.5 秒あけて叩く。⚠ 待機だけで約 63 秒 | **KEEP** |
| `.github/workflows/check.yml` | 2 ジョブ。⚠ 端数の切り上げを避けて束ねてある | **KEEP** |
| ⚠ **件数が SPEC とずれても気づけない** | ⚠ **直した**（2026-08-19） | **IMPROVE 済** |
| ⚠ **Inner Loop（速く回す部分集合）** | ⚠ **すでにある**（`--only=` と `--group=`） | **KEEP** |

⚠ **Verify は、すでに Loop から呼べる形になっている。**新しい入口を作る必要はない。

```
速い     node scripts/check.mjs                     8 秒・外へ出ない
少し遅い node scripts/render.mjs --only=<部分一致>   変えたところだけ
遅い     node scripts/render.mjs --group=core        117 件・外へ検索に出ない
最後     npm run check / render / check-search       全部
```

⚠ **`npm run render --group=core` と書くと npm が引数を飲み、黙って全群が走る。**
`--` を挟む（`CLAUDE.md` §9 に記載）。

⚠ **fork からの PR では、外へ出る検査が走らない**（外部リンク・検索・実描画）。
⚠ **fork の PR が緑でも、実描画で検証されていない。**Loop Controller を作るなら、
ここを「緑＝検証済み」と読まない仕掛けが要る。

### 2-4. Review

| 何 | いま | 分類 |
|---|---|---|
| `issue-work` §7 自己レビュー | `git diff` を読み直す。Acceptance Criteria・Non-goals・分母・「取れなかった≠無い」・死にコード | **KEEP**（`issue-work` に置いたままでよい） |
| `.claude/skills/ui-ux-review/SKILL.md` | ⚠ **強化した**（44 → 130 行）。判定・実測幅 4 つ・今昔の掟・触って確かめる | **IMPROVE 済** |

⚠ **`ui-ux-review` は「設計するときの心得」で、品質ゲートの形をしていない。**

- ⚠ **判定を返さない。**`PASS / NEEDS-FIX / HUMAN-DECISION` が無い
- ⚠ **「確認したか」で終わっている。**何を測るかが書かれていない
  （⚠ このリポジトリは px と件数で測るきまりなのに、この Skill だけ measurement が無い）
- ⚠ **今昔固有の掟が入っていない。**44×44px・375/344/320 の実測幅・
  「押しても何も起きない導線を置かない」・「⚠ を在庫の話に使わない」が無い
- ⚠ **触って確かめることが書かれていない**（記憶: 要約を読むだけでは指摘が出ない）

### 2-5. Hooks

| 何 | いま | 分類 |
|---|---|---|
| `.claude/hooks/ask-slack.mjs`（223 行） | `AskUserQuestion` の前に走り、Slack へ選択肢を出して答えを待つ。⚠ **待ち 180 秒 < Hook の timeout 200 秒**・⚠ **落ちても exit 0**（端末で聞ける道を塞がない）・⚠ 人名を出さない | **KEEP** |
| `.claude/hooks/slack-doctor.mjs` | 診断。⚠ トークンの値を出さない | **KEEP** |
| `.claude/settings.json` | `PreToolUse` に上記 1 本 | **KEEP** |

⚠ **これはすでに Human Gate の実装になっている。**Loop の途中で人に聞く道が
Slack まで通っていて、⚠ **落ちても端末で聞ける**ように作られている。
静的検査がその性質（180 < 200・exit 0・人名なし・`.envrc` が git に入っていない）を見ている。

### 2-6. GitHub

| 何 | いま | 分類 |
|---|---|---|
| ラベル | 既定 10 ＋ `accessibility` ＋ ⚠ **`ready-for-ai`（既に作成済み・説明文なし）** | ⚠ **意味を `CLAUDE.md` §7-2 に書いた。**説明文は未設定（Owner） |
| `needs-decision` | **無い** | ⚠ **作っていない**（D-4） |
| `.github/PULL_REQUEST_TEMPLATE.md` | 何を/なぜ・どう確かめたか・⚠ 外部通信を増やしたか・⚠ **わざと壊して確かめたか**・分母 | **KEEP** |
| `.github/workflows/check.yml` | ⚠ Action を SHA で固定・`timeout-minutes` あり・fork で外へ出る検査を skip | **KEEP** |
| 自動 merge | **無い** | **KEEP**（入れない） |

### 2-7. Human Gate（いまどこで人が入るか）

```
Issue を書く                       人（Owner）
ready-for-ai を付ける              人（⚠ 意味は CLAUDE.md §7-2。⚠ AI は付けない）
issue-work §4 計画の承認           人
issue-work §9 git push の許可      人（⚠ CLAUDE.md §8「そのつど取り直す」）
AskUserQuestion → ask-slack        人（Slack か端末）
PR のレビュー・merge               人
```

⚠ **すでに 6 か所ある。**⚠ **足りなかったのは数ではなく、`ready-for-ai` の意味の定義**で、
それは `CLAUDE.md` §7-2 に書いた。

---

## 3. Open Issue（9 件・⚠ 一次評価）

⚠ **この節は評価であって、実行ではない。**
⚠ **Close も Rewrite も Split もしていない。**ラベルも付けていない。

| # | 題 | 一次分類 | ⚠ なぜ |
|---|---|---|---|
| hidetzu/konjaku#27 | 端末内だけで更新を知らせる**仕様を決める** | **NEEDS-HUMAN-DECISION** | ⚠ 題が「仕様を決める」。決めるのは人 |
| hidetzu/konjaku#24 | 出典ごとのデータ更新状況 | **REWRITE** | 方針は具体的だが、Acceptance Criteria が機械で判定できる形になっていない |
| hidetzu/konjaku#22 | 年代変更・判定完了が読み上げに伝わらない | ⚠ **KEEP に近い** | 現状の実測（`aria-live` 0 件）・対応方針・通知タイミングが具体的。⚠ **ただし文面は人が決める** |
| hidetzu/konjaku#21 | Performance Budget と回帰検査 | **SPLIT** | 「予算を決める」（人）と「検査を書く」（AI）が混在 |
| hidetzu/konjaku#15 | 表示基盤の共通化・文字拡大・テーマ | **SPLIT** | 3 つの独立した目的。⚠ トークン共通化／rem 化／テーマ切替 |
| hidetzu/konjaku#14 | 外部リンクを日本語 Wikipedia へ・三状態 | ⚠ **KEEP に近い** | Owner Decisions が本文にある。実測（2,220/2,367＝93.8%）もある |
| hidetzu/konjaku#12 | キーボード操作とフォーカス表示 | **SPLIT** | ⚠ 実測が 2 件以上ある（`/peel` の閉じたパネル・トップの検索欄）。別々に直せる |
| hidetzu/konjaku#11 | 「動きを減らす」で自前アニメを止める | ⚠ **KEEP に近い** | 実測（自前 0 件・transition 5＋5・animation 2）が具体的。⚠ 11 秒再生の扱いだけ判断が要る |
| hidetzu/konjaku#9 | 利用者向けの言葉に揃える | ⚠ **進行中**（この Issue で作業してきた） | ⚠ 進捗の出どころは `tmp/9/06-いまここ.md` |

⚠ **古い Issue 本文を、正しい仕様として読まない。**
⚠ **`ready-for-ai` を付ける前に、`main` で測り直すこと。**

### 3-1. ⚠ 測り直したら、Issue 本文とずれていたもの（2026-08-19・`main` = `cd747bc`）

| # | Issue が言っていること（2026-08-15） | ⚠ いま |
|---|---|---|
| hidetzu/konjaku#11 | 自前コードに `prefers-reduced-motion` が **0 件** | ⚠ **変わっていない**（0 件） |
| hidetzu/konjaku#11 | トップ: `transition` 5 宣言・`animation` 2 宣言 | ⚠ **変わっていない**（5 / 2） |
| hidetzu/konjaku#11 | `/peel`: `transition` **5 宣言** | ⚠ **8 宣言に増えている**。さらに `scroll-behavior` が **2 件**（Issue に無い） |
| hidetzu/konjaku#11 | トップ: smooth scroll **6 か所** | ⚠ **7 か所** |
| hidetzu/konjaku#12 | `/peel` の閉じたパネルへ Tab が入る | ⚠ **`inert` が入っている**（`peel3d.js` の `sealOldControls`）。実描画「見えない操作に、キーボードで届かない」が見ている。⚠ **Issue が挙げた要素と同じかは、測り直しが要る** |
| hidetzu/konjaku#12 | トップの `#q` にフォーカス表示が無い | ⚠ **変わっていない**（`index.html:173` に `outline:none`）。⚠ さらに `#memo:focus` も `outline:none` |
| hidetzu/konjaku#12 | — | ⚠ **`focus-visible` は両画面とも 0 件。**つまり**前例が無い**ので、見せ方を決めるところから |

⚠ **数字が動いているものは、Issue 側の数字を直してから渡す。**
そのまま渡すと、AI が **2026-08-15 の値を「いまの実測」として引用する**。

---

## 3-2. ⚠ `ready-for-ai` 候補（1 件だけ提案する）

⚠ **ラベルは付けていない。**付けるのは Owner（`CLAUDE.md` §7-2）。

### 提案: hidetzu/konjaku#11 を 2 つに割り、**前半だけ**を渡す

| | 何 | 渡せるか |
|---|---|---|
| **11-a** | ⚠ **CSS の動き**を「動きを減らす」で止める（`transition` 13 宣言・`animation` 2 宣言・`scroll-behavior` 2 件・smooth scroll 7 か所） | ⚠ **YES** |
| **11-b** | ⚠ **自前 JS の再生**（トップの `▶` 1.3 秒ごと・`/peel` の 11 秒再生） | ⚠ **NO** |

**なぜ 11-a は渡せるか**

- ⚠ **見せ方を発明しない。**`prefers-reduced-motion: reduce` で動きを詰めるのは
  確立した書き方で、このリポジトリが決める話ではない
- ⚠ **機械で判定できる。**Playwright の `emulateMedia({ reducedMotion: "reduce" })` で
  `getComputedStyle` の `transition-duration` / `animation-duration` を読む
- ⚠ **Out of Scope が引ける。**同梱 MapLibre（`vendor/` に 1 件ある）は触らない
- 実測が取り直してある（上の表）

**なぜ 11-b は渡せないか**

- ⚠ **止めるのか、最後まで飛ばすのか、そもそも出さないのかは方針。**
  ⚠ `/peel` の 11 秒再生は「年代を送りながら回転・ズーム・傾斜」で、
  **止めると何も起きない導線になる**（ADR 0026 に触れる）。⚠ **人が決める**

⚠ **11-a を渡すなら、先に Issue hidetzu/konjaku#11 の本文を直す。**
いまの本文は `/peel` を「`transition` 5 宣言」と書いており、**実際は 8 宣言**。

---

## 4. 判断が要るもの（⚠ ここは決めない）

| # | 何 | ⚠ なぜ人が決めるか |
|---|---|---|
| D-1 | `issue-work` を割るか、1 本のままにするか | ⚠ 「Skill 数を増やすこと自体を目的にしない」と指示にある。⚠ **いま困っていない**（10 段が長すぎて破綻した実例が無い） |
| D-2 | Issue Quality Gate を **Skill** で作るか、**Issue テンプレート**で作るか | ⚠ テンプレートに寄せると、**外から報告する人の負担が上がる** |
| D-3 | `ready-for-ai` の説明文 | ラベルの意味は運用の約束。人が決める |
| D-4 | `needs-decision` を作るか | ⚠ 「ラベルを増やしすぎない」と指示にある |
| D-5 | 各 Open Issue の Close / Rewrite / Split | ⚠ 指示で明示的に Owner 承認後 |
| D-6 | Loop Controller の導入 | ⚠ 指示で明示的に Owner 承認後 |

---

## 5. ⚠ この棚卸しで見つかった、いまある穴

| 何 | 状態 |
|---|---|
| ⚠ `ready-for-ai` ラベルはあるが、**意味が文書化されていない** | ⚠ **書いた**（`CLAUDE.md` §7-2） |
| ⚠ `ui-ux-review` が **判定を返さない**（品質ゲートの形をしていない） | ⚠ **直した**（`PASS / NEEDS-FIX / HUMAN-DECISION`） |
| ⚠ AI へ渡す Issue の**様式が無い** | ⚠ **作った**（`issue-ready`） |
| 検査の件数が SPEC とずれても気づけなかった | ⚠ **直した**（各走者が自分で突き合わせる） |
| ⚠ **fork の PR は緑でも実描画で検証されていない**のに、それを機械で言う仕組みが無い | ⚠ **残っている。**`CONTRIBUTING.md` と `CLAUDE.md` には書いてあるが、**人が読む前提** |
| ⚠ ラベルの説明文が空 | ⚠ **残っている**（Owner が設定する。D-3） |

---

## 6. ⚠ まだやっていないこと

```
Loop Controller
Issue Queue の自動巡回
定期実行
自動 merge
ready-for-ai の自動付与
複数 Issue の並列処理
```

⚠ **Loop Controller はまだ導入していません。Owner レビュー後に進めます。**
