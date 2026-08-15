// Service Worker の版を、キャッシュ対象の中身から決める。
//
// ⚠ なぜ手で番号を振るのをやめたか。
//   `sw.js` の VERSION はキャッシュのキーそのもので、上げないと
//   **一度来た人に古い `/` と `/share.js` が出続ける**。
//   しかも見落としても CI は全部通る（静的検査も実描画もローカルのファイルを見るので、
//   キャッシュの話が視界に入らない）。「変えたのに数字が動かない」という、
//   いちばん診断しづらい壊れ方をする。流入を測り始める直前に一度踏みかけた。
//
//   版を中身のハッシュにすれば、**上げ忘れという操作自体が存在しなくなる**。
//   人が読める通し番号は失うが、その番号はどこでも使っていない。
//
// 使う側は2つ:
//   scripts/stamp-sw.mjs … 書き込む（npm run stamp）
//   scripts/check.mjs    … 古ければ落とす（npm run check → CI）

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUB = join(ROOT, "public");

export const SW = join(PUB, "sw.js");
export const VERSION_RE = /const VERSION = "konjaku-([^"]*)"/;

// SHELL の URL を public/ の実ファイルに戻す。
// 本番は拡張子なしへ転送されるので（check の「3. 内部リンク」参照）、
// "/" と "/peel" はそれぞれ index.html / peel.html を指している。
export function fileOf(p) {
  if (p === "/") return join(PUB, "index.html");
  const rel = p.replace(/^\//, "");
  return join(PUB, /\.[a-z0-9]+$/i.test(rel) ? rel : `${rel}.html`);
}

export function shellOf(sw) {
  const m = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) throw new Error("sw.js の SHELL を読めなかった（書き方を変えたなら sw-hash.mjs も直す）");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// ⚠ `sw.js` 自体は SHELL に入っていないので、ハッシュの材料にも入らない。
//   入れると VERSION を書いた瞬間にハッシュが変わって、永久に一致しない。
//   ブラウザは sw.js をバイト比較で取り直すので、そもそも版に含める必要がない。
//
// ⚠ 一覧そのものも材料に混ぜる。SHELL から1行消しただけのときも
//   版が変わらないと、古いキャッシュに残った分が activate で消えない。
// ⚠ **SHELL 以外にも、版の材料に入れるもの。**
//   /vendor/ は SHELL に入っていない（1 MB あるので、判定しか見ない人に乗せない）。
//   だが SW の網は取ったあと版のキャッシュに入れる。**版が変わらないと、そこが
//   古いままになる**。実ファイル名は maplibre-gl.js で固定なので、名前でも見分けられない。
//   ⚠ ここに入れておけば、MapLibre を上げた時点で版が変わり、古いものが消える。
//   ⚠ 入れる代償: vendor を上げると SHELL のキャッシュも捨てて取り直す（7 ファイル・小さい）。
const EXTRA = ["vendor/maplibre-gl.js", "vendor/maplibre-gl.css"];

export async function hashOf(sw) {
  const shell = shellOf(sw);
  // ⚠ 一覧に EXTRA も混ぜる。片方だけ足したときにも版が変わるように。
  const h = createHash("sha256").update(JSON.stringify([shell, EXTRA]));
  for (const p of shell) h.update(await readFile(fileOf(p)));
  for (const p of EXTRA) h.update(await readFile(new URL(`../public/${p}`, import.meta.url)));
  return h.digest("hex").slice(0, 8);
}

export async function readSw() {
  return readFile(SW, "utf8");
}
