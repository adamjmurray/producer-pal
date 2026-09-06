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

All `--skip-judge`, so these are deterministic checks only. Gemma runs local (LM
Studio, `-b http://localhost:1234/v1`) and costs nothing, but its token totals
measure the same thing. Small-model mode skips 34 of the 93 scenarios.

**Input tokens are the number to move** when trimming tool and param
descriptions. That is why a run records its totals and not only its failures.

**Runs 3-5 are n=1 and cannot detect a regression.** 11 of 59 small-model
scenarios flipped between runs 3 and 4 — same model, same commit, same flags. A
single red cell in a gemma column is noise, not a finding.

### Failures

Every scenario that failed at least one trial in runs 2-5. `skip` means the
scenario is not in small-model mode's set.

| scenario                                | 2 luna x3 | 3 gemma sm | 4 gemma sm | 5 gemma full |
| --------------------------------------- | --------- | ---------- | ---------- | ------------ |
| `arpeggio-bracket-idiom`                | 3/3       | skip       | skip       | 0/1          |
| `arrangement-clip-workflow`             | 3/3       | skip       | skip       | 0/1          |
| `audio-sample-workflow`                 | 3/3       | 0/1        | 0/1        | 0/1          |
| `bar-beat-absolute-duration-uniformity` | 3/3       | 0/1        | 0/1        | 1/1          |
| `bar-beat-meter-fill`                   | 3/3       | 0/1        | 0/1        | 1/1          |
| `bar-beat-per-bar-spread`               | 3/3       | 0/1        | 1/1        | 0/1          |
| `bar-beat-triplets`                     | 3/3       | 0/1        | 0/1        | 1/1          |
| `context-memory-recall`                 | 3/3       | skip       | skip       | 0/1          |
| `context-memory-update-not-duplicate`   | 2/3       | skip       | skip       | 0/1          |
| `context-onboarding-records-decline`    | 3/3       | skip       | skip       | 0/1          |
| `context-write-layer-global`            | 1/3       | 0/1        | 0/1        | 1/1          |
| `context-write-layer-memory`            | 3/3       | skip       | skip       | 0/1          |
| `context-write-layer-project`           | 3/3       | 1/1        | 0/1        | 0/1          |
| `context-write-preserves`               | 3/3       | 1/1        | 0/1        | 1/1          |
| `delete-targets`                        | 3/3       | 0/1        | 0/1        | 1/1          |
| `drum-backbeat-barbeat`                 | 3/3       | 1/1        | 0/1        | 0/1          |
| `drum-backbeat-stark`                   | 1/3       | 1/1        | 1/1        | 1/1          |
| `drum-pad-force-guard`                  | 3/3       | 0/1        | 0/1        | 0/1          |
| `drum-transforms`                       | 0/3       | skip       | skip       | 0/1          |
| `duplicate`                             | 3/3       | 1/1        | 0/1        | 0/1          |
| `duplicate-loop`                        | 0/3       | 1/1        | 1/1        | 1/1          |
| `duration-reach-for-quarter`            | 3/3       | 0/1        | 0/1        | 1/1          |
| `legato-transforms`                     | 0/3       | skip       | skip       | 0/1          |
| `library-search-fanout`                 | 1/3       | skip       | skip       | 1/1          |
| `locator-navigation`                    | 2/3       | skip       | skip       | 0/1          |
| `melody-pitch-midi-json`                | 3/3       | 0/1        | 0/1        | 1/1          |
| `melody-pitch-stark`                    | 3/3       | 0/1        | 1/1        | 1/1          |
| `middle-c-scale-barbeat`                | 3/3       | 1/1        | 1/1        | 0/1          |
| `middle-c-scale-midi-json`              | 3/3       | 1/1        | 0/1        | 1/1          |
| `middle-c-scale-stark`                  | 3/3       | 1/1        | 1/1        | 0/1          |
| `negative-cases`                        | 2/3       | 1/1        | 1/1        | 1/1          |
| `note-ops-merge`                        | 1/3       | skip       | skip       | 1/1          |
| `note-ops-ratchet-roll`                 | 2/3       | skip       | skip       | 1/1          |
| `note-ops-repeat`                       | 0/3       | skip       | skip       | 1/1          |
| `note-ops-split`                        | 0/3       | skip       | skip       | 0/1          |
| `path-insert-position`                  | 3/3       | 0/1        | 0/1        | 1/1          |
| `path-take-lane-first`                  | 3/3       | 1/1        | 0/1        | 1/1          |
| `path-topath-clips`                     | 3/3       | 0/1        | 0/1        | 1/1          |
| `path-topath-devices`                   | 3/3       | 0/1        | 0/1        | 1/1          |
| `path-track-scene-address`              | 3/3       | 0/1        | 1/1        | 1/1          |
| `path-uncommon-roots`                   | 3/3       | 0/1        | 1/1        | 1/1          |
| `range-clear-boundaries`                | 3/3       | 0/1        | 0/1        | 1/1          |
| `rhythm-grid-barbeat`                   | 3/3       | 0/1        | 1/1        | 1/1          |

Two rows are not findings: `duplicate-loop` is run 2 predating ADR-0040, and
`drum-backbeat-stark` is red on purpose (below).

**The stronger model fails where the weaker one passes.** Luna is 0/3 on
`note-ops-repeat`, 1/3 on `note-ops-merge` and 0/3 on `note-ops-split` while
gemma passes the first two. Not a fluke of scoring — see the next section.

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

**So: teaching a spelling is worth trying; arguing a model out of a preference
is not.**

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
