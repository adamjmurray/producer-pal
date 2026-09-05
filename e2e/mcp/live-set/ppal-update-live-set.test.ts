// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-live-set tool
 * Automatically opens the e2e-test-set Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

/** Read the live set and return its original tempo + time signature. */
async function readLiveSetOriginals(): Promise<{
  originalTempo: number;
  originalTimeSig: string;
}> {
  const initialRead = await ctx.client!.callTool({
    name: "ppal-read-live-set",
    arguments: {},
  });
  const initial = parseToolResult<ReadResult>(initialRead);

  return {
    originalTempo: initial.tempo,
    originalTimeSig: initial.timeSignature,
  };
}

describe("ppal-update-live-set", () => {
  it("updates tempo and time signature", async () => {
    // Store original values to restore later
    const { originalTempo, originalTimeSig } = await readLiveSetOriginals();

    // Test 1: Update tempo
    const newTempo = originalTempo === 120 ? 130 : 120;
    const tempoUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: newTempo },
    });
    const tempoResult = parseToolResult<UpdateResult>(tempoUpdate);

    expect(tempoResult.tempo).toBe(newTempo);

    // Verify with read
    const afterTempo = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTempoRead = parseToolResult<ReadResult>(afterTempo);

    expect(afterTempoRead.tempo).toBe(newTempo);

    // Restore original tempo
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: originalTempo },
    });

    // Test 2: Update time signature
    const newTimeSig = originalTimeSig === "4/4" ? "3/4" : "4/4";
    const timeSigUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { timeSignature: newTimeSig },
    });
    const timeSigResult = parseToolResult<UpdateResult>(timeSigUpdate);

    expect(timeSigResult.timeSignature).toBe(newTimeSig);

    // Wait for Live API state to settle, then verify with read
    await sleep(100);
    const afterTimeSig = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTimeSigRead = parseToolResult<ReadResult>(afterTimeSig);

    expect(afterTimeSigRead.timeSignature).toBe(newTimeSig);

    // Restore original time signature
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { timeSignature: originalTimeSig },
    });
  });

  it("updates scale and multiple parameters", async () => {
    // Store original values to restore later
    const { originalTempo, originalTimeSig } = await readLiveSetOriginals();

    // Test 1: Set scale
    const scaleUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "D Minor" },
    });
    const scaleResult = parseToolResult<UpdateResult>(scaleUpdate);

    expect(scaleResult.scale).toBe("D Minor");
    expect(scaleResult.scalePitches).toBeDefined();
    expect(Array.isArray(scaleResult.scalePitches)).toBe(true);

    // Test 2: Disable scale (empty string)
    const disableScale = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "" },
    });
    const disableResult = parseToolResult<UpdateResult>(disableScale);

    expect(disableResult.scale).toBe(""); // Empty string means scale disabled

    // Test 3: Update multiple parameters at once
    const multiUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        tempo: 140,
        timeSignature: "6/8",
        scale: "G Major",
      },
    });
    const multiResult = parseToolResult<UpdateResult>(multiUpdate);

    expect(multiResult.tempo).toBe(140);
    expect(multiResult.timeSignature).toBe("6/8");
    expect(multiResult.scale).toBe("G Major");

    // Wait for Live API state to settle, then verify all with read
    await sleep(100);
    const afterMulti = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterMultiRead = parseToolResult<ReadResult>(afterMulti);

    expect(afterMultiRead.tempo).toBe(140);
    expect(afterMultiRead.timeSignature).toBe("6/8");
    expect(afterMultiRead.scale).toBe("G Major");

    // Restore original values
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        tempo: originalTempo,
        timeSignature: originalTimeSig,
        scale: "",
      },
    });
  });

  it("reports a sharp scale root by the flat name Live stores", async () => {
    // Live keeps only a pitch class number, so it has no sharp spelling to give
    // back. The write result has to say what every later read will say.
    const update = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "F# Dorian" },
    });

    const updated = parseToolResult<UpdateResult>(update);

    expect(updated.scale).toBe("Gb Dorian");
    // Without this note a model reads the changed spelling as a failed write.
    expect(updated.$meta).toContain(
      "Scale roots are spelled with flats, so F# comes back as Gb — " +
        "same scale, set correctly.",
    );

    await sleep(100);
    const after = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });

    expect(parseToolResult<ReadResult>(after).scale).toBe("Gb Dorian");

    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "" },
    });
  });

  it("creates, renames, and deletes locators", async () => {
    // Locator IDs are positional and assignment only sticks against real Live,
    // so this exercises the full create/rename/delete cycle end-to-end. The set
    // ships with locators (Intro/Verse/Chorus/Bridge), so use unique names and
    // unoccupied positions to avoid collisions.
    const initialLocators = await readLocatorList();

    // Create a locator at bar 2 with a name
    const createResult = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "create",
          locatorTime: "2|1",
          locatorName: "E2E Alpha",
        },
      }),
    );

    expect(createResult.locator?.operation).toBe("created");
    expect(createResult.locator?.id).toBeDefined();
    expect(createResult.locator?.name).toBe("E2E Alpha");

    await sleep(100);
    let locators = await readLocatorList();
    const alpha = locators.find((l) => l.name === "E2E Alpha");

    expect(alpha).toBeDefined();
    expect(alpha!.time).toBe("2|1");

    // Rename it by ID
    const renameResult = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "rename",
          locatorId: alpha!.id,
          locatorName: "E2E Beta",
        },
      }),
    );

    expect(renameResult.locator?.operation).toBe("renamed");
    expect(renameResult.locator?.name).toBe("E2E Beta");

    await sleep(100);
    locators = await readLocatorList();

    expect(locators.find((l) => l.name === "E2E Beta")).toBeDefined();
    expect(locators.find((l) => l.name === "E2E Alpha")).toBeUndefined();

    // Add a second locator, then delete the first by name match
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "create",
        locatorTime: "3|1",
        locatorName: "E2E Gamma",
      },
    });
    await sleep(100);

    const deleteByName = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "delete",
          locatorName: "E2E Beta",
        },
      }),
    );

    expect(deleteByName.locator?.operation).toBe("deleted");
    expect(deleteByName.locator?.count).toBe(1);

    await sleep(100);
    locators = await readLocatorList();

    expect(locators.find((l) => l.name === "E2E Beta")).toBeUndefined();
    expect(locators.find((l) => l.name === "E2E Gamma")).toBeDefined();

    // Delete the remaining locator by time, restoring the original count
    const deleteByTime = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "delete",
          locatorTime: "3|1",
        },
      }),
    );

    expect(deleteByTime.locator?.operation).toBe("deleted");

    await sleep(100);
    locators = await readLocatorList();

    expect(locators.length).toBe(initialLocators.length);
  });

  it("takes a numeric locator name", async () => {
    // Models send numbers where the schema says string, and the MCP SDK
    // validates before our handler runs, so only a real call proves the
    // coercion is in the schema the server registered.
    const created = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "create",
          locatorTime: "4|1",
          locatorName: 4321,
        },
      }),
    );

    expect(created.locator?.name).toBe("4321");

    await sleep(100);

    // Deleted by time, not by name: Live hands an all-digit name back as a
    // number, so no name match can find this locator again.
    const deleted = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: { locatorOperation: "delete", locatorTime: "4|1" },
      }),
    );

    expect(deleted.locator?.operation).toBe("deleted");
  });
});

async function readLocatorList(): Promise<LocatorInfo[]> {
  const read = await ctx.client!.callTool({
    name: "ppal-read-live-set",
    arguments: { include: ["locators"] },
  });

  return parseToolResult<ReadResult>(read).locators ?? [];
}

interface LocatorInfo {
  id: string;
  name: string;
  time: string;
}

interface ReadResult {
  id: string;
  tempo: number;
  timeSignature: string;
  sceneCount?: number;
  scale?: string;
  scalePitches?: string;
  locators?: LocatorInfo[];
}

interface UpdateResult {
  id: string;
  tempo?: number;
  timeSignature?: string;
  scale?: string;
  scalePitches?: string[];
  $meta?: string[];
  locator?: {
    operation: string;
    id?: string;
    name?: string;
    time?: string;
    count?: number;
  };
}
