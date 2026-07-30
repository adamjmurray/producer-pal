// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { interpretNotation } from "#src/notation/notation.ts";
import { dedupeAndSortNotes, sortNotes } from "#src/notation/note-sort.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { type Notation } from "#src/shared/notation.ts";
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
  /** Requested audio warp state, or null to keep Live's own choice */
  warping: boolean | null;
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

    await createClipAtIndex(params, transformInputs, i, createdClips);
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
 * @param createdClips - Accumulator the created clip is pushed onto
 */
async function createClipAtIndex(
  params: CreateClipsParams,
  transformInputs: ClipTransformInputs,
  i: number,
  createdClips: object[],
): Promise<void> {
  const { view, baseName, parsedNames, parsedColors, nameStartIndex, code } =
    params;

  // clip.index/clip.count (transforms and code-exec) span the whole create
  // batch, not just this view: a single call mixing session slots and
  // arrangement positions runs createClips once per view, so the global index
  // is nameStartIndex + i (session view starts at 0, arrangement at
  // sessionSlots.length) and the count is the combined total. This mirrors the
  // continuous indexing already used for names/colors below.
  const globalIndex = nameStartIndex + i;
  const totalCount =
    params.sessionSlots.length + params.arrangementStarts.length;

  const clipName = getNameForIndex(
    baseName ?? undefined,
    globalIndex,
    parsedNames,
  );
  const clipColor = getColorForIndex(
    params.color ?? undefined,
    globalIndex,
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
    globalIndex,
    totalCount,
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
      params.warping,
    );

    createdClips.push(clipResult);

    // Apply code execution to the newly created clip
    const clipId = code != null ? (clipResult as { id?: string }).id : null;

    if (clipId != null && code != null) {
      const noteCount = await applyCodeToSingleClip(
        clipId,
        code,
        globalIndex,
        totalCount,
      );

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
 * @param notation - Global notation setting the notes string is written in (default barbeat)
 * @param transformString - Transform expressions (if any), or null
 * @returns Object with notes array and clipLength
 */
export function prepareClipData(
  sampleFile: string | null,
  notationString: string | null,
  endBeats: number | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  notation: Notation | undefined,
  transformString: string | null,
): PreparedClipData {
  // Parse notation into notes (MIDI clips only)
  const interpretedNotes: MidiNote[] =
    notationString != null
      ? interpretNotation(notationString, {
          notation,
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Order the shared notes ascending by start_time for the eventual
  // add_new_notes write. Same-pitch+start collisions are dropped (keep-last) and
  // warned ONLY when no transform will run: a timing transform can pull two
  // colliding onsets apart, so dropping them up front would lose notes
  // update-clip keeps. With a transform, keep the duplicates here and let the
  // per-clip transform re-dedupe AFTER transforming (resolveClipTransform),
  // matching update-clip's transform-then-dedupe order.
  const notes =
    transformString != null
      ? sortNotes(interpretedNotes)
      : dropDuplicateNotes(interpretedNotes);

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

/**
 * Drop same-pitch+start collisions (keep-last), sort ascending by start_time,
 * and warn how many were dropped so the LLM sees it. Used on the no-transform
 * create path; the transform path defers deduping until after transforming.
 * @param interpretedNotes - Notes as interpreted from the notation
 * @returns The deduped, sorted notes
 */
function dropDuplicateNotes(interpretedNotes: MidiNote[]): MidiNote[] {
  const { notes, collisions } = dedupeAndSortNotes(interpretedNotes);

  if (collisions > 0) {
    console.warn(
      `Dropped ${collisions} duplicate note${collisions === 1 ? "" : "s"} at the same pitch and start`,
    );
  }

  return notes;
}
