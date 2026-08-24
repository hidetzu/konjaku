// 静的検査 — 取得と表示を分ける（⚠ **画面が、⚠ Domain を持っていないか**）
//
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 21 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **`.claude/rules/javascript.md` の「責務」を、⚠ 機械で見ている部分**:
//
//     取得  →  Domain へ変換  →  表示用へ変換  →  描く
//
// ⚠ **ここが守っているもの**（⚠ どれも「⚠ **画面は置くだけ**」を確かめている）:
//     写真          ⚠ 状態（`photos.js`）→ 字（`words.js`）→ 置くだけ（画面）
//     土地情報      ⚠ 取得（`verify.js`）→ 控える（`land.js`）→ 置くだけ（画面）
//     明治期の面    ⚠ 取得（`verify.js` swaleArea）→ 控える（`land.js` meijiArea）→ 矩形化だけ
//
// ⚠ **`words.mjs`（言葉は 1 か所から）とは別。**⚠ あちらは ⚠ **その字を誰が持っているか。**
//   ⚠ こちらは ⚠ **取ってくる仕事と、⚠ 見せる仕事が、⚠ 別の持ち主か。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUB, ok, bad, head, src, seen, stripJs, BLOCK_COMMENT, HTML_COMMENT, HEAD_COMMENT, LINE_COMMENT } from "./lib.mjs";

head("取得と表示を分ける");

// ⚠ **写真の状態と、画面を分断したままにする**（2026-08-20・hidetzu/konjaku#116）。
//   ⚠ **層は 3 つ。**⚠ **越えたら止める。**
//     photos.js  … ⚠ **状態を決める。**⚠ **文字列を 1 つも持たない**
//     words.js   … ⚠ **字を決める。**⚠ **状態の作り方を知らない**
//     画面        … ⚠ **置くだけ。**⚠ **何も判断しない**
//   ⚠ **相手先の振る舞いが変わっても、直すのは photos.js の 1 か所。**
//   ⚠ 実際に踏んだ: 「何の写真か」を 2 画面が別々に組み立てていた。
{
  const bad2 = [];
  // ⚠ **コメントを先に落とす。**⚠ 落とさないと、⚠ **何を直したかの説明を拾う**（CLAUDE.md §5）
  const ph = stripJs(await readFile(join(PUB, "photos.js"), "utf8"), "photos.js");
  // ⚠ **取得の層に、画面へ出す字を書かない。**
  //   ⚠ 「通信できません」などの理由は、⚠ **places.js と揃える約束**なのでここが持つ。
  //   ⚠ **それ以外の、利用者へ向けた文を書かない。**
  for (const w of ["まだ出ていません", "読み込めませんでした", "接続を確認", "インターネット"])
    if (ph.includes(w)) bad2.push(`photos.js が画面の字を持っている（「${w}」）`);
  // ⚠ **画面が「何の写真か」を組み立てない。**⚠ 組み立てると、判断が画面ごとに増える
  // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
  //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
  for (const f of ["top.js", "peel3d.js"]) {
    const bare = (src[f] ?? "").replace(HTML_COMMENT, " ")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
    // ⚠ **写真の状態の文脈だけを見る。**⚠ 「明治期の地面と見くらべる」は深掘りの案内で、
    //   ⚠ **別の文**（それまで拾うと、直しようのない誤検出になる）。
    for (const w of ["いまの街の写真", "この年代の写真は", "明治期の地面は"])
      if (bare.includes(w)) bad2.push(`${f} が「何の写真か」を組み立てている（「${w}」）`);
    // ⚠ **画面が接続の話を自分で決めない**（photoSay が返したものを置くだけ）
    if (/navigator\.onLine\s*===?\s*false/.test(bare))
      bad2.push(`${f} が接続の話を自分で判断している（状態に持たせる）`);
  }
  bad2.length
    ? bad(`写真の状態と画面が分断できていない: ${bad2.join("、")}`)
    : ok("写真は「状態（photos.js）→ 字（words.js）→ 置くだけ（画面）」に分かれている");
}

// ⚠ **取得の層を、画面が直接呼ばない**（hidetzu/konjaku#121）。
//
//   verify.js   外から取ってくる。⚠ **控えることを知らない**
//   land.js     取得済みを控える、ただ1か所。⚠ **画面はここだけを見る**
//   画面        置くだけ
//
//   ⚠ **なぜ要るか（実測 2026-08-20・main = d410455・豊洲・375x667・SW 無効）**:
//     トップで地形分類を 2 本取ったあと、/peel が同じ座標で **もう 2 本**取っていた。
//     ⚠ 画面が別々に取得の層を呼んでいたので、片方が取ったことをもう片方が知らなかった。
//   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
{
  const bad3 = [];
  // ⚠ **画面が呼んではいけない口。**⚠ land.js だけが呼ぶ
  const DIRECT = ["landform", "meiji", "elevation", "photos", "facts"];
  for (const f of ["index.html", "peel3d.js"])
    for (const m of DIRECT)
      if (new RegExp("Konjaku\\." + m + "\\s*\\(").test(seen[f] ?? ""))
        bad3.push(`${f} が取得の層を直接呼んでいる（Konjaku.${m}）`);
  // ⚠ **land.js に画面の字を書かない**（控える層は、何と表示するかを知らない）
  const LD = seen["land.js"] ?? "";
  if (!LD) bad3.push("land.js を読めていない（この検査が何も見ていない）");
  for (const w of ["記録なし", "判定できません", "読み込めませんでした", "ありません"])
    if (LD.includes(w)) bad3.push(`land.js が画面の字を持っている（「${w}」）`);
  // ⚠ **land.js が取り方を知らない。**タイルの URL を組み立てたら、取得の層と二重になる
  for (const w of ["gsi.go.jp", "fetch(", "loadImage"])
    if (LD.includes(w)) bad3.push(`land.js が取り方を持っている（「${w}」）`);
  // ⚠ **両画面が land.js を読んでいる。**読み忘れると、その画面だけ落ちる
  for (const f of ["index.html", "peel.html"])
    if (!/src="\.\/land\.js"/.test(src[f] ?? "")) bad3.push(`${f} が land.js を読んでいない`);
  // ⚠ **Service Worker の SHELL に入っている**（words.js と同じ性質。来ないと両画面が落ちる）
  if (!/"\/land\.js"/.test(src["sw.js"] ?? "")) bad3.push("sw.js の SHELL に land.js が無い");
  // ⚠ **「取れなかった」の印を、2 か所が見ている。**
  //   verify.js は「再試行を出すか」を、land.js は「控えてよいか」を、⚠ **同じ印で**決める。
  //   ⚠ **違う問いなので実装は 1 つにできない。**⚠ **だから機械で突き合わせる**（掟）。
  //   ⚠ 片方の印だけ名前が変わると、⚠ **取れなかった回を控えてしまい、
  //     その土地が「取れない土地」として固まる。**⚠ 画面は静かに嘘をつく。
  {
    // ⚠ **ファイル全体で探さない。**⚠ 同じ語は別の用途でも出てくるので、
    //   ⚠ **verify.js が「読めなかった」を数えている行そのもの**を取り出して見る
    //   （2026-08-20 に踏んだ: 全体で探していたら、この行を書き換えても緑だった）。
    const VJ = seen["verify.js"] ?? "";
    const unreadLine = (VJ.match(/unread:\s*list\.filter\([^\n]*\)/) ?? [""])[0];
    if (!unreadLine)
      bad3.push("verify.js の unread を数えている行が見つからない（この検査が何も見ていない）");
    // その行が、この 3 つで「読めなかった」を判断している
    const MARKS = [["UNREACHABLE", "取れなかった"], ['"partial"', "一部だけ読めた"],
                   ["artificialUnread", "人工地形だけ落ちた"]];
    for (const [w, why] of MARKS)
      if (unreadLine && !unreadLine.includes(w))
        bad3.push(`verify.js の unread が「${why}」を見なくなった（${w}）`
          + `。land.js の keepable も直す`);
    // land.js が、その 3 つを全部見ているか
    for (const [w, why] of MARKS)
      if (!LD.includes(w))
        bad3.push(`land.js が「${why}」を見ていない（${w}）。控えると固まる`);
  }
  bad3.length
    ? bad(`土地情報の取得と画面が分断できていない: ${bad3.join("、")}`)
    : ok("土地情報は「取得（verify.js）→ 控える（land.js）→ 置くだけ（画面）」に分かれている");
}

// ⚠ **明治期の「面」も、取得の層が持つ**（hidetzu/konjaku#126）。
//
//   ⚠ **2026-08-20 まで、⚠ peel3d.js の中に 74 行あった**
//     （tileCache / getTile / readTile / buildWater）。⚠ その中身は
//     ⚠ **タイル URL の組み立て・複数枚の取得・canvas の画素読み・分類・集計・
//       失敗の数え方・キャッシュ**で、⚠ **全部が取得の層の仕事だった。**
//   ⚠ **3 つめのキャッシュでもあった**（land.js の inflight／verify.js の imgCache と別）。
//
//   ⚠ **線の引き方**（Owner 判断＝案B。⚠ **矩形化は画面に残す**）
//     verify.js   swaleArea(bbox) … mask ＋ 集計。⚠ **GeoJSON は作らない**
//     land.js     meijiArea(bounds) … 呼んで控える。⚠ **取り方は知らない**
//     peel3d.js   mask → 矩形 → GeoJSON → MapLibre。⚠ **水かどうかは判定しない**
//
//   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
{
  const bad5 = [];
  const VJ = seen["verify.js"] ?? "", LD = seen["land.js"] ?? "", PJ = seen["peel3d.js"] ?? "";
  if (!VJ || !LD || !PJ) bad5.push("読めていないファイルがある（この検査が何も見ていない）");

  // ⚠ **取得の層が持っていること。**⚠ **名前の境界まで見る**（2026-08-20 に直した）。
  //   ⚠ includes だけだと、⚠ **`swaleAreaX` に改名しても `swaleArea` を含むので通る**
  //     （実際にわざと壊したら落ちなかった）。
  for (const w of ["swaleArea", "swalePixel"])
    if (!new RegExp("function\\s+" + w + "\\s*\\(").test(VJ))
      bad5.push(`verify.js が function ${w}() を持っていない`);
  if (!/\bswaleTiles\b/.test(VJ)) bad5.push("verify.js が swaleTiles（面と点で共有するタイル束）を持っていない");
  // ⚠ **公開していること。**⚠ 定義があっても配っていなければ画面から呼べない
  for (const w of ["swaleArea", "swalePixel"])
    if (!new RegExp("\\b" + w + "\\b(?![\\w(])").test(VJ.split("global.Konjaku")[1] ?? ""))
      bad5.push(`verify.js が ${w} を配っていない（Konjaku から呼べない）`);
  // ⚠ **画面が持っていないこと。**⚠ 戻ってきたら落とす
  for (const w of ["const tileCache", "function getTile", "function readTile"])
    if (PJ.includes(w)) bad5.push(`peel3d.js に ${w} が戻っている（取得の層の仕事）`);
  // ⚠ **画面がタイル URL を組み立てないこと**（swale に限らず）
  if (/\$\{GSI\}\/swale\//.test(PJ))
    bad5.push("peel3d.js が明治期タイルの URL を組み立てている");
  // ⚠ **画面が「水かどうか」を決めないこと。**⚠ 水の定義は swale.js の isWater ただ 1 つ。
  //   ⚠ **「決める」と「答えを読む」は別**（2026-08-20 に検査を書き直した）。
  //     ⚠ 最初は `.water` を数えて落としていたが、⚠ **2 件とも誤検出**だった:
  //       peel3d.js:791  s.water … ⚠ **取得の層が出した答えを写しているだけ**
  //       peel3d.js:1156 r.water … ⚠ **色見本の色を選んでいるだけ**（見せ方）
  //     ⚠ **決めているかどうかは、画素から起こしているかで見る。**
  if (/\bclassify\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を分類している（水の定義が 2 か所になる）");
  if (/getImageData\s*\(/.test(PJ)) bad5.push("peel3d.js が画素を読んでいる（取得の層の仕事）");
  // ⚠ **水の面（mask）を画面で組み立てないこと**（swaleArea が返したものを使う）
  if (/mask\s*\[[^\]]*\]\s*=/.test(PJ)) bad5.push("peel3d.js が水の面を組み立てている");
  // ⚠ **控える層が GeoJSON を作らないこと**（案B の線）
  for (const w of ['"Feature"', '"Polygon"', "FeatureCollection"])
    if (LD.includes(w)) bad5.push(`land.js が GeoJSON を作っている（${w}）。描き方は画面が持つ`);
  if (VJ.includes("FeatureCollection"))
    bad5.push("verify.js が GeoJSON を作っている。描き方は画面が持つ");
  // ⚠ **mask を控えないこと**（豊洲 1.25MB。sessionStorage 約 5MB を 2 地点で埋める）
  if (/write\([^)]*mask/.test(LD)) bad5.push("land.js が mask を控えている（1.25MB。保存が埋まる）");
  if (!LD.includes("areaSummary")) bad5.push("land.js が、控える中身を絞っていない（areaSummary が無い）");
  // ⚠ **点と面が別の入口・別のキー**（ADR 0030）
  for (const w of ["meijiPoint", "meijiArea", "areaKey"])
    if (!LD.includes(w)) bad5.push(`land.js に ${w} が無い（点と面を分けていない）`);
  // ⚠ **画面が取得の層の面を直接呼ばないこと**（控える層を通す）
  if (/Konjaku\.swaleArea\s*\(/.test(PJ))
    bad5.push("peel3d.js が取得の層の面を直接呼んでいる（land.js を通す）");
  bad5.length
    ? bad(`明治期の「面」が、取得と画面に分かれていない: ${bad5.join("、")}`)
    : ok("明治期の面は「取得（verify.js swaleArea）→ 控える（land.js meijiArea）→ "
       + "矩形化だけ（peel3d.js）」に分かれている");
}

// ============================================================
// ⚠ 3D の下地があるかの判定を、⚠ 画面が持っていないか
// ============================================================
// ⚠ **`test/check.mjs` から逐語で移しただけ**（2026-08-25。hidetzu/konjaku#232 の 26 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **元の見出し（`head()`）は落とした**（⚠ 行き先の見出しの下に入る）。
// ⚠ **ここが「取得と表示を分ける」の仲間である理由**: ⚠ **画面が判断を持たない。**
//   ⚠ トップと `/peel` が、⚠ **同じ答え**（`ground.js`）から引く。
//   ⚠ 別々に書くと、⚠ **トップが「深掘りできる」と言った場所で `/peel` が落ちる。**
// ⚠ **「この場所に 3D の下地があるか」に答える実装を、2 つ持たない**（掟6）。
//   トップは「この場所を深掘り」の導線を出すかどうかを、/peel は建物を静的に描けるかを、
//   **同じ答え**で決めている。別々に書くと、
//   **トップが「深掘りできる」と言った場所で /peel が Overpass に落ちる**状態が作れる
//   （＝出るか出ないかが相手次第。押しても何も起きない導線を置かない、に反する）。
//   ⚠ 判定の材料は 2 つある。どちらも ground.js だけが持つこと。
//     1) 集計する範囲（HALF_LON / HALF_LAT）  2) z14 タイル索引の引き方
{
  const g = src["ground.js"];
  if (!g) bad("public/ground.js が無い（下地の判定の置き場所）");
  else {
    const needs = [
      ["HALF_LON", "集計する範囲（この値がずれると、導線を出したのに建物が出ない場所ができる）"],
      ["hasSync", "トップが同期で引く入口"],
      ["tilesFor", "/peel が読むタイルの並び"],
    ];
    const miss = needs.filter(([k]) => !g.includes(k));
    if (miss.length) bad(`ground.js に ${miss.map(([k, w]) => `${k}（${w}）`).join("・")} が無い`);
    else ok("ground.js が、範囲・トップ側の入口・/peel 側の入口を持っている");

    // ⚠ 使う側が、同じ判断を自分でも書いていないこと。
    //   ⚠ **コメントを先に落とす。** 落とさないと、この決まりを説明したコメントの字面を拾う
    //     （CLAUDE.md §5。2 回踏んでいる）。
    const strip = (s) => s.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, "$1")
      .replace(HTML_COMMENT, " ");
    // ⚠ **トップの JS は `top.js`**（2026-08-24。⚠ `index.html` から逐語で出した）。
    //   ⚠ **`/peel` の `peel3d.js` と対になる。**⚠ 2 画面とも JS は別ファイル。
    for (const f of ["top.js", "peel3d.js"]) {
      const s = strip(src[f] ?? "");
      const own = [
        [/const\s*\{?\s*HALF_LON/, "範囲（HALF_LON）を自分で宣言している"],
        [/z14of\s*=/, "z14 タイルの求め方を自分で書いている"],
        [/bl\/index\.json/, "タイル索引の場所を直に書いている（assets.json 経由にする）"],
      ].filter(([re]) => re.test(s.replace(/const\s*\{HALF_LON,HALF_LAT\}\s*=\s*KonjakuGround/, "")));
      if (own.length) bad(`${f} が下地の判定を自分でも持っている: ${own.map(([, w]) => w).join("・")}`);
      else if (!s.includes("KonjakuGround")) bad(`${f} が KonjakuGround を使っていない（判定の出どころが不明）`);
      else ok(`${f} は ground.js の答えを使っている`);
    }
    // 読み込み忘れ。読み込まないと ReferenceError で画面が丸ごと止まる
    for (const f of ["index.html", "peel.html"])
      if ((src[f] ?? "").includes('src="./ground.js"')) ok(`${f} が ground.js を読み込んでいる`);
      else bad(`${f} が ground.js を読み込んでいない（KonjakuGround が未定義になる）`);
  }
}
