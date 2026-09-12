// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestMemo } from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { arrangementClipAtPosition } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import { requireCompletePosition } from "#src/tools/shared/validation/helpers/clip-source-path.ts";
import { type ArrangementPosition } from "#src/tools/shared/validation/helpers/object-path-coord.ts";
import {
  namedHiddenPath,
  requireClipSlotPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { parseSlot } from "#src/tools/shared/validation/position-parsing.ts";
import {
  namedIdParam,
  namedParam,
} from "#src/tools/shared/helpers/param-presence.ts";

/** Result type for resolveClip - either found clip or null response for empty slot */
export type ResolveClipResult =
  | { found: true; clip: LiveAPI }
  | { found: false; emptySlotResponse: EmptySlotResponse };

interface EmptySlotResponse {
  id: null;
  type: null;
  name: null;
  path: string;
}

/**
 * Resolve clip from either clipId or trackIndex/sceneIndex
 * @param clipId - Clip ID if provided
 * @param trackIndex - Track index (required if clipId not provided)
 * @param sceneIndex - Scene index (required if clipId not provided)
 * @param slotValidated - The caller already knows the slot is real (see ReadClipArgs)
 * @returns Object with either found clip or empty slot response
 */
export function resolveClip(
  clipId: string | null,
  trackIndex: number | null,
  sceneIndex: number | null,
  slotValidated = false,
): ResolveClipResult {
  if (clipId != null) {
    return { found: true, clip: validateIdType(clipId, "clip") };
  }

  // Go straight for the clip. A clip that answers proves its track and scene
  // are there, so checking them first only ever cost two objects per clip.
  const clip = LiveAPI.from(
    livePath
      .track(trackIndex as number)
      .clipSlot(sceneIndex as number)
      .clip(),
  );

  if (clip.exists()) {
    return { found: true, clip };
  }

  // Nothing there: either the slot is empty or the address names something
  // that doesn't exist, and only telling those apart needs the track and scene.
  if (!slotValidated) {
    assertSlotExists(trackIndex as number, sceneIndex as number);
  }

  return {
    found: false,
    emptySlotResponse: {
      id: null,
      type: null,
      name: null,
      path: slotPath(trackIndex as number, sceneIndex as number),
    },
  };
}

/**
 * Throw if a clip slot's track or scene isn't there, naming which one.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 */
function assertSlotExists(trackIndex: number, sceneIndex: number): void {
  if (!LiveAPI.from(livePath.track(trackIndex)).exists()) {
    throw new Error(`no track at "t${String(trackIndex)}"`);
  }

  if (!LiveAPI.from(livePath.scene(sceneIndex)).exists()) {
    throw new Error(`no scene at "s${String(sceneIndex)}"`);
  }
}

/**
 * Check if a track contains a Drum Rack anywhere in its device tree.
 * A Drum Rack nested inside instrument rack chains (at any depth, in any chain)
 * still puts the track in drum mode, so the whole tree is searched recursively.
 *
 * Memoized per track for the request, so a request reading many clips of one
 * track walks the tree once. Only read paths ask for the answer and none of
 * them mutate; a tool that changed a device tree or the track order and then
 * spelled notes would have to walk afresh.
 * @param trackIndex - Track index (0-based)
 * @returns True if any device (including nested rack devices) is a Drum Rack
 */
export function isDrumRackTrack(trackIndex: number): boolean {
  const trackPath = String(livePath.track(trackIndex));

  // The track is built inside the memo, so a repeat resolves nothing at all.
  return requestMemo(drumModeMemoKey(trackPath), () =>
    containerHasDrumRack(LiveAPI.from(trackPath)),
  );
}

/**
 * Drum-mode check for a track object already in hand. Batch readers that walk N
 * clips of one track call this once instead of paying a full device-tree walk
 * per clip via {@link isDrumRackTrack}, whose per-request memo it shares.
 * @param track - LiveAPI track object
 * @returns True if any device (including nested rack devices) is a Drum Rack
 */
export function isDrumRackForTrack(track: LiveAPI): boolean {
  return requestMemo(drumModeMemoKey(track.path), () =>
    containerHasDrumRack(track),
  );
}

/**
 * Name the answer after the track, so two tracks never share one.
 * @param trackPath - The track's Live API path
 * @returns The memo key
 */
function drumModeMemoKey(trackPath: string): string {
  return `drumMode ${trackPath}`;
}

/**
 * Recursively search a track or chain's devices for a Drum Rack, descending
 * into rack chains. Builds one device at a time and stops at the first Drum
 * Rack, so a drum track pays only for the devices ahead of its kit.
 * @param container - Track or chain whose devices to inspect
 * @returns True if a Drum Rack is found in it or any nested chain
 */
function containerHasDrumRack(container: LiveAPI): boolean {
  return container.someChild("devices", (device) => {
    if ((device.getProperty("can_have_drum_pads") as number) > 0) {
      return true;
    }

    if ((device.getProperty("can_have_chains") as number) <= 0) {
      return false;
    }

    return device.someChild("chains", containerHasDrumRack);
  });
}

/** The read-clip params that say which clip to read. */
interface ClipLocationArgs {
  path?: string | null;
  slot?: string | null;
  id?: string | null;
  clipId?: string | null;
  trackIndex?: number | null;
  sceneIndex?: number | null;
}

interface ClipLocation {
  clipId: string | null;
  trackIndex: number | null;
  sceneIndex: number | null;
}

/**
 * Resolve clip location from args. `path` wins, then the deprecated `slot`,
 * then the trackIndex/sceneIndex pair — which doubles as the hidden alias and
 * as how batch readers pass indices they already parsed.
 * @param args - The location params as read-clip received them
 * @returns Resolved clipId, trackIndex, and sceneIndex
 */
export function resolveClipLocation(args: ClipLocationArgs): ClipLocation {
  const clipId = namedIdParam(args.id, args.clipId, "clipId") ?? null;
  const path = namedParam(args.path, "path");
  const slot = namedHiddenPath(args.slot ?? undefined, "slot");

  // Honoring one and dropping the other is the silent wrong-clip bug path
  // replaces, so refuse instead of picking — the same trade every other tool
  // takes.
  if (path != null && slot != null) {
    throw new Error(
      "path and slot both name a clip; use path alone (slot is deprecated)",
    );
  }

  if (path != null) {
    // The aliases are a fallback for a caller that did not use path.
    if (args.trackIndex != null || args.sceneIndex != null) {
      console.warn(
        'trackIndex/sceneIndex ignored — "path" already names the clip',
      );
    }

    const parsed = parseObjectPath(path, "path");

    // An arrangement clip has no slot to report — the path names it outright,
    // so it resolves to an id and read-clip goes on as if one was given.
    if (parsed.kind === "arrangement-position") {
      return {
        clipId: arrangementClipIdAt(parsed, clipId),
        trackIndex: null,
        sceneIndex: null,
      };
    }

    const position = requireClipSlotPath(parsed);

    assertClipIdAtSlot(clipId, position, "path");

    return { clipId, ...position };
  }

  if (slot != null) {
    const position = parseSlot(slot);

    assertClipIdAtSlot(clipId, position, "slot");

    return { clipId, ...position };
  }

  const trackIndex = args.trackIndex ?? null;
  const sceneIndex = args.sceneIndex ?? null;

  if (trackIndex != null && sceneIndex != null) {
    assertClipIdAtSlot(
      clipId,
      { trackIndex, sceneIndex },
      "trackIndex/sceneIndex",
    );
  }

  return { clipId, trackIndex, sceneIndex };
}

/**
 * Refuse an id naming a clip other than the one the location names. The id used
 * to win in silence, so a stale one pasted beside a fresh location read the
 * stale clip and reported its own slot as if that's what was asked for.
 * @param clipId - The resolved id, if the caller sent one
 * @param position - The slot the location names
 * @param position.trackIndex - Track index
 * @param position.sceneIndex - Scene index
 * @param param - Which location param named it, for the error
 */
function assertClipIdAtSlot(
  clipId: string | null,
  { trackIndex, sceneIndex }: { trackIndex: number; sceneIndex: number },
  param: string,
): void {
  if (clipId == null) {
    return;
  }

  const named = LiveAPI.from(clipId);

  // An id naming nothing is validateIdType's error to report, not this one's.
  if (!named.exists()) {
    return;
  }

  const atPath = livePath.track(trackIndex).clipSlot(sceneIndex).clip();

  if (named.path !== atPath) {
    throw new Error(`${param} and id name different clips; use one`);
  }
}

/**
 * The id of the arrangement clip a path names, for a read that has nothing to
 * return when the path names none and so throws rather than warning.
 * @param parsed - A parsed `[...]` coordinate
 * @param clipId - The id the caller also sent, if any
 * @returns The clip's id
 */
function arrangementClipIdAt(
  parsed: ArrangementPosition,
  clipId: string | null,
): string {
  const source = requireCompletePosition(parsed, "path");
  const clip = arrangementClipAtPosition(source, "path");

  if (clip == null) {
    throw new Error(`no clip at path "${formatObjectPath(parsed)}"`);
  }

  // Naming the same clip twice over is not a conflict; naming two is.
  if (clipId != null && clipId !== clip.id) {
    throw new Error(
      `id "${clipId}" and path "${formatObjectPath(parsed)}" name different clips`,
    );
  }

  return clip.id;
}
