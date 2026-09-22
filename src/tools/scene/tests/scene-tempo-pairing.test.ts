// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ZodType } from "zod";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { TEMPO_REFUSAL } from "#src/tools/constants.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createScene } from "../create-scene.ts";
import { updateScene } from "../update-scene.ts";
import { toolDefUpdateScene } from "../update-scene.def.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

/** The tempo properties a scene mock was asked to set. */
function tempoWrites(scene: RegisteredMockObject): unknown[][] {
  return scene.set.mock.calls.filter(([property]: unknown[]) =>
    String(property).startsWith("tempo"),
  );
}

describe("tempo schema", () => {
  // The MCP layer coerces before the handler sees it, so a model that sends a
  // bare number still reaches the handler as one entry.
  it("coerces a single number to a one-entry list", () => {
    const schema = toolDefUpdateScene.toolOptions.inputSchema.tempo as ZodType;

    expect(schema.parse(120)).toBe("120");
    expect(schema.parse("120,90")).toBe("120,90");
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("120,fast").success).toBe(false);
  });
});

describe("createScene tempo pairing", () => {
  let scenes: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("existing1", "existing2") },
    });

    scenes = Array.from({ length: 4 }, (_unused, i) =>
      registerMockObject(`live_set/scenes/${i}`, { path: livePath.scene(i) }),
    );
  });

  it("pairs one tempo per scene, in order", () => {
    createScene({ path: "s+,s+", tempo: "120,90" });

    expect(tempoWrites(scenes[2] as RegisteredMockObject)).toStrictEqual([
      ["tempo", 120],
      ["tempo_enabled", true],
    ]);
    expect(tempoWrites(scenes[3] as RegisteredMockObject)).toStrictEqual([
      ["tempo", 90],
      ["tempo_enabled", true],
    ]);
  });

  it("broadcasts a single value to every scene", () => {
    createScene({ path: "s+,s+", tempo: "128" });

    for (const index of [2, 3]) {
      expect(tempoWrites(scenes[index] as RegisteredMockObject)).toStrictEqual([
        ["tempo", 128],
        ["tempo_enabled", true],
      ]);
    }
  });

  it("refuses a list that names a different number of scenes", () => {
    expect(() => createScene({ path: "s+,s+", tempo: "120,90,80" })).toThrow(
      "path names 2 scenes but tempo names 3 entries",
    );
  });

  it("refuses an out-of-range entry before any scene is made", () => {
    expect(() => createScene({ path: "s+,s+", tempo: "120,0" })).toThrow(
      TEMPO_REFUSAL,
    );
    expect(scenes[2]?.set).not.toHaveBeenCalled();
  });
});

describe("updateScene tempo pairing", () => {
  let scene1: RegisteredMockObject;
  let scene2: RegisteredMockObject;
  let scene3: RegisteredMockObject;

  beforeEach(() => {
    scene1 = registerMockObject("123", { path: livePath.scene(0) });
    scene2 = registerMockObject("456", { path: livePath.scene(1) });
    scene3 = registerMockObject("789", { path: livePath.scene(2) });
  });

  it("pairs one tempo per scene, in order", () => {
    updateScene({ id: "123,456", tempo: "120,90" });

    expect(tempoWrites(scene1)).toStrictEqual([
      ["tempo", 120],
      ["tempo_enabled", true],
    ]);
    expect(tempoWrites(scene2)).toStrictEqual([
      ["tempo", 90],
      ["tempo_enabled", true],
    ]);
  });

  it("pairs -1 as one entry among the rest", () => {
    updateScene({ id: "123,456", tempo: "-1,90" });

    expect(tempoWrites(scene1)).toStrictEqual([["tempo_enabled", false]]);
    expect(tempoWrites(scene2)).toStrictEqual([
      ["tempo", 90],
      ["tempo_enabled", true],
    ]);
  });

  it("broadcasts a single value to every scene", () => {
    updateScene({ id: "123,456,789", tempo: "128" });

    for (const scene of [scene1, scene2, scene3]) {
      expect(tempoWrites(scene)).toStrictEqual([
        ["tempo", 128],
        ["tempo_enabled", true],
      ]);
    }
  });

  it("refuses a list that names a different number of scenes", () => {
    expect(() => updateScene({ id: "123,456", tempo: "120,90,80" })).toThrow(
      "id names 2 entries but tempo names 3 entries",
    );
  });

  it("refuses an out-of-range entry before any scene is touched", () => {
    expect(() => updateScene({ id: "123,456", tempo: "120,1000" })).toThrow(
      TEMPO_REFUSAL,
    );
    expect(scene1.set).not.toHaveBeenCalled();
  });

  // With one target a comma is part of the value, so the whole thing has to
  // name one tempo — and it doesn't.
  it("refuses a list for one scene", () => {
    expect(() => updateScene({ id: "123", tempo: "120,90" })).toThrow(
      'invalid tempo "120,90" - it must be a number',
    );
  });
});
