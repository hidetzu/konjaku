// 深掘り（`/peel`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=peel`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  NAGOYA_LL, UNSURVEYED, YUMENOSHIMA, KIYOSUMI, UENO, NIIGATA,
  URAYASU, openGroups, suggestionsOf, rowsOf, groupsOf, WEB_SEARCH,
  waitVerdict, WD, wdItem, WD_SHIBUYA, stubWikidata, XSS,
  notRun, shownAsText, photoFrames, waitStrip, LIES, RE_ESC,
  G1_MARK, G1_HEAD, VERDICT_SENTENCE, pngOf, whitePng, photoPng,
  eraRoute, ERA_TILE_IDS, timelineSettled, stepLabels, tauNow, peelReady,
  settleAfterCondition, waited, settleAfterClick, settleAfterScroll, LFC_ROUTE, DEM_ROUTE,
  must, provText
} from "./lib.mjs";
// ⚠ **取れなかったを「無い」と言わないは `peel-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277 の 12 本目。⚠ **`peel.mjs` を割る 1 本目**）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as UNREACH_CASES } from "./peel-unreachable.mjs";
// ⚠ **動きを減らすは `peel-motion.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 3 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as MOTION_CASES } from "./peel-motion.mjs";
// ⚠ **さかのぼる（再生）は `peel-play.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **6 件の連続 ＋ 離れた 1 件を集めたので、⚠ 並びは動く。**
import { CASES as PLAY_CASES } from "./peel-play.mjs";
// ⚠ **部品を単体で動かすは `peel-component.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as COMPONENT_CASES } from "./peel-component.mjs";
// ⚠ **3D で建物を押す・戻るは `peel-building.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 9 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as BUILDING_CASES } from "./peel-building.mjs";
// ⚠ **見えて、届いて、戻れるは `peel-reach.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 4 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as REACH_CASES } from "./peel-reach.mjs";
// ⚠ **パネルの開閉と答えの居場所は `peel-panel.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 6 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as PANEL_CASES } from "./peel-panel.mjs";
// ⚠ **色みは `peel-theme.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 2 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as THEME_CASES } from "./peel-theme.mjs";
// ⚠ **答えの置き場と確かさの段は `peel-layer.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **連続した 5 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as LAYER_CASES } from "./peel-layer.mjs";


export const CASES = [
  ...THEME_CASES,
  ...LAYER_CASES,
  ...PLAY_CASES,
  ...REACH_CASES,
  ...UNREACH_CASES,
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
  // ---- 検索の入口（掟: 取れなかったを「無い」と言わない やる順番3）----
  // 住所検索は関連度で返らないので、素の先頭は別の土地になる。
  // 並びそのものは scripts/search-check.mjs が35語で測る。ここで見るのは
  // 「画面の上で Enter を押したとき何が起きるか」のほう。
  {
    // ⚠ **狭い幅でも 1 つの器に見せる**（2026-08-22。hidetzu/konjaku#165。Owner 判断）。
    //   ⚠ **PC では 2026-08-20 から同じことをしていた。**⚠ 狭い幅にだけ届いていなかった。
    //   ⚠ 利用者役 3/3 が「真ん中の板と下の板は 1 つでいい」と答え、⚠ **3 名とも理由は同じ**で
    //     「⚠ **同じ『最新の空中写真』が 2 回**、上下に並んでいる」だった（2026-08-21）。
    // ⚠ **見た目だけの検査にしない。**⚠ 撮影種別が 1 か所であること（Owner 判断: `#timePanel .s` に残す）と、
    //   ⚠ **押せる的が 44×44 を割らない**ことまで見る。
    name: "狭い幅でも、年代の表示と操作が 1 つの器になっている", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(() => document.getElementById("ruler")?.checkVisibility?.(),
        null, { timeout: 45000 });
      await settleAfterCondition(page);
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(700);
        const r = await page.evaluate(() => {
          const vis = (e) => !!e && e.checkVisibility();
          // ⚠ **HUD に器がいくつ立っているか。**⚠ 2 つに戻っていないことを見る
          const boxes = [...document.querySelectorAll("#hud > *")].filter(vis)
            .map((e) => e.id || e.className);
          const rlSub = document.getElementById("rlSub");
          const small = [...document.querySelectorAll("#rlPrev,#rlNext")]
            .filter(vis)
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; })
            .map((e) => e.id);
          return { boxes,
            kinds: (document.body.innerText.match(/最新の空中写真/g) ?? []).length,
            subOn: vis(rlSub), small,
            // ⚠ 押しどころが**消えていない**こと（対で見る。verify §5）
            ops: ["#rlPrev", "#rlNext"].filter((q) => vis(document.querySelector(q))).length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
        });
        // ⚠ **器は 1 つ**（2026-08-22 に #era を畳んで #timePanel へ寄せた）
        must(r.boxes.length === 1,
          `${w}px: HUD に器が ${r.boxes.length} 個ある（1 つにまとめたはず）: ${r.boxes.join(" / ")}`);
        must(r.kinds === 1, `${w}px: 撮影種別が画面に ${r.kinds} 回ある（1 か所にする）`);
        must(!r.subOn, `${w}px: ものさしの下に撮影種別が出ている（#timePanel .s に残すと決めた）`);
        must(r.ops === 2, `${w}px: 年代を送る ‹ › が ${r.ops} 個しか見えていない`);
        must(!r.small.length, `${w}px: 44×44 を割った的がある: ${r.small.join("、")}`);
        must(!r.overflow, `${w}px: 横あふれしている`);
        out.push(`${w}: 器${r.boxes.length}個 撮影種別${r.kinds}回`);
      }
      return out.join(" ／ ");
    } },
  {
    // ⚠ 待たせ続けない。以前は 45秒 × 2エンドポイント × 2周 で、最悪 180秒
    //   「建物を取得中…」のままだった。Overpass が落ちること自体は前提で、
    //   問題は「いつ諦めるかを決めていなかった」こと。
    // ⚠ 建物を取り込んでいない土地で見る。亀戸は豊洲の取り込み（z14 6枚）に
    //   含まれてしまい、Overpass の経路を通らなくなった
    name: "建物が取れないとき、待たせ続けない", path: `/peel?${UNSURVEYED}`,
    // ⚠ glob にしない。`**://*.overpass*/**` は overpass-api.de にも
    //   overpass.kumi.systems にも**一度もマッチしていなかった**（どちらも先頭の
    //   ラベルが overpass なので `*.` の前に置くものが無い）。
    //   実際には Overpass が応答して 6,439件取れており、この検査は
    //   「待たせ続けない」を一度も確かめていなかった。URL で見る。
    setup: (page) => Promise.all([
      // 現在の静的タイル範囲に浦安が含まれても、Overpassの失敗経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // ⚠ 起点はページ読み込みではなく「建物を待ち始めた瞬間」。
      //   先に水域の判定（亀戸で1048面）があり、混んだ環境ではそこだけで時間を食う。
      //   見たいのは **待ち始めてから諦めるまで**。
      // ⚠ 一瞬の状態をスナップショットで読まない。**出るべき文言そのもの**を待つ。
      //   「建物を取得中」を待ってから innerText を読むと、読んだ時点では
      //   次の状態に移っていることがある（実際に取りこぼした）。
      // ⚠ **「最大20秒…」は出さなくなった**（2026-08-22。Owner 判断: ⚠ 相手先の名前は
      //   ⚠ 利用者の問いに答えていない）。⚠ **待ち始めた合図は「建物を取得しています」。**
      await page.waitForFunction(() => /建物を取得しています/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      const t0 = Date.now();


      // 期限内に、取れなかったと言い切ること
      await page.waitForFunction(() => /取得できませんでした/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **再試行は材料の行が持つ**（2026-08-22。⚠ `#status` から移した）。
      //   ⚠ **主張は同じ**（⚠ 取れなかったときに、⚠ 戻る手段が 1 つある）。
      must(await page.locator("#panel .retry-btn").count() === 1, "建物取得失敗時の再試行が出ていない");
      const ms = Date.now() - t0;
      must(ms < 30000, `諦めるのが遅い: 待ち始めてから ${ms}ms`);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // 取れなかっただけで、画面は成立していること
      // ⚠ **「代わりに何が見られるか」は、⚠ 断りに添える**（2026-08-22。Owner 判断）。
      //   ⚠ **字が変わった**（⚠ 「水域と空中写真だけで表示」→ 材料の行の断り）。
      must(/届いていないだけで|水域と空中写真/.test(t),
        `代わりに何が見られるか書いていない: ${t.slice(0, 160)}`);
      must(await page.locator("canvas").count() > 0, "地図まで出なくなっている");
      // ⚠ **`LIES` は建物の話にだけ当てる**（2026-08-23）。
      //   ⚠ **この土地は、⚠ 明治期の低湿地データが本当に整備対象外**なので、
      //     ⚠ **画面全体に当てると、⚠ 正しい説明のほうが落ちる**（⚠ 実際に落ちた）。
      //   ⚠ `top.mjs` に同じ注意がある（⚠ 2026-08-19 に一度踏んでいる）。
      const t3 = await page.evaluate(() =>
        ([...document.querySelectorAll("#landAll .land-layer")].at(-1)?.textContent ?? "")
          .replace(/\s+/g, " "));
      for (const w of LIES) must(!t3.includes(w), `建物が取れないだけで断定している: 「${w}」`);
      return `${Math.round(ms / 1000)} 秒で諦めて「取得できませんでした」／水域と写真は出ている`;
    },
  },
  // ---- 建物 0 件を、取得中・取得失敗と混ぜない ----
  // ⚠ 正常に 0 件と確認できた状態が、同じ画面で「取得中」とも「欠落」とも見えていた。
  //   直したのは表示だけではなく取得側で、`[]`（正常に 0 件）と `null`（取れていない）を
  //   分けたこと。**3 つの状態を、それぞれ別の経路で再現して**確かめる。
  {
    name: "取り込み済みで 0 件なら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    // 索引はそのまま（＝「この区画は見た」）にして、中身だけ 0 件のタイルに差し替える。
    // ⚠ **詰めた形（v=3）で返す。** 形が違うと読む側が捨てて Overpass へ落ちるので、
    //   この検査は何も確かめないまま緑になる（実際に v=2 で試して確認した）。
    setup: (page) => page.route("**/data/bl/14/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ v: 3, tile: [0, 0], at: "2026-08-16", q: 100000,
        o: [0, 0], k: [], n: [null], m: [null], b: [] }),
    })),
    async check(page, reqs) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みで 0 件と分かっているのに、Overpass へ出ている");
      // ⚠ ここには「別の事前生成データ（豊洲だけの GeoJSON）で上書きしない」を
      //   見る行があった。⚠ **2026-08-20 にその落ち先ごと消えたので、
      //   ここに残しても何も主張していない**（掟: 検証していないことを確認済みと呼ばない）。
      //   ⚠ **主張は消していない。**「土地ごとの例外が生えていないこと」は
      //   check.mjs の「3.5. 土地ごとの例外を作っていない」が見ている。
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      for (const [where, t] of [["問い", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/取り込み済みの建物データで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `Overpass 0 本／台帳「取り込み済みの建物データで建物 0 件」`;
    },
  },
  {
    // ⚠ **資料の範囲外を、分類の 1 行として出さない。**
    //   実測（2026-08-19, 375×667 札幌）: 内訳に「データなし 1364 / 1364」が 1 行だけ出て、
    //   `isWater("データなし")` が false なので**陸の色見本（#d8cfa8）**が付いていた。
    //   ⚠ 「明治期は陸だった建物が 1364 件」と読める。掟: データにない ≠ 現実にない。
    //   ⚠ **静的検査では捕まらない。**色見本が付くかは DOM を見ないと分からない。
    name: "資料の範囲外に、陸の色を塗らない", path: `/peel?${SAPPORO}`, group: "core",
    async check(page) {
      // 建物が出そろうまで待つ（件数が動いている途中を読まない）
      // ⚠ **札幌は足元を 1 件も判定できない**（⚠ 明治期の低湿地データが整備対象外）。
      //   ⚠ **層 3 は `missing` になるので、⚠ `#breakdown` は作られない**（2026-08-22 の作り替え）。
      //   ⚠ **主張は変えていない**: ⚠ **明治期の区分の行を出さない**／⚠ **件数は落とさない**／
      //     ⚠ **範囲の外だと言う**／⚠ **こちらの都合に読める言い方をしない**／⚠ **「無い」と言い切らない。**
      await page.waitForFunction(() => {
        const t = document.getElementById("landAll")?.textContent ?? "";
        return /建物/.test(t) && !/取得しています|取得中/.test(t);
      }, null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        // ⚠ **内訳に区分の行が生えていないこと**（⚠ 器ごと無いのが正）
        rows: [...document.querySelectorAll("#breakdown .stat")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim())
          .filter((t) => /旧水部|河川|干潟|茅|湿地|田/.test(t)),
        hint: (document.querySelector("#landAll .land-layer:last-child")?.innerText ?? "")
          .replace(/\s+/g, " ").trim(),
        all: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
      }));
      // ⚠ 分類の行が 1 本もないこと。1 本でもあれば「明治期は○○だった」と読める
      must(r.rows.length === 0,
        `資料の範囲外を分類の行にしている: ${r.rows.join(" / ")}`);
      // ⚠ 件数は落とさない。落とすと「建物が無い」に読める
      must(/\d{3,}/.test(r.hint), `件数を落としている: ${r.hint}`);
      // ⚠ **範囲の外であることを、⚠ 同じ画面で言っている**（⚠ 第2層が言う）
      must(/整備対象外|範囲の外|判定できていません/.test(r.all),
        `範囲の外であることを言っていない: ${r.all.slice(0, 120)}`);
      // ⚠ こちらの都合（読み込めない）に読める言い方をしない
      must(!/読み込め|取得中|取得できません/.test(r.hint),
        `範囲の外なのに、こちらの都合に読める言い方をしている: ${r.hint}`);
      // ⚠ 「無い」と言い切らない
      must(!/(建物|記録)(は|が)?(無い|ありません)/.test(r.hint), `無いと言い切っている: ${r.hint}`);
      return `内訳の分類行 0 本／「${r.hint.slice(0, 46)}」`;
    },
  },
  {
    // ⚠ **PC のパネルも層で答えること**（ADR 0030）。
    //   実測（2026-08-19）: HUD だけ層にしたとき、PC は古い形（heroNum / heroCap）のままで、
    //   ⚠ **豊洲で 99.6% が 2 回**出ていた。⚠ 利用者役 3/4 が指摘した。
    //   ⚠ **同じ問いに 2 つの答えを持たない**（ADR 0021）。
    // ⚠ **実効 opacity で見る。**`#panel.hide` は opacity:0 で display は残るので、
    //   checkVisibility() だけでは「見えている」と誤って読む（実測 2026-08-19 に踏んだ）。
    name: "パネルも層で答え、同じ数字を 2 回出さない", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#landAll .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => {
        const eff = (el) => { if (!el || !el.checkVisibility()) return 0;
          let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === "none" || s.visibility === "hidden") return 0;
            o *= Number(s.opacity); }
          return +o.toFixed(3); };
        const t = (id) => { const e = document.getElementById(id);
          return eff(e) > 0 ? (e.innerText ?? "") : ""; };
        return { seen: t("landAll"),
          // ⚠ **2026-08-21 に、⚠ 土地の答えはパネルの 1 か所だけになった**
          //   （hidetzu/konjaku#152）。⚠ 前は HUD（#land）からも集めていた。
          qs: [...document.querySelectorAll("#landAll .land-q")]
                .filter((e) => eff(e) > 0).map((e) => e.textContent.trim()),
          hero: document.querySelectorAll("#heroNum,#heroCap").length };
      });
      // ⚠ 古い入れ物が残っていないこと（残っていると、また 2 つの答えになる）
      const pc = await look();
      must(pc.hero === 0, `heroNum / heroCap が残っている: ${pc.hero} 個`);
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((pc.qs[0] ?? "") === WORDS.layerTitle(1),
        `PC で先頭が第1層でない: ${pc.qs.join(" / ")}`);
      must(pc.qs.length === 3, `PC のパネルに 3 層そろっていない: ${pc.qs.join(" / ")}`);
      must((pc.seen.match(/99\.6/g) || []).length === 1,
        `PC で 99.6% が ${(pc.seen.match(/99\.6/g) || []).length} 回出ている`);
      // ⚠ **狭い幅も対にして見る。**PC だけ直して、スマホを壊しても緑にならないように。
      //   ⚠ **読み込み直す。**パネルの開閉は**読み込み時の幅**で決まり、
      //     リサイズでは切り替わらない（peel3d.js の isNarrow は「あとで変えない」）。
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await peelReady(page);
      await page.waitForFunction(() => document.querySelectorAll("#landAll .land-q").length > 0
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **2026-08-21 に、⚠ スマホでも層はパネルの 3 つ**（hidetzu/konjaku#152）。
      //   ⚠ 前は HUD が「第1層＋もう 1 つ」に絞って出していた。⚠ **HUD に答えを出さなくなった。**
      //   ⚠ **見ている主張は同じ**: ⚠ **同じ数字を 2 回出さない。**
      //   ⚠ パネルは閉じて始まるので、⚠ **開いてから読む。**
      await page.click("#toggle");
      await settleAfterClick(page);
      const sp = await look();
      must(sp.qs.length === 3, `スマホのパネルに 3 層そろっていない: ${sp.qs.join(" / ")}`);
      must((sp.seen.match(/99\.6/g) || []).length === 1,
        `スマホで 99.6% が ${(sp.seen.match(/99\.6/g) || []).length} 回出ている`);
      return `PC ${pc.qs.length} 層（${pc.qs.map((x) => x.slice(0, 6)).join("→")}）／`
        + `スマホ ${sp.qs.length} 層／99.6% はどちらも 1 回`;
    },
  },
  {
    // ⚠ **土地の答えが、確実性の高い順に出ること**（ADR 0030）。
    //   実測（2026-08-19・main = d7dce05）: 層という値が無かったので、4 地点とも順番が違った。
    //     豊洲 第3層→第2層（⚠ 第1層が無い） ／ 札幌・那覇 ⚠ 出せない断りから始まった。
    // ⚠ **2026-08-21 に、⚠ 出す先が HUD からパネルへ移った**（hidetzu/konjaku#152）。
    //   ⚠ 前は「⚠ HUD は第1層＋1 つに絞る」だった。⚠ 3 層とも出すと 375×667 で 320px になり、
    //     ⚠ 下端 y=382 が**調べている地点（画面中央 y=333）を覆った**ため。
    //   ⚠ **パネルは地図の上に重なる板ではない**ので、⚠ **絞る理由が無くなった。**
    //   ⚠ **順序の主張は変えていない**（⚠ 第1層 → 第2層 → 第3層）。
    name: "土地の答えが、確実性の高い順に出る", path: `/peel?${TOYOSU}`, group: "core",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      // ⚠ **答えが出そろってから読む。**建物と地形分類は別々に返るので、
      //   途中を読むと層が 1 つだけの瞬間を捕まえる（実測 2026-08-19: 2 回に 1 回落ちた）。
      await page.waitForFunction(() => (document.querySelectorAll("#landAll .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **パネルは閉じて始まる。**⚠ 開いてから読む（⚠ ☰ を 1 回）
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("landAll");
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          seen: el.checkVisibility(),
          nums: [...el.querySelectorAll(".land-num")].length,
          dens: [...el.querySelectorAll(".land-den")].length,
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      // ⚠ 第1層が先頭。ここが崩れると「できないことから書き始める」に戻る
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((r.qs[0] ?? "") === WORDS.layerTitle(1),
        `先頭が第1層でない: ${r.qs.join(" / ")}`);
      // ⚠ 内部の呼び名を出さない
      must(!/第[123]層/.test(r.txt), `内部の呼び名が画面に出ている: ${r.txt.slice(0, 60)}`);
      // ⚠ 数字を出すなら分母も出る（掟: 数字は主張範囲の分母で書く）
      must(r.nums === 0 || r.dens >= r.nums, `数字 ${r.nums} 個に対して分母が ${r.dens} 個`);
      // ⚠ **見えていること。**⚠ 見えていなければ、順序の主張も測れていない
      must(r.seen, "パネルの答えが見えていない（順序を測れていない）");
      // ⚠ **3 層とも出る**（⚠ 絞らない）。⚠ 順は第1層 → 第2層 → 第3層
      must(r.qs.length === 3, `3 層そろっていない: ${r.qs.join(" / ")}`);
      return `${r.qs.length} 層（${r.qs.join(" → ")}）`;
    },
  },
  {
    // ⚠ **出ない層を、黙って消さない**（ADR 0001）。
    //   ⚠ 札幌は明治期が範囲外・建物の足元が判定できない。**両方とも理由を出す**。
    //   ⚠ 実測（2026-08-19）: 最初は第2層と第3層が同じ文を返し、同じ行が 2 回並んだ。
    name: "出ない層も、その層の位置に理由を出す", path: `/peel?${SAPPORO}`, group: "core",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(() => (document.querySelectorAll("#landAll .land-q").length > 0)
        && typeof landform !== "undefined" && landform !== null, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **2026-08-21 に、⚠ 答えはパネルの 1 か所になった**（hidetzu/konjaku#152）。
      //   ⚠ **主張は同じ**: ⚠ 出ない層を黙って消さず、⚠ その層の位置に理由を出す。
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const el = document.getElementById("landAll");
        return { qs: [...el.querySelectorAll(".land-q")].map((x) => x.textContent.trim()),
          miss: [...el.querySelectorAll(".land-miss")].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
          txt: (el.innerText ?? "").replace(/\s+/g, " ").trim() };
      });
      // ⚠ **字は `public/words.js` の 1 か所から借りる**（2026-08-23）。
      //   ⚠ **見出しを言い直したときに、⚠ 検査のほうが落ちた**（2026-08-22 に実際に踏んだ）。
      //   ⚠ **同じ問いに答える実装を 2 つ持たない**（`CLAUDE.md` §3）。
      must((r.qs[0] ?? "") === WORDS.layerTitle(1),
        `先頭が第1層でない: ${r.qs.join(" / ")}`);
      must(r.miss.length === 2, `出ない層の理由が 2 つでない: ${r.miss.length} 個`);
      // ⚠ 同じ文を 2 回出さない
      must(new Set(r.miss.map((x) => x.split(" ")[0])).size === 2,
        `出ない層の理由が重複している: ${r.miss.join(" ／ ")}`);
      // ⚠ **ここに LIES を当てない。**LIES は「通信断・403 のときに言ってはいけない語」で、
      //   ⚠ **札幌は本当に 404（整備対象外）**。当てると、正しい説明のほうが落ちる
      //   （実測 2026-08-19: そう書いて落とした）。
      // ⚠ 見るのは「無い」と言い切っていないこと。
      for (const w of ["データが無い", "記録がありません", "残っていない", "存在しません"])
        must(!r.txt.includes(w), `出ない層を「無い」と言い切っている: 「${w}」`);
      return `第1層のみ立ち、出ない 2 層は理由つき（${r.miss.map((x) => x.slice(0, 20)).join(" ／ ")}）`;
    },
  },
  ...MOTION_CASES,
  {
    name: "Overpass が 0 件を返したら、取れなかったと言わない", path: `/peel?${UNSURVEYED}`,
    setup: (page) => Promise.all([
      // 取り込み済みの経路を塞ぐ。⚠ 塞がないと静的で答えてしまい、Overpass の経路を通らない
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), (r) => r.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({ elements: [] }) })),
    ]),
    async check(page) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      for (const [where, t] of [["問い", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/OSM への問い合わせで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `「OSM に登録された建物は 0 件」／台帳「OSM への問い合わせで建物 0 件」`;
    },
  },
  {
    name: "建物を待っている間は、取得中と言う", path: `/peel?${UNSURVEYED}`,
    setup: (page) => Promise.all([
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // 待ち始めたことを、出るべき文言そのもので待つ（一瞬の状態をスナップショットで読まない）
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      //   ⚠ **「最大20秒…」は出さなくなった**（Owner 判断）。⚠ **内訳の「取得中」で待つ。**
      // ⚠ **待っているあいだは層 3 が `missing`** なので、⚠ **`#breakdown` は作られない。**
      //   ⚠ **問いの側（`#landAll`）で待つ**（⚠ 「建物を取得しています」＋「建物データを取得中」）。
      await page.waitForFunction(() => /建物を取得(中|しています)/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      must(/建物を取得しています/.test(bd), `待っている間に問いが「取得しています」と言っていない: ${bd.slice(0, 90)}`);
      // ⚠ 台帳の語彙は「未取得＝読めなかった／欠落＝本当に無い」。待っている間に「欠落」は嘘
      must(!/欠落/.test(prov), `待っているだけなのに台帳が「欠落」と言っている: ${prov.slice(0, 90)}`);
      must(/建物データを取得中/.test(prov), `台帳が待っていることを言っていない: ${prov.slice(0, 90)}`);
      must(!/0 件/.test(bd), `まだ取れていないのに件数を言っている: ${bd.slice(0, 90)}`);
      return `問い「建物を取得しています」／台帳「建物データを取得中」`;
    },
  },
  // ---- 取り込み済みの土地では、外へ出ない ----
  // ⚠ 実行時に Wikidata を叩くのをやめるための取り込み。効いていることを機械で見る。
  {
    name: "建物が取り込み済みなら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      must(reqs.filter((u) => /\/data\/bl\//.test(u)).length > 0, "建物タイルを読んでいない");
      // ⚠ 集計範囲が広がっていないこと。豊洲は 99% 台のはず
      const pct = Number((t.match(/(\d+\.\d)\s*%/) ?? [])[1]);
      must(pct >= 95, `集計範囲が広がっている（豊洲で ${pct}%。隣の街区が混ざっている）`);
      // いつ取り込んだ結果かを言うこと
      // ⚠ **場所が「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ いつ取り込んだ結果かが画面にあること）。
      // ⚠ **由来の行は「詳しく見る」の中**（2026-08-22。⚠ 畳んである）。
      //   ⚠ **`innerText` には出ない。**⚠ **`textContent` で読む**（⚠ 主張は同じ）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(
        (await page.locator("#landAll").textContent()).replace(/\s+/g, " ")),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      // ⚠ **「（事前に取り込んだデータ）」は、⚠ 0 件のときしか出ない**（2026-08-23 に確かめた）。
      //   ⚠ **判定できたときの `#status` は空**（2026-08-22。Owner 判断: ⚠ 件数は答えが言う）。
      //   ⚠ **主張は上の行が持つ**（⚠ 「建物のデータは YYYY-MM-DD に取り込んだもの」）。
      //   ⚠ **消したのは重複であって、⚠ 主張ではない。**⚠ **Overpass を叩いていないことは上で見ている。**
      return `Overpass 0 件／${pct}%／取り込み日あり`;
    },
  },
  {
    // ⚠ 共有は唯一の指標。共有された URL を踏んだ人が数から消えると、
    //   「共有されたが誰も踏まなかった」と「踏まれたが数えていなかった」を区別できない。
    name: "共有された 3D の URL を踏んだ人も、1回だけ数える", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // 直接開いている（トップの導線を通っていない）
      await peelReady(page).catch(() => {});
      await settleAfterCondition(page);
      const t = reqs.filter((u) => /\/t(\?|$)/.test(u));
      must(t.length === 1, `直接開いたのに ${t.length} 回数えている（1回であること）`);
      return `直接開いて /t 1 回`;
    },
  },
  {
    // ⚠ 過去の年代では、**年と同じくらいの強さで**「重ねている」と言うこと。
    //   実測（2026-08-14 利用者役のエージェントによる検証）: 広島 1945–50（原爆直後の焼け野原）の上に
    //   現在の3,555棟が立ち、広島の利用者は最初の3秒「1945年の広島」だと読んだ。
    //   判別できた人の根拠は**画面ではなく自分の歴史知識**だった。
    //   ⚠ 半透明で薄れさせない。0.80 で瓦礫が建物ごしに透け、「消えかけの幽霊」
    //     「広島の人間には見せられない」と言われた。**別物として重ねる**ほうがよい。
    name: "過去の写真の上では、いまの街を重ねていると言う",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const at = async (v) => { await page.$eval("#t", (e, v) => {
          e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1600);
        return page.evaluate(() => {
          // ⚠ **「重ねている」の断りは、⚠ 補足の 1 行**（2026-08-22。⚠ `#over` から移った）。
          //   ⚠ **`#notes` を丸ごと読むと、⚠ 別の断り（「消える年代は推定」）まで拾う**
          //     （⚠ 2026-08-23 に踏んだ）。⚠ **その 1 行だけを読む。**
          const y = document.querySelector("#timePanel .y");
          const o = [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
            .find((e) => /この街並みは/.test(e.textContent ?? "")) ?? null;
          const fs = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
          return { year: y.textContent.trim(), yFs: fs(y),
            over: (o?.textContent ?? "").trim(), oFs: fs(o),
            op: map.getPaintProperty("bld", "fill-extrusion-opacity") };
        }); };

      // 現在は「重ねている」ではない（地面も建物もいま）
      const now = await at(0);
      must(now.over === "", `現在なのに重ねていると言っている: ${now.over}`);

      // ⚠ スライダーの端を決め打ちしない。段の数は**地点によって変わる**
      //   （広島は 1936–42 と 1984–86 が存在しないので 7 段 / max=600）。
      //   800 と書いていた頃は、この検査が「8段固定」という直したい前提そのものを
      //   固定していた。端は実装に聞く。
      const max = await page.$eval("#t", (e) => Number(e.max));
      must(max > 0, "スライダーの上限が 0（段が組まれていない）");

      // 過去は必ず言う
      const past = await at(Math.round(max * 0.75));
      must(past.over.length > 0, `過去の年代なのに、重ねていることを言っていない（${past.year}）`);
      must(/いま/.test(past.over), `いまの街だと言っていない: ${past.over}`);
      must(past.over.includes(past.year), `どの年代の地面かを言っていない: ${past.over}`);
      // ⚠ 年に対して小さすぎると「言い切っている」ことにならない（以前は 60:12 で5倍）
      must(past.yFs / past.oFs <= 3.0,
        `年 ${past.yFs}px に対して重ねの文が ${past.oFs}px（3倍以内であること）`);
      // ⚠ 幽霊にしない
      must(typeof past.op !== "number" || past.op >= 0.9,
        `過去の年代で建物が薄れている（不透明度 ${past.op}）。消えかけに見える`);

      // 明治期は建物が消えるので、建物の話をしない
      const meiji = await at(max);
      must(meiji.year === "明治期", `右端が明治期でない: ${meiji.year}`);
      must(meiji.over === "", `建物が1棟も無いのに重ねていると言っている: ${meiji.over}`);
      return `現在=無／${past.year}=「${past.over.slice(0, 28)}」${past.yFs}:${past.oFs}px／端=${max}`;
    },
  },
  {
    // ⚠ ここが核心。/peel は固定 8 段を出していたので、広島に**存在しない**
    //   1936–42（陸軍撮影は東京23区と大阪市周辺だけ）と 1984–86 のタイルを
    //   地図レイヤとして読み、写真タイルの 404 を **202 件**送っていた（2026-08-16 実測）。
    //   トップは同じ地点で「残っているのは 5 年代」と正しく答えていた。
    name: "存在しない年代を段に出さない（広島）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page, reqs) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      must(labels[labels.length - 1] === "明治期", `右端が明治期でない: ${labels.at(-1)}`);
      for (const gone of ["1936–42", "1984–86"])
        must(!labels.includes(gone), `広島に存在しない ${gone} を段に出している: ${labels.join("/")}`);
      for (const keep of ["1945–50", "1961–69", "1974–78", "1979–83", "1987–90"])
        must(labels.includes(keep), `広島に残っている ${keep} が段から消えている: ${labels.join("/")}`);
      // ⚠ 不在の年代へ出てよいのは、**判定用の中心タイル1枚まで**。
      //   地図レイヤから引くと、また 100 枚単位で 404 を送ることになる。
      const count = (id) => reqs.filter((u) => u.includes(`/xyz/${id}/`)).length;
      for (const id of ["ort_riku10", "gazo3"])
        must(count(id) <= 1, `存在しない年代 ${id} のタイルを ${count(id)} 枚取りに行っている`);
      return `${labels.length} 段（${labels.join("/")}）／不在レイヤへの要求 `
        + `ort_riku10 ${count("ort_riku10")}・gazo3 ${count("gazo3")} 枚`;
    },
  },
  {
    // ⚠ 同じ地点に、トップと /peel が別の答えを出していた（掟: 同じ問いに答える実装を2つ持たない）。
    //   長崎 出島はいちばん差が大きく、固定 8 段のうち 5 年代が存在しない
    //   （2026-08-16 実測で 404 を 491 件送っていた）。
    name: "トップと /peel が、同じ地点で同じ年代を出す（長崎 出島）",
    path: `/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
    // ⚠ **判定に使ったタイルが、実際に何を答えたか**を控える。
    //   ⚠ 掟: 不在と読むのは 404 だけ。timeout / 通信断 / 5xx は「読めなかった」で、
    //     その年代は**段に残す**のが正しい。
    //   ⚠ 控えないと、相手先が 1 回でも 404 以外を返した回に、
    //     **正しい振る舞いのほうを落としてしまう**
    //     （実測 2026-08-19: 実描画の失敗 4 件のうち 2 件がこれだった。
    //      同じ回の数秒前に、広島では同じレイヤを 404 と読めていた＝単発の揺れ）。
    setup: (page) => {
      page.__gsi = new Map();
      const id = (u) => (/\/xyz\/([a-z0-9_]+)\//.exec(u) ?? [])[1];
      page.on("response", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, r.status()); });
      page.on("requestfailed", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, 0); });
      return Promise.resolve();
    },
    async check(page) {
      await peelReady(page);
      const past = (l) => l.filter((x) => x !== "現在" && x !== "明治期").sort();
      const peel = past(await stepLabels(page));
      // ⚠ **必ず出るはずのものは、強いまま。**ここは相手先の揺れと関係ない
      for (const keep of ["1961–69", "1974–78"])
        must(peel.includes(keep), `出島に残っている ${keep} が段から消えている: ${peel.join("/")}`);
      // ⚠ **余分な年代は、404 と答えられた年代でないこと。**
      //   404 なのに残っていたら、それは「無い」を出せていない＝こちらの不具合。
      //   404 以外（読めなかった）で残っているなら、それは**掟どおり**。
      const ID = { "1936–42": "ort_riku10", "1945–50": "ort_USA10", "1961–69": "gazo1",
                   "1974–78": "gazo1", "1979–83": "gazo2", "1984–86": "gazo3", "1987–90": "gazo4" };
      const extra = peel.filter((x) => x !== "1961–69" && x !== "1974–78");
      const wrong = extra.filter((x) => page.__gsi.get(ID[x]) === 404);
      must(wrong.length === 0,
        `404 と答えられた年代を段に残している: ${wrong.map((x) => `${x}(${ID[x]}=404)`).join("・")}`);
      const shaky = extra.map((x) => `${x}(${ID[x]}=${page.__gsi.get(ID[x]) ?? "問い合わせ無し"})`);
      // 同じ入れ物のままトップへ移る（同じ地点・同じ相手・同じキャッシュで比べる）
      await page.goto(`${BASE}/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
        { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitVerdict(page);
      const top = past(await page.$$eval("#strip .f .yr", (els) =>
        els.map((e) => e.textContent.trim())));
      // ⚠ **ここが本題。**同じ問いに 2 つの実装が別の答えを出していないこと。
      //   ⚠ 相手先が揺れていても、**トップと /peel は同じ揺れ方をするはず**（同じ実装を使う）。
      must(JSON.stringify(top) === JSON.stringify(peel),
        `トップと /peel の年代が食い違う: トップ ${top.join("/")} ／ /peel ${peel.join("/")}`);
      return `両方とも ${peel.join("/")}（${peel.length} 年代）`
        + (shaky.length ? `／⚠ 相手先が 404 を返さなかったぶんが残っている: ${shaky.join("・")}` : "");
    },
  },
  {
    // ⚠ 応答を固定して、4 通りの結末を作り分ける。実データに寄りかかると、
    //   相手先の整備状況が変わった日にこの検査が何も見なくなる。
    //     404      … その年代の写真は無い          → 段に出さない
    //     200 白紙 … タイルはあるが撮影範囲の外    → 段に出さない
    //     500      … 読めなかった                  → **段に残す**
    //     通信断   … 読めなかった                  → **段に残す**
    //   消してしまうと「取れなかった」が「無い」になる（掟: 取れなかったを「無い」と言わない）。
    name: "年代ごとの結末で、段に出すかを決める", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.route(eraRoute("gazo3"), (r) => r.fulfill({ status: 404, body: "" }));
      await page.route(eraRoute("gazo2"), (r) => r.fulfill({
        status: 200, contentType: "image/png", body: whitePng() }));
      await page.route(eraRoute("gazo1"), (r) => r.fulfill({ status: 500, body: "" }));
      await page.route(eraRoute("ort_riku10"), (r) => r.abort());
    },
    async check(page) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(!labels.includes("1984–86"), `404 の年代を段に出している: ${labels.join("/")}`);
      must(!labels.includes("1979–83"), `白紙（撮影範囲外）の年代を段に出している: ${labels.join("/")}`);
      must(labels.includes("1974–78"), `読めなかった年代（500）を段から消している: ${labels.join("/")}`);
      must(labels.includes("1936–42"), `読めなかった年代（通信断）を段から消している: ${labels.join("/")}`);
      // 残した段では「届いていない」と言い、記録の有無は断定しない
      const k = labels.indexOf("1936–42");
      await page.$eval("#t", (e, v) => { e.value = String(v);
        e.dispatchEvent(new Event("input")); }, k * 100);
      await page.waitForTimeout(1200);
      // ⚠ **地表は第2層の材料**（2026-08-22）。⚠ **`.prov-q .prov` の最初は第1層。**
      //   ⚠ **札（実測 / 未取得）は消した**（Owner 判断: ⚠ 色で伝わる）。⚠ **字で見る。**
      const ground = (await page.evaluate(() =>
        [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((e) => /地表/.test(e.textContent ?? ""))?.textContent ?? ""))
        .replace(/\s+/g, " ").trim();
      must(/届いていない/.test(ground),
        `読めなかった年代を、⚠ 取れなかったと言っていない: ${ground.slice(0, 60)}`);
      const lie = LIES.find((w) => ground.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${ground.slice(0, 60)}`);
      return `${labels.length} 段（${labels.join("/")}）／404と白紙は消え、500と通信断は残る`;
    },
  },
  {
    // ⚠ 段を削って詰めるだけでは駄目。建物が消える年（tFromYear）・水位・建物のフェードは
    //   **時間座標**で決まっている。広島で 2 段抜いたぶんを詰めると、
    //   同じ 1945–50 の地面の上で、建物の消え方と水位が豊洲と変わってしまう。
    // ⚠ **ここは絵を差し替えない**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **段に何が並ぶか**が主題で、⚠ **それは実際のタイルの中身で決まる**
    //     （`public/verify.js`。⚠ 撮影範囲の外は真っ白なので、⚠ その年代は段に出ない）。
    //   ⚠ **差し替えると、⚠ 広島に無いはずの年代まで段に並ぶ。**⚠ 主張がすり替わる。
    name: "段を間引いても、時間座標が詰まらない（広島 と 豊洲）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const at = async (v) => { await page.$eval("#t", (e, x) => { e.value = String(x);
        e.dispatchEvent(new Event("input")); }, v); await page.waitForTimeout(300);
        return tauNow(page); };
      await peelReady(page);
      const l1 = await stepLabels(page);
      const k1 = l1.indexOf("1945–50");
      must(k1 === 5, `広島の 1945–50 が 5 段目でない: ${k1} 段目（${l1.join("/")}）`);
      const a = await at(k1 * 100);
      must(a.tau === 6, `広島の 1945–50 で時間座標が 6 でない: ${a.tau}（段は詰まっている）`);
      // 豊洲では同じ年代が 6 段目。**段は違うが時間は同じ**でなければならない
      await page.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await peelReady(page);
      const l2 = await stepLabels(page);
      const k2 = l2.indexOf("1945–50");
      must(k2 === 6, `豊洲の 1945–50 が 6 段目でない: ${k2} 段目（${l2.join("/")}）`);
      const b = await at(k2 * 100);
      must(b.tau === a.tau, `同じ 1945–50 なのに時間座標が違う: 広島 ${a.tau} / 豊洲 ${b.tau}`);
      must(Math.abs(b.water - a.water) < 1e-9,
        `同じ 1945–50 なのに水位が違う: 広島 ${a.water} / 豊洲 ${b.water}`);
      return `1945–50 は 広島 ${k1} 段目 / 豊洲 ${k2} 段目、時間座標はどちらも ${a.tau}`
        + `（水位 ${a.water.toFixed(3)}m で一致）`;
    },
  },
  ...COMPONENT_CASES,

  ...PANEL_CASES,
  ...BUILDING_CASES,
  // ⚠ ここに「同じ応答なら、トップと 3D の候補が一致する」があった（2026-08-18 に外した）。
  //   守っていたのは「検索の実装が 2 つあって、片方だけ直る事故」。
  //   ⚠ **並びを突き合わせるのをやめたのではない。**/peel から検索そのものを外したので、
  //     検索は 1 つになった。⚠ 「2 つ持っていない」ことは scripts/check.mjs が静的に見る
  //     （peel 側に検索の実装が生えたら落ちる）。画面側は上の
  //     「3D に場所を探す口は無く…」が見る。
  // ⚠ **画面が別のことを始めたときも、古い候補が出ない。**
  //   打つたびに切るだけでは足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのままクイック地点を選ぶと、行動一覧（立体で見る等）が出たあと、
  //   **2.5 秒後に「東京都渋谷区」で上書きされた**。
  //   ⚠ 入力欄は setMode() が空にするので `oninput` は発火せず、そこの cancel() には届かない。
  {
    // ⚠ 上と対になる、/peel 側。**まだ用意していない場所で「混雑」のせいにしない。**
    //   ⚠ Overpass は止めて測る。止めないと、返ってきた回はこの主張を確かめられない
    //     （名古屋は実測で 8 秒・5,845 件が返ったことがある。**必ず失敗はしない**）。
    name: "まだ用意していない場所で、通信のせいにしない",
    path: "/peel?ll=35.17090,136.88160&q=%E5%90%8D%E5%8F%A4%E5%B1%8B",
    setup: (page) => page.route((u) => /overpass/i.test(u.href), (r) => r.abort()),
    async check(page) {
      // ⚠ **「まだ提供していません」は問いの側が言う**（2026-08-22。⚠ `#status` ではない）。
      //   ⚠ **`textContent` で読む**（⚠ 狭い幅では畳まれている）。
      await page.waitForFunction(
        () => /まだ提供していません|取得できませんでした/.test(
          document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 90000 });
      await settleAfterCondition(page);
      const t = await page.evaluate(() => ({
        // ⚠ **答えも断りも `#landAll` が持つ**（2026-08-22。⚠ `#status` はもう喋らない）。
        //   ⚠ **`textContent` で読む**（⚠ 狭い幅では畳まれている。⚠ 主張は「字があること」）。
        status: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
        land: (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "),
        // ⚠ 台帳はパネルの中。閉じていても DOM には入る
        prov: [...document.querySelectorAll("#panel .prov-q")]
          .map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim(),
      }));
      must(/まだ提供していません/.test(t.status),
        `まだ対応していない、と言っていない: ${t.status.slice(0, 110)}`);
      // ⚠ 相手のせいにしない。一度も取り込んでいない場所で「混雑」は事実に反する
      must(!/混雑/.test(t.status), `対応していないだけなのに、相手の混雑のせいにしている: ${t.status.slice(0, 110)}`);
      // ⚠ **進行形を使わない。**「取得中」「届いていない」は、利用者役 3/3 がそろって
      //   **自分の通信の話**として読んだ（いま動いている感じが出るため）。
      //   ⚠ **台帳まで見る。** 実際に破れていた: 上の文が「まだ用意できていません」と
      //     言っているのに、台帳だけ「未取得 建物データを**取得中**／まだ**届いていない**
      //     だけで」のまま残っていた（fail の分岐で render() を呼んでいなかった）。
      const wet = `${t.status} ${t.land} ${t.prov}`;
      const ng = ["取得中", "届いていない", "取れなかった"].filter((w) => wet.includes(w));
      must(!ng.length,
        `対応していないだけなのに、通信の言い方をしている: 「${ng.join("・")}」／台帳「${t.prov.slice(0, 90)}」`);
      // ⚠ **言い切る。**「毎回まず電波を疑う人間には、この一言がいちばん効く」（利用者役）
      must(/通信の問題ではありません/.test(wet),
        `通信のせいではない、と言い切っていない: ${wet.slice(0, 140)}`);
      // ⚠ 「無い」と言わない。現地に建物が無いという意味ではない
      must(/現地に建物が無いという意味でもありません|現地に建物が無いという意味でもない/.test(wet),
        `「対応していない」を「無い」と読まれないよう断っていない: ${wet.slice(0, 160)}`);
      // ⚠ 台帳が、上の文と同じことを言っていること（同じ画面で主語を食い違わせない）
      // ⚠ **札（未対応）は消した**（2026-08-22。Owner 判断: ⚠ 色で伝わる）。
      //   ⚠ **主張は「⚠ こちらがまだ提供していない、と字で言うこと」**（掟 §4-1）。
      must(/まだ提供していません/.test(t.prov),
        `台帳が「まだ提供していない」と言っていない: ${t.prov.slice(0, 120)}`);
      // ⚠ 建物が出なくても、この画面は成立している（実測: 空中写真・年代・区分の内訳）
      must(/明治期/.test(t.land), `建物が無いだけで、答えの板まで空になっている: ${t.land.slice(0, 90)}`);
      return `${t.status.slice(0, 46)}… ／ 台帳「${t.prov.slice(-52)}」`;
    },
  },
  // ⚠ **別の語へ変えたときも、古い候補が出ない。**
  //   「入力を消したとき」だけ切っていては足りない（2026-08-16 の指摘・実測で再現）。
  //   「渋谷」の応答待ちのまま「新宿」へ変えると、デバウンスの 320〜350ms のあいだに
  //   古い応答が届き、**入力欄は「新宿」なのに「東京都渋谷区」が並ぶ**。
  //   ⚠ その候補を押せば**違う場所へ飛ぶ**。数え方の問題ではなく、行き先の問題。
  //   ⚠ 新しい検索が始まるのはデバウンスのあとなので、run() の中で世代を進めるだけでは
  //   間に合わない。**入力の瞬間に cancel() する**必要がある。
  // ⚠ 3D の側は 2026-08-18 に外した（あちらから検索そのものを外したため）。
  //   ⚠ **組の形は残す。** 検索を持つ画面が増えたら、ここへ足せば同じ穴を両方で見られる。
  {
    // ⚠ 豊洲だけを見ても、他の9つのピンが通る証明にはならない。
    //   取り込んだだけの土地で1つ通す。広島を選んだのは、東京以外だから。
    //   ⚠ 以前は「豊洲だけが専用の bbox を持つから」も理由だった（2026-08-20 に解消）。
    //     ⚠ **それでも、この検査は残す。**豊洲は 3D のピンの 1 つでしかない。
    name: "取り込んだだけの土地でも、3D が静的で成り立つ",
    path: "/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page, reqs) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      const tiles = reqs.filter((u) => /\/data\/bl\/14\//.test(u));
      must(tiles.length > 0, "建物タイルを読んでいない");
      // 詰めた形を読めていること。戻せていなければ建物は1つも建たない
      // ⚠ **建物の総数は、⚠ 3 つ目の問いの答えが持つ**（2026-08-22 以降。⚠ `#status` ではない）。
      //   ⚠ **見ている主張は同じ**（⚠ 建物が実際に建っていること）。
      const n = Number((t.match(/([\d,]+)\s*件\s*の建物が、この範囲にあります/) ?? [])[1]?.replace(/,/g, ""));
      must(n > 0, `建物が1件も建っていない（詰めた形を戻せていない）: ${t.slice(0, 200)}`);
      // ⚠ **場所が「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ いつ取り込んだ結果かが画面にあること）。
      // ⚠ **由来の行は「詳しく見る」の中**（2026-08-22。⚠ 畳んである）。
      //   ⚠ **`innerText` には出ない。**⚠ **`textContent` で読む**（⚠ 主張は同じ）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(
        (await page.locator("#landAll").textContent()).replace(/\s+/g, " ")),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      return `Overpass 0 件／タイル ${tiles.length} 枚／${n.toLocaleString()} 件を判定`;
    },
  },
  {
    // ⚠ **土地の答えは、⚠ 情報パネルの 1 か所だけ**（2026-08-21。hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 「土地の答えはここ（HUD）では見せない」。
    //   ⚠ **層の中身と順序は変えていない**（ADR 0030）。⚠ 変えたのは**置き場所**だけ。
    //
    // ⚠ **この決定が覆した前提**（⚠ 消さずに残す）:
    //   ⚠ `#land` は 2026-08-16 の実測を根拠に置かれた
    //     （⚠ スマホはパネルが閉じて始まるので、⚠ ここに無いと初期画面から答えが読めない）。
    //   ⚠ **測り直し**（Issue・375×667 / 320×640・豊洲と渋谷）:
    //     ⚠ **☰ を 1 回押すだけで、⚠ 第1層が画面内**（⚠ スクロール 0）。
    name: "土地の答えは、初期画面に出ず、☰ 1 回で読める", path: `/peel?${TOYOSU}`, group: "core",
    async check(page) {
      const out = [];
      for (const [w, h, t] of [[375, 667, true], [320, 640, true], [1280, 800, false]]) {
        for (const [nm, q] of [["豊洲", TOYOSU], ["渋谷", "ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7"]]) {
          const ctx = await page.context().browser().newContext({
            viewport: { width: w, height: h }, hasTouch: t, serviceWorkers: "block" });
          try {
            const p2 = await ctx.newPage();
            await p2.goto(`${BASE}/peel?${q}`, { waitUntil: "domcontentloaded", timeout: 45000 });
            await peelReady(p2);
            await p2.waitForFunction(
              () => (document.getElementById("landAll")?.textContent ?? "").includes("この土地は"),
              null, { timeout: 60000 });
            await settleAfterCondition(p2);
            // ⚠ AC1: `#land` が DOM に無い（⚠ 空要素でも残さない）
            must(await p2.$$eval("#land", (els) => els.length) === 0,
              `${nm} ${w}px: #land が DOM に残っている`);
            const shut = await p2.evaluate(() => ({
              hide: !document.getElementById("panel").classList.contains("open"),
              // ⚠ **実効 opacity まで見る**（⚠ 閉じたパネルは textContent が読める）
              txt: (() => { const seen = [];
                for (const e of document.querySelectorAll("body *")) {
                  if (!e.checkVisibility?.()) continue;
                  let o = 1;
                  for (let n = e; n && n !== document.documentElement; n = n.parentElement)
                    o *= Number(getComputedStyle(n).opacity);
                  if (o > 0.05 && e.children.length === 0) seen.push(e.textContent ?? "");
                }
                return seen.join(" ").replace(/\s+/g, " "); })(),
            }));
            // ⚠ **開閉の既定は幅で決まる**（⚠ 狭い＝閉じる ／ PC＝開く）。
            //   ⚠ ここを見ないと、⚠ **PC でも閉じて始まる不具合が通る**
            //     （⚠ ☰ を押して開くので、⚠ 下の AC3 は満たしてしまう。2026-08-21 に踏んだ）。
            must(shut.hide === (w < 1100),
              `${nm} ${w}px: パネルの初期状態が幅と合っていない（閉=${shut.hide}）`);
            if (shut.hide) {
              // ⚠ AC2: 閉じた初期画面に、⚠ 土地の答えの字が 0 か所
              for (const word of [WORDS.layerTitle(1), WORDS.layerTitle(3),
                                  "件の足元を判定"])
                must(!shut.txt.includes(word),
                  `${nm} ${w}px: 閉じた初期画面に土地の答えが出ている（「${word}」）`);
            }
            // ⚠ AC3: ☰ 1 回で、⚠ スクロール 0 のまま第1層が画面内
            if (shut.hide) { await p2.click("#toggle"); await settleAfterClick(p2); }
            const open = await p2.evaluate(() => {
              const e = document.querySelector("#landAll .land-q");
              const r = e?.getBoundingClientRect();
              return { top: r ? Math.round(r.top) : null, vh: innerHeight,
                scroll: document.getElementById("panel").scrollTop,
                // ⚠ AC4: 描く先は 1 つ（⚠ パネル）
                qs: document.querySelectorAll("#landAll .land-q").length };
            });
            must(open.top !== null, `${nm} ${w}px: 開いても第1層の見出しが無い`);
            must(open.scroll === 0, `${nm} ${w}px: 開いた直後にスクロールしている（${open.scroll}）`);
            must(open.top < open.vh,
              `${nm} ${w}px: 開いても第1層が画面の外（y${open.top} / 画面 ${open.vh}）`);
            out.push(`${nm} ${w}px y${open.top}`);
          } finally { await ctx.close(); }
        }
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ **「開いて増えた層に印」は、⚠ 2026-08-21 に消えた**（hidetzu/konjaku#152）。
    //   ⚠ hidetzu/konjaku#150 で足したもの。⚠ **HUD の要約を先に読んでいることが前提**だった。
    //     ⚠ 実測（2026-08-21）: ⚠ 要約（第1層＋第3層・72 字）を読んでからパネルを開くと、
    //       ⚠ **同じ層をもう一度読む**。⚠ 利用者役 4/4 が気づき、⚠ 困るかは 2/2 に割れた。
    //     ⚠ そこで「⚠ 増えた層（第2層）だけに区切りと余白の印」を付けた。
    //   ⚠ **Owner 判断（2026-08-21）で HUD の要約そのものが無くなった**ので、
    //     ⚠ **「増えた」と言える前提が消えた。**⚠ 残すと嘘になる。
    //   ⚠ **引き継ぐ主張**: ⚠ **土地の答えは 1 か所だけ**（⚠ 二度読みが起きない）。
    //     ⚠ それは「PC でパネルを閉じても、HUD に答えが戻らない」などが見ている。
    //   ⚠ **印そのものが戻っていないこと**は、ここで見る。
    name: "開いて増えた層の印は、もう付かない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await page.waitForFunction(
        () => (document.getElementById("landAll")?.textContent ?? "").includes("この土地は"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => ({
        added: document.querySelectorAll(".land-added").length,
        layers: [...document.querySelectorAll("#landAll .land-layer .land-q")]
          .map((e) => e.textContent.trim()),
        land: document.querySelectorAll("#land").length,
      }));
      must(r.land === 0, "HUD の要約（#land）が戻っている");
      must(r.added === 0,
        `「増えた層」の印が付いている（要約が無いので「増えた」と言えない）: ${r.added} 個`);
      must(r.layers.length === 3, `層が 3 つ出ていない: ${r.layers.join(" / ")}`);
      return `印 0 個／層 ${r.layers.length}（${r.layers.map((x) => x.slice(0, 5)).join("→")}）`;
    },
  },
  // ⚠ **小さくしているあいだ、⚠ 断りは残し、⚠ 操作の案内だけ畳む**（2026-08-23。Owner 判断）。
  //   ⚠ **断りを畳むと、⚠ 3D で建物が消えるのを見ている人に「推定です」が届かない**（掟 §1・§4-1）。
  //   ⚠ **狭い幅だけ。**⚠ **PC は板と地図が並ぶので覆っていない。**⚠ **PC で畳むと、
  //     ⚠ PC には ? が無いので出す手段が無くなる**（⚠ 実際にそうなった。特異度で負けていた）。
  {
    name: "小さくしても断りは出ている（畳むのは操作の案内だけ・狭い幅）",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll('#notes li[data-kind="caveat"]').length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const look = () => page.evaluate(() => ({
        open: document.getElementById("panel").classList.contains("open"),
        caveats: [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
          .map((e) => e.checkVisibility()),
        tips: [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.checkVisibility()),
        help: (() => { const h = document.getElementById("noteHelp");
          const r = h.getBoundingClientRect();
          return { on: h.checkVisibility(), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      }));
      const mini = await look();
      must(!mini.open, "小さい状態で始まっていない（この検査が別の状態を見ている）");
      must(mini.caveats.length > 0, "断りが 1 行も無い（この検査が何も見ていない）");
      must(mini.caveats.every(Boolean),
        `小さくしたら断りが消えた（推定を実測のように見せている。掟 §1）: ${mini.caveats.join()}`);
      if (mini.tips.length) {
        must(!mini.tips.some(Boolean), "小さいのに操作の案内が出ている（畳む対象）");
        // ⚠ **畳んだなら、⚠ 出す手段がある**（ADR 0026 の裏。⚠ 消したのではない）
        must(mini.help.on, "案内を畳んだのに ? が出ていない（出す手段が無い）");
        must(mini.help.w >= 44 && mini.help.h >= 44,
          `? が 44×44 を割っている: ${mini.help.w}×${mini.help.h}`);
        await page.click("#noteHelp");
        await settleAfterClick(page);
        const opened = await look();
        must(opened.tips.every(Boolean), "? を押しても案内が出ない（押しても何も起きない）");
      }
      return `断り ${mini.caveats.length} 行は出たまま／案内 ${mini.tips.length} 行は ? の中`;
    },
  },
  // ⚠ **PC では畳まない**（2026-08-23）。⚠ **PC に ? は無い**ので、⚠ 畳むと戻せない。
  {
    name: "PC では、小さくしても操作の案内が消えない",
    path: `/peel?${TOYOSU}`, viewport: { width: 1280, height: 950 },
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll("#notes li").length > 0, null, { timeout: 60000 });
      await settleAfterCondition(page);
      // ⚠ **PC は広げた状態で始まる。**⚠ 1 回押して小さくする。
      await page.click("#toggle");
      await settleAfterClick(page);
      const r = await page.evaluate(() => ({
        open: document.getElementById("panel").classList.contains("open"),
        notes: [...document.querySelectorAll("#notes li")]
          .map((e) => `${e.dataset.kind}:${e.checkVisibility()}`),
        layers: [...document.querySelectorAll("#landAll .land-layer")]
          .filter((e) => e.checkVisibility()).length,
        help: document.getElementById("noteHelp").checkVisibility(),
      }));
      must(!r.open, "PC で小さくできていない（この検査が別の状態を見ている）");
      must(r.notes.length > 0, "補足が 1 行も無い（この検査が何も見ていない）");
      must(r.notes.every((n) => n.endsWith(":true")),
        `PC で小さくしたら補足が消えた（? が無いので戻せない）: ${r.notes.join(" / ")}`);
      must(r.layers === 3, `PC で小さくしたら問いが減った: ${r.layers} 個`);
      must(!r.help, "PC に ? が出ている（畳んでいないので押す相手がいない。ADR 0026）");
      return `補足 ${r.notes.length} 行とも出たまま／問い ${r.layers} 個／? は出ない`;
    },
  },
  // ⚠ **主見出しと内訳の分母がそろっていること**（2026-08-23。Owner 判断。掟 §6）。
  //   ⚠ **豊洲では一致するので、⚠ 豊洲だけ見ていると気づけない。**
  //   ⚠ **整備範囲の端（渋谷）で見る**（⚠ 実測: ⚠ 範囲の 86.7% は区分が付いていない）。
  {
    name: "面積の内訳は、主見出しと同じ分母で、足して 100 になる",
    path: "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7", group: "core",
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const L = [...document.querySelectorAll("#landAll .land-layer")][1];
        const den = (L?.querySelector(".land-den")?.textContent ?? "").replace(/\s+/g, " ").trim();
        const head = (L?.querySelector(".land-num")?.textContent ?? "").trim();
        const rows = [...document.querySelectorAll("#areaBreak .stat")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim());
        return { den, head, rows };
      });
      must(r.rows.length > 1, `内訳が出ていない: ${r.rows.join(" / ")}`);
      // ⚠ **範囲の大きさを言っている**（掟 §6: ⚠ どの範囲の数字かを明示する）
      must(/\d+×\d+m/.test(r.den), `範囲の大きさを言っていない: 「${r.den}」`);
      // ⚠ **特定できなかったぶんを、⚠ 行として出す**（掟 §1）
      must(r.rows.some((t) => /区分が分からない/.test(t)),
        `特定できなかったぶんを隠している: ${r.rows.join(" / ")}`);
      // ⚠ **足して 100**（⚠ 「0.1% 未満」は 0 で数える。⚠ 丸めのぶん 1.0 まで許す）
      const sum = r.rows.reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      must(Math.abs(sum - 100) <= 1.0,
        `内訳が足して 100 にならない（${sum.toFixed(1)}%）: ${r.rows.join(" / ")}`);
      // ⚠ **主見出しと、⚠ 内訳の水が食い違わない**（⚠ 同じ分母なので近いはず）。
      //   ⚠ **水かどうかは `swale.js` が持つ**（⚠ ここで区分名を書き写さない。掟）。
      //   ⚠ **「0.1% 未満」の行は 0 で数える**ので、⚠ そのぶん内訳のほうが小さく出る。
      const wetNames = await page.evaluate(() =>
        (KonjakuSwale.SWALE ?? []).filter((c) => c.water).map((c) => c.name));
      const w = r.rows.filter((t) => wetNames.some((n) => t.startsWith(n)))
        .reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      const head = Number(String(r.head).replace(/[^\d.]/g, ""));
      must(Math.abs(w - head) <= 0.5,
        `主見出し ${head}% と、⚠ 内訳の水 ${w.toFixed(1)}% が食い違う（分母が違う）`);
      return `${head}%／内訳 ${r.rows.length} 行・合計 ${sum.toFixed(1)}%／「${r.den}」`;
    },
  },
  // ⚠ **明治期のデータが無い地点で、⚠ 右端を「明治期」にしない**（hidetzu/konjaku#170）。
  //   ⚠ **前は `/peel` が無条件に明治期を足していた**（⚠ トップは判定できたときだけ足していた）。
  //     ⚠ **同じ問いに 2 つの実装があり、⚠ 答えが違っていた。**
  //   ⚠ **実測（2026-08-23・375×667）**: ⚠ 札幌の段は「現在 1974–78 1945–50 **明治期**」で、
  //     ⚠ **押しても水域は出なかった**（⚠ 押しても何も起きない段。ADR 0026）。
  //   ⚠ **静的では捕まらない。**⚠ その土地に低湿地データがあるかは、⚠ 動かさないと分からない。
  {
    name: "明治期のデータが無い地点では、右端を「明治期」にしない",
    path: `/peel?${SAPPORO}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const labels = await stepLabels(page);
      must(labels.length > 1, `段が 1 つも組めていない: ${labels.join("/")}`);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      // ⚠ **本題**: ⚠ 明治期が段に出ていないこと（⚠ 右端だけでなく、⚠ どこにも）
      must(!labels.includes("明治期"),
        `明治期のデータが無いのに段に出している: ${labels.join("/")}`);
      // ⚠ **消したのは明治期だけ。**⚠ **写真の段は残っている**（⚠ 段ごと消していない）
      must(labels.length >= 3, `写真の段まで消えている: ${labels.join("/")}`);
      // ⚠ **理由は画面が言う**（⚠ 黙って消さない。掟 §1）
      const why = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      must(/整備対象外/.test(why),
        `明治期を段から外したのに、⚠ 理由を言っていない: ${why.slice(0, 100)}`);
      // ⚠ **常時見える場所（ものさしの注記）でも言うこと**（2026-08-23 に踏んだ）。
      //   ⚠ **段の有無で分岐していたので、⚠ 段を消したら断りごと消えた**
      //     （⚠ 実測: 「空中写真 5 段 ／ 明治期はこの土地では未整備」→「空中写真 5 段」）。
      //   ⚠ **スマホの初期画面では、⚠ ここが唯一その事実に触れる場所**
      //     （⚠ パネルの「整備対象外」は、⚠ 小さいあいだ畳まれている）。
      const note = await page.evaluate(() =>
        (document.getElementById("rlNote")?.textContent ?? "").replace(/\s+/g, " ").trim());
      must(/明治期はこの土地では未整備/.test(note),
        `ものさしの注記が、⚠ 明治期が無いことを言っていない: 「${note}」`);
      must(!/明治期は地図/.test(note), `データが無いのに「明治期は地図」と約束している: 「${note}」`);
      return `${labels.length} 段（${labels.join("/")}）／右端 ${labels.at(-1)}／理由は画面にある`;
    },
  },
  // ⚠ **明治期のデータがある地点では、⚠ いままでどおり右端が「明治期」**（⚠ 対で見る）。
  //   ⚠ **「消した」だけの検査にしない**（`verify` §5）。
  {
    name: "明治期のデータがある地点では、右端は「明治期」のまま",
    path: `/peel?${TOYOSU}`, viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const labels = await stepLabels(page);
      must(labels.at(-1) === "明治期", `右端が明治期でない: ${labels.join("/")}`);
      // ⚠ **注記も、⚠ いままでどおり「明治期は地図」**（⚠ 対で見る。`verify` §5）
      const note = await page.evaluate(() =>
        (document.getElementById("rlNote")?.textContent ?? "").replace(/\s+/g, " ").trim());
      must(/明治期は地図/.test(note), `注記が「明治期は地図」と言っていない: 「${note}」`);
      return `${labels.length} 段（右端 ${labels.at(-1)}）／注記「${note}」`;
    },
  },
  // ⚠ **押したら地図が本当に変わること**（2026-08-23。⚠ **実際に壊れていた**）。
  //   ⚠ **`wireProvPeek()` を `describe()` が呼んでいたが、⚠ ボタンを作るのは `paintBreakdown`** で、
  //     ⚠ **そちらが後に走る。**⚠ **繋いだ直後に `#breakdown` ごと差し替えられて listener が消えていた。**
  //   ⚠ **静的検査では捕まらない。**⚠ **DOM を組み立てただけでは、⚠ listener の有無は分からない。**
  //   ⚠ **押す位置では測らない。**⚠ 実測（2026-08-23・1280×950）: ⚠ **的は y=1129 で画面の外**
  //     （⚠ パネルの中で送られている）。⚠ **マウスで押すと、⚠ 直っていても外れる。**
  {
    name: "「地図で光らせる」を押しているあいだ、地図の塗りが変わる", path: `/peel?${TOYOSU}`,
    async check(page) {
      await page.waitForFunction(
        () => document.querySelectorAll("#breakdown button.peek").length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const paint = () => page.evaluate(
        `JSON.stringify(map.getPaintProperty("bld","fill-extrusion-color"))`);
      const ids = await page.evaluate(
        () => [...document.querySelectorAll("#breakdown button.peek")].map((b) => b.id));
      must(ids.length > 0, "「地図で光らせる」が 1 つも無い");
      const before = await paint();
      const seen = [];
      for (const id of ids) {
        await page.evaluate((i) => document.getElementById(i)
          .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), id);
        await settleAfterClick(page);
        const on = await paint();
        must(on !== before, `${id} を押しても地図の塗りが変わらない（listener が消えている）: ${on}`);
        await page.evaluate(
          () => dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
        await settleAfterClick(page);
        // ⚠ **離したら戻る**（⚠ 押しているあいだだけ、が仕様）
        must(await paint() === before, `${id} を離しても、地図の塗りが戻らない`);
        seen.push(id);
      }
      return `${seen.length} 個（${seen.join(" / ")}）が、押しているあいだだけ地図を変えた`;
    },
  },
  {
    name: "高さが推定であることを、主張範囲の数字で 1 か所だけ言う", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // ⚠ **建物の総数は、⚠ 3 つ目の問いの答えが持つ**（2026-08-22 以降。⚠ `#status` ではない）。
      //   ⚠ **見ている主張は同じ**（⚠ 建物が実際に建っていること）。
      const total = Number((t.match(/(\d+)\s*件\s*の建物が、この範囲にあります/) ?? [])[1]);
      must(total > 0, `件数が読めない: ${t.slice(0, 80)}`);
      // 「いま画面に出ているもの」に高さの行があること（畳んでいないこと）
      const prov = await provText(page);
      must(/高さ/.test(prov), `出所の一覧に高さの行が無い: ${prov.replace(/\s+/g, " ").slice(0, 120)}`);
      must(/既定値/.test(prov), "高さが推定であることが書かれていない");
      // ⚠ **数え方は「推定」を主語に統一した**（2026-08-21。Owner 判断）。
      //   ⚠ 前は台帳が「OSM に高さが入っているのは 40 / 543 件」（⚠ **実測が主語**）で、
      //     ⚠ #est が「高さも 503 / 543 件が推定です」（⚠ **推定が主語**）だった。
      //     ⚠ **同じ母数を逆から 2 通りに言っていた**（40 ＋ 503 = 543）。
      //     ⚠ 利用者役 4 名のうち 2 名が突き合わせられず、⚠ 1 名は「別のことだと思った」。
      //   ⚠ **母数つきの主張は #est の 1 か所。**⚠ 台帳は内訳（⚠ 同じ数字を持たない）。
      // ⚠ **2026-08-21 に、⚠ 分母つきは帯からパネルへ移った**（hidetzu/konjaku#151）。
      //   ⚠ **見ている主張は同じ**: ⚠ 推定を主語に、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。
      // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断）。⚠ **主張は同じ**:
      //   ⚠ **推定の件数が、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。**
      const bd = await page.evaluate(() =>
        (document.getElementById("breakdown")?.textContent ?? "").replace(/\\s+/g, " "));
      const mh = bd.match(/高さが分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(mh, `高さの件数が分母つきで出ていない: ${bd.slice(0, 120)}`);
      must(Number(mh[2]) === total,
        `高さの分母が主張範囲と違う: ${mh[2]} / 判定した件数 ${total}`);
      // ⚠ **推定は「実測でない分」**（⚠ 総数 − 実測）。⚠ **半分を超えていること。**
      const m = [null, String(Number(mh[2]) - Number(mh[1])), mh[2]];
      must(Number(m[1]) > Number(m[2]) * 0.5,
        `推定が半分以下なのに「ほとんどが既定値」と書いている: ${m[1]}/${m[2]}`);
      // ⚠ **同じ母数を、⚠ 実測を主語にしてもう一度言っていないこと**
      must(!/高さが入っているのは \d+ \/ \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **行の名を「高さが実測」→「高さが分かる」に変えた**（2026-08-23。Owner 判断）。
      //   ⚠ **否定形なので、⚠ 字を古いままにすると「見ていないのに緑」になる。**
      must(!/高さが(実測|分かる)の \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている（押す先の名前）: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **内訳は足して推定の件数になること**（⚠ 台帳が持つのは内訳だけ）
      // ⚠ **内訳の言い方も変わった**（2026-08-22）: 「階数から換算 X 件 ／ 種別ごとの既定値 Y 件」
      const mm = bd.match(/階数から換算\s*(\d+)\s*件\s*／\s*種別ごとの既定値\s*(\d+)\s*件/);
      must(mm, `高さの内訳が読めない: ${bd.slice(0, 160)}`);
      must(Number(mm[1]) + Number(mm[2]) === Number(m[1]),
        `内訳が推定の件数と合わない: ${mm[1]} ＋ ${mm[2]} ≠ ${m[1]}`);
      // ⚠ 内訳の表には入れない。あの表は足元の判定の**分割**（足すと総数になる）で、
      //   高さや建設年は**素性**なので、混ぜると足し算の合わない表になる。
      must(!/高さが(実測|分かる)の建物/.test(t), "素性（高さ）が、分割の表である内訳に混ざっている");
      // ⚠ 評価語を作らない
      for (const w of ["ほぼ正確", "おおむね", "信頼度", "精度は"])
        must(!t.includes(w), `評価語が入っている: 「${w}」`);
      return `${m[1]} / ${m[2]} 件が推定（判定した件数と一致）／内訳 ${mm[1]} ＋ ${mm[2]}`;
    },
  },
  // ================= 外部から来た文字列 =================
  // ⚠ ここが緑であることが、この不具合が戻っていないことの根拠。
  //   静的検査は「外部の受け皿を生で書いていないか」しか見られない（変数に写せば素通りする）。
  {
    // ⚠ 建物を取り込んでいない土地を使う。取り込み済みだと静的タイルで答えるので、
    //   Overpass の差し替えが効かない（＝何も確かめずに必ず通る検査になる）
    // ⚠ 検索候補の経路は 2026-08-18 に消えた（/peel から検索を外した）。
    //   ⚠ **代わりに、いま残っている経路を見る。**地名は共有された URL の `?q=` から入り、
    //     画面に地名として描かれる。押させるだけで届くので、injection の経路としては同じ。
    name: "外部の文字列が、3D の地名と建物カードで実行されない",
    path: `/peel?ll=35.65360,139.90200&q=${encodeURIComponent(`千葉県浦安市${XSS}`)}`,
    setup: (page) => Promise.all([
      // 建物の種別（building）と建設年（start_date）は OSM のタグそのもの
      page.route((u) => /overpass/i.test(u.href), (r) => {
        const ring = (lon, lat, d) => [[lon - d, lat - d], [lon + d, lat - d],
          [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]
          .map(([x, y]) => ({ lat: y, lon: x }));
        r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ elements: [0, 1, 2].map((i) => ({
            type: "way", id: 100 + i,
            geometry: ring(139.9020 + (i - 1) * 0.0012, 35.6540, 0.00045),
            tags: { building: `yes${XSS}`, start_date: `1968${XSS}` },
          })) }) });
      }),
      // 静的タイルを迂回して、注入したOSMタグがカードに届く経路を検査する。
      page.route("**/data/bl/index.json", (r) => r.abort()),
    ]),
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ---- 建物カード（押した先）----
      const pt = await page.evaluate(() => {
        const cv = map.getCanvas();
        for (let y = 0.25; y < 0.8; y += 0.05)
          for (let x = 0.25; x < 0.8; x += 0.05) {
            const p = [Math.round(cv.clientWidth * x), Math.round(cv.clientHeight * y)];
            if (map.queryRenderedFeatures(p, { layers: ["bld"] }).length) return { x: p[0], y: p[1] };
          }
        return null;
      });
      must(pt, "建物が1棟も描かれていない（押す先が無い）");
      await page.mouse.click(pt.x, pt.y);
      // ⚠ **2026-08-21 に、⚠ 建物の中身は吹き出しの 1 か所だけになった**
      //   （⚠ パネルの `#pick` を消した）。⚠ **見ている主張は同じ**:
      //   ⚠ 外から来た文字列（OSM の名前・種別）が、⚠ **実行されず、字のまま出ること。**
      await page.waitForFunction(
        () => (document.querySelector(".pick-pop .maplibregl-popup-content")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, ".pick-pop", "建物の吹き出し");
      await shownAsText(page, ".pick-pop", "建物の吹き出しの種別と建設年");
      // ---- 共有された URL の地名（?q=）----
      // ⚠ パネルを開かないと出ない場所も見る。開かない人には見えないが、DOM には入る
      await page.evaluate(() => document.getElementById("panel")?.classList.remove("hide"));
      await notRun(page, "#placeName", "3D の地名");
      const t = await shownAsText(page, "#placeName", "3D の地名（共有された URL 由来）");
      return `建物カード・吹き出し・地名で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」`;
    },
  },
];
