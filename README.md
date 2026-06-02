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

The repository currently contains a lightweight single-file `index.html` so there is a deployable public artifact on `main`.

The complete full local source commit is prepared locally and can be fast-forward pushed after GitHub authentication is available on this PC:

```text
b70334d Build Reball Lostball static shop
```

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
