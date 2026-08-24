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
import { ROOT, PUB, ok, bad, warn, head } from "./lib.mjs";


// ---------- 2. デプロイ設定 ----------
head("2. デプロイ設定");
{
  const raw = await readFile(join(ROOT, "wrangler.jsonc"), "utf8");
  const conf = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
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
