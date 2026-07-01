# SKILL: Dexie.js / IndexedDB

TRIGGER: Any task involving client-side persistence — chat history, agent
sessions, cached tool outputs, offline data, embeddings cache, or replacing
localStorage/sessionStorage with something that survives large data volumes.

Default choice: Dexie.js. Never use raw IndexedDB directly. Never use
localStorage for anything beyond trivial single-value UI prefs (theme, last
tab). If asked to "store X in the browser" and X is structured, growing, or
queried — this is a Dexie job, not a localStorage job.

---

## 1. SETUP — one file, one source of truth

Create exactly one `db.js` (or `db.ts`) per app. Never instantiate `new Dexie(...)`
in more than one place.

```js
// db.js
import Dexie from 'dexie';

export const db = new Dexie('AppDB');

db.version(1).stores({
  sessions: '++id, projectId, createdAt, title',
  messages: '++id, sessionId, role, createdAt',
  toolCalls: '++id, messageId, toolName, status',
});
```

RULES:
- Only index (list in the schema string) fields you will actually `.where()` on.
  Every extra index costs write performance for no benefit.
- `++id` = auto-increment primary key. Use this unless the data already has a
  natural unique key (e.g. a server-issued UUID) — then use that field as PK
  instead and drop `++id`.
- Compound indexes use brackets: `'[sessionId+createdAt]'` — required for
  queries filtering on two fields at once. Add these ONLY when a query
  actually needs them; don't pre-emptively add compound indexes.
- Never put large blobs (full file contents, big JSON payloads) in an indexed
  field. Store them in an unindexed field or a separate table.

---

## 2. SCHEMA MIGRATIONS — never skip versioning

When a schema needs to change, NEVER edit `version(1)` in place. Always add a
new version block:

```js
db.version(1).stores({
  messages: '++id, sessionId, createdAt',
});

db.version(2).stores({
  messages: '++id, sessionId, createdAt, role', // added 'role' index
}).upgrade(tx => {
  // Backfill the new field for existing rows — required whenever old rows
  // won't have the new field populated correctly by default.
  return tx.table('messages').toCollection().modify(msg => {
    if (!msg.role) msg.role = 'user';
  });
});
```

RULES:
- Every version bump that adds/removes an index needs its own `.version(N)` block.
- If a version doesn't need data migration (pure additive schema), you can
  omit `.upgrade()` — Dexie handles the index rebuild automatically.
- NEVER delete an old `.version()` block once shipped — users may still be on
  that version and Dexie needs the full chain to migrate them forward.
- If unsure whether a migration needs `.upgrade()`, add it anyway with a
  no-op modify — cheap insurance against silently missing/undefined fields.

---

## 3. WRITES — always transactional for multi-table operations

Single-table write → plain `.add()` / `.put()` / `.bulkAdd()` is fine.

Multi-table write (a message + its tool calls, a session + its first message)
→ MUST be wrapped in `db.transaction()`. Never do sequential un-transacted
writes across tables — a crash/refresh between them leaves orphaned data.

```js
async function saveAgentTurn(sessionId, message, toolCalls) {
  await db.transaction('rw', db.messages, db.toolCalls, async () => {
    const messageId = await db.messages.add({ sessionId, ...message, createdAt: Date.now() });
    if (toolCalls?.length) {
      await db.toolCalls.bulkAdd(toolCalls.map(tc => ({ messageId, ...tc })));
    }
  });
}
```

RULES:
- List every table you touch in the transaction signature (`db.messages, db.toolCalls`).
  Missing one causes a runtime error, not a silent bug — read the error and fix it,
  don't work around it.
- Use `bulkAdd`/`bulkPut` for arrays of records, never a `for` loop of individual
  `.add()` calls — bulk methods are a single IDB transaction internally and are
  dramatically faster.
- `.put()` overwrites by primary key (upsert). `.add()` throws if the key exists.
  Use `.put()` when the caller isn't sure if the record already exists.

---

## 4. READS — live queries in React, plain queries elsewhere

Inside React components/hooks, ALWAYS use `useLiveQuery` from `dexie-react-hooks`
instead of manual `useEffect` + `.then()` + `useState`. Live queries
auto-recompute when underlying data changes — no manual invalidation needed.

```js
import { useLiveQuery } from 'dexie-react-hooks';

function useSessionMessages(sessionId) {
  return useLiveQuery(
    () => db.messages.where('sessionId').equals(sessionId).sortBy('createdAt'),
    [sessionId] // dependency array — re-run when sessionId changes
  );
}
```

RULES:
- `useLiveQuery` returns `undefined` while loading — always guard for that in
  the component (`if (!messages) return <Spinner />`), never assume it's an array.
- Never call `useLiveQuery` conditionally or inside a loop — same rules as any
  other hook.
- Outside React (service workers, plain JS logic, agent-side code) — just
  `await db.table.where(...).toArray()` directly. Don't reach for
  `useLiveQuery` outside component/hook code.
- Prefer `.where('field').equals(x)` over `.filter()` — `.where()` uses the
  index (fast), `.filter()` does a full table scan (slow). Only use `.filter()`
  for conditions that genuinely can't be expressed as an indexed query.

---

## 5. DELETES — cascade manually, Dexie doesn't do it for you

IndexedDB has no foreign keys or cascading deletes. Deleting a session does
NOT delete its messages automatically — you must do it explicitly, in a
transaction:

```js
async function deleteSession(sessionId) {
  await db.transaction('rw', db.sessions, db.messages, db.toolCalls, async () => {
    const messages = await db.messages.where('sessionId').equals(sessionId).toArray();
    const messageIds = messages.map(m => m.id);
    await db.toolCalls.where('messageId').anyOf(messageIds).delete();
    await db.messages.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}
```

RULE: Any table with a "belongs to" relationship (messages belong to a
session) needs an explicit cascade delete function. Never delete a parent
record without checking for orphaned children.

---

## 6. ERROR HANDLING — Dexie errors are typed, use that

```js
import Dexie from 'dexie';

try {
  await db.sessions.add(session);
} catch (err) {
  if (err.name === 'ConstraintError') {
    // Primary key collision — record already exists
  } else if (err instanceof Dexie.DexieError) {
    // Any other Dexie-specific failure (quota, version conflict, etc.)
  } else {
    throw err; // unexpected — don't swallow silently
  }
}
```

RULE: Never wrap Dexie calls in a bare `try { } catch { }` that silently
discards the error. At minimum, log `err.name` and `err.message` — silent
failures here are how agents lose data without knowing it.

---

## 7. STORAGE QUOTA — check before bulk writes

Dexie does not manage browser storage quota. Before any bulk import or
long-running write session (e.g. importing a large agent history), check
available space:

```js
async function checkStorageBudget() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  const percentUsed = (usage / quota) * 100;
  if (percentUsed > 80) {
    // Warn the user or the calling agent — don't proceed blindly
    return { warning: true, percentUsed };
  }
  return { warning: false, percentUsed };
}
```

Also call `navigator.storage.persist()` once at app init for data the user
would be upset to lose (chat history, agent sessions) — this reduces the
chance the browser evicts it under storage pressure.

---

## 8. WHAT NOT TO DO

- NEVER use `localStorage`/`sessionStorage` for anything beyond a single
  small UI preference value.
- NEVER instantiate more than one `Dexie` instance for the same database name.
- NEVER edit an already-shipped `.version(N)` block — always add a new version.
- NEVER do multi-table writes without `db.transaction()`.
- NEVER use `.filter()` when `.where()` can express the same query.
- NEVER assume `useLiveQuery` returns data synchronously — it's `undefined`
  until resolved.
- NEVER delete a parent record without cascading to its children manually.
- NEVER store data you can't afford to lose without also calling
  `navigator.storage.persist()`.

---

## 9. QUICK REFERENCE — method cheatsheet

| Need | Method |
|---|---|
| Insert one, fail if exists | `.add(obj)` |
| Insert or overwrite | `.put(obj)` |
| Insert many | `.bulkAdd([...])` |
| Insert/overwrite many | `.bulkPut([...])` |
| Query by indexed field | `.where('field').equals(x)` |
| Query by indexed field, sorted | `.where('field').equals(x).sortBy('other')` |
| Query by two indexed fields | `.where('[a+b]').equals([x, y])` (needs compound index) |
| Full scan filter (last resort) | `.filter(fn)` |
| Multi-table atomic write | `db.transaction('rw', tableA, tableB, async () => {...})` |
| React live-updating query | `useLiveQuery(() => query, [deps])` |
| Delete by primary key | `.delete(id)` |
| Delete by query | `.where('field').equals(x).delete()` |