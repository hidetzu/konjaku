// トップ（`/`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=top`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。
//
// ⚠ **このファイルは、⚠ もう組み立てだけ**（2026-08-27。hidetzu/konjaku#277 の 42 本目で最後の 2 件が出た）。
//   ⚠ **ケースは 1 件も持っていない。**⚠ **問いごとに `top-*.mjs` が持つ。**
//   ⚠ **足すときは、⚠ どの問いに答えるかを決めてから、⚠ その `top-*.mjs` へ入れる。**
//   ⚠ **ここに直接足さない**（⚠ また 5404 行に戻る）。
//   ⚠ **割った側が親に入っていることは `test/check/deliver.mjs` が見ている。**
//
// ⚠ **`lib.mjs` からの取り込みは、⚠ 文ごと消えた。**⚠ **ここでは 1 つも使わないため**
//   （⚠ 未使用の取り込みそのものは hidetzu/konjaku#287。⚠ **ここは「文が死んだ」ので落とした**）。
// ⚠ **標準の口（`node:fs/promises` ほか）も、⚠ 使う側の `top-*.mjs` が取り込む。**

// ⚠ **外から来た文字列の 3 件は `top-escape.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **末尾に spread し直すので、⚠ 並びもシャードの割り当ても動かない。**
import { CASES as ESCAPE_CASES } from "./top-escape.mjs";
// ⚠ **記録より強く言わないは `top-claim.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件を、⚠ 元ファイルの見出し 2 本ごと運んだ**ので、⚠ **並びは動かない。**
import { CASES as CLAIM_CASES } from "./top-claim.mjs";
// ⚠ **色みは `top-theme.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as THEME_CASES } from "./top-theme.mjs";
// ⚠ **場所が分からないとき黙って別の場所を出さないは `top-nowhere.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **離れた 2 件を集めたので、⚠ 並びは動く。**
import { CASES as NOWHERE_CASES } from "./top-nowhere.mjs";
// ⚠ **判定カードと次の一手は `top-launch.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **土地の型 4 つを 1 つにまとめた。**⚠ **離れた 2 件を寄せたので、⚠ 並びは動く。**
import { CASES as LAUNCH_CASES } from "./top-launch.mjs";
// ⚠ **明治期の面は `top-meiji.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as MEIJI_CASES } from "./top-meiji.mjs";
// ⚠ **同じことを 2 か所で言わないは `top-once.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **離れた 1 件 ＋ 連続した 2 件を集めたので、⚠ 並びは動く。**
import { CASES as ONCE_CASES } from "./top-once.mjs";
// ⚠ **既定で畳み開けば読めるは `top-fold.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as FOLD_CASES } from "./top-fold.mjs";
// ⚠ **次の一手の語は `top-word.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件 ＋ 連続した 3 件を集めたので、⚠ 並びは動く。**
import { CASES as WORD_CASES } from "./top-word.mjs";
// ⚠ **待っているあいだと遅れて届いたものは `top-wait.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
import { CASES as WAIT_CASES } from "./top-wait.mjs";
// ⚠ **押さずに読めるは `top-read.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **離れた 3 件を集めたので、⚠ 並びは動く。**
import { CASES as READ_CASES } from "./top-read.mjs";
// ⚠ **押せるものが届き押すと応えるは `top-reach.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **4 つの塊を集めたので、⚠ 並びは動く。**
import { CASES as REACH_CASES } from "./top-reach.mjs";
// ⚠ **画面と URL がいまの選択と食い違わないは `top-consistent.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277 の 42 本目・最後）。⚠ **2 つの塊を集めたので、⚠ 並びは動く。**
import { CASES as CONSISTENT_CASES } from "./top-consistent.mjs";
// ⚠ **共有と、そのときに数えるものは `top-share.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **散らばった 6 件を集めたので、⚠ 並びは動く**（⚠ 件数と判定の字は変わらない）。
import { CASES as SHARE_CASES } from "./top-share.mjs";
// ⚠ **外との境目は `top-outside.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **`top-escape.mjs`（外から来たもの）と対**。⚠ 散らばった 4 件を集めたので並びは動く。
import { CASES as OUTSIDE_CASES } from "./top-outside.mjs";
// ⚠ **この範囲にあったものは `top-events.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as EVENTS_CASES } from "./top-events.mjs";
// ⚠ **年代を動かす／明治期を重ねるは `top-eras.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 1 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as ERASMOVE_CASES } from "./top-eras.mjs";
// ⚠ **場所を選んだあとの一歩は `top-next.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **連続した 7 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as NEXT_CASES } from "./top-next.mjs";
// ⚠ **年代の帯は `top-strip.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as STRIP_CASES } from "./top-strip.mjs";
// ⚠ **取れなかったを「無い」と言わないは `top-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 5 件をそのままの並びで運んだ。**
import { CASES as UNREACH_CASES } from "./top-unreachable.mjs";
// ⚠ **場所を探すは `top-search.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **2 つの連続した塊を集めたので、⚠ 並びは動く。**
import { CASES as SEARCH_CASES } from "./top-search.mjs";
// ⚠ **土地の答えが、どこで開いても同じに出るは `top-answer.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 6 件をそのままの並びで運んだ。**
import { CASES as ANSWER_CASES } from "./top-answer.mjs";
// ⚠ **幅と文字サイズは `top-fit.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **3 つの連続した塊を集めたので、⚠ 並びは動く。**
import { CASES as FIT_CASES } from "./top-fit.mjs";

export const CASES = [
  ...THEME_CASES,
  ...NOWHERE_CASES,
  ...LAUNCH_CASES,
  ...MEIJI_CASES,
  ...ONCE_CASES,
  ...FOLD_CASES,
  ...WORD_CASES,
  ...WAIT_CASES,
  ...READ_CASES,
  ...REACH_CASES,
  ...CONSISTENT_CASES,

  ...SHARE_CASES,
  ...UNREACH_CASES,
  ...SEARCH_CASES,
  ...FIT_CASES,






  ...ANSWER_CASES,

  ...STRIP_CASES,
  ...EVENTS_CASES,
  ...OUTSIDE_CASES,
  ...ERASMOVE_CASES,
  ...NEXT_CASES,
  ...ESCAPE_CASES,
  ...CLAIM_CASES,
];
