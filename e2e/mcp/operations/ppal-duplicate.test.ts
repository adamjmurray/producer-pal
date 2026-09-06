// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-duplicate tool
 * Tests duplicating tracks, scenes, clips, and devices.
 * Uses: e2e-test-set (t8 is empty MIDI track, t7 is empty MIDI track for clip destinations)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/ppal-duplicate.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  parseAliasedToolResult,
  parseToolResult,
  parseToolResultWithWarnings,
  createTestDevice,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../e2e-test-set.ts";
import { arrangementStartOf } from "../clip/helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate", () => {
  it("duplicates a single track", async () => {
    const readTracksResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const liveSet = parseToolResult<ReadLiveSetResult>(readTracksResult);
    const initialTrackCount = liveSet.tracks.length;
    const firstTrackId = liveSet.tracks[0]!.id;

    // Source named by id, spelled the way a model carries the plural over from
    // the other write tools. "ids" is a permanent alias, so this checks the
    // copy and the steer.
    const dupTrackResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        ids: firstTrackId,
      },
    });
    const dupTrack = parseAliasedToolResult<DuplicateTrackResult>(
      dupTrackResult,
      "ids",
      "id",
    );

    expect(dupTrack.id).toBeDefined();
    expect(dupTrack.path).toBe("t1"); // Inserted after track 0

    await sleep(100);

    // Verify track count increased
    const afterDupResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const afterDup = parseToolResult<ReadLiveSetResult>(afterDupResult);

    expect(afterDup.tracks.length).toBe(initialTrackCount + 1);
  });

  it("duplicates tracks with count and options", async () => {
    // Setup: Get current tracks
    const readResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const liveSet = parseToolResult<ReadLiveSetResult>(readResult);
    const firstTrackId = liveSet.tracks[0]!.id;

    // Test 1: Track duplication with count and name
    const dupMultipleResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: firstTrackId,
        count: 2,
        name: "Batch Track",
      },
    });
    const dupMultiple =
      parseToolResult<DuplicateTrackResult[]>(dupMultipleResult);

    expect(dupMultiple).toHaveLength(2);
    expect(dupMultiple[0]!.path).toBe("t1");
    expect(dupMultiple[1]!.path).toBe("t2");

    await sleep(100);

    // Verify both tracks have the same name
    const readTrack1 = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: dupMultiple[0]!.id },
    });
    const readTrack2 = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: dupMultiple[1]!.id },
    });

    expect(parseToolResult<{ name: string }>(readTrack1).name).toBe(
      "Batch Track",
    );
    expect(parseToolResult<{ name: string }>(readTrack2).name).toBe(
      "Batch Track",
    );

    await sleep(100);

    // Test 2: Track duplication with name and withoutClips
    const readAgainResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const readAgain = parseToolResult<ReadLiveSetResult>(readAgainResult);

    const dupNamedResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: readAgain.tracks[0]!.id,
        name: "My Duplicated Track",
        withoutClips: true,
      },
    });
    const dupNamed = parseToolResult<DuplicateTrackResult>(dupNamedResult);

    expect(dupNamed.id).toBeDefined();
    expect(dupNamed.clips).toHaveLength(0);
  });

  it("duplicates scenes", async () => {
    // Test 1: Basic session scene duplication
    const readScenesResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const scenesSet = parseToolResult<ReadLiveSetResult>(readScenesResult);
    const initialSceneCount = scenesSet.scenes!.length;
    const firstSceneId = scenesSet.scenes![0]!.id;

    const dupSceneResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "scene",
        id: firstSceneId,
      },
    });
    const dupScene = parseToolResult<DuplicateSceneResult>(dupSceneResult);

    expect(dupScene.id).toBeDefined();
    expect(dupScene.path).toBe("s1");

    await sleep(100);

    // Verify scene count increased
    const afterSceneDupResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const afterSceneDup =
      parseToolResult<ReadLiveSetResult>(afterSceneDupResult);

    expect(afterSceneDup.scenes!.length).toBe(initialSceneCount + 1);

    // Test 2: Scene duplication with count and name
    const dupMultipleScenesResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "scene",
        id: afterSceneDup.scenes![0]!.id,
        count: 2,
        name: "Batch Scene",
      },
    });
    const dupMultipleScenes = parseToolResult<DuplicateSceneResult[]>(
      dupMultipleScenesResult,
    );

    expect(dupMultipleScenes).toHaveLength(2);

    await sleep(100);

    // Verify both scenes have the same name
    const readScene1 = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: dupMultipleScenes[0]!.id },
    });
    const readScene2 = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: dupMultipleScenes[1]!.id },
    });

    expect(parseToolResult<{ name: string }>(readScene1).name).toBe(
      "Batch Scene",
    );
    expect(parseToolResult<{ name: string }>(readScene2).name).toBe(
      "Batch Scene",
    );
  });

  // The name is written onto every clip the copy lands, so reporting it back
  // would echo an arg that took effect as intended. s6 starts empty, so the
  // clip created here is the whole scene.
  it.each([
    {
      desc: "at the source length",
      arrangementLength: undefined,
      name: "Arranged Scene",
    },
    // Longer than the source routes the name through ppal-update-clip instead
    // of a direct write, and can land more than one clip per source clip.
    { desc: "lengthened", arrangementLength: "2bar", name: "Stretched Scene" },
  ])(
    "reports a scene's arrangement copies $desc by id and path, not by name",
    async ({ arrangementLength, name }) => {
      const createClipResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `t${EMPTY_MIDI_TRACK}/s6`,
          notes: "C3 1|1",
          length: "1bar",
        },
      });

      expect(
        parseToolResult<{ id: string }>(createClipResult).id,
      ).toBeDefined();

      await sleep(100);

      const scenesResult = await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["scenes"] },
      });
      const scenes = parseToolResult<ReadLiveSetResult>(scenesResult);

      const dupResult = await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "scene",
          id: scenes.scenes![6]!.id,
          toPath: "[41|1]",
          name,
          ...(arrangementLength == null ? {} : { arrangementLength }),
        },
      });
      const dup = parseToolResult<{ clips: Array<Record<string, unknown>> }>(
        dupResult,
      );

      expect(dup.clips.length).toBeGreaterThan(0);
      expect(dup.clips[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}[41|1]`);

      for (const clip of dup.clips) {
        expect(Object.keys(clip).toSorted()).toStrictEqual(["id", "path"]);
      }

      await sleep(100);

      // The name did land — it reads back off the clip instead of being echoed.
      const readCopy = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: dup.clips[0]!.id as string },
      });

      expect(parseToolResult<ReadClipResult>(readCopy).name).toBe(name);
    },
  );

  it("duplicates clips", async () => {
    // Test 1: Session clip to session
    // First create a clip to duplicate on empty track
    const createClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0`,
        notes: "C3 D3 E3 F3 1|1",
        length: "1bar",
      },
    });
    const createdClip = parseToolResult<{ id: string }>(createClipResult);

    await sleep(100);

    const dupClipSessionResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,

        toPath: `t${RACKS_TRACK}/s0`,
      },
    });
    const dupClipSession =
      parseToolResult<DuplicateClipResult>(dupClipSessionResult);

    expect(dupClipSession.id).toBeDefined();
    expect(dupClipSession.path).toBe(`t${RACKS_TRACK}/s0`);

    await sleep(100);

    // Test 2: Session clip to multiple clip slots with name
    const dupClipMultiSlotsResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,

        toPath: "t10/s0, t10/s1, t10/s2",
        name: "Batch Clip",
      },
    });
    const dupClipMultiSlots = parseToolResult<DuplicateClipResult[]>(
      dupClipMultiSlotsResult,
    );

    expect(dupClipMultiSlots).toHaveLength(3);
    expect(dupClipMultiSlots[0]!.path).toBe("t10/s0");
    expect(dupClipMultiSlots[1]!.path).toBe("t10/s1");
    expect(dupClipMultiSlots[2]!.path).toBe("t10/s2");

    await sleep(100);

    // Verify all clips have the same name
    for (const dupClip of dupClipMultiSlots) {
      const readClip = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: dupClip.id },
      });

      expect(parseToolResult<{ name: string }>(readClip).name).toBe(
        "Batch Clip",
      );
    }

    await sleep(100);

    // Test 3: Arrangement clip duplication (use empty positions)
    const createArrangementClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}[41|1]`,
        notes: "C3 D3 E3 1|1",
        length: "2bar",
      },
    });
    const arrangementClip = parseToolResult<{ id: string }>(
      createArrangementClipResult,
    );

    await sleep(100);

    const dupArrangementResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: arrangementClip.id,

        toPath: "[5|1]",
      },
    });
    const dupArrangement =
      parseToolResult<DuplicateClipResult>(dupArrangementResult);

    expect(dupArrangement.id).toBeDefined();
    expect(arrangementStartOf(dupArrangement)).toBe("5|1");

    await sleep(100);

    // Test 4: Arrangement clip to multiple positions
    const dupArrangementMultiResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: arrangementClip.id,

        toPath: "[9|1],[13|1],[17|1]",
      },
    });
    const dupArrangementMulti = parseToolResult<DuplicateClipResult[]>(
      dupArrangementMultiResult,
    );

    expect(dupArrangementMulti).toHaveLength(3);
    expect(arrangementStartOf(dupArrangementMulti[0]!)).toBe("9|1");
    expect(arrangementStartOf(dupArrangementMulti[1]!)).toBe("13|1");
    expect(arrangementStartOf(dupArrangementMulti[2]!)).toBe("17|1");

    await sleep(100);

    // Test 5: Session clip to arrangement
    const dupSessionToArrangementResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,

        toPath: "[21|1]",
      },
    });
    const dupSessionToArrangement = parseToolResult<DuplicateClipResult>(
      dupSessionToArrangementResult,
    );

    expect(dupSessionToArrangement.id).toBeDefined();
    expect(arrangementStartOf(dupSessionToArrangement)).toBe("21|1");
  });

  it("places arrangement copies at locators", async () => {
    // Locators are named positions in the Set, so resolving a name or an id to
    // a real bar|beat is something only Live's own locator list can prove.
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: "t8/s0", notes: "C3 1|1", length: "1bar" },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    const byName = parseToolResult<DuplicateClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: clip.id,
          toPath: "[loc:Verse],[loc:Chorus]",
        },
      }),
    );

    expect(byName).toHaveLength(2);
    expect(arrangementStartOf(byName[0]!)).toBe("9|1");
    expect(arrangementStartOf(byName[1]!)).toBe("17|1");

    await sleep(100);

    const byId = parseToolResult<DuplicateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: clip.id,
          toPath: "[loc:locator-3]",
        },
      }),
    );

    expect(arrangementStartOf(byId)).toBe("33|1");
  });

  it("copies the whole clip whichever order the positions are listed", async () => {
    // The bar-58 copy lands on the source and trims it to one bar. The bar-51
    // copy stops well short of the source, so it must come out full length —
    // it used to be made from that leftover just for being listed second.
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}[57|1]`,
        notes: "C3 D3 E3 F3 1|1",
        length: "2bar",
      },
    });
    const source = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    const dupResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: source.id,
        toPath: "[58|1],[51|1]",
      },
    });
    const copies = parseToolResult<DuplicateClipResult[]>(dupResult);
    const early = copies.find((copy) => arrangementStartOf(copy) === "51|1");

    await sleep(100);

    const readEarly = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: early!.id, include: ["timing"] },
    });

    expect(parseToolResult<ReadClipResult>(readEarly).arrangementLength).toBe(
      "2bar",
    );
  });

  it("still honors the deprecated toSlot, and says so", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s6`,
        notes: "C3 1|1",
        length: "1bar",
      },
    });
    const createdClip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,
        toSlot: `${EMPTY_MIDI_TRACK}/7`,
      },
    });

    // The copy still lands where an old caller asked for it, and the result
    // reports it in the spelling that replaced the param...
    expect(
      parseToolResultWithWarnings<DuplicateClipResult>(result).data.path,
    ).toBe(`t${EMPTY_MIDI_TRACK}/s7`);

    // ...and the model is told to stop using the param.
    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining('param "toSlot" is deprecated'),
    );
  });

  it("duplicates devices", async () => {
    // Test 1: Duplicate device within same track
    // First create a device to duplicate
    const deviceId = await createTestDevice(
      ctx.client!,
      "Auto Filter",
      `t${RACKS_TRACK}`,
    );

    const dupDeviceResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "device",
        id: deviceId,
      },
    });
    const dupDevice = parseToolResult<DuplicateDeviceResult>(dupDeviceResult);

    expect(dupDevice.id).toBeDefined();

    await sleep(100);

    // Verify duplicated device exists by reading it
    const readDupDeviceResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: dupDevice.id },
    });
    const readDupDevice =
      parseToolResult<ReadDeviceResult>(readDupDeviceResult);

    expect(readDupDevice.type).toContain("Auto Filter");

    // Test 2: Duplicate device to different track
    const device2Id = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${RACKS_TRACK}`,
    );

    const dupDeviceToTrackResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "device",
        id: device2Id,
        toPath: "t10", // Child track has one device (Operator)
      },
    });
    const dupDeviceToTrack = parseToolResult<DuplicateDeviceResult>(
      dupDeviceToTrackResult,
    );

    expect(dupDeviceToTrack.id).toBeDefined();

    await sleep(100);

    // Verify duplicated device exists on target track
    const readDupDevice2Result = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: dupDeviceToTrack.id },
    });
    const readDupDevice2 =
      parseToolResult<ReadDeviceResult>(readDupDevice2Result);

    expect(readDupDevice2.type).toContain("Compressor");
  });

  // A malformed color is refused before the copy is planned, so nothing is
  // created and no clip is touched. This replaced a test that used a bad color
  // to force a partial re-create: that was the only known way in from outside,
  // and probing found no other (a deleted sample is refused earlier, a pickup
  // note and an all-digit name are both accepted, and a name long enough to
  // upset Live doesn't survive the MCP transport). The partial-re-create
  // reporting keeps its unit coverage.
  it("refuses a malformed color before copying anything", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s1`,
        notes: "C3 D3 E3 F3 1|1",
        length: "1bar",
      },
    });
    const createdClip = parseToolResult<{ id: string; path: string }>(
      createResult,
    );

    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,
        toPath: `t${EMPTY_MIDI_TRACK}/s2`,
        color: "not-a-hex-color",
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("invalid color");
    expect(getToolErrorMessage(result)).toContain("#RRGGBB");

    await sleep(100);

    // Nothing landed at the destination the refused copy named — reading it
    // back warns that the slot is empty, which is the point.
    const destination = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s2` },
    });

    expect(
      parseToolResultWithWarnings<ReadClipResult>(destination).data.id,
    ).toBeNull();
  });
});

// Type interfaces

interface ReadLiveSetResult {
  tracks: Array<{ id: string; name: string }>;
  scenes?: Array<{ id: string; name: string }>;
  sceneCount?: number;
}

interface DuplicateTrackResult {
  id: string;
  path: string;
  clips: Array<{ id: string }>;
}

interface DuplicateSceneResult {
  id: string;
  path?: string;
  clips: Array<{ id: string }>;
}

interface DuplicateClipResult {
  id: string;
  path?: string;
}

interface DuplicateDeviceResult {
  id: string;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
}
