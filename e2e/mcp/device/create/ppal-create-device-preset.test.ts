// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-create-device's `preset`, loaded through the Producer Pal
 * remote script. Opt-in like the other browser tests. Presets are picked from
 * Drift's own list at run time, since editions ship different ones.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
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
  packDrumKitOrSkip,
  listPresets,
  presetEndingIn,
  presetName,
  readDevice,
  requireRemoteScript,
  wastedSpaceTransmissionOrSkip,
} from "../helpers/remote-script-test-helpers";
import {
  LIBRARY_NEEDS,
  skipTestBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers.ts";

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
        deviceName: "Drift",
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

  /**
   * The absolute path of the Drift .adv preset, from ppal-library.
   * @param skip - The test's `skip`, called on a Live without the library
   * @returns The file path
   */
  async function driftPresetFile(
    skip: (note?: string) => never,
  ): Promise<string> {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);
    const library = parseToolResult<{
      items: { name: string; path: string }[];
    }>(
      await callToolAndSettle(ctx.client!, "ppal-library", {
        kind: "preset",
        query: presetName(adv.name),
      }),
    );
    const file = library.items.find((item) => item.name === adv.name)?.path;

    expect(file).toBeDefined();

    return file as string;
  }

  it("creates a device from a preset's file path", async ({ skip }) => {
    // A Core Library file: the remote script finds it under the "Core Library"
    // pack, which it can only match by name.
    const file = await driftPresetFile(skip);
    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ path: string }>(
      await create({ preset: file, path: `t${track}/d0` }),
    );

    expect((await readDevice(ctx.client!, created.path)).name).toBe(
      presetName(adv.name),
    );
  });

  it("refuses a preset file that isn't the named device's", async ({
    skip,
  }) => {
    const result = await create({
      deviceName: "Operator",
      preset: await driftPresetFile(skip),
      path: "t0/d+",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "is not a preset for Operator",
    );
  });

  for (const [label, device] of [
    ["which no device lists", undefined],
    ["and device Drum Rack", "Drum Rack"],
  ] as const) {
    it(`creates a pack's drum kit from its name, ${label}`, async ({
      skip,
    }) => {
      const kit = await packDrumKitOrSkip(ctx.client!, skip);
      const track = await createMidiTrack(ctx.client!);
      const created = parseToolResult<{ path: string }>(
        await create({
          ...(device == null ? {} : { deviceName: device }),
          preset: presetName(kit.name),
          path: `t${track}/d0`,
        }),
      );

      expect((await readDevice(ctx.client!, created.path)).type).toBe(
        "drum-rack",
      );
    });
  }

  // Live's browser lists none of a pack Max device's presets under the device,
  // so a name is found in the library database by the device's own entry.
  it("creates a pack Max device's preset from its name, with deviceName", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    const found = parseToolResult<{ items?: Array<{ name: string }> }>(
      await callToolAndSettle(ctx.client!, "ppal-library", {
        kind: "preset",
        query: "Add Oxide",
        source: "pack",
      }),
    ).items;

    if (found?.some(({ name }) => name === "Add Oxide.adv") !== true) {
      skip("the Tape by Softube pack isn't installed");
    }

    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ path: string }>(
      await create({
        deviceName: "Tape",
        preset: "Add Oxide",
        path: `t${track}/d+`,
      }),
    );

    expect((await readDevice(ctx.client!, created.path)).name).toBe(
      "Add Oxide",
    );
  });

  // Shifter's browser presets include a "Transmission"; the Wasted Space pack
  // files another that the browser doesn't list.
  it("refuses a name filed under a device and elsewhere, without deviceName", async ({
    skip,
  }) => {
    const packFile = await wastedSpaceTransmissionOrSkip(ctx.client!, skip);
    const track = await createMidiTrack(ctx.client!);
    const result = await create({
      preset: "Transmission",
      path: `t${track}/d+`,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'preset "Transmission" matches',
    );
    expect(getToolErrorMessage(result)).toContain(packFile);
    expect(getToolErrorMessage(result)).toContain("Shifter/Transmission.adv");
  });

  it("loads the named device's own preset when another device files the name too", async ({
    skip,
  }) => {
    await wastedSpaceTransmissionOrSkip(ctx.client!, skip);

    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ path: string }>(
      await create({
        deviceName: "Shifter",
        preset: "Transmission",
        path: `t${track}/d+`,
      }),
    );

    expect((await readDevice(ctx.client!, created.path)).name).toBe(
      "Transmission",
    );
  });

  // An audio effect always lands last, so appending one moves no sibling and a
  // later entry may still name a device by index.
  it("appends an audio effect's preset before an indexed entry", async () => {
    const reverb = presetEndingIn(
      await listPresets("audio-effect", "Reverb"),
      ".adv",
    );
    const track = await createMidiTrack(ctx.client!);

    await create({ deviceName: "Reverb", path: `t${track}/d+` });
    const result = await create({
      deviceName: "Reverb",
      preset: presetName(reverb.name),
      path: `t${track}/d+,t${track}/d1`,
    });

    expect(isToolError(result)).toBe(false);
    expect(parseToolResult<unknown[]>(result)).toHaveLength(2);
  });

  it("refuses a preset that isn't the named device's", async () => {
    const result = await create({
      deviceName: "Operator",
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
