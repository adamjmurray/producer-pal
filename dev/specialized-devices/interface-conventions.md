# Interface conventions

These cross-cutting decisions apply to multiple specialized devices. Per-device
sections in [instruments.md](instruments.md) and
[audio-effects.md](audio-effects.md) reference these patterns rather than
redocumenting them.

## Wire format

All specialized-device pseudo-params flow through existing tool surfaces. Across
all this work the new surfaces are limited to: **one new top-level write arg**
(`actions` on `update-device`), **two new include values** (`"options"` and
`"actions"` on `read-device`), and **one new top-level read output field**
(`modulations` on `read-device`, for Wavetable's mod matrix only):

| Surface                                                                                         | Where it goes                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writable pseudo-params (e.g. `globalMode`, `voices`, `irCategory`, `sample`, `mod1Source`)      | Inside `update-device`'s existing `params` arg as `name=value` lines                                                                                                                                                 |
| Read-only pseudo-params (e.g. `multiSampleMode`, `estimatedPlaybackLength`)                     | Inside `read-device`'s existing `params` output field                                                                                                                                                                |
| Actions (e.g. `reverse`, `warpAs(4.0)`, `setModulation(...)`)                                   | **New top-level `actions: string[]` arg** on `update-device`                                                                                                                                                         |
| Action discovery (what actions a device supports)                                               | New value `"actions"` for `read-device`'s existing `include` arg (`{name, signature, description}` per action)                                                                                                       |
| Dynamic per-state/per-install catalogs (e.g. `irFileList`, `sidechainSourceTrackIds`)           | New value `"options"` for `read-device`'s existing `include` arg                                                                                                                                                     |
| Structured non-param state (Wavetable's mod-matrix cells — inherently 2D, name-collision-prone) | **New top-level `modulations` output field** on `read-device` (Wavetable only; opt-in via `include: ["options"]`, alongside the dynamic catalogs, since the mod-matrix scan is expensive; omitted for other devices) |

This keeps the tool schema flat — no per-device arg explosion — and gives the
LLM one consistent surface for setting both DeviceParameters and class-level
pseudo-params.

### Actions syntax

Function-call form: bare name for no-args, or `name(arg1, arg2, ...)` for args.
String args should be quoted where needed.

```
actions: [
  "reverse",
  "warpAs(4.0)",
  "setModulation('Osc 1 Pos', 'Env 2', 0.5)",
  "clearModulation('Osc 1 Pos', 'LFO 1')",
  "addModulationTarget('Filter 1 Freq')"
]
```

Parser scope: bare names; positional args; literal types are int, float, and
quoted strings (single or double quotes — pick one and stick with it; commas
inside quotes are respected; no nested function calls; no implicit type coercion
beyond standard JS literal parsing).

**Action discovery (`include: ["actions"]`).** The actions a device supports are
discoverable at runtime via `ppal-read-device include: ["actions"]`, which
returns `{ name, signature, description }` for each action on the resolved
device's class (empty/omitted for the 7 action-less specialized classes and all
generic devices). The metadata is co-located with each handler in its
`SpecializedDeviceSpec`
(`actions: Record<string, { handler, signature, description }>`), so the docs
can't drift from the implementation. This lets the skills prompt point at the
include rather than enumerate every action signature, recovering context-window
budget. Kept in small-model mode — it's discovery, and only fires when
explicitly requested.

### Structured read output beyond `params`

When state is inherently multi-dimensional or would suffer name collisions in a
flat `params` map, surface it as a separate top-level output field on
`read-device`. Currently only Wavetable's mod matrix uses this pattern:

- **`modulations`** (Wavetable) — array of `{ target, source, amount }` objects.
  The target is a parameter name (matches the matrix's internal keying), the
  source is a canonical source name. Always on for Wavetable; omitted or empty
  `[]` for other devices.

Reserved for cases where (a) the data is genuinely structured and (b) flattening
would either invent ugly composite keys (`mod[Osc 1 Pos][Env 2]`) or collide
with regular DeviceParameter names. Don't reach for this when `params` already
handles the shape.

### Mode-gated inactive params (`inactiveWhen`)

`read-device` reports each param's `state` straight from Live's
`DeviceParameter.state` (active / inactive / disabled), which already greys out
section params like an off oscillator. But Live is _inconsistent_: when an LFO
exposes both a free-running Hz `Rate` and a tempo-synced note-value `S. Rate`,
it leaves **both** active regardless of the sync mode, so the LLM can't tell
which one is in effect. (Real failure mode: an AI reported a synced LFO's stale
`6.0 Hz` Rate and couldn't find the synced rate.)

A spec can declare `inactiveWhen` rules to fix this: each rule names a
_controller_ param and, per controller value, the sibling params that don't
apply in that mode. After the params are read, `applySpecializedInactiveStates`
(in `specialized-device-registry.ts`) sets `state: "inactive"` on them — reusing
the values already read (no extra Live API calls), only when reading param
values, and never overriding a state Live already set. A controller filtered out
by a param search just skips its rule. Use the
`exclusiveModes(controller, activeByValue)` builder (in
`specialized-device-inactive.ts`) for the common "one mode keeps one param
active, the rest inactive" shape. Several controller values may map to the same
active param (the builder dedupes the group) — e.g. Auto Filter's
Synced/Triplet/Dotted modes all drive the one note-value selector.

Current rules:

- **Wavetable** LFO 1 / LFO 2 — `Sync` → Free=Hz `Rate` / Tempo=`S. Rate`.
- **Drift** LFO / Cyclic Envelope — `Time Mode` Freq / Time / Ratio / Sync (four
  rate params, one active per mode).
- **Auto Filter** — `LFO T Mode`: Rate=Hz `LFO Freq`, Time=ms `LFO Time`,
  Synced/Triplet/Dotted=note-value `LFO Rate`, Sixteenth=count-of-16ths
  `LFO 16th`.
- **Auto Pan-Tremolo** — `Time Mode`: same shape as Auto Filter (`Frequency` /
  `Time` / `Rate` / `16th`; the synced-count mode is labelled `16th`, not
  `Sixteenth`).
- **Phaser-Flanger** — two independent boolean sections: `Mod Sync` (Off=Hz
  `Mod Freq` / On=note-value `Mod Rate`) and `Mod Sync 2` (`Mod Freq 2` /
  `Mod Rate 2`).

For the audio FX above, the synced `*Rate` param is a quantized note-value
selector (raw `0`–`21`, `str_for_value` → `"1/4"` etc.) — its `value`/min/max
read oddly out of context, which is exactly why surfacing `state: "inactive"` in
the wrong modes matters.

Only patch devices Live leaves unmarked — verify against a running Live first
(e.g. **Echo** already greys out its own delay/mod sync params, so it needs no
rule).

## The `options` include (opt-in discoverability)

`read-device` supports an opt-in `include: ["options"]` parameter that surfaces
per-device "what choices are available" data. It returns two kinds of catalog:

1. **`paramOptions`** — the valid values for each _writable_ pseudo-param, keyed
   by param name. An array lists discrete choices (enum labels or a fixed
   numeric set); a string states a constraint (e.g. `"0-12"`). This is the
   canonical, machine-readable source of accepted values, so the LLM can
   discover them without first attempting a failed write. It is built
   automatically from each `PseudoParam`'s `options` field (declared with the
   _same constant_ passed to `read`/`write`, so the catalog can't drift from
   validation — see `collectParamOptions` in `specialized-device-registry.ts`).
   Booleans, free-form values (sample paths, gains, IR shaping times), read-only
   params, and dynamic-choice params (those in the catalogs below) are omitted.
2. **Dynamic catalogs** — choices that vary per Live Set, per Live install, or
   per current device state. These come from each spec's `readOptions`.

**Default OFF.** Without the include, `read-device` returns only current state,
keeping reads compact. The LLM opts in when it needs to know what a param
accepts, or when actively choosing from a runtime catalog (an IR file, a
wavetable from the loaded category, a valid sidechain source track).

**Per-device dynamic catalogs** (these are _in addition to_ `paramOptions`; only
the devices listed contribute dynamic catalogs — every specialized device with
writable enum/range params contributes `paramOptions`):

- **Compressor:** `sidechainSourceTrackIds` — trackIds that are valid sidechain
  sources for the current Live Set (excludes tracks with no audio-bearing
  devices). Dynamic per set. (`sidechainChannels` for the current source.)
- **Hybrid Reverb:** `irCategoryList`, `irFileList` — IR categories and the
  files in the currently-selected category. Dynamic per Live install and per
  category.
- **Wavetable:** `osc1Wavetables`, `osc2Wavetables` — wavetables in each
  oscillator's currently-selected category (dynamic per category × per Live
  install); `modulatableParameters` — long list (~30 DeviceParameter names where
  `is_parameter_modulatable=1`); `modulationSources` — the hard-coded canonical
  13 mod-matrix source names (for the `setModulation` action; no LOM property
  exposes them).

**Stable enums ARE surfaced — via `paramOptions`.** Previously stable enums
lived only in Zod descriptions and skill text and were deliberately kept out of
`options`. That is no longer the case: every writable pseudo-param with a fixed
value space (Drift's source/target slots, `voiceMode`, `voiceCount`; EQ Eight
`globalMode`; Roar `routingMode`; Spectral Resonator `modMode`/`pitchMode`/
`polyphony`; Wavetable `filterRouting`/`unisonMode`/…) reports its accepted
values under `paramOptions`. The skill now points to `options` for accepted
values and carries only names + non-obvious semantics, keeping a few short
high-frequency hints inline (`voiceMode`, `playbackMode`, `globalMode`) to avoid
a round-trip on common operations.

**Why opt-in:** Most reads inspect current state, not catalogs. The dynamic ones
(especially `modulatableParameters` and per-category wavetable lists) can be
20-30 entries each — multiplying across every device on every read would bloat
the happy path. Opt-in keeps the default read compact and establishes a clear
browse pattern: "to see what's available right now, ask."

**Response shape:** when requested, catalog data comes back in a separate
`options` field — not mixed into `params`. Catalogs aren't param values; they're
metadata about valid choices:

```json
{
  "id": "227",
  "type": "instrument: Wavetable",
  "options": {
    "paramOptions": {
      "filterRouting": ["serial", "parallel", "split"],
      "unisonVoiceCount": "2-8"
    },
    "oscWavetableCategories": [...],
    "modulationSources": [...]
  }
}
```

## Documentation strategy

Each kind of "what to tell the LLM" lives in a specific layer:

| Information                                                                                                                                                       | Where it lives                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid values for a writable pseudo-param (enum labels, numeric sets, ranges)                                                                                      | `options.paramOptions`, built from each `PseudoParam.options` (the same constant passed to read/write, so it can't drift)                                     |
| What an enum value _means_ / when to reach for it (M/S processing, sidechain use cases, A/B chain mapping)                                                        | Producer Pal Skills via `ppal-connect`; a few short, high-frequency value hints (`voiceMode`, `playbackMode`, `globalMode`) stay inline to avoid a round-trip |
| Dynamic catalogs that vary per Live install / per set / per device state (IR files, current-category wavetables, valid sidechain sources, modulatable parameters) | `options` include dynamic catalogs (see above)                                                                                                                |

### Small model mode

The codebase has first-class support for trimming tool surface in small model
mode via `smallModelModeConfig` (`excludeParams`, `descriptionOverrides`,
`toolDescription` — see dev/Tool-Schemas.md). Guidelines for specialized-device
params:

- **Write tight base descriptions** that work in both normal and small-model
  modes without needing overrides. Aim for ~100-200 chars per parameter.
- **Use `descriptionOverrides`** only when the base description genuinely
  exceeds what's useful for a small model (e.g. many enum values with rich
  semantics).
- **Generally avoid `excludeParams`** for specialized fields — keep the
  capability available; the LLM just gets less inline guidance. The Zod enum
  constraint still prevents invalid values at the schema level.
- **Rich semantic guidance belongs in Producer Pal Skills**, which is already
  trimmed in small model mode — safer than bloating Zod descriptions.

Each device ticket's notes include a reminder to check `smallModelModeConfig`
when implementing.
