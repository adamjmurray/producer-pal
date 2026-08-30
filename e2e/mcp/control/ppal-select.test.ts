// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-select tool
 * Tests view state reading, view switching, selection controls,
 * ID auto-detection, slot, devicePath, and openPluginWindow.
 * Uses: e2e-test-set (t8 is the empty MIDI track, t3/d0 is Drift)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- control/ppal-select
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

// t8 (9-MIDI) is empty, so clips made here can't collide with the Set's own
const EMPTY_MIDI_TRACK = 8;

async function select(args: Record<string, unknown>): Promise<SelectResult> {
  return parseToolResult<SelectResult>(
    await ctx.client!.callTool({ name: "ppal-select", arguments: args }),
  );
}

async function createClip(path: string): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path, notes: "C3 1|1", length: "1bar" },
  });

  return parseToolResult<{ id: string }>(result).id;
}

async function expectNoTarget(
  args: Record<string, unknown>,
  message: string,
): Promise<void> {
  const result = await ctx.client!.callTool({
    name: "ppal-select",
    arguments: args,
  });

  expect(isToolError(result), `expected ${JSON.stringify(args)} to fail`).toBe(
    true,
  );
  expect(getToolErrorMessage(result)).toContain(message);
}

describe("ppal-select", () => {
  it("reads the current state with no arguments", async () => {
    expect((await select({})).view).toBeDefined();
  });

  it("switches views, and a view-only change returns only the view", async () => {
    expect((await select({ view: "session" })).view).toBe("session");

    const arrangement = await select({ view: "arrangement" });

    expect(arrangement.view).toBe("arrangement");
    expect(arrangement.selectedTrack).toBeUndefined();
    expect(arrangement.selectedScene).toBeUndefined();
  });

  it("selects regular, return and master tracks", async () => {
    const regular = await select({ trackIndex: 0 });

    expect(regular.selectedTrack!.type).toBe("midi");
    expect(regular.selectedTrack!.trackIndex).toBe(0);
    expect(regular.selectedTrack!.id).toBeDefined();

    const returnTrack = await select({ trackIndex: 0, trackType: "return" });

    expect(returnTrack.selectedTrack!.type).toBe("return");
    expect(returnTrack.selectedTrack!.trackIndex).toBe(0);

    const master = await select({ trackType: "master" });

    expect(master.selectedTrack!.type).toBe("master");
    expect(master.selectedTrack!.trackIndex).toBeUndefined();
  });

  it("selects a scene by index, switching to session view for it", async () => {
    const scene = await select({ sceneIndex: 0 });

    expect(scene.selectedScene!.sceneIndex).toBe(0);
    expect(scene.selectedScene!.id).toBeDefined();
    expect(scene.view).toBe("session");
  });

  it("selects a track by id, spelled the way a model guesses it", async () => {
    // "trackId" is a permanent alias that folds onto id, so the type still
    // comes from the object — this checks the select and the steer.
    const trackId = (await select({ trackIndex: 0 })).selectedTrack!.id;
    const result = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackId: `id ${trackId}` },
    });
    const byId = parseAliasedToolResult<SelectResult>(
      result,
      "ppal-select",
      "trackId",
      "id",
    );

    expect(byId.selectedTrack!.id).toBe(trackId);
  });

  it("selects a clip by id and by slot path", async () => {
    const clipId = await createClip(`t${EMPTY_MIDI_TRACK}/s0`);

    const byId = await select({ id: `id ${clipId}` });

    expect(byId.selectedClip!.id).toBe(clipId);
    expect(byId.selectedClip!.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`);

    const bySlot = await select({ path: `t${EMPTY_MIDI_TRACK}/s0` });

    expect(bySlot.selectedClip!.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`);
  });

  it("warns when the view asked for can't hold the selected clip", async () => {
    const clipId = await createClip(`t${EMPTY_MIDI_TRACK}/s0`);
    const result = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { id: `id ${clipId}`, view: "arrangement" },
    });
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("ignoring view");
    expect(warnings[0]).toContain("requires session view");
  });

  it("selects a device by id and by path", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    const byId = await select({ id: `id ${deviceId}` });

    expect(byId.selectedDevice!.id).toBe(deviceId);
    expect(byId.selectedDevice!.path).toBeDefined();

    const byPath = await select({ path: "t0/d0" });

    expect(byPath.selectedDevice!.path).toBe("t0/d0");
  });

  it("selects a scene by id", async () => {
    const sceneId = (await select({ sceneIndex: 0 })).selectedScene!.id;
    const byId = await select({ id: `id ${sceneId}` });

    expect(byId.selectedScene!.id).toBe(sceneId);
  });

  it("refuses a target that isn't there, in the same words either way", async () => {
    await expectNoTarget({ id: "id 999999" }, "does not exist");
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
  });

  it("changes nothing when the select is refused", async () => {
    // A scene selection would have switched to session view before it ever
    // looked for the scene.
    await select({ view: "arrangement" });
    await expectNoTarget({ sceneIndex: 99 }, 'no scene at "s99"');

    expect((await select({})).view).toBe("arrangement");
  });

  // The success path needs a VST/AU installed, which no machine is guaranteed
  // to have, so only the two refusals are covered here.
  it("warns when openPluginWindow names nothing to open", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { openPluginWindow: true },
    });

    expect(getToolWarnings(result).join("\n")).toContain(
      "openPluginWindow requires a plug-in device",
    );
  });

  it("warns that openPluginWindow does nothing for a stock device", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { path: "t3/d0", openPluginWindow: true },
    });
    const warnings = getToolWarnings(result);

    expect(warnings.join("\n")).toContain("is not a plug-in");
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
