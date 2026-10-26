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
