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
const ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

// 外部から来た文字列（OSM のタグ・地理院の地名）は、HTML を組み立てるところで必ず通す。
// ⚠ 読み上げ（pickSpeech）には通さない。あちらは HTML ではない（理由は esc.js）
const {esc} = KonjakuEsc;

const ERAS = [
  { id:"seamlessphoto", label:"現在",    sub:"空中写真", ext:"jpg", min:2,  max:18 },
  { id:"gazo4",         label:"1987–90", sub:"空中写真", ext:"jpg", min:10, max:17 },
  { id:"gazo3",         label:"1984–86", sub:"空中写真", ext:"jpg", min:10, max:17 },
  { id:"gazo2",         label:"1979–83", sub:"空中写真", ext:"jpg", min:10, max:17 },
  { id:"gazo1",         label:"1974–78", sub:"空中写真", ext:"jpg", min:10, max:17 },
  { id:"ort_old10",     label:"1961–69", sub:"空中写真", ext:"png", min:10, max:17 },
  { id:"ort_USA10",     label:"1945–50", sub:"米軍撮影", ext:"png", min:10, max:17 },
  { id:"ort_riku10",    label:"1936–42", sub:"陸軍撮影", ext:"png", min:13, max:18 },
];
const LAST = ERAS.length;
const MEIJI = { label:"明治期", sub:"低湿地データ ─ 写真は存在しない" };

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
// t は slider の位置（0〜LAST）。読んでよい年代の番号を返す。
// ⚠ 不透明度が 0 より大きい年代（k===i と k===i+1）は必ず含めること。
//   外すと、送っている途中で画面が抜ける。scripts/check.mjs が全位置で確かめている。
function visibleEras(t){
  if(preloadAll) return new Set(ERAS.map((_,k)=>k));
  const i=Math.min(Math.floor(t),LAST-1);
  const s=new Set();
  // ⚠ i と i+1 は、送っている途中に両方が描かれる（k===i が 1-f、k===i+1 が f）。
  //   LOOKAHEAD=1 は「いま描いている i の、1段先まで」＝ {i, i+1}。
  //   i+1 の区間に入った瞬間に i+2 を読み始めるので、次の1段は必ず先に載っている。
  for(let k=i;k<=i+LOOKAHEAD;k++) if(k>=0&&k<LAST) s.add(k);
  return s;
}
// 明治期の重ねも同じ。最後の1区間でしか見えないのに 60 枚引いていた。
// ⚠ 判定に使う画素読み（実測16枚）はこれとは別の経路なので、止まらない
const swaleVisible = (t) => preloadAll || t >= LAST-1-LOOKAHEAD;

const SWALE = [
  {rgb:[254,227,200],name:"砂礫地"},{rgb:[254,200,200],name:"泥地"},
  {rgb:[228,172,123],name:"泥炭地"},{rgb:[200,200,228],name:"湿地"},
  {rgb:[209,234,255],name:"干潟・砂浜",water:true},
  {rgb:[147,200,254],name:"河川・湖沼・海面",water:true},
  {rgb:[251,247,176],name:"田"},{rgb:[225,227,118],name:"深田"},
  {rgb:[227,227,200],name:"塩田"},{rgb:[162,222,162],name:"草地"},
  {rgb:[173,200,147],name:"荒地"},{rgb:[119,227,201],name:"ヨシ"},
  {rgb:[173,255,173],name:"茅"},{rgb:[144,73,11],name:"堤防"},
];
const Z = 16;
const lon2xf=(l)=>((l+180)/360)*2**Z;
const lat2yf=(l)=>{const r=l*Math.PI/180;return ((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2)*2**Z};
const xf2lon=(x)=>x/2**Z*360-180;
const yf2lat=(y)=>{const n=Math.PI-2*Math.PI*y/2**Z;return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)))};

const raster=(l)=>({type:"raster",tiles:[`${GSI}/${l.id}/{z}/{x}/{y}.${l.ext}`],
  tileSize:256,minzoom:l.min,maxzoom:l.max,attribution:ATTR});

const map = new maplibregl.Map({ container:"map", attributionControl:false, maxPitch:80,
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
function classify(r,g,b){
  let best=null,bd=Infinity;
  for(const c of SWALE){const q=(c.rgb[0]-r)**2+(c.rgb[1]-g)**2+(c.rgb[2]-b)**2;if(q<bd){bd=q;best=c}}
  return Math.sqrt(bd)<=60?best:null;
}
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
let blAt=null, blTrunc=false, blIdxP=null;
function blIndex(){
  if(!blIdxP) blIdxP=fetch("./data/bl/index.json",{cache:"no-cache"})
    .then(r=>r.ok?r.json():null).catch(()=>null);
  return blIdxP;
}
const z14of=(lon,lat)=>{ const n=2**14, r=lat*Math.PI/180;
  return { x:Math.floor((lon+180)/360*n),
           y:Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n) }; };
async function loadBuildingTiles(bbox){
  const idx=await blIndex();
  if(!idx?.tiles) return null;
  const a=z14of(bbox.w,bbox.n), b=z14of(bbox.e,bbox.s);
  const need=[];
  for(let x=a.x;x<=b.x;x++) for(let y=a.y;y<=b.y;y++) need.push(`${x}/${y}`);
  // 1枚でも見ていなければ、静的では答えない
  for(const k of need) if(!idx.tiles[k]) return null;
  const got=await Promise.all(need.map(k=>
    fetch(`./data/bl/14/${k}.json`).then(r=>r.ok?r.json():null).catch(()=>null)));
  if(got.some(g=>!g)) return null;
  const features=[]; let at=null, truncated=false;
  for(const g of got){
    // ⚠ 詰めた形（v2）でないものは使わない。GeoJSON のまま配っていた古いファイルが
    //   残っていたら、静かに混ぜるより Overpass の道に落ちたほうがよい
    if(g.v!==BL_V) return null;
    features.push(...unpackBuildings(g));
    if(!at||(g.at&&g.at<at)) at=g.at;      // いちばん古い区画に合わせる
    if(g.truncated) truncated=true;
  }
  return { features, at, truncated };
}
// 詰めた建物を戻す。⚠ 詰める側は scripts/bl-format.mjs。**必ず対で直す**。
//   片方だけ直すと、建物の形が静かにずれる（画面は何も言わない）。
//   scripts/check.mjs が、この関数と bl-format.mjs の unpack を同じ入力で
//   突き合わせている。
const BL_V=2, BL_HSRC=["measured","levels","default"];   // ⚠ 順番を変えない
function unpackBuildings(d){
  const [oLon,oLat]=d.o, q=d.q, out=[];
  for(const r of d.b){
    const ring=[]; let x=0,y=0;
    for(let i=4;i<r.length;i+=2){
      x = i===4 ? r[i]   : x+r[i];
      y = i===4 ? r[i+1] : y+r[i+1];
      ring.push([(oLon+x)/q,(oLat+y)/q]);
    }
    ring.push(ring[0]);                    // 詰めるとき最後の点を落としてある
    out.push({type:"Feature",
      properties:{height:r[0]/10, heightSource:BL_HSRC[r[1]], kind:d.k[r[2]],
        startDate:r[3]?String(r[3]):null},
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
  let waterPx=0;
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
      if(d[i+3]===0) continue;
      const c=classify(d[i],d[i+1],d[i+2]);
      if(c?.water){ mask[(oy+y)*TW+(ox+x)]=1; waterPx++; }
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
           ratio: TW*TH ? waterPx/(TW*TH) : 0, tiles, rects:feats.length };
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
        return JSON.parse(t).elements;
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
        startDate:t["start_date"]??null}});
        // ⚠ name は持たない。カードにもラベルにも出しておらず、配る側（bl-format.mjs）でも
        //   落としてある。片方だけ持つと、あとで name を読んだときに
        //   「静的の土地だけ名前が無い」という気づきにくい差になる
  }
  return {type:"FeatureCollection",features:feats};
}

const centroid=(ring)=>{let x=0,y=0;const n=ring.length-1;
  for(let i=0;i<n;i++){x+=ring[i][0];y+=ring[i][1]}return [x/n,y/n]};
function tFromYear(y){
  const E=[2026,1990,1986,1983,1978,1969,1950,1942,1868];
  for(let i=0;i<E.length-1;i++) if(y<=E[i]&&y>E[i+1]) return i+(E[i]-y)/(E[i]-E[i+1]);
  return y>E[0]?0:LAST;
}

// ============================================================
// レイヤの初期化（1度だけ）
// ============================================================
let ready=false;
map.on("load",()=>{
  // ⚠ 見ない年代は visibility:"none" で足す。paint だけ 0 にしても読みに行く
  const vis0=visibleEras(0);
  for(let k=0;k<ERAS.length;k++){
    const e=ERAS[k];
    map.addSource(e.id,raster(e));
    map.addLayer({id:`g-${e.id}`,type:"raster",source:e.id,
      layout:{visibility:vis0.has(k)?"visible":"none"},
      paint:{"raster-opacity":k===0?1:0,"raster-opacity-transition":{duration:0}}});
  }
  map.addSource("swale",raster({id:"swale",ext:"png",min:10,max:16}));
  map.addLayer({id:"g-swale",type:"raster",source:"swale",
    layout:{visibility:swaleVisible(0)?"visible":"none"},
    paint:{"raster-opacity":0,"raster-opacity-transition":{duration:0},
           "raster-saturation":.25,"raster-brightness-max":.92}});

  map.addSource("water",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"water",type:"fill-extrusion",source:"water",
    paint:{"fill-extrusion-color":"#2f7fc4","fill-extrusion-height":0,
           "fill-extrusion-base":0,"fill-extrusion-opacity":0}});

  map.addSource("bld",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"bld",type:"fill-extrusion",source:"bld",
    paint:{"fill-extrusion-color":["case",["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"],
           "fill-extrusion-height":["get","height"],"fill-extrusion-base":0,
           "fill-extrusion-opacity":.94,"fill-extrusion-vertical-gradient":true}});

  ready=true;
  render();
  // URL から復元。共有できることがループの前提（掟: 唯一の指標は共有率 差分1）
  const sp=new URLSearchParams(location.search);
  const ll=sp.get("ll"), q=sp.get("q");
  if(ll && /^-?[\d.]+,-?[\d.]+$/.test(ll)){
    const [la,lo]=ll.split(",").map(Number);
    qEl.value=q??""; loadArea(lo,la,q||`${la.toFixed(4)}, ${lo.toFixed(4)}`);
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
// ⚠ 種別（kind）と建設年（startDate）は OSM のタグそのもの。誰でも編集できる第三者データで、
//   こちらが中身を保証できない。描くときに esc を通す（理由は esc.js）。
//   rgba はこちらが画素から読んだ数値、meiji は自前の凡例表（verify.js）から来る。
function pickCard(p){
  const w=Number(p.wasWater)===1;
  // 読めていない建物では rgba の行を出さない（読んでいない根拠は出さない）
  const read=p.rgba?`低湿地データ rgba=${esc(p.rgba)}`:"低湿地データは読み込めていません";
  const src=p.heightSource, made=p.startDate;
  return `<div class="card">
    <div class="v ${w?"w":""}">${w?"足元は、明治期には水でした":`明治期の区分: ${esc(p.meiji)}`}</div>
    <div class="meta">高さ ${esc(p.height)}m ─ ${
      src==="default"?`種別「${esc(p.kind)}」の既定値。OSM に高さの記載なし`
      :src==="levels"?"OSM の階数 × 3.2m（1階を3.2mとみなした換算）"
      :"OSM の height タグ"}<br>
    ${made?`建設年 <b>${esc(made)}</b>`:"建設年は不明"}<br>
    ${read}</div></div>`;
}
// 読み上げ。⚠ 画面に出ている文だけを読む。作文を混ぜない（トップの 🔊 と同じ掟）
function pickSpeech(p){
  const w=Number(p.wasWater)===1;
  const h=p.heightSource==="default"?"種別ごとの既定値です"
    :p.heightSource==="levels"?"階数からの換算です":"OSM の記載です";
  return (w?"足元は、明治期には水でした。":`明治期の区分は、${p.meiji}です。`)
    + `高さは ${p.height} メートル。${h}。`
    + (p.startDate?`建設年は ${p.startDate} 年です。`:"建設年は分かっていません。");
}
map.on("click","bld",(e)=>{
  // ⚠ 見えていない建物は押せない。明治期では全建物の高さが 0 になるが、
  //   当たり判定は残るので、海面に見えるところを押すと建物の情報が出ていた
  if(Number(slider.value)/100 >= LAST-0.02) return;
  const p=e.features[0].properties;
  // 一度でも押したら、案内は役目を終える
  if(!picked){ picked=true; const t=document.getElementById("tip"); if(t) t.textContent=""; }
  document.getElementById("pick").innerHTML=pickCard(p);
  if(pickPop) pickPop.remove();
  pickPop=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:"280px",
      className:"pick-pop",offset:12})
    .setLngLat(e.lngLat)
    .setHTML(pickCard(p)+(("speechSynthesis" in window)
      ? `<button class="pick-say" id="pickSay">🔊 読み上げる</button>`:""))
    .addTo(map);
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
const HALF_LON=0.0090, HALF_LAT=0.0070;

// 再試行ボタン。取れなかったときは必ず復帰手段を添える（掟: 取れなかったを「無い」と言わない）
// ⚠ 地名は共有された URL の q か、地理院の応答から来る。属性の中も HTML なので esc を通す
const retryBtn=(lon,lat,title)=>
  `<button class="retry-btn" data-ll="${lon},${lat}" data-title="${esc(title)}">再試行</button>`;
function wireRetry(lon,lat,title){
  statusEl.querySelectorAll(".retry-btn").forEach((b)=>{ b.onclick=()=>loadArea(lon,lat,title); });
}

async function loadArea(lon,lat,title){
  stop();
  // 場所をURLに載せる。これが無いと共有できずループが閉じない（掟: 唯一の指標は共有率 差分1）
  history.replaceState(null,"",`?q=${encodeURIComponent(title)}&ll=${lat.toFixed(5)},${lon.toFixed(5)}`);
  // ⚠ 戻り先にも、調べていた場所を載せる。以前は href="./" のままで、
  //   ← を押すと**空のトップに戻り、調べていた場所が消えていた**
  //   （利用者役のエージェントによる検証で3体すべてが「最初からになった」と言った）。
  //   ⚠ el.href は絶対URLを返すので、読んで書き戻すと ./ が絶対URLに化ける。
  //     setAttribute で書くこと（過去に一度踏んでいる）。
  // ⚠ 戻る導線は「← もどる」1つだけ。以前はパネルの中にもロゴ（←今昔）があり、
  //   同じことを2か所で言っていた。探す先を残しておくと、消えたことに気づけない。
  const back=document.getElementById("back");
  if(back) back.setAttribute("href",           // ⚠ el.href は絶対URLを返すので setAttribute
    `./?q=${encodeURIComponent(title)}&ll=${lat.toFixed(5)},${lon.toFixed(5)}`);
  // ⚠ 場所を選び直したら、探す枠は畳み直す。開けっぱなしだと、
  //   選んだ結果（判定の数字）が 214px 下へ押し出される。
  const findBox=document.getElementById("findBox");
  if(findBox) findBox.open=false;
  // 事前計算データがある範囲では、その bbox をそのまま集計範囲にする。
  // 表示の中心は要求された地点のままにするが、集計範囲を勝手にずらすと
  // 「この範囲の N 件すべてを判定した」が言えなくなる。
  const pre=findArea(await loadAreas(),lon,lat);
  const bbox=pre?pre.bbox:{w:lon-HALF_LON,e:lon+HALF_LON,s:lat-HALF_LAT,n:lat+HALF_LAT};
  map.jumpTo({center:[lon,lat],zoom:15.05,pitch:56,bearing:-20});
  // パネルを畳むと、どこを調べているのか分からなくなる。地図上に印を残す。
  if(marker) marker.remove();
  marker=new maplibregl.Marker({color:"#6fc3ff"}).setLngLat([lon,lat]).addTo(map);
  // ⚠ 場所を変えたら先読みも戻す。1つ前の場所で ▶ を押した人が、
  //   次に調べる場所でも8年代ぶんを引いてしまう（払った覚えのない支払い）
  preloadAll=false;
  slider.value="0"; render();
  // 建物の集計とは独立に取る。集計が出せない土地でも、この土地そのものには答えられる
  loadLandform(lon,lat);
  resultEl.style.display="none";
  statusEl.innerHTML=`<span class="go">明治期の低湿地データを読んでいます…</span>`;

  // --- 1. 水域 ---
  // 事前計算があればそれを使う（ブラウザ側の生成は数秒かかる）。
  // 無い／読めないときだけ、その場でタイルから起こす。
  let w=null;
  if(pre?.water){
    const gj=await loadJSON(pre.water);
    if(gj) w={ geojson:gj, ratio:gj.metadata?.waterRatio??0, rects:gj.features.length,
               tiles:{ok:1,absent:0,unreachable:0}, pre:true };
  }
  if(!w) w=await buildWater(bbox);
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
      w.pre?"（事前計算データ）":""}を判定しました。</span>`;
  }
  // 建物を待たずに、いま言えることだけで一度出す。
  // 判定できない土地では「判定できません」がここで出る。以前はここで初期値の
  // 「–%」が残り、Overpass が返った瞬間に「0.0% ── 実測値」へ化けていた（掟: 取れなかったを「無い」と言わない）。
  area={ title, areaTitle:pre?.title??null, source:w.pre?"pre":"tiles", pending:true,
    total:0, wet:0, classified:0, unread:0, counts:{}, dated:0,
    waterRatio:w.ratio, waterRead, waterUnread };
  showResult(); render();

  // --- 2. 建物 ---
  // 事前計算データがある範囲では Overpass を叩かない。
  // 本番で 504／無応答が常態のものを、作品の成立条件に置かない（掟: 取れなかったを「無い」と言わない）。
  let feats=null, viaPre=false;
  // ⚠ まずタイル索引を見る。取り込んであれば Overpass に出ない。
  //   索引に無いタイルが1枚でもあれば静的では答えない（欠けたまま「これで全部」と言わない）。
  //   索引の単位は z14 で、ev（年つきの事物）とは**別の索引**。潰すと
  //   「建物が見たタイル」が「事物も見た」ことになる。
  const bl=await loadBuildingTiles(bbox);
  if(bl){
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
    viaPre=true; blAt=bl.at; blTrunc=bl.truncated;
    if(!feats.length) feats=null;          // この範囲に1件も無いなら、無いものとして扱う
  }
  if(!feats && pre?.buildings){
    const gj=await loadJSON(pre.buildings);
    if(gj?.features?.length){ feats=gj.features; viaPre=true; }
  }
  if(!feats){
    statusEl.innerHTML+=`<div style="margin-top:5px">建物を取得中…</div>`;
    const els=await fetchBuildings(bbox,(m)=>{
      // ⚠ 何を待っていて、**駄目だったらどうなるか**を先に言う。
      //   黙って待たせると、止まっているのか動いているのか分からない
      statusEl.querySelector("div").textContent=
        m+"（最大20秒。取れなければ水域と写真だけで表示します）";
    });
    if(els) feats=toGeoJSON(els).features;
  }

  if(!feats){
    map.getSource("bld").setData({type:"FeatureCollection",features:[]});
    area={ title, total:0, wet:0, classified:0, unread:0, counts:{}, dated:0,
      waterRatio:w.ratio, waterRead, waterUnread, source:"none" };
    statusEl.innerHTML=`<span class="err">建物データを取得できませんでした（Overpass 混雑）。</span>
      <span style="color:var(--ink-dim)">水域と空中写真だけで表示しています。</span> ${retryBtn(lon,lat,title)}`;
    wireRetry(lon,lat,title);
    showResult(); return;
  }

  const gj={type:"FeatureCollection",features:feats};
  await Promise.all(feats.map(async(f)=>{
    const [clon,clat]=centroid(f.geometry.coordinates[0]);
    const s=await sampleSwale(clon,clat);
    f.properties.wasWater=s.water?1:0;
    // 「読めなかった」を「データなし」と同じ箱に入れない。ここが 0.0% の元だった
    f.properties.meiji=s.state===UNREACHABLE?"読み込めず"
      :s.state===ABSENT?"データなし"
      :s.none?"該当なし":s.unknown?"特定できず":s.cls.name;
    f.properties.rgba=s.rgba?s.rgba.join(","):"";
    const sd=f.properties.startDate?parseInt(String(f.properties.startDate).slice(0,4),10):NaN;
    if(Number.isFinite(sd)){f.properties.vanish=tFromYear(sd);f.properties.exact=1}
    else{f.properties.vanish=s.water?6.0:7.4;f.properties.exact=0}
  }));
  map.getSource("bld").setData(gj);

  const counts={};
  for(const f of feats) counts[f.properties.meiji]=(counts[f.properties.meiji]||0)+1;
  // 足元を実際に判定できた件数。ここが 0 なら % は出さない（掟: 取れなかったを「無い」と言わない 札幌の 0.0%）
  const classified=feats.length-(counts["データなし"]??0)-(counts["読み込めず"]??0);
  area={ title, areaTitle:viaPre?(pre?.title??null):null, source:viaPre?"pre":"overpass",
    blAt, blTrunc,
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
    waterRatio:w.ratio, waterRead, waterUnread };

  // 水域が読めていないのに「水域 0 面を判定しました」とは書かない
  statusEl.innerHTML=`<span style="color:var(--ink-dim)">${waterRead?`水域 ${w.rects} 面 ／ `:""}建物 ${
    area.total} 件を判定しました${viaPre?"（事前に取り込んだデータ）":""}。</span>${
      blAt?`<span style="color:var(--ink-dim)"> 建物を取り込んだのは ${blAt}。</span>`:""}${
      blTrunc?`<span class="err"> この範囲は建物が多く、取りきれていない可能性があります。</span>`:""}`;
  if(!waterRead) statusEl.innerHTML = (waterUnread
    ? `<span class="err">明治期の低湿地データを<b>いま読み込めませんでした</b>。</span> `
    : `<span class="err">このエリアには<b>明治期の低湿地データがありません</b>。</span> `) + statusEl.innerHTML;
  if(area.unread) statusEl.innerHTML+=`<div class="err" style="margin-top:5px">
    ${area.unread} 件は明治期のデータを読み込めませんでした。 ${retryBtn(lon,lat,title)}</div>`;
  wireRetry(lon,lat,title);
  showResult(); render();
}

// ---- この土地の成り立ち（掟: 主題は「成り立ち」。明治期は手法のひとつ）----
// peel の売りは「建物1件ずつの足元を明治期の低湿地データで判定する」集計で、これは
// 整備範囲の外では出せない。そこで黙ると、札幌のように建物が出ているのに
// 「判定できません」で終わる。地形分類はその土地そのものには必ず答えられるので、
// 集計が出せないときの受け皿として持つ。集計の代わりに使うのではない。
let landform=null;
async function loadLandform(lon,lat){
  landform=null;
  try{ landform=await Konjaku.landform(lon,lat); }catch{ landform=null; }
  showResult();
}
// 見出しに使う1行。粗い区分しか無いときは、そう書く
function landformLine(){
  const l=landform;
  if(!l) return "";
  if(l.state==="unreachable") return `<span style="opacity:.7">地形分類も、いま読み込めませんでした</span>`;
  if(!l.ok) return "";
  const art=l.artificial?`／いまは <b>${l.artificial}</b>`:"";
  return `この土地は <b>${l.value}</b>${art}${l.fine?"":"（広い区分）"}`;
}

function showResult(){
  if(!area) return;
  resultEl.style.display="";
  // 集計範囲が事前計算の範囲のときは、それを明示する（中心とズレうるため）
  document.getElementById("placeName").textContent =
    area.areaTitle && area.areaTitle!==area.title
      ? `${area.title}（集計範囲: ${area.areaTitle}）` : area.title;
  const heroEl=document.getElementById("heroNum"), capEl=document.getElementById("heroCap");

  // ヒーローの数字は「実際に判定できたもの」からしか作らない。
  // 1408件すべてが「データなし」なのに 0.0% と出し、それを
  // 「1件ずつ判定した実測値」と書いていたのが札幌だった（掟: 取れなかったを「無い」と言わない）。
  if(area.classified>0){
    heroEl.innerHTML=`${(area.wet/area.classified*100).toFixed(1)}<small>%</small>`;
    capEl.innerHTML = area.classified===area.total
      ? `の建物が、明治期には<b>水の上</b>だった<br>
         <span style="opacity:.7">${area.total}件すべての足元を1件ずつ判定した実測値</span>`
      : `の建物が、明治期には<b>水の上</b>だった<br>
         <span style="opacity:.7">足元を判定できた ${area.classified} / ${area.total} 件のうちの実測値
         （残りは明治期のデータが${area.unread?"読み込めていない":"無い"}）</span>`;
  } else if(area.total>0){
    // 建物ごとの割合は出せない。だが土地そのものには地形分類が答えられる。
    // 出せないものと、出せるものを、混ぜずに並べる
    const lf=landformLine();
    heroEl.innerHTML=`<span class="hero-alt">${lf?"建物ごとには出せません":"判定できません"}</span>`;
    capEl.innerHTML = (lf?`${lf}<br>`:"") + (area.unread
      ? `明治期の低湿地データを<b>読み込めませんでした</b><br>
         <span style="opacity:.7">建物 ${area.total} 件は出ていますが、足元は1件も判定できていません</span>`
      : `この範囲は明治期の低湿地データの<b>整備対象外</b>です<br>
         <span style="opacity:.7">建物 ${area.total} 件は出ていますが、建物ごとに明治期の何だったかは分かりません</span>`);
  } else if(area.waterRead && area.waterRatio>0){
    heroEl.innerHTML=`${(area.waterRatio*100).toFixed(1)}<small>%</small>`;
    // 「取れなかった」と「まだ取っていない」を書き分ける
    capEl.innerHTML=`この範囲の<b>面積</b>が、明治期には水だった<br>
       <span style="opacity:.7">${area.pending
         ? "建物を取得中。揃うと建物ごとの割合に切り替わる"
         : "建物が取れなかったため、面積比で表示している"}</span>`;
  } else if(area.waterRead){
    heroEl.innerHTML=`<span class="hero-alt">水域なし</span>`;
    capEl.innerHTML=`この範囲は、明治期の低湿地データで<b>水域に該当しません</b>`;
  } else {
    const lf=landformLine();
    heroEl.innerHTML=`<span class="hero-alt">${lf?"建物ごとには出せません":"判定できません"}</span>`;
    capEl.innerHTML = (lf?`${lf}<br>`:"") + (area.waterUnread
      ? `明治期の低湿地データを<b>読み込めませんでした</b><br>
         <span style="opacity:.7">通信を確認して、もう一度お試しください</span>`
      : `この範囲は明治期の低湿地データの<b>整備対象外</b>です`);
  }

  document.getElementById("breakdown").innerHTML = area.total
    ? Object.entries(area.counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
        const isW=SWALE.find(c=>c.name===k)?.water;
        return `<div class="stat"><span><i class="swatch" style="background:${isW?"#8fb9dd":"#d8cfa8"}"></i>${k}</span>
          <b>${v}<span style="color:var(--ink-dim);font-weight:400"> / ${area.total}</span></b></div>`;
      }).join("")
    // ⚠ ここは足元の判定の**分割**（足すと総数になる）。
    //   「建設年が分かる 8 / 533」「高さが実測 42 / 533」は分割ではなく**素性**なので、
    //   同じ表に混ぜていた。素性は #est（常時見える）と #prov（台帳）が持つ。
    //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった。
    // 取得できていない段階と、取得に失敗した状態を書き分ける
    : `<div class="hint">${area.source==="none"
        ? "建物データを取得できませんでした（上の再試行から取り直せます）"
        : "建物を取得中…"}</div>`;
}

// ============================================================
// 住所検索
// ============================================================
const qEl=document.getElementById("q"), candsEl=document.getElementById("cands");
let timer=null;

// ⚠ トップ（index.html）と同じ作法にする。以前はここだけ別実装で、
//   時間切れも再試行も、古い応答の追い越し防止も無く、
//   **取れなかったときに「見つかりませんでした」と書いていた**。
//   この製品がいちばんやってはいけない形が、片方のページにだけ残っていた。
// ⚠ 通信・時間切れ・再試行・古い応答の追い越し防止は **places.js の1か所**にある
//   （掟: 同じ問いに答える実装を2つ持たない）。ここに残すのは**描くことだけ**。
//   以前はここだけ別実装で、時間切れも再試行も追い越し防止も無く、
//   **取れなかったときに「見つかりませんでした」と書いていた**。
//   この製品がいちばんやってはいけない形が、片方のページにだけ残っていた。
const search$=KonjakuPlaces.createSearch();
async function search(q){
  candsEl.innerHTML=`<div class="hint" style="padding:4px 2px">検索中…</div>`;
  const r=await search$.run(q,10);
  if(r.state==="stale") return;                // 遅れて返った古い応答。画面に触らない
  if(r.state==="error"){
    candsEl.innerHTML=`<div class="hint" style="padding:4px 2px;color:var(--missing)">
      検索の応答を取れませんでした（${r.why}）。<b>「見つからなかった」ではありません。</b>
      <button class="retry-btn" id="reSearch">再試行</button></div>`;
    document.getElementById("reSearch").onclick=()=>search(q);
    return;
  }
  if(r.state==="empty"){
    candsEl.innerHTML=`<div class="hint" style="padding:4px 2px">見つかりませんでした</div>`;
    return;
  }
  // ⚠ 地名も副題も地理院の応答そのもの。data-title は下で dataset.title として
  //   読み戻すが、ブラウザが実体参照を元の文字に戻すので、渡る値は生のままになる。
  //   （以前は " だけを &quot; にしていた。< は素通りしていた）
  candsEl.innerHTML=r.rows.map((x,i)=>
    `<button data-lon="${esc(x.ll[0])}" data-lat="${esc(x.ll[1])}"
       data-title="${esc(x.title)}"${i===r.pick?' class="on"':''}>
      ${esc(x.title)}<small>${esc(x.sub)}</small></button>`).join("");
  candsEl.querySelectorAll("button").forEach((b)=>{
    b.onclick=()=>{ candsEl.innerHTML=""; qEl.value=b.dataset.title;
      loadArea(+b.dataset.lon,+b.dataset.lat,b.dataset.title); };
  });
}
qEl.addEventListener("input",()=>{
  clearTimeout(timer);
  const v=qEl.value.trim();
  // ⚠ **世代を進める。** これが無いと、検索中に入力を消しても遅れて返った候補が
  //   空の入力欄へ復活する（2026-08-15 に実際に再現させた）。
  if(v.length<2){ search$.cancel(); candsEl.innerHTML=""; return; }
  timer=setTimeout(()=>search(v),350);
});

// 低湿地データが整備されていて、対比が面白い場所

// ============ 現在地 ============
// 一度拒否すると、ブラウザは二度と許可を尋ねない。
// 数秒でラベルを戻すだけだと、押しても何も起きないボタンが残って利用者が詰む。
// 復帰のしかたと、代わりの手段（地名検索）を必ず示す。
function hereDenied(btn,msg){
  btn.disabled=true; btn.textContent="現在地は使えません";
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent);
  msg.innerHTML='<b>位置情報が拒否されています。</b>設定から許可し直す必要があります。<br>'
    + (ios ? 'Safari：アドレスバー左の <b>ぁあ</b> → <b>Webサイトの設定</b> → 位置情報 を「許可」に。'
           : 'アドレスバーの鍵アイコン → サイトの設定 → 位置情報 を「許可」に。')
    + '<br><span class="dim">許可しなくても、<b>地名を入力すれば同じことが調べられます。</b></span>';
  msg.style.display="";
}
function hereFailed(btn,msg,label,text){
  btn.disabled=false; btn.textContent=label;
  msg.innerHTML=text+'<br><span class="dim">地名を入力すれば同じことが調べられます。</span>';
  msg.style.display="";
}
function setupHere(btn,msg,label,onOk){
  if(!navigator.geolocation){ btn.disabled=true; btn.textContent="この端末では使えません"; return; }
  navigator.permissions?.query({name:"geolocation"})
    .then((st)=>{ if(st.state==="denied") hereDenied(btn,msg);
      st.onchange=()=>{ if(st.state!=="denied"){ btn.disabled=false; btn.textContent=label;
        msg.style.display="none"; } }; }).catch(()=>{});
  btn.onclick=()=>{
    btn.disabled=true; btn.textContent="現在地を取得中…"; msg.style.display="none";
    navigator.geolocation.getCurrentPosition(
      (pos)=>{ btn.disabled=false; btn.textContent=label; onOk(pos.coords.longitude,pos.coords.latitude); },
      (err)=>{ if(err.code===1) hereDenied(btn,msg);
        else hereFailed(btn,msg,label,
          err.code===3?"現在地の取得が時間切れになりました。":"現在地を取得できませんでした。"); },
      { enableHighAccuracy:true, timeout:12000, maximumAge:60000 });
  };
}
setupHere(document.getElementById("here"), document.getElementById("hereMsg"),
  "現在地から調べる", (lo,la)=>loadArea(lo,la,"現在地"));

// ⚠ トップ（index.html の QUICK）と同じ土地にする。
//   以前はここだけ旧6件のままで、実測すると **6件中5件が建物の索引に無く、
//   押すと Overpass を最大20秒待つ**状態だった（天王洲は seeds/areas.jsonl にも無い）。
//   3D の入口が、押すと失敗する入口になっていた。
//   scripts/check.mjs が、両方のピンが取り込み済みの土地であることを見ている。
const QUICK=[
  {n:"豊洲",     lon:139.7975, lat:35.6548, t:"東京都江東区豊洲"},
  {n:"渋谷",     lon:139.7016, lat:35.6586, t:"東京都渋谷区"},
  {n:"西新宿",   lon:139.6929, lat:35.6905, t:"東京都新宿区西新宿"},
  {n:"上野",     lon:139.7745, lat:35.7148, t:"東京都台東区上野"},
  {n:"お台場",   lon:139.7760, lat:35.6300, t:"東京都港区台場"},
  {n:"札幌",     lon:141.3540, lat:43.0620, t:"北海道札幌市中央区"},
  {n:"仙台",     lon:140.8720, lat:38.2600, t:"宮城県仙台市青葉区"},
  {n:"大阪 難波", lon:135.5020, lat:34.6660, t:"大阪市中央区難波"},
  {n:"広島",     lon:132.4550, lat:34.3950, t:"広島市中区"},
  {n:"長崎 出島", lon:129.8730, lat:32.7440, t:"長崎市出島町"},
];
const quickEl=document.getElementById("quick");
for(const p of QUICK){
  const b=document.createElement("button"); b.textContent=p.n;
  b.onclick=()=>{ qEl.value=p.t; candsEl.innerHTML=""; loadArea(p.lon,p.lat,p.t); };
  quickEl.appendChild(b);
}

// ============================================================
// 描画・再生
// ============================================================
const slider=document.getElementById("t"), eraEl=document.getElementById("era");
const trackEl=document.getElementById("track"), fillEl=trackEl.querySelector(".fill");
const knobEl=trackEl.querySelector(".knob"), gradeEl=document.getElementById("grade");
const mapEl=document.getElementById("map"), panel=document.getElementById("panel");
const toggle=document.getElementById("toggle");

// ⚠ 端の文字は、目盛りの中心に置くと枠の外へ出る（中心そろえなので左右に半分ずつはみ出す）。
//   9px のうちは偶然収まっていたが、読める大きさにしたら 375px で 3px はみ出した
//   （実測 2026-08-15。横スクロールが出る）。端だけ内側へ寄せる印を付ける。
[...ERAS.map(e=>e.label),MEIJI.label].forEach((lab,k)=>{
  const pc=k/LAST*100;
  const edge=k===0?" at-start":k===LAST?" at-end":"";
  trackEl.insertAdjacentHTML("beforeend",
    `<div class="tick" data-i="${k}" style="left:${pc}%"></div>
     <div class="lab${edge}" style="left:${pc}%">${k%2===0?lab:""}</div>`);
});

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
map.on("data",(e)=>{
  if(e.dataType!=="source"||!e.tile||!e.coord||e.tile.state!=="loaded") return;
  const c=e.coord.canonical, k=`${c.z}/${c.x}/${c.y}`;
  let s=okTiles.get(e.sourceId); if(!s) okTiles.set(e.sourceId,s=new Set());
  if(s.has(k)) return;
  s.add(k);
  // 描き直すのは、地表の行が「未取得」から変わりうるときだけ。
  // タイル1枚ごとに全部描き直すと、再生中の負荷を無駄に増やす。
  if(ground&&!ground.ok&&ground.id===e.sourceId) render();
});
// その地点を覆うタイルが読めているか。どのズーム段で取りに行くかは地図側の都合で
// 変わる（256px タイルは表示ズーム+1段で取る）ので、読めたタイルの側から
// 「中心を含むか」で見る。段を決め打ちしないぶん、再生中のズーム変化にも耐える。
function rasterArrived(id){
  const s=okTiles.get(id);
  if(!s) return false;
  const c=map.getCenter(), xf=lon2xf(c.lng), yf=lat2yf(c.lat);
  for(const k of s){
    const [z,x,y]=k.split("/").map(Number), n=2**(z-Z);
    if(Math.floor(xf*n)===x&&Math.floor(yf*n)===y) return true;
  }
  return false;
}

function render(){
  if(!ready) return;
  const t=Number(slider.value)/100, i=Math.min(Math.floor(t),LAST-1), f=t-i;

  // ⚠ 可視を先に決める。不透明度を上げてから可視にすると、1フレーム抜ける
  const vis=visibleEras(t);
  for(let k=0;k<ERAS.length;k++){
    const want=vis.has(k)?"visible":"none";
    if(map.getLayoutProperty(`g-${ERAS[k].id}`,"visibility")!==want)
      map.setLayoutProperty(`g-${ERAS[k].id}`,"visibility",want);
  }
  const sw=swaleVisible(t)?"visible":"none";
  if(map.getLayoutProperty("g-swale","visibility")!==sw)
    map.setLayoutProperty("g-swale","visibility",sw);

  for(let k=0;k<ERAS.length;k++)
    map.setPaintProperty(`g-${ERAS[k].id}`,"raster-opacity",k===i?1-f:k===i+1?f:0);
  map.setPaintProperty("g-swale","raster-opacity",i===LAST-1?f:0);

  map.setPaintProperty("bld","fill-extrusion-height",
    ["*",["get","height"],["max",0,["min",1,["/",["-",["get","vanish"],t],1.1]]]]);
  // ⚠ 半透明で薄れさせない。実測（利用者役のエージェントによる検証 2026-08-14）:
  //   1945–50 の不透明度 0.80 で**焼け跡の瓦礫が建物ごしに透け**、
  //   広島の利用者は「消えかけの幽霊」「これは広島の人間には見せられない」と言った。
  //   「消えかけている」ように見せるのが最悪で、「はっきり別物として重ねている」ほうがよい。
  //   → 明治期の端で消えるところ以外は、薄れさせない。
  map.setPaintProperty("bld","fill-extrusion-opacity",Math.max(0,.94-Math.max(0,t-7.0)*.94));

  const wr=Math.max(0,Math.min(1,(t-5.4)/(LAST-5.4)));
  map.setPaintProperty("water","fill-extrusion-height",0.4+wr*4.2);
  map.setPaintProperty("water","fill-extrusion-opacity",wr*.78);

  gradeEl.style.opacity=String(wr*.95);
  mapEl.style.filter=`saturate(${1-wr*.42}) contrast(${1+wr*.10}) brightness(${1-wr*.10})`;

  const near=f<.5?ERAS[i]:(ERAS[i+1]??null), cur=near??MEIJI;
  // ⚠ 建物が見えているか。**下の3か所（重ね・案内・但し書き）が同じ判定を使う。**
  //   ⚠ 使う場所より前で定義すること。以前これを下に置いたまま上で参照して
  //     TDZ で例外になり、**そこから下の描画が丸ごと止まった**（画面は何も言わない）。
  const bldVisible = !!(area && area.total) && t < LAST - 0.02;
  eraEl.querySelector(".y").textContent=cur.label;
  // ⚠ 過去の年代に入ったら、年と同じ強さで「重ねている」と言う。
  //   建物は現在のもので、地面だけが過去。そこを画面が言わないと、
  //   利用者は自分の知識でしか判別できない（知識が無ければ判別できない）。
  const overEl=document.getElementById("over");
  if(overEl) overEl.innerHTML = (bldVisible && t > 0.02)
    ? `この街並みは<b>いまのもの</b>です。地面だけが ${cur.label} です。` : "";
  eraEl.querySelector(".s").textContent=cur.sub;
  eraEl.classList.toggle("meiji",!near); trackEl.classList.toggle("meiji",!near);

  const pc=t/LAST*100;
  fillEl.style.width=pc+"%"; knobEl.style.left=pc+"%";
  trackEl.querySelectorAll(".tick").forEach(el=>el.classList.toggle("on",Number(el.dataset.i)<=t+.5));

  // ⚠ 建物についての但し書きを、畳まれない場所に出す。
  //   空になるのは「建物が1件も立っていないとき」だけ。無いものは説明しない。
  //   数字は必ず**主張範囲の分母**で書く（いま画面に立っている件数）。
  // ⚠ 触る前の案内。押したら消す。役目が終わったものを画面に置き続けない
  const tipEl=document.getElementById("tip");
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
  const estEl=document.getElementById("est");
  if(estEl){
    estEl.innerHTML = bldVisible
      ? `<b>建物が消える年代は演出</b>です。建てられた年が分かるのは <b class="k">${
          area.dated} / ${area.total}</b> 件だけ。高さも <b class="k">${
          area.hSrc ? area.hSrc.default+area.hSrc.levels : "?"} / ${area.total}</b> 件が推定です。`
      : "";
  }

  const provEl=document.getElementById("prov");
  if(!provEl) return;
  // 「いま画面に出ているもの」は、出ているものだけを説明する。
  // 水面が出ていないのに「実測の水域」とは書かない。地表も同じで、
  // タイルが届いていないなら「実測」とは言わない（届かなかっただけで、
  // その年代の写真が無いとも言わない）。
  const gid=near?near.id:"swale";
  ground={ id:gid, ok:rasterArrived(gid) };
  const rows=[ ground.ok
    ? `<div class="prov ok"><span class="t">実測</span>地表は${
        near?"<b>その年代の空中写真</b>":"<b>明治期の低湿地データ</b>"}そのもの。加工なし</div>`
    : `<div class="prov no"><span class="t">未取得</span>地表の${
        near?`<b>${near.label}の空中写真</b>`:"<b>明治期の低湿地データ</b>"}が届いていない
      <span class="d">届いていないだけで、この年代の記録の有無は分かっていない</span></div>`];
  if(!area || area.waterRead)
    rows.push(`<div class="prov ok"><span class="t">実測</span>水面の形は低湿地データから起こした<b>実際の水域</b></div>`);
  else
    rows.push(`<div class="prov no"><span class="t">${area.waterUnread?"未取得":"欠落"}</span>${
      area.waterUnread?"明治期の低湿地データを読み込めていない":"この範囲に明治期の低湿地データが無い"}</div>`);
  if(!area || !area.total)
    rows.push(`<div class="prov no"><span class="t">欠落</span>建物データを取得できていない</div>`);
  else {
    // ⚠ 高さは「いま見えている形」そのもの。消える年代の演出より手前の事実なので先に置く。
    //   ここに無いことのほうが嘘になる（この節の存在意義が「出ているものの出所を全部言う」）
    if(area.hSrc)
      rows.push(`<div class="prov est"><span class="t">推定</span>建物の<b>高さ</b>は、ほとんどが
        <b>こちらで決めた既定値</b>。
        <span class="d">OSM に高さが入っているのは ${area.hSrc.measured} / ${area.total} 件。
        階数から換算したものが ${area.hSrc.levels} 件、残る ${area.hSrc.default} 件は
        「この種別ならこの高さ」としてこちらで立てた値
        <button class="peek" id="peekH">高さが実測の ${area.hSrc.measured} 件を光らせる</button></span></div>`);
    // ⚠ ここに「光らせる」を付けるまで、**建設年が分かる建物と、こちらが決めた建物は
    //   画面上でまったく同じに見えていた**（exact は集計にしか使われていなかった）。
    //   豊洲では 8 件と 525 件が同じ顔で、同じように消えていた。
    //   ⚠ 525 件を半透明にする案は採らない。98.5% が半透明になり「半透明が既定の
    //     見え方」になって区別の意味が消える。既定の色は明治期の判定そのものなので触らない。
    //     押しているあいだだけ、**分かっている側**を光らせる（高さと同じ作法）。
    // ⚠ 件数と「演出」はここに書かない。両方 #est（常時見える）にある。
    //   ここは台帳なので行は残すが、同じ数字を持たない。
    //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の **3か所**にあった。
    rows.push(`<div class="prov est"><span class="t">推定</span>建物が<b>消える年代</b>は、
      こちらが立てた概算。
      <span class="d">根拠は「足元が水なら埋立前には無い」だけ`
      + (area.dated ? `<button class="peek" id="peekY">建てられた年が分かる建物を光らせる</button>`
                    : `。<b>この範囲では1件も分かっていない</b>`)
      + `</span></div>`);
  }
  if(area?.unread)
    rows.push(`<div class="prov no"><span class="t">未取得</span>${area.unread} 件は足元の判定ができていない
      <span class="d">読み込めなかっただけで、明治期のデータが無いとは限らない</span></div>`);
  provEl.innerHTML=rows.join("");
  // ⚠ 押している間だけ。既定の色は wasWater（99.6% の色そのもの）なので、
  //   恒久的に上書きすると「99.6% が水色」と言いながら画面は灰色、という食い違いになる。
  //   高さそのものは触らない（推定を打ち消すために新しい推定を作ることになる）。
  // 押しているあいだだけ、分かっている側を光らせる。
  // ⚠ 離したら必ず既定の色（明治期の判定そのもの）に戻す。戻し忘れると、
  //   別の意味の色が居座って「99.6% が水色」と言いながら画面が灰色になる
  const BLD_COLOR=["case",["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"];
  const peek=(id,expr)=>{
    const pk=document.getElementById(id);
    if(!pk) return;
    const on=()=>{ try{ map.setPaintProperty("bld","fill-extrusion-color",expr); }catch{} };
    const off=()=>{ try{ map.setPaintProperty("bld","fill-extrusion-color",BLD_COLOR); }catch{} };
    pk.addEventListener("pointerdown",(e)=>{ e.preventDefault(); on(); });
    for(const ev of ["pointerup","pointerleave","pointercancel","blur"])
      pk.addEventListener(ev,off);
  };
  peek("peekH",["case",["==",["get","heightSource"],"default"],"#5b6470",
                ["==",["get","wasWater"],1],"#8fb9dd","#d8cfa8"]);
  // ⚠ exact（建設年が分かっている印）は、ここまで**描画に一度も使われていなかった**
  peek("peekY",["case",["==",["get","exact"],1],"#e6c47a","#5b6470"]);
}
slider.addEventListener("input",()=>{stop();render()});

const playBtn=document.getElementById("play");
let raf=null; const DUR=11000;
// パネルの開閉を1つの状態で持つ。
// 再生中は一時的に隠し、終わったら「利用者が望んだ状態」に戻す。
// stop() が毎回 setChrome(false) を呼ぶので、状態を持たないと
// スマホの初期折りたたみが打ち消されてしまう。
const isNarrow = matchMedia("(max-width:680px)").matches;
let panelOpen = !isNarrow;              // スマホでは主役（3Dの絵）を隠さない
const applyPanel = () => panel.classList.toggle("hide", !panelOpen);
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
  //   1段あたり約1.4秒（DUR 11秒 ÷ 8段）しかないので、隣1段では間に合わない。
  //   押していない人は 136 枚のまま（実測）。
  preloadAll=true; render();
  playBtn.textContent="❚❚"; playBtn.setAttribute("aria-pressed","true"); setChrome(true);
  const from=Number(slider.value)>=795?0:Number(slider.value);
  const c=map.getCenter(), z0=map.getZoom(), b0=map.getBearing(), p0=map.getPitch();
  const t0=performance.now();
  const step=(now)=>{
    const p=Math.min(1,(now-t0)/(DUR*(1-from/800)));
    const e=p<.82?p/.82*.74:.74+(p-.82)/.18*.26;
    const v=from+(800-from)*e; slider.value=String(v);
    const u=v/800;
    map.jumpTo({center:c,zoom:z0-u*.55,bearing:b0+u*46,pitch:Math.min(78,p0+u*10)});
    render();
    if(p<1) raf=requestAnimationFrame(step); else stop();
  };
  raf=requestAnimationFrame(step);
};
toggle.onclick=openPanel;
addEventListener("keydown",(e)=>{
  if(e.code==="Space"&&document.activeElement!==qEl){e.preventDefault();playBtn.onclick()}});
