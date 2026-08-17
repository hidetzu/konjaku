// 建物取り込み時に、重心位置の明治期低湿地区分を付与するための読み取り。
// peel3d.js の実行時判定と同じ凡例・許容差を使う。
import zlib from "node:zlib";

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
const Z = 16;
// ⚠ 14 区分と 1 画素の分類は **public/swale.js の1か所**。ここに書き写さない。
//   ブラウザ用のファイルだが、globalThis に生やす作法なので Node からも読める（esc.js と同じ）。
await import("../public/swale.js");
export const SWALE = globalThis.KonjakuSwale.SWALE;
const classify = globalThis.KonjakuSwale.classify;
const cache = new Map();
const tileOf = (lon,lat) => {
  const n=2**Z, r=lat*Math.PI/180;
  return {x:Math.floor((lon+180)/360*n),y:Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n)};
};
function decodePNG(buf){
  let p=8,w=0,h=0,ct=0; const idat=[];
  while(p<buf.length){const len=buf.readUInt32BE(p),type=buf.toString("ascii",p+4,p+8),d=buf.subarray(p+8,p+8+len);
    if(type==="IHDR"){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9]}
    if(type==="IDAT")idat.push(d);p+=12+len;}
  if(ct!==6) throw new Error(`colortype ${ct} は未対応`);
  const raw=zlib.inflateSync(Buffer.concat(idat)),bpp=4,stride=w*bpp,out=Buffer.alloc(h*stride);
  for(let y=0;y<h;y++){const f=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
    for(let i=0;i<stride;i++){const a=i>=bpp?out[y*stride+i-bpp]:0,b=y?out[(y-1)*stride+i]:0,c=i>=bpp&&y?out[(y-1)*stride+i-bpp]:0;let v=line[i];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c}out[y*stride+i]=v&255;}}
  return {w,h,data:out};
}
async function tile(x,y){const k=`${x}/${y}`;if(cache.has(k))return cache.get(k);const p=fetch(`${GSI}/swale/${Z}/${x}/${y}.png`,{signal:AbortSignal.timeout(15000)}).then(async r=>{
  // 404だけが「このタイルにデータが無い」。403/5xxは一時的な取得失敗として
  // 取り込みを止め、誤って「整備対象外」を恒久配信しない。
  if(r.status===404)return {state:"データなし"};
  if(!r.ok)return {state:"読み込めず"};
  return {state:"ok",...decodePNG(Buffer.from(await r.arrayBuffer()))};
}).catch(()=>({state:"読み込めず"}));cache.set(k,p);return p;}
export async function sampleSwale(lon,lat){
  const {x,y}=tileOf(lon,lat),t=await tile(x,y); if(t.state!=="ok")return {state:t.state};
  const xf=((lon+180)/360*2**Z)-x,yf=((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*2**Z)-y;
  const i=(Math.floor(yf*256)*256+Math.floor(xf*256))*4,[r,g,b,a]=[t.data[i],t.data[i+1],t.data[i+2],t.data[i+3]];
  if(a===0)return {state:"該当なし"}; const c=classify(r,g,b); return c?{state:c.name,water:!!c.water}:{state:"特定できず"};
}
