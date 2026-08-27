// 実描画 — 次の一手の語を、⚠ どこまで言えるか（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 38 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件 ＋ 連続した 3 件を集めたので、⚠ 並びは動く。**
//
// ⚠ **5 件とも「⚠ 出せる語が減ったとき、⚠ 何をするか」を見ている**:
//     0 件のとき   ⚠ **提案が 0 件でも、⚠ 次の体験は判定カードの中にある**
//     出せない語   ⚠ **見つからなかった語を、⚠ 本人の判断で報告できる**
//     別の出典から ⚠ **明治期が無くても、⚠ 地形分類から語が出る**
//     粗いとき     ⚠ **詳細版が無い土地では、⚠ 「粗い」と言う**
//     出さない     ⚠ **押しても店が出てこない語では、⚠ 周辺検索を出さない**（ADR 0026）
//
// ⚠ **「出す」だけでなく、⚠ 「出さない」も同じ問いの答え。**
//   ⚠ **語が出ないことを隠さない**（`CLAUDE.md` §4-1）。
//   ⚠ **粗いものを詳細のように見せない**（`CLAUDE.md` §1）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  WORDS, TOYOSU, KARUIZAWA, NIIGATA, suggestionsOf,
  waitVerdict, VERDICT_SENTENCE, settleAfterCondition, must
} from "./lib.mjs";

export const CASES = [
  {
    // 溶接は「この土地の答え」を1枚に見せるためのもの。判定から出た語が無い土地で
    // 囲うと、どこでも同じ2行を囲んだ空箱になり、答えがあるように見える
    // ⚠ **2026-08-21 に、2 度目の書き直し。**
    //   ⚠ 1 度目（同日）: 「判定から出た語が無いときは溶接しない」→
    //     ⚠ 「提案が 0 件の土地でも、溶接するのは深掘りの 1 行だけ」
    //   ⚠ 2 度目（同日）: ⚠ **深掘りを判定カードの中へ入れたので、⚠ 溶接そのものをやめた。**
    // ⚠ **守りたいことは 3 回とも同じ**:
    //   ⚠ **どこで開いても同じものを、⚠ 「この土地の答え」の続きに見せない。**
    //   ⚠ **提案が 0 件の土地でも、⚠ 次の体験には届くこと。**
    name: "提案が 0 件の土地でも、次の体験は判定カードの中にある", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#list .lh.fold", { timeout: 30000 });
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const c = document.getElementById("peelCta");
        return { why: document.querySelectorAll("#list .it.why").length,
          rows: document.querySelectorAll("#list .it").length,
          cta: !!c, inCard: !!c?.closest("#verdict"),
          label: c?.querySelector("b")?.textContent ?? "",
          // ⚠ どこで開いても同じ固定リンクが、判定カードに紛れ込んでいないこと
          fixedInCard: [...document.querySelectorAll("#verdict a")]
            .filter((e) => /ハザードマップ|地理院地図/.test(e.textContent)).length,
          groups: [...document.querySelectorAll("#list .lh.fold span:first-child")]
            .map((e) => e.textContent.trim()) };
      });
      must(r.why === 0, `軽井沢で提案が出ている（前提が変わった）: ${r.why}`);
      must(r.rows === 0, `既定で畳んでいない（行が ${r.rows} 出ている）`);
      must(r.cta && r.inCard, "提案が 0 件の土地で、次の体験が判定カードの中に無い");
      must(r.fixedInCard === 0,
        `どこで開いても同じ固定リンクが判定カードに入っている: ${r.fixedInCard} 本`);
      // ⚠ 提案が 0 件なので、⚠ 「さらに調べる」の見出しも出ない
      must(!r.groups.includes(WORDS.GROUP.why),
        `提案が 0 件なのに「${WORDS.GROUP.why}」の見出しが出ている: ${r.groups.join(" / ")}`);
      return `提案 0 件／次の体験「${r.label}」は判定カードの中／見出し ${r.groups.join("・")}`;
    },
  },
  {
    // このサービスでいちばん価値のある信号は「探したのに出せなかった語」。
    // 黙って去られると永久に分からない。ただし勝手には送らない（掟: 地名も座標も送らない）。
    // 押すかどうかは本人が決める形になっていること。
    name: "見つからなかった語を、本人の判断で報告できる", dep: "search", path: "/",
    async check(page) {
      await page.fill("#q", "ぞぞぞぞぞぞ");
      await page.waitForFunction(
        () => /見つかりませんでした/.test(document.getElementById("list")?.textContent ?? ""),
        null, { timeout: 30000 });
      const a = page.locator("#list .report");
      must(await a.count() === 1, "見つからなかったのに報告の手段が無い");
      const href = await a.getAttribute("href");
      must(/^https:\/\/docs\.google\.com\/forms\//.test(href), `送り先が違う: ${href}`);
      // 打った語が入った状態で開くこと。ここが空だと、利用者が打ち直す羽目になる
      must(decodeURIComponent(href).includes("ぞぞぞぞぞぞ"),
        `打った語が引き継がれていない: ${href}`);
      // 種類も選ばれた状態にする。押すのは「送信」だけで済ませる
      must(decodeURIComponent(href).includes("地名が見つからない"),
        `種類が選ばれていない: ${decodeURIComponent(href)}`);
      // ⚠ 送信は本人が押す。こちらから勝手に投げていないこと
      let posted = 0;
      await page.route("**/docs.google.com/**", (r) => { posted++; r.abort(); });
      await page.waitForTimeout(500);
      must(posted === 0, "利用者が押していないのにフォームへ通信している");
      // ⚠ フッターの常設リンクは外した。聞くのは「見つからなかったその場」だけにする。
      //   漠然とした意見の窓口より、探して出せなかった語のほうが signal が強い
      must(await page.locator("#feedbackLink").count() === 0,
        "フッターに常設の意見リンクが残っている");
      return `報告リンクに「ぞぞぞぞぞぞ」と種類が入る／勝手な送信なし`;
    },
  },
  {
    // 掟: 主題は「成り立ち」。明治期は手法のひとつ の効き目がいちばん出るところ。明治期の低湿地は整備対象外で、
    // これまでこの土地では一言も言えなかった（掟: 取れなかったを「無い」と言わない の「防災クラスタが最も
    // 語りたい土地で一言も言えない」）。
    name: "明治期が無くても、地形分類から語が出る", path: `/?${NIIGATA}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(/旧河道/.test(v), `地形分類が出ていない: ${v.trim().slice(0, 60)}`);
      must(/明治期のデータなし/.test(v), `明治期が無いことを言っていない: ${v.trim().slice(0, 80)}`);
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "地形分類が出ているのに提案が1件も無い");
      // 理由は必ず、この地点で実測した事実を名指ししていること
      const subs = await page.$$eval("#list .it.why small", (els) => els.map((e) => e.textContent.trim()));
      must(subs.every((t) => /旧河道|標高/.test(t)), `理由が実測した事実を指していない: ${subs.join(" / ")}`);
      return `${v.trim().split("\n")[0]}／提案 ${sug.map((s) => s.label).join("・")}`;
    },
  },
  {
    // 掟: 主題は「成り立ち」。明治期は手法のひとつ のいちばん危ないところ。詳細版（z14〜16）が無い土地では広域版（z13）に
    // 落ちるが、粗くなったことを黙ると「詳細版が無い」が「これがこの土地の分類だ」に化ける。
    name: "詳細版が無い土地では、粗いと言う", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(VERDICT_SENTENCE.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
      // ⚠ **「広い区分」を言うのは、判定カードの `coarse` の行 1 つだけ**
      //   （2026-08-21。hidetzu/konjaku#139）。
      //   ⚠ **前はバッジにも書いていた。**⚠ バッジ「低地（広い区分）」と
      //     答え「この土地は 低地」で、⚠ **同じ区分名が 2 か所**に出ていた
      //     （掟: 同じ問いに答える表示を 2 つ持たない）。
      //   ⚠ **限界を消したのではない。**⚠ 出る条件は前と同じ（`!l.fine`）で、
      //     ⚠ **言う場所を 1 つにした。**⚠ だからここは「出ていること」と
      //     「2 か所目が無いこと」の両方を見る。
      const coarseVisible = await page.locator("#verdict .coarse").isVisible();
      must(coarseVisible, "粗い区分なのに、判定カードがそう言う行を出していない");
      const coarseTx = await page.$eval("#verdict .coarse",
        (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/広い区分/.test(coarseTx), `判定カードが「広い区分」と言っていない: 「${coarseTx}」`);
      const badge = await page.$$eval("#verdict .badge", (els) => els.map((e) => e.textContent.trim()));
      must(!badge.some((b) => b.includes("広い区分")),
        `同じことをバッジでも言っている（2 か所になっている）: ${badge.join(" / ")}`);
      must(/詳細版が整備されていない/.test(v),
        `なぜ粗いのかが書かれていない: ${v.trim().slice(0, 120)}`);
      // 根拠側でも、どの精度で答えたのかを名指しすること
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const card = await page.$eval("#own .card", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/広域版・地域版/.test(card), `根拠に精度が書かれていない: ${card.slice(0, 140)}`);
      // 粗い区分から具体的な語を出さない。分かっていないことを分かった顔で見せない
      const sug = await suggestionsOf(page);
      must(!sug.length, `広い区分しか分かっていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      return `${v.trim().split("\n")[0]}／バッジ ${badge.join(" / ")}`;
    },
  },
  {
    // ⚠ **押しても店が出てこない語で、⚠ 周辺検索を出さない**（2026-08-21）。
    //   ⚠ コードに前からある判断: 「『昔』『揺れ』を Google マップに投げても店は出てこない。
    //     ⚠ **無意味なので出さない**」。
    //   ⚠ **深掘りを判定カードへ移したとき、⚠ この判定から抜け落ちた**（⚠ 同日に踏んだ）。
    //     ⚠ 実測（豊洲・375×667・hasTouch・SW 無効）: 「3d」「昔」「立体」「深掘り」の
    //       ⚠ **4 語すべてで「『3d』を周辺で探す」が出ていた。**
    //   ⚠ **一覧が空になるのは、⚠ Owner がそれでよいと判断した**（2026-08-21）。
    //     ⚠ **CTA は一覧の上にあり、⚠ 打っているあいだも画面に見えている。**
    name: "押しても店が出てこない語では、周辺検索を出さない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#list .lh.fold", { timeout: 30000 });
      await settleAfterCondition(page);
      const out = [];
      // ⚠ 深掘りの語。⚠ **周辺検索を出さない**
      for (const w of ["3d", "昔", "立体", "深掘り"]) {
        await page.fill("#q", "");
        await page.waitForTimeout(200);
        await page.fill("#q", w);
        await settleAfterCondition(page);
        const r = await page.evaluate(() => ({
          maps: [...document.querySelectorAll("#list .it")]
            .filter((e) => /周辺で探す/.test(e.textContent ?? "")).length,
          // ⚠ **導線は増やさない。**⚠ 一覧に深掘りが戻っていないこと
          peel: document.querySelectorAll('#list [href^="./peel"]').length,
          // ⚠ **CTA は打っているあいだも画面に見えていること**（⚠ 空でも詰まない理由）
          ctaVis: (() => { const e = document.getElementById("peelCta");
            if (!e) return false;
            const b = e.getBoundingClientRect();
            return b.top < innerHeight && b.bottom > 0; })(),
        }));
        must(r.maps === 0, `「${w}」で、押しても店が出てこない周辺検索が出ている`);
        must(r.peel === 0, `「${w}」で、一覧にも深掘りが出ている（導線は 1 か所）`);
        must(r.ctaVis, `「${w}」を打つと、次の体験が画面から消える`);
        out.push(w);
      }
      // ⚠ **店の語では、いままでどおり出ること**（⚠ 消しすぎていない）
      for (const w of ["ラーメン", "カフェ"]) {
        await page.fill("#q", "");
        await page.waitForTimeout(200);
        await page.fill("#q", w);
        await settleAfterCondition(page);
        const n = await page.evaluate(() => [...document.querySelectorAll("#list .it")]
          .filter((e) => /周辺で探す/.test(e.textContent ?? "")).length);
        must(n === 1, `「${w}」で周辺検索が出ていない（消しすぎている）: ${n}`);
      }
      return `深掘りの語 ${out.join("・")} は周辺検索なし（CTA は画面内）／店の語は今までどおり`;
    },
  },
];
