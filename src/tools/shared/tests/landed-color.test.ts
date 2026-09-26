// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";

/**
 * A stand-in for the object just written to.
 * @param getColor - What reading the color back does
 * @returns The object
 */
function objectReading(getColor: () => string | null): LiveAPI {
  return { getColor: vi.fn(getColor) } as unknown as LiveAPI;
}

describe("landedColor", () => {
  it("says nothing when the color landed as asked", () => {
    expect(
      landedColor(
        objectReading(() => "#FF0000"),
        "#FF0000",
      ),
    ).toStrictEqual({});
  });

  it("compares without case, so #ff0000 and #FF0000 are the same color", () => {
    expect(
      landedColor(
        objectReading(() => "#FF0000"),
        "#ff0000",
      ),
    ).toStrictEqual({});
  });

  it("reports the palette color Live snapped to", () => {
    expect(
      landedColor(
        objectReading(() => "#FF3636"),
        "#FF0000",
      ),
    ).toStrictEqual({
      color: "#FF3636",
      detail: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
  });

  // Nothing came back to compare with, so the write is left unclaimed rather
  // than reported as a mismatch against a color Live never named.
  it("says nothing when there is no color to read back", () => {
    expect(
      landedColor(
        objectReading(() => null),
        "#FF0000",
      ),
    ).toStrictEqual({});
  });

  it("reports a color it set but could not read back", () => {
    const object = objectReading(() => {
      throw new Error("object is gone");
    });

    expect(landedColor(object, "#FF0000")).toStrictEqual({
      detail:
        "color #FF0000 was set but could not be read back: object is gone",
    });
  });
});
