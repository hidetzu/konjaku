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
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, PUB, ok, bad, head, seen, BLOCK_COMMENT, HEAD_COMMENT } from "./lib.mjs";

// ⚠ **`test/check.mjs` から一緒に持ってきた道具**（2026-08-25。hidetzu/konjaku#232 の 29 本目）。
//   ⚠ **この 1 塊しか使わない。**⚠ **`../../` になった**（⚠ 1 階層深くなった）。
// ⚠ **住所検索の口は `public/gsi-address-search.js` の1か所**（hidetzu/konjaku#181）。
//   ⚠ **この検査も写さない。**⚠ 本番の口に URL を組み立てさせて借りる。
const gsiSearchUrl = (q) => {
  const win = {};
  new Function("window", "module", readFileSync(new URL("../../public/gsi-address-search.js",
    import.meta.url), "utf8"))(win, undefined);
  let seen = "";
  win.KonjakuGsiAddressSearch.createGsiAddressSearch({
    fetch: (u) => { seen = u; return Promise.resolve({ ok: true, json: async () => [] }); },
  }).search(q);
  return seen;
};

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

// ============================================================
// ⚠ 配信ヘッダ（public/_headers）が、二重に当たっていないか
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 13 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「届け方」の仲間である理由**: ⚠ **配ったものに、⚠ どのヘッダが付いて届くか。**
//   ⚠ **画面の中身の話ではない。**⚠ 元は「6. まだ問いで分けていないもの」にあった。
// ⚠ Cloudflare の _headers は、一致した規則を**全部**適用して連結する。
//   「より細かい規則が勝つ」ではない。同じヘッダを2つの規則が書くと、
//   本番では `max-age=86400, max-age=0, must-revalidate` のように連結され、
//   どちらが効くかは実装依存になる（実測でそうなっていた）。
//   実ファイルに当てて、同じヘッダが二重に当たっていないかを見る。
{
  const { readFileSync: rfh, readdirSync: rdh, statSync: sth } = await import("node:fs");
  const lines = rfh("public/_headers", "utf8").split("\n");
  const rules = [];
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) { rules.push({ pat: raw.trim(), h: [] }); continue; }
    const i = raw.indexOf(":");
    if (i > 0 && rules.length) rules[rules.length - 1].h.push(raw.slice(0, i).trim().toLowerCase());
  }
  // _headers の * は / も跨いで一致する（/data/* が /data/ev/index.json に当たっていた）
  const re = (pat) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*") + "$");
  const pats = rules.map((r) => ({ ...r, re: re(r.pat) }));
  const files = [];
  (function walk(d, url) {
    for (const e of rdh(d)) {
      if (e === "_headers" || e === "_redirects") continue;
      const p2 = `${d}/${e}`;
      sth(p2).isDirectory() ? walk(p2, `${url}/${e}`) : files.push(`${url}/${e}`);
    }
  })("public", "");
  const clash = [];
  for (const f of files) {
    const hit = pats.filter((r) => r.re.test(f));
    const seen = new Map();
    for (const r of hit) for (const h of r.h) {
      if (h === "referrer-policy") continue;     // 全体に1つだけ書いてある。重ならない
      seen.has(h) ? clash.push(`${f}: ${h} が ${seen.get(h)} と ${r.pat} で二重`)
        : seen.set(h, r.pat);
    }
  }
  clash.length
    ? bad(`_headers の規則が重なっている（本番で連結され、どちらが効くか決まらない）:\n      `
        + clash.slice(0, 4).join("\n      ") + (clash.length > 4 ? `\n      ほか ${clash.length - 4} 件` : ""))
    : ok(`_headers の規則が重なっていない（${files.length} ファイルに当てて確認）`);
}
// ============================================================
// ⚠ /vendor/ が immutable の約束を守っているか
// ============================================================
// ⚠ **`test/check.mjs` の「5. OGP」から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 14 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **元の節名は「OGP」だったが、⚠ 中身は OGP ではなかった**
//     （⚠ 実測 2026-08-24: ⚠ **471 行のうち OGP は 41 行**）。
// ⚠ **ここが「2. デプロイ設定」の仲間である理由**: ⚠ **`_headers` が何を約束しているか。**
//   ⚠ 上の `_headers` の検査と、⚠ 同じファイルの、⚠ 同じ約束を見ている。
// ⚠ **`immutable` と名乗るなら、中身が変わったら名前も変わること。**
//   ⚠ **いま `_headers` は `immutable` を付けていない**（2026-08-16 に外した）。
//   実ファイル名が maplibre-gl.js / .css で**固定**で、「中身が変われば名前が変わる」が
//   嘘だったため。**この検査は、いまは自動的に無効になる**（下の `if (!immutable)`）。
//
//   ⚠ **消さずに残しておく。** ファイル名をハッシュ付きにできた時点で `immutable` へ戻すが、
//   そのとき**この検査がまた効く**。immutable は「この URL の中身は二度と変わらない」という
//   約束で、ブラウザは1年間、確認すらしない。名前を変えずに中身を差し替えると、
//   **一度来た人は1年間、古い地図エンジンを使い続ける**。
{
  const { createHash } = await import("node:crypto");
  // 中身の指紋。⚠ 更新したらここも直す。**直さずに済ませられないのが要点。**
  const PINNED = {
    "maplibre-gl.js": "45a9b07a9189ce56",
    "maplibre-gl.css": "ab1e70d59ec40465",
  };
  const hdr = await readFile(join(PUB, "_headers"), "utf8");
  const immutable = /\/vendor\/\*[\s\S]{0,80}?immutable/.test(hdr);
  if (!immutable) ok("/vendor/ は immutable を名乗っていない（改名の縛りは無い）");
  else {
    const off = [];
    for (const [f, want] of Object.entries(PINNED)) {
      const buf = await readFile(join(PUB, "vendor", f)).catch(() => null);
      if (!buf) { off.push(`${f}（無い）`); continue; }
      const got = createHash("sha256").update(buf).digest("hex").slice(0, 16);
      if (got !== want) off.push(`${f}（${want} → ${got}）`);
    }
    off.length
      ? bad(`/vendor/ は immutable を名乗っているのに、名前を変えずに中身が変わった: ${off.join("、")}`
          + `（一度来た人は1年間、古いものを使い続ける。改名するか immutable をやめるか決めること。`
          + `決めたら test/check/deliver.mjs の PINNED を直す）`)
      : ok(`/vendor/ は immutable の約束を守っている（${Object.keys(PINNED).length} 本の中身が変わっていない）`);
  }
}
// ⚠ **「2.5 Service Worker の版」と「2.6 配信中の版」は落とした**（2026-09-01。`docs/adr/0080`）。
//   ⚠ **どちらも β 版の仕組み。**
//     ⚠ **SW の版**: ⚠ β は自前アセットとタイルを控えていた。⚠ **v0.1.0 はオフラインを持たない**
//       （Owner 判断）。⚠ **`public/sw.js` は残っているが、⚠ あれは「自分を消すためだけの SW」。**
//       ⚠ **`SHELL` を持たないので、⚠ 版を数える意味が無い。**
//     ⚠ **`/version.json`**: ⚠ β の `npm run build` が書いていた。⚠ **v0.1.0 は持たない**
//       （⚠ 出たかどうかは `scripts/check-deploy.mjs` が別の道で見る）。
//   ⚠ **オフラインを持つと決めたら、⚠ そのとき改めて版の検査を置く。**

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


// ── v0.1.0 を出す段が、⚠ β 版を出さないか ────────────────────────
// ⚠ **2026-08-29 に足した**（Owner 判断。`docs/adr/0070`）。
// ⚠ **ここが守っているのは 2 つ。**
//   ⚠ ① **利用者がいる β 版（`konjaku`）を、⚠ この段が出してしまわないこと。**
//      ⚠ `-c wrangler.next.jsonc` を外すと、⚠ 既定の `wrangler.jsonc` が読まれて β 版が出る。
//      ⚠ **落ちない。**⚠ **成功して、⚠ 利用者のいる側が入れ替わる**（`docs/adr/0047` の観測が壊れる）。
//   ⚠ ② **検査が緑になる前に出さないこと。**⚠ 門番 3 つの後ろに居ること。
// ⚠ **`develop` が push のトリガに居ることも、⚠ ここで見る。**
//   ⚠ **居ないと、⚠ この段は一度も走らない**（⚠ 落ちるのではなく、⚠ 黙って何も起きない）。
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ 上に書いた注記の字面を拾う。**
{
  const raw = await readFile(join(ROOT, ".github/workflows/check.yml"), "utf8");
  // ⚠ **行頭が `#` の行だけ落とす**（⚠ `run:` の中の bash のコメントも、⚠ 一緒に落ちてよい）
  const cleaned = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  // ⚠ **最後のジョブを切り出せるように、⚠ 番人を足す**（⚠ 次のジョブの頭を目印にしているため）
  const scan = cleaned + "\n  __end__:\n";
  const jobs = [...scan.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n)/gm)]
    .map(([, id, body]) => ({ id, body, name: /^    name:\s*(.+?)\s*$/m.exec(body)?.[1] ?? null }));

  // ⚠ **トリガ**（⚠ ここが `develop` を含まないと、⚠ 出す段が一度も呼ばれない）
  const push = /^on:\n(?:.*\n)*?  push:\n((?:\s{4}.*\n)+)/m.exec(cleaned)?.[1] ?? "";
  /\bdevelop\b/.test(push)
    ? ok("push のトリガに develop が居る（⚠ いまの主線。ここでしか全部は回らない）")
    : bad("push のトリガに develop が居ない"
        + "（⚠ **落ちるのではなく、⚠ 取り込んだあとの検査も、⚠ 出す段も、⚠ 黙って何も走らない**）");

  // ⚠ **2026-09-01 に `deploy-next` → `deploy` へ**（`docs/adr/0080`）。
  //   ⚠ **器が 1 つになったので、⚠ 出す先も 1 つ。**
  const dep = jobs.find((j) => j.id === "deploy");
  if (!dep) {
    bad("本番を出すジョブ（jobs.deploy）が居ない（⚠ この検査が何も見ていない）");
  } else {
    // ⚠ ① **出す先。**⚠ **設定は `wrangler.jsonc` の 1 つだけ。**
    //   ⚠ **`-c` で別の設定を渡していないこと**（⚠ 渡す相手がもう無い。⚠ 渡していたら消し忘れ）。
    const calls = [...dep.body.matchAll(/^\s*run:\s*(.*wrangler.*)$/gm)].map((m) => m[1]);
    if (!calls.length) {
      bad("出すジョブに wrangler の呼び出しが無い（⚠ この検査が何も見ていない）");
    } else {
      const loose = calls.filter((c) => /\s-c\s/.test(c));
      loose.length
        ? bad(`出すジョブが、別の設定を渡している: ${loose.join(" ／ ")}`
            + "（⚠ **本番の設定は `wrangler.jsonc` の 1 つだけ。**⚠ **渡す相手はもう無い**）")
        : ok(`出すのは本番（konjaku）だけ（wrangler の呼び出し ${calls.length} 箇所）`);
      // ⚠ **版は env の 1 か所**（⚠ Playwright と同じ。⚠ `npx wrangler` だと、その日の最新が降る）
      const pinned = calls.every((c) => /wrangler@\$\{\{\s*env\.WRANGLER_VERSION\s*\}\}/.test(c));
      const ver = /WRANGLER_VERSION:\s*"?(\d+\.\d+\.\d+)"?/.exec(cleaned)?.[1];
      (pinned && ver)
        ? ok(`wrangler の版は env の1か所で固定されている（${ver}）`)
        : bad(`wrangler の版が1か所で固定されていない（env=${ver ?? "無し"}）`
            + "（⚠ **配信の道具が、⚠ こちらの差分なしに入れ替わる**）");
    }

    // ⚠ ② **門番の後ろ。**⚠ **id を字で書かず、⚠ 必須チェックの名前から引く**
    //   （⚠ ジョブ名を変えたときに、⚠ ここだけ古くならないようにする）
    const gateIds = REQUIRED_CHECKS.map((n) => jobs.find((j) => j.name === n)?.id).filter(Boolean);
    const needs = /^    needs:\s*\[([^\]]*)\]/m.exec(dep.body)?.[1].split(",").map((s) => s.trim()) ?? [];
    const notWaited = gateIds.filter((id) => !needs.includes(id));
    if (gateIds.length !== REQUIRED_CHECKS.length) {
      bad("必須チェックの名前から、ジョブの id を引けなかった（⚠ この検査が何も見ていない）");
    } else if (notWaited.length) {
      bad(`出す段が、検査を待っていない: ${notWaited.join(" / ")} を needs に持たない`
        + "（⚠ **赤のまま出る**）");
    } else {
      ok(`出す段は、必須チェック ${gateIds.length} 件が全部緑のときだけ走る（needs: ${needs.join(", ")}）`);
    }

    // ⚠ **`develop` への push に閉じているか**（⚠ PR で走ると、⚠ fork へ秘密を晒す口になる）
    const cond = /^    if:\s*(.+?)\s*$/m.exec(dep.body)?.[1] ?? "";
    (/refs\/heads\/develop/.test(cond) && /event_name\s*==\s*'push'/.test(cond))
      ? ok("出す段は develop への push でだけ走る")
      : bad(`出す段の実行条件が develop への push に閉じていない: ${JSON.stringify(cond)}`
          + "（⚠ **PR で走ると、⚠ fork からの PR に秘密を渡す口になる**）");

    // ⚠ **出しっぱなしにしない。**⚠ 「デプロイが成功した」は「出ている」ではない（`CLAUDE.md` §1）
    // ⚠ **判定は走者が 1 か所で持つ**（⚠ 下でその `judge()` を直に呼んでいる）
    /scripts\/check-deploy\.mjs/.test(dep.body)
      ? ok("出したあと、配った実体を取り直して手元と突き合わせている")
      : bad("出したあと、⚠ 配った実体を確かめていない"
          + "（⚠ **「デプロイが成功した」は、⚠ 「出ている」ではない**）");

    // ⚠ **必須チェックにしない。**⚠ PR では走らないので、⚠ 必須にすると報告が来ず永久に待ちになる
    REQUIRED_CHECKS.includes(dep.name)
      ? bad(`出す段が必須チェックの一覧に入っている（${dep.name}）`
          + "（⚠ **PR では走らないので、⚠ 報告が来ないまま永久に待ちになる**）")
      : ok("出す段は必須チェックにしていない（⚠ PR では走らないため）");
  }
}


// ── 出したものの照合が、⚠ 何を許して何を許さないか ────────────────
// ⚠ **2026-08-29 に足した**（`docs/adr/0070`）。⚠ **初回の自動デプロイで、⚠ 実際に落ちた。**
//   ⚠ **`robots.txt` だけが 3 回とも違った。**⚠ **Cloudflare の Managed robots.txt が、
//     ⚠ こちらの `robots.txt` の前に `User-agent: *` ＋ `Allow: /` を挿入していた。**
//   ⚠ **例外を作ると、⚠ そこは誰も見なくなる。**⚠ **だから例外そのものを検査する。**
// ⚠ **走者の `judge()` を直に呼ぶ**（⚠ 字面を写さない。`CLAUDE.md` §3）。
//   ⚠ **読み込んでも外へは出ない**（⚠ 走者は「自分が起動されたときだけ」動く形にしてある）。
{
  const { judge, NOT_SERVED, PREPENDED } = await import("../../scripts/check-deploy.mjs");

  // ⚠ **配られないものを、⚠ 「届いていない」と読まない**（⚠ `_headers` は 404 になる）
  NOT_SERVED.has("_headers")
    ? ok("配られないもの（_headers）は、照合の対象から外れている")
    : bad("_headers を照合しようとしている"
        + "（⚠ **Cloudflare が消費するので 404 になる。**⚠ **毎回落ちる**）");

  const cases = [
    ["中身が同じなら通る", judge("top.js", "a=1\n", "a=1\n"), true],
    ["⚠ 1 バイト違えば落ちる", judge("top.js", "a=1\n", "a=2\n"), false],
    ["⚠ 取れなかったら落ちる", judge("top.js", "a=1\n", null), false],
    ["⚠ 前に足されただけの robots.txt は通る",
      judge("robots.txt", "User-agent: *\nDisallow: /\n",
        "# Cloudflare\nAllow: /\n\nUser-agent: *\nDisallow: /\n"), true],
    ["⚠ 中身が入っていない robots.txt は落ちる",
      judge("robots.txt", "User-agent: *\nDisallow: /\n", "# Cloudflare\nAllow: /\n"), false],
    ["⚠ robots.txt 以外は、前に足されたら落ちる",
      judge("index.html", "<p>x</p>", "<!--足された-->\n<p>x</p>"), false],
  ];
  const wrong = cases.filter(([, got, want]) => got.ok !== want).map(([label]) => label);
  wrong.length
    ? bad(`照合の判定が仕様どおりでない: ${wrong.join(" ／ ")}`)
    : ok(`照合の判定は、⚠ 許すものと許さないものを分けている（${cases.length} 通り）`);

  // ⚠ **例外に理由が書いてあること**（⚠ 空の許可を作らない。⚠ 増えたときに読み返せるように）
  const noWhy = [...PREPENDED].filter(([, why]) => !why || why.length < 20).map(([k]) => k);
  noWhy.length
    ? bad(`前に足されることを許しているのに、理由が書かれていない: ${noWhy.join(" ／ ")}`)
    : ok(`前に足されることを許しているものは、⚠ 全部に理由がある（${PREPENDED.size} 件）`);
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
  // ⚠ **2026-09-01: β の suite を落とした**（`docs/adr/0080`）。⚠ 残るのは v0.1.0 だけ。
  for (const [suite, group] of [["next", "core"], ["next", "search"]]) {
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
  const { CASES: NEXT } = await import(pathToFileURL(join(ROOT, "test/render/next.mjs")).href);
  const declared = NEXT.length;
  if (seen !== declared) {
    bad3.push(`走者が回すのは ${seen} 件だが、⚠ 書いてあるのは ${declared} 件`);
  }
  if (!seen) {
    bad("実描画のケースを 1 件も数えられなかった（⚠ この検査が何も見ていない）");
  } else if (bad3.length) {
    bad(`分けて回すと件数が合わない（${bad3.length} 件）: ${bad3.join(" ／ ")}`
      + "（⚠ **落ちるのではなく、⚠ 静かに減る。**⚠ 減ったぶんは誰も検査しない）");
  } else {
    ok(`分けて回しても 1 件も落ちない（${seen} 件 × 2 分割・3 分割 ／ 書いてある ${declared} 件と一致）`);
  }
}

// ⚠ **「この画面だけが読む」の節は落とした**（2026-09-01。`docs/adr/0080`）。
//   ⚠ **suite が `next` の 1 つになり、⚠ 割り当てを間違えようが無い。**
//   ⚠ **2 つ目の suite を足したら、⚠ この検査も戻す**（⚠ 間違えると、⚠ 走らないまま緑になる）。

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

// ── ⚠ 「実描画が読まない」という主張を、⚠ 実物の import と突き合わせる ──
// ⚠ **2026-08-24 に踏んだ。**⚠ hidetzu/konjaku#232 で `check.mjs` を 11 本へ割ったとき、
//   ⚠ **`NO_RENDER` が `test/check.mjs` だけを挙げたままだった。**
//   ⚠ **落ちない。**⚠ **多く回す向きに倒れるので、⚠ CI は緑のまま。**
//   ⚠ **検査コードだけを触った PR でも、⚠ 実描画が 5 本（約 9 分）走っていた。**
//
// ⚠ **同じ轍を踏まないために、⚠ 一覧を突き合わせる相手を「別の道」で作る**
//   （`CLAUDE.md` §9）。⚠ **`render.mjs` の `import` を実際にたどる。**
//   ⚠ **`render-scope.mjs` の正規表現を読まない**（⚠ 読むと、⚠ 同じ字を 2 回見るだけになる）。
//
// ⚠ **聞く相手は、⚠ 決める口そのもの**（`--files=`）。⚠ **正規表現を写して真似しない。**
//
// ⚠ **見るのは 2 方向。**⚠ **効くのは 2 つ目のほう。**
//   ① 読まないファイル → ⚠ 回さないと答えること（⚠ 無駄に 9 分走らせない）
//   ② ⚠ **読むファイル → ⚠ 必ず回すと答えること**（⚠ **見張りが外れていないこと**）
{
  const { readFileSync: rfD, existsSync: exD, readdirSync: rdD } = await import("node:fs");
  const { resolve: resD, dirname: dirD, relative: relD } = await import("node:path");
  const SCOPE = join(ROOT, "test/render-scope.mjs");

  // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ 説明に書いたパスを拾う。**
  //   ⚠ **道具は `lib.mjs` の 1 か所から借りる**（⚠ ここで正規表現を持ち直さない）。
  //   ⚠ **行頭の `//` だけ落とす**（`HEAD_COMMENT`）。⚠ **`https://` を巻き込まない形。**
  const bare = (src2) => src2.replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");

  // ⚠ **import をたどる**（⚠ 静的・動的の両方）。⚠ **外部と `node:` は追わない。**
  const readsOf = (entry) => {
    const seen = new Set(), queue = [resD(ROOT, entry)];
    while (queue.length) {
      const f = queue.shift();
      if (seen.has(f) || !exD(f)) continue;
      seen.add(f);
      const src2 = bare(rfD(f, "utf8"));
      // ⚠ **改行をまたぐ import を落とさない**（2026-08-24。⚠ **実際に落とした**）。
      //   ⚠ `import {\n … \n} from "./render/lib.mjs"` の形が ⚠ **1 つも拾えていなかった。**
      //   ⚠ **`[^;\n]` にすると、⚠ 1 行に収まっているものだけが見える。**
      for (const re of [/(?:import|export)[^;]{0,300}?from\s+["']([^"']+)["']/g,
                        /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
        let m;
        while ((m = re.exec(src2))) if (m[1].startsWith(".")) queue.push(resD(dirD(f), m[1]));
      }
    }
    return new Set([...seen].map((f) => relD(ROOT, f)));
  };

  const reads = readsOf("test/render.mjs");
  // ⚠ **`test/` の下の `.mjs` を実際に読む**（⚠ 一覧を書き写さない。⚠ 足したら自動で対象）
  const found = [];
  const scanD = (d) => {
    for (const e of rdD(join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) scanD(rel);
      else if (rel.endsWith(".mjs")) found.push(rel);
    }
  };
  scanD("test");

  // ⚠ **決める口そのものに聞く**（⚠ 正規表現を真似しない）
  const askScope = (list) => execFileSync(process.execPath, [SCOPE, `--files=${list.join(",")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  // ⚠ **当人は外す。**⚠ **回すものを決める本人**なので、⚠ 変えたら実際に回して確かめる
  const SELF = "test/render-scope.mjs";
  const readByRender = found.filter((f) => reads.has(f));
  const notRead = found.filter((f) => !reads.has(f) && f !== SELF);
  const wrongR = [];

  if (!readByRender.length) wrongR.push("render.mjs が test/ の .mjs を 1 つも読んでいない（⚠ たどれていない）");
  if (!notRead.length) wrongR.push("render.mjs が読まない test/ の .mjs が 1 つも無い（⚠ この検査が何も見ていない）");

  // ① ⚠ **読まないものを、⚠ まとめて渡す。**⚠ 1 つでも回ると答えたら、⚠ 空ではなくなる
  if (notRead.length) {
    const said = askScope(notRead);
    if (said) wrongR.push(`読まないはずの ${notRead.length} 件で「${said.split("\n").join(" / ")}」と答える`);
  }
  // ② ⚠ **読むものは、⚠ 1 つずつ聞く**（⚠ まとめると、⚠ 1 つが効いているだけで通ってしまう）
  for (const f of readByRender) {
    const said = askScope([f]);
    if (!said) wrongR.push(`${f} は render.mjs が読むのに「回さない」と答える（⚠ 見張りが外れている）`);
  }

  wrongR.length
    ? bad(`実描画を回すかどうかの判定が、実物の import と食い違う: ${wrongR.join(" ／ ")}`
        + `（⚠ **落ちるのではなく、⚠ 黙って全部走る／黙って見張りが外れる**）`)
    : ok(`実描画を回すかどうかの判定が、render.mjs の import と合っている`
        + `（⚠ 読む ${readByRender.length} 件は全部「回す」・読まない ${notRead.length} 件は「回さない」。`
        + `⚠ ${SELF} は当人なので外した）`);
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
    // ⚠ **2026-09-01 に相手を変えた**（⚠ `peel3d.js` は本番から消えた。`docs/adr/0080`）。
    put("public/top.js", "// b\n");
    git("add", "-A"); git("commit", "-qm", "chore: 3");
    const withCode = runQ("HEAD~1...HEAD");
    if (!withCode.includes('"suite":"next"')) {
      wrongQ.push(`画面に届く変更なのに next を回さない（「${withCode.slice(0, 60)}」）`);
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

// ⚠ **`SHELL` と `TILE_HOSTS` の節は落とした**（2026-09-01。`docs/adr/0080`）。
//   ⚠ **どちらも β 版の Service Worker のもの。**⚠ **v0.1.0 はオフラインを持たない**
//     （Owner 判断）。⚠ **`public/sw.js` は残っているが、⚠ あれは自分を消すためだけの SW。**
//   ⚠ **控える一覧（`SHELL`）も、⚠ 控えるタイルの相手（`TILE_HOSTS`）も持たない。**
//   ⚠ **移行用の SW が本当に自分を消すことは、⚠ `next.mjs` が別に見ている。**
//   ⚠ **オフラインを持つと決めたら、⚠ そのとき改めてここを戻す。**


// ⚠ **問いごとに割った実描画のケースが、⚠ 1 つ残らず走者に届いているか**
//   （2026-08-26。hidetzu/konjaku#277 の 1 本目）。
//
// ⚠ **`check.mjs` には同じ見張りがある**（⚠ 「出した節を 1 つ残らず読み込んでいる」）。
//   ⚠ **`render` 側には無かった。**⚠ **hidetzu/konjaku#232 で踏んだのと同じ形。**
//
// ⚠ **上の「分けて回しても 1 件も落ちない」とは、⚠ 別の問い**（`CLAUDE.md` §3）。
//   ⚠ あちらは ⚠ **走者が数えた数**と ⚠ **`TOP.length + PEEL.length`** を比べる。
//   ⚠ **どちらも親から来るので、⚠ 親が子を取り込み忘れたら、⚠ 両方が同じだけ減る**
//     （⚠ 実証: ⚠ spread を消しても ⚠ **あちらは緑のまま**だった）。
//   ⚠ **こちらは、⚠ 子のファイルを直に読んで、⚠ 親に入っているかを見る**（⚠ 別の道）。
//
// ⚠ **実証（2026-08-26）**: ⚠ `top.mjs` から `...ESCAPE_CASES,` の 1 行を消すと、
//   ⚠ **`--count` は 105 → 102 になるのに、⚠ `npm run render` は落ちない。**
//   ⚠ **180 → 177 件に静かに減るだけ**なので、⚠ **人が数を覚えていないと気づけない。**
//
// ⚠ **`git ls-files` ではなく実物を歩く**（⚠ 追跡前のファイルも見る。`CLAUDE.md` §9）。
// ⚠ **数は数えさせる。**⚠ **一覧を書き写さない**（⚠ 割るたびに古くなる）。
{
  const { readdirSync: rdP } = await import("node:fs");
  const dir = join(ROOT, "test/render");
  // ⚠ **親（走者が suite として読むもの）と、⚠ 子（問いごとに割ったもの）**
  const PARENT = { top: "top.mjs", peel: "peel.mjs" };
  const parts = rdP(dir).filter((f) => /^(top|peel)-[\w-]+\.mjs$/.test(f)).sort();
  const missing = [], empty = [];
  for (const f of parts) {
    const suite = f.split("-")[0];
    // ⚠ **字ではなく、⚠ 実際に読み込んで数える**（⚠ 取り込み名を書き写すと、⚠ 改名で外れる）
    const child = await import(pathToFileURL(join(dir, f)).href).catch(() => null);
    const parent = await import(pathToFileURL(join(dir, PARENT[suite])).href).catch(() => null);
    if (!child?.CASES?.length) { empty.push(f); continue; }
    if (!parent?.CASES) { missing.push(`${f}（親 ${PARENT[suite]} を読めない）`); continue; }
    const names = new Set(parent.CASES.map((c) => c.name));
    const lost = child.CASES.map((c) => c.name).filter((n) => !names.has(n));
    if (lost.length) missing.push(`${f}: ${lost.join("、")}`);
  }
  if (!parts.length)
    ok("実描画のケースは、まだ問いごとに割っていない（top.mjs / peel.mjs の 2 本）");
  else if (empty.length)
    bad(`割ったのにケースが 1 件も無いファイルがある: ${empty.join("、")}`
      + `（⚠ 走者に届かない。⚠ 件数が静かに減る）`);
  else if (missing.length)
    bad(`割ったケースが走者に届いていない: ${missing.join(" ／ ")}`
      + `（⚠ 落ちない。⚠ **件数が減るだけ**なので、⚠ 人が数を覚えていないと気づけない）`);
  else
    ok(`問いごとに割った ${parts.length} ファイルのケースは、全部が親に入っている`
      + `（${parts.join("、")}）`);
}
