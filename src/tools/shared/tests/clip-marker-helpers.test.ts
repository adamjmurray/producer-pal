// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";

interface SetCall {
  property: string;
  value: unknown;
}

function createMockClip() {
  const calls: SetCall[] = [];

  return {
    clip: {
      set: vi.fn((property: string, value: unknown) => {
        calls.push({ property, value });
      }),
    } as unknown as LiveAPI,
    getCalls: () => calls,
  };
}

describe("clip-marker-helpers", () => {
  describe("setClipMarkersWithLoopingWorkaround", () => {
    it("should enable looping, set markers, then disable looping", () => {
      const { clip, getCalls } = createMockClip();

      setClipMarkersWithLoopingWorkaround(clip, {
        startMarker: 0,
        endMarker: 4,
      });

      const calls = getCalls();

      expect(calls[0]).toStrictEqual({ property: "looping", value: 1 });
      expect(calls.at(-1)).toStrictEqual({ property: "looping", value: 0 });
    });

    it("should set start_marker and end_marker", () => {
      const { clip, getCalls } = createMockClip();

      setClipMarkersWithLoopingWorkaround(clip, {
        startMarker: 2.5,
        endMarker: 10.25,
      });

      const calls = getCalls();
      const startMarkerCall = calls.find((c) => c.property === "start_marker");
      const endMarkerCall = calls.find((c) => c.property === "end_marker");

      expect(startMarkerCall).toStrictEqual({
        property: "start_marker",
        value: 2.5,
      });
      expect(endMarkerCall).toStrictEqual({
        property: "end_marker",
        value: 10.25,
      });
    });

    it("should set loop_start and loop_end when provided", () => {
      const { clip, getCalls } = createMockClip();

      setClipMarkersWithLoopingWorkaround(clip, {
        loopStart: 1,
        loopEnd: 8,
        startMarker: 0,
        endMarker: 16,
      });

      const calls = getCalls();
      const loopStartCall = calls.find((c) => c.property === "loop_start");
      const loopEndCall = calls.find((c) => c.property === "loop_end");

      expect(loopStartCall).toStrictEqual({ property: "loop_start", value: 1 });
      expect(loopEndCall).toStrictEqual({ property: "loop_end", value: 8 });
    });

    it("should not set loop_start and loop_end when not provided", () => {
      const { clip, getCalls } = createMockClip();

      setClipMarkersWithLoopingWorkaround(clip, {
        startMarker: 0,
        endMarker: 4,
      });

      const calls = getCalls();
      const loopStartCall = calls.find((c) => c.property === "loop_start");
      const loopEndCall = calls.find((c) => c.property === "loop_end");

      expect(loopStartCall).toBeUndefined();
      expect(loopEndCall).toBeUndefined();
    });

    it("should call set in correct order for full markers", () => {
      const { clip, getCalls } = createMockClip();

      setClipMarkersWithLoopingWorkaround(clip, {
        loopStart: 1,
        loopEnd: 8,
        startMarker: 0,
        endMarker: 16,
      });

      const calls = getCalls();
      const properties = calls.map((c) => c.property);

      // looping=1 must be first, looping=0 must be last
      expect(properties[0]).toBe("looping");
      expect(properties.at(-1)).toBe("looping");
      expect(calls[0]!.value).toBe(1);
      expect(calls.at(-1)!.value).toBe(0);

      // All marker properties should be between the looping calls
      expect(properties).toContain("loop_end");
      expect(properties).toContain("loop_start");
      expect(properties).toContain("end_marker");
      expect(properties).toContain("start_marker");
    });
  });
});
