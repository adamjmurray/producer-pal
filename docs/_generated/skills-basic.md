::: details Basic Skills (small model mode)

#### MIDI Notation

Pitches: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
Format: [v&lt;vel&gt;] [t&lt;dur&gt;] [p&lt;prob&gt;] pitch(es) bar|beat
- v: velocity 0-127 (default 100). t: duration in beats (default 1). p: probability 0-1 (default 1). Persist until changed
- Fraction beats: t/4 = quarter beat, t3/4, 1|2+1/3 for triplets

##### Melody (one note per beat across 2 bars)
```
C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
```

##### Chords (set duration with t, t4 = 4 beats = full bar in 4/4)
```
t4
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
```

##### Drums (commas for multiple beats, {beat}x{count}[@{step}] for repeats)
```
C1 1|1,3 2|1,3 3|1,3 4|1,3  # kick
D1 1|2,4 2|2,4 3|2,4 4|2,4  # snare
t/4 Gb1 1|1.5x4@1 2|1.5x4@1 3|1.5x4@1 4|1.5x4@1  # hats (4 per bar, step 1 beat)
```

#### Rules
- Set clip lengths explicitly (e.g., 4:0 for 4 bars)
- Positions use | (bar|beat). Durations use : (bar:beat) or plain beats (4, 2.5)
- If the user references a track, get its trackIndex and id - never guess

:::
