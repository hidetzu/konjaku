// 取り込んだものを貯める箱。
//
// ⚠ ここは「正」であって、配信するものではない。配信は書き出した静的 JSON。
//   読みに Worker を通すと 1表示 = 1呼び出しになり、せっかく 2件に畳んだ /t と
//   同じ桁の負荷が読み取りだけで乗る。
//
// ⚠ D1 は計測専用のまま。ここは手元の SQLite（git には入れない）。
//   配信と手元の計算を分ける。
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const DB_PATH = process.env.KONJAKU_DB ?? ".data/konjaku.db";

export const SCHEMA = `
-- 「もの」。駅・橋・学校・施設など、年が分かっている点
CREATE TABLE IF NOT EXISTS feature (
  id           TEXT PRIMARY KEY,          -- "wd:Q123" / "seed:toyosu-001"
  source       TEXT NOT NULL,             -- wikidata | osm | seed
  source_url   TEXT NOT NULL,             -- ⚠ 必須。出典の無いものは1件も入れない
  retrieved_at TEXT NOT NULL,
  label        TEXT NOT NULL,             -- 日本語名。無いものは入れない（Q番号は読めない）
  kind         TEXT NOT NULL,
  lon REAL NOT NULL, lat REAL NOT NULL,
  -- ⚠ 年は幅で持つ。1936–42 の写真と突き合わせるので、点で持つと嘘になる
  year_from    INTEGER,
  year_to      INTEGER,                   -- NULL = 分かっていない（≠ まだ在る）
  precision    TEXT NOT NULL DEFAULT 'year',   -- year | decade | century
  note         TEXT,
  note_url     TEXT,
  verified     INTEGER NOT NULL DEFAULT 0,
  dropped_at   TEXT,                      -- 上流から消えた日。行は消さない
  z14x INTEGER NOT NULL, z14y INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_feature_tile ON feature (z14x, z14y);
CREATE INDEX IF NOT EXISTS ix_feature_year ON feature (year_from, year_to);

-- ⚠ **見た範囲**の記録。索引はこれから作る。
--   feature の分布から索引を作っていたため、「1件でも落ちたタイル」が
--   「全面を調べたタイル」として索引に載っていた。実測で、索引タイルの
--   問い合わせ率は中央値 42.5%、最悪 3.6%。表示枠 33枚は **一度も問い合わせて
--   いない地面**について「記録のある変化はありません」と断定していた。
--   これは「取れなかったことを無いと言わない」（掟: 取れなかったを「無い」と言わない）の違反で、しかも
--   通信が1回も出ないぶん、通信断より静かに嘘をつく。
CREATE TABLE IF NOT EXISTS coverage (
  z14x INTEGER NOT NULL, z14y INTEGER NOT NULL,
  -- ⚠ layer は必須。索引を作るときにここを潰すと、
  --   「建物(osm)が見たタイル」が「年つきの事物(ev)も見た」ことになり、
  --   一度も訊いていない地面について断定する（実験で再現済み）。
  layer  TEXT NOT NULL,         -- ev | bld
  source TEXT NOT NULL,         -- wikidata | osm
  at TEXT NOT NULL,             -- 見た日
  n INTEGER NOT NULL,           -- 入った件数（0 でも行を書く＝「調べて0件」）
  truncated INTEGER NOT NULL,   -- 上限に当たった＝取りこぼしがあるかもしれない
  -- ⚠ 「何を訊いたか」。型の一覧や上限を変えたら、前の行は
  --   「新しい問いについては見ていない」。それを言えるようにしておく
  spec TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (z14x, z14y, layer)
);

-- 取り込みの記録。いつ・どこを・何件（再現と、古さの判断に使う）
CREATE TABLE IF NOT EXISTS ingest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL, source TEXT NOT NULL, area TEXT NOT NULL,
  n_ok INTEGER NOT NULL, n_skip INTEGER NOT NULL, note TEXT
);
`;

export function open(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// 古い coverage（layer 無し）を作り直す。既にあるものは ev として扱う
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(coverage)").all().map((c) => c.name);
  if (cols.includes("layer")) return;
  db.exec(`
    ALTER TABLE coverage RENAME TO coverage_old;
    CREATE TABLE coverage (
      z14x INTEGER NOT NULL, z14y INTEGER NOT NULL,
      layer TEXT NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL,
      n INTEGER NOT NULL, truncated INTEGER NOT NULL, spec TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (z14x, z14y, layer));
    INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated,spec)
      SELECT z14x,z14y,'ev',source,at,n,truncated,'' FROM coverage_old;
    DROP TABLE coverage_old;`);
  console.log("coverage に layer を足しました（既存は ev として引き継ぎ）");
}

// タイルの四隅。⚠ 取り込みはこの矩形で回す。
//   seed の「中心から N km」で回すと、タイル境界と合わず、
//   「見た範囲」と「索引の単位」がずれる（それが上の違反の原因だった）
export function tileBounds(x, y, z) {
  const n = 2 ** z;
  const lon = (X) => X / n * 360 - 180;
  const lat = (Y) => { const t = Math.PI - 2 * Math.PI * Y / n;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t))); };
  return { w: lon(x), e: lon(x + 1), n: lat(y), s: lat(y + 1) };
}

// 経緯度 → タイル座標
export function tileOf(lon, lat, z) {
  const n = 2 ** z, r = lat * Math.PI / 180;
  return { x: Math.floor((lon + 180) / 360 * n),
           y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
}

// 今回返ってこなかったものに「上流から消えた」印を立ててよいか。
// ⚠ 上限に当たった回答は、全部を見た回答ではない。返ってこなかったのは
//   「消えた」ではなく「切られた」かもしれないので、そのタイルでは何も落とさない。
//   ここを間違えると、密な土地ほど生きているものが束から静かに抜ける。
export function toDrop(wasHere, alive, truncated) {
  if (truncated) return [];
  return wasHere.filter((id) => !alive.has(id));
}
