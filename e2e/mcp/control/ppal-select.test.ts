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
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

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

async function expectRefusal(
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
    const regular = await select({ path: "t0" });

    expect(regular.selectedTrack!.type).toBe("midi");
    expect(regular.selectedTrack!.path).toBe("t0");
    expect(regular.selectedTrack!.id).toBeDefined();

    const returnTrack = await select({ path: "rt0" });

    expect(returnTrack.selectedTrack!.path).toBe("rt0");

    const master = await select({ path: "mt" });

    expect(master.selectedTrack!.path).toBe("mt");
  });

  it("selects a scene by path, switching to session view for it", async () => {
    const scene = await select({ path: "s0" });

    expect(scene.selectedScene!.path).toBe("s0");
    expect(scene.selectedScene!.id).toBeDefined();
    expect(scene.view).toBe("session");
  });

  it("selects a track by id, spelled the way a model guesses it", async () => {
    // "trackId" is a permanent alias that folds onto id, so the type still
    // comes from the object — this checks the select and the steer.
    const trackId = (await select({ path: "t0" })).selectedTrack!.id;
    const result = await ctx.client!.callTool({
      name: "ppal-select",
      arguments: { trackId: `id ${trackId}` },
    });
    const byId = parseAliasedToolResult<SelectResult>(result, "trackId", "id");

    expect(byId.selectedTrack!.id).toBe(trackId);
  });

  // The aliases are the only way to name two objects by id at once, and reading
  // just the first used to drop the rest while the migration notice said every
  // one had been honored. Live is read back: the response naming both is not
  // proof both landed.
  it("selects a track and a scene named by separate id aliases", async () => {
    const trackId = (await select({ path: "t2" })).selectedTrack!.id;
    const sceneId = (await select({ path: "s1" })).selectedScene!.id;

    await select({ path: "t0" });
    await select({ path: "s0" });

    const { data, warnings } = parseToolResultWithWarnings<SelectResult>(
      await ctx.client!.callTool({
        name: "ppal-select",
        arguments: { trackId: `id ${trackId}`, sceneId: `id ${sceneId}` },
      }),
    );

    expect(data.selectedTrack!.id).toBe(trackId);
    expect(data.selectedScene!.id).toBe(sceneId);
    // Aliases onto one canonical are named in a single steer, and that steer
    // says the value was honored — which is only true now both are.
    expect(warnings).toStrictEqual([
      'WARNING: "trackId", "sceneId" accepted as fallbacks; "id" names one object, so keep them as they are for several',
    ]);

    const state = await select({});

    expect(state.selectedTrack!.id).toBe(trackId);
    expect(state.selectedScene!.id).toBe(sceneId);
  });

  // Each of these writes the other's selection as a side effect, so honoring
  // both would report one object while Live sits on another.
  it("refuses two ids Live can't hold selected at once", async () => {
    const trackId = (await select({ path: "t2" })).selectedTrack!.id;
    const sceneId = (await select({ path: "s1" })).selectedScene!.id;
    // t0/s0 "Beat" is on neither of those.
    const clipId = (await select({ path: "t0/s0" })).selectedClip!.id;
    const padId = (await select({ path: "t0/d0/pC1" })).selectedDrumPad!.id;
    const driftId = (await select({ path: "t3/d0" })).selectedDevice!.id;

    await expectRefusal(
      { trackId: `id ${trackId}`, clipId: `id ${clipId}` },
      "trackId and clipId name different tracks",
    );
    await expectRefusal(
      { sceneId: `id ${sceneId}`, clipId: `id ${clipId}` },
      "sceneId and clipId name different scenes",
    );
    await expectRefusal(
      { id: `id ${padId}`, deviceId: `id ${driftId}` },
      "deviceId and id name different devices",
    );
    const otherTrackId = (await select({ path: "t0" })).selectedTrack!.id;

    await expectRefusal(
      { id: `id ${trackId}`, trackId: `id ${otherTrackId}` },
      "id and trackId name different tracks",
    );
  });

  // A drum pad and the rack it sits in are one selection, not two, so the
  // deviceId that names that rack is the one pairing select allows. (A pad
  // *path* beside any deviceId is refused before this: id and path never name
  // a device together.)
  it("takes a deviceId naming the rack a pad sits in", async () => {
    const padId = (await select({ path: "t0/d0/pC1" })).selectedDrumPad!.id;
    const rackId = (await select({ path: "t0/d0" })).selectedDevice!.id;
    const { data } = parseToolResultWithWarnings<SelectResult>(
      await ctx.client!.callTool({
        name: "ppal-select",
        arguments: { id: `id ${padId}`, deviceId: `id ${rackId}` },
      }),
    );

    expect(data.selectedDrumPad!.path).toBe("t0/d0/pC1");
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
    const sceneId = (await select({ path: "s0" })).selectedScene!.id;
    const byId = await select({ id: `id ${sceneId}` });

    expect(byId.selectedScene!.id).toBe(sceneId);
  });

  it("refuses a target that isn't there, in the same words either way", async () => {
    await expectRefusal({ id: "id 999999" }, "does not exist");
    await expectRefusal({ path: "t99" }, 'no track at "t99"');
    await expectRefusal({ trackIndex: 99 }, 'no track at "t99"');
    await expectRefusal(
      { trackIndex: 99, trackType: "return" },
      'no track at "rt99"',
    );
    await expectRefusal({ path: "s99" }, 'no scene at "s99"');
    await expectRefusal({ sceneIndex: 99 }, 'no scene at "s99"');
    await expectRefusal({ path: "t0/s99" }, 'no scene at "s99"');
    await expectRefusal({ path: "t0/d99" }, 'no device at "t0/d99"');
  });

  it("changes nothing when the select is refused", async () => {
    // A scene selection would have switched to session view before it ever
    // looked for the scene.
    await select({ view: "arrangement" });
    await expectRefusal({ sceneIndex: 99 }, 'no scene at "s99"');

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

    expect(warnings.join("\n")).toContain("not a plug-in");
  });
});

interface SelectResult {
  view?: string;
  selectedTrack?: {
    id: string;
    path: string;
    // Only a regular track reports its signal type; "rt0"/"mt" already say what
    // a return or the main track carries. See trackTypeField.
    type?: string;
  };
  selectedScene?: {
    id: string;
    path: string;
  };
  selectedClip?: {
    id: string;
    path?: string;
  };
  selectedDevice?: {
    id: string;
    path: string;
  };
  selectedDrumPad?: {
    id: string;
    path: string;
  };
}
