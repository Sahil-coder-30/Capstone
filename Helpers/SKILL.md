---
name: generic-scss-design
description: A globally accepted SCSS design skill based on design tokens, BEM methodology, theme-responsive custom properties, reusable utility mixins, and clean component structures.
---

# Global SCSS Design System & Style Guide

This skill defines a professional, token-driven SCSS styling architecture. It ensures visual consistency, theme flexibility, responsive adaptability, and clean codebase practices across web projects.

---

## 1. Directory Setup & Design Tokens

A premium design system divides styling concerns into two distinct layers:
1. **Global Variables & Root Custom Properties** (often in `app.scss` or `theme.scss`): Define the values for CSS variables.
2. **Local Token Mappings & Mixins** (often in `_tokens.scss` or `_variables.scss`): Standardize SCSS variables, responsive breakpoints, layout constants, and utility mixins.

### Relative Imports Rule
Every component or feature SCSS file must import the design tokens file relatively:
```scss
@import 'path/to/styles/tokens.scss'; // Always resolve relative to the component location
```

---

## 2. Theme-Responsive Custom Properties (Light/Dark Mode)

To support seamless dark and light mode transitions, color variables should map to CSS Custom Properties rather than hardcoded hex values.

```scss
// Example system root definitions
:root {
  // Theme Light/Dark adaptive colors
  --color-bg: #0d0e12;           // Anthracite/Luxury dark
  --color-bg-elevated: #16181f;  // Lifted panel surfaces
  --color-bg-card: rgba(255, 255, 255, 0.03);
  --color-bg-card-hover: rgba(255, 255, 255, 0.06);
  --color-surface: #1e222b;
  --color-surface-hover: #2a2f3d;

  --color-accent: #dca569;       // Warm champagne gold/amber accent
  --color-accent-dim: rgba(220, 165, 105, 0.12);
  --color-accent-glow: rgba(220, 165, 105, 0.06);

  --color-text: #f3f4f6;         // Off-white readable text
  --color-text-muted: #9ca3af;   // Medium gray
  --color-text-dimmed: #4b5563;  // Low contrast label/placeholder

  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.16);

  // RGB versions for flexible opacity mapping
  --color-rgb-text: 243, 244, 246;
}

[data-theme="light"] {
  --color-bg: #fafafa;
  --color-bg-elevated: #ffffff;
  --color-bg-card: #ffffff;
  --color-bg-card-hover: #f3f4f6;
  --color-surface: #e5e7eb;
  --color-surface-hover: #d1d5db;

  --color-accent: #b4783a;
  --color-accent-dim: rgba(180, 120, 58, 0.12);
  --color-accent-glow: rgba(180, 120, 58, 0.05);

  --color-text: #111827;
  --color-text-muted: #4b5563;
  --color-text-dimmed: #9ca3af;

  --color-border: rgba(0, 0, 0, 0.08);
  --color-border-strong: rgba(0, 0, 0, 0.16);

  --color-rgb-text: 17, 24, 39;
}
```

In your `_tokens.scss`, map these CSS variables to local SCSS variables for editor autocompletion:
```scss
$color-bg:            var(--color-bg);
$color-bg-elevated:   var(--color-bg-elevated);
$color-bg-card:       var(--color-bg-card);
$color-bg-card-hover: var(--color-bg-card-hover);
$color-surface:       var(--color-surface);
$color-accent:        var(--color-accent);
$color-accent-dim:    var(--color-accent-dim);
$color-accent-glow:   var(--color-accent-glow);
$color-text:          var(--color-text);
$color-text-muted:    var(--color-text-muted);
$color-border:        var(--color-border);
$color-border-strong: var(--color-border-strong);
```

---

## 3. Naming Conventions (BEM Methodology)

We write SCSS structure using **Block-Element-Modifier (BEM)** conventions. This ensures stylesheets are flat, modular, and easy to maintain.

```scss
// Block - The wrapper component
.dashboard-widget {
  display: flex;
  flex-direction: column;

  // Element - Child items denoted by double underscore (__)
  &__header {
    padding: $space-3;
  }

  &__title {
    font-size: 1.25rem;
    font-weight: 700;
  }

  // Modifier - Variants or states denoted by double hyphen (--)
  &--compact {
    padding: $space-2;
  }
}
```

* **Never nest selectors deep**: Maintain a flat BEM structure (e.g., `.dashboard-widget__title` and `.dashboard-widget__button`, not `.dashboard-widget__header__title__button`).

---

## 4. Spacing Grid & Layout Metrics

All dimensions, margins, and paddings must align with an **8px grid system**.

```scss
$space-1:   4px;
$space-2:   8px;
$space-3:   12px;
$space-4:   16px;
$space-5:   20px;
$space-6:   24px;   // Standard component padding
$space-8:   32px;
$space-10:  40px;
$space-12:  48px;
$space-16:  64px;   // Common header/navbar height
```

---

## 5. Reusable Styling Mixins

Provide clean mixins for standard repeating layout behaviors.

### Card Container Mixin (`@mixin card;`)
Encapsulates border-radius, background colors, and active focus/hover states:
```scss
@mixin card {
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: 12px; // Generic premium radius
  padding: $space-6;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(10px);

  &:hover {
    background: $color-bg-card-hover;
    border-color: $color-border-strong;
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }
}
```

### Layout Helpers
```scss
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

### Responsive Breakpoints
```scss
$bp-mobile: 768px;
$bp-tablet: 1024px;

@mixin respond-to($bp) {
  @if $bp == 'mobile' {
    @media (max-width: $bp-mobile) { @content; }
  }
  @else if $bp == 'tablet' {
    @media (max-width: $bp-tablet) { @content; }
  }
}
```

### Skeleton Shimmer Mixin
Use standard animated keyframe rules for loaders:
```scss
@mixin skeleton {
  background: linear-gradient(
    90deg,
    $color-bg-card 25%,
    $color-surface 50%,
    $color-bg-card 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 6. Common UI Component Structures

Use these patterns to design recurring UI components:

### Buttons (`&__btn`)
```scss
&__btn {
  display: inline-flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 $space-6;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &--ghost {
    background: none;
    border: 1px solid $color-border;
    color: $color-text-muted;
    &:hover:not(:disabled) { border-color: $color-border-strong; color: $color-text; }
  }

  &--outline {
    background: none;
    border: 1px solid $color-accent;
    color: $color-accent;
    &:hover:not(:disabled) { background: $color-accent-dim; }
  }

  &--primary {
    background: $color-accent;
    border: 1px solid $color-accent;
    color: #000;
    
    &:hover:not(:disabled) {
      background: lighten($color-accent, 8%);
    }
  }
}
```

### Form Fields (`&__input`, `&__select`, `&__textarea`)
```scss
&__input,
&__select,
&__textarea {
  background: rgba(var(--color-rgb-text), 0.04);
  border: 1px solid $color-border;
  border-radius: 8px;
  padding: $space-3 $space-4;
  color: $color-text;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
  width: 100%;

  &::placeholder { color: $color-text-dimmed; }

  &:focus {
    border-color: $color-accent;
    background: $color-accent-glow;
  }
}
```

---

## 7. Strict Design Rules for Agents

1. **No Utility Frameworks (Tailwind, etc.)**: Avoid inline-style frameworks; build clean, structured SCSS declarations.
2. **Strict Theme Adherence**: Never use raw static hex colors for component text, backgrounds, or borders. Always route color properties through CSS variables or their SCSS token counterparts.
3. **Transition Animation**: Always implement transitions with ease functions (`all 0.15s ease` or custom transition curves) to provide a premium feel on interactions (hover, focus, active).
4. **Dynamic Opacities**: When defining semi-transparent overlays, use `rgba(var(--color-rgb-text), opacity_value)` to ensure transparency updates perfectly across themes.
