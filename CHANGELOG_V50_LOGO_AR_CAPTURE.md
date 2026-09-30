# V50 — Logo + fixed-scale AR + Object Capture bridge

- Added `Seller.logoStorageKey` and a Prisma migration.
- Seller logo uploads now persist the canonical storage key.
- Public catalog logo URLs are served through `/api/public/assets/...` so the frontend no longer depends on provider-specific logo URLs.
- Legacy logo URLs are still supported through the public seller-logo proxy.
- Publishing a product that contains 3D/AR models now requires complete positive width/height/depth.
- Public AR continues to expose dimensions in meters and the frontend uses fixed AR scale.
