// 静的検査 — 土地の区分（⚠ **明治期のラスタを、⚠ どう読み、⚠ どう控えるか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 10 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//
// ⚠ **元は「6. 外部リンク」という節名の下にあった**（⚠ 名前と中身が合っていなかった）。
//
// ⚠ **ここが守っているもの**:
//     `swale.js` を動かす      ⚠ 14 区分・水域 2・許容差 60・面の集計と分母
//                              ⚠ **DOM も地図も持たないので、⚠ ここで全部の枝を回せる**
//     位置誤差の但し書き        ⚠ **原典どおり地域（関東・近畿）を書いているか**
//                              ⚠ 落とすと、⚠ **全国どこでも同じ誤差に読める**
//     `land.js` を動かす       ⚠ **控えの鍵・効き方・取れなかった回**（2026-08-25 に合流）
//     `land.js` の面を動かす   ⚠ **範囲ごとの鍵・mask を控えない・同時の重なり**
//
// ⚠ **以前は同じ計算が 4 か所にあり、⚠ うち 3 か所だけを突き合わせていた**
//   （⚠ `build-water.js` は走査から漏れていた。2026-08-17）。
//   ⚠ **突き合わせるより 1 つにするほうが強いので寄せた。**
//   ⚠ **ここでは中身を動かして確かめる**（⚠ 字面ではなく、⚠ 判断そのもの）。
//
// ⚠ **`S.tally` は `KonjakuSwale` のもの**（⚠ `lib.mjs` の `tally` ではない）。
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PUB, ok, bad, head } from "./lib.mjs";

head("土地の区分");

// 明治期のラスタを読む計算は **public/swale.js の1か所**。
// ⚠ 以前は同じものが 4 か所にあり、**3 か所だけ**を機械で突き合わせていた
//   （build-water.js は走査から漏れていた。2026-08-17）。
//   突き合わせるより 1 つにするほうが強いので寄せた。ここでは**中身を動かして確かめる**。
{
  await import(`file://${join(PUB, "swale.js")}`);
  const S = globalThis.KonjakuSwale;
  const px = (...rows) => new Uint8ClampedArray(rows.flat());
  const fails = [];
  const eq = (got, want, what) => { if (got !== want) fails.push(`${what}: ${got} ≠ ${want}`); };

  if (!S) fails.push("swale.js を読み込めない（この検査が何も見ていない）");
  else {
    eq(S.SWALE.length, 14, "区分の数");
    eq(S.SWALE.filter((c) => c.water).length, 2, "水域の数");
    eq(S.TOLERANCE, 60, "許容差");
    // 凡例そのままの色は、その区分になる
    eq(S.classify(147, 200, 254)?.name, "河川・湖沼・海面", "凡例どおりの色");
    eq(S.classify(254, 227, 200)?.name, "砂礫地", "凡例どおりの色（陸）");
    // ⚠ 許容差の境目。ここが動くと、隣の区分に吸われたり全部 null に落ちたりする。
    //   ⚠ 境目は**孤立した色**で見る。隣の区分が近いところで測ると、
    //     許容差ではなく「どちらが近いか」を見てしまう（実際そう書いて 2 回外した）。
    //     堤防 (144,73,11) は 2 番目（泥炭地）まで 171 離れている。
    eq(S.classify(144 + 55, 73, 11)?.name, "堤防", "許容差の内側（距離 55）");
    eq(S.classify(144 + 70, 73, 11), null, "許容差の外側（距離 70）");
    eq(S.classify(0, 0, 0), null, "凡例から遠い色は null");
    // ⚠ **順番の検査。** まず「いちばん近い色」を選び、そのあとで許容差を見る。
    //   逆にすると、いちばん近い色が 60 より遠いときに 2 番目の色を答えてしまう。
    //   実際、寄せるときに逆に書いてしまい、ここで捕まえた（2026-08-17）。
    //   (181,200,254) は 河川(34.0) より 湿地(32.2) のほうが近い → 湿地 が正しい
    eq(S.classify(181, 200, 254)?.name, "湿地", "いちばん近い色を選ぶ");
    //   (110,140,150) はどの区分からも 60 より遠い → null（2番目を拾わない）
    eq(S.classify(110, 140, 150), null, "いちばん近い色が遠ければ null");
    // ⚠ **面の集計。** 分母は「区分に当てはまった画素」で、透明と凡例外は入れない
    const t = S.tally(px(
      [147, 200, 254, 255],   // 水
      [254, 227, 200, 255],   // 砂礫地
      [254, 227, 200, 255],   // 砂礫地
      [0, 0, 0, 0],           // 透明 → 分母から外す
      [0, 0, 0, 255],         // 凡例外 → 分母から外す
    ));
    eq(t.scanned, 5, "見た画素");
    eq(t.transparent, 1, "透明");
    eq(t.unmatched, 1, "凡例外");
    eq(t.classified, 3, "分母（区分に当てはまった画素）");
    eq(t.top?.name, "砂礫地", "いちばん多い区分");
    eq(Math.round(t.top.share * 1000) / 10, 66.7, "いちばん多い区分の割合(%)");
    eq(Math.round(t.waterShare * 1000) / 10, 33.3, "水域の割合(%)");
    // 分母 0 のときに落ちないこと（透明だけのタイル）
    const empty = S.tally(px([0, 0, 0, 0]));
    eq(empty.classified, 0, "透明だけのときの分母");
    eq(empty.top, null, "透明だけのときのいちばん多い区分");
    eq(empty.waterShare, 0, "透明だけのときの水域割合");
  }
  fails.length
    ? bad(`swale.js の単体テストが失敗（${fails.length} 件）: ${fails.join(" / ")}`)
    : ok(`swale.js を動かして確認（14 区分・水域 2・許容差 60・面の集計と分母）`);

  // ⚠ **区分の解説は、こちらで書かない。** 国土地理院の凡例（lw_legend.pdf）の解説文を
  //   要約せずそのまま持つ（掟3: 引用のときは出典を必ず添え、要約しない）。
  //   ⚠ 14 区分と**両方向で**突き合わせる。片方だけ増えても気づけるように。
  {
    const lp = join(PUB, "data", "swale-legend.json");
    if (!existsSync(lp)) bad("swale-legend.json が無い（区分の説明が画面から出せない）");
    else {
      const lg = JSON.parse(await readFile(lp, "utf8"));
      const names = S ? S.SWALE.map((c) => c.name) : [];
      const keys = Object.keys(lg.classes ?? {});
      const miss = names.filter((n) => !keys.includes(n));
      const extra = keys.filter((k) => !names.includes(k));
      const empty = keys.filter((k) => !lg.classes[k]?.text || !lg.classes[k]?.legendName);
      // ⚠ 出典が消えたら落とす。引用なのに出典が無い状態を作らない
      const noSrc = !lg.source || !lg.textSource || !lg.sourceLabel;
      miss.length || extra.length || empty.length || noSrc
        ? bad(`区分の説明が凡例と食い違っている（不足 ${miss.join("・") || "なし"} / `
            + `余分 ${extra.join("・") || "なし"} / 中身が空 ${empty.join("・") || "なし"}`
            + `${noSrc ? " / 出典が無い" : ""}）`)
        : ok(`区分の説明 ${keys.length} 件が 14 区分と一致し、出典（${lg.textSource}）を持つ`);
      // ⚠ 位置誤差の但し書きは、原典の**地域の限定**まで写していること。
      //   以前は地域を落として「原典は三角点整備前の資料のため位置誤差を含む」と、
      //   原典より広く言っていた（2026-08-17 に凡例を読んで気づいた）。
      /関東地区/.test(lg.caveat ?? "") && /近畿地区/.test(lg.caveat ?? "")
        ? ok("位置誤差の但し書きが、原典どおり地域（関東・近畿）を書いている")
        : bad("位置誤差の但し書きから、原典にある地域の限定（関東地区・近畿地区）が落ちている");
    }
  }
}

// ============================================================
// ⚠ land.js を動かして確かめる（控える層）
// ============================================================
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 18 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **この 2 つは、⚠ 節 9 の道具（`seen` / `stripJs`）に触っていない**
//     （⚠ 実測 2026-08-24）。⚠ **だから、⚠ 道具を動かす前に出せる。**
// ⚠ **ここが「土地の区分」の仲間である理由**: ⚠ **`public/land.js` が相手。**
//   ⚠ 上の `swale.js` は ⚠ **ラスタをどう読むか。**⚠ こちらは ⚠ **読んだ結果をどう控えるか。**
//   ⚠ **どちらも DOM も地図も持たない**ので、⚠ ブラウザ抜きで全部の枝を回せる。
// ⚠ **land.js の面を動かして確かめる。**⚠ 字面ではなく振る舞いを見る。
{
  const fails = [];
  const mkStore = () => { const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)),
             removeItem: (k) => m.delete(k), _m: m }; };
  const fresh = async (store, konjaku) => {
    const g = { sessionStorage: store, Konjaku: konjaku };
    const code = await readFile(join(PUB, "land.js"), "utf8");
    new Function("g", code.replace(/\(typeof window === "undefined" \? globalThis : window\)/, "(g)"))(g);
    return g.KonjakuLand;
  };
  // 偽の取得の層。⚠ **何回呼ばれたかを数える**
  const mk = (tilesOk = 1) => {
    const n = { swaleArea: 0 };
    return { n, STATE: { UNREACHABLE: "unreachable" },
      swaleArea: async (b, z) => { n.swaleArea++;
        return { mask: new Uint8Array(4), tw: 2, th: 2, x0: 1, y0: 2, z,
          waterPx: 1, classCounts: { 水: 1 }, classifiedPixels: 1,
          transparentPixels: 0, unknownPixels: 0,
          tiles: { ok: tilesOk, absent: 0, unreachable: tilesOk ? 0 : 1 }, ratio: 0.25 }; } };
  };
  const BB = { w: 139.79, s: 35.65, e: 139.80, n: 35.66 };

  // 1. 点と面で、キーが別
  { const L = await fresh(mkStore(), mk());
    if (L.areaKey(BB, 16) === L.key(139.7975, 35.6548))
      fails.push("点と面が同じキーになっている"); }
  // 2. 範囲が違えば、キーも違う
  { const L = await fresh(mkStore(), mk());
    if (L.areaKey(BB, 16) === L.areaKey({ ...BB, e: 139.81 }, 16))
      fails.push("違う範囲が同じキーになっている"); }
  // 3. ⚠ **mask を控えていない**（保存の中身に mask が入らない）
  { const st = mkStore(), L = await fresh(st, mk());
    await L.meijiArea(BB, 16);
    const saved = [...st._m.values()].join("");
    if (/mask/.test(saved)) fails.push("mask を控えている（1.25MB。保存が埋まる）");
    if (!/classCounts/.test(saved)) fails.push("集計を控えていない（控える意味が無い）"); }
  // 4. ⚠ **1 枚も読めていない回は控えない**（掟: 取得できなかった ≠ 存在しなかった）
  { const st = mkStore(), L = await fresh(st, mk(0));
    await L.meijiArea(BB, 16);
    if (st._m.size !== 0) fails.push("1 枚も読めていない回を控えている（読めない範囲として固まる）"); }
  // 5. 同時に 2 回頼まれても、取得は 1 回
  { const K = mk(), L = await fresh(mkStore(), K);
    await Promise.all([L.meijiArea(BB, 16), L.meijiArea(BB, 16)]);
    if (K.n.swaleArea !== 1) fails.push(`同時の 2 回が ${K.n.swaleArea} 本になっている`); }
  // 6. ⚠ **mask はそのまま返る**（画面が矩形化に使う）
  { const L = await fresh(mkStore(), mk());
    const a = await L.meijiArea(BB, 16);
    if (!(a.mask instanceof Uint8Array)) fails.push("mask が返っていない（画面が描けない）");
    if (a.tw !== 2 || a.x0 !== 1) fails.push("mask の大きさ・左上が返っていない（経緯度へ戻せない）"); }
  fails.length
    ? bad(`land.js の面の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 5).join(" / ")}`)
    : ok("land.js の面を動かして確認（点と別のキー・範囲ごとのキー・mask を控えない・"
       + "読めない回を控えない・同時の重なり・mask はそのまま返る）");
}

// ⚠ **land.js を動かして確かめる。**⚠ 字面ではなく、⚠ **実際の振る舞い**を見る。
//   ⚠ DOM も地図も要らない作りにしてあるので、ブラウザを立てずに全部回せる。
{
  const fails = [];
  // 偽の sessionStorage。⚠ **本物を汚さない**
  const mkStore = (opt = {}) => {
    const m = new Map();
    return {
      getItem: (k) => (opt.throwGet ? (() => { throw new Error("no"); })() : (m.get(k) ?? null)),
      setItem: (k, v) => { if (opt.throwSet) throw new Error("full"); m.set(k, String(v)); },
      removeItem: (k) => m.delete(k),
      _m: m,
    };
  };
  // 偽の取得の層。⚠ **何回呼ばれたかを数える**
  const mkKonjaku = (answer) => {
    const n = { landform: 0, meiji: 0, elevation: 0, photos: 0, facts: 0 };
    const one = (key) => async (lon, lat) => { n[key]++; return answer(key, lon, lat); };
    return { n, STATE: { UNREACHABLE: "unreachable" },
      landform: one("landform"), meiji: one("meiji"),
      elevation: one("elevation"), photos: one("photos"),
      facts: async (lon, lat) => { n.facts++;
        return { lon, lat, byKey: { landform: answer("landform", lon, lat),
          meiji: answer("meiji", lon, lat), elevation: answer("elevation", lon, lat),
          photos: answer("photos", lon, lat) } }; } };
  };
  // ⚠ **毎回、真新しい land.js を読む**（前の試験の中身を持ち越さない）
  //   store に "throwGetProp" を渡すと、⚠ **参照そのものが投げる**形になる
  //   （Safari のプライベート・埋め込み枠での遮断。⚠ **メソッドが投げるのとは別**）。
  const fresh = async (store, konjaku) => {
    const g = { Konjaku: konjaku };
    if (store === "throwGetProp")
      Object.defineProperty(g, "sessionStorage",
        { get() { throw new Error("保存は使えません"); } });
    else g.sessionStorage = store;
    const code = await readFile(join(PUB, "land.js"), "utf8");
    new Function("g", code.replace(/\(typeof window === "undefined" \? globalThis : window\)/, "(g)"))(g);
    return g.KonjakuLand;
  };
  const OK = (key) => ({ state: "ok", value: key });
  const NG = () => ({ state: "unreachable" });

  // 1. キーは小数5桁の lat,lon（URL と同じ粒度・同じ並び）
  {
    const L = await fresh(mkStore(), mkKonjaku(OK));
    if (L.key(139.7975, 35.6548) !== "35.65480,139.79750")
      fails.push(`キーが5桁の lat,lon でない（${L.key(139.7975, 35.6548)}）`);
    // ⚠ 6桁目が違うだけの2点は、**同じキーにならない**
    if (L.key(139.79750, 35.65480) === L.key(139.79760, 35.65480))
      fails.push("5桁目が違う2点が同じキーになっている");
  }
  // 2. 2回目は取りに行かない（控えが効いている）
  {
    const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
    await L.terrain(139.7975, 35.6548);
    await L.terrain(139.7975, 35.6548);
    if (K.n.landform !== 1) fails.push(`控えが効いていない（地形分類を ${K.n.landform} 回取った）`);
  }
  // 3. ⚠ **取れなかったものを控えない**（掟: 取得できなかった ≠ 存在しなかった）
  {
    const K = mkKonjaku(NG), L = await fresh(mkStore(), K);
    await L.terrain(139.7975, 35.6548);
    await L.terrain(139.7975, 35.6548);
    if (K.n.landform !== 2)
      fails.push("取れなかった回を控えている（次からずっと「取れない土地」になる）");
  }
  // 4. 別の地点を混ぜない
  {
    const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
    await L.terrain(139.7975, 35.6548);
    await L.terrain(139.7000, 35.6000);
    if (K.n.landform !== 2) fails.push("別の地点で、前の地点の控えを使っている");
  }
  // 5. 壊れた控えがあっても、取りに行って正しく返す（例外を投げない）
  {
    const st = mkStore(), K = mkKonjaku(OK), L = await fresh(st, K);
    st._m.set(L.PREFIX + L.key(139.7975, 35.6548), "{壊れた");
    let got = null;
    try { got = await L.terrain(139.7975, 35.6548); }
    catch (e) { fails.push(`壊れた控えで例外が出た（${e.message}）`); }
    if (got?.state !== "ok") fails.push("壊れた控えのとき、取得へ落ちていない");
  }
  // 6. sessionStorage が使えなくても壊れない
  {
    const K = mkKonjaku(OK);
    for (const [name, st] of [["読めない", mkStore({ throwGet: true })],
                              ["書けない", mkStore({ throwSet: true })],
                              ["そもそも無い", undefined],
                              // ⚠ **参照そのものが投げる。**⚠ これが無いと、
                              //   ⚠ **参照を守っている try を外しても緑になる**（2026-08-20 に踏んだ）
                              ["参照だけで落ちる", "throwGetProp"]]) {
      const L = await fresh(st, K);
      try {
        const got = await L.terrain(139.7975, 35.6548);
        if (got?.state !== "ok") fails.push(`sessionStorage が${name}とき、答えが返っていない`);
      } catch (e) { fails.push(`sessionStorage が${name}ときに例外（${e.message}）`); }
    }
  }
  // 7. 同時に2回頼まれても、取得は1回（控えに入る前の重なり）
  {
    const K = mkKonjaku(OK), L = await fresh(mkStore(), K);
    await Promise.all([L.terrain(139.7975, 35.6548), L.terrain(139.7975, 35.6548)]);
    if (K.n.landform !== 1) fails.push(`同時の2回が ${K.n.landform} 本になっている`);
  }
  // 8. トップが facts で取ったものを、/peel が terrain で使い回す（⚠ この Issue の本題）
  {
    const st = mkStore(), K = mkKonjaku(OK), L = await fresh(st, K);
    await L.facts(139.7975, 35.6548);
    const before = K.n.landform;
    await L.terrain(139.7975, 35.6548);
    if (K.n.landform !== before)
      fails.push("トップで取った地形分類を、/peel が使い回せていない");
  }
  fails.length
    ? bad(`land.js の単体テストが失敗（${fails.length} 件）: ${fails.slice(0, 6).join(" / ")}`)
    : ok("land.js を動かして確認（5桁キー・控えが効く・取れなかった回は控えない・別地点・壊れた控え・保存が使えない・同時の重なり・トップ → /peel）");
}
