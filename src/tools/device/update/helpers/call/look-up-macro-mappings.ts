// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MappedMacros,
  lookUpMappedMacros,
} from "#src/tools/shared/device/rack-macro-mappings.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { mayHideMappedMacros } from "../rack-macro-updates.ts";
import { type DevicePayload } from "./check-device-update.ts";
import { presetDevice } from "./device-presets.ts";

/**
 * Each target that is a rack a `macroCount` would hide mapped macros of.
 * @param targets - The call's targets
 * @param macroCount - The count the call asked for
 * @param hasPreset - Whether each target also loads a preset; one that does is
 *   left out, since a preset that replaces the device makes the answer moot
 * @returns One per target: the rack, or null where there is nothing to look up
 */
export function racksHidingMappings(
  targets: Array<Target<DevicePayload>>,
  macroCount: number,
  hasPreset: (index: number) => boolean,
): Array<LiveAPI | null> {
  return targets.map((target, index) => {
    const device =
      target.data != null && "resolved" in target.data && !hasPreset(index)
        ? presetDevice(target.data.resolved)
        : null;

    return device != null && mayHideMappedMacros(device, macroCount)
      ? device
      : null;
  });
}

/**
 * Find out which macros are mapped on those racks, before anything is written,
 * so the entry can name the ones the count hides. One remote-script call covers
 * them all. A failure comes back as the rack's answer, never a throw: the count
 * is still written.
 * @param racks - What `racksHidingMappings` found
 * @param deadline - The request deadline
 * @returns Per target, which macros are mapped; undefined where there was
 *   nothing to ask or no remote script to ask
 */
export async function lookUpHiddenMacroMappings(
  racks: Array<LiveAPI | null>,
  deadline: number | null | undefined,
): Promise<Array<MappedMacros | undefined>> {
  const answers = await lookUpMappedMacros(
    racks.filter((rack) => rack != null),
    deadline,
  );
  let next = 0;

  return racks.map((rack) => (rack == null ? undefined : answers?.[next++]));
}
