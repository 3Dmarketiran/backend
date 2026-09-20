import type { DimensionUnit } from "../types/domain";

/**
 * Normalizes any seller-entered dimension into millimeters — the single
 * internal unit of truth (spec section 13: "Convert dimensions internally
 * into a standard measurement system").
 *
 * Millimeters are chosen as the base unit because they let every supported
 * input unit (mm/cm/m) convert via a whole-number multiplier with no
 * floating point drift for typical furniture/product scale values.
 */
export function toMillimeters(value: number, unit: DimensionUnit): number {
  switch (unit) {
    case "MM":
      return value;
    case "CM":
      return value * 10;
    case "M":
      return value * 1000;
    default:
      throw new Error(`Unsupported dimension unit: ${unit}`);
  }
}

export function fromMillimeters(valueMm: number, targetUnit: DimensionUnit): number {
  switch (targetUnit) {
    case "MM":
      return valueMm;
    case "CM":
      return valueMm / 10;
    case "M":
      return valueMm / 1000;
    default:
      throw new Error(`Unsupported dimension unit: ${targetUnit}`);
  }
}

/**
 * Converts millimeters to meters specifically for embedding in AR scene
 * configuration (glTF/USDZ real-world scale expects meters), per spec
 * section 13/14. Rounded to 4 decimal places (sub-millimeter precision is
 * not meaningful for physical product AR placement).
 */
export function millimetersToMeters(valueMm: number): number {
  return Math.round((valueMm / 1000) * 10000) / 10000;
}
