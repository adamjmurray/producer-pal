// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  handleQuantization,
  QUANTIZE_GRID,
} from "#src/tools/clip/update/helpers/update-clip-quantization-helpers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockClip = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockLiveSet = any;

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

describe("handleQuantization", () => {
  let mockClip: MockClip;
  let mockLiveSet: MockLiveSet;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLiveSet = {
      getProperty: vi.fn(() => 0.25), // Original swing_amount
      set: vi.fn(),
    };

    // Override LiveAPI.from to return our mock for live_set
    vi.spyOn(LiveAPI, "from").mockImplementation((path) => {
      if (path === "live_set") {
        return mockLiveSet;
      }

      // For other paths, return a minimal mock
      return { path } as unknown as LiveAPI;
    });

    mockClip = {
      id: "321",
      call: liveApiCall,
      getProperty: vi.fn(),
    };
    liveApiCall.mockReturnValue(["id", 0]);
  });

  it("should do nothing when quantize is undefined", () => {
    handleQuantization(mockClip, { quantize: undefined, quantizeGrid: "1/16" });

    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should do nothing when quantize is not provided", () => {
    handleQuantization(mockClip, { quantizeGrid: "1/16" });

    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should warn and skip for audio clips", () => {
    mockClip.getProperty.mockReturnValue(0); // is_midi_clip = 0

    handleQuantization(mockClip, { quantize: 1, quantizeGrid: "1/16" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("quantize parameter ignored for audio clip"),
    );
    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should warn and skip when quantizeGrid is not provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantize: 1 });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("quantizeGrid is required"),
    );
    expect(mockClip.call).not.toHaveBeenCalled();
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

  it("should warn and skip when quantizePitch is invalid note name", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, {
      quantize: 1,
      quantizeGrid: "1/8",
      quantizePitch: "invalid",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('invalid note name "invalid"'),
    );
    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should set swing_amount before quantizing and restore after", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, {
      quantize: 1,
      quantizeGrid: "1/16",
      quantizeSwing: 0.5,
    });

    // First call sets the new swing
    expect(mockLiveSet.set).toHaveBeenNthCalledWith(1, "swing_amount", 0.5);
    // Second call restores the original swing
    expect(mockLiveSet.set).toHaveBeenNthCalledWith(2, "swing_amount", 0.25);
  });

  it("should use 0 for swing when quantizeSwing is not provided", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1

    handleQuantization(mockClip, { quantize: 1, quantizeGrid: "1/16" });

    expect(mockLiveSet.set).toHaveBeenNthCalledWith(1, "swing_amount", 0);
  });

  it("should restore swing_amount even if quantize throws", () => {
    mockClip.getProperty.mockReturnValue(1); // is_midi_clip = 1
    mockClip.call.mockImplementation(() => {
      throw new Error("Quantize failed");
    });

    expect(() =>
      handleQuantization(mockClip, {
        quantize: 1,
        quantizeGrid: "1/16",
        quantizeSwing: 0.3,
      }),
    ).toThrow("Quantize failed");

    // Verify swing was restored despite the error
    expect(mockLiveSet.set).toHaveBeenNthCalledWith(2, "swing_amount", 0.25);
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
});
