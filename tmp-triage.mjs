// 節ごとに読み込んで、✗ の数を数える。落ちた理由の代表も出す。
import { readdirSync } from "node:fs";
const parts = readdirSync("test/check").filter(f => f.endsWith(".mjs") && f !== "lib.mjs");
const { execFileSync } = await import("node:child_process");
for (const p of parts) {
  const code = `
import { makeReport } from "./test/check/lib.mjs";
let bad = 0, ok = 0; const why = [];
`;
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", `
      const orig = console.log; let bad = 0, ok = 0; const why = [];
      console.log = (...a) => { const s = a.join(" ");
        if (s.includes("\\u2717")) { bad++; if (why.length < 2) why.push(s.replace(/\\x1b\\[[0-9;]*m/g,"").trim().slice(0,90)); }
        else if (s.includes("\\u2713")) ok++; };
      await import("./test/check/${p}");
      console.log = orig;
      console.log(JSON.stringify({ p: "${p}", ok, bad, why }));
    `], { encoding: "utf8", stdio: ["ignore","pipe","pipe"], timeout: 120000 });
    const line = out.trim().split("\n").pop();
    const r = JSON.parse(line);
    console.log(`${r.bad === 0 ? "✓" : "✗"} ${r.p.padEnd(20)} ok=${String(r.ok).padStart(3)} ng=${String(r.bad).padStart(3)}  ${r.why.join(" | ")}`);
  } catch (e) {
    console.log(`⚠ ${p.padEnd(20)} 実行できない: ${String(e.stderr ?? e).replace(/\n/g," ").slice(0,90)}`);
  }
}
