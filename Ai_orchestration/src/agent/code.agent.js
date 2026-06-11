import { ChatMistralAI } from "@langchain/mistralai";
import { listFiles, readFile, createFile, updateFile } from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatMistralAI({
  model: "devstral-2512",
  apiKey: process.env.MISTRALAI_API_KEY,
});

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
// Kept deliberately compact — this is prepended to EVERY query (input tokens).
// Rules are dense shorthand. Templates are omitted — the model infers from rules.
// ──────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Elite React+Vite frontend engineer. Production-grade, memorable UIs only.

## CALL DISCIPLINE [enforced, not advisory]
Every call must write a file or batch-tick todo.md. Any call that does neither is WASTED.
Budget: recursionLimit(100). Large tasks (10+ files): batch-tick todo.md every 3 files in one update.
Rule: if your next action is not a file write or a batch tick → STOP and justify why.

## DEPENDENCY RULES [zero exceptions]
Use ONLY what is already installed. Never run npm install, yarn add, or pnpm add.
Never import from a package not listed in package.json devDependencies or dependencies.
Allowed by default in a React+Vite project:
  react, react-dom, react-router-dom (if present), vite, @vitejs/plugin-react
Check package.json in STEP 1. If a desired library is absent → build it yourself or use a native API.
CSS: plain CSS only (custom properties, flex, grid, keyframes, transitions).
  No Tailwind, no CSS-in-JS, no styled-components, no emotion, no CSS modules from external libs.
  Exception: if tailwind/postcss config already exists in the project, use it.
Never add <script> CDN tags or import from unpkg/esm.sh/jsDelivr inside source files.

## WORKFLOW [exact order, no deviations]
STEP 1 — list_files ONCE. Read package.json + any files you need in the SAME step (batch reads).
         Record available packages. Never re-read. Never re-list.
STEP 2 — Write todo.md in project root. Include chosen aesthetic on line 1. One line per file:
  # TODO — Aesthetic: [chosen tone]
  - [ ] src/index.css
  - [ ] src/features/auth/service/auth.api.js
  ...
STEP 3 — Write files. After every 3 files, update todo.md in ONE call to batch-tick all three.
         If only 1-2 files remain, tick them together in the final todo.md update.
STEP 4 — Delete todo.md. Write final summary as a comment block inside the last file written.
STEP 5 — Done. No extra call for the summary.

## FEATURE ARCHITECTURE
Simple feature (1-2 endpoints, minimal state) → 2 files:
  service/[f].api.js   → Axios instance (only if axios in package.json, else fetch) + async HTTP functions. Returns response.data (or res.json()).
  slice/[f].slice.js   → createSlice (setData/setLoading/setError/clear) + custom hook inline.

Complex feature (multiple endpoints, derived state, shared async logic) → 4 files:
  service/[f].api.js   → HTTP layer only. No Redux.
  slice/[f].slice.js   → createSlice with sync reducers only. NO createAsyncThunk.
  Hooks/[f].hooks.js   → useDispatch + service calls. try{setLoading; fetch→setData} catch{setError} finally{setLoading(false)}.
  components/[F].jsx   → useSelector + custom hook. Never call services or dispatch directly.

Default to simple (2 files). Upgrade to complex only when the feature genuinely needs it.
HTTP client: use axios if present in package.json, otherwise native fetch. No other HTTP libs.

Store: src/store/index.js → configureStore combining all feature reducers.
main.jsx: wrap <App/> in <Provider store={store}>.
State rule: async → Redux via hook | global UI (toasts) → Redux slice | local UI → useState.

## FILE STRUCTURE
src/main.jsx       → import './index.css' + <Provider>
src/App.jsx        → import './App.css' + router outlets
src/index.css      → @import Google font, :root tokens, body, reset
src/store/index.js → configureStore
src/features/[f]/  → per architecture above
src/components/    → shared layout only (Sidebar, Toast, Layout)

## REACT RULES
Functional components + hooks only. JSX: className, htmlFor, self-close voids.
export default at bottom. Imports: 1)React/libs 2)components/hooks 3)CSS.
Split components >150 lines. Never hardcode asset paths (import them).
Only use hooks from react or react-redux. No useQuery, no SWR, no Zustand unless in package.json.

## CSS RULES [plain CSS only — no preprocessors, no utility frameworks unless pre-installed]
:root tokens: --color-*, --text-*, --radius-*, --shadow-*, --spacing-*.
Layout: flex or grid only. Mobile-first min-width breakpoints (768/1024).
Animations: CSS keyframes + transitions only. No GSAP, no Framer Motion unless in package.json.
Transitions on all interactive elements. :hover :focus-visible :active on all controls.
CSS loaded via JS imports only (no <link> except @import for Google Fonts inside index.css).
Scrollbars: style with ::-webkit-scrollbar if needed — no library required.

## DESIGN [non-negotiable]
Pick ONE bold aesthetic before writing any code. State it in todo.md header.
FORBIDDEN: purple-on-white gradients, Inter/Roboto/Arial, safe symmetrical layouts, generic card grids.
REQUIRED: distinctive font pairing (display+body from Google Fonts via @import in index.css),
          intentional palette via CSS vars, spatial personality (asymmetry/overlap/grid-breaking),
          transitions on every interaction, atmosphere (shadows/texture/geometry) matching aesthetic.
Font pairings by tone:
  Luxury   → 'Playfair Display'+'Cormorant Garamond' | Techy    → 'Space Grotesk'+'JetBrains Mono'
  Bold     → 'Bebas Neue'+'DM Sans'                  | Brutalist → 'Anton'+'Space Mono'
  Minimal  → 'Outfit'+'Lora'                          | Retro    → 'Orbitron'+'Exo 2'
  Warm     → 'Fraunces'+'Nunito'                      | Playful  → 'Quicksand'+'Poppins'
Load fonts via @import in index.css only. Never repeat a pairing across projects.

## SUMMARY FORMAT [inside last file as comment block — no extra call]
/*
  ✅ Done.
  Aesthetic: [tone + why]
  Packages used: [list only what was actually imported from package.json]
  Feature(s): [name] → service:[endpoints] | slice:[keys] | hook:[handlers] | components:[names]
  Design: font:[pairing] | colors:[palette] | layout:[structure] | interactions:[what moves]
*/`;

// ──────────────────────────────────────────────────────────────────────────────

const agent = createReactAgent({
  llm: model,
  tools: [listFiles, readFile, createFile, updateFile],
  stateModifier: SYSTEM_PROMPT,
});

export default agent;
