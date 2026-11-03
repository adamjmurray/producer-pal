// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a plug-in host wrapper with no plug-in in it (dragged in bare).
 * It reads as having no plug-in loaded, and its `params` and clip envelope
 * lines fail with that reason.
 * Needs no plug-in, only the wrappers installed (`npm run install:plugin-host`)
 * and the remote script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp:remote-script -- device/create/ppal-create-device-hosted-bare
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  getToolErrorMessage,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import {
  type HostedDevice,
  hostedPluginHelpers,
} from "../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

const NO_PLUGIN = "no plug-in loaded";

describe.skipIf(!REMOTE_SCRIPT_E2E)("bare plug-in host wrapper", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();
  const { call } = hostedPluginHelpers(ctx);

  /**
   * Insert the instrument wrapper, without a plug-in, on a new MIDI track.
   * @returns The wrapper's path
   */
  async function bareWrapper(): Promise<string> {
    const track = await createMidiTrack(ctx.client!);
    const created = await call<{ path: string }>("ppal-create-device", {
      deviceName: "PPal Plug-in Instrument",
      path: `t${track}/d+`,
    });

    return created.path;
  }

  it("reads as having no plug-in loaded, with no params", async () => {
    const path = await bareWrapper();

    // The wrapper answers a moment after it loads.
    await expect
      .poll(
        async () =>
          await call<HostedDevice>("ppal-read-device", {
            path,
            include: ["params"],
          }),
        { timeout: 10_000 },
      )
      .toStrictEqual({
        id: expect.any(String),
        path,
        type: expect.stringMatching(/^instrument: /),
        hosted: true,
        detail: NO_PLUGIN,
      });
  });

  it("fails a params write with that reason", async () => {
    const path = await bareWrapper();

    await expect
      .poll(
        async () =>
          (
            await call<HostedDevice & { detail?: string }>("ppal-read-device", {
              path,
            })
          ).detail,
        { timeout: 10_000 },
      )
      .toBe(NO_PLUGIN);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, params: [{ name: "Mix", value: "50" }] },
    });

    expect(getToolErrorMessage(result)).toContain(`"Mix": ${NO_PLUGIN}`);
  });

  it("skips a clip envelope line with that reason", async () => {
    const path = await bareWrapper();
    const track = path.split("/")[0] as string;

    await expect
      .poll(
        async () =>
          (await call<HostedDevice>("ppal-read-device", { path })).detail,
        { timeout: 10_000 },
      )
      .toBe(NO_PLUGIN);

    const clip = await call<{ id: string }>("ppal-create-clip", {
      path: `${track}/s0`,
      notes: "C3 1|1",
      length: "1bar",
    });

    const write = async (): Promise<string> => {
      const result = await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: clip.id, envelopes: `${path}/h1: 1|1 0.2` },
      });

      return (result.content as { text: string }[])[0]?.text ?? "";
    };

    // The wrapper's slots answer 1.5 s after it loads; until then a line says
    // the device is still loading.
    await expect
      .poll(write, { timeout: 10_000 })
      .not.toContain("still loading");

    const text = await write();

    expect(text).toContain(`${path}/h1`);
    expect(text).toContain(NO_PLUGIN);
    expect(text).not.toContain("couldn't map");
  });
});
