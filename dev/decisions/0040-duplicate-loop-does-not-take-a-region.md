# ADR-0040: duplicateLoop does not take a region

- **Status:** Accepted
- **Date logged:** 2026-09-06
- **Reverses:** the composition added in `875178a3c` (2026-06-28)

## Context

`ppal-update-clip` accepts `duplicateLoop: true`, a passthrough to Live's
`Clip.duplicate_loop`. It doubles the loop region and copies the notes — and the
automation envelopes, which a manual length+notes rewrite cannot do.

`duplicate_loop` acts on the loop region, which is `start` to `start + length`.
So `start` and `length` decide what gets copied, and the tool has to say when
they are applied relative to the double.

Originally the tool warned and dropped `length` when it was combined with
`duplicateLoop`. `875178a3c` changed that to compose — `start`/`length` set the
region first, then Live doubles exactly that — to enable selecting a sub-region
and doubling it. The old warning ("duplicateLoop sets the clip length") was
removed because it had become false. No warning replaced it, because the
composition was understood as a feature rather than a surprise.

It is a surprise. `length` means the length you end up with everywhere else in
the tool; combined with `duplicateLoop` it means the length you double from.
`{length: "4bar", duplicateLoop: true}` on a 2-bar clip produces 8 bars.

That reading is what a model actually produces. In an eval measuring "double
that clip's length to 4 bars", 8 of 9 trials wrote
`{length: "4bar", duplicateLoop: true}` and got 8 bars. The param description
already spelled out the order, prominently, in the schema the model reads on
every call. It did not help — a param that changes meaning based on a sibling
param is not learnable from prose.

Reporting the length honestly was tried first, and measurably helped without
fixing this. Before the result carried a `length`, 5 of those trials failed
silently. After, all 3 trials saw `length: "8bar"` come back, recognized the
overshoot, and repaired the clip by hand — passing the eval, but spending two to
three `update-clip` calls on a one-call operation. Visibility converted a wrong
answer into an expensive one. It did not stop the model reaching for the
ambiguous spelling, because the ambiguity is in the args, not the result.

## Evidence

Probed against Live 12.4.5. A 2-bar clip, C3 at 1|1 and E3 at 2|1, in each case.

**The composed call has no expressive power.** Two calls reproduce it exactly,
including the non-obvious part: `duplicate_loop` inserts, so material after the
region is pushed later rather than overwritten.

| Case                       | One call                                    | Two calls |
| -------------------------- | ------------------------------------------- | --------- |
| `length: "1bar"` (shrink)  | 2bar, `C3 1\|1 C3 2\|1 E3 3\|1`             | identical |
| `start: "2\|1"` + `"1bar"` | start 2\|1, 2bar, `C3 1\|1 E3 2\|1 E3 3\|1` | identical |
| `length: "4bar"` (grow)    | 8bar, `C3 1\|1 E3 2\|1 C3 5\|1 E3 6\|1`     | identical |

**The opposite order is worse.** Doubling first and then applying the region
makes the naive reading correct, but the param stops doing anything useful:
double 2bar to 4bar then `length: "4bar"` is a literal no-op, and
`length: "3bar"` strands `E3 4|1` outside the region. That order is also
reproducible in two calls, so neither order buys a capability.

**`firstStart` is region-neutral.** Probed in all three orders — combined,
`firstStart` first, `duplicateLoop` first — and every one lands on the same
clip: 4 bars, `C3 1|1 E3 2|1 C3 3|1 E3 4|1`, marker still at `2|1`. It sets the
playback start, not the loop region, so it does not select what gets copied and
the double does not move it.

## Decision

`start` or `length` combined with `duplicateLoop: true` is refused before
anything runs, with an error naming both correct spellings.

The check is on the args alone — no API reads, nothing started, atomic. A call
that can't be interpreted unambiguously throws before it starts, having changed
nothing, and refusing on structure alone is safe because the model just retries
with a corrected call and loses nothing (ADR-0035).

`firstStart` still composes.

Every workflow survives as two calls, each of which reads as what it does:

```
{ start, length }        select the region
{ duplicateLoop: true }  double exactly that
```

The cost is one round trip on a deliberate, rare operation. What it buys is the
removal of a silent wrong answer: the note count doubles under either reading,
so before this the composed call was indistinguishable from success.

## Rejected alternatives

**Keep composing, add a warning.** This is what warnings are for — a call that
worked but was written a way the tools tolerate without teaching. But the
warning arrives after the clip is already wrong, and it asks the model to learn
a rule it has already demonstrated it does not learn from the description. A
refusal makes the wrong call impossible instead of explaining it afterwards.

**Reverse the order.** Makes the intuitive reading right and the param useless
or destructive, as measured above.

**Reject only `length`.** `start` moves the region too, so it carries the same
ambiguity. Probed: `start: "2|1"` with `length: "1bar"` duplicated the E3 in bar
2 and left the C3 in bar 1 untouched.

## Consequences

`duplicateLoop` still reports the length it landed on: `duplicate_loop` moves
the length on its own, and a property the API moved on its own gets reported
because nothing else reveals it. That stays useful for the `duplicateLoop`-alone
call this ADR leaves as the only spelling.

The e2e case covering a sub-region double is rewritten as two calls rather than
deleted — it pins the insert-and-push behavior, which is empirical Live behavior
worth keeping under test.

**The order of the two fixes inside the error message decides whether it
works.** The first wording led with "send two calls — length first to pick the
region", and a trial followed it literally: it set the region it never wanted
and landed on 8 bars again, taking six calls to recover. Leading with "to double
the whole clip, send duplicateLoop on its own" and demoting the sub-region flow
took the scenario from 2/3 to 3/3, every trial recovering in exactly two calls.
A model reads the first remedy as the instruction, so the common case goes
first.
