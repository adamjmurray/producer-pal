// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// An id whose entries all trim away parses to nothing, the same as an omitted
// id — but it was sent, so the empty result must say why instead of reading as
// "nothing to do".
describe("updateTrack when id names nothing", () => {
  it("warns once and returns nothing for an id of only commas and blanks", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(updateTrack({ id: ",  ," })).toStrictEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('id ",  ," names nothing');
  });

  // Unaffected: a blank value already reads as omitted, so the existing
  // required-param warning still fires instead.
  it("still reports a whitespace-only id as missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(updateTrack({ id: "   " })).toStrictEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("updateTrack: id is required");
  });
});
