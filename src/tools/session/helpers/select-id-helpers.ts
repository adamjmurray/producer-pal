// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseSlot } from "#src/tools/shared/validation/position-parsing.ts";

export type DetectedType = "track" | "scene" | "clip" | "device";

interface ResolveIdResult {
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  detectedType: DetectedType;
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
  clipSlotHasClip?: boolean;
  viewOnly?: boolean;
}

/**
 * Determine auto detail view based on what was selected
 * @param options - Selection state
 * @param options.clipId - Clip ID if selected
 * @param options.deviceId - Device ID if selected
 * @param options.devicePath - Device path if selected
 * @param options.clipSlotHasClip - Whether the clip slot has a clip
 * @param options.viewOnly - Whether only the view param was provided
 * @returns Detail view to apply, or undefined to leave unchanged
 */
export function determineAutoDetailView({
  clipId,
  deviceId,
  devicePath,
  clipSlotHasClip,
  viewOnly,
}: AutoDetailViewOptions): "clip" | "device" | "none" | undefined {
  if (clipId != null || clipSlotHasClip) return "clip";
  if (deviceId != null || devicePath != null) return "device";
  if (viewOnly) return "none";

  return undefined;
}
