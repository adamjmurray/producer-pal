# bar|beat Internals

## Parsing Rules

1. Notes are emitted ONLY at time positions - pitches buffer until `bar|beat` is
   encountered
2. State is maintained throughout parsing - probability, velocity, and duration
   settings persist
3. Probability (`p`), velocity (`v`), and duration (`n`) capture their values
   with each pitch
4. State changes after time positions update all buffered pitches
5. Multiple notes at same time are whitespace-separated
6. No commas required between elements
7. Whitespace required between time positions, probability, velocity, duration,
   and notes — EXCEPT a pattern bracket may abut the previous element when the
   next element opens a bracket (`[C3 E3][v80 v100]`); the leading `[` is a
   self-delimiting boundary
8. Velocity ranges are auto-ordered: `v120-80` becomes `v80-120`
9. First pitch after a time position clears the pitch buffer
10. Subsequent time positions re-emit the last buffered pitches (pitch
    persistence)

---

## AST Schema

The Peggy grammar (`barbeat-grammar.peggy`) returns an array of element objects:

```typescript
Element[]

type Element =
  | { pitch: number }                                                // Note (0-127)
  | { bar: number, beat: number | RepeatPattern }                    // Time position
  | { velocity: number }                                             // Single velocity (0-127)
  | { velocityMin: number, velocityMax: number }                     // Velocity range (0-127)
  | { duration: number, bars?: number }                              // Duration: whole-note fraction (e.g. 1/4 = quarter); meter-aware `bars` present for Nbar / Nbar+nA/B
  | { probability: number }                                          // Probability (0.0-1.0)
  | { stream: { param: "pitch", values: { pitch: number }[][] } }    // Pattern bracket (pitch): each value is a chord (length-1 for a bare pitch)
  | { stream: { param: "velocity", values: ({ velocity: number } | { velocityMin: number, velocityMax: number })[] } } // Pattern bracket (velocity)
  | { stream: { param: "duration", values: { duration: number, bars?: number }[] } } // Pattern bracket (duration)
  | { stream: { param: "probability", values: { probability: number }[] } } // Pattern bracket (probability)
  | { barCopy: number, sourcePrevious: true }                        // @N= (copy previous)
  | { barCopy: number, sourceBar: number }                           // @N=M (copy bar M)
  | { barCopy: number, sourceRange: [number, number] }               // @N=M-P (copy source range)
  | { barCopyRange: [number, number], sourcePrevious: true }         // @N-M= (copy previous to range)
  | { barCopyRange: [number, number], sourceBar: number }            // @N-M=P (copy bar to range)
  | { barCopyRange: [number, number], sourceRange: [number, number] } // @N-M=P-Q (tile pattern)
  | { clearBuffer: true }                                            // @clear (clear copy buffer)

type RepeatPattern = {
  start: number,      // Starting beat position (meter-relative)
  times: number,      // Number of repetitions (integer)
  step: number | null, // Step size as a fraction of a whole note (null when @step omitted)
  stepBars?: number   // Meter-aware bar component of the step (present only for @Nbar forms)
}
```

### Notes

- The grammar emits raw values without range enforcement (an out-of-range
  velocity/probability/pitch parses fine); the interpreter clamps or skips them.
  Pitch is computed as a number and the note name is not retained in the AST
- Each element is a simple object with one or two properties
- The AST is stateless - no context about what came before

---

## Interpreter Output

The `interpretNotation()` function parses the input and processes the resulting
grammar AST to return an array of note events:

```javascript
[
  {
    pitch: number, // MIDI pitch (0-127)
    start_time: number, // Start time in Ableton beats (float)
    duration: number, // Duration in Ableton beats (float)
    velocity: number, // Base velocity (0-127)
    probability: number, // Note probability (0.0-1.0)
    velocity_deviation: number, // Velocity randomization range (0-127)
  },
  // ... more note events
];
```

### Notes

- **start_time**: Converted from `bar|beat` notation to Ableton beats (accounts
  for time signature)
  - Example: In 4/4, bar 2 beat 3 = `(2-1) * 4 + (3-1) = 6.0` beats
  - Example: In 3/4, bar 2 beat 3 = `((2-1) * 3 + (3-1)) * (4/4) = 5.0` beats
- **duration**: The grammar emits durations as a fraction of a whole note
  (meter-independent); the interpreter then converts to Ableton beats (= quarter
  notes). A `n/4` becomes `1.0` in any meter; `n/8` becomes `0.5`; a `n3/8`
  (dotted quarter) becomes `1.5`
  - **Beat unit (cross-layer note)**: these numbers are **Ableton beats**
    (quarter-note beats — the unit of parsed-note output). The transforms layer
    instead measures in meter-relative **musical beats** (scaled by the
    time-signature denominator), so the same `n/4` evaluates to a different
    number there (1 in 4/4, 2 in 6/8). Both describe the identical physical
    quarter note — only the measuring unit differs. See "Units and Time
    Signatures".
- **velocity**: Base velocity (0-127)
  - `v0` marks a deletion: it removes matching earlier notes and is then
    stripped — interpreter output never contains a `velocity: 0` note (see Note
    Deletion section)
- **velocity_deviation**: When velocity range is used (e.g., `v80-100`),
  velocity is min value and velocity_deviation is the range (20)
- **Precision**: Both start_time and duration support floating point for
  sub-beat accuracy
- **No bar/beat info**: The output only contains absolute Ableton beat
  positions, not the original bar|beat notation

---

## Precision

- Beat positions support floating point for sub-beat accuracy
- Equivalent to 480 PPQN timing resolution
- Beat 1.5 = halfway between beats 1 and 2
- Beat 1.25 = quarter beat after beat 1
