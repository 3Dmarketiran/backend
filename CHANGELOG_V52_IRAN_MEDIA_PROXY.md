# Backend media routing — Iran reachability mode

- Catalog product asset URLs with storage keys now resolve to the existing `/api/public/assets/...` backend route, keeping Supabase provider URLs out of the visitor browser.
- Legacy package assets continue to use the existing package compatibility route.
- No schema migration or storage-object migration is required.

## Validation limits
- Backend TypeScript build was not run because dependency installation was unavailable in this environment.
- This proxy transfers media through Render and may increase outbound bandwidth charges. Current storage adapter reads complete objects into memory; HTTP byte-range streaming is not implemented in this change.
- No live Iran ISP test was possible, so VPN-free reachability must be confirmed from the target networks after deploy.
