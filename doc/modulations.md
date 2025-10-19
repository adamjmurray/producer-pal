# Modulation System Specification

## Function Signatures

```javascript
cos(frequency, [phase]); // cosine wave
tri(frequency, [phase]); // triangle wave
saw(frequency, [phase]); // sawtooth wave
square(frequency, [phase], [pulseWidth]); // square wave
noise(); // random per note
ramp(start, end, [speed]); // linear ramp over clip/time range
```

## Parameters

- **frequency**: bar:beat duration with `t` suffix
  - Examples: `1t`, `4t`, `1:0t`, `0:1t`, `0:0.5t`
  - `1t` = 1 beat period
  - `1:0t` = 1 bar period
  - `0:1t` = 1 beat period (same as `1t`)
- **phase**: cycles (0.0-1.0), optional, default 0
  - 0.0 = start of cycle
  - 0.25 = quarter cycle
  - 0.5 = half cycle
  - 0.75 = three-quarter cycle

- **pulseWidth** (square only): cycles (0.0-1.0), optional, default 0.5
  - 0.5 = 50% duty cycle
  - 0.25 = 25% high, 75% low
  - 0.75 = 75% high, 25% low

- **start** (ramp only): starting value for the ramp
- **end** (ramp only): ending value for the ramp
- **speed** (ramp only): optional speed multiplier (default 1)
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

## Modulation Properties

- **Additive**: Modulation expressions add to original parameter values from
  bar|beat notation
- **Parameters**: velocity, timing, duration, probability, pitch
- **Format**: `parameter: expression` (one per line in `modulations` string)
- **Pitch modulation**: Scale-quantized after modulation applied (uses clip
  scale or global scale)
- **Range clamping**: Applied after modulation (velocity 1-127, probability
  0.0-1.0, etc.)

## Operators

Functions can be combined using standard arithmetic operators:

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/` (division by zero yields 0, not an error)

Parentheses for grouping: `(expression)`

## Examples

```javascript
// Basic envelope
velocity: 20 * cos(1:0t)

// Phase-shifted
velocity: 20 * cos(1:0t, 0.5)

// Pulse width modulation
velocity: 20 * square(2t, 0, 0.25)

// Combined functions
velocity: 20 * cos(4:0t) + 10 * noise()

// Swing timing
timing: 0.05 * (cos(1t) - 1)

// Unipolar envelope (0 to 40)
velocity: 20 + 20 * cos(2:0t)

// Amplitude modulation
velocity: 30 * cos(4:0t) * cos(1t)

// Velocity ramp from soft to loud over entire clip
velocity: ramp(0, 127)

// Reverse ramp (fade out)
velocity: ramp(127, 0)

// Ramp with arbitrary range
velocity: ramp(64, 100)

// Two complete ramps over clip duration
velocity: ramp(0, 127, 2)

// Combine ramp with periodic modulation
velocity: ramp(20, 100) + 10 * noise()

// Multi-parameter
modulations: `velocity: 20 * cos(1:0t) + 10 * noise()
timing: 0.03 * noise()
probability: 0.2 * cos(0:2t)`
```
