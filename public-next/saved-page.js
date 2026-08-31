// 保存した場所の一覧（/saved）。
//
// ここでやること: 控えを読む → 並べる → 1 件を選んだら深掘りへ渡す
//   別の端末へ手渡す（2026-09-01 にここへ移した。前は地図の画面の板にあった）
// ここでやらないこと:
//   保存する・消す（地図の画面が持つ）
//   同じ場所かの判定・混ぜ方（saved.js が持つ）
//   何日前かの言葉（when.js が持つ）
//
// ファイル名が saved-page.js なのは、saved.js が控えの置き場として先にあるから。
//   同じ名前にすると、どちらを読んでいるか分からなくなる。
(() => {
  const $ = (id) => document.getElementById(id);
  const S = globalThis.KonjakuSaved;
  const { esc } = window.KonjakuEsc;
  const crossDev = $("crossDev"), crossDevText = $("crossDevText");
  const handOut = $("handOut"), handOutText = $("handOutText");
  const handCopy = $("handCopy"), handCopyText = $("handCopyText");
  const codeEl = $("code"), codeUrl = $("codeUrl"), codeWord = $("codeWord");
  const codeNote = $("codeNote"), codeAlt = $("codeAlt"), codeBody = $("codeBody");

  // 置き場が読めないことと、1 件も無いことは違う。読めないときだけ断る。
  const store = (() => {
    try { const t = globalThis.localStorage; t.getItem(S.KEY); return t; } catch { return null; }
  })();

  const 読む = () => {
    if (!store) return { ok: false, list: [] };
    return S.load(store);
  };

  // 深掘りの行き先。座標の桁は place-arg.js の 1 か所が持つ。
  //   placeQuery は ?q=&ll=… を返す。町名は q に入れず、空の q は落とす
  //   （トップの deepLink と同じ形。/deep は q を使わない）。
  const 深掘りへ = (r) => {
    const q = KonjakuPlaceArg.placeQuery({ lat: r.lat, lon: r.lon });
    return "./deep" + (q ? q.replace(/^\?q=&/, "?") : "");
  };

  // 地図へ戻る道。深掘りと同じ形（back.js の 1 か所）。
  //   一覧はどの場所の一覧でもないので、行き先は地図そのもの。
  //   同じサイトから来ていれば「← ひとつ前へ」になり、いた場所の地図へ帰れる。
  KonjakuBack.wire($("back"), "./", "地図で調べる");

  const { ok, list } = 読む();
  const items = $("listItems");

  // 受け取り口から来たとき、何が起きたかを言う（docs/adr/0026）。
  //   数は URL で渡ってくる。0 件のときも黙らない（「押したのに何も起きない」に見える）。
  //   ⚠ 数えたのは受け取り口。ここでは数え直さない（2 か所で数えると食い違う）。
  {
    const sp = new URLSearchParams(location.search);
    if (sp.has("added")) {
      const 足した = Math.max(0, Number(sp.get("added")) || 0);
      const 重なった = Math.max(0, Number(sp.get("same")) || 0);
      const said = $("listSaid");
      said.hidden = false;
      said.textContent = 足した
        ? `${足した} 件を足しました。`
          + (重なった ? `${重なった} 件は、すでにこの端末にありました。` : "")
        : 重なった
          ? `${重なった} 件とも、すでにこの端末にありました。`
          : "足すものがありませんでした。";
      // 読み込み直しで、また同じことを言わないように落とす。
      const u = new URL(location.href);
      u.searchParams.delete("added");
      u.searchParams.delete("same");
      history.replaceState(null, "", u.pathname + u.search);
    }
  }

  if (list.length) {
    $("listN").textContent = `${list.length} 件`;
    $("listNote").hidden = false;
    // 行そのものが 1 つの押し先。行の中に別の押し先を置かない。
    items.innerHTML = list.map((r) =>
      `<li><a class="list__a" href="${esc(深掘りへ(r))}">`
      + `<span class="list__body">`
      + `<span class="list__name">${esc(r.name ?? "地図から選んだ場所")}</span>`
      + `<span class="list__meta">${esc(KonjakuWhen.text(r.at))}`
      + `${r.value ? `　${esc(r.value)}` : ""}</span>`
      + `</span><span class="list__go" aria-hidden="true">深く読む →</span>`
      + `</a></li>`).join("");

  // ---- 別の端末へ手渡す ----
  //
  // サーバに置かない（docs/adr/0048）。URL に載せて渡す。
  //   要るものが何も無く、言えなくなることが 1 つも無い。そこが 5 段目（同期）との違い。
  // 詰め方と混ぜ方は saved.js の 1 か所。ここは口を呼ぶだけ。
  //
  // 圧縮はブラウザの CompressionStream。無い環境では生で渡す（件数は減るが渡せる）。
  //   実測（2026-08-29・test/check/saved.mjs）: 名前つき 50 件で 生 5521 文字 → 圧縮 941 文字。
  //   字への直し方（base64url）は saved.js が持つ。ここで書き直さない。
  //     渡す側と受け取る側で食い違うと、例外にならず「読めない」だけが返る。
  const 圧縮 = async (text) => {
    if (!globalThis.CompressionStream) throw new Error("圧縮できない");
    const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return S.bytes2b64(new Uint8Array(await new Response(s).arrayBuffer()));
  };
  const 解凍 = async (text) => {
    const s = new Blob([S.b642bytes(text)]).stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return await new Response(s).text();
  };

  // 受け取るのは /take（2026-08-30）。地図の上では受けない。
  //   前は location.pathname に戻していたので、トップで受けていた。
  //
  // 荷物は # に載せる。? だと配信元へ届く（2026-08-30 に直した）。
  //   クエリは HTTP のリクエスト行に載るので、開いた瞬間に保存した場所ぜんぶが
  //   配信元（Cloudflare）へ届いていた。画面は「サーバを通さずに渡す」と言っている。
  //   フラグメントはリクエストに含まれない。ブラウザの中だけに残る。
  //   これで、画面の字が字義どおりになる（ADR 0069 の意図）。
  async function handUrl() {
    const t = await S.toText(list, globalThis.CompressionStream ? 圧縮 : null);
    return `${location.origin}/take#${t}`;
  }

  // 渡せる長さの上限。実測で決めている（2026-08-29・Chromium・tmp/measure-urllen.mjs）。
  //   50 件 1168 文字 / 100 件 2033 / 500 件 9172 / 700 件 12829 まで開けた。
  //   1000 件 18172 文字で 431（配信側のヘッダ上限。16KB）。
  //   ⚠ 以前は 2000 文字で止めていた。実測の 6 分の 1 で、100 件の手前で止まっていた。
  //     止めていたのは受け取る側ではなく、こちらの自主規制だった。
  //   ⚠ 12000 にするのは、配信の 16KB より手前で止めるため。
  //     受け取る側（LINE やメール）が折り返すかどうかは測っていない。だから余白を残す。
  const 渡せる長さ = 12000;

  // ---- 合言葉（引換券）----
  //
  // スマホが出して、PC で打つ（docs/adr/0072）。本人確認ではない。荷物の引換券。
  //   預けるのは saved.js が詰めた 1 本の字。サーバは中を読まない（docs/sync-api.md）。
  //
  // 残り時間の文は、サーバが返す ttl_sec から作る。ここに分数を直書きしない。
  //   直書きすると、設定を変えたとき画面だけ前の数字のまま残る。
  const 分で言う = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 1 ? `${m} 分` : `${Math.max(1, Math.round(sec))} 秒`;
  };

  function 板を出す({ url, word, note, リンクを開く }) {
    codeUrl.textContent = url ?? "";
    codeWord.textContent = word ?? "";
    codeBody.hidden = !word;          // 合言葉が無いときは、住所も出さない
    codeNote.textContent = note ?? "";
    codeAlt.open = !!リンクを開く;
    codeEl.hidden = false;
  }

  crossDev.addEventListener("click", async () => {
    if (!list.length) return;
    crossDevText.textContent = "用意しています";
    let 結果 = null;
    try {
      const payload = await S.toText(list,
        globalThis.CompressionStream ? 圧縮 : null);
      const res = await fetch("/api/handoff", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (res.ok) 結果 = await res.json();
      else 結果 = { だめ: res.status };
    } catch { 結果 = { だめ: "通信" }; }
    crossDevText.textContent = "PC やタブレットでも見る";

    if (結果?.code) {
      // 受け取り口の住所。打ち写すものなので、scheme は出さない
      板を出す({
        url: `${location.host}/take`,
        word: 結果.code,
        note: `${分で言う(結果.ttl_sec ?? 300)}で使えなくなります。`
          + "そのあとは、もう一度押すと新しく出ます。",
        リンクを開く: false,
      });
      return;
    }
    // 合言葉を出せなかった。できることから言う（CLAUDE.md §4-1）。
    //   代わりの道（リンク）は畳んである。ここでは開いて見せる。
    //   ⚠ 「取得できませんでした」と書かない。利用者の回線の話に読める。
    板を出す({
      url: null, word: null,
      note: 結果?.だめ === "通信"
        ? "いまは合言葉を出せませんでした。下のリンクなら、通信が戻らなくても渡せます。"
        : "いまは合言葉を出せませんでした。下のリンクで渡せます。"
          + "この端末に保存した場所は、そのままです。",
      リンクを開く: true,
    });
  });

  $("codeClose").addEventListener("click", () => {
    codeEl.hidden = true;
    crossDev.focus();
  });

  let handTimer = null;
  handOut.addEventListener("click", async () => {
    const url = await handUrl();
    if (url.length > 渡せる長さ) {
      // 何件なら渡せるかは言えない（1 件あたりの長さは名前の長さで変わる）。
      //   だから「減らす」とだけ言う。数を出すと、その数で必ず渡せるように読める。
      handOutText.textContent = "件数が多くて渡せません";
      clearTimeout(handTimer);
      handTimer = setTimeout(() => { handOutText.textContent = "リンクを作って送る"; }, 3000);
      return;
    }
    const 言う = (t) => {
      handOutText.textContent = t;
      clearTimeout(handTimer);
      handTimer = setTimeout(() => { handOutText.textContent = "リンクを作って送る"; }, 2600);
    };
    // 送る口。⚠ URL だけを渡す。題も説明も付けない（2026-08-31 に外した）。
    //   付けていたときは、共有シートの先で題・説明・URL がつながり、
    //   貼っても開けなかった（Owner が実機で 2 度踏んだ。2 度目は URL の末尾に字が付いていた）。
    //   つなぎ方は受け取ったアプリが決めるので、こちらでは前にも後ろにも置けない。
    //   このリンクは自分あてに送るもの（画面がそう言っている）。説明する相手がいない。
    //   場所を送る口（#share）も、前から URL だけを渡している。そちらに揃えた。
    if (navigator.share) {
      try { await navigator.share({ url }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    // 共有シートが無い端末（PC の多く）。ここは写すしかない。
    try { await navigator.clipboard.writeText(url); 言う("リンクを写しました"); }
    catch { 言う("この端末では写せません"); }
  });

  // 写す口。⚠ URL だけを写す。題も説明も付けない。
  //   共有シートの「コピー」で貼っても開けない、という報告から分けた（2026-08-30）。
  let copyTimer = null;
  handCopy.addEventListener("click", async () => {
    const url = await handUrl();
    const 言う = (t) => {
      handCopyText.textContent = t;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { handCopyText.textContent = "リンクだけを写す"; }, 2600);
    };
    if (url.length > 渡せる長さ) { 言う("件数が多くて渡せません"); return; }
    try { await navigator.clipboard.writeText(url); 言う("写しました"); }
    catch { 言う("この端末では写せません"); }
  });

  // 受け取るのは /take だけ（2026-08-30。Owner 判断）。
  //   前はここにも板があり、リンクで来た人を地図の上で受けていた。
  //   同じ問いに答える画面が 2 つあると、片方だけ直る。実際にそうなった
  //   （URL の掃除が「いまはしない」にしか無かった）。
  //   だから手渡しのリンクも /take へ向ける（下の handUrl）。

  // 1 件も無いうちは出さない（渡すものが無い）。地図の画面の板にあったときと同じ考え方。
  crossDev.hidden = list.length === 0;

    return;
  }

  // 1 件も無い。空白にしない。何をすれば並ぶかを言う。
  //   読めなかったときは、別のことを言う（「無い」と言わない）。
  $("listEmpty").hidden = false;
  if (!ok) {
    document.querySelector(".list__emptyH").textContent = "保存した場所を読み出せません";
    document.querySelector(".list__emptyP").textContent =
      "この端末では、保存した場所を覚えておけません（ブラウザの設定によります）。"
      + "地図で保存しても、ここには並びません。";
  }

})();
