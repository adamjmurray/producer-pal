// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-update-device's `preset`, swapped onto a device through
 * the Producer Pal remote script. Opt-in like the other browser tests. Presets
 * are picked from Drift's and Reverb's own lists at run time. The preset holding
 * Producer Pal is a repo file, copied into the User Library for the suite.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/specs/e2e-test-set-spec.md,
 * e2e/live-sets/specs/ppal-drum-pad-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/update/ppal-update-device-preset
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  callToolAndSettle,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  trackIndexFromPath,
} from "../../mcp-test-helpers";
import {
  type DeviceRead,
  type Preset,
  REMOTE_SCRIPT_E2E,
  packDrumKitOrSkip,
  listPresets,
  presetEndingIn,
  presetName,
  readDevice,
  requireRemoteScript,
  type StagedPreset,
  stagePpalPreset,
} from "../helpers/remote-script-test-helpers";
import { PPAL_TRACK } from "../../e2e-test-set.ts";
import {
  LIBRARY_NEEDS,
  skipTestBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers.ts";

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-update-device — presets", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  let adv: Preset;
  let adg: Preset;
  let reverb: Preset;
  let holdingPal: StagedPreset | undefined;

  beforeAll(async () => {
    holdingPal = await stagePpalPreset();

    const drift = await listPresets("instrument", "Drift");

    adv = presetEndingIn(drift, ".adv");
    adg = presetEndingIn(drift, ".adg");
    reverb = presetEndingIn(
      await listPresets("audio-effect", "Reverb"),
      ".adv",
    );
  });

  afterAll(() => {
    holdingPal?.remove();
  });

  /**
   * Call a tool.
   * @param name - The tool
   * @param args - Its args
   * @returns The raw result
   */
  async function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return callToolAndSettle(ctx.client!, name, args);
  }

  /**
   * A Drift on a fresh MIDI track.
   * @returns Its id and path
   */
  async function createDrift(): Promise<{ id: string; path: string }> {
    const track = parseToolResult<{ path: string }>(
      await call("ppal-create-track", { type: "midi" }),
    );

    return parseToolResult(
      await call("ppal-create-device", {
        deviceName: "Drift",
        path: `t${trackIndexFromPath(track.path)}/d0`,
      }),
    );
  }

  /**
   * An Instrument Rack on a fresh MIDI track, with a Drift in its first chain.
   * @returns The rack's path, and the Drift's id and path
   */
  async function createRackWithDrift(): Promise<{
    rack: string;
    drift: { id: string; path: string };
  }> {
    const track = parseToolResult<{ path: string }>(
      await call("ppal-create-track", { type: "midi" }),
    );
    const rack = await createTestDeviceAt(
      ctx.client!,
      "Instrument Rack",
      `t${trackIndexFromPath(track.path)}`,
    );
    const drift = parseToolResult<{ id: string; path: string }>(
      await call("ppal-create-device", {
        deviceName: "Drift",
        path: `${rack}/c0`,
      }),
    );

    return { rack, drift };
  }

  /**
   * Load one of Drift's own presets, and check the device is kept.
   * @param drift - The Drift's id and path
   */
  async function expectOwnPresetKeepsDevice(drift: {
    id: string;
    path: string;
  }): Promise<void> {
    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        path: drift.path,
        preset: presetName(adv.name),
      }),
    );

    expect(updated).toStrictEqual({ id: drift.id, path: drift.path });
    expect((await readDevice(ctx.client!, drift.path)).name).toBe(
      presetName(adv.name),
    );
  }

  it("keeps the device for one of its own presets", async () => {
    const drift = await createDrift();

    await expectOwnPresetKeepsDevice(drift);
  });

  it("loads a preset onto each of several devices", async () => {
    const first = await createDrift();
    const second = await createDrift();
    const preset = presetName(adv.name);
    const updated = parseToolResult<UpdateResult[]>(
      await call("ppal-update-device", {
        path: `${first.path},${second.path}`,
        preset: `${preset},${preset}`,
      }),
    );

    expect(updated).toStrictEqual([
      { id: first.id, path: first.path },
      { id: second.id, path: second.path },
    ]);
    expect((await readDevice(ctx.client!, first.path)).name).toBe(preset);
    expect((await readDevice(ctx.client!, second.path)).name).toBe(preset);
  });

  it("puts a new device in place for a rack preset, and says so", async () => {
    const drift = await createDrift();
    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        id: drift.id,
        preset: `Instruments/${adg.path}`,
      }),
    );
    const device = await readDevice(ctx.client!, drift.path);

    expect(updated.id).not.toBe(drift.id);
    expect(updated.detail).toContain("replaced the device");
    expect(device.id).toBe(updated.id);
    expect(device.type).toBe("instrument-rack");
  });

  it("loads a preset onto a device inside a rack chain", async () => {
    const { drift } = await createRackWithDrift();

    await expectOwnPresetKeepsDevice(drift);
  });

  it("skips a device in a rack that an earlier target replaced", async () => {
    // A Drift preset replaces the rack itself, taking the Drift inside it.
    // (A rack preset on the rack keeps the rack and its devices.)
    const { rack, drift } = await createRackWithDrift();
    const updated = parseToolResult<UpdateResult[]>(
      await call("ppal-update-device", {
        path: `${rack},${drift.path}`,
        preset: presetName(adv.name),
      }),
    );

    expect(updated[0]?.detail).toContain("replaced the device");
    expect(updated[1]).toStrictEqual({
      path: drift.path,
      ok: false,
      detail: expect.stringContaining("no longer exists"),
    });
  });

  it("swaps a Drum Rack for a pack's drum kit, by name", async ({ skip }) => {
    const kit = await packDrumKitOrSkip(ctx.client!, skip);
    const track = parseToolResult<{ path: string }>(
      await call("ppal-create-track", { type: "midi" }),
    );
    const rack = parseToolResult<{ id: string; path: string }>(
      await call("ppal-create-device", {
        deviceName: "Drum Rack",
        path: `t${trackIndexFromPath(track.path)}/d0`,
      }),
    );
    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        path: rack.path,
        preset: presetName(kit.name),
      }),
    );
    const device = await readDevice(ctx.client!, rack.path);

    expect(updated.path).toBe(rack.path);
    expect(device.id).toBe(updated.id);
    expect(device.type).toBe("drum-rack");
  });

  it("loads nothing for a preset of another kind", async () => {
    const drift = await createDrift();
    const result = await call("ppal-update-device", {
      path: drift.path,
      preset: `Audio Effects/${reverb.path}`,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "is an audio effect, and the device is an instrument",
    );
    expect((await readDevice(ctx.client!, drift.path)).id).toBe(drift.id);
  });

  it("loads a preset file ppal-library found", async ({ skip }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);
    const found = parseToolResult<{ items: Array<{ path: string }> }>(
      await call("ppal-library", {
        kind: "preset",
        query: presetName(adv.name),
      }),
    );
    const file = found.items.find(({ path }) => path.endsWith(adv.name));

    expect(file, `ppal-library found no ${adv.name}`).toBeDefined();

    const drift = await createDrift();

    await call("ppal-update-device", {
      path: drift.path,
      preset: file?.path,
    });

    expect((await readDevice(ctx.client!, drift.path)).name).toBe(
      presetName(adv.name),
    );
  });

  it("refuses a preset holding Producer Pal, and one undo brings the old device back", async () => {
    const drift = await createDrift();
    const track = drift.path.split("/")[0]!;
    const deviceIds = async (path: string): Promise<string[]> =>
      (
        parseToolResult<{ devices?: DeviceRead[] }>(
          await call("ppal-read-track", { path, include: ["devices"] }),
        ).devices ?? []
      ).map((device) => device.id);
    // A new track can come with this machine's default devices, so compare
    // against what it holds rather than assuming it's empty.
    const before = await deviceIds(track);
    const palIds = await deviceIds(`t${PPAL_TRACK}`);

    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        path: drift.path,
        preset: holdingPal!.path,
      }),
    );

    // Live swaps the preset in before anything can look inside it, so the
    // device is already gone: a normal entry, saying what landed.
    expect(updated).toStrictEqual({
      path: drift.path,
      detail:
        "preset not loaded: the preset contains the Producer Pal device, " +
        "which a Set can only have once; Live had already swapped it in, so " +
        "it was deleted and the slot is now empty; undoing this call brings " +
        "the old device back, and reverts the rest of the call too; already " +
        "changed: the device was replaced",
    });

    // Only the Drift is gone. The original Producer Pal is still there, and
    // still answering.
    expect(await deviceIds(track)).toStrictEqual(
      before.filter((id) => id !== drift.id),
    );
    expect(await deviceIds(`t${PPAL_TRACK}`)).toStrictEqual(palIds);

    await call("ppal-manage", { action: "undo" });

    expect(await readDevice(ctx.client!, drift.path)).toStrictEqual({
      id: drift.id,
      path: drift.path,
      type: "instrument: Drift",
    });
  });
});

interface UpdateResult {
  id: string;
  path: string;
  detail?: string;
}
