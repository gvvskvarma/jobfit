import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { formatCount, fyLabel, isPartial } from "~/lib/format";
import type { YearStats } from "~/lib/employers.server";

const SERIES = [
  {
    key: "lcaCertified",
    label: "Certified H-1B filings",
    color: "var(--chart-certified)",
  },
  {
    key: "transfers",
    label: "Transfers from another employer",
    color: "var(--chart-transfers)",
  },
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-sheet)] border border-rule bg-sheet px-3 py-2 text-sm shadow-none">
      <p className="font-semibold">{label}</p>
      {SERIES.map((s) => {
        const value = payload.find((p) => p.dataKey === s.key)?.value;
        return (
          <p key={s.key} className="tabular flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}: {value === undefined ? "–" : formatCount(Number(value))}
          </p>
        );
      })}
    </div>
  );
}

/** Filings and transfers per fiscal year on one count axis (never two scales). */
export function FilingsChart({ years }: { years: YearStats[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // The chart is always drawn; coming into view (just before it's visible) replays the
  // draw-in once. If the observer never fires, the reader still gets the finished chart.
  const seen = useInView(ref, { once: true, margin: "200px 0px" });
  const animate = !useReducedMotion() && seen;

  return (
    <figure>
      <ul
        className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"
        aria-label="Legend"
      >
        {SERIES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                i === 0
                  ? "inline-block h-3 w-2.5 rounded-t-[2px]"
                  : "inline-block h-0.5 w-4"
              }
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={ref} className="h-64 w-full" aria-hidden>
        <ResponsiveContainer key={seen ? "seen" : "idle"}>
          <ComposedChart
            data={years.map((y) => ({ ...y, label: fyLabel(y) }))}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="label"
              tickFormatter={(l: string) => l.replace(/ \(.*/, "*")}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              tick={{ fill: "var(--ink-muted)", fontSize: 13 }}
            />
            <YAxis
              width={48}
              tickFormatter={(n: number) =>
                new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                  n,
                )
              }
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-muted)", fontSize: 13 }}
            />
            <Tooltip
              content={ChartTooltip}
              cursor={{ fill: "var(--grid)", opacity: 0.5 }}
            />
            <Bar
              dataKey="lcaCertified"
              fill="var(--chart-certified)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={animate}
            >
              {/* A partial year is drawn faded so its shorter bar isn't read as a drop. */}
              {years.map((y) => (
                <Cell key={y.fiscalYear} fillOpacity={isPartial(y) ? 0.4 : 1} />
              ))}
            </Bar>
            <Line
              dataKey="transfers"
              stroke="var(--chart-transfers)"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "var(--chart-transfers)",
                stroke: "var(--sheet)",
                strokeWidth: 2,
              }}
              isAnimationActive={animate}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {years.some(isPartial) && (
        <figcaption className="mt-2 text-xs text-ink-muted">
          * {years.filter(isPartial).map(fyLabel).join(", ")}: a partial year,
          so its counts are lower than a full year&apos;s.
        </figcaption>
      )}
    </figure>
  );
}
