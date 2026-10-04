# bar|beat Examples

Examples for the [bar|beat spec](README.md).

```
// C major triad at bar 1, beat 1
C3 E3 G3 1|1

// Drum pattern - kick on every beat (pitch persistence)
C1 1|1 1|2 1|3 1|4

// Layered drum pattern - kick on 1 & 3, snare on 2 & 4
C1 1|1 1|3  D1 1|2 1|4

// Simple melody with state changes
v100 n/4 C3 1|1 D3 1|2 E3 1|3 F3 1|4   // quarter notes
v80 n/2 G3 2|1                          // half note

// Sub-beat timing with floating points (positions stay decimal)
v100 n/16 C3 1|1 D3 1|1.5 E3 1|2.25 F3 1|3.75

// Duration examples — absolute note values
n/2 C3 1|1       // half note (2 quarters)
n/4 C3 1|1       // quarter note (default)
n/8 C3 1|1       // eighth note
n/16 C3 1|1      // sixteenth note
n3/8 C3 1|1      // dotted quarter (3 eighths)
n3/16 C3 1|1     // dotted eighth (3 sixteenths)
n/12 C3 1|1,1+n/12,1+n/6  // eighth-note triplets (3 per quarter): beats 1, 4/3, 5/3
n/6 C3 1|1,1+n/6,2+n/12   // quarter-note triplets (3 per half): beats 1, 5/3, 7/3
n/1 C3 1|1       // whole note (4 quarters)
n2/1 C3 1|1      // 2 whole notes (8 quarters)
n5/4 C3 1|1      // 5 quarter notes (e.g. fills a 5/4 bar)

// Repeat patterns - quarter-note step
C1 1|1x4@n/4    // Kick on every beat (repeat syntax)
C1 1|1,2,3,4   // Same as above (comma-separated beats still supported)

// Repeat patterns - triplets
n/12 C3 1|1x3@n/12            // eighth-note triplets (3 per quarter)
n/12 C3 1|1x3 1|2x3          // step defaults to n, two sets of triplets

// Repeat patterns - 16th notes
n/16 Gb1 1|1x16@n/16    // 16 sixteenths = 4 quarters (a full bar in 4/4)
n/16 Gb1 1|1x16        // same — step defaults to n value

// Repeat patterns - mixed with regular beats
C1 1|1x4@n/4 D1 1|2,4   // Kick on all beats, snare on 2 & 4

// Repeat patterns - bar overflow
C3 1|3x6@n/4  // Starts beat 3, overflows into bar 2 in 4/4

// Drum pattern with probability and velocity variation
v100 n/16 p1.0 C1 v80-100 p0.8 Gb1 1|1
p0.6 Gb1 1|1.5
v90 p1.0 D1 v100 p0.9 Gb1 1|2

// Chord progression
C3 E3 G3 1|1  D3 F3 A3 1|2  E3 G3 B3 1|3  F3 A3 C4 1|4

// Velocity-shaped chord
v127 C3 v100 E3 v80 G3 1|1

// Same pitches with varying velocity (state updates after time)
v100 C4 G4 1|1 v90 1|2 v80 1|3 v70 1|4

// Note deletion with v0
C3 D3 E3 1|1 v0 C3 1|1  // D3 and E3 remain (C3 deleted)

// Note deletion after bar copy
C3 D3 E3 1|1  @2=1  v0 D3 2|1  // Bar 1: C3 D3 E3, Bar 2: C3 E3
```
