#!/usr/bin/env bash
# Assembles the two standalone policy pages from the shared CSS/JS and the
# per-page policy text. Re-run after editing policy.css, policy.js or a body file.
set -euo pipefail

SP="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SP/../.." && pwd)"

ENTITY_NAME="Kamna Creations Private Limited"
ENTITY_ADDR="E4/459, Sector O, Sarojini Nagar, Mansarovar Yojna, Lucknow, Uttar Pradesh 226002, India"
ENTITY_MAIL="communeworld01@gmail.com"
ENTITY_TEL_TEXT="+91 63775 63773"
ENTITY_TEL_HREF="+916377563773"

build () {
  SLUG="$1"; TITLE="$2"; DESC="$3"; UPDATED="$4"; BODY="$5"
  DIR="$OUT/$SLUG"
  mkdir -p "$DIR"

  {
    printf '%s\n' '<!DOCTYPE html>'
    printf '%s\n' '<!-- Standalone CommuneWorld policy page. Renders the live text from the'
    printf '%s\n' '     content API, and ships a complete copy of the policy inline so the page'
    printf '%s\n' '     is never blank if that request fails. -->'
    printf '%s\n' '<html lang="en">'
    printf '%s\n' '<head>'
    printf '%s\n' '<meta charset="utf-8"/>'
    printf '%s\n' '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    printf '<title>%s — CommuneWorld</title>\n' "$TITLE"
    printf '<meta name="description" content="%s"/>\n' "$DESC"
    printf '<link rel="canonical" href="https://www.communeworld.com/%s"/>\n' "$SLUG"
    printf '<meta property="og:title" content="%s — CommuneWorld"/>\n' "$TITLE"
    printf '<meta property="og:description" content="%s"/>\n' "$DESC"
    printf '<meta property="og:url" content="https://www.communeworld.com/%s"/>\n' "$SLUG"
    printf '%s\n' '<meta property="og:site_name" content="CommuneWorld"/>'
    printf '%s\n' '<meta property="og:type" content="website"/>'
    printf '%s\n' '<meta property="og:locale" content="en_IN"/>'
    printf '%s\n' '<meta name="twitter:card" content="summary_large_image"/>'
    printf '%s\n' '<link rel="shortcut icon" href="https://www.communeworld.com/brand/communeworld-logo.jpg"/>'
    printf '%s\n' '<link rel="icon" href="https://www.communeworld.com/brand/communeworld-logo.jpg"/>'
    printf '%s\n' '<script type="application/ld+json">'
    printf '%s\n' '{'
    printf '%s\n' '  "@context": "https://schema.org",'
    printf '%s\n' '  "@type": "Organization",'
    printf '%s\n' '  "name": "CommuneWorld",'
    printf '  "legalName": "%s",\n' "$ENTITY_NAME"
    printf '%s\n' '  "url": "https://www.communeworld.com",'
    printf '%s\n' '  "email": "'"$ENTITY_MAIL"'",'
    printf '%s\n' '  "telephone": "'"$ENTITY_TEL_HREF"'",'
    printf '%s\n' '  "address": {'
    printf '%s\n' '    "@type": "PostalAddress",'
    printf '%s\n' '    "streetAddress": "E4/459, Sector O, Sarojini Nagar, Mansarovar Yojna",'
    printf '%s\n' '    "addressLocality": "Lucknow",'
    printf '%s\n' '    "addressRegion": "Uttar Pradesh",'
    printf '%s\n' '    "postalCode": "226002",'
    printf '%s\n' '    "addressCountry": "IN"'
    printf '%s\n' '  }'
    printf '%s\n' '}'
    printf '%s\n' '</script>'
    printf '%s\n' '<style>'
    cat "$SP/policy.css"
    printf '%s\n' '</style>'
    printf '%s\n' '</head>'
    printf '<body data-slug="%s">\n' "$SLUG"

    printf '%s\n' '<div class="announcement"><span class="announcement-dot"></span>India-first. Trust-first. Built for meaningful connection.</div>'
    printf '%s\n' '<header class="site-header">'
    printf '%s\n' '  <a class="brand-link" href="/" aria-label="CommuneWorld home"><strong>CommuneWorld</strong><span>CONNECT • GROW • EARN</span></a>'
    printf '%s\n' '  <nav class="nav-links" aria-label="Primary navigation">'
    printf '%s\n' '    <a href="/">Home</a>'
    if [ "$SLUG" = "privacy-policy" ]; then
      printf '%s\n' '    <a href="/privacy-policy" aria-current="page">Privacy policy</a>'
      printf '%s\n' '    <a href="/child-safety-policy">Child safety</a>'
    else
      printf '%s\n' '    <a href="/privacy-policy">Privacy policy</a>'
      printf '%s\n' '    <a href="/child-safety-policy" aria-current="page">Child safety</a>'
    fi
    printf '%s\n' '  </nav>'
    printf '%s\n' '</header>'

    printf '%s\n' '<main class="policy">'
    printf '%s\n' '  <div class="policy-head">'
    printf '%s\n' '    <p class="kicker">LEGAL</p>'
    printf '    <h1>%s</h1>\n' "$TITLE"
    printf '    <p class="policy-meta">Last updated <time id="policy-updated" datetime="%s">%s</time></p>\n' "$UPDATED" "$(date -u -d "$UPDATED" "+%-d %B %Y" 2>/dev/null || echo "1 September 2026")"
    printf '%s\n' '    <div class="policy-entity">'
    printf '%s\n' '      <span class="entity-label">Operated by</span>'
    printf '      <strong>%s</strong>\n' "$ENTITY_NAME"
    printf '      <address>%s</address>\n' "$ENTITY_ADDR"
    printf '%s\n' '      <div class="entity-contact">'
    printf '        <a href="mailto:%s">%s</a>\n' "$ENTITY_MAIL" "$ENTITY_MAIL"
    printf '        <a href="tel:%s">%s</a>\n' "$ENTITY_TEL_HREF" "$ENTITY_TEL_TEXT"
    printf '%s\n' '      </div>'
    printf '%s\n' '    </div>'
    printf '%s\n' '    <div class="policy-nav">'
    printf '%s\n' '      <a href="/">Back to CommuneWorld</a>'
    if [ "$SLUG" = "privacy-policy" ]; then
      printf '%s\n' '      <a href="/child-safety-policy">Child Safety Policy</a>'
    else
      printf '%s\n' '      <a href="/privacy-policy">Privacy Policy</a>'
    fi
    printf '%s\n' '    </div>'
    printf '%s\n' '  </div>'
    printf '%s\n' '  <article class="policy-content" id="policy-content">'
    cat "$SP/$BODY"
    printf '%s\n' '  </article>'
    printf '%s\n' '</main>'

    printf '%s\n' '<section class="legal-strip" id="legal" aria-label="Registered business details">'
    printf '%s\n' '  <p class="kicker">Registered business</p>'
    printf '%s\n' '  <div class="legal-grid">'
    printf '%s\n' '    <div class="legal-item">'
    printf '%s\n' '      <span class="legal-label">Legal entity</span>'
    printf '      <strong>%s</strong>\n' "$ENTITY_NAME"
    printf '%s\n' '    </div>'
    printf '%s\n' '    <div class="legal-item">'
    printf '%s\n' '      <span class="legal-label">Registered address</span>'
    printf '      <address>%s</address>\n' "$ENTITY_ADDR"
    printf '%s\n' '    </div>'
    printf '%s\n' '    <div class="legal-item">'
    printf '%s\n' '      <span class="legal-label">Contact</span>'
    printf '      <a href="mailto:%s">%s</a>\n' "$ENTITY_MAIL" "$ENTITY_MAIL"
    printf '      <a href="tel:%s">%s</a>\n' "$ENTITY_TEL_HREF" "$ENTITY_TEL_TEXT"
    printf '%s\n' '    </div>'
    printf '%s\n' '  </div>'
    printf '%s\n' '</section>'

    printf '%s\n' '<footer>'
    printf '%s\n' '  <div class="footer-brand"><strong>CommuneWorld</strong><span>CONNECT • GROW • EARN</span></div>'
    printf '  <p>© 2026 %s. All rights reserved.</p>\n' "$ENTITY_NAME"
    printf '%s\n' '  <div class="footer-links">'
    printf '%s\n' '    <a href="/">Home</a>'
    printf '%s\n' '    <a href="/privacy-policy">Privacy policy</a>'
    printf '%s\n' '    <a href="/child-safety-policy">Child safety</a>'
    printf '    <a href="mailto:%s">Grievance</a>\n' "$ENTITY_MAIL"
    printf '%s\n' '  </div>'
    printf '%s\n' '</footer>'

    printf '%s\n' '<script>'
    cat "$SP/policy.js"
    printf '%s\n' '</script>'
    printf '%s\n' '</body>'
    printf '%s\n' '</html>'
  } > "$DIR/index.html"

  echo "built $DIR/index.html ($(wc -c < "$DIR/index.html") bytes)"
}

build "privacy-policy" "Privacy Policy" \
  "How CommuneWorld, operated by Kamna Creations Private Limited, collects, uses, shares and protects your personal data under the DPDP Act 2023." \
  "2026-09-01T12:46:45.138Z" "privacy-body.html"

build "child-safety-policy" "Child Safety Policy" \
  "CommuneWorld's child sexual abuse and exploitation (CSAE) standards, age assurance, reporting routes and published child safety point of contact." \
  "2026-09-01T12:44:32.333Z" "child-safety-body.html"

# Keep the Content-Security-Policy script hash in vercel.json in step with the
# inline script just built. Both pages inline the same policy.js, so one hash
# covers both. A stale hash does not break the pages -- CSP would block the
# script and each page would fall back to its built-in copy -- but live content
# updates would stop silently, so it is synced here rather than by hand.
sync_csp_hash () {
  page="$OUT/privacy-policy/index.html"
  config="$OUT/vercel.json"
  if [ ! -f "$config" ]; then
    echo "vercel.json not found - skipping CSP hash sync"
    return 0
  fi
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    const [page, config] = process.argv.slice(1);
    const html = fs.readFileSync(page, "utf8");
    // ld+json data blocks carry a type= attribute and are exempt from script-src.
    const found = [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)];
    if (found.length !== 1) {
      console.error("expected exactly 1 executable inline script, found " + found.length);
      process.exit(1);
    }
    const hash = "sha256-" + crypto.createHash("sha256").update(found[1 - 1][1], "utf8").digest("base64");
    const before = fs.readFileSync(config, "utf8");
    const after = before.replace(/sha256-[A-Za-z0-9+\/=]+/, hash);
    if (after === before && !before.includes(hash)) {
      console.error("no sha256- token found in vercel.json CSP");
      process.exit(1);
    }
    fs.writeFileSync(config, after, "utf8");
    console.log(after === before
      ? "vercel.json CSP hash already current (" + hash + ")"
      : "vercel.json CSP hash updated -> " + hash);
  ' "$page" "$config"
}

sync_csp_hash
