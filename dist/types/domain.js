"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYTICS_EVENT_TYPES = exports.DIMENSION_UNITS = exports.SUBSCRIPTION_STATUS = exports.PUBLISH_JOB_STATUS = exports.PRODUCT_VISIBILITY = exports.ROLES = void 0;
exports.isRole = isRole;
exports.ROLES = {
    SUPER_ADMIN: "SUPER_ADMIN",
    ADMIN: "ADMIN",
    SELLER: "SELLER",
};
exports.PRODUCT_VISIBILITY = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    HIDDEN: "HIDDEN",
};
exports.PUBLISH_JOB_STATUS = {
    QUEUED: "QUEUED",
    PROCESSING: "PROCESSING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
};
exports.SUBSCRIPTION_STATUS = {
    ACTIVE: "ACTIVE",
    EXPIRED: "EXPIRED",
    PENDING: "PENDING",
    CANCELLED: "CANCELLED",
};
exports.DIMENSION_UNITS = { MM: "MM", CM: "CM", M: "M" };
exports.ANALYTICS_EVENT_TYPES = {
    PRODUCT_VIEW: "PRODUCT_VIEW",
    PRODUCT_DETAIL_VIEW: "PRODUCT_DETAIL_VIEW",
    VIEWER_3D_OPEN: "VIEWER_3D_OPEN",
    AR_LAUNCH: "AR_LAUNCH",
    SELLER_PAGE_VIEW: "SELLER_PAGE_VIEW",
    SEARCH: "SEARCH",
};
function isRole(value) {
    return Object.values(exports.ROLES).includes(value);
}
//# sourceMappingURL=domain.js.map