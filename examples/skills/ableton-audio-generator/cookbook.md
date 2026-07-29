# Cookbook: translating words into DSP

People describe sounds in adjectives. This page is the bridge from those
adjectives to the parameters you actually change. It applies across every target
— "gritty" means much the same thing in a drum voice, a wavetable, and a drone.

## How to use it

Find the closest entry, use it to make a first attempt, then iterate with the
user. When they correct you, the correction is worth more than the table.

Every number here was rendered and listened to, so they are real starting
points, not illustrations. They are still starting points: the right value
depends on the register, the arrangement, and the person.

## Reading the numbers

- **Decay is T60** — the time to fall 60 dB — in milliseconds or seconds. If
  your envelope is the buffer-relative `exp(-k * i / N)` shape the examples use,
  convert with **`k = 6.9 * len / t60`**. A closed hat at `len 0.05, k 22` is a
  16 ms T60.
- **Pitch is Hz, detune is cents, drive is the multiplier inside `tanh`.**
- **"Decimate to SR/n"** means hold every nth sample; **"n-bit"** means quantize
  to `2^(n-1)` levels. The lo-fi pair.

## Timbre

| They say         | Try                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| bright, glassy   | ~24 harmonics at `1/h^0.6` instead of 12 at `1/h`; stretch to `f0*h*sqrt(1+0.0008*h^2)` for glass  |
| dark, warm, dull | cut everything above the 8th harmonic, then lowpass ~1.2 kHz                                       |
| gritty, dirty    | `tanh(x*6)`, quantize to 6-bit, decimate to SR/4                                                   |
| metallic         | inharmonic ratios 1 : 2.76 : 5.4 : 8.93 : 13.34; ring-mod at 1.41x f0; decay upper partials faster |
| hollow, woody    | odd harmonics only, plus a resonant band at ~600 Hz, Q3                                            |
| thin             | drop the fundamental and 2nd harmonic; highpass ~600 Hz                                            |
| fat, thick       | three layers at -7 / 0 / +7 cents, a sub-octave under them, `tanh(x*1.6)`                          |

## Envelope and time

| They say           | Try                                                                          |
| ------------------ | ---------------------------------------------------------------------------- |
| snappy, tight      | T60 ~60 ms, down from a ~400 ms default; trim the buffer to match            |
| boomy, long        | T60 ~1.4 s, fundamental down to ~48 Hz, pitch sweep 150 -> 48 Hz over 130 ms |
| clicky             | 3 ms of noise at the attack, ~0.5 the amplitude of the body                  |
| soft, round        | raised-cosine attack of 60 ms instead of 2 ms                                |
| pumping, breathing | duck on each beat, ~75% depth, exponential recovery                          |

## Motion

Motion is spectral, not level. An "evolving" drone can hold a steady meter and
still be alive, because the partials move against each other rather than
together.

| They say        | Try                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------ |
| evolving, alive | one LFO per partial, 0.15-1.2 Hz, rates spaced so no two share a period. Needs 10 s+ of material |
| shimmering      | 2.5-6 Hz, +/-6 cents and +/-25% amplitude, on partials 2 and up                                  |
| wide            | give each channel its own phases and its own noise                                               |
| static, sterile | (a complaint) add drift to anything currently constant                                           |

**Keep shimmer under ~6 Hz.** Between roughly 6 and 13 Hz the ear tracks the
individual cycles and it reads as wobble; faster still (16 Hz+) reads as a
different effect again, not as more shimmer.

**Width is worth doing properly.** A delayed copy in one channel sounds
dramatically wider than genuine decorrelation — and then comb-filters itself
apart when summed to mono (measured: notches 23 dB deep, against 4 dB for a
decorrelated pair). The fake is more impressive right up until it isn't.

## Instrument families

| They want | Try                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| pluck     | Karplus-Strong: a noise burst into a delay of `SR/f`, one-zero lowpass in the feedback, gain 0.996                |
| pad       | detuned partials, ~400 ms attack, slow filter motion                                                              |
| bass      | band-limited saw, cutoff envelope 2.2 kHz -> 90 Hz over 180 ms at Q4, `tanh(x*1.8)`, T60 ~700 ms                  |
| keys      | FM at ratio 1:1, index 3.4 decaying over 120 ms, T60 ~1.5 s                                                       |
| mallet    | partials at 1 : 3.95 : 9.8, T60 550 / 220 / 100 ms, a 4 ms knock, lowpass 5 kHz                                   |
| bell      | hum an octave below the strike; 0.5 : 1 : 1.19 : 1.5 : 2 : 2.5 : 2.66 : 3.01 : 4.1, T60 3.6 s falling per partial |

Percussion lives in `targets/simpler-sample.md`, which covers the body /
transient / noise layering these all rely on.

## Genre and era

Where verbal requests cluster hardest. Most of these are a kick, because that is
where the genres differ most audibly; the rest name their signature voice.

| They say       | Try                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------- |
| 808            | kick: 50 Hz, 120 -> 50 Hz over 45 ms, T60 900 ms, `tanh(x*1.6)`, no click                       |
| 909            | kick: 60 Hz, 220 -> 60 Hz over 22 ms, T60 280 ms, click at 0.5                                  |
| house          | kick: 55 Hz, 180 -> 55 Hz over 20 ms, T60 350 ms, click 0.2, `tanh(x*2.2)`                      |
| techno         | kick: 48 Hz, T60 420 ms, `tanh(x*8)`, lowpass 7 kHz — the drive is the genre                    |
| trap           | 808 sub: 45 Hz, 95 -> 45 Hz over 70 ms, T60 1.6 s, `tanh(x*3.2)`; tune it to the key            |
| boom-bap       | kick: T60 250 ms, lowpass 5 kHz, 12-bit, decimate SR/3, quiet noise floor                       |
| jungle, breaks | snare: 190 + 305 Hz body under highpassed noise, lowpass 9 kHz, 12-bit                          |
| drum'n'bass    | Reese bass: 3 saws at -9 / 0 / +11 cents, resonant lowpass Q3.5 sweeping 220 -> 1120 Hz         |
| dubstep        | wobble bass: 2 saws +/-6 cents, resonant lowpass Q7, LFO locked to 8ths, 120 -> 2700 Hz         |
| dub            | as dubstep's bass but static and darker; the character is the delay and spring reverb around it |
| ambient        | detuned saw triad, 400 ms attack, lowpass Q2 drifting 900 -> 2400 Hz at 0.16 Hz, stereo         |
| industrial     | inharmonic 1 : 2.41 : 3.83 : 5.77 : 8.19 : 11.4, `tanh(x*4)`, noise transient, highpass 200 Hz  |
| IDM, glitch    | stutter-gate at irregular 15-240 ms slices with occasional repeat-jumps, then 7-bit             |
| lo-fi, dusty   | 0.4% wow at 0.7 Hz, lowpass 4.2 kHz, 10-bit, decimate SR/4, audible noise floor                 |

## Diagnosing complaints

The most common feedback and the least specific. First thing to check, in each
case:

| They say              | Usually means                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| cheap                 | one oscillator doing everything — layer a body, a transient and a noise part with separate envelopes                      |
| muddy                 | too much 150-400 Hz stacked across layers; highpass everything except the bass part                                       |
| fake                  | too regular — vary the noise, detune and decay per hit instead of repeating one render                                    |
| harsh                 | a peak around 2-5 kHz, or aliasing; check the harmonic cap before reaching for a filter                                   |
| boxy                  | a resonance around 300-600 Hz                                                                                             |
| thin (as a complaint) | missing fundamental or sub — the inverse of the "thin" recipe above                                                       |
| buzzy                 | too many high harmonics, or a naive hard-edged shape aliasing                                                             |
| lifeless, static      | nothing is drifting — see Motion                                                                                          |
| small                 | mono, or width that came from a delay and collapsed                                                                       |
| squashed, no punch    | too much drive: saturation flattens crest factor (8.2 -> 2.5 in testing). Back the drive off before touching the envelope |

## Where a word changes meaning per target

Most adjectives travel. These do not — check the target doc before applying
them.

| Word        | Depends how                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| wide        | `audio-clip` / `reverb-ir`: decorrelate the channels. `wavetable`: meaningless, it is one mono cycle. `simpler-sample` / `drum-kit`: the format is mono — deliver width in Live, not in the file |
| soft attack | `audio-clip`: fade in. `simpler-sample` / `drum-kit`: never — the transient is the identity. `wavetable`: never `declick` at all                                                                 |
| bright      | `wavetable`: bounded by the harmonic cap, not by a filter. Past Nyquist at the playing pitch it folds back as inharmonic garbage                                                                 |
| evolving    | `audio-clip`: over seconds. `wavetable`: across frames — it is the position sweep, and time doesn't enter into it                                                                                |
| long        | `audio-clip`: free. `simpler-sample`: trailing silence is dead weight in every pad that loads it                                                                                                 |

## Not covered

Tried and dropped rather than overlooked, so they don't get re-added on
assumption:

- **airy** — a quiet highpassed noise layer is audible in measurement and
  underwhelming in practice, on both percussive and sustained material.
- **synthwave** — the recipe that was supposed to be synthwave was judged to be
  a good ambient pad, and is filed as such above.
