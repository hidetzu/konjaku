// 同じ土地について「もう取ってあるもの」を管理する、ただ1か所。
//
// ⚠ **ここに DOM も地図も無い。** 場所を渡すと、取得済みなら即返し、
//   無ければ verify.js（取得の層）へ頼んで、取れたものを控えるだけ。
//   だから Node からそのまま呼べて、検査がブラウザを立てずに回せる
//   （words.js / photos.js / prov.js / swale.js と同じ作り）。
//
// なぜ切り出したか（実測 2026-08-20・main = d410455・豊洲・375x667・Service Worker 無効）:
//   トップ              地形分類 2本 ／ 明治期ラスタ  5本 ／ 標高 1本 ／ 建物 1本
//   /peel（トップ経由）  地形分類 2本 ／ 明治期ラスタ 43本 ／ 標高 0本 ／ 建物 5本
//   ⚠ **地形分類を、遷移したあとにもう一度取っていた。**
//     トップで同じ座標の同じ答えを取り終えているのに、/peel が知らないだけだった。
//
// ⚠ **持ち主の分担**（docs/DOMAIN.md §5）
//     verify.js   外から取ってくる層。⚠ **ここは取り方を知らない**
//     ここ        取得済みを控える層。⚠ **画面はここだけを見る**
//     index.html / peel3d.js   置き方だけ。⚠ **取得の層を直接呼ばない**
(function (g) {
  "use strict";

  // 版。控えた形が変わったら上げる。⚠ **上げると前の版は読まれない**（混ざらない）
  const V = "v1";
  const PREFIX = "konjaku:land:" + V + ":";

  // ⚠ **小数5桁。URL の ll と同じ粒度**（index.html の共有リンク・peel3d.js の遷移が
  //   どちらも toFixed(5)）。★ の keyOf は4桁だが、⚠ **あちらは「同じ場所とみなす」ための
  //   丸めで、こちらは「同じ座標か」の照合**。⚠ 別の問いなので合わせない。
  //   並びも URL と同じ lat,lon にする（読んだときに突き合わせられる）。
  const key = (lon, lat) => Number(lat).toFixed(5) + "," + Number(lon).toFixed(5);

  // sessionStorage は、使えないことがある（Safari のプライベート・容量超過・
  // 埋め込み枠での遮断）。⚠ **使えないだけで画面が壊れてはいけない**ので、
  // 読み書きは必ずここを通す。落ちたら「控えが無い」として扱う。
  const store = () => {
    try { return g.sessionStorage ?? null; } catch { return null; }
  };

  // ⚠ **壊れた控えは、無かったことにする。**例外を投げない。
  //   （古い版の残り・別のタブが書いた途中・手で書き換えられた、のどれでも同じ扱い）
  const read = (k) => {
    const s = store();
    if (!s) return null;
    let raw = null;
    try { raw = s.getItem(PREFIX + k); } catch { return null; }
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      // 形が違うものを信じない。オブジェクトでなければ控えとして扱わない
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch { return null; }
  };

  const write = (k, field, value) => {
    const s = store();
    if (!s) return;
    const now = read(k) ?? {};
    now[field] = value;
    // 容量が尽きたら、控えないだけ。⚠ **画面は止めない**
    try { s.setItem(PREFIX + k, JSON.stringify(now)); } catch { /* 控えないだけ */ }
  };

  // ⚠ **取れなかったものを控えない。**
  //   控えると、一度つながらなかった土地が、その先ずっと「取れない土地」になる。
  //   掟: 取得できなかった ≠ 存在しなかった。
  // ⚠ 「資料の範囲外」は控える。⚠ **それは答えであって、失敗ではない。**
  const keepable = (v) => {
    if (!v || typeof v !== "object") return false;
    const UNREACHABLE = g.Konjaku?.STATE?.UNREACHABLE ?? "unreachable";
    if (v.state === UNREACHABLE) return false;
    // 一部だけ読めた回も控えない。⚠ **次に開いたとき、欠けたまま固まる**
    if (v.state === "partial") return false;
    if (v.artificialUnread) return false;
    return true;
  };

  // 取得の層のどれを呼ぶか。⚠ **ここに取り方を書かない**（verify.js が持つ）
  const SOURCE = {
    terrain:    (lon, lat) => g.Konjaku.landform(lon, lat),
    meijiPoint: (lon, lat) => g.Konjaku.meiji(lon, lat),
    elevation:  (lon, lat) => g.Konjaku.elevation(lon, lat),
    photos:     (lon, lat) => g.Konjaku.photos(lon, lat),
  };

  // 同じ画面のうちに同じものを2回頼まれたら、1回にまとめる。
  // ⚠ **控えに入る前（取得中）にもう一度呼ばれる**ことがある（/peel は地形分類と
  //   写真をほぼ同時に頼む）。ここが無いと、控えがあっても本数が減らない。
  const inflight = new Map();

  async function get(field, lon, lat) {
    if (!SOURCE[field]) throw new Error("知らない項目: " + field);
    const k = key(lon, lat);
    const cached = read(k);
    if (cached && cached[field] !== undefined) return cached[field];

    const id = field + "@" + k;
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      const v = await SOURCE[field](lon, lat);
      if (keepable(v)) write(k, field, v);
      return v;
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }

  const terrain    = (lon, lat) => get("terrain", lon, lat);
  const meijiPoint = (lon, lat) => get("meijiPoint", lon, lat);
  const elevation  = (lon, lat) => get("elevation", lon, lat);
  const photos     = (lon, lat) => get("photos", lon, lat);

  // トップ用。4つまとめて取り、⚠ **取れたものを控える**。
  //
  // ⚠ **組み立て（unread の判定）は verify.js が持つ。**ここで数え直さない
  //   （掟: 同じ問いに答える実装を2つ持たない）。だから控えから組み直すことはせず、
  //   ⚠ **使い回すのは トップ → /peel の向きだけ**にしてある。
  //   逆向き（/peel を先に見てからトップへ戻る）は、いままでどおり取り直す。
  async function facts(lon, lat) {
    const f = await g.Konjaku.facts(lon, lat);
    const k = key(lon, lat);
    const byKey = f?.byKey ?? {};
    const PAIR = { terrain: byKey.landform, meijiPoint: byKey.meiji,
                   elevation: byKey.elevation, photos: byKey.photos };
    for (const field of Object.keys(PAIR)) {
      if (keepable(PAIR[field])) write(k, field, PAIR[field]);
    }
    return f;
  }

  // 検査用。⚠ **画面からは呼ばない**
  const forget = (lon, lat) => {
    const s = store();
    if (!s) return;
    try {
      if (lon === undefined) {
        for (const kk of Object.keys(s).filter((n) => n.startsWith(PREFIX))) s.removeItem(kk);
      } else {
        s.removeItem(PREFIX + key(lon, lat));
      }
    } catch { /* 消せないだけ */ }
  };

  g.KonjakuLand = { V, PREFIX, key, keepable, terrain, meijiPoint, elevation, photos,
                    facts, forget };
})(typeof window === "undefined" ? globalThis : window);
