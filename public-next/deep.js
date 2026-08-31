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
  const glossSrcEl = $("glossSrc"), glossSubEl = $("glossSub");
  const monSec = $("monSec"), monLead = $("monLead"), monEl = $("mon"), monCite = $("monCite");
  const whySec = $("whySec"), whyEl = $("why"), citeEl = $("cite");
  const nearSec = $("nearSec"), nearLead = $("nearLead"), yearsEl = $("years");
  const nearNote = $("nearNote"), nearFrom = $("nearFrom");
  const readSec = $("readSec"), readEl = $("read");
  const timeSec = $("timeSec"), timeLead = $("timeLead");
  const framesEl = $("frames"), timeNote = $("timeNote");
  const aroundEl = $("around"), aroundLead = $("aroundLead");
  const sharesEl = $("shares"), aroundNote = $("aroundNote");

  // 場所は URL から。読む口は place-arg.js の 1 か所（同じ問いに答える実装を 2 つ持たない）。
  const arg = KonjakuPlaceArg.readPlace(new URLSearchParams(location.search));

  // 戻る道。入口が 3 つあるので、行き先を名指しできない。
  //   地図 → ここ         地図へ戻るのが自然
  //   保存の一覧 → ここ   一覧へ戻るのが自然
  //   共有リンクで直接    どちらでもない。「もどる」は嘘になる
  //
  // 同じサイトから来たかは document.referrer で分かる。history.length では分からない
  //   （実測 2026-08-30: 直接ひらいても 2 になる）。
  // referrer は環境で消える（プライバシー設定・拡張・アプリ内ブラウザ）。
  //   空は「直前が無い」として扱う。安全側に倒れる（誤って外へ出さない）。
  const 地図へ = (() => {
    if (arg.state !== "ok") return "./";
    const q = KonjakuPlaceArg.placeQuery({ lat: arg.lat, lon: arg.lon });
    return "./" + (q ? q.replace(/^\?q=&/, "?") : "");
  })();
  backEl.href = 地図へ;

  const 同じサイトから = (() => {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
    catch { return false; }
  })();

  if (同じサイトから) {
    backEl.textContent = "← ひとつ前へ";
    backEl.addEventListener("click", (e) => {
      // 新しいタブで開かれていると、referrer は同じでも戻る先が無い
      //   （ctrl＋クリック・中クリック）。history.length では見分けられない。
      //   戻れたかどうかは、戻ってみないと分からない。戻らなければ地図へ送る。
      e.preventDefault();
      let 戻れた = false;
      const 見張り = () => { 戻れた = true; };
      addEventListener("pagehide", 見張り, { once: true });
      history.back();
      setTimeout(() => {
        removeEventListener("pagehide", 見張り);
        if (!戻れた) location.href = 地図へ;
      }, 400);
    });
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

    // 見出しは「問いへの近さ」順（docs/adr/0075）。散歩中の画面と同じ規則を使う。
    //   同じ場所で、トップは「ここは 田 でした」、ここは「ここは、川や海が…」だった。
    //   land.js が覚えているので、取りに行く回数は増えない。
    const 明治期の約束 = KonjakuLand.meijiPoint(lon, lat).catch(() => null);
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
    // 言葉は answer.js / words.js から借りる。ここで書かない（domain.md）
    const m = await 明治期の約束;
    const meiji = (!m || m.state === Konjaku.STATE.UNREACHABLE) ? { none: "unreachable" }
                : m.state === Konjaku.STATE.ABSENT ? { none: "absent" }
                : !m.value ? { none: "noClass" } : { value: m.value };
    const { label, head, sub } = KonjakuAnswer.lines({ terrain: t.value, meiji });
    glossSrcEl.textContent = label; glossSrcEl.hidden = !label;
    glossEl.textContent = head;
    glossSubEl.textContent = sub; glossSubEl.hidden = !sub;
    termEl.textContent = `国土地理院の区分：${t.value}`;
    drawTime(lon, lat);
    drawWhy(t);
    drawElev(lon, lat, t);
    drawAround(lon, lat);
    drawNear(lon, lat);
    drawRead(lon, lat, t);
    drawMonuments(lon, lat);
  }

  // 近くに残る災害の記録（自然災害伝承碑）。
  //   散歩中の画面には出さない（2026-08-31。Owner 判断）。
  //   全国に存在するが、現在地に対して提示できるほど高密度ではなかった。
  //   実測（分母 15 地点）: 半径 1000m で 0 件、2000m で 3 件、5000m で 8 件。
  //   だから PC / Deep の「周辺に残る歴史資料」として扱う。
  //
  //   碑があることと、この場所が被災したことは別。
  //   言えるのは「この近くに、その災害を伝える碑が残っている」まで。
  //   だから断りを必ず添える。碑が 1 つも無いときも黙らない（掟 §1）。
  //
  //   災害の名と種別は、出典の字をそのまま出す。要約も言い換えもしない。
  //   年を 1 つに丸めない（「(1884、他)」「(不明)」もある）。
  //   取り出した年（derived）は検索・並び替え用で、ここには出さない。
  async function drawMonuments(lon, lat) {
    monSec.hidden = true;
    monEl.innerHTML = ""; monCite.hidden = true;
    const 取る = (p) => fetch(p).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    const r = await KonjakuMonument.nearby(lon, lat, 取る).catch(() => ({ state: "unreachable", items: [] }));
    monSec.hidden = false;
    const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
    if (r.state === "unreachable") {
      // 取れなかった。黙ると、碑が無い場所と見分けられない
      monLead.textContent = "いま読み込めませんでした。この近くに碑が在るかどうかは分かっていません";
      return;
    }
    if (!r.items.length) {
      monLead.textContent =
        `${km(KonjakuMonument.半径M)}以内に、この資料の碑はありません`;
      monCite.hidden = false;
      monCite.textContent = "出典 国土地理院「自然災害伝承碑」";
      return;
    }
    monLead.textContent =
      `${km(KonjakuMonument.半径M)}以内に残っている碑です。`
      + "碑があることと、この場所が被災したことは別です。";
    for (const it of r.items) {
      const li = document.createElement("li");
      li.className = "mon__item";
      const 行 = (cls, t) => { const e = document.createElement("p"); e.className = cls; e.textContent = t; li.append(e); };
      行("mon__where", `現在地から ${km(it.distM)}`);
      行("mon__name", it.name);
      // 出典の字。<br> は改行として出す（消すと 2 つの文がつながる）
      行("mon__what", `${it.disasterName.replace(/<br>/g, " ")}　［${it.disasterKind}］`);
      // 碑の建立年。災害の年ではない（混同させない）
      if (it.builtYear) 行("mon__built", `碑が建てられたのは ${it.builtYear} 年`);
      monEl.append(li);
    }
    monCite.hidden = false;
    monCite.textContent = "出典 国土地理院「自然災害伝承碑」";
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

  // この画面が読んだ資料。どこから引いたのかを、読んだ人がたどれるようにする。
  //   「読んだもの」だと、何を読んだ話なのかが伝わらなかった（2026-08-29。Owner 指摘）。
  //   β 版も同じものを出していた。読み物としては重いので、いちばん下に置く。
  //   ⚠ 取れなかったものは、取れなかったと書く。空欄にしない（掟 §1）。
  async function drawRead(lon, lat, t) {
    const 行 = [];
    const 足す = (名, 中身) => 行.push(
      `<div><dt>${esc(名)}</dt><dd>${中身}</dd></div>`);
    const リンク = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`;

    const ev = t.evidence ?? {};
    if (ev.tile) 足す("いまの地形分類", `${リンク(ev.tile)}<br>区分コード ${esc(String(ev.code ?? "—"))}`
      + (ev.detail ? `・${esc(ev.detail)}` : ""));
    if (ev.artificialTile) 足す("人の手が入った地形",
      `${リンク(ev.artificialTile)}<br>区分コード ${esc(String(ev.artificialCode ?? "—"))}`);

    const m = await KonjakuLand.meijiPoint(lon, lat).catch(() => null);
    if (m?.evidence?.tile) {
      const px = m.evidence.pixel;
      足す("明治期の低湿地", `${リンク(m.evidence.tile)}`
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
        `${残る.length} 年代が残っていました（${esc(f.eras.length + "")} 年代を確かめました）`
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
      // 字は answer.js の 1 か所から借りる。ここで書かない。
      //   2026-08-31 に踏んだ: トップだけ言い直したら、ここが古い字のまま残った。
      aroundLead.innerHTML = `<span class="why__none">${esc(KonjakuAnswer.MEIJI_NONE.absent)}</span>`;
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
    aroundLead.textContent = "明治期、この一帯はこうでした";
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
    nearLead.textContent = `${a.label}に残っている、公式の記録`;
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

  // どう変わったか。この画面の主役。
  //   明治期の地図 → 空中写真の年代 → いま を、時の流れの向きに並べる。
  //   1 枚ずつ切り替えるのではなく、並べる。切り替えると、前の絵を覚えていないと比べられない。
  //
  //   ⚠ 絵の中身は読まない。「この年代に何が写っているか」はこちらでは言わない。
  //     判定にすると、推定を実測のように見せることになる（掟 §1）。
  //     言うのは「いつの絵か」までで、読むのは利用者。
  const WIN = 160;   // 絵の窓（px）。この地点を真ん中に置いて切り取る

  // タイルを 2×2 並べて、その地点が真ん中に来るように寄せる。
  //   1 枚だと、地点がタイルの端にあるとき窓が欠ける。
  //   窓は 160px なので、どこに落ちても 2×2 で足りる。
  function 窓(base, z, x, y, px, py, ext) {
    const 左 = px - WIN / 2, 上 = py - WIN / 2;
    const dx = 左 < 0 ? -1 : 0, dy = 上 < 0 ? -1 : 0;
    const out = [];
    for (let i = 0; i <= 1; i++) for (let j = 0; j <= 1; j++) {
      const tx = x + dx + i, ty = y + dy + j;
      const ox = (dx + i) * 256 - 左, oy = (dy + j) * 256 - 上;
      out.push(`<img src="${esc(`${base}/${z}/${tx}/${ty}.${ext}`)}" alt="" loading="lazy"`
        + ` style="left:${ox}px;top:${oy}px">`);
    }
    return out.join("");
  }

  async function drawTime(lon, lat) {
    timeSec.hidden = true;
    const 枠 = [];

    // ① 明治期の地図。タイルの URL は verify.js が控えている
    const m = await KonjakuLand.meijiPoint(lon, lat).catch(() => null);
    // 画素の位置まで控えているときだけ絵を出す。
    //   資料が作られていない地域では、タイルは控えていても画素が無い（実際に踏んだ）。
    if (m?.evidence?.tile && Array.isArray(m.evidence.pixel) && m.evidence.pixel.length === 4) {
      const px = m.evidence.pixel;   // [x, y, px, py]
      const base = m.evidence.tile.replace(/\/\d+\/\d+\/\d+\.\w+$/, "");
      const z = Number(m.evidence.tile.match(/\/(\d+)\/\d+\/\d+\.\w+$/)?.[1] ?? 16);
      枠.push({ 絵: 窓(base, z, px[0], px[1], px[2], px[3], "png"),
                年: "明治期",
                説: m.value ? `${m.value} でした` : KonjakuAnswer.MEIJI_NONE.noClass });
    } else if (m?.state === Konjaku.STATE.ABSENT) {
      枠.push({ 絵: null, 年: "明治期", 説: KonjakuAnswer.MEIJI_NONE.absent });
    }

    // ② 空中写真。残っている年代だけ。古い順は verify.js が並べ替えている
    const f = await KonjakuLand.photos(lon, lat).catch(() => null);
    const 残る = (f?.eras ?? []).filter((e) => e.state === Konjaku.STATE.OK && !e.blank);
    for (const e of 残る) {
      const base = e.tile.replace(/\/\d+\/\d+\/\d+\.\w+$/, "");
      const t = Konjaku.tileOf(lon, lat, e.z);
      枠.push({ 絵: 窓(base, e.z, t.x, t.y, t.px, t.py, e.ext),
                年: e.label, 説: e.sub || "空中写真" });
    }

    // ③ いま。最新の空中写真（verify.js の LATEST）
    const L = Konjaku.LATEST;
    if (L) {
      const z = Math.min(Math.max(16, L.min), L.max);
      const t = Konjaku.tileOf(lon, lat, z);
      枠.push({ 絵: 窓(`${Konjaku.GSI}/${L.id}`, z, t.x, t.y, t.px, t.py, L.ext),
                年: L.label, 説: L.sub });
    }

    if (!枠.length) return;
    timeSec.hidden = false;
    const 年代数 = 残る.length;
    timeLead.textContent = 年代数
      ? `明治期から今まで、${年代数} 年代の空中写真が残っています`
      : "この場所の空中写真は、残っていません";
    framesEl.innerHTML = 枠.map((k) =>
      `<figure class="frame ${k.絵 ? "" : "frame--none"}">`
      + `<div class="frame__win">${k.絵 ?? ""}</div>`
      + `<figcaption><p class="frame__y">${esc(k.年)}</p>`
      + `<p class="frame__t">${esc(k.説)}</p></figcaption></figure>`).join("");
    // 絵の読み方は、こちらでは言わない。何が写っているかは利用者が読む
    timeNote.textContent =
      "どれも同じ場所を、同じ広さで切り取っています。真ん中の点がこの地点です。"
      + "写っているものが何かは、こちらでは判定していません。";
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
