// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test that a long arrangementLength fits a short request budget.
 *
 * A looping clip is resized in place, not copied loop by loop, so even 500 bars
 * is a handful of Live calls. The deadline comes from the request timeout,
 * which the REST endpoint lets a caller shorten with ?timeoutMs=.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-deadline
 */
import { describe, expect, it } from "vitest";
import { siblingUrl } from "#evals/shared/config.ts";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import {
  type CreateClipResult,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

const TRACK = `t${EMPTY_MIDI_TRACK}`;

/**
 * Half of it is the safety buffer, so the work has about 500ms. Copying 499
 * one-bar loops took far longer than that.
 */
const SHORT_TIMEOUT_MS = 1000;

interface RestClipEntry {
  id: string;
  detail?: string;
}

interface RestResponse {
  result: RestClipEntry | RestClipEntry[];
  warnings?: string[];
}

describe("arrangementLength under a short request budget", () => {
  it("lengthens a looping clip by 500 bars in time", async () => {
    const clip = await createLoopedClip(`${TRACK}[801|1]`);
    const { result, warnings } = await updateClipOverRest(
      { id: clip.id, arrangementLength: "500bar" },
      SHORT_TIMEOUT_MS,
    );

    // One entry: the clip itself, with nothing to say.
    expect(Array.isArray(result)).toBe(false);
    expect((result as RestClipEntry).id).toBe(clip.id);
    expect((result as RestClipEntry).detail).toBeUndefined();
    expect(warnings ?? []).toStrictEqual([]);

    const read = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: clip.id, include: ["timing"] },
      }),
    );

    expect(read).toStrictEqual(
      expect.objectContaining({ looping: true, arrangementLength: "500bar" }),
    );
  });
});

/**
 * Create a looping one-bar MIDI clip in the arrangement.
 * @param path - Where to create it
 * @returns The created clip
 */
async function createLoopedClip(path: string): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path, name: "Deadline", length: "1bar", notes: "C3 1|1" },
  });

  await sleep(100);

  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

/**
 * Call ppal-update-clip over REST, which is the only caller that can shorten
 * the request timeout the deadline is derived from.
 * @param args - Tool arguments
 * @param timeoutMs - The request budget to impose
 * @returns The parsed tool result and any warnings beside it
 */
async function updateClipOverRest(
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<RestResponse> {
  const url = `${siblingUrl(MCP_URL, "api/tools/ppal-update-clip")}?format=json&timeoutMs=${timeoutMs}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as RestResponse;
}
