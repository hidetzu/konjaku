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
  const subEl = $("sub"), whyEl = $("why");
  const meijiEl = $("meiji"), meijiRow = $("meijiRow");
  const photoEl = $("photo"), photoRow = $("photoRow");
  const areaEl = $("area"), areaRow = $("areaRow"), areaNote = $("areaNote"), areaCite = $("areaCite");
  const erasEl = $("eras"), eraNote = $("eraNote"), eraBack = $("eraBack");
  const saveBtn = $("save"), saveMark = $("saveMark"), saveText = $("saveText");
  const shareBtn = $("share"), shareText = $("shareText");
  const savedOpen = $("savedOpen"), savedCount = $("savedCount");
  const savedSheet = $("savedSheet"), savedList = $("savedList"), savedNote = $("savedNote");

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
  // ⚠ **空中写真の層。**⚠ 押された年代のタイルを、⚠ 淡色地図の上に敷く。
  //   ⚠ **配信元は verify.js が返した tile の URL から derive する。**
  //     ⚠ ここに配信元をもう 1 つ書かない（`CLAUDE.md` §3「同じ問いに答える実装を 2 つ持たない」）。
  const photoLayer = { el: document.createElement("div"), tiles: new Map() };
  photoLayer.el.className = "layer";
  photoLayer.el.style.cssText = "position:absolute;inset:0;overflow:hidden";
  photoLayer.el.hidden = true;
  map.insertBefore(photoLayer.el, layers[1].el);
  let era = null;   // ⚠ **いま出している年代。**⚠ null は「写真を出していない」

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
    drawPhoto(left, top, x0, x1, y0, y1);
    // ⚠ **写真を出しているあいだ、⚠ 地形分類は塗らない。**
    //   ⚠ **重ねると、⚠ いまの区分が、⚠ その年代の写真の上の判定に読める。**
    //   ⚠ **描くのをやめるだけでは足りない。**⚠ **canvas は前に塗った絵を持ったまま。**
    //     ⚠ 実際に踏んだ（2026-08-29）: ⚠ 1936–42 の写真の全面に、⚠ 旧水部の青が乗っていた。
    if (era) { face.getContext("2d").clearRect(0, 0, face.width, face.height); return; }
    drawFace(left, top, w, h);
  }

  // ⚠ **押された年代の写真タイルを敷く。**⚠ **年代が変わったら、⚠ 前の年代の絵を残さない。**
  function drawPhoto(left, top, x0, x1, y0, y1) {
    photoLayer.el.hidden = !era;
    if (!era) {
      for (const [, img] of photoLayer.tiles) img.remove();
      photoLayer.tiles.clear();
      return;
    }
    // `${配信元}/${年代の id}/${z}/${x}/${y}.${拡張子}` の、末尾 3 段を落とすと配信元になる
    const base = era.tile.replace(/\/\d+\/\d+\/\d+\.\w+$/, "");
    const want = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${era.id}/${x}/${y}`; want.add(k);
      let img = photoLayer.tiles.get(k);
      if (!img) {
        img = new Image();
        img.decoding = "async"; img.loading = "eager"; img.alt = "";
        img.src = `${base}/${Z}/${x}/${y}.${era.ext}`;
        img.style.cssText = "position:absolute;width:256px;height:256px";
        photoLayer.el.appendChild(img);
        photoLayer.tiles.set(k, img);
      }
      img.style.left = `${x * TILE - left}px`;
      img.style.top = `${y * TILE - top}px`;
    }
    for (const [k, img] of photoLayer.tiles) if (!want.has(k)) { img.remove(); photoLayer.tiles.delete(k); }
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
    // ⚠ **写真を出しているあいだは塗らない。**⚠ **待っているうちに切り替わることがある。**
    //   ⚠ **実際に踏んだ**（2026-08-29。⚠ 実描画が捕まえた）: ⚠ **`clearRect` したあとに、
    //   ⚠ 先に走っていた塗りが返ってきて、⚠ 写真の上へ 805394 画素を描いた。**
    //   ⚠ **手元では出なかった。**⚠ **取得が終わってから押していたから。**
    if (!tbl || seq !== drawSeq || era) return;
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
        if (seq !== drawSeq || era) return;   // ⚠ 待っているうちに写真へ切り替わることがある
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
    drawSave();            // 判定が出るまで保存させない
    drawShare();           // 同上。開いた人が何も読めない URL を配らせない
    setEra(null);          // 場所が変わったら、前の場所の写真を残さない
    subEl.textContent = ""; subEl.hidden = true;
    erasEl.hidden = true; erasEl.innerHTML = "";
    if (!v || v.state === Konjaku.STATE.UNREACHABLE) {
      glossEl.textContent = "いま、この場所を調べられません";
      nameEl.textContent = "";
      kickText.textContent = "通信が届いていません。少し待って、もう一度動かしてください";
      drawLegend();
      return;
    }
    if (!v.ok || !v.value) {
      // ⚠ **「取れなかった」と「無い」を分ける**（`docs/adr/0056`）
      // 明治期と同じ字を使わない（2026-08-29。Owner 判断）。別の出典の別の話なので、
      //   同じ字だと「なぜそう言える？」を開いたとき同じ文が 2 行並ぶ。
      glossEl.textContent = "この場所の地形は、まだ分類できていません";
      nameEl.textContent = "";
      drawLegend();
      return;
    }
    hereName = v.value;
    drawSave();
    drawShare();
    askMeiji(lon, lat, seq);
    askPhoto(lon, lat, seq);
    showArea(lon, lat);
    // 主は、分かる言葉のほう。区分名は資料の言葉で、そのままでは読めない人がいる。
    //   言葉は words.js の GROUND_GLOSS から借りる。ここで書かない。
    //   区分名も消さない。何を根拠に言っているかが分からなくなる。
    glossEl.textContent = `ここは、${KonjakuWords.groundGloss(v.value)}`;
    // 区分名は、出典の言葉として添える。主ではない。
    //   消しはしない。国土地理院の区分名を名乗れないと、何を根拠に言っているか分からなくなる。
    nameEl.innerHTML = `<b>${esc(v.value)}</b>（国土地理院）`;
    drawLegend();
  }

  // まとめの 1 行。「明治期は X／空中写真 N 年代」。
  //   取れたものだけ並べる。取れなかったことは、ここでは言わない（「なぜそう言える？」の中で言う）。
  //   前提は「長い文章はその場では読まれない」。ここは 1 行を超えさせない。
  const 概略 = { meiji: null, photo: null };
  function drawSub() {
    const 並び = [概略.meiji, 概略.photo].filter(Boolean);
    subEl.hidden = !並び.length;
    subEl.innerHTML = 並び.join("／");
  }

  // 明治期の低湿地。地形分類とは別の出典で、別の答えを返す。
  //   同じ「旧水部」でも、明治期に何だったかは場所で変わる。そこが場所ごとの違いになる。
  //   3 つの状態を言い分ける。「取れなかった」と「無い」を混ぜない。
  //     区分あり     → その区分を言う
  //     区分なし     → まだ分類されていない
  //     整備範囲外   → この地域ではこの資料が作られていない
  async function askMeiji(lon, lat, seq) {
    meijiRow.hidden = true;
    概略.meiji = null;
    const m = await KonjakuLand.meijiPoint(lon, lat).catch(() => null);
    if (seq !== askSeq) return;
    // 取れなかったときは黙らない（2026-08-29。Owner 判断）。
    //   黙ると、行ごと消え、その地域の資料が無い場所と見分けられない。
    //   周辺の記録も空中写真も、同じ状況で「読めなかった」と言う。挙動を揃える。
    //   実際に踏んだ（2026-08-29）: 明治期のタイルを塞ぐと、行もまとめの 1 行も
    //   静かに消え、利用者には何も起きなかったように見えた。
    if (!m || m.state === Konjaku.STATE.UNREACHABLE) {
      meijiRow.hidden = false;
      meijiEl.innerHTML =
        `<span class="none">明治期の情報は、この場所では確認できませんでした</span>`;
      return;
    }
    meijiRow.hidden = false;
    if (m.state === Konjaku.STATE.ABSENT) {
      meijiEl.innerHTML = `<span class="none">この地域では、この資料が作られていません</span>`;
      return;
    }
    if (!m.value) {
      // 資料は読めたが、この場所に区分が無い。「読めなかった」とは別の話。
      //   足元とも別の字にする（2026-08-29。Owner 判断）。出典が違えば理由も違う。
      //   3 つを言い分ける（docs/adr/0056）:
      //     この地域では、この資料が作られていません     資料そのものが無い
      //     この場所には、明治期の区分がありません        資料はあるが、この点に区分が無い
      //     明治期の情報は、この場所では確認できませんでした   読めなかった
      meijiEl.innerHTML =
        `<span class="none">この場所には、明治期の区分がありません</span>`;
      return;
    }
    meijiEl.innerHTML = `<b>${esc(m.value)}</b> でした`;
    // まとめの 1 行に出すのは、区分が取れたときだけ。
    概略.meiji = `明治期は <b>${esc(m.value)}</b>`;
    drawSub();
  }

  // 空中写真。どの年代が残っているかを言う。
  //   利用者役 3 名が「いつ陸になったか分からない」と言った。
  //   それには答えられない。写真の中身は見ないと決めた（見ると推定を実測のように見せる）。
  //   言えるのは「◯◯年の写真が残っている」まで。明治期の行と合わせて、挟みこむ。
  async function askPhoto(lon, lat, seq) {
    photoRow.hidden = true;
    erasEl.hidden = true; erasEl.innerHTML = "";
    概略.photo = null;
    const f = await KonjakuLand.photos(lon, lat).catch(() => null);
    if (seq !== askSeq) return;
    if (!f) return;                                     // 取れなかった。黙る
    if (f.state === Konjaku.STATE.UNREACHABLE) {
      photoRow.hidden = false;
      photoEl.innerHTML = `<span class="none">いま読み込めませんでした。残っているかどうかは分かっていません</span>`;
      return;
    }
    // 残っていて、白紙でなく、この縮尺で出せるものだけを押せるようにする。
    //   縮尺の外は「無い」ではないので、出さないだけで、無いとは言わない。
    const 残る = (f.eras ?? []).filter((e) =>
      e.state === Konjaku.STATE.OK && !e.blank && Z >= e.min && Z <= e.max);
    if (!残る.length) {
      photoRow.hidden = false;
      photoEl.innerHTML = `<span class="none">この場所の空中写真は、残っていません</span>`;
      return;
    }
    概略.photo = `空中写真 <b>${残る.length} 年代</b>`;
    drawSub();
    // 既定は地図。押されるまで写真は出さない。
    //   古い順。verify.js が時系列に並べ替えて返している。
    //   年は 2 行に割る（「1936」「–42」）。1 行だと 7 つが画面に収まらない。
    erasEl.hidden = false;
    erasEl.innerHTML = 残る.map((e) => {
      const m = String(e.label).match(/^(\d{4})(.*)$/);
      const 上 = m ? m[1] : e.label, 下 = m ? m[2] : "";
      return `<button type="button" class="era" data-era="${esc(e.id)}" aria-pressed="false">`
        + `<span class="era__y">${esc(上)}</span>`
        + (下 ? `<span class="era__t">${esc(下)}</span>` : "")
        + `</button>`;
    }).join("");
    for (const b of erasEl.querySelectorAll(".era"))
      b.addEventListener("click", () => setEra(残る.find((e) => e.id === b.dataset.era)));
  }

  // 年代を切り替える。写真を出すと、地図の意味が変わる。
  //   地形分類の色は消えるので、凡例も一緒に隠す（残すと、色の無い凡例になる）。
  //   何年代の写真を見ているかは、必ず字で言う。黙って絵だけ変えない。
  function setEra(e) {
    era = e ?? null;
    for (const b of erasEl.querySelectorAll(".era"))
      b.setAttribute("aria-pressed", String(b.dataset.era === era?.id));
    eraNote.hidden = !era;
    eraBack.hidden = !era;
    if (era) eraNote.textContent =
      `${era.label}${era.sub ? `（${era.sub}）` : ""}の空中写真を出しています。`
      + `地形分類の色は、いまの土地の話なので消しています`;
    legendEl.hidden = !!era;
    moreBtn.hidden = !!era || !moreBtn.textContent;
    if (!era) drawLegend();
    draw();
  }
  eraBack.addEventListener("click", () => setEra(null));

  // この周辺について、公式資料に書かれている記録。
  //   上の 3 つと違い、これは地点の答えではない。地域の記録。
  //   原典に座標も丁目も書かれていないので、この場所がいつ変わったかは分からない。
  //   だから「この周辺について、こういう記録がある」までしか言わない。
  //
  //   混同してはいけないものが 3 つある。
  //     資料の年代／記録上の変化／実際の工事時期。
  //   原典が言っていないことを、こちらで補わない。要約もしない。
  // 3 つの状態を言い分ける（docs/adr/0056 と同じ形）。
  //   読めた       → その地域の記録が在るかを見る
  //   読めなかった → 「在るかどうかが分かっていない」と言う
  //   ⚠ 混ぜると、資料を読めなかったのか、その地域の資料が無いのかが見分けられない。
  //     実際に踏んだ（2026-08-29。実描画を書いていて見つけた）: 資料そのものを読めなくしても、
  //     画面は資料が無い場所とまったく同じだった。掟 §1「取得できなかった ≠ 存在しなかった」。
  let areaP = null;
  function areas() {
    if (!areaP) areaP = fetch("./data/area-record.json")
      .then((r) => r.ok ? r.json().then((data) => ({ ok: true, data }))
                        : { ok: false, data: null })
      .catch(() => { areaP = null; return { ok: false, data: null }; });
    return areaP;
  }
  async function showArea(lon, lat) {
    areaRow.hidden = true;
    const got = await areas();
    if (!got.ok) {
      // 読めなかった。空中写真と同じ言い方に揃える。
      //   ここで黙ると、その地域の資料が無い場所と見分けられなくなる。
      areaRow.hidden = false;
      areaNote.textContent = "";
      areaEl.innerHTML =
        `<span class="none">いま読み込めませんでした。`
        + `この周辺の記録が在るかどうかは分かっていません</span>`;
      areaCite.innerHTML = "";
      return;
    }
    const a = (got.data.areas ?? []).find((x) => {
      const b = x.bbox;
      return b && lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n;
    });
    // その地域の資料が無い。黙る。
    //   空の箱を出すと「変わっていない」と読まれる（利用者役 3 名中 2 名。2026-08-29）。
    //   畳んだあと同じ 3 名に聞き直したら 0/3 になった（docs/adr/0062）。
    if (!a) return;
    // 出すのは 1 件だけ。地点では選び分けない。
    //   新しい順に 3 件を出したときは、豊洲で「要綱の施行」「13号地」「品川」が並んだ
    //   （実測 2026-08-29）。古い順でも同じで、どれも別の場所の話になる。
    //   なぜその 3 件なのかを説明できないので、並べること自体をやめた。
    //
    //   ⚠ これは「代表」ではない。原典に順位も代表の指定も無い。
    //     この地域の記録の中から 1 件を選んで最初に出しているだけで、
    //     「いちばん重要」とも「この場所を代表する」とも言っていない（2026-08-29。Owner 判断）。
    //   選ぶのは JSON 側（shown）。ここで選ばない。
    const r = (a.records ?? []).find((x) => x.year === a.shown);
    if (!r) return;   // 最初に出す 1 件が決まっていない。こちらで勝手に選ばない
    areaRow.hidden = false;
    // 断りが先、記録が後（並びは index.html）。
    //   5 秒だけ見せて聞いた（利用者役 3 名・実在の利用者ではない・2026-08-29）。
    //     記録が先 → 3 名中 1 名が、年をこの地点のものとして読んだ
    //     断りが先 → 0 名
    //   年の太字をやめるだけでは減らなかった（1 名のまま）。効いたのは順番のほう。
    //   これは掟 §4-1（できないことから書き始めない）に反する向き。
    //   §1（誤認させない）が上位なので、こちらを採った。Owner が絵で確かめて決めた。
    areaNote.textContent =
      "※この地点に関する記録ではありません。"
      + "この場所がいつ陸になったかは、この資料からは分かりません。";
    areaEl.innerHTML =
      `${esc(a.label)}には、<b>${esc(String(r.year))}年</b>に`
      + `「${esc(r.text)}」という記録があります。`;
    // 出典は消さない。どこの資料かが分からないと、確かめようがない。
    areaCite.innerHTML =
      `出典：<a href="${esc(a.source.url)}" target="_blank" rel="noopener">`
      + `${esc(a.source.name)}</a>`;
  }

  // ---- この場所を送る ----
  //
  // URL には元から座標が入る（?ll=）。読む口も書く口も place-arg.js の 1 か所にある。
  //   ここは呼ぶだけ。同じ問いに答える実装を 2 つ持たない（CLAUDE.md §3）。
  //
  // 年代は送らない（2026-08-29。Owner 判断）。送るのは場所だけ。
  //   place-arg.js の placeQuery は era も足せるが、渡さない。
  //
  // 送り方は 2 段。端末が持っている口をまず使い、無ければ写す。
  //   どちらも使えないことがある（古いブラウザ・安全でない接続）。そのときは黙らない。
  function shareUrl() {
    const q = KonjakuPlaceArg.placeQuery({ lat: px2lat(cy), lon: px2lon(cx) });
    if (!q) return null;
    // placeQuery は必ず q=（地名）を足す。v0.1.0 は地図の真ん中の地名を持っていないので
    //   空になる。空の q を配ると、受け取った人には壊れた URL に見える。
    //   落とすだけにする。組み立て直さない（同じ問いに答える実装を 2 つ持たない）。
    return location.origin + location.pathname + q.replace(/^\?q=&/, "?");
  }

  function drawShare() {
    // 判定が出ていない場所は送らせない（開いた人が何も読めない）
    shareBtn.hidden = !hereName;
  }

  // 押したあとに何が起きたかを、必ず字で言う（docs/adr/0026）。
  //   共有シートを閉じただけなら、失敗ではない。「やめた」と「壊れた」を混ぜない。
  let shareTimer = null;
  function sayShare(text) {
    shareText.textContent = text;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => { shareText.textContent = "送る"; }, 2600);
  }

  shareBtn.addEventListener("click", async () => {
    const url = shareUrl();
    if (!url) return;                       // 座標が読めない。黙る（押せる形にもしていない）
    // 端末の共有の口。無いブラウザがある
    if (navigator.share) {
      try { await navigator.share({ url }); return; }
      catch (e) {
        // 利用者がやめただけなら、何も言わない（失敗ではない）
        if (e?.name === "AbortError") return;
        // それ以外は下へ落ちて、写すほうを試す
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      sayShare("写しました");
    } catch {
      // どちらも使えない。こちらの都合を、相手の都合のように言わない（掟 §4-1）
      sayShare("写せません");
    }
  });

  // ---- 保存 ----
  //
  // 散歩を中断せずに興味を残し、家に帰ってから続きを見る（docs/adr/0064）。
  //   ここが持つのは置き方だけ。控えの形と距離の判定は saved.js の 1 か所にある。
  //
  // 置き場は端末の中だけ。どこにも送らない。別の端末では見られない。
  const store = (() => {
    try { const s = localStorage; s.getItem(KonjakuSaved.KEY); return s; }
    catch { return null; }   // プライベートモードなどで触れないことがある
  })();

  let saved = [];        // 控え。正本はここ 1 つ
  let storeOk = true;    // 置き場が読めたか。読めないことと、1 件も無いことは違う

  function loadSaved() {
    if (!store) { storeOk = false; saved = []; return; }
    const r = KonjakuSaved.load(store);
    storeOk = r.ok;
    saved = r.list;
  }
  loadSaved();

  // 何日前か。言葉はここで決める（saved.js は数しか持たない）。
  function whenText(at) {
    const 日 = 86400000;
    const 今日 = new Date(); 今日.setHours(0, 0, 0, 0);
    const 差 = Math.floor((今日.getTime() - new Date(at).setHours(0, 0, 0, 0)) / 日);
    if (差 <= 0) return "きょう";
    if (差 === 1) return "きのう";
    if (差 < 7) return `${差} 日前`;
    if (差 < 30) return `${Math.floor(差 / 7)} 週間前`;
    return `${Math.floor(差 / 30)} か月前`;
  }

  // 市区町村コードから名前を引く表。保存するときに一度だけ読む。
  //   一覧を開くたびには読まない（控えに名前ごと書いてある）。
  //   作るのは scripts/build-muni.mjs。重なる名前にだけ都道府県が足してある。
  let muniP = null;
  function muniTable() {
    if (!muniP) muniP = fetch("./data/muni.json", { signal: AbortSignal.timeout(Konjaku.TIMEOUT_MS) })
      .then((r) => r.ok ? r.json() : null).catch(() => { muniP = null; return null; });
    return muniP;
  }

  // 座標から場所の名前を聞く。国土地理院の口。
  //   保存する瞬間に 1 回だけ呼ぶ。地図を動かすたびには呼ばない。
  //   取れなくても保存は止めない。名前が無いだけで、戻る先の座標は残る。
  //   これが要る理由: 同じ区分の場所は説明文がまったく同じになる。
  //     豊洲も浦安も「かつて水面で、その後陸地にされた土地」で、一覧で見分けられない
  //     （利用者役 3 名中 2 名が指摘。2026-08-29）。
  //   町名だけでも足りない。「猫実」が浦安だと分からない（同 1 名）。市区町村を添える。
  //   どちらか片方しか取れないこともある。取れたほうだけ返す。
  async function askName(lon, lat) {
    let town = null, muni = null;
    try {
      const u = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`;
      const r = await fetch(u, { signal: AbortSignal.timeout(Konjaku.TIMEOUT_MS) });
      if (!r.ok) return null;
      const j = await r.json();
      const nm = j?.results?.lv01Nm;
      // 「-」は地理院が「町名が無い」ときに返す字。名前として出さない
      if (typeof nm === "string" && nm && nm !== "-") town = nm;
      const cd = j?.results?.muniCd;
      if (cd) {
        const t = await muniTable();
        muni = t?.muni?.[String(cd)] ?? null;
      }
    } catch { return null; }
    if (!town && !muni) return null;
    // 住所の順に並べる。片方しか無ければ、あるほうだけ
    return [muni, town].filter(Boolean).join(" ");
  }

  // いまの地点が保存されているか。ボタンの見た目はここだけで決める。
  function drawSave() {
    // 判定が出ていない場所は保存させない（戻っても何も言えない）
    const 出ている = !!hereName;
    saveBtn.hidden = !出ている;
    if (!出ている) return;
    const hit = KonjakuSaved.findAt(saved, px2lon(cx), px2lat(cy));
    saveBtn.setAttribute("aria-pressed", String(!!hit));
    saveMark.textContent = hit ? "★" : "☆";
    // 「保存した」ではなく「保存ずみ」。過去形だと、もう一度押せることが伝わらない
    //   （利用者役 1 名が「もう一度押すと消えるのか迷う」と言った）。
    saveText.textContent = hit ? "保存ずみ" : "保存";
    drawSavedOpen();
  }

  function drawSavedOpen() {
    savedOpen.hidden = saved.length === 0;
    savedCount.textContent = `${saved.length} 件 ›`;
  }

  saveBtn.addEventListener("click", async () => {
    const lon = px2lon(cx), lat = px2lat(cy);
    const hit = KonjakuSaved.findAt(saved, lon, lat);
    if (hit) {
      saved = KonjakuSaved.remove(saved, lon, lat);
    } else {
      // 先に足して、先に描く。名前は届いてから埋める（届かなくても保存は残る）。
      const rec = { lon, lat, name: null, value: hereName,
        gloss: KonjakuWords.groundGloss(hereName), at: Date.now() };
      saved = KonjakuSaved.add(saved, rec);
      const nm = await askName(lon, lat);
      // 待っているあいだに外されていることがある。いま在るものだけ書き換える
      if (nm && saved.includes(rec)) { rec.name = nm; KonjakuSaved.save(store, saved); drawSavedList(); }
    }
    if (store && !KonjakuSaved.save(store, saved)) storeOk = false;
    drawSave();
    drawSavedList();
  });

  // 一覧。押すとその地点へ戻る。
  function drawSavedList() {
    savedList.innerHTML = saved.map((r, i) =>
      `<li><button type="button" data-i="${i}">`
      + `<span class="saved__row"><span>${esc(r.name ?? "地図から選んだ場所")}</span>`
      + `<span class="saved__when">${esc(whenText(r.at))}</span></span>`
      + `<span class="saved__gloss">${esc(r.gloss ?? "")}</span>`
      + `</button></li>`).join("");
    for (const b of savedList.querySelectorAll("button"))
      b.addEventListener("click", () => {
        const r = saved[Number(b.dataset.i)];
        if (!r) return;
        savedSheet.hidden = true;
        setEra(null);
        cx = lon2px(r.lon); cy = lat2px(r.lat);
        draw();
        ask();
      });
    // 置き場が読めないことと、1 件も無いことは違う。読めないときだけ断る。
    savedNote.hidden = storeOk;
    if (!storeOk) savedNote.textContent =
      "この端末では、保存した場所を覚えておけません（ブラウザの設定によります）";
  }

  savedOpen.addEventListener("click", () => {
    drawSavedList();
    savedSheet.hidden = false;
    $("savedClose").focus();
  });
  $("savedClose").addEventListener("click", () => { savedSheet.hidden = true; savedOpen.focus(); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !savedSheet.hidden) { savedSheet.hidden = true; savedOpen.focus(); }
  });
  drawSavedOpen();

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
