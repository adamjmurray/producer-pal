// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-select tool
 * Tests view state reading, view switching, selection controls,
 * ID auto-detection, clipSlot, and devicePath.
 *
 * Run with: npm run e2e:mcp -- ppal-select
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
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
    expect(initial.detectedType).toBeUndefined();

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

    expect(regularTrack.selectedTrack.type).toBe("midi");
    expect(regularTrack.selectedTrack.trackIndex).toBe(0);
    expect(regularTrack.selectedTrack.trackId).toBeDefined();

    // Test 5: Select return track by index
    const returnTrackResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackIndex: 0, category: "return" },
    });
    const returnTrack = parseToolResult<ViewState>(returnTrackResult);

    expect(returnTrack.selectedTrack.type).toBe("return");
    expect(returnTrack.selectedTrack.returnTrackIndex).toBe(0);

    // Test 6: Select master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { category: "master" },
    });
    const master = parseToolResult<ViewState>(masterResult);

    expect(master.selectedTrack.type).toBe("master");

    // Test 7: Select scene by index
    const sceneResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { sceneIndex: 0 },
    });
    const scene = parseToolResult<ViewState>(sceneResult);

    expect(scene.selectedScene.sceneIndex).toBe(0);
    expect(scene.selectedScene.sceneId).toBeDefined();

    // Test 8: Select track by ID (auto-detection)
    const trackId = regularTrack.selectedTrack.trackId!;
    const selectByIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: trackId },
    });
    const byId = parseToolResult<ViewState>(selectByIdResult);

    expect(byId.selectedTrack.trackId).toBe(trackId);
    expect(byId.detectedType).toBe("track");

    // Test 9: Create a clip and select it by ID
    // Use empty track t8 (9-MIDI) to avoid conflicts with pre-populated clips
    const emptyMidiTrack = 8;

    const createClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: emptyMidiTrack,
        sceneIndex: "0",
        notes: "C3 1|1",
        length: "1:0.0",
      },
    });
    const createdClip = parseToolResult<{ id: string }>(createClipResult);

    const selectClipResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: createdClip.id },
    });
    const withClip = parseToolResult<ViewState>(selectClipResult);

    expect(withClip.selectedClipId).toBe(createdClip.id);
    expect(withClip.detectedType).toBe("clip");
    // Auto detail view should show clip
    expect(withClip.detailView).toBe("clip");

    // Test 9b: Select session clip with conflicting view arg - should warn
    const conflictingViewResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: createdClip.id, view: "arrangement" },
    });
    const conflictWarnings = getToolWarnings(conflictingViewResult);

    expect(conflictWarnings.length).toBe(1);
    expect(conflictWarnings[0]).toContain("ignoring view");
    expect(conflictWarnings[0]).toContain("requires session view");

    // Test 10: Create a device and select it by ID
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    const selectDeviceResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: deviceId },
    });
    const withDevice = parseToolResult<ViewState>(selectDeviceResult);

    expect(withDevice.selectedDeviceId).toBe(deviceId);
    expect(withDevice.detectedType).toBe("device");
    // Auto detail view should show device chain
    expect(withDevice.detailView).toBe("device");

    // Test 11: Select device by path
    const selectDevicePathResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { devicePath: "t0/d0" },
    });
    const withDevicePath = parseToolResult<ViewState>(selectDevicePathResult);

    expect(withDevicePath.selectedDeviceId).toBeDefined();
    expect(withDevicePath.detailView).toBe("device");

    // Test 12: Select clip slot (occupied)
    const clipSlotResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { clipSlot: `${emptyMidiTrack}/0` },
    });
    const clipSlot = parseToolResult<ViewState>(clipSlotResult);

    expect(clipSlot.selectedClipSlot).toStrictEqual({
      trackIndex: emptyMidiTrack,
      sceneIndex: 0,
    });
    // Slot has a clip (created above), so detail should show clip
    expect(clipSlot.detailView).toBe("clip");

    // Test 13: Select scene by ID (auto-detection)
    const sceneId = scene.selectedScene.sceneId!;
    const selectSceneByIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: sceneId },
    });
    const sceneById = parseToolResult<ViewState>(selectSceneByIdResult);

    expect(sceneById.selectedScene.sceneId).toBe(sceneId);
    expect(sceneById.detectedType).toBe("scene");

    // Test 14: Error for nonexistent ID
    const badIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: "id 999999" },
    });

    expect(isToolError(badIdResult)).toBe(true);
    expect(getToolErrorMessage(badIdResult)).toContain("does not exist");

    // Test 15: View-only change hides detail
    // First ensure detail is showing
    await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: createdClip.id },
    });

    const viewOnlyResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "session" },
    });
    const viewOnly = parseToolResult<ViewState>(viewOnlyResult);

    expect(viewOnly.detailView).toBeNull();
  });
});

interface ViewState {
  view: string;
  detailView: "clip" | "device" | null;
  detectedType?: "track" | "scene" | "clip" | "device";
  selectedTrack: {
    trackId: string | null;
    type: "midi" | "audio" | "return" | "master" | null;
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
