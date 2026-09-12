// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-scene tool
 * Creates scenes in the Live Set - these modifications persist within the session.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-create-scene", () => {
  it("creates scenes with properties", async () => {
    // Test 1: Create single scene at index 0
    const basicResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s0" },
    });
    const basic = parseToolResult<CreateSceneResult>(basicResult);

    expect(basic.id).toBeDefined();
    expect(basic.path).toBe("s0");

    // Test 2: Create scene with name
    const namedResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s1", name: "Test Scene" },
    });
    const named = parseToolResult<CreateSceneResult>(namedResult);

    await sleep(100);
    const verifyNamed = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: named.id },
    });
    const namedScene = parseToolResult<ReadSceneResult>(verifyNamed);

    expect(namedScene.name).toBe("Test Scene");

    // Test 3: Create scene with color
    const coloredResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s2", name: "Colored Scene", color: "#FF0000" },
    });
    const colored = parseToolResult<CreateSceneResult>(coloredResult);

    await sleep(100);
    const verifyColored = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: colored.id, include: ["color"] },
    });
    const coloredScene = parseToolResult<ReadSceneResult>(verifyColored);

    // Color may be quantized to Live's palette, but should be set
    expect(coloredScene.color).toBeDefined();

    // Test 4: Create scene with tempo
    const tempoResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s3", name: "Tempo Scene", tempo: 120 },
    });
    const tempo = parseToolResult<CreateSceneResult>(tempoResult);

    await sleep(100);
    const verifyTempo = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: tempo.id },
    });
    const tempoScene = parseToolResult<ReadSceneResult>(verifyTempo);

    expect(tempoScene.tempo).toBe(120);

    // Test 5: Create scene with timeSignature
    const timeSigResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s4", name: "TimeSig Scene", timeSignature: "3/4" },
    });
    const timeSig = parseToolResult<CreateSceneResult>(timeSigResult);

    await sleep(100);
    const verifyTimeSig = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: timeSig.id },
    });
    const timeSigScene = parseToolResult<ReadSceneResult>(verifyTimeSig);

    expect(timeSigScene.timeSignature).toBe("3/4");
  });

  it("creates multiple scenes in batch", async () => {
    // Get initial scene count
    const initialResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const initial = parseToolResult<LiveSetResult>(initialResult);
    const initialSceneCount = initial.sceneCount ?? 0;

    // Test 1: Create multiple scenes with count
    const batchResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s5", count: 2 },
    });
    const batch = parseBatchResult<CreateSceneResult>(batchResult, 2);

    expect(batch[0]!.id).toBeDefined();
    expect(batch[1]!.id).toBeDefined();
    expect(batch[0]!.path).toBe("s5");
    expect(batch[1]!.path).toBe("s6");

    // Test 2: Create multiple scenes with name
    const multiNameResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s7", count: 2, name: "Multi" },
    });
    const multiName = parseToolResult<CreateSceneResult[]>(multiNameResult);

    expect(multiName).toHaveLength(2);

    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: multiName[0]!.id },
    });
    const verifySecond = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: multiName[1]!.id },
    });
    const firstScene = parseToolResult<ReadSceneResult>(verifyFirst);
    const secondScene = parseToolResult<ReadSceneResult>(verifySecond);

    expect(firstScene.name).toBe("Multi");
    expect(secondScene.name).toBe("Multi");

    // Test 3: Create multiple scenes with comma-separated names and colors
    const csvResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: {
        path: "s9",
        count: 2,
        name: "Intro,Verse",
        color: "#FF0000,#00FF00",
      },
    });
    const csv = parseToolResult<CreateSceneResult[]>(csvResult);

    expect(csv).toHaveLength(2);

    await sleep(100);
    const verifyCsv1 = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: csv[0]!.id, include: ["color"] },
    });
    const verifyCsv2 = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { id: csv[1]!.id, include: ["color"] },
    });
    const csvScene1 = parseToolResult<ReadSceneResult>(verifyCsv1);
    const csvScene2 = parseToolResult<ReadSceneResult>(verifyCsv2);

    expect(csvScene1.name).toBe("Intro");
    expect(csvScene2.name).toBe("Verse");
    expect(csvScene1.color).toBeDefined();
    expect(csvScene2.color).toBeDefined();

    // Verify scene count increased
    const finalResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const final = parseToolResult<LiveSetResult>(finalResult);
    const finalSceneCount = final.sceneCount ?? 0;

    // Created: 2 batch + 2 multiName + 2 csv = 6
    expect(finalSceneCount).toBeGreaterThan(initialSceneCount);
  });

  // capture mode reached setColor only after capture_and_insert_scene had
  // already turned the playing clips into a real scene, so a bad color left one
  // behind. Only real Live inserts the scene, so only e2e can catch it.
  it("refuses a malformed color before capturing a scene", async () => {
    const before = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} }),
    );

    const result = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { capture: true, name: "Refused", color: "red" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("invalid color");

    await sleep(100);

    const after = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} }),
    );

    expect(after.sceneCount).toBe(before.sceneCount);
  });

  it("captures playing session clips into a new scene", async () => {
    // capture mode calls Live's capture_and_insert_scene on the currently
    // playing clips — only real Live can confirm a scene is inserted with them.
    const before = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: {},
      }),
    );
    const beforeCount = before.sceneCount ?? 0;

    // Launch scene 0 (Intro, 5 session clips) so its clips are playing.
    // Firing while stopped starts playback immediately (no launch-quantization
    // delay), but wait a moment for Live to settle.
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-scene", sceneIndex: 0 },
    });
    await sleep(1500);

    // Capture the playing clips into a new scene
    const capture = parseToolResult<CaptureSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: { capture: true, name: "Captured" },
      }),
    );

    expect(capture.id).toBeDefined();
    expect(capture.path).toMatch(/^s[1-9]\d*$/);
    expect(Array.isArray(capture.clips)).toBe(true);
    expect(capture.clips!.length).toBeGreaterThan(0);
    // Every captured clip names the slot it landed in, on the new scene
    const sceneSuffix = `/${capture.path!}`;

    for (const clip of capture.clips!) {
      expect(clip.path.endsWith(sceneSuffix)).toBe(true);
    }

    // The capture inserts exactly one scene
    await sleep(100);
    const after = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: {},
      }),
    );

    expect(after.sceneCount ?? 0).toBe(beforeCount + 1);

    // The captured scene carries the requested name
    const captured = parseToolResult<ReadSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { id: capture.id },
      }),
    );

    expect(captured.name).toBe("Captured");

    // Cleanup: stop playback
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });

  /**
   * The Set's scenes in order, by id. Ids stay with a scene as inserts move it,
   * so they show whether a capture landed where it was asked to.
   * @returns The scene ids, first to last
   */
  async function sceneIds(): Promise<string[]> {
    const liveSet = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["scenes"] },
      }),
    );

    return (liveSet.scenes ?? []).map((scene) => scene.id);
  }

  // capture_and_insert_scene inserts after the selected scene, so an index-N
  // request has to select N-1. Selecting N instead put the scene one slot late
  // and renumbered everything after it — only real Live inserts the scene, so
  // only e2e can catch it.
  it("captures at the index a path names", async () => {
    // Launch scene 0 (Intro, 5 session clips) so its clips are playing
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-scene", sceneIndex: 0 },
    });
    await sleep(1500);

    const before = await sceneIds();

    // s0 names a slot with no scene before it, so the call is refused whole
    const refused = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { path: "s0", capture: true, name: "Refused" },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      "capture can't insert at s0",
    );

    await sleep(100);
    expect(await sceneIds()).toStrictEqual(before);

    // s2 lands at 2 and pushes what was there down
    const atTwo = parseToolResult<CaptureSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: { path: "s2", capture: true, name: "CAP-AT-2" },
      }),
    );

    expect(atTwo.path).toBe("s2");

    await sleep(100);
    const afterTwo = await sceneIds();

    expect(afterTwo[2]).toBe(atTwo.id);
    // Dropping the new scene gives back the original order, so nothing else moved
    expect(afterTwo.filter((_, i) => i !== 2)).toStrictEqual(before);

    // s+ lands at the end and leaves every existing scene where it was
    const atEnd = parseToolResult<CaptureSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: { path: "s+", capture: true, name: "CAP-AT-END" },
      }),
    );

    expect(atEnd.path).toBe(`s${String(afterTwo.length)}`);

    await sleep(100);
    const afterEnd = await sceneIds();

    expect(afterEnd.at(-1)).toBe(atEnd.id);
    expect(afterEnd.slice(0, -1)).toStrictEqual(afterTwo);

    // Cleanup: stop playback
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });

  // An index past the end of the scenes has no predecessor to select, so
  // capture mode has to pad with empty scenes first, same as create mode.
  it("pads with empty scenes when capturing past the end", async () => {
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-scene", sceneIndex: 0 },
    });
    await sleep(1500);

    const before = await sceneIds();
    const targetIndex = before.length + 3;

    const captured = parseToolResult<CaptureSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: {
          path: `s${String(targetIndex)}`,
          capture: true,
          name: "CAP-PAST-END",
        },
      }),
    );

    expect(captured.path).toBe(`s${String(targetIndex)}`);

    await sleep(100);
    const after = await sceneIds();

    expect(after).toHaveLength(targetIndex + 1);
    expect(after[targetIndex]).toBe(captured.id);
    expect(after.slice(0, before.length)).toStrictEqual(before);

    // Cleanup: stop playback
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });
});

interface LiveSetResult {
  sceneCount?: number;
  scenes?: Array<{ id: string; name: string; path: string }>;
}

interface CreateSceneResult {
  id: string;
  path: string;
}

interface CaptureSceneResult {
  id: string;
  path: string;
  clips?: Array<{ id: string; path: string }>;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
}
