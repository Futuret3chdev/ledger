/** Launch window ends 30 September 2026, 23:59:59 Melbourne (AEST). */
export const OFFER_END = Date.parse('2026-09-30T23:59:59+10:00');

export function offerParts(now = Date.now()) {
  const left = Math.max(0, OFFER_END - now);
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return { days, hours, mins, secs, ended: left === 0 };
}

export function pad(n) {
  return String(n).padStart(2, '0');
}
