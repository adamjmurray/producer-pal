# Live 13 Test Set Specification

Features only Live 13 has. Saved from Live 13.0b25, so Live 12 can't open it: it
is listed as an exception in `live-set-versions.test.ts`, and any test that
opens it must skip on Live 12. Re-save it once Live 13 is released.

The step sequencer clip and both envelope clips were made by hand: Live's API
can't create either kind.

| Property       | Value   |
| -------------- | ------- |
| Tempo          | 108 BPM |
| Time signature | 4/4     |
| Scale          | A Minor |
| Scenes         | 8       |
| Return tracks  | 2       |

---

## t0: Drums (MIDI)

```
d0: Drum Rack
└── pC1 "Kick 80x" -> Drum Synth (Sound Type Kick, Kick 80x)
```

| Slot | Clip             | Type           | Contents                                        |
| ---- | ---------------- | -------------- | ----------------------------------------------- |
| s0   | "Step Sequencer" | step sequencer | 16 steps at 1/16 (1 bar); steps 1, 5, 9, 13 on  |
| s1   | "Notes"          | MIDI notes     | C1 (36) at beats 0, 1, 2, 3; 0.25 long, vel 100 |

`midi_clip_type` reads 1 for s0 and 0 for s1. The notes API sees no notes in s0:
its steps can't be read.

## t1: Racks (audio)

| Device | Name           | Chains (fixed) |
| ------ | -------------- | -------------- |
| d0     | Mid-Side Rack  | Mid, Side      |
| d1     | Multiband Rack | Low, Mid, High |

Both refuse extra chains (`max_num_chains` 2 and 3). No clips.

## t2: Producer Pal (MIDI)

The repo device (`../../../max-for-live-device/Producer_Pal.amxd`), and nothing
else.

## Return tracks

| Track              | Device                       | s0 clip    | Envelopes                                            |
| ------------------ | ---------------------------- | ---------- | ---------------------------------------------------- |
| rt0 A-Echo         | Echo                         | "No Envs"  | none                                                 |
| rt1 B-Wide Hallway | Hybrid Reverb "Wide Hallway" | "With Env" | Predelay: flat until 1.2, ramps up to 1.4, then flat |

Both are envelope clips (`is_midi_clip` and `is_audio_clip` both 0), 1 bar long.
The rest of the return slots are empty.

## Main

Glue Compressor ("Mastering - Catch Peaks").
