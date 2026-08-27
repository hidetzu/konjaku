// 実描画 — 数字の分母と、⚠ 推定という断り（深掘り）
//
// ⚠ **`test/render/peel.mjs` から逐語で移しただけ**（2026-08-27。hidetzu/konjaku#277 の 29 本目）。
//   ⚠ **1 文字も変えていない。**⚠ **主張を強くも弱くもしていない。**
//   ⚠ **連続した 2 件を、⚠ 直上のコメントごと運んだ**ので、⚠ **並びは動かない。**
//
// ⚠ **2 件とも `CLAUDE.md` §6（数字の書き方）と §1（推定を実測のように見せない）を見ている**:
//     分母 ⚠ **主見出しと内訳が、⚠ 同じ分母で、⚠ 足して 100 になる**
//          ⚠ **豊洲では一致するので、⚠ 豊洲だけ見ていると気づけない**（⚠ 渋谷で見る）
//     推定 ⚠ **高さが推定であることを、⚠ 主張範囲の数字で、⚠ 1 か所だけ言う**
//          ⚠ **確率・確信度・評価語を出さない**
//
// ⚠ **どちらも「別の範囲の数字を持ち込むと、⚠ その数字自体が嘘になる」の側**（`CLAUDE.md` §6）。
//
// ⚠ **道具は `test/render/lib.mjs` の 1 か所**（⚠ ここで持ち直さない）。

import { TOYOSU, peelReady, settleAfterCondition, must, provText } from "./lib.mjs";

export const CASES = [
  // ⚠ **主見出しと内訳の分母がそろっていること**（2026-08-23。Owner 判断。掟 §6）。
  //   ⚠ **豊洲では一致するので、⚠ 豊洲だけ見ていると気づけない。**
  //   ⚠ **整備範囲の端（渋谷）で見る**（⚠ 実測: ⚠ 範囲の 86.7% は区分が付いていない）。
  {
    name: "面積の内訳は、主見出しと同じ分母で、足して 100 になる",
    path: "/peel?ll=35.65860,139.70160&q=%E6%B8%8B%E8%B0%B7", group: "core",
    async check(page) {
      await peelReady(page);
      await settleAfterCondition(page);
      const r = await page.evaluate(() => {
        const L = [...document.querySelectorAll("#landAll .land-layer")][1];
        const den = (L?.querySelector(".land-den")?.textContent ?? "").replace(/\s+/g, " ").trim();
        const head = (L?.querySelector(".land-num")?.textContent ?? "").trim();
        const rows = [...document.querySelectorAll("#areaBreak .stat")]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim());
        return { den, head, rows };
      });
      must(r.rows.length > 1, `内訳が出ていない: ${r.rows.join(" / ")}`);
      // ⚠ **範囲の大きさを言っている**（掟 §6: ⚠ どの範囲の数字かを明示する）
      must(/\d+×\d+m/.test(r.den), `範囲の大きさを言っていない: 「${r.den}」`);
      // ⚠ **特定できなかったぶんを、⚠ 行として出す**（掟 §1）
      must(r.rows.some((t) => /区分が分からない/.test(t)),
        `特定できなかったぶんを隠している: ${r.rows.join(" / ")}`);
      // ⚠ **足して 100**（⚠ 「0.1% 未満」は 0 で数える。⚠ 丸めのぶん 1.0 まで許す）
      const sum = r.rows.reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      must(Math.abs(sum - 100) <= 1.0,
        `内訳が足して 100 にならない（${sum.toFixed(1)}%）: ${r.rows.join(" / ")}`);
      // ⚠ **主見出しと、⚠ 内訳の水が食い違わない**（⚠ 同じ分母なので近いはず）。
      //   ⚠ **水かどうかは `swale.js` が持つ**（⚠ ここで区分名を書き写さない。掟）。
      //   ⚠ **「0.1% 未満」の行は 0 で数える**ので、⚠ そのぶん内訳のほうが小さく出る。
      const wetNames = await page.evaluate(() =>
        (KonjakuSwale.SWALE ?? []).filter((c) => c.water).map((c) => c.name));
      const w = r.rows.filter((t) => wetNames.some((n) => t.startsWith(n)))
        .reduce((t, x) => t + Number((x.match(/([\d.]+)%/) ?? [0, 0])[1] || 0), 0);
      const head = Number(String(r.head).replace(/[^\d.]/g, ""));
      must(Math.abs(w - head) <= 0.5,
        `主見出し ${head}% と、⚠ 内訳の水 ${w.toFixed(1)}% が食い違う（分母が違う）`);
      return `${head}%／内訳 ${r.rows.length} 行・合計 ${sum.toFixed(1)}%／「${r.den}」`;
    },
  },
  {
    name: "高さが推定であることを、主張範囲の数字で 1 か所だけ言う", path: `/peel?${TOYOSU}`,
    async check(page) {
      // ⚠ **`#status` の「件を判定しました」は、⚠ 狭い幅で畳まれている**（`ba54efc`）。
      //   ⚠ **待っているのは「答えが描けたこと」**なので、⚠ **`peelReady` に寄せる**
      //   （⚠ `.prov-q[data-q="3"]` を見る。⚠ 幅にも `#status` にも依らない）。
      await peelReady(page);
      await settleAfterCondition(page);
      const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      // ⚠ **建物の総数は、⚠ 3 つ目の問いの答えが持つ**（2026-08-22 以降。⚠ `#status` ではない）。
      //   ⚠ **見ている主張は同じ**（⚠ 建物が実際に建っていること）。
      const total = Number((t.match(/(\d+)\s*件\s*の建物が、この範囲にあります/) ?? [])[1]);
      must(total > 0, `件数が読めない: ${t.slice(0, 80)}`);
      // 「いま画面に出ているもの」に高さの行があること（畳んでいないこと）
      const prov = await provText(page);
      must(/高さ/.test(prov), `出所の一覧に高さの行が無い: ${prov.replace(/\s+/g, " ").slice(0, 120)}`);
      must(/既定値/.test(prov), "高さが推定であることが書かれていない");
      // ⚠ **数え方は「推定」を主語に統一した**（2026-08-21。Owner 判断）。
      //   ⚠ 前は台帳が「OSM に高さが入っているのは 40 / 543 件」（⚠ **実測が主語**）で、
      //     ⚠ #est が「高さも 503 / 543 件が推定です」（⚠ **推定が主語**）だった。
      //     ⚠ **同じ母数を逆から 2 通りに言っていた**（40 ＋ 503 = 543）。
      //     ⚠ 利用者役 4 名のうち 2 名が突き合わせられず、⚠ 1 名は「別のことだと思った」。
      //   ⚠ **母数つきの主張は #est の 1 か所。**⚠ 台帳は内訳（⚠ 同じ数字を持たない）。
      // ⚠ **2026-08-21 に、⚠ 分母つきは帯からパネルへ移った**（hidetzu/konjaku#151）。
      //   ⚠ **見ている主張は同じ**: ⚠ 推定を主語に、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。
      // ⚠ **件数は内訳が持つ**（2026-08-22。Owner 判断）。⚠ **主張は同じ**:
      //   ⚠ **推定の件数が、⚠ 主張範囲の分母つきで、⚠ 1 か所だけ。**
      const bd = await page.evaluate(() =>
        (document.getElementById("breakdown")?.textContent ?? "").replace(/\\s+/g, " "));
      const mh = bd.match(/高さが分かる\s*(\d+)\s*\/\s*(\d+)/);
      must(mh, `高さの件数が分母つきで出ていない: ${bd.slice(0, 120)}`);
      must(Number(mh[2]) === total,
        `高さの分母が主張範囲と違う: ${mh[2]} / 判定した件数 ${total}`);
      // ⚠ **推定は「実測でない分」**（⚠ 総数 − 実測）。⚠ **半分を超えていること。**
      const m = [null, String(Number(mh[2]) - Number(mh[1])), mh[2]];
      must(Number(m[1]) > Number(m[2]) * 0.5,
        `推定が半分以下なのに「ほとんどが既定値」と書いている: ${m[1]}/${m[2]}`);
      // ⚠ **同じ母数を、⚠ 実測を主語にしてもう一度言っていないこと**
      must(!/高さが入っているのは \d+ \/ \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **行の名を「高さが実測」→「高さが分かる」に変えた**（2026-08-23。Owner 判断）。
      //   ⚠ **否定形なので、⚠ 字を古いままにすると「見ていないのに緑」になる。**
      must(!/高さが(実測|分かる)の \d+ 件/.test(prov),
        `同じ母数を実測の側からも言っている（押す先の名前）: ${prov.replace(/\s+/g, " ").slice(0, 140)}`);
      // ⚠ **内訳は足して推定の件数になること**（⚠ 台帳が持つのは内訳だけ）
      // ⚠ **内訳の言い方も変わった**（2026-08-22）: 「階数から換算 X 件 ／ 種別ごとの既定値 Y 件」
      const mm = bd.match(/階数から換算\s*(\d+)\s*件\s*／\s*種別ごとの既定値\s*(\d+)\s*件/);
      must(mm, `高さの内訳が読めない: ${bd.slice(0, 160)}`);
      must(Number(mm[1]) + Number(mm[2]) === Number(m[1]),
        `内訳が推定の件数と合わない: ${mm[1]} ＋ ${mm[2]} ≠ ${m[1]}`);
      // ⚠ 内訳の表には入れない。あの表は足元の判定の**分割**（足すと総数になる）で、
      //   高さや建設年は**素性**なので、混ぜると足し算の合わない表になる。
      must(!/高さが(実測|分かる)の建物/.test(t), "素性（高さ）が、分割の表である内訳に混ざっている");
      // ⚠ 評価語を作らない
      for (const w of ["ほぼ正確", "おおむね", "信頼度", "精度は"])
        must(!t.includes(w), `評価語が入っている: 「${w}」`);
      return `${m[1]} / ${m[2]} 件が推定（判定した件数と一致）／内訳 ${mm[1]} ＋ ${mm[2]}`;
    },
  },
];
