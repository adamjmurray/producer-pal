/**
 * E2E tests for ppal-delete tool
 * Deletes tracks, scenes, clips, devices, and drum pads in the Live Set.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  extractToolResultText,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-delete", () => {
  it("deletes tracks, scenes, clips, devices, and drum pads", async () => {
    // Test 1: Delete single track by ID
    const createTrack = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Track to Delete" },
    });
    const track = parseToolResult<CreateTrackResult>(createTrack);

    await sleep(100);

    const deleteTrack = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: track.id, type: "track" },
    });
    const deletedTrack = parseToolResult<DeleteResult>(deleteTrack);

    expect(String(deletedTrack.id)).toBe(String(track.id));
    expect(deletedTrack.type).toBe("track");
    expect(deletedTrack.deleted).toBe(true);

    // Verify track no longer exists
    const verifyTrack = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: track.id },
    });
    const verifyTrackText = extractToolResultText(verifyTrack);

    expect(verifyTrackText.toLowerCase()).toMatch(/error|not found|invalid/);

    // Test 2: Delete multiple tracks
    const createTrack1 = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Multi Delete 1" },
    });
    const track1 = parseToolResult<CreateTrackResult>(createTrack1);

    const createTrack2 = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Multi Delete 2" },
    });
    const track2 = parseToolResult<CreateTrackResult>(createTrack2);

    await sleep(100);

    const deleteMultipleTracks = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: `${track1.id},${track2.id}`, type: "track" },
    });
    const deletedMultiple =
      parseToolResult<DeleteResult[]>(deleteMultipleTracks);

    expect(deletedMultiple).toHaveLength(2);
    expect(deletedMultiple[0]!.deleted).toBe(true);
    expect(deletedMultiple[1]!.deleted).toBe(true);

    // Test 3: Delete return track
    const createReturn = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "return", name: "Return to Delete" },
    });
    const returnTrack = parseToolResult<CreateTrackResult>(createReturn);

    await sleep(100);

    const deleteReturn = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: returnTrack.id, type: "track" },
    });
    const deletedReturn = parseToolResult<DeleteResult>(deleteReturn);

    expect(deletedReturn.deleted).toBe(true);

    // Test 4: Error when trying to delete Producer Pal host track
    // Track index 4 hosts the Producer Pal device in basic-midi-4-track
    const readHostTrack = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 4 },
    });
    const hostTrack = parseToolResult<{ id: string }>(readHostTrack);

    const deleteHost = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: hostTrack.id, type: "track" },
    });
    const deleteHostText = extractToolResultText(deleteHost);

    expect(deleteHostText.toLowerCase()).toContain("producer pal");

    // Test 5: Delete single scene by ID
    const createScene = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 0, name: "Scene to Delete" },
    });
    const scene = parseToolResult<CreateSceneResult>(createScene);

    await sleep(100);

    const deleteScene = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: scene.id, type: "scene" },
    });
    const deletedScene = parseToolResult<DeleteResult>(deleteScene);

    expect(String(deletedScene.id)).toBe(String(scene.id));
    expect(deletedScene.type).toBe("scene");
    expect(deletedScene.deleted).toBe(true);

    // Test 6: Delete multiple scenes
    const createScene1 = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 0, name: "Multi Scene 1" },
    });
    const scene1 = parseToolResult<CreateSceneResult>(createScene1);

    const createScene2 = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 1, name: "Multi Scene 2" },
    });
    const scene2 = parseToolResult<CreateSceneResult>(createScene2);

    await sleep(100);

    const deleteMultipleScenes = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: `${scene1.id},${scene2.id}`, type: "scene" },
    });
    const deletedScenes = parseToolResult<DeleteResult[]>(deleteMultipleScenes);

    expect(deletedScenes).toHaveLength(2);
    expect(deletedScenes[0]!.deleted).toBe(true);
    expect(deletedScenes[1]!.deleted).toBe(true);

    // Test 7: Delete single clip by ID
    const createClip = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { view: "session", trackIndex: 0, sceneIndex: "0" },
    });
    const clip = parseToolResult<CreateClipResult>(createClip);

    await sleep(100);

    const deleteClip = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: clip.id, type: "clip" },
    });
    const deletedClip = parseToolResult<DeleteResult>(deleteClip);

    expect(String(deletedClip.id)).toBe(String(clip.id));
    expect(deletedClip.type).toBe("clip");
    expect(deletedClip.deleted).toBe(true);

    // Verify clip no longer exists
    const verifyClip = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id },
    });
    const verifyClipText = extractToolResultText(verifyClip);

    expect(verifyClipText.toLowerCase()).toMatch(/error|not found|invalid/);

    // Test 8: Delete multiple clips
    const createClip1 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { view: "session", trackIndex: 0, sceneIndex: "1" },
    });
    const clip1 = parseToolResult<CreateClipResult>(createClip1);

    const createClip2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { view: "session", trackIndex: 1, sceneIndex: "1" },
    });
    const clip2 = parseToolResult<CreateClipResult>(createClip2);

    await sleep(100);

    const deleteMultipleClips = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: `${clip1.id},${clip2.id}`, type: "clip" },
    });
    const deletedClips = parseToolResult<DeleteResult[]>(deleteMultipleClips);

    expect(deletedClips).toHaveLength(2);
    expect(deletedClips[0]!.deleted).toBe(true);
    expect(deletedClips[1]!.deleted).toBe(true);

    // Test 9: Delete device by ID
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    const deleteDevice = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: deviceId, type: "device" },
    });
    const deletedDevice = parseToolResult<DeleteResult>(deleteDevice);

    expect(deletedDevice.deleted).toBe(true);
    expect(deletedDevice.type).toBe("device");

    // Verify device no longer exists
    const verifyDevice = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId },
    });
    const verifyDeviceText = extractToolResultText(verifyDevice);

    expect(verifyDeviceText.toLowerCase()).toMatch(/error|not found|invalid/);

    // Test 10: Delete device by path
    // Create device on track 1, then delete it by path
    const pathDeviceResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "EQ Eight", path: "t1" },
    });
    const pathDevice = parseToolResult<{ deviceIndex: number }>(
      pathDeviceResult,
    );

    await sleep(100);

    const deleteByPath = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { path: `t1/d${pathDevice.deviceIndex}`, type: "device" },
    });
    const deletedByPath = parseToolResult<DeleteResult>(deleteByPath);

    expect(deletedByPath.deleted).toBe(true);

    // Test 11: Delete multiple devices
    const device1Id = await createTestDevice(ctx.client!, "Auto Filter", "t2");
    const device2Id = await createTestDevice(
      ctx.client!,
      "Chorus-Ensemble",
      "t3",
    );

    const deleteMultipleDevices = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { ids: `${device1Id},${device2Id}`, type: "device" },
    });
    const deletedDevices = parseToolResult<DeleteResult[]>(
      deleteMultipleDevices,
    );

    expect(deletedDevices).toHaveLength(2);
    expect(deletedDevices[0]!.deleted).toBe(true);
    expect(deletedDevices[1]!.deleted).toBe(true);

    // Test 12: Delete drum pad by path
    // The drum rack is nested inside an instrument rack on track 0:
    // t0/d0 (instrument-rack) -> c0 (chain) -> d0 (drum-rack) -> pC1 (drum pad)
    const deleteDrumPad = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: { path: "t0/d0/c0/d0/pC1", type: "drum-pad" },
    });
    const deletedDrumPad = parseToolResult<DeleteResult>(deleteDrumPad);

    expect(deletedDrumPad.deleted).toBe(true);
    expect(deletedDrumPad.type).toBe("drum-pad");
  });
});

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

interface CreateTrackResult {
  id: string;
  trackIndex?: number;
  returnTrackIndex?: number;
}

interface CreateSceneResult {
  id: string;
  sceneIndex: number;
}

interface CreateClipResult {
  id: string;
}
