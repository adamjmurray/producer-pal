# The Write Pipeline

Every write tool runs through `runWrite()` in
[`src/tools/shared/write-pipeline/`](../../src/tools/shared/write-pipeline/). A
tool fills in a `WriteSpec` (the hooks below); the pipeline owns what must not
differ between tools: target order, entries, skips, last-wins, replacement,
deadlines, and the lone-target rule. The behavior it produces is specified in
[specs/tool-behavior/](../specs/tool-behavior/README.md).

A tool never hand-rolls its own refuse, skip, entry, last-wins or deadline
logic. If a rule is missing, add a hook to the pipeline so every tool gets it.

## Stages

Types are in `write-pipeline-types.ts`; `runWrite()` is in `write-pipeline.ts`.

| Stage | Hook             | Does                                                                                                                         |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | `parse`          | Read the args once. A throw refuses the call.                                                                                |
| 2     | `targets`        | Name the targets, in the order the caller named them. Reads only.                                                            |
|       | `lists`          | Then compare per-target list lengths. A mismatch refuses the call.                                                           |
| 3     | `check`          | Look things up, never write. A throw refuses the call.                                                                       |
| 3b    | `before`         | Write what the call as a whole changes (tempo, transport), once. Runs after every refusal, so a refused call writes nothing. |
| 4a    | `plan`           | Pure: choose the write order and what each target's write needs (`order`, `each`).                                           |
| 4b    | `write`          | Write one target; return its entry. A throw becomes that target's entry.                                                     |
| 5     | `settle`         | After every target: fix up paths, focus, warnings. May await a write that needs every entry.                                 |
|       | `loneSkipThrows` | Whether a lone skipped target throws its detail (default yes).                                                               |

Refusals (stages 1 to 3) happen before the first write. Once targets are being
written, a failed target costs only its own entry; the rest still run.

## Targets

`targets()` returns one `Target` per thing the caller named:

- **Applied** targets carry `named` (the caller's spelling, which addresses
  their entries), `data` for the write, and optionally `key`, `keys` and
  `covers`.
- **Skipped** targets carry `skip`: why, in the words a lone target throws. They
  parsed but can't be applied.

`key` is the resolved identity: the same object has the same key whatever the
spelling (`id 12` and `t0`). A target acting on several objects (a name that
matches many locators) uses `keys` instead. Creating something new has no key
and never loses to a repeat: two creates are two targets.

## Outcomes

Each target ends as one of three outcomes, shown to `settle` in `done.outcomes`:

- `written`: its `write` returned, or threw after `step.landed` or
  `step.coverLanded` (its entry says what landed).
- `skipped`: it was skipped up front, its write threw before anything landed, or
  the deadline never reached it. The entry is
  `{ id | path, ok: false, detail }`.
- `superseded`: a later target replaced it, so nothing was written. The entry
  has a `detail` and no `ok`.

A lone target (one entry) is returned unwrapped. A lone skip throws its detail,
unless `loneSkipThrows` says another change in the call means the skip is the
answer.

## Last wins, covers and failed replacements

All decided before the first write (`plans/`), so the loop never has to undo:

- **Named twice** (`last-wins.ts`): targets sharing any `key` lose to the later
  one. A superseded target claims nothing, so it can't shadow an earlier one.
- **Covers** (`covers.ts`): a target declares what its write goes over: a
  session slot, or a stretch of one arrangement lane (`from`, `to` in beats,
  `as` for how an entry names it). A later target that goes over all of it
  replaces the earlier one (`overwritten later in this call by <where>`). One
  that goes over part cuts it short: the earlier target is still written, and
  `plan` is told (`superseded.shortenedBy`) so it can be written first.
- **Replacement fails** (`settle-supersession.ts`): after the loop, a target
  left unwritten for a later one that then failed, or never wrote its ground,
  was not replaced by anything. Its entry becomes a skip saying so (or the
  deadline's detail). A target is only reported as cut short when both writes
  really landed. This is why a write that declares `covers` must call
  `step.coverLanded()` once that ground is written, even if a later step of its
  write throws.

## Inside `write`

- `step.landed(phrase, partial?)`: say that something of this target changed
  Live. A throw after that keeps the target's normal entry (plus `partial`) with
  a detail `already changed: <phrases>`, not an `ok: false` skip.
- `step.coverLanded()`: see above.
- `withPieces(entry, extra)`: return the target's own entry plus extra entries
  that ride behind it (a clip split into pieces).
- `call.ignored(param, why)`: warn that a whole-call param did nothing.

A throw is the target's skip when nothing had landed. Throw the words a lone
target would show the model.

Each target looks its objects up again, so splitting costs about 5.7 id lookups
per clip, up from 4 before the pipeline. That cost is accepted.

## Sync until a hook returns a promise

`runWrite()` is synchronous and returns a plain result. It becomes a promise
only when a hook returns one (`afterMaybe()`), so a tool with no awaited step
keeps its sync API and its sync tests. Don't make hooks `async` without a
reason.

## Warning capture

V8 buffers warnings per request and has no async context
([`v8-warning-capture.ts`](../../src/shared/max/v8-warning-capture.ts)). The
pipeline keeps warnings on the right response by never creating its own timing:

- The pipeline makes no promises or timers of its own. The only async steps are
  the ones a hook awaits.
- Targets run one after another. The next starts only after the previous one
  finishes, so awaited steps never overlap.
- A hook that awaits follows the capture rules (suspend, resume on every path
  back out, `catch` included).
- No `void`-ed async calls in hooks. A fire-and-forget call is a suspension
  point and needs `detachWarningCapture()`.

A hook that adds an await without these breaks warnings silently.

## Adding a write tool

1. Write a `WriteSpec` with `runWrite()`. Put anything that is one tool's own
   (what a target is, how it's looked up and written) in the hooks; leave
   ordering, skips, entries, last-wins and deadlines to the pipeline.
2. Add the tool to `WRITE_TOOLS` in
   [`write-tools-use-pipeline.test.ts`](../../src/tools/shared/write-pipeline/tests/write-tools-use-pipeline.test.ts).
   That meta test checks that every dispatched tool is a write tool or a
   read-only one, that every write tool runs through `runWrite()` and nothing
   else does, and that every write tool has a conformance adapter.
3. Add an adapter to
   [`write-conformance-adapters.ts`](../../src/tools/shared/tests/write-conformance/write-conformance-adapters.ts)
   (see `adapters/`). The conformance suite runs every write tool through the
   same cases: order, lone entry, named twice, replaced later, unparsable,
   unappliable, failure midway and after a change, wrong list length, refusals
   write nothing, count with destinations, lone skip. A case that can't apply is
   listed under `na` with why.
4. Add per-tool tests for what the hooks do. Cover the pipeline's rules through
   the conformance suite, not by re-testing them per tool.
5. Add a behavior case to `e2e/mcp/` for any change to what the tool does in
   Live.

A new rule that applies to every write tool goes into the pipeline and the
conformance suite together, then into the
[tool behavior spec](../specs/tool-behavior/README.md).
