// 地理院の住所検索と話す、⚠ **唯一の口**（2026-08-22。hidetzu/konjaku#181）。
//
// ⚠ **なぜ切り出したか**
//   ⚠ **口が 2 か所にあった。**`places.js` と `test/search-check.mjs` が
//   ⚠ **同じ URL をそれぞれ書いていて**（掟: 同じ問いに答える実装を2つ持たない）、
//   ⚠ **42 語の回帰は、⚠ 本番の取得経路を 1 度も通っていなかった。**
//   ⚠ **検査が確かめていたのは「検査自身が書いた通信」**で、⚠ 出荷するコードではなかった。
//
// ⚠ **ここが持つもの**（＝ 外の話）
//   URL の組み立て ／ 時間切れ ／ HTTP の状態 ／ 応答の形 ／ 再試行
//
// ⚠ **ここが持たないもの**（＝ こちらの話）
//   並べ替え・選ぶかどうか（`places.js` の Domain） ／ 世代（`createSearch` の cancel）
//   ⚠ **画面の文言も持たない**（⚠ 返すのは状態と値だけ）。
//
// ⚠ **`fetch` は差し替えられる。**⚠ **検査は、⚠ この口を通したまま外へ出ないようにする**
//   （⚠ fixture を `fetch` の応答として渡す）。⚠ **そうしないと、⚠ 本番の経路が検査されない。**
(function (g) {
  "use strict";

  // ⚠ **住所検索の口は、⚠ このファイルだけが書く。**⚠ 写したら静的検査が落とす。
  const API = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
  const TIMEOUT_MS = 8000;                       // verify.js の TIMEOUT_MS と同じ

  // ⚠ 画面に出す理由は、こちらが用意した文字列だけにする（⚠ 応答の中身は入れない）
  const whyOf = (e) => e?.name === "TimeoutError" ? "時間切れ"
    : /^サーバが|^応答が/.test(e?.message ?? "") ? e.message : "通信できません";

  // opt.fetch    … 差し替え用（⚠ 既定は global.fetch）
  // opt.timeoutMs… 時間切れ（⚠ 既定は 8 秒）
  function createGsiAddressSearch(opt) {
    // ⚠ **既定の `fetch` は、⚠ 呼ぶ時点の環境から取る。**
    //   ⚠ `g` に頼ると、⚠ **検査が `new Function("window", …)` で載せたときに `fetch` が無い**
    //   （⚠ 2026-08-22 に踏んだ。⚠ live の検査が「届かなかった」と出た）。
    const doFetch = opt?.fetch ?? ((...a) => globalThis.fetch(...a));
    const timeoutMs = opt?.timeoutMs ?? TIMEOUT_MS;

    // ⚠ **1 回叩くだけ。**⚠ 再試行は下の search() が決める
    async function once(q) {
      const r = await doFetch(API + encodeURIComponent(q),
        { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`サーバが ${Number(r.status)} を返しました`);
      const j = await r.json();
      // ⚠ 200 でも本文が配列とは限らない。⚠ **形を確かめる前に「無い」と言わない**
      if (!Array.isArray(j)) throw new Error("応答が一覧の形をしていません");
      return j;
    }

    return {
      // ⚠ 返すのは ⚠ **地理院が返した一覧そのもの**（⚠ 並べ替えない）。
      //   ⚠ 取れなかったときは投げる。⚠ **「0 件」と混ぜない。**
      // ⚠ 瞬断と 5xx は 1 回だけ再試行する。
      //   ⚠ 時間切れは再試行しない（⚠ 同じ相手をもう 8 秒待たせるのは、待たせただけになる）。
      async search(q) {
        let err = null;
        for (let i = 0; i < 2; i++) {
          try { return await once(q); } catch (e) { err = e; }
          if (err?.name === "TimeoutError") break;
        }
        throw err;
      },
      // ⚠ 画面に出す理由の言い換え。⚠ **相手の文字列をそのまま出さない**
      whyOf,
      TIMEOUT_MS: timeoutMs,
    };
  }

  const api = { createGsiAddressSearch, whyOf, TIMEOUT_MS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else g.KonjakuGsiAddressSearch = api;
})(typeof window !== "undefined" ? window : globalThis);
