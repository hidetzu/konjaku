// トップ（`/`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=top`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

// ⚠ **標準の口は、⚠ 使う側が取り込む**（⚠ lib から又貸ししない）。
import { readFile } from "node:fs/promises";
import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  NAGOYA_LL, UNSURVEYED, YUMENOSHIMA, KIYOSUMI, KARUIZAWA, UENO,
  NIIGATA, URAYASU, openGroups, suggestionsOf, rowsOf, groupsOf,
  WEB_SEARCH, waitVerdict, WD, wdItem, WD_SHIBUYA, stubWikidata,
  XSS, notRun, shownAsText, photoFrames, waitStrip, LIES,
  RE_ESC, G1_MARK, G1_HEAD, VERDICT_SENTENCE, GSI_ROUTE, PHOTO_ROUTE,
  pngOf, whitePng, photoPng, eraRoute, ERA_TILE_IDS, stubMapPictures,
  timelineSettled, stepLabels, tauNow, effOpacity, waitOpacity, peelReady,
  settleAfterCondition, waited, waitOptional, settleAfterClick, settleAfterScroll, SWALE_ROUTE,
  LFC_ROUTE, DEM_ROUTE, forbid,
  must, assertToyosu3dAnswer,
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
    // UI/UX の実機検証で見つかった初見の穴。どれも「根拠を売りにする製品が、
    // 同じ画面で自分と食い違う」型なので、機械で押さえる。
    name: "同じ画面で自分と食い違わない", path: `/?${NIIGATA}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(400);
      // かつて年代比較の副題に「1936年〜」を固定で書いていて、新潟のバッジ（1945–50）と
      // 34px の距離で食い違っていた。いまは年代を名乗る場所が大きい写真の見出しに移ったので、
      // **食い違いうる組み合わせ全部**を突き合わせる。
      await waitStrip(page);
      const badge = (await page.locator("#verdict .badge").allTextContents())
        .find((t) => t.includes("年から")) ?? "";
      const era = badge.match(/(\d{4}[–-]\d{2})/)?.[1];
      must(era, `写真の年代バッジが読めない: ${badge}`);
      // 着いた瞬間は最古。大きい写真の見出しが、バッジの言う最古と一致すること
      const yrBig = (await page.locator("#yrBig").textContent()).trim();
      must(yrBig.includes(era), `大きい写真の年代がバッジと食い違う: 「${yrBig}」／「${badge}」`);
      // 年代を名乗る行を、一覧の中に**作らない**（作れば必ず食い違いうる）
      const subs = await page.$$eval("#list .it small",
        (els) => els.map((e) => e.textContent.trim()).filter((t) => /\d{4}[–-]\d{2}|\d{4}年/.test(t)));
      must(subs.length === 0, `一覧が年代を名乗っている（食い違いの種）: ${subs.join(" / ")}`);
      // 根拠を開いたら、そこから閉じられること。開くと1.3画面下へ飛ぶので ? には戻れない
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      must(await page.locator("#closeWhy").isVisible(), "根拠を閉じる手段が出ていない");
      await page.click("#closeWhy");
      await page.waitForTimeout(400);
      must(!(await page.locator("#result").isVisible()), "閉じるを押しても根拠が閉じない");
      return `大きい写真「${yrBig.replace(/\s+/g, " ")}」＝バッジ「${badge}」／一覧は年代を名乗らない／閉じられる`;
    },
  },
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
    // 掟: 唯一の指標は共有率 の唯一の指標（共有率）を観測できるようにした分。
    // これが無い限り 掟: 判定が100件たまるまで共有率を読まない 順番2 も 掟: 主題は「成り立ち」。明治期は手法のひとつ のニッチも開始条件を満たさない。
    name: "共有カードと、共有率の計測", path: `/?${TOYOSU}`,
    // ⚠ 計測は判定が出た瞬間に飛ぶ。route は **goto より前**に仕込む
    //   （「流入の出所」のケースと同じ理由。check の中で仕込むと取りこぼす）
    setup: (page) => { page.__ticks = []; page.__tickHeaders = [];
      return page.route("**/t", (r) => { page.__ticks.push(r.request().postData());
        page.__tickHeaders.push(r.request().headers()); r.fulfill({ status: 204 }); }); },
    async check(page) {
      const ticks = page.__ticks, tickHeaders = page.__tickHeaders;
      await waitVerdict(page);
      await page.waitForTimeout(600);
      // 分母。判定が確定したら1件数える
      must(ticks[0] === "judged.ok", `判定の結果が違う: ${ticks[0]}`);
      // 依存の生死。共有率がゼロだったとき「面白くなかった」のか「壊れていた」のかを
      // 分けるための材料。
      // ⚠ 全部読めたときは **1件**（"all:ok"）。手法ごとに送っていた頃は、判定を1回
      //   見るだけで /t が5件飛び、Worker の呼び出し回数を計測が決めていた（実測）。
      const health = ticks.filter((t) => t?.startsWith("health:"));
      must(health.length === 1 && health[0] === "health:all:ok",
        `全部読めたのに、生死が1件（all:ok）になっていない: ${JSON.stringify(health)}`);
      // 判定を1回見るだけで飛ぶ /t の数。ここが無料枠を決める
      must(ticks.length <= 2, `判定を見るだけで /t が多すぎる: ${ticks.length} 件 ${JSON.stringify(ticks)}`);
      must(health.every((t) => /^health:(all|landform|meiji|elevation|photos):(ok|fail)$/.test(t)),
        `依存の生死の書式が違う: ${JSON.stringify(health)}`);
      // ⚠ 送ってよい語しか送っていないこと。ここに自由な文字列が混ざると、
      //   worker 側の EVENTS で弾いていても「送ってはいる」ことになる（掟: 地名も座標も送らない）
      const allowed = /^(judged\.(ok|coarse|none|fail)|shared|saved|health:[a-z]+:(ok|fail))$/;
      const stray = ticks.filter((t) => !allowed.test(t ?? ""));
      must(!stray.length, `決めた語以外を送っている: ${JSON.stringify(stray)}`);
      // ⚠ 地名も座標も送っていないこと。ここが漏れると「自分専用」が壊れる（掟: 地名も座標も送らない）。
      //   本文だけ見ていたので、URL の地名と座標が Referer で出ていたのを見逃していた。
      //   ヘッダも含めて、リクエスト全体に混ざっていないことを見る。
      must(!/豊洲|139\.|35\./.test(ticks.join("|")),
        `計測の本文に地名か座標が混ざっている: ${ticks.join("|")}`);
      const leaked = tickHeaders.filter((h) => /豊洲|%E8%B1%8A%E6%B4%B2|139\.79|35\.65/.test(
        Object.entries(h).map(([k, v]) => `${k}=${v}`).join("|")));
      must(!leaked.length,
        `計測のヘッダに地名か座標が混ざっている: ${JSON.stringify(leaked.map((h) => h.referer))}`);
      // カードは事実の集合から描く。地図のキャンバスは撮らない
      const card = await page.evaluate(() => {
        const cv = KonjakuShare.draw(meiji.facts, "豊洲");
        return { w: cv.width, h: cv.height, url: cv.toDataURL("image/png").length };
      });
      must(card.w === 1200 && card.h === 630, `カードの大きさが違う: ${card.w}x${card.h}`);
      must(card.url > 20000, `カードが描けていない（${card.url} 文字）`);
      // ⚠ 大きさとバイト数しか見ていなかったので、出典行を丸ごと消しても緑だった。
      //   何が描かれているかを見る（fillText を捕まえる）
      // ⚠ 座標も控える。**何を描いたかだけでは、名乗りが正しい位置に出たか分からない。**
      const drawn = await page.evaluate(() => {
        const orig = CanvasRenderingContext2D.prototype.fillText;
        const said = [];
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...a) {
          said.push({ t: String(t), x, y }); return orig.call(this, t, x, y, ...a);
        };
        try { KonjakuShare.draw(meiji.facts, "豊洲"); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        return { all: said.map((s) => s.t).join(" / "),
          // 名乗りの行。カード左上（64, 84）に描いている
          banner: said.find((s) => s.x === 64 && s.y === 84)?.t ?? null,
          h1: document.querySelector("h1")?.textContent.trim() ?? "" };
      });
      must(/出典: 国土地理院/.test(drawn.all), `カードに出典が無い: ${drawn.all.slice(0, 120)}`);
      must(/旧水部/.test(drawn.all), `カードに判定が無い: ${drawn.all.slice(0, 120)}`);
      must(/konjaku\.hidetzu\.work/.test(drawn.all), "カードに戻り先が無い");
      // ⚠ **名乗りが看板と割れていないこと。実際に描かれた文字で見る。**
      //   静的検査は share.js の BANNER 定義しか見ていない。**定義が正しいまま
      //   fillText に旧い文字列を直書きすれば、静的検査は通ってしまう**（実際に指摘された）。
      //   ここが「描いた結果」を見る唯一の場所。
      must(drawn.banner !== null,
        `カードの名乗りが (64, 84) に無い。位置を動かしたなら、この検査は何も見ていない`
        + `（描かれた文字: ${drawn.all.slice(0, 120)}）`);
      must(drawn.h1.length > 0, "看板（h1）を読めない。この検査が何も見ていない");
      must(drawn.banner === `今昔 — ${drawn.h1}`,
        `カードの名乗りが看板と違う: カード「${drawn.banner}」/ 看板から作るなら「今昔 — ${drawn.h1}」`
        + `（カード画像は SNS で単独に流れるので、ここが名乗りそのものになる）`);
      // 共有ボタンが判定カードの中にあること
      must(await page.locator("#shareBtn").count() === 1, "共有の手段が出ていない");
      return `計測 ${ticks[0]} ／ カード ${card.w}x${card.h}`;
    },
  },
  {
    // 共有カードは最も遠くまで届く画面。ここで断定すると被害が最も大きい。
    name: "共有カードでも、粗いときは粗いと書く", path: `/?${KARUIZAWA}`,
    setup: (page) => { page.__ticks = [];
      return page.route("**/t", (r) => { page.__ticks.push(r.request().postData());
        r.fulfill({ status: 204 }); }); },
    async check(page) {
      const ticks = page.__ticks;
      await waitVerdict(page);
      await page.waitForTimeout(600);
      must(ticks[0] === "judged.coarse", `広い区分なのに ${ticks[0]} と数えている`);
      // 画面に「低地」と「標高939m」が両方出るので、こちらの語を「海抜が低い」に変えた。
      // 地形分類の区分名は国土地理院のものなので、こちらが譲る
      const v = await page.locator("#verdict").textContent();
      must(!/（低地）/.test(v), `標高のバッジが「低地」を名乗っている（区分名と衝突する）: ${v.slice(0, 90)}`);
      return `計測 ${ticks[0]} ／ 標高バッジは区分名と衝突しない`;
    },
  },
  {
    // ⚠ 判定が30件に届かないうちは、共有率より先に「そもそも人が来ているか」を見る。
    //   分母が足りないなら、それは「面白くない」ではなく「人が来ていない」問題。
    // これが飛ばないと、記事を出しても効いたかどうかを永久に区別できない。
    name: "流入の出所を、来た瞬間に1回だけ数える", path: "/?from=zenn",
    // ⚠ 計測はページを開いた瞬間に飛ぶので、route は goto より前に仕込む。
    //   check() の中で登録すると間に合わず、0件に見えて「壊れている」と誤診する
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
    },
    async check(page) {
      await page.waitForTimeout(600);
      const ticks = page.__ticks;
      const from = ticks.filter((t) => t?.startsWith("from:"));
      // ⚠ 判定の前に数える。判定まで到達しなかった人こそ、流入としては数えたい
      must(from.length === 1, `from を ${from.length} 回送っている: ${ticks.join(" / ")}`);
      must(from[0] === "from:zenn", `ラベルが違う: ${from[0]}`);
      return `${from[0]} を1回だけ`;
    },
  },
  {
    // 反対側。ラベルが無いのに送ると「出所不明」が水増しされ、表が読めなくなる
    name: "?from= が無いときは、流入を数えない", path: "/",
    setup: async (page) => {
      page.__ticks = [];
      await page.route("**/t", (r) => { page.__ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
    },
    async check(page) {
      await page.waitForTimeout(600);
      const from = page.__ticks.filter((t) => t?.startsWith("from:"));
      must(from.length === 0, `?from= が無いのに送っている: ${from.join(" / ")}`);
      return `0回（他の計測は ${page.__ticks.length} 件）`;
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
    // ⚠ **同じ区分名を、判定カードの 2 か所で言わない**（2026-08-21。hidetzu/konjaku#139）。
    //   ⚠ 前は バッジ「🌊 旧水部」と 答え「この土地は 旧水部」が並んでいた。
    //   ⚠ 人工地形も同じ（バッジ「🏗 盛土地･埋立地」／答え「人の手で 盛土地･埋立地 に
    //     なっています」）。⚠ 実測（375×667・hasTouch・SW 無効・2026-08-21）で
    //     **豊洲・軽井沢・上野・札幌の 4 地点すべて**が該当した。
    // ⚠ **バッジという層を消したのではない。**⚠ 明治期・標高・写真は残す。
    //   ⚠ **そこにしか無いから**（明治期のデータなし／記録なし は、ほかのどこにも出ない）。
    // ⚠ **区分名を書き写さない。**⚠ 答えの行の `<b>` が、⚠ **強調している語そのもの**なので、
    //   ⚠ そこから取る。⚠ 土地ごとに変わる語を検査に直書きすると、⚠ 語が増えた日に落ちる。
    name: "区分名を、判定カードの 2 か所で言わない", path: `/?${TOYOSU}`,
    async check(page) {
      const out = [];
      for (const [name, q] of [["豊洲", TOYOSU], ["軽井沢", KARUIZAWA],
                               ["札幌", SAPPORO], ["清澄白河", KIYOSUMI]]) {
        if (page.url() !== BASE + `/?${q}`)
          await page.goto(BASE + `/?${q}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        const r = await page.evaluate(() => ({
          // ⚠ 答えの行が強調している語（＝地形分類と人工地形）
          words: [...document.querySelectorAll("#verdict .v-head b")].map((e) => e.textContent.trim()),
          badges: [...document.querySelectorAll("#verdict .badge")]
            .map((e) => ({ k: e.dataset.k ?? "", t: e.textContent.replace(/\s+/g, " ").trim() })),
        }));
        must(r.words.length > 0, `${name}: 答えの行が区分名を強調していない`);
        for (const w of r.words) {
          const hit = r.badges.filter((b) => b.t.includes(w));
          must(hit.length === 0,
            `${name}: 「${w}」を答えとバッジの 2 か所で言っている: ${hit.map((h) => h.t).join(" / ")}`);
        }
        // ⚠ **残すものが残っていること。**⚠ 消しすぎると、ここにしか無い事実が落ちる。
        const keys = new Set(r.badges.map((b) => b.k));
        for (const k of ["meiji", "elevation", "photos"])
          must(keys.has(k), `${name}: ${k} のバッジが消えている: ${[...keys].join(" / ")}`);
        out.push(`${name} 答え ${r.words.join("・")}／バッジ ${r.badges.length} 個`);
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
  {
    // ⚠ ここが崩れると思想が崩れる。
    // GSI への通信を止めても、豊洲が「整備対象外」になってはいけない。
    name: "通信断でも嘘の断定をしない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      const ms = await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `通信断なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 提案は実測した事実からしか出さない。取れていないのだから 0 件
      const sug = await suggestionsOf(page);
      must(!sug.length, `読めていないのに提案が出ている: ${sug.map((s) => s.label).join(" / ")}`);
      // 根拠UI（参照タイルのリンク・読んだ画素・rgba）を出してはいけない。
      // 読んでいないものに根拠を付けると、最も権威ありげな見た目で最も誤ったことを言う。
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 15000 });
      const own = await page.locator("#own").textContent();
      const lie2 = LIES.find((w) => own.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している`);
      must(!/rgba=|読んだ画素/.test(own), "読んでいないのに画素の根拠が出ている");
      must(await page.locator("#own .ev a").count() === 0, "読んでいないのに参照タイルのリンクが出ている");
      must(!own.includes("直読み"), "読めていないのに「直読み」と表示している");
      // 再試行が本当に効くか。失敗をキャッシュに残していると、ここで永久に直らない。
      await page.unroute(GSI_ROUTE);
      await page.click("#retryBtn");
      // ⚠ **ブラウザの中で評価される関数には、Node 側の定数が届かない。**
      //   `VERDICT_SENTENCE` をそのまま書いて ReferenceError にした（2026-08-17）。
      //   引数として渡す。⚠ 正規表現は渡せないので、文字列にして中で組む。
      await page.waitForFunction(
        (src) => new RegExp(src).test(document.getElementById("verdict")?.textContent ?? ""),
        VERDICT_SENTENCE.source, { timeout: 30000 });
      const after = await page.locator("#verdict").textContent();
      // 見出しは地形分類、明治期はバッジ。両方の手法が戻っていることを見る
      must(/旧水部|水部/.test(after), `再試行しても地形分類が戻らない: ${after.slice(0, 60)}`);
      must(after.includes("河川・湖沼・海面"), `再試行しても明治期が戻らない: ${after.slice(0, 60)}`);
      return `${v.trim().split("\n")[0].slice(0, 40)}／根拠なし／${ms}ms で確定`
        + `／再試行で復帰「${after.trim().split("\n")[0].slice(0, 24)}」`;
    },
  },
  {
    // 応答が返ってこない相手。以前は 25 秒経っても「判定中…」のままで復帰手段が無かった。
    name: "無応答でも待ち続けない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, () => { /* 握りつぶす＝無応答 */ }),
    async check(page) {
      const t0 = Date.now();
      const ms = await waitVerdict(page, 25000);   // タイムアウト（8秒）で確定するはず
      const wall = Date.now() - t0;
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `無応答なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      return `${wall}ms で確定（ページ起点 ${ms}ms）／${v.trim().split("\n")[0].slice(0, 34)}`;
    },
  },
  {
    // ⚠ 403 は「無い」ではない（掟: 取れなかったを「無い」と言わない）。
    //   国土地理院の資料にも、403 を不在として読んでよいという記述は無い。
    //   ここは**画像タイル**の経路（明治期の低湿地）。落とすのは swale だけなので、
    //   地形分類が従来どおり答えられることも併せて見る。
    name: "403 でも整備対象外と言わない（画像タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, SWALE_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは明治期のタイルだけ。地形分類まで巻き添えにしていないこと
      must(/旧水部|水部/.test(v), `明治期だけ落としたのに地形分類まで消えている: ${v.trim().slice(0, 70)}`);
      // 根拠UI。読んでいない画素と、403 を「タイルが存在しない」根拠にしていないこと
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const meijiCard = cards.find((c) => /^明治期の地形/.test(c)) ?? "";
      must(meijiCard, "明治期の根拠カードが無い（この検査が何も見ていない）");
      must(!/rgba=/.test(meijiCard), `読んでいないのに画素の根拠が出ている: ${meijiCard.slice(0, 80)}`);
      must(!/HTTP\s*403/.test(meijiCard), `403 を根拠として出している: ${meijiCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => meijiCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${meijiCard.slice(0, 80)}`);
      // 拒否が解けたら取れること。失敗をキャッシュに残していると、ここで永久に直らない
      await page.unroute(SWALE_ROUTE);
      await page.click("#retryBtn");
      await page.waitForFunction(
        () => /河川・湖沼・海面/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 30000 });
      return `断定なし（${v.trim().split("\n")[0].slice(0, 24)}）／根拠なし／再試行で明治期が戻る`;
    },
  },
  {
    // ⚠ **GeoJSON** の経路。主題（その土地はどうやってできたか）に直接答えるのがここ。
    //   403 を不在に丸めると「この地点には地形分類のデータが無い」と断定してしまう。
    name: "403 でも地形分類のデータが無いと言わない（GeoJSON）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, LFC_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/読み込め/.test(v), `読み込めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは地形分類だけ。明治期は従来どおり答えられること
      must(v.includes("河川・湖沼・海面"),
        `地形分類だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const cards = await page.$$eval("#own .card", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      const lfCard = cards.find((c) => /^地形分類/.test(c)) ?? "";
      must(lfCard, "地形分類の根拠カードが無い（この検査が何も見ていない）");
      must(!/図式コード/.test(lfCard), `読んでいないのに図式コードが出ている: ${lfCard.slice(0, 80)}`);
      const lie2 = LIES.find((w) => lfCard.includes(w));
      must(!lie2, `根拠欄で「${lie2}」と断定している: ${lfCard.slice(0, 80)}`);
      return `断定なし／地形分類の根拠なし／明治期は従来どおり`;
    },
  },
  {
    // ⚠ **標高**の経路（dem5a → dem）。2枚とも 403 のとき、
    //   「この地点の標高データが無い」と言ってはいけない。
    name: "403 でも標高データが無いと言わない（標高タイル）", path: `/?${TOYOSU}`,
    setup: (page) => forbid(page, DEM_ROUTE),
    async check(page) {
      await waitVerdict(page, 30000);
      const v = await page.locator("#verdict").textContent();
      const lie = LIES.find((w) => v.includes(w));
      must(!lie, `403 なのに「${lie}」と断定している: ${v.trim().slice(0, 70)}`);
      must(/標高を読み込めませんでした/.test(v),
        `標高が読めなかったことが書かれていない: ${v.trim().slice(0, 70)}`);
      // 読めていない数値を出さない
      must(!/標高\s*-?[\d.]+\s*m/.test(v), `読めていないのに標高の数値を出している: ${v.trim().slice(0, 70)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行の手段が出ていない");
      // 落としたのは標高だけ。判定そのものは従来どおり出ること
      must(v.includes("河川・湖沼・海面"),
        `標高だけ落としたのに明治期まで消えている: ${v.trim().slice(0, 70)}`);
      await page.click("#whyBtn");
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      const own = await page.locator("#own").textContent();
      must(!/生値/.test(own), "読んでいないのに標高の生値が出ている");
      return `断定なし／標高の数値なし／判定は従来どおり`;
    },
  },
  {
    name: "検索（確度が高いので先頭を選ぶ）", dep: "search", path: "/",
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const rows = await page.$$eval("#list .it", (els) => els.map((e) => ({
        t: e.querySelector("b").textContent,
        sub: e.querySelector("small")?.textContent ?? "",
        sel: e.classList.contains("sel"),
      })));
      must(rows[0].t === "東京都渋谷区", `先頭が渋谷区でない: ${rows[0].t}`);
      must(rows[0].sel, "確度が高いのに何も選ばれていない");
      // 副題は緯度経度をやめて、数えた事実にした
      must(!/\d+\.\d{4}, ?\d+\.\d{4}/.test(rows[0].sub), `副題が緯度経度のまま: ${rows[0].sub}`);
      must(/\d+件/.test(rows[0].sub), `副題に数えた事実が無い: ${rows[0].sub}`);
      // キーヒントは一覧と一緒に画面内にいること（以前は y=890 で常に画面外だった）
      const k = await page.$eval(".kbd", (e) => {
        const r = e.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), h: window.innerHeight,
                 txt: e.textContent.replace(/\s+/g, " ").trim() };
      });
      must(k.bottom <= k.h, `キーヒントが画面外: bottom=${k.bottom} / 画面=${k.h}`);
      must(k.txt.includes("東京都渋谷区を調べる"), `Enter に行き先が入っていない: ${k.txt}`);
      must(k.txt.includes("入力を消す"), `Esc の文言が実際の挙動と違う: ${k.txt}`);
      // 利用者役のエージェントによる検証で3回とも別の土地に着いた語。Enter だけで着けること
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.getElementById("chipName")?.textContent === "東京都渋谷区",
        null, { timeout: 20000 });
      return `先頭 ${rows[0].t}／副題「${rows[0].sub}」／Enter で着地`;
    },
  },
  {
    name: "検索（確度が低いので選ばない）", dep: "search", path: "/",
    async check(page) {
      // ⚠ **効かないキーの説明を、打つ前に出さない。**
      //   実測（2026-08-17 / 1280×800 / 地名を打つ前）: ↑↓・Enter・Esc が 3 つとも
      //   薄字（＝いま使えません）のまま 37px 出ていて、検索欄のすぐ下を占めていた。
      //   ⚠ ここは**キーが効く端末**（既定の 1200×780）。375px で見ると
      //     @media (hover:none) が丸ごと隠すので、何も見ずに緑になる。
      const kbdVis = () => page.evaluate(() => {
        const e = document.querySelector("#listbox .kbd");
        if (!e) return null;
        return { vis: e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
          h: Math.round(e.getBoundingClientRect().height) };
      });
      const kbd0 = await kbdVis();
      must(kbd0, "キーヒントの要素が無い（この検査が何も見ていない）");
      must(!kbd0.vis,
        `地名を打つ前からキーヒントが出ている（高さ ${kbd0.h}px・どのキーもまだ効かない）`);
      // 梅田は足立区と大阪市北区がどちらも「区の町字」で並び、応答からは決められない
      await page.fill("#q", "梅田");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const selected = () => page.$$eval("#list .it", (e) => e.findIndex((x) => x.classList.contains("sel")));
      must((await selected()) < 0, "確度が低いのに先頭が選ばれている");
      // ⚠ マウスが一覧の上を通っただけで Enter が武装してはいけない
      await page.hover("#list .it:nth-child(4)");
      must((await selected()) < 0, "hover だけで選択が動いた（Enter が武装する）");
      const off = await page.$eval("#kEnter", (e) => e.classList.contains("off"));
      must(off, "選んでいないのに Enter が薄字になっていない");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      must(!(await page.evaluate(() => location.search)), "選んでいないのに Enter で場所が決まった");
      // ↑↓ を押して初めて武装する
      await page.keyboard.press("ArrowDown");
      must((await selected()) === 0, "↑↓ で先頭が選ばれない");
      const txt = await page.$eval("#kEnter", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/を調べる$/.test(txt), `Enter に行き先が入っていない: ${txt}`);
      // ⚠ **隠しただけで緑にしない。** 候補が出てキーが効くようになったら、必ず出ること。
      //   片側（打つ前は出ない）だけ見ていると、丸ごと消しても通ってしまう。
      const kbd1 = await kbdVis();
      must(kbd1.vis, "候補が出てキーが効くのに、キーヒントが出ない（丸ごと消えている）");
      return `未選択のまま／hover でも武装せず／↓ 後に「${txt}」`
        + `／キーヒントは打つ前 非表示 → 候補あり ${kbd1.h}px`;
    },
  },
  {
    // ⚠ 区名と町字が同じ語で競合する組。並べ替えは「区名が上」で決めるが、それは
    // 順番の規則であって確からしさの証拠ではない。ここで選んでしまうと、
    // 掟: 取れなかったを「無い」と言わない で狙いに定めた埋立地（港区港南＝品川駅東）から確信を持って離れる。
    name: "検索（同名の土地では選ばない）", dep: "search", path: "/",
    async check(page) {
      await page.fill("#q", "港南");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const rows = await page.$$eval("#list .it", (els) => els.map((e) => ({
        t: e.querySelector("b").textContent, sel: e.classList.contains("sel") })));
      const sel = rows.findIndex((r) => r.sel);
      must(sel < 0, `決められない語なのに ${rows[sel]?.t} が選ばれている`);
      const at = rows.findIndex((r) => r.t.startsWith("東京都港区港南"));
      must(at >= 0 && at < 3, `港区港南が上位3件に無い（${at + 1}位）`);
      // Enter は空振りすること（別の土地へ飛ばない）
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      must(!(await page.evaluate(() => location.search)), "選んでいないのに Enter で場所が決まった");
      return `未選択／港区港南は ${at + 1}位／Enter は空振り`;
    },
  },
  {
    // ⚠ 検索経路の「取れなかった」を「無かった」と言い換えない（掟: 取れなかったを「無い」と言わない の検索側の残り）。
    // res.ok を見ずに .json() し、配列の長さだけで判定していたため、
    // HTTP 500 も、配列でない 200 も「見つかりませんでした」に化けていた。
    name: "検索が失敗したとき「無い」と言わない", dep: "search", path: "/",
    async check(page) {
      const API = "**/AddressSearch*";
      const failed = async (label) => {
        await page.fill("#q", "豊洲");
        await page.waitForSelector("#list .note.warn", { timeout: 20000 });
        const t = (await page.locator("#list .note.warn").textContent()).replace(/\s+/g, " ").trim();
        must(!t.includes("見つかりませんでした"), `${label}: 取れなかったのに「見つかりませんでした」`);
        must(/取れませんでした/.test(t), `${label}: 取れなかったことが書かれていない: ${t}`);
        must(await page.locator("#searchRetry").count() === 1, `${label}: 再試行の手段が出ていない`);
        await page.fill("#q", "");
        return t;
      };
      // ① HTTP 500 ＋ JSON 本文
      await page.route(API, (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
      const a = await failed("HTTP 500");
      // ② 200 だが配列でない
      await page.unroute(API);
      await page.route(API, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"error":"x"}' }));
      const b = await failed("配列でない 200");
      // ③ 無応答。8秒のタイムアウトで確定すること（以前は永久に「検索中…」だった）
      await page.unroute(API);
      await page.route(API, () => { /* 握りつぶす＝無応答 */ });
      const t0 = Date.now();
      const c = await failed("無応答");
      const wall = Date.now() - t0;
      must(wall < 14000, `無応答が確定するまで ${wall}ms（8秒のタイムアウトが効いていない）`);
      // ④ 直れば再試行で候補が出る。失敗を覚えていると、ここで永久に直らない
      await page.unroute(API);
      await page.fill("#q", "豊洲");
      await page.waitForSelector("#list .it", { timeout: 30000 });
      const top = await page.locator("#list .it b").first().textContent();
      must(top === "東京都江東区豊洲", `復帰後の先頭が違う: ${top}`);
      // 空配列は「無かった」と言ってよい唯一の場合
      await page.route(API, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
      await page.fill("#q", "ありえない地名");
      await page.waitForFunction(
        () => /見つかりませんでした/.test(document.getElementById("list")?.textContent ?? ""),
        null, { timeout: 20000 });
      return `500「${a.slice(0, 20)}…」／配列でない200 ✓／無応答 ${wall}ms で確定／復帰 ${top}／空配列だけ「見つかりませんでした」`;
    },
  },
  {
    name: "タップ判定（スマホ幅）", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 720 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      // ⚠ computed style の足し算では駄目。以前は ::after を親からはみ出させて 44×44 を
      // 「計算上」作っていたが、実物は .scope の overflow:hidden で下端が切られ、
      // 右端は後から重なる #q が先に拾って、実際に押せるのは 42×42 だった。
      // ここでは **その座標を押したとき目的の要素に届くか** を elementFromPoint で見る。
      // ⚠ **突く前に、画面の中へ入れる**（2026-08-20。hidetzu/konjaku#122）。
      //   ⚠ elementFromPoint は**画面の外を見ない**ので、初期画面から出ているだけで
      //     ⚠ **「なし」が返り、重なりがあるように見える。**
      //   ⚠ ここが見たいのは**重なり**であって、画面内かどうかではない
      //     （画面内かどうかは「重ねる操作が、写真と一緒に初期画面に見える」が見ている）。
      //   ⚠ 実測（375×720）: 答えを画面の先頭へ動かしたぶん、
      //     ⚠ **「なぜそう言える？」の下端が 710 → 725 になり、5px 切れた。**
      const reach = (sel) => page.$eval(sel, (e, size) => {
        e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = size / 2 - 1;
        const pts = [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h], [0, -h], [0, h], [-h, 0], [h, 0]];
        const miss = [];
        for (const [dx, dy] of pts) {
          const x = Math.round(cx + dx), y = Math.round(cy + dy);
          const at = document.elementFromPoint(x, y);
          if (!at || !(at === e || e.contains(at))) miss.push(`(${dx},${dy})→${at?.id || at?.tagName || "なし"}`);
        }
        return miss;
      }, 44);
      // 共有ボタンが増えたので、判定カード内の丸ボタンは複数ある。指で押せる大きさは全部見る
      for (const [name, sel] of [["?", "#whyBtn"], ["共有", "#shareBtn"], ["✕", "#chipX"]]) {
        const miss = await reach(sel);
        must(!miss.length, `${name} の 44×44 の中で他の要素に取られる点がある: ${miss.join(" ")}`);
      }
      // 押して本当に反応するかまで見る（描画上は届いていても無効化されていることがある）
      await page.locator("#whyBtn").click({ position: { x: 4, y: 40 } });
      must(await page.$eval("#whyBtn", (e) => e.getAttribute("aria-expanded")) === "true",
        "44px の隅を押しても ? が開かない");
      const rows = await page.$$eval("#list .it", (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)));
      const min = Math.min(...rows);
      must(min >= 44, `候補の高さが ${min}px（44px 未満の行がある）`);
      // タッチ端末では物理キーが無い。使えない説明で候補を隠さない
      must(await page.locator(".kbd").count() === 0 || !(await page.locator(".kbd").isVisible()),
        "タッチ端末なのにキーヒントが出ている（候補が隠れる）");
      return `? と 共有 と ✕ が実測で 44×44 に届く／隅を押して開く／候補の最小高 ${min}px／キーヒントは非表示`;
    },
  },
  {
    // ⚠ **押すものと、動くものを離さない。** ▶ は帯（年代）を順に送る操作なのに、
    //   実測（2026-08-17）で**帯の下端から 487px（375×667）／650px（PC）**離れていた。
    //   間に大きい写真・判定文・面の内訳が挟まっており、押しても何が起きたか見えない。
    //   ⚠ 同じ整理を「明治期の土地を重ねる」で既にやっている（重ねる相手は写真なので、
    //     操作も写真と一緒に見えている必要がある）。▶ だけ取り残されていた。
    //   ⚠ この不具合は、それまでの検査を 1 つも落とさなかった。位置を誰も見ていなかった。
    name: "▶ は、動かす相手（帯）のすぐそばにある", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const g = await page.evaluate(() => {
        const b = document.getElementById("playBtn");
        const s = document.getElementById("strip");
        if (!b || !s) return null;
        const bb = b.getBoundingClientRect(), sb = s.getBoundingClientRect();
        const cells = [...document.querySelectorAll("#strip .f")].map((e) => e.getBoundingClientRect());
        return { gap: Math.round(sb.top - bb.bottom), y: Math.round(bb.y), vh: window.innerHeight,
          w: Math.round(bb.width), h: Math.round(bb.height),
          cell: Math.round(cells[0]?.width ?? 0), rows: new Set(cells.map((c) => Math.round(c.top))).size,
          label: document.querySelector(".strip-ops-tx")?.textContent.trim() ?? "" };
      });
      must(g, "▶ か帯が見つからない（この検査が何も見ていない）");
      // ⚠ 「そば」を px で言う。1 画面ぶん離れていたら「そば」ではない
      must(g.gap >= 0 && g.gap < 60,
        `▶ が帯から離れている: ${g.gap}px（実測 移す前は 487px。帯の直前に置く）`);
      // ⚠ **帯より上にあること。** 下に置くと「送る先」を見ながら押せない。
      //   ⚠ **絶対の y で書かない**（2026-08-20 に直した。hidetzu/konjaku#122）。
      //     ⚠ 以前は `y < 300` だった。⚠ **これは「帯より上」の代用**で、
      //       ⚠ **答えを画面の先頭へ動かしただけで落ちた**（帯ごと下がっただけで、
      //       ▶ と帯の上下は変わっていない）。⚠ **代用ではなく、主張そのものを書く。**
      must(g.gap >= 0, `▶ が帯より下にいる: 帯との差 ${g.gap}px`);
      // ⚠ **初期画面で押せること。**⚠ 押せない場所にあるなら「そば」でも意味がない
      must(g.y + g.h <= g.vh, `▶ が初期画面の外にいる: y=${g.y}〜${g.y + g.h}（画面 ${g.vh}）`);
      // 指で押す端末では 44px（Apple の指針）
      must(g.w >= 44 && g.h >= 44, `▶ が指で押すには小さい: ${g.w}×${g.h}px`);
      // ⚠ **コマを縮めていないこと。** 帯の中に入れるとコマが縮む（実測 27→25px / 21→18px）。
      //   コマは既に「小さくて押せるように見えない」と指摘が出ている場所
      must(g.cell >= 26, `▶ を置いたせいで帯のコマが縮んでいる: ${g.cell}px（375px では 27px）`);
      must(g.rows === 1, `帯が ${g.rows} 行に折り返している`);
      // ⚠ **名前を添える。** ▶ だけだと「何が始まるか分からないので押すのが怖い」（初見）
      must(g.label.length > 0, "▶ が何をするものか、言葉で書いていない");
      // 押して本当に効くこと
      await page.click("#playBtn");
      await settleAfterClick(page);
      must(await page.locator("#playBtn.on").count() === 1, "▶ を押しても、流れている印が出ない");
      await page.click("#playBtn");
      return `▶ は帯の ${g.gap}px 上（移す前は 487px）／${g.w}×${g.h}px／`
        + `コマ ${g.cell}px は縮まず／名乗り「${g.label}」`;
    },
  },
  {
    // ⚠ **見えなくするのと、消すのは別。** ✕ で場所を外したのに、前の土地の
    //   名前・年代の段・URL がそのまま残っていた（2026-08-17 にオーナーが実機で発見）。
    //   見た目は場所未選択になるので気づけず、**再読み込みすると前の場所が復活していた**。
    //   実測（375×667 / 豊洲）: ✕ の直後 url=?q=豊洲&ll=…&era=swale ／ #strip 9 コマ。
    //   ⚠ この不具合は、それまでの検査を 1 つも落とさなかった。「消えること」を誰も見ていなかった。
    //   `tmp/9/10` の状態遷移の契約「✕ → 結果・一覧・場所・古い非同期処理を消す」に反していた。
    name: "✕ で場所を外したら、URL も画面も前の場所を持ち越さない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const look = () => page.evaluate(() => ({
        url: location.search,
        mode: document.body.classList.contains("picked") ? "action" : "place",
        chip: document.getElementById("chipName")?.textContent.trim() ?? "",
        strip: document.querySelectorAll("#strip .f").length,
      }));
      const before = await look();
      // 前提が消えたら落とす（そもそも場所が載っていないなら、この検査は何も確かめない）
      must(/q=/.test(before.url) && before.strip > 0,
        `前提が崩れている（URL に場所が載っていない / 段が無い）: ${JSON.stringify(before)}`);
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const after = await look();
      must(after.mode === "place", `✕ を押したのに場所選択中のまま: ${after.mode}`);
      must(after.url === "", `✕ を押しても URL に場所が残っている: ${after.url}`);
      must(after.chip === "", `✕ を押しても前の場所の名前が残っている: 「${after.chip}」`);
      // ⚠ **隠れているだけ**を通さない。DOM から消えていること
      must(after.strip === 0, `✕ を押しても前の土地の年代の段が ${after.strip} コマ残っている`);
      // ⚠ **消しすぎて壊していないこと。** ✕ の後始末で地図・年代・読み上げまで捨てるので、
      //   **次の場所が選べなくなる**危険がある。
      //   ⚠ ここは**同じページのまま**やる。再読み込みを挟むと状態が作り直され、
      //     「後始末が次の選択を壊した」を一度も通らない（最初そう書いて、壊しても通った）。
      await page.locator("#quick button", { hasText: "渋谷" }).click();
      await waitVerdict(page);
      await waitStrip(page);
      const next = await look();
      must(next.mode === "action", `✕ のあと、次の場所を選んでも場所選択中にならない`);
      must(next.chip.includes("渋谷"), `次の場所の名前が入らない: 「${next.chip}」`);
      must(/q=/.test(next.url) && !/%E8%B1%8A%E6%B4%B2/.test(next.url),
        `次の場所を選んでも URL が前の場所のまま: ${next.url}`);
      must(next.strip > 0, `次の場所で年代の段が組まれない: ${next.strip} コマ`);

      // ⚠ **画面から選んだ経路でも同じこと。** URL で着いた場合しか見ていなかった
      await page.locator("#chipX").click();
      await settleAfterClick(page);
      const afterPicked = await look();
      must(afterPicked.mode === "place" && afterPicked.url === ""
        && afterPicked.chip === "" && afterPicked.strip === 0,
        `画面から選んだ場所を ✕ したとき、持ち越しがある: ${JSON.stringify(afterPicked)}`);

      // ⚠ **再読み込みで戻ってこないこと。** ここが本体（URL が残っていると復活する）。
      //   最後にやる。ここより前に置くと、上の「次の場所を選べる」が別のページの話になる
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#quick button", { timeout: 20000 });
      await page.waitForTimeout(2500);
      const back = await look();
      must(back.mode === "place" && back.chip === "" && back.strip === 0,
        `再読み込みで前の場所が復活した: ${JSON.stringify(back)}`);
      return `✕ で URL・場所名・年代の段（${before.strip} コマ）が消え、再読み込みでも戻らない`
        + `／同じページのまま渋谷を選べて段 ${next.strip} コマ／画面から選んだ場所の ✕ でも持ち越さない`;
    },
  },
  {
    // ⚠ ここは「おすすめ一覧」ではなく**入力例**。数を増やすと、増やしただけ
    //   押し間違いが増え、間違えて開いても「別の街の判定」が普通に出るので気づけない。
    //   ⚠ 以前この検査は「5 個以上」を求めていた。**消しすぎを反対側から押さえる**ためだったが、
    //     そのぶん 10 個・3 行・169px（実測 2026-08-17 / 375×667）が固定され、
    //     検索欄と同じ強さの入口が 10 個並んで見えていた（UI/UX レビュー 原則2「主役は1つ」）。
    //     守りたかったのは「例が消えていないこと」なので、**ちょうど 3 件**で押さえ直す。
    //   ⚠ 配っている quick-places.json（10 件）は減らしていない。`/peel` は全件を出す。
    name: "入力例は 3 件で、指で押せて、折り返しの上にある", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await page.waitForSelector("#quick button");
      const read = () => page.evaluate(() => {
        const els = [...document.querySelectorAll("#quick button")];
        const b = els.map((e) => e.getBoundingClientRect());
        return { names: els.map((e) => e.textContent.trim()),
          n: b.length, minH: Math.min(...b.map((x) => x.height)),
          bottom: Math.max(...b.map((x) => x.bottom)),
          rows: new Set(b.map((x) => Math.round(x.top))).size };
      });
      const r = await read();
      // 今昔の違う面が見える 3 地点（豊洲＝埋立 / 渋谷＝都市化 / 広島＝歴史）。
      // ⚠ 選び方は index.html の TOP_EXAMPLE_IDS。id の実在は scripts/check.mjs が
      //   quick-places.json と突き合わせている（ここは**画面に出た名前**を見る）
      must(r.n === 3, `入力例が 3 件でない: ${r.n} 件（${r.names.join("・")}）`);
      must(["豊洲", "渋谷", "広島"].every((x) => r.names.includes(x)),
        `入力例が 豊洲・渋谷・広島 でない: ${r.names.join("・")}`);
      // 指で押す端末では 44px（Apple の指針）。ここを下回ると隣を押す
      must(r.minH >= 44, `入力例が指で押すには小さい: ${Math.round(r.minH)}px（44px 必要）`);
      // 入口が折り返しの下にあると、来た人は入口があること自体を知らない
      must(r.bottom <= 667, `入力例が折り返しの下にはみ出た: 下端 ${Math.round(r.bottom)}px`);
      must(r.rows === 1, `375px で入力例が ${r.rows} 行に折り返している`);
      // ⚠ 狭い端末も見る。ここを見ていなかったので、320px で導入の絵が 2 行になっていた
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(120);
      const s = await read();
      must(s.rows === 1, `320px で入力例が ${s.rows} 行に折り返している: ${s.names.join("・")}`);
      must(s.minH >= 44, `320px で入力例が小さい: ${Math.round(s.minH)}px`);
      must(s.bottom <= 640, `320px で入力例が折り返しの下にはみ出た: 下端 ${Math.round(s.bottom)}px`);
      return `${r.n} 件（${r.names.join("・")}）／375px: ${r.rows} 行 高さ ${Math.round(r.minH)}px 下端 ${Math.round(r.bottom)}px`
        + `／320px: ${s.rows} 行 下端 ${Math.round(s.bottom)}px`;
    },
  },
  {
    // ⚠ **PC の 2 カラム**（hidetzu/konjaku#87）。
    //   ⚠ **静的検査だけでは足りない。**「grid と書いてある」ことは見られても、
    //     ⚠ **実際に答えが画面の中へ入るか**は描かないと分からない。
    //   ⚠ **高さ 800px を必ず含める。**⚠ 900 以上だと、直す前でも通ってしまう
    //     （実測 2026-08-20: 答えの下端 y=811。800 では外、900 では中）。
    //   ⚠ **境目（1099 / 1100）そのものを見る。**
    //   ⚠ **狭い幅を対にして見る。**PC だけ見ると、スマホを壊しても緑になる。
    name: "PC では答えが画面の中に入り、狭い幅は変わらない",
    path: "/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975",
    async check(page) {
      // ⚠ **判定中に素通りしていた**（2026-08-21 に main で落ちて分かった）。
      //   ⚠ 前は `/旧水部|土地/` で待っていたが、⚠ **「この土地の成り立ちを判定中…」にも
      //     ⚠ 「土地」が入っている。**⚠ 判定中の段の並びは、判定後と違う。
      //   ⚠ 実際に落ちた: ⚠ **375 を判定中に読み、⚠ 1100 を判定後に読んで、
      //     ⚠ 「DOM の順が狭い幅と違う」**。⚠ **製品ではなく検査の不具合。**
      await waitVerdict(page);
      // ⚠ **出来事は後から届いて、⚠ #verdict に段が増える。**⚠ 並びが落ち着くまで待つ。
      //   ⚠ 2 回続けて同じ並びなら落ち着いたとみなす。
      await page.waitForFunction(() => {
        const o = [...document.getElementById("verdict").children]
          .map((e) => e.id || String(e.className).split(" ")[0] || e.tagName).join(",");
        const prev = window.__ordSeen;
        window.__ordSeen = o;
        return prev === o;
      }, null, { timeout: 45000, polling: 700 });
      const read = () => page.evaluate(() => {
        const d = document.documentElement;
        const g = (s) => { const e = document.querySelector(s);
          if (!e || !e.checkVisibility()) return null;
          const b = e.getBoundingClientRect();
          return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), b: Math.round(b.bottom) }; };
        const vd = document.getElementById("verdict"), lb = document.getElementById("list");
        return {
          vhead: g(".v-head"), big: g("#big"),
          // ⚠ **2 カラムかどうかは、見た目で決める。**⚠ 作り方（grid / float）を書かない。
          //   ⚠ 2026-08-20 に踏んだ: grid をやめて float にしたら、
          //     ⚠ **製品ではなく検査が落ちた**（gridTemplateColumns を見ていた）。
          //   ⚠ **答えと写真の横の範囲が重ならなければ、横に並んでいる＝2 カラム。**
          twoCol: (() => {
            const a = document.querySelector(".v-head")?.getBoundingClientRect();
            const c = document.getElementById("big")?.getBoundingClientRect();
            if (!a || !c) return null;
            return !(a.left < c.right && c.left < a.right);
          })(),
          // ⚠ **次の体験（この場所を深掘り）が、⚠ 判定カードの中にあること**（2026-08-21）。
          //   ⚠ 前はここで「判定の箱と一覧の溶接（隙間 0px）」を見ていた。
          //     ⚠ **深掘りをカードの中へ入れたので、⚠ 溶接そのものをやめた。**
          //   ⚠ **守りたいことは同じ**: ⚠ 答えを読んだ流れのまま、次の体験に届くこと。
          cta: (() => { const c = document.getElementById("peelCta");
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { inCard: !!c.closest("#verdict"), x: Math.round(r.left),
              b: Math.round(r.bottom) }; })(),
          // ⚠ DOM の順（読み上げとキーボードの順）
          order: [...vd.children].map((e) => e.id || String(e.className).split(" ")[0] || e.tagName).join(","),
          over: d.scrollWidth - d.clientWidth, vh: innerHeight, pageH: d.scrollHeight,
        };
      });
      // ---- ⚠ 狭い幅は 1 カラムのまま ----
      const narrow = {};
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await settleAfterCondition(page);
        const r = await read();
        must(r.twoCol === false, `${w}px: 狭い幅が 2 カラムになっている`);
        must(r.over <= 0, `${w}px: 横にあふれている（${r.over}px）`);
        narrow[w] = r;
      }
      // ---- ⚠ 境目そのもの ----
      await page.setViewportSize({ width: 1099, height: 800 });
      await settleAfterCondition(page);
      const at1099 = await read();
      must(at1099.twoCol === false, "1099px で 2 カラムになっている（1100 から、のはず）");
      await page.setViewportSize({ width: 1100, height: 800 });
      await settleAfterCondition(page);
      const at1100 = await read();
      must(at1100.twoCol === true, "1100px で 2 カラムになっていない");
      // ---- ⚠ PC で、答えが画面の中 ----
      const out = [];
      for (const [w, h] of [[1100, 800], [1280, 800], [1440, 900], [1920, 1080]]) {
        await page.setViewportSize({ width: w, height: h });
        await settleAfterCondition(page);
        const r = await read();
        must(r.vhead, `${w}px: 答えの文が見えていない`);
        must(r.vhead.b <= r.vh, `${w}px: 答えが画面の外にある（下端 ${r.vhead.b} > ${r.vh}）`);
        must(r.over <= 0, `${w}px: 横にあふれている（${r.over}px）`);
        // ⚠ 左に答え、右に写真。⚠ **左右が入れ替わっていないこと**
        must(r.big && r.big.x > r.vhead.x,
          `${w}px: 写真が答えより左にある（写真 x=${r.big?.x} / 答え x=${r.vhead.x}）`);
        // ⚠ **次の体験が判定カードの中にあること**（2026-08-21。溶接から置き換えた）
        must(r.cta && r.cta.inCard, `${w}px: 深掘りの導線が判定カードの中に無い`);
        // ⚠ **写真と同じ側（右の列）にいること。**⚠ 流れの中の箱にすると 2 カラムが壊れる
        //   （⚠ 実測で踏んだ: #verdict が 605 → 1074px・ページが 1546 → 1643px）
        must(r.cta.x > r.vhead.x,
          `${w}px: 深掘りの導線が答えと同じ列にいる（2 カラムが壊れている）`);
        // ⚠ **縦のあふれを増やしていないこと。**⚠ この Issue は、それを直すもの。
        //   ⚠ 直す前は 4 幅とも 1879px（2026-08-20 実測）。⚠ **超えたら本末転倒。**
        must(r.pageH <= 1879,
          `${w}px: 横を使ったのに縦が増えている（ページ高 ${r.pageH} > 直す前の 1879）`);
        // ⚠ **DOM の順が、狭い幅と同じであること**（CSS だけで割った証拠）
        must(r.order === narrow[375].order,
          `${w}px: DOM の順が狭い幅と違う（読み上げとキーボードの順が変わっている）`);
        out.push(`${w}: 答え y=${r.vhead.b} 写真 ${r.big.w}px`);
      }
      return `1099 は 1 カラム／1100 から 2 カラム／${out.join(" ／ ")}`;
    },
  },

  {
    // ⚠ **ブラウザの文字サイズ設定に追従すること**（hidetzu/konjaku#91）。
    //   ⚠ **静的検査だけでは足りない。**「html に px が無い」ことは見られても、
    //     ⚠ **実際に字が大きくなるか**は描かないと分からない。
    //   ⚠ 直す前の実測（2026-08-20・375×667）: 設定を 125% / 150% にしても
    //     ⚠ **body も h1 も 1px も変わらなかった**（14 / 19px のまま）。
    //   ⚠ **既定（100%）で 1px も変えていないこと**を、対にして見る。
    //     ⚠ 片側だけだと、既定を壊しても緑になる。
    //   ⚠ **場所を選んだあとの画面も見る。**⚠ **あふれていたのはそちら**（バッジは
    //     場所を選ばないと出ない）。⚠ 2026-08-20 に踏んだ: 未選択だけを見ていて、
    //     ⚠ **わざと壊しても落ちなかった。**
    name: "ブラウザの文字サイズを上げると、字が大きくなる",
    path: "/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975",
    async check(page) {
      // ⚠ 判定が出るまで待つ（バッジはそのあとに出る）
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      const read = () => page.evaluate(() => {
        const d = document.documentElement;
        const g = (s) => { const e = document.querySelector(s);
          return e && e.checkVisibility() ? parseFloat(getComputedStyle(e).fontSize) : null; };
        return { root: parseFloat(getComputedStyle(d).fontSize),
                 body: parseFloat(getComputedStyle(document.body).fontSize),
                 h1: g("h1"), q: g("#q"),
                 over: d.scrollWidth - d.clientWidth };
      });
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForSelector("#q", { timeout: 30000 });
        // ⚠ バッジが出ていること。⚠ **出ていない画面を測っても、あふれは捕まらない**
        await page.waitForFunction(() => document.querySelectorAll(".badges .badge").length > 0,
          null, { timeout: 30000 });
        await settleAfterCondition(page);
        const base = await read();
        // ⚠ **既定は 14px のまま**（0.875rem × 16px）。⚠ ここが動いたら既定を壊している
        must(base.body === 14, `${w}px: 既定の本文が 14px でない（${base.body}px）`);
        must(base.root === 16, `${w}px: ルートがブラウザの既定（16px）でない（${base.root}px）`);
        must(base.over <= 0, `${w}px: 既定で横にあふれている（${base.over}px）`);
        for (const scale of [125, 150]) {
          // ⚠ ブラウザの「文字サイズ N%」＝ 初期ルートを 16×N/100 にすること
          const tag = await page.addStyleTag({ content: `:root{font-size:${16 * scale / 100}px !important}` });
          await settleAfterClick(page);
          const big = await read();
          const want = 14 * scale / 100;
          must(Math.abs(big.body - want) < 0.51,
            `${w}px/${scale}%: 本文が追従していない（${big.body}px。${want}px のはず）`);
          must(big.h1 > base.h1,
            `${w}px/${scale}%: 見出しが追従していない（${base.h1} → ${big.h1}px）`);
          must(big.q > base.q,
            `${w}px/${scale}%: 入力欄が追従していない（${base.q} → ${big.q}px）`);
          // ⚠ **大きくして崩れないこと。**⚠ nowrap のバッジが画面をはみ出していた
          must(big.over <= 0, `${w}px/${scale}%: 横にあふれている（${big.over}px）`);
          out.push(`${w}/${scale}%: ${big.body}px`);
          await tag.evaluate((e) => e.remove());
          await settleAfterClick(page);
        }
      }
      return `既定は 14px のまま／125%・150% で追従し、4 幅とも横あふれ 0（${out.slice(0, 4).join(" ")} …）`;
    },
  },

  {
    // ⚠ **写真が届かないときに、画面へ出ること**（hidetzu/konjaku#116）。
    //   ⚠ **状態は photos.js、字は words.js、置くのは画面。**⚠ **3 つが繋がっているかを見る。**
    //   ⚠ **理由を断定しない。**`<img>` からは落ちた理由が取れないので late に留める。
    //     ⚠ **「読み込めませんでした」と書いたら落とす。**
    //   ⚠ **Service Worker を止める。**⚠ 止めないとキャッシュから返り、
    //     ⚠ **止めたはずのタイルが届く**（2026-08-20 に踏んだ。naturalWidth=256 のままだった）。
    //   ⚠ **見えているかは checkVisibility()。**⚠ textContent は隠れた字も返す（CLAUDE.md §9）。
    name: "写真が届かない年代で、理由を断定せずに断る", path: "/",
    async check(page) {
      // ⚠ **Service Worker を止めた場を、自分で作る**（走者の既定では止まらない）。
      //   ⚠ 止めないとキャッシュから返り、⚠ **止めたはずのタイルが届く。**
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      let r = null, gone = null;
      try {
        const p2 = await ctx.newPage();
        await p2.route((u) => /xyz\/gazo1\//.test(u.href), (q) => q.abort("connectionrefused"));
        await p2.goto(`${BASE}/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        r = await run(p2);
        gone = r.gone;
      } finally { await ctx.close(); }
      const page2 = null; void page2;
      return r.msg;

      async function run(page) {
      await page.waitForFunction(() => document.querySelectorAll(".strip .f").length > 1,
        null, { timeout: 60000 });
      // ⚠ 止めた年代（1974–78）へ。⚠ **押すと地図が起きる**ので setEra を直に呼ぶ
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /1974/.test(e.textContent)); if (i >= 0) setEra(i); });
      await page.waitForFunction(() =>
        document.getElementById("bigErr")?.checkVisibility?.() === true, null, { timeout: 30000 });
      const r = await page.evaluate(() => {
        const e = document.getElementById("bigErr");
        return { seen: e.checkVisibility(), txt: e.textContent.replace(/\s+/g, " ").trim(),
                 era: document.querySelector(".strip .f.on")?.textContent?.trim() };
      });
      must(r.seen, "写真が届いていないのに、断りが出ていない");
      // ⚠ **理由を知らないので断定しない**（404 と区別できない）
      must(!/読み込めませんでした|取得できませんでした|失敗/.test(r.txt),
        `理由を知らないのに断定している: ${r.txt}`);
      // ⚠ **「無い」と言わない**（掟の一行目）
      for (const w of LIES) must(!r.txt.includes(w), `「${w}」と断定している: ${r.txt}`);
      // ⚠ **通信のせいにしない**（つながっているかどうかを、こちらは知らない）
      must(!/通信|接続|インターネット/.test(r.txt), `理由を知らないのに通信のせいにしている: ${r.txt}`);
      // ⚠ **何の写真かを名乗る**（年代が分からないと、何が出ていないのか読めない）
      must(/写真|地面/.test(r.txt), `何が出ていないのか書かれていない: ${r.txt}`);
      // ⚠ **届いている年代へ戻したら、断りは消える**
      await page.evaluate(() => { const f = [...document.querySelectorAll(".strip .f")];
        const i = f.findIndex((e) => /明治期/.test(e.textContent)); if (i >= 0) setEra(i); });
      await settleAfterClick(page);
      const gone = await page.evaluate(() =>
        document.getElementById("bigErr")?.checkVisibility?.() ?? false);
      must(!gone, "届いている年代なのに、断りが残っている");
      return { gone, msg: `${r.era}: 「${r.txt}」／理由を断定せず・「無い」と言わず・`
        + `通信のせいにしない／戻すと消える` };
      }
    },
  },

  {
    // ⚠ **PC では、年代の表示と年代の操作が 1 つの器**（hidetzu/konjaku#132）。
    //
    //   ⚠ **実測（2026-08-20・main = 5210c9e・豊洲・1280×800・SW 無効）**
    //     #era        580×196 y429   ⚠ 別の器
    //     #timePanel  720×136 y638   ⚠ 別の器
    //     ⚠ **「閉じる ⌄」が 2 個**（#eraToggle / #timeToggle）
    //
    //   ⚠ **全体は畳まない**（Owner 決定 2）。⚠ 畳むのは操作部（▶ と横棒）だけ。
    //   ⚠ **畳んでも、⚠ 現在の年代と #est（限界）は残る。**
    //     ⚠ #est が消えると、⚠ **推定の高さで建物が立った絵を断りなしに見せる**（掟 §1）。
    name: "PC では、年代の表示と操作が 1 つの器になっている", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        // ⚠ **#est が字を持つまで待つ**（2026-08-21。hidetzu/konjaku#141 の CI で落ちて分かった）。
        //   ⚠ `#est` は「建物が届いたか」「1.2 秒たっても届かないか」を**見てから**字を出す
        //     （`peel3d.js`。⚠ 実測: 通常回線 69ms ／ 3G 相当 9.5 秒）。
        //   ⚠ `#est:empty` は `display:none` なので、⚠ **字が入るまでは見えない。**
        //   ⚠ ここは待たずに読んでいた。⚠ **手元では間に合い、⚠ CI では 2 回とも間に合わなかった。**
        //   ⚠ **主張は変えていない**（⚠ 出なければ、⚠ 待ったうえで落ちる）。
        //   ⚠ **時間切れのまま落とさない。**⚠ 何を待って駄目だったかを名乗る
        //     （⚠ 素の時間切れだと、⚠ どの主張が破れたのか読めない）。
        const gotEst = await p2.waitForFunction(
          () => (document.getElementById("est")?.textContent ?? "").trim().length > 0,
          null, { timeout: 45000 }).then(() => true).catch(() => false);
        must(gotEst, "PC で限界（#est）が出ていない（45 秒待っても字が入らない）");
        const look = () => p2.evaluate(() => {
          const vis = (s) => { const e = document.querySelector(s);
            return !!(e && e.checkVisibility?.()); };
          return {
            // ⚠ **HUD に器がいくつ立っているか**（2026-08-22 に #era を畳んで 1 つにした）
            boxes: [...document.querySelectorAll("#hud > *")]
              .filter((e) => e.checkVisibility?.()).map((e) => e.id || e.className),
            // ⚠ **畳む仕掛けが戻っていないこと。**⚠ 別の id で作り直されても捕まえる
            toggles: document.querySelectorAll("#eraToggle,#timeToggle,#hud [aria-expanded]").length,
            // ⚠ 「いま何年代か」を出しているもの
            years: [".time-panel .y", "#timeSummary", "#rlYear"].filter(vis),
            est: vis("#est"), over: vis("#over"), play: vis("#play"), track: vis("#track"),
          };
        });
        const a = await look();
        // ⚠ **器は 1 つ。**⚠ 幅と隙間で見なくてよくなった（構造として 1 つ）
        must(a.boxes.length === 1,
          `HUD に器が ${a.boxes.length} 個ある（1 つにまとめたはず）: ${a.boxes.join(" / ")}`);
        // ⚠ **畳む仕掛けは無い**（2026-08-22。Owner 判断で消した）
        must(a.toggles === 0, `畳む仕掛けが戻っている（${a.toggles} 個）`);
        // ⚠ **「いま何年代か」は 1 か所**
        must(a.years.length === 1,
          `「いま何年代か」を ${a.years.length} か所が出している: ${a.years.join(" / ")}`);
        // ⚠ **操作は常に見える。**⚠ 「消した」だけの検査にしない（verify §5 の対）
        must(a.play && a.track, "PC で ▶ か横棒が出ていない（畳めなくしたので、常に見えるはず）");
        // ⚠ **`#est` は HUD の外**（`#notice`）。⚠ **推定の絵を断りなしに見せない**（掟 §1）
        must(a.est, "PC で限界（#est）が出ていない");
        return `器 ${a.boxes.length} 個（${a.boxes.join(" / ")}）・畳む仕掛け 0 個・年代 1 か所`
          + `／▶ と横棒は常に見え、限界も出ている`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **PC では、見えない箱（#land）に土地情報を組み立てない**（hidetzu/konjaku#131）。
    //
    //   ⚠ **実測（2026-08-20・main = bc8dc46・豊洲・SW 無効）**
    //     PC 初期  #land は display:none（0×0）⚠ **なのに 72 字が書かれていた**
    //
    //   ⚠ **PC でもパネルは閉じられる。**⚠ **入口は 2 つ**（✕ と ▶ の再生）。
    //     ⚠ 実測: ▶ を押しても panel は "col hide" になり、#land が 520×130 で出る。
    //     ⚠ **✕ だけに描画を足すと、⚠ ▶ で空の HUD が出る。**
    //
    //   ⚠ **待たずに読む。**⚠ 待つと、⚠ **遅れて埋まっても緑になる**（契約 4「空白を見せない」）。
    name: "PC でパネルを閉じても、HUD に答えが戻らない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        // ⚠ **2026-08-21 に、⚠ HUD の答え（#land）ごと無くなった**（hidetzu/konjaku#152）。
        //   ⚠ 前の主張: 「⚠ PC の初期表示で、⚠ 見えない箱に 72 字が書かれていた」を止める。
        //     ⚠ そのために「⚠ 見えているときだけ描く（syncHud）」を足していた。
        //   ⚠ **書く箱が無くなったので、⚠ 引き継ぎも空白も起きない。**
        //   ⚠ **主張は引き継ぐ**: ⚠ **箱が戻っていないこと**と、⚠ **✕ で例外が出ないこと。**
        const read = () => p2.evaluate(() => ({
          cls: document.getElementById("panel")?.className ?? "",
          land: document.querySelectorAll("#land").length,
          all: (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim().length,
        }));
        const a = await read();
        must(!a.cls.includes("hide"), `PC でパネルが閉じて始まっている（${a.cls}）`);
        must(a.land === 0, "HUD の答え（#land）が戻っている（土地の答えはパネルの 1 か所）");
        must(a.all > 0, "PC の初期表示で、パネルに答えが書かれていない");
        // ⚠ **✕ の直後、⚠ 待たずに読む**（⚠ 例外や空白が出ないこと）
        await p2.click("#closePanel");
        const b = await read();
        must(b.cls.includes("hide"), `✕ でパネルが閉じていない（${b.cls}）`);
        must(b.land === 0, "✕ で HUD の答えが復活している");
        must(errs.length === 0, `例外が出た: ${errs.slice(0, 2).join(" / ")}`);
        await p2.close();

        // ⚠ **入口は 2 つ**（✕ と ▶）。⚠ **どちらも同じ 1 か所を通ること。**
        //   ⚠ 前は「⚠ ▶ の直後に HUD が空でないこと」で見ていた（⚠ 引き継ぎの空白）。
        //   ⚠ **2026-08-21 に引き継ぎが無くなった**ので、⚠ **見るのは
        //     ⚠ 「▶ でも閉じること」と「⚠ 例外が出ないこと」。**
        const p3 = await ctx.newPage();
        const errs3 = [];
        p3.on("pageerror", (e) => errs3.push(e.message));
        await p3.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p3.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p3);
        const read3 = () => p3.evaluate(() => ({
          cls: document.getElementById("panel")?.className ?? "",
          land: document.querySelectorAll("#land").length,
        }));
        // ⚠ **▶ の直後、⚠ 待たずに読む**（⚠ 2 つめの入口）
        await p3.click("#play");
        const c = await read3();
        must(c.cls.includes("hide"), `▶ でパネルが閉じていない（${c.cls}）`);
        must(c.land === 0, "▶ で HUD の答えが復活している");
        await p3.click("#play");
        await settleAfterClick(p3);
        must(errs3.length === 0, `例外が出た: ${errs3.slice(0, 2).join(" / ")}`);
        return `PC 初期はパネルに ${a.all} 字／✕ で閉じる／▶ でも閉じる／`
          + `HUD の答えは 0 個（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **遅れて届いた答えが、⚠ 画面に乗ること**（契約 6）。
    //   ⚠ 地形分類をわざと 12 秒遅らせる。⚠ **乗らないと、⚠ 古い答えが残る。**
    // ⚠ **2026-08-21 に、⚠ 見る先が HUD からパネルへ移った**（hidetzu/konjaku#152）。
    //   ⚠ 前は「⚠ パネルを閉じてから届かせ、⚠ HUD が更新されるか」を見ていた。
    //   ⚠ **HUD に答えを出さなくなったので、⚠ 閉じる必要も無い。**⚠ 主張は同じ。
    name: "遅れて届いた答えが、画面に乗る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        // ⚠ 地形分類（ベクトル）だけを 12 秒遅らせる
        await p2.route(LFC_ROUTE, async (r) => {
          await new Promise((x) => setTimeout(x, 12000));
          await r.continue();
        });
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForTimeout(4000);
        const before = await p2.evaluate(() =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim());
        // ⚠ **地形分類が届く前でも、⚠ パネルには何か出ている**（⚠ 空を見せない）
        must(before.length > 0, "地形分類が届く前に、パネルが空のまま");
        // ⚠ 遅れて届くのを待つ。⚠ **時間切れで落とさない**（⚠ 何を主張していたのか読めなくなる）
        const moved = await p2.waitForFunction((b) =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim() !== b,
          before, { timeout: 45000 }).then(() => true).catch(() => false);
        const after = await p2.evaluate(() =>
          (document.getElementById("landAll")?.innerText ?? "").replace(/\s+/g, " ").trim());
        must(moved && after !== before,
          `遅れて届いた答えが画面に乗っていない（古い答えが残る）: 「${before.slice(0, 40)}」`);
        return `閉じた直後「${before.slice(0, 30)}」→ 届いたあと「${after.slice(0, 30)}」`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **深掘りの導線は 1 か所**（hidetzu/konjaku#138）。
    //
    //   ⚠ **実測（2026-08-21・main = 8219774・豊洲・SW 無効）**
    //     根拠を開くと ⚠ **`#own` に 1 個・一覧に 1 個**。
    //     ⚠ 同時に目に入りはしない（開くと一覧は画面の上の外へ流れる）が、
    //     ⚠ **DOM には常に 2 つあり、⚠ 同じ判定で同じことを言っていた。**
    //   ⚠ 利用者役 4 名に画面だけを見せた: ⚠ **4/4 が一覧行を残すと答え、4/4 が根拠側を否定した。**
    //
    //   ⚠ **一覧行は残す。**⚠ 消すと、⚠ 「深掘りが無くなった」になる。
    name: "深掘りの導線が、根拠を開いても 1 か所のまま", path: "/", group: "core",
    async check(page) {
      const out = [];
      for (const [w, h] of [[1280, 800], [375, 667]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: w < 680, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await settleAfterCondition(p2);
          const look = () => p2.evaluate(() => ({
            own: document.querySelectorAll('#own a[href*="./peel"]').length,
            // ⚠ **2026-08-21 に、⚠ 導線が一覧から判定カードの中へ移った**
            card: document.querySelectorAll('#verdict a[href*="./peel"]').length,
            list: [...document.querySelectorAll('#list a[href*="./peel"], #list .it')]
              .filter((e) => /この場所を深掘り/.test(e.textContent ?? "")).length,
            cardY: (() => { const e = document.getElementById("peelCta");
              return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
          }));
          // ⚠ **初期は判定カードに 1 個だけ**
          const a = await look();
          must(a.card === 1, `${w}px: 判定カードの深掘りが ${a.card} 個（1 個のはず）`);
          must(a.list === 0, `${w}px: 一覧にも深掘りが ${a.list} 個ある（1 か所のはず）`);
          must(a.own === 0, `${w}px: 根拠パネルに深掘りの導線が ${a.own} 個ある`);
          must(a.cardY !== null, `${w}px: 判定カードの深掘りが見つからない`);
          // ⚠ **根拠を開いても増えない**
          await p2.click("#whyBtn");
          await p2.waitForSelector("#own .ev", { timeout: 30000 });
          await settleAfterCondition(p2);
          const b2 = await look();
          must(b2.own === 0,
            `${w}px: 根拠を開くと深掘りの導線が ${b2.own} 個に増える（1 か所のはず）`);
          must(b2.card === 1, `${w}px: 根拠を開いたら判定カードの導線が ${b2.card} 個になった`);
          must(b2.list === 0, `${w}px: 根拠を開いたら一覧にも導線が出た（${b2.list} 個）`);
          out.push(`${w}px 判定カード ${a.card}（y${a.cardY}）／一覧 ${a.list}／根拠 ${a.own}→${b2.own}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **同じ数字を、画面の 2 か所で言わない**（hidetzu/konjaku#130）。
    //
    //   ⚠ **実測（2026-08-20・main = 42784fa・豊洲・1280×800・SW 無効）**
    //     y376  区分を特定できた足元のうち 河川・湖沼・海面 510 / 543件（93.9%）
    //     y876  河川・湖沼・海面 510 / 543                    ⚠ **内訳**
    //     ⚠ **同じ数字・同じ区分名が、⚠ 500px 離れて 2 回。**
    //   ⚠ **内訳が正本**（2 位以下も出す）。
    //
    //   ⚠ **葉だけを拾う走査では数えられない。**⚠ 内訳の行は
    //     `<span class="nm"><i class="swatch">…</i>河川・湖沼・海面</span>` で、
    //     ⚠ **`.nm` に子がいるので葉にならない**（2026-08-20 に踏んだ）。
    //     ⚠ **「1 行に見える箱」を拾う**（改行を含まない innerText）。
    name: "同じ数字を、画面の 2 か所で言わない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        await p2.waitForFunction(() => /\/ \d+/.test(
          document.getElementById("breakdown")?.innerText ?? ""), null, { timeout: 60000 });
        const r = await p2.evaluate(() => {
          // ⚠ **「一番内側の箱」だけを数える。**
          //   ⚠ 内訳は section > rows > row と入れ子になっており、
          //     ⚠ **どれも「河川・湖沼・海面 510 / 543」を含む**。
          //     ⚠ 数えると 3 か所に見えるが、⚠ **画面では 1 か所**（2026-08-20 に踏んだ）。
          //   ⚠ **改行で切らない。**⚠ 内訳の行は flex で名前と数が離れており、
          //     ⚠ **innerText に改行が入る**（同上）。
          const has = (e, ...ws) => {
            const t = (e.innerText ?? "").replace(/\s+/g, " ");
            return ws.every((w) => t.includes(w));
          };
          const innermost = (...ws) => {
            const out = [];
            for (const e of document.querySelectorAll("body *")) {
              if (!e.checkVisibility?.() || !has(e, ...ws)) continue;
              // ⚠ 子孫にも同じものがあるなら、⚠ **この箱は入れ物にすぎない**
              if ([...e.querySelectorAll("*")].some((c) => c.checkVisibility?.() && has(c, ...ws))) continue;
              out.push([Math.round(e.getBoundingClientRect().top),
                (e.innerText ?? "").replace(/\s+/g, " ").trim()]);
            }
            return out;
          };
          const top = document.getElementById("breakdown")?.innerText
            ?.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? "";
          return {
            pair: innermost("河川・湖沼・海面", "510").map(([y, t]) => `y${y} ${t.slice(0, 44)}`),
            raw: innermost("510").map(([y, t]) => `y${y} ${t.slice(0, 40)}`),
            breakdownTop: top,
            est: document.getElementById("est")?.innerText?.replace(/\s+/g, " ").trim() ?? "",
            panelH: document.getElementById("panel")?.scrollHeight ?? 0,
          };
        });
        // ⚠ **区分名と件数の組は 1 か所だけ**
        must(r.pair.length === 1,
          `1 位の区分名と件数が ${r.pair.length} か所にある: ${r.pair.join(" ／ ")}`);
        // ⚠ **消した側の字が戻っていない**
        must(!r.pair.some((x) => /区分を特定できた足元のうち/.test(x)),
          `第3層の本文に「区分を特定できた足元のうち」が戻っている: ${r.pair.join(" ／ ")}`);
        // ⚠ **生の件数は残っている**（消しただけにしない）
        must(r.raw.length >= 1, "510 / 543 が画面から消えている（内訳が受け皿になっていない）");
        must(/河川・湖沼・海面/.test(r.breakdownTop),
          `内訳の 1 行目が区分名で始まっていない: ${r.breakdownTop}`);
        // ⚠ **3D の帯は 1 行**（2026-08-21。hidetzu/konjaku#151。Owner 判断）。
        //   ⚠ 前は「建物が消える年代は演出です」＋分数 2 つだった。
        //   ⚠ **分数はパネルへ移した**（⚠ 消していない）。⚠ **言い方も「推定」へ統一。**
        must(/建物が消える年代は推定/.test(r.est),
          `3D の帯の断りが消えている: ${r.est.slice(0, 80)}`);
        must(!/\d/.test(r.est), `3D の帯に数字が残っている: ${r.est.slice(0, 80)}`);
        return `1 位の組 ${r.pair.length} か所（${r.pair[0]}）／内訳の頭「${r.breakdownTop}」`
          + `／板の中身 ${r.panelH}px`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **明治期の「面」を画面から外しても、答えも本数も変わらない**（hidetzu/konjaku#126）。
    //
    //   ⚠ **これは仕組みだけの変更。**⚠ **見え方も、外への要求も、1 つも変わってはいけない。**
    //   ⚠ **Service Worker を止める。**⚠ 止めないとキャッシュから返り、本数が嘘になる。
    //   ⚠ **buildWater を直接呼んで、返り値そのものを見る**（画面の字だけでは、
    //     集計が変わっていても気づけない。⚠ 割合は丸めて出しているので、下の桁が動いても同じ字になる）。
    name: "明治期の面が、取得の層から同じ答えで返る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        let tiles = 0;
        ctx.on("request", (r) => { if (/\/xyz\/swale\//.test(r.url())) tiles++; });
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await p2.waitForTimeout(9000);
        const before = tiles;
        // ⚠ **画面が持っていないこと。**⚠ 取得の層と控える層を通っていること
        const wiring = await p2.evaluate(() => ({
          hasSwaleArea: typeof Konjaku?.swaleArea === "function",
          hasSwalePixel: typeof Konjaku?.swalePixel === "function",
          hasMeijiArea: typeof KonjakuLand?.meijiArea === "function",
          hasTileCache: typeof tileCache !== "undefined",
          hasGetTile: typeof getTile !== "undefined",
        }));
        must(wiring.hasSwaleArea, "Konjaku.swaleArea が無い（取得の層が面を持っていない）");
        must(wiring.hasSwalePixel, "Konjaku.swalePixel が無い（点が読めない）");
        must(wiring.hasMeijiArea, "KonjakuLand.meijiArea が無い（控える層を通っていない）");
        must(!wiring.hasTileCache, "peel3d.js に tileCache が残っている（3 つめのキャッシュ）");
        must(!wiring.hasGetTile, "peel3d.js に getTile が残っている（取得の層の仕事）");
        // ⚠ **返り値そのものを見る**
        const a = await p2.evaluate(async () => {
          const b = map.getBounds();
          const w = await buildWater({ w: b.getWest(), e: b.getEast(),
            n: b.getNorth(), s: b.getSouth() });
          return { rects: w.rects, ratio: w.ratio, tiles: w.tiles,
            classified: w.classifiedPixels, transparent: w.transparentPixels,
            unknown: w.unknownPixels,
            counts: Object.entries(w.classCounts).filter(([, n]) => n > 0).length };
        });
        must(a.tiles.ok > 0, `1 枚も読めていない（tiles=${JSON.stringify(a.tiles)}）`);
        must(a.rects > 0, `水の面が 0 個（${a.rects}）`);
        must(a.counts > 0, "区分の内訳が空（集計が落ちている）");
        must(a.classified > 0, "分類できた画素が 0（画素を読んでいない）");
        // ⚠ **もう一度呼んでも、外へ取りに行かない。**
        //   ⚠ **効いているのは取得の層のタイル束**（verify.js の swaleTiles）。
        //   ⚠ **控える層の inflight は、ここでは測れない**（通信は増えないので同じ顔になる）。
        //     ⚠ そちらは静的の単体テストが見ている（「同時の 2 回が N 本」）。
        //     ⚠ 実際にわざと外したら、⚠ **実描画は緑のまま・静的だけが落ちた。**
        const mid = tiles;
        await p2.evaluate(async () => { const b = map.getBounds();
          await buildWater({ w: b.getWest(), e: b.getEast(), n: b.getNorth(), s: b.getSouth() }); });
        await settleAfterCondition(p2);
        must(tiles === mid, `2 回目で外へ取りに行っている（${tiles - mid} 本増えた）`);
        return `タイル ${before} 本／面 ${a.rects} 個／割合 ${a.ratio.toFixed(6)}`
          + `／区分 ${a.counts} 種／${JSON.stringify(a.tiles)}／2 回目はタイル束から 0 本`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **断り文が、取り違わっていないこと**（hidetzu/konjaku#126）。
    //   ⚠ **これが掟の一行目そのもの。**⚠ 読めなかったのか、本当に範囲外なのか。
    //   ⚠ **集計を外へ出したときに、⚠ tiles{ok,absent,unreachable} の分け方が
    //     1 つでもずれると、ここが入れ替わる。**
    name: "明治期の面が出せないとき、読めないのと範囲外を取り違えない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        // (1) ⚠ **全部 403** → 読めなかった。⚠ **範囲外と言ってはいけない**
        const p2 = await ctx.newPage();
        await forbid(p2, SWALE_ROUTE);
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /読み込めませんでした|整備対象外/.test(document.body.innerText ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        const t1 = await p2.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
        must(/明治期の低湿地データを[^。]*いま読み込めませんでした/.test(t1),
          `403 なのに「読み込めませんでした」と言っていない: ${t1.slice(0, 120)}`);
        must(!/整備対象外/.test(t1), `403 を「整備対象外」と言っている（掟の一行目）: ${t1.slice(0, 120)}`);
        for (const w of LIES) must(!t1.includes(w), `403 なのに「${w}」と断定している`);
        await p2.close();

        // (2) ⚠ **本当に範囲外（札幌）** → 整備対象外。⚠ **読めなかったと言ってはいけない**
        const p3 = await ctx.newPage();
        await p3.goto(`${BASE}/peel?${SAPPORO}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p3.waitForFunction(() => /整備対象外|読み込めませんでした/.test(document.body.innerText ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p3);
        const t2 = await p3.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
        must(/整備対象外/.test(t2), `範囲外なのに「整備対象外」と言っていない: ${t2.slice(0, 120)}`);
        must(!/明治期の低湿地データを[^。]*読み込めませんでした/.test(t2),
          `範囲外を「読み込めませんでした」と言っている: ${t2.slice(0, 120)}`);
        await p3.close();
        return "403 は「読み込めませんでした」／札幌は「整備対象外」／取り違えなし";
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **着いた直後の画面に、答えと写真と「重ねる」が全部入る**（hidetzu/konjaku#122）。
    //
    //   ⚠ **既存の「重ねる操作が、写真と一緒に初期画面に見える」では足りない。**
    //     ⚠ あちらは 1936–42 のコマへ移し、⚠ **拡大してから**測っている。
    //     ⚠ **着いた直後（明治期のコマ・拡大なし）を誰も見ていなかった。**
    //     ⚠ 実際に穴だった: 写真の上限を外しても、あちらは緑のまま。
    //       ⚠ 着いた直後は 375×667 で 671（画面 667）、320×640 で 655（画面 640）だった。
    //
    //   ⚠ **その大きさで読み込む。**⚠ 伸縮すると写真が前の高さを保つ（同じ穴を踏む）。
    //   ⚠ **hasTouch を付ける。**⚠ 付けないと (hover:none) が効かず、⚠ **14px ずれる**
    //     （2026-08-20 実測: 付けない 645 / 付ける 659。実機は触れる端末）。
    name: "着いた直後の画面に、答えと写真と重ねるが入る", path: "/", group: "core",
    async check(page) {
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await waitStrip(p2);
          await p2.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (s) => { const e = document.querySelector(s);
              if (!e || !e.checkVisibility()) return null;
              const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom) }; };
            const d = document.documentElement;
            return { ans: R(".v-head"), big: R("#big"), ov: R("#ovRow"),
              gq: [...document.querySelectorAll(".verdict .gq")]
                .filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()),
              lines: [...document.querySelectorAll(".v-head .tx")].length,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **問いの見出しが 2 つ出ている**（第1層・第2層）
          must(g.gq.length === 2, `${w}×${h}: 問いの見出しが 2 つでない（${g.gq.length} 個: ${g.gq.join(" / ")}）`);
          // ⚠ **字は words.js の 1 か所から。**⚠ ここへ書き写さない
          must(g.gq[0] === WORDS.layerTitle(1) && g.gq[1] === WORDS.layerTitle(2),
            `${w}×${h}: 見出しが words.js と違う（${g.gq.join(" / ")}）`);
          // ⚠ **成因と人工改変は行を分ける**（ADR 0030 §4-4）
          must(g.lines === 2, `${w}×${h}: 答えが 2 行になっていない（${g.lines} 行）`);
          // ⚠ **3 つとも初期画面に入る**
          for (const [nm, r] of [["答え", g.ans], ["写真", g.big], ["重ねる", g.ov]]) {
            must(r, `${w}×${h}: ${nm} が見えていない`);
            must(r.b <= g.vh, `${w}×${h}: ${nm} が初期画面の外にある（下端 ${r.b} / 画面 ${g.vh}）`);
          }
          must(g.over <= 0, `${w}×${h}: 横にあふれている（${g.over}px）`);
          out.push(`${w}×${h} 答え${g.ans.b}／写真${g.big.b}／重ねる${g.ov.b}（画面 ${g.vh}）`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **答えに出ている区分名の意味が、「なぜそう言える？」を押さずに分かる**
    //   （2026-08-22。hidetzu/konjaku#148）。
    //
    //   ⚠ 実測（2026-08-21・利用者役 4 名・画面だけを見せた）: 見せ方の 3 案すべてで、
    //     ⚠ **初見の 1 名が「旧水部の意味が分からない」**と答えた。⚠ 配置ではなく語の話。
    //   ⚠ **説明そのものは前からあった。**⚠ 押さないと出ない所（根拠パネル）にあった。
    //
    //   ⚠ **字を書き写さない。**⚠ 画面に出ている区分名を**先に控えてから**、
    //     ⚠ その名前で words.js に引き直して突き合わせる
    //     （掟: 外の答えに依存する部分は、実際に返ってきた値を控えてから判定する）。
    //   ⚠ **原典は消えていないこと**まで見る。⚠ 補助説明は原典の置き換えではない。
    //     ⚠ 押す前は出ておらず、⚠ **押すと全文と出典が出る**。
    //   ⚠ **その大きさで読み込む**（伸縮すると写真が前の高さを保つ。同じ穴を 2 度踏んでいる）。
    //   ⚠ **hasTouch を付ける**（付けないと (hover:none) が効かず 14px ずれる）。
    name: "答えの区分名の意味が、押さずに読める", path: "/", group: "core",
    async check(page) {
      const LF = JSON.parse(await readFile(new URL("../../public/data/landform.json", import.meta.url), "utf8"));
      // ⚠ **判定カードの高さの上限**（Owner 決定 5・2026-08-22）。⚠ 375px のときの値
      const CARD_MAX = 1625;
      const out = [];
      for (const [w, h, place, label] of [
        [375, 667, TOYOSU, "豊洲"], [344, 882, TOYOSU, "豊洲"], [320, 640, TOYOSU, "豊洲"],
        [1280, 800, TOYOSU, "豊洲"],
        // ⚠ **広い区分でも説明が出ること**（詳細版が整備されていない土地）。
        //   ⚠ 例外を作らないと決めたので、⚠ **豊洲だけ見ても足りない**（Owner 決定 4）
        [375, 667, KARUIZAWA, "軽井沢"]]) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          await p2.goto(`${BASE}/?${place}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (e) => { const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom) }; };
            const rows = [...document.querySelectorAll("#verdict .v-head .tx")].map((tx) => {
              const nm = tx.querySelector("b"), gl = tx.querySelector(".gl");
              return { name: nm?.textContent.trim() ?? "", gloss: gl?.textContent.trim() ?? "",
                shown: !!gl && gl.checkVisibility(),
                // ⚠ **区分名の直下**。⚠ 上にあっても横にあっても駄目
                under: !!nm && !!gl && R(gl).t >= R(nm).b, gap: !!nm && !!gl ? R(gl).t - R(nm).b : null,
                dim: gl ? getComputedStyle(gl).color !== getComputedStyle(nm).color : false };
            });
            const d = document.documentElement;
            return { rows, card: Math.round(document.getElementById("verdict").getBoundingClientRect().height),
              text: (document.getElementById("verdict")?.innerText ?? "").replace(/\s+/g, " "),
              over: d.scrollWidth - d.clientWidth };
          });
          must(g.rows.length >= 1, `${w}×${h} ${label}: 答えの行が無い`);
          for (const r of g.rows) {
            must(r.name, `${w}×${h} ${label}: 答えの行に区分名が無い`);
            // ⚠ **字は words.js の 1 か所。**⚠ ここへ書き写さない
            const want = WORDS.groundGloss(r.name);
            must(want, `${w}×${h} ${label}: 「${r.name}」の補助説明を words.js が持っていない`);
            must(r.shown, `${w}×${h} ${label}: 「${r.name}」の補助説明が見えていない（押さないと読めない）`);
            must(r.gloss === want,
              `${w}×${h} ${label}: 補助説明が words.js と違う（画面「${r.gloss}」／words.js「${want}」）`);
            must(r.under && r.gap <= 10,
              `${w}×${h} ${label}: 補助説明が区分名の直下に無い（間 ${r.gap}px）`);
            // ⚠ **答えより弱く。**⚠ 同じ格だと、どちらが答えか分からなくなる
            must(r.dim, `${w}×${h} ${label}: 補助説明が区分名と同じ見た目（どちらが答えか分からない）`);
            // ⚠ **原典は、押す前には出ていない**（18 字に収めた理由がここ）
            const why = LF.classes[r.name]?.why ?? "";
            must(why, `${w}×${h} ${label}: landform.json に「${r.name}」の原典が無い`);
            must(!g.text.includes(why),
              `${w}×${h} ${label}: 押す前の判定カードに原典の全文が出ている（${why.slice(0, 20)}…）`);
          }
          must(g.over <= 0, `${w}×${h} ${label}: 横にあふれている（${g.over}px）`);
          // ⚠ **判定カードは、説明を足したことを理由に伸びない**（Owner 決定 5）
          if (w === 375 && h === 667)
            must(g.card <= CARD_MAX,
              `${w}×${h} ${label}: 判定カードが ${g.card}px（上限 ${CARD_MAX}px）`);

          // ⚠ **原典と出典は失われていない。**⚠ 押すと全文が出る（AC3）
          await p2.click("#whyBtn");
          await p2.waitForSelector("#own .ev", { timeout: 20000 });
          const own = await p2.evaluate(() => ({
            text: (document.getElementById("own")?.innerText ?? "").replace(/\s+/g, " "),
            links: document.querySelectorAll("#own .card[data-k=landform] .ev a").length }));
          const why1 = LF.classes[g.rows[0].name]?.why ?? "";
          must(own.text.includes(why1),
            `${w}×${h} ${label}: 根拠パネルから原典が消えている（${why1.slice(0, 20)}…）`);
          must(own.links >= 1, `${w}×${h} ${label}: 根拠パネルに出典（参照したデータ）が無い`);
          out.push(`${w}×${h} ${label} ${g.rows.map((r) => `${r.name}→「${r.gloss}」`).join("／")}`
            + `（カード ${g.card}px）`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **トップと /peel が、同じ第1層を同じ字で出す**（hidetzu/konjaku#122）。
    //   ⚠ **字を書き写さない。**⚠ **両方を実際に描いて、突き合わせる**（掟）。
    //   ⚠ 以前は トップ「もとは 水だった土地（旧水部）です。いまは …」／
    //     /peel「この土地は 旧水部 ／ 人の手で …」と、⚠ **同じ第1層が画面ごとに違った**
    //     （ADR 0030 §4 の実測）。
    name: "トップと /peel が、同じ土地に同じ答えを出す", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const text = async (url, sel) => {
          const p2 = await ctx.newPage();
          await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          // ⚠ **「判定中…」を除く。**⚠ 除かないと判定中の字を突き合わせてしまう
          await p2.waitForFunction((s) => {
            const t = (document.querySelector(s)?.innerText ?? "").trim();
            return t.length > 3 && !t.includes("判定中");
          }, sel, { timeout: 60000 });
          await settleAfterCondition(p2);
          const t = await p2.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim());
          await p2.close();
          return t;
        };
        const top = await text(`${BASE}/?${TOYOSU}`, ".v-head");
        const peel = await text(`${BASE}/peel?${TOYOSU}`, ".land-g1");
        // ⚠ **主語は同じ。**⚠ words.js の 1 か所から取る（ここへ書き写さない）
        const head = WORDS.ground1Lines("@@", null)[0].split("@@")[0].trim();
        must(top.startsWith(head), `トップの答えが「${head}」で始まっていない: ${top}`);
        must(peel.startsWith(head), `/peel の答えが「${head}」で始まっていない: ${peel}`);
        // ⚠ **区分名まで一致すること。**/peel は第1層だけを出すので、トップの 1 行目と比べる
        const top1 = top.split("\n")[0].trim();
        must(peel === top1 || top.startsWith(peel),
          `トップと /peel で第1層の字が違う: トップ「${top}」／peel「${peel}」`);
        return `トップ「${top}」／/peel「${peel}」`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **トップで取った地形分類を、/peel が取り直さない**（hidetzu/konjaku#121）。
    //   ⚠ **実測（2026-08-20・main = d410455・豊洲・375x667・SW 無効）**:
    //     トップ 2 本 → /peel（トップ経由）でも **もう 2 本**取っていた。
    //   ⚠ **Service Worker を止める。**⚠ 止めるとキャッシュから返らないので、
    //     ⚠ **本当に取りに行った本数**が数えられる（止めないと 0 本に見えて素通りする）。
    //   ⚠ **画面のリンクで遷移する。**⚠ goto で開くと、利用者が通る道と違う。
    name: "トップで取った地形分類を、/peel が取り直さない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        let phase = "top";
        const n = { top: 0, peel: 0 };
        ctx.on("request", (r) => {
          if (/experimental_landformclassification/.test(r.url())) n[phase]++;
        });
        const p2 = await ctx.newPage();
        await p2.goto(`${BASE}/?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(p2);
        await settleAfterCondition(p2);
        must(n.top > 0, "トップが地形分類を 1 本も取っていない（この検査が何も見ていない）");
        phase = "peel";
        const link = await p2.$('a[href*="./peel"]');
        must(!!link, "トップから /peel への導線が無い");
        await link.click();
        await p2.waitForLoadState("load", { timeout: 60000 });
        // ⚠ **答えが出るまで待つ。**⚠ 待たずに数えると、まだ取っていないだけで 0 本になる
        await p2.waitForFunction(() =>
          /この土地は|判定できません|対象範囲外/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        await settleAfterCondition(p2);
        must(n.peel === 0,
          `/peel が地形分類を取り直している（${n.peel} 本。トップで ${n.top} 本取ったあと）`);
        return `トップ ${n.top} 本 → /peel ${n.peel} 本（控えから返っている）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **/peel を直接開いても、土地の答えが出る**（控えが無いところから）。
    //   ⚠ 「トップ → /peel のときだけ動く」実装にしない。
    //   ⚠ **地図と建物が、土地の答えを待たない。**⚠ 待つと、深掘りの主役が遅れる。
    //     ⚠ **時間で測らない**（CI の速さで揺れる）。⚠ **地形分類を落としても建物が出る**、
    //       という形で見る。⚠ こちらのほうが主張が強い（依存が無いことを直接言える）。
    name: "/peel を直接開いても答えが出て、建物は土地の答えを待たない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        // ---- 1. 控えが無いところから直接開く ----
        const p2 = await ctx.newPage();
        let got = 0;
        p2.on("request", (r) => {
          if (/experimental_landformclassification/.test(r.url())) got++;
        });
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
          null, { timeout: 60000 });
        must(got > 0, "控えが無いのに、地形分類を取りに行っていない");
        const txt = await p2.evaluate(() =>
          (document.body.textContent ?? "").replace(/\s+/g, " ").match(/この土地は[^。]{0,40}/)?.[0] ?? "");
        must(txt.length > 6, `直接アクセスで土地の答えが出ていない: 「${txt}」`);
        await p2.close();

        // ---- 2. 地形分類を落としても、建物は出る ----
        const p3 = await ctx.newPage();
        await forbid(p3, LFC_ROUTE);
        await p3.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        const built = await p3.waitForFunction(() => {
          const t = document.body.textContent ?? "";
          return /\d+\s*件|\d+\s*棟|建物/.test(t) ? t.length : false;
        }, null, { timeout: 60000 }).then(() => true).catch(() => false);
        must(built, "地形分類が落ちると、建物まで出なくなる（土地の答えを待っている）");
        await p3.close();
        return `直接アクセスで「${txt.slice(0, 24)}」（地形分類 ${got} 本）／`
          + `地形分類が落ちても建物は出る`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **別の地点で、前の地点の控えを使わない**（キーは小数 5 桁）。
    //   ⚠ ここを間違えると、⚠ **豊洲の答えを渋谷に出す**。掟の一行目より重い事故になる。
    //   ⚠ **答えが違う 2 点を選ぶ**（同じ答えだと、混ざっていても気づけない）。
    name: "別の地点に移ったら、前の地点の答えを使わない", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const say = async (ll, q) => {
          await p2.goto(`${BASE}/peel?q=${q}&ll=${ll}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await p2.waitForFunction(() =>
            /この土地は|判定できません|対象範囲外/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 });
          return p2.evaluate(() => (document.body.textContent ?? "")
            .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "（出ていない）");
        };
        // 豊洲（旧水部）と 皇居のあたり（台地）。⚠ **答えが違う 2 点**
        const a = await say("35.65480,139.79750", "%E8%B1%8A%E6%B4%B2");
        const b = await say("35.68520,139.75280", "%E7%9A%87%E5%B1%85");
        must(a !== b, `別の地点なのに、同じ答えが出ている（どちらも「${a}」）`);
        // 戻ったら、元の答えに戻る（控えが壊れて別物になっていない）
        const a2 = await say("35.65480,139.79750", "%E8%B1%8A%E6%B4%B2");
        must(a2 === a, `戻ったら答えが変わった（${a} → ${a2}）`);
        return `豊洲「${a.slice(0, 20)}」 ／ 皇居「${b.slice(0, 20)}」／戻すと元に戻る`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **壊れた控えがあっても、取りに行って正しく出る。**
    //   ⚠ 版が変わった残り・別のタブが書いた途中・手で書き換えられた、のどれでも同じ。
    //   ⚠ **例外を投げて画面が白くなってはいけない。**
    name: "壊れた控えがあっても、土地の答えが出る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        // ⚠ **開く前に仕込む。**⚠ 同じ生成元でないと sessionStorage に触れない
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        const key = await p2.evaluate(() =>
          KonjakuLand.PREFIX + KonjakuLand.key(139.7975, 35.6548));
        await p2.evaluate((k) => {
          sessionStorage.setItem(k, "{これは壊れている");
        }, key);
        await p2.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ **答えを待ちきる前に、例外が出たらそこで落とす。**
        //   ⚠ 待ちきってから見ると、落ちた理由が「Timeout」になって、
        //     ⚠ **この検査が何を主張していたのか読めない**（2026-08-20 に踏んだ）。
        const shown = await Promise.race([
          p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 }).then(() => true).catch(() => false),
          (async () => { for (let i = 0; i < 120; i++) {
            if (errs.length) return false;
            await p2.waitForTimeout(500);
          } return false; })(),
        ]);
        must(errs.length === 0, `壊れた控えで例外が出た: ${errs.slice(0, 2).join(" / ")}`);
        must(shown, "壊れた控えのあと、答えが出ていない（例外は出ていない）");
        const txt = await p2.evaluate(() => (document.body.textContent ?? "")
          .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "");
        must(txt.length > 6, `壊れた控えのあと、答えが出ていない: 「${txt}」`);
        return `壊れた控えを入れても「${txt.slice(0, 24)}」（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **保存が使えなくても、画面が壊れない**（Safari のプライベート・容量超過・埋め込み枠）。
    //   ⚠ **控えられないだけで、答えは出なければならない。**
    name: "保存が使えなくても、土地の答えが出る", path: "/", group: "core",
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        const p2 = await ctx.newPage();
        const errs = [];
        p2.on("pageerror", (e) => errs.push(e.message));
        // ⚠ **参照そのものが投げる形を見る**（Safari のプライベート・埋め込み枠での遮断）。
        //   ⚠ **メソッドだけが投げる形では足りない。**⚠ 2026-08-20 に踏んだ:
        //     メソッドだけ投げる偽物にしていたら、⚠ **参照を守っている try を外しても緑だった。**
        //   ⚠ **どのスクリプトより先に差し替える**
        await p2.addInitScript(() => {
          Object.defineProperty(window, "sessionStorage", {
            configurable: true,
            get() { throw new Error("保存は使えません"); },
          });
        });
        await p2.goto(`${BASE}/peel?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`,
          { waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ ここも同じ。⚠ **例外が出たら、待ちきる前に落とす**
        const shown = await Promise.race([
          p2.waitForFunction(() => /この土地は/.test(document.body.textContent ?? ""),
            null, { timeout: 60000 }).then(() => true).catch(() => false),
          (async () => { for (let i = 0; i < 120; i++) {
            if (errs.length) return false;
            await p2.waitForTimeout(500);
          } return false; })(),
        ]);
        must(errs.length === 0, `保存が使えないと例外が出る: ${errs.slice(0, 2).join(" / ")}`);
        must(shown, "保存が使えないとき、答えが出ていない（例外は出ていない）");
        const txt = await p2.evaluate(() => (document.body.textContent ?? "")
          .replace(/\s+/g, " ").match(/この土地は[^。]{0,30}/)?.[0] ?? "");
        must(txt.length > 6, `保存が使えないとき、答えが出ていない: 「${txt}」`);
        return `保存の参照そのものが落ちても「${txt.slice(0, 24)}」（例外 0 件）`;
      } finally { await ctx.close(); }
    },
  },

  {
    // ⚠ **プライバシーの 3 段は、場所を送る前に読めること。**
    //   ⚠ 以前は畳んだフッターの中にしかなく、⚠ **利用者役 2/4 が「これは先に見たかった」**。
    //   ⚠ **「見えている」だけでなく「畳まれていない」「画面内」まで見る。**
    //     ⚠ 畳んであると、送る前に読めるとは言えない（それが元の状態だった）。
    //   ⚠ **3 段そろっていること。**1 段でも落ちると、いちばん強い約束だけが残って
    //     「通信していない」と読める（2026-08-15 に直した嘘へ戻る）。
    name: "場所を送る前に、プライバシーの3段が読める", path: "/",
    async check(page) {
      const NEED = [[/URL|アドレス欄/, "載る"],
                    [/(Cloudflare|配信元)[^。]*(届|渡)/, "届く"],
                    [/こちらの記録には[^。]*残りません/, "残らない"]];
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640], [1280, 800]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(
          () => (document.getElementById("privacyShort")?.textContent ?? "").length > 10,
          null, { timeout: 30000 });
        const r = await page.evaluate(() => {
          const e = document.getElementById("privacyShort");
          const b = e.getBoundingClientRect();
          const q = document.querySelector("#q").getBoundingClientRect();
          const d = document.documentElement;
          return { seen: e.checkVisibility(), inView: b.bottom <= innerHeight,
                   y: Math.round(b.top), qy: Math.round(q.top),
                   txt: e.textContent.replace(/\s+/g, " ").trim(),
                   inDetails: !!e.closest("details"),
                   over: d.scrollWidth > d.clientWidth };
        });
        must(r.seen, `${w}px: プライバシーの3段が見えていない`);
        must(r.inView, `${w}px: プライバシーの3段が画面の外にある（y=${r.y}）`);
        must(!r.inDetails, `${w}px: プライバシーの3段が畳んだ中にある（送る前に読めない）`);
        must(r.y > r.qy, `${w}px: 検索欄より上にある（y=${r.y} / #q=${r.qy}）`);
        must(!r.over, `${w}px: 横にあふれている`);
        const miss = NEED.filter(([re]) => !re.test(r.txt)).map(([, n]) => n);
        must(!miss.length, `${w}px: 段が落ちている（${miss.join("・")}）: ${r.txt.slice(0, 60)}`);
        out.push(`${w}: y=${r.y}`);
      }
      // ⚠ **詳しい説明は残っていること**（要約が出たからといって消さない）
      const sums = await page.$$eval("footer summary", (es) => es.map((e) => e.textContent.trim()));
      must(sums.some((t) => /プライバシー/.test(t)),
        `畳んである詳しい説明が消えている: ${sums.join("・")}`);
      // ⚠ **場所を選んだら消える。**送ったあとに残すと「これから送ります」に読める
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${page.url().split("?")[0]}?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`);
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const still = await page.evaluate(() =>
        document.getElementById("privacyShort")?.checkVisibility() ?? false);
      must(!still, "場所を選んだあとも、送る前の案内が出たままになっている");
      return `4 幅すべてで畳まず画面内（${out.join(" / ")}）／3 段そろい／詳しい説明は残る／場所を選ぶと消える`;
    },
  },
  {
    name: "最初の画面が、場所を検索する画面だと5秒で分かる", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // 利用者役のエージェントによる検証で理解まで1分半かかり「グルメ検索? 不動産?」と受け取られていた。
      // 判定できることだけを書く（掟: 根拠のないことは書かない）。埋立の年や「昔は海」は画素から出せないので書かない。
      const head = await page.$eval("header", (e) => e.textContent.replace(/\s+/g, " ").trim());
      // 見出しは効能で名乗る（掟: 看板は効能で名乗る）。「その土地を知る」はカテゴリ名で、
      // 何が起きるかが読んだ人に伝わっていなかった。主題（成り立ち・掟: 主題は「成り立ち」。明治期は手法のひとつ）は変えていない。
      must(/この土地は、昔なんだったのか/.test(head), `見出しが変わっている: ${head.slice(0, 40)}`);
      // ⚠ この検査は以前、header に「成り立ち」と「国土地理院」があることを求めていた。
      //   守っていたのは「何のサービスか分からない」の再発防止だが、そのために
      //   説明が 2 つ（実測 40px）並び、検索欄が y=164 まで下がっていた。
      //   **同じ意図を、こんどは「次に何をすればよいかが 1 文で書いてある」で守る。**
      //   ⚠ 何を読んでいるか（国土地理院）は消していない。下の「出典が残っている」で見る。
      must(/場所を検索して、その土地の時間をさかのぼる。/.test(head),
        `次に何をすればよいかが 1 文で書かれていない: ${head}`);
      // ⚠ **説明の塊は 1 つだけ。** ここが緩むのは「説明をもう 1 行足す」ときなので、
      //   px ではなく個数でも止める（原則5「足す前に隠す」）。
      const blocks = await page.$$eval("header p, header div:not(.brand)", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      must(blocks.length === 1,
        `最初の画面の説明が ${blocks.length} 塊ある（1 文だけにする）: ${blocks.join(" ／ ")}`);
      // ⚠ 判定の手口・データ提供元・Privacy を**入口では語り始めない**。
      //   （tmp/9 の設計: 操作 → 結果 → 説明 → 根拠。トップは「操作」まで）
      for (const w of ["国土地理院", "明治期", "画素", "タイル", "Cookie", "標高", "Wikidata"])
        must(!head.includes(w), `最初の画面が判定の手口を語り始めている: 「${w}」（${head}）`);
      // ⚠ **消したのではなく、後ろへ動かした**ことまで見る。
      //   出典が画面から消えると、地理院タイルの利用条件（出典明示）も破る
      const foot = await page.$eval("footer", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/国土地理院/.test(foot), `出典（国土地理院）が画面から消えた: ${foot.slice(0, 60)}`);
      const h1 = await page.$eval("h1", (e) => {
        const r = e.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), right: Math.round(r.right),
                 over: e.scrollWidth - e.clientWidth };
      });
      must(h1.bottom < 200, `見出しが読める位置に無い: y=${h1.bottom}`);
      // ⚠ 見出しを7文字から15文字に伸ばした。375px 幅で溢れたり切れたりしないことを見る。
      //   placeholder で同じ失敗（可視幅に収まらず「（例: 豊洲）」が切れる）を既にやっている
      must(h1.over <= 0, `見出しが横に溢れている: ${h1.over}px はみ出し`);
      must(h1.right <= 375, `見出しが画面外に出ている: right=${h1.right}`);
      // ⚠ placeholder は**入力欄の可視幅に収まっていること**まで見る。
      // 文言だけ見ていたので、375px 幅で「（例: 豊洲）」が切れて出ていない状態を通していた。
      const ph = await page.$eval("#q", (e) => {
        const cs = getComputedStyle(e);
        const c = document.createElement("canvas").getContext("2d");
        c.font = `${cs.fontSize} ${cs.fontFamily}`;
        return { text: e.placeholder, need: Math.ceil(c.measureText(e.placeholder).width),
                 room: Math.floor(e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
      });
      must(ph.need <= ph.room,
        `placeholder が入力欄に収まらない: ${ph.need}px 必要 / 可視幅 ${ph.room}px「${ph.text}」`);
      // 地名の例は、まだ場所を選んでいないこの画面では見えていること。
      // 「確定後は消す」を入れたので、消しすぎていないことを反対側から押さえる
      await page.waitForSelector("#quick button");
      const q0 = await page.$eval("#quick", (e) => {
        const r = e.getBoundingClientRect();
        return { vis: e.checkVisibility(), y: Math.round(r.y),
          h: Math.round(r.height), bottom: Math.round(r.bottom) };
      });
      must(q0.vis && q0.h > 0 && q0.bottom <= 667,
        `最初の画面で入力例が見えていない: ${JSON.stringify(q0)}`);
      // ⚠ **地名の帯が「例」だと名乗っていること。**
      //   名乗らないと、地名が検索欄と同じ強さの主ボタンとして並んで見える
      //   （実測 10 個・144px。UI/UX レビュー 原則2「主役は1つ」）。
      //   ⚠ 名乗りは「たとえば」。「おすすめ」「人気の場所」にすると、
      //     こちらが選んだ土地を推していることになり、入力例ではなくなる。
      //   ⚠ 見出しは #quick の**中**に作る。外に置くと、取得に失敗したときに
      //     見出しだけが残り、例が 1 つも無いのに「たとえば」と言うことになる。
      const qLead = await page.evaluate(() => {
        const e = document.querySelector("#quick .q-lead");
        if (!e) return null;
        return { text: e.textContent.trim(), tag: e.tagName,
          chips: document.querySelectorAll("#quick button").length,
          focusable: e.tabIndex >= 0 };
      });
      must(qLead, "地名の帯が「例」だと名乗っていない（主ボタンが並んで見える）");
      must(qLead.text === "たとえば", `入力例の名乗りが「たとえば」でない: 「${qLead.text}」`);
      must(qLead.chips === 3, `入力例が 3 件でない: ${qLead.chips} 件`);
      must(qLead.tag !== "BUTTON" && !qLead.focusable,
        `見出しが押せる見た目になっている: ${qLead.tag}（掟: 押しても何も起きない導線を置かない）`);
      // ⚠ **主操作（場所を検索する）が、説明に押し下げられていないこと。**
      //   実測（375×667）: 説明が 2 つ（40px）あったときは y=164。
      //   1 文に畳んで y=138 になっている。ここが緩むのは「説明をもう1行足す」とき。
      const q = await page.$eval("#q", (e) => {
        const r = e.getBoundingClientRect();
        return { y: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      must(q.bottom <= 667, `検索欄がファーストビューの外にいる: 下端 ${q.bottom}px`);
      must(q.y <= 150, `検索欄が説明に押し下げられている: y=${q.y}px（実測の基準は 138px）`);
      // ⚠ H1 → サブコピー → 検索欄 → 入力例。**この順に上から並んでいること。**
      //   px の上限だけだと、順序を入れ替えても通る書き方が残る
      const order = await page.evaluate(() => ["h1", ".lead", "#q", "#quick"]
        .map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
      must(order.every((y, i) => i === 0 || y > order[i - 1]),
        `H1 → 1文 → 検索欄 → 入力例 の順に並んでいない: ${order.join(" → ")}`);
      // ⚠ 「効かないキーの説明を打つ前に出さない」は、ここでは見ない。
      //   375px は @media (hover:none) が .kbd を丸ごと隠すので、**何も見ずに緑になる**。
      //   キーが効く端末（PC 幅）で見る。→「検索（確度が低いので選ばない）」の冒頭。
      // 収まらない説明はフォーカス時の補足へ回す。触れば読めること
      await page.click("#q");
      must(await page.locator(".hint").isVisible(), "入力欄に触れても補足が出ない");
      const hint = (await page.locator(".hint").textContent()).trim();
      return `検索欄 y=${q.y}（実測 164 → 改善）／説明 ${blocks.length} 塊「${blocks[0]}」`
        + `／入力例 ${qLead.chips} 件・下端 ${q0.bottom}px／placeholder ${ph.need}px ≤ ${ph.room}px／補足「${hint}」`;
    },
  },
  // ---- 年代ストリップ ----
  // 帯そのものより、**帯が何を言っていないか**を見る検査。
  // 「1960年代：造成開始」のような中間の主張は空中写真からは出せない（掟: 画素から出せないことは言わない（実測1））。
  // 写真を並べるだけ、という決定が崩れていないことを人の目に頼らず押さえる。
  {
    name: "年代の写真が並ぶ（豊洲）", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => ({
        year: e.querySelector(".yr")?.textContent.trim() ?? "",
        now: e.classList.contains("now"),
        w: e.querySelector("img")?.naturalWidth ?? 0,
        err: !!e.querySelector(".im.err"),
      })));
      must(fr.length >= 4, `年代が並んでいない: ${fr.length} 枚`);
      // ⚠ 判定が「旧水部」と言っているのに、残っている写真はどれも既に陸だった。
      //   判定の根拠になっている明治期のデータを、帯の左端に置いてある
      must(await page.locator("#strip .f.meiji").count() === 1,
        "明治期のコマが帯に無い（判定と、目の前の絵が噛み合わない）");
      must(fr[0].year === "明治期", `左端が明治期でない: ${fr[0].year}`);
      // ⚠ 明治期は空中写真ではない。数に混ぜると「8 回ぶん中 8 回」という嘘になる
      //   （帯には明治期のコマも並ぶので、コマ数をそのまま数えると 1 多くなる）。
      // ⚠ 文言を変えた（2026-08-17）。「N 年代（M 年代中）」は初見の人が通算 3 人とも
      //   「意味が分からない」と答えたのでやめた。⚠ **守っている意図は同じ**:
      //   「この場所に残っている数」が「全部の数」を超えないこと＋分母が出ていること。
      //   ⚠ 以前は `/(\d+)\s*年代（\s*(\d+)/` と**文言に張り付いた正規表現**だったので、
      //     文言を変えた瞬間に「ありうる数を超えている」と**誤った理由で**落ちた。
      const foot = (await page.locator(".strip-foot").textContent()).replace(/\s+/g, " ");
      // 「7回ぶんすべて」／「7回ぶん中 4回」／「残っていません（全7回ぶん中）」の 3 通り
      const all = Number((foot.match(/(\d+)\s*回ぶん/) ?? [])[1]);
      const got = /すべて/.test(foot) ? all
        : /残っていません/.test(foot) ? 0
        : Number((foot.match(/回ぶん中\s*(\d+)\s*回/) ?? [])[1]);
      must(Number.isFinite(all) && all > 0, `分母（全部で何回ぶんか）が出ていない: ${foot.trim()}`);
      must(Number.isFinite(got), `この場所に残っている数が読めない: ${foot.trim()}`);
      must(got <= all, `空中写真の数が、ありうる数を超えている: ${foot.trim()}`);
      // ⚠ **同じ数を 2 回書かない**（「7 年代（7 年代中）」が意味を成さなかった原因）
      must(!new RegExp(`${all}[^0-9]{1,8}${all}`).test(foot),
        `同じ数を 2 回書いている（意味を成さない）: ${foot.trim()}`);
      must(fr.every((f) => f.err || f.w > 0), `写真が復号できていない: ${JSON.stringify(fr)}`);
      must(!fr.some((f) => f.err), `豊洲で読めない写真がある: ${JSON.stringify(fr)}`);
      // 右端は現在。左端は最古。時間の向きが逆だと、この帯は何も語らない
      must(fr[fr.length - 1].now && fr[fr.length - 1].year === "現在",
        `右端が現在でない: ${fr[fr.length - 1].year}`);
      must(/^1936/.test(fr[1].year), `明治期の次が最古の写真でない: ${fr[1].year}`);
      // ⚠ ここが本体。年の表記と「現在」以外の語を、帯の中に置かない。
      //   ここが緩むと「1960年代：造成開始」のような、実測できない作文が入り込む
      const stray = fr.map((f) => f.year).filter((y) => !/^(\d{4}–\d{2}|現在|明治期)$/.test(y));
      must(stray.length === 0, `帯が年代以外のことを言っている: ${stray.join(" / ")}`);
      // 判定した画素の位置に印が出ていること（写真のどこの話かが分かる）
      const marks = await page.locator("#strip .mk").count();
      must(marks === fr.length, `印が枚数と合わない: ${marks} / ${fr.length}`);
      // 帯から先へ行けること。行き先は年代を重ねて見る画面
      // ⚠ 画面に出ている写真が、**判定に使った写真そのもの**であること。
      //   photos() は z16 のこのタイルを読んで年代の有無を決めている。帯が別のズームや
      //   別のタイルを出していたら、根拠と絵が別物になる（それを根拠と呼べなくなる）。
      //   同じ地点・同じ z なら、レイヤ名を除いた /16/x/y の部分は全枚で一致するはず。
      const at = await page.$$eval("#strip img", (els) => els
        .map((e) => (e.getAttribute("src").match(/\/(\d+)\/(\d+)\/(\d+)\.\w+$/) ?? []).slice(1).join("/")));
      must(new Set(at).size === 1, `帯の写真が同じ地点・同じズームでない: ${[...new Set(at)].join(" / ")}`);
      // 写真タイルの実通信。判定のぶんと帯のぶんで同じURLを引くので、重複が出るのは想定内。
      // 「別のタイルまで取りに行き始めた」ときに、この2つの数字が離れる
      const tiles = reqs.filter((u) => /cyberjapandata\.gsi\.go\.jp\/xyz\/(ort_|gazo|seamlessphoto)/.test(u));
      return `${fr.length} 枚（${fr[0].year} 〜 現在）／印 ${marks}／すべて z${at[0].split("/")[0]} の同一タイル`
        + `／写真タイルの要求 ${tiles.length} 件（実URL ${new Set(tiles).size} 種）`;
    },
  },
  {
    name: "写真が1年代しか無い土地でも帯が崩れない", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) =>
        e.querySelector(".yr")?.textContent.trim() ?? ""));
      // 軽井沢は 1974–78 の1年代だけ。無い年代を埋めない
      must(fr.length >= 2, `帯が出ていない: ${JSON.stringify(fr)}`);
      must(fr[fr.length - 1] === "現在", `右端が現在でない: ${JSON.stringify(fr)}`);
      must(!fr.includes("1936–42"), `残っていない年代を並べている: ${JSON.stringify(fr)}`);
      return fr.join(" / ");
    },
  },
  {
    // ⚠ 横スクロールで作ったときに実際に起きていた壊れ方。
    //   375px 幅では4枚目で切れ、いちばん見せたい「現在」が画面の外にいた。
    //   「昔 → 今」を1画面で見せる帯なのに、今が見えないのでは意味が無い。
    name: "スマホ幅でも、現在まで1画面に収まる", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const fr = await page.$$eval("#strip .f", (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { year: e.querySelector(".yr")?.textContent.trim() ?? "",
                 right: Math.round(r.right), bottom: Math.round(r.bottom) };
      }));
      const over = fr.filter((f) => f.right > 375);
      must(over.length === 0,
        `帯が画面からはみ出している: ${over.map((f) => `${f.year}(right=${f.right})`).join(" / ")}`);
      const now = fr[fr.length - 1];
      must(now.year === "現在", `右端（最後）が現在でない: ${now.year}`);
      must(now.bottom <= 667, `現在がファーストビューの外にいる: y=${now.bottom}`);
      // 帯そのものが画面の高さを食いつぶしていないこと（判定文が押し出される）
      const h = await page.$eval("#strip", (e) => Math.round(e.getBoundingClientRect().height));
      must(h <= 220, `帯が高すぎる: ${h}px`);
      // 場所が決まったらサブコピーは畳む（実測 79px。写真と判定文がそのぶん下へ押し出されていた）
      // ⚠ 「場所を検索して…」は、もう場所を選んだ人には前の段の指示。
      //   場所選択中の責務にサービス紹介は無い（tmp/9/10-トップ2状態の詳細設計.md）
      const leads = await page.$$eval(".lead", (els) => els
        .filter((e) => e.getBoundingClientRect().height > 0).length);
      must(leads === 0, `場所を選んだあともサブコピーが残っている: ${leads} 個`);
      // ⚠ 入力例も一緒に消えること。ここで一緒に見ておかないと、
      //   「未選択向けのものが選択後に残る」を 2 か所へ分けて見ることになる
      const qk = await page.$eval("#quick", (e) => ({
        vis: e.checkVisibility(), h: Math.round(e.getBoundingClientRect().height) }));
      must(!qk.vis, `場所を選んだあとも入力例が残っている: 高さ ${qk.h}px`);
      // 判定文が画面内にあること。写真が主役でも、答えの一文は同じ画面で読めること
      const v = await page.$eval("#verdict .v-head", (e) => Math.round(e.getBoundingClientRect().y));
      must(v < 667, `判定文がファーストビューの外にいる: y=${v}`);
      return `${fr.length} 枚が ${Math.ceil(fr.length / fr.filter((f) => f.bottom === fr[0].bottom).length)} 行`
        + `／現在は y=${now.bottom}／帯の高さ ${h}px`;
    },
  },
  {
    name: "通信断のときは年代の写真を並べない", path: `/?${TOYOSU}`,
    setup: (page) => page.route(GSI_ROUTE, (r) => r.abort()),
    async check(page) {
      await waitVerdict(page);
      // 読めていないのに枠だけ並べると、「この年代は写真が無い」に化ける。
      // 出さないことがいちばん正確（掟: 取れなかったを「無い」と言わない）
      must(await page.locator("#strip").count() === 0, "通信断なのに年代の帯が出ている");
      must(await page.locator("#strip .f").count() === 0, "通信断なのに写真の枠が出ている");
      const v = await page.locator("#verdict").textContent();
      must(/読み込めませんでした/.test(v), `読み込めなかったことが書かれていない: ${v.slice(0, 60)}`);
      must(await page.locator("#retryBtn").count() === 1, "再試行が出ていない");
      for (const w of LIES) must(!v.includes(w), `通信断で断定している: 「${w}」`);
      return `帯なし／再試行あり／断定なし`;
    },
  },
  {
    name: "クイック候補の通信断を黙って空にしない", path: "/",
    setup: (page) => page.route("**/data/quick-places.json", (r) => r.abort()),
    async check(page) {
      await page.waitForFunction(() => /候補地を読み込めませんでした/.test(
        document.getElementById("quick")?.textContent ?? ""), null, { timeout: 20000 });
      must(await page.locator("#quick .quick-error").count() === 1, "候補地の失敗表示が無い");
      must(await page.locator("#quick .quick-error button", { hasText: "再試行" }).count() === 1,
        "候補地の再試行が無い");
      return "候補地の失敗を表示／再試行あり";
    },
  },
  // ---- 入口が塞がっていないこと ----
  // ⚠ 実測で見つけた事故。スマホ幅で **1タップ目が必ず空振り**していた。
  //   入力欄がフォーカスを失うと補足文（.hint）が消え、下にあるものが 42px 上へずれる。
  //   指を離す前にレイアウトが動くので、押した座標には別の要素が来ている。
  //   見せ方をどれだけ磨いても、ここが塞がっていると誰も判定に到達できない。
  {
    // ⚠ **主題はタップが届くか**（2026-08-22。hidetzu/konjaku#191）。⚠ **絵が届くかではない。**
    //   ⚠ **実測**: 外へ 46 本のうち ⚠ **絵が 33 本**（空中写真 29 ／ 下地 4）。
    //   ⚠ **判定の材料（低湿地・地形分類 12 本）と住所検索 1 本は、⚠ 本物のまま。**
    //   ⚠ **材料を偽ると、⚠ 答えが変わる。**⚠ **絵だけ差し替える。**
    name: "スマホで、最初の1タップが空振りしない", dep: "search", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true, setup: stubMapPictures,
    async check(page) {
      // (1) クイック選択（地名の例）
      await page.waitForSelector("#quick button");
      const chip = page.locator("#quick button", { hasText: "豊洲" });
      await page.click("#q");                       // 利用者と同じ順序で、まず入力欄に触れる
      await page.waitForTimeout(150);
      const before = await chip.boundingBox();
      await chip.tap();                             // ここが1タップ目
      await waitVerdict(page);
      const after = await page.locator("#scope").boundingBox();
      must((await page.locator("#chipName").textContent()).trim().length > 0,
        "クイック選択の1タップ目が空振りしている");

      // (2) 検索候補。まっさらな状態から始めるため、入口に戻ってやり直す
      await page.goto(new URL("/", page.url()).href, { waitUntil: "domcontentloaded" });
      await page.click("#q");
      await page.fill("#q", "豊洲");
      await page.waitForSelector("#list .it", { timeout: 20000 });
      await page.waitForTimeout(400);
      const row = page.locator("#list .it").first();
      const y0 = Math.round((await row.boundingBox()).y);
      await row.tap();                              // ここが1タップ目
      await page.waitForTimeout(900);
      const picked = (await page.locator("#chipName").textContent()).trim();
      const y1 = Math.round((await page.locator("#list .it").first().boundingBox().catch(() => null))?.y ?? y0);
      must(picked.length > 0, `検索候補の1タップ目が空振りしている（y=${y0}→${y1}）`);

      return `クイック選択・検索候補とも1タップ目で通る（選択: ${picked}）`
        + `／チップ y=${Math.round(before.y)}・検索欄 y=${Math.round(after.y)}`;
    },
  },
  {
    // ⚠ 帯の8枚が全部同じURLで、押した年代が捨てられていた。
    //   「1987–90」を押しても着地は必ず 1936–42。押した絵と着いた絵が違う。
    // ⚠ 帯は「表示」から「操作」になった。押した年代がその場で大きくなること、
    //   着いたときに最古から始まること（看板の問いに写真で即答している状態）を見る。
    name: "帯を押すと、その年代が大きくなる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      const read = () => page.evaluate(() => ({
        on: [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")),
        pressed: [...document.querySelectorAll("#strip .f")]
          .filter((e) => e.getAttribute("aria-pressed") === "true").length,
        year: document.getElementById("yrBig")?.textContent.trim() ?? "",
        src: document.querySelector("#big .lyr.on .t")?.getAttribute("src") ?? "",
        years: [...document.querySelectorAll("#strip .yr")].map((e) => e.textContent.trim()),
      }));

      const a = await read();
      must(a.on === 0, `着いたときに左端（明治期）が選ばれていない: ${a.on} 番目`);
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      must(a.pressed === 1, `選択状態が1つでない: ${a.pressed}`);
      must(a.year.includes(a.years[0]), `大きい写真の年代が帯と食い違う: 「${a.year}」/「${a.years[0]}」`);

      // 4枚目を押す
      const i = 4;
      await page.locator("#strip .f").nth(i).click();
      await settleAfterClick(page);
      const b = await read();
      must(b.on === i, `押した年代が選ばれていない: ${b.on} 番目`);
      // 1枚だと狭すぎて「この時点までにできていたもの」がほぼ空になる（実測 豊洲2件・浦安0件）
      must(await page.locator("#big .lyr.on .t").count() === 4,
        `写真の年代が 2×2 で組まれていない: ${await page.locator("#big .lyr.on .t").count()} 枚`);
      must(b.pressed === 1, `選択状態が1つでない: ${b.pressed}`);
      must(b.src !== a.src, `写真が切り替わっていない: ${b.src}`);
      must(b.year.includes(b.years[i]), `年代の見出しが押した年代でない: 「${b.year}」/「${b.years[i]}」`);
      // ⚠ 枚数で待たない。明治期のコマは下地を敷くので 8枚、写真は 4枚。
      //   しかも低湿地は範囲外のタイルが 404 になりうる（データが無いところは無い）。
      //   「全部が決着して、1枚以上は描けている」で待つ。
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length >= 4 && t.every((e) => e.complete)
          && t.some((e) => e.naturalWidth > 0);
      }, null, { timeout: 30000 });

      // ⚠ 別ページへ渡す行はもう無い（/eras を撤去した）。年代の切り替えはこの画面で完結する
      must(await page.locator('#list a[href*="eras"]').count() === 0,
        "撤去した /eras への導線が残っている");
      return `最古から始まり、4枚目を押して「${b.year.replace(/\s+/g, " ")}」に切り替わる`;
    },
  },
  // ---- eras が、無いものを有ると言わないこと ----
  // ⚠ 利用者役のエージェントに触らせて見つけた。どちらも 掟: 取れなかったを「無い」と言わない の中核違反で、
  //   しかも「取れなかった」ではなく「**そもそも存在しない**」を有ると言う側の壊れ方。
  // ---- 時間を動かした回数を数えていること ----
  // ⚠ 「使われなければ後で消す」は、数える手段が無いと"後で"が永久に来ない。
  //   分母が無いまま期間だけ決めても、共有率は評価できない。
  {
    name: "年代を動かしたことを、1回だけ数える", path: `/?${TOYOSU}`,
    async check(page) {
      const ticks = [];
      page.__ticks = ticks;
      await page.route("**/t", (r) => { ticks.push(r.request().postData()); r.fulfill({ status: 204 }); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      await waitStrip(page);
      const before = ticks.filter((t) => t === "era.moved").length;
      must(before === 0, `帯に触る前から数えている: ${before} 回`);

      // ⚠ 何回動かしても **1件**。動かすたびに送っていた頃は、帯を全部たどるだけで
      //   8件書き込んでいた。知りたいのは「触られたか」なので1回で足りる。
      for (const i of [2, 5, 3, 6]) {
        await page.locator("#strip .f").nth(i).click();
        await page.waitForTimeout(350);
      }
      const moved = ticks.filter((t) => t === "era.moved").length;
      must(moved === 1, `年代を4回動かしたのに ${moved} 件送っている（1件のはず）`);

      // 場所が変われば、また1件だけ数える
      await page.goto(new URL("/?ll=35.69560,139.82270&q=%E4%BA%80%E6%88%B8", page.url()).href,
        { waitUntil: "domcontentloaded" });
      await waitVerdict(page);
      await waitStrip(page);
      await page.locator("#strip .f").nth(2).click();
      await settleAfterClick(page);
      const moved2 = ticks.filter((t) => t === "era.moved").length;
      must(moved2 === 2, `場所を変えても数え直していない: ${moved2} 件`);

      // ⚠ 3D を開いたことを数えるのは peel.html 側。以前はこの導線で数えていたが、
      //   共有された URL を踏んだ人が計測から消えていた。両方で数えると、
      //   導線から来た人だけ 2 回になる。ここで見たいのは「**合計で 1 回**」。
      //   ⚠ 修飾キー付きの click は使わない。macOS では新しいタブで開いて遷移せず、
      //     Linux では遷移する。**同じ検査が OS で別のものを測っていた**（CI で発覚）。
      //     普通に押して遷移させれば、どちらでも同じものを測れる。
      await page.locator('#verdict a[href^="./peel"]').first().click();
      await page.waitForURL(/\/peel/, { timeout: 15000 });
      await page.waitForTimeout(1200);
      const opened = ticks.filter((t) => t === "open.peel").length;
      must(opened === 1, `3D を開いたのに ${opened} 回数えている（導線と peel.html で二重、`
        + "または peel.html が数えていない)");

      // ⚠ 送っているのは固定文字列だけ。地名も座標も混ぜない
      const leaked = ticks.filter((t) => /豊洲|35\.|139\.|%E8%B1%8A/.test(t ?? ""));
      must(leaked.length === 0, `計測に地名か座標が混ざっている: ${leaked.join(" / ")}`);
      return `era.moved ${moved} 回（3回押して切り替わったのは2回）／導線から開いて open.peel ${opened} 回／地名・座標なし`;
    },
  },
  // ---- この写真の範囲に、その時点までにできていたもの ----
  // ⚠ 言っているのは「開業年 ≤ 撮影年なら、撮影時に存在していた」だけ。
  //   ここが「その年のニュース」に化けると、konjaku が回避するために作られたものになる。
  {
    name: "写真の年より後にできたものを出さない", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(11, "旧・○○倉庫", 1930, 1971, 139.7975, 35.6552),
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○タワー", 2006, null, 139.7986, 35.6541),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });

      const read = () => page.evaluate(() => ({
        head: document.querySelector(".ev-h")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        years: [...document.querySelectorAll(".ev-y")].map((e) => Number(e.textContent.trim())),
        note: document.querySelector(".ev-note")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        src: document.querySelector(".ev-src")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        pins: document.querySelectorAll("#pins .pin").length,
        year: document.getElementById("yrBig")?.textContent.trim() ?? "",
      }));

      await photoFrames(page).first().click();
      await settleAfterClick(page);
      const oldest = await read();
      // 1936–42 の写真のとき、1936年より後にできたものを並べていないこと
      const y0 = Number((oldest.year.match(/(\d{4})/) ?? [])[1]);
      must(Number.isFinite(y0), `年代が読めない: ${oldest.year}`);
      must(oldest.years.every((y) => y <= y0),
        `写真(${y0}年)より後のものを出している: ${oldest.years.filter((y) => y > y0).join(",")}`);
      if (oldest.years.length) {
        must(/出典|Wikidata/.test(oldest.src), "出典が書かれていない");
        must(/写っている/.test(oldest.src) === false || /確かめていません/.test(oldest.src),
          `「写っている」と断定している: ${oldest.src}`);
      } else {
        must(oldest.note.length > 0, "0件のときに何も言っていない");
      }

      // ⚠ 「その時点で無くなっていたもの」は出さない。
      //   実測で、渋谷城（16世紀に廃城）・並木橋駅（1945年廃止）・東急百貨店東横店（2020年解体）を
      //   「いまこの範囲にあるもの」に出していた。「開業年 ≤ 撮影年なら存在していた」は
      //   過去にしか効かない含意で、現在について言うには使えない。
      await page.locator("#strip .f").last().click();
      await settleAfterClick(page);
      const now = await read();
      // 選んだ年に近いものから並ぶこと（古い順に切ると、密な土地では帯を動かしても中身が変わらない）
      const desc = now.years.every((y, i, a) => i === 0 || a[i - 1] >= y);
      must(desc, `選んだ年に近い順に並んでいない: ${now.years.join(",")}`);
      // ⚠ 一覧に出したものには、必ず印がある。
      //   写真は 2×2 の正方形で枠は 4:3。上下が隠れているだけのものを打たないでいると、
      //   一覧にあるのに押しても何も起きない行になる（実測: 亀戸「1925 江東区立水神小学校」）
      must(now.pins === now.years.length,
        `一覧と印の数が違う: 一覧 ${now.years.length} / 印 ${now.pins}`);

      // 押すと写真の位置へ寄り、戻せること（寄ったまま戻れない、を作らない）
      if (now.years.length) {
        // ⚠ **どの行を押しても**効くこと。枠の外にあるものは真ん中へ寄せてから拡大する。
        //   以前は枠の外なら黙って return していて、押せない行が混ざっていた。
        const rows = await page.locator(".ev-it").count();
        for (const i of [0, rows - 1]) {
          await page.locator(".ev-it").nth(i).click();
          // ⚠ 固定待ちにしない。寄せるのは地図に一本化したので、初回は地図の読み込みを挟む。
          //   手元では即座に終わるが、CI では 500ms では足りず、ここだけが落ちた。
          await page.waitForFunction(() => document.querySelector("#big.zoom"),
            null, { timeout: 60000 }).catch(() => {});
          must(await page.locator("#big.zoom").count() === 1,
            `${i + 1}行目を押しても写真が寄らない（全${rows}行）`);
          const zoomed = await page.evaluate(() => ({
            tf: document.getElementById("bigIn")?.style.transform ?? "",
            map: !!document.querySelector("#big.map-on") }));
          must(/scale\(/.test(zoomed.tf) || zoomed.map,
            `寄っていない（写真も地図も動いていない）: ${JSON.stringify(zoomed)}`);
          await page.click("#unzoom");
          await page.waitForTimeout(300);
        }
        await page.locator(".ev-it").first().click();
        await page.waitForFunction(() => document.querySelector("#big.zoom"),
          null, { timeout: 60000 }).catch(() => {});
        must(await page.locator("#big.zoom").count() === 1, "押しても写真が寄らない");
        must(await page.locator("#unzoom").isVisible(), "寄ったあとに戻す手段が出ていない");
        await page.click("#unzoom");
        await page.waitForFunction(() => !document.querySelector("#big.zoom"),
          null, { timeout: 20000 }).catch(() => {});
        must(await page.locator("#big.zoom").count() === 0, "戻すを押しても寄ったまま");
      }
      return `1936年まで ${oldest.years.length} 件（${oldest.years.slice(0, 3).join(",")}）`
        + ` → 現在 ${now.years.length} 件／印 ${now.pins}／寄って戻せる`;
    },
  },
  {
    // Wikidata は止まりうる依存（掟: 外部APIは「止まりうる依存」として扱う）。落ちたときに「無い」と言わないこと
    name: "Wikidata が落ちても「無い」と言わない", path: `/?${TOYOSU}`,
    // ⚠ 取り込み済みの索引も外す。静的で答えられてしまうと、落ちた場合を見られない
    setup: (page) => Promise.all([
      page.route("**/data/ev/**", (r) => r.fulfill({ status: 404, body: "" })),
      page.route("**://query.wikidata.org/**", (r) => r.abort()),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      await page.waitForSelector(".ev-note.warn", { timeout: 40000 });
      const note = (await page.locator(".ev-note.warn").textContent()).replace(/\s+/g, " ").trim();
      for (const w of LIES) must(!note.includes(w), `断定している: 「${w}」`);
      must(/読み込めませんでした/.test(note), `読み込めなかったことを言っていない: ${note}`);
      must(/分かっていません/.test(note), `「無い」と読める書き方になっている: ${note}`);
      must(await page.locator("#evRetry").count() === 1, "再試行が出ていない");
      // 判定そのものは、Wikidata が落ちても成立していること
      const v = await page.locator("#verdict").textContent();
      must(/旧水部|盛土地/.test(v), `判定まで巻き添えになっている: ${v.slice(0, 60)}`);
      must(await page.locator("#big .lyr.on .t").count() === 4, "写真まで出なくなっている");
      return `「${note.slice(0, 46)}…」／再試行あり／判定と写真は無事`;
    },
  },
  // ---- 寄ると、地図として本当に近づく ----
  // ⚠ 静止した写真を拡大するだけでは、寄っても何も見えない（z16 を引き伸ばすだけ）。
  //   寄せるのは地図に一本化した。地図なら、その縮尺のタイルを取りに行くので実際に近づける。
  //   枠の端にあるものも中心に置けるので、押しても見えない行が生まれない。
  {
    name: "寄ると、地図として本当に近づく", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, [
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○タワー", 2001, null, 139.7986, 35.6541),   // 現在の差分に入るもの
    ]),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      await page.locator("#strip .f").last().click();
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 30000 }).catch(() => {});
      must(await page.locator(".ev-it").count() > 0, "一覧が出ていない");

      const deep = () => reqs.filter((u) =>
        /cyberjapandata\.gsi\.go\.jp\/xyz\/\w+\/(1[7-9])\//.test(u)).length;
      must(deep() === 0, `寄る前から高いズームのタイルを取っている: ${deep()} 件`);

      await page.locator(".ev-it").first().click();
      await page.waitForFunction(() => document.querySelector("#big.map-on")
        || document.querySelector("#big.map-loading"), null, { timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      // ⚠ 固定待ちにしない。タイルの取得は回線しだいで、CI では間に合わないことがある。
      //   以前ここに `waitForFunction(() => true)` があったが、これは即座に真になる
      //   **待っているふりの no-op** だった（2026-08-14 検証者の指摘）。下の繰り返しが本体。
      for (let i = 0; i < 40 && deep() === 0; i++) await page.waitForTimeout(500);
      must(deep() > 0, `寄っても高いズームのタイルを取りに行っていない: ${deep()} 件`);

      // 押したものが画面の中心近くに来ていること（端に貼り付いたままにしない）
      const off = await page.evaluate(() => {
        const b = document.getElementById("big").getBoundingClientRect();
        const p = document.querySelector("#map .pin");
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { dx: Math.abs((r.x + r.width / 2) - (b.x + b.width / 2)),
                 dy: Math.abs((r.y + r.height / 2) - (b.y + b.height / 2)), w: Math.round(b.width) };
      });
      must(off && off.dx < off.w * 0.25 && off.dy < off.w * 0.25,
        `押したものが中心に来ていない: ${JSON.stringify(off)}`);

      await page.click("#unzoom");
      await page.waitForFunction(() => !document.querySelector("#big.zoom"),
        null, { timeout: 20000 }).catch(() => {});
      must(await page.locator("#big.zoom").count() === 0, "全体に戻せない");
      return `寄る前 0 件 → 寄ると高ズーム ${deep()} 件／中心からのずれ ${Math.round(off.dx)}px`;
    },
  },
  {
    // ⚠ 実測で見つけた誤り。渋谷は「無くなったもの」が多く、ここが崩れると必ず出る
    name: "無くなったものを「ある」と言わない／年代で中身が変わる", path: "/?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7",
    setup: (page) => stubWikidata(page, WD_SHIBUYA(139.70160, 35.65860)),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const rowsOf = () => page.$$eval(".ev-row", (els) => els.map((e) => ({
        label: e.querySelector(".ev-l")?.textContent.trim() ?? "",
        gone: e.classList.contains("gone"),
        year: e.querySelector(".ev-y")?.textContent.trim() ?? "",
        src: !!e.querySelector(".ev-u") })));

      await page.locator("#strip .f").last().click();      // 現在（1987–90 → いま）
      // ⚠ 固定待ちにしない。混んでいるときだけ落ちる検査は、いずれ無視される
      //   （正しい実装でも3ケースすべて失敗することを確認済み）
      await page.waitForFunction(() => document.querySelectorAll(".ev-row").length > 0,
        null, { timeout: 20000 }).catch(() => {});
      const now = await rowsOf();
      const label = (t) => now.find((r) => r.label === t);
      // ⚠ 無くなったものを、できたものと同じ顔で並べない。
      //   2020年に解体された東横店は「この間に無くなった」であって「いまある」ではない
      must(label("東急百貨店東横店")?.gone === true,
        `解体されたものが「無くなった」になっていない: ${JSON.stringify(now)}`);
      must(label("東急百貨店東横店")?.year === "2020",
        "無くなったものに、無くなった年が出ていない");
      // この期間の外で消えたものは、そもそも出てこない
      must(!label("渋谷城") && !label("並木橋駅"),
        `期間の外のものが混ざっている: ${now.map((r) => r.label).join("・")}`);
      must(label("セルリアンタワー") && !label("セルリアンタワー").gone,
        "この期間にできたものが出ていない");
      // ⚠ 出典は項目ごとに出す。source_url を必須にしておきながら、画面に出していなかった
      must(now.every((r) => r.src), `出典リンクの無い行がある: ${
        now.filter((r) => !r.src).map((r) => r.label).join("・")}`);

      // 一方、その年代には在ったものは、過去の年代でちゃんと出ること
      await photoFrames(page).first().click();              // 1936–42
      await settleAfterClick(page);
      const old1936 = await page.$$eval(".ev-it .ev-l", (els) => els.map((e) => e.textContent.trim()));
      // 1936年には在った（1885 渋谷駅 / 1927 並木橋駅 / 1934 東横店）。1092 渋谷城は 1524 で消えている
      must(old1936.includes("並木橋駅") && old1936.includes("東急百貨店東横店"),
        `その年代に在ったものを消しすぎ: ${old1936.join("・")}`);
      must(!old1936.includes("渋谷城"), "1524年に無くなったものを 1936年に出している");
      must(old1936[0] === "東急百貨店東横店", `並び順が違う: ${old1936.join("・")}`);
      // 「(看板)」は写真では確かめようがない。出さない
      must(!old1936.some((t) => /看板/.test(t)), `看板が混ざっている: ${old1936.join("・")}`);

      // ⚠ 年代を動かすと、中身が入れ替わること（目録なら8段すべて同じになる）
      await photoFrames(page).nth(1).click();               // 1936–42 → 1945–50
      await settleAfterClick(page);
      const mid = await rowsOf();
      must(mid.some((r) => r.label === "並木橋駅" && r.gone),
        `1945年に廃止された駅が「無くなった」として出ていない: ${JSON.stringify(mid)}`);
      must(JSON.stringify(mid.map((r) => r.label)) !== JSON.stringify(old1936),
        "年代を動かしても一覧が変わらない（差分になっていない）");
      const head = (await page.locator(".ev-h").textContent()).replace(/\s+/g, " ").trim();
      must(/→/.test(head), `いつからいつまでの話か書かれていない: ${head}`);
      return `現在 ${now.map((r) => r.label + (r.gone ? "(無)" : "")).join("・")}`
        + `／1936年 ${old1936.join("・")}／1945–50 ${mid.map((r) => r.label).join("・")}`;
    },
  },
  // ---- 押しても何も起きないものを無くす／本命を埋もれさせない ----
  // ⚠ すべて利用者役のエージェントの実測から。押せそうに見えて無反応なものは、
  //   「押しても何も起きない導線を置かない」（掟: 取れなかったを「無い」と言わない）に真っ向から反する。
  {
    name: "押せそうなものは、押すと何かが起きる", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);

      // (1) ☆ を押したら、記録のパネルが**見えるところ**に出ること
      await page.click("#mineToggle");
      // ⚠ 押すと記録のパネルへ寄る（index.html の scrollToEl）。⚠ **寄り終わるまで待つ**
      await settleAfterScroll(page);
      const mine = await page.$eval("#mine", (e) => {
        const r = e.getBoundingClientRect();
        return { y: Math.round(r.y), h: Math.round(r.height), inView: r.y < innerHeight && r.bottom > 0 };
      });
      must(mine.h > 0 && mine.inView,
        `☆を押しても、記録のパネルが画面の外にいる: ${JSON.stringify(mine)}`);
      await page.click("#mineToggle");

      // (2) バッジを押したら、根拠が開いて、その事実のところへ行くこと
      must(!(await page.locator("#result").isVisible()), "根拠が既定で開いている");
      const badges = await page.locator("#verdict .badge").count();
      must(badges >= 2, `バッジが出ていない: ${badges}`);
      const key = await page.locator("#verdict .badge").first().getAttribute("data-k");
      await page.locator("#verdict .badge").first().click();
      await page.waitForSelector("#own .ev", { timeout: 30000 });
      must(await page.locator("#result").isVisible(), "バッジを押しても根拠が開かない");
      if (key) must(await page.locator(`#own .card[data-k="${key}"]`).count() === 1,
        `バッジに対応する根拠のカードが無い: ${key}`);
      await page.click("#closeWhy");
      await page.waitForTimeout(300);

      // (3) 打っていないときに、店のカテゴリを並べない（本命が埋もれる）
      const rows = await rowsOf(page);
      const shops = rows.filter(([, label]) => /ごはん|ラーメン|カフェ|居酒屋|スーパー|コンビニ/.test(label));
      must(shops.length === 0, `打っていないのに店が並んでいる: ${shops.map((r) => r[1]).join("・")}`);
      // ただし打てば出る（ランチャーとしての機能は失っていない）
      await page.fill("#q", "ラーメン");
      await page.waitForTimeout(400);
      const typed = await rowsOf(page);
      must(typed.some(([, label]) => /ラーメン/.test(label)), "打っても店が出てこない");
      await page.fill("#q", "");
      await page.waitForTimeout(400);

      // (4) 本命（3D）が、外部リンクと同じ顔で埋もれていないこと
      // ⚠ **2026-08-21 に、⚠ 深掘りは判定カードの中へ移った**（⚠ 一覧ではない）
      const peel = await page.evaluate(() => {
        const el = [...document.querySelectorAll("#verdict .peel-cta")]
          // ⚠ 語で探さない。名乗りは実装に合わせて変わる
          //   （「時間をさかのぼる（3D）」→「立体で見る」→「この場所を深掘り」）。
          //   この検査が見たいのは「本命の行が埋もれていないか」なので、行き先で探す
          .find((e) => (e.getAttribute("href") ?? "").startsWith("./peel"));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        // ⚠ **外部へ渡すだけの行と同じ顔にしない。**⚠ 枠と地色を持っていること
        //   （⚠ 実測: 本命が「ごはん / ラーメン」と同じ見た目のせいで、
        //     ⚠ **一覧全体が「リンク集」に見え、2 画面下まで気づかれていなかった**）。
        const cs = getComputedStyle(el);
        return { y: Math.round(r.y + scrollY), h: Math.round(r.height),
                 inCard: !!el.closest("#verdict"),
                 dressed: cs.borderTopWidth !== "0px"
                   && cs.backgroundColor !== "rgba(0, 0, 0, 0)" };
      });
      must(peel, "深掘りの導線が見つからない");
      must(peel.inCard, "深掘りの導線が判定カードの外にある");
      must(peel.dressed, "本命が、外部へ渡すだけの行と同じ見た目になっている（枠も地色も無い）");
      // ⚠ **絶対の px で見ない。** 手元 1040 / CI 1050 と**環境で 10px 動く**
      //   （CI は apt でフォントを入れるので文字の寸法が違う。同じ理由で過去に
      //    「行を押すと寄った結果が画面に入る」が 2 回とも同じ値で落ちている）。
      //   1043 という境目に 3px の余裕しか無く、環境差に耐えていなかった（2026-08-17 に CI で落ちた）。
      // ⚠ **守りたいのは「本命が埋もれていないこと」。** それを、上にあるものとの関係で見る:
      //   本命の上にあるのは「写真＋判定＋面の内訳」で、そこから**1画面ぶん以上離れていない**こと。
      //   ⚠ 絶対値でないので、写真の高さが変わってもフォントが変わっても意味が保たれる。
      const above = await page.evaluate(() => {
        const a = document.getElementById("area") ?? document.querySelector("#verdict .v-head");
        return a ? Math.round(a.getBoundingClientRect().bottom + scrollY) : null;
      });
      must(above, "判定ブロックが見つからない（この検査が何も見ていない）");
      const gap = peel.y - above;
      must(gap < 667, `本命が、判定の下から 1 画面ぶん以上離れている: ${gap}px（上端 ${above} / 本命 ${peel.y}）`);
      // ⚠ 上限も残す。1 画面ぶんの条件だけだと、判定ブロックごと下へ伸びても通ってしまう
      // ⚠ **1200 → 1260 へ上げた（2026-08-17）。** 上げた理由を残す。上げっぱなしにしない。
      //   判定ブロックに、この日 146px を足した。すべてオーナーが決めたもの:
      //     年代の見出しを写真の外へ +44px（写真の 29% を札が覆っていた）
      //     共有する／なぜそう言える？ を独立した行へ +51px（答えの一文を 3 行に割っていた）
      //     明治期の土地を重ねる を写真の外へ +49px（国土地理院の帰属表示に重なっていた）
      //     昔の写真 N回ぶん の間隔 +12px（上の枠と 3px 重なっていた）
      //   ⚠ **本当の見張りは上の隔たり（判定の下から 0px）のほう。** ここは背番号。
      //   ⚠ 次にこの数字を上げるときも、何を足したから上げるのかを書くこと。
      //     書けないなら、それは足しすぎ。
      // ⚠ **2026-08-21 に 1260 → 800 へ下げた。**⚠ 上げっぱなしにしない、の逆をやる。
      //   ⚠ 深掘りを判定カードの中（重ねるの下）へ移したので、⚠ **実測 y651**（豊洲・375）。
      //   ⚠ **下げた理由**: ⚠ この上限は「埋もれていないこと」の背番号で、⚠ 実態から離すと
      //     ⚠ **また埋もれても気づけない。**⚠ 環境差（約 +10px）と土地差を見て 800 にした。
      must(peel.y < 800, `本命が埋もれている: y=${peel.y}（実測 豊洲 375px で 651。上限 800）`);
      return `☆は y=${mine.y} に開く／バッジ ${badges} 個から根拠へ／店は打つまで出ない／`
        + `深掘りは y=${peel.y}（判定の下から ${gap}px。環境で 10px 動くので相対で見る）`;
    },
  },
  // ---- この年代を聞く ----
  // ⚠ 読み上げるのは、画面に出ているのと同じ文だけ。
  //   「1964年。このころ、この周辺には……」は書けない（掟: 画素から出せないことは言わない）。
  //   聞いている人は文字を追えないので、**画面より多くのことを言わない**のが特に重要。
  {
    name: "読み上げは、画面より多くのことを言わない", path: `/?${TOYOSU}`,
    // ⚠ 「無くなったもの」を必ず1件入れる。入れていなかったせいで、
    //   画面が「2020 ○○（取り消し線）［無くなった］」と出しているのに
    //   読み上げが「1934年、○○。」と言う、という食い違いを見逃す状態だった
    //   （2026-08-14 検証者の指摘）。§9 で kind を種類に変えるとき、
    //   読み上げだけが8つの読み手のうち無防備になる。
    setup: (page) => stubWikidata(page, [
      wdItem(12, "○○小学校", 1947, null, 139.7981, 35.6545),
      wdItem(13, "○○公園", 1978, null, 139.7969, 35.6556),
      wdItem(14, "○○百貨店", 1934, 2020, 139.7975, 35.6549),
    ]),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      // 実際に喋らせず、渡される文だけを取る（音は環境依存なので、内容を見る）
      const said = await page.evaluate(() => new Promise((res) => {
        const orig = speechSynthesis.speak.bind(speechSynthesis);
        speechSynthesis.speak = (u) => { res(u.text); };
        document.getElementById("sayBtn").click();
        setTimeout(() => res(""), 3000);
      }));
      must(said.length > 0, "🔊 を押しても、読み上げる文が作られていない");
      // ⚠ 計測の無い機能を増やさない（era.moved / open.peel と同じ扱いにする）
      must(await page.evaluate(() => !!window.KonjakuShare), "計測の入口が無い");

      // 画面に出ている文だけでできていること
      // ⚠ **答えの行と、その下の補助説明を別々に取る**（2026-08-22。hidetzu/konjaku#148）。
      //   ⚠ **画面は行で割れており、声は「。」で区切る。**⚠ 地の文どうしを比べると、
      //     ⚠ **区切りの有無だけで落ちる**（実際にそれで落とした）。
      //   ⚠ **答えの行は 2 つある**（成因と人工改変）。⚠ **1 つ目だけ見ていた。**
      const shown = await page.evaluate(() => ({
        verdict: [...document.querySelectorAll("#verdict .v-head .tx")].flatMap((tx) => {
          const g = tx.querySelector(".gl")?.textContent.trim() ?? "";
          const line = (g ? tx.textContent.replace(g, "") : tx.textContent).trim();
          return g ? [line, g] : [line];
        }),
        era: document.getElementById("yrBig")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        rows: [...document.querySelectorAll(".ev-it .ev-l")].map((e) => e.textContent.trim()),
      }));
      must(shown.verdict.length >= 1, "答えの行が取れていない（この検査が何も見ていない）");
      // ⚠ **画面に出したものは、声も読む。**⚠ 見える人と聞く人で内容を変えない
      for (const v of shown.verdict)
        must(said.includes(v), `画面に出ている答えを読んでいない: 「${v}」／声「${said}」`);
      for (const r of shown.rows.slice(0, 3))
        must(said.includes(r), `画面に出ている行を読んでいない: ${r}`);
      // ⚠ 無くなったものは、無くなったと読むこと。
      //   画面が取り消し線で「無くなった」と出しているのに、声が「できた」と言わない
      if (shown.rows.includes("○○百貨店"))
        must(/○○百貨店が無くなり/.test(said) || /2020年に、○○百貨店/.test(said),
          `画面は「無くなった」なのに、声がそう言っていない: 「${said}」`);
      // ⚠ 画面に無いものを喋らない。作文の混入をここで止める
      const invented = ["このころ", "でしょう", "と思われ", "だったようです", "栄え", "賑わ"];
      for (const w of invented) must(!said.includes(w), `作文が混ざっている: 「${w}」`);

      // 端末の中で合成していることを、画面にも書いてあること。
      // ⚠ 置き場所は footer の .f-priv（プライバシーの話は1か所にまとめた）。
      //   以前は帯の下にもあり、同じ主題が2か所にあった（2026-08-14）。
      // ⚠ 畳んだ details の中でもよい（textContent は畳んでいても取れる）。
      //   見たいのは「どこかに書いてあるか」で、常時見えている必要はない。
      const priv = await page.locator("footer").textContent();
      must(/端末の中で合成/.test(priv), "音声をどこで作っているか書かれていない");

      // 年代を変えたら、前の年代の読み上げは止まること（画面と声が食い違わない）
      const stopped = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const orig = speechSynthesis.cancel.bind(speechSynthesis);
        speechSynthesis.cancel = () => { n++; orig(); };
        document.querySelectorAll("#strip .f")[3].click();
        setTimeout(() => res(n), 800);
      }));
      must(stopped > 0, "年代を変えても、前の年代の読み上げが止まらない");
      return `「${said.slice(0, 52)}…」／画面の行と一致／作文なし`;
    },
  },
  // ---- 判定を待つあいだ、何を見せているか ----
  // ⚠ 実測（3G相当）で、住所を選んでから **2.6秒、文字だけ**だった。
  //   座標は選んだ瞬間に分かっているので、現在の写真は判定を待たずに出せる。
  //   待ち時間が「何も無い」から「いまのその場所を見ている」に変わる。
  {
    name: "判定を待つあいだ、現在の写真を先に見せる", path: "/",
    viewport: { width: 375, height: 667 }, hasTouch: true,
    // 判定（地形分類）だけを遅らせて、待っている最中の画面を捕まえる
    setup: (page) => page.route("**/experimental_landformclassification*/**", async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      await r.continue();
    }),
    async check(page) {
      await page.waitForSelector("#quick button");
      await page.locator("#quick button", { hasText: "豊洲" }).click();

      // 判定が終わる前に、骨組みと写真が出ていること
      await page.waitForSelector(".strip.skel", { timeout: 5000 });
      await page.waitForFunction(() => {
        const t = [...document.querySelectorAll("#big .lyr.on .t")];
        return t.length === 4 && t.some((e) => e.complete && e.naturalWidth > 0);
      }, null, { timeout: 8000 });
      const during = await page.evaluate(() => ({
        skel: !!document.querySelector(".strip.skel"),
        photo: [...document.querySelectorAll("#big .lyr.on .t")].filter((e) => e.naturalWidth > 0).length,
        yr: document.querySelector(".strip-title")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        text: document.getElementById("verdict")?.textContent.replace(/\s+/g, " ").trim() ?? "",
      }));
      must(during.skel, "待っているあいだ、帯の骨組みが出ていない");
      must(during.photo >= 1, "待っているあいだ、写真が1枚も出ていない");
      // ⚠ 出しているのは「現在」だと名乗る。判定前の写真を、判定の答えのように見せない
      must(/現在/.test(during.yr), `待っているあいだの写真が何なのか書いていない: ${during.yr}`);
      must(/判定中/.test(during.text), `判定中であることが書かれていない: ${during.text.slice(0, 40)}`);
      // ⚠ まだ答えていないのに、答えたように見せない
      for (const w of LIES) must(!during.text.includes(w), `判定前に断定している: 「${w}」`);

      // 判定が届いたら、ちゃんと本番の帯に入れ替わること
      await waitVerdict(page, 30000);
      await waitStrip(page);
      must(!(await page.locator(".strip.skel").count()), "判定が出たのに骨組みが残っている");
      must(await page.locator("#strip .f").count() >= 4, "判定が出たのに帯が並んでいない");
      return `待機中: 骨組み＋写真 ${during.photo}/4 枚（「${during.yr}」）→ 判定後に帯へ差し替わる`;
    },
  },
  // ---- フッターは、置かないと嘘になるものだけ ----
  // ⚠ 「画面が通信した先が、全部フッターに書いてある」ことを機械で見る。
  //   Wikidata を実行時に叩くようにしたとき、**フッターを直し忘れていた**。
  //   依存を足すたびに人が思い出すのでは、いつか必ず落ちる。
  {
    name: "通信した先が、全部フッターに書いてある", path: `/?${TOYOSU}`,
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForTimeout(1500);
      const foot = (await page.locator("footer").textContent()).replace(/\s+/g, " ");

      // 実際に出ていった先（自分のオリジンを除く）
      const hosts = [...new Set(reqs.map((u) => { try { return new URL(u).host; } catch { return ""; } })
        .filter((h) => h && !/127\.0\.0\.1|localhost/.test(h)))];
      const NAME = { "cyberjapandata.gsi.go.jp": "国土地理院", "maps.gsi.go.jp": "国土地理院",
        "msearch.gsi.go.jp": "国土地理院", "query.wikidata.org": "Wikidata" };
      const missing = hosts.filter((h) => {
        const n = NAME[h];
        if (!n) return true;                 // 名前を決めていない先が増えたら、まず気づく
        return !foot.includes(n);
      });
      must(missing.length === 0, `フッターに書かれていない通信先がある: ${missing.join(", ")}`);

      // ⚠ **主語のない「送りません」を書かせない。**
      //   ここは以前 `/こちらのサーバーには送りません/` を**必須にしていた**。
      //   ところがそれは事実でなかった（調べた場所は URL に載り、開けば配信元へ届く）。
      //   ⚠ **検査が、誤った説明を固定していた。**「検査が通った」ではなく
      //   「そのテストは本当にその主張を検証しているか」を見る、の典型例。
      must(!/(こちらの)?サーバーには送りません/.test(foot),
        "主語のない「サーバーには送りません」が残っている"
        + "（調べた場所は URL に載り、開けば配信元へ届く。事実でない）");
      // ⚠ 文言そのものに縛らない（読点1つで落ちると、直すたびに検査を書き換えることになる）。
      //   見たいのは「4 つのことが書いてあるか」。
      const facts = [
        // ⚠ **「地名か座標」で通さない。** 片方だけ書いても通っていた（2026-08-15 に指摘）。
        [/計測に[はも、]?[^。]*地名[^。]*座標[^。]*送りません/, "計測に地名と座標の両方を送らないこと"],
        // ⚠ 配信元には届く。ここを書かないと、上の1行が言い切りすぎになる。
        [/IP/, "接続元の IP が配信元に届くこと"],
        [/URL|アドレス欄/, "調べた場所が URL に載ること"],
        [/(Cloudflare|配信).*(届|渡)/, "その URL を開くと配信元へ届くこと"],
        [/Cookie/, "Cookie を使わないこと"],
        [/提供元に[はも、]?.*座標が渡り/, "提供元に座標が渡ること（「どこにも送らない」は嘘になる）"],
      ];
      const notWritten = facts.filter(([re]) => !re.test(foot)).map(([, n]) => n);
      must(!notWritten.length, `プライバシーの説明に書かれていないことがある: ${notWritten.join("、")}`);
      must(!/一切送っていません/.test(foot), "言い切りが残っている（提供元には渡っている）");
      // 出典表示は利用の条件（地理院）とライセンス上の義務（OSM）
      for (const n of ["国土地理院", "OpenStreetMap"])
        must(foot.includes(n), `出典が消えている: ${n}`);
      // ⚠ いちばん強い約束だけは畳まない（このサービスの性格そのもの）。
      //   残りは details に入れてよいが、**これは開かなくても読めること**。
      const shown = (await page.locator("footer .f-priv").textContent()).replace(/\s+/g, " ");
      must(await page.locator("footer .f-priv").isVisible(), "プライバシーの記述が畳まれている");
      must(/計測に[はも、]?[^。]*地名[^。]*座標[^。]*送りません/.test(shown),
        `畳まずに見える場所から、いちばん強い約束が消えている: ${shown}`);
      must(/Cookie/.test(shown), `Cookie を使わないことが、畳まずに見える場所に無い: ${shown}`);
      // ⚠ 「保存しません」に弱めない。計測に関しては、そもそも送っていない（/t は固定文字列だけ）
      must(!/保存しません|保存していません/.test(shown),
        "「送りません」を「保存しません」に弱めている（送ってはいる、と読める）");
      return `通信先 ${hosts.length} 種すべて記載（${hosts.join("・")}）／説明 ${facts.length} 点`;
    },
  },
  // ---- /eras にしか無かった3つを、トップへ ----
  {
    name: "地図の上を押すと、その地点を判定し直す", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      const before = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search }));
      // 地図を出す
      await page.locator("#zIn").click();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      // 中心から離れたところを押す
      const box = await page.locator("#big").boundingBox();
      await page.mouse.click(box.x + box.width * 0.22, box.y + box.height * 0.28);
      await page.waitForFunction((t) => {
        const v = document.getElementById("verdict")?.textContent ?? "";
        return v.length > 0 && !v.includes("判定中") && location.search !== t;
      }, before.url, { timeout: 45000 });
      // 地図は要素ごと描き直されるので作り直しになる。**戻ってくること**を待つ
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 }).catch(() => {});
      const after = await page.evaluate(() => ({
        text: document.querySelector("#verdict .v-head .tx")?.textContent.trim() ?? "",
        url: location.search, map: !!document.querySelector("#big.map-on") }));
      must(after.url !== before.url, `押しても座標が変わっていない: ${after.url}`);
      must(after.text.length > 0, "押したあと判定文が消えている");
      // ⚠ 地図を壊さない。壊すと押した場所を見失う
      must(after.map, "判定し直したら地図が消えた（押した場所を見失う）");
      return `座標が ${before.url.slice(0, 28)}… → ${after.url.slice(0, 28)}…／地図は残る`;
    },
  },
  {
    name: "年代を順に流せる／明治期の水域を重ねられる", path: `/?${TOYOSU}`,
    setup: (page) => stubWikidata(page, []),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      const at = () => page.evaluate(() =>
        [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on")));
      // ▶ で年代が進むこと
      must(await at() === 0, "着いたときに左端が選ばれていない");
      await page.click("#playBtn");
      await page.waitForFunction(() => {
        const i = [...document.querySelectorAll("#strip .f")].findIndex((e) => e.classList.contains("on"));
        return i >= 2;
      }, null, { timeout: 20000 });
      must(await page.locator("#playBtn.on").count() === 1, "流している最中だと分からない");
      await page.click("#playBtn");                     // 止める
      await page.waitForTimeout(400);
      must(await page.locator("#playBtn.on").count() === 0, "止められない");
      const stopped = await at();
      await page.waitForTimeout(1800);
      must(await at() === stopped, `止めたのに進んでいる: ${stopped} → ${await at()}`);

      // 明治期の水域を重ねられること（判定できた土地でだけ出す）
      must(await page.locator("#ovSwale").count() === 1, "明治期の土地を重ねる操作が無い");
      // ⚠ ここは長いあいだ、**何も測らずに「水域の重ねあり」と報告していた**。
      //   代入した値をどこにも使わない行が置いてあるだけで、assertion が無かった。
      //
      //   ⚠ 通信では測れない。**タイルは不透明度 0 でも取りに行く**
      //     （peel で 556→138 枚に落としたときに分かったのと同じ話）。実測で、
      //     `raster-opacity` を 0 固定に壊してもタイルの枚数は変わらず、検査は通った。
      //   ⚠ 「重ねる前」と「重ねた後」を比べるのも駄目。この操作は**地図そのものを出す**ので、
      //     層が死んでいても地図が現れたぶんだけ画面が変わり、やはり通る（これも実測で通った）。
      //   → 地図が出た状態のまま、**重ねを入り切りして**比べる。これで層だけを切り分けられる。
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const shotOn = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1800);
      const shotOff = await page.locator("#big").screenshot();
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(1200);
      must(!shotOn.equals(shotOff),
        "重ねを入り切りしても、画面が1バイトも変わらない（層が効いていない）");
      return `▶ で ${stopped} 番目まで進んで止まる／重ねの入り切りで画面が変わる`
        + `（入 ${shotOn.length} B／切 ${shotOff.length} B）`;
    },
  },
  {
    // ⚠ **下地を敷いても、上が不透明なら 1 ピクセルも見えない。**
    //   明治期のコマは「淡色地図＋区分の塗り」の 2 枚組で描いているが、塗りが不透明だったため、
    //   **全面が水だった土地（豊洲）では下地が完全に隠れ、画面の 6 割が青一色**になっていた。
    //   初見の 3 人が 3 人ともそこに最初に目を奪われ、1 人は「読み込み中かと思った」（2026-08-17）。
    //   ⚠ **この不具合は、それまでの検査を 1 つも落とさなかった。**
    //     層は在るし、タイルも取りに行くし、地図も出る。「見えているか」を誰も見ていなかった。
    //   → **撮った絵の画素を実際に数える。** 単色なら色数が極端に少ない。
    //   ⚠ 通信の本数では測れない（不透明度 0 でもタイルは取りに行く）。
    //   ⚠ 不透明度の値そのものを見ない。0.99 でも通ってしまい、**見えるかどうか**を測れない。
    name: "明治期のコマで、下地の地図が透けて見える", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page, reqs) {
      await waitVerdict(page);
      await page.waitForSelector("#big .lyr.on img", { timeout: 20000 });
      await page.waitForTimeout(3000);
      // 着いた直後は最古＝明治期のコマ。前提が変わったら落とす（別のコマを測って緑にしない）
      const first = await page.$eval("#yrBig", (e) => e.textContent.replace(/\s+/g, " ").trim());
      must(/明治期/.test(first), `着いた直後が明治期のコマでない: ${first}`);
      // 絵の中だけを切り取る。四隅の操作（🔇・＋−・年バッジ・重ねる行）を含めない
      const box = await page.locator("#big").boundingBox();
      const clip = { x: box.x + box.width * 0.34, y: box.y + 10,
                     width: Math.round(box.width * 0.46), height: Math.round(box.height * 0.34) };
      // 撮った PNG を**その場のブラウザで開いて**画素を数える。
      // ⚠ data: URL なので canvas は汚れない（タイルを直接読むと cross-origin で読めない）
      const colors = async (area = clip) => {
        const buf = await page.screenshot({ clip: area });
        return page.evaluate(async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          return seen.size;
        }, buf.toString("base64"));
      };
      const on = await colors();
      // 単色に近ければ、下地は見えていない。実測（2026-08-17 / 豊洲）:
      //   直す前 = 2 色（青のベタ塗り）／直したあと = 数百色（道路・駅名・町名が透ける）
      must(on >= 24, `明治期のコマが単色に近い（下地が透けていない）: ${on} 色`);
      // ⚠ **帯の小さいコマも見る。** この画面は同じ絵を出す経路が **3 本**ある
      //   （帯のコマ・大きい絵・地図）。大きい絵と地図だけ直して**帯に届いておらず**、
      //   帯のコマが青いベタ塗りのまま残っていた（2026-08-17 にオーナーが実機で発見）。
      //   検査も 2 本しか見ていなかったので、緑のまま通していた。
      // ⚠ **帯には水域を重ねない**（オーナー判断 2026-08-17）。重ねると、全面が水だった土地で
      //   コマが青いベタ塗りになり、隣に並ぶ空中写真の中で 1 つだけ「絵ではないもの」になる。
      //   水域は、そのコマを選んだときに大きい絵の側で見せる（重ねる操作つき）。
      const cellBox = await page.locator("#strip .f.meiji").boundingBox();
      must(cellBox, "帯に明治期のコマが無い（この検査が何も見ていない）");
      const cell = await colors({ x: cellBox.x + 3, y: cellBox.y + 3,
        width: Math.max(1, Math.round(cellBox.width - 6)),
        height: Math.max(1, Math.round(cellBox.height - 6)) });
      // ⚠ コマは 24px 角しかないので、大きい絵より色数は少ない。
      //   ⚠ **ベタ塗りでも 0 色にはならない。** 枠の丸み・選択中の輪・判定した点の印・
      //     縁のぼかしが色を持つ。実測（2026-08-17 / 豊洲）:
      //       塗りが不透明 = 37 色 ／ 透かして重ねる = 134 色 ／ 重ねない（いま）= 176 色
      //     最初 12 色で書いたら**壊しても通った**ので、実測の間に置き直した。
      must(cell >= 80, `帯の明治期のコマが青いベタ塗りのまま: ${cell} 色（地図なら 170 前後）`);
      // ⚠ **塗りのタイルを要求していないこと**まで見る。透明にして隠すのでは、
      //   見えないものを国土地理院へ取りに行き続ける（掟: 地理院への負荷は自分の請求とは別に見る）
      const cellImgs = await page.$$eval("#strip .f.meiji img", (els) => els.map((e) => e.src));
      must(!cellImgs.some((s) => /\/swale\//.test(s)),
        `帯のコマが水域のタイルを取りに行っている: ${cellImgs.join(" / ")}`);
      // 重ねる操作が**そこに出ている**こと。以前は明治期のコマでだけ隠していた
      const row = await page.$eval("#ovRow", (e) => e.checkVisibility()).catch(() => false);
      must(row, "明治期のコマに、重ねる操作が出ていない");
      const c0 = await page.$eval("#ovSwale", (e) => e.checked);
      must(c0, "明治期のコマで、水域が既定で重なっていない");
      // ⚠ **押しても地図を起こさないこと。** 起こすと、静止画から地図へ絵が差し替わり
      //   **押した瞬間に位置が跳ぶ**（2026-08-17 にオーナーが実機で発見）。
      //   実測: #ovRow 自体は 1px も動かないのに、中の絵だけが替わる。
      //   ⚠ 明治期のコマは静止画のモザイクだけで成立する（淡色地図＋塗りの2枚組）。
      //     起こすぶんの要求（実測 24 タイル）も無駄になる
      //     （掟: 地理院への負荷は自分の請求とは別に見る）。
      const gsiBefore = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      // 入り切りで**絵が本当に変わる**こと（掟: 押しても何も起きない導線を置かない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      must(!(await page.$("#big.map-on")),
        "明治期のコマで重ねを押しただけで地図が起きた（絵が差し替わって位置が跳ぶ）");
      const gsiAfter = reqs.filter((u) => /gsi\.go\.jp/.test(u)).length;
      must(gsiAfter === gsiBefore,
        `明治期のコマで重ねを押しただけで、地理院へ ${gsiAfter - gsiBefore} 本出た`);
      const offBuf = await page.screenshot({ clip });
      const onBuf2 = await (async () => {
        await page.locator("#ovSwale").check();
        await page.waitForTimeout(900);
        return page.screenshot({ clip });
      })();
      must(!offBuf.equals(onBuf2), "重ねを入り切りしても、明治期のコマが1バイトも変わらない");
      // 切ったほうも単色でないこと（＝下地の地図が出ている。真っ白や真っ黒にしない）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(900);
      const off = await colors();
      must(off >= 24, `水域を切ったのに、下地の地図が出ていない: ${off} 色`);
      // ⚠ **地図の経路でも同じことを確かめる。** ここまでは静止画のモザイクしか見ていない。
      //   同じ絵を出す経路が 2 本あり、**片方だけ直して届いていなかった事故を 2 回**やっている
      //   （CLAUDE.md の落とし穴）。実際、この検査を書いた直後に地図側だけ壊してみたら**通った**。
      //   → 地図が出ている状態（#big.map-on）にしてから、もう一度画素を数える。
      // ⚠ **この検査が見ていない範囲**（実測で確かめた 2026-08-17）:
      //   地図の**作成時**の不透明度（style の paint）を壊しても、ここは通る。
      //   地図の読み込み直後に applyOverlay() が必ず走って上書きするため、
      //   振る舞いに差が出ないから。作成時の値が効くのは「地図が出た瞬間の一瞬」だけで、
      //   そこは撮れていない。**「作成時の値も検査した」とは言わない。**
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(600);
      await page.locator("#big").click({ position: { x: 180, y: 120 } });   // 地図を起こす
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const onMap = await colors();
      must(onMap >= 24, `地図の経路でも下地が透けていない: ${onMap} 色`);
      // 地図が出た状態で、入り切りが効くこと（層だけを切り分けて見る）
      const mapOnBuf = await page.screenshot({ clip });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(1500);
      const mapOffBuf = await page.screenshot({ clip });
      must(!mapOnBuf.equals(mapOffBuf),
        "地図が出ている状態で、重ねを入り切りしても1バイトも変わらない（地図の経路に届いていない）");
      // ⚠ **選んだ状態は、コマをまたいでも引き継ぐ。**（2026-08-17 オーナー判断）
      //   以前はコマごとに別々に覚えていたが、**明治期で入にしたのに写真へ移ると切れる**
      //   という取り違えを生んだ。「明治期の水域を見ているか」は1つの問いなので、状態も1つ。
      //   ⚠ ここは**切った状態**のまま移る（直前で uncheck している）。切ったまま引き継ぐこと。
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "切ったのに、写真の年代へ移ったら入に戻った");
      await page.locator("#strip .f").nth(0).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === false,
        "明治期のコマへ戻ったのに、切っておいた設定が戻っていない");
      // 入れ直して、写真の年代へ**入のまま**引き継ぐこと（今回の指摘そのもの）
      await page.locator("#ovSwale").check();
      await page.waitForTimeout(800);
      await page.locator("#strip .f").nth(1).click();
      await settleAfterClick(page);
      must(await page.$eval("#ovSwale", (e) => e.checked) === true,
        "明治期で入にしたのに、写真の年代へ移ると切れている");
      // ⚠ チェックが入っているだけでは足りない。**層まで効いていること**を見る
      const carried = await page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      must(carried > 0,
        `写真の年代でチェックは入っているのに、層が ${carried}（何も重なっていない）`);
      return `3経路とも下地が透ける（帯のコマ ${cell} 色／大きい絵 ${on} 色／地図 ${onMap} 色`
        + `／切ると ${off} 色。単色なら 2〜4 色）／入り切りで絵が変わる／状態がコマをまたいで引き継がれる`;
    },
  },
  {
    // 明治期のデータが無い土地では、重ねるものが無い
    name: "明治期が無い土地では、重ねる操作を出さない", path: `/?${SAPPORO}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForTimeout(800);
      const m = await page.locator("#verdict .badge").allTextContents();
      const hasMeiji = m.some((t) => /明治期: (?!.*(なし|データ))/.test(t));
      // ⚠ 以前は assertion が if の中にしか無く、hasMeiji が true に転ぶと
      //   **1つも確かめないまま「対象外」と報告して緑**になった（2026-08-14 検証者の指摘）。
      //   しかも判定はバッジの文面への正規表現なので、**文言を変えるだけで静かに無効化**される。
      //   → この土地に明治期が無いこと自体を、まず確かめる。前提が消えたら落とす。
      must(!hasMeiji,
        `この土地に明治期のデータが出ている。検査の前提が消えた（バッジ: ${m.join(" / ")}）`);
      must(await page.locator("#ovSwale").count() === 0,
        "明治期のデータが無いのに、重ねる操作が出ている");
      // ⚠ 操作を黙って消すだけだと「壊れている」と読める。なぜ出せないかは画面が言う。
      //   整備対象外（404）と、読み込めなかった（通信断・403）は別の言葉でなければならない。
      must(m.some((t) => /明治期のデータ(なし|を読み込めませんでした)/.test(t)),
        `重ねる操作を出さない理由が、画面のどこにも無い（バッジ: ${m.join(" / ")}）`);
      return `明治期なし（バッジ ${m.length} 個）／重ねる操作を出していない`;
    },
  },
  {
    // ⚠ 重ねる相手は写真なのに、操作は写真・判定文・▶ の下にあった。
    //   実測（2026-08-16 / 豊洲）で 1280×800 では y=831 と**初期画面の外**、
    //   375×667 でも 552px（写真の下）。写真が見えているのに操作が見えない状態を作らない。
    //   → 年バッジと同じ積み上げ（.bl）に入れた。固定値で位置を決めない。
    name: "重ねる操作が、写真と一緒に初期画面に見える", path: `/?${TOYOSU}`,
    viewport: { width: 1280, height: 800 },
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 明治期のコマは空中写真ではない。幅のある見出しの側で、そう名乗る
      const yr = await page.locator("#yrBig").textContent();
      must(yr.includes("空中写真ではありません"),
        `明治期の見出しが、空中写真と区別できない: ${yr}`);
      const cell = await page.locator("#strip .f.meiji .yr").textContent();
      must(cell.trim() === "明治期", `帯のコマの見出しが変わっている: ${cell}`);
      // ⚠ この検査は以前、**明治期のコマでは操作を出さない**ことを求めていた。
      //   当時の理由は「重ねる相手（空中写真）が無い／入り切りしても絵が変わらない」で、
      //   当時は正しかった（掟: 押しても何も起きない導線を置かない）。
      //   ⚠ 前提が変わった。相手は**下に敷いてある淡色地図**で、塗りを透かしたので
      //     入り切りすると絵が本当に変わる。**出すのが正しい**（2026-08-17）。
      //   守っていた「押しても何も起きない導線を置かない」は、
      //   →「明治期のコマで、下地の地図が透けて見える」が、画素を数えて引き継いでいる。
      must(await effOpacity(page, "#ovRow") > 0,
        "明治期のコマで、重ねる操作が出ていない（下地の地図を出し入れできない）");
      // 写真の年代（1936–42）へ移ると、出る
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      // ⚠ **地図を載せてから見る。** 国土地理院の帰属表示は地図が載って初めて出る。
      //   載せずに見ていたら、帰属表示に重なっていることを一度も捕まえられない。
      await page.click("#zIn");
      await settleAfterClick(page);
      const geom = () => page.evaluate(() => {
        const R = (s) => {
          const e = document.querySelector(s); if (!e) return null;
          const b = e.getBoundingClientRect();
          return { t: Math.round(b.top), b: Math.round(b.bottom),
                   l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) };
        };
        // 重なりは矩形の交差で見る（見えているつもりを、座標で潰す）
        const hit = (a, x) => !!a && !!x && a.l < x.r && x.l < a.r && a.t < x.b && x.t < a.b;
        const ov = R("#ovRow"), big = R("#big");
        // 地図を載せると出る帰属表示（国土地理院）。**隠していないこと**を座標で見る
        const attr = R(".maplibregl-ctrl-attrib");
        return { ov, big, h: innerHeight,
          inViewport: !!ov && ov.t >= 0 && ov.b <= innerHeight,
          // ⚠ 写真の**すぐ下**。中ではない（2026-08-17 に外へ出した）
          underBig: !!ov && !!big && ov.t >= big.b && ov.t - big.b <= 20,
          sameRail: !!ov && !!big && Math.abs(ov.l - big.l) <= 1,
          overZoom: hit(ov, R(".zoombar")),
          // ⚠ **写真の中に載っているもの**が、帰属表示を隠していないか。
          //   隠す危険があるのは「重ねる」（外に出した）ではなく ＋− のほう。
          //   実測（2026-08-17）: ＋− の底を 34px にしていたら − の下端と帰属の上端が
          //   ぴったり接し、オーナーが「国土地理院と − のボタンが被る」と報告した。
          zoomOverAttr: hit(R(".zoombar"), attr), attrThere: !!attr,
          // 接しているのも駄目。何px 空いているかを返す
          zoomGap: (() => { const z = R(".zoombar");
            return z && attr ? Math.round(attr.t - z.b) : null; })(),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      const out = [];
      // ⚠ PC でも見えることが今回の要点。スマホだけ見ると、直したつもりで直っていない
      for (const [w, h] of [[1280, 800], [375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        // ⚠ **その大きさで読み込み直す**（2026-08-20。hidetzu/konjaku#122）。
        //   ⚠ 伸縮するだけでは、⚠ **写真が前の大きさの高さを保つ。**
        //   ⚠ 実際に穴だった: 写真の上限（縦の短い画面）を丸ごと外しても緑のままで、
        //     ⚠ **実機の読み込みでは 375×667 も 320×640 も画面から出ていた**
        //     （重ねる下端 671/667・655/640）。⚠ **伸縮は実機の代わりにならない。**
        await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitVerdict(page);
        await waitStrip(page);
        await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
        // ⚠ **読み込み直したら、見る状態も作り直す。**
        //   写真の年代（1936–42）へ移し、⚠ **地図を載せる**（帰属表示は地図が載って初めて出る）
        await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
        await settleAfterClick(page);
        await page.click("#zIn");
        await settleAfterClick(page);
        // ⚠ **帰属表示が出るまで待つ。**⚠ 地図は読み込み直しのたびに載せ直しになり、
        //   ⚠ **CI では出るまでに時間がかかる。**待たずに測ると、まだ画面の上のほうに
        //   ⚠ **前の位置の帰属表示が残っていて、−517px のような値が出る**（実際に CI で落ちた）。
        await page.waitForFunction(() => {
          const a = document.querySelector(".maplibregl-ctrl-attrib");
          return !!a && a.getBoundingClientRect().height > 0;
        }, null, { timeout: 60000 });
        await settleAfterCondition(page);
        const g = await geom();
        must(g.inViewport,
          `${w}×${h}: 重ねる操作が初期画面の外にある（y=${g.ov?.t}〜${g.ov?.b} / 画面 ${g.h}）`);
        // ⚠ **写真から離さない。** 押した結果（絵が変わる）が同時に見えている必要がある。
        //   以前は判定文の下にあり、押しても何が変わったか見えなかった。
        //   ⚠ 写真の**中**に戻すのも駄目。実測（2026-08-17 / 344×882 ZFold5 カバー）で
        //     写真が 278×209px しかなく、🔊・＋−・この行・国土地理院が全部載って窮屈だった。
        must(g.underBig,
          `${w}×${h}: 重ねる操作が写真のすぐ下にない（写真の下端 ${g.big?.b} / 操作の上端 ${g.ov?.t}）`);
        must(g.sameRail, `${w}×${h}: 写真と左端が揃っていない（写真 ${g.big?.l} / 操作 ${g.ov?.l}）`);
        must(await effOpacity(page, "#ovRow") > 0, `${w}×${h}: 重ねる操作が読めない`);
        must(!g.overZoom, `${w}×${h}: 重ねる操作がズームと重なっている`);
        // ⚠ **国土地理院の帰属表示を隠さない**（掟: 出典は隠さない）。
        must(g.attrThere, `${w}×${h}: 地図を載せたのに帰属表示が出ていない（この検査が何も見ていない）`);
        must(!g.zoomOverAttr, `${w}×${h}: ＋− が国土地理院の帰属表示に重なっている`);
        // 接するのも駄目。指で押すと隣に触る
        must(g.zoomGap >= 6,
          `${w}×${h}: ＋− と国土地理院の帰属表示が近すぎる: ${g.zoomGap}px（6px 必要）`);
        must(!g.overflowX, `${w}×${h}: 横にあふれている`);
        out.push(`${w}×${h}: 写真の下 ${g.ov.t - g.big.b}px／＋−と出典 ${g.zoomGap}px`);
      }
      return `明治期では出さない ／ ${out.join(" ／ ")}`;
    },
  },
  {
    // ⚠ チェックが入っていることと、画面に重なっていることは別。
    //   「重ねています」と書いてある横で、層の不透明度が 0 という状態を作らない。
    name: "重ねているかどうかを、言葉と層で食い違わせない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 層の不透明度は、画面の言葉ではなく地図そのものに聞く
      const op = () => page.evaluate(() =>
        (typeof mapObj !== "undefined" && mapObj?.getLayer("swale"))
          ? mapObj.getPaintProperty("swale", "raster-opacity") : null);
      const st = () => page.locator("#ovState").textContent();

      // ⚠ この検査は以前、**正常時の実況**（「ONで地図に重ねます」「重ねています」）を
      //   文字列で要求していた。守っていたのは「言葉と層を食い違わせない」ことだが、
      //   実況をやめた（2026-08-17 オーナー判断: ラベルと合わせて 2 行になり読む量が増える）ので、
      //   **同じ意図を裏返して守る**: 正常なときは**何も言わない**こと＋層が言葉と食い違わないこと。
      //   ⚠ 「取れなかったときは言う」ほうは、次のケース（水域のタイルだけ拒まれたら）が見ている。
      // ⚠ 既定は入。まず切ってから、写真の年代へ移る
      //   （切ったまま引き継ぐので、移った先でも層は無い）
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      const before = (await st()).trim();
      must(before === "", `切っているだけなのに、何か書いてある: 「${before}」`);
      // ⚠ この検査は以前「押していないのに、もう地図の層がある」を見ていた。
      //   状態を1つにして引き継ぐようにしたので、**入のまま移ってきたら層はある**のが正しい。
      //   ここでは直前に切ってから移っているので、層はまだ無い。
      must(await op() === null, "切ったまま移ってきたのに、もう地図の層がある");

      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"), null, { timeout: 60000 });
      await page.waitForFunction(() =>
        (typeof mapObj !== "undefined" && mapObj?.getPaintProperty("swale", "raster-opacity")) > 0,
        null, { timeout: 20000 });
      const onOp = await op();
      must(onOp > 0, `重ねたのに、層が ${onOp}`);
      const onTx = (await st()).trim();
      must(onTx === "", `正常に重なっているのに、実況が書いてある: 「${onTx}」`);

      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(600);
      const offTx = (await st()).trim();
      must(offTx === "", `切っただけなのに、何か書いてある: 「${offTx}」`);
      must(await op() === 0, `切ったのに、層が ${await op()} のまま`);
      return `切: 層 0／入: 層 ${onOp}／正常時は言葉を出さない（3 状態とも空）`;
    },
  },
  {
    // ⚠ 層があることと、水域が画面に出ていることは別（レビューで指摘された）。
    //   地図も写真も出せるのに、**水域のタイルだけ**拒まれる状態がある。
    //   ⚠ 逆に 404 は「その範囲は整備対象外」なので、失敗として扱ってはいけない。
    //     両方をこの1件で見る。
    name: "水域のタイルだけ拒まれたら、取れなかったと言う", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: (page) => stubWikidata(page, []),
    async check(page) {
      // 判定を先に済ませる（判定できた土地でしか操作は出ない）
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      let denied = 0;
      await page.route(SWALE_ROUTE, (r) => { denied++;
        r.fulfill({ status: 403, contentType: "text/html", body: "403 Forbidden" }); });
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      await page.waitForFunction(() => document.querySelector("#big.map-on"),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const bad = (await page.locator("#ovState").textContent()).trim();
      // ⚠ 前提が消えたら落とす。1本も拒めていないなら、この検査は何も確かめていない
      must(denied > 0, "水域のタイルを1本も拒めていない（検査の前提が消えた）");
      must(!bad.includes("重ねています"), `明治期を取れていないのに、重ねたと言っている: ${bad}`);
      // ⚠ **その文が1行に収まっていること。** 写真の上に置いているので、折り返したぶんだけ
      //   写真が隠れる。⚠ **この約束は長いあいだ 320px で破れていた**（2026-08-17 実測:
      //   「水域を読み込めませんでした」で札が 44px → 58px）。誰も見ていなかったので、ここで見る。
      for (const [w, h] of [[375, 667], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        const g = await page.evaluate(() => {
          const st = document.getElementById("ovState");
          const lh = parseFloat(getComputedStyle(st).lineHeight) || 15;
          return { rows: Math.max(1, Math.round(st.getBoundingClientRect().height / lh)),
            rowH: Math.round(document.getElementById("ovRow").getBoundingClientRect().height),
            t: st.textContent };
        });
        must(g.rows === 1,
          `${w}×${h}: 状態の文が ${g.rows} 行に折り返している（札 ${g.rowH}px）: 「${g.t}」`);
      }
      await page.setViewportSize({ width: 375, height: 667 });
      must(bad.includes("読み込めません"), `明治期を取れなかったことを言っていない: ${bad}`);
      must(await page.locator("#big.map-on").count() === 1,
        "水域が取れないだけなのに、地図ごと出なくなっている");

      // ⚠ 404（整備対象外）は失敗ではない。入れ直したら**何も言わない**状態に戻ること。
      //   ⚠ 以前は「重ねています」に戻ることを見ていた。正常時の実況をやめたので、
      //     同じ意図（404 を「読み込めなかった」に化けさせない）を**空に戻る**ことで守る。
      //   ⚠ 実測（2026-08-16 / MapLibre GL JS v5.24.0）では 404 で error 自体が飛んでこないので、
      //     ここが見ているのは**画面が何と言うか**であって、除外の条件式ではない
      //     （条件式を外しても、この検査は落ちない。確かめた）。
      await page.unroute(SWALE_ROUTE);
      let missing = 0;
      await page.route(SWALE_ROUTE, (r) => { missing++; r.fulfill({ status: 404, body: "" }); });
      await page.locator("#ovSwale").uncheck();
      await page.waitForTimeout(500);
      await page.locator("#ovSwale").check();
      await page.evaluate(() => mapObj?.jumpTo(
        { center: [mapObj.getCenter().lng + 0.03, mapObj.getCenter().lat], zoom: 16 }));
      await page.waitForTimeout(3000);
      const gone = (await page.locator("#ovState").textContent()).trim();
      must(missing > 0, "404 を1本も返せていない（検査の前提が消えた）");
      must(gone === "",
        `整備対象外（404）を、読み込めなかったことにしている: 「${gone}」`);
      return `403 を ${denied} 本 → 「${bad}」／404 を ${missing} 本 → 「${gone}」`;
    },
  },
  {
    // ⚠ 地図が出せなかったときに「重ねています」と書くと、起きていないことを書くことになる。
    //   OFF と「出せなかった」を同じ顔にしない（掟: 取れなかったを、有ることにしない）。
    name: "地図を読み込めないときに「重ねています」と言わない", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    setup: async (page) => {
      await stubWikidata(page, []);
      await page.route("**/vendor/maplibre-gl.js", (r) => r.abort());
    },
    async check(page) {
      await waitVerdict(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      // 重ねる相手は空中写真なので、写真の年代へ移ってから押す（明治期では出さない）
      await page.evaluate(() => document.querySelectorAll("#strip .f")[1]?.click());
      await settleAfterClick(page);
      await page.locator("#ovSwale").check();
      // ⚠ 「読み込んでいます…」のまま止まるのも失敗。**終わったと言うところ**まで待つ。
      //   待ち切れなかったときに Timeout とだけ出ると、何が起きたのか読めないので、
      //   いま画面に出ている言葉を添えて落とす。
      // ⚠ 正常時は何も言わなくなったので、「終わった」の合図は
      //   「読み込めませんでした」が出ること、そのもの
      const done = await page.waitForFunction(() =>
        /読み込めません/.test(document.getElementById("ovState")?.textContent ?? ""),
        null, { timeout: 30000 }).catch(() => null);
      const tx = (await page.locator("#ovState").textContent()).trim();
      must(done, `地図の読み込みは終わっているのに、状態が「${tx}」のまま止まっている`);
      must(!tx.includes("重ねています"), `地図が出せていないのに、重ねたと言っている: ${tx}`);
      must(tx.includes("読み込めません"), `地図が出せなかったことを言っていない: ${tx}`);
      // 判定そのものは巻き添えにしない
      const v = await page.locator("#verdict").textContent();
      must(v.includes("明治期"), "地図が出せないことで、判定まで消えている");
      return `地図を出せないとき: 「${tx}」／判定は残る`;
    },
  },
  {
    // ⚠ **読めなかった年代を、トップが黙って落とさない。**
    //   実測（2026-08-19・出島・利用者役 3 名。⚠ 実在の利用者ではない）:
    //     落とした版を見せると **3/3 が「その年代の写真は存在しない」と答えた**。
    //   ⚠ `/peel` は最初から残していた。同じ問いに 2 つの答えがあり、
    //     実描画が 2 回それで落ちていた（相手先が 1 回 404 を返さなかっただけで）。
    //   ⚠ **ここは 404 を落とすことも一緒に見る。**残すほうだけ見ると、
    //     「全部残す」に変えても緑になる。
    name: "読めなかった年代を、トップが黙って落とさない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`, group: "core",
    // ⚠ gazo3（1984–86）だけ落とす。⚠ gazo2 / gazo4 は 404 のまま（出島には無い）
    setup: (page) => page.route(/\/xyz\/gazo3\//, (r) => r.abort("timedout")),
    async check(page) {
      await waitVerdict(page);
      const r = await page.evaluate(() => ({
        yrs: [...document.querySelectorAll("#strip .f .yr")].map((e) => e.textContent.trim()),
        btn: document.querySelectorAll("#strip button.f").length,
        unread: [...document.querySelectorAll("#strip .f.unread")].map((e) => ({
          tag: e.tagName, yr: e.querySelector(".yr")?.textContent.trim() ?? null,
          dis: e.getAttribute("aria-disabled"),
          say: getComputedStyle(e.querySelector(".im.err"), "::after").content,
        })),
      }));
      // ⚠ 読めなかった 1984–86 が残っていること
      must(r.yrs.includes("1984–86"),
        `読めなかった年代を落としている（「無い」と読まれる）: ${r.yrs.join("/")}`);
      must(r.unread.length === 1 && r.unread[0].yr === "1984–86",
        `読めなかったコマが 1 つでない: ${JSON.stringify(r.unread)}`);
      // ⚠ 404 の年代（出島に写真が無い）は、いままでどおり出さない
      for (const gone of ["1979–83", "1987–90", "1936–42"])
        must(!r.yrs.includes(gone), `404 の年代 ${gone} まで出している: ${r.yrs.join("/")}`);
      // ⚠ 押しても何も起きないので、押せる見た目にしない（ADR 0026）
      must(r.unread[0].tag !== "BUTTON", `読めないコマが押せるままになっている: ${r.unread[0].tag}`);
      must(r.unread[0].dis === "true", `読めないコマが aria-disabled でない: ${r.unread[0].dis}`);
      // ⚠ こちらの都合を回線のせいに読ませない。⚠ 進行形にしない
      const say = r.unread[0].say;
      must(!/読み込め|通信|接続|中…|中$/.test(say), `原因を決めつける／進行形の言い方: ${say}`);
      must(/出せません/.test(say), `いま出せないことを言っていない: ${say}`);
      return `1984–86 が押せない枠として残り「${say.replace(/\\A/g, " ")}」／`
        + `押せるコマ ${r.btn}／404 の 3 年代は出ていない`;
    },
  },
  {
    // ⚠ **「動きを減らす」を入れている人に、動きだけを消す。**
    //   ⚠ 静的検査は媒体クエリが「ある」ことしか見られない。
    //     ⚠ **効いているか**は、計算後の値を読まないと分からない。
    name: "「動きを減らす」を入れると、自前の動きが残らない", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "reduce" }),
      // ⚠ **実際に渡している値を記録する。**受け口は素のスクリプトの中にあって
      //   window から呼べない。呼べないものを「確認済み」と言わないための記録。
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      // ⚠ **「判定中…」を除く**（除かないと判定中に素通りする。上と同じ）。
      await page.waitForFunction(
        () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                return t.length > 3 && !t.includes("判定中"); },
        null, { timeout: 90000 });
      const r = await page.evaluate(() => {
        const sec = (v) => v.split(",").map((x) => x.trim())
          .map((x) => x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x));
        const out = [];
        // ⚠ 自前の宣言を持つ要素を、実際に DOM から拾う（決め打ちしない）
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          for (const [k, v] of [["transition", st.transitionDuration], ["animation", st.animationDuration]])
            for (const d of sec(v || "0s"))
              if (d > 0.01) out.push(`${k} ${d}s ${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 24)}`);
        }
        return { slow: [...new Set(out)].slice(0, 6), n: out.length,
                 mq: matchMedia("(prefers-reduced-motion: reduce)").matches };
      });
      must(r.mq, "ブラウザ側で「動きを減らす」になっていない（この検査が何も見ていない）");
      must(r.n === 0, `動きが残っている ${r.n} 件: ${r.slow.join(" / ")}`);
      // ⚠ 寄せる操作も滑らかにしない。**実際に押して、渡った値を読む**
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      // ⚠ 1 件も起きていないなら、この検査は寄せる操作を見ていない。**起きたことを要求する**
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "auto"),
        `寄せる操作が滑らかなまま: ${JSON.stringify([...new Set(siv)])}`);
      return `自前の動き 0 件（transition / animation とも 0.01s 以下）`
        + `／寄せる操作 ${siv.length} 件はすべて auto`;
    },
  },
  {
    // ⚠ **動きを減らしていない人の見え方を変えない。**
    //   ⚠ 「動きを消した」検査だけだと、**全部消してしまっても緑**になる。
    name: "「動きを減らす」でない人には、いままでの動きが残る", path: `/?${TOYOSU}`, group: "core",
    setup: (page) => Promise.all([
      page.emulateMedia({ reducedMotion: "no-preference" }),
      page.addInitScript(() => {
        window.__siv = [];
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (opt) { window.__siv.push(opt); return o.call(this, opt); };
      }),
    ]),
    async check(page) {
      // ⚠ **字を書き写さない**（2026-08-20）。⚠ 以前は答えの言い回しを待っており、
      //   ⚠ **ADR 0030 へ揃えた瞬間に時間切れで落ちた。**
      // ⚠ **「判定中…」を除く**（除かないと判定中に素通りする。上と同じ）。
      await page.waitForFunction(
        () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                return t.length > 3 && !t.includes("判定中"); },
        null, { timeout: 90000 });
      const r = await page.evaluate(() => ({
        lyr: getComputedStyle(document.querySelector(".big .lyr")).transitionDuration,
        bigIn: getComputedStyle(document.querySelector(".big-in")).transitionDuration,
      }));
      // ⚠ 実測値そのもの。丸めない
      must(r.lyr === "0.28s", `年代の重なりが 0.28s でない: ${r.lyr}`);
      must(r.bigIn === "0.35s", `写真の寄せが 0.35s でない: ${r.bigIn}`);
      // ⚠ 寄せる操作も、いままでどおり滑らかであること。
      //   ⚠ これが無いと、**全部 auto にしてしまっても**上の検査は通る
      for (const sel of ["#whyBtn", ".area-item"]) {
        await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
        await settleAfterClick(page);
      }
      const siv = await page.evaluate(() => window.__siv.map((o) => o && o.behavior));
      must(siv.length > 0, "寄せる操作が一度も起きていない（この検査が何も見ていない）");
      must(siv.every((v) => v === "smooth"),
        `動きを減らしていないのに滑らかでない: ${JSON.stringify([...new Set(siv)])}`);
      return `年代の重なり ${r.lyr}／写真の寄せ ${r.bigIn}／寄せる操作 ${siv.length} 件は smooth（いままでどおり）`;
    },
  },
  {
    name: "取り込み済みの土地では、Wikidata を叩かない", path: `/?${TOYOSU}`,
    // 叩いたら分かるように、外向きは落としておく（落ちても静的で答えられるはず）
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      await page.locator("#strip .f").last().click();       // 現在
      await settleAfterClick(page);

      // 外へ出ていないこと
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length === 0,
        "取り込み済みなのに Wikidata を叩いている");
      // それでも中身が出ていること
      const rows = await page.$$eval(".ev-it .ev-l", (els) => els.map((e) => e.textContent.trim()));
      must(rows.length > 0, "取り込んだはずの土地で、一覧が空");
      // 出典は項目ごとに持っている（根拠を出す作法）
      const note = (await page.locator(".ev-src").textContent()).replace(/\s+/g, " ");
      must(/Wikidata/.test(note), "出典が書かれていない");
      return `Wikidata への通信 0 件／一覧 ${rows.length} 件（${rows.slice(0, 2).join("・")}）`;
    },
  },
  {
    // ⚠ ここが穴1の再発点。配り方を z12 に束ねたので、
    //   「束のファイルはある」が「その z14 は見ていない」という状態が生まれる。
    //   束があることを理由に答えてしまうと、**見ていない地面について断定する**。
    //   実測で選んだ点: 束 3588/1626 は mask に1ビットしか立っておらず、
    //   z14 14352/6504 は一度も問い合わせていない（大阪・此花の隣）。
    name: "束はあっても、見ていない区画では答えない",
    path: "/?ll=34.73258,135.36255&q=%E6%9C%AA%E8%A6%8B%E3%81%AE%E5%8C%BA%E7%94%BB",
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期のコマは年で絞れないので、写真の年代へ移ってから見る
      await photoFrames(page).first().click();
      await settleAfterClick(page);
      // 束のファイルは取りに行ってよいが、**それを答えにしない**
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "見ていない区画なのに、束があることを理由に答えている");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `見ていない地面について断定している: 「${w}」`);
      return `束はあるが未問い合わせ → 外へ出て、落ちているので「分かっていません」`;
    },
  },
  {
    // ⚠ 「取り込んでいない」と「調べたが無い」を混ぜない
    name: "未整備の土地では、取り込み済みのふりをしない", path: `/?${UNSURVEYED}`,
    setup: (page) => page.route("**://query.wikidata.org/**", (r) => r.abort()),
    async check(page, reqs) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 未整備なので外へ出る（そして落としてあるので、取れなかったと言うはず）
      must(reqs.filter((u) => /query\.wikidata\.org/.test(u)).length > 0,
        "未整備なのに外へ取りに行っていない（静的の欠けを、答えとして出している）");
      const t = (await page.locator("#ev").textContent()).replace(/\s+/g, " ");
      must(/読み込めませんでした|分かっていません/.test(t),
        `取れなかったことを言っていない: ${t.slice(0, 80)}`);
      for (const w of LIES) must(!t.includes(w), `断定している: 「${w}」`);
      return `未整備なので外へ出る → 落ちているので「分かっていません」`;
    },
  },
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
    name: "粗いカードに、粗いと書く", path: `/?${KARUIZAWA}`,
    async check(page) {
      await waitVerdict(page);
      const drawn = await page.evaluate(() => new Promise((res) => {
        const out = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          out.push(String(t)); return orig.call(this, t, ...a);
        };
        document.getElementById("shareBtn")?.click();
        setTimeout(() => { CanvasRenderingContext2D.prototype.fillText = orig; res(out); }, 1500);
      }));
      const text = drawn.join(" ");
      must(text.length > 0, "共有カードに文字が描かれていない");
      // ⚠ 共有カードは最も遠くまで届く画面。ここで粗さを黙ると被害が最大になる
      must(/広い区分/.test(text), `粗いのに粗いと書いていない: ${text.slice(0, 160)}`);
      must(/実測/.test(text), `読めているのに出典が書かれていない: ${text.slice(0, 160)}`);
      return `カードに「広い区分」あり／${text.slice(0, 50)}…`;
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
  // ---- 建物を取り込み済みの土地では、外へ出ない ----
  // ⚠ タイルは z14 の全面なので、集計したい範囲より広い。そのまま数えると
  //   「豊洲の建物の◯%」が豊洲でない範囲の割合になる（実測で 99.4% → 40.9% に化けた）。
  //   peel は元から「見た範囲と主張の範囲を一致させる」を守っている。壊さない。
  {
    // ⚠ 着いたときの帯の既定は最古＝明治期で、明治期には年が無い。
    //   つまり**初めて来た人が最初に見る事物の枠は、必ずこの注記**だった。
    //   実測（UI/UX・2026-08-14）: 30秒のあいだ「このころ何があった？」が
    //   一度も画面に現れていなかった。説明だけを置いて、次の一歩が無かった。
    name: "明治期に着いた人に、次の一歩がある", path: `/?${TOYOSU}`,
    // ⚠ 指で押す端末で見る。PC では1行に収まって 34px になり、44px の判定が意味を失う
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      const era = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(era === "明治期", `着いたときが明治期でない（この検査の前提が消えた）: ${era}`);

      const step = page.locator("#evStep");
      must(await step.count() === 1, "明治期に着いたのに、次の一歩が無い");
      // ⚠ 指で押せる大きさ。ここは初めて来た人が最初に触る唯一の一歩
      const h = await step.evaluate((e) => e.getBoundingClientRect().height);
      must(h >= 44, `一歩が指で押すには小さい: ${Math.round(h)}px`);
      // ⚠ 年を当てない、という判断は変えていないこと
      const t = (await step.textContent()).replace(/\s+/g, " ");
      must(/年がありません/.test(t), `明治期に年が無いことを言っていない: ${t}`);

      // ⚠ ここが本体。**押した先が空でないこと**。
      //   最初の写真の年代へ送っていた版は、豊洲で 0 件だった（埋立前なので当然）。
      //   「押しても何も起きない一歩」を置かない
      await step.click();
      await settleAfterClick(page);
      const after = (await page.locator("#strip .f.on .yr").textContent()).trim();
      must(after !== "明治期", `押しても年代が動いていない: ${after}`);
      const rows = await page.$$eval("#ev .ev-it .ev-l", (els) => els.length);
      must(rows > 0, `押した先が空（${after} で 0 件）。中身のある年代へ送ること`);
      return `明治期 → ${after} で ${rows} 件／一歩 ${Math.round(h)}px`;
    },
  },
  {
    // ⚠ 「位置を見る」を押した結果が、**画面に入っていること**。
    //   実測（2026-08-14・375×667）: 一覧を読んでいる位置から押すと、写真の枠は
    //   画面の 69px 上にあり、**見えている割合 0%** だった。
    //   利用者役のエージェント3体とも「何も起きない」「押せてないのかと思った」と言った。
    //   ⚠ 同じ症状を過去に静止画の経路では直してあり、そのコメントもすぐ下にあったのに、
    //     地図の経路だけ return していて手当てに届いていなかった。
    name: "行を押すと、寄った結果が画面に入る", path: `/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await settleAfterCondition(page);
      // 一覧を読んでいる位置（画面の真ん中）から押す
      await page.evaluate(() => document.querySelector(".ev-it")?.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      const seen = () => page.evaluate(() => {
        const r = document.getElementById("big").getBoundingClientRect();
        return { pct: Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
          / r.height * 100), zoom: document.getElementById("big").classList.contains("zoom") };
      });
      const before = await seen();
      const name = (await page.locator(".ev-it").first().locator(".ev-l").innerText()).trim();
      await page.locator(".ev-it").first().click();
      // ⚠ 押した先で画面が寄る。⚠ **寄り終わるまで待つ**（時間で待たない）
      await page.waitForFunction(() =>
        document.getElementById("big")?.classList.contains("zoom"), null, { timeout: 30000 });
      await settleAfterScroll(page);
      const after = await seen();
      must(after.zoom, "押しても寄っていない");
      // ⚠ ここが本体。寄っただけで見えていなければ、押しても何も起きないのと同じ。
      //   ⚠ 実装が「半分見えていれば動かさない」、検査が「8割見えていること」で食い違っていた。
      //     写真の下から操作を1つ外して版面が 20px 縮んだだけで表に出た（広島 65%・2026-08-16）。
      //     → 要求（8割）はここに置いたまま、画面側の約束が下がっていないことも見る。
      //       定数を読むだけにすると、実装を下げたときに検査も一緒に下がって気づけない。
      const promised = await page.evaluate(() => SEEN_ENOUGH);
      must(promised >= 0.8, `画面側が約束している割合が下がっている（SEEN_ENOUGH=${promised}）`);
      must(after.pct >= 80, `寄った結果が画面に入っていない（見えているのは ${after.pct}%）`);
      // ⚠ 「寄った」だけでは足りない。実測（2026-08-14・利用者役のエージェント3体）: 押した行は
      //   画面から出ていき、17行中15行で**名前がどこにも残らなかった**。
      //   画面にはぼやけた写真と同じ色の丸が複数あるだけで、
      //   「動いたのは分かるが、何に寄ったのか分からない」と3体とも報告した。
      const fx = await page.evaluate(() => {
        const el = document.getElementById("fx");
        if (!el) return { there: false };
        const r = el.getBoundingClientRect();
        return { there: true, text: el.innerText.trim(),
          vis: getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0,
          size: parseFloat(getComputedStyle(el).fontSize) };
      });
      must(fx.there, "寄せた先に名前を出す枠(#fx)が無い");
      must(fx.vis, "寄せたのに、押したものの名前が画面に出ていない");
      must(fx.text.includes(name),
        `寄せた先の名前が押したものと違う: 押した「${name}」／出ている「${fx.text}」`);
      must(fx.size >= 12, `寄せた先の名前が小さい: ${fx.size}px`);
      // ⚠ 名前が年バッジを覆わないこと。
      //   実測（2026-08-15）: .fx を bottom:46px で別に置いていたら、sub を持つ年代
      //   （1936–42 陸軍撮影 / 1945–50 米軍撮影 / 現在 / 明治期 ＝ 9 コマ中 4 つ）で
      //   年バッジが 46px より高くなり、102×10px 覆っていた。
      //   「米軍撮影」は元から 11.5px で読みにくいのに、その上を隠していた。
      const lap = await page.evaluate(() => {
        const a = document.getElementById("fx").getBoundingClientRect();
        const c = document.querySelector(".strip-title").getBoundingClientRect();
        return { px: Math.round(Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top))),
          yr: document.querySelector(".strip-title").innerText.replace(/\s+/g, " ").trim() };
      });
      must(lap.px === 0, `寄せた先の名前が年バッジ「${lap.yr}」を ${lap.px}px 覆っている`);
      // ⚠ 押した印が、他の印と見分けられること。
      //   地図の印には data-i が付いておらず、実測で印 9 個に対し強調 0 個だった。
      // ⚠ 印は2組ある。静止画の上に打つ #pins の印と、地図の上の印。
      //   地図に切り替わっても #pins は消えないので、全部を1つに数えて
      //   「強調は1個」と書くと必ず落ちる（実測 印16個・強調2個で、これは正しい状態）。
      //   組ごとに「ちょうど1個」を見る。
      const pins = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".big .pin")];
        const g = { 写真: [], 地図: [] };
        for (const e of all) g[e.closest("#pins") ? "写真" : "地図"].push(e);
        return { noIdx: all.filter((e) => e.dataset.i === undefined).length, total: all.length,
          sets: Object.entries(g).filter(([, v]) => v.length)
            .map(([k, v]) => [k, v.length, v.filter((e) => e.classList.contains("on")).length]) };
      });
      must(pins.sets.length > 0, "印が1つも無い");
      must(pins.noIdx === 0, `番号(data-i)の無い印が ${pins.noIdx}/${pins.total} 個ある`);
      for (const [k, n, on] of pins.sets)
        must(on === 1, `${k}の印が強調されていない: ${n} 個中 ${on} 個`);
      // 戻したら、名前も強調も消える（前の年代の名前が写真の上に残らない）
      await page.click("#unzoom");
      await settleAfterClick(page);
      const back = await page.evaluate(() => ({
        fx: document.getElementById("fx").innerText.trim(),
        on: document.querySelectorAll(".big .pin.on,.ev-it.on").length }));
      must(!back.fx && back.on === 0,
        `全体に戻したのに残っている: 名前「${back.fx}」／強調 ${back.on} 個`);
      return `写真が見えている ${before.pct}% → ${after.pct}%`
        + `／名前「${fx.text}」${fx.size}px`
        + `／${pins.sets.map(([k, n, on]) => `${k}の印 ${n} 個中 ${on} 個を強調`).join("・")}`
        + `／戻すと消える`;
    },
  },
  {
    // ⚠ 3D から戻ったとき、調べていた場所が消えないこと。
    //   以前は href="./" のままで、← を押すと空のトップに戻っていた
    //   （利用者役のエージェントによる検証で3体すべてが「最初からになった」と言った）。
    // ⚠ 共有先は**別の入れ物**で開く。同じ入れ物で開き直すと、画面に残っている状態で
    //   通ってしまい、URL が状態を運べているのかを何も確かめていないことになる
    //   （実測 2026-08-16: 直す前は トップ data-i=8 → 共有先 0、/peel t=400 → 0 に戻っていた）。
    name: "選んだ年代が URL に載り、共有先でもそこから始まる", path: `/?${TOYOSU}`,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      const n = await page.locator("#strip .f").count();
      // いちばん右（現在）を選ぶ。着いたときの既定は最古なので、必ず動く
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      const url = page.url();
      must(/[?&]era=seamlessphoto/.test(url), `選んだ年代が URL に載っていない: ${url}`);

      // --- 共有先（別の入れ物） ---
      const ctx = await page.context().browser().newContext({
        viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p2 = await ctx.newPage();
      let top = null, peel = null;
      try {
        await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await p2.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
          null, { timeout: 60000 });
        await p2.waitForTimeout(300);
        top = await p2.evaluate(() => [...document.querySelectorAll("#strip .f")]
          .findIndex((e) => e.classList.contains("on")));
        must(top === n - 1, `共有先で年代が既定に戻っている: ${top} / ${n - 1}`);

        // /peel も同じ約束。段は土地ごとに間引かれるので、位置ではなく年代IDで運ぶ
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p2);
        await p2.waitForTimeout(1200);
        await p2.$eval("#t", (e) => { e.value = "400";
          e.dispatchEvent(new Event("input", { bubbles: true })); });
        await p2.waitForTimeout(500);
        const purl = p2.url();
        must(/[?&]era=gazo1/.test(purl), `/peel の年代が URL に載っていない: ${purl}`);
        const p3 = await ctx.newPage();
        await p3.goto(purl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await peelReady(p3);
        await p3.waitForTimeout(1500);
        peel = await p3.$eval("#t", (e) => e.value);
        // ⚠ 段の境界ちょうどで戻ること。中途半端な値だと年代名は出ても場面が入りきらない
        must(peel === "400", `/peel の共有先で段が戻っていない: ${peel}`);
      } finally { await ctx.close(); }
      return `トップ ${n} コマ中 ${top} 番目／/peel t=${peel}（どちらも別の入れ物で復元）`;
    },
  },
  {
    // ⚠ 指定された年代がその土地に無いことは普通に起きる（残っている写真は土地ごとに違う）。
    //   黙って別の年代を出すと、共有した人と見た人が違うものを見ていることに誰も気づかない。
    //   長崎 出島には 1936–42（ort_riku10）が残っていない。
    name: "共有された年代がその土地に無いとき、黙って別の年代にしない",
    path: `/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6&era=ort_riku10`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll("#strip .f").length > 0,
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      must(await page.locator("#eraMiss").count() === 1,
        "復元できなかったことを、画面で言っていない");
      const t = (await page.locator("#eraMiss").textContent()).replace(/\s+/g, " ").trim();
      must(/1936/.test(t), `求められた年代の名前が出ていない: ${t}`);
      // ⚠ 畳んだ中や画面外に置かない（過去に「判定の結果を畳んだ中に入れた」を踏んでいる）
      const shown = await page.locator("#eraMiss").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
          && getComputedStyle(e).opacity !== "0"; });
      must(shown, "復元できなかったことが画面に見えていない");
      // ⚠ 年代を選ぶ帯より上にあること。選ぶ場所から離すと、次に何をすればよいか分からない
      const order = await page.evaluate(() => {
        const a = document.getElementById("eraMiss"), b = document.getElementById("strip");
        return a && b ? a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top + 1 : false;
      });
      must(order, "案内が、年代を選ぶ帯の上に無い");
      // 出ていない年代を URL に残さない。残すと同じ空振りが共有のたびに伝播する
      must(!/era=ort_riku10/.test(page.url()), `出ていない年代が URL に残っている: ${page.url()}`);
      // 自分で選び直したら、案内は役目を終える
      await page.evaluate(() => [...document.querySelectorAll("#strip .f")].at(-1).click());
      await settleAfterClick(page);
      must(await page.locator("#eraMiss").count() === 0,
        "年代を選び直しても、案内が残っている");
      return `「${t.slice(0, 34)}」／帯の上に見えている／選び直すと消える`;
    },
  },
  {
    // ⚠ 説明は、押す前に読めるところに出す。
    //   利用者役のエージェントによる検証2周（2026-08-14/15）で、3体の第1位はどちらも「押す前に知りたい」で、
    //   アコーディオン（開かないと読めない）と「…で切り詰めて押すと続き」は
    //   合わせて 0 票だった。後者は PC で「…」が 0 / 2,225 件しか出ず、導線が現れない。
    //   ⚠ 同時に、名前を読めば分かるだけの説明は出さない（実測 29.7% が空になる）。
    name: "説明は押す前に読めて、名前の言い換えは出さない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    async check(page) {
      await waitVerdict(page);
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 40000 });
      await settleAfterCondition(page);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".ev-it")].map((e) => ({
        name: e.querySelector(".ev-l")?.innerText.trim() ?? "",
        d: e.querySelector(".ev-d")?.innerText.trim() ?? "",
        // 押す前に、その場で読めていること（開く操作を挟まない）
        vis: !!e.querySelector(".ev-d")?.checkVisibility({ checkVisibilityCSS: true }) })));
      must(rows.length > 0, "一覧が空");
      const withD = rows.filter((r) => r.d);
      must(withD.length > 0, "説明が1件も出ていない");
      must(withD.every((r) => r.vis), "説明が、押すまで読めない場所にある");
      // ⚠ 前置きを落としていること。落とさないと本題が「…」の向こうへ行く
      const lazy = withD.filter((r) => /に(ある|あった|所在)/.test(r.d)
        && /^(日本の|.{2,8}?[都道府県市区町村])/.test(r.d));
      must(lazy.length === 0,
        `地名の前置きが残っている: ${lazy.slice(0, 2).map((r) => r.d).join(" / ")}`);
      // ⚠ 読んでも増えない説明を出していないこと
      const echo = withD.filter((r) =>
        r.name.replace(/[\s・]/g, "").includes(r.d.replace(/[\s・]/g, "")));
      must(echo.length === 0,
        `名前に既出の説明を出している: ${echo.slice(0, 2).map((r) => `${r.name}／${r.d}`).join(" / ")}`);
      // ⚠ 説明が出ない行を「説明が無い」と読ませない
      const src = (await page.locator(".ev-src").innerText()).replace(/\s+/g, " ");
      must(/落とすと何も残らない項目には出ません/.test(src),
        `説明を落としていることを書いていない: ${src.slice(0, 100)}`);
      // ⚠ 行ごとの「位置を見る」は外した。案内は見出しの下に 1 回だけ。
      //   実測（2026-08-15）: PC では説明のある行で **名前と説明のあいだ**に入り、
      //   説明の無い行では右端に来て、同じ画面で位置が 2 か所を行き来していた。
      must(await page.locator(".ev-go").count() === 0,
        "行ごとの「位置を見る」が残っている");
      const tips = await page.locator(".ev-tip").count();
      must(tips === 1, `押せることの案内が ${tips} 個（1 個であること）`);
      must(await page.locator(".ev-tip").checkVisibility?.() !== false, "案内が見えていない");
      // ⚠ 件数ピルが潰れていないこと（flex-wrap が無いと 375/320px で 2 行に割れる）
      const pill = await page.evaluate(() => {
        const e = document.querySelector(".ev-n"); if (!e) return null;
        const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      must(pill && pill.h <= 24, `件数が2行に割れている: ${JSON.stringify(pill)}`);
      return `${withD.length} / ${rows.length} 行に説明（押す前に読める）／例「${withD[0].d}」`
        + `／行のラベルなし・案内は見出しの下に 1 個・件数 ${pill.w}×${pill.h}px`;
    },
  },
  {
    // ⚠ **主題は「古い候補で上書きされないこと」**（hidetzu/konjaku#191）。⚠ **絵は関係ない。**
    //   ⚠ **実測**: 外へ 30 本。⚠ **住所検索は差し替え済みで、⚠ 残りは地図の絵だった。**
    name: "検索中に場所を選んでも、行動一覧が古い候補で上書きされない", dep: "search", path: "/",
    setup: async (page) => {
      await stubMapPictures(page);
      await page.route("**/AddressSearch*", async (r) => {
        await new Promise((x) => setTimeout(x, 2000));
        await r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify([{ properties: { title: "東京都渋谷区" },
                                  geometry: { coordinates: [139.7, 35.66] } }]) });
      });
    },
    async check(page) {
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(1000);         // 応答はまだ返っていない
      await page.locator(".quick button").first().click();   // 場所を選ぶ（setMode("action")）
      // ⚠ **2026-08-21 に、⚠ 一覧は既定で畳んだ。**⚠ 行ではなく組の見出しを待つ
      await page.waitForFunction(() => document.querySelectorAll("#list .lh.fold").length > 0,
        null, { timeout: 20000 });
      // ⚠ **2026-08-21 に、⚠ 深掘りは判定カードへ移った。**⚠ 一覧に出るのは組の見出し
      const acted = (await page.locator("#list").innerText()).trim();
      must(/公的な情報で確認する/.test(acted),
        `場所を選んでも行動一覧が出ていない: ${JSON.stringify(acted.slice(0, 40))}`);
      must(await page.locator("#verdict #peelCta").count() === 1,
        "場所を選んでも、判定カードに次の体験が出ていない");
      await settleAfterCondition(page);         // ⚠ ここで古い応答が届く
      const after = (await page.locator("#list").innerText()).trim();
      must(!/渋谷区/.test(after),
        `場所を選んだのに、行動一覧が古い候補で上書きされた: ${JSON.stringify(after.slice(0, 40))}`);
      // ⚠ 「変わらないこと」は見ない。判定が進むと行動一覧は**正当に増える**
      //   （最初そう書いて落ちた）。見たいのは**行動一覧のままであること**。
      // ⚠ **2026-08-21 に、⚠ 深掘りは判定カードへ移った。**⚠ 一覧側の目印は組の見出し
      must(/公的な情報で確認する/.test(after),
        `行動一覧でなくなっている: ${JSON.stringify(after.slice(0, 40))}`);
      must(await page.locator("#verdict #peelCta").count() === 1,
        "古い応答が届いたあと、判定カードから次の体験が消えている");
      return `行動一覧のまま（${JSON.stringify(after.slice(0, 18))}）／次の体験は判定カードに 1 つ`;
    },
  },
  {
    // ⚠ **「まだ用意していない」を「取得できなかった」と言わない**（2026-08-18）。
    //   このリポジトリが何度も直してきた並びに、1 行足りていなかった:
    //
    //       観測されていない   ≠  存在しなかった
    //       取得できなかった   ≠  存在しなかった
    //       データにない       ≠  現実にない
    //       まだ用意していない ≠  取得できなかった   ← これ
    //
    //   前者は**こちらの都合**、後者は**相手や回線の都合**。
    //   利用者にとっては「押し直すべきか」が変わるので、意味がまるで違う。
    //
    // ⚠ 実際に破れていた: 一度も取り込んでいない名古屋で
    //   「建物データを取得できませんでした（**Overpass 混雑**）」と書いていた。
    //   利用者役 3/3 がこれを「**自分の通信のせい**」と読み、2 名が「押し直す」と答えた。
    //
    // ⚠ **導線は消さない。** 一度「下地が無い場所では出さない」にしたが、戻した。
    //   出さないと「まだ用意していない」が「この場所には機能そのものが無い」に見え、
    //   利用者役 3/3 が「機能があること自体に気づけない」と答えた。
    // ⚠ そのかわり**押す前に**言う。押して、待たされてから言われるのが最悪、という指摘。
    name: "まだ用意していない場所を、取得できなかったと言わない", path: "/",
    async check(page) {
      const NAGOYA = "q=%E5%90%8D%E5%8F%A4%E5%B1%8B&ll=35.17090,136.88160";
      const top = async () => {
        await page.waitForFunction(
          // ⚠ **字を書き写さない。**⚠ 以前は「です」「ません」を待っており、
          //   ⚠ **言い回しを変えた瞬間に時間切れで落ちた**（2026-08-20）。
          // ⚠ **「判定中…」を除く。**⚠ 除かないと**判定中に素通りする**
          //   （答えの行は、待っているあいだも「この土地の成り立ちを判定中…」を出している。
          //    ⚠ 手元では速くて素通りせず、⚠ **CI で落ちた**）。
          () => { const t = (document.querySelector("#verdict .v-head")?.innerText ?? "").trim();
                  return t.length > 3 && !t.includes("判定中"); },
          null, { timeout: 45000 });
        await settleAfterCondition(page);
        return page.evaluate(() => ({
          // ⚠ **2026-08-21 に、⚠ 導線が一覧から判定カードの中へ移った**
          peel: document.querySelectorAll('#verdict [href^="./peel"]').length,
          ownPeel: document.querySelectorAll('#own a[href^="./peel"]').length,
          // ⚠ **2026-08-21 に、⚠ 深掘りの字は判定カードへ移った。**⚠ CTA の字を読む
          list: (document.getElementById("peelCta")?.innerText ?? "").replace(/\s+/g, " "),
          own: (document.getElementById("own")?.innerText ?? "").replace(/\s+/g, " "),
        }));
      };
      // (1) 取り込んである場所（豊洲）: 出る。⚠ 断り書きは付けない
      await page.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded" });
      const yes = await top();
      // ⚠ **導線は一覧の 1 か所**（2026-08-21。hidetzu/konjaku#138）。
      //   ⚠ 以前は根拠パネルにも同じカードがあり、⚠ **ここで 2 本あることを求めていた。**
      //   ⚠ 利用者役 4/4 が根拠側を否定した（唐突／2 回出る／根拠の一部に見える）。
      //   ⚠ **見ている主張は変えていない**: 取り込んである場所で導線が出ること。
      must(yes.peel === 1, `取り込んである場所で導線が出ていない: 判定カード ${yes.peel} 本`);
      must(yes.ownPeel === 0,
        `根拠パネルに導線が戻っている: ${yes.ownPeel} 本（導線は一覧の 1 か所）`);
      must(!/順に増やしています/.test(yes.list),
        `対応してある場所に、対応していないと書いている: ${yes.list.slice(0, 80)}`);
      // (2) まだ用意していない場所（名古屋）: ⚠ **出る。押せる。** そのうえで押す前に言う
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const no = await top();
      must(no.peel === 1, `まだ用意していない場所で導線が消えている（機能の存在に気づけない）: ${no.peel} 本`);
      // ⚠ **できないことの通知ではなく、できることの案内から始める**（利用者役 3/3）。
      //   「用意できていません」で始まる案を 3/3 が最下位にした（押す前に断られた、と読む）。
      must(/空中写真|見くらべる/.test(no.list),
        `押す前に、この場所でできることを言っていない: ${no.list.slice(0, 90)}`);
      // ⚠ そのうえで、建物ごとの判定が出ないことは**押す前に**分かること
      must(/対応した場所から順に増やしています/.test(no.list),
        `押す前に、建物ごとの判定が出ないと分からない: ${no.list.slice(0, 90)}`);
      // ⚠ **⚠ の記号を使わない。**すぐ上の「この土地で気をつけること」（災害リスク）と
      //   同じ印になり、利用者役 2/3 が「危ない土地の警告か」と読んだ
      const mark = await page.evaluate(() =>
        document.querySelector('#verdict [href^="./peel"]')?.innerText ?? "");
      must(!mark.includes("⚠"), `在庫の話に ⚠ を使っている（危険の印と紛らわしい）: ${mark.slice(0, 60)}`);
      // ⚠ **根拠パネルに導線を戻さない**（2026-08-21。hidetzu/konjaku#138）。
      //   ⚠ 以前は「一覧と根拠カードで言うことが変わらない」を見ていたが、
      //     ⚠ **根拠カードそのものを消した**ので、⚠ **戻っていないことを見る。**
      //   ⚠ **言い方が 1 か所であることは、⚠ 静的検査が字の持ち主で見ている**
      //     （TOPWORD.peelLead の 1 か所）。
      must(no.ownPeel === 0,
        `根拠パネルに導線が戻っている: ${no.ownPeel} 本（導線は一覧の 1 か所）`);
      // (3) ⚠ 索引を読めなかっただけのときは、何も断らない（取得できなかった ≠ 用意していない）
      await page.route("**/data/assets.json", (r) => r.abort());
      await page.goto(`${BASE}/?${NAGOYA}`, { waitUntil: "domcontentloaded" });
      const unknown = await top();
      must(unknown.peel === 1, `索引を読めないだけで導線を消している: ${unknown.peel} 本`);
      must(!/順に増やしています/.test(unknown.list),
        `索引を読めなかっただけなのに「対応していない」と断定している: ${unknown.list.slice(0, 90)}`);
      await page.unroute("**/data/assets.json");
      return `対応済み 1 本（断りなし）／未対応 1 本（押す前に断る・⚠ なし・根拠には置かない）／`
        + `索引を読めないときは断らない`;
    },
  },
  ...[["トップ", "/", "#list", false]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 別の語へ変えたら、前の語の候補が出ない`, dep: "search", path,
    // ⚠ 「渋谷」だけ遅らせる。実際の地理院には出ない
    setup: (page) => page.route("**/AddressSearch*", async (r) => {
      const q = decodeURIComponent(new URL(r.request().url()).searchParams.get("q") ?? "");
      if (q === "渋谷") await new Promise((x) => setTimeout(x, 2000));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ properties: { title: q === "渋谷" ? "東京都渋谷区" : "東京都新宿区" },
                                geometry: { coordinates: [139.7, 35.66] } }]) });
    }),
    async check(page) {
      if (needOpen) { await page.click("#findLabel"); await page.waitForTimeout(300); }
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(2150);         // 古い応答が届く直前
      await page.fill("#q", "新宿");
      await page.waitForTimeout(250);          // ⚠ 新しい検索はまだ始まっていない
      const mid = (await page.locator(listSel).innerText().catch(() => "")).trim();
      must(await page.inputValue("#q") === "新宿", "入力欄が「新宿」になっていない");
      must(!/渋谷/.test(mid),
        `別の語へ変えたのに、前の語の候補が出ている: ${JSON.stringify(mid.slice(0, 40))}`
        + `（押すと違う場所へ飛ぶ）`);
      // 新しい語の候補は、そのあとちゃんと出る
      await page.waitForFunction(() => /新宿/.test(document.body.innerText), null, { timeout: 20000 });
      return `切替中は ${JSON.stringify(mid.slice(0, 14))} ／ そのあと新宿が出る`;
    },
  })),
  // ⚠ **入力を消したのに、遅れて返った候補が復活しない。**
  //   2026-08-15 に**両画面で再現させた**: 検索中に入力を空にすると、
  //   空の入力欄のまま候補が並んだ。原因は「2文字未満で return するとき、
  //   検索の世代を進めていなかった」こと。**同じ実装が2つあったので、両方に同じ穴があった。**
  //   いまは places.js の createSearch().cancel() を両画面が呼ぶ。
  //   ⚠ 応答を遅らせて作る。実際の地理院には出ない。
  // ⚠ 3D の側は 2026-08-18 に外した（あちらから検索そのものを外したため）。
  //   ⚠ **組の形は残す。** 検索を持つ画面が増えたら、ここへ足せば同じ穴を両方で見られる。
  ...[["トップ", "/", "#list", false]].map(([who, path, listSel, needOpen]) => ({
    name: `${who}: 入力を消したら、遅れて返った候補が復活しない`, dep: "search", path,
    setup: (page) => page.route("**/AddressSearch*", async (r) => {
      await new Promise((x) => setTimeout(x, 2500));
      await r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ properties: { title: "東京都渋谷区" }, geometry: { coordinates: [139.7, 35.66] } },
                              { properties: { title: "渋谷駅" }, geometry: { coordinates: [139.7, 35.65] } }]) });
    }),
    async check(page) {
      if (needOpen) { await page.click("#findLabel"); await page.waitForTimeout(300); }
      await page.fill("#q", "渋谷");
      await page.waitForTimeout(900);          // 応答はまだ返っていない
      await page.fill("#q", "");               // ⚠ ここで世代が進まないと復活する
      await page.waitForTimeout(3200);         // 遅れた応答が返る
      const shown = (await page.locator(listSel).innerText().catch(() => "")).trim();
      const value = await page.inputValue("#q");
      must(value === "", `入力欄が空になっていない: ${JSON.stringify(value)}`);
      must(!/渋谷/.test(shown),
        `入力を消したのに、遅れて返った候補が復活している: ${JSON.stringify(shown.slice(0, 40))}`);
      return `入力欄 空 ／ 一覧 ${shown ? JSON.stringify(shown.slice(0, 20)) : "空"}`;
    },
  })),
  // ⚠ ここに「3D の検索も、取れなかったときに『無い』と言わない」があった
  //   （2026-08-18 に外した。/peel から検索を外したため）。
  //   ⚠ **掟は生きている。**同じ主張は「検索が失敗したとき「無い」と言わない」（トップ）が見ている。
  //   ⚠ /peel に検索を戻すなら、この検査も一緒に戻すこと。
  {
    // ⚠ ev と bld の索引を混ぜない。混ぜると「建物が見たタイル」が
    //   「事物も見た」ことになる（設計レビューが実験で再現）
    // ⚠ ローカルの配信（serve.js）が、本番（_headers）と同じ方針で返しているか。
    //   実際に踏んだ（2026-08-15）: `rel.startsWith("vendor")` と書いてあったが
    //   `rel` は `/vendor/…` の形なので **常に false**。
    //   「MapLibre は 1MB あるのでキャッシュさせる」と書いてあったのに、**一度も効いていなかった**。
    //   ⚠ 文字列の先頭一致を、正規化の結果とずらした型。字面を見るだけの検査では捕まらないので、
    //     **実際に取って、返ってきたヘッダを見る**。
    name: "配信のキャッシュ方針が、本番と食い違っていない", path: "/",
    async check(page) {
      const got = {};
      for (const u of ["/vendor/maplibre-gl.js", "/vendor/maplibre-gl.css",
                       "/index.html", "/peel", "/data/bl/index.json"]) {
        const r = await page.request.get(BASE + u);
        must(r.ok(), `${u} が取れない（${r.status()}）`);
        got[u] = r.headers()["cache-control"] ?? "(無い)";
      }
      // ⚠ **vendor も毎回確認させる**（2026-08-16 に変えた）。
      //   以前は「名前が変わる前提だから長く持たせてよい」としていたが、
      //   実ファイル名は maplibre-gl.js で**固定**で、その前提が嘘だった。
      //   長く持たせると、MapLibre を上げても**古いものが返り続ける**。
      //   ⚠ immutable も外した。ファイル名をハッシュ付きにできたら、また長く持たせる。
      for (const u of Object.keys(got))
        must(/no-cache|max-age=0/.test(got[u]), `${u} が長く残る: ${got[u]}`);
      // ⚠ 「全部 max-age=0」だけでは、**取れていないのに通る**空振りになりうる。
      //   実際に値が読めていることを見る。
      must(Object.values(got).every((v) => v !== "(無い)"),
        `キャッシュ方針が読めていない: ${JSON.stringify(got)}`);
      return `${Object.keys(got).length} 本とも ${got["/index.html"]}`;
    },
  },
  {
    name: "建物の索引と、事物の索引を混ぜない", path: "/",
    async check(page) {
      const both = await page.evaluate(async () => {
        const ev = await fetch("./data/ev/index.json").then((r) => r.ok ? r.json() : null);
        const bl = await fetch("./data/bl/index.json").then((r) => r.ok ? r.json() : null);
        return { ev, bl };
      });
      must(both.ev && both.bl, "索引が読めない");
      must(both.ev.z === 12 && both.bl.z === 14,
        `索引の粒度が想定と違う: ev z${both.ev.z} / bl z${both.bl.z}`);
      // 別ファイル・別粒度であること（同じ形にすると、いつか混ざる）
      must(JSON.stringify(both.ev.tiles) !== JSON.stringify(both.bl.tiles),
        "2つの索引が同じ中身になっている");
      return `ev z${both.ev.z} ${Object.keys(both.ev.tiles).length} 束／`
        + `bl z${both.bl.z} ${Object.keys(both.bl.tiles).length} タイル`;
    },
  },
  // ---- 高さが推定であることを、主張範囲の数字で言う ----
  // ⚠ 3D で立っている街の形は、ほとんどがこちらで決めた既定値。
  //   99.6%（足元が水だった割合）は1件ずつ画素を読んだ実測なのに、
  //   その数字が乗っている**絵のほうが推定**、というねじれを黙らない。
  // ⚠ 数字は「この画面が名乗る範囲」のもの。取り込み全域の 93.8% を出すと、
  //   99.4% を 40.9% に化けさせたのと同じ事故（範囲と主張のずれ）になる。
  {
    // Issue の再現手順そのもの。取り込み済みの土地（広島）の ev タイル1枚を差し替える
    name: "外部の文字列が、事物の一覧・印・寄せた先で実行されない",
    path: "/?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6",
    setup: (page) => page.route("**/data/ev/12/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ tile: [12, 0, 0], at: "2026-08-15", f: [
        { id: "Q1", l: `広島城${XSS}`, k: "建造物", c: [132.45500, 34.39500],
          y: [1589, null], p: "year", n: `毛利輝元が築いた城${XSS}`,
          // ⚠ esc() だけでは href="javascript:…" は塞げない。押した瞬間に実行される
          u: `javascript:window.__pwned=(window.__pwned||0)+1` },
      ] }),
    })),
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForFunction(() => {
        const t = document.getElementById("ev")?.textContent ?? "";
        return t.length > 0 && !t.includes("調べています");
      }, null, { timeout: 40000 });
      // 明治期の帯には年が無いので、写真のある年代へ動かす
      await photoFrames(page).first().click();
      await page.waitForFunction(() => document.querySelectorAll(".ev-it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#ev", "一覧");
      const row = await shownAsText(page, ".ev-it .ev-l", "一覧の名前");
      await shownAsText(page, ".ev-it .ev-d", "一覧の説明");
      // 出典URL が http/https でないときは、リンクそのものを出さない
      must(await page.locator(".ev-u").count() === 0,
        "javascript: の出典URLが、押せるリンクとして出ている");
      // 写真の上の印（title 属性の中も HTML）
      await notRun(page, "#pins", "写真の印");
      const pin = await page.locator("#pins .pin").first().getAttribute("title");
      must((pin ?? "").includes("<img"), `印の title に生の文字が残っていない: ${pin}`);
      // 押した先（#fx）。2026-08-15 に足して、エスケープを忘れていた場所
      await page.locator(".ev-it").first().click();
      await page.waitForFunction(() => (document.getElementById("fx")?.textContent ?? "").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#fx", "寄せた先");
      await shownAsText(page, "#fx", "寄せた先の名前");
      return `一覧・印・#fx で発火 0 ／ 表示は生のまま「${row.trim().slice(0, 18)}…」／ javascript: のリンクは出さない`;
    },
  },
  {
    name: "外部の文字列が、検索候補で実行されない", path: "/",
    setup: (page) => page.route("**/address-search/**", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([
        { geometry: { type: "Point", coordinates: [139.7975, 35.6548] },
          properties: { title: `東京都江東区豊洲${XSS}`, dataSource: "", addressCode: "13108" } },
      ]),
    })),
    async check(page) {
      await page.fill("#q", "豊洲");
      await page.waitForFunction(() => document.querySelectorAll("#list .it").length > 0,
        null, { timeout: 30000 });
      await notRun(page, "#list", "検索候補");
      const t = await shownAsText(page, "#list .it", "検索候補の地名");
      return `候補で発火 0 ／ 表示は生のまま「${t.trim().slice(0, 22)}…」`;
    },
  },
  {
    // ⚠ 地名は共有された URL（?q=）から来る。押させるだけで届く経路なので、
    //   保存一覧と共有カードまで見る
    name: "共有された URL の地名が、保存一覧と共有カードで実行されない",
    path: `/?ll=35.65480,139.79750&q=${encodeURIComponent(`豊洲${XSS}`)}`,
    async check(page) {
      await waitVerdict(page);
      // ★を付けると保存一覧に出る
      await page.click("#mineToggle");
      await page.locator("#stars button").first().click();
      await page.waitForFunction(() => document.querySelectorAll("#saved .row").length > 0,
        null, { timeout: 20000 });
      await notRun(page, "#saved", "保存一覧");
      const t = await shownAsText(page, "#saved .row", "保存一覧の地名");
      // 共有カードは canvas に描く（HTML を組み立てていない）。実際に押して確かめる
      await page.click("#shareBtn");
      await page.waitForFunction(() => {
        const n = document.getElementById("shareMsg");
        return n && n.style.display === "block";
      }, null, { timeout: 20000 });
      await notRun(page, "body", "共有カード");
      const msg = await page.locator("#shareMsg").textContent();
      return `保存一覧・共有カードで発火 0 ／ 表示は生のまま「${t.trim().slice(0, 16)}…」／ 共有「${msg}」`;
    },
  },
];
