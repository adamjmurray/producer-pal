# Producer Pal Evaluation Plan

## Rating System

- **fail** - Doesn't work, errors, or completely misses the mark
- **ok** - Sorta works but has issues (aim higher than this)
- **good** - Works well, meets expectations
- **great** - Exceeds expectations, excellent use of features, very musical
  results

## Testing Guidelines

- **Always test as a real end user** - no intimate knowledge of internals
- **Never explicitly request bar|beat features** - users don't know what that is
- **Use natural language** - "add fills every 4 bars", not "add notes at 4|1"
- **Rate honestly** - we're trying to find issues and compare LLMs

## Evaluation Scenarios

### Scenario 1: Connection & Project Overview

**Exercises:** `ppal-connect`, `ppal-read-live-set`, `ppal-update-live-set`

| Turn | Prompt                                                   | Features Tested                           |
| ---- | -------------------------------------------------------- | ----------------------------------------- |
| 1    | "Connect to Ableton"                                     | Connection, skills retrieval, set summary |
| 2    | "Set the tempo to 128 BPM and the time signature to 6/8" | Tempo update, time signature update       |

---

### Scenario 2: Track & Device Workflow

**Exercises:** `ppal-create-track`, `ppal-read-track`, `ppal-update-track`,
`ppal-create-device`, `ppal-update-device`

| Turn | Prompt                                                              | Features Tested                   |
| ---- | ------------------------------------------------------------------- | --------------------------------- |
| 1    | "Connect to Ableton"                                                | Setup                             |
| 2    | "Create a MIDI track called 'Synth Lead'"                           | Track creation with name          |
| 3    | "Add a Wavetable instrument to it and set the filter cutoff to 50%" | Device creation, parameter update |
| 4    | "Mute that track and set its color to purple"                       | Track property updates            |

---

### Scenario 3: Clip Creation & Editing

**Exercises:** `ppal-create-clip`, `ppal-read-clip`, `ppal-update-clip`

| Turn | Prompt                                                                  | Features Tested               |
| ---- | ----------------------------------------------------------------------- | ----------------------------- |
| 1    | "Connect to Ableton"                                                    | Setup                         |
| 2    | "Create a 4-bar drum clip with kick on every beat and snare on 2 and 4" | MIDI clip creation, notes     |
| 3    | "Add hi-hats on every 8th note"                                         | Clip note update (merge mode) |
| 4    | "Quantize the notes to 1/16"                                            | Quantization                  |

---

### Scenario 4: Scene & Playback Workflow

**Exercises:** `ppal-create-scene`, `ppal-read-scene`, `ppal-update-scene`,
`ppal-playback`

| Turn | Prompt                                         | Features Tested           |
| ---- | ---------------------------------------------- | ------------------------- |
| 1    | "Connect to Ableton"                           | Setup                     |
| 2    | "Create a scene called 'Intro' with tempo 100" | Scene creation with tempo |
| 3    | "Play that scene"                              | Scene playback            |
| 4    | "Stop playback"                                | Stop command              |

---

### Scenario 5: Duplication

**Exercises:** `ppal-duplicate`

| Turn | Prompt                      | Features Tested   |
| ---- | --------------------------- | ----------------- |
| 1    | "Connect to Ableton"        | Setup             |
| 2    | "Duplicate the Drums track" | Track duplication |

---

### Scenario 6: Audio Sample Workflow

**Exercises:** `ppal-connect`, `ppal-context`, `ppal-create-clip` (audio),
`ppal-update-clip` (audio)

| Turn | Prompt                                      | Features Tested               |
| ---- | ------------------------------------------- | ----------------------------- |
| 1    | "Connect to Ableton"                        | Setup                         |
| 2    | "Show me available drum samples"            | Sample folder listing, search |
| 3    | "Create an audio clip using kick.wav"       | Audio clip from sample        |
| 4    | "Pitch shift it up 5 semitones and loop it" | Audio properties, warping     |

---

### Scenario 7: Selection & Navigation

**Exercises:** `ppal-select`, `ppal-read-track`, `ppal-read-device`

| Turn | Prompt                                       | Features Tested                 |
| ---- | -------------------------------------------- | ------------------------------- |
| 1    | "Connect to Ableton"                         | Setup                           |
| 2    | "Select the Bass track and show its devices" | Track selection, device reading |
| 3    | "Switch to arrangement view"                 | View switching                  |
| 4    | "Select the first clip in arrangement"       | Arrangement clip selection      |

---

### Scenario 8: Memory & Cleanup

**Exercises:** `ppal-connect`, `ppal-context`, `ppal-delete`

| Turn | Prompt                                                           | Features Tested |
| ---- | ---------------------------------------------------------------- | --------------- |
| 1    | "Connect to Ableton"                                             | Setup           |
| 2    | "Save a note: 'This project uses C minor with jazzy 7th chords'" | Memory write    |
| 3    | "What notes do I have saved about this project?"                 | Memory read     |
| 4    | "Delete the last track"                                          | Track deletion  |

---

## Tool Coverage Summary

| Tool                   | Scenarios |
| ---------------------- | --------- |
| `ppal-connect`         | 1-8 (all) |
| `ppal-context`         | 6, 8      |
| `ppal-read-live-set`   | 1         |
| `ppal-update-live-set` | 1         |
| `ppal-create-track`    | 2         |
| `ppal-read-track`      | 7         |
| `ppal-update-track`    | 2         |
| `ppal-create-clip`     | 3, 6      |
| `ppal-read-clip`       | 3         |
| `ppal-update-clip`     | 3, 6      |
| `ppal-create-device`   | 2         |
| `ppal-read-device`     | 7         |
| `ppal-update-device`   | 2         |
| `ppal-create-scene`    | 4         |
| `ppal-read-scene`      | 4         |
| `ppal-update-scene`    | 4         |
| `ppal-delete`          | 8         |
| `ppal-duplicate`       | 5         |
| `ppal-playback`        | 4         |
| `ppal-select`          | 7         |
