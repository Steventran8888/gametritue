---
name: Gametritue
colors:
  # Dark game surfaces
  surface: "#0f1117"
  surface-dim: "#090c12"
  surface-bright: "#1e2435"
  surface-container-lowest: "#060810"
  surface-container-low: "#131826"
  surface-container: "#1a1f2e"
  surface-container-high: "#222840"
  surface-container-highest: "#2b3350"
  on-surface: "#e2e8f0"
  on-surface-variant: "#94a3b8"
  inverse-surface: "#e2e8f0"
  inverse-on-surface: "#1a1f2e"
  outline: "#475569"
  outline-variant: "#1e293b"
  surface-tint: "#3b4bc8"
  # Primary – Indigo
  primary: "#3b4bc8"
  on-primary: "#ffffff"
  primary-container: "#2030a0"
  on-primary-container: "#c7cdff"
  inverse-primary: "#6272e0"
  primary-fixed: "#c7cdff"
  primary-fixed-dim: "#6272e0"
  on-primary-fixed: "#000b5a"
  on-primary-fixed-variant: "#2030a0"
  # Secondary – Green
  secondary: "#3aaa35"
  on-secondary: "#ffffff"
  secondary-container: "#1b5918"
  on-secondary-container: "#96f090"
  secondary-fixed: "#b7f1b0"
  secondary-fixed-dim: "#3aaa35"
  on-secondary-fixed: "#002204"
  on-secondary-fixed-variant: "#1b5918"
  # Tertiary – Orange (accent)
  tertiary: "#f7941d"
  on-tertiary: "#ffffff"
  tertiary-container: "#7a3d00"
  on-tertiary-container: "#ffdcb4"
  tertiary-fixed: "#ffdcb4"
  tertiary-fixed-dim: "#f7941d"
  on-tertiary-fixed: "#2c1400"
  on-tertiary-fixed-variant: "#7a3d00"
  # Error
  error: "#f87171"
  on-error: "#7f1d1d"
  error-container: "#991b1b"
  on-error-container: "#fecaca"
  # Backgrounds
  background: "#0f1117"
  on-background: "#e2e8f0"
  surface-variant: "#1e293b"
  # Brand accents
  accent: "#f7941d"
  highlight: "#ffc107"
  # Sudoku level palette — 10 steps around the color wheel
  level-1: "#22c55e"
  level-2: "#a3e635"
  level-3: "#facc15"
  level-4: "#fb923c"
  level-5: "#ef4444"
  level-6: "#ec4899"
  level-7: "#d946ef"
  level-8: "#8b5cf6"
  level-9: "#3b82f6"
  level-10: "#06b6d4"
  # Light login surface (standalone override set)
  login-surface: "#f8fafc"
  login-surface-container: "#ffffff"
  login-on-surface: "#0f172a"
  login-on-surface-variant: "#475569"
  login-outline: "#cbd5e1"
typography:
  brand-display:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: -0.02em
  brand-logo:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: "600"
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: "700"
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.01em
  title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.02em
  digit-display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: "700"
    lineHeight: 44px
  mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  2xl: 2rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
  container-padding: 20px
  grid-gap: 4px
  cell-size: 52px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 24px
  button-primary-hover:
    backgroundColor: "{colors.primary-fixed-dim}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 24px
  button-secondary-hover:
    backgroundColor: "{colors.secondary-fixed-dim}"
  button-ghost:
    backgroundColor: rgba(255, 255, 255, 0.06)
    textColor: "{colors.on-surface}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 24px
  button-ghost-hover:
    backgroundColor: rgba(255, 255, 255, 0.12)
  sudoku-cell:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.digit-display}"
    rounded: "{rounded.md}"
    width: "{spacing.cell-size}"
    height: "{spacing.cell-size}"
  sudoku-cell-given:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.primary-fixed-dim}"
  sudoku-cell-selected:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  sudoku-cell-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
  sudoku-cell-hint:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-tertiary-container}"
  sudoku-cell-related:
    backgroundColor: "{colors.surface-container-high}"
  number-pad-button:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
    rounded: "{rounded.lg}"
    height: 56px
  level-badge:
    textColor: "#ffffff"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  game-panel:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  login-card:
    backgroundColor: "{colors.login-surface-container}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.xl}"
  input-field:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.xl}"
    height: 48px
    padding: 0 16px
  data-card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  violation-badge:
    textColor: "#ffffff"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 2px 8px
---

## Brand & Style

Gametritue (a portmanteau of "game" and "tư duy" — Vietnamese for "thinking") is a dual-product platform: a Sudoku puzzle game at its core, and a professional trading journal at its edge. The design system must serve both contexts without compromise: a game environment that rewards focus and immersion, and a data-dense analytical tool that earns trust.

The visual language is **Clean Dark Product**. No gradients, no glass effects — solid tonal surfaces, crisp low-opacity borders, and deliberate color reserved for state and meaning. The sole exception is the login page, which uses a light surface to feel welcoming and brand-forward before users enter the app. The result is a system that feels premium without being theatrical, and functional without being sterile.

## Colors

The palette is built around four brand tones and extended with a structured dark surface scale and a 10-stop level color wheel.

- **Primary (#3b4bc8):** The identity color. Indigo conveys intelligence, focus, and trust — fitting for both a puzzle game and a financial tool. Used for buttons, selected cell highlights, active navigation states, and primary interactive affordances throughout the app.
- **Secondary (#3aaa35):** Progress and success. The color of correctly placed digits, win screens, profit indicators in the trading journal, and positive confirmations. Its strong green hue makes positive outcomes instantly readable.
- **Accent (#f7941d):** Energy and urgency. Timer warnings in the game, FTMO challenge breach alerts in the journal, and streak-at-risk indicators. Applied sparingly so that every orange signal demands attention.
- **Highlight (#ffc107):** Reward and delight. Stars earned, achievements unlocked, personal-best markers. Used only for celebratory moments — never for navigation or status.
- **Dark surfaces:** Five-stop scale from `#060810` (deepest, under-page void) to `#2b3350` (highest floating layer). Steps are spaced ~8 lightness points apart, creating a readable tonal z-axis without requiring shadows.
- **Level colors:** Ten evenly distributed hues spanning the full color wheel — green (Level 1) through lime, yellow, orange, red, pink, fuchsia, violet, blue, and cyan (Level 10). Each hue is independently readable against all dark surface tiers.

The login page uses a separate token set (`login-surface`, `login-surface-container`, `login-on-surface`, etc.) to isolate the light-mode context without polluting the dark system.

## Typography

Gametritue uses a two-family system with sharply separated roles.

**Playfair Display** appears exclusively for brand moments: the wordmark in the app header, the logo on the login page, and hero display text on marketing surfaces. Its high-contrast serifs communicate prestige and craft, giving the platform a distinct identity in a space dominated by geometric sans-serif apps. It is never used for functional UI elements.

**Inter** handles all functional text — navigation labels, game digits, data tables, chart axes, form fields, and body copy. Its optical metrics remain crisp at 12px (chart ticks) and bold at 36px (cell digits). Letter spacing on Inter is left at default or tightened slightly for headlines.

The `digit-display` style (36px / 700 weight) is sized to fill a 52px sudoku cell with visual weight while leaving breathing room on all sides. At Level 10 difficulty, cells may show candidates in a 3×3 mini-grid; these use `label-md` to fit 9 digits within the same cell footprint.

`mono` (JetBrains Mono) is reserved for the trading journal's ticket IDs, raw price values, and CSV preview panes where monospaced alignment is functionally important.

## Layout & Spacing

All spacing derives from an 8px base unit. The sudoku grid is the structural anchor of the game: 9 cells × 52px cell-size + 8 inner gaps × 4px + 2 block-boundary strokes × 2px ≈ 480px, comfortably fitting a modern 390px mobile viewport when the outer container padding is applied at 16px.

- **Container padding:** 20px on mobile, 40px on desktop — enough to prevent content from touching edges on small screens.
- **Grid gap:** 4px between all cells; 3×3 block boundaries marked by a 2px border at `rgba(255,255,255,0.15)`.
- **Game panels** (timer, hint count, difficulty badge, number pad) use `lg` (24px) padding inside `game-panel` cards.
- **Section separation:** `xl` (40px) vertical margin between game sections.
- The trading journal uses a 12-column CSS grid with a fixed-width sidebar on desktop (280px) and collapses to a single column on mobile. Chart cards span full width with a 200–300px fixed height.

## Elevation & Depth

Depth is achieved through tonal shifts in the surface scale, not shadows. Each tier is 8–12 lightness points brighter than the tier below.

- **Level 0 (page background):** `#0f1117` — the void behind everything.
- **Level 1 (primary panels):** `#1a1f2e` — the main content surface (game board background, journal layout).
- **Level 2 (cards within panels):** `#222840` — elevated content such as stat cards, modal bodies.
- **Level 3 (tooltips, dropdowns, modals):** `#2b3350` — the highest floating layer.

Edges are defined by `rgba(255,255,255,0.08)` borders. This keeps surfaces distinct at all zoom levels without the visual weight of a solid stroke. No `box-shadow` is used in the game or journal UI — the tonal stack is sufficient and avoids blur artifacts on low-DPI displays.

## Shapes

The shape system is a deliberate contrast: **pills for interactive actions, soft rectangles for content containers**.

- **Buttons:** Always `rounded-full` (9999px). Pill buttons are immediately recognizable as clickable, feel satisfying during repeated game interactions (number pad taps, hint presses, undo), and create a clear visual distinction between buttons and content cards.
- **Sudoku cells:** `rounded-md` (0.75rem / 12px) — enough softness to eliminate a harsh grid feeling without making the board look playful or imprecise.
- **Game and data panels:** `rounded-xl` (1.5rem / 24px) — modern, generous enclosure for grouped content.
- **Modals and login card:** `rounded-2xl` (2rem / 32px) — slightly more expansive rounding for full-page-height or prominent floating surfaces.
- **Badges:** Always `rounded-full`, consistent with the pill language. Level badges, violation severity badges, and status chips all share this shape.

## Components

### Buttons

All interactive buttons use `rounded-full`. The primary button (`#3b4bc8`) is the dominant call-to-action — Start Game, Upload CSV, Save Config. The secondary button (`#3aaa35`) marks positive completions: Check Solution, Confirm. Ghost buttons (`rgba(255,255,255,0.06)` fill) handle secondary-secondary actions — Undo, Skip, Cancel — without competing visually with primary actions.

Hover states shift to `primary-fixed-dim` (`#6272e0`) for primary and `secondary-fixed-dim` (`#3aaa35` with 80% opacity) for secondary, giving a clear hover signal without a jarring hue jump. Transition: `150ms ease-out` on `background-color`.

### Sudoku Grid & Cells

The 9×9 grid renders `sudoku-cell` components in a CSS `grid` with `gap: 4px`. Block boundaries are created by wrapping each 3×3 section in a container with a 2px border at `rgba(255,255,255,0.15)`. Cell state is communicated entirely through background color tokens: default, given (prefilled), selected, error, hint, and related (same row/column/block as selected). No icon overlays or stroke changes are used — color is the single state signal, keeping the grid scannable at a glance.

### Number Pad

Nine digit buttons (1–9) plus utility buttons (Erase, Hint, Undo) are arranged in a 3×4 grid below the board. Digit buttons use `rounded-lg` and `headline-md` for large, tap-friendly targets at 56px height. Utility buttons use `rounded-full` to align with the broader pill language and are visually distinguished by the ghost button style.

### Level Badges

Level badges apply the 10-stop color wheel palette as `backgroundColor`, always pairing with `#ffffff` text for guaranteed contrast. Shape is `rounded-full` with compact `4px 10px` padding, making them suitable for inline use next to puzzle titles or leaderboard entries.

### Login Card

The login page is the only surface that breaks the dark system. The page background uses `login-surface` (`#f8fafc`), and the card uses `login-surface-container` (`#ffffff`) with `rounded-2xl`. The Gametritue wordmark appears in Playfair Display at `brand-logo` size, giving the entry point a distinct, premium character that transitions cleanly into the dark game environment after auth.

Form inputs on the login page use `login-outline` (`#cbd5e1`) as a visible border (invisible on dark surfaces) and `login-on-surface` for text.

### Trading Journal Cards

Data cards in the journal reuse the `game-panel` surface and `rounded-xl` shape, maintaining visual continuity with the game. Chart axes and labels use `body-md` in `on-surface-variant`. Violation severity badges follow the same `rounded-full + label-md` pattern as level badges, with four category colors (`Risk: #dc2626`, `Timing: #f97316`, `Behavior: #3b4bc8`, `Drawdown: #7c3aed`) defined in `lib/ruleEngine.ts`. Mono-spaced ticket IDs and price values use the `mono` style to preserve column alignment in dense data tables.
