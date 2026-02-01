# E2E Test Set Specification

Comprehensive Live Set for MCP e2e testing.

## Global Settings

| Property       | Value                  |
| -------------- | ---------------------- |
| Name           | e2e-test-set           |
| Tempo          | 108 BPM                |
| Time Signature | 4/4                    |
| Scale          | A Minor                |
| Loop           | Enabled, Verse section |

---

## Scenes

| Index | Name      | Color  | Tempo | Time Sig | Clips |
| ----- | --------- | ------ | ----- | -------- | ----- |
| s0    | Intro     | Green  | —     | —        | 5     |
| s1    | Verse 1   | Blue   | —     | —        | 1     |
| s2    | Chorus    | Red    | 125   | —        | 0     |
| s3    | Verse 2   | Blue   | —     | —        | 0     |
| s4    | Bridge    | Yellow | —     | 3/4      | 0     |
| s5    | Chorus 2  | Red    | 125   | —        | 0     |
| s6    | Outro     | Purple | —     | —        | 0     |
| s7    | (unnamed) | Gray   | —     | —        | 0     |

---

## Locators

| Index | Name   | Position |
| ----- | ------ | -------- |
| 0     | Intro  | 1\|1     |
| 1     | Verse  | 9\|1     |
| 2     | Chorus | 17\|1    |
| 3     | Bridge | 33\|1    |

---

## Tracks

### t0: Drums (MIDI)

| Property       | Value          |
| -------------- | -------------- |
| Color          | Red            |
| State          | Muted via solo |
| Gain           | -6 dB          |
| Send A (Delay) | -18 dB         |

**Device: d0 — Drum Rack "505 Classic Kit"**

| Pad  | Note | Name                       | Chain Device |
| ---- | ---- | -------------------------- | ------------ |
| pC1  | C1   | Kick Bass Drum 505 Classic | Simpler      |
| pD1  | D1   | Snare Drum 505 Classic     | Simpler      |
| pEb1 | Eb1  | Clap 505 Classic           | Simpler      |
| pGb1 | Gb1  | Hihat Closed 505 Classic   | Simpler      |

**Return Chain:** rc0 "a Saturator" → Saturator

**Session Clips:**

| Scene | Name | Length | Looping | Notes                                                   |
| ----- | ---- | ------ | ------- | ------------------------------------------------------- |
| s0    | Beat | 1 bar  | Yes     | C1 kick on 1,3; D1 snare on 2,4 with velocity variation |

**Arrangement Clips:**

| Position | Name     | Clip Length | Arr Length | Looping | Notes                                      |
| -------- | -------- | ----------- | ---------- | ------- | ------------------------------------------ |
| 1\|1     | Arr Beat | 4 bars      | 8 bars     | Yes     | Includes Eb1 clap; tiled 2x in arrangement |

---

### t1: Bass (MIDI)

| Property | Value          |
| -------- | -------------- |
| Color    | Orange         |
| State    | Muted via solo |
| Gain     | -6 dB          |
| Pan      | 0.6 (right)    |

**Device: d0 — Instrument Rack "Layered Bass"**

Macros: 1 mapped

| Chain | Name          | Devices              |
| ----- | ------------- | -------------------- |
| c0    | Sub Dirt Bass | Operator → Saturator |
| c1    | Wavetable     | Wavetable            |

**Session Clips:**

| Scene | Name     | Length | Looping | Notes                  |
| ----- | -------- | ------ | ------- | ---------------------- |
| s0    | Bassline | 4 bars | Yes     | A2, G2, E2 whole notes |

---

### t2: Keys (MIDI)

| Property | Value                 |
| -------- | --------------------- |
| Color    | Purple                |
| State    | Muted (also via solo) |
| Gain     | -6 dB                 |

**Devices:**

| Position | Type             | Name              |
| -------- | ---------------- | ----------------- |
| d0       | MIDI Effect Rack | —                 |
| d1       | Analog           | Soft Morning Keys |
| d2       | EQ Eight         | —                 |
| d3       | Compressor       | —                 |

**MIDI Effect Rack (d0) Chains:**

| Chain | Name        | Device      |
| ----- | ----------- | ----------- |
| c0    | Arpeggiator | Arpeggiator |
| c1    | Pitch       | Pitch       |

**Session Clips:**

| Scene | Name   | Length | Looping | Notes                                      |
| ----- | ------ | ------ | ------- | ------------------------------------------ |
| s0    | Chords | 1 bar  | No      | Am chord; one chord has p=0.69 probability |

---

### t3: Lead (MIDI)

| Property | Value          |
| -------- | -------------- |
| Color    | Blue           |
| State    | Muted via solo |
| Gain     | -9 dB          |

**Devices:**

| Position | Type       | Name |
| -------- | ---------- | ---- |
| d0       | Drift      | —    |
| d1       | Compressor | —    |

**Session Clips:**

| Scene | Name      | Length | Looping | Start | Loop Start | Notes                                              |
| ----- | --------- | ------ | ------- | ----- | ---------- | -------------------------------------------------- |
| s1    | (unnamed) | 3 bars | Yes     | 2\|1  | 1\|1       | Offset loop (firstStart≠start); velocity variation |

**Arrangement Clips:**

| Position | Name      | Length | Arr Length | Looping | Notes            |
| -------- | --------- | ------ | ---------- | ------- | ---------------- |
| 9\|1     | (unnamed) | 1 bar  | 8 bars     | No      | Empty (no notes) |

---

### t4: Audio 1 (Audio)

| Property | Value          |
| -------- | -------------- |
| Color    | Green          |
| State    | Muted via solo |
| Gain     | -6 dB          |
| Monitor  | In             |
| Output   | FX Bus         |

**Devices:** None

**Session Clips:**

| Scene | Name   | Looping | Warping | Warp Mode | firstStart≠start | Notes               |
| ----- | ------ | ------- | ------- | --------- | ---------------- | ------------------- |
| s0    | sample | Yes     | Yes     | Beats     | Yes              | Custom warp markers |

**Arrangement Clips:**

| Position | Name | Arr Length | Looping | Sample                           |
| -------- | ---- | ---------- | ------- | -------------------------------- |
| 17\|1    | kick | ~4 bars    | Yes     | drums/kick.aiff (different file) |

---

### t5: Audio 2 (Audio)

| Property | Value      |
| -------- | ---------- |
| Color    | Teal       |
| State    | **Soloed** |
| Gain     | -6 dB      |
| Monitor  | Off        |

**Devices:** None

**Session Clips:**

| Scene | Name        | Looping | Warping | Gain     | Pitch        | Notes                         |
| ----- | ----------- | ------- | ------- | -------- | ------------ | ----------------------------- |
| s0    | sample copy | No      | No      | -2.31 dB | +7 semitones | Unwarped, pitch/gain modified |

---

### t6: FX Bus (Audio)

| Property | Value               |
| -------- | ------------------- |
| Color    | Yellow              |
| State    | Muted via solo      |
| Gain     | -6 dB               |
| Input    | Audio 1 routed here |

**Device: d0 — Audio Effect Rack**

| Chain | Name   | Devices |
| ----- | ------ | ------- |
| c0    | Dry    | (empty) |
| c1    | Reverb | Reverb  |

---

### t7: Racks (MIDI)

| Property | Value          |
| -------- | -------------- |
| Color    | Pink           |
| State    | Muted via solo |
| Gain     | -6 dB          |

**Device: d0 — Instrument Rack (deactivated)**

Nested structure for deep path testing:

```
d0: Instrument Rack [DEACTIVATED]
└── c0: "Instrument Rack"
    └── d0: Instrument Rack [DEACTIVATED]
        └── c0: "Drift"
            └── d0: Drift [DEACTIVATED]
```

**Path examples:**

- Outer rack: `t7/d0`
- Outer chain: `t7/d0/c0`
- Nested rack: `t7/d0/c0/d0`
- Inner chain: `t7/d0/c0/d0/c0`
- Drift: `t7/d0/c0/d0/c0/d0`

---

### t8: 9-MIDI (MIDI) — Empty Track

| Property | Value          |
| -------- | -------------- |
| Color    | Gray           |
| State    | Muted via solo |
| Output   | No Output      |

**Devices:** None  
**Clips:** None

_Note: Track is intentionally unnamed; Live auto-generates "9-MIDI"_

---

### t9: Parent (Group)

| Property | Value       |
| -------- | ----------- |
| Color    | Brown       |
| Type     | Group track |
| Contains | t10 (Child) |

---

### t10: Child (MIDI)

| Property        | Value          |
| --------------- | -------------- |
| Color           | Brown          |
| State           | Muted via solo |
| Gain            | -6 dB          |
| Armed           | Yes            |
| Group           | Parent (t9)    |
| Send B (Reverb) | -9.5 dB        |
| Output          | Parent         |

**Device: d0 — Operator**

---

### t11: PPAL (MIDI)

| Property | Value     |
| -------- | --------- |
| Color    | White     |
| Output   | No Output |

**Device: d0 — Producer Pal (Max MIDI Effect)**

---

## Return Tracks

### rt0: A-Delay

| Property | Value  |
| -------- | ------ |
| Color    | Purple |
| Device   | Echo   |

### rt1: B-Reverb

| Property | Value         |
| -------- | ------------- |
| Color    | Blue          |
| Device   | Hybrid Reverb |

---

## Master Track

**Devices:**

| Position | Type            |
| -------- | --------------- |
| d0       | EQ Eight        |
| d1       | Glue Compressor |
| d2       | Limiter         |

---

## Test Coverage Matrix

| Feature                       | Location                        |
| ----------------------------- | ------------------------------- |
| MIDI clip                     | t0/s0, t1/s0, t2/s0, t3/s1      |
| Audio clip                    | t4/s0, t5/s0                    |
| Session clip                  | t0-t5 at s0/s1                  |
| Arrangement clip              | t0@1\|1, t3@9\|1, t4@17\|1      |
| Looping clip                  | t0/s0, t1/s0, t3/s1, t4/s0      |
| Non-looping clip              | t2/s0, t5/s0                    |
| Offset loop (start≠loopStart) | t3/s1                           |
| firstStart≠start              | t4/s0                           |
| Empty clip (no notes)         | t3 arrangement                  |
| Warped audio                  | t4/s0                           |
| Unwarped audio                | t5/s0                           |
| Pitch shifted                 | t5/s0 (+7 semi)                 |
| Gain modified                 | t5/s0 (-2.31 dB)                |
| Velocity variation            | t0/s0, t3/s1                    |
| Probability <100%             | t2/s0 (p=0.69)                  |
| Loop tiling in arrangement    | t0 arrangement (4-bar → 8-bar)  |
| Drum Rack                     | t0/d0                           |
| Drum pad paths                | t0/d0/pC1, pD1, pEb1, pGb1      |
| Drum Rack return chain        | t0/d0/rc0                       |
| Instrument Rack               | t1/d0                           |
| Instrument Rack + FX chain    | t1/d0/c0 (Operator → Saturator) |
| Rack macros                   | t1/d0 (1 mapped)                |
| MIDI Effect Rack              | t2/d0                           |
| Audio Effect Rack             | t6/d0                           |
| Empty rack chain              | t6/d0/c0                        |
| Nested racks                  | t7/d0 (2 levels)                |
| Deactivated device            | t7/d0 (entire chain)            |
| Empty track                   | t8                              |
| Unnamed track                 | t8                              |
| Group track                   | t9 (parent), t10 (child)        |
| Track armed                   | t10                             |
| Track soloed                  | t5                              |
| Track muted                   | t2                              |
| Track panned                  | t1 (0.6 right)                  |
| Track gain modified           | t3 (-9 dB)                      |
| Monitor state: In             | t4                              |
| Monitor state: Off            | t5                              |
| Send to return                | t0→rt0, t10→rt1                 |
| Track routing                 | t4→t6                           |
| Scene tempo override          | s2, s5 (125 BPM)                |
| Scene time sig override       | s4 (3/4)                        |
| Unnamed scene                 | s7                              |
| Warp markers                  | t4/s0                           |

---

## Sample Files

```
e2e/live-sets/samples/
├── sample.aiff      # Used by t4/s0, t5/s0
└── drums/
    └── kick.aiff    # Used by t4 arrangement
```

Both files contain the same audio content at different paths.
