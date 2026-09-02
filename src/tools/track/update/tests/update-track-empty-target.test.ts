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

// An id whose entries all trim away was still sent, and reads exactly like an
// omitted id. Nothing has run yet, so refusing costs the caller nothing.
describe("updateTrack when id names nothing", () => {
  it("refuses an id of only commas and blanks", () => {
    expect(() => updateTrack({ id: ",  ," })).toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  // A blank value reads as omitted, so this lands on the missing-target
  // refusal rather than the names-nothing one.
  it("still reports a whitespace-only id as missing", () => {
    expect(() => updateTrack({ id: "   " })).toThrow(
      "updateTrack failed: id or path is required",
    );
  });
});

// name and color are positional: name[k] goes to id[k]. Dropping an empty entry
// leaves the list one short, so every name after it lands on the wrong track;
// keeping it names nothing. Neither reading is recoverable, so neither is taken.
describe("updateTrack when an id entry is empty", () => {
  beforeEach(() => {
    registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
  });

  it("refuses the call instead of renaming the wrong track quietly", () => {
    expect(() => updateTrack({ id: "123,,456", name: "A,B,C" })).toThrow(
      'invalid id "123,,456" - it has an empty entry.',
    );
  });

  it("stays quiet for a clean list or a trailing comma", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    updateTrack({ id: "123,456", name: "A,B" });
    updateTrack({ id: "123,456,", name: "A,B" });

    expect(warn).not.toHaveBeenCalled();
  });
});
