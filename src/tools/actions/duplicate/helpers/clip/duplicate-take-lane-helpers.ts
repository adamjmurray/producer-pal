// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  assertAllTakeLanesFit,
  resolveTakeLane,
  takeLaneKey,
  type ArrangementTrack,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  rawNotesToNoteEvents,
  readAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../duplicate-helpers.ts";

/**
 * Resolve every take lane a duplicate's destinations name, auto-creating as
 * needed.
 *
 * Lanes are permanent (Live has no delete), so every destination's capacity is
 * checked before any lane is created — a cap error partway through would strand
 * the lanes already made. MIDI only: an audio source warns and gets no lanes,
 * which skips its lane copies while its main-lane copies still run.
 * @param sourceClip - The clip being duplicated
 * @param id - Source clip ID (for messages)
 * @param targets - Destinations, in copy order
 * @param takeLaneName - Name for a take lane newly created by this call
 * @returns Lanes keyed by {@link takeLaneKey}
 */
export function resolveDuplicateTakeLanes(
  sourceClip: LiveAPI,
  id: string,
  targets: ArrangementTrack[],
  takeLaneName: string | undefined,
): Map<string, LiveAPI> {
  const laneTargets = targets.filter((target) => target.takeLane != null);

  if (laneTargets.length === 0) return new Map();

  if (sourceClip.getProperty("is_midi_clip") !== 1) {
    console.warn(
      `duplicate: take lanes hold MIDI clips only; audio clip "${id}" was not duplicated to a take lane`,
    );

    return new Map();
  }

  assertAllTakeLanesFit(laneTargets);

  const lanes = new Map<string, LiveAPI>();

  // Resolve once per destination rather than once per copy — otherwise a single
  // "l+" cycled over three arrangementStarts gets three fresh lanes.
  for (const destination of laneTargets) {
    const { trackIndex } = destination;
    const target = destination.takeLane as TakeLaneTarget;
    const key = takeLaneKey(destination);

    if (lanes.has(key)) continue;

    const { lane, laneIndex } = resolveTakeLane(
      LiveAPI.from(livePath.track(trackIndex)),
      target,
      takeLaneName,
    );

    lanes.set(key, lane);
    console.warn(
      `duplicate: created on take lane "t${trackIndex}/l${laneIndex}". ` +
        "Expand the take-lanes arrow on the track header in Live to see it.",
    );
  }

  return lanes;
}

/**
 * Re-create a MIDI clip on a take lane, copying the source's notes and
 * loop/marker/signature properties. Like the main lane, re-creating over an
 * existing clip replaces/truncates it (no overlap guard).
 * @param sourceClip - The clip being copied
 * @param lane - The destination take lane LiveAPI object
 * @param startBeats - Arrangement start position in Ableton beats
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @returns Minimal clip info for the created clip
 */
export function copyMidiClipToTakeLane(
  sourceClip: LiveAPI,
  lane: LiveAPI,
  startBeats: number,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo {
  const length = sourceClip.getProperty("length") as number;
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
