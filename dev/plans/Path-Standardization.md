# Path Standardization

Bringing every clip and device tool onto the one grammar in
[dev/Object-Paths.md](../Object-Paths.md). The settled decisions and the
rejected alternatives are in
[ADR-0025](../decisions/0025-object-path-grammar.md); this file tracks what is
built and what is left.

## Where each tool stands

Location params only. **bold** = published, _italic_ = hidden (alias or
deprecated).

| Tool                                                                           | Today                                                                                 | Target                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| create-clip                                                                    | **path**, _slot_, _trackIndex_, _sceneIndex_, **takeLane**                            | **path** (gains `l`), _takeLane_                    |
| read-clip                                                                      | **clipId**, **path**, _slot_, _trackIndex_, _sceneIndex_                              | unchanged                                           |
| update-clip                                                                    | **ids**, **toPath**, _toSlot_                                                         | **ids**, **path**, **toPath** (gains `l`, fans out) |
| duplicate                                                                      | **id**, **toPath**, _toSlot_, **takeLane**                                            | **id**, **toPath** (gains `l`), _takeLane_          |
| delete                                                                         | **ids**, **path** (devices only)                                                      | **ids**, **path** (clips too)                       |
| playback                                                                       | **ids**, **path**, **sceneIndex**, _slots_                                            | unchanged; `path` tolerates `s3`                    |
| select                                                                         | **id**, **path**, **trackIndex**, **trackType**, **sceneIndex**, _slot_, _devicePath_ | same, `path` reaches `rt0`/`mt`/`s3`                |
| create-device                                                                  | **path**                                                                              | unchanged                                           |
| read-device                                                                    | **deviceId**, **path**                                                                | unchanged                                           |
| update-device                                                                  | **ids**, **path**, **toPath**                                                         | unchanged                                           |
| read-track, read-scene, update-track, update-scene, create-track, create-scene | index params                                                                          | **unchanged — out of scope**                        |

## Phases

Order matters: the parser merge unblocks everything, and take lanes must precede
results or a take-lane clip has no path to report.

### Phase 0 — one parser

Merge
[destination-path.ts](../../src/tools/shared/validation/destination-path.ts) and
[device-path-to-live-api.ts](../../src/tools/shared/device/helpers/path/device-path-to-live-api.ts)
into a single parse → discriminated union → resolve. Add the `l` / `l+`
segments, the `s` root, and the tolerant legacy values. No tool changes.

Fixes by construction: `select path="rt0"` currently answers
`Path must include at least a device index: rt0`, because the return-track case
falls through to the device parser.

### Phase 1 — take lanes

`t0/l<n>` and `t0/l+` on `create-clip` and `duplicate`; `takeLane` demoted to a
hidden alias (`N → l(N-1)`, `0 → no segment`); `takeLaneName` stays published.
`update-clip` can move a take-lane clip via `toPath` — it refuses today.

### Phase 2 — results

`formatSlot` → `formatPath`, one chokepoint, six production call sites. Clip
results emit `path` and drop `slot` and `trackIndex`. code-exec's `location`
becomes `{ view, path?, arrangementStart? }`. Error messages stop naming
`trackIndex`/`sceneIndex`.

Breaking, and the release notes need to say so. Downstream: `slotToPath()` in
`evals/scenarios/defs/clip/helpers/clip-scenario-helpers.ts` deletes itself,
`correctSlotAssertion` in `notation-matrix.ts`, `CreateClipResult.slot` in
`e2e/mcp/mcp-test-helpers.ts`, the `location` shape in
`src/skills/fragments/transforms/code-transforms.ts`.

### Phase 3 — reach

`path` addressing on `update-clip` and `delete` for clips, removing
read-then-update round trips. Additive; nothing is unpublished.

Two behavior fixes land here:

- `update-clip`'s `toPath` fans out (`ids[i] → toPath[i]`) instead of taking the
  first entry and warning. Today `{ids:"63,72", toPath:"t15/s6,t15/s7"}` puts
  both clips in one slot and destroys the first.
- `duplicate` stops throwing on a session slot plus `arrangementStart`. It warns
  only when **no** entry in `toPath` is an arrangement destination — with a
  mixed list, `arrangementStart` legitimately applies to the bare-track entries.

### Phase 4 — measure and schedule removal

Eval the interface against 2.1.0, then set removal releases for the deprecated
params (`slot`, `slots`, `toSlot`, `devicePath`, `takeLane`). The permanent
aliases (`trackIndex`, `sceneIndex` on clip tools) stay. `formatSlot` /
`parseSlot` / `parseSlotList` retire with the deprecated params, not before.

## Docs to update as the phases land

Skills fragments (`arrangement.ts`, `devices/devices.ts`,
`transforms/code-transforms.ts`) and the regenerated
[skills snapshots](../skills-snapshots/); `docs/features/tools.md`; the
generated tool schemas under `docs/_generated/`.
