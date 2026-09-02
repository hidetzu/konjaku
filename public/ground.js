// この一帯の地盤と、揺れの見込み。DOM も地図も持たない。Node から呼べる。
//
// 出どころは防災科学技術研究所 J-SHIS の Web API。
//   表層地盤     微地形区分（JNAME）／ 表層地盤増幅率（ARV）／ AVS30
//   揺れの見込み 今後 30 年の震度超過確率（4 段）
//
// 決めたこと（2026-09-02。Owner 判断。docs/adr/0088）:
//   生の応答をそのまま第三者へ配らない。必要な項目だけを使い、画面では今昔の文脈に直す。
//   だから、この口が返すのは下の 8 つだけ。応答を丸ごと通す道は作らない。
//
// 因果でつながない:
//   微地形と、揺れの見込みは、別々に並べる。
//   「埋立地だから揺れやすい」とは言わない。実測（2026-09-02）で、
//   同じ埋立地でも震度6弱以上が 12.9% / 20.3% / 35.6% と 3 倍近く違った。
//   揺れの見込みは、その土地の地盤だけで決まらない。
//
// 2 つのメッシュは別の格子:
//   実測（2026-09-02・20 地点）で、2 つの範囲の重なりは 10.1〜58.0%。
//   一定ではない。だから「同じ 250m 四方の値」とは言えない。
//   言えるのは「その点を含む、別々の約 250m 四方の値」まで。
//   指した点は 20/20 で両方に入っていた。
//
// 「無い」と「取れなかった」を分ける（docs/adr/0056）:
//   404          その範囲にデータが無い（海の上がこれ。陸のデータなので正しい）
//   それ以外の失敗 取れなかった
(function (g) {
  "use strict";

  const BASE = "https://www.j-shis.bosai.go.jp/map/api";
  const 表層 = `${BASE}/sstrct/V2/meshinfo.geojson`;
  const 揺れ = `${BASE}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson`;

  // 版。画面に出す（どの版を読んだかが分からないと、あとで突き合わせられない）。
  const 版 = { 表層: "表層地盤 V2", 揺れ: "確率論的地震動予測地図 2024 年版" };

  // 出す 4 段。1 つだけ出すと切り取りになる。
  //   キーは J-SHIS の項目名。字は今昔が決める（Display は words 側の仕事だが、
  //   ここは「どの段を出すか」の定義なので Domain に置く）。
  const 段 = [
    { key: "T30_I45_PS", 震度: "5弱" },
    { key: "T30_I50_PS", 震度: "5強" },
    { key: "T30_I55_PS", 震度: "6弱" },
    { key: "T30_I60_PS", 震度: "6強" },
  ];

  // 丸めると 0% になる値がある。
  //   実測（2026-09-02）: 軽井沢の震度6強以上は 0.000261。小数第 1 位で丸めると 0.0%。
  //   「0%」は「起きない」と読まれる。だから数にしない。
  //   同じ理由で、99.5% 以上も「100%」にしない。
  const ごくわずか = 0.005;
  const ほぼ確実 = 0.995;

  const 数 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // 1 つの口を叩く。404 は「無い」、それ以外の失敗は「取れなかった」。
  async function 引く(url, lon, lat, 取る) {
    let r;
    try {
      r = await 取る(`${url}?position=${lon},${lat}&epsg=4612`);
    } catch (e) {
      // 404 を投げ分けてもらう。呼ぶ側が status を載せる。
      return e && e.status === 404 ? { state: "absent" } : { state: "unreachable" };
    }
    const f = r && Array.isArray(r.features) ? r.features[0] : null;
    if (!f || !f.properties) return { state: "absent" };
    return { state: "ok", p: f.properties };
  }

  // この一帯の地盤と、揺れの見込みを引く。
  //   2 つは別の口。片方だけ取れることがある（実測 2026-09-02・20 地点では 0 件だったが、
  //   在りうる形なので、まとめて 1 つの状態に潰さない）。
  async function nearby(lon, lat, 取る) {
    const [s, p] = await Promise.all([引く(表層, lon, lat, 取る), 引く(揺れ, lon, lat, 取る)]);

    const 地盤 = s.state === "ok"
      ? { state: "ok", 微地形: s.p.JNAME ?? null, 増幅率: 数(s.p.ARV), AVS30: 数(s.p.AVS) }
      : { state: s.state };

    const 見込み = p.state === "ok"
      ? { state: "ok", 段: 段.map((x) => ({ 震度: x.震度, 確率: 数(p.p[x.key]) }))
            .filter((x) => x.確率 !== null) }
      : { state: p.state };

    // 4 段そろわないなら出さない。切り取りになる。
    if (見込み.state === "ok" && 見込み.段.length !== 段.length)
      見込み.state = "unreachable", 見込み.段 = [];

    return { 地盤, 見込み, 版 };
  }

  g.KonjakuGround = { 表層, 揺れ, 版, 段, ごくわずか, ほぼ確実, nearby };
})(typeof window === "undefined" ? globalThis : window);
