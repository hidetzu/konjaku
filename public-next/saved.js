// 今昔 v0.1.0 — 保存した場所の控え。
//
// ⚠ **DOM も地図も持たない。**⚠ **Node からそのまま呼べる**
//   （`.claude/rules/javascript.md`。⚠ **検査がブラウザ抜きで回せる**）。
//   ⚠ **置き場は引数で受け取る。**⚠ `localStorage` を直接触らない。
//
// ⚠ **文言を持たない**（`.claude/rules/domain.md`）。⚠ 数と意味だけ。
//   ⚠ 「きょう」「きのう」のような言い方は、⚠ **画面側が決める。**
(function (g) {
  "use strict";

  // 版。控えた形が変わったら上げる。⚠ **上げると前の版は読まれない**（混ざらない）
  const KEY = "konjaku-next-saved-v1";

  // 同じ場所を二重に保存しない距離。
  //   ⚠ **地図の中心は指で少し動く。**⚠ 厳密に一致することはまず無い。
  //   ⚠ 50m は「同じ交差点なら同じ場所」と読める幅。⚠ 建物 1 棟より広く、⚠ 街区より狭い。
  const SAME_M = 50;

  // 2 点の距離（m）。⚠ **緯度の差は経度より効く**ので、⚠ cos で縮める。
  //   ⚠ 数十 m を測るだけなので、⚠ 球面の厳密解は要らない。
  function distanceM(aLon, aLat, bLon, bLat) {
    const R = 6378137, rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
    return Math.hypot(dLat, dLon) * R;
  }

  // 置き場が読めないことがある（⚠ プライベートモード・⚠ 容量切れ）。
  //   ⚠ **読めないときは空として扱い、⚠ 画面を止めない**（`javascript.md`）。
  //   ⚠ **「空」と「読めない」は返り値で分ける。**⚠ 画面側が言い分けられるように。
  function load(store) {
    try {
      const raw = store.getItem(KEY);
      if (raw === null) return { ok: true, list: [] };
      const v = JSON.parse(raw);
      if (!Array.isArray(v)) return { ok: false, list: [] };
      // ⚠ **座標が無いものは捨てる。**⚠ 戻れない記録を一覧に出さない。
      return { ok: true, list: v.filter((r) => r && isFinite(r.lon) && isFinite(r.lat)) };
    } catch {
      return { ok: false, list: [] };
    }
  }

  function save(store, list) {
    try { store.setItem(KEY, JSON.stringify(list)); return true; }
    catch { return false; }   // ⚠ 容量切れ。⚠ 握りつぶさず、⚠ 失敗を返す
  }

  // いまの地点に一致する記録。⚠ **無ければ null。**
  function findAt(list, lon, lat) {
    for (const r of list) if (distanceM(lon, lat, r.lon, r.lat) <= SAME_M) return r;
    return null;
  }

  // 足す。⚠ **同じ場所が既に在れば、⚠ 増やさずにそのまま返す。**
  //   ⚠ **新しいものが先頭。**⚠ 一覧は上から新しい順に読む。
  function add(list, rec) {
    if (findAt(list, rec.lon, rec.lat)) return list;
    return [rec, ...list];
  }

  // 外す。⚠ **一致するものだけ 1 件。**
  function remove(list, lon, lat) {
    const hit = findAt(list, lon, lat);
    return hit ? list.filter((r) => r !== hit) : list;
  }

  // ---- 別の端末へ手渡す ----
  //
  // ⚠ **サーバに置かない**（`docs/adr/0048`）。⚠ **URL に載せて渡す。**
  //   ⚠ **要るものが何も無く、⚠ 言えなくなることが 1 つも無い**（⚠ そこが 5 段目との違い）。
  //
  // ⚠ **控えの形をそのまま載せない。**⚠ **並びを決めて詰める**（⚠ 鍵の字が件数ぶん減る）。
  //   ⚠ **説明文（gloss）は載せない。**⚠ **区分名から作り直せる**（`words.js`）。
  //   ⚠ **同じ字を 2 か所に持たない**（`CLAUDE.md` §3）。
  //
  // ⚠ **実測（2026-08-29）**: ⚠ **圧縮なしで 17 件が 1900 文字。**
  //   ⚠ **圧縮すると 50 件で 1474 文字**（`scripts/handoff-size.mjs`）。
  //   ⚠ **圧縮そのものはここに持たない。**⚠ **渡してもらう**（⚠ ブラウザは CompressionStream、
  //     ⚠ Node は zlib。⚠ ここが両方を知ると、⚠ 検査がブラウザ抜きで回せなくなる）。
  const 版 = { 生: "1", 圧縮: "2" };

  // 並び: [lat, lon, name, value, at]
  //   ⚠ **lat が先**（⚠ URL の ?ll= と同じ順。⚠ 逆にすると別の場所になる）
  const 詰める = (list) => JSON.stringify(list.map((r) => [
    Number(Number(r.lat).toFixed(5)), Number(Number(r.lon).toFixed(5)),
    r.name ?? null, r.value ?? null, r.at ?? 0,
  ]));

  // ⚠ **戻すのは Domain の形。**⚠ **説明文は画面が作る**（`domain.md`）。
  function 開く(text) {
    let v;
    try { v = JSON.parse(text); } catch { return null; }
    if (!Array.isArray(v)) return null;
    const out = [];
    for (const r of v) {
      if (!Array.isArray(r) || r.length < 5) continue;
      const [lat, lon, name, value, at] = r;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;   // 座標が無いものは捨てる
      out.push({ lat, lon, name: name ?? null, value: value ?? null, at: Number(at) || 0 });
    }
    return out;
  }

  // 手渡しの字を作る。圧縮できるなら圧縮する。できなくても渡せる。
  //   ⚠ **圧縮できたかどうかを、⚠ 先頭 1 文字で名乗る。**⚠ **受け取る側が読み分ける。**
  async function toText(list, deflate) {
    const j = 詰める(list);
    if (deflate) {
      try { return 版.圧縮 + await deflate(j); } catch { /* 生で渡す */ }
    }
    return 版.生 + b64(j);
  }

  async function fromText(text, inflate) {
    if (typeof text !== "string" || !text) return null;
    const 印 = text[0], 中身 = text.slice(1);
    if (印 === 版.生) { const j = unb64(中身); return j === null ? null : 開く(j); }
    if (印 === 版.圧縮) {
      if (!inflate) return null;                 // 読めない。読めなかったと返す（空ではない）
      try { return 開く(await inflate(中身)); } catch { return null; }
    }
    return null;                                 // 知らない版。黙って空にしない
  }

  // base64url。⚠ **Node もブラウザも同じ答えになる形で書く。**
  //   ⚠ **`-` `_` と、⚠ 末尾の `=` を落とすことは、⚠ 渡す側と受け取る側で必ずそろえる。**
  //   ⚠ **食い違っても、⚠ どちらも例外を投げずに「読めない」で返ってくる**ので、
  //   ⚠ **黙って手渡しだけが通らなくなる。**⚠ **だから 1 か所に置く**（`CLAUDE.md` §3）。
  //   ⚠ **圧縮した中身（バイト列）を渡すのは呼ぶ側**なので、⚠ **バイト列の口も外へ出す。**
  const bytes2b64 = (bytes) => {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b642bytes = (s) => {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  };
  const b64 = (s) => bytes2b64(new TextEncoder().encode(s));
  const unb64 = (s) => {
    try { return new TextDecoder().decode(b642bytes(s)); } catch { return null; }
  };

  // 受け取ったものを、いまの控えへ混ぜる。
  //   ⚠ **足すだけ。**⚠ **消さない**（⚠ 片方で消したものが両方から消えるのを避ける）。
  //   ⚠ **同じ場所は 50m で判定**（⚠ 保存のときと同じ道具）。
  //   ⚠ **ぶつかったら、⚠ 先に見つけたほう（at が古いほう）を残す。**
  //   ⚠ **name は在るほうを採る**（⚠ 取れなかったを「無い」にしない）。
  function merge(いま, 来た) {
    const out = [...いま];
    let 足した = 0, 重なった = 0;
    for (const r of 来た) {
      const hit = findAt(out, r.lon, r.lat);
      if (!hit) { out.push({ ...r }); 足した++; continue; }
      重なった++;
      if (r.at && (!hit.at || r.at < hit.at)) hit.at = r.at;
      if (!hit.name && r.name) hit.name = r.name;
      if (!hit.value && r.value) hit.value = r.value;
    }
    out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));   // 新しいものが先頭
    return { list: out, 足した, 重なった };
  }

  g.KonjakuSaved = { KEY, SAME_M, distanceM, load, save, findAt, add, remove,
                     toText, fromText, merge, bytes2b64, b642bytes };
})(typeof globalThis !== "undefined" ? globalThis : this);
