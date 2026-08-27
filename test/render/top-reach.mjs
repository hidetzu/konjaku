// 実描画 — 押せるものが届き、⚠ 押すと応える（トップ）
//
// ⚠ **`test/render/top.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 41 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **4 つの塊を集めたので、⚠ 並びは動く。**
//
// ⚠ **元ファイルの見出しをそのまま持ってきている**（⚠ 消さない）:
//     `// ---- 押しても何も起きないものを無くす／本命を埋もれさせない ----`
//
// ⚠ **5 件とも「⚠ 押せるものが、⚠ 届くところにあり、⚠ 押すと応えるか」を見ている**（ADR 0026）:
//     置き場所 ⚠ **▶ は、⚠ 動かす相手（帯）のすぐそばにある**
//     指の大きさ ⚠ **入力例は 3 件で、⚠ 指で押せて、⚠ 折り返しの上にある**
//     下限     ⚠ **フッターの押せるものが 44 を割らない**（⚠ β 版だと分かることも同じ場所で見る）
//     入口     ⚠ **最初の画面が、⚠ 場所を検索する画面だと 5 秒で分かる**
//     応える   ⚠ **押せそうなものは、⚠ 押すと何かが起きる**
//
// ⚠ **「見えている」だけでは足りない。**⚠ **押せて、⚠ 届いて、⚠ 応えるまでが 1 つの問い。**
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import {
  TOYOSU, rowsOf, waitVerdict, waitStrip,
  settleAfterCondition, settleAfterClick, settleAfterScroll, must
} from "./lib.mjs";

export const CASES = [
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
];
