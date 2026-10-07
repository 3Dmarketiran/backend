PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User" ("role");

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "success" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);

CREATE INDEX IF NOT EXISTS "LoginAttempt_email_createdAt_idx" ON "LoginAttempt" ("email", "createdAt");

CREATE TABLE IF NOT EXISTS "Seller" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "storeName" TEXT NOT NULL,
  "description" TEXT,
  "logoUrl" TEXT,
  "logoStorageKey" TEXT,
  "themeColor" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "address" TEXT,
  "sellerCategoryId" TEXT,
  "socialLinks" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("sellerCategoryId") REFERENCES "Category" ("id")
);

CREATE INDEX IF NOT EXISTS "Seller_slug_idx" ON "Seller" ("slug");

CREATE INDEX IF NOT EXISTS "Seller_sellerCategoryId_idx" ON "Seller" ("sellerCategoryId");

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "parentId" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("parentId") REFERENCES "Category" ("id")
);

CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category" ("parentId");

CREATE INDEX IF NOT EXISTS "Category_isActive_idx" ON "Category" ("isActive");

CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "shortDescription" TEXT,
  "fullDescription" TEXT,
  "price" REAL,
  "isPinned" INTEGER NOT NULL DEFAULT 0,
  "pinOrder" INTEGER,
  "categoryId" TEXT,
  "tags" TEXT,
  "material" TEXT,
  "colors" TEXT,
  "widthMm" REAL,
  "heightMm" REAL,
  "depthMm" REAL,
  "inputUnit" TEXT,
  "visibility" TEXT NOT NULL DEFAULT "DRAFT",
  "hasUnpublishedChanges" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  "publishedAt" DATETIME,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);

CREATE INDEX IF NOT EXISTS "Product_sellerId_idx" ON "Product" ("sellerId");

CREATE INDEX IF NOT EXISTS "Product_visibility_idx" ON "Product" ("visibility");

CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product" ("categoryId");

CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "isPrimary" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER,
  "height" INTEGER,
  "sizeBytes" INTEGER,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage" ("productId");

CREATE TABLE IF NOT EXISTS "ProductAssetPackage" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT UNIQUE NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProductModel" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "posterImageUrl" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductModel_productId_idx" ON "ProductModel" ("productId");

CREATE TABLE IF NOT EXISTS "SubscriptionPlanCategory" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "SubscriptionPlanCategory_isActive_sortOrder_idx" ON "SubscriptionPlanCategory" ("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "price" REAL NOT NULL,
  "discountPct" REAL,
  "features" TEXT,
  "productLimit" INTEGER,
  "storageLimitMb" INTEGER,
  "trafficLimitGb" INTEGER,
  "categoryId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "isPublic" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("categoryId") REFERENCES "SubscriptionPlanCategory" ("id")
);

CREATE INDEX IF NOT EXISTS "SubscriptionPlan_categoryId_sortOrder_idx" ON "SubscriptionPlan" ("categoryId", "sortOrder");

CREATE INDEX IF NOT EXISTS "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan" ("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT "PENDING",
  "startDate" DATETIME,
  "endDate" DATETIME,
  "activatedById" TEXT,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id"),
  FOREIGN KEY ("activatedById") REFERENCES "User" ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_sellerId_status_idx" ON "Subscription" ("sellerId", "status");

CREATE TABLE IF NOT EXISTS "TrafficBundle" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "gigabytes" INTEGER NOT NULL,
  "priceToman" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "TrafficBundle_isActive_sortOrder_idx" ON "TrafficBundle" ("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "TrafficUsage" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "servedBytes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE,
  UNIQUE ("sellerId", "periodStart")
);

CREATE INDEX IF NOT EXISTS "TrafficUsage_sellerId_periodEnd_idx" ON "TrafficUsage" ("sellerId", "periodEnd");

CREATE TABLE IF NOT EXISTS "TrafficPurchase" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "gigabytes" INTEGER NOT NULL,
  "priceToman" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT "PENDING",
  "paymentReference" TEXT,
  "notes" TEXT,
  "requestedAt" DATETIME NOT NULL,
  "approvedAt" DATETIME,
  "approvedById" TEXT,
  "rejectedAt" DATETIME,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("bundleId") REFERENCES "TrafficBundle" ("id"),
  FOREIGN KEY ("approvedById") REFERENCES "User" ("id")
);

CREATE INDEX IF NOT EXISTS "TrafficPurchase_sellerId_periodStart_status_idx" ON "TrafficPurchase" ("sellerId", "periodStart", "status");

CREATE INDEX IF NOT EXISTS "TrafficPurchase_status_requestedAt_idx" ON "TrafficPurchase" ("status", "requestedAt");

CREATE TABLE IF NOT EXISTS "PublishJob" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT,
  "triggeredById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT "QUEUED",
  "operation" TEXT NOT NULL DEFAULT "PUBLISH",
  "commitSha" TEXT,
  "errorMessage" TEXT,
  "requestedAt" DATETIME NOT NULL,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "Product" ("id"),
  FOREIGN KEY ("triggeredById") REFERENCES "User" ("id")
);

CREATE INDEX IF NOT EXISTS "PublishJob_sellerId_idx" ON "PublishJob" ("sellerId");

CREATE INDEX IF NOT EXISTS "PublishJob_status_idx" ON "PublishJob" ("status");

CREATE TABLE IF NOT EXISTS "PublishLog" (
  "id" TEXT PRIMARY KEY,
  "publishJobId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT "info",
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("publishJobId") REFERENCES "PublishJob" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PublishLog_publishJobId_idx" ON "PublishLog" ("publishJobId");

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "sellerId" TEXT,
  "productId" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id"),
  FOREIGN KEY ("productId") REFERENCES "Product" ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent" ("type", "createdAt");

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_sellerId_idx" ON "AnalyticsEvent" ("sellerId");

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_productId_idx" ON "AnalyticsEvent" ("productId");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT,
  "sellerId" TEXT,
  "productId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "ipAddress" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("actorId") REFERENCES "User" ("id"),
  FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id"),
  FOREIGN KEY ("productId") REFERENCES "Product" ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog" ("actorId");

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" TEXT PRIMARY KEY DEFAULT "singleton",
  "platformName" TEXT NOT NULL DEFAULT "پلتفرم نمایشگاه محصول",
  "logoUrl" TEXT,
  "faviconUrl" TEXT,
  "colorPrimary" TEXT NOT NULL DEFAULT "#3730A3",
  "colorSecondary" TEXT NOT NULL DEFAULT "#7C3AED",
  "colorAccent" TEXT NOT NULL DEFAULT "#06B6D4",
  "colorBackground" TEXT NOT NULL DEFAULT "#F8FAFC",
  "colorText" TEXT NOT NULL DEFAULT "#1E293B",
  "fontFamily" TEXT NOT NULL DEFAULT "Vazirmatn",
  "socialLinks" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "githubOwner" TEXT,
  "githubRepository" TEXT,
  "githubBranch" TEXT NOT NULL DEFAULT "main",
  "updatedAt" DATETIME NOT NULL
);

