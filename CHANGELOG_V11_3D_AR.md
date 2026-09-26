# V11 — 3D/AR asset delivery fix

- Added `/api/public/assets/*` public asset proxy for published product models and active seller logos.
- GLB, GLTF, USDZ, BIN and common image MIME types are returned explicitly.
- Asset URLs in the live catalog are generated from `storageKey`, not persisted provider URLs.
- GLTF relative `.bin`/texture paths remain resolvable because the proxy mirrors the storage-key directory.
- Added custom-domain CORS support for `https://3dmarketiran.ir` and `https://www.3dmarketiran.ir`.
- Static legacy Supabase Storage model/logo URLs are normalized by the public site to the backend asset proxy, so the first paint is compatible with the new domain.
