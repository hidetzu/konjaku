// 静的検査 — 場所の決め方（⚠ **誰が場所を決め、⚠ 誰がそれを読み書きするか**）
//
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-24。hidetzu/konjaku#232 の 16 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **なぜこの 2 節をひとまとめにしたか**:
//   ⚠ **どちらも「場所を、⚠ 誰が持つか」を守っている。**
//
//     探す口      ⚠ **場所を決めるのはトップ**（`/peel` は深掘りする画面。`domain.md`）
//     指定の読み書き ⚠ **URL の形を読むのも書くのも `place-arg.js` の 1 か所**
//
// ⚠ **元の節番号は `3.7` と `2.8` で、⚠ 離れていた**（⚠ `2.8` は `6` のあとにあった）。
//   ⚠ **番号は「いつ足したか」しか表していなかった。**
//
// ⚠ **`land.mjs`（土地の区分）とは別。**⚠ あちらは ⚠ **その場所が何でできているか。**
//   ⚠ こちらは ⚠ **どの場所を見ているか。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { join } from "node:path";
import { PUB, ok, bad, head, src, TOP, BLOCK_COMMENT, HTML_COMMENT, LINE_COMMENT } from "./lib.mjs";

head("場所の決め方");

// ⚠ **場所を探す口は 1 つ**（2026-08-18 方針）。
//   `/peel` は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
//   ⚠ ここに検索が生えると、2 つが同時に壊れる:
//     1) トップは **3D の下地がある場所にだけ**導線を出しているのに、
//        あちらの検索からは**下地の無い場所へ入れてしまう**（地図は動くのに建物が出ない）
//     2) 検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
//        （実際に破れていた: 2026-08-14 まで /peel だけ古い実装で、
//         取れなかったときに「見つかりませんでした」と書いていた）
//   ⚠ **並びを突き合わせる検査を、これで置き換えている。**
//     以前は「同じ応答ならトップと 3D の候補が一致する」で 2 実装のずれを見ていた。
//     実装が 1 つになったので、**2 つ目が生えないこと**を見るほうが強い。
{
  const strip = (s) => (s ?? "").replace(BLOCK_COMMENT, " ")
    .replace(LINE_COMMENT, "$1").replace(HTML_COMMENT, " ");
  const ph = strip(src["peel.html"]), pj = strip(src["peel3d.js"]);
  const ui = [['id="q"', "検索欄"], ['id="cands"', "候補の置き場"],
              ['id="quick"', "クイック地点"], ['id="here"', "現在地"],
              ["findBox", "「別の場所を見る」の枠"]].filter(([k]) => ph.includes(k));
  const impl = [["KonjakuPlaces", "places.js の検索"], ["AddressSearch", "住所検索を直に叩いている"],
                ["createSearch", "検索の入れ物"]].filter(([k]) => pj.includes(k));
  const loads = ph.includes('src="./places.js"');
  if (ui.length) bad(`peel.html に場所を探す口が残っている: ${ui.map(([, w]) => w).join("・")}`);
  else if (impl.length) bad(`peel3d.js に検索の実装が残っている: ${impl.map(([, w]) => w).join("・")}`);
  else if (loads) bad("peel.html が places.js を読み込んでいる（この画面に使う相手がいない）");
  else ok("/peel に場所を探す口が無い（場所を決めるのはトップ）");
  // ⚠ 「1 つ」なので、**トップ側は必ず持っている**こと。両方消えたら探せなくなる
  if (strip(TOP).includes("KonjakuPlaces")) ok("トップが places.js の検索を使っている");
  else bad("トップにも検索が無い（場所を探す手段が 1 つも無い）");
}
// ============================================================
// 場所の指定の読み書きは 1 か所（public/place-arg.js）
// ============================================================
// ⚠ **hidetzu/konjaku#221。**⚠ `/peel` とトップが、⚠ **同じ答えから引く。**
//   ⚠ **2 か所に形の判定を持つと、⚠ 「深掘りできる」と「戻す」の判断がずれる。**
{
  const fails = [];
  const yes = (c, what) => { if (!c) fails.push(what); };
  await import(`file://${join(PUB, "place-arg.js")}`);
  const P = globalThis.KonjakuPlaceArg;
  yes(P?.readPlace, "place-arg.js が readPlace を出していない（この検査が何も見ていない）");
  if (P?.readPlace) {
    const r = (q) => P.readPlace(new URLSearchParams(q));
    // ⚠ **3 つを分ける**（⚠ 混ぜると、⚠ 何も指定していない人に「読み取れなかった」と言う）
    yes(r("ll=35.65,139.79").state === "ok", "読める座標を ok にしていない");
    yes(r("q=名古屋").state === "none", "座標の指定が無いのを none にしていない");
    yes(r("").state === "none", "引数なしを none にしていない");
    yes(r("ll=").state === "none", "空の ll を none にしていない（指定が無いのと同じ）");
    yes(r("ll=abc").state === "bad", "読めない座標を bad にしていない");
    // ⚠ **形は通るが数にならないもの**（⚠ 緩いと、⚠ 地図が別の場所を出す）
    yes(r("ll=1e999,0").state === "bad", "数にならない座標を bad にしていない");
    yes(r("ll=999,0").state === "bad", "地球の外の緯度を bad にしていない");
    yes(r("ll=0,999").state === "bad", "地球の外の経度を bad にしていない");
    // ⚠ **q を落とさない**（⚠ 落とすと、⚠ 利用者が入れた地名まで消える）
    yes(r("q=名古屋").q === "名古屋", "座標が無いときに q を落としている");
  }
  if (P?.topUrlFor) {
    const u = (q, st) => P.topUrlFor(new URLSearchParams(q), st);
    // ⚠ **何も指定が無ければ黙る**（Owner 判断 2026-08-23）
    yes(u("", "none") === "./", `引数なしで断っている: ${u("", "none")}`);
    // ⚠ **指定があれば言う**
    yes(/noplace=none/.test(u("q=x", "none")), "q だけのときに理由を渡していない");
    yes(/noplace=bad/.test(u("ll=abc", "bad")), "壊れた ll のときに理由を渡していない");
    // ⚠ **era を捨てない**（⚠ Issue の AC 2: ⚠ 黙って別の年代に差し替わらない）
    yes(/era=swale/.test(u("q=x&era=swale", "none")), "era を黙って捨てている");
    // ⚠ **b（建物）は持って行かない**（⚠ トップに建物を選ぶ画面が無い。ADR 0026）
    yes(!/[?&]b=/.test(u("q=x&b=1,2", "none")), `建物の鍵をトップへ持って行っている: ${u("q=x&b=1,2", "none")}`);
  } else fails.push("place-arg.js が topUrlFor を出していない");

  // ⚠ **URL を組むのも 1 か所**（2026-08-23）。⚠ **読む側と対で見る。**
  //   ⚠ 実測: ⚠ 組み立てが **4 か所**にあった（トップ 3・`/peel` 1）。
  if (P?.placeQuery) {
    const Q = P.placeQuery;
    const a = { title: "東京都江東区豊洲", lat: 35.6548, lon: 139.7975 };
    // ⚠ **往復で見る。**⚠ **書いたものが、⚠ そのまま読み戻せること。**
    //   ⚠ 片方だけ直すと、⚠ **自分で書いた URL を、⚠ 自分で読めなくなる。**
    const back = P.readPlace(new URLSearchParams(Q(a)));
    yes(back.state === "ok", `書いた URL を読み戻せない: ${Q(a)}`);
    yes(back.q === a.title, `往復で地名が変わった: ${back.q}`);
    yes(Math.abs(back.lat - a.lat) < 1e-5 && Math.abs(back.lon - a.lon) < 1e-5,
      `往復で座標が変わった: ${back.lat},${back.lon}`);
    // ⚠ **並びは lat,lon**（⚠ 逆にすると、⚠ 黙って別の場所になる）
    yes(new URLSearchParams(Q(a)).get("ll").startsWith("35."),
      `ll の並びが lat,lon ではない: ${new URLSearchParams(Q(a)).get("ll")}`);
    // ⚠ **年代と建物は、⚠ 渡したときだけ載る**（⚠ 勝手に足さない・勝手に落とさない）
    yes(!/[?&]era=/.test(Q(a)), `年代を渡していないのに era が載っている: ${Q(a)}`);
    yes(/[?&]era=swale/.test(Q({ ...a, era: "swale" })), "era を渡しても載っていない");
    yes(!/[?&]b=/.test(Q(a)), `建物を渡していないのに b が載っている: ${Q(a)}`);
    yes(/[?&]b=/.test(Q({ ...a, bld: "1,2" })), "建物を渡しても載っていない");
    // ⚠ **座標が読めないときは組まない**（⚠ NaN を載せた URL を共有させない）
    yes(Q({ title: "x" }) === null, "座標が無いのに URL を組んでいる");
    yes(Q({ title: "x", lat: 999, lon: 0 }) === null, "地球の外なのに URL を組んでいる");
    // ⚠ **読む側が `bad` と言う値では、⚠ 書く側も組まないこと。**
    //   ⚠ **判定を 2 つ持つと、⚠ 書けるのに読めない URL が作れる。**
    for (const ll of ["999,0", "0,999", "abc"]) {
      const [la, lo] = ll.split(",").map(Number);
      yes(P.readPlace({ ll }).state === "bad" && Q({ title: "x", lat: la, lon: lo }) === null,
        `読む側と書く側で判定が食い違う: ${ll}`);
    }
  } else fails.push("place-arg.js が placeQuery を出していない");

  // ⚠ **形も組み立ても、⚠ どの画面も持ち直していないこと**（⚠ 2 か所になると必ずずれる）。
  //   ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 説明の字面を自分で拾う）。
  //   ⚠ **`https://` の `//` は残す**（⚠ 落とすと行末まで消えて、⚠ 見張りが素通りする）。
  const bare = (f) => src[f]
    .replace(HTML_COMMENT, " ")
    .replace(LINE_COMMENT, "$1")
    .replace(BLOCK_COMMENT, " ");
  const pj = bare("peel3d.js");
  // ⚠ **トップも見る**（2026-08-23）。⚠ **以前は `/peel` しか見ておらず、
  //   ⚠ `index.html` が同じ正規表現を直書きしていたのを素通りさせていた。**
  // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
  //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
  for (const f of ["top.js", "peel3d.js"]) {
    const b = bare(f);
    const shape = (b.match(/\^-\?\[\\d\.\]\+,-\?\[\\d\.\]\+\$/g) ?? []).length;
    yes(shape === 0, `${f} が座標の形を持ち直している（${shape} か所）。place-arg.js が正本`);
    // ⚠ **組み立ての印**（⚠ `&ll=` を差し込んでいたら、⚠ そこで URL を作っている）
    const built = (b.match(/&ll=\$\{/g) ?? []).length;
    yes(built === 0, `${f} が URL を組み直している（${built} か所）。place-arg.js が正本`);
    // ⚠ **座標の桁**（⚠ `land.js` の控えの鍵は別の問いなので、⚠ ここでは見ない）
    const dig = (b.match(/toFixed\(5\)/g) ?? []).length;
    yes(dig === 0, `${f} が座標の桁を持ち直している（${dig} か所）。place-arg.js の DIGITS が正本`);
  }
  // ⚠ **既定の座標へ黙って落ちる道が残っていないこと**（⚠ これが元の不具合）
  yes(!/loadArea\(139\.7975,\s*35\.6548/.test(pj),
    "peel3d.js に、既定の豊洲へ黙って落ちる道が残っている（hidetzu/konjaku#221 の不具合そのもの）");

  // ⚠ **断りの字が、⚠ 検索欄と同じ語を別の意味で使っていないこと**（2026-08-23）。
  //   ⚠ **検索欄は「地名・住所を入力」。**⚠ 断りで「共有された住所」と書くと、
  //     ⚠ **同じ画面で「住所」が URL と 街の住所 の 2 つを指す。**
  await import(`file://${join(PUB, "words.js")}`);
  const np = globalThis.KonjakuWords?.noPlace ?? {};
  yes(np.none && np.bad, "words.js に noPlace（指定なし／読めない）が無い");
  for (const [k, t] of Object.entries(np)) {
    yes(!/住所/.test(t), `noPlace.${k} が「住所」を使っている（検索欄と意味が食い違う）: ${t}`);
    yes(!/⚠/.test(t), `noPlace.${k} が ⚠ を使っている（災害リスク専用）: ${t}`);
    yes(!/存在しません/.test(t), `noPlace.${k} が「存在しません」と言っている: ${t}`);
    // ⚠ **できないことから書き始めない**（CLAUDE.md §4-1）。⚠ 先に何ができるか
    yes(/^場所を選ぶと/.test(t), `noPlace.${k} が、できることから始まっていない: ${t}`);
  }
  // ⚠ **2 つを取り違えていないこと**（⚠ 何も指定していない人に「読み取れない」と言わない）
  yes(np.none && !/読み取れ/.test(np.none),
    `指定が無いときに「読み取れません」と言っている: ${np.none}`);
  yes(np.bad && /読み取れ/.test(np.bad),
    `読めなかったときに、読めなかったと言っていない: ${np.bad}`);

  if (fails.length) bad(`場所の指定の読み方（${fails.length} 件）: ${fails.join(" / ")}`);
  else ok("場所の指定は place-arg.js の 1 か所（読み: ok/指定なし/読めない ／ 書き: 往復・年代と建物は任意・地球の外は組まない）");
}
