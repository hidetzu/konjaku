// 実描画 — 3D で建物を押す・戻る（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 16 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 9 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//   ⚠ **直上のコメントは 1 件も無かった**ので、⚠ **境目の判断は要らなかった。**
//
// ⚠ **依存を 4 つの道で測ってから切った**（⚠ 15 本目で実描画に捕まった反省。hidetzu/konjaku#317）:
//     親のローカル定義 0 ／ `lib.mjs` の 8 つ ／ `globalThis` 無し ／ 相対 import 無し
//
// ⚠ **ここが守っているもの**:
//     見えていない ⚠ **1 棟も見えていないときは、⚠ 建物の話をしない**
//     押した先     ⚠ **結果は押した場所の 1 か所だけに出る**（⚠ パネルへ戻さない）
//     但し書き     ⚠ **スマホで最初から見えて、⚠ 隠せない**
//     分母         ⚠ **3D の帯は 1 行。**⚠ **数字はパネルで分母つきに読める**
//     推定と実測   ⚠ **建設年が分かる建物を、⚠ こちらが決めた建物と同じに描かない**
//     共有         ⚠ **共有された建物を復元する。**⚠ **見つからなければ別の建物を選ばない**
//     戻る         ⚠ **3D から戻っても、⚠ 調べていた場所が残る。**
//                  ⚠ **3D に場所を探す口は無く、⚠ もどると同じ場所のトップへ出る**
//
// ⚠ **`/peel` は「選んだ場所を深掘りする画面」**（`.claude/rules/domain.md`）。
//   ⚠ **別の場所を探す導線を足さない**、がここで守られている。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { BASE, TOYOSU, peelReady, settleAfterCondition, settleAfterClick, must, openPanel, provText } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ 建物が1棟も見えていないとき（明治期の端）は、建物の話をしない。
    //   実測（2026-08-14）: 明治期では全建物の高さが 0 になり1棟も見えないのに、
    //   「建物は…件が推定」「建物を押すと分かります」が出続け、
    //   **見えない建物が押せた**（4か所試して 4/4 でカードが出た）。
    //   利用者は「幽霊」「気持ち悪い」と言った。
    name: "見えていない建物の話をしない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const set = async (v) => { await page.$eval("#t", (e, v) => {
        e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1800); };
      const read = () => page.evaluate(() => ({
        est: (document.getElementById("notes")?.textContent ?? "").trim(),
        tip: [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.textContent).join("").trim() }));
      const taps = async () => { let n = 0;
        for (const [x, y] of [[110, 260], [190, 300], [260, 240], [150, 380]]) {
          await page.evaluate(() => document.querySelectorAll(".pick-pop").forEach((e) => e.remove()));
          await page.mouse.click(x, y); await page.waitForTimeout(350);
          if (await page.locator(".pick-pop").count()) n++;
        } return n; };

      // 建物が立っている年代では、話をすること
      await set(0);
      const now = await read();
      // ⚠ **2026-08-21 に、⚠ 帯は 1 行になった**（hidetzu/konjaku#151。⚠ 分数はパネルへ）。
      //   ⚠ **見ている主張は同じ**: ⚠ 建物が立っているあいだ、⚠ 断りが帯に出ていること。
      must(/建物が消える年代は推定/.test(now.est), `建物が立っているのに但し書きが無い: ${now.est}`);
      must((await taps()) > 0, "建物が立っているのに押せない");

      // 明治期では、建物の話をしないこと
      await set(800);
      const meiji = await read();
      must(meiji.est === "", `建物が1棟も無いのに但し書きが出ている: ${meiji.est}`);
      must(meiji.tip === "", `建物が1棟も無いのに「押すと分かります」が出ている: ${meiji.tip}`);
      const ghost = await taps();
      must(ghost === 0, `見えない建物が押せる（4か所中 ${ghost} 件でカードが出た）`);
      return `現在は但し書きあり・押せる／明治期は但し書き無し・押しても出ない`;
    },
  },
  {
    // ⚠ **押した結果は、⚠ 押した場所の吹き出しだけ**（2026-08-21。Owner 判断）。
    //   ⚠ 前はパネルの `#pick` にも同じ `pickCard(p)` を入れており、
    //     ⚠ **同じ字が同時に 2 か所**に出ていた（⚠ 実測: 4 幅とも一致）。
    //   ⚠ 利用者役 4 名に画面だけを見せた（⚠ 実在の利用者ではない）: ⚠ **4/4 が「要らない」。**
    //
    // ⚠ **押しているあいだ、⚠ 要約カードは退く。**
    //   ⚠ 実測（375×667・豊洲）: 吹き出し y147–312 に対し #land y62–218 で、
    //     ⚠ **吹き出しの 39% が隠れていた。**⚠ 利用者役 4/4 が「上が隠れている」と答えた。
    //   ⚠ **z-index では解けない**（⚠ `#map` の `filter` が積み重ねの文脈を作る。
    //     ⚠ 実測: 吹き出し z=15 でも #land（z=11）の下だった）。
    //   ⚠ **高さは残す**（⚠ 消すと下の HUD が飛び跳ねる）。⚠ **閉じたら戻る。**
    name: "押した結果は、押した場所の 1 か所だけに出る", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ **パネルに板そのものが無いこと**（⚠ 空の箱も置かない）
      must(await page.locator("#pick").count() === 0,
        "パネルに押した建物の板（#pick）が戻っている（結果は押した場所の 1 か所）");
      // ⚠ **2026-08-21 に、⚠ 要約カード（#land）が無くなった**（hidetzu/konjaku#152）。
      //   ⚠ hidetzu/konjaku#155 でここは「⚠ 押しているあいだ要約を退かせる」を見ていた。
      //     ⚠ 実測（375×667・豊洲）: 吹き出しの 39% が要約に隠れていたため。
      //   ⚠ **隠す相手が無くなったので、⚠ 退かせる仕掛けごと消した。**
      //   ⚠ **主張は引き継ぐ**: ⚠ **押した結果が、⚠ 押した場所で読めること**（⚠ 上端が最前面）。
      must(await page.$$eval("#land", (els) => els.length) === 0,
        "要約カード（#land）が戻っている（土地の答えはパネルの 1 か所）");

      await page.mouse.click(187, 333);
      await settleAfterClick(page);
      const r = await page.evaluate(() => {
        const pop = document.querySelector(".pick-pop .maplibregl-popup-content");
        if (!pop) return null;
        const a = pop.getBoundingClientRect();
        // ⚠ **上端が本当に最前面にいること。**⚠ z-index を信じない
        const top = document.elementFromPoint(Math.round(a.left + a.width / 2), Math.round(a.top + 8));
        return { inPop: !!top?.closest(".pick-pop"),
          text: (pop.innerText || "").replace(/\s+/g, " ").trim() };
      });
      must(r, "建物を押しても吹き出しが出ない");
      must(r.inPop, "吹き出しの上端が、何かの下に隠れている");
      must(await page.locator("#pick").count() === 0, "押したらパネルにも板が出た");

      // ⚠ **閉じたら、⚠ 吹き出しだけが消える**
      await page.click(".pick-pop .maplibregl-popup-close-button");
      await settleAfterClick(page);
      must(await page.locator(".pick-pop").count() === 0, "✕ で吹き出しが閉じない");
      return `吹き出し 1 か所（上端が最前面）「${r.text.slice(0, 40)}」／✕ で閉じる`;
    },
  },
  {
    // ⚠ 建物を押した結果は、**押した場所の近く**に出ること。
    //   以前は左パネルの中だけに書いていて、実測で y=672（スマホ・パネルは閉じている）／
    //   y=721（PC・パネルの内スクロールの外）と、**両方の端末で画面の外**だった。
    //   利用者役のエージェント3体が「押しても何も起きないように見える」と言ったのは、
    //   実際に何も見えていなかったから（2026-08-14）。
    name: "建物を押した結果が、押した場所に見える", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 触る前に、押せることが**画面に出ている**こと。
      //   以前は左パネルの中に案内があったが、スマホはパネルが閉じて始まり、
      //   PC は内スクロールの外だったので、誰も読んでいなかった。
      // ⚠ **案内は `?` の中へ移した**（2026-08-23。Owner 判断。⚠ 狭い幅で地図が 22% しか
      //   ⚠ 見えていなかったため）。⚠ **消したのではない。**⚠ **押せば出る。**
      //   ⚠ **見る主張は 2 つに分ける**: ⚠ **①出す手段がある**／⚠ **②押すと画面内に出る。**
      //   ⚠ **`?` が 44×44 であることは、⚠ 別のケースが見ている。**
      const help = await page.locator("#noteHelp");
      if (await help.isVisible()) { await help.click(); await settleAfterClick(page); }
      const tip = await page.evaluate(() => {
        const t = [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .find((e) => e.checkVisibility());
        const r = t?.getBoundingClientRect();
        return { text: (t?.textContent ?? "").trim(),
          inView: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
      });
      must(tip.text.length > 0, "建物を押せることが、どこにも書かれていない（? を押しても出ない）");
      must(tip.inView, `案内が画面の外にある: ${JSON.stringify(tip)}`);
      must(/押す|押し/.test(tip.text), `何をすればよいか書かれていない: ${tip.text}`);

      await page.mouse.click(187, 333);                 // 画面の真ん中の建物
      await settleAfterClick(page);
      // ⚠ 役目が終わった案内を、画面に置き続けない
      const tipAfter = await page.evaluate(() =>
        [...document.querySelectorAll('#notes li[data-kind="tip"]')]
          .map((e) => e.textContent).join("").trim());
      must(tipAfter === "", `一度押したのに案内が残っている: ${tipAfter}`);
      const r = await page.evaluate(() => {
        const pop = document.querySelector(".pick-pop .maplibregl-popup-content");
        const rc = pop?.getBoundingClientRect();
        const say = document.getElementById("pickSay");
        return { has: !!pop, text: (pop?.textContent ?? "").replace(/\s+/g, " ").trim(),
          inView: !!rc && rc.top >= 0 && rc.bottom <= innerHeight
            && rc.left >= 0 && rc.right <= innerWidth,
          sayH: say ? Math.round(say.getBoundingClientRect().height) : 0 };
      });
      must(r.has, "建物を押しても、押した場所に何も出ない");
      must(r.inView, `押した結果が画面の外にある: ${JSON.stringify(r).slice(0, 120)}`);
      // ⚠ 3D で 100% 言えるのは足元だけ。まずそれを言うこと
      must(/足元は、明治期には水でした|明治期の土地|明治期の低湿地データ/.test(r.text),
        `足元の判定が出ていない: ${r.text.slice(0, 80)}`);
      // ⚠ 高さと建設年は、必ず出所つきで。「実測」と書ける建物は 7.9% しかない
      must(/既定値|階数|height タグ/.test(r.text), `高さの出所が出ていない: ${r.text.slice(0, 80)}`);
      must(/建設年/.test(r.text), `建設年について何も言っていない: ${r.text.slice(0, 80)}`);
      // ⚠ 技術的なRGBAは通常カードに出さない。土地の状態を主情報として出す。
      must(!/rgba=/.test(r.text), `技術的なRGBAが通常カードに出ている: ${r.text.slice(0, 80)}`);
      for (const w of ["この年に建った", "当時", "再現", "でしょう"])
        must(!r.text.includes(w), `断定・作文が混ざっている: 「${w}」`);
      // 読み上げは指で押せる大きさ
      must(r.sayH === 0 || r.sayH >= 44, `読み上げが指で押すには小さい: ${r.sayH}px`);
      return `案内「${tip.text}」→ 押すと消える／押した場所に出る（🔊 ${r.sayH}px）`
        + `／${r.text.slice(0, 40)}`;
    },
  },
  {
    // ⚠ 建物の但し書きは、**初期状態で見える場所**に出ていること。
    //   以前は左パネルの中にしかなく、スマホは panelOpen=!isNarrow で閉じて始まるので
    //   初期状態で1文字も見えなかった。利用者役のエージェント3体のうち2体が
    //   「高さと建設年は実データだ」と思ったまま操作した（2026-08-14）。
    //   ⚠ **初めから隠すのは不可。**⚠ **2026-08-22 からは畳むこともできない**
    //     （Owner 判断で畳みボタンを消した）。⚠ 断りは、隠せない場所に置く（掟 §1）。
    //   ⚠ スマホ幅で見ること。PC ではパネルが開くので、この壊れ方は再現しない。
    name: "建物の但し書きが、スマホで最初から見えて、隠せない", path: `/peel?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const e = document.getElementById("notes"), rc = e?.getBoundingClientRect();
        return { text: (e?.textContent ?? "").replace(/\s+/g, " ").trim(),
          panelHidden: !document.getElementById("panel")?.classList.contains("open"),
          // ⚠ **但し書きを隠せる親がいないこと**（2026-08-22。畳みボタンを消した）。
          //   ⚠ 以前は #eraToggle の aria-expanded を見ていたが、⚠ **その仕掛けごと無くなった。**
          //   ⚠ **「畳まれていない」ではなく「畳めない」**を見る（より強い主張）。
          folded: e?.closest("[hidden],[aria-expanded='false'],.collapsed")?.tagName ?? null,
          shown: !!rc && rc.height > 0 && rc.top >= 0 && rc.bottom <= innerHeight
            && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none" };
      });
      // 前提が崩れていたら、この検査は何も確かめていない
      must(r.panelHidden, "スマホなのにパネルが開いている（この検査の前提が消えた）");
      must(!r.folded, `但し書きを畳める親がいる（<${r.folded}>）。断りは隠せない場所に置く（掟 §1）`);
      must(r.shown, `但し書きが折り返しの中に見えていない: ${JSON.stringify(r)}`);
      // ⚠ 「出ている」だけでは足りない。**読めること**。板なしで出したときは
      //   10.5px・薄い色・影だけで航空写真の上に置いており、読めるのは数字だけだった。
      //   年の見出しが 60px なのに但し書きが 10.5px で 5.7倍（UI/UX の実測）。
      const look = await page.evaluate(() => {
        const e = document.getElementById("notes"), c = getComputedStyle(e);
        const y = document.querySelector("#timePanel .y");
        const a = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
        // ⚠ **敷きは、祖先を辿って探す。** 以前ここは `#era` の背景を決め打ちで見ていた。
        //   いまは #est が #era の中にあるので偶然一致していたが、
        //   ⚠ **#est を外へ出した瞬間、航空写真の上に敷き無しで浮いていても緑になる**
        //   （検査が測っていないことを「確認済み」と表示する。掟が名指ししている失敗）。
        //
        // ⚠ **body を敷きに数えない。**（2026-08-19 に踏んだ）
        //   body は不透明（rgb(8,11,15)）だが、**その上に地図が乗っている**。
        //   文字の背後にあるのは地図（航空写真）で、body ではない。
        //   数えてしまうと、敷きの無い場所へ出しても緑のままだった。
        //   ⚠ **地図（#map）より内側の祖先だけ**を見る。
        const mapEl = document.getElementById("map");
        let bgA = 0, at = null;
        for (let n = e; n && n !== document.body; n = n.parentElement) {
          if (n === mapEl) break;              // ⚠ 地図そのものは敷きではない
          const bg = getComputedStyle(n).backgroundColor;
          if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
          const v = bg.startsWith("rgba") ? (a(bg)[3] ?? 0) : 1;
          if (v > bgA) { bgA = v; at = n.id || n.className || n.tagName; }
          if (bgA >= 1) break;
        }
        return { fs: parseFloat(c.fontSize),
          yearFs: parseFloat(getComputedStyle(y).fontSize), bgA, bgAt: at };
      });
      must(look.fs >= 12, `但し書きが小さすぎる: ${look.fs}px（12px 以上）`);
      must(look.bgA >= 0.5,
        `但し書きに敷きが無い（写真の上で沈む）: 背景の不透明度 ${look.bgA}（敷いているのは ${look.bgAt ?? "無し"}）`);
      must(look.yearFs / look.fs <= 5.2,
        `年の見出しと但し書きの差が開きすぎ: ${look.yearFs}px 対 ${look.fs}px`);
      // ⚠ 「推定」の語だけでは足りない。**主張範囲の分母つき**で言うこと
      // ⚠ **2026-08-21 に、⚠ 帯から分数を外した**（hidetzu/konjaku#151。⚠ パネルへ移した）。
      //   ⚠ **帯に残す主張は「推定である」こと**。⚠ 分母つきは画面のどこかに 1 回だけ
      //     （⚠ それは別のケースが数える）。⚠ **ここは帯の役目だけを見る。**
      must(/建物が消える年代は推定/.test(r.text), `帯の但し書きが消えている: ${r.text}`);
      must(!/\d/.test(r.text), `帯に数字が残っている（分数はパネルへ移した）: ${r.text}`);
      // ⚠ **分母つきは、⚠ 同じ画面のパネルから読めること**（⚠ 消していない証拠）
      // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断。⚠ 台帳は「どう決めたか」だけ）。
      //   ⚠ **主張は同じ**（⚠ 分母つきが、⚠ 同じ画面のパネルから読めること）。
      //   ⚠ **読むのは「高さが分かる N / M」と「階数から換算 X 件 ／ 既定値 Y 件」。**
      const bdTx = await page.evaluate(() =>
        (document.getElementById("breakdown")?.textContent ?? "").replace(/\s+/g, " "));
      const mh = bdTx.match(/高さが分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(mh, `高さを分母つきで言っていない: ${bdTx.slice(0, 140)}`);
      const my = bdTx.match(/建てられた年が分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(my, `建設年を分母つきで言っていない: ${bdTx.slice(0, 140)}`);
      // ⚠ **実測でない分は、⚠ その内訳が言う**（⚠ 足すと総数になる）
      const me = bdTx.match(/階数から換算\s*(\d+)\s*件\s*／\s*種別ごとの既定値\s*(\d+)\s*件/);
      must(me, `実測でない高さの内訳が無い: ${bdTx.slice(0, 140)}`);
      must(+mh[1] + +me[1] + +me[2] === +mh[2],
        `高さの内訳が総数と合わない: ${mh[1]} ＋ ${me[1]} ＋ ${me[2]} ≠ ${mh[2]}`);
      must(+me[1] + +me[2] > 0, `推定が 0 件なのに「推定です」と言っている: ${bdTx.slice(0, 90)}`);
      const provTx = await provText(page);
      // ⚠ **台帳は「どう決めたか」を言う**（⚠ 件数は言わない）
      must(/種別ごとの既定値/.test(provTx), `台帳が高さの決め方を言っていない: ${provTx.slice(0, 120)}`);
      for (const w of ["再現", "当時の街並み", "この年に建った"])
        must(!r.text.includes(w), `断定・再現を名乗る語がある: 「${w}」`);

      // ⚠ **過去へ動かしても、断りと年代と重ねの注意は消えない。**
      //   ⚠ 以前はここで畳んで「畳んでも残る」を見ていた。⚠ **畳む仕掛けを消したので、
      //     ⚠ 「隠す手段が無い」ほうを見る**（より強い主張）。
      await page.$eval("#t", (e) => { e.value = "500"; e.dispatchEvent(new Event("input")); });
      await settleAfterClick(page);
      const past = await page.evaluate(() => ({
        estVisible: document.getElementById("notes").checkVisibility(),
        // ⚠ 隠せる仕掛けが 1 つも無いこと
        toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
        year: document.querySelector("#timePanel .y").textContent.trim(),
        note: document.getElementById("eraSummaryNote").textContent.trim(),
      }));
      must(past.estVisible, "過去の年代へ動かしたら、但し書きが消えた");
      must(past.toggles === 0, `断りを隠せる仕掛けがある（${past.toggles} 個）`);
      must(past.year.length > 0 && /いまの街/.test(past.note),
        `過去へ動かすと年代または重ねの注意が消える: ${past.year} / ${past.note}`);
      return `${r.text}／過去でも残る「${past.year}・${past.note}」／隠す仕掛け 0 個`;
    },
  },
  {
    // ⚠ **3D の帯の補足は 1 行だけ**（2026-08-21。hidetzu/konjaku#151。Owner 判断）。
    //   ⚠ 前は `#est` が 1 要素で**分数を 2 つ**持っていた
    //     （⚠ 建てられた年 N / M ／ 高さ N / M）。
    //   ⚠ 実測（2026-08-21・`main` = `484629c`・375×667・渋谷・SW 無効・hasTouch）:
    //     ⚠ `#est` だけで **329×69px の 2 行**。⚠ HUD 全体で常時 **18 行 / 200 字・数字 8 個**、
    //     ⚠ `#land` と合わせて **画面の 66%** を覆っていた。
    //   ⚠ **分母つきの主張は消していない。**⚠ パネル（`prov.js` の建物 2 行）へ移した
    //     （⚠ 掟 §1・§6。⚠ **消すのではなく、⚠ 読める場所を変えた**）。
    //   ⚠ **「演出」→「推定」**（Owner 判断）。⚠ **半分だけ残さない。**
    name: "3D の帯は 1 行で、数字はパネルで分母つきに読める", path: `/peel?${TOYOSU}`,
    async check(page) {
      const out = [];
      for (const [w, h, t] of [[375, 667, true], [1280, 800, false]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: t, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await peelReady(p2);
          await p2.waitForFunction(
            () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
            null, { timeout: 60000 });
          await settleAfterCondition(p2);
          // ⚠ **狭い幅では 3 つの問いを畳む**（2026-08-23。Owner 判断）。
          //   ⚠ **分母つきは板の中。**⚠ **広げてから読む**（⚠ 主張は変えていない）。
          await openPanel(p2);
          await settleAfterCondition(p2);
          const r = await p2.evaluate(() => ({
            // ⚠ **補足は配列になった**（2026-08-22）。⚠ **断りだけを読む**（⚠ 案内は別の役目）。
            //   ⚠ **主張は「⚠ 断りは 1 行で、⚠ 数字を含まない」**（⚠ 分数はパネルへ移した）。
            est: [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
              .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
              .filter((t) => /消える年代/.test(t)).join(" ／ "),
            hud: (document.getElementById("hud").innerText || "").replace(/\s+/g, " ").trim(),
            all: (document.body.innerText || "").replace(/\s+/g, " ").trim(),
            prov: [...document.querySelectorAll("#panel .prov-q")]
          .map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim(),
          }));
          // ⚠ AC1: 帯は 1 行。⚠ **数字を 1 つも含まない**
          // ⚠ **句点は付けない**（2026-08-22。⚠ 箇条書きの 1 行なので、⚠ 並びの作法にそろえた）。
          must(/^建物が消える年代は推定です。?$/.test(r.est),
            `${w}px: 帯が 1 行になっていない: 「${r.est}」`);
          must(!/[0-9]/.test(r.est), `${w}px: 帯に数字が残っている: 「${r.est}」`);
          // ⚠ AC2: HUD に分数が 0 個
          // ⚠ **否定形なので、⚠ 空白でずれると「0 個」になり、⚠ 何も見ない**（2026-08-23）
          const hudFrac = (r.hud.match(/\d+\s*\/\s*\d+/g) ?? []);
          must(hudFrac.length === 0, `${w}px: HUD に分数が残っている: ${hudFrac.join(" / ")}`);
          // ⚠ AC3: パネル側に、⚠ 建設年と高さが **それぞれ 1 回だけ** 分母つきで
          // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断）。⚠ **主張は同じ**:
          //   ⚠ **建設年と高さが、⚠ それぞれ 1 回だけ、⚠ 分母つきで出ていること。**
          const dated = (r.all.match(/建てられた年が分かる\s*\d+\s*\/\s*\d+/g) ?? []);
          const hgt = (r.all.match(/高さが分かる\s*\d+\s*\/\s*\d+/g) ?? []);
          must(dated.length === 1, `${w}px: 建設年の分母つきが ${dated.length} 回`);
          must(hgt.length === 1, `${w}px: 高さの分母つきが ${hgt.length} 回`);
          // ⚠ **台帳は「どう決めたか」を言う**（⚠ 件数は言わない）
          must(/消えるか|見込み/.test(r.prov), `${w}px: 建設年の決め方がパネルに無い`);
          must(/種別ごとの既定値/.test(r.prov), `${w}px: 高さの決め方がパネルに無い`);
          // ⚠ AC4: 画面のどこにも「演出」が無い
          must(!/演出/.test(r.all), `${w}px: 「演出」が残っている（言い換えが半分だけ）`);
          out.push(`${w}px 帯「${r.est}」／HUD の分数 0／パネル ${dated[0]}・${hgt[0]}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ 建設年が分かる建物と、こちらが決めた建物を、同じ顔で出さない。
    //   exact は「建設年が分かっている」印だが、**集計にしか使われておらず
    //   描画に一度も効いていなかった**。豊洲では 8 件と 525 件が
    //   画面上でまったく同じに見え、同じように消えていた（2026-08-14 検証者の指摘）。
    name: "建設年が分かる建物を、こちらが決めた建物と同じに描かない", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // ⚠ **2026-08-21 に「演出」→「推定」へ統一**（hidetzu/konjaku#151。Owner 判断）
      must(/建物が消える年代は推定/.test(t), "「消える年代は推定」の断りが消えている");
      must(!/演出/.test(t), `画面に「演出」が残っている（言い換えが半分だけ）: ${t.slice(0, 120)}`);
      // ⚠ 言い方も1つにする。#est が「建てられた年」、#prov が「建設年」と、
      //   同じことを別の語で2回言っていた（数字が3か所にあったのと同じ話）。
      // ⚠ **件数は内訳が持つ**（2026-08-22）。⚠ **主張は同じ**（⚠ 分母つきで 1 か所）。
      must(/建てられた年が分かる\s*\d+\s*\/\s*\d+/.test(t), `分母つきで言っていない: ${t.slice(0, 120)}`);
      // ⚠ この断りは、**パネルを開かなくても読める場所**に無いと意味がない。
      //   実測（2026-08-15）: 断りは #prov にしか無く、スマホでは
      //   ☰ を押して 254px スクロールしないと届かなかった。
      //   #est は建物が見えているあいだ 0 アクションで読める。
      // ⚠ **2026-08-21 に、⚠ 帯は 1 行に減った**（分数はパネルへ）。⚠ 断り自体は帯に残る。
      const est = (await page.locator("#notes").innerText()).replace(/\s+/g, " ");
      must(/建物が消える年代は推定/.test(est),
        `常時見える場所に断りが無い: ${est.slice(0, 90)}`);
      must(!/\d/.test(est), `帯に数字が残っている（分数はパネルへ移した）: ${est.slice(0, 90)}`);
      // ⚠ 同じ数字を2か所に置かない（掟: 同じ問いに答える実装を2つ持たない）。
      //   実測（2026-08-15）: 8 / 533 が #est・#prov・内訳 の 3 か所にあった（当時の分母）。
      const dated = (t.match(/建てられた年が分かる\s*(\d+)\s*\/\s*(\d+)/) ?? [])[0];
      const times = t.split(/建てられた年が分かる\s*\d+\s*\/\s*\d+/).length - 1;
      must(times === 1, `「${dated}」が画面に ${times} 回出ている`);
      const bare = (t.match(new RegExp(`${(dated.match(/(\d+) \/ (\d+)/) ?? [])[0]}`, "g")) ?? []).length;
      must(bare === 1, `「${(dated.match(/\d+ \/ \d+/) ?? [])[0]}」という数字が画面に ${bare} 回出ている`);

      const btn = page.locator("#peekY");
      must(await btn.count() === 1, "建設年が分かる件を光らせる操作が無い");
      const before = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerdown");
      await page.waitForTimeout(300);
      const during = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));
      await btn.dispatchEvent("pointerup");
      await page.waitForTimeout(300);
      const after = await page.evaluate(() =>
        JSON.stringify(map.getPaintProperty("bld", "fill-extrusion-color")));

      must(/"exact"/.test(during), `押しても exact が色に効いていない: ${during.slice(0, 90)}`);
      must(!/"exact"/.test(before), "既定の色に exact が混ざっている（既定は明治期の判定だけ）");
      // ⚠ 離したら必ず戻す。戻し忘れると別の意味の色が居座り、
      //   「99.6% が水色」と言いながら画面が灰色になる
      must(after === before, `離しても色が戻っていない: ${after.slice(0, 90)}`);
      return `既定→exact→既定 に戻る／${dated}（画面に 1 回だけ）`;
    },
  },
  {
    // ⚠ 建物には安定した ID が無い（配るタイルも Overpass 経路も OSM の id を落としている）。
    //   重心を鍵にしているので、**見つからないこと**が普通に起きる。
    //   そのとき黙って別の建物を選ぶと、共有先だけ違う建物の話になる。
    name: "共有された建物を復元し、見つからなければ別の建物を選ばない", path: `/peel?${TOYOSU}`,
    async check(page) {
      await peelReady(page);
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 内部フィールドに触らない。描かれている素性から鍵を読む
      const key = await page.evaluate(() =>
        map.querySourceFeatures("bld").find((f) => f.properties.k)?.properties.k ?? null);
      must(key, "建物に鍵が付いていない（URL で名指しできない）");
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1200, height: 780 }, serviceWorkers: "block" });
      let pop = 0, card = "", pop2 = 0, miss = "";
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}&b=${encodeURIComponent(key)}`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(2500);
        pop = await p2.locator(".pick-pop").count();
        // ⚠ **2026-08-21 に、⚠ 押した結果は吹き出しの 1 か所だけになった**
        //   （⚠ パネルの `#pick` を消した。⚠ 利用者役 4/4 が「要らない」）。
        //   ⚠ **見ている主張は同じ**: 共有された鍵から、⚠ 建物の中身が復元されること。
        card = (await p2.locator(".pick-pop .maplibregl-popup-content").textContent())
          .replace(/\s+/g, " ").trim();
        must(pop >= 1, "共有された建物の吹き出しが出ていない");
        must(card.length > 0, "共有された建物の中身が出ていない");
        must(await p2.locator("#pick").count() === 0,
          "パネルにも建物の板が戻っている（結果は押した場所の 1 か所）");
        // --- 見つからない鍵 ---
        const p3 = await ctx.newPage();
        await p3.goto(`${BASE}/peel?${TOYOSU}&b=1.000000,1.000000`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(2500);
        pop2 = await p3.locator(".pick-pop").count();
        must(pop2 === 0, "見つからない鍵なのに、別の建物を選んでいる");
        const m = await p3.locator("#stateMiss").evaluate((e) =>
          ({ hidden: e.hidden, t: e.textContent.replace(/\s+/g, " ").trim() }));
        must(!m.hidden && /見つかりませんでした/.test(m.t),
          `見つからなかったことを言っていない: ${JSON.stringify(m)}`);
        miss = m.t;
      } finally { await ctx.close(); }
      return `鍵 ${key} → 吹き出し ${pop} 個「${card.slice(0, 22)}」`
        + `／無い鍵 → ${pop2} 個・「${miss.slice(0, 24)}」`;
    },
  },
  {
    name: "3D から戻っても、調べていた場所が残る", path: `/peel?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。スマホはパネルが閉じて始まるので、
    //   パネルの中にしか戻る手段が無いと**画面から戻れなくなる**
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      // ⚠ 戻る手段が、最初から画面に見えていること。
      //   以前はパネルの中の「←今昔」だけで、実測すると
      //     スマホ y=688・18px・パネルは閉じて始まる → 画面に戻る手段が1つも無い
      //     PC     y=737・18px                     → 最下端の細い行
      //   しかも「←今昔」はロゴに見えて、戻る操作に読めなかった（2026-08-14）。
      const back = await page.evaluate(() => {
        const a = document.getElementById("back"), r = a?.getBoundingClientRect();
        return { has: !!a, y: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null,
          text: (a?.textContent ?? "").replace(/\s+/g, " ").trim(),
          shown: !!r && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
            && getComputedStyle(a).opacity !== "0" };
      });
      must(back.has, "戻る手段が無い");
      must(back.shown, `戻る手段が画面に見えていない: ${JSON.stringify(back)}`);
      must(back.h >= 44, `戻るが指で押すには小さい: ${back.h}px`);
      // ⚠ href は絶対URLで返るので getAttribute で見る（書き戻しで壊した過去がある）
      const href = await page.locator("#back").getAttribute("href");
      must(/[?&]q=/.test(href) && /[&?]ll=/.test(href),
        `戻り先が場所を落としている: ${href}`);
      // ⚠ 年代も持って戻る。以前は場所だけで、← を押すと見ていた年代が落ちていた。
      //   ⚠ 段が確定する前の「現在」が焼き付かないこと（loadArea で1回書くだけにして踏んだ）
      must(/[&?]era=/.test(href), `戻り先が年代を落としている: ${href}`);
      await page.locator("#back").click();
      await page.waitForFunction(() => {
        const t = document.getElementById("verdict")?.textContent ?? "";
        return t.length > 0 && !t.includes("判定中");
      }, null, { timeout: 45000 });
      const chip = await page.locator("#chipName").textContent().catch(() => "");
      must(chip.includes("豊洲"), `戻ったのに場所が消えている: 「${chip}」`);
      return `戻り先 ${href} ／ 場所「${chip}」が残る`;
    },
  },
  {
    // ⚠ **/peel に場所を探す口を置かない**（2026-08-18 方針）。
    //   この画面は「トップで選んだ場所を深掘りする画面」で、場所を決めるのはトップの責務。
    //
    //   ⚠ 以前ここには「別の場所を見る」（畳んだ検索欄・地名 10 件・現在地）があり、
    //     それを守る検査（畳んで 27px → 押すと 218px）が立っていた。外した理由は 2 つ:
    //       ・トップは **3D の下地がある場所にだけ**導線を出しているのに、
    //         こちらの検索からは**下地の無い場所へ入れてしまう**
    //         （地図は動くのに建物が出ない。出るかどうかは Overpass の混雑しだい）
    //       ・検索の作法（時間切れ・再試行・古い応答の追い越し防止）を 2 か所で守ることになる
    //
    // ⚠ **消しただけの検査にしない。** 元の検査が守っていたのは
    //   「この画面から場所を変えられること」なので、**その手段が残っていること**を見る。
    //   いまの手段は「← もどる」→ トップの ✕ の一本だけ。
    //   だから、もどる先が**いま見ている場所を持っている**ことまで確かめる。
    name: "3D に場所を探す口は無く、もどると同じ場所のトップへ出る", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      const got = await page.evaluate(() => ({
        // 探す口の残骸。id が残っていると、CSS だけ消したつもりが押せる状態になりうる
        ids: ["q", "cands", "quick", "here", "hereMsg", "findBox", "findLabel"]
          .filter((k) => document.getElementById(k)),
        // ⚠ 年代のつまみ（input[type=range]）は探す口ではない。文字を打つ入れ物だけ数える
        typed: [...document.querySelectorAll("input, textarea")]
          .filter((e) => e.tagName === "TEXTAREA"
            || !["range", "checkbox", "radio", "button", "hidden"].includes(e.type))
          .map((e) => e.id || e.type),
        places: typeof window.KonjakuPlaces,
        back: document.getElementById("back")?.getAttribute("href") ?? "",
      }));
      must(!got.ids.length, `探す口が残っている: ${got.ids.join("・")}`);
      must(!got.typed.length, `文字を打つ入れ物が残っている: ${got.typed.join("・")}`);
      // ⚠ 使う相手がいないのに配らない。⚠ ただし「検索を書くなら places.js」の決まりは生きている
      must(got.places === "undefined", "places.js を読み込んでいる（この画面に使う相手がいない）");
      // 場所を変える手段が、画面から消えていないこと
      must(/^\.\/\?q=/.test(got.back) && /ll=/.test(got.back),
        `もどる先が、いま見ている場所を持っていない: ${JSON.stringify(got.back)}`);
      const back = await page.evaluate(() => {
        const b = document.getElementById("back"), r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 vis: b.checkVisibility({ checkVisibilityCSS: true }) };
      });
      must(back.vis, "「← もどる」が見えていない（場所を変える手段が画面に無い）");
      must(back.h >= 44, `「← もどる」が指で押せる大きさでない: ${back.w}×${back.h}px`);
      return `探す口 0 個／文字入力 0 個／places.js 未読込／もどる先 ${got.back.slice(0, 34)}…`
        + `（${back.w}×${back.h}px）`;
    },
  },
];
