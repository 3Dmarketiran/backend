# Backend V47 — Subscription Plan Categories

- Added `SubscriptionPlanCategory` for grouping seller subscription plans.
- Added category assignment and display order to `SubscriptionPlan`.
- Added admin CRUD endpoints for subscription categories.
- `/api/subscriptions/plans` now returns active categories alongside plans.
- Added `/api/subscriptions/categories/manage` for admin management.
- Public live catalog now exposes `planCategories`, `categoryId`, and `sortOrder`.
- Publish snapshots now include subscription plan category metadata.
- Existing plans are migrated into the default `پلن‌های عمومی` category.
