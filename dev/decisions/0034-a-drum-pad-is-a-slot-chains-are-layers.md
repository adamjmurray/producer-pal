# ADR-0034: A drum pad is a slot, and chains are the layers on it

- **Status:** Accepted
- **Date logged:** 2026-08-30

## Context

Producer Pal originally presented a drum rack as pads that contain chains.
Live's model is the reverse, and the mismatch showed up as bugs rather than as a
design question: pad-wide writes reaching only the first layer, two chain orders
that disagree once a pad is stacked, a pad id that resolves in one rack and not
another.

What Live actually does, measured against `e2e/live-sets/racks-test` on 12.4.3:

- A rack has 128 permanent `DrumPad` slots with fixed ids. They never appear,
  disappear, or move as pads are filled or cleared.
- The rack owns the chains. Each chain's `in_note` says which pad it sounds on,
  and several chains can share one — that's how a pad layers.
- `pad.chains[N]` is the same object as the rack's own `chains[N]`.
- A Drum Rack nested inside a drum pad has **no** `DrumPad` objects at all. Its
  pads exist only as chains with an `in_note`.

So a pad is the slot at a pitch; chains are what's stacked in it.

## Decision

**A pad reference names the slot** — the `DrumPad` where one exists, plus every
chain sharing its `in_note`. Reads build pads by grouping chains on `in_note`,
which is the only construction that also works for a nested rack.

**`in_note` is the primitive, reached through paths rather than exposed as a
property.** `t0/d0/pC1` is the whole pad; `t0/d0/pC1/c1` is one layer. Writing
`toPath` on a layer path re-points that one chain's `in_note` — which is what
splits a stacked pad apart and merges a layer onto another pad. Pad-level move
and duplicate stay as the shortcut for "do this to every layer."

**Pad-wide versus per-layer is decided by whether one value can honestly cover
every layer.** `mute`, `solo`, `chokeGroup`, `mappedPitch`, `color` and a move
broadcast. `name`, `gainDb`, `pan` and sends are skipped with a warning naming
the layer paths, because writing one absolute mixer value to every layer
flattens the balance between them.

## Rejected

**Exposing `in_note` as a settable number.** It would be a second way to spell a
move, in raw MIDI note numbers, next to a `toPath` that already reads better and
gets the destination-occupied warning for free. `out_note` is exposed as
`mappedPitch` because nothing else addresses it; `in_note` has the path grammar.

**Treating `pad.name` as data.** Live computes it — the chain's name at one
chain, the note name at zero, `"Multi"` at two or more — and a user can name a
chain "Multi", so it can't distinguish a layered pad from a single-chain one.
Pad reads carry `chainCount` instead.

**Reading layers out of `pad.chains`.** Its order disagrees with the rack's
chains filtered by `in_note` once a pad is layered, so it labels a layer with
another layer's path. Filter the rack's chains.

**Making a chainless pad writable.** Live accepts the write, returns 1, and
drops it. Reporting that as success is reporting a lie, so update-device warns
and skips.

## Consequences

- A nested rack's pads **move but never delete**: `DrumChain` has no self-delete
  and `delete_all_chains` needs a pad the rack doesn't have, while `in_note`
  writes work fine.
- `copy_pad` on such a rack hard-crashes Live. `canCopyPads` guards it — never
  remove that check.
- Results give the pad-relative chain path (`pC1/c0`), not Live's rack-relative
  one, because the layer index shifts only when that pad's own layers change.

Implemented across
`src/tools/shared/device/helpers/device-reader-drum-helpers.ts`,
`src/tools/device/update/helpers/update-device-drum-pad-helpers.ts`, and the
path rules in [dev/Object-Paths.md](../Object-Paths.md). The Live API quirks
behind it are in [dev/Coding-Standards.md](../Coding-Standards.md).
