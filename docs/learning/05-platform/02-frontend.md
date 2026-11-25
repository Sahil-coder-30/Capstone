# Platform 2: the two frontends

> **Shipped:** IDE Jun–Jul 2026; payments app Jul 2026, rebuilt Nov 2026 · **Commits:** `010a3a8` (SSE client) `158fcdc` (Orion panel split) `ec656f3` (perf) `7cd5d3c` `9ff8154` (payments app, cache) `1063098` (MCP from the editor) `3878c4f` `9279491` (Connect agent)
> **Code:** `Frontend/` (React 19, Redux Toolkit, Vite :5173), `payments_frontend/` (:5174, base `/payments/`)
> **One line:** an IDE (editor, terminal, preview, Orion and Clio) and a separate billing app.

## 1. Structure

Feature folders: `features/<name>/{components, Hooks, service, slice}` (auth, editor, sandbox, coding-agent, copilot, chat-history, logs, settings, dashboard, payments). SCSS with design tokens in `src/styles/tokens.scss`. The access token lives in memory in `services/apiClient.js`, which refreshes once on 401 and retries.

The billing app was split out in July 2026 as a micro frontend (`cda3301`, `9bb95b9`). What that buys: billing ships on its own, Razorpay's script loads only there, and the IDE bundle stays smaller.

## 2. Things worth explaining

**Agent stream client** (`coding-agent/Hooks/codingAgent.hooks.js`). Uses `fetch` with a streamed body, not `EventSource`, because invoke is a POST and needs the `Authorization` header (EventSource can do neither). It parses SSE frames itself, remembers the last `id`, and reconnects with a `Last-Event-ID` header. Switching chats closes only this tab's stream; the run keeps going on the server.

**Editor talks MCP.** File tree, editor and logs call the sandbox's MCP tools with a tiny JSON-RPC `tools/call` helper through `apiClient`, so the token and refresh logic still apply. Results keep the old REST shapes, so components did not change.

**Orion panel split** (`158fcdc`). One 1,570-line component with a 3,742-line stylesheet became 21 components with hooks and pure utils. Streaming re-renders only the live run through a memoised `RunItem`.

**Performance fix** (`ec656f3`). The dashboard animated `border-radius` on elements with 90–140 px blur, so the blur was repainted every frame; a conic-gradient border animated an `@property` angle on the main thread. Fix: animate only `transform` and `opacity` (compositor-only), and spin a pre-painted gradient with `rotate()`. p95 frame time went from 28–67 ms to 7–9 ms.

**Billing cache** (`9ff8154`). One keyed store saved to `localStorage`, each resource with a freshness window (credits 1 min, payments 10 min). Fresh data: no request. Stale: show at once, refetch in the background (stale-while-revalidate). In-flight requests are shared. Recheck on tab focus and network return. No tokens are stored; the cache is wiped on sign-out or when a different user signs in; other tabs sync through the `storage` event.

**Honest API layer.** The payments app used to return fake fallback data on errors (fake credits, a hardcoded Razorpay test key). Removed: errors now reach the UI with retry.

## 3. Interview questions

**Q1. Why not `EventSource` for the agent stream?**
A: EventSource only does GET and cannot set headers, and our token is in memory, not a cookie. So I use `fetch` with a readable stream, parse frames myself and send `Last-Event-ID` on reconnect, which gives the same replay behaviour.

**Q2. How did you find and fix the jank?**
A: Measured frame times in a headless browser, found the expensive paints (animated blur and an animated gradient angle), and moved those animations to compositor-only properties. p95 dropped from up to 67 ms to under 10 ms.

**Q3. You cache billing data in localStorage. What are the risks?**
A: Showing stale or another user's data, and leaking secrets. So entries have freshness windows and are revalidated, the cache records its owner and is wiped on sign-out or user change, entries over 24 h are dropped, and no tokens are stored. Money actions (a finished payment) force a fresh fetch.

**Q4. How do you keep one 1,500-line component maintainable?**
A: Split by area into small components with their own styles, move logic into hooks and pure functions that can be tested, and memoise the part that re-renders on every stream event so the rest of the panel stays still.

## 4. Revise in 60 seconds

- React 19 + Redux Toolkit, feature folders, tokens; access token in memory.
- Agent stream: fetch + manual SSE parse + `Last-Event-ID`.
- Editor uses the same MCP tools as Orion.
- Perf: animate transform/opacity only; 67 ms → 9 ms p95.
- Billing cache: stale-while-revalidate in localStorage, owner-scoped, no tokens.
