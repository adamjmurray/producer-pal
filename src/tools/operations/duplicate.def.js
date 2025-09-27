import { z } from "zod";
import {
  MAX_AUTO_CREATED_SCENES,
  MAX_AUTO_CREATED_TRACKS,
} from "../constants.js";
import { defineTool } from "../shared/define-tool.js";

const description = `Duplicates an object by id and type. 
Supports creating multiple duplicates with the count parameter. Subject to limits: maximum ${MAX_AUTO_CREATED_TRACKS} tracks and ${MAX_AUTO_CREATED_SCENES} scenes.
TIME FORMATS: Uses bar|beat for positions, bar:beat for durations. See create-clip for details.
TRACK LAYERING: Use routeToSource=true when duplicating tracks to create powerful MIDI layering setups. This routes the new track to control the source track's instrument, allowing multiple clips of different lengths to create evolving patterns, polyrhythms, and phasing effects. Perfect for building complex arrangements from simple elements.
WHEN TO SUGGEST routeToSource: When users ask about: layering MIDI, polyrhythms, phasing patterns, Steve Reich-style compositions, combining multiple patterns, merging MIDI streams, or creating evolving/generative patterns. This feature is ideal for these use cases.
When duplicating scenes or tracks, clips are duplicated by default but can be excluded with withoutClips:true. Use the duplicatedClips array in the response to identify which clip slots now contain clips that must be modified using update-clip rather than create-clip.
IMPORTANT: For Arrangement clips, all timing is relative to each clip's start time, not the global arrangement timeline.
IMPORTANT: Session clips take precedence over Arrangement clips. Duplicated Arrangement clips will only play if their tracks are currently in arrangement-following state (see transport tool).
VIEW GUIDANCE: When duplicating to arrangement, consider using ppal-select to show the arrangement if the user wants to see the duplicated content.`;

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate Track/Scene/Clip",
  description,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    type: z
      .enum(["track", "scene", "clip"])
      .describe("Type of object to duplicate"),
    id: z.string().describe("Object id to duplicate"),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Number of duplicates to create (default: 1)"),
    destination: z
      .enum(["session", "arrangement"])
      .optional()
      .describe(
        "Destination for clip or scene duplication. Required when type is 'clip'. For scenes, defaults to 'session'.",
      ),
    arrangementStartTime: z
      .string()
      .optional()
      .describe(
        "Arrangement view start time in bar|beat position format using pipe separator (e.g., '5|1' = bar 5, beat 1 of the arrangement). Required when destination is 'arrangement'.",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "Arrangement view duration in bar:beat duration format using colon separator (e.g., '4:0' = exactly 4 bars, '2:1.5' = 2 bars + 1.5 beats). When not provided, this defaults to the clip length, or the longest clip in the scene. Auto-duplicates looping clips to fill the specified duration.",
      ),
    name: z
      .string()
      .optional()
      .describe(
        "Optional name for the duplicated object(s) (auto-increments for count > 1)",
      ),
    withoutClips: z
      .boolean()
      .default(false)
      .describe(
        "Whether to exclude clips when duplicating tracks or scenes (default: false)",
      ),
    withoutDevices: z
      .boolean()
      .default(false)
      .describe(
        "Whether to exclude devices when duplicating tracks (default: false)",
      ),
    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "Enable MIDI layering: Routes the new track's output to the source track's instrument, allowing multiple clips to play simultaneously through one instrument. " +
          "Perfect for: 1) Polyrhythmic patterns with clips of different lengths, 2) Phasing effects à la Steve Reich, 3) Building complex arrangements from simple loops, 4) Live performance with clip launching flexibility. " +
          "Effects: New track has no clips or devices, output routes to source track, source track is armed for input. " +
          "WARNING: Maintain unique track names to avoid routing issues.",
      ),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Automatically switch to the appropriate view based on destination (arrangement/session) or operation type",
      ),
  },
});
