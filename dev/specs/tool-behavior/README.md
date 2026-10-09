# Tool Behavior

How every Producer Pal tool answers a call: what it refuses, what it skips, what
it reports, and what it overwrites. [dev/PRINCIPLES.md](../../PRINCIPLES.md) is
the authority; this is the next level of detail, stated as the rule today. A
tool that differs from a rule here is a bug in the tool.

Changing one of these answers is a rule change: ask first, update this spec, and
apply it to every tool at once.

| Part                                                         | What is in it                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| This file                                                    | Lists and pairing, refusals, skips, result entries, overwrites             |
| [object-paths/](object-paths/README.md)                      | The path grammar, creating by path, results and errors                     |
| [clips-playback-and-sends.md](clips-playback-and-sends.md)   | Looping, `duplicateLoop`, muted notes, the playhead, send returns          |
| [up-front-refusals-by-tool.md](up-front-refusals-by-tool.md) | Where each tool applies the refusal rules                                  |
| [skip-entries-by-tool.md](skip-entries-by-tool.md)           | How each write tool applies the entry rules                                |
| [ppal-manage.md](ppal-manage.md)                             | How `ppal-manage` answers: install, add Producer Pal, undo, redo, refusals |
| [dev/tools/tool-schemas.md](../../tools/tool-schemas.md)     | How to build the schema and the helpers that enforce these rules           |

## Lists and pairing

A tool that can work on several objects takes a comma-separated list of targets
(`id`, `path`, `toPath`, `arrangementStart`, `locator`), named in the singular.
A call that names N targets gets N entries back, in the order named.

- **Target lists** name objects or places. **Value lists** are properties
  applied to targets (`name`, `color`).
- **One value covers every target. N values pair 1:1, in order.** Any other
  count is refused before any work runs. Nothing cycles: a cycled destination
  overwrites, and a caller who miscounted gets a plausible result. An old schema
  line saying "cycles if fewer" made models write short lists.
- **A destination never broadcasts**, because a slot, lane, device or pad holds
  one object. With several sources the destinations pair one per source
  (`requireDestinationPerSource`). One source may take any number of
  destinations, one copy each. A list is never dealt out a few per source.
- **A bare arrangement position (`[5|1]`) is a shared value**, not a
  destination: each clip lands there on its own track. A track with no position
  broadcasts the same way when positions pair one per clip. A track with one
  position (`t2[5|1]`) names one place again. Scenes span every track, so their
  positions always pair one per scene.
- **Number, boolean and enum args keep their type and take one value for every
  target.** Different values mean separate calls in one turn. Per-target lists
  worked (models filled them correctly) but turned the schema into a string and
  gave up its type checks, and each param repeated the pairing rule. Not worth
  `anyOf[type, string]` either: it doubles the schema and Gemini collapsed three
  enum values into one.
- **Every string arg pairs**, unless its value is already a list of its own
  (`notes`, `transforms`, `arrangementSplit`'s split points), which applies to
  every target. Pair by type, not by role: "what or where" can't be settled per
  param without arguing each one.
- **An empty entry is refused**: a hole (`id: "t1,,t3"`) and a list with nothing
  in it (`","`). Dropping a hole shifts every later pairing and keeping it names
  nothing, so nothing is guessed. One trailing comma is not an entry.
- **A comma splits a value only when the call names more than one target.** With
  one target, commas are part of the value. `\,` is a literal comma either way.
- **Two or more args with commas must name the same number of entries.** A count
  the tool works out itself (`count: 3`) is one of them. An arg is a list when
  it has a comma, even if a trailing one leaves one entry.
- **One name in a batch can't be cleared mid-list.** `name: ""` clears every
  target and `id: "t3", name: ""` clears one. Quoting an entry to mean "empty"
  would need a full escape grammar; a `clearName` boolean is the cheaper answer
  if it is ever needed.
- **The hole, trailing-comma and length rules are not taught in param
  descriptions or the Skills.** Each error names the param and the fix, so
  pre-empting them on every param would spend the caller's context to say what
  the failure already says.
- Evals behind this: `evals/scenarios/defs/pairing/` (a model asked to
  "alternate" colors wrote a short list because the old description said
  "cycles"; rewording flipped it to a full list, first try).

### Empty and blank params

Clients fill params they have no value for with `null`. A `null` is dropped
before validation, on MCP and REST alike, so it reads as never sent. Otherwise
`Number(null)` is a real index, `z.coerce.string()` makes the name `"null"`, and
a boolean or enum rejects the whole call.

A **blank string** survives on a text param, where clearing a name or a clip's
notes is a real request. On a number, boolean, enum or array param it is
refused, naming the param: `bpm: ""` must not become a call that sets no tempo
and says nothing. For the action check below, a null, blank or `"null"` on a
param counts as not sent.

Measured on one model (codex-cli, 128 tool calls): nothing arrived blank or
null, and an all-optional tool with nothing to say came through as `{}`. The
blank-fill risk is real only for a client that behaves differently, and no other
client is measured (`evals/schema-compat`, `unset-optionals`).

## Refusals

A call is refused up front, having changed nothing, when it is malformed or
can't be carried out as asked. The test is whether the Live Set is unchanged,
not when the tool found out. A refused call costs the caller one retry.

How the tool answers depends on what is wrong:

- **Structure, before any work runs → throw.** A hole in a list, an arg that
  names nothing, lists that can't be paired, a call naming no target, an entry
  that can't be parsed, an update call that names targets and sends no param to
  write (every update tool uses `refuseNoWrite`, so they all word it the same).
- **A whole-call param the tool can't read → throw**, in update tools too: a
  half `sendGainDb`/`sendReturn` pair, a tempo outside Live's range, a note name
  that parses as nothing, a `params` entry with no name or value. Warning per
  item would repeat one message down the list and still return a success-shaped
  result.
- **Applicability that depends on the target, found while working → skip that
  target** (see [Skips](#skips-no-ops-and-replaced-targets)). `quantize` on an
  audio clip is not knowable until that clip is reached, and the earlier targets
  can't be rolled back.
- **Check before an irreversible step.** When a step can't be undone and a later
  one can fail, check the later one first and refuse both. update-clip checks a
  move (destination, clip type) before shortening the clip.
- **A device list that reads through its own inserts** is refused before
  anything is created ([lists of paths](object-paths/lists-of-paths.md)).
- **A target named twice is refused**, in every tool, before any work. Two
  params that name the same target, whether they agree or not:
  - a param that names it on its own (`path`, `slot`, `slots`, `devicePath`,
    `toPath`) with a second name for it (`trackIndex`, `sceneIndex`, `takeLane`
    beside a path with a lane segment);
  - a published param with the deprecated spelling it replaced (`path` and
    `slot`, `toPath` and `toSlot`, `arrangementSplit` and `split`, `startTime`
    and `startLocator`, `arrangementStart` and `locator`, `device` and
    `deviceName`), or with a position spelled in its own coordinate
    (`toPath: "t0[5|1]"` and `arrangementStart`);
  - `id` beside `ids` or the tool's own id spelling (`clipId`, `trackId`, ...),
    and `path` beside `paths`, whatever the values: a param and its alias are
    never sent together.

  One wording, built by `refuseNamedTwice`:
  `<param> names the <noun> on its own - don't send <params> with it`, listing
  only the params sent, with an optional note on the end
  (`(slot is deprecated)`). Not this: an `id` beside a `path` (in the read tools
  a second target), a `slot` list beside a bare `trackIndex` on create-clip
  (session slots plus an arrangement track), `trackType` (a category),
  `arrangementStart` beside a clip-slot destination of `duplicate`, and
  `routeToSource` with `withoutClips`/`withoutDevices`.

- **`count` with a destination list**, and `capture` with `count` on
  create-scene: refused, since the destinations already say how many.
- **A bad transform arg** is refused when it does not depend on the clip's
  meter, and skipped per clip when it does. A compound assignment of a
  `swing()`/`quant()` call (`timing += swing(...)`) is refused the same way, as
  is a `swing()` amount at or past its grid (`swing(0.56, n/8)`)
  ([transform spec](../transforms/README.md)).

### A param only another action reads

A tool with actions (or scopes, or a mode param such as `type` or `warpOp`)
publishes one schema for all of them. A param that only other values of that
call-level param read is refused, built by `refuseParamsOutsideAction` so every
tool words it the same way:

```
similarTo is only for action "find-similar"; this call has action "search".
Change the action or drop similarTo.
```

- A defaulted action counts like an explicit one. A value the schema fills in
  (`ppal-library`'s `kind: "audio"`) can't be told from one the caller sent, so
  only another value counts as sent.
- A value no action can use is refused too (`deviceKind: "midifx"` on
  `list-plugins`).
- A param that doesn't suit one _target_ stays a skip: `quantize` on an audio
  clip, a warp param on a MIDI clip. Only a param whose home is another value of
  a call-level param is refused.
- A write that would drop a whole stored document (`ppal-context`) throws a
  message naming `force`, rather than returning the document beside a warning.
- Top-level search filters beside `searches` are refused: the call can't say
  whether they were meant for every search or none.

Warning and continuing would guess the param was the mistake and run the action
anyway. Reading the param as implying the action guesses the other way, and
needs a priority rule once two params imply two actions.

### A remote script that is out of date

A remote script older than the server's minimum (`MIN_REMOTE_SCRIPT_VERSION`) is
treated as missing: its requests are held back before they are sent, so nothing
is asked of Live, and every caller falls back or refuses as it does when no
script answers. Where the answer tells the model the script is needed or
missing, it says instead that the script is out of date, with the running and
needed versions, and to update it with `ppal-manage` or in Settings → Remote
Script and restart Live. The same goes for a 404 that says the route is unknown;
any other 404 still means "not found". The Skills teach remote-script features
only for a current script.

## Skips, no-ops and replaced targets

A target the call couldn't carry out keeps its slot as a skip entry:
`{ id | path, ok: false, detail }`.

- `id` or `path` is exactly the caller's spelling, under the param that named
  it. It is all they have to match the entry on.
- `detail` is prose, the words a lone target would have thrown. No slugs.
- `ok` appears only on a skip. A hit says so by having a result, and a key per
  hit is paid for in the caller's context again and again.
- **A skip is never also a warning.** Anything about a target goes on that
  target's entry. The write pipeline runs each target's write in a try/catch and
  turns a throw into that target's skip entry, sharing the shape with
  `readFanOut`, so a per-target write throws where it would once have warned and
  continued.
- **A path lookup reports a miss instead of raising it** (`existingId` returns
  the reason). A resolver throws only for a path naming the wrong kind of thing,
  which is how `delete` tells "nothing is there" (a no-op) from "that isn't a
  track" (a skip).
- **A lone target that is skipped throws** its `detail`: there is no list for an
  entry to hold a place in.
- **A target that needed no work is not a skip.** It gets its normal entry plus
  a `detail` saying why, and no `ok`: `delete` of a missing `t99` is
  `{ path: "t99", detail: "nothing to delete" }`. A lone one is satisfied, not
  refused; making it an error would let a model retry forever. A read miss stays
  `ok: false`, since a read can't be satisfied by an absent object.
- **An empty clip slot is a miss.** A lone `read-clip` of one throws
  `no clip at <path>`, a listed one gets an `ok: false` entry, and a clip list
  nested in a `read-scene` or `read-track` result leaves it out. A group track's
  slot is a miss in the same shapes, worded
  `track t9 (id 12) is a group track; it holds no clips` (also in update-clip
  and duplicate; `delete` still calls it `nothing to delete`).
- **A target the call could only half serve** keeps its normal entry plus a
  `detail` naming what did not land. `ok: false` means nothing asked of that
  target landed.
- **Nested entries** (`sends`, device `params`, `actions`) follow the same
  shape. When every nested write failed and nothing else was asked of the
  target, the target is `ok: false` with a `detail` saying none landed. Changes
  made on the way count as landed and are not undone: the `detail` says what was
  left (`left an empty Simpler on pad ...`). The exception is wrapping an
  instrument in a rack: it removes the rack it made, restores the instrument,
  then throws, because the temporary track it uses isn't something the caller
  asked for.
- **A write the tool can't do** is refused on the target's entry: a track's
  `pan` in split mode, `leftPan`/`rightPan` in stereo, a gain Live has disabled,
  `mute`/`solo` on the main track, `arm` on a track that can't be armed, a rack
  chain's disabled gain. Turning one of those _off_ is a no-op (a `detail`, no
  `ok`).
- **Live fails partway through a target:** if nothing of it landed, its entry is
  `ok: false` with a `detail`; if some of it landed, it keeps its normal entry
  plus a `detail` saying what landed and what didn't. Earlier targets keep their
  entries and later ones still run.
- **`ppal-playback` says what landed when a whole-call step fails partway.** A
  throw from the step that writes the transport or timeline, or from the step
  after the targets, ends the call with `; already changed: ...` naming what had
  landed (`call.landed`). With nothing landed the error is unchanged. The other
  write tools don't do this yet.
- **A deadline is no exception, reads included.** When a call stops early
  because the request ran out of time, every target it never reached keeps a
  skip entry with a `detail` saying so and what to re-run. `readFanOut` checks
  the deadline before each target of a multi-target read. A one-target read, and
  the inside of one big read (`read-live-set`), are not cut short: on a 20-track
  Set with nested racks, the biggest reads take 1–2 s, far under the deadline. A
  target whose work had begun keeps its normal entry with a `detail` for what
  did not run. A lookup that runs out of time before anything is written refuses
  the call.
- **"Ignored" is one wording, in a warning and in an entry:**
  `X ignored: reason`. A param the whole call ignored is a warning
  (`takeLane ignored: session clips have no take lanes`). Params one target
  can't use are a `detail` on that target's entry, in the same shape
  (`gainDb, pan ignored: can't be set on a device`,
  `gain ignored: the clip is MIDI`). Several params are joined with `, `, never
  `/`. The code builds both with `ignoredText` and `warnIgnored`
  (`src/shared/max/ignored-wording.ts`), and states each reason once.

### An entry that can't be parsed

An entry in a target or destination list that can't be parsed means the call was
written wrong: the whole call is refused before anything is written, and the
retry costs nothing. An entry that parses but can't be applied skips only that
target and the rest run. This holds in every tool: a missing `duplicate` source
is a skip too.

### Named twice: last wins

When entries name the same object (any spelling: `id` and `path`, `t0/inst` and
`t0/d1`), or write the same place or value, the last wins. The earlier one is
skipped unwritten, and its entry has a `detail` ("named again later in this
call") and no `ok`, since the work it asked for happened through the later
entry. Creating twice (`l+,l+`, `d+,d+`) is two targets. Device actions and
nested list items (sends, `params`) follow the same rule. A caller correcting
itself writes the fix last, so first-wins would lose it. First-wins would also
split the rule in two: a later write that lands on the same slot or arrangement
spot replaces the earlier one in Live whatever the rule says.

That holds only while the later mention does its work. If it lands nothing of
the replacement (it failed, or the deadline never reached it), the earlier
mention was not done through it after all: its entry becomes `ok: false` with
`detail: "not written: <later> was meant to replace it, but failed"`, or the
deadline's own detail when the later one was never reached. This follows a
chain: with three mentions of one object, a failed last one fails the two before
it.

### A later target replaces an earlier one

When a later target takes the same slot, the same arrangement spot, or fully
covers an earlier one, the earlier one is skipped unwritten:
`detail: "overwritten later in this call by <later>"`, no `ok`. A partial cover
reads `shortened by <later> later in this call`. If the clash only shows while
writing, the entry gets the same `detail`. The later entry reports only what it
really overwrote, so an unwritten target isn't named there.

Replacing or cutting short is only said once the later write really covered the
ground. A later target whose move was declined, blocked or stopped by a throw
before the copy landed replaced nothing: the earlier one becomes `ok: false`
with `not written: <later> was meant to replace it, but failed` (it was left
unwritten, so nothing of it landed), and a partial cover adds no `shortened by`
to a clip that wasn't shortened. When two later targets cover an earlier one
between them, all of them have to have landed. A target a later one only covers
part of is written before that one, or its write would land on top of it; a move
that can't be ordered that way is refused like one in a cycle.

`deleted: true` is only for objects the caller asked to delete. Writing the
earlier target and then marking it deleted wastes the write and reports a delete
nobody asked for.

### Locators

`create` where a locator already is does nothing, and never renames it: with no
name that is a no-op (`detail`, no `ok`); with a name the name didn't land, so
`ok: false` pointing at `rename`. `delete` of a missing locator is a no-op. A
no-op is not labelled `operation: "skipped"`, and neither is a skip: it is
`{ id | time | name, ok: false, detail }`, in the caller's own spelling, like
every skip. A lone locator refusal throws when it was the call's only work; when
the call also changed something else (tempo), the locator keeps its `ok: false`
entry so the error doesn't hide what landed.

`create` and `delete` move the playhead (Live acts at it), and on a Set that was
playing they drag the start marker along, so the call puts both back where they
were. If that fails, a `Playhead not put back…` or `Start marker not put back…`
warning says so; the entries and any error are unchanged.

## Result entries and observability

- **Every explanation is `detail`**, skipped or not: a skip, a no-op, a partial
  success, a side effect, a read-back. No result has a `reason` key. `warning`
  already names the appended `WARNING:` block, and `note` reads as a pitch.
- **A single target returns its entry unwrapped.** A list field inside a result
  mirrors the param it came from. A singular param that takes a comma list gives
  a singular field, unwrapped for one target (`locator`; playback's `clip`). A
  param that is itself a list (`sends`, `params`) gives an array.
- **A write reports a value only when it isn't the one asked for**, compared at
  the resolution the read tools publish (two decimals for dB, pan and tempo; the
  bar|beat spelling for a position). One comparison and one detail serve every
  write path (`read-back-comparison.ts`).
  - Same value: silence. Drift below the resolution is the same value; Live
    stores a 32-bit float, so raw floats never compare equal.
  - Different value: the value read back, plus a `detail` naming the fields:
    `gainDb, pan read back as shown, not as sent`. The wording is observational
    because Live clamps, snaps, or ignores the write and the tool can't tell
    which.
  - Applies to every write a tool can read back: clip `start`/`length` (a region
    Live kept in place of the one asked for) and audio `gainDb`, `pitchShift`
    and `warpMode` (update-clip and create-clip), a scene, clip or Live Set
    `timeSignature`, and `tempo`. One detail names every field a clip entry
    reports (`start, gainDb read back as shown, not as sent`). update-clip reads
    the meter back first and works in the one Live kept.
  - Not comparable: always report. A value written as a display string (a unit,
    an enum label, a note name, `loc:Verse`) is a spelling, not a number; so is
    a read-back that isn't a number (`-inf`). `scale` always reports, since Live
    spells the root its own way. Positions compare as beats, so `5|1.0` landing
    at `5|1` is silent.
  - State that governs what the call did still reports, since the caller may
    never have read it: `panningMode` when a pan param went in under split mode
    the call didn't name, and playback's `startTime`.
  - A `sends` array appears only when a send has something to say.
  - A property Live won't read back inside the request that wrote it
    (`live_set loop`) can't use this: a stale read would report the old value as
    a change.
  - `ppal-select` reports the selection the call produced, not an echo.
- **A write that overrides arrangement automation says so.** Writing a parameter
  that has an arrangement lane makes Live ignore the whole lane until the user
  presses Re-Enable Automation (`automation_state` becomes 2). The write still
  goes ahead; the target's entry gets one `detail`,
  `<field>: arrangement automation overridden — Live ignores it until Re-Enable Automation`
  (`tempo`, `gainDb`, `pan`, `mute`). A param or send that has its own entry
  carries the sentence alone, on that entry. One shared helper serves every tool
  (`automation-override.ts`). Live updates `automation_state` a tick late, so it
  is read before the write only: the note appears when the state was 1 and the
  write changed the value (tempo, and the activator's value for mute). Writing
  the value already held overrides nothing. Already overridden (2), no lane, and
  unknown (0, as while the track plays from Session) stay silent. Writes to a
  fresh object, such as a copy, never have a lane. Writes that move many
  parameters at once (a macro variation, an A/B swap, a preset) are not checked.
- **A write that shifts other objects' paths** gets no per-call warning. The
  tool description says once that inserting, deleting or duplicating shifts
  later siblings. A deleted object's result path is its address from before the
  call; every other entry names its object where it is after the call. That
  includes a device a later target deletes (a forced pad sample swap): its entry
  keeps the pre-call path, with a `detail` saying it no longer exists.
- **Paths in results and errors** follow
  [object-paths/results-and-errors.md](object-paths/results-and-errors.md).

## Destruction and overwrite

Writing into an occupied arrangement range goes ahead and has no `force`: the
timeline has no empty slots, so a position means "put it here". Live does it
silently (it wipes a clip, cuts one short, or splits one and gives the tail a
new id), so the written clip's entry says what it cost in `detail`, naming each
clip by the arrangement path it had or has:

- `overwrote the clip at t0[4|1]`
- `shortened the clip at t0[4|1]`
- `split the clip at t0[1|1] into t0[1|1] and t0[4|1]`

Several are joined with `; `. A per-call lane ledger scans a lane once, then
re-reads only the clips each write could have changed, so the report is what
Live did, not what the call predicted. A copy Live declined after clearing clips
still counts as landed: its entry has a `detail` and no `ok: false`. A clip that
couldn't grow past an unlooped audio file's end says so in its `detail`.

`force` is for a destruction that is the only way to do what was asked and that
the caller wouldn't expect (replacing a drum pad's sample throws away the device
on the pad). Refusing arrangement overwrites unless `force` would make every
write need it, so callers would always pass it. A `displaced` array of ids was
rejected too: the ids are dead the moment they are reported.
