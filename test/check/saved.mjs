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
const 器 = createContext({});
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
