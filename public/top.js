// 今昔 — トップの画面
//
// ⚠ **`index.html` から逐語で移しただけ**（2026-08-24。Owner 判断）。
//   ⚠ **1 文字も変えていない。**⚠ **分割も改名もしていない**
//     （`.claude/rules/components.md`: ⚠ **移設と改名を同時にやらない**）。
//   ⚠ **切り出しは別の PR。**⚠ この PR で変わるのは「どこにあるか」だけ。
//
// ⚠ **なぜ出したか**（実測 2026-08-24・`main` = `c2312df`）:
//   ⚠ `index.html` は 4011 行で、⚠ **その 66%（2667 行）がインライン `<script>` 1 個**だった。
//   ⚠ `peel.html` は本体を `peel3d.js` へ出しており（⚠ インラインは 30 行）、
//     ⚠ **トップだけ取り残されていた。**
//
// ⚠ **classic script。**⚠ `index.html` の `<script src>` の並び順に依存する
//   （⚠ `esc.js` / `words.js` / `place-arg.js` などが先に読まれていること）。
//   ⚠ **`type="module"` にしない。**⚠ すると最上位の宣言が共有されなくなる。
//
// ⚠ **`public/sw.js` の SHELL に入れてある。**⚠ 抜くとオフラインで画面が動かない。
//   ⚠ 動的キャッシュの規則は ⚠ **直下の `.js` しか一致しない**（`/^\/[\w.-]+\.js$/`）。
const GSI=Konjaku.GSI, Z=16;
// 外部から来た文字列は、HTML を組み立てるところで必ずここを通す（esc.js に理由がある）。
// ⚠ 読み上げの文には通さない。あれは HTML ではない。
const {esc,escUrl}=KonjakuEsc;

// ============================================================
// 言葉を決めるところ。⚠ **HTML の中で言葉を分岐させない。**
//
// 実測（2026-08-19）: HTML を組み立てるテンプレートの中に「言葉の判断」が
//   このファイルに 7 個 埋まっていた（peel3d.js の 9 個は先に外へ出した）。
//   ⚠ 文言を直すとき markup を触ることになり、検査も字面でしか追えない。
// ⚠ **地図も DOM も見ない。**検査がこの塊だけを取り出して回せる。
//   ⚠ peel3d.js の WORD と同じ考え方。持ち主が違うので分けている
//     （あちらは /peel の答えと出どころ、こちらはトップの根拠カードと導線）。
// ============================================================
const TOPWORD = {
  // 数えた枠が、地図の端で切れたか。⚠ 切れたら必ず言う（割合の分母が変わる）
  clipped: (isClipped) => isClipped ? "／端なので枠が切れています" : "",
  // その事物が、いまはもう無いか
  gone: (isGone) => isGone ? "（無くなった）" : "",
  // ⚠ **取得方法の呼び名。**掟の語彙なので、ここ 1 か所で決める。
  //   未取得＝読めなかった／境目＝近傍で答えが割れた／それ以外は実際の取得方法。
  method: (state, mixed, method) =>
    KonjakuWords.method(state, mixed, method),
  // ⚠ **掟の核心。**正常に記録が無いのと、判定できないのは別。
  //   ⚠ **字は words.js が持つ**（2026-08-20）。以前はここと verify.js と share.js が
  //     同じ字を別々に書いていて、片方だけ直せば**同じ状態に 2 通りの言い方**ができた。
  meiji: (value, none) => KonjakuWords.meiji(value, none),
  // 標高。⚠ 負のときだけ言う（0 以上のときに「高い」とは言わない）
  belowSea: (m) => m < 0 ? "　<span style=\"font-size:var(--fs-note)\">海面より低い</span>" : "",
  // ⚠ 深掘りの案内。**下地が無い場所でも押せる**（2026-08-18 の方針）ので、
  //   何ができるかを先に書く。⚠ 「用意できていません」から始めない（CLAUDE.md §4-1）。
  //
  // ⚠ **この字の持ち主はここだけ**（2026-08-21。hidetzu/konjaku#138）。
  //   ⚠ 以前は行動一覧（buildActions）が同じ字を書き写しており、⚠ **2 か所が同じ問いに答えていた。**
  //
  // ⚠ **実測（2026-08-18・利用者役 3 名）。**⚠ 消えると同じ失敗をやり直すので、ここへ移した。
  //   ⚠ **⚠ 付きで「用意できていません」から始まる案を 3/3 が最下位**にした。
  //     「押す前に断られた」「他の行が『調べる』と誘っている中でここだけ壊れて見える」
  //     「『根拠あり』バッジと『ありません』が同じ行にあってちぐはぐ」。
  //   ⚠ **⚠ の記号を使わない。**すぐ上の「この土地で気をつけること」（災害リスク）に
  //     同じ印を使っている。⚠ **在庫の話に出すと「危ない土地の警告」に読まれた**（2/3）。
  //   ⚠ **「順に増やしています」。**「用意できた場所から」は止まって聞こえる、と 2/3 が言った。
  //     ⚠ また来る理由を残す。
  //   ⚠ 375px で 3 行になる。2/3 が「許容範囲」と答えた（上下の行も 2 行に折り返している）。
  peelLead: (hasGround) => hasGround === false
    // ⚠ **字は `words.js` の 1 か所から借りる**（2026-08-22）。⚠ `/peel` が同じ字を使うため。
    //   ⚠ **字は 1 文字も変えていない。**⚠ 借り先を変えただけ。
    ? KonjakuWords.canWithoutBuildings("top")
    : "いまの街が、明治期の地面のどこに立っているか",
};
// ⚠ 位置情報の許し直し方。**言葉ではなく手順**なので、上とは分けている。
//   ⚠ 端末で本当に違う操作なので、1 つにまとめない。
const RELOCATE_HOW = (isIOS) => isIOS
  ? "Safari：アドレスバー左の <b>ぁあ</b> → <b>Webサイトの設定</b> → 位置情報 を「許可」に。<br>"
    + "アプリごと切れている場合は、<b>設定 → プライバシーとセキュリティ → 位置情報サービス → Safari</b>。"
  : "アドレスバーの鍵アイコン（または ⓘ）→ サイトの設定 → 位置情報 を「許可」に。";


// ⚠ **寄せる操作の受け口は、ここ 1 つ。**
//   「動きを減らす」を入れている人には、滑らかに送らない。
//   ⚠ **送り先は変えない。**動きだけを消す（掟: 消すのではなく詰める）。
//   ⚠ 呼ぶたびに聞く。設定は途中で変えられる（読み込み時に1回だけ見ると、変えた人に効かない）。
//   ⚠ **呼ぶ側は behavior を渡さない。**渡すと、判断が呼ぶ側の数だけ増える
//     （実測 2026-08-19: この画面に 7 か所あった）。呼ぶ側が言うのは**どこへ寄せるか**だけ。
//   ⚠ 静的検査が、生の behavior:"smooth" がここ以外に無いことを見ている。
const lessMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollToEl = (el, opt) => el?.scrollIntoView({ ...opt, behavior: lessMotion() ? "auto" : "smooth" });

// 検証ロジックは verify.js に集約している（index / peel で重複していたため）。
// 事実の抽出・根拠の保持・文章化は、すべてそちらの責任。

// ============ 私的な記録（この端末にだけ・非公開） ============
const KEY="place-notes-v1";
// 座標をそのままキーにすると、現在地から調べるたびに数m ずれて
// 同じ場所が別エントリとして増える。約10m（小数4桁）に丸めて同一視する。
const keyOf=(lon,lat)=>`${lat.toFixed(4)},${lon.toFixed(4)}`;

function loadAll(){
  let all;
  try{ all=JSON.parse(localStorage.getItem(KEY)||"{}"); }catch{ return {}; }
  // 旧キー（小数5桁）で保存されたものを、新しい粒度へ寄せる。
  // 消さずに移すこと。利用者の記録は勝手に失ってはいけない。
  let moved=false;
  for(const k of Object.keys(all)){
    const r=all[k];
    if(!r || typeof r.lat!=="number" || typeof r.lon!=="number") continue;
    const nk=keyOf(r.lon,r.lat);
    if(nk===k) continue;
    const cur=all[nk];
    // 同じ場所が複数あったら、新しい方を残す
    if(!cur || (r.at??0) > (cur.at??0)) all[nk]=r;
    delete all[k]; moved=true;
  }
  if(moved) try{ localStorage.setItem(KEY,JSON.stringify(all)); }catch{}
  return all;
}
const saveAll=(o)=>localStorage.setItem(KEY,JSON.stringify(o));
let current=null;

function renderPrivate(){
  const all=loadAll(), rec=current?all[keyOf(current.lon,current.lat)]:null;
  // 入力欄の右端に、いまの評価を出す。押すと下に開く。
  const tg=document.getElementById("mineToggle");
  tg.style.display = current ? "" : "none";
  tg.textContent = rec?.star ? `★${rec.star}` : (rec?.memo ? "☆＋" : "☆");
  tg.classList.toggle("rated", !!(rec?.star || rec?.memo));
  if(!current){ document.getElementById("mine").style.display="none";
    tg.setAttribute("aria-expanded","false"); }
  const st=document.getElementById("stars"); st.innerHTML="";
  for(let i=1;i<=5;i++){
    const b=document.createElement("button");
    b.textContent="★"; b.className=(rec&&rec.star>=i)?"on":"";
    b.onclick=()=>setRec({star:(rec&&rec.star===i)?0:i});
    st.appendChild(b);
  }
  document.getElementById("memo").value=rec?.memo??"";
  document.getElementById("savedAt").textContent=
    rec?.at?`保存済み: ${new Date(rec.at).toLocaleString("ja-JP")}`:"未保存";
  renderSaved();
}
function setRec(patch){
  if(!current) return;
  const all=loadAll(), k=keyOf(current.lon,current.lat);
  const rec={star:0,memo:"",...all[k],...patch,
    title:current.title,lon:current.lon,lat:current.lat,at:Date.now()};
  if(!rec.star && !rec.memo.trim()) delete all[k]; else all[k]=rec;
  saveAll(all); renderPrivate();
}
let memoTimer=null;
document.getElementById("memo").addEventListener("input",(e)=>{
  clearTimeout(memoTimer); memoTimer=setTimeout(()=>setRec({memo:e.target.value}),500);
});
const mineToggle=document.getElementById("mineToggle");
mineToggle.onclick=()=>{
  const open=mineToggle.getAttribute("aria-expanded")==="true";
  mineToggle.setAttribute("aria-expanded",String(!open));
  const el=document.getElementById("mine");
  el.style.display=open?"none":"block";
  // 開いたことが見えるところまで連れていく。押しても何も起きないように見せない
  if(!open) scrollToEl(el,{block:"nearest"});
};
document.getElementById("clearOne").onclick=()=>{
  if(!current) return;
  const all=loadAll(); delete all[keyOf(current.lon,current.lat)]; saveAll(all); renderPrivate();
};
function renderSaved(){
  const all=loadAll(), keys=Object.keys(all);
  const wrap=document.getElementById("savedWrap"), el=document.getElementById("saved");
  if(!keys.length){wrap.style.display="none";return}
  wrap.style.display="";
  // ⚠ 地名は地理院の応答（または共有された URL の q）から来ていて、メモは利用者が
  //   打ったもの。どちらもこちらが中身を保証できないので、描くときに esc を通す。
  //   data-k は下で dataset.k として読み戻すが、ブラウザが実体参照を元の文字に戻すので
  //   キーは一致したままになる。
  el.innerHTML=keys.sort((a,b)=>all[b].at-all[a].at).map((k)=>{
    const r=all[k];
    const memo=r.memo?`${r.memo.slice(0,22)}${r.memo.length>22?"…":""}`:"";
    return `<div class="row" data-k="${esc(k)}"><span>${esc(r.title)}${
      memo?`<span style="color:var(--ink-dim)"> — ${esc(memo)}</span>`:""
    }</span><span class="s">${esc("★".repeat(r.star))}</span></div>`;
  }).join("");
  el.querySelectorAll(".row").forEach((row)=>{
    row.onclick=()=>{const r=all[row.dataset.k]; openPlace(r.lon,r.lat,r.title)};
  });
}
document.getElementById("exportBtn").onclick=()=>{
  const b=new Blob([JSON.stringify(loadAll(),null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download="place-notes.json"; a.click(); URL.revokeObjectURL(a.href);
};

// ============================================================
// コマンド（場所を決めたあとに打ち込むもの）
//   自前のレンズと、外部への受け渡しを1つの一覧に混ぜる。
//   POI を自前で持つまでは、自由入力は素直に Google マップへ渡す（掟: 地名も座標も送らない）。
// ============================================================
// hl / gl を明示しないと、Googleアカウントの言語設定に引きずられて英語で開くことがある。
// IP だけで判定されるとは限らないので、こちらから日本語を指定する。
const gmap=(kw,lat,lon)=>
  `https://www.google.com/maps/search/${encodeURIComponent(kw)}/@${lat},${lon},16z?hl=ja&gl=jp`;
// 「次に調べる語」は店ではなく読み物なので、地図検索ではなく Web検索へ渡す。
// 「埋立の歴史」を地図に投げても何も出てこない。地名と組にして初めて意味を持つ。
const gweb=(kw)=>`https://www.google.com/search?q=${encodeURIComponent(kw)}&hl=ja`;
// ただし場所の名前は、いつも地名とは限らない。現在地から調べたときは「現在地」、
// URL から座標だけで開いたときは「35.6548, 139.7975」が入っている。
// 「現在地 埋立の歴史」で検索しても何も出ない。無意味なクエリは投げない。
// 地名として使えないときは、語だけで検索する（全国の話になるが、無意味よりはよい）。
const placeName=(title)=>{
  const s=(title??"").trim();
  if(!s||s==="現在地") return "";
  if(/^[\d.,\s+\-]+$/.test(s)) return "";     // 「35.6548, 139.7975」のような座標
  return s;
};

// よく打つ語を並べておく。表記ゆれは kw で吸収する。
const PRESETS=[
  {ic:"🍚",label:"ごはん",       kw:["ごはん","ご飯","飯","食事","レストラン","グルメ","飲食","ランチ","ディナー","food"],q:"レストラン"},
  {ic:"🍜",label:"ラーメン",     kw:["ラーメン","らーめん","麺"],q:"ラーメン"},
  {ic:"☕",label:"カフェ",       kw:["カフェ","喫茶","コーヒー","cafe"],q:"カフェ"},
  {ic:"🍺",label:"居酒屋・バー", kw:["居酒屋","バー","飲み","酒"],q:"居酒屋"},
  {ic:"🛒",label:"スーパー",     kw:["スーパー","買い物","食材"],q:"スーパー"},
  {ic:"🏪",label:"コンビニ",     kw:["コンビニ"],q:"コンビニ"},
  {ic:"💊",label:"薬局",         kw:["薬局","ドラッグ","薬"],q:"薬局"},
  {ic:"🏥",label:"病院・医者",   kw:["病院","医者","医院","クリニック","歯医者","歯科","内科"],q:"病院"},
  {ic:"🌳",label:"公園・遊び場", kw:["公園","遊び","遊ぶ","子供","広場"],q:"公園"},
  {ic:"🚉",label:"駅",           kw:["駅","電車"],q:"駅"},
  {ic:"🅿️",label:"駐車場",       kw:["駐車","パーキング"],q:"駐車場"},
  {ic:"🏦",label:"銀行・ATM",    kw:["銀行","atm","現金"],q:"ATM"},
];

// ============ 年代ストリップ ============
// この地点の空中写真を、撮られた順に並べる。判定文より先に置く。
//
// ⚠ 並べるだけで、中間の年代については何も書かない（CSS 側の注記に理由）。
// ⚠ 追加の通信はほぼ発生しない。過去の年代は photos() が判定のために既に取得していて、
//   同じURLなので画像はキャッシュから出る。新しく取りに行くのは「現在」の1枚だけ。
// この帯は「表示」ではなく「操作」。押した年代の写真が、その場で大きくなる。
// 別ページへ飛ばさないのは、飛んだ先で場所も文脈も切れるから（実測: 戻り導線は
// ./ で、調べていた場所が消えていた）。時間を動かす体験は、判定と同じ画面で完結させる。
//
// ⚠ 年代ごとの文は1行も書かない。中間の年代に何があったかは、空中写真からは
//   出せないことが実測で分かっている（掟: 画素から出せないことは言わない（実測1） / 掟: 中間を語らない。中間は見せる）。写真を切り替えれば、
//   変化は見た人が読み取る。こちらが言葉にした瞬間、それは判定ではなく作文になる。
let frames=[], eraIdx=0;               // frames[eraIdx] がいま大きく出ている年代
let eraTicked=false;                   // この場所で、年代を動かしたことを数えたか
// URL から復元したい年代（安定したレイヤID）。段が組み上がってから当てる。
// ⚠ コマ番号では復元しない。残っている写真は土地ごとに違うので、
//   同じ番号が別の年代を指す（広島 7 コマ / 豊洲 9 コマ / 出島 4 コマ を実測している）。
let wantEra=null;
// 復元できなかったとき、何を求められていたか。⚠ 黙って既定の年代へ落とさないために持つ
let eraMiss=null;

// 年代の ID を、人が読む名前にする。
// ⚠ 名前の出どころは verify.js の1か所だけ。ここで年代の一覧を作り直さない
//   （掟: 同じ問いに答える実装を2つ持たない）。
const eraLabel=(id)=>id==="swale" ? "明治期"
  : id===Konjaku.LATEST.id ? Konjaku.LATEST.label
  : Konjaku.ERAS.find((e)=>e.id===id)?.label ?? null;

// いま見ているものを URL に載せる。共有先が同じ場所・同じ年代から始まるようにする。
// ⚠ 年代はコマ番号ではなく**安定したレイヤID**で書く（上の理由）。
// ⚠ q と ll しか無い古い URL も、これまでどおり開ける。era は足すだけで、必須にしない。
// ⚠ まだ段が組み上がっていないあいだは、復元したい年代（wantEra）を載せたままにする。
//   ここで落とすと、判定を待っている数百 ms のあいだに共有された URL から年代が消える。
// ⚠ **いま URL に載せる年代**（上の理由で wantEra を残す）。⚠ 組み立てと分ける。
const eraNowId=()=>frames[eraIdx]?.id ?? wantEra;
// ⚠ **URL の形は持たない。**⚠ 組むのは `place-arg.js` の 1 か所（読む側と対）。
function syncUrl(){
  if(!current) return;
  const q=KonjakuPlaceArg.placeQuery(
    {title:current.title,lat:current.lat,lon:current.lon,era:eraNowId()});
  // ⚠ 座標が読めないときは書かない（⚠ NaN を載せた URL を共有させない）
  if(q) history.replaceState(null,"",q);
}

// 判定した画素の位置を「タイルに対する割合」で持つ。
// ⚠ px の絶対値で切り出すと、枠の大きさを変えた瞬間に印が枠の外へ出る。
//   object-position は「画像の X% の点を、枠の X% の位置に置く」という規則なので、
//   印も同じ割合で置けば、枠が何pxでも必ず同じ場所を指す。
//   年代が変わっても同じ座標・同じ z16 タイルなので、この割合は全年代で共通。
const posOf=(fr)=>({x:(fr.px/256*100).toFixed(1),y:(fr.py/256*100).toFixed(1)});

function buildFrames(f){
  const p=f?.byKey?.photos;
  // 読めていない・1枚も残っていないときは、帯ごと出さない。
  // 空の枠を並べるより、何も無いほうが正確（掟: 取れなかったを「無い」と言わない）
  if(!current||!p||!p.ok||!p.value?.length) return [];
  const t=Konjaku.tileOf(current.lon,current.lat,16), L=Konjaku.LATEST;
  // ⚠ いちばん左に明治期を置く。
  //   判定は「旧水部（＝昔は水）」なのに、残っている写真はどれも既に陸で、
  //   **主張と、目の前の写真が噛み合っていなかった**（実測: 豊洲は最古の 1936–42 が既に埋立地）。
  //   明治期の低湿地データを1コマ入れると、判定の根拠がそのまま帯の左端に並ぶ。
  //   ⚠ **判定できたときだけ足す**（整備対象外・通信断のときは足さない）。
  const m=f.byKey.meiji;
  // ⚠ **ここは「どんなコマか」を作るだけ。**⚠ **足すかどうかは下の `hasMeiji` が決める。**
  // ⚠ subBig は写真の上の見出しだけで使う。帯の 1 コマは幅が無く、入れると読めなくなる。
  //   ⚠ 以前は「低湿地データ<br>（空中写真ではありません）」で、⚠ **自分で改行を入れていた**
  //     （任せると 375px で「空中写真ではありま／せん」と語の途中で割れたため。2026-08-16 実測）。
  //   ⚠ **2026-08-25 に短くして、⚠ 字は `words.js` へ移した**（hidetzu/konjaku#176）。
  //     ⚠ **ここに書かない。**⚠ 書くと、⚠ 言い直すたびに 2 か所を直すことになる。
  const meijiFrame = { id:"swale", label:"明治期", sub:"低湿地データ",
    subBig:KonjakuWords.MEIJI_NOT_PHOTO, ext:"png", min:6, max:16,
    // 低湿地は区分の塗りだけなので、下に淡色地図を敷かないと何も見えない
    under:"pale", px:t.px, py:t.py, meiji:true };
  // ⚠ **段の作り方は `public/eras.js` の 1 か所**（hidetzu/konjaku#170）。
  //   ⚠ **落とし方（`unreachable` は残す／404 と白紙は出さない）も、⚠ あちらが持つ。**
  //   ⚠ **並びはこの画面と同じ**（明治期 → 古い順 → 現在）なので、⚠ 反転しない。
  //   ⚠ **右端の「現在」は判定の材料ではない**ので、⚠ ここで組み立てて渡す。
  const steps = KonjakuEras.stepsOf({
    photos: p, meiji: meijiFrame, hasMeiji: !!(m?.ok && m.value),
    latest: { ...L, tile: `${GSI}/${L.id}/16/${t.x}/${t.y}.${L.ext}`, px: t.px, py: t.py } });
  // ⚠ **`unread` の印は、⚠ この画面の見た目の都合**（⚠ `.err` を最初から名乗らせる）。
  //   ⚠ **状態そのものはモデルが持つ**（`state === "unreachable"`）。⚠ **2 か所に持たない。**
  return steps.map((e) => e.state === "unreachable" ? { ...e, unread: true } : e);
}

// 写真の上に置く見出し。
// ⚠ 明治期のコマは空中写真ではない。ここは幅があるので、そう名乗らせる
//   （帯の小さなコマは幅が足りないので label だけ）。
// この場所に残っている空中写真の数を、単位語なしで言う。
// ⚠ **「N 年代（M 年代中）」をやめた理由**は上の strip-foot のコメントにある。
// ⚠ 年は実データ（Konjaku.ERAS）から取る。ここに西暦を書かない。
function photoCountText(past){
  const all=Konjaku.ERAS.length;
  const from=Konjaku.ERAS[0].label.split(/[–-]/)[0];
  const to=Konjaku.ERAS[all-1].label.split(/[–-]/)[0];
  // ⚠ そろっているときに数を 2 回出さない（「7 年代（7 年代中）」が意味を成さなかった）
  // ⚠ **1 行に収める。** 2 行になると本命の行を 20px 押し下げる（実測）。
  //   落とせないのは「この場所に何回ぶん残っているか」と「全部で何回か」（掟1・掟4）。
  if(past>=all) return `昔の写真 <b>${all}回ぶんすべて</b>（${from}〜${to}年）`;
  if(past<=0)   return `昔の写真は <b>残っていません</b>（全${all}回ぶん中）`;
  return `昔の写真 <b>${all}回ぶん中 ${past}回</b>（${from}〜${to}年）`;
}
function bigSub(fr){
  const s=fr.subBig??fr.sub;
  return `${fr.label}${s?`<small>${s}</small>`:""}`;
}

function frameHTML(fr,i){
  const {x,y}=posOf(fr);
  if(!fr.tile){ const t=Konjaku.tileOf(current.lon,current.lat,16);
    fr={...fr,tile:`${GSI}/${fr.id}/16/${t.x}/${t.y}.${fr.ext}`}; }
  const name=`${fr.label}${fr.sub?`（${fr.sub}）`:""}`;
  const under=fr.under?`<img src="${GSI}/${fr.under}/16/${Konjaku.tileOf(current.lon,current.lat,16).x}/${Konjaku.tileOf(current.lon,current.lat,16).y}.png" alt="">`:"";
  // ⚠ **読めていないコマは押せなくする。**押しても大きい絵も出ないので、
  //   押せる見た目のままにすると「押しても何も起きない導線」になる（ADR 0026）。
  //   ⚠ 消すのではなく、押せなくして**枠は残す**。枠ごと消すと年代が飛んで見える。
  if(fr.unread)
    return `<span class="f unread" aria-disabled="true"
        title="${name}は、いま出せません">
      <span class="im err" aria-hidden="true"></span>
      <span class="yr">${fr.label}</span></span>`;
  return `<button class="f${fr.now?" now":""}${fr.meiji?" meiji":""}${i===eraIdx?" on":""}" data-i="${i}"
      aria-pressed="${i===eraIdx}" title="${fr.meiji?`${name}（この判定の根拠になっているデータ）`:`${name}の空中写真を大きく見る`}">
    <!-- ⚠ loading="lazy" は付けない。右端（現在）が画面外から始まる端末で、
         いちばん見せたい1枚だけが永久に読み込まれない -->
    <!-- ⚠ **帯のコマには水域を重ねない。** 明治期のコマは下地（淡色地図）だけを出す。
         重ねると、全面が水だった土地（豊洲）でコマが**青いベタ塗り**になり、
         隣に並ぶ空中写真の中で1つだけ「絵ではないもの」になる。
         水域は、そのコマを選んだときに大きい絵の側で見せる（重ねる操作つき）。
         ⚠ 塗りのタイルは**要求そのものを出さない**。透明にして隠すのではなく作らない
         （掟: 地理院への負荷は自分の請求とは別に見る）。
         ⚠ この画面は同じ絵を出す経路が 3 本ある（帯のコマ・大きい絵・地図）。
           帯だけ扱いが違うので、ERA_ALPHA は通さない。
         ⚠ ここは**テンプレートリテラルの中**。コメントでもバッククォートを書かない
           （書いた瞬間に文字列がそこで終わり、SyntaxError になる。実際にやった） -->
    <span class="im">${under}${fr.under?"":`<img src="${fr.tile}" alt="" fetchpriority="low" decoding="async">`}
      <i class="mk" style="left:${x}%;top:${y}%"></i></span>
    <span class="yr">${fr.label}</span></button>`;
}

// 大きい写真は 2×2 のタイルで組む。
// ⚠ 1枚（z16 ≒ 600m×450m）では狭すぎた。実測で、この範囲に年の分かっているものは
//   豊洲 2件・亀戸 1件・浦安 0件しか無く、「この時点までにできていたもの」が
//   ほとんど空になる。4枚にすると面積が約4倍になり、同時に**拡大ボケも解ける**
//   （素材 512px → 枠 616px で 1.2倍。1枚だと 2.4倍だった）。
let mosaic=null;    // {x0,y0,mx,my} 左上のタイルと、判定した画素のモザイク内座標
function setMosaic(){
  if(!current) { mosaic=null; return; }
  const t=Konjaku.tileOf(current.lon,current.lat,16);
  // 判定した点がなるべく真ん中に来る 2×2 を選ぶ
  const x0=t.px<128?t.x-1:t.x, y0=t.py<128?t.y-1:t.y;
  mosaic={x0,y0,mx:t.px+(t.x-x0)*256,my:t.py+(t.y-y0)*256};
}
const tileUrl=(fr,x,y)=>`${GSI}/${fr.id}/16/${x}/${y}.${fr.ext}`;

// ⚠ **下地を敷いても、上が不透明なら 1 ピクセルも見えない。**
//   明治期のコマは区分の塗りだけなので下に淡色地図を敷いてある（`under:"pale"`）が、
//   塗りを不透明のまま載せていたため、**全面が水だった土地では下地が完全に隠れていた**。
//   実測（2026-08-17 / 375×667 / 豊洲）: 画面の 6 割が青一色になり、
//   初見の 3 人が 3 人ともここに最初に目を奪われ、1 人は「読み込み中かと思った」。
//   透かすと、同じデータのまま豊洲駅・道路・町名が読めて「この一帯が水だった」と分かる。
// ⚠ **この判断は 1 か所に置く。** 同じ絵を出す経路が 2 本ある（静止画のモザイクと、
//   MapLibre の地図）。片方だけ直して届いていなかった事故を 2 回やっている
//   （CLAUDE.md「同じ結果を出す経路が複数あるなら、1 か所にまとめてから直す」）。
// ⚠ 写真の年代（`under` を持たない）は 1 のまま。写真は下に敷くものが無い。
// ⚠ **同じチェックが、コマによって別のものを動かす。**
//   写真の年代 … 写真の上に「明治期の水域」をもう1枚重ねる（swale 層）
//   明治期のコマ … 見えている塗りそのものが明治期の水域なので、**その濃さ**を動かす
//                   （era 層 = swale タイル）。切ると下地の地図だけになる
// ⚠ **状態は1つ。** 「明治期の水域を見ているかどうか」という1つの問いなので、
//   コマをまたいでも引き継ぐ。既定は入（着いた瞬間に水域が見えている）。
//   ⚠ 一度コマごとに別々に覚える形にしたが、**明治期で入にしたのに写真へ移ると切れる**
//     という取り違えを生んだ（2026-08-17 にオーナーが実機で発見）。
//   ⚠ 代償: 写真の年代へ移った瞬間に地図が起き、水域タイルを引く。
//     実測（375×667 / 豊洲 / 全 9 段を順に見る）: 地理院への要求 51 → **93 本**。
//     オーナー判断で許容。⚠ 事前計算へ寄せる案が別途ある。
// ⚠ ERA_ALPHA より前に置く。あとに置くと、初回の描画が宣言前の参照になる
let ovOn=true;
const onMeijiFrame=()=>!!frames[eraIdx]?.under;
// 明治期の塗りを透かす濃さ。**数字はここにしか書かない。**
const MEIJI_ALPHA=0.75;
// ⚠ 明治期のコマでは、この値をチェックで MEIJI_ALPHA ⇄ 0 に動かす（上の ovOn）。
//   他の年代と同じく「重ねる／重ねない」を選べるようにするため。
// ⚠ **帯のコマ（frameHTML）はここを通さない。** あちらは水域を重ねず、下地の地図だけを出す
//   （重ねると、全面が水だった土地でコマが青いベタ塗りになる）。
const ERA_ALPHA=(fr)=>fr?.under?(ovOn?MEIJI_ALPHA:0):1;

function bigLayer(fr,id,on){
  const cells=[[0,0],[1,0],[0,1],[1,1]];
  const draw=(f2,alpha)=>cells.map(([c,r])=>
    f2?`<img class="t" data-c="${c}" data-r="${r}" alt="" fetchpriority="high"
        decoding="async"${alpha<1?` style="opacity:${alpha}"`:""} src="${tileUrl(f2,mosaic.x0+c,mosaic.y0+r)}">`
      :`<img class="t" data-c="${c}" data-r="${r}" alt="">`).join("");
  // 明治期は区分の塗りだけなので、下に淡色地図を敷く（2組み重ねる）
  const under=fr?.under?draw({id:fr.under,ext:"png"},1):"";
  return `<div class="lyr${on?" on":""}" id="${id}">${under}${draw(fr,ERA_ALPHA(fr))}</div>`;
}

// ⚠ **写真は「余り」を取る**（2026-08-25。hidetzu/konjaku#176 の続き）。
//
// ⚠ **定数をやめる。**⚠ 以前は `max-height:calc(100dvh - 31.5rem)` のように、
//   ⚠ **上に積んだものの合計を、⚠ CSS に手で書き写していた。**
//   ⚠ **ビューポート単位と rem の引き算**なので、⚠ 文字を大きくすると引く量だけが増え、
//     ⚠ **写真が 2px まで潰れた。**⚠ しかも上に積むものが変わるたびに測り直していた（⚠ 3 回）。
//
// ⚠ **測って渡す。**⚠ 写真の高さは、⚠ **上に積んだもの**と**下の「重ねる」**で決まる。
//   ⚠ **どちらも写真の高さに依存しない。**⚠ だから 1 回で決まる（⚠ 環にならない）。
//
// ⚠ **JS が動かなくても壊れない。**⚠ CSS 側に既定値を残してある（`var(--big-above, 24rem)`）。
// ⚠ **下限（112px）は CSS が持つ**（⚠ 帰属表示 44 ＋ ＋− 68 の足し算。⚠ ここでは触らない）。
function fitBig(){
  const big=document.querySelector(".verdict > .big");
  if(!big) return;
  const r=big.getBoundingClientRect();
  // ⚠ **文書の上端から測る**（⚠ 初期画面の上端が 0）。⚠ スクロールしていても同じ値になる
  const above=r.top+scrollY;
  const ov=document.getElementById("ovRow");
  let below=0;
  if(ov){
    const o=ov.getBoundingClientRect();
    // ⚠ **すき間 ＋ 行の高さ。**⚠ どちらも写真の高さでは変わらない
    below=(o.top-r.bottom)+o.height;
  }
  document.documentElement.style.setProperty("--big-above", `${Math.round(above+below)}px`);
}

// モザイクを枠いっぱいに置く。判定した点を縦の基準にする（object-fit:cover と同じ考え）
function layoutBig(){
  const big=document.getElementById("big");
  if(!big||!mosaic) return null;
  // ⚠ **枠の高さを先に決めてから、⚠ 中身を置く**（⚠ 逆にすると 1 回ぶん古い高さで置く）
  fitBig();
  const r=big.getBoundingClientRect(), W=r.width, H=r.height;
  const S=W;                                  // モザイク（正方形）の表示辺
  const top=(H-S)*(mosaic.my/512);            // はみ出す縦を、判定点の割合で配る
  const cell=S/2;
  big.querySelectorAll(".lyr .t").forEach((im)=>{
    im.style.width=im.style.height=`${cell}px`;
    im.style.left=`${(+im.dataset.c)*cell}px`;
    im.style.top=`${top+(+im.dataset.r)*cell}px`;
  });
  const mk=big.querySelector(".big-in > .mk");
  if(mk){ mk.style.left=`${mosaic.mx/512*S}px`; mk.style.top=`${top+mosaic.my/512*S}px`; }
  // 数えた範囲を白い枠で出す。⚠ **数字と同じ範囲**でなければ意味がない。
  //   `meiji.area.box` はタイル内の座標。モザイクは 2×2 なので 512 を基準に置き換える。
  //   ⚠ 明治期のコマ以外では出さない。写真の上に出しても、その数字は写真の話ではない。
  const abox=big.querySelector(".areabox");
  if(abox){
    const a=meiji?.area, showing=!!frames[eraIdx]?.under;
    if(a&&showing&&current){
      const t=Konjaku.tileOf(current.lon,current.lat,16);
      const ox=(t.x-mosaic.x0)*256, oy=(t.y-mosaic.y0)*256;
      const [bx,by,bw,bh]=a.box;
      abox.style.display="";
      abox.style.left=`${(ox+bx)/512*S}px`;
      abox.style.top=`${top+(oy+by)/512*S}px`;
      abox.style.width=`${bw/512*S}px`;
      abox.style.height=`${bh/512*S}px`;
    } else abox.style.display="none";
  }
  return { W, H, S, top };
}

// 判定文。⚠ 写真の直下に置く。
// 看板は「この土地は、昔なんだったのか？」なのに、実測でこの一文はスマホの
// y=676（渋谷では 963）にあり、**答えが折り返しの下**だった。
// しかも一覧の件数で位置が 300px 動いていた。写真の次に読むものにする。
function headHTML(){
  // ⚠ **問いを見出しとして出す**（2026-08-20。hidetzu/konjaku#122）。
  //   ⚠ **字は words.js の 1 か所**で、/peel の層見出しと同じもの。
  //   ⚠ 実測（利用者役 4 名・375×667・画面だけを見せた）: 4/4 が「見出しあり」を選び、
  //     ⚠ **見出しが無いと 2 名が「明治期 低湿地データが見出しに見える」**と答えた。
  // ⚠ **答えは 2 行。**⚠ 成因と人工改変を 1 行に混ぜると「もとから埋立地だった」に読める
  //   （ADR 0030 §4-4。⚠ **行の割り方は words.js が決める**）。
  //
  // ⚠ **ここに入れてよいのは 103px まで**（実測 2026-08-20・375×667・hasTouch）。
  //   ⚠ この下に年代のコマ（132px）が積まれ、⚠ **その下の写真が画面から出る**。
  // ⚠ **2026-08-22 に 83px 使っている**（答え 2 行 48px ＋ 補助説明 2 行 35px。ADR 0031）。
  //   ⚠ **足したぶんは写真の上限から出した**（⚠ 当時は `#big` の定数 `31.5rem` を増やした）。
  //   ⚠ **その定数はもう無い**（2026-08-26。hidetzu/konjaku#279）。⚠ いまは `fitBig()` が
  //     ⚠ **実測して `--big-above` に渡す**ので、⚠ ここを増やすと写真が自動で縮む。
  //   ⚠ **ここを増やすたびに写真が縮む。**⚠ 320×640 の余白は、足す前で **0px** だった。
  //   ⚠ 実際にやってしまった: 共有・なぜ（54px）と 2 行の限界を入れたら
  //     ⚠ **写真の下端が 723 になり（画面 667）、画素を数える検査が落ちた。**
  //   ⚠ **共有・なぜは写真の下（actsHTML）。**⚠ ここへ持ってこない。
  const lf = meiji.facts?.byKey?.landform;
  const lines = (lf && lf.ok)
    ? KonjakuWords.ground1Lines(esc(lf.value), lf.artificial ? esc(lf.artificial) : null,
        (v) => `<b>${v}</b>`)
    : [esc(meiji.text ?? "")];
  // ⚠ **区分名の意味を、押さずに読めるようにする**（2026-08-22。hidetzu/konjaku#148）。
  //   ⚠ **字は words.js の 1 か所**（GROUND_GLOSS）。⚠ **ここへ書き写さない。**
  //   ⚠ **原典ではない。**⚠ 原典（landform.json の why）は根拠パネルが出典つきで出す。
  //     ⚠ **そちらを消さない**（掟: 限界と出どころは残す）。
  //   ⚠ **何行目がどの区分名か**は words.js が持つ（ground1Names）。⚠ ここで数えない。
  //   ⚠ 判定できなかったときは区分名が無いので、⚠ **説明の行も置かない**（作らない）。
  const names = (lf && lf.ok)
    ? KonjakuWords.ground1Names(lf.value, lf.artificial ?? null) : [];
  const gloss = (i) => {
    const g = KonjakuWords.groundGloss(names[i] ?? "");
    return g ? `<small class="gl">${esc(g)}</small>` : "";
  };
  return `<div class="gq">${esc(KonjakuWords.layerTitle(1))}</div>
    <div class="v-head">
      ${lines.map((t, i) => `<span class="tx">${t}${gloss(i)}</span>`).join("")}
    </div>
    <!-- ⚠ **ここに「いつの姿かは資料に書かれていません」を置いていた**（2026-08-20 の途中）。
         ⚠ **根拠カード（地形分類）へ移した。**⚠ 出どころの話は、出どころの欄に置く。
         ⚠ **消したのではない。**⚠ 限界は必ず書く（掟）。移した先で出している。
         ⚠ **ここへ戻さない。**⚠ 実測（375×667・hasTouch）: この 1 行（21px）を足すと
           ⚠ **「重ねる」が初期画面から出る**（320×640 で y=677 / 画面 640）。
           ⚠ 見出し・答え・年代のコマ・写真・重ねるが、640px にぎりぎり収まっている。 -->`;
}

// 答えに対する操作（共有する・なぜそう言える？）。
// ⚠ **写真の下に置く**（2026-08-20）。⚠ 答えの真下に置くと 54px を使い、
//   ⚠ **写真の下端が画面から出る**（実測 375×667: 写真 491–723 / 画面 667）。
// ⚠ **答えから離れるのは承知の上。**⚠ 押した結果（共有の知らせ・根拠パネル）は
//   このボタンの隣に出るので、⚠ **押した人には見える**（下の .share-msg のコメント）。
function actsHTML(){
  return `<div class="v-acts">
      <!-- ⚠ ↗ は使わない。利用者役のエージェント3体とも「どこかへ飛ぶ」と予想し、3体とも外れた。
           ↗ は同じ画面で「外部サイトへ出る」の意味でも使っている（一覧のタグ・出典）。
           実際に起きるのは画像の生成なので、絵の記号にする。
           ⚠ title はタッチ端末では一生見えないので、aria-label も置く。 -->
      <button class="why" id="shareBtn" title="この判定を共有する"
        aria-label="この判定を共有する"><i>🖼</i><span>共有する</span></button>
      <!-- ⚠ 吹き出しは、見えている字と揃える（2026-08-20）。⚠ **読み上げは吹き出しを読む**ので、
           ここだけ「根拠を見る」のままだと、⚠ **見える人と聞く人で機能の名前が変わる**。 -->
      <button class="why" id="whyBtn" title="なぜそう言える？"
        aria-expanded="false"><i>?</i><span>なぜそう言える？</span></button>
    </div>
    <!-- ⚠ 押した結果は、押したボタンの隣に出す。
         以前はこの知らせが判定ブロックの末尾にあり、実測でボタン y=744 に対して y=1043、
         **299px 下の画面外**だった。利用者役のエージェント3体とも「押しても何も起きない＝壊れている」と判断し、
         1体は2回押して画像が2枚落ちた（2026-08-14）。 -->
    <div class="share-msg" id="shareMsg" style="display:none"></div>`;
}

// 第2層（昔は、何があった？）。⚠ **答えとは離して、写真の下に置く。**
//
// ⚠ **答えと一緒に先頭へ寄せない**（2026-08-20。hidetzu/konjaku#122）。
//   ⚠ 実測（豊洲・375×667・hasTouch）: 一緒に寄せると明治期は 515 で読めるが、
//     ⚠ **写真の上端が 404 → 647 に落ち、320×640 では画面から出た（673）。**
//   ⚠ **667px に、答え・明治期の割合・写真の 3 つは同時に入らない。**
//     ⚠ **答えと写真を画面内に残す**ほうを採った（Owner 判断）。
function areaBlockHTML(){
  const a=areaHTML();
  return a ? `<div class="gq">${esc(KonjakuWords.layerTitle(2))}</div>${a}` : "";
}

// この範囲の内訳（面）。**凡例と数字を同じ場所で出す。**
//
// ⚠ **点だけを出していたのを改めた。** 浦安は 1 点では「荒地」だが、範囲で数えると
//   荒地 47.9% / 泥地 43.8% / 水 5.9% で一つに言い切れない（2026-08-17 実測）。
//   初見の 3 人に 4 案を見せたところ、**2 人が「素直に割れを出す案」を 1 位**にし、
//   **2 人が「点だけの案」を最下位**にした。「だまされた気分」「軽い嘘に見える」。
//   ⚠ 1 人（数字が苦手な人）は「◯◯が中心」の 1 文を好んだが、**その人自身が
//     「半分以下なのに中心と書いてあるのは気づけなかった。自分では気づけないタイプの誤解」**
//     と言った。気づけない誤解を選ばない。
//
// ⚠ **色を必ず添える。** 3 人が 3 人とも「重ねている絵のピンクが荒地か泥地か分からない」
//   「ふつうの地図の色だと思って流した」と答えた。**凡例が無いと、数字は絵とつながらない。**
//   ここが凡例そのものになる（別に凡例を置くと、また 2 か所になる）。
//
// ⚠ **分母を必ず書く**（掟4）。しかも「204m 四方」ではなく**実際に数えた大きさ**を書く。
//   タイルの縁では窓が切れるので（上野で 186×157m）、切れたぶんを黙って 204 と書かない。
function areaHTML(){
  const a=meiji?.area;
  if(!a||!a.top) return "";
  const swatch=(name)=>{
    const c=KonjakuSwale.SWALE.find((x)=>x.name===name);
    return c?`<i class="sw" style="background:rgb(${c.rgb.join(",")})"></i>`:"";
  };
  const pct=(x)=>`${(x*100).toFixed(1)}%`;
  // ⚠ 何件出すかは「合わせて 95% を超えるまで」。上位 3 件で切ると、
  //   4 件目が 20% ある土地で「残りは何？」に答えられない
  const rows=[]; let acc=0;
  for(const c of a.byName){ rows.push(c); acc+=c.share; if(acc>=0.95) break; }
  // ⚠ **打ち切った残りを黙って落とさない。** 初見の人が「足すと 97.6% で 100 にならない。
  //   残りの 2.4% は何？」と気づいた（2026-08-17）。掟4 に触れる。
  //   → 「その他」として出し、合計が 100% になることを利用者が確かめられるようにする。
  const rest=1-acc;
  const others=a.byName.length-rows.length;
  // 言い方は初見の人の言葉から取った。「混じっていました」が数字より先に意味が入ると評価された
  // ⚠ **西暦を添える。** 3 人が 3 人とも「明治期だけでは、いつなのか分からない」と答えた
  //   （「明治は 40 年以上あるので、いつの話か知りたい」）。
  //   ⚠ **資料の年ではなく、明治という時代の範囲**を書く。低湿地データの原典が
  //     いつ測られたかは、こちらでは特定できない（凡例にも書かれていない）ので、
  //     「1868〜1912年」と時代を書き、資料の年を作らない（掟: 実測でない数字を書かない）。
  const ERA_JP="明治期（1868〜1912年）";
  const lead=a.top.share>=0.7
    ? `${ERA_JP}は、ほとんど <b>${esc(a.top.name)}</b> でした`
    : `${ERA_JP}は <b>${esc(rows[0].name)}</b> と <b>${esc(rows[1]?.name??"")}</b> が混じっていました`;
  const m=a.meters;
  // ⚠ **押すと解説が出る形にする。カーソルオーバにしない。**
  //   スマホでは hover が効かない（この画面は既に「title はタッチ端末では一生見えない」を
  //   踏んでいる）。3 人が 3 人とも「荒地と泥地の違いが分からない」と答えたのは
  //   スマホで見た人たちなので、そこへ届かない出し方を選ばない。
  return `<div class="area" id="area">
    <div class="area-lead">${lead}</div>
    <!-- ⚠ **分母は％のすぐ上。** 一番下に置いていたら、初見の 2 人が
         「％を地図全体の話だと思って読んだ」と答えた（375px では末尾が「1画…」で
         切れて読めてもいなかった）。⚠ 短く書く。長くすると本命の行を押し下げる -->
    <div class="area-where">白い枠の中（${m.w}×${m.h}m）で数えた割合${
      TOPWORD.clipped(a.clipped)}</div>
    <ul class="area-list">${rows.map((c)=>
      `<li><button type="button" class="area-item" data-cls="${esc(c.name)}"
          aria-expanded="false" title="${esc(c.name)}とは？">${swatch(c.name)}<span class="nm">${esc(c.name)}</span><b>${pct(c.share)}</b></button></li>`).join("")}${
      // ⚠ 打ち切った残りを黙って落とさない。何件まとめたかも言う
      rest>0.0005?`<li class="rest"><i class="sw sw-rest"></i><span class="nm">その他${
        others>0?`（${others} 区分）`:""}</span><b>${pct(rest)}</b></li>`:""}</ul>
    <div class="area-why" id="areaWhy" hidden></div>
    <!-- ⚠ **ここにあった「上の「もとは」は別の資料です」の畳みを消した**（2026-08-20。
         hidetzu/konjaku#122）。⚠ **消したのは、問いの見出しがその仕事をするようになったから。**
         ⚠ もともとは、上（第1層・いまの成り立ち）と下（第2層・明治期）が地続きに見えて、
           初見の人が**誤った統合**をした（「泥地＋水で約50%」）ので足した補足だった。
         ⚠ いまは「ここは、どういう土地？」「昔は、何があった？」が見出しとして立っており、
           ⚠ **別の問いだと見出しで分かる。**⚠ その上で補足を残すと、
           ⚠ **どの文を指しているのか分からない中途半端な説明**になる（Owner 判断）。
         ⚠ **限界そのものは消していない。**⚠ 「いつの姿かは書かれていません」は
           ⚠ **第1層の限界**なので、根拠カード（地形分類）へ移した。
         ⚠ 「明治期（1868〜1912年）」は .area-lead が既に名乗っている。 -->
  </div>`;
}

// 区分の解説。⚠ **こちらでは書かない。** 国土地理院の凡例（lw_legend.pdf）の解説文を
//   要約せずそのまま出す（掟3: 断定ではなく引用のときは出典を必ず添え、要約しない）。
//   ⚠ 解説文の出典は凡例に明記されている（地形図図式詳解／広辞苑第四版）。それも一緒に出す。
// ⚠ 押されるまで取りに行かない。初期表示のために 1 本増やす価値は無い。
//   ⚠ 取れなかったときは黙らない。「取れなかった」と言って再試行を出す（掟1）。
let swaleLegend=null, swaleLegendState="none";
async function loadSwaleLegend(){
  if(swaleLegendState==="ok") return swaleLegend;
  swaleLegendState="loading";
  try{
    const r=await fetch("./data/swale-legend.json",{cache:"no-cache"});
    if(!r.ok) throw new Error(String(r.status));
    swaleLegend=await r.json(); swaleLegendState="ok"; return swaleLegend;
  }catch{ swaleLegendState="fail"; return null; }
}
function wireAreaItems(){
  const box=document.getElementById("areaWhy");
  if(!box) return;
  document.querySelectorAll("#area .area-item").forEach((b)=>{
    b.onclick=async()=>{
      const name=b.dataset.cls;
      const open=b.getAttribute("aria-expanded")==="true";
      document.querySelectorAll("#area .area-item").forEach((o)=>o.setAttribute("aria-expanded","false"));
      if(open){ box.hidden=true; box.textContent=""; return; }
      b.setAttribute("aria-expanded","true");
      box.hidden=false;
      box.innerHTML=`<span class="dim">${esc(name)} の説明を読み込んでいます…</span>`;
      const lg=await loadSwaleLegend();
      const c=lg?.classes?.[name];
      if(!c){
        // ⚠ 「説明が無い」と「取れなかった」を混ぜない
        box.innerHTML=swaleLegendState==="fail"
          ? `<span class="warn-tx">説明を、いま読み込めません。</span> <button type="button" class="retry" id="areaWhyRetry">再試行</button>`
          : `<span class="warn-tx">この区分の説明は、凡例に見つかりませんでした。</span>`;
        const rt=document.getElementById("areaWhyRetry");
        if(rt) rt.onclick=()=>{ swaleLegendState="none"; b.setAttribute("aria-expanded","false"); b.click(); };
        return;
      }
      box.innerHTML=`<b>${esc(c.legendName)}</b>${
        c.legendName!==name?`<span class="dim">（この画面では「${esc(name)}」）</span>`:""}
        <div class="area-why-tx">${esc(c.text)}</div>
        <div class="area-why-src">解説文の出典: ${esc(lg.textSource)}／
          <a href="${escUrl(lg.source)}" target="_blank" rel="noopener">${esc(lg.sourceLabel)}</a></div>`;
      // ⚠ **押した結果が見える位置まで運ぶ。** 実測（375×667 / 浦安）で、
      //   押したボタンは y=559 で見えているのに、出た解説は y=650〜812 と
      //   **下端が画面の外**だった。この画面は同じ失敗を既に踏んでいる
      //   （共有の知らせが 299px 下の画面外にあり、3 体とも「壊れている」と判断した）。
      //   ⚠ block:"nearest" にする。center だと、すでに見えているときにも画面が飛ぶ。
      scrollToEl(box,{block:"nearest"});
    };
  });
}

// 判定を待つあいだの画面。出せるものだけ先に出す。
// ⚠ 骨組みは本番と同じ形にする。あとで差し替わるときに画面が飛び跳ねない。
function loadingHTML(){
  if(!current) return `<span class="dim">この土地の成り立ちを判定中…</span>`;
  setMosaic();
  const L=Konjaku.LATEST;
  const now={...L,px:mosaic.mx%256,py:mosaic.my%256};
  // ⚠ **判定後と同じ形にする。** 見出し → 帯 → 写真の順。
  //   違う形にすると、判定が返った瞬間に画面が飛び跳ねる。
  return `<div class="strip-title">現在<small>この土地を調べています…</small></div>
    <div class="strip skel" aria-hidden="true">
      ${"<span class=\"sk\"></span>".repeat(6)}
    </div>
    <div class="big" id="big">
      <div class="big-in" id="bigIn">
        ${bigLayer(now,"lyrA",true)}${bigLayer(null,"lyrB",false)}
        <i class="mk" aria-hidden="true"></i>
        <div id="pins"></div>
      </div>
    </div>
    <div class="v-head"><span class="tx dim">この土地の成り立ちを判定中…</span></div>`
    // ⚠ **判定を待っているあいだも、⚠ 次の体験は出す**（2026-08-21）。
    //   ⚠ 前は行動一覧の 1 行目にあり、⚠ **場所を選んだ瞬間から出ていた。**
    //   ⚠ 判定カードへ移したとき、⚠ **判定が返るまで（実測 約 1.1 秒）消えていた。**
    //     ⚠ 実描画がそれを捕まえた（「場所を選んでも、判定カードに次の体験が出ていない」）。
    //   ⚠ **深掘りは明治期の判定に依存しない**（⚠ 行き先は座標と年代だけ）。⚠ 待つ理由が無い。
    + peelCtaHTML();
}

// URL で指定された年代を、段が組み上がった直後・**描く前**に当てる。
// ⚠ ここでは DOM を触らない（まだ無い）。決めるのは eraIdx と eraMiss だけ。
// ⚠ 指定された年代がこの土地に無いとき、黙って既定へ落とさない。
//   残っている写真は土地ごとに違うので、これは普通に起きる（掟: 取れなかったを「無い」と言わない の同類）。
function resolveWantEra(){
  if(!wantEra) return;
  const want=wantEra; wantEra=null;
  const i=frames.findIndex((x)=>x.id===want);
  if(i>=0){ eraIdx=i; return; }
  // 知らない ID を渡されたら、名前にできないので受け取った文字列のまま見せる。
  // ⚠ 長さは切る。URL には何でも入れられる
  eraMiss=eraLabel(want)??want.slice(0,24);
}

function timeHTML(f){
  frames=buildFrames(f);
  // ⚠ 写真が無くても、判定文は出る。⚠ **答えは renderVerdict が先に描く**ので、
  //   ここは空で返してよい（2026-08-20。以前はここが headHTML を返していた）。
  if(!frames.length) return actsHTML();
  // ⚠ 描く前に当てる。描いたあとで差し替えると、共有先で**既定の年代が一瞬見えてから**
  //   目的の年代に飛ぶ（「戻された」ように見える）。
  resolveWantEra();
  setMosaic();
  const p=f.byKey.photos, cur=frames[eraIdx];
  // ⚠ 明治期は空中写真ではない。混ぜて数えると「空中写真は 8 年代（7 年代中）」という
  //   ありえない数字になる（実測で出た）。写真のコマだけを数える。
  const past=frames.filter((x)=>!x.now&&!x.meiji).length;
  // ⚠ 復元できなかったことは、**年代を選ぶ場所のすぐ上**で言う。
  //   黙って別の年代を出すと、共有した人と見た人が違うものを見ていることに誰も気づかない。
  //   文言に入るのは URL 由来の文字列なので、必ず esc を通す（理由は esc.js）。
  // ⚠ **字は words.js の 1 か所**（2026-08-22。hidetzu/konjaku#169）。⚠ ここで書かない。
  //   ⚠ **esc() はここで通す**（URL 由来の文字列。⚠ words.js は受け取るだけ）。
  return (eraMiss?`<div class="era-miss" id="eraMiss">${
      KonjakuWords.shareMiss.era(esc(eraMiss))}</div>`:"")
    // ⚠ **▶ は帯の中に置く。** 動かす相手は帯（年代）なのに、実測で
    //   **帯の下端から 487px（375px 幅）／650px（PC）**離れたところにあった。
    //   押すものと動くものが離れていると、押しても何が起きたか分からない。
    //   ⚠ 同じ整理を「明治期の土地を重ねる」で既にやっている
    //     （重ねる相手は写真なので、操作も写真と一緒に見えている必要がある）。▶ だけ残っていた。
    //   ⚠ 位置は固定値で決めない。帯の flex に入れる
    //     （CLAUDE.md の落とし穴「固定値で決めたら隣が高くなる場合に重なった」）。
    // ⚠ 帯の**すぐ上**に、独立した行として置く。
    //   ⚠ 帯の中（コマと同じ行）に入れると、コマが縮む。実測 375px: 27→25px / 320px: 21→18px。
    //     コマは既に「小さくて押せるように見えない」「年が書いていない」と指摘が出ている場所で、
    //     そこをさらに小さくする形は選ばない。
    //   ⚠ 「昔」を ▶ に置き換える案も採らない。「昔→今」の向きは、初見の人が
    //     「時間のスライダーだとすぐ分かった。ここは良い」と評価した数少ない要素。
    // ⚠ 年代の札は、**写真の中から出した**（2026-08-17）。
    //   実測（375×667）で、写真の枠 309×232px に対し札が
    //   **現在 169×98px（23%）／明治期 186×113px（29%）**を覆っていた。
    //   写真の 3 割が札で、オーナーが「スマホだと窮屈」と報告した。
    //   ⚠ **同じ id（#yrBig）のまま動かす。** 別の場所に 2 つ目を作ると、
    //     重ねている最中の書き換え（applyMix）と更新経路が 2 本になる（掟3）。
    //   ⚠ 写真の中に残すのは「写真そのものを操るもの」だけ
    //     （🔊・＋−・重ねる）。重ねる相手は写真なので、操作も写真と一緒に見えている必要がある。
    + `<div class="strip-title" id="yrBig">${bigSub(cur)}</div>
    <div class="strip-ops">
      <button type="button" id="playBtn" class="op op-play" title="年代を順に流す"
        aria-label="年代を順に流す">▶</button>
      <span class="strip-ops-tx">年代を順に流す</span>
      <!-- ⚠ 🔊 は**写真の中から出した**（2026-08-17）。理由は 2 つ:
           ・写真の中では左上 x=44、▶ は x=33 で**中心が 11px ずれ**、丸が 2 つ縦に
             並んで揃っていなかった（オーナーが指摘）。写真の中は余白ぶん右へずれる。
           ・ZFold5 のカバー画面（344px）で写真が 278×209px しかなく、
             🔊・＋−・重ねる・国土地理院 が全部載って窮屈だった。
           ⚠ **名前を付けたいが、付けられない。** 判定の下の行（共有する／なぜそう言える？）へ
             入れると 3 つで 373px になり、幅 309px（375 端末）に入らず折り返して、
             本命「立体で見る」が y=1186 → 1237 まで落ちた（上限 1200）。実測で断念。
             代わりに title と aria-label を置く。⚠ 初見の人が読み違えないかは、まだ確かめていない。
           ⚠ 中身は i の中だけ差し替える。button ごと textContent を書くと丸ごと消える。 -->
      <button class="say" id="sayBtn" type="button" title="この判定を読み上げる"
        aria-label="この判定を読み上げる"><i>🔊</i></button>
      <!-- ⚠ 読み上げには「昔 → 今」と読ませる。矢印の記号をそのまま読ませない -->
      <span class="strip-ax" aria-hidden="true">昔<i>→→</i>今</span>
    </div>
    <span class="say-msg" id="sayMsg" style="display:none"></span>
    <div class="strip" id="strip" role="group" aria-label="年代を選ぶ（左が昔、右が今）">
      ${frames.map(frameHTML).join("")}
    </div>
    <div class="big" id="big">
      <div class="big-in" id="bigIn">
        ${bigLayer(cur,"lyrA",true)}${bigLayer(null,"lyrB",false)}
        <i class="mk" aria-hidden="true"></i>
        <!-- 数えた範囲。⚠ 押せる見た目にしない（枠だけ・当たり判定なし）。
             ⚠ **判定後のテンプレートに置く。** 判定中の側に置いても、判定が返った瞬間に
               作り直されて消える（最初そこに置いて、枠が一度も出なかった） -->
        <div class="areabox" aria-hidden="true" style="display:none"></div>
        <div id="pins"></div>
      </div>
      <div class="bl">
        <div class="fx" id="fx"></div>
      </div>
      <button class="unzoom" id="unzoom" type="button">全体に戻す</button>
      <span class="loading" id="bigLoading"></span>
      <div class="map" id="map"></div>
      <div class="zoombar" id="zoombar">
        <button type="button" id="zIn" title="拡大">＋</button>
        <button type="button" id="zOut" title="縮小">−</button>
      </div>
      <!-- ⚠ **中身は空にしておく**（2026-08-20）。⚠ **字は words.js が入れる。**
           ⚠ 直書きしていた頃は、⚠ **状態に関係なく同じ 1 文**だった。 -->
      <span class="big-err" id="bigErr"></span>
    </div>
    <!-- ⚠ **写真の外、すぐ下。** 中に載せていたが、実測（2026-08-17）で
         ZFold5 のカバー画面（344px）だと写真が 278×209px しかなく、
         その上に 🔊・＋−・この行・国土地理院 が全部載って窮屈だった。
         さらに札を外した拍子にこの行が落ちて、**国土地理院の帰属表示に 9×24px 重なった**
         （320px では 33×24px）。出典を隠すのは掟に反する。
         ⚠ **写真から離さない。** 重ねる相手は写真なので、押した結果が同時に見えている必要がある
           （以前は判定文の下にあり、押しても何が変わったか見えなかった）。枠のすぐ下なら見える。 -->
    ${f.byKey.meiji?.ok ? `<label class="ov" id="ovRow">
      <input type="checkbox" id="ovSwale">
      <span>明治期の土地を重ねる<small class="ov-st" id="ovState"></small></span>
    </label>` : ""}`
    // ⚠ **次の体験は、⚠ 答えのすぐ下**（2026-08-21。上の peelLens のコメントを読む）
    + peelCtaHTML()
    + actsHTML()
    // ⚠ 「現在を重ねる」を外した（2026-08-14）。実測 30px。
    //   帯が時間軸なのに、その真下に**2本目の時間の操作**が並んでいた。
    //   ⚠ ▶ は残す。/eras を撤去したときに「前提条件」として移した3機能の1つ
    //   （任意地点クリック判定・明治期の水域を重ねる・▶）。外すと撤去の前提が崩れる。

    // ⚠ 明治期の水域を重ねる操作は、写真の中（.bl）へ移した。ここには置かない。
    //   重ねる相手は写真なので、操作も写真と一緒に見えている必要がある（上の .ov のコメント）。
    // ⚠ 🔊 のプライバシーは footer の .f-priv へ寄せた（同じ主題が2か所にあった）。
    //   ⚠ 「この場所に残っている枚数」は残す。**調べた範囲**の申告で、帯を見ても
    //   分母は分からない。ここを消すと「取れなかった」が言えなくなる（掟1）。
    // ⚠ **「N 年代（M 年代中）」という書き方をやめた**（2026-08-17）。
    //   初見の人が通算 3 人とも「まったく意味が分からない」と答えた:
    //     「7 年代って何？ 70 年代の書き間違い？ カッコの中も同じ数字で、何と何を比べているのか」
    //     「『年代』が 10 年単位のことだと気づくのに時間がかかった」
    //   ⚠ 全部そろうと「7 年代（7 年代中）」と**同じ数字が 2 回**出て、意味を成さなかった。
    //   → 「年代」という単位語をやめ、**そろっているときは数を繰り返さず「すべて」と言う**。
    //     ⚠ 分母（全部で何回あるか）は残す（掟4）。
    //   ⚠ 年は `Konjaku.ERAS` の実データから作る。ここに数字を書かない
    //     （書くと、年代を足したときに嘘になる）。
    // ⚠ **操作説明と、調べた範囲の申告を同居させない。**
    //   同じ行に置いていたら、文言を意味の通るものに直したぶん **1 行増えて**
    //   本命の行を押し下げた（実測 1081 → 1100）。
    //   ⚠ 操作説明（ドラッグ・＋−）は**触れば分かること**なので落とす（原則4「説明より操作」）。
    //     ＋− のボタンは写真の上に出ており、ドラッグは触れば動く。
    //   ⚠ 申告（何回ぶん残っているか）は落とさない。帯を見ても分母は分からない（掟1・掟4）。
    + `<div class="strip-foot">${photoCountText(past)}`
    + (p.state==="partial" ? ` ／ <span class="warn">${p.unread} 年代分は読み込めていません</span>` : "")
    + `</div>`
    + `<div class="ev" id="ev"></div>`;
}

// 年代を選ぶ。写真だけを差し替える（判定文も根拠も、場所の話なので動かさない）
function setEra(i){
  if(!frames.length) return;
  const n=Math.min(Math.max(i,0),frames.length-1);
  if(n===eraIdx) return;
  eraIdx=n;
  // 自分で年代を選び直したなら、「共有された年代が無かった」の案内は役目を終える。
  // ⚠ この案内は timeHTML が描くもので、年代を変えても描き直されない。ここで消す
  if(eraMiss){ eraMiss=null; document.getElementById("eraMiss")?.remove(); }
  // 選んだ年代を URL に載せる。ここを忘れると、共有先で既定の年代に戻る
  syncUrl();
  const fr=frames[eraIdx];
  const big=document.getElementById("big");
  const a=document.getElementById("lyrA"), b=document.getElementById("lyrB");
  // 2枚重ねて入れ替える。切り替わったことが分かる程度の短い重なりだけ置く
  const [show,hide]=a.classList.contains("on")?[b,a]:[a,b];
  // 下地の有無で枚数が変わるので、組み直す（4枚 ⇄ 8枚）
  show.outerHTML=bigLayer(fr,show.id,false);
  const el2=document.getElementById(show.id);
  void el2.offsetWidth;                       // 差し替え直後に .on を付けて、重なりを効かせる
  el2.classList.add("on"); hide.classList.remove("on");
  layoutBig();
  big?.classList.remove("err");
  document.getElementById("yrBig").innerHTML=bigSub(fr);
  syncOverlayRow();
  document.querySelectorAll("#strip .f").forEach((el,j)=>{
    el.classList.toggle("on",j===eraIdx);
    el.setAttribute("aria-pressed",String(j===eraIdx));
  });
  // 年代が変われば「その時点までにできていたもの」も変わる。
  // ここを忘れると、写真は 1936 なのに一覧は現在のまま、という食い違いになる
  // 年代が変わったら、前の年代の読み上げは止める（画面と声が食い違わない）
  stopSay();
  unzoom(); renderEvents();
  mapSetEra(fr);
  // ⚠ **引き継いだ状態を、移った先でも効かせる。** 写真の年代の重ねは MapLibre の層が要るので、
  //   入のまま移ってきたら地図を起こす。ここを忘れると、チェックは入っているのに
  //   何も重なっていない（言葉と画面が食い違う）状態になる。
  if(ovOn&&!onMeijiFrame()&&!mapObj&&!mapLoading) ensureMap().then(()=>applyOverlay());
  else applyOverlay();
  // 重ねたまま年代を動かすと、上に載っている現在しか見えず、何が変わったのか分からない
  mixVal=0; wireMix(); applyMix();
  document.getElementById("mixbar")?.classList.toggle("off",!!fr.now);
  // 「年代を動かしたか」だけを、**この場所につき1回**数える。
  // ⚠ 動かすたびに送っていたら、1人が帯を全部たどるだけで8件書き込んでいた。
  //   知りたいのは「触られたか」なので、1回で足りる。地名も座標も送らない（掟: 地名も座標も送らない）
  if(!eraTicked){ eraTicked=true; KonjakuShare.tick("era.moved"); }
}

// ============ 触ったら地図にする ============
// ⚠ 最初から地図にはしない。地図エンジンは gzip でも 276KB あり、
//   入口の初速を落とす。しかも大半の人は「昔なんだったか」を見て終わる。
//   静止した写真のままでも、その問いには答えられている。
//   動かしたくなった人が触った瞬間に読み込む（読み込み中は画面に出す）。
// ⚠ 読み込めなかったら、写真のまま黙って戻る。地図が出ないだけで、判定は壊さない。
let mapObj=null, mapLoading=null, mapOn=false;
const MAP_HOME=()=>({center:[current.lon,current.lat],zoom:mapZoomForBox()});
// 静止した写真と同じ縮尺で始める（切り替わった瞬間に絵が飛ばないように）。
// 写真は z16 のタイルを 枠幅/2 で描いているので、その縮尺に合う地図のズームを逆算する。
function mapZoomForBox(){
  const g=layoutBig();
  return g ? 16+Math.log2(Math.max(g.W,1)/512) : 16;
}
function loadScript(src){
  return new Promise((res,rej)=>{
    const el=document.createElement("script");
    el.src=src; el.onload=res; el.onerror=()=>rej(new Error(src)); document.head.appendChild(el);
  });
}
function eraSource(fr){
  return { type:"raster", tiles:[`${GSI}/${fr.id}/{z}/{x}/{y}.${fr.ext}`],
    tileSize:256, minzoom:fr.min, maxzoom:fr.max,
    attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' };
}
async function ensureMap(){
  if(mapObj) return mapObj;
  if(mapLoading) return mapLoading;
  const big=document.getElementById("big");
  big?.classList.add("map-loading");
  mapLoading=(async()=>{
    try{
      if(!window.maplibregl){
        const css=document.createElement("link");
        css.rel="stylesheet"; css.href="./vendor/maplibre-gl.css"; document.head.appendChild(css);
        await loadScript("./vendor/maplibre-gl.js");
      }
      const fr=frames[eraIdx];
      const m=new maplibregl.Map({
        container:"map", ...MAP_HOME(),
        style:{version:8,
          sources:{under:eraSource({id:"pale",ext:"png",min:2,max:18}),
            era:eraSource(fr),now:eraSource(Konjaku.LATEST),
            swale:eraSource({id:"swale",ext:"png",min:6,max:16})},
          // 下地（淡色地図）。明治期の低湿地は区分の塗りだけなので、これが無いと何も見えない
          layers:[{id:"under",type:"raster",source:"under",
              paint:{"raster-opacity":fr.under?1:0}},
            // ⚠ 明治期のコマは塗りを透かす（ERA_ALPHA）。不透明のままだと、上で敷いた
            //   下地が 1 ピクセルも見えない。静止画の経路（bigLayer）と同じ判断を使う
            {id:"era",type:"raster",source:"era",paint:{"raster-opacity":ERA_ALPHA(fr)}},
            // 上に「現在」を重ね、濃さで比べる。既定は 0（＝選んだ年代だけ）
            {id:"now",type:"raster",source:"now",paint:{"raster-opacity":mixVal/100}},
            // 明治期の水域。既定は 0（押した人にだけ出す）
            {id:"swale",type:"raster",source:"swale",paint:{"raster-opacity":0}}]},
        attributionControl:{compact:true}, dragRotate:false, pitchWithRotate:false });
      m.touchZoomRotate.disableRotation();
      await new Promise((res)=>m.on("load",res));
      // ⚠ 押した地点を判定し直す。地名の代表点でしか調べられなかったのを、
      //   任意の1点まで下ろす（/eras にしか無かった機能）。
      //   実測で、同じ豊洲でも 500m 離れると標高が 1.91m → 6.49m と変わる。
      m.on("click",(e)=>{ judgeHere(e.lngLat.lng,e.lngLat.lat); });
      // ⚠ 層があることと、水域が画面に出ていることは別。
      //   タイルだけ拒まれても層は残るので、そのままだと「重ねています」と書けてしまう。
      // ⚠ 404 は失敗にしない。低湿地データの整備範囲の外というだけで、重ねる操作の失敗ではない
      //   （画面の端が対象外にかかることは普通にある。ADR 0001 の3状態と同じ切り分け）。
      //   ⚠ 実測（2026-08-16 / MapLibre GL JS v5.24.0）では、**404 でこの error は飛んでこない**。
      //     つまりこの1行は、いまは効いていない。相手の振る舞いが変わったときの備えとして置く
      //     （外して試したが、検査は落ちなかった。効いていないことを承知で残している）。
      m.on("error",(e)=>{
        if(e.sourceId!=="swale"||e.error?.status===404) return;
        swaleFail=true; overlayState();
      });
      m.getCanvas().style.cursor="crosshair";
      mapObj=m; mapOn=true; applyMix(); applyOverlay();
      big?.classList.add("map-on");
      placeMarkers();
      return m;
    }catch{
      // 読み込めなかった。写真のまま続ける（判定は巻き添えにしない）
      return null;
    }finally{
      big?.classList.remove("map-loading"); mapLoading=null;
      // ⚠ 出せたか出せなかったかを、重ねる操作の脇に反映する。
      //   ここを忘れると「地図を読み込んでいます…」のまま止まり、失敗が読み込み中に見える
      overlayState();
    }
  })();
  return mapLoading;
}
// 地図側の印。押すと一覧と同じように寄る
let markers=[];
function placeMarkers(){
  if(!mapObj) return;
  markers.forEach((mk)=>mk.remove()); markers=[];
  evShown.forEach((x,i)=>{
    const el=document.createElement("i"); el.className="pin";
    // ⚠ 静止画の印（renderPins）と同じ data-i を付ける。付け忘れていたので、
    //   押したものを強調する側が地図の印を一度も見つけられず、
    //   実測で markerCount 9 に対し onCount 0 だった（利用者役のエージェント3体とも「どの点？」）
    el.dataset.i=i;
    el.title=`${yearLabel(x)} ${x.label}`;
    el.onclick=(e)=>{ e.stopPropagation(); focusOn(x,i); };
    markers.push(new maplibregl.Marker({element:el}).setLngLat([x.lon,x.lat]).addTo(mapObj));
  });
  // 判定した地点そのもの
  const c=document.createElement("i"); c.className="mk";
  markers.push(new maplibregl.Marker({element:c}).setLngLat([current.lon,current.lat]).addTo(mapObj));
}
function mapSetEra(fr){
  if(!mapObj) return;
  // 下地は、明治期のコマのときだけ見せる
  if(mapObj.getLayer("under"))
    mapObj.setPaintProperty("under","raster-opacity",fr.under?1:0);
  // ⚠ 下地を出すだけでは足りない。上の塗りも透かす（静止画の経路と同じ ERA_ALPHA）
  if(mapObj.getLayer("era"))
    mapObj.setPaintProperty("era","raster-opacity",ERA_ALPHA(fr));
  const src=mapObj.getSource("era");
  if(src?.setTiles) src.setTiles([`${GSI}/${fr.id}/{z}/{x}/{y}.${fr.ext}`]);
  else { mapObj.removeLayer("era"); mapObj.removeSource("era");
    mapObj.addSource("era",eraSource(fr)); mapObj.addLayer({id:"era",type:"raster",source:"era"}); }
}
function dropMap(){
  markers.forEach((mk)=>mk.remove()); markers=[];
  if(mapObj){ mapObj.remove(); mapObj=null; }
  mapOn=false; swaleFail=false;                    // 別の土地へ移る。前の拒否を持ち越さない
  document.getElementById("big")?.classList.remove("map-on","map-loading");
}

// 年代を順に流す。
// ⚠ 在庫を無視して回さない（/eras で同じ事故を起こしている。写真の無い年代を
//   「1945–50年」と言い切ったまま地図だけ出していた）。ここは frames にある年代しか回らない。
// ⚠ 自動では始めない。押した人にだけ動かす。
let playTimer=null;
function stopPlay(){
  clearInterval(playTimer); playTimer=null;
  const b=document.getElementById("playBtn");
  if(b){ b.textContent="▶"; b.classList.remove("on"); b.title="年代を順に流す"; }
}
function wirePlay(){
  const b=document.getElementById("playBtn");
  if(!b) return;
  b.onclick=()=>{
    if(playTimer) return stopPlay();
    if(frames.length<2) return;
    b.textContent="❚❚"; b.classList.add("on"); b.title="止める";
    setEra(0);
    playTimer=setInterval(()=>{
      if(eraIdx>=frames.length-1) return stopPlay();   // 最後まで来たら止める
      setEra(eraIdx+1);
    },1300);
  };
}

// 明治期の水域を、いま見ている写真の上に重ねる。
// ⚠ 判定の裏取りとして、利用者役のエージェントが「いちばん効く」と評価した機能。
//   判定文が「明治期には 河川・湖沼・海面」と言っているものが、**面として**見える。
// ⚠ 土地条件図は重ねない。凡例が機械可読でないため（掟: 説明できない色は重ねない）、出した色を説明できない。
//   説明できない色を画面に置くのは、この画面の他の部分と格が揃わない。
function applyOverlay(){
  const on=document.getElementById("ovSwale")?.checked;
  ovOn=!!on;
  if(onMeijiFrame()){
    // 地図の経路
    if(mapObj?.getLayer("era"))
      mapObj.setPaintProperty("era","raster-opacity",ERA_ALPHA(frames[eraIdx]));
    // 静止画の経路。⚠ ここを忘れると、地図を起こす前は押しても絵が変わらない
    document.querySelectorAll("#big .lyr.on img").forEach((im)=>{
      if(/\/swale\//.test(im.src)) im.style.opacity=String(ERA_ALPHA(frames[eraIdx]));
    });
  }else{
    if(mapObj?.getLayer("swale"))
      mapObj.setPaintProperty("swale","raster-opacity",on?0.75:0);
  }
  overlayState();
}
// **取れなかったときだけ**、言葉で出す。
// ⚠ チェックが入っていることと、画面に重なっていることは別。地図が出せていないのに
//   黙っていると、「重ねているつもりで何も重なっていない」状態が見分けられない。
// ⚠ 以前は正常時も実況していた（「ONで地図に重ねます」「重ねています」）。
//   ラベルと合わせて2行になり、写真の上で読む量が増えるためやめた（2026-08-17 オーナー判断）。
//   ⚠ そのとき一緒に失われたものがある: **切っているときの「押すと静止画が地図に変わる」の予告**。
//     写真の年代では、いまも押すと地図に変わる。必要なら別の形で戻す。
// ⚠ どの文も1行に収める。写真の上に置いているので、折り返したぶんだけ写真が隠れる
//   （実測 2026-08-16 / 320×640: 折り返すと 61px ＝ 写真の高さの 32% を覆った）。
//   ⚠ **この約束は、長いあいだ 320px で破れていた**（2026-08-17 に実測して気づいた）。
//     「水域を読み込めませんでした」も「地図を読み込めませんでした」も 320×640 で 2 行になり、
//     札が 44px → 58px に膨らんでいた。検査は 1 件も落ちていなかった。
//     → 「〜ませんでした」を「〜ません」に詰めて 1 行に収めた。実測で確かめること。
// 水域のタイルを取りに行って拒まれた（404 以外）。地図は出ているのに、水域は出ていない状態
let swaleFail=false;
function overlayState(){
  const c=document.getElementById("ovSwale"), el=document.getElementById("ovState");
  if(!c||!el) return;
  // ⚠ **正常なときは何も言わない。** 入っているかどうかはチェックの形が示している。
  //   以前は常時「ONで地図に重ねます」／「重ねています」と書いていたが、
  //   ラベルと合わせて 2 行になり、写真の上で読む量が増えていた（2026-08-17 オーナー判断）。
  //   ⚠ **消したのは「正常時の実況」だけ。** 取れなかったことは、ここでしか言えない
  //     （掟: 取れなかったことを「無い」と言わない）。チェックだけ残すと、
  //     水域が取れていないのに入ったままになり、「重ねているつもりで何も重なっていない」
  //     状態を見分けられなくなる。
  //   ⚠ 空にすると高さ 0 になる（実測: 15px → 0px）。札は 44px のままで、写真は広がらない。
  // ⚠ 明治期のコマは、地図（MapLibre）を起こさなくても重なっている。
  //   静止画のモザイクが「淡色地図＋透かした塗り」の 2 枚組だから。
  //   ここで地図の有無を見ると、重なって**見えている**のに
  //   「地図を読み込めませんでした」と書くことになる。
  if(onMeijiFrame()||!c.checked){ el.textContent=""; return; }
  if(swaleFail) el.textContent="明治期を読み込めません";
  else if(mapObj?.getLayer("swale")) el.textContent="";
  else el.textContent=mapLoading?"地図を読み込み中…":"地図を読み込めません";
}
// ⚠ **明治期のコマでも出す。** 以前は隠していた。当時の理由は
//   「重ねる相手（空中写真）が無い／入り切りしても絵が変わらない」で、当時は正しかった。
//   いまは**相手がある**（下に敷いてある淡色地図）。塗りを透かしたので、
//   入り切りすると絵が本当に変わる（掟: 押しても何も起きない導線を置かない、を満たす）。
// ⚠ チェックは「いま重なっているか」そのものを映す。状態は1つなので、
//   コマが変わっても選んだままを引き継ぐ。
function syncOverlayRow(){
  const c=document.getElementById("ovSwale");
  if(c) c.checked=ovOn;
  overlayState();
}
function wireOverlay(){
  const c=document.getElementById("ovSwale");
  if(!c) return;
  syncOverlayRow();      // ⚠ 中で overlayState() を呼ぶ
  // ⚠ 写真の上に置いた操作なので、写真側の「押したら寄りを解除」に飲まれないようにする。
  //   地図を起こす pointerdown（wake）は通す。押した人は地図を見たいので、そのまま起きてよい。
  document.getElementById("ovRow")?.addEventListener("click",(e)=>e.stopPropagation());
  c.onchange=async()=>{
    // 入れ直しは、やり直し。前に拒まれたことを引きずらない
    if(c.checked) swaleFail=false;
    // ⚠ **明治期のコマでは、地図の完成を待たない。** 静止画のモザイクが既に
    //   「淡色地図＋透かした塗り」の 2 枚組なので、そのまま濃さを変えれば絵は変わる。
    //   待つと、押してから地図が出るまで（実測 24 タイル）絵が変わらない。
    // ⚠ **ただし地図は起きる。** 写真の枠の pointerdown が地図を起こす既存の仕掛けがあり、
    //   この行を押しても通る（実測 2026-08-17: チェックを押す＝24 本／写真を 1 回タップ＝24 本。
    //   どちらも同じ）。ここで止めていないので「起こさない」とは書かない。
    //   起こさない形にするかは別の判断（掟: 地理院への負荷は自分の請求とは別に見る）。
    // ⚠ 先に読み込みを始めてから状態を出す。順を逆にすると、まだ始めていない時点で
    //   「読み込めませんでした」と書くことになる（読み込み中と失敗を取り違える）。
    if(!onMeijiFrame()&&!mapObj&&!mapLoading){ const p=ensureMap(); overlayState(); await p; }
    applyOverlay();
  };
}

// 現在を重ねる。
// ⚠ 別ページ（/eras）でやっていたことを、判定と同じ画面に持ってくる。
//   あちらは2枚の地図を左右に切って擦る仕掛けだったが、地図が1枚あれば
//   「重ねて濃さを変える」はラスタをもう1枚足すだけで足りる。
//   左右に擦る（スワイプ）は地図が2枚要るので、ここでは作らない。
//   まずこの形で置いて、物足りなければそのとき足す。
let mixVal=0;
function applyMix(){
  const el=document.getElementById("mixv");
  if(el) el.textContent=`${mixVal}%`;
  // ⚠ 重ねているあいだは、見えている絵が「その年代の写真」ではない。
  //   100% にすると現在の写真が全面に出るのに、ラベルも読み上げも
  //   「1936–42年の空中写真です」と名乗っていた（実測。映っているのは現在の豊洲）。
  //   年代を動かしたときは mixVal=0 に戻すので守られていたが、逆順だけ抜けていた。
  const yb=document.getElementById("yrBig");
  if(yb&&frames[eraIdx]){
    const fr=frames[eraIdx];
    yb.innerHTML=mixVal>0
      ? `${fr.label}<small>現在を ${mixVal}% 重ねています</small>`
      : bigSub(fr);
  }
  if(!mapObj||!mapObj.getLayer("now")) return;
  mapObj.setPaintProperty("now","raster-opacity",mixVal/100);
}
function wireMix(){
  const r=document.getElementById("mix");
  if(!r) return;
  r.value=String(mixVal);
  r.oninput=async()=>{
    mixVal=Number(r.value); applyMix();
    // 重ねるには地図が要る。触った時点で読み込む（ドラッグ・ホイールと同じ）
    if(!mapObj&&!mapLoading){ await ensureMap(); applyMix(); }
  };
}

// ============ この写真の範囲に、その時点までにできていたもの ============
// ⚠ 「その年のニュース」ではない。**主張が違う**。
//   ニュースは「その年に起きたこと」で、この土地の話とは限らないうえ、
//   点座標に置くと「ここで起きた」と読める（実測: 豊洲の最古は「1942 東京空襲」だった）。
//   ここで言うのは「**開業年 ≤ 撮影年なら、撮影時に存在していた**」だけ。
//   推論ではなく含意なので、年と座標が正しければ必ず正しい。
// ⚠ 「写っている」とは言わない。範囲に**ある**とだけ言う。
//   小さい建物や木の陰は、写真からは確認できない。確認できるのは座標と年だけ。
let evState=null;          // null=未取得 / {loading} / {state, items}
// ⚠ 一覧と印は、**同じ配列**から作る。
//   別々に絞って並べていたため、一覧は新しい順・印は古い順になり、
//   「一覧の1行目」と「印の1つ目」が別のものを指していた（実測で中心がずれた）。
let evShown=[];
// ⚠ **一覧を畳んでいるか**（2026-08-21。hidetzu/konjaku#141）。
//   ⚠ 実測（375×667・hasTouch・SW 無効・`main` = `9982680`）: 一覧の高さは
//     ⚠ **豊洲 0 行 / 軽井沢 2 行 / 札幌 6 行 / 上野 8 行**で、
//     ⚠ `ev` 全体が **54px と 671px**（12.4 倍）になっていた。
//   ⚠ **減らすのではなく畳む。**⚠ 字は 1 つも消さない（Owner 判断 2026-08-21）。
//   ⚠ **地図の印は畳まない**（`evShown` は今までどおり上限ぶん）。
//     ⚠ 印を減らすと地図の見え方が変わる。⚠ かわりに、⚠ **隠れている行の印を
//       押したら先に開く**（下の focusOn）。⚠ これをやらないと、
//       ⚠ **印を押しても一覧が光らない**（同じ取りこぼしを 2 回やっている）。
let evOpen=false;
// ⚠ 畳んでいるときに出す行数。⚠ **上限（RANK）とは別のもの**
const EV_MIN=3;
// ⚠ **いま一覧に出している行**。⚠ **ここが唯一の持ち主**。
//   ⚠ 一覧の描画と読み上げの両方が呼ぶ。⚠ **式を 2 か所に書くと、片方だけ古くなる**
//   （掟: 同じ問いに答える実装を 2 つ持たない）。
const evVis=()=>evOpen?evShown:evShown.slice(0,EV_MIN);
let evTile=null, zoomOn=false;

async function loadEvents(){
  if(!current||!frames.length) return;
  if(!mosaic) setMosaic();
  const box={...mosaic};
  evTile=box;
  evState={loading:true}; renderEvents();
  const r=await KonjakuEvents.around(16,box);
  // 別の場所に移っていたら捨てる
  if(!current||!mosaic||mosaic.x0!==box.x0||mosaic.y0!==box.y0) return;
  // ⚠ 索引が読めなかったときだけ数える。静的が壊れると全PVが実行時 Wikidata に
  //   流れるが、それに気づく手段が無かった。毎回送ると /t が1件増えて天井が下がるので、
  //   **壊れたときだけ**言う（正常時の /t は 2件のまま）
  if(r.idxBroken) KonjakuShare.events("fail");
  evState=r; renderEvents();
}

// ⚠ 年は「点」とは限らない。Wikidata には「1950年代」「20世紀」しか無い項目がある。
//   幅の広い記録を年として扱うと、1985年築のものが「1936年に在った」と出る（実測）。
//   幅の**終わり**を使って、言い切れるときだけ「あった」と言う。
const yspan=(x)=>x.precision==="century"?99:x.precision==="decade"?9:0;
// ある年代のコマで出るものを返す。
// ⚠ 描画と「次の一歩の行き先」の両方がここを使う。2か所に書くと、
//   押した先が空になる（＝押しても何も起きない一歩）ことに気づけない。
function hitsAt(i,all){
  const f=frames[i]; if(!f||f.meiji) return [];
  const year=KonjakuEvents.yearOf(f.label);
  const prev=i>0 ? KonjakuEvents.yearOf(frames[i-1]?.label) : null;
  if(year==null) return [];
  // ⚠ **最初の年代と差分で、同じ判定を使う。**
  //   以前は最初の年代だけ幅の終端（+yspan）を見て、差分は開始年だけを見ていた。
  //   そのため「1970年代」（1970〜1979 のどこか）が **1974–78 までにできた**ものとして
  //   出ていた。1979年の記録かもしれないので、そこまでは言い切れない
  //   （掟: 推定を実測のように見せない）。幅の終端が入ったコマで初めて出す。
  //   → 消えるのではなく、言い切れる年代（1979–83）へ後ろにずれる。
  // ⚠ **「無くなった」側（until）には yspan を当てない。** precision は year（開始年）の
  //   精度であって、until の精度ではない。実データにその例がある:
  //   白髪橋 p=century y=[1600,1919]。1919 は年精度の値で、ここに 99年幅を当てると
  //   **データに無い精度を作る**ことになる。
  const done=(x)=>x.year+yspan(x);
  return prev==null
    ? all.filter((x)=>done(x)<=year&&(x.until==null||x.until>=year))
        .map((x)=>({...x,kind:"あった"}))
    : [...all.filter((x)=>done(x)>prev&&done(x)<=year).map((x)=>({...x,kind:"できた"})),
       // ⚠ 無くなったものも出す。実測で「へぇ」と言われたのは、消えたもののほうだった
       ...all.filter((x)=>x.until!=null&&x.until>prev&&x.until<=year)
             .map((x)=>({...x,kind:"無くなった"}))];
}

function renderEvents(){
  const el=document.getElementById("ev");
  if(!el||!frames.length) return;
  // ⚠ 一覧を作り直すと、押していたものの番号は前の年代のものになる。
  //   強調も、寄せた先に残した名前も、ここで落とす。
  //   残すと、いま画面に無いものの名前が写真の上に出たままになる。
  clearFocus();
  // ⚠ 明治期のコマには「年」が無い（低湿地データは年を持たない）。
  //   ここで無理に年を当てると、持っていない精度を演出することになる（掟: 中間を語らない。中間は見せる）。
  if(frames[eraIdx]?.meiji){
    // ⚠ ここは着いたときに必ず通る（帯の既定は最古＝明治期）。
    //   つまり **初めて来た人が最初に見る事物の枠は、必ずこの注記**だった。
    //   実測（UI/UX・2026-08-14）: 30秒のあいだ「このころ何があった？」が
    //   一度も画面に現れていなかった。説明だけを 51px 置いて、次の一歩が無い。
    //   → 同じ高さのまま、押せる一歩にする。写真のある最古の年代へ送る。
    //   ⚠ 年を当てない、という判断は変えていない。
    // ⚠ **「年がありません」の断りは、⚠ 深掘りのつまみの下へ移した**（2026-08-28。hidetzu/konjaku#142）。
    //   ⚠ **利用者役 4/4 が「要るのは年代を切りかえるとき。⚠ 開いた直後ではない」と答えた**
    //     （⚠ 実在の利用者ではない。`CLAUDE.md` §4-1）。⚠ **Owner 判断で寄せた。**
    //   ⚠ **一歩そのものは残す。**⚠ **消すと 2026-08-14 の直しが戻る**
    //     （⚠ 説明だけを置いて次の一歩が無く、⚠ 30 秒くらべる操作に届かなかった）。
    //   ⚠ **行き先が無いときは、⚠ 下の `step<0` の断りが残る**（⚠ 代わりに出せる一歩が無いため）。
    // ⚠ 行き先は「写真のある最初の年代」ではなく「**中身のある最初の年代**」。
    //   最初の年代へ送っても、そこが空なら「押しても何も起きない一歩」になる
    //   （実測: 豊洲の 1936–42 は 0 件。埋立前なので当然）。
    // ⚠ **だから「写真で見られるのは」と書いてはいけない**（2026-08-28。⚠ 実際に書いて直した）。
    //   ⚠ **写真は 1936–42 からある。**⚠ 行き先の 1961–69 は「⚠ 中身がある最初の年代」。
    //   ⚠ **利用者役 2/3 が「1936 と 1961 のどちらが本当か分からない」と答えた**
    //     （⚠ 実在の利用者ではない）。⚠ **画面の別の場所と食い違う字を書いていた。**
    //   ⚠ **一覧の見出し（`この範囲にあったもの`）と同じ言葉で言う**（⚠ 押した先と一致する）。
    const all0=evState?.items??[];
    let step=-1;
    if(!evState?.loading&&evState?.state!=="unreachable")
      for(let i=0;i<frames.length;i++)
        if(!frames[i].meiji&&hitsAt(i,all0).length){ step=i; break; }
    // 注記そのものを押せるようにする。要素を足すと高さが増える
    //   （実測: ボタンを足したら 51px → 95px になり、折り返しの下へ出た）
    el.innerHTML= step<0
      ? `<div class="ev-note">明治期の低湿地データには年がありません。
          年でくらべられるのは、写真のある年代からです。</div>`
      : `<button class="ev-note step" id="evStep">この範囲にあったものが出るのは
          <b>${frames[step].label}</b> から<span class="go">→</span></button>`;
    const b=document.getElementById("evStep");
    if(b) b.onclick=()=>setEra(step);
    evShown=[]; renderPins([]); placeMarkers(); return; }
  const year=KonjakuEvents.yearOf(frames[eraIdx]?.label);
  const nowSel=!!frames[eraIdx]?.now;
  if(!evState){ el.innerHTML=""; return; }
  if(evState.loading){
    el.innerHTML=`<div class="ev-note">この範囲にあるものを調べています…</div>`; return; }
  if(evState.state==="unreachable"){
    // 取れなかったことを「無い」と言わない（掟: 取れなかったを「無い」と言わない）
    el.innerHTML=`<div class="ev-note warn">Wikidata を読み込めませんでした。
      <b>この範囲に何があるかは分かっていません。</b>
      <button class="retry" id="evRetry">再試行</button></div>`;
    document.getElementById("evRetry").onclick=loadEvents; return; }
  const all=evState.items??[];
  // ⚠ 目録ではなく**差分**を出す。
  //   「その時点までにあるもの」を並べると、密な土地では上位が古いもので埋まり、
  //   年代を動かしても中身が変わらない（実測: 清澄白河・渋谷は8段すべて同一だった）。
  //   しかも動かない対象に年号を付けても、時間の話にならない
  //   （1947年の小学校は、1961年の写真にも現在の写真にも同じ形で写っている）。
  //   帯を動かすたびに必ず何かが変わり、**変わったものだけが名前を持つ**形にする。
  const prev=eraIdx>0 ? KonjakuEvents.yearOf(frames[eraIdx-1]?.label) : null;
  const base=(prev==null);          // いちばん古い年代だけは、そこまでの積み上げを出す
  // ⚠ 年は「点」とは限らない。Wikidata には「1950年代」「20世紀」しか無い項目がある。
  //   幅の広い記録を年として扱うと、1985年築のものが「1936年に在った」と出る（実測）。
  //   幅の**終わり**を使って、言い切れるときだけ「あった」と言う。
  const hit=hitsAt(eraIdx,all);
  // ⚠ 新しい順に8件で切ると、大事なものが黙って落ちる。
  //   実測（渋谷・現在）: 19件中8件しか出ず、渋谷ヒカリエ・スクランブルスクエア・
  //   QFRONT・「五島プラネタリウムが2001年に無くなった」が、**何の表示も無く消えていた**。
  //   代わりに美容室と、同じ公園の重複2行が上に来ていた。
  //   → 「無くなったもの」を先に置く。実測で当たり率がいちばん高いのはこれ（52コマ回して3件、
  //     3件とも「へぇ」だった）。そのうえで新しい順。
  const RANK=8;
  hit.sort((a,b)=>{
    if((a.kind==="無くなった")!==(b.kind==="無くなった")) return a.kind==="無くなった"?-1:1;
    return (b.kind==="無くなった"?b.until:b.year)-(a.kind==="無くなった"?a.until:a.year);
  });
  evShown=hit.slice(0,RANK);
  // ⚠ **一覧に出すぶん**。⚠ 畳んでいるときは先頭 EV_MIN 行だけ。
  //   ⚠ `evShown` はそのまま（地図の印・読み上げの持ち主）。
  const vis=evVis();
  // ⚠ 「ほかに N 件」の N は、⚠ **いま出していない件数**。
  //   ⚠ 畳んでいるあいだは、⚠ **上限で切ったぶんと、畳んで隠したぶんの両方**が入る。
  const rest=hit.length-vis.length;
  // 見出しは「いつからいつまでの話か」。差分なので、期間を名乗らないと意味が決まらない
  const span=base ? `${nowSel?"いま":`${year}年`}まで`
    : `${frames[eraIdx-1].label} → ${nowSel?"いま":frames[eraIdx].label}`;
  if(!hit.length){
    // ⚠ **「変化が無かった」と読ませない**（2026-08-20）。⚠ こちらが持っている
    //   記録の話であって、⚠ **現実に何も起きなかったという意味ではない**（掟の一行目）。
    el.innerHTML=`<div class="ev-note">${span}のあいだに、この期間に表示できる変化の記録は見つかっていません${
      all.length?`（この範囲の記録は ${all.length} 件）`:""}。</div>`;
    evShown=[]; renderPins([]); placeMarkers(); return; }
  el.innerHTML=`<div class="ev-h">${base
      ? `${span}に、この範囲にあったもの`
      : `${span} のあいだに変わったもの`}
      <span class="ev-n">${hit.length}件</span></div>
      <div class="ev-tip">行を押すと、地図でその場所が光ります</div>`
    // ⚠ 名前・説明・出典URL は Wikidata（誰でも編集できる CC0 の第三者データ）。
    //   実測（同じラベルが 8 行並んだ状態）では、ここが 8 回発火していた。
    //   出典URLは scheme も見る。esc だけでは href="javascript:…" は塞げない。
    //   http/https でなければリンクそのものを出さない（掟: 押しても何も起きない導線を置かない）。
    + vis.map((x,i)=>{
        const label=yearLabel(x);
        const d=evDesc(x.note,x.label);
        const gone=x.kind==="無くなった";
        const src=escUrl(x.url);
        return `<div class="ev-row${gone?" gone":""}">
          <button class="ev-it" data-i="${i}">
            <span class="ev-y">${esc(label)}</span><span class="ev-l">${esc(x.label)}</span>
            ${gone?`<span class="ev-k">無くなった</span>`:""}
            ${d?`<span class="ev-d">${esc(d)}</span>`:""}</button>
          ${src?`<a class="ev-u" href="${src}" target="_blank" rel="noopener"
            title="この項目の出典">↗</a>`:""}</div>`;
      }).join("")
    // ⚠ **開く操作に、新しい字を足さない**（2026-08-21。hidetzu/konjaku#141）。
    //   ⚠ この行そのものを押せるようにする。⚠ **要素を足すと高さが増える**
    //     （⚠ この画面は同じ理由で、⚠ 注記そのものを押せるようにしたことがある。
    //       ⚠ 実測: ボタンを足したら 51px → 95px になった）。
    //   ⚠ **上限まで開いたら、押せる見た目をやめる**（ADR 0026）。
    + (rest>0 ? (evShown.length>vis.length
        ? `<button class="ev-more step" id="evMore">ほかに ${rest} 件（新しいものから ${
            vis.length} 件だけ出しています）<span class="go">→</span></button>`
        : `<div class="ev-more">ほかに ${rest} 件（新しいものから ${vis.length} 件だけ出しています）</div>`) : "")
    + (evState.truncated ? `<div class="ev-note warn" style="margin-top:6px">
        <b>この範囲は記録が多く、取りきれていない可能性があります。</b>
        ここに出ていないものがあるかもしれません。</div>` : "")
    // ⚠ 説明が出ない行について、「説明が無い」と読ませない。説明はある。
    //   地名と、名前でもう分かる部分を落とした結果、残らなかっただけ（実測 29.6%）。
    //   ここを書かないと「この項目には説明が無いのだ」という誤った推論を誘う
    //   （掟: 取れなかったことを「無い」と言わない、の裏返し）。
    + `<div class="ev-src">出典 <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>（CC0）。
      説明は Wikidata の一行説明から、<b>地名と、名前でもう分かる部分</b>を機械的に落として出しています。
      落とすと何も残らない項目には出ません。全文は各行の ↗ から。
      <b>年が記録されているものだけ</b>です。${
        evState.at?`この範囲を調べたのは <b>${evState.at}</b> です。`:""}年代に幅があるとき（1936–42 など）は
      <b>先頭の年</b>で区切っているので、記録があっても出ない年があります。
      写真に写っているかどうかまでは確かめていません。</div>`;
  // ⚠ 押したら開く。⚠ **開いたあとは押せる見た目をやめる**（上の分岐で div になる）
  const more=document.getElementById("evMore");
  if(more) more.onclick=()=>{ evOpen=true; renderEvents(); };
  const shown=evShown;
  el.querySelectorAll(".ev-it").forEach((b)=>{
    b.onclick=()=>focusOn(shown[+b.dataset.i],+b.dataset.i);
  });
  renderPins(shown); placeMarkers();
}

// ⚠ 説明（Wikidata の日本語の一行説明）から、**この画面では自明なもの**を落とす。
//   ここでやる理由: 取り込み側でやると、取り込み済みの土地と実行時に問い合わせる土地で
//   答えが変わる（掟: 同じ問いに答える実装を2つ持たない）。生のまま配って、描くときに落とす。
//
//   実測（2026-08-15・分母＝日本語の説明がある 2,225 / 2,367 件）:
//     「〈行政区画〉にある／に所在する」で始まる … 66.9%（規則で落とせたのは 90.0%）
//     頭から「…」で切ると本題が消える            … 66.2%
//     落とした残りが名前に既出（読んでも増えない）… 29.6%
//     結果、説明が出る行 70.4% / 空になる行 29.6%
//
//   ⚠ 前置きの語は「行政区画の接尾辞で終わること」を必須にしてある。
//     これを外して `[^、。]{0,14}?にある` にすると
//     「**広島原爆の爆心地にある**慰霊碑」まで落ちる。
//   ⚠ 「かつて」は捕まえて先頭に戻す。落とすと
//     「かつて仙台市にあった貨物駅」が**いまある駅**になる。
//   ⚠ `[^、。の]` で「の」を禁じているのは
//     「仙台市**の榴岡公園**にある資料館」の公園名を守るため。
const ADMIN = "(?:北海道|東京都|京都府|大阪府|[^、。の]{2,3}県)?[^、。の]{0,12}?(?:市|区|町|村|郡|都|道|府|県)";
const DROP = [
  new RegExp(`^(かつて)?(?:日本の|日本、)?(?:${ADMIN})[^、。の]{0,8}?に(?:ある|あった|所在する|所在した|位置する|存在する|面する)`),
  new RegExp(`^(かつて)?(?:日本の|日本、)?(?:${ADMIN})の`),
  /^(かつて)?日本の/,
];
const NORM=(s)=>(s??"").replace(/[（(][^）)]*[）)]/g,"").replace(/[\s・･]/g,"");
function evDesc(note,label){
  let d=(note??"").trim();
  if(!d) return "";
  for(const re of DROP){
    const m=d.match(re);
    if(m){ d=((m[1]??"")+d.slice(m[0].length)).replace(/^[、,\s]+/,""); break; }
  }
  // 残りが名前にもう書いてあるなら、読んでも増えないので出さない
  return (!d || NORM(label).includes(NORM(d))) ? "" : d;
}

// ⚠ 記録の精度どおりに書く。「1950年代」を「1950年」と書かない。
//   一覧の行と、寄せた先に残す名前の両方がこれを使う
//   （掟: 同じ問いに答える実装を2つ持たない）。
function yearLabel(x){
  const y=x.kind==="無くなった"?x.until:x.year;
  if(x.kind==="無くなった") return `${y}`;
  if(x.precision==="century") return `${Math.floor(y/100)+1}世紀`;
  if(x.precision==="decade") return `${y}年代`;
  return `${y}`;
}

// 経緯度を写真の中の座標に直して印を打つ。
// ⚠ object-fit:cover の写像を、割合の当てはめで済ませてはいけない。
//   横は枠の幅ぴったりに拡大され、縦だけがはみ出す。はみ出した分だけずれる。
const bigGeom=()=>layoutBig();
function renderPins(list){
  const wrap=document.getElementById("pins");
  if(!wrap) return;
  const g=bigGeom();
  if(!g){ wrap.innerHTML=""; return; }
  // ⚠ 枠の外に出るものも打つ。写真は 2×2 の正方形で、枠は 4:3 なので上下が隠れている。
  //   隠れているだけのものを打たないでいると、一覧に出ているのに印が無く、
  //   押しても何も起きない行になる（実測: 亀戸「1925 江東区立水神小学校」）。
  //   はみ出した分は枠が切るだけで、寄せれば見える。
  wrap.innerHTML=list.map((x,i)=>{
    const f=KonjakuEvents.fractionIn(x.lon,x.lat,16,mosaic);
    const left=f.x*g.S, top=g.top+f.y*g.S;
    // ⚠ 属性の中も HTML。title="" の中で引用符を閉じられると、そこから先はタグになる
    return `<i class="pin" data-i="${i}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px"
      title="${esc(x.year)} ${esc(x.label)}"></i>`;
  }).join("");
}

// 押されたものの位置へ寄る。写真は静止画なので、箱ごと拡大して原点をそこに置く
const ZOOM=2.4;

// ⚠ 押した結果の始末は、写真の経路と地図の経路で**同じ1か所**にまとめる。
//   別々に書いていたので、地図の経路だけ強調に届かなかった（同じ取りこぼしを2回やった）。
//   ここでやるのは3つ:
//     1. 一覧の行を強調する（行が画面外へ出ても、戻ってきたときに分かる）
//     2. 印を強調する。静止画の印も地図の印も `.pin[data-i]` で同じように拾う
//     3. 寄せた先に名前を残す。これが無いと「押せたけど答えが無い」になる
function markFocus(x,i){
  document.querySelectorAll(".ev-it").forEach((el,j)=>el.classList.toggle("on",j===i));
  document.querySelectorAll(".big .pin").forEach((el)=>
    el.classList.toggle("on",+el.dataset.i===i));
  const fx=document.getElementById("fx");
  // ⚠ ここは 2026-08-15 に足したときエスケープを忘れていて、一覧に続けてもう 2 回発火していた
  const gone=x.kind==="無くなった";
  if(fx) fx.innerHTML=`<span class="fy">${esc(yearLabel(x))}</span>${esc(x.label)}${
    TOPWORD.gone(gone)}`;
}

// 押した結果が「画面に入っている」と言える割合。
// ⚠ 実装と検査で同じ数字を使う（検査はこの値を読む）。別々に持つと静かにずれる。
const SEEN_ENOUGH=0.8;
function focusOn(x,i){
  // ⚠ **隠れている行の印を押したら、先に開く**（2026-08-21。hidetzu/konjaku#141）。
  //   ⚠ 地図の印は上限ぶん（8 本）打っているが、⚠ 一覧は既定 3 行しか出していない。
  //   ⚠ 開かずに強調すると、⚠ **一覧側が一度も見つからない**
  //     （⚠ 実測の記録あり: markerCount 9 に対し onCount 0。
  //       ⚠ 利用者役のエージェント3体とも「どの点？」と答えた）。
  if(!evOpen&&i>=EV_MIN){ evOpen=true; renderEvents(); }
  markFocus(x,i);
  // ⚠ 押したときは地図で寄せる。静止した写真のままだと、枠の端にあるものが
  //   端に貼り付いたままになり、押しても見えない（実測: 水神小学校・富岡小学校）。
  //   地図なら中心に置けるので、どこにあっても必ず見える。
  if(!mapObj&&!mapLoading){ ensureMap().then((m)=>{ if(m) focusOn(x,i); }); return; }
  if(mapObj){
    mapObj.easeTo({center:[x.lon,x.lat],zoom:Math.max(mapObj.getZoom(),17.4),duration:500});
    const big=document.getElementById("big");
    big?.classList.add("zoom");
    zoomOn=true;
    // ⚠ 寄せた結果が**画面に入っていること**まで面倒を見る。
    //   実測（2026-08-14・375×667）: 一覧を読んでいる位置から押すと、
    //   写真の枠は画面の 69px 上にあり、**見えている割合 0%**。
    //   利用者役のエージェント3体とも「何も起きない」「押せてないのかと思った」と言った。
    //   すぐ下のコメントが同じ症状を過去に直したと書いているのに、
    //   地図の経路だけ return していて、その手当てに届いていなかった。
    //   ⚠ 既に**十分に**見えているときだけ動かさない（読んでいる位置を勝手に奪わない）。
    //   ⚠ ここは長いあいだ「半分見えていれば動かさない」で、検査は「8割見えていること」を
    //     見ていた。その隙間は、写真の下から操作を1つ外して版面が 20px 縮んだだけで表に出た
    //     （2026-08-16 実測・広島 375×667: 65% しか見えないまま動かさず、検査が落ちた）。
    //     約束する側と確かめる側で、同じ数字を使う。
    if(big){
      const r=big.getBoundingClientRect();
      const seen=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
      if(seen<r.height*SEEN_ENOUGH) scrollToEl(big,{block:"center"});
    }
    return;
  }
  const big=document.getElementById("big"), inner=document.getElementById("bigIn");
  const g=bigGeom();
  if(!big||!inner||!g||!mosaic) return;
  const f=KonjakuEvents.fractionIn(x.lon,x.lat,16,mosaic);
  const px=f.x*g.S, py=g.top+f.y*g.S;
  // ⚠ 枠の外にあっても諦めない。**真ん中まで動かしてから**拡大する。
  //   以前はここで return していたので、上下に隠れているものは押しても無反応だった。
  //   押して何も起きない行を置かない（この画面の他の導線と同じ規則）。
  const k=ZOOM, S=g.S*k;
  // 拡大したあとの位置（原点をその点に置くので、その点は動かない）
  const l0=(0-px)*k+px, t0=(g.top-py)*k+py;
  // 中央へ寄せる。ただし枠に地色が見えるところまでは動かさない
  const cl=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);
  const tx=cl(g.W/2-px, g.W-S-l0, -l0);
  const ty=cl(g.H/2-py, g.H-S-t0, -t0);
  inner.style.transformOrigin=`${px.toFixed(1)}px ${py.toFixed(1)}px`;
  inner.style.transform=`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k})`;
  big.classList.add("zoom"); zoomOn=true;
  // 印と名前は markFocus が済ませている（この経路だけ別に書いて取りこぼした過去がある）
  scrollToEl(big,{block:"nearest"});
}
// 寄せたものを解く。強調も名前も、ここ1か所で落とす
function clearFocus(){
  document.querySelectorAll(".big .pin.on,.ev-it.on").forEach((el)=>el.classList.remove("on"));
  const fx=document.getElementById("fx"); if(fx) fx.innerHTML="";
}
function unzoom(){
  const big=document.getElementById("big"), inner=document.getElementById("bigIn");
  if(!big) return;
  clearFocus();
  if(mapObj&&current){ mapObj.easeTo({...MAP_HOME(),duration:400});
    big.classList.remove("zoom"); zoomOn=false; return; }
  if(inner) inner.style.transform="";
  big.classList.remove("zoom"); zoomOn=false;
}

// ⚠ **写真が届いていないときに、画面へ書く。**⚠ **状態を渡すだけ。**
//   ⚠ **状態は photos.js、字は words.js。**⚠ **ここは書き込むだけで、何も決めない。**
//   ⚠ 以前はここに文が直書きしてあり（HTML の #bigErr）、⚠ **3 通りが 1 つに潰れていた。**
//   ⚠ **/peel と同じ状態なら、同じ字が出る**（検査が突き合わせる）。
function paintBigState(state){
  const big=document.getElementById("big"), err=document.getElementById("bigErr");
  if(!big||!err) return;
  const say=KonjakuWords.photoSay(state);
  big.classList.toggle("err", !!say);
  if(!say) return;
  // ⚠ **理由を知っているときだけ、理由を書く。**⚠ 接続の話も、知っている範囲でだけ
  err.textContent = say.hint ? `${say.body}\n${say.hint}` : say.body;
}


function wireStrip(){
  // 読めなかった1枚は、黙って詰めずに枠として残す（写真が無いのか読めないのか区別できない）
  document.querySelectorAll("#strip img").forEach((im)=>{
    im.addEventListener("error",()=>im.parentNode.classList.add("err"));
  });
  document.querySelectorAll("#strip .f").forEach((el)=>{
    el.onclick=()=>setEra(+el.dataset.i);
  });
  // 大きい写真が落ちたときは、黙って前の絵を残さない。
  // ⚠ ただし **1枚でも欠けたら全滅**にしてはいけない。2×2 の端のタイルは、
  //   その年代の撮影範囲の外だと 404 になる（軽井沢で実測）。真ん中が写っていても
  //   「この年代の写真を読み込めませんでした」と出て、写真ごと消えていた。
  //   4枚とも駄目なときだけ、読み込めなかったと言う。
  document.querySelectorAll("#big .lyr img").forEach((im)=>{
      // ⚠ **状態を決めるのは photos.js の 1 か所**（2026-08-20）。⚠ **/peel と同じ 4 状態。**
      //   ⚠ 以前はここが「4 枚とも駄目か」だけを見て、⚠ **3 通り（通信断 / 404 / 圏外）を
      //     1 つの文に潰していた**（実測 2026-08-20: 3 通りとも同じ字だった）。
      //   ⚠ **`<img>` からは落ちた理由が取れない。**⚠ **だから「落ちたのを観測した」とは
      //     言えず、late（理由を知らない）に留める。**⚠ **知らないことを断定しない。**
      //   ⚠ **/peel は MapLibre の error から status が取れる**ので fail まで言える。
      //     ⚠ **取り方が違うので、言えることも違う。**⚠ **同じ状態なら、同じ字になる。**
      const judge=()=>{
        const on=document.querySelector("#big .lyr.on");
        if(!on) return;
        const t=[...on.querySelectorAll("img")];
        if(!t.every((e)=>e.complete)) return;
        // ⚠ 1 枚でも写っていれば届いている（端のタイルは撮影範囲の外で 404 になる）
        const arrived=t.some((e)=>e.naturalWidth>0);
        // ⚠ **素性（何の写真か）も、状態と一緒に持たせる。**⚠ **画面が組み立てない。**
        paintBigState(KonjakuPhotos.stateOf(arrived, !arrived, null,
          { isLatest: eraIdx===frames.length-1, isMeiji: frames[eraIdx]?.id==="meiji" }));
      };
    im.addEventListener("error",judge);
    im.addEventListener("load",judge);
  });
  const uz=document.getElementById("unzoom");
  if(uz) uz.onclick=unzoom;
  // 動かしたくなった人が触った瞬間に、地図として使えるようにする
  const bigEl=document.getElementById("big");
  if(bigEl){
    const wake=(e)=>{
      if(e.target.closest(".unzoom,.zoombar,.loading")) return;   // 操作ボタンは対象外
      // ⚠ **明治期のコマの「重ねる」は、地図を起こさない。**
      //   静止画のモザイクが「淡色地図＋塗り」の2枚組なので、そのまま濃さを変えれば足りる。
      //   起こすと、押した瞬間に静止画から地図へ**絵が差し替わって位置が跳ぶ**
      //   （実測 2026-08-17 / 375×667 / 豊洲: チェックを押すと map=false → true になり、
      //    枠取りが変わって見える。#ovRow 自体は 1px も動いていない）。
      //   ⚠ 写真の年代では起こす。あちらの重ねは MapLibre の層が要る。
      if(onMeijiFrame()&&e.target.closest("#ovRow")) return;
      if(!mapObj&&!mapLoading) ensureMap();
    };
    bigEl.addEventListener("pointerdown",wake,{passive:true});
    bigEl.addEventListener("wheel",wake,{passive:true});
  }
  const zi=document.getElementById("zIn"), zo=document.getElementById("zOut");
  const step=async(d)=>{ const m=await ensureMap(); if(m) m.easeTo({zoom:m.getZoom()+d,duration:260}); };
  if(zi) zi.onclick=(e)=>{ e.stopPropagation(); step(+1); };
  if(zo) zo.onclick=(e)=>{ e.stopPropagation(); step(-1); };
  // 写真そのものを押しても戻せる（寄ったまま戻れない、を作らない）
  const big=document.getElementById("big");
  // ⚠ 地図の上を押したときは、寄りを解除しない（判定し直しと同時に画が飛ぶ）
  if(big) big.addEventListener("click",(e)=>{
    if(e.target.closest("#unzoom,.zoombar,.say,#map")) return;
    if(zoomOn) unzoom(); });
  // ⚠ **画面の大きさが変わったら、⚠ 写真の取り分も測り直す**（2026-08-25）。
  //   ⚠ **既にある resize に相乗りする**（⚠ 同じ要素へ 2 か所からイベントを足さない）。
  addEventListener("resize",()=>{
    layoutBig();
    if(evState&&!evState.loading) renderEvents();
  },{passive:true});
}

// 明治期の地形は「する事」ではなく、その場所の事実。
// コマンドに混ぜず、場所を選んだ時点の見出しとして常に出す。
let meiji=null;   // null=未選択 / {loading:true} / {text, water, cls}

function renderVerdict(){
  const el=document.getElementById("verdict");
  // ⚠ **隠すだけでなく、中身も捨てる。** 隠すだけだと前の土地の年代の段（実測 9 コマ）が
  //   DOM に残り続ける。見えないので気づけないが、`#strip .f` を数えるものからは見えている。
  //   ⚠ 判定を待っているあいだ（current はあるが meiji がまだ）は消さない。
  //     消すと、いま出したばかりの「現在の写真」が一瞬で消える。
  if(!current){ el.style.display="none"; el.replaceChildren(); return; }
  if(!meiji){ el.style.display="none"; return; }
  el.style.display="";
  // ⚠ 判定を待ってから絵を出していたので、3G相当で **2.6秒、文字だけ**だった（実測）。
  //   座標は選んだ瞬間に分かっているので、**現在の写真は判定を待たずに出せる**。
  //   まず「いまのその場所」を見せ、判定が届いたら明治期へ重ねて戻す。
  //   （待ち時間が「何も無い」から「いまを見ている」に変わる。時間の話とも噛み合う）
  if(meiji.loading){ el.className="verdict"; el.innerHTML=loadingHTML(); wireStrip(); return; }
  el.className="verdict"+(meiji.water?" w":"");
  // 「この土地から」の色を判定に合わせる。判定カードが青いときにタグだけベージュだと、
  // 色が何を指しているのか分からなくなる
  listEl.classList.toggle("w",!!meiji.water);
  // 1行の事実 → バッジ（読ませずに伝える） → ? で根拠を開く、の三層。
  // 普段は軽く、気になる人だけが深掘りできる形にする。
  const bs = meiji.facts ? Konjaku.badges(meiji.facts) : [];
  // 取れなかったものがあるときは、必ず再試行の手段を出す。
  // 「読み込めませんでした」で終わらせると、利用者は詰む（掟: 取れなかったを「無い」と言わない / 現在地の作法と揃える）。
  const unread = meiji.facts?.unread ?? [];
  // 詳細版が無くて広い区分で答えたときは、その理由を判定カード自体に置く。
  // バッジの「（広い区分）」だけだと、なぜ粗いのかが ? を開いた人にしか届かない。
  // 「詳細版が無い」が「これがこの土地の分類だ」に化けるのが、いちばん危ない（掟: 主題は「成り立ち」。明治期は手法のひとつ）
  const lfF = meiji.facts?.byKey?.landform;
  const coarse = (lfF && lfF.ok && !lfF.fine) ? lfF.note : null;
  // 災害リスクを根拠パネルの奥から正面へ引き上げる（掟: 災害リスクを、根拠の奥ではなく正面に出す）。
  // 文は国土地理院の記述をそのまま出す。要約すると原典より強くも弱くもなる。
  // 人工地形があるならそちら（いまの土地の状態）を採る。両方は長すぎて読まれない。
  //
  // ⚠ 広い区分（広域版）では出さない。
  //   区分「低地」の記述は「河川氾濫、高潮、液状化に注意」で、これは全国の低地一般に
  //   ついての文。詳細版が無い軽井沢（標高 939.56m）に当てると、内陸の高原で
  //   「高潮に注意」と出る。高山（565m）でも同じ。原典が誤っているのではなく、
  //   **こちらが、この地点についての記述であるかのように見せているのが誤り**。
  //   詳細版が無いなら、リスクの粒度も無い。無いものは出さない（掟: 根拠のないことは書かない）。
  const risk = (lfF && lfF.ok && lfF.fine)
    ? (lfF.artificialRisk ? { text: lfF.artificialRisk, of: lfF.artificial }
      : lfF.risk ? { text: lfF.risk, of: lfF.value } : null)
    : null;
  // ⚠ **答えを先頭に置く**（2026-08-20。hidetzu/konjaku#122）。
  //   ⚠ 実測（豊洲・375×667・hasTouch）: 答えの下端 **659 → 272**。
  //     ⚠ 320×640 では **643（画面外）→ 303**。⚠ 見出しを足しても画面に入る。
  //   ⚠ **写真は画面内に残す**（上端 404）。⚠ 明治期の割合まで先頭へ寄せると
  //     写真が 654 へ落ちて画面から出るので、そこまではやらない（Owner 判断）。
  el.innerHTML=`
    ${headHTML()}
    ${timeHTML(meiji.facts)}
    ${areaBlockHTML()}
    ${bs.length ? `<div class="badges">${bs.map((b)=>
      `<button class="badge ${b.tone}" data-k="${b.key??""}"
        title="なぜそう言える？（この項目）"><i>${b.icon}</i>${b.text}</button>`).join("")}</div>` : ""}
    ${risk ? `<details class="risk"><summary><span class="rl">⚠ この土地で気をつけること</span>
        <span class="rs2">${risk.of} 一般についての、国土地理院の記述</span></summary>
      <div class="rbody">${risk.text}
        <span class="rs">（地形の種類ごとに書かれているので、この地点に当てはまらない条件も含まれます）</span>
      </div></details>` : ""}
    ${coarse ? `<div class="coarse">${coarse}</div>` : ""}

    ${unread.length ? `<div class="retry-msg">
      <b>${unread.map((f)=>f.unreadLabel ?? f.label).join("・")}</b> を、いま読み込めませんでした。
      通信を確認して、もう一度お試しください。
      <button class="retry" id="retryBtn">再試行</button></div>` : ""}`;
  wireStrip(); wireMix(); wireBadges(); wireSay(); wirePlay(); wireOverlay(); wireAreaItems();
  // 段が決まったので、URL を**いま出ているもの**に合わせ直す。
  // ⚠ 指定された年代が無かった場合、ここで URL からその年代が落ちる。
  //   出ていないものを URL に残すと、共有するたびに同じ空振りが伝播する
  syncUrl();
  document.getElementById("mixbar")?.classList.toggle("off",!!frames[eraIdx]?.now);
  if(frames.length&&!evState) loadEvents(); else renderEvents();
  const sb=document.getElementById("shareBtn");
  if(sb) sb.onclick=async(ev)=>{
    ev.preventDefault();
    if(!meiji.facts||!current) return;
    const say=(t)=>{ const n=document.getElementById("shareMsg");
      if(n){ n.textContent=t; n.style.display="block"; clearTimeout(say._t);
        say._t=setTimeout(()=>{ n.style.display="none"; },2600); } };
    sb.disabled=true;
    try{ await KonjakuShare.share(meiji.facts,current.title,location.href,say); }
    catch{ say("共有できませんでした"); }
    finally{ sb.disabled=false; }
  };
  const cw=document.getElementById("closeWhy");
  if(cw&&!cw.dataset.on){ cw.dataset.on="1";
    cw.onclick=()=>{ const w=document.getElementById("whyBtn"); if(w) w.click();
      scrollToEl(document.getElementById("verdict"),{block:"nearest"}); }; }
  const rb=document.getElementById("retryBtn");
  if(rb) rb.onclick=()=>{ const c=current; if(c) openPlace(c.lon,c.lat,c.title); };
  document.getElementById("whyBtn").onclick=(ev)=>{
    const btn=ev.currentTarget;
    const open=btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded", String(!open));
    const own=document.getElementById("own");
    // "" にすると CSS の display:none が復活してしまうので、明示的に block にする
    document.getElementById("result").style.display = open ? "none" : "block";
    document.getElementById("closeWhy")?.style.setProperty("display", open?"none":"block");
    if(!open){ scrollToEl(own,{block:"nearest"});
      const card=own.firstElementChild;
      if(card){ card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); } }
  };
}

// この年代を聞く。
//
// ⚠ 読み上げるのは「出せるもの」だけ。
//   助言にあった「1964年。このころ、この周辺には……」は書けない。
//   その年代に何があったかは空中写真から出せないことが実測で分かっている
//   （掟: 画素から出せないことは言わない）。文にした瞬間、それは判定ではなく作文になる。
//   読み上げるのは、画面に出ているのと**同じ文**だけ:
//     1. 年代の名前（撮影者の注記まで）
//     2. 判定文（narrate の1文目。国土地理院の記述から作った文）
//     3. その年代の差分（Wikidata で年が確認できたものだけ）
//   聞いている人は文字を追えないので、**画面より多くのことを言わない**のが特に重要。
//
// ⚠ 自動で再生しない。押した人にだけ鳴らす。
// ⚠ 端末の中で合成する。外へは何も送らない（画面にもそう書く）。
let speaking=false;
function sayText(){
  const fr=frames[eraIdx];
  if(!fr||!meiji||meiji.loading) return "";
  const parts=[];
  parts.push(fr.meiji ? "明治期の低湿地データです。"
    : fr.now ? "現在の空中写真です。"
    : `${fr.label.replace("–","年から")}年の空中写真です。${fr.sub?fr.sub+"。":""}`);
  // ⚠ 重ねているあいだは、見えている絵が違う。声だけ言い切らない
  if(mixVal>0) parts.push(`いまは現在の写真を ${mixVal} パーセント重ねています。`);
  // 明治期の水域も同じ。⚠ 押しただけでなく、実際に地図へ重なっているときだけ言う
  if(document.getElementById("ovSwale")?.checked&&mapObj?.getLayer("swale"))
    parts.push("いまは明治期の土地を重ねています。");
  // ⚠ **第1層は、画面と同じ順で読む**（区分名 → その意味。2026-08-22。ADR 0031）。
  //   ⚠ **字も順も words.js の 1 か所**（ground1Speech）。⚠ **ここで組み立てない。**
  //   ⚠ **画面に出したものを、声だけ読まない、にしない**（見える人と聞く人で内容が変わる）。
  //   ⚠ 判定できなかったときは、いままでどおり判定文をそのまま読む。
  const sayLf = meiji.facts?.byKey?.landform;
  parts.push(sayLf?.ok
    ? KonjakuWords.ground1Speech(sayLf.value, sayLf.artificial ?? null)
    : meiji.text);
  // 差分。画面に出ている行と同じものだけを、同じ順で読む。
  // ⚠ **畳んでいるかで変わる**（2026-08-21。hidetzu/konjaku#141）。
  //   ⚠ 前はいつも先頭 3 件だったが、⚠ **画面には上限まで（8 行）出ていた**ので、
  //     ⚠ このコメントが言っていることと、⚠ 実際の振る舞いが食い違っていた。
  for(const x of evVis())
    parts.push(x.kind==="無くなった"
      ? `${x.until}年に、${x.label}が無くなりました。`
      : `${x.year}年、${x.label}。`);
  return parts.join(" ");
}
function sayMsg(t){
  const el=document.getElementById("sayMsg");
  if(!el) return;
  el.textContent=t??""; el.style.display=t?"block":"none";
  clearTimeout(sayMsg._t);
  if(t) sayMsg._t=setTimeout(()=>{ el.style.display="none"; },5000);
}
let sayTimer=null;
function stopSay(){
  clearTimeout(sayTimer); sayTimer=null;
  try{ speechSynthesis.cancel(); }catch{}
  speaking=false;
  const b=document.getElementById("sayBtn");
  // ⚠ button 全体を textContent で書き換えない。名前（読み上げる）まで消える
  if(b){ const i=b.querySelector("i"); if(i) i.textContent="🔊"; b.classList.remove("on"); }
}
// ⚠ 声の一覧は、最初の呼び出しでは空のことがある（あとから非同期で入る）。
//   温めておかないと、1回目だけ日本語の声が選ばれない。
try{ speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.("voiceschanged",()=>{ speechSynthesis.getVoices(); }); }catch{}
function pickVoice(){
  const all=speechSynthesis.getVoices()||[];
  const ja=all.filter((v)=>v.lang.replace("_","-").toLowerCase().startsWith("ja"));
  // 端末に入っている声を優先する。入っていない声を指すと、**無音のまま終わる**
  return ja.find((v)=>v.localService)??ja[0]??null;
}
function wireSay(){
  const b=document.getElementById("sayBtn");
  if(!b) return;
  if(!("speechSynthesis" in window)){ b.style.display="none"; return; }
  b.onclick=(ev)=>{
    ev.stopPropagation();
    if(speaking) return stopSay();
    const t=sayText();
    if(!t) return;
    const u=new SpeechSynthesisUtterance(t);
    u.lang="ja-JP"; u.rate=1.0;
    const v=pickVoice();
    if(v) u.voice=v;
    let started=false;
    u.onstart=()=>{ started=true; clearTimeout(sayTimer); sayTimer=null; };
    u.onend=stopSay;
    u.onerror=(e)=>{ stopSay(); sayMsg(`音声を再生できませんでした（${e?.error??"原因不明"}）`); };
    speaking=true; b.querySelector("i").textContent="■"; b.classList.add("on"); sayMsg(null);
    // ⚠ 計測の無い機能を増やさない。
    //   era.moved / open.peel には入れたのに、音声にだけ入れ忘れていた。
    //   「これが無いと『使われなければ後で消す』の"後で"が永久に来ない」と
    //   自分で書いた同じ日に、それを破っていた（PO レビューで指摘）。
    KonjakuShare.tick("open.speak");
    try{
      // ⚠ cancel() を毎回呼ばない。直後の speak() が飲み込まれることがある。
      //   止める必要があるとき（前の読み上げが残っているとき）だけ呼ぶ。
      if(speechSynthesis.speaking||speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }catch{ stopSay(); sayMsg("音声を再生できませんでした"); return; }
    // ⚠ 鳴らないまま黙らない。始まらなければ、始まらなかったと画面に出す。
    //   端末に日本語の声が入っていないと、例外も error も出ずに無音で終わることがある。
    sayTimer=setTimeout(()=>{
      if(started||speechSynthesis.speaking) return;
      stopSay();
      sayMsg(v ? "音声が鳴りませんでした（端末の音量と、読み上げ音声の設定をご確認ください）"
              : "この端末には日本語の読み上げ音声が入っていないようです");
    },1500);
  };
}

// バッジを押したら、その根拠を開く。
// ⚠ 実測で、バッジ5個と判定文の中の語は**全部押せそうに見えて、全部無反応**だった。
//   「旧水部って何？」の答えは根拠パネルの中にあるのに、そこへ行く導線が丸い ? 1つしか
//   無かった。押されている場所に、答えへの道を付ける。
function wireBadges(){
  document.querySelectorAll("#verdict .badge").forEach((b)=>{
    b.onclick=()=>{
      const w=document.getElementById("whyBtn");
      if(w&&w.getAttribute("aria-expanded")!=="true") w.click();
      // その事実のカードまで連れていって、どれの話か分かるようにする
      const k=b.dataset.k;
      setTimeout(()=>{
        const card=k?document.querySelector(`#own .card[data-k="${k}"]`):null;
        const t=card??document.getElementById("own");
        scrollToEl(t,{block:"nearest"});
        if(card){ card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
      },60);
    };
  });
}

// ---- 意見・不具合の受け口 ----
// ⚠ ここが空のあいだは、報告の導線を一切出さない。
//   押しても何も起きないボタンや、404 に飛ぶリンクを置くほうが黙っているより悪い。
//
// url   … Google フォームの「事前入力したURLを取得」で出てくる URL から、
//         ?usp=pp_url より前の部分（.../viewform）
// place … 同じ URL に入っている entry.xxxxxxxxx（「探した地名」の欄の id）。
//         これがあると、見つからなかった語を入力済みでフォームを開ける。
//         黙って集めるのではなく、送るかどうかは本人が決める（掟: 地名も座標も送らない）
const FEEDBACK={
  url:"https://docs.google.com/forms/d/e/1FAIpQLSd65OIeRYpq8PYXoW53YOzT_x98kEJNVfY4GVeVFlL3NE83Fw/viewform",
  place:"entry.1545984463",           // 「探した地名（分かれば）」
  kind:"entry.2129165259",            // 「どれについてですか」
  kindNotFound:"地名が見つからない",   // 選択肢の文言と一字一句合っていないと選ばれない
};
const feedbackUrl=(term)=>{
  if(!FEEDBACK.url) return null;
  if(!term) return FEEDBACK.url;
  // 見つからなかったときは、種類も地名も入れた状態で開く。
  // 利用者にやってもらうのは「送る」を押すことだけにする
  const p=new URLSearchParams({ "usp":"pp_url" });
  if(FEEDBACK.kind&&FEEDBACK.kindNotFound) p.set(FEEDBACK.kind,FEEDBACK.kindNotFound);
  if(FEEDBACK.place) p.set(FEEDBACK.place,term);
  return `${FEEDBACK.url}?${p}`;
};

// 自前レンズ。ここだけが「根拠あり」で出せるもの
// ⚠ **「この場所を深掘り」の持ち主**（2026-08-21）。
//   ⚠ **2026-08-21 に、行動一覧から判定カードの中へ移した。**
//     ⚠ 実測（豊洲・375×667・hasTouch・SW 無効・`main` = `d3a50b5`）:
//       ⚠ 一覧に置いていたときは **y1135**（⚠ 1.7 画面ぶん下）。
//       ⚠ 写真の下へ上げると **y655**（⚠ 初期画面に顔を出す）。
//     ⚠ 利用者役 4 名に画面だけを見せた（⚠ 実在の利用者ではない）:
//       ⚠ **「次に何をしますか」に答えられたのが 2/4 → 4/4**。
//       ⚠ A と D は「半分切れているから、もっとあると分かる」と言った。
//   ⚠ **一覧から抜けたので、⚠ ↑↓/Enter の輪と打鍵の絞り込みからは外れる。**
//     ⚠ **CTA は一覧より上にあるので、⚠ 打っているあいだも見えている。**
//   ⚠ **href に年代（eraNowId）も載せる。**載せないと、見ていた年代が落ちる。
function peelLens(p){
  // ⚠ **下地が無くても出す。押せる。**（2026-08-18。一度「出さない」にして戻した）
  //   出さないと「**まだ用意していない**」が「**この場所には機能そのものが無い**」に見える。
  //   利用者役 3/3 が「機能があること自体に気づけない」と答えた。
  //   ⚠ 「知らないことは回復できないが、がっかりは回復できる」（利用者役の言葉）。
  //
  // ⚠ ただし**押す前に**言う。押して、地図が立ち上がって、待たされてから
  //   「取れなかった」と言われるのが、いちばんがっかりする（利用者役の指摘）。
  //   ⚠ 判定は ground.js の1か所。ここで数え直さない。
  //   ⚠ 読めなかった（null）ときは**何も断らない**。索引を取得できなかっただけで、
  //     用意していないとは限らない（掟: 取得できなかった ≠ 存在しなかった）。
  // ⚠ **字は TOPWORD.peelLead の 1 か所**（hidetzu/konjaku#138）。
  return {ic:"🌊",label:"この場所を深掘り",
    sub:TOPWORD.peelLead(KonjakuGround.hasSync(p.lon,p.lat)),
    // ⚠ **打った語がこれに当たったら、⚠ Google マップの行を出さない**（下の buildActions）。
    //   ⚠ **一覧に深掘りの行はもう無い**（2026-08-21 に判定カードへ移した）が、
    //     ⚠ **語は残す。**⚠ 消したら「昔」「3d」に対して
    //     ⚠ **「『昔』を周辺で探す」という無意味な行**が出た（⚠ 実測。⚠ 同日に踏んだ）。
    kw:["3d","さかのぼる","剥がす","埋立","水","動画","戻す","地盤","昔","むかし","歴史","明治","過去","立体","深掘り"],
    // ⚠ **年代も持って行く**（載せないと、行き来しただけで年代が落ちる）。
    //   ⚠ 座標が読めなければ `./peel` だけ渡す（⚠ `/peel` が「場所が無い」と言う）。
    href:"./peel"+(KonjakuPlaceArg.placeQuery(
      {title:p.title,lat:p.lat,lon:p.lon,era:eraNowId()})??"")};
}

// ⚠ 判定カードの中に置く CTA。⚠ **画面に出る導線はここ 1 か所**
function peelCtaHTML(){
  if(!current) return "";
  const x=peelLens(current);
  return `<a class="peel-cta" id="peelCta" href="${esc(x.href)}">
      <span class="ic">${esc(x.ic)}</span>
      <span class="tx"><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span>
      <span class="go">→</span>
    </a>`;
}

// ⚠ **どこで開いても中身が同じ固定リンク。**⚠ 座標を渡すだけ
function ownLenses(p,facts){
  // id は「次に調べる語」との重複を避けるための目印。
  // 同じ話題を自前で持っているなら、Google 検索の提案はその劣化版になる。
  return [
    {id:"hazard",ic:"⚠️",label:"ハザードマップで見る",sub:"洪水・土砂・津波の想定（国交省）",tag:"ext",grp:"ext",
     kw:["ハザード","災害","洪水","浸水","地震","津波","土砂","risk"],
     href:`https://disaportal.gsi.go.jp/maps/index.html?ll=${p.lat},${p.lon}&z=15`},
    {id:"gsi",ic:"🗺",label:"地理院地図で開く",sub:"標高・土地条件図など",tag:"ext",grp:"ext",
     kw:["地理院","標高","土地条件","地図"],href:`https://maps.gsi.go.jp/#16/${p.lat}/${p.lon}/`},
  ];
}

function buildActions(text,p){
  const t=text.trim().toLowerCase();
  const out=[];
  const hit=(kw,label)=>!t||kw.some(k=>k.toLowerCase().includes(t)||t.includes(k.toLowerCase()))
    ||label.toLowerCase().includes(t);

  const own=ownLenses(p,meiji&&!meiji.loading?meiji.facts:null).filter(o=>hit(o.kw,o.label));
  const pre=t?PRESETS.find(x=>hit(x.kw,x.label)):null;

  // 判定から導いた「次に調べる語」。語を思いつけた人は自分で打てばよいので、
  // 自前レンズの後・カテゴリの前に置く。打鍵中も既存の絞り込みに参加させる。
  // 打った語が同じ話題の自前レンズに当たっているときは出さない。
  // 「ハザード」で〈ハザードマップで見る（根拠あり）〉と〈浸水の Google 検索〉を
  // 並べると、後者はただの劣化版になる。
  const facts=meiji&&!meiji.loading?meiji.facts:null;
  const lensHit=new Set(t?own.map(o=>o.id):[]);
  const sug=(facts?Konjaku.suggestions(facts):[])
    .filter(s=>hit(s.kw,s.label)&&!(s.lens&&lensHit.has(s.lens)));

  // 自由入力の扱い:
  //   カテゴリに当たれば → その語で周辺検索を最上位に
  //   当たらないが自前レンズ・次に調べる語に当たれば → そちらを優先
  //     （「昔」「揺れ」を Google マップに投げても店は出てこない。無意味なので出さない）
  //   どれにも当たらなければ → 素直にその語で周辺検索
  // ⚠ **深掘りの語に当たったら、⚠ 周辺検索は出さない**（2026-08-21 に直した）。
  //   ⚠ 深掘りが一覧から判定カードへ移ったとき、⚠ **この判定から抜け落ちた。**
  //   ⚠ 実測（豊洲・375×667）: 「3d」「昔」「立体」「深掘り」の 4 語すべてで
  //     ⚠ **「『3d』を周辺で探す」という、⚠ 押しても店が出てこない行**が出ていた。
  //   ⚠ **導線は増やさない。**⚠ CTA は一覧より上にあり、⚠ 打っているあいだも画面に見えている
  //     （⚠ 実測: 4 語とも `#peelCta` が画面内）。
  const pk=peelLens(p).kw;
  const peelHit=!!t&&(pk.some((k)=>k.includes(t)||t.includes(k))||"この場所を深掘り".includes(t));
  if(t && (pre || (!own.length && !sug.length && !peelHit))){
    out.push({ic:pre?pre.ic:"🔍",label:`「${text.trim()}」を周辺で探す`,
      sub:pre?`Google マップで「${pre.q}」を検索`:"Google マップで検索",tag:"ext",
      href:gmap(pre?pre.q:text.trim(),p.lat,p.lon)});
  }
  // ⚠ **組の順は「公的な情報で確認する」→「さらに調べる」**（2026-08-21。Owner 判断）。
  //
  // ⚠ **以前と逆にした。**⚠ 前は「この場所に固有なものほど上」で、⚠ **判定から出た語を
  //   固定リンクより上**に置いていた。⚠ その並びは、⚠ **亀戸の標高 -0.57m から出た
  //   〈水害の記録〉が、⚠ 亀戸と何の関係もない〈地理院地図で開く〉の下に埋もれていた**
  //   のを直したものだった。
  // ⚠ **条件が変わった。**⚠ 2026-08-21 に**両方とも畳んで 1 行の見出し**にしたので、
  //   ⚠ **どちらも中身は隠れていて、⚠ 見出しの高さも同じ。**⚠ 埋もれる形にはならない。
  // ⚠ **利用者役では割れた**（⚠ 4 名中: 公的が先 1 / さらに調べるが先 1 / どちらでもいい 2）。
  //   ⚠ 家を買うか迷っている役は、⚠ **いまの画面では「ハザードマップは無い」と読んでいた。**
  // ⚠ **実測では決まらないので、⚠ Owner が決めた。**⚠ 勝手に戻さない。
  out.push(...own);
  for(const s of sug)
    out.push({ic:s.icon,label:`${s.label} を調べる`,sub:s.reason,tag:"why",grp:"why",
      href:gweb([placeName(p.title),s.query].filter(Boolean).join(" "))});

  // ⚠ 打っていないときは、店のカテゴリを並べない。
  //   実測で、本命（時間をさかのぼる 3D）が「ごはん / ラーメン / カフェ」と
  //   同じ見た目・同じ列に並び、一覧全体が「リンク集」に見えていた。
  //   打てば出るので、機能は失われない（掟: 地名も座標も送らない のランチャーは残る）。
  return out;
}

// ============================================================
// 入力の状態管理: place（場所を探す）→ action（その場所で調べる）
// ============================================================
const qEl=document.getElementById("q"), listEl=document.getElementById("list");
const scopeEl=document.getElementById("scope"), chipName=document.getElementById("chipName");
// sel = -1 は「何も選んでいない」。Enter を押しても何も起きない状態を、
// 表示（.kbd を薄字にする）と挙動（run しない）の両方が同じ変数から生える形にしてある。
let mode="place", items=[], sel=-1, timer=null;
// ⚠ **畳んでいる組の開閉**（2026-08-21。Owner 判断で既定は畳む）。
//   ⚠ **場所を変えたら閉じ直す。**⚠ 前の土地で開いた状態を持ち越さない
//     （⚠ hidetzu/konjaku#141 の `evOpen` と同じ扱い）。
const listOpen=new Set();
// ⚠ **組ごとの件数と出現順。**⚠ **畳んでいても本当の数を出す**（⚠ それがこの畳みの目的）。
//   ⚠ `items` は畳んだぶんを落とすので、⚠ **件数はここが持つ**。
let listGroups=[];
// ⚠ 畳んでいる組の行を落とす。⚠ **`items` は ↑↓ / Enter の輪そのもの**なので、
//   ⚠ **見えていない行を残すと、⚠ ↑↓ が見えない行を選ぶ。**
function foldItems(all){
  listGroups=[];
  const seen=new Map();
  for(const it of all){
    if(!it.grp) continue;
    if(!seen.has(it.grp)){ seen.set(it.grp,{g:it.grp,n:0}); listGroups.push(seen.get(it.grp)); }
    seen.get(it.grp).n++;
  }
  return all.filter((it)=>!it.grp||listOpen.has(it.grp));
}

// タグの文言。行き先ではなく「なぜここに出ているのか」を書く
// ⚠ **一覧行のタグの字は words.js が持つ**（2026-08-20）。ここには写さない。
//   ⚠ `priv`（「自分」）は同じときに消した。⚠ **`tag:"priv"` を付ける場所が
//     どこにも無く、画面に出ようがない語**だった。

function renderList(){
  // ⚠ **溶接はやめた**（2026-08-21）。⚠ 「この場所を深掘り」を判定カードの中へ入れたので、
  //   ⚠ 枠と地色で 1 枚に見せる細工が要らなくなった（上の .peel-cta を読む）。
  // ⚠ 行の見出しと副題には、地理院の応答（地名）と、利用者が打った語がそのまま入る
  //   （「〈打った語〉を周辺で探す」）。描くときに esc を通す。
  //   行き先（href）はこちらが組み立てたものだが、属性の中なので同じ扱いにする。
  // ⚠ **行ごとのタグをやめて、組の見出しにした**（2026-08-21）。
  //   ⚠ 字は words.js の 1 か所（`groupTitle`）。⚠ ここに写さない。
  //   ⚠ **中身が 0 件の組には、見出しを出さない**（Owner 判断 2026-08-21）。
  //     ⚠ 空の見出しは「あるのに出ない」に読める。
  //   ⚠ **見出しは行ではない。**⚠ `.it` を数える検査・↑↓ の輪・data-i は動かない。
  //
  // ⚠ **既定で畳む**（2026-08-21。Owner 判断）。⚠ **PC でも畳む。**
  //   ⚠ 利用者役 4 名に画面だけを見せた（⚠ 実在の利用者ではない）:
  //     ⚠ 畳む前は、⚠ **家を買うか迷っている役が「ハザードマップは無いのだと思った」**
  //       と答えた（⚠ 下にあるが気づかれていなかった）。
  //     ⚠ **件数を出して畳むと、⚠ 4/4 が中身を言い当て、⚠ その役は「押す」に変わった。**
  //   ⚠ **だから件数を必ず出す。**⚠ 「ある」と分かることが、この畳みの目的。
  // ⚠ 1 行ぶんの HTML。⚠ `data-i` は `items` の位置（⚠ 畳んだあとの配列）
  const row=(it,i)=>{
    const sub=it.sub, ext=it.href&&it.href.startsWith("http");
    const inner=`<span class="ic">${esc(it.ic??"📍")}</span>
      <span class="tx"><b>${esc(it.label)}</b>${sub?`<small>${esc(sub)}</small>`:""}</span>`;
    const cls=`it${i===sel?" sel":""}${it.tag==="why"?" why":""}`;
    return it.href
      ? `<a class="${cls}" data-i="${i}" href="${esc(it.href)}"${ext?' target="_blank" rel="noopener"':""}>${inner}</a>`
      : `<button class="${cls}" data-i="${i}">${inner}</button>`;
  };
  const idx=items.map((it,i)=>[it,i]);
  listEl.innerHTML=
    // ⚠ 組に入らない行（⚠ 打った語の「周辺で探す」）。⚠ 自由検索は 3 分類の外
    idx.filter(([it])=>!it.grp).map(([it,i])=>row(it,i)).join("")
    // ⚠ 組ごと。⚠ **畳んでいる組も見出しは出す**（⚠ 「ある」と分かることが目的）
    + listGroups.map((g)=>{
        const open=listOpen.has(g.g);
        return `<button class="lh fold lh-${esc(g.g)}" data-g="${esc(g.g)}"
          aria-expanded="${open}"><span>${esc(KonjakuWords.groupTitle(g.g))}</span>
          <span class="n">${g.n}件</span>
          <span class="cv">${open?"∨":"＞"}</span></button>`
          + idx.filter(([it])=>it.grp===g.g).map(([it,i])=>row(it,i)).join("");
      }).join("");
  // ⚠ 見出しを押したら開閉する。⚠ **開いたら sel は外す**（⚠ 見えている輪と食い違わせない）
  listEl.querySelectorAll(".lh.fold").forEach((el)=>{
    el.onclick=()=>{
      const g=el.dataset.g;
      if(listOpen.has(g)) listOpen.delete(g); else listOpen.add(g);
      sel=-1;
      items=foldItems(buildActions(qEl.value,current));
      renderList();
    };
  });
  listEl.querySelectorAll(".it").forEach((el)=>{
    // ⚠ 何も選んでいない間は hover で sel を動かさない。
    // 動かすと、PCでマウスが一覧の上をただ通っただけで Enter が武装し、
    // 「先頭を自動選択しない」を入れた意味が消える。ハイライトは :hover の見た目だけ。
    el.addEventListener("mouseenter",()=>{ if(sel>=0){ sel=+el.dataset.i; markSel(); } });
    if(el.tagName==="BUTTON") el.onclick=()=>run(items[+el.dataset.i]);
    // ⚠ ここで open.peel を送っていたが、**この導線から来た人しか数えられていなかった**。
    //   共有された 3D の URL を踏んだ人は、計測から丸ごと消えていた（実測: /peel を
    //   直接開くと /t が 0 回）。共有は唯一の指標なので、ここは効く穴だった。
    //   → 数えるのは peel.html 側に移した。開き方によらず、開いたら必ず1回。
    //   （リンクは必ず /peel を読み込むので、こちらで送らなくても取りこぼさない）
  });
  renderKbd();
}
const markSel=()=>{
  listEl.querySelectorAll(".it").forEach((el,i)=>{
    const on=i===sel;
    el.classList.toggle("sel",on);
    if(on) el.scrollIntoView({block:"nearest"});
  });
  renderKbd();
};

// キーヒントは実際の挙動から作る。
// 「決定」では何が決まるか分からないので、行き先の名前をそのまま入れる。
const kEnter=document.getElementById("kEnter"), kMove=document.getElementById("kMove"),
      kEsc=document.getElementById("kEsc"), kbdEl=document.querySelector("#listbox .kbd");
function renderKbd(){
  const it=sel>=0?items[sel]:null;
  // ⚠ **どのキーもまだ効かないうちは、キーの説明を出さない。**
  //   実測（2026-08-17 / 1280×800 / 地名を打つ前）: 3 つとも薄字のまま 37px 出ていた。
  //   薄字は「いま使えません」の意味なので、**使えない案内を 3 つ並べて**
  //   検索欄のすぐ下を占めていたことになる（UI/UX レビュー 原則4「説明より操作」）。
  //   ⚠ 消す条件は**見た目ではなく、効くかどうか**から生やす。
  //     ↑↓ は候補があるとき、Esc は入力があるか場所が決まっているときに効く。
  //     ここが挙動とずれると、「出ているのに効かない」か「効くのに出ない」になる。
  //   ⚠ 指の端末では、そもそも CSS が丸ごと隠している（@media (hover:none)）。
  if(kbdEl) kbdEl.style.display=(items.length||mode==="action"||qEl.value)?"":"none";
  kMove.classList.toggle("off",!items.length);
  kEnter.classList.toggle("off",!it);
  kEnter.querySelector("b").textContent = it
    ? (mode==="place" ? `${it.label}を調べる` : it.label)
    : (items.length ? "↑↓ で選ぶと使えます" : "決定");
  // Esc の行き先はモードで違う。場所選択中は入力のクリアであって「場所を変える」ではない
  kEsc.querySelector("b").textContent = mode==="action" ? "場所を変える" : "入力を消す";
  kEsc.classList.toggle("off",mode!=="action"&&!qEl.value);
}

function run(it){
  if(!it) return;
  if(it.href){ if(it.href.startsWith("http")) window.open(it.href,"_blank","noopener"); else location.href=it.href; return; }
  it.act?.();
}

function setMode(m){
  // ⚠ **画面が別のことを始めるときも、検索を切る。**
  //   打つたびに切るだけでは足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのままクイック地点を選ぶと、行動一覧（立体で見る等）が出たあと、
  //   **2.5 秒後に「東京都渋谷区」で上書きされた**。
  //   ⚠ 入力欄は下で空にするので `oninput` は発火せず、そこの cancel() には届かない。
  //   ⚠ デバウンス中のタイマーも落とす。落とさないと、空の語で検索が始まる。
  clearTimeout(timer); search.cancel();
  mode=m;
  scopeEl.classList.toggle("on",m==="action");
  document.body.classList.toggle("picked",m==="action");
  qEl.placeholder = m==="action"
    ? `${current.title} で調べる（例: ごはん、公園、歯医者、昔）`
    : "地名・住所を入力";      // ⚠ index.html の placeholder 属性と同じ文言にする
  // コマンド一覧は場所が決まった後の話で、先頭が「明治期の地形を見る」に固定されている。
  // 別の土地へ飛ばされる事故は起きないので、ここは従来どおり先頭を選んでおく。
  qEl.value=""; sel=m==="action"?0:-1;
  if(m==="action"){ items=foldItems(buildActions("",current)); renderList(); }
  else { items=[]; listEl.innerHTML=""; renderKbd(); }
}
// 場所を外す（✕）。
// ⚠ **見えなくするのと、消すのは別。** 以前はここで `current` を捨てるだけで、
//   前の場所の名前・年代の段・地図・URL が**そのまま残っていた**。
//   見た目は場所未選択になるので気づけず、実測（2026-08-17 / 375×667 / 豊洲）では:
//     ✕ の直後 … url=?q=豊洲&ll=…&era=swale ／ chipName「豊洲」／ #strip 9 コマ（非表示なだけ）
//     再読み込み … **豊洲が復活する**
//   状態遷移の契約「✕ → 結果・一覧・場所・古い非同期処理を消す」に反していた。
// ⚠ URL も一緒に戻す。調べた場所を URL に載せているのは「戻る・共有する」ためなので、
//   場所を外したなら載せる理由も消える（掟: 調べた場所は URL に載る、の裏返し）。
//   ⚠ replaceState にする。pushState だと「戻る」で外したはずの場所へ戻ってしまう。
document.getElementById("chipX").onclick=()=>{
  current=null; meiji=null;
  // 前の土地の年代・地図・読み上げを持ち越さない
  stopSay(); stopPlay(); dropMap();
  frames=[]; eraIdx=0; wantEra=null; eraMiss=null; eraTicked=false;
  evState=null; evTile=null; evOpen=false; listOpen.clear();
  document.getElementById("chipName").textContent="";
  document.getElementById("result").style.display="none";
  renderVerdict();
  history.replaceState(null,"",location.pathname);
  setMode("place"); qEl.focus();
};

// --- 場所の検索（地理院 AddressSearch） ---
// ⚠ 検索経路にも verify.js と同じ規律を通す（掟: 取れなかったを「無い」と言わない「取れなかった」を「無い」と言わない）。
// 直前は res.ok を見ずに .json() し、配列の長さ0だけで「見つかりませんでした」と書いていた。
// 実測すると HTTP 500＋JSON本文も、200 だが配列でない応答も、すべて
// 「その地名は存在しない」に化けていた。無応答に至っては10秒経っても「検索中…」のまま。
//   接続できない／時間切れ／HTTP エラー／配列でない  → 取れなかった（＋再試行）
//   配列が返って長さ0                                → 見つからなかった
// ⚠ 通信・時間切れ・再試行・古い応答の追い越し防止は **places.js の1か所**にある
//   （掟: 同じ問いに答える実装を2つ持たない）。ここに残すのは**描くことだけ**。
//   以前はここと peel3d.js が同じものを持っていて、実際に食い違っていた。
const search=KonjakuPlaces.createSearch();
async function searchPlace(q){
  listEl.innerHTML=`<div class="note" style="padding:6px 2px">検索中…</div>`;
  // ⚠ 受け皿の名前に `r` を使わない。このファイルでは `r` が
  //   「保存した記録（地名と、利用者のメモ）」＝**外部から来た値**を指す約束で、
  //   npm run check がその名前を追っている。同じ名前を別の意味で使うと監査できなくなる。
  const res=await search.run(q,10);
  if(res.state==="stale") return;              // 遅れて返った古い応答。画面に触らない
  // ⚠ **入口の生死を数える**（2026-08-28・hidetzu/konjaku#354）。
  //   ⚠ **stale より後・画面を触る前**。⚠ 追い越された分は数えない（起きたことではない）。
  //   ⚠ **「候補 0 件」は ok**（⚠ 記録に無いだけで壊れていない。`CLAUDE.md` §1）。
  //   ⚠ **語も座標も送らない**（⚠ 送るのは `health:search:ok|fail` だけ）。
  KonjakuShare.searchHealth(res.state==="error"?"fail":"ok");
  if(res.state==="error"){
    items=[]; sel=-1;
    listEl.innerHTML=`<div class="note warn" style="padding:6px 2px">
      検索の応答を取れませんでした（${res.why}）。
      「見つからなかった」ではありません。
      <button class="retry" id="searchRetry">再試行</button></div>`;
    document.getElementById("searchRetry").onclick=()=>searchPlace(q);
    renderKbd(); return;
  }
  if(res.state==="empty"){
    items=[]; sel=-1;
    // ⚠ ここが、このサービスでいちばん価値のある信号が出る場所。
    //   「探したのに出せなかった語」は、黙って去られると永久に分からない。
    //   ただし勝手には送らない。押すかどうかは本人が決める（掟: 地名も座標も送らない）
    const fu=feedbackUrl(qEl.value.trim());
    listEl.innerHTML=`<div class="note" style="padding:6px 2px">見つかりませんでした`
      +(fu?` <a class="report" href="${fu}" target="_blank" rel="noopener">この地名を報告する ↗</a>`:"")
      +`</div>`;
    renderKbd(); return; }
  // ⚠ 地名は外部の値。描くのは renderList で、そこで esc() を通る。
  items=res.rows.map((x)=>({ic:"📍",label:x.title,sub:x.sub,
    act:()=>openPlace(x.ll[0],x.ll[1],x.title)}));
  // 確度が高いときだけ選ぶ。低いときは何も選ばず、Enter を空振りさせる。
  sel=res.pick; renderList();
}

// 日本語入力（IME）の変換中かどうか。
// 変換中の Enter は「確定」であって「決定」ではないので、横取りしてはいけない。
// ↑↓ も変換候補の操作なので奪わない。
let composing=false;
qEl.addEventListener("compositionstart",()=>{composing=true});
qEl.addEventListener("compositionend",()=>{composing=false; onInput();});

function onInput(){
  const v=qEl.value.trim();
  // コマンド絞り込みは手元だけの処理なので、変換中でも即座に効かせてよい
  if(mode==="action"){ items=foldItems(buildActions(qEl.value,current)); sel=0; renderList(); return; }
  clearTimeout(timer);
  // ⚠ **打つたびに世代を進める。** 「2文字未満のときだけ」では足りない。
  //   実測（2026-08-16）: 「渋谷」の応答待ちのまま「新宿」へ変えると、
  //   デバウンスの 320ms のあいだに古い応答が届き、**入力欄は「新宿」なのに
  //   「東京都渋谷区」が並ぶ**。その候補を押せば違う場所へ飛ぶ。
  //   ⚠ 新しい検索が始まるのは 320ms 後なので、run() の中で世代を進めるだけでは間に合わない。
  //   **入力の瞬間に切る。**
  search.cancel();
  if(v.length<2){ items=[]; sel=-1; listEl.innerHTML=""; renderKbd(); return; }
  // 住所検索は外部APIで 10req/10秒 の制限があるため、変換確定まで待つ
  if(composing) return;
  timer=setTimeout(()=>searchPlace(v),320);
}
qEl.addEventListener("input",onInput);

// キー操作は画面のどこにフォーカスがあっても効かせる。
// 「↑↓ 選ぶ / Enter …を調べる / Esc 入力を消す」と画面に出している以上、
// 入力欄にフォーカスがあるときだけ効くのでは約束を守れていない。
addEventListener("keydown",(e)=>{
  if(composing||e.isComposing||e.keyCode===229) return;   // 変換中は触らない
  const ae=document.activeElement;
  // メモ欄など他の入力欄の操作は邪魔しない
  if(ae&&ae!==qEl&&(ae.tagName==="TEXTAREA"||ae.tagName==="INPUT"||ae.isContentEditable)) return;
  // ボタンやリンクにフォーカスがあるときの Enter / Space は既定の動作に任せる
  // （クイック選択・★・書き出しボタン等を横取りしないため）
  if(ae&&ae!==qEl&&(ae.tagName==="BUTTON"||ae.tagName==="A")&&(e.key==="Enter"||e.key===" ")) return;

  // 未選択（sel<0）からの ↑↓ は先頭に付ける。ここで初めて Enter が武装する。
  if(e.key==="ArrowDown"){e.preventDefault(); if(items.length){sel=sel<0?0:Math.min(sel+1,items.length-1); markSel()}}
  else if(e.key==="ArrowUp"){e.preventDefault(); if(items.length){sel=sel<0?0:Math.max(sel-1,0); markSel()}}
  // 選んでいないときの Enter は本当に何も起こさない（薄字の表示と挙動を一致させる）
  else if(e.key==="Enter"){ if(sel>=0&&items[sel]){e.preventDefault(); run(items[sel])} }
  else if(e.key==="Escape"){
    e.preventDefault();
    if(mode==="action") document.getElementById("chipX").click();
    else if(qEl.value){ qEl.value=""; onInput(); qEl.focus(); }
  }
  // 文字を打ち始めたら入力欄へ吸い込む（ランチャーとして当然の挙動）
  else if(ae!==qEl&&e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey) qEl.focus();
});


// 根拠は「実測値そのもの」を出す。確率は出さない（docs 掟: 確率を出さない。実測値そのものを出す）。
//
// ⚠ 取れなかったときは根拠UIを出さない（掟: 取れなかったを「無い」と言わない）。
// 「読んだ画素 z16/58217,25812」と「参照したデータ」リンクは、読んだ証拠であって、
// 読めなかったときに出すと、最も権威ありげな見た目で最も誤ったことを言うことになる。
function evidenceOf(fa){
  if(fa.state==="unreachable") return "読み込めていないため、根拠はありません";
  const e=fa.evidence||{};
  const parts=[];
  if(e.pixel) parts.push(`読んだ画素 z${e.pixel.length>3?16:"-"}/${e.pixel[0]},${e.pixel[1]}`);
  if(e.rgba) parts.push(`rgba=${e.rgba.join(",")}`);
  if(e.agreement!=null) parts.push(`近傍一致率 ${(e.agreement*100).toFixed(1)}%`);
  if(e.raw!=null) parts.push(`生値 ${e.raw}`);
  if(e.source) parts.push(e.source);
  if(e.status) parts.push(`HTTP ${e.status}（タイルが存在しない）`);
  if(e.code) parts.push(`図式コード ${e.code}`);
  if(e.detail) parts.push(e.detail);
  if(e.artificialCode) parts.push(`人工地形 ${e.artificialCode}`);
  if(e.checked) parts.push(`${e.checked} 年代を確認`);
  if(fa.unread) parts.push(`${fa.unread} 年代は読み込めず`);
  let out=parts.join(" ／ ");
  if(e.tile) out+=`<br><a href="${e.tile}" target="_blank" rel="noopener">参照したデータ</a>`;
  return out||"—";
}

// ============ 場所を開く ============
// 地図の上で押された地点を、その場で判定し直す。
// ⚠ 地図は壊さない。壊すと、押した場所を見失う。
//   /eras にしか無かった「検索していない場所の昔を知る」を、ここへ移す。
async function judgeHere(lon,lat){
  stopPlay();
  await openPlace(lon,lat,`${lat.toFixed(4)}, ${lon.toFixed(4)}`,{keepMap:true});
}

async function openPlace(lon,lat,title,opt){
  // ⚠ 「地図を残す」といっても、判定カードを描き直すと **#map の要素ごと消える**。
  //   生きているのは JS のオブジェクトだけで、置き場所が無くなる。
  //   だから見ている位置だけを覚えて、描き直したあとに同じ位置で作り直す。
  const keepMap=!!opt?.keepMap;
  const view=(keepMap&&mapObj)
    ? {center:mapObj.getCenter(),zoom:mapObj.getZoom()} : null;
  current={lon,lat,title};
  chipName.textContent=title;
  meiji={loading:true};
  // ⚠ 着いたときに大きく出すのは「最古」。看板は「この土地は、昔なんだったのか？」なので、
  //   その問いに写真で即答している状態から始める。現在は1タップ先にある。
  //   ⚠ ただし URL で年代を指定されているなら、そちらが優先（共有された状態から始める）。
  stopSay(); stopPlay();
  frames=[]; eraIdx=0; eraTicked=false; evState=null; evTile=null; evOpen=false; listOpen.clear();
  // ⚠ 段を捨てたあとに置く。先に置くと、前の土地の段を見て URL を書くことになる
  wantEra=opt?.era??null; eraMiss=null;
  syncUrl();
  zoomOn=false; mixVal=0;
  dropMap();
  setMode("action");
  renderVerdict();
  if(!keepMap) qEl.focus();
  showResult();
  renderPrivate();

  const own=document.getElementById("own");
  own.innerHTML=`<div class="card"><div class="d">この土地の成り立ちを判定中…</div></div>`;
  // 検証器から「事実の集合」を受け取る。答えではなく、根拠つきの事実の並び。
  // 取得の層を直接呼ばない。⚠ **取れたものは land.js が控え、/peel が使い回す**
  const f = await KonjakuLand.facts(lon, lat);
  const m = f.byKey.meiji, el = f.byKey.elevation, ph = f.byKey.photos;

  // 見出し（コマンドの外に出す事実。掟: 外部の助言は、実測で確かめてから採る）
  const headline = Konjaku.narrate(f)[0];
  // 色（青＝水由来）は、いまや地形分類が主。明治期はもうひとつの手法（掟: 主題は「成り立ち」。明治期は手法のひとつ）
  const lf = f.byKey.landform;
  // 分母。共有率＝共有回数÷判定回数を出すために、判定が確定したことを1件数える。
  // 送るのは結果の種類（出た／広い区分／出ない／読めなかった）だけで、
  // 地名も座標も送らない（掟: 地名も座標も送らない の「自分専用」を破らない）
  KonjakuShare.tick(KonjakuShare.outcome(f));
  KonjakuShare.health(f);
  meiji = { loading:false, text: headline, facts: f,
            // 面の内訳（この範囲で 1 画素ずつ数えた結果）。⚠ 判定側（verify.js）が測ったものを
            //   そのまま持つ。ここで数え直さない（掟6: 同じ問いに答える実装を2つ持たない）
            area: m.area ?? null,
            water: lf.ok ? Konjaku.isWatery(lf.value) : !!m.water };
  if (current && current.lon===lon && current.lat===lat) {
    renderVerdict();
    // 押した場所を見失わないよう、同じ位置で地図を戻す
    if(view) ensureMap().then((m)=>{ if(m) m.jumpTo(view); });
    if (mode==="action") {
      // 判定が出ると提案が一覧の途中に挿し込まれる。番号で選択を持っていると、
      // 押そうとしていた行が別の行にすり替わる。中身で追い直す。
      const cur=sel>=0?items[sel]:null;
      items=foldItems(buildActions(qEl.value,current));
      const i=cur?items.findIndex(x=>x.label===cur.label):-1;
      if(i>=0) sel=i;
      renderList();
    }
  }

  // 事実1つを、値・取得方法・根拠・限界の順で出す。
  // 読めていないものは「直読み」ではない。取得方法のバッジも偽らない。
  const factCard = (fa, body) => `
    <div class="card" data-k="${fa.key}">
      <div class="t">${fa.label}<span class="method${
        fa.state === "unreachable" || fa.mixed ? " weak" : ""}">${
        TOPWORD.method(fa.state, fa.mixed, fa.method)}</span></div>
      ${body}
      ${fa.note ? `<div class="d" style="margin-top:3px">${fa.note}</div>` : ""}
      <div class="ev">${evidenceOf(fa)}${fa.caveat ? `<br>※ ${fa.caveat}` : ""}</div>
    </div>`;

  // 取れなかったものの値欄。「なし」「—」は事実の主張なので使わない。
  const unread = `<div class="v warn">読み込めませんでした
    <button class="retry">再試行</button></div>`;
  // 地形分類が先頭。見出しで言い切っているのはこれなので、根拠も最初に出す（掟: 根拠のないことは書かない）
  const lfBody = lf.state === "unreachable" ? unread
    : lf.ok
      ? `<div class="v ${Konjaku.isWatery(lf.value) ? "w" : ""}">${
          lf.value}${lf.artificial ? `　<span style="font-size:var(--fs-note)">＋ ${lf.artificial}</span>` : ""}</div>`
        + (lf.why ? `<div class="d" style="margin-top:3px">${lf.why}</div>` : "")
        // ⚠ **時期の限界。**⚠ 消さない（掟: 限界は必ず書く）。
        //   ⚠ 旧水部の定義は「…**かつて**…水部であったと確認できた土地」で、
        //     ⚠ **明治期に限定していない。**⚠ 下の「昔は、何があった？」（明治期）と
        //     並ぶと同じ時期の話に読まれ、実際に初見の人が誤った統合をした
        //     （「泥地＋水で約50%」）。
        //   ⚠ **2026-08-20 に、明治期の側の畳み（.area-src）からここへ移した。**
        //     ⚠ あちらは「上の『もとは』は別の資料です」と、⚠ **指し先を字面で書いていた**ので、
        //       言い回しを変えた瞬間に指し先を失った。⚠ **出どころの話は、出どころの欄に置く。**
        //   ⚠ **⚠ の印は使わない**（この製品では災害リスク専用。在庫や限界に使わない）。
        + `<div class="d" style="margin-top:3px">この区分に、いつの姿かは書かれていません</div>`
        + (lf.risk ? `<div class="d" style="margin-top:3px">災害リスク: ${lf.risk}</div>` : "")
      : `<div class="v warn">${KonjakuWords.S.cantTell}</div>`;
  own.innerHTML =
    factCard(lf, lfBody) +
    factCard(m, m.state === "unreachable" ? unread
      : `<div class="v ${m.water ? "w" : m.ok ? "" : "warn"}">${
        TOPWORD.meiji(m.value, m.none)}</div>`) +
    (el.ok
      ? factCard(el, `<div class="v ${el.value < 0 ? "w" : ""}">${el.value.toFixed(2)} m${
          TOPWORD.belowSea(el.value)}</div>`)
      : factCard(el, el.state === "unreachable" ? unread : `<div class="v warn">—</div>`)) +
    // ⚠ 「残っている空中写真」の根拠カードは出さない。
    //   根拠パネルは「その主張が、どのデータのどの画素から出たか」を見せる場所で、
    //   写真の年代は主張ではなく**画面にそのまま並んでいるもの**。
    //   帯に9コマ並び、脚注に「残っていた空中写真は 7 年代（7 年代中）」と書き、
    //   バッジにも年代が出ている状態で、根拠に4つ目の言い方を足すと、
    //   利用者は「どれが答えなのか」を数え直すことになる。
    // ⚠ **深掘りの導線は、⚠ ここに置かない**（2026-08-21。hidetzu/konjaku#138）。
    //   ⚠ 以前はここに「この場所を深掘り」のカードがあり、⚠ **一覧行と 2 か所**だった。
    //   ⚠ 実測（2026-08-21・豊洲・SW 無効）: 根拠を開くと、⚠ **`#own` に 1 個・一覧に 1 個。**
    //     ⚠ 同時に目に入りはしない（開くと一覧は画面の上の外へ流れる）が、
    //     ⚠ **DOM には常に 2 つあり、同じ判定で同じことを言っていた。**
    //   ⚠ 利用者役 4 名に画面だけを見せた: ⚠ **4/4 が一覧行を残すと答え、⚠ 4/4 がここを否定した。**
    //     「根拠を読み終わったところに出てくるのは唐突」
    //     「同じものが 2 回出てくるのは、押し忘れたかと思う」
    //     「根拠の一部に見える。ここから別の画面へ飛ぶとは思わない」
    //   ⚠ **導線は一覧行の 1 か所**（index.html の buildActions）。⚠ ここへ戻さない。
    "";
  // 再試行はカード側にも置く。根拠を開いた人がそこで詰まらないように。
  own.querySelectorAll(".retry").forEach((b)=>{
    b.onclick=()=>{ const c=current; if(c) openPlace(c.lon,c.lat,c.title); };
  });
}
// 根拠は既定では開かない。判定は常に見せ、詳細は ? を押した人にだけ出す。
const showResult=()=>{};

// ============ クイック ============
// ⚠ ピンは、取り込み済みの土地からしか選ばない。
//   押した先が未整備だと、入口でいきなり「分かっていません」に当たる。
//   seeds/areas.jsonl に入っていること（scripts/check.mjs が突き合わせている）。
//   選び方は scripts/survey.mjs の実測から。判定がばらけるように選んである
//   （全部「昔は水」だと、どこを押しても同じ話になり、判定を疑えない）。
const quickEl=document.getElementById("quick");
// ⚠ **トップの場所未選択で出すのは 3 件だけ。**
//   10 件を出していたとき、実測（2026-08-17 / 375×667）で 3 行・169px を占め、
//   検索欄と同じ強さの入口が 10 個並んで見えていた（UI/UX レビュー 原則2「主役は1つ」）。
//   ここは「おすすめ一覧」ではなく、**何を打てばいいか分からない人への入力例**なので、
//   3 件で足りる。
//   ⚠ **配っているデータ（10 件）は減らさない。** 出すのを 3 件にするのは、この画面の見せ方だけ。
//     ⚠ 2026-08-18 まで「`/peel` の『別の場所を見る』が全件を出している」を理由にしていたが、
//       **その口は外した**（場所を決めるのはトップの責務）。それでも減らさない理由は変わらない:
//       10 件は**取り込み済みの土地の一覧**で、3D の下地がどこにあるかの出どころでもある。
//       ⚠ 減らすと、下地がある場所を指す手がかりが画面から減る。
//   ⚠ 選び方は「有名な3つ」ではなく、**今昔の違う面が見える3地点**
//     （豊洲＝埋立で海岸線が動く／渋谷＝都市化／広島＝歴史的背景）。
//   ⚠ id は quick-places.json 側にしか無いものを指している。**scripts/check.mjs が
//     この 3 つの id の実在を突き合わせている**（掟: 同じ問いに答える実装を2つ持つなら機械で突き合わせる）。
const TOP_EXAMPLE_IDS=["toyosu","shibuya","hiroshima"];
function loadQuickPlaces(){
  quickEl.replaceChildren();
  fetch("./data/quick-places.json",{cache:"no-cache"}).then(r=>{
    if(!r.ok) throw new Error(`quick places ${r.status}`);
    return r.json();
  }).then(data=>{
    const all=data?.places??[];
    const byId=new Map(all.map(p=>[p.id,p]));
    const picked=TOP_EXAMPLE_IDS.map(id=>byId.get(id)).filter(Boolean);
    // ⚠ 読めたのに 1 件も選べないときは、**黙って空にしない**。配っているデータの
    //   id が入れ替わった場合で、例が出ないより先頭 3 件を出したほうが利用者は困らない
    //   （どれも「取り込み済みの土地」であることは check.mjs が全件について見ている）。
    const places=picked.length?picked:all.slice(0,3);
    // ⚠ **例であることを名乗る。** 名乗らないと、地名が検索欄と同じ強さの
    //   主ボタンとして並んで見える（UI/UX レビュー 原則2「主役は1つ」。実測 10 個・144px）。
    //   ⚠ **中に入れる**（#quick の子）。外に置くと、取得に失敗したときに
    //     見出しだけが残り、例が1つも無いのに「たとえば」と言うことになる。
    //     ここなら、成功した経路でしか作られない。
    if(places.length){
      const lead=document.createElement("span"); lead.className="q-lead";
      lead.textContent="たとえば"; quickEl.appendChild(lead);
    }
    for(const p of places){
      const b=document.createElement("button"); b.textContent=p.name;
      b.onclick=()=>openPlace(p.lon,p.lat,p.title);
      quickEl.appendChild(b);
    }
  }).catch(()=>{
    const msg=document.createElement("span"); msg.className="quick-error";
    msg.textContent="候補地を読み込めませんでした。";
    const retry=document.createElement("button"); retry.type="button"; retry.textContent="再試行";
    retry.onclick=loadQuickPlaces; msg.append(" ",retry); quickEl.appendChild(msg);
  });
}
loadQuickPlaces();

// ⚠ **いちばん強い約束 2 つを、⚠ フッターの畳まずに見える場所に出す**（2026-08-23。Owner 判断）。
//   ⚠ **3 段（載る → 届く → 残らない）は、⚠ すぐ下の「▸ プライバシーについて」にある。**
//   ⚠ **何が弱くなったかは words.js の PRIVACY_LEAD に書いた。**⚠ ここには写さない。
//   ⚠ 中身は words.js の定数 1 つだけ。⚠ **外から来た文字列は 1 文字も混ぜない**
//     （だから innerHTML でよい。混ぜるようになったら esc.js を通すこと）。
//   ⚠ 出せなかったときに黙って空にしない。⚠ **空なら、そこに何かあるはずだと誰も気づけない。**
{
  const el = document.getElementById("privacyShort");
  if (el) {
    if (KonjakuWords?.PRIVACY_LEAD) el.innerHTML = KonjakuWords.PRIVACY_LEAD;
    else el.remove();   // ⚠ 空の箱を残さない（余白だけが増える）
  }
}

// 3D の下地の索引を、場所を選ぶより先に引いておく。
// ⚠ 引き終わるまで `hasSync` は null（＝分からない）を返し、導線は**出したまま**になる。
//   共有された URL でいきなり場所が開くときだけ、この窓に入りうる。
//   だから、読み終わった時点で行動一覧を組み直す。
//   ⚠ 根拠カードのほうは組み直さなくてよい。あれは判定（通信）を待ってから描くので、
//     手元の小さな索引はその前に読み終わっている。
//   ⚠ 場所を見ていないときは何もしない（組み直す相手がいない）。
KonjakuGround.load().then(()=>{
  if(!current||mode!=="action") return;
  items=foldItems(buildActions(qEl.value,current)); renderList();
});

// ============ 現在地 ============
// スマホでの入口。街歩き中に、その場の土地を調べられるようにする（掟: 場所のランチャーとして作る 差分5）
const hereBtn=document.getElementById("here");
const hereMsg=document.getElementById("hereMsg");
const HERE_LABEL="📍";

// 一度拒否すると、ブラウザは二度と許可を尋ねてくれない。
// 「許可されていません」と出して数秒で戻すだけだと、押しても何も起きない
// ボタンが残るだけで、利用者は詰む。復帰のしかたと代わりの手段を必ず示す。
function hereDenied(){
  hereBtn.disabled=true;
  hereBtn.textContent="📍"; hereBtn.title="現在地は使えません（設定を確認）";
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent);
  hereMsg.innerHTML=`
    <b>位置情報が拒否されています。</b>ブラウザは一度断られると再度尋ねないため、
    設定から許可し直す必要があります。<br>
    ${RELOCATE_HOW(ios)}
    <br><span class="dim">許可しなくても、<b>地名を入力すれば同じことが調べられます。</b></span>`;
  hereMsg.style.display="";
}
function hereFailed(msg){
  hereBtn.disabled=false; hereBtn.classList.remove("busy"); hereBtn.title="現在地から調べる";
  hereMsg.innerHTML=`${msg}<br><span class="dim">地名を入力すれば同じことが調べられます。</span>`;
  hereMsg.style.display="";
}

if(!navigator.geolocation){
  hereBtn.disabled=true; hereBtn.textContent="📍"; hereBtn.disabled=true; hereBtn.title="この端末では現在地を使えません";
} else {
  // 事前に状態が分かるなら、押させる前に伝える（対応ブラウザのみ）
  navigator.permissions?.query({name:"geolocation"})
    .then((st)=>{ if(st.state==="denied") hereDenied();
      st.onchange=()=>{ if(st.state!=="denied"){ hereBtn.disabled=false;
        hereBtn.title="現在地から調べる"; hereMsg.style.display="none"; } }; })
    .catch(()=>{});

  hereBtn.onclick=()=>{
    hereBtn.disabled=true; hereBtn.classList.add("busy"); hereBtn.title="現在地を取得中…";
    hereMsg.style.display="none";
    navigator.geolocation.getCurrentPosition(
      (pos)=>{ hereBtn.disabled=false; hereBtn.classList.remove("busy"); hereBtn.title="現在地から調べる";
        openPlace(pos.coords.longitude, pos.coords.latitude, "現在地"); },
      (err)=>{
        if(err.code===1) hereDenied();                                  // 拒否
        else if(err.code===3) hereFailed("現在地の取得が時間切れになりました。");
        else hereFailed("現在地を取得できませんでした（電波状況などの可能性）。");
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:60000 });
  };
}

// ============ 深掘りの URL に場所が無かったとき ============
// ⚠ **hidetzu/konjaku#221。**⚠ `/peel` は場所が読めないとき、⚠ ここへ返してくる。
//   ⚠ **`/peel` が黙って豊洲を出すのをやめた**ので、⚠ **なぜトップにいるのかをここで言う。**
//
// ⚠ **数秒で自然に閉じる**（Owner 判断 2026-08-23）。⚠ **ただし消えるのはこの 1 行だけ。**
//   ⚠ **「次に何をすればいいか」は、⚠ 下の `.hint` が常時言っている**（ADR 0026）。
//
// ⚠ **読んでいる途中で消さない。**⚠ hover 中・中にフォーカスがあるあいだは止める。
// ⚠ **動きを止めている人には、⚠ 待たずに消さない**（⚠ 勝手に画面が変わるのを避ける）。
// ⚠ **URL から `noplace` を落とす。**⚠ 残すと、⚠ 共有した先でも同じ断りが出る。
{
  const sp0=new URLSearchParams(location.search);
  // ⚠ **`/peel` から戻されたときの理由**（`?noplace=`）。
  //   ⚠ **それだけを見ていた**ので、⚠ **壊れた URL をトップで直接開いた人には
  //     何も言っていなかった**（2026-08-24 に実測して直した）。
  //   ⚠ 実測（`main` = `384e4ef`・375×667）: ⚠ `?ll=999,0` は断りが出ないどころか、
  //     ⚠ **`?q=999.0000, 0.0000` という在りもしない地名を作って URL に載せていた。**
  // ⚠ **`bad`（指定はあったが読めない）だけを足す。**
  //   ⚠ **`none`（何も指定していない）は足さない。**⚠ 何も指定していない人に言うことは無い
  //     （Owner 判断 2026-08-23。`place-arg.js` の `topUrlFor` と同じ判断）。
  const why=sp0.get("noplace")
    ?? (KonjakuPlaceArg.readPlace(sp0).state==="bad" ? "bad" : null);
  const el=document.getElementById("flashNote");
  const say=KonjakuWords?.noPlace?.[why];
  // ⚠ **知らない値は黙って捨てる**（⚠ 内部状態をそのまま画面に出さない。CLAUDE.md §4）
  if(el && say){
    // ⚠ **字は words.js の 1 か所。**⚠ 外から来た文字列は 1 文字も混ぜない
    //   （⚠ `noplace` の値そのものは出さない。⚠ 出すなら esc.js を通すこと）。
    el.innerHTML=`<div class="flashnote"><span class="flashnote__text">${esc(say)}</span>`
      + `<button type="button" class="flashnote__close" aria-label="この案内を閉じる">✕</button></div>`;
    const box=el.firstElementChild;
    const shut=()=>{ el.innerHTML=""; };
    box.querySelector(".flashnote__close").addEventListener("click",shut);
    // ⚠ **地名を入れてほしいので、⚠ 検索欄へフォーカスを送る**（Owner 判断）。
    //   ⚠ **`autofocus` は既に付いているが、⚠ 戻ってきた直後に確実に当てる。**
    try{ document.getElementById("q")?.focus(); }catch{}
    // ⚠ **自然に閉じる**（Owner 判断 2026-08-23）。⚠ **10 秒。**
    //   ⚠ **6 秒では足りなかった。**⚠ 利用者役 4 名に触ってもらった結果、
    //     ⚠ **2/4 が「読み終わる前に消えた」**（⚠ 実在の利用者ではない）。
    //   ⚠ **見つける 3 秒 ＋ 読む 7 秒**（⚠ この文は 40 字。⚠ 黙読を 6 字/秒として約 7 秒）。
    //   ⚠ **hover とフォーカスでも止まるが、⚠ 指の端末に hover は無い。**
    //     ⚠ **だから、⚠ 止められない人に合わせて長さを決める。**
    //   ⚠ **邪魔なら `✕` で閉じられる**（⚠ 44×44）。
    let t=null;
    const stop=()=>{ if(t){ clearTimeout(t); t=null; } };
    const go=()=>{ stop(); t=setTimeout(shut,10000); };
    box.addEventListener("pointerenter",stop);
    box.addEventListener("pointerleave",go);
    box.addEventListener("focusin",stop);
    box.addEventListener("focusout",go);
    go();
  }
  // ⚠ **`noplace` を URL から落とす**（⚠ 出したあと。⚠ 出す前に落とすと読めない）。
  //   ⚠ **`q` と `era` は残す。**⚠ 下の「URL から復元」がそれを使う。
  // ⚠ **落とすのは、⚠ 実際に `noplace` が載っていたときだけ**（⚠ `why` は上で足しているので、
  //   ⚠ `why!==null` で見ると、⚠ `?ll=abc` のときに何も落とさない書き換えが走る）。
  if(sp0.has("noplace")){
    sp0.delete("noplace");
    const rest=sp0.toString();
    history.replaceState(null,"",rest ? `./?${rest}` : "./");
  }
}

// ============ URL から復元 ============
const sp=new URLSearchParams(location.search);
// ⚠ **読むのは `place-arg.js` の 1 か所**（`/peel` と同じ答えから引く）。
//   ⚠ 以前はここに同じ正規表現を直書きしていた。⚠ **地球の外の座標を弾いていなかった**
//     ので、`?ll=999,0` で地図が別の場所を出していた（`/peel` は hidetzu/konjaku#221 で直っていた）。
// ⚠ era が無い古い URL（q と ll だけ）も、これまでどおり開ける。既定の年代で始まるだけ
const era0=sp.get("era");
const arg=KonjakuPlaceArg.readPlace(sp);
if(arg.state==="ok"){
  openPlace(arg.lon,arg.lat,arg.q||`${arg.lat.toFixed(4)}, ${arg.lon.toFixed(4)}`,{era:era0});
} else if(arg.q){ qEl.value=arg.q; searchPlace(arg.q); }
else { renderSaved(); renderKbd(); }
