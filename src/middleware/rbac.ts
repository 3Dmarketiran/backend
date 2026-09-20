import type { Request, Response, NextFunction } from "express";
import type { Role } from "../types/domain";
import { prisma } from "../config/prisma";

/**
 * Restricts a route to one or more roles. Always combine with requireAuth
 * (or rely on the fact that req.user being undefined already fails here).
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "احراز هویت لازم است." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "دسترسی مجاز نیست." });
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN", "SUPER_ADMIN");
export const requireSeller = requireRole("SELLER");
export const requireAnyStaffOrSeller = requireRole("ADMIN", "SUPER_ADMIN", "SELLER");

/**
 * CRITICAL tenant-isolation guard: verifies the authenticated SELLER user
 * owns the :productId in the route. Admins bypass this (they may act on
 * any tenant). This must run on EVERY seller-scoped product route —
 * never rely on the frontend to only ever request its own products.
 *
 * This is deliberately a server-side database check on every request,
 * not a claim trusted from the client (e.g. a sellerId in the request body).
 */
export function requireOwnProduct() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "احراز هویت لازم است." });
      }

      // Admins/super-admins may act across tenants.
      if (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") {
        return next();
      }

      if (req.user.role !== "SELLER" || !req.user.seller) {
        return res.status(403).json({ error: "دسترسی مجاز نیست." });
      }

      const productId = req.params.id ?? req.params.productId;
      if (!productId) {
        return res.status(400).json({ error: "شناسه محصول لازم است." });
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { sellerId: true },
      });

      if (!product) {
        return res.status(404).json({ error: "محصول یافت نشد." });
      }

      if (product.sellerId !== req.user.seller.id) {
        // Same message as 404 to avoid leaking existence of other tenants' data.
        return res.status(404).json({ error: "محصول یافت نشد." });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Same idea, scoped to Seller entity routes (e.g. /api/sellers/:id/*). */
export function requireOwnSeller() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "احراز هویت لازم است." });
    }
    if (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") {
      return next();
    }
    const sellerId = req.params.id ?? req.params.sellerId;
    if (!req.user.seller || req.user.seller.id !== sellerId) {
      return res.status(404).json({ error: "فروشنده یافت نشد." });
    }
    next();
  };
}
