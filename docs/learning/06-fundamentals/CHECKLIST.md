# Node Deep Dive: progress checklist

Ticked at the end of each 45-minute session. Slides: https://claude.ai/artifact/75UtA614z479Vv2Xhf1nBv · Plan: [00-roadmap.md](00-roadmap.md)

Each day: study the topics in the listed order first (tick each when you can explain it without notes), then do the exercises. A box that isn't true moves to the next day, first thing. Week N+1 starts only after Week N's gate.

## Week 1: event loop and libuv

**Day 1: what Node really is**

Study in this order (each needs the one before it):
1. [ ] Thread and call stack: one function runs at a time
2. [ ] Sync vs async code: who waits, and where
3. [ ] V8: runs JS, owns the call stack and heap
4. [ ] libuv: the event loop, OS watchers, threadpool
5. [ ] Bindings: how fs, http, crypto reach C++
6. [ ] Waiting work vs computing work
7. [ ] What blocking does to every other request
8. [ ] Taksha: which processes hurt most if blocked

Then do:
- [ ] Explain V8 vs libuv vs bindings in three sentences, no notes
- [ ] Wrote block.js by hand, predicted /fast's time, measured it
- [ ] Swapped the loop for setTimeout; can say why /fast became instant
- [ ] Opened two Taksha files from the Day 1 table; "sync or async, and why" written for each
- [ ] Three lines on paper
- [ ] DSA: Two Sum, Contains Duplicate

**Day 2: the six phases**

Study in this order (each needs the one before it):
1. [ ] The loop as queues of ready callbacks
2. [ ] All six phases at a glance, in order
3. [ ] Timers: min-heap, "not earlier than", 1 ms clamp
4. [ ] Poll: epoll/kqueue, and where the loop sleeps
5. [ ] Check: setImmediate, right after poll
6. [ ] Close callbacks
7. [ ] When the process exits: ref, unref, handles
8. [ ] setTimeout 0 vs setImmediate: random vs fixed

Then do:
- [ ] Drew the six phases from memory, one example callback each
- [ ] Predicted puzzles A and B, ran A 20 times, saw both orders
- [ ] setInterval script made to exit with clearInterval and with unref()
- [ ] "Why a Redis TTL, not setTimeout, for idle sandboxes?" aloud in under a minute
- [ ] Three lines on paper
- [ ] DSA: Valid Anagram, Group Anagrams

**Day 3: microtasks, nextTick, await**

Study in this order (each needs the one before it):
1. [ ] What a microtask is, and why it cuts in line
2. [ ] The process.nextTick queue
3. [ ] The promise microtask queue
4. [ ] Drain order between every callback (Node 11+)
5. [ ] async/await desugared into .then
6. [ ] CommonJS vs ES module order difference
7. [ ] Starvation: queues that never empty
8. [ ] Races across await: the Auth refresh bug

Then do:
- [ ] order.js predicted, run as .js and .mjs, swap explained in one sentence
- [ ] Starvation demo: recursive nextTick blocks a timer; setImmediate lets it through
- [ ] Refresh-token race reproduced in a 20-line script
- [ ] Found the real rotation code in Auth; atomic fix written on paper
- [ ] Three lines on paper
- [ ] DSA: Top K Frequent Elements

**Day 4: the libuv threadpool**

Study in this order (each needs the one before it):
1. [ ] Two kinds of async: OS readiness vs pool thread
2. [ ] epoll and kqueue: one thread, many sockets
3. [ ] The pool: 4 threads, shared by the process
4. [ ] What uses the pool: fs, dns.lookup, crypto, zlib
5. [ ] dns.lookup vs dns.resolve
6. [ ] *Sync APIs skip the pool and block the loop
7. [ ] UV_THREADPOOL_SIZE vs CPU cores
8. [ ] Taksha: who competes for the four threads

Then do:
- [ ] Sorted the 10 APIs into "OS waits" vs "pool thread", no notes
- [ ] pool.js run three ways; two waves, the knob and the silent interval explained
- [ ] Two rows of the Taksha pool table answered from real code + Dockerfile Node version
- [ ] Three lines on paper
- [ ] DSA: Product of Array Except Self

**Day 5: measure, don't block**

Study in this order (each needs the one before it):
1. [ ] Event loop delay: what it measures
2. [ ] ELU vs CPU %: why CPU hides a busy loop
3. [ ] perf_hooks: monitorEventLoopDelay, ELU
4. [ ] Common blockers: JSON, Sync, ReDoS, big loops
5. [ ] Fix 1: chunk work with setImmediate
6. [ ] Fix 2: cap input (body limits, length caps)
7. [ ] Fix 3 preview: worker_threads (Week 3)
8. [ ] Capacity math from your own numbers

Then do:
- [ ] Loop monitor typed into block.js; p99 jump seen while /slow ran
- [ ] ReDoS regex timed at 20, 25, 30 characters
- [ ] One RS256 sign measured; k6 against local Auth with the monitor on; numbers written down
- [ ] "Refreshes per second per pod" answered with my own numbers
- [ ] Three lines on paper
- [ ] DSA: re-solve any week-1 miss

**Day 6: Week 1 gate**

Study in this order (each needs the one before it):
1. [ ] Re-draw: Node = V8 + libuv + bindings
2. [ ] Re-draw: the six phases
3. [ ] Re-explain: nextTick, promises, await
4. [ ] Re-sort: OS waits vs pool thread
5. [ ] Re-measure: delay and ELU

Then do:
- [ ] All 8 interview questions answered aloud, recorded, no pause over 5 s
- [ ] One page from memory: phases, microtask queues, pool users, loop metrics
- [ ] Every open box closed or moved with a reason
- [ ] Told Claude what was hardest this week
- [ ] DSA: 6 of 6 arrays and hashing solved alone at least once

## Weeks 2–8

Added here and to the deck at the start of each week.

- [ ] Week 2: buffers, streams, backpressure, SSE
- [ ] Week 3: child_process, worker_threads, cluster
- [ ] Week 4: V8, heap, GC, leaks, profiling
- [ ] Week 5: OS: processes, signals, locks, races
- [ ] Week 6: DBMS: ACID, MVCC, isolation, indexes
- [ ] Week 7: networks: TCP, HTTP, DNS, TLS, cookies
- [ ] Week 8: build mini-gateway from scratch, mock interviews, fix one real Taksha bug by hand
