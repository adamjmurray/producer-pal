// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { updateDevice } from "../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// validateExclusiveParams only asks whether a param was sent, so an id or path
// that parses to nothing gets past it and updates no device. That must say why
// instead of reading as "nothing to do".
describe("updateDevice when id or path names nothing", () => {
  it("warns once and returns nothing for an id of only commas and blanks", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(updateDevice({ id: ",  ,", mute: true })).toStrictEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('id ",  ," names nothing');
  });

  it("warns once and returns nothing for a path of only a comma", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(updateDevice({ path: ",", mute: true })).toStrictEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('path "," names nothing');
  });

  // Unaffected: a blank value already reads as omitted, so the existing
  // required-param error still fires instead of a warning.
  it("still throws when id is whitespace-only", () => {
    expect(() => updateDevice({ id: "   ", mute: true })).toThrow(
      "Either id or path must be provided",
    );
  });
});
