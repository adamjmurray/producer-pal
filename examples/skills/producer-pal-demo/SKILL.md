---
name: producer-pal-demo
description:
  End-to-end demo of Producer Pal's full tool stack — LOM tools plus the three
  Welle-3 Runbook tools (`ppal-render-export`, `ppal-record-arrangement`,
  `ppal-load-m4l-device`). Walks through Connect → Create Track → MIDI Clip →
  Device → Record/Render → Save. Use when the user asks for a complete demo,
  asks how to combine LOM and computer-use steps, or wants a reference workflow
  for a presentation.
---

# Producer Pal — End-to-End Demo

This is a **workflow skill**. It exists to demonstrate that Producer Pal can
drive a complete production loop — from empty Live Set to rendered WAV — using
only its own tool surface. For day-to-day editing, use the sibling
[`producer-pal`](../producer-pal/SKILL.md) skill (raw tool surface) or
[`ableton-compose`](../ableton-compose/SKILL.md) (House/Techno composition).

## When to use this skill

- User says "give me an end-to-end demo", "show me the full Producer Pal
  workflow", "wie sieht ein kompletter Durchlauf aus".
- User wants to see how the LOM tools and the Welle-3 Runbook tools compose.
- User is preparing a presentation or onboarding doc and needs a reference
  script.

**Do not use this skill** for:

- Specific composition tasks (use `ableton-compose`).
- Single-tool calls or quick edits (use `producer-pal`).

## Prerequisites

- Ableton Live 12 is running with the **Producer Pal** Max-for-Live device
  loaded on a track. The device shows "Producer Pal Running".
- macOS with computer-use access for the Runbook-Tool steps (Render-Export and
  Record-Arrangement drive Live's native dialogs).
- Empty or near-empty Live Set as a starting point so the demo's IDs are
  predictable. A blank set with one MIDI track and one audio track works well.
- `node ppal.mjs --list-tools` from the sibling `producer-pal` skill returns the
  23 tools (otherwise the device is not reachable on `http://localhost:3350`).

## The seven-stage workflow

Each stage names the tool call, what to verify before moving on, and which
fail-mode to watch for. Use the sibling `producer-pal/ppal.mjs` CLI to run the
LOM calls; the three Runbook tools return JSON step-plans that the agent
executes via `mcp__computer-use__*`.

### Stage 1 — Bootstrap

```bash
node ppal.mjs ppal-connect
```

Verify the response contains a non-empty `skills` array and the current Live Set
state. Treat the returned skill text as authoritative instructions for the
remaining stages.

### Stage 2 — Create a target track

```bash
node ppal.mjs ppal-create-track '{
  "type": "midi",
  "name": "Demo Lead",
  "trackIndex": 0
}'
```

The response is `{ id, trackIndex: 0 }` — remember the `id` as `<lead-id>` for
later stages. The Demo Lead is inserted at `trackIndex: 0` so it lands on the
same pixel anchor that `ppal-load-m4l-device` uses as its default drop target
(the first regular track header). Existing tracks shift right.

### Stage 3 — Load a Max-for-Live instrument

```bash
node ppal.mjs ppal-load-m4l-device '{
  "category": "max-instrument",
  "deviceName": "<your-amxd-name>",
  "useArrangementView": false
}'
```

Substitute `<your-amxd-name>` with any `.amxd` you have installed under the
Max-for-Live browser category (e.g. a Pluggo-for-Live device from the Suite
pack, or a user-library device). Standard Live 12 ships without any single
guaranteed-present Max instrument under that exact category, so the demo defers
the choice to the user. The Producer Pal `.amxd` itself is one option
(`category: "user"`).

This call returns a JSON step-plan, **not** a finished device. The agent must
execute the `steps[]` array via `mcp__computer-use__*` to drive Live's Browser →
Track drag-and-drop. The recipe encodes the Welle-3 Settle-Timing lesson (0.55 s
after `mouse_down`, 0.35 s before `mouse_up`) which is mandatory —
`left_click_drag` is too fast for Browser→Track drops and misses regularly.

After executing the steps, verify with:

```bash
node ppal.mjs ppal-read-track '{"trackId":"<lead-id>"}'
```

The track's `devices[]` should now contain one entry. The fail-mode table in the
tool's response covers Browser-pane-closed, category-click-miss, and the
`.amxd`-recompilation-modal cases.

### Stage 4 — Write a MIDI clip

```bash
node ppal.mjs ppal-create-clip '{
  "slot": "0/0",
  "length": "4:0",
  "notes": "C3 1|1 D3 1|2 E3 1|3 G3 1|4",
  "looping": true
}'
```

Use Producer Pal's `bar|beat` notation. The slot `"0/0"` is
`trackIndex/sceneIndex` — the Demo Lead track at index 0 (created in Stage 2),
scene 0. Notes are space-separated; their bar|beat positions can come before or
after the pitch in any order.

Verify the returned clip ID exists. **Do not** trigger playback here — Stage 5
runs Arrangement-Record, which expects the transport stopped. A Session-clip
fire would leave the transport running and break Stage 5's pixel-anchor
assumptions.

### Stage 5 — Arm the track and record the arrangement

Pre-conditions: Live's transport is stopped and Live is in Arrangement view. The
recipe screenshot-verifies the view but **never presses Tab itself** (Tab is a
toggle and unsafe). If Live is still in Session view, press Tab manually before
executing the steps below.

```bash
# Arm the lead track via the LOM tool
node ppal.mjs ppal-update-track '{
  "ids": "<lead-id>",
  "arm": true
}'

# Get the Runbook step-plan for arrangement recording
node ppal.mjs ppal-record-arrangement '{
  "durationSeconds": 8,
  "saveAfter": "save-as",
  "savePath": "/tmp/producer-pal-demo.als",
  "view": "arrangement"
}'
```

`saveAfter: "save-as"` is used (not `save`) because a fresh blank Live Set has
no existing save path — `save` would emit `cmd+s` and Live would open the macOS
save sheet, leaving the recipe hanging on a modal dialog. The `save-as` path
emits `cmd+shift+s` to open the Save-As sheet, then drives the dialog via
`Cmd+Shift+G` (Go-to-folder), enters the parent directory, selects the existing
filename with `Cmd+A`, types the new filename, and confirms — the same helper
that `ppal-render-export` uses for its save sheet.

The Record-Arrangement tool returns a step-plan with:

1. `screenshot` anchor — caller verifies Live is in Arrangement view.
2. `left_click` on the Record button (pixel anchor in the transport bar).
3. `wait 8` seconds.
4. `key space` to stop the transport.
5. Save sequence (only when `saveAfter='save-as'` AND `durationSeconds` AND
   `savePath` are all set):
   - `key cmd+shift+s` — open Save-As sheet
   - `key cmd+shift+g` — open Go-to-folder
   - `type "/tmp"` — parent directory
   - `key Return` — commit parent directory
   - `key cmd+a` — select existing filename
   - `type "producer-pal-demo.als"` — new filename
   - `key Return` — commit save

The agent executes these steps. After execution, verify
`verify.transportShouldBeStopped === true` and `verify.setDirty === false`
(`setDirty` is `false` because the recipe completed the save). If running the
demo a second time, switch to `saveAfter: "save"` (no `savePath`) — the set is
now path-bound and `cmd+s` will save silently.

### Stage 6 — Render the result to WAV

```bash
node ppal.mjs ppal-render-export '{
  "format": "wav",
  "destPath": "/tmp/producer-pal-demo.wav",
  "renderStart": "1.1.1",
  "renderLength": "8.0.0",
  "abletonLocale": "en"
}'
```

The Render-Export tool returns a step-plan that drives Live's Export Audio/Video
dialog (`Cmd+Shift+R`). Eight documented fail-modes cover dialog-doesn't-open,
dropdown-stuck-open, save-sheet-missing, file-exists, beta-bounce-warning,
render-length-zero, save-path-inexistent, and locale-drift. The recipe drives
the macOS save sheet via `Cmd+Shift+G` to type the absolute path.

After execution, verify `/tmp/producer-pal-demo.wav` exists and contains roughly
8 seconds of audio. `file` only checks the container header — use
`afinfo /tmp/producer-pal-demo.wav` (macOS built-in) and check that
`estimated duration` is ≈ 8 s and `audio bytes` is non-zero. A zero-sample
render is one of the documented `failModes` (`Render length zero`).

### Stage 7 — Clean up

```bash
# Disarm the track so the next demo run starts cleanly
node ppal.mjs ppal-update-track '{
  "ids": "<lead-id>",
  "arm": false
}'
```

Leave the Live Set saved. If running the demo as a presentation, you may want to
undo all changes (`Cmd+Z` until the set is back to the prepared baseline) rather
than saving over the baseline.

## What this skill demonstrates

- **Three tool layers compose cleanly**: LOM tools for declarative state
  (track/clip/device), Runbook tools for UI-only workflows (Record, Render,
  M4L-Load).
- **The recipe pattern is uniform**: every Runbook tool returns
  `{steps, failModes, verify, meta}`; the caller is responsible for executing
  steps via `mcp__computer-use__*` and re-invoking the tool on fail-mode match.
- **LOM and Runbook tools share the same `ppal.mjs` CLI**: the agent does not
  need a separate computer-use binding to discover or invoke Runbook tools —
  only to execute the returned step-plans.

## Out-of-scope for this skill

- Genre-specific composition (use `ableton-compose`).
- MIDI mapping, CV routing, external instrument routing — see the STOP-Verdict
  memories for which capabilities are not byte-isolable in the current Live
  version.
- The Welle-1/2 advanced LOM tools (modulation, take-lanes, group-creation,
  envelope writes). They exist and can be added to this demo, but the goal of
  the skill is to show the full end-to-end loop in seven stages, not every
  available capability.

## References

- Feature list: <https://producer-pal.org/features#runbook-tools>
- Runbook-Pattern Memory (Welle-3 lessons): `welle3-runbook-pattern`
- Sibling skills: `producer-pal/`, `ableton-compose/`
