import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  setupStandardIdMock,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.js";
import { updateScene } from "./update-scene.js";
import "#src/live-api-adapter/live-api-extensions.js";

describe("updateScene", () => {
  beforeEach(() => {
    setupStandardIdMock();

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this._id) {
        case "123":
          return "live_set scenes 0";
        case "456":
          return "live_set scenes 1";
        case "789":
          return "live_set scenes 2";
        default:
          return this._path;
      }
    });
  });

  it("should update a single scene by ID", () => {
    const result = updateScene({
      ids: "123",
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Updated Scene",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo",
      140,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_numerator",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_denominator",
      4,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_enabled",
      true,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update multiple scenes by comma-separated IDs", () => {
    const result = updateScene({
      ids: "123, 456",
      color: "#00FF00",
      tempo: 120,
    });

    expect(liveApiSet).toHaveBeenCalledTimes(6); // 3 calls per scene
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo",
      120,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "tempo",
      120,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "tempo_enabled",
      true,
    );

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle 'id ' prefixed scene IDs", () => {
    const result = updateScene({
      ids: "id 123",
      name: "Prefixed ID Scene",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Scene",
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    const result = updateScene({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should disable tempo when -1 is passed", () => {
    const result = updateScene({
      ids: "123",
      tempo: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should disable time signature when 'disabled' is passed", () => {
    const result = updateScene({
      ids: "123",
      timeSignature: "disabled",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "time_signature_numerator",
      expect.any(Number),
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
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
    liveApiId.mockReturnValue("id 0");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateScene({ ids: "nonexistent" });

    expect(result).toStrictEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateScene: id "nonexistent" does not exist',
    );
  });

  it("should skip invalid scene IDs in comma-separated list and update valid ones", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });
    liveApiType.mockReturnValue("Scene");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateScene({ ids: "123, nonexistent", name: "Test" });

    expect(result).toStrictEqual({ id: "123" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateScene: id "nonexistent" does not exist',
    );
    expect(liveApiSet).toHaveBeenCalledWith("name", "Test");
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

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      // Mock getProperty to return quantized color (different from input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16725558]; // #FF3636 (quantized from #FF0000)
        }

        return null;
      });

      updateScene({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Note: Requested scene color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      // Mock getProperty to return exact color (same as input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16711680]; // #FF0000 (exact match)
        }

        return null;
      });

      updateScene({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      updateScene({
        ids: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
