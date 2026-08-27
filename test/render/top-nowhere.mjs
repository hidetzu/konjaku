// 実描画 — 場所が分からないとき、⚠ 黙って別の場所を出さない
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 33 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **離れた 2 件を集めたので、⚠ 並びは動く**（⚠ 元は 1300 行ほど離れていた）。
//
// ⚠ **2 件は対で見る**（⚠ **だから 1 つにまとめた**）:
//     トップ   ⚠ **`/` の URL の座標が読めないとき**
//     深掘り   ⚠ **`/peel` の URL に場所が無いとき**
//
// ⚠ **同じ問いに、⚠ 2 つの入口がある。**⚠ **片方だけ直すと、⚠ もう片方が黙って別の場所を出す**
//   （`CLAUDE.md` §3「⚠ 同じ問いに答える実装を 2 つ持たない」の、⚠ **持たざるを得ない側**）。
//
// ⚠ **`CLAUDE.md` §1**: ⚠ **読めなかったことを、⚠ 「ここだ」と言い換えない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { must } from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **トップの URL の座標が読めないとき、⚠ 黙って別の場所を出さない**（2026-08-24）。
    //
    // ⚠ **`/peel` は hidetzu/konjaku#221 で直っていたが、⚠ トップは取り残されていた。**
    //   ⚠ **既存の検査も `peel3d.js` しか見張っていなかったので、⚠ 素通りしていた。**
    //
    // ⚠ **前の姿**（実測 2026-08-23・`main` = `384e4ef`・375×667）:
    //   `?q=名古屋&ll=999,0`  → ⚠ URL が `?q=名古屋&ll=999.00000,0.00000` に書き換わり、
    //                            ⚠ **緯度 999 で地図を開いていた。**⚠ 断りは無し。
    //   `?ll=999,0`           → ⚠ URL が `?q=999.0000%2C%200.0000&ll=999.00000,0.00000`。
    //                            ⚠ **在りもしない地名を作って URL に載せていた**（掟 §1）。
    //                            ⚠ **共有されると、⚠ その嘘がそのまま相手に届く。**
    //
    // ⚠ **対照を必ず含める**（⚠ 読める座標は、⚠ いままでどおり地図が開く）。
    //   ⚠ 対照が無いと、⚠ **全部を断る実装でも緑になる。**
    // ⚠ **`none` は黙る**（Owner 判断 2026-08-23）。⚠ 何も指定していない人に言うことは無い。
    name: "トップの URL の座標が読めないとき、黙って別の場所を出さない",
    path: "/", group: "core",
    async check(page) {
      const base = new URL(page.url()).origin;
      const out = [];
      const CASES = [
        // 名前              開く URL                                  断り   検索欄に残る字
        // ⚠ **単純なものから並べる。**⚠ 先に複雑なケースを置くと、⚠ そこで止まって
        //   ⚠ **後ろの主張に一度も到達しない**（⚠ 2026-08-24 に、⚠ わざと壊して気づいた）。
        ["対照",            "/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975", null, null],
        ["地球の外 のみ",   "/?ll=999,0",                                 "bad", null],
        ["読めない ll",     "/?ll=abc",                                   "bad", null],
        ["地球の外 + 地名", "/?q=%E5%90%8D%E5%8F%A4%E5%B1%8B&ll=999,0",   "bad", "名古屋"],
        ["指定なし",        "/",                                          null, null],
      ];
      for (const [name, path, why, keepQ] of CASES) {
        await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        const r = await page.evaluate(() => ({
          search: location.search,
          flash: (document.querySelector(".flashnote__text")?.textContent ?? "").trim(),
          qval: document.getElementById("q")?.value ?? "",
          hint: (document.querySelector(".hint")?.textContent ?? "").trim(),
        }));
        if (why === null) {
          // ⚠ **読める座標と、⚠ 何も指定していないときは、⚠ 断らない**
          must(!r.flash, `${name}: 断りが出ている（出すべきではない）: ${r.flash}`);
          // ⚠ **対照は地図が開く**（⚠ `syncUrl` が走って 5 桁へ正規化される）
          if (/ll=/.test(path)) {
            must(/ll=35\.65480,139\.79750/.test(r.search),
              `${name}: 読める座標なのに地図が開いていない（${r.search}）`);
            out.push(`${name}: 開く・${r.search.slice(0, 40)}`);
          } else out.push(`${name}: 黙ってトップ`);
          continue;
        }
        // ⚠ **字は `words.js` の 1 か所**（⚠ ここで書かない）
        const want = KonjakuWords.noPlace[why];
        must(r.flash === want, `${name}: 断りの字が違う\n  出た  「${r.flash}」\n  期待  「${want}」`);
        // ⚠ **地図を開かない**（⚠ 開いたら座標が URL に書き戻される）
        must(!/ll=\d+\.\d{5}/.test(r.search),
          `${name}: 読めない座標なのに地図を開いている（${r.search}）`);
        // ⚠ **在りもしない地名を作らない。**⚠ **これが元の不具合の核心**（掟 §1）。
        //   ⚠ 利用者が `q` を渡していないのに、⚠ こちらが `q` を書き足さない。
        if (!keepQ) must(!/[?&]q=/.test(r.search),
          `${name}: 渡されていない地名を URL に書き足している（${r.search}）`);
        // ⚠ **利用者が入れた地名は落とさない**
        if (keepQ) must(r.qval === keepQ, `${name}: 地名が消えている（「${r.qval}」）`);
        // ⚠ **「存在しません」と読める字を出さない**（⚠ 読めなかっただけ。掟 §1）
        must(!/存在しません|ありません(。|$)/.test(r.flash),
          `${name}: その場所が無いと読める字が出ている: ${r.flash}`);
        // ⚠ **`⚠` は災害リスク専用**（`CLAUDE.md` §4）
        must(!/⚠/.test(r.flash), `${name}: 断りに ⚠ を使っている: ${r.flash}`);
        // ⚠ **手がかりは常時ある**（ADR 0026）
        must(/地名/.test(r.hint), `${name}: 次に何をするかの手がかりが無い: ${r.hint}`);
        out.push(`${name}: ${why}`);
      }
      return out.join(" ／ ");
    },
  },
  {
    // ⚠ **深掘りの URL に場所が無いとき、⚠ 黙って別の場所を出さない**
    //   （hidetzu/konjaku#221。Owner 判断 2026-08-23。B 案 ＝ トップへ返す）。
    //
    // ⚠ **前の姿**（実測 2026-08-23・`main` = `71349bf`）: ⚠ `?q=名古屋` `?ll=abc` `/peel` の
    //   3 通りとも、⚠ **断り無しで豊洲**。⚠ URL も `?q=東京都江東区豊洲&ll=…` に書き換わり、
    //   ⚠ **共有した人と見た人が違う場所を見ていても、⚠ どちらも気づかなかった。**
    //
    // ⚠ **対照を必ず含める**（⚠ 座標が読める URL は、⚠ **いままでどおり `/peel` に留まる**）。
    //   ⚠ 対照が無いと、⚠ **全部トップへ返す実装でも緑になる。**
    name: "深掘りの URL に場所が無いとき、黙って別の場所を出さない",
    path: "/", group: "core",
    async check(page) {
      const base = new URL(page.url()).origin;
      const out = [];
      const CASES = [
        // 名前            開く URL                                      着地  flash
        ["対照",          "/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.65480,139.79750&era=swale", "/peel", null],
        ["q だけ",        "/peel?q=%E5%90%8D%E5%8F%A4%E5%B1%8B&era=swale", "/", "none", "era=swale"],
        ["ll 壊れ",       "/peel?ll=abc&q=%E5%90%8D%E5%8F%A4%E5%B1%8B",    "/", "bad"],
        ["引数なし",      "/peel",                                        "/", null],
      ];
      for (const [name, path, land, why, keep] of CASES) {
        await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        const r = await page.evaluate(() => ({
          path: location.pathname, search: location.search,
          flash: (document.querySelector(".flashnote__text")?.textContent ?? "").trim(),
          focused: document.activeElement?.id ?? "",
          qval: document.getElementById("q")?.value ?? "",
          // ⚠ **手がかりは残っていること**（ADR 0026。⚠ flash が消えても読める）
          hint: (document.querySelector(".hint")?.textContent ?? "").trim(),
          // ⚠ **閉じる的が 44×44 を割らないこと**
          shut: (() => { const e = document.querySelector(".flashnote__close");
            if (!e) return null; const q = e.getBoundingClientRect();
            return `${Math.round(q.width)}×${Math.round(q.height)}`; })(),
        }));
        must(r.path === land, `${name}: 着地が違う（${r.path} / 期待 ${land}）`);
        if (land === "/peel") {
          // ⚠ **対照は、⚠ URL が書き換わらない**（⚠ era も残る）
          must(/ll=35\.65480/.test(r.search), `${name}: 座標が消えている（${r.search}）`);
          must(/era=swale/.test(r.search), `${name}: era が捨てられている（${r.search}）`);
          must(!r.flash, `${name}: 断りが出ている（出すべきではない）: ${r.flash}`);
          out.push(`${name}: /peel のまま・era 残る`);
          continue;
        }
        // ⚠ **トップへ返ったときは、⚠ `noplace` を URL に残さない**
        //   （⚠ 残すと、⚠ 共有した先でも同じ断りが出る）
        must(!/noplace/.test(r.search), `${name}: noplace が URL に残っている（${r.search}）`);
        // ⚠ **地名を落とさない**（⚠ 落とすと、⚠ 利用者が入れた字まで消える）
        if (/q=/.test(path)) must(r.qval === "名古屋", `${name}: 地名が消えている（「${r.qval}」）`);
        // ⚠ **`era` を黙って捨てない**（⚠ Issue の AC 2）。
        //   ⚠ **前は `era=swale` が `seamlessphoto` に差し替わっていた**（2026-08-23 実測）。
        //   ⚠ トップへ返すときも、⚠ **URL から消さない。**⚠ 消えたら、⚠ 何が指定されていたか分からない。
        if (keep) must(r.search.includes(keep),
          `${name}: 指定が黙って捨てられている（${keep} が無い）: ${r.search}`);
        // ⚠ **地名の入力へ促す**（Owner 判断）
        must(r.focused === "q", `${name}: 検索欄にフォーカスが無い（${r.focused || "無し"}）`);
        // ⚠ **手がかりは常時ある**（ADR 0026。⚠ flash が消えても、⚠ 次の一手が読める）
        must(/地名/.test(r.hint), `${name}: 次に何をするかの手がかりが無い: ${r.hint}`);
        if (why === null) {
          must(!r.flash, `${name}: 何も指定していないのに断っている: ${r.flash}`);
          out.push(`${name}: 黙ってトップ`);
        } else {
          const want = KonjakuWords.noPlace[why];
          must(r.flash === want, `${name}: 断りの字が違う\n  出た  「${r.flash}」\n  期待  「${want}」`);
          // ⚠ **「存在しません」と読める字を出さない**（Issue の AC 5）
          must(!/存在しません|ありません(。|$)/.test(r.flash),
            `${name}: その場所が無いと読める字が出ている: ${r.flash}`);
          // ⚠ **`⚠` は災害リスク専用**（CLAUDE.md §4）
          must(!/⚠/.test(r.flash), `${name}: 断りに ⚠ を使っている: ${r.flash}`);
          must(r.shut, `${name}: 手で閉じる道が無い`);
          const [w, h] = (r.shut ?? "0×0").split("×").map(Number);
          must(w >= 44 && h >= 44, `${name}: 閉じる的が 44 を割る（${r.shut}）`);
          out.push(`${name}: ${why}・閉じる ${r.shut}`);
        }
      }
      // ⚠ **検索が終わっても、⚠ 断りが画面の外へ押し出されないこと**（2026-08-23 に実際に踏んだ）。
      //   ⚠ **入力例の下に置いていたとき、⚠ `?q=` の検索が成功すると
      //     候補と結果が上に積まれ、⚠ y=359 → 1166 へ動いた**（375×667。⚠ **画面の外**）。
      //   ⚠ **見えていない注釈は、⚠ 書いていないのとほぼ同じ**（ADR 0026）。
      //   ⚠ **4 幅で見る。**⚠ 375 だけだと、⚠ 縦の足りない幅で落ちるのに気づけない。
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(base + "/peel?q=%E5%90%8D%E5%8F%A4%E5%B1%8B", { waitUntil: "domcontentloaded", timeout: 60000 });
        // ⚠ **検索が終わるまで待つ**（⚠ 終わる前に測ると、⚠ 押し出される前の値を見てしまう）
        await page.waitForFunction(
          () => (document.getElementById("quick")?.getBoundingClientRect().height ?? 0) > 0
             || (document.getElementById("result")?.getBoundingClientRect().height ?? 0) > 0,
          null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const v = await page.evaluate(() => {
          const f = document.querySelector(".flashnote");
          if (!f) return null;
          const r = f.getBoundingClientRect();
          const q = document.getElementById("q").getBoundingClientRect();
          const d = document.documentElement;
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), qtop: Math.round(q.top),
                   seen: f.checkVisibility?.() ?? true,
                   over: d.scrollWidth > d.clientWidth, vh: innerHeight };
        });
        must(v, `${w}px: 断りが消えている（測れない）`);
        must(v.seen, `${w}px: 断りが見えていない`);
        must(v.top >= 0 && v.bottom <= v.vh,
          `${w}px: 断りが画面の外にある（y=${v.top}〜${v.bottom} / 画面 ${v.vh}）`
          + `：⚠ 見えていない注釈は書いていないのと同じ（ADR 0026）`);
        must(v.bottom <= v.qtop + 1,
          `${w}px: 断りが検索欄と重なっている（断り下端 ${v.bottom} / 検索欄 ${v.qtop}）`);
        must(!v.over, `${w}px: 横にあふれている`);
        out.push(`${w}: y=${v.top}`);
      }
      await page.setViewportSize({ width: 375, height: 667 });

      // ⚠ **自然に閉じる**（Owner 判断）。⚠ **ただし読んでいるあいだは止まる。**
      await page.goto(base + "/peel?q=%E5%90%8D%E5%8F%A4%E5%B1%8B", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      must(await page.locator(".flashnote").count() === 1, "断りが出ていない（自動で閉じるかを測れない）");
      // ⚠ **hover しているあいだは消えない**（⚠ 読んでいる途中で消さない）
      // ⚠ **自動で閉じるまでは 10 秒**（Owner 判断 2026-08-23）。
      //   ⚠ **6 秒では、⚠ 利用者役 2/4 が「読み終わる前に消えた」**（⚠ 実在の利用者ではない）。
      //   ⚠ **hover では止まるが、⚠ 指の端末に hover は無い。**⚠ 止められない人に合わせた。
      //   ⚠ **ここで待つ時間は、⚠ その 10 秒より長くする**（⚠ 短いと、⚠ 閉じる前に測ってしまう）。
      // ⚠ **読み切れる長さがあること**（⚠ hover せずに待つ）。
      //   ⚠ **これが Owner の判断そのもの。**⚠ 6 秒では 2/4 が読み切れなかった。
      //   ⚠ **hover で止まるかだけを見ていると、⚠ 3 秒に縮めても緑になる**
      //     （⚠ 2026-08-23 に、⚠ 足した直後の検査がまさにそうだった）。
      //   ⚠ **8.5 秒で見る**（⚠ 上で 2.5 秒すでに待っているので、⚠ ここは 6 秒）。
      //     ⚠ **10 秒ちょうどを的にしない**（⚠ 遅い環境で揺れる）。
      //     ⚠ **足し忘れて 10.5 秒待ち、⚠ 正しい実装で落とした**（2026-08-23 に実際にやった）。
      await page.waitForTimeout(6000);
      must(await page.locator(".flashnote").count() === 1,
        "断りが 8.5 秒もたずに消えた（⚠ 40 字を読み切れない。⚠ 指の端末には hover が無い）");
      out.push("8.5 秒は消えない");

      await page.locator(".flashnote").hover();
      await page.waitForTimeout(11000);
      must(await page.locator(".flashnote").count() === 1,
        "読んでいる（hover 中）のに、断りが消えた");
      // ⚠ **離せば閉じる**
      await page.mouse.move(5, 5);
      await page.waitForTimeout(12000);
      must(await page.locator(".flashnote").count() === 0,
        "離しても断りが閉じない（自然に閉じると言えない）");
      // ⚠ **閉じたあとも、⚠ 次の一手は読める**（ADR 0026）
      const after = await page.evaluate(() =>
        (document.querySelector(".hint")?.textContent ?? "").trim());
      must(/地名/.test(after), `断りが閉じたあと、次に何をするかが画面に無い: ${after}`);
      out.push("hover 中は消えず・離すと閉じ・手がかりは残る");
      return out.join(" ／ ");
    },
  },
];
