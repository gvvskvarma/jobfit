import { formatUsd } from "~/lib/format";

/** p25–p75 bar with a median tick, on a scale shared by every row of the table. */
export function PayRange({
  p25,
  median,
  p75,
  min,
  max,
}: {
  p25: number;
  median: number;
  p75: number;
  min: number;
  max: number;
}) {
  const x = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <svg
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      className="h-3 w-full"
      role="img"
      aria-label={`Middle half paid ${formatUsd(p25)} to ${formatUsd(p75)}, median ${formatUsd(median)}`}
    >
      <rect x="0" y="5.5" width="100" height="1" fill="var(--grid)" />
      <rect
        x={x(p25)}
        y="2"
        width={Math.max(x(p75) - x(p25), 0.8)}
        height="8"
        rx="1"
        fill="var(--chart-certified)"
        opacity="var(--range-opacity)"
      />
      <rect
        x={x(median) - 0.4}
        y="0"
        width="0.8"
        height="12"
        fill="var(--chart-certified)"
      />
    </svg>
  );
}
