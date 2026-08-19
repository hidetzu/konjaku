// 「立体で見る」の中身。
//
// ⚠ peel.html から出した（2026-08-14）。理由は2つ。
//   1. インラインのままだと、3D を押さない人にも HTML ごと配られる
//      （sw.js の SHELL に "/peel" が入っている）。MapLibre 1,032KB を SHELL から
//      外した判断と同じ。gz 換算で約 18KB。
//   2. peel.html が 1,290行あり、名乗り・markup・3D の実装が同じファイルに同居していた。
//
// ⚠ **sw.js の SHELL に入れないこと。** SHELL の中身がそのまま版（ハッシュ）なので、
//   ここを1行直すたびに全利用者のキャッシュが丸ごと飛ぶ。
//   scripts/check.mjs が、入っていないことを見張っている。
//
// ⚠ scripts/check.mjs は、このファイルの中身を**正規表現で取り出して実際に動かしている**
//   （unpackBuildings の詰め方照合／visibleEras の全位置検証）。
//   関数名や書き出しを変えるときは、検査の参照先も対で直すこと。
//   片方だけ直すと「検査が緑のまま何も見ていない」状態になる。

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
// ⚠ **地図に出す帰属表示。** 出典明示は利用の条件であって、飾りではない。
//   地理院タイル: 出典明示が利用の条件 ／ OpenStreetMap: ODbL でクレジット必須
// ⚠ **開かないと見えない場所に置かない。** 2026-08-17 に実測で見つけた:
//   `attributionControl:false` ＋ CSS の `display:none!important` で地図側の帰属を消し、
//   手書きの出典は**左パネルの中**にあった。パネルはスマホで閉じて始まる。
//   実測: PC 1280×800 で y=920（画面外 120px 下）／375×667 は閉じたパネルの中。
// ⚠ `checkVisibility()` は閉じたパネルの中でも true を返す。素朴な検査では捕まらない。
const ATTR_GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const ATTR = ATTR_GSI;

// 外部から来た文字列（OSM のタグ・地理院の地名）は、HTML を組み立てるところで必ず通す。
// ⚠ 読み上げ（pickSpeech）には通さない。あちらは HTML ではない（理由は esc.js）
const {esc} = KonjakuEsc;

// 年代の定義（id・ラベル・拡張子・ズーム範囲）は **verify.js の1か所だけ**。
// ここは並べ替えるだけで、写しを持たない（掟: 同じ問いに答える実装を2つ持たない）。
//
// ⚠ 以前はここに固定 8 段の写しがあり、**その地点に存在しない年代まで地図に出していた**。
//   実測（2026-08-16）: 広島で写真タイルの 404 を 202 件、長崎 出島で 491 件送っていた。
//   トップは同じ地点で「残っている写真は 広島 5 年代 / 出島 2 年代」と正しく答えており、
//   同じ問いに 2 つの実装が別の答えを出していた。
//
// ALL_ERAS は新しい順（現在 → 1936–42）。**この並びの位置がそのまま時間座標**になる。
const ALL_ERAS = [Konjaku.LATEST, ...[...Konjaku.ERAS].reverse()];
// 時間座標（tau）。現在=0 / 1987–90=1 / … / 1936–42=7 / 明治期=8。
// ⚠ **段を間引いても、この座標は動かさない。** 建物が消える年（tFromYear）・水位・
//   建物のフェードは全部この座標で決まっている。表示から 2 段抜いたぶんだけ詰めると、
//   広島では建物の消える年代が別の年へずれる。
const TAU = new Map(ALL_ERAS.map((e, i) => [e.id, i]));
const TAU_MEIJI = ALL_ERAS.length;
const MEIJI = { id:"swale", label:"明治期", sub:"低湿地データ ─ 写真は存在しない", meiji:true };
// 年代の副題。verify.js は「陸軍撮影」「米軍撮影」だけを持ち、残りは空。
// ⚠ 空欄にすると年代の箱の2行目が消えて高さが跳ねるので、既定の語をここで補う。
//   ラベル・年の範囲そのものは verify.js のものを使う（こちらで作らない）。
const subOf = (e) => e.sub || "空中写真";

// ⚠ 年代の写真は、そこへ行くまで読まない。
//   以前は8年代ぶんを最初に全部 addLayer していた。raster-opacity:0 にしてあったが、
//   **MapLibre は不透明度が 0 でもタイルを取りに行く**（isHidden は opacity を見ない。
//   visibility:"none" だけが used=false にする）。
//   実測（初回訪問・豊洲）: 開いただけで国土地理院へ 556 枚。うち 420 枚は
//   **1枚も画面に描かれない**。国土地理院が示す唯一の目安
//   「キャッシュした1枚1枚が平均1回以上は実際に使用されること」に真っ向から反していた。
//   （https://github.com/gsi-cyberjapan/mokuroku-spec）
//   556 枚は sw.js の棚（TILE_MAX=250）にも収まらず、同じ回のうちに自分のタイルを自分で捨てていた。
//
//   実測: 556 → 136 枚。端まで送った人の総量は 556 のままで、無駄が減っただけ。
//   1.6Mbps 相当では、判定の根拠（swale の画素読み）が届くのが 41.98秒 → 22.30秒 と早くなる
//   （見ていない年代の写真が帯域を占めなくなるため）。初期表示は 13.4 秒で変わらない。
//
// ⚠ 先読みの段数はここにしか書かない。render() の外に同じ判断が生えると、
//   片方だけ直したときに静かに 556 へ戻る。
const LOOKAHEAD = 1;
// ▶ で通しで送るときだけ、全部を先に読む（押した人だけが払う）。
//   1段あたり約1.4秒しかないので、隣1段では間に合わない
let preloadAll = false;

// 全段（まだ地点が決まっていないとき用）。⚠ 段の作り方はここ1か所だけにする
const allSteps = () => [...ALL_ERAS.map((e) => ({ ...e, tau:TAU.get(e.id), state:"ok" })),
                        { ...MEIJI, tau:TAU_MEIJI, state:"ok" }];
// いま画面が持っている段。**地点ごとに loadArea() が組み直す。**
//   steps[k] … k 段目（左端の「現在」が 0、右端が明治期）
//   .tau     … 時間座標。段を間引いても動かない
// ⚠ 既定は全段。地点の写真が分かるまでは timelineReady=false のあいだ先読みを止める。
//   止めないと、まだ存在を確かめていない年代のタイルを取りに行ってしまう。
let steps = allSteps();
let timelineReady = false;
// 写真の段数（＝明治期を除いた段の数）。明治期の位置は steps.length-1
const photoSteps = () => steps.length - 1;

// t は slider の位置（0〜段数）。読んでよい**段の番号**を返す。
// ⚠ 不透明度が 0 より大きい段（k===i と k===i+1）は必ず含めること。
//   外すと、送っている途中で画面が抜ける。scripts/check.mjs が全位置で確かめている。
// ⚠ 番号は「年代」ではなく「段」。地点によって中身が変わる（広島では 7 段）。
function visibleEras(t, nPhoto){
  const s=new Set();
  if(preloadAll){ for(let k=0;k<nPhoto;k++) s.add(k); return s; }
  const i=Math.min(Math.floor(t),nPhoto-1);
  // ⚠ i と i+1 は、送っている途中に両方が描かれる（k===i が 1-f、k===i+1 が f）。
  //   LOOKAHEAD=1 は「いま描いている i の、1段先まで」＝ {i, i+1}。
  //   i+1 の区間に入った瞬間に i+2 を読み始めるので、次の1段は必ず先に載っている。
  for(let k=i;k<=i+LOOKAHEAD;k++) if(k>=0&&k<nPhoto) s.add(k);
  return s;
}
// 明治期の重ねも同じ。最後の1区間でしか見えないのに 60 枚引いていた。
// ⚠ 判定に使う画素読み（実測16枚）はこれとは別の経路なので、止まらない
const swaleVisible = (t, nPhoto) => preloadAll || t >= nPhoto-1-LOOKAHEAD;

// 段の位置（pos）から時間座標（tau）へ。段のあいだは線形に補間する。
// ⚠ ここが分離の本体。**pos は「何段目か」、tau は「いつか」。**
//   広島では 1936–42 と 1984–86 が無いので 7 段しか無いが、
//   建物が消える年（tFromYear が返すのは tau）はこの補間を通すことで動かない。
function tauAt(pos){
  const i=Math.max(0,Math.min(Math.floor(pos),steps.length-2)), f=pos-i;
  return steps[i].tau + f*(steps[i+1].tau - steps[i].tau);
}

// ⚠ 14 区分と 1 画素の分類は **swale.js の1か所**。ここに書き写さない
//   （peel.html が verify.js より先に読み込んでいる）。
const SWALE = KonjakuSwale.SWALE;
const Z = 16;
const lon2xf=(l)=>((l+180)/360)*2**Z;
const lat2yf=(l)=>{const r=l*Math.PI/180;return ((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2)*2**Z};
const xf2lon=(x)=>x/2**Z*360-180;
const yf2lat=(y)=>{const n=Math.PI-2*Math.PI*y/2**Z;return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)))};

const raster=(l)=>({type:"raster",tiles:[`${GSI}/${l.id}/{z}/{x}/{y}.${l.ext}`],
  tileSize:256,minzoom:l.min,maxzoom:l.max,attribution:ATTR});

// ⚠ **false に戻さない。** 戻すと利用条件を満たさなくなる（検査が落ちる）
const map = new maplibregl.Map({ container:"map", attributionControl:{compact:true}, maxPitch:80,
  center:[139.7975,35.6548], zoom:15.05, pitch:56, bearing:-20,
  style:{version:8,sources:{},layers:[{id:"bg",type:"background",paint:{"background-color":"#080b0f"}}]} });
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"top-right");

// ============================================================
// 明治期低湿地タイルの読み取り
//   取得そのものは verify.js（Konjaku.loadImage）に任せる。
//   404（本当に無い）と通信失敗（取れなかった）を分け、8秒で打ち切る。
//   ここで区別しないと、通信が落ちただけの土地に
//   「明治期のデータがありません」と書いてしまう（掟: 取れなかったを「無い」と言わない）。
// ============================================================
const OK="ok", ABSENT="absent", UNREACHABLE="unreachable";
const tileCache = new Map();
function getTile(x,y){
  const k=`${x}/${y}`;
  if(!tileCache.has(k)) tileCache.set(k,readTile(x,y,k));
  return tileCache.get(k);
}
async function readTile(x,y,k){
  const res=await Konjaku.loadImage(`${GSI}/swale/${Z}/${x}/${y}.png`);
  // 失敗は覚えない。覚えると再試行が空振りする
  if(res.state===UNREACHABLE){ tileCache.delete(k); return {state:UNREACHABLE,data:null}; }
  if(res.state===ABSENT) return {state:ABSENT,data:null};
  const c=document.createElement("canvas"); c.width=c.height=256;
  const g=c.getContext("2d",{willReadFrequently:true}); g.drawImage(res.image,0,0);
  return {state:OK,data:g.getImageData(0,0,256,256).data};
}
const classify = KonjakuSwale.classify;
async function sampleSwale(lon,lat){
  const xf=lon2xf(lon),yf=lat2yf(lat),x=Math.floor(xf),y=Math.floor(yf);
  const {state,data:d}=await getTile(x,y);
  if(state!==OK) return {state};      // absent（整備対象外） / unreachable（読めていない）
  const i=(Math.floor((yf-y)*256)*256+Math.floor((xf-x)*256))*4;
  const [r,g,b,a]=[d[i],d[i+1],d[i+2],d[i+3]];
  if(a===0) return {state:OK,none:true,rgba:[r,g,b,a]};
  const c=classify(r,g,b);
  return c?{state:OK,cls:c,water:!!c.water,rgba:[r,g,b,a]}
          :{state:OK,unknown:true,rgba:[r,g,b,a]};
}

// ============================================================
// 事前計算データ（掟: 取れなかったを「無い」と言わない）
//   Overpass は本番で 504／無応答が常態で、README と OGP が掲げる
//   99.4%（建物）が利用者の画面に出ていなかった。
//   事前に取ってある範囲では、実行時に外部へ出ない。
//   どの範囲のデータがあるかは data/areas.json で引く

// 取り込み済みの建物タイル（z14）。
// ⚠ 束ねない。実測で、いちばん重い z14 タイルが 6,510件 / gz 174KB。
//   z12 に束ねると1束 約3.9MB になり、600m四方を見るために引かせる量ではない。
let blAt=null, blTrunc=false;
// ⚠ **「取り込んであるか」の判定は ground.js の1か所**（掟: 同じ問いに答える実装を2つ持たない）。
//   トップの「この場所を深掘り」を出すかどうかも、同じ答えで決めている。
//   ここに書き写すと、**トップが「深掘りできる」と言った場所で、こちらが
//   Overpass に落ちる**状態を作れてしまう。
//   ⚠ peel.html が ground.js を peel3d.js より先に読み込んでいる。
// ⚠ **「答えられなかった」を1つに潰さない**（2026-08-18）。
//   以前はここが 4 つの別々の理由を全部 `null` で返していた。
//   受け手はそれを「取得できませんでした（Overpass 混雑）」と1つの文にしていたので、
//   **一度も取り込んでいない場所で「混雑のせい」と書いていた**（実測: 名古屋）。
//   利用者役 3/3 が、その文を「自分の通信のせい」と読み、2 名が押し直すと答えた。
//
//   ⚠ このリポジトリが何度も直してきた並びに、1 行足りていなかった:
//       まだ用意していない  ≠  取得できなかった
//   前者は**こちらの都合**、後者は**相手や回線の都合**。
//   利用者にとっては「押し直すべきか」が変わるので、意味がまるで違う。
const BL_OK="ok", BL_ABSENT="absent", BL_UNREACHABLE="unreachable",
      BL_UNKNOWN="unknown", BL_STALE="stale";
async function loadBuildingTiles(bbox){
  await KonjakuGround.load();
  const known=KonjakuGround.hasSync((bbox.w+bbox.e)/2,(bbox.s+bbox.n)/2);
  // 索引そのものを読めていない。⚠ 「無い」と言わない
  if(known===null) return { state:BL_UNKNOWN };
  const spec=KonjakuGround.tilesFor(bbox);   // 1枚でも欠けたら null（静的では答えない）
  if(!spec) return { state:BL_ABSENT };      // ⚠ **未登録**。こちらがまだ用意していない
  const got=await Promise.all(spec.keys.map(k=>{
    const [x,y]=k.split("/");
    const path=spec.tile.replace("{x}",x).replace("{y}",y);
    return fetch(path).then(r=>r.ok?r.json():null).catch(()=>null);
  }));
  // 索引は「見た」と言っているのに読めない。⚠ こちらの配信の問題で、未登録ではない
  if(got.some(g=>!g)) return { state:BL_UNREACHABLE };
  const features=[]; let at=null, truncated=false;
  for(const g of got){
    // ⚠ 詰めた形（現行版）でないものは使わない。GeoJSON のまま配っていた古いファイルが
    //   残っていたら、静かに混ぜるより Overpass の道に落ちたほうがよい
    if(g.v!==BL_V) return { state:BL_STALE };
    features.push(...unpackBuildings(g));
    if(!at||(g.at&&g.at<at)) at=g.at;      // いちばん古い区画に合わせる
    if(g.truncated) truncated=true;
  }
  return { state:BL_OK, features, at, truncated };
}
// 詰めた建物を戻す。⚠ 詰める側は scripts/bl-format.mjs。**必ず対で直す**。
//   片方だけ直すと、建物の形が静かにずれる（画面は何も言わない）。
//   scripts/check.mjs が、この関数と bl-format.mjs の unpack を同じ入力で
//   突き合わせている。
const BL_V=3, BL_HSRC=["measured","levels","default"];   // ⚠ 順番を変えない
function unpackBuildings(d){
  const [oLon,oLat]=d.o, q=d.q, out=[];
  for(const r of d.b){
    const ring=[]; let x=0,y=0;
    const start=d.v>=3?7:4;
    for(let i=start;i<r.length;i+=2){
      x = i===start ? r[i]   : x+r[i];
      y = i===start ? r[i+1] : y+r[i+1];
      ring.push([(oLon+x)/q,(oLat+y)/q]);
    }
    ring.push(ring[0]);                    // 詰めるとき最後の点を落としてある
    out.push({type:"Feature",
      properties:{height:r[0]/10, heightSource:BL_HSRC[r[1]], kind:d.k[r[2]],
        startDate:r[3]?String(r[3]):null,
        name:d.v>=3?(d.n?.[r[4]]??null):null,
        meiji:d.v>=3?(d.m?.[r[5]]??null):null,
        wasWater:d.v>=3?(r[6]?1:0):0},
      geometry:{type:"Polygon",coordinates:[ring]}});
  }
  return out;
}
//   （地点を足すときに HTML を触らなくて済むように、索引を外へ出した）。
// ============================================================
let AREAS=null;
async function loadAreas(){
  if(AREAS) return AREAS;
  const j=await loadJSON("./data/areas.json");
  AREAS=j?.areas??[];            // 索引が読めなければ Overpass の道に落ちるだけ
  return AREAS;
}
async function loadJSON(path){
  try{
    const r=await fetch(path,{signal:AbortSignal.timeout(15000)});
    return r.ok?await r.json():null;
  }catch{ return null; }
}
// 調べる地点がその範囲に入っていれば、その範囲の事前計算データを使う。
// 集計範囲は事前計算の bbox そのものにする（件数と % が範囲と一致していないと、
// 「545件すべての足元を判定した」が言えなくなる）。
const findArea=(areas,lon,lat)=>areas.find((a)=>{
  const b=a.bbox; return lon>=b.w&&lon<=b.e&&lat>=b.s&&lat<=b.n;
})??null;

// ============================================================
// 水域をその場でポリゴン化する（build-water.js のブラウザ版）
//   ラスタのままだと地面に貼った絵にしかならず、水が「戻ってくる」感じが出ない。
//   重ならない矩形に分解するので、半透明にしても継ぎ目が濃くならない。
// ============================================================
async function buildWater(bbox){
  const x0=Math.floor(lon2xf(bbox.w)), x1=Math.floor(lon2xf(bbox.e));
  const y0=Math.floor(lat2yf(bbox.n)), y1=Math.floor(lat2yf(bbox.s));
  const TW=(x1-x0+1)*256, TH=(y1-y0+1)*256;
  const mask=new Uint8Array(TW*TH);
  let waterPx=0, classifiedPixels=0, transparentPixels=0, unknownPixels=0;
  const classCounts=Object.fromEntries(SWALE.map((c)=>[c.name,0]));
  // タイルごとの結末を数える。1枚も読めていないのに「データがありません」と
  // 書かないために、absent（404）と unreachable（読めず）を分けて持つ。
  const tiles={ok:0,absent:0,unreachable:0};

  const jobs=[];
  for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++)
    jobs.push(getTile(tx,ty).then((r)=>({tx,ty,...r})));
  for(const {tx,ty,state,data:d} of await Promise.all(jobs)){
    if(state!==OK){ tiles[state]++; continue; }
    tiles.ok++;
    const ox=(tx-x0)*256, oy=(ty-y0)*256;
    for(let y=0;y<256;y++) for(let x=0;x<256;x++){
      const i=(y*256+x)*4;
      if(d[i+3]===0){ transparentPixels++; continue; }
      const c=classify(d[i],d[i+1],d[i+2]);
      if(!c){ unknownPixels++; continue; }
      classCounts[c.name]++; classifiedPixels++;
      if(c.water){ mask[(oy+y)*TW+(ox+x)]=1; waterPx++; }
    }
  }

  // 貪欲法で重ならない矩形に分解
  const used=new Uint8Array(TW*TH), feats=[];
  for(let y=0;y<TH;y++) for(let x=0;x<TW;x++){
    const i=y*TW+x;
    if(!mask[i]||used[i]) continue;
    let w=0; while(x+w<TW&&mask[i+w]&&!used[i+w]) w++;
    let h=1;
    outer: while(y+h<TH){
      for(let k=0;k<w;k++){const j=(y+h)*TW+x+k; if(!mask[j]||used[j]) break outer;}
      h++;
    }
    for(let dy=0;dy<h;dy++) used.fill(1,(y+dy)*TW+x,(y+dy)*TW+x+w);
    const lonA=xf2lon(x0+x/256), lonB=xf2lon(x0+(x+w)/256);
    const latA=yf2lat(y0+y/256), latB=yf2lat(y0+(y+h)/256);
    feats.push({type:"Feature",properties:{},geometry:{type:"Polygon",
      coordinates:[[[lonA,latA],[lonB,latA],[lonB,latB],[lonA,latB],[lonA,latA]]]}});
  }
  return { geojson:{type:"FeatureCollection",features:feats},
           ratio: TW*TH ? waterPx/(TW*TH) : 0, tiles, rects:feats.length,
           classCounts, classifiedPixels, transparentPixels, unknownPixels };
}

function summarizeLand(counts, classifiedPixels){
  if(!counts || !(classifiedPixels>0)) return null;
  const entries=Object.entries(counts).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return null;
  const [name,count]=entries[0];
  return {name,count,classifiedPixels,pct:(count/classifiedPixels*100).toFixed(1)};
}

// 建物の足元に付いた明治期区分の最多値。「該当なし」「特定できず」は
// 土地区分名ではないため、最多区分の候補から除く。
function summarizeBuildingLand(counts, classified){
  if(!counts || !(classified>0)) return null;
  const entries=Object.entries(counts)
    .filter(([name,n])=>n>0 && SWALE.some(c=>c.name===name))
    .sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return null;
  const [name,count]=entries[0];
  return {name,count,classified,pct:(count/classified*100).toFixed(1)};
}

// ============================================================
// 建物（Overpass）。事前計算データが無い範囲だけの経路。
// 混雑で落ちうるので、失敗しても画面は成立させる（そして嘘は書かない）。
// ============================================================
const OVERPASS = ["https://overpass-api.de/api/interpreter",
                  "https://overpass.kumi.systems/api/interpreter"];
const DEFAULT_H = {apartments:30,residential:12,house:7,detached:7,office:40,commercial:20,
  retail:12,industrial:12,warehouse:14,school:15,hospital:25,roof:4,garage:3,hut:3};

// ⚠ 待たせ続けない。
//   以前は 45秒 × 2エンドポイント × 2周 で、**最悪 180秒**「建物を取得中…」のままだった。
//   Overpass の公開インスタンスは混雑で落ちる（406 / 429 / タイムアウトを実測済み）ので、
//   落ちること自体は前提。**いつ諦めるかを決めていなかった**のが問題だった。
//   期限を切って、取れなければ「取れなかった」と言う（水域と写真では画面が成立している）。
const BUILD_DEADLINE_MS=20000;
async function fetchBuildings(bbox,onTry){
  const q=`[out:json][timeout:20];way["building"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});out geom tags;`;
  const until=Date.now()+BUILD_DEADLINE_MS;
  for(let round=0;round<2;round++){
    for(const ep of OVERPASS){
      const left=until-Date.now();
      if(left<=1500) return null;                     // 期限。ここで諦める
      onTry?.(`建物を取得中… (${new URL(ep).hostname})`);
      try{
        const r=await fetch(ep,{method:"POST",body:new URLSearchParams({data:q}),
          signal:AbortSignal.timeout(Math.min(9000,left))});
        if(!r.ok) continue;
        const t=await r.text();
        if(!t.trimStart().startsWith("{")) continue;
        const j=JSON.parse(t);
        // ⚠ `elements` が無い応答は「0 件」ではない。次のエンドポイントへ行く。
        //   `[]`（正常に0件）と `undefined`（壊れた応答）を同じ顔にすると、
        //   壊れた応答が画面で「建物は 0 件です」に化ける。
        if(!Array.isArray(j.elements)) continue;
        return j.elements;
      }catch{}
    }
  }
  return null;
}

function toGeoJSON(elements){
  const feats=[];
  for(const el of elements){
    if(!el.geometry||el.geometry.length<4) continue;
    const ring=el.geometry.map(p=>[p.lon,p.lat]);
    const [f,l]=[ring[0],ring[ring.length-1]];
    if(f[0]!==l[0]||f[1]!==l[1]) ring.push(f);
    const t=el.tags??{};
    let h=parseFloat(t.height), src="height";
    if(!(h>0)){ const lv=parseFloat(t["building:levels"]);
      if(lv>0){h=lv*3.2;src="levels"} else {h=DEFAULT_H[t.building]??10;src="default"} }
    feats.push({type:"Feature",geometry:{type:"Polygon",coordinates:[ring]},
      properties:{height:Math.round(h*10)/10,heightSource:src,kind:t.building??"yes",
        name:t.name??null,startDate:t["start_date"]??null}});
  }
  return {type:"FeatureCollection",features:feats};
}

const centroid=(ring)=>{let x=0,y=0;const n=ring.length-1;
  for(let i=0;i<n;i++){x+=ring[i][0];y+=ring[i][1]}return [x/n,y/n]};

// 建物を URL で名指しするための鍵。**重心を 6 桁に丸めた文字列**。
// ⚠ OSM の id は使えない。配っているタイル（scripts/bl-format.mjs）も Overpass 経路
//   （toGeoJSON）も、どちらも id を落としている。片方だけ id を持たせると
//   「静的の土地と、問い合わせる土地で鍵が違う」という気づきにくい差になる
//   （取り込み済みアセットの名称と実行時経路の名称を揃えるため）。
// ⚠ 実測データが更新されて建物の形が動けば、この鍵は変わる。そのときは
//   「復元できませんでした」と言う。黙って別の建物を選ばない。
// ⚠ 6 桁 ≒ 0.1m。豊洲 533 件では衝突しない。
const bldKey=(lon,lat)=>`${lon.toFixed(6)},${lat.toFixed(6)}`;
// 年 → 時間座標（tau）。E の並びは ALL_ERAS と同じ順（現在・1987–90 …・明治期）。
// ⚠ ここが返すのは**時間座標であって段の番号ではない**。地点によって段は減るが、
//   この対応は動かさない（広島で 2 段減らしても、建物が消える年は同じ年のまま）。
function tFromYear(y){
  const E=[2026,1990,1986,1983,1978,1969,1950,1942,1868];
  for(let i=0;i<E.length-1;i++) if(y<=E[i]&&y>E[i+1]) return i+(E[i]-y)/(E[i]-E[i+1]);
  return y>E[0]?0:TAU_MEIJI;
}

// ============================================================
// レイヤの初期化（1度だけ）
// ============================================================
let ready=false;
map.on("load",()=>{
  // ⚠ 見ない年代は visibility:"none" で足す。paint だけ 0 にしても読みに行く。
  // ⚠ レイヤは全年代ぶん作ってよい（作るだけでは取りに行かない）。
  //   取りに行くかどうかを決めるのは、**段に載っているか**だけ。
  //   地点の写真が分かるまでは「現在」以外を可視にしない。
  for(const e of ALL_ERAS){
    const now=e.id===ALL_ERAS[0].id;
    map.addSource(e.id,raster(e));
    map.addLayer({id:`g-${e.id}`,type:"raster",source:e.id,
      layout:{visibility:now?"visible":"none"},
      paint:{"raster-opacity":now?1:0,"raster-opacity-transition":{duration:0}}});
  }
  map.addSource("swale",raster({id:"swale",ext:"png",min:10,max:16}));
  map.addLayer({id:"g-swale",type:"raster",source:"swale",
    layout:{visibility:"none"},
    paint:{"raster-opacity":0,"raster-opacity-transition":{duration:0},
           "raster-saturation":.25,"raster-brightness-max":.92}});

  map.addSource("water",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"water",type:"fill-extrusion",source:"water",
    paint:{"fill-extrusion-color":"#2f7fc4","fill-extrusion-height":0,
           "fill-extrusion-base":0,"fill-extrusion-opacity":0}});

  // ⚠ 建物は OpenStreetMap。**ODbL でクレジット必須**なので出どころに書く。
  //   書いていないと、地図の帰属表示に OSM が出ない（2026-08-17 に実測で見つけた）。
  map.addSource("bld",{type:"geojson",attribution:ATTR_OSM,
    data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"bld",type:"fill-extrusion",source:"bld",
    paint:{"fill-extrusion-color":["case",["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"],
           "fill-extrusion-height":["get","height"],"fill-extrusion-base":0,
           "fill-extrusion-opacity":.94,"fill-extrusion-vertical-gradient":true}});

  ready=true;
  render();
  // URL から復元。共有できることがループの前提（掟: 唯一の指標は共有率 差分1）
  const sp=new URLSearchParams(location.search);
  const ll=sp.get("ll"), q=sp.get("q");
  // ⚠ era / b が無い古い URL（q と ll だけ）も、これまでどおり開ける。既定の状態で始まるだけ
  const opt={ era:sp.get("era"), bld:sp.get("b") };
  if(ll && /^-?[\d.]+,-?[\d.]+$/.test(ll)){
    const [la,lo]=ll.split(",").map(Number);
    loadArea(lo,la,q||`${la.toFixed(4)}, ${lo.toFixed(4)}`,opt);
  } else {
    loadArea(139.7975,35.6548,"東京都江東区豊洲");   // 既定
  }
});

// 建物を押したとき。
// ⚠ ここが 3D で唯一 100% 言えるところ。実測（豊洲 533件）:
//     足元の判定  533 / 533 = 100%（1件ずつ画素を読んでいる）
//     高さ        実測 42 / 533 = 7.9%（79% が種別ごとの既定値）
//     建設年      8 / 533 = 1.5%（10街40万件では 0.30%）
//   だから押した先の主役は足元で、高さと建設年はその下に、出所つきで置く。
//
// ⚠ 結果は**押した場所の近く**に出す。以前は左パネルの中だけに書いていて、
//   実測で y=672（スマホ・パネルは閉じている）／y=721（PC・パネルの内スクロールの外）と、
//   **両方の端末で画面の外**だった。利用者役のエージェントによる検証で「押しても何も起きないように見える」
//   「スマホでは何も起きない」と3体が報告したのは、実際に何も見えていなかったから。
let pickPop=null, picked=false;
// いま選んでいる建物の鍵（bldKey）。URL に載せる
let pickBld=null;
// URL から復元したいもの。段・建物が揃ってから当てる
let wantEra=null, wantBld=null;
// 復元できなかったものの名前。⚠ 黙って既定へ落とさないために持つ
let missEra=null, missBld=false;
// いま調べている場所。URL を書き直すのに要る
let place=null;
// ⚠ 種別（kind）と建設年（startDate）は OSM のタグそのもの。誰でも編集できる第三者データで、
//   こちらが中身を保証できない。描くときに esc を通す（理由は esc.js）。
//   rgba はこちらが画素から読んだ根拠値、meiji は自前の凡例表（verify.js）から来る。
//   rgbaは通常のカードには出さず、利用者が読む主情報を優先する。
function meijiText(p){
  if(Number(p.wasWater)===1) return "足元は、明治期には水でした";
  if(p.meiji==="該当なし") return "この建物の足元では、明治期の土地の区分を確認できませんでした";
  if(p.meiji==="データなし") return "明治期の低湿地データの対象外です";
  if(p.meiji==="読み込めず") return "明治期の低湿地データを読み込めませんでした";
  if(p.meiji==="特定できず") return "明治期の土地の区分を判定できませんでした";
  return `明治期には、${p.meiji}でした`;
}
function pickCard(p){
  const src=p.heightSource, made=p.startDate, land=esc(meijiText(p));
  const cls=Number(p.wasWater)===1?"w":"";
  const name=p.name?`<div class="name">${esc(p.name)}</div>`:"";
  return `<div class="card">${name}
    <div class="v ${cls}">${land}</div>
    <div class="meta"><div>高さ <b>${esc(p.height)}m</b> ─ ${WORD.heightSrc(src, esc(p.kind))}</div>
    <div>${WORD.builtYear(made ? esc(made) : "")}</div></div></div>`;
}
// 読み上げ。⚠ 画面に出ている文だけを読む。作文を混ぜない（トップの 🔊 と同じ掟）
function pickSpeech(p){
  const h=p.heightSource==="default"?"種別ごとの既定値です"
    :p.heightSource==="levels"?"階数からの換算です":"OSM の記載です";
  const land=meijiText(p);
  return (Number(p.wasWater)===1?`${land}。`:`${land}。`)
    + `高さは ${p.height} メートル。${h}。`
    + (p.startDate?`建設年は ${p.startDate} 年です。`:"建設年は分かっていません（OSMに記載がありません）。");
}
// 建物を選んだ結果を出す。
// ⚠ 押したときと、URL から戻したときで**同じ道を通す**。2つ書くと、
//   共有先だけ吹き出しの中身が違う、という差が生まれる（掟: 同じ問いに答える実装を2つ持たない）。
function showPick(p,lngLat){
  // 一度でも押したら、案内は役目を終える
  if(!picked){ picked=true; const t=document.getElementById("tip"); if(t) t.textContent=""; }
  document.getElementById("pick").innerHTML=pickCard(p);
  if(pickPop) pickPop.remove();
  pickPop=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:"280px",
      className:"pick-pop",offset:12})
    .setLngLat(lngLat)
    .setHTML(pickCard(p)+(("speechSynthesis" in window)
      ? `<button class="pick-say" id="pickSay">🔊 読み上げる</button>`:""))
    .addTo(map);
  // 吹き出しを閉じたら、URL からも建物を外す。
  // ⚠ 外さないと、閉じたあとに共有した人の URL が、閉じたはずの建物を開く
  pickPop.on("close",()=>{ if(pickBld===p.k){ pickBld=null; syncUrl(); } });
  const say=document.getElementById("pickSay");
  if(say) say.onclick=()=>{
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(pickSpeech(p));
      u.lang="ja-JP"; u.rate=1.0;
      speechSynthesis.speak(u);
      // ⚠ 計測の無い機能を増やさない（open.peel と同じ扱い）
      if(navigator.sendBeacon) navigator.sendBeacon("/t","open.speak");
    }catch{ /* 読み上げは落ちてよい。画面の動きは変えない */ }
  };
}
map.on("click","bld",(e)=>{
  // ⚠ 見えていない建物は押せない。明治期では全建物の高さが 0 になるが、
  //   当たり判定は残るので、海面に見えるところを押すと建物の情報が出ていた
  if(Number(slider.value)/100 >= photoSteps()-0.02) return;
  const p=e.features[0].properties;
  showPick(p,e.lngLat);
  // 選んだ建物を URL に載せる。共有先が同じ建物から始まる
  pickBld=p.k??null; syncUrl();
});
map.on("mouseenter","bld",()=>map.getCanvas().style.cursor="pointer");
map.on("mouseleave","bld",()=>map.getCanvas().style.cursor="");

// ============================================================
// エリアの読み込み — ここが「任意の場所でやる」の本体
// ============================================================
const statusEl=document.getElementById("status");
const resultEl=document.getElementById("result");
let area=null;   // 現在のエリアの集計
let marker=null; // 調べている地点の印

// 約1.6km四方。Overpass の負荷とタイル枚数のバランス。
// ⚠ **値は ground.js が持つ。**ここで別に宣言すると、トップが「下地がある」と判定する
//   範囲と、こちらが集計する範囲がずれる（＝導線を出したのに建物が出ない場所ができる）。
const {HALF_LON,HALF_LAT}=KonjakuGround;

// 再試行ボタン。取れなかったときは必ず復帰手段を添える（掟: 取れなかったを「無い」と言わない）
// ⚠ 地名は共有された URL の q か、地理院の応答から来る。属性の中も HTML なので esc を通す
const retryBtn=(lon,lat,title)=>
  `<button class="retry-btn" data-ll="${lon},${lat}" data-title="${esc(title)}">再試行</button>`;
function wireRetry(lon,lat,title){
  statusEl.querySelectorAll(".retry-btn").forEach((b)=>{ b.onclick=()=>loadArea(lon,lat,title); });
}

// ============================================================
// 年代の段を、この地点に合わせて組み直す
//   どの年代の写真が残っているかを答えるのは Konjaku.photos（トップと同じもの）。
//   ここでは並べるだけで、判定をやり直さない（掟: 同じ問いに答える実装を2つ持たない）。
// ============================================================
// ⚠ 「現在」は判定の対象ではない（photos が答えるのは**残っている**＝過去の写真）。
//   常に左端に置く。ここに現在を混ぜると、年代の数の意味が変わる。
function stepsFrom(ph){
  const out=[{...ALL_ERAS[0], tau:0, state:"ok"}];
  const byId=new Map((ph?.eras??[]).map((e)=>[e.id,e]));
  for(const e of ALL_ERAS.slice(1)){
    const r=byId.get(e.id);
    if(!r) continue;
    // 読めなかった（通信断・タイムアウト・403 などの拒否）… **段に残す**。
    // 消すと「取れなかった」が「無い」になる（掟: 取れなかったを「無い」と言わない）
    if(r.state==="unreachable"){ out.push({...e, tau:TAU.get(e.id), state:"unreachable"}); continue; }
    // 404（この年代の写真は無い）と、白紙（タイルはあるが撮影範囲の外）は出さない
    if(r.state==="ok"&&!r.blank) out.push({...e, tau:TAU.get(e.id), state:"ok"});
  }
  out.push({...MEIJI, tau:TAU_MEIJI, state:"ok"});
  return out;
}
// 場所を切り替えたときの取り違え防止。遅れて返った前の場所の応答で段を組み替えない
let areaSeq=0;
async function setTimeline(lon,lat,seq){
  let ph=null, failed=false;
  try{ ph=await Konjaku.photos(lon,lat); }catch{ failed=true; }
  if(seq!==areaSeq) return;                 // 別の場所へ移ったあと。触らない
  // ⚠ 判定そのものが落ちたときは、**何も間引かない**。
  //   「確かめられなかった」を「無い」に変えてはいけない
  steps=failed?allSteps():stepsFrom(ph);
  timelineReady=true;
  buildTicks(); buildRuler();
  // ⚠ 段が確定してから当てる。ここで初めて「この土地にその年代は無い」と言える
  resolveWantEra(true);
  syncUrl();
  render();
}

async function loadArea(lon,lat,title,opt){
  stop();
  const seq=++areaSeq;
  place={lon,lat,title};
  // ⚠ 復元したいものは、段や建物を捨てる**前**に受け取る。あとから置くと、
  //   前の場所の段を見て URL を書くことになる
  wantEra=opt?.era??null; wantBld=opt?.bld??null;
  missEra=null; missBld=false; pickBld=null;
  // 場所をURLに載せる。これが無いと共有できずループが閉じない（掟: 唯一の指標は共有率 差分1）
  syncUrl();
  // ⚠ 戻り先にも、調べていた場所を載せる。以前は href="./" のままで、
  //   ← を押すと**空のトップに戻り、調べていた場所が消えていた**
  //   （利用者役のエージェントによる検証で3体すべてが「最初からになった」と言った）。
  //   ⚠ el.href は絶対URLを返すので、読んで書き戻すと ./ が絶対URLに化ける。
  //     setAttribute で書くこと（過去に一度踏んでいる）。
  // ⚠ 戻る導線は「← もどる」1つだけ。以前はパネルの中にもロゴ（←今昔）があり、
  //   同じことを2か所で言っていた。探す先を残しておくと、消えたことに気づけない。
  // ⚠ 戻り先（← もどる）は syncUrl が書く。ここで別に書くと、年代が付いてくるものと
  //   付いてこないものの2通りができる（掟: 同じ問いに答える実装を2つ持たない）。
  // ⚠ 場所を選び直したら、探す枠は畳み直す。開けっぱなしだと、
  //   選んだ結果（判定の数字）が 214px 下へ押し出される。
  const findBox=document.getElementById("findBox");
  if(findBox) findBox.open=false;
  // 事前計算データがある範囲では、その bbox をそのまま集計範囲にする。
  // 表示の中心は要求された地点のままにするが、集計範囲を勝手にずらすと
  // 「この範囲の N 件すべてを判定した」が言えなくなる。
  const pre=findArea(await loadAreas(),lon,lat);
  // ⚠ **await のたびに、自分がまだ最新の呼び出しかを確かめる。**
  //   seq は 2026-08-18 まで取るだけで一度も見ていなかった（setTimeline の中だけが見ていた）。
  //   loadArea は 7 つの await を挟んでから area / statusEl / setData を書くので、
  //   古い呼び出しが**あとから**新しい結果を上書きできた。
  //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出る（この下）。
  //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
  if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
  const bbox=pre?pre.bbox:{w:lon-HALF_LON,e:lon+HALF_LON,s:lat-HALF_LAT,n:lat+HALF_LAT};
  map.jumpTo({center:[lon,lat],zoom:15.05,pitch:56,bearing:-20});
  // パネルを畳むと、どこを調べているのか分からなくなる。地図上に印を残す。
  if(marker) marker.remove();
  marker=new maplibregl.Marker({color:"#6fc3ff"}).setLngLat([lon,lat]).addTo(map);
  // ⚠ 場所を変えたら先読みも戻す。1つ前の場所で ▶ を押した人が、
  //   次に調べる場所でも8年代ぶんを引いてしまう（払った覚えのない支払い）
  preloadAll=false;
  // ⚠ 段が決まるまでは「現在」だけを出す（timelineReady=false）。
  //   前の場所の段のまま描くと、この地点に存在しない年代のタイルを取りに行く。
  timelineReady=false;
  steps=allSteps(); buildTicks(); buildRuler();
  slider.value="0";
  // ⚠ 段が確定する前に、いったん仮で当てる。判定（最悪 8 秒）を待つあいだ
  //   「現在」を見せてから飛ぶと、共有先では**一度戻されたように見える**。
  //   ここではまだ「無い」とは言わない（間引く前の梯子で探しているだけ）
  resolveWantEra(false);
  render();
  // 年代の段を組み直す。⚠ ここは待たない。待つと、水域と建物の取得まで
  //   写真の判定（最悪 8 秒のタイムアウト）の後ろに並んでしまう
  setTimeline(lon,lat,seq);
  // 建物の集計とは独立に取る。集計が出せない土地でも、この土地そのものには答えられる
  loadLandform(lon,lat,seq);
  resultEl.style.display="none";
  // ⚠ 前の場所の答えを残さない。地図はもう新しい場所へ跳んでいるので、
  //   ここに古い割合が残ると「この土地の答え」として読まれる
  renderLand(null);
  statusEl.innerHTML=`<span class="go">明治期の低湿地データを読んでいます…</span>`;

  // --- 1. 水域 ---
  // 事前計算があればそれを使う（ブラウザ側の生成は数秒かかる）。
  // 無い／読めないときだけ、その場でタイルから起こす。
  let w=null;
  if(pre?.water){
    const gj=await loadJSON(pre.water);
    if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
    if(gj) w={ geojson:gj, ratio:gj.metadata?.waterRatio??0, rects:gj.features.length,
               tiles:{ok:1,absent:0,unreachable:0}, pre:true,
               classCounts:gj.metadata?.classCounts??null,
               classifiedPixels:gj.metadata?.classifiedPixels??0,
               transparentPixels:gj.metadata?.transparentPixels??0,
               unknownPixels:gj.metadata?.unknownPixels??0 };
  }
  if(!w) w=await buildWater(bbox);
  if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
  map.getSource("water").setData(w.geojson);

  const waterRead=w.tiles.ok>0;
  const waterUnread=w.tiles.unreachable>0;
  if(!waterRead && waterUnread){
    // 読めていない。「データがありません」とは言えない
    statusEl.innerHTML=`<span class="err">明治期の低湿地データを<b>いま読み込めませんでした</b>。</span>
      <span style="color:var(--ink-dim)">通信を確認して、もう一度お試しください。</span> ${retryBtn(lon,lat,title)}`;
    wireRetry(lon,lat,title);
  } else if(!waterRead){
    statusEl.innerHTML=`<span class="err">このエリアには<b>明治期の低湿地データがありません</b>。</span>
      <span style="color:var(--ink-dim)">整備範囲は全国の主要都市周辺に限られます。</span>`;
  } else if(w.ratio===0){
    statusEl.innerHTML=`<span class="err">このエリアは、明治期の低湿地データで<b>水域に該当しません</b>。</span>
      <span style="color:var(--ink-dim)">空中写真の年代送りは使えます。</span>`;
  } else {
    statusEl.innerHTML=`<span style="color:var(--ink-dim)">水域 ${w.rects} 面${
      WORD.waterPre(w.pre)}を判定しました。</span>`;
  }
  // 建物を待たずに、いま言えることだけで一度出す。
  // 判定できない土地では「判定できません」がここで出る。以前はここで初期値の
  // 「–%」が残り、Overpass が返った瞬間に「0.0% ── 実測値」へ化けていた（掟: 取れなかったを「無い」と言わない）。
  area={ title, areaTitle:pre?.title??null, bldState:"loading",
    total:0, wet:0, classified:0, unread:0, counts:{}, dated:0,
    waterRatio:w.ratio, waterRead, waterUnread,
    landSummary:summarizeLand(w.classCounts,w.classifiedPixels), buildingLand:null };
  showResult(); render(); buildRuler();

  // --- 2. 建物 ---
  // 事前計算データがある範囲では Overpass を叩かない。
  // 本番で 504／無応答が常態のものを、作品の成立条件に置かない（掟: 取れなかったを「無い」と言わない）。
  //
  // ⚠ **`null`（取れていない）と `[]`（正常に0件）を混ぜない。**
  //   以前は「この範囲に1件も無い」を `feats=null` に潰していたので、
  //   正常に 0 件と確認できた事実が「未取得」に化け、画面は同時に
  //   「建物 0 件を判定しました」「建物を取得中…」「欠落 取得できていない」を出していた。
  //   状態は area.bldState（loading / ok / notyet / fail）が1つだけ持つ
  //   ⚠ notyet = **こちらがまだ用意していない**。fail = 用意はあるが取れなかった。混ぜない
  //   （掟: 同じ問いに答える実装を2つ持たない。以前は pending と source:"none" の2つで表していた）。
  let feats=null, viaPre=false, bldSource=null;
  // ⚠ まずタイル索引を見る。取り込んであれば Overpass に出ない。
  //   索引に無いタイルが1枚でもあれば静的では答えない（欠けたまま「これで全部」と言わない）。
  //   索引の単位は z14 で、ev（年つきの事物）とは**別の索引**。潰すと
  //   「建物が見たタイル」が「事物も見た」ことになる。
  const bl=await loadBuildingTiles(bbox);
  if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
  // ⚠ **なぜ静的で答えられなかったか**を、最後まで持ち回る。
  //   ここで捨てると、失敗の文が「混雑のせい」に化ける
  const blWhy=bl.state;
  if(bl.state===BL_OK){
    // ⚠ タイルは z14 の全面なので、集計したい範囲より広い。
    //   そのまま数えると「豊洲の建物の◯%」が、豊洲ではない範囲の割合になる。
    //   実測で 99.4% → 40.9% に化けた（隣の街区が混ざったため）。
    //   peel は元から「見た範囲と主張の範囲を一致させる」を守っていた。壊さない。
    const inBox=(f)=>{
      const r=f.geometry.coordinates[0];
      const c=r.reduce((s2,p)=>[s2[0]+p[0],s2[1]+p[1]],[0,0]).map(v=>v/r.length);
      return c[0]>=bbox.w&&c[0]<=bbox.e&&c[1]>=bbox.s&&c[1]<=bbox.n;
    };
    feats=bl.features.filter(inBox);
    viaPre=true; blAt=bl.at; blTrunc=bl.truncated; bldSource="tiles";
    // ⚠ ここで 0 件でも `null` に戻さない。索引が「見た」と言っている区画を全部読めたなら、
    //   **0 件がこの範囲の答え**。別のソースで上書きしない（掟: 索引は見た範囲）。
  }
  // ⚠ `feats===null`（＝タイルで答えられなかった）ときだけ、次のソースへ行く。
  //   `!feats` にすると `[]` でも通ってしまい、上の判断が無かったことになる。
  if(feats===null && pre?.buildings){
    const gj=await loadJSON(pre.buildings);
    if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
    // ⚠ 0 件の GeoJSON も「読めた」。読めたかどうかは features の有無で見る（長さで見ない）
    if(gj?.features){ feats=gj.features; viaPre=true; bldSource="pre"; }
  }
  if(feats===null){
    // ⚠ **未登録なら、先にそう言う。**待たせてから「取れなかった」と言うのが、
    //   いちばんがっかりする（利用者役の指摘 2026-08-18）。
    //   ⚠ そのうえで問い合わせは行う。名古屋で 5,845 件が実際に返った実測があり、
    //     やめると出せる情報が減る。ただし**先に言ってから**行く。
    // ⚠ **待っているあいだと、終わったあとで、言い方を変えない。**
    //   実測（2026-08-18）: 同じ「まだ提供していない」に 2 通りの文があり、
    //   20 秒のあいだに入れ替わっていた（「まだ用意できていません」→「まだ提供していません」）。
    //   ⚠ 入れ替わると、同じことを言っているのだと分からない。文は prov.js の 1 つを借りる。
    statusEl.innerHTML+=blWhy===BL_ABSENT
      ? `<div style="margin-top:5px"><b>${KonjakuProv.NOTYET}。</b></div>`
      : `<div style="margin-top:5px">建物を取得中…</div>`;
    const line=statusEl.querySelector("div:last-of-type");
    const els=await fetchBuildings(bbox,(m)=>{
      // ⚠ 何を待っていて、**駄目だったらどうなるか**を先に言う。
      //   黙って待たせると、止まっているのか動いているのか分からない
      line.textContent=(blWhy===BL_ABSENT?`${KonjakuProv.NOTYET}。`:"")
        +m+"（最大20秒。取れなければ水域と写真だけで表示します）";
    });
    if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
    if(els){ feats=toGeoJSON(els).features; bldSource="overpass"; }
  }

  if(feats===null){
    map.getSource("bld").setData({type:"FeatureCollection",features:[]});
    // ⚠ **理由ごとに違う文を出す。**「まだ用意していない」を「取得できませんでした」と
    //   言わない（利用者役 3/3 が後者を「自分の通信のせい」と読んだ）。
    const notYet=blWhy===BL_ABSENT;
    area={ title, total:0, wet:0, classified:0, unread:0, counts:{}, dated:0,
      waterRatio:w.ratio, waterRead, waterUnread, bldState:notYet?"notyet":"fail",
      landSummary:summarizeLand(w.classCounts,w.classifiedPixels), buildingLand:null };
    statusEl.innerHTML=(notYet
      // ⚠ **⚠ の記号を使わない。**この画面の外（トップ）では ⚠ を「この土地で
      //   気をつけること」（＝災害リスク）に使っている。在庫の話に同じ印を出すと、
      //   利用者役 2/3 が「危ない土地の警告か」と読んだ（2026-08-18）。
      ? `<span class="err">${KonjakuProv.NOTYET}。</span>
         <span style="color:var(--ink-dim)">${KonjakuProv.NOTYET_WHY}。</span>`
      : blWhy===BL_UNKNOWN
      ? `<span class="err">建物データを取得できませんでした。</span>
         <span style="color:var(--ink-dim)">用意してあるかどうかも確かめられていません。</span>`
      : `<span class="err">建物データを取得できませんでした。</span>
         <span style="color:var(--ink-dim)">用意はしてありますが、いま読めていません。</span>`)
      + `<span style="color:var(--ink-dim)">水域と空中写真だけで表示しています。</span> ${retryBtn(lon,lat,title)}`;
    wireRetry(lon,lat,title);
    // ⚠ **台帳（#prov）も組み直す。** ここで render() を呼んでいなかったので、
    //   台帳だけ「未取得 建物データを**取得中**／まだ**届いていない**だけで」のまま残っていた。
    //   利用者役 3/3 が、その 2 語を見て**自分の通信を疑った**（2026-08-18）。
    //   上の文と下の台帳で主語が食い違っていた。⚠ 2026-08-18 に、
    //   「まだ提供していない」の文そのものを prov.js の 1 つに寄せた（NOTYET）。
    showResult(); render(); return;
  }

  const gj={type:"FeatureCollection",features:feats};
  await Promise.all(feats.map(async(f)=>{
    const [clon,clat]=centroid(f.geometry.coordinates[0]);
    // ⚠ 鍵はここで**1回だけ**作って持たせる。押したときに輪郭から作り直さない。
    //   押した先の輪郭は地図側で切り取られていることがあり、重心が元と揃わない。
    f.properties.k=bldKey(clon,clat);
    // 取り込み時に付与済みの明治期区分があれば、それをそのまま使う。
    // 旧アセットや実行時 Overpass の建物だけラスタをサンプリングする。
    if(!f.properties.meiji){
      const s=await sampleSwale(clon,clat);
      f.properties.wasWater=s.water?1:0;
      // 「読めなかった」を「データなし」と同じ箱に入れない。ここが 0.0% の元だった
      f.properties.meiji=s.state===UNREACHABLE?"読み込めず"
        :s.state===ABSENT?"データなし"
        :s.none?"該当なし":s.unknown?"特定できず":s.cls.name;
      f.properties.rgba=s.rgba?s.rgba.join(","):"";
    }
    const sd=f.properties.startDate?parseInt(String(f.properties.startDate).slice(0,4),10):NaN;
    if(Number.isFinite(sd)){f.properties.vanish=tFromYear(sd);f.properties.exact=1}
    else{f.properties.vanish=Number(f.properties.wasWater)===1?6.0:7.4;f.properties.exact=0}
  }));
  if(seq!==areaSeq) return;   // 別の場所へ移った／押し直された。古い結果で上書きしない
  map.getSource("bld").setData(gj);
  resolveWantBld(feats);

  const counts={};
  for(const f of feats) counts[f.properties.meiji]=(counts[f.properties.meiji]||0)+1;
  // 足元を実際に判定できた件数。ここが 0 なら % は出さない（掟: 取れなかったを「無い」と言わない 札幌の 0.0%）
  const classified=feats.length-(counts["データなし"]??0)-(counts["読み込めず"]??0);
  area={ title, areaTitle:viaPre?(pre?.title??null):null,
    // ⚠ 0 件でも「取れた」。bldState は取得の成否だけを持ち、件数は total が持つ
    bldState:"ok", bldSource, blAt, blTrunc,
    total:feats.length, wet:feats.filter(f=>f.properties.wasWater).length,
    classified, unread:counts["読み込めず"]??0,
    counts, dated:feats.filter(f=>f.properties.exact).length,
    // ⚠ 高さの出所を、**この画面が名乗る範囲**で数える。
    //   取り込み全域（14,806件）では 93.8% が既定値だが、豊洲の集計範囲（533件）では
    //   80.1%。範囲の違う数字を出すのは、99.4% を 40.9% に化けさせたのと同じ事故。
    // ⚠ 生成元が3つあって語彙が違う（ingest は measured、Overpass 経路は height）。
    //   両方を実測として数える。heightSource が無いデータでは数えない（行ごと出さない）
    hSrc:(()=>{
      const has=feats.some(f=>f.properties.heightSource);
      if(!has) return null;
      const c={measured:0,levels:0,default:0};
      for(const f of feats){
        const v=f.properties.heightSource;
        if(v==="height"||v==="measured") c.measured++;
        else if(v==="levels") c.levels++;
        else c.default++;
      }
      return c;
    })(),
    waterRatio:w.ratio, waterRead, waterUnread,
    landSummary:summarizeLand(w.classCounts,w.classifiedPixels),
    buildingLand:summarizeBuildingLand(counts,classified) };

  // 水域が読めていないのに「水域 0 面を判定しました」とは書かない
  // ⚠ 0 件のときは「判定しました」で終わらせない。**何が 0 件なのか**を書く。
  //   「建物 0 件」だけだと「この場所に建物は無い」と読める。
  //   言えるのは **OSM に登録された建物が 0 件**であることまで（掟: データにない ≠ 現実にない）。
  statusEl.innerHTML=`<span style="color:var(--ink-dim)">${waterRead?`水域 ${w.rects} 面 ／ `:""}${
    area.total===0
      ? `この範囲に、<b>OSM に登録された建物は 0 件</b>です${WORD.bldPre(viaPre)}。`
        + `水域と空中写真で表示しています。`
      : `建物 ${area.total} 件を判定しました${WORD.bldPre(viaPre)}。`}</span>${
      blAt?`<span style="color:var(--ink-dim)"> 建物を取り込んだのは ${blAt}。</span>`:""}${
      blTrunc?`<span class="err"> この範囲は建物が多く、取りきれていない可能性があります。</span>`:""}`;
  if(!waterRead) statusEl.innerHTML = (waterUnread
    ? `<span class="err">明治期の低湿地データを<b>いま読み込めませんでした</b>。</span> `
    : `<span class="err">このエリアには<b>明治期の低湿地データがありません</b>。</span> `) + statusEl.innerHTML;
  if(area.unread) statusEl.innerHTML+=`<div class="err" style="margin-top:5px">
    ${area.unread} 件は明治期のデータを読み込めませんでした。 ${retryBtn(lon,lat,title)}</div>`;
  wireRetry(lon,lat,title);
  showResult(); render(); buildRuler();
}

// ---- この土地の成り立ち（掟: 主題は「成り立ち」。明治期は手法のひとつ）----
// peel の売りは「建物1件ずつの足元を明治期の低湿地データで判定する」集計で、これは
// 整備範囲の外では出せない。そこで黙ると、札幌のように建物が出ているのに
// 「判定できません」で終わる。地形分類はその土地そのものには必ず答えられるので、
// 集計が出せないときの受け皿として持つ。集計の代わりに使うのではない。
let landform=null;
async function loadLandform(lon,lat,seq){
  landform=null;
  try{ landform=await Konjaku.landform(lon,lat); }catch{ landform=null; }
  // ⚠ ここも同じ。前の場所の地形分類が、あとから新しい場所の答えに乗らないように
  if(seq!==areaSeq) return;
  showResult();
}
// ============================================================
// 言葉を決めるところ。⚠ **HTML の中で言葉を分岐させない。**
//
// 実測（2026-08-19）: HTML を組み立てるテンプレートの中に「言葉の判断」が
//   index.html に 7 個・peel3d.js に 9 個 埋まっていた。
//   ⚠ うち 2 つは**同じ判断を 2 か所・3 か所**に書いていた
//     （「（事前に取り込んだデータ）」×2、「建物ごとには出せません／判定できません」×3）。
//   ⚠ 文言を直すとき markup を触ることになり、検査も字面でしか追えない。
//
// ⚠ ここは prov.js（台帳の語彙）と同じ考え方だが、**持ち主が違う**ので分けている。
//   あちらは「いま画面に出ているものの出所」、こちらは「答えと出どころの呼び名」。
// ⚠ **地図も DOM も見ない。**検査がこの塊だけを取り出して回せる。
// ============================================================
const WORD = {
  // 建物の高さを、どこから得たか。⚠ 3 通りを 1 か所で決める
  heightSrc: (src, kind) =>
    src === "default" ? `種別「${kind}」の既定値（OSM に高さの記載なし）`
    : src === "levels" ? "OSM の階数から換算（1階を3.2mとして計算）"
    : "OSM の height タグ",
  // 建設年。⚠ 「不明」と「記載なし」を混ぜない（無いのは OSM の記載であって、建物の年ではない）
  builtYear: (made) => made ? `建設年 <b>${made}</b>` : "建設年 <b>不明</b>（OSM に記載なし）",
  // 水域を、その場で起こしたか・事前に計算してあったか
  waterPre: (isPre) => isPre ? "（事前計算データ）" : "",
  // ⚠ 建物を、実行時に問い合わせたか・事前に取り込んであったか（2 か所で使う）
  bldPre: (viaPre) => viaPre ? "（事前に取り込んだデータ）" : "",
  // 地形分類の精度。⚠ 粗いときは**必ず**そう書く（詳細版が無い土地がある）
  precision: (fine) => fine ? "" : "（広い区分）",
  // ⚠ **掟の核心。**読めなかったのか、本当に無いのか（取れなかった ≠ 無い）
  meijiGap: (unread) => unread ? "読み込めていない" : "無い",
  // 建物が 1 件も出ないとき、その理由を書き分ける。
  // ⚠ **4 つを混ぜない。**以前は 2 状態しか無く、正常に 0 件だった土地に
  //   「建物を取得中…」が出続けていた（ステータスは「0 件を判定しました」と言っているのに、
  //   ここは待っている顔をしていた）。
  // ⚠ 文言は prov.js の NOTYET を借りる（同じ事実に 2 通りの言い方を作らない）。
  noBuildings: (bldState) =>
    bldState === "loading" ? "建物を取得中…"
    : bldState === "ok"    ? "OSM に登録された建物は 0 件です"
    : bldState === "notyet" ? `${KonjakuProv.NOTYET}（通信の問題ではありません）`
                            : "建物データを取得できませんでした（上の再試行から取り直せます）",
  // ⚠ 内訳に出す「分割ではないもの」。**足元を判定できなかった件数**。
  //   ⚠ **これは分類ではない。**「明治期は○○だった」とは言わない。
  //     言うのは**資料の側の話**（読めていない／範囲の外）であって、土地の話ではない。
  //   ⚠ 「無い」と言わない（データにない ≠ 現実にない）。
  notClassified: (kind, n, all) =>
    (all ? `${n} 件すべて、` : `ほか ${n} 件は、`) + "明治期の低湿地データを"
      + (kind === "unread" ? "読み込めていません" : "整備している範囲の外でした"),
  // ⚠ 答えを出せないときの見出し（3 か所で使う）。
  //   地形分類が受け皿として答えられるなら「建物ごとには」と範囲を限る。
  //   受け皿も無いなら「判定できません」。⚠ **どちらも数値を作らない**（0% を出さない）。
  cantSay: (hasLandform) => hasLandform ? "建物ごとには出せません" : "判定できません",
};

// 見出しに使う1行。粗い区分しか無いときは、そう書く
function landformLine(){
  const l=landform;
  if(!l) return "";
  if(l.state==="unreachable") return `<span style="opacity:.7">地形分類も、いま読み込めませんでした</span>`;
  if(!l.ok) return "";
  const art=l.artificial?`／いまは <b>${l.artificial}</b>`:"";
  return `この土地は <b>${l.value}</b>${art}${WORD.precision(l.fine)}`;
}

// ============================================================
// 土地の答え（この画面の中心）
//   ⚠ **割合と分母を作るのは、ここ1か所だけ。** 情報パネル（#heroNum / #heroCap）と、
//     常時見える HUD（#land）は、同じ結果を別の見せ方で描く。
//     2 か所で計算すると、片方だけ直したときに**同じ画面の中で数字が食い違う**
//     （掟: 同じ問いに答える実装を2つ持たない）。
//   ⚠ スマホはパネルが閉じて始まる。以前は答えも分母もパネルの中にしかなく、
//     実測（2026-08-16 / 375×667・タッチ）で豊洲 99.6%・広島 1.4%・出島 3.4% の
//     **実効 opacity が 0**（祖先の #panel.hide が opacity:0）だった。
//     初期画面から読めるのは「建物が消える年代は演出です」という但し書きだけで、
//     **答えより先に注意書きが読める**状態になっていた。
//   ⚠ ここで割合の作り方を変えない。分母は「足元を判定できた件数」で、
//     判定できていない建物を分母に入れない（札幌の 0.0% がそれだった）。
// ============================================================
function landVerdict(){
  if(!area) return null;
  const lf=landformLine();
  // 建物がある場合は、足元のラスタ判定が成立したときだけ範囲集計も見せる。
  // 通信断で建物の判定が0件なのに、事前生成GeoJSONの割合だけ出すと、
  // 「読めていないのに割合が出た」状態になる。
  const land=(area.classified>0||area.total===0)
    ? (area.total>0 ? area.buildingLand : area.landSummary) : null;
  // 足元を1件でも判定できた。割合は**判定できた件数**からしか作らない
  if(area.classified>0)
    return { kind:"ratio", pct:(area.wet/area.classified*100).toFixed(1),
      classified:area.classified, total:area.total, all:area.classified===area.total,
      unread:area.unread, land, lf };
  // 建物は出ているが、足元は1件も判定できない
  if(area.total>0) return { kind:"none", scope:"building", total:area.total, unread:area.unread, land, lf };
  // 建物が0件・取れない・まだ待っている。面積比なら出せる
  // ⚠ **なぜ面積比なのか**は3つある（待っている／0件だった／取れなかった）。
  //   以前は真偽値1つ（pending）だったので、正常に0件だった土地に
  //   「建物が取れなかったため」と書いていた（掟: 取れなかったを「無い」と言わない の裏返し）。
  if(area.waterRead&&area.waterRatio>0)
    return { kind:"area", pct:(area.waterRatio*100).toFixed(1), bldState:area.bldState, land, lf };
  if(area.waterRead) return { kind:"dry", land, lf };
  return { kind:"none", scope:"land", unread:area.waterUnread, land, lf };
}

// 常時見える HUD 側の描画。⚠ 数字は landVerdict() が作ったものだけを使う。
// ⚠ 「データなし（整備対象外）」と「読み込めず」を混ぜない。
//   混ぜると、通信が落ちただけの土地に「整備対象外」と書くことになる
//   （掟: 取れなかったを「無い」と言わない）。
// 面積比を出している理由。⚠ HUD（#land）と情報パネル（#heroCap）が同じ文を出すので、
//   **ここ1か所**で作る（掟: 同じ問いに答える実装を2つ持たない。
//   以前は2か所に同じ三項演算子が書いてあり、片方だけ直すと同じ画面で言うことが食い違った）。
// ⚠ 「まだ用意していない」と「取れなかった」を書き分ける（2026-08-18）。
//   以前は両方「建物が取れなかったため」で、利用者役 3/3 が自分の通信を疑った。
const bldWhyArea=(bldState)=>
  bldState==="loading" ? "建物を取得中。揃うと建物ごとの割合になる"
  : bldState==="ok"    ? "OSM に登録された建物が 0 件のため、面積比で出している"
  : bldState==="notyet"? `${KonjakuProv.NOTYET}。範囲全体の面積で出しています`
                       : "建物が取れなかったため、面積比で出している";

const landEl=document.getElementById("land");
function renderLand(v){
  if(!landEl) return;
  if(!v){ landEl.innerHTML=""; return; }        // 場所を切り替えた直後。前の答えを残さない
  const sub=(t)=>t?`<div class="land-sub">${t}</div>`:"";
  if(v.kind==="ratio"||v.kind==="area"){
    const landIsWater=v.land&&KonjakuSwale.isWater(v.land.name);
    // 数字だけを置かない。**何の割合か**と**分母**を必ず同じ板に出す
    const what=v.kind==="ratio"
      ? (v.land && !landIsWater
        ? `建物の足元は、明治期には<b>${esc(v.land.name)}</b>が最多でした`
        : `の建物が、明治期には<b>水の上</b>だった`)
      : `の面積が、明治期には<b>水</b>だった`;
    const den=v.kind==="ratio"
      ? `${v.classified} / ${v.total}件の足元を判定`
      : bldWhyArea(v.bldState);
    const land=v.kind==="ratio"&&v.land
      ? `<div class="land-sub">区分を特定できた足元のうち ${esc(v.land.name)} ${v.land.count} / ${v.land.classified}件（${v.land.pct}%）</div>`
      : (v.land?`<div class="land-sub">この範囲で最も多い区分: <b>${esc(v.land.name)}</b>（${v.land.pct}%）</div>`:"");
    const water=v.kind==="ratio"&&v.land
      ? `<div class="land-sub">水域だった建物: ${v.pct}%</div>` : "";
    landEl.innerHTML=v.kind==="ratio"&&v.land&&!landIsWater
      ? `<div class="land-line"><b class="land-alt">${esc(v.land.name)}</b><span class="land-what">${what}</span></div><div class="land-den">${den}</div>${land}${water}`
      : `<div class="land-line"><b class="land-num">${v.pct}<small>%</small></b>`
        + `<span class="land-what">${what}</span></div><div class="land-den">${den}</div>${land}`;
    return;
  }
  if(v.kind==="dry"){
    landEl.innerHTML=`<div class="land-line"><b class="land-alt">水域なし</b></div>`
      + `<div class="land-den">この範囲は、明治期の低湿地データで水域に該当しません</div>`
      + (v.land?`<div class="land-sub">この範囲で最も多い区分: <b>${esc(v.land.name)}</b>（${v.land.pct}%）</div>`:"");
    return;
  }
  // 判定できない。⚠ 数値を作らない（0% は出さない）。何が分からないのかを書く
  const head=WORD.cantSay(!!v.lf);
  const why=v.unread
    ? `明治期の低湿地データを<b>読み込めませんでした</b>`
    : `明治期の低湿地データは<b>整備対象外</b>です`;
  landEl.innerHTML=`<div class="land-line"><b class="land-alt">${head}</b></div>`
    + `<div class="land-den">${why}</div>`
    + sub(v.scope==="building"?`建物 ${v.total} 件は出ています${v.lf?` ／ ${v.lf}`:""}`:v.lf)
    + (v.land?`<div class="land-sub">この範囲で最も多い区分: <b>${esc(v.land.name)}</b>（${v.land.pct}%）</div>`:"");
}

function showResult(){
  if(!area) return;
  resultEl.style.display="";
  // 集計範囲が事前計算の範囲のときは、それを明示する（中心とズレうるため）
  document.getElementById("placeName").textContent =
    area.areaTitle && area.areaTitle!==area.title
      ? `${area.title}（集計範囲: ${area.areaTitle}）` : area.title;
  const heroEl=document.getElementById("heroNum"), capEl=document.getElementById("heroCap");

  // ⚠ パネルと HUD は**同じ結果**（landVerdict）を描く。ここで割合を作り直さない。
  //   ヒーローの数字は「実際に判定できたもの」からしか作らない。
  //   1408件すべてが「データなし」なのに 0.0% と出し、それを
  //   「1件ずつ判定した実測値」と書いていたのが札幌だった（掟: 取れなかったを「無い」と言わない）。
  const v=landVerdict();
  renderLand(v);
  if(v.kind==="ratio"){
    const landIsWater=v.land&&KonjakuSwale.isWater(v.land.name);
    if(v.land&&!landIsWater){
      heroEl.innerHTML=`<span class="hero-alt">${esc(v.land.name)}</span>`;
      capEl.innerHTML=`建物の足元は、明治期には<b>${esc(v.land.name)}</b>が最多でした<br>
        <span style="opacity:.7">区分を特定できた ${v.land.count} / ${v.land.classified} 件（${v.land.pct}%）</span><br>
        <span style="opacity:.7">水域だった建物：${v.pct}%（足元を判定できた ${v.classified} / ${v.total} 件）</span>`;
    } else {
      heroEl.innerHTML=`${v.pct}<small>%</small>`;
      capEl.innerHTML = v.all
        ? `の建物が、明治期には<b>水の上</b>だった<br>
           <span style="opacity:.7">${v.total}件すべての足元を1件ずつ判定した実測値</span>`
        : `の建物が、明治期には<b>水の上</b>だった<br>
           <span style="opacity:.7">足元を判定できた ${v.classified} / ${v.total} 件のうちの実測値
           （残りは明治期のデータが${WORD.meijiGap(v.unread)}）</span>`;
    }
  } else if(v.kind==="none"&&v.scope==="building"){
    // 建物ごとの割合は出せない。だが土地そのものには地形分類が答えられる。
    // 出せないものと、出せるものを、混ぜずに並べる
    heroEl.innerHTML=`<span class="hero-alt">${WORD.cantSay(!!v.lf)}</span>`;
    capEl.innerHTML = (v.lf?`${v.lf}<br>`:"") + (v.unread
      ? `明治期の低湿地データを<b>読み込めませんでした</b><br>
         <span style="opacity:.7">建物 ${v.total} 件は出ていますが、足元は1件も判定できていません</span>`
      : `この範囲は明治期の低湿地データの<b>整備対象外</b>です<br>
         <span style="opacity:.7">建物 ${v.total} 件は出ていますが、建物ごとに明治期の何だったかは分かりません</span>`);
  } else if(v.kind==="area"){
    heroEl.innerHTML=`${v.pct}<small>%</small>`;
    // 「取れなかった」と「まだ取っていない」を書き分ける
    capEl.innerHTML=`この範囲の<b>面積</b>が、明治期には水だった<br>
       <span style="opacity:.7">${bldWhyArea(v.bldState)}</span>`;
  } else if(v.kind==="dry"){
    heroEl.innerHTML=`<span class="hero-alt">水域なし</span>`;
    capEl.innerHTML=`この範囲は、明治期の低湿地データで<b>水域に該当しません</b>`;
  } else {
    heroEl.innerHTML=`<span class="hero-alt">${WORD.cantSay(!!v.lf)}</span>`;
    capEl.innerHTML = (v.lf?`${v.lf}<br>`:"") + (v.unread
      ? `明治期の低湿地データを<b>読み込めませんでした</b><br>
         <span style="opacity:.7">通信を確認して、もう一度お試しください</span>`
      : `この範囲は明治期の低湿地データの<b>整備対象外</b>です`);
  }

  paintBreakdown(document.getElementById("breakdown"), breakdown(area.counts, area.total), area.bldState);
}

// 内訳は「足元の判定の**分割**」。足すと、判定できた件数になる。
// ⚠ **判定できなかったものは、分割ではない。**
//
// 実測（2026-08-19, 375×667 札幌）: 内訳に 1 行だけ「データなし 1364 / 1364」が出ていた。
//   ⚠ `isWater("データなし")` は false なので**陸の色見本**が付き、
//     「明治期は陸だった建物が 1364 件」と読める。データの話が土地の話に化けている。
//   ⚠ 掟: データにない ≠ 現実にない。
//   → 分類の行と、判定できなかった件数を、**別のもの**として返す。
//
// ⚠ **分割（足すと判定できた件数になる）と、素性（そうである件数）を混ぜない。**
//   「建設年が分かる 8 / 533」「高さが実測 42 / 533」は分割ではなく**素性**なので、
//   同じ表に混ぜていた。素性は #est（常時見える）と #prov（台帳）が持つ。
//   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった。
//
// ⚠ 地図も DOM も見ない。検査がこの関数だけを取り出して回せる。
const NOT_CLASS={"データなし":"outside","読み込めず":"unread"};
function breakdown(counts,total){
  const rows=[]; let outside=0,unread=0;
  for(const [name,n] of Object.entries(counts||{})){
    const k=NOT_CLASS[name];
    if(k==="outside") outside+=n;
    else if(k==="unread") unread+=n;
    else rows.push({name,n,water:!!KonjakuSwale.isWater(name)});
  }
  rows.sort((a,b)=>b.n-a.n);
  const classified=rows.reduce((t,r)=>t+r.n,0);
  return {rows,classified,outside,unread,total:total||0};
}

// ここは組み立てるだけ。⚠ **何と言うかは上で決まっている**（WORD と breakdown）。
function paintBreakdown(el,b,bldState){
  if(!el) return;
  // ⚠ 分割の分母は「判定できた件数」。総数にすると、判定できなかった分だけ小さく見える
  const rows=b.rows.map((r)=>
    `<div class="stat"><span><i class="swatch" style="background:${r.water?"#8fb9dd":"#d8cfa8"}"></i>${r.name}</span>
      <b>${r.n}<span style="color:var(--ink-dim);font-weight:400"> / ${b.classified}</span></b></div>`).join("");
  // ⚠ 色見本を付けない。付けると分類に見える
  const aside=[["unread",b.unread],["outside",b.outside]].filter(([,n])=>n>0).map(([k,n])=>
    `<div class="hint">${WORD.notClassified(k,n,b.classified===0&&n===b.total)}</div>`).join("");
  el.innerHTML = b.total
    ? (rows+aside)
    // ⚠ 取得中・正常に0件・未対応・取得失敗を書き分ける。
    //   以前は2状態しか無く、**正常に0件だった土地に「建物を取得中…」**が出続けていた
    //   （ステータスは「0 件を判定しました」と言っているのに、ここは待っている顔をしていた）。
    : `<div class="hint">${WORD.noBuildings(bldState)}</div>`;
}


// ============================================================
// 場所を決めるのは、この画面ではない
// ============================================================
// ⚠ **ここに検索欄・クイック地点・現在地を置かない**（2026-08-18 方針）。
//   /peel は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
//   同じ問いに答える入口を 2 か所に置くと、
//     ・トップは「下地がある場所」にだけ導線を出しているのに、
//       こちらの検索からは**下地の無い場所へ入れてしまう**（実測: 地図は動くのに建物が出ない）
//     ・検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
//   という 2 つが同時に起きる。
//   ⚠ 場所を変える導線は「← もどる」→ トップの ✕ の一本だけ（掟: 同じ問いに答える実装を2つ持たない）。
//   ⚠ 共有された URL で直接ここへ来る経路は残っている。URL に場所が入っているので困らない。

// ============================================================
// 描画・再生
// ============================================================
const slider=document.getElementById("t"), eraEl=document.getElementById("era");
const trackEl=document.getElementById("track"), fillEl=trackEl.querySelector(".fill");
const knobEl=trackEl.querySelector(".knob"), gradeEl=document.getElementById("grade");
const mapEl=document.getElementById("map"), panel=document.getElementById("panel");
const toggle=document.getElementById("toggle");

// ⚠ 「狭い画面か」に答えるのは**ここだけ**。680px を 2 か所に書いていて、
//   片方は読み込み時に 1 度だけ、もう片方はそのつど評価していた（＝同じ問いに 2 つの答え）。
//   ⚠ PC / スマホで見せ方を分けるときは、まずこの 1 か所から分岐する。
const NARROW_Q="(max-width:680px)";
const narrow=()=>matchMedia(NARROW_Q).matches;
// ⚠ 幅が変わったら、閉じている側を入れ替える（画面回転・折りたたみ端末で起きる）
matchMedia(NARROW_Q).addEventListener("change",()=>{
  if(typeof buildRuler==="function") buildRuler();
});

// ============ 共有された状態を、URL に載せる／URL から戻す ============
// ⚠ 年代はコマ番号ではなく**安定したレイヤID**で書く。段は地点ごとに間引かれるので
//   （豊洲 9 段 / 広島 7 段 / 出島 4 段）、同じ位置が別の年代を指す。
// ⚠ スライダーは連続値だが、URL に載せるのは**段**まで。中間は「見ている途中」であって
//   共有したい状態ではない。戻すときも段の境界に合わせる。
function stepNow(){
  return Math.max(0,Math.min(steps.length-1,Math.round(Number(slider.value)/100)));
}
const eraNow=()=>steps[stepNow()]?.id ?? null;
// ⚠ q と ll しか無い古い URL も、これまでどおり開ける。era / b は足すだけで、必須にしない
// ⚠ 戻り先（← もどる）も**ここで**書き直す。loadArea で1回書くだけにしていたら、
//   段が確定する前の「現在」が焼き付き、共有された年代で入った人が
//   ← を押すと別の年代のトップへ出ていた（実測で捕まえた）。
function syncUrl(){
  if(!place) return;
  const id=eraNow()??wantEra;
  const q=`?q=${encodeURIComponent(place.title)}&ll=${place.lat.toFixed(5)},${place.lon.toFixed(5)}`
    +(id?`&era=${encodeURIComponent(id)}`:"");
  history.replaceState(null,"",q+(pickBld?`&b=${encodeURIComponent(pickBld)}`:""));
  // ⚠ el.href は絶対URLを返すので setAttribute で書く（過去に一度踏んでいる）。
  //   建物は持って戻らない。トップに建物という概念が無い
  document.getElementById("back")?.setAttribute("href","./"+q);
}
// 復元できなかったことを、**年代を動かす帯のすぐ上**で言う。
// ⚠ 黙って別の年代・別の建物を出すと、共有した人と見た人が違うものを見ていることに
//   誰も気づかない（掟: 取れなかったを「無い」と言わない の同類）。
// ⚠ 文言に URL 由来の文字列が入るので、必ず esc を通す（理由は esc.js）。
function showMiss(){
  const el=document.getElementById("stateMiss");
  if(!el) return;
  const lines=[];
  if(missEra) lines.push(`⚠ 共有された年代（${esc(missEra)}）は、この土地には残っていません`);
  if(missBld) lines.push("⚠ 共有された建物は、この範囲では見つかりませんでした");
  el.innerHTML=lines.join("<br>");
  el.hidden=!lines.length;
}
// 年代の ID を、人が読む名前にする。
// ⚠ 名前の出どころは verify.js の1か所だけ。ここで年代の一覧を作り直さない
const eraLabel=(id)=>id==="swale" ? MEIJI.label
  : ALL_ERAS.find((e)=>e.id===id)?.label ?? null;
// URL で指定された年代を、段が組み上がってから当てる。
// ⚠ 指定された年代がこの土地に無いことは普通に起きる（残っている写真は土地ごとに違う）。
//   黙って「現在」へ落とさない。
// URL で指定された建物を、建物が揃ってから当てる。
// ⚠ 建物が見えない年代（明治期の端）では吹き出しを出さない。押せない建物の情報を出さない、
//   という既存の門番（map.on("click","bld") の先頭）と同じ扱いにする。
// ⚠ 見つからないことは普通に起きる（取り込み直しで形が動く／別の範囲を見ている）。
//   黙って別の建物を選ばず、見つからなかったと言う。
function resolveWantBld(feats){
  if(!wantBld) return;
  const want=wantBld; wantBld=null;
  const f=feats.find((x)=>x.properties.k===want);
  if(!f){ missBld=true; showMiss(); syncUrl(); return; }
  const [clon,clat]=centroid(f.geometry.coordinates[0]);
  pickBld=want;
  showPick(f.properties,[clon,clat]);
  syncUrl();
}

// final=false は、段を間引く前の仮当て。**まだ「無い」とは言わない**
// （間引く前の梯子に無いだけかもしれない。掟: 取れなかったを「無い」と言わない）。
// final=true は、この地点の段が確定したあと。ここで初めて「無い」と言える。
function resolveWantEra(final){
  if(!wantEra) return;
  const want=wantEra;
  const k=steps.findIndex((s)=>s.id===want);
  // ⚠ 段の境界ちょうどに置く。中途半端な値だと、**年代の名前は出ても場面が入りきらない**。
  //   実測（2026-08-16 / 375×667 / 豊洲）: 値 769/800 では表示も目盛りも「明治期」なのに、
  //   建物を消す条件（value/100 >= 段数-0.02）に入らず、建物が立ったままだった。
  if(k>=0){ slider.value=String(k*100); if(final){ wantEra=null; } return; }
  if(!final) return;
  wantEra=null;
  missEra=eraLabel(want)??want.slice(0,24);
  showMiss();
}

// ⚠ 端の文字は、目盛りの中心に置くと枠の外へ出る（中心そろえなので左右に半分ずつはみ出す）。
//   9px のうちは偶然収まっていたが、読める大きさにしたら 375px で 3px はみ出した
//   （実測 2026-08-15。横スクロールが出る）。端だけ内側へ寄せる印を付ける。
//
// ⚠ 目盛りは**地点ごとに引き直す**。段の数が場所によって変わるため
//   （豊洲 9 段 / 広島 7 段 / 長崎 出島 4 段）。スライダーの上限も一緒に動かす。
//   ⚠ .rail / .fill / .knob / <input> は消さない。消すと操作できなくなる。
// ============================================================
// 狭い幅の「ものさし」。⚠ **その地点の全段を 1 本の軸に常時描く。**
//   直したかったのは「どこまで遡れるか分からない」ほう。実測（2026-08-19）:
//   9 段のうち画面に入っていたのは 375 幅で 2 個・320 幅で 1 個だけだった。
// ⚠ **右端はその地点の最終段。**「明治期」固定ではない（明治期データは 24 地点で 7/24）。
// ⚠ **明治期は写真ではない**（低湿地データ）。刻みの形を変え、手前に仕切りを置く。
// ⚠ **刻みは的にしない。**320 幅・9 段で 1 段 26.5px しかなく、44px を割る（掟）。
// ============================================================
const rulerEl=document.getElementById("ruler");
const rlYear=document.getElementById("rlYear"), rlSub=document.getElementById("rlSub");
const rlLeft=document.getElementById("rlLeft"), rlRight=document.getElementById("rlRight");
const rlTicks=document.getElementById("rlTicks"), rlKnob=document.getElementById("rlKnob");
const rlLine=document.querySelector("#ruler .rl-line");
const rlPrev=document.getElementById("rlPrev"), rlNext=document.getElementById("rlNext");
const rlNote=document.getElementById("rlNote");

// 段 k が軸のどこか（0..1）。⚠ 段の数が地点で変わるので、必ず steps から出す
const rlAt=(k)=>steps.length<2?0:k/(steps.length-1);

// ⚠ 狭い幅では、ものさし以外の操作部品を**到達できない**ようにする。
//   display:none の親に入っていても、実装が変われば漏れる。⚠ **要素側でも閉じる。**
//   実測（2026-08-19・320幅）: #timeToggle / #play / #t とドラムのボタン 9 個に
//   ⚠ 見えないまま焦点が当たっていた（掟: 押しても何も起きない導線を置かない）。
function sealOldControls(){
  const narrowNow=narrow();
  // ⚠ **幅ごとに、使わない側を閉じる。**片方だけ閉じると、もう片方で漏れる。
  //   ⚠ ドラムは**狭い幅の道具**なので、広い幅で閉じる。横棒・▶ はその逆。
  //   ⚠ **これは main からある漏れでもある**（実測 2026-08-19・PC でドラムのボタン 9 個に
  //     見えないまま焦点が当たっていた）。ものさしを入れるついでに、両側とも閉じる。
  const seal=(el,off)=>{ if(!el) return;
    // ⚠ inert は中の子まで一括で閉じる（ドラムのボタン 9 個もこれで閉じる）
    el.inert=off;
    if(off) el.setAttribute("aria-hidden","true"); else el.removeAttribute("aria-hidden"); };
  // ⚠ **狭い幅では #bar の中を全部使わない。**ものさしに差し替えたので、ドラムも使わない。
  //   （ドラムは 2026-08-18 に入れたが、2026-08-19 にものさしへ置き換えた）
  for(const id of ["timeToggle","play","t","track","drum"]) seal(document.getElementById(id),narrowNow);
  // ⚠ 広い幅ではドラムを使わない。**これは main からある漏れ**（実測 2026-08-19:
  //   PC でドラムのボタン 9 個に、見えないまま焦点が当たっていた）。ここで一緒に閉じる。
  if(!narrowNow) seal(document.getElementById("drum"),true);
  // ⚠ 隠したまま「開いている」と名乗らせない
  // ⚠ **timePanelOpen をここで読まない。**この関数は宣言より前に呼ばれる（buildRuler の中）。
  //   実測 2026-08-19: TDZ で例外になり、**そこから下の初期化が丸ごと止まった**
  //   （CLAUDE.md の落とし穴。describe() で一度踏んでいる）。
  //   ⚠ 広い幅の aria-expanded は applyTimePanel が毎回書くので、ここでは触らない。
  const tt=document.getElementById("timeToggle");
  if(tt&&narrowNow) tt.removeAttribute("aria-expanded");
  // ⚠ **逆も閉じる。** PC ではものさしを出していないので、こちらを到達不能にする。
  //   片側だけ閉じると、広い幅で ‹ › とドラムのボタンに焦点が当たった（実測 2026-08-19）。
  if(rulerEl){ rulerEl.inert=!narrowNow;
    if(narrowNow) rulerEl.removeAttribute("aria-hidden"); else rulerEl.setAttribute("aria-hidden","true"); }
  // ⚠ **根拠を全画面で読んでいるあいだ、地図側の操作は閉じる。**
  //   実測（2026-08-19・320幅）: パネルが覆っているのに toggle / eraToggle / ‹ › に
  //   焦点が当たっていた。⚠ 見えないものを押させない（掟）。
  //   ⚠ 「← 今昔へ」「✕ 地図へ」は帯に出ているので閉じない（戻る手段は常に残す）。
  // ⚠ **panelOpen を直に読まない。**この関数は宣言より前に呼ばれる（buildRuler の中）。
  //   ⚠ 2026-08-19 に TDZ で 2 回踏んだ。**クラスから読む**（DOM は初期化順に依らない）。
  const full=narrowNow&&!panel.classList.contains("hide");
  for(const id of ["toggle","era","timePanel","land"]){
    const el=document.getElementById(id);
    if(el) seal(el,full);
  }
}

function buildRuler(){
  sealOldControls();
  if(!rulerEl||!rlTicks) return;
  rlTicks.innerHTML="";
  steps.forEach((s,k)=>{
    const i=document.createElement("i");
    i.style.left=`${rlAt(k)*100}%`;
    // ⚠ 明治期は写真ではない。形を変える
    if(s.meiji) i.className="rl-meiji";
    rlTicks.appendChild(i);
    // ⚠ 写真の終わりに仕切り。**その手前**に置く（明治期の刻みと重ねない）
    if(s.meiji&&k>0){
      const cut=document.createElement("i");
      cut.className="rl-cut";
      cut.style.left=`${(rlAt(k)+rlAt(k-1))/2*100}%`;
      rlTicks.appendChild(cut);
    }
  });
  rlLeft.textContent=steps[0]?.label??"";
  rlRight.textContent=steps[steps.length-1]?.label??"";
  // ⚠ **できることから書く。**「写真はありません」で始めない（CLAUDE.md §4-1）
  const photo=steps.filter((s)=>!s.meiji);
  const hasMeiji=steps.some((s)=>s.meiji);
  // ⚠ 1 行に収める。2 行になると 34px 使い、地図が減る（実測 2026-08-19・320幅）。
  //   ⚠ 端のラベル（現在／明治期）が軸に出ているので、ここで年代を繰り返さない。
  //   ⚠ **できることから書く。**「写真はありません」で始めない（CLAUDE.md §4-1）。
  // ⚠ **「明治期は地図」と書けるのは、その土地に低湿地データがあるときだけ。**
  //   段は整備の有無に関わらず出る（main からの挙動）。⚠ **段があること＝データがある、ではない。**
  //   実測（2026-08-19・釧路）: 段は出るが、選ぶと「整備対象外です」と言う。
  //   ⚠ 注記だけが「明治期は地図」と約束してしまうと、軸が嘘をつく。
  const meijiHas = !area || area.waterRead !== false;
  rlNote.textContent=photo.length
    ? `空中写真 ${photo.length} 段`
      +(hasMeiji ? (meijiHas ? " ／ 明治期は地図" : " ／ 明治期はこの土地では未整備") : "")
    : "";
}

function syncRuler(){
  if(!rulerEl||!rlKnob) return;
  const pos=Number(slider.value)/100;
  rlKnob.style.left=`${Math.max(0,Math.min(1,steps.length<2?0:pos/(steps.length-1)))*100}%`;
  const k=Math.round(pos);
  const s=steps[Math.max(0,Math.min(steps.length-1,k))];
  if(s){ rlYear.textContent=s.label; rlSub.textContent=s.meiji?"":(s.sub??""); }
  rlPrev.disabled=pos<=0.001;
  rlNext.disabled=pos>=steps.length-1-0.001;
}

// ⚠ ＜＞ は 1 段ずつ。⚠ 軸のドラッグは連続（じわじわ変わる体験を残す）
const rlStep=(d)=>{
  const k=Math.max(0,Math.min(steps.length-1,Math.round(Number(slider.value)/100)+d));
  setStep(k);
};
rlPrev?.addEventListener("click",()=>rlStep(-1));
rlNext?.addEventListener("click",()=>rlStep(1));
// ⚠ 軸そのものが指の面。刻みは的にしない（26.5px は 44px を割る）
let rlDrag=false;
const rlFromX=(x)=>{
  const r=rlLine.getBoundingClientRect();
  const t=Math.max(0,Math.min(1,(x-r.left)/Math.max(1,r.width)));
  slider.value=String(t*(steps.length-1)*100);
  slider.dispatchEvent(new Event("input",{bubbles:true}));
};
rlLine?.addEventListener("pointerdown",(e)=>{ rlDrag=true; rlLine.setPointerCapture(e.pointerId); rlFromX(e.clientX); });
rlLine?.addEventListener("pointermove",(e)=>{ if(rlDrag) rlFromX(e.clientX); });
for(const ev of ["pointerup","pointercancel"]) rlLine?.addEventListener(ev,()=>{ rlDrag=false; });

function buildTicks(){
  trackEl.querySelectorAll(".tick,.lab").forEach((el)=>el.remove());
  const n=steps.length-1;
  steps.forEach((s,k)=>{
    const pc=k/n*100;
    const edge=k===0?" at-start":k===n?" at-end":"";
    // ⚠ **両端は必ず出す。** 中間は狭い画面で密集するので1つおきに間引くが、
    //   端まで間引くと「このつまみを端まで送ると何になるのか」が読めなくなる。
    //   段が固定 9 段だった頃は両端が k=0 と k=8 でどちらも偶数だったため、
    //   `k%2===0` だけで**たまたま**成立していた。段数が地点ごとに変わるいまは、
    //   長崎 出島（4 段）で終端が k=3 になり、「明治期」が空欄になっていた。
    const show=k===0||k===n||k%2===0;
    trackEl.insertAdjacentHTML("beforeend",
      `<div class="tick" data-i="${k}" style="left:${pc}%"></div>
       <div class="lab${edge}" data-i="${k}" style="left:${pc}%">${show?s.label:""}</div>`);
  });
  // スライダーの目盛りと上限を、段の数に合わせる（1段 = 100）
  slider.max=String(n*100);
  if(Number(slider.value)>n*100) slider.value=String(n*100);
  buildDrum();
}

// ============================================================
// 横ドラムロール（狭い幅）
//   段を横に並べ、指で回して真ん中で選ぶ。
// ⚠ **値の正本は #t のまま。**ここは #t を動かすだけ。▶ もカメラも #t を見ている。
//   別に値を持つと、再生中とドラム操作で答えが割れる（掟: 同じ問いに答える実装を2つ持たない）。
// ⚠ 横棒では狭くて 4 段の名前を消していたが、ここは横スクロールなので**全段に名前を出す**。
//   実測（2026-08-18）: 段は 9 つあり、**全部に名前はあった**（表示で間引いていただけ）。
// ============================================================
const drumEl=document.getElementById("drum");
let drumSelf=false, drumTimer=null;
function buildDrum(){
  if(!drumEl) return;
  drumEl.innerHTML=steps.map((s,k)=>
    `<button class="d-it" type="button" data-i="${k}">${esc(s.label)}</button>`).join("");
  // 全体のどこにいるかの点。⚠ 押せない（位置を知らせるだけ）
  const pos=document.getElementById("drumPos");
  if(pos) pos.innerHTML=steps.map(()=>"<i></i>").join("");
  // 文字を押しても選べる（回すのが苦手な人の逃げ道）
  drumEl.querySelectorAll(".d-it").forEach((b)=>{
    b.onclick=()=>setStep(Number(b.dataset.i));
  });
  syncDrum(true);
}
// 段を選ぶ。⚠ #t を動かして input を投げる（既存の経路に一本化する）
function setStep(k){
  const v=Math.max(0,Math.min(steps.length-1,k))*100;
  if(Number(slider.value)===v) return;
  slider.value=String(v);
  slider.dispatchEvent(new Event("input",{bubbles:true}));
}
// いまの値に合わせてドラムを寄せる。⚠ 自分で動かしている間は scroll を聞き返さない
function syncDrum(instant){
  if(!drumEl||!drumEl.offsetParent) return;      // PC（display:none）では何もしない
  const it=drumEl.querySelectorAll(".d-it");
  if(!it.length) return;
  const pos=Number(slider.value)/100;
  const i=Math.max(0,Math.min(it.length-1,Math.round(pos)));
  it.forEach((b,k)=>b.classList.toggle("on",k===i));
  document.getElementById("drumPos")?.querySelectorAll("i")
    .forEach((d,k)=>d.classList.toggle("on",k===i));
  // ⚠ 連続値（再生中）でも追えるよう、段と段の間を按分する
  const a=it[Math.floor(pos)]??it[i], b2=it[Math.ceil(pos)]??it[i];
  const f=pos-Math.floor(pos);
  const cx=(a.offsetLeft+a.offsetWidth/2)*(1-f)+(b2.offsetLeft+b2.offsetWidth/2)*f;
  const want=Math.round(cx-drumEl.clientWidth/2);
  if(Math.abs(drumEl.scrollLeft-want)<1) return;
  drumSelf=true;
  drumEl.scrollTo({left:want,behavior:instant?"auto":"smooth"});
  clearTimeout(drumTimer);
  drumTimer=setTimeout(()=>{ drumSelf=false; },260);
}
// 指で回したら、真ん中に来た段を選ぶ
let drumStill=null;
drumEl?.addEventListener("scroll",()=>{
  if(drumSelf) return;
  clearTimeout(drumStill);
  // ⚠ 止まってから決める。動いている途中で決めると、通り過ぎた段を全部選ぶことになる
  drumStill=setTimeout(()=>{
    const it=drumEl.querySelectorAll(".d-it");
    if(!it.length) return;
    const c=drumEl.scrollLeft+drumEl.clientWidth/2;
    let best=0,bd=Infinity;
    it.forEach((b,k)=>{ const d=Math.abs(b.offsetLeft+b.offsetWidth/2-c);
      if(d<bd){bd=d;best=k;} });
    setStep(best);
  },90);
});
buildTicks(); buildRuler();

// ============================================================
// 地表のラスタが本当に届いたか（掟: 取れなかったを「無い」と言わない の根）
//   「いま画面に出ているもの」の地表の行だけ、届いたかを見ずに「実測」と書いていた。
//   タイルが1枚も来ていなくても「その年代の空中写真そのもの」と言い切るので、
//   水面・建物に入れたガードを、いちばん広い面で自分から破っていた（掟: 根拠のないことは書かない / 掟: 確率を出さない。実測値そのものを出す）。
//
//   確かめ方は MapLibre のイベントを数えるだけにした。タイルURLを自分で叩き直すと
//   同じ画像を2度取りに行くことになり、事前計算で得た速さ（建物まで約450ms）を
//   捨てることになる。読めた／落ちたを本当に知っているのは地図の側なので、
//   その報せをそのまま受ける。追加の通信はゼロ。
//
//   見るのは「1枚でも読めたか」ではなく「いま見ている地点を覆うタイルが読めたか」。
//   別の場所で読めたタイルは、この地点の地表の根拠にならない。
// ============================================================
let ground=null;                 // いま地表として出している source と、その到達
const okTiles=new Map();         // source id → 読めたタイルの "z/x/y"
// ⚠ **無名のまま置かない。** 名前が付いていれば、何を受けて何を決めているかが
//   grep で読めるし、検査から名指しできる。
function onTileData(e){
  if(e.dataType!=="source"||!e.tile||!e.coord||e.tile.state!=="loaded") return;
  const c=e.coord.canonical, k=`${c.z}/${c.x}/${c.y}`;
  let s=okTiles.get(e.sourceId); if(!s) okTiles.set(e.sourceId,s=new Set());
  if(s.has(k)) return;
  s.add(k);
  // 描き直すのは、地表の行が「未取得」から変わりうるときだけ。
  // タイル1枚ごとに全部描き直すと、再生中の負荷を無駄に増やす。
  if(ground&&!ground.ok&&ground.id===e.sourceId) render();
}
map.on("data",onTileData);

// 落ちたことを覚える。⚠ **成功しか数えていないと、「まだ来ていない」と「落ちた」が
//   どちらも false になり、区別できない。**
// ⚠ 実測（2026-08-18・tmp/probe-map-error.mjs・豊洲）。何が拾えるかは落とし方で違う:
//     404（写真が無い） … **error が来ない**（MapLibre は 404 を異常と見なさない）
//     403（拒否）       … 106 回。status 403
//     通信断            … 76 回。status 0
//     応答が返らない     … 来ない（まだ待っているので、それが正しい）
// ⚠ **404 は「遅い」と区別できない。** ここは分からないままにする。
//   分からないことを、分かったように書かない（掟）。
const failedSources=new Map();   // source id → いちばん最近の落ち方
function onMapError(e){
  const id=e.sourceId;
  if(!id) return;
  const st=e.error?.status;
  // ⚠ 語彙は places.js の whyOf に合わせる（掟: 同じ問いに答える実装を2つ持たない）
  const why=st===0||st==null ? "通信できません"
          : st===403||st===401 ? "サーバが拒否しました"
          : st>=500 ? `サーバが ${st} を返しました`
          : `サーバが ${st} を返しました`;
  const had=failedSources.get(id);
  failedSources.set(id,{ status:st??0, why });
  // 落ち方が変わった／初めて落ちたときだけ描き直す。1枚ごとに描き直さない
  if(!had||had.why!==why) render();
}
map.on("error",onMapError);
// その地点を覆うタイルが読めているか。どのズーム段で取りに行くかは地図側の都合で
// 変わる（256px タイルは表示ズーム+1段で取る）ので、読めたタイルの側から
// 「中心を含むか」で見る。段を決め打ちしないぶん、再生中のズーム変化にも耐える。
//
// ⚠ **この関数は地図も DOM も見ない。** 覆っているかだけを答える。
//   keys は読めたタイルの "z/x/y"、xf/yf は z0 段でのタイル座標（小数）。
//   検査はこの関数だけを取り出して回す（ブラウザを立てずに境界を確かめられる）。
function tilesCover(keys,xf,yf,z0){
  for(const k of keys){
    const [z,x,y]=k.split("/").map(Number), n=2**(z-z0);
    if(Math.floor(xf*n)===x&&Math.floor(yf*n)===y) return true;
  }
  return false;
}
// 地表がいまどういう状態か。⚠ **地図も DOM も見ない。**（検査が直に回す）
//   arrived … その地点を覆うタイルが読めた
//   late    … 猶予を過ぎても読めていない
//   fail    … 落ちたことを実際に観測した（why はその理由）
// ⚠ **fail と late を混ぜない。** late は「まだ来ていない／404 で写真が無い」を含み、
//   こちらは理由を知らない。知らないことを「読み込めませんでした」と書かない。
function groundState(arrived, late, fail){
  if(arrived) return { kind:"ok" };
  if(fail) return { kind:"fail", why:fail.why };
  if(late) return { kind:"late" };
  return { kind:"pending" };
}

function rasterArrived(id){
  const s=okTiles.get(id);
  if(!s) return false;
  const c=map.getCenter();
  return tilesCover(s,lon2xf(c.lng),lat2yf(c.lat),Z);
}

// ============================================================
// 描画は「変わる速さ」で 2 つに分ける
//
//   paint(v)     毎フレーム。地図の塗りと、つまみ・目盛りの位置。**言葉は書かない**
//   describe(v)  言葉と台帳。**中身が変わったときだけ**書く
//
// ⚠ 混ぜていたときの実測（2026-08-18・豊洲・1280×900・tmp/probe-render-churn.mjs）:
//   再生 1 回（11.1 秒）で台帳（17 要素）を **299 回**作り直していた。
//   台帳が変わりうるのは「段が変わったとき」と「データが届いたとき」だけで、
//   この地点の段は 9 つしかない。
//
// ⚠ **1 つの関数に混ぜると、例外 1 つで絵も言葉も両方止まる。**
//   実際に TDZ で落ちて、そこから下の描画が丸ごと止まったことがある（画面は何も言わない）。
//
// ⚠ PC / スマホで見せ方を分けるときは、**describe() の側だけを分ける**。
//   paint() は 1 つのままにする（地図の塗りに端末の別は無い）。
// ============================================================

// いま何段目・どの年代か。paint と describe が**同じ答え**を使う。
// ⚠ pos は「何段目か」、tau は「いつか」。**混ぜない。**
//   目盛り・不透明度の混ぜ・ノブの位置は pos。
//   建物が消える年・水位・建物のフェードは tau（段を間引いても動かない）。
function viewNow(){
  const nPhoto=photoSteps();
  const pos=Number(slider.value)/100, i=Math.min(Math.floor(pos),nPhoto-1), f=pos-i;
  // いま主に見えている段。明治期の段は写真ではないので near には入れない
  const sNear=f<.5?steps[i]:(steps[i+1]??null);
  const near=(sNear&&!sNear.meiji)?sNear:null;
  return { nPhoto,pos,i,f,tau:tauAt(pos),near,cur:near??MEIJI,
    // ⚠ 建物が見えているか。**下の3か所（重ね・案内・但し書き）が同じ判定を使う。**
    bldVisible: !!(area&&area.total)&&pos<nPhoto-0.02 };
}

function render(){ if(!ready) return; const v=viewNow(); paint(v); describe(v); }

function paint(v){
  const {nPhoto,pos,i,f,tau}=v;
  // ⚠ 可視を先に決める。不透明度を上げてから可視にすると、1フレーム抜ける
  // ⚠ 段に載っていない年代は**一度も可視にしない**。ここが 404 を 202 件送っていた元。
  const vis=timelineReady?visibleEras(pos,nPhoto):new Set([0]);
  const visIds=new Set([...vis].map((k)=>steps[k]?.id));
  for(const e of ALL_ERAS){
    const want=visIds.has(e.id)?"visible":"none";
    if(map.getLayoutProperty(`g-${e.id}`,"visibility")!==want)
      map.setLayoutProperty(`g-${e.id}`,"visibility",want);
  }
  const sw=(timelineReady&&swaleVisible(pos,nPhoto))?"visible":"none";
  if(map.getLayoutProperty("g-swale","visibility")!==sw)
    map.setLayoutProperty("g-swale","visibility",sw);

  for(const e of ALL_ERAS) map.setPaintProperty(`g-${e.id}`,"raster-opacity",0);
  for(const k of [i,i+1]){
    const s=steps[k];
    if(s&&!s.meiji) map.setPaintProperty(`g-${s.id}`,"raster-opacity",k===i?1-f:f);
  }
  map.setPaintProperty("g-swale","raster-opacity",i===nPhoto-1?f:0);

  map.setPaintProperty("bld","fill-extrusion-height",
    ["*",["get","height"],["max",0,["min",1,["/",["-",["get","vanish"],tau],1.1]]]]);
  // ⚠ 半透明で薄れさせない。実測（利用者役のエージェントによる検証 2026-08-14）:
  //   1945–50 の不透明度 0.80 で**焼け跡の瓦礫が建物ごしに透け**、
  //   広島の利用者は「消えかけの幽霊」「これは広島の人間には見せられない」と言った。
  //   「消えかけている」ように見せるのが最悪で、「はっきり別物として重ねている」ほうがよい。
  //   → 明治期の端で消えるところ以外は、薄れさせない。
  map.setPaintProperty("bld","fill-extrusion-opacity",Math.max(0,.94-Math.max(0,tau-7.0)*.94));

  const wr=Math.max(0,Math.min(1,(tau-5.4)/(TAU_MEIJI-5.4)));
  map.setPaintProperty("water","fill-extrusion-height",0.4+wr*4.2);
  map.setPaintProperty("water","fill-extrusion-opacity",wr*.78);

  gradeEl.style.opacity=String(wr*.95);
  mapEl.style.filter=`saturate(${1-wr*.42}) contrast(${1+wr*.10}) brightness(${1-wr*.10})`;

  const pc=pos/nPhoto*100;
  fillEl.style.width=pc+"%"; knobEl.style.left=pc+"%";
  const selected=Math.max(0,Math.min(steps.length-1,Math.round(pos)));
  trackEl.querySelectorAll(".tick").forEach((el)=>{
    const k=Number(el.dataset.i);
    el.classList.toggle("on",k<=pos+.5);
    el.classList.toggle("selected",k===selected);
  });
  trackEl.querySelectorAll(".lab").forEach((el)=>
    el.classList.toggle("selected",Number(el.dataset.i)===selected));
  // ⚠ ものさしも同じ周期で追う。触るのは 2 つの要素だけ（つまみの位置と年）
  syncRuler();
}

// ⚠ 静的 HTML にあるものを、毎フレーム引き直さない。**1 度だけ引いて持つ。**
//   以前は 6 個を render() の中で getElementById していた（＝「あるか分からない」
//   という不安がコードに残っていた）。無ければ**起動時に**分かるほうがよい。
const timeSummaryEl=document.getElementById("timeSummary");
const eraSummaryNoteEl=document.getElementById("eraSummaryNote");
const overEl=document.getElementById("over");
const tipEl=document.getElementById("tip");
const estEl=document.getElementById("est");
const provEl=document.getElementById("prov");

// 言葉を変えうるものの一覧。
// ⚠ **ここに挙げたものだけが、言葉を変える。**足したのに挙げ忘れると、
//   データが変わったのに画面が古いまま残る（黙って古い数字を見せることになる）。
function describeKey(v,gid,arrived,late,why,online){
  return JSON.stringify([v.cur.label,gid,arrived,late,why,online,v.bldVisible,v.pos>.02,picked,
    area&&[area.waterRead,area.waterUnread,area.bldState,area.total,area.bldSource,
           area.dated,area.unread,
           area.hSrc&&[area.hSrc.measured,area.hSrc.levels,area.hSrc.default]]]);
}
let described=null;

// ⚠ **届いていないうちは「表示中」と言わない。**
//   ⚠ ただし届くのは速い。実測（2026-08-18・豊洲・tmp/probe-ground-arrival.mjs）:
//     通常回線 … 現在 69ms ／ 段の切替 0〜403ms
//     3G 相当  … 現在 9,515ms ／ 段の切替 3.4〜7.0 秒、5 段は 20 秒たっても届かない
//   すぐ切り替えると、**通常回線で段を送るたびに 0〜0.4 秒だけ光る**。
//   だから「この時間たっても来ていない」を見てから言う。
//   ⚠ この猶予は**観測であって推測ではない**。1.2 秒たっても届いていないのは事実。
//   ⚠ ここで**理由は言わない**。落ちたのか、まだ来ていないのかを、いまは知らない
//     （区別する仕組みは別に足す。`tmp/9/24`）。
const GROUND_GRACE_MS = 1200;
// 年代の名乗りに何と書くか。⚠ **地図も DOM も見ない。**（検査がこの関数だけを取り出して回す）
// ⚠ 「表示中」は、その年代の地面が本当に画面に出ているときだけ。
// ⚠ 「読み込めませんでした」とは書かない。落ちたのか、まだ来ていないのかを、いまは知らない。
//   知らないことを断定しない（掟: 取得できなかった ≠ 存在しなかった）。
//
// ⚠ **「まだ出ていません」と「読み込めませんでした」を混ぜない。**
//   前者は理由を知らない（遅いのか、404 でその写真が無いのか、区別できない）。
//   後者は**落ちたのを実際に観測した**ときだけ言う。
//   実測（2026-08-18・tmp/probe-map-error.mjs）: 403 と通信断は map.on("error") で
//   拾えるが、**404 は拾えない**（MapLibre は 404 を異常と見なさない）。
//
// ⚠ **接続の話は、こちらが知っている範囲でしか言わない。**
//   online===false … 圏外だと端末が言っている。**言い切ってよい**
//   online===true  … つながっているのに取れない理由を、こちらは知らない。
//                    「確認してください」に留める（誰のせいとも断定しない）
// ⚠ 語彙は places.js の検索側に合わせる（掟: 同じ問いに答える実装を2つ持たない）。
function eraReadout(state, isLatest, isMeiji, sub, online){
  const what = isMeiji ? "明治期の地面" : isLatest ? "いまの街の写真" : "この年代の写真";
  // ⚠ **普段は名乗らない。** 出ているのが当たり前のときに「表示中」と書いても、
  //   何のことか分からないまま**主役（年代）から目を奪う**（実測 2026-08-19・320幅:
  //   年代の字 38px に対して「表示中」は 12px だが、行の頭に居るので先に読まれる）。
  //   ⚠ **消すのは「普段」だけ。**出ていないときは必ず名乗る
  //     （「出ていないものを表示中と言わない」を直したときの性質。崩さない）。
  if(state?.kind==="ok"||!state) return { kick:"", sub };
  if(state.kind==="fail")
    return { kick:"出せません",
      sub:`${what}を読み込めませんでした（${state.why}）`,
      hint: online===false ? "インターネットに接続していません"
                           : "接続を確認してください" };
  if(state.kind==="late") return { kick:"選択中", sub:`${what}は、まだ出ていません` };
  // ⚠ 猶予の中（pending）。まだ届いていないが、**普通の回線ならすぐ届く**
  //   （実測: 通常回線 69〜403ms）。ここで名乗ると、読み込みのたびに一瞬光る。
  return { kick:"", sub };
}
let groundGid=null, groundSince=0, groundTimer=null;
function groundLate(gid, arrived){
  if(gid!==groundGid){ groundGid=gid; groundSince=performance.now(); }
  if(arrived) return false;
  return performance.now()-groundSince >= GROUND_GRACE_MS;
}

function describe(v){
  const {near,cur,bldVisible,pos}=v;
  // 「いま画面に出ているもの」は、出ているものだけを説明する。
  // 水面が出ていないのに「実測の水域」とは書かない。地表も同じで、
  // タイルが届いていないなら「実測」とは言わない（届かなかっただけで、
  // その年代の写真が無いとも言わない）。
  const gid=near?near.id:"swale";
  const arrived=rasterArrived(gid);
  const late=groundLate(gid,arrived);
  const gstate=groundState(arrived, late, failedSources.get(gid));
  // 猶予が明けたら、もう一度だけ描き直す（届けば onTileData が描き直す）
  if(groundTimer){ clearTimeout(groundTimer); groundTimer=null; }
  if(!arrived&&!late)
    groundTimer=setTimeout(render, GROUND_GRACE_MS-(performance.now()-groundSince)+30);
  const key=describeKey(v,gid,arrived,late,gstate.why??"",navigator.onLine);
  if(key===described) return;
  described=key;
  ground={ id:gid, ok:arrived };

  eraEl.querySelector(".y").textContent=cur.label;
  const read=eraReadout(gstate, !!near&&near.id===Konjaku.LATEST.id, !near,
                        near?subOf(near):MEIJI.sub, navigator.onLine);
  eraEl.querySelector(".kick").textContent=read.kick;
  eraEl.querySelector(".s").textContent=read.sub;
  // ⚠ 接続の話は**別の行**に置く。写真の話と混ぜると、どちらが事実か読めなくなる
  const netEl=eraEl.querySelector(".era-net");
  if(netEl) netEl.textContent=read.hint ?? "";
  eraEl.classList.toggle("waiting",gstate.kind==="late");
  eraEl.classList.toggle("failed",gstate.kind==="fail");
  eraEl.classList.toggle("meiji",!near); trackEl.classList.toggle("meiji",!near);
  slider.setAttribute("aria-valuetext",cur.label);
  if(timeSummaryEl) timeSummaryEl.textContent=cur.label;
  if(eraSummaryNoteEl) eraSummaryNoteEl.textContent=(bldVisible&&pos>.02)?"いまの街を重ねています":"";
  // ⚠ 過去の年代に入ったら、年と同じ強さで「重ねている」と言う。
  //   建物は現在のもので、地面だけが過去。そこを画面が言わないと、
  //   利用者は自分の知識でしか判別できない（知識が無ければ判別できない）。
  if(overEl) overEl.innerHTML=(bldVisible&&pos>0.02)
    ? `この街並みは<b>いまのもの</b>です。地面だけが ${cur.label} です。` : "";

  // ⚠ 触る前の案内。押したら消す。役目が終わったものを画面に置き続けない
  // ⚠ 建物が1棟も見えていないとき（明治期の端）は、建物の話をしない。
  //   実測（2026-08-14）: 明治期では全建物の高さが 0 になり1棟も見えないのに、
  //   「建物は…件が推定」「建物を押すと分かります」が出続け、
  //   **見えない建物が押せた**（4か所試して 4/4 でカードが出た）。
  //   利用者は「幽霊」「気持ち悪い」と言った。
  if(tipEl) tipEl.textContent=(bldVisible&&!picked)
    ? "建物を押すと、その足元が分かります" : "";

  // ⚠ 「建物が消える年代は演出」は、**ここにしか置けない**。
  //   実測（2026-08-15）: この主張は #prov（パネルの中）にしか無く、
  //   スマホではパネルが閉じて始まるので **☰ を押す＋パネル内を 254px スクロール**
  //   しないと読めなかった。#est は建物が見えているあいだ 100%・0アクションで見える。
  //   誤解を止める文は、到達率の高い側にしか置けない。
  // ⚠ 主張を先頭に置く。1行目だけ読んだ人が受け取るのが「演出」になるように。
  // ⚠ 「建物はいまの形です」は落とした。過去の写真の上では #over が 15px で
  //   「この街並みはいまのものです」と言っており、51px 離れて同じ主張が
  //   2つの大きさで並んでいた（実測 SP: y=452 と y=503）。
  if(estEl){
    estEl.innerHTML = bldVisible
      ? `<b>建物が消える年代は演出</b>です。建てられた年が分かるのは <b class="k">${
          area.dated} / ${area.total}</b> 件だけ。高さも <b class="k">${
          area.hSrc ? area.hSrc.default+area.hSrc.levels : "?"} / ${area.total}</b> 件が推定です。`
      : "";
  }

  if(!provEl) return;
  // ⚠ 台帳の**文面と語彙は public/prov.js**（実測／未取得／欠落／未対応／推定）。
  //   ここでは組み立てない。行を足したくなったら prov.js に足す。
  //   分けた理由: あちらは DOM も地図も見ないので、検査がブラウザ抜きで
  //   全組み合わせを回せる（掟: 取れなかったを「無い」と言わない、を字面ではなく tag で見る）。
  provEl.innerHTML=KonjakuProv.html(KonjakuProv.rows({ groundArrived:arrived, era:near, area }));
  wireProvPeek();
}

// ⚠ 押している間だけ。既定の色は wasWater（99.6% の色そのもの）なので、
//   恒久的に上書きすると「99.6% が水色」と言いながら画面は灰色、という食い違いになる。
//   高さそのものは触らない（推定を打ち消すために新しい推定を作ることになる）。
// ⚠ 離したら必ず既定の色（明治期の判定そのもの）に戻す。
const BLD_COLOR=["case",["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"];
// ⚠ **押した先（地図）が見えていないと、押しても何も起きないボタンになる**（2026-08-18）。
//   狭い幅では根拠を全画面で読ませているので、このボタンを押しても地図が無い。
//   利用者役 3/3 が「押したらどうなるのか想像できない」「押して何も起きないように
//   見えると二度と押さない」と答えた。
//   → 押した瞬間に**パネルを閉じて地図を出す**。押しているあいだだけ光るのは変えない。
// ⚠ **離す場所はボタンの上とは限らない。**閉じた瞬間、指の下は地図になる。
//   ボタンにだけ pointerup を張ると、色が戻らないまま居座る。window で受ける。
function peekOn(id,expr){
  const pk=document.getElementById(id);
  if(!pk) return;
  const on=()=>{ try{ map.setPaintProperty("bld","fill-extrusion-color",expr); }catch{} };
  const off=()=>{ try{ map.setPaintProperty("bld","fill-extrusion-color",BLD_COLOR); }catch{} };
  pk.addEventListener("pointerdown",(e)=>{
    e.preventDefault();
    // ⚠ 全画面で読んでいるときだけ閉じる。PC は地図が横に見えているので閉じない
    if(narrow()) closePanel();
    on();
    addEventListener("pointerup",off,{once:true});
    addEventListener("pointercancel",off,{once:true});
  });
  for(const ev of ["pointerup","pointerleave","pointercancel","blur"])
    pk.addEventListener(ev,off);
}
// ⚠ ボタンは台帳を組み直すたびに**新しい要素**になる。だから張り直す。
//   組み直しは段が変わったときだけなので、毎フレームではない。
function wireProvPeek(){
  peekOn("peekH",["case",["==",["get","heightSource"],"default"],"#5b6470",
                  ["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"]);
  // ⚠ exact（建設年が分かっている印）は、ここまで**描画に一度も使われていなかった**
  peekOn("peekY",["case",["==",["get","exact"],1],"#e6c47a","#5b6470"]);
}
// ⚠ URL を書くのは**段が変わったときだけ**。input は引いているあいだ連続で飛ぶので、
//   毎回 replaceState すると 1 回の操作で数十回書くことになる。
//   載せたいのは段までなので、段が同じあいだは書く必要も無い。
let urlStep=null;
slider.addEventListener("input",()=>{
  stop(); render(); syncDrum(true);
  const k=stepNow();
  if(k!==urlStep){ urlStep=k; syncUrl(); }
});

// 端の年代ラベルは、見た目の中心が range の最大・最小位置からずれる。
// そのまま押すと「明治期」と表示されても値が最大に届かず、場面が切り替わりきらないため、
// 文字を押したときは、その段を明示的に選ぶ。
//
// ⚠ **既定動作を止めない。** 以前は文字だけ pointer-events:auto にして pointerdown を
//   preventDefault/stopPropagation していたが、そうすると range がドラッグを始めないので、
//   **文字の上から引いても値がその段に貼り付いて動かなかった**
//   （実測 2026-08-16・375×667・豊洲: 右へ 120px 引いて 200 → 200 → 200 …。
//    ノブの上・レールの上からは連続して動いていた）。
//   そこで、押した点がどの文字の箱の中かだけを覚えておき、
//   **ほとんど動かずに離したとき**＝タップのときだけ、その段へ寄せる。
// ⚠ 引いた結果は寄せない。引き終えてから段へ吸うと、指を離した瞬間に値が飛ぶ。
const TAP_SLOP=6;         // これ以下の移動はタップ。指で押すと数 px は動く
let labFrom=null;
// ⚠ 文字は pointer-events:none なので e.target には出てこない。箱で当てる。
//   文字を間引いた（空の）ラベルは的にしない（押しても何が選ばれたのか読めない）
// ⚠ **重なったときは、中心がいちばん近いものを選ぶ。**
//   箱を指の大きさ（44px）まで広げたら、狭い画面で隣と重なった。
//   DOM の順に最初の1つを返していたので、320×640 で「明治期」を押すと
//   手前の「1945–50」が当たり、**値が 600 で止まった**（実測 2026-08-18）。
//   ⚠ 重なりを消す方向では直せない。320px では文字の間隔が 55px しかなく、
//     「1984–86」の字だけで 53px ある。**重なる前提で、境目を中点に置く。**
const labAt=(x,y)=>{
  let best=null, bestD=Infinity;
  for(const el of trackEl.querySelectorAll(".lab")){
    if(!el.textContent.trim()) continue;
    const r=el.getBoundingClientRect();
    if(x<r.left||x>r.right||y<r.top||y>r.bottom) continue;
    const d=Math.abs(x-(r.left+r.right)/2);
    if(d<bestD){ bestD=d; best=el; }
  }
  return best;
};
trackEl.addEventListener("pointerdown",(e)=>{
  const mark=labAt(e.clientX,e.clientY);
  const k=mark?Number(mark.dataset.i):NaN;
  labFrom=Number.isFinite(k)?{x:e.clientX,y:e.clientY,k}:null;
});
trackEl.addEventListener("pointerup",(e)=>{
  const f=labFrom; labFrom=null;
  if(!f) return;
  if(Math.hypot(e.clientX-f.x,e.clientY-f.y)>TAP_SLOP) return;   // 引いた。連続移動の結果を残す
  slider.value=String(f.k*100);
  slider.dispatchEvent(new Event("input",{bubbles:true}));
});
// 押しかけたまま取り消されたものを、次の操作へ持ち越さない
trackEl.addEventListener("pointercancel",()=>{ labFrom=null; });

const playBtn=document.getElementById("play");
const eraDetails=document.getElementById("eraDetails");
const eraToggle=document.getElementById("eraToggle");
const eraToggleText=document.getElementById("eraToggleText");
let eraPanelOpen=true;
function applyEraPanel(){
  eraEl.classList.toggle("collapsed",!eraPanelOpen);
  eraDetails.hidden=!eraPanelOpen;
  eraToggle.setAttribute("aria-expanded",String(eraPanelOpen));
  // ⚠ 画面には記号だけ出す。名乗りは読み上げに残す（.sr）。
  //   ⚠ **記号の向きは CSS が回す（.collapsed で rotate(180deg)）。ここで文字を差し替えない。**
  //   両方やると二重に反転して、閉じているのに「閉じる」向きになる（2026-08-19 に踏んだ）。
  eraToggleText.textContent=eraPanelOpen?"閉じる":"開く";
  eraToggle.setAttribute("aria-label",`この年代の説明を${eraPanelOpen?"閉じる":"開く"}`);
}
eraToggle.onclick=()=>{ eraPanelOpen=!eraPanelOpen; applyEraPanel(); };
applyEraPanel();
const timePanel=document.getElementById("timePanel");
const timePanelBody=document.getElementById("timePanelBody");
const timeToggle=document.getElementById("timeToggle");
const timeToggleText=document.getElementById("timeToggleText");
let timePanelOpen=true;
function applyTimePanel(){
  timePanel.classList.toggle("collapsed",!timePanelOpen);
  timePanelBody.hidden=!timePanelOpen;
  timeToggle.setAttribute("aria-expanded",String(timePanelOpen));
  // ⚠ 画面には記号だけ出す。名乗りは読み上げに残す（.sr）。
  //   ⚠ **記号の向きは CSS が回す（.collapsed で rotate(180deg)）。ここで文字を差し替えない。**
  //   両方やると二重に反転して、閉じているのに「閉じる」向きになる（2026-08-19 に踏んだ）。
  timeToggleText.textContent=timePanelOpen?"閉じる":"開く";
  timeToggle.setAttribute("aria-label",`年代を動かす帯を${timePanelOpen?"閉じる":"開く"}`);
}
timeToggle.onclick=()=>{ timePanelOpen=!timePanelOpen; applyTimePanel(); };
applyTimePanel();
// 1段あたりの所要時間。全 8 段で 11 秒だったものを、段あたりに直した。
// ⚠ 段の数は地点によって変わる（豊洲 8 / 広島 6 / 長崎 出島 3 段の写真）。
//   総時間を固定すると、段が少ない地点ほど1段が長くなって間延びする。
let raf=null; const DUR_PER_STEP=11000/8;
// ⚠ **「動きを減らす」を見るのは、ここ 1 か所。**
//   ⚠ 毎フレーム matchMedia() を呼ばない（60fps × 11 秒 ＝ 660 回作ることになる）。
//     1 つ作っておいて matches を読む。⚠ **設定を途中で変えても追いつく**（live に更新される）。
//   ⚠ 名前を `lessMotionMQ` にしてある。トップの `lessMotion` は**関数**で、
//     こちらは **MediaQueryList**。同じ名前だと、読む人が呼び方を取り違える。
const lessMotionMQ=matchMedia("(prefers-reduced-motion: reduce)");
// パネルの開閉を1つの状態で持つ。
// 再生中は一時的に隠し、終わったら「利用者が望んだ状態」に戻す。
// stop() が毎回 setChrome(false) を呼ぶので、状態を持たないと
// スマホの初期折りたたみが打ち消されてしまう。
const isNarrow = narrow();   // ⚠ 初期状態は読み込み時の幅で決める（あとで変えない）
let panelOpen = !isNarrow;              // スマホでは主役（3Dの絵）を隠さない
const applyPanel = () => { panel.classList.toggle("hide", !panelOpen);
  // ⚠ 全画面で読むあいだ、地図側の操作を閉じる／戻す
  if(typeof sealOldControls==="function") sealOldControls(); };
function setChrome(playing){ panel.classList.toggle("hide", playing || !panelOpen); }
const openPanel  = () => { panelOpen = true;  applyPanel(); };
const closePanel = () => { panelOpen = false; applyPanel(); };
document.getElementById("closePanel").onclick = closePanel;
applyPanel();
function stop(){ if(raf)cancelAnimationFrame(raf); raf=null;
  playBtn.textContent="▶"; playBtn.setAttribute("aria-pressed","false"); setChrome(false); }
playBtn.onclick=()=>{
  if(raf) return stop();
  // ⚠ 通しで送るときだけ、全年代を先に読む。**押した人だけが払う。**
  //   1段あたり約1.4秒しかないので、隣1段では間に合わない。
  //   押していない人は隣1段のまま（実測 136 枚）。
  // ⚠ 終点も所要時間も**段の数から出す**。8 段を決め打ちすると、
  //   広島（7 段）では端まで行かないまま止まる／速すぎる、のどちらかになる。
  preloadAll=true; render();
  playBtn.textContent="❚❚"; playBtn.setAttribute("aria-pressed","true"); setChrome(true);
  const end=(steps.length-1)*100;
  const from=Number(slider.value)>=end-5?0:Number(slider.value);
  const dur=DUR_PER_STEP*(steps.length-1);
  const c=map.getCenter(), z0=map.getZoom(), b0=map.getBearing(), p0=map.getPitch();
  const t0=performance.now();
  const step=(now)=>{
    const p=Math.min(1,(now-t0)/(dur*(1-from/end)));
    const e=p<.82?p/.82*.74:.74+(p-.82)/.18*.26;
    const v=from+(end-from)*e; slider.value=String(v);
    const u=v/end;
    // ⚠ **「動きを減らす」を入れている人には、カメラを振らない。**
    //   ⚠ **消すのは動きであって、結果ではない。** 年代は最後まで送るし、所要時間も変えない。
    //     ⚠ 止めると押しても何も起きない導線になる（ADR 0026）ので、送りは残す。
    //   ⚠ **jumpTo ごと呼ばない。**同じ値で毎フレーム呼び直すと、
    //     利用者が再生中に動かした地図を、こちらが押し戻すことになる。
    //   実測（2026-08-19・豊洲 PC）: 振ると 11 秒で bearing +46°・zoom -0.55・pitch +10°。
    //     ⚠ 利用者役 3/3 が「向きが変わった」を先に挙げ、建物が消えたことに触れたのは 1/3 だった。
    //     振らない版では 3/3 が「建物が減った」「地面が古くなった」と答えた。
    if(!lessMotionMQ.matches)
      map.jumpTo({center:c,zoom:z0-u*.55,bearing:b0+u*46,pitch:Math.min(78,p0+u*10)});
    render();
    // ⚠ 再生は input を投げずに #t を直接動かすので、ドラムはここで追わせる。
    //   追わせないと、再生し終わったあとドラムだけ前の段に取り残される。
    syncDrum(true);
    if(p<1) raf=requestAnimationFrame(step); else stop();
  };
  raf=requestAnimationFrame(step);
};
toggle.onclick=openPanel;
addEventListener("keydown",(e)=>{
  // ⚠ 以前は「検索欄に入力中は除く」を見ていた。検索欄を外した（2026-08-18）ので、
  //   入力中の要素そのもので見る。⚠ 「入力欄が無いから素通しでよい」にしない。
  //   建物カードやパネルに入力欄が増えたときに、また空白で再生が始まる。
  //   ⚠ **年代のつまみ（input[type=range]）を除外に入れない。** つまみを触ったあとに
  //     空白で再生できるのは、いまの操作の中心。文字を打つ入れ物だけを除く。
  const TYPE_IN=["text","search","url","email","tel","password","number"];
  const typing=(el)=>!!el&&(el.isContentEditable||el.tagName==="TEXTAREA"
    ||(el.tagName==="INPUT"&&TYPE_IN.includes(el.type)));
  if(e.code==="Space"&&!typing(document.activeElement)){e.preventDefault();playBtn.onclick()}});
