// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  buildClipPropertiesToSet,
  type BuildClipPropertiesArgs,
  type ClipPropsToSet,
} from "#src/tools/clip/update/helpers/update-clip-properties-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

describe("updateClip - Properties and ID handling", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should handle 'id ' prefixed clip IDs", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "id 123",
      name: "Prefixed ID Clip",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Prefixed ID Clip");
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should not update properties when not provided", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "Only Name Update",
    });

    expect(mocks.clip123.set).toHaveBeenCalledTimes(1);
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Only Name Update");

    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
    );
    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should handle boolean false values correctly", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      looping: false,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", false);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should skip invalid clip IDs in comma-separated list and update valid ones", async () => {
    mockNonExistentObjects();
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: 4,
      signature_denominator: 4,
    });

    const result = await updateClip({
      id: "123, nonexistent",
      name: "Test",
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(capturedWarnings()).toContain(
      'updateClip: id "nonexistent" does not exist',
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Test");
  });

  it("should return single object for single ID and array for comma-separated IDs", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    const singleResult = await updateClip({ id: "123", name: "Single" });
    const arrayResult = await updateClip({ id: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(arrayResult).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    setupMidiClipMock(mocks.clip789, {
      is_arrangement_clip: 1,
      start_time: 8.0,
    });

    const result = await updateClip({
      id: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { id: "456", path: "t1/s1" },
      { id: "789", path: "t2" },
    ]);
  });

  // Refusing is atomic: nothing has been set, so the caller drops the stray
  // comma and retries with no work to undo.
  it("should refuse an empty ID in a comma-separated list", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    await expect(
      updateClip({ id: "123,,456,  ,", name: "Filtered" }),
    ).rejects.toThrow('invalid id "123,,456,  ," - it has an empty entry.');

    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip456.set).not.toHaveBeenCalled();
  });

  it("should refuse an empty entry in a comma-separated path list", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    await expect(
      updateClip({ path: "t0/s0,,t1/s1", name: "One,Two,Three" }),
    ).rejects.toThrow('invalid path "t0/s0,,t1/s1" - it has an empty entry.');

    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip456.set).not.toHaveBeenCalled();
  });

  describe("color quantization verification", () => {
    /**
     * Set up clip mock to return a specific color value from get("color").
     * @param colorValue - The numeric color value to return
     */
    function setupColorMock(colorValue: number): void {
      setupMidiClipMock(mocks.clip123);

      mocks.clip123.get.mockImplementation((prop: string) => {
        if (prop === "color") return [colorValue];
        if (prop === "is_arrangement_clip") return [0];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];

        return [0];
      });
    }

    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/max/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupColorMock(16725558); // #FF3636 (quantized from #FF0000)

      await updateClip({
        id: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Requested clip color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/max/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupColorMock(16711680); // #FF0000 (exact match)

      await updateClip({
        id: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/max/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      setupMidiClipMock(mocks.clip123);

      await updateClip({
        id: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe("updateClip - focus functionality", () => {
  const selectMock = setupSelectMock();
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should select clip and show clip detail when focus=true", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", name: "Test", focus: true });

    expect(selectMock.get()).toHaveBeenCalledWith({
      id: "123",
      detailView: "clip",
    });
  });

  it("should select last clip when focus=true with multiple clips", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    await updateClip({ id: "123,456", name: "Test", focus: true });

    expect(selectMock.get()).toHaveBeenCalledWith({
      id: "456",
      detailView: "clip",
    });
    expect(selectMock.get()).toHaveBeenCalledTimes(1);
  });

  it("should not call select when focus=false", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", name: "Test", focus: false });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });

  it("should not call select when focus is omitted", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", name: "Test" });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });
});

describe("buildClipPropertiesToSet", () => {
  const BASE: BuildClipPropertiesArgs = {
    name: "clip",
    color: "#000000",
    timeSignature: undefined,
    timeSigNumerator: 4,
    timeSigDenominator: 4,
    startMarkerBeats: null,
    looping: undefined,
    isLooping: false,
    startBeats: null,
    endBeats: null,
    currentLoopEnd: 4,
    currentEndMarker: 4,
    beatsPerMarkerUnit: 1,
  };

  const build = (overrides: Partial<BuildClipPropertiesArgs>): ClipPropsToSet =>
    buildClipPropertiesToSet({ ...BASE, ...overrides });

  // Every case sets name/color and one signature pair; only the loop/marker
  // fields vary, so cases spell out just those.
  const expected = (fields: Partial<ClipPropsToSet>): ClipPropsToSet =>
    ({
      name: "clip",
      color: "#000000",
      signature_numerator: null,
      signature_denominator: null,
      ...fields,
    }) as ClipPropsToSet;

  it("sets signature numerator/denominator from the time sig when timeSignature is present", () => {
    const result = build({
      timeSignature: "3/8",
      timeSigNumerator: 3,
      timeSigDenominator: 8,
    });

    expect(result).toStrictEqual(
      expected({
        signature_numerator: 3,
        signature_denominator: 8,
        looping: undefined,
      }),
    );
  });

  it("sets signature numerator/denominator to null when timeSignature is absent", () => {
    const result = build({ timeSigNumerator: 3, timeSigDenominator: 8 });

    expect(result).toStrictEqual(
      expected({
        looping: undefined,
      }),
    );
  });

  it("sets loop_end before loop_start when expanding (startBeats > both ends)", () => {
    const result = build({
      isLooping: true,
      looping: true,
      startBeats: 8,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: true,
        loop_end: 16,
        loop_start: 8,
      }),
    );
    // Order matters: loop_end is set first when expanding.
    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "looping",
      "loop_end",
      "loop_start",
    ]);
  });

  it("sets loop_start before loop_end when not expanding (startBeats < both ends)", () => {
    const result = build({
      isLooping: true,
      looping: true,
      startBeats: 2,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: true,
        loop_start: 2,
        loop_end: 16,
      }),
    );
    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "looping",
      "loop_start",
      "loop_end",
    ]);
  });

  it("expands (loop_end first) when startBeats exactly equals an end", () => {
    const result = build({
      isLooping: true,
      looping: true,
      startBeats: 4,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    // Boundary: >= means equal still counts as expanding.
    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "looping",
      "loop_end",
      "loop_start",
    ]);
    expect(result).toStrictEqual(
      expected({
        looping: true,
        loop_end: 16,
        loop_start: 4,
      }),
    );
  });

  it("expands when the start clears loop_end but not end_marker", () => {
    // The earlier of the two ends decides. start_marker is bounded by
    // end_marker (2), so the end still moves first even though loop_end (16)
    // is nowhere near the new start.
    const result = build({
      isLooping: false,
      looping: undefined,
      startMarkerBeats: 4,
      startBeats: 4,
      endBeats: 16,
      currentLoopEnd: 16,
      currentEndMarker: 2,
    });

    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "looping",
      "loop_end",
      "end_marker",
      "loop_start",
      "start_marker",
    ]);
  });

  it("orders by both ends, not by isLooping", () => {
    // A non-looping clip needs the same ordering as a looping one: this call
    // writes loop_start and start_marker, and both would land past their
    // current end. Gating the order on isLooping left start_marker to be
    // silently dropped by Live.
    const result = build({
      isLooping: false,
      looping: undefined,
      startMarkerBeats: 8,
      startBeats: 8,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "looping",
      "loop_end",
      "end_marker",
      "loop_start",
      "start_marker",
    ]);
    expect(result).toStrictEqual(
      expected({
        looping: undefined,
        loop_start: 8,
        loop_end: 16,
        start_marker: 8,
        end_marker: 16,
      }),
    );
  });

  it("writes the markers before switching looping off", () => {
    // Live ignores a start_marker while looping is off, so the region has to
    // land while the clip is still looping. end_marker goes first on top of
    // that, because the preserved brace sits past the current one.
    const result = build({
      isLooping: true,
      looping: false,
      startMarkerBeats: 8,
      startBeats: 8,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(Object.keys(result)).toStrictEqual([
      "name",
      "color",
      "signature_numerator",
      "signature_denominator",
      "end_marker",
      "start_marker",
      "looping",
    ]);
    expect(result).toStrictEqual(
      expected({
        looping: false,
        start_marker: 8,
        end_marker: 16,
      }),
    );
  });

  it("sets only end_marker (no loop props) when turning looping off, non-expanding case", () => {
    const result = build({
      isLooping: true,
      looping: false,
      startBeats: 2,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: false,
        end_marker: 16,
      }),
    );
  });

  it("does not set loop props for a currently non-looping clip when looping is explicitly true", () => {
    const result = build({
      isLooping: false,
      looping: true,
      startBeats: 8,
      endBeats: 16,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: true,
        end_marker: 16,
      }),
    );
  });

  it("sets start_marker (not end_marker) for a non-looping clip with a start marker and no endBeats", () => {
    const result = build({
      isLooping: false,
      looping: false,
      startMarkerBeats: 8,
      startBeats: null,
      endBeats: null,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: false,
        start_marker: 8,
      }),
    );
  });

  it("does not set loop_end when endBeats is null for a looping clip", () => {
    const result = build({
      isLooping: true,
      looping: true,
      startBeats: 4,
      endBeats: null,
      currentLoopEnd: 4,
      currentEndMarker: 4,
    });

    expect(result).toStrictEqual(
      expected({
        looping: true,
        loop_start: 4,
      }),
    );
  });
});
