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
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate", () => {
  it("duplicates tracks", async () => {
    // Test 1: Basic track duplication
    const readTracksResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const liveSet = parseToolResult<ReadLiveSetResult>(readTracksResult);
    const initialTrackCount = liveSet.tracks.length;
    const firstTrackId = liveSet.tracks[0]!.id;

    const dupTrackResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: firstTrackId,
      },
    });
    const dupTrack = parseToolResult<DuplicateTrackResult>(dupTrackResult);

    expect(dupTrack.id).toBeDefined();
    expect(dupTrack.trackIndex).toBe(1); // Inserted after track 0

    await sleep(100);

    // Verify track count increased
    const afterDupResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterDup = parseToolResult<ReadLiveSetResult>(afterDupResult);

    expect(afterDup.tracks.length).toBe(initialTrackCount + 1);

    // Test 2: Track duplication with count
    const dupMultipleResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: afterDup.tracks[0]!.id,
        count: 2,
      },
    });
    const dupMultiple =
      parseToolResult<DuplicateTrackResult[]>(dupMultipleResult);

    expect(dupMultiple).toHaveLength(2);
    expect(dupMultiple[0]!.trackIndex).toBe(1);
    expect(dupMultiple[1]!.trackIndex).toBe(2);

    await sleep(100);

    // Test 3: Track duplication with name and withoutClips
    const readAgainResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
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
    expect(dupScene.sceneIndex).toBe(1);

    await sleep(100);

    // Verify scene count increased
    const afterSceneDupResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const afterSceneDup =
      parseToolResult<ReadLiveSetResult>(afterSceneDupResult);

    expect(afterSceneDup.scenes!.length).toBe(initialSceneCount + 1);

    // Test 2: Scene duplication with count
    const dupMultipleScenesResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "scene",
        id: afterSceneDup.scenes![0]!.id,
        count: 2,
      },
    });
    const dupMultipleScenes = parseToolResult<DuplicateSceneResult[]>(
      dupMultipleScenesResult,
    );

    expect(dupMultipleScenes).toHaveLength(2);
  });

  it("duplicates clips", async () => {
    // Use empty tracks for clip tests
    const emptyMidiTrack = 8;
    const emptyMidiTrack2 = 7;

    // Test 1: Session clip to session
    // First create a clip to duplicate on empty track
    const createClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "0",
        notes: "C3 D3 E3 F3 1|1",
        length: "1:0.0",
      },
    });
    const createdClip = parseToolResult<{ id: string }>(createClipResult);

    await sleep(100);

    const dupClipSessionResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,
        destination: "session",
        toTrackIndex: emptyMidiTrack2,
        toSceneIndex: "0",
      },
    });
    const dupClipSession =
      parseToolResult<DuplicateClipResult>(dupClipSessionResult);

    expect(dupClipSession.id).toBeDefined();
    expect(dupClipSession.trackIndex).toBe(emptyMidiTrack2);
    expect(dupClipSession.sceneIndex).toBe(0);

    await sleep(100);

    // Test 2: Session clip to multiple session slots (use empty track)
    const dupClipMultiSlotsResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,
        destination: "session",
        toTrackIndex: 10, // t10 Child track has no clips
        toSceneIndex: "0,1,2",
      },
    });
    const dupClipMultiSlots = parseToolResult<DuplicateClipResult[]>(
      dupClipMultiSlotsResult,
    );

    expect(dupClipMultiSlots).toHaveLength(3);
    expect(dupClipMultiSlots[0]!.sceneIndex).toBe(0);
    expect(dupClipMultiSlots[1]!.sceneIndex).toBe(1);
    expect(dupClipMultiSlots[2]!.sceneIndex).toBe(2);

    await sleep(100);

    // Test 3: Arrangement clip duplication (use empty positions)
    const createArrangementClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: emptyMidiTrack,
        arrangementStart: "41|1",
        notes: "C3 D3 E3 1|1",
        length: "2:0.0",
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
        destination: "arrangement",
        arrangementStart: "5|1",
      },
    });
    const dupArrangement =
      parseToolResult<DuplicateClipResult>(dupArrangementResult);

    expect(dupArrangement.id).toBeDefined();
    expect(dupArrangement.arrangementStart).toBe("5|1");

    await sleep(100);

    // Test 4: Arrangement clip to multiple positions
    const dupArrangementMultiResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: arrangementClip.id,
        destination: "arrangement",
        arrangementStart: "9|1,13|1,17|1",
      },
    });
    const dupArrangementMulti = parseToolResult<DuplicateClipResult[]>(
      dupArrangementMultiResult,
    );

    expect(dupArrangementMulti).toHaveLength(3);
    expect(dupArrangementMulti[0]!.arrangementStart).toBe("9|1");
    expect(dupArrangementMulti[1]!.arrangementStart).toBe("13|1");
    expect(dupArrangementMulti[2]!.arrangementStart).toBe("17|1");

    await sleep(100);

    // Test 5: Session clip to arrangement
    const dupSessionToArrangementResult = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: createdClip.id,
        destination: "arrangement",
        arrangementStart: "21|1",
      },
    });
    const dupSessionToArrangement = parseToolResult<DuplicateClipResult>(
      dupSessionToArrangementResult,
    );

    expect(dupSessionToArrangement.id).toBeDefined();
    expect(dupSessionToArrangement.arrangementStart).toBe("21|1");
  });

  it("duplicates devices", async () => {
    // Use t7 (Racks track) which has an Instrument Rack but proper routing
    const testTrack = 7;

    // Test 1: Duplicate device within same track
    // First create a device to duplicate
    const deviceId = await createTestDevice(
      ctx.client!,
      "Auto Filter",
      `t${testTrack}`,
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
      arguments: { deviceId: dupDevice.id },
    });
    const readDupDevice =
      parseToolResult<ReadDeviceResult>(readDupDeviceResult);

    expect(readDupDevice.type).toContain("Auto Filter");

    // Test 2: Duplicate device to different track
    const device2Id = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${testTrack}`,
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
      arguments: { deviceId: dupDeviceToTrack.id },
    });
    const readDupDevice2 =
      parseToolResult<ReadDeviceResult>(readDupDevice2Result);

    expect(readDupDevice2.type).toContain("Compressor");
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
  trackIndex: number;
  clips: Array<{ id: string }>;
}

interface DuplicateSceneResult {
  id: string;
  sceneIndex?: number;
  arrangementStart?: string;
  clips: Array<{ id: string }>;
}

interface DuplicateClipResult {
  id: string;
  trackIndex?: number;
  sceneIndex?: number;
  arrangementStart?: string;
  name?: string;
}

interface DuplicateDeviceResult {
  id: string;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
}
