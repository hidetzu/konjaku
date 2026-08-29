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
  const again = $("recvAgain"), why = $("recvWhy"), hint = $("recvHint");
  const got = $("recvGot"), gotTitle = $("gotTitle"), gotBody = $("gotBody");
  const gotList = $("gotList"), gotAct = $("gotAct"), gotNote = $("gotNote"), gotMap = $("gotMap");
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

  let 来たもの = null;

  function 出し直しへ(理由) {
    got.hidden = true;
    again.hidden = false;
    why.textContent = 理由;
    hint.textContent = "大文字と小文字は区別しません。";
    // 出し直してきた人が、そのまま打てるように
    input.value = "";
    input.focus();
  }

  function 見せる(list) {
    again.hidden = true;
    got.hidden = false;
    来たもの = list;
    gotTitle.textContent = `${list.length} 件の場所を受け取りました`;
    gotBody.textContent = "この端末に足しますか。足しても、いまある保存は消えません。";
    gotList.innerHTML = list.slice(0, 20).map((r) =>
      `<li><span class="n">${esc(r.name ?? "地図から選んだ場所")}</span>`
      + `<span class="g">${esc(r.value ?? "")}</span></li>`).join("")
      + (list.length > 20 ? `<li><span class="n">ほか ${list.length - 20} 件</span></li>` : "");
    gotAct.hidden = false;
    gotMap.hidden = true;
    gotNote.textContent = "受け取った場所は、この端末の中だけに残ります。どこにも送りません。";
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
    gotTitle.textContent = `${r.足した} 件を足しました`;
    gotBody.textContent = r.重なった
      ? `${r.重なった} 件は、すでにこの端末にありました。`
      : "";
    gotList.innerHTML = "";
    gotAct.hidden = true;
    gotMap.hidden = false;
    gotNote.textContent = 置けた
      ? ""
      : "この端末では、保存した場所を覚えておけません（ブラウザの設定によります）。";
  });

  $("gotNo").addEventListener("click", () => {
    got.hidden = true;
    来たもの = null;
    input.value = "";
    input.focus();
  });
})();
