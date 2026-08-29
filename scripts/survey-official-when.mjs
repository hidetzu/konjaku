// 今昔 — 「いつ陸になったか」を公式資料から言えるかを測る（docs/adr/0062）。
//
// これは検査ではない。npm run check から呼ばない。
//   相手先（自治体・港湾局）の答えに寄りかかるものを、検査にしない。
//
// 回し方: node scripts/survey-official-when.mjs
//
// 測るのは 3 つ:
//   1 公式資料が在るか
//   2 その資料に、座標や丁目など「場所を特定できる情報」が入っているか
//   3 「資料上の記録が変わった時期」と「工事が完了した時期」を分けて書けるか
//
// 3 が肝。利用者役 C が独立に同じ線を引いた:
//   「記録が変わった」と「実際に陸になった」は別だ、と分かる書き方にしてください。
//   地図が作り直された年と工事の年は違うはず。混ぜられると、資料の年を工事の年だと思い込みます。

const 対象 = [
  { 地点: "豊洲", url: "https://www.kouwan.metro.tokyo.lg.jp/yakuwari/rekishi/",
    名: "東京都港湾局「東京港の歴史」" },
  { 地点: "浦安", url: "https://www.city.urayasu.lg.jp/", 名: "浦安市（入口から探索）" },
];

const 読む = async (u) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(30000), redirect: "follow" });
  if (!r.ok) return { status: r.status, txt: "" };
  const b = Buffer.from(await r.arrayBuffer());
  const m = b.toString("latin1").match(/charset=["']?([\w-]+)/i);
  const enc = (m ? m[1] : "utf-8").toLowerCase();
  const t = new TextDecoder(enc.includes("shift") ? "shift-jis" : "utf-8").decode(b);
  return { status: r.status,
    txt: t.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};

console.log("「いつ陸になったか」を公式資料から言えるか（実測 2026-08-29）\n");
for (const t of 対象) {
  const { status, txt } = await 読む(t.url).catch(() => ({ status: "聞けず", txt: "" }));
  const 年表 = (txt.match(/(昭和|平成|令和|大正)\s*\d+年/g) ?? []).length;
  const 地点名 = new RegExp(t.地点).test(txt);
  const 座標 = /\d{2}\.\d{4}/.test(txt);
  const 丁目 = /[一二三四五六七八九1-9]丁目/.test(txt);
  console.log(`■ ${t.地点} ── ${t.名}`);
  console.log(`   HTTP        ${status}`);
  console.log(`   年の記述     ${年表} 件`);
  console.log(`   地点名       ${地点名 ? "ある" : "無い"}`);
  console.log(`   座標         ${座標 ? "ある" : "⚠ 無い"}`);
  console.log(`   丁目         ${丁目 ? "ある" : "⚠ 無い"}`);
  console.log(`   → 場所の特定 ${座標 || 丁目 ? "できるかもしれない" : "⚠ **できない**"}\n`);
}
console.log("判定の目安:");
console.log("  座標も丁目も無ければ、地点と年を機械で結びつけられない。");
console.log("  そのとき言えるのは「この地域一帯の話」までで、「この場所」とは言えない。");
