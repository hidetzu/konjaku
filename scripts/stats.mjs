// 計測を読む（2026-09-06。Owner 判断）。
//
// ⚠ **手元から wrangler を叩いて、⚠ 集計を出すだけ。**
//   ⚠ **git に数字は上がらない**（⚠ 出すのは画面へ。⚠ 残したいときは `--out=tmp/…`）。
//   ⚠ **新しい鍵も、⚠ 新しい口も作らない**（⚠ Owner の wrangler ログインをそのまま使う）。
//   ⚠ **だから「Owner だけが見られる」は、⚠ Cloudflare の権限がそのまま守る。**
//
// ⚠ **ダッシュボードは作らない**（2026-09-06。Owner 判断）。
//   ⚠ **本番の Worker に読み出しの口を足すと、⚠ 攻撃面と Runtime 依存が増える**
//     （`CLAUDE.md` §3）。⚠ **見る人 1 人・週 1 回には重い。**
//
// ## 使い方
//
//   npm run stats                    ⚠ 直近 14 日
//   npm run stats -- --days=30       ⚠ 期間を変える
//   npm run stats -- --out=tmp/x.txt ⚠ 画面と同じものを書き出す（⚠ tmp/ は追跡外）
//   npm run stats -- --sql           ⚠ 打つ SQL を出すだけ（⚠ 叩かない）
//
// ⚠ **出さないもの: リピーター率。**⚠ **訪問の印は 1 日で消えるので、⚠ 測れない**
//   （`docs/adr/0102`）。⚠ **測れないものを出さない**（`CLAUDE.md` §1）。
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const arg = (k, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d);
};
const DAYS = Number(arg("days", 14));
const OUT = arg("out", null);
const SQL_ONLY = arg("sql", false);
const DB = "konjaku";

// ⚠ **問いごとに 1 本。**⚠ **1 つの SQL に詰め込まない**（⚠ 何を見ているか読めなくなる）。
const 問い = [
  {
    見出し: "1. 日ごとの本数",
    説明: "その日に何が何回起きたか。⚠ 人数ではない（同じ人が 5 回でも 5 と出る）",
    sql: `SELECT created_at AS 日, event_type AS 出来事, COUNT(*) AS n
          FROM events_simple WHERE created_at >= date('now', '-${DAYS} days')
          GROUP BY 1, 2 ORDER BY 1 DESC, n DESC`,
  },
  {
    見出し: "2. どこから来たか",
    説明: "?from= があればそれ、無ければ来た相手を列挙の名前へ畳んだもの",
    sql: `SELECT created_at AS 日, referrer AS 流入元,
                 COUNT(DISTINCT session_id) AS 訪問, COUNT(*) AS 本数
          FROM events_simple WHERE created_at >= date('now', '-${DAYS} days')
          GROUP BY 1, 2 ORDER BY 1 DESC, 訪問 DESC`,
  },
  {
    見出し: "3. どこまで進んだか（訪問の数）",
    説明: "⚠ 端末をまたぐと別の訪問になる。⚠ スマホで調べて PC で深掘りは、2 つに割れる",
    sql: `SELECT referrer AS 流入元,
                 COUNT(DISTINCT session_id) AS 訪問,
                 COUNT(DISTINCT CASE WHEN event_type='map_opened'    THEN session_id END) AS 調べた,
                 COUNT(DISTINCT CASE WHEN event_type='detail_view'   THEN session_id END) AS くわしく,
                 COUNT(DISTINCT CASE WHEN event_type='deep_accessed' THEN session_id END) AS 深掘り,
                 COUNT(DISTINCT CASE WHEN event_type='save_place'    THEN session_id END) AS 保存,
                 COUNT(DISTINCT CASE WHEN event_type='shared'        THEN session_id END) AS 共有
          FROM events_simple WHERE created_at >= date('now', '-${DAYS} days')
          GROUP BY 1 ORDER BY 訪問 DESC`,
  },
  {
    見出し: "4. どの入口から場所が決まったか",
    説明: "⚠ link は共有リンクで開かれたもの。⚠ 仮説（スマホ → 共有 → PC）はここに出る",
    sql: `SELECT created_at AS 日, event_type AS 出来事, entry_point AS 入口, COUNT(*) AS n
          FROM events_simple
          WHERE created_at >= date('now', '-${DAYS} days') AND entry_point IS NOT NULL
          GROUP BY 1, 2, 3 ORDER BY 1 DESC, n DESC`,
  },
  {
    見出し: "5. どの画面が開かれたか",
    説明: "page_load の metadata から",
    sql: `SELECT created_at AS 日, json_extract(metadata, '$.page') AS 画面, COUNT(*) AS n
          FROM events_simple
          WHERE created_at >= date('now', '-${DAYS} days') AND metadata IS NOT NULL
          GROUP BY 1, 2 ORDER BY 1 DESC, n DESC`,
  },
];

// ⚠ **見た目の幅で数える。**⚠ **日本語は 2 幅**（⚠ 字数で数えると、⚠ 見出しと中身がずれる。
//   ⚠ 実際にずれた: 2026-09-06。⚠ 「出来事」を 6 幅と数えて、⚠ 罫線だけ短かった）。
const 見た目の幅 = (s) => [...String(s)]
  .reduce((n, c) => n + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(c) ? 2 : 1), 0);
const 詰める = (s, w) => String(s) + " ".repeat(Math.max(0, w - 見た目の幅(s)));

const 表にする = (rows) => {
  if (!rows.length) return "  （0 件）";
  const 列 = Object.keys(rows[0]);
  const 幅 = 列.map((k) => Math.max(見た目の幅(k),
    ...rows.map((r) => 見た目の幅(r[k] ?? "-"))));
  const 行 = (v) => "  " + 列.map((k, i) => 詰める(v[k] ?? "-", 幅[i])).join("  ");
  return [行(Object.fromEntries(列.map((k) => [k, k]))),
          "  " + 幅.map((w) => "-".repeat(w)).join("  "),
          ...rows.map(行)].join("\n");
};

const 打つ = (sql) => {
  const out = execFileSync("npx", ["--yes", "wrangler", "d1", "execute", DB, "--remote", "--json",
    "--command", sql.replace(/\s+/g, " ")], { encoding: "utf8", maxBuffer: 1 << 24 });
  // ⚠ **`--json` でも前後に飾りが混じることがある。**⚠ **`[` から後ろだけ読む。**
  const i = out.indexOf("[");
  if (i < 0) throw new Error(`wrangler の返りを読めない: ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(i))[0]?.results ?? [];
};

// ⚠ **検査から呼べるようにする**（⚠ 幅の計算は、⚠ 目でしか分からないので数で固定する）。
//   ⚠ **叩く側（wrangler）は呼ばない。**⚠ **本番の DB を検査が触らない。**
export const __test = { 見た目の幅, 詰める, 表にする };

// ⚠ **直に走らせたときだけ、⚠ 実際に叩く。**
//   ⚠ **`import` しただけで wrangler を呼ばない**（⚠ 検査が本番の DB を触りに行く）。
//   ⚠ **実際に踏んだ**（2026-09-06。⚠ 検査から読もうとして、⚠ 本体が走った）。
const 直に走らせた = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (直に走らせた) {

  const 束 = [`計測（直近 ${DAYS} 日 ／ ${new Date().toISOString().slice(0, 10)} 時点）`, ""];
  for (const q of 問い) {
    if (SQL_ONLY) { 束.push(`-- ${q.見出し}`, q.sql.replace(/\s+/g, " "), ""); continue; }
    束.push(q.見出し, `  ${q.説明}`, "");
    try { 束.push(表にする(打つ(q.sql))); }
    catch (e) { 束.push(`  ⚠ 読めなかった: ${String(e.message).slice(0, 200)}`); }
    束.push("");
  }
  if (!SQL_ONLY) {
    // ⚠ **測っていないことを、⚠ 出さない**（`CLAUDE.md` §1）。
    束.push("⚠ 出していないもの",
      "  リピーター率  訪問の印は 1 日で消えるので、⚠ 「昨日も来た人」は数えられない",
      "  どこを調べたか  座標も町名も残していない",
      "  何時に見たか    日までしか持っていない", "");
  }
  const 文 = 束.join("\n");
  console.log(文);
  if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, 文 + "\n"); console.log(`⚠ 書き出した: ${OUT}`); }
}
