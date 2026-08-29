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
  const nearSec = $("nearSec"), nearLead = $("nearLead"), yearsEl = $("years");
  const nearNote = $("nearNote"), nearFrom = $("nearFrom");
  const readSec = $("readSec"), readEl = $("read");
  const aroundEl = $("around"), aroundLead = $("aroundLead");
  const sharesEl = $("shares"), aroundNote = $("aroundNote");

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
    drawElev(lon, lat, t);
    drawAround(lon, lat);
    drawNear(lon, lat);
    drawRead(lon, lat, t);
  }

  // 標高。散歩中は出さないと決めてある（docs/adr/0059）。
  //   その 1 行に紙面を割く値打ちが、散歩中の判断には無かった。
  //   帰宅後は前提が違う。「なぜ液状化のリスクがあるのか」に直接効く（2026-08-29。Owner 判断）。
  //   3 状態を言い分ける。取れなかったことを「無い」と言わない。
  async function drawElev(lon, lat, t) {
    const e = await KonjakuLand.elevation(lon, lat).catch(() => null);
    const p = document.createElement("p");
    p.className = "elev";
    if (!e || e.state === Konjaku.STATE.UNREACHABLE) {
      p.innerHTML = `<span class="why__none">標高は、いま読み込めませんでした</span>`;
    } else if (!e.ok || !Number.isFinite(e.value)) {
      p.innerHTML = `<span class="why__none">この場所の標高は、記録されていません</span>`;
    } else {
      // 海面より低いかどうかは、そのまま言う。言い換えない
      const 低い = e.value < 0;
      p.innerHTML =
        `標高 <span class="v">${esc(e.value.toFixed(2))}m</span>`
        + (低い ? "（海面より低い）" : "")
        + `<span class="from">${esc(e.evidence?.source ?? "国土地理院")}から読んだ 1 点の値です。`
        + `まわりの高さではありません</span>`;
    }
    // 起こりうることの直後に置く。risk の文と噛み合う
    whyEl.appendChild(p);
  }

  // 読んだもの。本当に読んだのかを、読んだ人が確かめられるようにする。
  //   β 版は出していた。読み物としては重いので、いちばん下に置く。
  //   ⚠ 取れなかったものは、取れなかったと書く。空欄にしない（掟 §1）。
  async function drawRead(lon, lat, t) {
    const 行 = [];
    const 足す = (名, 中身) => 行.push(
      `<div><dt>${esc(名)}</dt><dd>${中身}</dd></div>`);
    const リンク = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`;

    const ev = t.evidence ?? {};
    if (ev.tile) 足す("地形分類", `${リンク(ev.tile)}<br>区分コード ${esc(String(ev.code ?? "—"))}`
      + (ev.detail ? `・${esc(ev.detail)}` : ""));
    if (ev.artificialTile) 足す("人工地形",
      `${リンク(ev.artificialTile)}<br>区分コード ${esc(String(ev.artificialCode ?? "—"))}`);

    const m = await KonjakuLand.meijiPoint(lon, lat).catch(() => null);
    if (m?.evidence?.tile) {
      const px = m.evidence.pixel;
      足す("明治期の地形", `${リンク(m.evidence.tile)}`
        + (px ? `<br>タイル ${esc(String(px[0]))}/${esc(String(px[1]))} の画素 (${esc(String(px[2]))}, ${esc(String(px[3]))})` : ""));
    }
    const e = await KonjakuLand.elevation(lon, lat).catch(() => null);
    if (e?.evidence?.tile) 足す("標高", `${リンク(e.evidence.tile)}`
      + (e.evidence.source ? `<br>${esc(e.evidence.source)}` : ""));

    const f = await KonjakuLand.photos(lon, lat).catch(() => null);
    if (f?.eras?.length) {
      const 残る = f.eras.filter((x) => x.state === Konjaku.STATE.OK && !x.blank);
      const 読めず = f.eras.filter((x) => x.state === Konjaku.STATE.UNREACHABLE);
      足す("空中写真",
        `${残る.length} 年代が残っていました（${esc(f.eras.length + "")} 年代を確かめた）`
        + (読めず.length ? `<br>うち ${esc(読めず.length + "")} 年代は読み込めませんでした` : ""));
    }
    if (!行.length) return;
    readSec.hidden = false;
    readEl.innerHTML = 行.join("");
  }

  // この一帯の明治期。点ではなく面で数える。
  //   点は「ここは何だったか」、面は「まわりはどうだったか」。混ぜない（ADR 0030）。
  //   散歩中の画面は点しか出していない。帰宅後は「一帯」まで広げる。
  //
  //   ⚠ 割合には、必ず分母を添える（CLAUDE.md §6）。
  //     数えられなかった画素（透明）がある。実測（2026-08-29）: 春日部で 313,326 数えて
  //     276,498 が透明だった。分母を書かないと、透明を「無い」と読ませてしまう。
  const AROUND = { dLon: 0.006, dLat: 0.004 };   // 約 1.2km × 0.8km

  async function drawAround(lon, lat) {
    aroundEl.hidden = true;
    const a = await KonjakuLand.meijiArea({
      w: lon - AROUND.dLon, s: lat - AROUND.dLat,
      e: lon + AROUND.dLon, n: lat + AROUND.dLat,
    }).catch(() => null);
    if (!a) return;                                  // 取れなかった。黙る（年表のほうは出る）
    // 1 枚も読めていない／この地域では作られていない
    if (!a.classifiedPixels) {
      aroundEl.hidden = false;
      nearSec.hidden = false;
      aroundLead.innerHTML = `<span class="why__none">この地域では、この資料が作られていません</span>`;
      sharesEl.innerHTML = ""; aroundNote.textContent = "";
      return;
    }
    const 並び = Object.entries(a.classCounts)
      .filter(([, n]) => n > 0)
      .sort((x, y) => y[1] - x[1]);
    // 0% に丸まるものは出さない。出すと「在るのに 0」に見える
    const 出す = 並び.filter(([, n]) => n / a.classifiedPixels >= 0.005);
    aroundEl.hidden = false;
    nearSec.hidden = false;
    aroundLead.textContent = "この一帯は、明治期にこうでした";
    sharesEl.innerHTML = 出す.map(([名, n]) => {
      const pc = Math.round(n / a.classifiedPixels * 100);
      return `<li><span class="bar"><i style="width:${pc}%"></i></span>`
        + `<span class="pc">${pc}%</span><span class="nm">${esc(名)}</span></li>`;
    }).join("");
    // 分母を必ず書く。数えられなかったぶんも隠さない
    const 残り = 並び.length - 出す.length;
    aroundNote.textContent =
      `約 1.2km × 0.8km の範囲で、${a.classifiedPixels.toLocaleString()} 画素を数えたうちの割合です。`
      + (a.transparentPixels
        ? `この範囲には、資料に色が付いていない画素が ${a.transparentPixels.toLocaleString()} ありました。`
          + `それは「何も無かった」という意味ではありません。`
        : "")
      + (残り ? `1% に満たない区分が ${残り} つあり、ここには出していません。` : "");
  }

  // まわり ── この一帯について、公式資料から言えること。
  //   散歩中は 1 件だけ出している（3 件並べると、どれもこの場所の話ではないので
  //   なぜその 3 件なのかを説明できなかった。docs/adr/0062）。
  //   帰宅後は全部出す。読み物として、年表で読める。
  //   ⚠ この地点の記録ではないことは、散歩中と同じくいちばん先に言う。
  //     利用者役 3 名中 1 名が、1 件でも年をこの地点のものとして読んだ。
  async function drawNear(lon, lat) {
    nearSec.hidden = true;
    let j = null;
    try {
      const r = await fetch("./data/area-record.json");
      j = r.ok ? await r.json() : null;
    } catch { j = null; }
    if (!j) {
      // 読めなかった。黙ると、その地域の資料が無い場所と見分けられない（掟 §1）
      nearSec.hidden = false;
      nearLead.textContent =
        "いま読み込めませんでした。この周辺の記録が在るかどうかは分かっていません";
      yearsEl.innerHTML = ""; nearNote.textContent = ""; nearFrom.textContent = "";
      return;
    }
    const a = (j.areas ?? []).find((x) => {
      const b = x.bbox;
      return b && lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n;
    });
    if (!a) return;   // その地域の資料が無い。黙る（空の節を出すと「無い」の主張に読まれる）

    nearSec.hidden = false;
    yearsEl.hidden = false;
    nearLead.textContent = `${a.label}には、こういう記録があります`;
    // 古い順。年表として読むので、時の流れの向きに並べる。
    //   散歩中は新しい順に 1 件だけ出しているが、あちらは「1 件を選ぶ」話で、
    //   ここは「並べて読む」話。目的が違うので並びも違ってよい。
    const 並び = [...(a.records ?? [])].sort((x, y) => x.year - y.year);
    yearsEl.innerHTML = 並び.map((r) =>
      `<li class="${r.year === a.shown ? "shown" : ""}">`
      + `<span class="y">${esc(String(r.year))}年</span>`
      + `<span class="t">${esc(r.text)}</span></li>`).join("");
    nearNote.textContent =
      "※この地点に関する記録ではありません。"
      + "この場所がいつ陸になったかは、この資料からは分かりません。"
      + (a.place_note ? a.place_note : "");
    nearFrom.innerHTML =
      `出典：<a href="${esc(a.source.url)}" target="_blank" rel="noopener">`
      + `${esc(a.source.name)}</a>（${esc(a.source.retrieved_at)} に読んだもの）`;
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
