import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import {
  requireAdmin,
  requireOwnSeller,
} from "../middleware/rbac";
import { uploadLogo } from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";
import { createUserWithRole } from "../services/authService";
import { slugify } from "../utils/slug";
import {
  parseJson,
  serializeJson,
} from "../utils/json";
import { storage } from "../storage";

export const sellersRouter = Router();

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function assertRouteId(
  value: string | undefined,
  message = "شناسه نامعتبر است."
): string {
  const id = value?.trim();

  if (!id) {
    throw new HttpError(400, message);
  }

  return id;
}

function isSubscriptionCurrentlyActive(
  subscription: {
    status: string;
    startDate: Date;
    endDate: Date;
  },
  now = new Date()
): boolean {
  return (
    subscription.status === "ACTIVE" &&
    subscription.startDate <= now &&
    subscription.endDate >= now
  );
}

function isAdminRole(
  role: string | undefined
): boolean {
  return (
    role === "ADMIN" ||
    role === "SUPER_ADMIN"
  );
}

// ---------------------------------------------------------------------
// Public: storefront lookup by slug
//
// A storefront is public only when:
// - seller is active
// - subscription status is ACTIVE
// - subscription has already started
// - subscription has not expired
// ---------------------------------------------------------------------

sellersRouter.get(
  "/by-slug/:slug",
  async (req, res, next) => {
    try {
      const slug = req.params.slug.trim();

      if (!slug) {
        throw new HttpError(
          400,
          "شناسه فروشگاه نامعتبر است."
        );
      }

      const now = new Date();

      const seller =
        await prisma.seller.findUnique({
          where: {
            slug,
          },
          include: {
            subscriptions: {
              where: {
                status: "ACTIVE",
                startDate: {
                  lte: now,
                },
                endDate: {
                  gte: now,
                },
                plan: {
                  is: {
                    isActive: true,
                  },
                },
              },
              orderBy: {
                endDate: "desc",
              },
              take: 1,
            },
          },
        });

      const isPubliclyVisible =
        Boolean(
          seller?.isActive &&
            seller.subscriptions.length > 0
        );

      if (!seller || !isPubliclyVisible) {
        throw new HttpError(
          404,
          "فروشگاه یافت نشد."
        );
      }

      res.json({
        seller: {
          id: seller.id,
          slug: seller.slug,
          storeName: seller.storeName,
          description: seller.description,
          logoUrl: seller.logoUrl,
          contactEmail:
            seller.contactEmail,
          contactPhone:
            seller.contactPhone,
          address:
            seller.address,
          socialLinks: parseJson(
            seller.socialLinks,
            {}
          ),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Admin: list / manage sellers
// ---------------------------------------------------------------------

sellersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const now = new Date();

      const sellers =
        await prisma.seller.findMany({
          include: {
            user: {
              select: {
                email: true,
                isActive: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                products: true,
              },
            },
            subscriptions: {
              where: {
                status: "ACTIVE",
                startDate: {
                  lte: now,
                },
                endDate: {
                  gte: now,
                },
                plan: {
                  is: {
                    isActive: true,
                  },
                },
              },
              orderBy: {
                endDate: "desc",
              },
              take: 1,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json({
        sellers: sellers.map(
          (seller) => ({
            ...seller,
            socialLinks: parseJson(
              seller.socialLinks,
              {}
            ),
          })
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Create seller
// ---------------------------------------------------------------------

const createSellerSchema =
  z.object({
    email: z
      .string()
      .trim()
      .email(),
    password: z
      .string()
      .min(
        8,
        "رمز عبور باید حداقل ۸ کاراکتر باشد."
      ),
    storeName: z
      .string()
      .trim()
      .min(2)
      .max(120),
    contactEmail: z
      .string()
      .trim()
      .email()
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .max(30)
      .optional(),
  });

// Admin-only: creates seller accounts.
sellersRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input =
        createSellerSchema.parse(
          req.body
        );

      const slug =
        slugify(input.storeName);

      if (!slug) {
        throw new HttpError(
          400,
          "نام فروشگاه برای ساخت آدرس فروشگاه معتبر نیست."
        );
      }

      const existingSlug =
        await prisma.seller.findUnique({
          where: {
            slug,
          },
          select: {
            id: true,
          },
        });

      if (existingSlug) {
        throw new HttpError(
          409,
          "این نام فروشگاه قبلاً استفاده شده است."
        );
      }

      const user =
        await createUserWithRole({
          email: input.email,
          password: input.password,
          role: "SELLER",
          seller: {
            storeName:
              input.storeName,
            slug,
          },
        });

      if (
        input.contactEmail ||
        input.contactPhone
      ) {
        await prisma.seller.update({
          where: {
            id: user.seller!.id,
          },
          data: {
            ...(input.contactEmail !==
            undefined
              ? {
                  contactEmail:
                    input.contactEmail,
                }
              : {}),
            ...(input.contactPhone !==
            undefined
              ? {
                  contactPhone:
                    input.contactPhone,
                }
              : {}),
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId:
            user.seller!.id,
          action: "SELLER_CREATED",
          entity: "Seller",
          entityId: user.seller!.id,
          ipAddress: req.ip,
        },
      });

      const createdSeller =
        await prisma.seller.findUnique({
          where: {
            id: user.seller!.id,
          },
        });

      res.status(201).json({
        seller: createdSeller
          ? {
              ...createdSeller,
              socialLinks:
                parseJson(
                  createdSeller.socialLinks,
                  {}
                ),
            }
          : user.seller,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string })
          .code === "P2002"
      ) {
        return next(
          new HttpError(
            409,
            "ایمیل یا شناسه فروشگاه قبلاً ثبت شده است."
          )
        );
      }

      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Seller profile update
// ---------------------------------------------------------------------

const updateSellerSchema =
  z.object({
    storeName: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .optional(),

    description: z
      .string()
      .trim()
      .max(2000)
      .optional(),

    logoUrl: z
      .string()
      .trim()
      .url()
      .optional(),

    contactEmail: z
      .string()
      .trim()
      .email()
      .optional(),

    contactPhone: z
      .string()
      .trim()
      .max(30)
      .optional(),

    address: z
      .string()
      .trim()
      .max(300)
      .optional(),

    socialLinks: z
      .record(z.string().trim().url())
      .optional(),

    isActive: z
      .boolean()
      .optional(),
  });

sellersRouter.put(
  "/:id",
  requireAuth,
  requireOwnSeller(),
  async (req, res, next) => {
    try {
      const sellerId =
        assertRouteId(
          req.params.id,
          "شناسه فروشنده نامعتبر است."
        );

      const input =
        updateSellerSchema.parse(
          req.body
        );

      const existing =
        await prisma.seller.findUnique({
          where: {
            id: sellerId,
          },
        });

      if (!existing) {
        throw new HttpError(
          404,
          "فروشنده یافت نشد."
        );
      }

      const isAdmin =
        isAdminRole(
          req.user!.role
        );

      let nextSlug:
        | string
        | undefined;

      if (
        input.storeName !==
          undefined &&
        input.storeName !==
          existing.storeName
      ) {
        nextSlug =
          slugify(
            input.storeName
          );

        if (!nextSlug) {
          throw new HttpError(
            400,
            "نام فروشگاه برای ساخت آدرس فروشگاه معتبر نیست."
          );
        }

        const slugOwner =
          await prisma.seller.findFirst({
            where: {
              slug: nextSlug,
              NOT: {
                id: sellerId,
              },
            },
            select: {
              id: true,
            },
          });

        if (slugOwner) {
          throw new HttpError(
            409,
            "این نام فروشگاه قبلاً استفاده شده است."
          );
        }
      }

      const seller =
        await prisma.seller.update({
          where: {
            id: sellerId,
          },
          data: {
            ...(input.storeName !==
            undefined
              ? {
                  storeName:
                    input.storeName,
                }
              : {}),

            ...(nextSlug !==
            undefined
              ? {
                  slug: nextSlug,
                }
              : {}),

            ...(input.description !==
            undefined
              ? {
                  description:
                    input.description,
                }
              : {}),

            ...(input.logoUrl !==
            undefined
              ? {
                  logoUrl:
                    input.logoUrl,
                }
              : {}),

            ...(input.contactEmail !==
            undefined
              ? {
                  contactEmail:
                    input.contactEmail,
                }
              : {}),

            ...(input.contactPhone !==
            undefined
              ? {
                  contactPhone:
                    input.contactPhone,
                }
              : {}),

            ...(input.address !==
            undefined
              ? {
                  address:
                    input.address,
                }
              : {}),

            ...(input.socialLinks !==
            undefined
              ? {
                  socialLinks:
                    serializeJson(
                      input.socialLinks
                    ),
                }
              : {}),

            // Sellers can never
            // activate/deactivate
            // themselves.
            ...(isAdmin &&
            input.isActive !==
              undefined
              ? {
                  isActive:
                    input.isActive,
                }
              : {}),
          },
        });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId,
          action:
            "SELLER_PROFILE_UPDATED",
          entity: "Seller",
          entityId: sellerId,
          ipAddress: req.ip,
        },
      });

      res.json({
        seller: {
          ...seller,
          socialLinks:
            parseJson(
              seller.socialLinks,
              {}
            ),
        },
      });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string })
          .code === "P2002"
      ) {
        return next(
          new HttpError(
            409,
            "این شناسه یا نام فروشگاه قبلاً استفاده شده است."
          )
        );
      }

      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Seller logo upload
//
// POST /api/sellers/:id/logo
//
// Validation and the 5MB limit are handled by uploadLogo.
// The file is persisted through the configured StorageProvider.
// ---------------------------------------------------------------------

sellersRouter.post(
  "/:id/logo",
  requireAuth,
  requireOwnSeller(),
  uploadLogo,
  async (req, res, next) => {
    let newStorageKey:
      | string
      | undefined;

    try {
      const sellerId =
        assertRouteId(
          req.params.id,
          "شناسه فروشنده نامعتبر است."
        );

      if (!req.file) {
        throw new HttpError(
          400,
          "فایل لوگو ارسال نشده است."
        );
      }

      const seller =
        await prisma.seller.findUnique({
          where: {
            id: sellerId,
          },
        });

      if (!seller) {
        throw new HttpError(
          404,
          "فروشنده یافت نشد."
        );
      }

      const stored =
        await storage.save({
          folder: `sellers/${seller.id}/logo`,
          filename:
            req.file.originalname,
          buffer: req.file.buffer,
          contentType:
            req.file.mimetype,
        });

      newStorageKey =
        stored.storageKey;

      const updatedSeller =
        await prisma.seller.update({
          where: {
            id: seller.id,
          },
          data: {
            logoUrl: stored.url,
          },
        });

      // Delete the previous logo only
      // after the new one is safely stored
      // and the database points to it.
      if (
        seller.logoUrl &&
        seller.logoUrl !==
          stored.url
      ) {
        try {
          const previousKey =
            extractStorageKeyFromUrl(
              seller.logoUrl
            );

          if (previousKey) {
            await storage.delete(
              previousKey
            );
          }
        } catch {
          // The new logo is already valid.
          // A cleanup failure must not turn
          // a successful upload into a failed
          // request.
        }
      }

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId: seller.id,
          action:
            "SELLER_LOGO_UPDATED",
          entity: "Seller",
          entityId: seller.id,
          ipAddress: req.ip,
        },
      });

      newStorageKey =
        undefined;

      res.status(201).json({
        seller: {
          ...updatedSeller,
          socialLinks:
            parseJson(
              updatedSeller.socialLinks,
              {}
            ),
        },
      });
    } catch (err) {
      // If the database update failed after
      // storage.save succeeded, remove the
      // newly-created asset to prevent an orphan.
      if (newStorageKey) {
        try {
          await storage.delete(
            newStorageKey
          );
        } catch {
          // Preserve the original error.
        }
      }

      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Seller details
// ---------------------------------------------------------------------

sellersRouter.get(
  "/:id",
  requireAuth,
  requireOwnSeller(),
  async (req, res, next) => {
    try {
      const sellerId =
        assertRouteId(
          req.params.id,
          "شناسه فروشنده نامعتبر است."
        );

      const seller =
        await prisma.seller.findUnique({
          where: {
            id: sellerId,
          },
          include: {
            subscriptions: {
              orderBy: {
                createdAt: "desc",
              },
              include: {
                plan: true,
              },
            },
            _count: {
              select: {
                products: true,
              },
            },
          },
        });

      if (!seller) {
        throw new HttpError(
          404,
          "فروشنده یافت نشد."
        );
      }

      const now = new Date();

      res.json({
        seller: {
          ...seller,

          socialLinks:
            parseJson(
              seller.socialLinks,
              {}
            ),

          subscriptions:
            seller.subscriptions.map(
              (subscription) => ({
                ...subscription,

                isCurrentlyActive:
                  isSubscriptionCurrentlyActive(
                    subscription,
                    now
                  ),

                plan: {
                  ...subscription.plan,
                  features:
                    parseJson(
                      subscription.plan
                        .features,
                      {}
                    ),
                },
              })
            ),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Extract a storage key from a URL generated by the configured
// StorageProvider.
//
// This is intentionally conservative. If the URL does not clearly
// belong to the configured public asset base URL, return null and
// leave the old asset untouched.
// ---------------------------------------------------------------------

function extractStorageKeyFromUrl(
  value: string
): string | null {
  try {
    const url =
      new URL(value);

    const publicBase =
      process.env
        .PUBLIC_ASSET_BASE_URL;

    if (!publicBase) {
      return null;
    }

    const base =
      new URL(
        publicBase.endsWith("/")
          ? publicBase
          : `${publicBase}/`
      );

    if (
      url.origin !==
      base.origin
    ) {
      return null;
    }

    const basePath =
      base.pathname.endsWith("/")
        ? base.pathname
        : `${base.pathname}/`;

    if (
      !url.pathname.startsWith(
        basePath
      )
    ) {
      return null;
    }

    const relative =
      url.pathname.slice(
        basePath.length
      );

    if (!relative) {
      return null;
    }

    return relative
      .split("/")
      .filter(Boolean)
      .map((part) =>
        decodeURIComponent(part)
      )
      .join("/");
  } catch {
    return null;
  }
}

export default sellersRouter;
