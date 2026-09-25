"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeJson = serializeJson;
exports.parseJson = parseJson;
function serializeJson(value) {
    if (value === undefined || value === null)
        return null;
    return JSON.stringify(value);
}
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=json.js.map