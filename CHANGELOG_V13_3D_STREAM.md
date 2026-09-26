# Backend V13 — 3D/AR streaming fix

- Public GLB/GLTF/USDZ assets are streamed from storage instead of buffering the complete file in memory before responding.
- Added `readStream()` to the storage abstraction and both local/S3 providers.
- Public asset proxy now sends `Content-Length`, `Accept-Ranges`, CORS and cross-origin resource headers while streaming.
- This specifically addresses large 3D files getting stuck indefinitely in the browser after the custom-domain migration.
