# Scenario results by run

Which scenarios failed in which run, and what moved between runs. Run numbers
refer to [recorded-runs.md](recorded-runs.md); the index is
[README.md](README.md).

## Failures

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

Three rows are not findings: `duplicate-loop` is run 2 predating the
`duplicateLoop` refusal, `drum-backbeat-stark` is
[red on purpose](README.md#scenarios-that-are-red-on-purpose), and
`legato-transforms` graded a spelling the parser accepts — two of its three
trials failed only on writing `random()` where the check wanted `rand()`, and
the check was widened 45 minutes after that run finished. Corrected, it is about
1/3.

**The stronger model fails where the weaker one passes.** Luna is 0/3 on
`note-ops-repeat`, 1/3 on `note-ops-merge` and 0/3 on `note-ops-split` while
gemma passes the first two. Not a fluke of scoring — see
[wording-changes.md](wording-changes.md#wording-changes-that-were-measured-and-did-not-work).

## What moved between runs 7 and 8

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

## What moved between runs 8 and 9

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

## What moved between runs 9 and 10

132 commits apart, same model, same flags. Too wide a range to pin a moved cell
on a commit; read anything within one trial as noise.

Green: `context-memory-recall`, `drum-backbeat-midi-json`,
`library-search-fanout`, `melody-transforms` back to 3/3. `drum-transforms` 0/3
to 1/3 and `legato-transforms` 1/3 to 2/3 — each the best luna result on record
for that scenario.

Red: `bar-beat-zip-streams` 3/3 to 1/3 (it hand-listed 16 positions instead of a
repeat), `note-ops-merge` 1/3 to 0/3, `synced-lfo-meter-invariance` 2/3 to 1/3,
`context-write-layer-global` 2/3 to 1/3, `bar-beat-melodic-legato-run` and
`context-memory-update-not-duplicate` 3/3 to 2/3.

Two scenarios are new since run 9: `write-trust-echoed-result` 2/3, and
`rack-pad-ops` 0/3 — the latter was the grader, not the model (see
[A scenario can go red when a result moves its facts](README.md#a-scenario-can-go-red-when-a-result-moves-its-facts)).

**13 of the 32 fails share one signature:** "`transforms` parameter missing in
turn 2", across `note-ops-merge`, `note-ops-repeat`, `note-ops-split` (0/3
each), `note-ops-ratchet-roll`, `synced-lfo-meter-invariance` and
`drum-transforms`. The model reaches turn 2 of a transforms scenario and edits
the clip another way, or not at all. One behavior, not six scenarios — and the
same thing "Surfacing the note-count operations" in
[wording-changes.md](wording-changes.md#wording-changes-that-were-measured-and-did-not-work)
measured.

## qwen3.8-27b on the basic tier (runs 11-13)

Three n=1 runs at the same commit, so together they say what one gemma run
cannot: 47 of 65 scored scenarios pass all three times, 15 flip, 3 never pass.
Read the model as ~85% ± 2 on this tier; a single run's swing is noise.

The three that never pass are judgment, not precision: `negative-cases` changed
the tempo it was told to leave alone every run (to 70, 50, 70);
`drum-pad-force-guard` passed `force:true` without asking, or replaced the pad
before turn 4 said to; `duration-reach-for-quarter` is the `transforms`-missing
signature above. `path-topath-clips` failed the same way twice — kept only the
second of two `toPath` targets — which reads as a real multi-target weakness.

## What moved between runs 10 and 14

A model change: run 10 is `gpt-5.6-luna`, run 14 `gpt-6-luna`. They are also 254
commits apart, and run 14 is ×2 instead of ×3, so a 1/2 cell is one trial and
reads as noise. Run 14's 0/2 scenarios were re-run at ×2; the scores below are
over all four trials.

Red on gpt-6-luna, and consistent enough to be real:

- `context-memory-update-not-duplicate` 2/3 to 0/4. Told "I've switched from
  Serum to Vital", it agrees in prose and never updates the `favorite-synth`
  memory. It writes the update only when the failure-reflection turn asks why.
- `melody-pitch-midi-json` 3/3 (run 9) to 1/4. Every failure writes the whole
  melody an octave low: the user's C3 as MIDI 48, not the C3 = 60 the Skills
  state.

Both are the model, not the code. The Skills and tool text they depend on are
unchanged since 2.3.0, and `gpt-5.6-luna` at the same commit (`3a468481c`)
passed both 3/3.

`create-and-edit-clip` 1/4 is mostly the grader. It requires the `quantize`
param, but `quantizeGrid` alone quantizes at full strength (as its description
says), and a `quant()` transform does the same job; each took one failure. The
third created the clip empty and wrote the notes in a second call.
`gpt-5.6-luna` went 2/3 at the same commit, failing on the same grid-only call.

`path-topath-devices` went 0/4 on the grader, not the model: all four trials
copied the device with `toPath: "t1/d+"` and it landed, but the check predated
`d+` appending. With the check fixed, a ×2 re-run passed 2/2.

Green: `bar-beat-zip-streams`, `synced-lfo-meter-invariance` and
`context-write-layer-global` from 1/3, `legato-transforms` and
`bar-beat-melodic-legato-run` from 2/3, all to 2/2. `rack-pad-ops` 0/3 to 2/2
after its grader fix.

Still red: `drum-transforms` and `note-ops-repeat` 1/4; `note-ops-merge`,
`note-ops-split` and `transform-random-baked-or-replayed` 0/4. The note-ops
fails are still "`transforms` parameter missing in turn 2".
