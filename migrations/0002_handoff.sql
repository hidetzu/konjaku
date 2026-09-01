-- ⚠ **合言葉で荷物を手渡すための表**（`docs/sync-api.md` §5 / `docs/adr/0072`）。
--
-- ⚠ **β 版の DB（`konjaku`）には作らない。**⚠ **v0.1.0 の DB（`konjaku-next`）に作る**
--   （`docs/adr/0050`。⚠ **`tick` と混ざると分母が壊れる**。`CLAUDE.md` §6）。
--
-- ⚠ **1 つの荷物が 1 行。**⚠ **場所ごとの行を作らない**（`docs/sync-api.md` §5）。
--   ⚠ 検索しない／数えない／2 か所に判断を置かない、の 3 つが理由。

CREATE TABLE IF NOT EXISTS handoff (
  -- ⚠ **合言葉そのものは置かない**（`docs/sync-api.md` §3）。⚠ SHA-256 の 16 進。
  --   ⚠ **DB が漏れても、⚠ 期限内の荷物を引き出す鍵にはならない。**
  code_hash  TEXT    PRIMARY KEY,
  -- ⚠ **保存した場所の一覧を、⚠ `toText` が詰めた字**（⚠ **座標が入っている**）。
  --   ⚠ **サーバはこれを解かない**（`docs/adr/0071`）。⚠ 預かって返すだけ。
  payload    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,   -- ⚠ ミリ秒
  expires_at INTEGER NOT NULL    -- ⚠ ミリ秒
);

-- ⚠ **期限で引くのは、⚠ 書き込みのついでの掃除だけ**（`docs/sync-api.md` §4）。
--   ⚠ **Cron は置いていない。**⚠ **だから「消えます」とは言わない。**
CREATE INDEX IF NOT EXISTS handoff_expires ON handoff(expires_at);

-- ⚠ **試行回数の制限**（`docs/adr/0072` が MUST にしている。RFC 8628 が名指しで求めている）。
--   ⚠ **8 文字の合言葉が総当たりされない前提は、⚠ ここが在ることで初めて成り立つ。**
--   ⚠ **これが無いと、⚠ ADR に書いた確率の数字が意味を失う。**
--
-- ⚠ **接続元そのものは置かない。**⚠ **`SHA-256(接続元 + 窓の開始時刻)` だけを置く**
--   （⚠ 逆は引けない。⚠ **誰が試したかは、⚠ この表からは分からない**）。
--   ⚠ **β 版の Worker と同じ立場**（⚠ IP は保存せず、⚠ 利用者の識別にも使わない）。
CREATE TABLE IF NOT EXISTS handoff_attempt (
  bucket     TEXT    PRIMARY KEY,
  tries      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL    -- ⚠ ミリ秒。⚠ 窓が終わる時刻
);

CREATE INDEX IF NOT EXISTS handoff_attempt_expires ON handoff_attempt(expires_at);
