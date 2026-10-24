# Skip entries, tool by tool

How each write tool applies the entry rules in
[Tool Behavior](../skips-and-replaced-targets.md): one entry per target named,
`ok: false` plus a `detail` for a skip, and a `detail` alone for a target that
landed incomplete. This list follows the code; when it disagrees with a tool,
the tool wins.

Each tool's bullets live in a part, grouped by what the tool works on.

| Part                                                             | Covers                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| [clips.md](clips.md)                                             | update-clip and create-clip                                        |
| [scenes-and-tracks.md](scenes-and-tracks.md)                     | update-scene, update-track, create-track and create-scene          |
| [devices.md](devices.md)                                         | update-device and create-device: presets, device paths             |
| [delete-and-duplicate.md](delete-and-duplicate.md)               | delete and duplicate, with their automation and device copies      |
| [live-set-playback-and-reads.md](live-set-playback-and-reads.md) | update-live-set locators, session playback, select, the read tools |
