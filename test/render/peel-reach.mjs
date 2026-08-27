// 実描画 — 見えて、届いて、戻れる（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 17 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 4 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **依存を 4 つの道で測ってから切った**（hidetzu/konjaku#317 の反省）:
//     親のローカル定義 0 ／ `lib.mjs` の 5 つ ／ `globalThis` 無し ／ 相対 import 無し
//
// ⚠ **ここが守っているもの**（⚠ どれも ⚠ **「出ている」だけでは足りない**）:
//     覆わない   ⚠ **画面が低くても、⚠ 下の箱が調べている地点を覆わない**
//                ⚠ **上限に当たっても、⚠ 中身を縮めない**（⚠ スクロールできること）
//     届く       ⚠ **見えない操作に、⚠ キーボードで届かない**（⚠ 隠れているのに焦点が当たらない）
//     押せる     ⚠ **年代の頭を細くしても、⚠ 押せる大きさと名乗りは残る**
//     戻れる     ⚠ **根拠を全画面で読んでも、⚠ 戻る 2 つが上に残る**
//                ⚠ **中身をスクロールしても消えない**
//
// ⚠ **`.claude/rules/testing.md`: ⚠ 見えているだけでなく、⚠ 実際に操作できること。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, peelReady, settleAfterCondition, settleAfterClick, must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **下から伸びる箱が、⚠ 調べている地点を覆ってはいけない。**
    //
    // ⚠ **2026-08-21 に、⚠ 答えの板（#land）が無くなった**（hidetzu/konjaku#152。Owner 判断）。
    //   ⚠ 前の主張は「⚠ 下から伸びる箱（#hud）が、⚠ 答えの板を押しのけない」だった。
    //     ⚠ 実測（2026-08-19・320×480・過去の段）: #hud が #land に **92px** 食い込み、
    //       ⚠ 「99.6%」の 4 文字しか読めなかった。⚠ **画面が低いほど強い実測が消える**作りだった。
    //     ⚠ CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」を踏んだ記録。
    //   ⚠ **押しのける相手が無くなった。**⚠ **主張は引き継ぐ**:
    //     ⚠ **画面が低くても、⚠ 下の箱が調べている地点（画面中央）を覆わない。**
    //     ⚠ **潰さない**（⚠ 上限だけ掛けて中身が 27px になった記録がある）。
    name: "画面が低くても、下の箱が調べている地点を覆わない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 480 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 過去の段がいちばん厳しい（#over が増える）
      await page.evaluate(() => { const s = document.getElementById("t");
        s.value = "500"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const hud = document.getElementById("hud"), hr = hud.getBoundingClientRect();
        // ⚠ **断りは HUD の外（`#notice`）へ出した**（2026-08-22。hidetzu/konjaku#168）。
        //   ⚠ **主張は変えていない**（⚠ 画面のどこかで、⚠ **読める形で**出ていること）。
        const nt = document.getElementById("notes");
        const nb = nt.getBoundingClientRect();
        return { hudTop: Math.round(hr.top), hudH: Math.round(hr.height),
          scroll: hud.scrollHeight, mid: Math.round(innerHeight / 2),
          land: document.querySelectorAll("#land").length,
          text: hud.innerText.replace(/\s+/g, " ").trim(),
          notice: nt.innerText.replace(/\s+/g, " ").trim(),
          noticeOn: nt.checkVisibility(), noticeBottom: Math.round(nb.bottom),
          overlap: Math.round(Math.min(nb.bottom, hr.bottom) - Math.max(nb.top, hr.top)) };
      });
      // ⚠ **調べている地点（画面中央）を覆わない**
      must(r.hudTop > r.mid,
        `下の箱が調べている地点を覆っている: 箱の上端 ${r.hudTop} / 中央 ${r.mid}`);
      // ⚠ **潰していない**（⚠ 中身が入りきらないなら、⚠ 消さずに中でスクロール）
      must(r.hudH >= 100, `下の箱が ${r.hudH}px まで潰れている（読めない）`);
      // ⚠ **中身を縮めていないこと。**⚠ 上限に当たったら、⚠ **スクロールで見せる。**
      //   ⚠ 実測で踏んだ（2026-08-21・320×640）: 上限だけ掛けたら flex の子が縮み、
      //     ⚠ **中身 381 → 300px に潰れ、⚠ スクロールもできず**
      //     ⚠ 「空中写真 8 段 ／ 明治期は地図」が読めなくなった（⚠ scrollHeight == height）。
      must(r.scroll > r.hudH,
        `上限に当たったのに中身を縮めている（スクロールできない）: 中身 ${r.scroll} / 箱 ${r.hudH}`);
      // ⚠ **板の中でも潰れていないこと**（⚠ 縮められると、⚠ 板の内側があふれる）
      const crushed = await page.evaluate(() =>
        [...document.querySelectorAll("#hud > *")]
          .filter((e) => e.scrollHeight > Math.ceil(e.getBoundingClientRect().height) + 1)
          .map((e) => `${e.id || e.className}: 中身 ${e.scrollHeight} / 箱 ${
            Math.round(e.getBoundingClientRect().height)}`));
      must(!crushed.length, `下の箱の中で、板が潰れている: ${crushed.join(" ／ ")}`);
      // ⚠ **答えの板は戻っていない**（⚠ 戻ると、⚠ また答えが 2 か所になる）
      must(r.land === 0, "答えの板（#land）が戻っている（土地の答えはパネルの 1 か所）");
      // ⚠ **断りは残っている**（⚠ 消さずに移した、が守れているか）。
      //   ⚠ **場所は HUD の外**だが、⚠ **画面から消えたら同じこと**なので、ここで見る。
      must(r.noticeOn && /推定/.test(r.notice),
        `補足の層から断りが消えている: 見える=${r.noticeOn} ／ ${r.notice.slice(0, 60)}`);
      // ⚠ **いちばん低い画面（480）で、⚠ 補足と下の箱がぶつからない**
      must(r.overlap <= 0, `補足と下の箱が ${r.overlap}px 重なっている`);
      // ⚠ **補足も、調べている地点を覆わない**
      must(r.noticeBottom < r.mid,
        `補足が調べている地点を覆っている: 下端 ${r.noticeBottom} / 中央 ${r.mid}`);
      return `320×480・過去の段で 箱の上端 ${r.hudTop} > 中央 ${r.mid}`
        + ` ／ 箱 ${r.hudH}px（中身 ${r.scroll}px）／答えの板は無い`;
    },
  },
  {
    // ⚠ **見えないものに焦点を当てない。**（掟: 押しても何も起きない導線を置かない）
    //   実測（2026-08-19）: 幅ごとに使わない側の操作が DOM に残り、キーボードで到達できた。
    //     320 幅 … 帯の畳み / #play / #t とドラムのボタン 9 個
    //     PC     … ドラムのボタン 9 個（⚠ これは main からあった漏れ）
    //     根拠を全画面で読んでいるとき … #toggle / 年代の畳み / ものさしの ‹ ›
    //   ⚠ **畳みボタンは 2026-08-22 に両方とも消した。**⚠ 上は当時の実測なので残す。
    //     ⚠ 「隠れているのに aria-expanded と名乗らない」を見ていた 3 行は、
    //       ⚠ **見る相手が居なくなり、⚠ 何も確かめずに必ず通る状態**だったので落とした
    //       （Owner 判断・2026-08-22。⚠ **数だけ合わせる検査は置かない**）。
    //     ⚠ 畳み機構が戻っていないことは、⚠ **別のケースが `[aria-expanded]` を数えて見る。**
    name: "見えない操作に、キーボードで届かない", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **「幅 0 ＋ tabIndex≥0」では足りない**（2026-08-23）。
      //   ⚠ **`display:none` / `visibility:hidden` は、⚠ ブラウザ自身が焦点の順から外す。**
      //   ⚠ **それを「漏れ」と数えると、⚠ 見えない＝安全なものまで落ちる**
      //     （⚠ 実際に落ちた: ⚠ 板を小さくすると `#breakdown` ごと `display:none` になる
      //      ⚠ `peekH` / `peekY` を、⚠ 「焦点が当たる」と報告した）。
      //   ⚠ **実際に焦点を当てて、⚠ 当たったかで見る**（`ui-ux-review` §3）。
      //     ⚠ **これは heuristic ではない。**⚠ **ブラウザの答えそのもの。**
      //   ⚠ **見えているものは戻す**（⚠ 検査が焦点を動かしたまま次へ行かない）。
      const leaks = () => page.evaluate(() => {
        const was = document.activeElement;
        const bad = [];
        // ⚠ **測れていない穴を、⚠ 先に書いておく**（掟: ⚠ 測っていないことを「確認済み」と書かない）。
        //   ⚠ **見ているのは「自分の矩形が 0 なのに焦点が当たる」だけ。**
        //   ⚠ **0×0 の `overflow:hidden` の中に押せるものを置くと、⚠ ここでは捕まらない**
        //     （⚠ 子は自分の矩形を持つため。⚠ 2026-08-23 にわざと壊して確かめた）。
        //   ⚠ **祖先の 0 面積まで見る案は捨てた**（⚠ 地図の帰属リンクまで拾って広すぎた）。
        //   ⚠ **本当に強く見るなら Tab を順に押す**（`ui-ux-review` §3）。⚠ **まだやっていない。**
        for (const e of document.querySelectorAll("button,input,a[href]")) {
          const r = e.getBoundingClientRect();
          if (r.width !== 0 && r.height !== 0) continue;   // 見えているものは対象外
          if (e.inert || e.closest("[inert]")) continue;
          e.focus();
          if (document.activeElement === e) bad.push(e.id || e.textContent.trim().slice(0, 8) || e.tagName);
        }
        if (was instanceof HTMLElement) was.focus(); else document.activeElement?.blur?.();
        return bad;
      });
      // ⚠ **`e.inert` は親から継いだ状態を返さない。**
      //   実測（2026-08-19）: 親（#ruler）を inert にしても、子の ‹ › は e.inert=false のままで、
      //   ⚠ 「閉じすぎる」を壊しても検査が緑になった。**closest で親まで見る。**
      const used = (ids) => page.evaluate((ids) => ids.filter((id) => {
        const e = document.getElementById(id);
        return !e || e.inert || !!e.closest("[inert]");
      }), ids);

      // ---- 地図を見ているとき ----
      const a = await leaks();
      // ⚠ **✕ は消えた**（2026-08-22。⚠ 同じ的（`#toggle`）が広げる／小さくするを兼ねる）。
      //   ⚠ **例外にする相手がいなくなった。**⚠ **主張は同じ**（⚠ 見えないのに焦点が当たらない）。
      const aBad = a;
      must(!aBad.length, `見えないのに焦点が当たる: ${aBad.join("、")}`);
      // ⚠ 使う側まで閉じていないこと（閉じすぎると操作できなくなる）
      const aStuck = await used(["rlPrev", "rlNext", "toggle"]);
      must(!aStuck.length, `使う操作が閉じている: ${aStuck.join("、")}`);
      // ---- 根拠を全画面で読んでいるとき ----
      await page.click("#toggle");
      await settleAfterClick(page);
      const b = await leaks();
      must(!b.length, `根拠を読んでいるのに、地図側の操作に焦点が当たる: ${b.join("、")}`);
      // ⚠ 戻る手段は閉じない
      // ⚠ **戻る手段は `#toggle`（▴ 地図に戻る）と `#back`（← 今昔へ）の 2 つ**（2026-08-23）。
      const bStuck = await used(["toggle", "back"]);
      must(!bStuck.length, `戻る手段が閉じている: ${bStuck.join("、")}`);

      // ---- 小さくしたら元に戻る ----
      await page.click("#toggle");
      await settleAfterClick(page);
      const c = await used(["rlPrev", "rlNext", "toggle"]);
      must(!c.length, `根拠を閉じたのに、操作が閉じたまま: ${c.join("、")}`);
      return `地図のとき ${aBad.length} 件／根拠を読むとき ${b.length} 件／閉じたら戻る`;
    },
  },
  {
    // ⚠ 年代の頭を細くする。狭い画面ほど地図が見えなくなるため。
    //   実測（2026-08-19・320幅・1936–42 の段）: 箱が画面の **82%** を占めていた。
    //     年代 76px（⚠ 2 行に割れて 38px 損）／但し書き 69px／いまのもの 42px／押すと 30px
    // ⚠ **押せる大きさ 44×44 は削らない**（掟）。削るのは見た目の幅だけ。
    // ⚠ 「表示中」は消すが、**出ていないときは必ず名乗る**
    //   （「出ていないものを表示中と言わない」で入れた性質。崩さない）。
    // ⚠ **畳む仕掛けは 2026-08-22 に無くなった**（年代の箱ごと #timePanel へ寄せ、
    //   ⚠ 帯の畳みボタンも Owner 判断で消した）。⚠ **戻っていないことを、ここで見る。**
    //   ⚠ **「消した」だけの検査にしない**（verify §5）。⚠ **残っている押しどころ（‹ ›）が
    //   44px を割っていないこと**と対で見る。
    name: "年代の頭を細くしても、押せる大きさと名乗りは残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 320, height: 640 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const at = (k) => page.evaluate((k) => {
        const s = document.getElementById("t");
        if (Number(s.max) < k * 100) return false;
        s.value = String(k * 100); s.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }, k);
      const read = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right),
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        // ⚠ 文字が本当に箱に収まっているか。**枠ではなく文字の実寸**で見る
        const y = document.querySelector("#timePanel .y");
        const rng = document.createRange(); rng.selectNodeContents(y);
        const tr = rng.getBoundingClientRect();
        const box = document.getElementById("timePanel").getBoundingClientRect();
        const kick = document.querySelector("#timePanel .kick");
        return { y: g("#timePanel .y"), prev: g("#rlPrev"), next: g("#rlNext"),
          // ⚠ 畳む仕掛けが**戻っていないこと**。⚠ 1 つでもあれば数に出る
          // ⚠ **数えるのは年代の器の中だけ**（2026-08-23）。⚠ **画面全体から数えると、
          //   ⚠ 板の開閉（`#toggle`）と補足の ? （`#noteHelp`）まで拾う**（⚠ 実際に拾った）。
          //   ⚠ **主題は「年代の畳み」。**⚠ **別の id で作り直されても捕まえる**ため
          //     ⚠ `[aria-expanded]` は残す。⚠ **範囲を `#hud` に絞る。**
          toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
          textW: Math.round(tr.width), boxRight: Math.round(box.right), textRight: Math.round(tr.right),
          kickText: kick ? kick.textContent.trim() : null,
          eraH: Math.round(box.height) };
      });
      // ---- ① どの段でも、年代は 1 行で、箱からはみ出さない ----
      const heights = [];
      for (let k = 0; k < 9; k++) {
        if (!await at(k)) break;
        await page.waitForTimeout(250);
        const r = await read();
        must(r.y.h <= 46, `年代「${r.y.t}」が 2 行に割れている（${r.y.h}px）。そのぶん地図が減る`);
        must(r.textRight <= r.boxRight, `年代「${r.y.t}」が箱からはみ出している`);
        // ⚠ **普段は名乗らない。**出ているのが当たり前のときに主役から目を奪わない
        must(!r.kickText, `届いているのに「${r.kickText}」と名乗っている`);
        heights.push(r.eraH);
      }
      must(heights.length >= 4, `段が少なすぎて検査にならない（${heights.length}）`);

      // ---- ② 畳む仕掛けは戻っていない。⚠ 残っている押しどころは 44px を割らない ----
      const r = await read();
      // ⚠ **畳む仕掛けは 2026-08-22 に消した。**⚠ 戻すと、また「押しても何が起きるか
      //   分からない ⌄」が増える（利用者役 4 名で、押す前に伝わったのは 2/4 だった）。
      //   ⚠ `[aria-expanded]` まで数えるのは、⚠ **別の id で作り直されても捕まえるため。**
      must(r.toggles === 0,
        `畳む仕掛けが戻っている（${r.toggles} 個）。年代の箱ごと #timePanel へ寄せ、帯の畳みも消したはず`);
      // ⚠ **対で見る。**⚠ 「消した」だけだと、⚠ **押しどころを全部消しても緑になる**
      for (const [nm, x] of [["‹（前の年代）", r.prev], ["›（次の年代）", r.next]]) {
        must(x, `${nm} が無い（狭い幅の年代操作が消えている）`);
        must(x.w >= 44 && x.h >= 44, `${nm} が指で押せない（${x.w}×${x.h}）`);
      }
      return `320 幅・全 ${heights.length} 段とも年代は 1 行で箱に収まる`
        + `／#timePanel ${Math.min(...heights)}〜${Math.max(...heights)}px`
        + `／畳む仕掛け 0 個／‹ › ${r.prev.w}×${r.prev.h}px`;
    },
  },
  {
    // ⚠ **根拠を全画面で読んでいる最中に、地図へ戻る手段が消えてはいけない。**
    //   実測（2026-08-18・375×667）: ✕ はパネルの中で position:absolute だったので、
    //   パネルと一緒に流れて **400px スクロールで y=-298**（画面外）。
    //   押した座標には**何も無かった**（掟: 押しても何も起きない導線を置かない）。
    //   ⚠ 残る「← 今昔へ」はトップへ帰る**別の操作**なので、代わりにならない。
    // ⚠ 直し方は「位置を固定値で足す」ではなく、**同じ積み上げに入れる**
    //   （CLAUDE.md §9「隣り合うものは同じ積み上げに入れる。固定値で避けない」）。
    name: "根拠を全画面で読んでも、戻る 2 つが上に残る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **✕ は消え、⚠ 同じ的が字を変える**（2026-08-23。Owner 判断）。
      //   ⚠ **主張を引き継ぐ**: ⚠ **地図を見ているときに「戻る」と名乗らない**
      //     （⚠ 押しても何も起きない導線を置かない。ADR 0026）。
      const beforeOpen = await page.evaluate(() => ({
        label: (document.getElementById("toggle").innerText || "").replace(/\s+/g, " ").trim(),
        expanded: document.getElementById("toggle").getAttribute("aria-expanded") }));
      must(beforeOpen.expanded === "false",
        `小さい状態で始まっていない: aria-expanded=${beforeOpen.expanded}`);
      must(!/戻る/.test(beforeOpen.label),
        `地図を見ているのに「戻る」と名乗っている: ${beforeOpen.label}`);

      await page.click("#toggle");
      await settleAfterClick(page);
      const look = () => page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const r = e.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const who = document.elementFromPoint(cx, cy);
          return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            inView: r.top >= 0 && r.bottom <= innerHeight,
            // ⚠ 矩形だけでは足りない。**その座標を誰が受け取るか**で見る
            hit: who ? (who.id || who.closest("[id]")?.id || who.tagName) : "無い" }; };
        const pan = document.getElementById("panel");
        // ⚠ **戻る的は `#toggle`（▴ 地図に戻る）**（2026-08-23。⚠ ✕ は消えた）
        return { back: g("#back"), close: g("#toggle"), scrollH: pan.scrollHeight, viewH: innerHeight };
      });
      const a = await look();
      must(a.close, "「▴ 地図に戻る」が無い");
      // ⚠ 指で押せる大きさ
      for (const [nm, b] of [["← 今昔へ", a.back], ["▴ 地図に戻る", a.close]]) {
        must(b.w >= 44 && b.h >= 44, `${nm} が指で押せない（${b.w}×${b.h}）`);
        must(b.hit === (nm === "← 今昔へ" ? "back" : "toggle"),
          `${nm} を押しても、当たるのは「${b.hit}」`);
      }
      // ⚠ 2 つは離れていること。以前 10px まで詰まって 3/3 が苦情を出した
      must(a.close.x - a.back.right >= 80,
        `2 つが近すぎる（間隔 ${a.close.x - a.back.right}px）。押し間違える`);

      // ⚠ **本題。** パネルの中身より深くスクロールしても、両方が残る
      must(a.scrollH > a.viewH, `中身が画面に収まっていて、スクロールの検査にならない`);
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 400; });
      await page.waitForTimeout(400);
      const b = await look();
      for (const [nm, x] of [["← 今昔へ", b.back], ["▴ 地図に戻る", b.close]]) {
        must(x.inView, `スクロールしたら ${nm} が画面から出た（y=${x.y}）`);
        must(x.hit === (nm === "← 今昔へ" ? "back" : "toggle"),
          `スクロール後に ${nm} を押しても、当たるのは「${x.hit}」`);
      }
      // ⚠ 帯が中身を覆っていないこと。**いちばん上まで戻してから**見る。
      //   ⚠ スクロールしたあとで見て取りこぼした（中身が上へ逃げているので当たらない）。
      //   ⚠ 余白を外すと、地名と答え（99.6%）がそのまま帯の下に入る（実測 2026-08-19）。
      await page.evaluate(() => { document.getElementById("panel").scrollTop = 0; });
      await page.waitForTimeout(300);
      const under = await page.evaluate(() => {
        // ⚠ **`#chrome` は消えた**（2026-08-22）。⚠ **帯は板の中の `.chrome-row`。**
        const bar = document.querySelector("#panel .chrome-row").getBoundingClientRect();
        const hit = [];
        for (const el of document.querySelectorAll("#panel #placeName, #panel #landAll, #panel #result")) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.top < bar.bottom && r.bottom > bar.top && r.left < bar.right && r.right > bar.left)
            hit.push(`${el.id} y=${Math.round(r.top)}`);
        }
        return { hit, barBottom: Math.round(bar.bottom) };
      });
      must(!under.hit.length,
        `帯が中身を覆っている（帯の下端 ${under.barBottom} / ${under.hit.join("、")}）`);

      // ⚠ **▴ を押したら本当に地図へ戻る**（2026-08-23。⚠ ✕ は消えた）
      await page.click("#toggle");
      await settleAfterClick(page);
      const closed = await page.evaluate(() => ({
        hidden: !document.getElementById("panel").classList.contains("open"),
        label: (document.getElementById("toggle").innerText || "").replace(/\s+/g, " ").trim() }));
      must(closed.hidden, "▴ を押しても小さくならない");
      must(!/戻る/.test(closed.label), `小さくしたのに「戻る」と名乗っている: ${closed.label}`);
      return `← x=${a.back.x}..${a.back.right} ／ ✕ x=${a.close.x}..${a.close.right}（間隔 ${a.close.x - a.back.right}px）`
        + ` ／ 中身 ${a.scrollH}px を 400px スクロールしても両方 y=${b.back.y}・${b.close.y} で残る`;
    },
  },
];
