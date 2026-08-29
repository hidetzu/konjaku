// 静的検査 — 保存した場所の控え（⚠ **何を保存し、⚠ どこに置き、⚠ 何を送らないか**）
//
// ⚠ **`public-next/saved.js` は DOM も地図も持たない**（`.claude/rules/javascript.md`）。
//   ⚠ **だからここで、⚠ ブラウザ抜きで実際に動かして確かめられる。**
//   ⚠ **字面を見るだけの検査にしない**（⚠ 字面は、⚠ 中身を消しても残る）。
//
// ⚠ **守っているのは 3 つ**:
//     ⚠ 同じ場所を二重に持たない（⚠ 地図の中心は指で動くので、⚠ 厳密一致では防げない）
//     ⚠ 置き場が読めないことと、⚠ 1 件も無いことを分ける（`CLAUDE.md` §1）
//     ⚠ 控えに、⚠ こちらへ送る仕掛けが無い

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { join } from "node:path";
import { ROOT, ok, bad, head } from "./lib.mjs";

head("保存した場所");

const NEXT = join(ROOT, "public-next");
const src = readFileSync(join(NEXT, "saved.js"), "utf8");

// ⚠ **実際に動かす。**⚠ **classic script なので、⚠ 別の器を作って評価する。**
//   ⚠ **`new Function` だと、⚠ 中の `globalThis` が検査自身の器を指す**（⚠ 実際に踏んだ）。
// ⚠ **器に、⚠ ブラウザにも Node にも在るものだけを渡す。**
//   ⚠ **`saved.js` が使ってよいのは、⚠ ここに書いたものだけ**という宣言でもある。
//   ⚠ **DOM も `localStorage` も渡さない。**⚠ 渡すと、⚠ 依っていても気づけない。
const 器 = createContext({
  TextEncoder, TextDecoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
});
runInContext(src, 器);
const S = 器.KonjakuSaved;

{
  // ---- ⚠ ① 同じ場所を二重に持たない ----
  // ⚠ **地図の中心は指で少し動く。**⚠ **厳密一致では、⚠ 同じ交差点が何件も溜まる。**
  const 豊洲 = { lon: 139.7967, lat: 35.6553, at: 1 };
  const すぐ隣 = { lon: 139.7968, lat: 35.6553, at: 2 };   // ⚠ 約 9m
  const 浦安 = { lon: 139.9020, lat: 35.6540, at: 3 };
  let l = S.add(S.add([], 豊洲), すぐ隣);
  const 二重 = l.length;
  l = S.add(l, 浦安);
  const 別 = l.length;
  const 先頭 = l[0] === 浦安;
  const 隣は同じ = !!S.findAt([豊洲], すぐ隣.lon, すぐ隣.lat);
  const 遠いは別 = !S.findAt([豊洲], 浦安.lon, 浦安.lat);
  二重 === 1 && 別 === 2 && 先頭 && 隣は同じ && 遠いは別
    ? ok(`同じ場所は二重に持たない（⚠ 約 9m 離れた点は同じ ／ ⚠ ${Math.round(S.distanceM(139.7967, 35.6553, 139.9020, 35.6540))}m は別 ／ ⚠ 新しいものが先頭）`)
    : bad(`保存の控えが、⚠ 同じ場所を二重に持つか、⚠ 並びが違う（二重=${二重} 別=${別} 先頭=${先頭} 隣=${隣は同じ} 遠い=${遠いは別}）`);
}

{
  // ---- ⚠ ② 「読めなかった」と「1 件も無い」を分ける ----
  // ⚠ **混ぜると、⚠ 保存したのに消えたのか、⚠ まだ保存していないのかが分からなくなる。**
  const 空 = S.load({ getItem: () => null });
  const 壊れ = S.load({ getItem: () => "{" });
  const 配列でない = S.load({ getItem: () => '{"a":1}' });
  const 座標なし = S.load({ getItem: () => '[{"name":"x"},{"lon":139,"lat":35}]' });
  空.ok && 空.list.length === 0
    && !壊れ.ok && !配列でない.ok
    && 座標なし.ok && 座標なし.list.length === 1
    ? ok("保存の控えは、⚠ 「読めなかった」と「1 件も無い」を分ける（⚠ 座標の無い記録は捨てる）")
    : bad(`保存の控えが、⚠ 読めなかったことと 1 件も無いことを混ぜている（空=${空.ok}/${空.list.length} 壊れ=${壊れ.ok} 配列でない=${配列でない.ok} 座標なし=${座標なし.ok}/${座標なし.list.length}）`);
}

{
  // ---- ⚠ ③ 置き場に書けなかったら、⚠ 失敗を返す ----
  // ⚠ **握りつぶすと、⚠ 保存できていないのに「保存ずみ」と出る。**
  const 書けた = S.save({ setItem: () => {} }, []);
  const 書けない = S.save({ setItem: () => { throw new Error("満杯"); } }, []);
  書けた === true && 書けない === false
    ? ok("保存の控えは、⚠ 置き場に書けなかったことを握りつぶさない")
    : bad(`保存の控えが、⚠ 書き込みの失敗を握りつぶしている（書けた=${書けた} 書けない=${書けない}）`);
}

{
  // ---- ⚠ ④ 控えを、⚠ こちらへ送らない ----
  // ⚠ **このサービスは「地名も座標も送らない」を設計にしている**（`worker.js`）。
  //   ⚠ **保存の控えは、⚠ 地名と座標そのもの。**⚠ **送る仕掛けを持たせない。**
  const 送る = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.connection/;
  送る.test(src)
    ? bad("保存の控えに、⚠ 外へ送る仕掛けが入っている（⚠ 地名と座標そのものなので、⚠ 送らない）")
    : ok("保存の控えは、⚠ 外へ送る仕掛けを持たない（⚠ 端末の中だけ）");
}

{
  // ---- ⚠ ⑤ 市区町村の表 ----
  // ⚠ **町名だけでは、⚠ どこの町か分からない**（⚠ 利用者役 3 名中 1 名: 「猫実」が浦安だと分からない）。
  // ⚠ **市区町村名だけでも足りない。**⚠ **1,919 件のうち 27 件が重なる**（⚠ 府中市・伊達市 ほか）。
  //   ⚠ **重なるものにだけ都道府県を足す**（⚠ 判定は `scripts/build-muni.mjs` の事前処理）。
  //
  // ⚠ **ここで見るのは、⚠ 表そのものの主張が守られているか。**
  //   ⚠ **件数は書かない**（⚠ 走者が名乗る。`CLAUDE.md` §6）。⚠ **表から数える。**
  let t = null;
  try { t = JSON.parse(readFileSync(join(NEXT, "data", "muni.json"), "utf8")); } catch { /* 下で落とす */ }
  if (!t?.muni) {
    bad("市区町村の表が無いか、読めない（⚠ `node scripts/build-muni.mjs` で作る）");
  } else {
    const 名 = Object.values(t.muni);
    const 数 = new Map();
    for (const v of 名) 数.set(v, (数.get(v) ?? 0) + 1);
    const 重なり = [...数].filter(([, n]) => n > 1).map(([k]) => k).sort();
    const 申告 = [...(t.unresolved ?? [])].sort();
    // ⚠ **残っている重なりを、⚠ 表が自分で申告しているか。**⚠ **黙って持たない。**
    const 一致 = 重なり.length === 申告.length && 重なり.every((v, i) => v === 申告[i]);
    一致
      ? ok(`市区町村の表は、⚠ 残っている同名を自分で申告している（⚠ ${名.length} 件中 ${重なり.length} 件 ／ ⚠ ${重なり.join("・") || "無し"}）`)
      : bad(`市区町村の表の同名が、⚠ 申告と合っていない（⚠ 実際 ${重なり.join("・") || "無し"} ／ ⚠ 申告 ${申告.join("・") || "無し"}）`);

    // ⚠ **出典が無い表を配らない**（⚠ 確かめようがない）
    t.source?.url && t.source?.name && t.source?.retrieved_at
      ? ok(`市区町村の表は、⚠ 出典と取得日を名乗る（${t.source.name} ／ ${t.source.retrieved_at}）`)
      : bad("市区町村の表に、⚠ 出典か取得日が無い（⚠ どこから来た表か確かめられない）");
  }
}

{
  // ---- ⚠ ⑥ 別の端末へ手渡す ----
  // ⚠ **サーバに置かない**（`docs/adr/0048` の 3）。⚠ **URL に載せて渡す。**
  // ⚠ **`saved.js` は DOM も圧縮も持たない。**⚠ **圧縮は渡してもらう**
  //   （⚠ ブラウザは `CompressionStream`、⚠ ここは `node:zlib`）。
  //   ⚠ **持たせると、⚠ 検査がブラウザ抜きで回せなくなる。**
  const { gzipSync, gunzipSync } = await import("node:zlib");
  const gz = (t) => gzipSync(Buffer.from(t, "utf8"), { level: 9 }).toString("base64url");
  const ungz = (t) => gunzipSync(Buffer.from(t, "base64url")).toString("utf8");
  // ⚠ **座標は、⚠ 細かい桁まで入れる。**⚠ **キリのよい値だと、⚠ 桁を落としても気づけない**
  //   （⚠ 実際に踏んだ: ⚠ 0.01 刻みだと 2 桁に丸めても同じ値になり、⚠ 素通りした）。
  //   ⚠ **桁は 50m の判定（`SAME_M`）に効く。**⚠ **2 桁だとおよそ 1km で、⚠ 別の場所が同じになる。**
  const 作る = (n) => Array.from({ length: n }, (_, i) => ({
    lat: 35.65531 + i * 0.01234, lon: 139.79672 + i * 0.01234,
    name: "東京都江東区豊洲三丁目", value: "旧水部", at: 1756400000000 + i * 86400000 }));

  const 生 = await S.toText(作る(50), null);
  const 圧 = await S.toText(作る(50), gz);
  const 戻し生 = await S.fromText(生, null);
  const 戻し圧 = await S.fromText(圧, ungz);
  // ⚠ **件数だけを見ない。**⚠ **中身も戻っているかを見る**
  //   （⚠ 実際に踏んだ: ⚠ **名前を捨てても件数は 50 のままで、⚠ 素通りした**）。
  //   ⚠ **座標は 5 桁で丸めて渡している**（⚠ おおよそ 1m）ので、⚠ **こちらも丸めて比べる。**
  const 元 = 作る(50);
  const 欠けていない = (戻り) => Array.isArray(戻り) && 戻り.length === 元.length &&
    元.every((r, i) => {
      const b = 戻り[i];
      return b && Number(r.lat.toFixed(5)) === b.lat && Number(r.lon.toFixed(5)) === b.lon &&
             r.name === b.name && r.value === b.value && r.at === b.at;
    });
  欠けていない(戻し生) && 欠けていない(戻し圧) && 圧.length < 生.length
    ? ok(`保存した場所は、⚠ 名前も年代も欠けずに URL で渡して戻せる（⚠ 50 件で 生 ${生.length} 文字 → 圧縮 ${圧.length} 文字）`)
    : bad(`保存した場所が、⚠ URL から欠けずに戻らない（生 ${JSON.stringify(戻し生?.[0])} / 圧縮 ${JSON.stringify(戻し圧?.[0])}）`);

  // ⚠ **知らない版を、⚠ 黙って空にしない**（⚠ 「0 件だった」と読ませない）
  const 知らない = await S.fromText("9abc", ungz);
  const 壊れ = await S.fromText("1***", ungz);
  知らない === null && 壊れ === null
    ? ok("手渡しの字が読めないときは、⚠ 空ではなく「読めない」を返す")
    : bad(`読めない字を、⚠ 空として返している（知らない版 ${JSON.stringify(知らない)} / 壊れ ${JSON.stringify(壊れ)}）`);

  // ⚠ **混ぜるのは足すだけ。**⚠ **消さない。**⚠ **先に見つけたほうを残す。**
  const いま = [{ lat: 35, lon: 139, name: null, value: "旧水部", at: 200 }];
  const 来た = [{ lat: 35.0001, lon: 139.0001, name: "豊洲", value: "旧水部", at: 100 },
                { lat: 36, lon: 140, name: "別", value: "低地", at: 300 }];
  const m = S.merge(いま, 来た);
  const 同じ = m.list.find((r) => Math.abs(r.lat - 35) < 0.001);
  m.list.length === 2 && m.足した === 1 && m.重なった === 1
    && 同じ.at === 100 && 同じ.name === "豊洲"
    ? ok("手渡しを混ぜると、⚠ 足すだけで消さない（⚠ 先に見つけた時刻を残し、⚠ 名前は在るほうを採る）")
    : bad(`手渡しの混ぜ方が違う（${m.list.length} 件・足した ${m.足した}・重なった ${m.重なった}・at ${同じ?.at}・name ${同じ?.name}）`);

  // ⚠ **座標が無いものは渡さない**（⚠ 戻れない記録を混ぜない）
  const 座標なし = await S.fromText(await S.toText(
    [{ lat: NaN, lon: 139, name: "x", value: "y", at: 1 }, ...作る(1)], null), null);
  座標なし?.length === 1
    ? ok("手渡しは、⚠ 座標の無い記録を渡さない")
    : bad(`座標の無い記録を渡している（${座標なし?.length} 件）`);
}
