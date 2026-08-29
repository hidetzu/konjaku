// 今昔 v0.1.0 — ⚠ **最初の縦切り**（`docs/adr/0059` の実装フェーズ）。
//
// ⚠ **ここでやること**:
//   住所検索／現在地  →  大きな地図  →  足元の地形分類を色で表示  →  区分名と説明文
//
// ⚠ **ここでやらないこと**（⚠ 決まっているが、⚠ この縦切りには入れない）:
//   ⚠ ピン（`docs/adr/0052`）／ ⚠ 凡例（`0055`）／ ⚠ 保存（`0051`）／
//   ⚠ PC 連携（`0048`）／ ⚠ D1（`0050`）
//
// ⚠ **目的は機能完成ではない。**⚠ **実機で「5 秒でここは昔どんな土地だったか分かるか」を
//   確かめられる状態にすること**（Owner・2026-08-29）。
//
// ⚠ **β 版から運んだもの**（⚠ 理由は `test/check/next.mjs` の一覧）:
//   `esc.js` / `words.js` / `verify.js` / `land.js` / `gsi-address-search.js`
//
// ⚠ **`public/` は 1 バイトも変えていない**（`docs/adr/0050`）。

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // 外から来た字を画面に出す前に通す。地名も区分名も、こちらが中身を保証できない。
  const { esc } = window.KonjakuEsc ?? { esc: (s) => s };
  const map = $("map"), q = $("q"), hits = $("hits");
  const kickText = $("kickText"), nameEl = $("name"), glossEl = $("gloss"), legendEl = $("legend");
  const moreBtn = $("more"), sheet = $("sheet"), sheetList = $("sheetList"), sheetState = $("sheetState");
  const meijiEl = $("meiji"), meijiBox = $("meijiBox");
  const photoEl = $("photo"), photoBox = $("photoBox");
  const areaEl = $("area"), areaBox = $("areaBox"), areaNote = $("areaNote");
  const areaCite = $("areaCite");

  // ⚠ **地図はタイルを並べて作る**（⚠ β 版の `/peel` は MapLibre だが、⚠ 運んでいない）。
  //   ⚠ **この縦切りでは、⚠ 動かせる地図が要る。**⚠ 依存を足す前に、⚠ まず素で作る
  //     （`CLAUDE.md` §3「Runtime 依存を増やさない」）。
  const GSI = Konjaku.GSI;
  const TILE = 256;
  const Z = 16;   // ⚠ 地形分類の詳細版が在る縮尺（`verify.js` の LFC_FINE と揃える）

  // ⚠ **タイル座標 ↔ 経緯度**。⚠ `verify.js` の `tileOf` は整数タイルしか返さないので、
  //   ⚠ **小数で持つ**（⚠ 地図を滑らかに動かすため）。⚠ 判定を頼むときは `verify.js` へ渡す。
  const lon2px = (lon) => (lon + 180) / 360 * 2 ** Z * TILE;
  const lat2px = (lat) => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z * TILE;
  };
  const px2lon = (x) => x / (2 ** Z * TILE) * 360 - 180;
  const px2lat = (y) => {
    const n = Math.PI - 2 * Math.PI * y / (2 ** Z * TILE);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  // ⚠ **いま画面の真ん中に在る座標**。⚠ **正本はここ 1 つ**（`.claude/rules/javascript.md`）。
  // ⚠ **URL に場所が入っていれば、⚠ そこから始める**（`place-arg.js` が読む）。
  //   ⚠ **無ければ豊洲。**⚠ **位置情報は、⚠ 押されるまで求めない。**
  const arg = KonjakuPlaceArg.readPlace(new URLSearchParams(location.search));
  let cx = lon2px(arg.state === "ok" ? arg.lon : 139.7967);
  let cy = lat2px(arg.state === "ok" ? arg.lat : 35.6553);

  // ---- 描く ----
  const layers = [];   // ⚠ 下から: 地理院の淡色地図 → 地形分類（自然）→ 地形分類（人工）
  for (const src of ["pale", "experimental_landformclassification1", "experimental_landformclassification2"]) {
    const el = document.createElement("div");
    el.className = "layer";
    el.style.cssText = "position:absolute;inset:0;overflow:hidden";
    if (src !== "pale") el.style.opacity = ".55";   // ⚠ 淡色地図が透けるように
    map.appendChild(el);
    layers.push({ src, el, tiles: new Map() });
  }
  const me = document.createElement("div");
  me.className = "me";
  me.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none";
  map.appendChild(me);
  // 色と位置だけで「ここ」を示さない。字でも言う。
  const meLabel = document.createElement("div");
  meLabel.className = "me-label";
  meLabel.textContent = "ここ";
  map.appendChild(meLabel);

  // ⚠ **地形分類はベクタタイル（geojson）で、⚠ 画像タイルが無い。**
  //   ⚠ **色で塗るには、⚠ 自分で描く**（⚠ この縦切りでは canvas に描く）。
  //   ⚠ **色は `landform.json` の区分名から作る**（⚠ 区分ごとの色は β 版も持っていない）。
  const HUE = {};   // ⚠ 名前 → 色。⚠ 下で `landform.json` を読んで作る
  const paint = (name) => HUE[name] ?? "#00000000";

  function draw() {
    const w = map.clientWidth, h = map.clientHeight;
    const left = cx - w / 2, top = cy - h / 2;
    const x0 = Math.floor(left / TILE), x1 = Math.floor((left + w) / TILE);
    const y0 = Math.floor(top / TILE), y1 = Math.floor((top + h) / TILE);
    for (const layer of layers) {
      if (layer.src !== "pale") continue;   // ⚠ 画像タイルは淡色地図だけ
      const want = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x}/${y}`; want.add(k);
        let img = layer.tiles.get(k);
        if (!img) {
          img = new Image();
          img.decoding = "async"; img.loading = "eager"; img.alt = "";
          img.src = `${GSI}/${layer.src}/${Z}/${x}/${y}.png`;
          img.style.cssText = "position:absolute;width:256px;height:256px";
          layer.el.appendChild(img);
          layer.tiles.set(k, img);
        }
        img.style.left = `${x * TILE - left}px`;
        img.style.top = `${y * TILE - top}px`;
      }
      for (const [k, img] of layer.tiles) if (!want.has(k)) { img.remove(); layer.tiles.delete(k); }
    }
    drawFace(left, top, w, h);
  }

  // ⚠ **地形分類を canvas に塗る**。⚠ **viewport に映る分だけ**（`docs/adr/0055`）。
  const face = document.createElement("canvas");
  face.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:.42;pointer-events:none";
  map.appendChild(face);
  const geoCache = new Map();

  async function geo(url) {
    if (!geoCache.has(url)) {
      geoCache.set(url, fetch(url, { signal: AbortSignal.timeout(Konjaku.TIMEOUT_MS) })
        .then((r) => r.status === 404 ? { features: [] } : r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .catch(() => null));   // ⚠ **落ちても画面を止めない**（`.claude/rules/javascript.md`）
    }
    return geoCache.get(url);
  }

  // 画面に映る区分と、その面積。凡例が使う。
  //   面積は「どれが広いか」を決めるためだけに使い、画面には出さない。
  let seen = new Map();
  // 塗れていない画素が在るか。「まだ分類されていない」を言うのに使う。
  let unpainted = false;

  let drawSeq = 0;
  async function drawFace(left, top, w, h) {
    const seq = ++drawSeq;   // ⚠ **古い結果でいまの画面を上書きしない**（`change-review` §4）
    const dpr = Math.min(devicePixelRatio || 1, 2);
    face.width = Math.round(w * dpr); face.height = Math.round(h * dpr);
    const g = face.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const x0 = Math.floor(left / TILE), x1 = Math.floor((left + w) / TILE);
    const y0 = Math.floor(top / TILE), y1 = Math.floor((top + h) / TILE);
    const tbl = await table();
    if (!tbl || seq !== drawSeq) return;
    const tally = new Map();
    // ⚠ **自然だけを塗る。**⚠ **人工レイヤは塗らない**（2026-08-29。⚠ 実機で踏んだ）。
    //   ⚠ **2 枚は重なっている。**⚠ 後に描いたほうが前を覆う。
    //   ⚠ **人工を後に描いたら、⚠ 豊洲の画面が全部「盛土地･埋立地」の色になった。**
    //   ⚠ **カードは「ここは 旧水部」と言っているのに、⚠ 地図は別のことを言っていた。**
    //   ⚠ **`verify.js` は 2 つを別の項目として持っている**（⚠ `value` と `artificial`）。
    //   ⚠ **画面も分ける。**⚠ **人工地形をどう見せるかは、⚠ この縦切りでは決めていない。**
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const src of ["experimental_landformclassification1"]) {
        const j = await geo(`https://maps.gsi.go.jp/xyz/${src}/${Z}/${x}/${y}.geojson`);
        if (seq !== drawSeq) return;
        if (!j) continue;
        for (const f of j.features ?? []) {
          const nm = tbl.codes[String(f.properties?.code ?? "")];
          if (!nm || !f.geometry) continue;
          g.fillStyle = paint(nm);
          tally.set(nm, (tally.get(nm) ?? 0) + area(f.geometry));
          const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
            : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
          for (const p of polys) {
            g.beginPath();
            for (const ring of p) {
              ring.forEach(([lo, la], i) => {
                const px = lon2px(lo) - left, py = lat2px(la) - top;
                i ? g.lineTo(px, py) : g.moveTo(px, py);
              });
              g.closePath();
            }
            g.fill("evenodd");
          }
        }
      }
    }
    if (seq !== drawSeq) return;
    seen = tally;
    // 塗れていない画素を数える。取れなかったのではなく、分類が無い。
    const px = g.getImageData(0, 0, face.width, face.height).data;
    let 空 = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 8) 空++;
    unpainted = 空 / (px.length / 4) > 0.02;
    drawLegend();
  }

  // 多角形のおおよその面積。どれが広いかを決めるためだけに使う。
  //   経緯度のまま計算するので実面積ではない。順位が出れば足りる。
  function area(geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : [];
    let a = 0;
    for (const p of polys) {
      const ring = p[0] ?? [];
      let s2 = 0;
      for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
        s2 += x1 * y2 - x2 * y1;
      }
      a += Math.abs(s2) / 2;
    }
    return a;
  }

  // ⚠ **区分の色**。⚠ `landform.json` の区分名から作る。
  //
  // ⚠ **淡色地図の上に重ねるので、⚠ 淡色地図と近い色にしない。**
  //   ⚠ **最初は土色で塗ったら、⚠ 実機で 98% 塗れているのに見えなかった**
  //     （2026-08-29。⚠ **測って初めて分かった**。⚠ 淡色地図の地の色と近すぎた）。
  //   ⚠ **「足元は色で伝える」が伝わらないと、⚠ 縦切りの意味が無い。**
  //
  // 3 つの筋で分ける（区分ごとに 36 色を作らない。読めない）:
  //   いまも水  … 濃い青   昔は水  … 薄い青   それ以外  … 緑
  //
  // 「昔は水」と「いまも水」を同じ青にしていたら、凡例で四角が 2 つ並んで
  //   同じ色になった（色差 0）。利用者役も「海と同じ青系で区別がつかない」と言っていた。
  //   今昔が言いたいのは「昔は水だった」なので、そこが「いまも水」に埋もれてはいけない。
  //
  // 人工地形（盛土地･埋立地など）は、この縦切りでは塗らない。
  //   別のレイヤで、自然の上に重なっている（塗ると自然が見えなくなる）。
  //   どう見せるかは決めていない。
  let tableP = null;
  function table() {
    if (!tableP) tableP = fetch("./data/landform.json")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j) return null;
        // いまも水域である区分。verify.js の isWatery は「水に由来する」を答えるので、
        //   そのうち「いまも水」をここで分ける。6 語を書き写さないため isWatery は残す。
        const いまも水 = new Set(["水部", "湖", "河川敷･浜"]);
        for (const nm of new Set(Object.values(j.codes))) {
          HUE[nm] = !Konjaku.isWatery(nm) ? "#7aab6a"
            : いまも水.has(nm) ? "#1f5f8f"
            : "#7fc4e8";
        }
        return j;
      })
      .catch(() => { tableP = null; return null; });
    return tableP;
  }

  // ---- 凡例 ----
  // 面積順位の表示ではない。現在地の地図理解を助けるもの。
  //   現在地の区分を必ず含め、残りを面積順として、最大 3 種。残りは「ほか n 種」。
  //   割合は言わない。言わなければ嘘にならない。
  //   整備されていないところは、ここに入れない。土地の区分ではなく、データの状態だから。
  let hereName = null;
  function drawLegend() {
    if (!seen.size) { legendEl.innerHTML = ""; return; }
    const 順 = [...seen].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const 出す = [];
    if (hereName && 順.includes(hereName)) 出す.push(hereName);
    for (const nm of 順) {
      if (出す.length >= 3) break;
      if (nm !== hereName) 出す.push(nm);
    }
    const 残り = 順.length - 出す.length;
    legendEl.innerHTML = 出す.map((nm) => {
      const here = nm === hereName;
      return `<li class="${here ? "here" : ""}"><i style="background:${paint(nm)}"></i>${esc(nm)}${here ? "（ここ）" : ""}</li>`;
    }).join("");
    // 「ほか n 種」は押せる。押せるものは、押せる見た目にする。
    //   前は凡例の中に字を並べていたが、3 名とも「押せるように見えない」と言った。
    moreBtn.hidden = 残り <= 0;
    if (残り > 0) moreBtn.textContent = `ほか ${残り} 種を見る`;
  }

  // 押すと、この画面に映る土地を全部出す。
  //   未整備は、区分一覧に入れない。土地の区分ではなく、データの状態だから。
  function openSheet() {
    const 順 = [...seen].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    sheetList.innerHTML = 順.map((nm) => {
      const here = nm === hereName;
      return `<li class="${here ? "here" : ""}"><i style="background:${paint(nm)}"></i>${esc(nm)}${here ? "（ここ）" : ""}</li>`;
    }).join("");
    // 塗れていない画素があれば、それは「まだ分類されていない」。
    //   割合は言わない。言わなければ嘘にならない。
    sheetState.hidden = !unpainted;
    if (unpainted) sheetState.textContent = "白いところは、まだ分類されていません（土地の区分ではなく、データの状態です）";
    sheet.hidden = false;
    $("sheetClose").focus();
  }
  moreBtn.addEventListener("click", openSheet);
  $("sheetClose").addEventListener("click", () => { sheet.hidden = true; moreBtn.focus(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) { sheet.hidden = true; moreBtn.focus(); } });

  // ---- 足元を調べる ----
  let askSeq = 0;
  async function ask() {
    const seq = ++askSeq;
    const lon = px2lon(cx), lat = px2lat(cy);
    kickText.textContent = "いまいる場所";
    const v = await KonjakuLand.terrain(lon, lat).catch(() => null);
    if (seq !== askSeq) return;   // ⚠ **古い結果で上書きしない**
    hereName = null;
    if (!v || v.state === Konjaku.STATE.UNREACHABLE) {
      glossEl.textContent = "いま、この場所を調べられません";
      nameEl.textContent = "";
      kickText.textContent = "通信が届いていません。少し待って、もう一度動かしてください";
      drawLegend();
      return;
    }
    if (!v.ok || !v.value) {
      // ⚠ **「取れなかった」と「無い」を分ける**（`docs/adr/0056`）
      glossEl.textContent = "この場所は、まだ分類されていません";
      nameEl.textContent = "";
      drawLegend();
      return;
    }
    hereName = v.value;
    askMeiji(lon, lat, seq);
    askPhoto(lon, lat, seq);
    showArea(lon, lat);
    // 主は、分かる言葉のほう。区分名は資料の言葉で、そのままでは読めない人がいる。
    //   言葉は words.js の GROUND_GLOSS から借りる。ここで書かない。
    //   区分名も消さない。何を根拠に言っているかが分からなくなる。
    glossEl.textContent = `ここは、${KonjakuWords.groundGloss(v.value)}`;
    nameEl.textContent = v.value;
    drawLegend();
  }

  // 明治期の低湿地。地形分類とは別の出典で、別の答えを返す。
  //   同じ「旧水部」でも、明治期に何だったかは場所で変わる。そこが場所ごとの違いになる。
  //   3 つの状態を言い分ける。「取れなかった」と「無い」を混ぜない。
  //     区分あり     → その区分を言う
  //     区分なし     → まだ分類されていない
  //     整備範囲外   → この地域ではこの資料が作られていない
  async function askMeiji(lon, lat, seq) {
    meijiBox.hidden = true;
    const m = await KonjakuLand.meijiPoint(lon, lat).catch(() => null);
    if (seq !== askSeq) return;
    if (!m) return;                                     // 取れなかった。黙る
    if (m.state === Konjaku.STATE.UNREACHABLE) return;  // 同上
    meijiBox.hidden = false;
    if (m.state === Konjaku.STATE.ABSENT) {
      meijiEl.innerHTML = `<span class="none">この地域では、この資料が作られていません</span>`;
      return;
    }
    if (!m.value) {
      meijiEl.innerHTML = `<span class="none">この場所は、まだ分類されていません</span>`;
      return;
    }
    meijiEl.innerHTML = `<b>${esc(m.value)}</b> でした`;
  }

  // 空中写真。どの年代が残っているかを言う。
  //   利用者役 3 名が「いつ陸になったか分からない」と言った。
  //   それには答えられない。写真の中身は見ないと決めた（見ると推定を実測のように見せる）。
  //   言えるのは「◯◯年の写真が残っている」まで。明治期の行と合わせて、挟みこむ。
  async function askPhoto(lon, lat, seq) {
    photoBox.hidden = true;
    const f = await KonjakuLand.photos(lon, lat).catch(() => null);
    if (seq !== askSeq) return;
    if (!f) return;                                     // 取れなかった。黙る
    if (f.state === Konjaku.STATE.UNREACHABLE) return;  // 同上
    const 残る = (f.eras ?? []).filter((e) => e.state === Konjaku.STATE.OK && !e.blank);
    photoBox.hidden = false;
    if (!残る.length) {
      photoEl.innerHTML = `<span class="none">この場所の空中写真は、残っていません</span>`;
      return;
    }
    // いちばん古い年代だけ言う。全部並べると、写真を見る話になる（スマホで深掘りさせない）。
    photoEl.innerHTML = `<b>${esc(残る[0].label)}</b> の写真が残っています`
      + (残る.length > 1 ? `<span class="none">（ほか ${残る.length - 1} 年代）</span>` : "");
  }

  // この周辺について、公式資料に書かれている記録。
  //   上の 3 つと違い、これは地点の答えではない。地域の記録。
  //   原典に座標も丁目も書かれていないので、この場所がいつ変わったかは分からない。
  //   だから「この周辺について、こういう記録がある」までしか言わない。
  //
  //   混同してはいけないものが 3 つある。
  //     資料の年代／記録上の変化／実際の工事時期。
  //   原典が言っていないことを、こちらで補わない。要約もしない。
  let areaP = null;
  function areas() {
    if (!areaP) areaP = fetch("./data/area-record.json")
      .then((r) => r.ok ? r.json() : null).catch(() => { areaP = null; return null; });
    return areaP;
  }
  async function showArea(lon, lat) {
    areaBox.hidden = true;
    const j = await areas();
    if (!j) return;
    const a = (j.areas ?? []).find((x) => {
      const b = x.bbox;
      return b && lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n;
    });
    if (!a) return;   // その地域の資料が無い。黙る
    // 出すのは 1 件だけ。原典から代表を選んであり、地点では選び分けない。
    //   新しい順に 3 件を出したときは、豊洲で「要綱の施行」「13号地」「品川」が並んだ
    //   （実測 2026-08-29）。古い順でも同じで、どれも別の場所の話になる。
    //   なぜその 3 件なのかを説明できないので、並べること自体をやめた。
    //   選ぶのは JSON 側（representative）。ここで選ばない。
    const r = (a.records ?? []).find((x) => x.year === a.representative);
    if (!r) return;   // 代表が選ばれていない。こちらで勝手に選ばない
    areaBox.hidden = false;
    areaEl.innerHTML =
      `${esc(a.label)}には、<b>${esc(String(r.year))}年</b>に`
      + `「${esc(r.text)}」という記録があります。`;
    // 断りを、記録より先に置いている（並びは index.html）。
    //   5 秒だけ見せて聞いた（利用者役 3 名・実在の利用者ではない・2026-08-29）。
    //     記録が先 → 3 名中 1 名が、年をこの地点のものとして読んだ
    //     断りが先 → 0 名
    //   年の太字をやめるだけでは減らなかった（1 名のまま）。効いたのは順番のほう。
    //   これは掟 §4-1（できないことから書き始めない）に反する向き。
    //   §1（誤認させない）が上位なので、こちらを採った。Owner が絵で確かめて決めた。
    areaNote.textContent =
      "※この地点に関する記録ではありません。"
      + "この場所がいつ陸になったかは、この資料からは分かりません。";
    // 出典は消さない。どこの資料かが分からないと、確かめようがない。
    areaCite.innerHTML =
      `出典：<a href="${esc(a.source.url)}" target="_blank" rel="noopener">`
      + `${esc(a.source.name)}</a>`;
  }

  // ---- 動かす ----
  let idle = null;
  function moved() {
    draw();
    clearTimeout(idle);
    idle = setTimeout(ask, 350);   // ⚠ 動かしている間は調べない
  }
  let drag = null;
  map.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY }; map.setPointerCapture(e.pointerId);
  });
  map.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cx -= e.clientX - drag.x; cy -= e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    draw();
  });
  map.addEventListener("pointerup", (e) => {
    if (!drag) return; drag = null; map.releasePointerCapture(e.pointerId); moved();
  });
  addEventListener("resize", draw);

  // ---- 現在地 ----
  // ⚠ **起動直後に求めない。**⚠ **押したときに求める**（`docs/adr/0046`）。
  $("here").addEventListener("click", () => {
    if (!navigator.geolocation) {
      kickText.textContent = "この端末では現在地を使えません";
      return;
    }
    kickText.textContent = "いまいる場所を調べています";
    navigator.geolocation.getCurrentPosition(
      (p) => { cx = lon2px(p.coords.longitude); cy = lat2px(p.coords.latitude); moved(); },
      () => { kickText.textContent = "現在地を使えませんでした。検索するか、地図を動かしてください"; },
      { enableHighAccuracy: true, timeout: 10000 });
  });

  // ---- 住所検索 ----
  const finder = KonjakuGsiAddressSearch.createGsiAddressSearch();
  $("find").addEventListener("submit", async (e) => {
    e.preventDefault();
    const s = q.value.trim();
    if (!s) return;
    hits.hidden = true;
    try {
      const list = await finder.search(s);
      if (!list.length) {
        kickText.textContent = "その名前では見つかりませんでした";
        return;
      }
      hits.innerHTML = list.slice(0, 8).map((r, i) => {
        const t = r.properties?.title ?? "";
        return `<li role="option"><button type="button" data-i="${i}">${esc(t)}</button></li>`;
      }).join("");
      hits._list = list;
      hits.hidden = false;
    } catch (err) {
      // ⚠ **こちらの都合を、相手の都合のように言わない**（`CLAUDE.md` §4-1）
      kickText.textContent = KonjakuGsiAddressSearch.whyOf(err);
    }
  });
  hits.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const r = hits._list?.[+b.dataset.i];
    const c = r?.geometry?.coordinates;
    if (!c) return;
    cx = lon2px(c[0]); cy = lat2px(c[1]);
    hits.hidden = true; q.blur(); moved();
  });

  draw(); ask();
})();
