// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for errors that tell a model how to recover. Every call here is
 * refused or skipped before it changes anything, so one Set serves them all.
 * Uses: racks-test — a Drum Rack inside an Instrument Rack chain, so a pad path
 * aimed at the Instrument Rack ("t0/d0/pC1") misses and the Drum Rack is
 * "t0/d0/c0/d0".
 *
 * Run with: npm run e2e:mcp -- ppal-error-text-recovery
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { RACKS_TEST_PATH } from "../../e2e-test-set.ts";
import { KIT } from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

const NESTED = `the drum rack is nested; try "${KIT}/pC1`;

/**
 * Call a tool and return everything it said, whether it refused or skipped.
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The result text
 */
async function say(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return extractToolResultText(
    await ctx.client!.callTool({ name, arguments: args }),
  );
}

describe("a pad path aimed at the rack that holds the kit", () => {
  it("names the nested path when creating a device", async () => {
    expect(
      await say("ppal-create-device", {
        device: "Operator",
        path: "t0/d0/pC1",
      }),
    ).toContain(`container at path "t0/d0/pC1" does not exist — ${NESTED}"`);
  });

  it("names the nested path when deleting a pad", async () => {
    expect(
      JSON.parse(
        await say("ppal-delete", { type: "drum-pad", path: "t0/d0/pC1" }),
      ),
    ).toStrictEqual({
      path: "t0/d0/pC1",
      detail: `nothing to delete — ${NESTED}"`,
    });
  });

  it("names the nested path when copying a pad", async () => {
    expect(
      await say("ppal-duplicate", {
        type: "drum-pad",
        path: "t0/d0/pC1",
        toPath: `${KIT}/pD1`,
      }),
    ).toContain(NESTED);
  });

  it("names the nested path when updating a pad", async () => {
    expect(
      await say("ppal-update-device", { path: "t0/d0/pC1", name: "X" }),
    ).toContain(NESTED);
  });
});

describe("c+ and d+ where they don't belong", () => {
  it("says a pad copy goes onto a whole pad, not onto a c+", async () => {
    const text = await say("ppal-duplicate", {
      type: "drum-pad",
      path: `${KIT}/pF1`,
      toPath: `${KIT}/pC1/c+`,
    });

    expect(text).toContain(
      `invalid toPath "${KIT}/pC1/c+" - a drum-pad copy goes onto a whole pad`,
    );
    expect(text).not.toContain("which only");
  });

  it("says where c+ does work when a read names one", async () => {
    expect(await say("ppal-read-device", { path: "t0/d0/c+" })).toContain(
      '"c+" appends a chain, so it only works as a destination: path in ' +
        "ppal-create-device, toPath in ppal-duplicate and ppal-update-device",
    );
  });
});

describe("a chain copy whose toPath is not a rack", () => {
  it("says what a destination rack looks like", async () => {
    expect(
      await say("ppal-duplicate", {
        type: "chain",
        path: "t0/d0/c0",
        toPath: `${KIT}/pC1`,
      }),
    ).toContain(
      `no destination rack at toPath "${KIT}/pC1"; name a rack, e.g. "t0/d0" or "t0/d0/c+"`,
    );
  });
});

describe("a path sent as an id", () => {
  it.each([
    ["ppal-read-device", { id: "t0/d0" }],
    ["ppal-read-track", { id: "t0" }],
    ["ppal-update-device", { id: "t0/d0", name: "X" }],
    ["ppal-select", { id: "t0/d0" }],
  ])("tells %s to use path", async (name, args) => {
    const text = await say(name, args);

    expect(text).toContain(`is a path, so send it as path, not id`);
    expect(text).toContain(`id "${args.id}" does not exist`);
  });
});
