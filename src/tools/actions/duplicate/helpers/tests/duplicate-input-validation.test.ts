// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  refuseDuplicateParamsOutsideType,
  validateAndConfigureRouteToSource,
} from "../duplicate-input-validation.ts";

describe("validateAndConfigureRouteToSource", () => {
  it("returns the user values unchanged when routeToSource is falsy", () => {
    expect(validateAndConfigureRouteToSource(false, false, true)).toStrictEqual(
      { withoutClips: false, withoutDevices: true },
    );
    expect(
      validateAndConfigureRouteToSource(undefined, undefined, undefined),
    ).toStrictEqual({ withoutClips: undefined, withoutDevices: undefined });
  });

  it("forces withoutClips/withoutDevices to true and says so once", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(true, false, false);

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

    validateAndConfigureRouteToSource(true, undefined, false);

    expect(warnSpy).toHaveBeenCalledWith(
      "withoutDevices ignored: routeToSource always copies without clips " +
        "and devices",
    );
  });

  it("says nothing when withoutClips/withoutDevices are not explicitly false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(true, true, undefined);

    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("refuseDuplicateParamsOutsideType", () => {
  it.each([
    ["clip", { count: 3 }, "count", 'type "track" or "scene"'],
    ["device", { count: 2 }, "count", 'type "track" or "scene"'],
    ["clip", { withoutClips: true }, "withoutClips", 'type "track" or "scene"'],
    ["scene", { withoutDevices: true }, "withoutDevices", 'type "track"'],
    ["scene", { routeToSource: true }, "routeToSource", 'type "track"'],
    ["track", { transforms: "velocity = 80" }, "transforms", 'type "clip"'],
    ["track", { code: "return notes" }, "code", 'type "clip"'],
    ["scene", { toSlot: "0/1" }, "toSlot", 'type "clip"'],
    ["scene", { takeLane: 2 }, "takeLane", 'type "clip"'],
    [
      "scene",
      { takeLaneName: "Take" },
      "takeLaneName",
      'type "clip" or "track"',
    ],
    [
      "device",
      { arrangementStart: "5|1" },
      "arrangementStart",
      'type "track", "scene" or "clip"',
    ],
    [
      "chain",
      { locator: "Verse" },
      "locator",
      'type "track", "scene" or "clip"',
    ],
    [
      "track",
      { arrangementLength: "4bar" },
      "arrangementLength",
      'type "clip" or "scene"',
    ],
  ])("refuses %s with %j", (type, args, param, home) => {
    expect(() => refuseDuplicateParamsOutsideType(type, args)).toThrow(
      `${param} is only for ${home}; this call has type "${type}". Change the type or drop ${param}.`,
    );
  });

  it("lets a type take what it reads", () => {
    expect(() =>
      refuseDuplicateParamsOutsideType("track", {
        count: 2,
        withoutClips: true,
        withoutDevices: true,
        routeToSource: true,
        takeLaneName: "Take",
      }),
    ).not.toThrow();
    expect(() =>
      refuseDuplicateParamsOutsideType("clip", {
        transforms: "velocity = 80",
        takeLane: 1,
        arrangementLength: "4bar",
        toSlot: "0/1",
      }),
    ).not.toThrow();
  });

  it("counts the default count, false flags, the main lane and blanks as not sent", () => {
    expect(() =>
      refuseDuplicateParamsOutsideType("device", {
        count: 1,
        withoutClips: false,
        withoutDevices: false,
        routeToSource: false,
        takeLane: 0,
        toSlot: "null",
        transforms: "",
      }),
    ).not.toThrow();
  });
});
