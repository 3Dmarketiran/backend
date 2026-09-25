"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const slug_1 = require("../utils/slug");
exports.categoriesRouter = (0, express_1.Router)();
exports.categoriesRouter.get("/", async (_req, res, next) => {
    try {
        const categories = await prisma_1.prisma.category.findMany({
            orderBy: { name: "asc" },
            include: { _count: { select: { products: true } } },
        });
        res.json({ categories });
    }
    catch (err) {
        next(err);
    }
});
const categorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    parentId: zod_1.z.string().cuid().optional(),
});
exports.categoriesRouter.post("/", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = categorySchema.parse(req.body);
        const category = await prisma_1.prisma.category.create({
            data: { name: input.name, parentId: input.parentId, slug: (0, slug_1.slugify)(input.name) },
        });
        res.status(201).json({ category });
    }
    catch (err) {
        next(err);
    }
});
exports.categoriesRouter.delete("/:id", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        await prisma_1.prisma.category.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=categories.js.map