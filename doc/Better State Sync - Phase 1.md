# Better State Sync: Phase 1

A short-term Plan to More Robustly Handle Content (Clips, Tracks, etc) that move
around during a Producer Pal session

# read-song Tool Description

Replace the current description in `src/mcp-server/add-tool-read-song.js` with:

```javascript
description: "Read comprehensive information about the Live Set (via Ableton Producer Pal) including global settings and all tracks. " +
  "Track objects include clip arrays with time-based properties in bar|beat format. " +
  "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback. " +
  "If the user asks to play with Ableton Live, start here and call this automatically. " +
  "IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting, or rearranging objects, " +
  "immediately call read-song again before any other operations. " +
  "INSTRUCTION: During the first read-song call in a session, tell the user something like: " +
  "'I can see your Live Set structure. If you move or rearrange any tracks, clips, or scenes during our session, just let me know and I'll refresh my view.' " +
  "INSTRUCTION: If any operation fails with 'not found' or 'doesn't exist' errors, ask the user: " +
  "'Have you moved or deleted any tracks/clips since we started? If so, I can refresh my view of your Live Set.'";
```

## Key Elements:

1. **Base functionality description** - What the tool does
2. **IMPORTANT behavior** - Claude should re-read when user mentions moving
   things
3. **INSTRUCTION #1** - Proactive communication on first use
4. **INSTRUCTION #2** - Reactive communication on errors

This pattern clearly separates:

- What Claude needs to understand (IMPORTANT)
- What Claude needs to say to users (INSTRUCTION)

---

# Additional Tool Description Updates

## update-clip Tool Description Addition

Add to the existing description in `src/mcp-server/add-tool-update-clip.js`:

```javascript
"IMPORTANT: This operation uses track/clip indices that may become stale if the user rearranges their session. " +
  "INSTRUCTION: If this operation fails with 'clip not found' or similar error, ask the user: " +
  "'Have you moved this clip to a different track or slot? I can refresh my view of your Live Set to find it.'";
```

## create-clip Tool Description Addition

Add to the existing description in `src/mcp-server/add-tool-create-clip.js`:

```javascript
"Returns a stable clip ID that persists even if clips are moved. " +
  "INSTRUCTION: When creating multiple clips across a session, occasionally remind users: " +
  "'Remember, if you rearrange your clips, just let me know so I can track their new positions.'";
```

## Pattern Summary

The pattern for all tool descriptions:

- **IMPORTANT:** - Technical behavior Claude must understand
- **INSTRUCTION:** - Specific user communication with when/what
- **Returns/Note:** - Technical details about the response

## Bonus: read-track Tool Description Update

For consistency, also update `src/mcp-server/add-tool-read-track.js`:

```javascript
"IMPORTANT: Track indices can change if tracks are reordered. The returned track ID remains stable. " +
  "INSTRUCTION: If unable to find a track at the expected index, inform the user: " +
  "'It looks like track positions may have changed. Let me refresh the Live Set structure.' Then call read-song.";
```
