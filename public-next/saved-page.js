// 保存した場所の一覧（/saved）。
//
// ここでやること: 控えを読む → 並べる → 1 件を選んだら深掘りへ渡す
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
