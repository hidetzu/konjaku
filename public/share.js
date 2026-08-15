// 共有カードと、共有率の計測。掟: 唯一の指標は共有率 差分2。
//
// 地図のキャンバスは撮らない。preserveDrawingBuffer と汚染の判定が要るうえに、
// 絵として弱い（縮小した地図はどこの地図か分からない）。
// 代わりに、検証器が返した「事実の集合」から描く。
// したがって外部フォントも画像も読まず、地図が落ちていても出る。
//
// ⚠ 書くのは判定できたことだけ。取れなかったものは「読み込めていません」と書く。
//   共有カードは最も遠くまで届く画面なので、ここで断定すると被害が最も大きい（掟: 根拠のないことは書かない）。
window.KonjakuShare = (function (w) {
  "use strict";

  const W = 1200, H = 630;                 // OGP と同じ比率
  // 名乗り。⚠ **index.html の <h1> と同じ文字にする。**
  //   共有カードは SNS で画像だけが独立して流れるので、ここが看板の代わりになる。
  //   ⚠ 割れていたことがある（カードだけ旧い「その土地を知る」のまま外へ出ていた）。
  //   食い違いを止める検査が1つも無かったのが原因なので、npm run check が突き合わせる。
  const BANNER = "この土地は、昔なんだったのか？";
  const BG = "#0b0e13", FG = "#eaeef3", DIM = "#8b96a3";
  const WATER = "#5ba3e0", LAND = "#d8cfa8", EST = "#e6c47a";
  const WATERY = new Set(["水部", "旧水部", "河川敷･浜", "湖", "干拓地", "落堀"]);

  // ---- 計測 ----
  // 記録するのは「何が起きたか」だけ。地名も座標も送らない。
  // 失敗しても画面の動きを一切変えない（計測のために体験を壊さない）。
  function tick(ev) {
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/t", ev);
      else fetch("/t", { method: "POST", body: ev, keepalive: true }).catch(() => {});
    } catch { /* 計測は落ちてよい */ }
  }

  // 依存の生死。止まっても画面は誠実に「読み込めませんでした」と言うだけで、
  // こちらには何も届かない。共有率がゼロだったとき「面白くなかった」のか
  // 「壊れていた」のかを区別できるようにする（PO の指摘）。
  // ⚠ 送るのは「どの手法が読めたか」だけ。地名も座標も含まない
  // ⚠ 1判定につき **1件**に畳む。以前は4手法ぶん4件送っていた。
  //   実測で、判定を1回見るだけで /t が 5件（判定1＋生死4）飛んでいて、
  //   **Worker の呼び出し回数を決めていたのが計測そのもの**だった。
  //   落ちたものがあるときだけ、その名前を1件ずつ送る（原因は知りたい）。
  //   全部読めたときは "all:ok" の1件で足りる（分母になる）。
  function health(f) {
    const bad = [];
    for (const name of ["landform", "meiji", "elevation", "photos"]) {
      const fa = f?.byKey?.[name];
      if (!fa) continue;
      // 「整備対象外」は落ちたのではなく、そこにデータが無いだけ。生死とは別
      if (fa.state === "unreachable") bad.push(name);
    }
    if (bad.length) for (const name of bad) tick(`health:${name}:fail`);
    else tick("health:all:ok");
  }

  // ⚠ 「この範囲にできていたもの」を、どこから出したか。
  //   静的が壊れると全PVが実行時 Wikidata に流れるが、それが起きたことに
  //   気づく手段が無かった（health:all:ok のまま静かに起きる）。
  // ⚠ 壊れたときだけ。正常時に送ると /t が1件増え、無料枠の天井が下がる
  function events(state) { if (state === "fail") tick("health:events:fail"); }

  // 判定の結果を1語に畳む。分子（shared）と突き合わせる分母になる
  function outcome(f) {
    const l = f?.byKey?.landform;
    if (!l) return "judged.fail";
    if (l.state === "unreachable") return "judged.fail";
    if (!l.ok) return "judged.none";
    return l.fine ? "judged.ok" : "judged.coarse";
  }

  // ---- 描画 ----
  function roundRect(g, x, y, wd, ht, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + wd, y, x + wd, y + ht, r);
    g.arcTo(x + wd, y + ht, x, y + ht, r);
    g.arcTo(x, y + ht, x, y, r);
    g.arcTo(x, y, x + wd, y, r);
    g.closePath();
  }

  // 折り返して描き、次の y を返す
  function wrap(g, text, x, y, maxW, lh, max) {
    const chars = [...text];
    let line = "", n = 0;
    for (const c of chars) {
      const t = line + c;
      if (g.measureText(t).width > maxW && line) {
        g.fillText(line, x, y); y += lh; line = c; n++;
        if (max && n >= max) { g.fillText("…", x, y); return y + lh; }
      } else line = t;
    }
    if (line) { g.fillText(line, x, y); y += lh; }
    return y;
  }

  function pill(g, x, y, label, color) {
    g.font = "500 26px system-ui, sans-serif";
    const wd = g.measureText(label).width + 36;
    g.fillStyle = color + "1f";
    roundRect(g, x, y, wd, 46, 23); g.fill();
    g.strokeStyle = color + "59"; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color;
    g.fillText(label, x + 18, y + 31);
    return x + wd + 12;
  }

  // f = Konjaku.facts(...) の返り値、title = 地名
  function draw(f, title) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const l = f.byKey.landform, m = f.byKey.meiji, e = f.byKey.elevation, p = f.byKey.photos;
    const wet = l.ok && (WATERY.has(l.value) || WATERY.has(l.artificial ?? ""));
    const accent = wet ? WATER : LAND;

    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    // 上端の帯だけで水/陸を示す。塗りつぶすと文字が読みにくくなる
    g.fillStyle = accent; g.fillRect(0, 0, W, 6);

    g.fillStyle = DIM;
    g.font = "500 24px system-ui, sans-serif";
    // ⚠ **看板と同じ問いにする。** ここは「今昔 — その土地を知る」だった。
    //   看板は「カテゴリ名では何が起きるか分からない」として既に言い換えてあり
    //   （index.html の h1・掟: 看板は効能で名乗る）、**カードだけが旧い名乗りのまま**
    //   外へ配られていた。カード画像は SNS で単独に流れるので、ここが名乗りそのもの。
    //   ⚠ ブランド名は残す。カードだけ見た人が、何のサービスか辿れなくなる。
    //   ⚠ この文字列は index.html の h1 と一致していること（npm run check が見る）。
    g.fillText(`今昔 — ${BANNER}`, 64, 84);

    g.fillStyle = FG;
    g.font = "600 52px system-ui, sans-serif";
    g.fillText(title, 64, 156);

    // 1行目の主張。判定できていないときは、できていないと書く
    g.font = "600 40px system-ui, sans-serif";
    g.fillStyle = l.ok ? accent : EST;
    let y = 232;
    const head = l.ok
      ? (l.artificial ? `${l.value} で、いまは ${l.artificial}` : `${l.value}`)
      : (l.state === "unreachable" ? "いま読み込めませんでした" : "この地点にはデータがありません");
    y = wrap(g, head, 64, y, W - 128, 52, 2);

    // 成因は国土地理院の記述をそのまま
    if (l.ok && l.why) {
      g.font = "400 25px system-ui, sans-serif";
      g.fillStyle = DIM;
      y = wrap(g, l.why, 64, y + 14, W - 128, 36, 3);
    }
    // 粗い区分でしか答えられていないことを、いちばん遠くまで届く画面でこそ書く
    if (l.ok && !l.fine) {
      g.font = "500 23px system-ui, sans-serif";
      g.fillStyle = EST;
      y = wrap(g, "※ この範囲には詳細版が無く、広い区分で答えています", 64, y + 6, W - 128, 32, 1);
    }

    // バッジ。出せるのは検証できたものだけ
    let x = 64; const by = 442;
    if (l.ok) x = pill(g, x, by, l.value + (l.fine ? "" : "（広い区分）"), accent);
    if (l.artificial) x = pill(g, x, by, l.artificial, EST);
    if (m.ok && m.value) x = pill(g, x, by, `明治期: ${m.value}`, m.water ? WATER : LAND);
    else if (m.ok && m.none) x = pill(g, x, by, "明治期: 記録なし", DIM);
    if (e.ok) x = pill(g, x, by, `標高 ${e.value.toFixed(2)}m`, e.value < 0 ? EST : DIM);
    if (p.ok && p.value.length) x = pill(g, x, by, `${p.value[0].label}年から`, DIM);

    // 出典。ここを削ると、ただの断定になる。
    // ⚠ 「実測」と書けるのは実際に読めたものだけ。無条件に書いていたため、
    //   通信断で1件も読めていないカードにまで「…を実測」と出ていた。
    //   このファイルの冒頭に「最も遠くまで届く画面なので断定すると被害が最も大きい」と
    //   書いておきながら、出典行だけがそれを守っていなかった。
    const read = [[l, "地形分類"], [m, "明治期の低湿地"], [e, "標高"], [p, "空中写真"]]
      .filter(([f]) => f.ok).map(([, n]) => n);
    g.font = "400 22px system-ui, sans-serif";
    g.fillStyle = DIM;
    g.fillText(read.length
      ? `出典: 国土地理院（${read.join("・")}）を実測`
      : "国土地理院のデータを読み込めませんでした（判定していません）", 64, H - 88);
    g.fillStyle = accent;
    g.font = "500 24px system-ui, sans-serif";
    g.fillText("konjaku.hidetzu.work", 64, H - 44);

    return cv;
  }

  const blobOf = (cv) => new Promise((res) => cv.toBlob(res, "image/png"));

  // 共有する。files 共有が使えるならそれ、駄目ならリンク共有、それも駄目なら保存。
  // どれに落ちても、何が起きたかは画面に出す（黙って何もしないのが最悪）。
  async function share(f, title, url, say) {
    const cv = draw(f, title);
    const blob = await blobOf(cv);
    const file = blob ? new File([blob], `konjaku-${title}.png`, { type: "image/png" }) : null;
    const text = `${title}: ${Konjaku.narrate(f)[0]}`;

    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, url });
        tick("shared"); say?.("共有しました");
        return "shared";
      }
      if (navigator.share) {
        await navigator.share({ title: `今昔 — ${title}`, text, url });
        tick("shared"); say?.("共有しました");
        return "shared";
      }
    } catch (err) {
      // 利用者が共有シートを閉じただけ。失敗として扱わない
      if (err?.name === "AbortError") return "cancelled";
    }
    // 共有APIが無い環境（多くのPC）。画像を保存に落とす
    return saveImage(cv, title, say);
  }

  function saveImage(cv, title, say) {
    const a = document.createElement("a");
    a.download = `konjaku-${title}.png`;
    a.href = cv.toDataURL("image/png");
    a.click();
    tick("saved"); say?.("画像を保存しました");
    return "saved";
  }

  const save = (f, title, say) => saveImage(draw(f, title), title, say);

  // ---- 流入の出所 ----
  // ⚠ 分母が足りないとき「面白くない」と「人が来ていない」を区別するために要る。
  // `?from=zenn` のように、こちらが自分で貼ったリンクにだけ付けたラベルを1回数える。
  // これが無いと「記事を出した」と「人が来た」を結びつけられない。
  //
  // ⚠ 数えるのは1ページ表示につき1回だけ。判定のたびに送ると分母と混ざる。
  // ⚠ 受け側（worker.js の SOURCES）が列挙にないラベルを捨てるので、
  //   ここで送りすぎても表は汚れない。長さだけ先に切っておく。
  try {
    const from = new URLSearchParams(w.location.search).get("from");
    if (from) tick(`from:${from.slice(0, 16)}`);
  } catch { /* 計測は落ちてよい */ }

  return { draw, share, save, tick, outcome, health, events };
})(window);
