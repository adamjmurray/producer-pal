# Eval Findings

What full-suite eval runs have established about model behavior, and which fixes
have already been tried and measured. `evals/README.md` covers how to run the
tools; `dev/Testing.md` covers the unit and e2e suites.

**Why this file exists.** `evals/results/` is gitignored, so a run's numbers and
the reasoning drawn from them survive only if they are written down here. A
negative result is the most valuable thing on this page: it is the difference
between not doing a day of work and doing it twice.

## The gpt-5.6-luna baseline

```bash
scripts/eval -a -m codex-code/luna --skip-judge -r 3
```

186 / 231 pass (80.5%), 2h05m wall clock, 84.4M input tokens. Default
environment: large-model mode, compact output, all standard tools, no Direct
Live API, no judge.

Treat the pass rate as a rough anchor, not a target. Scenarios have been added
and rewritten since, so a later run is only comparable scenario by scenario.

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

`stringifyToolResult` unwraps only the _first_ text block of a tool result. A
recorded connect result is therefore a couple hundred characters of
`{connected:true,…}`, and the skills, global context, memory index and next-step
blocks never appear. The model saw them; the transcript did not.

So a report cannot tell you whether the model was given the context it needed.
Read the injected blocks another way before concluding a context or onboarding
failure is the model's. One such bug hid for eight days behind exactly this.

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
