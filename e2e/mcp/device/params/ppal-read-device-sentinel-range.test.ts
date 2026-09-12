// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the range reported for a parameter with a word at one end.
 *
 * Where the word starts is Live's own answer, and the search that finds it can
 * stop early and report a range that is short without anything looking wrong —
 * Compressor's Ratio read as 64 when it reaches 100. A mock can only assert
 * what we already believed, so the numbers here come from real Live.
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-read-device-sentinel-range
 */
import { describe, expect, it } from "vitest";
import { createTestDevice, setupMcpTestContext } from "../../mcp-test-helpers";
import { readParam } from "../helpers/device-param-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("a parameter with a word at one end of its range", () => {
  it("reports the numbers up to where Compressor's Ratio turns into inf", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t2");

    // 100 : 1 is the last ratio Live spells as a number; above it reads
    // "inf : 1". Anything less than 100 here means the trim stopped short.
    expect(await readParam(ctx.client!, deviceId, "Ratio")).toStrictEqual(
      // Partial: the id is Live's, and the value is whatever the preset opens at.
      expect.objectContaining({ min: 1, max: 100, alsoAccepts: "inf : 1" }),
    );
  });

  it("reports the numbers up to where Glue Compressor's Release turns into A", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t2",
    );

    expect(await readParam(ctx.client!, deviceId, "Release")).toStrictEqual(
      expect.objectContaining({ min: 0.1, max: 1.2, alsoAccepts: "A" }),
    );
  });
});
