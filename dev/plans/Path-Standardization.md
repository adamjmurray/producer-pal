# Path Standardization

Bringing every clip and device tool onto the one grammar in
[dev/Object-Paths.md](../Object-Paths.md). The settled decisions and the
rejected alternatives are in
[ADR-0025](../decisions/0025-object-path-grammar.md); this file tracks what is
built and what is left.

## Where each tool stands

Location params only. **bold** = published, _italic_ = hidden (alias or
deprecated).

| Tool                                                                           | Today                                                                                 | Target                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| create-clip                                                                    | **path** (has `l`), _slot_, _trackIndex_, _sceneIndex_, _takeLane_                    | done                                                      |
| read-clip                                                                      | **clipId**, **path**, _slot_, _trackIndex_, _sceneIndex_                              | unchanged                                                 |
| update-clip                                                                    | **ids**, **path**, **toPath**, _toSlot_                                               | done                                                      |
| duplicate                                                                      | **id**, **toPath** (has `l`), _toSlot_, _takeLane_                                    | done                                                      |
| delete                                                                         | **ids**, **path** (clips and devices)                                                 | done                                                      |
| playback                                                                       | **ids**, **path**, **sceneIndex**, _slots_                                            | unchanged; `path` is slots only                           |
| select                                                                         | **id**, **path**, **trackIndex**, **trackType**, **sceneIndex**, _slot_, _devicePath_ | same, `path` reaches `rt0`/`mt`/`s3`                      |
| create-device                                                                  | **path**                                                                              | unchanged                                                 |
| read-device                                                                    | **deviceId**, **path**                                                                | unchanged                                                 |
| update-device                                                                  | **ids**, **path**, **toPath**                                                         | unchanged                                                 |
| read-track, read-scene, update-track, update-scene, create-track, create-scene | index params                                                                          | read/update → **path** (Phase 5); create stays on indices |

## Phases

Order matters: the parser merge unblocks everything, and take lanes must precede
results or a take-lane clip has no path to report.

### Phase 0 — one parser ✅

Merged the clip-side and device-side parsers into
[object-path.ts](../../src/tools/shared/validation/object-path.ts) +
[object-path-helpers.ts](../../src/tools/shared/validation/object-path-helpers.ts):
one parse → discriminated union → resolve. Added the `l` / `l+` segments, the
`s` root, and the tolerant legacy values.

Fixed by construction: `select path="rt0"` used to answer
`Path must include at least a device index: rt0`, because the return-track case
fell through to the device parser. `select` also stopped silently preferring
`trackIndex`/`trackType`/`sceneIndex` over a `path` that disagreed.

### Phase 1 — take lanes ✅

`t0/l<n>` and `t0/l+` on `create-clip`'s `path` and `duplicate`'s `toPath`;
`takeLane` demoted to a hidden alias (`N → l(N-1)`, `0 → no segment`);
`takeLaneName` stays published. Every arrangement destination carries its own
lane, so one call can spread copies across lanes.

Lane targets are 0-based internally now, matching `take_lanes` and the `l<n>`
segment.

### Phase 2 — results ✅

`formatSlot` → `slotPath`/`arrangementPath`. Clip results emit `path` and drop
`slot`, `trackIndex`, and `takeLane`; read-track's take lane entries report
`path` instead of a 1-based `takeLane`. code-exec's `location` is
`{ view, path?, arrangementStartBeats? }`.

Breaking, and the release notes need to say so.

The error messages that still named `trackIndex`/`sceneIndex` moved onto the
grammar afterward.

Settled afterward, once the Live API was probed rather than guessed at:
`duplicate` now promotes a take-lane clip to the main lane by re-creating it
there, since `duplicate_clip_to_arrangement` turned out to no-op on a take-lane
_source_. Moving one stays impossible — nothing can remove a take-lane clip, so
a move could only ever be a copy, and `update-clip` says so instead of
pretending otherwise. See [Object-Paths.md](../Object-Paths.md#take-lanes).

### Phase 3 — reach ✅

`path` addressing on `update-clip` and `delete` for clips, so a caller that
knows where a clip is doesn't read it first just to learn its id. Session
positions only: a slot holds one clip, a track's arrangement holds many.
Additive; nothing was unpublished, and `ids` and `path` compose.

Two behavior fixes landed with it:

- `update-clip`'s `toPath` fans out (`ids[i] → toPath[i]`) instead of taking the
  first entry and warning. `{ids:"63,72", toPath:"t15/s6,t15/s7"}` used to put
  both clips in one slot and destroy the first. Destinations don't cycle the way
  name and color do.
- `duplicate` warns instead of throwing on `toSlot` plus `arrangementStart`,
  matching what the same conflict on `toPath` already did.

### Phase 4 — measure and schedule removal

Eval the interface against 2.1.0, then set removal releases for the deprecated
params (`slot`, `slots`, `toSlot`, `devicePath`, `takeLane`). The permanent
aliases (`trackIndex`, `sceneIndex` on clip tools) stay. `parseSlot` and
`parseSlotList` retire with the deprecated params, not before.

### Phase 5 — `path` everywhere

Decided: `path` is the general way to address an object, not an alternative that
stops at clips and devices. That reverses the scope limit in
[ADR-0025](../decisions/0025-object-path-grammar.md).

Not an ADR yet — it's gated on evals, and on one unsolved design problem.

**Why id-only lost.** Requiring an id makes a stale reference fail loudly, while
a stale path silently hits whatever moved into that position. But the safety
line isn't drawable: `delete t0/d0` can destroy a drum rack full of nested
racks, and `p{pitch}` isn't positional at all — the 128 pad slots have fixed
ids, so the pad at C1 is permanently the pad at C1. Meanwhile id-only costs a
read per object, and reads are among the most expensive calls. Users describe
locations, not ids.

**Design this first: arrangement clips have no path spelling.** ADR-0025
rejected an `a<n>` segment (unstable index, meaningless to a user) and a locator
segment (song-timeline objects, not track/scene coordinates). Neither rejection
covers a _time_ coordinate — something like `t0@5|1`. A bar|beat position is
stable and is how users actually refer to arrangement clips. Unexplored rather
than foreclosed, and it decides whether "path everywhere" is reachable or
permanently holed where clips are most numerous.

2.2.0 made the gap visible: `read-clip` reports `path` for arrangement clips, so
session and arrangement locations now arrive in one syntax with nothing in the
shape saying which is pasteable. The param description has to say it outright
("that path names the location, not the clip"). A time coordinate removes the
caveat instead of documenting it.

**Then measure, don't argue.** Extend the Phase 4 eval to count how often a
model picks a wrong path versus how many extra calls id-only costs. Small models
are the risk — they handle `trackIndex` well today, and the win here is
uniformity rather than a bug being fixed. Run it on the 2.3.0 small-model
targets (Qwen 3.8 among them) before committing.

Baseline to beat, from the 2.2.0-rc1 run (codex-code/luna, 15 trials, 90 tool
calls): 24 path-addressed calls, 0 deprecated params, 0 errors, and every scene
call used `sceneIndex` and succeeded first try. So there is no measured cost to
the current split yet — only a design smell. That's the bar.

**If it holds, the work is:**

- Extend `path` to every type the action tools reach, published consistently.
- Move `read-track`, `read-scene`, `update-track`, `update-scene` off
  `trackIndex` / `sceneIndex`. `create-track` and `create-scene` stay on indices
  — they create a location rather than address one, and
  `create-track type:"return"` collides with an `rt` root.
- Settle one rule for `id` + `path` on the same call. There are five behaviors
  today (throw, dedupe-union, ids-then-paths, path-silently-wins,
  id-silently-wins), and [Object-Paths.md](../Object-Paths.md) tier 3 says
  conflicts throw — the two silent-winner cases contradict it. Union is a third
  answer, fine where a call names a set and unavailable where it names one
  source.
- Decide `path` on a device read's `drumPads` array — the only object in a
  device read without one. Really a token-cost question on drill-down reads, so
  possibly an opt-in `"path"` include rather than an unconditional field.

Log the reversal as a new ADR and mark ADR-0025's scope superseded.

## Docs to update as the phases land

Skills fragments (`arrangement.ts`, `devices/devices.ts`,
`transforms/code-transforms.ts`) and the regenerated
[skills snapshots](../skills-snapshots/); `docs/features/tools.md`; the
generated tool schemas under `docs/_generated/`.
