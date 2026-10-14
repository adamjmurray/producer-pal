# Live API through Python

Plan: make the Python remote script the only way Producer Pal calls the Live
API, and keep the tools in TypeScript. Measured 2026-10-13 on Live 12.4.6 Suite,
macOS arm64, with ad hoc scripts run through the dev-only `/probe` route
([scripts/live-api/python-probe/](../../scripts/live-api/python-probe/)).

## Direction

- **Stage 1: Python does all Live reads.** Fixes string reads (backslashes) and
  makes reads faster. It can ship on its own.
- **Stage 2: Python does all Live writes.** V8 goes. Probably a later release.
- **Stage 3 is parked: Node outside Max.** It must not make users install Node.
  Revisit once the non-Suite test is done.
- **Install stays non-technical.** Add the device to a Set, use it to install
  the remote script, then use the chat UI, the Claude Desktop mcpb, or agent
  skills. Node is embedded in Max, and Python is embedded in Live.

## Shape

- **Python stays a thin, generic wrapper over Live's Python API.** No tool logic
  goes in it.
- **Tools stay in TypeScript, in Node for Max.** So do MCP, REST, the chat UI,
  `ppal-library`, voice tokens and code-exec.
- **The wrapper needs one batching primitive beyond get/set/call by path:** a
  batch read ("these properties across this subtree"). One HTTP call per Live
  call costs at least about 1.2 ms. A 64-pad kit read is about 12k reads, which
  would take 15 s or more one call at a time.
- **The tool code reads Live synchronously,** at about 1,100 call sites in about
  290 files. A snapshot-backed object with the `live-api-extensions` interface
  lets that code run unchanged after one `await`. Prototype it on one read tool
  first.
- **Writes are far fewer calls** (about 350 `.set`/`.call`) and already go
  through async `runWrite`. They become per-call RPCs during a busy burst, or
  batched ops. This is the biggest unknown in effort; prototype on
  `update-clip`.
- **What goes away after stage 2:**
  - the V8 chunk transport,
  - release scopes and `LiveAPI.from`,
  - the V8 warning-capture rules (Node has `AsyncLocalStorage`),
  - the all-digit-name and bare-`1` quirks,
  - the `waitUntil` polling.

## Measurements

**Batch reads on the perf baseline Set.** The Python side reads _more_ than the
Max tool: every nested parameter, with display strings.

| Read                                                | Max tool (MCP, end to end) | Python, in Live      |
| --------------------------------------------------- | -------------------------- | -------------------- |
| `read-live-set include:*`                           | 182 ms                     | 5.5 ms               |
| `read-device t17/d0 *` (64-pad kit)                 | 549 ms                     | 164 ms (2.7 MB JSON) |
| `read-device t18/d0 *` (4-level rack)               | 93 ms                      | 34 ms                |
| All three Python reads, one HTTP call (3.2 MB JSON) | —                          | 0.2 s                |

**Python runtime in Live:**

| Question                                              | Result                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round trip to Live's main thread                      | Idle: about **87 ms** (one tick). Back to back while busy: about **1.2 ms**.                                                                                        |
| CPU for a background thread                           | About **8%** (Live holds the GIL between ticks).                                                                                                                    |
| Serve the 3.4 MB chat UI                              | Stdlib file handler: 5–6 s. Preloaded bytes, one write: 0.2–0.4 s.                                                                                                  |
| Filesystem, subprocess, threads, ssl, asyncio, ctypes | All work. **No sqlite3.** OpenSSL is 1.1.1h (2020).                                                                                                                 |
| Compiled extensions (`.so`)                           | **Can't load.** A cp311 pydantic-core wheel fails with `symbol not found '_PyBaseObject_Type'`: Live doesn't export Python's C API. Only pure-Python packages work. |

**`set_data` / `get_data` (per-Set storage):**

- Persists after save and reopen. Song data is stored as JSON in the Set's
  `ViewData`.
- Not user-facing. Live's Info View text is `Annotation`, a separate element
  that `set_data` leaves alone. `ViewData` is a hidden key-value store that Push
  and SL MkIII also use for their view state. Each key is independent, so use a
  distinctive prefix (`producer_pal.`).
- Round-trips str (backslashes, quotes, emoji, newlines intact), int, float,
  bool, None, list, dict, and 1 MB and 10 MB strings. JSON types only.
- **It does not mark the Set as changed and adds no undo step.** Close the Set
  without another edit and the data is lost with no save prompt. Anything stored
  there needs a backup (the context sidecar already exists) or has to ride along
  with a real change.

**Node child process launched from the remote script:**

- Suite already ships Node v22.18.0 inside Live's Max
  (`.../Max.app/.../Node for Max/source/bin/osx/node/node`).
- On Live quit, a plain child was **orphaned** and kept running under launchd.
- A child that exits when its stdin pipe closes exited by itself. The kernel
  closes that pipe on any parent exit, crashes included. The crash path is
  expected to work the same way but was not tested.
- So zombies are avoidable, but only through that pattern.

## Questions answered

- **Embed the MCP server in Python?**
  - The official SDK can't run in Live: it needs pydantic v2, which is compiled.
  - A stdlib-only MCP server is possible; the protocol is small JSON-RPC.
  - The MCP server belongs where the tools run, and they stay in Node. So it
    stays in Node.
- **What Node does that Python in Live can't:**
  - npm packages, including any compiled ones.
  - `node:sqlite` for `ppal-library`.
  - A JIT for the grammars and transforms.
  - Full CPU in its own process, where Python threads get about 8%.
  - Current TLS.
- **Webui from Python:** possible, off the main thread, if it is written in one
  go. It isn't needed while Node for Max hosts it.
- **Hot reload:** the dev-only `--probe --reload` reloads top-level modules and
  rolls back on failure. It can't reload the bootstrap files or subfolders. That
  is fine for a thin wrapper that rarely changes.

## Risks

- **API churn.**
  - Live's Python API is undocumented. Live 11 to 12 changed many signatures.
  - Max's LiveAPI sits on the same Python, so it isn't fully insulated.
- **Remote script becomes required.**
  - Install friction: copy the script, restart Live, and pick a Control Surface
    slot (6 slots).
  - `Preferences.cfg` is binary and nothing on record auto-enables a slot.
  - The device-driven install already covers the copy.
- **Global, not per-Set.** A control surface runs in every Set. Today's per-Set
  switch is "the device is in the Set". That still works while the device is
  required.
- **Main-thread time.** Big batch reads run on Live's main thread and stall
  Live's UI (not audio) while they run. The kit read stalls it for 164 ms.
  Consider chunking the deepest reads.
- **Idle latency.** The first Live call of a tool can wait up to one tick (about
  87 ms). That is minor next to model latency.

## Parked: stage 3 (Node outside Max, device optional)

- What it would gain:
  - Possibly non-Suite editions. Untested: does a custom script load in Lite,
    Intro or Standard?
  - The device becomes optional: a launcher, status and per-Set switch.
- Blocker: Node must not be a separate install.
  - Suite has Live's own Node on disk, but non-Suite doesn't, and non-Suite is
    the point of stage 3.
  - A bundled Node brings size, signing and quarantine, and Windows antivirus
    problems.
- The child-process lifecycle is solvable with the stdin-pipe pattern.

## Open items

1. **Object IDs (decide before the stage 1 prototype).** Tools return Max's
   LiveAPI ids, and models reuse them across calls. Python has no Max ids. The
   ids come from `_MxDCore`, which is Live's own Python, so the remote script
   may be able to share that id table. Probe it. If it can't, stage 1 needs a
   new id scheme, which changes what the model sees.
2. Non-Suite test: needs an Intro, Lite or Standard install.
3. Snapshot-read prototype on one real read tool (stage 1 spike).
4. Write path spike on `update-clip` (stage 2 sizing).
