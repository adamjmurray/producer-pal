# Skill wording changes

Text changes to the skills and tool descriptions that were measured, what moved
and what did not. The index is [README.md](README.md).

## Wording changes that were measured and did not work

**Surfacing the note-count operations does not make a model reach for them.**
`ratchet`, `repeat`, `split` and `merge` were rewritten from one dense paragraph
into four bullets labelled by the task each answers, given a pointer from
`transformsEditing` — the section that owns "how do I change notes already in
this clip" — and named in the `transforms` schema descriptions on create-clip,
update-clip and duplicate, which previously did not mention note count being
changeable at all.

The ops then appeared in **1 of 12 runs** (baseline: 0 of 12). That is noise.
**Don't retry this as a wording change.** The model reliably prefers
`preTransforms: "delete"` plus rewriting the notes, and that preference survives
having the verbs surfaced under exactly the question it is asking. The rewrite
was kept because the bullets read better, not because it changed anything.

Where to look instead: the `notes` and `preTransforms` descriptions are what the
model reads at decision time, and both actively route to rewriting. The ops may
need to be reachable from there — or this may not be a documentation problem at
all.

**It is not a documentation problem.** In run 2 luna named the right op and
declined it anyway, in its own words: _"I manually merged four echoed notes at
`+n/8` rather than using the `repeat(offset, copies)` transform. I chose that to
explicitly control the offsets and preserve the originals."_ On `merge` and
`split` it likewise named the op it had skipped and called the manual route the
thing that "achieved the requested" result. The model knows the verbs, can spell
them, and prefers writing notes because that is what it can predict. So a fix
has to change the trade, not the prose — make the op do something hand-written
notes cannot, or make the manual route cost more than one call.

**Naming the unit does not stop a model reading `sin()` as radians.** Every luna
trial opened with `sin(2*pi*note.start/4)` and needed 3 to 5 calls to arrive at
`sin(1bar)`. The waveform argument is a cycle LENGTH, and saying so in the
signature line — "never radians, never a note property", where the model reads
the call shape — changed nothing: still 0 of 3, still 3+ calls each.

It is not a wording gap, for the same reason the note-count ops were not. The
model has no signal until the music is wrong, so it revises only after hearing
it. Refusing the call is what moved the number: once a period built from
`note.start` errored (`period must be > 0` on the note at 0) or warned as a flat
LFO, the trials fell to 2 to 3 calls and self-corrected to `sin(1bar)` off the
message alone.

Both guards were removed on 2026-09-13: any signed period is legitimate (a
negative one runs the cycle backwards, a zero one is phase 0), and so is a
waveform that gives every note the same value. So the lever that moved the
number is gone on purpose. The finding stands — refusal is what causes
self-correction — but the turn-4 check is now a capability target with no
product lever behind it.

The first call is still the radian form, and nothing we send can reach it — the
model writes it before it has seen anything from us. The turn-4 check wants one
call, so it stays red whatever ships. Don't retry this as prose.

**A locator param loses to a value the model already has.** `ppal-duplicate`'s
locator was missed in 3 of 3 trials while `ppal-playback`'s `startLocator`
landed 3 of 3. Not a wording gap — both were documented with examples. It is
sequencing: the model calls `ppal-read-live-set` first to find the clip and the
sections, and once `Bridge = 25|1` is in hand, `arrangementStart` is the obvious
next move. Playback gets the locator because nothing has been read yet.

Every trial still produced the musically correct result, which is why the
scenario grades the argument as well as the outcome.

That param is now a `deprecatedParam` in favour of `loc:` inside the path, so
the specific case is closed. The general shape is not: **a param that competes
with a value the model just read will lose, and no amount of schema prose fixes
it.**

## Wording changes that did work

Both null results above tried to change a **preference**. These two taught a
**spelling**, and the difference is the best predictor we have of whether a text
change will move anything.

**Stark octave: 1/3 to 3/3.** `middle-c-scale-stark` went green in every trial
after the skill change, and every trial wrote the octave mark it taught
(`melody: C D Eb F G Ab Bb C'`). It was the text, not luck.

**The `n` prefix, diagnosed correctly the second time.** `<count>bar` did not
move `note-ops-split`, and the first diagnosis was wrong. The prefix is wrong
only in the **note-duration slot** (`notes: "n4bar C2 1|1"`): `length: "4bar"`
is right in every trial, and the same call writes `n/2` correctly. The model
over-generalizes the prefix from fractions to bars; it is not misreading `Nbar`.
Cost is one round trip and the error is self-correcting, so the only remaining
lever is a grammar alias accepting `n4bar` — judge that against round-trip cost,
not tidiness.

**Two kinds of randomness, and only one gloss for both.** Live stores a random
velocity two ways: `rand()` draws one value per note and writes it into the
clip, and the `vA-B` shorthand writes Live's per-note spread, which re-rolls on
every playback. Nothing shipped said so, and the only place the skills paired
"random" with a velocity spelling was the shorthand list's `vA-B` velocity
_(range = humanized random)_. Asked to randomize the snares AND lock the values
in, luna wrote the spread twice and a deterministic `sin()` once — 0 of 3.

Saying which one bakes, next to each spelling, took luna to **3 of 3 on both
arms**: `rand(90,110)` for the baked ask and `v70-110` for the re-rolled one.
gemma moved 2/3 to 3/3 twice, which on its own would be noise; luna is the
result. Scenario: `transform-random-baked-or-replayed`.

**That 3/3 no longer holds.** The scenario now grades the clip against Live's
`velocity_deviation` and adds a turn-4 `sin()` check, and it is 0/3 in runs 7
and 8. The `sin()` check is the documented red above and can't go green; the
randomness arms themselves failed 2 of 3 trials in both runs, once by leaving
every snare at 100 and once by swapping the arms — writing the spread on the
baked ask and baked values on the re-rolled one. The spelling landed; which
spelling goes with which ask did not.

**So: teaching a spelling is worth trying; arguing a model out of a preference
is not.**

### The predictor's first real test measured nothing

`s0`/`s1` looked exactly like a spelling problem, and it was called one. Models
read a user's "scene 1" as `s1` when the path is `s0`. Three places were
corrected — two skill fragments, plus `duplicate.def.ts`, which had glossed
`'t2/s1'` as "clip slot (track 2, scene 1)" in a schema the model re-reads every
turn. gemma then wrote `t3/s1` in **5 of 6 trials**, and that was written up as
the prior beating the prose: a spelling the model already believes it knows
behaving like a preference.

**None of the three corrections reached the model that was measured.**
`object-paths` was a registered slot with a tool gate and no `@include` in
either driver, so it shipped to nobody. `arrangement-write` is in the standard
driver only, and the run was small-model mode. `duplicate.def.ts`'s `smallModel`
string is a bare example list that never carried the gloss. The run graded a
document none of the edits were in.

Wiring `object-paths` into both drivers — plus an `object-paths-basic` for the
small document, which had no addressing prose at all — took
`path-spoken-scene-number` from **1/3 to 3/3, twice in a row**. The prose lever
worked the first time it was actually pulled.

Two things this cost, worth not repeating:

- **Check that a fragment ships before grading it.** Assembly is only
  `resolveIncludes(root)`; registering a slot and gating it does not include it.
  Nothing failed — the tool-gate tests assert which tools _would_ pull a
  fragment, never that a driver names it.
- **Read the model's reasoning, not just its arguments.** The failing trials say
  _"if they mean the scene with index 3 (the 4th one), I'll use `s3`"_. The
  model knows paths count from 0; it is guessing at what the USER meant. That
  makes the load-bearing sentence "a number the user says is 1-based", not
  "paths are 0-based" — and the fragment that had it was the one not shipping.

The asymmetry noted at the time is still real and still unaddressed:
`ppal-connect` returns `sceneCount` and no paths, and `read-live-set` leaves
scenes out by default, so a model gets `path: "t3"` from a track read and
nothing anchoring `s0`. Worth trying if this regresses.

**Measuring this needs repeats.** Two single-trial rounds came back 1-of-2 and
then 1-of-2 the other way, which reads as partial progress and is a coin flip.
At gemma's flip rate, n=1 on a two-scenario pair says nothing.

## Where a fragment sits can cost more than what it says

Everything above is about what the skills say. This one is about where it sits,
and it is the largest single behavior change any text edit has produced here.

`feac7199b` fixed a real bug: `object-paths` was registered, slotted and
tool-gated, but named by neither driver, so it had never shipped to any model.
The fix added `@include "./object-paths.md"` to `standardDriver` — landing
between `time-and-values` and `transforms-core`.

That cost luna every use of `swing()`, `quant()` and `step()`.
`swing-and-quantize` went **3/3 to 0/3**: instead of
`transforms: "Ab1: timing = swing(0.05)"`, the model deleted the hats and
rewrote all twenty note positions with hand-computed offsets, at 6 turns and
~118s against 5 turns and ~57s. `melody-transforms` went 3/3 to 0/3 the same
way, hand-remapping pitches instead of calling `step()`.

Bisected over the 65 commits between the two full runs, with the harness and the
scenario held fixed and only the device rebuilt. Commit 54 is 3/3, commit 55
(`feac7199b`) is 0/3, HEAD is 0/3, HEAD with that one include deleted is 3/3,
and HEAD with it moved after the transforms block is 3/3 — while
`path-spoken-scene-number`, the scenario the commit was written to fix, stays
3/3. So the fragment ships and the transforms survive; it just cannot sit in
front of them.

**The fragment teaches nothing about transforms. It displaces them.** That is
the whole finding, and why it matters is not understood. It does not fit the
spelling-versus-preference predictor above: no preference was argued and no
spelling was taught. Adding correct, useful prose in the wrong place did the
damage.

Two things follow. A skills edit that only _adds_ a fragment still needs a
transforms scenario run against it — reviewing the added text tells you nothing,
because the added text was fine. And `basicDriver` has the same shape untested:
`object-paths-basic` sits between `{notation}-basic-write` and
`transforms-basic`, the same slot, and small-model mode needs LM Studio to
measure.
