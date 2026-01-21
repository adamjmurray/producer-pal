import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.ts";
import { setupMocks } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

interface MockContext {
  _path?: string;
  _id?: string;
}

describe("updateClip - Properties and ID handling", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("should handle 'id ' prefixed clip IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "id 123",
      name: "Prefixed ID Clip",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Clip",
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle boolean false values correctly", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      looping: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      false,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should skip invalid clip IDs in comma-separated list and update valid ones", () => {
    liveApiId.mockImplementation(function (this: MockContext) {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });
    const consoleErrorSpy = vi.spyOn(console, "error");

    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123, nonexistent",
      name: "Test",
      noteUpdateMode: "replace",
    });

    expect(result).toStrictEqual({ id: "123" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateClip: id "nonexistent" does not exist',
    );
    expect(liveApiSet).toHaveBeenCalledWith("name", "Test");
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const singleResult = updateClip({ ids: "123", name: "Single" });
    const arrayResult = updateClip({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123" });
    expect(arrayResult).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 8.0,
      },
    });

    const result = updateClip({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123,,456,  ,",
      name: "Filtered",
    });

    // set the names of the two clips:
    expect(liveApiSet).toHaveBeenCalledTimes(2);
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Filtered",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "name",
      "Filtered",
    );

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
        },
      });

      // Mock getProperty to return quantized color (different from input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16725558]; // #FF3636 (quantized from #FF0000)
        }

        if (prop === "is_arrangement_clip") return [0];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];

        return null;
      });

      updateClip({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Note: Requested clip color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
        },
      });

      // Mock getProperty to return exact color (same as input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16711680]; // #FF0000 (exact match)
        }

        if (prop === "is_arrangement_clip") return [0];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];

        return null;
      });

      updateClip({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
        },
      });

      updateClip({
        ids: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
