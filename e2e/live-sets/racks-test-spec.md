# Racks Test Set Specification

Small Live Set for two things the main `e2e-test-set` can't express:

1. **Macro-mapped (disabled) parameters.** A macro mapping makes its target
   report `is_enabled: 0`. Live accepts a `set` on a disabled parameter, returns
   1, and ignores it — so a write silently does nothing. Producer Pal can't
   create macro mappings through the Live API, so they have to be baked into a
   Set.
2. **Nested racks.** A Drum Rack inside an Instrument Rack chain, a Drum Rack
   inside a Drum Rack pad, and a melodic instrument two Instrument Racks deep.

It also holds a Drum Sampler, a Sampler, and a multi-sample Simpler on drum
pads, for the pad sample-write policy (warn-skip, and what `force: true`
unlocks). Multi-sample mode can't be switched on through the Live API, so that
pad has to be baked in too.

Rack **return chains** also can't be created through the Live API — another
reason this Set exists rather than being built at test runtime.

---

## Global Settings

| Property       | Value      |
| -------------- | ---------- |
| Name           | racks-test |
| Tempo          | 120 BPM    |
| Time Signature | 4/4        |
| Scale          | A Minor    |
| Scenes         | 8          |
| Return tracks  | None       |

One clip per music track, in scene 0. They exist so rack **detection** can be
asserted through what `read-clip` serializes — drum lines vs. pitched chords —
so their content matters more than their musicality.

---

## Tracks

### t0: Drums (MIDI)

The whole structure lives here.

```
d0: Instrument Rack "Outer"              (no macro mappings)
│   Macro 1 and Macro 2 both renamed "Drive"
└── c0: "Kit"
    └── d0: Drum Rack "Kit"              (7 macro mappings — see below)
        ├── pC1  "Kick"         -> Simpler "synth-kick"
        ├── pD1  "Snare"        -> Simpler "synth-snare"
        ├── pE1  "Clap"         -> Simpler "synth-clap"
        ├── pF1  "Sub Kit"      -> Drum Rack "Sub Kit"   [chain gainDb -6]
        │                           └── pC3 "Hat" -> Simpler "synth-hat-open"
        ├── pAb1 "Drum Sampler" -> Drum Sampler "synth-tom-low"
        ├── pA1  "Sampler"      -> Sampler "synth-tom-high"
        ├── pBb1 "Multi-Simpler" -> Simpler in multi-sample mode (2+ samples)
        ├── rc0: "A Saturator"  -> Saturator
        └── rc1: "B Reverb"     -> Reverb
```

`pF1`'s chain carries a **-6 dB trim** — a non-default chain mixer for tests
that need one (e.g. the warning when a chain trim is left behind by a device
move).

Neither "Outer" nor "Sub Kit" has macro mappings. Only the "Kit" Drum Rack does,
so an unmapped rack is always available as a control.

"Outer"'s first two macros are **both named `Drive`** — a repeated param name,
which only a rack can produce by hand. Only the raw names collide, so
read-device still tells them apart as `Drive (Macro 1)` and `Drive (Macro 2)`,
and a write by either of those lands. A macro name can't be set through the Live
API: Live acks the write and ignores it.

`s0` holds a MIDI clip on the pads C1, D1, E1, and F1 — F1 included on purpose,
since that pad's device is itself a Drum Rack. The track must serialize as drums
in every notation.

### t1: Chords (MIDI, armed)

The negative case: a melodic instrument nested as deep as the kit is, with no
Drum Rack anywhere, so drum detection must **not** fire.

```
d0: Instrument Rack "Outer"
└── c0: "Inner"
    └── d0: Instrument Rack "Inner"
        └── c0: "Meld"
            └── d0: Meld
```

Two rack levels to the instrument, which is also the deeply-nested case: the
tree walk has to descend twice to find it.

`s0` holds a four-chord progression. The track must serialize as pitched chords
in every notation, and report no drum map.

### t2: PPAL (MIDI)

Producer Pal Max for Live device. The Set is saved with the **Live API tool
enabled**, so `ppal-live-api` is available for asserting `is_enabled` directly
instead of inferring it from read-backs.

---

## Macro Mappings

The point of the Set. Macros on the "Kit" Drum Rack, and the `is_enabled` values
they produce:

| Macro | Name           | Target                       |
| ----- | -------------- | ---------------------------- |
| 1     | Kick ChainVol  | pC1 chain mixer volume       |
| 2     | Kick ChainPan  | pC1 chain mixer pan          |
| 3     | Kick SendA     | pC1 chain mixer send A       |
| 4     | Kick Volume    | pC1's Simpler `Volume` param |
| 5     | Snare ChainVol | pD1 chain mixer volume       |
| 6     | Sat ChainVol   | rc0 chain mixer volume       |
| 7     | Sat ChainPan   | rc0 chain mixer pan          |

Resulting `is_enabled` (0 = disabled, writes silently do nothing):

| Chain             | volume | pan   | send A | send B |
| ----------------- | ------ | ----- | ------ | ------ |
| pC1 Kick          | **0**  | **0** | **0**  | 1      |
| pD1 Snare         | **0**  | 1     | 1      | 1      |
| pE1 Clap          | 1      | 1     | 1      | 1      |
| rc0 "A Saturator" | **0**  | **0** | 1      | 1      |
| rc1 "B Reverb"    | 1      | 1     | 1      | 1      |

Return chains carry sends too (a return chain can feed the other returns), all
left enabled here.

Device parameters:

| Parameter            | `is_enabled` |
| -------------------- | ------------ |
| pC1 Simpler `Volume` | **0**        |
| pE1 Simpler `Volume` | 1            |

Why each row exists:

- **pC1** — every chain mixer param disabled at once, but **send B stays
  enabled**: sends are mapped individually, so one chain can have a dead send
  and a live one.
- **pD1** — only volume mapped. Proves a warning must be **per-parameter**, not
  per-chain: pan and sends on this chain still work.
- **pE1** — nothing mapped. The control: writes here must land, with no warning.
- **rc0 / rc1** — same disabled/control pair for a **return chain**. Return
  chain volume and pan are macro-mappable, confirming the disabled case isn't
  specific to regular chains.
- **Simpler `Volume`** — the exposure isn't limited to the chain mixer. A
  macro-mapped _device_ parameter written via `params: [...]` no-ops the same
  way, which is the more common case in factory racks.

---

## Nested Racks

| Shape                              | Path                              |
| ---------------------------------- | --------------------------------- |
| Drum Rack in an Instrument Rack    | `t0/d0/c0/d0`                     |
| Drum Rack in a Drum Rack pad       | `t0/d0/c0/d0/pF1/c0/d0`           |
| Simpler inside the nested rack     | `t0/d0/c0/d0/pF1/c0/d0/pC3/c0/d0` |
| Instrument two Instrument Racks in | `t1/d0/c0/d0/c0/d0`               |

Not baked in, because `ppal-create-device` builds them at runtime: a pad holding
an **empty** rack, a bare Drum Rack on a track, a rack on a chain other than the
first, a Drum Rack two Instrument Racks deep, and Audio Effect Rack nesting.
Macro mappings, macro names, and rack return chains are the only things that
can't be made through the Live API.

Every rack here holds its nested device on **chain 0**, and the committed suites
address it by that path — so don't insert a chain ahead of it.

---

## Drum Pad Sample-Write Policy

Three pads for the write policy's branches that can't take a sample:

| Pad  | Device                | Behavior on a `sample` write                |
| ---- | --------------------- | ------------------------------------------- |
| pAb1 | Drum Sampler          | warn + skip; `force: true` swaps in Simpler |
| pA1  | Sampler               | warn + skip; `force: true` swaps in Simpler |
| pBb1 | Simpler, multi-sample | warn + skip; `force: true` swaps in Simpler |

The rule is uniform: the write targets the pad's **instrument**, and `force`
replaces it whenever the Live API can't set its sample. Only a single-sample
Simpler is written in place.

**Building pBb1:** drop a Simpler on the pad, then drag a second sample onto it
(or use Simpler's multi-sample zone editor) so `multi_sample_mode` reads 1. The
Live API has no way to set that mode, which is why it's baked in.

**Sampler is Live Suite only.** The e2e runner already requires Suite.

---

## Samples

```
e2e/live-sets/samples/drums/
├── synth-kick.wav
├── synth-snare.wav
├── synth-clap.wav
├── synth-hat-open.wav
├── synth-tom-low.wav
└── synth-tom-high.wav
```

Stored in the repo and referenced project-relative, so the Set opens on any
machine. Apart from Saturator, Reverb, and the master chain, it uses no Live
content beyond built-in devices — no Factory Packs required.

---

## Test Coverage Matrix

| Feature                                  | Location                |
| ---------------------------------------- | ----------------------- |
| Disabled chain gain                      | pC1, pD1                |
| Disabled chain pan                       | pC1                     |
| Disabled chain send                      | pC1 send A              |
| Enabled send on a partly-disabled chain  | pC1 send B              |
| Per-parameter (not per-chain) disabling  | pD1                     |
| Fully enabled control chain              | pE1                     |
| Disabled return chain gain/pan           | rc0                     |
| Enabled control return chain             | rc1                     |
| Disabled device parameter                | pC1 Simpler `Volume`    |
| Enabled control device parameter         | pE1 Simpler `Volume`    |
| Rack return chains                       | `t0/d0/c0/d0` rc0, rc1  |
| Drum Rack in Instrument Rack             | `t0/d0/c0/d0`           |
| Drum Rack in Drum Rack pad               | `t0/d0/c0/d0/pF1/c0/d0` |
| Non-default chain trim                   | pF1 chain (-6 dB)       |
| Unmapped rack (control)                  | "Outer", "Sub Kit"      |
| Two macros renamed the same              | "Outer" Macro 1 / 2     |
| Drum Sampler on a pad                    | pAb1                    |
| Sampler on a pad                         | pA1                     |
| Multi-sample Simpler on a pad            | pBb1                    |
| Melodic instrument, two racks deep       | `t1/d0/c0/d0/c0/d0`     |
| Drum-mode serialization                  | `t0/s0` clip            |
| Pitched serialization (must not be drum) | `t1/s0` clip            |

Suites that read this Set — change the fixture and these are what break:

- `e2e/mcp/device/update/ppal-update-device-disabled-params.test.ts`
- `e2e/mcp/device/ppal-read-device-nested-racks.test.ts`
- `e2e/mcp/device/drum/update/ppal-update-device-pad-sample-policy.test.ts`
- `e2e/mcp/device/drum/nested-rack-drum-detection.test.ts` — asserts both clips'
  serializations verbatim, in barbeat and stark, so editing either clip breaks
  it
- `e2e/mcp/device/params/ppal-device-duplicate-macro-name.test.ts` — asserts
  "Outer"'s two `Drive` macros by name
