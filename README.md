# Reball Lostball

REBALL LOSTBALL static shopping mall implementation based on the Figma 04-08 flows.

## Current local implementation

The verified local implementation is in `C:\Users\artis\Documents\리볼로스트볼`.

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

## Pending upload step

A local commit exists with the complete implementation:

```text
cfb37e3 Build Reball Lostball static shop
```

Local `git push` is blocked until GitHub authentication is available on this PC. Install/authenticate GitHub CLI or provide a GitHub token with repository contents write access, then run:

```bash
git push -u origin main
```

The old `meodai-skill-color-expert-https-github` folder is intentionally ignored and should not be used as the implementation source.
