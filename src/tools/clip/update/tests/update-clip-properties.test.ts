// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupMocks,
  type UpdateClipMockHandles,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateClip - Properties and ID handling", () => {
  let handles: UpdateClipMockHandles;

  beforeEach(() => {
    handles = setupMocks();
  });

  it("should handle 'id ' prefixed clip IDs", async () => {
    setupMidiClipMock(handles.clip123);

    const result = await updateClip({
      ids: "id 123",
      name: "Prefixed ID Clip",
    });

    expect(handles.clip123.set).toHaveBeenCalledWith(
      "name",
      "Prefixed ID Clip",
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", async () => {
    setupMidiClipMock(handles.clip123);

    const result = await updateClip({
      ids: "123",
      name: "Only Name Update",
    });

    expect(handles.clip123.set).toHaveBeenCalledTimes(1);
    expect(handles.clip123.set).toHaveBeenCalledWith(
      "name",
      "Only Name Update",
    );

    expect(handles.clip123.call).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
    );
    expect(handles.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle boolean false values correctly", async () => {
    setupMidiClipMock(handles.clip123);

    const result = await updateClip({
      ids: "123",
      looping: false,
    });

    expect(handles.clip123.set).toHaveBeenCalledWith("looping", false);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should skip invalid clip IDs in comma-separated list and update valid ones", async () => {
    mockNonExistentObjects();
    setupMidiClipMock(handles.clip123, {
      signature_numerator: 4,
      signature_denominator: 4,
    });

    const result = await updateClip({
      ids: "123, nonexistent",
      name: "Test",
      noteUpdateMode: "replace",
    });

    expect(result).toStrictEqual({ id: "123" });
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateClip: id "nonexistent" does not exist',
    );
    expect(handles.clip123.set).toHaveBeenCalledWith("name", "Test");
  });

  it("should return single object for single ID and array for comma-separated IDs", async () => {
    setupMidiClipMock(handles.clip123);
    setupMidiClipMock(handles.clip456);

    const singleResult = await updateClip({ ids: "123", name: "Single" });
    const arrayResult = await updateClip({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123" });
    expect(arrayResult).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle whitespace in comma-separated IDs", async () => {
    setupMidiClipMock(handles.clip123);
    setupMidiClipMock(handles.clip456);
    setupMidiClipMock(handles.clip789, {
      is_arrangement_clip: 1,
      start_time: 8.0,
    });

    const result = await updateClip({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  it("should filter out empty IDs from comma-separated list", async () => {
    setupMidiClipMock(handles.clip123);
    setupMidiClipMock(handles.clip456);

    const result = await updateClip({
      ids: "123,,456,  ,",
      name: "Filtered",
    });

    // set the names of the two clips:
    expect(handles.clip123.set).toHaveBeenCalledWith("name", "Filtered");
    expect(handles.clip456.set).toHaveBeenCalledWith("name", "Filtered");

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupMidiClipMock(handles.clip123);

      // Mock getProperty to return quantized color (different from input)
      handles.clip123.get.mockImplementation((prop: string) => {
        if (prop === "color") {
          return [16725558]; // #FF3636 (quantized from #FF0000)
        }

        if (prop === "is_arrangement_clip") return [0];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];

        return [0];
      });

      await updateClip({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Requested clip color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupMidiClipMock(handles.clip123);

      // Mock getProperty to return exact color (same as input)
      handles.clip123.get.mockImplementation((prop: string) => {
        if (prop === "color") {
          return [16711680]; // #FF0000 (exact match)
        }

        if (prop === "is_arrangement_clip") return [0];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];

        return [0];
      });

      await updateClip({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupMidiClipMock(handles.clip123);

      await updateClip({
        ids: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
