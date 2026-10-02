// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Assert a scene took the name, red color, tempo, and 3/4 meter a create or
 * update call sent it — including the enable flags tempo and meter need.
 * @param scene - The scene mock
 * @param name - The name the call sent
 * @param tempo - The tempo the call sent
 */
export function expectSceneSetToRed34(
  scene: RegisteredMockObject,
  name: string,
  tempo: number,
): void {
  expect(scene.set).toHaveBeenCalledWith("name", name);
  expect(scene.set).toHaveBeenCalledWith("color", 16711680);
  expect(scene.set).toHaveBeenCalledWith("tempo", tempo);
  expect(scene.set).toHaveBeenCalledWith("tempo_enabled", true);
  expect(scene.set).toHaveBeenCalledWith("time_signature_numerator", 3);
  expect(scene.set).toHaveBeenCalledWith("time_signature_denominator", 4);
  expect(scene.set).toHaveBeenCalledWith("time_signature_enabled", true);
}
