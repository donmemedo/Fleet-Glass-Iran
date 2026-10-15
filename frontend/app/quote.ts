// Prices in million Toman, from the business plan (pricing section).
export const PRICES = { inspection: 0.25, repair: 1.8, replace: 12 };

/** Yearly glass cost for a fleet, without and with two checks a year. Runs in the browser, so the sliders answer instantly. */
export function quote(vehicles: number, crackRate: number) {
  const cracked = (vehicles * crackRate) / 100;
  // Without checks most small cracks grow into replacements; with checks ~80% are caught while still repairable.
  const without = cracked * 0.7 * PRICES.replace + cracked * 0.3 * PRICES.repair;
  const caught = cracked * 0.8;
  const withChecks = caught * PRICES.repair + (cracked - caught) * PRICES.replace + vehicles * PRICES.inspection * 2;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { cracked: Math.round(cracked), without: r1(without), with: r1(withChecks), saved: r1(Math.max(without - withChecks, 0)), downtimeDays: Math.round(caught * 1.5) };
}
