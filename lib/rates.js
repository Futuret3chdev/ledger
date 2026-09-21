/** ATO cents per km. 2026–27 is 91c from 1 July 2026. 2024–25 and 2025–26 are 88c. */
export function kmRateCents(isoDate) {
  if (isoDate >= '2026-07-01') return 91;
  if (isoDate >= '2024-07-01') return 88;
  if (isoDate >= '2023-07-01') return 85;
  return 78;
}

export const KM_CAP = 5000;

/** Super guarantee is 12% from 1 July 2025. This is the rate, not a payment to a fund. */
export function superPercent(isoDate) {
  if (isoDate >= '2025-07-01') return 12;
  if (isoDate >= '2024-07-01') return 11.5;
  if (isoDate >= '2023-07-01') return 11;
  return 10.5;
}

/**
 * Cents-per-km claim. Trips are applied in date order until 5,000 km.
 * Each trip uses the rate for the day it happened.
 */
export function mileageClaim(trips) {
  const ordered = trips.slice().sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  let used = 0;
  let cents = 0;
  const lines = [];
  for (const trip of ordered) {
    const room = Math.max(0, KM_CAP - used);
    const counted = Math.min(trip.kilometres, room);
    const rate = kmRateCents(trip.occurredOn);
    const amount = counted * rate;
    used += counted;
    cents += amount;
    lines.push({ ...trip, counted, rate, amountCents: amount, capped: trip.kilometres - counted });
  }
  return { kilometres: used, cents, cap: KM_CAP, lines };
}
