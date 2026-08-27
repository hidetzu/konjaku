// 深掘り（`/peel`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=peel`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。
//
// ⚠ **このファイルは、⚠ もう組み立てだけ**（2026-08-27。hidetzu/konjaku#277 の 30 本目で最後の 1 件が出た）。
//   ⚠ **ケースは 1 件も持っていない。**⚠ **問いごとに `peel-*.mjs` が持つ。**
//   ⚠ **足すときは、⚠ どの問いに答えるかを決めてから、⚠ その `peel-*.mjs` へ入れる。**
//   ⚠ **ここに直接足さない**（⚠ また 4342 行に戻る）。
//   ⚠ **割った側が親に入っていることは `test/check/deliver.mjs` が見ている。**
//
// ⚠ **`lib.mjs` からの取り込みは、⚠ 文ごと消えた。**⚠ **ここでは 1 つも使わないため**
//   （⚠ 未使用の取り込みそのものは hidetzu/konjaku#287。⚠ **ここは「文が死んだ」ので落とした**）。

// ⚠ **取れなかったを「無い」と言わないは `peel-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277 の 12 本目。⚠ **`peel.mjs` を割る 1 本目**）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as UNREACH_CASES } from "./peel-unreachable.mjs";
// ⚠ **動きを減らすは `peel-motion.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as MOTION_CASES } from "./peel-motion.mjs";
// ⚠ **さかのぼる（再生）は `peel-play.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **6 件の連続 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
import { CASES as PLAY_CASES } from "./peel-play.mjs";
// ⚠ **部品を単体で動かすは `peel-component.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as COMPONENT_CASES } from "./peel-component.mjs";
// ⚠ **3D で建物を押す・戻るは `peel-building.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 9 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as BUILDING_CASES } from "./peel-building.mjs";
// ⚠ **見えて、届いて、戻れるは `peel-reach.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as REACH_CASES } from "./peel-reach.mjs";
// ⚠ **パネルの開閉と答えの居場所は `peel-panel.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 6 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as PANEL_CASES } from "./peel-panel.mjs";
// ⚠ **色みは `peel-theme.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as THEME_CASES } from "./peel-theme.mjs";
// ⚠ **答えの置き場と確かさの段は `peel-layer.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as LAYER_CASES } from "./peel-layer.mjs";
// ⚠ **建物の取得と年代の段は `peel-era.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 9 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as ERA_CASES } from "./peel-era.mjs";
// ⚠ **古い結果で、いまの画面を上書きしないは `peel-fresh.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 4 件をそのままの並びで運んだ。**
import { CASES as FRESH_CASES } from "./peel-fresh.mjs";
// ⚠ **狭い幅の器と建物を待つあいだは `peel-fold.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as FOLD_CASES } from "./peel-fold.mjs";
// ⚠ **足元の区分と確かさの段は `peel-ground.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as GROUND_CASES } from "./peel-ground.mjs";
// ⚠ **まだ用意していない土地の話は `peel-unbuilt.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as UNBUILT_CASES } from "./peel-unbuilt.mjs";
// ⚠ **土地の答えは 1 か所だけは `peel-answer.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as ANSWER_CASES } from "./peel-answer.mjs";
// ⚠ **小さくしても断りは畳まないは `peel-caveat.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as CAVEAT_CASES } from "./peel-caveat.mjs";
// ⚠ **押したら本当に応えるは `peel-press.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as PRESS_CASES } from "./peel-press.mjs";
// ⚠ **数字の分母と推定という断りは `peel-number.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as NUMBER_CASES } from "./peel-number.mjs";
// ⚠ **外から来た文字列は実行されないは `peel-xss.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **元ファイルで専用の見出しを持っていた 1 件。**⚠ **これで `peel.mjs` は組み立てだけになった。**
import { CASES as XSS_CASES } from "./peel-xss.mjs";


export const CASES = [
  ...THEME_CASES,
  ...LAYER_CASES,
  ...PLAY_CASES,
  ...REACH_CASES,
  ...UNREACH_CASES,
  ...FRESH_CASES,
  ...FOLD_CASES,
  ...GROUND_CASES,
  ...MOTION_CASES,
  ...ERA_CASES,
  ...COMPONENT_CASES,

  ...PANEL_CASES,
  ...BUILDING_CASES,
  ...UNBUILT_CASES,
  ...ANSWER_CASES,
  ...CAVEAT_CASES,
  ...PRESS_CASES,
  ...NUMBER_CASES,
  ...XSS_CASES,
];
