import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import { slugify } from "../utils/slug";

export const categoriesRouter = Router();

/**
 * ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------
 */

async function createUniqueSlug(name: string, excludeId?: string) {
  const baseSlug = slugify(name) || `category-${Date.now()}`;

  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const existing = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing || existing.id === excludeId) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function ensureValidParent(
  parentId: string | undefined,
  categoryId?: string,
) {
  if (!parentId) {
    return;
  }

  if (categoryId && parentId === categoryId) {
    throw new Error("A category cannot be its own parent");
  }

  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      isActive: true,
      parentId: true,
    },
  });

  if (!parent) {
    throw new Error("Parent category not found");
  }

  if (!parent.isActive) {
    throw new Error("Parent category is inactive");
  }

  // Prevent simple circular references.
  if (categoryId) {
    let currentParentId: string | null = parent.parentId;
    const visited = new Set<string>();

    while (currentParentId) {
      if (currentParentId === categoryId) {
        throw new Error("Circular category hierarchy is not allowed");
      }

      if (visited.has(currentParentId)) {
        break;
      }

      visited.add(currentParentId);

      const parentCategory = await prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });

      currentParentId = parentCategory?.parentId ?? null;
    }
  }
}

/**
 * ------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------
 */

const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  parentId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  parentId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * ------------------------------------------------------------------
 * GET /api/categories
 *
 * Public endpoint.
 *
 * By default only active categories are returned.
 *
 * Admins can request:
 * GET /api/categories?includeInactive=true
 * ------------------------------------------------------------------
 */

categoriesRouter.get("/", async (req, res, next) => {
  try {
    const includeInactive =
      String(req.query.includeInactive || "").toLowerCase() === "true";

    const categories = await prisma.category.findMany({
      where: includeInactive
        ? undefined
        : {
            isActive: true,
          },
      orderBy: [
        {
          name: "asc",
        },
      ],
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    res.json({
      categories,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ------------------------------------------------------------------
 * GET /api/categories/:id
 * ------------------------------------------------------------------
 */

categoriesRouter.get("/:id", async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        parent: true,
        children: {
          orderBy: {
            name: "asc",
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    res.json({
      category,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ------------------------------------------------------------------
 * POST /api/categories
 *
 * Super Admin/Admin:
 * Create category.
 * ------------------------------------------------------------------
 */

categoriesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = categoryCreateSchema.parse(req.body);

      await ensureValidParent(input.parentId ?? undefined);

      const slug = await createUniqueSlug(input.name);

      const category = await prisma.category.create({
        data: {
          name: input.name,
          slug,
          parentId: input.parentId ?? null,
          isActive: input.isActive ?? true,
        },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      res.status(201).json({
        category,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ------------------------------------------------------------------
 * PUT /api/categories/:id
 *
 * Super Admin/Admin:
 * Edit category.
 * ------------------------------------------------------------------
 */

categoriesRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const categoryId = req.params.id;
      const input = categoryUpdateSchema.parse(req.body);

      const existing = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!existing) {
        return res.status(404).json({
          message: "Category not found",
        });
      }

      if (input.parentId !== undefined) {
        await ensureValidParent(input.parentId ?? undefined, categoryId);
      }

      const data: {
        name?: string;
        slug?: string;
        parentId?: string | null;
        isActive?: boolean;
      } = {};

      if (input.name !== undefined) {
        data.name = input.name;

        if (input.name !== existing.name) {
          data.slug = await createUniqueSlug(input.name, categoryId);
        }
      }

      if (input.parentId !== undefined) {
        data.parentId = input.parentId ?? null;
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive;
      }

      const category = await prisma.category.update({
        where: {
          id: categoryId,
        },
        data,
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      res.json({
        category,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ------------------------------------------------------------------
 * PATCH /api/categories/:id/status
 *
 * Super Admin/Admin:
 * Activate / deactivate category.
 * ------------------------------------------------------------------
 */

categoriesRouter.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const schema = z.object({
        isActive: z.boolean(),
      });

      const input = schema.parse(req.body);

      const existing = await prisma.category.findUnique({
        where: {
          id: req.params.id,
        },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      if (!existing) {
        return res.status(404).json({
          message: "Category not found",
        });
      }

      const category = await prisma.category.update({
        where: {
          id: req.params.id,
        },
        data: {
          isActive: input.isActive,
        },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      res.json({
        category,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ------------------------------------------------------------------
 * DELETE /api/categories/:id
 *
 * Super Admin/Admin:
 * Delete category only when it has no products and no children.
 *
 * We intentionally do NOT cascade-delete products.
 * ------------------------------------------------------------------
 */

categoriesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const category = await prisma.category.findUnique({
        where: {
          id: req.params.id,
        },
        include: {
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
      });

      if (!category) {
        return res.status(404).json({
          message: "Category not found",
        });
      }

      if (category._count.products > 0) {
        return res.status(409).json({
          message:
            "This category cannot be deleted because products are assigned to it. Reassign or remove the products from this category first.",
          code: "CATEGORY_HAS_PRODUCTS",
          productCount: category._count.products,
        });
      }

      if (category._count.children > 0) {
        return res.status(409).json({
          message:
            "This category cannot be deleted because it has child categories. Move or delete the child categories first.",
          code: "CATEGORY_HAS_CHILDREN",
          childCount: category._count.children,
        });
      }

      await prisma.category.delete({
        where: {
          id: req.params.id,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
