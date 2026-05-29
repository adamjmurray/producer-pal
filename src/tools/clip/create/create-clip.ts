// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { computeLoopDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import { select } from "#src/tools/session/select.ts";
import { unwrapSingleResult } from "#src/tools/shared/utils.ts";
import { parseCommaSeparatedColors } from "#src/tools/shared/validation/color-utils.ts";
import {
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  parseArrangementStartList,
  parseSlotList,
  type SlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";
import {
  createClips,
  prepareClipData,
} from "./helpers/create-clip-loop-helpers.ts";
import {
  resolveClipTimingContext,
  resolveCreateClipTakeLane,
} from "./helpers/create-clip-prep-helpers.ts";
import {
  handleAutoPlayback,
  validateCreateClipParams,
  validatePositions,
  validateSessionTracks,
} from "./helpers/create-clip-validation-helpers.ts";

export interface CreateClipArgs {
  /** Session clip slot(s), trackIndex/sceneIndex comma-separated */
  slot?: string | null;
  /** Track index (0-based, arrangement clips) */
  trackIndex?: number | null;
  /** Bar|beat position(s), comma-separated */
  arrangementStart?: string | null;
  /** Musical notation string (MIDI clips only) */
  notes?: string | null;
  /** Transform expressions */
  transforms?: string | null;
  /** Absolute path to audio file (audio clips only) */
  sampleFile?: string | null;
  /** Base name for the clips */
  name?: string | null;
  /** Color in #RRGGBB hex format */
  color?: string | null;
  /** Time signature in format "4/4" */
  timeSignature?: string | null;
  /** Bar|beat position where loop/clip region begins */
  start?: string | null;
  /** Clip length: Nbar, n<fraction> note value, or Nbar+n<fraction> */
  length?: string | null;
  /** Bar|beat position for initial playback start */
  firstStart?: string | null;
  /** Enable looping for the clip */
  looping?: boolean | null;
  /** Automatic playback action */
  auto?: string | null;
  /** Select the created clip and show clip detail view */
  focus?: boolean;
  /** JavaScript code to generate notes (MIDI clips only) */
  code?: string | null;
  /** Arrangement take lane target: 0/omitted = main lane, 1+ = that lane, "new" = append */
  takeLane?: number | string | null;
  /** Name for a take lane newly created by this call */
  takeLaneName?: string | null;
}

/**
 * Creates MIDI or audio clips in Session or Arrangement view
 * @param args - The clip parameters
 * @param args.slot - Session clip slot(s), trackIndex/sceneIndex comma-separated
 * @param args.trackIndex - Track index (arrangement clips)
 * @param args.arrangementStart - Bar|beat position(s), comma-separated
 * @param args.notes - Musical notation string (MIDI clips only)
 * @param args.transforms - Transform expressions
 * @param args.sampleFile - Absolute path to audio file (audio clips only)
 * @param args.name - Base name for the clips
 * @param args.color - Color in #RRGGBB hex format
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Clip length: Nbar, n<fraction> note value, or Nbar+n<fraction>
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.auto - Automatic playback action
 * @param args.focus - Select the created clip and show clip detail view
 * @param args.code - JavaScript code to generate notes (MIDI clips only)
 * @param args.takeLane - Arrangement take lane target (0/omitted = main, 1+ = lane, "new")
 * @param args.takeLaneName - Name for a take lane newly created by this call
 * @param _context - Internal context object (unused)
 * @returns Single clip object when one position, array when multiple positions
 */
export async function createClip(
  {
    slot = null,
    trackIndex = null,
    arrangementStart = null,
    notes: notationString = null,
    transforms: transformString = null,
    sampleFile = null,
    name = null,
    color = null,
    timeSignature = null,
    start = null,
    length = null,
    firstStart = null,
    looping = null,
    auto = null,
    focus,
    code = null,
    takeLane = null,
    takeLaneName = null,
  }: CreateClipArgs,
  _context: Partial<ToolContext> = {},
): Promise<object | object[]> {
  const deadline = computeLoopDeadline(_context.timeoutMs);

  // Parse position lists
  const sessionSlots = parseSlotList(slot);
  const arrangementStarts = parseArrangementStartList(arrangementStart);

  // Validate at least one position type is provided
  validatePositions(sessionSlots, arrangementStarts);

  // Validate parameters
  validateCreateClipParams(notationString, sampleFile);
  validateSessionTracks(sessionSlots);
  validateArrangementTrack(arrangementStarts, trackIndex);

  const liveSet = LiveAPI.from(livePath.liveSet);

  // Resolve time signatures and convert timing parameters to Ableton beats
  // (arrangementStart is converted per-position later)
  const {
    songTimeSigNumerator,
    songTimeSigDenominator,
    timeSigNumerator,
    timeSigDenominator,
    startBeats,
    firstStartBeats,
    endBeats,
  } = resolveClipTimingContext(
    liveSet,
    timeSignature,
    start,
    firstStart,
    length,
    looping,
  );

  // Parse notation and determine clip length
  const {
    notes,
    clipLength: initialClipLength,
    transformedCount,
  } = prepareClipData(
    sampleFile,
    notationString,
    transformString,
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Parse comma-separated names/colors for multi-clip creation
  const { parsedNames, parsedColors } = parseMultiClipParams(
    name,
    color,
    sessionSlots.length + arrangementStarts.length,
  );

  // Resolve the arrangement take lane (auto-creates lanes as needed). Overlap
  // replaces existing clips, like the main lane.
  const takeLaneCreator = resolveCreateClipTakeLane(
    takeLane,
    takeLaneName,
    sessionSlots.length,
    arrangementStarts,
    trackIndex,
  );

  // Create session clips first, then arrangement (order gives arrangement focus priority)
  const clipsForView = (
    view: "session" | "arrangement",
    nameStartIndex: number,
  ) =>
    createClips({
      view,
      trackIndex: trackIndex ?? 0,
      takeLane: takeLaneCreator,
      sessionSlots,
      arrangementStarts,
      baseName: name,
      parsedNames,
      parsedColors,
      nameStartIndex,
      initialClipLength,
      liveSet,
      startBeats,
      endBeats,
      firstStartBeats,
      looping,
      color,
      timeSigNumerator,
      timeSigDenominator,
      notationString,
      notes,
      songTimeSigNumerator,
      songTimeSigDenominator,
      length,
      sampleFile,
      deadline,
      code,
      transformedCount,
    });

  const sessionClips = await clipsForView("session", 0);
  const arrangementClips = await clipsForView(
    "arrangement",
    sessionSlots.length,
  );
  const createdClips = [...sessionClips, ...arrangementClips];

  return finalizeCreatedClips(createdClips, auto, sessionSlots, focus);
}

/**
 * Handle auto-playback and focus for the created clips, then unwrap the result.
 * @param createdClips - All created clip result objects
 * @param auto - Automatic playback action
 * @param sessionSlots - Parsed session slot positions
 * @param focus - Whether to select the last created clip
 * @returns Single clip object when one, array when multiple
 */
function finalizeCreatedClips(
  createdClips: object[],
  auto: string | null,
  sessionSlots: SlotPosition[],
  focus: boolean | undefined,
): object | object[] {
  // Handle automatic playback (session clips only, guard inside handles no-op)
  handleAutoPlayback(auto, "session", sessionSlots);

  // Focus last created clip: arrangement clips are after session clips, so
  // arrangement gets priority (the arrangement is where the final song lives)
  if (focus && createdClips.length > 0) {
    const lastClip = createdClips.at(-1) as { id: string };

    select({ clipId: lastClip.id, detailView: "clip" });
  }

  return unwrapSingleResult(createdClips);
}

/**
 * Parse comma-separated names and colors for multi-clip creation
 * @param name - Name parameter (may contain commas)
 * @param color - Color parameter (may contain commas)
 * @param totalPositionCount - Total number of clip positions
 * @returns Parsed names and colors arrays
 */
function parseMultiClipParams(
  name: string | null,
  color: string | null,
  totalPositionCount: number,
): { parsedNames: string[] | null; parsedColors: string[] | null } {
  const parsedNames = parseCommaSeparatedNames(
    name ?? undefined,
    totalPositionCount,
  );
  const parsedColors = parseCommaSeparatedColors(
    color ?? undefined,
    totalPositionCount,
  );

  warnExtraNames(parsedNames, totalPositionCount, "createClip");

  return { parsedNames, parsedColors };
}

/**
 * Validate track exists when arrangement clips are requested
 * @param arrangementStarts - Parsed arrangement positions
 * @param trackIndex - Track index for arrangement clips
 */
function validateArrangementTrack(
  arrangementStarts: string[],
  trackIndex: number | null,
): void {
  if (arrangementStarts.length === 0) return;

  if (trackIndex == null) {
    throw new Error(
      "createClip failed: trackIndex is required for arrangement clips",
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  if (!track.exists()) {
    throw new Error(`createClip failed: track ${trackIndex} does not exist`);
  }
}
