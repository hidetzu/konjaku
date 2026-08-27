// 実描画 — 建物の取得と、⚠ 年代の段（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 21 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 9 件を、⚠ そのままの並びで運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **ここが守っているもの**:
//     0 件と失敗 ⚠ **Overpass が 0 件を返したら、⚠ 「取れなかった」と言わない**
//                ⚠ **待っている間は「取得中」と言う**（⚠ 待っているだけを「欠落」にしない）
//     外へ出ない ⚠ **建物が取り込み済みなら、⚠ Overpass に出ない**
//     数える     ⚠ **共有された 3D の URL を踏んだ人も、⚠ 1 回だけ数える**
//     重ねる     ⚠ **過去の写真の上では、⚠ 「いまの街を重ねている」と言う**
//     段に出す   ⚠ **存在しない年代を段に出さない**（⚠ 404・白紙は落とす）
//                ⚠ **トップと `/peel` が、⚠ 同じ地点で同じ年代を出す**
//                ⚠ **年代ごとの結末で、⚠ 段に出すかを決める**
//     時間座標   ⚠ **段を間引いても、⚠ 時間座標が詰まらない**
//                （⚠ **間引いた年代のぶんの隙間は残す。**⚠ 詰めると年代の間隔が嘘になる）
//
// ⚠ **`取れなかった ≠ 無い` の建物版**（⚠ `peel-unreachable.mjs` は断りの文、⚠ ここは取得そのもの）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { BASE, TOYOSU, UNSURVEYED, waitVerdict, LIES, whitePng, eraRoute, stepLabels, tauNow, peelReady, settleAfterCondition, must, provText } from "./lib.mjs";

export const CASES = [
  {
    name: "Overpass が 0 件を返したら、取れなかったと言わない", path: `/peel?${UNSURVEYED}`,
    setup: (page) => Promise.all([
      // 取り込み済みの経路を塞ぐ。⚠ 塞がないと静的で答えてしまい、Overpass の経路を通らない
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), (r) => r.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({ elements: [] }) })),
    ]),
    async check(page) {
      await page.waitForFunction(() => /OSM に登録された建物は 0 件/.test(
        document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      for (const [where, t] of [["問い", bd], ["台帳", prov]])
        for (const w of ["取得中", "取得できませんでした", "欠落"])
          must(!t.includes(w), `正常に 0 件なのに${where}が「${w}」と出している: ${t.slice(0, 90)}`);
      must(/OSM への問い合わせで/.test(prov), `台帳に 0 件の出所が無い: ${prov.slice(0, 90)}`);
      return `「OSM に登録された建物は 0 件」／台帳「OSM への問い合わせで建物 0 件」`;
    },
  },
  {
    name: "建物を待っている間は、取得中と言う", path: `/peel?${UNSURVEYED}`,
    setup: (page) => Promise.all([
      page.route("**/data/bl/index.json", (r) => r.abort()),
      page.route((u) => /overpass/i.test(u.href), () => { /* 無応答 */ }),
    ]),
    async check(page) {
      // 待ち始めたことを、出るべき文言そのもので待つ（一瞬の状態をスナップショットで読まない）
      // ⚠ **`#status` はもう喋らない**（2026-08-22。Owner 判断）。⚠ **問いの側で待つ。**
      //   ⚠ **「最大20秒…」は出さなくなった**（Owner 判断）。⚠ **内訳の「取得中」で待つ。**
      // ⚠ **待っているあいだは層 3 が `missing`** なので、⚠ **`#breakdown` は作られない。**
      //   ⚠ **問いの側（`#landAll`）で待つ**（⚠ 「建物を取得しています」＋「建物データを取得中」）。
      await page.waitForFunction(() => /建物を取得(中|しています)/.test(
        document.getElementById("landAll")?.textContent ?? ""), null, { timeout: 60000 });
      // ⚠ **0 件のときは、⚠ 層 3 が `missing` になるので `#breakdown` が作られない**
      //   （2026-08-23 に踏んだ。⚠ 再試行の的を置こうとしたときと同じ理由）。
      //   ⚠ **主張は「0 件を『取れなかった』と言わない」。**⚠ **問いの側を読む。**
      const bd = await page.evaluate(() =>
        (document.getElementById("landAll")?.textContent ?? "").replace(/\s+/g, " "));
      const prov = await provText(page);
      must(/建物を取得しています/.test(bd), `待っている間に問いが「取得しています」と言っていない: ${bd.slice(0, 90)}`);
      // ⚠ 台帳の語彙は「未取得＝読めなかった／欠落＝本当に無い」。待っている間に「欠落」は嘘
      must(!/欠落/.test(prov), `待っているだけなのに台帳が「欠落」と言っている: ${prov.slice(0, 90)}`);
      must(/建物データを取得中/.test(prov), `台帳が待っていることを言っていない: ${prov.slice(0, 90)}`);
      must(!/0 件/.test(bd), `まだ取れていないのに件数を言っている: ${bd.slice(0, 90)}`);
      return `問い「建物を取得しています」／台帳「建物データを取得中」`;
    },
  },
  // ---- 取り込み済みの土地では、外へ出ない ----
  // ⚠ 実行時に Wikidata を叩くのをやめるための取り込み。効いていることを機械で見る。
  {
    name: "建物が取り込み済みなら、Overpass に出ない", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      must(reqs.filter((u) => /overpass/i.test(u)).length === 0,
        "取り込み済みなのに Overpass を叩いている");
      must(reqs.filter((u) => /\/data\/bl\//.test(u)).length > 0, "建物タイルを読んでいない");
      // ⚠ 集計範囲が広がっていないこと。豊洲は 99% 台のはず
      const pct = Number((t.match(/(\d+\.\d)\s*%/) ?? [])[1]);
      must(pct >= 95, `集計範囲が広がっている（豊洲で ${pct}%。隣の街区が混ざっている）`);
      // いつ取り込んだ結果かを言うこと
      // ⚠ **場所が「表示データについて」へ移った**（2026-08-22。hidetzu/konjaku#153）。
      //   ⚠ **主張は変えていない**（⚠ いつ取り込んだ結果かが画面にあること）。
      // ⚠ **由来の行は「詳しく見る」の中**（2026-08-22。⚠ 畳んである）。
      //   ⚠ **`innerText` には出ない。**⚠ **`textContent` で読む**（⚠ 主張は同じ）。
      must(/建物のデータは \d{4}-\d{2}-\d{2} に取り込んだもの/.test(
        (await page.locator("#landAll").textContent()).replace(/\s+/g, " ")),
        `いつ取り込んだ結果か書かれていない: ${t.slice(0, 200)}`);
      // ⚠ **「（事前に取り込んだデータ）」は、⚠ 0 件のときしか出ない**（2026-08-23 に確かめた）。
      //   ⚠ **判定できたときの `#status` は空**（2026-08-22。Owner 判断: ⚠ 件数は答えが言う）。
      //   ⚠ **主張は上の行が持つ**（⚠ 「建物のデータは YYYY-MM-DD に取り込んだもの」）。
      //   ⚠ **消したのは重複であって、⚠ 主張ではない。**⚠ **Overpass を叩いていないことは上で見ている。**
      return `Overpass 0 件／${pct}%／取り込み日あり`;
    },
  },
  {
    // ⚠ 共有は唯一の指標。共有された URL を踏んだ人が数から消えると、
    //   「共有されたが誰も踏まなかった」と「踏まれたが数えていなかった」を区別できない。
    name: "共有された 3D の URL を踏んだ人も、1回だけ数える", path: `/peel?${TOYOSU}`,
    async check(page, reqs) {
      // 直接開いている（トップの導線を通っていない）
      await peelReady(page).catch(() => {});
      await settleAfterCondition(page);
      const t = reqs.filter((u) => /\/t(\?|$)/.test(u));
      must(t.length === 1, `直接開いたのに ${t.length} 回数えている（1回であること）`);
      return `直接開いて /t 1 回`;
    },
  },
  {
    // ⚠ 過去の年代では、**年と同じくらいの強さで**「重ねている」と言うこと。
    //   実測（2026-08-14 利用者役のエージェントによる検証）: 広島 1945–50（原爆直後の焼け野原）の上に
    //   現在の3,555棟が立ち、広島の利用者は最初の3秒「1945年の広島」だと読んだ。
    //   判別できた人の根拠は**画面ではなく自分の歴史知識**だった。
    //   ⚠ 半透明で薄れさせない。0.80 で瓦礫が建物ごしに透け、「消えかけの幽霊」
    //     「広島の人間には見せられない」と言われた。**別物として重ねる**ほうがよい。
    name: "過去の写真の上では、いまの街を重ねていると言う",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    viewport: { width: 375, height: 667 }, hasTouch: true,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const at = async (v) => { await page.$eval("#t", (e, v) => {
          e.value = String(v); e.dispatchEvent(new Event("input")); }, v);
        await page.waitForTimeout(1600);
        return page.evaluate(() => {
          // ⚠ **「重ねている」の断りは、⚠ 補足の 1 行**（2026-08-22。⚠ `#over` から移った）。
          //   ⚠ **`#notes` を丸ごと読むと、⚠ 別の断り（「消える年代は推定」）まで拾う**
          //     （⚠ 2026-08-23 に踏んだ）。⚠ **その 1 行だけを読む。**
          const y = document.querySelector("#timePanel .y");
          const o = [...document.querySelectorAll('#notes li[data-kind="caveat"]')]
            .find((e) => /この街並みは/.test(e.textContent ?? "")) ?? null;
          const fs = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
          return { year: y.textContent.trim(), yFs: fs(y),
            over: (o?.textContent ?? "").trim(), oFs: fs(o),
            op: map.getPaintProperty("bld", "fill-extrusion-opacity") };
        }); };

      // 現在は「重ねている」ではない（地面も建物もいま）
      const now = await at(0);
      must(now.over === "", `現在なのに重ねていると言っている: ${now.over}`);

      // ⚠ スライダーの端を決め打ちしない。段の数は**地点によって変わる**
      //   （広島は 1936–42 と 1984–86 が存在しないので 7 段 / max=600）。
      //   800 と書いていた頃は、この検査が「8段固定」という直したい前提そのものを
      //   固定していた。端は実装に聞く。
      const max = await page.$eval("#t", (e) => Number(e.max));
      must(max > 0, "スライダーの上限が 0（段が組まれていない）");

      // 過去は必ず言う
      const past = await at(Math.round(max * 0.75));
      must(past.over.length > 0, `過去の年代なのに、重ねていることを言っていない（${past.year}）`);
      must(/いま/.test(past.over), `いまの街だと言っていない: ${past.over}`);
      must(past.over.includes(past.year), `どの年代の地面かを言っていない: ${past.over}`);
      // ⚠ 年に対して小さすぎると「言い切っている」ことにならない（以前は 60:12 で5倍）
      must(past.yFs / past.oFs <= 3.0,
        `年 ${past.yFs}px に対して重ねの文が ${past.oFs}px（3倍以内であること）`);
      // ⚠ 幽霊にしない
      must(typeof past.op !== "number" || past.op >= 0.9,
        `過去の年代で建物が薄れている（不透明度 ${past.op}）。消えかけに見える`);

      // 明治期は建物が消えるので、建物の話をしない
      const meiji = await at(max);
      must(meiji.year === "明治期", `右端が明治期でない: ${meiji.year}`);
      must(meiji.over === "", `建物が1棟も無いのに重ねていると言っている: ${meiji.over}`);
      return `現在=無／${past.year}=「${past.over.slice(0, 28)}」${past.yFs}:${past.oFs}px／端=${max}`;
    },
  },
  {
    // ⚠ ここが核心。/peel は固定 8 段を出していたので、広島に**存在しない**
    //   1936–42（陸軍撮影は東京23区と大阪市周辺だけ）と 1984–86 のタイルを
    //   地図レイヤとして読み、写真タイルの 404 を **202 件**送っていた（2026-08-16 実測）。
    //   トップは同じ地点で「残っているのは 5 年代」と正しく答えていた。
    name: "存在しない年代を段に出さない（広島）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page, reqs) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(labels[0] === "現在", `左端が現在でない: ${labels[0]}`);
      must(labels[labels.length - 1] === "明治期", `右端が明治期でない: ${labels.at(-1)}`);
      for (const gone of ["1936–42", "1984–86"])
        must(!labels.includes(gone), `広島に存在しない ${gone} を段に出している: ${labels.join("/")}`);
      for (const keep of ["1945–50", "1961–69", "1974–78", "1979–83", "1987–90"])
        must(labels.includes(keep), `広島に残っている ${keep} が段から消えている: ${labels.join("/")}`);
      // ⚠ 不在の年代へ出てよいのは、**判定用の中心タイル1枚まで**。
      //   地図レイヤから引くと、また 100 枚単位で 404 を送ることになる。
      const count = (id) => reqs.filter((u) => u.includes(`/xyz/${id}/`)).length;
      for (const id of ["ort_riku10", "gazo3"])
        must(count(id) <= 1, `存在しない年代 ${id} のタイルを ${count(id)} 枚取りに行っている`);
      return `${labels.length} 段（${labels.join("/")}）／不在レイヤへの要求 `
        + `ort_riku10 ${count("ort_riku10")}・gazo3 ${count("gazo3")} 枚`;
    },
  },
  {
    // ⚠ 同じ地点に、トップと /peel が別の答えを出していた（掟: 同じ問いに答える実装を2つ持たない）。
    //   長崎 出島はいちばん差が大きく、固定 8 段のうち 5 年代が存在しない
    //   （2026-08-16 実測で 404 を 491 件送っていた）。
    name: "トップと /peel が、同じ地点で同じ年代を出す（長崎 出島）",
    path: `/peel?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
    // ⚠ **判定に使ったタイルが、実際に何を答えたか**を控える。
    //   ⚠ 掟: 不在と読むのは 404 だけ。timeout / 通信断 / 5xx は「読めなかった」で、
    //     その年代は**段に残す**のが正しい。
    //   ⚠ 控えないと、相手先が 1 回でも 404 以外を返した回に、
    //     **正しい振る舞いのほうを落としてしまう**
    //     （実測 2026-08-19: 実描画の失敗 4 件のうち 2 件がこれだった。
    //      同じ回の数秒前に、広島では同じレイヤを 404 と読めていた＝単発の揺れ）。
    setup: (page) => {
      page.__gsi = new Map();
      const id = (u) => (/\/xyz\/([a-z0-9_]+)\//.exec(u) ?? [])[1];
      page.on("response", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, r.status()); });
      page.on("requestfailed", (r) => { const i = id(r.url()); if (i) page.__gsi.set(i, 0); });
      return Promise.resolve();
    },
    async check(page) {
      await peelReady(page);
      const past = (l) => l.filter((x) => x !== "現在" && x !== "明治期").sort();
      const peel = past(await stepLabels(page));
      // ⚠ **必ず出るはずのものは、強いまま。**ここは相手先の揺れと関係ない
      for (const keep of ["1961–69", "1974–78"])
        must(peel.includes(keep), `出島に残っている ${keep} が段から消えている: ${peel.join("/")}`);
      // ⚠ **余分な年代は、404 と答えられた年代でないこと。**
      //   404 なのに残っていたら、それは「無い」を出せていない＝こちらの不具合。
      //   404 以外（読めなかった）で残っているなら、それは**掟どおり**。
      const ID = { "1936–42": "ort_riku10", "1945–50": "ort_USA10", "1961–69": "gazo1",
                   "1974–78": "gazo1", "1979–83": "gazo2", "1984–86": "gazo3", "1987–90": "gazo4" };
      const extra = peel.filter((x) => x !== "1961–69" && x !== "1974–78");
      const wrong = extra.filter((x) => page.__gsi.get(ID[x]) === 404);
      must(wrong.length === 0,
        `404 と答えられた年代を段に残している: ${wrong.map((x) => `${x}(${ID[x]}=404)`).join("・")}`);
      const shaky = extra.map((x) => `${x}(${ID[x]}=${page.__gsi.get(ID[x]) ?? "問い合わせ無し"})`);
      // 同じ入れ物のままトップへ移る（同じ地点・同じ相手・同じキャッシュで比べる）
      await page.goto(`${BASE}/?ll=32.74400,129.87300&q=%E9%95%B7%E5%B4%8E%20%E5%87%BA%E5%B3%B6`,
        { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitVerdict(page);
      const top = past(await page.$$eval("#strip .f .yr", (els) =>
        els.map((e) => e.textContent.trim())));
      // ⚠ **ここが本題。**同じ問いに 2 つの実装が別の答えを出していないこと。
      //   ⚠ 相手先が揺れていても、**トップと /peel は同じ揺れ方をするはず**（同じ実装を使う）。
      must(JSON.stringify(top) === JSON.stringify(peel),
        `トップと /peel の年代が食い違う: トップ ${top.join("/")} ／ /peel ${peel.join("/")}`);
      return `両方とも ${peel.join("/")}（${peel.length} 年代）`
        + (shaky.length ? `／⚠ 相手先が 404 を返さなかったぶんが残っている: ${shaky.join("・")}` : "");
    },
  },
  {
    // ⚠ 応答を固定して、4 通りの結末を作り分ける。実データに寄りかかると、
    //   相手先の整備状況が変わった日にこの検査が何も見なくなる。
    //     404      … その年代の写真は無い          → 段に出さない
    //     200 白紙 … タイルはあるが撮影範囲の外    → 段に出さない
    //     500      … 読めなかった                  → **段に残す**
    //     通信断   … 読めなかった                  → **段に残す**
    //   消してしまうと「取れなかった」が「無い」になる（掟: 取れなかったを「無い」と言わない）。
    name: "年代ごとの結末で、段に出すかを決める", path: `/peel?${TOYOSU}`,
    setup: async (page) => {
      await page.route(eraRoute("gazo3"), (r) => r.fulfill({ status: 404, body: "" }));
      await page.route(eraRoute("gazo2"), (r) => r.fulfill({
        status: 200, contentType: "image/png", body: whitePng() }));
      await page.route(eraRoute("gazo1"), (r) => r.fulfill({ status: 500, body: "" }));
      await page.route(eraRoute("ort_riku10"), (r) => r.abort());
    },
    async check(page) {
      await peelReady(page);
      const labels = await stepLabels(page);
      must(!labels.includes("1984–86"), `404 の年代を段に出している: ${labels.join("/")}`);
      must(!labels.includes("1979–83"), `白紙（撮影範囲外）の年代を段に出している: ${labels.join("/")}`);
      must(labels.includes("1974–78"), `読めなかった年代（500）を段から消している: ${labels.join("/")}`);
      must(labels.includes("1936–42"), `読めなかった年代（通信断）を段から消している: ${labels.join("/")}`);
      // 残した段では「届いていない」と言い、記録の有無は断定しない
      const k = labels.indexOf("1936–42");
      await page.$eval("#t", (e, v) => { e.value = String(v);
        e.dispatchEvent(new Event("input")); }, k * 100);
      await page.waitForTimeout(1200);
      // ⚠ **地表は第2層の材料**（2026-08-22）。⚠ **`.prov-q .prov` の最初は第1層。**
      //   ⚠ **札（実測 / 未取得）は消した**（Owner 判断: ⚠ 色で伝わる）。⚠ **字で見る。**
      const ground = (await page.evaluate(() =>
        [...document.querySelectorAll('#panel .prov-q[data-q="2"] .prov')]
          .find((e) => /地表/.test(e.textContent ?? ""))?.textContent ?? ""))
        .replace(/\s+/g, " ").trim();
      must(/届いていない/.test(ground),
        `読めなかった年代を、⚠ 取れなかったと言っていない: ${ground.slice(0, 60)}`);
      const lie = LIES.find((w) => ground.includes(w));
      must(!lie, `届いていないだけなのに「${lie}」と断定している: ${ground.slice(0, 60)}`);
      return `${labels.length} 段（${labels.join("/")}）／404と白紙は消え、500と通信断は残る`;
    },
  },
  {
    // ⚠ 段を削って詰めるだけでは駄目。建物が消える年（tFromYear）・水位・建物のフェードは
    //   **時間座標**で決まっている。広島で 2 段抜いたぶんを詰めると、
    //   同じ 1945–50 の地面の上で、建物の消え方と水位が豊洲と変わってしまう。
    // ⚠ **ここは絵を差し替えない**（2026-08-22。hidetzu/konjaku#191）。
    //   ⚠ **段に何が並ぶか**が主題で、⚠ **それは実際のタイルの中身で決まる**
    //     （`public/verify.js`。⚠ 撮影範囲の外は真っ白なので、⚠ その年代は段に出ない）。
    //   ⚠ **差し替えると、⚠ 広島に無いはずの年代まで段に並ぶ。**⚠ 主張がすり替わる。
    name: "段を間引いても、時間座標が詰まらない（広島 と 豊洲）",
    path: `/peel?ll=34.39500,132.45500&q=%E5%BA%83%E5%B3%B6`,
    async check(page) {
      const at = async (v) => { await page.$eval("#t", (e, x) => { e.value = String(x);
        e.dispatchEvent(new Event("input")); }, v); await page.waitForTimeout(300);
        return tauNow(page); };
      await peelReady(page);
      const l1 = await stepLabels(page);
      const k1 = l1.indexOf("1945–50");
      must(k1 === 5, `広島の 1945–50 が 5 段目でない: ${k1} 段目（${l1.join("/")}）`);
      const a = await at(k1 * 100);
      must(a.tau === 6, `広島の 1945–50 で時間座標が 6 でない: ${a.tau}（段は詰まっている）`);
      // 豊洲では同じ年代が 6 段目。**段は違うが時間は同じ**でなければならない
      await page.goto(`${BASE}/peel?${TOYOSU}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await peelReady(page);
      const l2 = await stepLabels(page);
      const k2 = l2.indexOf("1945–50");
      must(k2 === 6, `豊洲の 1945–50 が 6 段目でない: ${k2} 段目（${l2.join("/")}）`);
      const b = await at(k2 * 100);
      must(b.tau === a.tau, `同じ 1945–50 なのに時間座標が違う: 広島 ${a.tau} / 豊洲 ${b.tau}`);
      must(Math.abs(b.water - a.water) < 1e-9,
        `同じ 1945–50 なのに水位が違う: 広島 ${a.water} / 豊洲 ${b.water}`);
      return `1945–50 は 広島 ${k1} 段目 / 豊洲 ${k2} 段目、時間座標はどちらも ${a.tau}`
        + `（水位 ${a.water.toFixed(3)}m で一致）`;
    },
  },
];
