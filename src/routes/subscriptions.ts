import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireOwnSeller } from "../middleware/rbac";
import { HttpError } from "../middleware/errorHandler";
import { parseJson, serializeJson } from "../utils/json";

export const subscriptionsRouter = Router();

// ---------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------

subscriptionsRouter.get("/plans", async (_req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { durationDays: "asc" },
    });

    res.json({
      plans: plans.map((p) => ({
        ...p,
        features: parseJson(p.features, {}),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const planSchema = z.object({
  name: z.string().min(2).max(120),
  durationDays: z.number().int().positive(),
  price: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  features: z.record(z.unknown()).optional(),
  productLimit: z.number().int().positive().optional(),
  storageLimitMb: z.number().int().positive().optional(),
});

subscriptionsRouter.post(
  "/plans",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = planSchema.parse(req.body);

      const plan = await prisma.subscriptionPlan.create({
        data: {
          ...input,
          features: serializeJson(input.features),
        },
      });

      res.status(201).json({
        plan: {
          ...plan,
          features: parseJson(plan.features, {}),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

subscriptionsRouter.put(
  "/plans/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = planSchema.partial().parse(req.body);

      const plan = await prisma.subscriptionPlan.update({
        where: {
          id: req.params.id,
        },
        data: {
          ...input,
          ...(input.features !== undefined
            ? {
                features: serializeJson(input.features),
              }
            : {}),
        },
      });

      res.json({
        plan: {
          ...plan,
          features: parseJson(plan.features, {}),
        },
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
      const sellerId = req.params.sellerId;

      const [productCount, imageUsage, modelUsage, activeSubscription] =
        await Promise.all([
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
              endDate: {
                gte: new Date(),
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
        (imageUsage._sum.sizeBytes ?? 0) +
        (modelUsage._sum.sizeBytes ?? 0);

      const usedMb = usedBytes / (1024 * 1024);

      res.json({
        productCount,
        productLimit: activeSubscription?.plan.productLimit ?? null,

        storageUsedBytes: usedBytes,
        storageUsedMb: Number(usedMb.toFixed(2)),
        storageLimitMb:
          activeSubscription?.plan.storageLimitMb ?? null,

        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              status: activeSubscription.status,
              startDate: activeSubscription.startDate,
              endDate: activeSubscription.endDate,
              plan: {
                id: activeSubscription.plan.id,
                name: activeSubscription.plan.name,
                durationDays:
                  activeSubscription.plan.durationDays,
                productLimit:
                  activeSubscription.plan.productLimit,
                storageLimitMb:
                  activeSubscription.plan.storageLimitMb,
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
// Subscriptions
// ---------------------------------------------------------------------

const activateSchema = z.object({
  sellerId: z.string().cuid(),
  planId: z.string().cuid(),
  startDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

subscriptionsRouter.post(
  "/activate",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const input = activateSchema.parse(req.body);

      const plan = await prisma.subscriptionPlan.findUnique({
        where: {
          id: input.planId,
        },
      });

      if (!plan) {
        throw new HttpError(404, "پلن یافت نشد.");
      }

      const startDate = input.startDate
        ? new Date(input.startDate)
        : new Date();

      const endDate = new Date(
        startDate.getTime() +
          plan.durationDays * 24 * 60 * 60 * 1000
      );

      const subscription = await prisma.subscription.create({
        data: {
          sellerId: input.sellerId,
          planId: input.planId,
          status: "ACTIVE",
          startDate,
          endDate,
          activatedById: req.user!.id,
          notes: input.notes,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId: input.sellerId,
          action: "SUBSCRIPTION_ACTIVATED",
          entity: "Subscription",
          entityId: subscription.id,
          metadata: serializeJson({
            planId: input.planId,
            endDate,
          }),
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        subscription: {
          ...subscription,
          plan: {
            ...plan,
            features: parseJson(plan.features, {}),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

subscriptionsRouter.post(
  "/:id/cancel",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const subscription = await prisma.subscription.update({
        where: {
          id: req.params.id,
        },
        data: {
          status: "CANCELLED",
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId: subscription.sellerId,
          action: "SUBSCRIPTION_CANCELLED",
          entity: "Subscription",
          entityId: subscription.id,
          ipAddress: req.ip,
        },
      });

      res.json({
        subscription,
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
      const subscriptions =
        await prisma.subscription.findMany({
          where: {
            sellerId: req.params.sellerId,
          },
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json({
        subscriptions: subscriptions.map((s) => ({
          ...s,
          plan: {
            ...s.plan,
            features: parseJson(
              s.plan.features,
              {}
            ),
          },
        })),
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
  const result =
    await prisma.subscription.updateMany({
      where: {
        status: "ACTIVE",
        endDate: {
          lt: new Date(),
        },
      },
      data: {
        status: "EXPIRED",
      },
    });

  return result.count;
}
