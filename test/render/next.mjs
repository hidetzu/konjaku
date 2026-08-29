// 実描画 — v0.1.0（`public-next/`）。
//
// ⚠ **この suite だけを回せる**: `node test/render.mjs --suite=next`
// ⚠ **β とは別の Worker なので、⚠ 別のサーバに立てている**（`origin: NEXT_BASE`）。
//
// ⚠ **なぜ要るか**（2026-08-29）。⚠ **1 日で 2 件、⚠ 静的検査が緑のまま通した**:
//
//     ⚠ **写真の全面に、⚠ 前に塗った地形分類の青が乗っていた**
//       ⚠ 描くのをやめただけで、⚠ canvas が前の絵を持ったままだった
//     ⚠ **地理院タイルの出典が、⚠ 1 つも出ていなかった**
//       ⚠ 地図を手で組んでいるので、⚠ MapLibre の帰属表示が付いてこない
//
//   ⚠ **どちらも字を見る検査では見つからない。**⚠ **絵か、⚠ 実際の寸法でしか出ない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { NEXT_BASE, must } from "./lib.mjs";

// ⚠ **`?ll=` は緯度,経度の順**（`place-arg.js`）。⚠ **逆に書くと、⚠ 黙って既定の場所になる。**
const TOYOSU = "ll=35.6553,139.7967";     // ⚠ 旧水部・空中写真 7 年代
const KASUKABE = "ll=35.9756,139.7523";   // ⚠ 氾濫平野・⚠ **周辺の記録が無い場所**

// ⚠ **v0.1.0 は散歩中のスマホが相手**（`docs/adr/0064`）。⚠ **既定の 1200px では測る意味が薄い。**
//   ⚠ **実際に踏んだ**（2026-08-29）: ⚠ **年代が横に流れる不具合を、⚠ 1200px では捕まえられなかった**
//     （⚠ 幅があるので 7 つとも収まってしまう）。⚠ **狭い幅で回す。**
const SP = { width: 375, height: 667 };

// ⚠ **器ではなく、⚠ 結果の字を待つ**（`CLAUDE.md` §9）。
//   ⚠ **「器がある」を待つと、⚠ 速い環境では偶然中身も間に合い、⚠ CI でだけ落ちる。**
const 待つ = (page, fn, label) =>
  page.waitForFunction(fn, null, { timeout: 30000 })
    .catch(() => { throw new Error(`${label}が出ないまま 30 秒たった`); });

const waitAnswer = (page) => 待つ(page,
  () => (document.getElementById("gloss")?.textContent ?? "").trim().length > 2, "判定");
const waitEras = (page) => 待つ(page,
  () => document.querySelectorAll(".era").length > 0, "年代");

export const CASES = [
  {
    // ⚠ **実際に踏んだ**（2026-08-29）: ⚠ 1936–42 の写真の全面に、⚠ 旧水部の青が乗っていた。
    //   ⚠ **描くのをやめるだけでは足りない。**⚠ **canvas は前に塗った絵を持ったまま。**
    //   ⚠ **見るのは「塗っていない」ではなく、⚠ 「画素が残っていない」ほう。**
    name: "写真を出したら、地形分類の色が残っていない", path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page); await waitEras(page);
      const 前 = await page.evaluate(() => {
        const c = document.querySelector("#map canvas");
        const g = c.getContext("2d", { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
      });
      must(前 > 0, "地形分類が 1 画素も塗られていない（⚠ 写真を出す前なのに）");
      await page.locator(".era").first().click();
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        const c = document.querySelector("#map canvas");
        const g = c.getContext("2d", { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return { 残り: n, 断り: (document.getElementById("eraNote").textContent ?? "").trim(),
                 凡例: document.getElementById("legend").hidden,
                 写真: document.querySelectorAll("#map .layer img").length };
      });
      must(r.残り === 0, `写真の上に地形分類の色が ${r.残り} 画素残っている（⚠ canvas を消していない）`);
      must(r.凡例, "写真を出しているのに凡例が出たまま（⚠ 画面に無い色を名乗っている）");
      must(/空中写真を出しています/.test(r.断り), `何を出しているかを言っていない: ${r.断り}`);
      must(r.写真 > 0, "写真のタイルが 1 枚も敷かれていない");
      return `塗り ${前} → 0 画素・写真 ${r.写真} 枚・凡例を隠した・「${r.断り.slice(0, 18)}…」`;
    },
  },

  {
    // ⚠ **実際に踏んだ**（2026-08-29）: ⚠ 出典が 1 つも出ていない状態で `develop` に入っていた。
    //   ⚠ **出典明示は地理院タイルの利用の条件。**
    //   ⚠ **静的検査は「配信物に書いてある」までしか言えない**（`test/check/next.mjs`）。
    //   ⚠ **見えていること・覆われていないことは、⚠ ここでしか言えない。**
    name: "出典が見えていて、板にも一覧にも覆われない", path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page); await waitEras(page);
      const 見る = () => page.evaluate(() => {
        const a = document.querySelector(".attrib"), link = a?.querySelector("a");
        if (!a || !link) return null;
        const r = a.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const 上 = document.elementFromPoint(cx, cy);
        return {
          見えている: a.checkVisibility(),
          字: a.textContent.trim(),
          先: link.getAttribute("href"),
          画面内: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
          覆われていない: !!(上 && a.contains(上)),
        };
      });
      const 地図 = await 見る();
      must(地図, "出典が 1 つも無い（⚠ 出典明示は地理院タイルの利用の条件）");
      must(地図.見えている && 地図.画面内 && 地図.覆われていない,
        `出典が見えていないか覆われている: ${JSON.stringify(地図)}`);
      must(/国土地理院/.test(地図.字), `出典が誰の資料かを言っていない: ${地図.字}`);
      must(/maps\.gsi\.go\.jp/.test(地図.先 ?? ""), `出典の行き先が地理院ではない: ${地図.先}`);

      // 写真を出しても消えない
      await page.locator(".era").first().click();
      await page.waitForTimeout(1200);
      const 写真中 = await 見る();
      must(写真中?.見えている && 写真中.画面内 && 写真中.覆われていない,
        `写真を出したら出典が隠れた: ${JSON.stringify(写真中)}`);

      // 「ほか N 種を見る」を開いても覆われない
      await page.locator(".era-back").click();
      await page.waitForTimeout(600);
      const more = page.locator("#more");
      if (await more.isVisible()) {
        await more.click(); await page.waitForTimeout(400);
        const 一覧中 = await 見る();
        must(一覧中?.見えている && 一覧中.覆われていない,
          `一覧を開いたら出典が覆われた: ${JSON.stringify(一覧中)}`);
      }
      return `「${地図.字}」→ ${地図.先}・写真中も一覧中も覆われない`;
    },
  },

  {
    // ⚠ **利用者役 3 名中 1 名が「7 個目があるのは、⚠ 指で払って初めて分かった」と言った**
    //   （2026-08-29）。⚠ **実測では 309px が画面の外にあった。**
    // ⚠ **「収まっている」は、⚠ 字を見ても分からない。**
    name: "年代は全部が画面に収まり、44×44 を割らない", path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page); await waitEras(page);
      const r = await page.evaluate(() => {
        const box = document.getElementById("eras");
        const 的 = [...box.querySelectorAll(".era")].map((e) => {
          const b = e.getBoundingClientRect();
          return { 字: e.textContent.trim(), w: Math.round(b.width), h: Math.round(b.height),
                   画面内: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth };
        });
        return { 的, 横に隠れている: Math.round(Math.max(0, box.scrollWidth - box.clientWidth)),
                 横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      must(r.的.length > 0, "年代が 1 つも出ていない");
      must(r.横に隠れている === 0, `年代が ${r.横に隠れている}px 画面の外にある（⚠ 指で払わないと見えない）`);
      const 小さい = r.的.filter((t) => t.w < 44 || t.h < 44);
      must(!小さい.length, `年代が 44×44 を割っている: ${小さい.map((t) => `${t.字} ${t.w}x${t.h}`).join(" / ")}`);
      const 外 = r.的.filter((t) => !t.画面内);
      must(!外.length, `年代が画面の外に出ている: ${外.map((t) => t.字).join(" / ")}`);
      must(!r.横あふれ, "画面が横にあふれている");
      return `${r.的.length} 年代・全部 ${r.的[0].w}x${r.的[0].h} 以上・隠れ 0px`;
    },
  },

  {
    // ⚠ **保存は「散歩を中断せずに残し、⚠ 家で続きを見る」の要**（`docs/adr/0064`）。
    //   ⚠ **β では 18 日間 0 件だった。**⚠ **押せる形になっていなかった。**
    // ⚠ **ここで見るのは、⚠ 押した結果が本当に残り、⚠ 本当に戻れること。**
    name: "保存すると一覧に残り、押すとその地点へ戻る", path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page);
      await 待つ(page, () => !document.getElementById("save").hidden, "保存");
      const 的 = await page.evaluate(() => {
        const b = document.getElementById("save").getBoundingClientRect();
        return { w: Math.round(b.width), h: Math.round(b.height) };
      });
      must(的.w >= 44 && 的.h >= 44, `保存の的が 44×44 を割っている: ${的.w}x${的.h}`);
      must(await page.evaluate(() => document.getElementById("savedOpen").hidden),
        "1 件も保存していないのに、一覧への入口が出ている（⚠ 押しても空になる）");

      await page.locator("#save").click();
      await 待つ(page,
        () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
      // 名前は地理院に聞いてから埋まる。届かないこともあるので、控えの有無だけを待つ
      await page.waitForTimeout(2500);
      const 控え = await page.evaluate(() => JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]"));
      must(控え.length === 1, `保存したのに控えが ${控え.length} 件`);
      must(Number.isFinite(控え[0].lon) && Number.isFinite(控え[0].lat), "控えに座標が無い（⚠ 戻れない）");
      must(!await page.evaluate(() => document.getElementById("savedOpen").hidden),
        "保存したのに、一覧への入口が出ない");

      // 別の場所へ移ってから、一覧で戻る
      await page.goto(`${NEXT_BASE}/?${KASUKABE}`, { waitUntil: "domcontentloaded" });
      await waitAnswer(page);
      must(await page.evaluate(() => document.getElementById("save").getAttribute("aria-pressed")) === "false",
        "別の場所なのに「保存ずみ」になっている");
      await page.locator("#savedOpen").click();
      await page.waitForTimeout(400);
      const 行 = await page.evaluate(() =>
        [...document.querySelectorAll("#savedList li")].map((e) => e.textContent.trim()));
      must(行.length === 1, `一覧が ${行.length} 件（⚠ 1 件のはず）`);
      await page.locator("#savedList button").first().click();
      await 待つ(page,
        () => document.getElementById("save").getAttribute("aria-pressed") === "true", "戻った");
      must(await page.evaluate(() => document.getElementById("savedSheet").hidden),
        "戻ったのに一覧が開いたまま");
      return `的 ${的.w}x${的.h}・控え 1 件・別の場所では ☆・一覧から戻ると ★`;
    },
  },
];

// ---- ⚠ ここから下は 2026-08-29 に足したぶん（`docs/adr/0066` の「決めていないこと」）----
//
// ⚠ **上の 4 件は「実際に踏んだ」ものを的にしている。**
// ⚠ **こちらは「まだ踏んでいないが、⚠ 踏むと痛い」ところ。**
//   ⚠ **観点は `ui-ux-review` §3 から借りる。**⚠ **新しい下限を発明しない。**

CASES.push(
  {
    // ⚠ **暗い色みは、⚠ 明るい色みを直したときに黙って壊れる**（⚠ β で実際に起きている）。
    //   ⚠ **色は `theme.css` の 1 か所**という決めがあるが、⚠ v0.1.0 は自前で持っている。
    //   ⚠ **見るのは「値が書いてあるか」ではなく、⚠ 「実際に読めるか」。**
    name: "暗い色みでも、答えと出典が読める", path: `/?${TOYOSU}`, origin: NEXT_BASE,
    viewport: SP, colorScheme: "dark",
    async check(page) {
      await waitAnswer(page);
      const r = await page.evaluate(() => {
        const 色 = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const 輝度 = ([r, g, b]) => {
          const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const 比 = (a, b) => {
          const [x, y] = [輝度(a), 輝度(b)].sort((p, q) => q - p);
          return Number(((x + 0.05) / (y + 0.05)).toFixed(2));
        };
        // ⚠ **地を辿る。**⚠ 透明な親を持つ要素は、⚠ その上の地で測らないと嘘になる
        const 地の色 = (el) => {
          for (let e = el; e; e = e.parentElement) {
            const c = getComputedStyle(e).backgroundColor;
            const v = 色(c);
            if (v.length === 3 && !/rgba\([^)]*,\s*0\)/.test(c)) return v;
          }
          return [0, 0, 0];
        };
        const 測る = (el) => 比(色(getComputedStyle(el).color), 地の色(el));
        const 答え = document.getElementById("gloss");
        const 出典 = document.querySelector(".attrib a");
        const 板 = getComputedStyle(document.getElementById("card")).backgroundColor;
        return { 答え: 測る(答え), 出典: 測る(出典), 板の地: 板,
                 暗い: 輝度(色(板)) < 0.2 };
      });
      // ⚠ **色みが本当に暗いほうになっているかを、⚠ 先に確かめる。**
      //   ⚠ **これが無いと、⚠ 明るいまま測って「通った」ことになる。**
      must(r.暗い, `暗い色みになっていない（板の地が ${r.板の地}）`);
      // ⚠ **4.5 は本文の下限**（WCAG AA）。⚠ **こちらで決めた値ではない。**
      must(r.答え >= 4.5, `暗い色みで、答えの文が読みにくい（${r.答え}）`);
      must(r.出典 >= 4.5, `暗い色みで、出典が読みにくい（${r.出典}）`);
      return `板 ${r.板の地}・答え ${r.答え}・出典 ${r.出典}`;
    },
  },

  {
    // ⚠ **320×640 はいちばん狭い**（`ui-ux-review` §0）。
    //   ⚠ **年代は折り返す。**⚠ **折り返しても 44×44 を割らず、⚠ 横にあふれないこと。**
    //   ⚠ **375px では折り返さないので、⚠ この形は 320px でしか通らない。**
    name: "320px でも、年代は折り返して収まる", path: `/?${TOYOSU}`, origin: NEXT_BASE,
    viewport: { width: 320, height: 640 },
    async check(page) {
      await waitAnswer(page); await waitEras(page);
      const r = await page.evaluate(() => {
        const box = document.getElementById("eras");
        const 的 = [...box.querySelectorAll(".era")].map((e) => {
          const b = e.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) };
        });
        return { 的, 段: new Set(的.map((t) => t.top)).size,
                 横に隠れている: Math.round(Math.max(0, box.scrollWidth - box.clientWidth)),
                 横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      must(r.的.length > 0, "年代が 1 つも出ていない");
      must(r.段 >= 2, `320px なのに折り返していない（${r.段} 段）。⚠ 幅の指定が効いていない可能性がある`);
      must(r.横に隠れている === 0, `年代が ${r.横に隠れている}px 画面の外にある`);
      const 小さい = r.的.filter((t) => t.w < 44 || t.h < 44);
      must(!小さい.length, `折り返したら 44×44 を割った: ${小さい.map((t) => `${t.w}x${t.h}`).join(" / ")}`);
      must(!r.横あふれ, "画面が横にあふれている");
      return `${r.的.length} 年代・${r.段} 段・全部 ${Math.min(...r.的.map((t) => t.w))}x44 以上・隠れ 0px`;
    },
  },

  {
    // ⚠ **掟 §1 そのもの**: ⚠ **取れなかった ≠ 無い ／ データにない ≠ 現実にない。**
    //   ⚠ **松江は明治期の低湿地の資料が作られていない地域。**
    //   ⚠ **「この場所は水はけがよい」と言ってはいけない。**⚠ **「資料が作られていない」と言う。**
    // ⚠ **字を見る検査でも書けるが、⚠ 実際にその場所で出るかは実描画でしか言えない。**
    name: "資料が無い地域で、「無い」と「作られていない」を言い分ける",
    path: "/?ll=35.4700,133.0500", origin: NEXT_BASE, viewport: SP,   // ⚠ 松江
    async check(page) {
      await waitAnswer(page);
      await page.waitForTimeout(3000);
      await page.locator(".why__sum").click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const 見える = (id) => !document.getElementById(id).closest(".why__row").hidden;
        return {
          答え: document.getElementById("gloss").textContent.trim(),
          明治期: 見える("meiji") ? document.getElementById("meiji").textContent.trim() : null,
          周辺: 見える("area") ? document.getElementById("area").textContent.trim() : null,
          まとめ: document.getElementById("sub").textContent.trim(),
        };
      });
      must(r.答え.startsWith("ここは、"), `足元の答えが出ていない: ${r.答え}`);
      must(r.明治期 !== null, "明治期の行ごと消えている（⚠ 資料が作られていないことを言えていない）");
      must(/作られていません/.test(r.明治期),
        `資料が作られていない地域なのに、そう言っていない: ${r.明治期}`);
      // ⚠ **「無い」と言っていないこと。**⚠ **言い換えの取りこぼしを見る。**
      must(!/ありません$|無いです|存在しません/.test(r.明治期),
        `資料の話を「無い」と言っている: ${r.明治期}`);
      // ⚠ **周辺の記録が無い地域では、⚠ 行ごと出ない**（⚠ 空の箱を出すと「無い」の主張に読まれる）
      must(r.周辺 === null, `資料が無いのに、周辺の記録の行が出ている: ${r.周辺}`);
      // ⚠ **まとめの 1 行に、⚠ 明治期を書かない**（⚠ 取れていないものを、まとめに混ぜない）
      must(!/明治期/.test(r.まとめ), `まとめに、取れていない明治期が出ている: ${r.まとめ}`);
      return `「${r.明治期}」・周辺の行は出ない・まとめは「${r.まとめ}」`;
    },
  },

  {
    // ⚠ **補助データが 1 つ取れないだけで、⚠ 画面全体を止めない**（`.claude/rules/javascript.md`）。
    //   ⚠ **町名は保存の瞬間に地理院へ聞く。**⚠ **届かないことがある。**
    //   ⚠ **そのとき保存が失敗したら、⚠ 散歩中に残せない。**
    // ⚠ **塞いで確かめる。**⚠ **「起きにくいから」で通さない**（`change-review` §4）。
    name: "町名が取れなくても、保存は止まらない", path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    setup: (page) => page.route("**://mreversegeocoder.gsi.go.jp/**", (r) => r.abort()),
    async check(page) {
      await waitAnswer(page);
      await 待つ(page, () => !document.getElementById("save").hidden, "保存");
      await page.locator("#save").click();
      await 待つ(page,
        () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        const 控え = JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]");
        return { 件数: 控え.length, 名: 控え[0]?.name ?? null,
                 座標: Number.isFinite(控え[0]?.lon) && Number.isFinite(控え[0]?.lat),
                 説明: 控え[0]?.gloss ?? null };
      });
      must(r.件数 === 1, `町名が取れないと保存できなくなっている（控え ${r.件数} 件）`);
      must(r.座標, "控えに座標が無い（⚠ 戻れない）");
      must(r.名 === null, `町名が取れていないのに、名前が入っている: ${r.名}`);
      must(r.説明, "説明文まで落ちている（⚠ 町名とは別の出典なのに）");
      await page.locator("#savedOpen").click();
      await page.waitForTimeout(400);
      const 行 = await page.evaluate(() =>
        document.querySelector("#savedList li").textContent.trim());
      // ⚠ **「取れませんでした」と書かない。**⚠ **こちらの都合を、相手の都合のように言わない**（掟 §4-1）
      must(/地図から選んだ場所/.test(行), `名前が無いときの言い方が違う: ${行}`);
      must(!/取得|失敗|エラー|できません/.test(行), `一覧に、こちらの都合を書いている: ${行}`);
      return `控え 1 件・名前は null・座標は在る・一覧は「地図から選んだ場所」`;
    },
  },
);
