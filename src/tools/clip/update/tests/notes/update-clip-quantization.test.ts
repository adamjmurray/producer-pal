// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleQuantization,
  QUANTIZE_GRID,
  QUANTIZE_GRID_ALIASES,
} from "#src/tools/clip/update/helpers/update-clip-notes-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockClip = any;

describe("QUANTIZE_GRID", () => {
  it("should map 1/4 to grid value 1", () => {
    expect(QUANTIZE_GRID["1/4"]).toBe(1);
  });

  it("should map 1/8 to grid value 2", () => {
    expect(QUANTIZE_GRID["1/8"]).toBe(2);
  });

  it("should map 1/8T to grid value 3", () => {
    expect(QUANTIZE_GRID["1/8T"]).toBe(3);
  });

  it("should map 1/8+1/8T to grid value 4", () => {
    expect(QUANTIZE_GRID["1/8+1/8T"]).toBe(4);
  });

  it("should map 1/16 to grid value 5", () => {
    expect(QUANTIZE_GRID["1/16"]).toBe(5);
  });

  it("should map 1/16T to grid value 6", () => {
    expect(QUANTIZE_GRID["1/16T"]).toBe(6);
  });

  it("should map 1/16+1/16T to grid value 7", () => {
    expect(QUANTIZE_GRID["1/16+1/16T"]).toBe(7);
  });

  it("should map 1/32 to grid value 8", () => {
    expect(QUANTIZE_GRID["1/32"]).toBe(8);
  });
});

describe("QUANTIZE_GRID_ALIASES", () => {
  it.each([
    ["n/4", "1/4"],
    ["n/8", "1/8"],
    ["n/12", "1/8T"],
    ["n/16", "1/16"],
    ["n/24", "1/16T"],
    ["n/32", "1/32"],
  ])("should alias %s to native grid %s", (alias, native) => {
    expect(QUANTIZE_GRID_ALIASES[alias]).toBe(native);
  });

  it("should not alias the mixed (enum-only) grids", () => {
    expect(QUANTIZE_GRID_ALIASES["1/8+1/8T"]).toBeUndefined();
    expect(QUANTIZE_GRID_ALIASES["1/16+1/16T"]).toBeUndefined();
  });
});

describe("handleQuantization", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClip = {
      id: "321",
      call: vi.fn(),
      getProperty: vi.fn(),
    };
    mockClip.call.mockReturnValue(["id", 0]);
  });

  it("should do nothing when no quantize param is provided", () => {
    handleQuantization(mockClip, {});

    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should quantize fully when only quantizeGrid is provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantizeGrid: "1/8" });

    expect(mockClip.call).toHaveBeenCalledWith("quantize", 2, 1);
  });

  it("should keep an explicit quantize of 0 rather than defaulting to 1", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantize: 0, quantizeGrid: "1/8" });

    expect(mockClip.call).toHaveBeenCalledWith("quantize", 2, 0);
  });

  it("should quantize fully when only quantizePitch is provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantizePitch: "C3" });

    expect(mockClip.call).toHaveBeenCalledWith("quantize_pitch", 60, 5, 1);
  });

  it("should warn and skip for audio clips", () => {
    mockClip.getProperty.mockReturnValue(0); // is_midi_clip = 0

    handleQuantization(mockClip, { quantize: 1, quantizeGrid: "1/16" });

    expect(capturedWarnings()).toContain(
      "quantize/quantizeGrid ignored for audio clip (id 321): quantization is MIDI-only",
    );
    expect(mockClip.call).not.toHaveBeenCalled();
  });

  // Grid or pitch alone quantizes, so naming `quantize` sends the caller to a
  // param they never set.
  it("should name only the quantize params the caller sent", () => {
    mockClip.getProperty.mockReturnValue(0); // is_midi_clip = 0

    handleQuantization(mockClip, { quantizeGrid: "1/16" });

    expect(capturedWarnings()).toContain(
      "quantizeGrid ignored for audio clip (id 321): quantization is MIDI-only",
    );
  });

  it("should name quantizePitch alone on an audio clip", () => {
    mockClip.getProperty.mockReturnValue(0); // is_midi_clip = 0

    handleQuantization(mockClip, { quantizePitch: "C3" });

    expect(capturedWarnings()).toContain(
      "quantizePitch ignored for audio clip (id 321): quantization is MIDI-only",
    );
  });

  it("should default to a 1/16 grid when quantizeGrid is not provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantize: 1 });

    // 1/16 maps to grid value 5
    expect(mockClip.call).toHaveBeenCalledWith("quantize", 5, 1);
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("should call quantize with correct grid value and amount", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantize: 0.75, quantizeGrid: "1/16" });

    expect(mockClip.call).toHaveBeenCalledWith("quantize", 5, 0.75);
  });

  it("should call quantize_pitch when quantizePitch is provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, {
      quantize: 1,
      quantizeGrid: "1/8",
      quantizePitch: "C3",
    });

    expect(mockClip.call).toHaveBeenCalledWith("quantize_pitch", 60, 2, 1);
  });

  it.each([
    ["1/4", 1],
    ["1/8", 2],
    ["1/8T", 3],
    ["1/8+1/8T", 4],
    ["1/16", 5],
    ["1/16T", 6],
    ["1/16+1/16T", 7],
    ["1/32", 8],
  ])(
    "should work with grid value %s (maps to %i)",
    (gridString, expectedValue) => {
      mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

      handleQuantization(mockClip, { quantize: 1, quantizeGrid: gridString });

      expect(mockClip.call).toHaveBeenCalledWith("quantize", expectedValue, 1);
    },
  );

  it.each([
    ["n/4", 1],
    ["n/8", 2],
    ["n/12", 3],
    ["n/16", 5],
    ["n/24", 6],
    ["n/32", 8],
  ])(
    "should bridge n/N alias %s to grid value %i",
    (gridString, expectedValue) => {
      mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

      handleQuantization(mockClip, { quantize: 1, quantizeGrid: gridString });

      expect(mockClip.call).toHaveBeenCalledWith("quantize", expectedValue, 1);
    },
  );
});
