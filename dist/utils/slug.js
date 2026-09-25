"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
const nanoid_1 = require("nanoid");
/**
 * Generates a URL-safe slug from a (possibly Persian/non-Latin) product
 * or seller name. Since transliteration of Persian to Latin is lossy and
 * ambiguous, we keep the slug short and unique via a random suffix rather
 * than attempting perfect transliteration — stability of the URL matters
 * more than it being human-readable in Latin script.
 */
function slugify(input) {
    const base = input
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-") // collapse non letter/number runs (Unicode-aware, keeps Persian letters)
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const suffix = (0, nanoid_1.nanoid)(6).toLowerCase();
    return base ? `${base}-${suffix}` : suffix;
}
//# sourceMappingURL=slug.js.map