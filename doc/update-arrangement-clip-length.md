# Technical Brief: Arrangement Clip Length Workaround

## Problem Statement

The Live API does not support changing the length of arrangement clips directly.
The `end_time` property is read-only and represents the clip's rightmost edge in
the arrangement. While we can modify internal clip properties like `length` and
`end_marker`, these changes don't affect the actual clip duration in the
arrangement timeline.

## Solution Overview

Implement a delete-and-recreate workaround in the `update-clip` tool that
seamlessly handles length changes for arrangement clips by:

1. Detecting when a length change is requested for an arrangement clip
2. Using direct Live API calls to preserve efficiency
3. Deleting the original clip
4. Creating a new clip with the desired length using the Track's
   `create_midi_clip` method
5. Restoring all properties directly without unnecessary conversions
6. Returning the new clip ID

### Key Advantages of Direct API Approach

- No unnecessary bar|beat conversions (beats → bar|beat → beats)
- Fewer function calls and dependencies
- More control over the exact creation parameters
- Easier to maintain since it's self-contained
- Better performance, especially for clips with many notes

## Implementation Plan

### 1. Detection Logic

In `src/mcp-server/tools/update-clip.js`, add logic to detect when special
handling is needed:

```javascript
// After getting the clip object (using live-api-extensions)
const isArrangementClip = clip.getProperty("is_arrangement_clip") === 1;
const isLengthChange = params.length != null;

if (isArrangementClip && isLengthChange) {
  // Use delete-and-recreate workaround
  return handleArrangementClipLengthChange(clip, params, clipId);
}
```

### 2. Direct Property Access

Instead of converting properties to bar|beat notation, we'll work directly with
the Live API's numeric values:

- Use `getProperty()` from live-api-extensions for single properties (handles
  ?.[0] unwrapping)
- Use `get()` for list properties (returns array of IDs directly)
- Use `JSON.parse(clip.call(...))` for method calls that return data
- Only convert bar|beat notation when parsing user input

This approach is more efficient and avoids unnecessary conversions.

### 3. Delete and Recreate Function (Direct API Approach)

Implement the main workaround function using direct Live API calls:

```javascript
// Import or define MAX_CLIP_BEATS constant from existing code
const MAX_CLIP_BEATS = 999999; // or import from constants

async function handleArrangementClipLengthChange(
  clip,
  updateParams,
  originalClipId,
) {
  // 1. Check if it's an audio clip (unsupported)
  if (clip.getProperty("is_audio_clip") === 1) {
    throw new Error(
      "Changing length of audio arrangement clips is not supported",
    );
  }

  // 2. Get track reference and arrangement position
  const trackPath = getTrackPathForClip(originalClipId);
  if (!trackPath) {
    throw new Error("Could not determine track for arrangement clip");
  }
  const track = new LiveAPI(trackPath);

  // 3. Preserve numeric properties directly (no conversion needed)
  // Using getProperty() from live-api-extensions for cleaner access
  const startTime = clip.getProperty("start_time");
  const color = clip.getProperty("color");
  const name = clip.getProperty("name");
  const startMarker = clip.getProperty("start_marker");
  const loopStart = clip.getProperty("loop_start");
  const looping = clip.getProperty("looping");
  const sigNum = clip.getProperty("signature_numerator");
  const sigDenom = clip.getProperty("signature_denominator");

  // For method calls that return data, parse the JSON string response
  // Following the existing pattern: JSON.parse(clip.call("method_name", ...args))
  // get_notes_extended requires parameters: from_pitch, pitch_span, from_time, time_span
  // Use MAX_CLIP_BEATS constant from existing code for time_span
  const originalNotes = JSON.parse(
    clip.call("get_notes_extended", 0, 127, 0, MAX_CLIP_BEATS),
  );

  // 4. Calculate new length in beats
  const newLengthBeats = parseBarBeatToBeats(updateParams.length);

  // 5. Delete the original clip
  // Note: get() returns array of IDs directly for list properties
  const arrangementClips = track.get("arrangement_clips") || [];
  const clipIndex = arrangementClips.findIndex(
    (id) => id === parseInt(originalClipId),
  );
  if (clipIndex === -1) {
    throw new Error("Clip not found in track's arrangement clips");
  }
  // delete_clip expects the clip's index in the arrangement_clips array
  track.call("delete_clip", clipIndex);

  // 6. Create new clip with desired length
  // create_midi_clip parameters: slot_index, start_time, length_in_beats
  // slot_index -1 means arrangement view
  track.call("create_midi_clip", -1, startTime, newLengthBeats);

  // 7. Get the new clip
  // Note: get() returns array of IDs directly for list properties
  const newArrangementClips = track.get("arrangement_clips");

  // Find the newly created clip
  // IMPORTANT: Verify during implementation whether clips are:
  // a) Always appended to the end of the array, OR
  // b) Ordered by time position in the arrangement
  // This affects how we identify the new clip
  const newClipIndex = newArrangementClips.length - 1;
  const newClipId = newArrangementClips[newClipIndex];
  const trackIndex = getTrackIndexFromPath(trackPath);

  // Alternative approach if clips are time-ordered:
  // const newClipId = newArrangementClips.find(id => !arrangementClips.includes(id));

  const newClip = new LiveAPI(
    `live_set tracks ${trackIndex} arrangement_clips ${newClipIndex}`,
  );

  // 8. Restore properties
  // Note: Check if live-api-extensions has setProperty() method,
  // otherwise use set() directly
  if (updateParams.name ?? name) {
    newClip.set("name", updateParams.name ?? name);
  }
  if (updateParams.color ?? color) {
    newClip.set("color", updateParams.color ?? color);
  }

  // Set time properties (or preserve originals)
  if (updateParams.startMarker || startMarker !== 0) {
    const newStartMarker = updateParams.startMarker
      ? parseBarBeatToBeats(updateParams.startMarker)
      : startMarker;
    newClip.set("start_marker", newStartMarker);
  }

  if (updateParams.loopStart || loopStart !== 0) {
    const newLoopStart = updateParams.loopStart
      ? parseBarBeatToBeats(updateParams.loopStart)
      : loopStart;
    newClip.set("loop_start", newLoopStart);
  }

  newClip.set("looping", updateParams.loop ?? looping);

  // Set time signature if different from default
  if (updateParams.timeSignature) {
    const [num, denom] = updateParams.timeSignature.split("/").map(Number);
    newClip.set("signature_numerator", num);
    newClip.set("signature_denominator", denom);
  } else if (sigNum !== 4 || sigDenom !== 4) {
    newClip.set("signature_numerator", sigNum);
    newClip.set("signature_denominator", sigDenom);
  }

  // 9. Restore or update notes
  if (updateParams.notes) {
    // Use the notes update logic
    await updateClipNotes(
      newClip,
      updateParams.notes,
      updateParams.clearExistingNotes,
    );
  } else if (originalNotes && originalNotes.notes) {
    // Restore original notes - add_new_notes expects the same format
    // that get_notes_extended returns
    // Note: Verify if this needs JSON.stringify() based on existing implementation
    newClip.call("add_new_notes", originalNotes);
  }

  // 10. Return the new clip info
  // Convert beats back to bar|beat for response
  const song = new LiveAPI("live_set");
  const songTimeSignature =
    song.getProperty("signature_numerator") +
    "/" +
    song.getProperty("signature_denominator");

  return {
    id: String(newClipId),
    type: "midi",
    view: "arrangement",
    trackIndex: trackIndex,
    arrangementStartTime: toBarBeat(startTime, songTimeSignature), // Convert beats to bar|beat
    length: updateParams.length, // Already in bar|beat format from user
  };
}
```

### 4. Helper Functions Needed

```javascript
// Get track path for a clip ID by searching all tracks
function getTrackPathForClip(clipId) {
  const song = new LiveAPI("live_set");
  // Get the count of tracks using getcount (returns number directly)
  const trackCount = song.getcount("tracks");

  for (let i = 0; i < trackCount; i++) {
    const track = new LiveAPI(`live_set tracks ${i}`);
    // Note: get() returns array of IDs directly for list properties
    const arrangementClips = track.get("arrangement_clips") || [];

    if (arrangementClips.includes(parseInt(clipId))) {
      return `live_set tracks ${i}`;
    }
  }

  return null;
}

// Get track index from a track path
function getTrackIndexFromPath(trackPath) {
  const match = trackPath.match(/tracks (\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse bar|beat notation to beats (reuse existing parser)
function parseBarBeatToBeats(barBeatString, timeSignature = "4/4") {
  // This should use the existing bar|beat parser from src/bar-beat-parser.js
  // Convert the bar|beat string (e.g., "4:0") to total beats
  // considering the time signature
}

// Convert beats to bar|beat notation (reuse existing converter)
function toBarBeat(beats, timeSignature = "4/4") {
  // This should use the existing beats-to-bar|beat converter
  // from the codebase (likely in utils or similar)
}

// Update clip notes (follow existing pattern from update-clip.js)
async function updateClipNotes(clip, notesString, clearExisting) {
  // Use existing note update logic
  // Look at how update-clip.js handles JSON parsing for note operations
}

// TODO: Consider adding a callMethod() helper to live-api-extensions
// to handle JSON parsing automatically for methods that return data
```

### 5. Edge Cases to Handle

1. **Audio Clips**: Cannot be recreated via API - need to throw clear error
2. **Clip Selection**: The new clip should be selected if the original was
   selected (check if this is possible via API)
3. **Playback State**: If the clip was playing, consider implications
4. **Undo History**: This will create multiple undo steps (delete + create)
5. **Performance**: For clips with many notes, this could be slow
6. **Concurrent Updates**: If multiple clips are being updated, handle
   gracefully
7. **API Call Failures**: Handle potential failures in delete_clip or
   create_midi_clip calls
8. **Notes Parsing**: Verify exact format for JSON parsing/stringifying with
   Live API

### 6. User Communication

Update the tool description to mention this behavior:

```javascript
description: `Updates properties of existing clips by ID. ... 
IMPORTANT: For arrangement clips, changing the length requires recreating the clip 
due to Live API limitations. The clip will be replaced with a new one of the correct 
length, preserving all other properties. The response will include the new clip ID.`;
```

### 7. Testing Requirements

1. Test length increase (4 bars to 6 bars)
2. Test length decrease (4 bars to 2 bars)
3. Test with looping clips
4. Test with non-looping clips
5. Test with clips containing many notes
6. Test with clips at different arrangement positions
7. Test error handling for audio clips
8. Test that all properties are preserved correctly
9. Test clearExistingNotes behavior if applicable
10. Verify create_midi_clip with slot_index=-1 creates arrangement clips
    correctly

### 8. Alternative Considerations

If the delete-and-recreate approach proves problematic, consider:

1. Documenting this as a known limitation
2. Providing a separate tool specifically for this operation
3. Warning users when they attempt to change arrangement clip length
4. Encouraging Session-first workflow for clips that need length flexibility

## Implementation Priority

1. Start with basic delete-and-recreate for MIDI clips
2. Add comprehensive property preservation
3. Add error handling and edge cases
4. Update documentation and tool descriptions
5. Add tests

## Notes for Implementation

- Check existing code for exact JSON.parse/JSON.stringify patterns with Live API
  calls
- Verify that beats-to-bar|beat conversion works correctly for arrangement start
  times
- Consider whether this should be a breaking change or backward compatible
- The performance impact of delete-and-recreate should be measured
- Consider adding a flag to disable this behavior if users prefer explicit
  control
- Future improvement: Add a `callMethod()` helper to live-api-extensions.js to
  handle JSON parsing automatically for methods that return data
