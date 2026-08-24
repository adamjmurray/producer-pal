# ADR-0026: Small-model mode trims read output by include option, not by field

- **Status:** Accepted
- **Date logged:** 2026-08-19

## Context

Small-model mode trims input schemas and swaps the skills root. On the write
side that trim is deep — update-device hides 12 of 17 params, update-track 10
of 12. So a small model can be handed read output it has no param to act on.

The read tools were already trimmed, just not obviously: every one of them drops
`include` enum values in small-model mode (`warp`, `available-routings`,
`locators`, `drum-pads`, `return-chains`, and `"*"` everywhere). The trim is
enforced, not advisory — `filterSchemaForSmallModel` rebuilds the enum in the
schema that VALIDATES, so a trimmed value is rejected, not ignored.

What was missing was a rule for where to stop. Two candidates: keep trimming
whole options, or start suppressing individual fields inside the options that
survive. The plumbing for the second exists — `buildRequestContext` already puts
`smallModelMode` in every `ToolContext` — so this is a policy question, not a
feasibility one.

## Decision

**Trim by include option. Leave the fields inside a surviving option alone.**

An option goes when nothing the small model can do depends on it. "Depends on
it" means one of three things, and any one is enough to keep it:

1. it feeds a published param, on this tool or another,
2. it names something a later call has to address, or
3. it answers a question a user actually asks.

That test is deliberately wider than "has a matching write param". `sampleFile`,
`instrument`, `drumMap`, `id`, and `path` have no write param and are all
load-bearing.

Applied, it removes two options:

- **`actions` on read-device** — its only consumer is update-device's `actions`
  param, which small mode hides. `skip-scenario.ts` already treated that param
  as the canonical small-model exclusion.
- **`routings` on read-track and read-live-set** — all four routing write params
  are hidden, and `available-routings` was already trimmed. Keeping it left a
  small model able to see the state, not the choices, and change neither. This
  one is a real capability loss: it can no longer answer "what is this track
  routed to?". Accepted — the half-measure was worse than the gap.

## Alternatives rejected

- **Per-field suppression.** The dead fields are chain `gainDb`/`pan`/`sends`/
  `mappedPitch`/`chokeGroup` (read-device `chains`), `sends` and the split-pan
  trio (`mixer`), `firstStart` (`timing`), and `variations`/`macros`/`abCompare`
  (read-device `params`). Suppressing them means threading a flag through every
  read helper, or a recursive deny-list that can't tell a clip's `gainDb` (which
  small mode CAN write) from a chain's (which it can't). Either way it adds a
  second, silent way read output varies by mode — one nothing can guard the way
  `small-model-param-references.test.ts` guards descriptions. The option lever
  costs one line per tool and reuses validation that already exists.

  The deeper reason: an option is what the model CHOOSES. It can decline an
  option; it can't decline a field. So the option boundary is where the model's
  decision and the cost actually meet.

- **Fixing it in `basicDriver` instead** — a devices fragment explaining the
  chain fader would teach a small model about params it doesn't have. The
  existing arrangement is already the right one: update-device's `params`
  description carries the devices guidance precisely because small mode ships no
  devices fragment.

- **Doing nothing.** Defensible for the fields, not for the options. `routings`
  is ~40-55 tokens per track and always emitted once requested, which on a
  16-track set is the largest single block of unactionable read output in the
  product.

## Consequences

- Small-model read-device drops to 6 include options, read-track to 9,
  read-live-set to 4.
- The dead FIELDS stay, and that is the accepted cost of this decision. Most are
  cheap because they emit only when non-default (chain `gainDb`/`pan`/
  `chokeGroup`, split pan, `firstStart`, `variations`).
- **The one that isn't cheap:** chain `sends` inside read-device `chains`. A
  factory drum kit routes most pads to internal returns, and small mode already
  drops `drum-pads`, so `chains` is the ONLY route into a drum rack — exactly
  the path a small model gets pushed down. Unmeasured; needs a real Live Set.
- **Revisit trigger:** a measurement showing chain `sends` costs real context on
  a factory kit, or a third option turning out to be dead — at which point the
  per-field question is worth reopening with data instead of inspection.
