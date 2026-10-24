# Instruments

Per-device catalog for Live's instruments, part of
[Specialized devices](../README.md). Read only the device you need.

## Specialized instruments

| Part                         | Device                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| [drift.md](drift.md)         | Drift — `DriftDevice` (`class_name: Drift`)                    |
| [meld.md](meld.md)           | Meld — `MeldDevice` (`class_name: InstrumentMeld`)             |
| [simpler.md](simpler.md)     | Simpler — `SimplerDevice` (`class_name: OriginalSimpler`)      |
| [wavetable.md](wavetable.md) | Wavetable — `WavetableDevice` (`class_name: InstrumentVector`) |

## Generic-Device instruments (no specialization)

| Display name        | `class_name`            | Notes                                                             |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| Analog              | `UltraAnalog`           | Everything via parameters.                                        |
| Collision           | `Collision`             | Everything via parameters.                                        |
| Electric            | `LoungeLizard`          | Heritage class name (Applied Acoustics' Lounge Lizard).           |
| External Instrument | `ProxyInstrumentDevice` | Routing only exposed via parameters; no class-level routing dict. |
| Impulse             | `InstrumentImpulse`     | Not a rack — no chains / drum_pads on the device itself.          |
| Operator            | `Operator`              | Flagship synth, but vanilla `Device`.                             |
| Sampler             | `MultiSampler`          | Surprising — Simpler has rich specialization; Sampler has none.   |
| Tension             | `StringStudio`          | Heritage class name (AAS String Studio).                          |
