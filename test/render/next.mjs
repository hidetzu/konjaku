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
    // ⚠ **掟 §1 そのもの**: ⚠ **取得できなかった ≠ 存在しなかった。**
    //   ⚠ **実際に踏んだ**（2026-08-29。⚠ この検査を書いていて見つけた）:
    //   ⚠ **周辺の資料そのものを読めなくしても、⚠ 画面は資料が無い場所とまったく同じだった。**
    //   ⚠ **「読み込めなかった」と「その地域の資料が無い」が、⚠ 見分けられなかった。**
    // ⚠ **塞いで確かめる。**⚠ **「起きにくいから」で通さない**（`change-review` §4）。
    name: "周辺の資料を読めないときと、資料が無いときを、言い分ける",
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    setup: (page) => page.route("**/data/area-record.json", (r) => r.abort()),
    async check(page) {
      await waitAnswer(page);
      await page.waitForTimeout(2500);
      await page.locator(".why__sum").click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const row = document.getElementById("area").closest(".why__row");
        return { 出る: !row.hidden, 字: document.getElementById("area").textContent.trim(),
                 出典: document.getElementById("areaCite").textContent.trim() };
      });
      // ⚠ **黙ってはいけない。**⚠ 黙ると、⚠ その地域の資料が無い場所と見分けられない
      must(r.出る, "周辺の資料を読めないのに、行ごと黙っている（⚠ 資料が無い場所と見分けられない）");
      must(/読み込めませんでした/.test(r.字), `読めなかったことを言っていない: ${r.字}`);
      must(/分かっていません/.test(r.字), `在るかどうかが分からない、と言っていない: ${r.字}`);
      // ⚠ **「無い」と言わない**（掟 §1）
      must(!/ありません$|記録はありません|無いです/.test(r.字), `読めなかったのに「無い」と言っている: ${r.字}`);
      // ⚠ **読めていないのに出典を名乗らない**（⚠ どの資料かも分かっていない）
      must(r.出典 === "", `読めていないのに出典を出している: ${r.出典}`);
      return `「${r.字}」・出典は出さない`;
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

CASES.push({
  // ⚠ **文字を大きくして壊れない**（`ui-ux-review` §3）。⚠ **v0.1.0 では 1 度も見ていなかった。**
  //   ⚠ **実際に踏んだ**（2026-08-29。⚠ この検査を書いていて見つけた）:
  //     ⚠ **「なぜそう言える？」を開いて文字を 20px にすると、⚠ 板が 888px になり、
  //       ⚠ 320px 幅で検索窓と年代が 5 組重なった。**⚠ **答えの 1 文も画面の外へ出ていた。**
  //     ⚠ **出典のリンクが、⚠ 折り返すと 41px になっていた**（⚠ 擬似要素では届かない）。
  //
  // ⚠ **見えているかは `checkVisibility()` で見る**（`CLAUDE.md` §9）。
  //   ⚠ **閉じた `<details>` の中では、⚠ `getBoundingClientRect()` が直前の寸法を返し続ける。**
  //   ⚠ **これも同じ日に踏んだ**（⚠ 無い不具合を「在る」と報告しかけた）。
  name: "文字を大きくしても、重ならず・はみ出さず・44×44 を割らない",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: { width: 320, height: 640 },
  setup: (page) => page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "html{font-size:20px}";   // ⚠ 端末の文字サイズ設定に相当
    document.head.append(s);
  })),
  async check(page) {
    await waitAnswer(page); await waitEras(page);
    // ⚠ **いちばん高くなる状態で測る。**⚠ 畳んだままだと、⚠ 伸びたときの重なりを見られない
    await page.locator(".why__sum").click();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const 押せる = [...document.querySelectorAll("button, a, summary, input")]
        .filter((e) => e.checkVisibility());
      const 小さい = 押せる.map((e) => {
        const b = e.getBoundingClientRect();
        return { 字: (e.textContent || e.id || e.tagName).trim().slice(0, 10),
                 w: Math.round(b.width), h: Math.round(b.height) };
      }).filter((t) => t.w > 0 && (t.w < 44 || t.h < 44));
      const 箱 = 押せる.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      const 重なり = [];
      for (let i = 0; i < 箱.length; i++) for (let j = i + 1; j < 箱.length; j++) {
        const a = 箱[i].r, c = 箱[j].r;
        if (箱[i].e.contains(箱[j].e) || 箱[j].e.contains(箱[i].e)) continue;
        if (!(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom))
          重なり.push(`${(箱[i].e.textContent || 箱[i].e.id).trim().slice(0, 8)} × ${(箱[j].e.textContent || 箱[j].e.id).trim().slice(0, 8)}`);
      }
      const card = document.getElementById("card").getBoundingClientRect();
      const bar = document.getElementById("bar").getBoundingClientRect();
      return { 板: Math.round(card.height), 押せるもの: 押せる.length,
               画面外へ出た分: Math.round(Math.max(0, card.bottom - innerHeight)),
               バーに掛かった分: Math.round(Math.max(0, bar.bottom - card.top)),
               横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
               小さい, 重なり };
    });
    must(!r.重なり.length, `文字を大きくしたら、押せるもの同士が重なった: ${r.重なり.join(" / ")}`);
    must(!r.小さい.length, `文字を大きくしたら、44×44 を割った: ${r.小さい.map((t) => `${t.字} ${t.w}x${t.h}`).join(" / ")}`);
    must(r.画面外へ出た分 === 0, `板が画面の下へ ${r.画面外へ出た分}px はみ出している`);
    must(r.バーに掛かった分 === 0, `板が検索窓に ${r.バーに掛かった分}px 掛かっている（⚠ 場所を探せなくなる）`);
    must(!r.横あふれ, "画面が横にあふれている");
    return `板 ${r.板}px・押せるもの ${r.押せるもの} 個・重なり 0・44 割れ 0・はみ出し 0`;
  },
});

CASES.push(
  {
    // ⚠ **押せるものにフォーカスが行く／目で分かる**（`ui-ux-review` §3）。
    //   ⚠ **v0.1.0 では 1 度も見ていなかった**（2026-08-29 に測ったら、⚠ 壊れてはいなかった）。
    // ⚠ **壊れていなくても残す。**⚠ **次に壊れたら止まる形にする**（`CLAUDE.md` §2）。
    //
    // ⚠ **一周は要素そのもので見る。**⚠ **名前で見ると、⚠ 同じ字のものがあるだけで止まる**
    //   （2026-08-29 に踏んだ。⚠ 13 個あるのに「1 個」と出た）。
    name: "Tab で押せるもの全部に行けて、フォーカスが目で分かる",
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page); await waitEras(page);
      // ⚠ **いちばん押せるものが多い状態で見る**（⚠ 畳んだままだと、⚠ 中の 1 つを見られない）
      await page.locator(".why__sum").click();
      await page.waitForTimeout(400);
      const 見える = await page.evaluate(() =>
        [...document.querySelectorAll("button, a, summary, input, [tabindex]")]
          .filter((e) => e.checkVisibility())
          .map((e) => (e.textContent || e.id || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 14)));
      await page.evaluate(() => {
        document.body.setAttribute("tabindex", "-1"); document.body.focus();
      });
      const 経路 = [], 印なし = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const cur = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body || e === document.documentElement) return null;
          if (e.dataset.tabSeen) return { 一周: true };
          e.dataset.tabSeen = "1";
          const cs = getComputedStyle(e);
          return { 名: (e.textContent || e.id || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 14),
                   印: !(cs.outlineStyle === "none" && cs.boxShadow === "none") };
        });
        if (!cur) continue;          // ⚠ ブラウザの枠へ抜けただけ。⚠ まだ回る
        if (cur.一周) break;
        経路.push(cur.名);
        if (!cur.印) 印なし.push(cur.名);
      }
      const 行けない = 見える.filter((n) => !経路.includes(n));
      must(!行けない.length, `Tab で行けない押せるものがある: ${行けない.join(" / ")}`);
      must(!印なし.length, `フォーカスの印が無い: ${印なし.join(" / ")}`);
      return `押せるもの ${見える.length} 個・Tab で ${経路.length} 個・印なし 0`;
    },
  },

  {
    // ⚠ **明治期が取れなかったときも黙らない**（2026-08-29。Owner 判断）。
    //   ⚠ **周辺の記録・空中写真と挙動を揃える。**
    //   ⚠ **実際に踏んだ**: ⚠ **タイルを塞ぐと、⚠ 行もまとめの 1 行も静かに消え、
    //     ⚠ 利用者には何も起きなかったように見えた。**
    name: "明治期を読めないときも、黙らない",
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    setup: (page) => page.route("**://cyberjapandata.gsi.go.jp/xyz/swale/**", (r) => r.abort()),
    async check(page) {
      await waitAnswer(page);
      await page.waitForTimeout(4000);
      await page.locator(".why__sum").click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const row = document.getElementById("meiji").closest(".why__row");
        return { 出る: !row.hidden,
                 明治期: document.getElementById("meiji").textContent.trim(),
                 足元: document.getElementById("gloss").textContent.trim(),
                 まとめ: document.getElementById("sub").textContent.trim() };
      });
      must(r.出る, "明治期を読めないのに、行ごと黙っている（⚠ 周辺と空中写真は言う。⚠ 揃っていない）");
      must(/確認できませんでした/.test(r.明治期), `読めなかったことを言っていない: ${r.明治期}`);
      // ⚠ **「無い」と言わない**（掟 §1）
      must(!/ありません$|無いです|存在しません/.test(r.明治期), `読めなかったのに「無い」と言っている: ${r.明治期}`);
      // ⚠ **まとめの 1 行には出さない**（⚠ 取れていないものを、⚠ 言えることの行に混ぜない）
      must(!/明治期/.test(r.まとめ), `まとめに、取れていない明治期が出ている: ${r.まとめ}`);
      // ⚠ **「足元と同じ字を使わない」は、⚠ ここでは確かめられない。**
      //   ⚠ **豊洲は足元に区分が在るので、⚠ 比べる相手が答えの文になる**（⚠ 必ず違う）。
      //   ⚠ **足元が「言えないとき」の字になるのは、⚠ 区分が無い場所だけ。**
      //   ⚠ **わざと同じ字に戻しても素通りした**（2026-08-29。⚠ 実際に踏んだ）。
      //   ⚠ **字の重複は `test/check/next.mjs` が見る。**⚠ **ここは挙動だけを見る。**
      return `「${r.明治期}」・まとめは「${r.まとめ}」`;
    },
  },
);

CASES.push({
  // ⚠ **動きを止めている人の設定を無視しない**（`ui-ux-review` §3）。
  //   ⚠ **v0.1.0 は、⚠ いま動くものを 1 つも持っていない**（⚠ 実測 2026-08-29: 見えている 83 要素で 0）。
  // ⚠ **壊れていなくても残す。**⚠ **次に動きを足した人が、⚠ この設定を忘れたら止まる。**
  //
  // ⚠ **見るのは `reduce` のときだけ。**⚠ **動きそのものを禁じない**
  //   （⚠ 止めていない人には動いてよい。⚠ そこまで縛ると、⚠ 間違った主張を固定する）。
  name: "動きを止めている人には、動かさない",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => page.emulateMedia({ reducedMotion: "reduce" }),
  async check(page) {
    await waitAnswer(page); await waitEras(page);
    // ⚠ **いちばん要素が多い状態で見る**
    await page.locator(".why__sum").click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const 秒 = (s) => (s || "0s").split(",").map((x) => parseFloat(x) || 0);
      const 動く = [];
      let 見た = 0;
      for (const e of document.querySelectorAll("*")) {
        if (!e.checkVisibility()) continue;
        見た++;
        const cs = getComputedStyle(e);
        const t = Math.max(...秒(cs.transitionDuration), ...秒(cs.transitionDelay));
        const a = Math.max(...秒(cs.animationDuration));
        if (t > 0 || a > 0 || cs.scrollBehavior === "smooth")
          動く.push(`${e.tagName}${e.id ? "#" + e.id : ""} t=${t} a=${a} scroll=${cs.scrollBehavior}`);
      }
      return { 見た, 動く };
    });
    must(!r.動く.length,
      `動きを止めている人の設定なのに、動くものがある: ${r.動く.slice(0, 4).join(" / ")}`);
    return `見えている ${r.見た} 要素・動くもの 0`;
  },
});

CASES.push({
  // ⚠ **状態を色と位置だけで言わない**（`ui-ux-review` §3）。
  //   ⚠ **色が見分けにくい人に、⚠ どれを選んでいるかが伝わらない。**
  // ⚠ **見るのは「字か `aria-*` も変わるか」。**⚠ **色を変えるなと言っているのではない。**
  //
  // ⚠ **実測（2026-08-29）**:
  //     保存    ⚠ 字が変わる（☆保存 → ★保存ずみ）＋ aria-pressed
  //     年代    ⚠ **字は変わらない。**⚠ aria-pressed だけ（⚠ 目には出ない）
  //     なぜ    ⚠ 印が変わる（▾ → ▴）
  name: "状態を、色と位置だけで言わない",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  async check(page) {
    await waitAnswer(page); await waitEras(page);
    // ⚠ **色以外に何が変わるかも見る。**⚠ **色を落としても残るのは、⚠ 字の太さのほう。**
    //   ⚠ **実際に絵で確かめた**（2026-08-29。⚠ 色を全部落とした絵・1 型の絵）。
    const 撮る = (sel) => page.evaluate((s) => {
      const e = document.querySelector(s);
      const 中 = e.querySelector(".era__y") ?? e;
      return { 字: e.textContent.trim(), pressed: e.getAttribute("aria-pressed"),
               太さ: getComputedStyle(中).fontWeight };
    }, sel);

    const 保存前 = await 撮る("#save");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    const 保存後 = await 撮る("#save");
    must(保存前.字 !== 保存後.字 || 保存前.pressed !== 保存後.pressed,
      `保存の状態が、色と位置だけで表されている（字も aria-* も変わらない）`);
    must(保存前.字 !== 保存後.字,
      `保存の状態が、字では分からない（${保存前.字} → ${保存後.字}）`);

    const 年代前 = await 撮る(".era");
    await page.locator(".era").first().click();
    await page.waitForTimeout(1500);
    const 年代後 = await 撮る(".era");
    // ⚠ **年代は、⚠ いま aria-pressed だけで表している。**⚠ **字は変わらない。**
    //   ⚠ **`ui-ux-review` §3 は「字か aria-* も」なので、⚠ これは満たしている。**
    //   ⚠ **満たしているところで止める。**⚠ **ここで「字も変えろ」と足すと、
    //     ⚠ 決めていない主張を検査が固定する**（`CLAUDE.md` §9）。
    must(年代前.pressed !== 年代後.pressed,
      `年代の状態が、色と位置だけで表されている（aria-pressed が変わらない）`);
    // ⚠ **目でも、⚠ 色を落として残るものが要る。**⚠ **字の太さがそれ**（⚠ 400 → 700）。
    //   ⚠ **枠の太さは変わらない**（⚠ 1px のまま。⚠ 変わるのは枠の色）。
    must(年代前.太さ !== 年代後.太さ,
      `年代の状態が、色でしか変わらない（字の太さが ${年代前.太さ} のまま）`);

    const なぜ = await page.evaluate(() => {
      const d = document.getElementById("why"), s = d.querySelector("summary");
      const 前 = getComputedStyle(s, "::after").content;
      d.open = !d.open;
      const 後 = getComputedStyle(s, "::after").content;
      d.open = !d.open;
      return { 前, 後 };
    });
    must(なぜ.前 !== なぜ.後,
      `開いているかが、色と位置だけで表されている（印が変わらない: ${なぜ.前}）`);
    return `保存「${保存前.字}」→「${保存後.字}」・年代 aria-pressed ${年代前.pressed}→${年代後.pressed}・なぜ ${なぜ.前}→${なぜ.後}`;
  },
});

CASES.push({
  // ⚠ **`docs/adr/0048` の 3（⚠ URL で手渡す）の、⚠ いちばん小さいぶん。**
  //   ⚠ **URL には元から座標が入る**（`?ll=`）。⚠ **読む口も書く口も `place-arg.js` の 1 か所。**
  //   ⚠ **実測（2026-08-29）**: ⚠ **地図を動かしても年代を押しても URL は開いたときのまま。**
  //     ⚠ **共有のボタンも無く、⚠ アドレス欄を手で写すしかなかった。**
  //
  // ⚠ **年代は送らない**（2026-08-29。Owner 判断）。⚠ **送るのは場所だけ。**
  // ⚠ **押したあとに何が起きたかを、⚠ 必ず字で言う**（`docs/adr/0026`）。
  name: "いまの場所のリンクを送れて、開くと同じ場所に戻る",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  // ⚠ **写す口は、⚠ 許可が要る。**⚠ **実物のブラウザでは利用者の操作で許可される。**
  setup: (page) => page.context().grantPermissions(["clipboard-read", "clipboard-write"],
    { origin: NEXT_BASE }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("share").hidden, "送る");
    const 的 = await page.evaluate(() => {
      const b = document.getElementById("share").getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    });
    must(的.w >= 44 && 的.h >= 44, `送るの的が 44×44 を割っている: ${的.w}x${的.h}`);

    // ⚠ **いま見ている場所が入ること。**⚠ **開いたときの URL をそのまま返さない**
    await page.mouse.move(180, 300);
    await page.mouse.down();
    await page.mouse.move(130, 250, { steps: 6 });
    await page.mouse.up();
    await waitAnswer(page);
    await page.waitForTimeout(3000);
    // ⚠ **中身は写した字で見る**（⚠ 端末の共有の口はブラウザでは開かない）
    await page.evaluate(() => navigator.clipboard.writeText("x"));
    await page.locator("#share").click();
    await page.waitForTimeout(600);
    const 後 = await page.evaluate(async () => ({
      字: document.getElementById("shareText").textContent.trim(),
      写した: await navigator.clipboard.readText().catch(() => null),
    }));
    must(後.写した, "リンクを写せなかった（⚠ 検査の権限か、⚠ 実装の不具合）");
    must(/[?&]ll=/.test(後.写した), `リンクに場所が入っていない: ${後.写した}`);
    // ⚠ **いま見ている場所が入ること。**⚠ **開いたときの URL をそのまま返していないか。**
    //   ⚠ **実際に踏んだ**（2026-08-29）: ⚠ **`location.search` をそのまま返す形に壊しても
    //     ⚠ 素通りした。**⚠ **「ll= が在る」だけでは、⚠ 動かした結果が入っているとは言えない。**
    const 開いたとき = new URLSearchParams(TOYOSU).get("ll");
    const 送った先 = new URLSearchParams(後.写した.split("?")[1] ?? "").get("ll");
    must(送った先 && 送った先 !== 開いたとき,
      `地図を動かしたのに、⚠ 開いたときの場所を送っている（${開いたとき} → ${送った先}）`);
    // ⚠ **年代は送らない**
    must(!/[?&]era=/.test(後.写した), `リンクに年代が入っている（⚠ 送るのは場所だけ）: ${後.写した}`);
    // ⚠ **空の指定を配らない**（⚠ 受け取った人に壊れた URL に見える）
    must(!/[?&]q=(&|$)/.test(後.写した), `リンクに空の指定が入っている: ${後.写した}`);
    // ⚠ **押したあとに何が起きたかを字で言う**
    must(後.字 !== "送る", `押したのに、字が変わらない（⚠ 何が起きたか分からない）: ${後.字}`);

    // ⚠ **開くと、⚠ 同じ場所に戻ること**（⚠ ここまで見ないと「送れた」と言えない）
    const 送った = 後.写した.replace(/^https?:\/\/[^/]+/, "");
    await page.goto(NEXT_BASE + 送った, { waitUntil: "domcontentloaded" });
    await waitAnswer(page);
    const 戻り = await page.evaluate(() =>
      new URLSearchParams(location.search).get("ll"));
    must(戻り === 送った先, `送ったリンクを開いても、同じ場所にならない（${送った先} → ${戻り}）`);
    return `的 ${的.w}x${的.h}・「${後.字}」・${開いたとき} → ${送った先}`;
  },
});

// ⚠ **広い幅（帰宅後）**。⚠ **`docs/adr/0048` は「散歩＝スマホ、⚠ 家＝PC＝掘る」と分けている。**
//   ⚠ **実測（2026-08-29・1280×950）**: ⚠ **スマホの形が横に伸びているだけだった。**
//     ⚠ 答えの 1 文が 1238px 幅の 1 行 ／ ⚠ 年代が 1 つ 173px ／ ⚠ 右側の空きが 8px。
const PC = { width: 1440, height: 950 };

CASES.push({
  // ⚠ **広い幅でも、⚠ スマホと同じ形。**⚠ **横に並べ替えない。**
  //   ⚠ **一度 3 列にして、⚠ 実測で「操作しづらい」が出た**（2026-08-29）:
  //     ⚠ 押せるものの散らばり  ⚠ スマホ 302×594px → ⚠ **3 列 1250×637px**
  //     ⚠ いちばん離れた 2 つ    ⚠ 615px → ⚠ **1374px**
  //   ⚠ **利用者役 3 名とも、⚠ この形を選んだ**（⚠ この一連のテストで初めて 3/3 が一致した）。
  // ⚠ **見るのは「散らばりが、⚠ スマホと同じ程度に収まっているか」。**
  name: "広い幅でも、押すものがスマホと同じところにまとまっている",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  async check(page) {
    await waitAnswer(page); await waitEras(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => {
      const 押せる = [...document.querySelectorAll("button, a, summary, input")]
        .filter((e) => e.checkVisibility());
      const xs = 押せる.map((e) => { const b = e.getBoundingClientRect(); return b.x + b.width / 2; });
      const bar = document.getElementById("bar").getBoundingClientRect();
      const card = document.getElementById("card").getBoundingClientRect();
      return {
        押せるもの: 押せる.length,
        横の散らばり: Math.round(Math.max(...xs) - Math.min(...xs)),
        板の幅: Math.round(card.width),
        検索の幅: Math.round(bar.width),
        板の中心: Math.round(card.x + card.width / 2),
        画面の中心: Math.round(innerWidth / 2),
        答えの幅: Math.round(document.getElementById("gloss").getBoundingClientRect().width),
        横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    // ⚠ **柱 1 本の中に収まっていること。**⚠ **数を決め打ちにしない**（⚠ 柱の幅は変わりうる）。
    //   ⚠ **3 列のときは 1250px で、⚠ 柱をまたいで散っていた。**
    must(r.横の散らばり <= r.板の幅,
      `押すものが柱からはみ出している（散らばり ${r.横の散らばり}px / 柱 ${r.板の幅}px）`);
    // ⚠ **読む行の幅を、⚠ 読める幅に保つ**（⚠ 横いっぱいにすると 1398px になる）
    //   ⚠ **柱の幅は `/deep` と同じ 38rem。**⚠ そこを超えない
    must(r.答えの幅 <= r.板の幅, `答えの 1 文が柱より広い（${r.答えの幅}px / 柱 ${r.板の幅}px）`);
    must(r.答えの幅 < 700, `答えの 1 文が広すぎる（${r.答えの幅}px）`);
    // ⚠ **中央に立てる**（⚠ 左右どちらかへ寄せない）
    must(Math.abs(r.板の中心 - r.画面の中心) < 20,
      `板が中央に無い（板 ${r.板の中心} / 画面 ${r.画面の中心}）`);
    // ⚠ **検索と板の幅がそろっている**（⚠ 1 本の柱に見える）
    must(Math.abs(r.板の幅 - r.検索の幅) < 20,
      `検索と板の幅が違う（板 ${r.板の幅} / 検索 ${r.検索の幅}）`);
    must(!r.横あふれ, "画面が横にあふれている");
    return `散らばり ${r.横の散らばり}px・柱 ${r.板の幅}px・答え ${r.答えの幅}px`;
  },
});

// ⚠ **帰宅後の深掘り画面**（`/deep.html`）。⚠ **散歩中の画面とは別の作り。**
//   ⚠ **問いも時間も違う**（⚠ 散歩中「ここは昔なんだった？」5 秒 ／ ⚠ 帰宅後「なぜこうなった？」10 分）。
CASES.push(
  {
    // ⚠ **`landform.json` は 36 区分すべてに成因と災害リスクを持っていた。**
    //   ⚠ **国土地理院の記述そのもの。**⚠ **いままで 1 文字も画面に出していなかった。**
    // ⚠ **要約しない・言い換えない。**⚠ **そのまま出す**（`CLAUDE.md` §5）。
    name: "深掘り画面は、成り立ちと起こりうることを、そのまま出す",
    path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await 待つ(page,
        () => (document.getElementById("gloss").textContent ?? "").trim().length > 2, "答え");
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        場所: document.getElementById("place").textContent.trim(),
        答え: document.getElementById("gloss").textContent.trim(),
        区分: document.getElementById("term").textContent.trim(),
        節: [...document.querySelectorAll(".why__k")].map((e) => e.textContent.trim()),
        文: [...document.querySelectorAll(".why__v")].map((e) => e.textContent.trim()),
        出どころ: [...document.querySelectorAll(".why__from")].map((e) => e.textContent.trim()),
        出典: document.getElementById("cite").textContent.trim(),
        読む幅: Math.round(document.getElementById("doc").getBoundingClientRect().width),
        戻る先: document.getElementById("back").getAttribute("href"),
        横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      must(r.答え.startsWith("ここは、"), `答えが出ていない: ${r.答え}`);
      must(/旧水部/.test(r.区分), `区分名を名乗っていない: ${r.区分}`);
      must(r.節.length >= 2, `成り立ちと起こりうることが出ていない: ${r.節.join(" / ")}`);
      // ⚠ **原典の字がそのまま出ていること**（⚠ 要約していないこと）
      must(r.文.some((t) => t.includes("かつて海や湖")),
        `成り立ちが原典の字で出ていない: ${r.文[0]?.slice(0, 30)}`);
      must(r.文.some((t) => t.includes("液状化")),
        `起こりうることが原典の字で出ていない: ${r.文[1]?.slice(0, 30)}`);
      // ⚠ **誰の記述かを、⚠ 節ごとに名乗る**
      must(r.出どころ.length === r.節.length && r.出どころ.every((t) => /国土地理院/.test(t)),
        `出どころを名乗っていない節がある: ${r.出どころ.join(" / ")}`);
      must(/国土地理院/.test(r.出典), `出典が無い: ${r.出典}`);
      // ⚠ **読む行の幅**（⚠ 読み物なので、⚠ 横いっぱいに伸ばさない）
      must(r.読む幅 < 700, `読む行が広すぎる（${r.読む幅}px）`);
      must(!r.横あふれ, "画面が横にあふれている");
      // ⚠ **戻る先に、⚠ いまの場所が入っていること**（⚠ 戻ったら別の場所、では困る）
      must(/[?&]ll=/.test(r.戻る先 ?? ""), `戻る先に場所が入っていない: ${r.戻る先}`);
      return `${r.節.length} 節・${r.文.map((t) => t.length).join("/")} 字・読む幅 ${r.読む幅}px`;
    },
  },

  {
    // ⚠ **場所が無いときと、⚠ 読み取れないときを分ける**（`place-arg.js` の 3 状態）。
    //   ⚠ **どちらも「その場所が存在しない」ではない。**
    name: "深掘り画面は、場所が無いときと読み取れないときを分ける",
    path: "/deep.html", origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await page.waitForTimeout(1200);
      const 無し = await page.evaluate(() => ({
        答え: document.getElementById("gloss").textContent.trim(),
        節: document.getElementById("whySec").hidden,
      }));
      must(/選ばれていません/.test(無し.答え), `場所が無いときの言い方が違う: ${無し.答え}`);
      must(無し.節, "場所が無いのに、成り立ちの節が出ている");

      await page.goto(`${NEXT_BASE}/deep.html?ll=abc`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const 読めない = await page.evaluate(() =>
        document.getElementById("gloss").textContent.trim());
      must(/読み取れませんでした/.test(読めない), `読み取れないときの言い方が違う: ${読めない}`);
      must(読めない !== 無し.答え, "場所が無いときと、読み取れないときが同じ字になっている");
      return `「${無し.答え}」／「${読めない}」`;
    },
  },

  {
    // ⚠ **押しても何も起きない導線を置かない**（`docs/adr/0026`）。
    //   ⚠ **深掘り画面へ行く道が無ければ、⚠ 作った意味が無い。**
    name: "散歩中の画面から、深掘り画面へ行ける",
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page);
      await page.locator(".why__sum").click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const a = document.getElementById("deepLink");
        const b = a.getBoundingClientRect();
        return { 先: a.getAttribute("href"), 字: a.textContent.trim(),
                 w: Math.round(b.width), h: Math.round(b.height), 見える: a.checkVisibility() };
      });
      must(r.見える, "深掘りへの入口が見えない");
      must(r.h >= 44, `深掘りへの入口が 44 を割っている: ${r.w}x${r.h}`);
      must(/[?&]ll=/.test(r.先 ?? ""), `入口に場所が入っていない: ${r.先}`);
      // ⚠ **押して、⚠ 本当に読めること**（⚠ 行き先が 404 では意味が無い）
      await page.locator("#deepLink").click();
      await 待つ(page,
        () => (document.getElementById("gloss")?.textContent ?? "").trim().length > 2, "深掘りの答え");
      const 先 = await page.evaluate(() => ({
        答え: document.getElementById("gloss").textContent.trim(),
        節: document.querySelectorAll(".why__k").length,
      }));
      must(先.答え.startsWith("ここは、"), `深掘り画面で答えが出ない: ${先.答え}`);
      must(先.節 >= 2, `深掘り画面で成り立ちが出ない（${先.節} 節）`);
      return `「${r.字}」${r.w}x${r.h} → ${先.節} 節`;
    },
  },
);

CASES.push(
  {
    // ⚠ **散歩中は 1 件だけ。**⚠ **帰宅後は全部。**⚠ **読み物として年表で読める。**
    //   ⚠ **並びも違ってよい**（⚠ 散歩中は「1 件を選ぶ」話、⚠ ここは「並べて読む」話）。
    // ⚠ **この地点の記録ではないことは、⚠ どちらでも先に言う**（⚠ 1 名が年を地点のものとして読んだ）。
    name: "深掘り画面は、この一帯の記録を年表で全部出す",
    path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await 待つ(page, () => document.querySelectorAll("#years li").length > 0, "年表");
      await page.waitForTimeout(1000);
      const r = await page.evaluate(() => ({
        見出し: document.getElementById("nearLead").textContent.trim(),
        件数: document.querySelectorAll("#years li").length,
        年: [...document.querySelectorAll("#years .y")].map((e) => Number(e.textContent.replace(/\D/g, ""))),
        印: document.querySelectorAll("#years li.shown").length,
        断り: document.getElementById("nearNote").textContent.trim(),
        出典: document.getElementById("nearFrom").textContent.trim(),
      }));
      must(r.件数 >= 5, `年表が全部出ていない（${r.件数} 件）`);
      // ⚠ **古い順**（⚠ 年表として読むので、⚠ 時の流れの向き）
      must(r.年.every((v, i) => i === 0 || r.年[i - 1] <= v),
        `年表が古い順に並んでいない: ${r.年.join(" ")}`);
      // ⚠ **散歩中に出している 1 件が、⚠ どれか分かる**
      must(r.印 === 1, `散歩中に出した 1 件の印が ${r.印} 個（1 個のはず）`);
      // ⚠ **この地点の記録ではないと、⚠ 先に言う**
      must(/この地点に関する記録ではありません/.test(r.断り), `断りが無い: ${r.断り}`);
      must(!/^\d/.test(r.断り), "断りより先に年が来ている");
      must(/出典/.test(r.出典) && /読んだもの/.test(r.出典), `出典と読んだ日が無い: ${r.出典}`);
      return `${r.件数} 件・${r.年[0]}〜${r.年[r.年.length - 1]}・印 1 個`;
    },
  },

  {
    // ⚠ **点ではなく面で数える。**⚠ **点は「ここは何だったか」、⚠ 面は「まわりはどうだったか」。**
    //   ⚠ **混ぜない**（`docs/adr/0030`）。
    // ⚠ **割合には、⚠ 必ず分母を添える**（`CLAUDE.md` §6）。
    //   ⚠ **数えられなかった画素（透明）を隠さない。**⚠ **「無かった」と読ませない。**
    name: "深掘り画面は、一帯の明治期を分母つきで出す",
    path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await 待つ(page, () => document.querySelectorAll("#shares li").length > 0, "一帯の割合");
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({
        見出し: document.getElementById("aroundLead").textContent.trim(),
        割合: [...document.querySelectorAll("#shares li")].map((e) => e.textContent.trim().replace(/\s+/g, "")),
        分母: document.getElementById("aroundNote").textContent.trim(),
      }));
      must(r.割合.length > 0, "一帯の割合が出ていない");
      // ⚠ **分母（範囲の広さと、⚠ 数えた画素）が必ず在る**
      must(/km/.test(r.分母), `分母に範囲の広さが無い: ${r.分母}`);
      must(/画素を数えた/.test(r.分母), `分母に数えた画素が無い: ${r.分母}`);
      // ⚠ **0% に丸まるものを出さない**（⚠ 「在るのに 0」に見える）
      must(!r.割合.some((t) => t.startsWith("0%")), `0% の行が出ている: ${r.割合.join(" / ")}`);
      // ⚠ **出していないものが在るなら、⚠ 何件かを言う**
      must(!/満たない区分が\s*0/.test(r.分母), `0 件を「出していない」と言っている: ${r.分母}`);
      return `${r.割合.join(" / ")}・分母 ${r.分母.length} 字`;
    },
  },

  {
    // ⚠ **資料が作られていない地域で、⚠ 「無い」と言わない**（掟 §1）。
    //   ⚠ **軽井沢は明治期の低湿地の資料が作られていない**（⚠ 実測: タイル 9 枚とも absent）。
    name: "深掘り画面は、一帯の資料が無い地域で「無い」と言わない",
    path: "/deep.html?ll=36.3428,138.6350", origin: NEXT_BASE, viewport: PC,   // ⚠ 軽井沢
    async check(page) {
      await 待つ(page,
        () => (document.getElementById("gloss").textContent ?? "").trim().length > 2, "答え");
      await page.waitForTimeout(4000);
      const r = await page.evaluate(() => ({
        節: document.getElementById("nearSec").hidden,
        一帯: document.getElementById("around").hidden
          ? "出ない" : document.getElementById("aroundLead").textContent.trim(),
        割合: document.querySelectorAll("#shares li").length,
        年表: document.querySelectorAll("#years li").length,
      }));
      must(!r.節, "資料が作られていない地域で、まわりの節ごと黙っている");
      must(/作られていません/.test(r.一帯), `作られていないことを言っていない: ${r.一帯}`);
      must(!/ありません$|無いです|存在しません/.test(r.一帯), `「無い」と言っている: ${r.一帯}`);
      must(r.割合 === 0, `資料が無いのに割合が出ている（${r.割合} 行）`);
      must(r.年表 === 0, `この地域の記録が無いのに年表が出ている（${r.年表} 件）`);
      return `「${r.一帯}」・割合 0 行・年表 0 件`;
    },
  },
);

CASES.push(
  {
    // ⚠ **標高は、⚠ 散歩中は出さないと決めてある**（`docs/adr/0059`）。
    //   ⚠ **帰宅後は前提が違う**（2026-08-29。Owner 判断）。⚠ **「なぜ液状化のリスクがあるのか」に直接効く。**
    // ⚠ **1 点の値であることを、⚠ 必ず言う**（⚠ まわりの高さではない）。
    name: "深掘り画面は、標高を 1 点の値として出す",
    path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await 待つ(page, () => !!document.querySelector(".elev"), "標高");
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const e = document.querySelector(".elev");
        const risk = [...document.querySelectorAll(".why--risk")].pop();
        return { 字: e.textContent.trim().replace(/\s+/g, " "),
                 値: e.querySelector(".v")?.textContent.trim() ?? null,
                 riskの下: risk ? e.getBoundingClientRect().top > risk.getBoundingClientRect().top : null };
      });
      must(r.値, `標高の値が出ていない: ${r.字}`);
      must(/m$/.test(r.値), `単位が無い: ${r.値}`);
      // ⚠ **1 点の値だと、⚠ 必ず言う**（⚠ 面の話と混ぜない）
      must(/1 点の値/.test(r.字), `1 点の値だと言っていない: ${r.字}`);
      must(/まわりの高さではありません/.test(r.字), `まわりの高さでないと言っていない: ${r.字}`);
      // ⚠ **どこから読んだかを名乗る**
      must(/メッシュ|国土地理院/.test(r.字), `どこから読んだかを名乗っていない: ${r.字}`);
      // ⚠ **起こりうることの下に置く**（⚠ risk の文と噛み合わせる）
      must(r.riskの下 !== false, "標高が、起こりうることより上に出ている");
      return `${r.値}・「${r.字.slice(0, 30)}…」`;
    },
  },

  {
    // ⚠ **本当に読んだのかを、⚠ 読んだ人が確かめられるようにする**（⚠ β 版は出していた）。
    //   ⚠ **読み物としては重いので、⚠ いちばん下に置く。**
    // ⚠ **取れなかったものは、⚠ 取れなかったと書く。**⚠ **空欄にしない**（掟 §1）。
    name: "深掘り画面は、読んだタイルと画素を出す",
    path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await 待つ(page, () => document.querySelectorAll("#read div").length > 0, "読んだもの");
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        行: [...document.querySelectorAll("#read div")].map((e) => ({
          名: e.querySelector("dt").textContent.trim(),
          先: e.querySelector("a")?.getAttribute("href") ?? null,
          字: e.querySelector("dd").textContent.trim().replace(/\s+/g, " "),
        })),
        いちばん下: (() => {
          const s = [...document.querySelectorAll(".sec")];
          return s[s.length - 1]?.id === "readSec";
        })(),
      }));
      must(r.行.length >= 4, `読んだものが足りない（${r.行.length} 件）`);
      // ⚠ **タイルの URL が、⚠ 本当に地理院を指していること**
      const リンク = r.行.filter((x) => x.先);
      must(リンク.length >= 3, `タイルの行き先が足りない（${リンク.length} 件）`);
      must(リンク.every((x) => /gsi\.go\.jp/.test(x.先)),
        `地理院でない行き先がある: ${リンク.map((x) => x.先).join(" / ")}`);
      // ⚠ **画素の位置まで出す**（⚠ 「どこを読んだか」が分かる）
      must(r.行.some((x) => /画素/.test(x.字)), `読んだ画素が出ていない: ${r.行.map((x) => x.名).join("/")}`);
      // ⚠ **空中写真は、⚠ 確かめた数と残っていた数を分ける**
      const 写真 = r.行.find((x) => x.名 === "空中写真");
      must(写真 && /確かめ/.test(写真.字), `空中写真の分母が無い: ${写真?.字}`);
      // ⚠ **読み物としては重いので、⚠ いちばん下**
      must(r.いちばん下, "読んだものが、いちばん下に無い");
      return `${r.行.length} 件（${r.行.map((x) => x.名).join("・")}）`;
    },
  },
);

CASES.push({
  // ⚠ **検索の候補は、⚠ どの柱よりも前に出る。**
  //   ⚠ **実際に踏んだ**（2026-08-29。⚠ Owner が実機で見つけた）:
  //   ⚠ **広い幅で保存した場所の柱（z-index 20）を立てたとき、⚠ 候補が柱の裏に入った。**
  //   ⚠ **1 つ目を触ると柱の見出しが返ってきて、⚠ 押せなかった。**
  // ⚠ **検索は「どこを見るか」を決める操作。**⚠ **覆われると先へ進めない。**
  //
  // ⚠ **重なりを見るだけでは足りない。**⚠ **重なってよい**（⚠ 前に出ていれば押せる）。
  //   ⚠ **実際に触って、⚠ 候補が返ってくるかを見る。**
  name: "検索の候補が、保存した場所の柱に覆われない",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  // ⚠ **外へ出る**（⚠ 地理院の住所検索）。⚠ **`--group=search` の側に置く**
  //   ⚠ **印は `dep`。**⚠ 付いていないと core 側で回り、⚠ 落ちたとき外部のせいにできない
  dep: "search",
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    // ⚠ **柱が立っている状態で見る**（⚠ 1 件も保存していないと入口が出ない）。
    //   ⚠ **保存しただけでは柱は開かない。**⚠ **入口を押して開く**（⚠ 利用者と同じ道）。
    //   ⚠ **以前は広い幅で柱が開きっぱなしだったので、⚠ 押さずに待っていた。**
    //   ⚠ **その見せ方は取り消した**ので、⚠ ここも押す形に直した（2026-08-29）。
    await page.locator("#save").click();
    await 待つ(page, () => !document.getElementById("savedOpen").hidden, "保存した場所の入口");
    await page.locator("#savedOpen").click();
    await 待つ(page,
      () => !document.getElementById("savedSheet").hidden, "保存した場所の柱");
    await page.locator("#q").fill("豊洲");
    await page.locator("#q").press("Enter");
    await 待つ(page, () => document.querySelectorAll("#hits li").length > 0, "検索の候補");
    const r = await page.evaluate(() => {
      const hits = document.getElementById("hits");
      const first = hits.querySelector("button");
      const b = first.getBoundingClientRect();
      const 上 = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      const saved = document.getElementById("savedSheet").getBoundingClientRect();
      const hr = hits.getBoundingClientRect();
      return {
        件数: hits.querySelectorAll("li").length,
        押せる: !!(上 && first.contains(上)),
        触ると返るもの: 上 ? (上.id || 上.className || 上.tagName) : "無し",
        柱と重なる: !(hr.right <= saved.left || hr.left >= saved.right
                     || hr.bottom <= saved.top || hr.top >= saved.bottom),
      };
    });
    must(r.件数 > 0, "検索の候補が出ていない");
    must(r.押せる,
      `検索の候補が押せない（触ると ${r.触ると返るもの} が返る）。⚠ 柱の裏に入っている`);
    // ⚠ **押して、⚠ 本当に場所が変わること**（⚠ 押せるだけでは足りない）
    const 前 = await page.evaluate(() => document.getElementById("gloss").textContent.trim());
    await page.locator("#hits button").first().click();
    await page.waitForTimeout(4000);
    const 後 = await page.evaluate(() => ({
      候補: document.getElementById("hits").hidden,
      答え: document.getElementById("gloss").textContent.trim(),
    }));
    must(後.候補, "候補を押したのに、候補が出たまま");
    must(後.答え.startsWith("ここは、"), `候補を押したのに、答えが出ない: ${後.答え}`);
    return `${r.件数} 件・柱と重なる ${r.柱と重なる}・押せる・「${前.slice(0, 12)}…」→「${後.答え.slice(0, 12)}…」`;
  },
});

CASES.push({
  // ⚠ **深掘り画面の主役は「どう変わったか」**（2026-08-29。Owner 判断）。
  //   ⚠ **時間の流れが、⚠ いちばん先に理解できること。**
  //   ⚠ **明治期 → 空中写真の年代 → いま を、⚠ 並べる**（⚠ 切り替えない）。
  //     ⚠ **切り替えると、⚠ 前の絵を覚えていないと比べられない。**
  // ⚠ **絵の中身は読まない。**⚠ **「この年代に何が写っているか」はこちらでは言わない**（掟 §1）。
  name: "深掘り画面は、どう変わったかを先に見せる",
  path: `/deep.html?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  async check(page) {
    await 待つ(page, () => document.querySelectorAll(".frame").length > 0, "並べた絵");
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({
      節: [...document.querySelectorAll(".sec")].filter((e) => !e.hidden)
        .map((e) => e.querySelector("h2").textContent.trim()),
      枠: [...document.querySelectorAll(".frame__y")].map((e) => e.textContent.trim()),
      絵: document.querySelectorAll(".frame__win img").length,
      断り: document.getElementById("timeNote").textContent.trim(),
      印: !!document.querySelector(".frame__win"),
    }));
    // ⚠ **順**: ⚠ どう変わったか → なぜこうなった → まわり → 資料
    must(r.節[0] === "どう変わったか", `主役が先頭に無い: ${r.節.join(" → ")}`);
    must(r.節.indexOf("なぜこうなった") === 1, `2 番目が「なぜこうなった」でない: ${r.節.join(" → ")}`);
    must(r.節[r.節.length - 1].includes("資料"), `最後が資料でない: ${r.節.join(" → ")}`);
    // ⚠ **明治期から今まで、⚠ 時の流れの向きに並ぶ**
    must(r.枠[0] === "明治期", `いちばん左が明治期でない: ${r.枠[0]}`);
    must(r.枠[r.枠.length - 1] === "現在", `いちばん右が現在でない: ${r.枠[r.枠.length - 1]}`);
    must(r.枠.length >= 5, `並べた絵が少ない（${r.枠.length} 枚）`);
    must(r.絵 >= r.枠.length, `絵が読み込まれていない（枠 ${r.枠.length} / 絵 ${r.絵}）`);
    // ⚠ **こちらでは判定していない、と断る**
    must(/判定していません/.test(r.断り), `絵の中身を判定していないと断っていない: ${r.断り}`);
    must(/同じ広さ/.test(r.断り), `同じ広さで切り取っていると言っていない: ${r.断り}`);
    return `${r.節.join(" → ")}・${r.枠.length} 枚（${r.枠[0]}〜${r.枠[r.枠.length - 1]}）`;
  },
});

CASES.push({
  // ⚠ **端末をまたぐ流れ**（`docs/adr/0048` の 3）。⚠ **サーバに置かない。**
  //   ⚠ **スマホで保存 → リンクを作る → 別の端末で開く → 足す**、を通しで見る。
  // ⚠ **別の端末は、⚠ 別の器で作る**（⚠ `localStorage` も別）。
  //   ⚠ **同じ器で見ると、⚠ 渡さなくても在るので、⚠ 何も確かめていないことになる。**
  name: "スマホで保存したものを、別の端末で受け取れる",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => page.context().grantPermissions(["clipboard-read", "clipboard-write"],
    { origin: NEXT_BASE }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    const 的 = await page.evaluate(() => {
      const h = document.getElementById("handOut");
      const r = h.getBoundingClientRect();
      return { 見える: h.checkVisibility(), 字: h.textContent.trim(),
               w: Math.round(r.width), h: Math.round(r.height) };
    });
    must(的.見える, "保存があるのに、別の端末へ渡す口が出ない");
    must(的.h >= 44, `渡す口が 44 を割っている: ${的.w}x${的.h}`);

    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.locator("#handOut").click();
    await page.waitForTimeout(800);
    const url = await page.evaluate(() => navigator.clipboard.readText());
    must(url && /[?&]take=/.test(url), `渡すリンクに中身が入っていない: ${url}`);
    // ⚠ **長すぎる URL は、⚠ 開いた先で切れる**（⚠ 実用上 2000 文字）
    must(url.length <= 2000, `渡すリンクが長すぎる（${url.length} 文字）`);

    // ⚠ **別の端末で開く**（⚠ 器を分ける。⚠ localStorage も別）
    const 別 = await page.context().browser().newContext({ viewport: { width: 1440, height: 950 } });
    const p2 = await 別.newPage();
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, NEXT_BASE), { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => !document.getElementById("take").hidden, null, { timeout: 20000 });
    const 受け = await p2.evaluate(() => ({
      見出し: document.getElementById("takeTitle").textContent.trim(),
      本文: document.getElementById("takeBody").textContent.trim(),
      断り: document.getElementById("takeNote").textContent.trim(),
      行: document.querySelectorAll("#takeList li").length,
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
    }));
    // ⚠ **開いた瞬間に混ぜない。**⚠ **見せて、⚠ 押してもらう**
    must(受け.控え === 0, `開いただけで混ざっている（控え ${受け.控え} 件）`);
    must(/受け取りました/.test(受け.見出し), `受け取ったと言っていない: ${受け.見出し}`);
    must(/消えません/.test(受け.本文), `いまの保存が消えないと言っていない: ${受け.本文}`);
    // ⚠ **どこにも送らない、と言う**（⚠ サーバに置いていないことを、⚠ 受け取る人にも言う）
    must(/どこにも送りません/.test(受け.断り), `どこにも送らないと言っていない: ${受け.断り}`);
    must(受け.行 > 0, "何が来たかを見せていない");

    await p2.locator("#takeYes").click();
    await p2.waitForTimeout(1200);
    const 後 = await p2.evaluate(() => ({
      見出し: document.getElementById("takeTitle").textContent.trim(),
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
      入口: !document.getElementById("savedOpen").hidden,
    }));
    must(後.控え > 0, `足したのに、控えが増えていない（${後.控え} 件）`);
    must(/足しました/.test(後.見出し), `足したと言っていない: ${後.見出し}`);
    must(後.入口, "足したのに、一覧への入口が出ない");
    await 別.close();
    return `${url.length} 文字・${受け.行} 件を見せて・押すと ${後.控え} 件`;
  },
});

CASES.push({
  // ⚠ **地図が主役**（`.claude/rules/domain.md`）。⚠ **その主役を、⚠ 見えていない箱に取らせない。**
  //   ⚠ **実際に踏んだ（2026-08-29・375x667）**: 板（`#bottom`）は画面いっぱいに広がるが、
  //   ⚠ **出典の段は右端の箱しか見えていない。**⚠ **残りは透けているのに押しどまりになっていた。**
  //   ⚠ **「ここ」の印がちょうどその段に入り、⚠ 印から引いても 1px も動かなかった。**
  // ⚠ **同じ操作が 1024x768 と 1440x950 では動いていた。**⚠ **狭い幅だけの話。**
  //   ⚠ **だから、⚠ 比べる相手（PC）も一緒に見る。**⚠ **片方だけだと「元から動かない」と区別できない。**
  name: "地点の印のところから、地図を動かせる",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  async check(page) {
    await waitAnswer(page);
    // ⚠ **板が伸びきってから測る**（`CLAUDE.md` §9「器ではなく、落ち着いたことを待つ」）。
    //   ⚠ **答えの字だけで測ると、⚠ 年代のボタンが出る前なので板が短く、
    //   ⚠ 印が板の外に居る。**⚠ **そのままだと、⚠ 壊しても素通りする**（⚠ 実際にそうなった）。
    await 待つ(page, () => document.querySelectorAll("#eras .era").length > 0, "年代のボタン");
    await 待つ(page, () => {
      const a = document.querySelector(".attrib a");
      return !!a && a.checkVisibility();
    }, "出典");
    await page.waitForTimeout(600);
    // ⚠ **印が板の段に入っていることを、⚠ 先に確かめる。**
    //   ⚠ **入っていなければ、⚠ この検査は何も見ていない**（⚠ 幅や板の高さが変われば外れる）。
    const 段に入っている = await page.evaluate(() => {
      const q = document.querySelector(".me").getBoundingClientRect();
      const b = document.getElementById("bottom").getBoundingClientRect();
      const y = q.y + q.height / 2;
      return { 入っている: y > b.top && y < b.bottom,
               印y: Math.round(y), 板y: Math.round(b.top), 板下: Math.round(b.bottom) };
    });
    must(段に入っている.入っている,
      `地点の印が板の範囲に入っていない（印 y=${段に入っている.印y} ／ 板 ${段に入っている.板y}〜${段に入っている.板下}）`
      + "。⚠ このままでは、⚠ この検査は何も見ていない");
    // ⚠ **地図が動いたかは、⚠ タイルの絵の位置で見る**（⚠ URL は引いただけでは変わらない）
    const 絵 = () => page.evaluate(() => {
      const im = document.querySelector("#map .layer img");
      if (!im) return null;
      const q = im.getBoundingClientRect();
      return `${Math.round(q.x)},${Math.round(q.y)}`;
    });
    const 引く = async (x, y) => {
      const 前 = await 絵();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 100, y - 100, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const 後 = await 絵();
      return { 前, 後, 動いた: !!前 && 前 !== 後 };
    };
    const 印 = await page.evaluate(() => {
      const q = document.querySelector(".me").getBoundingClientRect();
      const t = document.elementFromPoint(Math.round(q.x + q.width / 2), Math.round(q.y + q.height / 2));
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2),
               覆う: t ? (t.id || t.className || t.tagName) : "無し" };
    });
    must(印.覆う !== "bottom",
      `地点の印が、板の透けている段に入っている（触ると ${印.覆う} が返る）`);
    const r = await 引く(印.x, 印.y);
    must(r.動いた, `地点の印から地図を引いても動かない（${r.前} のまま）`);

    // ⚠ **札の上では動かないこと**（⚠ 打ち消しすぎると、⚠ 今度は札を読めなくなる）
    const 札 = await page.evaluate(() => {
      const q = document.getElementById("gloss").getBoundingClientRect();
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
    });
    const s = await 引く(札.x, 札.y);
    must(!s.動いた, `答えの字を引いたら、⚠ 背面の地図が動いた（${s.前} → ${s.後}）`);
    // ⚠ **出典は押せたままであること**
    const 出典 = await page.evaluate(() => {
      const a = document.querySelector(".attrib a");
      const q = a.getBoundingClientRect();
      const t = document.elementFromPoint(Math.round(q.x + q.width / 2), Math.round(q.y + q.height / 2));
      return { 押せる: !!(t && a.contains(t)), 触ると: t ? (t.id || t.className || t.tagName) : "無し" };
    });
    must(出典.押せる, `出典が押せなくなっている（触ると ${出典.触ると} が返る）`);
    return `印(${印.x},${印.y}) ${r.前} → ${r.後} ／ 札は動かさない ／ 出典は押せる`;
  },
});

// ⚠ **タブレットの幅**（2026-08-29。⚠ Owner 判断で「このままでよい」）。
//   ⚠ **実測して、⚠ 壊れているところは無かった**（⚠ 横あふれ 0・⚠ 押せるものは 44 以上・
//   ⚠ **700px 以上はすでに PC と同じ扱い**）。
//   ⚠ **だから直さない。**⚠ **かわりに、⚠ 壊れたときに気づけるようにする。**
// ⚠ **横向きは縦が短い**（768〜820px）。⚠ **そこが最初に窮屈になる**ので、⚠ 縦も測る。
const TABLET = [
  { name: "iPad mini 縦", viewport: { width: 768, height: 1024 } },
  { name: "iPad mini 横", viewport: { width: 1024, height: 768 } },
  { name: "iPad Pro 横", viewport: { width: 1366, height: 1024 } },
];
for (const t of TABLET) {
  CASES.push({
    name: `タブレット（${t.name}）でも、散歩中の画面が壊れない`,
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: t.viewport,
    // ⚠ **文字を大きくした状態で測る**（⚠ 端末の文字サイズ設定に相当）。
    //   ⚠ **既定の文字だと、⚠ 板は上限に届かない。**⚠ **届かないと、⚠ 上限の主張は何も見ていない**
    //   （⚠ 実際に、⚠ 上限を 3 倍にしても素通りした）。
    //   ⚠ **横向きは縦が 768px しかない。**⚠ **そこで初めて、⚠ 板が検索窓へ迫る。**
    setup: (page) => page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "html{font-size:20px}";
      document.head.append(st);
    })),
    async check(page) {
      await waitAnswer(page);
      await 待つ(page, () => document.querySelectorAll("#eras .era").length > 0, "年代のボタン");
      // ⚠ **いちばん高くなる状態で測る**（⚠ 畳んだままでは、⚠ 伸びたときを見られない）
      await page.locator(".why__sum").click();
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const doc = document.documentElement;
        const 見える = (id) => {
          const e = document.getElementById(id);
          return e && e.checkVisibility() ? e.getBoundingClientRect() : null;
        };
        const bar = 見える("bar"), bottom = 見える("bottom"), gloss = 見える("gloss");
        // ⚠ **押せるものは 44 を割らない**（⚠ 幅が変わっても同じ）
        const 小さい = [...document.querySelectorAll("button, a[href], input")]
          .filter((e) => e.checkVisibility())
          .map((e) => ({ e, q: e.getBoundingClientRect() }))
          .filter(({ q }) => q.height < 44 || q.width < 44)
          .map(({ e, q }) => `${e.id || e.className || e.tagName}=${Math.round(q.width)}x${Math.round(q.height)}`);
        return {
          横あふれ: doc.scrollWidth - doc.clientWidth,
          柱幅: bottom ? Math.round(bottom.width) : null,
          検索幅: bar ? Math.round(bar.width) : null,
          答えが見える: !!gloss && gloss.top >= 0 && gloss.bottom <= innerHeight,
          答え字数: (document.getElementById("gloss")?.textContent ?? "").trim().length,
          小さい,
        };
      });
      // ⚠ **横へあふれない**（⚠ 本文が横に流れると、⚠ 読む順が崩れる）
      must(r.横あふれ === 0, `横へ ${r.横あふれ}px あふれている`);
      // ⚠ **柱と検索窓は同じ幅**（⚠ 片方だけ伸びると、⚠ 目の動きが揃わない）
      must(r.柱幅 === r.検索幅, `柱 ${r.柱幅}px と検索窓 ${r.検索幅}px の幅が違う`);
      // ⚠ **板が検索窓を押し出さないことは、⚠ ここでは見ない。**
      //   ⚠ **タブレットでは、⚠ 板が上限に届かない**（⚠ 実測: 文字 20px ＋「なぜそう言える？」を
      //   ⚠ 開いても、⚠ 1024x768 で板の上端 444px ／ 検索窓の下端 72px）。
      //   ⚠ **柱が 760px 広いので、⚠ 中身が縦に伸びない。**
      //   ⚠ **届かない主張を置くと、⚠ 「見ている」ように読めて、⚠ 何も見ていない**
      //   （⚠ 実際に、⚠ 上限を 3 倍にしても素通りした）。
      //   ⚠ **上限が効くのは狭い幅。**⚠ **それは 320px の検査が見ている。**
      must(r.答えが見える && r.答え字数 > 10,
        `答えの 1 文が画面に収まっていない（${r.答え字数} 字）`);
      must(r.小さい.length === 0, `44 を割る操作要素がある: ${r.小さい.join(" / ")}`);
      return `あふれ 0 ／ 柱 ${r.柱幅}px ／ 答え ${r.答え字数} 字 ／ 44 未満 0 個`;
    },
  });
}

CASES.push({
  // ⚠ **渡せる長さは、⚠ 実測で決めている**（2026-08-29・`tmp/measure-urllen.mjs`）。
  //   ⚠ **50 件 1168 文字 / 100 件 2033 / 500 件 9172 / 700 件 12829 まで開けた。**
  //   ⚠ **1000 件 18172 文字で 431**（⚠ 配信側のヘッダ上限）。
  //   ⚠ **以前は 2000 文字で止めていた。**⚠ **実測の 6 分の 1 で、⚠ 100 件の手前で止まっていた。**
  // ⚠ **だから、⚠ 100 件が渡せることを検査で押さえる**（⚠ 戻したら落ちる）。
  name: "保存が 100 件でも渡せて、多すぎるときは渡さないと言う",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => page.addInitScript(() => {
    // ⚠ **控えを先に置いてから画面を開く**（⚠ 100 件を手で保存させない）。
    //   ⚠ **形は `saved.js` が読むものと同じ。**⚠ 食い違うと、⚠ 画面が 0 件から始まって気づける。
    const list = Array.from({ length: 100 }, (_, i) => ({
      lat: 35.65531 + i * 0.01234, lon: 139.79672 + i * 0.01234,
      name: `東京都江東区豊洲${"一二三四五六七八九十"[i % 10]}丁目`,
      value: ["旧水部", "埋立地", "低地", "台地"][i % 4],
      gloss: "かつて水面で、その後陸地にされた土地",
      at: 1756400000000 + i * 86400000,
    }));
    // ⚠ **`addInitScript` は読み込み直しでも走る。**⚠ **無条件に書くと、⚠ 控えを戻してしまう**
    //   （⚠ 実際に踏んだ: ⚠ 多すぎる控えに入れ替えて読み込み直したら、⚠ 100 件へ戻っていた）。
    if (!localStorage.getItem("konjaku-next-saved-v1"))
      localStorage.setItem("konjaku-next-saved-v1", JSON.stringify(list));
    // ⚠ **共有シートを差し替えて、⚠ 何を渡したかを控える。**
    //   ⚠ **ここが無いと、⚠ 題と説明を落としても気づけない**（⚠ 書き写しに来ない）。
    // ⚠ **控えは読み込み直しで消える**ので、⚠ **数は `sessionStorage` に持ち越す**
    globalThis.__shared = [];
    navigator.share = (d) => {
      globalThis.__shared.push(d);
      sessionStorage.setItem("__shared", String(Number(sessionStorage.getItem("__shared") ?? 0) + 1));
      return Promise.resolve();
    };
  }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("savedOpen").hidden, "保存した場所の入口");
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    await page.locator("#handOut").click();
    await 待つ(page, () => globalThis.__shared.length > 0, "共有シートへ渡すもの");
    const 渡した = await page.evaluate(() => globalThis.__shared[0]);
    must(渡した.url && /[?&]take=/.test(渡した.url), `リンクに中身が入っていない: ${渡した.url}`);
    // ⚠ **以前の上限（2000）なら、⚠ ここで「渡せません」になっていた**
    must(渡した.url.length > 2000,
      `100 件のリンクが 2000 文字以下（${渡した.url.length} 文字）。⚠ この検査は何も見ていない`);
    must(渡した.url.length <= 12000, `渡す上限を超えている（${渡した.url.length} 文字）`);
    // ⚠ **題と説明が要る。**⚠ **URL だけだと、⚠ 送った先で何のリンクか分からない**
    must(渡した.title && /今昔/.test(渡した.title), `共有に題が無い: ${JSON.stringify(渡した.title)}`);
    must(渡した.text && /100 件/.test(渡した.text),
      `共有の説明に件数が無い: ${JSON.stringify(渡した.text)}`);
    // ⚠ **地名を入れない**（⚠ 共有シートの先に地名が残る。⚠ `docs/adr/0008` の主旨）
    must(!/豊洲/.test(渡した.title + 渡した.text),
      `共有の題か説明に地名が入っている: ${渡した.title} ／ ${渡した.text}`);

    // ⚠ **多すぎるときは、⚠ 渡さないと言う**（⚠ 黙って切らない）
    await page.evaluate(() => {
      const big = Array.from({ length: 1500 }, (_, i) => ({
        lat: 35 + i * 0.001, lon: 139 + i * 0.001,
        name: "非常に長い名前を持つ架空の町名でリンクを膨らませるための行",
        value: "旧水部", gloss: "かつて水面", at: 1756400000000 + i,
      }));
      localStorage.setItem("konjaku-next-saved-v1", JSON.stringify(big));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("savedOpen").hidden, "保存した場所の入口");
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    const 前の数 = await page.evaluate(() => Number(sessionStorage.getItem("__shared") ?? 0));
    await page.locator("#handOut").click();
    await page.waitForTimeout(1200);
    const 後 = await page.evaluate(() => ({
      字: document.getElementById("handOutText").textContent.trim(),
      渡した数: Number(sessionStorage.getItem("__shared") ?? 0),
    }));
    must(後.渡した数 === 前の数, "長すぎるのに渡してしまった");
    must(/渡せません/.test(後.字), `長すぎるときに言っていない: ${後.字}`);
    return `100 件 = ${渡した.url.length} 文字を渡した ／ 1500 件は「${後.字}」`;
  },
});
