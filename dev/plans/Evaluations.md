# Evaluation Scenario Gaps

## Current Coverage

Five scenarios are implemented in `evals/scenarios/defs/`:

| Scenario               | Tools Exercised                                                   |
| ---------------------- | ----------------------------------------------------------------- |
| `connect-to-ableton`   | `ppal-connect`                                                    |
| `track-and-device`     | `ppal-create-track`, `ppal-update-track`, `ppal-create-device`    |
| `create-and-edit-clip` | `ppal-create-clip`, `ppal-update-clip` (MIDI notes, quantization) |
| `duplicate`            | `ppal-duplicate`                                                  |
| `memory-workflow`      | `ppal-context` (write + read)                                     |

## Tool Coverage Gaps

Tools with **no** eval coverage:

| Tool                   | Notes                                           |
| ---------------------- | ----------------------------------------------- |
| `ppal-read-live-set`   | Only implicitly tested via connect              |
| `ppal-update-live-set` | Tempo, time sig, scale changes untested         |
| `ppal-read-track`      | Never explicitly requested in a scenario        |
| `ppal-read-clip`       | Never explicitly requested                      |
| `ppal-update-device`   | Device parameter changes untested               |
| `ppal-read-device`     | Never explicitly requested                      |
| `ppal-create-scene`    | Entire scene workflow missing                   |
| `ppal-read-scene`      | Entire scene workflow missing                   |
| `ppal-update-scene`    | Entire scene workflow missing                   |
| `ppal-playback`        | Play/stop untested                              |
| `ppal-select`          | Selection/navigation untested                   |
| `ppal-delete`          | Deletion untested                               |
| `ppal-create-clip`     | Audio clip creation untested (only MIDI tested) |
| `ppal-update-clip`     | Audio clip properties untested (only MIDI)      |

## Prioritized Gaps

### Priority 1: Arrangement Clip Workflow (new scenario)

Not in the original plan at all, but arrangement operations are the most complex
part of the codebase (splitting, tiling, loop extension, `end_time`
immutability). No scenario tests arrangement clips. This is where LLMs are most
likely to produce bad results and where regressions are most costly.

**Suggested turns:**

1. Connect
2. "Create an 8-bar bass line on the Bass track in the arrangement starting at
   bar 5"
3. "Duplicate that clip to bar 13"
4. "Split the clip at bar 9"

**Tools exercised:** `ppal-create-clip` (arrangement), `ppal-duplicate`
(arrangement clip), `ppal-update-clip` (arrangement splitting)

**Requires:** A Live Set with arrangement content or appropriate setup.

---

### Priority 2: Audio Sample Workflow

Audio clips have distinct behavior from MIDI (warping, pitch, sample browsing).
Currently zero audio clip coverage.

**Suggested turns:**

1. Connect
2. "Show me available drum samples"
3. "Create an audio clip using a kick sample"
4. "Pitch shift it up 5 semitones and loop it"

**Tools exercised:** `ppal-context` (sample listing), `ppal-create-clip`
(audio), `ppal-update-clip` (audio properties)

---

### Priority 3: Token Usage Thresholds (new assertion type)

Evaluate token efficiency across multi-turn conversations. Assert on a maximum
input token threshold to catch regressions in tool result verbosity, system
prompt bloat, or unnecessary read-back loops. Critical for cost control and
staying within context limits during real usage.

**Approach:**

- Track cumulative input tokens across all turns of a scenario
- Assert that total input tokens stay below a per-scenario threshold
- Start by measuring current baselines, then set thresholds ~20% above
- Flag scenarios where token usage spikes between runs

**Best candidates:** Multi-turn scenarios like `create-and-edit-clip` (4 turns)
and `track-and-device` (4 turns) where accumulation is most visible.

---

### Priority 4: Live Set Properties (extend existing scenario)

The `connect-to-ableton` scenario only tests connection. Adding a second turn
for tempo and time signature changes is easy.

**Additional turn:**

- "Set the tempo to 128 BPM and the time signature to 6/8"

**Tools exercised:** `ppal-update-live-set`

---

### Priority 5: Device Parameter Updates (extend existing scenario)

The `track-and-device` scenario creates a device but never adjusts its
parameters. Easy to add a turn for this.

**Additional turn in track-and-device:**

- "Set the filter cutoff to 50%"

**Tools exercised:** `ppal-update-device`

---

### Priority 6: Scene & Playback

Straightforward tools, low regression risk, but entirely uncovered.

**Suggested turns:**

1. Connect
2. "Create a scene called 'Intro' with tempo 100"
3. "Play that scene"
4. "Stop playback"

**Tools exercised:** `ppal-create-scene`, `ppal-update-scene`,
`ppal-read-scene`, `ppal-playback`

---

### Priority 7: Delete Operations

The `memory-workflow` scenario doesn't test deletion. Easy to add.

**Additional turn in memory-workflow:**

- "Delete the last track"

**Tools exercised:** `ppal-delete`

---

### Priority 8: Selection & Navigation

Hardest to assert on meaningfully — selection is a UI-side concern and
navigation results depend on visual state. Low value as an automated eval.

**Suggested turns:**

1. Connect
2. "Select the Bass track and show its devices"
3. "Switch to arrangement view"

**Tools exercised:** `ppal-select`, `ppal-read-track`, `ppal-read-device`

**Consider skipping** unless we find a good way to assert on selection state.

## Broader Gaps Beyond Tool Coverage

- **Multi-track composition** — No scenario tests building a song across
  multiple tracks in a single conversation. This is the core end-user workflow
  and would stress-test context management and cross-track references.

- **Multi-step editing** — Current clip scenario uses simple "add notes" +
  "quantize". No test for more complex editing like "move the snare hits 50ms
  early for a lazy feel" or "transpose the melody up a 4th".

- **Error recovery** — No scenario tests how LLMs handle invalid requests (e.g.,
  "add a device to a return track that doesn't support it") or recover
  gracefully from tool errors.

- **Read-heavy workflows** — Scenarios are write-heavy. No scenario starts with
  "tell me about this project" and then asks follow-up questions about existing
  content, which is a common real-world pattern.
