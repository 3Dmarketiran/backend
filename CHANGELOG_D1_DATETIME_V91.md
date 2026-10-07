# V91 — D1 DateTime repair hardening

- Fixed the previous DateTime repair predicate that incorrectly inspected character 20 of ISO timestamps.
- Repair is now idempotent and handles: bare timestamps, a single `Z`, repeated `Z` suffixes, and numeric timezone offsets with accidental trailing `Z`s.
- Added D1 migration `0003_repair_datetime_suffixes.sql`.
- Added `verify:d1-datetime` regression test.

The production error `2026-10-14T17:10:25.092+00:00ZZZ` is repaired to `2026-10-14T17:10:25.092+00:00` before Prisma reads the Session row.
