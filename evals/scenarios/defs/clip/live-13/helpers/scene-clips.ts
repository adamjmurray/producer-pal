// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** A clip a scene should hold. */
export interface WantedClip {
  path: string;
  name: string;
}

/** One clip of a read-scene result. */
interface SceneClip {
  path?: string;
  name?: string;
}

/**
 * What is wrong with the clips a scene holds, return-track clips included.
 *
 * @param result - Parsed ppal-read-scene result, read with clips
 * @param wanted - The clips the scene should hold, and no others
 * @returns A description of what is wrong, or null when it holds exactly them
 */
export function sceneClipsProblem(
  result: unknown,
  wanted: WantedClip[],
): string | null {
  const clips = (result as { clips?: SceneClip[] }).clips ?? [];
  const describe = (list: SceneClip[]): string =>
    list
      .map((clip) => `${clip.path ?? "?"} "${clip.name ?? ""}"`)
      .toSorted()
      .join(", ") || "none";
  const actual = describe(clips);
  const expected = describe(wanted);

  return actual === expected
    ? null
    : `scene holds ${actual}, wanted ${expected}`;
}
