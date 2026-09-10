# 0106. 索引に出す画面を絞り、robots.txt は置かない

- 日付: 2026-09-11
- 状態: 採用
- 決めた人: Owner

## 何を確かめたか

計測を読んでいて、「列挙の外から来た訪問（`other`）が 5 日で 1 件」だったので、
検索から来ていないのではないかと考えた。**そこで、まず実測した。**

実測（2026-09-11・本番へ `curl`）:

```text
GET /robots.txt      200   ⚠ 配信の側が返している（このリポジトリには無い）
                           User-agent: *
                           Content-Signal: search=yes,ai-train=no,use=reference
                           Allow: /
                           （Amazonbot / Applebot-Extended / Bytespider ほかは Disallow）
GET /sitemap.xml     404
GET /  の X-Robots-Tag     無し
```

**検索は塞がっていなかった。**`Allow: /` で、`search=yes` で、`noindex` でもない。
**「`robots.txt` が無い」と読んだのは、リポジトリの中しか見ていなかったから。**

足りていなかったのは 2 つだけだった。

```text
sitemap.xml   無い
canonical     全 HTML に 1 件も無い
```

## 決めたこと

### ① `robots.txt` は、このリポジトリに置かない（変えない）

**`public/_headers` が 2026-09-01 に決めている。**ここでもそれを守る。

配信の側が zone 全体に対して先に返しており、**こちらが置くと同じ `User-agent: *` の
塊へ連結される**（RFC 9309。同じ長さの一致では `Allow` が勝つので、`Disallow: /` を
打ち消しうる。実測 2026-08-29）。**AI の学習拒否は、あちらがまとめて持っている。**

**だから `sitemap.xml` の在りかを `robots.txt` からは知らせない。**
Search Console に直接登録する形になる（人の作業）。

### ② `canonical` は、読み物として成立する 4 画面にだけ置く

```text
置く      /  /about  /privacy  /terms
置かない  /deep  /saved  /take
```

**`/` と `/deep` はクエリで場所が変わる**（`?q=` `?ll=`）。
**場所ごとのページを静的に配ってはいない**ので、変種を索引へ増やしても中身が無い。
だから `/` は素の URL を正本にする。

**`/deep` `/saved` `/take` は、場所や控えが無いと成立しない画面。**
素の URL を「この画面の正本」と名乗れない。**だから置かない。**

### ③ `sitemap.xml` は、`canonical` と同じ顔ぶれ

**`lastmod` / `changefreq` / `priority` は書かない。**
どれも任意の項目で、**手で書くと必ず古くなる**。
分からないことを、分かっているように書かない（`CLAUDE.md` §1）。

## 一覧が 2 か所にある問題

**`canonical` と `sitemap.xml` は、同じ問いに 2 か所で答えている**（`CLAUDE.md` §3）。
**やむを得ず持つので、機械で突き合わせる。**

`test/check/claim.mjs` が見るもの:

```text
canonical を持つ画面   その値が og:url と一致するか
/deep /saved /take     canonical を置いていないか
sitemap の <loc>       canonical を持つ画面と、⚠ 多くも少なくもないか
```

**突き合わせる相手は、別の道で得たものにする**（`CLAUDE.md` §9）。
片方を数えるのではなく、**両方の一覧そのものを突き合わせている。**

**わざと壊して、3 通りとも落ちることを確かめた**（2026-09-11）。

```text
sitemap から 1 行消す        → sitemap に無い、と落ちる
/deep に canonical を置く    → 成立しない画面に置いている、と落ちる
canonical を og:url とずらす → 割れている、と落ちる
```

**この検査は「配信の側がいま何を返すか」を主張しない**（`CLAUDE.md` §9）。
`robots.txt` を置いていないことも、ここでは見ない。**外の答えは、こちらの正しさではない。**

## これで何が変わるか（⚠ まだ何も変わっていない）

**索引に載るかどうかは、こちらでは決められない。**
やったのは「載せたい画面を名指しできるようにした」ことだけ。
**効いたかどうかは、`other` からの訪問が増えるかで、後から分かる。**
いまは 5 日で 1 件（分母は訪問 42）。
