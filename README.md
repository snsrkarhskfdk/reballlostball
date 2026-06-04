# Reball Lostball

REBALL LOSTBALL shopping mall implementation based on the Figma 04-08 flows.

## Current local implementation

The verified full local implementation is in `C:\Users\artis\Documents\리볼로스트볼`.

Implemented routes:

- `#/` home with 3 rotating banners
- `#/product/titleist-pro-v1-v1x-lostball` product detail
- `#/cart` cart
- `#/checkout` checkout
- `#/order/:id` order complete
- `#/mypage` my page
- `#/store` store intro
- `#/admin` separate admin page
- `#/inspection`, `#/brand-story`, `#/customer-center`

Verified locally:

- `npm run lint`
- `npm run build`
- Browser QA: 3 banners, product menu opens directly under `상품소개`, no horizontal overflow, no text overflow, no broken visible images, no console errors.

## GitHub remote status

The remote `main` currently contains a lightweight single-file `index.html`, `CNAME`, `.nojekyll`, and a GitHub Pages Actions workflow.

The first Pages workflow run failed at `actions/configure-pages` because the repository Pages site is not enabled/configured to build from GitHub Actions. GitHub's `configure-pages` action can enable Pages only when it receives a token other than the default `GITHUB_TOKEN`, with the required Pages/admin permissions.

The complete full local source commit is prepared locally on `main` and can be fast-forward pushed after GitHub authentication is available on this PC.

Run after authenticating GitHub locally:

```bash
git push -u origin main
```

## Supabase

Project: `qbftalhhyfcndanrcwpy`

Applied migrations:

- `init_schema`
- `admin_and_customer_policies`
- `indexes_and_policy_cleanup`

Verified data counts:

- Brands: 6
- Active products: 6
- Variants: 18
- Active banners: 3

A public Edge Function named `site` is deployed, but responses from the current Supabase connector deployment path are forced to `Content-Type: text/plain` with a sandbox CSP. That means it cannot serve executable HTML as the production static host in its current form. Use a static host such as GitHub Pages, Vercel, Netlify, or hosting.kr web hosting for the frontend, with Supabase as the backend.

The old `meodai-skill-color-expert-https-github` folder is intentionally ignored and should not be used as the implementation source.

## Deployment target

Deploy the root static SPA only:

- `index.html`
- `app.js`
- `styles.css`
- `assets/figma/**`
- `public/fonts/**`

Do not deploy `meodai-skill-color-expert-https-github`; it is an old implementation.

## Admin status

`#/admin` is a temporary client-side admin prototype for launch review. It is not production-grade access control.

- Initial admin id: `admin`
- The first non-empty admin password entered in a browser is stored only in that browser's `localStorage`.
- Replace this with server-side authentication before treating the admin route as secure.

## Payments status

Toss Payments is not connected until real keys are available.

- Toss mall id: `reballzgfl`
- `TOSS_CLIENT_KEY` may be exposed to the browser only when issued.
- `TOSS_SECRET_KEY` must be stored only in Vercel Environment Variables or another server-side secret store.
- Never hardcode Toss secret keys, security keys, GitHub tokens, Supabase service-role keys, or hosting credentials in this repository.

Current checkout remains a local/static order completion flow. Connect order persistence and Toss approval/webhook endpoints after production hosting is live.
