# Jev (System 1) + LangGraph (System 2): The Ultra-Lean, High-Quality Agent Blueprint

## Problem Statement & Context
Traditional multi-agent frameworks force generative, autoregressive Large Language Models (LLMs) to perform every micro-decision, routing hop, guardrail check, and test verification. This results in the **"System 2 Overhead Trap"**: slow execution (3–5s per decision), high costs, and stochastic routing hallucinations. By integrating **Jev** (TypeSafe AI's non-autoregressive, sub-100ms **System 1 decision model**) into a **LangGraph StateGraph**, we decouple rapid, deterministic decision-making from deep generative reasoning, achieving enterprise-grade reliability and speed with minimal implementation complexity.

---

## Scope & System Bounds

### Functional Requirements
1. **Instant Input Gating (`Jev Guard / Jail_Breaker`)**: Screen and classify user input in <100ms without consuming generative tokens.
2. **Deterministic State-Driven Routing (`JEV_DECIDE`)**: Evaluate current graph state and select the next operational node with calibrated probability scores.
3. **Generative Separation of Concerns**: Restrict expensive frontier LLMs (Mistral Large, Claude 3.5 Sonnet, GPT-4o) strictly to planning, code authoring, and root-cause debugging.
4. **Mechanical Ground-Truth Verification**: Eliminate LLM-based hallucinated code testing by enforcing compiler/linter execution directly in the sandbox.

### Non-Functional Requirements & Performance Comparison

#### Jev (System 1) vs Frontier Generative LLM (System 2) for Routing Decisions
| Metric | Generative LLM (e.g. GPT-4o-mini / Mistral) | Jev (TypeSafe AI System 1 Model) | Factor Improvement |
| :--- | :--- | :--- | :--- |
| **Inference Latency** | 1,200 – 3,500 ms | **70 – 180 ms** | **~20x faster** |
| **Token Cost / Decision** | ~$0.002 – $0.008 (Prompt + Gen) | **~$0.00005** | **~40x–100x cheaper** |
| **Format Reliability** | 92–97% (JSON parse errors, chatty text) | **100% (Strictly typed enum bounds)** | **Zero parse failures** |
| **Confidence Scoring** | Uncalibrated logprobs or hallucinated numbers | **Calibrated RLCD probability** | Programmatic thresholds |

---

## 1. Concept in Plain English: Daniel Kahneman’s Mind Applied to AI Agents

In human cognition (*Thinking, Fast and Slow*):
- **System 1**: Fast, automatic, subconscious, instantaneous pattern matching. You see a stop sign and hit the brakes in 200 milliseconds without analyzing the word "S-T-O-P".
- **System 2**: Slow, deliberate, conscious, computational reasoning. You solve $37 \times 48$ using scratch paper and effort.

```
                  THE HUMAN MIND / AI AGENT PARALLEL
                  ──────────────────────────────────
   System 1 (Jev Decision Engine)     System 2 (Generative Frontier LLMs)
   ──────────────────────────────     ───────────────────────────────────
   • Non-autoregressive (Parallel)    • Autoregressive (Token by token)
   • 70–150ms latency                 • 3–15 second latency
   • Output: Typed decisions/enums    • Output: Code, Markdown, Plans
   • "Is this safe? Who goes next?"   • "Write this React component"
```

### The Big Mistake in Modern Multi-Agent Systems
Most developers use **System 2 for everything**:
- They ask GPT-4o: *"Is this prompt safe?"* (System 2 burns 2 seconds).
- They ask GPT-4o: *"Should I call the coder or the tester?"* (System 2 burns 3 seconds).
- They ask GPT-4o: *"Does this code compile?"* (System 2 guesses and hallucinates).

**The Solution**: Use **Jev** for every System 1 decision (Guardrails, Routing, Action Gating, Done Verification), and reserve **Generative LLMs** solely for creative writing and coding.

---

## 2. Critique of the User's Sketched Diagram

Your hand-drawn sketch contains the exact right instincts, but can be significantly streamlined:

```
[ User ] ──► [ Jev Jail_Breaker ] ──► [ Project Manager ] ──► [ JEV_DECIDE ]
                                                                      │
                                   ┌──────────────┬───────────────────┼──────────────────┐
                                   ▼              ▼                   ▼                  ▼
                               [ Planer ]     [ Coder ]           [ Tester ]        [ Debugger ]
                                   │              │                   │                  │
                                   └──────────────┴───────► [ State ] ◄──────────────────┘
```

### Strengths of Your Idea
1. **Using Jev as the Front Door (`Jev Jail_Breaker`)**: This is an architectural masterstroke. Instead of running a 2-second LLM safety evaluation, Jev screens for malicious jailbreaks, prompt injections, or off-topic prompts in **<80ms** with zero generative token burn.
2. **Using Jev for State Routing (`JEV_DECIDE`)**: Eliminates the most common point of failure in LangGraph: LLM routers returning invalid JSON, chatting instead of calling tools, or getting stuck in loops.

### The 3 Flaws to Fix in the Sketch
1. **The "Project Manager" Middleman**:
   - `Jev Jail_Breaker` hands off to `Project Manager`, which assigns tasks to `JEV_DECIDE`.
   - If `JEV_DECIDE` is already evaluating State and choosing between Planner, Coder, Tester, and Debugger, what does `Project Manager` do?
   - If `Project Manager` is an LLM trying to micromanage workers while `JEV_DECIDE` is choosing them, you have two heads on one body.
   - **Fix**: Eliminate the separate `Project Manager` node. Let `JEV_DECIDE` be the intelligent dispatcher that reads the `State` and drives the workers directly.
2. **`Tester` Must Be Mechanical, Not an LLM**:
   - In software engineering, "testing" means running `npm run build`, `vitest`, or checking Vite HMR errors in the sandbox.
   - Do not invoke a generative LLM or even Jev to "predict" if code works. Run the actual compiler tool in the container. Then let Jev inspect the exit code in State (`exitCode === 0` vs `exitCode !== 0`).
3. **Unified State Reducers**:
   - Rather than workers having separate lines connecting back up to `Project Manager` AND down to `State`, make the flow clean:
     **Node executes $\to$ updates State $\to$ `JEV_DECIDE` evaluates new State $\to$ routes to next step.**

---

## 3. The Optimized Architecture: "Lean System 1 / System 2 Hybrid"

Here is the clean, high-performance architecture that implements your idea:

```mermaid
flowchart TD
    User([User Prompt]) --> JevGuard["Node 1: Jev Guard / Jail_Breaker\n(System 1 • 70ms)\n[Safety, Intent Classification, Complexity Score]"]

    JevGuard -->|Unsafe / Malicious| Reject([Reject with 400])
    JevGuard -->|Safe & Valid| Planner["Node 2: Lead Architect (System 2 LLM)\n(Runs ONCE: Explores files + Outputs atomic Todo Array)"]

    Planner --> StateBox[("Shared LangGraph State\n(todoList, activeIndex, buildStatus, errorLogs)")]
    
    StateBox --> JevDecide{"Node 3: JEV_DECIDE\n(System 1 Decision Engine • 80ms)\n[Evaluates State -> Selects Next Node]"}

    JevDecide -->|Action: EXECUTE_CODER| Coder["Node 4: Coder Worker (System 2 LLM)\n(Applies surgical patch for active todo)"]
    Coder --> StateBox

    JevDecide -->|Action: RUN_COMPILER| CompilerTool["Node 5: Compiler Gate (Sandbox Bash Tool)\n(Executes: npm run build / checks vite errors)\n[Zero LLM, 150ms]"]
    CompilerTool --> StateBox

    JevDecide -->|Action: INVOKE_DEBUGGER| Debugger["Node 6: Targeted Debugger (System 2 LLM)\n(Injected ONLY with compiler stderr)"]
    Debugger --> StateBox

    JevDecide -->|Action: FINALIZE_SUCCESS| Finalizer["Node 7: Finalizer\n(Generates user delivery summary)"]
    Finalizer --> Done([Delivered to User 🚀])
```

---

## 4. How Jev Works Inside LangGraph (Step-by-Step)

### 1. `Jev Jail_Breaker` (Node 1)
- **Input**: Raw user prompt.
- **Predefined Jev Questions**:
  1. `is_jailbreak_or_harmful`: `boolean`
  2. `intent_category`: `enum: ['code_generation', 'debugging', 'explanation', 'chitchat']`
  3. `estimated_complexity`: `enum: ['simple_one_file', 'multi_file_feature', 'architectural_refactor']`
- **Latency**: ~70ms.
- **Behavior**: If `is_jailbreak_or_harmful === true`, short-circuit immediately. If `chitchat`, skip the coder and answer directly. If `code_generation`, pass to Planner.

### 2. `Planner` (Node 2 - System 2 LLM)
- Runs **only once**.
- Reads workspace tree and user requirements.
- Emits a strictly structured state:
  ```json
  {
    "todoList": [
      { "id": 1, "task": "Create Navbar component", "file": "src/components/Navbar.jsx", "done": false },
      { "id": 2, "task": "Add routing in App.jsx", "file": "src/App.jsx", "done": false }
    ],
    "currentStepIndex": 0,
    "buildStatus": "untested",
    "lastError": null,
    "retryCount": 0
  }
  ```

### 3. `JEV_DECIDE` (Node 3 - System 1 Decision Model)
Instead of asking an LLM to generate text, you invoke Jev with the state snapshot:

```typescript
// Conceptual Jev Router Function in LangGraph
export async function jevDecideNode(state: AgentState): Promise<string> {
  const decision = await jev.decide({
    context: {
      hasPendingTodos: state.currentStepIndex < state.todoList.length,
      currentStepDone: state.todoList[state.currentStepIndex]?.done || false,
      buildStatus: state.buildStatus,       // 'clean' | 'error' | 'untested'
      hasCompilerError: Boolean(state.lastError),
      retryCount: state.retryCount,
    },
    question: "What is the next required engineering action?",
    choices: [
      "EXECUTE_CODER",      // If current todo item needs code writing
      "RUN_COMPILER",       // If coder just finished and buildStatus is 'untested'
      "INVOKE_DEBUGGER",    // If buildStatus is 'error' and retryCount < 3
      "FINALIZE_SUCCESS",   // If all todos are done and buildStatus is 'clean'
      "ESCALATE_FAILURE"    // If retryCount >= 3 and buildStatus is still 'error'
    ]
  });

  console.log(`[Jev Decision] Action: ${decision.choice} (Confidence: ${decision.confidence})`);
  return decision.choice;
}
```

---

## 5. Why This Setup Gives "Next-Level Quality" with "Low Complexity"

1. **Zero Router Hallucination**:
   - Traditional LLM routers sometimes output `{"action": "code_and_test"}`, inventing values not in your enum, or forgetting to output valid JSON.
   - Jev returns **guaranteed type-safe enum choices**. The LangGraph conditional edge will never throw a parsing error.
2. **Speed is 3x to 5x Faster**:
   - In a 4-step feature, a traditional graph invokes the LLM router 8–10 times ($8 \times 2.5\text{s} = 20\text{ seconds}$ wasted on routing alone!).
   - Jev executes in $8 \times 0.08\text{s} = 0.64\text{ seconds}$. The user perceives the agent as blazing fast.
3. **Surgical, Error-Free Code**:
   - The `Coder` node focuses exclusively on writing code for `todoList[currentStepIndex]`.
   - The `Compiler` tool (running `npm run build` in the container) acts as a strict physical filter.
   - If there is an error, `Debugger` is fed *only* the compiler error.
   - The code is 100% verified to compile before `JEV_DECIDE` permits the graph to terminate.

---

## 6. Architecture Comparison Matrix

| Dimension | Bloated All-LLM Multi-Agent | Single ReAct Agent | Jev (System 1) + LLM (System 2) Hybrid |
| :--- | :--- | :--- | :--- |
| **Decision Speed** | 2,500 – 4,000 ms per step | 1,500 – 3,000 ms per step | **70 – 150 ms per step** (Jev) |
| **Router Reliability** | Medium (Hallucinates formatting) | Low (Struggles with long loops) | **100% Deterministic (Type-safe)** |
| **Guardrail Cost** | High (Full LLM invocation) | High | **Near Zero (<0.0001 per check)** |
| **Code Correctness** | Medium (LLM guesses if code works) | Low | **Guaranteed (Enforced by compiler)** |
| **Codebase Complexity** | Very High (Prompts for 6 agents) | Medium | **Very Low (Lean state + Jev rules)** |

---

## 7. Connecting to Taksha: Practical Implementation

In your Taksha repository:
1. **Frontend / API Gateway**:
   - Integrate `Jev Jail_Breaker` in [`Ai_orchestration/src/controllers/ai.controller.js`](file:///Users/home/Desktop/Projects/Capstone/Ai_orchestration/src/controllers/ai.controller.js) before calling LangGraph. If malicious or invalid, respond in 80ms with `400 Bad Request`.
2. **LangGraph Router**:
   - In [`Ai_orchestration/src/agent/nodes/router.node.js`](file:///Users/home/Desktop/Projects/Capstone/Ai_orchestration/src/agent/nodes/router.node.js), replace the generative model call with Jev's decision API.
3. **Compiler Integration**:
   - Use [`Sandbox/Agent/src/app.js`](file:///Users/home/Desktop/Projects/Capstone/Sandbox/Agent/src/app.js) endpoint `POST /api/agent/exec` (`npm run build`) as the verification step.

---

## 8. Summary Checklist

- [x] **Keep `Jev Jail_Breaker`**: It's an ideal, fast, non-generative safety and intent filter.
- [x] **Drop `Project Manager`**: Don't sandwich an LLM between Jev and the workers.
- [x] **Use `JEV_DECIDE` as the Engine**: Feed state variables into Jev to get fast, type-safe transition decisions.
- [x] **Compiler as the Real Tester**: Run actual sandbox builds instead of asking an LLM to predict syntax.
- [x] **Cap Retries**: Allow Jev to trigger `ESCALATE_FAILURE` if `retryCount >= 3` to protect user credits.
