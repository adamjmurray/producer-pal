// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-select tool
 * Tests view state reading, view switching, selection controls,
 * ID auto-detection, slot, and devicePath.
 *
 * Run with: npm run e2e:mcp -- ppal-select
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  getToolErrorMessage,
  parseAliasedToolResult,
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

    // Test 8: Select track by ID (auto-detection), spelled the way a model
    // guesses it. "trackId" is a permanent alias that folds onto id, so the
    // type still comes from the object — this checks the select and the steer.
    const trackId = regularTrack.selectedTrack!.id;
    const selectByIdResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackId: `id ${trackId}` },
    });
    const byId = parseAliasedToolResult<SelectResult>(
      selectByIdResult,
      "ppal-select",
      "trackId",
      "id",
    );

    expect(byId.selectedTrack).toBeDefined();
    expect(byId.selectedTrack!.id).toBe(trackId);

    // Test 9: Create a clip and select it by ID
    // Use empty track t8 (9-MIDI) to avoid conflicts with pre-populated clips
    const emptyMidiTrack = 8;

    const createClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${emptyMidiTrack}/s0`,
        notes: "C3 1|1",
        length: "1bar",
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
    expect(withClip.selectedClip!.path).toBe(`t${emptyMidiTrack}/s0`);

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
      arguments: { path: "t0/d0" },
    });
    const withDevicePath = parseToolResult<SelectResult>(
      selectDevicePathResult,
    );

    expect(withDevicePath.selectedDevice).toBeDefined();
    expect(withDevicePath.selectedDevice!.path).toBe("t0/d0");

    // Test 12: Select clip slot (occupied)
    const clipSlotResult = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { path: `t${emptyMidiTrack}/s0` },
    });
    const clipSlot = parseToolResult<SelectResult>(clipSlotResult);

    expect(clipSlot.selectedClip).toBeDefined();
    expect(clipSlot.selectedClip!.path).toBe(`t${emptyMidiTrack}/s0`);

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

    // Test 16: A target that isn't there is refused, not silently skipped, and
    // in the same words whichever spelling named it.
    const expectNoTarget = async (
      args: Record<string, unknown>,
      message: string,
    ) => {
      const result = await ctx.client!.callTool({
        name: "ppal-select",
        arguments: args,
      });

      expect(
        isToolError(result),
        `expected ${JSON.stringify(args)} to fail`,
      ).toBe(true);
      expect(getToolErrorMessage(result)).toContain(message);
    };

    await expectNoTarget({ path: "t99" }, 'no track at "t99"');
    await expectNoTarget({ trackIndex: 99 }, 'no track at "t99"');
    await expectNoTarget(
      { trackIndex: 99, trackType: "return" },
      'no track at "rt99"',
    );
    await expectNoTarget({ path: "s99" }, 'no scene at "s99"');
    await expectNoTarget({ sceneIndex: 99 }, 'no scene at "s99"');
    await expectNoTarget({ path: "t0/s99" }, 'no scene at "s99"');
    await expectNoTarget({ path: "t0/d99" }, 'no device at "t0/d99"');

    // Test 17: A refused select changes nothing — a scene selection would have
    // switched to session view before it ever looked for the scene.
    await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { view: "arrangement" },
    });
    await expectNoTarget({ sceneIndex: 99 }, 'no scene at "s99"');

    const afterFailure = parseToolResult<SelectResult>(
      await ctx.client!.callTool({ name: "ppal-select", arguments: {} }),
    );

    expect(afterFailure.view).toBe("arrangement");
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
    path?: string;
    arrangementStart?: string;
  };
  selectedDevice?: {
    id: string;
    path: string;
  };
}
