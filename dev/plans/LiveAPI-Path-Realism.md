# LiveAPI Path Realism Audit Plan

## Problem

Test mocks use hand-typed Live API paths (e.g., `"live_set tracks 0 devices 0"`)
and arbitrary IDs (e.g., `"123"`, `"456"`). These may be internally consistent
within a test but don't necessarily reflect real Live API behavior:

- Path formats may not match what Ableton actually returns
- Parent-child relationships may not be structurally valid (e.g., a clip
  registered under a path that doesn't correspond to its track)
- IDs in tests are arbitrary numbers that don't reflect Live's ID assignment
- Property values in mocks may not match real defaults

The mock registry migration made this easier to fix (paths are declared once per
object) but didn't address the underlying accuracy.

## Goals

1. **Audit** existing test paths against real Live API behavior
2. **Identify** junk/placeholder paths that aren't realistic
3. **Build helpers** that make correct paths easy and incorrect paths hard
4. **Document** the canonical path formats for reference

## Phase 1: Capture Ground Truth

Use `ppal-client` or `ppal-raw-live-api` against a real Live Set to dump the
actual object graph:

- Open a test Live Set with known structure (tracks, clips, devices, scenes)
- Traverse the object tree and record: path, ID, type, key property values
- Save as a reference snapshot

This gives a source of truth for what paths look like, what types objects have,
and what IDs look like in practice.

## Phase 2: Path Builder Helpers

Create helpers that generate paths by construction rather than string
concatenation:

```typescript
// Proposed API
const paths = livePath.track(0);
// paths.path → "live_set tracks 0"
// paths.device(1).path → "live_set tracks 0 devices 1"
// paths.clipSlot(2).path → "live_set tracks 0 clip_slots 2"
// paths.clipSlot(2).clip.path → "live_set tracks 0 clip_slots 2 clip"
// paths.arrangementClip(3).path → "live_set tracks 0 arrangement_clips 3"
```

Benefits:

- Paths are correct by construction — no typos or inconsistencies
- Auto-generates deterministic IDs from the path
- Integrates with `registerMockObject()` to reduce setup boilerplate
- Makes tests self-documenting (the path structure is visible in the builder
  chain)

## Phase 3: Registry Validation

Add optional structural validation to `registerMockObject()`:

- Warn if a child path doesn't match its parent's path prefix
- Warn if an object's type doesn't match what's expected for its path position
  (e.g., a "Clip" at a track path)
- Validate that referenced child IDs actually exist in the registry

This could be opt-in (enabled via a flag or in strict test suites) to avoid
breaking existing tests during the transition.

## Phase 4: Audit and Fix Existing Tests

With path builders and ground truth in hand:

- Grep for hand-typed path strings in test files
- Replace with path builder calls
- Verify each test's object graph matches a realistic Live Set structure
- Flag tests using IDs like `"123"` that could be replaced with
  builder-generated IDs

## Priority

This is lower urgency than the mutation testing audit — incorrect paths don't
currently cause test failures (since the mocks accept any path). But it improves
test fidelity and makes it easier to catch real bugs where path handling matters
(e.g., track index extraction, device navigation, arrangement clip operations).
