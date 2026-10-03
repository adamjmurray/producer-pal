# Drum Racks: Pads Are Slots, Chains Are Layers

How Producer Pal models a Drum Rack, and why. Part of
[Specialized Devices](README.md). Live facts that came out of probing (nested
racks, chainless pads, `pad.name`) are in
[live-api-behavior.md](../../coding-standards/live-api-behavior.md); the path
rules are in [object-paths](../../tools/object-paths/README.md).

## Live's model

Verified on `e2e/live-sets/racks-test`, Live 12.4.3.

- A rack has 128 permanent `DrumPad` slots with fixed ids. They never appear,
  disappear or move as pads are filled or cleared.
- The **rack** owns the chains. Each chain's `in_note` says which pad it sounds
  on, and several chains can share one. That is how a pad layers.
- A Drum Rack nested in a drum pad has **no** `DrumPad` objects. Its pads exist
  only as chains with an `in_note`.

So a pad is the slot at a pitch, and chains are what's stacked in it. Presenting
pads as containers of chains got this backwards and showed up as bugs: pad-wide
writes reaching only the first layer, two chain orders that disagree once a pad
is stacked, a pad id that resolves in one rack and not another.

## How tools use it

- **A pad reference names the slot**: the `DrumPad` where one exists, plus every
  chain sharing its `in_note`. Reads build pads by grouping the rack's chains on
  `in_note` (`drum-pads-from-chains.ts`), the only construction that also works
  for a nested rack.
- **`in_note` is reached through paths, not exposed as a number.** `t0/d0/pC1`
  is the whole pad, `t0/d0/pC1/c1` one layer. A `toPath` on a layer path
  re-points that chain's `in_note`, which splits a stacked pad or merges a layer
  onto another pad. Pad-level move and duplicate are the shortcut for "every
  layer." Don't expose `in_note` as a settable number: it would be a second way
  to spell a move, in raw MIDI numbers, without the destination-occupied detail
  a path gets for free. (`out_note` is `mappedPitch` because nothing else
  addresses it.)
- **Pad-wide or per-layer depends on whether one value can honestly cover every
  layer.** `mute`, `solo`, `chokeGroup`, `mappedPitch`, `color` and a move
  broadcast. `name`, `gainDb`, `pan` and sends are per-layer: writing one
  absolute mixer value to every layer flattens the balance between them. On a
  stacked pad they are not written, and the pad's result entry says so in
  `detail`, naming the layer paths (`refuseTargetWork`, in
  `update-drum-pad-group.ts`). A single-chain pad takes everything.
- **Read layers by filtering the rack's chains on `in_note`**, never from
  `pad.chains`: its order disagrees with the rack's once a pad is layered, so a
  layer gets another layer's path.
- **A pad has layers, not a name.** Pad reads carry the `chains` array, or a
  `chainCount` when chains weren't asked for.
- **A chainless pad takes no writes.** Live accepts them, returns 1 and drops
  them, so update-device refuses rather than report success. The exception is a
  `sample` write, which makes the pad's chain first.

## Deleting and copying

- **Deleting a pad clears its chains; the slot stays.** The rack then reads as
  it would for a pad never filled (gone from `drumPads` and `drumMap`). The
  entry carries `path` rather than `deletedPath`, and the pad `id` stays
  resolvable, the only delete where a caller's id survives. Clearing a pad that
  is already empty gives the same entry: nothing needs retrying, and telling the
  two apart would cost a chain-count read before every pad delete.
- **A nested rack's pads move but never delete.** `DrumChain` has no self-delete
  and `delete_all_chains` needs a pad the rack doesn't have. `in_note` writes
  still work.
- **`copy_pad` on a rack with `has_drum_pads` of 0 hard-crashes Live.** That is
  every Drum Rack nested in a pad. `refuseRackWithoutPads` in
  `duplicate-drum-pad.ts` guards it; never call `copy_pad` without that check.
- Results give the pad-relative chain path (`pC1/c0`), not Live's rack-relative
  one, because a layer's index shifts only when that pad's own layers change.
