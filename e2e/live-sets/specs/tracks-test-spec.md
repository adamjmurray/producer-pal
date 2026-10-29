# Tracks Test Set Specification

Small Live Set for track states the Live API can't create, so they have to be
baked into a saved Set:

1. **Frozen tracks.** `is_frozen` is read-only and there is no freeze function.
   One MIDI and one audio, because MIDI and audio clip creation take different
   code paths.
2. **Nested group tracks.** Grouping has no Live API or menu command.
3. **A second Set in the same project folder** (`tracks-test-twin.als`), saved
   with project context the sidecar file won't match. The sidecar is keyed on
   the project folder, so two Sets share it.

Save both Sets from Live `MIN_LIVE_VERSION` (12.3.x). Don't use "Collect All and
Save": the audio clips reference `e2e/live-sets/samples/`, like the other test
Sets.

---

## tracks-test.als

### Global Settings

| Property        | Value       |
| --------------- | ----------- |
| Name            | tracks-test |
| Tempo           | 120 BPM     |
| Time Signature  | 4/4         |
| Scenes          | 8           |
| Return tracks   | None        |
| Project context | Empty       |

s1–s7 stay empty on every track, as destinations for creates, copies and moves.

### Tracks

| Track | Name          | Type  | Inside | Devices      | s0 clip     | Arrangement    |
| ----- | ------------- | ----- | ------ | ------------ | ----------- | -------------- |
| t0    | Source MIDI   | MIDI  | —      | Operator     | 1-bar MIDI  | 1-bar at 1\|1  |
| t1    | Source Audio  | Audio | —      | None         | sample.aiff | sample at 1\|1 |
| t2    | Frozen MIDI   | MIDI  | —      | Operator     | 1-bar MIDI  | Empty          |
| t3    | Frozen Audio  | Audio | —      | None         | sample.aiff | Empty          |
| t4    | Outer         | Group | —      | None         | —           | —              |
| t5    | Outer Track   | MIDI  | t4     | None         | 1-bar MIDI  | Empty          |
| t6    | Inner         | Group | t4     | None         | —           | —              |
| t7    | Inner Track 1 | MIDI  | t6     | None         | 1-bar MIDI  | Empty          |
| t8    | Inner Track 2 | MIDI  | t6     | None         | 1-bar MIDI  | Empty          |
| t9    | Shell         | Group | —      | None         | —           | —              |
| t10   | Core          | Group | t9     | None         | —           | —              |
| t11   | Core Track    | MIDI  | t10    | None         | Empty       | Empty          |
| t12   | PPAL          | MIDI  | —      | Producer Pal | Empty       | Empty          |

- **Every non-group track** also ends with Channel EQ and Utility, from the
  author's default track preset. So t12's Producer Pal is d0.
- **t2, t3:** frozen in Live.
- **t4–t8:** an outer group holding a track and an inner group. For delete,
  duplicate and playback at every depth.
- **t9–t11:** each group's only member is a group or track. Live won't delete
  the only track in a group, so deleting t10 or t11 should name t9.
- Leave every group unfolded. Tests fold them at runtime.

The MIDI clips' notes don't matter. A few quarter notes are enough.

### Freeze files

Freezing writes audio into `Samples/Processed/Freeze/`. It's committed with the
`.als`, or the tracks wouldn't be frozen in a fresh clone.

The Set finds that audio relative to the project folder, and Live only treats a
folder as a project when it holds `Ableton Project Info/`. Git drops empty
folders, so a `.gitkeep` keeps it. Without it, Live can't find the freeze audio
and asks whether to unfreeze the tracks, which blocks the tests.

---

## tracks-test-twin.als

A second Set in `tracks-test Project/`, for the shared-sidecar cases.

| Property        | Value                                   |
| --------------- | --------------------------------------- |
| Tracks          | t0 "PPAL" (MIDI): Producer Pal          |
| Project context | `Stale notes saved in tracks-test-twin` |

Any Producer Pal tool call while the twin is open writes
`Producer Pal Project Context.md` into the folder. It's gitignored, but delete
any copy left over by hand: it gets restored into `tracks-test.als` the next
time that Set opens, because that Set's context is empty.

---

## Test Coverage Matrix

| Feature                                | Location                  |
| -------------------------------------- | ------------------------- |
| Frozen MIDI track                      | t2                        |
| Frozen audio track                     | t3                        |
| Copy/move sources for frozen cases     | t0, t1 (s0 + arrangement) |
| Nested group                           | t4 → t6                   |
| Track beside a nested group            | t5                        |
| Group slot firing at every depth       | t4/s0 → t5, t7, t8        |
| Group that is its parent's only member | t10 in t9                 |
| Track that is its group's only member  | t11 in t10                |
| Shared project-context sidecar         | tracks-test-twin.als      |
| Stale context vs. sidecar              | tracks-test-twin.als      |
