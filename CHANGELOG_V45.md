# V45 — visitor country signal

- Added `GET /api/public/visitor-country`.
- Prefers a trusted Cloudflare country header when the request is actually proxied by Cloudflare.
- Otherwise performs a short server-side country lookup from the visitor IP using ipapi.co.
- Country/IP lookup is not persisted; a short in-memory cache reduces repeated lookups.
- Endpoint returns only a two-letter country code to the public frontend.
