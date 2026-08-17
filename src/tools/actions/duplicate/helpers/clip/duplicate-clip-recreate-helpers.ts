// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  rawNotesToNoteEvents,
  readAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../duplicate-helpers.ts";

/**
 * Goes in every warning about a copy this file re-created, since re-creating
 * copies notes and not automation. Unconditional: reading a clip's envelopes
 * needs a specific DeviceParameter, so there is no way to ask whether one has
 * any.
 */
export const NO_ENVELOPES_NOTE = "automation envelopes aren't copied";

/**
 * Re-create a MIDI clip somewhere Live's own arrangement duplicate can't reach,
 * copying the source's notes and loop/marker/signature properties.
 *
 * Used for both directions a take lane is involved in, because
 * `duplicate_clip_to_arrangement` handles neither: a TakeLane has no duplicate
 * API at all, and the Track-scoped one silently no-ops when the SOURCE is a
 * take-lane clip. Both destinations answer `create_midi_clip`, so one function
 * covers both.
 *
 * Re-creating over an existing clip truncates the one already there and lands
 * intact itself — the same replace behavior as writing to the main lane, so
 * neither destination needs an overlap guard.
 * @param sourceClip - The clip being copied
 * @param destination - Where to create it: a TakeLane, or a Track for the main lane
 * @param startBeats - Arrangement start position in Ableton beats
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @returns Minimal clip info for the created clip
 */
export function recreateMidiClip(
  sourceClip: LiveAPI,
  destination: LiveAPI,
  startBeats: number,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo {
  const length = sourceClip.getProperty("length") as number;
  const newClipResult = destination.call(
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
