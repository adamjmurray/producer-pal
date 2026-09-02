// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { namedParam, parseTimeSignature } from "#src/tools/shared/utils.ts";
import {
  parseObjectPath,
  pathError,
} from "#src/tools/shared/validation/object-path.ts";

/**
 * Applies tempo property to a scene
 * @param scene - The LiveAPI scene object
 * @param tempo - Tempo in BPM (20.0-999.0). -1 disables; other valid values enable
 */
export function applyTempoProperty(
  scene: LiveAPI,
  tempo?: number | null,
): void {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    // Range already refused by validateTempo, before any scene was touched.
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }
}

/**
 * Applies time signature property to a scene
 * @param scene - The LiveAPI scene object
 * @param timeSignature - Time signature. "disabled" disables, other values enable
 */
export function applyTimeSignatureProperty(
  scene: LiveAPI,
  timeSignature?: string | null,
): void {
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    scene.set("time_signature_numerator", parsed.numerator);
    scene.set("time_signature_denominator", parsed.denominator);
    scene.set("time_signature_enabled", true);
  }
}

/**
 * What a scene is called, the way Live shows it: its name, or its 1-based
 * number when it has none.
 * @param scene - The LiveAPI scene object
 * @param sceneIndex - The scene's 0-based index
 * @returns The scene's name, or its number when unnamed
 */
export function sceneDisplayName(scene: LiveAPI, sceneIndex: number): string {
  const name = scene.getProperty("name") as string | null;

  return name == null || name === "" ? `${sceneIndex + 1}` : name;
}

/**
 * Reads where new scenes go, from a path or the index the path replaced.
 * @param path - "s+" to append, "s2" to insert at 2
 * @param sceneIndex - Deprecated index
 * @param liveSet - Live set, read only to append
 * @returns The index to insert at, or undefined when neither was given
 */
export function resolveCreateSceneIndex(
  path: string | undefined,
  sceneIndex: number | undefined,
  liveSet: LiveAPI,
): number | undefined {
  const entry = namedParam(path, "path");

  if (entry == null) return sceneIndex;

  if (sceneIndex != null) {
    throw new Error(
      "createScene: path says where the scene goes - don't send sceneIndex with it",
    );
  }

  const parsed = parseObjectPath(entry, "path");

  if (parsed.kind === "new-scene") return liveSet.getChildIds("scenes").length;

  if (parsed.kind === "scene") return parsed.sceneIndex;

  throw pathError(
    "path",
    entry,
    'it names no place for a scene; expected "s+" or "s<index>"',
  );
}
