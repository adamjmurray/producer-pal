// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { cutArrangementClipAt } from "../../arrangement-duplicate-workaround.ts";
import { type LaneView } from "../../helpers/arrangement-lane-view.ts";
import { type ClipSpan } from "../../helpers/arrangement-write-effects.ts";
import {
  guardInsideCreate,
  type InsideCreate,
} from "../../inside-create-guard.ts";

vi.mock(import("../../arrangement-duplicate-workaround.ts"), () => ({
  cutArrangementClipAt: vi.fn(),
}));

const MAIN: ArrangementLane = { kind: "track", trackIndex: 2 };
const TAKE: ArrangementLane = {
  kind: "take-lane",
  trackIndex: 2,
  laneIndex: 0,
};
// Bar 5 to bar 9 in 4/4.
const HOST: ClipSpan = { id: "50", start: 16, end: 32 };

/**
 * A lane view that answers `covering` from a list of answers, one per call.
 * @param answers - What each call returns
 * @returns The view, and the spy
 */
function lanesAnswering(...answers: (ClipSpan | undefined)[]): {
  lanes: LaneView;
  covering: ReturnType<typeof vi.fn>;
} {
  const covering = vi.fn();

  for (const answer of answers) {
    covering.mockReturnValueOnce(answer);
  }

  return { lanes: { covering } as unknown as LaneView, covering };
}

/**
 * A create on the main lane, with overrides.
 * @param lanes - The call's lanes
 * @param overrides - Fields to change
 * @returns The create
 */
function create(
  lanes: LaneView,
  overrides: Partial<InsideCreate> = {},
): InsideCreate {
  return {
    laneApi: {} as LiveAPI,
    lane: MAIN,
    start: 20,
    end: 24,
    isMidi: true,
    context: { lanes },
    ...overrides,
  };
}

describe("guardInsideCreate", () => {
  beforeEach(() => {
    vi.mocked(cutArrangementClipAt).mockReset();
    registerMockObject("live_set", {
      path: "live_set",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
  });

  it.each(["12.4", "12.4.16", "12.4.0b3", "13.0", "13.0b1", "", "Live 12"])(
    "reads nothing and cuts nothing on Live %j",
    (version) => {
      registerLiveVersion(version);
      const { lanes, covering } = lanesAnswering(HOST);

      const untouchable = (): never => {
        throw new Error("read the lane object");
      };

      // No lane given, and a lane object that throws on any read.
      const laneApi = {
        get type(): never {
          return untouchable();
        },
        get trackIndex(): never {
          return untouchable();
        },
        get takeLaneIndex(): never {
          return untouchable();
        },
      } as unknown as LiveAPI;

      guardInsideCreate(create(lanes, { lane: undefined, laneApi }));

      expect(covering).not.toHaveBeenCalled();
      expect(cutArrangementClipAt).not.toHaveBeenCalled();
    },
  );

  describe("on Live 12.3", () => {
    beforeEach(() => {
      registerLiveVersion("12.3.8");
    });

    it("cuts the clip at the new start when both edges fall inside it", () => {
      const { lanes } = lanesAnswering(HOST, undefined);
      const onCut = vi.fn();

      guardInsideCreate(create(lanes, { onCut }));

      expect(cutArrangementClipAt).toHaveBeenCalledWith(
        expect.anything(),
        HOST,
        20,
        true,
        expect.objectContaining({ lanes }),
      );
      expect(onCut).toHaveBeenCalledWith("t2[5|1]");
    });

    it("cuts for audio whenever the start is inside, its end being unknown", () => {
      const { lanes } = lanesAnswering(HOST, undefined);

      guardInsideCreate(create(lanes, { end: null, isMidi: false }));

      expect(cutArrangementClipAt).toHaveBeenCalledWith(
        expect.anything(),
        HOST,
        20,
        false,
        expect.anything(),
      );
    });

    it.each([
      ["reaches the clip's end", { end: 32 }],
      ["runs past the clip's end", { end: 40 }],
    ])("leaves the clip alone when the new clip %s", (_, overrides) => {
      const { lanes } = lanesAnswering(HOST);

      guardInsideCreate(create(lanes, overrides));

      expect(cutArrangementClipAt).not.toHaveBeenCalled();
    });

    it.each([
      ["no clip covers the start", undefined],
      ["the start is on the clip's own start", { ...HOST, start: 20 }],
      [
        "the start is a rounding past the clip's start",
        { ...HOST, start: 20 - 1e-9 },
      ],
    ])("leaves the lane alone when %s", (_, covering) => {
      const { lanes } = lanesAnswering(covering);

      guardInsideCreate(create(lanes));

      expect(cutArrangementClipAt).not.toHaveBeenCalled();
    });

    it("reads a main lane from its track when not given one", () => {
      const { lanes } = lanesAnswering(HOST, undefined);
      const onCut = vi.fn();

      registerMockObject("track-3", {
        path: "live_set tracks 3",
        type: "Track",
      });

      guardInsideCreate(
        create(lanes, {
          lane: undefined,
          laneApi: LiveAPI.from("live_set tracks 3"),
          onCut,
        }),
      );

      expect(onCut).toHaveBeenCalledWith("t3[5|1]");
    });

    it("reads the lane from the lane object when not given one", () => {
      const { lanes } = lanesAnswering(HOST);

      registerMockObject("lane-0", {
        path: "live_set tracks 2 take_lanes 0",
        type: "TakeLane",
      });
      const laneApi = LiveAPI.from("live_set tracks 2 take_lanes 0");

      expect(() =>
        guardInsideCreate(create(lanes, { lane: undefined, laneApi })),
      ).toThrow("on a take lane (t2/l0[5|1])");
    });

    it("refuses on a take lane, where nothing can be cut", () => {
      const { lanes } = lanesAnswering(HOST);

      expect(() => guardInsideCreate(create(lanes, { lane: TAKE }))).toThrow(
        "Live 12.3 crashes placing a clip inside another on a take lane " +
          "(t2/l0[5|1]); start it at or outside that clip's edges, or use Live 12.4",
      );
      expect(cutArrangementClipAt).not.toHaveBeenCalled();
    });

    it("refuses when the start is still inside a clip after the cut", () => {
      const { lanes } = lanesAnswering(HOST, HOST);
      const onCut = vi.fn();

      expect(() => guardInsideCreate(create(lanes, { onCut }))).toThrow(
        "couldn't cut the clip at t2[5|1] first, and Live 12.3 crashes",
      );
      expect(onCut).toHaveBeenCalled();
    });

    it("says a cut that failed may have left a copy behind", () => {
      const { lanes } = lanesAnswering(HOST);

      vi.mocked(cutArrangementClipAt).mockImplementation(() => {
        throw new Error("Live said no");
      });

      expect(() => guardInsideCreate(create(lanes))).toThrow(
        "couldn't cut the clip at t2[5|1] first (Live said no); it may be " +
          "left partly cut, with a copy past the end of the arrangement",
      );
    });
  });
});
