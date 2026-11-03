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
  readDeviceCount,
  setupMcpTestContext,
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
  vibraphoneFilesOrSkip,
  wastedSpaceTransmissionOrSkip,
} from "../helpers/remote-script-test-helpers";
import {
  LIBRARY_NEEDS,
  skipTestBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers.ts";

// The Core Library's "Beard Kit" is an Instrument Rack holding a Drum Rack.
// Live's browser doesn't list it under Instrument Rack, but a model may type
// this path since the file is an Instrument Rack.
const BEARD_KIT_AS_INSTRUMENT_RACK =
  "Instruments/Instrument Rack/Sampled/Beard Kit.adg";

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

  /**
   * Call create-device on a fresh track and read what it made.
   * @param args - Its args, less the path
   * @returns The new device
   */
  async function createdOnNewTrack(
    args: Record<string, unknown>,
  ): Promise<DeviceRead> {
    const track = await createMidiTrack(ctx.client!);
    const created = parseToolResult<{ path: string }>(
      await create({ ...args, path: `t${track}/d+` }),
    );

    return await readDevice(ctx.client!, created.path);
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
    const library = parseToolResult<{ items: { path: string }[] }>(
      await callToolAndSettle(ctx.client!, "ppal-library", {
        kind: "preset",
        query: presetName(adv.name),
      }),
    );
    // Search items carry no `name`: it is the path's last segment.
    const file = library.items.find(({ path }) =>
      path.endsWith(`/${adv.name}`),
    )?.path;

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

  // A browser path gets the same check as the bare name.
  for (const deviceName of ["Operator", "Instruments/Operator"]) {
    it(`refuses a preset file that isn't the named device's, named "${deviceName}"`, async ({
      skip,
    }) => {
      const result = await create({
        deviceName,
        preset: await driftPresetFile(skip),
        path: "t0/d+",
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        "is not a preset for Operator",
      );
    });
  }

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

    const found = parseToolResult<{ items?: Array<{ path: string }> }>(
      await callToolAndSettle(ctx.client!, "ppal-library", {
        kind: "preset",
        query: "Add Oxide",
        source: "pack",
      }),
    ).items;

    if (found?.some(({ path }) => path.endsWith("/Add Oxide.adv")) !== true) {
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

  // The Core Library's one "Dunkel Pad" rack is listed under Drift and under
  // Instrument Rack.
  it("loads a rack the browser lists under several devices", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    const device = await createdOnNewTrack({ preset: "Dunkel Pad" });

    expect(device.type).toBe("instrument-rack");
    expect(device.name).toBe("Dunkel Pad");
  });

  // The Core Library's one "Beard Kit" is an Instrument Rack holding a Drum
  // Rack, which the browser doesn't list under Drum Rack. It counts as a Drum
  // Rack preset, and Live loads it as the Instrument Rack.
  it("loads a drum kit saved as an Instrument Rack, with deviceName Drum Rack", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    const device = await createdOnNewTrack({
      deviceName: "Drum Rack",
      preset: "Beard Kit",
    });

    expect(device.type).toBe("instrument-rack");
    expect(device.name).toBe("Beard Kit");
  });

  // Live's browser lists a rack under every device it is built around, so the
  // refusal names the library's files instead of browser paths.
  it("refuses a name several files share, listing their file paths", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    const track = await createMidiTrack(ctx.client!);
    const result = await create({
      preset: "Flutter Pad",
      path: `t${track}/d+`,
    });
    const message = getToolErrorMessage(result);
    const listed = [...message.matchAll(/"((?:\/|[A-Za-z]:[\\/])[^"]+)"/g)].map(
      (match) => match[1] as string,
    );
    const advFile = listed.find((path) =>
      path
        .replaceAll("\\", "/")
        .endsWith("Devices/Instruments/Drift/Pad/Flutter Pad.adv"),
    );
    const adgFile = listed.find((path) =>
      path
        .replaceAll("\\", "/")
        .endsWith("Racks/Instrument Racks/Pad/Flutter Pad.adg"),
    );

    expect(isToolError(result)).toBe(true);
    expect(message).toContain('preset "Flutter Pad" matches');
    expect(advFile).toBeDefined();
    expect(adgFile).toBeDefined();

    // Each listed path loads that file.
    for (const [file, type] of [
      [advFile, "instrument: Drift"],
      [adgFile, "instrument-rack"],
    ] as const) {
      const fresh = await createMidiTrack(ctx.client!);
      const created = parseToolResult<{ path: string }>(
        await create({ preset: file, path: `t${fresh}/d+` }),
      );

      expect((await readDevice(ctx.client!, created.path)).type).toBe(type);
    }
  });

  it("lists both files of a name the browser files under one path", async ({
    skip,
  }) => {
    const { core, pack } = await vibraphoneFilesOrSkip(ctx.client!, skip);
    const track = await createMidiTrack(ctx.client!);
    const result = await create({
      preset: "Vibraphone",
      path: `t${track}/d+`,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(`"${core}"`);
    expect(getToolErrorMessage(result)).toContain(`"${pack}"`);

    // The two racks differ in their first chain.
    for (const [file, chain] of [
      [core, "Vibraphone"],
      [pack, "Pedal Down"],
    ] as const) {
      const fresh = await createMidiTrack(ctx.client!);
      const created = parseToolResult<{ path: string }>(
        await create({ preset: file, path: `t${fresh}/d+` }),
      );
      const rack = parseToolResult<{ chains?: Array<{ name?: string }> }>(
        await callToolAndSettle(ctx.client!, "ppal-read-device", {
          path: created.path,
          include: ["chains"],
          maxDepth: 1,
        }),
      );

      expect(rack.chains?.[0]?.name).toBe(chain);
    }
  });

  /**
   * Call create-device on a fresh track, expecting a refusal that loads
   * nothing.
   * @param args - Its args, less the path
   * @returns The refusal's message
   */
  async function refusedWithNothingLoaded(
    args: Record<string, unknown>,
  ): Promise<string> {
    const track = await createMidiTrack(ctx.client!);
    const before = await readDeviceCount(ctx.client!, track);
    const result = await create({ ...args, path: `t${track}/d+` });

    expect(isToolError(result)).toBe(true);
    expect(await readDeviceCount(ctx.client!, track)).toBe(before);

    return getToolErrorMessage(result);
  }

  /**
   * Skip unless a pack's Vibraphone rack shares the Core Library's browser
   * path. The browser files a rack under its folder's name, so only a rack in
   * a Mallets folder does.
   * @param skip - The test's `skip`
   */
  async function sharedVibraphonePathOrSkip(
    skip: (note?: string) => never,
  ): Promise<void> {
    const { pack } = await vibraphoneFilesOrSkip(ctx.client!, skip);

    if (!pack.replaceAll("\\", "/").endsWith("/Mallets/Vibraphone.adg")) {
      skip("the pack's Vibraphone rack isn't in a Mallets folder");
    }
  }

  it("refuses a browser path two racks share, loading neither", async ({
    skip,
  }) => {
    await sharedVibraphonePathOrSkip(skip);

    expect(
      await refusedWithNothingLoaded({
        preset: "Instruments/Instrument Rack/Mallets/Vibraphone.adg",
      }),
    ).toContain(
      "items at that browser path; pass a file's absolute path from ppal-library as preset",
    );
  });

  // The path is for another device than Drift, so that is the one answer; it
  // isn't first refused for the two racks sharing it.
  it("refuses a shared browser path as not the named device's, in one step", async ({
    skip,
  }) => {
    await sharedVibraphonePathOrSkip(skip);

    const message = await refusedWithNothingLoaded({
      deviceName: "Drift",
      preset: "Instruments/Instrument Rack/Mallets/Vibraphone.adg",
    });

    expect(message).toContain("is not a preset for Drift");
    expect(message).not.toContain("browser path;");
  });

  // The browser files the Core Library's "Beard Kit" under Instrument Rack, but
  // it holds a Drum Rack, so it is a Drum Rack preset: judged by its file.
  it("loads a drum kit given as a browser path, with deviceName Drum Rack", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    const device = await createdOnNewTrack({
      deviceName: "Drum Rack",
      preset: BEARD_KIT_AS_INSTRUMENT_RACK,
    });

    expect(device.type).toBe("instrument-rack");
    expect(device.name).toBe("Beard Kit");
  });

  it("refuses that drum kit's browser path for another device", async ({
    skip,
  }) => {
    await skipTestBeforeLive(ctx.client!, skip, "12.4", LIBRARY_NEEDS);

    expect(
      await refusedWithNothingLoaded({
        deviceName: "Drift",
        preset: BEARD_KIT_AS_INSTRUMENT_RACK,
      }),
    ).toContain("is not a preset for Drift");
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
