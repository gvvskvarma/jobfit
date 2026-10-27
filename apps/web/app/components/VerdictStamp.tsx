import type { ScreeningReport } from "@jobfit/shared";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { Cursor } from "~/components/terminal";

const VERDICT: Record<
  ScreeningReport["verdict"],
  { word: string; className: string }
> = {
  apply: {
    word: "APPLY",
    className: "bg-approval shadow-[0_10px_34px_-12px_var(--approval)]",
  },
  apply_with_caution: {
    word: "APPLY WITH CAUTION",
    className: "bg-caution shadow-[0_10px_34px_-12px_var(--caution)]",
  },
  skip: {
    word: "SKIP",
    className: "bg-denial shadow-[0_10px_34px_-12px_var(--denial)]",
  },
};

/** The verdict types itself out once, like terminal output; the rest of the report follows it. */
export function VerdictStamp({
  verdict,
}: {
  verdict: ScreeningReport["verdict"];
}) {
  const still = useReducedMotion();
  const { word, className } = VERDICT[verdict];
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (still || typed >= word.length) return;
    const id = setTimeout(() => setTyped((n) => n + 1), 45);
    return () => clearTimeout(id);
  }, [still, typed, word]);
  const shown = still ? word.length : Math.min(typed, word.length);

  return (
    <p role="status" className="flex items-center gap-1 text-2xl font-bold">
      <span className="sr-only">Verdict: {word.toLowerCase()}</span>
      <span
        aria-hidden
        className={`rounded-[3px] px-2.5 py-0.5 tracking-wide text-paper ${className}`}
      >
        {word.slice(0, shown)}
        <span className="invisible">{word.slice(shown)}</span>
      </span>
      <Cursor />
    </p>
  );
}
