// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for code execution via ppal-create-clip and ppal-update-clip.
 * Tests the `code` parameter which runs sandboxed JavaScript to generate/transform MIDI notes.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Prerequisite: Build with `npm run build:all` (sets ENABLE_CODE_EXEC=true)
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolWarnings,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();
const emptyMidiTrack = 8;

describe("ppal-code-exec", () => {
  it("creates clip with code-generated notes and verifies defaults", async () => {
    // Create clip with code returning 3 notes (2nd and 3rd omit duration/velocity)
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "0",
        code: "return [{pitch: 60, start: 0, duration: 0.5, velocity: 110}, {pitch: 64, start: 1}, {pitch: 67, start: 2}]",
      },
    });
    const clip = parseToolResult<CreateClipResult>(createResult);

    expect(clip.id).toBeDefined();
    expect(getToolWarnings(createResult)).toHaveLength(0);

    await sleep(100);

    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const readClip = parseToolResult<ReadClipResult>(readResult);

    expect(readClip.noteCount).toBe(3);
    expect(readClip.notes).toBeDefined();
    expect(readClip.notes).toContain("C3");
    expect(readClip.notes).toContain("E3");
    expect(readClip.notes).toContain("G3");
  });

  it("transforms, filters, and clears notes via update-clip code", async () => {
    // Setup: Create a clip with 3 notes
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "1",
        notes: "C3 D3 E3 1|1",
        length: "2:0.0",
      },
    });
    const clip = parseToolResult<CreateClipResult>(createResult);

    await sleep(100);

    // Verify initial state
    const initialRead = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id },
    });
    const initialClip = parseToolResult<ReadClipResult>(initialRead);

    expect(initialClip.noteCount).toBe(3);

    // Filter: remove notes with pitch < 62 (keeps D3=62 and E3=64, removes C3=60)
    const filterResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        code: "return notes.filter(n => n.pitch >= 62)",
      },
    });

    expect(getToolWarnings(filterResult)).toHaveLength(0);

    await sleep(100);

    const afterFilter = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const filteredClip = parseToolResult<ReadClipResult>(afterFilter);

    expect(filteredClip.noteCount).toBe(2);
    expect(filteredClip.notes).toContain("D3");
    expect(filteredClip.notes).toContain("E3");
    expect(filteredClip.notes).not.toContain("C3");

    // Transform: set all velocities to 127
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        code: "return notes.map(n => ({...n, velocity: 127}))",
      },
    });

    await sleep(100);

    const afterTransform = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const transformedClip = parseToolResult<ReadClipResult>(afterTransform);

    expect(transformedClip.noteCount).toBe(2);
    expect(transformedClip.notes).toContain("v127");

    // Clear: return empty array to delete all notes
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        code: "return []",
      },
    });

    await sleep(100);

    const afterClear = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id },
    });
    const clearedClip = parseToolResult<ReadClipResult>(afterClear);

    expect(clearedClip.noteCount).toBe(0);
  });

  it("handles code errors gracefully: syntax, exceptions, and bad return types", async () => {
    const codeErrorCases = [
      {
        label: "syntax error",
        code: "return [{pitch: 60, start: 0}",
        sceneIndex: "2",
      },
      {
        label: "thrown exception",
        code: 'throw new Error("test error")',
        sceneIndex: "3",
      },
      { label: "no return (undefined)", code: "const x = 1;", sceneIndex: "4" },
      { label: "return null", code: "return null", sceneIndex: "5" },
      { label: "return primitive", code: "return 42", sceneIndex: "6" },
      {
        label: "return object (not array)",
        code: "return {pitch: 60, start: 0}",
        sceneIndex: "7",
      },
    ];

    for (const { label, code, sceneIndex } of codeErrorCases) {
      const createResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: emptyMidiTrack,
          sceneIndex,
          code,
        },
      });

      // Clip should still be created despite code failure
      const { data: clip, warnings } =
        parseToolResultWithWarnings<CreateClipResult>(createResult);

      expect(clip.id, `${label}: clip should have id`).toBeDefined();
      expect(
        warnings.some((w) => w.includes("Code execution failed")),
        `${label}: should warn about code failure, got: ${JSON.stringify(warnings)}`,
      ).toBe(true);

      await sleep(50);

      // Clip should have 0 notes (code failed, no notes applied)
      const readResult = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: clip.id },
      });
      const readClip = parseToolResult<ReadClipResult>(readResult);

      expect(readClip.noteCount, `${label}: should have 0 notes`).toBe(0);
    }
  });

  it("filters malformed notes and clamps values to valid ranges", async () => {
    // Sub-test 1: Mixed valid and invalid notes — invalid ones silently filtered
    const mixedResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "8",
        code: [
          "return [",
          "  {pitch: 60, start: 0, duration: 1, velocity: 100},",
          "  {start: 1},",
          "  {pitch: 64},",
          "  {pitch: 67, start: 2, duration: 0},",
          "  {pitch: 'C3', start: 3},",
          "  null,",
          "  {pitch: 72, start: 3, duration: 1, velocity: 100}",
          "]",
        ].join("\n"),
      },
    });
    const mixedClip = parseToolResult<CreateClipResult>(mixedResult);

    // No warnings — filtering is silent, not a code execution failure
    expect(getToolWarnings(mixedResult)).toHaveLength(0);

    await sleep(100);

    const readMixed = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: mixedClip.id, include: ["clip-notes"] },
    });
    const mixed = parseToolResult<ReadClipResult>(readMixed);

    // Only the 2 valid notes should survive (pitch 60 and pitch 72)
    expect(mixed.noteCount).toBe(2);
    expect(mixed.notes).toContain("C3");
    expect(mixed.notes).toContain("C4");

    // Sub-test 2: Value clamping
    const clampResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "9",
        code: [
          "return [",
          "  {pitch: -10, start: 0, duration: 1, velocity: 100},",
          "  {pitch: 200, start: 1, duration: 1, velocity: 100},",
          "  {pitch: 60, start: 2, duration: 1, velocity: 0},",
          "  {pitch: 60, start: 3, duration: 1, velocity: 200}",
          "]",
        ].join("\n"),
      },
    });
    const clampClip = parseToolResult<CreateClipResult>(clampResult);

    await sleep(100);

    const readClamped = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clampClip.id, include: ["clip-notes"] },
    });
    const clamped = parseToolResult<ReadClipResult>(readClamped);

    expect(clamped.noteCount).toBe(4);
    // Pitch -10 → 0 = C-2, Pitch 200 → 127 = G8
    expect(clamped.notes).toContain("C-2");
    expect(clamped.notes).toContain("G8");
    // Velocity 0 → 1, Velocity 200 → 127
    expect(clamped.notes).toContain("v1");
    expect(clamped.notes).toContain("v127");
  });
});
