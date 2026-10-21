# REBALL LOSTBALL · Full-site release closure · 2026-09-08

## Authority decisions

- Production CAPTCHA authority: Cloudflare Turnstile.
- `WELCOME3000`: retired. The campaign expired on 2026-06-30 and no server-side benefit policy is active. No signup discount is promised until a new DB-backed campaign is explicitly published.
- Login ID availability: server-authoritative `check-login-id` Edge Function, protected by CAPTCHA and dual IP/subject rate limiting.
- Admin authority: `/store-manager` only. Legacy `#/admin` is redirected and no longer presented as an operational entry point.
- Deployment authority: Vercel only. GitHub Pages workflow/CNAME/.nojekyll are removed.
- Deferred customer mutations: hidden instead of shipping dead controls. Read-only policy/account functions that already have server persistence remain available.

## Production credential gate

Production builds intentionally fail closed until all of the following public/server settings exist:

### Vercel public build settings

- `AUTH_CAPTCHA_PROVIDER=turnstile`
- `AUTH_CAPTCHA_SITE_KEY=<Cloudflare Turnstile site key>`

### Supabase Edge Function secrets

- `AUTH_CAPTCHA_MODE=enforced`
- `AUTH_CAPTCHA_PROVIDER=turnstile`
- `AUTH_CAPTCHA_SECRET_KEY=<Cloudflare Turnstile secret key>`
- `AUTH_CAPTCHA_EXPECTED_HOSTNAMES=reballlostball.com,www.reballlostball.com`

The site key is browser-public. The secret key must never be committed or exposed in browser markup.

## Release verification gate

Before Production promotion:

1. Full QA workflow PASS.
2. Preview smoke: root, products, cart, checkout form, store, inspection, customer center, legal pages, `/store-manager`, and real 404.
3. Turnstile completes successfully on signup/login/account-recovery forms.
4. Login ID duplicate check returns server authority and rate limits repeated probes.
5. Real test member: signup confirmation → login → profile/address read/write.
6. One controlled order: order creation → Toss payment preparation/approval path → order lookup → inventory reservation/release/commit invariants.
7. Production smoke after promotion, including `robots.txt`, `sitemap.xml`, www→apex redirect and security headers.

Do not bypass this gate with test CAPTCHA keys or mock payments in Production.
