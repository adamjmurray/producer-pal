// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that an error quotes the param the caller sent. A hidden alias
 * (`paths`, `ids`, `trackId`, `device`, `queries`, a routing `*Id`) is named
 * as sent, not as the published param it stands in for.
 * Uses: e2e-test-set (t8 is an empty MIDI track)
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- workflow/ppal-sent-param-names
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseAliasedToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** Calls a tool and returns the message it refused with. */
async function refusalOf(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await ctx.client!.callTool({ name, arguments: args });

  expect(isToolError(result)).toBe(true);

  return getToolErrorMessage(result);
}

describe("errors name the param the caller sent", () => {
  it.each([
    ["ppal-update-clip", { name: "x" }, "t0/s0,,t0/s1"],
    ["ppal-update-track", { mute: false }, "t0,,t1"],
    ["ppal-update-scene", { name: "x" }, "s0,,s1"],
    ["ppal-update-device", { name: "x" }, "t0/d0,,t0/d1"],
    ["ppal-read-track", {}, "t0,,t1"],
  ])("%s: a hole in paths", async (tool, args, list) => {
    expect(await refusalOf(tool, { ...args, paths: list })).toContain(
      `invalid paths "${list}" - it has an empty entry`,
    );
  });

  it("names ids on the entry of an id that doesn't exist", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: "99999,99998", mute: false },
    });

    expect(parseAliasedToolResult(result, "ids", "id")).toStrictEqual([
      { id: "99999", ok: false, detail: 'ids "99999" does not exist' },
      { id: "99998", ok: false, detail: 'ids "99998" does not exist' },
    ]);
  });

  it.each([
    ["ppal-read-track", "trackId"],
    ["ppal-read-scene", "sceneId"],
    ["ppal-read-clip", "clipId"],
    ["ppal-read-device", "deviceId"],
    ["ppal-select", "trackId"],
  ])("%s: an id sent as %s that doesn't exist", async (tool, alias) => {
    expect(await refusalOf(tool, { [alias]: "999999" })).toContain(
      `${alias} "999999" does not exist`,
    );
  });

  it("names the path of a track that isn't there as paths", async () => {
    expect(
      await refusalOf("ppal-update-track", { paths: "t999", mute: false }),
    ).toContain('no track at paths "t999"; ppal-create-track adds tracks');
  });

  it("names device in a device list with a hole", async () => {
    expect(
      await refusalOf("ppal-create-device", {
        path: "t0/d+,t1/d+,t2/d+",
        device: "EQ Eight,,Compressor",
      }),
    ).toContain(
      'invalid device "EQ Eight,,Compressor" - it has an empty entry',
    );
  });

  it("names queries when the search list is empty or bare", async () => {
    expect(
      await refusalOf("ppal-library", { action: "search", queries: [] }),
    ).toContain("queries must name at least one search");
    expect(
      await refusalOf("ppal-library", {
        action: "search",
        queries: [{ label: "Kicks" }],
      }),
    ).toContain('queries "Kicks" has no query or filter');
  });

  it("names a routing alias that matches nothing", async () => {
    expect(
      await refusalOf("ppal-update-track", {
        path: `t${EMPTY_MIDI_TRACK}`,
        outputRoutingTypeId: "Nowhere",
      }),
    ).toContain('the track has no outputRoutingTypeId named "Nowhere"');
  });
});
