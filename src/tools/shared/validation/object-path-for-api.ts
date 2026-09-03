// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { midiToNoteName } from "#src/shared/pitch.ts";
import { drumChainSegmentNamer } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import { arrangementPath, slotPath } from "./object-path-helpers.ts";
import { formatObjectPath } from "./object-path.ts";

const SCENE = /^live_set scenes (\d+)$/;
const CLIP_SLOT = /^live_set tracks (\d+) clip_slots (\d+)/;
const TAKE_LANE = /^live_set tracks (\d+) take_lanes (\d+)/;
const ARRANGEMENT_CLIP = /^live_set tracks (\d+) arrangement_clips \d+$/;
const DRUM_PAD_TAIL = / drum_pads \d+$/;
/** A path the device grammar spells in full — nothing hangs below its last segment. */
const WHOLE_DEVICE_PATH =
  /^live_set (?:tracks \d+|return_tracks \d+|master_track)(?: (?:devices|chains|return_chains) \d+)*$/;

/**
 * The path a live object spells, so a write result can hand back the address of
 * what it just wrote.
 *
 * An arrangement clip gets its lane (`t0`, `t0/l1`), not itself: a lane holds
 * many clips and the grammar has no time coordinate, so the clip is addressed
 * by id and the path says where it lives.
 * @param api - The object to name
 * @returns The path, or undefined for an object the grammar can't spell
 */
export function objectPathForApi(api: LiveAPI): string | undefined {
  // An object that resolved to nothing reports an empty path.
  const path = api.path;

  if (!path) return undefined;

  const scene = SCENE.exec(path);

  if (scene) {
    return formatObjectPath({ kind: "scene", sceneIndex: Number(scene[1]) });
  }

  const slot = CLIP_SLOT.exec(path);

  if (slot) return slotPath(Number(slot[1]), Number(slot[2]));

  const lane = TAKE_LANE.exec(path);

  if (lane) return arrangementPath(Number(lane[1]), Number(lane[2]));

  const arrangementClip = ARRANGEMENT_CLIP.exec(path);

  if (arrangementClip) return arrangementPath(Number(arrangementClip[1]));

  return devicePathForApi(api, path);
}

/**
 * The path as a spreadable field, so a result omits the key entirely rather
 * than carrying an undefined one.
 * @param api - The object to name
 * @returns `{ path }`, or `{}` for an object the grammar can't spell
 */
export function pathField(api: LiveAPI): { path?: string } {
  const path = objectPathForApi(api);

  return path == null ? {} : { path };
}

/**
 * How a warning names the object it was working on. Both spellings, always: the
 * model addressed the object by one of them and can't be expected to map the
 * other back, and an arrangement clip needs both anyway — its path names the
 * lane it shares with every other clip there.
 * @param api - The object the warning is about
 * @returns `t1/d0 (id 7)`, or `id 7` alone when the grammar can't spell a path
 */
export function targetLabel(api: LiveAPI): string {
  return spellTarget(objectPathForApi(api), api.id);
}

/**
 * {@link targetLabel} for an object already read into a result, which carries
 * both spellings itself.
 * @param result - A tool result, with an `id` and the `path` it spells
 * @returns `t1/d0 (id 7)`, or `id 7` alone when the result has no path
 */
export function resultLabel(result: { id?: unknown; path?: unknown }): string {
  return spellTarget(
    typeof result.path === "string" ? result.path : undefined,
    String(result.id),
  );
}

/**
 * How a warning names a target the caller addressed by path, which may not have
 * resolved to anything. Both spellings when it did — falling back to the
 * caller's path for an object the grammar can't spell — and the caller's own,
 * quoted, when it resolved to nothing: there is no id for what isn't there.
 * @param api - The object the path resolved to, if any
 * @param written - The path as the caller wrote it
 * @returns `t1/d0 (id 7)`, or the written path in quotes
 */
export function pathTargetLabel(
  api: LiveAPI | null | undefined,
  written: string,
): string {
  if (api == null) return `"${written}"`;

  return spellTarget(objectPathForApi(api) ?? written, api.id);
}

/**
 * {@link targetLabel} for an object a caller has only the id of. The lookup
 * costs a Live API call, so don't reach for it where the object is at hand.
 *
 * A dead id reports itself as 0, so the caller's own id is kept when the lookup
 * lands nowhere — better a stale id than a wrong one.
 * @param id - The object's Live API id
 * @returns `t1/d0 (id 7)`, or `id 7` alone when it has no path to spell
 */
export function targetLabelForId(id: string): string {
  const api = LiveAPI.from(id);

  return api.exists() ? targetLabel(api) : `id ${id}`;
}

/**
 * The parent half of a path a warning spells out for a child that has no id of
 * its own — a drum pad, a device slot a copy failed to fill. Not
 * {@link targetLabel}: another segment can't be appended past its id.
 * @param api - The object the child hangs off
 * @returns Its path (`t1/d0`), or `id 7` when it has no path to spell
 */
export function pathPrefix(api: LiveAPI): string {
  return objectPathForApi(api) ?? `id ${api.id}`;
}

// --- Helpers below main exports ---

/**
 * The one spelling every warning names a target by.
 * @param path - The object's path, if the grammar spells one
 * @param id - The object's Live API id
 * @returns `t1/d0 (id 7)`, or `id 7` alone
 */
function spellTarget(path: string | undefined, id: string): string {
  return path == null ? `id ${id}` : `${path} (id ${id})`;
}

/**
 * The path a device-chain object spells. A pad is asked its own note rather
 * than read off its index, matching drumPadIdsByNote's refusal to trust the
 * collection order.
 * @param api - The object to name
 * @param path - Its Live API path
 * @returns The path, or undefined when a pad segment sits mid-path
 */
function devicePathForApi(api: LiveAPI, path: string): string | undefined {
  const padTail = DRUM_PAD_TAIL.exec(path);

  if (padTail) {
    const note = midiToNoteName(api.getProperty("note") as number);
    const rack = extractDevicePath(path.slice(0, padTail.index));

    // A real DrumPad.note is 0-127, so midiToNoteName should never come back
    // null here — but the invariant lives three files away, and unguarded this
    // spells "…/pnull", which a model can paste back into a `path` param.
    return rack == null || note == null ? undefined : `${rack}/p${note}`;
  }

  // A pad segment above the object (".. drum_pads 36 chains 0 ..") names a
  // chain whose rack-relative index we'd have to go looking for. Say nothing
  // rather than hand back the wrong chain. Live normally hands back the
  // rack-relative path instead, so this is the rare shape that kept one.
  if (path.includes(" drum_pads ")) return undefined;

  // A parameter, a mixer, a send — anything hanging below the last device or
  // chain segment. extractDevicePath walks past what it doesn't recognize, so
  // it would answer with the ancestor's path, and a warning would then pair
  // that path with this object's id as if they named the same thing.
  if (!WHOLE_DEVICE_PATH.test(path)) return undefined;

  // Name a drum chain the way reads do — "pC1/c0", not "c3". Only when the
  // object named is itself a chain: working it out costs a rack read per chain
  // segment, and a device inside a pad is reachable by either spelling.
  return (
    extractDevicePath(
      path,
      api.type === "DrumChain" ? drumChainSegmentNamer(api) : undefined,
    ) ?? undefined
  );
}
