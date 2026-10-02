// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseCommaSeparatedIds } from "#src/tools/shared/helpers/param-presence.ts";

describe("parseCommaSeparatedIds", () => {
  it("parses simple comma-separated IDs", () => {
    const result = parseCommaSeparatedIds("1,2,3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("trims whitespace around IDs", () => {
    const result = parseCommaSeparatedIds("1, 2 , 3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("handles extra spaces and mixed formats", () => {
    const result = parseCommaSeparatedIds("  id1  ,  id2,id3  , id4  ");

    expect(result).toStrictEqual(["id1", "id2", "id3", "id4"]);
  });

  it("filters out empty strings", () => {
    const result = parseCommaSeparatedIds("1,,2,,,3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("filters out empty strings with spaces", () => {
    const result = parseCommaSeparatedIds("1, , 2,  , 3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("handles single ID without commas", () => {
    const result = parseCommaSeparatedIds("single-id");

    expect(result).toStrictEqual(["single-id"]);
  });

  it("handles single ID with trailing comma", () => {
    const result = parseCommaSeparatedIds("single-id,");

    expect(result).toStrictEqual(["single-id"]);
  });

  it("handles complex ID formats", () => {
    const result = parseCommaSeparatedIds("track_1, scene-2, clip:3");

    expect(result).toStrictEqual(["track_1", "scene-2", "clip:3"]);
  });

  it("handles numeric and string IDs mixed", () => {
    const result = parseCommaSeparatedIds("123, id_456, 789");

    expect(result).toStrictEqual(["123", "id_456", "789"]);
  });

  it("returns empty array for empty input after filtering", () => {
    const result = parseCommaSeparatedIds(",,, , ,");

    expect(result).toStrictEqual([]);
  });

  it("handles leading and trailing commas", () => {
    const result = parseCommaSeparatedIds(",1,2,3,");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("returns empty array for null or undefined", () => {
    expect(parseCommaSeparatedIds(null)).toStrictEqual([]);
    expect(parseCommaSeparatedIds(undefined)).toStrictEqual([]);
  });
});
