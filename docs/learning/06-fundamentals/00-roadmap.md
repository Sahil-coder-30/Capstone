# Fundamentals 0: the 8-week roadmap

> **Goal:** know Node.js from the event loop down to the kernel, the database and the wire, well enough to explain *why* Taksha behaves the way it does and to fix it without help.
> **Time:** about 45 minutes of fundamentals a day, 6 days a week, plus 1–2 DSA questions. Building Taksha continues alongside.
> **Rule that makes this work:** every exercise is written by you, by hand, without AI. You may ask AI to *review* code after it runs. You may never ask it to *write* it.

## Why this order

Node first, because it is the thing you will be asked about most and the thing all of Taksha runs on. Then the layers under Node, from the inside out: the OS (what a process, thread and lock really are), the database (what a transaction really guarantees) and the network (what actually happens between `fetch()` and the reply). Each layer explains a bug or a design decision you already have in Taksha. That is the point: when an interviewer asks "what is a race condition?", you answer with the refresh-token race in your own Auth service, not with a textbook bank account.

| Week | Topic | The Taksha question it answers |
|---|---|---|
| 1 | Event loop phases, microtasks, `nextTick`, libuv threadpool | Why can one slow JWT sign or `JSON.parse` stall every user of Auth? |
| 2 | Buffers, streams, backpressure, `pipeline`, HTTP as streams, SSE | What happens to Orion's SSE stream when the browser reads slower than the agent writes? |
| 3 | `child_process`, `worker_threads`, `cluster`, scaling in k8s | Why is the AI service stuck at one replica, and why `cluster` would not fix it? |
| 4 | V8 pipeline, heap, GC, leaks, CPU and heap profiling | Which maps in the router and AI service grow forever, and how do you prove it? |
| 5 | Processes, threads, signals, containers, locks, races, deadlock | Why can a stopped sandbox lose the last 400 ms of edits? |
| 6 | ACID, MVCC, isolation levels, row locks, indexes, Mongo and Redis atomicity | Why does Payments survive 10 parallel webhooks, and why does Auth refresh not? |
| 7 | TCP, HTTP/1.1 vs 2, keep-alive, DNS, TLS, cookies, proxies | Why is `/api/mcp/<id>` a path and not `*.mcp.localhost`? Why does SSE need a 15 s ping? |
| 8 | Revision, one build-from-scratch project, mock interviews | Can you explain all of Taksha's request path, end to end, from memory? |

## The daily 45 minutes

| Minutes | What | How |
|---|---|---|
| 0–15 | Learn | Open the day's slides with Claude and ask until it is clear. No videos, no AI summaries |
| 15–40 | Do | The day's exercise. Type it yourself, run it, break it on purpose |
| 40–45 | Write | Three lines in your own words in a notebook (paper is better): what I learned, what surprised me, one question I still have |

Sunday: no new topic. Re-answer that week's interview questions **out loud, without notes**, and record yourself (phone voice memo). If you stop for more than 5 seconds or say "basically" twice, that question goes on next week's list.

## The DSA track (1–2 questions a day, separate from the 45 minutes)

One pattern per week. Solve in plain JavaScript, no AI, a timer running (25 min max, then read *one* hint, never the full solution). After solving, say the time and space complexity aloud.

| Week | Pattern | Questions (LeetCode names) | Why it pairs with that week |
|---|---|---|---|
| 1 | Arrays, hashing | Two Sum, Contains Duplicate, Valid Anagram, Group Anagrams, Top K Frequent Elements, Product of Array Except Self | Maps and sets are what you use in every Node service |
| 2 | Sliding window, two pointers | Best Time to Buy and Sell Stock, Longest Substring Without Repeating Characters, Valid Palindrome, 3Sum, Container With Most Water, Minimum Window Substring | A window over a stream is exactly how you think about chunks |
| 3 | Stack, queue | Valid Parentheses, Min Stack, Daily Temperatures, Evaluate Reverse Polish Notation, Implement Queue using Stacks, Sliding Window Maximum | The event loop is queues; the call stack is a stack |
| 4 | Linked list, binary search | Reverse Linked List, Merge Two Sorted Lists, Linked List Cycle, **LRU Cache**, Binary Search, Search in Rotated Sorted Array | LRU Cache is the fix for the router's unbounded proxy map (Week 4) |
| 5 | Trees, BFS/DFS | Max Depth of Binary Tree, Invert Binary Tree, Level Order Traversal, Validate BST, Lowest Common Ancestor of a BST, Kth Smallest in a BST | B-trees next week; the file tree in your IDE is a tree walk |
| 6 | Heaps, intervals | Kth Largest Element, Merge K Sorted Lists, Task Scheduler, Merge Intervals, Insert Interval, Meeting Rooms II | Timers in libuv sit in a min-heap; slots and credit windows are intervals |
| 7 | Graphs | Number of Islands, Clone Graph, **Course Schedule** (topological sort), Rotting Oranges, Network Delay Time (Dijkstra) | Orion's LangGraph is a directed graph; routing on a network is shortest path |
| 8 | DP basics + design | Climbing Stairs, House Robber, Coin Change, Longest Increasing Subsequence, **Design Hit Counter / rate limiter** | The rate limiter is your Redis token bucket |

Keep a sheet with one row per question: date, solved alone (yes/no), time taken, the one idea that unlocked it. Re-solve every "no" two weeks later.

## Where the lessons live

The lessons are a slide deck, not documents: **Node Deep Dive** (https://claude.ai/artifact/75UtA614z479Vv2Xhf1nBv). One day = one 45-minute session that Claude walks through with you. Each day opens with a "today, in this order" slide listing the topics in the order they must be learned (each builds on the one before), then the idea, a code demo to predict and run, a "where it lives in Taksha" slide, and a checklist slide. The teaching detail and the model answers are in each slide's speaker notes.

Weeks are added to the same deck at the start of each week, shaped by what was hardest the week before. Week 1 is ready.

Progress is ticked in [CHECKLIST.md](CHECKLIST.md) at the end of each session.

## Week 8: prove it

No new reading. Four things:

1. **Build `mini-gateway` from an empty folder, no AI, no tutorial (4 days).** A single Node file (no Express) that:
   - proxies `GET/POST /<id>/*` to a fake upstream chosen by `<id>` (validated as one DNS label, like the router's `b9e1817` fix),
   - refreshes a per-id TTL in a `Map` with lazy expiry, and evicts with an LRU cap of 100 entries,
   - rate limits with a token bucket per client,
   - streams an SSE endpoint with `id:` lines, a 15 s ping, `Last-Event-ID` replay from a ring buffer, and real backpressure (stop producing when `res.write()` returns `false`),
   - shuts down cleanly on `SIGTERM` (stop accepting, finish open requests, exit within 10 s).
   Done when: `autocannon` on it shows no growing heap after 5 minutes, and you can kill it mid-load without a dropped request in flight.
2. **Draw Taksha's full request path from memory (1 day).** Browser → DNS → TLS → ingress → router → sidecar → MCP tool → `child_process` → back. Name the protocol, the process, the thread pool or queue, and the failure mode at every arrow. Then compare with [00-overview/system-overview.md](../00-overview/system-overview.md).
3. **Two mock interviews (1 day).** Ask a friend to pick 10 random questions from Weeks 1–7. Rule: answer first in one sentence, then go deeper only if asked.
4. **Fix one real Taksha bug you found during the weeks, by hand** (for example the refresh-token race from Week 5/6), with a test that fails before the fix. That fix is the story you tell in every interview.

## Sources (free or one-time, all primary)

- Node.js docs: "The Node.js Event Loop", "Don't Block the Event Loop", "Backpressuring in Streams" guides, and the API pages for `stream`, `worker_threads`, `child_process`, `cluster`, `perf_hooks`.
- libuv "Design overview" page.
- *Operating Systems: Three Easy Pieces* (OSTEP), free online: processes, threads, locks, condition variables, concurrency bugs.
- PostgreSQL docs: "Concurrency Control" chapter (MVCC, isolation, explicit locking) and "Indexes" chapter. *Use The Index, Luke* (free) for B-tree intuition.
- *Designing Data-Intensive Applications*, chapter 7 (transactions) and chapter 8 (distributed trouble).
- *High Performance Browser Networking* by Ilya Grigorik (free online): TCP, TLS, HTTP/1.1, HTTP/2 chapters.
