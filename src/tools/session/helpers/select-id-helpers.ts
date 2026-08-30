// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { namedParam, paramNamesSomething } from "#src/tools/shared/utils.ts";
import { parseSlot } from "#src/tools/shared/validation/position-parsing.ts";
import { buildTrackPath, isSameLiveApiId } from "./select-helpers.ts";
import { rackOfTarget } from "./select-rack-helpers.ts";

export type DetectedType =
  | "track"
  | "scene"
  | "clip"
  | "device"
  | "rack-target";

/** What the caller's ids resolved to, one slot per kind. */
export interface ResolvedIds {
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  /** A DrumPad or a rack chain: selected on its rack, not on the song view. */
  rackTargetId?: string;
}

/** `id` and the alias params that fold onto it, in the order they're read. */
export interface SelectIdArgs {
  id?: string;
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
}

interface ResolveIdResult extends ResolvedIds {
  detectedType: DetectedType;
}

/** An id as the caller sent it, with the param it came from for messages. */
interface NamedId {
  label: string;
  id: string;
}

/** The id filling each slot, so a conflict can name both params. */
type FilledSlots = Partial<Record<keyof ResolvedIds, NamedId>>;

const ID_ALIASES = ["trackId", "sceneId", "clipId", "deviceId"] as const;

/** The slot each detected type fills. */
const SLOT_BY_TYPE = {
  track: "trackId",
  scene: "sceneId",
  clip: "clipId",
  device: "deviceId",
  "rack-target": "rackTargetId",
} as const satisfies Record<DetectedType, keyof ResolvedIds>;

/** What a slot holds, for the conflict message. */
const KIND_BY_SLOT: Record<keyof ResolvedIds, string> = {
  trackId: "tracks",
  sceneId: "scenes",
  clipId: "clips",
  deviceId: "devices",
  rackTargetId: "rack targets",
};

/** Which slots name something that lives on a track, and Live selects that
 * track along with them — so a disagreeing `trackId` would be reported as
 * selected while Live sits somewhere else. */
const SLOTS_ON_A_TRACK = ["clipId", "deviceId", "rackTargetId"] as const;

/**
 * Read every spelling of `id` the caller sent as a target of its own. Each is
 * type-detected separately, so `{trackId, sceneId}` selects both — the pair
 * `trackIndex`/`sceneIndex` already supports. Two ids landing in the same slot,
 * or naming objects that can't be selected together, is a refusal: honoring one
 * and dropping the other is the silent-wrong-target bug.
 * @param args - The id params as the tool received them
 * @returns The ids, one per kind
 */
export function resolveNamedIds(args: SelectIdArgs): ResolvedIds {
  const filled: FilledSlots = {};

  for (const named of namedSelectIds(args)) {
    const slot = SLOT_BY_TYPE[resolveIdParam(named.id).detectedType];
    const taken = filled[slot];

    if (taken == null) {
      filled[slot] = named;
    } else if (!isSameLiveApiId(taken.id, named.id)) {
      throw idConflict(taken, named, KIND_BY_SLOT[slot]);
    }
  }

  assertIdsAgree(filled);

  return {
    trackId: filled.trackId?.id,
    sceneId: filled.sceneId?.id,
    clipId: filled.clipId?.id,
    deviceId: filled.deviceId?.id,
    rackTargetId: filled.rackTargetId?.id,
  };
}

/**
 * Auto-detect ID type and map to specific param
 * @param id - Live API object ID
 * @returns Resolved ID with detected type
 */
export function resolveIdParam(id: string): ResolveIdResult {
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    throw new Error(`select failed: id "${id}" does not exist`);
  }

  const type = object.type;

  if (type === "Track") return { trackId: id, detectedType: "track" };
  if (type === "Scene") return { sceneId: id, detectedType: "scene" };
  if (type === "Clip") return { clipId: id, detectedType: "clip" };

  if (type.endsWith("Device")) {
    return { deviceId: id, detectedType: "device" };
  }

  if (type === "DrumPad" || type === "DrumChain" || type === "Chain") {
    return { rackTargetId: id, detectedType: "rack-target" };
  }

  throw new Error(`select failed: id "${id}" has unsupported type "${type}"`);
}

/**
 * Parse a clipSlot string into trackIndex and sceneIndex
 * @param input - Slot string (e.g. "0/3")
 * @returns Parsed slot position
 */
export function parseClipSlot(input: string): {
  trackIndex: number;
  sceneIndex: number;
} {
  return parseSlot(input);
}

interface AutoDetailViewOptions {
  clipId?: string;
  deviceId?: string;
  devicePath?: string;
  hasRackTarget?: boolean;
  clipSlotHasClip?: boolean;
  viewOnly?: boolean;
}

/**
 * Determine auto detail view based on what was selected
 * @param options - Selection state
 * @param options.clipId - Clip ID if selected
 * @param options.deviceId - Device ID if selected
 * @param options.devicePath - Device path if selected
 * @param options.hasRackTarget - Whether a drum pad or rack chain was selected
 * @param options.clipSlotHasClip - Whether the clip slot has a clip
 * @param options.viewOnly - Whether only the view param was provided
 * @returns Detail view to apply, or undefined to leave unchanged
 */
export function determineAutoDetailView({
  clipId,
  deviceId,
  devicePath,
  hasRackTarget,
  clipSlotHasClip,
  viewOnly,
}: AutoDetailViewOptions): "clip" | "device" | "none" | undefined {
  if (clipId != null || clipSlotHasClip) return "clip";
  if (deviceId != null || devicePath != null || hasRackTarget) return "device";
  if (viewOnly) return "none";

  return undefined;
}

// --- Helpers below main exports ---

/**
 * The ids the caller named, whatever they called them.
 * @param args - The id params as the tool received them
 * @returns One entry per spelling that named something, in read order
 */
function namedSelectIds(args: SelectIdArgs): NamedId[] {
  const named: NamedId[] = [];
  const id = namedParam(args.id, "id");

  if (id != null) named.push({ label: "id", id });

  for (const label of ID_ALIASES) {
    // A value naming nothing is dropped without a word: none of the four is
    // published, so "trackId names nothing" is a line about a param the caller
    // can't act on — and it would be four of them for a client that nulls
    // every unused field.
    const value = args[label];

    if (paramNamesSomething(value)) {
      named.push({ label, id: (value as string).trim() });
    }
  }

  return named;
}

/**
 * Refuse ids that name objects Live can't hold selected at once. Selecting a
 * clip, device, or rack target moves the track selection to whatever it sits
 * on, and a session clip moves the scene selection too, so a disagreeing
 * `trackId`/`sceneId` would be reported as selected while Live sits elsewhere.
 * @param filled - The id filling each slot
 */
function assertIdsAgree(filled: FilledSlots): void {
  const { trackId, sceneId, clipId, deviceId, rackTargetId } = filled;

  for (const slot of SLOTS_ON_A_TRACK) {
    const child = filled[slot];

    if (trackId != null && child != null) {
      assertSameObject(trackId.id, ownerTrackPath(child.id), () =>
        idConflict(trackId, child, "tracks"),
      );
    }
  }

  if (sceneId != null && clipId != null) {
    assertSameObject(sceneId.id, sceneOfClip(clipId.id), () =>
      idConflict(sceneId, clipId, "scenes"),
    );
  }

  // Both write select_device, and the rack target's goes last, so a different
  // device would be reported as selected after being replaced on screen.
  if (deviceId != null && rackTargetId != null) {
    const rack = rackOfTarget(LiveAPI.from(rackTargetId.id));

    if (!isSameLiveApiId(rack.id, deviceId.id)) {
      throw idConflict(deviceId, rackTargetId, "devices");
    }
  }
}

/**
 * Where an object's track lives, the way `buildTrackPath` spells it.
 * @param id - A clip, device, or rack-target id
 * @returns The track's path, or null when the object names none
 */
function ownerTrackPath(id: string): PathLike | null {
  const object = LiveAPI.from(id);
  const category = object.category;

  return buildTrackPath(
    category,
    category === "return" ? object.returnTrackIndex : object.trackIndex,
  );
}

/**
 * The scene a clip sits in. Only a session clip has one — an arrangement clip
 * is placed on a timeline, and select reports the arrangement view for it.
 * @param clipId - The clip's id
 * @returns The scene's path, or null for an arrangement clip
 */
function sceneOfClip(clipId: string): PathLike | null {
  const sceneIndex = LiveAPI.from(clipId).clipSlotIndex;

  return sceneIndex == null ? null : livePath.scene(sceneIndex);
}

/**
 * Refuse an id that isn't the object sitting at the given path.
 * @param id - The id the caller passed
 * @param path - Where the other id says that object is
 * @param error - The conflict to throw
 */
function assertSameObject(
  id: string,
  path: PathLike | null,
  error: () => Error,
): void {
  if (path == null) return;

  const object = LiveAPI.from(path);

  // A path naming nothing is the existence checks' problem, not this one's.
  if (object.exists() && !isSameLiveApiId(object.id, id)) {
    throw error();
  }
}

/**
 * The one error every id-versus-id disagreement is reported as.
 * @param first - The id read first
 * @param second - The id that disagreed with it
 * @param kind - What the two named, pluralized
 * @returns The error to throw
 */
function idConflict(first: NamedId, second: NamedId, kind: string): Error {
  return new Error(
    `select failed: ${first.label} and ${second.label} name different ${kind}; send one`,
  );
}
