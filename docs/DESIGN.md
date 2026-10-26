# JobFit design plan

Status: **draft, awaiting owner sign-off** (SPEC §11). Pages are built only after sign-off.

## Brief

- **Subject:** deciding whether a job posting can work with a US work visa, and applying honestly.
- **Audience:** software engineers on H-1B, OPT or STEM OPT. Data-literate, short on time (a layoff starts a 60-day clock), and wary of tools that overpromise.
- **Primary job:** give a verdict they can trust in seconds, and show the exact sentence and the public record behind it.

The visual material comes from the world these users already live in: immigration paperwork. That means approval notices, rubber stamps on forms, security-printed paper and a highlighter run over the one sentence that matters. We borrow the materials, not the bureaucracy. The pages should feel like a sharp friend's annotated copy of the paperwork, not a government portal.

## Color

| Name | Light | Dark | Role |
|---|---|---|---|
| Paper | `#EEF2EF` | `#121B26` | Page background. Cool security-paper gray-green, not cream. |
| Ink | `#1C2A3A` | `#E4EAE6` | Text and primary chart marks. Blue-black ballpoint ink, never pure black. |
| Guilloche | `#2F7F7A` | `#5FB3AC` | Structure: rules, focus rings, chart lines, links. |
| Approval | `#3D4FB8` | `#8F9BFF` | The "Apply" stamp, positive flags, the transfers line. |
| Denial | `#A8324A` | `#F07A90` | The "Skip" stamp and blocking flags. |
| Highlighter | `#F2DC6B` | `#6B5A12` | Quoted evidence in the posting, and the "Apply with caution" stamp. |

Verdicts never rely on color alone: each stamp has its own word and a distinct outline (solid, dashed, double), so the three read in grayscale and for color-blind users. All text pairs meet WCAG AA, checked with the dataviz skill's validator when the tokens are coded.

## Type

- **Libre Franklin** carries the interface: headings, labels, numbers and body. Franklin Gothic is the face of American forms and signage, so it fits the subject without looking like a government site. It uses tabular figures in every table and chart.
- **Source Serif 4, italic** is used only for text quoted from a job posting or email. This encodes meaning: serif italic is the employer's words, and sans is JobFit's analysis. It's never used for headings.
- The type scale follows *The Elements of Typographic Style*: a 16px base, a 1.25 ratio (16 / 20 / 25 / 31 / 39 / 49), body line-height 1.5 (1.6 for serif quotes) and body measure capped at 70 characters.

## Layout

**Screening report (`/jobs/:id`)**: the core page. The posting and the verdict sit side by side, and every flag is tied to the sentence it came from.

```
┌───────────────────────────────────────────────────────────────┐
│ JobFit      Screen   Discover   Tracker   Bank        [avatar]│
├──────────────────────────────────┬────────────────────────────┤
│ Senior Frontend Engineer         │   ╔═══════════════════╗    │
│ Acme Robotics · Austin, TX       │   ║   APPLY WITH      ║    │ ← stamp lands
│                                  │   ║    CAUTION        ║    │   (the one bold
│ The posting                      │   ╚═══════════════════╝    │    moment)
│ ...we build tools for            │                            │
│ ▓▓"Must be authorized to work▓▓  │  Why                       │
│ ▓▓in the US without              │  ▲ Work authorization is   │
│ ▓▓sponsorship now or in the▓▓    │    ambiguous  ──────────── │ ← hover links
│ ▓▓future."▓▓  (serif italic)     │  ● Transfers: 88 in FY2025 │   flag ⇄ sentence
│ ...                              │  ● Pays near the median    │
│                                  │                            │
├──────────────────────────────────┴────────────────────────────┤
│ Acme Robotics: H-1B record                                    │
│  filings by year ▇▇ ▇▇▇ ▇▇▇▇   transfers ───╱──   PERM 312    │
│  pay for frontend in TX: p25 ── median ── p75  ◆ this posting │
├───────────────────────────────────────────────────────────────┤
│ Not legal advice. Confirm sponsorship with the employer.      │
└───────────────────────────────────────────────────────────────┘
```

Text is left-aligned throughout. On mobile the verdict stacks first, then the flags, then the posting, with each flag linking down to its sentence.

**Home (`/`)**: the opening is the tool itself: a large sheet you paste the posting onto. There's no marketing headline or stat strip. "Try a sample posting" fills in an ITAR job and runs the real report, so first-time visitors see the stamp land on "Skip".

```
┌───────────────────────────────────────────────────────────────┐
│ Check a job before you apply                                  │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Paste the job description here                           │ │
│ │                                                           │ │
│ └───────────────────────────────────────────────────────────┘ │
│ [ Screen this job ]   Try a sample posting                    │
│                                                               │
│ What gets checked: sponsorship wording · ITAR and clearance … │
└───────────────────────────────────────────────────────────────┘
```

**Discover (`/discover`)**: the filter reads as a sentence, then a dense table follows.

```
 Employers that filed H-1Bs for [frontend ▾] engineers in [Texas ▾] in [FY2025 ▾]

 Employer              Certified   Transfers   PERM   Median pay
 ───────────────────────────────────────────────────────────────
 Acme Robotics              214          88     312     $142,000
 ...
```

**Tracker**: a kanban board with columns by status and a "Due today" list above it.

**Surfaces:** pages are sheets of paper separated by tint and thin Guilloche rules, not identical rounded cards with soft shadows. Corner radius follows hierarchy: 2px for inputs and tags, 6px for sheets and none for tables. The only shadow in the product is the stamp's ink bleed.

## Motion (Motion for React + View Transitions)

1. **Verdict stamp (the signature):** the stamp drops from 115% scale and −4° to rest with a short spring (~300ms). A faint security-print pattern appears behind it, and only then do the flags settle in one by one. It plays once per report.
2. Agent steps on the tailor page appear as they stream in, and answered gap questions collapse into a one-line summary.
3. Kanban cards glide between columns using layout animation.
4. Charts draw once when they first scroll into view.
5. The visa-clock number counts to its new value when the gaps change.
6. Navigating from a report to an employer page morphs the employer name with a View Transition.

With `prefers-reduced-motion`, every one of these becomes an instant change.

## Writing

The writing uses plain verbs, sentence case and the user's vocabulary. For example, it says "sponsorship" rather than "SPONSORSHIP_OFFERED". Buttons say what they do ("Screen this job", "Save to tracker"), and the result uses the same word ("Saved to tracker"). Errors say what happened and what to do next, without apologizing. Empty states invite an action ("No applications yet. Screen a job to start tracking it.").

## Review against generic defaults (frontend-design skill)

| Default to avoid | Check |
|---|---|
| Cream background, serif display, terracotta accent | Paper is a cool gray-green, the serif is only for quotes and the reds are carmine. |
| Near-black with one acid accent | The dark mode is ink blue with the same palette. |
| Broadsheet columns, hairlines, zero radius | There are no newspaper columns. Radius varies by hierarchy and rules are used only where they separate content. |
| SaaS card kit with identical shadows | Sheets are separated by tint, and there are no drop shadows except the stamp. |
| All-caps eyebrows, `·` meta strings, mono labels, `→` buttons | The only all-caps is the stamp, which is literally a stamp. Arrows and mono labels aren't used. |

**Changes made after the review:**
- **Passport-navy primary:** I first considered it, but it's the default "trust blue" of every fintech site. I swapped it for ink plus Guilloche teal.
- **Passport-style data strip:** I dropped a machine-readable "passport line" on employer pages. It was a second bold element competing with the stamp. One memorable thing is enough.
- **Middle-dot meta lines:** the posting header ("Acme Robotics · Austin, TX") still uses one. I'll keep it only where it mirrors how job boards display that line, and nowhere else.

## Components

shadcn/ui (Radix primitives) supplies behavior only: dialog, popover, select, tabs and toast. All of its default styles are replaced by the tokens above.
