// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { noteNameToMidi } from "#src/shared/pitch.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { validateSendPair } from "#src/tools/shared/helpers/send-validation.ts";
import { everyEntry } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { refuseNoWrite } from "#src/tools/shared/validation/lists/refuse-no-write.ts";
import {
  type TargetParams,
  targetCount,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { type UpdateDeviceArgs } from "../../update-device.ts";
import { validateParamEntries } from "../params/param-entry-validation.ts";
import { refuseMacroVariationParams } from "../rack-macro-updates.ts";
import { type UpdateTargetOptions } from "../update-device-properties.ts";

/** An update-device call, read once and refused if it was written wrong. */
export interface DeviceCall {
  /** The targets, folded onto the canonical params */
  ids?: string;
  path?: string;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** What to apply to each target; `toPath` is paired per target instead */
  options: UpdateTargetOptions;
  toPath?: string;
  wrapInRack?: boolean;
  focus?: boolean;
}

/** Args a wrap can take: `force` only unlocks a params write, refused anyway. */
const WRAP_ALLOWED_ARGS = new Set(["name", "force"]);

/**
 * Read an update-device call, refusing one that was written wrong before
 * anything is touched.
 * @param args - The update-device args
 * @returns The call, with its target params folded
 * @throws Error when the call names no target, asks nothing of the targets it
 *   names, or its args can't go together
 */
export function parseDeviceCall(args: UpdateDeviceArgs): DeviceCall {
  const { id, ids, path, paths, toPath, wrapInRack, focus } = args;
  const sent = { id, ids, path, paths };

  // A value the schema coerced from a JSON null names nothing, so it must not
  // count as the caller having sent both addressing params.
  const namedIds = namedIdParam(id, ids, "ids");
  const namedPaths = namedPathParam(path, paths);

  if (namedIds == null && namedPaths == null) {
    throw new Error("id or path is required");
  }

  refuseNoWrite(args, "targets");

  // No toPath here: each target takes the destination at its own position.
  const options = updateOptionsOf(args);

  // First, so a wrap names every arg it would ignore before any of them is
  // checked on its own.
  refuseArgsWrapIgnores(wrapInRack, options);

  validateSendPair(options.sendGainDb, options.sendReturn);
  options.params = validateParamEntries(options.params);

  // Checked for the whole call, so a per-target skip wouldn't repeat itself
  // down the list. Refused before any target is touched.
  for (const pitch of everyEntry(
    options.mappedPitch,
    targetCount({ ids: namedIds, path: namedPaths }),
    "mappedPitch",
  )) {
    if (noteNameToMidi(pitch) == null) {
      throw new Error(`invalid note name "${pitch}" for mappedPitch`);
    }
  }

  refuseMacroVariationParams(
    options.macroVariation,
    options.macroVariationIndex,
  );

  return {
    ids: namedIds,
    path: namedPaths,
    sent,
    options,
    toPath,
    wrapInRack,
    focus,
  };
}

// --- Helpers below main export ---

/**
 * What an update applies to each target, picked out by name so an arg the tool
 * doesn't know can't pass for work the call asked.
 * @param args - The update-device args
 * @returns The options, minus the target params and the per-target `toPath`
 */
function updateOptionsOf(args: UpdateDeviceArgs): UpdateTargetOptions {
  return {
    name: args.name,
    params: args.params,
    actions: args.actions,
    macroVariation: args.macroVariation,
    macroVariationIndex: args.macroVariationIndex,
    macroCount: args.macroCount,
    abCompare: args.abCompare,
    mute: args.mute,
    solo: args.solo,
    color: args.color,
    gainDb: args.gainDb,
    pan: args.pan,
    sendGainDb: args.sendGainDb,
    sendReturn: args.sendReturn,
    sends: args.sends,
    chokeGroup: args.chokeGroup,
    mappedPitch: args.mappedPitch,
    force: args.force,
    preset: args.preset,
  };
}

/**
 * Refuse update args sent with wrapInRack. A wrap uses only the targets,
 * toPath and name, so the rest would be dropped while the call reads as done.
 * @param wrapInRack - Whether the call wraps; nothing is refused otherwise
 * @param options - The update args
 */
function refuseArgsWrapIgnores(
  wrapInRack: boolean | undefined,
  options: UpdateTargetOptions,
): void {
  if (!wrapInRack) {
    return;
  }

  const ignored = Object.entries(options)
    .filter(([key, value]) => !WRAP_ALLOWED_ARGS.has(key) && isSent(value))
    .map(([key]) => key);

  if (ignored.length > 0) {
    throw new Error(
      `wrapInRack cannot be used with ${ignored.join(", ")}: wrap first, then update in another call`,
    );
  }
}

/**
 * Whether an arg asks for anything: an empty list sets nothing.
 * @param value - The arg's value
 * @returns True when it was sent with something in it
 */
function isSent(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.length === 0);
}
