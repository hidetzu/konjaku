// 受け取り口。合言葉を打つと、別の端末で保存した場所を受け取る。
//
// ここでやること:
//   合言葉を送る → 返ってきた字を解く → 見せる → 押されたら足す
// ここでやらないこと:
//   同じ場所かどうかの判定、混ぜ方（saved.js が持つ）
//   地図、年代、判定（この画面は 1 つのことだけする）
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("recvForm"), input = $("recvIn"), go = $("recvGo");
  const lead = $("recvLead"), said = $("recvSaid");
  const again = $("recvAgain"), why = $("recvWhy"), hint = $("recvHint");
  const got = $("recvGot"), gotTitle = $("gotTitle"), gotBody = $("gotBody");
  const gotList = $("gotList"), gotAct = $("gotAct"), gotNote = $("gotNote");
  const gotSaved = $("gotSaved");
  const S = globalThis.KonjakuSaved;
  // 名前は「別の端末が送ってきた字」。素通しで組み立てない。
  //   ⚠ 取れなかったときに素通しへ落ちる書き方をしない。落ちるなら、ここで落とす。
  const { esc } = window.KonjakuEsc;

  // 置き場が読めないことと、1 件も無いことは違う。読めないときだけ断る。
  const store = (() => {
    try { const t = globalThis.localStorage; t.getItem(S.KEY); return t; } catch { return null; }
  })();

  // 解凍はブラウザが持つ。saved.js には持たせない（持たせると検査がブラウザ抜きで回せない）。
  const 解凍 = async (text) => {
    const bytes = S.b642bytes(text);
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(s).text();
  };

  // 打ち写しの揺れを吸収する。大文字と小文字は区別せず、区切りは落とす。
  //   これは画面がそう言っているので、ここで必ず守る。
  const 整える = (s) => String(s ?? "").replace(/[\s-]/g, "").toUpperCase();

  // 深掘りの行き先。座標の渡し方は 1 か所（place-arg.js）に寄せたいが、
  //   この画面は地図も検索も持たないので、ここでは緯度経度だけを渡す。
  const 深掘りへ = (r) =>
    `./deep?ll=${Number(r.lat).toFixed(5)},${Number(r.lon).toFixed(5)}`;

  let 来たもの = null;

  // ② URL から take を落とす。読み込み直しで、また同じ問いが出ないように。
  //   前は「いまはしない」にしか無く、足したあとは残っていた（2026-08-30 に踏んだ）。
  //   残ると、履歴とアドレス欄に荷物が残り、そのまま共有すると場所を配る。
  const URLを掃除 = () => {
    if (!location.hash) return;
    const u = new URL(location.href);
    history.replaceState(null, "", u.pathname + u.search);
  };

  // 押したあとに何が起きたかを、必ず字で言う。
  const 言う = (t) => { said.textContent = t ?? ""; said.hidden = !t; };

  function 出し直しへ(理由) {
    got.hidden = true;
    言う(null);
    again.hidden = false;
    why.textContent = 理由;
    hint.textContent = "大文字と小文字は区別しません。";
    // 出し直してきた人が、そのまま打てるように
    input.value = "";
    input.focus();
  }

  function 見せる(list) {
    again.hidden = true;
    言う(null);
    got.hidden = false;
    来たもの = list;
    gotTitle.textContent = `${list.length} 件の場所を受け取りました`;
    gotBody.textContent = "この端末に足しますか。足しても、いまある保存は消えません。";
    gotList.innerHTML = list.slice(0, 20).map((r) =>
      `<li><span class="n">${esc(r.name ?? "地図から選んだ場所")}</span>`
      + `<span class="g">${esc(r.value ?? "")}</span></li>`).join("")
      + (list.length > 20 ? `<li><span class="n">ほか ${list.length - 20} 件</span></li>` : "");
    gotAct.hidden = false;
    gotSaved.hidden = true;
    gotNote.textContent = "受け取った場所は、この端末の中だけに残ります。どこにも送りません。";
  }

  // ③ リンク（?take=）で来た人。合言葉は要らない。荷物が URL に載っている。
  //   受けるのはこの画面だけ（2026-08-30。Owner 判断）。前は地図の上にも板があった。
  //
  // 荷物は # にしか載らない。? だと配信元へ届く（クエリは HTTP のリクエスト行に載る）。
  //   ?take= を読む口は外した（2026-08-30。Owner 判断）。まだリリースしていないので、
  //   古いリンクを持っている人がいない。残す限り、開けば荷物が配信元へ届く。
  async function リンクで受ける() {
    const t = location.hash.slice(1);
    if (!t) return false;
    const list = await S.fromText(t, 解凍).catch(() => null);
    if (!list) {
      // 読み取れなかった。「無い」とも「0 件」とも言わない。
      //   ここは合言葉を出し直しても解けない（リンクが壊れている）ので、字を分ける。
      again.hidden = false;
      why.textContent = "このリンクは読み取れませんでした。"
        + "この端末に保存した場所は、そのままです。";
      URLを掃除();
      return true;
    }
    見せる(list);
    return true;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = 整える(input.value);
    if (!code) { input.focus(); return; }
    go.disabled = true;
    go.textContent = "受け取っています";
    let 結果 = null;
    try {
      const res = await fetch(`/api/handoff/${encodeURIComponent(code)}`);
      結果 = { status: res.status, body: res.ok ? await res.json() : null };
    } catch { 結果 = { status: 0, body: null }; }
    go.disabled = false;
    go.textContent = "受け取る";

    // 読めなかったことを、「無い」と言わない（CLAUDE.md §1）。
    if (結果.status === 410) {
      出し直しへ("合言葉は、しばらくすると使えなくなります。"
        + "いま入れた合言葉は、その時間を過ぎています。");
      return;
    }
    if (結果.status === 404) {
      // 打ち間違いと、期限切れの 2 回目が、同じところへ来る。言い切らない。
      出し直しへ("いま入れた合言葉は使えません。"
        + "時間を過ぎたか、打ち間違いかもしれません。");
      return;
    }
    if (結果.status === 429) {
      出し直しへ("続けて試したので、しばらく受け取れません。少し待ってから、もう一度お試しください。");
      return;
    }
    if (結果.status !== 200 || !結果.body?.payload) {
      出し直しへ("いまは受け取れませんでした。この端末に保存した場所は、そのままです。");
      return;
    }
    const list = await S.fromText(結果.body.payload, 解凍).catch(() => null);
    if (!list) {
      // 字は届いたが読めなかった。「0 件だった」と言わない。
      出し直しへ("受け取った中身を読み取れませんでした。"
        + "この端末に保存した場所は、そのままです。");
      return;
    }
    見せる(list);
  });

  $("gotYes").addEventListener("click", () => {
    if (!来たもの) return;
    const いま = store ? S.load(store) : { ok: false, list: [] };
    const r = S.merge(いま.list ?? [], 来たもの);
    const 置けた = store ? S.save(store, r.list) : false;
    来たもの = null;
    gotTitle.textContent = `${r.足した} 件を足しました`;
    gotBody.textContent = r.重なった
      ? `${r.重なった} 件は、すでにこの端末にありました。`
      : "";
    // ④ 受け取った場所から、深掘りへ行けるようにする。
    //   前は名前が消えて「地図をひらく」だけが残り、しかも場所を渡していなかった。
    //   この画面は帰宅後の PC で開く。深掘りは、まさにここでやること。
    gotList.innerHTML = r.list.slice(0, 20).map((x) =>
      `<li><span class="n">${esc(x.name ?? "地図から選んだ場所")}</span>`
      + `<a class="recv__deep" href="${深掘りへ(x)}">深く読む</a></li>`).join("")
      + (r.list.length > 20 ? `<li><span class="n">ほか ${r.list.length - 20} 件</span></li>` : "");
    gotAct.hidden = true;
    // ここから先は /saved が引き受ける。この画面の一覧は、いま足したものの控え。
    gotSaved.hidden = false;
    // 「地図をひらく」は置かない（2026-08-30。Owner 判断）。
    //   保存した場所を地図にまとめて出す仕組みが、どこにも無い。地図に出る印は「ここ」1 点だけ。
    //   前は受け取った 1 件目へ飛ばしていたが、それは「まとめて見る」ではない。
    //   地図を見たい要求は、各行の「深く読む」→ /deep から、場所を選んだ状態で行ける。
    //   アプリのトップへは、上の名乗りから行ける。
    gotNote.textContent = 置けた
      ? ""
      : "この端末では、保存した場所を覚えておけません（ブラウザの設定によります）。";
    URLを掃除();
    // 終わったら、入力の口を畳む。この画面は 1 つのことをする画面で、
    //   足したあとに「まだ何か入れるのか」と読ませない。
    //   もう一度受け取りたい人のために、開き直す道は残す。
    form.hidden = true;
    lead.hidden = true;
    hint.textContent = "別の合言葉で受け取るときは、この画面を開き直してください。";
  });

  // 起動時。リンクで来ていれば、合言葉を待たずに受ける。
  リンクで受ける();

  $("gotNo").addEventListener("click", () => {
    got.hidden = true;
    来たもの = null;
    URLを掃除();
    // 押したのに何も言わないと、効いたのか分からない。
    言う("足していません。この端末に保存した場所は、そのままです。");
    input.value = "";
    input.focus();
  });
})();
