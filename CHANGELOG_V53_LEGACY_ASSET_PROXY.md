# Backend V53 — legacy public asset URL proxying

- Legacy product image/model URLs in Supabase public-object URL form are converted to the existing `/api/public/assets/...` route when the URL bucket matches `STORAGE_BUCKET`.
- Legacy seller logo URLs receive the same conversion.
- Existing assets with explicit storage keys and packaged assets keep their current route behavior.
- No schema migration, new service, or additional dependency.
- Existing immutable browser caching is retained to reduce repeated transfer.

## Verification
- Source-level route/path review only. Full TypeScript build and live Supabase/Render tests were not run in this environment.
