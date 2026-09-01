// 今昔 — ⚠ **本番（`public/`）が配っているものを見る。**
//
// ⚠ **2026-09-01 に、⚠ v0.1.0 を本番へ上げた**（`docs/adr/0080`）。
//   ⚠ **それまでは `public/` を見ていた**（⚠ β 版と混ざっていないことを見る検査だった）。
//   ⚠ **β 版が消え、⚠ 器が 1 つになったので、⚠ 境界を見る節は落とした**:
//     ⚠ ① 別の Worker として立っているか      ← ⚠ Worker は 1 つになった
//     ⚠ ② β 版のファイルを引き込んでいないか  ← ⚠ 引き込む相手が無い
//     ⚠ ③ 中身が無いとき β 版へ戻れるか        ← ⚠ 戻る先が無い
//     ⚠ ⑤ 運んだファイルが β 版とずれていないか ← ⚠ 突き合わせる相手が無い
//   ⚠ **番号は詰めない。**⚠ **落とした番号を再利用しない**（⚠ 過去の記録が別のものを指す）。
//
// ⚠ **ここが見るのは、⚠ 利用者に届くもの。**⚠ **作りの好みは見ない。**

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, ok, bad, head, HEAD_COMMENT, BLOCK_COMMENT, parseColor, contrast } from "./lib.mjs";

head("本番が配っているもの");

const NEXT = join(ROOT, "public");
if (!existsSync(NEXT)) bad("public/ が無い（⚠ 本番が配る先）");
else {

  // ⚠ **配っているものを、⚠ 1 本ずつ数える。**⚠ **拡張子で絞らない**（⚠ `_headers` も配信物）。
  //   ⚠ **前は「β 版のファイルを引き込んでいないか」の節が作っていた。**
  //   ⚠ **その節は落としたが、⚠ この一覧は下の節が使う。**
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d)) {
    const q = join(d, e);
    statSync(q).isDirectory() ? walk(q) : files.push(q); } };
  walk(NEXT);

  // ---- ⚠ ④ 配信物に、⚠ こちらの作業メモを載せていないか ----
  // ⚠ **2026-08-28 に実際に出した。**⚠ **HTML のコメントは、⚠ そのまま配信される。**
  //   ⚠ **`dev.konjaku.hidetzu.work` を開いたら、⚠ ADR の番号と、
  //   ⚠ 中で何を迷っているかが、⚠ 誰でも読める状態だった。**
  // ⚠ **ADR 自体は公開リポジトリにあるので秘密ではない。**
  //   ⚠ **問題は、⚠ 配信物にこちらの作業メモを載せていること**（`CLAUDE.md` §8-1 の筋）。
  // ⚠ **なぜそう書いたかは、⚠ `public/README.md` か ADR に置く。**
  const 作業メモの印 = /docs\/adr\/|Owner 判断|⚠ \*\*まだ何も決まっていない|CLAUDE\.md|\.claude\//;
  const 漏れ = [];
  for (const f of files) {
    if (!/\.(html|js|css)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    // ⚠ **コメントの中だけを見る**（⚠ 本文に出す語とは別の話）
    for (const m of src.matchAll(/<!--([\s\S]*?)-->/g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（HTML コメント）`);
    for (const m of src.matchAll(/\/\*([\s\S]*?)\*\//g))
      if (作業メモの印.test(m[1])) 漏れ.push(`${relative(ROOT, f)}（ブロックコメント）`);
  }
  [...new Set(漏れ)].length
    ? bad(`v0.1.0 の配信物に、こちらの作業メモが載っている: ${[...new Set(漏れ)].join(" ／ ")}（⚠ 理由は public/README.md か ADR に置く）`)
    : ok("v0.1.0 の配信物に、こちらの作業メモが載っていない");


  // ---- ⚠ ⑥ 出典明示が、⚠ 配信物に在るか ----
  // ⚠ **地理院タイルは、⚠ 出典明示が利用の条件**（`public/peel.html` にも同じことが書いてある）。
  // ⚠ **v0.1.0 は地図を手で組んでいるので、⚠ MapLibre の帰属表示が付いてこない。**
  //   ⚠ **2026-08-29 に、⚠ 出典が 1 つも出ていない状態で `develop` に入っていた。**
  //
  // ⚠ **ここが言えるのは「配信物に書かれている」まで。**
  //   ⚠ **「画面に見えている」は、⚠ 実描画が見ている**（`test/render/next.mjs`。2026-08-29 に足した）。
  //   ⚠ **こちらは、⚠ 実描画が回らない変更でも落ちる**（⚠ 文書だけを触ったときなど）。
  //   ⚠ **2 つで違うことを言っている。**⚠ **どちらも要る。**
  const 出典の先 = "maps.gsi.go.jp/development/ichiran.html";
  const 出典の字 = "国土地理院";
  const 出典あり = files.filter((f) => f.endsWith(".html")).filter((f) => {
    const t = readFileSync(f, "utf8");
    // ⚠ **リンクと字の両方を求める。**⚠ **URL だけだと、⚠ 何の出典か読めない。**
    return t.includes(出典の先) && t.includes(出典の字);
  });
  出典あり.length
    ? ok(`v0.1.0 の配信物に、地理院タイルの出典明示が書かれている（⚠ ${出典あり.length} ファイル。⚠ 見えていることは実描画が見ている）`)
    : bad(`v0.1.0 の配信物に、地理院タイルの出典明示が無い（⚠ 出典明示は利用の条件。⚠ ${出典の先} へのリンクと「${出典の字}」の字を、⚠ 覆われない場所に置く）`);

  // ---- ⚠ ⑦ 「言えないとき」の字を、⚠ 2 か所で使い回していないか ----
  // ⚠ **出典が違えば、⚠ 言えない理由も違う**（2026-08-29。Owner 判断）。
  //   ⚠ **足元と明治期が、⚠ どちらも「この場所は、まだ分類されていません」だった。**
  //   ⚠ **「なぜそう言える？」を開くと、⚠ 同じ文が 2 行並ぶ。**
  //
  // ⚠ **実描画では確かめられない**（2026-08-29 に踏んだ）。
  //   ⚠ **足元が「言えないとき」の字になるのは、⚠ 区分が無い場所だけ**で、
  //   ⚠ **ふつうの地点では、⚠ 比べる相手が答えの文になる**（⚠ 必ず違うので素通りする）。
  //   ⚠ **字そのものを見るほうが強い。**
  {
    const top = readFileSync(join(NEXT, "top.js"), "utf8");
    // ⚠ **「言えないとき」の字は 2 つの形で書かれている。**⚠ 両方を拾う
    const 字 = [
      ...[...top.matchAll(/<span class="none">([^<]+)<\/span>/g)].map((m) => m[1]),
      ...[...top.matchAll(/glossEl\.textContent\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
    ].filter((t) => !/\$\{/.test(t));   // ⚠ 差し込みのあるものは、⚠ 中身が場所ごとに変わる
    const 数 = new Map();
    for (const t of 字) 数.set(t, (数.get(t) ?? 0) + 1);
    const 重なり = [...数].filter(([, n]) => n > 1).map(([t]) => t);
    重なり.length
      ? bad(`v0.1.0 が、⚠ 「言えないとき」の字を 2 か所で使い回している: ${重なり.map((t) => `「${t}」`).join(" ／ ")}（⚠ 出典が違えば理由も違う。⚠ 同じ文が 2 行並ぶ）`)
      : ok(`v0.1.0 の「言えないとき」の字は、⚠ どれも 1 か所だけ（⚠ ${字.length} 通り）`);
  }

  // ---- ⚠ ⑧ 広い幅で、⚠ JavaScript が幅を見ていないか ----
  // ⚠ **一度、⚠ CSS と JavaScript の両方に切り替え点を書いた**（2026-08-29。⚠ 3 列にしたとき）。
  //   ⚠ **一覧を出したままにするか・根拠を開くかが、⚠ JavaScript の持つ状態だったため。**
  //   ⚠ **機械で突き合わせる検査も置いた**（`CLAUDE.md` §3）。
  //
  // ⚠ **3 列をやめた。**⚠ **スマホと同じ形を、⚠ そのまま中央に立てるだけにした。**
  //   ⚠ **JavaScript が幅を知る必要が無くなった。**⚠ **突き合わせるものが無くなった。**
  //   ⚠ **だから「同じか」ではなく「持たないか」を見る。**
  //   ⚠ **持たせると、⚠ また 2 か所に同じ数が生まれる。**
  {
    const js = readFileSync(join(NEXT, "top.js"), "utf8");
    const 幅 = [...js.matchAll(/matchMedia\(\s*"\(m(?:in|ax)-width:\s*(\d+)px\)"\s*\)/g)]
      .map((m) => m[1]);
    幅.length
      ? bad(`v0.1.0 の JavaScript が幅を見ている（${幅.join("・")}px）。⚠ 見せ方は CSS の 1 か所で決める。⚠ 2 か所に同じ数を持たない`)
      : ok("v0.1.0 の JavaScript は、⚠ 幅を見ていない（⚠ 見せ方は CSS の 1 か所）");
  }

  // ---- ⚠ ⑩ 色は 1 か所か。⚠ どの色みでも読めるか ----
  //
  // ⚠ **2026-08-30 に集めた**（⚠ `public/theme.css`）。⚠ **それまでは誰も測っていなかった。**
  //   ⚠ **`test/check/color.mjs` は `public/css/theme.css` しか読まない。**
  //   ⚠ **v0.1.0 の色は、⚠ コントラストの検査を 1 つも受けていなかった。**
  //   ⚠ **集めた結果、⚠ 3 つが下限を割っていた**（⚠ `--ink-3` 明 3.95 ／ `--line-strong` 明暗 2.1 台）。
  //
  // ⚠ **色の計算は `lib.mjs` が持つ。**⚠ **ここで持ち直さない。**
  {
    const THEME = join(NEXT, "theme.css");
    if (!existsSync(THEME)) bad("public/theme.css が無い（⚠ 色を 1 か所に集める先）");
    else {
      const css = readFileSync(THEME, "utf8").replace(BLOCK_COMMENT, " ");

      // ⚠ **色みごとに、⚠ 名前 → 値の表を作る。**⚠ **明るいが既定、⚠ 暗いは media の中。**
      const 明 = {}, 暗 = {};
      const 拾う = (chunk, into) => {
        for (const m of chunk.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
          const v = m[2].trim();
          if (parseColor(v)) into[m[1]] = v;
        }
      };
      const i = css.indexOf("@media");
      拾う(css.slice(0, i < 0 ? css.length : i), 明);
      Object.assign(暗, 明);
      if (i >= 0) 拾う(css.slice(i), 暗);

      // ⚠ **名前が色みどうしで揃っているか**（⚠ 欠けると、⚠ 前の色みの色がそこだけ残る）。
      //   ⚠ **重ねたあとで数えない。**⚠ **重ねると、⚠ 欠けた名前が明るい色みの値を継いで見えなくなる**
      //   （⚠ 2026-08-30 に実際にそうなった: ⚠ 暗い色みの `--line` を消しても素通りした）。
      //   ⚠ **だから、⚠ それぞれの節が「自分で宣言した名前」を数える。**
      const 宣言 = {};
      拾う(css.slice(0, i < 0 ? css.length : i), 宣言);   // ⚠ 明るい色みの宣言（＝ 明 と同じ）
      const 暗の宣言 = {};
      if (i >= 0) 拾う(css.slice(i), 暗の宣言);
      const 欠け = Object.keys(宣言).filter((k) => !(k in 暗の宣言));
      欠け.length
        ? bad(`暗い色みで宣言されていない色がある: ${欠け.join(" ")}`
            + "。⚠ **明るい色みの値がそこだけ残る**")
        : ok(`色の名前が 2 つの色みで揃っている（${Object.keys(宣言).length} 個）`);

      // ⚠ **色の値が theme.css の外に無いか**（`.claude/rules/css.md` の MUST）
      //   ⚠ **`mask-image` の中は見ない**（⚠ 色ではなく「隠す／出す」の指定）。
      const 外 = [];
      for (const f of readdirSync(NEXT).filter((f) => f.endsWith(".css") && f !== "theme.css")) {
        const t = readFileSync(join(NEXT, f), "utf8").replace(BLOCK_COMMENT, " ");
        for (const line of t.split("\n")) {
          if (/mask-image|url\(/.test(line)) continue;
          for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) 外.push(`${f}: ${m[0]}`);
        }
      }
      外.length
        ? bad(`色の値が theme.css の外にある: ${外.join(" / ")}`
            + "。⚠ **2 か所に持つと、⚠ 色みを足したとき片方だけ切り替わる**")
        : ok("色の値は theme.css にしかない（⚠ 画面の CSS には 1 つも無い）");

      // ⚠ **読めるか。**⚠ **地は 3 つ**（`--bg` `--surface` `--surface-2`）。
      //   ⚠ **いちばん厳しい地に対して測る。**⚠ **面の上のほうが厳しいことがある**
      //   （⚠ β で実際に踏んでいる: ⚠ 地だけで測ると惜しいだけに見えた）。
      const 地 = ["bg", "surface", "surface-2"];
      const AA = 4.5, 枠 = 3.0;
      const 悪い = [], 名乗り = [];
      for (const [色み, t] of [["明るい", 明], ["暗い", 暗]]) {
        for (const [名, 要る] of [["ink", AA], ["ink-2", AA], ["ink-3", AA], ["line-strong", 枠]]) {
          if (!t[名]) continue;
          const 値 = 地.filter((g) => t[g])
            .map((g) => contrast(parseColor(t[名]), parseColor(t[g])));
          const 最小 = Math.min(...値);
          名乗り.push(`${色み} --${名} ${最小.toFixed(2)}`);
          if (最小 < 要る) 悪い.push(`${色み}の --${名} が ${最小.toFixed(2)}（${要る} 未満）`);
        }
        // ⚠ **押せる色の上の文字は、⚠ 乗る相手に対して測る**（⚠ 地に対して測っても意味がない）
        if (t["action"] && t["action-ink"]) {
          const r = contrast(parseColor(t["action-ink"]), parseColor(t["action"]));
          名乗り.push(`${色み} --action-ink ${r.toFixed(2)}`);
          if (r < AA) 悪い.push(`${色み}の --action-ink が ${r.toFixed(2)}（${AA} 未満・乗る相手は --action）`);
        }
      }
      悪い.length
        ? bad(`v0.1.0 の色が下限に届いていない: ${悪い.join(" ／ ")}`)
        : ok(`v0.1.0 の色は、⚠ 3 つの地すべてで下限を満たす（${名乗り.join(" ／ ")}）`);

      // ⚠ **3 つの画面が theme.css を読んでいるか**（⚠ 読まないと、⚠ 色が 1 つも効かない）
      const 読まない = ["index.html", "take.html", "deep.html"]
        .filter((f) => existsSync(join(NEXT, f)))
        .filter((f) => !/href="\.\/theme\.css"/.test(readFileSync(join(NEXT, f), "utf8")));
      読まない.length
        ? bad(`theme.css を読んでいない画面がある: ${読まない.join(" ")}`)
        : ok("v0.1.0 の 3 つの画面が theme.css を読んでいる");
    }
  }

  // ---- ⚠ ⑪ 画面に、⚠ 誰も出さない部品が残っていないか ----
  //
  // ⚠ **`take.html` に「地図をひらく」が残っていた**（2026-08-31。⚠ 実際に踏んだ）。
  //   ⚠ **`hidden` を外す経路が 1 つも無く、⚠ 画面には一生出ない。**
  //   ⚠ **消し忘れは、⚠ 古いコメントと同じで、⚠ コードより強く誤誘導する**（`CLAUDE.md` §5）。
  //   ⚠ **読む側には「まだ使う予定のもの」に見える。**
  //
  // ⚠ **見るのは `id` だけ。**⚠ **class は見ない**（⚠ 当たっていない規則と区別できない）。
  // ⚠ **コメントは先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 注記の字面を参照に数える）。
  // ⚠ **検査は参照元に数えない。**⚠ **検査しか見ていない `id` は、⚠ 画面では死んでいる。**
  {
    // ⚠ **参照する側**: ⚠ 同じ画面の中（`aria-labelledby` / `for` / `href="#…"`）と、
    //   ⚠ **その器が読む JavaScript・CSS。**
    const コード = readdirSync(NEXT).filter((f) => /\.(js|css)$/.test(f))
      .map((f) => readFileSync(join(NEXT, f), "utf8")
        .replace(BLOCK_COMMENT, "").replace(HEAD_COMMENT, ""))
      .join("\n");

    const 死んでいる = [];
    for (const f of readdirSync(NEXT).filter((f) => f.endsWith(".html"))) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
        const id = m[1];
        const 同じ画面 = src.split(id).length - 1 > 1;   // ⚠ 自分の宣言を 1 つ差し引く
        if (!同じ画面 && !コード.includes(id)) 死んでいる.push(`${f}: #${id}`);
      }
    }
    死んでいる.length
      ? bad(`どこからも参照されていない id が在る: ${死んでいる.join(" / ")}`
          + "。⚠ **出す経路が無いなら消す**（⚠ 残すと「まだ使う」に読める）")
      : ok("v0.1.0 の画面に、⚠ 誰も出さない id は無い");
  }

  // ---- ⚠ ⑫ 名乗りのメニューが、⚠ 画面ごとに割れていないか ----
  //
  // ⚠ **同じ字を 7 枚の HTML に持っている**（⚠ JS から差し込むと、⚠ 落ちたとき案内が消える）。
  //   ⚠ **やむを得ず 2 つ以上持つときは、⚠ 機械で突き合わせる**（`CLAUDE.md` §3）。
  //
  // ⚠ **比べるのは行き先と字だけ。**⚠ **`aria-current` は画面ごとに違ってよい**
  //   （⚠ いま開いている画面を、⚠ 行き先ではなく現在地として見せるため）。
  {
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    const 並び = new Map();
    for (const f of 画面) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const 項目 = [...src.matchAll(/<a class="menu__item" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
        .map((m) => `${m[1]} ${m[2]}`);
      並び.set(f, 項目.join(" ／ "));
    }
    const 中身 = [...new Set([...並び.values()].filter((v) => v))];
    const 無い = [...並び].filter(([, v]) => !v).map(([f]) => f);
    無い.length
      ? bad(`名乗りのメニューが無い画面がある: ${無い.join(" ")}`
          + "。⚠ **どの画面からも案内へ行けること**")
      : 中身.length === 1
        ? ok(`名乗りのメニューは ${画面.length} 枚とも同じ（${中身[0]}）`)
        : bad(`名乗りのメニューが画面ごとに違う: ${[...並び].map(([f, v]) => `${f}=[${v}]`).join(" ／ ")}`);
  }

  // ---- ⚠ ⑬ 埋まっていない差し込みを、⚠ 配っていないか ----
  //
  // ⚠ **利用規約の原稿には `[運営者名]` `[メールアドレス…]` が空いたまま在った**（2026-08-31）。
  //   ⚠ **そのまま配ると、⚠ 画面に角括弧が出る。**⚠ **法的な文書でそれは効かない。**
  // ⚠ **落ちるのが正しい。**⚠ **埋まるまで配らない、を機械で止める。**
  {
    const 空き = [];
    for (const f of readdirSync(NEXT).filter((f) => f.endsWith(".html"))) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      for (const m of src.matchAll(/\[[^\]\n]{2,30}\]/g)) 空き.push(`${f}: ${m[0]}`);
    }
    空き.length
      ? bad(`埋まっていない差し込みが配信物に在る: ${空き.join(" / ")}`
          + "。⚠ **埋めるまで配らない**")
      : ok("v0.1.0 の画面に、⚠ 埋まっていない差し込みは無い");
  }

  // ---- ⚠ ⑭ 広い幅の行き先が、⚠ 画面ごとに割れていないか ----
  //
  // ⚠ **⑫ と同じ形。**⚠ **同じ字を 7 枚の HTML に持っている。**
  //   ⚠ **やむを得ず 2 つ以上持つときは、⚠ 機械で突き合わせる**（掟 §3）。
  //
  // ⚠ **狭い幅の帯（`.tabs`）とは字が違ってよい**（⚠ 置ける幅が違う）。
  //   ⚠ **見るのは「7 枚のあいだで割れていないか」だけ。**
  {
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    const 並び = new Map();
    for (const f of 画面) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const 項目 = [...src.matchAll(/<a class="brand__link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
        .map((m) => `${m[1]} ${m[2]}`);
      並び.set(f, 項目.join(" ／ "));
    }
    const 中身 = [...new Set([...並び.values()].filter((v) => v))];
    const 無い = [...並び].filter(([, v]) => !v).map(([f]) => f);
    無い.length
      ? bad(`広い幅の行き先が無い画面がある: ${無い.join(" ")}`
          + "。⚠ **広い幅では、⚠ 画面の下の帯を出さない**（⚠ 行き先がどこにも無くなる）")
      : 中身.length === 1
        ? ok(`広い幅の行き先は ${画面.length} 枚とも同じ（${中身[0]}）`)
        : bad(`広い幅の行き先が画面ごとに違う: ${[...並び].map(([f, v]) => `${f}=[${v}]`).join(" ／ ")}`);
  }

  // ---- ⚠ ⑮ どの画面からも、⚠ サイトの案内へ行けるか ----
  //
  // ⚠ **案内は、⚠ どの幅・どの画面でも、⚠ 帯のメニューが持つ**（2026-09-01。⚠ Owner 指示）。
  //   ⚠ **一度、⚠ 広い幅の読み物ではメニューを畳んでページの下に任せた。**
  //   ⚠ **画面によって帯の形が変わるのをやめた。**⚠ **メニューは常に出す。**
  //
  // ⚠ **ページの下は、⚠ 読み終えたところに置く案内。**⚠ **持つなら、⚠ メニューと同じ行き先。**
  //   ⚠ **片方にだけ足すと、⚠ どちらが正かが分からなくなる**（⚠ 同じ問いに答えるものが 2 つ）。
  //
  // ⚠ **地図の画面だけは、⚠ ページの下を持たない**（⚠ 画面いっぱいが地図で、置く場所が無い）。
  //   ⚠ **「持っていない画面が本当に地図の画面か」まで見る。**
  //   ⚠ **見分けるのは `id="map"`**（⚠ 検査のためだけの目印を画面に足さない）。
  {
    const 欠け = [];
    for (const f of readdirSync(NEXT).filter((x) => x.endsWith(".html"))) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const 案内 = [...src.matchAll(/<a class="menu__item" href="([^"]+)"/g)].map((m) => m[1]);
      const 下 = [...src.matchAll(/<a class="foot__link" href="([^"]+)"/g)].map((m) => m[1]);
      if (!案内.length) { 欠け.push(`${f}: 帯のメニューが無い`); continue; }
      if (!下.length) {
        // ⚠ **持たなくてよいのは地図の画面だけ**
        if (!/\sid="map"/.test(src)) 欠け.push(`${f}: ページの下の案内が無い（⚠ 地図の画面ではない）`);
        continue;
      }
      const 足りない = 案内.filter((h) => !下.includes(h));
      const 余り = 下.filter((h) => !案内.includes(h));
      if (足りない.length) 欠け.push(`${f}: ページの下に ${足りない.join(" ")} が無い`);
      if (余り.length) 欠け.push(`${f}: ページの下にだけ ${余り.join(" ")} が在る`);
    }
    欠け.length
      ? bad(`サイトの案内が画面ごとに食い違っている: ${欠け.join(" ／ ")}`
          + "。⚠ **案内は帯のメニューが持つ。**⚠ **ページの下を持つなら、⚠ 同じ行き先をそろえる**")
      : ok("v0.1.0 は、⚠ どの画面からもサイトの案内へ行ける"
          + "（⚠ 帯のメニューは全画面 ／ ⚠ ページの下は同じ行き先。⚠ 地図の画面は下を持たない）");
  }

  // ---- ⚠ ⑨ 見出しは「問いへの近さ」順で決まっているか ----
  // ⚠ **2026-08-31。Owner 判断。**⚠ **前は「確実性の高い順」だった**（`docs/adr/0030`）。
  //   ⚠ **常に取れる地形分類が見出しで、⚠ 明治期はその下の小さい行**だった。
  //   ⚠ **実測（2026-08-30・利用者役 5 名中 3 名。⚠ 実在の利用者ではない）**:
  //     ⚠ **春日部と軽井沢で「これは昔の答えではない」と読まれた。**
  //     ⚠ **春日部は「明治期は 田」を既に出していた。**⚠ **見出しでなかっただけ。**
  //
  // ⚠ **ブラウザを立てずに見る**（`public/answer.js` は DOM も地図も持たない）。
  //   ⚠ **実描画は「画面にそう出ているか」を見る。**⚠ **ここは「規則そのもの」を見る。**
  {
    const win = {};
    for (const f of ["words.js", "answer.js"]) {
      if (!existsSync(join(NEXT, f))) { bad(`v0.1.0 に ${f} が無い（⚠ この検査が何も見ていない）`); break; }
      new Function("window", "module", readFileSync(join(NEXT, f), "utf8"))(win, undefined);
    }
    const A = win.KonjakuAnswer, W = win.KonjakuWords;
    if (!A?.lines || !W?.groundGloss) {
      bad("KonjakuAnswer.lines か KonjakuWords.groundGloss を読めていない（⚠ この検査が何も見ていない）");
    } else {
      const fails = [];

      // ⚠ **① 明治期に区分があれば、⚠ それが見出し。**
      //   ⚠ **ここが残 3 の本体。**⚠ **春日部は答えを持っていたのに、⚠ 見出しでなかった。**
      const 春日部 = A.lines({ terrain: "氾濫平野・海岸平野", meiji: { value: "田" } });
      if (!/^ここは 田 でした$/.test(春日部.head))
        fails.push(`明治期の区分が見出しになっていない: ${春日部.head}`);
      if (春日部.head.startsWith("ここは、"))
        fails.push("明治期があるのに、⚠ 地形分類の言い方に戻っている（⚠ 確実性の順に逆戻り）");
      if (!春日部.sub.includes(W.groundGloss("氾濫平野・海岸平野")))
        fails.push(`成り立ちが 2 行目に降りていない: ${春日部.sub}`);

      // ⚠ **①-2 見出しは、⚠ どの出典の話かを名乗る**（2026-08-31。Owner 指示）。
      //   ⚠ **名乗らないと、⚠ 見出しと 2 行目が「同じことの繰り返し」に読まれた**
      //     （⚠ 利用者役 5 名中 3 名。⚠ 実在の利用者ではない）。
      //   ⚠ **2 つの資料が独立に同じことを言っているのが価値**（`docs/adr/0004`）。
      //   ⚠ **ラベルの語は「なぜそう言える？」の行の見出しと同じ**（⚠ 言葉は 1 か所から借りる）。
      if (春日部.label !== A.SOURCE.meiji)
        fails.push(`明治期の答えなのに、出典を名乗っていない: ${JSON.stringify(春日部.label)}`);
      if (春日部.head.includes(A.SOURCE.meiji))
        fails.push(`見出しが出典名を抱えている（⚠ ラベルと二重）: ${春日部.head}`);
      // ⚠ **2 行目は、⚠ 自分の出典を字の中に持つ**（⚠ だからラベルを付けない）
      if (!春日部.sub.startsWith(A.SOURCE.terrain))
        fails.push(`2 行目が出典を名乗っていない: ${春日部.sub}`);

      // ⚠ **② 明治期が無くても、⚠ 地形分類が昔を名指すなら、⚠ それを見出しに使う。**
      //   ⚠ **2 行目に同じことを重ねない。**⚠ **ラベルは地形分類のほうを名乗る。**
      for (const 区分 of A.PAST_IN_TERRAIN) {
        const r = A.lines({ terrain: 区分, meiji: { none: "absent" } });
        if (r.head !== `ここは、${W.groundGloss(区分)}`)
          fails.push(`${区分}: 地形分類が昔を名指しているのに、見出しに使っていない: ${r.head}`);
        if (r.sub !== "") fails.push(`${区分}: 見出しと同じことを 2 行目でも言っている: ${r.sub}`);
        if (r.label !== A.SOURCE.terrain)
          fails.push(`${区分}: 見出しは地形分類なのに、⚠ 明治期の出典を名乗っている: ${r.label}`);
      }

      // ⚠ **③ 昔の根拠が無いときは、⚠ なぜ無いかを状態ごとに言い分ける**（`docs/adr/0056`）。
      //   ⚠ **1 文にまとめない**（2026-08-31。Owner 判断）。⚠ 「取れなかった」と「無い」は別のこと。
      const 状態 = ["absent", "noClass", "unreachable"];
      const 出た = 状態.map((none) => A.lines({ terrain: "低地", meiji: { none } }).head);
      for (const [i, none] of 状態.entries()) {
        if (出た[i] !== A.MEIJI_NONE[none])
          fails.push(`${none}: MEIJI_NONE の字を使っていない: ${出た[i]}`);
        if (!出た[i]) fails.push(`${none}: 見出しが空（⚠ 何も言わないと、⚠ 何も起きていないように見える）`);
      }
      if (new Set(出た).size !== 状態.length)
        fails.push(`3 つの状態が同じ字になっている: ${出た.join(" ／ ")}`);
      // ⚠ **無いときも、⚠ 出典を名乗る。**⚠ **主語はラベルが引き受ける**ので、
      //   ⚠ 字の中で「明治期の」を繰り返さない（2026-08-31。Owner 指示）。
      for (const none of 状態) {
        const r = A.lines({ terrain: "低地", meiji: { none } });
        if (r.label !== A.SOURCE.meiji)
          fails.push(`${none}: 何の資料の話か名乗っていない: ${JSON.stringify(r.label)}`);
        if (r.head.includes(A.SOURCE.meiji))
          fails.push(`${none}: 見出しが出典名を抱えている（⚠ ラベルと二重）: ${r.head}`);
        // ⚠ **無いことも、⚠ 分かることを消さない**（`CLAUDE.md` §4-1）。⚠ 2 行目が引き受ける。
        if (!r.sub) fails.push(`${none}: 無いと言うだけで、⚠ 分かることを出していない`);
      }
      // ⚠ **否定された動作で言わない**（2026-08-31。Owner 指示）。
      //   ⚠ **「作られていません」は「まだ作っていない」「壊れている」に読まれた**
      //     （⚠ 利用者役 5 名中 2 名が「アプリが壊れているか、自分の通信のせいかと思った」）。
      //   ⚠ **限界は消していない。**⚠ 資料が どこを対象にしているか の事実として言う。
      if (/作られていません|ありません$/.test(A.MEIJI_NONE.absent))
        fails.push(`資料そのものが無いことを、⚠ 否定された動作で言っている: ${A.MEIJI_NONE.absent}`);

      // ⚠ **④ 昔を名指す区分の綴りが、⚠ 原典とずれていないか。**
      //   ⚠ **ずれると、⚠ 黙って ② が効かなくなる**（⚠ 一致しないだけなので、⚠ 誰も落ちない）。
      const 原典 = JSON.parse(readFileSync(join(NEXT, "data/landform.json"), "utf8")).classes ?? {};
      const 無い = A.PAST_IN_TERRAIN.filter((n) => !(n in 原典));
      if (無い.length) fails.push(`landform.json に無い区分名を見ている: ${無い.join("、")}`);

      // ⚠ **⑤ `top.js` が字を書いていないこと。**⚠ **3 状態すべてを `answer.js` から引く。**
      const TOP = readFileSync(join(NEXT, "top.js"), "utf8");
      for (const 字 of [...Object.values(A.MEIJI_NONE), ...Object.values(A.SOURCE)])
        if (TOP.includes(字)) fails.push(`top.js が answer.js の字を書き写している: ${字}`);
      for (const none of 状態)
        if (!TOP.includes(`"${none}"`)) fails.push(`top.js が ${none} の状態を作っていない`);
      // ⚠ **深掘り画面も、⚠ 同じ規則で見出しを決める**（2026-08-31。Owner 指示）。
      //   ⚠ **同じ場所で、⚠ トップは「ここは 田 でした」、⚠ 深掘りは「ここは、川や海が…」だった。**
      //   ⚠ **2 つの画面が、⚠ 別の答えを見出しにしていた。**
      const DEEP = readFileSync(join(NEXT, "deep.js"), "utf8");
      if (!/KonjakuAnswer\.lines\(/.test(DEEP))
        fails.push("deep.js が answer.js の規則を通っていない（⚠ トップと別の見出しになる）");
      if (!/glossSrcEl\.textContent\s*=\s*label/.test(DEEP))
        fails.push("deep.js が出典ラベルを描いていない");
      // ⚠ **「言えないとき」の字を、⚠ 自前で持たない。**
      //   ⚠ **2026-08-31 に踏んだ**: ⚠ **トップだけ言い直したら、⚠ deep.js が古い字のまま残った。**
      for (const 字 of Object.values(A.MEIJI_NONE))
        if (DEEP.includes(字)) fails.push(`deep.js が answer.js の字を書き写している: ${字}`);
      if (/この地域では、この資料が作られていません|この場所には区分がありません/.test(DEEP))
        fails.push("deep.js が「言えないとき」の字を自前で持っている（⚠ 片方だけ古くなる）");
      if (!readFileSync(join(NEXT, "deep.html"), "utf8").includes('id="glossSrc"'))
        fails.push("deep.html に出典ラベルの置き場が無い");

      // ⚠ **ラベルを画面へ出しているか**（⚠ 返しても描かなければ、⚠ 何も変わらない）。
      //   ⚠ **語の有無で見てはいけない**（2026-08-31 に踏んだ）。⚠ **`glossSrcEl` は
      //     宣言と後始末にも出るので、⚠ 描く行だけ消しても素通りした。**
      //   ⚠ **代入そのものを見る。**⚠ **画面に出ているかは実描画が見る**（⚠ ここは配線だけ）。
      if (!/glossSrcEl\.textContent\s*=\s*label/.test(TOP))
        fails.push("top.js が、answer.js の返す label を出典ラベルへ入れていない");
      if (!readFileSync(join(NEXT, "index.html"), "utf8").includes('id="glossSrc"'))
        fails.push("index.html に出典ラベルの置き場が無い");

      fails.length
        ? bad(`見出しが「問いへの近さ」順になっていない: ${fails.join(" ／ ")}`)
        : ok(`見出しは「問いへの近さ」順で、⚠ 出典を名乗る`
            + `（⚠ 明治期 → 昔を名指す ${A.PAST_IN_TERRAIN.length} 区分 → 無い理由 ${状態.length} 通り。`
            + `⚠ 字とラベルは answer.js の 1 か所）`);
    }
  }

  // ---- ⚠ ⑭ 利用者からの窓口が、⚠ 押して行き止まりにならないか ----
  //
  // ⚠ **問い合わせフォームは自前で持たない**（2026-08-31。Owner 指示）。
  //   ⚠ **GitHub の Issue Form を窓口にする。**⚠ **公開されることが字で伝わること。**
  // ⚠ **「お問い合わせ」と言わない**（⚠ 非公開のやり取りに読まれる）。
  // ⚠ **押しても何も起きない導線を置かない**（ADR 0026）。⚠ **形が在ることを見る。**
  {
    const 窓口 = join(ROOT, ".github/ISSUE_TEMPLATE/feedback.yml");
    const 欠け = [];
    if (!existsSync(窓口)) {
      欠け.push("利用者向けの Issue Form（.github/ISSUE_TEMPLATE/feedback.yml）が無い");
    } else {
      // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、
      //   ⚠ 検査を説明するコメントに書いた字面を、⚠ 検査自身が拾う**（⚠ 2026-08-31 に踏んだ。
      //   ⚠ 「ready-for-ai を付けない」と書いた注意書きを、⚠ 付けている証拠として数えた）。
      const y = readFileSync(窓口, "utf8").replace(/^\s*#.*$/gm, "");
      // ⚠ **開発自動化のラベルを、⚠ 自動で付けない**（⚠ 付けるのは人だけ）。
      //   ⚠ **見るのは `labels:` の行**（⚠ ファイルのどこかに語が在るか、ではない）。
      const ラベル = y.match(/^labels:\s*(.*)$/m)?.[1]?.trim() ?? "（labels が無い）";
      if (/ready-for-ai/.test(ラベル))
        欠け.push(`利用者向けの窓口が ready-for-ai を自動で付けている: labels: ${ラベル}`);
      // ⚠ **必須と任意が、⚠ 意図どおりか**
      if (!/id:\s*detail[\s\S]*?required:\s*true/.test(y)) 欠け.push("「内容」が必須になっていない");
      if (!/id:\s*kind[\s\S]*?required:\s*true/.test(y)) 欠け.push("「種類」が必須になっていない");
      // ⚠ **公開されること・個人情報を書かないことを、⚠ 字で言っているか**
      if (!/公開/.test(y)) 欠け.push("公開されることを言っていない");
      if (!/メールアドレス|個人情報/.test(y)) 欠け.push("個人情報を書かない注意が無い");
    }
    // ⚠ **画面からの導線。**⚠ **メニューが割れていないかは ⑫ が見る**ので、⚠ ここは行き先と字だけ。
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    const 導線 = 画面.filter((f) =>
      /template=feedback\.yml/.test(readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "")));
    if (導線.length !== 画面.length)
      欠け.push(`窓口への導線が ${導線.length} / ${画面.length} 画面にしか無い`);
    // ⚠ **「お問い合わせ」と言わない。**⚠ **公開されることが、⚠ 導線の字から分かること。**
    for (const f of 導線) {
      const 字 = readFileSync(join(NEXT, f), "utf8")
        .match(/template=feedback\.yml"[^>]*>([^<]+)</)?.[1] ?? "";
      if (/お問い合わせ/.test(字)) 欠け.push(`${f}: 導線が「お問い合わせ」と言っている（⚠ 非公開に読まれる）`);
      if (!/GitHub|公開/.test(字)) 欠け.push(`${f}: 公開の投稿になることが、⚠ 導線の字から分からない: ${字}`);
    }
    欠け.length
      ? bad(`利用者からの窓口が整っていない: ${欠け.join(" ／ ")}`)
      : ok(`利用者からの窓口は Issue Form 1 つ（⚠ 種類と内容が必須・⚠ 公開と個人情報の注意あり・`
          + `⚠ ${導線.length} 画面から行ける・⚠ 開発自動化のラベルは付けない）`);
  }

  // ---- ⚠ ⑮ 近くに残る災害の記録が、⚠ 言えないことを言っていないか ----
  //
  // ⚠ **決めたこと**（2026-08-31。Owner 判断）: ⚠ **自然災害伝承碑は全国に存在するが、
  //   ⚠ 散歩中の現在地点に対して提示できるほど高密度ではなかった。**
  //   ⚠ **だからスマホの 1 画面目には載せず、⚠ PC / Deep の「周辺に残る歴史資料」として扱う。**
  //   ⚠ **実測（分母 15 地点。⚠ 全国の話ではない）**: ⚠ 半径 1000m で **0 / 15**、2000m で 3 / 15。
  //
  // ⚠ **碑があることと、⚠ その地点が被災したことは別。**⚠ **混ぜたら落とす。**
  {
    // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、⚠ 説明コメントに書いた
    //   ⚠ 字面を検査自身が拾う。**⚠ **2026-08-31 に踏んだ**: ⚠ **出典の字を消しても、
    //   ⚠ コメントに「自然災害伝承碑」と書いてあるだけで素通りした。**
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
    const 欠け = [];
    const D = join(NEXT, "data", "monument");
    const 表パス = join(D, "tiles.json");
    if (!existsSync(表パス)) {
      欠け.push("配るタイルの表（data/monument/tiles.json）が無い");
    } else {
      const 表 = JSON.parse(readFileSync(表パス, "utf8"));
      // ⚠ **表に在るタイルは、⚠ 実ファイルとして在ること。**
      //   ⚠ **表に在るのに引けないと、⚠ 「取れなかった」に落ちて、⚠ 碑が黙って消える。**
      const 無い = (表.tiles ?? []).filter((k) => {
        const [x, y] = k.split("/");
        return !existsSync(join(D, String(表.z), x, `${y}.json`))
            || !existsSync(join(D, String(表.z), x, `${y}.detail.json`));
      });
      if (無い.length) 欠け.push(`表に在るのに配っていないタイルが ${無い.length} 枚: ${無い.slice(0, 3).join(" ")}`);
      // ⚠ **配っているのに表に無いと、⚠ 「その範囲に碑は無い」と読まれる。**
      const 表に無い = [];
      for (const x of readdirSync(join(D, String(表.z)))) {
        for (const f of readdirSync(join(D, String(表.z), x))) {
          if (!f.endsWith(".json") || f.endsWith(".detail.json")) continue;
          const k = `${x}/${f.replace(/\.json$/, "")}`;
          if (!(表.tiles ?? []).includes(k)) 表に無い.push(k);
        }
      }
      if (表に無い.length) 欠け.push(`配っているのに表に無いタイルが ${表に無い.length} 枚: ${表に無い.slice(0, 3).join(" ")}`);

      // ⚠ **重さの上限。**⚠ **散歩中には配らないが、⚠ 深掘りで 1 枚引く。**
      //   ⚠ **実測（2026-08-31）**: ⚠ 索引 いちばん重い 1 枚 gz 7KB ／ 詳しく 27KB。
      const { gzipSync } = await import("node:zlib");
      const 上限 = { 索引: 24 * 1024, 詳しく: 64 * 1024 };
      let 重 = { 索引: 0, 詳しく: 0, 索引名: "", 詳しく名: "" };
      for (const x of readdirSync(join(D, String(表.z)))) {
        for (const f of readdirSync(join(D, String(表.z), x))) {
          const gz = gzipSync(readFileSync(join(D, String(表.z), x, f))).length;
          const k = f.endsWith(".detail.json") ? "詳しく" : "索引";
          if (gz > 重[k]) { 重[k] = gz; 重[`${k}名`] = `${x}/${f}`; }
        }
      }
      for (const k of ["索引", "詳しく"])
        if (重[k] > 上限[k])
          欠け.push(`${k}のタイルが重すぎる: ${重[`${k}名`]} が gz ${Math.round(重[k] / 1024)}KB（上限 ${上限[k] / 1024}KB）`);
    }

    // ⚠ **散歩中の画面に出していないこと**（⚠ Owner 判断。⚠ ADR 0063「1 画面目は答えと写真だけ」）。
    const TOP = 素("top.js");
    if (/KonjakuMonument/.test(TOP))
      欠け.push("散歩中の画面（top.js）が伝承碑を引いている（⚠ 深掘りだけと決めてある）");
    if (readFileSync(join(NEXT, "index.html"), "utf8").includes("monument.js"))
      欠け.push("散歩中の画面が monument.js を読み込んでいる（⚠ 深掘りだけと決めてある）");

    // ⚠ **碑があること ≠ 被災したこと。**⚠ **断りを、⚠ 画面が必ず言うこと。**
    const DEEP = 素("deep.js");
    if (!/被災したことは別/.test(DEEP))
      欠け.push("「碑があることと、この場所が被災したことは別」を言っていない");
    // ⚠ **この場所が被災した、と読める言い方をしていないか**（⚠ 掟 §1）。
    for (const 悪 of ["この場所は被災", "ここで被害", "この地点が浸水"])
      if (DEEP.includes(悪)) 欠け.push(`碑を被災の証拠として扱っている: ${悪}`);
    // ⚠ **取り出した年（derived）を画面に出していないこと**（⚠ 検索・並び替え用）。
    if (/derived\.years/.test(DEEP))
      欠け.push("取り出した年（derived.years）を画面に出している（⚠ 検索・並び替え用と決めてある）");
    // ⚠ **出典を名乗ること**（⚠ 地理院の資料を出す条件）。
    if (!/自然災害伝承碑/.test(DEEP)) 欠け.push("出典を名乗っていない");
    // ⚠ **3 状態を言い分けること**（`docs/adr/0056`）。
    const MON = 素("monument.js");
    for (const st of ['"ok"', '"absent"', '"unreachable"'])
      if (!MON.includes(st)) 欠け.push(`monument.js が ${st} を返していない（⚠ 無いと取れないを混ぜている）`);

    欠け.length
      ? bad(`近くに残る災害の記録が整っていない: ${欠け.join(" ／ ")}`)
      : ok("近くに残る災害の記録は、⚠ 深掘りだけ・⚠ 出典つき・⚠ 「碑 ≠ 被災」を言う"
          + "（⚠ 表と実ファイルが一致・⚠ 重さは上限内・⚠ 3 状態を言い分ける）");
  }

  // ---- ⚠ ⑯ 仮想利用者レビューで出た 3 つの読み違いが、⚠ 戻っていないか ----
  //   ⚠ **2026-09-01。**⚠ **利用者役 6 名に画面だけを見せた**（⚠ 実在の利用者ではない）。
  //   ⚠ **直した不具合は検査として残す**（`CLAUDE.md` §2）。
  {
    const 欠け = [];
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
    const DEEP = 素("deep.js");
    // ⚠ **HTML のコメントを先に落とす。**⚠ **落とさないと、⚠ この検査を説明する
    //   コメントの字を、⚠ 検査自身が拾う**（`CLAUDE.md` §5。⚠ 何度も踏んでいる）。
    const HTML = readFileSync(join(NEXT, "deep.html"), "utf8").replace(/<!--[\s\S]*?-->/g, " ");

    // ⚠ 1. ⚠ **資料が無いときの字が、⚠ アプリ全体の話に読まれた**（⚠ 6 名中 3 名）。
    //   ⚠ **「対象」の持ち主が字の中に無かった。**⚠ **主語を字の中で名乗ること。**
    //   ⚠ **借りて見る。**⚠ **字を写すと、⚠ 製品ではなく検査が落ちる。**
    const win = {};
    for (const f of ["words.js", "answer.js"])
      new Function("window", "module", readFileSync(join(NEXT, f), "utf8"))(win, undefined);
    const 三状態 = win.KonjakuAnswer?.MEIJI_NONE ?? {};
    if (Object.keys(三状態).length !== 3)
      欠け.push("KonjakuAnswer.MEIJI_NONE を読めていない（⚠ この検査が何も見ていない）");
    for (const [k, 字] of Object.entries(三状態)) {
      if (!字.includes("この地図"))
        欠け.push(`資料が無いときの字（${k}）が、⚠ 何の話かを名乗っていない: 「${字}」`);
      // ⚠ **アプリ全体の話に読める語を、⚠ 主語なしで置かない。**
      for (const 悪 of ["対象の範囲の外", "対象外", "使えません", "調べられません"])
        if (字.includes(悪)) 欠け.push(`資料が無いときの字（${k}）に、⚠ アプリ全体に読める語がある: ${悪}`);
    }
    // ⚠ **3 つが別の字であること**（`docs/adr/0056`）。⚠ **主語を揃えて 1 つに潰さない。**
    if (new Set(Object.values(三状態)).size !== 3)
      欠け.push("資料が無いときの 3 状態が、⚠ 同じ字になっている（⚠ 無い・区分が無い・読めなかったは別）");

    // ⚠ 2. ⚠ **近くの碑が、⚠ その地点そのものの履歴に読まれた**（⚠ 6 名中 2 名）。
    //   ⚠ **一段分離して、⚠ 重要な情報より下に置くこと。**
    const 位置 = (id) => HTML.indexOf(`id="${id}"`);
    for (const 上 of ["timeSec", "whySec", "nearSec"])
      if (!(位置(上) >= 0 && 位置("monSec") > 位置(上)))
        欠け.push(`近くの碑（monSec）が、⚠ ${上} より上にある（⚠ 重要な情報より下と決めてある）`);
    if (!/<section[^>]*class="[^"]*sec--around[^"]*"[^>]*id="monSec"/.test(HTML))
      欠け.push("近くの碑の節に、⚠ 分離の印（sec--around）が無い");
    if (!/id="monSec"[\s\S]*?class="sec__kind"[\s\S]*?<h2>/.test(HTML))
      欠け.push("近くの碑の節が、⚠ 見出しより先に「まわりの記録である」と断っていない");
    if (!/\.sec--around\{[^}]*border-top/.test(readFileSync(join(NEXT, "deep.css"), "utf8")))
      欠け.push("分離の印（sec--around）に、⚠ 見た目の区切りが無い（⚠ class だけでは分離されない）");

    // ⚠ 3. ⚠ **読んだ資料が、⚠ 生の URL のまま並んでいた。**⚠ **資料名を押す形にすること。**
    //   ⚠ **行き先は変えない**（⚠ 出典へ直接行けることは、⚠ 別の 1 名が挙げた利点）。
    if (/>\$\{esc\(u\)\}</.test(DEEP) || /<a[^>]*>\$\{esc\(u\)\}/.test(DEEP))
      欠け.push("読んだ資料が、⚠ URL そのものを字にしている（⚠ 資料名を出すと決めてある）");
    const 名 = DEEP.match(/リンク\([^,)]+, *"([^"]+)"\)/g) ?? [];
    if (名.length < 4) 欠け.push(`読んだ資料の資料名が ${名.length} 本しかない（⚠ 地形分類 2・明治期・標高で 4 本）`);
    for (const m of 名)
      if (!/国土地理院/.test(m)) 欠け.push(`資料名が出典を名乗っていない: ${m}`);

    欠け.length
      ? bad(`仮想利用者レビューで直したことが戻っている: ${欠け.join(" ／ ")}`)
      : ok("資料が無いときの字は「この地図」を主語に持ち、⚠ 近くの碑は重要な情報より下で分離され、"
          + "⚠ 読んだ資料は資料名を押す形（⚠ 3 状態は別の字のまま）");
  }

  // ---- ⚠ ⑰ PC は保存一覧への道を持たず、⚠ 受け取りの道は残っているか ----
  //   ⚠ **2026-09-01。Owner 判断。**⚠ **「スマホだと読みにくいので、⚠ 別の端末で
  //   読みやすくする」のが目的**なので、⚠ **PC は受け取って深掘りする側にする。**
  //   ⚠ **一覧そのものは消していない**（⚠ URL では開ける）。⚠ **導線を出さないだけ。**
  {
    const 欠け = [];
    const HTML = (f) => readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, " ");
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));

    // ⚠ **広い幅の名乗り（.brand__nav）に、⚠ 保存一覧へのリンクを置かない。**
    //   ⚠ **DOM から引く。**⚠ **CSS で隠す形にしない**（⚠ 読み上げには残ってしまう）。
    for (const f of 画面) {
      const nav = HTML(f).match(/<nav[^>]*class="[^"]*brand__nav[^"]*"[\s\S]*?<\/nav>/);
      if (!nav) continue;
      if (/href="\.\/saved(\.html)?"/.test(nav[0]))
        欠け.push(`${f} の名乗りが、⚠ 保存一覧へのリンクを持っている（⚠ PC には出さないと決めてある）`);
    }

    // ⚠ **狭い幅の帯（.tabs）からは、⚠ 消さない。**⚠ **スマホの入口は 1 本だけ。**
    //   ⚠ **両方消すと、⚠ 保存した場所へ行く道が 1 本も無くなる。**
    for (const f of ["index.html", "saved.html"]) {
      const tabs = HTML(f).match(/<nav[^>]*class="[^"]*tabs[^"]*"[\s\S]*?<\/nav>/);
      if (!tabs || !/href="\.\/saved(\.html)?"/.test(tabs[0]))
        欠け.push(`${f} の帯（スマホ）から、⚠ 保存一覧への入口が消えている`);
    }

    // ⚠ **受け取りの道は残っていること。**⚠ **合言葉が案内する住所は /take。**
    //   ⚠ **ここが切れると、⚠ 「スマホで保存 → PC で読む」が成立しない。**
    if (!existsSync(join(NEXT, "take.html")))
      欠け.push("受け取り口（take.html）が無い");
    // ⚠ **本文全体に `/take` が在るか、では見ない**（⚠ 実際に素通りした）。
    //   ⚠ **住所を組み立てているところが 2 か所ある**（⚠ リンクで渡す道と、⚠ 合言葉で見せる住所）。
    //   ⚠ **片方だけ壊しても、⚠ もう片方の字を拾って通ってしまった**（`CLAUDE.md` §9）。
    //   ⚠ **組み立てているところを全部取り出して、⚠ 1 つずつ見る。**
    const 住所 = [...素("saved-page.js").matchAll(/\$\{location\.(?:origin|host)\}(\/[\w-]*)/g)]
      .map((m) => m[1]);
    if (住所.length < 2)
      欠け.push(`受け取り口の住所を組み立てているところが ${住所.length} か所しかない（⚠ リンクと合言葉で 2 か所）`);
    for (const 道 of 住所)
      if (道 !== "/take")
        欠け.push(`合言葉が案内する住所が /take でない: ${道}（⚠ PC 側の受け取り口が分からなくなる）`);
    // ⚠ **受け取ったら一覧へ進むこと**（⚠ PC はここでしか一覧へ入れない）。
    if (!/location\.replace\(`\.\/saved/.test(素("take.js")))
      欠け.push("受け取ったあと、⚠ 一覧へ進んでいない（⚠ PC は導線を持たないので、⚠ ここが唯一の入口）");

    欠け.length
      ? bad(`PC の入口の整理が壊れている: ${欠け.join(" ／ ")}`)
      : ok("PC の名乗りは保存一覧への道を持たず、⚠ スマホの帯は持ち、"
          + "⚠ 受け取りの道（/take → ./saved）は残っている");
  }


  // ---- ⚠ ⑱ バージョンは 1 か所だけが出し、⚠ 「作りかけ」と言わないか ----
  //   ⚠ **2026-09-01。Owner 指示。**⚠ **前は about / privacy / terms の 3 枚と、
  //   ⚠ 全 7 画面の `<title>` に出ていた。**
  //
  //   ⚠ **「（作りかけ）」は、⚠ 出している答えの信用を下げていた。**
  //   ⚠ **実測（2026-08-29。⚠ 利用者役 3 名。⚠ 実在の利用者ではない）**: ⚠ **3 名が全員、
  //   ⚠ 同じ形の断りを問題にした**（⚠ 上の ③ に、⚠ そのときの言葉が残っている）。
  //   ⚠ **限界を消したのではない。**⚠ **何が言えて何が言えないかは、⚠ 各画面が言う**（掟 §1）。
  {
    const 欠け = [];
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    // ⚠ **`_headers` は配信されない**（⚠ Cloudflare の設定）。⚠ **それでも同じ語を置かない。**
    //   ⚠ **1 か所でも残ると、⚠ 次に触る人が「まだ作りかけなんだ」と読む。**
    //   ⚠ **`data/` は取り込んだ JSON**（⚠ 出典の字がそのまま入る）。⚠ **ここでは見ない。**
    const 配るもの = [];
    const 集める = (d) => { for (const e of readdirSync(d)) {
      if (e === "data") continue;
      const q = join(d, e);
      statSync(q).isDirectory() ? 集める(q) : 配るもの.push(q); } };
    集める(NEXT);

    // ⚠ **「作りかけ」は、⚠ 配るもの全部から探す**（2026-09-01。⚠ Owner の指摘で直した）。
    //   ⚠ **前は `*.html` だけを、⚠ コメントを落としてから見ていた。**⚠ **2 つ漏れていた。**
    //     ⚠ **`robots.txt`** — ⚠ **配信される。**⚠ **誰でも取得できる。**
    //     ⚠ **`about.html` の HTML コメント** — ⚠ **コメントも配信物。**
    //       ⚠ **この決めごとを説明する字が、⚠ 消したはずの語を配っていた。**
    //   ⚠ **だからここではコメントを落とさない。**⚠ **落とすと、⚠ 同じ穴がもう一度開く。**
    //   ⚠ **経緯は配信物に書かない**（⚠ `docs/adr/0079`）。⚠ **書くとこの検査が落ちる。**
    for (const f of 配るもの) {
      if (/作りかけ/.test(readFileSync(f, "utf8")))
        欠け.push(`${relative(NEXT, f)} が「作りかけ」と言っている（⚠ 答えの信用を下げる）`);
    }

    // ⚠ **版の数は、⚠ 利用者に見える字だけを見る。**⚠ **ここはコメントを落とす。**
    //   ⚠ **落とさないと、⚠ 上のコメントに書いた `v0.1.0` を、⚠ 検査自身が拾う**（`CLAUDE.md` §5）。
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, " ");
    const 出している = [];
    for (const f of 画面)
      for (const m of 素(f).matchAll(/v\d+\.\d+\.\d+/g)) 出している.push(`${f}:${m[0]}`);
    if (出している.length !== 1)
      欠け.push(`バージョンを出している画面が ${出している.length} か所ある: ${出している.join(" ")}`
        + "（⚠ 1 か所に寄せると決めてある）");
    // ⚠ **その 1 か所は、⚠ 規約系のページ**（⚠ 地図の画面には出さない）。
    else if (!/^(about|privacy|terms)\.html:/.test(出している[0]))
      欠け.push(`バージョンが規約系のページに無い: ${出している[0]}`);

    欠け.length
      ? bad(`バージョン表記が散らばっている: ${欠け.join(" ／ ")}`)
      : ok(`バージョンは ${出している[0]} の 1 か所だけが出し、⚠ どの画面も「作りかけ」と言わない`);
  }


  // ---- ⚠ ⑲ プライバシーポリシーが、⚠ 先に要点を渡しているか ----
  //   ⚠ **2026-09-01。Owner 指示。**⚠ **法務文書ではなく、⚠ 30 秒で分かる形にする。**
  //   ⚠ **事実は減らしていない。**⚠ **順番と言葉を変えただけ**（掟 §4-1）。
  //   ⚠ **「ここに書いていないことは、していません」の姿勢は残す**（⚠ Owner 指示）。
  {
    const 欠け = [];
    const 生 = readFileSync(join(NEXT, "privacy.html"), "utf8");
    // ⚠ **コメントを先に落とす。**⚠ **落とさないと、⚠ この決めごとを説明した字を拾う**（§5）。
    const H = 生.replace(/<!--[\s\S]*?-->/g, " ");
    const 字 = H.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // ⚠ **姿勢の一文**（⚠ これが無いと、⚠ 書いていないことの扱いが決まらない）。
    if (!/ここに書いていないことは、していません/.test(字))
      欠け.push("「ここに書いていないことは、していません」が無い（⚠ 残すと決めてある）");

    // ⚠ **要約が、⚠ くわしい説明より先に在ること。**⚠ **順番そのものを見る。**
    const 要約の位置 = H.indexOf('class="about__sum"');
    const 詳細の位置 = H.indexOf('class="about__sec"');
    if (要約の位置 < 0) 欠け.push("冒頭の要約（about__sum）が無い");
    else if (詳細の位置 < 0 || 要約の位置 > 詳細の位置)
      欠け.push("要約が、くわしい説明より後ろにある（⚠ 先に要点を渡すと決めてある）");

    // ⚠ **要約は 4 つ。**⚠ **Owner が挙げた 4 点に、⚠ 1 つずつ対応する。**
    //   ⚠ **字を写さない。**⚠ **その点が触れている相手（何の話か）で見る。**
    const 見出し = [...H.matchAll(/class="about__sumK"[^>]*>([^<]+)</g)].map((m) => m[1]);
    if (見出し.length !== 4)
      欠け.push(`冒頭の要約が ${見出し.length} 点しかない（⚠ 4 点と決めてある）`);
    const 要る = {
      "端末内に保存すること":       /端末の中/,
      "別の端末へ渡すときだけ送ること": /別の端末/,
      "行動を追跡しないこと":       /数えていません|取っていません/,
      "外へ位置が届くこと":         /国土地理院/,
    };
    for (const [何, 印] of Object.entries(要る))
      if (!見出し.some((h) => 印.test(h)))
        欠け.push(`冒頭の要約に「${何}」が無い`);

    // ⚠ **硬い言い方・こちらの作りの話を、⚠ 本文に出さない**（⚠ Owner 指示）。
    //   ⚠ **`Cron` を足した**（2026-09-01）。⚠ **利用者に、⚠ こちらの作りを説明しない。**
    //   ⚠ **`仕組み` は入れない。**⚠ **要約 ③ が「他のサイトを横断して追いかける仕組み」で
    //   ⚠ 正当に使っている**（⚠ こちらの作りではなく、⚠ 一般に知られた言葉）。
    for (const 語 of ["ハッシュ", "保管庫", "削除ジョブ", "Cron", "cron",
                      "当社", "本規約", "甲", "乙"])
      if (字.includes(語)) 欠け.push(`硬い言い方が残っている: ${語}`);

    // ⚠ **消えると言い切らないこと**（掟 §1）。⚠ **いつまでに消えるかは決められない。**
    //   ⚠ **発行が止まれば掃除も動かず、⚠ 1 回に消せる行数にも上限がある**（`docs/sync-api.md` §4）。
    for (const 嘘 of ["分で消えます", "自動で削除", "確実に削除", "期限を過ぎると消えます"])
      if (字.includes(嘘)) 欠け.push(`消えると言い切っている: ${嘘}`);

    // ⚠ **消していない事実**（⚠ やさしくした結果、⚠ 言えないことまで消さない。掟 §1）。
    //   ⚠ **とくに「まとめて消す仕組みはまだ無い」は、⚠ 消すと嘘になる。**
    const 落とせない = {
      // ⚠ **削除を約束しないこと**（2026-09-01。⚠ Owner 指示で言い方を変えた）。
      //   ⚠ **前は「まとめて消す仕組みは、まだ置いていません」と、⚠ こちらの作りを説明していた。**
      //   ⚠ **利用者向けの言い方に直した。**⚠ **主張は同じ: ⚠ 削除は保証しない。**
      "削除を保証しないと断ること": /削除されることまでは保証していません/,
      "期限で使えなくなると言うこと": /期限を過ぎると、合言葉は使えなくなります/,
      "IP と端末の種類が配信元に届くこと":          /接続元の IP と端末の種類/,
      "預けるものの中身":                          /緯度・経度・町名・足元の区分・保存した時刻/,
      "合言葉そのものは預からないこと":             /合言葉そのものは預かりません/,
    };
    for (const [何, 印] of Object.entries(落とせない))
      if (!印.test(字)) 欠け.push(`やさしくした結果、${何}が消えている`);

    欠け.length
      ? bad(`プライバシーポリシーが要点を先に渡していない: ${欠け.join(" ／ ")}`)
      : ok("プライバシーポリシーは、⚠ 4 点の要約を先に置き、⚠ 硬い言い方を使わず、"
          + "⚠ 「ここに書いていないことは、していません」と、⚠ 言えないことを残している");
  }



  // ---- ⚠ ⑳ 読み込みの順が、⚠ 依存より後になっていないか ----
  //   ⚠ **2026-09-01 に実際に踏んだ**（`docs/adr/0080`）。
  //   ⚠ **`places.js` を `gsi-address-search.js` より先に置いた。**
  //   ⚠ **`places.js` は読み込んだ時点で `TIMEOUT_MS` を読む**ので、⚠ `undefined` になり、
  //     ⚠ **ページのスクリプトが丸ごと止まった**（⚠ 実描画 83 件中 46 件が同じ 1 行で落ちた）。
  //   ⚠ **静的検査は緑のままだった。**⚠ **順は、⚠ 誰も見ていなかった。**
  //
  // ⚠ **字面では見分けられない**（⚠ 一度そう書いて、⚠ わざと壊しても素通りした）。
  //   ⚠ **依存を読む行は関数の中にあり、⚠ 呼ぶのが最上位**だった。
  //   ⚠ **字下げで「最上位か」を判定しても当たらない。**
  // ⚠ **だから、⚠ 実際に順に読み込んで、⚠ 落ちるかを見る**（⚠ ブラウザは要らない）。
  //   ⚠ **DOM は当たり障りのない作りもので埋める**（⚠ 見たいのは読み込みの順だけ）。
  {
    const 欠け = [];
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");

    // ⚠ **触られたら、⚠ 何にでも化ける作りもの**（⚠ DOM も地図も、⚠ ここでは中身に興味が無い）。
    // ⚠ **文字にも数にも化ける**（⚠ `${…}` に入れられても落ちない）。
    //   ⚠ **`then` は undefined**（⚠ 返さないと await で永久に待つ）。
    //   ⚠ **`Symbol.unscopables` も undefined**（⚠ `with` が名前を外へ逃がす）。
    const 何でも = () => new Proxy(function () {}, {
      get: (t, k) => {
        if (k === "then" || k === Symbol.unscopables) return undefined;
        if (k === Symbol.toPrimitive) return () => "";
        if (k === "length") return 0;
        if (k === "toString" || k === "valueOf") return () => "";
        return 何でも();
      },
      set: () => true,
      apply: () => 何でも(),
      construct: () => 何でも(),
    });

    // ⚠ **裸の名前も、⚠ この入れ物から引かせる**（⚠ `with`）。
    //   ⚠ **`verify.js` は `KonjakuSwale` を裸で読む**（⚠ `window.` を付けない）。
    //   ⚠ **`with` を使わないと、⚠ 本物の globalThis を見に行って、⚠ 順に関係なく落ちる。**
    // ⚠ **入っていない名前だけ作りものを返す**（⚠ 入っているものは、⚠ そのまま返す）。
    //   ⚠ **`has` は常に true**（⚠ そうしないと `with` が外へ抜ける）。
    const 入れ物 = () => {
      const 中身 = {};
      // ⚠ **`window` / `globalThis` / `self` は、⚠ 入れ物そのものを指す。**
      //   ⚠ **どのファイルも `(function(global){…})(window)` の形で名前を置く。**
      //   ⚠ **ここを作りものにすると、⚠ 置いた名前がどこにも残らない**
      //     （⚠ 実際にそうなって、⚠ 順が正しいのに落ちた）。
      const 自分 = new Proxy(中身, {
        has: () => true,
        // ⚠ **`Konjaku*` は埋めない。**⚠ **まだ置かれていなければ undefined を返す。**
        //   ⚠ **ここを作りもので埋めると、⚠ 捕まえたい不具合をこの検査自身が隠す**
        //     （⚠ 実際にそう書いて、⚠ わざと壊しても素通りした）。
        //   ⚠ **埋めてよいのは、⚠ ブラウザが最初から持っているもの**（⚠ DOM・fetch など）。
        get: (t, k) => (k in t ? t[k]
          : k === Symbol.unscopables ? undefined
          : (typeof k === "string" && k.startsWith("Konjaku")) ? undefined
          : (k === "window" || k === "globalThis" || k === "self") ? 自分
          // ⚠ **`fetch` だけは本物の Promise を返す。**⚠ **作りものだと `.then` が無い。**
          //   ⚠ **手元（Node 25）では通り、⚠ CI（Node 22）で落ちた**（2026-09-01。⚠ 実際に踏んだ）。
          //   ⚠ **`fetch(…).then(…)` を最上位で書いている画面がある。**
          //   ⚠ **外へは出ない**（⚠ 返すのは作りもの。⚠ 通信はしない）。
          : k === "fetch" ? (() => Promise.resolve(何でも()))
          : 何でも()),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      return 自分;
    };

    for (const h of 画面) {
      const 順 = [...素(h).matchAll(/<script[^>]+src="\.\/([\w.-]+\.js)"/g)].map((m) => m[1]);
      if (!順.length) continue;
      // ⚠ **画面ごとに、⚠ まっさらな入れ物から始める**（⚠ 前の画面の名前を引き継がない）。
      const win = 入れ物();
      let 落ちた = null;
      for (const f of 順) {
        try {
          new Function("__win", `with (__win) { ${readFileSync(join(NEXT, f), "utf8")}\n }`)(win);
        } catch (e) {
          落ちた = `${f} が読み込みで落ちた: ${String(e.message).slice(0, 90)}`;
          break;
        }
      }
      if (落ちた) 欠け.push(`${h}: ${落ちた}（⚠ 読み込みの順を見直す）`);
    }

    // ⚠ **1 枚も読めていないなら、⚠ この検査は何も見ていない。**
    画面.length === 0 && 欠け.push("画面が 1 枚も無い（⚠ この検査が何も見ていない）");

    欠け.length
      ? bad(`読み込みの順が、依存より後になっている: ${欠け.join(" ／ ")}`)
      : ok(`読み込みの順は、⚠ 依存より後になっていない（⚠ ${画面.length} 画面を、⚠ 実際に順に読んだ）`);
  }


  // ---- ⚠ ㉑ 初めて開いた人に、⚠ 3 手と「言えないこと」が届いているか ----
  //   ⚠ **2026-09-02。Owner 判断。**⚠ **トップは LP 化せず 3 手を 1 行だけ置き、
  //   ⚠ /about は読み物にして、⚠ 「言えないこと」を必ず持つ。**
  //   ⚠ **実測（2026-09-02・375x667・本番）**: 最初の画面に押せるものが 14 個あり、
  //     ⚠ **色で塗られていたのは 2 個（現在地・出典）だけ**だった。
  //     ⚠ **/about への道は初期画面から 0 本**（⚠ メニューを開く 1 手が要る）。
  {
    const 欠け = [];
    // ⚠ **HTML のコメントを先に落とす**（`CLAUDE.md` §5。⚠ 何度も踏んでいる）。
    const HTML = (f) => readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, " ");
    const TOP_HTML = HTML("index.html"), ABOUT = HTML("about.html");
    const TOP = TOP_HTML;

    // ⚠ **3 手の字は、⚠ 2 か所に出る**（⚠ トップの帯と /about の使い方）。
    //   ⚠ **同じ道具の使い方が 2 通りある形にしない。**⚠ **突き合わせる。**
    const 手 = ["① 場所を選ぶ", "② 昔を知る", "③ 写真で見くらべる"];

    // ⚠ 1. ⚠ **トップの帯。**⚠ **要素ごとに見る**（⚠ 本文全体の test() は、
    //   ⚠ どこかに似た語があれば通る。2026-08-23 に 2 回踏んでいる）。
    const 帯 = TOP.match(/<p[^>]*class="[^"]*\bsteps\b[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (!帯) {
      欠け.push("トップに 3 手の帯（.steps）が無い");
    } else {
      const 札 = [...帯[1].matchAll(/<span[^>]*class="steps__i"[^>]*>([^<]*)<\/span>/g)]
        .map((m) => m[1].trim());
      if (札.join(" / ") !== 手.join(" / "))
        欠け.push(`トップの 3 手が決めた字と違う: ${札.join(" / ") || "（0 個）"}`);
      // ⚠ **押せる見た目にしない**（⚠ 押しても何も起きない導線を置かない。ADR 0026）。
      if (/<a[\s>]|<button[\s>]/.test(帯[1]))
        欠け.push("トップの 3 手が、⚠ 押せる要素を含んでいる（⚠ 押しても何も起きない）");
      // ⚠ **矢印は読み上げから外す**（⚠ 順を表す記号で、⚠ 読む字ではない）。
      const 矢 = [...帯[1].matchAll(/<span[^>]*class="steps__sep"[^>]*>/g)].map((m) => m[0]);
      if (矢.length !== 2 || !矢.every((t) => /aria-hidden="true"/.test(t)))
        欠け.push(`3 手の矢印が、⚠ 読み上げから外れていない（${矢.length} 個）`);
    }
    // ⚠ **触れない**（⚠ 帯の下の地図を、⚠ そのまま引けること）。
    if (!/\.steps\{[^}]*pointer-events:none/.test(readFileSync(join(NEXT, "top.css"), "utf8")))
      欠け.push("3 手の帯が、⚠ 地図の操作を止めている（⚠ pointer-events:none が無い）");

    // ⚠ 2. ⚠ **/about の使い方が、⚠ 同じ 3 つの字で始まっているか。**
    const 使い方 = [...ABOUT.matchAll(/<dt class="about__k">([^<]*)<\/dt>/g)].map((m) => m[1].trim());
    for (const h of 手)
      if (!使い方.includes(h)) 欠け.push(`/about の使い方に「${h}」が無い（⚠ トップの帯と食い違う）`);

    // ⚠ 3. ⚠ **「言えないこと」の節。**⚠ **見出しと、⚠ 中身の 3 本を別々に見る。**
    //   ⚠ **見出しだけでは、⚠ 中を空にしても通る。**
    const 節 = ABOUT.match(/<h2 class="about__h2">言えないこと<\/h2>([\s\S]*?)<\/section>/);
    if (!節) {
      欠け.push("/about に「言えないこと」の節が無い（⚠ 必ず持つと決めてある）");
    } else {
      // ⚠ **中身は docs/SPEC.md 「言わないと決めているもの」から来る。**
      //   ⚠ **文で切ってから見る**（⚠ 本文全体だと、⚠ 別の文の語を拾う）。
      const 文 = 節[1].replace(/<[^>]+>/g, " ").split(/。|\n/).map((t) => t.trim()).filter(Boolean);
      const 要る = [
        ["いつ陸になったか", (t) => /いつ.*(陸|埋め立て)/.test(t) && /分かりません|言えません/.test(t)],
        ["確率・確信度を出さないこと", (t) => /確率/.test(t) && /出しません/.test(t)],
        ["資料に無い ≠ 無かった", (t) => /資料に無い/.test(t) && /現実に無かった/.test(t)],
      ];
      for (const [名, 見る] of 要る)
        if (!文.some(見る)) 欠け.push(`/about の「言えないこと」に、${名} が書かれていない`);
    }

    // ⚠ 5. ⚠ **名乗りの行には、⚠ 名乗りしか書かない。**
    //   ⚠ **名乗りは送る・保存と同じ行なので、⚠ 器が狭い**（⚠ 実測 320px で 122px）。
    //   ⚠ **断りを同じ行に書くと、⚠ 必ず切れる**（⚠ 実際に踏んだ。⚠ 通信 28 字・現在地 33 字）。
    //   ⚠ **代入が 1 か所であることを見る。**⚠ **増えたら、⚠ また切れる字が入る道ができる。**
    {
      const TOP = readFileSync(join(NEXT, "top.js"), "utf8")
        .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ")
        .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      const 代入 = [...TOP.matchAll(/kickText\.textContent\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
      if (代入.length !== 1)
        欠け.push(`名乗りの行への代入が ${代入.length} か所ある（⚠ 1 か所だけにする）: ${代入.join(" ／ ")}`);
      else if (!/KonjakuAnswer\.WHERE\[/.test(代入[0]))
        欠け.push(`名乗りの行に、⚠ 名乗り以外を書いている: ${代入[0]}`);
      // ⚠ **断りの行が在ること**（⚠ 器が別なら、⚠ 折り返せる）。
      if (!/id="kickNote"/.test(TOP_HTML))
        欠け.push("断りの行（#kickNote）が無い（⚠ 断りは名乗りの行に入らない）");
      if (!/\.kick__note\[hidden\]\{display:none\}/.test(readFileSync(join(NEXT, "top.css"), "utf8")))
        欠け.push("断りの行に、⚠ hidden の打ち消しが無い（⚠ display を持つ規則には要る）");
    }

    // ⚠ 4. ⚠ **読み終えた人の出口。**⚠ **行き先まで見る**（⚠ 字だけだと、⚠ どこへも行かない）。
    const 出口 = ABOUT.match(/<a class="about__goLink" href="([^"]*)"[^>]*>([^<]*)<\/a>/);
    if (!出口) 欠け.push("/about に、読み終えた人の出口（.about__goLink）が無い");
    else {
      if (出口[1] !== "./") 欠け.push(`/about の出口の行き先がトップではない: ${出口[1]}`);
      if (!/さあ、はじめる/.test(出口[2])) 欠け.push(`/about の出口の字が決めた形ではない: ${出口[2]}`);
    }

    // ⚠ 6. ⚠ **冒頭の 1 組。**⚠ **今昔の実画面から作った、⚠ 作り置きの画像**
    //   （2026-09-02。Owner 判断。`docs/adr/0084`）。
    //   ⚠ **実行時にタイルを読まない。**⚠ **読み物から、⚠ 読者の接続元を配信元へ出さないため。**
    //     ⚠ **/about は、⚠ いま外へ 1 本も出していない**（⚠ 実描画が見ている）。
    //   ⚠ **出典と、⚠ こちらで加工したことを、⚠ 必ず添える。**
    {
      const 図 = ABOUT.match(/<figure class="about__hero">([\s\S]*?)<\/figure>/);
      if (!図) {
        欠け.push("/about の冒頭に、今昔の実画面の 1 組（.about__hero）が無い");
      } else {
        const 中 = 図[1];
        const 絵 = [...中.matchAll(/<img[^>]*class="about__heroImg"[^>]*>/g)].map((m) => m[0]);
        // ⚠ **増やさない。**⚠ **増やすと、⚠ 下の「言えないこと」まで届く人が減る。**
        //   ⚠ **実測（2026-09-02・375px）: 3 か所に足すと 2511 → 4469px になった。**
        if (絵.length !== 2) 欠け.push(`冒頭の絵が 2 枚ではない（${絵.length} 枚）`);
        for (const g of 絵) {
          // ⚠ **寸法を属性で持つ**（⚠ 無いと、⚠ 読み込む前に行が飛ぶ）。
          if (!/width="\d+"/.test(g) || !/height="\d+"/.test(g))
            欠け.push(`冒頭の絵が寸法を持っていない: ${g.slice(0, 70)}`);
          const alt = g.match(/alt="([^"]*)"/)?.[1] ?? "";
          if (alt.length < 8) 欠け.push(`冒頭の絵の alt が短い: 「${alt}」`);
          // ⚠ **実行時に外から読まない**（⚠ 相対の道だけ）。
          const src = g.match(/src="([^"]*)"/)?.[1] ?? "";
          if (!/^\.\/[\w.-]+\.webp$/.test(src))
            欠け.push(`冒頭の絵が、⚠ 手元の画像を指していない: ${src}`);
          else if (!existsSync(join(NEXT, src.slice(2))))
            欠け.push(`冒頭の絵の実ファイルが無い: ${src}`);
        }
        // ⚠ **出典と加工の断り。**⚠ **文で切ってから、⚠ 主語と述語が結びついているかまで見る**
        //   （⚠ 本文全体の test() は、⚠ どこかに似た語があれば通る。2026-08-23 に踏んでいる）。
        const 断り = 中.match(/<p class="about__figSrc">([\s\S]*?)<\/p>/);
        if (!断り) {
          欠け.push("冒頭の 1 組に、出典と加工の断り（.about__figSrc）が無い");
        } else {
          const 文 = 断り[1].replace(/<[^>]+>/g, " ").split("。")
            .map((t) => t.replace(/\s+/g, "").trim()).filter(Boolean);
          const 要る = [
            // ⚠ **「出典」と「国土地理院」が、⚠ 同じ文で結びついていること。**
            //   ⚠ **国土地理院という語があるだけでは通さない**（⚠ 実際に素通りした。
            //     ⚠ 「国土地理院が公開している地理院タイル…」という別の文が残っていた）。
            ["出典として国土地理院を名乗る文", (t) => /出典/.test(t) && /国土地理院/.test(t)],
            ["こちらで加工したこと", (t) => /今昔/.test(t) && /(切り取|加工|表示)/.test(t)],
            ["原図そのままではないこと", (t) => /原図/.test(t) && /ではありません/.test(t)],
          ];
          for (const [名, 見る] of 要る)
            if (!文.some(見る)) 欠け.push(`冒頭の断りに、${名}が書かれていない`);
          if (!/maps\.gsi\.go\.jp\/development\/ichiran\.html/.test(断り[1]))
            欠け.push("冒頭の断りに、地理院タイル一覧へのリンクが無い");
        }
      }
      // ⚠ **作り方が再現できること**（`CLAUDE.md` §6）。⚠ **manifest と実ファイルを突き合わせる。**
      //   ⚠ **ここでは撮り直さない**（⚠ 通信もブラウザも要らない口を呼ぶ）。
      try {
        execFileSync(process.execPath, ["scripts/generate-about-hero.mjs", "--check"],
          { cwd: ROOT, encoding: "utf8" });
      } catch (e) {
        欠け.push(`冒頭の 1 組が、作り方の記録と合っていない: ${String(e.stderr || e.message).split("\n").find((l) => /Error|違い|ありません/.test(l)) ?? ""}`);
      }
    }

    欠け.length
      ? bad(`初めて開いた人への案内が欠けている: ${欠け.join(" ／ ")}`)
      : ok("トップは 3 手を 1 行で出し（⚠ 押せない）、⚠ /about は同じ 3 手と「言えないこと」を持ち、"
          + "⚠ 「さあ、はじめる」でトップへ戻せる（⚠ 冒頭は今昔の実画面 2 枚・出典と加工の断りつき）");
  }

}
