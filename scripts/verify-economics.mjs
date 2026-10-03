const COST_PER_GB = 23400;
const FIXED = 83200;
const PLAN_MARGIN = 0.20;
const BUNDLE_MARGIN = 0.25;

const tiers = [
  ["Starter", 5, 1290000, 10, 500],
  ["Semi-Professional", 12, 2490000, 30, 1536],
  ["Professional", 25, 4490000, 100, 5120],
];
const termDefs = [
  ["ماهانه", 30, 1, 0],
  ["۳ ماهه", 90, 3, 5],
  ["۶ ماهه", 180, 6, 10],
  ["۱۲ ماهه", 365, 12, 15],
];
const bundles = [
  ["1GB", 1, 59000],
  ["5GB", 5, 279000],
  ["10GB", 10, 499000],
  ["25GB", 25, 1199000],
];

function roundMoney(value) { return Math.round(value); }
function monthsCovered(durationDays) { return Math.max(1, Math.ceil(durationDays / 30)); }
function planFloor(gb, durationDays) {
  const months = monthsCovered(durationDays);
  return Math.ceil((gb * COST_PER_GB + FIXED) * months * (1 + PLAN_MARGIN));
}

const plans = [];
for (const [name, trafficGb, monthlyPrice, productLimit, storageLimitMb] of tiers) {
  for (const [term, durationDays, months, discountPct] of termDefs) {
    const expectedPrice = roundMoney(monthlyPrice * months * (1 - discountPct / 100));
    const actualFloor = planFloor(trafficGb, durationDays);
    if (expectedPrice < actualFloor) {
      throw new Error(`${name} ${term}: price ${expectedPrice} is below protective floor ${actualFloor}`);
    }
    plans.push({ name, term, durationDays, monthsCharged: months, trafficGb, productLimit, storageLimitMb, discountPct, price: expectedPrice, protectiveFloor: actualFloor, monthlyBreakEvenTrafficRate: roundMoney((expectedPrice - FIXED * months) / (trafficGb * months)) });
  }
}

for (const [name, gb, price] of bundles) {
  const floor = Math.ceil(gb * COST_PER_GB * (1 + BUNDLE_MARGIN));
  if (price < floor) throw new Error(`${name}: price ${price} is below protective floor ${floor}`);
}

console.log("Economics check: PASS");
console.log(JSON.stringify({
  plans,
  bundles: bundles.map(([name, gb, price]) => ({ name, gigabytes: gb, price, protectiveFloor: Math.ceil(gb * COST_PER_GB * (1 + BUNDLE_MARGIN)), breakEvenTrafficRate: roundMoney(price / gb) })),
  assumptions: { COST_PER_GB, FIXED, PLAN_MARGIN, BUNDLE_MARGIN, gbDefinition: "1 GiB = 1024^3 bytes", note: "These are configurable planning assumptions, not provider invoices." },
}, null, 2));
