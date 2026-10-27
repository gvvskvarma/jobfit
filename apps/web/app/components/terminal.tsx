import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

// 5x7 pixel letters for J O B F I T.
const GLYPHS = [
  ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
];
const PIXELS = GLYPHS.flatMap((rows, letter) =>
  rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === "#" ? [{ x: letter * 6 + x, y }] : [])),
  ),
);

/** The wordmark as lit pixels; they power on left to right once, on load. */
export function Wordmark() {
  return (
    <svg
      role="img"
      aria-label="JobFit"
      viewBox="0 0 35.4 7.4"
      className="h-auto w-[min(100%,26rem)]"
    >
      <defs>
        <linearGradient
          id="spectrum"
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2="35"
          y1="0"
          y2="7"
        >
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="0.42" stopColor="var(--pink)" />
          <stop offset="0.74" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--cyan)" />
        </linearGradient>
      </defs>
      <g fill="var(--rule)">
        {PIXELS.map(({ x, y }) => (
          <rect
            key={`s${x}.${y}`}
            x={x + 0.28}
            y={y + 0.28}
            width="0.9"
            height="0.9"
            rx="0.14"
          />
        ))}
      </g>
      <g fill="url(#spectrum)">
        {PIXELS.map(({ x, y }) => (
          <rect
            key={`${x}.${y}`}
            className="pixel"
            style={{ animationDelay: `${x * 28 + y * 12}ms` }}
            x={x}
            y={y}
            width="0.9"
            height="0.9"
            rx="0.14"
          />
        ))}
      </g>
    </svg>
  );
}

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/** A braille spinner with a status line; the steps are the ones the screen really runs. */
export function Working({ steps }: { steps: string[] }) {
  const still = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, [still]);
  const step = steps[Math.floor(tick / 16) % steps.length];
  return (
    <p role="status" className="flex items-center gap-2 text-sm">
      <span aria-hidden className="w-3 text-pink">
        {still ? "✻" : FRAMES[tick % FRAMES.length]}
      </span>
      <span className="text-ink">{step}…</span>
    </p>
  );
}

export function Cursor() {
  return (
    <span
      aria-hidden
      className="cursor-blink ml-0.5 inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-accent"
    />
  );
}
