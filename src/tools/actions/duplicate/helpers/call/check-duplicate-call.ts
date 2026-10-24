// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import {
  type InsertionEntry,
  validateInsertionOrder,
} from "#src/tools/shared/device/helpers/path/insertion-order.ts";
import { withDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { refuseUnreadableCopyTransforms } from "../clip/apply-clip-transforms.ts";
import {
  refuseClipOverwrites,
  refusePadOverwrites,
} from "../sources/source-overwrites.ts";
import {
  type DuplicateCall,
  type DuplicateRun,
  type DuplicateTarget,
} from "./duplicate-call-types.ts";

/**
 * Refuse what can't be carried out as asked, before the first copy is made. A
 * copy that would land on a later source of the call would wreck that source's
 * own turn, a device copy can renumber the chain a later toPath names, and
 * transforms the copies can't read would fail after the clips they apply to
 * were made.
 * @param parsed - The call, as read
 * @param targets - The call's copies
 * @param run - The call's shared state
 * @returns The call, for the writes
 * @throws Error when the call can't be carried out as asked
 */
export function checkDuplicateCall(
  parsed: DuplicateCall,
  targets: DuplicateTarget[],
  run: DuplicateRun,
): DuplicateCall {
  const { type } = parsed;
  // Nothing can be copied from a skipped source, so nothing about it is read.
  const sources = run.sources.filter(({ skip }) => skip == null);

  refuseUnreadableCopyTransforms(type, sources, parsed.args.transforms);

  if (type === "clip") {
    refuseClipOverwrites(targets, run.sources);
  } else if (type === "drum-pad") {
    refusePadOverwrites(sources);
  } else if (type === "device") {
    withDevicePathCache(() =>
      validateInsertionOrder(deviceCopies(targets), {
        param: "toPath",
        verb: "copy to",
      }),
    );
  }

  return parsed;
}

// --- Helpers below main export ---

/**
 * The device copies that name a destination, for refusing a toPath an earlier
 * copy renumbers. A copy with no toPath lands just after its source, wherever
 * that is by then.
 * @param targets - The call's copies
 * @returns Each copy's destination, and whether appending it re-sorts a chain
 */
function deviceCopies(targets: DuplicateTarget[]): InsertionEntry[] {
  return targets.flatMap((target): InsertionEntry[] => {
    const body = target.data?.body;

    return body?.kind === "device" && body.toPath != null
      ? [
          {
            path: body.toPath,
            appendRenumbers:
              LiveAPI.from(body.sourceId).getProperty("type") !==
              LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          },
        ]
      : [];
  });
}
