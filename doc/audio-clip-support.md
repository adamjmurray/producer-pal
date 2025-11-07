# Audio Clip Support Implementation Plan

## Overview

Add read/update support for audio clips in Producer Pal. This extends the
existing clip tools to handle audio clip properties while maintaining API
consistency.

## Scope

### In Scope

- Read audio clip metadata and audio-specific properties
- Update audio clip gain and pitch shift
- Maintain symmetry with MIDI clip defaults (include audio-info by default)

### Out of Scope (Future)

- Create audio clips (requires invasive file path handling)
- Warp markers (complex, UI-heavy feature)
- Warp mode, warping boolean, RAM mode (defer to v2)

## Design Decisions

### 1. File Privacy

- **Expose**: `filename` only (e.g., "kick.wav")
- **Hide**: Full `file_path`
- **Rationale**: Avoid exposing private directory structures

### 2. Pitch Parameter

- **Expose**: Single `pitchShift` in semitones (-48 to 48, supports decimals
  like -2.5 or 2.337)
- **Implementation**: Split on write
  - Integer part → `pitch_coarse`
  - Decimal part × 100 → `pitch_fine`
- **Rationale**: Simpler API, one parameter instead of two
- **Note**: Live auto-normalizes values (e.g., coarse=3, fine=75 becomes
  coarse=4, fine=-25)

### 3. Include Defaults

- MIDI clips: `includeClipNotes: true` (existing)
- Audio clips: `includeAudioInfo: true` (new, matches MIDI symmetry)

### 4. API Methods

- **Use**: `clip.set(property, value)` for setting properties
- **Avoid**: `clip.setProperty(property, value)` - doesn't work for audio clip
  properties

## Testing Findings

### Properties Verified

- `gain`: float (0-1 range, 0.7 = +12dB) ✓
- `gain_display_string`: string, read-only (e.g., "12.0 dB") ✓
- `file_path`: string, full path ✓
- `pitch_coarse`: int, semitones ✓
- `pitch_fine`: **float** (not int), -50 to +49 range, accepts decimals (e.g.,
  33.7) ✓
- `sample_length`: int, sample count ✓
- `sample_rate`: float, Hz ✓

### Pitch Behavior

- `pitch_fine` is a **float**, supporting decimal values
- Live normalizes pitch when `pitch_fine` exceeds ±50
- Example: Setting coarse=3, fine=75 results in coarse=4, fine=-25 (same 3.75
  semitones)

## File Changes

### 1. `src/tools/shared/include-params.js`

**Add to `ALL_INCLUDE_OPTIONS.clip` (line ~17):**

```javascript
clip: ["clip-notes", "audio-info", "color"],
```

**Add to `READ_CLIP_DEFAULTS` (line ~31):**

```javascript
export const READ_CLIP_DEFAULTS = {
  includeClipNotes: true,
  includeAudioInfo: true, // NEW
  includeColor: false,
};
```

**Add to `parseIncludeArray` return object (line ~120):**

```javascript
const result = {
  // ... existing flags
  includeAudioInfo: includeSet.has("audio-info"), // NEW
};
```

**Add to empty array return (line ~140):**

```javascript
return {
  // ... existing false values
  includeAudioInfo: false, // NEW
};
```

**Add to `includeArrayFromFlags` function (line ~170):**

```javascript
if (includeFlags.includeAudioInfo) {
  includes.push("audio-info");
}
```

### 2. `src/tools/clip/read-clip_def.js`

**Update include parameter enum (line ~16):**

```javascript
include: z
  .array(z.enum(["clip-notes", "audio-info", "color"]))  // Added "audio-info"
  .default(["clip-notes", "audio-info"])  // Updated default
  .describe("omit MIDI notes/audio info with empty array"),
```

**Update description (line ~5):**

```javascript
description: "Read clip settings, MIDI notes, and audio properties",
```

### 3. `src/tools/clip/read-clip.js`

**Update parseIncludeArray destructuring (line ~25):**

```javascript
const { includeClipNotes, includeAudioInfo, includeColor } = parseIncludeArray(
  args.include,
  READ_CLIP_DEFAULTS,
);
```

**Add audio info block after line 151 (after MIDI notes block):**

```javascript
if (result.type === "audio" && includeAudioInfo) {
  result.gain = clip.getProperty("gain");
  result.gainDisplay = clip.getProperty("gain_display_string");

  const filePath = clip.getProperty("file_path");
  if (filePath) {
    // Extract just filename, handle both Unix and Windows paths
    result.filename = filePath.split(/[/\\]/).pop();
  }

  const pitchCoarse = clip.getProperty("pitch_coarse");
  const pitchFine = clip.getProperty("pitch_fine");
  result.pitchShift = pitchCoarse + pitchFine / 100;

  result.sampleLength = clip.getProperty("sample_length");
  result.sampleRate = clip.getProperty("sample_rate");
}
```

### 4. `src/tools/clip/update-clip_def.js`

**Add new optional parameters after loopStart (line ~25):**

```javascript
// Existing parameters...
loopStart: z
  .string()
  .optional()
  .describe("bar|beat position of loop start"),

// NEW audio-only parameters
gain: z
  .number()
  .min(0)
  .max(1)
  .optional()
  .describe("audio clip gain 0-1 (ignored for MIDI)"),
pitchShift: z
  .number()
  .min(-48)
  .max(48)
  .optional()
  .describe("audio clip pitch shift in semitones, supports decimals (ignored for MIDI)"),

// Existing parameters...
notes: z
  .string()
  .optional()
  .describe(
    "MIDI notes in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s)",
  ),
```

**Update description (line ~5):**

```javascript
description: "Update clip(s), MIDI notes, and audio properties",
```

### 5. `src/tools/clip/update-clip.js`

**Update function JSDoc (top of file):**

```javascript
/**
 * Update a MIDI or audio clip
 * @param {Object} args - Arguments for the function
 * @param {string} args.ids - Comma-separated clip IDs
 * @param {string} [args.name] - Clip name
 * @param {string} [args.color] - Clip color (#RRGGBB)
 * @param {string} [args.length] - Duration (beats or bar:beat)
 * @param {boolean} [args.loop] - Looping enabled
 * @param {string} [args.loopStart] - Loop start position (bar|beat)
 * @param {string} [args.startMarker] - Start marker position (bar|beat)
 * @param {string} [args.timeSignature] - Time signature (N/D)
 * @param {number} [args.gain] - Audio clip gain (0-1)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.notes] - MIDI notes in bar|beat notation
 * @param {"replace" | "merge"} args.noteUpdateMode - Note update mode
 * @returns {Promise<{ids: string[], message: string}>}
 */
```

**Extract audio parameters from args (line ~20):**

```javascript
const {
  ids,
  name,
  color,
  length,
  loop,
  loopStart,
  startMarker,
  timeSignature,
  gain, // NEW
  pitchShift, // NEW
  notes,
  noteUpdateMode,
} = args;
```

**Add audio parameter handling before notes update (around line 80):**

```javascript
// Update common properties for all clip IDs
for (const clipId of clipIds) {
  const clip = validateIdType(clipId, "clip", "updateClip");
  const isAudioClip = clip.getProperty("is_audio_clip") > 0;

  // ... existing common property updates (name, color, length, loop, etc.)

  // Audio-specific parameters (only for audio clips)
  if (isAudioClip) {
    if (gain !== undefined) {
      clip.set("gain", gain);
    }

    if (pitchShift !== undefined) {
      const pitchCoarse = Math.floor(pitchShift);
      const pitchFine = Math.round((pitchShift - pitchCoarse) * 100);
      clip.set("pitch_coarse", pitchCoarse);
      clip.set("pitch_fine", pitchFine);
    }
  }

  // ... continue with existing MIDI note handling
}
```

### 6. Update Producer Pal Skills

**In `src/skills/standard.js`:**

Add to the section about clips (search for "MIDI Syntax" or "Creating Music"):

```markdown
## Audio Clips

Audio clips support gain and pitch adjustment:

**Reading Audio Clips:**

- By default, `read-clip` returns audio properties: `filename`, `gain`,
  `gainDisplay`, `pitchShift`, `sampleLength`, `sampleRate`
- Use `include: []` to omit audio properties
- `pitchShift` is in semitones (e.g., -2.5 = down 2.5 semitones)

**Updating Audio Clips:**

- `gain`: 0-1 range (0.5 ≈ -6dB, 0.7 ≈ +12dB)
- `pitchShift`: -48 to +48 semitones, supports decimals
- These parameters are ignored for MIDI clips (no error)

**Example:**
```

read-clip with audio-info: { id: "id 456", type: "audio", name: "Kick", gain:
0.7, gainDisplay: "12.0 dB", filename: "kick.wav", pitchShift: -2.5,
sampleLength: 44100, sampleRate: 44100 }

update-clip gain=0.5 pitchShift=-3

```

```

## Return Data Examples

### MIDI Clip (unchanged)

```javascript
{
  id: "id 123",
  type: "midi",
  name: "MIDI 1",
  view: "session",
  trackIndex: 0,
  sceneIndex: 0,
  loop: true,
  length: "4|1",
  startMarker: "1|1",
  loopStart: "1|1",
  timeSignature: "4/4",
  noteCount: 8,
  notes: "1|1 v100 C3 E3 G3"
}
```

### Audio Clip (with audio-info, default)

```javascript
{
  id: "id 456",
  type: "audio",
  name: "Audio 1",
  view: "session",
  trackIndex: 1,
  sceneIndex: 0,
  loop: true,
  length: "4|1",
  startMarker: "1|1",
  loopStart: "1|1",
  timeSignature: "4/4",
  gain: 0.5,
  gainDisplay: "-6.0 dB",
  filename: "kick.wav",
  pitchShift: -2.5,
  sampleLength: 44100,
  sampleRate: 44100
}
```

### Audio Clip (without audio-info)

```javascript
{
  id: "id 456",
  type: "audio",
  name: "Audio 1",
  view: "session",
  trackIndex: 1,
  sceneIndex: 0,
  loop: true,
  length: "4|1",
  startMarker: "1|1",
  loopStart: "1|1",
  timeSignature: "4/4"
}
```

## Testing Checklist

### Manual Testing

1. ✓ Create audio track with audio clip (already done)
2. Read audio clip with default includes → verify audio-info present
3. Read audio clip with `include: []` → verify no audio-info
4. Read audio clip with `include: ["audio-info"]` → verify audio-info present
5. Update audio clip gain → verify change in Live
6. Update audio clip pitch shift with decimal (e.g., -2.5) → verify both coarse
   and fine adjust correctly
7. Update audio clip pitch shift at boundaries (-48, 48) → verify works
8. Update audio clip with MIDI-only params (notes) → verify ignored, no error
9. Update MIDI clip with audio-only params (gain) → verify ignored, no error
10. Read MIDI clip → verify no audio-info fields
11. Test with arrangement clips (not just session)
12. Verify `filename` extraction works with Unix and Windows paths
13. Test with clips that have no file_path (edge case)

### Edge Cases

- Empty filename/file_path (handle gracefully)
- Pitch shift at boundaries (-48, 48)
- Pitch shift with decimals (e.g., 2.337, -12.8)
- Gain at boundaries (0, 1)
- Mixed clip types in batch update
- Clips with missing file paths

### API Method Testing

- Verify `clip.set()` works (not `clip.setProperty()`)
- Verify `pitch_fine` accepts float values
- Verify Live's auto-normalization of pitch values doesn't break functionality

## Implementation Notes

- Audio parameters in `update-clip` are silently ignored for MIDI clips (no
  error)
- MIDI parameters (notes) continue to be ignored for audio clips (existing
  behavior)
- `gainDisplay` is read-only, returned for convenience but not settable
- `sampleLength` and `sampleRate` are read-only audio metadata
- File path extraction uses both `/` and `\\` as separators for cross-platform
  compatibility
- **CRITICAL**: Use `clip.set(property, value)` not
  `clip.setProperty(property, value)`
- `pitch_fine` is a **float**, not an integer (supports decimal values like
  33.7)
- Live automatically normalizes pitch values when fine exceeds ±50

## Future Enhancements (Not in v1)

- Warp markers manipulation
- Warp mode control
- Warping enable/disable
- RAM mode toggle
- Create audio clips with file paths (requires privacy considerations)
