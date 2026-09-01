// 受け取り口。合言葉を打つか、リンクで来ると、別の端末で保存した場所を受け取る。
//
// ここでやること:
//   合言葉を送る → 返ってきた字を解く → 足す → /saved へ進む
// ここでやらないこと:
//   同じ場所かどうかの判定、混ぜ方（saved.js が持つ）
//   地図、年代、判定（この画面は 1 つのことだけする）
//
// 見せてから押してもらう一歩は置かない（2026-08-30。Owner 判断。ADR 0069 / 0072 を直した）。
//   合言葉は自分で 8 文字を打つし、リンクも自分で押している。
//   何を足したかは、進んだ先（/saved）で字にする。押したあとに何が起きたかは必ず言う。
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("recvForm"), input = $("recvIn"), go = $("recvGo");
  const lead = $("recvLead"), said = $("recvSaid");
  const again = $("recvAgain"), why = $("recvWhy"), hint = $("recvHint");
  const got = $("recvGot"), gotTitle = $("gotTitle"), gotBody = $("gotBody");
  const S = globalThis.KonjakuSaved;

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

  // URL から荷物を落とす。読み込み直しで、また同じことが起きないように。
  //   残ると、履歴とアドレス欄に荷物が残り、そのまま共有すると場所を配る。
  const URLを掃除 = () => {
    if (!location.hash) return;
    const u = new URL(location.href);
    history.replaceState(null, "", u.pathname + u.search);
  };

  // 押したあとに何が起きたかを、必ず字で言う。
  const 言う = (t) => { said.textContent = t ?? ""; said.hidden = !t; };

  // 受け取れなかったとき。できることから書く（CLAUDE.md §4-1）。
  //   1 行目と手順は、どの理由でも同じ。やることが同じだから。違うのは理由だけ。
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

  // 受け取ったものを足して、一覧へ進む。
  //   置けなかったときだけ、この画面に留まる。/saved は localStorage から作るので、
  //   置けていなければ何も並ばない。黙って空の一覧へ送ると「消えた」と読める。
  function 足して進む(list) {
    again.hidden = true;
    言う(null);
    const いま = store ? S.load(store) : { ok: false, list: [] };
    const r = S.merge(いま.list ?? [], list);
    const 置けた = store ? S.save(store, r.list) : false;
    URLを掃除();

    if (!置けた) {
      got.hidden = false;
      gotTitle.textContent = "この端末には残せませんでした";
      gotBody.textContent =
        "この端末では、保存した場所を覚えておけません（ブラウザの設定によります）。";
      form.hidden = true;
      lead.hidden = true;
      hint.textContent = "";
      return;
    }

    // 何が起きたかは、進んだ先で言う（docs/adr/0026）。数を URL に載せて渡す。
    //   戻ったときにこの画面へ戻らないよう replace にする。戻れると二重に足しうる。
    location.replace(`./saved?added=${r.足した}&same=${r.重なった}`);
  }

  // リンク（#）で来た人。合言葉は要らない。荷物が URL に載っている。
  //   ? には載せない。クエリは HTTP のリクエスト行に載るので、開いた瞬間に配信元へ届く。
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
    足して進む(list);
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
    足して進む(list);
  });

  // 起動時。リンクで来ていれば、合言葉を待たずに受ける。
  リンクで受ける();
})();
