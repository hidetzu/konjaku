// 実描画 — 年代を動かす／明治期を重ねる（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-26。hidetzu/konjaku#277 の 5 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **見出し 1 本ぶんを、⚠ まるごと連続で運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **元の見出しは `/eras にしか無かった3つを、トップへ` だった。**
//   ⚠ **「3つ」と名乗っていたが、⚠ 実際には 13 件ある**（⚠ 名前が嘘になっていた）。
//   ⚠ **`/eras` はもう無い。**⚠ **移した経緯ではなく、⚠ いま何を守っているかで名づけ直した**
//     （`CLAUDE.md` §4: ⚠ **機能名は内部構造ではなく利用者の問いから決める**）。
//   ⚠ **見出しそのものは運んでいない**（⚠ このファイルの名前が、⚠ その役目を果たす）。
//
// ⚠ **ここが守っているもの**:
//     動かす       ⚠ **年代を順に流せる。**⚠ **地図の上を押したら、⚠ その地点を判定し直す**
//     重ねる       ⚠ **明治期の水域を、⚠ いまの地図に重ねられる**
//     言葉と層     ⚠ **「重ねています」と、⚠ 実際に重なっている層を食い違わせない**
//     取れないとき ⚠ **タイルが拒まれた・読めなかった年代を、⚠ 黙って落とさない**
//     動きを減らす ⚠ **入れた人には自前の動きを残さない。**⚠ **入れていない人には残す**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { WORDS, TOYOSU, SAPPORO, UNSURVEYED, waitVerdict, stubWikidata, photoFrames, waitStrip, LIES, effOpacity, settleAfterCondition, settleAfterClick, SWALE_ROUTE, must } from "./lib.mjs";

export const CASES = [
  // ---- /eras にしか無かった3つを、トップへ ----
  {
    name: "地図の上を押すと、その地点を判定し直す", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const before = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search }));
      // 地図を出す
      await page.locator("#zIn").click();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      // 中心から離れたところを押す
      const box = await page.locator("#big").boundingBox();
      await page.mouse.click(box.x + box.width * 0.22, box.y + box.height * 0.28);
      await page.waitForFunction((t) => {
        const v = document.getElementById("verdict")?.textContent ?? "";
        return v.length > 0 && !v.includes("判定中") && location.search !== t;
      }, before.url, { timeout: 45000 });
      // 地図は要素ごと描き直されるので作り直しになる。**戻ってくること**を待つ
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 }).catch(() => {});
      const after = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search, map: !!document.querySelector("#big.map-on") }));
      must(after.url !== before.url, `押しても座標が変わっていない: ${after.url}`);
      must(after.text.length > 0, "押したあと判定文が消えている");
      // ⚠ 地図を壊さない。壊すと押した場所を見失う
      must(after.map, "判定し直したら地図が消えた（押した場所を見失う）");
      return `座標が ${before.url.slice(0, 28)}… → ${after.url.slice(0, 28)}…／地図は残る`;
    },
  },
  {
    name: "年代を順に流せる／明治期の水域を重ねられる", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const at = () => page.evaluate(() =>
        [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")));
      // ▶ で年代が進むこと
      must(await at() === 0, "着いたときに左端が選ばれていない");
      await page.click("#playBtn");
      await page.waitForFunction(() => {
        const i = [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on"));
        return i >= 2;
      }, null, { timeout: 20000 });
      must(await page.locator("#playBtn.on").count() === 1, "流している最中だと分からない");
      await page.click("#playBtn");                     // 止める
      await page.waitForTimeout(400);
      must(await page.locator("#playBtn.on").count() === 0, "止められない");
      const stopped = await at();
      await page.waitForTimeout(1800);
      must(await at() === stopped, `止めたのに進んでいる: ${stopped} → ${await at()}`);

      // 明治期の水域を重ねられること（判定できた土地でだけ出す）
      must(await page.locator("#ovSwale").count() === 1, "明治期の土地を重ねる操作が無い");
      // ⚠ ここは長いあいだ、**何も測らずに「水域の重ねあり」と報告していた**。
      //   代入した値をどこにも使わない行が置いてあるだけで、assertion が無かった。
      //
      //   ⚠ 通信では測れない。**タイルは不透明度 0 でも取りに行く**
      //     （peel で 556→138 枚に落としたときに分かったのと同じ話）。実測で、
      //     `raster-opacity` を 0 固定に壊してもタイルの枚数は変わらず、検査は通った。
      //   ⚠ 「重ねる前」と「重ねた後」を比べるのも駄目。この操作は**地図そのものを出す**ので、
      //     層が死んでいても地図が現れたぶんだけ画面が変わり、やはり通る（これも実測で通った）。
      //   → 地図が出た状態のまま、**重ねを入り切りして**比べる。これで層だけを切り分けられる。
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const shotOn = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1800);
      const shotOff = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(1200);
      must(!shotOn.equals(shotOff),
        "重ねを入り切りしても、画面が1バイトも変わらない（層が効いていない）");
      return `▶ で ${stopped} 番目まで進んで止まる／重ねの入り切りで画面が変わる`
        + `（入 ${shotOn.length} B／切 ${shotOff.length} B）`;
    },
  },
  {
    // ⚠ **下地を敷いても、上が不透明なら 1 ピクセルも見えない。**
    //   明治期のコマは「淡色地図＋区分の塗り」の 2 枚組で描いているが、塗りが不透明だったため、
    //   **全面が水だった土地（豊洲）では下地が完全に隠れ、画面の 6 割が青一色**になっていた。
    //   初見の 3 人が 3 人ともそこに最初に目を奪われ、1 人は「読み込み中かと思った」（2026-08-17）。
    //   ⚠ **この不具合は、それまでの検査を 1 つも落とさなかった。**
    //     層は在るし、タイルも取りに行くし、地図も出る。「見えているか」を誰も見ていなかった。
    //   → **撮った絵の画素を実際に数える。** 単色なら色数が極端に少ない。
    //   ⚠ 通信の本数では測れない（不透明度 0 でもタイルは取りに行く）。
    //   ⚠ 不透明度の値そのものを見ない。0.99 でも通ってしまい、**見えるかどうか**を測れない。
    name: "明治期のコマで、下地の地図が透けて見える", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page, reqs) {
      await waitVerdict(page);
      await page.waitForSelector("#big .lyr.on img", { timeout: 20000 });
      await page.waitForTimeout(3000);
      // 着いた直後は最古＝明治期のコマ。前提が変わったら落とす（別のコマを測って緑にしない）
      const first = await page.$eval("#yrBig", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/明治期/.test(first), `着いた直後が明治期のコマでない: ${first}`);
      // 絵の中だけを切り取る。四隅の操作（🔇・＋−・年バッジ・重ねる行）を含めない
      const box = await page.locator("#big").boundingBox();
      const clip = { x: box.x + box.width * 0.34, y: box.y + 10,
                     width: Math.round(box.width * 0.46), height: Math.round(box.height * 0.34) };
      // 撮った PNG を**その場のブラウザで開いて**画素を数える。
      // ⚠ data: URL なので canvas は汚れない（タイルを直接読むと cross-origin で読めない）
      const colors = async (area = clip) => {
        const buf = await page.screenshot({ clip: area });
        return page.evaluate(async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          return seen.size;
        }, buf.toString("base64"));
      };
      const on = await colors();
      // 単色に近ければ、下地は見えていない。実測（2026-08-17 / 豊洲）:
      //   直す前 = 2 色（青のベタ塗り）／直したあと = 数百色（道路・駅名・町名が透ける）
      must(on >= 24, `明治期のコマが単色に近い（下地が透けていない）: ${on} 色`);
      // ⚠ **帯の小さいコマも見る。** この画面は同じ絵を出す経路が **3 本**ある
      //   （帯のコマ・大きい絵・地図）。大きい絵と地図だけ直して**帯に届いておらず**、
      //   帯のコマが青いベタ塗りのまま残っていた（2026-08-17 にオーナーが実機で発見）。
      //   検査も 2 本しか見ていなかったので、緑のまま通していた。
      // ⚠ **帯には水域を重ねない**（オーナー判断 2026-08-17）。重ねると、全面が水だった土地で
      //   コマが青いベタ塗りになり、隣に並ぶ空中写真の中で 1 つだけ「絵ではないもの」になる。
      //   水域は、そのコマを選んだときに大きい絵の側で見せる（重ねる操作つき）。
      const cellBox = await page.locator("#strip .f.meiji").boundingBox();
      must(cellBox, "帯に明治期のコマが無い（この検査が何も見ていない）");
      const cell = await colors({ x: cellBox.x + 3, y: cellBox.y + 3,
        width: Math.max(1, Math.round(cellBox.width - 6)),
        height: Math.max(1, Math.round(cellBox.height - 6)) });
      // ⚠ コマは 24px 角しかないので、大きい絵より色数は少ない。
      //   ⚠ **ベタ塗りでも 0 色にはならない。** 枠の丸み・選択中の輪・判定した点の印・
      //     縁のぼかしが色を持つ。実測（2026-08-17 / 豊洲）:
      //       塗りが不透明 = 37 色 ／ 透かして重ねる = 134 色 ／ 重ねない（いま）= 176 色
      //     最初 12 色で書いたら**壊しても通った**ので、実測の間に置き直した。
      must(cell >= 80, `帯の明治期のコマが青いベタ塗りのまま: ${cell} 色（地図なら 170 前後）`);
      // ⚠ **塗りのタイルを要求していないこと**まで見る。透明にして隠すのでは、
      //   見えないものを国土地理院へ取りに行き続ける（掟: 地理院への負荷は自分の請求とは別に見る）
      const cellImgs = await page.$$eval("#strip .f.meiji img", (els) => els.map((e) => e.src));
      must(!cellImgs.some((s) => /\/swale\//.test(s)),
        `帯のコマが水域のタイルを取りに行っている: ${cellImgs.join(" / ")}`);
      // 重ねる操作が**そこに出ている**こと。以前は明治期のコマでだけ隠していた
      const row = await page.$eval("#ovRow", (e) => e.checkVisibility()).catch(() => false);
      must(row, "明治期のコマに、重ねる操作が出ていない");
      const c0 = await page.$eval("#ovSwale", (e) => e.checked);
      must(c0, "明治期のコマで、水域が既定で重なっていない");
      // ⚠ **押しても地図を起こさないこと。** 起こすと、静止画から地図へ絵が差し替わり
      //   **押した瞬間に位置が跳ぶ**（2026-08-17 にオーナーが実機で発見）。
      //   実測: #ovRow 自体は 1px も動かないのに、中の絵だけが替わる。
      //   ⚠ 明治期のコマは静止画のモザイクだけで成立する（淡色地図＋塗りの2枚組）。
      //     起こすぶんの要求（実測 24 タイル）も無駄になる
      //     （掟: 地理院への負荷は自分の請求とは別に見る）。
      const gsiBefore = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      // 入り切りで**絵が本当に変わる**こと（掟: 押しても何も起きない導線を置かない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      must(!(await page.$("#big.map-on")),
        "明治期のコマで重ねを押しただけで地図が起きた（絵が差し替わって位置が跳ぶ）");
      const gsiAfter = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      must(gsiAfter === gsiBefore,
        `明治期のコマで重ねを押しただけで、地理院へ ${gsiAfter - gsiBefore} 本出た`);
      const offBuf = await page.screenshot({ clip });
      const onBuf2 = await (async () => {
        await page.locator("#ovSwale").check();
        await page.waitForTimeout(900);
        return page.screenshot({ clip });
      })();
      must(!offBuf.equals(onBuf2), "重ねを入り切りしても、明治期のコマが1バイトも変わらない");
      // 切ったほうも単色でないこと（＝下地の地図が出ている。真っ白や真っ黒にしない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      const off = await colors();
      must(off >= 24, `水域を切ったのに、下地の地図が出ていない: ${off} 色`);
      // ⚠ **地図の経路でも同じことを確かめる。** ここまでは静止画のモザイクしか見ていない。
      //   同じ絵を出す経路が 2 本あり、**片方だけ直して届いていなかった事故を 2 回**やっている
      //   （CLAUDE.md の落とし穴）。実際、この検査を書いた直後に地図側だけ壊してみたら**通った**。
      //   → 地図が出ている状態（#big.map-on）にしてから、もう一度画素を数える。
      // ⚠ **この検査が見ていない範囲**（実測で確かめた 2026-08-17）:
      //   地図の**作成時**の不透明度（style の paint）を壊しても、ここは通る。
      //   地図の読み込み直後に applyOverlay() が必ず走って上書きするため、
      //   振る舞いに差が出ないから。作成時の値が効くのは「地図が出た瞬間の一瞬」だけで、
      //   そこは撮れていない。**「作成時の値も検査した」とは言わない。**
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(600);
      await page.locator("#big").click({ position: { x: 180, y: 120 } });   // 地図を起こす
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const onMap = await colors();
      must(onMap >= 24, `地図の経路でも下地が透けていない: ${onMap} 色`);
      // 地図が出た状態で、入り切りが効くこと（層だけを切り分けて見る）
      const mapOnBuf = await page.screenshot({ clip });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1500);
      const mapOffBuf = await page.screenshot({ clip });
      must(!mapOnBuf.equals(mapOffBuf),
        "地図が出ている状態で、重ねを入り切りしても1バイトも変わらない（地図の経路に届いていない）");
      // ⚠ **選んだ状態は、コマをまたいでも引き継ぐ。**（2026-08-17 オーナー判断）
      //   以前はコマごとに別々に覚えていたが、**明治期で入にしたのに写真へ移ると切れる**
      //   という取り違えを生んだ。「明治期の水域を見ているか」は1つの問いなので、状態も1つ。
      //   ⚠ ここは**切った状態**のまま移る（直前で uncheck している）。切ったまま引き継ぐこと。
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "切ったのに、写真の年代へ移ったら入に戻った");
      await page.locator("#strip .f").nth(0).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "明治期のコマへ戻ったのに、切っておいた設定が戻っていない");
      // 入れ直して、写真の年代へ**入のまま**引き継ぐこと（今回の指摘そのもの）
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(800);
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === true,
        "明治期で入にしたのに、写真の年代へ移ると切れている");
      // ⚠ チェックが入っているだけでは足りない。**層まで効いていること**を見る
      const carried = await page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      must(carried > 0,
        `写真の年代でチェックは入っているのに、層が ${carried}（何も重なっていない）`);
      return `3経路とも下地が透ける（帯のコマ ${cell} 色／大きい絵 ${on} 色／地図 ${onMap} 色`
        + `／切ると ${off} 色。単色なら 2〜4 色）／入り切りで絵が変わる／状態がコマをまたいで引き継がれる`;
    },
  },
  {
    // 明治期のデータが無い土地では、重ねるものが無い
    name: "明治期が無い土地では、重ねる操作を出さない", path: `/?${SAPPORO}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(800);
      const m = await page.locator("#verdict .badge").allTextContents();
      const hasMeiji = m.some((t) => /明治期: (?!.*(なし|データ))/.test(t));
      // ⚠ 以前は assertion が if の中にしか無く、hasMeiji が true に転ぶと
      //   **1つも確かめないまま「対象外」と報告して緑**になった（2026-08-14 検証者の指摘）。
      //   しかも判定はバッジの文面への正規表現なので、**文言を変えるだけで静かに無効化**される。
      //   → この土地に明治期が無いこと自体を、まず確かめる。前提が消えたら落とす。
      must(!hasMeiji,
        `この土地に明治期のデータが出ている。検査の前提が消えた（バッジ: ${m.join(" / ")}）`);
      must(await page.locator("#ovSwale").count() === 0,
        "明治期のデータが無いのに、重ねる操作が出ている");
      // ⚠ 操作を黙って消すだけだと「壊れている」と読める。なぜ出せないかは画面が言う。
      //   整備対象外（404）と、読み込めなかった（通信断・403）は別の言葉でなければならない。
      must(m.some((t) => /明治期のデータ(なし|を読み込めませんでした)/.test(t)),
        `重ねる操作を出さない理由が、画面のどこにも無い（バッジ: ${m.join(" / ")}）`);
      return `明治期なし（バッジ ${m.length} 個）／重ねる操作を出していない`;
    },
  },
  {
    // ⚠ 重ねる相手は写真なのに、操作は写真・判定文・▶ の下にあった。
    //   実測（2026-08-16 / 豊洲）で 1280×800 では y=831 と**初期画面の外**、
    //   375×667 でも 552px（写真の下）。写真が見えているのに操作が見えない状態を作らない。
    //   → 年バッジと同じ積み上げ（.bl）に入れた。固定値で位置を決めない。
    name: "重ねる操作が、写真と一緒に初期画面に見える", path: `/?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 明治期のコマは空中写真ではない。幅のある見出しの側で、そう名乗る
      // ⚠ **字を書き写さない**（2026-08-25。hidetzu/konjaku#176）。
      //   ⚠ 以前はここに「空中写真ではありません」と直接書いていた。
      //   ⚠ **言い直したとき、⚠ 製品ではなくこの検査が落ちた。**⚠ 持ち主から取る。
      const yr = await page.locator("#yrBig").textContent();
      must(yr.includes(WORDS.MEIJI_NOT_PHOTO),
        `明治期の見出しが、持ち主の字と違う: ${yr}`);
      // ⚠ **字を借りるだけだと、⚠ 持ち主が「地図」だけになっても緑になる。**
      //   ⚠ **主張そのもの（写真ではない）が立っていることまで見る。**
      //   ⚠ 「写真」と否定が、⚠ **同じ 1 文の中で結びついていること**（CLAUDE.md §9）。
      must(/写真(?:で|じゃ)(?:は)?(?:ない|なく|ありません)/.test(WORDS.MEIJI_NOT_PHOTO),
        `明治期の見出しが「写真ではない」と言っていない: ${WORDS.MEIJI_NOT_PHOTO}`);
      const cell = await page.locator("#strip .f.meiji .yr").textContent();
      must(cell.trim() === "明治期", `帯のコマの見出しが変わっている: ${cell}`);
      // ⚠ この検査は以前、**明治期のコマでは操作を出さない**ことを求めていた。
      //   当時の理由は「重ねる相手（空中写真）が無い／入り切りしても絵が変わらない」で、
      //   当時は正しかった（掟: 押しても何も起きない導線を置かない）。
      //   ⚠ 前提が変わった。相手は**下に敷いてある淡色地図**で、塗りを透かしたので
      //     入り切りすると絵が本当に変わる。**出すのが正しい**（2026-08-17）。
      //   守っていた「押しても何も起きない導線を置かない」は、
      //   →「明治期のコマで、下地の地図が透けて見える」が、画素を数えて引き継いでいる。
      must(await effOpacity(page, "#ovRow") > 0,
        "明治期のコマで、重ねる操作が出ていない（下地の地図を出し入れできない）");
      // 写真の年代（1936–42）へ移ると、出る
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      // ⚠ **地図を載せてから見る。** 国土地理院の帰属表示は地図が載って初めて出る。
      //   載せずに見ていたら、帰属表示に重なっていることを一度も捕まえられない。
      await page.click("#zIn");
      await settleAfterClick(page);
      const geom = () => page.evaluate(() => {
        const R = (s) => {
          const e = document.querySelector(s); if (!e) return null;
          const b = e.getBoundingClientRect();
          return { t: Math.round(b.top), b: Math.round(b.bottom),
                   l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) };
        };
        // 重なりは矩形の交差で見る（見えているつもりを、座標で潰す）
        const hit = (a, x) => !!a && !!x && a.l < x.r && x.l < a.r && a.t < x.b && x.t < a.b;
        const ov = R("#ovRow"), big = R("#big");
        // 地図を載せると出る帰属表示（国土地理院）。**隠していないこと**を座標で見る
        const attr = R(".maplibregl-ctrl-attrib");
        return { ov, big, h: innerHeight,
          inViewport: !!ov && ov.t >= 0 && ov.b <= innerHeight,
          // ⚠ 写真の**すぐ下**。中ではない（2026-08-17 に外へ出した）
          underBig: !!ov && !!big && ov.t >= big.b && ov.t - big.b <= 20,
          sameRail: !!ov && !!big && Math.abs(ov.l - big.l) <= 1,
          overZoom: hit(ov, R(".zoombar")),
          // ⚠ **写真の中に載っているもの**が、帰属表示を隠していないか。
          //   隠す危険があるのは「重ねる」（外に出した）ではなく ＋− のほう。
          //   実測（2026-08-17）: ＋− の底を 34px にしていたら − の下端と帰属の上端が
          //   ぴったり接し、オーナーが「国土地理院と − のボタンが被る」と報告した。
          zoomOverAttr: hit(R(".zoombar"), attr), attrThere: !!attr,
          // 接しているのも駄目。何px 空いているかを返す
          zoomGap: (() => { const z = R(".zoombar");
            return z && attr ? Math.round(attr.t - z.b) : null; })(),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      const out = [];
      // ⚠ PC でも見えることが今回の要点。スマホだけ見ると、直したつもりで直っていない
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        // ⚠ **その大きさで読み込み直す**（2026-08-20。hidetzu/konjaku#122）。
        //   ⚠ 伸縮するだけでは、⚠ **写真が前の大きさの高さを保つ。**
        //   ⚠ 実際に穴だった: 写真の上限（縦の短い画面）を丸ごと外しても緑のままで、
        //     ⚠ **実機の読み込みでは 375×667 も 320×640 も画面から出ていた**
        //     （重ねる下端 671/667・655/640）。⚠ **伸縮は実機の代わりにならない。**
        await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        await waitStrip(page);
        await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
        // ⚠ **読み込み直したら、見る状態も作り直す。**
        //   写真の年代（1936–42）へ移し、⚠ **地図を載せる**（帰属表示は地図が載って初めて出る）
        await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
        await settleAfterClick(page);
        await page.click("#zIn");
        await settleAfterClick(page);
        // ⚠ **帰属表示が出るまで待つ。**⚠ 地図は読み込み直しのたびに載せ直しになり、
        //   ⚠ **CI では出るまでに時間がかかる。**待たずに測ると、まだ画面の上のほうに
        //   ⚠ **前の位置の帰属表示が残っていて、−517px のような値が出る**（実際に CI で落ちた）。
        await page.waitForFunction(() => {
          const a = document.querySelector(".maplibregl-ctrl-attrib");
          return !!a && a.getBoundingClientRect().height > 0;
        }, null, { timeout: 60000 });
        await settleAfterCondition(page);
        const g = await geom();
        must(g.inViewport,
          `${w}×${h}: 重ねる操作が初期画面の外にある（y=${g.ov?.t}〜${g.ov?.b} / 画面 ${g.h}）`);
        // ⚠ **写真から離さない。** 押した結果（絵が変わる）が同時に見えている必要がある。
        //   以前は判定文の下にあり、押しても何が変わったか見えなかった。
        //   ⚠ 写真の**中**に戻すのも駄目。実測（2026-08-17 / 344×882 ZFold5 カバー）で
        //     写真が 278×209px しかなく、🔊・＋−・この行・国土地理院が全部載って窮屈だった。
        must(g.underBig,
          `${w}×${h}: 重ねる操作が写真のすぐ下にない（写真の下端 ${g.big?.b} / 操作の上端 ${g.ov?.t}）`);
        must(g.sameRail, `${w}×${h}: 写真と左端が揃っていない（写真 ${g.big?.l} / 操作 ${g.ov?.l}）`);
        must(await effOpacity(page, "#ovRow") > 0, `${w}×${h}: 重ねる操作が読めない`);
        must(!g.overZoom, `${w}×${h}: 重ねる操作がズームと重なっている`);
        // ⚠ **国土地理院の帰属表示を隠さない**（掟: 出典は隠さない）。
        must(g.attrThere, `${w}×${h}: 地図を載せたのに帰属表示が出ていない（この検査が何も見ていない）`);
        must(!g.zoomOverAttr, `${w}×${h}: ＋− が国土地理院の帰属表示に重なっている`);
        // 接するのも駄目。指で押すと隣に触る
        must(g.zoomGap >= 6,
          `${w}×${h}: ＋− と国土地理院の帰属表示が近すぎる: ${g.zoomGap}px（6px 必要）`);
        must(!g.overflowX, `${w}×${h}: 横にあふれている`);
        out.push(`${w}×${h}: 写真の下 ${g.ov.t - g.big.b}px／＋−と出典 ${g.zoomGap}px`);
      }
      return `明治期では出さない ／ ${out.join(" ／ ")}`;
    },
  },
  {
    // ⚠ チェックが入っていることと、画面に重なっていることは別。
    //   「重ねています」と書いてある横で、層の不透明度が 0 という状態を作らない。
    name: "重ねているかどうかを、言葉と層で食い違わせない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 層の不透明度は、画面の言葉ではなく地図そのものに聞く
      const op = () => page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      const st = () => page.locator("#ovState").textContent();

      // ⚠ この検査は以前、**正常時の実況**（「ONで地図に重ねます」「重ねています」）を
      //   文字列で要求していた。守っていたのは「言葉と層を食い違わせない」ことだが、
      //   実況をやめた（2026-08-17 オーナー判断: ラベルと合わせて 2 行になり読む量が増える）ので、
      //   **同じ意図を裏返して守る**: 正常なときは**何も言わない**こと＋層が言葉と食い違わないこと。
      //   ⚠ 「取れなかったときは言う」ほうは、次のケース（水域のタイルだけ拒まれたら）が見ている。
      // ⚠ 既定は入。まず切ってから、写真の年代へ移る
      //   （切ったまま引き継ぐので、移った先でも層は無い）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      const before = (await st()).trim();
      must(before === "", `切っているだけなのに、何か書いてある: 「${before}」`);
      // ⚠ この検査は以前「押していないのに、もう地図の層がある」を見ていた。
      //   状態を1つにして引き継ぐようにしたので、**入のまま移ってきたら層はある**のが正しい。
      //   ここでは直前に切ってから移っているので、層はまだ無い。
      must(await op() === null, "切ったまま移ってきたのに、もう地図の層がある");

      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"), null, { timeout: 60000 });
      await page.waitForFunction(() =>
        (typeof mapObj !== "undefined" && mapObj?.getPaintProperty("swale", "raster-opacity")) > 0,
        null, { timeout: 20000 });
      const onOp = await op();
      must(onOp > 0, `重ねたのに、層が ${onOp}`);
      const onTx = (await st()).trim();
      must(onTx === "", `正常に重なっているのに、実況が書いてある: 「${onTx}」`);

      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      const offTx = (await st()).trim();
      must(offTx === "", `切っただけなのに、何か書いてある: 「${offTx}」`);
      must(await op() === 0, `切ったのに、層が ${await op()} のまま`);
      return `切: 層 0／入: 層 ${onOp}／正常時は言葉を出さない（3 状態とも空）`;
    },
  },
  {
    // ⚠ 層があることと、水域が画面に出ていることは別（レビューで指摘された）。
    //   地図も写真も出せるのに、**水域のタイルだけ**拒まれる状態がある。
    //   ⚠ 逆に 404 は「その範囲は整備対象外」なので、失敗として扱ってはいけない。
    //     両方をこの1件で見る。
    name: "水域のタイルだけ拒まれたら、取れなかったと言う", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      // 判定を先に済ませる（判定できた土地でしか操作は出ない）
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      let denied = 0;
      await page.route(SWALE_ROUTE, (r) => { denied++;
        r.fulfill({ status: 403, contentType: "text/html", body: "403 Forbidden" }); });
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const bad = (await page.locator("#ovState").textContent()).trim();
      // ⚠ 前提が消えたら落とす。1本も拒めていないなら、この検査は何も確かめていない
      must(denied > 0, "水域のタイルを1本も拒めていない（検査の前提が消えた）");
      must(!bad.includes("重ねています"), `明治期を取れていないのに、重ねたと言っている: ${bad}`);
      // ⚠ **その文が1行に収まっていること。** 写真の上に置いているので、折り返したぶんだけ
      //   写真が隠れる。⚠ **この約束は長いあいだ 320px で破れていた**（2026-08-17 実測:
      //   「水域を読み込めませんでした」で札が 44px → 58px）。誰も見ていなかったので、ここで見る。
      for (const [w, h] of [[375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        const g = await page.evaluate(() => {
          const st = document.getElementById("ovState");
          const lh = parseFloat(getComputedStyle(st).lineHeight) || 15;
          return { rows: Math.max(1, Math.round(st.getBoundingClientRect().height / lh)),
            rowH: Math.round(document.getElementById("ovRow").getBoundingClientRect().height),
            t: st.textContent };
        });
        must(g.rows === 1,
          `${w}×${h}: 状態の文が ${g.rows} 行に折り返している（札 ${g.rowH}px）: 「${g.t}」`);
      }
      await page.setViewportSize({ width: 375, height: 667 });
      must(bad.includes("読み込めません"), `明治期を取れなかったことを言っていない: ${bad}`);
      must(await page.locator("#big.map-on").count() === 1,
        "水域が取れないだけなのに、地図ごと出なくなっている");

      // ⚠ 404（整備対象外）は失敗ではない。入れ直したら**何も言わない**状態に戻ること。
      //   ⚠ 以前は「重ねています」に戻ることを見ていた。正常時の実況をやめたので、
      //     同じ意図（404 を「読み込めなかった」に化けさせない）を**空に戻る**ことで守る。
      //   ⚠ 実測（2026-08-16 / MapLibre GL JS v5.24.0）では 404 で error 自体が飛んでこないので、
      //     ここが見ているのは**画面が何と言うか**であって、除外の条件式ではない
      //     （条件式を外しても、この検査は落ちない。確かめた）。
      await page.unroute(SWALE_ROUTE);
      let missing = 0;
      await page.route(SWALE_ROUTE, (r) => { missing++; r.fulfill({ status: 404, body: "" }); });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(500);
      await page.locator("#ovSwale").check();
      await page.evaluate(() => mapObj?.jumpTo(
        { center: [mapObj.getCenter().lng + 0.03, mapObj.getCenter().lat], zoom: 16 }));
      await page.waitForTimeout(3000);
      const gone = (await page.locator("#ovState").textContent()).trim();
      must(missing > 0, "404 を1本も返せていない（検査の前提が消えた）");
      must(gone === "",
        `整備対象外（404）を、読み込めなかったことにしている: 「${gone}」`);
      return `403 を ${denied} 本 → 「${bad}」／404 を ${missing} 本 → 「${gone}」`;
    },
  },
  {
    // ⚠ 地図が出せなかったときに「重ねています」と書くと、起きていないことを書くことになる。
    //   OFF と「出せなかった」を同じ顔にしない（掟: 取れなかったを、有ることにしない）。
    name: "地図を読み込めないときに「重ねています」と言わない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: async (page) => {
      await stubWikidata(page, []);
      await page.route("**/vendor/maplibre-gl.js", (r) => r.abort());
    },
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 重ねる相手は空中写真なので、写真の年代へ移ってから押す（明治期では出さない）
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      // ⚠ 「読み込んでいます…」のまま止まるのも失敗。**終わったと言うところ**まで待つ。
      //   待ち切れなかったときに Timeout とだけ出ると、何が起きたのか読めないので、
      //   いま画面に出ている言葉を添えて落とす。
      // ⚠ 正常時は何も言わなくなったので、「終わった」の合図は
      //   「読み込めませんでした」が出ること、そのもの
      const done = await page.waitForFunction(() =>
        /読み込めません/.test(document.getElementById("ovState")?.textContent ?? ""),
        null, { timeout: 30000 }).catch(() => null);
      const tx = (await page.locator("#ovState").textContent()).trim();
      must(done, `地図の読み込みは終わっているのに、状態が「${tx}」のまま止まっている`);
      must(!tx.includes("重ねています"), `地図が出せていないのに、重ねたと言っている: ${tx}`);
      must(tx.includes("読み込めません"), `地図が出せなかったことを言っていない: ${tx}`);
      // 判定そのものは巻き添えにしない
      const v = await page.locator("#verdict").textContent();
      must(v.includes("明治期"), "地図が出せないことで、判定まで消えている");
      return `地図を出せないとき: 「${tx}」／判定は残る`;
    },
  },
  {
    // ⚠ **読めなかった年代を、トップが黙って落とさない。**
    //   実測（2026-08-19・出島・利用者役 3 名。⚠ 実在の利用者ではない）:
    //     落とした版を見せると **3/3 が「その年代の写真は存在しない」と答えた**。
    //   ⚠ `/peel` は最初から残していた。同じ問いに 2 つの答えがあり、
    //     実描画が 2 回それで落ちていた（相手先が 1 回 404 を返さなかっただけで）。
    //   ⚠ **ここは 404 を落とすことも一緒に見る。**残すほうだけ見ると、
    //     「全部残す」に変えても緑になる。
    name: "読めなかった年代を、トップが黙って落とさない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`, group: "core",
    // ⚠ gazo3（1984–86）だけ落とす。⚠ gazo2 / gazo4 は 404 のまま（出島には無い）
    setup: (page) => page.route(/\/xyz\/gazo3\//, (r) => r.abort("timedout")),
    async check(page) {
      await waitVerdict(page);
      const r = await page.evaluate(() => ({
        yrs: [...document.querySelectorAll("#strip .f .yr")].map((e) => e.textContent.trim()),
        btn: document.querySelectorAll("#strip button.f").length,
        unread: [...document.querySelectorAll("#strip .f.unread")].map((e) => ({
          tag: e.tagName, yr: e.querySelector(".yr")?.textContent.trim() ?? null,
          dis: e.getAttribute("aria-disabled"),
          say: getComputedStyle(e.querySelector(".im.err"), "::after").content,
        })),
      }));
      // ⚠ 読めなかった 1984–86 が残っていること
      must(r.yrs.includes("1984–86"),
        `読めなかった年代を落としている（「無い」と読まれる）: ${r.yrs.join("/")}`);
      must(r.unread.length === 1 && r.unread[0].yr === "1984–86",
        `読めなかったコマが 1 つでない: ${JSON.stringify(r.unread)}`);
      // ⚠ 404 の年代（出島に写真が無い）は、いままでどおり出さない
      for (const gone of ["1979–83", "1987–90", "1936–42"])
        must(!r.yrs.includes(gone), `404 の年代 ${gone} まで出している: ${r.yrs.join("/")}`);
      // ⚠ 押しても何も起きないので、押せる見た目にしない（ADR 0026）
      must(r.unread[0].tag !== "BUTTON", `読めないコマが押せるままになっている: ${r.unread[0].tag}`);
      must(r.unread[0].dis === "true", `読めないコマが aria-disabled でない: ${r.unread[0].dis}`);
      // ⚠ こちらの都合を回線のせいに読ませない。⚠ 進行形にしない
      const say = r.unread[0].say;
      must(!/読み込め|通信|接続|中…|中$/.test(say), `原因を決めつける／進行形の言い方: ${say}`);
      must(/出せません/.test(say), `いま出せないことを言っていない: ${say}`);
      return `1984–86 が押せない枠として残り「${say.replace(/\\A/g, " ")}」／`
        + `押せるコマ ${r.btn}／404 の 3 年代は出ていない`;
    },
  },
  {
    // ⚠ **「動きを減らす」を入れている人に、動きだけを消す。**
    //   ⚠ 静的検査は媒体クエリが「ある」ことしか見られない。
    //     ⚠ **効いているか**は、計算後の値を読まないと分からない。
    name: "「動きを減らす」を入れると、自前の動きが残らない", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "reduce" }),
      // ⚠ **実際に渡している値を記録する。**受け口は素のスクリプトの中にあって
      //   window から呼べない。呼べないものを「確認済み」と言わないための記録。
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      // ⚠ **「判定中…」を除く**（除かないと判定中に素通りする。上と同じ）。
      await page.waitForFunction(
        () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                return t.length > 3 && !t.includes("判定中"); },
        null, { timeout: 90000 });
      const r = await page.evaluate(() => {
        const sec = (v) => v.split(",").map((x) => x.trim())
          .map((x) => x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x));
        const out = [];
        // ⚠ 自前の宣言を持つ要素を、実際に DOM から拾う（決め打ちしない）
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          for (const [k, v] of [["transition", st.transitionDuration], ["animation", st.animationDuration]])
            for (const d of sec(v || "0s"))
              if (d > 0.01) out.push(`${k} ${d}s ${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 24)}`);
        }
        return { slow: [...new Set(out)].slice(0, 6), n: out.length,
                 mq: matchMedia("(prefers-reduced-motion: reduce)").matches };
      });
      must(r.mq, "ブラウザ側で「動きを減らす」になっていない（この検査が何も見ていない）");
      must(r.n === 0, `動きが残っている ${r.n} 件: ${r.slow.join(" / ")}`);
      // ⚠ 寄せる操作も滑らかにしない。**実際に押して、渡った値を読む**
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      // ⚠ 1 件も起きていないなら、この検査は寄せる操作を見ていない。**起きたことを要求する**
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "auto"),
        `寄せる操作が滑らかなまま: ${JSON.stringify([...new Set(siv)])}`);
      return `自前の動き 0 件（transition / animation とも 0.01s 以下）`
        + `／寄せる操作 ${siv.length} 件はすべて auto`;
    },
  },
  {
    // ⚠ **動きを減らしていない人の見え方を変えない。**
    //   ⚠ 「動きを消した」検査だけだと、**全部消してしまっても緑**になる。
    name: "「動きを減らす」でない人には、いままでの動きが残る", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "no-preference" }),
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      // ⚠ **「判定中…」を除く**（除かないと判定中に素通りする。上と同じ）。
      await page.waitForFunction(
        () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                return t.length > 3 && !t.includes("判定中"); },
        null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        lyr: getComputedStyle(document.querySelector(".big .lyr")).transitionDuration,
        bigIn: getComputedStyle(document.querySelector(".big-in")).transitionDuration,
      }));
      // ⚠ 実測値そのもの。丸めない
      must(r.lyr === "0.28s", `年代の重なりが 0.28s でない: ${r.lyr}`);
      must(r.bigIn === "0.35s", `写真の寄せが 0.35s でない: ${r.bigIn}`);
      // ⚠ 寄せる操作も、いままでどおり滑らかであること。
      //   ⚠ これが無いと、**全部 auto にしてしまっても**上の検査は通る
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "smooth"),
        `動きを減らしていないのに滑らかでない: ${JSON.stringify([...new Set(siv)])}`);
      return `年代の重なり ${r.lyr}／写真の寄せ ${r.bigIn}／寄せる操作 ${siv.length} 件は smooth（いままでどおり）`;
    },
  },
  {
    // ⚠ ここが穴1の再発点。配り方を z12 に束ねたので、
    //   「束のファイルはある」が「その z14 は見ていない」という状態が生まれる。
    //   束があることを理由に答えてしまうと、**見ていない地面について断定する**。
    //   実測で選んだ点: 束 3588/1626 は mask に1ビットしか立っておらず、
    //   z14 14352/6504 は一度も問い合わせていない（大阪・此花の隣）。
    name: "束はあっても、見ていない区画では答えない",
    path: "/?ll=34.73258,135.36255&q=%E6%9C%AA%E8%A6%8B%E3%81%AE%E5%8C%BA%E7%94%BB",
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期のコマは年で絞れないので、写真の年代へ移ってから見る
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      // 束のファイルは取りに行ってよいが、**それを答えにしない**
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "見ていない区画なのに、束があることを理由に答えている");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `見ていない地面について断定している: 「${w}」`);
      return `束はあるが未問い合わせ → 外へ出て、落ちているので「分かっていません」`;
    },
  },
  {
    // ⚠ 「取り込んでいない」と「調べたが無い」を混ぜない
    name: "未整備の土地では、取り込み済みのふりをしない", path: `/?${UNSURVEYED}`,
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 未整備なので外へ出る（そして落としてあるので、取れなかったと言うはず）
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "未整備なのに外へ取りに行っていない（静的の欠けを、答えとして出している）");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `断定している: 「${w}」`);
      return `未整備なので外へ出る → 落ちているので「分かっていません」`;
    },
  },
];
