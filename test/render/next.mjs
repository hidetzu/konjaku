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
// ⚠ **合言葉の口は、⚠ 本物を呼ぶ**（⚠ 偽なのは D1 だけ）。
//   ⚠ **静的に読む。**⚠ **動的に読むと、⚠ `render-scope` が「読んでいない」と見なし、
//   ⚠ この 2 つを触っても実描画が回らない**（2026-08-30 に踏んだ）。
import { fakeDb } from "../handoff-fake-d1.mjs";
import WORKER_NEXT from "../../worker-next.js";

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

// ⚠ **見出しは「問いへの近さ」順**（2026-08-31。Owner 判断。`public-next/answer.js`）。
//   ⚠ **前は「確実性の高い順」**で、⚠ **どの土地でも「ここは、…」で始まっていた**（`docs/adr/0030`）。
//   ⚠ **いまは 3 通りある**:
//     明治期に区分がある      ここは 田 でした（⚠ 上のラベルが「明治期の地図」と名乗る）
//     地形分類が昔を名指す    ここは、かつて水面で、その後陸地にされた土地
//     どちらも無い            なぜ無いかを、⚠ 状態ごとに言い分ける（`docs/adr/0056`）
// ⚠ **字を書き写さない。**⚠ **製品（`KonjakuAnswer`）から借りる。**
//   ⚠ 書き写すと、⚠ **言い直したときに製品ではなく検査が落ちる**（`.claude/rules/domain.md`）。
const 見出しの形 = (page) => page.evaluate(() => {
  const s = (document.getElementById("gloss")?.textContent ?? "").trim();
  const A = window.KonjakuAnswer;
  if (!A) return { s, 形: null, 理由: "KonjakuAnswer が読み込まれていない（この検査が何も見ていない）" };
  if (/^ここは .+ でした$/.test(s)) return { s, 形: "明治期" };
  if (/^ここは、.+/.test(s)) return { s, 形: "地形" };
  const none = Object.keys(A.MEIJI_NONE).find((k) => A.MEIJI_NONE[k] === s);
  return none ? { s, 形: none } : { s, 形: null, 理由: "どの形にも当てはまらない" };
});
const 答えが出ている = async (page, where) => {
  const r = await 見出しの形(page);
  must(r.形 !== null, `${where}で見出しが出ていない（${r.理由 ?? ""}）: ${r.s}`);
  return r;
};

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
          NONE: window.KonjakuAnswer ? window.KonjakuAnswer.MEIJI_NONE : null,
        };
      });
      await 答えが出ている(page, "足元");
      must(r.明治期 !== null, "明治期の行ごと消えている（⚠ 資料が作られていないことを言えていない）");
      // ⚠ **字を書き写さない。**⚠ **製品（`KonjakuAnswer`）から借りる**（`.claude/rules/domain.md`）。
      //   ⚠ **2026-08-31 に踏んだ**: ⚠ **ここが `/作られていません/` を書き写しており、
      //     ⚠ 言い直したら製品ではなく検査が落ちた。**
      must(r.NONE !== null, "KonjakuAnswer が読み込まれていない（⚠ この検査が何も見ていない）");
      must(r.明治期 === r.NONE.absent,
        `資料が作られていない地域なのに、その状態の字を出していない: ${r.明治期}`);
      // ⚠ **3 つの状態が、⚠ 互いに違う字であること**（`docs/adr/0056`。⚠ これが主張の本体）
      must(r.NONE.absent !== r.NONE.noClass && r.NONE.absent !== r.NONE.unreachable,
        `「資料が無い」が、他の状態と同じ字になっている: ${JSON.stringify(r.NONE)}`);
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

// ⚠ **リンク（手渡し）の道は、⚠ 合言葉の板の中に畳んである**（`docs/adr/0072`）。
//   ⚠ **入口を押す → 板が出る → 畳みを開く**、まで運ぶ。
//   ⚠ **合言葉が取れなくても板は出る**（⚠ そのときは畳みが開いた状態で出る）。
async function リンクの道を開く(page) {
  await page.locator("#crossDev").click();
  await 待つ(page, () => !document.getElementById("code").hidden, "合言葉の板");
  const 開いている = await page.evaluate(() => document.getElementById("codeAlt").open);
  if (!開いている) await page.locator("#codeAlt summary").click();
  await 待つ(page, () => document.getElementById("codeAlt").open, "畳みが開くこと");
}

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
      // ⚠ **名乗りの帯は数えない**（2026-08-30）。⚠ **柱ではない。**⚠ **画面いっぱいが意図。**
      //   ⚠ **押せるようにした日から、⚠ ここに入るようになった**（⚠ 前は `<span>` だった）。
      //   ⚠ **見たいのは「板の中の操作が散らばっていないか」。**⚠ **画面の器は別の話。**
      const 押せる = [...document.querySelectorAll("button, a, summary, input")]
        .filter((e) => e.checkVisibility() && !e.closest(".brand"));
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
      // ⚠ **深掘り画面も、⚠ トップと同じ規則**（2026-08-31。Owner 指示。`docs/adr/0075`）。
      //   ⚠ **前は、⚠ 同じ場所で 2 つの画面が別の答えを見出しにしていた。**
      await 答えが出ている(page, "深掘り");
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
      // ⚠ **深掘り画面も、⚠ トップと同じ規則**（上と同じ）。
      await 答えが出ている(page, "深掘り画面");
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
        NONE: window.KonjakuAnswer ? window.KonjakuAnswer.MEIJI_NONE : null,
      }));
      must(!r.節, "資料が作られていない地域で、まわりの節ごと黙っている");
      // ⚠ **字を書き写さない。**⚠ **製品（`KonjakuAnswer`）から借りる**（`.claude/rules/domain.md`）。
      //   ⚠ **2026-08-31 に踏んだ**: ⚠ **ここが `/作られていません/` を書き写しており、
      //     ⚠ 言い直したら製品ではなく検査が落ちた。**
      //   ⚠ **主張の本体は「資料そのものが無い、と言えていること」**であって、字面ではない。
      must(r.NONE !== null, "KonjakuAnswer が読み込まれていない（⚠ この検査が何も見ていない）");
      must(r.一帯 === r.NONE.absent,
        `資料そのものが無い、と言えていない: ${r.一帯}`);
      must(r.NONE.absent !== r.NONE.noClass && r.NONE.absent !== r.NONE.unreachable,
        `「資料が無い」が、他の状態と同じ字になっている: ${JSON.stringify(r.NONE)}`);
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
    await 答えが出ている(page, "候補を押したあと");
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
    // ⚠ **リンクの道は、⚠ 合言葉の板の中に畳んである**（2026-08-29。`docs/adr/0072`）。
    //   ⚠ **入口を押して板を開き、⚠ 畳みを開いてから触る。**
    await リンクの道を開く(page);
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
    must(url && /#\S/.test(url), `渡すリンクに中身が入っていない: ${url}`);
    // ⚠ **長すぎる URL は、⚠ 開いた先で切れる**（⚠ 実用上 2000 文字）
    must(url.length <= 2000, `渡すリンクが長すぎる（${url.length} 文字）`);

    // ⚠ **リンクの行き先は受け取り口**（2026-08-30）。⚠ **地図の上では受けない。**
    //   ⚠ **前はトップ（`/?take=`）で受けていて、⚠ 受け取る画面が 2 つあった。**
    //   ⚠ **同じ問いに答える画面が 2 つあると、⚠ 片方だけ直る**（⚠ 実際にそうなった）。
    must(/\/take#/.test(url), `リンクが受け取り口を指していない: ${url.slice(0, 60)}`);
    // ⚠ **荷物を `?` に載せない**（2026-08-30 に直した）。
    //   ⚠ **クエリは HTTP のリクエスト行に載る。**⚠ **開いた瞬間に配信元へ届く。**
    //   ⚠ **画面は「サーバを通さずに渡す」と言っている。**⚠ **`#` にして初めて字義どおりになる。**
    must(!/[?&]take=/.test(url), `荷物がクエリに載っている（配信元へ届く）: ${url.slice(0, 60)}`);

    // ⚠ **別の端末で開く**（⚠ 器を分ける。⚠ localStorage も別）
    const 別 = await page.context().browser().newContext({ viewport: { width: 1440, height: 950 } });
    const p2 = await 別.newPage();
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, NEXT_BASE), { waitUntil: "domcontentloaded" });
    // ⚠ **見せてから押してもらう一歩は無い**（2026-08-30）。⚠ **そのまま一覧へ進む。**
    await p2.waitForFunction(() => location.pathname.endsWith("/saved")
      && document.querySelectorAll("#listItems li").length > 0, null, { timeout: 20000 });
    const 後 = await p2.evaluate(() => ({
      見出し: document.querySelector(".list__h")?.textContent.trim() ?? "",
      言った: document.getElementById("listSaid").textContent.trim(),
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
      入口: document.querySelector(".brand__name")?.getAttribute("href") === "./",
      URLに残る: !!location.hash,
      深掘り: [...document.querySelectorAll("#listItems a")].map((a) => a.getAttribute("href")),
    }));
    must(/件を足しました/.test(後.言った), `何を足したかを言っていない: ${後.言った}`);
    must(後.控え > 0, `足したのに、控えが増えていない（${後.控え} 件）`);
    // ⚠ **足したあとに `?take=` を残さない**（2026-08-30 に踏んだ）。
    //   ⚠ **残ると、⚠ 読み込み直しでまた同じ問いが出る。**
    //   ⚠ **履歴とアドレス欄に荷物が残り、⚠ そのまま共有すると場所を配る。**
    must(!後.URLに残る, "足したのに、URL に take= が残っている");
    // ⚠ **受け取ったあと、⚠ 深掘りへ行ける**（`docs/adr/0049`「PC は深掘りする場所」）
    must(後.深掘り.length > 0 && 後.深掘り.every((h) => /deep\?ll=/.test(h)),
      `受け取った場所から深掘りへ行けない: ${JSON.stringify(後.深掘り)}`);
    must(/保存した場所/.test(後.見出し), `一覧へ進んでいない: ${後.見出し}`);
    must(後.入口, "足したのに、アプリへ戻る道が無い");
    await 別.close();
    return `${url.length} 文字のリンク → ${後.控え} 件（「${後.言った}」）`;
  },
},

{
  // ⚠ **共有シートを持つ端末でしか出ない不具合**（⚠ Owner が実機で 2 度踏んだ）。
  //   ⚠ **手元の Chromium に `navigator.share` は無いので、⚠ 上のケースは
  //     写す側の道しか通っていない。**⚠ **持っているふりをして、⚠ 渡す荷物を見る。**
  // ⚠ **題や説明を付けると、⚠ 受け取ったアプリが URL とつなげて 1 本の字にする。**
  //   ⚠ **貼っても開けない。**⚠ **つなぎ方は向こうが決めるので、⚠ 前にも後ろにも置けない。**
  name: "手渡しのリンクは、共有シートへ URL だけを渡す",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => page.addInitScript(() => {
    globalThis.__渡した = null;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d) => { globalThis.__渡した = d; },
    });
  }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    await リンクの道を開く(page);
    await page.locator("#handOut").click();
    await page.waitForTimeout(600);

    const 渡した = await page.evaluate(() => globalThis.__渡した);
    must(渡した, "共有シートへ何も渡していない");
    const キー = Object.keys(渡した).sort().join(",");
    must(キー === "url", `URL 以外も渡している（${キー}）。貼ったときに 1 本につながる`);
    const 非ASCII = [...渡した.url].filter((c) => c.charCodeAt(0) > 126);
    must(非ASCII.length === 0,
      `渡したものに ASCII でない字が混ざっている: ${非ASCII.slice(0, 12).join("")}`);
    must(/\/take#\S/.test(渡した.url), `渡したものがリンクの形をしていない: ${渡した.url.slice(0, 60)}`);
    return `渡したのは ${キー} だけ（${渡した.url.length} 文字・ASCII でない字 0）`;
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
    await リンクの道を開く(page);
    await page.locator("#handOut").click();
    await 待つ(page, () => globalThis.__shared.length > 0, "共有シートへ渡すもの");
    const 渡した = await page.evaluate(() => globalThis.__shared[0]);
    // ⚠ **荷物は `#` に載る**（2026-08-30）。⚠ **`?` だと配信元へ届く。**
    must(渡した.url && /\/take#\S/.test(渡した.url), `リンクに中身が入っていない: ${渡した.url}`);
    must(!/[?&]take=/.test(渡した.url), `荷物がクエリに載っている: ${渡した.url.slice(0, 60)}`);
    // ⚠ **以前の上限（2000）なら、⚠ ここで「渡せません」になっていた**
    must(渡した.url.length > 2000,
      `100 件のリンクが 2000 文字以下（${渡した.url.length} 文字）。⚠ この検査は何も見ていない`);
    must(渡した.url.length <= 12000, `渡す上限を超えている（${渡した.url.length} 文字）`);
    // ⚠ **渡すのは URL だけ**（2026-08-31 に主張を入れ替えた）。
    //   ⚠ **前はここで「題と説明が要る」を守っていた。**⚠ **それが不具合のほうだった。**
    //   ⚠ **受け取ったアプリが 1 本の字につなげるので、⚠ 貼っても開けない**
    //     （⚠ Owner が実機で 2 度踏んだ）。⚠ **件数は、⚠ 渡す前の画面で見えている。**
    must(Object.keys(渡した).sort().join(",") === "url",
      `共有に URL 以外が混ざっている: ${Object.keys(渡した).join(",")}`);
    // ⚠ **地名を入れない**（⚠ 共有シートの先に地名が残る。⚠ `docs/adr/0008` の主旨）
    must(!/豊洲/.test(渡した.url), `共有の URL に地名が入っている: ${渡した.url.slice(0, 60)}`);

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
    await リンクの道を開く(page);
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

CASES.push({
  // ⚠ **広い幅では、⚠ 柱 1 本にまとめる**（`docs/adr/0068` を取り消したあとの形）。
  //   ⚠ **実際に踏んだ（2026-08-29・1440x950）**: ⚠ `@media (min-width:700px)` に
  //   ⚠ **`#savedSheet` を入れ忘れ、⚠ 保存の板だけ 1424px のまま残っていた**
  //   （⚠ 検索窓と答えの板は 608px）。⚠ **行の幅が 1398px になり、
  //   ⚠ 町名は左端・日付は右端で、⚠ 目が 1400px 動いていた。**
  // ⚠ **幅の値そのものを主張しない**（⚠ 38rem は変わりうる）。
  //   ⚠ **「他の柱とそろっているか」を見る。**⚠ そろえることが決めたこと。
  name: "広い幅では、保存した板も他の柱と同じ幅になる",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await 待つ(page, () => !document.getElementById("savedSheet").hidden, "保存した場所の板");
    const r = await page.evaluate(() => {
      const w = (id) => {
        const e = document.getElementById(id);
        return e && e.checkVisibility() ? Math.round(e.getBoundingClientRect().width) : null;
      };
      const 行 = document.querySelector("#savedList li button");
      return { 板: w("savedSheet"), 検索: w("bar"), 答え: w("bottom"),
               行: 行 ? Math.round(行.getBoundingClientRect().width) : null,
               画面: innerWidth };
    });
    must(r.板 === r.検索 && r.板 === r.答え,
      `柱の幅がそろっていない（保存の板 ${r.板}px ／ 検索窓 ${r.検索}px ／ 答えの板 ${r.答え}px）`);
    // ⚠ **画面いっぱいに広がっていないこと**（⚠ 上の主張は「3 つとも広い」でも通る）
    must(r.板 < r.画面 * 0.7,
      `保存の板が画面（${r.画面}px）いっぱいに広がっている（${r.板}px）`);
    must(r.行 !== null && r.行 <= r.板, `一覧の行が板からはみ出している（行 ${r.行}px ／ 板 ${r.板}px）`);
    return `保存の板 ${r.板}px = 検索窓 ${r.検索}px = 答えの板 ${r.答え}px ／ 行 ${r.行}px`;
  },
});

CASES.push({
  // ⚠ **合言葉の板**（`docs/adr/0072`）。⚠ **サーバはまだ無い**ので、⚠ **契約どおり返す偽物を置く。**
  //   ⚠ **偽物は `docs/sync-api.md` の形に合わせる。**⚠ **ずれたら、⚠ 本物で動かない。**
  // ⚠ **残り時間の字は、⚠ 返ってきた `ttl_sec` から作られること**を見る。
  //   ⚠ **直書きだと、⚠ 設定を変えたとき画面だけ前の数字のまま残る。**
  //   ⚠ **だから 300 ではなく 600 を返して、⚠ 「10 分」に変わることを確かめる。**
  name: "合言葉を出すと、住所と合言葉と残り時間が出る",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  // ⚠ **本物の口を呼ぶ。**⚠ **期限は環境変数で 600 秒にする**（⚠ 既定は 300）。
  //   ⚠ **画面が `ttl_sec` から文を作っているなら「10 分」になる。**
  //   ⚠ **既定のままだと、⚠ 直書きと区別がつかない。**
  setup: (page) => 合言葉の口(page, { env: { HANDOFF_TTL_SEC: "600" } }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    await page.locator("#crossDev").click();
    await 待つ(page, () => !document.getElementById("code").hidden, "合言葉の板");
    await 待つ(page,
      () => document.getElementById("codeWord").textContent.trim().length > 0, "合言葉");
    const r = await page.evaluate(() => {
      const t = (id) => document.getElementById(id).textContent.trim();
      const 語 = document.getElementById("codeWord");
      const q = 語.getBoundingClientRect();
      return { 住所: t("codeUrl"), 合言葉: t("codeWord"), 断り: t("codeNote"),
               畳み: document.getElementById("codeAlt").open,
               字の大きさ: Math.round(parseFloat(getComputedStyle(語).fontSize)),
               答えの字: Math.round(parseFloat(getComputedStyle(
                 document.getElementById("gloss")).fontSize)),
               板の中: q.bottom <= innerHeight && q.top >= 0 };
    });
    // ⚠ **合言葉は本物が作る**ので、⚠ 字そのものは決め打ちしない。⚠ **形だけ見る**
    must(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(r.合言葉), `合言葉の形が違う: ${r.合言葉}`);
    // ⚠ **画面が出した住所を、⚠ そのまま開く**（⚠ 字を突き合わせない）。
    //   ⚠ **本番では `/take.html` が `/take` へ 307 で寄せられる**（⚠ 実測 2026-08-30）。
    //   ⚠ **手元の配信は寄せないので、⚠ 字で見ていると、⚠ 本番と 1 手ずれても気づけない。**
    //   ⚠ **だから「出した住所が本当に開くか」を見る。**
    must(/\/take$/.test(r.住所), `受け取り口の住所が出ていない: ${r.住所}`);
    const 開いた = await page.evaluate(async (u) => {
      // ⚠ **開けないことを、⚠ 例外のまま投げない。**⚠ **何が起きたかを字で返す**
      //   （⚠ 「Failed to fetch」だけだと、⚠ 住所が悪いのか配信が落ちたのか分からない）。
      try {
        const res = await fetch(`${location.protocol}//${u}`, { redirect: "follow" });
        return { status: res.status, 字: (await res.text()).slice(0, 4000) };
      } catch (e) { return { status: 0, 字: "", 失敗: String(e).slice(0, 80) }; }
    }, r.住所);
    must(開いた.status === 200,
      `画面が出した住所が開かない（${r.住所} → ${開いた.失敗 ?? 開いた.status}）`);
    must(/保存した場所を受け取る/.test(開いた.字),
      `画面が出した住所が、受け取り口ではない（${r.住所}）`);
    // ⚠ **ttl_sec から作っていること**（⚠ 600 秒 → 10 分。⚠ 直書きなら 5 分のまま）
    must(/10 分/.test(r.断り), `残り時間が ttl_sec から作られていない: ${r.断り}`);
    must(!/消えます/.test(r.断り), `「消えます」と言っている: ${r.断り}`);
    // ⚠ **合言葉が主役。**⚠ **答えの字より大きい**（⚠ 打ち写すもの）
    must(r.字の大きさ > r.答えの字,
      `合言葉が主役になっていない（合言葉 ${r.字の大きさ}px ／ 答え ${r.答えの字}px）`);
    must(!r.畳み, "リンクの道が最初から開いている（合言葉が出たときは畳んでおく）");
    must(r.板の中, "合言葉が画面に収まっていない");
    return `${r.合言葉}（${r.字の大きさ}px）／ ${r.住所} ／ ${r.断り.slice(0, 22)}…`;
  },
});

CASES.push({
  // ⚠ **預けられなかったとき**（`CLAUDE.md` §4-1）。⚠ **できないことから書き始めない。**
  //   ⚠ **代わりにできること（リンク）を、⚠ 開いて見せる。**
  // ⚠ **こちらの都合を、⚠ 相手や回線の都合のように言わない**（⚠ 「取得できませんでした」と書かない）。
  name: "合言葉を出せなかったとき、リンクの道を開いて見せる",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => 合言葉の口(page, { 落とす: 503 }),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    await page.locator("#crossDev").click();
    await 待つ(page, () => !document.getElementById("code").hidden, "合言葉の板");
    const r = await page.evaluate(() => {
      const alt = document.getElementById("codeAlt");
      const link = document.getElementById("handOut");
      return { 断り: document.getElementById("codeNote").textContent.trim(),
               合言葉: document.getElementById("codeWord").textContent.trim(),
               本体が出ている: !document.getElementById("codeBody").hidden,
               畳み: alt.open, リンクが見える: link.checkVisibility(),
               入口: document.getElementById("crossDevText").textContent.trim() };
    });
    must(r.畳み && r.リンクが見える, "代わりの道（リンク）が開いていない");
    must(!r.本体が出ている && !r.合言葉,
      `合言葉が出せていないのに、器だけ出している（${JSON.stringify(r.合言葉)}）`);
    // ⚠ **「取得できませんでした」と書かない**（⚠ 利用者の回線の話に読める）
    must(!/取得できません|通信できません|届いていません/.test(r.断り),
      `こちらの都合を、相手や回線の都合のように言っている: ${r.断り}`);
    must(/リンク/.test(r.断り), `代わりにできることを言っていない: ${r.断り}`);
    must(/そのまま/.test(r.断り), `保存が無事だと言っていない: ${r.断り}`);
    must(r.入口 === "PC やタブレットでも見る", `入口の字が戻っていない: ${r.入口}`);
    return `「${r.断り.slice(0, 30)}…」／ リンクの道が開いている`;
  },
});

// ⚠ **合言葉の口は、⚠ 本物の `worker-next.js` を呼ぶ。**⚠ **偽なのは D1 だけ。**
//
// ⚠ **前は「契約どおり返す偽物」を手で書いていた**（2026-08-29 にやめた）。
//   ⚠ **手で書くと、⚠ 本物が返す形を変えたときに、⚠ 画面側の検査だけ古いまま通る**
//   （`CLAUDE.md` §3「同じ問いに答える実装を 2 つ持たない」）。
//   ⚠ **突き合わせるのではなく、⚠ 1 つにした。**
// ⚠ **これで確かめられるのは「画面と口が噛み合っている」まで。**
//   ⚠ **本物の D1 と話せるかは、⚠ 出したあとにしか分からない**（`CLAUDE.md` §1）。
const 合言葉の口 = async (page, opts = {}) => {
  const W = { default: WORKER_NEXT };
  const db = fakeDb();
  const env = { DB: db, ...(opts.env ?? {}) };
  await page.route("**/api/handoff*", async (route) => 送る(route, W, env, opts));
  await page.route("**/api/handoff/*", async (route) => 送る(route, W, env, opts));
  return db;
};
const 送る = async (route, W, env, opts) => {
  if (opts.落とす) return route.fulfill({ status: opts.落とす, contentType: "application/json",
                                          body: JSON.stringify({ error: "x" }) });
  const r = route.request();
  const u = new URL(r.url());
  // ⚠ **接続元は、⚠ 本物と同じ見出しで渡す**（⚠ 試行回数を数えるのに使っている）
  const req = new Request(`https://example.invalid${u.pathname}${u.search}`, {
    method: r.method(),
    headers: { ...r.headers(), "cf-connecting-ip": "203.0.113.7" },
    body: r.method() === "POST" ? (r.postData() ?? "") : undefined,
  });
  const res = await W.default.fetch(req, env);
  return route.fulfill({ status: res.status,
    headers: Object.fromEntries(res.headers), body: await res.text() });
};

CASES.push({
  name: "受け取り口で合言葉を打つと、そのまま一覧へ進む",
  path: "/take", origin: NEXT_BASE, viewport: PC,
  setup: (page) => 合言葉の口(page),
  async check(page) {
    // ⚠ **預けるところから、⚠ 本物の口を通す**（⚠ 合言葉を手で決めない）。
    const code = await page.evaluate(async () => {
      const 圧縮 = async (t) => {
        const s = new Blob([t]).stream().pipeThrough(new CompressionStream("gzip"));
        return KonjakuSaved.bytes2b64(new Uint8Array(await new Response(s).arrayBuffer()));
      };
      const list = [
        { lat: 35.65531, lon: 139.79672, name: "東京都江東区豊洲三丁目", value: "旧水部", at: 3 },
        { lat: 35.64, lon: 139.79, name: "東京都江東区東雲一丁目", value: "埋立地", at: 2 },
      ];
      const payload = await KonjakuSaved.toText(list, 圧縮);
      const res = await fetch("/api/handoff", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      return (await res.json()).code;
    });
    must(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code ?? ""), `合言葉を預けられていない: ${code}`);
    // ⚠ **打ち写しの揺れを、⚠ 実際に入れて確かめる**（⚠ 小文字と区切り）
    await page.locator("#recvIn").fill(
      code.toLowerCase().replace(/^(.{4})(.{4})$/, "$1-$2"));
    await page.locator("#recvGo").click();
    // ⚠ **見せてから押してもらう一歩は無い**（2026-08-30。⚠ Owner 判断）。
    //   ⚠ **そのまま一覧へ進む。**⚠ **何が起きたかは、⚠ 進んだ先で字にする**（`docs/adr/0026`）。
    await 待つ(page, () => document.querySelectorAll("#listItems li").length > 0, "一覧の行");
    const r = await page.evaluate(() => ({
      道: location.pathname,
      // ⚠ **言ったあと、⚠ URL から数を落とす**（⚠ 読み込み直しで、⚠ また同じことを言わない）
      残る: new URL(location.href).searchParams.has("added"),
      言った: document.getElementById("listSaid").textContent.trim(),
      見える: document.getElementById("listSaid").checkVisibility(),
      行: document.querySelectorAll("#listItems li").length,
      名前: (JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]")[0] ?? {}).name,
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
    }));
    must(/\/saved$/.test(r.道), `一覧へ進んでいない（いま ${r.道}）`);
    must(r.控え === 2, `足したのに控えが 2 件でない（${r.控え} 件）`);
    must(r.行 === 2, `一覧に並んでいない（${r.行} 行）`);
    must(r.名前 === "東京都江東区豊洲三丁目", `名前が欠けている: ${JSON.stringify(r.名前)}`);
    // ⚠ **押したのに無言にしない**（`docs/adr/0026`）
    must(r.見える && /2 件を足しました/.test(r.言った),
      `何を足したかを言っていない: ${JSON.stringify(r.言った)}`);
    must(!r.残る, "言ったあとも URL に数が残っている（⚠ 読み込み直しで、また同じことを言う）");
    return `${code} を小文字と区切りつきで打って ${r.道} へ ／「${r.言った}」`;
  },
});

// ⚠ **受け取れない 4 とおり。**⚠ **どれも本物の口に、⚠ 本当にその状態を作らせる**
//   （⚠ 状態番号を手で返さない。⚠ **返し方を変えたときに、⚠ ここだけ古いまま通るのを避ける**）。
const 受け取れない = {
  // ⚠ **期限を 1 秒にして預け、⚠ 過ぎてから取りに行く**
  410: { env: { HANDOFF_TTL_SEC: "1" }, 仕込む: async (page) => {
    const code = await page.evaluate(async () => {
      const res = await fetch("/api/handoff", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: "1e30" }) });
      return (await res.json()).code;
    });
    await page.waitForTimeout(1400);
    return code;
  } },
  // ⚠ **預けていない合言葉**（⚠ 形は正しい）
  404: { 仕込む: async () => "0123456789".slice(0, 8) },
  // ⚠ **試行の上限を 2 回にして、⚠ 3 回目を打つ**
  429: { env: { HANDOFF_ATTEMPT_LIMIT: "2" }, 仕込む: async (page) => {
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await fetch("/api/handoff/22222222");
    });
    return "22222222";
  } },
  // ⚠ **口そのものが答えないとき**
  503: { 落とす: 503, 仕込む: async () => "33333333" },
};

for (const [status, 名, 要る] of [
  [410, "期限が切れていたとき", /過ぎ/],
  [404, "合言葉が無いとき", /打ち間違い/],
  [429, "続けて試したとき", /待って/],
  [503, "預かり先が答えないとき", /そのまま/],
]) {
  CASES.push({
    // ⚠ **できないことから書き始めない**（`CLAUDE.md` §4-1）。
    //   ⚠ **1 行目は「できること」。**⚠ **手順は 410 も 404 も同じ。**⚠ **違うのは理由だけ。**
    name: `受け取り口は、${名}も次にすることを先に出す`,
    path: "/take", origin: NEXT_BASE, viewport: PC,
    setup: (page) => 合言葉の口(page, 受け取れない[status]),
    async check(page) {
      const code = await 受け取れない[status].仕込む(page);
      await page.locator("#recvIn").fill(code);
      await page.locator("#recvGo").click();
      await 待つ(page, () => !document.getElementById("recvAgain").hidden, "出し直しの案内");
      const r = await page.evaluate(() => {
        const 節 = document.getElementById("recvAgain");
        const can = document.querySelector(".recv__can").getBoundingClientRect();
        const why = document.getElementById("recvWhy").getBoundingClientRect();
        return {
          できること: document.querySelector(".recv__can").textContent.trim(),
          手順: [...document.querySelectorAll(".recv__steps li")].map((e) => e.textContent.trim()),
          理由: document.getElementById("recvWhy").textContent.trim(),
          先に出ている: can.top < why.top,
          入力欄: document.getElementById("recvIn").value,
          的: document.activeElement?.id,
          受け取った器: !document.getElementById("recvGot").hidden,
        };
      });
      must(/すぐ受け取れます/.test(r.できること), `1 行目が「できること」でない: ${r.できること}`);
      must(r.手順.length === 2, `手順が 2 つでない（${r.手順.length}）`);
      must(r.先に出ている, "理由が、できることより先に出ている");
      must(要る.test(r.理由), `理由が ${status} に合っていない: ${r.理由}`);
      // ⚠ **こちらの都合を、⚠ 相手や回線の都合のように言わない**
      must(!/取得できません|届いていません|通信できません/.test(r.理由),
        `相手や回線の都合のように言っている: ${r.理由}`);
      must(!r.受け取った器, "受け取れていないのに、中身の器を出している");
      must(r.入力欄 === "", `入力欄が空になっていない: ${r.入力欄}`);
      must(r.的 === "recvIn", `入力の的が移っていない（いま ${r.的}）`);
      return `${status} → 「${r.できること}」＋手順 ${r.手順.length} ＋「${r.理由.slice(0, 20)}…」`;
    },
  });
}

CASES.push({
  // ⚠ **字は届いたが、⚠ 読めなかったとき**（`CLAUDE.md` §1）。
  //   ⚠ **「0 件を受け取りました」と言わない。**⚠ **読めなかったことと、⚠ 0 件は違う。**
  // ⚠ **これは他の検査では見えない**（⚠ 実際に、⚠ この道を消しても素通りした）。
  name: "受け取り口は、読めない字を「0 件」と言わない",
  path: "/take", origin: NEXT_BASE, viewport: PC,
  setup: (page) => 合言葉の口(page),
  async check(page) {
    // ⚠ **知らない版を、⚠ 本物の口に預ける**（⚠ 先頭が `9`）。
    //   ⚠ **口は中身を読まないので、⚠ そのまま預かって、⚠ そのまま返す。**
    //   ⚠ **読めないと分かるのは画面側**（`docs/sync-api.md` §1）。
    const code = await page.evaluate(async () => {
      const res = await fetch("/api/handoff", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: "9zzzz" }) });
      return (await res.json()).code;
    });
    await page.locator("#recvIn").fill(code);
    await page.locator("#recvGo").click();
    await 待つ(page, () => !document.getElementById("recvAgain").hidden, "出し直しの案内");
    const r = await page.evaluate(() => ({
      理由: document.getElementById("recvWhy").textContent.trim(),
      器: !document.getElementById("recvGot").hidden,
      見出し: document.getElementById("gotTitle").textContent.trim(),
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
    }));
    must(!r.器, "読めなかったのに、受け取った中身の器を出している");
    must(!/0 件/.test(r.見出し + r.理由), `「0 件」と言っている: ${r.見出し} ／ ${r.理由}`);
    must(/読み取れません/.test(r.理由), `読めなかったと言っていない: ${r.理由}`);
    must(/そのまま/.test(r.理由), `保存が無事だと言っていない: ${r.理由}`);
    must(r.控え === 0, `読めなかったのに控えが増えている（${r.控え} 件）`);
    return `「${r.理由.slice(0, 34)}…」`;
  },
});


// ⚠ **`hidden` にしたら、⚠ 本当に消えるか**（2026-08-30。⚠ 実際に踏んだ）。
//
// ⚠ **このファイル群は、⚠ 規則ごとに `[hidden]{display:none}` を書く作り。**
//   ⚠ **書き忘れると、⚠ `hidden` が効かない。**⚠ **属性は付くので、⚠ 属性で見ていると素通りする。**
//   ⚠ **受け取り口で踏んだ**: ⚠ 「足しました」と出したあとも「この端末に足す」が押せた。
//
// ⚠ **一覧を書き写さない。**⚠ **画面に在る `id` を全部見る**
//   （⚠ 書き写す形にすると、⚠ **足し忘れたものが黙って通る**）。
// ⚠ **親が隠れていると判定できない**ので、⚠ **先に親を開く。**
//   ⚠ **閉じた `<details>` の中も描かれない**ので、⚠ **開いてから測る**（`CLAUDE.md` §9）。
const 消えるか = (page) => page.evaluate(() => {
  const 消えない = [], 判定できない = [];
  const 閉じていた = [...document.querySelectorAll("details:not([open])")];
  for (const d of 閉じていた) d.open = true;
  for (const el of document.querySelectorAll("[id]")) {
    const 戻す = [];
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      if (a.hidden) { 戻す.push(a); a.hidden = false; }
    }
    const 元 = el.hidden;
    el.hidden = false;
    if (!el.checkVisibility()) 判定できない.push(el.id);
    else {
      el.hidden = true;
      if (el.checkVisibility()) 消えない.push(`${el.id}（${el.className || el.tagName}）`);
    }
    el.hidden = 元;
    for (const a of 戻す) a.hidden = true;
  }
  for (const d of 閉じていた) d.open = false;
  return { 消えない, 判定できない, 見た: document.querySelectorAll("[id]").length };
});

for (const [名, path, viewport] of [
  ["散歩中の画面", `/?${TOYOSU}`, SP],
  ["受け取り口", "/take", PC],
  ["深掘り画面", `/deep?${TOYOSU}`, PC],
]) {
  CASES.push({
    name: `${名}は、hidden にしたものが本当に消える`,
    path, origin: NEXT_BASE, viewport,
    async check(page) {
      await page.waitForTimeout(3000);
      const r = await 消えるか(page);
      must(r.見た > 10, `見た要素が少なすぎる（${r.見た} 件）。⚠ 画面が出ていない可能性`);
      must(!r.消えない.length,
        `hidden にしても消えないものがある: ${r.消えない.join(" / ")}`
        + "。⚠ **その規則に `[hidden]{display:none}` を足す**");
      // ⚠ **判定できなかったものを黙って通さない。**⚠ **数が増えたら、⚠ 見えていない範囲が広がっている**
      must(!r.判定できない.length,
        `hidden かどうかを判定できなかった: ${r.判定できない.join(" ")}`
        + "。⚠ **親が隠れているか、⚠ 描かれていない**");
      return `${r.見た} 件を見て、⚠ 全部消えた`;
    },
  });
}

// ⚠ **年代のチップに見出しを付けた**（2026-08-30。⚠ Owner が絵で決めた）。
//   ⚠ **押す前に「いつ変わったか」と読まれていた**（⚠ 利用者役 5 名中 3 名。⚠ 実在の利用者ではない）。
//   ⚠ **`docs/adr/0006` は「いつ変わったか」を言わないと決めている。**
//   ⚠ **言わないと決めているのに、⚠ チップが言っているように見えていた。**
// ⚠ **見出しは「問いへの近さ」順**（2026-08-31。Owner 判断）。
//   ⚠ **名乗り「この土地は、昔なんだったのか？」に、⚠ いちばん大きい字で答える。**
//   ⚠ **前は「確実性の高い順」**（`docs/adr/0030`）で、⚠ **どの土地でも見出しは地形分類だった。**
//   ⚠ **実測（2026-08-30・利用者役 5 名中 3 名。⚠ 実在の利用者ではない）**:
//     ⚠ **春日部と軽井沢で「これは昔の答えではない」と読まれた。**
//     ⚠ **春日部は「明治期は 田」を既に出していた。**⚠ **見出しでなかっただけ。**
//
// ⚠ **相手先が何を返すかは主張しない**（`CLAUDE.md` §9）。
//   ⚠ **返ってきた明治期の値を控えてから、⚠ 見出しがそれと合っているかを見る。**
//   ⚠ **規則そのものは `test/check/next.mjs` ⑨ がブラウザ抜きで見る。**⚠ **ここは画面を見る。**
// ⚠ **トップと深掘りを、⚠ 同じ主張で見る**（2026-08-31。Owner 指示）。
//   ⚠ **同じ場所で、⚠ 2 つの画面が別の答えを見出しにしていた。**
for (const [名, ll] of [["豊洲", TOYOSU], ["春日部", KASUKABE], ["軽井沢", "ll=36.3418,138.6353"]])
for (const [画面, path] of [["トップ", `/?${ll}`], ["深掘り", `/deep.html?${ll}`]]) {
  CASES.push({
    name: `${画面}の${名}で、見出しが「昔なんだったか」に答えている`,
    path, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page);
      // ⚠ **器ではなく、⚠ 落ち着いたこと（出典ラベルの字）を待つ**（`CLAUDE.md` §9）。
      //   ⚠ **ラベルは明治期が返ってきてはじめて入る**ので、⚠ 両方の画面でこれが使える。
      await 待つ(page, () => {
        const e = document.getElementById("glossSrc");
        return e && !e.hidden && (e.textContent ?? "").trim().length > 0;
      }, "出典のラベル");
      const r = await page.evaluate(() => {
        const A = window.KonjakuAnswer;
        const t = (s) => (document.querySelector(s)?.textContent ?? "").trim();
        const 明治期の字 = t("#meiji");
        const src = document.getElementById("glossSrc");
        // ⚠ **器の名前が画面ごとに違う。**⚠ トップは `#sub`／`#name`、⚠ 深掘りは `#glossSub`／`#term`。
        const 二行目 = document.getElementById("sub") ? t("#sub") : t("#glossSub");
        const 区分 = document.getElementById("name") ? t("#name") : t("#term");
        return {
          A: !!A,
          出典ラベル: src && !src.hidden && src.checkVisibility() ? t("#glossSrc") : null,
          SOURCE: A ? A.SOURCE : {},
          見出し: t("#gloss"),
          二行目, 区分,
          NONE: A ? A.MEIJI_NONE : {},
        };
      });
      must(r.A, "KonjakuAnswer が画面に読み込まれていない（⚠ この検査が何も見ていない）");
      must(r.見出し.length > 2, `見出しが出ていない: ${JSON.stringify(r.見出し)}`);

      // ⚠ **見出しは、⚠ どの資料の話かを名乗る**（2026-08-31。Owner 指示）。
      //   ⚠ **名乗らないと、⚠ 見出しと 2 行目が繰り返しに読まれた**（⚠ 利用者役 5 名中 3 名）。
      must(r.出典ラベル !== null && r.出典ラベル.length > 0,
        `出典のラベルが画面に出ていない: ${JSON.stringify(r.出典ラベル)}`);
      must(!r.見出し.includes(r.出典ラベル),
        `見出しが出典名を抱えている（⚠ ラベルと二重）: 「${r.出典ラベル}」／「${r.見出し}」`);

      const 無い理由 = Object.keys(r.NONE).find((k) => r.NONE[k] === r.見出し) ?? null;
      if (無い理由 === null) {
        // ⚠ **明治期が答えを返した土地。**⚠ **その答えが見出しに来ていること。**
        must(/^ここは .+ でした$/.test(r.見出し),
          `明治期の答えでも「無い理由」でもない見出し: ${r.見出し}`);
        must(r.出典ラベル === r.SOURCE.meiji,
          `明治期の答えなのに、ラベルが違う: ${r.出典ラベル}`);
        // ⚠ **地形分類の言い方へ戻っていないこと**（⚠ これが起きると、⚠ 残 3 に逆戻りする）
        must(!r.見出し.startsWith("ここは、"),
          `明治期があるのに、⚠ 地形分類の言い方のまま: ${r.見出し}`);
        must(r.二行目.startsWith(r.SOURCE.terrain),
          `成り立ちが 2 行目に降りていない: ${JSON.stringify(r.二行目)}`);
      } else {
        // ⚠ **明治期が答えを返さなかった土地。**⚠ **なぜ返らなかったかを、⚠ 見出しが言うこと。**
        //   ⚠ **黙らない**（2026-08-29。Owner 判断）。⚠ 黙ると、何も起きなかったように見える。
        must(r.出典ラベル === r.SOURCE.meiji,
          `無い理由を言うのに、ラベルが違う: ${r.出典ラベル}`);
        must(r.二行目.startsWith(r.SOURCE.terrain),
          `無いと言うだけで、⚠ 分かることを出していない: ${JSON.stringify(r.二行目)}`);
      }
      return `${r.出典ラベル}｜「${r.見出し}」／ 2 行目「${r.二行目 || "（無し）"}」／ 区分 ${r.区分}`;
    },
  });
}

// ⚠ **`#sub` は「いまの地形」の行**（2026-08-31。Owner 判断で見出しと入れ替わった）。
//   ⚠ **前は「明治期は …／空中写真 N 年代」だった。**⚠ **明治期は見出しへ上がった。**
//   ⚠ **どちらの土地でも成り立ちは出る**ので、⚠ **2 つとも `true`。**
//     ⚠ **空になるのは、⚠ 見出しが地形分類そのものになる土地だけ**
//     （⚠ 旧水部・旧河道・干拓地で、⚠ **かつ明治期が無い**。⚠ **規則の側は `test/check/next.mjs` ⑨ が見る**）。
for (const [名, ll, 数, subが残る] of [
  ["豊洲", TOYOSU, 7, true],
  ["軽井沢", "ll=36.3418,138.6353", 1, true],
]) {
  CASES.push({
    name: `${名}で、年代のチップに見出しが付く`,
    path: `/?${ll}`, origin: NEXT_BASE, viewport: SP,
    async check(page) {
      await waitAnswer(page);
      await 待つ(page, () => document.querySelectorAll("#eras .era").length > 0, "年代のチップ");
      await 待つ(page, () => {
        const e = document.querySelector(".eras__label");
        return e && e.checkVisibility() && e.textContent.trim().length > 0;
      }, "チップの見出し");
      const r = await page.evaluate(() => {
        const 見 = document.querySelector(".eras__label");
        const eras = document.getElementById("eras");
        const sub = document.getElementById("sub");
        // ⚠ **「空中写真」を含む行を数える。**⚠ **中に同じ語を持つ親は数えない**
        //   （⚠ 数えると、⚠ 板ごと 1 件に数えられて、⚠ 何も見ていないことになる）。
        const 行 = [...document.querySelectorAll("#card *")]
          .filter((e) => e.checkVisibility() && /空中写真/.test(e.textContent)
                         && ![...e.children].some((c) => /空中写真/.test(c.textContent)));
        return {
          見出し: 見.textContent.trim(),
          見出しy: Math.round(見.getBoundingClientRect().y),
          erasY: Math.round(eras.getBoundingClientRect().y),
          subが見える: sub.checkVisibility(),
          sub字: sub.textContent.trim(),
          空中写真の行: 行.length,
          行の字: 行.map((e) => e.textContent.trim().slice(0, 20)),
          チップ: document.querySelectorAll("#eras .era").length,
        };
      });
      // ⚠ **① 見出しはチップより上**（⚠ 下に置くと、⚠ 押したあとの説明に読める）
      must(r.見出しy < r.erasY,
        `見出しがチップより下にある（見出し ${r.見出しy} ／ チップ ${r.erasY}）`);
      // ⚠ **② 「空中写真」を言う行は 1 本だけ**（⚠ `#sub` から外し忘れると 2 本になる）
      must(r.空中写真の行 === 1,
        `「空中写真」を言う行が ${r.空中写真の行} 本ある: ${r.行の字.join(" ／ ")}`);
      // ⚠ **③ 見出しの数と、⚠ チップの数が同じ**（⚠ 数を 2 か所で持たない）
      must(r.チップ === 数 && new RegExp(`（${r.チップ}）`).test(r.見出し),
        `見出しの数とチップの数が合わない（見出し「${r.見出し}」／ チップ ${r.チップ}）`);
      // ⚠ **④ 外した結果 `#sub` が空になったら、⚠ 行ごと隠す**（⚠ 空の行は隙間になる）
      must(r.subが見える === subが残る,
        `まとめの行の出方が違う（見える=${r.subが見える} ／ 期待 ${subが残る}）: ${JSON.stringify(r.sub字)}`);
      return `見出し「${r.見出し}」y=${r.見出しy} < チップ y=${r.erasY} ／ `
        + `まとめ「${r.sub字 || "（無し）"}」／ 「空中写真」の行 ${r.空中写真の行} 本`;
    },
  });
}

// ⚠ **近くに残る災害の記録**（2026-08-31。Owner 判断）。
//   ⚠ **自然災害伝承碑は全国に存在するが、⚠ 散歩中の現在地点に対して提示できるほど
//     ⚠ 高密度ではなかった。**⚠ **だからスマホの 1 画面目には載せず、⚠ 深掘りで扱う。**
//   ⚠ **実測（分母 15 地点。⚠ 全国の話ではない）**: ⚠ 半径 1000m で **0 / 15**。
//
// ⚠ **相手先の答えに寄りかからない**（`CLAUDE.md` §9）。⚠ **配っている静的 JSON だけを読む。**
//   ⚠ **3 地点は、⚠ 3 つの状態を代表する**（⚠ 近い ／ 遠い ／ 5km 以内に無い）。
for (const [名, ll, 出る] of [
  ["春日部", KASUKABE, true],                  // ⚠ 1.1km
  ["軽井沢", "ll=36.3418,138.6353", true],     // ⚠ 4.8km（⚠ 5km にぎりぎり入る）
  ["関宿",   "ll=34.8556,136.3960", false],    // ⚠ 24.7km（⚠ 5km 以内に無い）
]) {
  CASES.push({
    name: `深掘りの${名}で、近くに残る災害の記録を出す`,
    path: `/deep.html?${ll}`, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      // ⚠ **器ではなく、⚠ 落ち着いたこと（前置きの字）を待つ**（`CLAUDE.md` §9）
      await 待つ(page, () => {
        const s = document.getElementById("monSec");
        return s && !s.hidden && (document.getElementById("monLead")?.textContent ?? "").trim().length > 0;
      }, "近くに残る災害の記録");
      const r = await page.evaluate(() => ({
        前置き: document.getElementById("monLead").textContent.trim(),
        件数: document.querySelectorAll(".mon__item").length,
        字: [...document.querySelectorAll(".mon__item")].map((e) => e.textContent.replace(/\s+/g, " ").trim()),
        出典: document.getElementById("monCite")?.hidden ? null
            : document.getElementById("monCite").textContent.trim(),
        横あふれ: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      // ⚠ **黙らない**（掟 §1）。⚠ **碑が無い場所でも、⚠ 節ごと消さない。**
      must(r.前置き.length > 0, "近くに残る災害の記録の節が、黙っている");
      must(r.出典 !== null && /国土地理院/.test(r.出典), `出典を名乗っていない: ${r.出典}`);
      must(r.横あふれ === 0, `横にあふれている（${r.横あふれ}px）`);
      if (出る) {
        must(r.件数 > 0, `碑が在るはずなのに 0 件: ${r.前置き}`);
        // ⚠ **碑があること ≠ その地点が被災したこと。**⚠ **断りを必ず言う。**
        must(/被災したことは別/.test(r.前置き), `「碑 ≠ 被災」を言っていない: ${r.前置き}`);
        // ⚠ **距離を必ず言う**（⚠ 4.8km を「この近く」と読ませない）
        must(r.字.every((t) => /現在地から \d/.test(t)), `距離を言っていない: ${r.字[0]}`);
        // ⚠ **碑の建立年を、⚠ 災害の年と混ぜない**
        must(r.字.some((t) => /碑が建てられたのは \d{4} 年/.test(t)),
          `碑の建立年を、そうと分かる形で言っていない: ${r.字[0]}`);
      } else {
        must(r.件数 === 0, `5km 以内に碑が無いはずなのに ${r.件数} 件`);
        // ⚠ **「無い」と言い切る**（⚠ ここは実際に読めて 0 件。⚠ 取れなかったのではない）
        must(/ありません/.test(r.前置き), `碑が無いことを言えていない: ${r.前置き}`);
      }
      return `${r.前置き.slice(0, 40)}… ／ ${r.件数} 件 ／ ${r.出典}`;
    },
  });
}

// ⚠ **トップに名乗りを足した**（2026-08-30。⚠ Owner が絵で決めた）。
//   ⚠ **何のサイトかを、⚠ 画面のどこにも書いていなかった**（⚠ 9 幅で数えて 0 件）。
//   ⚠ **利用者役**: 「地図の部品を貼り付けたページに見える」。
//   ⚠ **β 版が同じ問題を実測で踏んで、⚠ 同じ形で解いている。**
for (const [名, viewport] of [["スマホ", SP], ["PC", PC]]) {
  CASES.push({
    name: `${名}のトップに、この道具の名乗りが出る`,
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport,
    async check(page) {
      await waitAnswer(page);
      const r = await page.evaluate(() => {
        const b = document.querySelector(".brand");
        if (!b || !b.checkVisibility()) return { 無い: true };
        const q = b.getBoundingClientRect();
        const bar = document.getElementById("bar").getBoundingClientRect();
        const mark = b.querySelector(".brand__mark");
        // ⚠ **飾りの絵に、⚠ 読み上げの字を付けない**（⚠ 名乗りは字のほうが持つ）
        return {
          字: b.textContent.trim(),
          y: Math.round(q.y), 高さ: Math.round(q.height),
          幅: Math.round(q.width), 画面幅: innerWidth,
          検索y: Math.round(bar.y),
          印: !!mark, 印の代替: mark?.getAttribute("alt"),
          印が出た: !!mark && mark.checkVisibility() && mark.naturalWidth > 0,
          // ⚠ **地図が透けないこと**（⚠ 透けると、⚠ 地図の上で字が読めない）。
          //   ⚠ **書き方が 2 つある**: `rgba(r, g, b, a)` と `color(srgb r g b / a)`。
          //   ⚠ **両方から透明度を取り出す。**⚠ **無ければ 1（不透明）。**
          地: getComputedStyle(b).backgroundColor,
          透明度: (() => {
            const t = getComputedStyle(b).backgroundColor;
            const m = /\/\s*([\d.]+)\s*\)/.exec(t) || /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(t);
            return m ? Number(m[1]) : 1;
          })(),
        };
      });
      must(!r.無い, "トップに名乗りが無い");
      // ⚠ **何のサイトかが分かる字**（⚠ 道具の名前だけでは、⚠ 何をするか分からない）
      must(/今昔/.test(r.字), `名乗りに道具の名前が無い: ${r.字}`);
      must(/昔/.test(r.字) && r.字.length >= 8,
        `名乗りが、何をする道具かを言っていない: ${r.字}`);
      // ⚠ **いちばん上。**⚠ **検索窓より上**（⚠ 下に置くと、⚠ 読む前に地図が始まる）
      must(r.y === 0, `名乗りが画面のいちばん上に無い（y=${r.y}）`);
      must(r.y < r.検索y, `名乗りが検索窓より下にある（名乗り ${r.y} ／ 検索 ${r.検索y}）`);
      must(r.幅 === r.画面幅, `名乗りが画面の幅いっぱいでない（${r.幅} / ${r.画面幅}）`);
      // ⚠ **不透明**（⚠ 半透明だと、⚠ 地図の絵の上で字が読めなくなる）。
      //   ⚠ **字面で `rgba(` を探さない**（2026-08-30 に踏んだ）。
      //   ⚠ **`color-mix` は `color(srgb … / 0.4)` の形で返る。**⚠ **`rgba(` では引っかからない。**
      //   ⚠ **透明度そのものを見る**（⚠ どの書き方でも、⚠ 末尾の `/ 数` か 4 つ目の数に出る）。
      must(r.透明度 === 1,
        `名乗りの地が透けている（透明度 ${r.透明度} ／ ${r.地}）`);
      // ⚠ **印は飾り**（⚠ `alt=""`）。⚠ **出ていること**（⚠ 404 だと絵が出ない）
      must(r.印, "名乗りに印が無い");
      must(r.印の代替 === "", `印に読み上げの字が付いている（alt=${JSON.stringify(r.印の代替)}）`);
      must(r.印が出た, "名乗りの印が出ていない（⚠ favicon.svg を配れていない）");
      return `「${r.字}」高さ ${r.高さ}px ／ 検索窓 y=${r.検索y}`;
    },
  });
}

CASES.push({
  // ⚠ **写す口と送る口を分けた**（2026-08-30。⚠ Owner が実機で踏んだ）。
  //   ⚠ **共有シートの「コピー」は、⚠ 題と説明と URL をつなげて写す。**⚠ **貼っても開けない。**
  //   ⚠ **消すのではなく分ける**（`docs/adr/0072` は「共有シートの先で何のリンクか字で分かる」を
  //   ⚠ 求めている。⚠ **両方を立てる**）。
  name: "リンクは、送る口と写す口が分かれている",
  path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport: SP,
  setup: (page) => Promise.all([
    page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: NEXT_BASE }),
    page.addInitScript(() => {
      globalThis.__shared = [];
      navigator.share = (d) => { globalThis.__shared.push(d); return Promise.resolve(); };
    }),
  ]),
  async check(page) {
    await waitAnswer(page);
    await 待つ(page, () => !document.getElementById("save").hidden, "保存");
    await page.locator("#save").click();
    await 待つ(page,
      () => document.getElementById("save").getAttribute("aria-pressed") === "true", "保存ずみ");
    await page.waitForTimeout(2000);
    await page.locator("#savedOpen").click();
    await page.waitForTimeout(400);
    await リンクの道を開く(page);

    // ⚠ **写す口。**⚠ **URL だけが写ること**（⚠ 題も説明も混ざらない）
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.locator("#handCopy").click();
    await 待つ(page, async () => (await navigator.clipboard.readText()).length > 0, "写した字");
    const 写した = await page.evaluate(() => navigator.clipboard.readText());
    must(/^https?:\/\/\S+$/.test(写した.trim()),
      `写した字が URL だけではない（${写した.length} 文字）: ${写した.slice(0, 80)}`);
    must(!/今昔|保存した場所|件/.test(写した),
      `写した字に題や説明が混ざっている: ${写した.slice(0, 80)}`);
    must(/\/take#/.test(写した), `写した URL が受け取り口を指していない: ${写した.slice(0, 60)}`);
    must(!/[?&]take=/.test(写した), `写した URL の荷物がクエリに載っている: ${写した.slice(0, 60)}`);

    // ⚠ **送る口も、⚠ URL だけを渡す**（2026-08-31 に主張を入れ替えた）。
    //   ⚠ **前はここで「題と説明が付くこと」を守っていた。**⚠ **それが不具合のほうだった。**
    //   ⚠ **受け取ったアプリが題・説明・URL をつなげて 1 本の字にするので、⚠ 貼っても開けない**
    //     （⚠ Owner が実機で 2 度踏んだ。⚠ 2 度目は URL の末尾に字が付いていた）。
    //   ⚠ **つなぎ方は向こうが決めるので、⚠ こちらでは前にも後ろにも置けない。**
    //   ⚠ **検査は守るべきことを固定する。**⚠ **間違った主張は、⚠ 間違ったまま固定される**
    //     （`CLAUDE.md` §9）。⚠ **だから主張ごと入れ替える。**
    await page.locator("#handOut").click();
    await 待つ(page, () => globalThis.__shared.length > 0, "共有シートへ渡すもの");
    const 送った = await page.evaluate(() => globalThis.__shared[0]);
    const 渡した鍵 = Object.keys(送った).sort().join(",");
    must(渡した鍵 === "url", `送る口が URL 以外も渡している（${渡した鍵}）`);
    must(送った.url === 写した.trim() || /\/take#/.test(送った.url),
      `送る口の URL が違う: ${送った.url?.slice(0, 60)}`);
    // ⚠ **地名を入れない**（⚠ 共有シートの先に地名が残る）
    must(!/豊洲/.test(送った.url), `送る口の URL に地名が入っている: ${送った.url.slice(0, 60)}`);
    return `写す ${写した.length} 文字（URL だけ）／ 送る url だけ`;
  },
});

CASES.push({
  // ⚠ **受け取る画面は 1 つ**（2026-08-30。Owner 判断。`docs/adr/0072` が「2 つ作らない」）。
  //   ⚠ **前はトップ（`/?take=`）にも板があった。**⚠ **消したことを、⚠ ここで押さえる。**
  //   ⚠ **「板が無い」だけを見ない。**⚠ **リンクで来た人が、⚠ ちゃんと受け取れることまで見る。**
  name: "トップは受け取らない（受け取る画面は /take だけ）",
  path: "/?take=1W1szNS42NTUzLDEzOS43OTY3LCLosYrmtLIiLCLml6fmsLTpg6giLDNdXQ",
  origin: NEXT_BASE, viewport: SP,
  async check(page) {
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({
      板: !!document.getElementById("take"),
      受け取りの字: [...document.querySelectorAll("body *")]
        .filter((e) => e.checkVisibility() && /件の場所を受け取りました/.test(e.textContent)).length,
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
    }));
    must(!r.板, "トップに受け取りの板が残っている（⚠ 受け取る画面は /take だけ）");
    must(r.受け取りの字 === 0, "トップが受け取りの字を出している");
    // ⚠ **勝手に足さない**（⚠ 見せずに混ぜるのが、⚠ いちばん悪い）
    must(r.控え === 0, `トップが黙って足している（控え ${r.控え} 件）`);
    return "トップは受け取らない（板 0 ／ 字 0 ／ 控え 0）";
  },
});

// ⚠ **柱の幅**（2026-08-30。⚠ Owner 判断で `#id` の列挙をやめ、⚠ 共通クラスにした）。
//
// ⚠ **同じ形を 2 回踏んでいる**（⚠ 保存の板 2026-08-29 ／ 合言葉の板 2026-08-30）。
//   ⚠ **どちらも `@media` の一覧に足し忘れ、⚠ その板だけ 1424px のまま残った。**
//   ⚠ **落ちないので気づけない。**⚠ **コメントで注意しても止まらなかった。**
//
// ⚠ **「class が付いているか」を見ない。**⚠ **付け忘れた新しい板を見逃す**（⚠ いまと同じ）。
//   ⚠ **幅そのものを見る。**⚠ **板が増えても勝手に捕まる。**
// ⚠ **狭い幅（700px 未満）では全幅が正しい。**⚠ **見るのは広い幅だけ。**
for (const [名, viewport] of [
  ["タブレット横", { width: 1024, height: 768 }],
  ["PC", PC],
  ["広い PC", { width: 1920, height: 1080 }],
]) {
  CASES.push({
    name: `${名}では、柱の幅がそろっている`,
    path: `/?${TOYOSU}`, origin: NEXT_BASE, viewport,
    async check(page) {
      await waitAnswer(page);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        // ⚠ **画面の上に重ねる面を、⚠ 全部集める**（⚠ 隠れているものも開いて測る）。
        //   ⚠ **地図（`#map`）は柱ではない。**⚠ **名乗りの帯も柱ではない**（⚠ 画面いっぱいが意図）。
        const 除く = new Set(["map", "brand"]);
        const 面 = [...document.getElementById("app").children]
          .filter((e) => !除く.has(e.id) && getComputedStyle(e).position === "absolute");
        const out = [];
        for (const e of 面) {
          const 元 = e.hidden;
          e.hidden = false;
          const q = e.getBoundingClientRect();
          out.push({ id: e.id || e.className, w: Math.round(q.width) });
          e.hidden = 元;
        }
        return { 板: out, 画面: innerWidth };
      });
      must(r.板.length >= 5,
        `柱が少なすぎる（${r.板.length} 枚）。⚠ 集め方が効いていない可能性`);
      const 幅 = [...new Set(r.板.map((x) => x.w))];
      must(幅.length === 1,
        `柱の幅がそろっていない: ${r.板.map((x) => `${x.id}=${x.w}`).join(" ")}`);
      // ⚠ **「そろっている」だけだと、⚠ 全部が全幅でも通る**
      must(幅[0] < r.画面 * 0.7,
        `柱が画面（${r.画面}px）いっぱいに広がっている（${幅[0]}px）`);
      return `${r.板.length} 枚とも ${幅[0]}px（画面 ${r.画面}px）`;
    },
  });
}

// ⚠ **3 画面に、⚠ アプリへ戻る道が在る**（2026-08-30。⚠ Owner 判断）。
//
// ⚠ **`/take` と `/deep` は、⚠ リンクで直接ひらかれる。**
//   ⚠ **その端末では、⚠ トップを一度も見ていない。**⚠ **履歴も無い。**
//   ⚠ **だから `history.back()` は使えないし、⚠ 「戻る」とも言えない**（`CLAUDE.md` §4）。
//   ⚠ **名乗りが home を兼ねる。**⚠ **どのサイトでもそうなので説明が要らない。**
//
// ⚠ **字で探さない。**⚠ **押せる要素の行き先で見る**（⚠ 名乗りの字が在るだけで通ってしまう）。
for (const [名, path] of [
  ["トップ", `/?${TOYOSU}`],
  ["受け取り口", "/take"],
  ["深掘り画面", `/deep?${TOYOSU}`],
]) {
  CASES.push({
    name: `${名}に、アプリへ戻る道がある`,
    path, origin: NEXT_BASE, viewport: PC,
    async check(page) {
      await page.waitForTimeout(3000);
      const r = await page.evaluate(() => {
        const a = document.querySelector(".brand__name");
        if (!a) return { 無い: true };
        const q = a.getBoundingClientRect();
        return {
          tag: a.tagName, href: a.getAttribute("href"),
          字: a.textContent.trim(),
          w: Math.round(q.width), h: Math.round(q.height),
          押せる: (() => {
            const t = document.elementFromPoint(Math.round(q.x + q.width / 2),
                                                Math.round(q.y + q.height / 2));
            return !!(t && a.contains(t));
          })(),
        };
      });
      must(!r.無い, "名乗りが無い");
      must(r.tag === "A", `名乗りが押せない（${r.tag}）`);
      must(r.href === "./", `名乗りの行き先が違う: ${r.href}`);
      must(/今昔/.test(r.字), `名乗りに道具の名前が無い: ${r.字}`);
      // ⚠ **リンクにするだけでは 44 を割る**（⚠ 実測 2026-08-30: 中の字は 298×24 だった）
      must(r.h >= 44, `名乗りが 44 を割っている（${r.w}x${r.h}）`);
      must(r.押せる, "名乗りが、何かに覆われて押せない");
      // ⚠ **「戻る」と言わない**（⚠ 一度も見ていない場所には戻れない）
      must(!/もどる|戻る/.test(r.字), `名乗りが「戻る」と言っている: ${r.字}`);
      return `${r.字}（${r.w}x${r.h}）→ ${r.href}`;
    },
  });
}

CASES.push({
  // ⚠ **「地図をひらく」は置かない**（2026-08-30。⚠ Owner 判断）。
  //   ⚠ **保存した場所を地図にまとめて出す仕組みが、⚠ どこにも無い。**
  //   ⚠ **地図に出る印は「ここ」1 点だけ。**⚠ **前は受け取った 1 件目へ飛ばしていた。**
  //   ⚠ **地図を見たい要求は、⚠ 各行の「深く読む」→ `/deep` から、⚠ 場所を選んだ状態で行ける。**
  name: "受け取ったあと、地図へまとめて飛ばさない",
  path: "/take", origin: NEXT_BASE, viewport: PC,
  setup: (page) => 合言葉の口(page),
  async check(page) {
    const code = await page.evaluate(async () => {
      const 圧縮 = async (t) => {
        const s = new Blob([t]).stream().pipeThrough(new CompressionStream("gzip"));
        return KonjakuSaved.bytes2b64(new Uint8Array(await new Response(s).arrayBuffer()));
      };
      const payload = await KonjakuSaved.toText(
        [{ lat: 35.65531, lon: 139.79672, name: "東京都江東区豊洲三丁目", value: "旧水部", at: 3 }],
        圧縮);
      const res = await fetch("/api/handoff", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      return (await res.json()).code;
    });
    await page.locator("#recvIn").fill(code);
    await page.locator("#recvGo").click();
    await 待つ(page, () => document.querySelectorAll("#listItems li").length > 0, "一覧の行");
    const r = await page.evaluate(() => ({
      // ⚠ **「地図をひらく」は置かない**（2026-08-30。⚠ Owner 判断）。
      //   ⚠ **保存した場所を地図にまとめて出す仕組みが、⚠ どこにも無い。**
      //   ⚠ **地図に出る印は「ここ」1 点だけ。**⚠ **前は受け取った 1 件目へ飛ばしていた。**
      地図をひらく: [...document.querySelectorAll("a,button")]
        .filter((e) => e.checkVisibility() && /地図をひらく/.test(e.textContent)).length,
      出口: [...document.querySelectorAll("a[href]")].filter((e) => e.checkVisibility())
        .map((e) => e.getAttribute("href")),
    }));
    must(r.地図をひらく === 0, "「地図をひらく」が残っている");
    // ⚠ **出口をゼロにしない**（⚠ 消すだけだと、⚠ 行き先が無くなる）
    must(r.出口.includes("./"), `アプリへ戻る道が無い: ${JSON.stringify(r.出口)}`);
    must(r.出口.some((h) => /deep\?ll=/.test(h)), `深掘りへの道が無い: ${JSON.stringify(r.出口)}`);
    return `「地図をひらく」0 件 ／ 出口 ${r.出口.join(" ")}`;
  },
});

CASES.push({
  // ⚠ **古いリンク（`?take=`）は読まない**（2026-08-30。⚠ Owner 判断）。
  //   ⚠ **まだリリースしていないので、⚠ 古いリンクを持っている人がいない。**
  //   ⚠ **残す限り、⚠ 開けば荷物が配信元へ届く**（⚠ クエリは HTTP のリクエスト行に載る）。
  name: "受け取り口は、クエリに載った荷物を読まない",
  path: "/take?take=1W1szNS42NTUzLDEzOS43OTY3LCLosYrmtLIiLCLml6fmsLTpg6giLDNdXQ",
  origin: NEXT_BASE, viewport: PC,
  async check(page) {
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      受け取った: !document.getElementById("recvGot").hidden,
      入力欄: document.getElementById("recvIn").checkVisibility(),
      控え: JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length,
    }));
    must(!r.受け取った, "クエリの荷物を読んでいる（⚠ 開くだけで配信元へ届く形）");
    must(r.控え === 0, `クエリの荷物を黙って足している（${r.控え} 件）`);
    // ⚠ **画面は壊さない。**⚠ **合言葉を打つ道は残る**
    must(r.入力欄, "合言葉の入力欄が出ていない");
    return "クエリの荷物は読まない（受け取り 0 ／ 控え 0 ／ 入力欄は出る）";
  },
});

// ⚠ **保存した場所の一覧（`/saved`）**（2026-08-30。⚠ Owner が絵を見て決めた）。
//
// ⚠ **板（地図の上）は URL を持たない。**⚠ **リロードでも戻りでも出せない。**
//   ⚠ **画面にすると URL を持つので、⚠ `/deep` から戻ってこられる。**
// ⚠ **地図の入口（`#savedOpen`）は変えていない**（2026-08-30。Owner 判断）。
//   ⚠ **地図はスマホで触るもの。**⚠ **合言葉を出す入口が板の中にあるので、⚠ 板を残す。**
const 保存の種 = [
  { lat: 36.3418, lon: 138.6353, name: "長野県軽井沢町", value: "低地", at: 1788000000000 },
  { lat: 35.9756, lon: 139.7527, name: "埼玉県春日部市", value: "氾濫平野", at: 1787900000000 },
  { lat: 35.65531, lon: 139.79672, name: "東京都江東区豊洲", value: "旧水部", at: 1787800000000 },
];

for (const [名, viewport] of [["スマホ", SP], ["PC", PC]]) {
  CASES.push({
    name: `${名}の /saved が、保存した場所を並べる`,
    path: "/saved", origin: NEXT_BASE, viewport,
    setup: (page) => page.addInitScript((l) => {
      // ⚠ **控えを先に置く**（⚠ この画面は localStorage からしか作らない）
      localStorage.setItem("konjaku-next-saved-v1", JSON.stringify(l));
    }, 保存の種),
    async check(page) {
      await 待つ(page, () => document.querySelectorAll("#listItems li").length > 0, "一覧の行");
      const r = await page.evaluate(() => {
        const 行 = [...document.querySelectorAll("#listItems li")];
        return {
          件数: 行.length,
          見出し: document.querySelector(".list__h").textContent.trim(),
          // ⚠ **1 行に押し先を 2 つ並べない**（`docs/adr/0072`）
          押し先: [...new Set(行.map((li) => li.querySelectorAll("a[href],button").length))],
          先: 行.map((li) => li.querySelector("a")?.getAttribute("href")),
          字: 行.map((li) => li.textContent.replace(/\s+/g, " ").trim()),
          空: document.getElementById("listEmpty").checkVisibility(),
          断り: document.getElementById("listNote").textContent.trim(),
          小さい: [...document.querySelectorAll("a[href],button")]
            .filter((e) => e.checkVisibility())
            .map((e) => { const q = e.getBoundingClientRect();
              return { t: e.textContent.trim().slice(0, 8),
                       w: Math.round(q.width), h: Math.round(q.height) }; })
            .filter((x) => x.w < 44 || x.h < 44),
          あふれ: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      must(r.件数 === 3, `一覧の件数が違う（${r.件数}）`);
      must(/3 件/.test(r.見出し), `件数を言っていない: ${r.見出し}`);
      must(!r.空, "一覧が出ているのに「1 件も無い」が出ている");
      // ⚠ **1 行 = 1 つの押し先**
      must(r.押し先.length === 1 && r.押し先[0] === 1,
        `1 行の押し先が 1 つでない: ${JSON.stringify(r.押し先)}`);
      must(r.先.every((h) => /deep\?ll=\d/.test(h ?? "")),
        `行の行き先が深掘りでない: ${JSON.stringify(r.先)}`);
      // ⚠ **板が出していた 3 つを落とさない**（⚠ 町名・保存日・足元の区分）
      must(/長野県軽井沢町/.test(r.字[0]), `町名が無い: ${r.字[0]}`);
      must(/低地/.test(r.字[0]), `足元の区分が無い: ${r.字[0]}`);
      must(/きょう|きのう|日前|週間前|か月前/.test(r.字[0]), `保存日が無い: ${r.字[0]}`);
      must(/どこにも送りません/.test(r.断り), `どこにも送らないと言っていない: ${r.断り}`);
      must(!r.小さい.length, `44 を割る操作要素がある: ${r.小さい.map((x) => `${x.t}=${x.w}x${x.h}`).join(" ")}`);
      must(r.あふれ === 0, `横へ ${r.あふれ}px あふれている`);
      return `${r.件数} 件・1 行 1 押し先・${r.先[0]}`;
    },
  });
}

CASES.push({
  // ⚠ **1 件も無いとき。**⚠ **空白にしない**（`CLAUDE.md` §4-1）。
  //   ⚠ **「無い」だけを言わない。**⚠ **何をすれば並ぶかを言う。**
  name: "/saved は、1 件も無いときに次にすることを言う",
  path: "/saved", origin: NEXT_BASE, viewport: SP,
  async check(page) {
    await 待つ(page, () => document.getElementById("listEmpty").checkVisibility(), "空の案内");
    const r = await page.evaluate(() => ({
      行: document.querySelectorAll("#listItems li").length,
      見出し: document.querySelector(".list__emptyH").textContent.trim(),
      本文: document.querySelector(".list__emptyP").textContent.replace(/\s+/g, " ").trim(),
      断り: document.getElementById("listNote").checkVisibility(),
      戻る道: document.querySelector(".brand__name")?.getAttribute("href"),
    }));
    must(r.行 === 0, `1 件も無いはずなのに ${r.行} 行ある`);
    must(/保存していません/.test(r.見出し), `見出しが違う: ${r.見出し}`);
    // ⚠ **何をすれば並ぶか**（⚠ 保存の道と、⚠ 受け取る道の 2 つ）
    must(/保存/.test(r.本文) && /並びます/.test(r.本文), `保存の道を言っていない: ${r.本文}`);
    must(/合言葉/.test(r.本文), `別の端末から受け取る道を言っていない: ${r.本文}`);
    // ⚠ **0 件のときに「どこにも送りません」を出さない**（⚠ 送るものが無い）
    must(!r.断り, "1 件も無いのに「どこにも送りません」を出している");
    must(r.戻る道 === "./", `アプリへ戻る道が無い: ${r.戻る道}`);
    return `「${r.見出し}」／ ${r.本文.slice(0, 30)}…`;
  },
});


CASES.push({
  // ⚠ **置けなかったときは、⚠ 進まない**（2026-08-30）。
  //   ⚠ **`/saved` は `localStorage` から作る。**⚠ **置けていなければ、⚠ 何も並ばない。**
  //   ⚠ **黙って空の一覧へ送ると、⚠ 「消えた」と読める**（`CLAUDE.md` §1）。
  // ⚠ **この道は、⚠ 検査を足すまで一度も通っていなかった**（⚠ わざと壊しても素通りした）。
  name: "受け取り口は、置けなかったときに一覧へ進まない",
  path: "/take", origin: NEXT_BASE, viewport: PC,
  setup: async (page) => {
    await 合言葉の口(page);
    // ⚠ **読むのはできるが、⚠ 書けない端末**（⚠ ブラウザの設定でそうなることがある）
    await page.addInitScript(() => {
      const 元 = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "konjaku-next-saved-v1") throw new Error("置けない（わざと）");
        return 元.call(this, k, v);
      };
    });
  },
  async check(page) {
    const code = await page.evaluate(async () => {
      const 圧縮 = async (t) => {
        const s = new Blob([t]).stream().pipeThrough(new CompressionStream("gzip"));
        return KonjakuSaved.bytes2b64(new Uint8Array(await new Response(s).arrayBuffer()));
      };
      const payload = await KonjakuSaved.toText(
        [{ lat: 35.65531, lon: 139.79672, name: "東京都江東区豊洲三丁目", value: "旧水部", at: 3 }],
        圧縮);
      const res = await fetch("/api/handoff", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      return (await res.json()).code;
    });
    await page.locator("#recvIn").fill(code);
    await page.locator("#recvGo").click();
    // ⚠ **見せてから押してもらう一歩は無い**（2026-08-30）。⚠ **押さずに足しに行く。**
    await 待つ(page, () => !document.getElementById("recvGot").hidden, "置けなかったときの断り");
    const r = await page.evaluate(() => ({
      道: location.pathname,
      見出し: document.getElementById("gotTitle")?.textContent.trim() ?? "",
      本文: document.getElementById("gotBody")?.textContent.trim() ?? "",
      入力欄: document.getElementById("recvIn")?.checkVisibility() ?? false,
      控え: (() => { try {
        return JSON.parse(localStorage.getItem("konjaku-next-saved-v1") ?? "[]").length;
      } catch { return -1; } })(),
    }));
    must(!/\/saved$/.test(r.道), `置けていないのに一覧へ進んだ（${r.道}）`);
    // ⚠ **「足しました」と言わない**（⚠ 置けていない）
    must(!/足しました/.test(r.見出し), `置けていないのに足したと言っている: ${r.見出し}`);
    must(/残せませんでした/.test(r.見出し), `置けなかったと言っていない: ${r.見出し}`);
    // ⚠ **こちらの都合を、⚠ 相手の都合のように言わない**
    must(/ブラウザの設定/.test(r.本文), `なぜ置けないかを言っていない: ${r.本文}`);
    // ⚠ **置けていないので、⚠ 控えは増えない**（⚠ 増えていたら、⚠ 断りのほうが嘘）
    must(r.控え === 0, `置けていないのに控えが増えている（${r.控え} 件）`);
    must(!r.入力欄, "置けなかったのに、入力欄が残っている");
    return `${r.道} に留まり「${r.見出し}」`;
  },
});

// ⚠ **`/deep` の戻る道**（2026-08-30。⚠ Owner が決めた）。
//
// ⚠ **入口が 3 つあるのに、⚠ 出口が 1 つしか無かった。**
//     地図 → /deep         ⚠ 地図へ戻るのが自然
//     保存の一覧 → /deep   ⚠ 一覧へ戻るのが自然
//     共有リンクで直接      ⚠ どちらでもない。⚠ **「もどる」は嘘**
//
// ⚠ **`history.length` では分からない**（⚠ 実測 2026-08-30: ⚠ 直接ひらいても 2）。
//   ⚠ **`document.referrer` なら分かれる。**
CASES.push({
  name: "深掘り画面を直接ひらいたら、行き先を言う字にする",
  path: `/deep?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  async check(page) {
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const a = document.getElementById("back");
      return { 字: a.textContent.trim(), 先: a.getAttribute("href"),
               referrer: document.referrer };
    });
    must(r.referrer === "", `直接ひらいたのに referrer がある: ${r.referrer}`);
    // ⚠ **見ていない場所に「もどる」とは言えない**（`CLAUDE.md` §4）
    must(!/もどる|戻る|ひとつ前/.test(r.字), `直接ひらいたのに戻ると言っている: ${r.字}`);
    must(/地図で見る/.test(r.字), `行き先を言っていない: ${r.字}`);
    // ⚠ **場所を渡す**（⚠ 既定の場所へ飛ばさない）
    must(/ll=\d/.test(r.先 ?? ""), `地図へ場所を渡していない: ${r.先}`);
    return `「${r.字}」→ ${r.先}`;
  },
});

CASES.push({
  // ⚠ **同じサイトから来たとき。**⚠ **直前へ返す。**
  //   ⚠ **本当に戻るところまで見る**（⚠ 字が変わるだけでは、⚠ 何も確かめていない）。
  name: "深掘り画面から、来た画面へ戻れる",
  path: "/saved", origin: NEXT_BASE, viewport: PC,
  setup: (page) => page.addInitScript((l) => {
    localStorage.setItem("konjaku-next-saved-v1", JSON.stringify(l));
  }, [{ lat: 35.65531, lon: 139.79672, name: "東京都江東区豊洲三丁目",
        value: "旧水部", at: 1788000000000 }]),
  async check(page) {
    await 待つ(page, () => document.querySelectorAll("#listItems li").length > 0, "一覧の行");
    await page.locator("#listItems a").first().click();
    await 待つ(page, () => location.pathname.includes("deep"), "深掘り画面");
    await page.waitForTimeout(2500);
    const 字 = await page.evaluate(() => document.getElementById("back").textContent.trim());
    must(/ひとつ前/.test(字), `同じサイトから来たのに、直前へ返す字でない: ${字}`);
    await page.locator("#back").click();
    await 待つ(page, () => location.pathname.endsWith("/saved"), "戻った先");
    const 戻り = await page.evaluate(() => ({
      道: location.pathname,
      行: document.querySelectorAll("#listItems li").length,
    }));
    must(/\/saved$/.test(戻り.道), `来た画面へ戻っていない（いま ${戻り.道}）`);
    must(戻り.行 === 1, `戻った先が作り直されていない（${戻り.行} 行）`);
    return `「${字}」→ ${戻り.道}（${戻り.行} 件）`;
  },
});

CASES.push({
  // ⚠ **新しいタブで開かれた場合**（⚠ ctrl＋クリック・中クリック）。
  //   ⚠ **referrer は同じサイトなのに、⚠ 戻る先が無い。**
  //   ⚠ **`history.length` では見分けられない**（⚠ 文書の実測）。
  //   ⚠ **戻れたかどうかは、⚠ 戻ってみないと分からない。**⚠ **戻らなければ地図へ送る。**
  name: "新しいタブで深掘りを開いても、押して行き止まりにならない",
  path: `/deep?${TOYOSU}`, origin: NEXT_BASE, viewport: PC,
  // ⚠ **同じサイトの referrer を付けて開く。**⚠ **そのうえで `back()` を効かなくする。**
  //   ⚠ **走者は `about:blank` から始まるので、⚠ 「戻る先が無い」をそのままは作れない**
  //   （⚠ `back()` が `about:blank` へ戻ってしまう）。⚠ **だから直接そうする。**
  //   ⚠ **実機の中クリックは、⚠ これで確かめたことにはならない**（`CLAUDE.md` §1）。
  //   ⚠ **ここで言えるのは「戻れなかったときに受け皿が働く」まで。**
  goto: { referer: `${NEXT_BASE}/saved` },
  setup: (page) => page.addInitScript(() => {
    history.back = () => {};   // ⚠ 新しいタブ（戻る先が無い）と同じ状態
  }),
  async check(page) {
    await page.waitForTimeout(3000);
    const 前 = await page.evaluate(() => ({
      字: document.getElementById("back").textContent.trim(),
      referrer: document.referrer, 履歴: history.length,
    }));
    must(/ひとつ前/.test(前.字), `同じサイトの referrer なのに字が違う: ${前.字}`);
    await page.locator("#back").click();
    // ⚠ **戻れないので、⚠ 受け皿が働いて地図へ出る**（⚠ 押しても何も起きない、にしない）
    await page.waitForTimeout(1500);
    const 後 = await page.evaluate(() => ({
      道: location.pathname, 場所: new URL(location.href).searchParams.get("ll"),
    }));
    must(!/deep/.test(後.道), `押しても行き止まりのまま（いま ${後.道}）`);
    must(後.場所, `地図へ場所を渡していない（${後.道} ／ ll=${後.場所}）`);
    return `戻れない → ${後.道}?ll=${後.場所}`;
  },
});
