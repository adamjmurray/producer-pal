// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  resolveTakeLane,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  rawNotesToNoteEvents,
  readAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "./duplicate-helpers.ts";

/**
 * Duplicate a MIDI clip onto a take lane at one or more arrangement positions.
 *
 * Take lanes have no `duplicate_clip_to_arrangement`, so this re-creates the
 * clip on the lane via `create_midi_clip` and copies the notes plus loop/marker
 * properties. MIDI only: audio sources warn and are skipped (no v1 take-lane
 * audio support). Like the main lane, re-creating over an existing clip
 * replaces/truncates it (no overlap guard).
 * @param sourceClip - The clip being duplicated
 * @param id - Source clip ID (for messages)
 * @param positionsInBeats - Target arrangement start positions in Ableton beats
 * @param name - Base name (comma-separated for per-clip names)
 * @param color - Base color (comma-separated, cycles)
 * @param target - Normalized take lane target (lane number or "new")
 * @param takeLaneName - Name for a take lane newly created by this call
 * @returns Array of minimal clip info objects for the created clips
 */
export function duplicateClipsToTakeLane(
  sourceClip: LiveAPI,
  id: string,
  positionsInBeats: number[],
  name: string | undefined,
  color: string | undefined,
  target: TakeLaneTarget,
  takeLaneName: string | undefined,
): object[] {
  if (sourceClip.getProperty("is_midi_clip") !== 1) {
    console.warn(
      `duplicate: takeLane supports MIDI clips only; audio clip "${id}" was not duplicated to a take lane`,
    );

    return [];
  }

  const trackIndex = sourceClip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `duplicate failed: no track index for clip id "${id}" (path=${sourceClip.path})`,
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  const length = sourceClip.getProperty("length") as number;
  const { lane, laneNumber } = resolveTakeLane(track, target, takeLaneName);

  const parsedNames = parseCommaSeparatedNames(name, positionsInBeats.length);
  const parsedColors = parseCommaSeparatedColors(
    color,
    positionsInBeats.length,
  );

  warnExtraNames(parsedNames, positionsInBeats.length, "duplicate");

  // Warn-and-continue on per-position failures: take lanes are append-only in
  // Live (no delete), so abandoning earlier successful clips on a hard throw
  // would leave them silently stranded. Mirrors create-clip-loop-helpers.ts.
  const created: MinimalClipInfo[] = [];

  for (let i = 0; i < positionsInBeats.length; i++) {
    const startBeats = positionsInBeats[i] as number;

    try {
      created.push(
        copyMidiClipToTakeLane(
          sourceClip,
          lane,
          startBeats,
          length,
          getNameForIndex(name, i, parsedNames),
          getColorForIndex(color, i, parsedColors),
        ),
      );
    } catch (error) {
      console.warn(
        `duplicate: failed to create take-lane clip at beat ${startBeats}: ${errorMessage(error)}`,
      );
    }
  }

  console.warn(
    `duplicate: created on take lane ${laneNumber}. Expand the take-lanes arrow on the track header in Live to see it.`,
  );

  return created;
}

/**
 * Re-create a MIDI clip on a take lane, copying the source's notes and
 * loop/marker/signature properties.
 * @param sourceClip - The clip being copied
 * @param lane - The destination take lane LiveAPI object
 * @param startBeats - Arrangement start position in Ableton beats
 * @param length - Source clip length in beats (clip creation + overlap window)
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @returns Minimal clip info for the created clip
 */
function copyMidiClipToTakeLane(
  sourceClip: LiveAPI,
  lane: LiveAPI,
  startBeats: number,
  length: number,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo {
  const newClipResult = lane.call(
    "create_midi_clip",
    startBeats,
    length,
  ) as string;
  const newClip = LiveAPI.from(newClipResult);

  if (!newClip.exists()) {
    throw new Error("failed to create Arrangement clip");
  }

  // Read the full [-length, 2*length] scan window (not just [0, length]) so a
  // pickup (negative start_time) before the clip start and any overhang past
  // the end are copied — same window every other clip-copy path uses. Reading
  // only from time 0 (the prior behavior) silently dropped pickups.
  const rawNotes = readAllClipNotes(sourceClip);

  if (rawNotes.length > 0) {
    // Strip Live's extra note properties (note_id, mute, release_velocity) so
    // stale ids aren't re-fed when copying one source to multiple positions.
    newClip.call("add_new_notes", { notes: rawNotesToNoteEvents(rawNotes) });
  }

  // Order mirrors create-clip's buildClipProperties to satisfy Live's
  // loop_end > loop_start constraint while applying values. Name/color fall back
  // to the source so an un-overridden duplicate matches it (as native duplicate
  // does); color is a Live int, so it bypasses setColor's #RRGGBB path.
  newClip.setAll({
    start_marker: sourceClip.getProperty("start_marker"),
    loop_start: sourceClip.getProperty("loop_start"),
    loop_end: sourceClip.getProperty("loop_end"),
    end_marker: sourceClip.getProperty("end_marker"),
    looping: sourceClip.getProperty("looping"),
    signature_numerator: sourceClip.getProperty("signature_numerator"),
    signature_denominator: sourceClip.getProperty("signature_denominator"),
    name: name ?? sourceClip.getProperty("name"),
  });

  if (color != null) {
    newClip.setColor(color);
  } else {
    newClip.set("color", sourceClip.getProperty("color"));
  }

  return getMinimalClipInfo(newClip);
}
