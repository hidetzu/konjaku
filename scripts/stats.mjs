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

// ⚠ **訪問の入口**（2026-09-08。`docs/adr/0103`）。
//
// ⚠ **`referrer` 列が持っているのは「その画面を開いた直前の出どころ」で、⚠ 訪問の入口ではない。**
//   ⚠ **流入元は画面ごとに読み込み時 1 回決まる**（`public/measure-send.js`）。⚠ **判定は
//     「その URL の `?from=`」と「`document.referrer` のホスト名」だけ**（`public/measure.js`）。
//   ⚠ **サイト内リンクは `?from=` を運ばない**ので、⚠ **`about?from=app-village` から地図へ進むと、
//     ⚠ 2 行目からは `konjaku` になる**（⚠ 実測 2026-09-08）。
//
// ⚠ **行のまま流入元で束ねると、⚠ 同じ訪問が 2 つの流入元へ割れる。**
//   ⚠ **`app-village` の行は「訪問 1・調べた 0・深掘り 0」に見える。**
//   ⚠ **「app-village から来た人は誰も地図を使っていない」と読める**（`CLAUDE.md` §1
//     「観測されていない ≠ 存在しなかった」）。⚠ **数え落としではなく、⚠ 嘘になる。**
//
// ⚠ **だから、⚠ 訪問（`session_id`）の最初の行の `referrer` を、⚠ その訪問の入口とする。**
//   ⚠ **記録の側は変えない**（⚠ 列の意味は「その画面の直前の出どころ」のまま。
//     ⚠ 送る側で畳むと、⚠ 同じ列に 2 つの意味が混ざる期間ができる）。
//   ⚠ **これは既にある行にも遡って効く。**
//
// ⚠ **定義はここ 1 か所**（`CLAUDE.md` §3。⚠ **問いごとに書くと、⚠ 片方だけ古くなる**）。
// ⚠ **印を置けなかった行（`session_id` が無い）は結べない。**⚠ **問い 6 が本数を名乗る。**
//   ⚠ **黙って落とすと、⚠ 落とした分だけ全体が小さく見える**（`CLAUDE.md` §1）。
//   ⚠ **下の `IS NOT NULL` は、⚠ 消しても答えは変わらない**（⚠ 守っているのは `JOIN` のほう。
//     ⚠ `NULL` は結ばれない）。⚠ **書いてあるのは意図。**⚠ **わざと消して確かめた。**
//
// ⚠ **SQL の中に `--` のコメントを書かない**（⚠ 実際に踏んだ。2026-09-08）。
//   ⚠ **`打つ()` が `\s+` を 1 つの空白へ潰して 1 行にするので、⚠ `--` から後ろが全部消える。**
//   ⚠ **「incomplete input」とだけ言われる。**⚠ **説明は、⚠ この JavaScript 側のコメントに書く。**
const 入口 = `WITH 訪問の入口 AS (
                 SELECT session_id, referrer FROM (
                   SELECT session_id, referrer,
                          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id) AS 番
                   FROM events_simple
                   WHERE created_at >= date('now', '-${DAYS} days') AND session_id IS NOT NULL
                 ) WHERE 番 = 1
               )`;

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
    見出し: "2. どこから来たか（⚠ 訪問の入口で結ぶ）",
    説明: "?from= があればそれ、無ければ来た相手を列挙の名前へ畳んだもの。⚠ 2 行目以降が konjaku に化けても、入口のまま数える",
    sql: `${入口}
          SELECT e.created_at AS 日, i.referrer AS 流入元,
                 COUNT(DISTINCT e.session_id) AS 訪問, COUNT(*) AS 本数
          FROM events_simple e JOIN 訪問の入口 i ON i.session_id = e.session_id
          WHERE e.created_at >= date('now', '-${DAYS} days')
          GROUP BY 1, 2 ORDER BY 1 DESC, 訪問 DESC`,
  },
  {
    見出し: "3. どこまで進んだか（訪問の数）",
    // ⚠ **「くわしく」は、⚠ 段に出さない**（2026-09-11。`docs/adr/0105`）。
    //   ⚠ **`.fold` は 700px 以上だと最初から開いている**（`public/top.css` の `@media`）。
    //   ⚠ **`detail_view` は押したときだけ飛ぶ**（`public/top.js`）ので、⚠ **広い画面では 1 本も出ない。**
    //   ⚠ **訪問を分母にして他の段と並べると、⚠ 「読まれなかった」に読める**（`CLAUDE.md` §1）。
    //   ⚠ **本数は問い 1 に出ている。**⚠ **消してはいない。**⚠ **段として使わないだけ。**
    // ⚠ **深掘りは 2 通りの記録から数える**（2026-09-08。`docs/adr/0104`）。
    //   ⚠ **いまは `page_load`（page: deep）。**⚠ **2026-09-08 より前は `deep_accessed`。**
    //   ⚠ **片方だけにすると、⚠ その日を境に深掘りが 0 になる**（⚠ 起きたことが消える。`CLAUDE.md` §1）。
    説明: "⚠ 流入元は訪問の入口。⚠ 端末をまたぐと別の訪問になる。⚠ スマホで調べて PC で深掘りは、2 つに割れる。⚠ くわしくは段に出さない（下の「出していないもの」）",
    sql: `${入口}
          SELECT i.referrer AS 流入元,
                 COUNT(DISTINCT e.session_id) AS 訪問,
                 COUNT(DISTINCT CASE WHEN e.event_type='map_opened'    THEN e.session_id END) AS 調べた,
                 COUNT(DISTINCT CASE WHEN e.event_type='deep_accessed'
                                       OR (e.event_type='page_load'
                                           AND json_extract(e.metadata, '$.page')='deep')
                                     THEN e.session_id END) AS 深掘り,
                 COUNT(DISTINCT CASE WHEN e.event_type='save_place'    THEN e.session_id END) AS 保存,
                 COUNT(DISTINCT CASE WHEN e.event_type='shared'        THEN e.session_id END) AS 共有
          FROM events_simple e JOIN 訪問の入口 i ON i.session_id = e.session_id
          WHERE e.created_at >= date('now', '-${DAYS} days')
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
    // ⚠ **「page_load の metadata から」と書いていたが、⚠ 事実と違った**（2026-09-08）。
    //   ⚠ **SQL は `event_type` で絞っていない。**⚠ **どの記録から来た名前かを、⚠ 表に出す**
    //     （⚠ 説明だけで補わない。`CLAUDE.md` §1）。
    //   ⚠ **いまは `/deep` も `page_load` が名乗る**（`docs/adr/0104`）。
    //     ⚠ **2026-09-08 より前の deep は `deep_accessed` が名乗っている**（⚠ 表の 出来事 に出る）。
    説明: "画面の名を持つ記録から。⚠ 2026-09-08 より前の deep は deep_accessed が名乗っている",
    sql: `SELECT created_at AS 日, json_extract(metadata, '$.page') AS 画面,
                 event_type AS 出来事, COUNT(*) AS n
          FROM events_simple
          WHERE created_at >= date('now', '-${DAYS} days') AND metadata IS NOT NULL
          GROUP BY 1, 2, 3 ORDER BY 1 DESC, n DESC`,
  },
  {
    見出し: "6. 印を置けなかった行（⚠ 2 と 3 に入っていない分）",
    説明: "端末の中に印を置けないと（プライベートモードなど）、⚠ 訪問として結べない。⚠ ここに出る分は、上の 2 つに出ていない",
    sql: `SELECT created_at AS 日, referrer AS 行の出どころ, event_type AS 出来事, COUNT(*) AS 本数
          FROM events_simple
          WHERE created_at >= date('now', '-${DAYS} days') AND session_id IS NULL
          GROUP BY 1, 2, 3 ORDER BY 1 DESC, 本数 DESC`,
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

// ⚠ **読めなかったときは、⚠ 理由を先に出す**（2026-09-08。⚠ 実際に踏んだ）。
//
// ⚠ **`execFileSync` の `e.message` は、⚠ `Command failed: npx … --command <SQL 全文>` で始まる。**
//   ⚠ **前から 200 字で切ると、⚠ ほとんどを SQL が占め、⚠ 肝心の理由が押し出される。**
//   ⚠ **実際に踏んだ**: ⚠ **5 本のうち 1 本目だけ落ちたのに、⚠ 何が起きたのか読めなかった。**
//
// ⚠ **見るのは `stderr`**（⚠ wrangler はそちらに理由を書く）。
//   ⚠ **無ければ、⚠ コマンド行を落とした残り。**⚠ **それも無ければ、⚠ 末尾を出す**
//     （⚠ 頭はコマンド。⚠ **理由があるとすれば後ろ**）。
// ⚠ **「読めなかった」と「理由が返っていない」を混ぜない**（`CLAUDE.md` §1）。
const 読めなかった理由 = (e, 上限 = 300) => {
  const 行 = `${e?.stderr ?? ""}\n${e?.message ?? ""}`.split("\n")
    .map((x) => x.trim())
    .filter((x) => x && !/^Command failed:/.test(x));
  const 文 = [...new Set(行)].join(" ／ ");
  if (文) return 文.slice(0, 上限);
  const 素 = String(e?.message ?? e ?? "");
  return 素 ? `理由が返っていない（末尾だけ出す）: …${素.slice(-上限)}` : "理由が返っていない";
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
export const __test = { 見た目の幅, 詰める, 表にする, 入口, 問い, 読めなかった理由 };

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
    catch (e) { 束.push(`  ⚠ 読めなかった: ${読めなかった理由(e)}`); }
    束.push("");
  }
  if (!SQL_ONLY) {
    // ⚠ **測っていないことを、⚠ 出さない**（`CLAUDE.md` §1）。
    束.push("⚠ 出していないもの",
      "  リピーター率  訪問の印は 1 日で消えるので、⚠ 「昨日も来た人」は数えられない",
      "  くわしくの率  ⚠ 広い画面では最初から開いているので、⚠ 押した数を訪問で割れない（⚠ 本数は 1 に出る）",
      "  どこを調べたか  座標も町名も残していない",
      "  何時に見たか    日までしか持っていない",
      "  印の無い行の道のり  ⚠ 訪問として結べないので、⚠ 2 と 3 には出ない（⚠ 本数だけ 6 に出る）", "");
  }
  const 文 = 束.join("\n");
  console.log(文);
  if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, 文 + "\n"); console.log(`⚠ 書き出した: ${OUT}`); }
}
