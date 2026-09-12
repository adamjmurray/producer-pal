# Eval Findings

What full-suite eval runs have established about model behavior, and which fixes
have already been tried and measured. `evals/README.md` covers how to run the
tools; `dev/Testing.md` covers the unit and e2e suites.

**Why this file exists.** `evals/results/` is gitignored, so a run's numbers and
the reasoning drawn from them survive only if they are written down here. A
negative result is the most valuable thing on this page: it is the difference
between not doing a day of work and doing it twice.

## Recorded runs

`evals/results/` is gitignored, so a run stays comparable only if its numbers
are here. **Record the commit.** Without one, a diff between two runs credits
the model for a fix that landed in between: `duplicate-loop` read as "luna
fails, gemma passes" until run 2 turned out to predate ADR-0040's refusal.

| #   | model           | mode            | commit       | trials | ran | pass      | input  | wall  |
| --- | --------------- | --------------- | ------------ | ------ | --- | --------- | ------ | ----- |
| 1   | gpt-5.6-luna    | default         | not recorded | 3      | 231 | 186 (81%) | 84.4M  | 2h05m |
| 2   | gpt-5.6-luna    | default         | `c3a8484fb`  | 3      | 276 | 249 (90%) | 115.4M | 3h23m |
| 3   | gemma-4-26b-a4b | `--small-model` | `90ead3407`  | 1      | 59  | 41 (69%)  | 3.4M   | 33m   |
| 4   | gemma-4-26b-a4b | `--small-model` | `90ead3407`  | 1      | 59  | 40 (68%)  | 3.1M   | 35m   |
| 5   | gemma-4-26b-a4b | default         | `90ead3407`  | 1      | 92  | 74 (80%)  | 17.0M  | 1h04m |
| 6   | gpt-5.6-luna    | default         | `b2e472eb0`  | 3      | 64  | 45 (70%)  | 51.6M  | 1h12m |
| 7   | gpt-5.6-luna    | default         | `92c6e7f06`  | 3      | 301 | 264 (88%) | 129.7M | 4h00m |
| 8   | gpt-5.6-luna    | default         | `47adbc056`  | 3      | 301 | 270 (90%) | 124.6M | 2h56m |
| 9   | gpt-5.6-luna    | default         | `d5971a5bd`  | 3      | 301 | 273 (91%) | 130.7M | 4h11m |

**Run 6 was stopped after 22 of 101 scenarios** and is not a suite result — the
70% is over the scenarios it reached, which are the expensive front of the list.
It was killed on purpose: `swing-and-quantize` and `melody-transforms` had both
gone 3/3 to 0/3 against run 2, and bisecting that mattered more than finishing.
See "Where a fragment sits can cost more than what it says". Do not compare its
percentage to any full run.

All `--skip-judge`, so these are deterministic checks only. Gemma runs local (LM
Studio, `-b http://localhost:1234/v1`) and costs nothing, but its token totals
measure the same thing. Small-model mode skips 34 of the 93 scenarios.

**Input tokens are the number to move** when trimming tool and param
descriptions. That is why a run records its totals and not only its failures.

**Runs 3-5 are n=1 and cannot detect a regression.** 11 of 59 small-model
scenarios flipped between runs 3 and 4 — same model, same commit, same flags. A
single red cell in a gemma column is noise, not a finding.

### Failures

Every scenario that failed at least one trial in runs 2-9. `skip` means the
scenario is not in small-model mode's set; `—` means the scenario did not exist
in that run.

| scenario                                | 2 luna x3 | 3 gemma sm | 4 gemma sm | 5 gemma full | 7 luna x3 | 8 luna x3 | 9 luna x3 |
| --------------------------------------- | --------- | ---------- | ---------- | ------------ | --------- | --------- | --------- |
| `arpeggio-bracket-idiom`                | 3/3       | skip       | skip       | 0/1          | 3/3       | 3/3       | 3/3       |
| `arrangement-clip-workflow`             | 3/3       | skip       | skip       | 0/1          | 3/3       | 3/3       | 3/3       |
| `audio-sample-workflow`                 | 3/3       | 0/1        | 0/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `bar-beat-absolute-duration-uniformity` | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `bar-beat-melodic-legato-run`           | —         | —          | —          | —            | 2/3       | 2/3       | 3/3       |
| `bar-beat-meter-fill`                   | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `bar-beat-per-bar-spread`               | 3/3       | 0/1        | 1/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `bar-beat-triplets`                     | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `bar-beat-zip-streams`                  | —         | —          | —          | —            | 3/3       | 2/3       | 3/3       |
| `context-memory-recall`                 | 3/3       | skip       | skip       | 0/1          | 3/3       | 3/3       | 2/3       |
| `context-memory-update-not-duplicate`   | 2/3       | skip       | skip       | 0/1          | 1/3       | 3/3       | 3/3       |
| `context-onboarding-records-decline`    | 3/3       | skip       | skip       | 0/1          | 3/3       | 3/3       | 3/3       |
| `context-write-layer-global`            | 1/3       | 0/1        | 0/1        | 1/1          | 2/3       | 2/3       | 2/3       |
| `context-write-layer-memory`            | 3/3       | skip       | skip       | 0/1          | 3/3       | 3/3       | 3/3       |
| `context-write-layer-project`           | 3/3       | 1/1        | 0/1        | 0/1          | 2/3       | 2/3       | 3/3       |
| `context-write-preserves`               | 3/3       | 1/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `delete-targets`                        | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `drum-backbeat-barbeat`                 | 3/3       | 1/1        | 0/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `drum-backbeat-stark`                   | 1/3       | 1/1        | 1/1        | 1/1          | 0/3       | 1/3       | 1/3       |
| `drum-pad-force-guard`                  | 3/3       | 0/1        | 0/1        | 0/1          | 1/3       | 3/3       | 3/3       |
| `drum-transforms`                       | 0/3       | skip       | skip       | 0/1          | 0/3       | 0/3       | 0/3       |
| `duplicate`                             | 3/3       | 1/1        | 0/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `duplicate-loop`                        | 0/3       | 1/1        | 1/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `duration-reach-for-quarter`            | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `legato-transforms`                     | 0/3       | skip       | skip       | 0/1          | 0/3       | 1/3       | 1/3       |
| `library-search-fanout`                 | 1/3       | skip       | skip       | 1/1          | 2/3       | 2/3       | 2/3       |
| `locator-navigation`                    | 2/3       | skip       | skip       | 0/1          | 0/3       | 0/3       | 1/3       |
| `melody-pitch-midi-json`                | 3/3       | 0/1        | 0/1        | 1/1          | 2/3       | 3/3       | 3/3       |
| `melody-pitch-stark`                    | 3/3       | 0/1        | 1/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `melody-transforms`                     | —         | —          | —          | —            | 3/3       | 2/3       | 2/3       |
| `middle-c-scale-barbeat`                | 3/3       | 1/1        | 1/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `middle-c-scale-midi-json`              | 3/3       | 1/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `middle-c-scale-stark`                  | 3/3       | 1/1        | 1/1        | 0/1          | 3/3       | 3/3       | 3/3       |
| `negative-cases`                        | 2/3       | 1/1        | 1/1        | 1/1          | 0/3       | 1/3       | 3/3       |
| `note-ops-merge`                        | 1/3       | skip       | skip       | 1/1          | 3/3       | 1/3       | 1/3       |
| `note-ops-ratchet-roll`                 | 2/3       | skip       | skip       | 1/1          | 2/3       | 3/3       | 2/3       |
| `note-ops-repeat`                       | 0/3       | skip       | skip       | 1/1          | 0/3       | 0/3       | 0/3       |
| `note-ops-split`                        | 0/3       | skip       | skip       | 0/1          | 0/3       | 0/3       | 0/3       |
| `path-insert-position`                  | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `path-take-lane-first`                  | 3/3       | 1/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `path-topath-clips`                     | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `path-topath-devices`                   | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `path-track-scene-address`              | 3/3       | 0/1        | 1/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `path-uncommon-roots`                   | 3/3       | 0/1        | 1/1        | 1/1          | 2/3       | 3/3       | 3/3       |
| `range-clear-boundaries`                | 3/3       | 0/1        | 0/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `rhythm-grid-barbeat`                   | 3/3       | 0/1        | 1/1        | 1/1          | 3/3       | 3/3       | 3/3       |
| `synced-lfo-meter-invariance`           | —         | —          | —          | —            | 2/3       | 2/3       | 2/3       |
| `transform-random-baked-or-replayed`    | —         | —          | —          | —            | 0/3       | 0/3       | 0/3       |
| `drum-backbeat-midi-json`               | 3/3       | 1/1        | 1/1        | 1/1          | 3/3       | 3/3       | 2/3       |

Three rows are not findings: `duplicate-loop` is run 2 predating ADR-0040,
`drum-backbeat-stark` is red on purpose (below), and `legato-transforms` graded
a spelling the parser accepts — two of its three trials failed only on writing
`random()` where the check wanted `rand()`, and the check was widened 45 minutes
after that run finished. Corrected, it is about 1/3.

**The stronger model fails where the weaker one passes.** Luna is 0/3 on
`note-ops-repeat`, 1/3 on `note-ops-merge` and 0/3 on `note-ops-split` while
gemma passes the first two. Not a fluke of scoring — see the next section.

### What moved between runs 7 and 8

Seventeen commits apart, same model, same flags, so a moved cell is either those
commits or noise. n=3 cannot tell them apart on its own — read a 3/3 to 2/3 as
noise unless a commit explains it.

Green: `drum-pad-force-guard` 1/3 to 3/3, which the pad-guard fixes in that
range do explain; `context-memory-update-not-duplicate` 1/3 to 3/3;
`note-ops-ratchet-roll` and `melody-pitch-midi-json` 2/3 to 3/3.
`path-uncommon-roots` 2/3 to 3/3 is the scenario, not the model — it was
reworded to ask for a selection outright.

Red: `note-ops-merge` 3/3 to 1/3, `bar-beat-zip-streams` and `melody-transforms`
3/3 to 2/3. Nothing in the range touches any of them.

Red in both, 0/3 twice: `drum-transforms`, `locator-navigation`,
`note-ops-repeat`, `note-ops-split`, `transform-random-baked-or-replayed`. Two
locator fixes landed in the range and `locator-navigation` did not move, which
fits — they corrected the name a read hands back, and the scenario fails on the
model preferring a bar number it already has over naming the locator.

### What moved between runs 8 and 9

Eleven commits apart (the take-lane `l+` change, the duplicate destination
pairing fix, and docs), same model, same flags.

Green: `bar-beat-zip-streams`, `context-write-layer-project` and
`bar-beat-melodic-legato-run` back to 3/3. Nothing in the range touches them, so
read the 2/3 cells in run 8 as noise. `locator-navigation` 0/3 to 1/3 and
`negative-cases` 1/3 to 3/3 likewise have no commit behind them.

Red: `context-memory-recall` 3/3 to 2/3, `note-ops-ratchet-roll` 3/3 to 2/3,
`drum-backbeat-midi-json` 3/3 to 2/3 (its first red in any run). No commit in
the range touches any of them.

Red in three runs, 0/3 each time: `drum-transforms`, `note-ops-repeat`,
`note-ops-split`, `transform-random-baked-or-replayed`. These are stable
findings, not flakiness.

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

## Scenarios that are red on purpose

**`drum-backbeat-stark`.** The prompt asks for a four-on-the-floor kick; the
model writes `kick: X z X z` — the 1&3 kick — in every trial, alongside the
taught snare line. That is the stark skill's only drum example, copied line for
line: the model derived the hi-hat, the one line it had to change, and copied
the rest.

The scenario was written to detect exactly this, and it is a `capability`
scenario — an improvement target, not a regression guard. **Changing the skill's
example to four-on-the-floor would move the anchor rather than remove it,** and
would defeat the scenario's own measurement. Red here is a legitimate reading.

## Design assumptions the runs contradicted

**`force: true` is reached for casually.** `context.def.ts` intends the model to
meet `force` through the clobber warning "at the moment it is relevant, so it
never reaches for it casually". Runs called `ppal-context` with `force: true` on
a **first** write, with no skipped write to justify it. Harmless in those runs —
the content preserved the existing text — but the assumption behind the design
does not hold.

## Design assumptions the runs confirmed

**Models trust a write result that says nothing.** The observability principle
has writes report only what did not land as asked, and the standing objection
was that a model would not believe silence and would verify every write with a
read — costing more than the echo saved. Measured as a matched pair on one tool:
`ppal-update-track` answers a `name` write with a bare `{id, path}` and a
`gainDb` write with `{id, path, gainDb}`, so only the reporting differs. Luna
3/3 and gemma small-model 1/1 on both arms — eight runs, zero follow-up reads
either way. Scenarios: `evals/scenarios/defs/result/write-result-trust.ts`.

Two limits on that. Both arms write ONE property, so the case that motivated the
worry — a rack call writing a dozen params, all silent — is still unmeasured.
And the arms differ in the kind of value as well as the reporting: a name is a
string, a gain is continuous and Live may quantize it, so a model has an honest
reason to check the gain it lacks for the name. That pushes reads toward the
echoing arm, which can only understate a problem in the silent one.

## A scenario can be red because it scripted the route

`drum-pad-force-guard` fails gemma on
`turn 4: replaced the pad's instrument once told to`, which reads as a
confirmation-gate breach and is the opposite. The scenario expects turn 3 to
trip the force guard so turn 4's "yes, go ahead" carries out the replacement.
Gemma reached the pad another way — it wrote the `sample` param into the Simpler
it had just created — so nothing was refused, nothing was offered, and turn 4's
"yes" arrived with no pending question. The model said it did not know what to
replace, which is correct.

Grade the guard, not the path. A scenario that assumes one route to a target
reports red for a model that found another.

`transform-random-baked-or-replayed` was written this way and had to be redone
before it measured anything. Requiring the `transforms` param scored 0 of 3 on
gemma — but two of those trials hand-wrote four different snare velocities,
which IS the baked outcome, reached without the DSL. Graded on the clip's end
state instead (distinct velocities and no deviation vs. a deviation on every
note), the same baseline is 2 of 3. The first number was the grader, not the
model.

## What a transcript does not show you

`stringifyToolResult` unwraps only the _first_ text block of a tool result, so a
displayed connect result is a couple hundred characters of `{connected:true,…}`
and the skills, global context, memory index and next-step blocks are not in it.
The model saw them; the printed transcript did not. One context bug hid for
eight days behind exactly this.

**The JSON results now carry them.** Every tool call records `injectedBlocks` —
each block after the payload that is not a relayed `WARNING:`. The writer stores
each distinct block once per run as `blocks/<hash>.txt` and leaves the hash in
the result, because the skills alone run ~90-145 KB and are byte-identical
across scenarios; inlining them would cost megabytes per run.

So: to check whether the model was given the context it needed, read
`injectedBlocks` out of the JSON, not the printed transcript. Before concluding
a context or onboarding failure is the model's, look there.

## A run that never happened is not a failed run

A result file whose `turns` is empty and whose `error` is set — `fetch failed`
is the usual one, from the device reloading while the harness is mid-request —
never reached the model. It has no `checks.results` to grade. Count it as a
failure and the pass rate reads low for a reason that has nothing to do with the
model.

This is easy to hit while rebuilding between runs. During the `feac7199b`
bisect, the control at run 2's own commit scored "2/3" and briefly looked like
the scenario was too noisy to bisect on; one of the three had died at 1s with
zero turns, and the real score was 2/2. Discarding those files instead made
every step of the bisect read cleanly.

Filter on `d.error || !d.turns?.length` and report the discards separately, so a
step that lost most of its trials to reloads is visibly weak evidence rather
than a confident red.

## Rack chain sends can't be covered by an eval yet

`evals/live-sets/` holds no rack with a return chain, and rack return chains
cannot be created through the Live API (see `e2e/live-sets/racks-test-spec.md`),
so a scenario needs a Set saved by hand first. The e2e side is covered —
`racks-test` bakes in `rc0`/`rc1`, and three files drive chain sends against
real Live.

## Machine state can decide a scenario

`seedContext` once installed a global document but left the developer's real
**memories** alone. Any stored memory makes `isNewUser()` false, so connect
returns `BASE_NEXT_STEP` instead of `ONBOARDING_NEXT_STEP`, the model is never
told to ask the onboarding question, and the scenario is a deterministic 0/3 on
any populated machine. It now snapshots the whole store, empties it, seeds, then
restores.

The general rule: a scenario that reads user state must control **all** of it,
not just what the run itself added. Diff-based teardown can't remove residue
that predates the run.
