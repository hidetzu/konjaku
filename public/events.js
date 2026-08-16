// この写真の範囲に、その時点までにできていたもの。
//
// ⚠ これは「その年のニュース」ではない。**言い方を変えているのではなく、主張を変えている。**
//   「1964年、東京オリンピック開催」は、その土地の話ではないうえ、
//   点座標に置くと「ここで起きた」と読める（実測: 豊洲の最古は「1942 東京空襲」だった）。
//   一方「開業年 ≤ 撮影年なら、撮影時に存在していた」は推論ではなく含意で、
//   年と座標が正しければ必ず正しい。だからこちらだけを言う。
//
// ⚠ 年代は「範囲」で持っている（1936–42 など）。判定に使うのは**範囲の先頭**。
//   1940年にできたものが 1936–42 の写真に写っているかは分からないので、
//   「1936年までにできていたもの」だけを出す。取りこぼす代わりに、間違えない。
//
// ⚠ 「写っている」とは言わない。範囲に**ある**とだけ言う。
//   小さい建物や、木の陰は写真から確認できない。確認できるのは座標と年だけ。
//
// 出典: Wikidata（CC0）。項目ごとにリンクを出す。
//   実行時に問い合わせているので、止まりうる依存（掟: 外部APIは「止まりうる依存」として扱う）。
//   止まったときは「取れなかった」と言い、「無い」とは言わない（掟: 取れなかったを「無い」と言わない）。
window.KonjakuEvents = (function () {
  "use strict";

  const ENDPOINT = "https://query.wikidata.org/sparql";
  const TIMEOUT_MS = 8000;                 // verify.js と揃える
  const OK = "ok", ABSENT = "absent", UNREACHABLE = "unreachable";

  // タイルの四隅を経緯度に戻す。span=2 なら 2×2（写真に出している範囲と同じ）
  function tileBounds(x, y, z, span) {
    const n = 2 ** z;
    const lon = (X) => X / n * 360 - 180;
    const lat = (Y) => {
      const t = Math.PI - 2 * Math.PI * Y / n;
      return 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
    };
    const k = span ?? 1;
    return { w: lon(x), e: lon(x + k), n: lat(y), s: lat(y + k) };
  }

  // 年が分かっているものだけを、この矩形から拾う。
  //   P1619 正式開業日 / P571 設立・建設 / P580 開始日
  // ⚠ 団体・企業・行政区画・出来事は外す。設立年は「その場所にできた年」ではない
  //   （実測: 「1947 日本鉄道技術協会」の座標は現在の所在地）。
  const QUERY = (b) => `
SELECT ?item ?itemLabel ?desc ?date ?dateP ?until ?coord WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${b.w} ${b.s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${b.e} ${b.n})"^^geo:wktLiteral .
  }
  # ⚠ 精度も取る。取らないと「20世紀」の記録（timeValue は 1900-01-01）が
  #   「1900年」として並び、1985年築のものが 1936年の写真に「あった」と出る。
  #   取り込み側だけ直して**こちらを直さないと、取り込み済みかどうかで答えが変わる**。
  #   実測: 福徳神社は 静的「900 世紀」／実行時「900年」。公開後は大半がこの経路。
  OPTIONAL { ?item p:P1619/psv:P1619 [ wikibase:timeValue ?o ; wikibase:timePrecision ?op ] }
  OPTIONAL { ?item p:P571 /psv:P571  [ wikibase:timeValue ?b2; wikibase:timePrecision ?bp ] }
  OPTIONAL { ?item p:P580 /psv:P580  [ wikibase:timeValue ?s2; wikibase:timePrecision ?sp ] }
  BIND(COALESCE(?o, ?b2, ?s2) AS ?date)
  BIND(COALESCE(?op, ?bp, ?sp) AS ?dateP)
  FILTER(BOUND(?date))
  # ⚠ 終わった年も取る。これが無いと「いまある」に、いま無いものが並ぶ。
  #   実測: 渋谷で 渋谷城（16世紀に廃城）・並木橋駅（1945年廃止）・
  #   東急百貨店東横店（2020年閉店・解体）を「いまこの範囲にあるもの」に出していた。
  #   「開業年 ≤ 撮影年なら存在していた」は**過去にしか効かない含意**で、
  #   現在について言うには使えない。ここを混ぜていたのが誤りだった。
  #     P576 解散・廃止・撤去された日 / P582 終了日
  OPTIONAL { ?item wdt:P576 ?gone }
  OPTIONAL { ?item wdt:P582 ?ended }
  BIND(COALESCE(?gone, ?ended) AS ?until)
  # ⚠ 日本語の一行説明。取り込み側（ingest-wikidata.mjs）と同じことを訊く。
  #   片方だけ足すと、取り込み済みの土地と実行時に問い合わせる土地で
  #   一覧の見え方が変わる（precision で一度やった失敗と同じ形）。
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "ja") }
  ?item wdt:P31/wdt:P279* ?kind .
  VALUES ?kind {
    wd:Q41176   # 建物
    wd:Q811979  # 建造物
    wd:Q719456  # 停車場（駅）
    wd:Q3947    # 住宅
    wd:Q3918    # 大学
    wd:Q3914    # 学校
    wd:Q16917   # 病院
    wd:Q12280   # 橋
    wd:Q22698   # 公園
    wd:Q34442   # 道路
    wd:Q728937  # 鉄道路線
    wd:Q44782   # 港
    wd:Q1248784 # 空港
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
}
LIMIT 120`;

  const cache = new Map();

  // ---- 取り込み済みのタイル（静的配信） ----
  // ⚠ ここを先に見る。取り込んであれば、実行時に Wikidata を叩かなくて済む
  //   （止まりうる依存が1つ減り、待ち時間も消える）。
  // ⚠ 「取り込んだが0件」と「まだ取り込んでいない」を区別する。
  //   索引に載っていないタイル＝**知らない**。0件＝**調べた結果、無かった**。
  //   混ぜると「無い」と「知らない」が同じ顔になる（掟: 取れなかったを「無い」と言わない と同じ話）。
  // ⚠ 索引が読めなかったことだけを覚えておく。
  //   それが起きると、取り込み済みの土地でも全部が実行時 Wikidata に流れる。
  //   毎回 health を送ると /t が1件増えて天井が下がるので、**壊れたときだけ**言う。
  let indexP = null, indexBroken = false;
  function coveredIndex() {
    if (!indexP) indexP = fetch("./data/ev/index.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) { indexBroken = true; return null; } return r.json(); })
      .catch(() => { indexBroken = true; return null; });
    return indexP;
  }
  // 表示している範囲（2×2 の z16）が載っている z14 タイルを全部取る
  // ⚠ 四隅の経緯度から z14 を出してはいけない。
  //   枠の東端・南端がちょうどタイル境界に乗ると、**内側にかかっていない隣タイル**が
  //   必要リストに入り、それが未整備なら静的をあきらめる。
  //   実測で、内側が全部覆われている枠 345枚のうち **71枚（21%）** がこれで
  //   「分かっていません」と言っていた（既に持っているデータについて）。
  //   z16 タイルの添字から出せば、境界の丸めが起きない（z14 = z16 >> 2）。
  async function fromStatic(b, box) {
    const idx = await coveredIndex();
    if (!idx?.tiles || !idx.sub) return null;
    const SUB = idx.sub, S = Math.log2(SUB);        // z12 → z14 は 2段
    // 表示枠（z16 の 2×2）が乗る z14 を、添字から出す（丸めが起きない）
    const need = [];
    for (let x = box.x0 >> 2; x <= (box.x0 + 1) >> 2; x++)
      for (let y = box.y0 >> 2; y <= (box.y0 + 1) >> 2; y++) need.push([x, y]);
    // ⚠ 「見た範囲」の単位は z14 のまま。配り方だけが z12 に束ねてある。
    //   1枚でも見ていない z14 があれば、静的だけでは答えられない
    //   （欠けたまま「これで全部」と言わない）。
    const files = new Set();
    for (const [x, y] of need) {
      const bx = x >> S, by = y >> S;
      const mask = idx.tiles[`${bx}/${by}`];
      if (mask == null) return null;
      const bit = 1 << (((y - by * SUB) * SUB) + (x - bx * SUB));
      if (!(mask & bit)) return null;               // その z14 は見ていない
      files.add(`${bx}/${by}`);
    }
    const got = await Promise.all([...files].map((k) =>
      fetch(`./data/ev/${idx.z}/${k}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    if (got.some((g) => !g)) return null;
    // ⚠ 束に書いてある「いつ見たか」「上限に当たったか」を持ち帰る。
    //   書き出してはいたが**読んでいなかった**ので、取りこぼしがあるかもしれない
    //   ときでも「記録のある変化はありません」と断定していた。
    let at = null, truncated = false;
    for (const g of got) {
      if (!at || (g.at && g.at < at)) at = g.at;      // いちばん古い区画に合わせる
      if (g.truncated) truncated = true;
    }
    const seen = new Map();
    for (const g of got) for (const f of g.f) {
      if (f.c[0] < b.w || f.c[0] > b.e || f.c[1] < b.s || f.c[1] > b.n) continue;
      seen.set(f.id, { id: f.id, label: f.l, kind: f.k, lon: f.c[0], lat: f.c[1],
        // ⚠ 精度が入っていないタイルは「年精度」ではない。**分からない**。
        //   持っていない精度を与えないほうへ倒す（実行時側・取り込み側と同じ扱い）。
        //   ⚠ 配布物に p が必ず入っていることは scripts/check.mjs が全件で見ている。
        year: f.y[0], until: f.y[1] ?? null, precision: f.p ?? "century", url: f.u,
        note: f.n ?? null, from: "static" });
    }
    return { items: [...seen.values()].sort((a, c) => a.year - c.year), at, truncated };
  }

  // 返すのは3状態。取れなかったことを「無い」と言わない
  // ⚠ 探す範囲は、写真に出している範囲と同じにする。
  //   広く探すと、写真の外にあるものが一覧に出て、押しても印が打てない。
  //   実測: 1枚（z16 ≒ 600m×450m）では豊洲 2件・浦安 0件で、判断できるだけの数が出なかった。
  let idxBroken = false;
  async function around(z, box) {
    const key = `${z}/${box.x0}/${box.y0}`;
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      const b = tileBounds(box.x0, box.y0, z, 2);
      // 取り込み済みなら、そこで終わり（外へ出ない）
      try {
        const st = await fromStatic(b, box);
        if (st) return { state: st.items.length ? OK : ABSENT, items: st.items,
          from: "static", at: st.at, truncated: st.truncated };
        if (indexBroken) idxBroken = true;
      } catch { /* 静的が読めなければ、下の取得へ落ちる */ }
      try {
        const url = `${ENDPOINT}?query=${encodeURIComponent(QUERY(b))}`;
        const r = await fetch(url, {
          headers: { Accept: "application/sparql-results+json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) { cache.delete(key); return { state: UNREACHABLE, items: [], status: r.status }; }
        const j = await r.json();
        const seen = new Map();
        for (const row of j.results.bindings) {
          const id = row.item.value;
          // ⚠ 先頭4文字で切らない。紀元前は "-0500-01-01" なので "-050" → **-50** になる
          //   （取り込み側は正しく -500 と読む。同じ問いに2つの実装があるのが原因）
          const yr = (v) => { const m = /^(-?\d{1,4})/.exec((v ?? "").replace(/^\+/, ""));
            return m ? Number(m[1]) : NaN; };
          const year = yr(row.date?.value);
          const label = row.itemLabel?.value ?? "";
          // 日本語ラベルが無いと Q番号が返る。番号だけ出しても読めない
          if (!Number.isFinite(year) || /^Q\d+$/.test(label)) continue;
          const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? "");
          if (!m) continue;
          // ⚠ 「(看板)」のような、写真では確かめようのない対象は入れない（実測で混ざっていた）
          if (/[（(](看板|レプリカ)[）)]/.test(label)) continue;
          // ⚠ Number("") は NaN ではなく **0**。空文字をそのまま通すと
          //   「西暦0年に無くなった」ことになり、終了年を持たないもの（＝大多数）が全部消える。
          //   検査を固定データにした瞬間にこれが出た（本物のデータでも同じく全滅していた）。
          const u = yr(row.until?.value);
          const until = Number.isFinite(u) ? u : null;
          const cur = seen.get(id);
          if (!cur || cur.year > year)
            seen.set(id, { id, label, year, until: until ?? cur?.until ?? null,
              // ⚠ **取り込み側（scripts/ingest-wikidata.mjs の prec）と同じ表にする。**
              //   以前ここだけ「dateP が無ければ year」で、取り込み側は「century」だった。
              //   同じ項目が、静的経路では 99年幅・実行時経路では 0年幅になり、
              //   **経路によって出る年代が変わる**（掟: 同じ問いに答える実装を2つ持たない）。
              //   持っていない精度を与えないほうへ倒す（＝ year ではなく century）。
              //   実測 2026-08-16: 配布 2,367 件のうち century は 7 件で、すべて下2桁 00。
              //   つまりこの既定は実データでは一度も効いていない。
              //   ⚠ 2つの表が一致していることは scripts/check.mjs が突き合わせている。
              precision: Number(row.dateP?.value) >= 9 ? "year"
                : Number(row.dateP?.value) === 8 ? "decade"
                : "century",
              url: `https://www.wikidata.org/wiki/${id.split("/").pop()}`,
              // 静的タイルの n と同じ中身（取れたまま。短くするのは描くとき）
              note: row.desc?.value || null,
              lon: +m[1], lat: +m[2] });
          else if (cur && until != null && cur.until == null) cur.until = until;
        }
        // ⚠ 枠の外は落とす。静的側にはこの絞りがあったが、こちらは
        //   wikibase:box の返り値を全面的に信じていた。実測で、経度999/緯度91 の項目が
        //   「この範囲にあったもの」として並び、写真の上に印は1つも打たれなかった
        //   （＝「一覧に出したものには必ず印がある」という不変条件も同時に崩れる）。
        const inBox = (f) => f.lon >= +b.w && f.lon <= +b.e && f.lat >= +b.s && f.lat <= +b.n;
        const items = [...seen.values()].filter(inBox).sort((a, b2) => a.year - b2.year);
        return { state: items.length ? OK : ABSENT, items, idxBroken };
      } catch (e) {
        cache.delete(key);
        return { state: UNREACHABLE, items: [], error: e.name, idxBroken };
      }
    })();
    cache.set(key, p);
    return p;
  }

  // 経緯度 → 2×2 モザイクの中の割合（0..1）。写真の上に印を打つために使う
  function fractionIn(lon, lat, z, box) {
    const n = 2 ** z;
    const xf = (lon + 180) / 360 * n;
    const r = lat * Math.PI / 180;
    const yf = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    return { x: (xf - box.x0) / 2, y: (yf - box.y0) / 2 };
  }

  // 年代ラベル（"1936–42" / "現在"）から、判定に使う年を取る。
  // ⚠ 範囲の**先頭**を使う。1940年にできたものが 1936–42 の写真にあるかは分からない
  const yearOf = (label) => {
    if (!label || label === "現在") return new Date().getFullYear();
    const m = /^(\d{4})/.exec(label);
    return m ? Number(m[1]) : null;
  };

  return { around, fractionIn, yearOf, tileBounds };
})();
