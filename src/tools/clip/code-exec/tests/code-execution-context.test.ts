// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  buildCodeExecutionContext,
  getClipLocationInfo,
} from "../code-execution-context.ts";
import { mockGetProperty } from "./code-exec-test-helpers.ts";

describe("code-execution-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildCodeExecutionContext", () => {
    it("should build context for session clip", () => {
      const mockClip = {
        id: "clip-123",
        path: livePath.track(1).clipSlot(2).clip(),
        trackIndex: 1,
        getProperty: mockGetProperty({
          name: "Test Clip",
          length: 16,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
        }),
      };

      // Mock LiveAPI.from
      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((pathLike: unknown) => {
        const path = String(pathLike);

        if (path.includes("tracks 1") && !path.includes("clip")) {
          return {
            getProperty: vi.fn((prop: string) => {
              if (prop === "name") {
                return "Bass Track";
              }

              if (prop === "has_midi_input") {
                return 1;
              }

              return null;
            }),
            getColor: vi.fn().mockReturnValue("#FF5500"),
          } as unknown as LiveAPI;
        }

        if (path === "live_set") {
          return {
            getProperty: mockGetProperty({
              tempo: 120,
              signature_numerator: 4,
              signature_denominator: 4,
              scale_mode: 1,
              scale_name: "Minor",
              root_note: 0,
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "session",
          1,
          3,
          2,
        );

        expect(result.track).toStrictEqual({
          index: 1,
          name: "Bass Track",
          type: "midi",
          color: "#FF5500",
        });
        expect(result.clip).toStrictEqual({
          id: "clip-123",
          name: "Test Clip",
          length: 16,
          timeSignature: "4/4",
          looping: true,
          index: 1,
          count: 3,
        });
        expect(result.location).toStrictEqual({
          view: "session",
          path: "t1/s2",
        });
        expect(result.liveSet).toStrictEqual({
          tempo: 120,
          timeSignature: "4/4",
          scale: "C Minor",
        });
        expect(result.beatsPerBar).toBe(4);
      } finally {
        LiveAPI.from = originalFrom;
      }
    });

    it("should build context for arrangement clip", () => {
      const mockClip = {
        id: "clip-456",
        path: livePath.track(0).arrangementClip(3),
        getProperty: mockGetProperty({
          name: "Arr Clip",
          length: 8,
          signature_numerator: 3,
          signature_denominator: 4,
          looping: 0,
        }),
      };

      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((pathLike: unknown) => {
        const path = String(pathLike);

        if (path.includes("tracks 0") && !path.includes("arrangement")) {
          return {
            getProperty: vi.fn((prop: string) => {
              if (prop === "name") {
                return "Audio Track";
              }

              if (prop === "has_midi_input") {
                return 0;
              }

              return null;
            }),
            getColor: vi.fn().mockReturnValue(null),
          } as unknown as LiveAPI;
        }

        if (path === "live_set") {
          return {
            getProperty: mockGetProperty({
              tempo: 90,
              signature_numerator: 3,
              signature_denominator: 4,
              scale_mode: 0, // No scale
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "arrangement",
          0,
          1,
        );

        expect(result.track.type).toBe("audio");
        expect(result.track.color).toBeNull();
        expect(result.clip.looping).toBe(false);
        expect(result.clip.index).toBe(0);
        expect(result.clip.count).toBe(1);
        // No trackIndex on the clip, so there is no path to name it by
        expect(result.location).toStrictEqual({ view: "arrangement" });
        expect(result.liveSet.scale).toBeUndefined();
        expect(result.beatsPerBar).toBe(3);
      } finally {
        LiveAPI.from = originalFrom;
      }
    });

    // A clip on a take lane has to say so. Bare "t0" points user code at the
    // main lane, which is a different clip in the same spot.
    it("names the take lane in an arrangement clip's path", () => {
      const mockClip = {
        id: "clip-789",
        path: livePath.track(0).takeLane(2).arrangementClip(0),
        trackIndex: 0,
        takeLaneIndex: 2,
        getProperty: mockGetProperty({
          name: "Take 3",
          length: 4,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          start_time: 16,
        }),
      };

      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((pathLike: unknown) =>
        String(pathLike) === "live_set"
          ? ({
              getProperty: mockGetProperty({
                tempo: 120,
                signature_numerator: 4,
                signature_denominator: 4,
                scale_mode: 0,
              }),
            } as unknown as LiveAPI)
          : ({
              getProperty: vi.fn(() => null),
              getColor: vi.fn().mockReturnValue(null),
            } as unknown as LiveAPI),
      ) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "arrangement",
          0,
          1,
        );

        // 16 Ableton beats in 4/4 is bar 5 beat 1
        expect(result.location).toStrictEqual({
          view: "arrangement",
          path: "t0/l2[5|1]",
          arrangementStartBeats: 16,
        });
      } finally {
        LiveAPI.from = originalFrom;
      }
    });
  });

  describe("getClipLocationInfo", () => {
    it("should return session view info for session clip", () => {
      const mockClip = {
        path: livePath.track(0).clipSlot(2).clip(),
        getProperty: vi.fn().mockReturnValue(0), // is_arrangement_clip = 0
      };

      const result = getClipLocationInfo(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual({ view: "session", sceneIndex: 2 });
    });

    it("should return arrangement view info for arrangement clip", () => {
      const mockClip = {
        path: livePath.track(0).arrangementClip(3),
        getProperty: vi.fn((prop: string) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          if (prop === "start_time") {
            return 16;
          }

          return 0;
        }),
      };

      const result = getClipLocationInfo(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual({ view: "arrangement" });
    });
  });
});
