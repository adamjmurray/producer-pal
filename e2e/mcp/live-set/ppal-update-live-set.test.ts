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
  getToolErrorMessage,
  isToolError,
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

    // Live kept the tempo asked for, so the write says nothing about it — the
    // read below is what proves it landed.
    expect(tempoResult.tempo).toBeUndefined();

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

    expect(timeSigResult.timeSignature).toBeUndefined();

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

  it("reads back a noisy tempo rounded to Live's 2dp display precision", async () => {
    const { originalTempo } = await readLiveSetOriginals();

    // Live stores tempo as a 32-bit float, so a value like 123.456789 comes
    // back with float32 noise (e.g. 123.456787109375) unless the read rounds
    // it to what Live's UI shows.
    const written = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: { tempo: 123.456789 },
      }),
    );

    // 123.46 either way, which is the resolution the read publishes — the same
    // value, so the write reports none.
    expect(written.tempo).toBeUndefined();

    await sleep(100);
    const afterRead = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterParsed = parseToolResult<ReadResult>(afterRead);

    expect(afterParsed.tempo).toBe(123.46);

    // Restore original tempo
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: originalTempo },
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

    // Live stored the scale as asked, so only the pitches come back, in the
    // same comma-joined shape ppal-read-live-set uses.
    expect(scaleResult.scale).toBeUndefined();
    expect(scaleResult.scalePitches).toBe("D,E,F,G,A,Bb,C");

    // Test 2: Disable scale (empty string)
    const disableScale = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "" },
    });
    const disableResult = parseToolResult<UpdateResult>(disableScale);

    expect(disableResult.scale).toBeUndefined();
    expect(disableResult.$meta).toContain(
      "Scale disabled for selected clips and defaults for new clips.",
    );

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

    // All three landed as asked, so none of them come back.
    expect(multiResult.tempo).toBeUndefined();
    expect(multiResult.timeSignature).toBeUndefined();
    expect(multiResult.scale).toBeUndefined();

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
    // Without this reason a model reads the changed spelling as a failed write.
    expect(updated.reason).toBe(
      "scale roots are spelled with flats, so F# comes back as Gb — " +
        "same scale, set correctly",
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

  // The scale covers the whole call, so one we can't read used to leave a
  // warning on a result that otherwise read as a success.
  it("refuses a scale it can't read, and writes nothing else in the call", async () => {
    const { originalTempo } = await readLiveSetOriginals();
    const refused = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: originalTempo + 7, scale: "C Nonesuch" },
    });

    expect(isToolError(refused)).toBe(true);

    const message = getToolErrorMessage(refused);

    expect(message).toContain("Invalid scale name 'Nonesuch'");
    expect(message).toContain("Valid scales: Major");
    expect(message).toContain("Do not substitute a different scale");

    await sleep(100);
    const after = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });

    expect(parseToolResult<ReadResult>(after).tempo).toBe(originalTempo);
  });

  it("creates, renames, and deletes locators", async () => {
    // A locator id is Live's own and only assignment against real Live proves
    // it round-trips, so this runs the full create/rename/delete cycle. The Set
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

    expect(createResult.locator?.operation).toBe("create");
    expect(createResult.locator?.id).toBeDefined();

    await sleep(100);
    let locators = await readLocatorList();
    const alpha = locators.find((l) => l.name === "E2E Alpha");

    expect(alpha).toBeDefined();
    expect(alpha!.time).toBe("2|1");
    // The id the create reported is the one the read hands back.
    expect(alpha!.id).toBe(createResult.locator?.id);

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

    expect(renameResult.locator?.operation).toBe("rename");
    expect(renameResult.locator?.id).toBe(alpha!.id);

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

    expect(deleteByName.locator?.operation).toBe("delete");
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

    expect(deleteByTime.locator?.operation).toBe("delete");

    await sleep(100);
    locators = await readLocatorList();

    expect(locators.length).toBe(initialLocators.length);
  });

  it("creates, renames, and deletes several locators per call", async () => {
    // Marking up a song structure is one call per section otherwise. The Set
    // ships with locators at 1|1, 9|1, 17|1 and 33|1, so these three sit in the
    // gap between the first two and are deleted again at the end.
    const initialLocators = await readLocatorList();

    const created = parseToolResult<UpdateLocatorListResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "create",
          locatorTime: "5|1,6|1,7|1",
          locatorName: "E2E List A,E2E List B,E2E List C",
        },
      }),
    );

    expect(created.locator?.map((entry) => entry.operation)).toStrictEqual([
      "create",
      "create",
      "create",
    ]);
    // Every entry names the locator it made, and no two share an id.
    const createdIds = created.locator?.map((entry) => entry.id);

    expect(createdIds?.filter(Boolean)).toHaveLength(3);
    expect(new Set(createdIds).size).toBe(3);

    await sleep(100);
    let locators = await readLocatorList();

    expect(
      locators
        .filter((l) => l.name.startsWith("E2E List "))
        .map((l) => [l.name, l.time]),
    ).toStrictEqual([
      ["E2E List A", "5|1"],
      ["E2E List B", "6|1"],
      ["E2E List C", "7|1"],
    ]);

    // Rename two of them by time, in one call
    const renamed = parseToolResult<UpdateLocatorListResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "rename",
          locatorTime: "5|1,7|1",
          locatorName: "E2E List X,E2E List Z",
        },
      }),
    );

    expect(renamed.locator?.map((entry) => entry.operation)).toStrictEqual([
      "rename",
      "rename",
    ]);

    await sleep(100);
    locators = await readLocatorList();

    expect(
      locators.filter((l) => l.name.startsWith("E2E List ")).map((l) => l.name),
    ).toStrictEqual(["E2E List X", "E2E List B", "E2E List Z"]);

    // Delete all three in one call, leaving the Set as it was found
    const deleted = parseToolResult<UpdateLocatorListResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "delete",
          locatorTime: "5|1,6|1,7|1",
        },
      }),
    );

    expect(deleted.locator?.map((entry) => entry.operation)).toStrictEqual([
      "delete",
      "delete",
      "delete",
    ]);

    await sleep(100);
    locators = await readLocatorList();

    expect(locators).toStrictEqual(initialLocators);
  });

  it("deletes by id, time and name in one call, each locator once", async () => {
    // Only real Live proves a locator named twice isn't toggled twice: a
    // second toggle at its time would create a new one there.
    const initialLocators = await readLocatorList();

    const created = parseToolResult<UpdateLocatorListResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "create",
          locatorTime: "5|1,6|1,7|1",
          locatorName: "E2E Comma,E2E Solo,E2E Tail",
        },
      }),
    );
    const soloId = created.locator?.[1]?.id;

    expect(soloId).toBeDefined();

    // A lone target takes the comma literally, so this names one locator.
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "rename",
        locatorTime: "5|1",
        locatorName: "E2E Comma, Two",
      },
    });

    await sleep(100);

    const deleted = parseToolResult<UpdateLocatorListResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: {
          locatorOperation: "delete",
          locatorId: soloId,
          locatorTime: "6|1,7|1",
          locatorName: "E2E Comma, Two",
        },
      }),
    );

    expect(deleted.locator).toStrictEqual([
      { operation: "delete", id: soloId },
      {
        operation: "delete",
        id: soloId,
        reason: `already named as id ${soloId} earlier in this call`,
      },
      { operation: "delete", id: expect.any(String) },
      { operation: "delete", count: 1, name: "E2E Comma, Two" },
    ]);

    await sleep(100);

    expect(await readLocatorList()).toStrictEqual(initialLocators);
  });

  it("refuses locator lists that name different numbers of locators", async () => {
    // Nothing is written: the lists are split before the first locator runs.
    const before = await readLocatorList();

    const result = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "create",
        locatorTime: "5|1,6|1,7|1",
        locatorName: "E2E List A,E2E List B",
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "locatorTime names 3 locators but locatorName names 2 locators",
    );

    expect(await readLocatorList()).toStrictEqual(before);
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

    expect(created.locator?.operation).toBe("create");

    await sleep(100);

    // Read back the name: the read path has to report it like every other name.
    const locators = await readLocatorList();
    const found = locators.find((l) => l.name === "4321");

    expect(found).toBeDefined();

    // Delete by that same name — proves the match casts it too, not just read.
    const deleted = parseToolResult<UpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: { locatorOperation: "delete", locatorName: "4321" },
      }),
    );

    expect(deleted.locator?.operation).toBe("delete");
  });

  it("refuses locator args sent with no locatorOperation", async () => {
    // These used to be dropped in silence: the call returned a bare id and
    // created nothing, so a model that knew the locator params but not the
    // operation param had no way to tell.
    const before = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const locatorsBefore = parseToolResult<ReadResult>(before).locators ?? [];

    const result = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { locatorTime: "45|1", locatorName: "Chorus" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "locatorTime, locatorName require locatorOperation",
    );

    const after = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });

    expect(parseToolResult<ReadResult>(after).locators ?? []).toStrictEqual(
      locatorsBefore,
    );
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

/** A call naming several locators answers with one entry each, in order. */
interface UpdateLocatorListResult {
  locator?: Array<{
    operation: string;
    id?: string;
    name?: string;
    time?: string;
    ok?: boolean;
    reason?: string;
  }>;
}

interface UpdateResult {
  id: string;
  tempo?: number;
  timeSignature?: string;
  scale?: string;
  scalePitches?: string;
  reason?: string;
  $meta?: string[];
  locator?: {
    operation: string;
    id?: string;
    name?: string;
    time?: string;
    count?: number;
  };
}
