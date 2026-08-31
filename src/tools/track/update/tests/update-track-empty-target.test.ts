// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
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

// name and color are positional: name[k] goes to id[k]. An empty entry leaves
// the list one short, so every name after it lands on the wrong track and the
// last one falls off the end entirely.
describe("updateTrack when an id entry is empty", () => {
  beforeEach(() => {
    registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
  });

  it("says the entry was dropped instead of renaming the wrong track quietly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    updateTrack({ id: "123,,456", name: "A,B,C" });

    expect(warn).toHaveBeenCalledWith(
      'id "123,,456" has empty entries, which were dropped',
    );
  });

  it("stays quiet for a clean list or a trailing comma", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    updateTrack({ id: "123,456", name: "A,B" });
    updateTrack({ id: "123,456,", name: "A,B" });

    expect(warn).not.toHaveBeenCalled();
  });
});
