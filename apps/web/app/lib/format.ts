const count = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

export const formatCount = (n: number) => count.format(n);
export const formatUsd = (n: number) => usd.format(n);
export const formatUsdCompact = (n: number) => usdCompact.format(n);

/** "senior software engineer" -> "Senior software engineer" (sentence case). */
export const bucketLabel = (bucket: string) =>
  bucket.charAt(0).toUpperCase() + bucket.slice(1);

/** "1 transfer", "3 transfers". */
export const plural = (n: number, word: string) =>
  `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A fiscal year runs Oct 1 to Sept 30; DOL's current-year file stops partway. */
export const isPartial = (y: {
  fiscalYear: number;
  coveredThrough: string | null;
}) => y.coveredThrough !== null && y.coveredThrough < `${y.fiscalYear}-09-30`;

/** "FY2025", or "FY2026 (Oct 2025 to Jun 2026)" for a partial year. */
export const fyLabel = (y: {
  fiscalYear: number;
  coveredThrough: string | null;
}) =>
  isPartial(y)
    ? `FY${y.fiscalYear} (Oct ${y.fiscalYear - 1} to ${monthYear.format(new Date(`${y.coveredThrough}T00:00:00Z`))})`
    : `FY${y.fiscalYear}`;
