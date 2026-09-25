"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderImagesSchema = exports.listProductsQuerySchema = exports.updateProductSchema = exports.createProductSchema = exports.dimensionUnitSchema = void 0;
const zod_1 = require("zod");
exports.dimensionUnitSchema = zod_1.z.enum(["MM", "CM", "M"]);
exports.createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    shortDescription: zod_1.z.string().max(300).optional(),
    fullDescription: zod_1.z.string().max(10_000).optional(),
    categoryId: zod_1.z.string().cuid().optional(),
    tags: zod_1.z.string().max(500).optional(), // comma-separated, normalized in service layer
    width: zod_1.z.number().positive().optional(),
    height: zod_1.z.number().positive().optional(),
    depth: zod_1.z.number().positive().optional(),
    unit: exports.dimensionUnitSchema.optional(),
});
exports.updateProductSchema = exports.createProductSchema.partial().extend({
    visibility: zod_1.z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(),
});
exports.listProductsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().max(200).optional(),
    categoryId: zod_1.z.string().cuid().optional(),
    sellerId: zod_1.z.string().cuid().optional(),
    visibility: zod_1.z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(),
    sort: zod_1.z.enum(["newest", "alphabetical"]).default("newest"),
});
exports.reorderImagesSchema = zod_1.z.object({
    imageIds: zod_1.z.array(zod_1.z.string().cuid()).min(1),
});
//# sourceMappingURL=product.js.map