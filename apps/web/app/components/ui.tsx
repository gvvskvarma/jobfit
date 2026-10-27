import type { ScreeningReport } from "@jobfit/shared";

export const button =
  "inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-spectrum bg-left px-3.5 py-1.5 font-semibold text-on-accent no-underline shadow-[0_6px_20px_-8px_var(--accent)] transition-[background-position,box-shadow] duration-500 hover:bg-right hover:shadow-[0_8px_26px_-8px_var(--pink)] disabled:cursor-progress";
export const quietButton =
  "inline-flex items-center gap-2 rounded-[var(--radius-field)] border border-rule px-3.5 py-1.5 font-semibold text-ink no-underline transition-colors hover:border-accent hover:bg-select";
export const field =
  "rounded-[var(--radius-field)] border border-rule bg-paper px-2 py-1 text-ink focus:border-accent focus:outline-none";

/** A box-drawn panel; the title sits in the top border like a terminal pane. */
export function Panel({
  title,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`relative rounded-[var(--radius-sheet)] border border-rule px-4 pb-4 pt-5 sm:px-5 ${className}`}
    >
      {title && (
        <h2 className="absolute -top-[0.7em] left-3 bg-paper px-1.5 text-sm font-semibold text-ink-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Dim meta line, like a terminal's status output. */
export function Meta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ink-muted">
      <span aria-hidden className="mr-2">
        ✻
      </span>
      {children}
    </p>
  );
}

/** Keyboard hints, separated the way terminal footers do it. */
export function Hints({ items }: { items: string[] }) {
  return (
    <p className="text-xs text-ink-muted">
      {items.map((h, i) => (
        <span key={h}>
          {i > 0 && (
            <span aria-hidden className="mx-2">
              ·
            </span>
          )}
          {h}
        </span>
      ))}
    </p>
  );
}

const TAG: Record<ScreeningReport["verdict"], [string, string]> = {
  apply: ["APPLY", "bg-approval"],
  apply_with_caution: ["CAUTION", "bg-caution"],
  skip: ["SKIP", "bg-denial"],
};

/** The verdict as an inverse-video status block, the way terminals mark state. */
export function VerdictTag({
  verdict,
}: {
  verdict: ScreeningReport["verdict"];
}) {
  const [word, bg] = TAG[verdict];
  return (
    <span
      className={`shrink-0 rounded-[2px] px-1.5 text-xs font-bold text-paper ${bg}`}
    >
      {word}
    </span>
  );
}
