// 場所の候補を、応答から数えた値だけで並べ替える。
//
// なぜ要るか（掟: 取れなかったを「無い」と言わない（やる順番3））:
//   地理院の住所検索（AddressSearch）は**関連度で返さない**。実測すると
//   都道府県コードの昇順（北→南）で、先頭が正解になるのは偶然でしかない。
//
//     「渋谷」→ 先頭は福島県猪苗代町渋谷（東京都渋谷区は3番目・全132件）
//     「新宿」→ 先頭は山形県朝日町新宿（東京都新宿区は13番目 ＝ 画面に出ない）
//     「梅田」→ 先頭は青森県五所川原市（大阪市北区は7番目）
//
//   その状態で先頭を選択済みにしていたため、Enter を押すと必ず別の土地に着いた。
//
// 何を根拠に並べ替えるか（docs 掟: 根拠のないことは書かない「根拠のないことは書かない」）:
//   **応答が返す4フィールド（title / dataSource / addressCode / geometry）だけ**を使う。
//   人口・知名度・現在地・明治期データの有無は、いずれも採らない。理由は順に
//     - 人口/知名度  … 行政区分の格がその代理変数になっており、持つ理由がない
//     - 現在地       … 同じURLが人によって違う場所を指す（掟: 唯一の指標は共有率 の共有ループが壊れる）
//     - 明治期データ … 渋谷区も新宿区も梅田も「記録なし」で逆効果。しかも
//                      検索経路に新しい実行時外部依存が入る（掟: 外部APIは「止まりうる依存」として扱う / 掟: 取れなかったを「無い」と言わない と逆行）
//   外部リクエストは増やさない。1検索1リクエストのまま。
//
// ブラウザと Node の両方から同じコードを使う（scripts/search-check.mjs が
// このファイルをそのまま読む）。検査した実装と出荷する実装を別にしない。

(function (global) {
  "use strict";

  // ---- 応答の dataSource（実測値。凡例は公開されていないので、観測した中身で名前を付ける）----
  //   （無し） 住所   … 「東京都渋谷区渋谷」のように都道府県から書かれた行政地名
  //   "1"     交通等 … 駅・橋・水門
  //   "3"     施設   … 学校・郵便局・交番・病院
  //   "4"     自然   … 川・海峡・岬
  //   "5"     町字   … 「渋谷二丁目」。addressCode が市区町村コード
  const ADDRESS = "", TRANSPORT = "1", FACILITY = "3", NATURE = "4", CHOME = "5";

  const PREF = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/;
  const CHOME_SUFFIX = /[〇一二三四五六七八九十百千0-9０-９]+丁目$/;
  const OAZA = /^(大字|字)/;

  // 「町田市」の先頭の「町」を語尾と読んでしまうと市区町村名が壊れる。
  // 語尾文字は名前の途中以降にしか来ないので、0文字目の一致は飛ばす。
  // 「四日市市」「大町町」のように語尾が連続する場合はまとめて取る。
  function unitOf(s, suffixes) {
    for (let i = 1; i < s.length; i++) {
      if (!suffixes.includes(s[i])) continue;
      let j = i;
      while (j + 1 < s.length && suffixes.includes(s[j + 1])) j++;
      return { name: s.slice(0, j + 1), rest: s.slice(j + 1) };
    }
    return null;
  }

  // 「東京都渋谷区渋谷」→ {pref:"東京都", city:"渋谷区", ward:null, town:"渋谷"}
  // 「大阪府大阪市北区梅田」→ {pref:"大阪府", city:"大阪市", ward:"北区", town:"梅田"}
  // 「宮城県柴田郡川崎町」  → {pref:"宮城県", county:"柴田郡", city:"川崎町", town:""}
  function parseAddress(title) {
    const pm = title.match(PREF);
    if (!pm) return null;
    let rest = title.slice(pm[0].length);
    const cu = unitOf(rest, "市区町村");
    if (!cu) return { pref: pm[0], city: "", ward: null, town: rest };
    let city = cu.name;
    rest = cu.rest;
    // 郡は市区町村名の手前にしか来ない。「鹿児島市郡元」の郡は町字側なので、
    // 市区町村を先に切ってから郡を剥がす順にしている。
    const g = city.indexOf("郡");
    if (g >= 1) city = city.slice(g + 1);
    // 政令市の行政区。市の直後に来たときだけ拾う
    let ward = null;
    if (city.endsWith("市")) {
      const wu = unitOf(rest, "区");
      if (wu) { ward = wu.name; rest = wu.rest; }
    }
    return { pref: pm[0], city, ward, town: rest.replace(OAZA, "") };
  }

  // 行政区分の格。区 > 市 > 町 > 村。知名度そのものを持たない代わりの指標で、
  // 「渋谷区」「博多区」「大阪市」が上に来るのはこの1本で説明できる。
  const GRADE = { "区": 0, "市": 1, "町": 2, "村": 3 };
  const UNKNOWN_GRADE = 4;
  const gradeOf = (name) => (name ? GRADE[name.slice(-1)] ?? UNKNOWN_GRADE : UNKNOWN_GRADE);

  // 完全一致の種類。0=自治体名そのもの 1=町字 2=部分一致
  // 一致の種類。小さいほど上。
  //
  // EXACT_POI を EXACT_TOWN と PARTIAL の**あいだ**に置くのが肝。
  //   ・「渋谷」→ 渋谷区（EXACT_CITY）が1位のまま。渋谷駅は "渋谷駅"≠"渋谷" で発火しない
  //   ・「東京駅」→ 住所側に完全一致が無いので、駅が部分一致（沖縄県東 など）より上に出る
  // 前方一致や部分一致では発火させない。「渋谷」で駅を上げると区より上に来てしまう。
  const EXACT_CITY = 0, EXACT_TOWN = 1, EXACT_POI = 2, PARTIAL = 3;

  function classify(props, q) {
    const src = props.dataSource ?? ADDRESS;
    const title = props.title ?? "";
    if (src === ADDRESS) {
      const a = parseAddress(title);
      if (!a) return { kind: PARTIAL, grade: UNKNOWN_GRADE, addr: null };
      // 「川崎市川崎区」は市でも区でも一致する。格の良いほうを採る
      let kind = PARTIAL, grade = UNKNOWN_GRADE;
      for (const unit of [a.ward, a.city]) {
        if (!unit) continue;
        if (unit.slice(0, -1) === q) {
          kind = EXACT_CITY;
          grade = Math.min(grade, gradeOf(unit));
        }
      }
      if (kind === EXACT_CITY) return { kind, grade, addr: a };
      // 町字の一致。格は所属する市区町村から取る（「江東区豊洲」は区、「八戸市豊洲」は市）
      if (a.town === q) return { kind: EXACT_TOWN, grade: gradeOf(a.ward || a.city), addr: a };
      return { kind: PARTIAL, grade: gradeOf(a.ward || a.city), addr: a };
    }
    // 町字（dataSource 5）は市区町村名を持たない。格は分からないので付けない。
    // 分からないものを推定で埋めると、そこから先は根拠のない並びになる。
    if (src === CHOME && title.replace(CHOME_SUFFIX, "") === q)
      return { kind: EXACT_TOWN, grade: UNKNOWN_GRADE, addr: null };
    // 駅・施設・自然物。名前が打った語と**完全に一致**するときだけ引き上げる。
    //
    // ⚠ ここを入れる前は、これらを一律で最下位バケツに落としていた。そのせいで
    //   「東京駅」の応答53件のうち正解の〈東京駅〉が50位、「東京スカイツリー」は
    //   49件中49位（最後）に沈み、打った本人が探しているものだけが出てこなかった。
    //   応答の中には最初から入っていたので、足りなかったのは並べ方だけ。
    //
    // 格（都道府県<市<区…）は付けない。駅に行政の格は無いし、addressCode から
    // 推定するとそこから先が根拠のない並びになる（町字と同じ扱い）。
    // 駅は語尾の「駅」を省いて呼ばれる（「天王洲アイル」＝天王洲アイル駅）。そこも拾う。
    // ⚠ これで「渋谷」が渋谷駅に取られないのは、渋谷区が EXACT_CITY(0) で
    //   EXACT_POI(2) より上にいるから。同じ理由で「梅田」は大阪市北区梅田
    //   （EXACT_TOWN=1）が勝つ。行政地名がある語では、駅は勝てない作りになっている。
    if ((src === TRANSPORT || src === FACILITY || src === NATURE)
        && (title === q || (src === TRANSPORT && title === `${q}駅`)))
      return { kind: EXACT_POI, grade: UNKNOWN_GRADE, addr: null };
    return { kind: PARTIAL, grade: UNKNOWN_GRADE, addr: null };
  }

  // ---- 区域（地物をまとめる単位）----
  // addressCode は市区町村コードなので、そのままで「同じ市区町村の地物」が取れる。
  // 住所（addressCode が空）だけは繋がらないので、応答内で最も近い地物の区域へ寄せる。
  // 座標も応答が返す値なので、これも外部データを増やさない。
  // 約5km。市区町村の代表点と、その中の地物との開きを吸収する幅。
  // 10km にしていたとき「東京駅」で **東京都渋谷区東** が千代田区の区域へ寄せられ、
  // 「東京都渋谷区東 ／ この区域に6件： 東京駅…」と、根拠を超えた接頭ラベルが出ていた。
  // 5km に締めると渋谷区東は自分だけの区域になり、35語の並び・自動選択は1件も変わらない（実測）。
  const NEAR_DEG = 0.045;

  const dist2 = (a, b) => {
    const dy = a[1] - b[1], dx = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180);
    return dy * dy + dx * dx;
  };

  function buildAreas(rows, q) {
    const areas = new Map();
    const key = (r) => `c:${r.code}`;
    for (const r of rows) {
      if (!r.code) continue;
      const k = key(r);
      if (!areas.has(k)) areas.set(k, { key: k, items: [] });
      areas.get(k).items.push(r);
      r.area = k;
    }
    const lim = NEAR_DEG * NEAR_DEG;
    for (const r of rows) {
      if (r.code) continue;
      let best = null, bd = lim;
      for (const a of areas.values())
        for (const m of a.items) {
          const d = dist2(r.ll, m.ll);
          if (d < bd) { bd = d; best = a; }
        }
      // 近い地物が無ければ、その住所だけで1区域を作る（無理に寄せない）
      const k = best ? best.key : `a:${r.title}`;
      if (!areas.has(k)) areas.set(k, { key: k, items: [] });
      areas.get(k).items.push(r);
      r.area = k;
    }
    for (const a of areas.values()) {
      // 同じ駅が路線ぶん重複して返る（豊洲駅が2件）。数えるのは名前の種類
      const st = new Set(), named = new Set();
      for (const m of a.items) {
        if (m.src !== TRANSPORT || !m.title.endsWith("駅")) continue;
        st.add(m.title);
        // 「その語そのものを名前とする駅」。stations は語を名前に**含む**駅の数で、
        // 「港南台駅」（港南台の駅）や「港南中央駅」まで入ってしまう。
        // 語が複数の場所を指しているときは、この緩さがそのまま誤発火になる。
        if (m.title === q + "駅" || m.title === q) named.add(m.title);
      }
      a.stations = st.size;
      a.named = named.size;
      a.count = a.items.length;
      // 区域を人が読める名前で呼べるようにする。住所があればそれを使う
      a.label = a.items.find((m) => m.src === ADDRESS && m.kind !== PARTIAL)?.title
             ?? a.items.find((m) => m.src === ADDRESS)?.title ?? null;
    }
    return areas;
  }

  // ---- 副題 ----
  // 出すのは数えた事実だけ。「本命」「たぶんここ」は書かない（掟: 根拠のないことは書かない / 掟: 確率を出さない。実測値そのものを出す）。
  // 緯度経度は選ぶ手がかりにならないので出さない。
  // 件数を先に出す。同じ「渋谷」でも 75件 と 2件 の差が、選ぶときの手がかりそのものになる。
  // 例示は駅→川→施設→丁目の順。その土地が何であるかの見当が一番早く付く順に並べている。
  const SAMPLE_ORDER = [TRANSPORT, NATURE, FACILITY, CHOME];
  function describe(row, area) {
    // 町字や駅の行は題名に都道府県が入らないので、区域の住所を頭に付けて場所を示す
    const where = row.src === ADDRESS || !area.label ? "" : area.label + " ／ ";
    if (area.count <= 1) return where + "この区域で見つかったのはこの1件";
    const picked = [];
    for (const s of SAMPLE_ORDER) {
      if (picked.length >= 3) break;
      for (const m of area.items) {
        if (m === row || m.src !== s || picked.includes(m.title)) continue;
        picked.push(m.title);
        if (picked.length >= 3) break;
      }
    }
    return where + `この区域に ${area.count}件`
      + (picked.length ? `： ${picked.join("・")}` : "");
  }

  // ---- 同格の競合（語が複数の場所を同じ資格で指している）----
  // 「港南」は横浜市**港南区**でもあり、港区**港南**でもある。どちらも区の一致で、
  // 応答の中に「どちらのことか」を決められる材料は無い。
  // 並べ替えは kind（自治体名の一致 > 町字の一致）で港南区を上に置くが、これは
  // **順番を決めるための規則であって、確からしさの証拠ではない**。
  // ここを混同すると「梅田は区の町字どうしなので決められない＝選ばない」と
  // 「港南は区名が勝つので選ぶ」が非対称になり、同じ曖昧さで片方だけ確信を持つ。
  //
  // 格（区/市/町/村）が分かる行だけで見る。dataSource 5（丁目）は所属が分からず、
  // 「豊洲一丁目」まで競合に数えると、丁目が返る語がすべて選べなくなる。
  function contestedOf(rows) {
    const top = rows[0];
    if (!top || top.kind === PARTIAL || top.grade === UNKNOWN_GRADE) return false;
    return rows.some((r) => r !== top && r.kind !== PARTIAL
      && r.grade === top.grade && r.area !== top.area);
  }

  // ---- 自動選択 ----
  // 「常に選ばない」では豊洲のように答えが1つのときに余計な一手を強いる。
  // 確度が高いときだけ選ぶ。判定は応答から数えた値だけで、地名リストは持たない。
  //
  //   件数マージン … 1位の地物 ≥ 8 かつ ≥ 3×2位
  //
  //   候補が1区域だけ                                        → 選ぶ
  //   同格の競合あり: 語そのものの駅が1位だけにある + 件数マージン → 選ぶ（それ以外は選ばない）
  //   1位の駅数 ≥ 2 かつ 1位の駅数 ≥ 2×(2位の駅数)+1          → 選ぶ
  //   1位の駅数 ≥ 2位の駅数 かつ 件数マージン                  → 選ぶ
  //   それ以外                                              → 何も選ばない
  //
  // 3つめは UX 案の「1位も2位も駅0 かつ …」を実測で緩めたもの。
  // 「渋谷」の応答に入る駅は渋谷駅の1件だけ（恵比寿駅は語に含まれないので返らない）で、
  // 元の条件では発火せず、受け入れ条件「渋谷を打って Enter で着く」を満たせなかった。
  // 「駅で負けていない」に置き換えると、駅0対4の梅田・0対2の有明（どちらも先頭行が
  // 意図と違う語）は落ちたまま、渋谷・博多・浦安が通る。
  //
  // 【競合時】件数と駅数はどちらも「語を名前に**含む**地物の数」で、土地の確からしさではない。
  // 港南区の52件は大半が港南台の地物で、港区港南の最寄りは品川駅（語を含まないので0件）。
  // 曖昧な語でこの2つを根拠に確信を持つのが誤発火の正体なので、競合時は
  // **その語そのものを名前とする駅**（川崎駅・新宿駅・渋谷駅）が片方にしか無いことを要求する。
  // これで港南（港南駅は無い）・住吉（住吉駅が江東区にも大阪にもある）・
  // 日本橋（東京にも大阪にもある）・大島・梅田・有明が落ち、川崎・新宿・銀座が通る。
  //
  // 「1位」は並べ替えた先頭行が属する区域に固定している。
  // ここを「駅の一番多い区域」にすると、選ばれる行と先頭行がずれて
  // 「なぜその行が光っているのか」が画面から読めなくなる。
  function shouldPick(rows, areas, contested) {
    if (!rows.length) return false;
    // 名前がそのまま一致した駅・施設が先頭のとき。
    // 「東京駅」「天王洲アイル駅」のように答えが1つなら選ぶ。
    // 同名のものが複数の市区町村にあるなら選ばない（どれか分からないので）。
    // 件数や駅数はここでは使わない。それは「語を名前に含む地物の数」であって
    // どの土地かの確からしさではない（下のコメント参照）。
    if (rows[0].kind === EXACT_POI) {
      const areasOfPoi = new Set(rows.filter((r) => r.kind === EXACT_POI).map((r) => r.area));
      return areasOfPoi.size === 1;
    }
    const top = areas.get(rows[0].area);
    const rivals = [...areas.values()].filter((a) => a !== top);
    if (!rivals.length) return true;                       // 候補が1区域だけ
    const c2 = Math.max(...rivals.map((a) => a.count));
    const wide = top.count >= 8 && top.count >= 3 * c2;    // 件数の安全マージン
    if (contested ?? contestedOf(rows)) {
      const n2 = Math.max(...rivals.map((a) => a.named));
      return top.named >= 1 && top.named > n2 && wide;
    }
    const st2 = Math.max(...rivals.map((a) => a.stations));
    if (top.stations >= 2 && top.stations >= 2 * st2 + 1) return true;
    if (top.stations >= st2 && wide) return true;
    return false;
  }

  // ---- 入口 ----
  // 応答（GeoJSON Feature の配列）と検索語から、画面に出す行と、選ぶかどうかを返す。
  function places(list, q, limit) {
    const query = (q ?? "").trim();
    const rows = list.map((f, i) => {
      const p = f.properties ?? {};
      const c = classify(p, query);
      return {
        i, title: p.title ?? "", src: p.dataSource ?? ADDRESS,
        code: p.addressCode || "", ll: f.geometry?.coordinates ?? [0, 0],
        kind: c.kind, grade: c.grade, addr: c.addr, area: null,
      };
    });
    const areas = buildAreas(rows, query);
    // 第1キー: 完全一致の種類 / 第2キー: 行政区分の格 / 第3キー: APIの元の順（同点は触らない）
    //
    // 第1キーを外して「同格なら元の順」にすると、元の順が都道府県コードの昇順なので
    // 北の県が無条件に勝つ。実測すると「新宿」が埼玉県さいたま市緑区新宿（新宿区は4位）、
    // 「神戸」が埼玉県羽生市神戸（神戸市は10位）、「横浜」が福岡市西区横浜になり、
    // 区名・繁華街名8語が1位は 7/8 → 5/8 に落ちる。順番の規則としてはこれを残すしかない。
    // ただし**順番の規則を確からしさの証拠に使わない**（shouldPick の contestedOf を参照）。
    rows.sort((a, b) => a.kind - b.kind || a.grade - b.grade || a.i - b.i);
    const contested = contestedOf(rows);
    // 同じ名前・同じ区域のものは1行に畳む。
    // 「東京駅」は出入口ごとに4件返り、表示も説明も同一の行が上位4つを占めていた。
    // 利用者から見て選びようがなく、その下の6件は「東」だけの一致（北海道札幌市東区…）
    // なので、まともに選べる行が画面から消える。
    // ⚠ 畳むのは表示だけ。all は畳まない（区域の件数はそこから数えている）。
    const seenKey = new Set();
    const shown = rows.filter((r) => {
      const k = `${r.title}\u0000${r.area}`;
      if (seenKey.has(k)) return false;
      seenKey.add(k); return true;
    }).slice(0, limit ?? 10);
    for (const r of shown) r.sub = describe(r, areas.get(r.area));
    return { rows: shown, all: rows, areas, contested,
             pick: shouldPick(rows, areas, contested) ? 0 : -1 };
  }

  // ---- 検索そのもの（通信・時間切れ・再試行・世代） ----
  //
  // ⚠ **ここが唯一の実装。** 以前は index.html と peel3d.js が同じものを持っていて、
  //   実際に食い違っていた（/peel だけ時間切れも再試行も無く、**取れなかったときに
  //   「見つかりませんでした」と書いていた**）。揃え直したあとも「揃えてあるだけ」で、
  //   片方だけ直す事故が起きうる状態だった（掟: 同じ問いに答える実装を2つ持たない）。
  //
  // ⚠ **画面には何も描かない。** 返すのは状態と値だけで、DOM は各画面が作る。
  //   トップの「この地名を報告する」や 3D の候補ボタンは、画面ごとに違ってよい。
  //
  // ⚠ `fetch` は差し替えられるようにする。**検査が「1検索で何回叩いたか」を数えるため**
  //   （数えられないと、1検索1リクエストという地理院への約束を機械で守れない）。
  // ⚠ **外の話は `gsi-address-search.js` が持つ**（2026-08-22 に切り出した。
  //   hidetzu/konjaku#181）。⚠ **URL・時間切れ・状態・形・再試行はここに書かない。**
  //   ⚠ **書き写すと、⚠ 検査が「本番の経路」を通らなくなる**（⚠ 実際にそうなっていた）。
  const repo = () => (typeof module === "object" && module.exports)
    ? require("./gsi-address-search.js")
    : global.KonjakuGsiAddressSearch;
  const SEARCH_TIMEOUT_MS = repo().TIMEOUT_MS;

  function createSearch(opt) {
    // ⚠ **口そのものを差し替えてもよい**（⚠ 検査は `fetch` を差し替えるだけで足りる）。
    const search = opt?.repository ?? repo().createGsiAddressSearch({ fetch: opt?.fetch });
    const whyOf = repo().whyOf;
    // 遅れて返った古い応答で画面を上書きしない。**入力を消したときも進める**（cancel）。
    let seq = 0;

    return {
      // ⚠ 入力が短くなった／画面が別のことを始めたときに呼ぶ。
      //   これを呼ばないと、**遅れて返った候補が空の入力欄へ復活する**
      //   （2026-08-15 に両画面で再現させた）。
      cancel() { seq++; },

      // { state:"found", rows, pick } / { state:"empty" }
      // { state:"error", why }        / { state:"stale" }
      async run(q, limit) {
        const my = ++seq;
        const stale = () => my !== seq;
        // ⚠ **取ってくるのは口の仕事**（⚠ 再試行も時間切れも、⚠ 向こうが決める）。
        //   ⚠ **ここが持つのは「いまの検索か」だけ。**
        let list = null, err = null;
        try { list = await search.search(q); } catch (e) { err = e; }
        if (stale()) return { state: "stale" };
        if (list === null) return { state: "error", why: whyOf(err) };
        if (!list.length) return { state: "empty" };
        // 応答は関連度順ではなく都道府県コードの昇順なので、そのままでは先頭が別の土地になる。
        // 並べ替えと「選ぶかどうか」の判定は places()（応答の中身だけで決まる）。
        const r = places(list, q, limit ?? 10);
        return { state: "found", rows: r.rows, pick: r.pick };
      },
    };
  }

  const api = { places, parseAddress, classify, buildAreas, shouldPick, contestedOf, describe,
    createSearch, SEARCH_TIMEOUT_MS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.KonjakuPlaces = api;
})(typeof window !== "undefined" ? window : globalThis);
