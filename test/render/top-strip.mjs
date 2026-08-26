// 実描画 — 年代の帯（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 7 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **見出し 2 本ぶんを、⚠ まるごと連続で運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **ここが守っているもの**:
//     並べるだけ   ⚠ **帯が「何を言っていないか」を見る。**⚠ **「1960年代：造成開始」のような
//                  ⚠ 中間の主張は、⚠ 空中写真からは出せない**（⚠ 写真を並べる、という決定）
//     崩れない     ⚠ **1 年代しか無い土地でも、⚠ スマホ幅でも、⚠ 現在まで 1 画面に収まる**
//     取れないとき ⚠ **通信断のときは並べない。**⚠ **候補の失敗を黙って空にしない**
//     押せる       ⚠ **最初の 1 タップが空振りしない。**⚠ **押した年代が大きくなる**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, KARUIZAWA, waitVerdict, photoFrames, waitStrip, LIES, GSI_ROUTE, stubMapPictures, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  // ---- 年代ストリップ ----
  // 帯そのものより、**帯が何を言っていないか**を見る検査。
  // 「1960年代：造成開始」のような中間の主張は空中写真からは出せない（掟: 画素から出せないことは言わない（実測1））。
  // 写真を並べるだけ、という決定が崩れていないことを人の目に頼らず押さえる。
  {
    name: "年代の写真が並ぶ（豊洲）", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => ({
        year: e.querySelector(".yr")?.textContent.trim() ?? "",
        now: e.classList.contains("now"),
        w: e.querySelector("img")?.naturalWidth ?? 0,
        err: !!e.querySelector(".im.err"),
      })));
      must(fr.length >= 4, `年代が並んでいない: ${fr.length} 枚`);
      // ⚠ 判定が「旧水部」と言っているのに、残っている写真はどれも既に陸だった。
      //   判定の根拠になっている明治期のデータを、帯の左端に置いてある
      must(await page.locator("#strip .f.meiji").count() === 1,
        "明治期のコマが帯に無い（判定と、目の前の絵が噛み合わない）");
      must(fr[0].year === "明治期", `左端が明治期でない: ${fr[0].year}`);
      // ⚠ 明治期は空中写真ではない。数に混ぜると「8 回ぶん中 8 回」という嘘になる
      //   （帯には明治期のコマも並ぶので、コマ数をそのまま数えると 1 多くなる）。
      // ⚠ 文言を変えた（2026-08-17）。「N 年代（M 年代中）」は初見の人が通算 3 人とも
      //   「意味が分からない」と答えたのでやめた。⚠ **守っている意図は同じ**:
      //   「この場所に残っている数」が「全部の数」を超えないこと＋分母が出ていること。
      //   ⚠ 以前は `/(\d+)\s*年代（\s*(\d+)/` と**文言に張り付いた正規表現**だったので、
      //     文言を変えた瞬間に「ありうる数を超えている」と**誤った理由で**落ちた。
      const foot = (await page.locator(".strip-foot").textContent()).replace(/\s+/g, " ");
      // 「7回ぶんすべて」／「7回ぶん中 4回」／「残っていません（全7回ぶん中）」の 3 通り
      const all = Number((foot.match(/(\d+)\s*回ぶん/) ?? [])[1]);
      const got = /すべて/.test(foot) ? all
        : /残っていません/.test(foot) ? 0
        : Number((foot.match(/回ぶん中\s*(\d+)\s*回/) ?? [])[1]);
      must(Number.isFinite(all) && all > 0, `分母（全部で何回ぶんか）が出ていない: ${foot.trim()}`);
      must(Number.isFinite(got), `この場所に残っている数が読めない: ${foot.trim()}`);
      must(got <= all, `空中写真の数が、ありうる数を超えている: ${foot.trim()}`);
      // ⚠ **同じ数を 2 回書かない**（「7 年代（7 年代中）」が意味を成さなかった原因）
      must(!new RegExp(`${all}[^0-9]{1,8}${all}`).test(foot),
        `同じ数を 2 回書いている（意味を成さない）: ${foot.trim()}`);
      must(fr.every((f) => f.err || f.w > 0), `写真が復号できていない: ${JSON.stringify(fr)}`);
      must(!fr.some((f) => f.err), `豊洲で読めない写真がある: ${JSON.stringify(fr)}`);
      // 右端は現在。左端は最古。時間の向きが逆だと、この帯は何も語らない
      must(fr[fr.length - 1].now && fr[fr.length - 1].year === "現在",
        `右端が現在でない: ${fr[fr.length - 1].year}`);
      must(/^1936/.test(fr[1].year), `明治期の次が最古の写真でない: ${fr[1].year}`);
      // ⚠ ここが本体。年の表記と「現在」以外の語を、帯の中に置かない。
      //   ここが緩むと「1960年代：造成開始」のような、実測できない作文が入り込む
      const stray = fr.map((f) => f.year).filter((y) => !/^(\d{4}–\d{2}|現在|明治期)$/.test(y));
      must(stray.length === 0, `帯が年代以外のことを言っている: ${stray.join(" / ")}`);
      // 判定した画素の位置に印が出ていること（写真のどこの話かが分かる）
      const marks = await page.locator("#strip .mk").count();
      must(marks === fr.length, `印が枚数と合わない: ${marks} / ${fr.length}`);
      // 帯から先へ行けること。行き先は年代を重ねて見る画面
      // ⚠ 画面に出ている写真が、**判定に使った写真そのもの**であること。
      //   photos() は z16 のこのタイルを読んで年代の有無を決めている。帯が別のズームや
      //   別のタイルを出していたら、根拠と絵が別物になる（それを根拠と呼べなくなる）。
      //   同じ地点・同じ z なら、レイヤ名を除いた /16/x/y の部分は全枚で一致するはず。
      const at = await page.$$eval("#strip img", (els) => els
        .map((e) => (e.getAttribute("src").match(/\/(\d+)\/(\d+)\/(\d+)\.\w+$/) ?? []).slice(1).join("/")));
      must(new Set(at).size === 1, `帯の写真が同じ地点・同じズームでない: ${[...new Set(at)].join(" / ")}`);
      // 写真タイルの実通信。判定のぶんと帯のぶんで同じURLを引くので、重複が出るのは想定内。
      // 「別のタイルまで取りに行き始めた」ときに、この2つの数字が離れる
      const tiles = reqs.filter((u) => /cyberjapandata\.gsi\.go\.jp\/xyz\/(ort_|gazo|seamlessphoto)/.test(u));
      return `${fr.length} 枚（${fr[0].year} 〜 現在）／印 ${marks}／すべて z${at[0].split("/")[0]} の同一タイル`
        + `／写真タイルの要求 ${tiles.length} 件（実URL ${new Set(tiles).size} 種）`;
    },
  },
  {
    name: "写真が1年代しか無い土地でも帯が崩れない", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) =>
        e.querySelector(".yr")?.textContent.trim() ?? ""));
      // 軽井沢は 1974–78 の1年代だけ。無い年代を埋めない
      must(fr.length >= 2, `帯が出ていない: ${JSON.stringify(fr)}`);
      must(fr[fr.length - 1] === "現在", `右端が現在でない: ${JSON.stringify(fr)}`);
      must(!fr.includes("1936–42"), `残っていない年代を並べている: ${JSON.stringify(fr)}`);
      return fr.join(" / ");
    },
  },
  {
    // ⚠ 横スクロールで作ったときに実際に起きていた壊れ方。
    //   375px 幅では4枚目で切れ、いちばん見せたい「現在」が画面の外にいた。
    //   「昔 → 今」を1画面で見せる帯なのに、今が見えないのでは意味が無い。
    name: "スマホ幅でも、現在まで1画面に収まる", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { year: e.querySelector(".yr")?.textContent.trim() ?? "",
                 right: Math.round(r.right), bottom: Math.round(r.bottom) };
      }));
      const over = fr.filter((f) => f.right > 375);
      must(over.length === 0,
        `帯が画面からはみ出している: ${over.map((f) => `${f.year}(right=${f.right})`).join(" / ")}`);
      const now = fr[fr.length - 1];
      must(now.year === "現在", `右端（最後）が現在でない: ${now.year}`);
      must(now.bottom <= 667, `現在がファーストビューの外にいる: y=${now.bottom}`);
      // 帯そのものが画面の高さを食いつぶしていないこと（判定文が押し出される）
      const h = await page.$eval("#strip", (e) => Math.round(e.getBoundingClientRect().height));
      must(h <= 220, `帯が高すぎる: ${h}px`);
      // 場所が決まったらサブコピーは畳む（実測 79px。写真と判定文がそのぶん下へ押し出されていた）
      // ⚠ 「場所を検索して…」は、もう場所を選んだ人には前の段の指示。
      //   場所選択中の責務にサービス紹介は無い
      const leads = await page.$$eval(".lead", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0).length);
      must(leads === 0, `場所を選んだあともサブコピーが残っている: ${leads} 個`);
      // ⚠ 入力例も一緒に消えること。ここで一緒に見ておかないと、
      //   「未選択向けのものが選択後に残る」を 2 か所へ分けて見ることになる
      const qk = await page.$eval("#quick", (e) => ({
        vis: e.checkVisibility(), h: Math.round(e.getBoundingClientRect().height) }));
      must(!qk.vis, `場所を選んだあとも入力例が残っている: 高さ ${qk.h}px`);
      // 判定文が画面内にあること。写真が主役でも、答えの一文は同じ画面で読めること
      const v = await page.$eval("#verdict .v-head", (e) => Math.round(e.getBoundingClientRect().y));
      must(v < 667, `判定文がファーストビューの外にいる: y=${v}`);
      return `${fr.length} 枚が ${Math.ceil(fr.length / fr.filter((f) => f.bottom === fr[0].bottom).length)} 行`
        + `／現在は y=${now.bottom}／帯の高さ ${h}px`;
    },
  },
  {
    name: "通信断のときは年代の写真を並べない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await waitVerdict(page);
      // 読めていないのに枠だけ並べると、「この年代は写真が無い」に化ける。
      // 出さないことがいちばん正確（掟: 取れなかったを「無い」と言わない）
      must(await page.locator("#strip").count() === 0, "通信断なのに年代の帯が出ている");
      must(await page.locator("#strip .f").count() === 0, "通信断なのに写真の枠が出ている");
      const v = await page.locator("#verdict").textContent();
      must(/読み込めませんでした/.test(v), `読み込めなかったことが書かれていない: ${v.slice(0, 60)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行が出ていない");
      for (const w of LIES) must(!v.includes(w), `通信断で断定している: 「${w}」`);
      return `帯なし／再試行あり／断定なし`;
    },
  },
  {
    name: "クイック候補の通信断を黙って空にしない", path: "/",
    setup: (page) => page.route("**/data/quick-places.json", (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(() => /候補地を読み込めませんでした/.test(
        document.getElementById("quick")?.textContent ?? ""), null, { timeout: 20000 });
      must(await page.locator("#quick .quick-error").count() === 1, "候補地の失敗表示が無い");
      must(await page.locator("#quick .quick-error button", { hasText: "再試行" }).count() === 1,
        "候補地の再試行が無い");
      return "候補地の失敗を表示／再試行あり";
    },
  },
  // ---- 入口が塞がっていないこと ----
  // ⚠ 実測で見つけた事故。スマホ幅で **1タップ目が必ず空振り**していた。
  //   入力欄がフォーカスを失うと補足文（.hint）が消え、下にあるものが 42px 上へずれる。
  //   指を離す前にレイアウトが動くので、押した座標には別の要素が来ている。
  //   見せ方をどれだけ磨いても、ここが塞がっていると誰も判定に到達できない。
  {
    // ⚠ **主題はタップが届くか**（2026-08-22。hidetzu/konjaku#191）。⚠ **絵が届くかではない。**
    //   ⚠ **実測**: 外へ 46 本のうち ⚠ **絵が 33 本**（空中写真 29 ／ 下地 4）。
    //   ⚠ **判定の材料（低湿地・地形分類 12 本）と住所検索 1 本は、⚠ 本物のまま。**
    //   ⚠ **材料を偽ると、⚠ 答えが変わる。**⚠ **絵だけ差し替える。**
    name: "スマホで、最初の1タップが空振りしない", dep: "search", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true, setup: stubMapPictures,
    async check(page) {
      // (1) クイック選択（地名の例）
      await page.waitForSelector("#quick button");
      const chip = page.locator("#quick button", { hasText: "豊洲" });
      await page.click("#q");                       // 利用者と同じ順序で、まず入力欄に触れる
      await page.waitForTimeout(150);
      const before = await chip.boundingBox();
      await chip.tap();                             // ここが1タップ目
      await waitVerdict(page);
      const after = await page.locator("#scope").boundingBox();
      must((await page.locator("#chipName").textContent()).trim().length > 0,
        "クイック選択の1タップ目が空振りしている");

      // (2) 検索候補。まっさらな状態から始めるため、入口に戻ってやり直す
      await page.goto(new URL("/", page.url()).href, { waitUntil: "domcontentloaded" });
      await page.click("#q");
      await page.fill("#q", "豊洲");
      await page.waitForSelector("#list .it", { timeout: 20000 });
      await page.waitForTimeout(400);
      const row = page.locator("#list .it").first();
      const y0 = Math.round((await row.boundingBox()).y);
      await row.tap();                              // ここが1タップ目
      await page.waitForTimeout(900);
      const picked = (await page.locator("#chipName").textContent()).trim();
      const y1 = Math.round((await page.locator("#list .it").first().boundingBox().catch(() => null))?.y ?? y0);
      must(picked.length > 0, `検索候補の1タップ目が空振りしている（y=${y0}→${y1}）`);

      return `クイック選択・検索候補とも1タップ目で通る（選択: ${picked}）`
        + `／チップ y=${Math.round(before.y)}・検索欄 y=${Math.round(after.y)}`;
    },
  },
  {
    // ⚠ 帯の8枚が全部同じURLで、押した年代が捨てられていた。
    //   「1987–90」を押しても着地は必ず 1936–42。押した絵と着いた絵が違う。
    // ⚠ 帯は「表示」から「操作」になった。押した年代がその場で大きくなること、
    //   着いたときに最古から始まること（看板の問いに写真で即答している状態）を見る。
    name: "帯を押すと、その年代が大きくなる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      const read = () => page.evaluate(() => ({
        on: [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")),
        pressed: [...document.querySelectorAll("#strip .f")]
          .filter((e) => e.getAttribute("aria-pressed") === "true").length,
        year: document.getElementById("yrBig")?.textContent.trim() ?? "",
        src: document.querySelector("#big .lyr.on .t")?.getAttribute("src") ?? "",
        years: [...document.querySelectorAll("#strip .yr")].map((e) => e.textContent.trim()),
      }));

      const a = await read();
      must(a.on === 0, `着いたときに左端（明治期）が選ばれていない: ${a.on} 番目`);
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      must(a.pressed === 1, `選択状態が1つでない: ${a.pressed}`);
      must(a.year.includes(a.years[0]), `大きい写真の年代が帯と食い違う: 「${a.year}」/「${a.years[0]}」`);

      // 4枚目を押す
      const i = 4;
      await page.locator("#strip .f").nth(i).click();
      await settleAfterClick(page);
      const b = await read();
      must(b.on === i, `押した年代が選ばれていない: ${b.on} 番目`);
      // 1枚だと狭すぎて「この時点までにできていたもの」がほぼ空になる（実測 豊洲2件・浦安0件）
      must(await page.locator("#big .lyr.on .t").count() === 4,
        `写真の年代が 2×2 で組まれていない: ${await page.locator("#big .lyr.on .t").count()} 枚`);
      must(b.pressed === 1, `選択状態が1つでない: ${b.pressed}`);
      must(b.src !== a.src, `写真が切り替わっていない: ${b.src}`);
      must(b.year.includes(b.years[i]), `年代の見出しが押した年代でない: 「${b.year}」/「${b.years[i]}」`);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      // ⚠ 別ページへ渡す行はもう無い（/eras を撤去した）。年代の切り替えはこの画面で完結する
      must(await page.locator('#list a[href*="eras"]').count() === 0,
        "撤去した /eras への導線が残っている");
      return `最古から始まり、4枚目を押して「${b.year.replace(/\s+/g, " ")}」に切り替わる`;
    },
  },
];
