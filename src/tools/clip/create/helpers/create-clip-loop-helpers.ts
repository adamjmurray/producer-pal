// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-utils.ts";
import { processClipIteration } from "./create-clip-helpers.ts";
import { calculateClipLength } from "./create-clip-validation-helpers.ts";

export interface CreateClipsParams {
  view: string;
  trackIndex: number;
  sceneIndices: number[];
  arrangementStarts: string[];
  baseName: string | null;
  parsedNames: string[] | null;
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
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  length: string | null;
  sampleFile: string | null;
  deadline: number | null;
  code: string | null;
  transformedCount: number | undefined;
}

/**
 * Creates clips by iterating over positions for a single view
 * @param params - All parameters for clip creation
 * @returns Array of created clips
 */
export async function createClips(
  params: CreateClipsParams,
): Promise<object[]> {
  const {
    view,
    trackIndex,
    sceneIndices,
    arrangementStarts,
    baseName,
    parsedNames,
    nameStartIndex,
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
  } = params;

  const createdClips: object[] = [];
  const positions = view === "session" ? sceneIndices : arrangementStarts;
  const count = positions.length;
  const clipLength = params.initialClipLength;

  for (let i = 0; i < count; i++) {
    if (isDeadlineExceeded(deadline)) {
      console.warn(
        `Deadline exceeded after creating ${createdClips.length} of ${count} clips`,
      );
      break;
    }

    const clipName = getNameForIndex(
      baseName ?? undefined,
      nameStartIndex + i,
      parsedNames,
    );

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
        transformedCount,
      );

      createdClips.push(clipResult);

      // Apply code execution to the newly created clip
      const clipId = code != null ? (clipResult as { id?: string }).id : null;

      if (clipId != null && code != null) {
        const noteCount = await applyCodeToSingleClip(clipId, code);

        if (noteCount != null) {
          (clipResult as { noteCount?: number }).noteCount = noteCount;
        }
      }
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

interface PreparedClipData {
  notes: MidiNote[];
  clipLength: number;
  transformedCount: number | undefined;
}

/**
 * Prepares clip data (notes and initial length) based on clip type
 * @param sampleFile - Audio file path (if audio clip)
 * @param notationString - MIDI notation string (if MIDI clip)
 * @param transformString - Transform expressions to apply to notes
 * @param endBeats - End position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Object with notes array and clipLength
 */
export function prepareClipData(
  sampleFile: string | null,
  notationString: string | null,
  transformString: string | null,
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

  // Apply transforms to notes if provided
  const transformedCount = applyTransforms(
    notes,
    transformString ?? undefined,
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

  return { notes, clipLength, transformedCount };
}
