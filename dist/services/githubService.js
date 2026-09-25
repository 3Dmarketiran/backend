"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertFile = upsertFile;
exports.upsertBinaryFile = upsertBinaryFile;
exports.getOrCreateRelease = getOrCreateRelease;
exports.uploadReleaseAsset = uploadReleaseAsset;
exports.publishReleaseAsset = publishReleaseAsset;
exports.deleteFile = deleteFile;
exports.testConnection = testConnection;
const node_crypto_1 = require("node:crypto");
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
const GITHUB_API = "https://api.github.com";
const GITHUB_UPLOADS_API = "https://uploads.github.com";
function assertConfigured() {
    if (!env_1.env.GITHUB_TOKEN || !env_1.env.GITHUB_OWNER || !env_1.env.GITHUB_REPOSITORY) {
        throw new errorHandler_1.HttpError(503, "انتشار در GitHub پیکربندی نشده است. مدیر باید GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPOSITORY را تنظیم کند.");
    }
}
function authHeaders() {
    return {
        Authorization: `Bearer ${env_1.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}
async function getFileSha(path) {
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/contents/${encodeURI(path)}?ref=${env_1.env.GITHUB_BRANCH}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 404)
        return null;
    if (!res.ok) {
        throw new errorHandler_1.HttpError(502, `خطا در دریافت وضعیت فایل از GitHub (${res.status}).`);
    }
    const data = (await res.json());
    return data.sha;
}
function gitBlobSha(content) {
    const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
    return (0, node_crypto_1.createHash)("sha1")
        .update(Buffer.concat([header, content]))
        .digest("hex");
}
function contentSha256(content) {
    return (0, node_crypto_1.createHash)("sha256").update(content).digest("hex");
}
/**
 * Creates or updates a UTF-8 text file.
 */
async function upsertFile(path, content, commitMessage) {
    assertConfigured();
    const sha = await getFileSha(path);
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/contents/${encodeURI(path)}`;
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: commitMessage,
            content: Buffer.from(content, "utf-8").toString("base64"),
            branch: env_1.env.GITHUB_BRANCH,
            ...(sha ? { sha } : {}),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `انتشار روی GitHub ناموفق بود (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json());
    return data.commit.sha;
}
/**
 * Legacy binary repository upload.
 *
 * Kept for compatibility with existing code.
 * New 3D publishing must use GitHub Releases instead.
 */
async function upsertBinaryFile(path, content, commitMessage) {
    assertConfigured();
    const sha = await getFileSha(path);
    const contentSha = gitBlobSha(content);
    if (sha && sha === contentSha) {
        return {
            commitSha: null,
            changed: false,
        };
    }
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/contents/${encodeURI(path)}`;
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: commitMessage,
            content: content.toString("base64"),
            branch: env_1.env.GITHUB_BRANCH,
            ...(sha ? { sha } : {}),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `انتشار فایل باینری روی GitHub ناموفق بود (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json());
    return {
        commitSha: data.commit.sha,
        changed: true,
    };
}
/**
 * Finds an existing release by tag.
 */
async function getReleaseByTag(tag) {
    assertConfigured();
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/releases/tags/${encodeURIComponent(tag)}`;
    const res = await fetch(url, {
        headers: authHeaders(),
    });
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `خطا در دریافت Release از GitHub (${res.status}): ${body.slice(0, 300)}`);
    }
    return (await res.json());
}
/**
 * Creates a release when it does not already exist.
 */
async function getOrCreateRelease(tag, name) {
    assertConfigured();
    const existing = await getReleaseByTag(tag);
    if (existing) {
        return existing;
    }
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/releases`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            tag_name: tag,
            name,
            body: "3D assets published by the platform.",
            draft: false,
            prerelease: false,
        }),
    });
    if (res.status === 422) {
        // Race condition: another publish may have created it.
        const raceWinner = await getReleaseByTag(tag);
        if (raceWinner) {
            return raceWinner;
        }
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `ساخت GitHub Release ناموفق بود (${res.status}): ${body.slice(0, 300)}`);
    }
    return (await res.json());
}
/**
 * Lists assets belonging to a release.
 */
async function listReleaseAssets(releaseId) {
    assertConfigured();
    const assets = [];
    let page = 1;
    while (true) {
        const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
            `/releases/${releaseId}/assets?per_page=100&page=${page}`;
        const res = await fetch(url, {
            headers: authHeaders(),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new errorHandler_1.HttpError(502, `خطا در دریافت Assetهای Release (${res.status}): ${body.slice(0, 300)}`);
        }
        const batch = (await res.json());
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
 * The asset name contains the SHA-256 of its content, so identical
 * content is uploaded only once.
 */
async function uploadReleaseAsset(params) {
    assertConfigured();
    const { releaseId, content, extension, baseName = "model", } = params;
    const hash = contentSha256(content).slice(0, 32);
    const assetName = `${baseName}-${hash}.${extension}`;
    const assets = await listReleaseAssets(releaseId);
    const existing = assets.find((asset) => asset.name === assetName);
    if (existing) {
        return {
            url: existing.browser_download_url,
            assetName,
            changed: false,
        };
    }
    const encodedName = encodeURIComponent(assetName);
    const url = `${GITHUB_UPLOADS_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/releases/${releaseId}/assets?name=${encodedName}`;
    const contentType = extension === "usdz"
        ? "model/vnd.usdz+zip"
        : extension === "gltf"
            ? "model/gltf+json"
            : "model/gltf-binary";
    const res = await fetch(url, {
        method: "POST",
        headers: {
            ...authHeaders(),
            "Content-Type": contentType,
            "Content-Length": String(content.byteLength),
        },
        body: content,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `آپلود Asset به GitHub Release ناموفق بود (${res.status}): ${body.slice(0, 500)}`);
    }
    const asset = (await res.json());
    return {
        url: asset.browser_download_url,
        assetName: asset.name,
        changed: true,
    };
}
/**
 * Publishes one 3D model into a product-specific GitHub Release.
 *
 * A product keeps one release and each unique binary gets one hashed asset.
 */
async function publishReleaseAsset(params) {
    const tag = `3d-assets-product-${params.productId}`;
    const release = await getOrCreateRelease(tag, `3D Assets — ${params.productId}`);
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
async function deleteFile(path, commitMessage) {
    assertConfigured();
    const sha = await getFileSha(path);
    if (!sha)
        return null;
    const url = `${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}` +
        `/contents/${encodeURI(path)}`;
    const res = await fetch(url, {
        method: "DELETE",
        headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: commitMessage,
            sha,
            branch: env_1.env.GITHUB_BRANCH,
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new errorHandler_1.HttpError(502, `حذف فایل از GitHub ناموفق بود (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json());
    return data.commit.sha;
}
async function testConnection() {
    if (!env_1.env.GITHUB_TOKEN ||
        !env_1.env.GITHUB_OWNER ||
        !env_1.env.GITHUB_REPOSITORY) {
        return {
            ok: false,
            message: "GitHub پیکربندی نشده است.",
        };
    }
    try {
        const res = await fetch(`${GITHUB_API}/repos/${env_1.env.GITHUB_OWNER}/${env_1.env.GITHUB_REPOSITORY}`, {
            headers: authHeaders(),
        });
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
    }
    catch (err) {
        return {
            ok: false,
            message: err instanceof Error
                ? err.message
                : "خطای نامشخص",
        };
    }
}
//# sourceMappingURL=githubService.js.map