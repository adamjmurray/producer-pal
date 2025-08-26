# Better State Sync: Technical Roadmap

## Current State

User education approach (tool description instructions) is implemented and
working well. This document outlines future technical improvements for more
robust state synchronization.

## Problem Statement

- Object IDs remain stable when tracks/clips move in Ableton Live
- Object paths and indices (trackIndex, clipSlotIndex, sceneIndex) change when
  moved
- Current tools rely heavily on indices from the initial `ppal-read-song` state
- No automatic re-sync mechanism exists, leading to operations on wrong objects

## Solution 1: ID-First Operations (High Priority)

### Goal

Make all tools prioritize IDs over indices for reliability

### Implementation

```javascript
// Phase out this pattern:
updateClip({ trackIndex: 0, clipSlotIndex: 2, ... })

// Enforce this pattern:
updateClip({ clipId: "clip_12345", ... })
```

### Required Changes

1. **Update all tools to prefer ID parameters**

   ```javascript
   // Example: update-clip.js
   export function updateClip({ clipId, trackIndex, clipSlotIndex, ... }) {
     if (clipId) {
       // Primary path: use ID directly
       clip = LiveAPI.from(clipId);
       if (!clip.exists()) throw new Error(`Clip ${clipId} not found`);
     } else if (trackIndex != null && clipSlotIndex != null) {
       // Legacy path: use indices with deprecation warning
       console.warn("Using indices is deprecated, prefer clipId");
       clip = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`);
     }
   }
   ```

2. **Add helper function to find objects by ID**

   ```javascript
   // src/utils/find-by-id.js
   export function findObjectById(id, type) {
     const object = LiveAPI.from(id);
     if (!object.exists()) return null;

     // Extract current location from path
     const location = {
       id,
       type,
       path: object.path,
     };

     if (type === "clip") {
       location.trackIndex = object.trackIndex;
       location.clipSlotIndex = object.clipSlotIndex;
       location.isArrangement = object.getProperty("is_arrangement_clip") > 0;
     }
     // Similar for tracks, scenes...

     return location;
   }
   ```

3. **Deprecation timeline**
   - v1.0: Add ID support to all tools, keep index support
   - v1.1: Log warnings when indices used
   - v2.0: Remove index-only operations

## Solution 2: Lightweight Object Validation (Medium Priority)

### Goal

Quick validation before operations to detect moved objects

### Implementation

```javascript
// New tool: validate-objects
export function validateObjects({ clips = [], tracks = [], scenes = [] }) {
  const results = {
    valid: [],
    moved: [],
    missing: [],
  };

  // Check each clip
  for (const clipCheck of clips) {
    const { id, expectedTrackIndex, expectedClipSlotIndex } = clipCheck;
    const clip = LiveAPI.from(id);

    if (!clip.exists()) {
      results.missing.push({ id, type: "clip" });
    } else if (
      clip.trackIndex !== expectedTrackIndex ||
      clip.clipSlotIndex !== expectedClipSlotIndex
    ) {
      results.moved.push({
        id,
        type: "clip",
        from: {
          trackIndex: expectedTrackIndex,
          clipSlotIndex: expectedClipSlotIndex,
        },
        to: { trackIndex: clip.trackIndex, clipSlotIndex: clip.clipSlotIndex },
      });
    } else {
      results.valid.push({ id, type: "clip" });
    }
  }

  return results;
}
```

### Usage Pattern

```javascript
// Before bulk operations
const validation = validateObjects({
  clips: [
    { id: "clip_123", expectedTrackIndex: 0, expectedClipSlotIndex: 2 },
    { id: "clip_456", expectedTrackIndex: 1, expectedClipSlotIndex: 3 },
  ],
});

if (validation.moved.length > 0) {
  // Inform user and suggest refresh
  return {
    error: "Objects have moved",
    details: validation,
    suggestion: "Call ppal-read-song to refresh state",
  };
}
```

## Solution 3: Smart Error Recovery (High Priority)

### Goal

Provide actionable error messages when objects have moved

### Implementation

```javascript
// Enhanced error handling in tools
export function updateClip({ trackIndex, clipSlotIndex, clipId, ...params }) {
  let clip;

  if (trackIndex != null && clipSlotIndex != null) {
    clip = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`,
    );

    if (!clip.exists() && clipId) {
      // Try to find by ID as fallback
      const clipById = LiveAPI.from(clipId);
      if (clipById.exists()) {
        // Provide detailed error with current location
        throw new Error(
          `Clip "${clipId}" has moved from track ${trackIndex}, slot ${clipSlotIndex}. ` +
            `It's now at track ${clipById.trackIndex}, slot ${clipById.clipSlotIndex}. ` +
            `Use clipId directly or call ppal-read-song to refresh the state.`,
        );
      }
    }
  }

  // Continue with operation...
}
```

## Solution 4: Incremental State Updates (Low Priority)

### Goal

Track changes without full re-read

### Conceptual Implementation

```javascript
// New tool: get-changes-since
export function getChangesSince({ snapshot }) {
  // Compare current state with snapshot
  // Return only changed objects
  // This is complex and may require Live API observer patterns
}
```

### Challenges

- Live API doesn't provide native change detection
- Would require maintaining state snapshots
- Complex to implement reliably

## Solution 5: Automatic ID Resolution (Future)

### Goal

Transparently handle moved objects

### Concept

```javascript
// Wrapper that auto-resolves IDs
class SmartLiveAPI {
  constructor(pathOrId) {
    if (pathOrId.startsWith("id ")) {
      this.api = LiveAPI.from(pathOrId);
    } else if (pathOrId.includes("tracks") || pathOrId.includes("scenes")) {
      // Path-based construction with ID fallback
      this.api = new LiveAPI(pathOrId);
      if (!this.api.exists()) {
        // Try to find by cached ID mapping
        const cachedId = this.getCachedId(pathOrId);
        if (cachedId) {
          this.api = LiveAPI.from(cachedId);
        }
      }
    }
  }
}
```

## Implementation Roadmap

### Phase 1 (Immediate)

1. ✅ Update tool descriptions for user education (done)
2. Add ID support to all modification tools
3. Update tool descriptions to emphasize ID usage

### Phase 2 (Next Release)

1. Implement smart error recovery
2. Add `findObjectById` utility
3. Start logging deprecation warnings for index-only usage

### Phase 3 (Future)

1. Implement `validate-objects` tool
2. Remove index-only operations
3. Consider automatic ID resolution layer

## Benefits of This Approach

1. **Backward Compatible** - Existing workflows continue to work
2. **Progressive Enhancement** - Each phase adds value independently
3. **User Education** - Errors guide users to better patterns
4. **Future Proof** - Sets foundation for fully automated solutions

## Testing Strategy

```javascript
// Test moved object handling
describe("Moved Object Handling", () => {
  it("should find clip by ID after move", () => {
    const clipId = createClip({ trackIndex: 0, clipSlotIndex: 0 });
    moveClip(clipId, { toTrack: 2, toSlot: 3 });

    const result = updateClip({ clipId, name: "Moved Clip" });
    expect(result.trackIndex).toBe(2);
    expect(result.clipSlotIndex).toBe(3);
  });

  it("should provide helpful error when using stale indices", () => {
    const clipId = createClip({ trackIndex: 0, clipSlotIndex: 0 });
    moveClip(clipId, { toTrack: 2, toSlot: 3 });

    expect(() => {
      updateClip({ trackIndex: 0, clipSlotIndex: 0, name: "Test" });
    }).toThrow(/has moved from track 0, slot 0.*now at track 2, slot 3/);
  });
});
```
