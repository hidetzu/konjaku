// 実描画を走らせる（2026-08-22 に suite へ割った。hidetzu/konjaku#187）。
//
//   node scripts/render.mjs                     ⚠ 全部
//   node scripts/render.mjs --suite=peel        ⚠ 深掘りの画面だけ
//   node scripts/render.mjs --suite=top --group=core
//
// ⚠ **ケースはここに書かない**（`render/top.mjs` / `render/peel.mjs`）。
// ⚠ **道具もここに書かない**（`render/lib.mjs`）。
// ⚠ **走った suite と件数は、⚠ 出力の1行目で名乗る**（⚠ 黙って絞らない）。

import { CASES as TOP_CASES } from "./render/top.mjs";
import { CASES as PEEL_CASES } from "./render/peel.mjs";
import {
  PORT, BASE, OUT, waited, kindOfRequest,
} from "./render/lib.mjs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

// ⚠ **知らない suite を黙って無視しない**（⚠ 無視すると 0 件で緑になる）。
const SUITES = { top: TOP_CASES, peel: PEEL_CASES };
const SUITE = (process.argv.find((a) => a.startsWith("--suite=")) ?? "").split("=")[1] || null;
if (SUITE && !SUITES[SUITE]) {
  console.log(`\x1b[31m--suite=${SUITE} は無い（ある: ${Object.keys(SUITES).join(" / ")}）\x1b[0m`);
  process.exit(1);
}
const CASES = SUITE ? SUITES[SUITE] : [...TOP_CASES, ...PEEL_CASES];

// ⚠ **1件だけ回せるようにする。**
//   79 件を全部回すと 5 分近くかかる。検査を1つ足すたび、あるいは
//   「わざと壊して落ちることを確かめる」たびに全件を回していては、確認が高くつき、
//   **確かめずに済ませる誘惑が生まれる**（実際、確認1つに 5 分かけていた）。
//   ⚠ **CI と main では必ず全件を回す。** ここは手元で1件を見るためだけのもの。
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
// ⚠ **外部に寄りかかるケースだけを切り出せるようにする。**
//   `dep:"search"` は、地理院の住所検索（msearch）の応答が返ってこないと成立しない検査。
//   実測（2026-08-17）で、住所検索は速いとき 0.4 秒・遅いとき 8.2 秒だった。
//   アプリは 8 秒で中断する（掟のタイムアウト）ので、遅い回はアプリが正しく中断し、
//   候補が出ないまま検査だけが落ちる。**アプリの不具合ではなく、検査の前提が外部にある。**
//   → `--group=core` は外へ出ない（＝落ちても外部のせいにできない）ぶんだけを回す。
//     `--group=search` はその逆。CI は両方を回すが、切り分けができる。
const GROUP = process.argv.find((a) => a.startsWith("--group="))?.slice(8);
if (GROUP && !["core", "search"].includes(GROUP)) {
  console.log(`\x1b[31m--group は core か search（来たのは ${GROUP}）\x1b[0m`); process.exit(1);
}
// ⚠ **同じ群を、⚠ 何本かに分けて同時に回すための口**（2026-08-22。hidetzu/konjaku#190）。
//   ⚠ **`--shard=1/2` のように書く**（1 本目 / 全部で 2 本）。
// ⚠ **交互に配る**（`i % n`）。⚠ **前半・後半で切らない。**
//   ⚠ **実測（2026-08-22・手元）**: peel の 67 件は 0.9〜20.6 秒とばらつきが大きい。
//     ⚠ 前半・後半で切ると偏るが、⚠ 交互なら 87s / 101s に収まる。
// ⚠ **並び順に依存する。**⚠ ケースを足すと、⚠ どちらへ行くかは変わる。
//   ⚠ **それでよい。**⚠ ケースどうしは独立していて、⚠ 順番に意味は無い
//     （⚠ 意味があるなら、⚠ それは 1 つのケースにまとめるべきもの）。
const SHARD = process.argv.find((a) => a.startsWith("--shard="))?.slice(8);
let shardAt = 0, shardOf = 1;
if (SHARD) {
  const m = /^(\d+)\/(\d+)$/.exec(SHARD);
  if (!m) {
    console.log(`\x1b[31m--shard は 1/2 のように書く（来たのは ${SHARD}）\x1b[0m`); process.exit(1);
  }
  shardAt = Number(m[1]) - 1; shardOf = Number(m[2]);
  if (shardAt < 0 || shardOf < 1 || shardAt >= shardOf) {
    console.log(`\x1b[31m--shard=${SHARD} は範囲の外（1/${shardOf} 〜 ${shardOf}/${shardOf}）\x1b[0m`);
    process.exit(1);
  }
}
const RUN = CASES
  .filter((c) => !ONLY || c.name.includes(ONLY))
  .filter((c) => !GROUP || (GROUP === "search" ? c.dep === "search" : c.dep !== "search"))
  .filter((c, i) => i % shardOf === shardAt);

// ⚠ **走らせずに数だけ見る口**（`--count`）。⚠ **配線を確かめるために要る。**
//   ⚠ **数えるのは「本当に回るもの」**（⚠ 別の数え方を持たない）。
//   ⚠ **2026-08-22 まで、⚠ ここだけ別に数えていた**（`--shard` を見ておらず、
//     ⚠ **1/2 でも 67 と名乗った**）。⚠ **いまは `RUN` をそのまま数える。**
if (process.argv.includes("--count")) {
  console.log(`${SUITE ?? "全部"} ${GROUP ?? "全部"}${SHARD ? ` ${SHARD}` : ""} ${RUN.length}`);
  process.exit(0);
}
// ---- ローカルサーバ ----
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);

await new Promise((r) => setTimeout(r, 1200));

// ⚠ **自分が立てたサーバに当たっているかを、測る前に確かめる。**
//   ⚠ ポートを他人に取られていると、⚠ **相手の画面を黙って測ることになる**（上の PORT の注記）。
//   ⚠ 突き合わせるのは `public/sw.js` の VERSION。⚠ **この枝の中身から作られる値**なので、
//     ⚠ 別のワークツリーが配っていれば必ず食い違う。
{
  const local = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const want = /const VERSION\s*=\s*"([^"]+)"/.exec(local)?.[1] ?? "";
  let got = null, err = null;
  try {
    const r = await fetch(`${BASE}/sw.js`, { signal: AbortSignal.timeout(5000) });
    got = /const VERSION\s*=\s*"([^"]+)"/.exec(await r.text())?.[1] ?? "";
  } catch (e) { err = e.name; }
  if (!want) {
    console.log("\x1b[31m✗ public/sw.js の VERSION を読めない（測る相手を確かめられない）\x1b[0m");
    process.exit(1);
  }
  if (got !== want) {
    console.log(`\x1b[31m✗ ポート ${PORT} に居るのは、このワークツリーのサーバではない\x1b[0m`);
    console.log(`\x1b[31m  配られている VERSION 「${got ?? err}」／ここの public/sw.js 「${want}」\x1b[0m`);
    console.log(`\x1b[31m  ⚠ 別のワークツリーが実描画を回している可能性がある。\x1b[0m`);
    console.log(`\x1b[31m  ⚠ KONJAKU_RENDER_PORT=8199 npm run render のように、ポートをずらして回す。\x1b[0m`);
    process.exit(1);
  }
}
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let failed = 0;

if (SUITE) console.log(`\x1b[33m⚠ --suite=${SUITE}: ${CASES.length} 件だけ回す（全部ではない）\x1b[0m`);
if (ONLY || GROUP || SHARD) {
  const how = [ONLY && `--only=${ONLY}`, GROUP && `--group=${GROUP}`,
    SHARD && `--shard=${SHARD}`].filter(Boolean).join(" ");
  if (!RUN.length) { console.log(`\x1b[31m${how} に当てはまるケースが無い\x1b[0m`); process.exit(1); }
  console.log(`\x1b[33m⚠ ${how}: ${RUN.length} / ${CASES.length} 件だけ回す（全件ではない）\x1b[0m\n`);
}

let retried = 0;      // 何回やり直したか。**必ず最後に出す**（黙って再試行しない）
// ⚠ **ケースごとに「どれだけかかったか」と「外へ何本出たか」を控える**
//   （2026-08-22。hidetzu/konjaku#189）。
//   ⚠ **どこが遅いかも、⚠ どれが外部に出るかも、⚠ いままで推測でしか語れなかった。**
//   ⚠ **これは hidetzu/konjaku#190（並列化）と hidetzu/konjaku#191（外部を最小限に）の前提。**
// ⚠ **ケースの中身は 1 つも変えていない。**⚠ **外側で数えるだけ。**
const measured = [];
// ⚠ **外部とは「この検査が立てたサーバ以外」**。⚠ localhost は数えない
const OUTSIDE = (u) => /^https?:\/\//.test(u) && !u.startsWith(BASE);
for (const c of RUN) {
  // ⚠ **再試行するのは `dep` が付いたケースだけ。** 付いていないケースの失敗は、
  //   こちらの不具合なので隠さない。付いているものも **1 回だけ**。
  //   ⚠ 2 回目も落ちたら落とす。「たまに落ちる」を「落ちない」に見せかけない。
  for (let attempt = 1; attempt <= (c.dep ? 2 : 1); attempt++) {
    const again = await runCase(c, attempt);
    if (!again) break;
    retried++;
    console.log(`      \x1b[33m⟳ 再試行（${c.dep} が返らなかった可能性）\x1b[0m`);
  }
}

// 1 件を回す。落ちて、かつ**やり直す価値がある**なら true を返す
async function runCase(c, attempt) {
  // スマホ幅でしか出ない壊れ方（タップ判定）を見るケースがあるので、画面はケースごとに指定できる
  // スマホ幅でしか出ない壊れ方を見るケースは、指（hasTouch）も一緒に再現する。
  // これが無いと @media (hover:none) が効かず、タッチ端末での見え方を測れない。
  // ⚠ Service Worker を止める。
  //   SW を localhost でも登録するようにした結果、**SW が出す通信は page.route を
  //   通らない**ため、落としたはずの経路が素通りして検査が不安定になった
  //   （落ちたり通ったりする＝いずれ無視される検査になる）。
  //   ここで見たいのは画面の振る舞いで、SW の振る舞いは別に見るべきもの。
  const page = await browser.newPage({
    viewport: c.viewport ?? { width: 1200, height: 780 }, hasTouch: !!c.hasTouch,
    serviceWorkers: "block" });
  const errors = [], reqs = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // ⚠ **外部が遅いときに何が起きたかを、あとから読めるようにしておく。**
  //   `LOG_SEARCH=1 npm run render` で、住所検索の要求・応答・失敗を時刻つきで出す。
  //   これで「アプリが 8 秒で中断した（掟どおり）」と「検査の書き方が悪い」を切り分けられた
  //   （2026-08-17: 実測で遅いとき 8.2 秒 → ERR_ABORTED → 候補が出ず時間切れ）。
  if (process.env.LOG_SEARCH) {
    const t0 = Date.now();
    page.on("request", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [req ] +${((Date.now()-t0)/1000).toFixed(1)}s ${c.name}`); });
    page.on("response", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [resp] +${((Date.now()-t0)/1000).toFixed(1)}s ${r.status()} ${c.name}`); });
    page.on("requestfailed", (r) => { if (/address-search/.test(r.url()))
      console.log(`      [FAIL] +${((Date.now()-t0)/1000).toFixed(1)}s ${r.failure()?.errorText} ${c.name}`); });
  }
  // 「実行時に外部へ出ていないこと」を検査できるように、出た先を全部控える
  // ⚠ **これは「出そうとした先」。**⚠ **`page.route` で手元で返したものも 1 本と数える。**
  //   ⚠ **検査の主張はこれでよい**（「アプリが叩こうとしたか」を見ているため）。
  page.on("request", (r) => reqs.push(r.url()));
  // ⚠ **本当に外へ出た本数は、⚠ 別に数える**（2026-08-22。hidetzu/konjaku#191）。
  //   ⚠ **実際に踏んだ**: 塞いだケースの「外へ」が減って見えたが、⚠ **減っていたのは
  //     「出そうとした数」**で、⚠ **手元で返した分まで数えていた。**
  //   ⚠ **差し替えた応答には接続先が無い**（`serverAddr()` が `null`）。⚠ ここで分ける。
  //   ⚠ **中断した要求は応答が来ない**ので、⚠ そもそも数に入らない。
  const sentOut = [];
  page.on("response", (res) => {
    const u = res.url();
    if (!OUTSIDE(u)) return;
    sentOut.push(res.serverAddr().then((a) => (a ? u : null)).catch(() => null));
  });
  // ⚠ **ここから測る**（⚠ ページを開く前。⚠ 仕込みの時間も込みで見る）
  const tCase = Date.now();

  try {
    // 通信断・無応答を作るケースは、ページを開く前に仕込む
    await c.setup?.(page);
    await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    const detail = await c.check(page, reqs);
    // 描画自体は通っても、裏でエラーが出ていれば見逃さない
    if (errors.length) throw new Error(`JSエラー: ${errors[0]}`);
    console.log(`  \x1b[32m✓\x1b[0m ${c.name} — ${detail}${attempt > 1 ? " \x1b[33m（再試行で通過）\x1b[0m" : ""}`);
    // ⚠ **通ったケースだけ数える**（⚠ 落ちたものは時間の意味が違う）
    // ⚠ **「出そうとした数」と「本当に出た数」を、⚠ 分けて持つ。**
    const sent = (await Promise.all(sentOut)).filter(Boolean);
    measured.push({ name: c.name, ms: Date.now() - tCase,
      tried: reqs.filter(OUTSIDE).length, out: sent.length,
      hosts: [...new Set(sent.map((u) => { try { return new URL(u).host; } catch { return "?"; } }))],
      // ⚠ **相手先ごと・種類ごとの本数**（2026-08-22。hidetzu/konjaku#191）。
      //   ⚠ **名前だけでは、⚠ どこを減らせばよいか決められない。**
      //   ⚠ **同じ相手でも、⚠ 絵と判定の材料は別もの。**⚠ **絵は差し替えてよいが、
      //     ⚠ 材料を偽ると答えが変わる**（⚠ 分け方は `kindOfRequest` が正本）。
      byHost: sent.reduce((m, u) => {
        let h = "?"; try { h = new URL(u).host; } catch { /* そのまま */ }
        const key = h + kindOfRequest(u);
        m[key] = (m[key] ?? 0) + 1; return m;
      }, {}) });
    // ⚠ **印と実際の通信を突き合わせる。** 印が古くなると、再試行も切り分けも効かなくなる。
    //   ⚠ 応答を差し替えているケースでも request は出るので、これは
    //     「印が付いているのに一度も検索しない」ほうだけを見る（片方向）。
    if (c.dep === "search" && !reqs.some((u) => /address-search/.test(u))) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${c.name} — dep:"search" の印が付いているのに、住所検索を1度も叩いていない（印が古い）`);
    }
  } catch (e) {
    if (c.dep && attempt === 1) { await page.close(); return true; }   // やり直す
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${c.name} — ${e.message.split("\n")[0]}`);
    if (errors.length) console.log(`      JSエラー: ${errors.join(" / ")}`);
    // ⚠ **落ちたときだけ撮る。**
    //   以前は 75 件すべて撮っていたが、置き先の `.artifacts/` が隠しディレクトリで
    //   upload-artifact に既定で除外され、**1枚も保存されていなかった**（2026-08-15 に実測）。
    //   `if-no-files-found: ignore` だったので警告すら出ず、
    //   **撮影のコスト（実測 5.9 秒）だけ払って、見るものは何も残っていなかった。**
    //   ⚠ スクリーンショットは assert に使っていない。落ちた画面を人が見るためだけのもの。
    await page.screenshot({ path: `${OUT}/${c.name.replace(/[（）\/]/g, "_")}.png` })
      .catch(() => {});
  }
  await page.close();
  return false;
}

await browser.close();
stop();

console.log(`\n${"─".repeat(52)}`);
// ⚠ **再試行を黙って飲み込まない。** 増えていくなら、外部が落ちているか検査が悪い
if (retried) console.log(`\x1b[33m⟳ 外部（住所検索）待ちで ${retried} 回やり直した\x1b[0m`);
if (failed) { console.log(`\x1b[31m${failed} / ${RUN.length} 件が失敗\x1b[0m`); process.exit(1); }
// ⚠ **SPEC の件数が、本当にこの数か。**
//   ⚠ 静的検査からは実描画のケース数を数えられないので、**自分で名乗る**。
//   実測（2026-08-19）: 検査を足したのに SPEC が古いまま緑で出た。
// ⚠ `--only` のときは見ない（回した数と全件が違うのは、そう指示したから）。
if (!ONLY) {
  const core = CASES.filter((c) => c.dep !== "search").length;
  const search = CASES.filter((c) => c.dep === "search").length;
  // ⚠ **`docs/SPEC.md` に件数を書かない**（2026-08-22。hidetzu/konjaku#184。Owner 判断）。
  //   ⚠ **前は「SPEC の件数 == 実際の数」を見ていた。**⚠ 主張は正しかったが、
  //     ⚠ **検査を 1 件足すたびに人が同じ行を書き換える**ことになり、
  //     ⚠ **良い変更を並行して 2 本走らせると必ず競合した**（2026-08-22 に同じ日で 3 回）。
  //   ⚠ **競合中は CI が走らない**ので、⚠ 「CI が出ない」という形で詰まる。
  // ⚠ **数が読めなくなったわけではない。**⚠ **ここで必ず名乗る。**⚠ この出力が正。
  // ⚠ **書き戻されていないこと**は静的検査が見る（⚠ 書くと落ちる）。
  // ⚠ **0 件で緑にしない**（⚠ 1 件も走っていないのに「描画できた」と言わない）。
  if (!CASES.length) {
    console.log(`\x1b[31m✗ 実描画のケースが 1 件も無い（この検査が何も見ていない）\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓ 数えた（実描画 ${CASES.length} / core ${core} / search ${search}）`
    + `。⚠ この数が正。⚠ docs/SPEC.md には書かない\x1b[0m`);
}
// ---- ⚠ どこに時間が要ったか・どれが外へ出たか ----
// ⚠ **推測で最適化しない。**⚠ **測った値を、⚠ その場で出す**（2026-08-22。hidetzu/konjaku#189）。
// ⚠ **これは hidetzu/konjaku#190（外部に出ないものだけ並列）と
//   hidetzu/konjaku#191（外部を最小限に）が、⚠ 何を対象にできるかを決める材料。**
if (measured.length) {
  const tot = measured.reduce((a, m) => a + m.ms, 0);
  const outside = measured.filter((m) => m.out > 0);
  const totOut = measured.reduce((a, m) => a + m.out, 0);
  console.log(`\n\x1b[1m遅い順（上位 10）\x1b[0m`);
  for (const m of [...measured].sort((a, b) => b.ms - a.ms).slice(0, 10))
    console.log(`  ${(m.ms / 1000).toFixed(1).padStart(6)}s  外へ ${String(m.out).padStart(3)} 本  ${m.name.slice(0, 46)}`);
  // ⚠ **届かなかった待ちを名乗る。**⚠ **握りつぶすと、⚠ 捨てた時間も、⚠ その先の主張も静かに消える**
  //   （⚠ 2026-08-22 に、⚠ もう無い `#land` を 20 秒待っていたのを見つけた）。
  if (waited.length) {
    const lost = waited.reduce((a, w) => a + w.ms, 0);
    console.log(`\n\x1b[1m⚠ 届かなかった待ち\x1b[0m`);
    for (const w of waited)
      console.log(`  ${(w.ms / 1000).toFixed(1).padStart(6)}s  ${w.label}`);
    console.log(`  ⚠ 合計 ${(lost / 1000).toFixed(1)}s を待って、⚠ 届かなかった`
      + `（⚠ **相手が止まりうるのか、⚠ こちらが消えたものを待っているのか**を見る）`);
  }
  // ⚠ **本数の順でも出す**（2026-08-22）。⚠ **時間の順だけでは、⚠ 外への出方が見えない。**
  //   ⚠ **時間と本数は比例しない**（実測: 699 本で 9.1s ／ 0 本で 10.1s）。
  //   ⚠ **減らす先を選ぶには、⚠ 本数の物差しが要る。**
  console.log(`\n\x1b[1m外へ多い順（上位 10）\x1b[0m`);
  console.log(`  ⚠ **本当に外へ出た本数**（⚠ かっこ内は「出そうとした数」。⚠ 差し替えた分を含む）`);
  for (const m of [...measured].sort((a, b) => b.out - a.out).slice(0, 10)) {
    console.log(`  ${String(m.out).padStart(5)} 本（試み ${String(m.tried).padStart(4)}）`
      + `  ${(m.ms / 1000).toFixed(1).padStart(6)}s  ${m.name.slice(0, 40)}`);
    // ⚠ **相手先ごとに出す**（⚠ どこを減らせばよいかは、⚠ これが無いと決められない）
    const per = Object.entries(m.byHost ?? {}).sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `${h} ${n}`).join(" ／ ");
    if (per) console.log(`         ${per}`);
  }
  console.log(`\n\x1b[1m外部への出方\x1b[0m`);
  console.log(`  外へ出たケース: ${outside.length} / ${measured.length} 件`
    + `（⚠ **出ていないのは ${measured.length - outside.length} 件**）`);
  console.log(`  外へのリクエスト合計: ${totOut} 本`
    + `（⚠ 1 ケースあたり平均 ${(totOut / measured.length).toFixed(1)} 本）`);
  const byHost = {};
  for (const m of measured) for (const h of m.hosts) byHost[h] = (byHost[h] ?? 0) + 1;
  const hosts = Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (hosts.length) console.log(`  相手先: ${hosts.map(([h, n]) => `${h}（${n} 件）`).join(" ／ ")}`);
  console.log(`  ⚠ 測ったケースの合計 ${(tot / 1000).toFixed(1)}s`
    + `（⚠ **ジョブ全体ではない**。⚠ ブラウザの用意などは含まない）`);
}

// ⚠ 回していないケースを「描画できた」と言わない（--only のとき）
console.log(ONLY
  ? `\x1b[33m${RUN.length} 件は描画できた（⚠ 全 ${CASES.length} 件のうち --only で選んだぶんだけ）\x1b[0m`
  : `\x1b[32m${RUN.length} 件すべて描画できた\x1b[0m`);
