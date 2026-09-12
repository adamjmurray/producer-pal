# basic-with-drum-and-lead-clips Specification

`basic-midi-4-track` with two clips already in scene 1, for scenarios that need
music to edit rather than music to write.

## Global Settings

Identical to `basic-midi-4-track`: 120 BPM, 4/4, A Minor, no locators, 8 scenes
named "1" through "8".

## Tracks

Identical to `basic-midi-4-track` — same five tracks, same devices, same mixer
settings, same drum map on t0/d0, same two returns and Limiter on the master.
See `basic-midi-4-track-spec.md` for the full table.

## Clips

Both are 2 bars, looping, in scene 1, and **saved playing** — a read reports
`playing: true` before any scenario has fired anything.

### t0/s0 — Drums

```
v100 n/16 C1 1|1x8@n/4
n/8 Ab1 1|1x12 n/16 Ab1 2|3x8
E1 1|2x4@n/2
```

Kick on every beat, closed hats through bar 1 doubling to 16ths in bar 2, snare
on 2 and 4.

### t3/s0 — Lead

```
v100 n/4 A2 1|1
C3 1|2
D3 1|3
E3 1|4
n/8 F3 2|1
D3 2|1.5,3
E3 2|2
C3 2|2.5,3.5
B2 2|4
G2 2|4.5
```

An A-minor line: quarter notes rising through bar 1, eighths descending in
bar 2.
