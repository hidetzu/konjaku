// 静的検査 — リンク（⚠ **押した先が、⚠ 実在するか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 6 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」2357 行の中にあった。**
//   ⚠ 49 件の主張を読んだところ、⚠ **節の名前が指しているのは最初の 3 件だけ**だった
//     （⚠ CSS ／ 配っている現物 ／ Domain を動かす ／ 秘密 …が同じ節に積まれていた）。
//   ⚠ **名前が指していたものを、⚠ そのまま独立させた。**
//
// ⚠ **ここが守っているもの**:
//     外部の URL              ⚠ 外へ出る先が生きているか（⚠ `--links` のときだけ実際に叩く）
//     このブランチで足した URL ⚠ 新しく足したものだけを見る（⚠ 既存の腐りで止めない）
//     `npm run X` の実在       ⚠ **押しても何も起きない導線を置かない**（ADR 0026）
//     文書どうしのリンク       ⚠ 同上
//     ADR の実在              ⚠ 同上
//     Issue 番号              ⚠ **裸の番号を書かない**（⚠ 移行後は別のものを指す）
//     manifest の行き先        ⚠ ホーム画面のショートカットが 404 にならないこと
//
// ⚠ **`CHECK_LINKS` / `NEW_LINKS` も一緒に持ってきた**（⚠ ここでしか使わない）。
// ⚠ **`SITE` は `lib.mjs` へ出した**（⚠ OGP も見るので 2 か所以上が共有する）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { ROOT, PUB, SITE, ok, bad, warn, head, htmlFiles, jsFiles, src } from "./lib.mjs";

// ⚠ **外へ実際に出るかどうかの指定**（⚠ `test/check.mjs` から一緒に持ってきた）。
const CHECK_LINKS = process.argv.includes("--links");
// --links-new / --links-new=<ref>。指定が無ければ null（外へ出ない）
const NEW_LINKS = (() => {
  const a = process.argv.find((x) => x === "--links-new" || x.startsWith("--links-new="));
  return a === undefined ? null : (a.split("=")[1] ?? "");
})();

// ---------- 6. 外部リンク ----------
// ⚠ **PR ごとに外部サイトを叩かない**という方針は変えていない（他所への負荷）。
//   代わりに、叩かなくてもできることを PR でやる。
//
//   現在のリンク構成:
//     全部叩く                     8 本／PR（重複除去後・5 ホスト）
//     変更ファイルのリンクだけ     index.html が大半の URL を持つので十分には減らない
//     **新しく足した URL だけ**    平均 0.00 本／PR・最大 0 本   ← これを採る
//     収集だけ（外へ出ない）       0 本／PR                      ← これも採る
//
// ⚠ この Issue が挙げていた「失敗したまま main にマージした」事故（2026-08-14）を追うと、
//   壊れていたのは**リンクではなく検査自身**だった（readdir が返すディレクトリを
//   readFile して EISDIR）。収集を常に走らせれば、**外へ1本も出さずに**その型を PR で捕まえる。
head("6. 外部リンク");
{
  const urls = new Set();
  // ⚠ docs の下は入れ子になっている（adr/ ができた）。readdir の結果をそのまま
  //   readFile に渡すと、ディレクトリで EISDIR で落ちる。実際に落ちた（2026-08-14）。
  //   ⚠ この検査は PR では skip され、main にマージされてから初めて走る。
  //     つまり**壊れていることは、マージするまで分からない**。だから再帰で拾い切る。
  const mdFiles = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...await mdFiles(p));
      else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
  };
  const docs = await mdFiles(join(ROOT, "docs"));
  const texts = [...Object.values(src),
    ...(await Promise.all(docs.map((d) => readFile(d, "utf8")))),
    await readFile(join(ROOT, "README.md"), "utf8")];
  for (const t of texts) {
    for (const m of t.matchAll(/href="(https:\/\/[^"${]+)"/g)) urls.add(m[1]);
    for (const m of t.matchAll(/\]\((https:\/\/[^)${]+)\)/g)) urls.add(m[1]);
  }
  // ---- ここまでが「収集」。外へは1本も出ていない ----
  // ⚠ 0 件で緑にしない。走査が壊れて何も拾えなくなったとき、
  //   「リンクは全部生きている」と報告するのがいちばん危ない。
  const ext = [...urls].filter((u) => !u.startsWith(SITE)).sort();
  ext.length
    ? ok(`外部の URL を ${ext.length} 本拾った（${new Set(ext.map((u) => new URL(u).host)).size} ホスト）`)
    : bad("外部の URL を1本も拾えていない（走査が壊れている可能性）");

  // ---- ここから先だけが、実際に外へ出る ----
  // 何を叩くかは3通り:
  //   --links            全部（main へのマージ後と、週次）
  //   --links-new[=ref]  ref から見て**新しく足した URL だけ**（PR）
  //   指定なし           叩かない
  let targets = [];
  if (CHECK_LINKS) targets = ext;
  else if (NEW_LINKS !== null) {
    // ⚠ 比べる相手が取れないときに「新しいものは無い」と言わない。
    //   それは「取れなかった」を「無い」と言うのと同じ（掟）。取れなければ全部叩く。
    const base = NEW_LINKS || "origin/main";
    let before = null;
    try {
      const { execFileSync: ex } = await import("node:child_process");
      const at = (p) => { try { return ex("git", ["show", `${base}:${p}`], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
                          catch { return ""; } };  // その ref に無いファイル＝中身は空
      const list = ex("git", ["ls-tree", "-r", "--name-only", base], { encoding: "utf8" })
        .split("\n").filter((p) => /\.(html|js|md)$/.test(p) && !p.startsWith("node_modules"));
      before = new Set();
      for (const p of list) {
        const t = at(p);
        for (const m of t.matchAll(/href="(https:\/\/[^"${]+)"/g)) before.add(m[1]);
        for (const m of t.matchAll(/\]\((https:\/\/[^)${]+)\)/g)) before.add(m[1]);
      }
    } catch (e) {
      warn(`比べる相手（${base}）を読めなかったので、全部叩く: ${String(e.message).slice(0, 60)}`);
    }
    if (before === null) targets = ext;
    else {
      targets = ext.filter((u) => !before.has(u));
      targets.length
        ? ok(`このブランチで新しく足した URL は ${targets.length} 本（${base} と比べた）`)
        : ok(`このブランチで新しく足した URL は 0 本（${base} と比べた）。外へは出ない`);
    }
  }

  const UA = "konjaku-link-check/1.0 (+https://konjaku.hidetzu.work)";
  // ⚠ 到達できない理由を、リンク切れと混ぜない。
  //   実測（2026-08-14）: www.gsi.go.jp は古い TLS 再ネゴシエーションを使っていて、
  //   Node の fetch が既定で拒否する（ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED）。
  //   curl では 200 が返る。**リンクは生きている。**
  //   ⚠ 相手の TLS 設定のために、こちらの安全側の既定を緩めない。
  //     代わりに理由を名指しして、「到達できず」と「リンク切れ」を画面で区別する。
  //     毎回同じ2件が理由不明で出続けると、それが平常になって本当の切れを見逃す。
  const REASON = (e) => (e?.cause?.code === "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED"
    ? "相手が古い TLS。Node が既定で拒否（リンクは生きている）"
    : (e?.cause?.code ?? e?.name ?? "原因不明"));
  // ⚠ **新しく足した URL だけは、到達できなければ落とす。**
  //   既存のリンクが一時的に落ちているのは相手の都合だが、**いま自分が足した URL に
  //   一度も到達できない**のは、ほぼこちらの打ち間違い。
  //   実際、パスの打ち間違いは 404 で捕まるのに、**ドメインの打ち間違いは ENOTFOUND で
  //   警告どまり**だった（2026-08-15 に実測。CI は緑のまま通った）。
  //   ⚠ 相手の一時的な不調で止めないために、1回だけ再試行する。
  //   ⚠ 既知の TLS の件（www.gsi.go.jp。リンクは生きている）は落とさない。
  const strict = !CHECK_LINKS && NEW_LINKS !== null;
  const TLS = "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED";
  // ⚠ 自分のリポジトリの検査バッジは、**private のあいだ匿名では 404**（実測 2026-08-15）。
  //   ⚠ ここを素通りさせるだけにすると、**public にしたあと本当に壊れても気づけない**。
  //   だから 404 のときだけ理由付きの警告に落とし、**200 なら普通に通す**。
  //   public 化すれば 200 になってこの分岐に入らなくなる。**消し忘れても害が出ない形**にする。
  const OWN_ACTIONS = /^https:\/\/github\.com\/[^/]+\/konjaku\/actions\//;
  for (const u of targets) {
    let err = null;
    for (let i = 0; i < (strict ? 2 : 1); i++) {
      try {
        const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow",
          signal: AbortSignal.timeout(20000) });
        if (r.ok) ok(`${r.status} ${u}`);
        else if (r.status === 404 && OWN_ACTIONS.test(u))
          warn(`到達できず ${u}（自分のリポジトリが private のあいだは匿名で 404。public 化で解消する）`);
        else bad(`${r.status} ${u}`);
        err = null; break;
      } catch (e) { err = e; }
    }
    if (!err) continue;
    (strict && err?.cause?.code !== TLS)
      ? bad(`足したばかりの URL に到達できない ${u}（${REASON(err)}）。打ち間違いを疑う`)
      : warn(`到達できず ${u}（${REASON(err)}）`);
  }
  if (!CHECK_LINKS && NEW_LINKS === null)
    console.log("  （生死は見ていない。--links で全部／--links-new で足した分だけ）");
}
// ⚠ 文書やテンプレートに書いてある `npm run X` が、実在すること。
//   実際に踏んだ（2026-08-15）: docs/SPEC.md が `npm run search-check` と書いていたが、
//   本当の名前は `npm run check-search` だった。読んだ人が打っても動かない。
//   件数がずれるのは見た目の問題だが、**コマンド名の誤りは押して何も起きない導線**で、
//   この製品が置かないと決めているもの（掟: 押しても何も起きない導線を置かない）。
{
  const { readFileSync: rf, readdirSync: rd } = await import("node:fs");
  const scripts = Object.keys(JSON.parse(rf("package.json", "utf8")).scripts ?? {});
  // ⚠ 無い場所を渡されても落とさない（.claude はまだ無いリポジトリもある）
  const walk = (d) => { try { return rd(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]); } catch { return []; } };
  const files = [...walk("docs"), ...walk(".github"), ...walk(".claude"),
    "README.md", "CLAUDE.md"]
    .filter((f) => /\.(md|yml|yaml)$/.test(f));
  const miss = [];
  for (const f of files) {
    let s = ""; try { s = rf(f, "utf8"); } catch { continue; }
    for (const m of s.matchAll(/npm run ([a-z0-9:-]+)/g))
      if (!scripts.includes(m[1])) miss.push(`${f}: npm run ${m[1]}`);
  }
  miss.length
    ? bad(`書いてあるのに package.json に無いコマンド: ${[...new Set(miss)].join("、")}`)
    : ok(`文書の \`npm run\` は全部実在する（${files.length} ファイル）`);

  // ⚠ 文書どうしのリンクが、実在するファイルを指していること。
  //   実際に踏んだ（2026-08-15）: README の「状態」節が
  //   README が削除済みの文書を指したままで、内部リンクが2本とも 404 だった。
  //   ⚠ 3節の内部リンク検査は `public/*.html` の href しか見ておらず、ここは素通りしていた。
  //   （掟: 押しても何も起きない導線を置かない。押した結果が 404 なら、なお悪い）
  {
    const { existsSync: ex2 } = await import("node:fs");
    const mds = files.filter((f) => f.endsWith(".md"));
    const dead = [];
    let links = 0;
    for (const f of mds) {
      let s = ""; try { s = rf(f, "utf8"); } catch { continue; }
      for (const m of s.matchAll(/\]\(([^)\s]+)\)/g)) {
        const t = m[1];
        if (/^(https?:|#|mailto:)/.test(t)) continue;   // 外部URLと見出しアンカーは別の話
        links++;
        // ⚠ 末尾の #見出し を落としてから見る。付いたままだと全部「無い」になる
        const rel = t.split("#")[0];
        if (!rel) continue;
        const target = join(dirname(join(ROOT, f)), rel);
        if (!ex2(target)) dead.push(`${f} → ${t}`);
      }
    }
    dead.length
      ? bad(`文書のリンクが、実在しないものを指している: ${dead.join("、")}`)
      : ok(`文書どうしのリンクは全部生きている（${mds.length} ファイル / ${links} 本）`);
  }

  // ⚠ **コード中のコメントから ADR を指しているものも見る。**
  //   上の検査は .md のマークダウンリンクしか見ないので、
  //   コメントに素のパスで書いた `docs/adr/00xx-….md` は素通りする。
  //   ⚠ ADR の名前を変えたら黙って壊れる。コメントから ADR を指すなら、
  //     その参照が生きていることまで追跡する。
  {
    const { existsSync: ex3 } = await import("node:fs");
    const cands = [...htmlFiles, ...jsFiles].map((f) => [f, src[f]])
      .concat([["worker.js", await readFile(join(ROOT, "worker.js"), "utf8").catch(() => "")]])
      // ⚠ **suite に割ったので、⚠ 走者だけ見ても足りない**（2026-08-22）
      // ⚠ **検査は `test/`、⚠ 運用は `scripts/`**（2026-08-22 に分けた）。⚠ **両方を見る。**
      .concat(await Promise.all(["test/check.mjs", "test/render.mjs", "test/search-check.mjs",
        "test/render-scope.mjs", "test/render/lib.mjs", "test/render/top.mjs", "test/render/peel.mjs"]
        .map(async (f) => [f, await readFile(join(ROOT, f), "utf8").catch(() => "")])));
    const dead = [];
    let refs = 0;
    for (const [f, t] of cands) {
      for (const m of (t ?? "").matchAll(/docs\/adr\/[0-9]{4}-[^\s)）」`'"]+\.md/g)) {
        refs++;
        if (!ex3(join(ROOT, m[0]))) dead.push(`${f} → ${m[0]}`);
      }
    }
    dead.length
      ? bad(`コードから指している ADR が実在しない: ${dead.join("、")}`)
      : ok(`コードから指している ADR は全部実在する（${refs} 箇所）`);
    // ⚠ **0 件で緑にしない。** ADR 参照が全部消えても通ってしまう
    //   （前の版はそうなっていた。レビューで指摘された）。
    if (!refs) bad("コードから ADR を指している箇所が1つも無い（この検査が何も見ていない）");
  }

  // ⚠ **このリポジトリの Issue 番号を、コードや文書に埋めない。**
  //   新しいリポジトリでは番号が 1 から振り直され、**同じ番号が別の Issue を指す**。
  //   ⚠ 前の版はこれを検出できず、**取り残しがあるのに CI が緑のままだった**
  //     （2026-08-15 のレビューで指摘。私の走査は番号の範囲と拡張子を絞りすぎていた）。
  //   直していないことは、番号ではなくコメントと ADR に名前で書く。
  {
    const { execFileSync: ex4 } = await import("node:child_process");
    let files = [];
    try {
      files = ex4("git", ["ls-files"], { encoding: "utf8", cwd: ROOT }).split("\n")
        .filter((f) => f && !/^public\/(vendor|data)\//.test(f) && !/\.(svg|jsonl)$/.test(f));
    } catch { bad("git ls-files が使えない（この検査が何も見ていない）"); }
    // ⚠ **binary は中身で外す。拡張子で並べない。**
    //   前の版は拡張子を並べていて、フォントを1つ足しただけで落ちた
    //   （2026-08-15 実測。`.otf` を utf8 として読むと、番号らしき並びが
    //   たまたま出て「Issue 番号が埋まっている」と言った）。
    //   ⚠ ここに実例の番号を**書かない**。書くと、この検査が自分のコメントを拾う
    //     （CLAUDE.md「検査を説明するコメントに書いた字面を検査自身が拾う」）。
    //   ⚠ 拡張子を足して直すと、**次の形式でまた踏む**。NUL を含むかで見る。
    // ⚠ 「#数字」の形をしていても、Issue 番号ではないものがある。
    //   ⚠ **行ごとに除外しない。出てきた「#数字」1件ずつ、その場で見る。**
    //     行で除外すると、同じ行に本物が混ざったとき丸ごと見逃す
    //     （最初はそう書いていて、レビューで指摘された）。
    const hits = [];
    for (const f of files) {
      let buf; try { buf = await readFile(join(ROOT, f)); } catch { continue; }
      if (buf.includes(0)) continue;
      const t = buf.toString("utf8");
      t.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/#(\d{1,4})\b/g)) {
          const at = m.index;
          const before = line.slice(0, at);
          const after = line.slice(at);
          // ① HTML の実体参照（アポストロフィなどの数値参照）。直前が & か | で、直後が数字と ;
          if (/&[a-z|(]*$/.test(before) && /^#\d+;/.test(after)) continue;
          // ② URL の断片（地理院地図のズーム/緯度/経度）。同じ行の、この位置より前に URL がある
          if (/https?:\/\/[^\s"'`)]*$/.test(before)) continue;
          // ③ リポジトリ名つきの参照。⚠ **よそのリポジトリだけではない。**
          //    自分のリポジトリでも、名前つきなら移行後も同じ Issue を指す
          //    （落とすのは裸の番号。振り直されると別のものを指すのはそちらだけ）。
          if (/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(before)) continue;
          // ④ 例示。⚠ **「例」の字が行にあるだけでは通さない。**
          //    `#<番号>` のような、実在の番号でない書き方だけを許す
          if (/^#<[^>]+>/.test(after)) continue;
          // ⑤ 先頭が 0 のものは Issue 番号ではない。⚠ Issue は 1 から振られ、
          //    0 埋めもされない。**16進の色**（`#000`）がここに来る。
          //    ⚠ 色を「色だから」と外すと、文脈の判定が要って脆くなる。
          //    **番号の側の性質**（0 で始まらない）で外すほうが崩れない。
          if (m[1].startsWith("0")) continue;
          hits.push(`${f}:${i + 1} ${m[0]}`);
        }
      });
    }
    hits.length
      ? bad(`このリポジトリの Issue 番号が埋まっている: ${hits.join("、")}`
          + `（新しいリポジトリでは別の Issue を指す。番号ではなく、`
          + `コメント単体で分かる書き方＋ADR を使うこと）`)
      : ok(`コード・文書に、この repo の Issue 番号は埋まっていない（${files.length} ファイルを走査）`);
  }
}

// ⚠ ホーム画面に追加した人が押すショートカットが、実在する行き先を指していること。
//   実際に踏んだ（2026-08-15）: `{"name":"昔と今を重ねて比べる","url":"/eras"}` が
//   残っていたが `public/eras.html` は撤去済みで、**押すと 404** だった。
//   ⚠ manifest は sw.js の SHELL に入っているので、**ホーム画面に追加済みの端末には
//     その死んだショートカットがキャッシュされている**。
//   ⚠ この repo は manifest を一度も検査していなかった。ここが初めて。
//   （掟: 押しても何も起きない導線を置かない。押した結果が 404 なら、なお悪い）
{
  const raw = await readFile(join(PUB, "manifest.webmanifest"), "utf8").catch(() => null);
  if (!raw) bad("manifest.webmanifest が読めない");
  else {
    let m = null;
    try { m = JSON.parse(raw); } catch (e) { bad(`manifest.webmanifest が JSON として壊れている: ${e.message}`); }
    if (m) {
      // start_url と shortcuts の url、icons の src を全部見る
      const targets = [
        ...(m.start_url ? [["start_url", m.start_url]] : []),
        ...(m.shortcuts ?? []).map((s) => [`shortcut「${s.name}」`, s.url]),
        ...(m.icons ?? []).map((i) => ["icon", i.src]),
      ];
      if (!targets.length) bad("manifest に見るべき行き先が1つも無い（この検査が何も見ていない）");
      const dead = [];
      for (const [what, u] of targets) {
        // クエリと素片を落として、配信されるファイルに直す
        const p = String(u).split("?")[0].split("#")[0].replace(/^\//, "") || "index.html";
        // ⚠ 拡張子が無いものは Workers Assets が .html を足して返す（serve.js も同じ）
        if (existsSync(join(PUB, p)) || existsSync(join(PUB, `${p}.html`))) continue;
        dead.push(`${what} → ${u}`);
      }
      dead.length
        ? bad(`manifest の行き先が実在しない: ${dead.join("、")}（押すと 404 になる）`)
        : ok(`manifest の行き先は全部実在する（${targets.length} 件）`);
    }
  }
}
