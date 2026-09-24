#!/usr/bin/env bash
# Assembles the standalone payment page from the sources in this folder:
#   payments/index.html   payment.html with payment.css inlined and the config baked in
#   payments/payment.js   copied as-is (served from 'self', so the CSP needs no hash)
# Re-run after editing payment.html, payment.css or payment.js.
#
# Build-time config, one value per environment:
#   CASHFREE_MODE     production | sandbox -- must match the backend's Cashfree
#                     environment, or checkout will not open. Default: production.
#   PAYMENT_API_BASE  origin of the CommuneWorld API. Default: https://api.communeworld.com
#
#   CASHFREE_MODE=sandbox bash tools/payment-page/build-page.sh
set -euo pipefail

SP="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SP/../.." && pwd)"

export CASHFREE_MODE="${CASHFREE_MODE:-production}"
export PAYMENT_API_BASE="${PAYMENT_API_BASE:-https://api.communeworld.com}"

node -e '
  const fs = require("fs"), path = require("path");
  const [sp, out] = process.argv.slice(1);
  const mode = process.env.CASHFREE_MODE;
  const apiBase = process.env.PAYMENT_API_BASE;

  const die = (msg) => { console.error("build-page: " + msg); process.exit(1); };

  if (mode !== "production" && mode !== "sandbox") die("CASHFREE_MODE must be production or sandbox, got " + JSON.stringify(mode));

  let api;
  try { api = new URL(apiBase); } catch (e) { die("PAYMENT_API_BASE is not a URL: " + apiBase); }
  const local = /^(localhost|127\.0\.0\.1)$/.test(api.hostname);
  if (api.protocol !== "https:" && !(local && api.protocol === "http:")) die("PAYMENT_API_BASE must be https: " + apiBase);
  if (api.origin !== apiBase.replace(/\/+$/, "")) die("PAYMENT_API_BASE must be an origin with no path: " + apiBase);

  // The page is useless if the CSP blocks its one request, and CSP failures are
  // silent in a webview -- so refuse to build against an API the CSP does not allow.
  const config = JSON.parse(fs.readFileSync(path.join(out, "vercel.json"), "utf8"));
  const block = (config.headers || []).find((h) => h.source.startsWith("/payments"));
  if (!block) die("vercel.json has no header block for /payments");
  const csp = (block.headers.find((h) => h.key === "Content-Security-Policy") || {}).value || "";
  const connect = (csp.match(/connect-src([^;]*)/) || [])[1] || "";
  if (!local && !connect.split(/\s+/).includes(api.origin)) die("the /payments CSP connect-src does not allow " + api.origin);

  const read = (f) => fs.readFileSync(path.join(sp, f), "utf8");
  const values = { CSS: read("payment.css").replace(/\s+$/, ""), API_BASE: api.origin, CASHFREE_MODE: mode };
  const html = read("payment.html").replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in values)) die("unknown placeholder " + m);
    return values[key];
  });

  const dir = path.join(out, "payments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  fs.copyFileSync(path.join(sp, "payment.js"), path.join(dir, "payment.js"));
  console.log("built " + path.join(dir, "index.html") + " (" + Buffer.byteLength(html) + " bytes)");
  console.log("built " + path.join(dir, "payment.js"));
  console.log("Cashfree mode: " + mode + "   API: " + api.origin);
' "$SP" "$OUT"
