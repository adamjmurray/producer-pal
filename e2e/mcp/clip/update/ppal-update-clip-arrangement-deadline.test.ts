// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for arrangementLength running out of time mid-tiling.
 *
 * How far it got is about the one clip being lengthened, so it belongs on that
 * clip's entry, not in a warning. Only a real Live is slow enough to hit it:
 * the deadline comes from the request timeout, which the REST endpoint lets a
 * caller shorten with ?timeoutMs=.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-deadline
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  MCP_URL,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

const TRACK = `t${EMPTY_MIDI_TRACK}`;

/**
 * Short enough that Live cannot tile 500 bars inside it. Half of it is the
 * safety buffer, so tiling stops at about 500ms and the response still comes
 * back well before the request itself times out.
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

describe("arrangementLength that runs out of time", () => {
  it("says how far it tiled on the clip's own entry", async () => {
    const clip = await createLoopedClip(`${TRACK}[801|1]`);

    // 499 one-bar tiles after the bar it has: far more than half a second
    // of duplicating.
    const { result, warnings } = await updateClipOverRest(
      { id: clip.id, arrangementLength: "500bar" },
      SHORT_TIMEOUT_MS,
    );

    const entry = Array.isArray(result) ? result[0] : result;

    expect(entry?.id).toBe(clip.id);
    expect(entry?.detail).toMatch(
      /^ran out of time: placed \d+ of 499 tiles, reaching \d+(\.\d+)? beats instead of \d+(\.\d+)?; re-run to continue/,
    );
    // The clip's entry carries it, so nothing is left for a warning to say.
    expect(warnings ?? []).toStrictEqual([]);
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
 * the request timeout the tiling deadline is derived from.
 * @param args - Tool arguments
 * @param timeoutMs - The request budget to impose
 * @returns The parsed tool result and any warnings beside it
 */
async function updateClipOverRest(
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<RestResponse> {
  const url = `${MCP_URL.replace("/mcp", "/api/tools/ppal-update-clip")}?format=json&timeoutMs=${timeoutMs}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as RestResponse;
}
