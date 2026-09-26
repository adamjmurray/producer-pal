// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The shared check on how a scene write reports color, for create-scene and
 * update-scene: Live snaps a color it has no swatch for, and the entry says so.
 */
import { expect } from "vitest";
import { sleep } from "../mcp-test-helpers.ts";

/** A color Live has no swatch for, so a write of it always gets snapped. */
const OFF_PALETTE = "#123456";

/** What a scene write's entry says about the color it landed. */
export interface SceneColorEntry {
  color?: string;
  detail?: string;
}

/**
 * Check a scene write names the palette color Live snapped to, and says
 * nothing when the color asked for was already a swatch.
 * @param writeOffPalette - Writes a color Live has no swatch for
 * @param writeExact - Writes a color Live does have, to a second scene
 */
export async function expectPaletteColorReported(
  writeOffPalette: (color: string) => Promise<SceneColorEntry>,
  writeExact: (color: string) => Promise<SceneColorEntry>,
): Promise<void> {
  const snapped = await writeOffPalette(OFF_PALETTE);

  // Not a Live swatch, so the entry carries what landed instead.
  expect(snapped.color).toMatch(/^#[\dA-F]{6}$/);
  expect(snapped.color).not.toBe(OFF_PALETTE);
  expect(snapped.detail).toBe(
    `color ${OFF_PALETTE} is not in Live's palette; landed as ${snapped.color}`,
  );

  await sleep(100);

  // The palette color Live just named, asked for verbatim, has nothing to say.
  const exact = await writeExact(snapped.color!);

  expect(exact.color).toBeUndefined();
  expect(exact.detail).toBeUndefined();
}
