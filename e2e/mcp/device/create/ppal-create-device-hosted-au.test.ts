// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for an Audio Unit hosted in a Producer Pal wrapper. Uses Apple's
 * AUDelay, which every Mac has, as an audio effect. Skips when Live's "Use
 * Audio Units v2" setting is off, because then Live's browser doesn't list it.
 *
 * Opt-in: needs a build with hosting on (`ENABLE_HOSTED_PLUGINS=true npm run
 * build:debug`), the wrappers installed (`npm run install:plugin-host`), and
 * the remote script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: ENABLE_HOSTED_PLUGINS=true npm run e2e:mcp:remote-script -- device/create/ppal-create-device-hosted-au
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../mcp-test-helpers";
import {
  type HostedDevice,
  hostedPluginHelpers,
} from "../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

describe.skipIf(
  !REMOTE_SCRIPT_E2E || process.env.ENABLE_HOSTED_PLUGINS !== "true",
)("hosted Audio Units", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  const { call, hostOnNewTrack, readDevice, duplicateTrack } =
    hostedPluginHelpers(ctx);

  beforeEach(async ({ skip }) => {
    const { plugins } = await call<{ plugins: { name: string }[] }>(
      "ppal-library",
      { action: "list-plugins", query: "AUDelay", format: "AU" },
    );

    skip(
      !plugins.some((plugin) => plugin.name === "AUDelay"),
      "Live's browser doesn't list AUDelay: turn on Use Audio Units v2",
    );
  });

  it("reads an AU as the plug-in, with its own params", async () => {
    const { path } = await hostOnNewTrack("AUDelay");
    const device = await call<HostedDevice>("ppal-read-device", {
      path,
      include: ["params"],
    });

    expect(device).toStrictEqual(
      expect.objectContaining({
        path,
        type: "audio-effect: AUDelay",
        hosted: true,
      }),
    );
    expect(device.parameters?.length).toBeGreaterThan(0);
  });

  it("sets a param by its display text, and keeps it after a reload", async () => {
    const { track, path } = await hostOnNewTrack("AUDelay");
    // AUDelay shows its mix as a bare number, 50 by default
    const name = "Dry/Wet Mix";

    await call("ppal-update-device", { path, params: [{ name, value: "25" }] });

    const read = async (devicePath: string) =>
      (await readDevice(devicePath, name)).parameters?.find(
        (param) => param.name === name,
      )?.value;

    expect(await read(path)).toBe("25");

    const copy = await duplicateTrack(track);

    expect(await read(`${copy}/${path.split("/").at(-1)}`)).toBe("25");
  });
});
