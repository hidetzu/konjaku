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

      // ⚠ **色みごとに、⚠ 名前 → 値の表を作る。**
      //   ⚠ **2026-09-02 に形が変わった**（`docs/adr/0086`）。⚠ **`@media` の 2 段ではなく、
      //   ⚠ 1 つの token が `light-dark(明, 暗)` で両方を持つ。**⚠ **値は 1 か所のまま。**
      //   ⚠ **読めないと、⚠ この節の色が表から落ち、⚠ コントラストの検査が黙って何も測らなくなる。**
      //     ⚠ **緑のまま何も見ない**ので、⚠ **落ちない不具合になる。**⚠ **だから読める形にする。**
      const 明 = {}, 暗 = {}, 両方同じ = [];
      {
        const LD = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/;
        for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
          const 名 = m[1], v = m[2].trim();
          const ld = LD.exec(v);
          if (ld) {
            if (!parseColor(ld[1]) || !parseColor(ld[2])) continue;
            明[名] = ld[1]; 暗[名] = ld[2];
          } else if (parseColor(v)) {
            明[名] = v; 暗[名] = v; 両方同じ.push(名);   // ⚠ 色みで変えないもの
          }
        }
      }
      if (Object.keys(明).length < 8)
        bad(`theme.css から色を ${Object.keys(明).length} 個しか読めていない`
          + "（⚠ **この節が何も見ていない**）");

      // ⚠ **色みで変えない色は、⚠ 決めたものだけ。**⚠ **書き忘れと区別がつかなくなる。**
      //   ⚠ **前は「暗い側の節に宣言があるか」で見ていた。**⚠ **節が無くなったので、
      //   ⚠ 「`light-dark()` で書かれているか」で見る。**⚠ **主張は同じ**（⚠ 片方の値がそこだけ残る）。
      const 変えないと決めたもの = {
        // ⚠ **地図の上に置く印の縁。**⚠ **乗る相手は地図で、⚠ こちらの面ではない。**
        "pin-ring": "空中写真の上で、印が地図の記号に紛れないため",
        // ⚠ **影は、⚠ 明るい色みでも暗い。**
        "shadow": "影とスクリムは色みで反転しない",
      };
      const 不明 = 両方同じ.filter((k) => !(k in 変えないと決めたもの));
      不明.length
        ? bad(`色みで変わらない色があるが、⚠ 変えないと決めたものに入っていない: ${不明.join(" ")}`
            + "。⚠ **書き忘れと区別がつかない。**⚠ **`light-dark()` にするか、⚠ 理由と一緒に一覧へ足す**")
        : ok(`色は ${Object.keys(明).length} 個。⚠ うち ${両方同じ.length} 個は`
            + `色みで変えないと決めたもの（${両方同じ.map((k) => `${k}=${変えないと決めたもの[k]}`).join(" ／ ")}）`);

      // ⚠ **色みを選ぶ口が、⚠ 色を 1 つも持たないこと**（2026-09-02。`docs/adr/0086`）。
      //   ⚠ **`[data-theme]` に色を書くと、⚠ 同じ値が 2 か所になる**（`.claude/rules/css.md`）。
      //   ⚠ **切り替えるのは `color-scheme` だけ。**⚠ **値は `light-dark()` が両方持つ。**
      {
        const 欠け = [];
        for (const m of css.matchAll(/:root\[data-theme="(\w+)"\]\s*\{([^}]*)\}/g)) {
          const 中 = m[2];
          if (/#[0-9a-fA-F]{3,8}|rgba?\(|light-dark\(/.test(中))
            欠け.push(`data-theme="${m[1]}" に色の値がある`);
          if (!/color-scheme\s*:/.test(中))
            欠け.push(`data-theme="${m[1]}" が color-scheme を切り替えていない`);
        }
        const 段 = [...css.matchAll(/:root\[data-theme="(\w+)"\]/g)].map((m) => m[1]).sort();
        if (段.join(",") !== "dark,light")
          欠け.push(`色みの固定が light と dark の 2 つになっていない: ${段.join(",") || "（0 個）"}`);
        // ⚠ **既定は端末の設定に従う**（`docs/adr/0040` は変えていない）。
        if (!/:root\s*\{\s*color-scheme:\s*light dark\s*\}/.test(css))
          欠け.push("既定が「端末の設定に従う」になっていない（:root の color-scheme: light dark）");
        // ⚠ **切り替える口も、⚠ 色を持たない。**
        const JS = existsSync(join(NEXT, "theme.js"))
          ? readFileSync(join(NEXT, "theme.js"), "utf8").replace(BLOCK_COMMENT, " ")
              .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
          : null;
        if (JS === null) 欠け.push("色みを切り替える theme.js が無い");
        else {
          if (/#[0-9a-fA-F]{3,8}|rgba?\(/.test(JS)) 欠け.push("theme.js が色の値を持っている");
          // ⚠ **押しても何も起きない導線を置かない**（ADR 0026）。⚠ **動くまで出さない。**
          if (!/\.hidden\s*=\s*false/.test(JS))
            欠け.push("theme.js が、⚠ 動くまで隠しておく形になっていない");
          // ⚠ **保存領域を触れない端末で落ちない**（⚠ プライベート窓）。
          if ((JS.match(/try\s*\{/g) ?? []).length < 2)
            欠け.push("theme.js が、⚠ 保存領域を触れない端末を想定していない");
        }
        // ⚠ **最初の描画より前に当てる**（⚠ でないと、⚠ 一瞬だけ前の色みで描かれる）。
        for (const f of ["index.html", "about.html", "deep.html", "privacy.html",
                         "terms.html", "saved.html", "take.html"]) {
          if (!existsSync(join(NEXT, f))) continue;
          const h = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, " ");
          const js = h.indexOf('src="./theme.js"');
          const body = h.search(/<(header|main|div id="app")/);
          if (js < 0) 欠け.push(`${f} が theme.js を読んでいない`);
          else if (body >= 0 && js > body)
            欠け.push(`${f} が theme.js を、⚠ 中身より後で読んでいる（⚠ 一瞬だけ前の色みで描かれる）`);
          if (!/id="theme"/.test(h)) 欠け.push(`${f} に色みを切りかえる口が無い`);
        }
        欠け.length
          ? bad(`色みを選ぶ口が決めた形になっていない: ${欠け.join(" ／ ")}`)
          : ok("色みは、⚠ 端末の設定が既定で、⚠ 人が明るい／暗いに固定でき、"
              + "⚠ その口は色を 1 つも持たない（⚠ 7 画面とも、⚠ 描く前に当てている）");
      }

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

  // ---- ⚠ ⑭ 地図へ行く道が、⚠ どの画面にも 1 本あるか ----
  //
  // ⚠ **2026-09-02 に主張を変えた**（Owner 判断。`docs/adr/0087`）。
  //   ⚠ **前は「広い幅のナビ（`地図で調べる`）が 7 枚とも同じか」を見ていた。**
  //   ⚠ **そのナビを消した**ので、⚠ **その主張はもう実態を指していない。**
  //   ⚠ **消した理由**: ⚠ **名乗り（`今昔`）自体が `./` へのリンクで、⚠ 同じ行に同じ行き先が
  //     2 本並んでいた**（⚠ 実測 2026-09-02・PC の `/about` で「/」へ行けるものが 3 本）。
  //     ⚠ **地図の画面では `aria-current="page"` が付いており、⚠ 押しても何も起きなかった。**
  //     ⚠ **狭い幅には元から出ておらず、⚠ 無くて困っていないという観測が既にあった。**
  //
  // ⚠ **いま見るのは、⚠ 「地図へ行く道が、⚠ どの画面にも 1 本はあるか」。**
  //   ⚠ **名乗りがその 1 本。**⚠ **消えると、⚠ 読み物から地図へ戻れなくなる。**
  {
    const 画面 = readdirSync(NEXT).filter((f) => f.endsWith(".html"));
    const 欠け = [];
    for (const f of 画面) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      // ⚠ **名乗りが `./` を指していること**（⚠ ここが唯一の、⚠ どの画面にもある道）。
      if (!/<a class="brand__name" href="\.\/"/.test(src))
        欠け.push(`${f}: 名乗りが地図へ行く道になっていない`);
      // ⚠ **消したナビが、⚠ どこかに戻っていないか**（⚠ 戻ると、また 2 本になる）。
      if (/brand__nav|brand__link/.test(src))
        欠け.push(`${f}: 消したはずの広い幅のナビが戻っている`);
    }
    if (/\.brand__nav|\.brand__link/.test(readFileSync(join(NEXT, "brand.css"), "utf8")))
      欠け.push("brand.css に、⚠ 消したはずのナビの規則が残っている");
    欠け.length
      ? bad(`地図へ行く道が欠けている: ${欠け.join(" ／ ")}`)
      : ok(`地図へ行く道は、⚠ ${画面.length} 枚とも名乗り 1 本（⚠ 同じ行に 2 本並べない）`);
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

    // ⚠ **要約は 5 つ。**⚠ **Owner が挙げた 4 点 ＋ メール**（2026-09-05）。
    //   ⚠ **字を写さない。**⚠ **その点が触れている相手（何の話か）で見る。**
    // ⚠ **2026-09-03 に、⚠ 要約の見出し（`<b>`）を外した**（Owner 指摘）。
    //   ⚠ **番号つきの節の見出しと同じ字になり、⚠ 上から下まで 2 回読ませていた。**
    //   ⚠ **見出しは番号つきの節だけ。**⚠ **要約は、⚠ 答えを 1 文で置く場所。**
    //   ⚠ **主張は変えていない**（⚠ 4 点あること・⚠ その 4 点が何に触れているか）。
    const 見出し = [...H.matchAll(/<li class="about__sumItem"[^>]*>([\s\S]*?)<\/li>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, ""));
    if (見出し.length !== 5)
      欠け.push(`冒頭の要約が ${見出し.length} 点しかない（⚠ 5 点と決めてある）`);
    // ⚠ **要約と節の見出しが、⚠ 同じ字にならないこと**（⚠ 2 回読ませない）。
    {
      const 節 = [...H.matchAll(/<h2 class="about__h2">([^<]*)<\/h2>/g)]
        .map((m) => m[1].replace(/^\d+\.\s*/, "").replace(/\s+/g, ""));
      // ⚠ **どちらが長いか分からない。**⚠ **重なっている長さで見る。**
      //   ⚠ **片方向（要約が節を含む）だけ見て素通りした**（⚠ 2026-09-03 に実際に）。
      //     ⚠ 要約「…この端末の中だけ。」／ 節「…この端末の中だけに残ります」。
      //     ⚠ **節のほうが長いので、⚠ 要約は節を含まない。**
      const 重なる長さ = (a, b) => {
        for (let n = Math.min(a.length, b.length); n >= 6; n--)
          for (let i = 0; i + n <= a.length; i++)
            if (b.includes(a.slice(i, i + n))) return n;
        return 0;
      };
      // ⚠ **境目は 8 字。**⚠ **測って決めた**（2026-09-03）。
      //   ⚠ **落としたい 4 つの重なりは 16 / 4 / 30 / 8 字。**
      //   ⚠ **落としてはいけない 4 つは 1 / 2 / 4 / 1 字。**
      //   ⚠ **4 字が両方に出る**ので、⚠ **そこを境目にすると誤爆する。**
      //   ⚠ **8 字にすると 3/4 を捕まえ、⚠ 誤爆 0。**
      //   ⚠ **「別の端末へ渡すとき」（重なり 4 字）は、⚠ この検査では捕まらない。**
      //     ⚠ **機械では分けられないので、⚠ そう書いて残す。**⚠ **捕まえたことにしない。**
      const 重なり = 節.filter((h) => 見出し.some((y) => 重なる長さ(h, y) >= 8));
      if (重なり.length)
        欠け.push(`節の見出しが、⚠ 要約と同じ字: ${重なり.map((x) => `「${x}」`).join(" ／ ")}`);
    }
    const 要る = {
      "端末内に保存すること":       /端末の中/,
      "別の端末へ渡すときだけ送ること": /別の端末/,
      // ⚠ **2026-09-02 に、⚠ 主張そのものを直した。**
      //   ⚠ **前は「数えていません」を要求していた。**⚠ **それは実態と違った。**
      //   ⚠ **配信元（Cloudflare）の集計が、⚠ 画面に差し込まれている**（⚠ repo には無い）。
      //   ⚠ **検査は「守るべきこと」を固定するので、⚠ 間違った主張は間違ったまま固定される**
      //     （`CLAUDE.md` §9）。⚠ **だから、⚠ 検査の側を直した。**
      "誰が数えているかを名乗ること": /数えています/,
      "外へ位置が届くこと":         /国土地理院/,
      // ⚠ **メールを受け取ること**（2026-09-05）。⚠ **受け取ると、⚠ 本文とアドレスがこちらに届く。**
      //   ⚠ **書かないと「ここに書いていないことは、していません」が嘘になる。**
      "メールを受け取ること":       /メール/,
    };
    for (const [何, 印] of Object.entries(要る))
      if (!見出し.some((h) => 印.test(h)))
        欠け.push(`冒頭の要約に「${何}」が無い`);

    // ⚠ **メールの扱いを、⚠ 節で説明していること**（2026-09-05）。
    //   ⚠ **要約 1 行だけでは足りない**（⚠ 何が届き、⚠ 何に使うかが分からない）。
    {
      const 節 = H.slice(H.indexOf("5. メール"));
      const 要る2 = [
        ["どのアドレスか", /contact@konjaku\.hidetzu\.work/],
        ["何が届くか", /本文/, /アドレス/],
        // ⚠ **「返信のため」から「お問い合わせへの対応のため」へ**（2026-09-05。Owner 指示）。
        //   ⚠ **主張は変えていない。**⚠ **返信だけとは限らないので、⚠ 狭く言わない。**
        ["何に使うか", /対応のため/],
        // ⚠ **「第三者へ渡しません」だけでは、⚠ 実態と食い違う。**
        //   ⚠ **実測（2026-09-05）**: ⚠ `konjaku.hidetzu.work` の MX は
        //   ⚠ `route1〜3.mx.cloudflare.net`。⚠ **配送は Cloudflare を経由する。**
        //   ⚠ **だから「対応以外の目的で提供しない」と、⚠ 目的で限る。**
        ["渡さないこと", /第三者/, /対応以外の目的/],
        // ⚠ **配送を担う相手を、⚠ 黙らない**（掟 §1）
        ["配送を経由する相手", /Cloudflare/],
        // ⚠ **配送そのものに伴うことは、⚠ 避けられない。**⚠ **黙らない**（掟 §1）
        ["配送に伴うこと", /避けられません/],
      ];
      for (const [何, ...印] of 要る2)
        if (!印.every((r) => r.test(節))) 欠け.push(`メールの節に「${何}」が無い`);
      // ⚠ **消すと言い切らない**（⚠ いつ消すかを決めていない）
      for (const 嘘 of ["すぐ消します", "自動で消えます", "保存しません"])
        if (節.includes(嘘)) 欠け.push(`メールについて、⚠ 言い切っている: ${嘘}`);
      // ⚠ **狭い言い方を残さない**（2026-09-05。Owner 指示）。
      //   ⚠ **「返信のためだけ」は、⚠ 対応が返信だけとは限らないので狭い。**
      //   ⚠ **「対応のため」が別の文に在るだけでは足りない**（⚠ わざと戻して素通りした）。
      //   ⚠ **本文全体に対する `test()` は、⚠ どこかに似た語があれば通る**（`CLAUDE.md` §9）。
      for (const 狭い of ["返信のためだけ", "第三者へ渡しません"])
        if (節.includes(狭い)) 欠け.push(`メールについて、⚠ 狭い言い方が残っている: ${狭い}`);
    }

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
      // ⚠ **字そのものではなく、⚠ その事実が在るかで見る**（2026-09-02）。
      //   ⚠ **前は言い回しを固定していた。**⚠ **重複を外す言い直しで落ちた。**
      //   ⚠ **守りたいのは「削除を約束していない」ことであって、⚠ 特定の一文ではない。**
      "削除を保証しないと断ること": /削除されること(まで)?は\s*保証していません/,
      // ⚠ **合言葉が使えなくなることを言うこと**（⚠ 期限の項に。⚠ 末尾の断りとは別）。
      //   ⚠ **「期限を過ぎたあと」だけを見ると、⚠ 末尾の断りが在るせいで素通りする**
      //     （⚠ 2026-09-02 に実際に素通りした）。⚠ **「使えなくなる」まで見る。**
      "合言葉が使えなくなると言うこと": /合言葉[^。]*使えなくなります|使えなくなります/,
      "IP と端末の種類が届くこと":  /接続元の IP と端末の種類/,
      "預けるものの中身":                          /緯度・経度・町名・足元の区分・保存した時刻/,
      "合言葉そのものは預からないこと":             /合言葉そのものは預かりません/,
      // ⚠ **集計について、⚠ 安心させる側だけを書かない**（2026-09-02。Owner 指示）。
      //   ⚠ **何を集めているかを、⚠ 先に並べること。**
      "集めているものを並べること":   /見られたページ、参照元、国、ブラウザ、OS、端末の種類/,
      "Cookie を使っていないこと":     /Cookie/,
      "接続元の扱い":                 /接続元の番号は最寄りの拠点で捨て/,
      "国内とは限らない場所で処理されること": /日本国内とは限らない場所で処理される/,
      // ⚠ **これは Cloudflare の言い分であって、⚠ こちらが確かめたことではない**（掟 §1）。
      "こちらで確かめていないと断ること": /こちらで中身を確かめたわけではありません/,
    };
    for (const [何, 印] of Object.entries(落とせない))
      if (!印.test(字)) 欠け.push(`やさしくした結果、${何}が消えている`);

    // ⚠ **同じ文を 2 回書かない**（2026-09-02）。
    //   ⚠ **利用者役 6 名が 6 名とも「2 回読まされた」と言った**（⚠ 実在の利用者ではない）。
    //   ⚠ **2 名は、⚠ そのせいで次の行（削除を保証しない断り）を読み飛ばした。**
    //   ⚠ **重複が、⚠ いちばん言いにくいことを隠していた。**
    //   ⚠ **要約と本文で同じことを言うのは設計なので、⚠ 本文どうしだけを見る。**
    {
      const 本文 = [...H.matchAll(/<(?:p|dd)[^>]*class="about__(?:p|v|note)"[^>]*>([\s\S]*?)<\/(?:p|dd)>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, ""));
      const 文 = 本文.flatMap((t) => t.split("。").map((x) => x.trim()).filter((x) => x.length >= 12));
      const 数 = new Map();
      for (const x of 文) 数.set(x, (数.get(x) ?? 0) + 1);
      const 重なり = [...数].filter(([, n]) => n > 1).map(([x]) => x);
      if (重なり.length)
        欠け.push(`本文に同じ文が 2 回ある: ${重なり.map((x) => `「${x}」`).join(" ／ ")}`);
    }

    // ⚠ **誰に届くかを名指すこと**（2026-09-02）。
    //   ⚠ **「配信元」では、⚠ 誰のことか分からない。**⚠ **Cloudflare の節を足したあと、
    //     ⚠ 利用者役 6 名中 3 名が「どっちのこと？」と読んだ**（⚠ 実在の利用者ではない）。
    //   ⚠ **文をまたぐので、⚠ 段落で見る。**⚠ **そのうえで、⚠ 曖昧な語が残っていないかも見る。**
    {
      const 段落 = [...H.matchAll(/<p class="about__p">([\s\S]*?)<\/p>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, ""));
      const 届く = 段落.find((t) => /接続元の IP|接続元のIP/.test(t));
      if (!届く) 欠け.push("接続元の IP が届くことを書いていない");
      else if (!/国土地理院/.test(届く))
        欠け.push(`接続元の IP が誰に届くかを名指していない: ${届く}`);
      if (/配信元/.test(字))
        欠け.push("「配信元」という語が残っている（⚠ 誰のことか分からない）");
    }

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


  // ---- ⚠ ㉒ この一帯の地盤と揺れが、⚠ 「安全」と読ませない形になっているか ----
  //   ⚠ **2026-09-02。Owner 判断。`docs/adr/0088`。**
  //   ⚠ **20 地点で見つけた危険（hidetzu/konjaku#442）に、⚠ 1 つずつ対応する。**
  {
    const 欠け = [];
    const 借りる = () => {
      const win = {};
      for (const f of ["words.js", "ground.js", "answer.js"])
        new Function("window", "module", readFileSync(join(NEXT, f), "utf8"))(win, undefined);
      return win;
    };
    let win = null;
    try { win = 借りる(); } catch (e) { 欠け.push(`ground.js / answer.js を読めない: ${e.message}`); }
    const G = win?.KonjakuGround, W = win?.KonjakuAnswer?.GROUND, 字 = win?.KonjakuAnswer?.確率の字;

    if (!G || !W || !字) {
      欠け.push("地盤と揺れの口を読めていない（⚠ この検査が何も見ていない）");
    } else {
      // ⚠ 1. ⚠ **丸めると 0% になる値を、⚠ 数にしない**（⚠ 軽井沢 0.000261）。
      if (字(0.000261) !== "ごくわずか")
        欠け.push(`0.000261 が「ごくわずか」にならない: ${字(0.000261)}`);
      if (/^0(\.0)?%$/.test(字(0.000261)))
        欠け.push("⚠ 丸めて 0% と書いている（⚠ 「起きない」と読まれる）");
      // ⚠ **境目は決めたとおり**（0.5% 未満 ／ 99.5% 以上）
      if (G.ごくわずか !== 0.005) 欠け.push(`「ごくわずか」の境目が 0.5% ではない: ${G.ごくわずか}`);
      if (G.ほぼ確実 !== 0.995) 欠け.push(`「ほぼ確実」の境目が 99.5% ではない: ${G.ほぼ確実}`);
      if (字(1.0) !== "ほぼ確実") 欠け.push(`1.0 が「ほぼ確実」にならない: ${字(1.0)}`);
      if (/100%/.test(字(1.0))) 欠け.push("⚠ 100% と書いている");
      // ⚠ **「無い」と書かない**（⚠ ごくわずか ≠ 起きない）
      for (const v of [0, 0.000261, 0.004])
        if (/無い|ありません|ゼロ/.test(字(v))) 欠け.push(`${v} に「無い」と書いている: ${字(v)}`);

      // ⚠ 2. ⚠ **低い値を「安全」と読ませない断り**（⚠ 削らない）。
      if (!/揺れない/.test(W.断り) || !/意味ではありません/.test(W.断り))
        欠け.push(`断りに「低い値も『揺れない』という意味ではありません」が無い: ${W.断り}`);
      // ⚠ **「安全」「危険」を使わない**（⚠ 文書 §7）
      for (const [名, t] of Object.entries(W))
        for (const 悪 of ["安全", "危険"])
          if (typeof t === "string" && t.includes(悪)) 欠け.push(`${名} に「${悪}」がある`);

      // ⚠ 3. ⚠ **範囲を字の中に入れる**（⚠ 240m で区分名が変わる）。
      if (!/250m/.test(W.範囲)) 欠け.push(`範囲の字に「250m 四方」が無い: ${W.範囲}`);
      if (!/少し離れると/.test(W.断り)) 欠け.push("断りに「少し離れると別の区分になる」が無い");

      // ⚠ 4. ⚠ **4 段とも出す**（⚠ 1 つだけ出すと切り取り）。
      if (G.段.length !== 4) 欠け.push(`揺れの段が 4 つではない（${G.段.length}）`);
      if (W.見出し !== "この土地の地盤と揺れ") 欠け.push(`見出しが決めた字ではない: ${W.見出し}`);
      // ⚠ **期間と、⚠ 何の確率かを、⚠ 見出しの中に持つ**
      if (!/30 年/.test(W.見込み) || !/見込み/.test(W.見込み))
        欠け.push(`見込みの見出しに期間が無い: ${W.見込み}`);

      // ⚠ 5. ⚠ **「無い」と「取れなかった」を分ける**（`docs/adr/0056` と同じ）。
      if (W.無い.地盤 === W.読めない.地盤) 欠け.push("「無い」と「読めなかった」が同じ字");
      for (const t of [W.無い.地盤, W.無い.見込み])
        if (!/含んでいません/.test(t)) 欠け.push(`「無い」の字が資料の話になっていない: ${t}`);
    }

    // ⚠ **画面が、⚠ 因果でつないでいないか**（⚠ 矢印も接続詞も置かない）。
    {
      const HTML = readFileSync(join(NEXT, "deep.html"), "utf8").replace(/<!--[\s\S]*?-->/g, " ");
      const JS = readFileSync(join(NEXT, "deep.js"), "utf8")
        .replace(BLOCK_COMMENT, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      if (!/id="groundSec"/.test(HTML)) 欠け.push("deep.html に地盤と揺れの節が無い");
      // ⚠ **分離の線より上**（⚠ この地点そのものの話。⚠ まわりの記録ではない）
      const g = HTML.indexOf('id="groundSec"'), m = HTML.indexOf('id="monSec"');
      if (g < 0 || m < 0 || g > m) 欠け.push("地盤と揺れが、⚠ まわりの記録より下にある");
      for (const 悪 of ["だから", "ため揺れ", "なので", "→"])
        if (JS.includes(`"${悪}`) || (typeof W?.断り === "string" && W.断り.includes(悪)))
          欠け.push(`因果でつなぐ語がある: ${悪}`);
    }

    欠け.length
      ? bad(`地盤と揺れが「安全」と読ませない形になっていない: ${欠け.join(" ／ ")}`)
      : ok("地盤と揺れは、⚠ 0% と書かず（⚠ 0.5% 未満は「ごくわずか」・99.5% 以上は「ほぼ確実」）、"
          + "⚠ 範囲と断りを持ち、⚠ 4 段とも出し、⚠ 「無い」と「取れなかった」を分けている");
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
    // ⚠ **2026-09-03 に、⚠ 使い方を 3 手のカードにした**（`docs/adr/0089`）。
    //   ⚠ **項目名の器が `<dt class="about__k">` から `<p class="steps__k">` に変わった。**
    //   ⚠ **見ている主張は変えていない**（⚠ トップの帯と同じ 3 つの字であること）。
    const 使い方 = [...ABOUT.matchAll(/<p class="steps__k">([^<]*)<\/p>/g)].map((m) => m[1].trim());
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

    // ⚠ 6. ⚠ **4 つの節が、⚠ 文章の連続ではなく構造になっているか**
    //   （2026-09-03。Owner 指示。`docs/adr/0089`）。
    //   ⚠ **印は飾りではない。**⚠ **節の識別と、⚠ 視線の休憩のために置く。**
    //   ⚠ **印だけで意味が伝わる形にしない。**⚠ **字が必ず隣にある。**
    {
      // ⚠ **節ごとに切ってから数える**（2026-09-05 に踏んだ）。
      //   ⚠ **ページ全体で数えていたので、⚠ 別の節が同じ器を使うと落ちた**
      //   （⚠ 「連絡先」が `.cards` を借りたら、⚠ 「何を読んでいるか」が 6 個になった）。
      //   ⚠ **同じ器を使い回すのは、⚠ むしろ正しい**（⚠ 新しい形を作らない）。
      const 節を切る = (見出し) => {
        const i = ABOUT.indexOf(`>${見出し}</h2>`);
        if (i < 0) return null;
        const j = ABOUT.indexOf("</section>", i);
        return j < 0 ? ABOUT.slice(i) : ABOUT.slice(i, j);
      };
      const 器 = [
        ["使い方", /<ol class="steps">/, /<li class="steps__i">/g, 3],
        ["何を読んでいるか", /<ul class="cards">/, /<li class="cards__i">/g, 4],
        ["言えないこと", /<ul class="notes">/, /<li class="notes__i">/g, 4],
        // ⚠ **連絡先**（2026-09-05。Owner 判断）。⚠ **公開でよいかで分ける 2 つ。**
        ["連絡先", /<ul class="cards">/, /<li class="cards__i">/g, 2],
      ];
      // ⚠ **連絡先の節が、⚠ 本当に 2 つの行き先を持っていること**（⚠ 器の数だけでは足りない）。
      //   ⚠ **わざと消しても素通りした**（2026-09-05）。⚠ **中身を見ていなかった。**
      {
        const 節 = 節を切る("連絡先");
        if (節) {
          // ⚠ **カードごとに切る**（2026-09-05 に踏んだ）。
          //   ⚠ **節ごと見ると、⚠ 隣のカードの字を拾う**
          //   （⚠ GitHub の側から「公開の場」を消したのに、
          //    ⚠ メールの側の「公開の場に書きたくないことは」を拾って素通りした）。
          const 札 = [...節.matchAll(/<li class="cards__i">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
          const 公開 = 札.find((x) => /github\.com/.test(x)) ?? "";
          const 非公開 = 札.find((x) => /mailto:/.test(x)) ?? "";
          const 要る = [
            ["公開の場（GitHub）へ行けること", 公開, /github\.com\/[\w-]+\/konjaku\/issues/],
            ["公開の場だという断り", 公開, /公開の場/],
            ["誰でも読めるという断り", 公開, /誰でも読め/],
            ["メール", 非公開, /mailto:[^"]+@/],
            // ⚠ **メールで受け取ったものの扱いへ渡す**（⚠ 書いていないことは、していない）
            ["扱いの行き先", 非公開, /\.\/privacy/],
          ];
          for (const [何, どこ, 印] of 要る)
            if (!印.test(どこ)) 欠け.push(`/about の連絡先に「${何}」が無い`);
          // ⚠ **`/privacy` と同じ言い方にする**（2026-09-05。Owner 指示）。
          //   ⚠ **2 か所で違うと、⚠ どちらかが嘘になる。**
          if (!/対応のため/.test(非公開))
            欠け.push("/about の連絡先が、⚠ 何に使うかを言っていない");
          for (const 狭い of ["返信のためだけ", "第三者へ渡しません"])
            if (非公開.includes(狭い))
              欠け.push(`/about の連絡先に、⚠ 狭い言い方が残っている: ${狭い}`);
          // ⚠ **規約と同じアドレスを名乗ること**（⚠ 2 か所で違うと、⚠ どちらかが嘘になる）
          const a = 節.match(/mailto:([^"]+)/)?.[1];
          const TERMS = readFileSync(join(NEXT, "terms.html"), "utf8");
          const b = TERMS.match(/mailto:([^"]+)/)?.[1];
          if (a && b && a !== b)
            欠け.push(`/about と利用規約で連絡先が違う: ${a} ／ ${b}`);
          if (!b) 欠け.push("利用規約が連絡先のメールを名乗っていない");
        }
      }
      for (const [名, 外, 中, 数] of 器) {
        const 節 = 節を切る(名);
        if (節 === null) { 欠け.push(`/about に「${名}」の節が無い`); continue; }
        if (!外.test(節)) { 欠け.push(`/about の「${名}」が構造になっていない`); continue; }
        const n = (節.match(中) ?? []).length;
        if (n !== 数) 欠け.push(`/about の「${名}」が ${n} 個（⚠ ${数} 個と決めてある）`);
      }
      if (!/<p class="flow" aria-hidden="true">/.test(ABOUT))
        欠け.push("/about の「送るものと、預けるもの」に図が無い");
      // ⚠ **印はフォントに頼らない**（⚠ 2026-09-02 に ☾ が豆腐になった）。
      //   ⚠ **`/deep` と同じ形**（⚠ 16 の格子・`currentColor`）。
      const 印 = [...ABOUT.matchAll(/<svg class="about__icon"[^>]*>/g)].map((m) => m[0]);
      if (印.length < 14) 欠け.push(`/about の印が ${印.length} 個しかない（⚠ 3+4+4+5+2）`);
      for (const x of 印) {
        if (!/aria-hidden="true"/.test(x)) 欠け.push("印が読み上げから外れていない");
        if (!/stroke="currentColor"/.test(x)) 欠け.push("印が色みに追いてこない（currentColor でない）");
        if (!/viewBox="0 0 16 16"/.test(x)) 欠け.push(`印の格子が /deep と違う: ${x.slice(0, 60)}`);
      }
      // ⚠ **画面の `⚠` は災害リスク専用**（⚠ 断りの箱に使わない）。
      const 本文 = ABOUT.replace(/<[^>]+>/g, " ");
      if (本文.includes("⚠")) 欠け.push("/about の字に ⚠ がある（⚠ 災害リスク専用）");
      // ⚠ **押せるものではないので、⚠ 枠は `--line`**（⚠ `--line-strong` は押せるものの輪郭）。
      const CSS = readFileSync(join(NEXT, "about.css"), "utf8");
      for (const k of ["steps__i", "cards__i", "flow"])
        if (new RegExp(`\\.${k}\\{[^}]*--line-strong`).test(CSS))
          欠け.push(`.${k} が --line-strong を使っている（⚠ 押せるものの輪郭）`);
    }

    // ⚠ 4. ⚠ **読み終えた人の出口。**⚠ **行き先まで見る**（⚠ 字だけだと、⚠ どこへも行かない）。
    const 出口 = ABOUT.match(/<a class="about__goLink" href="([^"]*)"[^>]*>([^<]*)<\/a>/);
    if (!出口) 欠け.push("/about に、読み終えた人の出口（.about__goLink）が無い");
    else {
      if (出口[1] !== "./") 欠け.push(`/about の出口の行き先がトップではない: ${出口[1]}`);
      if (!/さあ、はじめる/.test(出口[2])) 欠け.push(`/about の出口の字が決めた形ではない: ${出口[2]}`);
    }

    // ⚠ 5. ⚠ **入口と出口は、⚠ 同じ「地図へ行く」ボタン。**⚠ **同じ大きさで出す**
    //   （2026-09-03。Owner 指示）。
    //   ⚠ **実測（2026-09-03・375×667）**: ⚠ **上 335×52・16px ／ 下 155×44・15px。**
    //   ⚠ **同じことをする 2 つが違う大きさだと、⚠ 下のほうが弱い選択肢に見える。**
    // ⚠ **px はここに書かない。**⚠ **「1 か所が両方を決めている」ことだけを見る**
    //   （⚠ 数は走者が出す。`CLAUDE.md` §9）。
    {
      const CSS2 = readFileSync(join(NEXT, "about.css"), "utf8");
      // ⚠ **`.about__goLink` に、⚠ 自前の大きさを持たせない**（⚠ 持つと 2 か所になる）。
      //   ⚠ **規則を切り出してから、⚠ 相手が「それだけ」の規則かを見る。**
      //   ⚠ **`\n.about__goLink{` で拾うと、⚠ 束ねた並びの 2 行目を単独と読み違える**
      //     （⚠ 実際に踏んだ。⚠ 揃えたのに「2 か所にある」と出た）。
      for (const m of CSS2.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const 並び = m[1].split(",").map((x) => x.trim()).filter(Boolean);
        if (並び.length !== 1 || 並び[0] !== ".about__goLink") continue;
        if (/min-height|font-size|display/.test(m[2]))
          欠け.push("/about の出口が、自分だけの大きさを持っている（⚠ 入口と 2 か所になる）");
      }
      // ⚠ **同じ規則が、⚠ 入口と出口の両方を決めていること**
      const 束 = CSS2.match(/\.entry__cta,\s*\n?\s*\.about__goLink\{([^}]*)\}/);
      if (!束) 欠け.push("/about の入口と出口を、⚠ 1 つの規則で決めていない");
      else for (const k of ["min-height", "font-size", "display"])
        if (!new RegExp(k).test(束[1])) 欠け.push(`/about の入口と出口で、${k} を揃えていない`);
    }

    // ⚠ 6. ⚠ **冒頭の 1 組。**⚠ **今昔の実画面から作った、⚠ 作り置きの画像**
    //   （2026-09-02。Owner 判断。`docs/adr/0084`）。
    //   ⚠ **実行時にタイルを読まない。**⚠ **読み物から、⚠ 読者の接続元を配信元へ出さないため。**
    //     ⚠ **/about は、⚠ いま外へ 1 本も出していない**（⚠ 実描画が見ている）。
    //   ⚠ **出典と、⚠ こちらで加工したことを、⚠ 必ず添える。**
    {
      // ⚠ **2026-09-02 に、⚠ 冒頭を「入口」に作り替えた**（`docs/adr/0087`）。
      //   ⚠ **問い → 昔 → いま → 地図へ の 4 つを、⚠ 最初の画面に入れる。**
      //   ⚠ **見るものは変わっていない**（⚠ 2 枚・寸法・alt・出典と加工の断り）。
      const 入口 = ABOUT.match(/<div class="entry">([\s\S]*?)<\/div>/);
      const 図 = ABOUT.match(/<figure class="entry__pair">([\s\S]*?)<\/figure>/);
      if (!入口 || !図) {
        欠け.push("/about の冒頭に、今昔の実画面の 1 組（.entry__pair）が無い");
      } else {
        const 中 = 図[1];
        const 絵 = [...中.matchAll(/<img[^>]*class="entry__img"[^>]*>/g)].map((m) => m[0]);
        // ⚠ **問いが、⚠ 見出しであること**（⚠ 「このサイトについて」ではなく、⚠ 価値を先に言う）
        if (!/<h1 class="entry__q">[^<]*なんだった[^<]*<\/h1>/.test(入口[1]))
          欠け.push("/about の見出しが、⚠ 問いになっていない");
        // ⚠ **地図へ行く道が、⚠ 入口の中にあること**（⚠ 読み終える前に行ける）
        const 道 = 入口[1].match(/<a class="entry__cta" href="([^"]*)"[^>]*>([^<]*)<\/a>/);
        if (!道) 欠け.push("/about の入口に、⚠ 地図へ行く道（.entry__cta）が無い");
        else if (道[1] !== "./") 欠け.push(`/about の入口の道が、⚠ 地図を指していない: ${道[1]}`);
        // ⚠ **絵の名前は、⚠ 絵の上に重ねる**（⚠ 下に置くと、⚠ 道が最初の画面から出る）
        const 札 = [...中.matchAll(/<span class="entry__tag">([^<]*)<\/span>/g)].map((m) => m[1].trim());
        if (札.length !== 2) 欠け.push(`冒頭の絵の名前が 2 つではない（${札.length} 個）`);
        if (new Set(札).size !== 札.length) 欠け.push(`冒頭の絵の名前が重なっている: ${札.join(" ／ ")}`);
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
        const 断り = 入口[1].match(/<p class="about__figSrc">([\s\S]*?)<\/p>/);
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

  // ---- ⚠ ㉓ 狭い幅で畳むとき、⚠ 散歩中に要るものまで畳んでいないか ----
  // ⚠ **実測（2026-09-03・375×667・春日部）**: ⚠ **板が画面の 57%、⚠ 見える地図は 130px しかなかった。**
  //   ⚠ **「どこの話か」を地図から読み取れない**（`docs/adr/0091`。Owner 判断）。
  // ⚠ **畳んだのは、⚠ 写真の年代・根拠・凡例。**
  //   ⚠ **答え・出典・2 行目・名乗り・保存・3 手の帯は畳まない**（⚠ ADR 0083 は維持）。
  // ⚠ **実際に畳めているか・開くか・場所を変えると閉じるかは実描画が見る。**
  //   ⚠ **ここが見るのは、⚠ 器の中身の割り振りと、⚠ 幅の数を 2 か所に持っていないこと。**
  {
    const 欠け = [];
    const html = readFileSync(join(NEXT, "index.html"), "utf8");
    const css = readFileSync(join(NEXT, "top.css"), "utf8");
    const js = readFileSync(join(NEXT, "top.js"), "utf8");

    // ⚠ **器そのもの。**⚠ **`<details>` で作る**（⚠ 開閉を自前で持たない）。
    // ⚠ **入れ子を数えて切り出す**（⚠ 中に `#why` の `<details>` が入っている。
    //   ⚠ **非貪欲な正規表現だと、⚠ そこで閉じたことにして、⚠ 凡例が「外にある」と誤報した**）。
    const 切る = () => {
      const i = html.search(/<details[^>]*id="fold"[^>]*>/);
      if (i < 0) return null;
      const 始 = html.indexOf(">", i) + 1;
      let 深さ = 1, j = 始;
      const 印 = /<details\b|<\/details>/g; 印.lastIndex = 始;
      for (let m; (m = 印.exec(html)); ) {
        深さ += m[0] === "</details>" ? -1 : 1;
        if (深さ === 0) { j = m.index; break; }
      }
      return 深さ === 0 ? html.slice(始, j) : null;
    };
    const 中 = 切る();
    if (中 === null) 欠け.push("狭い幅で畳む器（#fold）が無い（⚠ 閉じていない）");
    else {
      // ⚠ **押す口が、⚠ 器の中にあること**（⚠ 外に置くと `<details>` が開かない）。
      if (!/<summary[^>]*class="fold__sum"[^>]*>[^<]*くわしく見る/.test(中))
        欠け.push("開く口（くわしく見る）が、器の中に無い");
      // ⚠ **開いた状態を覚えない**（Owner 判断）。⚠ **`open` を書き置かない。**
      if (/<details[^>]*id="fold"[^>]*\sopen/.test(html))
        欠け.push("器に open が書いてある（⚠ 開いた状態は覚えないと決めてある）");
      if (/localStorage[^\n]*fold/.test(js))
        欠け.push("開いた状態を localStorage に覚えている（⚠ 覚えないと決めてある）");

      // ⚠ **畳む側**（⚠ 立ち止まって読むもの）
      for (const id of ["erasLabel", "eras", "eraNote", "eraBack", "why", "legend", "more"])
        if (!new RegExp(`id="${id}"`).test(中))
          欠け.push(`${id} が畳む器の外にある（⚠ 初期表示で地図を圧迫する）`);
      // ⚠ **畳まない側**（⚠ 散歩中に、⚠ 数秒で要るもの）
      for (const [id, なに] of [
        ["gloss", "答え"], ["glossSrc", "出典"], ["sub", "2 行目（成り立ち）"],
        ["kickText", "名乗り（どこの話か）"], ["save", "保存"], ["steps", "3 手の帯"],
      ]) {
        if (!new RegExp(`id="${id}"`).test(html)) { 欠け.push(`${なに}（#${id}）が無い`); continue; }
        if (new RegExp(`id="${id}"`).test(中)) 欠け.push(`${なに}（#${id}）まで畳んでいる`);
      }
    }

    // ⚠ **幅の数を 2 か所に持たない**（`CLAUDE.md` §3）。
    //   ⚠ **畳むかどうかは CSS の 1 か所が決め、⚠ JavaScript はそれを読むだけ。**
    //   ⚠ **実際に一度 `matchMedia("(min-width:700px)")` と書いて、⚠ ここで落ちている。**
    if (!/\.fold::before\s*\{[^}]*content\s*:/.test(css))
      欠け.push("畳むかどうかを CSS（.fold::before）が決めていない");
    if (!/@media\s*\(min-width:\s*700px\)[\s\S]{0,200}\.fold::before\s*\{[^}]*content\s*:\s*"open"/.test(css))
      欠け.push("広い幅で畳まない指定（.fold::before の content:\"open\"）が無い");
    // ⚠ **`clientWidth` は見ない**（⚠ 地図の器の寸法に使っており、⚠ 幅の分岐ではない）。
    //   ⚠ **見るのは「幅で分岐する道具」と「幅の数そのもの」。**
    const 素 = js.replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
    if (/matchMedia/.test(素))
      欠け.push("JavaScript が matchMedia で幅を見ている（⚠ 幅の数は CSS の 1 か所だけが持つ）");
    if (/\b700\b/.test(素))
      欠け.push("JavaScript に幅の数（700）が書いてある（⚠ CSS と 2 か所になる）");
    if (!/getComputedStyle\([^)]*fold[^)]*,\s*"::before"\)/.test(js))
      欠け.push("JavaScript が、CSS の決めた畳み方を読んでいない");

    // ⚠ **広い幅では、⚠ 押す口を出さない**（⚠ 押しても何も起きない導線を置かない。ADR 0026）。
    if (!/@media\s*\(min-width:\s*700px\)[\s\S]{0,200}\.fold__sum\s*\{[^}]*display\s*:\s*none/.test(css))
      欠け.push("広い幅で、開く口を隠していない（⚠ 畳まないのに押す口だけ出る）");

    欠け.length
      ? bad(`狭い幅の畳み方が壊れている: ${欠け.join(" ／ ")}`)
      : ok("狭い幅では写真の年代・根拠・凡例を畳み、⚠ 答え・出典・2 行目・名乗り・保存・3 手は畳まない"
          + "（⚠ 幅の数は CSS の 1 か所。⚠ 開いた状態は覚えない）");
  }

  // ---- ⚠ ㉔ この先で土地が変わる、が 1 地点だけで、⚠ 探索画面になっていないか ----
  // ⚠ **v0.3.0 のテーマ**（2026-09-05。Owner 判断。`docs/adr/0092`）。
  //   ⚠ **`/peel` の「別の場所を探す導線を足さない」を、⚠ このテーマのために動かした。**
  //   ⚠ **動かしたぶん、⚠ ガードレールを検査で固定する**（⚠ 規則だけでは約束にしかならない）。
  //
  // ⚠ **実測（2026-09-04・24 地点・z16・3×3 タイル・上限 600m）**:
  //   ⚠ **出せる 17 地点（71%）／ 足元が無い 7 地点（29%）。**
  //   ⚠ **距離は 9〜283m・中央値 100m。**⚠ **「歩いて向かう場所」ではない。**
  //   ⚠ **数はここに書かない。**⚠ **走者（`scripts/survey-border.mjs`）が出す。**
  {
    const 欠け = [];
    const html = readFileSync(join(NEXT, "deep.html"), "utf8");
    // ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ **落とさないと、
    //   ⚠ この節を説明したコメントの字を、⚠ 検査自身が拾う**（⚠ 実際に 2 件拾った）。
    const 素 = (f) => readFileSync(join(NEXT, f), "utf8")
      .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, " ");
    const js = 素("deep.js");
    const ans = readFileSync(join(NEXT, "answer.js"), "utf8");

    // ⚠ **器そのもの。**⚠ **既定で出さない**（⚠ 出せない土地では節ごと出さない）。
    const 節 = html.match(/<section[^>]*id="borderSec"[^>]*>([\s\S]*?)<\/section>/);
    if (!節) 欠け.push("/deep に「この先で、土地が変わる」の節が無い");
    else {
      if (!/<section[^>]*id="borderSec"[^>]*\shidden/.test(html))
        欠け.push("borderSec が既定で hidden ではない（⚠ 出せない土地でも出てしまう）");
      // ⚠ **1 地点だけ。**⚠ **一覧にしない**（⚠ 別の場所を探す画面にしない）。
      const 行き先の数 = (節[1].match(/id="borderTo"/g) ?? []).length;
      if (行き先の数 !== 1) 欠け.push(`行き先が ${行き先の数} 個ある（⚠ 1 地点だけと決めてある）`);
      for (const 悪 of [/<ul\b/, /<ol\b/, /<li\b/])
        if (悪.test(節[1])) 欠け.push("この節が一覧になっている（⚠ 探索画面にしない）");
      // ⚠ **押せる導線を持たない。**⚠ **押しても何も起きない導線を置かない**（ADR 0026）。
      //   ⚠ **ここは「そこに在るという事実」であって、⚠ 行き先ではない。**
      for (const 悪 of [/<a\b/, /<button\b/, /<input\b/])
        if (悪.test(節[1])) 欠け.push("この節に押せるものがある（⚠ ここは行き先ではない）");
    }

    // ⚠ **字は `answer.js` が持つ**（`domain.md`）。⚠ **画面のコードが字を決めない。**
    //   ⚠ **字を書き写さない。**⚠ **製品から借りて、⚠ 画面のコードに無いことを見る。**
    const 帯 = ans.match(/const BORDER = \{[\s\S]*?\n  \};/)?.[0] ?? "";
    if (!帯) 欠け.push("answer.js の BORDER を読めない（⚠ この検査が何も見ていない）");
    else {
      const 見出し = 帯.match(/見出し:\s*"([^"]+)"/)?.[1];
      if (!見出し) 欠け.push("answer.js が、この節の見出しを持っていない");
      else if (js.includes(見出し)) 欠け.push(`deep.js が見出しの字を決めている: 「${見出し}」`);
      // ⚠ **「地面」とも「土地が変わる」とも言わない**（2026-09-05。Owner 指摘）。
      //   ⚠ **向こうが「水部」のことがある。**⚠ **水部は土地ではない。**
      //   ⚠ **`/` と同じく「境目」で言う**（⚠ 2 画面で言い方をそろえた）。
      for (const [何, 印] of [["地面", /地面/], ["土地が変わる", /土地が.*変わ/]])
        if (印.test(見出し ?? "")) 欠け.push(`見出しが「${何}」と言っている: 「${見出し}」`);
      if (!/境目/.test(見出し ?? "")) 欠け.push(`見出しが「境目」と言っていない: 「${見出し}」`);
      // ⚠ **文も同じ。**⚠ **「A から B に変わります」は、⚠ B が水部のとき矛盾する。**
      const 文 = 帯.match(/文:\s*\([^)]*\)\s*=>\s*`([^`]*)`/)?.[1] ?? "";
      if (!文) 欠け.push("answer.js の文を読めない");
      else {
        if (/変わ/.test(文)) 欠け.push(`文が「変わる」と言っている: 「${文}」`);
        if (!/境目/.test(文)) 欠け.push(`文が「境目」と言っていない: 「${文}」`);
        for (const [何, 印] of [["どこから", /\$\{from\}/], ["どこへ", /\$\{to\}/]])
          if (!印.test(文)) 欠け.push(`文に「${何}」が無い: 「${文}」`);
      }
    }
    for (const 字 of ["現地の見た目が変わるとは限りません"])
      if (js.includes(字)) 欠け.push(`deep.js が字を決めている: 「${字}」`);
    // ⚠ **現地の見た目の話にしない**（⚠ 地図の上の区分の境目でしかない）。
    if (!/現地の見た目が変わるとは限りません/.test(帯))
      欠け.push("断り（現地の見た目が変わるとは限らない）が無い");
    if (!/出典[^\n]*国土地理院/.test(帯)) 欠け.push("出典（国土地理院）を名乗っていない");

    // ⚠ **所要時間を出さない**（⚠ 実測していない。⚠ 歩く速さも道のりも知らない）。
    for (const 悪 of [/徒歩\s*約?\s*\d/, /\d+\s*分(で|ほど|くらい|程度)/, /所要/])
      if (悪.test(帯) || 悪.test(js)) 欠け.push("所要時間を出している（⚠ 実測していない）");

    // ⚠ **ここもコメントを落としてから見る**（⚠ 落とさずに 1 本素通りさせた。
    //   ⚠ 説明の JSDoc に `{ state:"足元が無い" }` と書いてあり、⚠ それを拾っていた）。
    const bor = 素("border.js");
    // ⚠ **判定は `border.js` の 1 か所**（⚠ 同じ問いに答える実装を 2 つ持たない）。
    if (!/KonjakuBorder/.test(素("verify.js")))
      欠け.push("verify.js が border.js を使っていない（⚠ 判定を 2 か所に持たない）");
    // ⚠ **対照表を渡していること**（⚠ 渡さないと、⚠ 名前が同じものを境目にしてしまう）
    if (!/名前:\s*tbl\?\.codes/.test(素("verify.js")))
      欠け.push("verify.js が border.js へ対照表を渡していない（⚠ 名前が同じものを弾けない）");
    for (const 悪 of ["document.", "window.", "fetch("])
      if (bor.includes(悪))
        欠け.push(`border.js が ${悪} を触っている（⚠ DOM も地図も fetch も持たない）`);
    // ⚠ **「無い」と「読めなかった」と「見えている範囲に無い」を分ける**（掟の一行目）。
    for (const st of ["足元が無い", "見えない", "遠い"])
      if (!bor.includes(`"${st}"`)) 欠け.push(`border.js が「${st}」を言い分けていない`);

    // ⚠ **字を読むだけでは足りない。**⚠ **実際に走らせて、⚠ 言い分けを確かめる。**
    //   ⚠ **ここでしか見つからないものがある**（⚠ 実描画は、⚠ 見えている範囲の外を作れない）。
    //   ⚠ **`ground.js` と同じ作法で借りる**（⚠ ブラウザ抜きで回る形にしてある）。
    {
      const win = {};
      try { new Function("window", "module", readFileSync(join(NEXT, "border.js"), "utf8"))(win, undefined); }
      catch (e) { 欠け.push(`border.js を読めない: ${e.message}`); }
      const B = win.KonjakuBorder;
      if (!B) 欠け.push("border.js の口を読めていない（⚠ この検査が何も見ていない）");
      else {
        // ⚠ **東西に並べた 2 つの面。**⚠ **境目は経度 0。**⚠ **点は西側。**
        const 面 = (code, x0, x1) => ({ properties: { code }, geometry: { type: "Polygon",
          coordinates: [[[x0, -0.02], [x1, -0.02], [x1, 0.02], [x0, 0.02], [x0, -0.02]]] } });
        const 西 = 面("A", -0.02, 0), 東 = 面("B", 0, 0.02);

        // ⚠ 1. ⚠ **別の区分が在れば、⚠ 距離と方角を出す**
        const a = B.境目([西, 東], -0.0005, 0, { 見えている範囲m: 900 });
        if (a.state !== "ok" || a.toCode !== "B" || a.方角 !== "東")
          欠け.push(`境目を出せていない: ${JSON.stringify(a)}`);

        // ⚠ 2. ⚠ **同じ区分の継ぎ目は、⚠ 境目ではない**（2026-09-05 に踏んだ）
        const b = B.境目([西, 面("A", 0, 0.005), 面("B", 0.005, 0.02)], -0.0005, 0,
          { 見えている範囲m: 900 });
        if (b.state === "ok" && b.m < 100)
          欠け.push(`同じ区分の継ぎ目を境目と数えている: ${JSON.stringify(b)}`);

        // ⚠ 3. ⚠ **見えている範囲の外を、⚠ 「在る」と言わない**（掟の一行目）。
        //   ⚠ **実描画では作れない形**（⚠ あちらは世界を 1 色に塗るしかない）。
        const c = B.境目([面("A", -0.02, 0.004), 面("B", 0.004, 0.02)], -0.0005, 0,
          { 見えている範囲m: 100 });
        if (c.state !== "見えない")
          欠け.push(`見えている範囲の外を「在る」と言っている: ${JSON.stringify(c)}`);

        // ⚠ 4. ⚠ **足元に区分が無いとき、⚠ 「境目が無い」と言わない**
        const d = B.境目([東], -0.01, 0, { 見えている範囲m: 900 });
        if (d.state !== "足元が無い")
          欠け.push(`足元が無いのに、別のことを言っている: ${JSON.stringify(d)}`);

        // ⚠ 5. ⚠ **上限より遠い境目は出さない**（⚠ 歩いて確かめられる範囲まで）
        const e = B.境目([面("A", -0.02, 0.01), 面("B", 0.01, 0.02)], -0.0005, 0,
          { 見えている範囲m: 5000 });
        if (e.state !== "遠い") 欠け.push(`上限より遠い境目を出している: ${JSON.stringify(e)}`);

        // ⚠ 6. ⚠ **コードが違っても、⚠ 表示名が同じなら境目にしない**（2026-09-05 に踏んだ）。
        //   ⚠ **実測: 仙台で「台地･段丘 → 台地･段丘」と出た。**
        //   ⚠ **画面に出るのは名前なので、⚠ 「同じものとの境目」に見える。**
        const 同名 = B.境目([西, 東], -0.0005, 0,
          { 見えている範囲m: 900, 名前: { A: "台地･段丘", B: "台地･段丘" } });
        if (同名.state === "ok")
          欠け.push(`表示名が同じものを境目にしている: ${JSON.stringify(同名)}`);
        // ⚠ **名前が違えば、⚠ ちゃんと出す**（⚠ 何でも弾く形になっていないか）
        const 別名 = B.境目([西, 東], -0.0005, 0,
          { 見えている範囲m: 900, 名前: { A: "台地･段丘", B: "水部" } });
        if (別名.state !== "ok" || 別名.toCode !== "B")
          欠け.push(`名前が違うのに境目を出していない: ${JSON.stringify(別名)}`);
        // ⚠ **対照表を渡さないときは、⚠ コードだけで見分ける**（⚠ 前と同じ挙動に落ちる）
        const 表なし = B.境目([西, 東], -0.0005, 0, { 見えている範囲m: 900 });
        if (表なし.state !== "ok")
          欠け.push(`対照表が無いときに、⚠ 境目を出さなくなっている: ${JSON.stringify(表なし)}`);
      }
    }

    // ⚠ **`docs/SPEC.md` が言っていることと、⚠ 画面が食い違っていないか**（2026-09-05）。
    //   ⚠ **SPEC は「何が言えるか」の正本。**⚠ **画面のガードレールと、⚠ 別々に古くならないようにする。**
    //   ⚠ **数はここに書かない。**⚠ **SPEC の字と、⚠ 画面の実物を突き合わせる。**
    {
      const SPEC = readFileSync(join(ROOT, "docs/SPEC.md"), "utf8");
      const 行 = SPEC.split("\n").find((l) => /この先で、土地が変わる/.test(l));
      if (!行) 欠け.push("docs/SPEC.md が「この先で、土地が変わる」を知らない");
      else {
        // ⚠ **1 地点だけ、と言っていること**（⚠ 画面もそうなっている）
        if (!/1 地点/.test(行)) 欠け.push(`SPEC が「1 地点だけ」と言っていない: ${行.slice(0, 60)}`);
        // ⚠ **限界を書いていること**（⚠ 現地の見た目・読んだ範囲・出せない土地）
        for (const [何, 印] of [
          ["現地の見た目とは別だという断り", /現地の見た目/],
          ["読んだ範囲の外は「無い」ではないこと", /読んでいない/],
          ["出せない土地があること", /出せない土地/],
        ]) if (!印.test(行)) 欠け.push(`SPEC の「この先で、土地が変わる」に${何}が無い`);
      }
    }

    // ⚠ **散歩中の画面（`/`）にも 1 行だけ出す**（2026-09-05。Owner 判断）。
    //   ⚠ **`/deep` は詳しい提示、⚠ `/` は気づきだけ**（⚠ 役割を分ける）。
    //   ⚠ **見出しを足さない。**⚠ **1 行だけで意味が通ること。**
    //   ⚠ **押せる導線にしない**（⚠ `/deep` と同じ）。
    {
      const TOP = readFileSync(join(NEXT, "index.html"), "utf8");
      const 行 = TOP.match(/<p class="edge" id="edge"[^>]*>([\s\S]*?)<\/p>/);
      if (!行) 欠け.push("/ に「この先で、土地が変わる」の 1 行が無い");
      else {
        // ⚠ **既定で出さない**（⚠ 出せない土地では行ごと出さない）
        if (!/<p class="edge" id="edge"[^>]*\shidden/.test(TOP))
          欠け.push("/ の 1 行が既定で hidden ではない（⚠ 出せない土地でも出てしまう）");
        // ⚠ **押せる導線を持たない**
        for (const 悪 of [/<a\b/, /<button\b/])
          if (悪.test(行[1])) 欠け.push("/ の 1 行に押せるものがある（⚠ ここは行き先ではない）");
        // ⚠ **見出しを足さない**（⚠ 板は畳んだばかり。⚠ 段を増やさない）
        if (/<h[1-6]\b/.test(行[1])) 欠け.push("/ の 1 行に見出しが足されている");
      }
      // ⚠ **字は answer.js が持つ**（⚠ `/` 用の 1 行）
      if (!/一行:\s*\(/.test(ans)) 欠け.push("answer.js が、/ 用の 1 行を持っていない");
      const 一行 = ans.match(/一行:\s*\([^)]*\)\s*=>\s*`([^`]*)`/)?.[1] ?? "";
      if (!一行) 欠け.push("answer.js の 1 行を読めない（⚠ この検査が何も見ていない）");
      else {
        // ⚠ **1 行だけで意味が通ること**（⚠ 見出しが無い。⚠ 何が変わるのかを、⚠ その行が言う）
        for (const [何, 印] of [["方角", /\$\{方角\}/], ["距離", /\$\{距離\}/],
                                ["向こう側の区分", /\$\{to\}/],
                                // ⚠ **何の話かを、⚠ その行が言う**（2026-09-05。Owner 指示）。
                                //   ⚠ **前は「土地が … に変わります」だった。**
                                //   ⚠ **向こうが「水部」のとき、⚠ 土地が水になると読めた。**
                                //   ⚠ **水部は土地ではない。**⚠ **「境目がある」と言う形にした。**
                                ["何の話か", /境目/]])
          if (!印.test(一行)) 欠け.push(`/ の 1 行に「${何}」が無い: 「${一行}」`);
        // ⚠ **土地が別のものに「変わる」とは言わない**（⚠ 向こうが水部のことがある）
        for (const 狭い of ["土地が", "地面が"])
          if (一行.includes(狭い))
            欠け.push(`/ の 1 行が「${狭い}」と言っている（⚠ 向こうが水部のことがある）: 「${一行}」`);
      }
      // ⚠ **判定は border.js の 1 か所**（⚠ / も /deep も同じものを使う）
      const 素top = 素("top.js");
      if (!/Konjaku\.border\(/.test(素top))
        欠け.push("top.js が border.js の判定を使っていない（⚠ 判定を 2 か所に持たない）");
      // ⚠ **古い結果で、いまの画面を上書きしない**（`.claude/rules/javascript.md`）。
      //   ⚠ **名前が在るだけでは足りない**（⚠ わざと壊しても素通りした）。
      //   ⚠ **増やす行と、⚠ 比べる行の両方を見る。**
      //   ⚠ **これは字の検査で、⚠ 挙動の証明ではない。**⚠ **そう分かるように書く。**
      for (const [何, 印] of [
        ["番号を増やす行", /\+\+\s*境目の番/],
        ["いまの番号と比べる行", /!==\s*境目の番/],
      ]) if (!印.test(素top))
        欠け.push(`top.js の「古い結果を捨てる」に${何}が無い（⚠ 名前だけでは効かない）`);
    }

    欠け.length
      ? bad(`この先で土地が変わる、の作りが壊れている: ${欠け.join(" ／ ")}`)
      : ok("この先で土地が変わるは、⚠ 1 地点だけ・⚠ 押せる導線なし・⚠ 所要時間なしで、"
          + "⚠ 字は answer.js が持ち、⚠ 判定は border.js の 1 か所（⚠ 3 通りを言い分ける）");
  }

  // ---- ⚠ ㉕ 文字の大きさが、⚠ 段の外へ散っていないか ----
  // ⚠ **色は `theme.css` の 1 か所に集まったが、⚠ 文字は直書きのままだった**
  //   （hidetzu/konjaku#455）。⚠ **実測（2026-09-05）**: ⚠ **15 種・143 か所。**
  //   ⚠ **4 日で上位 4 つが +23 か所増えていた**（⚠ 放っておくと増え続ける）。
  //
  // ⚠ **上位 5 つだけを段にした**（2026-09-05。Owner 判断）。⚠ **117 か所を寄せた。**
  //   ⚠ **残りの 26 か所は直書きのまま。**⚠ **そこは落とさない**（⚠ 決めた範囲の外）。
  //   ⚠ **見た目は 1px も変えていない**（⚠ 14 画面・1829 要素を前後で突き合わせた）。
  //
  // ⚠ **見るのは 2 つ。**⚠ **段が在ること。**⚠ **段に在る値を、⚠ 直書きで書かないこと。**
  {
    const 欠け = [];
    const theme = readFileSync(join(NEXT, "theme.css"), "utf8");
    // ⚠ **段は `theme.css` の 1 か所**（⚠ 色と同じ形）
    const 段 = {};
    for (const m of theme.matchAll(/--text-([\w-]+)\s*:\s*([^;]+);/g)) 段[`--text-${m[1]}`] = m[2].trim();
    if (Object.keys(段).length < 5)
      欠け.push(`文字の段が ${Object.keys(段).length} 個しかない（⚠ 5 段と決めてある）`);

    // ⚠ **段に在る値を、⚠ 直書きで書かない**（⚠ 段の外に同じ値が生えたら落とす）
    const 値の名 = new Map(Object.entries(段).map(([k, v]) => [v, k]));
    const 直書き = [];
    for (const f of readdirSync(NEXT).filter((x) => x.endsWith(".css"))) {
      const src = readFileSync(join(NEXT, f), "utf8").replace(BLOCK_COMMENT, " ");
      for (const m of src.matchAll(/font-size:\s*([^;}\s]+)/g)) {
        const v = m[1].trim();
        if (値の名.has(v)) 直書き.push(`${f}: font-size:${v}（⚠ var(${値の名.get(v)}) にする）`);
      }
    }
    if (直書き.length)
      欠け.push(`段に在る値を、⚠ 直書きしている: ${[...new Set(直書き)].join(" ／ ")}`);

    欠け.length
      ? bad(`文字の大きさが段の外へ散っている: ${欠け.join(" ／ ")}`)
      : ok(`文字の大きさは、⚠ ${Object.keys(段).length} 段が theme.css の 1 か所にあり、`
          + "⚠ 段に在る値を直書きしていない（⚠ 段の外の値は、⚠ まだ直書きのまま）");
  }

  // ⚠ **㉖ 静的に配っているものを取る口は 1 か所**（hidetzu/konjaku#99）。
  //
  // ⚠ **実測（2026-09-05・`172a680`）**: ⚠ **7 か所 / 4 ファイルで取っていた。**
  //   ⚠ **時間切れを持っていたのは 2 本だけ。**
  //   ⚠ **失敗したときの返し方も `null` / 例外 / `{ok:false}` とばらばらだった。**
  //
  // ⚠ **ばらばらだと、⚠ 「取れなかった」を「無い」に化けさせる経路が口の数だけ増える**
  //   （掟 §1）。⚠ **実際に踏んでいる**（2026-08-29。⚠ 資料を読めなくしても、
  //   ⚠ 画面は資料が無い場所とまったく同じだった）。
  //
  // ⚠ **外へ出る取得は、⚠ ここでは見ない**（⚠ 地理院・J-SHIS・受け渡しの API は別のスライス）。
  {
    const 欠け = [];
    const 口 = "static-json.js";
    if (!existsSync(join(NEXT, 口))) 欠け.push(`${口} が無い（⚠ この検査が何も見ていない）`);

    // ⚠ **配り物へ `fetch(` を直に向けている場所が無いこと。**
    //   ⚠ **コメントを先に落とす**（`CLAUDE.md` §5。⚠ 落とさないと、⚠ 説明の字を拾う）。
    const 直 = [];
    for (const f of readdirSync(NEXT).filter((x) => /\.(js|html)$/.test(x))) {
      if (f === 口) continue;
      const src = readFileSync(join(NEXT, f), "utf8")
        .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
      for (const m of src.matchAll(/fetch\(\s*[`"'][^`"']*data\//g))
        直.push(`${f}: ${m[0].trim()}`);
    }
    if (直.length) 欠け.push(`配り物を直に取りに行っている: ${直.join(" ／ ")}`);

    // ⚠ **口を読み込んでいる画面が、⚠ 口を使う相手より先に読んでいること。**
    //   ⚠ **classic script は上から順に走る。**⚠ **後ろだと、⚠ 使う側から見えない。**
    for (const [html, 使う] of [["index.html", ["verify.js", "top.js"]],
                                ["deep.html", ["verify.js", "deep.js"]]]) {
      const src = readFileSync(join(NEXT, html), "utf8");
      const 位置 = (n) => src.indexOf(`./${n}"`);
      if (位置(口) < 0) { 欠け.push(`${html} が ${口} を読み込んでいない`); continue; }
      for (const n of 使う)
        if (位置(n) >= 0 && 位置(n) < 位置(口))
          欠け.push(`${html} が ${n} を ${口} より先に読んでいる（⚠ 使う側から見えない）`);
    }

    // ⚠ **口が、⚠ 「無い」を返さないこと**（⚠ 返す形は 2 つだけ）。
    //   ⚠ **`absent` を返せるようにすると、⚠ 配信の失敗が「無い」に化ける道ができる。**
    if (existsSync(join(NEXT, 口))) {
      const src = readFileSync(join(NEXT, 口), "utf8")
        .replace(BLOCK_COMMENT, " ").replace(HEAD_COMMENT, "");
      const 状態 = new Set([...src.matchAll(/state:\s*"(\w+)"/g)].map((m) => m[1]));
      if (!状態.has("ok") || !状態.has("unreachable"))
        欠け.push(`${口} が ok / unreachable を返していない（⚠ 返す形が違う）`);
      if (状態.has("absent"))
        欠け.push(`${口} が absent を返している（⚠ 配信の失敗を「無い」に化けさせない）`);
      if (!/AbortSignal\.timeout/.test(src))
        欠け.push(`${口} が時間切れを持っていない（⚠ 揃える先がここ）`);
    }

    欠け.length
      ? bad(`静的に配っているものを取る口が 1 か所になっていない: ${欠け.join(" ／ ")}`)
      : ok("静的に配っているものを取る口は static-json.js の 1 か所"
          + "（⚠ 時間切れと失敗の返し方も、⚠ そこが持つ）");
  }

}
