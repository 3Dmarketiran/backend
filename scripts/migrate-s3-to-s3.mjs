#!/usr/bin/env node
/**
 * Generic S3-compatible object migration.
 *
 * Designed for Supabase Storage S3 -> Cloudflare R2, but works with
 * AWS S3 / MinIO / DigitalOcean Spaces / other S3-compatible providers.
 *
 * Source is READ ONLY. Destination receives PUTs.
 *
 * Required:
 *   SOURCE_S3_ENDPOINT
 *   SOURCE_S3_REGION=auto
 *   SOURCE_S3_ACCESS_KEY
 *   SOURCE_S3_SECRET_KEY
 *   SOURCE_S3_BUCKET
 *   DEST_S3_ENDPOINT
 *   DEST_S3_REGION=auto
 *   DEST_S3_ACCESS_KEY
 *   DEST_S3_SECRET_KEY
 *   DEST_S3_BUCKET
 *
 * Optional:
 *   SOURCE_S3_PREFIX=           # migrate only a prefix
 *   DEST_S3_PREFIX=             # prepend a destination prefix
 *   S3_PAGE_SIZE=1000
 *   S3_OVERWRITE=true           # default true
 *
 * Run from backend:
 *   npm run migrate:s3:r2
 */
import process from "node:process";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const source = makeClient("SOURCE_S3");
const destination = makeClient("DEST_S3");
const sourceBucket = required("SOURCE_S3_BUCKET");
const destinationBucket = required("DEST_S3_BUCKET");
const sourcePrefix = (process.env.SOURCE_S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
const destinationPrefix = (process.env.DEST_S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
const pageSize = Math.min(1000, Math.max(1, Number(process.env.S3_PAGE_SIZE || 1000)));
const overwrite = String(process.env.S3_OVERWRITE || "true").toLowerCase() !== "false";

let continuationToken;
let seen = 0;
let copied = 0;
let skipped = 0;
let failed = 0;

console.log("============================================================");
console.log("S3-compatible -> S3-compatible object migration");
console.log("============================================================");
console.log(`Source bucket: ${sourceBucket}`);
console.log(`Source prefix: ${sourcePrefix || "<all>"}`);
console.log(`Destination bucket: ${destinationBucket}`);
console.log(`Destination prefix: ${destinationPrefix || "<none>"}`);
console.log(`Overwrite: ${overwrite}`);
console.log("");
console.log("SAFETY: source operations are List/Get/Head only.");
console.log("SAFETY: no source DeleteObject/DeleteObjects calls are made.");
console.log("");

try {
  do {
    const page = await source.send(new ListObjectsV2Command({
      Bucket: sourceBucket,
      Prefix: sourcePrefix || undefined,
      MaxKeys: pageSize,
      ContinuationToken: continuationToken,
    }));

    for (const object of page.Contents || []) {
      if (!object.Key) continue;
      seen++;
      const destinationKey = joinKey(destinationPrefix, object.Key);

      try {
        if (!overwrite) {
          try {
            await destination.send(new HeadObjectCommand({
              Bucket: destinationBucket,
              Key: destinationKey,
            }));
            skipped++;
            console.log(`[SKIP] ${object.Key}`);
            continue;
          } catch {
            // Object does not exist; continue with upload.
          }
        }

        const result = await source.send(new GetObjectCommand({
          Bucket: sourceBucket,
          Key: object.Key,
        }));

        if (!result.Body) {
          throw new Error("Source object has no body.");
        }

        const body = await result.Body.transformToByteArray();

        await destination.send(new PutObjectCommand({
          Bucket: destinationBucket,
          Key: destinationKey,
          Body: body,
          ContentType: result.ContentType,
          ContentLength: body.byteLength,
          CacheControl: result.CacheControl,
          ContentDisposition: result.ContentDisposition,
          ContentEncoding: result.ContentEncoding,
          ContentLanguage: result.ContentLanguage,
          Metadata: result.Metadata,
        }));

        copied++;
        console.log(`[COPY] ${object.Key} -> ${destinationKey} (${body.byteLength} bytes)`);
      } catch (error) {
        failed++;
        console.error(`[FAIL] ${object.Key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
} catch (error) {
  console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("OBJECT MIGRATION COMPLETED");
console.log(`Seen:    ${seen}`);
console.log(`Copied:  ${copied}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed:  ${failed}`);
console.log("Source was not modified.");
console.log("============================================================");

if (failed > 0) process.exit(2);

function makeClient(prefix) {
  const endpoint = required(`${prefix}_ENDPOINT`);
  const region = process.env[`${prefix}_REGION`] || "auto";
  const accessKeyId = required(`${prefix}_ACCESS_KEY`);
  const secretAccessKey = required(`${prefix}_SECRET_KEY`);

  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value.trim();
}

function joinKey(prefix, key) {
  const cleanKey = key.replace(/^\/+/, "");
  if (!prefix) return cleanKey;
  return `${prefix}/${cleanKey}`;
}
