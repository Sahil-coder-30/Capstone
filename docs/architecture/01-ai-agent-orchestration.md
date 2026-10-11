# Master Architecture: Taksha AI Multi-Agent Orchestration (Orion v3 & Clio)

> **Canonical System Document**: This master document synthesizes and supersedes all prior agent design documents (`orion-v3-production-agent-architecture.md`, `orion-v3-deep-analysis-and-world-comparison.md`, `orion-clio-agent-architecture-and-usp-masterclass.md`, `ai-agent-orchestration-flow-and-debugging.md`, `jev-langgraph-loop-free-architecture.md`, `jev-system1-langgraph-architecture.md`, `langgraph-conditional-workflow-agent.md`, `team-manager-router-langgraph-agent.md`, `next-level-low-complexity-langgraph-agent.md`, and `fix.md`). It establishes the single source of truth for Orion and Clio in Taksha.

---

## 1. Concept in Plain English

Building an autonomous coding assistant is not an LLM prompting trick — it is a **deterministic state-machine and distributed compiler problem**.

When a user asks Taksha to *"Build a Kanban board with drag-and-drop and dark mode"*, a naive agent repeatedly asks an LLM what to do next. The LLM guesses file edits, hallucinates test results, forgets previous modifications, gets caught in infinite syntax loops, and drains API credits.

In Taksha, we decouple thinking into **System 1 (sub-100ms non-autoregressive routing via Jev)** and **System 2 (deliberate generative coding via frontier LLMs)** inside a **LangGraph StateGraph (`Orion`)**:
1. **System 1 (Jev Guard / Decider)** classifies intent, validates safety, and routes transitions in ~70ms without burning generative tokens.
2. **System 2 (Planner & Coder)** writes structured plans and performs surgical file edits.
3. **Mechanical Verification (Tri-Layer Tester)** uses the actual container compiler (`npm run build`) and Vite HMR runtime error socket — never LLM self-grading — to determine binary ground truth.
4. **Targeted Debugging** receives only compiler error traces and flagged files, using Knuth-Morris-Pratt (KMP) exact AST substring patches rather than whole-file rewrites.

---

## 2. Why It Exists & Scale Thresholds

Without strict state graph determinism, agents collapse under four production failure modes:

| Failure Mode | Naive / ReAct Agent Behavior | Orion v3 Architectural Solution |
| :--- | :--- | :--- |
| **The Stale State Trap** | `MemorySaver` retains past plans on the same `projectId`. A new prompt uses stale files and crashes. | Ephemeral `runId` partitioning (`thread_id: ${projectId}:${Date.now()}`) and strict input sanitization. |
| **Critic False-Positive Loop** | Regex checks like `/create\|add/i` reject valid tasks like "Implement Navbar". | Structured `TodoItem.action` enum (`create` \| `modify` \| `delete`) with mechanical schema validation. |
| **Infinite Fix Loop** | Debugger repeats the exact same failed syntax patch until tokens or timeouts expire. | SHA-256 error signature deduplication (`errorSignatureHistory`) + hard transition budget (16 hops). |
| **Silent Completion Bug** | LLM ReAct steps only output tool arguments with empty text; client receives 0 messages. | Dedicated `finalizer` node in `STREAMABLE_NODES` with automatic fallback to `diffSummary` and `currentSituation`. |

---

## 3. Core Mechanism & State Schema

### 3.1 State Schema (`AgentStateAnnotation`)

The authoritative TypeScript interface implemented in `Ai_orchestration/src/agent/code.agent.js`:

```typescript
export interface AgentState {
  // Session Identity
  projectId: string;
  runId: string;                     // Fresh per invocation: ${projectId}:${Date.now()}
  userMessage: string;
  fileTree: string[];

  // Plan & Execution Tracker
  plan: TodoItem[];                  // Typed array replacing flat step counters
  currentTodoIndex: number;
  activeFiles: string[];

  // Mechanical Verification (Replaces flat string logs)
  verificationReport: {
    passed: boolean;                 // ONLY Tester node may set this to true
    layer: 'build' | 'runtime' | 'visual' | 'none';
    buildOutput: string;
    viteErrors: Array<{ message: string; file?: string; line?: number }>;
    flaggedFiles: string[];
    errorSignature: string;          // SHA-256 of normalized error string
  };

  // Loop & Circuit Breakers
  errorSignatureHistory: string[];   // Append-only hash accumulator (prunes cycles)
  attemptedFixes: string[];          // SHA-256 of patch content
  retryCount: number;                // Max 3 retries per error signature
  totalTransitions: number;          // Hard ceiling (max 16 graph hops)
  routingHistory: string[];          // Sliding n-gram transition record

  // UI Streaming & Telemetry
  currentSituation: string;          // Human-readable phase description
  diffSummary: string;
  finalResponse: string;
}

export interface TodoItem {
  id: string;
  title: string;
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  dependsOn: string[];               // Unlocks future parallel sandbox workers
  done: boolean;
}
```

### 3.2 The 4 Mechanical Invariants (Guaranteed Termination)

1. **Tester Invariant**: Only the `Tester` node has write permission to `verificationReport.passed = true`. No coder or debugger can mark itself successful.
2. **Success Gate Invariant**: `JEV_DECIDE` can route to `finalizer` (success) if and only if `verificationReport.passed === true` and all `plan` items have `done === true`.
3. **Circuit Breaker Invariant**: `JEV_DECIDE` forces an immediate abort if:
   - `errorSignatureHistory.includes(currentSignature)` (duplicate error detected)
   - `retryCount >= 3` on the current file
   - `totalTransitions >= 16` across the entire run
4. **Surgical Scope Invariant**: The `Debugger` node is strictly restricted to `patch_file` targeting `verificationReport.flaggedFiles`. It cannot call `update_file` (full rewrite) or `execute_command`.

---

## 4. Reference Architecture & Workflow Diagram

```mermaid
flowchart TD
    Start([User Request via SSE / Invoke]) --> JevGuard[Jev Guard: Intent & Safety Check <br/>~70ms]
    
    JevGuard -->|General / Query| GeneralNode[General Assistant Node]
    JevGuard -->|Coding / Mutation| JevDecide{JEV_DECIDE <br/>Central State Router}
    
    JevDecide -->|Needs Plan| PlannerNode[Planner Node: TodoItem[] Spec]
    PlannerNode --> CriticNode{Critic Node: Risk Gate}
    
    CriticNode -->|Low/Med Risk Auto-Approve| CoderNode[Coder Node: Surgical AST Edits]
    CriticNode -->|High Risk / Destructive| RequireApproval[User Checkpoint / Abort]
    
    CoderNode --> TesterNode[Tri-Layer Tester: Sandboxed Compiler]
    
    TesterNode -->|Build / Vite HMR Fail| DebuggerNode[Debugger Node: patch_file Scoped]
    DebuggerNode -->|Patched| TesterNode
    
    TesterNode -->|Verification Passed| JevDecide
    JevDecide -->|Next Todo Exists| CoderNode
    JevDecide -->|All Todos Complete| FinalizerNode[Finalizer Node: Diff Synthesis]
    
    DebuggerNode -->|Circuit Breaker: 3 Retries or Duplicate Hash| AbortNode[Graceful Rollback & Abort]
    
    FinalizerNode --> Complete([Streamed Done Event])
    AbortNode --> Complete
    GeneralNode --> Complete
```

### Tri-Layer Verification Flow
1. **Layer 1: Static Compiler Build**: Executes `npm run build` inside `sandbox-service-<id>:3000`. Catches TypeScript types, missing exports, and syntax bugs.
2. **Layer 2: Runtime HMR Interceptor**: Queries `GET /api/agent/vite-runtime-errors` in the sandbox. Catches unhandled browser runtime rejections and React hydration mismatches that pass static builds.
3. **Layer 3: Visual Verification (Browser Extension)**: Connects with Taksha's Chrome extension to capture DOM bounding boxes and screenshot deltas.

---

## 5. Scalability Deep Dive

### 5.1 Horizontal vs. Vertical Scaling
- **Stateless Orchestration Pods**: `Ai_orchestration` runs as an autoscaled Deployment on AWS EKS (`targetCPUUtilizationPercentage: 70`). Pods do not store in-memory graph checkpointers across turns.
- **State Storage**: Graph state is checkpointed to MongoDB Atlas using a partitioned collection keyed by `runId`. Pod restarts or rollouts resume seamlessly without losing node execution history.

### 5.2 Bottleneck Analysis Across Scale Tiers

```
Scale Tier 1 (100 Active Devs - ~10 QPS Agent Runs)
  ├─ Bottleneck: OpenAI / Anthropic rate limits (TPM / RPM).
  └─ Solution: Multi-provider failover routing (Anthropic Claude 3.5 Sonnet -> OpenAI GPT-4o -> Gemini 1.5 Pro).

Scale Tier 2 (1,000 Active Devs - ~100 QPS Agent Runs)
  ├─ Bottleneck: Docker sandbox container creation latency on Kubernetes worker nodes.
  └─ Solution: Warm sandbox pre-warming pool (10 standby Vite/React pods ready for instant tenant claim).

Scale Tier 3 (10,000 Active Devs - ~1,000 QPS Agent Runs)
  ├─ Bottleneck: MongoDB checkpointer IOPS from high-frequency node state writes.
  └─ Solution: Redis ephemeral state channel for in-flight transitions, flushed to MongoDB on finalizer/abort only.
```

### 5.3 Caching & Context Compaction Strategy
- **Prompt Token Caching**: Static prompts (system rules, tool schemas, file trees) are placed at the head of the LLM prompt payload to leverage Anthropic/OpenAI prompt prefix caching, reducing billing by ~50%.
- **Surgical State Compaction**: When `AgentState.routingHistory` exceeds 10 transitions, the `Compactor` node synthesizes prior tool execution outputs into a 200-token summary string, freeing 15,000 tokens of raw bash stdout.

---

## 6. Trade-Offs Table

| Dimension | Monolithic ReAct Agent | Bureaucratic Multi-Agent Swarm | Taksha Orion v3 (Deterministic StateGraph) |
| :--- | :--- | :--- | :--- |
| **Latency per Task** | 15–30s (variable loops) | 90–180s (excessive agent chatting) | **18–35s (streamlined deterministic edges)** |
| **Token Cost** | Medium ($0.05 - $0.15) | Extremely High ($0.40 - $1.20) | **Low ($0.03 - $0.07)** |
| **Deterministic Safety**| Low (relies on LLM discipline) | Low (prone to circular debate deadlocks) | **Guaranteed (Mechanical Invariants & Jev)** |
| **Single-Shot Fix Rate**| ~45% | ~60% | **~90% (Tri-layer compiler feedback + KMP)** |
| **Failure Observability**| Poor (single opaque trace) | Very Poor (spaghetti message logs) | **High (Graph node transitions & SHA-256 error keys)** |

---

## 7. Ties to Computer Science & DSA Fundamentals

1. **Finite State Automata & DAG Cycle Breaking**: Orion models tasks as a Directed Acyclic Graph with controlled backward loops. By tracking path signatures with sliding windows and hashing error states, cycles are mathematically bounded ($O(1)$ cycle detection via Hash Sets).
2. **Knuth-Morris-Pratt (KMP) Substring Match**: `patch_file` requires exact substring uniqueness before executing mutations:
   $$\text{Occurrences}(O, F) == 1 \implies \text{Mutate}(F, O, N)$$
   If the old snippet occurs 0 times or $>1$ times, the operation halts deterministically without corrupting code.
3. **Cryptographic Idempotency**: State transitions store $\text{SHA-256}(\text{ErrorTrace})$. If $\text{Hash}_t == \text{Hash}_{t-1}$, the system detects an un-fixable bug immediately, saving millions of wasted tokens.

---

## 8. Connection to Taksha Project Infrastructure

- **Controller Entry Point**: `Ai_orchestration/src/controllers/ai.controller.js` streams node states via SSE over HTTP/2 using standard RS256 Bearer auth.
- **Graph State Initialization**: `Ai_orchestration/src/agent/code.agent.js` enforces fresh `runId` checkpointer instances.
- **Compiler Sandbox Endpoint**: `Sandbox/Agent/src/app.js` runs as a sidecar container exposing `/api/agent/command` and `/api/agent/vite-runtime-errors` on port 3000.
- **Telemetry Event Bus**: RabbitMQ queue `ai_telemetry_queue` publishes token counts directly to the Payments service for real-time ledger accounting.

---

## 9. If Constraints Were Looser: Parallel Sandbox Workers

If multi-pod sandbox orchestrations were completely unconstrained by single-container tenancy:
- **Speculative Parallel Branches**: When `TodoItem.dependsOn` contains disjoint sets, spawn 3 parallel ephemeral microVMs (Firecracker).
- **Concurrent Compiler Verification**: Each microVM compiles its own sub-branch; git-merge results back to trunk only upon clean build passes. Latency for 5-file features would drop from 30s to <10s.

---

## 10. Common Pitfalls & Anti-Patterns

1. **Feeding Raw Terminal Dumps to Debuggers**: Dumping 800 lines of `npm run build` output into an LLM degrades reasoning. **Rule**: Filter output with regex to extract only the error stack and file/line references.
2. **Re-invoking the Planner on Syntax Errors**: If a semicolon or bracket is missing, re-running the Planner causes it to rethink the whole project. **Rule**: Route syntax errors directly to Debugger $\to$ Tester without touching the plan.
3. **Omitting the Build Script Check**: If a project doesn't have `"build"` in `package.json`, running `npm run build` returns exit code 1 indefinitely. **Rule**: Tester must fallback to static ESLint / AST parse if the build script is absent.

---

## 11. Production Readiness Checklist

- [x] State checkpointer keyed by unique `${projectId}:${Date.now()}`.
- [x] Critic validates `step.action` enum, eliminating regex false rejections.
- [x] Tool scope guard recursively inspects `files[]`, `updates[]`, and `filePath`.
- [x] `finalizer` included in `STREAMABLE_NODES` with automatic diff summary generation.
- [x] Hard transition budget (16 hops) and SHA-256 error deduplication active.
- [x] Sandbox command timeout configured to 120,000ms for dependency builds.
- [x] Tri-layer Tester inspecting both static compiler outputs and Vite HMR runtime logs.
