import { readFile } from "node:fs/promises";
import type { FinanceData } from "./dashboard-state";

// The supplied template interpolates data into HTML tables. Escape text before
// injecting it; do not let names or CSV fields become HTML or event handlers.
function escapeText(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  if (Array.isArray(value)) return value.map(escapeText);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeText(v)]));
  return value;
}

export async function renderReport(data: FinanceData): Promise<string> {
  let template = await readFile(new URL("./resources/_dash_template.html", import.meta.url), "utf8");
  const match = /^Q([1-4])-(\d{2})$/.exec(data.quarter);
  if (!match) throw new Error("Invalid report quarter");
  const [, q, y] = match;
  const priorYear = String((Number(y) + 99) % 100).padStart(2, "0");
  template = template.replace(/Q3([-‑'])(26|25)/g, (_m, separator, year) => `Q${q}${separator}${year === "26" ? y : priorYear}`)
    .replace(/Q3(?![-‑'0-9])/g, `Q${q}`);
  // Retain the report's native XML spreadsheet export, decoding our HTML
  // entities once before its own XML escaping so exported names stay faithful.
  template = template.replace("function xesc(s){return String(s)", "function xesc(s){return String(s).replace(/&quot;/g,'\"').replace(/&#39;/g,\"'\").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')");
  const json = JSON.stringify(escapeText(data)).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  if (data.referencesAvailable === false) {
    template = template.replace(/<body([^>]*)>/, `<body$1><div role="status" style="padding:14px 24px;background:#fff4d6;color:#654600;border-bottom:1px solid #e7ca7a;font:14px system-ui">Latest snapshot: ${escapeText(data.cw)} · ${data.quarter}. Target and prior-year reference values were not supplied for this quarter and are shown as N/A. Sales and pipeline figures use the latest extracts.</div>`);
  }
  return template.replace("__WOWDATA__", `<script>const WOW_DATA=${json};</script>`);
}
