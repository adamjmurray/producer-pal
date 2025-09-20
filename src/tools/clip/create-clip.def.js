import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

const description = `Creates MIDI clips in Session or Arrangement.

For Session view, provide trackIndex and clipSlotIndex.
Scenes will be auto-created if needed to insert clips at the given index, up to a maximum of 1000 scenes (sceneIndex == clipSlotIndex).
Creating a clip in Session view fails if a clip already exists at the specified trackIndex/clipSlotIndex combination. For modifying clips in slots that already contain clips (e.g., after duplicating scenes), use update-clip instead.

For Arrangement view, provide trackIndex and arrangementStartTime. Existing arrangement clips will have overlapping areas overwritten.

When count > 1, Session clips are created in successive clip slots, and Arrangement clips are placed back-to-back.

TIME FORMATS: Producer Pal uses two musical time formats:
- POSITIONS (where): bar|beat with pipe (e.g., '1|1' = AT bar 1, beat 1)
- DURATIONS (how long): bar:beat with colon (e.g., '4:0' = 4 bars LONG) Think: pipe | = position marker, colon : = duration timer
IMPORTANT: For Arrangement view clips, all timing parameters (startMarker, length) and note positions in the bar|beat notation are relative to the clip's start time, not the global arrangement timeline. A clip placed at arrangementStartTime '17|1' with notes starting at '1|1' will play those notes at global arrangement bar 17.

Clip length defaults to fit the notes, or can be explicitly set with the length parameter.

SCALE TIP: If the song has a scale enabled (see ppal-read-song), using notes from that scale helps create harmonically cohesive clips. The scale provides a solid foundation while still allowing chromatic notes for tension and expression.

RANGE TIP: Many instruments, especially sample-based ones (orchestral libraries, etc.), have limited playable ranges. A generally safe default pitch range is C1-C5. Always consider the instrument type when choosing pitches - bass instruments favor lower ranges, leads/melodies work well in the middle, and only use extreme ranges when you're certain the instrument supports them or the user asks for it.

MUSICAL GUIDE: Effective arrangements prioritize clarity over density. 'Epic' or 'dramatic' impact comes from dynamics (v50-v120), rhythmic variety, and strategic space, not from multiplying the number of notes.

VIEW GUIDANCE: After creating clips, consider using ppal-read-view and ppal-update-view to show them if the user would benefit from seeing the created clips.

WORKFLOW: When creating a scene of clips, generally auto="play-scene" should be used when creating each clip.
`;

export const notationDescription = `<barbeat-notation>
bar|beat is a precise, stateful music notation format for MIDI sequencing.

## Core Syntax

\`[bar|beat] [v<velocity>] [t<duration>] [p<probability>] note [note ...]\`

### Components:

- **Start Time (\`bar|beat\`)** Timestamp for event start, relative to an Ableton Live clip's start (not the absolute time in the arrangement).
  - \`bar\` - 1-based bar number (integer)
  - \`beat\` - 1-based beat number within bar (float for sub-beat precision). The beat depends on the time signature denominator (e.g. in 6/8, an 8th note gets the beat).
  - \`1|1\` - the start of a clip
  - \`|beat\` - shortcut to reuse current bar number (e.g., \`1|1 C3 |2 D3\` plays C3 at bar 1 beat 1, D3 at bar 1 beat 2)
  - Can be standalone to set default time for following notes
  - Persists until explicitly changed

- **Probability (\`p<0.0-1.0>\`)**
  - Sets note probability for following notes until changed
  - 1.0 = note always plays, 0.0 = note never plays
  - Default: 1.0

- **Velocity (\`v<0-127>\` or \`v<min>-<max>\`)**
  - Sets velocity for following notes until changed
  - Single value: \`v100\` (fixed velocity)
  - Range: \`v80-120\` or \`v120-80\` (random velocity between min and max, auto-ordered)
  - **⚠️ SPECIAL: \`v0\` = DELETE NOTES** (ppal-update-clip only, requires noteUpdateMode: "merge")
  - Default: 100

- **Duration (\`t<float>\`)**
  - Sets duration in beats for following notes until changed
  - Default: 1.0

- **Note (\`C4\`, \`Eb2\`, \`F#3\`, etc.)**
  - Standard pitch notation with octave
  - Valid pitch classes: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B
  - MIDI pitch range: 0-127

### State Management

All components are stateful:
- **Time**: Set with \`bar|beat\`, applies to following notes until changed
- **Probability**: Set with \`p<value>\`, applies to following notes until changed  
- **Velocity**: Set with \`v<value>\` or \`v<min>-<max>\`, applies to following notes until changed
- **Duration**: Set with \`t<value>\`, applies to following notes until changed

## Examples

C major triad at bar 1, beat 1 (the first beat ):
\`\`\`
1|1 C3 E3 G3
\`\`\`

Simple melody with state changes:
\`\`\`
1|1 v100 t1.0 C3
1|2 D3
1|3 E3
2|1 v80 t2.0 G3
\`\`\`

Using |beat shortcut to reduce redundancy:
\`\`\`
1|1 C3 |2 D3 |3 E3
2|1 F3 |2 G3
\`\`\`

Sub-beat timing:
\`\`\`
1|1 v100 t0.25 C3
1|1.5 D3
1|2.25 E3
\`\`\`

Drum pattern with probability and velocity variation
\`\`\`
1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1
1|1.5 p0.6 Gb1
1|2 v90 p1.0 D1
v100 p0.9 Gb1
\`\`\`

## Comments

You can add comments to bar|beat notation:

\`\`\`
// Line comment
1|1 C3 D3 E3 // C major triad

# Hash comment
1|1 C1 # kick drum

/* Block comment */
1|1 v100 /* forte */ C3

/* Multi-line
   block comment */
1|1 C3 D3
\`\`\`

## Musical Density Guidelines

Professional arrangements prioritize clarity and impact:
- **Space is musical**: Silence between notes often matters more than the notes themselves
- **Context matters**: A "sparse" drum pattern might have 50+ notes, while a "dense" bass line might have only 20
- **Build through dynamics**: Use velocity (v50 to v120) to create intensity rather than adding more notes
- **Rhythmic evolution**: Progress from long notes to shorter subdivisions (whole to half to quarter to eighth)

"Epic" or "dramatic" typically achieves impact through:
- Wide dynamic range rather than continuous fortissimo
- Rhythmic contrast between sections
- Strategic moments of space and silence
- Each instrument having room to breathe

## Tool-Specific Behavior

### v0 Note Deletion (ppal-update-clip only)

When using \`ppal-update-clip\` with \`noteUpdateMode: "merge"\`, notes with \`v0\` velocity delete existing notes at the exact same bar|beat position and pitch:

\`\`\`
v0 2|1.5 Gb1  // Deletes hi-hat at bar 2, beat 1.5
\`\`\`

**Requirements for successful deletion:**
- Exact timing match: \`3|2.5\` will not delete a note at \`3|2.6\`
- Exact pitch match: \`Gb1\` will not delete \`F#1\` (even though they're enharmonic)
- Must use \`noteUpdateMode: "merge"\`

**Tool differences:**
- \`ppal-create-clip\`: v0 notes are filtered out (not added to the clip)
- \`ppal-update-clip\`: v0 notes become deletion requests when \`noteUpdateMode: "merge"\`

### ⚠️ CRITICAL: Read-First Workflow

**ALWAYS read the clip first** to get exact positions - guessing will fail!

1. **Read**: \`ppal-read-clip\` to identify exact positions and pitches
2. **Delete**: \`ppal-update-clip\` with \`noteUpdateMode: "merge"\` and \`v0\` notes
3. **Verify**: \`ppal-read-clip\` again to confirm changes

### Common Deletion Examples

**Remove downbeats from 16th note hi-hats:**
\`\`\`
// Before: 1|1 Gb1 1|1.25 Gb1 1|1.5 Gb1 1|1.75 Gb1 1|2 Gb1 1|2.25 Gb1 1|2.5 Gb1 1|2.75 Gb1
// Delete: v0 1|1 Gb1 1|2 Gb1
// After:  1|1.25 Gb1 1|1.5 Gb1 1|1.75 Gb1 1|2.25 Gb1 1|2.5 Gb1 1|2.75 Gb1
\`\`\`

**Delete specific chord notes:**
\`\`\`
// Before: 1|1 C3 E3 G3 B3
// Delete: v0 1|1 E3 B3
// After:  1|1 C3 G3
\`\`\`
</barbeat-notation>`;

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    view: z.enum(["session", "arrangement"]).describe("Location of the clip"),
    trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    clipSlotIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Clip slot index (0-based). Required when view is "session".'),
    arrangementStartTime: z
      .string()
      .optional()
      .describe(
        "Arrangement view start time in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement, '2|3.5' = halfway through third beat of second bar of the arrangement). Uses song's time signature for conversion. Required when view is 'Arrangement'.",
      ),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Number of clips to create (default: 1)"),
    name: z
      .string()
      .optional()
      .describe("Base name for the clips (auto-increments for count > 1)"),
    color: z.string().optional().describe("Color in #RRGGBB hex format"),
    timeSignature: z
      .string()
      .optional()
      .describe(
        'Time signature in format "n/m" (e.g. "4/4"). Defaults to the song\'s time signature for new clips.',
      ),
    startMarker: z
      .string()
      .optional()
      .describe(
        "Clip start marker in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature.",
      ),
    length: z
      .string()
      .optional()
      .describe(
        "Clip length in bar:beat duration format using colon separator (e.g., '4:0' = exactly 4 bars, '2:1.5' = 2 bars + 1.5 beats). When provided, automatically sets the clip end marker and loop end. If loopStart is also specified, the effective loop length may be shorter than this total length. Uses clip's time signature.",
      ),
    loop: z
      .boolean()
      .optional()
      .describe("Enable or disable looping for the clips"),
    loopStart: z
      .string()
      .optional()
      .describe(
        "Clip loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature.",
      ),
    notes: z
      .string()
      .optional()
      .describe(
        `Musical notation in the following bar|beat notation format. DENSITY TIP: Professional arrangements breathe; each instrument needs space to be heard. Build intensity through dynamics and rhythm rather than multiplying the number of notes. ${notationDescription}`,
      ),
    auto: z
      .enum(["play-scene", "play-clip"])
      .optional()
      .describe(
        "Automatic playback action after clip creation. 'play-scene' relaunches the entire scene for synchronization. Use this when: building multi-instrument arrangements, adding to existing grooves, or when other clips should play together. 'play-clip' plays only the created clip(s). Use this when: auditioning standalone ideas or creating clips that shouldn't trigger other instruments. Default to 'play-scene' unless you specifically need isolation. Omit for no automatic playback. Session clips only - Arrangement clips ignore this parameter. IMPORTANT: Both options put the affected track into non-arrangement-following state - it will play Session clips instead of Arrangement clips until restored via the transport tool's followingTrackIndexes parameter.",
      ),
  },
});
