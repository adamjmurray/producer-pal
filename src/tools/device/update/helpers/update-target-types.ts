// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  isParamSent,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import { publishedType } from "#src/tools/shared/validation/id-validation.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

/** Where this tool's prose says more than the shared vocabulary does. */
const PROSE_WORDS: Record<string, string> = {
  DrumChain: "drum pad chain",
  DrumPad: "drum pad",
};

/**
 * Check if type is updatable (device, chain, or drum pad)
 * @param type - Live object type
 * @returns True if type is updatable
 */
export function isValidUpdateType(type: string): boolean {
  return (
    type.endsWith("Device") || type.endsWith("Chain") || type === "DrumPad"
  );
}

/**
 * Check if type is a device type
 * @param type - Live object type
 * @returns True if type ends with Device
 */
export function isDeviceType(type: string): boolean {
  return type.endsWith("Device");
}

/**
 * Check if type is a rack device
 * @param type - Live object type
 * @returns True if type is RackDevice
 */
export function isRackDevice(type: string): boolean {
  return type === "RackDevice";
}

/**
 * Check if type is a chain type
 * @param type - Live object type
 * @returns True if type ends with Chain
 */
export function isChainType(type: string): boolean {
  return type.endsWith("Chain");
}

/**
 * What to call the object a message is about, in the words the tools publish.
 * Live's class names — `DrumChain`, `Eq8Device` — are spellings no tool hands
 * out anywhere else, so a result never shows one.
 * @param type - Live's class name for the object
 * @returns The words for it, with its article ("a chain")
 */
export function liveObjectWords(type: string): string {
  const word = PROSE_WORDS[type] ?? publishedType(type as LiveObjectType);

  return word == null ? "this object" : `a ${word}`;
}

/**
 * Note a parameter this kind of object has no use for, when the call sent one.
 * An empty array counts as unset (the caller supplied the key but no entries).
 * @param ignored - The params that did nothing, added to
 * @param paramName - Parameter name
 * @param value - Parameter value
 */
export function noteIfSet(
  ignored: string[],
  paramName: string,
  value: unknown,
): void {
  if (isParamSent(value)) {
    ignored.push(paramName);
  }
}

/**
 * Say which params this kind of object had no use for, as one refusal.
 * @param notes - What the target has to say, added to
 * @param ignored - Those params, in the order they were checked
 * @param type - Live object type
 */
export function refuseIgnoredParams(
  notes: TargetNotes,
  ignored: string[],
  type: string,
): void {
  if (ignored.length > 0) {
    refuseTargetWork(
      notes,
      ignored,
      `${ignored.join(", ")} not applicable to ${liveObjectWords(type)}`,
    );
  }
}

/**
 * Why an argument this kind of object has no use for was not applied. A warning
 * where the result has nothing to carry it, a reason where it does.
 * @param paramName - Parameter name
 * @param type - Live object type
 * @param target - The object the write was aimed at
 * @returns The reason
 */
export function notApplicableReason(
  paramName: string,
  type: string,
  target: LiveAPI,
): string {
  return `'${paramName}' not applicable to ${liveObjectWords(type)} ${targetLabel(target)}`;
}
