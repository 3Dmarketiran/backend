import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import { slugify } from "../utils/slug";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

const categorySchema = z.object({
  name: z.string().min(2).max(100),
  parentId: z.string().cuid().optional(),
});

categoriesRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = categorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: { name: input.name, parentId: input.parentId, slug: slugify(input.name) },
    });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
