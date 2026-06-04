// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { sortNotes } from "#src/notation/note-sort.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { readLiveSetScaleMask } from "#src/tools/clip/helpers/scale-mask.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-utils.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-utils.ts";
import { type SlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { processClipIteration } from "./create-clip-helpers.ts";
import {
  type ClipTransformInputs,
  resolveClipTransform,
} from "./create-clip-transform-helpers.ts";
import { calculateClipLength } from "./create-clip-validation-helpers.ts";

export interface CreateClipsParams {
  view: string;
  trackIndex: number;
  sessionSlots: SlotPosition[];
  arrangementStarts: string[];
  baseName: string | null;
  parsedNames: string[] | null;
  parsedColors: string[] | null;
  nameStartIndex: number;
  initialClipLength: number;
  liveSet: LiveAPI;
  startBeats: number | null;
  endBeats: number | null;
  firstStartBeats: number | null;
  looping: boolean | null;
  color: string | null;
  timeSigNumerator: number;
  timeSigDenominator: number;
  notationString: string | null;
  notes: MidiNote[];
  transformString: string | null;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  length: string | null;
  sampleFile: string | null;
  deadline: number | null;
  code: string | null;
  /** Take lane to create arrangement clips on, or null for the main lane */
  takeLane: LiveAPI | null;
}

/**
 * Creates clips by iterating over positions for a single view
 * @param params - All parameters for clip creation
 * @returns Array of created clips
 */
export async function createClips(
  params: CreateClipsParams,
): Promise<object[]> {
  const { view, sessionSlots, arrangementStarts, deadline } = params;
  const createdClips: object[] = [];
  const count =
    view === "session" ? sessionSlots.length : arrangementStarts.length;

  // Constant transform inputs for this view; read the scale mask once (it is a
  // Live Set global). Per-clip context (index/count/position) is applied below.
  const transformInputs: ClipTransformInputs = {
    notes: params.notes,
    clipLength: params.initialClipLength,
    transformString: params.transformString,
    isAudio: params.sampleFile != null,
    endBeats: params.endBeats,
    timeSigNumerator: params.timeSigNumerator,
    timeSigDenominator: params.timeSigDenominator,
    scaleMask:
      params.transformString != null ? readLiveSetScaleMask() : undefined,
  };

  for (let i = 0; i < count; i++) {
    if (isDeadlineExceeded(deadline)) {
      console.warn(
        `Deadline exceeded after creating ${createdClips.length} of ${count} clips`,
      );
      break;
    }

    await createClipAtIndex(params, transformInputs, i, count, createdClips);
  }

  return createdClips;
}

interface IterationPosition {
  trackIndex: number;
  sceneIndex: number | null;
  arrangementStartBeats: number | null;
  arrangementStart: string | null;
}

/**
 * Create a single clip at iteration index `i`, applying its per-clip transform
 * context and any code execution. Pushes the created clip onto `createdClips`;
 * warns (without throwing) on failure so the loop continues with the remaining
 * positions.
 * @param params - All parameters for clip creation
 * @param transformInputs - Constant transform inputs for this view
 * @param i - 0-based iteration index within the view
 * @param count - Total clips created in this view
 * @param createdClips - Accumulator the created clip is pushed onto
 */
async function createClipAtIndex(
  params: CreateClipsParams,
  transformInputs: ClipTransformInputs,
  i: number,
  count: number,
  createdClips: object[],
): Promise<void> {
  const { view, baseName, parsedNames, parsedColors, nameStartIndex, code } =
    params;

  const clipName = getNameForIndex(
    baseName ?? undefined,
    nameStartIndex + i,
    parsedNames,
  );
  const clipColor = getColorForIndex(
    params.color ?? undefined,
    nameStartIndex + i,
    parsedColors,
  );
  const pos = resolveIterationPosition(params, i);

  // Apply the transform with this clip's context (clipseq/clip.index/etc.).
  // Falls back to the shared notes/length when there is no transform.
  const {
    notes: clipNotes,
    clipLength,
    transformedCount,
  } = resolveClipTransform(
    transformInputs,
    i,
    count,
    pos.arrangementStartBeats,
  );

  try {
    const clipResult = processClipIteration(
      view,
      pos.trackIndex,
      pos.sceneIndex,
      pos.arrangementStartBeats,
      pos.arrangementStart,
      clipLength,
      params.liveSet,
      params.startBeats,
      params.endBeats,
      params.firstStartBeats,
      params.looping,
      clipName,
      clipColor ?? null,
      params.timeSigNumerator,
      params.timeSigDenominator,
      params.notationString,
      clipNotes,
      params.length,
      params.sampleFile,
      transformedCount,
      // Take lanes apply only to arrangement clips (ignored for session view)
      params.takeLane,
    );

    createdClips.push(clipResult);

    // Apply code execution to the newly created clip
    const clipId = code != null ? (clipResult as { id?: string }).id : null;

    if (clipId != null && code != null) {
      const noteCount = await applyCodeToSingleClip(clipId, code, i, count);

      if (noteCount != null) {
        (clipResult as { noteCount?: number }).noteCount = noteCount;
      }
    }
  } catch (error) {
    // Emit warning with position info
    const position =
      view === "session"
        ? `slot=${pos.trackIndex}/${pos.sceneIndex}`
        : `trackIndex=${pos.trackIndex}, arrangementStart=${pos.arrangementStart}`;

    console.warn(
      `Failed to create clip at ${position}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Resolve the track/scene or arrangement position for iteration index `i`.
 * @param params - All parameters for clip creation
 * @param i - 0-based iteration index within the view
 * @returns Position info for this iteration
 */
function resolveIterationPosition(
  params: CreateClipsParams,
  i: number,
): IterationPosition {
  if (params.view === "session") {
    const slot = params.sessionSlots[i] as SlotPosition;

    return {
      trackIndex: slot.trackIndex,
      sceneIndex: slot.sceneIndex,
      arrangementStartBeats: null,
      arrangementStart: null,
    };
  }

  const arrangementStart = params.arrangementStarts[i] as string;

  // Validate the standalone position first so a 0-indexed/zero-bar arrangement
  // start gets the 1-indexing steer (matching the single-clip create path), not
  // a silent pre-origin beat.
  validateBarBeatPosition(arrangementStart);

  return {
    trackIndex: params.trackIndex,
    sceneIndex: null,
    arrangementStartBeats: barBeatToAbletonBeats(
      arrangementStart,
      params.songTimeSigNumerator,
      params.songTimeSigDenominator,
    ),
    arrangementStart,
  };
}

interface PreparedClipData {
  notes: MidiNote[];
  clipLength: number;
}

/**
 * Prepares clip data (notes and initial length) based on clip type.
 * Notation is interpreted once here; transforms run per clip in createClips so
 * clip.index/clip.count/clipseq() vary across a multi-clip create.
 * @param sampleFile - Audio file path (if audio clip)
 * @param notationString - MIDI notation string (if MIDI clip)
 * @param endBeats - End position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Object with notes array and clipLength
 */
export function prepareClipData(
  sampleFile: string | null,
  notationString: string | null,
  endBeats: number | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
): PreparedClipData {
  // Parse notation into notes (MIDI clips only)
  const interpretedNotes: MidiNote[] =
    notationString != null
      ? interpretNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Sort ascending by start_time before the eventual add_new_notes write:
  // out-of-order same-pitch notes whose onsets overlap get deleted by Live.
  // Per-clip transforms in createClips re-sort each transformed copy.
  const notes = sortNotes(interpretedNotes);

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
