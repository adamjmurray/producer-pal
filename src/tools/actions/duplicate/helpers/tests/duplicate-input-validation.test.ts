// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  validateAndConfigureRouteToSource,
  validateBasicInputs,
} from "../duplicate-input-validation.ts";

describe("validateAndConfigureRouteToSource", () => {
  it("says nothing when routeToSource is falsy", () => {
    const warnSpy = vi.spyOn(console, "warn");

    validateAndConfigureRouteToSource("track", "false", "false", "true");
    validateAndConfigureRouteToSource("track", undefined, undefined, undefined);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws when routeToSource is used with a non-track type", () => {
    expect(() =>
      validateAndConfigureRouteToSource("scene", "true", undefined, undefined),
    ).toThrow("routeToSource is only supported for type 'track'");
  });

  it("throws when only one source in the list asked to route", () => {
    expect(() =>
      validateAndConfigureRouteToSource(
        "scene",
        "false,true",
        undefined,
        undefined,
      ),
    ).toThrow("routeToSource is only supported for type 'track'");
  });

  it("says withoutClips/withoutDevices are ignored, once", () => {
    const warnSpy = vi.spyOn(console, "warn");

    validateAndConfigureRouteToSource("track", "true", "false", "false");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "withoutClips/withoutDevices ignored: routeToSource always copies " +
        "without clips and devices",
    );
  });

  it("names only the param the call actually sent as false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    validateAndConfigureRouteToSource("track", "true", undefined, "false");

    expect(warnSpy).toHaveBeenCalledWith(
      "withoutDevices ignored: routeToSource always copies without clips " +
        "and devices",
    );
  });

  it("says nothing when withoutClips/withoutDevices are not explicitly false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    validateAndConfigureRouteToSource("track", "true", "true", undefined);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("validateBasicInputs count", () => {
  it("accepts a whole number for every source", () => {
    expect(() => validateBasicInputs("track", "1,2", "2,3")).not.toThrow();
  });

  it("refuses an entry below one", () => {
    expect(() => validateBasicInputs("track", "1,2", "2,0")).toThrow(
      "count must be at least 1",
    );
  });

  it("refuses an entry that names no whole number", () => {
    expect(() => validateBasicInputs("track", "1", "1.5")).toThrow(
      'count "1.5" must be a whole number',
    );
  });
});
