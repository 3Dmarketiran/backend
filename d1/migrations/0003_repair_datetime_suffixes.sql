-- 0003: repair malformed / repeated timezone suffixes created by earlier DateTime normalization.
-- Safe to re-run.

UPDATE "User"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "User"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "Session"
SET "expiresAt" = CASE
  WHEN substr(rtrim("expiresAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("expiresAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("expiresAt", 'Z')) >= 25
    THEN rtrim("expiresAt", 'Z')
  WHEN substr("expiresAt", -1) = 'Z'
    THEN rtrim("expiresAt", 'Z') || 'Z'
  WHEN substr("expiresAt", 5, 1) = '-'
       AND substr("expiresAt", 8, 1) = '-'
       AND substr("expiresAt", 11, 1) = 'T'
       AND substr("expiresAt", 14, 1) = ':'
       AND substr("expiresAt", 17, 1) = ':'
       AND NOT (substr("expiresAt", -6, 1) IN ('+', '-') AND substr("expiresAt", -3, 1) = ':')
    THEN "expiresAt" || 'Z'
  ELSE "expiresAt"
END
WHERE "expiresAt" IS NOT NULL
  AND typeof("expiresAt") = 'text';

UPDATE "Session"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "LoginAttempt"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "Seller"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "Seller"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "Category"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "Category"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "Product"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "Product"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "Product"
SET "publishedAt" = CASE
  WHEN substr(rtrim("publishedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("publishedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("publishedAt", 'Z')) >= 25
    THEN rtrim("publishedAt", 'Z')
  WHEN substr("publishedAt", -1) = 'Z'
    THEN rtrim("publishedAt", 'Z') || 'Z'
  WHEN substr("publishedAt", 5, 1) = '-'
       AND substr("publishedAt", 8, 1) = '-'
       AND substr("publishedAt", 11, 1) = 'T'
       AND substr("publishedAt", 14, 1) = ':'
       AND substr("publishedAt", 17, 1) = ':'
       AND NOT (substr("publishedAt", -6, 1) IN ('+', '-') AND substr("publishedAt", -3, 1) = ':')
    THEN "publishedAt" || 'Z'
  ELSE "publishedAt"
END
WHERE "publishedAt" IS NOT NULL
  AND typeof("publishedAt") = 'text';

UPDATE "ProductImage"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "ProductAssetPackage"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "ProductAssetPackage"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "ProductModel"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "SubscriptionPlanCategory"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "SubscriptionPlanCategory"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "SubscriptionPlan"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "SubscriptionPlan"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "Subscription"
SET "startDate" = CASE
  WHEN substr(rtrim("startDate", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("startDate", 'Z'), -3, 1) = ':'
       AND length(rtrim("startDate", 'Z')) >= 25
    THEN rtrim("startDate", 'Z')
  WHEN substr("startDate", -1) = 'Z'
    THEN rtrim("startDate", 'Z') || 'Z'
  WHEN substr("startDate", 5, 1) = '-'
       AND substr("startDate", 8, 1) = '-'
       AND substr("startDate", 11, 1) = 'T'
       AND substr("startDate", 14, 1) = ':'
       AND substr("startDate", 17, 1) = ':'
       AND NOT (substr("startDate", -6, 1) IN ('+', '-') AND substr("startDate", -3, 1) = ':')
    THEN "startDate" || 'Z'
  ELSE "startDate"
END
WHERE "startDate" IS NOT NULL
  AND typeof("startDate") = 'text';

UPDATE "Subscription"
SET "endDate" = CASE
  WHEN substr(rtrim("endDate", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("endDate", 'Z'), -3, 1) = ':'
       AND length(rtrim("endDate", 'Z')) >= 25
    THEN rtrim("endDate", 'Z')
  WHEN substr("endDate", -1) = 'Z'
    THEN rtrim("endDate", 'Z') || 'Z'
  WHEN substr("endDate", 5, 1) = '-'
       AND substr("endDate", 8, 1) = '-'
       AND substr("endDate", 11, 1) = 'T'
       AND substr("endDate", 14, 1) = ':'
       AND substr("endDate", 17, 1) = ':'
       AND NOT (substr("endDate", -6, 1) IN ('+', '-') AND substr("endDate", -3, 1) = ':')
    THEN "endDate" || 'Z'
  ELSE "endDate"
END
WHERE "endDate" IS NOT NULL
  AND typeof("endDate") = 'text';

UPDATE "Subscription"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "Subscription"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "TrafficBundle"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "TrafficBundle"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "TrafficUsage"
SET "periodStart" = CASE
  WHEN substr(rtrim("periodStart", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("periodStart", 'Z'), -3, 1) = ':'
       AND length(rtrim("periodStart", 'Z')) >= 25
    THEN rtrim("periodStart", 'Z')
  WHEN substr("periodStart", -1) = 'Z'
    THEN rtrim("periodStart", 'Z') || 'Z'
  WHEN substr("periodStart", 5, 1) = '-'
       AND substr("periodStart", 8, 1) = '-'
       AND substr("periodStart", 11, 1) = 'T'
       AND substr("periodStart", 14, 1) = ':'
       AND substr("periodStart", 17, 1) = ':'
       AND NOT (substr("periodStart", -6, 1) IN ('+', '-') AND substr("periodStart", -3, 1) = ':')
    THEN "periodStart" || 'Z'
  ELSE "periodStart"
END
WHERE "periodStart" IS NOT NULL
  AND typeof("periodStart") = 'text';

UPDATE "TrafficUsage"
SET "periodEnd" = CASE
  WHEN substr(rtrim("periodEnd", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("periodEnd", 'Z'), -3, 1) = ':'
       AND length(rtrim("periodEnd", 'Z')) >= 25
    THEN rtrim("periodEnd", 'Z')
  WHEN substr("periodEnd", -1) = 'Z'
    THEN rtrim("periodEnd", 'Z') || 'Z'
  WHEN substr("periodEnd", 5, 1) = '-'
       AND substr("periodEnd", 8, 1) = '-'
       AND substr("periodEnd", 11, 1) = 'T'
       AND substr("periodEnd", 14, 1) = ':'
       AND substr("periodEnd", 17, 1) = ':'
       AND NOT (substr("periodEnd", -6, 1) IN ('+', '-') AND substr("periodEnd", -3, 1) = ':')
    THEN "periodEnd" || 'Z'
  ELSE "periodEnd"
END
WHERE "periodEnd" IS NOT NULL
  AND typeof("periodEnd") = 'text';

UPDATE "TrafficUsage"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "TrafficUsage"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';

UPDATE "TrafficPurchase"
SET "periodStart" = CASE
  WHEN substr(rtrim("periodStart", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("periodStart", 'Z'), -3, 1) = ':'
       AND length(rtrim("periodStart", 'Z')) >= 25
    THEN rtrim("periodStart", 'Z')
  WHEN substr("periodStart", -1) = 'Z'
    THEN rtrim("periodStart", 'Z') || 'Z'
  WHEN substr("periodStart", 5, 1) = '-'
       AND substr("periodStart", 8, 1) = '-'
       AND substr("periodStart", 11, 1) = 'T'
       AND substr("periodStart", 14, 1) = ':'
       AND substr("periodStart", 17, 1) = ':'
       AND NOT (substr("periodStart", -6, 1) IN ('+', '-') AND substr("periodStart", -3, 1) = ':')
    THEN "periodStart" || 'Z'
  ELSE "periodStart"
END
WHERE "periodStart" IS NOT NULL
  AND typeof("periodStart") = 'text';

UPDATE "TrafficPurchase"
SET "periodEnd" = CASE
  WHEN substr(rtrim("periodEnd", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("periodEnd", 'Z'), -3, 1) = ':'
       AND length(rtrim("periodEnd", 'Z')) >= 25
    THEN rtrim("periodEnd", 'Z')
  WHEN substr("periodEnd", -1) = 'Z'
    THEN rtrim("periodEnd", 'Z') || 'Z'
  WHEN substr("periodEnd", 5, 1) = '-'
       AND substr("periodEnd", 8, 1) = '-'
       AND substr("periodEnd", 11, 1) = 'T'
       AND substr("periodEnd", 14, 1) = ':'
       AND substr("periodEnd", 17, 1) = ':'
       AND NOT (substr("periodEnd", -6, 1) IN ('+', '-') AND substr("periodEnd", -3, 1) = ':')
    THEN "periodEnd" || 'Z'
  ELSE "periodEnd"
END
WHERE "periodEnd" IS NOT NULL
  AND typeof("periodEnd") = 'text';

UPDATE "TrafficPurchase"
SET "requestedAt" = CASE
  WHEN substr(rtrim("requestedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("requestedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("requestedAt", 'Z')) >= 25
    THEN rtrim("requestedAt", 'Z')
  WHEN substr("requestedAt", -1) = 'Z'
    THEN rtrim("requestedAt", 'Z') || 'Z'
  WHEN substr("requestedAt", 5, 1) = '-'
       AND substr("requestedAt", 8, 1) = '-'
       AND substr("requestedAt", 11, 1) = 'T'
       AND substr("requestedAt", 14, 1) = ':'
       AND substr("requestedAt", 17, 1) = ':'
       AND NOT (substr("requestedAt", -6, 1) IN ('+', '-') AND substr("requestedAt", -3, 1) = ':')
    THEN "requestedAt" || 'Z'
  ELSE "requestedAt"
END
WHERE "requestedAt" IS NOT NULL
  AND typeof("requestedAt") = 'text';

UPDATE "TrafficPurchase"
SET "approvedAt" = CASE
  WHEN substr(rtrim("approvedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("approvedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("approvedAt", 'Z')) >= 25
    THEN rtrim("approvedAt", 'Z')
  WHEN substr("approvedAt", -1) = 'Z'
    THEN rtrim("approvedAt", 'Z') || 'Z'
  WHEN substr("approvedAt", 5, 1) = '-'
       AND substr("approvedAt", 8, 1) = '-'
       AND substr("approvedAt", 11, 1) = 'T'
       AND substr("approvedAt", 14, 1) = ':'
       AND substr("approvedAt", 17, 1) = ':'
       AND NOT (substr("approvedAt", -6, 1) IN ('+', '-') AND substr("approvedAt", -3, 1) = ':')
    THEN "approvedAt" || 'Z'
  ELSE "approvedAt"
END
WHERE "approvedAt" IS NOT NULL
  AND typeof("approvedAt") = 'text';

UPDATE "TrafficPurchase"
SET "rejectedAt" = CASE
  WHEN substr(rtrim("rejectedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("rejectedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("rejectedAt", 'Z')) >= 25
    THEN rtrim("rejectedAt", 'Z')
  WHEN substr("rejectedAt", -1) = 'Z'
    THEN rtrim("rejectedAt", 'Z') || 'Z'
  WHEN substr("rejectedAt", 5, 1) = '-'
       AND substr("rejectedAt", 8, 1) = '-'
       AND substr("rejectedAt", 11, 1) = 'T'
       AND substr("rejectedAt", 14, 1) = ':'
       AND substr("rejectedAt", 17, 1) = ':'
       AND NOT (substr("rejectedAt", -6, 1) IN ('+', '-') AND substr("rejectedAt", -3, 1) = ':')
    THEN "rejectedAt" || 'Z'
  ELSE "rejectedAt"
END
WHERE "rejectedAt" IS NOT NULL
  AND typeof("rejectedAt") = 'text';

UPDATE "PublishJob"
SET "requestedAt" = CASE
  WHEN substr(rtrim("requestedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("requestedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("requestedAt", 'Z')) >= 25
    THEN rtrim("requestedAt", 'Z')
  WHEN substr("requestedAt", -1) = 'Z'
    THEN rtrim("requestedAt", 'Z') || 'Z'
  WHEN substr("requestedAt", 5, 1) = '-'
       AND substr("requestedAt", 8, 1) = '-'
       AND substr("requestedAt", 11, 1) = 'T'
       AND substr("requestedAt", 14, 1) = ':'
       AND substr("requestedAt", 17, 1) = ':'
       AND NOT (substr("requestedAt", -6, 1) IN ('+', '-') AND substr("requestedAt", -3, 1) = ':')
    THEN "requestedAt" || 'Z'
  ELSE "requestedAt"
END
WHERE "requestedAt" IS NOT NULL
  AND typeof("requestedAt") = 'text';

UPDATE "PublishJob"
SET "startedAt" = CASE
  WHEN substr(rtrim("startedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("startedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("startedAt", 'Z')) >= 25
    THEN rtrim("startedAt", 'Z')
  WHEN substr("startedAt", -1) = 'Z'
    THEN rtrim("startedAt", 'Z') || 'Z'
  WHEN substr("startedAt", 5, 1) = '-'
       AND substr("startedAt", 8, 1) = '-'
       AND substr("startedAt", 11, 1) = 'T'
       AND substr("startedAt", 14, 1) = ':'
       AND substr("startedAt", 17, 1) = ':'
       AND NOT (substr("startedAt", -6, 1) IN ('+', '-') AND substr("startedAt", -3, 1) = ':')
    THEN "startedAt" || 'Z'
  ELSE "startedAt"
END
WHERE "startedAt" IS NOT NULL
  AND typeof("startedAt") = 'text';

UPDATE "PublishJob"
SET "finishedAt" = CASE
  WHEN substr(rtrim("finishedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("finishedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("finishedAt", 'Z')) >= 25
    THEN rtrim("finishedAt", 'Z')
  WHEN substr("finishedAt", -1) = 'Z'
    THEN rtrim("finishedAt", 'Z') || 'Z'
  WHEN substr("finishedAt", 5, 1) = '-'
       AND substr("finishedAt", 8, 1) = '-'
       AND substr("finishedAt", 11, 1) = 'T'
       AND substr("finishedAt", 14, 1) = ':'
       AND substr("finishedAt", 17, 1) = ':'
       AND NOT (substr("finishedAt", -6, 1) IN ('+', '-') AND substr("finishedAt", -3, 1) = ':')
    THEN "finishedAt" || 'Z'
  ELSE "finishedAt"
END
WHERE "finishedAt" IS NOT NULL
  AND typeof("finishedAt") = 'text';

UPDATE "PublishLog"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "AnalyticsEvent"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "AuditLog"
SET "createdAt" = CASE
  WHEN substr(rtrim("createdAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("createdAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("createdAt", 'Z')) >= 25
    THEN rtrim("createdAt", 'Z')
  WHEN substr("createdAt", -1) = 'Z'
    THEN rtrim("createdAt", 'Z') || 'Z'
  WHEN substr("createdAt", 5, 1) = '-'
       AND substr("createdAt", 8, 1) = '-'
       AND substr("createdAt", 11, 1) = 'T'
       AND substr("createdAt", 14, 1) = ':'
       AND substr("createdAt", 17, 1) = ':'
       AND NOT (substr("createdAt", -6, 1) IN ('+', '-') AND substr("createdAt", -3, 1) = ':')
    THEN "createdAt" || 'Z'
  ELSE "createdAt"
END
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text';

UPDATE "PlatformSetting"
SET "updatedAt" = CASE
  WHEN substr(rtrim("updatedAt", 'Z'), -6, 1) IN ('+', '-')
       AND substr(rtrim("updatedAt", 'Z'), -3, 1) = ':'
       AND length(rtrim("updatedAt", 'Z')) >= 25
    THEN rtrim("updatedAt", 'Z')
  WHEN substr("updatedAt", -1) = 'Z'
    THEN rtrim("updatedAt", 'Z') || 'Z'
  WHEN substr("updatedAt", 5, 1) = '-'
       AND substr("updatedAt", 8, 1) = '-'
       AND substr("updatedAt", 11, 1) = 'T'
       AND substr("updatedAt", 14, 1) = ':'
       AND substr("updatedAt", 17, 1) = ':'
       AND NOT (substr("updatedAt", -6, 1) IN ('+', '-') AND substr("updatedAt", -3, 1) = ':')
    THEN "updatedAt" || 'Z'
  ELSE "updatedAt"
END
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text';
