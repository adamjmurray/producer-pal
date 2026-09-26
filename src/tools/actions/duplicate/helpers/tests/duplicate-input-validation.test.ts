// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { validateAndConfigureRouteToSource } from "../duplicate-input-validation.ts";

describe("validateAndConfigureRouteToSource", () => {
  it("returns the user values unchanged when routeToSource is falsy", () => {
    expect(
      validateAndConfigureRouteToSource("track", false, false, true),
    ).toStrictEqual({ withoutClips: false, withoutDevices: true });
    expect(
      validateAndConfigureRouteToSource(
        "track",
        undefined,
        undefined,
        undefined,
      ),
    ).toStrictEqual({ withoutClips: undefined, withoutDevices: undefined });
  });

  it("throws when routeToSource is used with a non-track type", () => {
    expect(() =>
      validateAndConfigureRouteToSource("scene", true, undefined, undefined),
    ).toThrow("routeToSource is only supported for type 'track'");
  });

  it("forces withoutClips/withoutDevices to true and says so once", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      false,
      false,
    );

    // Returned config is forced to true for both, regardless of the user's false.
    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "withoutClips/withoutDevices ignored: routeToSource always copies " +
        "without clips and devices",
    );
  });

  it("names only the param the call actually sent as false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    validateAndConfigureRouteToSource("track", true, undefined, false);

    expect(warnSpy).toHaveBeenCalledWith(
      "withoutDevices ignored: routeToSource always copies without clips " +
        "and devices",
    );
  });

  it("says nothing when withoutClips/withoutDevices are not explicitly false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      true,
      undefined,
    );

    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
