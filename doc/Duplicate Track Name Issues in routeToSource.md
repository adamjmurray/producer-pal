## Duplicate Track Name Issues in routeToSource

### Current Behavior

When using the `duplicate` tool's `routeToSource` feature with tracks
having.duplicate track names, the code uses `.find()` which returns the first
match, potentially routing to the wrong track.

### Example Problem

```
Track 0: "Synth" (ID: 123)
Track 2: "Synth" (ID: 456)

Duplicating Track 2 with routeToSource will incorrectly route to Track 0.
```

### Root Cause

The routing options in Live API only provide `display_name` and `identifier`,
not the track ID or index. With duplicate names, we cannot directly identify
which routing option corresponds to our source track.

### Potential Solution

Track IDs and routing IDs follow creation order. We could match duplicate names
by position in the routing list based on creation order:

1. Get all tracks with the same name
2. Sort by ID (creation order)
3. Find source track's position
4. Use that position to select the correct routing option

### Implementation Challenges

- `duplicate.js` doesn't have access to all tracks
- Would need to pass additional context or add a helper function
- Adds complexity for an edge case

### Current Mitigation

- Warning in routeToSource parameter description
- Tips in track name parameter descriptions
- Encourage users to maintain unique track names

### Future Considerations

- Could add a `find-track-by-name` helper that warns about duplicates
- Could enhance routing operations to detect and warn about ambiguity
- Consider requiring track IDs instead of names for routing operations
