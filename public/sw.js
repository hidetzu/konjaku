// Service Worker。
//
// 持つのは2つ。**自前アセット**（下の SHELL）と、**利用者が自分で見た地理院タイル**
// （下の TILES。最大 250 枚）。
//
// ⚠ 当初は「自前アセットだけ。地理院のものは溜め込むべきではない」としていたが、
//   2026-08-13 に考えを変えた。素通しは「溜め込まない」ではなく
//   「**同じ絵を何度も取りに行く**」だったため（理由は下の「地理院タイル」の節に全文）。
//   端末の中に置くだけで、再配信はしない。
//
// したがって **オフラインでも、一度見た範囲の地図なら出ることがある**。
// ただし見ていない範囲は出ない。ホーム画面から素早く開くための最小構成であることは変えていない。

// ⚠ 手で書かない。**下の SHELL の中身から決まるハッシュ**で、`npm run stamp` が振り直す。
//   古ければ `npm run check`（＝CI）が落ちる。
//
//   手で番号を振っていた頃は、中身だけ変えて上げ忘れると
//   一度来た人に古い `/` と `/share.js` が出続けた。しかもローカルは初回訪問なので
//   絶対に再現せず、CI も全部通る。流入を測り始める直前に一度踏みかけた。
//   なぜハッシュにしたかの全文は scripts/sw-hash.mjs の頭にある。
const VERSION = "konjaku-4ede3b42";
// ⚠ addAll は1件でも 404 すると install ごと reject し、キャッシュが丸ごと死ぬ。
//   この一覧を足し引きしたときも版は変わる（一覧そのものもハッシュの材料に入れてある）。
const SHELL = [
  "/", "/peel",
  // ⚠ esc.js が来ないと、両ページのスクリプトが起動時に落ちる（KonjakuEsc を読む）。
  //   オフラインでも画面が成り立つための最小限に入る。
  // ⚠ words.js も同じ性質。**来ないと両ページの語が undefined になる**
  //   （取得の結末と一覧行のタグを、2 画面で 1 か所から出している）。
  // ⚠ land.js も同じ性質。**来ないと両ページが土地情報を頼む先を失う**
  //   （2 画面が取得の層を直接呼ばず、ここだけを見る作りにしてある）。
  "/esc.js", "/photos.js", "/words.js", "/verify.js", "/land.js", "/gsi-address-search.js", "/places.js", "/share.js", "/events.js",
  // ⚠ 2 画面で共通の見た目の定義。**来ないと両ページの色も文字サイズも決まらない**
  //   （esc.js と同じ性質。オフラインでも画面が成り立つための最小限）。
  //   ⚠ 68 KB の地図 CSS とは別物で、実測 1,650 バイト。
  "/css/tokens.css",
  // ⚠ **EraControlPanel**（hidetzu/konjaku#171）。⚠ **来ないと /peel の年代 UI が出ない。**
  //   ⚠ **動的キャッシュの規則は「直下の .js」しか一致しない**（下の RUNTIME を読む）。
  //     ⚠ components の下は一致しないので、⚠ **ここに入れないと配られない**（オフラインで落ちる）。
  //   ⚠ CSS も同じ。⚠ **ここに角かっこを書かない**（SHELL を読む正規表現が、そこで切れる。
  //     実測 2026-08-22: 正規表現をコメントに書いたら landform.json が SHELL から消えて見えた）。
  "/components/era-control/era-control.js", "/components/era-control/era-control.css",
  "/data/landform.json",
  // ⚠ 地図エンジン（1,032 KB）と CSS（68 KB）は SHELL に入れない。
  //   入れると、判定しか見ない人にも丸ごと乗る。Zenn 流入はほぼ全員が初回なので効く。
  //   （実測 2026-08-15: maplibre-gl.js 1032.1 KiB / maplibre-gl.css 68.4 KiB）
  //   ⚠ ここにあった「初回訪問が 250 KB → 1,646 KB」「1万PV で約 16 GB の差」は消した。
  //     1,646 KB と 16 GB の測り方がどこにも残っておらず、再現できなかった。
  //   ⚠ 「地図は触った人だけが読み込む」のは `/` だけ。**`/peel` は常に読む**
  //     （peel.html が <link> と <script> で直に読む）。3D は地図が本体なので、それでよい。
  //   触ったときに取ればよい（下の網でキャッシュには入る）。
  "/favicon.svg", "/icon-192.png", "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // ⚠ タイルの棚は消さない。版が上がるたびに捨てると、溜めた意味が無くなる
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== TILES)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ⚠ /data/ev/index.json は SHELL に入れない。
//   取り込みを1回走らせるたびに中身が変わり、SHELL の中身から決まる版も変わるので、
//   **全利用者のキャッシュが丸ごと捨てられる**。
//   索引は下の「自分のオリジン」の網（ネットワーク優先）で取る。
//
// ⚠ **/data/ に保険は持たない。決めた上でそうしている**（2026-08-16）。
//   以前ここには「キャッシュは保険で足りる」と書いてあったが、保険は無かった。
//   しかも下の網が `caches.match("/")` を返すので、**JSON を頼んだ相手に index.html が
//   返っていた**＝「取れなかった」が「取れた」に化けていた。
//   ⚠ **持たない理由**: /data/ は取り込みで書き換わる。索引と本体が食い違うと
//     **誤判定につながる**（建物の足元を「明治期に水だった」と言い切る、その出どころ）。
//     配信方針も `_headers` で `max-age=0, must-revalidate`。
//     ⚠ Cache API は HTTP キャッシュの鮮度を自動では見ないので、
//       **ヘッダを付けただけでは守られない。持たないこと自体が要件。**
//   ⚠ **オフラインでは 504 を返す**（下の網）。読み手はいずれも `r.ok` を見て
//     null に落とすので、「取れなかった」として正しく扱われる。

// ---- 地理院タイル ----
// ⚠ 以前はここを素通ししていた（「他人のタイルを勝手に溜め込むべきではない」）。
//   実測して考えを変えた。地理院タイルは **Cache-Control も Expires も返さない**
//   （返るのは ETag と Last-Modified だけ）。つまりブラウザは経験則で判断するしかなく、
//   取り直しが起きる。素通しは「溜め込まない」ではなく「**同じ絵を何度も取りに行く**」だった。
//   年代を行き来すれば、同じタイルを何度も引く。
//   `npm run cost` の実測では、3D まで開くと国土地理院 **136 回**
//   （seamlessphoto 60 / gazo4 60 / swale 16）。
//   ⚠ ここにあった「223 リクエスト / 8 MB」は消した。測り方がどこにも残っておらず、
//     現在の計測結果とも合わなかった。
//
//   端末の中に置くだけなので、再配信（README で触れている禁止事項）とは別のこと。
//   利用者1人が、自分が見たタイルを持っているだけ。
//
// ⚠ 古い年代の空中写真は**もう変わらない**（1936–42 の写真が更新されることはない）。
//   一方 seamlessphoto は更新されるので、寿命を短くする。
const TILES = "konjaku-tiles-v1";
// 上限。3D を1回開くと 3桁のタイルを取るので、数百枚で溢れる。
// 50枚に1回しか片付けないので、最大 +50 のはみ出しも見込んでおく（実際の上限は約 300 枚）。
// ⚠ ここにあった「3D は1回開くと 223枚」「実測で端末に 16.9 MB 載った」は消した。
//   どちらも測り方が残っておらず、再現できなかった。
//   ⚠ この 250 という値自体、上の消した数字から決めたもの。**測り直していない。**
const TILE_MAX = 250;
const DAY = 24 * 60 * 60 * 1000;
const AT = "x-konjaku-at";
// 棚に入れる地理院タイルのホスト。
//   cyberjapandata … 空中写真・低湿地・土地条件（画像）
//   maps           … 地形分類（判定文の根拠。**画像ではなく .geojson**。verify.js の LFC）
// ⚠ **判定文の根拠だけが棚に入っていなかった。** 「この場所は 旧水部 です」と
//   言い切っている、その出どころが、他のタイルと同じ扱いになっていなかった。
// ⚠ **棚の対象は、ここが唯一の定義。** scripts/cost.mjs は写さず、ここを読む
//   （掟「同じ問いに答える実装を2つ持たない」。写していたら npm run check が落とす）。
//
// ⚠ **初回訪問では、地形分類は棚に入らない。**
//   判定は画面で一番早く走るので、地形分類の要求が **SW が制御を取るのと競走**する。
//   実測 2026-08-15（まっさらな入れ物で 3 回）:
//     地形分類の要求  1139ms（ページ由来。SW の前）
//     SW が制御を取る 1259ms
//     初回の棚        全体 16 枚 / **地形分類 0 枚**（3 回とも）
//   ⚠ 画像タイルは地図の描画に伴って遅れて出るので、初回から入る。
//   ⚠ **速さ次第で 1 枚だけ入ることもある**（別の試行で観測）。「必ず入らない」ではない。
//   したがって効果は **3 回目から**（2 回目は、棚に入れるための通信が要る）。
//   ⚠ 初回から入れるには判定を SW の準備待ちにする必要があり、**判定が遅くなる**ので採らない。
const TILE_HOSTS = ["cyberjapandata.gsi.go.jp", "maps.gsi.go.jp"];
const isTile = (u) => TILE_HOSTS.includes(u.host) && u.pathname.startsWith("/xyz/");
// ⚠ seamlessphoto（現在の写真）だけ短い。更新されるため。
//   地形分類は 30 日でよい（実測 2026-08-15: last-modified が 2025-03-05 で
//   1年以上動いていない。`experimental_` という名前だが、実際の更新は稀）。
const tileTtl = (u) => u.pathname.startsWith("/xyz/seamlessphoto/") ? DAY : 30 * DAY;

async function tile(req, url) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  if (hit) {
    const at = Number(hit.headers.get(AT) || 0);
    if (Date.now() - at < tileTtl(url)) return hit;
  }
  try {
    // ⚠ cors で取り直す。<img> の既定（no-cors）で来た応答をそのまま置くと
    //   中身の見えない応答になり、保存量の見積もりが実際よりはるかに大きく計上される。
    //   地理院は ACAO:* を返すので cors で取れる。
    const res = await fetch(new Request(url.href, { mode: "cors", credentials: "omit" }));
    if (!res.ok) return hit ?? res;         // 404 は「そこに無い」。溜めない
    const body = await res.blob();
    const h = new Headers(res.headers);
    h.set(AT, String(Date.now()));
    await c.put(req, new Response(body, { status: 200, headers: h }));
    maybeTrim(c);
    return new Response(body, { status: 200, headers: h });
  } catch {
    // 取れなかった。持っているなら出す（同じタイルなので、嘘にはならない）
    if (hit) return hit;
    throw new Error("tile unreachable");
  }
}
// ⚠ 片付けを毎回走らせない。cache.keys() は全件を数えるので、
//   タイルを大量に取る画面（3D は1回で 223枚）では O(n^2) になり、
//   ページ全体が目に見えて遅くなる（検査が 60秒で到達しなくなって気づいた）。
let puts = 0;
function maybeTrim(c) {
  if (++puts % 50) return;                 // 50枚に1回でよい
  trim(c);
}
async function trim(c) {
  const keys = await c.keys();
  if (keys.length <= TILE_MAX) return;
  for (const k of keys.slice(0, keys.length - TILE_MAX)) await c.delete(k);
}

// ⚠ **版のキャッシュに入れてよいもの（許可リスト）。**
//   配信方針（public/_headers）を正として、こちらを合わせる。
//   _headers が `max-age=0, must-revalidate` と言っているもの（/data/ev/ ・ /data/bl/ ・
//   HTML）は、**SW が持ってはいけない**。
//   ⚠ **Cache API は HTTP キャッシュの鮮度を自動では見ない。**
//     must-revalidate を付けても、Cache API から返せばそのまま古いものが出る。
//     だから「ヘッダで守られている」とは考えず、**持たないこと自体を要件にする**。
//   ⚠ とくに /data/bl/ は、**索引と本体が更新時に食い違うと誤判定につながる**
//     （建物の足元を「明治期に水だった」と言い切っている、その出どころ）。
//
// ⚠ /data/ は**動的には**1つも入れない。⚠ /data/landform.json は SHELL にあるので、
//   **同じ版のキャッシュには入る**（install の addAll）。「1つも入らない」ではない。
//   ここの網（動的追加）とは別の経路。
const CACHEABLE = [
  // ⚠ 地図エンジン。**名前は maplibre-gl.js で固定**（中身が変われば名前が変わる、ではない）。
  //   だから版（VERSION）の材料に vendor も入れてある（scripts/sw-hash.mjs）。
  //   入れないと、MapLibre を上げても版が変わらず、**ここが古いものを返し続ける**。
  /^\/vendor\//,
  /^\/[\w.-]+\.js$/,              // 自前のスクリプト（peel3d.js など SHELL に無いもの）
  /^\/[\w.-]*(icon|favicon)[\w.-]*$/,
  /\.webmanifest$/,
];
// ⚠ /data/ は名前の形で弾く前に、明示的に落とす（許可リストの書き間違いで通さない）
const cacheable = (p) => !/^\/data\//.test(p) && CACHEABLE.some((re) => re.test(p));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // 地理院タイルは、端末の中に置いて使い回す（同じ絵を何度も取りに行かない）
  if (isTile(url)) { e.respondWith(tile(e.request, url)); return; }
  // それ以外のよそは素通しする。実際に出る先は
  //   msearch.gsi.go.jp（住所検索。⚠ 問い合わせで、同じ答えが返る保証が無いので棚に入れない）
  //   query.wikidata.org（事物。同上）
  //   overpass-api.de・overpass.kumi.systems（建物。POST なので上の GET 判定で既に抜けている）
  // ⚠ Google へは fetch していない（リンクを開くだけ）。以前ここに書いてあったが誤り。
  if (url.origin !== location.origin) return;

  // ネットワーク優先。更新をすぐ反映したいので、キャッシュは落ちたときの保険に留める。
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // ⚠ **入れないものを並べるのではなく、入れるものを決める**（許可リスト）。
        //   除外を足していく形だと、**新しく置いたものが黙って入る**。
        //   実際そうなっていた: /data/bl/（建物タイル・65 ファイル・生 17.0 MB）が
        //   版のキャッシュに入り、**版が上がるたびに捨てて取り直していた**（実測で再現）。
        if (res.ok && cacheable(url.pathname)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      // ⚠ **HTML を返してよいのは、ページの移動だけ。**
      //   ここは `?? caches.match("/")` で、**何を頼まれても index.html を返していた**。
      //   JSON を頼んだ相手に 200 text/html が返る＝**「取れなかった」が「取れた」に化ける**
      //   （掟: 取れなかったを「無い」と言わない）。
      //   ⚠ /data/ だけ除く形にしたが、それでは足りない（2026-08-16 の指摘）。
      //     **将来 /version.json を置いたら黙って壊れる。** 未キャッシュの JS / CSS も同じ。
      //   ⚠ 移動（navigate）かどうかで分ける。移動ならオフライン用の画面を出す意味がある。
      //     それ以外は「取れなかった」を返す。読み手はいずれも `r.ok` を見て null に落とす。
      .catch(() => caches.match(e.request).then((r) => {
        if (r) return r;
        if (e.request.mode === "navigate") return caches.match("/");
        return new Response(null, { status: 504, statusText: "offline" });
      }))
  );
});
