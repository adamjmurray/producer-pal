// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateDevice } from "../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// validateExclusiveParams only asks whether a param was sent, so an id or path
// that parses to nothing gets past it and would update no device — reading as
// "nothing to do". Refuse it instead.
describe("updateDevice when id or path names nothing", () => {
  it("refuses an id of only commas and blanks", () => {
    expect(() => updateDevice({ id: ",  ,", mute: true })).toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  it("refuses a path of only a comma", () => {
    expect(() => updateDevice({ path: ",", mute: true })).toThrow(
      'invalid path "," - it names nothing',
    );
  });

  // Unaffected: a blank value already reads as omitted, so the existing
  // required-param error still fires instead of a warning.
  it("still throws when id is whitespace-only", () => {
    expect(() => updateDevice({ id: "   ", mute: true })).toThrow(
      "id or path is required",
    );
  });
});
