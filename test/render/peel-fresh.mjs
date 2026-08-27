// 実描画 — 古い結果で、いまの画面を上書きしない（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 22 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 4 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **`change-review` §4「非同期の結果の鮮度」が見ているもの、⚠ その実描画側。**
//   ⚠ **この画面は、⚠ 待っているあいだに前提が変わる。**
//   ⚠ **地点を変える・年代を動かす・パネルを開くは、⚠ 待ち時間より速い。**
//
// ⚠ **ここが守っているもの**:
//     追い越し   ⚠ **前の場所の結果が、⚠ あとから今の場所を上書きしない**
//                （⚠ `loadArea` は 7 つの `await` を挟んでから書く。⚠ 番人が要る）
//     組み直し   ⚠ **同じ段の中で動かしただけなら、⚠ 根拠を組み直さない**
//                ⚠ **段が変われば、⚠ 必ず組み直す**（⚠ 両方向を見る）
//     戻れる     ⚠ **スマホの根拠は全画面で読み、⚠ 閉じれば地図に戻る**
//     端まで     ⚠ **狭い幅の年代は、⚠ ものさしで全体が見え、⚠ 端まで届く**
//
// ⚠ **確かめ方は「読む」ではなく「入れ替える」**（`change-review` §4）。
//   ⚠ **遅らせて、⚠ 順序を逆にして、⚠ 実際に起きるかを見る。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, NAGOYA_LL, peelReady, settleAfterCondition, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **古い呼び出しが、あとから新しい結果を上書きしないこと。**
    //   loadArea は 7 つの await を挟んでから area / statusEl / 地図のデータを書く。
    //   2026-08-18 まで seq は取るだけで一度も見ておらず、番人が居なかった。
    //   ⚠ 押せる経路がある: 低湿地データが読めないと再試行ボタンが出るが、
    //     そのとき建物の問い合わせは最大 20 秒待っている最中で、その間ずっと押せる。
    // ⚠ 相手先の速さに任せない。**こちらで 6 秒遅らせて**、確実に追い越させる。
    name: "前の場所の結果が、あとから今の場所を上書きしない", path: `/peel?${NAGOYA_LL}`,
    // ⚠ glob の `(a|b)` は選択にならない。URL 述語で書く（過去に一度踏んでいる）
    setup: (page) => page.route((u) => /overpass/.test(u.href), async (r) => {
      await new Promise((k) => setTimeout(k, 6000));
      // ⚠ **印は、⚠ 返す前に立てる**（2026-08-23）。
      //   ⚠ **移ったあとの要求は、⚠ ページ側が捨てているので `fulfill` が失敗する。**
      //   ⚠ **後ろに置くと、⚠ 例外で印まで到達しない**（⚠ 実測: 30 秒待っても立たなかった）。
      //   ⚠ **前はページの中へ `evaluate` で書いていた。**⚠ **ルートハンドラの中で
      //     ⚠ `evaluate` を待つのは壊れやすい。**⚠ **Node 側で持つ。**
      page.__staleReplied = true;
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ elements: [] }) }).catch(() => {});
    }),
    async check(page, reqs) {
      // ① 名古屋が、建物の問い合わせで待ち始めるまで待つ
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      // ⚠ **「建物を取得しています」だけでは早すぎる**（2026-08-23 に踏んだ）。
      //   ⚠ **その字は、⚠ Overpass へ出る前から立つ。**⚠ **移すのが早すぎて、
      //     ⚠ 古い要求が 1 本も出ないまま**だった（⚠ 実測: Overpass 要求 0 本）。
      //   ⚠ **要求が実際に出たことを待つ**（⚠ そうでないと、⚠ この検査は何も見ていない）。
      await page.waitForFunction(
        () => /建物を取得しています|建物を取得中/.test(
          document.getElementById("landAll")?.textContent ?? ""),
        null, { timeout: 30000 });
      for (let i = 0; i < 300 && !(reqs ?? []).some((u) => /overpass/i.test(u)); i++)
        await page.waitForTimeout(100);
      must((reqs ?? []).some((u) => /overpass/i.test(u)),
        "名古屋が Overpass へ出ていない（古い要求が作れないので、この検査は何も見ていない）");
      // ② 待っている最中に、別の場所へ移る（＝再試行を押したのと同じ形）
      await page.evaluate(() => { loadArea(139.7975, 35.6548, "東京都江東区豊洲"); });
      await page.waitForFunction(
        // ⚠ **出そろってから比べる。**層は別々に返るので、途中で読むと
        //   「あとから第1層が増えた」のを上書きと取り違える（実測 2026-08-19）。
        //   ⚠ 見ている主張は変えていない: **古い呼び出しが今の答えを消さないこと**。
        // ⚠ **PC で答えを持つのは #landAll（パネル）**（2026-08-20。hidetzu/konjaku#131）。
        //   ⚠ #land は HUD で、⚠ **パネルが開いているあいだは描かれない。**
        //   ⚠ 見ている主張は変えていない: **古い呼び出しが今の答えを消さないこと**。
        // ⚠ **字を変えた**（2026-08-23）: 「N / M件の足元を判定」→「足元（…）を判定できた N 件のうち」。
        //   ⚠ **待っているものは同じ**（⚠ 建物の区分が入ったこと）。
        () => /足元[^。]*を判定できた/.test(document.getElementById("landAll")?.textContent ?? "")
          && typeof landform !== "undefined" && landform !== null,
        null, { timeout: 60000 });
      // ⚠ **PC ではパネル（#landAll）が答えを持つ**（同上）
      const mid = await page.locator("#landAll").textContent();
      // ③ ⚠ **古い呼び出しの返事が、実際に返ってくるまで待つ。**
      //   ⚠ 決め打ちの秒数ではなく、返ったことを見る（上の印）。
      //   ⚠ **返る前に読むと、この検査は何も見ていないことになる**
      for (let i = 0; i < 300 && !page.__staleReplied; i++) await page.waitForTimeout(100);
      if (!page.__staleReplied) {
        const op = (reqs ?? []).filter((u) => /overpass/i.test(u));
        must(false, `古い呼び出しの返事が返ってこない（Overpass 要求 ${op.length} 本: ${op.slice(0, 2).join(" / ")}）`);
      }
      // ⚠ **ここは 300ms では足りない。**印が立つのは「返した」時点で、
      //   ⚠ **上書きするかもしれない側の処理は、そのあとに走る**。
      //   ⚠ 早く読むと「上書きされなかった」ではなく「まだ上書きしていない」を見てしまう
      await page.waitForTimeout(1000);
      const land = await page.locator("#landAll").textContent();
      const status = await page.locator("#status").textContent();
      must(/足元[^。]*を判定できた/.test(land),
        `前の場所の返事が、いまの答えを消した: ${land.replace(/\s+/g, " ").slice(0, 80)}`);
      must(land.replace(/\s+/g, "") === mid.replace(/\s+/g, ""),
        `答えが書き換わった: ${mid.replace(/\s+/g, " ").slice(0, 60)} → ${land.replace(/\s+/g, " ").slice(0, 60)}`);
      must(!/まだ用意できていません|建物ごとには出せません|OSM に登録された建物は 0 件/.test(status),
        `前の場所の説明が、いまの場所の欄に出ている: ${status.replace(/\s+/g, " ").slice(0, 90)}`);
      return `名古屋が 6 秒待っている最中に豊洲へ移り、返事が返ったあとも `
        + `${land.replace(/\s+/g, " ").trim().slice(0, 40)}／説明も豊洲のまま`;
    },
  },
  {
    // 描画は「変わる速さ」で分けてある（peel3d.js の paint / describe）。
    // ⚠ 分ける前の実測（2026-08-18・豊洲・1280×900）:
    //   再生 1 回（11.1 秒）で台帳（17 要素）を **299 回**作り直していた。
    //   段は 9 つしかないので、298 回は同じものを組み直していたことになる。
    //
    // ⚠ **「作り直さない」だけを見ると、更新を止めても緑になる。**
    //   だから 2 つを対にして見る:
    //     同じ段の中で動かす → 作り直さない（言葉は変わらないので）
    //     隣の段へ移る       → 必ず作り直す（言葉が変わるので）
    //   片方だけでは、どちらの壊れ方も見つけられない。
    name: "同じ段で動かしても根拠は組み直さず、段が変われば必ず組み直す", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ 地表のタイルが届くと台帳は**正しく**組み直る。数え始める前に落ち着かせる
      await page.waitForTimeout(4000);
      const watch = () => page.evaluate(() => {
        window.__provHits = 0;
        window.__provObs?.disconnect();
        window.__provObs = new MutationObserver((rs) => { window.__provHits += rs.length; });
        // ⚠ **段で変わるのは第2層の材料**（⚠ 「地表はその年代の空中写真そのもの」）。
        //   ⚠ **第3層（建物）は段に依らない**ので、⚠ **そちらを見ると必ず 0 回になる**
        //     （⚠ 2026-08-23 に踏んだ。⚠ **「組み直していない」が理由もなく緑**）。
        window.__provObs.observe(document.querySelector('#panel .prov-q[data-q="2"]'),
          { childList: true, subtree: true, characterData: true });
      });
      // ⚠ **数えるのは、動かし終えて 1 呼吸おいてから。** MutationObserver の通知は
      //   マイクロタスクなので、同じ evaluate の中で読むと**必ず 0**になる。
      //   最初これで書いて、「組み直していない」が理由もなく緑になった（2026-08-18）。
      const scrub = async (from, to, n) => {
        const r = await page.evaluate(([from, to, n]) => {
          const s = document.getElementById("t");
          for (let k = 0; k <= n; k++) {
            s.value = String(from + (to - from) * k / n);
            s.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return { label: document.querySelector("#timePanel .y").textContent,
                   knob: document.querySelector("#track .knob").style.left };
        }, [from, to, n]);
        await page.waitForTimeout(200);
        return { ...r, hits: await page.evaluate(() => window.__provHits) };
      };

      // ---- ① 同じ段の中を 40 回動かす。言葉は変わらないので、組み直してはいけない ----
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(300);
      await watch();
      const a = await scrub(0, 40, 40);
      must(a.hits <= 2, `同じ段の中で動かしただけで、根拠を ${a.hits} 回組み直している`
        + `（40 回動かした。分ける前はこれが 40 回だった）`);
      // ⚠ 動いていないから組み直していない、では意味がない。**絵は毎回動いている**
      must(a.knob !== "" && a.knob !== "0%", `つまみが動いていない（${a.knob}）。絵まで止めている`);

      // ---- ② 隣の段へ移る ----
      // ⚠ **「段が変われば必ず組み直す」は、⚠ もう成り立たない**（2026-08-23 に確かめた）。
      //   ⚠ **台帳の字が段に依らなくなった**（⚠ `groundRow` は、⚠ 写真が届いていれば
      //     ⚠ 「地表はその年代の空中写真そのもの。加工なし」で、⚠ 年代を含まない）。
      //   ⚠ **`describe()` は段が変わるたびに走るが、⚠ 字が同じなので書き直さない。**
      //     ⚠ **これは正しい振る舞い**（⚠ 開いていた「詳しく見る」を閉じない）。
      // ⚠ **落とした主張を、⚠ 黙って落とさない**（掟: ⚠ 測っていないことを「確認済み」と書かない）:
      //   ⚠ **「字が変わったときに、⚠ 本当に書き直すか」は、⚠ ここでは見ていない。**
      //   ⚠ **見ているのは別のケース**（「さかのぼる（地表タイルだけ落とす）」が、
      //     ⚠ 写真を落として「届いていない」に変わることを見る）。
      const before = a.label;
      await watch();
      const b = await scrub(40, 100, 12);
      must(b.label !== before, `段を移ったのに年代の表示が ${before} のまま`);
      // ⚠ **段を移っても、⚠ 字が同じなら組み直さない**（⚠ 12 回も組み直していたら分けた意味が無い）
      must(b.hits <= 4, `段を 1 つ移るのに根拠を ${b.hits} 回組み直している`);

      // ---- ③ 組み直したあとも、押せるボタンが生きている ----
      //   ⚠ 台帳の中のボタンは組み直すたびに**新しい要素**になる。張り直しを忘れると、
      //     押しても何も起きないボタンになる（掟: 押しても何も起きない導線を置かない）。
      // ⚠ **「光らせる」は内訳が持つ**（2026-08-22。⚠ 台帳から移った）
      const peek = await page.$("#breakdown .peek");
      must(peek, "内訳に「光らせる」ボタンが無い");
      const colorBefore = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
      const box = await peek.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(150);
      const colorDown = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await page.mouse.up();
      await page.waitForTimeout(150);
      const colorUp = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      must(colorDown !== colorBefore, "組み直したあと、光らせるボタンが効いていない");
      must(colorUp === colorBefore, "離しても色が戻っていない（別の意味の色が居座る）");
      return `同じ段で 40 回動かして組み直し ${a.hits} 回（つまみは ${a.knob} まで動いた）`
        + ` ／ 段を 1 つ移って ${b.hits} 回（${before} → ${b.label}）`
        + ` ／ 組み直したあとも光らせるボタンは効く`;
    },
  },
  {
    // ⚠ **根拠は、地図を中途半端に覆いながら読ませない。**
    //   実測（2026-08-18。パネルを開いた状態）:
    //
    //     幅        パネルの占有   地図に触れる帯   ＋− の被覆
    //     375×667      54%          **0px**         89%
    //     344×882      53%           10px           89%
    //     320×640      53%          **0px**         89%
    //
    //   ⚠ **画面の中心（＝いま調べている地点）を受け取るのは台帳だった**（地図ではない）。
    //   ⚠ 指で押せるよう 44px に広げたズームが、開いた瞬間に押せなくなっていた。
    //
    //   → スマホでは「根拠を読むあいだは全画面」にした。地図を触るのと根拠を読むのは、
    //     同時にやる操作ではない。⚠ PC は左の縦パネルのまま（変えるのは見せ方だけ）。
    //
    // ⚠ **「閉じれば地図に戻れること」まで見る。** 全画面にしただけで戻れなければ、
    //   0px の状態と変わらない（掟: 押しても何も起きない導線を置かない）。
    // ⚠ **戻る手段を 2 つとも見る。** ✕ は「根拠を閉じて地図へ」、
    //   ← は「今昔へ帰る」で**別の操作**。全画面にしたとき ← が下敷きになった（実測）。
    name: "スマホの根拠は全画面で読み、閉じれば地図に戻る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const pan = document.getElementById("panel");
        const pr = pan.getBoundingClientRect();
        const open = pan.classList.contains("open");
        const box = (sel) => { const e = document.querySelector(sel);
          if (!e) return null; const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
                   x: Math.round(r.x), y: Math.round(r.y) }; };
        // その座標を実際に受け取るのは誰か。⚠ 地図かどうかは **#map の中か**で見る
        //   （className を文字にすると SVG は "[object SVGAnimatedString]" になる。一度踏んだ）
        const map = document.getElementById("map");
        const who = (x, y) => { const e = document.elementFromPoint(x, y);
          if (!e) return { inMap: false, name: "無い" };
          return { inMap: !!map && map.contains(e),
                   name: e.id || e.tagName.toLowerCase() }; };
        return { open,
          cover: open ? Math.round(pr.width * pr.height / (W * H) * 100) : 0,
          center: who(Math.round(W / 2), Math.round(H / 2)),
          // ⚠ **2026-08-21 に、⚠ 答えの板（#land）が無くなった**（hidetzu/konjaku#152）
          land: document.querySelectorAll("#land").length,
          // ⚠ **✕ は消えた**（2026-08-22）。⚠ **戻る的は `#toggle`（▴ 地図に戻る）。**
          close: box("#toggle"), back: box("#back"),
          zoom: box(".maplibregl-ctrl-group"),
          // ⚠ **箱があるだけでは「見えている」ではない。**その座標を自分が受け取るかまで見る
          //   （矩形は覆われていても返る。このリポジトリが何度も踏んでいる）
          backOnTop: (() => { const e = document.getElementById("back");
            if (!e) return false; const r = e.getBoundingClientRect();
            const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
            return !!t && (e === t || e.contains(t)); })() };
      });
      // (1) 閉じている初期状態: 答えは地図の上に出ていて、地図の中心は地図が受け取る
      const shut = await look();
      must(!shut.open, "スマホでパネルが開いて始まっている（地図が見えない）");
      // ⚠ **前の主張**: 「⚠ 閉じている初期状態でも、⚠ 答えの板が地図の上に出ている」。
      //   ⚠ 2026-08-21 に Owner が「⚠ 土地の答えは HUD では見せない」と決めた
      //     （hidetzu/konjaku#152）。⚠ **板そのものが無くなった。**
      //   ⚠ **主張は引き継ぐ**: ⚠ **閉じているあいだ、⚠ 地図の中心は地図が受け取る**
      //     （⚠ 調べている地点が見える）。⚠ **板が戻っていないこと**も見る。
      must(shut.land === 0, "答えの板（#land）が戻っている（土地の答えはパネルの 1 か所）");
      must(shut.center.inMap,
        `閉じているのに、画面の中心（＝調べている地点）を地図が受け取っていない: ${shut.center.name}`);
      // (2) 開いたら**全画面**。中途半端に覆わない
      await page.click("#toggle");
      await settleAfterClick(page);
      const open = await look();
      must(open.open, "☰ を押しても開かない");
      must(open.cover >= 95,
        `根拠が地図を中途半端に覆っている: 画面の ${open.cover}%（全画面にするか、覆わないかの二択）`);
      // ⚠ 戻る手段が 2 つとも、指で押せる大きさで見えていること
      must(open.close && open.close.h >= 44 && open.close.w >= 44,
        `根拠を閉じる ✕ が指で押せない: ${JSON.stringify(open.close)}`);
      must(open.back && open.back.h >= 44 && open.back.y >= 0 && open.back.y < 200,
        `全画面で「← もどる」が指で押せる大きさで無い: ${JSON.stringify(open.back)}`);
      // ⚠ **覆われていないことまで見る。**矩形だけ見ていたときは、
      //   パネルの下敷きにしても緑のままだった（2026-08-18 に壊して気づいた）
      must(open.backOnTop,
        "全画面で「← もどる」がパネルの下敷きになっている（戻る手段は常に見えている場所に）");
      // (3) 小さくすれば地図に戻る
      await page.click("#toggle");
      await settleAfterClick(page);
      const again = await look();
      must(!again.open, "▴ を押しても小さくならない");
      must(again.center.inMap,
        `閉じたのに地図へ戻っていない（中心を受け取るのが ${again.center.name}）`);
      must(again.zoom && again.zoom.h >= 44, `閉じてもズームが押せる大きさで出ていない: ${JSON.stringify(again.zoom)}`);
      // (4) ⚠ **← と ✕ の行き先が、押す前に分かること。**
      //   利用者役 3/3 が「どちらが今の場所を捨てるボタンか分からない」「怖いので押さない」
      //   と答えた（両方とも「もどる」系の見た目だったため）。
      //   ⚠ 字が出ているだけでなく、**2 つが違う字**であること。
      await page.click("#toggle"); await page.waitForTimeout(600);
      //   ⚠ **記号（← / ▴）を落としてから比べる。**落とさずに比べると、
      //     行き先の字が同じでも記号の差で「違う」になり、この検査は何も見ていない
      //     （2026-08-18 に壊して気づいた）。
      // ⚠ **狭い幅では「← 今昔へ」の字を隠した**（2026-08-23。Owner 判断。⚠ 幅を空けるため）。
      //   ⚠ **主張は「⚠ 2 つの行き先が、⚠ 押す前に区別できること」**（⚠ 利用者役 3/3 が
      //     ⚠ 「どちらが今の場所を捨てるか分からない」「怖いので押さない」と答えたのが元）。
      //   ⚠ **見えている字が消えたので、⚠ 名乗り（`aria-label` / `title`）で見る。**
      //   ⚠ **記号（← / ▴）を落としてから比べる**（⚠ 落とさないと記号の差で常に「違う」になる）。
      const label = await page.evaluate(() => {
        const word = (id) => { const e = document.getElementById(id); if (!e) return "";
          return (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || "")
            .replace(/[←✕×▴▾\s]/g, ""); };
        return { back: word("back"), close: word("toggle") };
      });
      must(label.back.length > 1 && label.close.length > 1,
        `全画面で、戻る手段の行き先が名乗られていない: ← 「${label.back}」／▴ 「${label.close}」`);
      must(label.back !== label.close,
        `← と ✕ の行き先が同じ字になっている: どちらも「${label.back}」`);
      // (5) ⚠ **「光らせる」を押したら、光る先（地図）が見えること。**
      //   全画面のままだと、押しても何も起きないボタンになる（3/3 が「二度と押さない」）。
      const peek = page.locator("#peekH");
      if (await peek.count()) {
        // ⚠ **先に見える位置へ送る。**パネルが層で高くなり、このボタンが
        //   スクロールの外（実測 2026-08-19: y=702 / パネル高 590）へ出た。
        //   ⚠ 座標で押すと**地図に当たる**（elementFromPoint が canvas を返した）。
        //   ⚠ 見ている主張は変えていない: **組み直したあともボタンが生きていること**。
        await peek.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const box = await peek.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        const held = await page.evaluate(() => ({
          open: document.getElementById("panel").classList.contains("open"),
          inMap: (() => { const m = document.getElementById("map");
            const e = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
            return !!m && !!e && m.contains(e); })(),
        }));
        await page.mouse.up();
        must(!held.open && held.inMap,
          "「光らせる」を押しても全画面のままで、光る先の地図が見えない"
          + `（パネル開=${held.open} / 中心は地図=${held.inMap}）`);
      }
      return `閉じ: 答えの板は無い・中心は地図 ／`
        + ` 開き: 画面の ${open.cover}%・「${label.close}」${open.close.w}×${open.close.h}px・`
        + `「${label.back}」${open.back.w}×${open.back.h}px ／`
        + ` 光らせると地図が出る ／ 閉じ直し: 中心は地図・ズーム ${again.zoom.h}px`;
    },
  },
  {
    // ⚠ **狭い幅の年代は「ものさし」**（2026-08-19）。ドラムを置き換えた。
    //   ⚠ ここは「横ドラムロール」を守っていた検査を**置き換えたもの**。
    //     消したのではなく、**守る目的が変わった**ので書き直している。
    //
    // 直したかったのは「どこまで遡れるか分からない」ほう。実測（2026-08-19・豊洲）:
    //   ⚠ 9 段のうち画面に入っていたのは 375 幅で 2 個・**320 幅で 1 個**だけ。
    //   ⚠ 「明治期」は x=877（375）／x=849（320）＝ **どちらも画面の外**。
    //   利用者役「せいぜい昭和の終わりまでかな、と思いました」。
    //
    // ⚠ ドラムのときに実測で否定された 5 つは、ものさしでも起こしてはいけない。
    //   引き継いで見る（形は変わっても、失敗の中身は同じ）:
    //   1. 印が中身と一緒に流れる → ⚠ ものさしのつまみは軸の中に固定
    //   2. box-sizing が無く、的が太って印と食い違う → ⚠ 的の実寸を見る
    //   3. transform で膨らむ → 同上
    //   4. 押しどころが近すぎて誤爆（3/3 が「閉じてしまいそう」）→ ⚠ ‹ › の間隔を見る
    //   5. 文字が隣の部品の真横で切れる（320 で 33px 切れ）→ ⚠ 年と端の名前の切れを見る
    //
    // ⚠ **刻みは的にしない。**320 幅・9 段で 1 段 24px しかなく、44px を割る（掟）。
    //   動かすのは ‹ ›（44×44）と、軸そのもののドラッグ。
    name: "狭い幅の年代は、ものさしで全体が見え、端まで届く", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => typeof steps !== "undefined" && timelineReady,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right),
            w: Math.round(r.width), h: Math.round(r.height),
            cut: e.scrollWidth > Math.ceil(r.width) + 1,
            hit: who ? (who.id || who.closest("[id]")?.id || String(who.className).split(" ")[0]) : "無い" }; };
        const line = document.querySelector("#ruler .rl-line").getBoundingClientRect();
        const ticks = [...document.querySelectorAll("#rlTicks i:not(.rl-cut)")];
        const knob = document.getElementById("rlKnob").getBoundingClientRect();
        return { year: g("#rlYear"), left: g("#rlLeft"), right: g("#rlRight"),
          prev: g("#rlPrev"), next: g("#rlNext"), note: g("#rlNote"),
          nTicks: ticks.length, nSteps: steps.length,
          lastLabel: steps[steps.length - 1].label,
          axis: Math.round(line.width), knobX: Math.round(knob.x + knob.width / 2),
          lineL: Math.round(line.left), lineR: Math.round(line.right),
          meiji: !!document.querySelector("#rlTicks i.rl-meiji"),
          cut: !!document.querySelector("#rlTicks i.rl-cut"),
          // ⚠ **間の段の名前**（hidetzu/konjaku#166）。⚠ 端は left / right が持つ
          inner: [...document.querySelectorAll(".rl-labs span")].map((e) => {
            const r = e.getBoundingClientRect();
            return { t: e.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right),
                     cut: e.scrollWidth > Math.ceil(r.width) + 1 }; }),
          W: innerWidth };
      });
      const a = await look();
      // ---- ① 全段が 1 本の軸にあり、端が画面内 ----
      must(a.nTicks === a.nSteps, `刻みが段の数と合わない（刻み ${a.nTicks} / 段 ${a.nSteps}）`);
      must(a.right.right <= a.W, `右端「${a.right.t}」が画面の外（右 ${a.right.right} / 幅 ${a.W}）`);
      must(a.left.x >= 0, `左端「${a.left.t}」が画面の外`);
      // ⚠ **右端はその地点の最終段。**「明治期」固定にしない（明治期データは 24 地点で 7/24）
      must(a.right.t === a.lastLabel,
        `右端が最終段と違う（右端「${a.right.t}」／最終段「${a.lastLabel}」）`);
      // ⚠ 5 の再発（文字が切れる）
      for (const [nm, x] of [["年", a.year], ["左端", a.left], ["右端", a.right]])
        must(!x.cut, `${nm}「${x.t}」が切れている`);

      // ---- ② 押せるものは 44px。刻みは的にしない ----
      for (const [nm, x] of [["‹", a.prev], ["›", a.next]]) {
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
        must(x.hit === (nm === "‹" ? "rlPrev" : "rlNext"), `${nm} を押しても当たるのは「${x.hit}」`);
      }
      // ⚠ 4 の再発（近すぎて誤爆）
      must(a.next.x - a.prev.right >= 80,
        `‹ と › が近すぎる（間隔 ${a.next.x - a.prev.right}px）。押し間違える`);

      // ---- ③ 明治期は写真ではない。形と仕切りで示す ----
      must(a.meiji, `明治期の印が無い（写真と同じ形に見える）`);
      must(a.cut, `写真と明治期の仕切りが無い`);
      must(/空中写真\s*\d+\s*段/.test(a.note.t), `注記に空中写真の段数が無い: ${a.note.t}`);

      // ---- ③-b ⚠ **動かす前に、全段の年代が読める**（2026-08-22。hidetzu/konjaku#166）----
      //   ⚠ **前は両端だけだった**（実測 2026-08-22・375/344/320 とも名前 2 個・刻み 10 本）。
      //   ⚠ **間引かない。**⚠ 出ていない段があると「その年代は無い」と読まれる（掟 §1。
      //     ⚠ 利用者役 3 名中 2 名が実際にそう読んだ）。
      //   ⚠ **ここが見るのは「実物のページに届いているか」。**
      //     ⚠ **段の数を変えた検査は、コンポーネント単体のほうが持つ**
      //       （⚠ 写真を stub すると、⚠ **どの土地でも 9 段になる**ので実物では変えられない）。
      const named = [a.left, ...a.inner, a.right];
      must(named.length === a.nSteps,
        `動かす前に読める年代が ${named.length} 個しかない（段は ${a.nSteps}）: `
        + named.map((x) => x.t).join("／"));
      must(a.inner.every((x) => x.t), `間の段に空の名前がある: ${a.inner.map((x) => x.t).join("／")}`);
      // ⚠ 5 の再発（切れる）を、間の名前にも
      const cutInner = a.inner.filter((x) => x.cut).map((x) => x.t);
      must(!cutInner.length, `間の年代が切れている: ${cutInner.join("、")}`);
      // ⚠ 隣どうしが重ならないこと（⚠ **読めなくなるのは、出ていないより悪い**）
      const sorted = [...named].sort((x, y) => x.x - y.x);
      const hitNames = sorted.filter((x, i) => i > 0 && x.x < sorted[i - 1].right - 0.5).map((x) => x.t);
      must(!hitNames.length, `年代の名前が重なっている: ${hitNames.join("、")}`);

      // ---- ④ ‹ › で端まで届く。⚠ 1 の再発（つまみが流れる）も見る ----
      const knob0 = a.knobX;
      // ⚠ **無効になったボタンを押しに行かない。** page.click は「押せるようになるまで」
      //   待つので、無効なボタンに 30 秒 × 回数ぶん待ってしまう（実測 2026-08-19: 10 分で打ち切り）。
      //   ⚠ 押せるあいだだけ押す。押せなくなったら、そこが端。
      const tapWhile = async (id, max) => {
        let n = 0;
        for (; n < max; n++) {
          const ok = await page.evaluate((id) => {
            const e = document.getElementById(id);
            if (!e || e.disabled) return false;
            e.click(); return true;
          }, id);
          if (!ok) break;
        }
        await page.waitForTimeout(400);
        return n;
      };
      const tapped = await tapWhile("rlNext", 20);
      must(tapped >= a.nSteps - 1, `› を ${tapped} 回しか押せなかった（段は ${a.nSteps}）`);
      const b = await look();
      must(b.year.t === a.lastLabel, `› を押し続けても最終段に着かない（いま「${b.year.t}」）`);
      must(b.knobX > knob0, `つまみが動いていない（${knob0} → ${b.knobX}）`);
      must(b.knobX <= b.lineR + 2 && b.knobX >= b.lineL - 2,
        `つまみが軸から外れた（${b.knobX} / 軸 ${b.lineL}..${b.lineR}）`);
      // ⚠ 端では、それ以上押せないと分かること
      const disabled = await page.evaluate(() => document.getElementById("rlNext").disabled);
      must(disabled, `最終段なのに › がまだ押せる顔をしている`);
      await tapWhile("rlPrev", 20);
      const c = await look();
      must(c.year.t === "現在", `‹ を押し続けても先頭に戻らない（いま「${c.year.t}」）`);
      return `320 幅・${a.nSteps} 段  軸 ${a.axis}px（1 段 ${Math.round(a.axis / (a.nSteps - 1))}px）`
        + ` ／ 動かす前に読める年代 ${named.length} / ${a.nSteps} 個「${named.map((x) => x.t).join(" ")}」`
        + ` ／ 端「${a.left.t}」「${a.right.t}」とも画面内 ／ ‹ › ${a.prev.w}×${a.prev.h}（間隔 ${a.next.x - a.prev.right}px）`
        + ` ／ ${a.note.t}`;
    },
  },
];
