// 静的検査 — 届け方（⚠ **配ったものが、⚠ 意図したとおり届くか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 3 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **なぜこの 4 節をひとまとめにしたか**:
//   ⚠ **どれも「配ったものが届くか」を守っている。**⚠ 画面の中身の話ではない。
//
//     デプロイ設定        ⚠ 何を配るか（⚠ `assets.directory` が `.` だと node_modules ごと上がる）
//     Service Worker の版 ⚠ 中身を変えたのに、⚠ 古い画面が出続けないこと
//     配信中の版          ⚠ いま本番に出ているものが、⚠ 手元と同じか
//     CI の固定           ⚠ 検査そのものが、⚠ 走る形で固定されているか
//
// ⚠ **元の節番号は 2 / 2.5 / 2.6 / 8 とバラバラだった**（⚠ 8 は遠く離れていた）。
//   ⚠ **番号は「いつ足したか」しか表していなかった。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { VERSION_RE, hashOf, readSw } from "../../scripts/sw-hash.mjs";
import { pathToFileURL } from "node:url";
import { ROOT, PUB, ok, bad, warn, head, src, TOP, HEAD_COMMENT } from "./lib.mjs";

// ⚠ **必須チェックにしている名前**（ruleset「main を守る」）。
//   ⚠ **repo の外にあるものを控えている。**⚠ **ruleset を変えたら、⚠ ここも直す。**
//   ⚠ **`test/check.mjs` から一緒に持ってきた**（2026-08-24。⚠ ここでしか使わない）。
const REQUIRED_CHECKS = ["静的検査・外部リンク", "検索の並び（42語・fixture）", "実描画"];


// ---------- 2. デプロイ設定 ----------
head("2. デプロイ設定");
{
  const raw = await readFile(join(ROOT, "wrangler.jsonc"), "utf8");
  const conf = JSON.parse(raw.replace(HEAD_COMMENT, ""));
  const dir = conf.assets?.directory;
  if (dir === "./public") ok(`assets.directory = ${dir}`);
  else bad(`assets.directory が ${JSON.stringify(dir)}。"." だと node_modules ごと上げてデプロイが落ちる`);

  const lock = await readFile(join(ROOT, "package-lock.json"), "utf8").catch(() => null);
  lock ? ok("package-lock.json がある（npm ci に必要）")
       : bad("package-lock.json が無い。Pages/Workers の npm clean-install が失敗する");
}

// ---------- 2.5 Service Worker の版 ----------
// ⚠ ここだけは「本番でしか壊れない」検査。
//   VERSION はキャッシュのキーそのもので、上げないと一度来た人に古い `/` と
//   `/share.js` が出続ける。ローカルでは初回訪問なので絶対に再現しない。
//   流入を測り始める直前に一度踏みかけた（看板を変えたのに v4 のままだった）。
head("2.5. Service Worker の版");
{
  try {
    const sw = await readSw();
    const want = await hashOf(sw);
    const now = sw.match(VERSION_RE)?.[1];
    if (now === want) ok(`konjaku-${want}（SHELL の中身と一致）`);
    else bad(`VERSION が古い: konjaku-${now} だが中身は konjaku-${want}。`
      + `npm run stamp で振り直す（古い画面が本番に出続ける）`);
  } catch (e) {
    bad(`Service Worker の版を確かめられなかった: ${e.message}`);
  }
}

// ---------- 2.6 配信中の版 ----------
// ⚠ ここも「本番でしか完結しない」検査。version.json は生成物で Git に入らないので、
//   ここで見られるのは**仕組みが繋がっているか**まで。
//   本番に出ている版が main の HEAD と一致することは、デプロイ後に
//   `curl -s https://konjaku.hidetzu.work/version.json` と照合して確かめる。
head("2.6. 配信中の版（/version.json）");
{
  // ⚠ 版の正しさの定義は scripts/version.mjs に1つだけ置いてある。
  //   ここで字面を写すと、片方だけ直したときに検査が通ってしまう。
  // ⚠ **`../../` になった**（2026-08-24。⚠ `test/check.mjs` から 1 階層深くなった）。
  //   ⚠ **相対 import は、⚠ ファイルを動かすと黙って壊れる**（⚠ 実際にここで落ちた）。
  const { versionJson } = await import("../../scripts/version.mjs");
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  try {
    const v = versionJson(SHA, "main");
    (Object.keys(v).join(",") === "commit,branch" && v.commit === SHA && v.branch === "main")
      ? ok(`正常な commit と branch から版を作れる（${JSON.stringify(v)}）`)
      : bad(`版の形が仕様と違う: ${JSON.stringify(v)}（commit と branch の2つ）`);
  } catch (e) {
    bad(`正常な commit と branch で版を作れない: ${e.message}`);
  }

  // ⚠ **通ってはいけない値で、本当に落ちること。**
  //   短縮 SHA を通すと「GitHub の HEAD と一致するか」を機械で照合できなくなる。
  const nope = [
    ["短縮 SHA", "0123456", "main"],
    ["大文字混じり", SHA.toUpperCase(), "main"],
    ["16進でない", "z".repeat(40), "main"],
    ["空の commit", "", "main"],
    ["commit が無い", undefined, "main"],
    ["空の branch", SHA, ""],
    ["branch が無い", SHA, undefined],
  ];
  const through = nope.filter(([, c, b]) => {
    try { versionJson(c, b); return true; } catch { return false; }
  });
  through.length
    ? bad(`版の検査を素通りする値がある: ${through.map(([n]) => n).join("、")}`
        + "（不正な版のまま build が通り、本番が嘘の commit を名乗る）")
    : ok(`通してはいけない値 ${nope.length} 通りで、版を作れない`);

  // 仕組みの結線。⚠ Workers Builds は build に `npm run build`、
  //   deploy に `npx wrangler deploy` を設定してある（そこは Cloudflare 側の設定で、
  //   ここからは見えない。⚠ **この検査では確かめられない**）。
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  /version\.mjs/.test(pkg.scripts?.build ?? "")
    ? ok(`npm run build が版を作る（${pkg.scripts.build}）`)
    : bad(`npm run build が scripts/version.mjs を呼んでいない: ${JSON.stringify(pkg.scripts?.build)}`);

  const ignored = (await readFile(join(ROOT, ".gitignore"), "utf8"))
    .split("\n").some((l) => l.trim() === "public/version.json");
  ignored ? ok(".gitignore が public/version.json を外している")
          : bad(".gitignore に public/version.json が無い（手元の版を commit すると、配信物の版として名乗られる）");

  // ⚠ 書いてあるだけでなく、**実際に追跡されていない**こと
  try {
    const tracked = execFileSync("git", ["ls-files", "--", "public/version.json"],
      { cwd: ROOT, encoding: "utf8" }).trim();
    tracked ? bad(`public/version.json が Git に入っている（生成物。配信物と食い違う版を名乗る）`)
            : ok("public/version.json は Git に入っていない");
  } catch (e) {
    warn(`Git の追跡状況を確かめられなかった: ${String(e.message).split("\n")[0]}`);
  }

  // ⚠ no-store。古い版を「いまの本番」と読むと、照合そのものが嘘になる。
  const hdr = await readFile(join(PUB, "_headers"), "utf8");
  const noStore = (() => {
    let cur = null;
    for (const raw of hdr.split("\n")) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim() || line.trim().startsWith("#")) continue;   // ⚠ コメントを先に落とす
      if (/^\//.test(line)) { cur = line.trim(); continue; }
      if (cur === "/version.json" && /^\s*Cache-Control:/i.test(line)) return /no-store/i.test(line);
    }
    return false;
  })();
  noStore ? ok("_headers が /version.json を no-store にしている")
          : bad("_headers の /version.json に Cache-Control: no-store が無い（古い版が「いまの本番」として読まれる）");

  // 手元に生成物があるときは、中身も見る（CI には無い。**無いことを緑と呼ばない**）
  const raw = await readFile(join(PUB, "version.json"), "utf8").catch(() => null);
  if (raw === null) ok("public/version.json は手元に無い（生成物。ここでは中身を見ていない）");
  else {
    try {
      const v = JSON.parse(raw);
      versionJson(v.commit, v.branch);
      Object.keys(v).join(",") === "commit,branch"
        ? ok(`手元の public/version.json は仕様どおり（${v.commit.slice(0, 7)} / ${v.branch}）`)
        : bad(`public/version.json の鍵が commit,branch ではない: ${Object.keys(v).join(",")}`);
    } catch (e) {
      bad(`public/version.json が仕様を満たしていない: ${e.message}`);
    }
  }
}

// ⚠ GitHub Actions は **SHA で固定する**。タグは動かせるので、`@v4` のままだと
//   タグの指す先が変わった時点で、こちらの差分なしに中身が入れ替わる。
//   public にすると fork からの PR も走りうるので、ここは締めておく。
//   ⚠ Playwright も同じ。メジャーだけ書くと 1.x の最新に動くので、
//     ある日ブラウザの挙動が変わって検査が落ちる（原因が自分の変更に見える）。
head("8. CI の固定");
{
  const wf = await readFile(join(ROOT, ".github/workflows/check.yml"), "utf8").catch(() => "");
  if (!wf) bad(".github/workflows/check.yml が読めない");
  else {
    const uses = [...wf.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]);
    if (!uses.length) bad("workflow に uses が1つも無い（この検査が何も見ていない）");
    const loose = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u));
    loose.length
      ? bad(`Action が SHA で固定されていない: ${loose.join("、")}（タグは動かせる）`)
      : ok(`Action は全部 SHA で固定されている（${uses.length} 箇所）`);

    // ⚠ 版の出どころは workflow の env 1か所だけ。入れる版とキャッシュのキーの両方が
    //   これを見る。**別々に書くと「別の版のブラウザを、この版のキーで拾う」がいつか起きる。**
    const pin = /PLAYWRIGHT_VERSION:\s*"?(\d+\.\d+\.\d+)"?/.exec(wf)?.[1];
    if (!pin) bad("workflow に PLAYWRIGHT_VERSION が x.y.z で定義されていない");
    else {
      // 版を書いている箇所が、env の参照以外に無いこと（出どころを2つ持たない）
      const direct = [...wf.matchAll(/playwright@(?!\$\{\{)([^\s]+)/g)].map((m) => m[1]);
      direct.length
        ? bad(`Playwright の版を env 以外にも書いている: ${direct.join("、")}`
            + `（出どころは PLAYWRIGHT_VERSION だけにする）`)
        : ok(`Playwright の版は1か所で固定されている（${pin}）`);

      // ⚠ **手順書は、その 1 か所を見られない。** 人が読んで手で打つものなので、
      //   版を書き写すしかない。掟「やむを得ず2つ持つときは、機械で突き合わせる」。
      //   ⚠ ここがずれると**手元では通るのに CI で落ちる／その逆**が起きる。
      //   ⚠ Dependabot は Playwright を上げないので、**手で上げたときにだけずれる**。
      //     つまり、ずれるのは決まって人が急いでいるときになる。
      const guide = await readFile(join(ROOT, "CONTRIBUTING.md"), "utf8").catch(() => "");
      const inGuide = [...guide.matchAll(/playwright@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
      if (!inGuide.length) bad("CONTRIBUTING.md に playwright の版が書かれていない（手順が版なしになっている）");
      else {
        const off = [...new Set(inGuide)].filter((v) => v !== pin);
        off.length
          ? bad(`CONTRIBUTING.md の Playwright が CI と違う: 手順 ${off.join("、")} / CI ${pin}`
              + `（手元と CI で別の版になる）`)
          : ok(`CONTRIBUTING.md の Playwright が CI と揃っている（${pin}・${inGuide.length} 箇所）`);
      }
    }
  }
}

// ============================================================
// ⚠ CI と実描画の回し方（⚠ 元は「9. 画面の言葉」の中にあった）
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 4 本目）。
//   ⚠ **1 文字も変えていない。**
//
// ⚠ **なぜここへ来たか**: ⚠ **「9. 画面の言葉」の中に、⚠ 届け方が 7 件混ざっていた。**
//   ⚠ **節 8（CI の固定）と節 9 に、⚠ 同じ主題が分かれて入っていた**
//     （⚠ どちらも「必須チェックの名前を名乗るジョブが居るか」を見ている）。
//   ⚠ **画面の言葉の話ではない。**⚠ **検査そのものが、⚠ 走る形になっているか。**

// ── 年代のタイルを、⚠ 実描画が塞いでいないか ────────────────────
// ⚠ **2026-08-22 に踏んで、⚠ 主張ごと入れ替えた**（hidetzu/konjaku#191）。
// ⚠ **前はここで「アプリが読む年代 ⊆ 塞ぐ一覧」を見ていた**（＝全部塞げ、という主張）。
//   ⚠ **それが間違いだった。**⚠ **「その年代の写真があるか」は、⚠ タイルが返るかで決まる**
//     （`public/verify.js` の `photos()`）。⚠ **塞ぐと、⚠ 実在しない年代まで「ある」ことになる。**
//   ⚠ **実測（2026-08-22・48 件に当てた）**: 軽井沢のバッジが
//     ⚠ **「1974–78年から見られる（1年代）」→「1936–42年から見られる（7年代）」**に化けた。
//     ⚠ **夢の島は 6年代 → 7年代。**⚠ **どちらも検査は緑のまま通った。**
//     ⚠ **「年代を動かす操作パネル」は、⚠ 帯が変わって待ちが成立せず落ちた。**
// ⚠ **いまの主張は逆。**⚠ **年代のタイルを、⚠ 1 つも塞いでいないこと。**
{
  const eras = await readFile(join(ROOT, "public/verify.js"), "utf8");
  const lib  = await readFile(join(ROOT, "test/render/lib.mjs"), "utf8");
  const block = /const ERAS = \[([\s\S]*?)\n  \];/.exec(eras);
  const ids = block ? [...block[1].matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  // ⚠ **塞いでいる本体だけを見る**（⚠ `ERA_TILE_IDS` は数える物差しなので、⚠ 宣言はあってよい）
  const fn = /export const stubMapPictures = async \(page\) => \{([\s\S]*?)\n\};/.exec(lib);
  if (!ids.length) {
    bad("public/verify.js から年代の id を 1 つも拾えなかった（⚠ この検査は何も見ていない）");
  } else if (!fn) {
    bad("test/render/lib.mjs の stubMapPictures を読めなかった（⚠ この検査は何も見ていない）");
  } else if (/ERA_TILE_IDS/.test(fn[1])) {
    bad("実描画が年代のタイルを塞いでいる"
      + "（⚠ **塞ぐと、⚠ 実在しない年代まで「撮影されている」ことになる。**"
      + "⚠ 実測: 軽井沢が 1年代 → 7年代 に化け、⚠ 検査は緑のまま通った）");
  } else {
    ok(`実描画は年代のタイルを塞いでいない（アプリが読む ${ids.length} 年代は、実物を取りに行く）`);
  }
}

// ── 必須チェックの名前を、⚠ 名乗るジョブが居るか ──────────────────
// ⚠ **2026-08-22 に踏んだ**（hidetzu/konjaku#190）。⚠ **実描画を matrix に分けると、
//   ⚠ ジョブ名が `実描画 top/core` のように変わる。**⚠ **必須チェックは名前で照合するので、
//   ⚠ 名乗る者が居なくなると、⚠ 報告が来ないまま PR が永久に待ちになる**（⚠ 落ちるのではない）。
// ⚠ **ruleset は repo の中に無いので、⚠ 名前をここに控えて突き合わせる。**
//   ⚠ **これは「ruleset がそうなっている」ことの検証ではない。**⚠ 片側しか見ていない。
//   ⚠ **ruleset を変えるときは、⚠ ここも一緒に直す。**
{
  const yml = await readFile(join(ROOT, ".github/workflows/check.yml"), "utf8");
  // ⚠ **`name:` の字をそのまま拾う**（⚠ ジョブの id ではない。⚠ 照合されるのは name のほう）
  const names = [...yml.matchAll(/^\s{4}name:\s*(.+?)\s*$/gm)].map((m) => m[1]);
  const missing = REQUIRED_CHECKS.filter((c) => !names.includes(c));
  // ⚠ **0 件で緑にしない**（2026-08-24。⚠ **わざと壊して分かった**）。
  //   ⚠ `REQUIRED_CHECKS` を空にしたら、⚠ **「0 件」と名乗って緑になった。**
  //   ⚠ **落ちない。**⚠ **確かめる相手が居なくなるだけなので、⚠ 気づけない。**
  //   ⚠ **移設で持ち込んだものではない。**⚠ **元からあった穴。**⚠ 見つけたので塞ぐ。
  if (!REQUIRED_CHECKS.length) {
    bad("必須チェックの一覧が空（⚠ この検査が何も見ていない）"
      + "。⚠ ruleset「main を守る」が要求している名前を、⚠ ここに控える");
  } else if (missing.length) {
    bad(`必須チェックの名前を名乗るジョブが居ない: ${missing.join(" / ")}`
      + "（⚠ **落ちるのではなく、⚠ 報告が来ないまま永久に待ちになる。**"
      + "⚠ ジョブ名を変えたなら、⚠ ruleset と、⚠ この検査の一覧も直す）");
  } else {
    ok(`必須チェックの名前を、それぞれジョブが名乗っている（${REQUIRED_CHECKS.length} 件）`);
  }
  // ⚠ **門番は `always()` でないと、⚠ 上が落ちたときに黙る**（⚠ そこが永久待ちの入口）
  const gate = /^  render:\n(?:.*\n)*?    if: >-\n((?:\s+.*\n)+?)\s{4}runs-on:/m.exec(yml);
  if (!gate) {
    bad("実描画の門番（jobs.render）の実行条件を読めなかった（⚠ この検査が何も見ていない）");
  } else if (!/always\(\)/.test(gate[1])) {
    bad("実描画の門番が always() で走らない"
      + "（⚠ **上の段が落ちると、⚠ 必須チェックの報告が来ないまま永久に待ちになる**）");
  } else {
    ok("実描画の門番は、上が落ちても必ず結果を返す（always()）");
  }
}


// ── 分けて回しても、⚠ 1 件も落ちないか ──────────────────────────
// ⚠ **2026-08-22 に足した**（hidetzu/konjaku#190）。
// ⚠ **`--shard=1/2` で分けたとき、⚠ 足して元に戻ることを見る。**
//   ⚠ **落ちるのではなく、⚠ 静かに減るのが怖い**（⚠ 減ったぶんは誰も検査しないまま緑になる）。
// ⚠ **走者に数えさせる**（`--count`）。⚠ **ここで別に数え直さない**（掟 §3）。
{
  const runner = join(ROOT, "test/render.mjs");
  const count = (args) => Number(execFileSync(process.execPath, [runner, "--count", ...args],
    { encoding: "utf8" }).trim().split(/\s+/).pop());
  const bad3 = [];
  let seen = 0;
  for (const [suite, group] of [["top", "core"], ["top", "search"], ["peel", "core"]]) {
    const whole = count([`--suite=${suite}`, `--group=${group}`]);
    seen += whole;
    for (const n of [2, 3]) {
      let sum = 0;
      for (let i = 1; i <= n; i++)
        sum += count([`--suite=${suite}`, `--group=${group}`, `--shard=${i}/${n}`]);
      if (sum !== whole) bad3.push(`${suite}/${group} を ${n} 分割: ${sum} 件（全部で ${whole} 件）`);
    }
  }
  // ⚠ **足し算だけでは足りない**（2026-08-22 に踏んだ）。
  //   ⚠ **全体も同じ走者が数えているので、⚠ 全体からも同じだけ減ると気づけない。**
  //   ⚠ わざと 1 件落としてみたら、⚠ **この検査は緑のままだった。**
  // ⚠ **だから、⚠ ケースの一覧そのものと突き合わせる**（⚠ 走者を通さない道）。
  //   ⚠ **掟 §3 は「2 つ持つなら機械で突き合わせろ」。**⚠ これがその突き合わせ。
  const { CASES: TOP } = await import(pathToFileURL(join(ROOT, "test/render/top.mjs")).href);
  const { CASES: PEEL } = await import(pathToFileURL(join(ROOT, "test/render/peel.mjs")).href);
  const declared = TOP.length + PEEL.length;
  if (seen !== declared) {
    bad3.push(`走者が回すのは ${seen} 件だが、⚠ 書いてあるのは ${declared} 件`);
  }
  if (!seen) {
    bad("実描画のケースを 1 件も数えられなかった（⚠ この検査が何も見ていない）");
  } else if (bad3.length) {
    bad(`分けて回すと件数が合わない（${bad3.length} 件）: ${bad3.join(" ／ ")}`
      + "（⚠ **落ちるのではなく、⚠ 静かに減る。**⚠ 減ったぶんは誰も検査しない）");
  } else {
    ok(`分けて回しても 1 件も落ちない（3 つの群 × 2 分割・3 分割 ／ 書いてある ${declared} 件と一致）`);
  }
}

// ── 「この画面だけが読む」は、⚠ 本当か ──────────────────────────
// ⚠ **2026-08-22 に足した**（hidetzu/konjaku#190）。
// ⚠ **`test/render-scope.mjs` は「このファイルは top だけ／peel だけ」と決めている。**
//   ⚠ **間違えると、⚠ 落ちるのではなく、⚠ 検査が走らないまま緑になる。**
// ⚠ **だから、⚠ 実物の HTML と突き合わせる。**⚠ **憶測で足せないようにする。**
{
  const scope = await readFile(join(ROOT, "test/render-scope.mjs"), "utf8");
  const html = {
    top: await readFile(join(ROOT, "public/index.html"), "utf8"),
    peel: await readFile(join(ROOT, "public/peel.html"), "utf8"),
  };
  // `[/^public\/prov\.js$/,  "peel"],` の並びから拾う
  const rows = [...scope.matchAll(/\[\/\^public\\\/([^/]+?)\\?\/?\$?\/,\s*"(top|peel)"\]/g)]
    .map((m) => ({ file: m[1].replace(/\\/g, ""), suite: m[2] }));
  const wrong = [];
  let seen = 0;
  for (const { file, suite } of rows) {
    // ⚠ HTML そのものは、⚠ 自分を読み込まない
    if (/\.html$/.test(file)) continue;
    const other = suite === "top" ? "peel" : "top";
    // ⚠ **本当に読み込んでいる所だけを見る**（`<script src=…>` / `<link href=…>`）。
    //   ⚠ **名前で探すと、⚠ コメントの中の言及まで拾う**（2026-08-22 に踏んだ）。
    //   ⚠ 実際に `peel3d.js` と `places.js` の 2 件を、⚠ **誤って落とした**
    //     （どちらも「読まない」と書いてあるコメントだった）。
    const name = file.split("/").pop().replaceAll(".", "\\.");
    const loads = (h) => new RegExp(`(src|href)=["'][^"']*${name}["']`).test(h);
    const inOwn = loads(html[suite]);
    const inOther = loads(html[other]);
    seen++;
    if (!inOwn) wrong.push(`${file}: ${suite} だけと書いてあるが、${suite} の画面が読んでいない`);
    else if (inOther) wrong.push(`${file}: ${suite} だけと書いてあるが、${other} の画面も読んでいる`);
  }
  if (!seen) {
    bad("「この画面だけが読む」ものが 1 つも無い（⚠ この検査が何も見ていない）");
  } else if (wrong.length) {
    bad(`実描画を回す先の決め方が、実物と食い違う（${wrong.length} 件）: ${wrong.join(" ／ ")}`
      + "（⚠ **落ちるのではなく、⚠ 検査が走らないまま緑になる**）");
  } else {
    ok(`「この画面だけが読む」が、実物の HTML と合っている（${seen} 件を突き合わせた）`);
  }
}

// ── 控えが、⚠ 返ってきたものをそのまま返すか ─────────────────────
// ⚠ **2026-08-22 に足した**（hidetzu/konjaku#191）。
// ⚠ **控えが状態を書き換えたら、⚠ 「その年代の写真があるか」の答えが変わる。**
//   ⚠ **404 を 200 にしてしまうと、⚠ 実在しない年代まで「撮影されている」ことになる**
//     （⚠ hidetzu/konjaku#211 で、⚠ 絵を偽って軽井沢が 1年代 → 7年代 に化けた）。
// ⚠ **控えはブラウザを知らない形にしてあるので、⚠ ここで直接動かせる。**
{
  const { createShelf } = await import(pathToFileURL(join(ROOT, "test/render/shelf.mjs")).href);
  const wrong4 = [];
  {
    // ⚠ **404 は 404 のまま**（⚠ 2 回目に別のものを渡しても、⚠ 控えが勝つ）
    const sh = createShelf();
    const a = await sh.get("u", async () => ({ status: 404, body: "x" }));
    const b = await sh.get("u", async () => ({ status: 200, body: "y" }));
    if (a.status !== 404 || b.status !== 404) wrong4.push(`404 が ${b.status} になった`);
    if (b.body !== "x") wrong4.push("控えたはずの中身が違う");
    const t = sh.stats();
    if (t.real !== 1 || t.replayed !== 1) wrong4.push(`数え方が違う: ${JSON.stringify(t)}`);
  }
  {
    // ⚠ **別の URL は、⚠ 別に取りに行く**（⚠ 全部を 1 つに混ぜない）
    const sh = createShelf();
    await sh.get("a", async () => ({ status: 200, body: "A" }));
    const b = await sh.get("b", async () => ({ status: 200, body: "B" }));
    if (b.body !== "B") wrong4.push("別の URL に、別のものが返っていない");
    if (sh.stats().real !== 2) wrong4.push("別の URL を取りに行っていない");
  }
  {
    // ⚠ **取りに行けなかったものは控えない**（⚠ 「取れなかった」を答えに変えない）
    const sh = createShelf();
    let threw = false;
    try { await sh.get("u", async () => { throw new Error("届かなかった"); }); }
    catch { threw = true; }
    if (!threw) wrong4.push("届かなかったのに、控えが黙って何かを返した");
    const after = await sh.get("u", async () => ({ status: 200, body: "後から取れた" }));
    if (after.body !== "後から取れた") wrong4.push("届かなかったことを控えてしまっている");
  }
  wrong4.length
    ? bad(`控えが、返ってきたものをそのまま返していない（${wrong4.length} 件）: ${wrong4.join(" ／ ")}`
        + "（⚠ **状態を書き換えると、⚠ 実在しない年代まで「ある」ことになる**）")
    : ok("控えは、返ってきたものをそのまま返す（404 のまま ／ URL ごとに別 ／ 失敗は控えない）");
}

// ── 回す先を決める口が、⚠ CI と同じ書き方で動くか ────────────────
// ⚠ **2026-08-22 に踏んだ**（hidetzu/konjaku#190）。
// ⚠ **`--json` を先に書くと、⚠ 範囲が `--json` だと解釈されて `git diff` が失敗し、
//   ⚠ 「分からなければ全部に倒す」規則で ⚠ **黙って全部走っていた。**
//   ⚠ **落ちない。**⚠ **安全な側に倒れるので、⚠ 気づけない。**
// ⚠ **`--files=` と `--all --json` は試したのに、⚠ CI が使う形だけ試していなかった。**
// ⚠ **だから、⚠ CI が実際に打つ形をそのまま試す。**
{
  const scope = join(ROOT, "test/render-scope.mjs");
  const run = (args) => execFileSync(process.execPath, [scope, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const wrong5 = [];
  // ⚠ **必ず「範囲を通る道」で試す**（2026-08-22 に 2 回踏んだ）。
  //   ⚠ **最初は `--files=` で試していて、⚠ わざと壊しても素通りした。**
  //   ⚠ **`--files=` は範囲を見ないので、⚠ 不具合のある道をそもそも通らない。**
  //   ⚠ **`HEAD...HEAD` は必ず在って、⚠ 必ず空。**⚠ だから答えは「回さない」で決まる。
  const EMPTY = "HEAD...HEAD";
  try {
    const out = run(["--json", EMPTY]);
    if (out !== "[]") {
      wrong5.push(`--json を先に書くと、⚠ 変更が無いのに「${out.slice(0, 50)}」と答える`);
    }
  } catch (e) { wrong5.push(`--json を先に書くと落ちる: ${String(e.message).slice(0, 60)}`); }
  // ⚠ **順番を変えても同じ答えか**（⚠ 引数の順に寄りかからない）
  try {
    const a = run(["--json", EMPTY]);
    const b = run([EMPTY, "--json"]);
    if (a !== b) wrong5.push(`引数の順で答えが変わる: 「${a.slice(0, 40)}」と「${b.slice(0, 40)}」`);
  } catch (e) { wrong5.push(`順を変えると落ちる: ${String(e.message).slice(0, 60)}`); }
  wrong5.length
    ? bad(`実描画を回す先を決める口が、CI と同じ書き方で動かない（${wrong5.length} 件）: `
        + wrong5.join(" ／ ")
        + "（⚠ **落ちるのではなく、⚠ 全部に倒れて黙って全部走る**）")
    : ok("実描画を回す先を決める口は、CI と同じ書き方でも、引数の順を変えても同じ答えを返す");
}

// ── 日本語名のファイルでも、⚠ 回す先が同じか ────────────────────
// ⚠ **2026-08-23 に踏んだ**（hidetzu/konjaku#222 の CI で発覚）。
// ⚠ **`git diff --name-only` は、⚠ 非 ASCII のパスを C 形式で引用して返す**
//   （`core.quotepath` の既定が `true`）。⚠ **先頭に二重引用符が付く。**
// ⚠ **すると `/^docs\//` に一致せず、⚠ 「知らないもの」として全部に倒れる。**
// ⚠ **`docs/adr/` はほぼ全部が日本語名。**⚠ **ADR を触るたびに実描画が 5 本走っていた。**
// ⚠ **落ちない。**⚠ **多く回す向きなので、⚠ CI は緑のまま。**
// ⚠ **手元でも気づけない**（⚠ `core.quotepath=false` を個人設定にしていると再現しない）。
//
// ⚠ **本物の git で確かめる**（⚠ 引用は git がやるので、⚠ 文字列を作って渡しても意味が無い）。
// ⚠ **`core.quotepath=true` を環境変数で押しつける**（⚠ 走らせる人の設定に寄りかからない）。
// ⚠ **一時のリポジトリを作る**（⚠ このリポジトリの履歴に寄りかからない）。
{
  const { mkdtempSync, rmSync: rmq, mkdirSync: mkq, writeFileSync: wfq } = await import("node:fs");
  const { tmpdir: tmpq } = await import("node:os");
  const dir = mkdtempSync(join(tmpq(), "konjaku-quote-"));
  const wrongQ = [];
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" });
    // ⚠ **コミットのことばは Conventional Commits にする。**
    //   ⚠ **人によっては global の hook がそれを強制している**（2026-08-23 に踏んだ）。
    //   ⚠ **CI には無いので、⚠ 手元だけが落ちる。**
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.invalid");
    git("config", "user.name", "t");
    const put = (rel, body) => {
      const full = join(dir, rel);
      mkq(join(full, ".."), { recursive: true });
      wfq(full, body);
    };
    put("docs/x/0099-日本語の名前.md", "a\n");
    put("public/peel3d.js", "// a\n");
    git("add", "-A"); git("commit", "-qm", "chore: 1");
    put("docs/x/0099-日本語の名前.md", "b\n");
    git("add", "-A"); git("commit", "-qm", "chore: 2");
    // ⚠ **文書だけを変えたコミット。**⚠ 回す先は空のはず
    const runQ = (range) => execFileSync(process.execPath,
      [join(ROOT, "test/render-scope.mjs"), "--json", range],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_CONFIG_COUNT: "1",
               GIT_CONFIG_KEY_0: "core.quotepath", GIT_CONFIG_VALUE_0: "true" } }).trim();
    const docsOnly = runQ("HEAD~1...HEAD");
    if (docsOnly !== "[]") {
      wrongQ.push(`日本語名の文書だけを変えたのに「${docsOnly.slice(0, 60)}」と答える`);
    }
    // ⚠ **空を返すだけの口になっていないか。**⚠ 画面に届く変更では、⚠ 実際に回ること
    put("public/peel3d.js", "// b\n");
    git("add", "-A"); git("commit", "-qm", "chore: 3");
    const withCode = runQ("HEAD~1...HEAD");
    if (!withCode.includes('"suite":"peel"')) {
      wrongQ.push(`画面に届く変更なのに peel を回さない（「${withCode.slice(0, 60)}」）`);
    }
  } catch (e) {
    const why = String(e.stderr ?? "").split("\n").filter(Boolean)[0] ?? String(e.message).split("\n")[0];
    wrongQ.push(`確かめられなかった: ${why.slice(0, 100)}`);
  } finally {
    rmq(dir, { recursive: true, force: true });
  }
  wrongQ.length
    ? bad(`回す先を決める口が、日本語名のファイルで狂う（${wrongQ.length} 件）: ${wrongQ.join(" ／ ")}`
        + "（⚠ **落ちるのではなく、⚠ 全部に倒れて黙って全部走る**）")
    : ok("回す先を決める口は、⚠ 日本語名のファイルでも同じ答えを返す"
        + "（⚠ 本物の git ／ ⚠ `core.quotepath=true` を押しつけて確認）");
}

