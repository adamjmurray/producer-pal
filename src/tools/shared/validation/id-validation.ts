// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LiveObjectType } from "#src/types/live-object-types.ts";
import { targetLabel } from "./object-path-for-api.ts";

/** What the tools call each Live class a path or id can reach. */
const TYPE_WORDS: Partial<Record<LiveObjectType, string>> = {
  Track: "track",
  Scene: "scene",
  Clip: "clip",
  ClipSlot: "clip slot",
  TakeLane: "take lane",
  CuePoint: "locator",
  Chain: "chain",
  DrumChain: "chain",
  DrumPad: "drum-pad",
  DeviceParameter: "device parameter",
};

/**
 * Validates a single ID matches expected type
 * @param id - The ID to validate
 * @param expectedType - Tool-level type (e.g., "track", "device", "drum-pad")
 * @returns The LiveAPI instance for the validated ID
 * @throws If ID doesn't exist or type doesn't match
 */
export function validateIdType(id: string, expectedType: string): LiveAPI {
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    throw new Error(`id "${id}" does not exist`);
  }

  const mismatch = typeMismatch(object, expectedType);

  if (mismatch != null) {
    throw new Error(mismatch);
  }

  return object;
}

/**
 * Why an object isn't the type a call asked for, or null when it is. Shared so
 * a tool reporting the mismatch in a result entry says it the same way as one
 * throwing it.
 * @param object - The object a call named
 * @param expectedType - Tool-level type (e.g., "track", "device", "drum-pad")
 * @returns The reason, or null when the type matches
 */
export function typeMismatch(
  object: LiveAPI,
  expectedType: string,
): string | null {
  if (isTypeMatch(object.type, expectedType)) {
    return null;
  }

  const found = publishedType(object.type);

  return found == null
    ? `${targetLabel(object)} is not a ${expectedType}`
    : `${targetLabel(object)} is not a ${expectedType} (found ${found})`;
}

/**
 * The word the tools publish for what an object is, so a message never spells
 * a Live class name the caller could not have written.
 * @param type - The Live API class name
 * @returns The published word, or null for a class the tools never name
 */
export function publishedType(type: LiveObjectType): string | null {
  return type.endsWith("Device") ? "device" : (TYPE_WORDS[type] ?? null);
}

/**
 * Checks if the Live API type matches the expected tool-level type.
 * Handles device subclasses (e.g., "HybridReverbDevice" matches "device").
 * @param actualType - The Live API object type (e.g., "Track", "Eq8Device")
 * @param expectedType - The tool-level type (e.g., "track", "device", "drum-pad")
 * @returns True if types match
 */
function isTypeMatch(
  actualType: LiveObjectType,
  expectedType: string,
): boolean {
  switch (expectedType) {
    case "track":
      return actualType === "Track";
    case "scene":
      return actualType === "Scene";
    case "clip":
      return actualType === "Clip";
    case "device":
      return actualType.endsWith("Device");
    case "chain":
      return actualType === "Chain" || actualType === "DrumChain";
    case "drum-pad":
      // DrumChain passes so a tool can reject it with advice about the pad it
      // sits on, rather than the generic type mismatch. A pad-level Live call
      // aimed at a chain is a silent no-op, so any tool letting one through
      // here must handle it — see delete's isRackChain and duplicate's
      // padTargetFromPad.
      return actualType === "DrumPad" || actualType === "DrumChain";
    default:
      return false;
  }
}
