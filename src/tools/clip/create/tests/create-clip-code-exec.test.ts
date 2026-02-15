// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../create-clip.ts";

// Mock the code execution protocol module
vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

// Import the mocked module to configure per-test behavior
import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";

interface SessionCodeExecMocks {
  clipsByScene: Map<number, RegisteredMockObject>;
}

function setupSessionCodeExecMocks(
  sceneIndices: number[],
): SessionCodeExecMocks {
  const sceneIds = sceneIndices.map((sceneIndex) => `scene${sceneIndex}`);

  registerMockObject("live-set", {
    path: "live_set",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scenes: children(...sceneIds),
    },
  });
  registerMockObject("track-0", {
    path: livePath.track(0),
  });

  const clipsByScene = new Map<number, RegisteredMockObject>();

  for (const sceneIndex of sceneIndices) {
    registerMockObject(`clip-slot-0-${sceneIndex}`, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: 0 },
    });

    const clip = registerMockObject(
      `live_set/tracks/0/clip_slots/${sceneIndex}/clip`,
      {
        path: livePath.track(0).clipSlot(sceneIndex).clip(),
        properties: { length: 4 },
      },
    );

    clipsByScene.set(sceneIndex, clip);
  }

  return { clipsByScene };
}

/**
 * Track added notes per clip handle for get_notes_extended responses.
 * @param clips - Clip handles to track
 */
function setupNoteTrackingMock(clips: RegisteredMockObject[]): void {
  const addedNotes = new Map<string, unknown[]>();

  for (const handle of clips) {
    addedNotes.set(handle.id, []);

    handle.call.mockImplementation((method: string, ...args: unknown[]) => {
      const existing = addedNotes.get(handle.id) ?? [];

      if (method === "remove_notes_extended") {
        addedNotes.set(handle.id, []);

        return null;
      }

      if (method === "add_new_notes") {
        const firstArg = args[0] as { notes?: unknown[] } | undefined;

        addedNotes.set(handle.id, [...existing, ...(firstArg?.notes ?? [])]);

        return null;
      }

      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: addedNotes.get(handle.id) ?? [] });
      }

      return null;
    });
  }
}

describe("createClip - code execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply code to a created session clip", async () => {
    const { clipsByScene } = setupSessionCodeExecMocks([0]);
    const clip = clipsByScene.get(0);

    expect(clip).toBeDefined();

    if (clip == null) {
      throw new Error("Expected clip handle for scene 0");
    }

    setupNoteTrackingMock([clip]);

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [
        {
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 100,
          velocityDeviation: 0,
          probability: 1,
        },
        {
          pitch: 64,
          start: 1,
          duration: 1,
          velocity: 90,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      code: "return [{ pitch: 60, start: 0, duration: 1, velocity: 100 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        _id: "live_set/tracks/0/clip_slots/0/clip",
      }),
      "return [{ pitch: 60, start: 0, duration: 1, velocity: 100 }]",
      "session",
      0,
      undefined,
    );

    // applyNotesToClip should have been called (remove + add)
    expect(clip.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(clip.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 90,
          velocity_deviation: 0,
          probability: 1,
        },
      ],
    });

    // noteCount should be updated from getClipNoteCount
    const resultObj = result as { noteCount?: number };

    expect(resultObj.noteCount).toBe(2);
  });

  it("should warn when code execution fails for a created clip", async () => {
    setupSessionCodeExecMocks([0]);

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: false,
      error: "TypeError: notes.map is not a function",
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      code: "return notes.map(invalid)",
    });

    // Should emit a warning via console.warn
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Code execution failed for clip"),
    );

    // Should still return the clip result (without updated noteCount)
    const resultObj = result as { id?: string };

    expect(resultObj.id).toBeDefined();
  });

  it("should apply code to multiple created clips", async () => {
    const { clipsByScene } = setupSessionCodeExecMocks([0, 1]);
    const firstClip = clipsByScene.get(0);
    const secondClip = clipsByScene.get(1);

    expect(firstClip).toBeDefined();
    expect(secondClip).toBeDefined();

    if (firstClip == null || secondClip == null) {
      throw new Error("Expected clip handles for scenes 0 and 1");
    }

    setupNoteTrackingMock([firstClip, secondClip]);

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [
        {
          pitch: 48,
          start: 0,
          duration: 2,
          velocity: 110,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0, 1",
      code: "return [{ pitch: 48, start: 0, duration: 2, velocity: 110 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledTimes(2);

    const results = result as Array<{ noteCount?: number }>;

    expect(results).toHaveLength(2);
    expect(results[0]?.noteCount).toBe(1);
    expect(results[1]?.noteCount).toBe(1);
  });

  it("should not call executeNoteCode when code is not provided", async () => {
    setupSessionCodeExecMocks([0]);

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|1",
    });

    expect(executeNoteCode).not.toHaveBeenCalled();
  });
});
