# Cookbook: translating words into DSP

**Status: sketch.** The entries below are a shape to fill in, not a finished
reference. Treat them as starting hypotheses and trust your ears over this file.

People describe sounds in adjectives. This page is the bridge from those
adjectives to the parameters you actually change. It applies across every target
— "gritty" means much the same thing in a drum voice, a wavetable, and a drone.

## How to use it

Find the closest entry, use it to make a first attempt, then iterate with the
user. When they correct you, the correction is worth more than the table.

## Timbre

| They say         | Try                                                                     |
| ---------------- | ----------------------------------------------------------------------- |
| bright, glassy   | more high harmonics; less lowpass; a touch of inharmonicity for "glass" |
| dark, warm, dull | lowpass the tail; roll off harmonics above the 8th or so                |
| gritty, dirty    | waveshaping or soft clipping; bit reduction; sample-rate decimation     |
| metallic         | inharmonic partials — ratios that aren't integers; ring modulation      |
| hollow, woody    | odd harmonics only (square-ish); a strong resonant peak                 |
| thin             | highpass; remove the fundamental and keep the upper partials            |
| fat, thick       | detuned layers a few cents apart; sub-octave; slight saturation         |
| airy             | a quiet highpassed noise layer under everything                         |

## Envelope and time

| They say           | Try                                                                     |
| ------------------ | ----------------------------------------------------------------------- |
| snappy, tight      | shorter decay; faster exponential constant; trim the tail               |
| boomy, long        | slower decay; lower fundamental; longer pitch sweep                     |
| clicky             | a very short noise or transient burst at the attack, a few milliseconds |
| soft, round        | slower attack; taper the transient (the one place a fade-in helps)      |
| pumping, breathing | amplitude modulation at a rate tied to the tempo                        |

## Motion

| They say        | Try                                                              |
| --------------- | ---------------------------------------------------------------- |
| evolving, alive | independent LFOs per partial at rates with no common period      |
| shimmering      | fast, small pitch or amplitude modulation on upper partials      |
| wide            | genuine per-channel decorrelation, not a delayed copy            |
| static, sterile | (usually a complaint) — add drift to anything currently constant |

## Genre and era shorthand

**TODO** — the highest-value section and the least written. Sketch entries only:

- **808** — long sine, slow exponential pitch drop, saturation, minimal click
- **909** — shorter decay than an 808, more prominent transient click
- **lo-fi / dusty** — bit reduction, sample-rate decimation, band-limiting, a
  little noise floor
- **boom-bap** — short decays, filtered highs, deliberately narrow
- **trap** — very long 808 sub, tuned to the key, heavy saturation
- Needed: house, techno, jungle/breaks, ambient, industrial, IDM/glitch

## TODO

This file needs research rather than invention, ideally checked by ear against
reference material:

- [ ] Fill in the genre/era section properly — it's where verbal requests
      cluster most.
- [ ] Add concrete parameter ranges, not just directions. "Shorter decay" is
      weaker than a starting number.
- [ ] Cover instrument families beyond percussion: plucks, pads, bass, keys,
      mallets, bells.
- [ ] Cross-reference each entry to the target where it matters most.
- [ ] Note where an adjective means _different_ things per target, if any turn
      out to.
- [ ] Add a short "diagnosing complaints" section — what to change when
      something sounds cheap, muddy, or fake, which is the most common feedback
      and the least specific.
