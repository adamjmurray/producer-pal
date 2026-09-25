// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
    const result = await ctx.client!.callTool({ name, arguments: args });

    await sleep(100);

    return result;
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
   * Read a device.
   * @param path - Its path
   * @returns Its id, type and name
   */
  async function readDevice(path: string): Promise<DeviceRead> {
    return parseToolResult<DeviceRead>(
      await call("ppal-read-device", { path }),
    );
  }

  it("keeps the device for one of its own presets", async () => {
    const drift = await createDrift();
    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        path: drift.path,
        preset: presetName(adv.name),
      }),
    );

    expect(updated).toStrictEqual({ id: drift.id, path: drift.path });
    expect((await readDevice(drift.path)).name).toBe(presetName(adv.name));
  });

  it("puts a new device in place for a rack preset, and says so", async () => {
    const drift = await createDrift();
    const updated = parseToolResult<UpdateResult>(
      await call("ppal-update-device", {
        id: drift.id,
        preset: `Instruments/${adg.path}`,
      }),
    );
    const device = await readDevice(drift.path);

    expect(updated.id).not.toBe(drift.id);
    expect(updated.detail).toContain("replaced the device");
    expect(device.id).toBe(updated.id);
    expect(device.type).toBe("instrument-rack");
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
    expect((await readDevice(drift.path)).id).toBe(drift.id);
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

    expect((await readDevice(drift.path)).name).toBe(presetName(adv.name));
  });
});

interface UpdateResult {
  id: string;
  path: string;
  detail?: string;
}

interface DeviceRead {
  id: string;
  type: string;
  name?: string;
}
