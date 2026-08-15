// 最小の静的ファイルサーバ。別プロト face-fairness のものと同じ作り。
// 地図タイルは地理院から直接取るので、ここが配信するのは index.html と vendor/ だけ。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";

// 配信対象は public/ のみ（wrangler.jsonc の assets.directory と揃える）
const ROOT = join(import.meta.dirname, "public");
const PORT = Number(process.env.PORT ?? 8081);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

// 本番（public/_headers）と揃える。⚠ ここが食い違うと、ローカルと CI でだけ
// 起きる／起きないが生まれる。
//   vendor/  … 中身が変わったらファイル名が変わる前提のもの。長く持たせる
//   それ以外 … 毎回確認させる（索引と束が食い違うと、古い束を根拠に断定してしまう）
// ⚠ _headers は `immutable` を付けているが、ここでは付けない。
//   ローカルは差し替えて試す場所で、immutable だとブラウザが再読込でも取りに行かない。
const CACHE_LONG = "public, max-age=86400";
const CACHE_NONE = "no-cache";

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
  // ⚠ 先頭の `/` を落としたもので判定する。**`rel` は `/vendor/…` の形**なので、
  //   `rel.startsWith("vendor")` は**常に false** だった（実測 2026-08-15）。
  //   「MapLibre は 1MB あるのでキャッシュさせる」と書いてあったのに、
  //   **一度も効いていなかった**。文字列の先頭一致を、正規化の結果とずらしたのが原因。
  //   ⚠ 形（先頭の `/` の有無）に依存しないよう、判定用の値を1つに決めてから使う。
  const relPath = rel.replace(/^[/\\]+/, "");
  try {
    // Workers Assets は /peel を peel.html として返す（既定の html_handling）。
    // ローカルでも同じ挙動にしておかないと、本番だけ動く／壊れるが起きる。
    let target = join(ROOT, rel);
    if (!extname(rel)) {
      try { await readFile(target); }
      catch { target = join(ROOT, rel + ".html"); }
    }
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(rel) || ".html"] ?? "application/octet-stream",
      // MapLibre は 1MB あるのでキャッシュさせる
      "cache-control": relPath.startsWith("vendor/") ? CACHE_LONG : CACHE_NONE,
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
