import { z } from "zod";

export const dimensionUnitSchema = z.enum([
  "MM",
  "CM",
  "M",
]);

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),

  shortDescription:
    z.string().max(300).optional(),

  fullDescription:
    z.string().max(10_000).optional(),

  price:
    z.number().min(0).max(1_000_000_000_000).optional(),

  categoryId:
    z.string().cuid().optional(),

  tags:
    z.string().max(500).optional(),

  material:
    z.string().trim().max(120).optional(),

  colors:
    z.array(
      z.object({
        name: z.string().trim().min(1).max(60),
        value: z.string().trim().max(80),
      })
    ).max(24).optional(),

  width:
    z.number().positive().optional(),

  height:
    z.number().positive().optional(),

  depth:
    z.number().positive().optional(),

  unit:
    dimensionUnitSchema.optional(),
});

/*
 * IMPORTANT:
 *
 * PUBLISHED is intentionally NOT accepted here.
 *
 * Publishing is a separate business operation and must always go through:
 *
 * POST /api/products/:id/publish
 *
 * This prevents a seller from bypassing the publish queue and public-data
 * generation by sending:
 *
 * { "visibility": "PUBLISHED" }
 *
 * to the normal product update endpoint.
 *
 * Visibility changes are intentionally excluded.
 * Sellers use the dedicated publish/unpublish operations and admins use
 * the moderation endpoint, so no normal edit can desynchronize GitHub Pages.
 */
export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema =
  z.object({
    page:
      z.coerce.number()
        .int()
        .min(1)
        .default(1),

    pageSize:
      z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .default(20),

    search:
      z.string().max(200).optional(),

    categoryId:
      z.string().cuid().optional(),

    // Seller identifiers may be legacy IDs after database imports. Treat the ID
    // as an opaque, bounded identifier; the route still enforces ownership and
    // the database lookup is authoritative.
    sellerId:
      z.string().trim().min(1).max(128).optional(),

    visibility:
      z.enum([
        "DRAFT",
        "PUBLISHED",
        "HIDDEN",
      ]).optional(),

    sort:
      z.enum([
        "newest",
        "alphabetical",
      ]).default("newest"),
  });

export const reorderImagesSchema =
  z.object({
    imageIds:
      z.array(z.string().cuid()).min(1),
  });
