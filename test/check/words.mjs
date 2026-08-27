// 静的検査 — 言葉は 1 か所から（⚠ **同じ字・同じ判断を、⚠ 2 か所で作らない**）
//
// ⚠ **`test/check.mjs` の「9. 画面の言葉」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 20 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **順番も変えていない**（⚠ 節の並びは、⚠ そのまま判定の字の並びになる）。
//
// ⚠ **出せるようになったのは、⚠ 道具（`seen`）を `lib.mjs` へ出したから**
//   （hidetzu/konjaku#232 の 19 本目）。⚠ **それまでは 1 塊も外へ出せなかった。**
//
// ⚠ **ここが守っているもの**（⚠ どれも `CLAUDE.md` §3: **同じ問いに答える実装を 2 つ持たない**）:
//     検査自身が字を書き写していないか   ⚠ **写すと、⚠ 画面を直しても検査が気づかない**
//     第3層の区分名と件数               ⚠ 「内訳」の 1 か所。⚠ **本文が繰り返さない**
//     深掘りの導線                      ⚠ `TOPWORD.peelLead` の 1 か所
//     土地の答え                        ⚠ 情報パネルの 1 か所で組み立てる
//     第1層の字と問いの見出し            ⚠ `words.js` の 1 か所
//     地形分類・人工地形の語             ⚠ **言うのは答えの行だけ**
//     一覧を畳む判断                    ⚠ `evVis()` の 1 か所
//     「まだ提供していない」の文          ⚠ `prov.js` の 1 つ
//     一覧の組の見出し                   ⚠ 棚卸しのとおりか
//
// ⚠ **`answer.mjs`（答えの組み立て）とは別。**⚠ あちらは ⚠ **読んだ結果を、⚠ どう言うか。**
//   ⚠ こちらは ⚠ **その字を、⚠ 誰が持っているか。**
//
// ⚠ **語の棚卸し（`SCREEN_WORDS`）は持ってきていない。**⚠ **表と一緒に動く**ので、
//   ⚠ **そちらは別の 1 本にする。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ok, bad, head, src, seen, seenTop, stripJs, BLOCK_COMMENT, HTML_COMMENT, HEAD_COMMENT } from "./lib.mjs";

head("言葉は 1 か所から");

// ⚠ **検査そのものが、画面の字を書き写していないこと。**
//   ⚠ **2026-08-20 に 2 回踏んだ。**言葉を言い直すたびに、⚠ **製品ではなく
//     `render.mjs` のほうが落ちた**（「根拠あり」と「直読み」を直接書いていた）。
//   ⚠ **検査は持ち主（words.js）から取る。**そうすれば、次に言い直しても落ちない。
//   ⚠ **コメントは先に落とす**（何を直したかの説明を、この検査が拾わないように）。
{
  const OWNED_BY_WORDS = [
    ...Object.values(globalThis.KonjakuWords?.TAG ?? {}),
    ...Object.values(globalThis.KonjakuWords?.METHOD ?? {}),
    globalThis.KonjakuWords?.EDGE, globalThis.KonjakuWords?.UNREAD,
    globalThis.KonjakuWords?.S?.noRecord, globalThis.KonjakuWords?.S?.cantTell,
    globalThis.KonjakuWords?.MEIJI_NOT_PHOTO,
  ].filter(Boolean);
  // ⚠ **コメント落としは stripJs を使う。**⚠ 素朴な正規表現で書いたら、
  //   ⚠ **正規表現リテラルの中の `/*` を拾って、本物のコードを大量に消していた**
  //   （2026-08-20 に踏んだ。⚠ **わざと壊しても緑のままだった**）。CLAUDE.md §5。
  // ⚠ **ケースは suite が持つ**（2026-08-22 に割った）。⚠ **走者だけ見ると、⚠ 何も見なくなる。**
  // ⚠ **その suite も、⚠ 問いごとに割った**（2026-08-27。hidetzu/konjaku#277）。
  //   ⚠ **`top.mjs` / `peel.mjs` を名指しで読んでいたので、⚠ ケースが出ていくたびに
  //     ⚠ この検査の見る範囲が減っていた**（⚠ **`peel.mjs` は自前のケースが 0 件になった**）。
  //   ⚠ **落ちないので気づけない。**⚠ **同じ罠を 1 段深いところで踏んだ。**
  //   ⚠ **名指しをやめて、⚠ `test/render/` の `.mjs` を全部読む。**⚠ **足しても勝手に入る。**
  const { readdirSync: rdk } = await import("node:fs");
  const files = ["test/render.mjs",
    ...rdk(join(ROOT, "test/render")).filter((f) => f.endsWith(".mjs"))
      .sort().map((f) => `test/render/${f}`)];
  const copied = new Set();
  for (const f of files) {
    const bare = stripJs(await readFile(join(ROOT, f), "utf8").catch(() => ""), f);
    for (const w of OWNED_BY_WORDS) if (bare.includes(`"${w}"`)) copied.add(`${f}:「${w}」`);
  }
  copied.size
    ? bad(`実描画が words.js の字を書き写している: ${[...copied].join("、")}`
        + `（言い直すと、製品ではなく検査が落ちる。WORDS から取ること）`)
    : ok(`実描画（${files.length} ファイル）は words.js の字（${OWNED_BY_WORDS.length} 語）を書き写していない`);
}

// ⚠ **同じ主張を、画面の 2 か所に置かない**（hidetzu/konjaku#130）。
//
//   ⚠ **実測（2026-08-20・main = 42784fa・豊洲・1280×800・SW 無効）**
//     第3層の本文  y376  区分を特定できた足元のうち 河川・湖沼・海面 510 / 543件（93.9%）
//     「内訳」      y876  河川・湖沼・海面 510 / 543
//     ⚠ **同じ数字・同じ区分名が、⚠ 500px 離れて 2 回。**
//   ⚠ **内訳が正本**（2 位以下も出す）。⚠ 1 位だけを別の場所で繰り返す意味が無い。
//
//   ⚠ **戻ってきたら落とす。**⚠ 字面ではなく、⚠ **組み立ての種類**で見る。
{
  const bad6 = [];
  const PJ = seen["peel3d.js"] ?? "";
  if (!PJ) bad6.push("peel3d.js を読めていない（この検査が何も見ていない）");
  // ⚠ **第3層の補足として、区分名と件数をもう一度組み立てない**
  if (/kind\s*:\s*"share"/.test(PJ))
    bad6.push('peel3d.js に kind:"share" が戻っている（内訳と同じことを 2 回言う）');
  if (/区分を特定できた足元のうち/.test(PJ))
    bad6.push("peel3d.js に「区分を特定できた足元のうち」が戻っている（内訳の 1 行目と同じ）");
  // ⚠ **内訳は残っていること。**⚠ 受け皿が無くなったら、⚠ 消しただけになる
  // ⚠ **名前の境界まで見る**（2026-08-20。⚠ 明治期の面を移したときに同じ穴を踏んでいる）。
  //   ⚠ `paintBreakdownX` に改名しても `function paintBreakdown` を含むので、
  //     ⚠ **includes や前方一致では通ってしまう。**
  for (const w of ["paintBreakdown", "breakdown"])
    if (!new RegExp("function\\s+" + w + "\\s*\\(").test(PJ))
      bad6.push(`peel3d.js から function ${w}() が消えている（区分名の受け皿が無い）`);
  // ⚠ **呼ばれていること。**⚠ 定義だけ残っていても画面には出ない
  if (!/paintBreakdown\s*\(\s*document\.getElementById/.test(PJ))
    bad6.push("peel3d.js が内訳を描いていない（定義はあるが呼んでいない）");
  // ⚠ **3D の帯の断りは、⚠ 消さない**（hidetzu/konjaku#130 の ②）。
  //   ⚠ **触ったら落とす。**⚠ 「消すと掟に反する」と実測で分かっている
  //     （⚠ スマホで 0 アクションで見える唯一の場所）。
  // ⚠ **2026-08-21 に言い方を変えた**（hidetzu/konjaku#151。Owner 判断）:
  //   ⚠ 「建物が消える年代は**演出**です」→「建物が消える年代は**推定**です」。
  //   ⚠ **分数（建てられた年 N / M ／ 高さ N / M）はパネルへ移した**（⚠ 消していない）。
  //   ⚠ **見ている主張は同じ**: ⚠ 断りが帯に残っていること。
  // ⚠ **2026-08-22 に、⚠ 「推定」の語だけ色を付けた**（`<span class="k">推定</span>`）。
  //   ⚠ **字が要素で割れたので、⚠ 連続した文字列では読めない。**
  //   ⚠ **タグを落としてから見る。**⚠ **見ている主張は同じ**（⚠ 断りが残っていること）。
  //   ⚠ **緩めていない。**⚠ 割ってごまかせないよう、⚠ **語の順まで見る。**
  if (!/建物が消える年代は推定/.test(PJ.replace(/<[^>]+>/g, "")))
    bad6.push("3D の帯から「建物が消える年代は推定」が消えている"
      + "（スマホで 0 アクションで見える唯一の場所。peel3d.js の同名コメントを読む）");
  // ⚠ **言い換えが半分だけ残っていないこと**（⚠ 「演出」が画面の字として戻らない）
  if (/建物が消える年代は演出/.test(PJ))
    bad6.push("3D の帯に「演出」が戻っている（2026-08-21 に「推定」へ統一した）");
  const PH = seen["peel.html"] ?? "";
  if (!/国土地理院/.test(PH) || !/OpenStreetMap/.test(PH))
    bad6.push("peel.html の出典から地理院か OSM が消えている（出典明示は利用の条件）");
  bad6.length
    ? bad(`同じ主張が画面の 2 か所に出ている: ${bad6.join("、")}`)
    : ok("第3層の区分名と件数は「内訳」の 1 か所で、本文が繰り返していない"
       + "（3D の帯の断りと、出典の 2 つは残してある）");
}

// ⚠ **深掘りの導線は 1 か所**（hidetzu/konjaku#138。⚠ 2026-08-21 に置き場所を変えた）。
//
//   ⚠ **実測（2026-08-21・main = 8219774・豊洲・SW 無効）**
//     根拠を開くと ⚠ **`#own` に 1 個・一覧に 1 個**。⚠ **DOM には常に 2 つあった。**
//   ⚠ 利用者役 4 名に画面だけを見せた: ⚠ **4/4 が一覧行を残すと答え、4/4 が根拠側を否定した。**
//   ⚠ **字も 1 か所**（TOPWORD.peelLead）。⚠ 以前は一覧行が同じ字を書き写していた。
{
  const bad8 = [];
  const IX = seenTop;
  if (!IX) bad8.push("index.html を読めていない（この検査が何も見ていない）");
  // ⚠ **根拠パネルの組み立てに、./peel へのリンクが無いこと**
  //   ⚠ **`own.innerHTML` は 2 か所ある**（⚠ 判定中の 1 行と、⚠ 根拠カードの本体）。
  //     ⚠ **最初の 1 つだけを見ると、⚠ 判定中のほうを掴んで何も見ない**（2026-08-21 に踏んだ）。
  //   ⚠ **全部を見る。**⚠ どれか 1 つにでも ./peel があれば落とす。
  const owns = [...IX.matchAll(/own\.innerHTML\s*=[\s\S]{0,2500}?;\n/g)].map((m) => m[0]);
  if (owns.length < 2)
    bad8.push(`根拠パネルの組み立てが ${owns.length} 個しか見つからない（この検査が何も見ていない）`);
  for (const o of owns)
    if (/\.\/peel\?/.test(o))
      bad8.push("根拠パネルに ./peel への導線が戻っている（導線は一覧行の 1 か所）");
  // ⚠ **字の持ち主は TOPWORD.peelLead**。⚠ 呼ぶ側が書き写していないこと
  const OWNED = ["いまの街が、明治期の地面のどこに立っているか"];
  for (const w of OWNED) {
    const n = IX.split(w).length - 1;
    if (n !== 1) bad8.push(`「${w.slice(0, 18)}…」が index.html に ${n} 個ある（peelLead の 1 か所だけ）`);
  }
  // ⚠ **建物の判定が無い土地の字は、⚠ `words.js` が持つ**（2026-08-22。hidetzu/konjaku の
  //   パネル整理で、⚠ **`/peel` も同じ字を使うようになった**）。
  //   ⚠ **前は index.html にべた書きで 1 個**だった。⚠ **移した先でも 1 か所であること**を見る。
  //   ⚠ **弱めていない。**⚠ **見る場所が index.html → words.js に移っただけ。**
  {
    const STEM = "空中写真を年代で切りかえて、明治期の地面と見くらべ";
    const inW = (src["words.js"] ?? "").split(STEM).length - 1;
    const inIX = IX.split(STEM).length - 1;
    const inPeel = ((src["peel.html"] ?? "") + (src["peel3d.js"] ?? "")).split(STEM).length - 1;
    if (inW !== 1) bad8.push(`words.js に「${STEM.slice(0, 14)}…」が ${inW} 個ある（1 か所のはず）`);
    if (inIX) bad8.push(`index.html が「${STEM.slice(0, 14)}…」を書き写している（${inIX} 個）`);
    if (inPeel) bad8.push(`/peel が「${STEM.slice(0, 14)}…」を書き写している（${inPeel} 個）`);
    // ⚠ **両方が、⚠ 同じ口を通っていること**（⚠ 死にコードにしない）
    if (!/KonjakuWords\.canWithoutBuildings\("top"\)/.test(IX))
      bad8.push("index.html が canWithoutBuildings を通っていない（字が 2 か所になる）");
    // ⚠ **呼び出し元は `prov.js` へ移った**（2026-08-22。Owner 判断: ⚠ 代わりにできることは
    //   ⚠ **断りに添える**。⚠ 問いの答えの位置には置かない）。⚠ **見る主張は同じ。**
    if (!/canWithoutBuildings\?\.\("peel"\)|canWithoutBuildings\("peel"\)/
          .test((src["prov.js"] ?? "") + (src["peel3d.js"] ?? "")))
      bad8.push("/peel が canWithoutBuildings を通っていない（字が 2 か所になる）");
  }
  // ⚠ **判定カードの CTA が peelLead を通っていること**（⚠ 死にコードにしない）
  //   ⚠ **2026-08-21 に、⚠ 導線が行動一覧から判定カードの中へ移った。**
  //     ⚠ 実測（豊洲・375×667・hasTouch・SW 無効）: **y1135 → y651**。
  //     ⚠ 利用者役 4 名: ⚠ **「次に何をしますか」に答えられたのが 2/4 → 4/4**。
  //   ⚠ **見ている主張は変えていない**（⚠ 字の持ち主が 1 つであること）。
  if (!/sub\s*:\s*TOPWORD\.peelLead\(/.test(IX))
    bad8.push("深掘りの導線が TOPWORD.peelLead を通っていない（字が 2 か所になる）");
  // ⚠ **導線は判定カードの中に 1 つ**。⚠ 一覧に戻っていないこと
  if (!/function peelCtaHTML\(/.test(IX))
    bad8.push("判定カードの深掘り（peelCtaHTML）が無い");
  if (/\{id:"peel"/.test(IX))
    bad8.push("行動一覧に深掘りの行が戻っている（導線は判定カードの 1 か所）");
  bad8.length
    ? bad(`深掘りの導線が 1 か所になっていない: ${bad8.join("、")}`)
    : ok("深掘りの導線は行動一覧の 1 か所で、字も TOPWORD.peelLead の 1 か所から出ている");
}

// ⚠ **土地の答えは、⚠ 情報パネルの 1 か所だけで組み立てる**
//   （hidetzu/konjaku#152。⚠ 2026-08-21 に Owner 判断で置き場所が変わった）。
//
//   ⚠ **前の主張**（hidetzu/konjaku#131）: 「⚠ 見えない箱に土地情報を組み立てない」。
//     ⚠ 実測（2026-08-20・豊洲）: PC 初期で `#land` は 0×0 なのに 72 字が書かれていた。
//     ⚠ そこで「⚠ 見えているときだけ描く（syncHud）」を足した。
//   ⚠ **`#land` そのものが無くなったので、⚠ その仕掛けごと要らなくなった。**
//     ⚠ **主張は引き継ぐ**: ⚠ **描く先は 1 つ。**⚠ **model も 1 回だけ作る**（ADR 0021）。
//
//   ⚠ **`.hide` を切り替える入口は、⚠ いまも 1 か所**（⚠ ✕ と ▶ の両方が通る）。
{
  const bad7 = [];
  const PJ = seen["peel3d.js"] ?? "";
  if (!PJ) bad7.push("peel3d.js を読めていない（この検査が何も見ていない）");
  // ⚠ **入口が 1 か所**（2026-08-22: ⚠ **`.hide` → `.open` に変わった**）。
  //   ⚠ **パネルは常に出す。⚠ 小さくできるだけ**（Owner 判断）。
  //   ⚠ **見ている主張は変えていない**（⚠ 状態を切り替える場所が 1 つであること）。
  const toggles = (PJ.match(/classList\.toggle\(\s*"open"/g) ?? []).length;
  if (toggles !== 1)
    bad7.push(`.hide を切り替えている箇所が ${toggles} 個ある（1 か所へまとめる。`
      + `⚠ ✕ と ▶ の両方が通る）`);
  if (!/\bsetPanelHidden\b/.test(PJ)) bad7.push("peel3d.js に setPanelHidden が無い");
  // ⚠ **model は 1 回だけ作る。**⚠ layersOf を 2 か所で呼ばない（ADR 0021）
  const calls = (PJ.match(/layersOf\s*\(/g) ?? []).length;
  // ⚠ 定義 1 つ ＋ 呼び出し 1 つ ＝ 2
  if (calls !== 2)
    bad7.push(`layersOf の出現が ${calls} 個（定義 1 ＋ 呼び出し 1 のはず。`
      + `⚠ 2 か所で作ると同じ画面で言うことが食い違う）`);
  // ⚠ **描く先は 1 つだけ**（⚠ パネル）。⚠ 定義 1 つ ＋ 呼び出し 2 つ（⚠ 空にする回を含む）
  const paints = (PJ.match(/paintLand\s*\(/g) ?? []).length;
  if (paints !== 3)
    bad7.push(`paintLand の出現が ${paints} 個（定義 1 ＋ 呼び出し 2 のはず）`);
  for (const m of PJ.match(/paintLand\s*\([^)]*\)/g) ?? [])
    if (!/landAll|el, m/.test(m))
      bad7.push(`paintLand の描く先がパネルでない: ${m}`);
  // ⚠ **消した仕掛けが戻っていないこと**（⚠ 戻すと、⚠ 答えが 2 か所になる）
  for (const w of ["syncHud", "hudLayers", "landSeen", "syncLandH", "landEl"])
    if (new RegExp("\\b" + w + "\\b\\s*[=(]").test(PJ))
      bad7.push(`${w} が戻っている（土地の答えはパネルの 1 か所。hidetzu/konjaku#152）`);
  const PH = seen["peel.html"] ?? "";
  if (/id="land"/.test(PH))
    bad7.push('peel.html に <div id="land"> が戻っている（⚠ 空要素でも置かない）');
  bad7.length
    ? bad(`土地の答えが 1 か所から出ていない: ${bad7.join("、")}`)
    : ok("土地の答えは情報パネルの 1 か所で組み立て、model は 1 回だけ作る"
       + "（.hide の切り替えも 1 か所）");
}

// ⚠ **第1層の字と、問いの見出しは words.js の 1 か所**（hidetzu/konjaku#122）。
//   ⚠ 2026-08-20 まで、⚠ **同じ第1層をトップと /peel が別々に組んでいた**
//     （トップ: verify.js の plainPast ／ /peel: peel3d.js の WORD.ground1）。
//     ⚠ 実測（ADR 0030 §4）: トップ「もとは 水だった土地（旧水部）です。…」／
//       /peel「この土地は 旧水部」。⚠ **同じ土地に 2 通りの答え**が出ていた。
//   ⚠ **コメントは落としてある**（seen を使う。CLAUDE.md §5）。
{
  const bad4 = [];
  const W = seen["words.js"] ?? "";
  if (!W) bad4.push("words.js を読めていない（この検査が何も見ていない）");
  // ⚠ **words.js が持っていること**
  for (const w of ["layerTitle", "ground1Lines", "ground1Text"])
    if (!W.includes(w)) bad4.push(`words.js が ${w} を持っていない`);
  // ⚠ **呼ぶ側が書き写していないこと。**⚠ 主語も、問いの見出しも
  const OWNED = ["この土地は ", "人の手で ", "ここはどんな土地？", "昔はどんな土地？",
                 "今建っている建物は？"];
  // ⚠ **許可一覧は無い**（2026-08-20 に空にした。hidetzu/konjaku#125）。
  //   ⚠ ここには peel3d.js の landformLine() を 1 つだけ許していた。
  //   ⚠ **それは死にコードで、画面に一度も出ていなかった。**⚠ 消したので許す相手がいない。
  //   ⚠ **戻さない。**⚠ 写しを見つけたら、許すのではなく words.js へ寄せる。
  for (const f of Object.keys(seen)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    for (const w of OWNED)
      if ((seen[f] ?? "").includes(w)) bad4.push(`${f} が words.js の字を書き写している（「${w}」）`);
  }
  // ⚠ **3 つの呼び手が、全部 words.js を通っていること**
  // ⚠ **トップの JS は `top.js`**（2026-08-24）
  for (const [f, w] of [["top.js", "KonjakuWords.ground1Lines"],
                        ["top.js", "KonjakuWords.layerTitle"],
                        ["peel3d.js", "KonjakuWords.ground1Lines"],
                        ["peel3d.js", "KonjakuWords.layerTitle"],
                        ["verify.js", "KonjakuWords.ground1Text"]])
    if (!(seen[f] ?? "").includes(w)) bad4.push(`${f} が ${w} を通っていない`);
  // ⚠ **verify.js に第1層の組み立てが残っていないこと**（消したものが戻らない）
  if (/function plainPast|PLAIN_PAST/.test(seen["verify.js"] ?? ""))
    bad4.push("verify.js に第1層の組み立て（plainPast）が戻っている");
  bad4.length
    ? bad(`第1層の字と問いの見出しが 1 か所から出ていない: ${bad4.join("、")}`)
    : ok("第1層の字と問いの見出しは words.js の 1 か所で、トップ・/peel・共有カードが借りている");
}

// ⚠ **地形分類の語を言うのは、答えの行だけ**（2026-08-21。hidetzu/konjaku#139）。
//   ⚠ 2026-08-21 まで、⚠ **バッジが同じ区分名をもう一度言っていた**
//     （バッジ「🌊 旧水部」／答え「この土地は 旧水部」）。
//     ⚠ 実測（375×667・hasTouch・SW 無効）で **豊洲・軽井沢・上野・札幌の 4 地点すべて**が該当。
//   ⚠ **「（広い区分）」も同じ。**⚠ 判定カードの coarse の行が同じことを言っている。
//   ⚠ **消してよかったのは言い直しだけ。**⚠ 「読み込めませんでした」は残す
//     （⚠ 答えの行は、読めなかったときに区分名を出さない。⚠ **重複ではない**）。
{
  const bad5 = [];
  const V = seen["verify.js"] ?? "";
  const i = V.indexOf("function badges(");
  if (i < 0) bad5.push("verify.js の badges() が見つからない（この検査が何も見ていない）");
  // ⚠ badges() の中だけを見る。⚠ 次の関数の手前で切る
  const blk = i < 0 ? "" : V.slice(i, (() => {
    const j = V.indexOf("\n  function ", i + 10);
    return j < 0 ? V.length : j;
  })());
  // ⚠ **言い直しが戻っていないこと**
  if (/l\.value/.test(blk)) bad5.push("badges() が地形分類の区分名を出している（答えの行と 2 か所になる）");
  // ⚠ **`l.artificial` そのものは条件に残る**（読めなかったかを分けるため）。
  //   ⚠ 見たいのは「バッジの字として出しているか」なので、⚠ `text:` の側だけを見る。
  if (/text:\s*l\.artificial(?!Unread)/.test(blk))
    bad5.push("badges() が人工地形の語を出している（答えの行と 2 か所になる）");
  if (blk.includes("（広い区分）")) bad5.push("badges() が「（広い区分）」を出している（coarse の行と 2 か所になる）");
  // ⚠ **取れなかったことは、消さずに残っていること**
  if (!blk.includes("地形分類を読み込めませんでした"))
    bad5.push("badges() から「地形分類を読み込めませんでした」が消えている（取れなかったを黙ることになる）");
  if (!blk.includes("盛土・埋立を読み込めませんでした"))
    bad5.push("badges() から「盛土・埋立を読み込めませんでした」が消えている（同上）");
  // ⚠ **「広い区分」の持ち主が、判定カードに残っていること**
  if (!/lfF\.ok && !lfF\.fine/.test(seenTop))
    bad5.push("index.html が coarse の行（広い区分の理由）を出していない");
  bad5.length
    ? bad(`地形分類の語が 1 か所から出ていない: ${bad5.join("、")}`)
    : ok("地形分類・人工地形の語を言うのは答えの行だけで、バッジは言い直していない"
       + "（読み込めなかったときの申告と、広い区分の理由は残っている）");
}

// ⚠ **一覧を畳む判断は 1 か所**（2026-08-21。hidetzu/konjaku#141）。
//   ⚠ 一覧の描画と読み上げの両方が「いま何行出しているか」を要る。
//   ⚠ **式を 2 か所に書くと、⚠ 片方だけ古くなる**（掟）。⚠ 実際、書きかけで 2 か所になった。
//   ⚠ **上限まで開いたら押せる見た目をやめる**ことも、ここで見る（ADR 0026）。
{
  const bad6 = [];
  const H = seenTop;
  if (!H) bad6.push("index.html / top.js を読めていない（この検査が何も見ていない）");
  if (!/const evVis\s*=/.test(H)) bad6.push("evVis() が無い（出す行の持ち主がいない）");
  // ⚠ **切り出しの式は 1 回だけ**
  const cut = (H.match(/slice\(0,\s*EV_MIN\)/g) ?? []).length;
  if (cut !== 1) bad6.push(`出す行を切り出す式が ${cut} か所ある（evVis() の 1 つだけにする）`);
  // ⚠ **呼ぶ側が、両方とも evVis() を通っていること**
  // ⚠ 定義は `const evVis=()=>` なので `evVis()` には当たらない。⚠ ここが数えるのは呼び手だけ
  const calls = (H.match(/evVis\(\)/g) ?? []).length;
  if (calls < 2) bad6.push(`evVis() の呼び手が少ない（一覧の描画と読み上げで 2 つ。いまは ${calls}）`);
  // ⚠ **上限まで開いたら押せなくなること**（押しても何も起きない導線を置かない）
  if (!/evShown\.length\s*>\s*vis\.length/.test(H))
    bad6.push("「まだ隠れているとき」だけ押せる形になっていない（開ききっても押せてしまう）");
  // ⚠ **場所が変わったら畳み直すこと**（前の場所で開いたまま持ち越さない）
  const reset = (H.match(/evOpen\s*=\s*false/g) ?? []).length;
  if (reset < 3) bad6.push(`畳み直しが足りない（宣言 1 ＋ 場所を変える 2 で 3 以上。いまは ${reset}）`);
  bad6.length
    ? bad(`一覧を畳む判断が 1 か所から出ていない: ${bad6.join("、")}`)
    : ok("一覧に出す行を決めるのは evVis() の 1 か所で、描画と読み上げが借りている"
       + "（上限まで開いたら押せる見た目をやめる／場所が変わったら畳み直す）");
}

// ⚠ **「まだ提供していない」の文を、画面の各所が書き写していないか。**
//   実測（2026-08-18）: 同じ事実に 2 通りの文があり、20 秒のあいだに入れ替わっていた。
//   ⚠ 文は prov.js の NOTYET / NOTYET_WHY 1 つだけ。ほかは借りる。
{
  const js = seen["peel3d.js"] ?? "";
  const bad2 = [];
  // ⚠ 古い言い方が本文に戻っていないか
  if (/この場所の建物データは、まだ用意できていません/.test(js))
    bad2.push("古い言い方（まだ用意できていません）が戻っている");
  // ⚠ 文をそのまま書き写していないか（借りるなら KonjakuProv.NOTYET になる）
  const copied = (js.match(/建物ごとの判定は、この場所ではまだ提供していません/g) ?? []).length;
  if (copied) bad2.push(`文を ${copied} 箇所に書き写している`);
  if (/通信の問題ではありません。対応した場所から順に増やしています/.test(js))
    bad2.push("但し書きを書き写している");
  const borrowed = (js.match(/KonjakuProv\.NOTYET/g) ?? []).length;
  if (!borrowed) bad2.push("prov.js の文を 1 度も借りていない");
  bad2.length
    ? bad(`「まだ提供していない」の文が 1 か所になっていない: ${bad2.join(" / ")}`
        + `（prov.js の NOTYET / NOTYET_WHY を借りること）`)
    : ok(`「まだ提供していない」の文は prov.js の 1 つで、peel3d.js は ${borrowed} 箇所で借りている`);
}

// ⚠ 短い語（「自分」）は本文の検索で数えられない。宣言そのものを読む。
{
  // ⚠ **2026-08-20 に、宣言の場所が index.html → words.js へ移った。**
  //   ⚠ 見ているものは同じ（一覧行に何と出るか）。読む先だけ変えた。
  //   ⚠ 「自分」（priv）は同じときに消した。⚠ **付ける場所がどこにも無く、
  //     画面に出ようがない語**だったため。
  // ⚠ **2026-08-21 に、行ごとのタグ（TAG）→ 組の見出し（GROUP）へ移った。**
  //   ⚠ 見ているものは同じ（⚠ 一覧で「なぜここに出ているのか」を何と言うか）。
  //   ⚠ **消した 3 語は GONE_WORDS が見張る**ので、⚠ 戻ってきたら別の検査が落ちる。
  const m = /const GROUP\s*=\s*\{([^}]*)\}/.exec(seen["words.js"] ?? "");
  if (!m) bad("words.js の GROUP を読めない（一覧の組の見出しの棚卸しが何も見ていない）");
  else {
    const got = [...m[1].matchAll(/:\s*"([^"]*)"/g)].map((x) => x[1]);
    const want = ["さらに調べる", "公的な情報で確認する"];
    got.join("／") === want.join("／")
      ? ok(`一覧の組の見出しは棚卸しのとおり（${got.join("・")}）`)
      : bad(`一覧の組の見出しが棚卸しと違う: ${got.join("・")}（棚卸しは ${want.join("・")}）`);
  }
}

// ============================================================
// ⚠ 字の持ち主と、⚠ 説明を落とす規則
// ============================================================
// ⚠ **`test/check.mjs` の「6. まだ問いで分けていないもの」から逐語で移しただけ**
//   （2026-08-25。hidetzu/konjaku#232 の 24 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
// ⚠ **ここが「言葉は 1 か所から」の仲間である理由**: ⚠ **どちらも「写しを作らない」。**
//   ⚠ 字は `words.js` だけが持つ。⚠ 規則は `index.html` だけが持つ（⚠ 書き写さず切り出して動かす）。
// ⚠ **字を持っているのは words.js だけ。**呼ぶ側に写しを作らない。
{
  const OWNED = ["記録なし", "さらに調べる", "公的な情報で確認する"];
  const bare = (f) => (src[f] ?? "")
    .replace(HTML_COMMENT, " ").replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
  const spill = [];
  for (const f of Object.keys(src)) {
    if (f === "words.js" || !/\.(js|html)$/.test(f)) continue;
    for (const w of OWNED) if (bare(f).includes(w)) spill.push(`${f}「${w}」`);
  }
  spill.length
    ? bad(`words.js が持つ字を、呼ぶ側が書き写している: ${spill.join("、")}`
        + `（片方だけ直すと、同じ状態に 2 通りの言い方ができる）`)
    : ok(`words.js が持つ字（${OWNED.length} 語）は、呼ぶ側に写しが無い`);
}

// ⚠ 説明から「この画面では自明なもの」を落とす規則が、**本題まで落としていない**こと。
//   規則そのものは index.html にしかない（掟: 同じ問いに答える実装を2つ持たない）ので、
//   ここでは書き写さずに切り出して動かす。書き写すと、直したのに検査が古いままになる。
{
  const { readFileSync: rf } = await import("node:fs");
  const html = rf("public/top.js", "utf8");
  const a = html.indexOf("const ADMIN ="), b = html.indexOf("// ⚠ 記録の精度どおりに書く");
  if (a < 0 || b < a) bad("説明を落とす規則が index.html に見つからない（目印が変わった？）");
  else {
    const evDesc = new Function(`${html.slice(a, b)}; return evDesc;`)();
    // [説明, 名前, 期待]
    const CASES = [
      // 落とす（この画面では自明）
      ["広島市中区にある被爆建物", "旧日本銀行広島支店", "被爆建物"],
      ["日本の広島県広島市に所在する医療機関、広島原爆の爆心地として知られる", "島病院",
        "医療機関、広島原爆の爆心地として知られる"],
      ["広島市にある戦争遺構、世界遺産、旧広島県産業奨励館", "原爆ドーム",
        "戦争遺構、世界遺産、旧広島県産業奨励館"],
      // ⚠ 名前を読めば分かるものは出さない（読んでも増えない）
      ["東京都江東区にある小学校", "江東区立豊洲小学校", ""],
      ["東京都江東区にある中学校", "江東区立深川第五中学校", ""],
      // ⚠ ここから下は「落としてはいけない」側。壊れたら嘘になる
      //   「かつて」を落とすと、無くなったものが**いまあるもの**になる
      ["かつて仙台市にあった日本国有鉄道の貨物駅", "宮城野貨物駅",
        "かつて日本国有鉄道の貨物駅"],
      //   行政区画の接尾辞を必須にしていないと、ここまで落ちる
      ["広島原爆の爆心地にある慰霊碑", "慰霊碑", "広島原爆の爆心地にある慰霊碑"],
      //   「の」を禁じていないと、公園名が消える
      ["仙台市の榴岡公園にある資料館", "資料館", "榴岡公園にある資料館"],
      ["広島平和記念公園にある休憩所", "レストハウス", "広島平和記念公園にある休憩所"],
      // 説明が無いものは、無いまま
      [null, "何か", ""], ["", "何か", ""],
    ];
    const ng = CASES.filter(([d, l, want]) => evDesc(d, l) !== want)
      .map(([d, l, want]) => `「${d}」→「${evDesc(d, l)}」（期待「${want}」）`);
    ng.length ? bad(`説明を落とす規則が壊れている: ${ng.join(" / ")}`)
      : ok(`説明を落とす規則（${CASES.length} 例。落としてはいけない側 4 例を含む）`);
  }
}
