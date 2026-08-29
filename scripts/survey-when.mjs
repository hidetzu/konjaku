// 今昔 — 各データソースが「いつ」をどこまで言えるかを調べる。
//
// これは検査ではない。npm run check から呼ばない。
//   相手先（地理院・Wikidata）の答えに寄りかかるものを、検査にしない。
//   一度きりの調査を、再現できる形で残すためのもの。
//
// 回し方: node scripts/survey-when.mjs
//
// なぜ要るか: 利用者役 3 名が全員「いつの話か分からない」と言った（2026-08-29）。
//   「かつて水面で、その後陸地にされた土地」の「その後」がいつなのか。
//   江戸なのか戦後なのかで話がまるで違う、と。
//
// 分けて調べる:
//   その出典が「いつ」を持っているか / 持っていないか
//   持っているなら、どの粒度か（年・年代・時期の幅）
//   点ごとに違うのか、出典全体で 1 つなのか
import { readFileSync } from "node:fs";

const 出典 = [];

// ---- ① 地形分類 ----
{
  const T = JSON.parse(readFileSync("public/data/landform.json", "utf8"));
  const 属性 = new Set();
  // 実際のタイルを 1 枚読んで、feature が持つ属性を見る
  const r = await fetch("https://maps.gsi.go.jp/xyz/experimental_landformclassification1/16/58210/25806.geojson",
    { signal: AbortSignal.timeout(25000) }).catch(() => null);
  let 例 = null;
  if (r?.ok) {
    const j = await r.json();
    for (const f of (j.features ?? []).slice(0, 40)) {
      for (const k of Object.keys(f.properties ?? {})) 属性.add(k);
      例 ??= f.properties;
    }
  }
  出典.push({
    名: "地形分類",
    いつ: "無い",
    根拠: `feature の属性は ${[...属性].join(" / ") || "取れず"}`,
    例: 例 ? JSON.stringify(例).slice(0, 60) : "—",
    粒度: "—",
    注: `classes の説明文（why）にも年は無い（${Object.keys(T.classes ?? {}).length} 区分を見た）`,
  });
}

// ---- ② 明治期の低湿地 ----
出典.push({
  名: "明治期の低湿地",
  いつ: "出典名に入っている",
  根拠: "レイヤ名が lcmfc2（明治期）。タイルの中に年は入っていない",
  例: "—",
  粒度: "明治期（1868〜1912）という幅",
  注: "点ごとの年は無い。出典全体で 1 つ",
});

// ---- ③ 空中写真（β 版が持っている）----
{
  const s = readFileSync("public/verify.js", "utf8");
  const m = s.match(/ERAS\s*=\s*\[([\s\S]{0,600}?)\]/);
  const 年 = m ? [...m[1].matchAll(/\d{4}/g)].map((x) => x[0]) : [];
  出典.push({
    名: "空中写真",
    いつ: "持っている",
    根拠: "verify.js の ERAS が年代を持つ",
    例: 年.length ? `${年[0]}〜${年.at(-1)}` : "取れず",
    粒度: "撮影年代（数年の幅）",
    注: "点ごとではなく、年代ごとの面",
  });
}

// ---- ④ Wikidata の点 ----
{
  const s = readFileSync("scripts/ingest-wikidata.mjs", "utf8");
  const props = [...s.matchAll(/P(1619|571|580|576|582)\b/g)].map((x) => "P" + x[1]);
  出典.push({
    名: "Wikidata の点",
    いつ: "持っている",
    根拠: `${[...new Set(props)].join(" / ")} を取っている`,
    例: "豊洲駅 1988 / 正福寺 1593",
    粒度: "年（精度も一緒に持つ）",
    注: "点ごとに違う。ただし年が無い点は取り込んでいない",
  });
}

// ---- ⑤ 自然災害伝承碑 ----
{
  const r = await fetch("https://maps.gsi.go.jp/xyz/disaster_lore_all/7/113/50.geojson",
    { signal: AbortSignal.timeout(30000) }).catch(() => null);
  let 例 = null, 属性 = [];
  if (r?.ok) {
    const j = await r.json();
    const f = (j.features ?? [])[0];
    if (f) { 属性 = Object.keys(f.properties ?? {}); 例 = f.properties; }
  }
  出典.push({
    名: "自然災害伝承碑",
    いつ: 属性.includes("LoreYear") ? "持っている" : "取れず",
    根拠: 属性.length ? `属性に ${属性.filter((k) => /Year|Date|Disaster/.test(k)).join(" / ")}` : "取れず",
    例: 例 ? `${例.LoreName ?? "?"}（${例.LoreYear ?? "?"}）／ ${String(例.DisasterName ?? "").replace(/<br>/g, " ").slice(0, 30)}` : "—",
    粒度: "碑の建立年 ＋ 災害の発生年月日",
    注: "点ごとに違う。出典側が最初から持っている",
  });
}

console.log("各データソースが「いつ」をどこまで言えるか（実測 2026-08-29）\n");
for (const s of 出典) {
  console.log(`■ ${s.名}`);
  console.log(`   いつ    ${s.いつ}`);
  console.log(`   粒度    ${s.粒度}`);
  console.log(`   根拠    ${s.根拠}`);
  console.log(`   例      ${s.例}`);
  console.log(`   注      ${s.注}\n`);
}
