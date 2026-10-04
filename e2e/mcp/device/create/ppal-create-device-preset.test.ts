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
  callToolAndSettle,
  createMidiTrack,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import {
  type Preset,
  REMOTE_SCRIPT_E2E,
  listPresets,
  presetEndingIn,
  presetName,
  readDevice,
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
    return callToolAndSettle(ctx.client!, "ppal-create-device", args);
  }

  it("creates a device from one of its presets, by name", async () => {
    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ id: string; path: string }>(
      await create({
        device: "Drift",
        preset: presetName(adv.name),
        path: `t${track}/d0`,
      }),
    );
    const device = await readDevice(ctx.client!, created.path);

    expect(device.id).toBe(created.id);
    expect(device.type).toBe("instrument: Drift");
    expect(device.name).toBe(presetName(adv.name));
  });

  it("creates a rack from a rack preset, by browser path", async () => {
    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ path: string }>(
      await create({ preset: `Instruments/${adg.path}`, path: `t${track}/d0` }),
    );

    expect((await readDevice(ctx.client!, created.path)).type).toBe(
      "instrument-rack",
    );
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
