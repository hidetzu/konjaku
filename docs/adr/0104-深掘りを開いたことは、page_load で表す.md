# 0104. 深掘りを開いたことは、page_load で表す

- 日付: 2026-09-08
- 状態: 採用
- 決めた人: Owner

## 何が起きていたか

`public/measure.js` は、こう書いてある。

```text
⚠ 画面を開いたことは page_load 1 本で表し、どの画面かは metadata が持つ。
  画面ごとに別の名前を作らない（同じ問いに答える名前が 2 つになる）。
```

**`/deep` だけ、そうなっていなかった。**`deep_accessed` を送っていた（`public/deep.js`）。
**同じ問いに答える名前が 2 つある**（`CLAUDE.md` §3）。

**実測（2026-09-07 の 1 日）**:

```text
日ごとの本数   page_load 60 本
問い 5        map 36 ／ about 24 ／ deep 10  = 70
```

**差の 10 は `deep_accessed` 由来。**`/deep` は `page_load` を 1 本も送っていなかった。

## 決めたこと

**`/deep` も `page_load`（`page: "deep"`）を送る。**`deep_accessed` は列挙から落とす。

```js
Konjaku計測.起こす("page_load", { page: "deep", 入口: arg.state === "ok" ? "link" : "default" });
```

### 情報は消えていない

**「共有リンクで開かれたか」は `entry_point` が持っている**（`link` / `default`）。
`measure.js` の `本文()` は `page_load` でも `入口` を受け取るので、**そのまま残る**。

実測（2026-09-08・実描画）:

```text
深掘りを開くと、計測が 1 本だけ飛ぶ — page_load・画面 deep・入口 link・流入元 direct
```

**消えたのは「深掘りに来た」を 1 つの出来事名で数えられること**だけ。
数えるときは `page_load` かつ `metadata.page = 'deep'` で引く。

### 前の形の行は、読めなくしない

**2026-09-08 より前の行には `deep_accessed` が入っている**（実データで 10 件）。
`npm run stats` の「どこまで進んだか」は、**両方を数える**。

```sql
CASE WHEN e.event_type='deep_accessed'
       OR (e.event_type='page_load' AND json_extract(e.metadata,'$.page')='deep')
     THEN e.session_id END
```

**片方だけにすると、その日を境に深掘りが 0 になる。**
起きたことが消える（`CLAUDE.md` §1）。

## 選ばなかった案

**`deep_accessed` を残し、`measure.js` のコメントのほうを直す**（「深掘りは別の出来事として数える」）。
実装は 1 行も動かないが、**同じ問いに答える名前が 2 つある状態が残る**。

**入口ごと消す**（`page_load` だけにして `入口` を渡さない）。
**共有リンクで開かれたかが測れなくなる**（いま 10/10 が `link`）。
測れていたものを、理由なく測れなくしない。

## 何を見張るか

**静的**（`test/check/safety.mjs`）:

```text
1.7  画面（measure.js）と受け側（events.js）の一覧が同じ（⚠ ずれたら落ちる）
1.9  画面の名は、どの記録から来たかを名乗る（deep は page_load と deep_accessed）
1.9  前の形（deep_accessed）の行も、深掘りとして数える
```

**実描画**（`test/render/next.mjs`）:

```text
深掘りを開くと、計測が 1 本だけ飛ぶ（page_load・画面 deep・⚠ 入口 link）
```

**入口の固定は、この変更の条件そのもの。**
`entry_point` が落ちたら、`deep_accessed` を消した意味が変わる。
