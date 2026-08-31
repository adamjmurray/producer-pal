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

// --- Helpers below main exports ---

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
