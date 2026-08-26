// トップ（`/`） の実描画ケース（2026-08-22。hidetzu/konjaku#187）。
// ⚠ **`render.mjs` から切り出しただけ**で、⚠ ケースの中身は 1 行も変えていない。
// ⚠ **この suite だけを回せる**: `node scripts/render.mjs --suite=top`
// ⚠ **ここに道具を書かない**（⚠ `lib.mjs` が持つ。⚠ 2 か所に書くと片方だけ古くなる）。

// ⚠ **標準の口は、⚠ 使う側が取り込む**（⚠ lib から又貸ししない）。
import { readFile } from "node:fs/promises";
// ⚠ **外から来た文字列の 3 件は `top-escape.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **末尾に spread し直すので、⚠ 並びもシャードの割り当ても動かない。**
import { CASES as ESCAPE_CASES } from "./top-escape.mjs";
// ⚠ **共有と、そのときに数えるものは `top-share.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **散らばった 6 件を集めたので、⚠ 並びは動く**（⚠ 件数と判定の字は変わらない）。
import { CASES as SHARE_CASES } from "./top-share.mjs";
// ⚠ **外との境目は `top-outside.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **`top-escape.mjs`（外から来たもの）と対**。⚠ 散らばった 4 件を集めたので並びは動く。
import { CASES as OUTSIDE_CASES } from "./top-outside.mjs";
// ⚠ **この範囲にあったものは `top-events.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as EVENTS_CASES } from "./top-events.mjs";
// ⚠ **年代を動かす／明治期を重ねるは `top-eras.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 1 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as ERASMOVE_CASES } from "./top-eras.mjs";
// ⚠ **場所を選んだあとの一歩は `top-next.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **連続した 7 件をそのままの並びで運んだ**ので、⚠ **並びは動かない。**
import { CASES as NEXT_CASES } from "./top-next.mjs";
// ⚠ **年代の帯は `top-strip.mjs` へ出した**（2026-08-26。hidetzu/konjaku#277）。
//   ⚠ **見出し 2 本ぶんを連続で運んだ**ので、⚠ **並びは動かない。**
import { CASES as STRIP_CASES } from "./top-strip.mjs";
// ⚠ **取れなかったを「無い」と言わないは `top-unreachable.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 5 件をそのままの並びで運んだ。**
import { CASES as UNREACH_CASES } from "./top-unreachable.mjs";
// ⚠ **場所を探すは `top-search.mjs` へ出した**（2026-08-27。hidetzu/konjaku#277）。
//   ⚠ **2 つの連続した塊を集めたので、⚠ 並びは動く。**
import { CASES as SEARCH_CASES } from "./top-search.mjs";
// ⚠ **土地の答えが、どこで開いても同じに出るは `top-answer.mjs` へ出した**
//   （2026-08-27。hidetzu/konjaku#277）。⚠ **連続した 6 件をそのままの並びで運んだ。**
import { CASES as ANSWER_CASES } from "./top-answer.mjs";
import {
  WORDS, PORT, BASE, OUT, TOYOSU, SAPPORO,
  NAGOYA_LL, UNSURVEYED, YUMENOSHIMA, KIYOSUMI, KARUIZAWA, UENO,
  NIIGATA, URAYASU, openGroups, suggestionsOf, rowsOf, groupsOf,
  WEB_SEARCH, waitVerdict, WD, wdItem, WD_SHIBUYA, stubWikidata,
  photoFrames, waitStrip, LIES,
  RE_ESC, G1_MARK, G1_HEAD, VERDICT_SENTENCE, GSI_ROUTE, PHOTO_ROUTE,
  pngOf, whitePng, photoPng, eraRoute, ERA_TILE_IDS, stubMapPictures,
  timelineSettled, stepLabels, tauNow, effOpacity, waitOpacity, peelReady,
  settleAfterCondition, waited, waitOptional, settleAfterClick, settleAfterScroll, SWALE_ROUTE,
  LFC_ROUTE, DEM_ROUTE, forbid,
  must, assertToyosu3dAnswer, openPanel, themeColors, sameColor, LIGHT_MQ
} from "./lib.mjs";

export const CASES = [
  {
    // ⚠ **端末の設定が「明るい」とき、⚠ 画面が明るい色みになるか**（2026-08-26・hidetzu/konjaku#96）。
    //
    // ⚠ **静的検査は「明るい色みの定義がある」までしか言えない。**
    //   ⚠ `@media` の条件を書き間違えても、⚠ 読み込みを忘れても、⚠ **落ちない。**
    //
    // ⚠ **走者は既定で「暗い」に固定してある**（`test/render.mjs`）。
    //   ⚠ **ここだけ `colorScheme: "light"` にして、⚠ 端末の設定が明るい人を作る。**
    //
    // ⚠ **「明るい色みの値と一致する」だけでは足りない。**
    //   ⚠ **暗い色みと違うことまで見る**（⚠ 両方が同じ値なら、⚠ 何も切り替わっていなくても通る）。
    name: "端末の設定が明るいとき、この画面は明るい色みになる",
    path: "/", group: "core", colorScheme: "light",
    async check(page) {
      const theme = await themeColors();
      const dark = theme[":root"], light = theme[`${LIGHT_MQ} :root`];
      must(dark && light, "theme.css から色みを読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(light);
      must(names.length >= 8, `明るい色みの色が ${names.length} 個しかない（⚠ 読み方が壊れている）`);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { scheme: matchMedia("(prefers-color-scheme: light)").matches,
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.scheme, "⚠ ブラウザが「明るい」になっていない（⚠ この検査が暗い画面を測っている）");
      const wrong = names.filter((n) => !sameColor(got.vals[n], light[n]));
      must(!wrong.length, `明るい色みの値になっていない: `
        + wrong.map((n) => `${n}（期待 ${light[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      // ⚠ **本当に切り替わったか**（⚠ 暗い色みと違う色が、⚠ ちゃんと違っていること）
      const moved = names.filter((n) => !sameColor(dark[n], light[n]));
      must(moved.length >= 8, `暗い色みと違う色が ${moved.length} 個しかない（⚠ 切り替わっていない）`);
      for (const n of moved)
        must(!sameColor(got.vals[n], dark[n]), `${n} が暗い色みのまま（${got.vals[n].trim()}）`);
      return `明るい端末 ／ theme.css の ${names.length} 色と一致 ／ 暗い色みと違うのは ${moved.length} 色`
        + `（例 --bg ${got.vals["--bg"].trim()} ／ --ink ${got.vals["--ink"].trim()}）`;
    },
  },
  {
    // ⚠ **色みの定義が、⚠ この画面で本当にその値になっているか**（2026-08-26・hidetzu/konjaku#96）。
    //   ⚠ **理由と踏んだ話は `test/render/peel.mjs` の同じ名前のケースに全文がある。**
    //   ⚠ **ここは地図の上ではない**ので、⚠ **印が付いていないこと**まで見る
    //     （⚠ 付いていると、⚠ トップの面が地図用の暗い半透明になる）。
    name: "この画面の色は、地の色みに解決されている", path: "/", group: "core",
    async check(page) {
      const theme = await themeColors();
      const base = theme[":root"];
      must(base, "theme.css から地の色みを読めない（⚠ この検査が何も見ていない）");
      const names = Object.keys(base);
      must(names.length >= 8, `theme.css の色が ${names.length} 個しかない（⚠ 読み方が壊れている）`);
      const got = await page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return { mark: document.documentElement.getAttribute("data-backdrop"),
                 vals: Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n)])) };
      }, names);
      must(got.mark === null, `トップに地図の上の印が付いている（${JSON.stringify(got.mark)}）`);
      const wrong = names.filter((n) => !sameColor(got.vals[n], base[n]));
      must(!wrong.length, `色が theme.css の値になっていない: `
        + wrong.map((n) => `${n}（期待 ${base[n]} ／ 実際 ${got.vals[n].trim()}）`).join("、"));
      return `/ ／ 印なし ／ theme.css の ${names.length} 色と一致`
        + `（例 --bg ${got.vals["--bg"].trim()} ／ --ink ${got.vals["--ink"].trim()}）`;
    },
  },
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
  ...SHARE_CASES,
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
  ...UNREACH_CASES,
  ...SEARCH_CASES,
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
    //   状態遷移の契約「✕ → 結果・一覧・場所・古い非同期処理を消す」に反していた。
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
          () => (document.getElementById("notes")?.textContent ?? "").trim().length > 0,
          null, { timeout: 45000 }).then(() => true).catch(() => false);
        must(gotEst, "PC で断りが出ていない（45 秒待っても字が入らない）");
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
            // ⚠ **`#est` / `#over` は消えた**（2026-08-22）。⚠ **断りは板の `#notes`。**
            //   ⚠ **主張は同じ**（掟 §1: ⚠ 推定の絵を断りなしに見せない）。
            est: !!document.querySelector('#notes li[data-kind="caveat"]')?.checkVisibility(),
            play: vis("#play"), track: vis("#track"),
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
        // ⚠ **断りは板の中**（2026-08-22）。⚠ **推定の絵を断りなしに見せない**（掟 §1）
        must(a.est, "PC で断り（建物が消える年代は推定です）が出ていない");
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
        must(a.cls.includes("open"), `PC でパネルが広がって始まっていない（${a.cls}）`);
        must(a.land === 0, "HUD の答え（#land）が戻っている（土地の答えはパネルの 1 か所）");
        must(a.all > 0, "PC の初期表示で、パネルに答えが書かれていない");
        // ⚠ **✕ の直後、⚠ 待たずに読む**（⚠ 例外や空白が出ないこと）
        // ⚠ **✕ は消えた**（2026-08-22）。⚠ **同じ的（`#toggle`）が小さくする。**
        await p2.click("#toggle");
        const b = await read();
        // ⚠ **`.hide`（閉じている）→ `.open`（広げている）**（2026-08-22。⚠ 真偽が逆）
        must(!b.cls.includes("open"), `▴ でパネルが小さくならない（${b.cls}）`);
        must(b.land === 0, "▴ で HUD の答えが復活している");
        must(errs.length === 0, `例外が出た: ${errs.slice(0, 2).join(" / ")}`);
        await p2.close();

        // ⚠ **入口は 2 つだった**（✕ と ▶）。⚠ **✕ は 2026-08-22 に消えた。**
        //   ⚠ **`▶` は PC で板を畳まない**（⚠ `main` でも畳んでいない。⚠ 2026-08-23 に確かめた）。
        //   ⚠ **PC は板と地図が並ぶので、⚠ 畳む必要が無い。**
        //   ⚠ **主張を引き継ぐ**: ⚠ **`▶` を押しても、⚠ 例外が出ず、⚠ HUD に答えが戻らないこと。**
        //   ⚠ **「畳むこと」は主張から外した。**⚠ **起きていないことを見続けると、
        //     ⚠ この検査は「畳む実装」を要求し続ける**（⚠ いまの設計と食い違う）。
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
        must(c.land === 0, "▶ で HUD の答えが復活している");
        // ⚠ **押したら本当に送りが始まること**（⚠ 押しても何も起きない導線を置かない。ADR 0026）
        await p3.waitForFunction(
          () => document.getElementById("play")?.getAttribute("aria-pressed") === "true"
             || /■|停止/.test(document.getElementById("play")?.textContent ?? ""),
          null, { timeout: 10000 }).catch(() => {});
        await p3.click("#play");
        await settleAfterClick(p3);
        must(errs3.length === 0, `例外が出た: ${errs3.slice(0, 2).join(" / ")}`);
        return `PC 初期はパネルに ${a.all} 字／▴ で小さくなる／▶ で送りが始まる／`
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
            // ⚠ **内訳は作り替えた**（2026-08-22。Owner 判断）。
            //   ⚠ **前は「明治期の区分ごとの件数」**（⚠ 分母＝判定できた件数）。
            //   ⚠ **いまは「建物について何が分かっているか」**（⚠ 分母＝総数）で、
            //     ⚠ **明治期の区分の内訳は「昔はどんな土地？」が面積の分母で持つ。**
            //   ⚠ **主張は引き継ぐ**: ⚠ **区分名と数字の組は、⚠ 画面に 1 か所だけ。**
            //   ⚠ **消えた主題を見続けると、⚠ 何も見ていないのに緑になる**（掟）。
            pair: innermost("河川・湖沼・海面").map(([y, t]) => `y${y} ${t.slice(0, 44)}`),
            // ⚠ **建物の分母（総数）と、⚠ 面積の割合が、⚠ 同じ行に並んでいないこと**（掟 §6）
            // ⚠ **「同じ行」で見る**（2026-08-23）。⚠ **`innermost` は、⚠ 両方を含む最内を返すが、
            //   ⚠ 別々の層にあると `#landAll` のような入れ物が返る**（⚠ 実際に返った）。
            //   ⚠ **行の長さで絞る**（⚠ 80 字を超える箱は「行」ではない）。
            mixed: innermost("河川・湖沼・海面", "543")
              .filter(([, t]) => t.length <= 80).map(([y, t]) => `y${y} ${t.slice(0, 40)}`),
            breakdownTop: top,
            est: document.getElementById("notes")?.innerText?.replace(/\s+/g, " ").trim() ?? "",
            panelH: document.getElementById("panel")?.scrollHeight ?? 0,
          };
        });
        // ⚠ **区分名と件数の組は 1 か所だけ**
        must(r.pair.length === 1,
          `1 位の区分名と件数が ${r.pair.length} か所にある: ${r.pair.join(" ／ ")}`);
        // ⚠ **消した側の字が戻っていない**
        must(!r.pair.some((x) => /区分を特定できた足元のうち/.test(x)),
          `第3層の本文に「区分を特定できた足元のうち」が戻っている: ${r.pair.join(" ／ ")}`);
        // ⚠ **区分名は面積の分母で語る。**⚠ **建物の分母（543）と混ざっていないこと**（掟 §6）
        must(!r.mixed.length,
          `区分名が建物の分母と同じ行に並んでいる（分母が食い違う）: ${r.mixed.join(" ／ ")}`);
        // ⚠ **区分名は割合つきで出ている**（⚠ 消しただけにしない）
        must(r.pair.some((x) => /\d/.test(x)),
          `区分名が数字なしで出ている（内訳が受け皿になっていない）: ${r.pair.join(" ／ ")}`);
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
    // ⚠ **狭い幅は、⚠ 小さい状態で始まる。**⚠ **答えと断りは畳まれている**（2026-08-23）。
    //   ⚠ **押しても開かないことがある**（⚠ 読み込みの途中で的が入れ替わる）。⚠ **開くまで待つ。**
    async check(page) {
      const ctx = await page.context().browser().newContext({
        viewport: { width: 375, height: 667 }, hasTouch: true, serviceWorkers: "block" });
      try {
        // (1) ⚠ **全部 403** → 読めなかった。⚠ **範囲外と言ってはいけない**
        const p2 = await ctx.newPage();
        await forbid(p2, SWALE_ROUTE);
        await p2.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        // ⚠ **狭い幅では、⚠ 小さいあいだ 3 つの問いを畳む**（2026-08-23。Owner 判断）。
        //   ⚠ **断りは `#landAll` の中にある**ので、⚠ **広げてから読む。**
        //   ⚠ **主張は変えていない**（⚠ 403 と範囲外を取り違えないこと）。⚠ **読む場所だけ移した。**
        await openPanel(p2);
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
        await openPanel(p3);
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
              gqAll: document.querySelectorAll(".verdict .gq").length,
              lines: [...document.querySelectorAll(".v-head .tx")].length,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **判定が出たあとは、⚠ 1 つ目の問いの見出しを畳む**（2026-08-25。hidetzu/konjaku#176）。
          //   ⚠ **答えの文が「この土地は 旧水部」と、⚠ 既に問いを含んでいる。**
          //   ⚠ 実測（375×667）: 文字 150% でこの行が 25px。⚠ 見出し 94px・検索欄 72px と同じ話で、
          //     ⚠ **答えを出すための道具が、⚠ 答えを読んでいるあいだも画面を占めていた。**
          //   ⚠ **2 つ目（昔はどんな土地？）は残す。**⚠ 年代の帯が何の話かを言う唯一の行。
          must(g.gq.length === 1, `${w}×${h}: 問いの見出しが 1 つでない（${g.gq.length} 個: ${g.gq.join(" / ")}）`);
          // ⚠ **字は words.js の 1 か所から。**⚠ ここへ書き写さない
          must(g.gq[0] === WORDS.layerTitle(2),
            `${w}×${h}: 見出しが words.js と違う（${g.gq.join(" / ")}）`);
          // ⚠ **1 つ目は「消した」のではなく「畳んだ」。**⚠ DOM には残っている
          //   （⚠ 場所を選ぶ前は出る。⚠ 判定後だけ畳む）。
          must(g.gqAll === 2, `${w}×${h}: 問いの見出しが DOM から消えている（${g.gqAll} 個）`);
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
    // ⚠ **文字サイズを上げても、⚠ 写真が資料として残る**（2026-08-25。hidetzu/konjaku#176）。
    //
    //   ⚠ **既存の「着いた直後の画面に…」は、⚠ 既定の文字サイズしか見ていない。**
    //   ⚠ **既存の「文字サイズを上げると、字が大きくなる」は、⚠ 横あふれしか見ていない。**
    //     ⚠ **縦（初期画面に入るか）と、⚠ 写真が潰れていないかは、⚠ 誰も見ていなかった。**
    //   ⚠ 直す前の実測（375×667）: ⚠ **125% で写真 37px・150% で 2px。**
    //     ⚠ **150% では「重ねる」も画面外**（734 / 667）。
    //
    //   ⚠ **文字サイズは「読み込む前」に効かせる。**
    //     ⚠ **あとから効かせると `layoutBig()` が置き直さず、⚠ 判定点の位置が嘘になる**
    //       （⚠ 2026-08-25 に踏んだ。⚠ 「判定点が枠の外」と誤って報告した）。
    //   ⚠ **その大きさで読み込む**（伸縮すると写真が前の高さを保つ）。
    //   ⚠ **hasTouch を付ける**（付けないと (hover:none) が効かず 14px ずれる）。
    //
    //   ⚠ **320×640 の 125% は入らない**（⚠ 直す前も入っていない）。⚠ **ここでは求めない。**
    //     ⚠ 求めると、⚠ **写真を 16px まで潰す値**を選ぶことになる（実測）。
    name: "文字サイズを上げても、写真が資料として残る", path: "/", group: "core",
    async check(page) {
      // ⚠ **どの条件で「重ねる」まで求めるか。**⚠ 求めないものは、⚠ 写真だけ見る
      const CASES = [
        // ⚠ **既定も対にして見る**（⚠ 片側だけだと、⚠ 既定を壊しても緑になる）。
        //   ⚠ **既定では、⚠ 写真を切り落とさない。**⚠ 直す前は 375×667 で 309×163（⚠ 比 1.90）
        //     ⚠ ＝ **正方形のモザイクの 53% しか見せていなかった**。⚠ 上限が食っていた。
        { w: 375, h: 667, scale: 100, wantOv: true, wantWhole: true },
        { w: 320, h: 640, scale: 100, wantOv: true, wantWhole: true },
        { w: 375, h: 667, scale: 125, wantOv: true },
        { w: 375, h: 667, scale: 150, wantOv: true },
        // ⚠ **320×640 も入るようになった**（2026-08-25。⚠ 写真が「余り」を取る形にした）。
        //   ⚠ 直す前は 125% で +28px・150% で +31px はみ出していた。
        //   ⚠ **写真を潰して入れたのではない**（⚠ 125% 160 → 171px ／ 150% 112 → 120px）。
        { w: 320, h: 640, scale: 125, wantOv: true },
        { w: 320, h: 640, scale: 150, wantOv: true },
        // ⚠ **横向き。**⚠ 既定の文字サイズでも写真が 2px だった。⚠ 「重ねる」は求めない
        { w: 667, h: 375, scale: 100, wantOv: false },
        { w: 844, h: 390, scale: 100, wantOv: false },
      ];
      // ⚠ **これを割ったら「資料」と呼べない。**⚠ 利用者役 4 名が「写真だと思わなかった」と
      //   ⚠ 言ったのが 37px（2026-08-25。⚠ **実在の利用者ではない**）。⚠ その上に置く
      // ⚠ **112px は足し算で決まる**（`index.html` の `.verdict > .big` を読む）:
      //   ⚠ 帰属表示 44px ＋ ＋−（PC は縦積み 32+4+32＝68px）。
      //   ⚠ **これを割ると、⚠ ＋− が出典を隠さずに置けない。**
      const FLOOR = 112;
      const out = [];
      for (const c of CASES) {
        const ctx = await page.context().browser().newContext({
          viewport: { width: c.w, height: c.h }, hasTouch: true, serviceWorkers: "block" });
        try {
          const p2 = await ctx.newPage();
          // ⚠ **最初の 1 文字が来る前に効かせる**（上のコメント）
          await p2.addInitScript((px) => {
            const put = () => { if (!document.head || document.getElementById("k176")) return;
              const st = document.createElement("style"); st.id = "k176";
              st.textContent = `:root{font-size:${px}px !important}`;
              document.head.appendChild(st); };
            const t = setInterval(() => { if (document.head) { put(); clearInterval(t); } }, 4);
            document.addEventListener("DOMContentLoaded", put);
          }, 16 * c.scale / 100);
          await p2.goto(`${BASE}/?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await waitVerdict(p2);
          await waitStrip(p2);
          await p2.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
          await settleAfterCondition(p2);
          const g = await p2.evaluate(() => {
            const R = (s) => { const e = document.querySelector(s);
              if (!e || !e.checkVisibility()) return null;
              const b = e.getBoundingClientRect();
              return { t: Math.round(b.top), b: Math.round(b.bottom),
                h: Math.round(b.height), w: Math.round(b.width) }; };
            const big = document.querySelector(".verdict > .big").getBoundingClientRect();
            const mk = document.querySelector(".big .mk").getBoundingClientRect();
            const d = document.documentElement;
            return { root: parseFloat(getComputedStyle(d).fontSize),
              photo: R(".verdict > .big"), ov: R("#ovRow"),
              // ⚠ **判定している点が、⚠ 写真の中に残っていること**
              mkIn: mk.top >= big.top - 1 && mk.bottom <= big.bottom + 1,
              vh: innerHeight, over: d.scrollWidth - d.clientWidth };
          });
          // ⚠ **＋− は、⚠ 写真を画面に出してから押す。**
          //   ⚠ `elementFromPoint` は **画面の外を見ない**ので、⚠ 写真が下にあると
          //     ⚠ **「押せない」と出る**（⚠ 2026-08-25 に踏んだ。⚠ 横向きで誤検知した）。
          //   ⚠ **横向きでは、⚠ 写真が初期画面の外にあるのが正しい姿**（上のコメント）。
          //   ⚠ **上の寸法は scroll 0 で測ってある。**⚠ ここから先だけスクロールする。
          const zoom = await p2.evaluate(() => {
            document.querySelector(".verdict > .big").scrollIntoView({ block: "center" });
            // ⚠ **座標を押して届くか**で見る。⚠ computed style は切られても 44×44 のまま
            const hit = (id) => { const e = document.getElementById(id);
              if (!e) return false;
              const r = e.getBoundingClientRect();
              const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!at && (at === e || e.contains(at)); };
            return { zIn: hit("zIn"), zOut: hit("zOut") };
          });
          const at = `${c.w}×${c.h}/${c.scale}%`;
          // ⚠ **文字サイズが本当に効いていること。**⚠ 効いていないと、⚠ 既定を測って緑になる
          must(Math.abs(g.root - 16 * c.scale / 100) < 0.51,
            `${at}: 文字サイズが効いていない（ルート ${g.root}px）`);
          must(g.photo, `${at}: 写真が見えていない`);
          must(g.photo.h >= FLOOR, `${at}: 写真が ${FLOOR}px を割っている（${g.photo.h}px）`);
          // ⚠ **既定では、⚠ 切り落としが小さいこと。**⚠ 写真は正方形のモザイクを切り出した窓で、
          //   ⚠ **上限が食うほど、⚠ 見えている割合が減る**（比が大きいほど細い帯になる）。
          //   ⚠ **下限だけでは守れない**（⚠ 下限は「潰れない」しか言わない）。
          if (c.wantWhole) {
            const ratio = g.photo.w / g.photo.h;
            must(ratio <= 1.5, `${at}: 既定なのに写真が細い（比 ${ratio.toFixed(2)}。1.5 まで）`);
          }
          must(g.mkIn, `${at}: 判定している点が、写真の枠の外にある`);
          // ⚠ **写真の中の ＋− が押せること。**⚠ 短い写真で枠から出ていた
          must(zoom.zIn && zoom.zOut, `${at}: 写真の ＋− が押せない（＋ ${zoom.zIn} / − ${zoom.zOut}）`);
          if (c.wantOv) {
            must(g.ov, `${at}: 重ねるが見えていない`);
            must(g.ov.b <= g.vh, `${at}: 重ねるが初期画面の外にある（下端 ${g.ov.b} / 画面 ${g.vh}）`);
          }
          must(g.over <= 0, `${at}: 横にあふれている（${g.over}px）`);
          out.push(`${at} 写真${g.photo.h}px${c.wantOv ? `／重ねる${g.ov.b}` : ""}`);
        } finally { await ctx.close(); }
      }
      return out.join(" ／ ");
    },
  },

  {
    // ⚠ **写真は「余り」を取る**（2026-08-25。hidetzu/konjaku#176 の続き）。
    //
    //   ⚠ **以前は定数だった**（`max-height:calc(100dvh - 31.5rem)`）。⚠ **上に積んだものの合計を
    //     CSS へ手で書き写していた**ので、⚠ **上が増えても写真は縮まず、⚠ 「重ねる」が押し出された。**
    //   ⚠ **測り直すたびに別の条件が落ちた**（⚠ 実際に 3 回測り直した）。
    //
    //   ⚠ **この検査は「値」ではなく「仕組み」を見る。**
    //     ⚠ **上に高さを足して、⚠ 写真が同じだけ縮むか**を見る。
    //     ⚠ **定数へ戻すと、⚠ 写真は縮まず「重ねる」が画面外へ出る**ので落ちる。
    //   ⚠ **足す量は 60px**（⚠ 端数で丸めに埋もれない大きさ）。
    //
    //   ⚠ **縦の短い画面で見る**（375×560）。⚠ **上限と下限のどちらも効かない幅**が要る:
    //     ⚠ 375×667（既定）は **上限が効いていない**（⚠ 写真が 4:3 の自然な高さ 232px で収まる）。
    //       ⚠ **足しても縮まない。**⚠ 1 回目はそれで落ちた。
    //     ⚠ 375×520 は **足したら下限（112px）にぶつかる**（⚠ 152 → 112 で 40px しか縮まない）。
    //       ⚠ 2 回目はそれで落ちた。
    //     ⚠ **どちらも「仕組みが壊れた」のではなく、⚠ 測る場所が悪かった。**
    name: "写真は、上に積んだものに合わせて縮む", path: `/?${TOYOSU}`,
    viewport: { width: 375, height: 560 }, hasTouch: true,
    async check(page) {
      await waitVerdict(page);
      await waitStrip(page);
      await page.waitForSelector("#ovRow", { state: "attached", timeout: 30000 });
      await settleAfterCondition(page);
      const read = () => page.evaluate(() => {
        const big = document.querySelector(".verdict > .big").getBoundingClientRect();
        const ov = document.getElementById("ovRow").getBoundingClientRect();
        return { photo: Math.round(big.height), ovB: Math.round(ov.bottom), vh: innerHeight };
      });
      const before = await read();
      must(before.ovB <= before.vh,
        `足す前から「重ねる」が初期画面の外（${before.ovB} / ${before.vh}）`);
      // ⚠ **写真の上へ 60px 足す。**⚠ 判定カードの中に入れる（⚠ 外だと上に積んだことにならない）
      const GROW = 60;
      await page.evaluate((px) => {
        const big = document.querySelector(".verdict > .big");
        const pad = document.createElement("div");
        pad.id = "renderPad";
        pad.style.height = `${px}px`;
        big.parentNode.insertBefore(pad, big);
        // ⚠ **測り直させる**（⚠ 画面の大きさが変わったときと同じ道を通す）
        dispatchEvent(new Event("resize"));
      }, GROW);
      await settleAfterCondition(page);
      const after = await read();
      const shrank = before.photo - after.photo;
      // ⚠ **同じだけ縮んだか。**⚠ 丸めのぶんだけ許す
      must(Math.abs(shrank - GROW) <= 2,
        `上に ${GROW}px 足したのに、写真が ${shrank}px しか縮んでいない`
        + `（${before.photo} → ${after.photo}px。⚠ 定数だと縮まない）`);
      // ⚠ **縮んだ結果、⚠ 「重ねる」は初期画面に残っていること**
      must(after.ovB <= after.vh,
        `上に足したら「重ねる」が初期画面の外へ出た（${after.ovB} / ${after.vh}）`);
      return `写真 ${before.photo} → ${after.photo}px（上に ${GROW}px 足した）`
        + ` ／ 重ねる ${before.ovB} → ${after.ovB}（画面 ${after.vh}）`;
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

  ...ANSWER_CASES,

  {
    // ⚠ **β 版であることが画面から分かり、⚠ フッターの押せるものが 44 を割らないこと**
    //   （2026-08-23。Owner 判断。β 版リリース前の整理）。
    //   ⚠ 実測（2026-08-23・利用者役 4 名・画面だけを見せた。⚠ **実在の利用者ではない**）:
    //     ⚠ **2/4 が「完成品だと思った」**（⚠ 当時、画面に β の表記が無かった）。
    //     ⚠ 1 名は「個人開発っぽいから、たぶん作りかけ」と ⚠ **画面ではなく雰囲気で**判断していた。
    //     ⚠ **1 名が、⚠ 国土地理院のリンクを押そうとして 2 回外した**（⚠ 当時 60×20px）。
    //   ⚠ **44×44 は指の端末の基準**（\`.claude/rules/css.md\`・\`ui-ux-review\` §3）。
    //     ⚠ **PC では見ない**（⚠ ポインタが細いので、⚠ 余白だけ増えても損）。
    //   ⚠ **件数を書かない。**⚠ **0 個であること**を見る（⚠ 数は走らせて数える）。
    name: "β 版だと分かり、フッターの押せるものが 44 を割らない", path: "/",
    async check(page) {
      const out = [];
      for (const [w, h] of [[375, 667], [344, 882], [320, 640]]) {
        await page.setViewportSize({ width: w, height: h });
        await settleAfterCondition(page);
        const r = await page.evaluate(() => {
          // ⚠ **サービス名の横にあること**（⚠ 「どこかに β がある」では弱い）
          const brand = document.querySelector(".brand");
          const beta = brand?.querySelector(".brand__beta");
          const small = [...document.querySelectorAll("footer a, footer summary")]
            .filter((e) => {
              if (!e.checkVisibility?.()) return false;
              const q = e.getBoundingClientRect();
              return q.width < 44 || q.height < 44;
            })
            .map((e) => {
              const q = e.getBoundingClientRect();
              return `「${e.textContent.trim().slice(0, 10)}」${Math.round(q.width)}×${Math.round(q.height)}`;
            });
          return { beta: (beta?.textContent ?? "").trim(),
                   betaSeen: beta?.checkVisibility?.() ?? false,
                   inBrand: !!beta,
                   // ⚠ **災害リスクの印を流用していないこと**（CLAUDE.md §4-1）
                   warnMark: /⚠/.test(beta?.textContent ?? ""),
                   small };
        });
        must(r.inBrand, `${w}px: β の印がサービス名の横に無い`);
        must(r.betaSeen, `${w}px: β の印が見えていない`);
        must(/β/.test(r.beta), `${w}px: β の印の字が違う:「${r.beta}」`);
        must(!r.warnMark, `${w}px: β の印に ⚠ を使っている（⚠ は災害リスク専用）`);
        must(!r.small.length,
          `${w}px: フッターに 44 を割る的がある（${r.small.length} 個）: ${r.small.join(" ")}`);
        out.push(`${w}: 「${r.beta}」・44 割れ 0`);
      }
      return out.join(" / ");
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

  {
    // ⚠ **2026-08-23 に、⚠ 主張を書き換えた**（Owner 判断。⚠ **こちらの提案ではない**）。
    //
    // ⚠ **前は「3 段が、畳まずに読めること」を見ていた**（2026-08-20 の決定）。
    //   ⚠ 利用者役 2/4 が「これは先に見たかった」と言ったのが理由だった。
    //
    // ⚠ **いまは、⚠ 畳まずに見えるのは「いちばん強い約束 2 つ」だけ。**
    //   ⚠ **何が弱くなったかは \`public/words.js\` の \`PRIVACY_LEAD\` に書いてある。**
    //   ⚠ **ここには写さない**（⚠ 2 か所に書くと、片方だけ古くなる）。
    //
    // ⚠ **弱くなったぶん、⚠ ここで見ることを増やした。**
    //   1) 常時見える 1 行が、⚠ **強い約束 2 つを言っている**
    //   2) ⚠ **「どこにも送らない」へ広げていない**（⚠ 2026-08-15 に直した嘘）
    //   3) ⚠ **3 段は「▸ プライバシーについて」を 1 回開けば読める**
    //      ⚠ **実際に開いて確かめる。**⚠ 中身があることを、字で見る
    //   4) ⚠ 場所を選んだあとも消えない
    name: "強い約束は畳まずに読め、3 段は 1 回開けば読める", path: "/",
    async check(page) {
      // ⚠ **畳まずに見える側**（⚠ 2 つの約束）
      const LEAD = [[/計測データに(は)?含めません|計測に[^。]*送/, "計測データに含めない"],
                    [/Cookie/, "Cookie を使わない"]];
      // ⚠ **畳みの中**（⚠ 3 段）。
      // ⚠ **文をまたいで拾わせない。**⚠ 2026-08-23 に実際に踏んだ:
      //   ⚠ **「調べた場所が配信元へ届く」の文を丸ごと消しても、
      //     ⚠ 「接続元の IP が配信元に届きます」が残っていて緑のままだった。**
      //   ⚠ **IP が届くことと、⚠ 調べた場所が届くことは別の主張。**
      // ⚠ **1 つの文の中で結びついていること**まで見る。
      const NEED = [
        [[/調べた場所/, /URL|アドレス欄/, /入(り|ります)/], "載る"],
        [[/URL|アドレス/, /配信|Cloudflare/, /届|渡/], "届く（⚠ IP の文では代用できない）"],
        [[/こちらの記録に/, /残りません/], "残らない"],
      ];
      // ⚠ **文で切ってから見る**（⚠ 「。」と改行で切る）
      const lacks = (txt) => {
        const ss = (txt ?? "").split(/[。\n]/).map((t) => t.trim()).filter(Boolean);
        return NEED.filter(([res]) => !ss.some((t) => res.every((re) => re.test(t))))
          .map(([, n]) => n);
      };
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
        const miss = LEAD.filter(([re]) => !re.test(r.txt)).map(([, n]) => n);
        must(!miss.length, `${w}px: 強い約束が落ちている（${miss.join("・")}）: ${r.txt.slice(0, 60)}`);
        // ⚠ **言い切りすぎていないこと**（⚠ 調べた場所は URL に載り、開けば配信元へ届く）
        must(!/どこにも送(りません|らず)|一切送/.test(r.txt),
          `${w}px: 「どこにも送らない」まで言い切っている: ${r.txt.slice(0, 60)}`);
        out.push(`${w}: y=${r.y}`);
      }
      // ⚠ **3 段は、⚠ 1 回開けば読める。**⚠ **実際に開いて、⚠ 字で確かめる。**
      //   ⚠ **これが、⚠ 常時見える場所から 2 段落としたことの担保。**
      await page.setViewportSize({ width: 375, height: 667 });
      const opened = await page.evaluate(() => {
        const d = [...document.querySelectorAll("footer details")]
          .find((x) => /プライバシー/.test(x.querySelector("summary")?.textContent ?? ""));
        if (!d) return null;
        d.open = true;
        const body = d.querySelector("[data-privacy-body]");
        return { seen: body?.checkVisibility() ?? false,
                 txt: (body?.textContent ?? "").replace(/\s+/g, " ").trim() };
      });
      must(opened, "「プライバシーについて」の畳みが無い（3 段の行き先が消えている）");
      must(opened.seen, "畳みを開いても、詳しい説明が出てこない");
      const deep = lacks(opened.txt);
      must(!deep.length,
        `畳みの中から段が落ちている（${deep.join("・")}）`
        + `：⚠ 常時見える 1 行は短くしたので、⚠ 3 段はここにしか残っていない`);
      // ⚠ **詳しい説明は残っていること**（要約が出たからといって消さない）
      const sums = await page.$$eval("footer summary", (es) => es.map((e) => e.textContent.trim()));
      must(sums.some((t) => /プライバシー/.test(t)),
        `畳んである詳しい説明が消えている: ${sums.join("・")}`);
      // ⚠ **場所を選んでも、⚠ フッターに残っている**（2026-08-23。Owner 判断で変えた）。
      //   ⚠ **前は「場所を選んだら消える」ことを見ていた**（\`#scope.on ~ .privacy-short\`）。
      //     ⚠ 理由は「送ったあとに残すと『これから送ります』に読める」。
      //   ⚠ **置き場所がフッターへ移ったので、⚠ その理由が当たらなくなった。**
      //     ⚠ フッターは常時ある場所で、⚠ **書いてあるのは、⚠ いつでも成り立つ事実**
      //     （調べた場所は URL に入る／開くと配信元へ届く／こちらの記録には残らない）。
      //     ⚠ **「これから送ります」とは書いていない。**
      //   ⚠ **消えないことを見る。**⚠ 消えると、⚠ **判定したあとに読み返せない。**
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${page.url().split("?")[0]}?q=%E8%B1%8A%E6%B4%B2&ll=35.6548,139.7975`);
      await page.waitForFunction(
        () => /旧水部|土地/.test(document.getElementById("verdict")?.textContent ?? ""),
        null, { timeout: 60000 });
      await settleAfterCondition(page);
      const after = await page.evaluate(() => {
        const e = document.getElementById("privacyShort");
        return { seen: e?.checkVisibility() ?? false, inDetails: !!e?.closest("details"),
                 inFooter: !!e?.closest("footer"),
                 txt: (e?.textContent ?? "").replace(/\s+/g, " ").trim() };
      });
      must(after.seen, "場所を選んだあと、プライバシーの記述が消えている（判定後に読み返せない）");
      must(after.inFooter, "プライバシーの記述がフッターの外にある（常時ある場所に置く）");
      must(!after.inDetails, "場所を選んだあと、プライバシーの記述が畳んだ中にある");
      const gone = LEAD.filter(([re]) => !re.test(after.txt)).map(([, n]) => n);
      must(!gone.length, `場所を選んだあと、約束が落ちている（${gone.join("・")}）: ${after.txt.slice(0, 60)}`);
      return `4 幅すべてで畳まず画面内（${out.join(" / ")}）／強い約束 2 つ・言い切りなし`
        + `／3 段は 1 回開けば読める／場所を選んでもフッターに残る`;
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
      //   （設計: 操作 → 結果 → 説明 → 根拠。トップは「操作」まで）
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
  ...STRIP_CASES,
  ...EVENTS_CASES,
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
    // ⚠ **控えを使わない**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **主題が「待っているあいだ」なので、⚠ 冷えた状態で測る。**
    noShelf: true,
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
  ...OUTSIDE_CASES,
  ...ERASMOVE_CASES,
  ...NEXT_CASES,
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
  ...ESCAPE_CASES,
];
