// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { optionalString, requireString } from "./route-args.ts";

describe("requireString", () => {
  it("returns the string value of a present field", () => {
    expect(requireString({ name: "kick" }, "name")).toBe("kick");
  });

  it("throws a clean, field-named message when the field is missing", () => {
    expect(() => requireString({ other: "x" }, "name")).toThrow(
      "name must be a string",
    );
  });

  it("throws when the field is present but not a string", () => {
    expect(() => requireString({ count: 3 }, "count")).toThrow(
      "count must be a string",
    );
  });

  it("throws the clean message (not a TypeError) when args is null", () => {
    // The `?.[key]` guard must short-circuit to undefined so the string check
    // renders the intended message; without it, `null[key]` would TypeError.
    expect(() => requireString(null, "name")).toThrow("name must be a string");
  });

  it("throws the clean message when args is undefined", () => {
    expect(() => requireString(undefined, "name")).toThrow(
      "name must be a string",
    );
  });
});

describe("optionalString", () => {
  it("returns the string value of a present field", () => {
    expect(optionalString({ description: "warm pad" }, "description")).toBe(
      "warm pad",
    );
  });

  it('defaults to "" when the field is absent', () => {
    expect(optionalString({ other: "x" }, "description")).toBe("");
  });

  it('defaults to "" when the field is present but not a string', () => {
    expect(optionalString({ enabled: true }, "enabled")).toBe("");
  });

  it('returns "" (not a TypeError) when args is null', () => {
    // Same `?.[key]` guard: a null blob must read as an absent field, not throw.
    expect(optionalString(null, "description")).toBe("");
  });

  it('returns "" when args is undefined', () => {
    expect(optionalString(undefined, "description")).toBe("");
  });
});
