// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { applyModulations } from "#src/notation/modulation/modulation-evaluator.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type { MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { select } from "#src/tools/control/select.ts";
import {
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  buildClipName,
  convertTimingParameters,
  parseArrangementStartList,
  parseSceneIndexList,
  processClipIteration,
} from "./helpers/create-clip-helpers.ts";
import {
  calculateClipLength,
  handleAutoPlayback,
  validateCreateClipParams,
} from "./helpers/create-clip-validation-helpers.ts";

export interface CreateClipArgs {
  /** View for the clip */
  view: "session" | "arrangement";
  /** Track index (0-based) */
  trackIndex: number;
  /** Scene index(es), comma-separated for multiple */
  sceneIndex?: string | null;
  /** Bar|beat position(s), comma-separated */
  arrangementStart?: string | null;
  /** Musical notation string (MIDI clips only) */
  notes?: string | null;
  /** Modulation expressions */
  modulations?: string | null;
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
  /** Clip length in bar:beat duration format */
  length?: string | null;
  /** Bar|beat position for initial playback start */
  firstStart?: string | null;
  /** Enable looping for the clip */
  looping?: boolean | null;
  /** Automatic playback action */
  auto?: string | null;
  /** Automatically switch to the appropriate view */
  switchView?: boolean;
}

interface PreparedClipData {
  notes: MidiNote[];
  clipLength: number;
}

/**
 * Creates MIDI or audio clips in Session or Arrangement view
 * @param args - The clip parameters
 * @param args.view - View for the clip (session or arrangement)
 * @param args.trackIndex - Track index (0-based)
 * @param args.sceneIndex - Scene index(es), comma-separated for multiple
 * @param args.arrangementStart - Bar|beat position(s), comma-separated
 * @param args.notes - Musical notation string (MIDI clips only)
 * @param args.modulations - Modulation expressions
 * @param args.sampleFile - Absolute path to audio file (audio clips only)
 * @param args.name - Base name for the clips
 * @param args.color - Color in #RRGGBB hex format
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Clip length in bar:beat duration format
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.auto - Automatic playback action
 * @param args.switchView - Automatically switch to the appropriate view
 * @param _context - Internal context object (unused)
 * @returns Single clip object when one position, array when multiple positions
 */
export function createClip(
  {
    view,
    trackIndex,
    sceneIndex = null,
    arrangementStart = null,
    notes: notationString = null,
    modulations: modulationString = null,
    sampleFile = null,
    name = null,
    color = null,
    timeSignature = null,
    start = null,
    length = null,
    firstStart = null,
    looping = null,
    auto = null,
    switchView,
  }: CreateClipArgs,
  _context: Partial<ToolContext> = {},
): object | object[] {
  // Parse position lists
  const sceneIndices = parseSceneIndexList(sceneIndex);
  const arrangementStarts = parseArrangementStartList(arrangementStart);

  // Validate parameters
  validateCreateClipParams(
    view,
    sceneIndices,
    arrangementStarts,
    notationString,
    sampleFile,
  );

  // Validate track exists (fatal - affects all clips)
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(`createClip failed: track ${trackIndex} does not exist`);
  }

  const liveSet = LiveAPI.from("live_set");

  // Get song time signature for arrangementStart conversion
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  // Determine clip time signature (custom or from song)
  let timeSigNumerator: number, timeSigDenominator: number;

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    timeSigNumerator = songTimeSigNumerator;
    timeSigDenominator = songTimeSigDenominator;
  }

  // Convert timing parameters to Ableton beats (excluding arrangementStart, done per-position)
  const { startBeats, firstStartBeats, endBeats } = convertTimingParameters(
    null, // arrangementStart converted per-position
    start,
    firstStart,
    length,
    looping,
    timeSigNumerator,
    timeSigDenominator,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Parse notation and determine clip length
  const { notes, clipLength: initialClipLength } = prepareClipData(
    sampleFile,
    notationString,
    modulationString,
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Create clips
  const createdClips = createClips(
    view,
    trackIndex,
    sceneIndices,
    arrangementStarts,
    name,
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
  );

  // Handle automatic playback and view switching
  handleAutoPlayback(auto, view, sceneIndices, trackIndex);

  if (switchView) {
    select({ view });
  }

  return unwrapSingleResult(createdClips);
}

/**
 * Creates clips by iterating over positions
 * @param view - View type
 * @param trackIndex - Track index
 * @param sceneIndices - Array of scene indices (session view)
 * @param arrangementStarts - Array of bar|beat positions (arrangement view)
 * @param name - Base clip name
 * @param initialClipLength - Initial clip length
 * @param liveSet - LiveAPI liveSet object
 * @param startBeats - Loop start in beats
 * @param endBeats - Loop end in beats
 * @param firstStartBeats - First playback start in beats
 * @param looping - Whether the clip is looping
 * @param color - Clip color
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param notationString - Original notation string
 * @param notes - Array of MIDI notes
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @param length - Original length parameter
 * @param sampleFile - Audio file path
 * @returns Array of created clips
 */
function createClips(
  view: string,
  trackIndex: number,
  sceneIndices: number[],
  arrangementStarts: string[],
  name: string | null,
  initialClipLength: number,
  liveSet: LiveAPI,
  startBeats: number | null,
  endBeats: number | null,
  firstStartBeats: number | null,
  looping: boolean | null,
  color: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  notationString: string | null,
  notes: MidiNote[],
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
  length: string | null,
  sampleFile: string | null,
): object[] {
  const createdClips: object[] = [];
  const positions = view === "session" ? sceneIndices : arrangementStarts;
  const count = positions.length;
  const clipLength = initialClipLength;

  for (let i = 0; i < count; i++) {
    const clipName = buildClipName(name, count, i);

    // Get position for this iteration
    let currentSceneIndex: number | null = null;
    let currentArrangementStartBeats: number | null = null;
    let currentArrangementStart: string | null = null;

    if (view === "session") {
      currentSceneIndex = sceneIndices[i] as number;
    } else {
      currentArrangementStart = arrangementStarts[i] as string;
      currentArrangementStartBeats = barBeatToAbletonBeats(
        currentArrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }

    try {
      const clipResult = processClipIteration(
        view,
        trackIndex,
        currentSceneIndex,
        currentArrangementStartBeats,
        currentArrangementStart,
        clipLength,
        liveSet,
        startBeats,
        endBeats,
        firstStartBeats,
        looping,
        clipName,
        color,
        timeSigNumerator,
        timeSigDenominator,
        notationString,
        notes,
        length,
        sampleFile,
      );

      createdClips.push(clipResult);
    } catch (error) {
      // Emit warning with position info
      const position =
        view === "session"
          ? `trackIndex=${trackIndex}, sceneIndex=${currentSceneIndex}`
          : `trackIndex=${trackIndex}, arrangementStart=${currentArrangementStart}`;

      console.warn(
        `Failed to create clip at ${position}: ${errorMessage(error)}`,
      );
    }
  }

  return createdClips;
}

/**
 * Prepares clip data (notes and initial length) based on clip type
 * @param sampleFile - Audio file path (if audio clip)
 * @param notationString - MIDI notation string (if MIDI clip)
 * @param modulationString - Modulation expressions to apply to notes
 * @param endBeats - End position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Object with notes array and clipLength
 */
function prepareClipData(
  sampleFile: string | null,
  notationString: string | null,
  modulationString: string | null,
  endBeats: number | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
): PreparedClipData {
  // Parse notation into notes (MIDI clips only)
  const notes: MidiNote[] =
    notationString != null
      ? interpretNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Apply modulations to notes if provided
  applyModulations(
    notes,
    modulationString ?? undefined,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Determine clip length
  let clipLength: number;

  if (sampleFile) {
    // Audio clips get length from the sample file, not this value
    clipLength = 1;
  } else {
    // MIDI clips: calculate based on notes and parameters
    clipLength = calculateClipLength(
      endBeats,
      notes,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return { notes, clipLength };
}
