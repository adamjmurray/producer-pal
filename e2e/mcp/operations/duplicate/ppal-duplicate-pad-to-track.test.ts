// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for copying a drum pad's chain to a new MIDI track
 * (`toPath: "t+"`). It needs the Producer Pal remote script.
 *
 * Run with: npm run e2e:mcp -- operations/duplicate/ppal-duplicate-pad-to-track
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";

interface Entry {
  id: string;
  path: string;
}

/** The test Set's Drum Rack: pads on C1, D1, D#1 and F#1. */
const RACK = "t0/d0";

describe.skipIf(!REMOTE_SCRIPT_E2E)("duplicate a drum pad to a track", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true });

  /**
   * Call duplicate on drum pads.
   * @param path - The source pad path(s)
   * @param toPath - The destination(s)
   * @param name - Name(s) for the copies
   * @returns The raw tool result
   */
  function duplicatePad(
    path: string,
    toPath: string,
    name?: string,
  ): Promise<unknown> {
    return ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "drum-pad", path, toPath, name },
    });
  }

  /**
   * Read one object.
   * @param tool - The read tool
   * @param path - The object's path
   * @returns What the tool answered
   */
  async function read<T>(tool: string, path: string): Promise<T> {
    return parseToolResult<T>(
      await ctx.client!.callTool({ name: tool, arguments: { path } }),
    );
  }

  /**
   * How many regular tracks the Set has.
   * @returns The count
   */
  async function trackCount(): Promise<number> {
    const liveSet = parseToolResult<{ tracks?: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );

    return liveSet.tracks?.length ?? 0;
  }

  it("copies a pad's chain to a new track after the last one", async () => {
    const before = await trackCount();
    const entry = parseToolResult<Entry>(
      await duplicatePad(`${RACK}/pC1`, "t+"),
    );

    expect(trackIndexFromPath(entry.path)).toBe(before);

    await sleep(150);

    expect(await trackCount()).toBe(before + 1);
    expect(
      (await read<{ type: string }>("ppal-read-device", `${entry.path}/d0`))
        .type,
    ).toContain("instrument");
    // The pad keeps its chain.
    expect(
      (await read<{ type: string }>("ppal-read-device", `${RACK}/pC1/d0`)).type,
    ).toContain("instrument");
  });

  it("names the new tracks, and takes a pad destination in the same call", async () => {
    const before = await trackCount();
    const [first, second, third] = parseBatchResult<Entry>(
      await duplicatePad(
        `${RACK}/pD1,${RACK}/pD#1,${RACK}/pC1`,
        `t+,t+,${RACK}/pC3`,
        "Snare,Clap,Kick 2",
      ),
      3,
    );

    expect(first?.path).toBe(`t${before}`);
    expect(second?.path).toBe(`t${before + 1}`);
    expect(third?.path).toBe(`${RACK}/pC3`);

    await sleep(150);

    expect(
      (await read<{ name: string }>("ppal-read-track", `t${before}`)).name,
    ).toBe("Snare");
    expect(
      (await read<{ name: string }>("ppal-read-track", `t${before + 1}`)).name,
    ).toBe("Clap");
  });

  it("refuses an empty pad without making a track", async () => {
    const before = await trackCount();

    expect(
      getToolErrorMessage(await duplicatePad(`${RACK}/pC2`, "t+")),
    ).toContain("is empty, nothing to copy");
    expect(await trackCount()).toBe(before);
  });
});
