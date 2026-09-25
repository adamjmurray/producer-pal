# Eval Findings

What full-suite eval runs have established about model behavior, and which fixes
have already been tried and measured. `evals/README.md` covers how to run the
tools; `dev/quality/testing.md` covers the unit and e2e suites.

**Why these pages exist.** `evals/results/` is gitignored, so a run's numbers
and the reasoning drawn from them survive only if they are written down here. A
negative result is the most valuable thing here: it is the difference between
not doing a day of work and doing it twice.

## Parts

| File                                       | What's in it                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| [recorded-runs.md](recorded-runs.md)       | Every recorded run: model, mode, commit, pass rate, tokens, and caveats    |
| [scenario-results.md](scenario-results.md) | Per-scenario failures across runs, and what moved between runs             |
| [wording-changes.md](wording-changes.md)   | Skill wording changes that did and did not work, and where a fragment sits |

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
either way. Scenario: `evals/scenarios/defs/result/write-result-trust.ts` (the
echoing arm is retired: a `gainDb` write that lands as asked no longer echoes,
so only the silent arm is left).

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

## A scenario can go red when a result moves its facts

`rack-pad-ops` was 0/3 for luna in run 10 on
`turn 3: the copy layered onto the occupied pad`, and every transcript showed
the model doing exactly that. The check read the call's `warnings` for the word
"layer"; the duplicate tool had moved that fact onto the copy's own result entry
as a `reason` in the range, so no trial could ever pass. The assertion now reads
the `reason`.

When a tool starts reporting a target's fact on the target's entry instead of in
the `WARNING:` block, grep the scenarios for `.warnings` on that tool — a grader
still reading warnings goes red on every model at once, which is the tell.

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
