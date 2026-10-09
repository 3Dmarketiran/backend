import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import {
  requireAdmin,
  requireOwnSeller,
} from "../middleware/rbac";
import { HttpError } from "../middleware/errorHandler";
import {
  parseJson,
  serializeJson,
} from "../utils/json";

export const subscriptionsRouter =
  Router();

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

function isValidDate(
  value: Date
): boolean {
  return !Number.isNaN(
    value.getTime()
  );
}

function isSubscriptionCurrentlyActive(
  status: string,
  startDate: Date | null,
  endDate: Date | null,
  now = new Date()
): boolean {
  if (
    status !== "ACTIVE" ||
    !startDate ||
    !endDate
  ) {
    return false;
  }

  return (
    startDate.getTime() <=
      now.getTime() &&
    endDate.getTime() >=
      now.getTime()
  );
}

function serializePlan(
  plan: any
) {
  return {
    ...plan,
    features: parseJson(
      plan.features,
      {}
    ),
  };
}

function serializeSubscription(
  subscription: any
) {
  return {
    ...subscription,
    isCurrentlyActive:
      isSubscriptionCurrentlyActive(
        subscription.status,
        subscription.startDate,
        subscription.endDate
      ),
    plan: subscription.plan
      ? serializePlan(
          subscription.plan
        )
      : undefined,
  };
}

// ---------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

subscriptionsRouter.get(
  "/categories",
  async (req, res, next) => {
    try {
      const adminView = Boolean(req.user && (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN"));
      const categories = await prisma.subscriptionPlanCategory.findMany({
        where: adminView && req.query.includeInactive === "true" ? {} : { isActive: true },
        include: {
          plans: {
            where: adminView && req.query.includeInactive === "true" ? {} : { isActive: true, isPublic: true },
            orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      res.json({
        categories: categories.map((category) => ({
          ...category,
          plans: category.plans.map(serializePlan),
        })),
      });
    } catch (err) { next(err); }
  }
);

subscriptionsRouter.get(
  "/categories/manage",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const categories = await prisma.subscriptionPlanCategory.findMany({
        include: {
          plans: { orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      res.json({ categories: categories.map((category) => ({ ...category, plans: category.plans.map(serializePlan) })) });
    } catch (err) { next(err); }
  }
);

subscriptionsRouter.post(
  "/categories",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = categorySchema.parse(req.body);
      const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-+|-+$/g, "-") || `category-${Date.now()}`;
      const category = await prisma.subscriptionPlanCategory.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "SUBSCRIPTION_CATEGORY_CREATED", entity: "SubscriptionPlanCategory", entityId: category.id, metadata: serializeJson({ name: category.name, slug: category.slug }), ipAddress: req.ip } });
      res.status(201).json({ category });
    } catch (err) { next(err); }
  }
);

subscriptionsRouter.put(
  "/categories/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = assertRouteId(req.params.id, "شناسه دسته‌بندی نامعتبر است.");
      const input = categorySchema.partial().parse(req.body);
      const category = await prisma.subscriptionPlanCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "SUBSCRIPTION_CATEGORY_UPDATED", entity: "SubscriptionPlanCategory", entityId: category.id, metadata: serializeJson({ changedFields: Object.keys(input) }), ipAddress: req.ip } });
      res.json({ category });
    } catch (err) { next(err); }
  }
);

subscriptionsRouter.get(
  "/plans",
  async (req, res, next) => {
    try {
      const adminView = Boolean(req.user && (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN"));
      const plans = await prisma.subscriptionPlan.findMany({
        where: adminView ? {} : { isActive: true, isPublic: true },
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }],
      });
      const categories = await prisma.subscriptionPlanCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      res.json({ plans: plans.map(serializePlan), categories });
    } catch (err) { next(err); }
  }
);

const planSchema =
  z.object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(120),

    durationDays: z
      .number()
      .int()
      .positive(),

    price: z
      .number()
      .nonnegative(),

    discountPct: z
      .number()
      .min(0)
      .max(100)
      .optional(),

    features: z
      .record(z.unknown())
      .optional(),

    productLimit: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    storageLimitMb: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    trafficLimitGb: z
      .number()
      .int()
      .positive()
      .optional(),

    categoryId: z.string().trim().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),

    isActive: z
      .boolean()
      .optional(),

    isPublic: z
      .boolean()
      .optional(),
  });

// ---------------------------------------------------------------------
// Admin plan creation
// ---------------------------------------------------------------------

subscriptionsRouter.post(
  "/plans",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input =
        planSchema.parse(
          req.body
        );

      const plan =
        await prisma.subscriptionPlan.create(
          {
            data: {
              name: input.name,
              durationDays:
                input.durationDays,
              price: input.price,
              discountPct:
                input.discountPct ??
                0,
              features:
                serializeJson(
                  input.features
                ),
              productLimit:
                input.productLimit ??
                null,
              storageLimitMb:
                input.storageLimitMb ??
                null,
              trafficLimitGb:
                input.trafficLimitGb ??
                null,
              categoryId:
                input.categoryId ??
                null,
              sortOrder:
                input.sortOrder ??
                0,
              isActive:
                input.isActive ??
                true,
              isPublic:
                input.isPublic ??
                true,
            },
          }
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          action:
            "SUBSCRIPTION_PLAN_CREATED",
          entity:
            "SubscriptionPlan",
          entityId: plan.id,
          metadata:
            serializeJson({
              name: plan.name,
              durationDays:
                plan.durationDays,
              price: plan.price,
            }),
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        plan:
          serializePlan(plan),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Admin plan update
// ---------------------------------------------------------------------

subscriptionsRouter.put(
  "/plans/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const planId =
        assertRouteId(
          req.params.id,
          "شناسه پلن نامعتبر است."
        );

      const input =
        planSchema
          .partial()
          .parse(req.body);

      const existing =
        await prisma.subscriptionPlan.findUnique(
          {
            where: {
              id: planId,
            },
          }
        );

      if (!existing) {
        throw new HttpError(
          404,
          "پلن یافت نشد."
        );
      }

      const plan =
        await prisma.subscriptionPlan.update(
          {
            where: {
              id: planId,
            },

            data: {
              ...(input.name !==
              undefined
                ? {
                    name:
                      input.name,
                  }
                : {}),

              ...(input.durationDays !==
              undefined
                ? {
                    durationDays:
                      input.durationDays,
                  }
                : {}),

              ...(input.price !==
              undefined
                ? {
                    price:
                      input.price,
                  }
                : {}),

              ...(input.discountPct !==
              undefined
                ? {
                    discountPct:
                      input.discountPct,
                  }
                : {}),

              ...(input.productLimit !==
              undefined
                ? {
                    productLimit:
                      input.productLimit,
                  }
                : {}),

              ...(input.storageLimitMb !==
              undefined
                ? {
                    storageLimitMb:
                      input.storageLimitMb,
                  }
                : {}),

              ...(input.trafficLimitGb !==
              undefined
                ? {
                    trafficLimitGb:
                      input.trafficLimitGb,
                  }
                : {}),

              ...(input.categoryId !==
              undefined
                ? {
                    categoryId:
                      input.categoryId,
                  }
                : {}),

              ...(input.sortOrder !==
              undefined
                ? {
                    sortOrder:
                      input.sortOrder,
                  }
                : {}),

              ...(input.features !==
              undefined
                ? {
                    features:
                      serializeJson(
                        input.features
                      ),
                  }
                : {}),

              ...(input.isActive !==
              undefined
                ? {
                    isActive:
                      input.isActive,
                  }
                : {}),

              ...(input.isPublic !==
              undefined
                ? {
                    isPublic:
                      input.isPublic,
                  }
                : {}),
            },
          }
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          action:
            "SUBSCRIPTION_PLAN_UPDATED",
          entity:
            "SubscriptionPlan",
          entityId: plan.id,
          metadata:
            serializeJson({
              changedFields:
                Object.keys(
                  input
                ),
            }),
          ipAddress: req.ip,
        },
      });

      res.json({
        plan:
          serializePlan(plan),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Seller storage / product usage
// ---------------------------------------------------------------------

subscriptionsRouter.get(
  "/seller/:sellerId/usage",
  requireAuth,
  requireOwnSeller(),
  async (req, res, next) => {
    try {
      const sellerId =
        assertRouteId(
          req.params.sellerId,
          "شناسه فروشنده نامعتبر است."
        );

      const now = new Date();

      const [
        productCount,
        imageUsage,
        modelUsage,
        activeSubscription,
      ] = await Promise.all([
        prisma.product.count({
          where: {
            sellerId,
          },
        }),

        prisma.productImage.aggregate({
          where: {
            product: {
              sellerId,
            },
          },
          _sum: {
            sizeBytes: true,
          },
        }),

        prisma.productModel.aggregate({
          where: {
            product: {
              sellerId,
            },
          },
          _sum: {
            sizeBytes: true,
          },
        }),

        prisma.subscription.findFirst({
          where: {
            sellerId,
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
          include: {
            plan: true,
          },
          orderBy: {
            endDate: "desc",
          },
        }),
      ]);

      const usedBytes =
        (imageUsage._sum
          .sizeBytes ?? 0) +
        (modelUsage._sum
          .sizeBytes ?? 0);

      const usedMb =
        usedBytes /
        (1024 * 1024);

      const subscription =
        activeSubscription &&
        isSubscriptionCurrentlyActive(
          activeSubscription.status,
          activeSubscription.startDate,
          activeSubscription.endDate,
          now
        )
          ? activeSubscription
          : null;

      res.json({
        productCount,

        productLimit:
          subscription?.plan
            .productLimit ??
          null,

        storageUsedBytes:
          usedBytes,

        storageUsedMb:
          Number(
            usedMb.toFixed(2)
          ),

        storageLimitMb:
          subscription?.plan
            .storageLimitMb ??
          null,

        subscription:
          subscription
            ? {
                id:
                  subscription.id,

                status:
                  subscription.status,

                startDate:
                  subscription.startDate,

                endDate:
                  subscription.endDate,

                isCurrentlyActive:
                  true,

                plan: {
                  id:
                    subscription
                      .plan.id,

                  name:
                    subscription
                      .plan.name,

                  durationDays:
                    subscription
                      .plan
                      .durationDays,

                  productLimit:
                    subscription
                      .plan
                      .productLimit,

                  storageLimitMb:
                    subscription
                      .plan
                      .storageLimitMb,
                },
              }
            : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Activate subscription
// ---------------------------------------------------------------------

const activateSchema =
  z.object({
    sellerId: z
      .string()
      .cuid(),

    planId: z
      .string()
      .cuid(),

    startDate: z
      .string()
      .datetime()
      .optional(),

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  });

subscriptionsRouter.post(
  "/activate",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input =
        activateSchema.parse(
          req.body
        );

      const now = new Date();

      const [
        seller,
        plan,
        existingActiveSubscription,
      ] = await Promise.all([
        prisma.seller.findUnique({
          where: {
            id: input.sellerId,
          },
          select: {
            id: true,
            isActive: true,
          },
        }),

        prisma.subscriptionPlan.findUnique(
          {
            where: {
              id: input.planId,
            },
          }
        ),

        prisma.subscription.findFirst({
          where: {
            sellerId:
              input.sellerId,

            status:
              "ACTIVE",

            startDate: {
              lte: now,
            },

            endDate: {
              gte: now,
            },
          },

          orderBy: {
            endDate:
              "desc",
          },
        }),
      ]);

      if (!seller) {
        throw new HttpError(
          404,
          "فروشنده یافت نشد."
        );
      }

      if (!seller.isActive) {
        throw new HttpError(
          409,
          "این فروشنده غیرفعال است و نمی‌توان برای آن اشتراک فعال کرد."
        );
      }

      if (!plan) {
        throw new HttpError(
          404,
          "پلن یافت نشد."
        );
      }

      if (!plan.isActive) {
        throw new HttpError(
          409,
          "این پلن غیرفعال است و قابل فعال‌سازی نیست."
        );
      }

      if (
        existingActiveSubscription
      ) {
        throw new HttpError(
          409,
          "این فروشگاه در حال حاضر یک اشتراک فعال دارد. ابتدا اشتراک فعلی را لغو یا منقضی کنید."
        );
      }

      const startDate =
        input.startDate
          ? new Date(
              input.startDate
            )
          : now;

      if (
        !isValidDate(
          startDate
        )
      ) {
        throw new HttpError(
          400,
          "تاریخ شروع اشتراک نامعتبر است."
        );
      }

      const endDate =
        new Date(
          startDate.getTime() +
            plan.durationDays *
              24 *
              60 *
              60 *
              1000
        );

      // Older plans created before traffic quotas were made mandatory may have
      // a null quota. Repair the known platform tiers on activation so a new
      // seller never silently receives an unlimited storefront.
      if (plan.trafficLimitGb == null) {
        const inferredTraffic = plan.productLimit === 10 && plan.storageLimitMb === 500
          ? 5
          : plan.productLimit === 30 && plan.storageLimitMb === 1536
            ? 12
            : plan.productLimit === 100 && plan.storageLimitMb === 5120
              ? 25
              : null;
        if (inferredTraffic == null) throw new HttpError(409, "این پلن سقف ترافیک مشخصی ندارد. ابتدا سقف ترافیک پلن را در پنل مدیریت تعیین کنید.");
        await prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { trafficLimitGb: inferredTraffic } });
        plan.trafficLimitGb = inferredTraffic;
      }

      const subscription =
        await prisma.subscription.create(
          {
            data: {
              sellerId:
                input.sellerId,

              planId:
                input.planId,

              status:
                "ACTIVE",

              startDate,

              endDate,

              activatedById:
                req.user!.id,

              notes:
                input.notes,
            },

            include: {
              plan: true,
            },
          }
        );

      await prisma.auditLog.create({
        data: {
          actorId:
            req.user!.id,

          sellerId:
            input.sellerId,

          action:
            "SUBSCRIPTION_ACTIVATED",

          entity:
            "Subscription",

          entityId:
            subscription.id,

          metadata:
            serializeJson({
              planId:
                input.planId,

              startDate,

              endDate,
            }),

          ipAddress:
            req.ip,
        },
      });

      res.status(201).json({
        subscription:
          serializeSubscription(
            subscription
          ),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Cancel subscription
// ---------------------------------------------------------------------

subscriptionsRouter.post(
  "/:id/cancel",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const subscriptionId =
        assertRouteId(
          req.params.id,
          "شناسه اشتراک نامعتبر است."
        );

      const subscription =
        await prisma.subscription.findUnique(
          {
            where: {
              id: subscriptionId,
            },
          }
        );

      if (!subscription) {
        throw new HttpError(
          404,
          "اشتراک یافت نشد."
        );
      }

      if (
        subscription.status ===
        "CANCELLED"
      ) {
        throw new HttpError(
          409,
          "این اشتراک قبلاً لغو شده است."
        );
      }

      if (
        subscription.status ===
        "EXPIRED"
      ) {
        throw new HttpError(
          409,
          "این اشتراک قبلاً منقضی شده است."
        );
      }

      if (
        subscription.status !==
        "ACTIVE"
      ) {
        throw new HttpError(
          409,
          "این اشتراک قابل لغو نیست."
        );
      }

      const updated =
        await prisma.subscription.update(
          {
            where: {
              id:
                subscriptionId,
            },

            data: {
              status:
                "CANCELLED",
            },

            include: {
              plan: true,
            },
          }
        );

      await prisma.auditLog.create({
        data: {
          actorId:
            req.user!.id,

          sellerId:
            updated.sellerId,

          action:
            "SUBSCRIPTION_CANCELLED",

          entity:
            "Subscription",

          entityId:
            updated.id,

          ipAddress:
            req.ip,
        },
      });

      res.json({
        subscription:
          serializeSubscription(
            updated
          ),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Seller subscription history
// ---------------------------------------------------------------------

subscriptionsRouter.get(
  "/seller/:sellerId",
  requireAuth,
  requireOwnSeller(),
  async (req, res, next) => {
    try {
      const sellerId =
        assertRouteId(
          req.params.sellerId,
          "شناسه فروشنده نامعتبر است."
        );

      const subscriptions =
        await prisma.subscription.findMany(
          {
            where: {
              sellerId,
            },

            include: {
              plan: true,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          }
        );

      res.json({
        subscriptions:
          subscriptions.map(
            serializeSubscription
          ),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Expire overdue subscriptions
// ---------------------------------------------------------------------

export async function expireOverdueSubscriptions() {
  const now = new Date();

  const result =
    await prisma.subscription.updateMany(
      {
        where: {
          status: "ACTIVE",

          endDate: {
            lt: now,
          },
        },

        data: {
          status:
            "EXPIRED",
        },
      }
    );

  return result.count;
}

export default subscriptionsRouter;
