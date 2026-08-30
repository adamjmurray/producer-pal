// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { requireCreatedSessionClip } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { rawNotesToNoteEvents, readAllClipNotes } from "./clip-notes.ts";

/** Everything read off a MIDI source before the new clip exists. */
interface ClipSnapshot {
  length: number;
  notes: NoteEvent[];
  /** The source's own color, read only when there is no override to use. */
  color: unknown;
  properties: Record<string, unknown>;
}

/** Everything read off an audio source before the new clip exists. */
interface AudioClipSnapshot {
  filePath: string;
  color: unknown;
  properties: Record<string, unknown>;
}

/** How a destination makes the empty clip the snapshot is poured into. */
interface RecreateTarget {
  createMidi: (length: number) => LiveAPI;
  createAudio: (filePath: string) => LiveAPI;
}

/**
 * Re-create a clip in the arrangement, somewhere Live's own duplicate can't
 * reach: a MIDI clip from its notes, an audio clip from its sample.
 *
 * Used for both directions a take lane is involved in, because
 * `duplicate_clip_to_arrangement` handles neither: a TakeLane has no duplicate
 * API at all, and the Track-scoped one silently no-ops when the SOURCE is a
 * take-lane clip. Both destinations answer `create_midi_clip` and
 * `create_audio_clip`, so one function covers both.
 * @param sourceClip - The clip being copied
 * @param destination - Where to create it: a TakeLane, or a Track for the main lane
 * @param startBeats - Arrangement start position in Ableton beats
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @returns The created clip
 */
export function recreateClip(
  sourceClip: LiveAPI,
  destination: LiveAPI,
  startBeats: number,
  name: string | undefined,
  color: string | undefined,
): LiveAPI {
  return recreateInto(sourceClip, name, color, {
    createMidi: (length) =>
      createdArrangementClip(
        destination.call("create_midi_clip", startBeats, length) as string,
      ),
    createAudio: (filePath) =>
      createdArrangementClip(
        destination.call("create_audio_clip", filePath, startBeats) as string,
      ),
  });
}

/**
 * Re-create a clip in a session clip slot, the direction Live has no duplicate
 * API for at all — nothing copies an arrangement clip into a slot.
 *
 * The slot must already be empty: Live refuses a create over an existing clip
 * rather than replacing it, unlike the arrangement lanes.
 * @param sourceClip - The clip being copied
 * @param clipSlot - The empty ClipSlot to create in
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @returns The created clip
 */
export function recreateClipInSlot(
  sourceClip: LiveAPI,
  clipSlot: LiveAPI,
  name: string | undefined,
  color: string | undefined,
): LiveAPI {
  return recreateInto(sourceClip, name, color, {
    createMidi: (length) => {
      clipSlot.call("create_clip", length);

      return requireCreatedSessionClip(clipSlot, "MIDI");
    },
    createAudio: (filePath) => {
      clipSlot.call("create_audio_clip", filePath);

      return requireCreatedSessionClip(clipSlot, "audio");
    },
  });
}

/**
 * Whether a clip can be re-created at all. A MIDI clip always can; an audio clip
 * is rebuilt from its sample, so it needs a `file_path`.
 * @param clip - The clip being copied
 * @returns True when {@link recreateClip} can rebuild it
 */
export function canRecreateClip(clip: LiveAPI): boolean {
  return (
    clip.getProperty("is_midi_clip") === 1 ||
    Boolean(clip.getProperty("file_path"))
  );
}

/**
 * What re-creating this clip loses, as a warning parenthetical, or "" when it
 * loses nothing.
 *
 * Envelopes: `has_envelopes` covers clip envelopes and automation alike, and
 * neither can be read back out without naming a specific DeviceParameter.
 *
 * Warp markers: an audio copy is built from the sample, so it gets the sample's
 * default markers. Live reports success for `add_warp_marker` and
 * `move_warp_marker` and then does nothing, so hand-edited markers can't be put
 * back. Defaults do come across unchanged, hence "reset", not "lost".
 * @param sourceClip - The clip being copied
 * @returns The losses, joined, or "" when there are none
 */
export function recreatedClipLosses(sourceClip: LiveAPI): string {
  const losses: string[] = [];

  if (sourceClip.getProperty("has_envelopes") === 1) {
    losses.push("automation envelopes aren't copied");
  }

  if (
    sourceClip.getProperty("is_midi_clip") !== 1 &&
    sourceClip.getProperty("warping") === 1
  ) {
    losses.push("warp markers reset to the sample's defaults");
  }

  return losses.join("; ");
}

// --- Helpers below main exports ---

/**
 * Read the source, make the new clip, and pour the source's state into it.
 *
 * Re-creating over an existing arrangement clip truncates the one already there
 * and lands intact itself. That existing clip can be the source (copying a take
 * onto its own lane), which is why everything is read off the source first;
 * reading after would copy the truncation, or nothing at all.
 * @param sourceClip - The clip being copied
 * @param name - Name override, or undefined to keep the source's
 * @param color - Color override, or undefined to keep the source's
 * @param target - How the destination makes the empty clip
 * @returns The created clip
 */
function recreateInto(
  sourceClip: LiveAPI,
  name: string | undefined,
  color: string | undefined,
  target: RecreateTarget,
): LiveAPI {
  if (sourceClip.getProperty("is_midi_clip") === 1) {
    const snapshot = snapshotClip(sourceClip, name, color);
    const newClip = target.createMidi(snapshot.length);

    if (snapshot.notes.length > 0) {
      newClip.call("add_new_notes", { notes: snapshot.notes });
    }

    newClip.setAll(snapshot.properties);
    applyColor(newClip, color, snapshot.color);

    return newClip;
  }

  const snapshot = snapshotAudioClip(sourceClip, name, color);
  const newClip = target.createAudio(snapshot.filePath);

  newClip.setAll(snapshot.properties);
  applyColor(newClip, color, snapshot.color);

  return newClip;
}

/**
 * Wrap what an arrangement create call returned, failing loudly when Live made
 * nothing.
 * @param createResult - What `create_midi_clip`/`create_audio_clip` returned
 * @returns The new clip
 */
function createdArrangementClip(createResult: string): LiveAPI {
  const newClip = LiveAPI.from(createResult);

  if (!newClip.exists()) {
    throw new Error("failed to create Arrangement clip");
  }

  return newClip;
}

/**
 * Apply the copy's color: the override when there is one, else the source's.
 * @param newClip - The clip just created
 * @param color - Color override, or undefined to keep the source's
 * @param sourceColor - The source's color, from the snapshot
 */
function applyColor(
  newClip: LiveAPI,
  color: string | undefined,
  sourceColor: unknown,
): void {
  if (color != null) {
    newClip.setColor(color);
  } else {
    newClip.set("color", sourceColor);
  }
}

/**
 * Read everything the copy needs off the source, before anything can change it.
 * @param sourceClip - The clip being copied
 * @param name - Name override, or undefined to keep the source's
 * @param color - Color override, or undefined to keep the source's
 * @returns The source's length, notes, color, and clip properties
 */
function snapshotClip(
  sourceClip: LiveAPI,
  name: string | undefined,
  color: string | undefined,
): ClipSnapshot {
  // readAllClipNotes reads the full [-length, 2*length] window, so a pickup
  // (negative start_time) before the clip start and any overhang past the end
  // come along. Strip Live's extra note properties (note_id, mute,
  // release_velocity) so stale ids aren't re-fed when copying one source to
  // multiple positions.
  const notes = rawNotesToNoteEvents(readAllClipNotes(sourceClip));

  return {
    length: sourceClip.getProperty("length") as number,
    notes,
    color: color == null ? sourceClip.getProperty("color") : null,
    // Order mirrors create-clip's buildClipProperties to satisfy Live's
    // loop_end > loop_start constraint while applying values. Name falls back to
    // the source so an un-overridden duplicate matches it (as native duplicate
    // does).
    properties: {
      start_marker: sourceClip.getProperty("start_marker"),
      loop_start: sourceClip.getProperty("loop_start"),
      loop_end: sourceClip.getProperty("loop_end"),
      end_marker: sourceClip.getProperty("end_marker"),
      looping: sourceClip.getProperty("looping"),
      signature_numerator: sourceClip.getProperty("signature_numerator"),
      signature_denominator: sourceClip.getProperty("signature_denominator"),
      name: name ?? sourceClip.getProperty("name"),
    },
  };
}

/**
 * Read everything an audio copy needs off the source, before anything can
 * change it.
 * @param sourceClip - The clip being copied
 * @param name - Name override, or undefined to keep the source's
 * @param color - Color override, or undefined to keep the source's
 * @returns The source's sample path, color, and clip properties
 */
function snapshotAudioClip(
  sourceClip: LiveAPI,
  name: string | undefined,
  color: string | undefined,
): AudioClipSnapshot {
  const filePath = sourceClip.getProperty("file_path") as string | null;

  // Guarded by canRecreateClip in the caller, so reaching this means the clip
  // lost its sample between the check and here.
  if (!filePath) {
    throw new Error("audio clip has no sample file");
  }

  return {
    filePath,
    color: color == null ? sourceClip.getProperty("color") : null,
    properties: {
      // Warping decides whether the marker properties below are in beats or in
      // seconds, so it goes on first — the values were read in the source's
      // unit, and only match once the copy warps the same way.
      warping: sourceClip.getProperty("warping"),
      warp_mode: sourceClip.getProperty("warp_mode"),
      // Loop points only stick once looping is set. Written before it, Live
      // silently snaps them back to the whole sample.
      looping: sourceClip.getProperty("looping"),
      loop_start: sourceClip.getProperty("loop_start"),
      loop_end: sourceClip.getProperty("loop_end"),
      start_marker: sourceClip.getProperty("start_marker"),
      end_marker: sourceClip.getProperty("end_marker"),
      signature_numerator: sourceClip.getProperty("signature_numerator"),
      signature_denominator: sourceClip.getProperty("signature_denominator"),
      gain: sourceClip.getProperty("gain"),
      pitch_coarse: sourceClip.getProperty("pitch_coarse"),
      pitch_fine: sourceClip.getProperty("pitch_fine"),
      name: name ?? sourceClip.getProperty("name"),
    },
  };
}
