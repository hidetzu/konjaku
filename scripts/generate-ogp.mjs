import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTH = 1200;
const HEIGHT = 630;
const SITE = "https://konjaku.hidetzu.work";
const FONT = "assets/ogp/NotoSansCJKjp-Bold.subset.otf";
const MANIFEST = "assets/ogp/manifest.json";

export const OGP_PAGES = [
  // ⚠ **v0.1.0 は 1 枚だけ**（2026-09-01。`docs/adr/0080`）。
  //   ⚠ **β 版は 2 枚だった**（⚠ `/` と `/peel`）。⚠ **`/peel` は本番から消えた。**
  //   ⚠ **`/deep` には作らない。**⚠ **あれは場所ごとに中身が変わる画面**で、
  //     ⚠ 見出しも実行時に決まる。⚠ **静止した 1 枚では、⚠ その場所の話にならない。**
  {
    id: "index",
    html: "public/index.html",
    svg: "assets/ogp/index.svg",
    png: "public/ogp.png",
    imageUrl: `${SITE}/ogp.png`,
    title: "この土地は、昔なんだったのか？ — 今昔",
    headline: "この土地は、昔なんだったのか？",
    lines: ["この土地は、", "昔なんだったのか？"],
    subtitle: "土地の成り立ちを、根拠とともに見る",
    // ⚠ **`kind` は残す**（⚠ 2 枚目を足すとき、⚠ ここで絵を選び分ける）。
    //   ⚠ **2026-09-01 に `peelArt` を落とした**（⚠ `/peel` は本番から消えた）。
    kind: "index",
  },
];

const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const file = (path) => join(ROOT, path);

const commonDefs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0e13"/>
      <stop offset="1" stop-color="#111923"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#5ba3e0" stop-opacity=".26"/>
      <stop offset="1" stop-color="#5ba3e0" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#eaeef3" stroke-opacity=".055"/>
    </pattern>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".38"/>
    </filter>
  </defs>`;

const indexArt = `
  <g transform="translate(760 102)" filter="url(#shadow)">
    <path d="M0 118 184 20l184 98-184 99z" fill="#172431" stroke="#6fc3ff" stroke-opacity=".55" stroke-width="2"/>
    <path d="M0 187 184 89l184 98-184 99z" fill="#11202c" stroke="#7ee0a5" stroke-opacity=".72" stroke-width="2"/>
    <path d="M0 256 184 158l184 98-184 99z" fill="#0c1721" stroke="#eaeef3" stroke-opacity=".20" stroke-width="2"/>
    <path d="M76 196c43-21 66-6 94-22 29-16 53-59 101-61 38-2 63 23 82 34l-169 90z" fill="#5ba3e0" fill-opacity=".42"/>
    <circle cx="184" cy="187" r="13" fill="#7ee0a5"/>
    <circle cx="184" cy="187" r="27" fill="none" stroke="#7ee0a5" stroke-opacity=".35" stroke-width="2"/>
    <path d="m184 187 0 69" stroke="#7ee0a5" stroke-width="2" stroke-dasharray="5 7"/>
  </g>`;


export function renderSvg(page) {
  const lineY = page.lines.length === 1 ? [286] : [248, 326];
  const headline = page.lines.map((line, index) =>
    `<text x="86" y="${lineY[index]}" class="headline">${esc(line)}</text>`).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(page.title)}</title>
  <desc id="desc">${esc(page.subtitle)}</desc>${commonDefs}
  <style>
    text{font-family:"Konjaku OGP",sans-serif;font-weight:700}
    .brand{font-size:28px;letter-spacing:.18em;fill:#7ee0a5}
    .headline{font-size:${page.lines.length === 1 ? 72 : 62}px;letter-spacing:.01em;fill:#eaeef3}
    .subtitle{font-size:25px;letter-spacing:.04em;fill:#8b96a3}
    .url{font-size:18px;letter-spacing:.05em;fill:#6b7683}
  </style>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <ellipse cx="930" cy="310" rx="390" ry="330" fill="url(#glow)"/>
  <rect x="54" y="54" width="1092" height="522" rx="30" fill="none" stroke="#eaeef3" stroke-opacity=".10"/>
  <text x="86" y="126" class="brand">今昔</text>
  ${headline}
  <text x="88" y="${page.lines.length === 1 ? 350 : 394}" class="subtitle">${esc(page.subtitle)}</text>
  <text x="88" y="528" class="url">konjaku.hidetzu.work</text>
  ${indexArt}
</svg>
`;
}

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("PNG ではありません");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function metadataOf(page, source, png) {
  return {
    source: page.svg,
    sourceSha256: sha256(source),
    output: page.png,
    outputSha256: sha256(png),
    width: pngSize(png).width,
    height: pngSize(png).height,
    title: page.title,
    headline: page.headline,
    subtitle: page.subtitle,
  };
}

function checkHtml(page) {
  const html = readFileSync(file(page.html), "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1];
  // ⚠ **属性を許す**（2026-08-22）。⚠ `/peel` の h1 は `class="sr-only"` を持つ
  //   （⚠ 目には出さないが、⚠ OGP の名乗りと読み上げのために残してある）。
  // ⚠ **見ている主張は変えていない**（⚠ h1 の字と、⚠ OGP の見出しが一致すること）。
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1];
  const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  const twitterImage = html.match(/name="twitter:image" content="([^"]+)"/)?.[1];
  const imageAlt = html.match(/property="og:image:alt" content="([^"]+)"/)?.[1];
  const expectedAlt = `${page.headline} — ${page.subtitle}`;
  const errors = [];
  if (title !== page.title) errors.push(`title=${JSON.stringify(title)}`);
  if (ogTitle !== page.title) errors.push(`og:title=${JSON.stringify(ogTitle)}`);
  if (h1 !== page.headline) errors.push(`h1=${JSON.stringify(h1)}`);
  if (ogImage !== page.imageUrl) errors.push(`og:image=${JSON.stringify(ogImage)}`);
  if (twitterImage !== page.imageUrl) errors.push(`twitter:image=${JSON.stringify(twitterImage)}`);
  if (imageAlt !== expectedAlt) errors.push(`og:image:alt=${JSON.stringify(imageAlt)}`);
  if (errors.length) throw new Error(`${page.html}: ${errors.join(" / ")}`);
}

function check() {
  const manifest = JSON.parse(readFileSync(file(MANIFEST), "utf8"));
  const font = readFileSync(file(FONT));
  if (manifest.fontSha256 !== sha256(font)) throw new Error("OGP 用フォントが manifest と違います");
  for (const page of OGP_PAGES) {
    const expected = renderSvg(page);
    const source = readFileSync(file(page.svg), "utf8");
    const png = readFileSync(file(page.png));
    const actual = metadataOf(page, source, png);
    const recorded = manifest.pages.find((item) => item.id === page.id);
    if (source !== expected) throw new Error(`${page.svg} がテキスト定義から生成した内容と違います`);
    if (JSON.stringify(recorded) !== JSON.stringify({ id: page.id, ...actual }))
      throw new Error(`${page.id} の SVG または PNG が manifest と違います。npm run ogp を実行してください`);
    if (actual.width !== WIDTH || actual.height !== HEIGHT)
      throw new Error(`${page.png} が ${WIDTH}x${HEIGHT} ではありません`);
    checkHtml(page);
  }
  console.log(`OGP ${OGP_PAGES.length}枚は生成元・PNG・ページの title / og:title / h1 と一致`);
}

function generate() {
  const work = mkdtempSync(join(tmpdir(), "konjaku-ogp-"));
  try {
    const fontDir = dirname(file(FONT));
    const fontConfig = join(work, "fonts.conf");
    const cacheDir = join(work, "font-cache");
    mkdirSync(cacheDir);
    writeFileSync(fontConfig, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${esc(fontDir)}</dir>
  <cachedir>${esc(cacheDir)}</cachedir>
  <alias><family>Konjaku OGP</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>
</fontconfig>
`);
    const pages = [];
    for (const page of OGP_PAGES) {
      const source = renderSvg(page);
      mkdirSync(dirname(file(page.svg)), { recursive: true });
      writeFileSync(file(page.svg), source);
      const output = join(work, `${page.id}.png`);
      execFileSync("rsvg-convert", ["--width", String(WIDTH), "--height", String(HEIGHT), "--output", output, file(page.svg)], {
        env: { ...process.env, FONTCONFIG_FILE: fontConfig },
        stdio: "inherit",
      });
      const png = readFileSync(output);
      renameSync(output, file(page.png));
      pages.push({ id: page.id, ...metadataOf(page, source, png) });
    }
    const manifest = {
      generatedBy: "npm run ogp",
      rasterizer: execFileSync("rsvg-convert", ["--version"], { encoding: "utf8" }).split("\n")[0],
      font: FONT,
      fontSha256: sha256(readFileSync(file(FONT))),
      pages,
    };
    writeFileSync(file(MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    check();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv.includes("--check")) check();
else generate();
