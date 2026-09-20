export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SELLER: "SELLER",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PRODUCT_VISIBILITY = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  HIDDEN: "HIDDEN",
} as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITY)[keyof typeof PRODUCT_VISIBILITY];

export const PUBLISH_JOB_STATUS = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;
export type PublishJobStatus = (typeof PUBLISH_JOB_STATUS)[keyof typeof PUBLISH_JOB_STATUS];

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const DIMENSION_UNITS = { MM: "MM", CM: "CM", M: "M" } as const;
export type DimensionUnit = (typeof DIMENSION_UNITS)[keyof typeof DIMENSION_UNITS];

export const ANALYTICS_EVENT_TYPES = {
  PRODUCT_VIEW: "PRODUCT_VIEW",
  PRODUCT_DETAIL_VIEW: "PRODUCT_DETAIL_VIEW",
  VIEWER_3D_OPEN: "VIEWER_3D_OPEN",
  AR_LAUNCH: "AR_LAUNCH",
  SELLER_PAGE_VIEW: "SELLER_PAGE_VIEW",
  SEARCH: "SEARCH",
} as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];

export function isRole(value: string): value is Role {
  return Object.values(ROLES).includes(value as Role);
}
