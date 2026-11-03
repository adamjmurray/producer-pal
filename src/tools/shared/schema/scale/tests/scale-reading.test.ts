// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  formatScale,
  readScaleMask,
  readScalePitches,
  readScaleState,
} from "../scale-reading.ts";
import { C_MAJOR_INTERVALS } from "./scale-test-helpers.ts";

/**
 * A scale holder that answers with the given properties.
 * @param props - The properties it holds
 * @returns The holder
 */
function holding(props: Record<string, unknown>): LiveAPI {
  return { getProperty: (name: string) => props[name] } as unknown as LiveAPI;
}

describe("scale reading", () => {
  it("reads whether a scale is on, with its root and name", () => {
    expect(
      readScaleState(
        holding({ scale_mode: 1, root_note: 6, scale_name: "Minor" }),
      ),
    ).toStrictEqual({ enabled: true, rootNote: 6, name: "Minor" });
    expect(readScaleState(holding({ scale_mode: 0 })).enabled).toBe(false);
  });

  it("spells a scale with the root's flat name", () => {
    expect(formatScale({ rootNote: 6, name: "Minor" })).toBe("Gb Minor");
    expect(formatScale({ rootNote: 0, name: "Major" })).toBe("C Major");
  });

  it("lists the pitches of a scale from its root", () => {
    const scale = holding({ scale_intervals: C_MAJOR_INTERVALS });

    expect(readScalePitches(scale, 0)).toBe("C,D,E,F,G,A,B");
    expect(readScalePitches(scale, 2)).toBe("D,E,Gb,G,A,B,Db");
  });

  it("makes a mask of a scale, and none of a chromatic one", () => {
    expect(
      readScaleMask(holding({ scale_intervals: C_MAJOR_INTERVALS }), 0),
    ).toBe(2741);
    expect(
      readScaleMask(
        holding({ scale_intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }),
        0,
      ),
    ).toBeUndefined();
  });
});
