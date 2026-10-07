const cases = [
  ["2026-09-20T22:15:01.669", "2026-09-20T22:15:01.669Z"],
  ["2026-10-14T17:10:25.092Z", "2026-10-14T17:10:25.092Z"],
  ["2026-10-14T17:10:25.092ZZZ", "2026-10-14T17:10:25.092Z"],
  ["2026-10-14T17:10:25.092+00:00", "2026-10-14T17:10:25.092+00:00"],
  ["2026-10-14T17:10:25.092+00:00ZZZ", "2026-10-14T17:10:25.092+00:00"],
  ["2026-10-14T17:10:25.092+03:30ZZ", "2026-10-14T17:10:25.092+03:30"],
];

function normalize(value) {
  const stripped = value.replace(/Z+$/, "");
  if (/[+-]\d{2}:\d{2}$/.test(stripped)) return stripped;
  if (/Z$/.test(value)) return stripped + "Z";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return value + "Z";
  return value;
}

for (const [input, expected] of cases) {
  const actual = normalize(input);
  if (actual !== expected) {
    throw new Error(`normalize(${input}) => ${actual}; expected ${expected}`);
  }
}
console.log(`DateTime repair verification passed for ${cases.length} cases.`);
