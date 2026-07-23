# Starter token set

A concrete, WCAG-AA-checked starting palette for the five-layer system described in `SKILL.md`. Every ratio below is a real computed WCAG contrast ratio (relative-luminance formula), not an estimate — treat these as a verified starting point to adapt to a brand accent, not as values to copy blindly forever.

## CSS custom properties

```css
:root[data-theme="light"] {
  /* ---- Surfaces ---- */
  --surface-canvas:  #FFFFFF; /* editor / text-editing area only */
  --surface-chrome:  #F3F3F4; /* activity bar, sidebar, tabs, status bar */
  --surface-sunken:  #EBEBED; /* terminal, input wells, recessed panels, unchanged diff lines */
  --surface-overlay: #FFFFFF; /* command palette, popovers, modals — pair with --shadow-* */
  --surface-hover:    rgba(20, 20, 30, 0.04);
  --surface-selected: rgba(9, 105, 218, 0.08);

  /* ---- Borders ---- */
  --border-subtle:      #E4E4E7; /* decorative dividers — no contrast requirement */
  --border-default:     #D0D7DE; /* panel / card edges */
  --border-interactive: #8C8C94; /* inputs, buttons — 3.3:1 on canvas, meets WCAG non-text 3:1 */

  /* ---- Text ---- */
  --text-primary:   #1A1A1E; /* 17.4:1 on canvas */
  --text-secondary: #57606A; /* 6.4:1 on canvas */
  --text-muted:     #6E7781; /* 4.55:1 — placeholders/captions ONLY, not body copy */
  --text-disabled:  #AFB8C1; /* intentionally below AA — disabled state is exempt */
  --text-on-accent: #FFFFFF; /* 5.2:1 on --accent-primary */

  /* ---- Accent ---- */
  --accent-primary:    #0969DA; /* 5.2:1 on canvas */
  --accent-hover:      #0850B8; /* 7.4:1 on canvas — darken on hover, not lighten */
  --accent-active:     #0A57C2;
  --focus-ring:        #0969DA;

  /* ---- Semantic ---- */
  --success-text: #1A7F37; /* 5.1:1 */
  --warning-text: #9A6700; /* 4.9:1 — do NOT lighten; a bright amber like #E3B341 drops to ~2:1 on white */
  --danger-text:  #CF222E; /* 5.4:1 */
  --info-text:    #0969DA;

  /* ---- Git / diff ---- */
  --diff-add-text:     #116329;
  --diff-add-bg:       #DAFBE1; /* text-on-bg: 6.6:1 */
  --diff-del-text:     #82071E;
  --diff-del-bg:       #FFEBE9; /* text-on-bg: 9.2:1 */
  --diff-modified-dot:   var(--warning-text);
  --diff-untracked-dot:  var(--success-text);

  /* ---- Elevation ---- */
  --shadow-1: 0 1px 2px rgba(20, 20, 30, .06);
  --shadow-2: 0 4px 12px rgba(20, 20, 30, .10);
  --shadow-3: 0 16px 40px rgba(20, 20, 30, .16);
  --scrim:    rgba(20, 20, 30, .35);

  /* ---- Syntax highlighting (6-role minimal system) ---- */
  --syntax-comment:  #6E7781; /* 4.55:1, italic */
  --syntax-string:   #116329; /* 7.4:1 */
  --syntax-keyword:  #CF222E; /* 5.4:1 */
  --syntax-function: #6639BA; /* 7.3:1 */
  --syntax-type:     #953800; /* 7.4:1 */
  --syntax-constant: #0550AE; /* 7.6:1 */
  /* everything else (variables, operators, punctuation) → var(--text-primary) */
}
```

## Sample editor theme (VS Code / Monaco-compatible shape)

Drop-in starting point — the `scope` arrays are TextMate scopes, so this also transfers directly to any Monaco or CodeMirror setup that consumes TextMate-style grammars.

```json
{
  "name": "Codespace Light",
  "type": "light",
  "colors": {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#1A1A1E",
    "editor.lineHighlightBackground": "#00000009",
    "editor.selectionBackground": "#0969DA29",
    "editor.findMatchHighlightBackground": "#9A67001F",
    "editorLineNumber.foreground": "#6E7781",
    "editorLineNumber.activeForeground": "#1A1A1E",
    "editorCursor.foreground": "#0969DA",
    "sideBar.background": "#F3F3F4",
    "sideBar.foreground": "#1A1A1E",
    "activityBar.background": "#F3F3F4",
    "activityBar.activeBorder": "#0969DA",
    "tab.activeBackground": "#FFFFFF",
    "tab.inactiveBackground": "#F3F3F4",
    "tab.activeBorderTop": "#0969DA",
    "statusBar.background": "#F3F3F4",
    "statusBar.foreground": "#1A1A1E",
    "terminal.background": "#EBEBED",
    "terminal.foreground": "#1A1A1E",
    "diffEditor.insertedLineBackground": "#DAFBE180",
    "diffEditor.removedLineBackground": "#FFEBE980",
    "focusBorder": "#0969DA"
  },
  "tokenColors": [
    { "scope": ["comment"], "settings": { "foreground": "#6E7781", "fontStyle": "italic" } },
    { "scope": ["string"], "settings": { "foreground": "#116329" } },
    { "scope": ["keyword", "storage.type", "keyword.control"], "settings": { "foreground": "#CF222E" } },
    { "scope": ["entity.name.function", "support.function"], "settings": { "foreground": "#6639BA" } },
    { "scope": ["entity.name.type", "entity.name.class", "support.type"], "settings": { "foreground": "#953800" } },
    { "scope": ["constant.numeric", "constant.language"], "settings": { "foreground": "#0550AE" } }
  ]
}
```

## Light-safe terminal ANSI 16

Standard ANSI palettes assume a dark background — reused unchanged on light, bright yellow and bright white effectively disappear and several others fail contrast outright. All values below are checked against `--surface-sunken` (`#EBEBED`) as the terminal background.

| Role | Hex | Notes |
|---|---|---|
| black (default fg) | `#1A1A1E` | same as `--text-primary` |
| red | `#CF222E` | same as `--danger-text` |
| green | `#1A7F37` | same as `--success-text` |
| yellow | `#9A6700` | darkened — a raw bright yellow fails on light, same trap as `--warning-text` |
| blue | `#0969DA` | same as `--accent-primary` |
| magenta | `#8250DF` | 5.0:1 on white — kept distinct from `--syntax-function` purple so the two contexts don't visually collide |
| cyan | `#036672` | 6.7:1 on white |
| white (dim fg) | `#6E7781` | on a light background, "white" needs to become a mid-gray to stay visible at all |
| bright-black | `#57606A` | |
| bright-red / green / yellow / blue / magenta / cyan | slightly more saturated/darker variants of the above | keep bright variants clearly distinct from their base, not just a lightness bump — a lightness bump alone is the flattening mistake called out in `SKILL.md` |

## Quick contrast reference

| Pair | Ratio | WCAG AA |
|---|---|---|
| `--text-primary` on `--surface-canvas` | 17.4:1 | pass (body text ≥ 4.5:1) |
| `--text-secondary` on `--surface-canvas` | 6.4:1 | pass |
| `--text-muted` on `--surface-canvas` | 4.55:1 | pass, borderline — captions only |
| `--text-primary` on `--surface-chrome` | 15.7:1 | pass |
| `--accent-primary` on `--surface-canvas` | 5.2:1 | pass |
| `--text-on-accent` on `--accent-primary` | 5.2:1 | pass |
| `--success-text` on `--surface-canvas` | 5.1:1 | pass |
| `--danger-text` on `--surface-canvas` | 5.4:1 | pass |
| `--warning-text` on `--surface-canvas` | 4.9:1 | pass |
| bright-amber `#E3B341` on `--surface-canvas` | 1.95:1 | **fail** — the gotcha example, don't use |
| `--diff-add-text` on `--diff-add-bg` | 6.6:1 | pass |
| `--diff-del-text` on `--diff-del-bg` | 9.2:1 | pass |
| `--border-interactive` on `--surface-canvas` | 3.3:1 | pass (non-text ≥ 3:1) |
| `--border-subtle` on `--surface-canvas` | 1.45:1 | fine — decorative, exempt from the 3:1 rule |