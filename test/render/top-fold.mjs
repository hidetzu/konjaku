// 実描画 — 既定で畳み、⚠ 開けば読める（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 37 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 3 件を、⚠ 直上のコメントごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **3 件で「畳む → 開く」がひとまわりする**（⚠ **だから割らない**）:
//     組で畳む   ⚠ **行動一覧が、⚠ 3 つの組に分かれて、⚠ 既定で畳んである**
//     行で畳む   ⚠ **この範囲にあったものは、⚠ 既定で 3 行に畳む**
//     開いて光る ⚠ **隠れている行の印を押したら、⚠ 一覧が開いて、⚠ その行が光る**
//
// ⚠ **畳むだけの検査にしない**（`.claude/skills/verify/SKILL.md` §5）。
//   ⚠ **畳んだものに、⚠ 戻る道があることまで見る**（⚠ 押しても何も起きない印を作らない。ADR 0026）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  WORDS, BASE, TOYOSU, SAPPORO, KARUIZAWA, UENO, groupsOf,
  waitVerdict, settleAfterCondition, settleAfterClick, must
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **行動一覧を 3 つの組に分ける**（2026-08-21）。
    //   ⚠ 前は「深掘り」「この土地から出た語」「公的な情報」が、⚠ **同じ形の行**で
    //     ⚠ **同じ列**に並んでいた。⚠ 分かれていたのは行ごとのタグだけだった。
    //   ⚠ 実測（375×667・hasTouch・SW 無効・`main` = `87ed6ce`）: 4 地点のうち
    //     ⚠ **3 地点は一覧が 3 行**で、⚠ **検索候補が 0 件**だった。
    // ⚠ **並び順は変えていない**（「この場所に固有なものほど上」）。
    //   ⚠ 以前ここを逆にして、⚠ **亀戸の標高 -0.57m から出た〈水害の記録〉が、
    //     ⚠ 亀戸と無関係な〈地理院地図〉の下に並んでいた**（直した記録が残っている）。
    name: "行動一覧が、3 つの組に分かれて、既定で畳んである", path: `/?${TOYOSU}`,
    async check(page) {
      const out = [];
      for (const [name, q, want] of [
        // ⚠ **組の順は Owner が決めた**（2026-08-21）: 公的な情報 → さらに調べる
        ["豊洲", TOYOSU, [WORDS.GROUP.ext, WORDS.GROUP.why]],
        // ⚠ **検索候補が 0 件の土地。**⚠ **空の組に見出しを出さない**
        ["軽井沢", KARUIZAWA, [WORDS.GROUP.ext]],
        ["札幌", SAPPORO, [WORDS.GROUP.ext]],
      ]) {
        if (page.url() !== BASE + `/?${q}`)
          await page.goto(BASE + `/?${q}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        // ⚠ **行ではなく見出しを待つ。**⚠ 既定では行が 1 つも出ていない
        await page.waitForSelector("#list .lh.fold", { timeout: 30000 });
        await settleAfterCondition(page);
        const groups = await groupsOf(page);
        must(groups.join("／") === want.join("／"),
          `${name}: 組の見出しが違う: 「${groups.join(" / ")}」（欲しいのは「${want.join(" / ")}」）`);
        const r = await page.evaluate(() => ({
          tags: document.querySelectorAll("#list .tag").length,
          rows: document.querySelectorAll("#list .it").length,
          // ⚠ **件数を必ず出す。**⚠ 「ある」と分かることが、この畳みの目的
          counts: [...document.querySelectorAll("#list .lh.fold .n")].map((e) => e.textContent.trim()),
          // ⚠ 畳んでいる印
          closed: [...document.querySelectorAll("#list .lh.fold")]
            .filter((e) => e.getAttribute("aria-expanded") === "false").length,
          heads: document.querySelectorAll("#list .lh.fold").length,
          // ⚠ **押せること**（⚠ 見出しは押して開く。⚠ 押せないと中身に届かない）
          buttons: [...document.querySelectorAll("#list .lh.fold")]
            .filter((e) => e.tagName === "BUTTON").length,
          tap: Math.min(...[...document.querySelectorAll("#list .lh.fold")]
            .map((e) => Math.round(e.getBoundingClientRect().height))),
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        must(r.tags === 0, `${name}: 行ごとのタグが残っている（${r.tags} 個。見出しと 2 か所になる）`);
        must(r.rows === 0, `${name}: 既定で畳んでいない（行が ${r.rows} 出ている）`);
        must(r.closed === r.heads, `${name}: 畳んでいない見出しがある（${r.closed}/${r.heads}）`);
        must(r.buttons === r.heads, `${name}: 見出しが押せない（${r.buttons}/${r.heads}）`);
        must(r.tap >= 44, `${name}: 見出しが指で押せない（${r.tap}px）`);
        must(r.counts.every((c) => /^\d+件$/.test(c)),
          `${name}: 件数が出ていない: ${r.counts.join(" / ")}`);
        must(r.over <= 0, `${name}: 横にあふれている（${r.over}px）`);
        // ⚠ **押したら開く。**⚠ 開いた組の中身が出て、⚠ 印が変わること
        await page.locator("#list .lh.fold").first().click();
        await settleAfterClick(page);
        const a = await page.evaluate(() => ({
          rows: document.querySelectorAll("#list .it").length,
          open: document.querySelector("#list .lh.fold")?.getAttribute("aria-expanded"),
          fixed: [...document.querySelectorAll("#list .it")]
            .filter((e) => /ハザードマップ|地理院地図/.test(e.textContent)).length,
        }));
        must(a.rows === 2, `${name}: 押しても公的な情報が 2 件出ない: ${a.rows}`);
        must(a.open === "true", `${name}: 押しても開いた印にならない`);
        must(a.fixed === 2, `${name}: 公的な情報が 2 件でない: ${a.fixed}`);
        out.push(`${name} 見出し ${groups.join("・")}（${r.counts.join("・")}）→ 押すと ${a.rows} 行`);
      }
      return out.join("／");
    },
  },
  {
    // ⚠ **この範囲にあったものは、既定 3 行に畳む**（2026-08-21。hidetzu/konjaku#141）。
    //   ⚠ 実測（375×667・hasTouch・SW 無効・`main` = `9982680`）: `ev` の高さが
    //     ⚠ **豊洲 54px / 軽井沢 327px / 札幌 524px / 上野 671px** と、⚠ **12.4 倍**開いていた。
    //     ⚠ 上野では判定領域 1340px の **50%** を 1 段が占めていた。
    // ⚠ **字は 1 つも消さない。**⚠ 出典も案内も残す（Owner 判断）。
    // ⚠ **開く操作に新しい字を足さない。**⚠ 「ほかに N 件」の行そのものを押せるようにした。
    name: "この範囲にあったものは、既定で 3 行に畳む", path: `/?${UENO}`,
    async check(page) {
      const read = () => page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const h = (s) => { const e = q(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
        const mb = document.getElementById("evMore");
        const r = mb ? mb.getBoundingClientRect() : null;
        // ⚠ 実効 opacity まで見る（checkVisibility() は opacity を見ない）
        const eff = (sel) => { let e = q(sel), o = 1;
          if (!e) return 0;
          const vis = e.checkVisibility();
          for (let x = e; x && x !== document.documentElement; x = x.parentElement)
            o *= parseFloat(getComputedStyle(x).opacity || "1");
          return vis ? Number(o.toFixed(2)) : 0; };
        return { ev: h("#verdict .ev"), rows: document.querySelectorAll("#verdict .ev-row").length,
          more: (q("#verdict .ev-more")?.textContent ?? "").replace(/\s+/g, " ").trim(),
          pressable: !!mb, tap: r ? Math.round(Math.min(r.width, r.height)) : 0,
          // ⚠ **44px は指の端末の話**（ui-ux-review）。⚠ この走者は指を持っていないことがある
          touch: matchMedia("(hover: none)").matches,
          srcOpacity: eff("#verdict .ev-src"),
          srcInDetails: !!q("#verdict .ev-src")?.closest("details"),
          tip: h("#verdict .ev-tip"),
          mapPins: [...document.querySelectorAll(".big .pin")].filter((e) => !e.closest("#pins")).length,
          photoPins: [...document.querySelectorAll("#pins .pin")].length };
      });
      await waitVerdict(page);
      await page.waitForSelector("#verdict .ev-row", { timeout: 30000 });
      await settleAfterCondition(page);
      const a = await read();
      must(a.rows === 3, `既定で 3 行になっていない: ${a.rows} 行`);
      must(a.pressable, "「ほかに N 件」が押せない（開く手段が無い）");
      // ⚠ 指の端末でだけ 44px を要求する。⚠ **指を持たない走者に指の基準を当てない**
      //   （⚠ 別途、指の端末での実測は ui-ux-review が見ている）
      if (a.touch) must(a.tap >= 44, `開く行が指で押せない: ${a.tap}px`);
      else must(a.tap >= 30, `開く行が小さすぎる: ${a.tap}px`);
      must(/ほかに 13 件/.test(a.more), `隠している件数が違う: 「${a.more}」`);
      must(/3 件だけ出しています/.test(a.more), `出している件数が違う: 「${a.more}」`);
      // ⚠ **出典は畳まない**（Owner 判断 2026-08-21）
      must(a.srcOpacity > 0, `出典が読めない: 実効 opacity ${a.srcOpacity}`);
      must(!a.srcInDetails, "出典が details の中に入っている（畳まないと決めた）");
      must(a.tip > 0, "「行を押すと…」の案内が消えている");
      // ⚠ **写真の印は畳まない。**⚠ 一覧 3 行でも、⚠ 上限ぶん打っている
      must(a.photoPins === 8, `写真の印が一覧に合わせて減っている: ${a.photoPins} 本`);

      // ⚠ 開く
      await page.click("#evMore");
      await settleAfterClick(page);
      const b = await read();
      must(b.rows === 8, `押しても 8 行にならない: ${b.rows} 行`);
      must(!b.pressable, "上限まで開いたのに、まだ押せる見た目のまま（ADR 0026）");
      must(/ほかに 8 件/.test(b.more), `開いた後の件数が違う: 「${b.more}」`);
      must(b.ev > a.ev, `開いても高さが増えていない: ${a.ev} → ${b.ev}`);
      return `既定 ${a.rows} 行 ${a.ev}px（写真の印 ${a.photoPins} 本・押す的 ${a.tap}px${
        a.touch ? "・指" : "・指なし"}）`
        + `／押すと ${b.rows} 行 ${b.ev}px ／「${b.more}」／出典は畳まない`;
    },
  },
  {
    // ⚠ **隠れている行の印を押したら、先に開く**（2026-08-21。hidetzu/konjaku#141）。
    //   ⚠ 地図の印は上限ぶん（8 本）打っているのに、⚠ 一覧は既定 3 行しか出していない。
    //   ⚠ 開かずに強調すると、⚠ **一覧側が一度も見つからない**。
    //   ⚠ この取りこぼしは過去に 1 度やっている（実測: 印 9 個に対し強調 0 個）。
    name: "隠れている行の印を押したら、一覧が開いてその行が光る", path: `/?${UENO}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#verdict .ev-row", { timeout: 30000 });
      await settleAfterCondition(page);
      must(await page.locator("#verdict .ev-row").count() === 3, "既定が 3 行でない");
      // ⚠ 地図を出す。⚠ 1 行目を押す（⚠ ここは隠れていないので、まだ開かない）
      await page.locator("#verdict .ev-it").first().click();
      await page.waitForFunction(
        () => [...document.querySelectorAll(".big .pin")].some((e) => !e.closest("#pins")),
        null, { timeout: 45000 });
      await settleAfterClick(page);
      must(await page.locator("#verdict .ev-row").count() === 3,
        "隠れていない行を押しただけで開いてしまった");
      // ⚠ **全体に戻す。**⚠ 寄せたままだと、⚠ 他の印は地図の外にいて押せない
      //   （⚠ 実測: 寄せた状態で押そうとして 30 秒待ち、⚠ 印は動き続けていた）
      await page.click("#unzoom");
      await settleAfterClick(page);
      // ⚠ 隠れている行（6 番目 = data-i 5）の地図の印を押す
      const hit = await page.evaluateHandle(() => [...document.querySelectorAll(".big .pin")]
        .find((e) => !e.closest("#pins") && e.dataset.i === "5"));
      const el = hit.asElement();
      must(!!el, "隠れている行に対応する地図の印が無い");
      await el.click({ timeout: 20000 });
      await settleAfterClick(page);
      const r = await page.evaluate(() => ({
        rows: document.querySelectorAll("#verdict .ev-row").length,
        on: [...document.querySelectorAll("#verdict .ev-it")].findIndex((e) => e.classList.contains("on")),
        fx: document.getElementById("fx")?.innerText.trim() ?? "" }));
      must(r.rows === 8, `印を押しても一覧が開いていない: ${r.rows} 行`);
      must(r.on === 5, `押した印に対応する行が光っていない: 光っているのは ${r.on} 番目`);
      must(r.fx.length > 0, "寄せた先の名前が出ていない");
      return `印を押したら ${r.rows} 行に開いて、${r.on} 番目が光った／「${r.fx}」`;
    },
  },
];
