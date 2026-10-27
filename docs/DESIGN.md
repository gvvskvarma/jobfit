# JobFit design plan

Status: **approved by the owner** (2026-10-27). This replaces the 2026-10-26 "immigration paperwork" plan; the owner asked for a terminal-session look that is still colorful, animated and premium ("like baggy jeans back in fashion").

## Brief

- **Subject:** deciding whether a job posting can work with a US work visa, and applying honestly.
- **Audience:** software engineers on H-1B, OPT or STEM OPT. They live in terminals, are short on time (a layoff starts a 60-day clock), and are wary of tools that overpromise.
- **Primary job:** give a verdict they can trust in seconds, and show the exact sentence and the public record behind it.

The material is the modern, color-rich terminal: the window, the prompt, box-drawn panes, inverse-video status blocks and keyboard hints. Retro structure, current polish: a gradient spectrum, soft depth and motion that answers what the user does.

## Color

| Name | Light | Dark | Role |
|---|---|---|---|
| Desk | `#F3F1FB` + aurora | `#0A0912` + aurora | Behind the window. Three soft radial glows (violet, pink, cyan). |
| Paper | `#FFFFFF` | `#13121D` | The terminal window. |
| Ink | `#1B1A2E` | `#ECEAF6` | Text. |
| Muted | `#5F5D75` | `#9C99B3` | Dim status lines, hints, labels. |
| Rule | `#E3E0F0` | `#2D2B40` | Pane borders, table rules. |
| Select | `#F1EFFC` | `#252338` | The hovered-row bar. Only ink or muted text sits on it. |
| Violet (accent) | `#6A45F5` | `#A18BFF` | Links, focus, cursor. |
| Pink | `#C42B72` | `#FF6FAE` | The prompt glyph `›` and title bullets. |
| Cyan | `#087389` | `#56D4EA` | Third stop of the spectrum. |
| Approval / Caution / Denial | `#0F7A57` / `#8F5B00` / `#C92339` | `#47D6A2` / `#F5B83D` / `#FF6378` | Verdicts and flag glyphs. |
| Highlighter | `#FFE58F` | `#5A4700` | Quoted evidence in the posting. |

**Spectrum:** violet → pink → cyan, blended in OKLCH. It's used in three places only: the wordmark, the active tab and the primary button.

**Chart series** are unchanged (`#00897B` / `#3D4FB8` light, `#26A69A` / `#7B7BFF` dark) and re-validated against the new window colors with the dataviz skill's `validate_palette.js`: all checks pass in both modes. Every text color meets WCAG AA (4.5:1) on Paper.

Verdicts never rely on color alone: each has its own word and its flags have their own glyph (`✗ ! · ✓`) and label.

## Type

- **IBM Plex Mono** for everything, at a 15px base with a 1.2 ratio. Monospace reads large, so the scale is gentler than a sans would need.
- **Plex Mono italic** marks text quoted from a job posting or email: italic is the employer's words, upright is JobFit's analysis.
- Measure is capped at 80 characters.

## Layout

Every page lives in one terminal window: traffic-light dots, a title like `jobfit — ~/screen`, then a tab row (`← ◼ Screen ◻ Sponsors ◻ Employers →`) where the active tab is a spectrum block. The footer is the disclaimer and the data sources.

**Home:** the pixel wordmark, one line saying what JobFit does, then the prompt pane (`› paste the job posting▌`), job link and status fields, the buttons and keyboard hints (`⌘↵ to screen · Esc to clear`). Recent jobs are rows that take the select bar and a `›` on hover, with an inverse verdict tag.

**Report (`/jobs/:id`):**

```
● Senior Frontend Engineer
✻ Rilian Technologies · Remote · screened Oct 27, 2026
[◼ Open the posting to apply ↗]

┌ posting, flagged lines highlighted ─┐  ┌ verdict ────────────┐
│ ...                                 │  │ ▐SKIP▌ ▌             │
│ ▓▓This position requires ITAR▓▓     │  │ summary              │
│ ...                                 │  │ ✗ Rules you out      │
└─────────────────────────────────────┘  │   explanation        │
                                         │   │ "quote"          │
┌ Rilian Technologies's h-1b record ──┐  │   ⎿ found by a rule  │
└─────────────────────────────────────┘  └──────────────────────┘
```

On mobile the verdict pane comes first. Hovering or focusing a flag rings its sentence in the posting.

**Surfaces:** box-drawn panes with the title in the top border. Radius follows hierarchy: 2–3px for fields and tags, 4px for panes, 12px for the window. The only shadows are the window floating over the desk, the primary button and the verdict glow.

## Motion

1. **Wordmark power-on:** the pixels light up left to right once on load.
2. **The report prints (the signature):** the verdict types itself out, then the summary and each flag appear line by line, ending on a blinking cursor. Plays once per report.
3. **Working spinner:** while a job is screened, a braille spinner runs and the status line names the screening steps.
4. Rows take the select bar on hover; the primary button's gradient slides on hover.
5. Charts draw once when they scroll into view. Navigating from a report to an employer page morphs the employer name with a View Transition.

With `prefers-reduced-motion`, all of it becomes an instant change.

## Writing

Plain verbs, sentence case, the user's vocabulary: "sponsorship", not "SPONSORSHIP_OFFERED". Buttons say what they do ("Screen this job", "Open the posting to apply"). Errors say what happened and what to do next, without apologizing. Pane titles are lowercase like terminal labels; everything else is sentence case. The only all-caps text is the verdict block.

## Review against generic defaults (frontend-design skill)

The owner's brief explicitly asks for a terminal look, so monospace labels and `·` meta strings are deliberate here. The skill says the brief wins. The rest was checked:

| Default to avoid | Check |
|---|---|
| Near-black with one acid accent | Dark mode is a violet-black with a three-color spectrum and semantic verdict colors. |
| SaaS card kit, identical soft shadows | Panes are bordered, not shadowed; shadow marks only the window, the primary action and the verdict. |
| Gradient washes as decoration | The spectrum appears in exactly three places, each the most important element of its area. |
| `→` appended to buttons | Arrows appear only in the tab row (as in real TUIs) and `↗` on the one external link. |

## Components

Behavior comes from native elements (`<select>`, `<dialog>` later) and Clerk's components. Shared styles live in `apps/web/app/components/ui.tsx` (`button`, `quietButton`, `field`, `Panel`, `Meta`, `Hints`, `VerdictTag`) and `terminal.tsx` (`Wordmark`, `Working`, `Cursor`).
