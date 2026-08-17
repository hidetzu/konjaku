// 検証器 — 座標から「事実」を取り出す。
//
// このプロジェクトの中心は地図ではなく、判定に根拠を要求する仕組みのほう。
// ここが返すのは「答え」ではなく、**根拠つきの事実の集合**である。
//
// 原則（掟: 根拠のないことは書かない / 掟: 確率を出さない。実測値そのものを出す）:
//   - 出すのは実測値そのものと、その取り方と、既知の限界だけ
//   - 確率は出さない。「確信度85%」の85に根拠が無ければ、
//     それは検証器の顔をした生成でしかない
//   - 断定できないものは断定しない（「該当なし」は「陸だった」ではない）
//   - **取れなかったことを「無い」と言わない**（掟: 取れなかったを「無い」と言わない）
//
// 事実の形:
//   { key, label, value, method, evidence, caveat, ok, state }
//     method   : "直読み" | "計算" | "推定"
//     evidence : 参照したタイル・画素・生の値。**読めたときだけ入る**
//     caveat   : そのデータ固有の限界（無ければ null）
//     state    : "ok" | "absent" | "unreachable" | "partial"

(function (global) {
  "use strict";

  const GSI = "https://cyberjapandata.gsi.go.jp/xyz";

  // ---- 取得結果の3状態（掟: 取れなかったを「無い」と言わない）----
  //   ok          … 読めた
  //   absent      … サーバが「無い」と答えた（404）。データが本当に存在しない
  //   unreachable … 読めなかった（通信断・タイムアウト・CORS拒否・403・5xx）
  //
  // ここを区別していなかったため、GSI への通信が落ちただけの豊洲に
  // 「整備対象外」「標高データが無い」「空中写真は残っていない」と、
  // しかも根拠UI付きで書いていた。最も権威ありげな見た目で最も誤ったことを言う状態。
  // 判定の厳密さ（meiji() が a===0 で黙ること）を、通信層にも通す。
  //
  // ⚠ **403 を absent に入れない。** 拒まれたのは「見せてもらえなかった」であって、
  //   「そこにデータが無い」の証拠ではない（掟: 取れなかったを「無い」と言わない）。
  //   国土地理院の資料にも、403 を不在として読んでよいという記述は無い。
  //   実測（2026-08-16 / 5地点 × 6経路 = 30本）では、不在の応答は全部 404 で、
  //   403 は 0 本だった。つまりここを 404 だけに絞っても、整備範囲外の土地
  //   （札幌・帯広など）の「整備対象外」表示は変わらない。
  const OK = "ok", ABSENT = "absent", UNREACHABLE = "unreachable";

  // タイムアウト。GSI は通常 0.1〜0.3 秒で返る（判定確定まで実測 約280ms）。
  // 8秒はその20倍以上の余裕があり、地下鉄・低速回線でも取れるものは取れる。
  // 一方で、無応答のまま「判定中…」で固まる時間の上限をここで決めている
  // （以前は上限が無く、25秒待っても復帰手段が無かった）。
  const TIMEOUT_MS = 8000;

  // 明治期の土地を「面」で数えるときの、中心からの半径（m）。**変えるのはここ 1 行だけ。**
  //
  // ⚠ **見えている範囲（約 490m 四方）に合わせていない。** 合わせると、
  //   端末の画面幅で数える範囲が変わり、**同じ場所なのに割合が端末ごとに変わる**
  //   （掟4: 数字は必ず主張範囲の分母で書く。その分母が端末依存になってはいけない）。
  //   固定にしたうえで、**数えた範囲は写真に白い枠で描く**（言葉ではなく枠で示す）。
  // ⚠ SPEC §3 は明治期を「かなりの位置誤差を含むため**街区単位まで**」としている。
  //   100m（＝約 200m 四方）はその辺り。細かくすると位置誤差より小さい話をすることになる。
  // ⚠ **値を変えたら首位が入れ替わることがある。** 実測（2026-08-17 / 浦安）:
  //     100m（200m 四方） … 荒地 47.9% / 泥地 43.8%
  //     250m（500m 四方） … 泥地 47.6% が首位
  //   変えるときは `node scripts/swale-probe.mjs <緯度> <経度>` で同じ半径を測り、
  //   地点ごとの答えがどう動くかを見てから決める。
  // ⚠ 実行中にも変えられる（`Konjaku.AREA.halfM = 250` → もう一度場所を選ぶ）。
  //   手元で見比べるためのもので、画面から触らせる気は無い。
  const AREA = { halfM: 100 };

  // 明治期の低湿地の14区分と、1画素の分類は **swale.js の1か所**にある。
  // ⚠ ここに書き写さない。同じ表が 4 か所に散っていて、`check.mjs` の突き合わせからも
  //   1 か所（build-water.js）が漏れていた（2026-08-17 に寄せた）。
  const SWALE = KonjakuSwale.SWALE;

  const ERAS = [
    { id: "ort_riku10", label: "1936–42", sub: "陸軍撮影", ext: "png", min: 13, max: 18 },
    { id: "ort_USA10", label: "1945–50", sub: "米軍撮影", ext: "png", min: 10, max: 17 },
    { id: "ort_old10", label: "1961–69", sub: "", ext: "png", min: 10, max: 17 },
    { id: "gazo1", label: "1974–78", sub: "", ext: "jpg", min: 10, max: 17 },
    { id: "gazo2", label: "1979–83", sub: "", ext: "jpg", min: 10, max: 17 },
    { id: "gazo3", label: "1984–86", sub: "", ext: "jpg", min: 10, max: 17 },
    { id: "gazo4", label: "1987–90", sub: "", ext: "jpg", min: 10, max: 17 },
  ];

  // 最新の空中写真。
  //
  // ⚠ ERAS には入れない。photos() が答えるのは「**残っている**空中写真」＝過去の話で、
  //   そこに現在を混ぜると年代数（「7年代を確認」）の意味が変わる。
  //   現在の写真は判定の材料ではなく、並べて見せるときの右端でしかない。
  const LATEST = { id: "seamlessphoto", label: "現在", sub: "最新の空中写真",
    ext: "jpg", min: 2, max: 18 };

  // ---- タイル座標 ----
  function tileOf(lon, lat, z) {
    const n = 2 ** z;
    const xf = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    const x = Math.floor(xf), y = Math.floor(yf);
    return { x, y, px: Math.floor((xf - x) * 256), py: Math.floor((yf - y) * 256), z };
  }

  // ---- 画像タイル ----
  // Image の onerror では 404 と通信失敗を区別できない。だから fetch で取り、
  // HTTP のステータスを見てから画像に起こす。返すのは { state, image, status }。
  //
  // 失敗（unreachable）はキャッシュに残さない。残すと再試行が何もしなくなる。
  const imgCache = new Map();
  function loadImage(url) {
    if (!imgCache.has(url)) imgCache.set(url, readImage(url));
    return imgCache.get(url);
  }
  async function readImage(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      // 404 はサーバが「無い」と答えた確定的な不在。これは事実として使える。
      // 403 はここに入れない。下の !r.ok に落ちて unreachable になり、
      // キャッシュにも残らないので、拒否が解けたら再試行で取れる。
      if (r.status === 404)
        return { state: ABSENT, image: null, status: r.status };
      if (!r.ok) { imgCache.delete(url); return { state: UNREACHABLE, image: null, status: r.status }; }
      return { state: OK, image: await decodeImage(await r.blob()), status: r.status };
    } catch (e) {
      imgCache.delete(url);
      return { state: UNREACHABLE, image: null, error: e.name };
    }
  }
  // canvas を汚さずに読むため blob から起こす（GSI は ACAO:* を返すが、
  // blob 経由なら crossOrigin 属性の付け忘れで汚染される事故も起きない）。
  function decodeImage(blob) {
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    return new Promise((res, rej) => {
      const im = new Image(), u = URL.createObjectURL(blob);
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); };
      im.src = u;
    });
  }

  let cv = null, cx = null;
  function ctx() {
    if (!cx) { cv = document.createElement("canvas"); cv.width = cv.height = 256;
      cx = cv.getContext("2d", { willReadFrequently: true }); }
    return cx;
  }

  const classify = KonjakuSwale.classify;

  // ---- 明治期の地形 ----
  // 近傍の一致率も出す。実測ではほぼ100%になるが（掟: 確率を出さない。実測値そのものを出す）、
  // 境界付近だけは下がるので、そこを黙って断定しないために見る。
  async function meiji(lon, lat) {
    const z = 16, t = tileOf(lon, lat, z);
    const url = `${GSI}/swale/${z}/${t.x}/${t.y}.png`;
    const base = { key: "meiji", label: "明治期の地形", method: "直読み",
      caveat: "原典は三角点整備前の資料のため位置誤差を含む。街区単位の判断に留めること" };

    const res = await loadImage(url);
    // 読めなかったときは根拠を持たない。evidence を空にするのは意図的で、
    // 参照タイルのリンクや画素座標を出すと「読んでいないのに読んだ顔」になる。
    //
    // ⚠ 文言で原因を名指ししない。ここには通信断・タイムアウト・403（拒否）が
    //   まとめて来る。「通信エラー」と書くと、通信が成立している 403 のときに
    //   測っていない原因を書くことになる（掟: 出すのは実測値そのものだけ）。
    if (res.state === UNREACHABLE)
      return { ...base, ok: false, state: UNREACHABLE, value: null, evidence: {}, caveat: null,
        note: "明治期の低湿地データを、いま読み込めませんでした。この土地が整備対象かどうかも、まだ分かっていません" };
    // 404 は「このタイルは存在しない」という確定的な答え。読んだ画素は無いので載せない。
    if (res.state === ABSENT)
      return { ...base, ok: false, state: ABSENT, value: "データなし",
        evidence: { tile: url, status: res.status },
        note: "この範囲は明治期の低湿地データの整備対象外（全国の主要都市周辺のみ）" };

    const fact = { ...base, state: OK,
      evidence: { tile: url, pixel: [t.x, t.y, t.px, t.py] } };
    const g = ctx();
    g.clearRect(0, 0, 256, 256); g.drawImage(res.image, 0, 0);
    const [r, gr, b, a] = g.getImageData(t.px, t.py, 1, 1).data;
    fact.evidence.rgba = [r, gr, b, a];

    // 近傍15×15の一致率
    const half = 7;
    const d = g.getImageData(Math.max(0, t.px - half), Math.max(0, t.py - half), 15, 15).data;
    const cnt = {};
    for (let i = 0; i < d.length; i += 4) {
      const k = d[i + 3] === 0 ? "" : (classify(d[i], d[i + 1], d[i + 2])?.name ?? "?");
      cnt[k] = (cnt[k] || 0) + 1;
    }
    const total = Object.values(cnt).reduce((x, y) => x + y, 0);
    const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0];
    fact.evidence.agreement = total ? +(top[1] / total).toFixed(3) : null;

    // ---- 面（この範囲の内訳）----
    // ⚠ **点だけでは足りない。** 浦安は 1 点では「荒地」だが、範囲で数えると
    //   荒地 47.9% / 泥地 43.8% / 水 5.9% で**一つに言い切れない**（2026-08-17 実測）。
    //   点だけを出していたので、初見の 3 人が「だまされた気分」「軽い嘘に見える」と答えた。
    //   掟3「出すのは実測値そのものと、その取り方と、既知の限界だけ」。
    // ⚠ **範囲は狭めない。** SPEC は明治期を「街区単位まで」としているので、その辺りで取る。
    //   広げると答えが変わる（浦安は 200m 四方で荒地、500m 四方だと泥地が首位になる）。
    // ⚠ **端では、数えられた大きさをそのまま返す。** タイルの縁に近いと窓が切れる。
    //   縮んだのに「200m 四方」と書くと、分母が嘘になる（掟4）。
    //   隣のタイルまで取りに行けば埋まるが、そのぶん地理院への要求が増える。ここでは取らない。
    const M_PER_PX = 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** z;
    const want = Math.round(AREA.halfM / M_PER_PX);   // 中心からの半径（m）→ 画素
    const x0 = Math.max(0, t.px - want), y0 = Math.max(0, t.py - want);
    const x1 = Math.min(255, t.px + want), y1 = Math.min(255, t.py + want);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const box = g.getImageData(x0, y0, w, h).data;
    const tal = KonjakuSwale.tally(box);
    fact.area = {
      ...tal,
      // 実際に数えた大きさ（縮んだならそのまま小さい値）
      meters: { w: Math.round(w * M_PER_PX), h: Math.round(h * M_PER_PX) },
      box: [x0, y0, w, h],
      clipped: w < 2 * want + 1 || h < 2 * want + 1,
    };
    fact.evidence.area = { box: fact.area.box, meters: fact.area.meters,
      classified: tal.classified, scanned: tal.scanned };

    if (a === 0) {
      // 凡例に「草地・荒地は山地や台地上のものは取得しない」とある。
      // つまり「該当なし」は「低湿地でなかった」とは限らない。断定しない。
      return { ...fact, ok: true, value: null, none: true,
        note: "低湿地に該当しなかったか、そもそも取得対象外だったかを、このデータからは区別できない" };
    }
    const c = classify(r, gr, b);
    if (!c) return { ...fact, ok: false, value: "区分を特定できず",
      note: "凡例のどの色とも一致しない（境界のにじみの可能性）" };
    // 実測では大半が100%だが、境界付近では下がる（大阪此花で71.1%）。
    // 下がっているときは断定を弱める。数値は作らず、実測した割合をそのまま使う。
    const mixed = fact.evidence.agreement != null && fact.evidence.agreement < 0.9;
    return { ...fact, ok: true, value: c.name, water: !!c.water, mixed,
      note: mixed
        ? `周囲は単一の区分ではない（近傍の ${(fact.evidence.agreement*100).toFixed(0)}% がこの区分）。区分の境目にあたる可能性がある`
        : null };
  }

  // ---- 地形分類 ----
  // 「その土地はどうやってできたか」の主たる手法（掟: 主題は「成り立ち」。明治期は手法のひとつ）。明治期の低湿地は
  // 同じ問いに別の角度から答える、もうひとつの手法として残してある。
  //
  // ラスタではなくベクトル（GeoJSON）で取る。色ではなく属性なので、凡例の色合わせが
  // 要らない。土地条件図・治水地形分類図のラスタは凡例を機械的に対応づけられない。
  //
  // ⚠ 国土地理院自身が「ベクトルタイル提供実験」と呼んでいる（レイヤ名が experimental_）。
  //   住所検索と同じで、止まりうる依存として扱う（掟: 外部APIは「止まりうる依存」として扱う）。
  const LFC = "https://maps.gsi.go.jp/xyz";
  const LFC_NAT = "experimental_landformclassification1";
  const LFC_ART = "experimental_landformclassification2";
  // z14〜16 が詳細版（主要平野部のみ）、z5〜13 が広域版・地域版（全国）。
  // 詳細版が無いところで広域版に落ちるが、粗くなったことは必ず言う。
  // 「詳細版が無い」と「分類が無い」は別のこと。
  const LFC_FINE = 16, LFC_COARSE = 13;

  // 水に由来する区分。バッジの色と、文章の言い回しを変えるためだけに使う。
  // 判定そのものは変えない（ここで区分を作り直すと、国土地理院の分類ではなくなる）。
  const WATERY = new Set(["水部", "旧水部", "河川敷･浜", "湖", "干拓地", "落堀"]);

  let tableP = null;
  function table() {
    // 相手先ではなく自分の配信物。落ちたらこちらの不備なので、失敗を覚えない。
    if (!tableP) tableP = fetch("./data/landform.json", { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => { if (!r.ok) throw new Error(`landform.json ${r.status}`); return r.json(); })
      .catch((e) => { tableP = null; throw e; });
    return tableP;
  }

  const geoCache = new Map();
  async function geojson(url) {
    if (!geoCache.has(url)) geoCache.set(url, readGeo(url));
    return geoCache.get(url);
  }
  async function readGeo(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      // 不在と読んでよいのは 404 だけ（403 は下の !r.ok で unreachable になる）
      if (r.status === 404) return { state: ABSENT, json: null, status: r.status };
      if (!r.ok) { geoCache.delete(url); return { state: UNREACHABLE, json: null, status: r.status }; }
      return { state: OK, json: await r.json(), status: r.status };
    } catch (e) {
      geoCache.delete(url);
      return { state: UNREACHABLE, json: null, error: e.name };
    }
  }

  // 交差数判定。外側リングに入り、かつどの穴にも入らないものだけを採る
  function inRing(px, py, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  function inPolygon(px, py, geom) {
    if (!geom) return false;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
                : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const p of polys) {
      if (!p.length || !inRing(px, py, p[0])) continue;
      let hole = false;
      for (let k = 1; k < p.length; k++) if (inRing(px, py, p[k])) hole = true;
      if (!hole) return true;
    }
    return false;
  }

  async function codeAt(layer, lon, lat, z) {
    const t = tileOf(lon, lat, z);
    const url = `${LFC}/${layer}/${z}/${t.x}/${t.y}.geojson`;
    const res = await geojson(url);
    if (res.state !== OK) return { ...res, url };
    for (const f of res.json?.features ?? [])
      if (inPolygon(lon, lat, f.geometry)) return { state: OK, url, code: String(f.properties?.code ?? "") };
    // タイルは在るが、この点に重なる面が無い。これも確定的な「無い」
    return { state: OK, url, code: null };
  }

  async function landform(lon, lat) {
    const base = { key: "landform", label: "地形分類", method: "ベクトル直読み",
      caveat: "国土地理院の提供実験（ベクトルタイル）。予告なく止まる可能性がある" };
    let tbl;
    try { tbl = await table(); }
    catch { return { ...base, ok: false, state: UNREACHABLE, value: null, evidence: {}, caveat: null,
      note: "地形分類の対照表を読み込めませんでした" }; }

    // 詳細版（z16）→ 無ければ広域版（z13）。粗くなったことは fine で持ち回る
    let hit = null, fine = true;
    for (const z of [LFC_FINE, LFC_COARSE]) {
      const r = await codeAt(LFC_NAT, lon, lat, z);
      if (r.state === UNREACHABLE)
        return { ...base, ok: false, state: UNREACHABLE, value: null, evidence: {}, caveat: null,
          note: "地形分類を、いま読み込めませんでした。この土地が対象かどうかも、まだ分かっていません" };
      if (r.state === OK && r.code && tbl.codes[r.code]) { hit = { ...r, z }; break; }
      fine = false;
    }
    if (!hit)
      return { ...base, ok: false, state: ABSENT, value: null,
        note: "この地点には地形分類のデータが無い" };

    const name = tbl.codes[hit.code];
    const cls = tbl.classes[name] ?? {};
    const fact = { ...base, ok: true, state: OK, value: name,
      why: cls.why ?? null, risk: cls.risk ?? null, fine,
      evidence: { tile: hit.url, code: hit.code, zoom: hit.z,
                  detail: fine ? "詳細版（z14〜16）" : "広域版・地域版（z5〜13）" },
      // 粗いほうに落ちたことを黙らない。「詳細版が無い」と「分類が無い」は別のこと
      note: fine ? null
        : "この範囲には詳細版が整備されていないため、広い区分で答えています（より細かい分類は分かっていません）" };

    // 人工地形は別レイヤ。盛土・埋立・切土は「どうやってできたか」の核心なので、
    // 取れたときだけ足す。取れなかったことを「無い」とは言わない。
    const a = await codeAt(LFC_ART, lon, lat, LFC_FINE);
    if (a.state === OK && a.code && tbl.codes[a.code]) {
      fact.artificial = tbl.codes[a.code];
      fact.artificialWhy = tbl.classes[fact.artificial]?.why ?? null;
      fact.artificialRisk = tbl.classes[fact.artificial]?.risk ?? null;
      fact.evidence.artificialTile = a.url;
      fact.evidence.artificialCode = a.code;
    } else if (a.state === UNREACHABLE) {
      fact.artificialUnread = true;
      // 落ちたのは人工地形レイヤだけ。「地形分類を読み込めませんでした」と出すと、
      // 成功している自然地形まで失敗したように読める
      fact.unreadLabel = "盛土・埋立のデータ";
    }
    return fact;
  }

  // ---- 標高 ----
  // 「海抜が低い」と呼ぶ線。バッジ・提案の両方でこの1本だけを使う。
  //
  // ⚠ ここを「低地」と書いてはいけない。地形分類にも「低地」という区分名があり
  //   （砂礫や泥が堆積してできた平坦地。標高の話ではない）、同じ画面に意味の違う
  //   同じ語が2つ並ぶ。実際、軽井沢では「低地（広い区分）」と「標高 939.56m」が
  //   同じカードに出て、判定が壊れているように見えていた。
  //   区分名は国土地理院のものなので変えられない。こちらの語を変える。
  // 地点に合わせて動かさない。動かした瞬間、この線は実測ではなく都合になる。
  const LOWLAND_M = 2;

  // dem5a（5mメッシュ）を優先し、無ければ dem（10mメッシュ）に落とす。
  // 画像タイルと同じ3状態。素の fetch は 404 も通信断も同じ null にしていた。
  const demCache = new Map();
  async function fetchDem(src, z, x, y) {
    const url = `${GSI}/${src}/${z}/${x}/${y}.txt`;
    if (!demCache.has(url)) demCache.set(url, readDem(url));
    return { url, ...(await demCache.get(url)) };
  }
  async function readDem(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      // 不在と読んでよいのは 404 だけ（403 は下の !r.ok で unreachable になる）
      if (r.status === 404) return { state: ABSENT, text: null, status: r.status };
      if (!r.ok) { demCache.delete(url); return { state: UNREACHABLE, text: null, status: r.status }; }
      return { state: OK, text: await r.text(), status: r.status };
    } catch (e) {
      demCache.delete(url);   // 失敗を覚えると再試行が空振りする
      return { state: UNREACHABLE, text: null, error: e.name };
    }
  }

  async function elevation(lon, lat) {
    const fact = { key: "elevation", label: "標高", method: "直読み", evidence: {}, caveat: null };
    let unreachable = false;
    for (const [src, z, mesh] of [["dem5a", 15, "5mメッシュ"], ["dem", 14, "10mメッシュ"]]) {
      const t = tileOf(lon, lat, z);
      const { url, state, text } = await fetchDem(src, z, t.x, t.y);
      // 5m→10m の落とし方は「5mメッシュに無い」ときのためのもの。
      // 通信で落ちたなら 10m も落ちる。順に待つと待ち時間が倍になるだけなので、
      // ここで打ち切って「取れなかった」に倒す。
      if (state === UNREACHABLE) { unreachable = true; break; }
      if (!text) continue;
      const v = text.trim().split("\n")[t.py]?.split(",")[t.px];
      if (!v || v === "e") continue;          // e = 欠測
      const m = Number(v);
      if (!Number.isFinite(m)) continue;
      return { ...fact, ok: true, state: OK, value: m,
        evidence: { tile: url, pixel: [t.x, t.y, t.px, t.py], raw: v, source: mesh } };
    }
    // 1枚でも読めなかったなら「無い」とは言えない。読めなかった、とだけ言う。
    if (unreachable)
      return { ...fact, ok: false, state: UNREACHABLE, value: null, evidence: {},
        note: "標高データを、いま読み込めませんでした" };
    return { ...fact, ok: false, state: ABSENT, value: null, note: "この地点の標高データが無い" };
  }

  // ---- 残っている空中写真 ----
  // タイルが存在しても、その地点が真っ白（撮影範囲外）のことがある。
  // タイルの有無だけでは見抜けないので、画素まで見る（掟: 確率を出さない。実測値そのものを出す）。
  //
  // 返り値は2段になっている。
  //   value … 「この地点に**残っている**写真」だけ。帯（トップ）と年代の数はこれで数える
  //   eras  … 7年代**全部**の結末（ok / absent / unreachable と、白紙だったか）
  //
  // ⚠ eras を足したのは、`/peel` が年代の段を自前の固定表で組んでいたから
  //   （掟: 同じ問いに答える実装を2つ持たない）。固定 8 段のうち、この地点に存在しない
  //   年代まで地図レイヤとして可視にしていたため、広島で写真タイルの 404 を
  //   **202 件**送っていた（2026-08-16 実測。長崎 出島では 491 件）。
  //   「どの年代を段に出すか」に答えるのは、ここ1か所にする。
  async function photos(lon, lat) {
    // 7年代を順番に待つと、無応答のときタイムアウト×7 まで伸びる。
    // 独立した取得なので並べる。通常時も速くなる。
    const jobs = ERAS.map(async (e) => {
      const z = Math.min(Math.max(16, e.min), e.max);
      const t = tileOf(lon, lat, z);
      const tile = `${GSI}/${e.id}/${z}/${t.x}/${t.y}.${e.ext}`;
      return { e, t, tile, res: await loadImage(tile) };
    });

    const found = [], unread = [], eras = [];
    // canvas は1枚を使い回すので、画素の判定は同期のループでまとめてやる
    for (const { e, t, tile, res } of await Promise.all(jobs)) {
      // 年代ごとの結末は、どの枝を通っても必ず1件残す。
      // ⚠ ここで push を落とすと、`/peel` の段からその年代が黙って消える
      //   （「取れなかった」が「無い」になる経路がもう1本できる）。
      const era = { id: e.id, label: e.label, sub: e.sub, ext: e.ext,
        min: e.min, max: e.max, tile, px: t.px, py: t.py, z: t.z,
        state: res.state, status: res.status ?? null, blank: false };
      eras.push(era);
      if (res.state === UNREACHABLE) { unread.push(e); continue; }
      if (res.state === ABSENT) continue;      // その年代の写真は存在しない
      let blank = false;
      try {
        const g = ctx();
        g.clearRect(0, 0, 256, 256); g.drawImage(res.image, 0, 0);
        const half = 7;
        const d = g.getImageData(Math.max(0, t.px - half), Math.max(0, t.py - half), 15, 15).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { sum += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; n++; }
        const mean = sum / n;
        let vv = 0;
        for (let i = 0; i < d.length; i += 4) vv += ((0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]) - mean) ** 2;
        blank = mean > 250 && Math.sqrt(vv / n) < 1;
      } catch { /* 読めない場合は残す */ }
      // ⚠ ERAS の要素をそのまま push してはいけない。
      //   ERAS はモジュール全体で共有している定数で、ここに座標を書き足すと
      //   前に調べた場所のタイルURLが次の場所に残る。必ず複製に持たせる。
      //
      // tile / px / py は「この年代の写真を、実際にどこの画素で確かめたか」。
      // 判定のためにもう取得してある画像なので、これを画面に出すのに再取得は要らない
      // （同じURLなのでブラウザのキャッシュから出る）。
      era.blank = blank;
      if (!blank) found.push({ ...e, tile, px: t.px, py: t.py, z: t.z });
    }
    // ⚠ 並べて取ったので、返る順は取得の速さで変わる。時系列（古い順）に直す。
    //   ここを揃えないと、同じ地点でも読むたびに段の並びが入れ替わる
    const order = new Map(ERAS.map((e, i) => [e.id, i]));
    eras.sort((a, b) => order.get(a.id) - order.get(b.id));
    found.sort((a, b) => order.get(a.id) - order.get(b.id));
    // 「1本も取れていないのに 7年代を確認」と書いていたのがここ。
    // 確認できた年代の数しか evidence に載せず、読めなかった分は隠さず数える。
    const checked = ERAS.length - unread.length;
    const fact = { key: "photos", label: "残っている空中写真", method: "直読み",
      value: found, eras, unread: unread.length, caveat: null,
      evidence: checked ? { checked } : {} };
    if (unread.length && !found.length)
      return { ...fact, ok: false, state: UNREACHABLE,
        note: "空中写真を、いま読み込めませんでした。残っているかどうかは分かっていません" };
    if (unread.length)
      return { ...fact, ok: true, state: "partial",
        note: `${unread.length} 年代分は読み込めませんでした。ここに出ているのは、読めた ${checked} 年代のうちの結果です` };
    return { ...fact, ok: found.length > 0, state: OK,
      note: found.length ? null : "この地点には過去の空中写真が残っていない" };
  }

  // ---- 事実をまとめて取る ----
  // どれか1つでも「取れなかった」なら、画面は再試行を出さなければならない。
  // 判断材料をここで畳んで渡す（呼び出し側に state の解釈を散らさない）。
  async function facts(lon, lat) {
    // 地形分類を先頭に置く。これが主題（その土地はどうやってできたか）に直接答える手法で、
    // 明治期の低湿地は同じ問いに別の角度から答えるもうひとつの手法（掟: 主題は「成り立ち」。明治期は手法のひとつ）。
    const [l, m, e, p] = await Promise.all([
      landform(lon, lat), meiji(lon, lat), elevation(lon, lat), photos(lon, lat)]);
    const list = [l, m, e, p];
    // 人工地形だけ落ちたときは landform.state は ok のままなので、
    // それだけを見ていると再試行ボタンが出ない。ここで拾う
    return { lon, lat, list, byKey: { landform: l, meiji: m, elevation: e, photos: p },
      unread: list.filter((f) => f.state === UNREACHABLE || f.state === "partial" || f.artificialUnread) };
  }


  // ---- バッジ（読ませずに1秒で伝える） ----
  // 文章より先に目に入る要約。ただし出せるのは検証できた材料だけ。
  //
  // ⚠ 「昭和: 工業」のような中間バッジは作れない。
  // 空中写真の輝度・分散・彩度では水陸すら分離できないことを実測で確認している
  // （皇居の森が東京湾より暗い。docs 掟: 画素から出せないことは言わない（実測1））。用途の判定はさらに無理。
  // 埋められない中間は、埋めずに空けておく。
  function badges(f) {
    const out = [];
    const l = f.byKey.landform, m = f.byKey.meiji, e = f.byKey.elevation, p = f.byKey.photos;

    // 地形分類が先頭。主題に直接答えるのはこれ（掟: 主題は「成り立ち」。明治期は手法のひとつ）
    if (l.state === UNREACHABLE) {
      out.push({ icon: "⚠", text: "地形分類を読み込めませんでした", key: "landform", tone: "warn" });
    } else if (l.ok) {
      out.push({ icon: WATERY.has(l.value) ? "🌊" : "🗻", key: "landform",
        tone: WATERY.has(l.value) ? "water" : "land",
        // 広い区分で答えているときは、それを黙らずにバッジ自体に書く
        text: `${l.value}${l.fine ? "" : "（広い区分）"}` });
      if (l.artificial)
        out.push({ icon: "🏗", key: "landform", tone: "warn", text: l.artificial });
      else if (l.artificialUnread)
        out.push({ icon: "⚠", key: "landform", tone: "warn", text: "盛土・埋立を読み込めませんでした" });
    }

    // 取れなかったときは、土地についての主張をひとつも置かない。
    // 置けるのは「読み込めていない」という、こちら側の状態だけ。
    if (m.state === UNREACHABLE) {
      out.push({ icon: "⚠", text: "明治期のデータを読み込めませんでした", key: "meiji", tone: "warn" });
    } else if (!m.ok && m.value === "データなし") {
      out.push({ icon: "—", text: "明治期のデータなし", key: "meiji", tone: "dim" });
    } else if (m.none) {
      out.push({ icon: "—", text: "明治期: 記録なし", key: "meiji", tone: "dim" });
    } else if (m.value) {
      out.push({ icon: m.water ? "🌊" : "🌾", key: "meiji", tone: m.water ? "water" : "land",
        text: `明治期: ${m.value}${m.mixed ? "（境目）" : ""}` });
    }

    if (e.ok) {
      const v = e.value;
      out.push({ key: "elevation",
        icon: v < 0 ? "⚓" : v < LOWLAND_M ? "〰" : "⛰",
        tone: v < 0 ? "warn" : "dim",
        text: v < 0 ? `標高 ${v.toFixed(2)}m（海面より低い）`
            : v < LOWLAND_M ? `標高 ${v.toFixed(2)}m（海抜が低い）`
                            : `標高 ${v.toFixed(2)}m` });
    } else if (e.state === UNREACHABLE) {
      out.push({ icon: "⚠", key: "elevation", tone: "warn", text: "標高を読み込めませんでした" });
    }

    if (p.ok) {
      out.push({ icon: "📷", key: "photos", tone: "dim",
        text: `${p.value[0].label}年から見られる（${p.value.length}年代${
          p.state === "partial" ? "／一部は未読" : ""}）` });
    } else if (p.state === UNREACHABLE) {
      out.push({ icon: "⚠", key: "photos", tone: "warn", text: "空中写真を読み込めませんでした" });
    }
    return out;
  }

  // ---- 文章化 ----
  // 事実の集合からテンプレートで組む。生成AIは使わない。
  // 事実が正しければ文も正しい、という関係を保つため（掟: 確率を出さない。実測値そのものを出す）。
  function narrate(f) {
    const out = [];
    const l = f.byKey.landform, m = f.byKey.meiji, e = f.byKey.elevation, p = f.byKey.photos;

    // 1文目は「どうやってできたか」。成因の文は国土地理院の記述をそのまま使う（掟: 主題は「成り立ち」。明治期は手法のひとつ）
    if (l.ok) {
      out.push(l.artificial
        ? `この場所は ${l.value} で、いまは ${l.artificial} です。`
        : `この場所は ${l.value} です。`);
      if (l.why) out.push(l.why);
      if (l.artificialWhy) out.push(l.artificialWhy);
      if (!l.fine) out.push(l.note);
      // 人工地形（盛土・埋立・切土）が読めなかったことを黙らない。
      // 黙ると「盛土地･埋立地です」が消えるだけになり、取れなかったのか
      // そもそも無かったのかを画面から区別できなくなる（掟: 主題は「成り立ち」。明治期は手法のひとつ）
      if (l.artificialUnread)
        out.push("盛土・埋立・切土のデータは、いま読み込めませんでした。この土地に手が入っているかどうかは、まだ分かっていません。");
    } else if (l.state === UNREACHABLE) {
      out.push(l.note);
    }

    // 明治期は、同じ問いに別の角度から答えるもうひとつの手法。
    // 取れたときだけ足す。取れないことは、この土地の話ではない
    if (m.ok && m.value) {
      if (m.mixed) {
        out.push(`明治期には ${m.value} だったとみられます（区分の境目にあたります）。`);
      } else {
        out.push(m.water
          ? `明治期には ${m.value} ── 水の上でした。`
          : `明治期には ${m.value} でした。`);
        if (m.water && !l.artificial) out.push("いまの土地は、その上を埋め立てて造られています。");
      }
    } else if (!l.ok) {
      // 地形分類でも何も言えなかったときだけ、明治期側の理由を出す。
      // 両方失敗したことを黙って1つにまとめない
      out.push(m.ok && m.none
        ? "明治期の低湿地データにも、この地点の記録がありません。"
        : (m.note ?? "明治期の地形も判定できませんでした。"));
    }

    if (e.ok) {
      const v = e.value;
      out.push(v < 0
        ? `いまの標高は ${v.toFixed(2)} m ── 海面より低い土地です。`
        : `いまの標高は ${v.toFixed(2)} m です。`);
    } else if (e.state === UNREACHABLE) {
      out.push(e.note + "。");
    }

    if (p.ok) {
      const oldest = p.value[0];
      out.push(`空中写真は ${oldest.label} 年のものが最も古く残っています（${p.value.length} 年代）。`);
      if (p.state === "partial") out.push(p.note + "。");
    } else if (p.note) {
      out.push(p.note + "。");
    }
    return out;
  }

  // ---- 次に調べる語 ----
  // 判定が出ても、地理や歴史に詳しくない人は次の一手を思いつけない。
  // 「豊洲 埋立の歴史」と打てる人にはランチャーで足りるが、そうでない人には
  // 判定が行き止まりになる。そこで区分と標高から、その土地でだけ意味を持つ語を出す。
  //
  // ⚠ これは主張ではなく**検索語の提案**である。「ここは埋立地です」とは書かない。
  // 明治期に水域だったことは画素として実測できるが、その後どう埋められたかは
  // このデータには無い。無いものを言わないために、出すのは語と、
  // なぜ勧めるか（reason＝実測した事実そのもの）だけに留める（掟: 根拠のないことは書かない / 掟: 確率を出さない。実測値そのものを出す）。
  //
  // 外部APIは増やさない。リンクを組み立てるだけなので費用はゼロのまま。
  //
  // 語を採るかどうかの基準はひとつだけ:
  //   **「その判定から、なぜこの語が出るのか」を1行で言えるか。**
  // 言えないものは置かない。「明治期に田だった → 旧街道」は言えない
  // （旧街道は自然堤防や微高地を通るもので、田だったことはむしろ逆の材料）。
  // 「砂礫地 → 地形の成り立ち」も言えない（どの土地にも当てはまる語）。
  // 数が減るのはかまわない。空の区分があってよい。
  const TOPICS = {
    // 明治期に水の上だった → いまの陸は誰かが造った陸。造成の経緯と、水際の構造物。
    fill:     { icon: "🏗", label: "埋立の歴史",   query: "埋立の歴史",  kw: ["埋立", "埋め立て", "うめたて", "造成"] },
    revet:    { icon: "⚓", label: "護岸・運河",   query: "護岸 運河",   kw: ["護岸", "運河", "岸壁", "水辺"] },
    // 水の上を埋めた土地 かつ 低地 → 水を含んだ緩い地盤が疑われる場所。
    // この重なりのときだけ、この語を調べる意味がある（危険だとは言わない）。
    liquefy:  { icon: "〰", label: "液状化",       query: "液状化",      kw: ["液状化", "地盤", "揺れ"] },
    // 水田には必ず用水路があり、市街化のときに蓋をされて暗渠になる
    ditch:    { icon: "🚰", label: "用水路・暗渠", query: "用水路 暗渠", kw: ["用水", "暗渠", "水路", "川跡", "あんきょ"] },
    // 低湿地を市街地にするには、排水と河川改修（＝治水）が要った
    levee:    { icon: "🌾", label: "治水の歴史",   query: "治水の歴史",  kw: ["治水", "水防", "川の歴史"] },
    // 塩田は産業そのものなので、跡地と廃止の経緯がそのまま調べ物になる
    salt:     { icon: "🧂", label: "塩田の跡",     query: "塩田の跡",    kw: ["塩田", "塩", "製塩"] },
    // 明治期に堤防だった線は、いま市街地の中に道路や段差として残っている
    bank:     { icon: "🧱", label: "旧堤防",       query: "旧堤防",      kw: ["堤防", "土手", "堤"] },
    // 海面より低い土地 → 想定ではなく、実際に何が起きたかの記録。
    // lens は「同じ話題の自前レンズ」。当たっているときは劣化版を並べない（index.html 側で見る）。
    floodlog: { icon: "📜", label: "水害の記録",   query: "水害の記録",  kw: ["水害", "浸水実績", "水につかった"], lens: "hazard" },
    // ここから下は地形分類から出る語（掟: 主題は「成り立ち」。明治期は手法のひとつ）。
    // 埋立とは工法も経緯も別物なので、干拓は独立させる
    reclaim:  { icon: "🌊", label: "干拓の歴史",   query: "干拓の歴史",  kw: ["干拓", "かんたく"] },
    // かつての流路は、いま暗渠や不自然に曲がった道として残っている
    oldriver: { icon: "🏞", label: "川の跡",       query: "川の跡 旧河道", kw: ["旧河道", "川跡", "川の跡", "廃川"] },
    // 地形の名前がそのまま現象の名前になっている区分は、記録を引く意味がある
    landslip: { icon: "⛰", label: "地すべりの記録", query: "地すべりの記録", kw: ["地すべり", "地滑り"] },
    debris:   { icon: "🪨", label: "土砂災害の記録", query: "土砂災害の記録", kw: ["土砂", "土石流", "崖崩れ", "がけ崩れ"] },
    // 周囲の地面より川底が高い川。破堤したときの挙動が普通の川と違う
    ceiling:  { icon: "🌉", label: "天井川",       query: "天井川",      kw: ["天井川"] },
    // 埋めた土地の裏返し。削って造った土地にも造成の履歴がある
    cut:      { icon: "⛏", label: "造成の履歴",   query: "造成の履歴 切土", kw: ["切土", "造成", "宅地造成"] },
  };

  // 地形分類の36区分のうち、語を置いたのは9つだけ。
  // 空けてあるのは、その区分から「その土地でだけ意味を持つ語」を言えないため。
  //
  //   台地･段丘 / 丘陵・小起伏地 / 山地 / 残丘状地形 / カルスト地形 / 砂州・砂丘 /
  //   自然堤防 / 凹地・浅い谷 / 農耕平坦化地 / 改変工事中 / 河川敷･浜 / 水部 / 湖 /
  //   火山地形の各区分 / 低地 / 台地・段丘 / 山地・丘陵
  //
  // ⚠ 氾濫平野・海岸平野 と 後背低地･湿地 を意図的に空けてある。
  //   日本の平野の大半がこれに当たるので、ここに語を置くと
  //   「全国の低地に共通の話」にしかならない。suggestions() が標高だけを根拠に
  //   語を並べるのを避けているのと同じ理由（掟: 説明できない色は重ねない）。
  //
  // ⚠ 自然堤防も空けた。「古い集落が乗っていることが多い」は言えるが、
  //   多いというのは推測であって、この地点について検証した事実ではない。
  const BY_LANDFORM = {
    "旧水部":         ["fill", "revet"],
    "盛土地･埋立地":  ["fill"],
    "干拓地":         ["reclaim"],
    "切土地":         ["cut"],
    "旧河道":         ["oldriver"],
    "落堀":           ["oldriver", "levee"],
    "天井川等":       ["ceiling"],
    "地すべり地形":   ["landslip"],
    // ⚠ 扇状地は入れない。国土地理院の記述が
    //   「谷口に近い場所では土石流のリスクがある」と**条件付き**で書いており、
    //   その地点が谷口に近いかどうかを、こちらは判定していない。
    //   条件を落として「扇状地のため土砂災害を調べる」と書くと、原典より強く言うことになる。
    //   実際、京都駅（扇端）と札幌駅で土砂災害の語が出ていた。合わない。
    //   下の3区分は同じ記述が条件なしなので、そちらだけ採る。
    "山地斜面等":     ["debris"],
    "崖･段丘崖":      ["debris"],
    "山麓堆積地形":   ["debris"],
  };

  // 「水を含んだ緩い地盤が疑われる」側の区分。液状化の語を出す条件に使う。
  // 国土地理院自身が、これらの区分の災害リスクとして液状化を挙げている。
  const LOOSE = new Set(["旧水部", "盛土地･埋立地", "旧河道", "干拓地", "落堀"]);

  // 区分ごとの対応づけ。凡例の14区分のうち、
  //   草地・泥炭地・砂礫地・荒地
  // は空けてある。「その土地でだけ意味を持つ語」を言えないため。
  // 埋めるために「地形の成り立ち」のような当たり障りのない語を置くと、
  // 提案そのものが「それらしく見えるだけのもの」に落ちる。空けておくほうがよい。
  const BY_MEIJI = {
    "河川・湖沼・海面": ["fill", "revet"],
    "干潟・砂浜":       ["fill", "revet"],
    "田":               ["ditch"],
    "深田":             ["ditch"],
    "湿地":             ["levee"],
    "ヨシ":             ["levee"],
    "茅":               ["levee"],
    "泥地":             ["levee"],
    "塩田":             ["salt"],
    "堤防":             ["bank"],
  };

  const MAX_SUGGESTIONS = 3;

  function suggestions(f) {
    const l = f?.byKey?.landform, m = f?.byKey?.meiji, e = f?.byKey?.elevation;

    // ⚠ 広い区分（広域版）からは語を出さない。
    //   「低地」「山地」しか分かっていないところで具体的な語を並べると、
    //   分かっていないことを分かった顔で見せることになる（掟: 主題は「成り立ち」。明治期は手法のひとつ）。
    const lf = (l && l.ok && l.fine) ? l : null;
    const lfKeys = lf ? (BY_LANDFORM[lf.value] ?? []) : [];
    // 人工地形（盛土・埋立・切土）は自然地形と別レイヤで、こちらだけ取れることがある
    const artKeys = lf?.artificial ? (BY_LANDFORM[lf.artificial] ?? []) : [];
    const meijiKeys = (m?.ok && m.value && BY_MEIJI[m.value]) ? BY_MEIJI[m.value] : [];

    // どの手法からも語が出ないなら黙る。
    // 「記録なし」は「陸だった」ではないし、標高だけを根拠に語を並べても
    // 全国の低地に共通の話にしかならない。出せる材料が無いときは黙る。
    if (!lfKeys.length && !artKeys.length && !meijiKeys.length) return [];

    // 境目のときは narrate() と格を揃えて言い切らない。
    const edge = m?.mixed ? "（区分の境目）" : "";
    const wasAlone = m?.mixed
      ? `明治期に ${m.value} だったとみられるため${edge}`
      : `明治期に ${m?.value} だったため`;
    const wasWith = m?.mixed ? `明治期に ${m.value} だったとみられ` : `明治期に ${m?.value} で`;

    // 候補を「その語がどれだけこの地点に固有か」の順に並べ、先頭から3件だけ採る。
    // 区分の語で先に枠を埋めると、標高の話が毎回こぼれる。
    const cands = [];

    // 1. 2つの事実が重なって初めて言える語。
    //    液状化は「緩い地盤が疑われる区分」だけでも「低い」だけでも出せない。両方が要る。
    //    区分から2件・標高から1件という固定枠にしていたときは、この語が
    //    最も当てはまる豊洲（水域かつ標高1.91m）でちょうど枠から落ち、
    //    当てはまらない夢の島（水域だが標高10.10m）で出ていた。逆だった。
    //    「低地」の線はバッジと同じ LOWLAND_M ひとつ。ここだけ緩めない。
    const loose = lf && (LOOSE.has(lf.value) || (lf.artificial && LOOSE.has(lf.artificial)));
    if (loose && e?.ok && e.value < LOWLAND_M) {
      const what = LOOSE.has(lf.value) ? lf.value : lf.artificial;
      cands.push(["liquefy", `${what} で、いまの海抜が ${e.value.toFixed(2)}m と低いため`]);
    } else if (m?.water && e?.ok && e.value < LOWLAND_M) {
      cands.push(["liquefy", `${wasWith}、いまの海抜が ${e.value.toFixed(2)}m と低いため${edge}`]);
    }

    // 2. 標高そのものが際立っているときの語
    if (e?.ok && e.value < 0)
      cands.push(["floodlog", `いまの標高が ${e.value.toFixed(2)}m ── 海面より低いため`]);

    // 3. 地形分類から出る語。主題（どうやってできたか）に直接答える手法なので、
    //    明治期より先に置く（掟: 主題は「成り立ち」。明治期は手法のひとつ）
    for (const k of lfKeys) cands.push([k, `この土地が ${lf.value} のため`]);
    for (const k of artKeys) cands.push([k, `この土地が ${lf.artificial} のため`]);

    // 4. 明治期の区分から出る語
    for (const k of meijiKeys) cands.push([k, wasAlone]);

    const seen = new Set(), out = [];
    for (const [k, reason] of cands) {
      if (seen.has(k)) continue;     // 同じ語を二度出さない
      seen.add(k);
      const t = TOPICS[k];
      out.push({ key: k, icon: t.icon, label: t.label, query: t.query,
        kw: t.kw, lens: t.lens ?? null, reason });
      if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out;
  }

  global.Konjaku = { GSI, SWALE, ERAS, LATEST, AREA, tileOf, loadImage, classify,
    landform, meiji, elevation, photos, facts, narrate, badges, suggestions,
    STATE: { OK, ABSENT, UNREACHABLE }, TIMEOUT_MS };
})(window);
