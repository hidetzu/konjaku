// 静的検査 — 年代の決め方（⚠ **この地点で選べる段はどれか。⚠ 誰が決めるか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 17 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **なぜこの 4 つをひとまとめにしたか**:
//   ⚠ **どれも「その地点で、⚠ どの年代を見せられるか」を守っている。**
//
//     年代の定義    ⚠ **`verify.js` の 1 か所だけ**（⚠ 写しを持つと 2 画面で答えが割れる）
//     先読み        ⚠ 送っている途中で ⚠ **画面が抜けない**（⚠ ありうる段数すべてで見る）
//     段の作り方    ⚠ **`eras.js` の 1 か所**（⚠ hidetzu/konjaku#170。⚠ **実際に 1 か所ずれていた**）
//     覆っているか  ⚠ `tilesCover`。⚠ **1 枚でも読めた、では駄目**
//
// ⚠ **元の節番号は `2.6` と、⚠ 番号すら無いもの**（⚠ 「6」の中にあった）。
//   ⚠ **離れていた**（⚠ 800 行以上あいだが空いていた）。
//
// ⚠ **`place.mjs`（場所の決め方）とは別。**⚠ あちらは ⚠ **どの場所を見ているか。**
//   ⚠ こちらは ⚠ **その場所の、⚠ いつを見ているか。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { join } from "node:path";
import { PUB, ok, bad, head, src, BLOCK_COMMENT, LINE_COMMENT } from "./lib.mjs";

head("年代の決め方");

// ⚠ peel3d.js の「送っている途中で画面が抜けない」を、実際に全位置で確かめる。
//   このコメントを peel.html に書いた時点では、**この検査は存在しなかった**（2026-08-14）。
//   「check.mjs が確かめている」と書いてあるだけで、LOOKAHEAD=0 にしても全件緑だった。
//   測っていないことを書かない、を検査自身が破っていた。書いたなら、作る。
//   ⚠ 写しではなく peel3d.js の本体を取り出して動かす（bl-format の照合と同じ手）。
//   ⚠ **段の数は地点によって変わる**ようになった（2026-08-16）。その地点に残っている
//     空中写真だけを段にするため、写真の段（明治期を除く）は
//     豊洲 8 / 広島 6 / 長崎 出島 3 になる。
//     → 段の数を1つ決め打ちして確かめるのではなく、**ありうる段数すべて**で見る。
{
  const { readFileSync: rfv } = await import("node:fs");
  const html = rfv("public/peel3d.js", "utf8");
  const m = /const LOOKAHEAD = (\d+)[\s\S]*?function visibleEras\(t, nPhoto\)\{([\s\S]*?)\n\}/.exec(html);
  const sw = /const swaleVisible = \(t, nPhoto\) => ([^;]+);/.exec(html);
  if (!m) bad("peel3d.js の visibleEras が読めない（この検査が何も見ていない）");
  else {
    // ⚠ 本体に return がある。さらに包むと構文エラーになる
    const fn = new Function("t", "nPhoto", "LOOKAHEAD", "preloadAll", m[2]);
    // 写真が1年代も残っていない地点（現在だけ）から、全年代が残っている地点まで。
    // ⚠ 年代の定義は verify.js の1か所だけなので、上限もそこから読む
    const vf = rfv("public/verify.js", "utf8");
    const nEras = (vf.match(/const ERAS = \[([\s\S]*?)\];/)?.[1].match(/\{ id:/g) ?? []).length;
    if (!nEras) bad("verify.js の ERAS を読めない（この検査が何も見ていない）");
    const holes = [], counts = [];
    for (let nPhoto = 1; nPhoto <= nEras + 1; nPhoto++) {
      const max = nPhoto * 100;      // 明治期は nPhoto 段目（＝写真の段の次）
      for (let v = 0; v <= max; v++) {
        const t = v / 100, i = Math.min(Math.floor(t), nPhoto - 1);
        const s = fn(t, nPhoto, +m[1], false);
        // 不透明度が 0 より大きい段（k===i と k===i+1）は必ず含まれること
        if (!s.has(i) || (i + 1 < nPhoto && !s.has(i + 1))) holes.push(`${nPhoto}段:${v}`);
        counts.push(s.size);
      }
    }
    const worst = Math.max(...counts);
    holes.length
      ? bad(`送っている途中で画面が抜ける位置がある（${holes.length} 箇所。例 ${holes.slice(0, 5)}）`)
      : worst > 2 + (+m[1])
        ? bad(`先読みが増えている（同時に ${worst} 段。上限 ${2 + (+m[1])}）。`
            + "国土地理院への枚数が静かに戻る")
        : ok(`年代の先読みが、1〜${nEras + 1} 段のすべて（${counts.length} 位置）で必要十分`
            + `（LOOKAHEAD=${m[1]}／同時 最大${worst} 段${sw ? "／明治期の重ねも定義あり" : ""}）`);
  }

  // ⚠ **年代の定義（id・ラベル・拡張子・ズーム範囲）を2か所に置かない。**
  //   置いていたときは、トップが「広島に残っているのは 5 年代」と正しく答えている横で、
  //   /peel が固定 8 段を出し、存在しない年代の写真タイルへ 404 を 202 件送っていた
  //   （2026-08-16 実測。長崎 出島では 491 件）。掟: 同じ問いに答える実装を2つ持たない。
  //   ⚠ コメントを先に落とす（説明に書いた年代IDを検査自身が拾うため）。
  {
    const bare = (s) => s.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
    const ids = ["ort_riku10", "ort_USA10", "ort_old10", "gazo1", "gazo2", "gazo3", "gazo4"];
    const vf = bare(rfv("public/verify.js", "utf8"));
    const missing = ids.filter((id) => !vf.includes(id));
    if (missing.length) bad(`verify.js に年代の定義が無い: ${missing.join("、")}（この検査が何も見ていない）`);
    const dup = [];
    for (const f of ["peel3d.js", "index.html"]) {
      const s = bare(rfv(`public/${f}`, "utf8"));
      const hit = ids.filter((id) => s.includes(id));
      if (hit.length) dup.push(`${f}（${hit.join("、")}）`);
    }
    dup.length
      ? bad(`年代の定義が verify.js の外にもある: ${dup.join(" / ")}`
          + "（写しを持つと、トップと /peel が同じ地点に別の答えを出す）")
      : ok(`年代の定義は verify.js の1か所だけ（${ids.length} 年代）`);
  }
}

  // ============================================================
  // 段の作り方は 1 か所（public/eras.js）
  // ============================================================
  // ⚠ **同じ問い（この地点で選べる段はどれか）に、⚠ 2 つの実装が答えていた**
  //   （hidetzu/konjaku#170。⚠ トップの `buildFrames` と `/peel` の `stepsFrom`）。
  // ⚠ **すでに 1 か所ずれていた**（実測 2026-08-23・`main` = `9b6e83b`）:
  //   ⚠ **トップは明治期を「判定できたときだけ」足し、⚠ `/peel` は無条件に足していた。**
  {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ⚠ AC 1: DOM も地図も持たない（⚠ Node から呼べる条件）
    const src2 = src["eras.js"];
    if (src2 == null) fails.push("public/eras.js を読めない（この検査が何も見ていない）");
    else {
      // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ 説明に書いた字を自分で拾う（掟）
      const code = src2.replace(BLOCK_COMMENT, " ").split("\n")
        .filter((l) => !l.trim().startsWith("//")).join("\n");
      // ⚠ **末尾の IIFE 引数だけは除く**（`photos.js` ほか 7 つと同じ形。
      //   ⚠ `(typeof window === "undefined" ? globalThis : window)`）。
      //   ⚠ **ここを数えると、⚠ この repo の作法そのものが落ちる。**
      const body = code.replace(/\(typeof window[^)]*\);?\s*$/, "");
      for (const w of ["document", "window", "maplibregl", "map.", "querySelector", "getElementById"])
        yes(!body.includes(w), `public/eras.js が ${w} を触っている（Node から呼べなくなる）`);
    }

    // ⚠ AC 2: Node から呼べて、⚠ 全組み合わせを回せる
    await import(`file://${join(PUB, "eras.js")}`);
    const E = globalThis.KonjakuEras;
    if (!E) fails.push("public/eras.js を読み込めない（この検査が何も見ていない）");
    else {
      const LATEST = { id: "now", label: "現在" };
      const MEIJI = { id: "swale", label: "明治期", meiji: true };
      const era = (id, state, blank = false) => ({ id, label: id, state, blank });

      // ⚠ **落とし方**（⚠ 2 画面で一致していたものを、⚠ そのまま 1 か所に持つ）
      yes(E.keepEra(era("a", "unreachable")), "読めなかった年代を落としている（取れなかった ≠ 無い）");
      yes(E.keepEra(era("a", "ok")), "読めた年代を落としている");
      yes(!E.keepEra(era("a", "ok", true)), "白紙（撮影範囲の外）を段に出している");
      yes(!E.keepEra(era("a", "absent")), "404（写真が無い）を段に出している");

      // ⚠ **明治期は、⚠ 判定できたときだけ**（⚠ ADR 0012: 無いものを並べない）
      const photos = { eras: [era("x", "ok"), era("y", "unreachable"), era("z", "ok", true)] };
      const withM = E.stepsOf({ photos, latest: LATEST, meiji: MEIJI, hasMeiji: true });
      const noM = E.stepsOf({ photos, latest: LATEST, meiji: MEIJI, hasMeiji: false });
      yes(withM[0]?.id === "swale", `明治期が先頭に無い: ${withM.map((e) => e.id).join()}`);
      yes(!noM.some((e) => e.id === "swale"),
        `明治期のデータが無いのに段に出している: ${noM.map((e) => e.id).join()}`);
      yes(noM.length === withM.length - 1, "明治期を外したのに段の数が変わっていない");

      // ⚠ **並びは古い順**（⚠ 向きは呼ぶ側が決める）。⚠ 現在は最後
      yes(withM.at(-1)?.id === "now", `「現在」が最後に無い: ${withM.map((e) => e.id).join()}`);
      yes(withM.filter((e) => e.id === "z").length === 0, "白紙が段に混ざっている");
      yes(withM.filter((e) => e.id === "y").length === 1, "読めなかった年代が段から消えている");

      // ⚠ **写真そのものが取れなかったときは、⚠ 何も間引かない**（掟）
      const all = [era("x", "ok"), era("y", "ok")];
      yes(E.stepsOf({ all, latest: LATEST, meiji: MEIJI, hasMeiji: true }).length === 4,
        "判定が落ちたときに段を間引いている（確かめられなかったを「無い」にしている）");

      // ⚠ **いま何段目か**（⚠ 見つからないときは -1。⚠ 0 に丸めない）
      yes(E.indexOf(withM, "x") > 0, "段の位置を返していない");
      yes(E.indexOf(withM, "無い") === -1, "知らない段を 0 段目にしている");

      // ⚠ **前後は端で止まる**（⚠ 回り込まない）
      yes(E.step(withM, 0, -1) === 0, "左端で回り込んでいる");
      yes(E.step(withM, withM.length - 1, 1) === withM.length - 1, "右端で回り込んでいる");

      // ⚠ **復元は種類で返す**（⚠ 字はここで作らない。`words.js` が持つ）
      yes(E.resolve(withM, null).kind === "none", "復元するものが無いのに答えている");
      yes(E.resolve(withM, "x").kind === "ok", "在る年代を復元できていない");
      yes(E.resolve(withM, "無い").kind === "gone", "無い年代を「復元できた」と答えている");
      const gone = E.resolve(withM, "無い");
      yes(!/[ぁ-んァ-ン一-龥]{4,}/.test(JSON.stringify(gone).replace(/無い/g, "")),
        `復元の答えが字を持っている（字は words.js の担当）: ${JSON.stringify(gone)}`);
    }

    // ⚠ AC 3・AC 6: 両画面が同じ 1 か所を呼び、⚠ 段を作り直すコードが残っていない
    for (const [f, code] of [["public/top.js", src["top.js"]],
                             ["public/peel3d.js", src["peel3d.js"]]]) {
      if (code == null) { fails.push(`${f} を読めない`); continue; }
      yes(code.includes("KonjakuEras.stepsOf"), `${f} が段の作り方を 1 か所から借りていない`);
      // ⚠ **コメントを先に落とす**（⚠ 説明に書いた字を拾わない）
      const bare = code.replace(BLOCK_COMMENT, " ").split("\n")
        .filter((l) => !l.trim().startsWith("//")).join("\n");
      // ⚠ **落とし方をもう一度書いていないこと**（⚠ ずれの再発）。
      //   ⚠ **`unreachable` は段以外にも出る**（⚠ `peel3d.js` の地形分類）。
      //   ⚠ **段の話かどうかで見る**（⚠ 白紙の判定は段にしか無い）。
      yes(!/\.blank/.test(bare), `${f} が白紙の判定を持っている（段の作り方は 1 か所）`);
      yes(!/eras\s*\?\?\s*\[\]/.test(bare) && !/photos\?\.eras/.test(bare),
        `${f} が写真の年代から段を組み直している（段の作り方は 1 か所）`);
    }

    // ⚠ **読み込み忘れを捕まえる**（⚠ 入れ忘れると、⚠ オフラインで段が作れない）
    yes((src["sw.js"] ?? "").includes('"/eras.js"'), "sw.js の SHELL に /eras.js が無い");
    for (const f of ["peel.html", "index.html"])
      yes((src[f] ?? "").includes("eras.js"), `${f} が eras.js を読み込んでいない`);

    if (fails.length) bad(`段の作り方が 1 か所になっていない（${fails.length} 件）: ${fails.join(" / ")}`);
    else ok(`段の作り方は public/eras.js の 1 か所（DOM 0 件・Node から全組み合わせ・両画面が同じ口）`);
  }


// 地表のタイルが「その地点を覆っているか」の計算（peel3d.js の tilesCover）。
// ⚠ ブラウザでは、狙ったタイルだけを届かせる／届かせない状態を作れない。
//   関数を取り出して直に回す。⚠ **取り出せなくなったら落とす**（黙って素通りさせない）。
  // ⚠ **2026-08-20 に public/photos.js の 1 か所へ移した。**⚠ 見ている主張は同じ。
  {
    await import(`file://${join(PUB, "photos.js")}`);
    const f = globalThis.KonjakuPhotos?.covers;
    if (!f) bad("photos.js の covers を取り出せない（この検査が何も見ていない）");
    else {
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const Z = 16;
    // 同じ段（z16）。中心が入っているタイルだけが根拠になる
    yes(f(["16/58210/25806"], 58210.5, 25806.5, Z) === true, "同じ段で覆っている");
    yes(f(["16/58210/25806"], 58211.5, 25806.5, Z) === false, "隣のタイルは根拠にならない");
    // ⚠ 地図は表示ズーム+1段で取ることがある。段を決め打ちしない
    yes(f(["17/116421/51613"], 58210.5, 25806.5, Z) === true, "1段下（z17）でも覆っていると分かる");
    yes(f(["15/29105/12903"], 58210.5, 25806.5, Z) === true, "1段上（z15）でも覆っていると分かる");
    yes(f([], 58210.5, 25806.5, Z) === false, "1枚も来ていなければ覆っていない");
    // ⚠ 「1枚でも読めた」では駄目。別の場所のタイルは、この地点の根拠にならない
    yes(f(["16/1/1", "16/2/2"], 58210.5, 25806.5, Z) === false, "別の場所のタイルは根拠にならない");
    fails.length
      ? bad(`tilesCover の単体テストが失敗（${fails.length} 件）: ${fails.join(" / ")}`)
      : ok(`tilesCover を動かして確認（同じ段・上下1段・別の場所・空）`);
  }
}
