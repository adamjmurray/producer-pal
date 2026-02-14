# LiveAPI Mock Realism

## Problem

Test mocks diverge from real Live API behavior in ways that can hide bugs. We
recently fixed a real bug where `ppal-select` returned IDs with an `"id "`
prefix (`"id 25"`) while other tools returned raw IDs (`"25"`). The e2e test
caught this, but unit tests didn't because they were written to match the buggy
implementation. This revealed several broader issues.

## Issues Found

### 1. Type Name Inconsistencies in `detectTypeFromPath()`

**File:** `src/test/mocks/mock-live-api-property-helpers.ts:14-18`

The fallback type detector returns simplified names that don't match the real
Live API:

| Mock Type    | Real Type            |
| ------------ | -------------------- |
| `"LiveSet"`  | `"Song"` (verify)    |
| `"SongView"` | `"Song.View"`        |
| `"AppView"`  | `"Application.View"` |

These affect `getPropertyByType()` default property resolution. The
`select-test-helpers.ts` already uses correct types (`"Song.View"`,
`"Application.View"`) — only `detectTypeFromPath()` is wrong.

### 2. `detectTypeFromPath()` Coverage Gaps

Same file, lines 14-27. Missing patterns:

- `live_set return_tracks X` → Track
- `live_set master_track` → Track
- `live_set tracks X devices Y` → Device
- `live_set tracks X mixer_device` → MixerDevice
- `live_set view selected_track` → Track
- `live_set view selected_scene` → Scene
- `live_set view detail_clip` → Clip
- `live_set view highlighted_clip_slot` → ClipSlot
- `live_set cue_points X` → CuePoint
- DeviceParameter paths

### 3. Invalid `"id X"` Paths in ~10 Test Files

Tests register objects with `path: "id clip_123"` or `path: "id track1"`. Real
Live API paths are hierarchical (`"live_set tracks 0"`), never `"id X"`. This
breaks extension getters (`.trackIndex`, `.sceneIndex`, `.category` return
`null`) and forces tests to override properties explicitly, masking bugs.

Files affected:

- `src/tools/control/tests/select-basic.test.ts` (4 instances)
- `src/tools/control/tests/select-advanced.test.ts` (4 instances)
- `src/tools/control/tests/playback-test-helpers.ts` (5 instances)
- `src/test/helpers/cue-point-mock-helpers.ts`
- `src/tools/device/read-device-test-helpers.ts` (6+ instances)
- `src/tools/device/read-device-path.test.ts`
- `src/tools/device/read-device-param-search.test.ts`
- `src/tools/live-set/tests/update-live-set-test-helpers.ts`
- `src/tools/live-set/tests/update-live-set-locator-operations.test.ts`
- `src/tools/clip/update/helpers/update-clip-arrangement-helpers.test.ts`

### 4. Duplicated `toLiveApiId` / `formatId` Functions

Multiple files define the same "ensure id prefix" utility privately:

- `select-helpers.ts:375` — `toLiveApiId()`
- `update-device-wrap-helpers.ts:339` — `formatId()`
- `update-device-helpers.ts:43` — inline
- `capture-scene.ts:38` — inline
- arrangement files — inline `` `id ${clip.id}` ``

### 5. Unrealistic `.get("id")` Handler

`src/tools/control/tests/select-test-helpers.ts:151` — `setupSelectedTrackMock`
has a custom `methods.get` returning `["id ${id}"]` for `.get("id")`. No
production code calls `.get("id")` — IDs use the `.id` property getter.

### 6. Minor Source Code Cleanup

- `playback.ts:327`: `.id.replace(/^id /, "")` — defensive no-op since `.id` is
  already bare
- `arrangement-splitting.ts:209`: `sourceClip.id === "0"` — could use
  `!sourceClip.exists()` instead

## Plan

### Phase 1: Shared ID Formatting Utility

Extract duplicated `toLiveApiId`/`formatId` into a shared utility.

**Create:** `src/tools/shared/id-utils.ts`

```typescript
export function toLiveApiId(id: string | number): string {
  const s = String(id);
  return s.startsWith("id ") ? s : `id ${s}`;
}
```

**Replace private implementations in:**

- `src/tools/control/select-helpers.ts:375-377`
- `src/tools/device/update/update-device-wrap-helpers.ts:339-340`
- `src/tools/device/update/update-device-helpers.ts:43-46`
- `src/tools/scene/capture-scene.ts:38`
- Inline `` `id ${clip.id}` `` patterns in arrangement files

### Phase 2: Fix Mock Type Names

**File:** `src/test/mocks/mock-live-api-property-helpers.ts`

- `"SongView"` → `"Song.View"`
- `"AppView"` → `"Application.View"`
- Verify `"LiveSet"` against real API (likely `"Song"`)
- Update `getPropertyByType()` switch cases to match

### Phase 3: Expand `detectTypeFromPath()`

Same file. Add all missing path patterns listed in Issue 2. Consider logging a
warning for `"id X"` paths to nudge toward realistic paths.

### Phase 4: Path Builder Helpers

**Create:** `src/test/helpers/live-api-path-builders.ts`

```typescript
livePath.track(0); // "live_set tracks 0"
livePath.track(0).device(1); // "live_set tracks 0 devices 1"
livePath.track(0).clipSlot(2); // "live_set tracks 0 clip_slots 2"
livePath.track(0).clipSlot(2).clip(); // "live_set tracks 0 clip_slots 2 clip"
livePath.returnTrack(0); // "live_set return_tracks 0"
livePath.masterTrack(); // "live_set master_track"
livePath.scene(0); // "live_set scenes 0"
```

Optional `registerAtPath()` wrapper combining path building with
`registerMockObject()`.

### Phase 5: Fix Invalid `"id X"` Paths

Replace `path: "id X"` registrations in the ~10 test files listed in Issue 3
with realistic paths (using path builders from Phase 4). Two categories:

- **Objects needing path for extension getters** (tracks, clips, scenes):
  Replace with real hierarchical paths
- **Objects accessed only by ID** (CuePoints, DrumPads): Use realistic paths or
  omit path

### Phase 6: Cleanup

- Remove `.get("id")` handler from `select-test-helpers.ts`
- Remove no-op `.replace(/^id /, "")` in `playback.ts:327`
- Replace `sourceClip.id === "0"` with `!sourceClip.exists()` in
  `arrangement-splitting.ts:209`

## Verification

After each phase:

- `npm run check` (lint + typecheck + format + tests)
- Phases 1-3: No behavior change expected, all tests should pass as-is (with
  test assertion updates for type names in Phase 2)
- Phase 5: Verify extension getters (`.trackIndex`, etc.) now return values from
  paths instead of needing explicit overrides — some tests may need adjusted
  setup

## Out of Scope (Deferred)

**Numeric-only mock IDs:** Real IDs are always numeric integers. Tests use
string IDs like `"track_123"`, `"clip1"`. Changing all ~40+ test files to use
numeric IDs would improve realism but is high effort for low bug-finding value.
New tests should prefer numeric IDs.
