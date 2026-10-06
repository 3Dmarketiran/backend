# Supabase Storage -> Cloudflare R2

The application already uses an S3-compatible storage abstraction. Cloudflare R2 exposes an S3-compatible API, so the existing `S3StorageProvider` can be used without changing upload/delete/read route code.

## 1. Create the R2 bucket

```bash
npx wrangler login
npx wrangler r2 bucket create 3dmarketiran-assets
```

Cloudflare documents `wrangler r2 bucket create` and R2 bucket bindings in the R2 Workers API documentation.

## 2. Create R2 S3 credentials

Create an R2 API token with **Object Read & Write** permission, preferably scoped to the target bucket only.

R2 S3 endpoint:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Do not commit the Access Key ID or Secret Access Key.

## 3. Configure application storage

For the existing Node/Express backend:

```env
STORAGE_PROVIDER=s3
STORAGE_BUCKET=3dmarketiran-assets
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_ACCESS_KEY=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_KEY=<R2_SECRET_ACCESS_KEY>
PUBLIC_ASSET_BASE_URL=https://assets.example.com
```

`PUBLIC_ASSET_BASE_URL` should be the public/custom-domain URL that serves the R2 bucket. Do not expose the S3 API endpoint to browsers as the normal asset URL.

## 4. Copy existing Supabase objects

Set the source Supabase S3 endpoint and credentials and the R2 destination credentials in `.env`:

```env
SOURCE_S3_ENDPOINT=https://<SUPABASE_PROJECT_REF>.storage.supabase.co/storage/v1/s3
SOURCE_S3_REGION=auto
SOURCE_S3_ACCESS_KEY=<SUPABASE_S3_ACCESS_KEY>
SOURCE_S3_SECRET_KEY=<SUPABASE_S3_SECRET_KEY>
SOURCE_S3_BUCKET=<SUPABASE_BUCKET>

DEST_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
DEST_S3_REGION=auto
DEST_S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>
DEST_S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>
DEST_S3_BUCKET=3dmarketiran-assets
```

Then:

```bash
npm run migrate:s3:r2
```

The script is intentionally **source read-only**. It only performs List/Get/Head operations against Supabase and Put/Head operations against R2.

## 5. Important: database URLs must also be updated

After object migration, the D1 rows should keep their canonical `storageKey` values. Do not bulk-rewrite database keys just because the provider changed.

Only the public URL configuration changes from the Supabase public storage URL to the R2 custom domain.

## 6. Recommended cutover

1. Create R2 bucket.
2. Copy Supabase Storage objects.
3. Run an object-count/key verification.
4. Switch `STORAGE_PROVIDER=s3` + R2 credentials.
5. Keep Supabase Storage available for rollback.
6. Verify product images, logos, GLTF, GLB, BIN and package assets.
7. Only after verification, disable writes to old Supabase Storage.

## 7. R2 vs generic S3

The existing provider supports AWS S3 and other S3-compatible systems. For R2, `STORAGE_ENDPOINT` is the R2 S3 endpoint and `STORAGE_REGION=auto`.

R2 also has a native Workers binding. That binding is preferable when the application itself runs as a Cloudflare Worker. The current Express application can continue using the S3-compatible API until the runtime is migrated to Workers.
