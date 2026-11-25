# Public and sign in: screens and components

Wireframes: [wireframes.html](wireframes.html) (open in a browser, light and dark switch at the top right, hide notes toggle beside it). Design rules: [../../README.md](../../README.md#design-system). Inventory: [../INVENTORY.md](../INVENTORY.md#public-and-sign-in-ca).

Status: built (`Frontend/src/App.jsx` `loading` and `!isAuthenticated` branches, `Frontend/src/features/auth/components/`, `Frontend/src/components/EntryLoader.jsx`, `Frontend/src/components/BrandLogo.jsx`, `Frontend/src/components/LazyFallback.jsx`)

`Frontend/src/App.jsx` has no router. While `state.auth.loading` is true it renders `auth-loader`; once `verifySession()` finishes with `isAuthenticated === false`, it switches `currentRoute` in local state between `LandingPage` (`'landing'`) and `Login` (`'login'`). `EntryLoader` sits over the first load per tab session.

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| CA-01 | Landing: nav and hero | `Frontend/src/features/auth/components/LandingPage.jsx` | Signed out, `currentRoute === 'landing'` (default) | Local static constants (`NAV_LINKS`), `/video/taksha-film.mp4`, `localStorage.theme` |
| CA-02 | Landing: product workspace and statement | `Frontend/src/features/auth/components/LandingPage.jsx`, `LandingWorkspace.jsx` | Scroll to `#product` and `.lp-statement` | `/video/taksha-workspace-dark.mp4`, `/video/taksha-workspace-light.mp4`, static `FACTS` and `STATEMENT` |
| CA-03 | Landing: forge stages and "Built on" marquee | `Frontend/src/features/auth/components/LandingPage.jsx`, `LandingForge3D.jsx` | Scroll to `#how` (`.lp-forge-track`) and `.lp-marquee` | Static `STAGES` and `STACK`; Three.js `RoomEnvironment` WebGL scene |
| CA-04 | Landing: features and pricing | `Frontend/src/features/auth/components/LandingPage.jsx` | Scroll or nav click to `#features` and `#pricing` | Static bento viz cards and `PLANS` array |
| CA-05 | Landing: FAQ, closing call to action and footer | `Frontend/src/features/auth/components/LandingPage.jsx`, `Hooks/landing.footer.js` | Scroll or nav click to `#faq` and `footer.lp-footer` | Static `FAQ` array, `buildFooter` GSAP + 2D spark canvas |
| CA-06 | Sign in | `Frontend/src/features/auth/components/Login.jsx` | `currentRoute === 'login'` from nav/CTA `onNavigateToLogin` | Static `FACTS`, `localStorage.theme`, `GET /api/auth/google` redirect |
| CA-07 | Session check and intro | `Frontend/src/App.jsx` (`auth-loader`), `Frontend/src/components/EntryLoader.jsx`, `BrandLogo.jsx`, `LazyFallback.jsx` | App boot (`loading === true`), first session visit, lazy `Suspense` | `GET /api/auth/getMe`, `POST /api/auth/refresh`, `sessionStorage.taksha_session_loader_v1` |

---

## CA-01 Landing: nav and hero

**Purpose:** Present the top navigation, light/dark toggle, core product pitch, and primary paths into sign-in or the hero film on desktop and mobile (`390 px`).

**Data and API calls:**
- Static `NAV_LINKS` (`Product`, `How it works`, `Features`, `Pricing`, `FAQ`).
- Theme button reads and writes `localStorage.theme` (`'light'` / `'dark'`) and toggles `.light-theme` on `document.documentElement`.
- Hero video loads `/video/taksha-film.mp4` with poster `/video/taksha-film-poster.jpg`.
- `Sign in`, `Start free`, and `Start building free` call `onNavigateToLogin`, switching `App.jsx` `currentRoute` to `'login'`.

**States:**
- Initial desktop (`> 900 px`): floating pill header, `SplitChars` staggered character intro triggered by `introReady`, two CTA buttons, bottom scroll cue.
- Scroll film (`0.05` to `0.86` of `270 vh` `.lp-hero-track`): fades copy out, plays `/video/taksha-film.mp4`, reveals `Turn sound on` / `Mute` pill.
- Mobile (`<= 900 px` and `<= 420 px`): hides nav links and `Sign in` into `.lp__mobile-menu`, hides header `Start free` below `420 px`, and stacks hero CTAs at full width.
- Reduced motion (`.lp--still`): disables sticky scroll pinning, shows the video inline with native `controls`, and hides `.lp-hero__watch` and `.lp-hero__cue`.

**Exact copy:**
- Nav links: `Product`, `How it works`, `Features`, `Pricing`, `FAQ`
- Header buttons: `Sign in`, `Start free`, aria-labels `Switch to light mode` / `Switch to dark mode`, `Open navigation menu`, `Close navigation menu`
- Headline: `Describe your app.` / `Taksha builds, tests & heals it.`
- Subtitle: `Write one prompt and approve the plan. Agents write the code, run it in your own cloud sandbox, and fix their own errors until the app is live.`
- Actions and note: `Start building free`, `Watch the film`, `Free plan. No credit card required.`
- Film audio toggle: `Turn sound on` / `Mute`

**Components reused:** `BrandLogo`, `EntryLoader`, `useLandingMotion`, `lucide-react` (`ArrowRight`, `Menu`, `Moon`, `Play`, `Sun`, `Volume2`, `VolumeX`, `X`).

---

## CA-02 Landing: product workspace and statement

**Purpose:** Showcase the live Taksha IDE workflow clip alongside four platform guarantees and the scroll-scrubbed statement band.

**Data and API calls:**
- `LandingWorkspace` selects `/video/taksha-workspace-dark.mp4` or `/video/taksha-workspace-light.mp4` (and matching `.jpg` posters) from the `isLight` prop.
- `IntersectionObserver` (`threshold: 0.2`) plays the muted looping video only while visible, or exposes `controls` when `prefers-reduced-motion: reduce` matches.
- No API calls; `FACTS` and `STATEMENT` are static in `LandingPage.jsx`.

**States:**
- Perspective tilt on `.lp-product__stage` scrubs from `rotationX: 30, scale: 0.86, y: 90` to flat as `#product` enters (`top 92%` to `top 8%`).
- `.lp-statement` words scrub opacity from `0.14` to `1` across `top 78%` to `bottom 52%`.

**Exact copy:**
- Header: `The real workspace`, `This is where the work happens.`
- Video aria-label: `The Taksha workspace building an app from one prompt`
- Fact 1: `You review the plan` / `Approve or reject before code starts`
- Fact 2: `Your own sandbox` / `One Kubernetes pod per project`
- Fact 3: `Files stay saved` / `Workspace syncs to cloud storage`
- Fact 4: `Free to start` / `No credit card required`
- Statement: `Most AI tools hand you code and wish you luck. Taksha hands you a running app, with the errors already fixed.`

**Components reused:** `LandingWorkspace`, `useLandingMotion`, `lucide-react` (`ShieldCheck`, `Box`, `Cloud`, `Check`).

---

## CA-03 Landing: forge stages and "Built on" marquee

**Purpose:** Walk visitors through the four agent pipeline stages beside a scroll-driven Three.js centerpiece and a scrolling infrastructure stack strip.

**Data and API calls:**
- `useLandingMotion` scrubs `forgeProgressRef` across the `440 vh` `.lp-forge-track` above `900 px` and calls `setActiveStage` for `plan`, `build`, `test`, `fix`.
- `LandingForge3D` watches `document.documentElement` class mutations to swap ring and spark blending between dark and light themes.
- No backend API calls; `STAGES` and `STACK` are local constants.

**States:**
- Desktop (`> 900 px`): sticky viewport shows one active `.lp-forge__copy` block on the left while `LandingForge3D` rotates the chisel `T` and lights the matching orbital node.
- Mobile / reduced motion (`<= 900 px` or `.lp--still`): unpins track and renders `.lp-forge__list` with all four stages stacked vertically.
- No WebGL support (`!supported` in `LandingForge3D.jsx`): renders `<TakshaIcon size={200} />` fallback inside `.lp-forge__fallback`.

**Exact copy:**
- Stage 1: `01 / Planner` / `Splits your prompt into steps. You approve first.` / `The Planner pauses before any code is written. Approve the plan, or reject it and say what to change.`
- Stage 2: `02 / Coder` / `Writes every file inside your sandbox.` / `Every change lands in the real editor, where you can read it, edit it, or take over.`
- Stage 3: `03 / Tester` / `Runs the app and reads the real errors.` / `The Tester runs commands in the sandbox and checks Vite for runtime errors, the same way you would.`
- Stage 4: `04 / Debugger` / `Patches what broke and tries again.` / `The Debugger reads the error, patches the exact lines, and checks again until the app runs clean.`
- Marquee (`aria-label="Built on"`): `Kubernetes`, `LangGraph`, `NVIDIA Nemotron`, `React`, `Vite`, `Monaco Editor`, `xterm.js`, `MongoDB`, `Redis`

**Components reused:** `LandingForge3D` (lazy-loaded), `TakshaIcon`, `useLandingMotion`, `lucide-react` (`Layers`, `Code`, `Play`, `Wrench`).

---

## CA-04 Landing: features and pricing

**Purpose:** Detail the five IDE and agent capabilities in a bento grid and present the three subscription tiers with monthly rupee pricing.

**Data and API calls:**
- Static `SandboxViz`, `ReviewViz`, `TerminalViz`, `CopilotViz`, `SyncViz`, and `PLANS` in `LandingPage.jsx`.
- Pricing buttons (`Start free`, `Get Pro`, `Get Max`) invoke `onNavigateToLogin`.

**States:**
- Pointer hover (`.tilt`): fine pointers update `--mx`, `--my`, and subtle 3D rotation via `gsap.quickTo`.
- Responsive grid: `.bento` collapses from 6 columns to 2 (`<= 900 px`) then 1 (`<= 620 px`); `.plans` collapses from 3 columns to 1 (`<= 900 px`).

**Exact copy:**
- Features header: `Features`, `A full IDE, not a chat box`, `The agent does the heavy work. You keep the editor, the terminal, and the final say.`
- Cell 1: `A real sandbox for every project` / `Your app runs in its own Kubernetes pod with a live Vite server, so the preview is the real thing.` / `sandbox-pod`, `Running`, `template` `Vite dev server` `:5173`, `agent` `Agent sidecar` `:3000`, `sync-agent` `Cloud file sync` `syncing`
- Cell 2: `You stay in control` / `Approve or reject the plan, and stop a run at any time.` / `Plan ready. 3 steps.`, `Approve`, `Reject`
- Cell 3: `Editor and terminal` / `Monaco and a full terminal sit right next to the agent.` / `$ npm i recharts`, `added 37 packages`, `$ npm run dev`
- Cell 4: `A copilot at your side` / `Ask Clio quick questions while you work on your project.` / `Why is this card overflowing?`, `The grid has no min-width. Want me to fix it?`
- Cell 5: `Your files stay safe` / `Files sync to cloud storage and return when you restart.` / `src/App.jsx`, `src/TaskItem.jsx`, `src/app.scss`, `Saved`
- Pricing header: `Pricing`, `Start free. Upgrade when you ship.`, `Every plan includes the coding agent, your own workspace, and a live preview.`
- Plan Free: `Free`, `₹0` `per month`, `Start free`, `Start building with AI. No credit card required.`, `20 AI credits per provider`, `Coding agent + Copilot`, `50,000 tokens per day`, `0.5 vCPU + 512MB sandbox`, `Community support`
- Plan Pro: `Pro`, `Most popular`, `₹499` `per month`, `Get Pro`, `Full AI power for active developers.`, `4x higher AI usage limits`, `5,000,000 tokens per month`, `2.0 vCPU + 2GB sandbox`, `All coding and app agents`, `Priority email support`
- Plan Max: `Max`, `₹999` `per month`, `Get Max`, `Maximum AI power with flagship models.`, `Unlimited AI tokens`, `Priority queue processing`, `4.0 vCPU + 4GB sandbox`, `All flagship AI models`, `Dedicated 24/7 support`

**Components reused:** `useLandingMotion`, `lucide-react` (`Box`, `Check`, `X`, `Cloud`, `ArrowRight`).

---

## CA-05 Landing: FAQ, closing call to action and footer

**Purpose:** Answer common product questions in an accordion, trigger a closing sign-in CTA, and anchor the forged `TAKSHA` footer wordmark.

**Data and API calls:**
- `openFaq` state in `LandingPage.jsx` controls which FAQ item is expanded (`0` open by default).
- `buildFooter` (`Hooks/landing.footer.js`) sets up scroll scrub on `h2.lp-kinetic` and `.lp-footer__word`, an `IntersectionObserver` heat wave, pointer proximity heat/tilt, click-strike elastic bounce, and a 2D `<canvas>` spark emitter.

**States:**
- FAQ item open (`faq-item--open`): `aria-expanded="true"`, chevron rotates 180 deg, `grid-template-rows: 1fr`.
- Fine-pointer hover and click on `TAKSHA` letters: emits sparks (capped at `180`), warms `--heat` with a `520 ms` half-life decay, and bounces struck letters.

**Exact copy:**
- FAQ header: `FAQ`, `Common questions`
- Q1: `What can Taksha build?` / `React apps on Vite. Your workspace is a real Node.js environment, so you can open the terminal and install any npm package you need.`
- Q2: `Do I see the plan before code is written?` / `Yes. The agent pauses after planning. You approve the plan, or reject it and say what to change. You can also stop a run at any time.`
- Q3: `Where does my project run?` / `Each project runs in its own Kubernetes pod with CPU and memory limits. Idle sandboxes shut down after about 20 minutes, and your files come back when you start again.`
- Q4: `Can I code by hand too?` / `Yes. You get a Monaco editor and a full terminal next to the agent, so you can edit any file or run any command yourself.`
- Q5: `How does usage work?` / `AI usage is counted in credits, and each plan has its own limits. The Free plan is enough to build your first app, and you can upgrade when you need more.`
- Closing CTA: `Your next app is one prompt away.`, `Start building free`
- Footer links: `Product`, `How it works`, `Features`, `Pricing`, `FAQ`, `LinkedIn`, `GitHub`
- Footer bar: `© 2026 Taksha CodeSpace Studio`, `Built by Sahil Sharma`

**Components reused:** `buildFooter` (`landing.footer.js`), `SplitChars`, `lucide-react` (`ChevronDown`, `ArrowRight`).

---

## CA-06 Sign in

**Purpose:** Provide a focused Google OAuth entry screen with theme switching and a return link to the landing page.

**Data and API calls:**
- Clicking `Continue with Google` sets `redirecting = true` and navigates `window.location.href` to `${window.location.origin}/api/auth/google`.
- `pageshow` listener clears `redirecting` when `event.persisted` is true (browser Back button restore).
- Theme button toggles `.light-theme` on `document.documentElement` and updates `localStorage.theme`.

**States:**
- Idle: white high-contrast CTA in dark mode (`#FFFFFF` / `#18181D`) and dark CTA in light mode (`#18181D` / `#FFFFFF`) with Google SVG mark and `Continue with Google`.
- Redirecting (`redirecting === true`): button disabled (`aria-busy="true"`), shows spinning `Loader2` icon and `Redirecting to Google...`.

**Exact copy:**
- Top bar: `Back to home`, aria-labels `Switch to light mode` / `Switch to dark mode`
- Card heading: `Welcome to Taksha`, `Sign in to open your projects, or start your first one.`
- Button: `Continue with Google` / `Redirecting to Google...`
- Facts: `You approve the plan before code starts`, `Every project runs in its own sandbox`, `Free to start, no credit card required`
- Footer: `© 2026 Taksha CodeSpace Studio`

**Components reused:** `BrandLogo`, `lucide-react` (`ArrowLeft`, `Box`, `Check`, `Loader2`, `Moon`, `ShieldCheck`, `Sun`).

---

## CA-07 Session check and intro

**Purpose:** Verify any existing session cookie on app boot (`auth-loader`), play the first-visit animated intro (`EntryLoader`), and show a spinner fallback (`PageSkeleton`) while lazy routes download.

**Data and API calls:**
- `App.jsx` calls `useAuth().verifySession()` on mount (`GET /api/auth/getMe`); `apiClient.js` retries 401 responses once via `POST /api/auth/refresh` and stores the token in memory via `setAccessToken`.
- `EntryLoader.jsx` checks `sessionStorage.getItem('taksha_session_loader_v1')`; if unseen, runs `<TakshaAnimatedLogo />` (`3500 ms` GSAP + rAF scramble from `Studio` to `TAKSHA`) and records `taksha_session_loader_v1`, `taksha_entry_loader_seen`, and `taksha_intro_seen` on completion or skip.

**States:**
- Session loading (`loading === true` in `App.jsx`): `.auth-loader` with ambient orbs, grid, `<TakshaAnimatedLogo />`, green dot, and `Authenticating session…`.
- First-visit intro (`EntryLoader.jsx`): bit-stream canvas, top bar (`TAKSHA CODESPACE` badge, `SKIP ESC` button shown after `300 ms`), auto-exit at `4800 ms` or on `Escape`/`Enter` keydown.
- Lazy route fallback (`PageSkeleton` in `LazyFallback.jsx`): centered spinner with `Taksha Codespace • Cloud IDE` or `Taksha Codespace • Authentication`.

**Exact copy:**
- `App.jsx` auth loader: `Authenticating session…`
- `EntryLoader.jsx`: `TAKSHA CODESPACE`, `SKIP`, `ESC`
- `TakshaLogoAnimation.jsx`: `Studio` morphing into `TAKSHA` and `CODESPACE`
- `PageSkeleton`: `Taksha Codespace • Cloud IDE`, `Taksha Codespace • Authentication`

**Components reused:** `TakshaAnimatedLogo` (`TakshaLogoAnimation.jsx`), `EntryLoader`, `PageSkeleton`, `useAuth`, `lucide-react` (`FastForward`).

---

## Gaps seen in the code

- **No error UI in `Login.jsx` or for `verifySession` failures:** `useAuth().verifySession` dispatches `loginFailure(msg)` into `state.auth.error`, and `Login.jsx` redirects to `/api/auth/google`, yet `App.jsx` never reads `state.auth.error` and `Login.jsx` has no alert or URL query-error handling if Google OAuth is cancelled or returns an error.
- **Hardcoded plan data on the landing page:** `LandingPage.jsx` defines `PLANS` (`₹0`, `₹499`, `₹999`) inline instead of fetching `/api/payments/credit/packages` (leaving pricing copy decoupled from the Payments service).
- **`PageSkeleton` uses a spinner instead of layout skeletons:** `LazyFallback.jsx` `PageSkeleton` renders a centered CSS spinning ring and monospace text rather than matching the landing or login layout geometry.
- **Mobile navigation omits `Sign in` at narrow widths:** In `LandingPage.scss`, `.lp__nav-signin` hides at `<= 900 px` and `.lp__nav-start` hides at `<= 420 px`, while `.lp__mobile-menu` renders only `NAV_LINKS` and `Start free` (no separate `Sign in` button, though both navigate to `Login`).
- **Landing and Login stylesheets duplicate palette tokens:** `LandingPage.scss` (`--lp-*`), `Login.scss` (`--login-*`), and `EntryLoader.scss` redefine hardcoded hex colours (including `#C2410C`, `#0a0a0c`, `#FFB347`, `#1A1A1E`) instead of inheriting `styles/index.scss` root tokens, and `App.scss` still carries unused `.auth-loader__pulse-ring`, `.auth-loader__logo-box`, and `.auth-loader__title` rules.
- **Footer credits and links are hardcoded:** `LandingPage.jsx` hardcodes personal LinkedIn/GitHub links and `"Built by Sahil Sharma"` inside `lp-footer`, and `EntryLoader.jsx` sets three separate `sessionStorage` keys (`taksha_session_loader_v1`, `taksha_entry_loader_seen`, `taksha_intro_seen`) while being mounted in both `LandingPage.jsx` and `App.jsx`.
