import { createHash } from "node:crypto";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

const GITHUB_API = "https://api.github.com";
const GITHUB_UPLOADS_API = "https://uploads.github.com";

const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 300;

function assertConfigured(): void {
  if (
    !env.GITHUB_TOKEN ||
    !env.GITHUB_OWNER ||
    !env.GITHUB_REPOSITORY
  ) {
    throw new HttpError(
      503,
      "انتشار در GitHub پیکربندی نشده است. مدیر باید تنظیمات GitHub را تکمیل کند."
    );
  }
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function repositoryBaseUrl(): string {
  assertConfigured();

  return (
    `${GITHUB_API}/repos/` +
    `${encodeURIComponent(env.GITHUB_OWNER!)}/` +
    `${encodeURIComponent(env.GITHUB_REPOSITORY!)}`
  );
}

function encodePath(pathname: string): string {
  return pathname
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function repositoryContentsUrl(pathname: string): string {
  return `${repositoryBaseUrl()}/contents/${encodePath(pathname)}`;
}

function truncateErrorBody(body: string): string {
  return body
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_BODY_LENGTH);
}

function sanitizeAssetBaseName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 80);

  return sanitized || "model";
}

function createAbortSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function getFileSha(pathname: string): Promise<string | null> {
  const url =
    `${repositoryContentsUrl(pathname)}` +
    `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;

  const res = await fetch(url, {
    headers: authHeaders(),
    signal: createAbortSignal(),
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new HttpError(
      502,
      `خطا در دریافت وضعیت فایل از GitHub (${res.status}).`
    );
  }

  const data = (await res.json()) as {
    sha?: string;
  };

  if (!data.sha) {
    throw new HttpError(
      502,
      "GitHub پاسخ معتبر برای SHA فایل برنگرداند."
    );
  }

  return data.sha;
}

function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(
    `blob ${content.byteLength}\0`,
    "utf8"
  );

  return createHash("sha1")
    .update(Buffer.concat([header, content]))
    .digest("hex");
}

function contentSha256(content: Buffer): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

async function readGitHubError(
  response: Response
): Promise<string> {
  try {
    const body = await response.text();

    if (!body) {
      return "";
    }

    return truncateErrorBody(body);
  } catch {
    return "";
  }
}

/**
 * Creates or updates a UTF-8 text file in the configured repository.
 *
 * GitHub is used here only as the public metadata/static-data publishing
 * layer. Product binaries should remain in the configured asset storage
 * or dedicated Release assets.
 */
export async function upsertFile(
  path: string,
  content: string,
  commitMessage: string
): Promise<string> {
  assertConfigured();

  const contentBuffer = Buffer.from(content, "utf8");
  const existingSha = await getFileSha(path);

  /*
   * GitHub's Contents API returns the blob SHA for the current file.
   * Avoid creating an unnecessary commit when the exact content is
   * already present.
   */
  if (existingSha && existingSha === gitBlobSha(contentBuffer)) {
    /*
     * The Contents API does not provide the repository HEAD commit here.
     * Fetch the repository branch metadata so callers still receive a
     * useful commit reference.
     */
    const branchUrl =
      `${repositoryBaseUrl()}/commits/` +
      encodeURIComponent(env.GITHUB_BRANCH);

    const branchResponse = await fetch(branchUrl, {
      headers: authHeaders(),
      signal: createAbortSignal(),
    });

    if (!branchResponse.ok) {
      throw new HttpError(
        502,
        `خطا در دریافت آخرین commit از GitHub (${branchResponse.status}).`
      );
    }

    const branchData = (await branchResponse.json()) as {
      sha?: string;
    };

    if (!branchData.sha) {
      throw new HttpError(
        502,
        "GitHub پاسخ معتبر برای آخرین commit برنگرداند."
      );
    }

    return branchData.sha;
  }

  const url = repositoryContentsUrl(path);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    signal: createAbortSignal(),
    body: JSON.stringify({
      message: commitMessage,
      content: contentBuffer.toString("base64"),
      branch: env.GITHUB_BRANCH,
      ...(existingSha
        ? {
            sha: existingSha,
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await readGitHubError(res);

    throw new HttpError(
      502,
      `انتشار روی GitHub ناموفق بود (${res.status}).${
        errorBody ? ` جزئیات: ${errorBody}` : ""
      }`
    );
  }

  const data = (await res.json()) as {
    commit?: {
      sha?: string;
    };
  };

  const commitSha = data.commit?.sha;

  if (!commitSha) {
    throw new HttpError(
      502,
      "GitHub پاسخ معتبر برای commit برنگرداند."
    );
  }

  return commitSha;
}

/**
 * Legacy binary repository upload.
 *
 * Kept for compatibility with existing code.
 * New 3D publishing should use GitHub Release assets or external storage,
 * not repository contents.
 */
export async function upsertBinaryFile(
  path: string,
  content: Buffer,
  commitMessage: string
): Promise<{
  commitSha: string | null;
  changed: boolean;
}> {
  assertConfigured();

  const existingSha = await getFileSha(path);
  const contentSha = gitBlobSha(content);

  if (existingSha && existingSha === contentSha) {
    return {
      commitSha: null,
      changed: false,
    };
  }

  const url = repositoryContentsUrl(path);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    signal: createAbortSignal(),
    body: JSON.stringify({
      message: commitMessage,
      content: content.toString("base64"),
      branch: env.GITHUB_BRANCH,
      ...(existingSha
        ? {
            sha: existingSha,
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await readGitHubError(res);

    throw new HttpError(
      502,
      `انتشار فایل باینری روی GitHub ناموفق بود (${res.status}).${
        errorBody ? ` جزئیات: ${errorBody}` : ""
      }`
    );
  }

  const data = (await res.json()) as {
    commit?: {
      sha?: string;
    };
  };

  const commitSha = data.commit?.sha;

  if (!commitSha) {
    throw new HttpError(
      502,
      "GitHub پاسخ معتبر برای commit باینری برنگرداند."
    );
  }

  return {
    commitSha,
    changed: true,
  };
}

/* -------------------------------------------------------------------------- */
/* GitHub Releases                                                            */
/* -------------------------------------------------------------------------- */

interface GitHubRelease {
  id: number;
  tag_name: string;
  html_url: string;
  upload_url: string;
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
}

/**
 * Finds an existing release by tag.
 */
async function getReleaseByTag(
  tag: string
): Promise<GitHubRelease | null> {
  assertConfigured();

  const url =
    `${repositoryBaseUrl()}/releases/tags/` +
    encodeURIComponent(tag);

  const res = await fetch(url, {
    headers: authHeaders(),
    signal: createAbortSignal(),
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new HttpError(
      502,
      `خطا در دریافت Release از GitHub (${res.status}).`
    );
  }

  return (await res.json()) as GitHubRelease;
}

/**
 * Creates a release when it does not already exist.
 */
export async function getOrCreateRelease(
  tag: string,
  name: string
): Promise<GitHubRelease> {
  assertConfigured();

  const existing = await getReleaseByTag(tag);

  if (existing) {
    return existing;
  }

  const url = `${repositoryBaseUrl()}/releases`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    signal: createAbortSignal(),
    body: JSON.stringify({
      tag_name: tag,
      name,
      body: "3D assets published by the platform.",
      draft: false,
      prerelease: false,
    }),
  });

  /*
   * Two publish workers should not normally race because the publish
   * queue is sequential, but this also protects against future
   * multi-instance implementations.
   */
  if (res.status === 422) {
    const raceWinner = await getReleaseByTag(tag);

    if (raceWinner) {
      return raceWinner;
    }
  }

  if (!res.ok) {
    const errorBody = await readGitHubError(res);

    throw new HttpError(
      502,
      `ساخت GitHub Release ناموفق بود (${res.status}).${
        errorBody ? ` جزئیات: ${errorBody}` : ""
      }`
    );
  }

  return (await res.json()) as GitHubRelease;
}

/**
 * Lists all assets belonging to a release.
 */
async function listReleaseAssets(
  releaseId: number
): Promise<GitHubReleaseAsset[]> {
  assertConfigured();

  const assets: GitHubReleaseAsset[] = [];
  let page = 1;

  while (true) {
    const url =
      `${repositoryBaseUrl()}/releases/${releaseId}/assets` +
      `?per_page=100&page=${page}`;

    const res = await fetch(url, {
      headers: authHeaders(),
      signal: createAbortSignal(),
    });

    if (!res.ok) {
      throw new HttpError(
        502,
        `خطا در دریافت Assetهای Release (${res.status}).`
      );
    }

    const batch = (await res.json()) as GitHubReleaseAsset[];

    assets.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page++;
  }

  return assets;
}

/**
 * Uploads a binary asset to a GitHub Release.
 *
 * Content is identified by SHA-256 so identical binaries are uploaded
 * only once per release.
 */
export async function uploadReleaseAsset(params: {
  releaseId: number;
  content: Buffer;
  extension: "glb" | "gltf" | "usdz";
  baseName?: string;
}): Promise<{
  url: string;
  assetName: string;
  changed: boolean;
}> {
  assertConfigured();

  if (!params.content || params.content.length === 0) {
    throw new HttpError(
      400,
      "فایل 3D خالی است."
    );
  }

  const hash = contentSha256(params.content).slice(0, 32);

  const safeBaseName = sanitizeAssetBaseName(
    params.baseName ?? "model"
  );

  const assetName =
    `${safeBaseName}-${hash}.${params.extension}`;

  const assets = await listReleaseAssets(params.releaseId);

  const existing = assets.find(
    (asset) => asset.name === assetName
  );

  if (existing) {
    return {
      url: existing.browser_download_url,
      assetName,
      changed: false,
    };
  }

  const encodedName = encodeURIComponent(assetName);

  const url =
    `${GITHUB_UPLOADS_API}/repos/` +
    `${encodeURIComponent(env.GITHUB_OWNER!)}/` +
    `${encodeURIComponent(env.GITHUB_REPOSITORY!)}` +
    `/releases/${params.releaseId}/assets` +
    `?name=${encodedName}`;

  const contentType =
    params.extension === "usdz"
      ? "model/vnd.usdz+zip"
      : params.extension === "gltf"
        ? "model/gltf+json"
        : "model/gltf-binary";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": contentType,
      "Content-Length": String(params.content.byteLength),
    },
    signal: createAbortSignal(),
    body: params.content,
  });

  /*
   * Another process may have uploaded the same hashed asset between
   * our list request and this upload request.
   *
   * Re-check the release before reporting a hard failure.
   */
  if (!res.ok) {
    const errorBody = await readGitHubError(res);

    const latestAssets = await listReleaseAssets(
      params.releaseId
    );

    const raceWinner = latestAssets.find(
      (asset) => asset.name === assetName
    );

    if (raceWinner) {
      return {
        url: raceWinner.browser_download_url,
        assetName,
        changed: false,
      };
    }

    throw new HttpError(
      502,
      `آپلود Asset به GitHub Release ناموفق بود (${res.status}).${
        errorBody ? ` جزئیات: ${errorBody}` : ""
      }`
    );
  }

  const asset = (await res.json()) as GitHubReleaseAsset;

  if (!asset.browser_download_url) {
    throw new HttpError(
      502,
      "GitHub URL معتبر برای Asset برنگرداند."
    );
  }

  return {
    url: asset.browser_download_url,
    assetName: asset.name,
    changed: true,
  };
}

/**
 * Publishes one 3D model into a product-specific GitHub Release.
 *
 * A product has one Release and each unique binary is stored once using
 * a content hash.
 */
export async function publishReleaseAsset(params: {
  productId: string;
  content: Buffer;
  extension: "glb" | "gltf" | "usdz";
  baseName?: string;
}): Promise<{
  url: string;
  assetName: string;
  changed: boolean;
  releaseTag: string;
}> {
  const tag = `3d-assets-product-${params.productId}`;

  const release = await getOrCreateRelease(
    tag,
    `3D Assets — ${params.productId}`
  );

  const uploaded = await uploadReleaseAsset({
    releaseId: release.id,
    content: params.content,
    extension: params.extension,
    baseName: params.baseName,
  });

  return {
    ...uploaded,
    releaseTag: tag,
  };
}

/* -------------------------------------------------------------------------- */
/* Repository deletion                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deletes a file from the repository.
 */
export async function deleteFile(
  path: string,
  commitMessage: string
): Promise<string | null> {
  assertConfigured();

  const sha = await getFileSha(path);

  if (!sha) {
    return null;
  }

  const url = repositoryContentsUrl(path);

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    signal: createAbortSignal(),
    body: JSON.stringify({
      message: commitMessage,
      sha,
      branch: env.GITHUB_BRANCH,
    }),
  });

  if (!res.ok) {
    const errorBody = await readGitHubError(res);

    throw new HttpError(
      502,
      `حذف فایل از GitHub ناموفق بود (${res.status}).${
        errorBody ? ` جزئیات: ${errorBody}` : ""
      }`
    );
  }

  const data = (await res.json()) as {
    commit?: {
      sha?: string;
    };
  };

  return data.commit?.sha ?? null;
}

/**
 * Lightweight GitHub connectivity check.
 *
 * This intentionally does not expose repository credentials or raw
 * GitHub response bodies.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (
    !env.GITHUB_TOKEN ||
    !env.GITHUB_OWNER ||
    !env.GITHUB_REPOSITORY
  ) {
    return {
      ok: false,
      message: "GitHub پیکربندی نشده است.",
    };
  }

  try {
    const res = await fetch(
      `${repositoryBaseUrl()}`,
      {
        headers: authHeaders(),
        signal: createAbortSignal(),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        message: `اتصال ناموفق (${res.status}).`,
      };
    }

    return {
      ok: true,
      message: "اتصال به GitHub برقرار است.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "خطای نامشخص در اتصال به GitHub.",
    };
  }
}
