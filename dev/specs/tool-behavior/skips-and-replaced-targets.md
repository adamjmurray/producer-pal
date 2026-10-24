# Skips, no-ops and replaced targets

Part of [Tool Behavior](README.md).

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
- **A throw in the step after the targets keeps the entries.** If any target was
  written, the call still returns every entry, plus a `WARNING:` saying the
  final step failed (with `already changed: ...` for what `call.landed` had
  recorded) and that the results may be incomplete, with paths or ids out of
  date, so the caller reads them again. If nothing was written, the call throws,
  naming what had landed.
- **`ppal-playback` and `ppal-update-live-set` say what landed when the step
  before the targets fails partway.** A throw from the step that writes the
  transport or timeline (playback) or the tempo, time signature and scale
  (update-live-set) ends the call with `; already changed: ...` naming what had
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

## An entry that can't be parsed

An entry in a target or destination list that can't be parsed means the call was
written wrong: the whole call is refused before anything is written, and the
retry costs nothing. An entry that parses but can't be applied skips only that
target and the rest run. This holds in every tool: a missing `duplicate` source
is a skip too.

## Named twice: last wins

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

## A later target replaces an earlier one

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

## Locators

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
