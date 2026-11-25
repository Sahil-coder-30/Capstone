# AI 2: chat sessions and the background memory agent

> **Shipped:** 2026-11-12 to 2026-11-16 · **Commits:** `ac9837e` (sessions) `941adf8` (memory agent) `c0a8f22` (platform-paid usage) `337e912` `069f889` (UI) `ad2eee9` (trash) `b5d1aff` (Mongoose 9 fix)
> **Code:** `Ai_orchestration/src/models/chatSchemas.js`, `chatStores.js`, `services/chatSession.service.js`, `services/memory.service.js`, `src/agent/memory/`
> **One line:** many chats per project, each remembering its past without stuffing the whole history into the prompt.

## 1. Data model

```
userId ─► projectId ─► sessionId ─► messages
(from token)  (verified owner)

Orion: chatmessages + orionchatsessions + orionprojectmemories
Clio : copilotchatmessages + cliochatsessions + clioprojectmemories
       (same base schemas, never a shared collection)
```

Every query starts with the verified `userId`. A session is never looked up by id alone.

Routes: `chats/:agentType/sessions` (list with `liveSessionId`, messages, rename, trash, restore, permanent delete), `chats/trash`, `chats/message/*`. Invoke takes an optional `sessionId`; without one the server opens a chat on the first message and announces it (`agent:session`).

## 2. What the model sees each turn

```
[background notes]  project notes (this agent)
                    summaries of its last 20 other chats in this project
                    this chat's summary (once turns fell out of the window)
[history]           last 10 messages: user prompts + final answers only
[task]              the new prompt
```

Tool logs, steps, thinking and error replies stay out of history. Prompts mark notes as background that must be checked against the files.

## 3. The memory agent

After every finished or stopped turn, one structured call on the fast model returns:
- `sessionSummary` (rolling compaction, tracked by `summaryThrough`),
- `title` (first time only, unless the user renamed the chat),
- `projectNotes` (durable facts about the project, per agent).

Jobs run in an in-process queue, one at a time per (agent, user, project). A missed job is covered by the next (it summarises everything after `summaryThrough`). A failed job is only logged. Writes are guarded (match on `summaryThrough`, notes version, `$literal` values) so concurrent jobs never overwrite each other.

Its tokens go to Payments as `agentType: memory`: real tokens recorded, `credits_deducted = 0`, shown to the user as a platform discount.

## 4. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Last 10 messages + summaries | Full history; vector search over all messages | Full history grows cost without bound. Summaries keep context cheap and predictable; vector search adds an embedding call per turn for little gain at this size |
| Only prompts and final answers in history | Include tool logs | Tool logs are huge and stale; the files are the truth |
| Separate collections per agent | One collection with an `agent` field | Orion and Clio have different lifecycles; a bug in one cannot leak into the other's chats |
| Memory runs after the turn, in the background | Summarise inline before replying | The user never waits for bookkeeping |
| Platform pays for memory tokens | Charge the user | The user did not ask for it; charging would feel like hidden cost. Still recorded so cost is visible |
| Old rows without `userId` claimed only after the Sandbox service confirms ownership | Assign to whoever asks first | Otherwise anyone who knew a projectId could take old chats |

## 5. Security fixes found while building

- Rows without `userId` were readable by anyone who knew the `projectId`.
- Message restore and permanent delete did not check the owner.
- `requireOwnedSandbox` now rejects a `projectId` that is not the sandbox's own project.

## 6. Limits

- The memory queue is in process memory (single replica, lost on restart; the next job catches up).
- Stopping a run in another chat: switching chats only closes this tab's stream, the run continues; the composer is locked with an "Open it" link.

## 7. Interview questions

**Q1. How do you give an LLM long-term memory without blowing the context window?**
A: Layers. A sliding window of the last 10 real messages, a rolling summary of older turns in this chat, short summaries of the agent's other recent chats, and a small set of durable project notes. A cheap fast model updates them after each turn in the background.

**Q2. Two memory jobs for the same chat run at once. What stops corruption?**
A: Jobs are serialised per agent, user and project in a queue. And every write is conditional: the summary update only applies if `summaryThrough` still matches what the job read, and notes use a version number. A losing write is dropped; the next job summarises from the stored position, so nothing is missed.

**Q3. How do you make sure one user can never read another's chat?**
A: The `userId` comes only from the verified token and is the first filter of every query; sessions are never fetched by id alone. The project id must belong to the sandbox the user owns, checked against the Sandbox service.

**Q4. Why record usage you do not charge for?**
A: For cost visibility. Payments stores real tokens with zero credits, so analytics show what the memory agent costs the platform, and the user sees it as a discount.

**Q5. What bug did the offline tests miss and why?**
A: Mongoose 9 throws on pipeline updates without an option, so every memory job failed in production while tests passed, because the fake store's `updateOne` was a plain stub. I made the fake enforce the same rule. Fakes must behave like the real dependency where it matters.

## 8. Revise in 60 seconds

- Scope: userId → projectId → sessionId, userId from token, always first.
- Context: 10 messages (prompts + answers) + chat summary + other chats' summaries + project notes.
- Memory agent: one fast-model call after each turn; summary, title, notes; guarded writes.
- Memory tokens recorded, 0 credits.
