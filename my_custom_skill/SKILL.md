---
name: codespace-light-theme
description: Use this whenever building, redesigning, or auditing a light (white/bright) theme for a code editor, IDE, cloud codespace, dev console, or any code-heavy developer-tool UI — including syntax-highlighting, sidebar/file-explorer, tabs, terminal, status bar, diff-view, or command-palette colors. Trigger on requests like "build a light theme", "add light mode", "white theme for my editor/IDE", "light mode for my dev tool", or any work touching syntax colors, git-diff colors, or editor chrome colors in a light palette — even if the user never says "light theme" outright. Encodes accessible color-token systems, elevation/shadow rules specific to light surfaces (which behave oppositely to dark-mode elevation), and IDE-specific component patterns modeled on production tools like VS Code, GitHub, and JetBrains — not generic marketing-site light palettes. Also apply when building a dark-theme companion afterward, since the token structure is meant to be shared between both.
---

# Codespace / IDE Light Theme

Lightening up a marketing site and lightening up a code editor are different problems. A marketing site has a handful of large, generous surfaces. A codespace app has a dozen small, dense, simultaneously-visible surfaces (sidebar, tabs, gutter, minimap, terminal, status bar, overlays) plus a second color system laid on top of all of it — syntax highlighting — that has to stay legible across code the user wrote, not content you control. Treat this as its own design discipline, not "invert the dark theme."

## Why this brief is different from "make it white"

- **Long sessions, not a glance.** People stare at this for 6–10 hours a day. Contrast and glare choices that look fine in a 30-second screenshot cause real fatigue over a workday.
- **Distinct surfaces need distinct rules.** Chrome (UI shell), canvas (the code itself), terminal, and overlays each carry different weight and need their own token, not one white reused everywhere.
- **Syntax highlighting is a second, parallel system.** It has its own accessibility math and its own failure modes, covered in its own section below.
- **Elevation flips.** Dark-mode systems fake depth by lightening surfaces because shadows barely read on black. Light mode is the opposite — shadows read beautifully on white, so use them, and don't drag the dark-mode "lighten to elevate" habit over by default.

## Before touching a single hex value

Check the repo/design system already in place first; only ask the user directly if it's genuinely not discoverable:

1. **Stack.** Plain CSS variables? Tailwind config? A component library (shadcn/Radix/MUI) with its own token slots? Which editor engine — Monaco, CodeMirror 6, a custom renderer?
2. **Dark-mode plans.** If a dark theme exists or is likely later, name every token by *role* (`--surface-canvas`), never by literal color (`--white`) — that's what lets dark mode become a token-file swap instead of a component rewrite.
3. **Existing brand accent.** If the product already has a primary button / logo color, anchor `--accent-primary` to it instead of defaulting to generic blue. That single choice is most of what makes the theme feel like *this* product instead of a template.
4. **Compliance bar.** WCAG AA is the default target throughout this skill. If the product has committed to AAA (common in enterprise/government tooling), the syntax palette below needs to shrink further — AAA-safe hues sit close enough together that some of the six syntax roles below stop being distinguishable, so pick which distinctions matter most and merge the rest.

## The color system: five layers

Give each layer one rule, so a component asks "what layer am I?" and inherits its color, instead of being hand-styled one-off.

### 1. Two whites, not one (surfaces)

The single most common mistake in a light IDE theme: painting every panel the exact same white, so the UI stops reading as structured. Split it:

- `--surface-canvas` — the code/text-editing area only. Users spend most of their attention here, so it gets maximum contrast and zero tint.
- `--surface-chrome` — activity bar, sidebar, tab bar, status bar, panel headers. A few percent dimmer than canvas so the eye separates "the tool" from "the content" without a hard border everywhere.
- `--surface-sunken` — terminal panel, input wells, recessed regions, unchanged-lines background in a diff.
- `--surface-overlay` — command palette, dropdowns, popovers, modals. Same value as canvas, lifted by elevation (below), not by a different fill.

This is the same trick VS Code, GitHub, and JetBrains all use under their own hex values — chrome dims a few percent so panels read as separate surfaces without a seam drawn around every one of them.

### 2. Text (foreground)

- `--text-primary` — near-black, not pure `#000000`. Pure black on pure white is more contrast than reading comfort needs and reads harsher at UI-text sizes over a full day.
- `--text-secondary` — metadata, labels, secondary sidebar text.
- `--text-muted` — placeholders and disabled-adjacent captions only. It sits right at the AA line, so never use it for body copy.
- `--text-on-accent` — for text/icons sitting on top of the accent color.

### 3. Accent (the one brand color)

One interactive hue for links, primary buttons, active states, selection, and the focus ring. Pick exactly one and derive hover/active from it — don't introduce a second "interactive blue" somewhere else in the UI.

- `--accent-primary` — base interactive color.
- `--accent-hover` — **darken** on hover/press. This is the opposite of dark-mode convention, where hover states usually brighten.
- `--accent-selected-bg` — accent at ~8–10% alpha, for selected rows, the active-tab underline glow, and the current search match.

### 4. Semantic / status

Success, warning, danger, info — plus git-diff status, which deserves its own mini-system since it's the highest-traffic semantic color in a codespace app.

- **The classic gotcha:** a friendly bright amber that looks great as a *dark-mode* warning color can fail contrast outright on white — bright, light warning colors need to be darkened far more than people expect once the background flips from black to white.
- Diff colors need a background tint *and* a text/icon color, each checked for contrast on its own — and a non-color signal (± glyphs), because red/green is the single most common colorblind failure mode in a diff view. Never let color be the only thing separating "added" from "removed."
- Reuse the warning color as the "modified" gutter dot and the success color as an outline (not a fill) for "untracked," rather than inventing two more hues.

### 5. Syntax highlighting — a separate system, ruled by *fewer* colors, not more

This palette gets painted over arbitrary user code, so it has to hold up across languages the user picked, not content you control. Two rules beat every "10-color rainbow" theme:

- **Minimize the palette.** Give every token type its own hue and color stops carrying information — the brain treats an over-colored file as noise and starts tuning color out entirely. Six roles cover almost all code:
  1. comment (muted, usually italic)
  2. string
  3. keyword / control flow
  4. function / method name
  5. type / class name
  6. constant / number
  - everything else — variables, operators, punctuation — inherits `--text-primary`. Resist the urge to color it "for completeness."
- **Space hues and lightness apart on purpose; don't distribute them evenly.** A palette where every role sits at identical computed lightness with hues spread evenly around a color wheel looks tidy in a design tool and reads as *flat* in real code, because nothing is different enough to actually pop. Vary hue **and** lightness/saturation between neighboring roles.
- **Reserve red for one meaning inside the editor** — keyword text *or* the error squiggle, not both as flat text color. Themes that use red for keywords keep errors legible by rendering them as a wavy underline instead of a second red text fill, so the two meanings never collide.

## Elevation & shadows (light mode plays by different rules than dark mode)

Shadows read clearly against white, so use them — softly and slightly tinted, not a flat black drop-shadow, which reads as a generic web card rather than a precision tool.

- **Level 0** (canvas, chrome): flat, no shadow.
- **Level 1** (active tab, selected row): barely-there — a hint of shadow or a 1px border.
- **Level 2** (dropdown, hover card, popover): soft shadow + a 1px border.
- **Level 3** (command palette, modal): a deeper, wider soft shadow + border + a dim scrim behind it.

Keep the scale to 3–4 steps. Needing more than that is usually a sign the layout hierarchy needs fixing, not that the elevation system needs more tokens.

## Typography

- **Code/editor:** monospace, 13–14px, line-height 1.5–1.6 — code needs more vertical breathing room than UI text once syntax color and indent guides are layered in. Skip negative letter-spacing on monospace.
- **UI chrome:** sans-serif, 12–13px for dense rows (sidebar items, tabs, status bar), 13–14px for primary panels. Reserve font-weight 600+ for the active/selected item only — a chrome full of bold labels has no hierarchy left to give.
- **Density is deliberate, not an oversight.** IDE row heights run tighter than a marketing site's generous spacing on purpose — the entire point is fitting more of the project on screen at once.

## Component-specific patterns

- **Activity bar / primary nav** — icon-only, chrome surface; the active icon gets the accent color plus a 2px indicator bar, not a filled background (a filled state at this size usually reads as a notification badge instead of a nav state).
- **Sidebar / explorer** — chrome surface; git-status colors tint the *filename*, not the whole row, and pair with a glyph (a status letter or a filled/hollow dot) so status never depends on color alone.
- **Tabs** — inactive tabs blend into the chrome surface (no visible tab shape); the active tab jumps to the canvas surface and gets a 2px accent underline. That jump from chrome to canvas is what visually says "this is the file you're looking at." Unsaved files get a dot that replaces the close icon on hover, not an extra color.
- **Editor gutter** — line numbers muted; the current line's number switches to primary text color; current-line highlight is a near-invisible tint — enough to help you find your cursor, not enough to look like a selection.
- **Selection & search-match highlight** — accent at 15–20% alpha for the active selection; a distinctly *different* hue at low alpha for "other matches" in find-in-file, so the two are never confused with each other.
- **Minimap** — if included, render at very low opacity using the syntax colors only, no UI chrome colors. It's a shape/density cue, not a second reading surface.
- **Terminal panel** — the most commonly forgotten surface. If the theme is meant to be fully light, the terminal needs a light-mode-safe ANSI 16-color mapping of its own — default terminal ANSI palettes assume a dark background, and several standard "bright" colors (bright yellow, bright white) will fail contrast or effectively vanish if reused unchanged on a light background.
- **Status bar** — many IDEs (VS Code among them) keep this as a solid accent-colored strip even in an otherwise neutral light theme, as a constant visual anchor for "which branch/mode am I in." That's a legitimate, common pattern, but it's a product choice, not a requirement — a neutral chrome-colored strip is equally valid if a colored bar would compete with the tab bar sitting right above it.
- **Command palette / quick-open** — centered overlay on the overlay surface + the deepest shadow level + scrim; the search input gets a visible focus ring the instant it opens. It's a keyboard-first component — it should never need a mouse hover to look focused.
- **Diff view** — a full-line background tint for added/removed lines, plus a bolder inline highlight for the specific changed words/characters within a modified line. Line-level tint alone hides exactly what changed inside a long line.
- **Notifications / toasts** — overlay surface + shadow, with a 3–4px left border in the semantic color rather than tinting the whole toast body — keeps error/success toasts legible without turning them into solid color blocks.
- **Focus rings** — visible on every interactive element without exception. An IDE's power users live on the keyboard, so an invisible focus state here is a bigger problem than it would be on a typical marketing page.
- **Scrollbars** — thin, neutral, appearing on hover/scroll only. A chunky, always-visible scrollbar reads as non-native and eats width from an already-narrow sidebar.

## Accessibility checklist (non-negotiable)

- WCAG AA minimums: 4.5:1 for body text; 3:1 for large text (≈24px, or ≈18.5px bold) and for the borders of essential interactive components (inputs, buttons, checked states). Decorative dividers are exempt from the 3:1 rule — don't over-darken those chasing a number that doesn't apply to them.
- Check every pair actually used in the UI, not just base tokens against canvas — muted text on the sunken terminal background is a different ratio than muted text on canvas, and both get used.
- Simulate protanopia/deuteranopia/tritanopia specifically on the diff and diagnostic colors. This is the single highest-value accessibility check for a codespace app, since git status and lint errors are exactly where color-only signaling causes the most real workflow harm.
- Respect `prefers-reduced-motion` (tone down tab/panel transitions) and `prefers-contrast: more` (offer a high-contrast variant that swaps in the AAA-safe subset of this palette, rather than trying to make one palette satisfy both bars at once).
- View it at high screen brightness or in a sunlit room at least once before shipping — that's the actual moment people reach for light mode, and it's where a theme that looked fine on a dim monitor turns out to be too low-contrast.

## Anti-patterns seen in the wild

- Every panel painted the identical white with no chrome/canvas split — the UI stops reading as structured and starts feeling like a blank page.
- Reusing a dark theme's saturated neon syntax colors directly on white — they were tuned for a black background and will look washed-out or fail contrast on light.
- Ten-plus-hue syntax palettes "for completeness" — going past the six core roles needs a real justification (a language with genuinely distinct macro/decorator syntax, say), not a desire to use every color available.
- A perfectly even hue-wheel, lightness-matched palette — technically tidy, practically illegible, because adjacent roles don't differ enough to actually stand out from each other.
- Copying dark mode's "lighten to elevate" habit into light mode instead of using real shadows.
- Shipping the terminal and diff view last, or unthemed — they're the two surfaces most likely to still be wearing dark-mode leftovers when everything else looks finished.

## Implementation format

Define every color as a named token (CSS custom property, or the equivalent slot in the project's existing design system / Tailwind config) grouped by the five layers above — never inline a hex value in component code. If the editor is Monaco or CodeMirror, mirror the same six syntax roles into that engine's theme object; a VS Code–style `tokenColors` scope map works for both. `references/tokens.md` has a full starter set as ready-to-adapt CSS variables (each with its computed contrast ratio) plus a sample syntax-theme JSON block to copy from.

Keeping identical token *names* between this light theme and any future dark theme is what turns "add dark mode" into a token-file change instead of a component rewrite.

## Before calling it done

1. Run every foreground/background pair actually used in the UI — not just the base tokens — through a contrast checker, including hover, disabled, and placeholder states.
2. Render 3+ real files in different languages the product actually supports (not isolated color swatches) and check whether the syntax palette still reads clearly in context.
3. Screenshot the five moments that make or break a theme — editor with an open diff, sidebar with mixed git statuses, command palette open over the editor, an error/notification state, and the terminal panel — and review them side by side, not one at a time.
4. Run a colorblind simulation pass on the diff and diagnostic colors specifically.
5. View it at high brightness or in a bright room at least once before shipping.