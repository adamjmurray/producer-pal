// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-device's `preset`, loaded through the Producer Pal
 * remote script. Opt-in like the other browser tests. Presets are picked from
 * Drift's own list at run time, since editions ship different ones.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/create/ppal-create-device-preset
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers";
import {
  type Preset,
  REMOTE_SCRIPT_E2E,
  listPresets,
  presetEndingIn,
  presetName,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-create-device — presets", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  let adv: Preset;
  let adg: Preset;

  beforeAll(async () => {
    const presets = await listPresets("instrument", "Drift");

    adv = presetEndingIn(presets, ".adv");
    adg = presetEndingIn(presets, ".adg");
  });

  /**
   * Call create-device.
   * @param args - Its args
   * @returns The raw result
   */
  async function create(args: Record<string, unknown>): Promise<unknown> {
    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: args,
    });

    await sleep(100);

    return result;
  }

  /**
   * A fresh MIDI track, so the Set's own tracks stay intact.
   * @returns The new track's index
   */
  async function createTrack(): Promise<number> {
    const track = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "midi" },
      }),
    );

    return trackIndexFromPath(track.path);
  }

  /**
   * Read a device.
   * @param path - Its path
   * @returns Its id, type and name
   */
  async function readDevice(path: string): Promise<DeviceRead> {
    return parseToolResult<DeviceRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path },
      }),
    );
  }

  it("creates a device from one of its presets, by name", async () => {
    const track = await createTrack();
    const created = parseToolResult<{ id: string; path: string }>(
      await create({
        device: "Drift",
        preset: presetName(adv.name),
        path: `t${track}/d0`,
      }),
    );
    const device = await readDevice(created.path);

    expect(device.id).toBe(created.id);
    expect(device.type).toBe("instrument: Drift");
    expect(device.name).toBe(presetName(adv.name));
  });

  it("creates a rack from a rack preset, by browser path", async () => {
    const track = await createTrack();
    const created = parseToolResult<{ path: string }>(
      await create({ preset: `Instruments/${adg.path}`, path: `t${track}/d0` }),
    );

    expect((await readDevice(created.path)).type).toBe("instrument-rack");
  });

  it("refuses a preset that isn't the named device's", async () => {
    const result = await create({
      device: "Operator",
      preset: presetName(adv.name),
      path: "t0/d+",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("for Operator");
  });

  it("refuses a name no preset has", async () => {
    const result = await create({
      preset: "NoSuchPreset12345",
      path: "t0/d+",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'no preset "NoSuchPreset12345"',
    );
  });
});

interface DeviceRead {
  id: string;
  type: string;
  name?: string;
}
