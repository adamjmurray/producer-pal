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

Considered and dropped — this phase was about naming an _arrangement clip_ by
path, which is still no. (Tracks and scenes went the other way later; see
[Object-Paths.md](../Object-Paths.md) → Not paths.)

The idea was to make `path` the general way to address any object. That needed
one thing first: a way to name an arrangement clip, since a lane path names the
lane and a lane holds many clips. The candidate was a time coordinate, `t0@5|1`.

**Why it lost.** An arrangement destination is a `path` list and an
`arrangementStart` list, each paired 1:1 with the clips and each usable alone:

- `arrangementStart` alone — new positions, every clip on its own lane.
- `toPath` alone — new lanes, every clip at its own position.

Folding time into the path can say neither: `t2@5|1` always names both halves,
so `arrangementStart` could not go away, and `@` would add a second spelling of
one concept — the thing this grammar exists to prevent — plus a new tier-4
conflict between the two.

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

- `update-clip`'s `arrangementStart` was one value for the whole call, while its
  `toPath` fanned out per clip. ✅ `arrangementStart` and `arrangementLength`
  now take a list too, paired 1:1 with the ids.
- `id` + `path` on one call has five behaviors (throw, dedupe-union,
  ids-then-paths, path-silently-wins, id-silently-wins). The two silent winners
  contradict [Object-Paths.md](../Object-Paths.md) tier 4.

Neither depends on path syntax.

### Phase 6 — `path` in every write result ✅

Create, update and duplicate results report `path` beside `id`, for tracks,
scenes, devices, chains and clips — not just clips. One helper reads it off the
object (`objectPathForApi`), so a moved object reports where it landed rather
than where the caller aimed.

`delete` is deliberately excluded: after deleting `t2` that path names a
different track, and a deleted object has no next call to spend it on.

Two shapes report nothing: a chain reached through a pad segment, whose
rack-relative index isn't in the Live API path, and an object that resolved to
nothing.

### Phase 7 — tracks and scenes take a path

Phase 6 handed back `t0` and `s3` from write results that no tool accepted,
which is the second addressing spelling ADR-0025 named as its own revisit
condition — the call it prompted is
[ADR-0036](../decisions/0036-paths-address-tracks-and-scenes.md). Track and
scene reads now report `path`, and `update-track`, `update-scene` and `delete`
accept one beside `id`.

### Phase 8 — `type` stops carrying the role

Built on `track-type-collapse`, pending the evals. `type` today says
`midi | audio | return | master`, which is two questions in one field: what
signal the track carries, and what role it plays. The path already answers the
second (`t0`, `rt1`, `mt`), so the field keeps only the first.

1. **A return or main track reports no `type` at all.** Not `"audio"`. They are
   audio-only, so the value would be constant — and worse, misleading: it reads
   as an invitation to put an audio clip there, which Live does not allow. The
   field means "which signal, where there is a choice", and there is none.

   This puts the whole weight of the role on the path, so the evals have to
   prove models read and write `rt0` and `mt` reliably. If they don't, this is
   the decision to revisit first.

2. **`trackType` becomes a hidden param, not an error.** Same migration as the
   other 2.x schema changes: accepted and validated, absent from the published
   schema. Use `deprecatedParam({ replacedBy: "path" })` — it is going away,
   unlike the permanent `aliasParam` guesses. `trackIndex` on the _track_ read
   goes the same way; the `trackIndex` / `sceneIndex` aliases on the _clip_
   tools stay permanent (Object-Paths.md tolerance, tier 1) and must not be
   swept up with it.

   This is what forces `path` onto the read tools: with `trackType` hidden,
   `path` is the published way to name a return or the main track.

3. **`create-track`'s `type` waits for Phase 9.** Its `return` is not addressing
   — it picks a different Live call (`create_return_track`). It can only lose
   the value once creation itself moves to a path (`t+`, `rt+`).

4. **Say "main", not "master", in everything a model or user reads.** Live 12's
   UI says Main and the path root `mt` reads as either. Tool and param
   descriptions and the Skills all say main. Internal identifiers that mirror
   the Live API property (`master_track`, `masterTrack`, `category: "master"`)
   stay. The one user-facing key, a Live Set read's `masterTrack`, is now
   `mainTrack` — it was the last place a reader saw "master" while every
   description around it said main.

Both remaining sites of the conflation move together: `computeTrackType` in
[read-track.ts](../../src/tools/track/read/read-track.ts) and the second copy in
[select-response-helpers.ts](../../src/tools/session/helpers/select-response-helpers.ts).

### Phase 9 — creating by path

Built on `track-type-collapse`, pending the evals. `create-track` and
`create-scene` take `t+` / `rt+` / `s+` beside `t2` / `s2`, which is what let
Phase 8's item 3 finish. Two things the plan didn't anticipate:

- `rt<n>` is refused on create. Live only appends return tracks, so an index
  there names a position it can't honor.
- Retiring one enum VALUE had no mechanism — `deprecatedParam` retires a whole
  param. `param()`'s `default` mode now takes `excludeEnumValues`, so
  `type: "return"` is still accepted and no longer published.

### Order to build phases 8 and 9 in

One commit each, on `track-type-collapse`, each green before the next is pushed.
The order is not arbitrary: step 1 has to precede step 3, or there is a commit
where a return track and the main track cannot be named at all.

Steps 1–5 are built and pushed; step 6's scenarios are written but not run. Two
calls made while building, neither in the plan: `select`'s own `trackType` /
`trackIndex` / `sceneIndex` were retired with the read tools' (its `path`
already covered all three), and `read-scene`'s `sceneIndex` went with
`read-track`'s.

1. **`path` on the read tools' input.** `read-track` and `read-scene` address by
   `trackIndex` / `sceneIndex` today and take no path. Add it first.
2. **`type` stops reporting the role.** Both `computeTrackType` sites together,
   plus every test asserting `"return"` or `"master"`.
3. **`trackType` and the track read's `trackIndex` become
   `deprecatedParam({ replacedBy: "path" })`.** Only now is `path` the published
   way to name a return or the main track. Leave the clip tools' `trackIndex` /
   `sceneIndex` aliases alone.
4. **"main", not "master", in every description and Skill.** Regenerate the
   skills snapshots and `docs/_generated`.
5. **Phase 9 — create by path.** `create-track` / `create-scene` take `t+` /
   `rt+` / `s+`, which lets `create-track`'s `type` finish collapsing.
6. **Eval scenarios for track and scene addressing.**
   `evals/scenarios/defs/path/` is all clip- and device-shaped today. These have
   to show models reaching for `rt0` and `mt` on their own, since item 1 of
   Phase 8 puts the whole weight of the role on the path. Running them needs a
   build from this branch.

The evals come last on purpose. Run them before Phase 8 lands and the model
still sees `trackType` and `type: "return"`, so it uses those and the run says
nothing about the world being decided on. Nothing merges to `dev` until they
pass — that is what this branch is for.

## Docs to update as the phases land

Skills fragments (`arrangement.ts`, `devices/devices.ts`,
`transforms/code-transforms.ts`) and the regenerated
[skills snapshots](../skills-snapshots/); `docs/features/tools.md`; the
generated tool schemas under `docs/_generated/`.
