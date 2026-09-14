// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import {
  requireCreatedClip,
  requireCreatedSessionClip,
} from "#src/tools/clip/helpers/clip-results.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type CopiedNote,
  rawNotesToCopiedNotes,
  readAllClipNotes,
} from "./clip-notes.ts";

/**
 * Thrown when the clip was created but a later step — notes, properties, color
 * — failed. A real clip is now sitting at the destination, and
 * {@link partialClip} is it, so a caller can report it instead of treating the
 * move as a no-op.
 */
export class PartialRecreateError extends Error {
  // Assigned in the body, not as a parameter property: Node's strip-only
  // TypeScript mode can't parse those, and the build scripts run under it.
  readonly partialClip: LiveAPI;

  /**
   * @param message - What failed, from the step that threw
   * @param partialClip - The clip that landed before the failure
   */
  constructor(message: string, partialClip: LiveAPI) {
    super(message);
    this.name = "PartialRecreateError";
    this.partialClip = partialClip;
  }
}

/** Everything read off a MIDI source before the new clip exists. */
interface ClipSnapshot {
  length: number;
  notes: CopiedNote[];
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
 * Used for both take-lane directions, because `duplicate_clip_to_arrangement`
 * handles neither: a TakeLane has no duplicate API, and the Track-scoped one
 * silently no-ops when the SOURCE is a take-lane clip. Both destinations answer
 * `create_midi_clip` and `create_audio_clip`.
 * @param sourceClip - The clip being copied
 * @param destination - Where to create it: a TakeLane, or a Track for the main lane
 * @param startBeats - Arrangement start position in Ableton beats
 * @param name - Name for the new clip
 * @param color - Color for the new clip
 * @param losses - Collects what the copy turned out to lose, on top of what
 *   {@link recreatedClipLosses} knew up front
 * @returns The created clip
 */
export function recreateClip(
  sourceClip: LiveAPI,
  destination: LiveAPI,
  startBeats: number,
  name: string | undefined,
  color: string | undefined,
  losses: string[],
): LiveAPI {
  return recreateInto(sourceClip, name, color, losses, {
    createMidi: (length) =>
      createdArrangementClip(
        destination.call("create_midi_clip", startBeats, length) as string,
        destination,
      ),
    createAudio: (filePath) =>
      createdArrangementClip(
        destination.call("create_audio_clip", filePath, startBeats) as string,
        destination,
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
 * @param losses - Collects what the copy turned out to lose, on top of what
 *   {@link recreatedClipLosses} knew up front
 * @returns The created clip
 */
export function recreateClipInSlot(
  sourceClip: LiveAPI,
  clipSlot: LiveAPI,
  name: string | undefined,
  color: string | undefined,
  losses: string[],
): LiveAPI {
  const position = pathPrefix(clipSlot);

  return recreateInto(sourceClip, name, color, losses, {
    createMidi: (length) => {
      clipSlot.call("create_clip", length);

      return requireCreatedSessionClip(clipSlot, position);
    },
    createAudio: (filePath) => {
      clipSlot.call("create_audio_clip", filePath);

      return requireCreatedSessionClip(clipSlot, position);
    },
  });
}

/**
 * Whether a clip can be re-created at all. A MIDI clip always can; an audio clip
 * is rebuilt from its sample, so it needs a `file_path`. A non-empty
 * `file_path` only means Live once saw a sample there — not that the file is
 * still on disk, so the create itself can still fail (there's no filesystem
 * access here to check first).
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
 * What re-creating this clip is known to lose before the copy exists. The
 * re-create appends anything it finds to the same list, so pass it along.
 *
 * Envelopes: `has_envelopes` covers clip envelopes and automation alike, and
 * neither can be read back out without naming a specific DeviceParameter.
 *
 * Warp markers: an audio copy is built from the sample, so it gets the sample's
 * default markers. Live reports success for `add_warp_marker` and
 * `move_warp_marker` and then does nothing, so hand-edited markers can't be put
 * back. Defaults do come across unchanged, hence "reset", not "lost".
 *
 * Clip scale is missing on purpose: Live 12.4 puts no scale property on a Clip
 * at all, so there is nothing to copy or report.
 * @param sourceClip - The clip being copied
 * @returns The losses, empty when there are none
 */
export function recreatedClipLosses(sourceClip: LiveAPI): string[] {
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

  return losses;
}

/**
 * The losses as a parenthetical for the clip's own entry, or "" when the copy
 * cost nothing.
 * @param losses - What the re-create lost
 * @returns " (a; b)", or ""
 */
export function recreateLossesNote(losses: string[]): string {
  return losses.length > 0 ? ` (${losses.join("; ")})` : "";
}

// --- Helpers below main exports ---

/**
 * Read the source, make the new clip, and pour the source's state into it.
 *
 * Everything is read off the source FIRST: a create truncates whatever it lands
 * on, and that can be the source itself (copying a take onto its own lane), so
 * reading after would copy the truncation or nothing at all.
 *
 * The create either lands a real clip or throws, so once it returns, a failure
 * in a later step still leaves that clip behind — hence
 * {@link PartialRecreateError}.
 * @param sourceClip - The clip being copied
 * @param name - Name override, or undefined to keep the source's
 * @param color - Color override, or undefined to keep the source's
 * @param losses - Collects what the copy turned out to lose
 * @param target - How the destination makes the empty clip
 * @returns The created clip
 */
function recreateInto(
  sourceClip: LiveAPI,
  name: string | undefined,
  color: string | undefined,
  losses: string[],
  target: RecreateTarget,
): LiveAPI {
  if (sourceClip.getProperty("is_midi_clip") === 1) {
    const snapshot = snapshotClip(sourceClip, name, color);
    const newClip = target.createMidi(snapshot.length);

    try {
      if (snapshot.notes.length > 0) {
        newClip.call("add_new_notes", { notes: snapshot.notes });
      }

      newClip.setAll(snapshot.properties);
      applyColor(newClip, color, snapshot.color);
      noteGrooveLoss(newClip, snapshot.properties.groove, losses);
    } catch (error) {
      throw new PartialRecreateError(errorMessage(error), newClip);
    }

    return newClip;
  }

  const snapshot = snapshotAudioClip(sourceClip, name, color);
  const newClip = target.createAudio(snapshot.filePath);

  try {
    newClip.setAll(snapshot.properties);
    applyColor(newClip, color, snapshot.color);
    noteGrooveLoss(newClip, snapshot.properties.groove, losses);
  } catch (error) {
    throw new PartialRecreateError(errorMessage(error), newClip);
  }

  return newClip;
}

/**
 * Wrap what an arrangement create call returned, failing loudly when Live made
 * no clip. An arrangement create can answer with another object entirely, so
 * this goes through the same guard the create-clip paths use.
 * @param createResult - What `create_midi_clip`/`create_audio_clip` returned
 * @param destination - The lane it was asked for, to name in the error
 * @returns The new clip
 */
function createdArrangementClip(
  createResult: string,
  destination: LiveAPI,
): LiveAPI {
  return requireCreatedClip(
    LiveAPI.from(createResult),
    pathPrefix(destination),
  );
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
  // come along. Only note_id is stripped, so a stale id isn't re-fed when
  // copying one source to several positions.
  const notes = rawNotesToCopiedNotes(readAllClipNotes(sourceClip));

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
      // No tool writes `muted`, so a copy that arrives unmuted can only be
      // re-muted by hand in Live.
      muted: sourceClip.getProperty("muted"),
      name: name ?? sourceClip.getProperty("name"),
      groove: sourceGroove(sourceClip),
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
      muted: sourceClip.getProperty("muted"),
      name: name ?? sourceClip.getProperty("name"),
      groove: sourceGroove(sourceClip),
    },
  };
}

/**
 * The source's groove as the "id N" string `set` wants, or undefined when it
 * has none (setAll skips that). getChildIds gives the id without building the
 * Groove object.
 * @param sourceClip - The clip being copied
 * @returns The groove's id, or undefined
 */
/**
 * Say so when a groove the source had didn't take. Live answers a `set` the
 * same way whether or not it landed, so the copy is read back; the groove pool
 * can't be filled through the API, so no test can prove the write works.
 * @param newClip - The clip just created
 * @param groove - The source's groove id, or undefined when it had none
 * @param losses - What the re-create lost, added to
 */
function noteGrooveLoss(
  newClip: LiveAPI,
  groove: unknown,
  losses: string[],
): void {
  if (groove != null && newClip.getProperty("has_groove") !== 1) {
    losses.push("groove isn't copied");
  }
}

function sourceGroove(sourceClip: LiveAPI): string | undefined {
  return sourceClip.getProperty("has_groove") === 1
    ? sourceClip.getChildIds("groove")[0]
    : undefined;
}
