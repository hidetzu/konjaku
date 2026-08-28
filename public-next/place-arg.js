// 今昔 — URL で渡された「場所の指定」を読む
//
// ⚠ **DOM も地図も持たない**（`.claude/rules/javascript.md`）。⚠ Node から呼べる。
// ⚠ **判断はここ 1 か所**（掟: 同じ問いに答える実装を 2 つ持たない）。
//   ⚠ `/peel` は「深掘りする場所が決まっているか」を、⚠ トップは「なぜ戻ってきたか」を、
//   ⚠ **同じ答えから引く。**
//
// ⚠ **3 つを分ける**（hidetzu/konjaku#221。⚠ Issue の「状態の区別」）。
//   ⚠ **どれも「その場所が存在しない」ではない。**⚠ そう読ませない。
//
//   ok      座標が読めた                        → その場所を深掘りする
//   none    ⚠ **座標の指定が無い**              → ⚠ 利用者は場所を選んでいない
//   bad     ⚠ **指定はあったが、読み取れない**  → ⚠ 共有元と別のものを見ることになる
//
// ⚠ **`none` と `bad` を混ぜない。**⚠ 言うことが変わる
//   （⚠ 何も指定していない人に「読み取れませんでした」と言うのは嘘）。
(function (g) {
  "use strict";

  // ⚠ **形の判定は、いままで `/peel` が持っていたものと同じ。**⚠ 変えていない。
  //   ⚠ 緩めると、⚠ 読めない座標で地図を初期化して別の場所が出る。
  const SHAPE = /^-?[\d.]+,-?[\d.]+$/;

  // ⚠ **地球の上の点か。**⚠ **読む側と書く側で同じ判定を使う**（下の `placeQuery`）。
  //   ⚠ 別々に持つと、⚠ **書けるのに読み戻せない URL** が作れてしまう。
  const isPoint = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  // ⚠ **座標の桁は、ここ 1 か所**（2026-08-23）。
  //   ⚠ 以前は `toFixed(5)` が **4 か所**に書いてあった（トップ 3・`/peel` 1）。
  //   ⚠ `land.js` の控えの鍵も「URL と同じ粒度」を前提にしている（`land.js` の `key`）。
  //     ⚠ **ここを動かすなら、あちらも一緒に見る。**
  const DIGITS = 5;

  // ⚠ 受け取るのは `URLSearchParams` でも、⚠ ただの入れ物でもよい。
  //   ⚠ **検査がブラウザ抜きで回せるように、⚠ `get` があれば足りる形にする。**
  const pick = (sp, k) => (typeof sp?.get === "function" ? sp.get(k) : (sp?.[k] ?? null));

  // ⚠ 返すのは Domain（掟: Domain に文言を持たせない）。⚠ 字は `words.js`。
  const readPlace = (sp) => {
    const ll = pick(sp, "ll");
    const q = pick(sp, "q");
    // ⚠ **空文字は「指定が無い」**（⚠ `?ll=` は形が違うのではなく、書かれていないのと同じ）
    if (ll === null || ll === "") return { state: "none", q: q || null };
    if (!SHAPE.test(ll)) return { state: "bad", q: q || null };
    const [lat, lon] = ll.split(",").map(Number);
    // ⚠ **数として読めない・地球の外は `bad`**（⚠ `1e999,0` は SHAPE を通るが数にならない）
    if (!isPoint(lat, lon)) return { state: "bad", q: q || null };
    return { state: "ok", lat, lon, q: q || null };
  };

  // ⚠ **戻り先のトップの URL を組む**（hidetzu/konjaku#221）。
  //   ⚠ **`q` を落とさない。**⚠ 落とすと、⚠ 利用者が入れた地名まで消える
  //     （⚠ トップは `?q=` を受け取って探せる）。
  //   ⚠ **`era` も落とさない。**⚠ Issue の AC 2 は「黙って別の年代に差し替わらない」。
  //     ⚠ **持って行けば、⚠ 少なくとも消えたことが URL から分かる。**
  //   ⚠ **`b`（建物）は持って行かない。**⚠ トップに建物を選ぶ画面が無い（ADR 0026）。
  // ⚠ **何も指定されていないときは、⚠ 黙って返す**（Owner 判断 2026-08-23）。
  //   ⚠ **利用者は何も指定していないので、⚠ 説明することが無い。**⚠ 断ると余計。
  //   ⚠ **何か 1 つでも指定があれば言う**（⚠ 壊れた URL を共有された人には、⚠ 理由が要る）。
  //   ⚠ **`b`（建物）だけの URL も「指定はあった」に数える**（⚠ 共有の壊れ方の 1 つ）。
  const ASKED = ["q", "ll", "era", "b"];
  const wasAsked = (sp) => ASKED.some((k) => {
    const v = pick(sp, k);
    return v !== null && v !== "";
  });

  const topUrlFor = (sp, state) => {
    const out = new URLSearchParams();
    const q = pick(sp, "q"), era = pick(sp, "era");
    if (q) out.set("q", q);
    if (era) out.set("era", era);
    if (wasAsked(sp)) out.set("noplace", state);
    const rest = out.toString();
    return rest ? "./?" + rest : "./";
  };

  // ⚠ **URL を組むのは、⚠ ここ 1 か所**（掟: 同じ問いに答える実装を 2 つ持たない）。
  //   ⚠ **`readPlace` と対をなす。**⚠ **書いたものが、⚠ そのまま読み戻せること**を
  //     検査が往復で見る（`check.mjs` の「場所の指定の読み書きは 1 か所」）。
  //
  // ⚠ **実測（2026-08-23・`main` = `384e4ef`）: ⚠ 組み立てが 4 か所にあった。**
  //
  //   `index.html` の `syncUrl`    いま見ている場所（トップ）
  //   `index.html` の `eraParam`   ⚠ `&era=` だけの断片
  //   `index.html` の `peelLens`   トップ → `/peel` の導線
  //   `peel3d.js`  の `syncUrl`    `/peel`（⚠ 建物 `b` が付く）
  //
  // ⚠ **座標が読めないときは `null` を返す。**⚠ **`NaN` を載せた URL を作らない。**
  //   ⚠ 呼ぶ側は「書かない」を選べる（⚠ 黙って既定の場所を書き込まない）。
  //
  // ⚠ **`b`（建物）は渡されたときだけ載る。**⚠ トップは建物という概念を持たない（ADR 0026）。
  const placeQuery = ({ title, lat, lon, era, bld } = {}) => {
    const la = Number(lat), lo = Number(lon);
    if (!isPoint(la, lo)) return null;
    const enc = encodeURIComponent;
    // ⚠ **並びは `lat,lon`。**⚠ `readPlace` が読む順と同じ（⚠ 逆にすると別の場所になる）。
    let out = `?q=${enc(title ?? "")}&ll=${la.toFixed(DIGITS)},${lo.toFixed(DIGITS)}`;
    // ⚠ **年代は足すだけ。**⚠ 必須にしない（⚠ `q` と `ll` しか無い古い URL も開ける）。
    if (era) out += `&era=${enc(era)}`;
    if (bld) out += `&b=${enc(bld)}`;
    return out;
  };

  g.KonjakuPlaceArg = { readPlace, topUrlFor, wasAsked, placeQuery };
})(typeof window === "undefined" ? globalThis : window);
