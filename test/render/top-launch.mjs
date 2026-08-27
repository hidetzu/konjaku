// 実描画 — 判定カードと、⚠ そこから始まる次の一手（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 34 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件 ＋ 離れた 2 件を集めたので、⚠ 並びは動く。**
//
// ⚠ **4 件で、⚠ 土地の型を並べている**（⚠ **1 つでも欠けると、⚠ 型ごとの違いが見えない**）:
//     水域           ⚠ **明治期に水だった土地**
//     データ無し     ⚠ **明治期の記録が、⚠ そもそも整備されていない土地**
//     記録なし・低地 ⚠ **整備範囲だが、⚠ その地点に記録が無い土地**
//     水域だが高台   ⚠ **水だったが、⚠ いまは高い土地**（⚠ 水域と同じ扱いにしない）
//
// ⚠ **「取れなかった」「無い」「あるが別の話」を、⚠ 型ごとに書き分けているところ**
//   （`CLAUDE.md` §1）。⚠ **1 つの土地だけ見ていると、⚠ 書き分けが崩れても気づけない。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  WORDS, TOYOSU, SAPPORO, YUMENOSHIMA, KIYOSUMI,
  openGroups, suggestionsOf, rowsOf, groupsOf, WEB_SEARCH,
  waitVerdict, VERDICT_SENTENCE, must
} from "./lib.mjs";

export const CASES = [
  {
    name: "ランチャー（水域）", path: `/?${TOYOSU}`,
    async check(page) {
      // 「判定中…」のまま読むと素通りしてしまうので、確定するまで待つ
      const ms = await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(v.includes("明治期"), `見出しに判定が出ていない: ${v}`);
      // ⚠ **組は既定で畳んである**（2026-08-21）。⚠ 数える前に開く
      await openGroups(page);
      const n = await page.locator("#list .it").count();
      must(n >= 5, `コマンドが少なすぎる: ${n}`);
      // ⚠ **次の体験（この場所を深掘り）は、⚠ 判定カードの中**（⚠ 一覧ではない）
      must(await page.locator("#verdict #peelCta").count() === 1, "判定カードに深掘りの導線が無い");
      must(await page.locator('#list [href^="./peel"]').count() === 0,
        "一覧にも深掘りの導線が残っている（導線は 1 か所）");
      // バッジは常に見える／詳細な根拠は ? を押した人にだけ見せる。
      const badges = await page.locator("#verdict .badge").count();
      must(badges >= 2, `バッジが出ていない: ${badges}`);
      must(!(await page.locator("#result").isVisible()), "根拠が既定で開いている");
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      // 根拠は「見出しで言い切っているもの」から順に出す。1枚目は地形分類（掟: 主題は「成り立ち」。明治期は手法のひとつ）
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      must(/^地形分類/.test(cards[0] ?? ""), `根拠の1枚目が地形分類でない: ${(cards[0] ?? "").slice(0, 30)}`);
      must(/図式コード \d+/.test(cards[0]), `地形分類の根拠に図式コードが無い: ${cards[0].slice(0, 120)}`);
      must(/詳細版|広域版/.test(cards[0]), `どの精度で答えたのかが書かれていない: ${cards[0].slice(0, 120)}`);
      // 画素を読んでいるのは明治期のほう。1枚目に rgba を求めると、地形分類が
      // 読んでもいない画素の根拠を持っていることになってしまう
      const meijiCard = cards.find((c) => /^明治期の地形/.test(c)) ?? "";
      must(/rgba=/.test(meijiCard), `明治期の根拠（rgba）が出ていない: ${meijiCard.slice(0, 80)}`);
      // 事実の集合が出ているか（明治期・標高・写真の3つ）
      const own = await page.locator("#own").textContent();
      must(own.includes("標高"), "標高が事実として出ていない");
      must(/[\d.]+\s*m/.test(own), "標高の数値が出ていない");
      // ⚠ **取得方法の字は words.js が持つ。**⚠ **ここに書き写さない。**
      //   ⚠ 2026-08-20 に踏んだ（#9c に続いて 2 回目）: この検査が「直読み」を直接書いていて、
      //     ⚠ **字を言い直したら、製品ではなく検査が落ちた**（掟: 同じ問いに答える実装を2つ持たない）。
      must(own.includes(WORDS.METHOD.read),
        `取得方法のバッジが出ていない（「${WORDS.METHOD.read}」を探した）`);
      const elev = own.match(/(-?[\d.]+)\s*m/)?.[1] ?? "?";
      // 次に調べる語。判定できた地点では出ること、Web検索へ行くこと。
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "判定が出ているのに「次に調べる語」が1件も無い");
      const wrong = sug.filter((s) => !s.href.startsWith(WEB_SEARCH));
      must(!wrong.length, `提案が Web検索になっていない: ${wrong.map((w) => w.href).join(" / ")}`);
      // 液状化は「明治期に水域」かつ「いま低地」が重なったときだけ出る語。
      // 固定枠で区分から先に埋めていた頃は、ここで落ちていた。
      must(sug.some((s) => s.label.includes("液状化")),
        `水域かつ低地なのに液状化が出ていない: ${sug.map((s) => s.label).join(" / ")}`);
      // ⚠ **組の見出しが出ていること**（2026-08-21。行ごとのタグから移した）。
      //   ⚠ 「なぜここに出ているのか」は、⚠ **組の見出しが 1 か所で言う。**
      //   ⚠ 字は words.js。⚠ **ここに書き写すと、言い直したときに検査が落ちる**
      // ⚠ **組の順は「公的な情報で確認する」→「さらに調べる」**（2026-08-21。Owner 判断）。
      //   ⚠ **前と逆にした。**⚠ 経緯は index.html の buildActions のコメントに書いてある。
      const groups = await groupsOf(page);
      must(groups.join("／") === [WORDS.GROUP.ext, WORDS.GROUP.why].join("／"),
        `一覧の組の見出しが違う: ${groups.join(" / ")}`);
      // ⚠ **行ごとのタグは、画面から消えていること**（⚠ 見出しと 2 か所にしない）
      must(await page.locator("#list .tag").count() === 0,
        "行ごとのタグが戻っている（組の見出しと 2 か所になる）");
      // ⚠ **組の順は Owner が決めた**（2026-08-21）: 公的な情報 → さらに調べる。
      //   ⚠ **以前は逆で、⚠ 「この場所に固有なものほど上」だった。**
      //     ⚠ その並びは、⚠ **亀戸の標高 -0.57m から出た〈水害の記録〉が、
      //       ⚠ 亀戸と無関係な〈地理院地図〉の下に埋もれていた**のを直したもの。
      //   ⚠ **条件が変わった**: ⚠ 両方とも畳んで 1 行の見出しになったので、埋もれない。
      //   ⚠ **こちらでは決めない。**⚠ 順が変わったら、⚠ Owner の判断を取り直す。
      const rows = await rowsOf(page);
      const lastFixed = rows.map((r) => /ハザードマップ|地理院地図/.test(r[1])).lastIndexOf(true);
      const firstWhy = rows.findIndex((r) => r[0] === "why");
      must(lastFixed >= 0 && firstWhy > lastFixed,
        `公的な情報が、この土地から出た語より下にいる: ${rows.map((r) => r[1]).join(" / ")}`);
      // この土地の判定から出た組の見出しの色は、判定バッジと同じであること。
      // ベージュ固定にしていたときは、ここ（水域＝青い判定）でだけベージュになり、
      // 色が何を指すのか分からなかった。
      // ⚠ **2026-08-21 に、行ごとのタグから組の見出しへ移した。**⚠ 繋ぐ理由は同じ。
      const tagCol = await page.$eval("#list .lh.lh-why", (e) => getComputedStyle(e).color);
      const badgeCol = await page.$eval("#verdict .badge", (e) => getComputedStyle(e).color);
      must(tagCol === badgeCol,
        `「さらに調べる」の色が判定バッジと違う: 見出し ${tagCol} / バッジ ${badgeCol}`);
      // 地名の例は場所が確定したら役目が終わっている。一覧の全下に居座らせない
      const quick = await page.$eval("#quick", (e) => getComputedStyle(e).display);
      must(quick === "none", `場所が確定したのに地名の例が出たままになっている: display=${quick}`);
      // ⚠ **次の体験は、⚠ 判定カードの中に入っている**（2026-08-21）。
      //   ⚠ 前は一覧の 1 行目に置き、⚠ **枠と地色だけで判定カードと 1 枚に見せていた**（溶接）。
      //     ⚠ 利用者の指摘「深掘りのための情報は同一カード内に表示しないと迷う」への対応だった。
      //   ⚠ **中に入れたので、⚠ 溶接そのものが要らなくなった。**
      //   ⚠ **守りたいことは同じ: ⚠ 答えを読んだ流れのまま、⚠ 次の体験に届くこと。**
      //     ⚠ だから「重ねる」のすぐ下にあることを見る。
      const cta = await page.evaluate(() => {
        const c = document.getElementById("peelCta"); if (!c) return null;
        const r = c.getBoundingClientRect();
        const ov = document.getElementById("ovRow")?.getBoundingClientRect();
        return { inCard: !!c.closest("#verdict"), t: Math.round(r.top), b: Math.round(r.bottom),
          gap: ov ? Math.round(r.top - ov.bottom) : null,
          label: c.querySelector("b")?.textContent ?? "" };
      });
      must(cta, "判定カードの中に深掘りの導線が無い");
      must(cta.inCard, "深掘りの導線が判定カードの外にある");
      must(cta.gap !== null && cta.gap >= 0 && cta.gap <= 20,
        `深掘りの導線が「重ねる」から離れている: ${cta.gap}px`);
      return `判定「${v.trim().split("\n")[0]}」／バッジ ${badges} 個／標高 ${elev}m／コマンド ${n} 件`
        + `／提案 ${sug.map((s) => s.label).join("・")}（公的な情報は ${lastFixed} 番目まで）`
        + `／判定確定まで ${ms}ms`;
    },
  },
  {
    name: "ランチャー（データ無し）", path: `/?${SAPPORO}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      // 掟: 主題は「成り立ち」。明治期は手法のひとつ の前は「整備対象外」で終わっていた土地。地形分類は答えられる
      must(VERDICT_SENTENCE.test(v), `成り立ちが出ていない: ${v.trim().slice(0, 60)}`);
      // ただし明治期のデータが無いことは、無いと言い続けること。
      // 地形分類が答えられたからといって、別の手法の空振りを黙って埋めない
      must(/明治期のデータなし|明治期: 記録なし/.test(v),
        `明治期が取れていないのに、そう書かれていない: ${v.trim().slice(0, 80)}`);
      // ここが一番大事。提案は明治期の区分からしか出していないので、ここでは 0 件。
      // 何か出したくなったときに当たり障りのない語で埋めると、提案そのものが死ぬ。
      const sug = await suggestionsOf(page);
      must(!sug.length, `明治期が取れていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      return `${v.trim().split("\n")[0]}／提案 0 件`;
    },
  },
  {
    name: "ランチャー（記録なし・低地）", path: `/?${KIYOSUMI}`,
    async check(page) {
      await waitVerdict(page);
      const v = await page.locator("#verdict").textContent();
      must(/記録がありません|記録なし/.test(v), `「記録なし」が出ていない: ${v.slice(0, 60)}`);
      // 明治期に記録が無いことは、地形分類が答えられても言い続けること。
      // 片方が答えられたからといって、もう片方の空振りを黙って埋めない
      must(/明治期: 記録なし/.test(v), `明治期の空振りが隠されている: ${v.slice(0, 80)}`);
      // 掟: 主題は「成り立ち」。明治期は手法のひとつ の前は、ここで提案が 0 件だった（明治期の区分からしか出していなかったため）。
      // いまは地形分類から出る。ただし理由は必ず、この地点で実測した事実を名指しすること。
      // 「記録なし」を根拠に語を出していたら、それは埋め草なので落ちる。
      // ⚠ **組は既定で畳んである**（2026-08-21）。⚠ 理由を読む前に開く
      await openGroups(page);
      const subs = await page.$$eval("#list .it.why small", (els) => els.map((e) => e.textContent.trim()));
      must(subs.length >= 1, "地形分類が出ているのに提案が1件も無い");
      must(!subs.some((t) => /記録なし|明治期/.test(t)),
        `明治期の記録が無いのに、それを理由にした提案が出ている: ${subs.join(" / ")}`);
      must(subs.every((t) => /旧水部|盛土地|埋立地|標高/.test(t)),
        `理由が実測した事実を指していない: ${subs.join(" / ")}`);
      const badges = await page.locator("#verdict .badge").allTextContents();
      return `${badges.join(" / ")}／提案の理由 ${subs.join(" / ")}`;
    },
  },
  {
    name: "ランチャー（水域だが高台）", path: `/?${YUMENOSHIMA}`,
    async check(page) {
      await waitVerdict(page);
      const sug = await suggestionsOf(page);
      must(sug.length >= 1, "水域と判定できているのに提案が1件も無い");
      // 低地ではないので液状化は出さない。ここで出るなら、条件が枠取りに戻っている。
      must(!sug.some((s) => s.label.includes("液状化")),
        `低地でないのに液状化が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      const badges = await page.locator("#verdict .badge").allTextContents();
      return `${badges.join(" / ")}／提案 ${sug.map((s) => s.label).join("・")}`;
    },
  },
];
