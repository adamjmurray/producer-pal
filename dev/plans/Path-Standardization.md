# Path Standardization

Bringing every clip and device tool onto the one grammar in
[dev/Object-Paths.md](../Object-Paths.md). The settled decisions and the
rejected alternatives are in
[ADR-0025](../decisions/0025-object-path-grammar.md); this file tracks what is
built and what is left.

## Where each tool stands

Location params only. **bold** = published, _italic_ = hidden (alias or
deprecated).

| Tool                                                                           | Today                                                                                 | Target                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| create-clip                                                                    | **path** (has `l`), _slot_, _trackIndex_, _sceneIndex_, _takeLane_                    | done                                 |
| read-clip                                                                      | **clipId**, **path**, _slot_, _trackIndex_, _sceneIndex_                              | unchanged                            |
| update-clip                                                                    | **ids**, **path**, **toPath**, _toSlot_                                               | done                                 |
| duplicate                                                                      | **id**, **toPath** (has `l`), _toSlot_, _takeLane_                                    | done                                 |
| delete                                                                         | **ids**, **path** (clips and devices)                                                 | done                                 |
| playback                                                                       | **ids**, **path**, **sceneIndex**, _slots_                                            | unchanged; `path` is slots only      |
| select                                                                         | **id**, **path**, **trackIndex**, **trackType**, **sceneIndex**, _slot_, _devicePath_ | same, `path` reaches `rt0`/`mt`/`s3` |
| create-device                                                                  | **path**                                                                              | unchanged                            |
| read-device                                                                    | **deviceId**, **path**                                                                | unchanged                            |
| update-device                                                                  | **ids**, **path**, **toPath**                                                         | unchanged                            |
| read-track, read-scene, update-track, update-scene, create-track, create-scene | index params                                                                          | unchanged; indices stay              |

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

The scenarios that measure it are in `evals/scenarios/defs/path/`: session slot
spelling, the take-lane index base, whether a model pastes a reported
arrangement path back as a clip address, `toPath` across every destination kind
(slot, arrangement, take lane, device, drum pad) with both list rules, and the
roots outside `t`/`s` (`rt`, `mt`, and a pad). They grade the path the model
wrote AND where the object landed — a path that lands right through a hidden
alias is a different finding from one that lands wrong.

Two rules about what these may assert, both learned the hard way:

- **Never grade alias usage.** The aliases exist to catch a wrong guess, so
  rewarding one would enshrine the spelling being retired. Count them from the
  `warnings` on saved runs instead.
- **Never grade batching.** Splitting one batched call into several 1:1 calls is
  a fine way to move two clips, and is safe by construction. Assert the
  invariant per call — `update-clip` names one destination per clip, `duplicate`
  never names more destinations than starts — not the list length.

### Phase 5 — `path` everywhere: rejected

Considered and dropped. `path` addresses clips and devices;
[ADR-0025](../decisions/0025-object-path-grammar.md)'s scope stands.

The idea was to make `path` the general way to address any object. That needed
one thing first: a way to name an arrangement clip, since a lane path names the
lane and a lane holds many clips. The candidate was a time coordinate, `t0@5|1`.

**Why it lost.** An arrangement destination is a `path` list and an
`arrangementStart` list that cycle against each other, and that is strictly more
expressive than folding time into the path:

- `toPath:"t2/l+"` × three starts — one destination, three times, one new lane.
- `toPath:"t2,t3"` × one start — two destinations, one time.

Neither compresses into a path list: you would write `t2@1|1,t2@5|1,t2@9|1` and
lose the pairing. And `arrangementStart` could not go away, so `@` would add a
second spelling of one concept — the thing this grammar exists to prevent — plus
a new tier-4 conflict between the two.

**Also against it**, if it is ever revisited: a bar|beat position can contain a
`/` (the `5|1-n/4` pickup), so `parseObjectPath`'s `input.split("/")` would have
to peel the time tail off before splitting segments; `@` already means step
interval and bar copy in bar|beat; and bar|beat → beats depends on song meter,
so a stored path would change meaning when the meter does.

**The framing that replaces it.** A path names a **location**. A location
holding exactly one object thereby names that object — `t0/s3` one clip, `t0/d1`
one device. An arrangement lane holds many, so it names the lane and the clip is
addressed by id. That is the rule, not a hole to apologize for.

**What was real underneath**, split into its own tickets and kept:

- `update-clip`'s `arrangementStart` is one value for the whole call, while its
  `toPath` fans out per clip. Moving three clips to three positions takes three
  calls.
- `id` + `path` on one call has five behaviors (throw, dedupe-union,
  ids-then-paths, path-silently-wins, id-silently-wins). The two silent winners
  contradict [Object-Paths.md](../Object-Paths.md) tier 4.

Neither depends on path syntax.

## Docs to update as the phases land

Skills fragments (`arrangement.ts`, `devices/devices.ts`,
`transforms/code-transforms.ts`) and the regenerated
[skills snapshots](../skills-snapshots/); `docs/features/tools.md`; the
generated tool schemas under `docs/_generated/`.
