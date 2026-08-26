// 実描画 — さかのぼる（深掘りの再生）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 14 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **2 つの塊を集めた**（⚠ 6 件の連続 ＋ ⚠ 離れた 1 件）ので、⚠ **並びは動く。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **ここが守っているもの**（⚠ どれも ⚠ **再生している最中に何が言えるか**）:
//     出典     ⚠ **開かなくても画面に出ている**（⚠ 地理院タイルは出典明示が利用の条件）
//     押せる   ⚠ **ズームが見えて、⚠ 指で押せる**（⚠ 黒地に黒で「存在すら見えない」を踏んでいる）
//     3D       ⚠ **事前計算があるなら Overpass を叩かない**
//     判定不能 ⚠ **割合を出さない。**⚠ **出せないのが「建物ごと」だと書く**
//     通信断   ⚠ **事前計算の建物区分は出す。**⚠ **「データがありません」と断定しない**
//     403      ⚠ **同上**（⚠ 拒まれたことを「無い」に変えない）
//     地表だけ ⚠ **地表が届いていないのに「実測」と言わない**
//
// ⚠ **`peel-unreachable.mjs` と近いが、⚠ 問いが違う。**
//   ⚠ あちらは ⚠ **断りの文が正しいか。**⚠ こちらは ⚠ **再生そのものが成り立つか**
//   （⚠ 落ちても、⚠ 事前計算で成り立つ範囲は出し続ける）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, SAPPORO, LIES, GSI_ROUTE, PHOTO_ROUTE, peelReady, settleAfterCondition, SWALE_ROUTE, forbid, must, assertToyosu3dAnswer, provText } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **出典明示は利用の条件であって、飾りではない。**
    //   国土地理院タイル: 出典明示が利用の条件
    //   OpenStreetMap:   ODbL でクレジット必須
    //   /peel は空中写真と建物を**全面に**出している画面。
    //
    // ⚠ 実際に破れていた（2026-08-17。UI/UX レビュー役の指摘 → 実測で確定）:
    //   ・`attributionControl:false` ＋ CSS の `display:none!important` で地図側の帰属を消していた
    //   ・手書きの出典は**左パネルの中**。パネルはスマホで閉じて始まる（panelOpen=!isNarrow）
    //   ・実測: PC 1280×800 で y=920（画面外 120px 下）／375×667 は閉じたパネルの中
    //   ・直したあとも、一度は **#hud（z-index 12）の裏**に隠れていた
    //   ・OSM の建物データに `attribution` が無く、ODbL のクレジットが出ていなかった
    //
    // ⚠ **「ある」と「見えている」は別。** `checkVisibility()` は
    //   閉じたパネルの中でも true を返した。
    // ⚠ `elementFromPoint` でも駄目だった（2026-08-17 に壊して気づいた）。
    //   `#hud` は `pointer-events:none` なので**当たり判定に出てこない**。
    // ⚠ 画素で見比べるのも駄目だった。**3D 地図は常に描き直している**ので、
    //   HUD を消していなくても絵が変わる（同じ条件で 2 枚撮っても一致しない）。
    //   → **矩形の交差で見る。** HUD の中で地色や枠線を持つ板が、
    //     帰属表示の枠に 1px でも重なっていないこと。
    //   ⚠ 実際に守っているのは z-index ではなく **HUD の下の余白**。
    //     余白を削ると板が下りてきて重なる。だからここが本当の見張り。
    name: "さかのぼる（出典が、開かなくても画面に出ている）", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      // ⚠ 3 幅で見る。狭い幅は板が増えて裏に入りやすい
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib");
          if (!at) return { there: false };
          const b = at.getBoundingClientRect();
          const text = at.innerText.replace(/\s+/g, " ").trim();
          // その座標を占めているのは帰属表示自身か（裏に隠れていないか）
          const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
          const top = document.elementFromPoint(cx, cy);
          // ⚠ パネルを開かないと読めないものは、出典として数えない
          const panel = document.getElementById("panel");
          const inPanel = !!panel && panel.contains(at);
          return { there: true, text,
            inView: b.top >= 0 && b.bottom <= innerHeight && b.width > 0 && b.height > 0,
            covered: !(top && (at === top || at.contains(top))),
            coveredBy: top ? (top.id || String(top.className) || top.tagName) : "",
            inPanel, w: Math.round(b.width), h: Math.round(b.height) };
        });
        must(r.there, `${w}×${h}: 地図の帰属表示が無い（出典明示は利用の条件）`);
        must(r.inView, `${w}×${h}: 帰属表示が画面の外にある`);
        // ⚠ HUD の板が、帰属表示の枠に重なっていないこと
        // ⚠ **切られている分は数えない**（2026-08-21。hidetzu/konjaku#152）。
        //   ⚠ `#hud` は `overflow-y:auto` の箱で、⚠ **中身が入りきらないときは中でスクロールする。**
        //     ⚠ そのとき子の矩形は箱の外まで伸びるが、⚠ **画面には出ていない**（切られている）。
        //   ⚠ 実測（375×667）: `#timePanel` の矩形が y518–643 で、⚠ 帰属（y643）と当たったが、
        //     ⚠ **箱は y354–641 で、⚠ 641 より下は描かれていない。**
        //   ⚠ **見たいのは「⚠ 実際に上に塗っているか」**なので、⚠ 箱で切ってから比べる。
        const over = await page.evaluate(() => {
          const at = document.querySelector(".maplibregl-ctrl-attrib").getBoundingClientRect();
          const hud = document.getElementById("hud").getBoundingClientRect();
          const hits = [];
          for (const e of document.querySelectorAll("#hud *")) {
            const b = e.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) continue;
            const cs = getComputedStyle(e);
            // 地色も枠線も無いものは、上に塗らないので数えない
            if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderTopWidth === "0px") continue;
            // ⚠ **箱で切る**（⚠ 見えている分だけを相手にする）
            const r = { left: Math.max(b.left, hud.left), right: Math.min(b.right, hud.right),
              top: Math.max(b.top, hud.top), bottom: Math.min(b.bottom, hud.bottom) };
            if (r.right - r.left < 2 || r.bottom - r.top < 2) continue;
            if (r.left < at.right && at.left < r.right && r.top < at.bottom && at.top < r.bottom)
              hits.push(`<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : "." + String(e.className).split(" ")[0]}>`
                + ` 見えている分 y=${Math.round(r.top)}..${Math.round(r.bottom)}`);
          }
          return hits;
        });
        must(!over.length,
          `${w}×${h}: 帰属表示に HUD の板が重なっている: ${over.join(" ／ ")}`);
        must(!r.inPanel, `${w}×${h}: 帰属表示が畳めるパネルの中にある（閉じると消える）`);
        // ⚠ 名前を字で確かめる。控えを表示していても、名前が出ていなければ意味がない
        must(r.text.includes("国土地理院"), `${w}×${h}: 国土地理院が出ていない: 「${r.text}」`);
        must(/OpenStreetMap/.test(r.text), `${w}×${h}: OpenStreetMap が出ていない: 「${r.text}」`);
        must(/©/.test(r.text), `${w}×${h}: ODbL のクレジット（©）が出ていない: 「${r.text}」`);
        out.push(`${w}×${h}: ${r.w}×${r.h}px`);
      }
      // ⚠ **中央（いま調べている地点）を覆っていないこと。** 帰属表示の場所を作るために
      //   HUD を押し上げると、そこが隠れる。375×667 で見る
      //   （⚠ 320×640 は**もともと覆っている別の不具合**があるので、ここでは見ない）
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(700);
      const hud = await page.evaluate(() =>
        ({ top: Math.round(document.getElementById("hud").getBoundingClientRect().top),
           mid: Math.round(innerHeight / 2) }));
      must(hud.top > hud.mid,
        `375×667: HUD が画面中央（調べている地点 y=${hud.mid}）を覆っている: HUD 上端 ${hud.top}`);
      return `国土地理院・© OpenStreetMap contributors が、開かなくても画面に出ている`
        + `（${out.join(" ／ ")}）／HUD 上端 ${hud.top} は中央 ${hud.mid} より下`;
    },
  },
  {
    // ズームは暗いパネルに載せたせいで黒地に黒になり、実測でボタンの存在すら見えなかった
    name: "さかのぼる（ズームが見えて、指で押せる）", path: `/peel?${TOYOSU}`,
    viewport: { width: 390, height: 844 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll(".maplibregl-ctrl-group button").length > 0,
        null, { timeout: 45000 });
      const btns = await page.$$eval(".maplibregl-ctrl-group button", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        const icon = e.querySelector(".maplibregl-ctrl-icon");
        return { w: Math.round(r.width), h: Math.round(r.height),
                 filter: icon ? getComputedStyle(icon).filter : "none" };
      }));
      must(btns.length >= 2, `ズームボタンが無い: ${btns.length}`);
      const small = btns.filter((b) => b.w < 44 || b.h < 44);
      must(!small.length, `指の当たり判定が 44×44 に届かない: ${JSON.stringify(small)}`);
      // 暗い地図の上に濃いアイコンをそのまま置かないこと
      must(btns.every((b) => b.filter !== "none"),
        `アイコンが反転していない（黒地に黒になる）: ${JSON.stringify(btns.map((b) => b.filter))}`);
      return `${btns.length} 個すべて ${btns[0].w}×${btns[0].h}／アイコン反転あり`;
    },
  },
  {
    name: "さかのぼる（3D）", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 水域ポリゴンはタイルを読んで自前で生成する。ここが動かないと作品として成立しない
      // 水域は低湿地タイルを読んで自前で起こす。件数が画面に出るのでそれを待つ
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      //   ⚠ **待っているのは「水域を起こせたこと」**。⚠ **答えが描けたことで見る。**
      await peelReady(page);
      // 建物まで揃うのを待つ。事前計算データがある範囲なので Overpass には出ない。
      // 建物データが画面に出ることが、作品の成立条件（掟: 取れなかったを「無い」と言わない）。
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      await page.waitForFunction(
        () => /\d+\s*件\s*の建物が、この範囲にあります/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const ms = Math.round(await page.evaluate(() => performance.now()));
      // 事前計算データがある範囲では Overpass を叩かない。
      // 本番で 504／無応答が常態のものを、作品の成立条件に置かない（掟: 取れなかったを「無い」と言わない）
      const op = reqs.filter((u) => u.includes("overpass"));
      must(!op.length, `事前計算データがあるのに Overpass を叩いている: ${op[0]}`);
      // ⚠ **水面の面数は「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ 水域ポリゴンが実際に起こされたこと）。⚠ 読む場所だけ変えた。
      // ⚠ **判定の結果（#status）と、由来（#prov）は別の節**になった。⚠ **両方を読む。**
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側と台帳を読む。**
      const provTxt = await provText(page);
      const landTxt = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const water = Number(provTxt.match(/(\d+)\s*面を起こしたもの/)?.[1] ?? 0);
      must(water > 0, `水域ポリゴンが生成されていない（${provTxt.slice(0, 80)}）`);
      const bld = Number(landTxt.match(/(\d+)\s*件\s*の建物が/)?.[1] ?? 0);
      must(bld > 0, `建物が出ていない（${landTxt.slice(0, 80)}）`);
      // ⚠ **「事前に取り込んだ」は、⚠ 取り込んだ日が言う**（2026-08-22。`sourceRow`）。
      //   ⚠ **主張は同じ**（⚠ 実行時に外へ出て集めたものではないこと）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(provTxt),
        `事前に取り込んだデータを使っていない（${provTxt.slice(0, 100)}）`);
      // ⚠ パネルの答えは #landAll（層）へ移った。⚠ 見ている主張は変えていない
      const hero = await page.locator("#landAll").textContent({ timeout: 45000 });
      const cap = hero;
      assertToyosu3dAnswer(hero, cap, "3D");
      // ⚠ ここは長いあいだ、読んで報告に印字するだけで assert が無かった。
      //   08ce46f で潰した「測っていないことを報告する」と同じ形が、
      //   いちばん重要な case に残っていた（2026-08-14 検証者の指摘）。
      const era = (await page.locator("#timePanel .y").textContent()).trim();
      must(era.length > 0, "年代の見出しが空");
      // 着いたときは「現在」側。ここが別のものになったら、名前と中身が食い違っている
      must(era === "現在", `3D に着いた時点の見出しが「現在」でない: 「${era}」`);
      // 通常時は地表の行が「実測」を名乗ること。タイル到達の判定を入れた副作用で
      // ここが未取得のまま固まっていないかを見る（ms の後で測り、性能の数字は汚さない）
      await page.waitForFunction(
        () => [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .some((e) => /地表/.test(e.textContent ?? "") && e.className.includes("ok")),
        null, { timeout: 30000 });
      const msGround = Math.round(await page.evaluate(() => performance.now()));
      // ⚠ **地表は第2層の材料**（2026-08-22）。⚠ **`.prov-q .prov` の最初は第1層。**
      //   ⚠ **札（実測 / 未取得）は消した**（Owner 判断: ⚠ 色で伝わる）。⚠ **字で見る。**
      const ground = await page.evaluate(() =>
        [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((e) => /地表/.test(e.textContent ?? ""))?.textContent ?? "");
      must(/そのもの/.test(ground) && /加工なし/.test(ground),
        `地表の実測表示が出ていない: ${ground.trim().slice(0, 40)}`);
      return `${hero.trim()} ／ 建物 ${bld} 件 ／ 水域 ${water} 面 ／ 年代 ${era.trim()}`
        + ` ／ Overpass 0 回 ／ 建物が揃うまで ${ms}ms ／ 地表タイル到達 ${msGround}ms`;
    },
  },
  {
    // 明治期のデータが無い土地。ここで「0.0% — 1408件すべてを判定した実測値」と
    // 書いていた。測れていないものを測定値として出さない（掟: 取れなかったを「無い」と言わない）。
    name: "さかのぼる（判定できない土地）", path: `/peel?${SAPPORO}`,
    async check(page) {
      await page.waitForFunction(() => document.querySelector("#map canvas"), null, { timeout: 45000 });
      // 集計が出るところまで待つ（建物は Overpass 頼みで遅いので、そこは待たない）
      await page.waitForFunction(
        () => (document.getElementById("landAll")?.textContent ?? "").trim().length > 0,
        null, { timeout: 60000 });
      // 地形分類は建物の集計とは別に取りに行くので、後から届く。待つ。
      await page.waitForFunction(
        () => /この土地は/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      // ⚠ **建物の層が決着するまで待つ**（2026-08-23 に CI で踏んだ）。
      //   ⚠ **`/建物/` では足りない。**⚠ **「建物を取得しています」にも一致する**ので、
      //     ⚠ **途中で通り抜けて、⚠ 「建物ごとには出せません」がまだ無い状態で読む。**
      //   ⚠ **手元は速いので揃っていた。**⚠ **CI は遅いので追い越した**（`peelReady` と同じ形）。
      await peelReady(page);
      const hero = (await page.locator("#landAll").textContent()).trim();
      // ⚠ 見ているのは「**割合を作らない**」（0% を出さない）。
      //   ⚠ 建物の件数のような**実際に数えた数**は出してよい（同種の札幌の検査と同じ書き方）。
      must(!/\d+\.\d+\s*%/.test(hero), `判定できない土地で割合を出している: ${hero.slice(0, 80)}`);
      // 建物ごとの割合は出せない。それを「何も分からない」と混ぜないこと（掟: 主題は「成り立ち」。明治期は手法のひとつ）
        // ⚠ 出せないのが**建物ごと**であること（何もかも駄目ではない）。
        //   ⚠ 層になって言い方が変わった（第3層の欠落として、その位置に出る）。
        //   ⚠ 見ている主張は変えていない: **範囲を限っていること**。
        must(/建物ごとには出せません|1 件ずつの足元は判定できていません|建物ごとの判定は/.test(hero),
        `出せないのが「建物ごと」であることが書かれていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      must(!cap.includes("実測値"), `判定していないのに「実測値」と書いている: ${cap.slice(0, 50)}`);
      // 土地そのものには答えられる。ここで黙ると、建物が出ているのに終わってしまう
      must(/この土地は .+/.test(cap), `地形分類が出ていない: ${cap.slice(0, 80)}`);
      must(/整備対象外|読み込め/.test(cap),
        `明治期が取れていないことを言っていない: ${cap.slice(0, 80)}`);
      const status = (await page.locator("#status").textContent()).trim();
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 34)}`;
    },
  },
  {
    // 建物の明治期区分は事前計算アセットから出るため、GSI通信断でも表示できる。
    // 実行時のラスタ通信に依存していないことを確かめる。
    name: "さかのぼる（通信断）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "通信断でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `通信断なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
    },
  },
  {
    // ⚠ 0.0% の再来を止める。403 を不在に丸めていた頃は、拒まれた土地で
    //   「1408件すべてデータなし」→ **0.0% を「実測値」として**出していた
    //   （掟: 取れなかったを「無い」と言わない の元になった事故そのもの）。
    name: "さかのぼる（403）", path: `/peel?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      // ⚠ **建物の層が入るまで待つ。**#status の「読み込めませんでした」で待つと、
      //   ⚠ **水域が落ちた時点で通ってしまい、建物より先に #landAll を読む**。
      //   ⚠ 2026-08-20 に踏んだ: 豊洲だけの事前生成の水域を外したことで、
      //     水域の失敗が建物より**先に**出るようになり、この検査が空の見出しを読んだ。
      //   ⚠ **見ている主張は変えていない。**「事前に取り込んだ建物の区分が出る」を
      //     見たいのだから、⚠ **それが出たことを待つのが正しい。**
      await page.waitForFunction(
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const hero = (await page.locator("#landAll").textContent()).trim();
      must(hero.length > 0, `事前計算の建物区分が表示されていない: ${hero}`);
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "403でも3D");
      const status = (await page.locator("#status").textContent()).trim();
      must(!status.includes("データがありません"),
        `403 なのに「データがありません」と断定している: ${status.slice(0, 60)}`);
      return `見出し「${hero}」／${cap.replace(/\s+/g, " ").slice(0, 30)}／事前計算値を表示`;
    },
  },
  {
    // ⚠ 「いま画面に出ているもの」の地表の行は無条件だった。ラスタが1枚も
    // 届いていなくても「実測 地表はその年代の空中写真そのもの」と書いていた。
    // 水面（waterRead）と建物（total）にはガードがあり、地表だけ素通り。
    // 取れなかったものを「実測した」と言う、掟: 取れなかったを「無い」と言わない の根そのもの。
    name: "さかのぼる（地表タイルだけ落とす）", path: `/peel?${TOYOSU}`,
    setup: (page) => page.route(PHOTO_ROUTE, (r) => r.abort()),
    async check(page) {
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      await page.waitForFunction(
        () => /\d+\s*件\s*の建物が、この範囲にあります/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 60000 });
      const prov = await provText(page);
      must(!prov.includes("そのもの"),
        `地表が届いていないのに「実測」と言っている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      // ⚠ **台帳は問いごとに配られた**（2026-08-22。⚠ `#prov` は無い）。
      //   ⚠ **地表は第2層の材料。**⚠ **`.prov-q .prov` の最初は第1層（区分の出どころ）**
      //     （⚠ 2026-08-23 に踏んだ。⚠ 「`prov ok`」を見て落ちた）。
      const g = await page.evaluate(() => {
        const e = [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((x) => /地表/.test(x.textContent ?? ""));
        return e ? { cls: e.className, txt: (e.textContent ?? "").replace(/\s+/g, " ").trim() }
                 : { cls: "", txt: "" };
      });
      const cls = g.cls, txt = g.txt;
      must(txt, "地表の行が第2層に無い");
      must(cls.includes("no"), `地表の行が「取れていない」表示になっていない: ${cls} / ${txt}`);
      // ⚠ **札（未取得 など）は消した**（2026-08-22。Owner 判断: ⚠ 色で伝わる）。
      //   ⚠ **主張は「⚠ 取れなかったと分かること」。**⚠ **字で言っているかを見る。**
      must(/届いていない/.test(txt), `取れなかったことを字で言っていない: ${txt.slice(0, 60)}`);
      // 断定もしない。届かなかっただけで、その年代の写真の有無は分かっていない
      const lie = LIES.find((w) => txt.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${txt.slice(0, 50)}`);
      // 落としたのは写真タイルだけ。水面・建物は従来どおり出ること
      // （地表のガードが他の行まで巻き添えにしていないかを、ここで見る）
      must(prov.includes("実際の水域"), `水面の行まで落ちている: ${prov.replace(/\s+/g, " ").slice(0, 60)}`);
      const hero = (await page.locator("#landAll").textContent()).trim();
      const cap = hero;   // ⚠ 層になり、見出しと補足が同じ入れ物に入る
      assertToyosu3dAnswer(hero, cap, "地表タイル断でも3D");
      return `${txt.slice(0, 34)}／土地区分と水域補足（${hero}）は従来どおり`;
    },
  },
];
