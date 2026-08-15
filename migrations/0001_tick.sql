-- 計測。§3.11 で決めた唯一の指標「共有率」を出すためだけの表。
--
-- ⚠ 記録するのは「その日に何が何回起きたか」だけ。
--   誰が・どこを調べたかは1件も残さない（§3.13「評価は自分専用」）。
--   行を1件ずつ積むのではなく日ごとに畳むのは、貯める量を減らすためと、
--   「あとから個人を復元できる粒度を、そもそも持たない」ため。
CREATE TABLE IF NOT EXISTS tick (
  day   TEXT NOT NULL,   -- UTC の YYYY-MM-DD
  event TEXT NOT NULL,   -- judged.ok / judged.coarse / judged.none / judged.fail / shared / saved
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);

-- 依存の生死。止まっても画面は誠実に「読み込めませんでした」と言うだけで、
-- こちらには何も届かない。共有率がゼロだったとき「面白くなかった」のか
-- 「壊れていた」のかを区別できるようにする。
CREATE TABLE IF NOT EXISTS health (
  day    TEXT NOT NULL,
  target TEXT NOT NULL,   -- landform / meiji / elevation / photos / search
  ok     INTEGER NOT NULL DEFAULT 0,
  fail   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, target)
);
