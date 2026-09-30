# V46 — product image delivery cache

- Added in-flight deduplication for product package reads so simultaneous image requests do not each download and unzip the same package.
- Added a bounded in-memory cache for extracted product-image groups (up to 64MB) to make subsequent product photos much faster.
- Existing individual asset cache remains in place and package caches are cleared whenever a package is replaced/removed.
