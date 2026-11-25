// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a VST2 hosted in a Producer Pal wrapper. Uses Madrona Labs'
 * Aalto, and skips when Live's browser doesn't list its VST2.
 *
 * Needs the wrappers installed (`npm run install:plugin-host`) and the remote
 * script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/device/create/hosted/ppal-create-device-hosted-vst2.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../../mcp-test-helpers";
import {
  type HostedDevice,
  hostedPluginHelpers,
} from "../../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../helpers/remote-script-test-helpers";

// The path's format folder picks the VST2 over the plug-in's other formats
const VST2_PATH = "Plug-Ins/VST/Aalto";

describe.skipIf(!REMOTE_SCRIPT_E2E)("hosted VST2", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  const { call, hostOnNewTrack, readDevice, duplicateTrack } =
    hostedPluginHelpers(ctx);

  beforeEach(async ({ skip }) => {
    const { plugins } = await call<{
      plugins: { name: string; format: string }[];
    }>("ppal-library", { action: "list-plugins", query: "Aalto" });

    skip(
      !plugins.some(
        (plugin) => plugin.name === "Aalto" && plugin.format === "VST",
      ),
      "Live's browser doesn't list the Aalto VST2",
    );
  });

  it("reads a VST2 as the plug-in, with its own params", async () => {
    const { path, hosted, paramCount } = await hostOnNewTrack(VST2_PATH);
    const device = await call<HostedDevice>("ppal-read-device", { path });

    expect(hosted).toBe(true);
    expect(paramCount).toBeGreaterThan(0);
    expect(device).toStrictEqual(
      expect.objectContaining({
        path,
        type: "instrument: Aalto",
        hosted: true,
      }),
    );
  });

  it("sets a param, and keeps it after a reload", async () => {
    const { track, path } = await hostOnNewTrack(VST2_PATH);
    // Aalto shows its voice count as a number, 4 by default
    const name = "key_voices";

    await call("ppal-update-device", { path, params: [{ name, value: "2" }] });

    const read = async (devicePath: string) =>
      (await readDevice(devicePath, name)).parameters?.find(
        (param) => param.name === name,
      )?.value;

    expect(await read(path)).toBe("2.00");

    const copy = await duplicateTrack(track);

    expect(await read(`${copy}/${path.split("/").at(-1)}`)).toBe("2.00");
  });
});
