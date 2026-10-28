# Tool Behavior

How every Producer Pal tool answers a call: what it refuses, what it skips, what
it reports, and what it overwrites. [dev/PRINCIPLES.md](../../PRINCIPLES.md) is
the authority; this is the next level of detail, stated as the rule today. A
tool that differs from a rule here is a bug in the tool.

Changing one of these answers is a rule change: ask first, update this spec, and
apply it to every tool at once.

| Part                                                            | What is in it                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| This file                                                       | Lists and pairing, result entries, overwrites                                    |
| [refusals.md](refusals.md)                                      | What is refused up front, and how                                                |
| [skips-and-replaced-targets.md](skips-and-replaced-targets.md)  | Skip entries, no-ops, last wins, replaced targets, locators                      |
| [object-paths/](object-paths/README.md)                         | The path grammar, creating by path, results and errors                           |
| [clips-playback-and-sends/](clips-playback-and-sends/README.md) | Looping, `duplicateLoop`, envelopes, audio conversion, muted notes, send returns |
| [up-front-refusals-by-tool.md](up-front-refusals-by-tool.md)    | Where each tool applies the refusal rules                                        |
| [skip-entries-by-tool/](skip-entries-by-tool/README.md)         | How each write tool applies the entry rules                                      |
| [ppal-manage.md](ppal-manage.md)                                | How `ppal-manage` answers: install, add Producer Pal, undo, redo, refusals       |
| [dev/tools/tool-schemas.md](../../tools/tool-schemas.md)        | How to build the schema and the helpers that enforce these rules                 |

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

A blank `id` or `path` beside one that names the targets reads as unset. Every
tool that takes both warns once (`blank id ignored`) and only when the call ran.
A `"null"` there warns once as `id "null" names nothing`, not also as blank.

Measured on one model (codex-cli, 128 tool calls): nothing arrived blank or
null, and an all-optional tool with nothing to say came through as `{}`. The
blank-fill risk is real only for a client that behaves differently, and no other
client is measured (`evals/schema-compat`, `unset-optionals`).

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
  includes a device, chain or pad a later target deletes (a forced pad sample
  swap, or a preset that replaces its rack): its entry keeps the pre-call path,
  with a `detail` saying it no longer exists.
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
