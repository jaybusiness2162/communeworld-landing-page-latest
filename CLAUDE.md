# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

The CommuneWorld marketing website, deployed at `https://www.communeworld.com`. There is no package
manager, no bundler, no runtime dependencies, and no git repo — every page is a standalone HTML file
deployed as-is.

CommuneWorld is an India-first "verified connection network" operated by **Kamna Creations Private Limited**
(E4/459, Sector O, Sarojini Nagar, Mansarovar Yojna, Lucknow, Uttar Pradesh 226002, India —
communeworld01@gmail.com, +91 63775 63773).

```
index.html                       home page, serves /, minified, ~1.6 MB
privacy-policy/index.html        serves /privacy-policy
child-safety-policy/index.html   serves /child-safety-policy
vercel.json                      routing, redirects and security headers
.vercelignore                    keeps tools/ and CLAUDE.md out of the deployment
tools/policy-page/               sources the two policy pages are built from
```

Routing is entirely filesystem-based — there is no router, no rewrite rules and no server-side config.
Every route is a directory containing an `index.html`, and the host resolves it. That is the default on
Netlify, Vercel, S3+CloudFront, nginx and Apache, but confirm it before deploying anywhere new. A new
route means a new `<slug>/index.html`, never a query string or a hash.

Links between pages are **root-absolute** (`/`, `/privacy-policy`, `/child-safety-policy`), so they resolve
the same from any depth. Keep them that way — relative links would break the moment a page moves.

The home page was previously named `CommuneWorld_Complete_Website-1.html`; it is now `index.html` so it is
served at the site root.

---

## The home page — `index.html`

**Minified onto 5 physical lines** with no whitespace between tags. Line-oriented tools are mostly useless
on it; the working unit is a unique substring, not a line.

| Line | Contents |
|------|----------|
| 1 | `<!DOCTYPE html>` |
| 2 | `<html>`, `<head>`, charset/viewport meta, opening `<style>`, start of Tailwind CSS |
| 3 | Rest of the CSS — Tailwind v4.2.1 `@layer theme/base/utilities` (first ~4 KB), then **all hand-written site CSS** starting at the `:root{--ink:...}` token block |
| 4 | `</style>`, `<title>`, SEO/Open Graph/Twitter meta, favicon links |
| 5 | The **entire `<body>`** (~1.62 MB) — dominated by 9 base64-inlined JPEGs |

### Reading it

Never `cat` line 5 raw. Strip the base64 blobs first:

```bash
awk 'NR==5' index.html \
  | sed 's|data:image/[a-z+]*;base64,[A-Za-z0-9+/=]*|[IMG]|g' | head -c 6000
```

Use `awk 'NR==3'` with `grep -o -b` to find an offset, then `cut -c <start>-<end>` to read CSS slices.

### Editing it

Edit by **exact unique substring** — a class selector, a heading string, a `--token:value` pair. The
reliable method is a short Node script that asserts each anchor matches exactly once before replacing, so
a stale anchor fails loudly instead of silently doing nothing (count occurrences with `split(from).length - 1`
and bail unless it equals 1). Note that the Bash tool's heredocs are unreliable for payloads containing
backticks or long single lines — write such files with the Write tool instead.

**Do not reformat, prettify, or re-minify the file.** A whole-file rewrite would churn the base64 payloads
into an unreviewable diff. Keep the minified style — no added newlines or spaces between tags or
declarations. After any edit, confirm the file still has 5 lines and that the 9 `data:image/jpeg` payloads
are byte-identical to before.

### Architecture

**Styling is semantic CSS, not Tailwind utilities.** Tailwind's preflight and theme layers ship in the file,
but `antialiased` is the only utility class used in the markup. Everything visual is driven by hand-written
component classes (`.hero-visual`, `.verification-card`, `.feature-card`, `.legal-strip`, …). Add a semantic
class to the custom CSS on line 3 — Tailwind utilities are not generated for this file and will do nothing.

**Design tokens** live in a single `:root` block at the start of the custom CSS: `--ink`, `--ink-soft`,
`--blue`, `--blue-deep`, `--teal`, `--teal-deep`, `--mint`, `--sky`, `--paper`, `--cloud`, `--line`,
`--radius-lg`, `--radius-md`, `--shadow-soft`. Colour and radius changes belong here, not in component rules.

**The home page has zero JavaScript and should stay that way.** All interactivity is native: `<details>`
for the FAQ, `href="#id"` anchors with `html{scroll-behavior:smooth}`, and CSS transitions for the orbits,
glows and phone mockups. Adding a `<script>` here would be the first one in the file — ask first.

**Responsive strategy** is desktop-first, with `max-width` breakpoints at the end of the custom CSS in this
order: `1180px`, `960px`, `700px`, `430px`, then a `prefers-reduced-motion:reduce` block that must stay
last. Put new responsive rules inside the existing blocks rather than adding media queries.

**New component CSS** goes immediately before `@media (width<=1180px){`, keeping all component rules ahead
of all media queries.

### Page structure (order of sections on line 5)

announcement bar → `.site-header` nav → `.hero#top` → `.intent-strip` → `#why` → pillars (Connect/Grow/Earn)
→ `#features` → `#experience` → `#verification` → `#trust` → `#about` → FAQ → closing CTA →
`.legal-strip#legal` → `footer`.

The anchors (`#top`, `#why`, `#features`, `#verification`, `#about`, `#experience`, `#trust`, `#legal`) are
the only in-page routing — renaming a section `id` breaks the header nav, the footer links, or the
legal-name URL shared with reviewers.

---

## The policy pages

`/privacy-policy` and `/child-safety-policy` exist for app-store and payment-gateway review, so their
defining requirement is that **they must never render blank**.

Each page ships a complete copy of the policy inline and *then* fetches the live text from
`https://api.communeworld.com/api/content-pages/<slug>` (GET, responds with `Access-Control-Allow-Origin: *`),
replacing the built-in copy only when the response is valid. If the request fails, times out, or returns
something empty, the visitor still sees the full policy. Preserve that ordering in any change — never make
the rendered content depend on the request succeeding.

Beyond fetching, the inline script (`tools/policy-page/policy.js`) does four things:

- **Sanitizes** API HTML against a tag/attribute allowlist before inserting it. The content is
  administrator-authored, but it is still remote input rendered with `innerHTML`-equivalent semantics.
- **Resolves editorial placeholders.** The stored copy still contains `[DPO EMAIL]`, `[GRIEVANCE EMAIL]`
  and `[CSAE EMAIL]`; publishing those verbatim to a reviewer would defeat the page. They are rewritten to
  the published contact address at render time. **Delete this step once the CMS content is fixed.**
- **Drops the duplicated lede** — the API content repeats the policy title as an `<h2>` and carries its own
  "Last updated" line, both of which the page header already shows.
- **Linkifies** bare email addresses and the phone number, and wraps tables in a scroll container.

### Rebuilding them

Both pages are generated — edit the sources in `tools/policy-page/`, never the built `index.html`:

```bash
bash tools/policy-page/build-pages.sh      # rewrites both index.html files
```

`policy.css` and `policy.js` are shared and inlined into both pages; `privacy-body.html` and
`child-safety-body.html` are the built-in fallback copies. The builder also emits the `Organization`
JSON-LD carrying `legalName`, the legal-entity block, and the footer. The build is deterministic — the same
sources produce byte-identical output.

When the CMS text changes materially, refresh the fallback copies from `.data.content` so they do not drift
from the live text. They deliberately differ from the API in two ways: placeholders are already resolved,
and cross-links between the two policies are real `<a>` tags (the API text has them as plain words).

## Deployment (Vercel)

Static hosting, no build step. `vercel.json` sets `framework: null` and serves the repo root, so Vercel's
zero-config static detection does the work; `.vercelignore` keeps `tools/` and `CLAUDE.md` out of the
deployment.

```bash
vercel            # preview deployment
vercel --prod     # production
```

`cleanUrls: true` and `trailingSlash: false` together mean `/privacy-policy/` and `/privacy-policy.html`
both 308 to `/privacy-policy`, which is the form the canonical tags use. Keep those two settings and the
canonical tags agreeing — if `trailingSlash` is ever flipped, the canonicals must flip with it.

Redirects cover the pre-rename home page URL and short aliases (`/privacy`, `/child-safety`, `/csae`) that
are convenient to hand to a reviewer.

**The CSP is hash-pinned.** `script-src` carries a `sha256-` hash of the inline script rather than
`'unsafe-inline'`. Both policy pages inline the same `policy.js`, so one hash covers both, and
`build-pages.sh` recomputes it and rewrites `vercel.json` on every build — never edit that hash by hand.
A stale hash does not break the pages: the browser blocks the script and each page falls back to its
built-in copy of the policy, so live content updates stop *silently*. That is why the sync is automated.

The rest of the CSP is tight because the site needs very little: `img-src` allows `data:` (the 9 inlined
JPEGs) and `https://www.communeworld.com` (favicon and og:image, which stay absolute so they also resolve
on preview domains); `connect-src` allows the content API; `style-src` needs `'unsafe-inline'` because
every page inlines its stylesheet. There are no forms, iframes, objects or inline `style=` attributes, so
`form-action`, `frame-ancestors` and `object-src` are all `'none'`. Adding any external asset — a font, an
analytics script, an image host — means widening the CSP in the same commit, or it will be blocked in
production with no visible error.

`Cache-Control: public, max-age=0, must-revalidate` is deliberate. These are compliance pages; a corrected
legal name or policy must not sit in a CDN cache. Revalidation still 304s, so the 1.6 MB home page is not
re-sent.

## Running and verifying

There is no build, test, or lint step for the home page. Serve the directory and check the routes:

```bash
python -m http.server 8777 --bind 127.0.0.1
# http://127.0.0.1:8777/  /privacy-policy/  /child-safety-policy/
```

The policy pages have a jsdom harness that exercises the render pipeline against the live API response, a
failed request, and hostile markup. It is not checked in — recreate it when touching `policy.js`, and cover
at minimum: live render, fallback render, no visible `[PLACEHOLDER]`, no duplicated title, and that an
injected `<script>` / `onerror` / `javascript:` href cannot execute.

Verify visual changes at each breakpoint (1180 / 960 / 700 / 430 px). On the home page the hero phone
mockups, the horizontally scrolling `.screen-gallery` and `.intent-list`, and the footer all restructure
substantially at ≤700px.

Note: `og:image` and the favicon reference absolute `https://www.communeworld.com/...` URLs and will not
resolve locally. Expected, not a bug.

## Content constraints

Verification copy is deliberately hedged for compliance and should not be strengthened casually. The site
claims layered checks (Aadhaar/PAN + DOB, face/liveness, profession/status proof, optional consent-led
income) and states that verification "does not replace personal judgment, consent or platform safety
controls." Keep badge language layer-specific rather than a blanket "verified" promise, and preserve the
"Is CommuneWorld a dating app? No." positioning — dating/marriage is one selectable intent among many.

The child safety policy is a regulatory document published against the Google Play Child Safety Standards
and Apple review guidelines. Its commitments (suspend-first on credible reports, reporting to authorities
without a legal request, an unauthenticated public reporting route, the named point of contact) are
compliance obligations — do not soften, condense, or "improve" them unless the user asks.

Fixed entities: **Kamna Creations Private Limited** (registered legal name — must remain visible on the
site), Kamana Kumari (Grievance Officer and child safety contact), communeworld01@gmail.com,
+91 63775 63773, tagline "Real People. Verified Connections. Global Opportunities.", pillars
"CONNECT • GROW • EARN".
