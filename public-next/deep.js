// 帰宅後の深掘り画面（/deep）。
//
// 散歩中の画面（top.js）とは、問いも時間も違う（docs/adr/0048）。
//   散歩中  ここは昔なんだった？  5 秒   地図が主役
//   帰宅後  なぜこうなった？      10 分  読み物
//
// ⚠ 地図を持たない。ここは読む画面。場所は URL から受け取る。
// ⚠ 取得は land.js / verify.js の 1 か所から。作り直さない（CLAUDE.md §3）。
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const { esc } = window.KonjakuEsc ?? { esc: (s) => s };
  const backEl = $("back"), placeEl = $("place"), glossEl = $("gloss"), termEl = $("term");
  const whySec = $("whySec"), whyEl = $("why"), citeEl = $("cite");

  // 場所は URL から。読む口は place-arg.js の 1 か所（同じ問いに答える実装を 2 つ持たない）。
  const arg = KonjakuPlaceArg.readPlace(new URLSearchParams(location.search));

  // 地図へ戻る先も、同じ口で組み立てる。手で書かない
  if (arg.state === "ok") {
    const q = KonjakuPlaceArg.placeQuery({ lat: arg.lat, lon: arg.lon });
    if (q) backEl.href = "./" + q.replace(/^\?q=&/, "?");
  }

  // 保存した控えから、この地点の名前を引く。控えの形は saved.js が持つ。
  //   名前が無いこともある（地理院に聞けなかった保存）。そのときは黙る。
  function nameOf(lon, lat) {
    try {
      const r = KonjakuSaved.load(localStorage);
      const hit = r.ok ? KonjakuSaved.findAt(r.list, lon, lat) : null;
      return hit?.name ?? null;
    } catch { return null; }
  }

  async function draw() {
    if (arg.state !== "ok") {
      // 場所が無い／読めない。どちらも「その場所が存在しない」ではない（place-arg.js）
      glossEl.textContent = arg.state === "bad"
        ? "この住所は読み取れませんでした"
        : "深掘りする場所が選ばれていません";
      placeEl.textContent = "";
      whySec.hidden = true;
      return;
    }
    const { lon, lat } = arg;
    const 名 = nameOf(lon, lat);
    placeEl.textContent = 名 ?? "地図から選んだ場所";

    const t = await KonjakuLand.terrain(lon, lat).catch(() => null);
    if (!t || t.state === Konjaku.STATE.UNREACHABLE) {
      glossEl.textContent = "いま、この場所を調べられません";
      whySec.hidden = true;
      return;
    }
    if (!t.ok || !t.value) {
      glossEl.textContent = "この場所の地形は、まだ分類できていません";
      whySec.hidden = true;
      return;
    }
    // 言葉は words.js から借りる。ここで書かない（domain.md）
    glossEl.textContent = `ここは、${KonjakuWords.groundGloss(t.value)}`;
    termEl.textContent = `国土地理院の区分：${t.value}`;
    drawWhy(t);
  }

  // 成因と、起こりうること。
  //   どちらも国土地理院の記述そのもの。要約しない・言い換えない（CLAUDE.md §5）。
  //   36 区分すべてに why があるが、risk は 0 字の区分がある。
  //   そのとき「無い」と言わない。「この区分には書かれていない」と言う（掟 §1）。
  //
  //   人工地形（盛土地･埋立地など）は、自然の区分とは別の資料。
  //   在るときだけ足す。混ぜない。
  function drawWhy(t) {
    const 段 = [];
    const 出す = (見出し, 文, 相手, cls) => {
      if (!文) return;
      段.push(
        `<div class="why__item ${cls ?? ""}">`
        + `<p class="why__k">${esc(見出し)}</p>`
        + `<p class="why__v">${esc(文)}</p>`
        + `<p class="why__from">— ${esc(相手)}</p></div>`);
    };
    出す("この土地の成り立ち", t.why, "国土地理院", "");
    出す("起こりうること", t.risk, "国土地理院", "why--risk");
    if (t.artificial) {
      出す(`人の手が入っている（${t.artificial}）`, t.artificialWhy, "国土地理院", "");
      出す(`そこで起こりうること`, t.artificialRisk, "国土地理院", "why--risk");
    }
    // 書かれていない区分がある。黙って空にしない
    if (!t.why && !t.risk)
      段.push(`<p class="why__v why__none">この区分には、成り立ちの説明が書かれていません</p>`);
    else if (!t.risk)
      段.push(`<p class="why__v why__none">この区分には、起こりうることが書かれていません</p>`);
    whySec.hidden = false;
    whyEl.innerHTML = 段.join("");
    citeEl.innerHTML =
      `成り立ちと、起こりうることは、`
      + `<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">`
      + `国土地理院</a>の記述をそのまま出しています。`;
  }

  draw();
})();
