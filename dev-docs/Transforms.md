# Transform System Specification

## Function Signatures

```javascript
// Waveforms
cos(frequency, [phase]); // cosine wave
tri(frequency, [phase]); // triangle wave
saw(frequency, [phase]); // sawtooth wave
square(frequency, [phase], [pulseWidth]); // square wave
noise(); // random per note
ramp(start, end, [speed]); // linear ramp over clip/time range

// Math functions
round(value); // round to nearest integer
floor(value); // round down to integer
abs(value); // absolute value
min(a, b, ...); // minimum of 2+ values
max(a, b, ...); // maximum of 2+ values
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

- **start** (ramp only): starting value for the ramp (can use
  expressions/variables)
- **end** (ramp only): ending value for the ramp (can use expressions/variables)
- **speed** (ramp only): optional speed multiplier, default 1 (can use
  expressions/variables)
  - 1 = one complete ramp over the clip/time range
  - 2 = two complete ramps
  - 0.5 = half a ramp (reaches midpoint at end)

## Waveform Behavior

**Period-based waveforms** (cos, tri, saw, square) at phase 0 start at peak
(1.0) and descend:

- **cos(1t, 0)**: starts at 1.0, descends to -1.0, returns to 1.0
- **tri(1t, 0)**: starts at 1.0, descends linearly to -1.0, returns to 1.0
- **saw(1t, 0)**: starts at 1.0, descends linearly to -1.0, jumps back to 1.0
- **square(1t, 0)**: starts high (1.0) for first half, low (-1.0) for second
  half
- **noise()**: random value between -1.0 and 1.0 per note

**Time range-based waveforms** ramp over the clip/time range duration:

- **ramp(start, end)**: linearly interpolates from start to end
  - At the beginning of the clip/range: outputs start value
  - At the end of the clip/range: wraps back to start (phase 1.0 % 1.0 = 0)
  - Example: ramp(0, 127) in a 4-bar clip goes 0→127 over 4 bars
  - With speed: ramp(0, 127, 2) completes two full 0→127 cycles

## Modulation Syntax

- **Format**: `[pitchRange] [timeRange] parameter operator expression` (one per
  line in `modulations` string)
- **Parameters**:
  - MIDI clips: velocity, timing, duration, probability, deviation
  - Audio clips: gain
- **Assignment Operators**:
  - `+=` Add to the value (additive modulation)
  - `=` Set/replace the value (absolute modulation)
- **Pitch selectors** (optional): Filter by MIDI pitch or note name
  - Single pitch: `C3 velocity += 10`
  - Pitch range: `C3-C5 velocity += 10` (applies to all notes from C3 to C5
    inclusive)
- **Time range selectors** (optional): Filter by bar|beat range (e.g.,
  `1|1-2|1 velocity += 10`)
- **Range clamping**: Applied after modulation (velocity 1-127, probability
  0.0-1.0, etc.)

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

// Combined functions
velocity += 20 * cos(4:0t) + 10 * noise()

// Swing timing
timing += 0.05 * (cos(1t) - 1)

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
velocity += ramp(20, 100) + 10 * noise();
```

### Math Functions

```javascript
// Round to nearest semitone
pitch += round(12 * noise());

// Ensure minimum velocity
velocity = max(60, note.velocity);

// Quantize velocity to steps of 10
velocity = floor(note.velocity / 10) * 10;

// Absolute pitch distance from C3
velocity = abs(note.pitch - 60) * 2;

// Clamp velocity to range
velocity = min(max(note.velocity, 40), 100);

// Alternating pattern (every other beat)
gain = -6 * (floor(note.start) % 2);
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
modulations: `velocity += 20 * cos(1:0t) + 10 * noise()
timing += 0.03 * noise()
probability += 0.2 * cos(0:2t)`;

// Using variables
modulations: `velocity = note.pitch
duration = note.duration * note.probability
timing += note.start / 100`;
```

### Audio Clip Gain

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
```
