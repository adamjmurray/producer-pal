# Enhanced NUX via First read-song Call

## Current Proposal (Minimal)

Just the movement/refresh workflow tip as discussed.

## Enhanced Proposal (Full NUX)

Add comprehensive onboarding to the `read-song` tool description:

```javascript
// src/mcp-server/add-tool-read-song.js
description: "Read comprehensive information about the Live Set (via Ableton Producer Pal) including global settings and all tracks. " +
  "Track objects include clip arrays with time-based properties in bar|beat format. " +
  "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback. " +
  "If the user asks to play with Ableton Live, start here and call this automatically. " +
  "IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting, or rearranging objects, " +
  "immediately call read-song again before any other operations. " +
  "INSTRUCTION: During the first read-song call in a NEW session, provide a brief welcome that includes: " +
  "(1) 'I can see your Live Set! I can help you create and edit MIDI clips, manage tracks and scenes, and build musical ideas.' " +
  "(2) 'Quick tip: Always save your work - I can modify and delete things in your project.' " +
  "(3) 'If you move or rearrange tracks/clips/scenes, just let me know so I can stay in sync.' " +
  "(4) 'Try asking me to create a drum beat, bassline, or melody to get started!' " +
  "Keep this welcome concise and conversational. In subsequent sessions, skip the full welcome but still mention tip (3) about staying in sync.";
```

## Alternative: Progressive Disclosure

Instead of everything at once, reveal tips contextually:

```javascript
"INSTRUCTION: During the first read-song call in a session: " +
  "- If the Live Set is empty, say: 'I see you're starting fresh! I can help you create tracks, add MIDI clips, and build your song. Want me to start with a drum beat?' " +
  "- If the Live Set has content, say: 'I can see your Live Set structure. I can help you add to what you've got, edit existing clips, or create new musical ideas. If you move things around, just let me know!' " +
  "- If there are 10+ tracks, add: 'That's a lot of tracks! I work best when you're specific about which tracks to modify.' " +
  "INSTRUCTION: On first clip creation, mention: 'Remember to save your project - you can always undo in Live if you don't like changes.' " +
  "INSTRUCTION: On first error, add: 'If that didn't work as expected, try being more specific or let me know what went wrong.'";
```

## Tiered Approach

### Phase 1: Minimal (Ship Now)

Just the movement/sync tip as already planned

### Phase 2: Safety & Core Features (Next Release)

Add save reminder and basic capabilities:

```javascript
"INSTRUCTION: During first read-song, briefly mention: " +
  "(1) 'I can help create and edit MIDI clips, manage tracks and scenes.' " +
  "(2) 'Remember to save your work regularly!' " +
  "(3) 'Let me know if you move things around so I can stay in sync.'";
```

### Phase 3: Full Progressive NUX (Future)

Context-aware tips based on Live Set state, user actions, and errors

## What NOT to Include

Based on README analysis, these are too detailed for first contact:

- Specific music theory examples
- Advanced notation syntax
- Technical limitations (audio clips, device management)
- API details or version requirements

## Benefits of This Approach

1. **Discovery moment** - Users engaged and ready to learn
2. **Context-aware** - Tips relevant to their current state
3. **Non-intrusive** - Brief, conversational, skippable
4. **Progressive** - Learn features as needed, not all at once
5. **Safety first** - Save reminder prevents data loss

## Testing the Experience

Consider these user journeys:

1. **Brand new user** → Welcome + safety + basic prompt ideas
2. **User with existing project** → Capabilities + sync tip
3. **Power user** → Just sync tip (via future preferences)
4. **User who hits error** → Contextual help

## Future Integration with Customization

This naturally leads to the Phase 2 global context from the Customization
Roadmap:

```
# After several sessions, user could save this preference:
"Skip Producer Pal tips - I know to save often and mention when I move things"
```

Users graduate from automatic tips to customized preferences.
