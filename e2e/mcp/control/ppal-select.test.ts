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
    const initial = parseToolResult<SelectResult>(initialResult);

    expect(initial.view).toBeDefined();

    // Test 2: Switch to session view
    const sessionResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "session" },
    });
    const session = parseToolResult<SelectResult>(sessionResult);

    expect(session.view).toBe("session");

    // Test 3: Switch to arrangement view
    const arrangementResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "arrangement" },
    });
    const arrangement = parseToolResult<SelectResult>(arrangementResult);

    expect(arrangement.view).toBe("arrangement");

    // Test 4: Select regular track by index
    const regularTrackResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackIndex: 0 },
    });
    const regularTrack = parseToolResult<SelectResult>(regularTrackResult);

    expect(regularTrack.selectedTrack).toBeDefined();
    expect(regularTrack.selectedTrack!.type).toBe("midi");
    expect(regularTrack.selectedTrack!.trackIndex).toBe(0);
    expect(regularTrack.selectedTrack!.id).toBeDefined();

    // Test 5: Select return track by index
    const returnTrackResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackIndex: 0, trackType: "return" },
    });
    const returnTrack = parseToolResult<SelectResult>(returnTrackResult);

    expect(returnTrack.selectedTrack!.type).toBe("return");
    expect(returnTrack.selectedTrack!.trackIndex).toBe(0);

    // Test 6: Select master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackType: "master" },
    });
    const master = parseToolResult<SelectResult>(masterResult);

    expect(master.selectedTrack!.type).toBe("master");
    expect(master.selectedTrack!.trackIndex).toBeUndefined();

    // Test 7: Select scene by index
    const sceneResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { sceneIndex: 0 },
    });
    const scene = parseToolResult<SelectResult>(sceneResult);

    expect(scene.selectedScene!.sceneIndex).toBe(0);
    expect(scene.selectedScene!.id).toBeDefined();
    // Scene selection auto-switches to session view
    expect(scene.view).toBe("session");

    // Test 8: Select track by ID (auto-detection)
    const trackId = regularTrack.selectedTrack!.id;
    const selectByIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: `id ${trackId}` },
    });
    const byId = parseToolResult<SelectResult>(selectByIdResult);

    expect(byId.selectedTrack).toBeDefined();
    expect(byId.selectedTrack!.id).toBe(trackId);

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
      arguments: { id: `id ${createdClip.id}` },
    });
    const withClip = parseToolResult<SelectResult>(selectClipResult);

    expect(withClip.selectedClip).toBeDefined();
    expect(withClip.selectedClip!.id).toBe(createdClip.id);
    expect(withClip.selectedClip!.slot).toBeDefined();

    // Test 9b: Select session clip with conflicting view arg - should warn
    const conflictingViewResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: `id ${createdClip.id}`, view: "arrangement" },
    });
    const conflictWarnings = getToolWarnings(conflictingViewResult);

    expect(conflictWarnings.length).toBe(1);
    expect(conflictWarnings[0]).toContain("ignoring view");
    expect(conflictWarnings[0]).toContain("requires session view");

    // Test 10: Create a device and select it by ID
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    const selectDeviceResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: `id ${deviceId}` },
    });
    const withDevice = parseToolResult<SelectResult>(selectDeviceResult);

    expect(withDevice.selectedDevice).toBeDefined();
    expect(withDevice.selectedDevice!.id).toBe(deviceId);
    expect(withDevice.selectedDevice!.path).toBeDefined();

    // Test 11: Select device by path
    const selectDevicePathResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { devicePath: "t0/d0" },
    });
    const withDevicePath = parseToolResult<SelectResult>(
      selectDevicePathResult,
    );

    expect(withDevicePath.selectedDevice).toBeDefined();
    expect(withDevicePath.selectedDevice!.path).toBe("t0/d0");

    // Test 12: Select clip slot (occupied)
    const clipSlotResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { clipSlot: `${emptyMidiTrack}/0` },
    });
    const clipSlot = parseToolResult<SelectResult>(clipSlotResult);

    expect(clipSlot.selectedClip).toBeDefined();
    expect(clipSlot.selectedClip!.slot).toBe(`${emptyMidiTrack}/0`);

    // Test 13: Select scene by ID (auto-detection)
    const sceneId = scene.selectedScene!.id;
    const selectSceneByIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: `id ${sceneId}` },
    });
    const sceneById = parseToolResult<SelectResult>(selectSceneByIdResult);

    expect(sceneById.selectedScene).toBeDefined();
    expect(sceneById.selectedScene!.id).toBe(sceneId);

    // Test 14: Error for nonexistent ID
    const badIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: "id 999999" },
    });

    expect(isToolError(badIdResult)).toBe(true);
    expect(getToolErrorMessage(badIdResult)).toContain("does not exist");

    // Test 15: View-only change returns only view
    const viewOnlyResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "session" },
    });
    const viewOnly = parseToolResult<SelectResult>(viewOnlyResult);

    expect(viewOnly.view).toBe("session");
    expect(viewOnly.selectedTrack).toBeUndefined();
    expect(viewOnly.selectedScene).toBeUndefined();
  });
});

interface SelectResult {
  view?: string;
  selectedTrack?: {
    id: string;
    type: string;
    trackIndex?: number;
  };
  selectedScene?: {
    id: string;
    sceneIndex: number;
  };
  selectedClip?: {
    id: string;
    slot?: string;
    trackIndex?: number;
    arrangementStart?: string;
  };
  selectedDevice?: {
    id: string;
    path: string;
  };
}
