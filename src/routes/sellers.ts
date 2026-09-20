import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireOwnSeller } from "../middleware/rbac";
import { HttpError } from "../middleware/errorHandler";
import { createUserWithRole } from "../services/authService";
import { slugify } from "../utils/slug";
import { parseJson, serializeJson } from "../utils/json";

export const sellersRouter = Router();

// ---------------------------------------------------------------------
// Public: storefront lookup by slug. Only visible if seller is active
// AND has a currently-active subscription (spec sections 20/22).
// ---------------------------------------------------------------------

sellersRouter.get("/by-slug/:slug", async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({
      where: { slug: req.params.slug },
      include: {
        subscriptions: { where: { status: "ACTIVE", endDate: { gte: new Date() } } },
      },
    });

    const isPubliclyVisible = seller?.isActive && (seller?.subscriptions.length ?? 0) > 0;
    if (!seller || !isPubliclyVisible) {
      throw new HttpError(404, "فروشنده یافت نشد.");
    }

    res.json({
      seller: {
        id: seller.id,
        slug: seller.slug,
        storeName: seller.storeName,
        description: seller.description,
        logoUrl: seller.logoUrl,
        contactEmail: seller.contactEmail,
        contactPhone: seller.contactPhone,
        socialLinks: parseJson(seller.socialLinks, {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Admin: list / manage sellers
// ---------------------------------------------------------------------

sellersRouter.get("/", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const sellers = await prisma.seller.findMany({
      include: {
        user: { select: { email: true, isActive: true, createdAt: true } },
        _count: { select: { products: true } },
        subscriptions: {
          where: { status: "ACTIVE", endDate: { gte: new Date() } },
          orderBy: { endDate: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ sellers: sellers.map((seller) => ({ ...seller, socialLinks: parseJson(seller.socialLinks, {}) })) });
  } catch (err) {
    next(err);
  }
});

const createSellerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد."),
  storeName: z.string().min(2).max(120),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
});

// Admin-only: creates seller accounts (no public self-registration, per spec).
sellersRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = createSellerSchema.parse(req.body);
    const slug = slugify(input.storeName);

    const user = await createUserWithRole({
      email: input.email,
      password: input.password,
      role: "SELLER",
      seller: { storeName: input.storeName, slug },
    });

    if (input.contactEmail || input.contactPhone) {
      await prisma.seller.update({
        where: { id: user.seller!.id },
        data: { contactEmail: input.contactEmail, contactPhone: input.contactPhone },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        sellerId: user.seller!.id,
        action: "SELLER_CREATED",
        entity: "Seller",
        entityId: user.seller!.id,
        ipAddress: req.ip,
      },
    });

    res.status(201).json({ seller: user.seller });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return next(new HttpError(409, "این ایمیل قبلاً ثبت شده است."));
    }
    next(err);
  }
});

const updateSellerSchema = z.object({
  storeName: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
  socialLinks: z.record(z.string().url()).optional(),
  isActive: z.boolean().optional(), // admin-only field, stripped below for sellers
});

sellersRouter.put("/:id", requireAuth, requireOwnSeller(), async (req, res, next) => {
  try {
    const input = updateSellerSchema.parse(req.body);
    const isAdmin = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN";

    const seller = await prisma.seller.update({
      where: { id: req.params.id },
      data: {
        storeName: input.storeName,
        description: input.description,
        logoUrl: input.logoUrl,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        socialLinks: serializeJson(input.socialLinks),
        // A seller can never activate/deactivate themselves — admin only.
        ...(isAdmin && input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    res.json({ seller: { ...seller, socialLinks: parseJson(seller.socialLinks, {}) } });
  } catch (err) {
    next(err);
  }
});

sellersRouter.get("/:id", requireAuth, requireOwnSeller(), async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true } },
        _count: { select: { products: true } },
      },
    });
    if (!seller) throw new HttpError(404, "فروشنده یافت نشد.");
    res.json({ seller: { ...seller, socialLinks: parseJson(seller.socialLinks, {}), subscriptions: seller.subscriptions.map((s) => ({ ...s, plan: { ...s.plan, features: parseJson(s.plan.features, {}) } })) } });
  } catch (err) {
    next(err);
  }
});
