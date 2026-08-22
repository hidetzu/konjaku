// 同じものを、外へ 2 回取りに行かない（2026-08-22。hidetzu/konjaku#191）。
//
// ⚠ **`browser.newPage()` は、⚠ ケースごとに新しいキャッシュを作る。**
//   ⚠ **実測（2026-08-22・手元・peel core 68 件）**: 外へ 9,269 本のうち
//     ⚠ **別々の URL は 1,996 本しかなく、⚠ 76.3% が同じものの取り直しだった。**
//     ⚠ seamlessphoto を 2,168 回（別々 362）、gazo4 を 1,988 回（別々 326）。
//
// ⚠ **これは「絵を偽る」のとは違う。**⚠ **1 回目は必ず実物を取りに行き、
//   ⚠ 返ってきたものを、⚠ 状態も見出しも中身もそのまま控えて、⚠ 2 回目以降に再生する。**
//   ⚠ **404 は 404 のまま。**⚠ だから「その年代の写真があるか」の答えは変わらない
//   （⚠ hidetzu/konjaku#211 で、⚠ 絵を偽ると軽井沢が 1年代 → 7年代 に化けた）。
//
// ⚠ **ブラウザを知らない形にしてある**（`.claude/rules/javascript.md`）。
//   ⚠ **取りに行く手立ては、⚠ 呼ぶ側が渡す。**⚠ だから Node だけで確かめられる。
//
// ⚠ **控えないもの**: 失敗（取りに行けなかった）は控えない。
//   ⚠ **「取れなかった」を「これが答えだ」に変えない**（掟 §1）。

export const createShelf = () => {
  const box = new Map();
  let real = 0, replayed = 0;
  return {
    // ⚠ `fetchOnce` は「実物を 1 回取りに行く」手立て。⚠ 投げたら控えない。
    async get(key, fetchOnce) {
      const hit = box.get(key);
      if (hit) { replayed++; return hit; }
      const rec = await fetchOnce();       // ⚠ 投げたら、⚠ そのまま呼び手へ返す
      box.set(key, rec);
      real++;
      return rec;
    },
    // ⚠ **数は控えた側が名乗る**（⚠ 呼ぶ側で数え直さない）
    stats: () => ({ real, replayed, kept: box.size }),
  };
};
