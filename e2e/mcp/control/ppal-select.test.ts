/**
 * E2E tests for ppal-select tool
 * Tests view state reading, view switching, and selection controls.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-select", () => {
  it("reads and updates view state and selections", async () => {
    // Test 1: Read initial state (no args)
    const initialResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: {},
    });
    const initial = parseToolResult<ViewState>(initialResult);

    expect(initial.view).toBeDefined();
    expect(initial.selectedTrack).toBeDefined();
    expect(initial.selectedScene).toBeDefined();

    // Test 2: Switch to session view
    const sessionResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "session" },
    });
    const session = parseToolResult<ViewState>(sessionResult);

    expect(session.view).toBe("session");

    // Test 3: Switch to arrangement view
    const arrangementResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "arrangement" },
    });
    const arrangement = parseToolResult<ViewState>(arrangementResult);

    expect(arrangement.view).toBe("arrangement");

    // Test 4: Select regular track by index
    const regularTrackResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackIndex: 0, category: "regular" },
    });
    const regularTrack = parseToolResult<ViewState>(regularTrackResult);

    expect(regularTrack.selectedTrack.category).toBe("regular");
    expect(regularTrack.selectedTrack.trackIndex).toBe(0);
    expect(regularTrack.selectedTrack.trackId).toBeDefined();

    // Test 5: Select return track by index
    const returnTrackResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackIndex: 0, category: "return" },
    });
    const returnTrack = parseToolResult<ViewState>(returnTrackResult);

    expect(returnTrack.selectedTrack.category).toBe("return");
    expect(returnTrack.selectedTrack.returnTrackIndex).toBe(0);

    // Test 6: Select master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { category: "master" },
    });
    const master = parseToolResult<ViewState>(masterResult);

    expect(master.selectedTrack.category).toBe("master");

    // Test 7: Select scene by index
    const sceneResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { sceneIndex: 0 },
    });
    const scene = parseToolResult<ViewState>(sceneResult);

    expect(scene.selectedScene.sceneIndex).toBe(0);
    expect(scene.selectedScene.sceneId).toBeDefined();

    // Test 8: Create a clip and select it
    const createClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        notes: "C3 1|1",
        length: "1:0.0",
      },
    });
    const createdClip = parseToolResult<{ id: string }>(createClipResult);

    const selectClipResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { clipId: createdClip.id },
    });
    const withClip = parseToolResult<ViewState>(selectClipResult);

    expect(withClip.selectedClipId).toBe(createdClip.id);

    // Test 9: Deselect clip (note: Live may keep the last selected clip)
    const deselectClipResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { clipId: null },
    });
    const noClip = parseToolResult<ViewState>(deselectClipResult);

    // Deselection call succeeds - Live API may or may not clear the selection
    expect(noClip).toBeDefined();

    // Test 10: Create a device and select it
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    const selectDeviceResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { deviceId },
    });
    const withDevice = parseToolResult<ViewState>(selectDeviceResult);

    expect(withDevice.selectedDeviceId).toBe(deviceId);

    // Test 11: Show clip detail view
    const clipDetailResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { detailView: "clip" },
    });
    const clipDetail = parseToolResult<ViewState>(clipDetailResult);

    expect(clipDetail.detailView).toBe("clip");

    // Test 12: Show device detail view
    const deviceDetailResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { detailView: "device" },
    });
    const deviceDetail = parseToolResult<ViewState>(deviceDetailResult);

    expect(deviceDetail.detailView).toBe("device");

    // Test 13: Hide detail view
    const hideDetailResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { detailView: "none" },
    });
    const hiddenDetail = parseToolResult<ViewState>(hideDetailResult);

    expect(hiddenDetail.detailView).toBeNull();

    // Test 14: Show browser
    const showBrowserResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { showBrowser: true },
    });
    const browserShown = parseToolResult<ViewState>(showBrowserResult);

    expect(browserShown.showBrowser).toBe(true);

    // Test 15: Hide browser
    const hideBrowserResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { showBrowser: false },
    });
    const browserHidden = parseToolResult<ViewState>(hideBrowserResult);

    expect(browserHidden.showBrowser).toBe(false);
  });
});

interface ViewState {
  view: string;
  detailView: "clip" | "device" | null;
  showBrowser: boolean;
  selectedTrack: {
    trackId: string | null;
    category: "regular" | "return" | "master" | null;
    trackIndex?: number | null;
    returnTrackIndex?: number | null;
  };
  selectedClipId: string | null;
  selectedDeviceId: string | null;
  selectedScene: {
    sceneId: string | null;
    sceneIndex: number | null;
  };
  selectedClipSlot: { trackIndex: number; sceneIndex: number } | null;
}
