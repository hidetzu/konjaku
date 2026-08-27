// 実描画 — 記録より強く言わない（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 31 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 4 件を、⚠ 元ファイルの見出し 2 本ごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **元ファイルの見出しをそのまま持ってきている**（⚠ 消さない）:
//     `// ---- 記録の精度どおりに書く ----`
//     `// ---- 共有カードの中身を見る ----`
//
// ⚠ **4 件とも `CLAUDE.md` §1 の同じ側を見ている**:
//     時の粒度 ⚠ **「20世紀」を点の年として言い切らない**（⚠ `timeValue` は 1900-01-01）
//     場所の枠 ⚠ **枠の外にあるものを、⚠ この範囲のものとして出さない**
//     出所     ⚠ **取れなかったカードに「実測」と書かない**
//     欠測     ⚠ **写真だけ落ちたとき、⚠ 「残っていない」と言わない**
//
// ⚠ **どれも「取れなかった ≠ 無い」「推定を実測のように見せない」の裏返し。**
//   ⚠ **共有カードは、⚠ 共有先まで届く**ので、⚠ **画面より広く読まれる**（`CLAUDE.md` §6）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  TOYOSU, waitVerdict, wdItem, stubWikidata, photoFrames,
  waitStrip, LIES, GSI_ROUTE, settleAfterCondition, must
} from "./lib.mjs";

export const CASES = [
  // ---- 記録の精度どおりに書く ----
  // ⚠ 「20世紀」は timeValue が 1900-01-01。年として扱うと、1985年築のものが
  //   「1936年に在った」と出る。docs が過去の事故として名指ししている型。
  //   静的・実行時のどちらの経路でも同じ答えになること。
  {
    name: "世紀・年代の記録を、点の年として言い切らない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(31, "テスト20世紀の塔", 1900, null, 139.7981, 35.6545, 7),
      wdItem(32, "テスト1950年代の館", 1950, null, 139.7969, 35.6556, 8),
      wdItem(33, "テスト1930年の橋", 1930, null, 139.7986, 35.6541, 9),
      wdItem(34, "テスト1970年代の駅", 1970, null, 139.7975, 35.6549, 8),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();            // 1936–42
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rows = await page.$$eval(".ev-row", (els) => els.map((e) => ({
        y: e.querySelector(".ev-y")?.textContent.trim() ?? "",
        l: e.querySelector(".ev-l")?.textContent.trim() ?? "" })));
      const has = (t) => rows.find((r) => r.l.includes(t));
      // 1930年の橋は 1936年までに確実にできている
      must(has("1930年の橋"), `年の記録が出ていない: ${JSON.stringify(rows)}`);
      // ⚠ 20世紀（1900〜1999）は 1936年時点で「あった」と言い切れない
      must(!has("20世紀の塔"),
        `世紀の記録を、1936年に在ったものとして出している: ${JSON.stringify(rows)}`);
      // ⚠ 1950年代（1950〜1959）も同様
      must(!has("1950年代の館"), `年代の記録を、1936年に在ったものとして出している`);
      // ⚠ **差分でも、幅の終端まで見ること。**
      //   「1970年代」は 1970〜1979 のどこか。1961–69 → 1974–78 の差分に出すと
      //   「1978年までに確実にできた」と言い切ることになる（1979年の記録かもしれない）。
      //   以前ここは `must(d, "1974–78 の差分に 1970年代の記録が出ていない")` で、
      //   **誤った配置のほうを正として固定していた**。
      const rowsAt = async (n) => {
        await photoFrames(page).nth(n).click();
        await page.waitForFunction(() => !/調べています/.test(
          document.getElementById("ev")?.textContent ?? ""), null, { timeout: 20000 });
        await settleAfterCondition(page);
        return page.$$eval(".ev-row", (els) => els.map((e) => ({
          y: e.querySelector(".ev-y")?.textContent.trim() ?? "",
          l: e.querySelector(".ev-l")?.textContent.trim() ?? "" })));
      };
      const early = await rowsAt(3);                       // 1961–69 → 1974–78
      must(!early.find((r) => r.l.includes("1970年代の駅")),
        `1970年代（1970〜1979）を、1974–78 までに確定した変化として出している: ${JSON.stringify(early)}`);
      // 幅の終端（1979）が入るコマで、初めて出る。消えるのではなく後ろへずれる
      const now = await rowsAt(4);                         // 1974–78 → 1979–83
      const d = now.find((r) => r.l.includes("1970年代の駅"));
      must(d, `1979–83 の差分に 1970年代の記録が出ていない（幅の終端で出るはず）: ${JSON.stringify(now)}`);
      must(/年代/.test(d.y), `10年の記録を「${d.y}」と書いている（精度どおりでない）`);
      return `1936年: ${rows.map((r) => r.y).join(",") || "なし"}／`
        + `1974–78: ${early.map((r) => r.y).join(",") || "なし"}／1979–83: ${now.map((r) => r.y).join(",")}`;
    },
  },
  {
    // ⚠ 枠の外にあるものを「この範囲にあったもの」に並べない。
    //   実測で、経度999/緯度91 の項目が並び、印は1つも打たれなかった
    //   （「一覧に出したものには必ず印がある」という不変条件も同時に崩れる）
    name: "枠の外にあるものを、この範囲のものとして出さない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(41, "テスト枠内", 1930, null, 139.7981, 35.6545),
      wdItem(42, "テスト範囲外A", 1900, null, 999, 91),
      wdItem(43, "テスト範囲外B", 1901, null, -181, -95),
      wdItem(44, "テスト少しだけ外", 1920, null, 139.86, 35.72),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rows = await page.$$eval(".ev-l", (els) => els.map((e) => e.textContent.trim()));
      for (const bad of ["範囲外A", "範囲外B", "少しだけ外"])
        must(!rows.some((r) => r.includes(bad)), `枠の外のものを出している: ${bad}`);
      // 一覧に出したものには必ず印がある
      const pins = await page.locator("#pins .pin").count();
      must(pins === rows.length, `一覧 ${rows.length} 件に対して印 ${pins} 個`);
      return `枠内 ${rows.length} 件だけ／印 ${pins} 個`;
    },
  },
  // ---- 共有カードの中身を見る ----
  // ⚠ これまで「1200x630 であること」しか見ておらず、**中身は一度も見ていなかった**。
  //   そのため「1件も読めていないカードに『…を実測』と書く」も
  //   「粗いのに粗いと書かない」も、壊しても検査は緑のままだった（QA が実証）。
  //   canvas の文字は読めないので、描いた文字列を横から控える。
  {
    name: "取れなかったカードに「実測」と書かない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await waitVerdict(page);
      const said = await page.evaluate(() => {
        const drawn = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          drawn.push(String(t)); return orig.call(this, t, ...a);
        };
        try { window.KonjakuShare.draw(window.__facts ?? null, "豊洲"); } catch { /* 下で拾う */ }
        CanvasRenderingContext2D.prototype.fillText = orig;
        return drawn;
      }).catch(() => null);
      // facts を窓に出していないので、共有ボタン経由で描かせる
      const drawn = await page.evaluate(() => new Promise((res) => {
        const out = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          out.push(String(t)); return orig.call(this, t, ...a);
        };
        const done = () => { CanvasRenderingContext2D.prototype.fillText = orig; res(out); };
        document.getElementById("shareBtn")?.click();
        setTimeout(done, 1500);
      }));
      const text = drawn.join(" ");
      must(text.length > 0, "共有カードに文字が描かれていない");
      // ⚠ 1件も読めていないのに「実測」と名乗らない
      must(!/実測/.test(text), `読めていないのに「実測」と書いている: ${text.slice(0, 120)}`);
      must(/読み込めませんでした/.test(text),
        `読めなかったことがカードに書かれていない: ${text.slice(0, 120)}`);
      return `カードの文字「${text.slice(0, 60)}…」／「実測」なし`;
    },
  },
  {
    // ⚠ 掟: 取れなかったを「無い」と言わない の根。写真だけ落ちたときに「残っていない」と言い換えたら落ちること。
    //   QA が「書き換えても検査は緑」と実証した箇所
    name: "写真だけ落ちたとき、「残っていない」と言わない", path: `/?${TOYOSU}`,
    // ⚠ glob に `(a|b)` の交替は無い（`{a,b}` はある）。この形は
    //   **1本も遮断していなかった**＝この検査は一度も走っていない（2026-08-14 検証者が実証）。
    //   Overpass の `**://*.overpass*/**` でまったく同じ型を踏んでいる。
    //   → URL の述語で見る。そして**実際に落ちたことを数える**。
    setup: (page) => { page.__blocked = 0;
      return page.route((u) => /cyberjapandata\.gsi\.go\.jp\/xyz\/(ort_|gazo|seamlessphoto)/.test(u.href),
        (r) => { page.__blocked++; r.abort(); }); },
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(1200);
      const v = (await page.locator("#verdict").textContent()).replace(/\s+/g, " ");
      // ⚠ そもそも落とせているか。落とせていなければ、この検査は何も確かめていない
      must(page.__blocked > 0,
        "写真を1本も落とせていない（経路の書き方が効いていない＝この検査は空振り）");
      // 判定そのものは出ていること（写真が落ちただけ）
      must(/旧水部|盛土地/.test(v), `判定まで巻き添えになっている: ${v.slice(0, 60)}`);
      // ⚠ 「残っていない」「無い」と言い換えない
      must(!/残っていない|残っていません/.test(v),
        `取れなかったのに「残っていない」と言っている: ${v.slice(0, 120)}`);
      must(/読み込めませんでした/.test(v),
        `読み込めなかったことを言っていない: ${v.slice(0, 120)}`);
      for (const w of LIES) must(!v.includes(w), `断定している: 「${w}」`);
      return `判定は出る／「読み込めませんでした」／「残っていない」なし`;
    },
  },
];
