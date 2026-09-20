import { z } from "zod";

export const dimensionUnitSchema = z.enum(["MM", "CM", "M"]);

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  shortDescription: z.string().max(300).optional(),
  fullDescription: z.string().max(10_000).optional(),
  categoryId: z.string().cuid().optional(),
  tags: z.string().max(500).optional(), // comma-separated, normalized in service layer

  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  unit: dimensionUnitSchema.optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  visibility: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  categoryId: z.string().cuid().optional(),
  sellerId: z.string().cuid().optional(),
  visibility: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(),
  sort: z.enum(["newest", "alphabetical"]).default("newest"),
});

export const reorderImagesSchema = z.object({
  imageIds: z.array(z.string().cuid()).min(1),
});
