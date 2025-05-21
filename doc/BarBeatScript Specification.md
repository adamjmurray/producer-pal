# BarBeatScript Specification

A precise, position-based music notation format for MIDI sequencing in Ableton Live.

## Core Syntax

`bar.beat.unit:note[modifiers]`

Where:

- `bar` - 1-based bar number (integer)
- `beat` - 1-based beat number within bar (integer)
- `unit` - Position within beat (0-479 for 480 PPQN)
- `note` - Note name with octave (e.g., C3, F#4)
- `modifiers` - Optional parameters:
  - `v<0-127>` - Velocity (default: 70)
  - `t<float>` - Duration in beats (default: 1.0)

## Strict Rules

1. All positions must use explicit `bar.beat.unit` format
2. Multiple notes at the same position implicitly form a chord
3. Each note requires complete position specification
4. Modifiers must not be duplicated

## Examples

// C major triad 1.1.0:C3t1v80 1.1.0:E3t1v80 1.1.0:G3t1v80

// Simple melody across bars 1.1.0:C3t1 1.2.0:D3t1 1.3.0:E3t1 1.4.0:F3t1 2.1.0:G3t2

// Sixteenth notes (with 120 unit intervals in 480 PPQN) 1.1.0:C3t0.25 1.1.120:D3t0.25 1.1.240:E3t0.25 1.1.360:F3t0.25

// Velocity variations 1.1.0:C3v100 1.2.0:C3v80 1.3.0:C3v60 1.4.0:C3v40
