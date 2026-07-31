# BorderGlow — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/border-glow |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS (no TypeScript, no external deps) |
| Date pulled | 2026-07-31 |
| Files | `BorderGlow.jsx`, `BorderGlow.css` |
| External dependencies added | None — pure RAF + CSS vars |

## Audit results

| Check | Result |
|---|---|
| Stray hex colors in JSX (not prop-exposed) | None — all colors (`#120F17`, `#c084fc`, etc.) are prop defaults, overridden at call site |
| Stray hex colors in CSS | `#120F17` in `--card-bg` fallback (overridden by `backgroundColor` prop), `#c299ff` in `--gradient-base` fallback (overridden by `buildGradientVars`) |
| Infinite RAF loop | None — `animateValue` is finite, `onPointerMove` is event-driven |
| SSR boundary needed | No — Vite/CSR project |
| Dependency conflicts | None — no npm packages added |
| Performance gating | `animated={false}` on all plan cards (no RAF on mount), hover-only CSS var updates (GPU composited) |
| `prefers-reduced-motion` | Handled — `animated` prop is `false` everywhere; pointer-move CSS vars are passive |

## Customizations applied

- Added `.plan-card-border-glow` override class in `BorderGlow.css` to fix height, overflow, and tier border tints
- `border-glow-inner` gets `justify-content: space-between; overflow: visible` to match original PlanCard layout
- Call site passes per-tier brand palettes (see PlanCard.jsx)

## Per-tier palette mapping (Taksha brand)

| Tier | `backgroundColor` | `glowColor` | `colors` |
|---|---|---|---|
| Free | `#0E1018` | `"162 35 40"` | `['#1E3530', '#0F2520', '#18222E']` |
| Pro | `#0C1510` | `"162 54 51"` | `['#3DC5A1', '#0D8A6A', '#1B6EF3']` |
| Max | `#15110A` | `"45 100 52"` | `['#FFB800', '#F59E0B', '#FBBF24']` |

## Re-install notes

If re-installing this component from React Bits in the future:
1. Run the install command against `src/components/reactbits/` (not `src/components/ui/`)
2. Re-apply the `.plan-card-border-glow` block at the bottom of `BorderGlow.css`
3. Verify the `backgroundColor` values still match the dark surface tokens in `styles/tokens.scss`

---

# Lightfall — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/r/Lightfall-JS-CSS |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `Lightfall.jsx`, `Lightfall.css`, `LightfallBackground.jsx` |
| External dependencies added | `ogl` (^1.0.0) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — disposes `program`, `geometry`, `mesh`, `renderer`, cancels RAF, removes listeners, disconnects `ResizeObserver` |
| SSR boundary | Handled via `lazy` + `Suspense` and `typeof window` safety checks |
| `prefers-reduced-motion` | Handled — falls back to branded `radial-gradient` |
| Off-screen pause | Handled — `IntersectionObserver` toggles `paused` prop when off-screen |
| DPR capping | Handled — capped to 1 on mobile screens (< 768px), max 2 on desktop |
| Pointer interaction | Window listener added for smooth cursor tracking when used in fixed background layer |

## Brand Customizations

- Rendered with Taksha AI blue/cyan/purple palette: `colors={['#A6C8FF', '#5227FF', '#FF9FFC']}`, `backgroundColor="#0A29FF"`
- Placed as background layer on `payments_frontend` `App.jsx` wrapper

---

# CardSwap — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/card-swap |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `CardSwap.jsx`, `CardSwap.css` |
| External dependencies added | `gsap` (^3.15.0) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — kills GSAP timeline (`tlRef.current.kill()`) and clears timer (`clearInterval(intervalRef.current)`) |
| Hover listeners | Safe — event listeners added/removed properly on `container` |
| Theme compatibility | Fully themed with Taksha AI glassmorphism, `--bg-overlay`, `--border-glow`, and `--brand-primary` tokens |
| Light/Dark mode | Overridden with `.light-theme .card` background & border styling |

## Brand Customizations

- Integrated into Taksha Engine Spotlight section on `PaymentsLandingPage.jsx`
- Paired with custom generated AI feature graphics (`card_sandbox.png`, `card_multi_agent.png`, `card_token_metering.png`, `card_hmac_security.png`)

---

# GradientText — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/gradient-text |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `GradientText.jsx`, `GradientText.css` |
| External dependencies added | `motion` (^12.0.0) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — `useAnimationFrame` auto-cleans on component unmount |
| Theme compatibility | Defaults mapped to Taksha AI brand palette `['#3DC5A1', '#1B6EF3', '#00DFD8', '#3DC5A1']` |
| Usage Scope | Scoped exclusively to the main `Taksha AI Plan` headline text on `PaymentsLandingPage.jsx` for clean visual aesthetics |

---

# ShinyText — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/shiny-text |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `ShinyText.jsx`, `ShinyText.css` |
| External dependencies added | `motion` (^12.0.0) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — `useAnimationFrame` auto-cleans on unmount |
| Theme compatibility | Uses brand color tokens (`#3DC5A1`, `#1B6EF3`, `#60A5FA`) with high-contrast `#FFFFFF` shine |
| Usage Scope | Used to highlight priority text such as hero badges and subscription plan tier badges |

---

# MagicBento — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/magic-bento |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `MagicBento.jsx`, `MagicBento.css` |
| External dependencies added | `gsap` (^3.15.0) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — disposes particle elements, removes event listeners, clears timeouts, and kills magnetism animations |
| Global Spotlight | Fixed overlay appended to body and safely detached on unmount |
| Mobile Optimization | Automatically disables heavy 3D tilt, cursor spotlight, and particle animations on screens <= 768px |
| Theme compatibility | Dark bento grid with responsive 4-column layout, custom particle colors, and CSS variable border glow |
| Application Context | Custom feature cards showcasing Fully Equipped Terminal, Monaco Code Editor, Real-Time Auto Save, Autonomous AI Agents, Instant HMR Preview, and Sandboxed K8s Containers |

---

# ScrambledText — Provenance

| Field | Value |
|---|---|
| Source URL | https://reactbits.dev/components/scrambled-text |
| GitHub | https://github.com/DavidHDev/react-bits |
| Component variant | JavaScript + CSS |
| Date pulled | 2026-07-31 |
| Files | `ScrambledText.jsx`, `ScrambledText.css` |
| External dependencies added | `gsap` (^3.15.0 with `SplitText` and `ScrambleTextPlugin`) |

## Audit & Performance Gating Results

| Check | Result |
|---|---|
| Teardown on unmount | Verified — removes `pointermove` listener and calls `split.revert()` on teardown |
| Error handling | Wrapped `SplitText` creation in `try/catch` with safe fallback |
| Interaction | Event-driven mouse hover radius scramble with configurable `scrambleChars`, `duration`, and `speed` |
| Theme compatibility | Uses responsive typography and `will-change: transform` styling |
| Application Context | Powering the first-time session intro loader screen (`PaymentsIntroLoader.jsx`) exposing "Payments" and "Powered by Razorpay" |

