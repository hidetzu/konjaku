// Service Worker の版を、キャッシュ対象の中身から振り直す。
//
//   npm run stamp
//
// public/ の SHELL 対象を触ったら、コミット前にこれを走らせる。
// 忘れても `npm run check`（＝CI）が落とすので、本番に古い版が出ることはない。
// なぜ手で番号を振るのをやめたかは scripts/sw-hash.mjs の頭に書いてある。

import { writeFile } from "node:fs/promises";
import { SW, VERSION_RE, hashOf, readSw } from "./sw-hash.mjs";

const sw = await readSw();
const want = await hashOf(sw);
const now = sw.match(VERSION_RE)?.[1];

if (now === undefined) {
  console.error("sw.js の VERSION を読めなかった。書き方を変えたなら sw-hash.mjs も直す");
  process.exit(1);
}
if (now === want) {
  console.log(`\n  konjaku-${want} のままで正しい（SHELL の中身は変わっていない）\n`);
  process.exit(0);
}

await writeFile(SW, sw.replace(VERSION_RE, `const VERSION = "konjaku-${want}"`));
console.log(`\n  konjaku-${now} → konjaku-${want}\n`);
