// 静的検査 — 配っている現物（⚠ **取り込んだものと、⚠ 配っているものが食い違っていないか**）
//
// ⚠ **`test/check.mjs` の「6. まだ問いで分けていないもの」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 23 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **ここが守っているもの**（⚠ どれも **配信物そのもの**を読んで突き合わせる）:
//     取り込みと実行時    ⚠ **同じ型を拾っているか**（⚠ 取り込み済みかで答えが変わらない）
//     建物のタイル        ⚠ 重さの上限 ／ ⚠ 詰め方が書く側と読む側で一致するか
//     索引と本体          ⚠ **索引に載っているのに本体が無い**と、404 を「未整備」と読む
//     未整備の土地        ⚠ **検査が寄りかかっている前提が、まだ成り立つか**
//     配布している事物    ⚠ 年つきの意味に違反が無いか ／ ⚠ 年の精度の決め方が一致するか
//     上流から消えた行    ⚠ 配布物に出ていないか
//     候補地・assets.json ⚠ 生成元と配っているものが食い違っていないか
//
// ⚠ **`docs.mjs`（文書と数）とは別。**⚠ あちらは ⚠ **文書に書いた数が現物と合うか。**
//   ⚠ こちらは ⚠ **現物どうしが食い違っていないか**（⚠ 文書を通さない）。
//
// ⚠ **`evCovered` も一緒に持ってきた**（⚠ **この 2 塊しか使わない**）。
//
// ⚠ **`../../` になった**（⚠ `test/check.mjs` から 1 階層深くなった。⚠ 6 か所）。
//   ⚠ **落ちてくれた**（⚠ ERR_MODULE_NOT_FOUND）。⚠ hidetzu/konjaku#235 ／ hidetzu/konjaku#253 と同じ。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { VERSION as BL_VERSION } from "../../scripts/bl-format.mjs";
import { ROOT, PUB, ok, bad, head, src, TOP, seen, BLOCK_COMMENT, HTML_COMMENT, HEAD_COMMENT, LINE_COMMENT } from "./lib.mjs";

// 事物の索引の読み方。⚠ **ここ1か所**にする（z12 の束ごとに、中の z14 を1ビットずつ）。
//   写すと、索引の持ち方を変えたときに片方だけ直して、同じ問いに違う答えが出る。
const evCovered = (idx, tileOf) => (lon, lat) => {
  const t = tileOf(lon, lat, 14), S = Math.log2(idx.sub);
  const bx = t.x >> S, by = t.y >> S;
  const bit = 1 << (((t.y - by * idx.sub) * idx.sub) + (t.x - bx * idx.sub));
  return { t, on: !!((idx.tiles[`${bx}/${by}`] ?? 0) & bit) };
};

head("配っている現物");

// ⚠ 同じ問いに答える実装が2つある（取り込みと実行時）。片方だけ型を足すと、
//   取り込み済みかどうかで答えが変わる。実際に precision・紀元前・枠外で起きた。
{
  const ing = await readFile("scripts/ingest-wikidata.mjs", "utf8").catch(() => "");
  const ev = src["events.js"] ?? "";
  const kinds = /const KINDS\s*=\s*\{([\s\S]*?)\};/.exec(ing)?.[1] ?? "";
  const a = [...new Set([...kinds.matchAll(/(Q\d+)\s*:/g)].map((m) => m[1]))].sort();
  const b = [...new Set([...ev.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]))].sort();
  if (!a.length || !b.length) bad(`型の一覧が読めない（取り込み ${a.length} / 実行時 ${b.length}）`);
  const only = (x, y) => x.filter((q) => !y.includes(q));
  const d1 = only(a, b), d2 = only(b, a);
  (d1.length || d2.length)
    ? bad(`取り込みと実行時で、拾う型が違う（取り込みだけ: ${d1.join(",") || "なし"} ／ `
        + `実行時だけ: ${d2.join(",") || "なし"}）`)
    : ok(`取り込みと実行時が、同じ型を拾っている（${a.length} 種）`);
}

// ⚠ 建物のタイルが重くなりすぎないよう、上限を決めて見張る。
//   /peel は1画面で z14 を最大4枚読む。同じ画面が読む MapLibre 本体が gz 換算で
//   約1MB なので、**建物4枚で本体を超えない**ことを目安にする → 1枚 250KB。
//   実測（2026-08-14）: 詰める前は 1枚 473KB で、4枚だと 1.9MB。詰めて 199KB。
//   濃い土地を足したときに、また静かに超えていくので機械で押さえる。
{
  const { readFileSync: rfz, readdirSync: rdz, existsSync: exz } = await import("node:fs");
  const { gzipSync } = await import("node:zlib");
  const D = "public/data/bl/14", CAP = 250 * 1024;
  if (!exz(D)) bad("建物のファイルが無い");
  else {
    let worst = { f: "", gz: 0 }, n = 0, sum = 0;
    for (const x of rdz(D)) for (const f of rdz(`${D}/${x}`)) {
      if (!f.endsWith(".json")) continue;
      const gz = gzipSync(rfz(`${D}/${x}/${f}`)).length;
      n++; sum += gz;
      if (gz > worst.gz) worst = { f: `${x}/${f}`, gz };
    }
    const kb = (v) => `${Math.round(v / 1024)}KB`;
    worst.gz > CAP
      ? bad(`建物のタイルが重すぎる: ${worst.f} が gz ${kb(worst.gz)}（上限 ${kb(CAP)}）。`
          + "4枚読むと MapLibre 本体より重くなる。詰め方か配る単位を見直すこと")
      : ok(`建物のタイル ${n} 枚、いちばん重い1枚が gz ${kb(worst.gz)}（上限 ${kb(CAP)}／合計 ${kb(sum)}）`);
  }
}

// ⚠ 建物の詰め方は、書く側（scripts/bl-format.mjs）と読む側（peel3d.js の
//   unpackBuildings）が対になっている。片方だけ直すと**建物の形が静かにずれる**
//   （画面は何も言わない）。同じ入力を両方に通して、同じ形になることを見る。
{
  const { readFileSync: rf3 } = await import("node:fs");
  const { pack, unpack, VERSION, HSRC } = await import("../../scripts/bl-format.mjs");
  // 実際のタイルを1枚、両方の手順で戻して突き合わせる
  const src = JSON.parse(rf3("public/data/bl/14/14553/6453.json", "utf8"));
  const html = rf3("public/peel3d.js", "utf8");
  const v = /const BL_V=(\d+), BL_HSRC=\[([^\]]+)\]/.exec(html);
  if (!v) bad("peel3d.js の BL_V / BL_HSRC が読めない");
  else if (+v[1] !== VERSION)
    bad(`詰め方の版が食い違う: bl-format ${VERSION} / peel3d.js ${v[1]}`);
  else if (v[2].replace(/["\s]/g, "") !== HSRC.join(","))
    bad(`高さの出所の並びが食い違う: bl-format ${HSRC.join(",")} / peel3d.js ${v[2]}`);
  else {
    // peel3d.js の中身をそのまま関数にして動かす（写しではなく本物を測る）
    const body = /function unpackBuildings\(d\)\{([\s\S]*?)\n\}/.exec(html);
    if (!body) bad("peel3d.js の unpackBuildings が読めない");
    else {
      const fn = new Function("d", "BL_V", "BL_HSRC", body[1]);
      const a = fn(src, VERSION, HSRC);
      const b = unpack(src).features;
      const same = a.length === b.length && a.every((f, i) =>
        JSON.stringify(f) === JSON.stringify(b[i]));
      same ? ok(`建物の詰め方が、書く側と読む側で一致（${a.length} 件で照合）`)
        : bad("建物の詰め方が、書く側と読む側で食い違う（形が静かにずれる）");
    }
  }
}

// ⚠ 「未整備のときの振る舞い」を見る検査は、その土地が未整備であることに寄りかかっている。
//   取り込んだ瞬間、検査は外へ出なくなり、何も確かめずに必ず通るようになる。
//   索引に載ったらここで落とす（render.mjs の UNSURVEYED と同じ土地）。
{
  const { readFileSync: rf2, existsSync: ex2 } = await import("node:fs");
  const { tileOf } = await import("../../scripts/db.mjs");
  const ip = "public/data/ev/index.json";
  if (!ex2(ip)) bad("事物の索引が無い");
  else {
    const idx = JSON.parse(rf2(ip, "utf8"));
    // 索引は z12 の束ごとに、中の z14 タイルを1ビットずつ立てて持っている（読み方は evCovered）
    const covered = evCovered(idx, tileOf);
    // ⚠ **道具は `scripts/render/lib.mjs` へ移った**（2026-08-22 に suite へ割った）。
    const m = /const UNSURVEYED = "ll=([\d.]+),([\d.]+)/.exec(rf2("test/render/lib.mjs", "utf8"));
    if (!m) bad("render/lib.mjs の UNSURVEYED が読めない（未整備の検査が土地を失っている）");
    else {
      const { t, on } = covered(+m[2], +m[1]);
      on ? bad(`未整備の検査に使っている土地（z14 ${t.x}/${t.y}）を取り込んでしまった。`
            + "この土地は外へ出なくなり、検査は何も確かめずに通る。別の土地に移すこと")
        : ok(`未整備の検査に使う土地が、まだ未整備（z14 ${t.x}/${t.y}）`);
    }
    // ⚠ ピンは入口。押した先が未整備だと、来た人が最初に見るのが
    //   「分かっていません」になる。取り込んだ範囲と、見せている入口を一致させる。
    //   候補地は画面のコードに重複させず、export-places.mjs が生成した公開データを正とする。
    const quickPath = join(PUB, "data", "quick-places.json");
    if (!existsSync(quickPath)) bad("quick-places.json が無い（候補地の公開データが生成されていない）");
    else {
      const pins = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
      const outside = pins.filter((p) => !covered(p.lon, p.lat).on);
      !pins.length ? bad("quick-places.json に候補地が1つも無い")
        : outside.length ? bad("未整備の土地をピン留めしている: "
            + outside.map((p) => p.name).join("、"))
        : ok(`quick-places.json のピン ${pins.length} 件は、すべて取り込み済みの土地`);
    }
    // ⚠ 建物の索引も見る。3D の入口は「建物が取れる」ことに寄りかかっている
    {
      const bp = "public/data/bl/index.json";
      if (!ex2(bp)) bad("建物の索引が無い");
      else {
        const bi = JSON.parse(rf2(bp, "utf8"));
        const HALF_LON = 0.0090, HALF_LAT = 0.0070;   // peel3d.js の集計範囲
        const quickPath = join(PUB, "data", "quick-places.json");
        const pins = existsSync(quickPath) ? JSON.parse(await readFile(quickPath, "utf8")).places ?? [] : [];
        const bad2 = pins.filter((p) => {
          const a = tileOf(p.lon - HALF_LON, p.lat + HALF_LAT, 14);
          const b = tileOf(p.lon + HALF_LON, p.lat - HALF_LAT, 14);
          for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++)
            if (!bi.tiles[`${x}/${y}`]) return true;
          return false;
        });
        bad2.length
          ? bad(`3D のピンが、押すと Overpass 待ちになる: ${bad2.map((p) => p.name).join("、")}`)
          : ok(`3D のピン ${pins.length} 件は、すべて建物まで取り込み済み`);
      }
    }
  }
}

// ⚠ 上限に当たったタイルでは、消えた判定をしてはいけない。
//   ここは実際に動かして確かめる（読んで確かめると、後で条件が入れ替わっても気づけない）
{
  const { toDrop } = await import("../../scripts/db.mjs");
  const was = ["wd:Q1", "wd:Q2"], alive = new Set(["wd:Q1"]);
  const normal = toDrop(was, alive, 0), cut = toDrop(was, alive, 1);
  (normal.length === 1 && normal[0] === "wd:Q2" && cut.length === 0)
    ? ok("上限に当たったタイルでは、消えたことにしない（通常 1 件／上限 0 件）")
    : bad(`消えた判定が壊れている: 通常 ${JSON.stringify(normal)} / 上限 ${JSON.stringify(cut)}`);
}

// ⚠ 索引に載っているのに本体が無いと、画面は 404 を「未整備」と読んで外へ出る。
//   逆に本体があるのに索引に無いと、配ったのに一度も使われない。
//   取り込みとデプロイがずれた状態を、ここで止める。
{
  const { existsSync: ex, readFileSync: rf } = await import("node:fs");
  for (const [name, dir, kind] of [["事物", "public/data/ev", "ev"], ["建物", "public/data/bl", "bld"]]) {
    const ip = `${dir}/index.json`;
    if (!ex(ip)) { bad(`${name}の索引が無い: ${ip}`); continue; }
    let idx;
    try { idx = JSON.parse(rf(ip, "utf8")); }
    catch (e) { bad(`${name}の索引が読めない: ${e.message}`); continue; }
    const keys = Object.keys(idx.tiles ?? {});
    if (!keys.length) { bad(`${name}の索引が空`); continue; }
    const miss = [], broken = [];
    for (const k of keys) {
      const f = `${dir}/${idx.z}/${k}.json`;
      if (!ex(f)) { miss.push(k); continue; }
      try {
        const j = JSON.parse(rf(f, "utf8"));
        const [z, x, y] = j.tile ?? [];
        if (`${x}/${y}` !== k || z !== idx.z) broken.push(`${k}→${z}/${x}/${y}`);
      } catch { broken.push(`${k}(壊れている)`); }
    }
    miss.length ? bad(`${name}: 索引にあるのに本体が無い ${miss.length} 件（${miss.slice(0, 3).join(",")}）`)
      : broken.length ? bad(`${name}: 索引と中身が食い違う ${broken.slice(0, 3).join(",")}`)
      : ok(`${name}の索引と本体が揃っている（z${idx.z} ${keys.length} 件）`);
  }
}

// ⚠ 索引の全区画が、**同じ問いに対して**見られていること。
//   coverage.spec は「何を訊いたか」で、訊く項目を増やすとここが変わる。
//   実際に踏んだ（2026-08-15）: 説明を足して 87 区画を取り直したとき、
//   渋谷駅の 1 区画だけ WDQS が retry 尽きで落ちた。仕組みは正しく「見ていない」として
//   古い spec を残したのに、**私がログを見ずにタイルを書き出した**。
//   結果、渋谷の 60 件だけ説明が無いまま配られ、しかも画面は
//   「落とすと何も残らない項目には出ません」と、取っていないものを落としたことにしていた
//   （掟: 取れなかったことを「無い」と言わない、の裏返し）。
//   spec に差が記録されているのに誰も見ていなかった。ここで見る。
{
  const { existsSync: ex } = await import("node:fs");
  const DB = ".data/konjaku.db";
  if (!ex(DB)) ok("索引の元データは手元に無い（取り込みを走らせた人だけが見る検査）");
  else {
    const { open } = await import("../../scripts/db.mjs");
    const db = open();
    for (const layer of ["ev", "bld"]) {
      const rows = db.prepare(
        "SELECT spec, COUNT(*) c FROM coverage WHERE layer=? GROUP BY spec ORDER BY c DESC").all(layer);
      if (!rows.length) continue;
      if (rows.length === 1) { ok(`${layer} の索引 ${rows[0].c} 区画は、同じ問いで見ている`); continue; }
      const odd = rows.slice(1);
      const which = db.prepare(
        "SELECT z14x,z14y,n FROM coverage WHERE layer=? AND spec=? LIMIT 3").all(layer, odd[0].spec);
      bad(`${layer} の索引に、古い問いのまま残っている区画が ${
        odd.reduce((s, r) => s + r.c, 0)} 個ある（${
        which.map((r) => `${r.z14x}/${r.z14y}(${r.n}件)`).join(",")}）。`
        + `取り込みが落ちた区画。そのまま配ると、そこだけ中身が欠けたまま「そういうデータだ」と言うことになる`);
    }
  }
}

// 配布している年つき事物の**意味**を見る。
// ⚠ ここまでの検査は「索引と本体が揃っているか」（＝形）だけで、
//   中身の値どうしが矛盾していないかは1件も見ていなかった。値を壊しても CI は緑になる。
// ⚠ 数え上げは**対象件数と違反件数の両方**を出す。0 件だけ見せると、
//   「見て 0 件」と「そもそも見ていない」が同じ顔になる。
{
  const { readFileSync: rfe, readdirSync: rde, statSync: ste, existsSync: exe } = await import("node:fs");
  const { tileOf } = await import("../../scripts/db.mjs");
  const ip = join(PUB, "data", "ev", "index.json");
  if (!exe(ip)) bad("事物の索引が無い（意味検査が何も見ていない）");
  else {
    const idx = JSON.parse(rfe(ip, "utf8"));
    const covered = evCovered(idx, tileOf);
    const files = [];
    (function walk(d) {
      if (!exe(d)) return;
      for (const e of rde(d)) {
        const q = `${d}/${e}`;
        ste(q).isDirectory() ? walk(q) : (e.endsWith(".json") && files.push(q));
      }
    })(join(PUB, "data", "ev", String(idx.z)));
    const PREC = ["year", "decade", "century"];
    const v = { 終了年が開始年より前: [], 精度が3種以外: [], 桁が精度と矛盾: [],
      タイルの外: [], 索引が見ていない場所: [], ID重複: [], 必須項目が無い: [] };
    const seen = new Map();
    let n = 0;
    for (const f of files) {
      let j; try { j = JSON.parse(rfe(f, "utf8")); } catch { bad(`事物の本体が壊れている: ${f}`); continue; }
      const [z, tx, ty] = j.tile ?? [];
      for (const x of j.f ?? []) {
        n++;
        const at = `${x.id ?? "(idなし)"}`;
        if (!x.id || !x.l || !Array.isArray(x.c) || !Array.isArray(x.y) || !x.p) v.必須項目が無い.push(at);
        const [from, to] = x.y ?? [];
        // ⚠ to は「分かっていない」で null になる（＝まだ在る、ではない）。null は違反ではない
        if (to != null && from != null && to < from) v.終了年が開始年より前.push(`${at} ${from}→${to}`);
        if (!PREC.includes(x.p)) v.精度が3種以外.push(`${at} ${x.p}`);
        // decade は開始年〜+9、century は開始年〜+99 として扱う。開始年の桁が合っていないと、
        // 幅の当て方（yspan）がそのままずれる
        if (x.p === "decade" && from % 10 !== 0) v.桁が精度と矛盾.push(`${at} decade ${from}`);
        if (x.p === "century" && from % 100 !== 0) v.桁が精度と矛盾.push(`${at} century ${from}`);
        if (Array.isArray(x.c) && x.c.length === 2) {
          const t = tileOf(x.c[0], x.c[1], z);
          if (t.x !== tx || t.y !== ty) v.タイルの外.push(`${at} ${t.x}/${t.y}≠${tx}/${ty}`);
          // ⚠ 索引が「見た」と言っていない場所のものを配らない。配ると、
          //   問い合わせていない地面について「これで全部」と言うことになる
          if (!covered(x.c[0], x.c[1]).on) v.索引が見ていない場所.push(`${at} ${x.c.join(",")}`);
        }
        if (x.id) { if (seen.has(x.id)) v.ID重複.push(`${at}（${seen.get(x.id)} と ${f}）`); else seen.set(x.id, f); }
      }
    }
    if (!files.length || !n) bad("配布している事物が1件も読めない（この検査が何も見ていない）");
    else {
      const hit = Object.entries(v).filter(([, a]) => a.length);
      hit.length
        ? bad(`配布データの意味に違反: ${hit.map(([k, a]) => `${k} ${a.length}件（${a.slice(0, 2).join(" / ")}）`).join("／")}`
            + `（対象 ${n} 件）`)
        : ok(`配布している事物 ${n} 件（${files.length} ファイル）に意味の違反なし`
            + `（範囲 ${Object.keys(v).length} 種を全件走査）`);
    }
  }
}

// 年の精度の決め方が、取り込み側（静的配布）と実行時（Wikidata 直）で同じであること。
// ⚠ 実際にずれていた（2026-08-16 に発見）。Wikidata の精度（dateP）が無いとき、
//   取り込み側は Number(undefined) が NaN になって "century"、実行時側は "year" を返していた。
//   同じ項目が、静的では 99年幅・実行時では 0年幅になり、**経路によって出る年代が変わる**。
//   ⚠ 字面を比べるのではなく、**両方の式を実際に動かして**突き合わせる。
{
  const ing = await readFile(join(ROOT, "scripts", "ingest-wikidata.mjs"), "utf8");
  const ev = await readFile(join(PUB, "events.js"), "utf8");
  const e1 = /const prec = \(p\) => \(([\s\S]*?)\);/.exec(ing)?.[1];
  // ⚠ 式の書き方に強くしておく。以前は `…"century"),` で終わる形しか拾えず、
  //   実行時側を古い形に戻すと**照合そのものをやめて**「式を読めない」で落ちていた
  //   （落ちるだけましだが、食い違いとして検出できていない）。
  //   precision: から次の url: までを丸ごと取る。
  //   ⚠ events.js には precision: が2つある（静的タイル側と Wikidata 直側）。
  //     row.dateP で始まるほう（＝実行時）に固定して拾う。
  const e2 = /precision:\s*(Number\(row\.dateP[\s\S]*?),\s*\n\s*(?:\/\/[^\n]*\n\s*)*url:/.exec(ev)?.[1];
  if (!e1 || !e2) bad(`年の精度の式を読めない（取り込み ${!!e1} / 実行時 ${!!e2}。この検査が何も見ていない）`);
  else {
    const f1 = new Function("p", `return (${e1});`);
    const f2 = new Function("p", `return (${e2.replaceAll("row.dateP?.value", "p")});`);
    // SPARQL は文字列で返す。⚠ 値が無い場合（undefined・空文字）が、まさにずれていた側
    const IN = ["11", "10", "9", "8", "7", "6", "0", "", undefined, null];
    const off = IN.filter((x) => f1(x) !== f2(x));
    off.length
      ? bad(`年の精度の決め方が経路で違う: ${off.map((x) => `${JSON.stringify(x)} → 取り込み ${f1(x)} / 実行時 ${f2(x)}`).join("、")}`)
      : ok(`年の精度の決め方が、取り込みと実行時で一致（${IN.length} 通りで照合。精度なし → ${f1(undefined)}）`);
  }
}

// 上流から消えた行（dropped_at）が、配布物に出ないこと。
// ⚠ 除外は Exporter の WHERE 1か所だけに依存している。落ちても配布物を見て気づけない
//   （消えた行が「まだ在る」として配られるので、画面はむしろ静かになる）。
// ⚠ **一時 DB と一時の書き出し先で走らせる。** Exporter は書き出し先を rmSync するので、
//   本物の public/data/ev を消さないよう KONJAKU_EV_OUT を渡す。
{
  const { mkdtempSync, rmSync: rmt, readFileSync: rft, existsSync: ext } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "konjaku-ev-"));
  try {
    const { SCHEMA } = await import("../../scripts/db.mjs");            // ⚠ スキーマは写さない
    const { DatabaseSync } = await import("node:sqlite");
    const dbPath = join(dir, "t.db"), out = join(dir, "ev");
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    db.exec(`INSERT INTO coverage (z14x,z14y,layer,source,at,n,truncated)
             VALUES (14552,6451,'ev','wikidata','2026-08-16',2,0)`);
    const ins = db.prepare(`INSERT INTO feature
      (id,source,source_url,retrieved_at,label,kind,lon,lat,year_from,year_to,precision,dropped_at,z14x,z14y)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run("wd:QLIVE", "wikidata", "https://example.invalid/live", "2026-08-16",
      "生きている記録", "building", 139.79, 35.65, 1930, null, "year", null, 14552, 6451);
    ins.run("wd:QDROP", "wikidata", "https://example.invalid/drop", "2026-08-16",
      "上流から消えた記録", "building", 139.79, 35.65, 1931, null, "year", "2026-08-16", 14552, 6451);
    db.close();
    execFileSync(process.execPath, ["scripts/export-tiles.mjs"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, KONJAKU_DB: dbPath, KONJAKU_EV_OUT: out } });
    const idx = JSON.parse(rft(join(out, "index.json"), "utf8"));
    const key = Object.keys(idx.tiles)[0];
    const body = ext(join(out, String(idx.z), `${key}.json`))
      ? JSON.parse(rft(join(out, String(idx.z), `${key}.json`), "utf8")) : null;
    const ids = (body?.f ?? []).map((x) => x.id);
    !ids.includes("wd:QLIVE")
      ? bad(`Exporter が生きている行を配っていない（この検査が何も見ていない）: ${JSON.stringify(ids)}`)
      : ids.includes("wd:QDROP")
        ? bad("上流から消えた行（dropped_at）が配布物に入っている")
        : ok(`上流から消えた行は配布物に入らない（一時 DB で 2 件中 1 件を除外）`);
  } catch (e) {
    bad(`dropped_at の除外を確かめられなかった: ${String(e.message).split("\n")[0]}`);
  } finally {
    rmt(dir, { recursive: true, force: true });
  }
}

// 共通アセットの入口と、生成元の候補地が食い違わないこと。
// seeds を変更して export を忘れると、画面は古い候補を静かに出し続けるため、
// 公開JSONを生成元と突き合わせる。
{
  const seedLines = (await readFile(join(ROOT, "seeds", "areas.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((a) => a.quick);
  const quickPath = join(PUB, "data", "quick-places.json");
  if (!existsSync(quickPath)) bad("quick-places.json が無く、候補地の生成結果を照合できない");
  else {
    const places = JSON.parse(await readFile(quickPath, "utf8")).places ?? [];
    const key = (p) => `${p.id}|${p.lon}|${p.lat}|${p.title ?? ""}`;
    const want = new Set(seedLines.map((a) => key({id:a.id,lon:a.ll[0],lat:a.ll[1],title:a.quickTitle ?? a.title})));
    const got = new Set(places.map(key));
    const missing = [...want].filter((x) => !got.has(x));
    const extra = [...got].filter((x) => !want.has(x));
    missing.length || extra.length
      ? bad(`候補地の生成結果が seeds と不一致（不足 ${missing.length} / 余分 ${extra.length}）`)
      : ok(`候補地の生成結果が seeds/areas.jsonl と一致（${places.length} 件）`);
    // ⚠ トップの場所未選択で出すのは、この 10 件のうち **3 件だけ**（入力例）。
    //   index.html は id で指しているので、**配っているデータに その id が無いと
    //   例が 1 件も出ない**（画面側には先頭 3 件へ落ちる保険があるが、
    //   保険が働いた画面は「豊洲・渋谷・広島」ではなくなる。ここで気づけるようにする）。
    //   掟: 同じ問いに答える実装を2つ持つときは、機械で突き合わせる。
    const m = /const TOP_EXAMPLE_IDS\s*=\s*\[([^\]]*)\]/.exec(TOP);
    if (!m) bad("index.html の TOP_EXAMPLE_IDS を読めない（トップの入力例が何も突き合わされていない）");
    else {
      const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      const have = new Set(places.map((p) => p.id));
      const lost = ids.filter((id) => !have.has(id));
      ids.length !== 3
        ? bad(`トップの入力例が 3 件でない: ${ids.length} 件（${ids.join("・")}）`)
        : lost.length
          ? bad(`トップの入力例に、配っていない id がある: ${lost.join("・")}`
              + "（画面は先頭3件へ落ちるので、見た目は壊れず静かに別の土地になる）")
          : ok(`トップの入力例 3 件（${ids.join("・")}）は quick-places.json にある`);
    }
  }
}

// 共通アセットマニフェストの参照先が実在し、建物索引の版・日付と一致すること。
// 壊れた assets.json は建物だけ実行時取得へ落ちる入口になるため、存在確認だけで終わらせない。
{
  const path = join(PUB, "data", "assets.json");
  if (!existsSync(path)) bad("assets.json が無い（共通アセットの入口が生成されていない）");
  else {
    const m = JSON.parse(await readFile(path, "utf8"));
    const b = m.layers?.buildings;
    const idxPath = join(PUB, String(b?.index ?? "").replace(/^\.\//, ""));
    const tile = String(b?.tile ?? "");
    const idx = existsSync(idxPath) ? JSON.parse(await readFile(idxPath, "utf8")) : null;
    const tilePath = tile.replace(/^\.\//, "").replace("{x}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[0] ?? ""))
      .replace("{y}", String(Object.keys(idx?.tiles ?? {})[0]?.split("/")[1] ?? ""));
    const errors = [];
    if (!b || b.format !== `packed-geojson-v${BL_VERSION}`) errors.push(`建物format=${b?.format ?? "なし"}`);
    if (!idx) errors.push("建物索引が無い");
    if (idx && b.at !== idx.at) errors.push(`建物at=${b.at} / 索引at=${idx.at}`);
    if (idx && (!Object.keys(idx.tiles ?? {}).length || !existsSync(join(PUB, tilePath)))) errors.push("建物タイルが無い");
    errors.length ? bad(`assets.json の建物参照が不正: ${errors.join("、")}`)
      : ok(`assets.json の建物参照が索引・タイルと一致（${Object.keys(idx.tiles).length} 区画）`);
  }
}

// ============================================================
// ⚠ 土地ごとの例外が、⚠ もう一度生えてきていないか
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-25。hidetzu/konjaku#232 の 26 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **元の見出し（`head()`）は落とした**（⚠ 行き先の見出しの下に入る）。
// ⚠ **ここが「配っている現物」の仲間である理由**: ⚠ **`public/data/` に何が置いてあるか。**
//   ⚠ 1 つの土地だけが専用の現物を持つと、⚠ **その土地だけ別の経路を通る。**
// ⚠ **以前ここは範囲索引（豊洲 1 件だけ）を見ていた**（2026-08-20 に外した）。
//   ⚠ 豊洲だけが専用の集計範囲・事前生成の水域・事前生成の建物を持ち、
//     ⚠ **1 つの土地だけが他と違う経路を通っていた**（掟: 同じ問いに答える実装を2つ持たない）。
// ⚠ **守りたかったこと（実行時 Overpass に黙って落ちない）は消していない。**
//   それは下の「タイル索引」と共通マニフェストの検査が見ている。
// ⚠ ここが見るのは、**その例外がもう一度生えてこないこと**。
{
  const gone = ["areas.json", "toyosu-buildings.geojson", "toyosu-water.geojson"];
  for (const f of gone)
    existsSync(join(PUB, "data", f))
      ? bad(`public/data/${f} が戻っている。1 つの土地だけが違う経路を通る`)
      : ok(`public/data/${f} は無い`);
  // ⚠ 読む側が生えていないか。**配っていないものを読みに行くと、静かに 404 を出し続ける**
  // ⚠ **コメントを先に落とす。**落とさないと、上の説明の字面をこの検査が拾う（CLAUDE.md §5）。
  let reads = 0;
  for (const [f, s2] of Object.entries(src)) {
    if (!/\.(js|html)$/.test(f)) continue;
    // ⚠ HTML のコメント（<!-- -->）も落とす。⚠ **落とさないと、何を外したかを
    //   説明した .html のコメントを、この検査自身が「読んでいる」と読む**（CLAUDE.md §5）
    const bare = s2.replace(HTML_COMMENT, " ")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
    for (const g of gone)
      if (bare.includes(g)) { bad(`${f} が data/${g} を読もうとしている（もう配っていない）`); reads++; }
  }
  if (!reads) ok("公開物のどれも、消した 3 件を読みに行っていない");
}


// ⚠ **送る側と受ける側の列挙が、⚠ 食い違っていないか**（2026-08-28・hidetzu/konjaku#354）。
//
// ⚠ **これが無かったので、⚠ 不具合が「直した体」で 17 日間残った。**
//   ⚠ `worker.js` の受け側の列挙に `search` は在り、⚠ **コメントも「送っていなかった」と書いていた**が、
//   ⚠ **送る側にはどこにも無かった。**⚠ **D1 の記録に 1 行も無い**（実測 2026-08-28）。
//
// ⚠ **落ちない不具合。**⚠ **入口が全滅しても、⚠ 記録がゼロになるだけ。**
//   ⚠ **ゼロは「壊れていない」と読める**ので、⚠ **見ている人ほど誤解する。**
//
// ⚠ **両向きに見る。**
//     受ける気でいるのに送られない  ⚠ **永遠に 0 件。**⚠ 「無事」と読めてしまう
//     送るのに受けない              ⚠ **黙って捨てられる**（⚠ 受け側は列挙外を 204 で捨てる）
//
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ この説明に書いた字を拾う**
//   （⚠ 受け側のコメントにも、⚠ 送る側のコメントにも、⚠ 対象名がそのまま書いてある）。
{
  const bare = (t) => t.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
  const worker = bare(await readFile(join(ROOT, "worker.js"), "utf8"));
  const share = bare(await readFile(join(PUB, "share.js"), "utf8"));
  const setOf = (name, code) => {
    const m = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(code);
    return new Set([...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  };
  const TARGETS = setOf("TARGETS", worker);
  // ⚠ **送る側が作れる対象**: ⚠ 直接書いた `health:<名前>:` と、⚠ 一覧を回して作る形の両方
  const sent = new Set();
  for (const m of share.matchAll(/health:([a-z]+):/g)) sent.add(m[1]);
  for (const m of share.matchAll(/for \(const name of \[([^\]]*)\]\)/g))
    for (const x of m[1].matchAll(/"([^"]+)"/g)) sent.add(x[1]);
  const fails = [];
  if (!TARGETS.size) fails.push("worker.js の受け側の列挙を読めない（⚠ この検査が何も見ていない）");
  if (!sent.size) fails.push("share.js から送る対象を読めない（⚠ この検査が何も見ていない）");
  for (const t of [...TARGETS].sort())
    if (!sent.has(t)) fails.push(`${t}: 受けるのに、⚠ **どこからも送っていない**`
      + `（⚠ 永遠に 0 件になり、⚠ 「無事」と読めてしまう）`);
  for (const t of [...sent].sort())
    if (!TARGETS.has(t)) fails.push(`${t}: 送っているのに、⚠ **受け側が捨てる**`);
  fails.length
    ? bad(`計測の対象の列挙が、送る側と受ける側で食い違っている: ${fails.join(" / ")}`)
    : ok(`計測の対象は、送る側と受ける側で揃っている（${TARGETS.size} 種: ${[...TARGETS].sort().join("・")}）`);
}


// ⚠ **イベントの列挙も、⚠ 送る側と受ける側で突き合わせる**（2026-08-28・hidetzu/konjaku#355）。
//
// ⚠ **上の突き合わせは `health:<対象>:<状態>` だけを見ていた。**⚠ `EVENTS` は見ていなかった。
//   ⚠ **同じ穴が空きうる**（⚠ 受け側にだけ足す → ⚠ 永遠に 0 件。⚠ 「起きていない」と読める）。
//
// ⚠ **両向きに見る。**
//     受ける気でいるのに送られない  ⚠ **永遠に 0 件**（⚠ hidetzu/konjaku#354 と同じ形）
//     送るのに受けない              ⚠ **黙って捨てられる**（⚠ 受け側は列挙外を 204 で捨てる）
//
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ 説明に書いた名前を自分で拾う**
//   （⚠ `worker.js` の `EVENTS` にも、⚠ `share.js` にも、⚠ コメントに名前がそのまま書いてある）。
{
  const bare = (t) => t.replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
  const worker = bare(await readFile(join(ROOT, "worker.js"), "utf8"));
  const EVENTS = new Set([...(/const EVENTS = new Set\(\[([\s\S]*?)\]\)/.exec(worker)?.[1] ?? "")
    .matchAll(/"([^"]+)"/g)].map((m) => m[1]));

  // ⚠ **`/t` へ本文を渡しうる公開物**。⚠ **`peel.html` は `tick()` を通さず直に叩く**ので、ここに要る
  const FILES = ["share.js", "top.js", "peel.html", "peel3d.js"];
  const bodies = await Promise.all(FILES.map((f) => readFile(join(PUB, f), "utf8").then(bare)));
  const all = bodies.join("\n");

  // ⚠ **送っている名前**: ⚠ `tick("X")` に直に渡したものと、⚠ `/t` を直に叩くときの本文
  const sent = new Set();
  for (const m of all.matchAll(/\btick\(\s*"([^"]+)"/g)) sent.add(m[1]);
  for (const m of all.matchAll(/"\/t"\s*,\s*"([^"]+)"/g)) sent.add(m[1]);
  for (const m of all.matchAll(/body\s*:\s*"([^"]+)"/g)) sent.add(m[1]);
  // ⚠ **`outcome()` は 1 語に畳んでから `tick()` へ渡す**ので、⚠ 中の `return` も送る側
  //   ⚠ **三項で返している行がある**ので、⚠ `return` 文の中の文字列を全部拾う
  //   （⚠ `return "X"` だけを見ていたら、⚠ `judged.ok` / `judged.coarse` を取り落とした）
  const oc = /function outcome\(f\) \{([\s\S]*?)\n  \}/.exec(bodies[0]);
  for (const r of (oc?.[1] ?? "").matchAll(/return ([^;]*);/g))
    for (const m of r[1].matchAll(/"([^"]+)"/g)) sent.add(m[1]);

  const fails = [];
  if (!EVENTS.size) fails.push("worker.js の EVENTS を読めない（⚠ この検査が何も見ていない）");
  if (!sent.size) fails.push("公開物から送る名前を読めない（⚠ この検査が何も見ていない）");
  for (const e of [...EVENTS].sort())
    if (!sent.has(e)) fails.push(`${e}: 受けるのに、⚠ **どこからも送っていない**`
      + `（⚠ 永遠に 0 件になり、⚠ 「起きていない」と読めてしまう）`);
  for (const e of [...sent].sort())
    // ⚠ **`health:` と `from:` は上の突き合わせが見る**（⚠ ここでは二重に見ない）
    if (!EVENTS.has(e) && !e.startsWith("health:") && !e.startsWith("from:"))
      fails.push(`${e}: 送っているのに、⚠ **受け側が捨てる**`);
  fails.length
    ? bad(`計測のイベントの列挙が、送る側と受ける側で食い違っている: ${fails.join(" / ")}`)
    : ok(`計測のイベントは、送る側と受ける側で揃っている（${EVENTS.size} 種）`);
}

// ⚠ **共有の結末が、⚠ 排他であること**（2026-08-28・hidetzu/konjaku#355）。
//
// ⚠ **`share.tap` は分母。**⚠ **結末が 2 つ送られると、⚠ 合計が分母を超える。**
//   ⚠ **超えた表は、⚠ 読んだ人が「そんなはずはない」と気づくまで、⚠ 静かに間違ったままになる。**
// ⚠ **ここは字面で見る**（⚠ 実際に押したときの本数は、⚠ 実描画が数える）。
{
  const share = (await readFile(join(PUB, "share.js"), "utf8"))
    .replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1");
  const body = /async function share\(f, title, url, say\) \{([\s\S]*?)\n  \}/.exec(share)?.[1];
  const fails = [];
  if (!body) fails.push("share() の中を読めない（⚠ この検査が何も見ていない）");
  else {
    // ⚠ **押したことは、⚠ 1 回だけ数える**
    const taps = [...body.matchAll(/tick\("share\.tap"\)/g)].length;
    if (taps !== 1) fails.push(`押したことを ${taps} 回数えている（⚠ 分母は 1 回）`);
    // ⚠ **結末は、⚠ どれも 1 回だけ**
    for (const [name, want] of [["share.cancelled", 1], ["share.failed", 1]]) {
      const n = [...body.matchAll(new RegExp(`tick\\("${name.replace(".", "\\.")}"\\)`, "g"))].length;
      if (n !== want) fails.push(`${name} を ${n} 回送っている（⚠ ${want} 回のはず）`);
    }
    // ⚠ **やめたときは、⚠ そこで返す**（⚠ 返さないと保存へ落ちて `saved` も送る＝結末が 2 つ）
    if (!/tick\("share\.cancelled"\); return "cancelled";/.test(body))
      fails.push("やめたときに、⚠ **数えてすぐ返していない**（⚠ 結末が 2 つ送られる）");
    // ⚠ **壊れたときは、⚠ 投げ直す**（⚠ 画面の出方を変えないため。⚠ 握りつぶさない）
    if (!/tick\("share\.failed"\);\s*\n\s*throw err;/.test(body))
      fails.push("壊れたときに、⚠ **数えたあと投げ直していない**（⚠ 画面に何も出なくなる）");
  }
  fails.length
    ? bad(`共有の結末の数え方が壊れている: ${fails.join(" / ")}`)
    : ok("共有の結末は排他で、⚠ 押した 1 件と結末 1 件しか送らない");
}
