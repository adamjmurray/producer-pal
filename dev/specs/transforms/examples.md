# Transform Examples

## Basic Waveforms

```
// Basic envelope
velocity += 20 * cos(1bar);

// Phase-shifted
velocity += 20 * cos(1bar, 0.5);

// Pulse width modulation
velocity += 20 * square(n/2, 0, 0.25);

// Dynamic PWM (pulse width modulated by another waveform)
velocity += 20 * square(n/2, 0, cos(1bar) * 0.25 + 0.5);

// Combined functions
velocity += 20 * cos(4bar) + 10 * rand();

// Unipolar envelope (adds 0 to 40)
velocity += 20 + 20 * cos(2bar);

// Amplitude modulation
velocity += 30 * cos(4bar) * cos(n/4);

// Set absolute velocity value
velocity = 80;
```

## Ramp Function

```
// Velocity ramp from soft to loud over entire clip
velocity += ramp(0, 127);

// Reverse ramp (fade out)
velocity += ramp(127, 0);

// Ramp with arbitrary range
velocity += ramp(64, 100);

// Combine ramp with periodic modulation
velocity += ramp(20, 100) + 10 * rand();
```

## Rand Function

```
// Random velocity humanization (default range: -1 to 1)
velocity += 10 * rand();

// Random pitch variation (0 to 12 semitones)
pitch += round(rand(12));

// Random pitch variation (-6 to 6 semitones)
pitch += round(rand(-6, 6));
```

## Choose Function

```
// Random velocity from a set of values
velocity = choose(60, 80, 100, 120);

// Random chord tones
pitch += choose(0, 3, 7, 12);

// Weighted choice (60 appears 3x more often)
velocity = choose(60, 60, 60, 100);
```

## Curve Function

```
// Exponential fade-in (slow start, fast finish)
velocity += curve(0, 127, 2);

// Logarithmic fade-in (fast start, slow finish)
velocity += curve(0, 127, 0.5);

// Exponential fade-out
velocity += curve(127, 0, 2);

// Linear (same as ramp)
velocity += curve(0, 127, 1);
```

## Math Functions

```
// Round to nearest semitone
pitch += round(12 * rand());

// Ensure minimum velocity
velocity = max(60, note.velocity);

// Quantize velocity to steps of 10
velocity = floor(note.velocity / 10) * 10;

// Absolute pitch distance from C3
velocity = abs(note.pitch - 60) * 2;

// Clamp velocity to range
velocity = clamp(note.velocity, 40, 100);

// Alternating pattern (every other beat)
velocity = 60 + 40 * (floor(note.start) % 2);

// Round velocity up to next multiple of 10
velocity = ceil(note.velocity / 10) * 10;

// Exponential scaling
velocity = pow(note.velocity / 127, 2) * 127;
```

## Pitch Filtering

```
// Single pitch selector (only affects C3 notes)
C3: velocity += 20

// Pitch range selector (affects C3, C#3, D3, ... up to C5)
C3-C5: velocity += 20

// Accent bass notes (C1 through C2)
C1-C2: velocity += 30

// Different modulation for high notes
C5-C7: velocity = 100

// Combine pitch range with time range
C3-C5 1|1-2|1: velocity += 10

// Multiple pitch ranges with different modulations
C1-C2: velocity += 30
C3-C5: velocity += 10
C6-C7: velocity = 100
```

## Note Property Variables

```
// Scale velocity based on pitch (higher notes louder)
velocity = note.pitch / 127 * 100

// Self-reference: halve existing velocity
velocity = note.velocity / 2

// Delay higher notes progressively
C4-C6: timing += note.pitch * 0.01

// Reduce duration based on probability
duration = note.duration * note.probability

// Combine variables with waveforms
velocity = note.velocity * cos(n/4)

// Use note properties in expressions
velocity = (note.pitch + note.deviation) / 2
```

## Variable Periods

```
// Use note duration as waveform period
velocity += cos(note.duration);

// Expression as period (2x note duration)
velocity += tri(note.duration * 2);

// Ramp based on note velocity
velocity = ramp(0, note.velocity);

// Phase offset from note probability
velocity += cos(n/4, note.probability);
```

## Multi-Parameter

```
transforms: `velocity += 20 * cos(1bar) + 10 * rand()
timing += 0.03 * rand()
probability += 0.2 * cos(n/2)`;

// Using variables
transforms: `velocity = note.pitch
duration = note.duration * note.probability
timing += note.start / 100`;
```

## Pitch Transforms (MIDI)

```
// Transpose up an octave
pitch += 12;

// Set all notes to middle C
pitch = 60;

// Random pitch variation (±6 semitones)
pitch += round(12 * rand());

// Octave based on velocity (louder = higher)
pitch += floor(note.velocity / 32) * 12;

// Quantize to pentatonic-ish (every 2 semitones)
pitch = floor(note.pitch / 2) * 2;
```

## Context Variables

```
// Sequential crescendo using note index
velocity = 60 + note.index * 5;

// Stacked fifths across clips in multi-clip operation
pitch += clip.index * 7;

// Scale gain by arrangement position
gain = ramp(-24, 0) * (clip.position/32);

// Position within the bar drives velocity (the bar literal composes in arithmetic)
velocity += (20 * (note.start % 1bar)) / 1bar;
```

## Audio Clip Transforms

```
// Set gain to -6 dB
gain = -6;

// Add 3 dB
gain += 3;

// Self-reference: reduce by 6 dB
gain = audio.gain - 6;

// Clamps to valid range (-70 to +24 dB)
gain = -100; // clamps to -70
gain = 50; // clamps to +24

// Pitch shift up 5 semitones
pitchShift = 5;

// Transpose down an octave
pitchShift = -12;

// Self-reference: shift relative to current
pitchShift = audio.pitchShift + 7;
```

Audio transforms apply to the whole clip, so any note-level scoping is dropped
with a relayed warning rather than silently: a pitch selector, a time selector,
a `where()` predicate, MIDI parameters, and note-count operations all warn and
are ignored on audio clips.
