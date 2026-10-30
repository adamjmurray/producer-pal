// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for VST3 plug-ins hosted in a Producer Pal wrapper. Uses Serum 2
 * (one VST3 file holding the "Serum 2" instrument and the "Serum 2 FX" effect),
 * so it skips on a machine without it.
 *
 * Opt-in: needs a build with hosting on (`ENABLE_HOSTED_PLUGINS=true npm run
 * build:debug`), the wrappers installed (`npm run install:plugin-host`), and
 * the remote script.
 *
 * Duplicating a track stands in for a Set reload: the copy's wrapper starts
 * fresh, with only what Live saved for it.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: ENABLE_HOSTED_PLUGINS=true npm run e2e:mcp:remote-script -- device/create/ppal-create-device-hosted
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

const SERUM_FILE = "Serum2.vst3";
const HAS_SERUM = [
  "/Library/Audio/Plug-Ins/VST3",
  join(homedir(), "Library/Audio/Plug-Ins/VST3"),
].some((folder) => existsSync(join(folder, SERUM_FILE)));

// A duplicated wrapper restores its plug-in a moment after it appears.
const RESTORE_MS = 3000;

interface HostedDevice {
  id: string;
  path: string;
  type: string;
  hosted?: boolean;
  name?: string;
  parameters?: { id: string; name: string; value?: string }[];
}

describe.skipIf(
  !REMOTE_SCRIPT_E2E ||
    process.env.ENABLE_HOSTED_PLUGINS !== "true" ||
    !HAS_SERUM,
)("hosted plug-ins", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  /**
   * Call a tool and parse its result.
   * @param name - Tool name
   * @param args - Tool args
   * @returns The parsed result
   */
  async function call<T>(name: string, args: Record<string, unknown>) {
    return parseToolResult<T>(
      await ctx.client!.callTool({ name, arguments: args }),
    );
  }

  /**
   * Host a plug-in at the end of a new MIDI track.
   * @param deviceName - The plug-in's name in Live's browser
   * @param extra - More create-device args
   * @returns The track index and the device's path
   */
  async function hostOnNewTrack(
    deviceName: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ track: number; path: string }> {
    const track = await createMidiTrack(ctx.client!);
    const created = await call<{ path: string }>("ppal-create-device", {
      deviceName,
      hosted: true,
      path: `t${track}/d+`,
      ...extra,
    });

    return { track, path: created.path };
  }

  /**
   * Read a device's params whose names match.
   * @param path - The device's path
   * @param paramSearch - Name filter
   * @returns The device
   */
  function readDevice(path: string, paramSearch?: string) {
    return call<HostedDevice>("ppal-read-device", {
      path,
      ...(paramSearch && { include: ["param-values"], paramSearch }),
    });
  }

  /**
   * Duplicate a track and wait for its wrappers to restore their plug-ins.
   * @param track - Track index
   * @returns The copy's path
   */
  async function duplicateTrack(track: number): Promise<string> {
    const copy = await call<{ path: string }>("ppal-duplicate", {
      type: "track",
      path: `t${track}`,
    });

    await sleep(RESTORE_MS);

    return copy.path;
  }

  it("reads an instrument as the plug-in, with its own params", async () => {
    const { path } = await hostOnNewTrack("Serum 2");
    const device = await readDevice(path, "Main Vol");

    expect(device).toStrictEqual({
      id: expect.any(String),
      path,
      type: "instrument: Serum 2",
      hosted: true,
      parameters: expect.arrayContaining([
        { id: "h1", name: "Main Vol", value: expect.any(String) },
      ]),
    });
  });

  it("sets a param by its display text", async () => {
    const { path } = await hostOnNewTrack("Serum 2");

    await call("ppal-update-device", {
      path,
      params: [{ name: "Main Vol", value: "25%" }],
    });

    const [param] = (await readDevice(path, "Main Vol")).parameters ?? [];

    expect(param?.value).toMatch(/^25%/);
  });

  it("keeps the plug-in's name under a custom name after a reload", async () => {
    const { track } = await hostOnNewTrack("Serum 2 FX", { name: "My FX" });
    const copy = await duplicateTrack(track);
    const devices =
      (
        await call<{ devices?: HostedDevice[] }>("ppal-read-track", {
          path: copy,
          include: ["devices"],
        })
      ).devices ?? [];

    expect(devices.at(-1)).toStrictEqual({
      id: expect.any(String),
      path: expect.any(String),
      type: "audio-effect: Serum 2 FX",
      hosted: true,
      name: "My FX",
    });
  });

  it("keeps the plug-in's settings after a reload", async () => {
    const { track, path } = await hostOnNewTrack("Serum 2");

    await call("ppal-update-device", {
      path,
      params: [{ name: "Main Vol", value: "25%" }],
    });

    const copy = await duplicateTrack(track);
    const devicePath = `${copy}/${path.split("/").at(-1)}`;
    const [param] = (await readDevice(devicePath, "Main Vol")).parameters ?? [];

    expect(param?.value).toMatch(/^25%/);
  });
});
