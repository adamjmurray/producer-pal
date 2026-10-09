// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-update-device's `preset`, swapped onto a device through
 * the Producer Pal remote script. Opt-in like the other browser tests. Presets
 * are picked from Drift's and Reverb's own lists at run time.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/update/ppal-update-device-preset
 */
import { beforeAll, describe, expect, it } from "vitest";
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
  type Preset,
  REMOTE_SCRIPT_E2E,
  packDrumKitOrSkip,
  listPresets,
  presetEndingIn,
  presetName,
  readDevice,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-update-device — presets", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  let adv: Preset;
  let adg: Preset;
  let reverb: Preset;

  beforeAll(async () => {
    const drift = await listPresets("instrument", "Drift");

    adv = presetEndingIn(drift, ".adv");
    adg = presetEndingIn(drift, ".adg");
    reverb = presetEndingIn(
      await listPresets("audio-effect", "Reverb"),
      ".adv",
    );
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
        device: "Drift",
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
        device: "Drift",
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
        device: "Drum Rack",
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

  it("loads a preset file ppal-library found", async () => {
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
});

interface UpdateResult {
  id: string;
  path: string;
  detail?: string;
}
