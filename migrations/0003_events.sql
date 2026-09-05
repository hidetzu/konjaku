-- 計測（2026-09-06。Owner 判断）。
--
-- ⚠ どこから来た人が、どこまで進み、どこでやめたかを見えるようにするためだけの表。
--
-- ⚠ 残さないもの:
--   座標・町名   1 件も残さない（どこを調べたかは分からない）
--   user-agent   残さない（端末の見分けはしない）
--   時刻         日までしか持たない（何時に見たかは残らない）
--   IP           保存しない。ただし通信は Cloudflare を通るので、
--                基盤が接続元 IP を扱うことは避けられない（「使わない」とは書かない）
--
-- ⚠ session_id は端末の中で作った印で、日が変わると別の印になる。
--   だから「昨日も来た人」は数えられない。数えられないものを数えたと言わない。
CREATE TABLE IF NOT EXISTS events_simple (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,   -- UTC の YYYY-MM-DD（⚠ 日まで。時刻は持たない）
  referrer    TEXT,            -- app-village / tsukutta.app / konjaku / other / direct
  session_id  TEXT,            -- 端末の中で作った印。1 日で別のものになる
  event_type  TEXT NOT NULL,   -- page_load / map_opened / detail_view / deep_accessed / save_place / shared
  entry_point TEXT,            -- default / link / map / search / here
  metadata    TEXT             -- JSON。いまは { "page": "about" } だけ
);

-- 日ごとに数えるので、日と種類で引く。
CREATE INDEX IF NOT EXISTS idx_events_day      ON events_simple(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type     ON events_simple(created_at, event_type);
CREATE INDEX IF NOT EXISTS idx_events_referrer ON events_simple(created_at, referrer);
CREATE INDEX IF NOT EXISTS idx_events_session  ON events_simple(session_id);
