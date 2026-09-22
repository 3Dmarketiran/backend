import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { slugify } from "../utils/slug";
import { toMillimeters } from "../utils/dimensions";
import { HttpError } from "../middleware/errorHandler";
import type { z } from "zod";
import type {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from "../validators/product";

type CreateInput =
  z.infer<typeof createProductSchema>;

type UpdateInput =
  z.infer<typeof updateProductSchema>;

type ListQuery =
  z.infer<typeof listProductsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function assertCategoryCanBeUsed(
  categoryId: string | undefined
): Promise<void> {
  if (!categoryId) {
    return;
  }

  const category =
    await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

  if (!category) {
    throw new HttpError(
      400,
      "دسته‌بندی انتخاب‌شده یافت نشد."
    );
  }

  if (!category.isActive) {
    throw new HttpError(
      400,
      "دسته‌بندی انتخاب‌شده غیرفعال است."
    );
  }
}

function buildDimensions(
  input: {
    width?: number;
    height?: number;
    depth?: number;
    unit?: "MM" | "CM" | "M";
  },
  existing?: {
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
    inputUnit:
      | "MM"
      | "CM"
      | "M"
      | null;
  }
) {
  /*
   * Dimensions are changed only when the caller explicitly supplies
   * a unit and at least one dimension.
   *
   * This prevents unrelated product edits from clearing dimensions.
   */
  if (
    !input.unit ||
    (
      input.width === undefined &&
      input.height === undefined &&
      input.depth === undefined
    )
  ) {
    return {};
  }

  return {
    widthMm:
      input.width !== undefined
        ? toMillimeters(
            input.width,
            input.unit
          )
        : existing?.widthMm ?? null,

    heightMm:
      input.height !== undefined
        ? toMillimeters(
            input.height,
            input.unit
          )
        : existing?.heightMm ?? null,

    depthMm:
      input.depth !== undefined
        ? toMillimeters(
            input.depth,
            input.unit
          )
        : existing?.depthMm ?? null,

    inputUnit:
      input.unit,
  };
}

function isSubscriptionCurrentlyActive(
  subscription: {
    status: string;
    startDate: Date;
    endDate: Date;
    plan?: {
      isActive?: boolean;
    } | null;
  },
  now = new Date()
): boolean {
  return (
    subscription.status === "ACTIVE" &&
    subscription.startDate.getTime() <=
      now.getTime() &&
    subscription.endDate.getTime() >=
      now.getTime() &&
    subscription.plan?.isActive !== false
  );
}

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

export async function listProducts(
  query: ListQuery,
  opts: {
    publicOnly: boolean;
  }
) {
  const andConditions: Record<
    string,
    unknown
  >[] = [];

  if (opts.publicOnly) {
    /*
     * Public API catalog:
     *
     * - product must be PUBLISHED
     * - seller must be active
     * - seller must have a currently active subscription
     * - subscription plan must be active
     * - category must either be empty or active
     */
    andConditions.push({
      visibility: "PUBLISHED",
    });

    andConditions.push({
      seller: {
        isActive: true,

        subscriptions: {
          some: {
            status: "ACTIVE",

            startDate: {
              lte: new Date(),
            },

            endDate: {
              gte: new Date(),
            },

            plan: {
              is: {
                isActive: true,
              },
            },
          },
        },
      },
    });

    andConditions.push({
      OR: [
        {
          categoryId: null,
        },
        {
          category: {
            isActive: true,
          },
        },
      ],
    });
  } else {
    if (query.visibility) {
      andConditions.push({
        visibility:
          query.visibility,
      });
    }

    if (query.sellerId) {
      andConditions.push({
        sellerId:
          query.sellerId,
      });
    }
  }

  if (query.categoryId) {
    andConditions.push({
      categoryId:
        query.categoryId,
    });
  }

  if (query.search) {
    andConditions.push({
      OR: [
        {
          name: {
            contains:
              query.search,
          },
        },
        {
          shortDescription: {
            contains:
              query.search,
          },
        },
        {
          tags: {
            contains:
              query.search,
          },
        },
      ],
    });
  }

  const where =
    andConditions.length === 0
      ? {}
      : {
          AND: andConditions,
        };

  const orderBy =
    query.sort === "alphabetical"
      ? {
          name: "asc" as const,
        }
      : {
          createdAt:
            "desc" as const,
        };

  const [
    items,
    total,
  ] = await Promise.all([
    prisma.product.findMany({
      where,

      orderBy,

      skip:
        (query.page - 1) *
        query.pageSize,

      take:
        query.pageSize,

      include: {
        images: {
          orderBy: {
            sortOrder:
              "asc",
          },
          take: 1,
        },

        seller: {
          select: {
            id: true,
            slug: true,
            storeName: true,
          },
        },

        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            isActive: true,
          },
        },
      },
    }),

    prisma.product.count({
      where,
    }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize:
      query.pageSize,
  };
}

/* -------------------------------------------------------------------------- */
/* Single product                                                             */
/* -------------------------------------------------------------------------- */

export async function getProductById(
  id: string
) {
  const product =
    await prisma.product.findUnique({
      where: {
        id,
      },

      include: {
        images: {
          orderBy: {
            sortOrder:
              "asc",
          },
        },

        models: true,

        seller: {
          select: {
            id: true,
            slug: true,
            storeName: true,
            isActive: true,
          },
        },

        category: true,
      },
    });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  return product;
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createProduct(
  sellerId: string,
  input: CreateInput
) {
  await enforceProductLimit(
    sellerId
  );

  await assertCategoryCanBeUsed(
    input.categoryId
  );

  const slug =
    slugify(input.name);

  const dims =
    buildDimensions({
      width: input.width,
      height: input.height,
      depth: input.depth,
      unit: input.unit,
    });

  return prisma.product.create({
    data: {
      sellerId,

      slug,

      name:
        input.name,

      shortDescription:
        input.shortDescription,

      fullDescription:
        input.fullDescription,

      categoryId:
        input.categoryId,

      tags:
        input.tags,

      visibility:
        "DRAFT",

      hasUnpublishedChanges:
        false,

      ...dims,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateProduct(
  id: string,
  input: UpdateInput
) {
  const existing =
    await prisma.product.findUnique({
      where: {
        id,
      },
    });

  if (!existing) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  /*
   * Category changes are validated server-side.
   * Frontend filtering is only a UX convenience.
   */
  if (
    input.categoryId !==
    undefined
  ) {
    await assertCategoryCanBeUsed(
      input.categoryId
    );
  }

  const dims =
    buildDimensions(
      {
        width:
          input.width,
        height:
          input.height,
        depth:
          input.depth,
        unit:
          input.unit,
      },
      {
        widthMm:
          existing.widthMm,
        heightMm:
          existing.heightMm,
        depthMm:
          existing.depthMm,
        inputUnit:
          existing.inputUnit,
      }
    );

  /*
   * Any meaningful content edit to an already published product
   * creates an unpublished version.
   *
   * The public snapshot is not modified until the explicit publish
   * operation is executed.
   */
  const hasContentChanges =
    input.name !==
      undefined ||
    input.shortDescription !==
      undefined ||
    input.fullDescription !==
      undefined ||
    input.categoryId !==
      undefined ||
    input.tags !==
      undefined ||
    input.width !==
      undefined ||
    input.height !==
      undefined ||
    input.depth !==
      undefined ||
    input.unit !==
      undefined;

  const hasUnpublishedChanges =
    existing.visibility ===
      "PUBLISHED" &&
    hasContentChanges
      ? true
      : existing.hasUnpublishedChanges;

  /*
   * PUBLISHED should only be reached through the dedicated publish
   * flow. The validator normally prevents direct publication.
   */
  const nextVisibility =
    input.visibility ??
    existing.visibility;

  return prisma.product.update({
    where: {
      id,
    },

    data: {
      name:
        input.name ??
        existing.name,

      shortDescription:
        input.shortDescription !==
        undefined
          ? input.shortDescription
          : existing.shortDescription,

      fullDescription:
        input.fullDescription !==
        undefined
          ? input.fullDescription
          : existing.fullDescription,

      categoryId:
        input.categoryId !==
        undefined
          ? input.categoryId
          : existing.categoryId,

      tags:
        input.tags !==
        undefined
          ? input.tags
          : existing.tags,

      visibility:
        nextVisibility,

      hasUnpublishedChanges,

      ...dims,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteProduct(
  id: string
) {
  const product =
    await prisma.product.findUnique({
      where: {
        id,
      },

      include: {
        images: true,
        models: true,
      },
    });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  /*
   * Best-effort storage cleanup.
   * Database deletion remains authoritative.
   */
  await Promise.all([
    ...product.images.map(
      (image) =>
        storage
          .delete(
            image.storageKey
          )
          .catch(
            () => undefined
          )
    ),

    ...product.models.map(
      (model) =>
        storage
          .delete(
            model.storageKey
          )
          .catch(
            () => undefined
          )
    ),
  ]);

  await prisma.product.delete({
    where: {
      id,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Subscription limits                                                        */
/* -------------------------------------------------------------------------- */

async function enforceProductLimit(
  sellerId: string
): Promise<void> {
  const now = new Date();

  const activeSub =
    await prisma.subscription.findFirst({
      where: {
        sellerId,

        status:
          "ACTIVE",

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
        endDate:
          "desc",
      },
    });

  if (!activeSub) {
    throw new HttpError(
      403,
      "برای افزودن محصول، اشتراک فعال لازم است."
    );
  }

  if (
    activeSub.plan
      .productLimit !==
    null
  ) {
    const count =
      await prisma.product.count({
        where: {
          sellerId,
        },
      });

    if (
      count >=
      activeSub.plan
        .productLimit
    ) {
      throw new HttpError(
        403,
        `محدودیت تعداد محصول پلن شما (${activeSub.plan.productLimit}) به پایان رسیده است.`
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Publish permission                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Confirms that a seller is currently eligible to publish.
 *
 * Editing and publishing remain separate business operations.
 */
export async function assertSellerCanPublish(
  sellerId: string
): Promise<void> {
  const seller =
    await prisma.seller.findUnique({
      where: {
        id: sellerId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

  if (
    !seller ||
    !seller.isActive
  ) {
    throw new HttpError(
      403,
      "فروشنده غیرفعال است."
    );
  }

  const now = new Date();

  const activeSub =
    await prisma.subscription.findFirst({
      where: {
        sellerId,

        status:
          "ACTIVE",

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

      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        plan: {
          select: {
            isActive: true,
          },
        },
      },
    });

  if (
    !activeSub ||
    !isSubscriptionCurrentlyActive(
      activeSub,
      now
    )
  ) {
    throw new HttpError(
      403,
      "اشتراک فعال برای انتشار لازم است."
    );
  }
}
