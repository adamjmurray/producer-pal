// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  inferDestination,
  validateAndConfigureRouteToSource,
  validateArrangementParameters,
  validateClipParameters,
} from "../duplicate-validation-helpers.ts";

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

  it("forces withoutClips/withoutDevices to true and warns when the user passed false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      false,
      false,
    );

    // Returned config is forced to true for both, regardless of the user's false.
    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).toHaveBeenCalledWith(
      "routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  });

  it("does not warn when withoutClips/withoutDevices are not explicitly false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      true,
      undefined,
    );

    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignoring user-provided withoutClips"),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignoring user-provided withoutDevices"),
    );
  });
});

describe("inferDestination", () => {
  it("returns 'arrangement' when arrangementStart is a real position", () => {
    expect(inferDestination("clip", "1|1", undefined, undefined)).toBe(
      "arrangement",
    );
  });

  it("treats a whitespace-only arrangementStart as no arrangement params", () => {
    // The `.trim() !== ""` guard: "   " must NOT be read as an arrangement start.
    expect(inferDestination("clip", "   ", undefined, "0/0")).toBe("session");
    expect(inferDestination("track", "   ", undefined, undefined)).toBe(
      "session",
    );
  });

  it("returns 'arrangement' when a locator is given", () => {
    expect(inferDestination("clip", undefined, "Verse", undefined)).toBe(
      "arrangement",
    );
  });

  it("returns 'session' for a clip only when toSlot is present, else undefined", () => {
    expect(inferDestination("clip", undefined, undefined, "0/0")).toBe(
      "session",
    );
    expect(
      inferDestination("clip", undefined, undefined, undefined),
    ).toBeUndefined();
  });

  it("returns undefined for a device", () => {
    expect(
      inferDestination("device", undefined, undefined, undefined),
    ).toBeUndefined();
  });

  it("defaults tracks and scenes to session", () => {
    expect(inferDestination("track", undefined, undefined, undefined)).toBe(
      "session",
    );
    expect(inferDestination("scene", undefined, undefined, undefined)).toBe(
      "session",
    );
  });
});

describe("validateClipParameters", () => {
  it("does nothing for non-clip types", () => {
    expect(() =>
      validateClipParameters("track", undefined, undefined),
    ).not.toThrow();
  });

  it("throws when a clip has no resolved destination", () => {
    expect(() => validateClipParameters("clip", undefined, undefined)).toThrow(
      "clip requires toSlot",
    );
  });

  it("throws when a session clip is missing toSlot (whitespace only)", () => {
    expect(() => validateClipParameters("clip", "session", "  ")).toThrow(
      "toSlot is required for session clips",
    );
  });

  it("accepts a session clip with a real toSlot", () => {
    expect(() =>
      validateClipParameters("clip", "session", "0/0"),
    ).not.toThrow();
  });

  it("accepts an arrangement clip with no toSlot", () => {
    expect(() =>
      validateClipParameters("clip", "arrangement", undefined),
    ).not.toThrow();
  });
});

describe("validateArrangementParameters", () => {
  it("does nothing when destination is not arrangement", () => {
    // Even with both start and locator present, a non-arrangement destination
    // must return early without throwing.
    expect(() =>
      validateArrangementParameters("session", "1|1", "Verse"),
    ).not.toThrow();
  });

  it("throws when both arrangementStart and locator are given", () => {
    expect(() =>
      validateArrangementParameters("arrangement", "1|1", "Verse"),
    ).toThrow("arrangementStart and locator are mutually exclusive");
  });

  it("treats a whitespace-only arrangementStart as absent (no conflict with locator)", () => {
    // The `.trim() !== ""` guard: "   " is not a real start, so pairing it with
    // a locator must NOT trip the mutual-exclusivity throw.
    expect(() =>
      validateArrangementParameters("arrangement", "   ", "Verse"),
    ).not.toThrow();
  });

  it("accepts arrangementStart alone", () => {
    expect(() =>
      validateArrangementParameters("arrangement", "1|1", undefined),
    ).not.toThrow();
  });
});
