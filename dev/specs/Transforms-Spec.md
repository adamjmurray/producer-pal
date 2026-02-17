# Transform System Specification

## Function Signatures

```javascript
// Waveforms (sync is an optional trailing keyword, not an expression)
cos(frequency, [phase], [sync]); // cosine wave
tri(frequency, [phase], [sync]); // triangle wave
saw(frequency, [phase], [sync]); // sawtooth wave
square(frequency, [phase], [pulseWidth], [sync]); // square wave
rand([min], [max]); // random value (no args: -1 to 1, 1 arg: 0 to max, 2 args: min to max)
choose(a, b, ...); // random pick from arguments (at least 1)
ramp(start, end, [speed]); // linear ramp over clip/time range
curve(start, end, exponent); // exponential ramp over clip/time range

// Math functions
round(value); // round to nearest integer
floor(value); // round down to integer
ceil(value); // round up to integer
abs(value); // absolute value
clamp(value, min, max); // clamp value to [min, max] range
min(a, b, ...); // minimum of 2+ values
max(a, b, ...); // maximum of 2+ values
pow(base, exponent); // base raised to exponent
```

## Parameters

- **frequency**: Period for waveforms, specified as:
  - **Period notation** (bar:beat duration with `t` suffix):
    - Examples: `1t`, `4t`, `1:0t`, `0:1t`, `0:0.5t`
    - `1t` = 1 beat period
    - `1:0t` = 1 bar period (time signature dependent)
    - `0:1t` = 1 beat period (same as `1t`)
  - **Expressions**: Any numeric expression (including variables)
    - Examples: `note.duration`, `note.start / 4`, `2.5`
    - Treated as period in beats
    - Must be > 0
- **phase**: cycles (0.0-1.0), optional, default 0
  - 0.0 = start of cycle
  - 0.25 = quarter cycle
  - 0.5 = half cycle
  - 0.75 = three-quarter cycle
  - Can use expressions/variables (e.g., `note.probability`)

- **pulseWidth** (square only): cycles (0.0-1.0), optional, default 0.5
  - 0.5 = 50% duty cycle
  - 0.25 = 25% high, 75% low
  - 0.75 = 75% high, 25% low
  - Can use expressions/variables

- **start** (ramp/curve): starting value (can use expressions/variables)
- **end** (ramp/curve): ending value (can use expressions/variables)
- **speed** (ramp only): optional speed multiplier, default 1 (can use
  expressions/variables)
  - 1 = one complete ramp over the clip/time range
  - 2 = two complete ramps
  - 0.5 = half a ramp (reaches midpoint at end)
- **exponent** (curve only): curve shape, must be > 0 (can use
  expressions/variables)
  - > 1 = slow start, fast end (exponential)
  - < 1 = fast start, slow end (logarithmic)
  - = 1 = linear (same as ramp)

## Timeline Sync

By default, waveform phase resets to 0 at each clip's start. The `sync` keyword
makes phase relative to arrangement position 1|1, so waveforms are continuous
across clips on the global timeline.

- **Syntax**: `sync` is an optional trailing keyword (not an expression) on
  cyclical waveform functions: `cos`, `tri`, `saw`, `square`
- **Evaluation**: When `sync` is present,
  `effectivePosition = note.start + clip.position` is used instead of
  `note.start` for phase computation
- **Session clips**: Using `sync` on a session clip skips the assignment with a
  warning (no arrangement position available)
- **Audio clips**: `sync` follows the same rule; since audio evaluates at
  position 0 with no arrangementStart, it will skip with a warning
- **Non-cyclical functions**: `sync` on `ramp`, `curve`, `rand`, `choose`, or
  math functions is a parse error

```javascript
// Clip-relative (default) — phase resets at each clip start
velocity += 20 * cos(4:0t)

// Timeline-synced — continuous phase from 1|1
velocity += 20 * cos(4:0t, sync)

// With phase offset and sync
velocity += 20 * cos(4:0t, 0.25, sync)

// square with all args and sync
velocity += 20 * square(2t, 0, 0.75, sync)
```

## Waveform Behavior

**Period-based waveforms** (cos, tri, saw, square) at phase 0 start at peak
(1.0) and descend:

- **cos(1t, 0)**: starts at 1.0, descends to -1.0, returns to 1.0
- **tri(1t, 0)**: starts at 1.0, descends linearly to -1.0, returns to 1.0
- **saw(1t, 0)**: starts at 1.0, descends linearly to -1.0, jumps back to 1.0
- **square(1t, 0)**: starts high (1.0) for first half, low (-1.0) for second
  half
- **rand()**: random value between -1.0 and 1.0 per note (or rand(max) for 0 to
  max, or rand(min, max) for min to max)
- **choose(a, b, ...)**: randomly selects one of the provided values per note

**Time range-based waveforms** ramp over the clip/time range duration:

- **ramp(start, end)**: linearly interpolates from start to end
  - At the beginning of the clip/range: outputs start value
  - At the end of the clip/range: wraps back to start (phase 1.0 % 1.0 = 0)
  - Example: ramp(0, 127) in a 4-bar clip goes 0→127 over 4 bars
  - With speed: ramp(0, 127, 2) completes two full 0→127 cycles

- **curve(start, end, exponent)**: exponentially interpolates from start to end
  - exponent > 1: slow start, fast end (exponential growth)
  - exponent < 1: fast start, slow end (logarithmic shape)
  - exponent = 1: linear (same as ramp)
  - Example: curve(0, 127, 2) in a 4-bar clip goes 0→127 with exponential shape
  - Example: curve(0, 127, 0.5) goes 0→127 with logarithmic shape

## Transform Syntax

- **Format**: `[pitchRange] [timeRange] parameter operator expression` (one per
  line in `transforms` string)
- **Parameters**:
  - MIDI clips: velocity, timing, duration, probability, deviation, pitch
  - Audio clips: gain, pitchShift
- **Assignment Operators**:
  - `+=` Add to the value (additive modulation)
  - `-=` Subtract from the value (shorthand for `+= -(expression)`)
  - `*=` Multiply the current value (e.g. `velocity *= 0.5` halves velocity)
  - `/=` Divide the current value (e.g. `duration /= 2` halves duration)
  - `=` Set/replace the value (absolute modulation)
  - Note: `*=` and `/=` desugar to `= currentValue * expr` /
    `= currentValue / expr`. For `timing *=`, the current value is the absolute
    note position (`note.start`), so `timing *= 0.5` compresses all notes toward
    bar 1.
- **Pitch selectors** (optional): Filter by MIDI pitch or note name
  - Single pitch: `C3 velocity += 10`
  - Pitch range: `C3-C5 velocity += 10` (applies to all notes from C3 to C5
    inclusive)
- **Time range selectors** (optional): Filter by bar|beat range (e.g.,
  `1|1-2|1 velocity += 10`)
- **Range clamping**: Applied after modulation:
  - velocity: 1-127
  - timing: unclamped (can shift notes before/after original position)
  - probability: 0.0-1.0
  - duration: 0.001 minimum
  - deviation: -127 to 127
  - pitch: 0-127 (rounded to integer)
  - gain: -70 to 24 dB
  - pitchShift: -48 to 48 semitones

## Units and Time Signatures

All transform expressions evaluate in **musical beats**, where 1 beat equals the
time signature denominator note value:

- **4/4 time**: 1 musical beat = 1 quarter note
- **3/4 time**: 1 musical beat = 1 quarter note
- **6/8 time**: 1 musical beat = 1 eighth note
- **2/2 time**: 1 musical beat = 1 half note

This ensures that `timing += 1` always adds one beat in the current time
signature, and period notation like `1t` behaves consistently across different
time signatures.

### Examples by Time Signature

**In 4/4 time**:

- `timing += 1` shifts by 1 quarter note
- `duration = 2` sets to 2 quarter notes
- `cos(1t)` completes one cycle per quarter note

**In 6/8 time**:

- `timing += 1` shifts by 1 eighth note
- `duration = 6` sets to 6 eighth notes (1 bar)
- `cos(1t)` completes one cycle per eighth note
- `cos(1:0t)` completes one cycle per bar (6 eighth notes)

**In 2/2 time**:

- `timing += 1` shifts by 1 half note
- `duration = 2` sets to 2 half notes (1 bar)
- `cos(1t)` completes one cycle per half note

### Note Property Units

All note properties are exposed in musical beats:

- `note.start` - Start time in musical beats
- `note.duration` - Duration in musical beats
- `note.pitch`, `note.velocity` - Natural units (0-127)
- `note.probability` - Natural units (0-1)
- `note.deviation` - Natural units (-127 to 127)

### Internal Representation

Ableton Live stores times and durations as quarter notes (Ableton beats).
Producer Pal automatically converts between musical beats (used in transforms)
and Ableton beats (stored in Live).

## Variables

### Note Properties (MIDI clips)

Access note properties in expressions using the `note.` prefix:

- `note.pitch` - MIDI pitch (0-127)
- `note.start` - Start time in musical beats (absolute, from clip start)
- `note.velocity` - Current velocity value (1-127)
- `note.deviation` - Velocity deviation (-127 to 127)
- `note.duration` - Duration in beats
- `note.probability` - Probability (0.0-1.0)

### Audio Properties (audio clips)

Access audio clip properties in expressions using the `audio.` prefix:

- `audio.gain` - Current gain in dB (-70 to 24)
- `audio.pitchShift` - Current pitch shift in semitones (-48 to 48)

### Context Variables (MIDI and audio clips)

Access clip and bar context in expressions:

- `note.index` - 0-based order of note in clip (MIDI only)
- `clip.duration` - Clip length in musical beats
- `clip.index` - 0-based clip order in multi-clip operations
- `clip.position` - Arrangement position in musical beats (arrangement clips
  only; session clips skip the assignment with a warning)
- `clip.barDuration` - Beats per bar from clip time signature (e.g., 4 in 4/4, 3
  in 3/4, 6 in 6/8)

Variables can be used anywhere in expressions: arithmetic, function arguments,
waveform periods, etc.

**Note:** Variables from the wrong context will cause an error (e.g., using
`note.velocity` in an audio clip transform or `audio.gain` in a MIDI clip
transform).

## Operators

Functions can be combined using standard arithmetic operators:

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/` (division by zero yields 0, not an error)
- Modulo: `%` (uses wraparound behavior for negative numbers, modulo by zero
  yields 0)

Parentheses for grouping: `(expression)`

## Examples

### Basic Waveforms

```javascript
// Basic envelope
velocity += 20 * cos(1:0t)

// Phase-shifted
velocity += 20 * cos(1:0t, 0.5)

// Pulse width modulation
velocity += 20 * square(2t, 0, 0.25)

// Dynamic PWM (pulse width modulated by another waveform)
velocity += 20 * square(2t, 0, cos(1:0t) * 0.25 + 0.5)

// Combined functions
velocity += 20 * cos(4:0t) + 10 * rand()

// Swing timing (works consistently across all time signatures)
timing += 0.05 * (cos(1t) - 1)
// In 4/4: shifts by up to 0.05 quarter notes
// In 6/8: shifts by up to 0.05 eighth notes

// Unipolar envelope (adds 0 to 40)
velocity += 20 + 20 * cos(2:0t)

// Amplitude modulation
velocity += 30 * cos(4:0t) * cos(1t)

// Set absolute velocity value
velocity = 80
```

### Ramp Function

```javascript
// Velocity ramp from soft to loud over entire clip
velocity += ramp(0, 127);

// Reverse ramp (fade out)
velocity += ramp(127, 0);

// Ramp with arbitrary range
velocity += ramp(64, 100);

// Two complete ramps over clip duration
velocity += ramp(0, 127, 2);

// Combine ramp with periodic modulation
velocity += ramp(20, 100) + 10 * rand();
```

### Rand Function

```javascript
// Random velocity humanization (default range: -1 to 1)
velocity += 10 * rand();

// Random pitch variation (0 to 12 semitones)
pitch += round(rand(12));

// Random pitch variation (-6 to 6 semitones)
pitch += round(rand(-6, 6));
```

### Choose Function

```javascript
// Random velocity from a set of values
velocity = choose(60, 80, 100, 120);

// Random chord tones
pitch += choose(0, 3, 7, 12);

// Weighted choice (60 appears 3x more often)
velocity = choose(60, 60, 60, 100);
```

### Curve Function

```javascript
// Exponential fade-in (slow start, fast finish)
velocity += curve(0, 127, 2);

// Logarithmic fade-in (fast start, slow finish)
velocity += curve(0, 127, 0.5);

// Exponential fade-out
velocity += curve(127, 0, 2);

// Linear (same as ramp)
velocity += curve(0, 127, 1);
```

### Math Functions

```javascript
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

### Pitch Filtering

```javascript
// Single pitch selector (only affects C3 notes)
C3 velocity += 20

// Pitch range selector (affects C3, C#3, D3, ... up to C5)
C3-C5 velocity += 20

// Accent bass notes (C1 through C2)
C1-C2 velocity += 30

// Different modulation for high notes
C5-C7 velocity = 100

// Combine pitch range with time range
C3-C5 1|1-2|1 velocity += 10

// Multiple pitch ranges with different modulations
C1-C2 velocity += 30
C3-C5 velocity += 10
C6-C7 velocity = 100
```

### Note Property Variables

```javascript
// Scale velocity based on pitch (higher notes louder)
velocity = note.pitch / 127 * 100

// Self-reference: halve existing velocity
velocity = note.velocity / 2

// Delay higher notes progressively
C4-C6 timing += note.pitch * 0.01

// Reduce duration based on probability
duration = note.duration * note.probability

// Combine variables with waveforms
velocity = note.velocity * cos(1t)

// Use note properties in expressions
velocity = (note.pitch + note.deviation) / 2
```

### Variable Periods

```javascript
// Use note duration as waveform period
velocity += cos(note.duration)

// Expression as period (2x note duration)
velocity += tri(note.duration * 2)

// Ramp based on note velocity
velocity = ramp(0, note.velocity)

// Phase offset from note probability
velocity += cos(1t, note.probability)
```

### Multi-Parameter

```javascript
transforms: `velocity += 20 * cos(1:0t) + 10 * rand()
timing += 0.03 * rand()
probability += 0.2 * cos(0:2t)`;

// Using variables
transforms: `velocity = note.pitch
duration = note.duration * note.probability
timing += note.start / 100`;
```

### Pitch Transforms (MIDI)

```javascript
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

### Context Variables

```javascript
// Sequential crescendo using note index
velocity = 60 + note.index * 5;

// Stacked fifths across clips in multi-clip operation
pitch += clip.index * 7;

// Scale gain by arrangement position
gain = ramp(-24, 0) * (clip.position / 32);

// Use bar duration for rhythmic patterns
velocity += (20 * (note.start % clip.barDuration)) / clip.barDuration;
```

### Audio Clip Transforms

```javascript
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
