# Track Folding Feature - Future Enhancement

## Overview

Track folding/unfolding is a complex feature that affects track visibility and
organization in Ableton Live. This document outlines the relevant Live API
properties and considerations for potential future implementation.

## Live API Properties & Functions

### Track Properties

- **`fold_state`** (read/write) - Controls whether a group track is folded
  - 0 = tracks within the Group Track are visible
  - 1 = Group Track is folded and the tracks within are hidden
- **`is_foldable`** (read-only) - Whether the track can be folded
  - Currently true for Group Tracks
  - Note: Instrument and Drum Racks return 0 although they can be opened/closed
    (API limitation)

- **`is_visible`** (read-only) - Whether track is visible
  - False if track is hidden inside a folded Group Track
  - True if track is scrolled out of view (still considered "visible")

- **`visible_tracks`** vs **`tracks`**
  - `tracks` - All tracks in the set
  - `visible_tracks` - Only tracks not hidden by folded groups

### Track.View Properties

- **`is_collapsed`** (read/write) - Arrangement View specific
  - 1 = track collapsed, 0 = track opened
  - Appears to control track height in Arrangement View, not group folding
  - Needs investigation to understand exact behavior

## Complexity Considerations

1. **Cascading Effects**
   - Folding a group track affects visibility of all child tracks
   - May affect deeply nested groups (groups within groups)
   - Changes the indices in `visible_tracks` list

2. **View Differences**
   - Session View: Group folding affects track visibility
   - Arrangement View: Additional `is_collapsed` state for track height

3. **State Management**
   - Need to track both fold state and visibility state
   - Folding state persists when switching between views

## Why This Was Deferred

1. **Scope** - View tools already comprehensive without folding
2. **Conceptual fit** - Folding is more about track organization than view state
3. **Complexity** - Cascading effects make this more complex than simple view
   changes
4. **Priority** - Current view tools solve the immediate workflow interruption
   problem

## Potential Implementation Approaches

### Option 1: Extend Existing Tools

- Add fold operations to `ppal-update-track` (since it's a track property)
- Add visibility info to `ppal-read-track` or `ppal-read-song`

### Option 2: Dedicated Folding Tool

- `ppal-track-organization` or similar
- Could handle folding, track ordering, and other organizational features

### Option 3: Limited View Tool Support

- Only add `is_collapsed` to `update-view` for Arrangement track height
- Leave group folding to track-level tools

## Example Use Cases

1. **Collapse all groups** - Clean up a complex project
2. **Show specific group contents** - Focus on editing within a group
3. **Save/restore fold states** - Return to a known project organization
4. **Smart folding** - Fold all groups except the one containing selected track

## Open Questions

1. What exactly does `Track.View.is_collapsed` control?
2. How do nested groups behave with folding?
3. Should folding operations auto-select the group track?
4. How should this interact with track selection in view tools?

## Recommendation

Start with Option 3 (limited support) if users need Arrangement track height
control. Full group folding support should be carefully designed as a separate
feature, possibly as part of a broader track organization toolset.
