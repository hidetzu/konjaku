// 静的検査 — 色み（⚠ **色は 1 か所か。⚠ どの色みでも読めるか。⚠ 出どころは見分けられるか**）
//
// ⚠ **hidetzu/konjaku#96 の 1 段目**（2026-08-26）。⚠ **色の定義を `public/css/theme.css` へ集めた回。**
//
// ⚠ **ここが守っているもの**:
//     色の出どころ    ⚠ 色の値は theme.css にしか無い（⚠ 2 か所にあると、片方だけ切り替わる）
//     名前の集合      ⚠ 色みどうしで名前が揃っている（⚠ 欠けると、前の色みの色がそこだけ残る）
//     読めるか        ⚠ **文字色 × 地／面のコントラストを実測する**（⚠ 数字を持たない主張をしない）
//     見分けられるか  ⚠ 実測／推定／欠落 の 3 色が、⚠ **どの色みでも互いに離れている**
//     届くか          ⚠ 両ページが読み込み、⚠ Service Worker の SHELL に入っている
//
// ⚠ **ここは「読めるか」までしか言えない**（`CLAUDE.md` §1）。
//   ⚠ **実際の画面がその色みで出るかは、⚠ ここでは分からない。**
//     ⚠ **色みを選ぶ操作は、⚠ まだ無い**（theme.css の見出しに書いてある）。
//     ⚠ **規則へ直に書いた色は 7 か所**（⚠ 実測 2026-08-26。⚠ **どれも決めた上で残している**）。
//     ⚠ だから ⚠ **「明るい色みが完成した」とは言わない。**⚠ **定義が読めることだけを言う。**
//
// ⚠ **道具は `test/check/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。
// ⚠ **色の計算だけは、ここが持つ**（⚠ 使うのがこの節だけだから。`lib.mjs` の書き出しと同じ考え）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUB, ok, bad, warn, head, src, BLOCK_COMMENT } from "./lib.mjs";

head("色み");

// ---------- 色の計算（⚠ **WCAG 2.1 の相対輝度と、⚠ CIELAB の色差**） ----------
// ⚠ **半透明は、⚠ 下の色に重ねてから測る。**⚠ 重ねずに測ると、
//   ⚠ **`rgba(12,16,22,.84)` を不透明の #0c1016 として測ることになり、⚠ 数字が実際と違う。**
// ⚠ **無いものを渡されても落とさない**（⚠ 落ちると、⚠ **そこから下の検査が 1 件も走らない**。
//   ⚠ 2026-08-26 に実際にそうなった: ⚠ 色を 1 つ消して試したら、⚠ **検査ごと止まった**）。
const parseColor = (s) => {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (t.startsWith("#")) {
    const h = t.slice(1).length === 3 ? [...t.slice(1)].map((c) => c + c).join("") : t.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
      .concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
  }
  const m = /rgba?\(([^)]+)\)/.exec(t);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  return p.length < 3 || p.some(Number.isNaN) ? null : [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
const isColor = (s) => parseColor(s) !== null;
// ⚠ 前景 fg を背景 bg の上に重ねた、⚠ **実際に目に入る色**
const composite = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const luminance = ([r, g, b]) => {
  const f = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// ⚠ **色差は CIELAB の距離（ΔE76）**。⚠ **明るさだけの比では「見分けられる」を測れない**
//   （⚠ 実測／推定 は明るさがほぼ同じで、⚠ 違うのは色相のほう）。
// ⚠ **ΔE76 は青と緑で人の感覚とずれる**ことが知られている。⚠ **ここでは「離れている」の
//   ⚠ 目安としてだけ使い、⚠ 「誰にでも見分けられる」とは言わない**（⚠ 色覚の違いは別の話）。
const toLab = ([r, g, b]) => {
  const f = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = (0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const k = (v) => v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
  return [116 * k(y) - 16, 500 * (k(x) - k(y)), 200 * (k(y) - k(z))];
};
const deltaE = (a, b) => {
  const [A, B] = [toLab(a), toLab(b)];
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

// ---------- theme.css を読む ----------
const themeCss = await readFile(join(PUB, "css", "theme.css"), "utf8").catch(() => "");
// ⚠ **コメントを先に落とす**（`CLAUDE.md` §5）。⚠ 落とさないと、
//   ⚠ **theme.css の見出しに書いた実測値（`1.51` など）を、⚠ 宣言として拾う。**
// ⚠ **入れ子を数えて読む**（2026-08-26。⚠ **`@media` の中に色みが入った**）。
//   ⚠ **選択子と中身を 1 つの正規表現で取る形では読めない**（`@media (…) {` の中で全部ずれる）。
//   ⚠ **鍵は「どの `@media` の中か ＋ セレクタ」**にする（⚠ 素の `:root` と区別するため）。
const blocks = new Map();
{
  const css = themeCss.replace(BLOCK_COMMENT, " ");
  const stack = [];
  let buf = "";
  const put = (decl) => {
    const sel = stack.filter((x) => !x.startsWith("@")).join(" ");
    const at = stack.filter((x) => x.startsWith("@")).join(" ");
    if (!sel) return;
    const key = at ? `${at} ${sel}` : sel;
    const d = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (!d) return;
    if (!blocks.has(key)) blocks.set(key, {});
    blocks.get(key)[d[1]] = d[2].trim();
  };
  for (const ch of css) {
    if (ch === "{") { stack.push(buf.trim().replace(/\s+/g, " ")); buf = ""; }
    else if (ch === "}") { put(buf); stack.pop(); buf = ""; }
    else if (ch === ";") { put(buf); buf = ""; }
    else buf += ch;
  }
}

// ⚠ **色みと文脈の一覧。**⚠ **ここが theme.css と食い違ったら落とす**（下ですぐ見る）。
const MQ = "@media (prefers-color-scheme: light)";
const DARK = ":root", LIGHT = `${MQ} :root`;
const DARK_MAP = ':root[data-backdrop="map"]', LIGHT_MAP = `${MQ} :root[data-backdrop="map"]`;
const SURFACES = [
  ["暗い色み", DARK, null],
  ["暗い色み・地図の上", DARK_MAP, DARK],
  ["明るい色み", LIGHT, null],
  ["明るい色み・地図の上", LIGHT_MAP, LIGHT],
];

if (!themeCss) bad("public/css/theme.css を読めない（⚠ この検査が何も見ていない）");
else if (SURFACES.some(([, sel]) => !blocks.has(sel)))
  bad(`theme.css に色みの節が足りない: ${SURFACES.filter(([, s]) => !blocks.has(s)).map(([n]) => n).join("、")}`
    + `（⚠ 検査が見ている名前と、⚠ theme.css の書き方が食い違っている）`);
else {

  // ---------- ① 色の値は theme.css にしか無い ----------
  // ⚠ **2 か所にあると、⚠ 色みを足したとき片方だけ切り替わる。**
  //   ⚠ 実際にそうなっていた（2026-08-26 まで）: `--bg` などが index.html と peel.html に、
  //     ⚠ **同じ名前・違う値**で置かれていた。
  // ⚠ **見るのは 2 つだけ。**
  //     ⚠ theme.css が持つ名前が、⚠ **他所でも定義されていないこと**
  //     ⚠ 画面の根（`:root` / `html`）に、⚠ **色の宣言が 1 つも無いこと**
  // ⚠ **部品の中に閉じた色（`#list{--why:…}` など）は咎めない。**⚠ **画面全体の地ではない。**
  // ⚠ **規則へ直に書いた色（`.prov.ok{background:rgba(…)}` など）も咎めない。**
  //   ⚠ **7 か所ある**（実測 2026-08-26。⚠ 地図の暈し・完全な透明・mask）。⚠ **どれも意図して残している**で、
  //     ⚠ **いま落とすと、⚠ この検査が「直せない指摘」を出し続けることになる。**
  {
    const names = new Set(Object.keys(blocks.get(DARK)));
    const styleOf = (t) => (/<style>([\s\S]*?)<\/style>/.exec(t ?? "")?.[1] ?? "")
      .replace(BLOCK_COMMENT, " ");
    const tokens = (await readFile(join(PUB, "css", "tokens.css"), "utf8").catch(() => ""))
      .replace(BLOCK_COMMENT, " ");
    const elsewhere = [];
    for (const [f, css] of [["css/tokens.css", tokens],
                            ["index.html", styleOf(src["index.html"])],
                            ["peel.html", styleOf(src["peel.html"])]]) {
      for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g))
        if (names.has(m[1])) elsewhere.push(`${f} の ${m[1]}（theme.css と二重）`);
      // ⚠ **画面の根に色を書き戻していないか**（⚠ 名前を変えて逃げても、ここで捕まる）
      for (const b of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(^|,)\s*(:root|html)\b/.test(b[1])) continue;
        for (const m of b[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g))
          if (isColor(m[2])) elsewhere.push(`${f} の ${b[1].trim()} に ${m[1]}`);
      }
    }
    elsewhere.length
      ? bad(`色の値が theme.css の外にある: ${[...new Set(elsewhere)].join("、")}`
          + `（⚠ 2 か所にあると、⚠ 色みを足したとき片方だけ切り替わる）`)
      : ok(`色の値は public/css/theme.css の 1 か所（${names.size} 個。`
          + `⚠ tokens.css と 2 画面の :root には 1 つも無い）`);
  }

  // ---------- ② 色みどうしで名前が揃っている ----------
  // ⚠ **欠けても落ちない。**⚠ **切り替えたとき、⚠ そこだけ前の色みの色が残るだけ。**
  //   ⚠ **画面は何も言わない。**⚠ だから機械で見る。
  {
    const diff = (aSel, bSel) => {
      const a = new Set(Object.keys(blocks.get(aSel))), b = new Set(Object.keys(blocks.get(bSel)));
      return [...new Set([...a, ...b])].filter((k) => a.has(k) !== b.has(k));
    };
    const fails = [];
    const d1 = diff(DARK, LIGHT);
    if (d1.length) fails.push(`暗い色みと明るい色みで違う: ${d1.join("、")}`);
    const d2 = diff(DARK_MAP, LIGHT_MAP);
    if (d2.length) fails.push(`地図の上で、暗いと明るいで違う: ${d2.join("、")}`);
    // ⚠ **地図の上は「上書き」なので、⚠ 地の色みが持っていない名前を足せない**
    //   （⚠ 足すと、⚠ 地図の上でだけ存在する色になり、⚠ 他の画面で定義の無い変数になる）。
    const extra = Object.keys(blocks.get(DARK_MAP)).filter((k) => !(k in blocks.get(DARK)));
    if (extra.length) fails.push(`地図の上にしかない色がある: ${extra.join("、")}`);
    fails.length
      ? bad(`色みどうしで名前が揃っていない: ${fails.join(" / ")}`
          + `（⚠ 欠けると、⚠ 切り替えたときにそこだけ前の色みの色が残る）`)
      : ok(`色みどうしで名前が揃っている（地 ${Object.keys(blocks.get(DARK)).length} 個 ／ `
          + `地図の上の上書き ${Object.keys(blocks.get(DARK_MAP)).length} 個）`);
  }

  // ---------- ③ 文字と地のコントラストを実測する ----------
  // ⚠ **「暗いほうで見やすい」だけを見ない**（Issue の Verification）。⚠ **4 つとも測る。**
  // ⚠ **面（--surface）は半透明のことがある**ので、⚠ **地に重ねた実際の色の上で測る。**
  //
  // ⚠ **いま届いていないものは、⚠ 一覧に書いて残す**（⚠ 「満たしている」と言わない）。
  //   ⚠ **`--ink-faint` は、⚠ 移す前から 4.5 に届いていない**（⚠ この Issue が作った不足ではない）。
  //   ⚠ **値は運んだだけで、⚠ 1 つも変えていない。**⚠ **直すかどうかは別の判断。**
  //   ⚠ **悪くなったら落ちる**ように、⚠ **実測値そのものを下限として持つ。**
  const AA = 4.5;
  // ⚠ **空**（2026-08-27・hidetzu/konjaku#306 で 0 件になった）。
  //   ⚠ 前は `--ink-faint` を 2 件許していた（暗い色み 3.82 ／ 暗い色み・地図の上 4.15）。
  //   ⚠ **色を上げて届かせたので、⚠ 一覧から外した。**
  //   ⚠ **外し忘れると、⚠ 甘い下限がそのまま残る**（⚠ **落ちなくなる**）。
  // ⚠ **増やすときは、⚠ ここに実測値と一緒に書く。**⚠ **書けば「達成」とは言わなくなる。**
  const KNOWN_SHORT = [];   // [色み, 色, いまの実測の最小値]  ⚠ **これより下がったら落とす**
  // ⚠ **地／面の上に載る文字**（2026-08-26 に 6 色足した。hidetzu/konjaku#96 の 4 段目）。
  //   ⚠ **`--action-ink` はここに入れない。**⚠ **地ではなく `--action` の上に載る**（⑧ が見る）。
  //   ⚠ **`--wash` / `--shadow` も入れない。**⚠ 文字ではない。
  //   ⚠ **`--ink-ghost` も入れない。**⚠ **文字として読ませない飾り**（⚠ 区切りの点）。
  //     ⚠ コントラストは 2.02 で、⚠ **入れると落ちる。**⚠ **落ちるのが正しい**ので、⚠ 入れない。
  //     ⚠ **数字は下の枠と一緒に名乗る**（⚠ 黙って外さない）。
  const INK = ["--ink", "--ink-2", "--ink-3", "--ink-dim", "--ink-faint", "--action", "--water", "--land",
               "--evidence", "--estimate", "--missing", "--mine",
               "--evidence-ink", "--estimate-ink", "--land-ink", "--water-ink"];
  {
    const fails = [], short = [], said = [];
    for (const [name, sel, baseSel] of SURFACES) {
      const t = { ...(baseSel ? blocks.get(baseSel) : {}), ...blocks.get(sel) };
      const bg = parseColor(t["--bg"]), surfaceRaw = parseColor(t["--surface"]);
      if (!bg || !surfaceRaw) { fails.push(`${name} に地（--bg）か面（--surface）が無い`); continue; }
      const surface = composite(surfaceRaw, bg);
      let worst = Infinity, worstOf = "";
      for (const v of INK) {
        const fg = parseColor(t[v]);
        if (!fg) { fails.push(`${name} に ${v} が無い`); continue; }
        const r = Math.min(contrast(composite(fg, bg), bg), contrast(composite(fg, surface), surface));
        const known = KNOWN_SHORT.find(([n, c]) => n === name && c === v);
        if (known) {
          if (r < known[2] - 0.005)
            fails.push(`${name} の ${v} が ${known[2].toFixed(2)} → ${r.toFixed(2)} に下がった`);
          else short.push(`${name} の ${v} ${r.toFixed(2)}`);
        } else if (r < AA) {
          fails.push(`${name} の ${v} が ${r.toFixed(2)}（${AA} 未満）`);
        }
        if (r < worst) { worst = r; worstOf = v; }
      }
      said.push(`${name} 最小 ${worst.toFixed(2)}（${worstOf}）`);
    }
    fails.length
      ? bad(`文字と地のコントラストが足りない: ${fails.join(" / ")}`
          + `（⚠ 出どころの 3 色は文字色にも使っている。⚠ 薄いまま置くと読めない）`)
      : ok(`4 つの色みで、文字 ${INK.length} 色 × 地／面のコントラストを実測（${said.join(" ／ ")}）`
          + (short.length ? `。⚠ **${AA} に届いていないものが ${short.length} 件ある**: ${short.join("、")}`
                             : `。⚠ **${AA} に届いていないものは 1 件も無い**`));
  }

  // ---------- ④ 枠（--line）は、非文字の下限に届いていない ----------
  // ⚠ **落とさない。**⚠ **この Issue が言っているのは「文字と地」**（Acceptance Criteria 3）。
  //   ⚠ **枠は、⚠ 移す前から届いていない。**⚠ **数字だけ残して、⚠ 次に判断できるようにする。**
  {
    const said = [];
    for (const [name, sel, baseSel] of SURFACES) {
      const t = { ...(baseSel ? blocks.get(baseSel) : {}), ...blocks.get(sel) };
      const bg = parseColor(t["--bg"]), line = parseColor(t["--line"]);
      said.push(bg && line ? `${name} ${contrast(composite(line, bg), bg).toFixed(2)}`
        : `${name} 測れない（地か枠が無い。⚠ 上の検査が落としている）`);
    }
    // ⚠ **飾りの点（--ink-ghost）も、⚠ ここで数字だけ出す**（⚠ 文字として数えていないので、
    //   ⚠ **黙って外したことにならないように**）。
    const ghost = SURFACES.map(([name, sel, baseSel]) => {
      const t = { ...(baseSel ? blocks.get(baseSel) : {}), ...blocks.get(sel) };
      const bg = parseColor(t["--bg"]), g = parseColor(t["--ink-ghost"]);
      return `${name} ${bg && g ? contrast(composite(g, bg), bg).toFixed(2) : "測れない"}`;
    });
    warn(`飾りの点（--ink-ghost）と地のコントラスト: ${ghost.join(" ／ ")}`
      + `（⚠ **文字として読ませないもの**。⚠ 上のコントラストの数には入れていない。`
      + `⚠ **ここに文を入れない**）`);
    warn(`枠（--line）と地のコントラスト: ${said.join(" ／ ")}`
      + `（⚠ 文字ではない部品の下限 3.0 に、⚠ **どの色みでも届いていない**。`
      + `⚠ 移す前からで、⚠ この Issue の対象は文字と地なので落とさない）`);
  }

  // ---------- ⑤ 出どころの 3 色が、互いに見分けられる ----------
  // ⚠ **この製品の核心**（`CLAUDE.md` §1）。⚠ **実測／推定／取れなかった が同じに見える色みは、
  //   ⚠ この製品では成立しない。**
  // ⚠ **明るさの比では測らない**（⚠ 実測 #7ee0a5 と 推定 #e6c47a は明るさがほぼ同じ）。
  const PROV = ["--evidence", "--estimate", "--missing"];
  const DE_FLOOR = 25;   // ⚠ **実測から決めた下限**（⚠ 下で名乗る値より低く置く）
  {
    const fails = [], said = [];
    for (const [name, sel, baseSel] of SURFACES) {
      const t = { ...(baseSel ? blocks.get(baseSel) : {}), ...blocks.get(sel) };
      if (!PROV.every((v) => t[v])) continue;   // ⚠ 地図の上は上書きだけ（②が漏れを見ている）
      let min = Infinity, of = "";
      for (let i = 0; i < PROV.length; i++) for (let j = i + 1; j < PROV.length; j++) {
        const d = deltaE(parseColor(t[PROV[i]]), parseColor(t[PROV[j]]));
        if (d < min) { min = d; of = `${PROV[i]} と ${PROV[j]}`; }
      }
      if (min < DE_FLOOR) fails.push(`${name} の ${of} が ΔE ${min.toFixed(1)}（${DE_FLOOR} 未満）`);
      said.push(`${name} 最小 ΔE ${min.toFixed(1)}`);
    }
    fails.length
      ? bad(`出どころの 3 色が見分けにくい色みがある: ${fails.join(" / ")}`
          + `（⚠ 実測／推定／取れなかった が同じに見える色みは、⚠ この製品では成立しない）`)
      : ok(`出どころの 3 色は、どの色みでも離れている（${said.join(" ／ ")}。ΔE76・下限 ${DE_FLOOR}）`);
  }

  // ---------- ⑥ 届いているか ----------
  // ⚠ **色を tokens.css から出したので、⚠ 読み込み忘れると画面の色が 1 つも決まらない。**
  //   ⚠ **Service Worker の SHELL に入れ忘れると、⚠ オフラインのときだけそうなる**
  //     （`.claude/rules/components.md` と同じ踏み方）。
  {
    const fails = [];
    for (const f of ["index.html", "peel.html"])
      if (!/href="\.\/css\/theme\.css"/.test(src[f] ?? "")) fails.push(`${f} が theme.css を読んでいない`);
    // ⚠ **/peel は地図の上に重なる。**⚠ 印が無いと、⚠ 面が不透明になって地図が隠れる
    if (!/<html[^>]*data-backdrop="map"/.test(src["peel.html"] ?? ""))
      fails.push("peel.html の html に data-backdrop=\"map\" が無い（地図の上の色が当たらない）");
    if (/<html[^>]*data-backdrop=/.test(src["index.html"] ?? ""))
      fails.push("index.html に data-backdrop が付いている（トップは地図の上ではない）");
    const sw = await readFile(join(PUB, "sw.js"), "utf8").catch(() => "");
    if (!/"\/css\/theme\.css"/.test(sw)) fails.push("sw.js の SHELL に /css/theme.css が無い（オフラインで色が消える）");
    // ⚠ **ブラウザの枠の色（`theme-color`）は、⚠ CSS 変数を書けない**（meta は解決しない）。
    //   ⚠ **だから値を写している。**⚠ **写した先は、⚠ 機械で突き合わせる**（`CLAUDE.md` §3）。
    //   ⚠ **1 行だけだと、⚠ 明るい端末で枠だけ暗いまま残る。**⚠ **色みごとに要る。**
    const want = { dark: blocks.get(DARK)["--bg"], light: blocks.get(LIGHT)["--bg"] };
    for (const f of ["index.html", "peel.html"]) {
      const metas = [...(src[f] ?? "").matchAll(
        /<meta\s+name="theme-color"\s+content="([^"]+)"\s+media="\(prefers-color-scheme:\s*(dark|light)\)"/g)];
      const got = Object.fromEntries(metas.map((m) => [m[2], m[1].trim()]));
      for (const k of ["dark", "light"]) {
        if (!got[k]) fails.push(`${f} に ${k} の theme-color が無い（枠の色が色みに追いてこない）`);
        else if (got[k].toLowerCase() !== want[k].toLowerCase())
          fails.push(`${f} の ${k} の theme-color が ${got[k]}（theme.css の --bg は ${want[k]}）`);
      }
      // ⚠ **media の付いていない theme-color を残さない**（⚠ 残すと、そちらが勝つ端末がある）
      if (/<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>/.test(src[f] ?? ""))
        fails.push(`${f} に media の無い theme-color が残っている`);
    }
    fails.length
      ? bad(`色みの定義が届かない経路がある: ${fails.join(" / ")}`)
      : ok("両ページが theme.css を読み、/peel に地図の上の印があり、SHELL に入っている。"
          + "⚠ ブラウザの枠の色も、⚠ 2 つの色みとも theme.css の --bg と一致");
  }

  // ---------- ⑧ 色の「上」に載る文字 ----------
  // ⚠ **2026-08-26・hidetzu/konjaku#96 の 4 段目。**
  //
  // ⚠ **`--action-ink` は、⚠ 地ではなく `--action` の上に載る。**
  //   ⚠ **③ の一覧に入れると、⚠ 暗い色みで「地に対して読めない」と落ちる**（⚠ 当たり前で、
  //     ⚠ **地の上には載らない色**だから）。⚠ **乗る相手に対して測る。**
  //
  // ⚠ **「`*-ink` は元の色より控えめ」は、⚠ 検査にしなかった**（2026-08-26）。
  //   ⚠ **足してみたら落ちた。**⚠ **いまの暗い色みがそうなっていない**:
  //     ⚠ `--water-ink`（8.88）は `--water`（7.14）より **強い**。
  //     ⚠ `--estimate-ink` は `--estimate` より **弱い**。⚠ **揃っていない。**
  //   ⚠ **検査は「守るべきこと」を固定する。**⚠ **いま成り立っていない主張を固定しない**
  //     （`CLAUDE.md` §9: ⚠ 検査を足すときは、⚠ その主張が本当に正しいかを疑う）。
  //   ⚠ **読めることは ③ が見ている。**⚠ ここで重ねて言わない。
  {
    const fails = [], said = [];
    for (const [name, sel, baseSel] of SURFACES) {
      const t = { ...(baseSel ? blocks.get(baseSel) : {}), ...blocks.get(sel) };
      const act = parseColor(t["--action"]), actInk = parseColor(t["--action-ink"]);
      if (!act || !actInk) { fails.push(`${name} に --action か --action-ink が無い`); continue; }
      const r = contrast(composite(actInk, act), act);
      if (r < AA) fails.push(`${name} の --action-ink が ${r.toFixed(2)}（${AA} 未満・乗る相手は --action）`);
      said.push(`${name} ${r.toFixed(2)}`);
    }
    fails.length
      ? bad(`操作の色の上に載る文字が読めない: ${fails.join(" / ")}`
          + `（⚠ 押されているボタンの字。⚠ 地ではなく --action の上に載る）`)
      : ok(`操作の色の上の文字は、⚠ **乗る相手（--action）に対して** ${AA} 以上（${said.join(" ／ ")}）`);
  }

  // ---------- ⑦ 意味を持つ色の「濃さ違い」を、規則へ直に書かない ----------
  // ⚠ **2026-08-26・hidetzu/konjaku#96 の 2 段目。**⚠ **43 か所を寄せた。**
  //
  // ⚠ **なぜ落とすか**: ⚠ `rgba(126,224,165,.09)` は ⚠ **`--evidence` の 9% の帯**だが、
  //   ⚠ **色みが変わっても、⚠ この字は変わらない。**⚠ **明るい色みで、⚠ 帯だけ暗い色のまま残る。**
  //   ⚠ **落ちない。**⚠ **「実測の帯」が、⚠ 実測の色と合わなくなるだけ**（`CLAUDE.md` §1）。
  //
  // ⚠ **寄せ方**: `color-mix(in srgb, var(--evidence) 9%, transparent)`。
  //   ⚠ **重ねたあとの画素まで同じ**（⚠ 2026-08-26 に 32 通りを実測）。
  //   ⚠ **`in srgb` と `transparent` の形でだけ同じ**。⚠ `in oklab` にすると値が変わるので、
  //     ⚠ **書き方そのものも見る。**
  {
    // ⚠ **`/peel` の `--bg` は別の値**（`#080b0f`）なので、⚠ **`var(--bg)` にすると値が変わる。**
    //   ⚠ **この回は「1 つも変えない」を守った。**⚠ 何色にするかを決めてから寄せる。
    // ⚠ **空**（2026-08-26 に 0 件になった）。⚠ **増やすときは、⚠ ここに理由と一緒に書く。**
    //   ⚠ 前は `/peel` の `rgba(11,14,19,.94)` を許していた（⚠ `--bg` にすると値が変わるので）。
    //   ⚠ **灰を段へ寄せた回に、⚠ 値が動くことを承知のうえで寄せた**ので、⚠ 一覧から外した。
    const ALLOW = [];
    const rgbOf = (s) => {
      const c = parseColor(s);
      return c && c[3] > 0 ? `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}` : null;
    };
    // ⚠ **地の色みの、⚠ 不透明な色だけ**を相手にする（⚠ 半透明どうしは重なり方が違う）
    const tokenOf = new Map();
    for (const [n, v] of Object.entries(blocks.get(DARK))) {
      const c = parseColor(v);
      if (c && c[3] === 1) tokenOf.set(rgbOf(v), n);
    }
    const styleOf = (t) => (/<style>([\s\S]*?)<\/style>/.exec(t ?? "")?.[1] ?? "");
    const era = await readFile(join(PUB, "components", "era-control", "era-control.css"), "utf8").catch(() => "");
    const hits = [], mixes = [], odd = [];
    let masked = 0;
    for (const [f, css0] of [["index.html", styleOf(src["index.html"])],
                             ["peel.html", styleOf(src["peel.html"])],
                             ["era-control.css", era]]) {
      // ⚠ **コメントを先に落とす**（⚠ この決めごとを説明した字を、⚠ この検査自身が拾う）
      // ⚠ **`mask-image` の中も落とす**（2026-08-26）。⚠ **あそこの `#000` は色ではない。**
      //   ⚠ `linear-gradient(transparent 0, #000 26px, …)` が言っているのは
      //     ⚠ **「ここから先を出す」**であって、⚠ **黒く塗るという意味ではない。**
      //   ⚠ **色みに寄せてはいけない。**⚠ **ここで見ないことを、⚠ 下で名乗る。**
      const css = css0.replace(BLOCK_COMMENT, " ")
        .replace(/(-webkit-)?mask-image\s*:[^;}]*/g, (m) => { masked++; return " "; });
      for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
        const tok = tokenOf.get(rgbOf(m[0]));
        if (!tok) continue;
        const raw = m[0].replace(/\s+/g, "");
        if (ALLOW.some(([af, av]) => af === f && av === raw)) continue;
        hits.push(`${f} の ${m[0]}（＝ ${tok}）`);
      }
      // ⚠ **寄せた側の書き方も見る。**⚠ `in srgb` ／ `transparent` 以外は値が変わる。
      // ⚠ **括弧を数えて切り出す。**⚠ `[^)]*` で切ると、⚠ **中の `var(--x)` の `)` で終わってしまい、
      //   ⚠ 1 つも拾えない**（⚠ 2026-08-26 に実際にそうなった。⚠ **わざと壊しても素通りした**）。
      for (let i = css.indexOf("color-mix("); i >= 0; i = css.indexOf("color-mix(", i + 1)) {
        let depth = 0, j = i + "color-mix".length;
        for (; j < css.length; j++) {
          if (css[j] === "(") depth++;
          else if (css[j] === ")" && --depth === 0) break;
        }
        const whole = css.slice(i, j + 1);
        mixes.push(whole);
        const inner = whole.slice("color-mix(".length, -1);
        const space = /^\s*in\s+([a-z-]+)/.exec(inner)?.[1];
        // ⚠ **最後の引数**（⚠ 中の括弧を数えてから、⚠ 一番外側の `,` で割る）
        let d = 0, last = "";
        for (const part of inner.split(",")) {
          if (d === 0) last = ""; else last += ",";
          last += part;
          d += (part.match(/\(/g) ?? []).length - (part.match(/\)/g) ?? []).length;
        }
        if (space !== "srgb" || last.trim() !== "transparent")
          odd.push(`${f}: color-mix(in ${space} … ${last.trim()}）`);
      }
    }
    hits.length
      ? bad(`意味を持つ色の濃さ違いを、規則へ直に書いている（${hits.length} か所）: ${hits.slice(0, 6).join("、")}`
          + `（⚠ 色みを変えても、⚠ この字は変わらない。`
          + `⚠ color-mix(in srgb, var(--…) N%, transparent) で書く）`)
      : odd.length
        ? bad(`color-mix の書き方が違う: ${odd.join("、")}`
            + `（⚠ in srgb と transparent の形でだけ、⚠ 元の rgba() と同じ画素になる）`)
        : ok(`意味を持つ色の濃さ違いは、全部その色から作っている（color-mix ${mixes.length} か所・`
            + `直書き 0 か所。⚠ **決めた上で残しているのは ${ALLOW.length} 件**`
            + `${ALLOW.length ? `: ${ALLOW.map(([f, v]) => `${f} の ${v}`).join("、")}` : ""}`
            + `。⚠ **mask-image の中は見ていない（${masked} 件）**— 色ではなく「隠す／出す」の指定）`);
  }
}
