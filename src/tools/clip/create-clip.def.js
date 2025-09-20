import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

const description = `Creates MIDI clips in Live's Session or Arrangement.
Time formats: bar|beat for positions (1|1 = first beat), bar:beat for durations (4:0 = 4 bars). Beats can be fractional.`;

// TODO: move to error message in this scenario
// Creating a clip in Session view fails if a clip already exists at the specified trackIndex/clipSlotIndex combination. For modifying clips in slots that already contain clips (e.g., after duplicating scenes), use update-clip instead.

// Move to init response? Delete? Put in notes param description?
// SCALE TIP: If the song has a scale enabled (see ppal-read-song), using notes from that scale helps create harmonically cohesive clips. The scale provides a solid foundation while still allowing chromatic notes for tension and expression.

// RANGE TIP: Many instruments, especially sample-based ones (orchestral libraries, etc.), have limited playable ranges. A generally safe default pitch range is C1-C5. Always consider the instrument type when choosing pitches - bass instruments favor lower ranges, leads/melodies work well in the middle, and only use extreme ranges when you're certain the instrument supports them or the user asks for it.

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    view: z
      .enum(["session", "arrangement"])
      .describe(
        "Location of the clip. Session requires trackIndex and clipSlotIndex. Arrangement requires trackIndex and arrangementStartTime.",
      ),
    trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    clipSlotIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Clip slot index (0-based)"),
    arrangementStartTime: z
      .string()
      .optional()
      .describe(
        "Start position in arrangement (bar|beat). All clip timing (startMarker, length, notes) is relative to this position, not global timeline.",
      ),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe(
        "Number of clips to create. Session view: fills successive slots. Arrangement view: places back-to-back.",
      ),
    name: z
      .string()
      .optional()
      .describe("Base name for the clips (auto-increments for count > 1)"),
    color: z.string().optional().describe("Hex color (#RRGGBB)"),
    timeSignature: z
      .string()
      .optional()
      .describe(
        `Time signature in format "n/m". Defaults to the song's time signature for new clips.`,
      ),
    startMarker: z
      .string()
      .optional()
      .describe("Clip start marker position (bar|beat)"),
    length: z
      .string()
      .optional()
      .describe(
        "Clip duration (bar:beat), sets end/loop markers. Clip length defaults to fit the notes.",
      ),
    loop: z.boolean().optional().describe("Enable or disable looping"),
    loopStart: z.string().optional().describe("Loop start position (bar|beat)"),
    notes: z
      .string()
      .optional()
      .describe(
        `The MIDI notes in the clip expressed as bar|beat notation.

Syntax: [bar|beat] [v<velocity>] [t<duration>] [p<probability>] note [note ...]

- bar|beat: Position (1|1 = clip start, 1|2.5 = bar 1 beat 2.5). Beats can be fractional. Use |beat to reuse current bar
- v0-127: Velocity. v80-120 = random range. v0 = DELETE (update-clip + merge mode only)
- t<beats>: Duration in beats (default: 1.0)
- p0.0-1.0: Probability (default: 1.0)
- note: C0-B8 with sharps/flats (C#3, Eb4)

All elements are stateful - values persist until changed.

Examples:
1|1 C3 E3 G3          // Chord at bar 1 beat 1
1|1 v100 C3 |2.5 D3   // C at beat 1, D at beat 2.5
1|1.75 t0.25 C3       // 16th note at beat 1.75
v0 2|1.5 Gb1          // Delete hi-hat (update-clip merge mode)

Deletion (update-clip only): With noteUpdateMode:"merge", v0 deletes notes at exact position/pitch. Always read-clip first to get precise positions.

Comments: // line, # hash, /* block */`,
      ),
    auto: z
      .enum(["play-scene", "play-clip"])
      .optional()
      .describe(
        'Auto-play after creation: "play-scene" (sync with scene) or "play-clip" (solo). Session view only.',
      ),
  },
});
