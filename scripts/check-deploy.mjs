// 出した v0.1.0 が、⚠ **本当にその内容で配られているか**を見る（`docs/adr/0070`）。
//
// ⚠ **「デプロイが成功した」は、⚠ 「出ている」ではない**（`CLAUDE.md` §1）。
//   ⚠ **配った実体を取り直して、⚠ 手元と突き合わせる。**
//
// ⚠ **`/version.json` は使えない。**⚠ あれは β 版の仕組みで、⚠ `public/` は持たない
//   （`docs/adr/0050`「引き継がない」）。⚠ **だから中身そのものを見る。**
//
// ⚠ **判定は `judge()` の 1 か所**。⚠ **静的検査がここを直に呼ぶ**ので、
//   ⚠ **「robots.txt は前に足されてよい」の主張が、⚠ 実際に効いているかを機械で見られる**
//   （⚠ ワークフローの中に bash で書いていたときは、⚠ 誰も確かめられなかった）。
//
// 使い方:
//   node scripts/check-deploy.mjs --origin=https://… --cb=<commit>

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "public");

// ⚠ **配られないもの。**⚠ **Cloudflare が読み取って消費するので、⚠ URL としては 404 になる**
//   （⚠ 実測 2026-08-29: `konjaku.hidetzu.work/_headers` は 404）。
//   ⚠ **取れないことを「届いていない」と読むと、⚠ 嘘になる**（`CLAUDE.md` §1）。
export const NOT_SERVED = new Set(["_headers", "_redirects"]);

// ⚠ **前に足されることを許すもの。**⚠ **理由を必ず添える**（⚠ 空の許可を作らない）。
export const PREPENDED = new Map([
  ["robots.txt",
    "⚠ Cloudflare の Managed robots.txt が前に挿入される（zone 全体の設定で、こちらからは外せない）。"
    + "⚠ 検索よけは 2026-09-01 に外した（docs/adr/0080）"],
]);

/**
 * 1 ファイル分の判定。
 * ⚠ **`served` が `null` は「取れなかった」。**⚠ **「無い」と区別する**（`CLAUDE.md` §1）。
 * ⚠ 中身は latin1 で持つ（⚠ 1 バイト単位で比べるため）。
 */
export function judge(rel, local, served) {
  if (served === null) {
    return { ok: false, why: "⚠ 取れなかった（⚠ これは「配られていない」の証明ではない）" };
  }
  const allow = PREPENDED.get(rel);
  if (allow) {
    return served.includes(local)
      ? { ok: true, why: `手元の中身が丸ごと入っている（前に足されたぶんは許す。${allow}）` }
      : { ok: false, why: "⚠ 手元の中身が、配られたものの中に無い" };
  }
  return local === served
    ? { ok: true, why: "1 バイトも違わない" }
    : { ok: false, why: "⚠ 中身が違う" };
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(relative(DIR, p).split("\\").join("/"));
  }
  return out.sort();
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    // ⚠ `/index.html` は `/` へ送られる。⚠ **追わないと本文が空で返る**
    //   （⚠ 実測 2026-08-29: ⚠ 空文字を「本番の中身」として読んでいた）
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("latin1");
  } catch {
    return null;
  }
}

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const origin = (arg("origin") ?? "").replace(/\/+$/, "");
  // ⚠ **付けないと、⚠ 端の古い写しを「いまの本番」と読みうる**
  const cb = arg("cb") ?? String(Date.now());
  if (!origin) {
    console.error("⚠ --origin=https://… が要る");
    process.exit(2);
  }

  const all = await walk(DIR);
  const targets = all.filter((f) => !NOT_SERVED.has(f));
  const skipped = all.filter((f) => NOT_SERVED.has(f));
  // ⚠ **走者が 1 行目で名乗る**（`CLAUDE.md` §9。⚠ 数は走者が出す）
  console.log(`出したものの照合: ${targets.length} ファイル（${origin}）`
    + (skipped.length ? ` ／ 配られない ${skipped.length}: ${skipped.join(" ")}` : ""));
  if (!targets.length) {
    console.error("⚠ 照合するファイルが 1 つも無い（⚠ この検査は何も見ていない）");
    process.exit(1);
  }

  let ng = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    ng = [];
    for (const rel of targets) {
      const local = (await readFile(join(DIR, rel))).toString("latin1");
      const served = await fetchText(`${origin}/${rel}?cb=${cb}`);
      const v = judge(rel, local, served);
      if (!v.ok) ng.push(`${rel}: ${v.why}`);
    }
    if (!ng.length) {
      console.log(`${targets.length} ファイルとも通った（${origin} は、この commit の public/ と同じ）`);
      return;
    }
    console.log(`⚠ ${attempt} 回目で通らなかったもの（${ng.length} 件）:`);
    for (const l of ng) console.log(`    ${l}`);
    if (attempt < 3) {
      console.log("15 秒待って取り直す");
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  console.log("⚠ 3 回とも通らなかった。⚠ **出したはずのものが、⚠ 届いていない**");
  console.log("⚠ 伝播の遅れではないかもしれない。⚠ Cloudflare 側で中身を足す・書き換える設定が");
  console.log("⚠ 増えていないかを見る（⚠ robots.txt では実際にそれが起きた。ADR 0070）");
  process.exit(1);
}

// ⚠ **静的検査は `judge()` だけを借りる。**⚠ **読み込んだだけで外へ出ないようにする。**
if (process.argv[1] && process.argv[1].endsWith("check-deploy.mjs")) await main();
