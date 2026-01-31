/**
 * E2E tests for ppal-read-clip tool
 * Creates clips then reads them to verify properties.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-read-clip", () => {
  it("reads clips by various methods with different include params", async () => {
    // Setup: Create a MIDI clip with notes for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        name: "Test Read Clip",
        notes: "C3 D3 E3 F3 1|1",
        looping: true,
        length: "2:0.0",
      },
    });
    const created = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Test 1: Read MIDI clip by clipId - verify all core properties
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: created.id },
    });
    const byIdClip = parseToolResult<ReadClipResult>(byIdResult);

    expect(byIdClip.id).toBe(created.id);
    expect(byIdClip.type).toBe("midi");
    expect(byIdClip.name).toBe("Test Read Clip");
    expect(byIdClip.view).toBe("session");
    expect(byIdClip.timeSignature).toBeDefined();
    expect(byIdClip.looping).toBe(true);
    expect(byIdClip.start).toBeDefined();
    expect(byIdClip.end).toBeDefined();
    expect(byIdClip.length).toBe("2:0");
    expect(byIdClip.trackIndex).toBe(0);
    expect(byIdClip.sceneIndex).toBe(0);
    expect(byIdClip.noteCount).toBe(4);

    // Test 2: Read clip by trackIndex + sceneIndex
    const byPositionResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 0 },
    });
    const byPositionClip = parseToolResult<ReadClipResult>(byPositionResult);

    expect(byPositionClip.id).toBe(created.id);
    expect(byPositionClip.name).toBe("Test Read Clip");

    // Test 3: Read with default include (clip-notes) - verify notes string present
    const withNotesResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: created.id, include: ["clip-notes"] },
    });
    const withNotesClip = parseToolResult<ReadClipResult>(withNotesResult);

    expect(withNotesClip.notes).toBeDefined();
    // Notes should contain the pitches we created
    expect(withNotesClip.notes).toMatch(/C3/);

    // Test 4: Read with include: ["color"] - verify hex color format
    const withColorResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: created.id, include: ["color"] },
    });
    const withColorClip = parseToolResult<ReadClipResult>(withColorResult);

    // Color should be in hex format
    expect(withColorClip.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // Test 5: Read arrangement clip - verify arrangement properties
    const createArrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "5|1",
        length: "4:0.0",
      },
    });
    const createdArrangement = parseToolResult<{ id: string }>(
      createArrangementResult,
    );

    await sleep(100);
    const arrangementResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: createdArrangement.id },
    });
    const arrangementClip = parseToolResult<ReadClipResult>(arrangementResult);

    expect(arrangementClip.view).toBe("arrangement");
    expect(arrangementClip.arrangementStart).toBe("5|1");
    expect(arrangementClip.arrangementLength).toBeDefined();

    // Test 6: Read non-existent clip (empty slot) - verify id === null
    const emptyResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 99 },
    });
    const emptyClip = parseToolResult<ReadClipResult>(emptyResult);

    expect(emptyClip.id).toBeNull();
    expect(emptyClip.type).toBeNull();
  });
});
