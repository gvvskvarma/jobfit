import type { ScreeningReport } from "@jobfit/shared";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

const STAMP: Record<
  ScreeningReport["verdict"],
  { word: string; className: string }
> = {
  apply: {
    word: "Apply",
    className: "border-4 border-approval text-approval",
  },
  apply_with_caution: {
    word: "Apply with caution",
    className: "border-4 border-dashed border-ink bg-highlighter text-ink",
  },
  skip: {
    word: "Skip",
    className: "border-[6px] border-double border-denial text-denial",
  },
};

/** A fine wave pattern, like the security print behind a visa stamp. */
function Guilloche() {
  const waves = Array.from({ length: 9 }, (_, i) => {
    const y = 8 + i * 9;
    return `M0 ${y} C 25 ${y - 7}, 50 ${y + 7}, 75 ${y} S 125 ${y - 7}, 150 ${y} S 200 ${y + 7}, 225 ${y}`;
  });
  return (
    <svg
      aria-hidden
      viewBox="0 0 225 88"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full text-guilloche opacity-25"
    >
      {waves.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
        />
      ))}
    </svg>
  );
}

/** The verdict lands once, like a rubber stamp; everything else on the page stays still. */
export function VerdictStamp({
  verdict,
}: {
  verdict: ScreeningReport["verdict"];
}) {
  const still = useReducedMotion();
  const { word, className } = STAMP[verdict];
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="relative grid min-h-28 place-items-center overflow-hidden rounded-[var(--radius-sheet)] bg-sheet p-6">
        <m.div
          className="absolute inset-0"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
        >
          <Guilloche />
        </m.div>
        <m.p
          role="status"
          className={`relative rounded-[3px] px-5 py-2 text-center text-2xl font-extrabold uppercase tracking-wide ${className}`}
          initial={still ? false : { opacity: 0, scale: 1.15, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
        >
          <span className="sr-only">Verdict: </span>
          {word}
        </m.p>
      </div>
    </LazyMotion>
  );
}
