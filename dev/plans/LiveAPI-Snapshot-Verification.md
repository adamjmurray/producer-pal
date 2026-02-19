# LiveAPI Snapshot Verification

## Problem

Our mock system makes many assumptions about Live API behavior: type names,
property return formats, children collection formats, method return values.
These assumptions are based on observation and reverse engineering — there's no
official spec. When assumptions are wrong, unit tests pass but production code
breaks (e.g., the `"id "` prefix bug). We need a systematic way to verify our
abstractions match reality.

## Approach

1. **Snapshot script** — Queries real Ableton Live via `ppal-raw-live-api`,
   captures actual API behavior, writes checked-in JSON snapshot files
2. **Unit tests** — Verify our mocks and abstractions match the snapshots
3. **Manual re-run** — User re-runs the snapshot script when Ableton updates or
   new features are added (not automated)

## What to Capture

For each object type reachable in the test Live Set:

### Per-Type Snapshot

```json
{
  "Song": {
    "path": "live_set",
    "type": "Song",
    "properties": {
      "tempo": { "format": "number", "example": [120.0] },
      "signature_numerator": { "format": "number", "example": [4] },
      "name": { "format": "string", "example": ["e2e-test-set"] },
      "scale_intervals": { "format": "number[]", "example": [0, 2, 3, 5, 7, 8, 10] }
    },
    "children": {
      "tracks": { "format": "id-pairs", "example": ["id", "1", "id", "2"] },
      "scenes": { "format": "id-pairs", "example": ["id", "10", "id", "11"] }
    }
  },
  "Track": {
    "path": "live_set tracks 0",
    "type": "Track",
    "properties": { ... },
    "children": { ... }
  }
}
```

### Object Types to Snapshot

| Type               | Example Path                               |
| ------------------ | ------------------------------------------ |
| Song               | `live_set`                                 |
| Song.View          | `live_set view`                            |
| Application.View   | `live_app view`                            |
| Track (regular)    | `live_set tracks 0`                        |
| Track (return)     | `live_set return_tracks 0`                 |
| Track (master)     | `live_set master_track`                    |
| Scene              | `live_set scenes 0`                        |
| CuePoint           | `live_set cue_points 0`                    |
| ClipSlot (empty)   | `live_set tracks 0 clip_slots 1`           |
| ClipSlot (filled)  | `live_set tracks 0 clip_slots 0`           |
| Clip (MIDI)        | `live_set tracks 0 clip_slots 0 clip`      |
| Clip (audio)       | `live_set tracks 4 clip_slots 0 clip`      |
| Clip (arrangement) | `live_set tracks 0 arrangement_clips 0`    |
| Device             | `live_set tracks 0 devices 0`              |
| MixerDevice        | `live_set tracks 0 mixer_device`           |
| DeviceParameter    | `live_set tracks 0 mixer_device volume`    |
| Chain              | `live_set tracks 0 devices 0 chains 0`     |
| DrumPad            | `live_set tracks 0 devices 0 drum_pads 36` |

### Properties to Query Per Type

For each type, query all properties our code actually uses. Derive the list
from:

- `getPropertyByType()` defaults in `mock-live-api-property-helpers.ts`
- `getProperty()` special cases in `live-api-extensions.ts`
- Properties accessed in production tool code (grep for `.getProperty(`)

### Return Format Classification

Classify each property's `.get()` return value:

- **`"number"`** — `[120.0]` single-element numeric array
- **`"string"`** — `["Track Name"]` single-element string array
- **`"boolean"`** — `[0]` or `[1]` single-element numeric (Live uses 0/1)
- **`"id"`** — `["id", "123"]` two-element ID reference
- **`"id-pairs"`** — `["id", "1", "id", "2", ...]` children collection
- **`"number[]"`** — `[0, 2, 4, 5, 7, 9, 11]` multi-element numeric array
- **`"json-string"`** — `["{...}"]` JSON-encoded string (routing properties)
- **`"empty"`** — `[]` empty array (no children)

## File Structure

```
scripts/generate-live-api-snapshot.ts   # Snapshot generation script
e2e/snapshots/live-api-snapshot.json    # Generated snapshot (checked in)
src/test/mocks/mock-snapshot.test.ts    # Unit tests: mocks vs snapshot
```

## Phase 1: Snapshot Script

**File:** `scripts/generate-live-api-snapshot.ts`

Uses `ppal-client.ts` infrastructure to connect to MCP server and call
`ppal-raw-live-api` for each object type.

**Algorithm:**

1. Open the e2e test Live Set (`e2e/live-sets/e2e-test-set Project/...`)
2. For each object type path: a. Query `info` to get the real type name b. Query
   each known property with `get_property` c. Record the raw return value and
   classify its format d. For children properties, query with `get_property` and
   verify format
3. Write `e2e/snapshots/live-api-snapshot.json`

**Usage:**

```bash
# Requires Ableton Live running with the e2e-test-set open
node scripts/generate-live-api-snapshot.ts
```

**Prerequisite:** The e2e test Live Set must be open. The script should verify
this by checking `live_set` exists before proceeding, and print a clear error if
not.

## Phase 2: Verification Tests

**File:** `src/test/mocks/mock-snapshot.test.ts`

Unit tests that import the snapshot and verify:

### 2a: Type Name Verification

```typescript
it("detectTypeFromPath returns correct type for each snapshot path", () => {
  for (const [typeName, entry] of Object.entries(snapshot)) {
    expect(detectTypeFromPath(entry.path)).toBe(typeName);
  }
});
```

### 2b: Property Format Verification

For each type's properties in the snapshot, verify that the mock's default
return format matches the real format classification:

```typescript
it("mock default properties match real API formats", () => {
  // For each property in the snapshot, verify:
  // - getPropertyByType() returns a value with the correct format
  // - The format (array length, element types) matches the snapshot
});
```

### 2c: Extension Getter Verification

Verify that `live-api-extensions.ts` getters handle the real return formats
correctly:

- `getProperty()` extracts `result[0]` for normal properties
- `getProperty()` returns full array for `scale_intervals`, etc.
- `getChildIds()` handles the `["id", "X", "id", "Y"]` format

### 2d: Children Format Verification

Verify children collection properties return the expected `id-pairs` format in
the snapshot, matching what `getChildIds()` expects.

## Phase 3: Property Coverage Audit

After Phase 2, analyze the snapshot to find:

- Properties the real API exposes that our mocks don't handle
- Properties our mocks default that don't exist in the real API
- Format mismatches (e.g., mock returns `[0]` but real API returns `["string"]`)

This phase is a report/analysis, not necessarily code changes.

## Known Quirks to Verify

These are things we've discovered empirically that the snapshot should confirm:

- `scale_intervals` returns a multi-element array (not wrapped in outer array)
- `available_warp_modes` returns a multi-element array
- Routing properties return JSON-encoded strings
- `duplicate_clip_to_arrangement` returns `["id", number]`
- `end_marker` accepts values beyond file boundaries
- Child collections use alternating `"id"` / value format
- `type` property returns dotted names like `"Song.View"` not `"SongView"`

## Out of Scope

- **Method behavior verification** (e.g., `.call("fire")` side effects) — too
  complex to snapshot, better suited to targeted e2e tests
- **Mutation verification** (e.g., does `.set("name", "X")` stick?) — same
  reason
- **Exhaustive property enumeration** — only verify properties our code uses
- **Automated re-running** — snapshot is manually regenerated by the user
