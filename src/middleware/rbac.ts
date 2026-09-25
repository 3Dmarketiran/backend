import type {
  Request,
  Response,
  NextFunction,
} from "express";
import type { Role } from "../types/domain";
import { prisma } from "../config/prisma";

const unauthorizedResponse = {
  success: false,
  error: "UNAUTHORIZED",
  message: "احراز هویت لازم است.",
};

const forbiddenResponse = {
  success: false,
  error: "FORBIDDEN",
  message: "دسترسی مجاز نیست.",
};

const productNotFoundResponse = {
  success: false,
  error: "PRODUCT_NOT_FOUND",
  message: "محصول یافت نشد.",
};

const sellerNotFoundResponse = {
  success: false,
  error: "SELLER_NOT_FOUND",
  message: "فروشنده یافت نشد.",
};

/**
 * Restricts a route to one or more roles.
 *
 * This middleware also verifies authentication, so protected
 * role-based routes do not need a separate requireAuth call.
 */
export function requireRole(
  ...roles: Role[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json(unauthorizedResponse);
    }

    if (
      !roles.includes(req.user.role)
    ) {
      return res
        .status(403)
        .json(forbiddenResponse);
    }

    return next();
  };
}

export const requireAdmin =
  requireRole(
    "ADMIN",
    "SUPER_ADMIN",
  );

export const requireSeller =
  requireRole("SELLER");

export const requireAnyStaffOrSeller =
  requireRole(
    "ADMIN",
    "SUPER_ADMIN",
    "SELLER",
  );

/**
 * Tenant-isolation guard for product routes.
 *
 * Rules:
 * - ADMIN and SUPER_ADMIN can access products across tenants.
 * - SELLER can access only products belonging to their seller account.
 * - Other roles are denied.
 * - Missing/unknown products return 404.
 * - A product belonging to another seller also returns 404
 *   to avoid leaking whether that resource exists.
 *
 * IMPORTANT:
 * Never trust sellerId supplied by the client.
 * Ownership is always verified against the database.
 */
export function requireOwnProduct() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json(unauthorizedResponse);
      }

      if (
        req.user.role === "ADMIN" ||
        req.user.role === "SUPER_ADMIN"
      ) {
        return next();
      }

      if (
        req.user.role !== "SELLER" ||
        !req.user.seller
      ) {
        return res
          .status(403)
          .json(forbiddenResponse);
      }

      const productId =
        req.params.id ??
        req.params.productId;

      if (
        typeof productId !== "string" ||
        !productId.trim()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error: "INVALID_PRODUCT_ID",
            message:
              "شناسه محصول لازم است.",
          });
      }

      const product =
        await prisma.product.findUnique({
          where: {
            id: productId,
          },
          select: {
            sellerId: true,
          },
        });

      if (!product) {
        return res
          .status(404)
          .json(productNotFoundResponse);
      }

      if (
        product.sellerId !==
        req.user.seller.id
      ) {
        /*
         * Deliberately return 404 rather than 403.
         * This prevents one seller from confirming
         * the existence of another seller's product.
         */
        return res
          .status(404)
          .json(productNotFoundResponse);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Tenant-isolation guard for seller routes.
 *
 * Examples:
 *   /api/sellers/:id/*
 *   /api/sellers/:sellerId/*
 *
 * Admins can access any seller.
 * Sellers can access only their own seller record.
 */
export function requireOwnSeller() {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json(unauthorizedResponse);
    }

    if (
      req.user.role === "ADMIN" ||
      req.user.role === "SUPER_ADMIN"
    ) {
      return next();
    }

    if (
      req.user.role !== "SELLER" ||
      !req.user.seller
    ) {
      return res
        .status(403)
        .json(forbiddenResponse);
    }

    const sellerId =
      req.params.id ??
      req.params.sellerId;

    if (
      typeof sellerId !== "string" ||
      !sellerId.trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: "INVALID_SELLER_ID",
          message:
            "شناسه فروشنده لازم است.",
        });
    }

    if (
      req.user.seller.id !== sellerId
    ) {
      /*
       * Do not reveal another seller's
       * resource existence.
       */
      return res
        .status(404)
        .json(sellerNotFoundResponse);
    }

    return next();
  };
}
