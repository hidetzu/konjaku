// 静的検査 — 答えの組み立て（⚠ **利用者の問いに、⚠ どう答えるか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 12 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**（⚠ どれも **DOM も地図も持たない**ので、⚠ 全部の枝を回せる）:
//     層（`layersOf`）    ⚠ **確実性の高い順**（第1層 → 第2層 → 第3層）。ADR 0030
//                         ⚠ **第1層は常に立つ ／ 数字には分母 ／ 出せない理由は層ごと**
//     `WORD`（/peel）     ⚠ 高さの出どころ 3 通り ／ 建物 0 件の理由 4 通り
//     `TOPWORD`（トップ）  ⚠ **記録なし と 判定できません を分ける**
//                         ⚠ **読めなかった が「境目」より先**
//     内訳の分け方        ⚠ **判定できなかった分を、⚠ 分類の行にしない**
//
// ⚠ **どれも掟 §1 の核心**（⚠ **取れなかった ≠ 無い**）を、⚠ **字ではなく判断で見ている。**
//
// ⚠ **`land.mjs`（土地の区分）とは別。**⚠ あちらは **ラスタをどう読むか**。
//   ⚠ こちらは ⚠ **読んだ結果を、⚠ どう言うか。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { join } from "node:path";
import { PUB, ok, bad, head, src } from "./lib.mjs";

// ⚠ **要るものを、⚠ ここで自分で読み込む**（2026-08-24。⚠ **実際に 2 回踏んだ**）。
//   ⚠ **`layersOf` は `KonjakuWords.layerTitle` を、⚠ `WORD` は `KonjakuProv` を呼ぶ。**
//   ⚠ **前は「他の節が先に読み込んでいた」ことに頼っていた**
//     （⚠ 同じファイルの中にあったので、⚠ 順番が保証されていた）。
//   ⚠ **別ファイルへ出した瞬間に落ちた**:
//     ⚠ `ReferenceError: KonjakuWords is not defined`
//     ⚠ `TypeError: Cannot read properties of undefined (reading 'NOTYET')`（⚠ `KonjakuProv`）
//   ⚠ **`import` の副作用に頼らない。**⚠ **要るものは、⚠ 自分で読む。**
//   ⚠ **2 回読み込んでも困らない**（⚠ ESM は 1 回しか評価しない）。
//   ⚠ **落ちてくれたので気づけた**（⚠ 黙って通らなかった）。
// ⚠ **`esc.js` は読み込まない。**⚠ `window` を要求するので Node から読めない。
//   ⚠ **元のコードが `globalThis.KonjakuEsc?.esc ?? ((x) => String(x))` と、
//     ⚠ 無いときの代わりを持っている。**⚠ **そこは変えない。**
for (const f of ["swale.js", "prov.js", "words.js"])
  await import(`file://${join(PUB, f)}`);

head("答えの組み立て");

// 層を組み立てるところ（peel3d.js の layersOf）。
// ⚠ **確実性の高い順**（第1層 → 第2層 → 第3層）。ADR 0030 と docs/DOMAIN.md §1。
// ⚠ 実測（2026-08-19）: 層という値が無かったので、4 地点とも順番が違った。
{
  const src2 = src["peel3d.js"] ?? "";
  const m = /\nfunction layersOf\(area, lf\)\{[\s\S]*?\n\}\n/.exec(src2);
  const mw = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src2);
  if (!m || !mw) bad("peel3d.js の layersOf を取り出せない（この検査が何も見ていない）");
  else {
    const [L, W] = new Function("KonjakuSwale", "KonjakuProv", "bldWhyArea",
      `${mw[0]}${m[0]}\nreturn [layersOf, WORD];`)(
        globalThis.KonjakuSwale, globalThis.KonjakuProv, () => "分母");
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const LF = { ok: true, value: "旧水部", artificial: "盛土地･埋立地" };

    // ---- 豊洲: 3 層とも立つ ----
    const toyosu = L({ classified: 533, total: 533, wet: 531, waterRead: true, waterRatio: .953,
      buildingLand: { name: "河川・湖沼・海面", count: 496, classified: 533, pct: "93.1" },
      landSummary: { name: "河川・湖沼・海面", pct: "81.5" }, counts: {}, bldState: "ok" }, LF);
    yes(toyosu.layers.map((x) => x.n).join() === "1,2,3",
      `豊洲で 3 層が順に並んでいない: ${toyosu.layers.map((x) => x.n).join()}`);

    // ---- ⚠ 第1層は、どの土地でも立つ ----
    for (const [nm, area] of [
      ["名古屋", { classified: 0, total: 0, waterRead: true, waterRatio: .017, landSummary: { name: "田", pct: "97.0" }, bldState: "notyet" }],
      ["札幌", { classified: 0, total: 1364, waterRead: false, waterUnread: false, bldState: "ok" }],
      ["那覇", { classified: 0, total: 0, waterRead: false, waterUnread: false, bldState: "notyet" }],
    ]) {
      const r = L(area, LF);
      yes(r.layers[0]?.n === 1, `${nm}で第1層が先頭でない: ${r.layers.map((x) => x.n).join()}`);
      // ⚠ 層は必ず番号順（順序が崩れると、確実性の順でなくなる）
      const ns = r.layers.map((x) => x.n);
      yes(ns.join() === [...ns].sort().join(), `${nm}で層の順序が崩れている: ${ns.join()}`);
      // ⚠ 立たない層は、必ず理由が付く（黙って消さない）
      for (const n of [2, 3])
        yes(ns.includes(n) || r.missing.some((x) => x.n === n),
          `${nm}で第${n}層が、立ちも欠けもしていない（黙って消えている）`);
    }

    // ---- ⚠ 数字を出すなら、分母がある ----
    for (const r of [toyosu, L({ classified: 0, total: 0, waterRead: true, waterRatio: .017, bldState: "notyet" }, LF)])
      for (const x of r.layers)
        if (x.head.kind === "pct") yes(!!x.den, `数字を出しているのに分母が無い: 第${x.n}層 ${x.head.v}`);

    // ---- ⚠ 出せない理由は、層ごとに違う（同じ文を 2 回出さない）----
    const sap = L({ classified: 0, total: 1364, waterRead: false, waterUnread: false, bldState: "ok" }, LF);
    const says = sap.missing.map((x) => W.layerMissing(x.n, x.why));
    yes(new Set(says).size === says.length, `出せない理由が重複している: ${says.join(" / ")}`);

    // ---- ⚠ 読めなかったのと、範囲の外を混ぜない ----
    const unread = L({ classified: 0, total: 0, waterRead: false, waterUnread: true, bldState: "notyet" }, LF);
    yes(unread.missing.find((x) => x.n === 2)?.why === "unread", "読めなかったのに範囲の外と言っている");
    yes(/読み込め/.test(W.layerMissing(2, "unread")), "読めなかったことを言っていない");
    yes(!/読み込め/.test(W.layerMissing(2, "outside")), "範囲の外なのに、こちらの都合に読める言い方をしている");

    // ---- ⚠ 層の名前は「問い」。内部の呼び名を出さない ----
    for (const n of [1, 2, 3]) {
      const t = W.layerTitle(n);
      yes(!/第[123]層/.test(t), `層の名前に内部の呼び名が出ている: ${t}`);
      yes(/？/.test(t), `層の名前が問いの形になっていない: ${t}`);
    }
    // ⚠ 第1層で時間の語を使わない（3/4 が明治期と取り違えた）
    yes(!/もとは|昔は|だった/.test(W.ground1("旧水部")), `第1層に時間の語が入っている: ${W.ground1("旧水部")}`);
    yes(/この土地は/.test(W.ground1("旧水部")), `主語が「この土地は」でない: ${W.ground1("旧水部")}`);

    fails.length
      ? bad(`層の組み立てが決めごとと違う（${fails.length} 件）: ${fails.slice(0, 4).join(" / ")}`)
      : ok(`層を動かして確認（確実性の高い順・第1層は常に立つ・数字には分母・`
          + `出せない理由は層ごと・名前は問いの形）`);
  }
}




// 言葉を決めるところ（peel3d.js の WORD）。
// ⚠ HTML から外へ出したのは、**検査が字面ではなく判断そのものを見られるようにする**ため。
//   ⚠ 取り出せなくなったら落とす（黙って素通りさせない）。
{
  const m = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src["peel3d.js"] ?? "");
  if (!m) bad("peel3d.js の WORD を取り出せない（この検査が何も見ていない）");
  else {
    // ⚠ prov.js を借りている行がある。Node でも同じものを渡す
    // ⚠ **words.js も借りている。**渡し忘れると undefined で落ちる（黙って素通りさせない）
      const W = new Function("KonjakuProv", "KonjakuWords", `${m[0]}\nreturn WORD;`)(
        globalThis.KonjakuProv, globalThis.KonjakuWords);
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- 高さの出どころ。3 通りを取り違えない ----
    yes(/既定値/.test(W.heightSrc("default", "住宅")), "既定値のときに、そう書いていない");
    yes(/住宅/.test(W.heightSrc("default", "住宅")), "既定値の根拠（種別）を書いていない");
    yes(/階数/.test(W.heightSrc("levels")), "階数から換算したときに、そう書いていない");
    yes(/height/.test(W.heightSrc("measured")), "実測のときに出どころ（height タグ）を書いていない");
    // ⚠ 3 つは別の文。同じにすると、どれが実測か分からなくなる
    yes(new Set(["default", "levels", "measured"].map((s) => W.heightSrc(s, "x"))).size === 3,
      "高さの出どころ 3 通りが書き分けられていない");

    // ---- ⚠ 掟の核心。読めなかったのか、本当に無いのか ----
    yes(W.meijiGap(true) !== W.meijiGap(false), "「読み込めていない」と「無い」を書き分けていない");
    yes(!/無い/.test(W.meijiGap(true)),
      `読み込めていないのに「無い」と言っている: ${W.meijiGap(true)}`);

    // ---- 出せないときの見出し。⚠ 数値を作らない ----
    for (const has of [true, false]) {
      const t = W.cantSay(has);
      yes(!/\d/.test(t), `出せないのに数字が入っている: ${t}`);
      yes(/出せません|判定できません/.test(t), `出せないことを言っていない: ${t}`);
    }
    // ⚠ 地形分類が答えられるときは、範囲を限る（全部が出せないわけではない）
    yes(/建物ごと/.test(W.cantSay(true)),
      `受け皿があるのに「建物ごと」と範囲を限っていない: ${W.cantSay(true)}`);
    yes(W.cantSay(true) !== W.cantSay(false), "受け皿の有無で書き分けていない");

    // ---- 建物が 0 件のとき。⚠ 4 つを混ぜない ----
    const st = ["loading", "ok", "notyet", "fail"].map((s) => W.noBuildings(s));
    yes(new Set(st).size === 4, `建物 0 件の理由 4 通りが書き分けられていない（${new Set(st).size} 種類）`);
    // ⚠ 正常に 0 件だったときに「取得中」と言わない（以前これで出続けていた）
    yes(!/取得中/.test(W.noBuildings("ok")), `正常に 0 件なのに「取得中」と言っている: ${W.noBuildings("ok")}`);
    // ⚠ 未対応を通信のせいにしない
    yes(/通信の問題ではありません/.test(W.noBuildings("notyet")),
      `未対応なのに「通信の問題ではありません」が無い: ${W.noBuildings("notyet")}`);
    yes(!/取得中|届いていない/.test(W.noBuildings("notyet")),
      `未対応を、通信のせいに読める言い方をしている: ${W.noBuildings("notyet")}`);
    // ⚠ どれも「現地に建物が無い」と言い切らない
    for (const t of st)
      yes(!/(建物|家)(は|が)(無い|ありません)/.test(t), `建物が無いと言い切っている: ${t}`);

    // ---- 出どころの但し書き。⚠ 事前計算と実行時を混ぜない ----
    // ⚠ 水域の書き分けは 2026-08-20 に消えた。**どの土地でもその場で起こす**ので、
    //   書き分ける相手が居ない（残すと「事前計算のときがある」と読ませる）。
    yes(W.bldPre(true) !== W.bldPre(false), "建物が事前取り込みかを書き分けていない");
    // ⚠ **ここにあった WORD.precision の検査を消した**（2026-08-20。hidetzu/konjaku#125）。
    //   ⚠ **`WORD.precision` は死にコードだった**（`landformLine()` からしか呼ばれず、
    //     ⚠ その `landformLine()` を呼ぶ場所が 1 つも無かった）。
    //   ⚠ **つまりこの 2 行は、⚠ 画面に出ないものに対して「粗いときはそう書いている」と
    //     主張していた。**⚠ **守っているつもりで、何も守っていなかった。**
    //
    // ⚠ **判明した穴（実測 2026-08-20・軽井沢 36.34840,138.63200・375×667・SW 無効）**
    //   ⚠ **`/peel` は、粗い区分であることを 1 文字も言っていない。**
    //       /peel   「この土地は 低地」                      ⚠ 粗さの記述 0 件
    //       トップ  「この土地は 低地」＋「この範囲には詳細版が整備されていないため、
    //                 広い区分で答えています（より細かい分類は分かっていません）」 ✅
    //       共有カード「低地（広い区分）」＋「※ この範囲には詳細版が無く、…」 ✅
    //   ⚠ **`verify.js` 自身が「粗くなったことは必ず言う」と書いている**（249〜250 行）。
    //   ⚠ **これは死にコードを消す前からある穴。**⚠ **`/peel` の見え方を変えるので、
    //     死にコードを消す Issue（hidetzu/konjaku#125）の Scope（消すだけ・1px も変えない）の外。**
    //   ⚠ **人の判断待ち。**⚠ **ここで「確認済み」と言わないために、検査は足さずに記録だけ残す。**

    fails.length
      ? bad(`WORD の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`WORD を動かして確認（高さの出どころ 3 通り・建物 0 件の理由 4 通り・`
          + `読めなかったを「無い」と言わない・出せないときに数値を作らない）`);
  }
}

// 言葉を決めるところ（index.html の TOPWORD / RELOCATE_HOW）。
// ⚠ peel3d.js の WORD と同じ理由で外へ出した。**持ち主が違うので 1 つにまとめていない**
//   （WORD は /peel の答えと出どころ、TOPWORD はトップの根拠カードと導線）。
//   ⚠ 取り出せなくなったら落とす（黙って素通りさせない）。
{
  // ⚠ **トップの JS は `top.js`**（2026-08-24）。⚠ `<script>` から取り出す形はもう合わない。
  //   ⚠ **インラインも残っている**（SW の登録）ので、⚠ 両方を繋いで見る。
  const js = [...(src["index.html"] ?? "").matchAll(
    /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n")
    + "\n" + (src["top.js"] ?? "");
  const mw = /\nconst TOPWORD = \{[\s\S]*?\n\};/.exec(js);
  const mr = /\nconst RELOCATE_HOW = [\s\S]*?;\n/.exec(js);
  if (!mw || !mr) bad("index.html の TOPWORD / RELOCATE_HOW を取り出せない（この検査が何も見ていない）");
  else {
    const [T, R] = new Function(`${mw[0]}${mr[0]}\nreturn [TOPWORD, RELOCATE_HOW];`)();
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- ⚠ 掟の核心。読めたうえで 0 件 と、答えを出せない は別 ----
    yes(T.meiji(null, true) !== T.meiji(null, false),
      "「記録なし」と「判定できません」を書き分けていない");
    yes(/記録/.test(T.meiji(null, true)), `読めて 0 件のときの言い方が変わった: ${T.meiji(null, true)}`);
    yes(!/無い|ありません/.test(T.meiji(null, false)),
      `判定できないのに「無い」と言っている: ${T.meiji(null, false)}`);
    // ⚠ 値があるときは、but でも but でもなく、その値をそのまま出す
    yes(T.meiji("旧水部", true) === "旧水部", "値があるのに、言い換えている");

    // ---- ⚠ 取得方法の呼び名。⚠ **字は words.js が持つ**（2026-08-20 に移した）----
    //   ⚠ ここは「トップが words.js を通しているか」だけを見る。字そのものは
    //     words.js の単体テストが見る（掟: 同じ問いに答える実装を2つ持たない）。
    const KW = globalThis.KonjakuWords;
    yes(T.method("unreachable", false, "read") === KW.UNREAD,
      "読めなかったのに、そう書いていない");
    yes(T.method("ok", true, "read") === KW.EDGE, "答えが割れたのに、そう書いていない");
    yes(T.method("ok", false, "read") === KW.METHOD.read, "普通に取れたのに、読んだ値と書いていない");
    // ⚠ 読めなかったが先。読めていないのに「近くで分かれている」と言わない
    yes(T.method("unreachable", true, "read") === KW.UNREAD,
      "読めていないのに「分かれている」と言っている（割れたのではなく、読めていない）");
    // ⚠ **内部の鍵を画面に漏らさない**
    yes(T.method("ok", false, "zzz") === "", `知らない鍵が画面に出ている: ${T.method("ok", false, "zzz")}`);

    // ---- 但し書きは、当てはまるときだけ ----
    yes(T.clipped(false) === "" && /切れ/.test(T.clipped(true)), "枠の切れを書き分けていない");
    yes(T.gone(false) === "" && /無くなった/.test(T.gone(true)), "無くなったかを書き分けていない");
    // ⚠ 0m は「海面より低い」ではない（境界を取り違えない）
    yes(T.belowSea(0) === "" && T.belowSea(0.1) === "", "0m 以上なのに「海面より低い」と言っている");
    yes(/海面より低い/.test(T.belowSea(-1)), "負の標高なのに、そう言っていない");
    // ⚠ 生の font-size を書かない（トークンを通す）
    yes(!/font-size:\s*\d/.test(T.belowSea(-1)), `生の文字サイズが入っている: ${T.belowSea(-1)}`);

    // ---- ⚠ 深掘りの案内。できないことから書き始めない（CLAUDE.md §4-1）----
    const lead = T.peelLead(false);
    yes(T.peelLead(true) !== lead, "下地の有無で書き分けていない");
    yes(!/^[^。]*?(できていません|ありません|未対応)/.test(lead),
      `できないことから書き始めている: ${lead}`);
    yes(/切りかえ|見くらべ/.test(lead), `先に「何ができるか」を書いていない: ${lead}`);
    // ⚠ 在庫の話に ⚠ を使わない（危険の印と混ざる）
    for (const t of [T.peelLead(true), lead]) yes(!/⚠|⚠️/.test(t), `在庫の話に ⚠ を使っている: ${t}`);

    // ---- 位置情報の許し直し方。⚠ 端末で本当に違うので、1 つにしない ----
    yes(R(true) !== R(false), "iOS とそれ以外で手順を書き分けていない");
    yes(/Safari/.test(R(true)) && !/Safari/.test(R(false)), "iOS の手順が iOS 以外にも出ている");

    fails.length
      ? bad(`TOPWORD の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`TOPWORD を動かして確認（記録なしと判定できませんを分ける・読めなかったが「境目」より先・`
          + `0m を「海面より低い」と言わない・できないことから書き始めない）`);
  }
}

// 内訳の分け方（peel3d.js の breakdown）。
// ⚠ **分割と、分割でないものを混ぜない。**
//   実測（2026-08-19, 375×667 札幌）: 内訳に 1 行だけ「データなし 1364 / 1364」が出て、
//   `isWater("データなし")` が false なので**陸の色見本**が付いていた。
//   ⚠ 「明治期は陸だった建物が 1364 件」と読める（データの話が、土地の話に化けている）。
{
  const m = /\nconst NOT_CLASS=[\s\S]*?\nfunction paintBreakdown[\s\S]*?\n\}\n/.exec(src["peel3d.js"] ?? "");
  const mw = /\nconst WORD = \{[\s\S]*?\n\};/.exec(src["peel3d.js"] ?? "");
  if (!m || !mw) bad("peel3d.js の breakdown を取り出せない（この検査が何も見ていない）");
  else {
    // ⚠ **`esc` も渡す**（2026-08-22。⚠ 内訳が区分名を esc するようになった）。
    //   ⚠ **本物と同じものを渡す**（⚠ ここで別物を作ると、⚠ 検査が本物を見ていない）。
    // ⚠ **`retryAt` / `retryBtn` / `wireRetry` も渡す**（2026-08-22。⚠ 取得失敗のとき、
    //   ⚠ **内訳が再試行の的を出すようになった**。⚠ 前は `#status` にしか無かった）。
    // ⚠ **`wireProvPeek` も渡す**（2026-08-23。⚠ **繋ぐ場所を、⚠ 作る場所の直後へ移した**）。
    //   ⚠ **ここでは何もしない関数でよい。**⚠ **地図が本当に変わるかは実描画が見る**
    //     （⚠ listener が消えていたことは、⚠ **DOM を組み立てただけでは分からない**）。
    const [B, W, P] = new Function("KonjakuSwale", "KonjakuProv", "esc", "retryAt", "retryBtn", "wireRetry",
      "wireProvPeek",
      `${m[0]}${mw[0]}\nreturn [breakdown, WORD, paintBreakdown];`)(
        globalThis.KonjakuSwale, globalThis.KonjakuProv,
        (globalThis.KonjakuEsc?.esc ?? ((x) => String(x))),
        { lon: 139, lat: 35, title: "テスト" },
        (lon, lat, t) => `<button class="retry-btn" data-ll="${lon},${lat}" data-title="${t}">再試行</button>`,
        () => {}, () => {});
    // ⚠ 組み立てた結果そのものを見る。**戻り値だけ見ていると、画面に出る分母を見ていない**
    //   （実測 2026-08-19: 分母を総数に戻す壊し方で、この検査が落ちなかった）
    const paint = (counts, total) => { const el = { innerHTML: "" }; P(el, B(counts, total), "ok"); return el.innerHTML; };
    // ⚠ **area を渡す口**（2026-08-22。⚠ 内訳が「建物について何が分かっているか」になったため）
    const paintTo = (counts, total, area) => {
      const el = { innerHTML: "" }; P(el, B(counts, total), "ok", false, area); return el.innerHTML; };
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };

    // ---- ⚠ 札幌。全件が資料の範囲外。**行を 1 本も作らない** ----
    const sap = B({ "データなし": 1364 }, 1364);
    yes(sap.rows.length === 0,
      `分類でないものを分類の行にしている: ${sap.rows.map((r) => r.name).join("・")}`);
    yes(sap.outside === 1364 && sap.classified === 0, "資料の範囲外を、判定できた件数に数えている");

    // ---- 読み込めなかった分も、分類ではない ----
    const un = B({ "読み込めず": 20, "旧水部": 80 }, 100);
    yes(un.rows.length === 1 && un.rows[0].name === "旧水部", "読み込めなかった分を分類の行にしている");
    yes(un.unread === 20 && un.classified === 80, "読み込めなかった分を、判定できた件数に数えている");
    // ⚠ 分割の分母は「判定できた件数」。総数にすると、判定できた分が小さく見える。
    //   ⚠ **組み立てた HTML で見る。**戻り値だけでは、画面に出る分母を見たことにならない
    yes(un.rows.reduce((t, r) => t + r.n, 0) === un.classified, "行を足しても、判定できた件数にならない");
    // ⚠ **内訳は作り直した**（2026-08-22。Owner 判断）。
    //   ⚠ **前は明治期の区分ごとの件数**（⚠ 分母＝判定できた件数）だった。
    //   ⚠ **いまは「建物について何が分かっているか」**（⚠ 分母＝総数）。
    //   ⚠ **明治期の区分の内訳は、⚠ 「昔はどんな土地？」が面積の分母で持つ**
    //     （⚠ 前は ⚠ **同じ区分名が 2 か所に、⚠ 別の分母で並んでいた**。掟 §6）。
    // ⚠ **主張は落としていない。**⚠ 下で、⚠ **新しい形について同じことを見る。**
    {
      const A = { total:100, dated:3, unread:20, wet:30, classified:80,
                  hSrc:{measured:40,levels:10,default:50} };
      const h = paintTo({ "読み込めず": 20, "旧水部": 80 }, 100, A);
      // ⚠ **出す数字は、⚠ 全部おなじ分母（総数）で書く**（掟 §6）。
      //   ⚠ **個数ではなく「別の分母が混ざっていないか」を見る**
      //     （⚠ 個数で見ていたら、⚠ **凡例を足したときに、⚠ 分母と無関係に落ちた**）。
      const dens = h.match(/ \/ \d+</g) ?? [];
      yes(dens.length > 0 && dens.every((d) => d === " / 100<"),
        `別の分母が混ざっている: ${dens.join() || "(無し)"}`);
      // ⚠ **色見本は、⚠ 地図と照合できるものだけ**（2026-08-23。Owner 判断）。
      //   ⚠ **2 種類ある。**⚠ **どちらも地図に相手がいる。**
      //     1. ⚠ **地図の建物の既定の色**（⚠ 水色 / 砂色。⚠ 常に地図に出ている）
      //     2. ⚠ **押しているあいだ変わる色**（⚠ ボタンの直後）
      //   ⚠ **前は行の見出しに付いていて、⚠ 2 つは地図に相手がいなかった。**
      //     ⚠ `足元が分かる` の水色 = 「明治期に水だった」の色（⚠ 4832 件の色ではない）
      //     ⚠ `高さが分かる` の砂色 = 「水でなかった」の色（⚠ 実測の建物は両方の色になる）
      const peeks = (h.match(/class="peek"/g) ?? []).length;
      yes(peeks > 0, "光らせるボタンが 1 つも無い（色見本の主張が空になる）");
      // ⚠ **押したときの色見本は、⚠ ボタンの直後**（⚠ 「押すと」の説明なので）
      const paired = (h.match(/class="peek"[^>]*>[^<]*<\/button><div class="hint"><i class="legend"/g) ?? []).length;
      yes(paired === peeks,
        `光らせるボタン ${peeks} 個 のうち、⚠ 直後に色見本があるのは ${paired} 個（何の色か分からない）`);
      // ⚠ **地図の建物の既定の色の凡例**（2026-08-23。Owner 指摘で戻した）。
      //   ⚠ **これが無いと、⚠ 地図の水色と砂色が何なのか読めない。**
      yes(/地図の建物の色/.test(h), "地図の建物の色の凡例が無い（地図の色が読めない）");
      yes(h.indexOf("地図の建物の色") < h.indexOf("class=\"peek\""),
        "地図の既定の色の凡例が、押したときの色見本より後ろにある");
      // ⚠ **砂色を「水ではなかった」と言わない**（掟 §1）。
      //   ⚠ **`wasWater` は「水と判定できた」= 1。**⚠ **判定できなかった 20 件も砂色になる。**
      yes(!/水ではなかった<\/span>|水でなかった<\/span>/.test(h),
        "砂色を「水ではなかった」と言い切っている（判定できなかった分が混ざっている。掟 §1）");
      yes(/足元を判定できなかった 20 件が含まれます/.test(h),
        "砂色に、判定できなかった件数が混ざっていることを書いていない（掟 §1）");
      // ⚠ **3 行は内訳ではないと、⚠ 字で言う**（⚠ 利用者役 3/4 が足し算して止まった）
      yes(/足し算はできません/.test(h), "3 行が内訳ではないことを書いていない");
      // ⚠ **建設年が 1 件も分かっていないときは、⚠ 光らせるボタンを出さない**（ADR 0026）
      const h0 = paintTo({ "旧水部": 80 }, 100, { ...A, dated:0 });
      yes(!/id="peekY"/.test(h0), "建設年 0 件なのに光らせるボタンがある");
      yes(/id="peekY"/.test(h), "建設年があるのに光らせるボタンが無い");
      // ⚠ **0 件でも行は出す**（⚠ 隠すのは「無い」と言うのと同じ。掟 §1）
      yes(/建てられた年が分かる/.test(h0), "建設年 0 件のとき、行ごと消えている");
      yes(/>0<span/.test(h0), "建設年 0 件のとき、0 / N と書いていない");
      // ⚠ **再試行の的は、⚠ 材料の行（`prov.js`）が持つ**（2026-08-22。Owner 判断）。
      //   ⚠ **層 3 が `missing` のとき、⚠ 内訳の器そのものが作られない**ので、
      //     ⚠ **内訳に置くと消える**（⚠ 実測 2026-08-22。⚠ 一度そこへ置いて消えた）。
      //   ⚠ **主張は同じ**（⚠ 取れなかったときは復帰手段を添える。掟）。⚠ **見る場所を移した。**
      {
        const Pr = globalThis.KonjakuProv;
        const fail = Pr.buildingRows({ bldState: "fail" })[0];
        yes(fail.retry === true, "取得に失敗したのに、再試行の的が無い（戻る手段が消える）");
        yes(/class="retry-btn"/.test(Pr.html([fail])), "再試行の的が HTML に出ていない");
        // ⚠ **未対応のときは出さない**（⚠ 押しても直らない。ADR 0026）
        const notyet = Pr.buildingRows({ bldState: "notyet" })[0];
        yes(!notyet.retry, "未対応なのに再試行の的がある（押しても何も起きない）");
        yes(!/class="retry-btn"/.test(Pr.html([notyet])), "未対応の HTML に再試行の的がある");
      }
    }
    yes(!/swatch[^>]*>\s*(データなし|読み込めず)/.test(paint({ "データなし": 5 }, 5)),
      "資料の範囲外に色見本が付いている");
    // ⚠ 読み込めなかったのと、範囲の外は、別の箱
    yes(un.outside === 0, "読み込めなかった分を、資料の範囲外に混ぜている");

    // ---- 水と陸の見分け ----
    const wl = B({ "河川・湖沼・海面": 5, "茅": 3 }, 8);
    yes(wl.rows.find((r) => r.name === "河川・湖沼・海面")?.water === true, "水域を水と見ていない");
    yes(wl.rows.find((r) => r.name === "茅")?.water === false, "陸を水と見ている");
    // 多い順
    yes(wl.rows[0].n >= wl.rows[1].n, "多い順に並んでいない");

    // ---- ⚠ 言い方。資料の話であって、土地の話ではない ----
    for (const k of ["unread", "outside"]) {
      const t = W.notClassified(k, 5, false);
      yes(!/(だった|でした)$|陸|水の上/.test(t.replace("外でした", "")),
        `土地がどうだったかを言っている（言ってよいのは資料の側だけ）: ${t}`);
      yes(!/(建物|記録)(は|が)(無い|ありません)/.test(t), `無いと言い切っている: ${t}`);
    }
    yes(W.notClassified("unread", 5, false) !== W.notClassified("outside", 5, false),
      "読み込めていないのと、範囲の外を、同じ言葉にしている");
    yes(/読み込め/.test(W.notClassified("unread", 5, false)),
      "読み込めていないことを言っていない");
    yes(!/読み込め/.test(W.notClassified("outside", 5, false)),
      "範囲の外なのに「読み込めない」と言っている（こちらの都合に読める）");
    // 全件のときと、一部のときで言い方を変える
    yes(W.notClassified("outside", 5, true) !== W.notClassified("outside", 5, false),
      "全件のときと一部のときを書き分けていない");

    fails.length
      ? bad(`breakdown の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`内訳の分け方を動かして確認（判定できなかった分を分類の行にしない・`
          + `分母は判定できた件数・読み込めていないと範囲の外を分ける）`);
  }
}

// ============================================================
// ⚠ 面積の内訳は、主見出しと同じ分母か
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 15 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「答えの組み立て」の仲間である理由**: ⚠ **すぐ上が「内訳の分け方」。**
//   ⚠ あちらは ⚠ **判定できなかった分を分類の行にしない。**⚠ こちらは ⚠ **分母が主見出しと同じか。**
// ⚠ **元は `head("2.7. …")` という自分の節を持っていた**（⚠ 中身は 1 件だけ）。
//   ⚠ **見出しは落とした。**⚠ 判定の字は変えていない。
// ============================================================
// 面積の内訳は、主見出しと同じ分母
// ============================================================
// ⚠ **主見出し（`waterRatio` ＝ 範囲全体が分母）と、⚠ 内訳の分母が違っていた**
//   （2026-08-23。⚠ **内訳は「区分を特定できた画素」が分母だった**）。
// ⚠ 実測（2026-08-23・渋谷・`main` = `6b5daab`）:
//   ⚠ **主見出し 1.5% ／ 内訳の水の合計 11.1%。⚠ 7.6 倍。**
//   ⚠ **豊洲は全画素に区分が付くので一致していた**（95.3% ／ 95.2%）。⚠ **だから気づけなかった。**
{
  const fails = [];
  const yes = (c, what) => { if (!c) fails.push(what); };
  const m = src["peel3d.js"].match(/function summarizeLand\([\s\S]*?\n\}/);
  if (!m) fails.push("summarizeLand を取り出せない（この検査が何も見ていない）");
  else {
    const S = new Function(`${m[0]}\nreturn summarizeLand;`)();
    // ⚠ **端の土地**（⚠ 範囲の一部にしか区分が付いていない）
    const edge = S({ "田": 100, "河川・湖沼・海面": 20 }, 120, 1000);
    yes(edge, "端の土地で内訳を作れない");
    yes(edge.total === 1000, `分母が範囲全体でない: ${edge.total}`);
    yes(edge.rest === 880, `特定できなかったぶんが合わない: ${edge.rest}`);
    yes(edge.all[0].pct === "10.0", `田が範囲全体の分母で出ていない: ${edge.all[0].pct}`);
    yes(edge.all[1].pct === "2.0", `水が範囲全体の分母で出ていない: ${edge.all[1].pct}`);
    // ⚠ **足して 100 になる**（⚠ 特定できなかったぶんを含めて）
    const sum = edge.all.reduce((t, x) => t + Number(x.pct), 0) + edge.rest / edge.total * 100;
    yes(Math.abs(sum - 100) < 0.2, `足して 100 にならない: ${sum.toFixed(1)}`);
    // ⚠ **全部に区分が付く土地では、⚠ いままでどおり**（⚠ 豊洲）
    const full = S({ "河川・湖沼・海面": 800, "干潟・砂浜": 200 }, 1000, 1000);
    yes(full.rest === 0, `全部に区分が付くのに残りがある: ${full.rest}`);
    yes(full.all[0].pct === "80.0", `豊洲側の数字が変わった: ${full.all[0].pct}`);
    // ⚠ **渡ってこないときは、⚠ 前と同じ挙動に落ちる**（⚠ 黙って壊れない）
    const old = S({ "田": 50 }, 100);
    yes(old.total === 100 && old.rest === 0, `分母が渡らないときに落ちていない: ${JSON.stringify(old)}`);
  }
  if (fails.length) bad(`面積の内訳の分母（${fails.length} 件）: ${fails.join(" / ")}`);
  else ok("面積の内訳は主見出しと同じ分母（足して 100・特定できなかったぶんも数える）");
}

// ============================================================
// ⚠ 年代の名乗り（eraReadout / groundState）
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 15 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「答えの組み立て」の仲間である理由**: ⚠ **出ていないものを「表示中」と言わない。**
//   ⚠ **掟 §1 の核心**（⚠ 取れなかった ≠ 無い）を、⚠ **字ではなく判断で見ている。**
// ⚠ **この説明は、⚠ 本体から 275 行離れた場所にあった**（⚠ 実測 2026-08-24）。
//   ⚠ **あいだに別の節が 3 つ挟まっていた**（2.7 ／ 2.8 ／ 2.6）。
//   ⚠ **上から読むと、⚠ 面積の内訳の説明に読める。**⚠ **移設で並べ直した。**
// 年代の名乗り（peel3d.js の eraReadout と groundState）。
// ⚠ ここが画面でいちばん大きい文字で、**出ていないものを「表示中」と言っていた**。
//   利用者役 3/3 が「これが主犯」と名指しした（2026-08-18）。
// ⚠ そのうえで **「まだ出ていません」と「読み込めませんでした」を混ぜない**。
//   前者は理由を知らない。後者は落ちたのを**実際に観測した**ときだけ。
//   実測（2026-08-18）: 403 と通信断は map.on("error") で拾えるが、
//   **404 は拾えない**（MapLibre は 404 を異常と見なさない）。だから 404 は前者に留まる。
// ⚠ ブラウザでは「まだ来ていない」状態を狙って作りにくい。関数を取り出して直に回す。
//   ⚠ **取り出せなくなったら落とす**（黙って素通りさせない）。
  // ⚠ **2026-08-20 に、状態を決めるのは public/photos.js の 1 か所へ移した。**
  //   ⚠ **見ている主張は変えていない。**取り出す先だけ変えた。
  //   ⚠ **字を決めるのは words.js。**⚠ **状態と字を分けてある。**
  {
    await import(`file://${join(PUB, "photos.js")}`);
    await import(`file://${join(PUB, "words.js")}`);
    const P = globalThis.KonjakuPhotos;
    // ⚠ **2026-08-20 に引数が減った**（素性と online は状態が持つ）。⚠ **置くだけになった。**
    const em = /\nfunction eraReadout\(state, sub\)\{[\s\S]*?\n\}/.exec(src["peel3d.js"] ?? "");
    if (!P || !em) bad(`${!P ? "photos.js を読み込めない" : "peel3d.js の eraReadout を取り出せない"}（この検査が何も見ていない）`);
    else {
      const G = P.stateOf;
      // ⚠ eraReadout は words.js を借りている。Node でも同じものを渡す
      const f = new Function("KonjakuWords", `${em[0]}\nreturn eraReadout;`)(globalThis.KonjakuWords);
    const fails = [];
    const yes = (c, what) => { if (!c) fails.push(what); };
    const FAIL = { why: "通信できません" };

    // ---- 3 つの状態を取り違えない ----
    yes(G(true, false, null).kind === "ok", "届いているのに ok にならない");
    yes(G(true, true, FAIL).kind === "ok", "届いているのに、落ちた扱いになる");
    yes(G(false, true, FAIL).kind === "fail", "落ちたのに fail にならない");
    yes(G(false, false, FAIL).kind === "fail", "落ちたのに、猶予中だと fail にならない");
    yes(G(false, true, null).kind === "late", "猶予を過ぎたのに late にならない");
    yes(G(false, false, null).kind === "pending", "まだ猶予中なのに pending にならない");

    // ⚠ **2026-08-20: 素性（何の写真か）と online は、状態が持つようになった。**
    //   ⚠ **見ている主張は変えていない。**⚠ 渡し方だけ変えた。
    const E = (isLatest, isMeiji) => ({ isLatest, isMeiji });
    for (const [isLatest, isMeiji, what] of [[true, false, "現在"], [false, false, "過去"], [false, true, "明治期"]]) {
      // ---- 届いているとき ----
      // ⚠ **普段は名乗らない。**（2026-08-19 に変えた）
      //   出ているのが当たり前のときに名乗ると、主役（年代）から目を奪う。
      //   実測: 320 幅で年代の字 38px に対し名乗りは 12px だが、行の頭に居るので先に読まれ、
      //   利用者役は「何のことか一瞬分からなかった」と答えた。
      //   ⚠ **守りたいのは「出ていないものを表示中と言わない」ほう。**それは下で見る。
      const ok = f(G(true, false, null, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(!ok.kick, `${what}: 届いているのに「${ok.kick}」と名乗っている（普段は名乗らない）`);
      yes(ok.sub === "最新の空中写真", `${what}: 届いているときの説明が変わった`);
      yes(!ok.hint, `${what}: 届いているのに接続の話をしている`);

      // ---- 猶予切れ（理由を知らない）----
      const late = f(G(false, true, null, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(late.kick !== "表示中", `${what}: 出ていないのに「表示中」と言っている`);
      // ⚠ **出ていないときは必ず名乗る。**空にすると、普段と見分けがつかなくなる
      yes(!!late.kick, `${what}: 出ていないのに何も名乗っていない（普段と区別がつかない）`);
      // ⚠ **理由を知らないのに断定しない。** 404 はここに来る
      yes(!/読み込めませんでした|取得できませんでした|失敗/.test(late.sub),
        `${what}: 理由を知らないのに「読み込めませんでした」と断定している`);
      yes(!late.hint, `${what}: 理由を知らないのに接続のせいにしている`);
      yes(!/が無い|ありません|存在しません/.test(late.sub), `${what}: 「無い」と言い切っている`);

      // ---- 落ちたのを観測したとき ----
      const bad1 = f(G(false, true, FAIL, E(isLatest, isMeiji), true), "最新の空中写真");
      yes(!!bad1.kick, `${what}: 落ちたのに何も名乗っていない`);
      yes(/読み込めませんでした/.test(bad1.sub), `${what}: 落ちたのに、そう書いていない`);
      yes(bad1.sub.includes("通信できません"), `${what}: 観測した理由を落としている`);
      // ⚠ つながっているときは**言い切らない**。取れない理由をこちらは知らない
      yes(bad1.hint === "接続を確認してください",
        `${what}: online=true なのに「${bad1.hint}」と言っている（言い切らない）`);
      const off = f(G(false, true, FAIL, E(isLatest, isMeiji), false), "最新の空中写真");
      yes(/接続していません/.test(off.hint ?? ""),
        `${what}: 圏外だと端末が言っているのに、そう伝えていない`);
      // ⚠ 落ちても「無い」とは言わない（掟の一行目）
      yes(!/写真が無い|存在しません/.test(bad1.sub + (bad1.hint ?? "")), `${what}: 落ちたことを「無い」と書いている`);
    }
    // 3 つは別の文。どれが出ていないのか分かること
    const subs = new Set(["現在", "過去", "明治期"].map((_, i) =>
      f(G(false, true, null, { isLatest: i === 0, isMeiji: i === 2 }, true), "x").sub));
    yes(subs.size === 3, `出ていないときの説明が ${subs.size} 種類しかない（現在・過去・明治期で書き分ける）`);
    fails.length
      ? bad(`eraReadout / groundState の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
      : ok(`eraReadout / groundState を動かして確認（ok・pending・late・fail × 現在／過去／明治期。`
          + `普段は名乗らず、出ていないときは必ず名乗る。理由を知らないときは断定せず、圏外のときだけ言い切る）`);
  }
}

// ============================================================
// ⚠ 言葉を作る側（words.js / prov.js / ものさし）を、⚠ 動かして確かめる
// ============================================================
// ⚠ **`test/check.mjs` の「6. まだ問いで分けていないもの」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 24 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「答えの組み立て」の仲間である理由**: ⚠ **どれも「読んだ結果を、どう言うか」。**
//   ⚠ すぐ上の `WORD` / `TOPWORD` / 内訳 と、⚠ **同じ形の検査**（⚠ 取り出して全部の枝を回す）。
// 「取得の結末」と「一覧行のタグ」の字は **public/words.js の1か所**。
// ⚠ **2 画面（トップと /peel）と共有カードが、同じ字を使う。**
//   ⚠ 以前は 4 ファイルが同じ字を別々に書いていて、片方だけ直せば
//     **同じ状態に 2 通りの言い方**ができた（実際に踏んでいる。prov.js の冒頭に記録がある）。
// ⚠ DOM も地図も見ないので、ここで全部の枝を回す。
{
  await import(`file://${join(PUB, "words.js")}`);
  const W = globalThis.KonjakuWords;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!W) fails.push("words.js を読み込めない（この検査が何も見ていない）");
  else {
    // ---- ⚠ 読めて 0 件 と 答えを出せない を、同じ語にしない（掟の核心）----
    yes(W.S.noRecord !== W.S.cantTell, "「読めて 0 件」と「答えを出せない」が同じ語になっている");
    eq(W.meiji("田", true), "田", "値があるときは、その値を出す");
    eq(W.meiji("田", false), "田", "値があれば none に関係なくその値");
    eq(W.meiji(null, true), W.S.noRecord, "読めて 0 件のとき");
    eq(W.meiji(null, false), W.S.cantTell, "答えを出せないとき");
    // ⚠ **0 件を「無い」と言い切らない。**資料の話に留める
    yes(!/^ありません|存在しません|無い$/.test(W.S.noRecord),
      `0 件の語が「無い」と言い切っている: ${W.S.noRecord}`);
    // ⚠ **答えを出せないときに、数や割合を作らない**
    yes(!/\d/.test(W.S.cantTell), `答えを出せないのに数字が入っている: ${W.S.cantTell}`);

    // ---- ⚠ 根拠カードと共有カードは、同じ行を描く ----
    eq(W.meijiBadge(true), `明治期: ${W.S.noRecord}`, "根拠カードの 0 件の行");
    eq(W.meijiBadge(false), `明治期: ${W.S.cantTell}`, "根拠カードの答えを出せない行");

    // ---- ⚠ 組の見出し（2026-08-21。行ごとのタグをここへ移した）----
    // ⚠ **見出しを持たない組がある。**⚠ own（この場所を深掘り）と、打った語の周辺検索。
    //   ⚠ own はその行の見出しが「この場所を深掘り」で、⚠ **組の名前と同じ字になる**。
    for (const g of ["why", "ext"]) eq(W.groupTitle(g), W.GROUP[g], `groupTitle(${g})`);
    eq(W.groupTitle("own"), "", "深掘りに見出しが付いている（行の字と重なる）");
    eq(W.groupTitle("zzz"), "", "知らない組に見出しが出ている");
    eq(W.groupTitle(undefined), "", "組なしに見出しが出ている");
    // ⚠ **名前が互いに違う。**同じ字だと、組を分けた意味が無い
    yes(new Set(Object.values(W.GROUP)).size === Object.keys(W.GROUP).length,
      "組の見出しが重なっている");
    // ⚠ **消した TAG が戻っていない**（⚠ 行ごとのタグと組の見出しを両方持たない）
    yes(!("TAG" in W) && !("tag" in W), "行ごとのタグが戻っている（見出しと 2 か所になる）");
  }
  fails.length
    ? bad(`words.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`words.js を動かして確認（0 件と答えを出せないを分ける・根拠カードと共有カードが同じ行・組の見出しと既定値）`);
}

// ⚠ **ものさしの目盛りに置く、短い年**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
//   ⚠ **狭い幅では「1984–86」が 53px あり、9 段で 488px 要る**（実測 2026-08-22・12px）。
//   ⚠ **入らないから間引く、はやらない**（間引くと「その年代は無い」と読まれる。掟 §1）。
//   ⚠ **短くして全部出す。**⚠ だから、⚠ **短くする側が壊れると画面が嘘をつく。**
// ⚠ **DOM 無しで確かめられる**（`.claude/rules/testing.md`: Domain の変換に代表ケースを持つ）。
{
  const W = globalThis.KonjakuWords;
  const fails = [];
  if (W?.eraTick) {
    // ⚠ **字を書き写しているのではない。**⚠ 入れた字と出た字の関係だけを見ている
    const cases = [["1984–86", "’84"], ["1936–42", "’36"], ["現在", "現在"], ["明治期", "明治期"],
                   ["", ""], [null, ""], [undefined, ""], ["昭和のいつか", "昭和のいつか"]];
    for (const [inp, want] of cases) {
      const got = W.eraTick(inp);
      if (got !== want) fails.push(`eraTick(${JSON.stringify(inp)}) が ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`);
    }
    // ⚠ **短くしても、⚠ 別の年代と同じ字にならないこと**（⚠ 同じ字だと段が見分けられない）
    const all = ["1987–90", "1984–86", "1979–83", "1974–78", "1961–69", "1955–60", "1945–50", "1936–42"];
    const short = all.map((t) => W.eraTick(t));
    if (new Set(short).size !== short.length)
      fails.push(`短くすると同じ字になる年代がある: ${short.join("、")}`);
  } else fails.push("words.js が eraTick を持っていない（この検査が何も見ていない）");

  fails.length
    ? bad(`ものさしの短い年が壊れている（${fails.length} 件）: ${fails.slice(0, 4).join(" / ")}`)
    : ok("ものさしの短い年は、渡された字から取り出すだけ（知らない形はそのまま／段どうしが同じ字にならない）");
}

// 「いま画面に出ているもの」（台帳）は **public/prov.js の1か所**。
// ⚠ ここが掟の一行目（取れなかった ≠ 無い）を、いちばん広い面で守っている。
//   以前は peel3d.js の render() の中で組んでいたので、
//   **ブラウザを立てて、その状態を実際に作れたときしか**確かめられなかった。
//   DOM も地図も見ない形にしたので、ここで**全組み合わせ**を回す。
// ⚠ 字面ではなく **tag**（実測／未取得／欠落／未対応／推定）で見る。
//   文言は変わる。変わってはいけないのは「どの語を使ってよいか」のほう。
{
  await import(`file://${join(PUB, "prov.js")}`);
  const P = globalThis.KonjakuProv;
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };
  const yes = (c, what) => { if (!c) fails.push(what); };

  if (!P) fails.push("prov.js を読み込めない（この検査が何も見ていない）");
  else {
    const ERA = { label: "1984–86" };
    // ⚠ **答えが出せない問いには、⚠ 「詳しく見る」を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ 実測（網走市・1280×950）: ⚠ **「この範囲に明治期の低湿地データが無い」の下に出ていた。**
    //   ⚠ **断りは消さない。**⚠ **畳んでいた実測の行だけ出さない**（掟 §1）。
    {
      const list = [{ q: 2, level: "no", tag: "未取得", body: "取れていない" },
                    { q: 2, level: "ok", tag: "実測", body: "これは材料" }];
      const on  = P.section(list, "詳しく見る", true);
      const off = P.section(list, "詳しく見る", false);
      yes(/詳しく見る/.test(on),   "答えがあるのに「詳しく見る」が無い");
      yes(!/詳しく見る/.test(off), "答えが出せないのに「詳しく見る」がある（何を見るのか分からない）");
      yes(/取れていない/.test(off), "「詳しく見る」を隠したら、断りまで消えた（掟 §1）");
    }
    // ---- 地表。届いていないなら「実測」と言わない ----
    eq(P.groundRow(true, ERA).tag, "実測", "届いた地表");
    eq(P.groundRow(false, ERA).tag, "未取得", "届いていない地表");
    yes(P.groundRow(false, ERA).body.includes("1984–86"), "届いていない地表に、どの年代かが無い");
    yes(P.groundRow(false, null).body.includes("明治期"), "明治期の地表の呼び名");
    // ⚠ ここが本丸。届いていないことを「無い」と言わせない
    yes(/記録の有無は分かっていない/.test(P.groundRow(false, ERA).note ?? ""),
      "届いていない地表に「記録の有無は分かっていない」が無い");

    // ---- 水面。読めなかった（未取得）と、本当に無い（整備対象外）を混ぜない ----
    eq(P.waterRow({ waterRead: true }).tag, "実測", "読めた水面");
    eq(P.waterRow({ waterRead: false, waterUnread: true }).tag, "未取得", "読めなかった水面");
    // ⚠ **整備対象外のときは、⚠ 材料の行を出さない**（2026-08-23。Owner 判断）。
    //   ⚠ **層の理由が既に「この範囲は明治期の低湿地データの整備対象外です」と言っている。**
    //   ⚠ **前は 2 行目が「この範囲に明治期の低湿地データが無い」で、⚠ 言い切っていた**
    //     （掟 §1: ⚠ **データにない ≠ 現実にない**）。
    //   ⚠ **混ぜないという主張は変えていない。**⚠ **読めなかったときは、⚠ 上の行が残る。**
    yes(P.waterRow({ waterRead: false, waterUnread: false }) === null,
      "整備対象外なのに材料の行を出している（層の理由と同じことを 2 回言う）");
    // ⚠ **`null` が並びから落ちること**（⚠ 落とし忘れると、⚠ 画面を組む側で落ちる）
    yes(P.rows({ area: { waterRead: false, waterUnread: false }, groundArrived: true })
      .every(Boolean), "行の並びに null が混ざっている");

    // ---- 建物。0 件は「読んだ結果」なので実測の側 ----
    eq(P.buildingRows({ bldState: "loading" })[0].tag, "未取得", "取得中の建物");
    eq(P.buildingRows({ bldState: "notyet" })[0].tag, "未対応", "まだ提供していない建物");
    eq(P.buildingRows({ bldState: "fail" })[0].tag, "未取得", "取れなかった建物");
    eq(P.buildingRows({ bldState: "ok", total: 0, bldSource: "overpass" })[0].tag, "実測",
      "正常に 0 件だった建物");
    yes(/OSM に登録が無いだけで/.test(P.buildingRows({ bldState: "ok", total: 0 })[0].note ?? ""),
      "0 件のときに「現地に無いとは限らない」が無い");
    // ⚠ **「まだ提供していない」の文は、prov.js の 1 つだけ。**
    //   実測（2026-08-18）: 同じ事実に 2 通りの文があり、20 秒のあいだに入れ替わっていた。
    //     待っているあいだ … 「この場所の建物データは、まだ用意できていません」
    //     終わったあと     … 「建物ごとの判定は、この場所ではまだ提供していません」
    //   ⚠ 入れ替わると、同じことを言っているのだと分からない。
    yes(typeof P.NOTYET === "string" && P.NOTYET.length > 8, "NOTYET を配っていない");
    yes(typeof P.NOTYET_WHY === "string" && /通信の問題ではありません/.test(P.NOTYET_WHY),
      "NOTYET_WHY を配っていない、または「通信の問題ではありません」が無い");
    // ⚠ 主語は「建物データ」ではなく「建物ごとの判定」。建物そのものは出ることがある
    yes(/建物ごとの判定/.test(P.NOTYET), `NOTYET の主語が「建物ごとの判定」でない: ${P.NOTYET}`);
    yes(P.buildingRows({ bldState: "notyet" })[0].body.includes("この場所ではまだ提供していません"),
      "台帳の行が NOTYET を使っていない");

    // ⚠ 「届かなかった」と言う行には、打ち消しの但し書きが要る。
    //   ⚠ **水面の行だけ、いまこれを持っていない**（2026-08-18 にこの検査で見つけた）。
    //     このリファクタでは文言を変えない約束なので直していない。
    for (const [rowOf, what] of [
      [() => P.groundRow(false, ERA), "地表"],
      [() => P.buildingRows({ bldState: "loading" })[0], "取得中の建物"],
      [() => P.buildingRows({ bldState: "fail" })[0], "取れなかった建物"],
      [() => P.unreadRow({ unread: 232 })[0], "足元を判定できなかった建物"],
    ]) {
      const r = rowOf();
      yes(/限らない|分かっていない/.test(r.note ?? ""), `${what}の「未取得」に打ち消しの但し書きが無い`);
    }
    // ⚠ 「未対応」は**こちらの都合**。通信の話に読ませない（CLAUDE.md §4-1）
    {
      const r = P.buildingRows({ bldState: "notyet" })[0];
      yes(/通信の問題ではありません/.test(r.note ?? ""), "未対応に「通信の問題ではありません」が無い");
      yes(!/取得中|取得できませんでした|届いていない/.test(r.body + (r.note ?? "")),
        "未対応の行が、通信のせいに読める言い方をしている");
      yes(/現地に建物が無いという意味でもありません/.test(r.note ?? ""),
        "未対応に「現地に無いという意味ではない」が無い");
    }
    // ⚠ **光らせるボタンは、⚠ 内訳（`paintBreakdown`）が持つようになった**（2026-08-22。Owner 判断）。
    //   ⚠ **主張は同じ**（⚠ 建設年が 1 件も分かっていないときは出さない。⚠ ADR 0026）。
    //   ⚠ **見る場所が `prov.js` → 内訳へ移っただけ。**⚠ 下の breakdown の節が見ている。
    // ⚠ **材料の行は「どうやって決めたか」だけを言う**（⚠ 件数は内訳が持つ。掟 §6）。
    yes(!/\d+\s*\/\s*\d+/.test(
          P.buildingRows({ bldState: "ok", total: 9, dated: 3 }).map((r)=>r.body+(r.note??"")).join("")),
      "材料の行が件数を言っている（⚠ 内訳と同じ数字を 2 か所で言うことになる）");

    // ---- 全組み合わせ。⚠ ここが「ブラウザでは作れない状態」を含む ----
    const TAGS = new Set(Object.values(P.TAGS));
    let n = 0;
    for (const groundArrived of [true, false])
    for (const era of [null, ERA])
    for (const area of [null,
        { waterRead: true, bldState: "loading" },
        { waterRead: true, bldState: "notyet" },
        { waterRead: true, bldState: "fail" },
        { waterRead: false, waterUnread: true, bldState: "fail" },
        { waterRead: false, waterUnread: false, bldState: "ok", total: 0, bldSource: "tile" },
        { waterRead: true, bldState: "ok", total: 0, bldSource: "overpass" },
        { waterRead: true, bldState: "ok", total: 533, dated: 8, unread: 0,
          hSrc: { measured: 42, levels: 64, default: 427 } },
        { waterRead: false, waterUnread: true, bldState: "ok", total: 5017, dated: 0, unread: 232 }]) {
      const rows = P.rows({ groundArrived, era, area });
      n++;
      for (const r of rows) {
        if (!TAGS.has(r.tag)) fails.push(`知らない語が台帳に出た: ${r.tag}`);
        if (!["ok", "no", "est"].includes(r.level)) fails.push(`知らない level: ${r.level}`);
        // ⚠ 「読めなかった」の行が、**その事物が無い**と言い切っていないか。
        //   ⚠ 打ち消し（「無いとは限らない」等）は先に落とす。落とさないと、
        //     守っている行のほうが引っかかる。
        //   ⚠ 見るのは**事物の有無**だけ。「まだ提供していません」はこちらの都合の話で、
        //     現地に無いとは言っていないので、当ててはいけない。
        if (r.tag === "未取得" || r.tag === "未対応") {
          const t = (r.body + " " + (r.note ?? ""))
            .replace(/無いとは限らない|無いという意味でもありません|有無は分かっていない/g, "");
          if (/(建物|記録|データ|写真|資料)(は|が)(無い|ありません|存在しません)/.test(t))
            fails.push(`「${r.tag}」の行が、無いと言い切っている: ${r.body}`);
        }
      }
      // 地表の行は必ず先頭に 1 つ。出ているものの出所を落とさない
      if (rows[0].body.indexOf("地表") !== 0) fails.push("台帳の先頭が地表の行ではない");
      // HTML は 1 か所でしか作らない。行の数だけ div が出る
      const html = P.html(rows);
      eq((html.match(/<div class="prov /g) ?? []).length, rows.length, "行の数と div の数");
      if (/<script|onerror=|javascript:/i.test(html)) fails.push("台帳の HTML に危ないものが入った");
    }
    eq(n, 36, "回した組み合わせの数");
  }
  fails.length
    ? bad(`prov.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok(`prov.js を動かして確認（語彙 5・36 通りの状態で、読めなかったことを「無い」と言わない）`);
}
