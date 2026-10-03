// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { updateScene } from "../../update-scene.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// create-scene answers a time signature the same way (see its tests): refuse
// a denominator Live would change, read back otherwise. Both use one module.

/**
 * A scene that ends up with the time signature Live keeps.
 * @param kept - The numerator and denominator it reads back
 * @returns The scene mock
 */
function sceneKeeping(kept?: [number, number]) {
  return registerMockObject("123", {
    path: livePath.scene(0),
    properties:
      kept == null
        ? {}
        : {
            time_signature_numerator: kept[0],
            time_signature_denominator: kept[1],
          },
  });
}

describe("updateScene time signature", () => {
  it.each(["4/3", "7/6", "5/10"])(
    "refuses %s, which Live can't keep, writing nothing",
    (timeSignature) => {
      const scene = sceneKeeping();

      expect(() => updateScene({ id: "123", timeSignature })).toThrow(
        "has a denominator Live can't keep",
      );
      expect(scene.set).not.toHaveBeenCalled();
    },
  );

  it("names the denominator Live can't keep", () => {
    sceneKeeping();

    expect(() => updateScene({ id: "123", timeSignature: "4/3" })).toThrow(
      'timeSignature "4/3" has a denominator Live can\'t keep',
    );
  });

  it("refuses the whole list when one entry can't be kept", () => {
    const scene = sceneKeeping();

    expect(() =>
      updateScene({ id: "123,456", timeSignature: "4/4,7/6" }),
    ).toThrow('timeSignature "7/6"');
    expect(scene.set).not.toHaveBeenCalled();
  });

  it("reports the time signature Live kept in place of the one asked for", () => {
    sceneKeeping([1, 32]);

    expect(updateScene({ id: "123", timeSignature: "100/32" })).toStrictEqual({
      id: "123",
      path: "s0",
      timeSignature: "1/32",
      detail: "timeSignature read back as shown, not as sent",
    });
  });

  it("says nothing when Live kept the time signature", () => {
    sceneKeeping([7, 8]);

    expect(updateScene({ id: "123", timeSignature: "7/8" })).toStrictEqual({
      id: "123",
      path: "s0",
    });
  });

  it("claims nothing about a time signature it could not read back", () => {
    sceneKeeping();

    expect(updateScene({ id: "123", timeSignature: "7/8" })).toStrictEqual({
      id: "123",
      path: "s0",
    });
  });

  it("does not read back a disabled time signature", () => {
    sceneKeeping([4, 4]);

    expect(updateScene({ id: "123", timeSignature: "disabled" })).toStrictEqual(
      { id: "123", path: "s0" },
    );
  });

  it("joins it with what Live did to the color", () => {
    const scene = sceneKeeping([4, 4]);

    scene.properties.color = 0;

    const result = updateScene({
      id: "123",
      color: "#FF0000",
      timeSignature: "7/8",
    }) as { timeSignature?: string; detail?: string };

    expect(result.timeSignature).toBe("4/4");
    expect(result.detail).toContain("timeSignature read back as shown");
  });
});
