import { nanoid } from "nanoid";

/**
 * Generates a URL-safe slug from a (possibly Persian/non-Latin) product
 * or seller name. Since transliteration of Persian to Latin is lossy and
 * ambiguous, we keep the slug short and unique via a random suffix rather
 * than attempting perfect transliteration — stability of the URL matters
 * more than it being human-readable in Latin script.
 */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-") // collapse non letter/number runs (Unicode-aware, keeps Persian letters)
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const suffix = nanoid(6).toLowerCase();
  return base ? `${base}-${suffix}` : suffix;
}
