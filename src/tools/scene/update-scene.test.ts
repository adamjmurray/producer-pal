// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { updateScene } from "./update-scene.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

async function withConsoleSpy(
  fn: (spy: ReturnType<typeof vi.spyOn>) => void,
): Promise<void> {
  const consoleModule = await import("#src/shared/v8-max-console.ts");
  const consoleSpy = vi.spyOn(consoleModule, "warn");

  try {
    fn(consoleSpy);
  } finally {
    consoleSpy.mockRestore();
  }
}

describe("updateScene", () => {
  let scene1: RegisteredMockObject;
  let scene2: RegisteredMockObject;
  let scene3: RegisteredMockObject;

  beforeEach(() => {
    scene1 = registerMockObject("123", { path: livePath.scene(0) });
    scene2 = registerMockObject("456", { path: livePath.scene(1) });
    scene3 = registerMockObject("789", { path: livePath.scene(2) });
  });

  it("should update a single scene by ID", () => {
    const result = updateScene({
      ids: "123",
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });

    expect(scene1.set).toHaveBeenCalledWith("name", "Updated Scene");
    expect(scene1.set).toHaveBeenCalledWith("color", 16711680);
    expect(scene1.set).toHaveBeenCalledWith("tempo", 140);
    expect(scene1.set).toHaveBeenCalledWith("tempo_enabled", true);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_numerator", 3);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_denominator", 4);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_enabled", true);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update multiple scenes by comma-separated IDs", () => {
    const result = updateScene({
      ids: "123, 456",
      color: "#00FF00",
      tempo: 120,
    });

    expect(scene1.set).toHaveBeenCalledTimes(3);
    expect(scene2.set).toHaveBeenCalledTimes(3);
    expect(scene1.set).toHaveBeenCalledWith("color", 65280);
    expect(scene1.set).toHaveBeenCalledWith("tempo", 120);
    expect(scene1.set).toHaveBeenCalledWith("tempo_enabled", true);
    expect(scene2.set).toHaveBeenCalledWith("color", 65280);
    expect(scene2.set).toHaveBeenCalledWith("tempo", 120);
    expect(scene2.set).toHaveBeenCalledWith("tempo_enabled", true);

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle 'id ' prefixed scene IDs", () => {
    const result = updateScene({
      ids: "id 123",
      name: "Prefixed ID Scene",
    });

    expect(scene1.set).toHaveBeenCalledWith("name", "Prefixed ID Scene");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    const result = updateScene({
      ids: "123",
      name: "Only Name Update",
    });

    expect(scene1.set).toHaveBeenCalledWith("name", "Only Name Update");
    expect(scene1.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should disable tempo when -1 is passed", () => {
    const result = updateScene({
      ids: "123",
      tempo: -1,
    });

    expect(scene1.set).toHaveBeenCalledWith("tempo_enabled", false);
    expect(scene1.set).not.toHaveBeenCalledWith("tempo", expect.any(Number));
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should disable time signature when 'disabled' is passed", () => {
    const result = updateScene({
      ids: "123",
      timeSignature: "disabled",
    });

    expect(scene1.set).toHaveBeenCalledWith("time_signature_enabled", false);
    expect(scene1.set).not.toHaveBeenCalledWith(
      "time_signature_numerator",
      expect.any(Number),
    );
    expect(scene1.set).not.toHaveBeenCalledWith(
      "time_signature_denominator",
      expect.any(Number),
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateScene({})).toThrow(
      "updateScene failed: ids is required",
    );
    expect(() => updateScene({ name: "Test" })).toThrow(
      "updateScene failed: ids is required",
    );
  });

  it("should log warning when scene ID doesn't exist", () => {
    mockNonExistentObjects();

    const result = updateScene({ ids: "nonexistent" });

    expect(result).toStrictEqual([]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateScene: id "nonexistent" does not exist',
    );
  });

  it("should skip invalid scene IDs in comma-separated list and update valid ones", () => {
    mockNonExistentObjects();

    const result = updateScene({ ids: "123, nonexistent", name: "Test" });

    expect(result).toStrictEqual({ id: "123" });
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateScene: id "nonexistent" does not exist',
    );
    expect(scene1.set).toHaveBeenCalledWith("name", "Test");
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateScene({ ids: "123", timeSignature: "invalid" })).toThrow(
      "Time signature must be in format",
    );
    expect(() => updateScene({ ids: "123", timeSignature: "3-4" })).toThrow(
      "Time signature must be in format",
    );
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateScene({ ids: "123", name: "Single" });
    const arrayResult = updateScene({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123" });
    expect(arrayResult).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateScene({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateScene({
      ids: "123,,456,  ,789",
      name: "Filtered",
    });

    expect(scene1.set).toHaveBeenCalledTimes(1);
    expect(scene2.set).toHaveBeenCalledTimes(1);
    expect(scene3.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      await withConsoleSpy((consoleSpy) => {
        // Override get to return quantized color (different from input)
        scene1.get.mockImplementation((prop: string) => {
          if (prop === "color") {
            return [16725558]; // #FF3636 (quantized from #FF0000)
          }

          return [0];
        });

        updateScene({ ids: "123", color: "#FF0000" });

        expect(consoleSpy).toHaveBeenCalledWith(
          "Requested scene color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
        );
      });
    });

    it("should not emit warning when color matches exactly", async () => {
      await withConsoleSpy((consoleSpy) => {
        // Override get to return exact color (same as input)
        scene1.get.mockImplementation((prop: string) => {
          if (prop === "color") {
            return [16711680]; // #FF0000 (exact match)
          }

          return [0];
        });

        updateScene({ ids: "123", color: "#FF0000" });

        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });

    it("should not verify color if color parameter is not provided", async () => {
      await withConsoleSpy((consoleSpy) => {
        updateScene({ ids: "123", name: "No color update" });

        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });
});
