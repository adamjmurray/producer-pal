// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { deleteObject } from "../delete.ts";

// A comma-separated id/path with every segment blank parses to nothing, the
// same as an omitted param — but it was not omitted, so it must not read as
// "nothing to do" without saying why.
describe("deleteObject when id or path names nothing", () => {
  it("warns and returns nothing for an id of only commas and blanks", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(deleteObject({ id: ",  ,", type: "track" })).toStrictEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('id ",  ," names nothing');
  });

  it("warns and returns nothing for a path of only a comma", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(deleteObject({ path: ",", type: "device" })).toStrictEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('path "," names nothing');
  });

  // Both real ids are still deleted. The word is about the list itself: it came
  // out shorter than what was typed, which the caller would otherwise never
  // learn.
  it("says an empty id entry was dropped", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    deleteObject({ id: "123,,456", type: "track" });

    expect(warnSpy).toHaveBeenCalledWith(
      'id "123,,456" has empty entries, which were dropped',
    );
  });

  // Unaffected by the fix above: a blank value already reads as omitted, so
  // the existing required-param error still fires instead of a warning.
  it("still throws when id is whitespace-only", () => {
    expect(() => deleteObject({ id: "   ", type: "track" })).toThrow(
      "delete failed: id or path is required",
    );
  });

  it("still throws when id is a single empty string", () => {
    expect(() => deleteObject({ id: "", type: "track" })).toThrow(
      "delete failed: id or path is required",
    );
  });
});
